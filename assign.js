// ============================================================
//  군 무작위 배정 — 사료 전환일에 케이지 단위로 (계획서 11절)
//  반입 때는 전원 G0(미배정). 전환일에 배치 × 결찰 요일(월·화)로 층을 나누고, 층마다 정해 둔
//  군 자리(코호트 14: 각 군 월 6 · 화 6 케이지)에 어느 케이지가 들어갈지를 추첨한다.
//  왜 케이지 단위인가 — 물통을 나눠 마시므로 투약은 케이지 단위다. 한 케이지에 두 군을 둘 수 없다.
//  왜 전환일인가 — 그 전까지 세 군의 처치가 같아서 그때 정해도 되고, 수술 때 군을 모르니
//  수술 요일·손실이 군과 얽히지 않는다 (이전 번호 배정은 대조군이 전부 월요일 결찰이었다).
//
//  개체 ID에 군이 박혀 있어(C1401G0 → C1401G2) 배정은 곧 ID 변경이다. 옮겨야 하는 기록:
//  rats · measurements · dailyLogs · doseLogs · ratHousing(ratId·group) · cageFeeding.ratIds.
//  개체 상세의 군 변경(input.js changeRatGroup)은 cageFeeding.ratIds를 안 옮겨서 전환 전 섭취·
//  BAPN 노출이 개체와 끊긴다 — 여기서는 옮긴다. 쓰기는 묶음(batch)으로 하고, 끝난 뒤 옛 ID가
//  남았는지 다시 조회해 정리한다(중간에 끊겨도 「다시 적용」으로 이어진다).
//  배정 결과는 groupAssignments 컬렉션(신설)에 날짜·케이지·군·바뀐 ID로 남긴다.
// ============================================================

// 코호트 14 층별 군 자리 — 배치마다 6/4/2마리 회전, 6배치 합치면 각 군 월 6 · 화 6 케이지.
// 코호트 설정 assignSlots[배치] = { mon:[...], tue:[...] } 가 있으면 그것을 쓴다.
const RA_DEFAULT_SLOTS = {
    1: { mon: ['G2', 'G2', 'G1'], tue: ['G2', 'G1', 'G3'] },
    2: { mon: ['G3', 'G3', 'G2'], tue: ['G3', 'G2', 'G1'] },
    3: { mon: ['G1', 'G1', 'G3'], tue: ['G1', 'G3', 'G2'] },
    4: { mon: ['G2', 'G3', 'G1'], tue: ['G2', 'G2', 'G3'] },
    5: { mon: ['G3', 'G1', 'G2'], tue: ['G3', 'G3', 'G1'] },
    6: { mon: ['G1', 'G2', 'G3'], tue: ['G1', 'G1', 'G2'] }
};
const RA_SWITCH_OFFSET = 21;   // 결찰(월요일) + 21일 = 배정일. 배치 전체를 이날 배정하고, 화 결찰 케이지는 다음 날(자기 결찰 +21) 전환 (2026-10-20)
const RA_BATCH_OPS = 400;      // Firestore 묶음 쓰기 한도(500) 아래로

let raState = null;   // { cohort, batch, rats, housing, cageNo, cfg, strata, slots, plan, record, busy }
const raEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const raGroupNo = r => { const m = String(r.ratId || '').match(/G(\d+)$/); return m ? Number(m[1]) : (Number(String(r.group || '').replace(/^G/, '')) || 0); };
const raWithGroup = (ratId, g) => /G\d+$/.test(ratId) ? ratId.replace(/G\d+$/, g) : ratId + g;

// 사건 기록(events.js)이 코호트 데이터를 다 읽어 둔 뒤 부른다
function raMount() {
    const box = document.getElementById('ra-box');
    if (!box) return;
    if (!box.raBound) { box.addEventListener('click', raOnClick); box.raBound = true; }
    raState = { cohort: evCohort, rats: evRats, housing: evHousing, cageNo: evCageNo, cfg: evCfg || {}, batch: null, plan: null, record: null, busy: false };
    const batches = raBatches();
    const today = getTodayStr();
    // 기본 배치: 전환일이 오늘이거나 가장 최근에 지난 미배정 배치
    const cand = batches.filter(b => b.switchDay && b.switchDay <= today && b.unassigned).sort((a, b) => b.switchDay.localeCompare(a.switchDay));
    raState.batch = (cand[0] || batches.find(b => b.unassigned) || batches[0] || {}).no || null;
    raRender();
}

