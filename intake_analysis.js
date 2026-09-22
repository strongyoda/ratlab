// ============================================================
//  섭취량 · 투여량 분석
//  - 케이지가 측정 단위다. 물통 하나를 여러 마리가 나눠 마시므로
//    개체별 섭취량은 원리적으로 알 수 없다. 그래서 통계도 케이지 단위(n = 케이지 수).
//  - 투여량은 나누기 가정 없이 "케이지가 먹은 총 약물 ÷ 케이지 총 체중"으로 계산.
// ============================================================

let iaCohort = null;
let iaConfig = null;
let iaRows = [];      // cageFeeding 기록
let iaByCage = {};    // 케이지별 구간 (통계에 쓴 것만)
let iaAllByCage = {}; // 케이지별 구간 (제외된 것까지 — 그래프는 회색 점으로 같이 보여준다)
let iaCharts = {};    // 열어 둔 그래프
let iaRats = [];      // 이 코호트 개체 (처치 시작일 계산용)
let iaYMax = null;    // 케이지끼리 비교되게 세로축을 통일한다
let iaCages = {};     // cageId -> {group, cohort}
let iaWeights = {};   // ratId -> [{date, weight}]

async function renderIntakeView(main) {
    main.innerHTML = `
    <div class="card">
        <h3 style="margin:0 0 12px 0; border-bottom:3px double var(--ink); padding-bottom:6px;">섭취량 · 투여량</h3>
        <div style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:12px;">
            물통을 여러 마리가 나눠 쓰므로 <b>케이지가 측정 단위</b>입니다.
            개체별 값은 추정치이고, 통계는 케이지 수를 n으로 씁니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-weight:bold; color:var(--navy);">코호트</label>
            <select id="ia-cohort-sel" style="width:auto; min-width:130px; padding:8px; border-radius:2px; border:1px solid #C9C5B8;">
                <option>로딩 중...</option>
            </select>
            <button class="btn-small btn-blue" onclick="iaLoad()">분석</button>
        </div>
    </div>
    <div id="ia-body"></div>`;

    const sel = document.getElementById('ia-cohort-sel');
    try {
        const rats = await getRatsWithCache();
        const nums = Array.from(new Set(rats.map(r => String(r.cohort)).filter(Boolean)))
            .sort((a, b) => Number(b) - Number(a));
        sel.innerHTML = nums.map(n => `<option value="${n}">코호트 ${n}</option>`).join('');
    } catch (e) { sel.innerHTML = '<option value="">불러오기 실패</option>'; }
}

async function iaLoad() {
    const sel = document.getElementById('ia-cohort-sel');
    if (!sel || !sel.value) return alert('코호트를 선택하세요.');
    iaCohort = sel.value;
    const body = document.getElementById('ia-body');
    body.innerHTML = '<div class="card">불러오는 중...</div>';

    try {
        const [feedSnap, cageSnap, cfg, rats] = await Promise.all([
            db.collection('cageFeeding').where('cohort', '==', String(iaCohort)).get(),
            db.collection('cages').get(),
            getCohortConfig(iaCohort),
            getRatsWithCache()
        ]);

        iaConfig = cfg;
        iaRows = [];
        feedSnap.forEach(d => iaRows.push(d.data()));
        iaRows.sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));

        iaCages = {};
        cageSnap.forEach(d => { iaCages[d.id] = d.data(); });

        // 케이지별 총 체중을 구하려면 그날 체중이 필요하다
        const cohortRats = rats.filter(r => String(r.cohort) === String(iaCohort));
        iaRats = cohortRats;
        iaWeights = {};
        const measSnap = await db.collection('measurements').where('date', '>=', '2000-01-01').get();
        measSnap.forEach(d => {
            const v = d.data();
            if (!v.weight || !cohortRats.some(r => r.ratId === v.ratId)) return;
            (iaWeights[v.ratId] = iaWeights[v.ratId] || []).push({ date: v.date, weight: Number(v.weight) });
        });

        iaRender();
    } catch (e) {
        console.error(e);
        body.innerHTML = `<div class="card" style="color:red">불러오기 실패: ${e.message}</div>`;
    }
}

// 섭취량 통계에서 빼는 사유. '수술일'은 여기 없다 —
// 물통을 우리가 다뤄 측정이 유효하므로, 수술 후 섭취가 얼마나 줄었는지도 데이터다.
// (약물 지시량 산정에서만 빠진다. cage_input 쪽에서 따로 거른다)
const IA_DROP = ['이상', '처치일', '재실변동', '사망발생'];

function iaUsable(r) {
    return typeof r.waterPerCapita === 'number' && r.waterPerCapita > 0
        && !(r.flags || []).some(f => IA_DROP.includes(f));
}

