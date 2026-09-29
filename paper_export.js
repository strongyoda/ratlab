// ==========================================
// 데이터 관리 > AI 논문 추출 탭 — 논문용 CSV
//  · 간단 파일: 한 장짜리 요약 (1행 = 1마리, 사용자 지정 12열)
//  · 자세한 파일: 통계 프로그램·엑셀에 바로 넣는 표 4개
//      개체표(1행 = 1마리) · 병변표(1행 = ARE 1개) · 측정표(1행 = 체중/혈압 1회) · MR표(1행 = MR 1회)
//  · 모든 표에 cohort·group·ratId가 있어 서로 붙일(join) 수 있다. 빈 group은 앱 규칙대로 G1
//  · POD는 수술일 기준으로 다시 계산한다. 옛 코호트의 timepoint 라벨(D0 = OVX 등)을 믿지 않기 위해서
// ==========================================
let pcRats = null;   // 추출 직전에 새로 불러온 rats (캐시 아님 — 방금 고친 값이 빠지면 안 된다)

async function initPaperCsv() {
    const box = document.getElementById('pc-cohorts');
    if (!box || box.dataset.ready) return;
    try {
        const rats = await getRatsWithCache();
        const cohorts = [...new Set(rats.map(r => String(r.cohort)))].sort((a, b) => Number(a) - Number(b));
        box.innerHTML = cohorts.map(c => `<label style="display:inline-flex; align-items:center; gap:4px; margin:0 12px 6px 0; cursor:pointer;">
            <input type="checkbox" class="pc-cohort" value="${pcEsc(c)}" checked> C${pcEsc(c)}</label>`).join('');
        box.dataset.ready = '1';
    } catch (e) { box.textContent = '코호트 목록을 불러오지 못했습니다: ' + e.message; }
}

