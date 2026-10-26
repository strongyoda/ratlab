// ============================================================
//  사건 기록 — 개체에게 "무슨 일이 생겼다"를 적는 입구 하나
//  반입 → OVX → 결찰 → 고염식·BAPN → BP·MR → (이동) → 사망/희생 → 판정.
//  같은 사실을 넣는 입구가 네 곳(케이지별 입력·일괄 입력·상태&체중·개체 상세)이라
//  순서가 어긋났다 — 특히 사망을 개체 상세에서 먼저 처리하면 재실이 닫혀 케이지별 입력
//  목록에서 케이지가 사라지고 마지막 잔량을 넣을 곳이 없어진다.
//  여기서는 개체의 '지금 단계'를 보고 가능한 사건만 보여주고, 저장 위치가 정해진 사건은
//  그 화면으로 데려간다(사망 → 케이지별 입력, 이동 → 케이지 현황, 판정 → 개체 상세).
//  데이터 구조는 일괄 입력(batch_entry.js)과 같다 — rats 문서의 날짜 필드.
// ============================================================

let evCohort = null, evType = null, evRats = [], evHousing = {}, evCageNo = {}, evPicked = new Set(), evCfg = null;
// 배치(반입 차수) 거르기 — 「가능한 전부」가 다른 배치까지 결찰일을 쓰던 것을 막는다 (2026-10-26 점검)
let evBatch = '';
const evBatchOf = r => typeof getBatchNo === 'function' ? getBatchNo(r, (evCfg && evCfg.housing && evCfg.housing.batchSize) || 12) : null;
const evVisible = () => evBatch ? evRats.filter(r => evBatchOf(r) === evBatch) : evRats;
function evBatchSummary(list) {
    const m = {};
    list.forEach(r => { const b = evBatchOf(r); if (b) m[b] = (m[b] || 0) + 1; });
    return Object.keys(m).sort((a, b) => a - b).map(b => `B${b} ${m[b]}마리`).join(' · ');
}
function evSetBatch(v) {
    evBatch = Number(v) || '';
    if (evBatch) evPicked = new Set([...evPicked].filter(id => evVisible().some(r => r.ratId === id)));
    evRender();
}

// 순서 = 개체의 생애 순서. kind: save(여기서 저장) · route(다른 화면으로 데려감) · judge(판정 대기 목록)
const EV_TYPES = {
    arrival:   { label: '반입',          kind: 'route', view: 'add',   note: '신규 등록에서 코호트·번호·반입일을 넣습니다.' },
    ovx:       { label: 'OVX',           kind: 'save',  field: 'ovxDate' },
    ligation:  { label: '결찰',          kind: 'save',  field: 'surgeryDate' },
    nacl:      { label: '고염식 시작',    kind: 'save',  field: 'naclStartDate' },
    bapn:      { label: 'BAPN 시작',     kind: 'save',  field: 'bapnStartDate' },
    assign:    { label: '군 배정 (전환일)', kind: 'assign' },
    bp:        { label: 'BP 측정',       kind: 'route', view: 'bp',    note: 'BP 계산 & 입력에서 CSV를 올립니다. 그날 케이지별 입력에는 「BP일」 표시를 켜세요 — 반동 구간이 농도 기준에서 빠집니다.' },
    mr:        { label: 'MR 촬영',       kind: 'save',  field: 'mrDates' },
    move:      { label: '이동 · 합사',    kind: 'route', view: 'cages', note: '케이지 현황에서 끌어다 옮깁니다. 오늘 그 케이지의 급여 입력을 먼저 끝내고 옮기세요 — 입력 전에 옮기면 체중·마리수가 어긋난 채 조제됩니다.' },
    death:     { label: '사망 발견',      kind: 'death' },
    sacrifice: { label: '희생 · 샘플',    kind: 'save',  field: 'sampleDate' },
    judge:     { label: '사인 · ARE 판정', kind: 'judge' }
};

