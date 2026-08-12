// ============================================================
//  섭취량 · 투여량 분석
//  - 케이지가 측정 단위다. 물통 하나를 여러 마리가 나눠 마시므로
//    개체별 섭취량은 원리적으로 알 수 없다. 그래서 통계도 케이지 단위(n = 케이지 수).
//  - 투여량은 나누기 가정 없이 "케이지가 먹은 총 약물 ÷ 케이지 총 체중"으로 계산.
// ============================================================

let iaCohort = null;
let iaConfig = null;
let iaRows = [];      // cageFeeding 기록
let iaCages = {};     // cageId -> {group, cohort}
let iaWeights = {};   // ratId -> [{date, weight}]

async function renderIntakeView(main) {
    main.innerHTML = `
    <div class="card">
        <h3>💧 섭취량 · 투여량</h3>
        <div style="font-size:0.85rem; color:#666; margin-bottom:12px;">
            물통을 여러 마리가 나눠 쓰므로 <b>케이지가 측정 단위</b>입니다.
            개체별 값은 추정치이고, 통계는 케이지 수를 n으로 씁니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-weight:bold; color:var(--navy);">코호트</label>
            <select id="ia-cohort-sel" style="width:auto; min-width:130px; padding:8px; border-radius:6px; border:1px solid #ccc;">
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

// 계산에 쓸 수 있는 구간만 (플래그 없고, 섭취량이 계산된 것)
function iaUsable(r) {
    return typeof r.waterPerCapita === 'number' && r.waterPerCapita > 0 && !(r.flags || []).length;
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
        body.innerHTML = `<div class="card" style="color:#666;">
            이 코호트의 급여 기록이 없습니다. <b>케이지별 입력</b>에서 먼저 기록해주세요.</div>`;
        return;
    }

    const usable = iaRows.filter(iaUsable);
    const excluded = iaRows.length - usable.length;

    // 이 구간에 마신 물은 '지난 방문 때 탄' 물이다.
    // 오늘 행의 doseMg는 다음 구간용이므로, 농도는 같은 케이지의 직전 행에서 가져온다.
    // (안 그러면 투약 첫날 — 약 없는 물을 마신 구간 — 이 투약된 것으로 잡힌다)
    const prevByCage = {};
    iaRows.forEach(r => {                  // iaRows는 시간순 정렬됨
        const c = String(r.cageId);
        r.__prev = prevByCage[c] || null;
        prevByCage[c] = r;
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

        // 메트포민: 실제로 마신 물 × '지난 방문 때 탄' 농도 ÷ 케이지 총 체중
        const p = r.__prev;
        if (p && p.doseMg && p.waterGiven && typeof r.waterConsumed === 'number') {
            const bw = iaCageBW(r);
            const days = r.animalDays / (r.ratCount || 1);
            if (bw && days > 0) {
                // 원액 부피도 전체 부피에 포함 (700 mL 물 + 7 cc 원액 = 707 mL)
                const totalVol = Number(p.waterGiven) + (Number(p.doseCc) || 0);
                const conc = p.doseMg / totalVol;                        // mg/mL
                const taken = conc * r.waterConsumed;                    // mg
                byGroup[g][c].met.push(taken / (bw / 1000) / days);
            }
        }
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
            <td style="padding:8px; font-weight:bold;">${iaGroupName(g)}<br><span style="font-size:0.75rem; color:#888;">${g} · 케이지 ${nCages}개</span></td>
            <td style="padding:8px; text-align:center;">${iaFmt(w, 0)}</td>
            <td style="padding:8px; text-align:center;">${iaFmt(f, 1)}</td>
            <td style="padding:8px; text-align:center; color:#0d47a1; font-weight:bold;">${m ? iaFmt(m, 0) : '-'}</td>
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
                <span><b style="color:${off ? 'var(--red)' : '#2e7d32'};">${m.mean.toFixed(0)}</b>
                <span style="color:#888;"> / 목표 ${rule.value} mg/kg/day (${pct.toFixed(0)}%)</span></span>
            </div>`;
        }).filter(Boolean).join('');
        if (parts) achievedHtml = `
        <div class="card">
            <h4 style="margin-top:0; color:var(--navy);">🎯 ${waterRules[0].substance} 목표 대비 실제 도달</h4>
            ${parts}
            <div style="font-size:0.78rem; color:#888; margin-top:8px;">
                실제 마신 물의 양으로 역산한 값입니다. 목표에서 15% 이상 벗어나면 빨갛게 표시됩니다.
            </div>
        </div>`;
    }

    body.innerHTML = `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">군별 요약</h4>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead><tr style="background:#f5f5f5;">
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
        <div style="font-size:0.78rem; color:#888; margin-top:10px;">
            평균 ± 표준편차 · <b>n = 케이지 수</b> (케이지별 평균을 낸 뒤 군 통계)
        </div>
    </div>

    ${achievedHtml}

    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">📄 논문용 문장</h4>
        <div style="background:#f8f9fa; border:1px solid #eee; border-radius:6px; padding:12px; font-size:0.85rem; line-height:1.7;">
            ${iaPaperText(byGroup, groupKeys, cageMean, waterRules, usable.length, excluded)}
        </div>
    </div>

    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">구간 사용 현황</h4>
        <div style="font-size:0.88rem;">
            전체 ${iaRows.length}구간 중 <b style="color:#2e7d32;">${usable.length}구간 사용</b>,
            <b style="color:var(--red);">${excluded}구간 제외</b>
        </div>
        ${excluded ? `<div style="margin-top:8px; font-size:0.82rem; color:#666;">
            제외 사유: ${iaExcludeReasons()}
        </div>` : ''}
    </div>

    ${iaCageTable(usable)}`;
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

