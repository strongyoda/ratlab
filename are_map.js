// ==========================================
// ARE 위치 지도 — 윌리스환 그림 (복측에서 본 그림, 위쪽이 코 쪽)
//  · 복측 시야라 화면 왼쪽 = 쥐의 오른쪽(R), 화면 오른쪽 = 쥐의 왼쪽(L)
//  · areList 항목에 x, y(바탕 그림 픽셀 좌표)와 site(부위 이름)를 추가로 저장한다
//  · x, y가 없는 옛 기록은 side + art로 대표 지점에 '추정' 점으로 찍는다
// ==========================================
(function () {
    // 바탕 그림: are_map_base.png (359×481, 전임자 논문 모식도). 좌표는 이 그림의 픽셀 좌표다.
    const W = 359, H = 481;
    const IMG = 'are_map_base.png?v=2';   // 그림을 바꾸면 v를 올린다(캐시)

    // ▼ 그림 좌표 — are_map_editor.html(점 끌어서 조정)에서 만든 값을 그대로 붙여넣는다
    // 혈관 구간: side/art는 기존 선택지(R·L·A-com·BA / ACA·ICA·MCA·PCA·P-com)와 맞춘다
    const SEGS = [
        {"side": "R", "art": "ICA", "label": "ICA", "pts": [[128.3, 396.9], [145, 370], [144.9, 327.1], [144.9, 297.2], [167.5, 266.6], [174.8, 229.4], [190.1, 215.4], [185, 182]]},
        {"side": "R", "art": "MCA", "label": "MCA", "pts": [[185, 180], [158.2, 170.2], [135, 175]]},
        {"side": "R", "art": "ACA", "label": "ACA", "pts": [[185, 180], [190.1, 156.2], [196, 142], [203, 133]]},
        {"side": "R", "art": "ACA", "label": "Olfactory a.", "pts": [[182.8, 150.9], [196.1, 79.1]]},
        {"side": "R", "art": "P-com", "label": "P-com", "pts": [[190.8, 222.7], [192, 240]]},
        {"side": "R", "art": "PCA", "label": "PCA", "pts": [[204.8, 261.3], [191.5, 246.6]]},
        {"side": "L", "art": "ICA", "label": "ICA", "pts": [[283.2, 398.9], [265, 370], [271.9, 319.8], [264.6, 287.9], [245.3, 252.6], [244.7, 224.7], [233.4, 210.1], [231.4, 182.8]]},
        {"side": "L", "art": "MCA", "label": "MCA", "pts": [[231.4, 181.5], [254.6, 172.9], [269.3, 170.2]]},
        {"side": "L", "art": "ACA", "label": "ACA", "pts": [[231.4, 179.5], [223.4, 157.6], [214, 142], [207, 133]]},
        {"side": "L", "art": "ACA", "label": "Olfactory a.", "pts": [[230, 149.6], [218.1, 76.5]]},
        {"side": "L", "art": "P-com", "label": "P-com", "pts": [[230.7, 219.4], [227.4, 242]]},
        {"side": "L", "art": "PCA", "label": "PCA", "pts": [[217.4, 261.3], [226.7, 248]]},
        {"side": "A-com", "art": "-", "label": "Azygos ACA", "pts": [[203, 133], [208.8, 98.4], [209.4, 57.8]]},
        {"side": "BA", "art": "-", "label": "Basilar a.", "pts": [[213.4, 268.6], [208.1, 319.1], [207, 395]]}
    ];
    // 이름 있는 분지부 — 이 근처를 누르면 부위 이름이 분지부로 붙는다
    // PCA P1 = 기저동맥 끝 ~ P-com 합류부 사이 구간의 가운데, 합류부는 따로 'P1–P-com 접합부'
    const LANDMARKS = [
        {"side": "R", "art": "ICA", "label": "ICA 분지부", "x": 187, "y": 184},
        {"side": "R", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 184.2, "y": 152.2},
        {"side": "R", "art": "PCA", "label": "PCA P1", "x": 198.2, "y": 254},
        {"side": "R", "art": "PCA", "label": "P1–P-com 접합부", "x": 192.8, "y": 244},
        {"side": "L", "art": "ICA", "label": "ICA 분지부", "x": 232, "y": 182.8},
        {"side": "L", "art": "ACA", "label": "ACA–olfactory 분지부", "x": 226.7, "y": 153.6},
        {"side": "L", "art": "PCA", "label": "PCA P1", "x": 222.1, "y": 254.7},
        {"side": "L", "art": "PCA", "label": "P1–P-com 접합부", "x": 226.7, "y": 246},
        {"side": "A-com", "art": "-", "label": "A-com (ACA 합류부)", "x": 203, "y": 133},
        {"side": "BA", "art": "-", "label": "Basilar top", "x": 212.1, "y": 265.9}
    ];
    // ▲ 그림 좌표 끝

    const landmark = (side, label) => LANDMARKS.find(l => l.side === side && l.label === label) || null;

    // 꺾은선의 길이 절반 지점
    function pointAtHalf(pts) {
        const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        let half = lens.reduce((a, b) => a + b, 0) / 2;
        for (let i = 0; i < lens.length; i++) {
            if (half <= lens[i]) { const t = lens[i] ? half / lens[i] : 0; return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; }
            half -= lens[i];
        }
        return pts[pts.length - 1];
    }

    // 옛 기록(x, y 없음)의 대표 지점: 그 side·art 혈관 구간의 가운데 점
    function canonicalPoint(side, art) {
        const cands = SEGS.filter(sg => sg.side === side && (side === 'A-com' || side === 'BA' || sg.art === art));
        const sg = cands.find(c => c.label === art) || cands[0];
        if (sg) return pointAtHalf(sg.pts);
        if (side === 'R') return [28, 300];         // 좌우만 아는 기록: 바깥 여백
        if (side === 'L') return [W - 28, 300];
        return null;
    }

    function distToSeg(p, a, b) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }

    // 그림 좌표 → {side, art, site}. 혈관에서 너무 멀면 null
    function locate(x, y) {
        const p = [x, y];
        let lm = null, lmD = 8;
        LANDMARKS.forEach(l => { const d = Math.hypot(l.x - x, l.y - y); if (d < lmD) { lmD = d; lm = l; } });
        if (lm) return { side: lm.side, art: lm.art, site: lm.label };
        let best = null, bestD = 14;
        SEGS.forEach(sg => {
            for (let i = 0; i < sg.pts.length - 1; i++) {
                const d = distToSeg(p, sg.pts[i], sg.pts[i + 1]);
                if (d < bestD) { bestD = d; best = sg; }
            }
        });
        return best ? { side: best.side, art: best.art, site: best.label } : null;
    }

    const TYPE_COLOR = { macro: '#8e24aa', micro: '#00897b', '미확인': '#9e9e9e' };
    const typeColor = t => TYPE_COLOR[t] || TYPE_COLOR['미확인'];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 바탕 그림 + 좌우 표시
    function baseSvg() {
        return `
            <image href="${IMG}" x="0" y="0" width="${W}" height="${H}"/>
            <g font-size="18" font-weight="800" fill="var(--ink, #23282E)"><text x="12" y="26">R</text><text x="${W - 12}" y="26" text-anchor="end">L</text></g>
            <text x="${W / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="var(--ink-soft, #5B5F66)">복측 시야 · 위쪽 = 코 쪽</text>`;
    }

    // 같은 지점에 여러 개가 겹치면 해바라기 배열로 살짝 퍼뜨린다
    function spread(points) {
        const seen = {};
        return points.map(p => {
            const key = `${Math.round(p.x)},${Math.round(p.y)}`;
            const k = seen[key] = (seen[key] || 0) + 1;
            if (k === 1) return p;
            const a = k * 2.4, r = 5 * Math.sqrt(k - 1);
            return { ...p, x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
        });
    }

    function lesionPoint(loc) {
        if (loc && typeof loc.x === 'number' && typeof loc.y === 'number') return { x: loc.x, y: loc.y, exact: true };
        const c = canonicalPoint(loc && loc.side, loc && loc.art);
        return c ? { x: c[0], y: c[1], exact: false } : null;
    }

    function locText(loc) {
        if (loc.site) return `${['A-com', 'BA', '-', undefined].includes(loc.side) ? '' : loc.side + ' '}${loc.site}`;
        if (loc.side === '-') return loc.art && loc.art !== '-' ? loc.art : '위치 미상';
        return (loc.side === 'BA' || loc.side === 'A-com') ? loc.side : `${loc.side || ''} ${loc.art && loc.art !== '-' ? loc.art : ''}`.trim();
    }

    // ---------- 통계: 여러 개체의 병변을 한 그림에 ----------
    function statsHtml(rats) {
        const pts = [];
        const tally = { R: 0, L: 0, mid: 0 };
        let exactN = 0;
        (rats || []).forEach(r => {
            if (!r || !r.are || !String(r.are).startsWith('O') || !Array.isArray(r.areList)) return;
            r.areList.forEach(loc => {
                const p = lesionPoint(loc);
                if (!p) return;
                if (p.exact) exactN++;
                if (loc.side === 'R') tally.R++; else if (loc.side === 'L') tally.L++; else tally.mid++;
                pts.push({ ...p, type: loc.type, tip: `${r.ratId} · ${loc.type} · ${locText(loc)}${p.exact ? '' : ' (위치 추정)'}` });
            });
        });
        if (!pts.length) return '';
        const dots = spread(pts).map(p => {
            const c = typeColor(p.type);
            return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.type === 'macro' ? 7 : 5.5}" fill="${p.exact ? c : 'var(--sheet, #fff)'}" fill-opacity="${p.exact ? 0.85 : 1}" stroke="${c}" stroke-width="2"><title>${esc(p.tip)}</title></circle>`;
        }).join('');
        const total = tally.R + tally.L + tally.mid;
        const pct = n => total ? Math.round(n / total * 100) : 0;
        const legendDot = (t, filled) => `<svg width="12" height="12" style="vertical-align:-1px"><circle cx="6" cy="6" r="4.2" fill="${filled ? typeColor(t) : 'var(--sheet,#fff)'}" stroke="${typeColor(t)}" stroke-width="1.6"/></svg>`;
        return `
        <div style="margin-top:14px; border-top:1px dashed var(--rule); padding-top:14px;">
            <h5 style="text-align:center; color:var(--ink); margin:0 0 8px;">ARE 위치 지도</h5>
            <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; justify-content:center;">
                <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:300px; height:auto; background:var(--sheet); border:1px solid var(--rule);">${baseSvg()}${dots}</svg>
                <div style="font-size:0.8rem; min-width:150px; line-height:1.9;">
                    <div class="mono" style="font-size:0.9rem;"><b>R</b> ${tally.R} (${pct(tally.R)}%) · <b>L</b> ${tally.L} (${pct(tally.L)}%) · <b>정중</b> ${tally.mid}</div>
                    <div>${legendDot('macro', true)} Macro ${legendDot('micro', true)} Micro ${legendDot('미확인', true)} 미확인</div>
                    <div style="color:var(--ink-soft);">${legendDot('micro', true)} 찍은 위치 <span class="mono">${exactN}</span> · ${legendDot('micro', false)} 부위로 추정 <span class="mono">${pts.length - exactN}</span></div>
                    <div style="color:var(--ink-soft); font-size:0.75rem;">점에 마우스를 올리면 개체 번호가 보입니다.</div>
                </div>
            </div>
        </div>`;
    }

    // ---------- 입력: 모달 안에서 위치 찍기 ----------
    // rowsEl 안의 .modal-are-row(각 행에 .are-tp/.are-side/.are-art 선택)와 연동한다
    function mountEditor(hostEl, rowsEl, addRow) {
        hostEl.innerHTML = `
            <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:4px;">그림을 누르면 선택된 행(굵은 테두리)의 위치가 찍힙니다. 선택된 행이 없으면 새 행이 생깁니다.</div>
            <svg class="are-map-svg" viewBox="0 0 ${W} ${H}" style="width:100%; max-width:280px; display:block; margin:0 auto; background:var(--sheet); border:1px solid var(--rule); cursor:crosshair;">${baseSvg()}<g class="are-map-marks"></g></svg>`;
        const svg = hostEl.querySelector('svg');
        const marks = svg.querySelector('.are-map-marks');
        let active = null;

        function setActive(row) {
            active = row;
            rowsEl.querySelectorAll('.modal-are-row').forEach(r => { r.style.outline = r === row ? '2px solid var(--ink)' : 'none'; });
        }
        function render() {
            const rows = Array.from(rowsEl.querySelectorAll('.modal-are-row'));
            marks.innerHTML = rows.map((row, i) => {
                const loc = { side: row.querySelector('.are-side').value, art: row.querySelector('.are-art').value, x: row.dataset.x !== undefined && row.dataset.x !== '' ? Number(row.dataset.x) : undefined, y: row.dataset.y !== undefined && row.dataset.y !== '' ? Number(row.dataset.y) : undefined };
                const p = lesionPoint(loc); if (!p) return '';
                const c = typeColor(row.querySelector('.are-tp').value);
                return `<g><circle cx="${p.x}" cy="${p.y}" r="9.5" fill="${p.exact ? c : 'var(--sheet,#fff)'}" stroke="${c}" stroke-width="1.8"/><text x="${p.x}" y="${p.y + 4}" font-size="11.5" font-weight="800" text-anchor="middle" fill="${p.exact ? '#fff' : c}">${i + 1}</text></g>`;
            }).join('');
            rows.forEach((row, i) => { const n = row.querySelector('.are-no'); if (n) n.textContent = i + 1; });
        }

        rowsEl.addEventListener('click', e => { const row = e.target.closest('.modal-are-row'); if (row) setActive(row); });
        // 선택을 손으로 바꾸면 찍은 좌표는 버리고(모순 방지) 부위 추정 점으로 돌아간다
        rowsEl.addEventListener('change', e => {
            const row = e.target.closest('.modal-are-row');
            if (row && (e.target.classList.contains('are-side') || e.target.classList.contains('are-art'))) {
                delete row.dataset.x; delete row.dataset.y; delete row.dataset.site;
                const s = row.querySelector('.are-site'); if (s) s.textContent = '';
            }
            render();
        });
        new MutationObserver(() => { if (active && !active.isConnected) active = null; render(); }).observe(rowsEl, { childList: true });

        svg.addEventListener('click', e => {
            const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            const p = pt.matrixTransform(svg.getScreenCTM().inverse());
            const hit = locate(p.x, p.y);
            if (!hit) return;
            let row = active && active.isConnected ? active : null;
            if (!row) { addRow({ type: 'micro' }); row = rowsEl.lastElementChild; }
            const sideSel = row.querySelector('.are-side'), artSel = row.querySelector('.are-art');
            sideSel.value = hit.side;
            const noSide = hit.side === 'BA' || hit.side === 'A-com';
            artSel.disabled = noSide; artSel.value = noSide ? '-' : hit.art;
            row.dataset.x = p.x.toFixed(1); row.dataset.y = p.y.toFixed(1); row.dataset.site = hit.site;
            const s = row.querySelector('.are-site'); if (s) s.textContent = hit.site;
            setActive(row);
            render();
        });
        return { render, setActive };
    }

    window.AreMap = { statsHtml, mountEditor, locate, locText, lesionPoint, landmark, SEGS, LANDMARKS, W, H, IMG };
})();