const evEsc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 개체의 지금 단계 — 사건 버튼의 가능/불가를 가르는 기준
function evStage(r) {
    const d = v => typeof dbDateOf === 'function' ? dbDateOf(v) : (v ? String(v).slice(0, 10) : null);
    if (r.status === '사망' || r.deathDate) {
        const judged = !!(r.cod || r.codFull) && !!r.are;
        return { key: 'dead', label: (r.sampleDate ? '희생 ' : '사망 ') + (d(r.deathDate) || d(r.sampleDate) || '') + (judged ? ' · 판정 완료' : ' · 판정 대기'), judged };
    }
    const surg = d(r.surgeryDate);
    if (surg) {
        const pod = Math.round((new Date(getTodayStr() + 'T00:00:00') - new Date(surg + 'T00:00:00')) / 864e5);
        return { key: 'ligated', label: `결찰 후 POD ${pod}`, pod };
    }
    if (d(r.ovxDate)) return { key: 'ovx', label: `OVX ${d(r.ovxDate)}` };
    return { key: 'arrived', label: d(r.arrivalDate) ? `반입 ${d(r.arrivalDate)}` : '반입' };
}

// 이 사건을 이 개체에 적어도 되나. null = 된다. { block } 이면 못 고른다, 아니면 경고만 띄우고 허용.
function evCheck(type, r) {
    const st = evStage(r);
    const t = EV_TYPES[type];
    if (type === 'judge') {
        if (st.key !== 'dead') return { block: true, text: '생존' };
        return st.judged ? { block: true, text: '판정 완료' } : null;
    }
    if (type === 'assign') return null;
    if (st.key === 'dead') return { block: true, text: '사망' };
    if (type === 'death') return evHousing[r.ratId] ? null : { block: true, text: '케이지 배정 없음 — 케이지 현황에서 먼저' };
    if (type === 'mr') return r.surgeryDate ? null : { text: '결찰 기록 없음 (POD 계산 불가)' };
    if (type === 'sacrifice') return null;
    const have = r[t.field];
    if (have) return { text: `이미 있음 ${evEsc(have)} — 덮어씁니다` };
    if (type === 'ligation' && !r.ovxDate && evCfg && (evCfg.dosing || []).some(x => x.startAnchor === 'ovx')) return { text: 'OVX 기록 없음' };
    if (type === 'bapn' && !r.surgeryDate) return { text: '결찰 기록 없음' };
    return null;
}

