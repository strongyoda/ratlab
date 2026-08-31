// ============================================================
//  대시보드 — 사이트를 열면 처음 보이는 화면
//  "지금 뭘 해야 하나"와 "조용히 망가지고 있는 게 없나"에 답한다.
//
//  일정 데이터는 앱에 없다. 그래서 여기 뜨는 것은 전부
//  이미 있는 기록에서 계산해낸 것이다 —
//  수술일 + 코호트 설정의 시점/투약 규칙, 그리고 최근 급여·체중 기록.
// ============================================================

let dbData = null;      // 한 번 읽어 화면 전체가 나눠 쓴다

const DB_WATCH_DROP_PCT = 5;    // 최근 체중이 이만큼 넘게 빠지면 살펴볼 개체
const DB_WATCH_DAYS     = 3;    // 체중을 이 일수 넘게 안 쟀으면 알림
const DB_INTAKE_DROP_PCT = 25;  // 섭취가 이만큼 줄면 알린다 (동물 상태 신호라 민감하게)
const DB_INTAKE_RISE_PCT = 40;  // 늘어난 쪽은 고염식처럼 예정된 변화가 많아 느슨하게
const DB_MIN_WATER_PC = 5;      // 마리당 mL/day. 이 아래면 비율과 무관하게 짚는다
const DB_MIN_FOOD_PC  = 2;      // 마리당 g/day
const DB_STAGE_ECHO_DAYS = 3;   // 처치 시작 며칠까지는 '예상된 변화'로 안내

async function renderDashboardView(main) {
    main.innerHTML = `<div class="card">불러오는 중...</div>`;
    try {
        await dbLoad();
        dbRender(main);
    } catch (e) {
        console.error(e);
        main.innerHTML = `<div class="card" style="color:var(--red)">불러오기 실패: ${e.message}</div>`;
    }
}

// ---------- 데이터 ----------
async function dbLoad() {
    const today = getTodayStr();
    const cutoff = dbShift(today, -14);

    const [rats, cageSnap, houseSnap, feedSnap, measSnap, cfgSnap] = await Promise.all([
        getRatsWithCache(),
        db.collection('cages').get(),
        db.collection('ratHousing').where('to', '==', null).get(),
        db.collection('cageFeeding').where('dateStr', '>=', cutoff).get(),
        db.collection('measurements').where('date', '>=', cutoff).get(),
        db.collection('cohortConfigs').get()
    ]);

    const cages = [];   cageSnap.forEach(d => cages.push(Object.assign({ id: d.id }, d.data())));
    const housing = []; houseSnap.forEach(d => housing.push(d.data()));
    const feeds = [];   feedSnap.forEach(d => feeds.push(d.data()));
    const meas = [];    measSnap.forEach(d => meas.push(d.data()));
    const configs = {}; cfgSnap.forEach(d => { configs[d.id] = d.data(); });

    // '진행 중' = 설정이 있고, 최근 2주 안에 급여 기록이 있는 코호트.
    // 끝난 코호트에 생존으로 남아 있는 개체까지 세면 경고가 옛 개체로 뒤덮인다.
    const recentCohorts = new Set(feeds.map(f => String(f.cohort)));
    const notDead = rats.filter(r => r.status !== '사망');
    const active = [...new Set(notDead.map(r => String(r.cohort)))]
        .filter(c => configs[c] && recentCohorts.has(c))
        .sort((a, b) => Number(b) - Number(a));

    // 화면 전체가 쓰는 alive 는 진행 중 코호트로 한정한다
    const alive = notDead.filter(r => active.includes(String(r.cohort)));

    dbData = { today, rats, alive, cages, housing, feeds, meas, configs, active };
}