function pcAll(on) { document.querySelectorAll('.pc-cohort').forEach(c => c.checked = on); }
function pcEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- 공통 계산 ----------
function pcDate(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    if (v.toDate) { const d = v.toDate(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    return '';
}
function pcDays(from, to) {
    if (!from || !to) return '';
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
    return (isNaN(a) || isNaN(b)) ? '' : Math.round((b - a) / 864e5);
}
function pcAgeW(r, date) {
    const arr = pcDate(r.arrivalDate);
    const d = pcDays(arr, date);
    return (d === '' || !r.arrivalAge) ? '' : (Number(r.arrivalAge) + d / 7).toFixed(1);
}
function pcCod(r) { return r.cod || (r.codFull && typeof extractLegacyCod === 'function' ? extractLegacyCod(r.codFull) : '') || ''; }
function pcAreMain(r) { const a = String(r.are || '').trim(); return a.startsWith('O') ? 'O' : a.startsWith('X') ? 'X' : ''; }
function pcAreCounts(r) {
    if (r.areCounts) return { macro: Number(r.areCounts.macro) || 0, micro: Number(r.areCounts.micro) || 0, unk: Number(r.areCounts.unk) || 0 };
    if (pcAreMain(r) !== 'O') return { macro: 0, micro: 0, unk: 0 };
    const a = String(r.are);   // 옛 형식 'O (micro)'
    return { macro: a.includes('macro') ? 1 : 0, micro: a.includes('micro') ? 1 : 0, unk: /macro|micro/.test(a) ? 0 : 1 };
}
function pcLoc(l) { return window.AreMap ? AreMap.locText(l) : `${l.side || ''} ${l.art && l.art !== '-' ? l.art : ''}`.trim(); }

// ---------- 표 4개 ----------
function pcRatsTable(rats) {
    const head = ['cohort', 'group', 'ratId', 'num', 'status', 'sham_or_naive', 'arrival_date', 'arrival_age_w', 'ovx_date',
        'surgery_date', 'age_at_surgery_w', 'dose_start_date', 'death_date', 'pod_at_death', 'age_at_death_w',
        'cod', 'cod_secondary', 'are', 'are_lesions', 'are_macro', 'are_micro', 'are_unknown', 'are_sites',
        'sample_type', 'sample_date', 'sample_memo', 'memo'];
    const rows = rats.map(r => {
        const surg = pcDate(r.surgeryDate), death = pcDate(r.deathDate), c = pcAreCounts(r);
        const list = Array.isArray(r.areList) ? r.areList : [];
        return [r.cohort, r.group || 'G1', r.ratId, r.num || '', r.status || '', r.isNonInduction ? 1 : 0,
            pcDate(r.arrivalDate), r.arrivalAge || '', pcDate(r.ovxDate),
            surg, pcAgeW(r, surg), pcDate(r.doseStartDate), death, pcDays(surg, death), pcAgeW(r, death),
            pcCod(r), (r.codSec || []).join('; '), pcAreMain(r), c.macro + c.micro + c.unk, c.macro, c.micro, c.unk,
            list.map(l => `${l.type} ${pcLoc(l)}`).join('; '),
            r.sampleType || '', pcDate(r.sampleDate), r.sampleMemo || '', r.generalMemo || ''];
    });
    return [head, ...rows];
}

function pcLesionTable(rats) {
    const head = ['cohort', 'group', 'ratId', 'lesion_no', 'type', 'side', 'artery', 'site', 'map_x', 'map_y', 'position',
        'cod', 'cod_secondary', 'pod_at_death'];
    const rows = [];
    rats.forEach(r => {
        if (pcAreMain(r) !== 'O') return;
        const base = [r.cohort, r.group || 'G1', r.ratId];
        const tail = [pcCod(r), (r.codSec || []).join('; '), pcDays(pcDate(r.surgeryDate), pcDate(r.deathDate))];
        const list = Array.isArray(r.areList) ? r.areList : [];
        if (!list.length) {   // 위치 기록 없이 개수만 있는 옛 기록 — 개수만큼 행을 만든다
            const c = pcAreCounts(r);
            const types = [...Array(c.macro).fill('macro'), ...Array(c.micro).fill('micro'), ...Array(c.unk).fill('미확인')];
            types.forEach((t, i) => rows.push([...base, i + 1, t, '', '', '', '', '', 'no_location', ...tail]));
            return;
        }
        list.forEach((l, i) => {
            const exact = typeof l.x === 'number' && typeof l.y === 'number';
            rows.push([...base, i + 1, l.type || '', l.side || '', l.art && l.art !== '-' ? l.art : '', l.site || '',
                exact ? l.x : '', exact ? l.y : '', exact ? 'marked' : 'region_only', ...tail]);
        });
    });
    return [head, ...rows];
}

function pcMeasTable(rats, meas) {
    const byId = Object.fromEntries(rats.map(r => [r.ratId, r]));
    const head = ['cohort', 'group', 'ratId', 'date', 'timepoint_label', 'pod', 'age_w', 'weight_g', 'sbp', 'dbp', 'mean_bp', 'source', 'memo'];
    const rows = meas.filter(m => byId[m.ratId]).map(m => {
        const r = byId[m.ratId], d = pcDate(m.date);
        return [r.cohort, r.group || 'G1', r.ratId, d, m.timepoint || '', pcDays(pcDate(r.surgeryDate), d), pcAgeW(r, d),
            m.weight ?? '', m.sbp ?? '', m.dbp ?? '', m.mean ?? '', m.source || '', m.memo || m.note || ''];
    });
    rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[3]).localeCompare(String(b[3])));
    return [head, ...rows];
}

function pcMrTable(rats) {
    const head = ['cohort', 'group', 'ratId', 'timepoint_label', 'date', 'pod', 'age_w', 'infarct_size', 'infarct_side'];
    const rows = [];
    rats.forEach(r => (r.mrDates || []).forEach(mr => {
        const d = pcDate(mr.date);
        rows.push([r.cohort, r.group || 'G1', r.ratId, mr.timepoint || '', d, pcDays(pcDate(r.surgeryDate), d), pcAgeW(r, d),
            mr.infarctSize || '', mr.infarctLoc && mr.infarctLoc !== '-' ? mr.infarctLoc : '']);
    }));
    rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[4]).localeCompare(String(b[4])));
    return [head, ...rows];
}