function raOnClick(e) {
    const el = e.target.closest('[data-ra]');
    if (!el) return;
    switch (el.dataset.ra) {
        case 'batch': raState.batch = Number(el.dataset.no); raState.plan = null; raRender(); break;
        case 'draw':  raDraw(); break;
        case 'apply': raApply(); break;
        case 'resume': raResume(); break;
        case 'reset': raResetToG0(); break;
        case 'redraw': raState.plan = null; raRender(); break;
    }
}

// ---------- 배치 · 층 ----------
function raBatches() {
    const { rats, cfg } = raState;
    const size = Number((cfg.housing || {}).batchSize) || 12;
    const by = {};
    rats.forEach(r => { const b = getBatchNo(r, size); if (b) (by[b] = by[b] || []).push(r); });
    return Object.keys(by).map(Number).sort((a, b) => a - b).map(no => {
        const list = by[no];
        const mons = list.map(r => doseDateOf(r.surgeryDate)).filter(d => d && new Date(d + 'T00:00:00').getDay() === 1).sort();
        const alive = list.filter(r => r.status !== '사망');
        return { no, n: list.length, alive: alive.length,
                 switchDay: mons.length ? doseShift(mons[0], RA_SWITCH_OFFSET) : null,
                 unassigned: alive.some(r => raGroupNo(r) === 0),
                 assigned: alive.filter(r => raGroupNo(r) > 0).length };
    });
}

// 이 배치의 케이지를 결찰 요일로 나눈다. 케이지 = 열린 재실의 개체 묶음.
function raStrata(batchNo) {
    const { rats, housing, cageNo, cfg } = raState;
    const size = Number((cfg.housing || {}).batchSize) || 12;
    const cages = {};
    rats.forEach(r => {
        if (getBatchNo(r, size) !== batchNo || r.status === '사망') return;
        const cid = housing[r.ratId];
        if (!cid) { (cages['__none'] = cages['__none'] || []).push(r); return; }
        (cages[cid] = cages[cid] || []).push(r);
    });
    const out = { mon: [], tue: [], other: [], none: cages['__none'] || [] };
    Object.entries(cages).forEach(([cid, occ]) => {
        if (cid === '__none') return;
        const dows = [...new Set(occ.map(r => { const d = doseDateOf(r.surgeryDate); return d ? new Date(d + 'T00:00:00').getDay() : null; }))];
        const key = dows.length === 1 && dows[0] === 1 ? 'mon' : dows.length === 1 && dows[0] === 2 ? 'tue' : 'other';
        const groups = [...new Set(occ.map(raGroupNo))];
        out[key].push({ cageId: cid, number: cageNo[cid] ?? cid, occ: occ.sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0)),
                        dow: dows, groups, g0: groups.length === 1 && groups[0] === 0, assignedGroup: groups.length === 1 && groups[0] > 0 ? 'G' + groups[0] : null });
    });
    ['mon', 'tue', 'other'].forEach(k => out[k].sort((a, b) => Number(a.number) - Number(b.number)));
    return out;
}

function raSlotsFor(batchNo) {
    const cfgSlots = (raState.cfg.assignSlots || {})[batchNo];
    const s = cfgSlots || RA_DEFAULT_SLOTS[batchNo];
    return s ? { mon: s.mon.slice(), tue: s.tue.slice() } : null;
}