function iaGroupOf(row) {
    // 기록에 저장된 군이 우선이다. 케이지의 현재 군은 비우면 해제되고
    // 나중에 다른 군이 쓸 수도 있으므로 과거 기록의 근거가 못 된다.
    if (row.group) return row.group;
    const cage = iaCages[String(row.cageId)];
    if (cage && cage.group) return cage.group;
    return '미지정';
}

function iaGroupName(key) {
    if (iaConfig && iaConfig.groups) {
        const g = iaConfig.groups.find(x => x.key === key);
        if (g) return g.name;
    }
    return key;
}

// 평균 ± 표준편차
function iaStat(arr) {
    if (!arr.length) return null;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (arr.length === 1) return { mean: m, sd: 0, n: 1 };
    const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
    return { mean: m, sd: Math.sqrt(v), n: arr.length };
}
const iaFmt = (s, d = 1) => s ? `${s.mean.toFixed(d)} ± ${s.sd.toFixed(d)}` : '-';

// 이 구간에 실제로 들어간 메트포민 (mg/kg/day). 투약 전이거나 계산 불가면 null.
// iaRender가 붙여둔 __conc(구간 시작 시점의 물통 농도)를 쓴다.
function iaMetDose(r) {
    if (!(r.__conc > 0) || typeof r.waterConsumed !== 'number') return null;
    const bw = iaCageBW(r);
    const days = r.animalDays / (r.ratCount || 1);
    if (!bw || !(days > 0)) return null;
    return r.__conc * r.waterConsumed / (bw / 1000) / days;
}

// 사료 속 물질의 실제 투여량 (mg/kg/day)
// 케이지 총 체중으로 나누므로 개체 배분 가정이 없다.
function iaFoodDose(row, mgPerG) {
    if (typeof row.foodPerCapita !== 'number' || !row.ratCount) return null;
    const totalFood = row.foodPerCapita * row.animalDays;      // 구간 전체 사료 섭취(g)
    const days = row.animalDays / row.ratCount;
    const bw = iaCageBW(row);
    if (!bw || !days) return null;
    return (totalFood * mgPerG) / (bw / 1000) / days;
}

// 그 구간의 케이지 총 체중(g). 기록된 체중 중 구간에 가장 가까운 값을 쓴다.
function iaCageBW(row) {
    if (!row.ratIds || !row.ratIds.length) return null;
    let sum = 0, found = 0;
    row.ratIds.forEach(id => {
        const list = iaWeights[id];
        if (!list || !list.length) return;
        let best = null, bestDiff = Infinity;
        list.forEach(w => {
            const diff = Math.abs(new Date(w.date) - new Date(row.dateStr));
            if (diff < bestDiff) { bestDiff = diff; best = w; }
        });
        if (best) { sum += best.weight; found++; }
    });
    return found === row.ratIds.length ? sum : null;
}

