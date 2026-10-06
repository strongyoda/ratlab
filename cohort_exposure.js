// ============================================================
//  섭취 · 투약 노출 (코호트 분석 · 코호트 비교 공용)
//  C14 결론을 심사에서 방어하려면 결과(ARE·사망) 바로 옆에 노출이 있어야 한다.
//   ① 군별 BAPN · NaCl 실제 섭취 — 교란 점검.
//      메트포민이 사료 섭취를 약 16% 줄이면(근거 문서 5.3항) 투약군은 BAPN·염분도 덜 먹는다.
//      그러면 동맥류가 줄어도 메트포민 덕인지 가를 수 없다.
//   ② 군별 메트포민 누적 도달 — 목표 150에 실제로 얼마나 붙었나.
//   ③ 개체별 노출 표 — 통계 분석의 출발점. CSV로 받는다.
//  물통·사료를 같이 쓰므로 모든 값은 케이지 단위다. 군 통계의 n = 케이지 수.
//  메트포민 계산 규칙은 섭취량·투여량 화면 · 개체 상세와 같다 (global.js metDoseIntervals).
// ============================================================

const CE_FALLBACK_COLORS = ['#00697a', '#b8860b', '#7b5aa6', '#c0504d', '#4a7c59'];
const ceData = {};   // uniqueSuffix -> CSV로 내보낼 개체 행

function ceEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ceGkey(r) { return r.group ? ('G' + String(r.group).replace(/^G/, '')) : 'G1'; }
function ceMs(dateStr) { return new Date(dateStr + 'T00:00:00').getTime(); }
function ceAnchorDate(r, anchor) {
    return doseDateOf(anchor === 'ligation' ? r.surgeryDate : anchor === 'ovx' ? r.ovxDate
                    : anchor === 'arrival' ? r.arrivalDate : null);
}
// 규칙 하나의 투여 시작 시각(ms). 기준일이 없으면 null
function ceStartMs(r, rule) {
    if (!rule) return null;
    // 개체에 직접 적은 시작일(랫드 상세 '기본 일정' · 일괄 입력)이 있으면 코호트 규칙보다 우선 (2026-10-07~)
    const sub = String(rule.substance || '');
    const own = /NaCl|염/i.test(sub) ? r.naclStartDate : /BAPN/i.test(sub) ? r.bapnStartDate : rule.medium === 'water' ? r.doseStartDate : null;
    const ownD = doseDateOf(own);
    if (ownD) return ceMs(ownD);
    const base = ceAnchorDate(r, rule.startAnchor);
    return base ? ceMs(doseShift(base, Number(rule.startOffset) || 0)) : null;
}
function ceStat(vals) {
    const v = vals.filter(x => typeof x === 'number' && isFinite(x));
    if (!v.length) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0;
    return { mean: m, sd, se: v.length > 1 ? sd / Math.sqrt(v.length) : 0, n: v.length };
}

