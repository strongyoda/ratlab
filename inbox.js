// ============================================================
//  미처리 — 받은편지함. "지금 틀어진 것"만 모아서, 처리하면 사라진다.
//  규칙을 코드로 막는 대신(사람은 안내문을 안 읽는다) 빠진 것을 매일 보이게 한다.
//  10/7 백필 때 손으로 하던 점검(사망일 급여 기록·마지막 생존일·재실 열림·사인)을 상시로 돌린다.
//  데이터는 대시보드와 같은 한 번 읽기(dbLoad). 사망 뒤 급여 기록 점검은 그 범위(35일) 안에서만 본다.
// ============================================================

async function renderInboxView(main) {
    main.innerHTML = `<div class="card">불러오는 중...</div>`;
    try {
        await dbLoad();
        ibRender(main);
    } catch (e) {
        console.error(e);
        main.innerHTML = `<div class="card" style="color:var(--stamp)">불러오기 실패: ${dbEsc(e.message)}</div>`;
    }
}

function ibOnClick(e) {
    const el = e.target.closest('[data-ib-action]');
    if (!el) return;
    switch (el.dataset.ibAction) {
        case 'cage':   wfOpenCage(el.dataset.cohort, el.dataset.cage); break;
        case 'detail': wfOpenDetail(el.dataset.rat); break;
        case 'go':     go(el.dataset.view); break;
        case 'refresh': renderInboxView(document.getElementById('view_' + activeTabId)); break;
        case 'closehousing': ibCloseHousing(el.dataset.rat); break;
    }
}

// 사망 개체의 재실이 열려 있으면 닫는다 — 섭취량 마리·일에 죽은 개체가 계속 잡히는 걸 막는다
async function ibCloseHousing(ratId) {
    if (!confirm(`${ratId}의 케이지 재실을 '사망'으로 닫을까요?\n(케이지가 비면 그 케이지의 군 배정도 풀립니다)`)) return;
    const n = await closeOpenHousing(ratId, '사망');
    if (n < 0) return alert('실패했습니다. 콘솔을 확인하세요.');
    alert(n ? '닫았습니다.' : '열린 재실이 없었습니다.');
    renderInboxView(document.getElementById('view_' + activeTabId));
}

