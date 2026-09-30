// 2026-09-30 좌표 이전 바로잡기 — 첫 이전(migrate_are_coords_2026-09-30.js)에서
//  · 점 순서가 반대인 혈관(Azygos, Olfactory a., R PCA)의 위치가 뒤집혔고
//  · 분지부 이름이 붙은 점 일부(C0912, C1321 A-com)가 분지부로 가지 않았다.
// 첫 이전 전 값(backup_are_coords_before_artery2_2026-09-30.json, 아래에 들어 있음)에서 다시 계산해 덮어쓴다.
// localhost:5500 에서 Ctrl+Shift+R 후 콘솔에 붙여넣어 실행
(async () => {
    if (!window.AreMap || !String(AreMap.IMG).startsWith('artery2')) { console.error('새 그림 코드가 아닙니다. Ctrl+Shift+R 후 다시 붙여넣으세요. (DB는 바뀌지 않았습니다)'); return; }
    const OLD = {"segs": [{"side": "R", "art": "ICA", "label": "ICA", "pts": [[128.3, 396.9], [145, 370], [144.9, 327.1], [144.9, 297.2], [167.5, 266.6], [174.8, 229.4], [190.1, 215.4], [185, 182]]}, {"side": "R", "art": "MCA", "label": "MCA", "pts": [[185, 180], [158.2, 170.2], [135, 175]]}, {"side": "R", "art": "ACA", "label": "ACA", "pts": [[185, 180], [190.1, 156.2], [196, 142], [203, 133]]}, {"side": "R", "art": "ACA", "label": "Olfactory a.", "pts": [[182.8, 150.9], [196.1, 79.1]]}, {"side": "R", "art": "P-com", "label": "P-com", "pts": [[190.8, 222.7], [192, 240]]}, {"side": "R", "art": "PCA", "label": "PCA", "pts": [[204.8, 261.3], [191.5, 246.6]]}, {"side": "L", "art": "ICA", "label": "ICA", "pts": [[283.2, 398.9], [265, 370], [271.9, 319.8], [264.6, 287.9], [245.3, 252.6], [244.7, 224.7], [233.4, 210.1], [231.4, 182.8]]}, {"side": "L", "art": "MCA", "label": "MCA", "pts": [[231.4, 181.5], [254.6, 172.9], [269.3, 170.2]]}, {"side": "L", "art": "ACA", "label": "ACA", "pts": [[231.4, 179.5], [223.4, 157.6], [214, 142], [207, 133]]}, {"side": "L", "art": "ACA", "label": "Olfactory a.", "pts": [[230, 149.6], [218.1, 76.5]]}, {"side": "L", "art": "P-com", "label": "P-com", "pts": [[230.7, 219.4], [227.4, 242]]}, {"side": "L", "art": "PCA", "label": "PCA", "pts": [[217.4, 261.3], [226.7, 248]]}, {"side": "A-com", "art": "-", "label": "Azygos ACA", "pts": [[203, 133], [208.8, 98.4], [209.4, 57.8]]}, {"side": "BA", "art": "-", "label": "Basilar a.", "pts": [[213.4, 268.6], [208.1, 319.1], [207, 395]]}], "landmarks": [{"side": "R", "art": "ICA", "label": "ICA 분지부", "x": 187, "y": 184}, {"side": "R", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 184.2, "y": 152.2}, {"side": "R", "art": "PCA", "label": "PCA P1", "x": 198.2, "y": 254}, {"side": "R", "art": "PCA", "label": "P1–P-com 접합부", "x": 192.8, "y": 244}, {"side": "L", "art": "ICA", "label": "ICA 분지부", "x": 232, "y": 182.8}, {"side": "L", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 226.7, "y": 153.6}, {"side": "L", "art": "PCA", "label": "PCA P1", "x": 222.1, "y": 254.7}, {"side": "L", "art": "PCA", "label": "P1–P-com 접합부", "x": 226.7, "y": 246}, {"side": "A-com", "art": "-", "label": "A-com (ACA 합류부)", "x": 203, "y": 133}, {"side": "BA", "art": "-", "label": "Basilar top", "x": 212.1, "y": 265.9}]};
    const BEFORE = {"note": "2026-09-30 좌표 이전 전 areList", "rats": [{"_id": "0O4BY83noB461YBlaL1P", "ratId": "C1011G1", "areList": [{"x": 193.9, "side": "R", "y": 140.9, "art": "ACA", "type": "micro", "site": "ACA"}]}, {"_id": "0YwWZrXWUAmjSHTK1oW0", "ratId": "C1001G1", "areList": [{"type": "macro", "site": "PCA P1", "art": "PCA", "y": 255, "side": "L", "x": 221.1}]}, {"_id": "20R5MYVzvufN2eSYJrli", "ratId": "C0401G1", "areList": [{"y": 83.7, "side": "A-com", "site": "Azygos ACA", "type": "micro", "x": 210.1, "art": "-"}]}, {"_id": "5zTZHAUgYcAE2heUMkVT", "ratId": "C1006G1", "areList": [{"site": "ACA", "type": "미확인", "art": "ACA", "side": "R", "y": 145.9, "x": 191.6}]}, {"_id": "6HNenWrEDvMJQU9Y4BHa", "ratId": "C1101G1", "areList": [{"x": 221.8, "art": "ACA", "side": "L", "y": 152, "site": "ACA–olfactory 분지부", "type": "미확인"}]}, {"_id": "9ZmTJ4vVXjsZPwBSLeC8", "ratId": "C0310G1", "areList": [{"y": 254.7, "art": "PCA", "site": "PCA P1", "type": "macro", "side": "L", "x": 222.1}]}, {"_id": "EDPjslnXGi20uOhOnxcE", "ratId": "C0305G1", "areList": [{"side": "R", "x": 187, "site": "ICA 분지부", "type": "micro", "art": "ICA", "y": 184}]}, {"_id": "HM8ssjoXZSjf8IefQ0Sp", "ratId": "C0406G1", "areList": [{"y": 254.7, "art": "PCA", "side": "L", "site": "PCA P1", "type": "macro", "x": 222.1}]}, {"_id": "JRvzBwwBYJ8LWP8qzWQS", "ratId": "C0608G1", "areList": [{"side": "R", "x": 186.5, "type": "micro", "site": "ACA–olfactory 분지부", "y": 156, "art": "ACA"}, {"type": "micro", "site": "ICA 분지부", "x": 184.9, "art": "ICA", "side": "R", "y": 181.8}]}, {"_id": "Mbel8JtSMq85uBM4QWpH", "ratId": "C0311G1", "areList": [{"side": "R", "y": 152.2, "type": "micro", "site": "ACA–olfactory 분지부", "x": 184.2, "art": "ACA"}]}, {"_id": "N1EEAK4dfKM8lLCJMRjb", "ratId": "C0407G1", "areList": [{"site": "ACA–olfactory 분지부", "type": "micro", "y": 153.6, "side": "R", "art": "ACA", "x": 182.6}]}, {"_id": "OVK7GxGo0Q1TDdGVvB89", "ratId": "C0314G1", "areList": [{"y": 152.2, "side": "R", "x": 184.2, "type": "micro", "site": "ACA–olfactory 분지부", "art": "ACA"}, {"y": 184, "site": "ICA 분지부", "type": "macro", "side": "R", "art": "ICA", "x": 187}, {"side": "A-com", "type": "micro", "x": 203, "site": "A-com (ACA 합류부)", "art": "-", "y": 133}, {"side": "L", "x": 219.5, "site": "PCA P1", "type": "macro", "y": 254.4, "art": "PCA"}]}, {"_id": "OsRfCyWAluTes5KJu4qv", "ratId": "C0504G1", "areList": [{"y": 152.2, "side": "R", "x": 184.2, "art": "ACA", "type": "micro", "site": "ACA–olfactory 분지부"}]}, {"_id": "QEcYwk3YPXQbZ8Q7Tuon", "ratId": "C0409G1", "areList": [{"art": "-", "x": 212.1, "site": "Basilar top (perforator)", "type": "micro", "y": 265.9, "side": "BA"}, {"x": 203, "art": "-", "y": 84.4, "side": "A-com", "site": "Azygos ACA", "type": "micro"}]}, {"_id": "Rbqw3zZwoWeYCG5Matmj", "ratId": "C1102G1", "areList": [{"type": "미확인", "y": 146.5, "site": "ACA", "side": "L", "art": "ACA", "x": 217.9}]}, {"_id": "Sv4oKtvcitpnFb9fZsmt", "ratId": "C0508G1", "areList": [{"y": 178.8, "art": "ICA", "type": "micro", "site": "ICA 분지부", "x": 185.7, "side": "R"}]}, {"_id": "UYubGqQ0YdTOwSI3XUWZ", "ratId": "C1307G1", "areList": [{"y": 119.8, "side": "A-com", "site": "Azygos ACA", "type": "macro", "art": "-", "x": 205.3}]}, {"_id": "Ua4XZCVAhNnB8S0XImXN", "ratId": "C0606G1", "areList": [{"x": 185.7, "art": "ACA", "site": "ACA–olfactory 분지부", "type": "micro", "side": "R", "y": 156.8}]}, {"_id": "UtXWmlWmoYuMDLpFyAPk", "ratId": "C1002G1", "areList": [{"art": "PCA", "x": 219.5, "type": "미확인", "y": 254.9, "site": "PCA P1", "side": "L"}, {"side": "R", "type": "미확인", "site": "ACA–olfactory 분지부", "x": 188.1, "art": "ACA", "y": 147.5}]}, {"_id": "V5aHCOcDMtIWzXAXk70d", "ratId": "C1330G0", "areList": [{"art": "PCA", "x": 219.5, "y": 253.4, "type": "macro", "site": "PCA P1", "side": "L"}]}, {"_id": "VmgA9UkKu4rZXIGvBcOa", "ratId": "C0912G1", "areList": [{"x": 205.3, "side": "A-com", "type": "미확인", "site": "A-com (ACA 합류부)", "art": "-", "y": 126.9}]}, {"_id": "f06esm9JC1EgBQw5d3cs", "ratId": "C1321G0", "areList": [{"y": 127, "art": "-", "type": "micro", "site": "A-com (ACA 합류부)", "side": "A-com", "x": 203.8}]}, {"_id": "gNfn42VblprJzo9iRWwu", "ratId": "C0506G1", "areList": [{"side": "R", "site": "ACA", "type": "micro", "y": 145, "x": 191.2, "art": "ACA"}]}, {"_id": "j8jTtZbjorUfa9hoy7dv", "ratId": "C0303G1", "areList": [{"x": 222.1, "side": "L", "site": "PCA P1", "type": "macro", "art": "PCA", "y": 254.7}]}, {"_id": "jcjs4Z1UbjkAcpTdHyly", "ratId": "C0610G1", "areList": [{"site": "ACA–olfactory 분지부", "type": "micro", "art": "ACA", "y": 155.9, "side": "R", "x": 186.5}, {"art": "MCA", "y": 174.2, "type": "micro", "x": 175.5, "site": "MCA", "side": "R"}]}, {"_id": "jsrHiFrr8JFUhE47YBsU", "ratId": "C1008G1", "areList": [{"art": "-", "site": "Azygos ACA", "type": "미확인", "x": 206.1, "side": "A-com", "y": 112.8}]}, {"_id": "k9TGkAZuOEWxQzUFcJPN", "ratId": "C1003G1", "areList": [{"side": "L", "y": 254.7, "type": "macro", "site": "PCA P1", "x": 222.1, "art": "PCA"}]}, {"_id": "rIclxjBBKg9TLFwhFQkp", "ratId": "C0509G1", "areList": [{"x": 184.2, "type": "micro", "site": "ACA–olfactory 분지부", "side": "R", "art": "ACA", "y": 152.2}]}, {"_id": "sRMWcOuupSvjiq2LEA3t", "ratId": "C0910G1", "areList": [{"side": "R", "site": "MCA", "type": "macro", "x": 180.2, "art": "MCA", "y": 179.5}]}, {"_id": "v2Ci4eWkPOi2SaCLCqL1", "ratId": "C1009G1", "areList": [{"y": 254.7, "art": "PCA", "type": "미확인", "site": "PCA", "x": 222.1, "side": "L"}]}, {"_id": "vO2UX6Zl6DwRJHFSdHK3", "ratId": "C0607G1", "areList": [{"side": "R", "type": "micro", "site": "ACA–olfactory 분지부", "y": 156.1, "x": 184.9, "art": "ACA"}, {"y": 250.4, "type": "macro", "site": "PCA P1", "art": "PCA", "side": "L", "x": 221.1}, {"x": 184.9, "side": "R", "art": "ICA", "y": 185.2, "type": "micro", "site": "ICA 분지부"}]}, {"_id": "zJjC6qCRlE19eY4PBsF3", "ratId": "C0301G1", "areList": [{"side": "L", "y": 153.6, "type": "micro", "site": "ACA–olfactory 분지부", "x": 227.3, "art": "ACA"}]}, {"_id": "zbueJRqpOOwdQTAtHI65", "ratId": "C0410G1", "areList": [{"art": "ACA", "x": 183.3, "type": "micro", "site": "ACA–olfactory 분지부", "y": 153.6, "side": "R"}]}]};
    // 공통 변환 (콘솔 스크립트와 오프라인 점검이 같은 코드를 쓴다)
    function makeMover(OLD, AreMap) {
        const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t }; };
        const lens = pts => pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
        const fracOn = (pts, p) => { const L = lens(pts), tot = L.reduce((a, b) => a + b, 0) || 1; let best = { d: 1e9, f: 0 }, acc = 0;
            for (let i = 0; i < L.length; i++) { const r = dist(p, pts[i], pts[i + 1]); if (r.d < best.d) best = { d: r.d, f: (acc + r.t * L[i]) / tot }; acc += L[i]; } return best; };
        const atFrac = (pts, f) => { const L = lens(pts); let rem = f * L.reduce((a, b) => a + b, 0);
            for (let i = 0; i < L.length; i++) { if (rem <= L[i]) { const t = L[i] ? rem / L[i] : 0; return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; } rem -= L[i]; } return pts[pts.length - 1]; };
        const r1 = v => Math.round(v * 10) / 10;
        const alias = { 'Basilar top (perforator)': 'Basilar top' };
        // 옛 그림과 새 그림에서 점 순서가 반대인 혈관 (옛: 기시부→끝, 새: 끝→기시부)
        const REVERSED = new Set(['R|PCA', 'R|Olfactory a.', 'L|Olfactory a.']);
        // 옛 Azygos(ACA 합류점→코 쪽)는 새 그림의 정중 줄기 전체(합류점 566 → 위 끝 30)에 대응
        const newMid = () => {
            const ic = AreMap.SEGS.find(s => s.side === 'A-com' && s.label.startsWith('A-com'));
            const az = AreMap.SEGS.find(s => s.side === 'A-com' && s.label === 'Azygos ACA');
            const up = pts => pts.slice().sort((a, b) => b[1] - a[1]);   // 아래(합류점)→위
            return [...up(ic.pts), ...up(az.pts)];
        };
        return function move(l) {
            const n = alias[l.site] || l.site;
            const lm = n && AreMap.LANDMARKS.find(m => m.side === l.side && m.label === n);
            if (lm) return { x: lm.x, y: lm.y, site: l.site, how: '분지부' };
            let best = null;
            OLD.segs.forEach(sg => { const r = fracOn(sg.pts, [l.x, l.y]); if (!best || r.d < best.d) best = { ...r, sg }; });
            if (!best) return null;
            let pts;
            if (best.sg.side === 'A-com' && best.sg.label === 'Azygos ACA') pts = newMid();
            else {
                const tg = AreMap.SEGS.find(s => s.side === best.sg.side && s.label === best.sg.label);
                if (!tg) return null;
                pts = REVERSED.has(`${tg.side}|${tg.label}`) ? tg.pts.slice().reverse() : tg.pts;
            }
            const q = atFrac(pts, best.f), x = r1(q[0]), y = r1(q[1]);
            // 부위 이름: 원래 혈관 이름이 붙어 있던 점만 새 그림의 혈관 이름으로 바꾼다 (분지부 이름으로는 안 바꿈)
            let site = l.site;
            if (l.site && l.site === best.sg.label) {
                let nb = null, nd = 1e9;
                AreMap.SEGS.forEach(s => { for (let i = 0; i < s.pts.length - 1; i++) { const d = dist([x, y], s.pts[i], s.pts[i + 1]).d; if (d < nd) { nd = d; nb = s; } } });
                if (nb) site = nb.label;
            }
            return { x, y, site, how: `${best.sg.label} 기시부에서 ${Math.round(best.f * 100)}%` };
        };
    }
    const move = makeMover(OLD, AreMap);
    const out = [], skipped = [];
    for (const b of BEFORE.rats) {
        const ref = db.collection('rats').doc(b._id);
        const cur = (await ref.get()).data();
        if (!cur || !Array.isArray(cur.areList) || cur.areList.length !== b.areList.length
            || cur.areList.some((l, i) => l.type !== b.areList[i].type || l.side !== b.areList[i].side)) {
            skipped.push(b.ratId); continue;   // 그 사이에 손으로 고친 개체는 건드리지 않는다
        }
        let siteChanged = false;
        const list = b.areList.map(l => {
            if (typeof l.x !== 'number') return l;
            const m = move(l);
            if (!m) { const { x, y, ...rest } = l; out.push(`  ${b.ratId}: ${l.side} ${l.site || l.art} → 옮길 곳 없음, 좌표 지움`); return rest; }
            if ((m.site || '') !== (l.site || '')) siteChanged = true;
            out.push(`  ${b.ratId}: ${l.side} ${l.site || l.art} → ${m.site || l.art} (${m.x},${m.y})`);
            const n = { ...l, x: m.x, y: m.y };
            if (m.site) n.site = m.site;
            return n;
        });
        const upd = { areList: list };
        if (siteChanged && String(cur.are || '').startsWith('O')) {   // 부위 이름이 바뀌면 ARE 글자도 맞춘다
            upd.are = `O [${list.map(i => `${i.type} (${AreMap.locText(i)})`).join(', ')}]`;
            upd.codFull = `${cur.cod || ''} / ARE: ${upd.are}`;
            out.push(`    ↳ ${b.ratId} ARE 글자: ${upd.are}`);
        }
        await ref.update(upd);
    }
    if (typeof clearRatsCache === 'function') clearRatsCache();
    console.log(`바로잡기 완료 — ${BEFORE.rats.length - skipped.length}마리${skipped.length ? ` (건너뜀: ${skipped.join(', ')})` : ''}\n` + out.join('\n'));
})();
