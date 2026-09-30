// ⚠ 실행 완료(2026-09-30). 방향 뒤집힘 버그가 있어 fix_are_coords_2026-09-30.js 로 바로잡았다 — 다시 실행하지 말 것
// 2026-09-30 ARE 위치 좌표를 옛 그림(are_map_base.png) → 새 그림(artery2.png)으로 옮긴다
// 새 그림의 혈관 좌표를 확정(are_map.js 반영)한 뒤, localhost:5500 에서 Ctrl+Shift+R 후 콘솔에 붙여넣어 실행
//  · 분지부에 찍힌 점은 새 그림의 같은 이름·같은 쪽 분지부로
//  · 아니면 옛 그림에서 가장 가까운 혈관의 '길이 비율 위치'를 새 그림의 같은 이름·같은 쪽 혈관에 옮긴다
//  · 옮길 곳이 없으면 x, y를 지우고(부위 추정 점으로 표시됨) 목록에 남긴다
//  · 쓰기 전에 바뀌기 전 값 전체를 JSON 파일로 먼저 내려받는다
(async () => {
    if (!window.AreMap || !String(AreMap.IMG).startsWith('artery2')) { console.error('새 그림 코드가 아닙니다. Ctrl+Shift+R 후 다시 붙여넣으세요. (DB는 바뀌지 않았습니다)'); return; }
    const OLD = {"segs": [{"side": "R", "art": "ICA", "label": "ICA", "pts": [[128.3, 396.9], [145, 370], [144.9, 327.1], [144.9, 297.2], [167.5, 266.6], [174.8, 229.4], [190.1, 215.4], [185, 182]]}, {"side": "R", "art": "MCA", "label": "MCA", "pts": [[185, 180], [158.2, 170.2], [135, 175]]}, {"side": "R", "art": "ACA", "label": "ACA", "pts": [[185, 180], [190.1, 156.2], [196, 142], [203, 133]]}, {"side": "R", "art": "ACA", "label": "Olfactory a.", "pts": [[182.8, 150.9], [196.1, 79.1]]}, {"side": "R", "art": "P-com", "label": "P-com", "pts": [[190.8, 222.7], [192, 240]]}, {"side": "R", "art": "PCA", "label": "PCA", "pts": [[204.8, 261.3], [191.5, 246.6]]}, {"side": "L", "art": "ICA", "label": "ICA", "pts": [[283.2, 398.9], [265, 370], [271.9, 319.8], [264.6, 287.9], [245.3, 252.6], [244.7, 224.7], [233.4, 210.1], [231.4, 182.8]]}, {"side": "L", "art": "MCA", "label": "MCA", "pts": [[231.4, 181.5], [254.6, 172.9], [269.3, 170.2]]}, {"side": "L", "art": "ACA", "label": "ACA", "pts": [[231.4, 179.5], [223.4, 157.6], [214, 142], [207, 133]]}, {"side": "L", "art": "ACA", "label": "Olfactory a.", "pts": [[230, 149.6], [218.1, 76.5]]}, {"side": "L", "art": "P-com", "label": "P-com", "pts": [[230.7, 219.4], [227.4, 242]]}, {"side": "L", "art": "PCA", "label": "PCA", "pts": [[217.4, 261.3], [226.7, 248]]}, {"side": "A-com", "art": "-", "label": "Azygos ACA", "pts": [[203, 133], [208.8, 98.4], [209.4, 57.8]]}, {"side": "BA", "art": "-", "label": "Basilar a.", "pts": [[213.4, 268.6], [208.1, 319.1], [207, 395]]}], "landmarks": [{"side": "R", "art": "ICA", "label": "ICA 분지부", "x": 187, "y": 184}, {"side": "R", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 184.2, "y": 152.2}, {"side": "R", "art": "PCA", "label": "PCA P1", "x": 198.2, "y": 254}, {"side": "R", "art": "PCA", "label": "P1–P-com 접합부", "x": 192.8, "y": 244}, {"side": "L", "art": "ICA", "label": "ICA 분지부", "x": 232, "y": 182.8}, {"side": "L", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 226.7, "y": 153.6}, {"side": "L", "art": "PCA", "label": "PCA P1", "x": 222.1, "y": 254.7}, {"side": "L", "art": "PCA", "label": "P1–P-com 접합부", "x": 226.7, "y": 246}, {"side": "A-com", "art": "-", "label": "A-com (ACA 합류부)", "x": 203, "y": 133}, {"side": "BA", "art": "-", "label": "Basilar top", "x": 212.1, "y": 265.9}]};
    const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t }; };
    const lens = pts => pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const fracOn = (pts, p) => {
        const L = lens(pts), tot = L.reduce((a, b) => a + b, 0) || 1; let best = { d: 1e9, f: 0 }, acc = 0;
        for (let i = 0; i < L.length; i++) { const r = dist(p, pts[i], pts[i + 1]); if (r.d < best.d) best = { d: r.d, f: (acc + r.t * L[i]) / tot }; acc += L[i]; }
        return best;
    };
    const atFrac = (pts, f) => {
        const L = lens(pts); let rem = f * L.reduce((a, b) => a + b, 0);
        for (let i = 0; i < L.length; i++) { if (rem <= L[i]) { const t = L[i] ? rem / L[i] : 0; return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; } rem -= L[i]; }
        return pts[pts.length - 1];
    };
    const r1 = v => Math.round(v * 10) / 10;
    const siteAlias = { 'Basilar top (perforator)': 'Basilar top' };

    function move(l) {
        const p = [l.x, l.y];
        const lmName = siteAlias[l.site] || l.site;
        const wasLm = lmName && OLD.landmarks.find(m => m.side === l.side && m.label === lmName && Math.hypot(m.x - l.x, m.y - l.y) < 3);
        const newLm = lmName && AreMap.LANDMARKS.find(m => m.side === l.side && m.label === lmName);
        if (wasLm && newLm) return { x: newLm.x, y: newLm.y, how: '분지부' };
        let best = null;
        OLD.segs.forEach(sg => { const r = fracOn(sg.pts, p); if (!best || r.d < best.d) best = { ...r, sg }; });
        const target = best && AreMap.SEGS.find(s => s.side === best.sg.side && s.label === best.sg.label);
        if (!target) return null;
        const q = atFrac(target.pts, best.f);
        return { x: r1(q[0]), y: r1(q[1]), how: best.sg.label + ' ' + Math.round(best.f * 100) + '% 지점' };
    }

    const snap = await db.collection('rats').get();
    const todo = [];
    snap.forEach(d => { const r = d.data(); if ((r.areList || []).some(l => typeof l.x === 'number')) todo.push({ ref: d.ref, r }); });

    // 바뀌기 전 값 내려받기
    const backup = todo.map(t => ({ _id: t.ref.id, ratId: t.r.ratId, areList: t.r.areList }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ note: '2026-09-30 좌표 이전 전 areList', rats: backup }, null, 1)], { type: 'application/json' }));
    a.download = 'backup_are_coords_before_artery2_2026-09-30.json';
    document.body.appendChild(a); a.click(); a.remove();

    const out = [];
    for (const { ref, r } of todo) {
        const list = r.areList.map(l => {
            if (typeof l.x !== 'number') return l;
            const m = move(l);
            if (!m) { out.push('  ' + r.ratId + ': ' + l.side + ' ' + (l.site || l.art) + ' → 옮길 곳 없음, 좌표 지움'); const { x, y, ...rest } = l; return rest; }
            out.push('  ' + r.ratId + ': ' + l.side + ' ' + (l.site || l.art) + ' (' + l.x + ',' + l.y + ') → (' + m.x + ',' + m.y + ') [' + m.how + ']');
            return { ...l, x: m.x, y: m.y };
        });
        await ref.update({ areList: list });
    }
    if (typeof clearRatsCache === 'function') clearRatsCache();
    console.log('좌표 이전 완료 — ' + todo.length + '마리\n' + out.join('\n'));
})();