// ---------- 점검 ----------
// item: { group, level: 'red'|'orange'|'gray', head, body, actions:[{label, action, ...data}] }
function ibItems() {
    const { today, rats, alive, cages, housing, feeds, doseFeeds, meas, configs, active } = dbData;
    const out = [];
    const cageOf = {};  cages.forEach(c => { cageOf[String(c.id)] = c; });
    const openHousing = {}; housing.forEach(h => { openHousing[h.ratId] = String(h.cageId); });
    const cohortRats = rats.filter(r => active.includes(String(r.cohort)));
    const detailBtn = r => ({ label: '개체 상세', action: 'detail', rat: r.ratId });
    const cageBtn = (cohort, cageId) => ({ label: `${(cageOf[String(cageId)] || {}).number ?? cageId}번 입력`, action: 'cage', cohort, cage: cageId });

    // ── 1. 사망 처리 미완 ───────────────────────────────
    const histCutoff = dbShift(today, -DOSE_HISTORY_DAYS);
    cohortRats.filter(r => r.status === '사망' || r.deathDate).forEach(r => {
        const dd = dbDateOf(r.deathDate);
        const sac = !!r.sampleDate;
        const probs = [];
        if (openHousing[r.ratId]) probs.push({ level: 'red', text: '케이지 재실이 아직 열려 있음 — 섭취량 마리·일에 계속 잡힙니다',
            actions: [{ label: '재실 닫기', action: 'closehousing', rat: r.ratId }] });
        if (!dd) probs.push({ level: 'red', text: '사망일이 비어 있음', actions: [detailBtn(r)] });
        else if (!sac && dd >= histCutoff) {
            // 사망일에 그 개체가 든 케이지의 급여 기록이 있어야 마지막 구간(잔량)이 남는다
            const row = doseFeeds.find(f => f.dateStr === dd && (f.ratIds || []).includes(r.ratId));
            if (!row) probs.push({ level: 'orange', text: `사망일(${dd}) 급여 기록에 이 개체가 없음 — 마지막 잔량이 안 남았습니다. 그날 케이지 입력을 소급해 넣으세요`,
                actions: openHousing[r.ratId] ? [] : [{ label: '케이지별 입력', action: 'go', view: 'cageinput' }] });
        }
        if (dd && !r.lastAliveDate && !sac) probs.push({ level: 'gray', text: '마지막 생존 확인일 없음 (구간 분석용 · 사인 창에서 사망일을 다시 저장하면 채워집니다)', actions: [detailBtn(r)] });
        if (!(r.cod || r.codFull)) probs.push({ level: 'orange', text: '사인(COD) 없음', actions: [detailBtn(r)] });
        else if (!r.are) probs.push({ level: 'gray', text: 'ARE 미판정 (cast 뒤)', actions: [detailBtn(r)] });
        probs.forEach(p => out.push({ group: '사망 처리', level: p.level, head: r.ratId, body: p.text, actions: p.actions }));
    });

    // ── 2. 재실 ────────────────────────────────────────
    alive.filter(r => !openHousing[r.ratId]).forEach(r => out.push({ group: '재실', level: 'orange',
        head: r.ratId, body: '케이지 배정이 없음 — 급여 기록과 투약에서 빠져 있습니다',
        actions: [{ label: '케이지 현황', action: 'go', view: 'cages' }] }));

    // (라운드 누락 점검은 두지 않는다 — 1번부터 순서대로 돌아 케이지를 빠뜨릴 일이 없다, 사용자 2026-10-19)

    // ── 3. 투약 ────────────────────────────────────────
    cages.forEach(cage => {
        const occ = dbOccupants(cage.id);
        if (!occ.length) return;
        const cohort = String(occ[0].cohort);
        const cfg = configs[cohort];
        if (!active.includes(cohort) || !cfg || !cfg.dosing) return;
        const gkey = cageGroupKey(occ, cage);
        const rule = cfg.dosing.find(x => x.medium === 'water' && (x.groups || []).includes(gkey) && Number(x.value) > 0);
        if (!rule) return;
        let start = null;
        occ.forEach(r => { const b = doseAnchorDate(rule, r); if (b) { const d = dbShift(b, Number(rule.startOffset) || 0); if (!start || d < start) start = d; } });
        if (!start || start > today) return;
        const rows = doseFeeds.filter(f => String(f.cageId) === String(cage.id)).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
        const fill = rows.find(r => !((r.noWater !== undefined && r.noWater !== null) ? r.noWater : r.noRefill));
        if (fill && fill.dateStr >= start && !(Number(fill.doseMg) > 0))
            out.push({ group: '투약', level: 'red', head: `${cage.number}번`,
                body: `${rule.substance} 투약 중인데 ${fill.dateStr} 채움에 약이 0 — 투약이 끊겨 있습니다 (계산 대기로 막혔거나 조제를 건너뜀)`,
                actions: [cageBtn(cohort, cage.id)] });
        if (fill && dbDiffDays(fill.dateStr, today) > 4)
            out.push({ group: '투약', level: 'orange', head: `${cage.number}번`,
                body: `물을 ${fill.dateStr} 이후 안 갈았음 (${dbDiffDays(fill.dateStr, today)}일) — 농도가 그대로 남아 있고 잔량이 바닥났을 수 있습니다`,
                actions: [cageBtn(cohort, cage.id)] });
    });

    // ── 4. 기록 누락 ────────────────────────────────────
    const lastW = {};
    meas.forEach(m => { if (!(Number(m.weight) > 0)) return; const d = String(m.date).slice(0, 10); if (!lastW[m.ratId] || d > lastW[m.ratId]) lastW[m.ratId] = d; });
    alive.forEach(r => {
        const d = lastW[r.ratId];
        const gap = d ? dbDiffDays(d, today) : null;
        if (gap === null || gap > DB_WATCH_DAYS)
            out.push({ group: '기록 누락', level: 'orange', head: r.ratId,
                body: d ? `체중이 ${gap}일째 없음 (마지막 ${d}) — kg당 계산이 옛 체중으로 돕니다` : '체중 기록이 최근 2주 안에 없음',
                actions: openHousing[r.ratId] ? [cageBtn(String(r.cohort), openHousing[r.ratId])] : [detailBtn(r)] });
    });
    // 기준일 누락 · 빈 통 무게 · 로스 상수 (대시보드와 같은 판정)
    dbAlerts().forEach(a => out.push({ group: '설정 · 기준일', level: a.level === 'red' ? 'red' : 'orange', head: '설정',
        body: `<b>${a.head}</b> — ${a.body}`, actions: [{ label: '사건 기록', action: 'go', view: 'events' }] }));

    // ── 5. 관찰 (오늘 섭취 이상) ───────────────────────
    dbIntakeIssues().filter(x => x.kind === 'bad').forEach(x => {
        const cage = cages.find(c => String(c.number) === String(x.n));
        const occ = cage ? dbOccupants(cage.id) : [];
        out.push({ group: '관찰', level: 'orange', head: `${x.n}번`, body: `${x.msg}${x.span ? ` <span style="opacity:0.75;">(${x.span})</span>` : ''}`,
            actions: cage && occ.length ? [cageBtn(String(occ[0].cohort), cage.id)] : [] });
    });

    const rank = { red: 0, orange: 1, gray: 2 };
    out.sort((a, b) => rank[a.level] - rank[b.level] || String(a.head).localeCompare(String(b.head)));
    return out;
}