async function coRenderExposure(boxId, rats, sfx) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = `<div class="card" style="color:var(--ink-soft);">섭취 · 투약 노출 계산 중...</div>`;
    try {
        const cohorts = [...new Set(rats.map(r => String(r.cohort)))];
        const [snaps, cfgList] = await Promise.all([
            Promise.all(cohorts.map(c => db.collection('cageFeeding').where('cohort', '==', c).get())),
            Promise.all(cohorts.map(c => getCohortConfig(c)))
        ]);
        const cfgBy = {};
        cohorts.forEach((c, i) => { cfgBy[c] = cfgList[i] || {}; });
        // 케이지 번호는 코호트마다 다시 쓰이므로 코호트까지 붙여 구분한다
        const rowsByCage = {};
        snaps.forEach(sn => sn.forEach(d => { const v = d.data();
            (rowsByCage[`${v.cohort}|${v.cageId}`] = rowsByCage[`${v.cohort}|${v.cageId}`] || []).push(v); }));

        const ratSet = new Set(rats.map(r => r.ratId));
        const ruleOf = (r, pred) => ((cfgBy[String(r.cohort)] || {}).dosing || [])
            .find(d => pred(d) && (d.groups || []).includes(ceGkey(r)) && Number(d.value) > 0) || null;
        const waterRule = r => ruleOf(r, d => d.medium === 'water');
        const foodRule = (r, re) => ruleOf(r, d => d.medium === 'food' && re.test(d.substance || ''));

        // ── 케이지 단위 ─────────────────────────────────────
        // 케이지의 군 · 결찰일은 그 케이지에 들어간 이 분석 대상 개체에서 가져온다
        const cages = {};   // cageKey -> { group, cohort, surg, rats:Set, iv:[] }
        Object.entries(rowsByCage).forEach(([ck, rows]) => {
            const mine = new Set();
            rows.forEach(r => (r.ratIds || []).forEach(id => { if (ratSet.has(id)) mine.add(id); }));
            if (!mine.size) return;
            const members = rats.filter(r => mine.has(r.ratId));
            const surgs = members.map(r => doseDateOf(r.surgeryDate)).filter(Boolean).sort();
            cages[ck] = { key: ck, cohort: String(members[0].cohort), group: ceGkey(members[0]),
                          surg: surgs[0] || null, rats: members, iv: metDoseIntervals(rows), rows };
        });

        const groupsPresent = [...new Set(rats.map(r => `${r.cohort}||${ceGkey(r)}`))].sort();
        const gInfo = {};
        groupsPresent.forEach((gk, i) => {
            const [c, g] = gk.split('||');
            const def = ((cfgBy[c] || {}).groups || []).find(x => x.key === g) || {};
            gInfo[gk] = { label: (cohorts.length > 1 ? `C${c} ` : '') + (def.name ? `${g} ${def.name}` : g),
                          color: def.color || CE_FALLBACK_COLORS[i % CE_FALLBACK_COLORS.length] };
        });
        const gkOfCage = cg => `${cg.cohort}||${cg.group}`;
        const podOf = (cg, ms) => cg.surg ? (ms - ceMs(cg.surg)) / 86400000 : null;

        // ── ① BAPN · NaCl : 구간별 사료 속 약물 (mg/kg/일) ─────────────
        // 사료 속 약물 = 마리당 사료 × 마리수 × 사료 1 g 속 약물 ÷ 케이지 총체중
        const foodDoseOf = (row, pctRule) => {
            if (!pctRule || typeof row.foodPerCapita !== 'number' || !(row.foodPerCapita > 0)) return null;
            if ((row.flags || []).some(f => MET_DOSE_DROP.includes(f))) return null;
            const kgd = rowKgDays(row);   // 재실 가중 kg·일 (global.js) — 옛 기록은 총체중 × 마리당 일수
            if (!(kgd > 0) || !(row.animalDays > 0)) return null;
            return row.foodPerCapita * row.animalDays * (Number(pctRule.value) * 10) / kgd;
        };
        const cageFood = {};   // cageKey -> { bapn:[{pod,dose,days,end}], nacl:[...] }
        Object.values(cages).forEach(cg => {
            const ref = cg.rats[0];
            const out = { bapn: [], nacl: [] };
            [['bapn', /BAPN/i], ['nacl', /NaCl|염/i]].forEach(([k, re]) => {
                const rule = foodRule(ref, re);
                if (!rule) return;
                const starts = cg.rats.map(r => ceStartMs(r, rule)).filter(v => v !== null);
                if (!starts.length) return;
                const st = Math.min(...starts);      // 사료는 케이지 공용 — 한 마리라도 시작하면 케이지 전체가 먹는다
                cg.rows.forEach(row => {
                    const end = row.at?.toMillis?.() || ceMs(row.dateStr) + 43200000;
                    const days = row.animalDays / (row.ratCount || 1);
                    const start = end - (Number(row.intervalHours) || days * 24) * 3600000;
                    if (start < st) return;
                    const dose = foodDoseOf(row, rule);
                    if (dose === null || !(days > 0)) return;
                    out[k].push({ pod: podOf(cg, end), dose, days, start, end, row });
                });
            });
            cageFood[cg.key] = out;
        });

        // 주(POD 7일) 단위로 묶어 케이지마다 일수 가중 평균 → 군 평균 ± SE (n = 케이지)
        const weekly = (pick) => {
            const byG = {};   // gk -> week -> [cage mean]
            Object.values(cages).forEach(cg => {
                const perW = {};
                pick(cg).forEach(p => { if (p.pod === null || p.pod < 0) return;
                    const w = Math.floor(p.pod / 7);
                    (perW[w] = perW[w] || { s: 0, d: 0 }); perW[w].s += p.dose * p.days; perW[w].d += p.days; });
                const gk = gkOfCage(cg);
                Object.entries(perW).forEach(([w, a]) => {
                    if (!(a.d > 0)) return;
                    ((byG[gk] = byG[gk] || {})[w] = byG[gk][w] || []).push(a.s / a.d);
                });
            });
            return byG;
        };
        // 케이지마다 전체 기간 일수 가중 평균 → 군 요약
        const overall = (pick) => {
            const byG = {};
            Object.values(cages).forEach(cg => {
                const pts = pick(cg); const d = pts.reduce((a, p) => a + p.days, 0);
                if (!(d > 0)) return;
                (byG[gkOfCage(cg)] = byG[gkOfCage(cg)] || []).push(pts.reduce((a, p) => a + p.dose * p.days, 0) / d);
            });
            return byG;
        };
        const bapnW = weekly(cg => (cageFood[cg.key] || {}).bapn || []);
        const bapnAll = overall(cg => (cageFood[cg.key] || {}).bapn || []);
        const naclAll = overall(cg => (cageFood[cg.key] || {}).nacl || []);

        // ── ② 메트포민 누적 : 케이지마다 투약 시작 이후 일수 가중 누적 평균을 주 끝마다 ──────
        const metCum = {};   // gk -> week -> [cage cumulative]
        const metAll = {};   // gk -> [cage 최종 누적]
        Object.values(cages).forEach(cg => {
            const rule = waterRule(cg.rats[0]);
            if (!rule || !cg.surg) return;
            const starts = cg.rats.map(r => ceStartMs(r, rule)).filter(v => v !== null);
            if (!starts.length) return;
            const st = Math.min(...starts);
            const ivs = cg.iv.filter(iv => iv.usable && iv.end > st).sort((a, b) => a.end - b.end);
            if (!ivs.length) return;
            let s = 0, d = 0;
            const gk = gkOfCage(cg);
            const lastW = {};
            ivs.forEach(iv => {
                const w = Math.max(0, iv.days * (iv.end - Math.max(iv.start, st)) / (iv.end - iv.start));
                s += iv.dose * w; d += w;
                const pod = podOf(cg, iv.end);
                if (pod !== null && pod >= 0 && d > 0) lastW[Math.floor(pod / 7)] = s / d;
            });
            Object.entries(lastW).forEach(([w, v]) => { ((metCum[gk] = metCum[gk] || {})[w] = metCum[gk][w] || []).push(v); });
            if (d > 0) (metAll[gk] = metAll[gk] || []).push(s / d);
        });

        // ── ③ 개체별 노출 ─────────────────────────────────────
        const nowMs = Date.now();
        const ratRows = rats.slice().sort((a, b) => ceGkey(a).localeCompare(ceGkey(b)) || a.ratId.localeCompare(b.ratId)).map(r => {
            const dead = r.status === '사망' || !!r.deathDate;
            const deathD = doseDateOf(r.deathDate);
            const endMs = deathD ? ceMs(deathD) + 86400000 : nowMs;
            const surg = doseDateOf(r.surgeryDate);
            const myCages = Object.values(cages).filter(cg => cg.rats.some(x => x.ratId === r.ratId));
            // 이 개체가 들어 있던 구간만 (구간 기록의 ratIds), 투여 시작~사망 사이와 겹친 만큼
            const avgOver = (pts, st) => {
                let s = 0, d = 0;
                pts.forEach(p => {
                    if (!(p.row.ratIds || []).includes(r.ratId)) return;
                    const a = Math.max(p.start, st), b = Math.min(p.end, endMs);
                    if (b <= a) return;
                    const w = p.days * (b - a) / (p.end - p.start);
                    s += p.dose * w; d += w;
                });
                return d > 0 ? { v: s / d, d } : null;
            };
            const wr = waterRule(r);
            const wSt = ceStartMs(r, wr);
            let met = null, metDays = null;
            if (wr && wSt !== null && wSt < endMs) {
                metDays = Math.round((Math.min(endMs - (deathD ? 86400000 : 0), nowMs) - wSt) / 86400000);
                met = avgOver(myCages.flatMap(cg => cg.iv.filter(iv => iv.usable)), wSt);
            }
            const br = foodRule(r, /BAPN/i), nr = foodRule(r, /NaCl|염/i);
            const bSt = ceStartMs(r, br), nSt = ceStartMs(r, nr);
            const bapn = bSt !== null ? avgOver(myCages.flatMap(cg => (cageFood[cg.key] || {}).bapn || []), bSt) : null;
            const nacl = nSt !== null ? avgOver(myCages.flatMap(cg => (cageFood[cg.key] || {}).nacl || []), nSt) : null;
            const podEnd = surg ? Math.round(((deathD ? ceMs(deathD) : nowMs) - ceMs(surg)) / 86400000) : null;
            return {
                ratId: r.ratId, cohort: r.cohort, group: ceGkey(r), gk: `${r.cohort}||${ceGkey(r)}`,
                cage: myCages.map(cg => cg.key.split('|')[1]).join(','),
                status: dead ? (r.sampleDate ? '희생' : '사망') : '생존',
                metDays, met: met ? met.v : null, metPct: (met && wr) ? met.v / Number(wr.value) * 100 : null,
                target: wr ? Number(wr.value) : null,
                bapn: bapn ? bapn.v : null, nacl: nacl ? nacl.v : null,
                are: r.are || '', cod: dead ? (r.cod || '') : '', podEnd, alive: !dead
            };
        });
        ceData[sfx] = ratRows;

        box.innerHTML = ceHtml(sfx, groupsPresent, gInfo, bapnAll, naclAll, metAll, ratRows);
        ceDrawWeekly(`ceBapn${sfx}`, groupsPresent.filter(gk => bapnW[gk]), gInfo, bapnW, null, 'BAPN mg/kg/일');
        const targets = [...new Set(rats.map(r => waterRule(r)).filter(Boolean).map(r => Number(r.value)))];
        if (Object.keys(metCum).length)
            ceDrawWeekly(`ceMet${sfx}`, groupsPresent.filter(gk => metCum[gk]), gInfo, metCum,
                         targets.length === 1 ? targets[0] : null, '메트포민 누적 평균 mg/kg/일');
    } catch (e) {
        console.error(e);
        box.innerHTML = `<div class="card" style="color:var(--stamp);">섭취 · 투약 노출을 계산하지 못했습니다: ${ceEsc(e.message)}</div>`;
    }
}