// ---------- 진입 ----------
async function renderEventsView(main) {
    main.innerHTML = `
    <div class="card">
        <h3 style="margin:0 0 6px 0; border-bottom:3px double var(--ink); padding-bottom:6px;">사건 기록</h3>
        <div style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:12px;">
            개체에게 생긴 일을 적는 곳입니다. 지금 단계에서 가능한 사건만 열립니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label for="ev-cohort" style="font-weight:bold; color:var(--ink);">코호트</label>
            <select id="ev-cohort" style="width:auto; min-width:130px; padding:8px; border-radius:2px; border:1px solid #C9C5B8;">
                <option value="">로딩 중...</option>
            </select>
        </div>
    </div>
    <div id="ev-body"></div>`;

    const body = document.getElementById('ev-body');
    body.addEventListener('click', e => {
        const el = e.target.closest('[data-ev]');
        if (!el) return;
        const v = el.dataset;
        switch (v.ev) {
            case 'type':   evSetType(v.type); break;
            case 'pick':   evPick(v.rat); break;
            case 'pickall': evPickAll(v.on === '1'); break;
            case 'save':   evSave(); break;
            case 'death':  evGoDeath(); break;
            case 'detail': wfOpenDetail(v.rat); break;
            case 'go':     go(v.view); break;
        }
    });

    const sel = document.getElementById('ev-cohort');
    const rats = await getRatsWithCache();
    const nums = [...new Set(rats.map(r => String(r.cohort)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
    // 기본은 생존 개체가 있는 가장 최근 코호트 — 라운드 중에 고를 일이 없게
    const def = nums.find(n => rats.some(r => String(r.cohort) === n && r.status !== '사망')) || nums[0] || '';
    sel.innerHTML = nums.map(n => `<option value="${n}" ${n === def ? 'selected' : ''}>코호트 ${n}</option>`).join('');
    sel.onchange = () => evLoad(sel.value);
    if (def) evLoad(def);
}

async function evLoad(cohort) {
    if (String(cohort) !== String(evCohort)) evBatch = '';
    evCohort = cohort; evPicked = new Set();
    const body = document.getElementById('ev-body');
    if (!cohort) { body.innerHTML = ''; return; }
    body.innerHTML = '<div class="card">불러오는 중...</div>';
    try {
        const [rats, hs, cageSnap, cfg] = await Promise.all([
            getRatsWithCache(),
            db.collection('ratHousing').where('cohort', '==', String(cohort)).get(),
            db.collection('cages').get(),
            getCohortConfig(cohort)
        ]);
        evRats = rats.filter(r => String(r.cohort) === String(cohort))
            .sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0) || String(a.ratId).localeCompare(String(b.ratId)));
        evHousing = {};
        hs.forEach(d => { const v = d.data(); if (!v.to) evHousing[v.ratId] = String(v.cageId); });
        evCageNo = {};
        cageSnap.forEach(d => { evCageNo[d.id] = d.data().number; });
        evCfg = cfg || null;
        evRender();
    } catch (e) {
        console.error(e);
        body.innerHTML = `<div class="card" style="color:var(--stamp)">불러오기 실패: ${evEsc(e.message)}</div>`;
    }
}

function evSetType(t) { evType = t; evPicked = new Set(); evRender(); }
function evPick(id) {
    if (!evType) return;
    const r = evRats.find(x => x.ratId === id);
    const c = r && evCheck(evType, r);
    if (c && c.block) return;
    if (evType === 'death') { evPicked = new Set(evPicked.has(id) ? [] : [id]); }   // 사망은 한 마리씩 — 케이지별 입력으로 데려간다
    else evPicked.has(id) ? evPicked.delete(id) : evPicked.add(id);
    evRender();
}
function evPickAll(on) {
    // 고른 배치 안에서만 (배치를 안 골랐으면 전체)
    evPicked = new Set(on ? evVisible().filter(r => !evCheck(evType, r) || !evCheck(evType, r).block).map(r => r.ratId) : []);
    evRender();
}

// ---------- 화면 ----------
function evRender() {
    const body = document.getElementById('ev-body');
    const alive = evRats.filter(r => evStage(r).key !== 'dead').length;
    const waiting = evRats.filter(r => evStage(r).key === 'dead' && !evStage(r).judged).length;

    body.innerHTML = `
    <div class="card">
        <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:8px;">
            생존 <b class="mono" style="color:var(--ink);">${alive}</b> · 판정 대기 <b class="mono" style="color:${waiting ? 'var(--stamp)' : 'var(--ink)'};">${waiting}</b>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(118px,1fr)); gap:6px;">
            ${Object.entries(EV_TYPES).map(([k, v]) => {
                const n = k === 'judge' ? waiting : null;
                const on = evType === k;
                return `<button data-ev="type" data-type="${k}" aria-pressed="${on}" class="db-tap"
                    style="padding:9px 8px; border-radius:2px; cursor:pointer; font-size:0.88rem; font-weight:700;
                           border:${on ? '2px solid var(--ink)' : '1px solid var(--rule)'};
                           background:${on ? 'var(--ink)' : 'var(--sheet)'}; color:${on ? 'var(--paper)' : 'var(--ink)'};">
                    ${v.label}${n ? ` <span class="mono" style="color:${on ? 'var(--stock-canary)' : 'var(--stamp)'};">${n}</span>` : ''}
                </button>`; }).join('')}
        </div>
    </div>
    ${evType ? evTypeCard() : `<div class="card" style="color:var(--ink-soft); font-size:0.88rem;">위에서 사건을 고르세요.</div>`}`;
    if (evType === 'assign' && typeof raMount === 'function') raMount();
}

function evTypeCard() {
    const t = EV_TYPES[evType];
    if (t.kind === 'route') return `
    <div class="card" style="background:var(--ink); color:var(--paper); border-color:var(--ink);">
        <div style="font-size:0.72rem; letter-spacing:0.14em; font-weight:700; opacity:0.8;">${evEsc(t.label)} · 저장 위치</div>
        <div style="font-size:0.95rem; margin:8px 0 12px 0; line-height:1.6;">${evEsc(t.note)}</div>
        <button data-ev="go" data-view="${t.view}" class="btn-small db-tap" style="background:var(--paper); color:var(--ink);">${evEsc(getTitleForView(t.view))}로 이동</button>
    </div>`;
    if (t.kind === 'judge') return evJudgeCard();
    if (t.kind === 'death') return evDeathCard();
    if (t.kind === 'assign') return `<div id="ra-box"></div>`;   // assign.js raMount 가 채운다
    return evSaveCard();
}

// 개체 칩. 케이지별 묶음은 라운드 단위로 고르기 쉽게 — 일괄 입력과 같다.
function evGroups() {
    const g = {};
    evVisible().forEach(r => {
        const cid = evHousing[r.ratId];
        const key = cid ? `${evCageNo[cid] ?? cid}번 케이지` : '미배정';
        (g[key] = g[key] || []).push(r);
    });
    return Object.keys(g).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)).map(k => [k, g[k]]);
}
function evChip(r) {
    const c = evCheck(evType, r);
    const st = evStage(r);
    const picked = evPicked.has(r.ratId);
    const block = c && c.block;
    return `
    <button data-ev="pick" data-rat="${evEsc(r.ratId)}" aria-pressed="${picked}" ${block ? 'disabled' : ''}
        style="text-align:left; padding:8px 10px; border-radius:2px; cursor:${block ? 'default' : 'pointer'}; font-size:0.85rem;
               border:${picked ? '2px solid var(--ink)' : '1px solid var(--rule)'};
               background:${picked ? 'var(--stock-canary-soft)' : 'var(--sheet)'}; ${block ? 'opacity:0.45;' : ''}">
        <div style="display:flex; align-items:center; gap:6px;">
            <span aria-hidden="true">${block ? '—' : picked ? '☑' : '☐'}</span>
            <b class="mono">${evEsc(r.ratId)}</b>
        </div>
        <div style="font-size:0.72rem; color:var(--ink-soft); margin-top:2px;">${evEsc(st.label)}</div>
        ${c ? `<div style="font-size:0.72rem; color:${block ? 'var(--ink-soft)' : '#7A5C00'}; margin-top:2px;">${c.text}</div>` : ''}
    </button>`;
}
function evPickerHtml(single) {
    const bnos = [...new Set(evRats.map(evBatchOf).filter(Boolean))].sort((a, b) => a - b);
    const bsum = evBatchSummary(evRats.filter(r => evPicked.has(r.ratId)));
    const bsel = bnos.length ? `<label for="ev-batch" style="font-size:0.8rem; color:var(--ink-soft);">배치</label>
            <select id="ev-batch" onchange="evSetBatch(this.value)" style="width:auto; min-width:90px; padding:5px; border:1px solid #C9C5B8; border-radius:2px;">
                <option value="" ${!evBatch ? 'selected' : ''}>전체</option>
                ${bnos.map(b => `<option value="${b}" ${evBatch === b ? 'selected' : ''}>B${b}</option>`).join('')}
            </select>` : '';
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <h4 style="margin:0; color:var(--ink);">대상 ${single ? '(한 마리)' : ''}
            <span class="mono" style="font-size:0.85rem; color:var(--ink-soft); font-weight:normal;">${evPicked.size}마리 선택${evPicked.size && bsum ? ' · ' + bsum : ''}</span></h4>
        ${single ? (bsel ? `<div style="display:flex; gap:6px; align-items:center;">${bsel}</div>` : '') : `<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            ${bsel}
            <button class="btn-small db-tap" data-ev="pickall" data-on="1" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);">${evBatch ? `B${evBatch} 가능한 전부` : '가능한 전부'}</button>
            <button class="btn-small db-tap" data-ev="pickall" data-on="0" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);">해제</button>
        </div>`}
    </div>
    ${evGroups().map(([k, list]) => `
    <div style="margin-bottom:12px;">
        <b class="mono" style="font-size:0.85rem; color:var(--ink); display:block; margin-bottom:5px;">${evEsc(k)}</b>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(165px,1fr)); gap:6px;">${list.map(evChip).join('')}</div>
    </div>`).join('')}`;
}

function evSaveCard() {
    const t = EV_TYPES[evType];
    const sel = (id, opts, defv) => `<select id="${id}" style="width:auto; min-width:90px; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
        ${opts.map(v => `<option value="${v}" ${v === defv ? 'selected' : ''}>${v || '-'}</option>`).join('')}</select>`;
    const fld = (label, html) => `<div><div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">${label}</div>${html}</div>`;
    return `
    <div class="card">
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:14px;">
            ${fld('날짜', `<input type="date" id="ev-date" value="${getTodayStr()}" max="${getTodayStr()}" style="width:auto; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">`)}
            ${evType === 'mr' ? fld('시점', sel('ev-mr-tp', ['D00','D0','D2','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'], 'W4'))
                + fld('Infarct 크기', sel('ev-mr-size', ['', 'None', 'Small', 'Large'], ''))
                + fld('위치', sel('ev-mr-loc', ['', 'R', 'L', 'Both'], '')) : ''}
            ${evType === 'sacrifice' ? fld('샘플 종류', sel('ev-sample', ['', 'Histology', 'Cast', 'Fail'], '')) : ''}
        </div>
        ${evType === 'sacrifice' ? `<div style="padding:9px 11px; margin-bottom:12px; border-radius:2px; background:var(--stock-canary-soft); border:1px solid #E3C55C; color:#6B571C; font-size:0.82rem;">
            희생은 사망으로 기록되고 케이지 재실이 닫힙니다. 마지막 섭취 구간이 필요하면 <b>오늘 케이지별 입력을 먼저</b> 끝내세요.</div>` : ''}
        ${evType === 'ligation' || evType === 'bapn' || evType === 'nacl' ? `<div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:12px;">
            투약 시작일은 이 날짜 + 코호트 설정의 오프셋으로 계산됩니다. 사료 교체·조제 시작은 「오늘」 화면에 그날 뜹니다.</div>` : ''}
        ${evPickerHtml(false)}
        <button class="btn btn-green" data-ev="save" style="width:100%; height:48px; font-size:1rem; margin-top:6px;">
            선택한 ${evPicked.size}마리에 ${evEsc(t.label)} 기록
        </button>
    </div>`;
}

