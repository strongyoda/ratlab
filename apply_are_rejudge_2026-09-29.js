// 2026-09-29 교수님 ARE 재판정 반영 — 사이트(로그인 상태) 개발자 콘솔(F12)에 붙여넣고 실행
// 변경 전 값: backup_are_rejudge_2026-09-29.json
(async () => {
    // 옛 are_map.js가 캐시에 남아 있으면 좌표가 틀리므로 아예 멈춘다 (Ctrl+Shift+R 후 다시)
    const p1 = window.AreMap && AreMap.landmark && AreMap.landmark('R', 'PCA P1');
    if (!p1 || p1.y !== 254) { console.error('그림 코드가 옛 버전입니다. Ctrl+Shift+R로 새로고침한 뒤 다시 붙여넣으세요. (DB는 바뀌지 않았습니다)'); return; }
    // 좌표는 are_map.js 바탕 그림(are_map_base.png) 기준 — 로컬 최신 코드가 로드된 페이지에서 실행할 것
    const at = (side, label, t, extra = {}) => { const l = AreMap.landmark(side, label); return { type: t, side, art: l.art, x: l.x, y: l.y, site: label, ...extra }; };
    const L = {
        olf: (s, t) => at(s, 'ACA–olfactory 분지부', t),
        icab: (s, t) => at(s, 'ICA 분지부', t),
        icamca: (s, t) => ({ type: t, side: s, art: 'MCA', x: s === 'R' ? 178 : 238, y: s === 'R' ? 177.5 : 179, site: 'ICA 분지부/MCA 기시부' }),
        p1: (s, t) => at(s, 'PCA P1', t),
        acom: t => at('A-com', 'A-com (ACA 합류부)', t),
        batop: t => at('BA', 'Basilar top', t, { site: 'Basilar top (perforator)' }),
    };
    const plan = {
        // 판정 변경
        C0401G1: { x: true }, C0506G1: { x: true }, C1302G1: { x: true },
        C0306G1: { x: true, cod: 'Unknown' }, C1110G1: { x: true, cod: 'ICH' },
        C0601G1: { list: [L.icamca('R', 'micro')] },
        C0504G1: { list: [L.olf('R', 'micro')] },
        C0509G1: { list: [L.olf('R', 'micro')] },
        C0314G1: { list: [L.olf('R', 'micro'), L.icab('R', 'macro'), L.acom('micro'), { type: 'micro', side: '-', art: 'PCA', site: 'PCA P1 (좌우 미상)' }] },
        C0409G1: { list: [L.acom('micro'), L.batop('micro')] },
        C1003G1: { list: [L.p1('L', 'macro')] },
        // 위치 보강 (판정 동일)
        C0303G1: { list: [L.p1('L', 'macro')] }, C0310G1: { list: [L.p1('L', 'macro')] }, C0406G1: { list: [L.p1('L', 'macro')] },
        C0305G1: { list: [L.icab('R', 'micro')] }, C0311G1: { list: [L.olf('R', 'micro')] },
        C0508G1: { list: [L.icamca('R', 'micro')] },
    };
    const out = [];
    for (const [rid, p] of Object.entries(plan)) {
        const q = await db.collection('rats').where('ratId', '==', rid).get();
        if (q.size !== 1) { out.push(`${rid}: 문서 ${q.size}개 — 건너뜀`); continue; }
        const cod = p.cod || q.docs[0].data().cod;
        let upd;
        if (p.x) upd = { are: 'X', areList: [], areCounts: { micro: 0, macro: 0, unk: 0 } };
        else {
            const c = { micro: 0, macro: 0, unk: 0 };
            p.list.forEach(i => { if (i.type === 'micro') c.micro++; else if (i.type === 'macro') c.macro++; else c.unk++; });
            upd = { are: `O [${p.list.map(i => `${i.type} (${AreMap.locText(i)})`).join(', ')}]`, areList: p.list, areCounts: c };
        }
        upd.cod = cod; upd.codFull = `${cod} / ARE: ${upd.are}`;
        await q.docs[0].ref.update(upd);
        out.push(`${rid}: ${upd.codFull}`);
    }
    if (typeof clearRatsCache === 'function') clearRatsCache();
    console.log(out.join('\n'));
})();