// ---------- 투약 프로토콜 (간단 파일의 '코호트 타입') ----------
// 옛 코호트는 설정(cohortConfigs)이 없어서 코호트 메모(cohortNotes)와 논문 정리 내용을 옮겨 적은 표를 쓴다.
// 키: '코호트|그룹' 이 먼저, 없으면 '코호트'. 프로토콜이 바뀌면 여기만 고치면 된다.
// 설정에 투약 규칙이 있는 코호트(13.5 G0, 14 …)는 설정에서 자동으로 만든다.
const PC_PROTOCOLS = {
    '3':       'CCA·RA 결찰 + BAPN 0.12% (free base, 10~15번은 fumarate) + NaCl · OVX 없음',
    '4':       'OVX + CCA·RA 결찰 + BAPN fumarate 0.12% + NaCl (결찰일부터)',
    '5':       'OVX + CCA·RA 결찰 + BAPN fumarate 0.12% + NaCl (결찰일부터)',
    '6':       'OVX + CCA·RA 결찰 + BAPN fumarate 0.12% + NaCl (결찰일부터)',
    '7':       'OVX + 일반식 (결찰·BAPN 없음)',
    '7.5':     '연습용',
    '8':       '일반식 (처치 없음)',
    '9':       'OVX + CCA·RA 결찰 + BAPN free base 0.12% + NaCl (결찰일부터)',
    '10':      'OVX + CCA·RA 결찰 + BAPN free base 0.12% + NaCl (결찰일부터)',
    '11':      'OVX + CCA·RA 결찰 + BAPN free base 0.12% + NaCl (결찰일부터) · 5주령 반입',
    '12|G1':   'OVX + CCA·RA 결찰 + NaCl + BAPN 0.2% 1주 → 희생',
    '12|G2':   'OVX + CCA·RA 결찰 + NaCl + BAPN 0.2% 1주 → 고염식만 3주',
    '12|G3':   'OVX + CCA·RA 결찰 + NaCl + BAPN 0.2% 1주 → BAPN 0.05% + NaCl 3주',
    '13|G0':   'OVX + CCA·RA 결찰 + NaCl(반입 즉시) + BAPN 0.2% 연속 (POD 8~, 약 4주)',
    '13|G1':   'OVX + CCA·RA 결찰 + NaCl(반입 3일 후) + BAPN 0.2% 연속 (POD 8~, 약 4주)',
    '13.5|G1': '후임 수술 연습용 (실험 대상 아님)',
};
function pcConfigProtocol(cfg, g) {
    const rules = ((cfg && cfg.dosing) || []).filter(d => (d.groups || []).includes(g) && Number(d.value) > 0);
    if (!rules.length) return '';
    const anc = { ovx: 'OVX', ligation: '결찰', arrival: '반입' };
    const amt = d => d.medium === 'water' ? `${d.value} mg/kg/일` : `${d.value}%`;
    const when = d => `${anc[d.startAnchor] || '결찰'}${Number(d.startOffset) ? ' +' + Number(d.startOffset) + '일' : ''}~`;
    return 'OVX + CCA·RA 결찰 + ' + rules.map(d => `${d.substance} ${amt(d)} (${d.medium === 'water' ? '물' : '사료'}, ${when(d)})`).join(' + ');
}
function pcProtocol(r, configs) {
    const c = String(r.cohort), g = r.group || 'G1';
    const base = PC_PROTOCOLS[`${c}|${g}`] || PC_PROTOCOLS[c] || pcConfigProtocol(configs[c], g);
    return [base, r.isNonInduction ? 'Sham/Naïve (결찰 안 함)' : ''].filter(Boolean).join(' · ');
}