function evDeathCard() {
    const id = [...evPicked][0];
    const r = id && evRats.find(x => x.ratId === id);
    const cid = r && evHousing[r.ratId];
    return `
    <div class="card">
        <div style="padding:10px 12px; margin-bottom:14px; border-radius:2px; background:var(--ink); color:var(--paper); font-size:0.88rem; line-height:1.6;">
            <div style="font-size:0.72rem; letter-spacing:0.14em; font-weight:700; opacity:0.8;">사망은 케이지별 입력에서 저장합니다</div>
            개체를 고르면 그 케이지 입력 화면이 사망 체크가 켜진 채 열립니다. 물·사료 잔량과 체중(사체)을 함께 저장하면
            마지막 구간이 남고, 재실이 닫히고, 마지막 생존 확인일이 자동으로 들어갑니다. 저장 뒤 사인 입력으로 이어집니다.
        </div>
        ${evPickerHtml(true)}
        <button class="btn btn-red db-tap" data-ev="death" ${r ? '' : 'disabled'} style="width:100%; height:48px; font-size:1rem; margin-top:6px; ${r ? '' : 'opacity:0.5;'}">
            ${r ? `${evEsc(r.ratId)} — ${evEsc(evCageNo[cid] ?? cid)}번 케이지 입력으로` : '개체를 고르세요'}
        </button>
    </div>`;
}
async function evGoDeath() {
    const id = [...evPicked][0];
    const r = id && evRats.find(x => x.ratId === id);
    const cid = r && evHousing[r.ratId];
    if (!r || !cid) return;
    await wfOpenCage(evCohort, cid, [r.ratId]);
}