// ---------- 추첨 ----------
// crypto 난수로 Fisher–Yates. 자리도 섞는다 — 케이지가 자리보다 적으면(사망으로 빈 케이지) 어느 자리가
// 빠지는지도 무작위여야 특정 군이 늘 빠지는 치우침이 없다.
function raShuffle(arr) {
    const a = arr.slice(); const buf = new Uint32Array(1);
    for (let i = a.length - 1; i > 0; i--) {
        crypto.getRandomValues(buf); const j = buf[0] % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function raDraw() {
    const st = raStrata(raState.batch), slots = raSlotsFor(raState.batch);
    if (!slots) return alert('이 배치의 군 자리 표가 없습니다 (코호트 설정 assignSlots 또는 기본표).');
    const plan = { batch: raState.batch, drawnAt: new Date().toISOString(), strata: {}, dropped: {}, items: [] };
    ['mon', 'tue'].forEach(k => {
        const cages = st[k].filter(c => c.g0);
        const order = raShuffle(cages); const slotOrder = raShuffle(slots[k]);
        plan.strata[k] = order.map(c => c.cageId);
        order.forEach((c, i) => { if (i < slotOrder.length) plan.items.push({ cageId: c.cageId, number: c.number, stratum: k, group: slotOrder[i],
            rats: c.occ.map(r => ({ from: r.ratId, to: raWithGroup(r.ratId, slotOrder[i]) })) }); });
        plan.dropped[k] = slotOrder.slice(order.length);
        if (order.length > slotOrder.length) plan.extra = (plan.extra || []).concat(order.slice(slotOrder.length).map(c => c.number));
    });
    raState.plan = plan;
    raRender();
}

// ---------- 적용 ----------
async function raApply() {
    const p = raState.plan;
    if (!p || raState.busy) return;
    const n = p.items.reduce((a, it) => a + it.rats.length, 0);
    if (!confirm(`Batch ${p.batch} 케이지 ${p.items.length}개, 개체 ${n}마리의 군을 확정합니다.\n\n` +
        `· 오늘 라운드(케이지별 입력) 전에 하세요 — 조제가 군을 보고 계산됩니다.\n` +
        `· 적용하는 동안 다른 사람이 이 코호트를 입력하면 안 됩니다 (옛 ID로 저장될 수 있음).\n` +
        `· 개체 ID가 바뀝니다 (예 C1401G0 → C1401G2). 되돌리려면 다시 추첨해야 합니다.\n\n계속할까요?`)) return;
    raState.busy = true; raRender();
    try {
        const by = (firebase.auth().currentUser && firebase.auth().currentUser.email) || null;
        const recRef = db.collection('groupAssignments').doc();
        const record = { cohort: String(raState.cohort), batch: p.batch, date: getTodayStr(), at: firebase.firestore.Timestamp.now(), by,
                         rng: 'crypto.getRandomValues', drawnAt: p.drawnAt, strata: p.strata, dropped: p.dropped,
                         result: p.items.map(it => ({ cageId: it.cageId, number: it.number, stratum: it.stratum, group: it.group, rats: it.rats })),
                         applied: false };
        await recRef.set(record);   // 먼저 기록 — 중간에 끊겨도 「다시 적용」이 이 기록을 따른다
        const pairs = p.items.flatMap(it => it.rats.map(r => ({ from: r.from, to: r.to, group: it.group })));
        const left = await raApplyRenames(pairs);
        await recRef.update({ applied: left.length === 0, leftovers: left });
        clearRatsCache();
        if (typeof invalidateDashboardDom === 'function') invalidateDashboardDom();
        alert(left.length ? `적용했으나 옛 ID가 남은 기록이 있습니다:\n${left.join('\n')}\n\n「다시 적용」을 눌러 정리하세요.` : `배정 완료 — ${n}마리의 ID와 군을 바꿨습니다.`);
        raState.plan = null; raState.busy = false;
        await evLoad(evCohort);
    } catch (e) {
        console.error(e); raState.busy = false; raRender();
        alert('적용 실패: ' + e.message + '\n\n「다시 적용」으로 이어서 할 수 있습니다.');
    }
}

// 기록된 배정을 다시 적용 (중간에 끊겼거나, 옛 ID가 남았을 때)
async function raResume() {
    const rec = raState.record;
    if (!rec || raState.busy) return;
    const pairs = rec.result.flatMap(it => it.rats.map(r => ({ from: r.from, to: r.to, group: it.group })));
    if (!confirm(`${rec.date} 배정 기록(Batch ${rec.batch})대로 옛 ID가 남은 기록을 정리합니다. 계속할까요?`)) return;
    raState.busy = true; raRender();
    try {
        const left = await raApplyRenames(pairs);
        await db.collection('groupAssignments').doc(rec._id).update({ applied: left.length === 0, leftovers: left });
        clearRatsCache();
        alert(left.length ? `아직 남은 기록:\n${left.join('\n')}` : '정리 완료 — 옛 ID가 남은 기록이 없습니다.');
        raState.busy = false; await evLoad(evCohort);
    } catch (e) { console.error(e); raState.busy = false; raRender(); alert('실패: ' + e.message); }
}

// 배정 전인데 G 번호가 붙어 있는 배치(번호로 군을 미리 정하던 때 등록)를 G0로 되돌린다
async function raResetToG0() {
    const st = raStrata(raState.batch);
    const cages = [...st.mon, ...st.tue, ...st.other].filter(c => !c.g0);
    const pairs = cages.flatMap(c => c.occ.filter(r => raGroupNo(r) > 0).map(r => ({ from: r.ratId, to: raWithGroup(r.ratId, 'G0'), group: 'G0' })));
    if (!pairs.length || raState.busy) return;
    if (!confirm(`Batch ${raState.batch} ${pairs.length}마리를 G0(미배정)으로 되돌립니다.\n${pairs.slice(0, 6).map(x => x.from + ' → ' + x.to).join('\n')}${pairs.length > 6 ? '\n…' : ''}\n\n계속할까요?`)) return;
    raState.busy = true; raRender();
    try {
        const left = await raApplyRenames(pairs);
        clearRatsCache();
        alert(left.length ? `남은 기록:\n${left.join('\n')}` : 'G0로 되돌렸습니다.');
        raState.busy = false; await evLoad(evCohort);
    } catch (e) { console.error(e); raState.busy = false; raRender(); alert('실패: ' + e.message); }
}

// ID 바꾸기의 본체. pairs: [{from, to, group}]. 옛 ID가 남은 기록 목록을 돌려준다(빈 배열 = 깨끗).
// 1) 옛 ID를 가진 모든 문서를 모아 2) 묶음으로 쓰고 3) 다시 조회해 남은 게 있으면 한 번 더.
async function raApplyRenames(pairs) {
    for (let round = 0; round < 3; round++) {
        const ops = [];
        for (const p of pairs) {
            if (p.from === p.to) continue;
            const [rs, ms, ls, ds, hs, fs] = await Promise.all([
                db.collection('rats').where('ratId', '==', p.from).get(),
                db.collection('measurements').where('ratId', '==', p.from).get(),
                db.collection('dailyLogs').where('ratId', '==', p.from).get(),
                db.collection('doseLogs').where('ratId', '==', p.from).get(),
                db.collection('ratHousing').where('ratId', '==', p.from).get(),
                db.collection('cageFeeding').where('ratIds', 'array-contains', p.from).get()
            ]);
            rs.forEach(d => ops.push([d.ref, { ratId: p.to, group: p.group }]));
            [ms, ls, ds].forEach(sn => sn.forEach(d => ops.push([d.ref, { ratId: p.to }])));
            hs.forEach(d => ops.push([d.ref, { ratId: p.to, group: p.group }]));
            fs.forEach(d => ops.push([d.ref, { ratIds: (d.data().ratIds || []).map(x => x === p.from ? p.to : x) }]));
        }
        if (!ops.length) return [];
        for (let i = 0; i < ops.length; i += RA_BATCH_OPS) {
            const b = db.batch();
            ops.slice(i, i + RA_BATCH_OPS).forEach(([ref, data]) => b.update(ref, data));
            await b.commit();
        }
        // 케이지 문서의 군 사본은 열린 재실 기준으로 다시 맞춘다
        const cages = new Set();
        for (const p of pairs) { const cid = raState.housing[p.from] || raState.housing[p.to]; if (cid) cages.add(String(cid)); }
        for (const cid of cages) {
            const open = await db.collection('ratHousing').where('cageId', '==', cid).where('to', '==', null).get();
            const gs = open.docs.map(d => d.data().group).filter(Boolean);
            await db.collection('cages').doc(cid).set({ group: gs[0] || null }, { merge: true });
        }
    }
    // 세 바퀴 뒤에도 남은 것
    const left = [];
    for (const p of pairs) {
        for (const col of ['rats', 'measurements', 'dailyLogs', 'doseLogs', 'ratHousing']) {
            const sn = await db.collection(col).where('ratId', '==', p.from).get();
            if (!sn.empty) left.push(`${col}: ${p.from} ${sn.size}건`);
        }
        const fs = await db.collection('cageFeeding').where('ratIds', 'array-contains', p.from).get();
        if (!fs.empty) left.push(`cageFeeding: ${p.from} ${fs.size}건`);
    }
    return left;
}

// ---------- 화면 ----------
async function raLoadRecord(batchNo) {
    const sn = await db.collection('groupAssignments').where('cohort', '==', String(raState.cohort)).where('batch', '==', batchNo).get();
    let rec = null;
    sn.forEach(d => { const v = d.data(); if (!rec || String(v.date) > String(rec.date)) rec = Object.assign({ _id: d.id }, v); });
    return rec;
}

function raRender() {
    const box = document.getElementById('ra-box');
    if (!box || !raState) return;
    const st = raState;
    const batches = raBatches();
    const today = getTodayStr();
    const chip = (b) => `<button data-ra="batch" data-no="${b.no}" aria-pressed="${st.batch === b.no}" class="db-tap"
        style="padding:8px 12px; border-radius:2px; cursor:pointer; font-size:0.86rem; font-weight:700;
               border:${st.batch === b.no ? '2px solid var(--ink)' : '1px solid var(--rule)'};
               background:${st.batch === b.no ? 'var(--ink)' : 'var(--sheet)'}; color:${st.batch === b.no ? 'var(--paper)' : 'var(--ink)'};">
        B${b.no} <span class="mono" style="font-weight:400; opacity:0.8;">${b.switchDay ? b.switchDay.slice(5) : '결찰 전'}</span>
        ${b.unassigned ? '' : ' ✓'}</button>`;
    box.innerHTML = `
    <div class="card">
        <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:8px;">배치 · 전환일 (결찰 월요일 + ${RA_SWITCH_OFFSET}일). ✓ = 배정 끝</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">${batches.map(chip).join('') || '<span style="color:var(--ink-soft);">배치 정보가 없습니다 (코호트 14부터)</span>'}</div>
    </div>
    <div id="ra-body"><div class="card" style="color:var(--ink-soft);">불러오는 중...</div></div>`;
    if (st.batch) raRenderBatch(st.batch, batches.find(b => b.no === st.batch), today);
}

async function raRenderBatch(batchNo, binfo, today) {
    const body = document.getElementById('ra-body');
    const st = raStrata(batchNo), slots = raSlotsFor(batchNo);
    raState.record = await raLoadRecord(batchNo);
    const rec = raState.record, plan = raState.plan;
    const face = (bg, bd, ink) => `background:${bg}; border:1px solid ${bd}; color:${ink}; padding:8px 11px; border-radius:2px; font-size:0.84rem; margin-bottom:8px;`;
    const warn = [];
    if (binfo && binfo.switchDay && binfo.switchDay !== today) warn.push(`이 배치의 전환일은 <b class="mono">${binfo.switchDay}</b>입니다 (오늘 ${today}).`);
    if (st.other.length) warn.push(`결찰 요일이 월·화가 아니거나 섞인 케이지 ${st.other.map(c => c.number + '번').join(', ')} — 층을 정할 수 없어 뺍니다.`);
    if (st.none.length) warn.push(`케이지 배정이 없는 개체 ${st.none.map(r => r.ratId).join(', ')} — 케이지 현황에서 먼저 넣으세요.`);
    const foodRules = ((raState.cfg.dosing) || []).filter(d => d.medium === 'food');
    // 물질마다 G0를 덮는 규칙이 하나라도 있으면 된다 — G3만의 고염식 규칙(전환일에 끝남)처럼 G0가 없는 규칙은 정상
    const g0Missing = [/BAPN/i, /NaCl|염/i].some(re => foodRules.some(d => re.test(d.substance || ''))
        && !foodRules.some(d => re.test(d.substance || '') && (d.groups || []).includes('G0')));
    if (g0Missing) warn.push('코호트 설정의 고염식·BAPN 규칙에 <b>G0</b>가 없습니다 — 배정 전 개체의 사료 노출이 계산되지 않습니다. 코호트 설정에서 G0를 추가하세요.');
    const mixed = [...st.mon, ...st.tue].filter(c => c.groups.length > 1);
    if (mixed.length) warn.push(`한 케이지에 군이 섞여 있습니다: ${mixed.map(c => c.number + '번').join(', ')} — 케이지 현황에서 정리한 뒤 진행하세요.`);
    // 결찰 전(수술일 없음)이라 층이 없는 케이지도 G0 되돌리기 대상이다 — B1처럼 번호로 군이 붙은 채 등록된 배치
    const preAssigned = [...st.mon, ...st.tue, ...st.other].filter(c => c.assignedGroup);
    const eligible = [...st.mon, ...st.tue].filter(c => c.g0);

    const cageRow = (c) => {
        const it = plan && plan.items.find(x => x.cageId === c.cageId);
        return `<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--rule); flex-wrap:wrap;">
            <b class="mono" style="min-width:52px;">${raEsc(c.number)}번</b>
            <span class="mono" style="font-size:0.82rem; flex:1; min-width:160px;">${c.occ.map(r => raEsc(r.ratId)).join(' · ')}</span>
            ${c.assignedGroup ? `<span style="font-size:0.8rem; color:var(--ink-soft);">배정됨 ${raEsc(c.assignedGroup)}</span>`
              : it ? `<span class="mono" style="font-weight:700; padding:2px 10px; border:1px solid var(--ink); border-radius:2px; background:var(--stock-canary-soft);">→ ${raEsc(it.group)}</span>`
              : `<span style="font-size:0.8rem; color:var(--ink-soft);">G0 · 추첨 대상</span>`}
        </div>`;
    };
    const stratum = (k, label) => `
        <div style="flex:1; min-width:300px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:4px; margin-bottom:4px;">
                <b>${label} 결찰 <span class="mono" style="font-weight:400; color:var(--ink-soft);">케이지 ${st[k].length}</span></b>
                <span class="mono" style="font-size:0.78rem; color:var(--ink-soft);">자리 ${slots ? slots[k].join(' · ') : '없음'}</span>
            </div>
            ${st[k].length ? st[k].map(cageRow).join('') : '<div style="font-size:0.82rem; color:var(--ink-soft); padding:6px 0;">케이지 없음</div>'}
            ${plan && plan.dropped[k] && plan.dropped[k].length ? `<div style="font-size:0.78rem; color:#7A5C00; margin-top:4px;">케이지가 자리보다 적어 빠진 자리: ${plan.dropped[k].join(' · ')}</div>` : ''}
        </div>`;

    body.innerHTML = `
    ${warn.length ? `<div class="card" style="padding-top:12px; padding-bottom:6px;">${warn.map(w => `<div style="${face('var(--stock-canary-soft)', '#E3C55C', '#6B571C')}">${w}</div>`).join('')}</div>` : ''}
    ${rec ? `<div class="card" style="background:var(--stock-green-soft); border-color:var(--approve);">
        <b style="color:var(--approve);">Batch ${batchNo} 배정 기록 있음</b>
        <div style="font-size:0.82rem; margin-top:4px;">${raEsc(rec.date)} · ${raEsc(rec.by || '')} · 케이지 ${rec.result.length}개${rec.applied ? '' : ' · <b style="color:var(--stamp);">적용이 끝나지 않음</b>'}</div>
        <div class="mono" style="font-size:0.8rem; margin-top:6px;">${rec.result.map(it => `${raEsc(it.number)}번 ${raEsc(it.group)}`).join(' · ')}</div>
        ${!rec.applied || eligible.length ? `<button data-ra="resume" class="btn-small btn-blue db-tap" style="margin-top:8px;" ${raState.busy ? 'disabled' : ''}>기록대로 다시 적용</button>` : ''}
    </div>` : ''}
    <div class="card">
        <div style="display:flex; gap:20px; flex-wrap:wrap;">${stratum('mon', '월요일')}${stratum('tue', '화요일')}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; align-items:center;">
            ${!rec && eligible.length && !mixed.length ? (plan
                ? `<button data-ra="apply" class="btn btn-green db-tap" style="width:auto; padding:0.7rem 1.4rem;" ${raState.busy ? 'disabled' : ''}>${raState.busy ? '적용 중...' : '이 결과로 확정'}</button>
                   <button data-ra="redraw" class="btn-small db-tap" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);" ${raState.busy ? 'disabled' : ''}>다시 추첨</button>`
                : `<button data-ra="draw" class="btn btn-blue db-tap" style="width:auto; padding:0.7rem 1.4rem;">추첨 (케이지 ${eligible.length}개)</button>`) : ''}
            ${!rec && preAssigned.length ? `<button data-ra="reset" class="btn-small db-tap" style="background:var(--paper); color:var(--stamp); outline:1px solid var(--stamp);" ${raState.busy ? 'disabled' : ''}>G 번호가 붙은 ${preAssigned.length}개 케이지를 G0로 되돌리기</button>` : ''}
            ${rec && !eligible.length ? `<span style="font-size:0.85rem; color:var(--approve); font-weight:700;">이 배치는 배정이 끝났습니다.</span>` : ''}
        </div>
        ${plan ? `<div style="font-size:0.78rem; color:var(--ink-soft); margin-top:10px;">
            추첨 ${raEsc(plan.drawnAt.replace('T', ' ').slice(0, 19))} · 케이지와 자리를 각각 무작위로 섞어 짝지었습니다. 확정 전에는 아무것도 저장되지 않습니다.</div>` : ''}
        <div style="font-size:0.78rem; color:var(--ink-soft); margin-top:8px;">
            확정하면 개체 ID의 G0가 배정된 군으로 바뀌고, 체중 · 상태 · 재실 · 급여 기록이 새 ID로 옮겨집니다. 전환일 라운드 전에 하세요.
        </div>
    </div>`;
}