// ---------- 간단 파일: 한 장짜리 요약 (1행 = 1마리) ----------
// 코호트 타입 = 투약 프로토콜 (위 PC_PROTOCOLS · 설정). Sham/Naïve는 따로 표시한다.
// ARE type 과 ARE위치 는 같은 순서로 ';' 로 잇는다 (n번째 type = n번째 위치).
// MRA = 찍은 MR 시점 목록 (경색이 있으면 괄호로).
function pcSimpleTable(rats, configs) {
    const head = ['동물코드명', '코호트', '코호트 타입', '수술 날짜', '수술 나이(주)', 'ARE 여부', 'ARE type', 'MRA', '얻은 샘플', '죽은 날짜', '죽은 나이(주)', 'ARE위치'];
    const rows = rats.map(r => {
        const surg = pcDate(r.surgeryDate), death = pcDate(r.deathDate);
        const type = pcProtocol(r, configs);
        const are = pcAreMain(r);
        const list = Array.isArray(r.areList) ? r.areList : [];
        let types = list.map(l => l.type || '');
        if (are === 'O' && !list.length) {   // 위치 없이 개수만 있는 옛 기록
            const c = pcAreCounts(r);
            types = [...Array(c.macro).fill('macro'), ...Array(c.micro).fill('micro'), ...Array(c.unk).fill('미확인')];
        }
        const mra = (r.mrDates || []).filter(m => m.date && m.timepoint !== 'Death')
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map(m => m.infarctSize && m.infarctSize !== 'None' ? `${m.timepoint}(경색 ${m.infarctSize}${m.infarctLoc && m.infarctLoc !== '-' ? ' ' + m.infarctLoc : ''})` : m.timepoint)
            .join('; ');
        return [r.ratId, r.cohort, type, surg, pcAgeW(r, surg), are, are === 'O' ? types.join('; ') : '', mra,
            r.sampleType === 'Fail' ? '못함' : (r.sampleType || ''), death, pcAgeW(r, death),
            are === 'O' ? list.map(pcLoc).join('; ') : ''];
    });
    return [head, ...rows];
}

// ---------- 내려받기 ----------
function pcCsv(table) {
    const q = v => { const s = String(v ?? '').replace(/\r?\n/g, ' / '); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return table.map(row => row.map(q).join(',')).join('\r\n');   // CRLF — 엑셀 기본 줄바꿈
}
function pcDownload(name, table) {
    // 엑셀에서 한글이 깨지지 않게 BOM(U+FEFF)을 붙인다
    const blob = new Blob([String.fromCharCode(0xFEFF) + pcCsv(table)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// kind: 'simple' = 한 장 요약, 'full' = 자세한 표 4개
async function exportPaperCsv(kind) {
    const status = document.getElementById('pc-status');
    const picked = [...document.querySelectorAll('.pc-cohort:checked')].map(c => c.value);
    if (!picked.length) { status.textContent = '코호트를 하나 이상 고르세요.'; return; }
    const btns = document.querySelectorAll('.pc-btn'); btns.forEach(b => b.disabled = true);
    status.textContent = '불러오는 중...';
    try {
        const rSnap = await db.collection('rats').get();
        const rats = rSnap.docs.map(d => d.data())
            .filter(r => picked.includes(String(r.cohort)) && !r.archived)
            .sort((a, b) => (Number(a.cohort) - Number(b.cohort)) || String(a.ratId).localeCompare(String(b.ratId)));
        const tag = `C${picked.join('-')}_${getTodayStr()}`;
        const out = [];
        if (kind === 'simple') {
            const cSnap = await db.collection('cohortConfigs').get();
            const configs = {};
            cSnap.forEach(d => { configs[d.id] = d.data(); });
            const t = pcSimpleTable(rats, configs); pcDownload(`paper_simple_${tag}.csv`, t); out.push(`간단 파일 ${t.length - 1}마리`);
        } else {
            let t = pcRatsTable(rats); pcDownload(`paper_rats_${tag}.csv`, t); out.push(`개체표 ${t.length - 1}행`);
            t = pcLesionTable(rats); pcDownload(`paper_lesions_${tag}.csv`, t); out.push(`병변표 ${t.length - 1}행`);
            const ids = new Set(rats.map(r => r.ratId));
            const mSnap = await db.collection('measurements').get();
            const meas = mSnap.docs.map(d => d.data()).filter(m => ids.has(m.ratId));
            t = pcMeasTable(rats, meas); pcDownload(`paper_measurements_${tag}.csv`, t); out.push(`측정표 ${t.length - 1}행`);
            t = pcMrTable(rats); pcDownload(`paper_mr_${tag}.csv`, t); out.push(`MR표 ${t.length - 1}행`);
        }
        status.innerHTML = `<span style="color:var(--approve);">내려받음 — ${out.join(' · ')} (숨김 처리된 개체 제외)</span>`;
    } catch (e) {
        console.error(e);
        status.innerHTML = `<span style="color:var(--stamp);">실패: ${pcEsc(e.message)}</span>`;
    } finally { btns.forEach(b => b.disabled = false); }
}