function evJudgeCard() {
    const list = evRats.filter(r => evStage(r).key === 'dead' && !evStage(r).judged)
        .sort((a, b) => String(dbDateOf(b.deathDate) || '').localeCompare(String(dbDateOf(a.deathDate) || '')));
    return `
    <div class="card">
        <h4 style="margin:0 0 10px 0; color:var(--ink);">판정 대기 <span class="mono" style="font-weight:normal; color:var(--ink-soft); font-size:0.85rem;">${list.length}마리</span></h4>
        ${!list.length ? `<div style="color:var(--approve); font-weight:700;">판정이 밀린 개체가 없습니다.</div>` : list.map(r => `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--rule);">
            <button data-ev="detail" data-rat="${evEsc(r.ratId)}" class="db-tap mono"
                style="font-weight:700; color:var(--ink); background:var(--sheet); border:1px solid var(--ink); border-radius:2px; padding:4px 10px; cursor:pointer;">${evEsc(r.ratId)}</button>
            <span class="mono" style="font-size:0.82rem; color:var(--ink-soft);">${evEsc(evStage(r).label)}</span>
            <span style="font-size:0.78rem; color:#7C2A30;">${!(r.cod || r.codFull) ? '사인 없음' : ''}${!(r.cod || r.codFull) && !r.are ? ' · ' : ''}${!r.are ? 'ARE 미판정' : ''}</span>
        </div>`).join('')}
        <div style="font-size:0.75rem; color:var(--ink-soft); margin-top:8px;">개체를 누르면 상세가 새 탭에 열립니다. 사인은 상세의 사망 원인 창에서 넣습니다.</div>
    </div>`;
}