function ceHtml(sfx, groups, gInfo, bapnAll, naclAll, metAll, ratRows) {
    const h4 = t => `<h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">${t}</h4>`;
    const fmt = (s, d = 0) => s ? `${s.mean.toFixed(d)} ± ${s.sd.toFixed(d)}` : '-';
    // 사료 기록이 없는 군(BAPN을 안 먹는 연습군 등)은 교란 표에서 뺀다.
    // 비교 기준 = 기록이 있는 군 중 메트포민이 없는 군, 없으면 기록이 있는 첫 군
    const foodGroups = groups.filter(gk => (bapnAll[gk] || []).length || (naclAll[gk] || []).length);
    const refG = foodGroups.find(gk => !metAll[gk]) || foodGroups[0];
    const refB = ceStat(bapnAll[refG] || []);
    const swatch = gk => `<span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${gInfo[gk].color}; margin-right:6px;"></span>`;

    const foodRows = foodGroups.map(gk => {
        const b = ceStat(bapnAll[gk] || []), n = ceStat(naclAll[gk] || []);
        const diff = (b && refB && gk !== refG) ? (b.mean / refB.mean - 1) * 100 : null;
        return `<tr style="border-bottom:1px solid var(--rule);">
            <td style="padding:7px;">${swatch(gk)}${ceEsc(gInfo[gk].label)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${fmt(b, 1)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${fmt(n, 0)}</td>
            <td class="mono" style="padding:7px; text-align:center; ${diff !== null && Math.abs(diff) >= 10 ? 'color:var(--stamp); font-weight:bold;' : ''}">${foodGroups.length < 2 ? '-' : gk === refG ? '기준' : (diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${b ? b.n : 0}</td>
        </tr>`;
    }).join('');

    const metRows = groups.filter(gk => metAll[gk]).map(gk => {
        const m = ceStat(metAll[gk]);
        const vals = metAll[gk];
        const tgt = (ratRows.find(r => r.gk === gk && r.target) || {}).target;
        return `<tr style="border-bottom:1px solid var(--rule);">
            <td style="padding:7px;">${swatch(gk)}${ceEsc(gInfo[gk].label)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${fmt(m, 0)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${tgt && m ? `${(m.mean / tgt * 100).toFixed(0)}%` : '-'}</td>
            <td class="mono" style="padding:7px; text-align:center;">${Math.min(...vals).toFixed(0)} ~ ${Math.max(...vals).toFixed(0)}</td>
            <td class="mono" style="padding:7px; text-align:center;">${m ? m.n : 0}</td>
        </tr>`;
    }).join('');

    const th = t => `<th style="padding:7px; text-align:center; font-size:0.8rem;">${t}</th>`;
    const cell = (v, d = 0) => (v === null || v === undefined) ? '-' : Number(v).toFixed(d);
    const tableRows = ratRows.map(r => `<tr style="border-bottom:1px solid var(--rule); ${r.alive ? '' : 'color:var(--ink-soft);'}">
        <td class="mono" style="padding:6px;">${ceEsc(r.ratId)}</td>
        <td style="padding:6px;">${swatch(r.gk)}${ceEsc(r.group)}</td>
        <td class="mono" style="padding:6px; text-align:center;">${ceEsc(r.cage || '-')}</td>
        <td style="padding:6px; text-align:center;">${r.status}</td>
        <td class="mono" style="padding:6px; text-align:center;">${cell(r.metDays)}</td>
        <td class="mono" style="padding:6px; text-align:center;">${r.met === null ? '-' : `${r.met.toFixed(0)} <span style="color:var(--ink-soft);">(${r.metPct.toFixed(0)}%)</span>`}</td>
        <td class="mono" style="padding:6px; text-align:center;">${cell(r.bapn, 1)}</td>
        <td class="mono" style="padding:6px; text-align:center;">${cell(r.nacl, 0)}</td>
        <td style="padding:6px; text-align:center;">${ceEsc(r.are || '-')}</td>
        <td style="padding:6px;">${ceEsc(r.alive ? '' : (r.cod || '-'))}</td>
        <td class="mono" style="padding:6px; text-align:center;">${r.podEnd === null ? '-' : (r.alive ? `${r.podEnd}+` : r.podEnd)}</td>
    </tr>`).join('');

    return `
    <div class="card">
        ${h4('사료 속 BAPN · NaCl 실제 섭취 — 군 간 교란 점검')}
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">
            메트포민이 사료 섭취를 줄이면 투약군은 BAPN·염분도 덜 먹게 되고, 동맥류가 줄어도 메트포민 덕인지 가를 수 없습니다.
            군 사이 차이가 작아야 결론이 방어됩니다. <b>기준</b>은 메트포민이 없는 군입니다.
        </div>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
            <thead><tr><th style="padding:7px; text-align:left;">군</th>${th('BAPN<br><span style="font-weight:normal;">mg/kg/일</span>')}${th('NaCl<br><span style="font-weight:normal;">mg/kg/일</span>')}${th('BAPN 기준 대비')}${th('케이지')}</tr></thead>
            <tbody>${foodRows || '<tr><td colspan="5" style="padding:8px; color:var(--ink-soft);">사료 속 약물 기록이 있는 군이 없습니다.</td></tr>'}</tbody>
        </table></div>
        <div style="height:230px; margin-top:14px;"><canvas id="ceBapn${sfx}"></canvas></div>
        <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
            결찰 후 주(POD 7일) 단위 · 선은 케이지 평균, 옅은 띠는 ± 표준오차 · n = 케이지 수.
            NaCl은 같은 사료에 들어 있어 BAPN과 군 간 비율이 같습니다. 10% 넘게 벌어지면 빨갛게 표시합니다.
        </div>
    </div>

    ${metRows ? `
    <div class="card">
        ${h4('메트포민 누적 도달 — 군별')}
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
            <thead><tr><th style="padding:7px; text-align:left;">군</th>${th('누적 평균<br><span style="font-weight:normal;">mg/kg/일</span>')}${th('목표 대비')}${th('케이지 범위')}${th('케이지')}</tr></thead>
            <tbody>${metRows}</tbody>
        </table></div>
        <div style="height:230px; margin-top:14px;"><canvas id="ceMet${sfx}"></canvas></div>
        <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
            케이지마다 투약 시작부터 그 주 끝까지의 누적 평균(구간 길이로 가중)을 낸 뒤 군 평균 ± 표준오차 · 점선은 목표.
            섭취량·투여량 화면의 붉은 누적선과 같은 계산입니다.
        </div>
    </div>` : ''}

    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; border-bottom:3px double var(--ink); padding-bottom:6px; margin-bottom:10px;">
            <h4 style="margin:0; color:var(--ink);">개체별 노출</h4>
            <button class="btn-small btn-blue" onclick="ceDownloadCsv('${sfx}')">CSV 받기</button>
        </div>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
            <thead><tr><th style="padding:6px; text-align:left;">개체</th><th style="padding:6px; text-align:left;">군</th>${th('케이지')}${th('상태')}${th('투약<br>일수')}${th('메트포민<br>평균 (목표 대비)')}${th('BAPN')}${th('NaCl')}${th('ARE')}<th style="padding:6px; text-align:left;">사인</th>${th('POD')}</tr></thead>
            <tbody>${tableRows}</tbody>
        </table></div>
        <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
            물통과 사료를 같이 쓰므로 개체값이 아니라 그 개체가 있던 케이지의 값입니다. 단위 mg/kg/일.
            투여 시작부터 사망(생존 중이면 오늘)까지, 그 개체가 케이지에 있던 구간만 셉니다. POD 뒤 +는 생존 중.
        </div>
    </div>`;
}

