// 2026-10-07 기존 기록 보정 — localhost:5500 에서 Ctrl+Shift+R 후 F12 콘솔에 붙여넣어 실행
//  ① cageFeeding(코호트 13.5)에 kgDays 채우기 — 재실 기록 × 개체별 체중으로 역산 (global.js rowKgDays 분모)
//  ② 사망 개체(전 코호트)에 lastAliveDate 채우기 — 사망일 = 발견일 규칙의 짝 (global.js lastAliveDateFor)
//  쓰기 전에 바뀌기 전 값(kgDays 대상 행 전체·사망 개체의 기존 lastAliveDate)을 JSON으로 내려받는다.
(async () => {
    if (typeof rowKgDays !== 'function' || typeof lastAliveDateFor !== 'function') { console.error('옛 코드입니다. Ctrl+Shift+R 후 다시 붙여넣으세요. (DB는 바뀌지 않았습니다)'); return; }
    const COHORTS = ['13.5'];                 // kgDays 를 채울 코호트 (케이지별 입력을 쓴 코호트만)
    const EDGE_MS = 30 * 60000;               // cage_input.js 와 같은 규칙
    const dl = (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    const log = [];

    // ── ① kgDays ──────────────────────────────────────────────
    const housing = (await db.collection('ratHousing').get()).docs.map(d => d.data());
    const measAll = (await db.collection('measurements').get()).docs.map(d => d.data()).filter(m => Number(m.weight) > 0 && m.date);
    const wBy = {};   // ratId -> [{date, w}] 날짜순
    measAll.forEach(m => (wBy[m.ratId] = wBy[m.ratId] || []).push({ date: String(m.date).slice(0, 10), w: Number(m.weight) }));
    Object.values(wBy).forEach(l => l.sort((a, b) => a.date.localeCompare(b.date)));
    // 구간 날짜 기준 가장 가까운 체중 (앞쪽 우선, 없으면 7일 안 뒤쪽)
    const wAt = (id, dateStr) => {
        const l = wBy[id] || []; let prev = null, next = null;
        l.forEach(x => { if (x.date <= dateStr) prev = x; else if (!next) next = x; });
        if (prev) return prev.w;
        if (next && (new Date(next.date) - new Date(dateStr)) / 864e5 <= 7) return next.w;
        return 0;
    };
    const backupRows = [], updates = [];
    for (const c of COHORTS) {
        const snap = await db.collection('cageFeeding').where('cohort', '==', c).get();
        snap.forEach(d => {
            const r = d.data();
            if (!(Number(r.intervalHours) > 0) || !r.at || !r.at.toMillis) return;
            const t1 = r.at.toMillis(), t0 = t1 - Number(r.intervalHours) * 3600000;
            let kgH = 0, ok = true, who = [];
            housing.filter(h => String(h.cageId) === String(r.cageId)).forEach(h => {
                const from = h.from && h.from.toMillis ? h.from.toMillis() : 0;
                const to = h.to && h.to.toMillis ? h.to.toMillis() : t1;
                const ov = Math.min(t1, to) - Math.max(t0, from);
                if (ov > EDGE_MS) { const w = wAt(h.ratId, r.dateStr); if (w > 0) { kgH += ov / 3600000 * w / 1000; who.push(`${h.ratId} ${w}g×${(ov / 3600000).toFixed(1)}h`); } else ok = false; }
            });
            if (!ok || !(kgH > 0)) { log.push(`  (건너뜀) ${r.dateStr} c${r.cageId}: 체중 모르는 개체 있음`); return; }
            const kgDays = Number((kgH / 24).toFixed(3));
            const oldKgd = rowKgDays({ ...r, kgDays: null });
            backupRows.push({ _id: d.id, dateStr: r.dateStr, cageId: r.cageId, kgDays: r.kgDays ?? null });
            updates.push({ ref: d.ref, kgDays });
            const diff = oldKgd > 0 ? Math.round((oldKgd / kgDays - 1) * 100) : null;
            log.push(`  ${r.dateStr} c${r.cageId}: kgDays ${kgDays} (옛 분모 ${oldKgd.toFixed(3)}${diff !== null && Math.abs(diff) >= 3 ? ` → 도달량 ${diff > 0 ? '−' : '+'}${Math.abs(diff)}% 보정` : ''}) [${who.join(', ')}]`);
        });
    }

    // ── ② lastAliveDate ───────────────────────────────────────
    const dead = (await db.collection('rats').where('status', '==', '사망').get()).docs.filter(d => d.data().deathDate && !d.data().archived);
    const laBackup = dead.map(d => ({ _id: d.id, ratId: d.data().ratId, lastAliveDate: d.data().lastAliveDate ?? null }));
    const laUpdates = [];
    for (const d of dead) {
        const r = d.data();
        const la = await lastAliveDateFor(r.ratId, r.deathDate);
        if ((r.lastAliveDate || null) === (la || null)) continue;
        laUpdates.push({ ref: d.ref, la });
        const gap = la ? Math.round((new Date(r.deathDate) - new Date(la)) / 864e5) : null;
        log.push(`  ${r.ratId}: 사망(발견) ${r.deathDate} · 마지막 생존 확인 ${la || '없음'}${gap !== null ? ` (${gap}일 전)` : ''}`);
    }

    dl('backup_before_backfill_2026-10-07.json', { note: '2026-10-07 kgDays·lastAliveDate 채우기 전 값', feeds: backupRows, rats: laBackup });

    // ── 쓰기 ──────────────────────────────────────────────────
    let batch = db.batch(), n = 0;
    const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0; } };
    for (const u of updates) { batch.update(u.ref, { kgDays: u.kgDays }); if (++n >= 400) await flush(); }
    for (const u of laUpdates) { batch.update(u.ref, { lastAliveDate: u.la || null }); if (++n >= 400) await flush(); }
    await flush();
    if (typeof clearRatsCache === 'function') clearRatsCache();
    console.log(`완료 — kgDays ${updates.length}행 · lastAliveDate ${laUpdates.length}마리\n` + log.join('\n'));
})();