// ---------- 저장 (일괄 입력 beSave 와 같은 규칙) ----------
async function evSave() {
    const t = EV_TYPES[evType];
    if (!t || t.kind !== 'save') return;
    if (!evPicked.size) return alert('대상을 선택하세요.');
    const date = document.getElementById('ev-date').value;
    if (!date) return alert('날짜를 선택하세요.');
    const targets = evRats.filter(r => evPicked.has(r.ratId));

    // 날짜 검사 (global.js checkRatDates) — 막을 것은 막고, 확인할 것은 묻는다
    const today = getTodayStr();
    const errs = [], warns = [];
    if (date > today) errs.push(`날짜 ${date}가 오늘(${today})보다 뒤입니다`);
    targets.forEach(r => {
        const patch = evType === 'ligation' ? { surgeryDate: date } : evType === 'ovx' ? { ovxDate: date }
            : evType === 'sacrifice' ? { sampleDate: date, deathDate: date } : null;
        if (!patch || typeof checkRatDates !== 'function') return;
        const c = checkRatDates(r, patch, today);
        c.errors.forEach(x => errs.push(`${r.ratId}: ${x}`));
        c.warns.forEach(x => warns.push(x));
    });
    if (errs.length) return alert('저장하지 않았습니다 — 날짜를 확인하세요:\n\n' + [...new Set(errs)].slice(0, 12).join('\n') + (errs.length > 12 ? `\n… 외 ${errs.length - 12}건` : ''));
    if (warns.length && !confirm('확인해주세요:\n\n' + [...new Set(warns)].slice(0, 10).join('\n') + '\n\n계속할까요?')) return;

    // 배치별 마리수를 보여주고, 둘 이상 섞였으면 한 번 더 묻는다
    const bsum = evBatchSummary(targets);
    const nBatch = new Set(targets.map(evBatchOf).filter(Boolean)).size;
    if (!confirm(`${t.label} ${date}\n${targets.length}마리${bsum ? ` (${bsum})` : ''}\n\n기록할까요?`)) return;
    if (nBatch > 1 && !confirm(`배치 ${nBatch}개가 섞여 있습니다 (${bsum}).\n\n같은 날 같은 처치를 받은 게 맞습니까? 다르면 취소하고 배치를 고르세요.`)) return;

    if (evType === 'ligation') {
        const shams = targets.filter(r => r.isNonInduction);
        if (shams.length && !confirm(`Sham/Naïve로 표시된 개체가 ${shams.length}마리 있습니다.\n${shams.slice(0, 6).map(r => r.ratId).join(', ')}\n\n이 개체들의 수술일은 그래프 기준용 가상 날짜입니다. 덮어쓰면 POD 축이 달라집니다. 계속할까요?`)) return;
    }
    const overwrite = targets.filter(r => evType !== 'mr' && r[t.field]);
    if (overwrite.length && !confirm(`이미 기록이 있는 개체 ${overwrite.length}마리를 덮어씁니다.\n\n${overwrite.slice(0, 8).map(r => `${r.ratId} (${r[t.field]})`).join('\n')}${overwrite.length > 8 ? '\n... 외' : ''}\n\n계속할까요?`)) return;

    const mrTp = document.getElementById('ev-mr-tp')?.value;
    const mrSize = document.getElementById('ev-mr-size')?.value || '';
    const mrLoc = document.getElementById('ev-mr-loc')?.value || '';
    const sampleType = document.getElementById('ev-sample')?.value || '';
    const skipped = [];

    try {
        const snap = await db.collection('rats').where('cohort', '==', String(evCohort)).get();
        const docByRat = {};
        snap.forEach(d => { docByRat[d.data().ratId] = d; });
        const batch = db.batch();
        let n = 0;
        for (const r of targets) {
            const doc = docByRat[r.ratId];
            if (!doc) continue;
            if (evType === 'mr') {
                const arr = (doc.data().mrDates || []).slice();
                if (arr.some(m => m.timepoint === mrTp)) { skipped.push(`${r.ratId} (${mrTp} 이미 있음)`); continue; }
                arr.push({ timepoint: mrTp, date, infarctSize: mrSize, infarctLoc: mrLoc });
                arr.sort((a, b) => new Date(a.date) - new Date(b.date));
                batch.update(doc.ref, { mrDates: arr });
            } else if (evType === 'sacrifice') {
                // 희생 = 사망 (관례: 샘플 있는 개체 전원 status 사망, 계획 희생은 cod 'Sacrifice')
                const upd = { sampleDate: date, status: '사망', deathDate: date };
                if (sampleType) upd.sampleType = sampleType;
                if (!doc.data().cod && !doc.data().codFull) upd.cod = 'Sacrifice';
                batch.update(doc.ref, upd);
            } else {
                batch.update(doc.ref, { [t.field]: date });
            }
            n++;
        }
        if (!n) return alert('반영할 대상이 없습니다.\n\n' + skipped.join('\n'));
        await batch.commit();

        if (evType === 'sacrifice') {
            for (const r of targets) {
                if (!docByRat[r.ratId]) continue;
                await closeOpenHousing(r.ratId, '희생');
                // 사망일 = 희생일. 마지막 생존 확인일도 같이 (global.js lastAliveDateFor)
                try { await docByRat[r.ratId].ref.update({ lastAliveDate: await lastAliveDateFor(r.ratId, date) }); }
                catch (e) { console.warn('lastAliveDate 저장 실패', r.ratId, e); }
            }
        }
        clearRatsCache();
        if (typeof invalidateDashboardDom === 'function') invalidateDashboardDom();
        let msg = `${n}마리에 ${t.label} 기록 완료`;
        if (skipped.length) msg += `\n\n건너뜀 ${skipped.length}건:\n` + skipped.slice(0, 10).join('\n');
        alert(msg);
        await evLoad(evCohort);
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    }
}