// ---------- 화면 ----------
const IB_GROUPS = ['사망 처리', '재실', '투약', '기록 누락', '설정 · 기준일', '관찰'];
const IB_FACE = {
    red:    'background:var(--stock-pink-soft); border:1px solid var(--stock-pink);',
    orange: 'background:var(--stock-canary-soft); border:1px solid #E3C55C;',
    gray:   'background:var(--paper); border:1px solid var(--rule);'
};
const IB_INK = { red: 'var(--stamp)', orange: '#7A5C00', gray: 'var(--ink-soft)' };

function ibRender(main) {
    if (!main.ibBound) { main.addEventListener('click', ibOnClick); main.ibBound = true; }
    const items = ibItems();
    const n = { red: 0, orange: 0, gray: 0 };
    items.forEach(i => n[i.level]++);
    const d = new Date(dbData.today + 'T00:00:00');

    const btn = a => {
        const data = Object.entries(a).filter(([k]) => k !== 'label' && k !== 'action')
            .map(([k, v]) => `data-${k}="${dbEsc(v)}"`).join(' ');
        return `<button class="db-tap" data-ib-action="${a.action}" ${data}
            style="padding:4px 10px; border-radius:2px; font-size:0.78rem; font-weight:600; cursor:pointer; background:var(--sheet); color:var(--ink-blue); border:1px solid var(--ink);">${dbEsc(a.label)}</button>`;
    };

    main.innerHTML = `
    <div class="db-sheet">
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <div class="stamp-in" style="border:2px solid var(--ink); padding:5px 12px; border-radius:2px;">
                <div style="font-size:0.66rem; letter-spacing:0.16em; color:var(--ink-soft); font-weight:700;">EXCEPTIONS</div>
                <div class="mono" style="font-size:1.12rem; font-weight:700; color:var(--ink);">${dbData.today} <span style="font-family:var(--font-ui);">(${wfDow[d.getDay()]})</span></div>
            </div>
            <div style="font-size:0.85rem; color:var(--ink-soft); line-height:1.65;">
                미처리 <b class="mono" style="color:${items.length ? 'var(--ink)' : 'var(--approve)'};">${items.length}</b>건
                ${n.red ? ` · 막힘 <b class="mono" style="color:var(--stamp);">${n.red}</b>` : ''}
                ${n.orange ? ` · 빠짐 <b class="mono" style="color:#7A5C00;">${n.orange}</b>` : ''}
                ${n.gray ? ` · 대기 <b class="mono">${n.gray}</b>` : ''}
            </div>
        </div>
        <button class="btn-small db-tap" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);" data-ib-action="refresh">새로고침</button>
    </div>
    ${!items.length ? `
    <div class="card" style="background:var(--stock-green-soft); border-color:var(--approve);">
        <span class="stamp-in" style="display:inline-block; color:var(--approve); border:2px solid var(--approve); padding:3px 10px; border-radius:2px; font-weight:800;">미처리가 없습니다</span>
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-top:8px;">진행 중 코호트의 사망 처리 · 재실 · 투약 · 체중 · 기준일 · 오늘 섭취를 점검했습니다.</div>
    </div>` : IB_GROUPS.filter(g => items.some(i => i.group === g)).map(g => `
    <div class="card">
        <h4 style="margin:0 0 8px 0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">
            ${dbEsc(g)} <span class="mono" style="font-weight:normal; font-size:0.85rem; color:var(--ink-soft);">${items.filter(i => i.group === g).length}</span>
        </h4>
        ${items.filter(i => i.group === g).map(i => `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 11px; margin-bottom:6px; border-radius:2px; ${IB_FACE[i.level]}">
            <b class="mono" style="min-width:96px; color:${IB_INK[i.level]};">${dbEsc(i.head)}</b>
            <span style="flex:1; min-width:200px; font-size:0.84rem; color:var(--ink);">${i.body}</span>
            <span style="display:flex; gap:6px;">${(i.actions || []).map(btn).join('')}</span>
        </div>`).join('')}
    </div>`).join('')}
    <div class="card" style="font-size:0.75rem; color:var(--ink-soft);">
        막힘(빨강)은 데이터가 틀어지는 중인 것, 빠짐(노랑)은 넣어야 할 기록, 대기(회색)는 때가 되면 할 것. 처리하면 다음 새로고침에서 사라집니다.
    </div>
    </div>`;
}
