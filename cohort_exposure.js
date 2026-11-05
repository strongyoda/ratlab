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
        // 같은 물질의 사료 규칙이 기간을 나눠 여럿일 수 있다 (C14: BAPN free base → fumarate, G3 고염식은 전환일에 끝)
        const foodRules = (r, re) => ((cfgBy[String(r.cohort)] || {}).dosing || [])
            .filter(d => d.medium === 'food' && re.test(d.substance || '') && (d.groups || []).includes(ceGkey(r)) && Number(d.value) > 0);

        // ── 케이지 단위 ─────────────────────────────────────
        // 케이지의 군 · 결찰일은 그 케이지에 들어간 이 분석 대상 개체에서 가져온다
        const cages = {};   // cageKey -> { group, cohort, surg, rats:Set, iv:[] }
        Object.entries(rowsByCage).forEach(([ck, rows]) => {
            const mine = new Set();
            rows.forEach(r => (r.ratIds || []).forEach(id => { if (ratSet.has(id)) mine.add(id); }));
            if (!mine.size) return;
            const members = rats.filter(r => mine.has(r.ratId));
            const surgs = members.map(r => doseDateOf(r.surgeryDate)).filter(Boolean).sort();
            // 케이지의 군 = 배정된(G0 아닌) 개체의 군. 전환 전에 죽은 개체는 G0로 남으므로 첫 개체로 정하면
            // 그 케이지 전체가 G0로 빠진다 (2026-10-26 점검)
            const ref = members.find(r => ceGkey(r) !== 'G0') || members[0];
            cages[ck] = { key: ck, cohort: String(ref.cohort), group: ceGkey(ref), ref,
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
            return row.foodPerCapita * row.animalDays * foodRuleMgPerG(pctRule) / kgd;   // 염은 free base 환산
        };
        const cageFood = {};   // cageKey -> { bapn:[{pod,dose,days,end}], nacl:[...] }
        Object.values(cages).forEach(cg => {
            const ref = cg.ref || cg.rats[0];
            const out = { bapn: [], nacl: [] };
            [['bapn', /BAPN/i], ['nacl', /NaCl|염/i]].forEach(([k, re]) => {
                const rules = foodRules(ref, re);
                if (!rules.length) return;
                const starts = cg.rats.map(r => ceStartMs(r, rules[0])).filter(v => v !== null);
                if (!starts.length) return;
                const st = Math.min(...starts);      // 사료는 케이지 공용 — 한 마리라도 시작하면 케이지 전체가 먹는다
                cg.rows.forEach(row => {
                    const end = row.at?.toMillis?.() || ceMs(row.dateStr) + 43200000;
                    const days = row.animalDays / (row.ratCount || 1);
                    const start = end - (Number(row.intervalHours) || days * 24) * 3600000;
                    if (start < st) return;
                    // 기간이 나뉜 규칙은 그 구간 가운데 날에 들어가 있던 것 (global.js doseRuleOnDate)
                    const timed = rules.length > 1 || rules.some(d => d.endAnchor && d.endAnchor !== 'end');
                    const mid = feedRowMidDate(row);
                    const rule = !timed ? rules[0] : (mid ? rules.find(d => doseRuleOnDate(d, cg.rats, mid)) : null);
                    if (!rule) return;
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
            const rule = waterRule(cg.ref || cg.rats[0]);
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

        // ── ⓪ 물 · 사료 섭취 추이 (결찰 기준 일, 처치 시점 세로선) ──────────────
        const daily = ceDailyIntake(rats, cages, cfgBy, gkOfCage);

        box.innerHTML = ceDailyHtml(sfx, daily) + ceHtml(sfx, groupsPresent, gInfo, bapnAll, naclAll, metAll, ratRows);
        ceDrawDaily(`ceWater${sfx}`, groupsPresent.filter(gk => daily.water[gk]), gInfo, daily.water, daily.events, '물 mL / 마리 · 일', '물 섭취 — 마리당 하루 (mL)');
        ceDrawDaily(`ceFood${sfx}`, groupsPresent.filter(gk => daily.food[gk]), gInfo, daily.food, daily.events, '사료 g / 마리 · 일', '사료 섭취 — 마리당 하루 (g)');
        // 비교 화면이면 이 칸이 늦게 채워지므로 좌우 줄을 다시 맞춘다 (chart.js compAlign)
        if (box.closest('.comp-col') && typeof compAlign === 'function') setTimeout(compAlign, 0);
        ceDrawWeekly(`ceBapn${sfx}`, groupsPresent.filter(gk => bapnW[gk]), gInfo, bapnW, null, 'BAPN mg/kg/일', 'BAPN 섭취 — 주별 (mg/kg/일, free base)');
        const targets = [...new Set(rats.map(r => waterRule(r)).filter(Boolean).map(r => Number(r.value)))];
        if (Object.keys(metCum).length)
            ceDrawWeekly(`ceMet${sfx}`, groupsPresent.filter(gk => metCum[gk]), gInfo, metCum,
                         targets.length === 1 ? targets[0] : null, '메트포민 누적 평균 mg/kg/일', '메트포민 누적 도달 — 주별 (mg/kg/일)');
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
    <div class="card" data-sec="ce-food">
        ${h4('사료 속 BAPN · NaCl 실제 섭취 — 군 간 교란 점검')}
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">
            메트포민이 사료 섭취를 줄이면 투약군은 BAPN·염분도 덜 먹게 되고, 동맥류가 줄어도 메트포민 덕인지 가를 수 없습니다.
            군 사이 차이가 작아야 결론이 방어됩니다. <b>기준</b>은 메트포민이 없는 군입니다.
        </div>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
            <thead><tr><th style="padding:7px; text-align:left;">군</th>${th('BAPN<br><span style="font-weight:normal;">mg/kg/일 (free base)</span>')}${th('NaCl<br><span style="font-weight:normal;">mg/kg/일</span>')}${th('BAPN 기준 대비')}${th('케이지')}</tr></thead>
            <tbody>${foodRows || '<tr><td colspan="5" style="padding:8px; color:var(--ink-soft);">사료 속 약물 기록이 있는 군이 없습니다.</td></tr>'}</tbody>
        </table></div>
        <div style="height:230px; margin-top:14px;"><canvas id="ceBapn${sfx}"></canvas></div>
        <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
            결찰 후 주(POD 7일) 단위 · 선은 케이지 평균, 옅은 띠는 ± 표준오차 · n = 케이지 수.
            BAPN은 free base 환산값입니다(fumarate는 × 0.547). 고염식을 유지하는 군끼리는 NaCl이 같은 사료에 들어 있어 BAPN과 비율이 같고,
            고염식을 끊는 군(C14 G3)은 전환일부터 NaCl이 빠지는 것이 처치입니다. 교란 점검은 BAPN 열로 합니다. 10% 넘게 벌어지면 빨갛게 표시합니다.
        </div>
    </div>

    ${metRows ? `
    <div class="card" data-sec="ce-met">
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

    <div class="card" data-sec="ce-rats">
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

// ── 물 · 사료 섭취 추이 ───────────────────────────────────────
// 가로축 = 결찰일 기준 일(POD). 결찰 전은 음수(실제 일수 그대로)라 OVX · 고염식 시작이 군마다 같은 자리에 선다.
// 아직 결찰 전인 배치는 같은 코호트의 OVX→결찰 간격 중앙값(없으면 반입→결찰)으로 결찰일을 놓아 맞춘다.
// 케이지가 단위다(물통 · 사료를 같이 쓰므로): 하루마다 케이지 값 → 군 평균 ± SE, n = 케이지 수.
// 기록의 날짜 = 구간이 끝난 날. 주말 구간(금→월)은 사흘 평균이 월요일 한 점에 찍힌다.
const CE_DAILY_DROP = ['이상', '재실변동', '사망발생'];
function ceDailyIntake(rats, cages, cfgBy, gkOfCage) {
    const dd = (a, b) => Math.round((ceMs(b) - ceMs(a)) / 864e5);
    const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
    // 코호트마다 결찰 앞 간격
    const gap = {};
    [...new Set(rats.map(r => String(r.cohort)))].forEach(c => {
        const rs = rats.filter(r => String(r.cohort) === c && doseDateOf(r.surgeryDate));
        const go = rs.filter(r => doseDateOf(r.ovxDate)).map(r => dd(doseDateOf(r.ovxDate), doseDateOf(r.surgeryDate))).filter(v => v > 0);
        const ga = rs.filter(r => doseDateOf(r.arrivalDate)).map(r => dd(doseDateOf(r.arrivalDate), doseDateOf(r.surgeryDate))).filter(v => v > 0);
        gap[c] = { ovx: med(go) ?? 12, arr: med(ga) ?? 19, real: rs.length > 0 };
    });
    // 개체의 결찰일(없으면 추정) — 반환 { day, est }
    const anchorOf = r => {
        const s = doseDateOf(r.surgeryDate); if (s) return { day: s, est: false };
        const g = gap[String(r.cohort)];
        const o = doseDateOf(r.ovxDate); if (o) return { day: doseShift(o, g.ovx), est: true };
        const a = doseDateOf(r.arrivalDate); if (a) return { day: doseShift(a, g.arr), est: true };
        return null;
    };
    const water = {}, food = {};   // gk -> x -> [케이지 값]
    const put = (m, gk, x, v) => { m[gk] = m[gk] || {}; (m[gk][x] = m[gk][x] || []).push(v); };
    let estCages = 0;
    Object.values(cages).forEach(cg => {
        const an = cg.rats.map(anchorOf).filter(Boolean).sort((a, b) => a.day.localeCompare(b.day))[0];
        if (!an) return;
        if (an.est) estCages++;
        const gk = gkOfCage(cg);
        cg.rows.forEach(row => {
            if (!row.dateStr || (row.flags || []).some(f => CE_DAILY_DROP.includes(f))) return;
            const x = dd(an.day, row.dateStr);
            if (typeof row.waterPerCapita === 'number' && row.waterPerCapita >= 0) put(water, gk, x, row.waterPerCapita);
            if (typeof row.foodPerCapita === 'number' && row.foodPerCapita >= 0) put(food, gk, x, row.foodPerCapita);
        });
    });
    const events = ceEventList(rats, cfgBy, (r, day) => { const a = anchorOf(r); return (a && day) ? dd(a.day, day) : null; }, med);
    return { water, food, events, estCages, gap, anchorOf };
}

// 처치 시점 세로선 목록 — 코호트 설정의 규칙(보이는 군에 걸린 것만) + OVX · 결찰. 같은 자리는 한 줄로 합친다.
// rel(r, 'YYYY-MM-DD') = 그 날짜의 가로축 값(그래프마다 축이 달라 밖에서 준다), med = 개체들의 대표값.
// 사료가 끝나는 날(BAPN free base · 고염식)은 사료가 바뀌는 날이라 「전환일」로 이름을 붙인다 (2026-11-05 사용자).
function ceEventList(rats, cfgBy, rel, med) {
    med = med || (a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; });
    const cohorts = [...new Set(rats.map(r => String(r.cohort)))];
    const multi = cohorts.length > 1;
    const short = s => /NaCl|염/i.test(s) ? '고염식' : /fumarate/i.test(s) ? 'BAPN fumarate' : /BAPN/i.test(s) ? 'BAPN' : /metformin/i.test(s) ? '메트포민' : s;
    const evMap = {}, switchX = new Set(), podOf = {};
    const add = (x, label) => { if (x === null || x === undefined || !isFinite(x)) return; (evMap[x] = evMap[x] || new Set()).add(label); };
    cohorts.forEach(c => {
        const rs = rats.filter(r => String(r.cohort) === c);
        const pre = multi ? `C${c} ` : '';
        const gks = new Set(rs.map(ceGkey));
        const podMed = (day, mine) => med(mine.map(r => { const s = doseDateOf(r.surgeryDate), d = day(r); return (s && d) ? Math.round((ceMs(d) - ceMs(s)) / 864e5) : null; }).filter(v => v !== null));
        add(med(rs.map(r => rel(r, doseDateOf(r.ovxDate))).filter(v => v !== null)), pre + 'OVX');
        add(med(rs.map(r => rel(r, doseDateOf(r.surgeryDate))).filter(v => v !== null)) ?? 0, pre + '결찰');
        ((cfgBy[c] || {}).dosing || []).forEach(rule => {
            if (!(rule.groups || []).some(g => gks.has(g)) || !(Number(rule.value) > 0)) return;
            const mine = rs.filter(r => (rule.groups || []).includes(ceGkey(r)));
            const st = med(mine.map(r => rel(r, doseRuleWindow(rule, [r]).start)).filter(v => v !== null));
            add(st, pre + short(rule.substance || '') + (rule.medium === 'water' ? ' 시작' : ''));
            // 끝은 설정(endAnchor)에서도, 개체에 적은 고염식 중단일에서도 나온다 (global.js doseRuleWindow)
            if (rule.medium === 'food') {
                const en = med(mine.map(r => rel(r, doseRuleWindow(rule, [r]).end)).filter(v => v !== null));
                if (en === null || en === undefined) return;
                switchX.add(en);
                podOf[en] = podMed(r => doseRuleWindow(rule, [r]).end, mine);
                // 고염식이 끝나면 '고염식 중단(군)'. BAPN free base 끝은 fumarate 시작과 같은 자리라 이름은 전환일로만
                if (/NaCl|염/i.test(rule.substance || '')) add(en, pre + `고염식 중단(${(rule.groups || []).join('·')})`);
            }
        });
    });
    return [...new Set(Object.keys(evMap).map(Number).concat([...switchX]))].sort((a, b) => a - b).map(x => {
        const label = [...(evMap[x] || [])].join(' · ');
        const pod = podOf[x];
        return { x, label: switchX.has(x) ? `전환일${pod !== null && pod !== undefined ? ` (POD ${pod})` : ''}${label ? ' · ' + label : ''}` : label };
    });
}

function ceDailyHtml(sfx, daily) {
    if (!Object.keys(daily.water).length && !Object.keys(daily.food).length) return '';
    const gapNote = Object.entries(daily.gap)
        .map(([c, g]) => `C${c} OVX → 결찰 ${g.ovx}일${g.real ? '' : '(기본값)'}`).join(' · ');
    return `
    <div class="card" data-sec="ce-daily">
        <h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">물 · 사료 섭취 추이</h4>
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:8px;">
            결찰일 기준 일(POD, 결찰 전은 음수) · 선은 케이지 평균, 옅은 띠는 ± 표준오차 · n = 케이지 수.
            세로선은 코호트 설정의 처치 시점(OVX · 고염식 · 결찰 · BAPN · 사료 전환 · 투약)입니다. 이상 · 재실변동 · 사망발생 구간은 뺍니다.
        </div>
        <div style="height:300px;"><canvas id="ceWater${sfx}"></canvas></div>
        <div style="height:300px; margin-top:16px;"><canvas id="ceFood${sfx}"></canvas></div>
        <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
            기록 날짜 = 구간이 끝난 날이라 주말(금→월) 사흘 평균은 월요일에 찍힙니다.
            ${daily.estCages ? `아직 결찰 전인 케이지 ${daily.estCages}개는 결찰일을 추정해 맞췄습니다 (${gapNote}).` : ''}
        </div>
    </div>`;
}

// ── 배치 비교: 배치를 한 그래프에 겹쳐 보기 (코호트 비교 → 배치 비교) ──────────────
// 군을 합친 배치끼리만 본다 — 배치마다 세 군이 고르게 섞여 있어 진행 중에 봐도 처치 효과가 드러나지 않는다.
// 배치 × 군으로 쪼개면 칸마다 2~6마리라 숫자가 의미 없고, 진행 중 군 차이를 보게 되므로 하지 않는다 (2026-11-02).
async function ceBatchOverlay(container, cohort, rats, bOf, picked, colors, cfg) {
    const old = document.getElementById('batch-overlay-wrapper'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'batch-overlay-wrapper'; wrap.className = 'card';
    wrap.innerHTML = '<div class="loader"></div> 배치 겹쳐 보기 계산 중...';
    container.parentNode.insertBefore(wrap, container);
    try {
        const [fs, measByRat] = await Promise.all([
            db.collection('cageFeeding').where('cohort', '==', String(cohort)).get(),
            chFetchMeasByRatIds(rats.map(r => r.ratId))]);
        const byId = {}; rats.forEach(r => { byId[r.ratId] = r; });
        // 케이지 = 급여 기록의 케이지 번호. 한 케이지는 한 배치라(합사는 같은 배치끼리) 첫 개체의 배치로 정한다
        const cages = {};
        fs.forEach(d => {
            const v = d.data(); const mem = (v.ratIds || []).map(id => byId[id]).filter(Boolean);
            if (!mem.length) return;
            const k = String(v.cageId);
            (cages[k] = cages[k] || { rats: [], rows: [] }).rows.push(v);
            mem.forEach(r => { if (!cages[k].rats.includes(r)) cages[k].rats.push(r); });
        });
        const daily = ceDailyIntake(rats, cages, { [String(cohort)]: cfg }, cg => 'B' + bOf(cg.rats[0]));
        const gInfo = {}; const gks = picked.map(b => 'B' + b);
        picked.forEach(b => {
            const n = rats.filter(r => bOf(r) === b).length;
            gInfo['B' + b] = { label: `Batch ${b} (n=${n})`, color: colors[(b - 1) % colors.length] };
        });
        // 체중 · 혈압: 개체가 단위 (n = 마리)
        const dd = (a, b2) => Math.round((ceMs(b2) - ceMs(a)) / 864e5);
        const wt = {}, sbp = {};
        const put = (m, gk, x, v) => { m[gk] = m[gk] || {}; (m[gk][x] = m[gk][x] || []).push(v); };
        rats.forEach(r => {
            const an = daily.anchorOf(r); if (!an) return;
            const gk = 'B' + bOf(r);
            (measByRat[r.ratId] || []).forEach(m => {
                const d = String(m.date || '').slice(0, 10); if (!d) return;
                const x = dd(an.day, d);
                if (Number(m.weight) > 0) put(wt, gk, x, Number(m.weight));
                if (Number(m.sbp) > 0) put(sbp, gk, x, Number(m.sbp));
            });
        });
        // 요약 표
        const med = a => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y); return t[Math.floor((t.length - 1) / 2)]; };
        const mean = a => a.length ? a.reduce((p, c) => p + c, 0) / a.length : null;
        const near = (m, gk, lo, hi) => Object.entries(m[gk] || {}).filter(([x]) => Number(x) >= lo && Number(x) <= hi).flatMap(([, v]) => v);
        const today = getTodayStr();
        const isSac = r => !!r.sampleDate && (r.cod === 'Sacrifice' || !r.cod);
        const f = (v, d = 0) => (v === null || v === undefined) ? '-' : Number(v).toFixed(d);
        const rows = picked.map(b => {
            const rs = rats.filter(r => bOf(r) === b), gk = 'B' + b;
            const dead = rs.filter(r => r.status === '사망' || r.deathDate);
            const fail = rs.filter(r => (r.cod || extractLegacyCod(r.codFull)) === 'Surgical Failure');
            const unexp = dead.filter(r => !isSac(r));
            const cods = {};
            unexp.forEach(r => { const c = r.cod || extractLegacyCod(r.codFull) || '미기록'; cods[c] = (cods[c] || 0) + 1; });
            const pods = unexp.map(r => { const s = doseDateOf(r.surgeryDate), d = doseDateOf(r.deathDate); return (s && d) ? dd(s, d) : null; }).filter(v => v !== null);
            const judged = rs.filter(r => r.are), areO = judged.filter(r => String(r.are).startsWith('O'));
            const ovxLig = rs.map(r => { const o = doseDateOf(r.ovxDate), s = doseDateOf(r.surgeryDate); return (o && s) ? dd(o, s) : null; }).filter(v => v !== null);
            const w0 = mean(near(wt, gk, -2, 0)), wa = mean(near(daily.water, gk, -3, 0));
            const codTxt = Object.entries(cods).map(([c, n]) => `${ceEsc(c)} ${n}`).join(', ');
            return `<tr style="border-bottom:1px solid var(--rule);">
                <td style="padding:6px;"><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${gInfo[gk].color}; margin-right:6px;"></span>Batch ${b}</td>
                <td class="mono" style="padding:6px; text-align:center;">${rs.length}</td>
                <td class="mono" style="padding:6px; text-align:center;">${rs.length - dead.length}</td>
                <td style="padding:6px; text-align:center;">${unexp.length ? `${unexp.length} <span style="color:var(--ink-soft); font-size:0.78rem;">(${codTxt})</span>` : '0'}</td>
                <td class="mono" style="padding:6px; text-align:center;">${fail.length}</td>
                <td class="mono" style="padding:6px; text-align:center;">${pods.length ? `${med(pods)} (${Math.min(...pods)}~${Math.max(...pods)})` : '-'}</td>
                <td class="mono" style="padding:6px; text-align:center;">${judged.length ? `${areO.length}/${judged.length}` : '-'}</td>
                <td class="mono" style="padding:6px; text-align:center;">${ovxLig.length ? med(ovxLig) : '-'}</td>
                <td class="mono" style="padding:6px; text-align:center;">${f(w0, 1)}</td>
                <td class="mono" style="padding:6px; text-align:center;">${f(wa, 0)}</td>
            </tr>`;
        }).join('');
        const th = t => `<th style="padding:6px; text-align:center; font-size:0.78rem;">${t}</th>`;
        wrap.innerHTML = `
            <h4 style="margin-top:0; color:var(--ink); border-bottom:3px double var(--ink); padding-bottom:6px;">배치 겹쳐 보기 — 코호트 ${ceEsc(cohort)}</h4>
            <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">
                군을 합쳐 배치끼리만 봅니다(배치마다 세 군이 고르게 섞여 있어 처치 효과는 드러나지 않습니다). 가로축은 결찰 기준 일(POD).
                체중 · 혈압은 마리, 물 · 사료는 케이지가 단위입니다. 선은 평균, 옅은 띠는 ± 표준오차.
            </div>
            <div style="overflow-x:auto; margin-bottom:12px;"><table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
                <thead><tr><th style="padding:6px; text-align:left;">배치</th>${th('마리')}${th('생존')}${th('예정 외 사망<br>(사인)')}${th('수술 실패')}${th('사망 POD<br>중앙(범위)')}${th('ARE<br>O/판정')}${th('OVX→결찰<br>일')}${th('결찰 시 체중<br>g')}${th('결찰 직전 물<br>mL/마리·일')}</tr></thead>
                <tbody>${rows}</tbody></table></div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
                <div style="height:280px;"><canvas id="batOvWt"></canvas></div>
                <div style="height:280px;"><canvas id="batOvWater"></canvas></div>
                <div style="height:280px;"><canvas id="batOvFood"></canvas></div>
                <div style="height:280px;"><canvas id="batOvSbp"></canvas></div>
                <div style="height:280px;"><canvas id="batOvSurv"></canvas></div>
            </div>
            <div style="font-size:0.76rem; color:var(--ink-soft); margin-top:6px;">
                ${daily.estCages ? `아직 결찰 전인 케이지는 결찰일을 OVX + ${daily.gap[String(cohort)].ovx}일로 추정해 맞췄습니다. ` : ''}생존 곡선은 결찰일부터, 계획 희생 · 생존 중은 중도절단으로 셉니다.
            </div>`;
        ceDrawDaily('batOvWt', gks.filter(g => wt[g]), gInfo, wt, daily.events, '체중 g', '체중 (g)');
        ceDrawDaily('batOvWater', gks.filter(g => daily.water[g]), gInfo, daily.water, daily.events, '물 mL / 마리 · 일', '물 섭취 — 마리당 하루 (mL)');
        ceDrawDaily('batOvFood', gks.filter(g => daily.food[g]), gInfo, daily.food, daily.events, '사료 g / 마리 · 일', '사료 섭취 — 마리당 하루 (g)');
        ceDrawDaily('batOvSbp', gks.filter(g => sbp[g]), gInfo, sbp, daily.events, 'SBP mmHg', '혈압 — 수축기 SBP (mmHg)');
        // 생존 곡선 (Kaplan–Meier, 결찰일부터)
        const surv = gks.map(gk => {
            const b = Number(gk.slice(1));
            const pts = rats.filter(r => bOf(r) === b && doseDateOf(r.surgeryDate)).map(r => {
                const s = doseDateOf(r.surgeryDate), d = doseDateOf(r.deathDate);
                return { t: dd(s, d || today), event: !!d && !isSac(r) };
            }).sort((a, b2) => a.t - b2.t);
            if (!pts.length) return null;
            let atRisk = pts.length, sv = 1;
            const data = [{ x: 0, y: 100 }];
            [...new Set(pts.map(p => p.t))].forEach(t => {
                const ev = pts.filter(p => p.t === t && p.event).length, out = pts.filter(p => p.t === t).length;
                if (ev) { data.push({ x: t, y: sv * 100 }); sv *= (1 - ev / atRisk); data.push({ x: t, y: sv * 100 }); }
                atRisk -= out;
            });
            data.push({ x: Math.max(...pts.map(p => p.t)), y: sv * 100 });
            return { label: gInfo[gk].label, data, borderColor: gInfo[gk].color, backgroundColor: gInfo[gk].color, borderWidth: 2, pointRadius: 0, tension: 0 };
        }).filter(Boolean);
        if (surv.length) chMakeChart('batOvSurv', { type: 'line', data: { datasets: surv }, options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } }, title: ceTitle('생존율 — 결찰 후 (%)') },
            scales: { x: { type: 'linear', min: 0, title: { display: true, text: 'POD' } }, y: { min: 0, max: 100, title: { display: true, text: '생존 %' } } } } });
        else { const cv = document.getElementById('batOvSurv'); if (cv) cv.parentElement.innerHTML = '<div style="color:var(--ink-soft); padding-top:40px; text-align:center;">결찰한 개체가 아직 없습니다 (생존 곡선)</div>'; }
    } catch (e) {
        console.error(e);
        wrap.innerHTML = `<div style="color:var(--stamp);">배치 겹쳐 보기를 계산하지 못했습니다: ${ceEsc(e.message)}</div>`;
    }
}

// 처치 시점 세로선 (숫자 x축). 글자는 겹치지 않게 줄을 돌려 가며 단다
const ceEventPlugin = {
    id: 'ceEvents',
    afterDatasetsDraw(chart, args, opts) {
        const evs = (opts && opts.list) || [];
        if (!evs.length) return;
        const { ctx, chartArea: area, scales } = chart;
        let row = 0, lastX = -1e9;
        evs.forEach(ev => {
            const x = scales.x.getPixelForValue(ev.x);
            if (!(x >= area.left && x <= area.right)) return;
            row = (x - lastX < 90) ? (row + 1) % 3 : 0; lastX = x;
            ctx.save();
            ctx.setLineDash([4, 3]); ctx.strokeStyle = '#7A5C00'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#7A5C00'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(' ' + ev.label, x + 1, area.top + 10 + row * 12);
            ctx.restore();
        });
    }
};

// 그래프 위 제목 — 교수님 · 처음 보는 사람이 세로축 이름을 찾지 않고 무슨 그래프인지 바로 알게 (2026-11-02 사용자)
const ceTitle = text => text ? { display: true, text, align: 'start', color: '#1F2328', font: { size: 13, weight: 'bold' }, padding: { top: 2, bottom: 8 } } : { display: false };

// 일 단위 군별 선 + ± 표준오차 띠, 숫자 x축(POD)
function ceDrawDaily(canvasId, groups, gInfo, byG, events, yTitle, title) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    const xs = [...new Set(groups.flatMap(gk => Object.keys(byG[gk] || {}).map(Number)))].sort((a, b) => a - b);
    if (!xs.length) { cv.parentElement.style.display = 'none'; return; }
    const datasets = [];
    groups.forEach(gk => {
        const col = gInfo[gk].color;
        const pts = xs.map(x => ({ x, s: ceStat((byG[gk] || {})[x] || []) })).filter(p => p.s);
        const alpha = /^#[0-9a-f]{6}$/i.test(col) ? col + '26' : col;
        if (pts.some(p => p.s.n > 1)) {
            datasets.push({ label: '_hi' + gk, data: pts.map(p => ({ x: p.x, y: p.s.n > 1 ? p.s.mean + p.s.se : p.s.mean })), borderColor: 'transparent',
                            backgroundColor: alpha, pointRadius: 0, fill: '+1', tension: 0.2 });
            datasets.push({ label: '_lo' + gk, data: pts.map(p => ({ x: p.x, y: p.s.n > 1 ? p.s.mean - p.s.se : p.s.mean })), borderColor: 'transparent',
                            backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0.2 });
        }
        datasets.push({ label: gInfo[gk].label, data: pts.map(p => ({ x: p.x, y: p.s.mean, n: p.s.n })), borderColor: col, backgroundColor: col,
                        borderWidth: 2, pointRadius: 2.5, tension: 0.2 });
    });
    const evXs = (events || []).map(e => e.x);
    const minX = Math.min(xs[0], ...evXs.filter(x => x >= xs[0] - 3)) - 1, maxX = Math.max(xs[xs.length - 1], ...evXs.filter(x => x <= xs[xs.length - 1] + 3)) + 1;
    chMakeChart(canvasId, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false, parsing: true,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                title: ceTitle(title),
                ceEvents: { list: events || [] },
                legend: { labels: { boxWidth: 12, font: { size: 11 }, filter: it => !String(it.text).startsWith('_') } },
                tooltip: { filter: it => !String(it.dataset.label).startsWith('_'),
                           callbacks: { title: items => items.length ? `POD ${items[0].parsed.x}` : '',
                                        label: it => `${it.dataset.label}: ${it.parsed.y.toFixed(1)}${it.raw && it.raw.n ? ` (케이지 ${it.raw.n})` : ''}` } }
            },
            scales: {
                x: { type: 'linear', min: minX, max: maxX, title: { display: true, text: '결찰 기준 일 (POD)' },
                     afterBuildTicks: sc => { const t = []; for (let v = Math.ceil(sc.min / 7) * 7; v <= sc.max; v += 7) t.push({ value: v }); sc.ticks = t; },
                     ticks: { callback: v => (v === 0 ? 'D0' : v > 0 && v % 7 === 0 ? `W${v / 7}` : `D${v}`) }, grid: { color: '#f0f0f0' } },
                y: { beginAtZero: true, title: { display: true, text: yTitle }, grid: { color: '#f0f0f0' } }
            }
        },
        plugins: [ceEventPlugin]
    });
}

// 주 단위 군별 선 + ± 표준오차 띠 (+ 목표선)
function ceDrawWeekly(canvasId, groups, gInfo, byG, target, yTitle, title) {
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
                title: ceTitle(title),
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