function iaRender() {
    const body = document.getElementById('ia-body');
    if (!iaRows.length) {
        body.innerHTML = `<div class="card" style="color:var(--ink-soft);">
            이 코호트의 급여 기록이 없습니다. <b>케이지별 입력</b>에서 먼저 기록해주세요.</div>`;
        return;
    }

    const usable = iaRows.filter(iaUsable);
    const excluded = iaRows.length - usable.length;

    // 이 구간에 마신 물은 '지난 방문이 끝난 뒤 물통에 있던' 물이다.
    // 직전 행의 doseMg만 보면 안 된다 — 물을 안 간 날(그대로 둠)은 doseMg가 0이지만
    // 통 안에는 그 전에 탄 약물이 그대로 남아 있다. 그래서 농도를 케이지별로
    // 끌고 다니며, 물을 새로 간 방문에서만 갱신한다.
    // (이 버그로 '그대로 둠' 다음 구간의 투여량이 전부 0으로 잡혔었다)
    const concByCage = {};
    iaRows.forEach(r => {                  // iaRows는 시간순 정렬됨
        const c = String(r.cageId);
        r.__conc = concByCage[c] || 0;     // 이 구간에 마신 물의 농도 (mg/mL)
        const kept = (r.noWater !== undefined && r.noWater !== null) ? !!r.noWater : !!r.noRefill;
        if (!kept && Number(r.waterGiven) > 0) {
            // waterGiven은 물 + 원액 총량 (fillWater가 있는 기록부터). 옛 기록은 물만이라 원액을 더한다.
            const totalVol = (typeof r.fillWater === 'number')
                ? Number(r.waterGiven)
                : Number(r.waterGiven) + (Number(r.doseCc) || 0);
            concByCage[c] = (Number(r.doseMg) || 0) / totalVol;
        }
    });

    // 군별로 케이지 평균을 낸 뒤, 그 케이지 값들로 통계 (n = 케이지 수)
    const byGroup = {};
    usable.forEach(r => {
        const g = iaGroupOf(r);
        byGroup[g] = byGroup[g] || {};
        const c = String(r.cageId);
        byGroup[g][c] = byGroup[g][c] || { water: [], food: [], met: [], bapn: [], nacl: [] };
        byGroup[g][c].water.push(r.waterPerCapita);
        if (typeof r.foodPerCapita === 'number') byGroup[g][c].food.push(r.foodPerCapita);

        // 메트포민: 실제로 마신 물 × 구간 시작 시점의 물통 농도 ÷ 케이지 총 체중
        const md = iaMetDose(r);
        if (md !== null) byGroup[g][c].met.push(md);
        // 사료 속 물질
        (iaConfig && iaConfig.dosing || []).filter(d => d.medium === 'food').forEach(d => {
            if (!(d.groups || []).includes(g)) return;
            const v = iaFoodDose(r, Number(d.value) * 10);   // % → mg/g
            if (v === null) return;
            if (/BAPN/i.test(d.substance)) byGroup[g][c].bapn.push(v);
            else if (/NaCl|염/i.test(d.substance)) byGroup[g][c].nacl.push(v);
        });
    });

    const groupKeys = Object.keys(byGroup).sort();
    const cageMean = (obj, key) => {
        const vals = Object.values(obj).map(c => c[key].length ? c[key].reduce((a, b) => a + b, 0) / c[key].length : null)
            .filter(v => v !== null);
        return iaStat(vals);
    };

    const rowsHtml = groupKeys.map(g => {
        const cages = byGroup[g];
        const nCages = Object.keys(cages).length;
        const w = cageMean(cages, 'water'), f = cageMean(cages, 'food');
        const m = cageMean(cages, 'met'), b = cageMean(cages, 'bapn'), s = cageMean(cages, 'nacl');
        return `<tr>
            <td style="padding:8px; font-weight:bold;">${iaGroupName(g)}<br><span style="font-size:0.75rem; color:var(--ink-soft);">${g} · 케이지 ${nCages}개</span></td>
            <td style="padding:8px; text-align:center;">${iaFmt(w, 0)}</td>
            <td style="padding:8px; text-align:center;">${iaFmt(f, 1)}</td>
            <td style="padding:8px; text-align:center; color:var(--ink-blue); font-weight:bold;">${m ? iaFmt(m, 0) : '-'}</td>
            <td style="padding:8px; text-align:center;">${b ? iaFmt(b, 1) : '-'}</td>
            <td style="padding:8px; text-align:center;">${s ? iaFmt(s, 0) : '-'}</td>
        </tr>`;
    }).join('');

    // 목표 대비 도달률 — 물 투약 규칙이 군마다 따로 있으므로(G2 조기·G3 후기)
    // 규칙 하나만 찾으면 나머지 군의 도달률이 표시되지 않는다. 군별로 규칙을 매칭한다.
    const waterRules = ((iaConfig && iaConfig.dosing) || []).filter(d => d.medium === 'water');
    const metRule = waterRules[0] || null;   // 문장 생성 등에서 대표로 쓰는 규칙
    let achievedHtml = '';
    if (waterRules.length) {
        const parts = groupKeys.map(g => {
            const rule = waterRules.find(d => (d.groups || []).includes(g));
            if (!rule) return null;
            const m = cageMean(byGroup[g], 'met');
            if (!m) return null;
            const pct = (m.mean / Number(rule.value)) * 100;
            const off = Math.abs(pct - 100) > 15;
            return `<div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid #eee;">
                <span>${iaGroupName(g)}</span>
                <span><b style="color:${off ? 'var(--red)' : 'var(--approve)'};">${m.mean.toFixed(0)}</b>
                <span style="color:var(--ink-soft);"> / 목표 ${rule.value} mg/kg/day (${pct.toFixed(0)}%)</span></span>
            </div>`;
        }).filter(Boolean).join('');
        if (parts) achievedHtml = `
        <div class="card">
            <h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">${waterRules[0].substance} 목표 대비 실제 도달</h4>
            ${parts}
            <div style="font-size:0.78rem; color:var(--ink-soft); margin-top:8px;">
                실제 마신 물의 양으로 역산한 값입니다. 목표에서 15% 이상 벗어나면 빨갛게 표시됩니다.
            </div>
            <div style="height:230px; margin-top:14px;"><canvas id="ia-met-chart"></canvas></div>
            <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
                선은 군의 케이지 평균, 옅은 띠는 그날 케이지들의 최소~최대입니다.
                띠가 넓으면 같은 군 안에서도 케이지마다 들어간 양이 달랐다는 뜻입니다.
            </div>
        </div>`;
    }

    body.innerHTML = `
    <div class="card">
        <h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">군별 요약</h4>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead><tr style="">
                <th style="padding:8px; text-align:left;">군</th>
                <th style="padding:8px;">물<br><span style="font-weight:normal; font-size:0.75rem;">mL/day/마리</span></th>
                <th style="padding:8px;">사료<br><span style="font-weight:normal; font-size:0.75rem;">g/day/마리</span></th>
                <th style="padding:8px;">Metformin<br><span style="font-weight:normal; font-size:0.75rem;">mg/kg/day</span></th>
                <th style="padding:8px;">BAPN<br><span style="font-weight:normal; font-size:0.75rem;">mg/kg/day</span></th>
                <th style="padding:8px;">NaCl<br><span style="font-weight:normal; font-size:0.75rem;">mg/kg/day</span></th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        </div>
        <div style="font-size:0.78rem; color:var(--ink-soft); margin-top:10px;">
            평균 ± 표준편차 · <b>n = 케이지 수</b> (케이지별 평균을 낸 뒤 군 통계)
        </div>
    </div>

    ${achievedHtml}

    <div class="card">
        <h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">구간 사용 현황</h4>
        <div style="font-size:0.88rem;">
            전체 ${iaRows.length}구간 중 <b style="color:var(--approve);">${usable.length}구간 사용</b>,
            <b style="color:var(--red);">${excluded}구간 제외</b>
        </div>
        ${excluded ? `<div style="margin-top:8px; font-size:0.82rem; color:var(--ink-soft);">
            제외 사유: ${iaExcludeReasons()}
        </div>` : ''}
    </div>

    ${iaCageTable(usable)}`;

    // 표를 그린 뒤에 캔버스가 생기므로 그래프는 여기서 그린다
    iaDrawMetGroupChart(usable);
}