function iaPaperText(byGroup, groupKeys, cageMean, waterRules, used, excluded) {
    const lines = [];
    groupKeys.forEach(g => {
        const w = cageMean(byGroup[g], 'water');
        const f = cageMean(byGroup[g], 'food');
        if (w) lines.push(`${iaGroupName(g)}: water ${w.mean.toFixed(0)} ± ${w.sd.toFixed(0)} mL/day/rat` +
            (f ? `, food ${f.mean.toFixed(1)} ± ${f.sd.toFixed(1)} g/day/rat` : '') +
            ` (n = ${w.n} ${w.n === 1 ? 'cage' : 'cages'})`);
    });

    let metLine = '';
    if (waterRules && waterRules.length) {
        const rule0 = waterRules[0];
        const vals = groupKeys
            .filter(g => waterRules.some(d => (d.groups || []).includes(g)))
            .map(g => ({ g, m: cageMean(byGroup[g], 'met') })).filter(x => x.m);
        if (vals.length) {
            metLine = `${rule0.substance} was administered in drinking water, with the amount adjusted ` +
                `to a target of ${rule0.value} mg/kg/day based on measured water intake and body weight. ` +
                `Achieved intake was ` + vals.map(x => `${x.m.mean.toFixed(0)} ± ${x.m.sd.toFixed(0)}`).join(', ') +
                ` mg/kg/day.`;
        }
    }

    const bapnParts = groupKeys.map(g => { const b = cageMean(byGroup[g], 'bapn'); return b ? `${b.mean.toFixed(1)} ± ${b.sd.toFixed(1)}` : null; }).filter(Boolean);
    const bapnLine = bapnParts.length > 1
        ? `BAPN intake did not differ meaningfully between groups (${bapnParts.join(' vs ')} mg/kg/day).` : '';

    return [
        lines.join('<br>'),
        metLine,
        bapnLine,
        `Intake was measured per cage. Intervals containing a mortality event, a housing change, ` +
        `or a recorded anomaly were excluded (${excluded} of ${used + excluded} intervals).`
    ].filter(Boolean).join('<br><br>');
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

    const rows = keys.map(c => {
        const list = byCage[c];
        const w = iaStat(list.map(r => r.waterPerCapita));
        const f = iaStat(list.map(r => r.foodPerCapita).filter(v => typeof v === 'number'));
        const g = iaGroupOf(list[0]);
        return `<tr>
            <td style="padding:7px; font-weight:bold;">${c}번</td>
            <td style="padding:7px; font-size:0.8rem; color:#666;">${iaGroupName(g)}</td>
            <td style="padding:7px; text-align:center;">${list.length}</td>
            <td style="padding:7px; text-align:center;">${iaFmt(w, 0)}</td>
            <td style="padding:7px; text-align:center;">${f ? iaFmt(f, 1) : '-'}</td>
        </tr>`;
    }).join('');

    return `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">케이지별</h4>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead><tr style="background:#f5f5f5;">
                <th style="padding:7px; text-align:left;">케이지</th><th style="padding:7px; text-align:left;">군</th>
                <th style="padding:7px;">구간</th><th style="padding:7px;">물 mL/day/마리</th><th style="padding:7px;">사료 g/day/마리</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>
    </div>`;
}