function dbShift(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function dbDiffDays(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function dbDateOf(v) {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    if (v.toDate) { const d = v.toDate();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    return null;
}

// 이 케이지에 지금 있는 개체
function dbOccupants(cageId) {
    return dbData.housing.filter(h => String(h.cageId) === String(cageId))
        .map(h => dbData.alive.find(r => r.ratId === h.ratId))
        .filter(Boolean)
        .sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0));
}

// 코호트 설정의 W4 · D2 같은 라벨을 결찰 후 일수로 바꾼다
function dbTpDays(label) {
    const m = String(label).match(/^([WD])(\d+)$/);
    if (!m) return null;
    return m[1] === 'W' ? Number(m[2]) * 7 : Number(m[2]);
}

// ---------- 화면 ----------
function dbRender(main) {
    const todo    = dbTodo();
    const alerts  = dbAlerts();
    const watch   = dbWatchList();
    const intake  = dbIntakeIssues();
    const cohorts = dbCohortSummary();

    const d = new Date();
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

    main.innerHTML = `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
            <h3 style="margin:0;">${dbData.today} (${dow})</h3>
            <div style="font-size:0.85rem; color:#666; margin-top:4px;">
                진행 중 코호트 ${dbData.active.length}개 · 생존 ${dbData.alive.length}마리
            </div>
        </div>
        <div style="display:flex; gap:8px;">
            <button class="btn-small btn-blue" onclick="go('cageinput')">케이지별 입력</button>
            <button class="btn-small" style="background:#eee; color:#333;" onclick="go('dash')">랫드 명부</button>
            <button class="btn-small" style="background:#eee; color:#333;" onclick="renderDashboardView(document.getElementById('view_' + activeTabId))">새로고침</button>
        </div>
    </div>

    ${dbTodoCard(todo)}
    ${dbPrepCard(dbPrep())}
    ${dbAlertCard(alerts)}
    <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start;">
        <div style="flex:1; min-width:340px;">${dbWatchCard(watch)}</div>
        <div style="flex:1; min-width:340px;">${dbIntakeCard(intake)}</div>
    </div>
    ${dbCohortCard(cohorts)}
    ${dbAiCard()}`;
}

// ---------- ① 오늘 할 일 ----------
function dbTodo() {
    const { today, cages, feeds, configs } = dbData;
    const doneToday = new Set(feeds.filter(f => f.dateStr === today).map(f => String(f.cageId)));

    // 쥐가 들어 있는 케이지만 대상
    const used = cages.filter(c => dbOccupants(c.id).length > 0);
    const pending = used.filter(c => !doneToday.has(String(c.id)));

    // 오늘 투약이 시작되는 케이지 (수술일 + 오프셋으로 계산)
    const doseToday = [], doseSoon = [];
    used.forEach(cage => {
        const occ = dbOccupants(cage.id);
        if (!occ.length) return;
        const cfg = configs[String(occ[0].cohort)];
        if (!cfg || !cfg.dosing) return;
        const gkey = cage.group || ('G' + String(occ[0].group || 1).replace(/^G/, ''));
        const rule = cfg.dosing.find(x => x.medium === 'water'
            && (x.groups || []).includes(gkey) && Number(x.value) > 0);
        if (!rule) return;

        let best = null;
        occ.forEach(r => {
            const base = dbDateOf(rule.startAnchor === 'ovx' ? r.ovxDate
                       : rule.startAnchor === 'arrival' ? r.arrivalDate : r.surgeryDate);
            if (!base) return;
            const start = dbShift(base, Number(rule.startOffset) || 0);
            const dd = dbDiffDays(today, start);
            if (best === null || dd < best) best = dd;
        });
        if (best === null) return;
        if (best === 0) doseToday.push({ n: cage.number, sub: rule.substance });
        else if (best > 0 && best <= 3) doseSoon.push({ n: cage.number, sub: rule.substance, d: best });
    });

    // 오늘 예정된 MR · BP (결찰일 + 시점 라벨)
    const events = [];
    dbData.alive.forEach(r => {
        const cfg = configs[String(r.cohort)];
        const surg = dbDateOf(r.surgeryDate);
        if (!cfg || !cfg.timepoints || !surg) return;
        ['mr', 'bp'].forEach(kind => {
            (cfg.timepoints[kind] || []).forEach(tp => {
                const days = dbTpDays(tp);
                if (days === null) return;
                if (dbShift(surg, days) === today) events.push({ kind, tp, rat: r.ratId });
            });
        });
    });
    const evMr = events.filter(e => e.kind === 'mr');
    const evBp = events.filter(e => e.kind === 'bp');

    return { pending, usedCount: used.length, doneCount: doneToday.size, doseToday, doseSoon, evMr, evBp };
}

function dbTodoCard(t) {
    const chip = (txt, bg, col) => `<span style="display:inline-block; padding:3px 9px; margin:2px 4px 2px 0;
        background:${bg}; color:${col}; border-radius:11px; font-size:0.82rem; font-weight:bold;">${txt}</span>`;

    const rows = [];

    if (t.usedCount) {
        const left = t.pending.length;
        rows.push(`
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <b style="min-width:96px;">케이지 입력</b>
            <span style="font-size:1.1rem; font-weight:bold; color:${left ? 'var(--navy)' : '#2e7d32'};">
                ${t.doneCount} / ${t.usedCount}
            </span>
            ${left ? `<span style="color:#666; font-size:0.85rem;">남은 케이지</span>
                ${t.pending.slice(0, 12).map(c => chip(c.number + '번', '#e3f2fd', '#0d47a1')).join('')}
                ${left > 12 ? `<span style="color:#888; font-size:0.82rem;">외 ${left - 12}개</span>` : ''}`
              : `<span style="color:#2e7d32; font-size:0.9rem;">오늘 입력이 모두 끝났습니다</span>`}
        </div>`);
    }

    if (t.doseToday.length) rows.push(`
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <b style="min-width:96px;">오늘 투약 시작</b>
            ${t.doseToday.map(x => chip(x.n + '번 · ' + x.sub, '#e8f5e9', '#1b5e20')).join('')}
        </div>`);

    if (t.doseSoon.length) rows.push(`
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <b style="min-width:96px;">곧 투약 시작</b>
            ${t.doseSoon.map(x => chip(x.n + '번 D-' + x.d, '#fff3e0', '#e65100')).join('')}
        </div>`);

    if (t.evMr.length || t.evBp.length) rows.push(`
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <b style="min-width:96px;">오늘 예정</b>
            ${t.evMr.length ? chip('MR ' + t.evMr.length + '마리 (' + [...new Set(t.evMr.map(e => e.tp))].join(',') + ')', '#ede7f6', '#4527a0') : ''}
            ${t.evBp.length ? chip('BP ' + t.evBp.length + '마리 (' + [...new Set(t.evBp.map(e => e.tp))].join(',') + ')', '#fff8e1', '#e65100') : ''}
            <span style="color:#888; font-size:0.8rem;">결찰일 + 설정 시점으로 계산한 값입니다</span>
        </div>`);

    if (!rows.length) rows.push(`<div style="color:#888;">오늘 예정된 일이 없습니다.</div>`);

    return `
    <div class="card">
        <h4 style="margin:0 0 12px 0; color:var(--navy);">오늘 할 일</h4>
        <div style="display:flex; flex-direction:column; gap:10px;">${rows.join('')}</div>
    </div>`;
}

// ---------- ①-2 오늘 만들 원액 ----------
// 케이지별 입력 화면의 파란 카드와 같은 계산을 여기서도 한다.
// 사육실 가기 전에 실험실에서 만들어야 하므로, 첫 화면에 있어야 한다.
function dbPrep() {
    const { today, cages, feeds, configs } = dbData;
    const doneToday = new Set(feeds.filter(f => f.dateStr === today).map(f => String(f.cageId)));
    const lastFeed = {};
    feeds.forEach(f => {
        const k = String(f.cageId);
        if (!lastFeed[k] || f.dateStr > lastFeed[k].dateStr) lastFeed[k] = f;
    });

    let stock = null, sub = '원액', housing = null;
    const known = [], unknown = [];

    cages.forEach(cage => {
        if (doneToday.has(String(cage.id))) return;        // 이미 오늘 넣은 케이지는 뺀다
        const occ = dbOccupants(cage.id);
        if (!occ.length) return;
        const cfg = configs[String(occ[0].cohort)];
        if (!cfg || !cfg.dosing) return;

        const gkey = cage.group || ('G' + String(occ[0].group || 1).replace(/^G/, ''));
        const rule = cfg.dosing.find(x => x.medium === 'water'
            && (x.groups || []).includes(gkey) && Number(x.value) > 0);
        if (!rule) return;

        // 오늘이 투약 구간 안인가 (한 마리라도 시작했으면 물통을 공유하므로 전원에게 들어간다)
        const started = occ.some(r => {
            const base = dbDateOf(rule.startAnchor === 'ovx' ? r.ovxDate
                       : rule.startAnchor === 'arrival' ? r.arrivalDate : r.surgeryDate);
            if (!base) return false;
            return dbShift(base, Number(rule.startOffset) || 0) <= today;
        });
        if (!started) return;

        stock = Number(rule.stockConc) || stock;
        sub = rule.substance || sub;
        housing = cfg.housing || housing;

        // 예상 섭취량은 케이지별 입력과 똑같이 뽑는다 (global.js 의 공용 함수).
        // 주말 구간을 한쪽만 넣으면 두 화면의 '오늘 만들 원액'이 갈린다.
        const rows = feeds.filter(f => String(f.cageId) === String(cage.id))
            .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
        const pc = recentWaterPc(rows) ?? recentWaterPc(rows, { includeWeekend: true });
        const bw = (lastFeed[String(cage.id)] || {}).sumBW;

        // 필요 약물량은 채우는 물의 양에 정비례한다. 물양을 정하지 않고 계수만 모아둔다.
        // 예측 섭취량이 비정상적으로 낮은 케이지(거부·질병)는 계수가 폭주하므로
        // '기록 없음'과 같이 취급해 평균으로 메운다.
        const maxFill = Math.max(...(fillOptions(housing).length ? fillOptions(housing) : [700]));
        const item = { number: cage.number, n: occ.length, pc, bw };
        if (pc && bw && pcUsableForPrep(pc, occ.length, maxFill)) {
            item.k = Number(rule.value) * (bw / 1000) / (pc * occ.length);
            known.push(item);
        } else unknown.push(item);
    });

    if (!known.length || !stock) return null;
    const avgK = known.reduce((a, r) => a + r.k, 0) / known.length;
    const totalK = known.reduce((a, r) => a + r.k, 0) + unknown.length * avgK;
    const opts = fillOptions(housing);
    // 오늘 물을 얼마나 채울지는 사람이 정한다 (주말·연휴 앞이면 많이).
    // 앱은 달력을 모르므로 후보마다 만들 양을 적어 보여주기만 한다.
    const plans = (opts.length ? opts : [700]).map(fill => {
        const mg = (totalK < stock) ? (totalK * fill) / (1 - totalK / stock) : totalK * fill;
        return { fill, needCc: mg / stock, makeCc: makeVolume(mg / stock) };
    });
    return { sub, stock, plans, known, unknown };
}

function dbPrepCard(p) {
    // 투약이 없는 날도 칸을 비워두지 않는다. 자리가 사라지면 '오늘은 없는' 것인지
    // '화면이 잘못된' 것인지 구분이 안 된다.
    if (!p) return `
    <div class="card" style="background:#eef0f4; border:1px solid #dde1e8;">
        <div style="font-size:0.78rem; color:#777;">사육실 가기 전 · 실험실에서 만들 원액</div>
        <div style="font-size:1.05rem; font-weight:bold; color:#555; margin-top:5px;">
            오늘 투약할 케이지가 없습니다 — 만들 원액 없음
        </div>
        <div style="font-size:0.78rem; color:#999; margin-top:4px;">
            투약 구간에 들어간 케이지가 생기면 여기에 만들 양이 뜹니다.
        </div>
    </div>`;
    return `
    <div class="card" style="background:#0d47a1; color:#fff;">
        <div style="font-size:0.78rem; opacity:0.85;">사육실 가기 전 · 실험실에서 만들 ${p.sub} 원액</div>
        ${p.plans.map(x => `
        <div style="display:flex; align-items:baseline; gap:10px; margin:7px 0;">
            <span style="font-size:0.9rem; opacity:0.85; min-width:96px;">물 ${x.fill} mL 채우면</span>
            <b style="font-size:1.2rem;">가루 ${(x.makeCc * p.stock / 1000).toFixed(1)} g</b>
            <span style="font-size:0.85rem; opacity:0.9;">· 총 ${x.makeCc} mL 눈금까지</span>
        </div>`).join('')}
        <div style="font-size:0.8rem; opacity:0.9; margin-top:6px;">
            투약 케이지 ${p.known.length + p.unknown.length}개 · 원액 ${p.stock} mg/mL · 30% 여유 포함
            ${p.unknown.length ? ` · ${p.unknown.length}개(${p.unknown.map(u => u.number + '번').join(', ')})는 기록이 없거나 최근 섭취가 비정상이라 평균으로 추정` : ''}
        </div>
        <div style="font-size:0.75rem; opacity:0.75; margin-top:5px;">
            오늘 물을 얼마나 채울지에 따라 골라서 만드세요. 주말·연휴 앞이면 많이 채웁니다.
            물에 녹이는 게 아니라 가루를 넣고 눈금까지 채웁니다.
        </div>
    </div>`;
}

// ---------- ② 조용히 망가지는 것 ----------
function dbAlerts() {
    const { alive, cages, configs, feeds, meas, today } = dbData;
    const out = [];

    // 기준일이 비어 있으면 투약 시작일을 판정할 수 없다.
    // 약물마다 따로 알리면 같은 사실이 여러 번 뜨므로 기준일 단위로 묶는다.
    // 전부 비어 있으면 아직 안 한 처치일 수 있고, 일부만 비어 있으면 확실한 누락이다.
    const anchorMap = {};   // anchor -> { missing:[], total:0, subs:Set }
    alive.forEach(r => {
        const cfg = configs[String(r.cohort)];
        if (!cfg || !cfg.dosing) return;
        const gkey = 'G' + String(r.group || 1).replace(/^G/, '');
        const anchors = {};
        (cfg.dosing || []).forEach(rule => {
            if (!(rule.groups || []).includes(gkey)) return;
            (anchors[rule.startAnchor] = anchors[rule.startAnchor] || new Set()).add(rule.substance);
        });
        Object.entries(anchors).forEach(([anchor, subs]) => {
            const e = anchorMap[anchor] = anchorMap[anchor] || { missing: [], total: 0, subs: new Set() };
            e.total++;
            subs.forEach(x => e.subs.add(x));
            const have = anchor === 'ovx' ? r.ovxDate : anchor === 'arrival' ? r.arrivalDate : r.surgeryDate;
            if (!have) e.missing.push(r.ratId);
        });
    });
    Object.entries(anchorMap).forEach(([anchor, e]) => {
        if (!e.missing.length) return;
        const name = { ovx: 'OVX일', arrival: '반입일', ligation: '수술일' }[anchor] || anchor;
        const subs = [...e.subs].join(' · ');
        const all = e.missing.length === e.total;
        out.push({
            level: all ? 'orange' : 'red',
            head: `${name}이 비어 있는 개체 ${e.missing.length}마리${all ? '' : ` (${e.total}마리 중)`}`,
            body: all
                ? `아직 하지 않은 처치일 수 있습니다. 이미 했다면 「일괄 입력」에서 넣으세요 — 넣기 전까지 ${subs} 투약이 시작되지 않습니다.`
                : `같은 조건인데 일부만 비어 있습니다. 입력 누락으로 보입니다 — ${subs} 투약이 시작되지 않습니다. ${e.missing.slice(0, 10).join(', ')}${e.missing.length > 10 ? ' 외' : ''}`
        });
    });

    // 빈 통 무게 미등록 자리
    const noTare = cages.filter(c => dbOccupants(c.id).length && !(Number(c.bottleTare) > 0));
    if (noTare.length) out.push({ level: 'orange', head: `빈 통 무게가 없는 자리 ${noTare.length}개`,
        body: `코호트 기본값으로 계산되어 그 자리의 섭취량이 한 방향으로 어긋납니다. — ${noTare.map(c => c.number + '번').join(', ')}` });

    // 로스 상수 미설정 코호트
    dbData.active.forEach(c => {
        const h = (configs[c] || {}).housing || {};
        if (!(Number(h.evapPerHour) > 0) || !(Number(h.lossPerHandling) > 0))
            out.push({ level: 'orange', head: `코호트 ${c} 로스 상수 미설정`,
                body: '증발·탈착 보정 없이 섭취량이 계산됩니다.' });
    });

    // 며칠째 체중을 안 잰 개체
    const lastW = {};
    meas.forEach(m => { if (!m.weight) return;
        const d = String(m.date).slice(0, 10);
        if (!lastW[m.ratId] || d > lastW[m.ratId]) lastW[m.ratId] = d; });
    const stale = alive.filter(r => {
        const d = lastW[r.ratId];
        return !d || dbDiffDays(d, today) > DB_WATCH_DAYS;
    });
    if (stale.length) out.push({ level: 'orange', head: `체중 기록이 ${DB_WATCH_DAYS}일 넘게 없는 개체 ${stale.length}마리`,
        body: stale.slice(0, 12).map(r => r.ratId).join(', ') + (stale.length > 12 ? ' 외' : '') });

    // 오래 입력이 없는 케이지
    const lastFeed = {};
    feeds.forEach(f => { const k = String(f.cageId);
        if (!lastFeed[k] || f.dateStr > lastFeed[k]) lastFeed[k] = f.dateStr; });
    const idle = cages.filter(c => dbOccupants(c.id).length)
        .map(c => ({ c, d: lastFeed[String(c.id)] }))
        .filter(x => !x.d || dbDiffDays(x.d, today) > 4);
    if (idle.length) out.push({ level: 'orange', head: `4일 넘게 급여 기록이 없는 케이지 ${idle.length}개`,
        body: idle.map(x => `${x.c.number}번(${x.d || '기록 없음'})`).join(', ') });

    return out;
}

function dbAlertCard(list) {
    if (!list.length) return `
    <div class="card" style="background:#f1f8e9; border:1px solid #c5e1a5;">
        <b style="color:#33691e;">짚어야 할 문제가 없습니다.</b>
    </div>`;
    return `
    <div class="card">
        <h4 style="margin:0 0 10px 0; color:var(--navy);">짚어야 할 것</h4>
        ${list.map(a => `
        <div style="padding:9px 11px; margin-bottom:7px; border-radius:6px;
                    background:${a.level === 'red' ? '#ffebee' : '#fff8e1'};
                    border:1px solid ${a.level === 'red' ? '#ffcdd2' : '#ffe082'};">
            <b style="color:${a.level === 'red' ? '#b71c1c' : '#7a5c00'};">${a.head}</b>
            <div style="font-size:0.83rem; color:#555; margin-top:3px;">${a.body}</div>
        </div>`).join('')}
    </div>`;
}

// ---------- ③ 유심히 볼 개체 ----------
function dbWatchList() {
    const { alive, meas, today } = dbData;
    const byRat = {};
    meas.forEach(m => { if (!m.weight) return;
        (byRat[m.ratId] = byRat[m.ratId] || []).push({ d: String(m.date).slice(0, 10), w: Number(m.weight) }); });

    const out = [];
    alive.forEach(r => {
        const rows = (byRat[r.ratId] || []).sort((a, b) => a.d.localeCompare(b.d));
        if (rows.length < 2) return;
        const cur = rows[rows.length - 1];
        // 최근 3일 안의 최고치와 비교한다 (수술 후 감소를 잡기 위함)
        const window = rows.filter(x => dbDiffDays(x.d, cur.d) <= DB_WATCH_DAYS);
        const peak = window.reduce((a, b) => (b.w > a.w ? b : a), window[0]);
        if (peak.w <= 0 || peak.d === cur.d) return;
        const pct = (cur.w - peak.w) / peak.w * 100;
        if (pct <= -DB_WATCH_DROP_PCT)
            out.push({ id: r.ratId, cohort: r.cohort, pct, from: peak.w, to: cur.w, date: cur.d });
    });
    out.sort((a, b) => a.pct - b.pct);
    return out;
}

function dbWatchCard(list) {
    return `
    <div class="card">
        <h4 style="margin:0 0 10px 0; color:var(--navy);">살펴볼 개체</h4>
        ${!list.length ? `<div style="color:#888; font-size:0.88rem;">최근 ${DB_WATCH_DAYS}일 안에 체중이 ${DB_WATCH_DROP_PCT}% 넘게 빠진 개체가 없습니다.</div>`
        : `<div style="font-size:0.8rem; color:#888; margin-bottom:8px;">최근 ${DB_WATCH_DAYS}일 최고치 대비 ${DB_WATCH_DROP_PCT}% 이상 감소</div>
        ${list.slice(0, 10).map(w => `
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:7px 4px; border-bottom:1px solid #f0f0f0;">
            <span style="cursor:pointer; color:var(--navy); font-weight:bold;"
                  onclick="go('detail','${w.id}')">${w.id}</span>
            <span style="font-size:0.86rem; color:#555;">
                ${w.from.toFixed(0)} → ${w.to.toFixed(0)} g
                <b style="color:var(--red); margin-left:6px;">${w.pct.toFixed(1)}%</b>
            </span>
        </div>`).join('')}
        ${list.length > 10 ? `<div style="font-size:0.82rem; color:#888; margin-top:6px;">외 ${list.length - 10}마리</div>` : ''}`}
    </div>`;
}

// 이 값이 어느 시각부터 어느 시각까지의 기록인지 그대로 보여준다.
// 마리당 값은 '시간당 속도 × 24' 라, 구간이 어디를 담았는지 모르면 해석할 수 없다.
function dbSpan(row) {
    const t = row.at && row.at.toDate ? row.at.toDate() : null;
    if (!t || !(row.intervalHours > 0)) return '';
    const s = new Date(t.getTime() - row.intervalHours * 3600000);
    const f = d => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${f(s)} → ${f(t)} · ${row.intervalHours.toFixed(1)}h`;
}

// 랫드는 야행성이라 밤에 몰아 마신다. 구간이 24시간의 배수에서 벗어나면
// 밤낮 비중이 치우쳐 하루치 환산이 부풀거나 줄어든다.
function dbOffFrom24(h) {
    if (!(h > 0)) return 0;
    return Math.abs(h - Math.max(1, Math.round(h / 24)) * 24);
}
const DB_SPAN_TOL_H = 3;    // 24시간 배수에서 이만큼 넘게 벗어나면 해석에 주의

// 섭취량 비교에서 빼는 사유. '수술일'은 여기 없다 — 측정이 유효하므로 최신 값으로 쓴다.
// (섭취량 분석 화면의 IA_DROP 과 같은 기준. 어긋나면 옛 경고가 최신인 척 남는다)
const DB_DROP = ['이상', '처치일', '재실변동', '사망발생'];
const dbUsableRow = r => !(r.flags || []).some(f => DB_DROP.includes(f));

// ---------- ④ 섭취량 이상 · 주말 대비 ----------
function dbIntakeIssues() {
    const { feeds, cages, today } = dbData;
    const out = [];

    const byCage = {};
    feeds.forEach(f => (byCage[String(f.cageId)] = byCage[String(f.cageId)] || []).push(f));

    Object.entries(byCage).forEach(([cid, rows]) => {
        rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
        const cage = cages.find(c => String(c.id) === cid);
        if (!cage || !dbOccupants(cid).length) return;

        // ── 측정·기록 오류 ──────────────────────────────
        const neg = rows.find(r => typeof r.waterConsumed === 'number' && r.waterConsumed < 0);
        if (neg) out.push({ n: cage.number, kind: 'bad',
            msg: `섭취량이 음수 ${neg.waterConsumed.toFixed(1)} mL — 누수나 입력 확인`,
            span: dbSpan(neg) });

        // ── 물·사료 각각 : 평소와 얼마나 다른가 ──────────
        const stages = dbCageStages(cid);
        [['물',  '물을',  '마시지', 'waterPerCapita', 'mL', DB_MIN_WATER_PC],
         ['사료', '사료를', '먹지',   'foodPerCapita',  'g',  DB_MIN_FOOD_PC]
        ].forEach(([name, subj, verb, key, unit, floor]) => {
            const clean = rows.filter(r => dbUsableRow(r) && typeof r[key] === 'number' && r[key] >= 0);
            if (clean.length < 3) return;
            const curRow = clean[0], cur = curRow[key];
            const prevRows = clean.slice(1, 6).filter(r => r[key] > 0);
            if (!prevRows.length) return;
            const base = prevRows.reduce((a, b) => a + b[key], 0) / prevRows.length;
            if (!(base > 0)) return;

            const dev = (cur - base) / base * 100;
            const off = dbOffFrom24(curRow.intervalHours);
            const near = dbNearStage(stages, curRow);      // 처치 시작 직후인가

            let kind = null, msg = null;
            if (cur < floor) {
                // 절대 기준. 거의 안 먹거나 안 마시는 건 비율과 무관하게 봐야 한다.
                kind = 'bad';
                msg = `${subj} 거의 ${verb} 않았습니다 — 마리당 ${cur.toFixed(1)} ${unit}/day (평소 ${base.toFixed(1)})`;
            } else if (dev <= -DB_INTAKE_DROP_PCT) {
                kind = 'bad';
                msg = `${name} 섭취 감소 — 마리당 ${cur.toFixed(1)} ${unit}/day, 평소 ${base.toFixed(1)}보다 ${dev.toFixed(1)}%`;
            } else if (dev >= DB_INTAKE_RISE_PCT) {
                kind = 'warn';
                msg = `${name} 섭취 증가 — 마리당 ${cur.toFixed(1)} ${unit}/day, 평소 ${base.toFixed(1)}보다 +${dev.toFixed(1)}%`;
            }
            if (!msg) return;

            out.push({ n: cage.number, kind,
                msg,
                span: dbSpan(curRow) + ((curRow.flags || []).includes('수술일') ? ' · 수술일 구간' : ''),
                base: `비교 기준 : ${prevRows.map(r => r[key].toFixed(1)).join(' · ')} 의 평균`,
                caution: [
                    near ? `${near} 직후 구간입니다 — 예상된 변화일 수 있습니다` : '',
                    (off > DB_SPAN_TOL_H && name === '물')
                        ? `구간이 24h에서 ${off.toFixed(1)}h 벗어났습니다. 랫드는 밤에 몰아 마시므로 하루치 환산이 ${curRow.intervalHours < 24 ? '부풀' : '줄'}었을 수 있습니다` : ''
                ].filter(Boolean).join(' · ') });
        });

        // ── 주말 대비 : 채운 물로 다음 방문까지 버티는가 ──
        const latest = rows[0];
        const wclean = rows.filter(r => dbUsableRow(r) && r.waterPerCapita > 0);
        if (latest && wclean.length) {
            const dow = new Date(latest.dateStr + 'T00:00:00').getDay();
            const gap = dow === 5 ? 3 : 2;                 // 금요일이면 3일, 아니면 2일
            const occ = dbOccupants(cid).length;
            const src = wclean.slice(0, 3);
            const recent = src.reduce((a, b) => a + b.waterPerCapita, 0) / src.length;
            const need = recent * occ * gap;
            const have = Number(latest.waterGiven) || 0;
            if (have > 0 && need > have * 0.9) out.push({ n: cage.number, kind: dow === 5 ? 'bad' : 'warn',
                msg: `${gap}일치 예상 ${need.toFixed(0)} mL > 채운 ${have.toFixed(1)} mL — 마를 수 있음`,
                span: `${latest.dateStr} 채움 · 마리당 ${recent.toFixed(1)} mL/day × ${occ}마리 × ${gap}일`,
                base: `추정에 쓴 값 : ${src.map(r => r.waterPerCapita.toFixed(1)).join(' · ')}` });
        }
    });

    out.sort((a, b) => (a.kind === b.kind ? a.n - b.n : (a.kind === 'bad' ? -1 : 1)));
    return out;
}

// 이 케이지에 처치가 언제 시작됐는지 (고염식·BAPN·메트포민)
function dbCageStages(cageId) {
    const occ = dbOccupants(cageId);
    if (!occ.length) return [];
    const cfg = dbData.configs[String(occ[0].cohort)];
    if (!cfg || !cfg.dosing) return [];
    const cage = dbData.cages.find(c => String(c.id) === String(cageId)) || {};
    const gkey = cage.group || ('G' + String(occ[0].group || 1).replace(/^G/, ''));

    const out = [];
    cfg.dosing.forEach(rule => {
        if (!(rule.groups || []).includes(gkey)) return;
        let start = null;
        occ.forEach(r => {
            const base = dbDateOf(rule.startAnchor === 'ovx' ? r.ovxDate
                       : rule.startAnchor === 'arrival' ? r.arrivalDate : r.surgeryDate);
            if (!base) return;
            const d = dbShift(base, Number(rule.startOffset) || 0);
            if (!start || d < start) start = d;
        });
        if (start) out.push({ date: start, label: rule.substance });
    });
    return out;
}

// 이 구간이 처치 시작을 품고 있거나 그 직후인가.
// 고염식을 막 넣은 날 섭취가 흔들리는 건 이상이 아니라 예정된 일이다.
function dbNearStage(stages, row) {
    if (!stages.length || !row.dateStr) return null;
    const from = row.intervalHours
        ? dbShift(row.dateStr, -Math.ceil(row.intervalHours / 24)) : row.dateStr;
    const hit = stages.find(st => st.date >= from
        && dbDiffDays(st.date, row.dateStr) <= DB_STAGE_ECHO_DAYS);
    return hit ? `${hit.label} 시작(${hit.date})` : null;
}

function dbIntakeCard(list) {
    if (!list.length) return `
    <div class="card">
        <h4 style="margin:0 0 10px 0; color:var(--navy);">섭취량 점검</h4>
        <div style="color:#888; font-size:0.88rem;">이상이 감지된 케이지가 없습니다.</div>
    </div>`;

    // 케이지가 24개까지 늘어나므로 기본은 한 줄. 누르면 근거를 펼친다.
    const bad = list.filter(x => x.kind === 'bad').length;
    return `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h4 style="margin:0; color:var(--navy);">섭취량 점검</h4>
            <span style="font-size:0.8rem; color:#888;">
                ${list.length}건${bad ? ` · 확인 필요 ${bad}건` : ''} · 줄을 누르면 근거가 열립니다
            </span>
        </div>
        ${list.map((x, i) => `
        <div onclick="dbToggleRow(${i})" style="cursor:pointer; padding:6px 4px; border-bottom:1px solid #f0f0f0;">
            <div style="display:flex; gap:9px; align-items:baseline;">
                <b style="color:${x.kind === 'bad' ? 'var(--red)' : '#e65100'}; min-width:44px;">${x.n}번</b>
                <span style="font-size:0.85rem; color:#333; flex:1;">${x.msg}</span>
                <span id="db-caret-${i}" style="color:#bbb; font-size:0.75rem;">▾</span>
            </div>
            <div id="db-detail-${i}" style="display:none; margin:5px 0 3px 53px;">
                ${x.span ? `<div style="font-size:0.78rem; color:#888;">${x.span}</div>` : ''}
                ${x.base ? `<div style="font-size:0.78rem; color:#888;">${x.base}</div>` : ''}
                ${x.caution ? `<div style="font-size:0.78rem; color:#e65100; margin-top:3px;">${x.caution}</div>` : ''}
            </div>
        </div>`).join('')}
    </div>`;
}

function dbToggleRow(i) {
    const d = document.getElementById('db-detail-' + i);
    const c = document.getElementById('db-caret-' + i);
    if (!d) return;
    const open = d.style.display !== 'none';
    d.style.display = open ? 'none' : 'block';
    if (c) c.textContent = open ? '▾' : '▴';
}

// ---------- ⑤-1 코호트가 어디까지 왔나 ----------
// 굵직한 단계를 기록에서 뽑아낸다. OVX·결찰은 개체의 날짜에서,
// 고염식·BAPN·메트포민은 그 날짜 + 코호트 설정의 오프셋에서 계산한다.
function dbStages(cohort) {
    const { alive, configs, today } = dbData;
    const cfg = configs[cohort] || {};
    const mine = alive.filter(r => String(r.cohort) === cohort);
    if (!mine.length) return [];

    const out = [];
    const anchorDate = (r, anchor) => dbDateOf(
        anchor === 'ovx' ? r.ovxDate : anchor === 'arrival' ? r.arrivalDate : r.surgeryDate);

    // 수술 단계 : 날짜가 채워졌는지로 판단
    [['ovx', 'OVX'], ['ligation', '결찰']].forEach(([anchor, label]) => {
        const done = mine.filter(r => anchorDate(r, anchor));
        if (!done.length) { out.push({ label, state: 'wait', text: '예정' }); return; }
        const first = done.map(r => anchorDate(r, anchor)).sort()[0];
        const partial = done.length < mine.length;
        out.push({ label, state: partial ? 'partial' : 'done',
            text: partial ? `${done.length}/${mine.length}마리 · ${first}` : `완료 ${first}` });
    });

    // 투여 단계 : 군마다 규칙이 다르면 따로 보여준다
    const bySub = {};
    (cfg.dosing || []).forEach(rule => (bySub[rule.substance] = bySub[rule.substance] || []).push(rule));
    Object.entries(bySub).forEach(([sub, rules]) => {
        rules.forEach(rule => {
            const gs = rule.groups || [];
            const target = mine.filter(r => gs.includes('G' + String(r.group || 1).replace(/^G/, '')));
            if (!target.length) return;
            // 가장 먼저 시작하는 개체 기준
            let start = null;
            target.forEach(r => {
                const base = anchorDate(r, rule.startAnchor);
                if (!base) return;
                const d = dbShift(base, Number(rule.startOffset) || 0);
                if (!start || d < start) start = d;
            });
            const label = rules.length > 1 ? `${sub} ${gs.join('·')}` : sub;
            if (!start) {
                // 기준이 되는 처치를 아직 안 했을 뿐인 경우가 대부분이다
                const an = { ovx: 'OVX', arrival: '반입', ligation: '결찰' }[rule.startAnchor] || rule.startAnchor;
                out.push({ label, state: 'wait', text: `${an} 후 시작` });
                return;
            }
            const diff = dbDiffDays(start, today);
            out.push(diff >= 0
                ? { label, state: 'on',   text: `진행 중 D+${diff}` }
                : { label, state: 'wait', text: `D${diff} (${start})` });
        });
    });
    return out;
}

// ---------- ⑤ 진행 중 코호트 ----------
function dbCohortSummary() {
    const { rats, alive, feeds, configs, active, today } = dbData;
    return active.map(c => {
        const all = rats.filter(r => String(r.cohort) === c);
        const liveOnes = alive.filter(r => String(r.cohort) === c);
        const cfg = configs[c] || {};

        // POD 범위 (수술일이 있는 개체 기준)
        const pods = liveOnes.map(r => dbDateOf(r.surgeryDate))
            .filter(Boolean).map(d => dbDiffDays(d, today));
        const podTxt = pods.length ? (Math.min(...pods) === Math.max(...pods)
            ? `POD ${Math.min(...pods)}` : `POD ${Math.min(...pods)}~${Math.max(...pods)}`) : '수술 전';

        // 군별 최근 마리당 음수·사료
        const rows = feeds.filter(f => String(f.cohort) === c
            && !(f.flags || []).some(x => ['이상', '처치일', '재실변동', '사망발생'].includes(x)));
        const byGroup = {};
        rows.forEach(f => {
            const g = f.group || '미지정';
            (byGroup[g] = byGroup[g] || { w: [], f: [] });
            if (typeof f.waterPerCapita === 'number' && f.waterPerCapita > 0) byGroup[g].w.push(f.waterPerCapita);
            if (typeof f.foodPerCapita === 'number' && f.foodPerCapita > 0) byGroup[g].f.push(f.foodPerCapita);
        });
        const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
        const groups = Object.entries(byGroup).sort().map(([g, v]) => ({
            g, water: avg(v.w), food: avg(v.f), n: v.w.length
        }));

        return { cohort: c, total: all.length, alive: liveOnes.length, podTxt,
                 memo: cfg.memo || '', groups, stages: dbStages(c) };
    });
}

function dbCohortCard(list) {
    if (!list.length) return '';
    return `
    <div class="card">
        <h4 style="margin:0 0 10px 0; color:var(--navy);">진행 중 코호트</h4>
        <div style="font-size:0.8rem; color:#888; margin-bottom:9px;">
            최근 2주 기록 기준 · 제외 구간(이상 · MR/BP · 재실변동 · 사망)은 빼고 평균냈습니다
        </div>
        ${list.map(c => `
        <div style="padding:10px 0; border-top:1px solid #f0f0f0;">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                <b style="font-size:1.02rem; color:var(--navy); cursor:pointer;"
                   onclick="go('cohort')">Cohort ${c.cohort}</b>
                <span style="font-size:0.85rem; color:#555;">생존 ${c.alive} / ${c.total}</span>
                <span style="font-size:0.85rem; color:#666;">${c.podTxt}</span>
            </div>
            ${c.stages.length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                ${c.stages.map(st => {
                    const col = st.state === 'on' ? ['#e4f2f4', '#00697a']
                              : st.state === 'done' ? ['#eef1f6', '#3b4a63']
                              : st.state === 'partial' ? ['#fff3e0', '#e65100']
                              : ['#f6f7f9', '#999'];
                    return `<span style="padding:4px 10px; background:${col[0]}; color:${col[1]};
                        border-radius:12px; font-size:0.8rem;">
                        <b>${st.label}</b> <span style="opacity:0.85;">${st.text}</span></span>`;
                }).join('')}
            </div>` : ''}
            ${c.groups.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${c.groups.map(g => `
                <div style="padding:6px 11px; background:#f7f8fa; border:1px solid #e6e9ef; border-radius:6px;">
                    <b style="font-size:0.85rem; color:var(--navy);">${g.g}</b>
                    <span style="font-size:0.83rem; color:#555; margin-left:7px;">
                        물 ${g.water !== null ? g.water.toFixed(1) : '-'} · 사료 ${g.food !== null ? g.food.toFixed(1) : '-'}
                        <span style="color:#999;">/마리·일</span>
                    </span>
                </div>`).join('')}
            </div>` : `<div style="font-size:0.84rem; color:#999;">최근 급여 기록이 없습니다.</div>`}
        </div>`).join('')}
    </div>`;
}


// ---------- 어시스턴트 ----------
// 떠 있는 챗봇 버튼은 아무도 안 눌렀다. 매일 여는 첫 화면에 칸으로 상주시킨다.
// 파이프라인은 ai_assistant.js 그대로 — 데이터 조회 + 운영지침 근거 절차 답변.
function dbAiCard() {
    if (typeof sendAiMessageFrom !== 'function') return '';
    const chip = q => `<button onclick="dbAiAsk('${q}')"
        style="border:1px solid #cfd8dc; background:#f7f9fa; border-radius:14px; padding:4px 11px;
               font-size:0.78rem; color:#455a64; cursor:pointer;">${q}</button>`;
    return `
    <div class="card">
        <h4 style="margin:0 0 4px 0; color:var(--navy);">어시스턴트</h4>
        <div style="font-size:0.78rem; color:#888; margin-bottom:9px;">
            데이터를 찾아주고, 절차는 운영지침에 근거해 답합니다. 투약량 계산은 하지 않습니다 — 그건 조제 지시 카드가 정확합니다.
        </div>
        <div id="db-ai-messages" style="max-height:260px; overflow-y:auto; margin-bottom:9px;"></div>
        <div style="display:flex; gap:7px;">
            <input type="text" id="db-ai-input" placeholder="예: 최근 체중 많이 빠진 애 / 사료 오늘 갈아야 해?"
                   style="flex:1; height:40px; padding:0 11px; border:1px solid #ccc; border-radius:6px;"
                   onkeypress="if(event.key==='Enter') sendAiMessageFrom('db-ai-input','db-ai-messages')">
            <button class="btn-small btn-blue" style="height:40px; padding:0 16px;"
                    onclick="sendAiMessageFrom('db-ai-input','db-ai-messages')">질문</button>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
            ${chip('체중 많이 빠진 애 5마리')}
            ${chip('사료는 언제 갈아?')}
            ${chip('물통 번호가 지워졌어')}
            ${chip('체중만 재는 날 뭐 체크해?')}
        </div>
    </div>`;
}

function dbAiAsk(q) {
    const inp = document.getElementById('db-ai-input');
    if (!inp) return;
    inp.value = q;
    sendAiMessageFrom('db-ai-input', 'db-ai-messages');
}