// ---------- 메트포민(물 투약) 그래프 ----------
// 물·사료와 같은 그림에 겹치면 세로축이 셋이 되어 못 읽는다.
// 그래서 군 단위는 이 카드에, 케이지 단위는 케이지 그래프 아래에 따로 그린다.
const IA_MET_COLORS = ['#00697a', '#b8860b', '#7b5aa6', '#c0504d', '#4a7c59'];
let iaMetChart = null;

// 이 군에 적용되는 물 투약 규칙
function iaWaterRuleOf(gkey) {
    return ((iaConfig && iaConfig.dosing) || [])
        .find(d => d.medium === 'water' && (d.groups || []).includes(gkey) && Number(d.value) > 0) || null;
}

function iaDrawMetGroupChart(usable) {
    const cv = document.getElementById('ia-met-chart');
    if (!cv || typeof Chart === 'undefined') return;
    if (iaMetChart) { iaMetChart.destroy(); iaMetChart = null; }

    // 군 → 날짜 → 그날 케이지들의 도달 용량
    const byGroup = {};
    usable.forEach(r => {
        const md = iaMetDose(r);
        if (md === null) return;
        const g = iaGroupOf(r);
        byGroup[g] = byGroup[g] || {};
        (byGroup[g][r.dateStr] = byGroup[g][r.dateStr] || []).push(md);
    });
    const groups = Object.keys(byGroup).sort();
    if (!groups.length) { cv.parentElement.style.display = 'none'; return; }

    const labels = [...new Set(usable.map(r => r.dateStr))].sort()
        .filter(d => groups.some(g => byGroup[g][d]));
    if (labels.length < 2) { cv.parentElement.style.display = 'none'; return; }

    const datasets = [];
    let target = null;
    groups.forEach((g, i) => {
        const col = IA_MET_COLORS[i % IA_MET_COLORS.length];
        const at = d => byGroup[g][d] || null;
        const mean = labels.map(d => { const v = at(d); return v ? v.reduce((a, b) => a + b, 0) / v.length : null; });
        const hi = labels.map(d => { const v = at(d); return v && v.length > 1 ? Math.max(...v) : null; });
        const lo = labels.map(d => { const v = at(d); return v && v.length > 1 ? Math.min(...v) : null; });
        const rule = iaWaterRuleOf(g);
        if (rule && target === null) target = Number(rule.value);
        // 케이지가 둘 이상인 군만 최소~최대 띠를 깐다 (한 케이지면 선과 겹쳐 의미가 없다)
        if (hi.some(v => v !== null)) {
            datasets.push({ label: '_hi' + g, data: hi, borderColor: 'transparent',
                backgroundColor: col + '26', pointRadius: 0, fill: '+1', tension: 0.2, spanGaps: true });
            datasets.push({ label: '_lo' + g, data: lo, borderColor: 'transparent',
                backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0.2, spanGaps: true });
        }
        datasets.push({ label: iaGroupName(g), data: mean, borderColor: col, backgroundColor: col,
            borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true });
    });
    if (target) datasets.push({ label: `목표 ${target}`, data: labels.map(() => target),
        borderColor: '#5B5F66', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false });

    cv.parentElement.style.display = '';
    iaMetChart = new Chart(cv.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { boxWidth: 12, font: { size: 11 },
                                    filter: it => !String(it.text).startsWith('_') } },
                tooltip: { filter: it => !String(it.dataset.label).startsWith('_'),
                           callbacks: { afterBody: items => {
                               const d = labels[items[0].dataIndex];
                               return groups.map(g => {
                                   const v = byGroup[g][d];
                                   return v ? `${iaGroupName(g)} 케이지 ${v.length}개` : null;
                               }).filter(Boolean).join(' · ');
                           } } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'mg/kg·일' },
                     grid: { color: '#f0f0f0' } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function iaExcludeReasons() {
    const counts = {};
    iaRows.filter(r => !iaUsable(r)).forEach(r => {
        const fl = (r.flags || []);
        if (fl.length) fl.forEach(f => counts[f] = (counts[f] || 0) + 1);
        else counts['첫 기록 또는 섭취량 미계산'] = (counts['첫 기록 또는 섭취량 미계산'] || 0) + 1;
    });
    return Object.entries(counts).map(([k, v]) => `${k} ${v}건`).join(' · ');
}

function iaCageTable(usable) {
    const byCage = {};
    usable.forEach(r => {
        const c = String(r.cageId);
        byCage[c] = byCage[c] || [];
        byCage[c].push(r);
    });
    const keys = Object.keys(byCage).sort((a, b) => Number(a) - Number(b));
    if (!keys.length) return '';

    iaByCage = byCage;      // 그래프에서 다시 쓴다

    // 그래프는 제외 구간도 회색 점으로 그린다 — 값이 있으면 가로축에는 있어야
    // "그날 기록이 없었다"와 "있었지만 뺐다"가 구분된다. 통계에는 여전히 안 들어간다.
    iaAllByCage = {};
    iaRows.forEach(r => {
        if (typeof r.waterPerCapita !== 'number') return;
        const c = String(r.cageId);
        (iaAllByCage[c] = iaAllByCage[c] || []).push(r);
    });

    // 케이지끼리 눈으로 비교할 수 있게 세로축을 하나로 통일한다.
    // 가장 큰 케이지에 맞추고 10% 여유를 준 뒤 보기 좋은 눈금으로 올린다.
    // 제외 구간 값도 보이게 넣되, 누수 같은 터무니없는 값 하나가 모든 케이지의
    // 눈금을 납작하게 만들지 않도록 사용 구간 최대의 2배까지만 따라간다.
    const round = (v, step) => Math.max(step, Math.ceil(v * 1.1 / step) * step);
    let wMax = 0, fMax = 0, mMax = 0, wOut = 0, fOut = 0, mOut = 0;
    usable.forEach(r => {
        if (typeof r.waterPerCapita === 'number') wMax = Math.max(wMax, r.waterPerCapita);
        if (typeof r.foodPerCapita === 'number') fMax = Math.max(fMax, r.foodPerCapita);
        const md = iaMetDose(r); if (md !== null) mMax = Math.max(mMax, md);
    });
    iaRows.filter(r => !iaUsable(r)).forEach(r => {
        if (typeof r.waterPerCapita === 'number') wOut = Math.max(wOut, r.waterPerCapita);
        if (typeof r.foodPerCapita === 'number') fOut = Math.max(fOut, r.foodPerCapita);
        const md = iaMetDose(r); if (md !== null) mOut = Math.max(mOut, md);
    });
    wMax = Math.max(wMax, Math.min(wOut, wMax * 2));
    fMax = Math.max(fMax, Math.min(fOut, fMax * 2));
    mMax = Math.max(mMax, Math.min(mOut, mMax * 2));
    iaYMax = { water: round(wMax, 10), food: round(fMax, 5), met: round(mMax, 50) };

    const rows = keys.map(c => {
        const list = byCage[c];
        const w = iaStat(list.map(r => r.waterPerCapita));
        const f = iaStat(list.map(r => r.foodPerCapita).filter(v => typeof v === 'number'));
        const g = iaGroupOf(list[0]);
        const doses = list.map(iaMetDose).filter(v => v !== null);   // list는 시간순 → 마지막이 최근
        const m = iaStat(doses);
        const latest = doses.length ? doses[doses.length - 1] : null;
        // '최근'은 마지막 계산 가능 구간 하나다. 며칠짜리인지 화면만 봐서는 알 수 없어
        // (주말이면 3일 치) 구간의 끝 날짜를 같이 적는다.
        let latestRow = null;
        for (let i = list.length - 1; i >= 0; i--) {
            if (iaMetDose(list[i]) !== null) { latestRow = list[i]; break; }
        }
        const latestLabel = latestRow && latestRow.dateStr
            ? `~${String(latestRow.dateStr).slice(5).replace('-', '/')}` : '최근';
        // 이 케이지 군의 목표 용량 — 최근 구간이 목표의 몇 %인지 보여준다.
        // 평균 ± 표준편차는 초기 사고 구간(과다·미달)이 섞여 폭만 커 보이고,
        // 지금 잘 맞고 있는지는 최근 구간이 말해준다.
        const rule = ((iaConfig && iaConfig.dosing) || [])
            .find(d => d.medium === 'water' && (d.groups || []).includes(g) && Number(d.value) > 0);
        return `<tr onclick="iaToggleChart('${c}')" style="cursor:pointer; border-bottom:1px solid var(--rule);">
            <td style="padding:7px; font-weight:bold;">${c}번</td>
            <td style="padding:7px; font-size:0.8rem; color:var(--ink-soft);">${iaGroupName(g)}</td>
            <td style="padding:7px; text-align:center;">${list.length}</td>
            <td style="padding:7px; text-align:center;">${iaFmt(w, 0)}</td>
            <td style="padding:7px; text-align:center;">${f ? iaFmt(f, 1) : '-'}</td>
            <td style="padding:7px; text-align:center;">
                ${latest !== null ? `
                    <b style="color:var(--ink-blue);">${latestLabel} ${latest.toFixed(0)}</b>
                    ${rule ? `<b style="color:${Math.abs(latest / Number(rule.value) - 1) <= 0.15 ? 'var(--approve)' : 'var(--red)'};">
                        (${(latest / Number(rule.value) * 100).toFixed(0)}%)</b>` : ''}
                    <br><span style="font-size:0.72rem; color:var(--ink-soft);">평균 ${iaFmt(m, 0)} · ${doses.length}구간</span>` : '-'}</td>
            <td style="padding:7px; text-align:center; color:var(--ink-soft); font-size:0.75rem;"
                id="ia-caret-${c}">▾</td>
        </tr>
        <tr id="ia-chartrow-${c}" style="display:none;">
            <td colspan="7" style="padding:10px 7px 16px; background:var(--paper);">
                <div style="height:230px;"><canvas id="ia-chart-${c}"></canvas></div>
                <div style="height:175px; margin-top:14px;"><canvas id="ia-chartmet-${c}"></canvas></div>
                <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
                    회색 속빈 점은 계산에서 뺀 구간입니다(선은 그 날을 건너뜁니다). 세로축은 모든 케이지가 같은 눈금이라 그대로 비교됩니다.
                    위 점선은 고염식·BAPN·메트포민이 들어간 날, 아래 점선은 케이지 구성이 바뀐 날입니다.
                    아래 그림은 그 구간에 실제로 들어간 메트포민입니다 — 가로축은 위와 같습니다.
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h4 style="margin:0; color:var(--ink);">케이지별</h4>
            <span style="font-size:0.8rem; color:var(--ink-soft);">줄을 누르면 추이 그래프가 열립니다</span>
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead><tr style="">
                <th style="padding:7px; text-align:left;">케이지</th><th style="padding:7px; text-align:left;">군</th>
                <th style="padding:7px;">구간</th><th style="padding:7px;">물 mL/day/마리</th>
                <th style="padding:7px;">사료 g/day/마리</th>
                <th style="padding:7px;">Metformin<br><span style="font-weight:normal; font-size:0.72rem;">mg/kg/day</span></th>
                <th style="padding:7px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>
    </div>`;
}

// 이 케이지에 고염식·BAPN·메트포민이 언제부터 들어갔는지.
// 개체의 기준일(OVX·결찰) + 코호트 설정의 오프셋으로 계산한다.
function iaCageEvents(cageId) {
    if (!iaConfig || !iaConfig.dosing) return [];
    const rows = iaByCage[cageId] || [];
    if (!rows.length) return [];

    const ids = new Set();
    rows.forEach(r => (r.ratIds || []).forEach(x => ids.add(x)));
    const mine = iaRats.filter(r => ids.has(r.ratId));
    if (!mine.length) return [];

    const gkey = iaGroupOf(rows[0]);
    const dOf = v => !v ? null : (typeof v === 'string' ? v.slice(0, 10)
        : (v.toDate ? new Date(v.toDate().getTime() - v.toDate().getTimezoneOffset() * 60000)
            .toISOString().slice(0, 10) : null));
    const shift = (ds, n) => {
        const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + (Number(n) || 0));
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };

    const COLOR = { NaCl: '#7b5aa6', BAPN: '#b8860b', Metformin: '#00697a' };
    const out = [];
    iaConfig.dosing.forEach(rule => {
        if (!(rule.groups || []).includes(gkey)) return;
        let start = null;
        mine.forEach(r => {
            const base = dOf(rule.startAnchor === 'ovx' ? r.ovxDate
                       : rule.startAnchor === 'arrival' ? r.arrivalDate : r.surgeryDate);
            if (!base) return;
            const d = shift(base, rule.startOffset);
            if (!start || d < start) start = d;
        });
        if (start) out.push({ date: start, label: rule.substance,
                              color: COLOR[rule.substance] || '#5B5F66' });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
}

// 세로 눈금선을 그리는 작은 플러그인. 별도 라이브러리 없이 캔버스에 직접 그린다.
const iaEventPlugin = {
    id: 'iaEvents',
    afterDatasetsDraw(chart, args, opts) {
        const events = (opts && opts.list) || [];
        if (!events.length) return;
        const { ctx, chartArea: area, scales } = chart;
        const labels = chart.data.labels || [];
        events.forEach(ev => {
            // 측정일 사이에 낀 날짜면 두 점 사이를 비례로 나눈 자리에 세운다
            let x = null;
            const exact = labels.indexOf(ev.date);
            if (exact >= 0) x = scales.x.getPixelForValue(labels[exact]);
            else {
                const i = labels.findIndex(l => l > ev.date);
                if (i > 0) {
                    const a = scales.x.getPixelForValue(labels[i - 1]);
                    const b = scales.x.getPixelForValue(labels[i]);
                    const t0 = new Date(labels[i - 1]).getTime(), t1 = new Date(labels[i]).getTime();
                    const te = new Date(ev.date).getTime();
                    x = a + (b - a) * ((te - t0) / (t1 - t0 || 1));
                }
            }
            if (x === null || x < area.left || x > area.right) return;

            ctx.save();
            ctx.setLineDash(ev.pos === 'bottom' ? [2, 3] : [4, 3]);
            ctx.strokeStyle = ev.color; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = ev.color;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'left';
            // 투약 시작은 위에, 케이지 구성 변동은 아래에 — 같은 날이어도 글자가 겹치지 않는다
            ctx.fillText(' ' + ev.label, x + 1, ev.pos === 'bottom' ? area.bottom - 4 : area.top + 10);
            ctx.restore();
        });
    }
};

// 케이지 한 줄을 눌렀을 때 물·사료 추이를 그린다.
// 케이지가 24개까지 늘어나므로 기본은 닫아두고, 연 것만 그린다.
function iaToggleChart(cageId) {
    const row = document.getElementById('ia-chartrow-' + cageId);
    const caret = document.getElementById('ia-caret-' + cageId);
    if (!row) return;
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : 'table-row';
    if (caret) caret.textContent = open ? '▾' : '▴';
    if (open) {
        ['' + cageId, 'met-' + cageId].forEach(k => {
            if (iaCharts[k]) { iaCharts[k].destroy(); delete iaCharts[k]; }
        });
        return;
    }
    iaDrawChart(cageId);
}

function iaDrawChart(cageId) {
    // 제외 구간까지 전부 가로축에 올린다. 통계에 쓴 값은 선으로 잇고,
    // 뺀 값은 회색 속빈 점으로만 찍는다 — 선은 그 날을 건너뛰어 이어진다.
    const list = (iaAllByCage[cageId] || iaByCage[cageId] || []).slice()
        .sort((a, b) => String(a.dateStr).localeCompare(String(b.dateStr)));
    const cv = document.getElementById('ia-chart-' + cageId);
    if (!cv || !list.length || typeof Chart === 'undefined') return;
    if (iaCharts[cageId]) iaCharts[cageId].destroy();

    const labels = list.map(r => r.dateStr);
    const used = list.map(iaUsable);
    const hasFood = r => typeof r.foodPerCapita === 'number';
    const water    = list.map((r, i) =>  used[i] ? r.waterPerCapita : null);
    const waterOut = list.map((r, i) => !used[i] ? r.waterPerCapita : null);
    const food     = list.map((r, i) =>  used[i] && hasFood(r) ? r.foodPerCapita : null);
    const foodOut  = list.map((r, i) => !used[i] && hasFood(r) ? r.foodPerCapita : null);
    const anyOut = waterOut.some(v => v !== null);

    const events = iaCageEvents(cageId);
    // 케이지 구성이 바뀐 날(재실변동 · 사망발생)도 세로선으로 — 그 앞뒤는 같은 케이지가 아니다
    list.forEach(r => {
        const fl = r.flags || [];
        if (fl.includes('재실변동')) events.push({ date: r.dateStr, label: '재실변동', color: '#5B5F66', pos: 'bottom' });
        else if (fl.includes('사망발생')) events.push({ date: r.dateStr, label: '사망', color: '#5B5F66', pos: 'bottom' });
    });
    events.sort((a, b) => a.date.localeCompare(b.date));

    const OUT = { showLine: false, pointRadius: 4, pointBorderWidth: 1.5,
                  borderColor: '#9B9689', backgroundColor: '#FAF9F5' };   // 회색 테두리 · 백지 속

    iaCharts[cageId] = new Chart(cv.getContext('2d'), {
        type: 'line',
        plugins: [iaEventPlugin],
        data: { labels, datasets: [
            { label: '물 mL/마리·일', data: water, borderColor: '#00697a',
              backgroundColor: '#00697a', tension: 0.25, yAxisID: 'y', pointRadius: 4, spanGaps: true },
            { label: '사료 g/마리·일', data: food, borderColor: '#b8860b',
              backgroundColor: '#b8860b', tension: 0.25, yAxisID: 'y1', pointRadius: 4,
              borderDash: [5, 4], spanGaps: true },
            ...(anyOut ? [
            { label: '제외 구간', data: waterOut, yAxisID: 'y',  pointStyle: 'circle', ...OUT },
            { label: '제외(사료)', data: foodOut, yAxisID: 'y1', pointStyle: 'rect',   ...OUT }
            ] : [])
        ]},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                iaEvents: { list: events },
                legend: { labels: { boxWidth: 12, font: { size: 11 },
                                    filter: it => it.text !== '제외(사료)' } },   // 범례엔 '제외 구간' 하나만
                tooltip: { callbacks: { afterBody: items => {
                    const r = list[items[0].dataIndex];
                    const parts = [];
                    if (!iaUsable(r)) {
                        const fl = (r.flags || []).filter(f => IA_DROP.includes(f));
                        parts.push('통계 제외' + (fl.length ? ' · ' + fl.join(', ') : ' · 섭취량 미계산'));
                    }
                    if (r.intervalHours) parts.push(`구간 ${r.intervalHours.toFixed(1)}h`);
                    if (typeof r.waterConsumed === 'number') parts.push(`섭취 ${r.waterConsumed.toFixed(1)} mL`);
                    if (r.animalDays) parts.push(`${r.animalDays.toFixed(2)} 마리·일`);
                    const md = iaMetDose(r);
                    if (md !== null) parts.push(`Metformin ${md.toFixed(0)} mg/kg/일`);
                    return parts.join(' · ');
                } } }
            },
            scales: {
                // 모든 케이지가 같은 눈금을 쓴다 — 그래야 케이지끼리 비교된다
                y:  { position: 'left',  title: { display: true, text: '물 mL/마리·일' },
                      beginAtZero: true, max: (iaYMax && iaYMax.water) || undefined,
                      grid: { color: '#f0f0f0' } },
                y1: { position: 'right', title: { display: true, text: '사료 g/마리·일' },
                      beginAtZero: true, max: (iaYMax && iaYMax.food) || undefined,
                      grid: { display: false } },
                x:  { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });

    iaDrawCageMetChart(cageId, list, labels, used, events);
}

// 케이지 하나의 도달 용량. 물·사료와 세로축이 전혀 다르므로 같은 그림에 겹치지 않고
// 바로 아래에 가로축만 맞춰 따로 그린다.
function iaDrawCageMetChart(cageId, list, labels, used, events) {
    const cv = document.getElementById('ia-chartmet-' + cageId);
    if (!cv || typeof Chart === 'undefined') return;
    const key = 'met-' + cageId;
    if (iaCharts[key]) { iaCharts[key].destroy(); delete iaCharts[key]; }

    const dose    = list.map((r, i) =>  used[i] ? iaMetDose(r) : null);
    const doseOut = list.map((r, i) => !used[i] ? iaMetDose(r) : null);
    // 투약 전 코호트·군이면 그릴 게 없다 — 빈 캔버스를 남기지 않는다
    if (!dose.some(v => v !== null) && !doseOut.some(v => v !== null)) {
        cv.parentElement.style.display = 'none';
        return;
    }
    cv.parentElement.style.display = '';

    const rule = iaWaterRuleOf(iaGroupOf(list[0]));
    const target = rule ? Number(rule.value) : null;
    const anyOut = doseOut.some(v => v !== null);
    const OUT = { showLine: false, pointRadius: 4, pointBorderWidth: 1.5,
                  borderColor: '#9B9689', backgroundColor: '#FAF9F5' };

    iaCharts[key] = new Chart(cv.getContext('2d'), {
        type: 'line',
        plugins: [iaEventPlugin],
        data: { labels, datasets: [
            { label: '메트포민 mg/kg·일', data: dose, borderColor: '#00697a',
              backgroundColor: '#00697a', borderWidth: 2, tension: 0.25, pointRadius: 4, spanGaps: true },
            ...(target ? [{ label: `목표 ${target}`, data: labels.map(() => target),
              borderColor: '#5B5F66', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false }] : []),
            ...(anyOut ? [{ label: '제외 구간', data: doseOut, pointStyle: 'circle', ...OUT }] : [])
        ]},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                iaEvents: { list: events },
                legend: { labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { afterBody: items => {
                    const r = list[items[0].dataIndex];
                    const parts = [];
                    if (r.doseGain > 1) parts.push(`부족분 보정 ×${Number(r.doseGain).toFixed(2)}`);
                    if (typeof r.waterConsumed === 'number') parts.push(`섭취 ${r.waterConsumed.toFixed(1)} mL`);
                    if (r.sumBW) parts.push(`총체중 ${r.sumBW} g`);
                    return parts.join(' · ');
                } } }
            },
            scales: {
                // 케이지끼리 비교되게 눈금을 통일하되, 목표선이 잘리지 않게 여유를 둔다
                y: { beginAtZero: true, title: { display: true, text: '메트포민 mg/kg·일' },
                     max: Math.max((iaYMax && iaYMax.met) || 0, target ? target * 1.3 : 0) || undefined,
                     grid: { color: '#f0f0f0' } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}