// 주 단위 군별 선 + ± 표준오차 띠 (+ 목표선)
function ceDrawWeekly(canvasId, groups, gInfo, byG, target, yTitle) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    const weeks = [...new Set(groups.flatMap(gk => Object.keys(byG[gk] || {}).map(Number)))].sort((a, b) => a - b);
    if (!weeks.length) { cv.parentElement.style.display = 'none'; return; }
    const labels = weeks.map(w => `W${w + 1}`);   // POD 0~6 = W1
    const datasets = [];
    groups.forEach(gk => {
        const col = gInfo[gk].color;
        const st = weeks.map(w => ceStat((byG[gk] || {})[w] || []));
        const alpha = /^#[0-9a-f]{6}$/i.test(col) ? col + '26' : col;
        if (st.some(s => s && s.n > 1)) {
            datasets.push({ label: '_hi' + gk, data: st.map(s => s && s.n > 1 ? s.mean + s.se : null), borderColor: 'transparent',
                            backgroundColor: alpha, pointRadius: 0, fill: '+1', tension: 0.2, spanGaps: true });
            datasets.push({ label: '_lo' + gk, data: st.map(s => s && s.n > 1 ? s.mean - s.se : null), borderColor: 'transparent',
                            backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0.2, spanGaps: true });
        }
        datasets.push({ label: gInfo[gk].label, data: st.map(s => s ? s.mean : null), borderColor: col, backgroundColor: col,
                        borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true, _n: st.map(s => s ? s.n : 0) });
    });
    if (target) datasets.push({ label: `목표 ${target}`, data: weeks.map(() => target), borderColor: '#5B5F66',
                                borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false });
    chMakeChart(canvasId, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { boxWidth: 12, font: { size: 11 }, filter: it => !String(it.text).startsWith('_') } },
                tooltip: { filter: it => !String(it.dataset.label).startsWith('_'),
                           callbacks: { label: it => {
                               const n = it.dataset._n ? it.dataset._n[it.dataIndex] : null;
                               return `${it.dataset.label}: ${it.parsed.y === null ? '-' : it.parsed.y.toFixed(1)}${n ? ` (케이지 ${n})` : ''}`; } } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: yTitle }, grid: { color: '#f0f0f0' } },
                x: { title: { display: true, text: '결찰 후 주' }, grid: { display: false } }
            }
        }
    });
}

function ceCsvText(sfx) {
    const rows = ceData[sfx] || [];
    const head = ['ratId', 'cohort', 'group', 'cage', 'status', 'metformin_days', 'metformin_mean_mgkgday',
                  'metformin_pct_of_target', 'target_mgkgday', 'bapn_mean_mgkgday', 'nacl_mean_mgkgday', 'ARE', 'COD', 'POD_end', 'alive'];
    const q = v => { const s = (v === null || v === undefined) ? '' : String(typeof v === 'number' ? +v.toFixed(2) : v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head.join(',')].concat(rows.map(r => [r.ratId, r.cohort, r.group, r.cage, r.status, r.metDays, r.met,
        r.metPct, r.target, r.bapn, r.nacl, r.are, r.cod, r.podEnd, r.alive ? 1 : 0].map(q).join(',')));
    return lines.join(String.fromCharCode(13, 10));   // CRLF — 엑셀 기본 줄바꿈
}

function ceDownloadCsv(sfx) {
    const rows = ceData[sfx] || [];
    // 엑셀에서 한글이 깨지지 않게 BOM(U+FEFF)을 붙인다
    const blob = new Blob([String.fromCharCode(0xFEFF) + ceCsvText(sfx)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exposure_${[...new Set(rows.map(r => r.cohort))].join('-')}_${getTodayStr()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
