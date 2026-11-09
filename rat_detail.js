// ============================================================
//  랫드 상세 - 저장 통합
//  전에는 항목마다 저장 버튼이 따로 있어서, 필드 5개를 고치면
//  쓰기 5번 · 알림창 5번 · 화면 전체 리로드 5번이 일어났다.
//  (게다가 저장할 때마다 캐시를 지워 rat 목록 전체를 다시 읽었다)
//
//  이제는 화면에서 고친 것을 모아뒀다가 저장 한 번에 반영한다.
// ============================================================

let rdDocId = null;
let rdRat = null;
let rdDraft = {};      // 바뀐 필드만 담는다

function rdInit(docId, rat) {
    rdDocId = docId;
    rdRat = rat || {};
    rdDraft = {};
    rdUpdateBar();
}

function rdSet(field, value) {
    const before = rdRat[field];
    // 배열 · 객체(혈액검사 목록)는 내용으로 비교한다 — String()이면 전부 '[object Object]'라 바꿔도 안 바뀐 걸로 보인다
    const norm = (v) => (v === undefined || v === null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v);

    if (String(norm(before)) === String(norm(value))) delete rdDraft[field];
    else rdDraft[field] = value;

    rdUpdateBar();
}

function rdDirtyCount() { return Object.keys(rdDraft).length; }

function rdUpdateBar() {
    const bar = document.getElementById('rd-savebar');
    if (!bar) return;
    const n = rdDirtyCount();
    bar.style.display = n ? 'flex' : 'none';
    const label = document.getElementById('rd-savebar-label');
    if (label) label.textContent = `변경사항 ${n}개`;
}

// 'YYYY-MM-DD'에 일수를 더한다 (문자열로만 계산해 시간대 문제를 피함)
// 소수는 내림(floor). 기존 구현(setDate)이 양수·음수 모두 내림으로 동작하므로
// 그대로 맞춰 과거 데이터가 하루도 밀리지 않게 한다.
function rdAddDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + Math.floor(days));
    return dt.toISOString().slice(0, 10);
}

// Sham/Naïve는 실제 수술이 없으므로, 그래프의 POD 축을 맞추기 위해
// '반입일 + (기준주령 - 반입주령)×7일'을 가상 수술일로 저장한다.
function rdVirtualSurgeryDate(arrivalDate, arrivalAge, refAge) {
    if (!arrivalDate) return null;
    return rdAddDays(arrivalDate, (Number(refAge) - Number(arrivalAge)) * 7);
}

async function rdSave() {
    if (!rdDocId || !rdDirtyCount()) return;

    const payload = {};
    Object.entries(rdDraft).forEach(([k, v]) => {
        if (k === 'arrivalAge' || k === 'refAge') { if (v !== '' && v !== null && Number(v) > 0) payload[k] = Number(v); }
        else if (k === 'isNonInduction') payload[k] = !!v;
        else if (k === 'bloodTests') payload[k] = rdBloodClean(v);
        else payload[k] = v;
    });
    if (payload.bloodTests && payload.bloodTests.bad) {
        return alert('혈액검사에 검사 항목이 비어 있는 줄이 있습니다.\n\n' + payload.bloodTests.bad + '\n\n항목 이름을 넣거나 그 줄을 지우세요.');
    }

    // Sham 여부가 바뀌었거나 기준주령을 고쳤으면 수술일을 다시 정한다
    const isSham = ('isNonInduction' in payload) ? payload.isNonInduction : !!rdRat.isNonInduction;
    if ('isNonInduction' in payload || 'refAge' in payload) {
        if (isSham) {
            const arrivalDate = rdRat.arrivalDate;
            const arrivalAge = ('arrivalAge' in payload) ? payload.arrivalAge : (Number(rdRat.arrivalAge) || 6);
            const refAge = ('refAge' in payload) ? payload.refAge : (Number(rdRat.refAge) || 9);
            if (!arrivalDate) {
                return alert('Sham/Naïve로 두려면 반입일이 먼저 입력되어 있어야 합니다.\n(그래프 기준일을 반입일로부터 계산합니다)');
            }
            payload.surgeryDate = rdVirtualSurgeryDate(arrivalDate, arrivalAge, refAge);
        } else {
            payload.refAge = firebase.firestore.FieldValue.delete();
            const el = document.getElementById('surg-d');
            if (el) payload.surgeryDate = el.value;
        }
    }

    const btn = document.getElementById('rd-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    try {
        await db.collection('rats').doc(rdDocId).update(payload);
        clearRatsCache();
        rdDraft = {};
        rdUpdateBar();
        if (typeof cfgToast === 'function') cfgToast('저장되었습니다');
        // 저장 후 한 번만 다시 그린다 (POD·주령 같은 파생 표시를 갱신하기 위해)
        if (typeof loadDetailData === 'function') loadDetailData();
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
}

function rdRevert() {
    if (!rdDirtyCount()) return;
    if (!confirm('저장하지 않은 변경사항을 버리고 되돌릴까요?')) return;
    rdDraft = {};
    if (typeof loadDetailData === 'function') loadDetailData();
}

// 상세 화면 하단에 붙는 저장 바
function rdSaveBarHtml() {
    return `
    <div id="rd-savebar" style="display:none; position:sticky; bottom:0; z-index:60;
         background:var(--ink); color:var(--paper); padding:12px 78px 12px 18px; border-radius:2px; margin-top:16px;
         align-items:center; justify-content:space-between; border-top:1px solid var(--rule);">
        <span id="rd-savebar-label" style="font-size:0.9rem;">변경사항</span>
        <div style="display:flex; gap:8px;">
            <button class="btn-small" onclick="rdRevert()" style="background:#fff; color:var(--navy);">되돌리기</button>
            <button id="rd-save-btn" class="btn-small btn-green" onclick="rdSave()">저장</button>
        </div>
    </div>`;
}

// ---------- 상세 화면의 케이지 · 섭취량 요약 ----------
// 개체가 지금 어느 케이지에 있는지, 그 케이지가 최근 얼마나 먹고 마셨는지 보여준다.
// 섭취량은 케이지 단위 값이므로 '케이지 평균'임을 명시한다.
// 투약 상태는 저장된 값이 아니라 수술일 + 코호트 설정에서 매번 계산한다.
// (계산 함수는 cage_input.js와 공용)
async function rdDoseStatusHtml() {
    try {
        if (typeof ciDoseWindow !== 'function' || !rdRat || !rdRat.cohort) return '';
        const cfg = await getCohortConfig(rdRat.cohort);
        const gkey = rdRat.group ? ('G' + String(rdRat.group).replace(/^G/, '')) : 'G1';
        const rule = ((cfg && cfg.dosing) || []).find(d =>
            d.medium === 'water' && (d.groups || []).includes(gkey) && Number(d.value) > 0);
        if (!rule) return '';

        // 죽었거나 희생된 개체는 '투약 중 · N일째'가 계속 올라가면 안 된다.
        // 대신 그때까지 며칠 투약했고 평균 얼마를 받았는지 보여준다.
        if (rdRat.status === '사망' || rdRat.deathDate) return await rdDoseSummaryHtml(cfg, rule);

        const win = ciDoseWindow(rdRat, rule);
        const d = ciDaysFromStart(rdRat, rule);
        const anchor = { ligation: '수술일', ovx: 'OVX', arrival: '반입일' }[rule.startAnchor] || rule.startAnchor;

        const view = {
            nodate: { c:'#7C2A30', bg:'var(--stock-pink-soft)', bd:'var(--stock-pink)', t:'투약 시작일을 알 수 없음',
                      s:`${anchor}이 비어 있습니다. 넣기 전까지 투약이 시작되지 않습니다.` },
            before: { c:'#6B571C', bg:'var(--stock-canary-soft)', bd:'#E3C55C', t:`투약 시작까지 ${d === null ? '-' : -d}일`,
                      s:`${anchor} +${rule.startOffset}일부터 시작합니다.` },
            on:     { c:'var(--ink)', bg:'var(--stock-blue-soft)', bd:'var(--ink-blue)', t: d === 0 ? '오늘 투약 시작' : `투약 중 · ${d}일째`,
                      s:`${rule.value} ${rule.unit || 'mg/kg/day'} · 음수 투여` },
            after:  { c:'var(--ink-soft)', bg:'var(--paper)', bd:'var(--rule)', t:'투약 종료', s:'설정된 투약 구간이 끝났습니다.' }
        }[win];

        return `
        <div style="background:${view.bg}; border:1px solid ${view.bd}; border-radius:2px;
                    padding:10px 12px; margin-bottom:10px;">
            <div style="font-size:0.72rem; letter-spacing:0.1em; font-weight:700; color:${view.c}; opacity:0.85;">${rule.substance}</div>
            <div style="font-size:1.05rem; font-weight:bold; color:${view.c}; margin:2px 0;">${view.t}</div>
            <div style="font-size:0.76rem; color:${view.c}; opacity:0.88;">${view.s}</div>
        </div>`;
    } catch (e) { console.error(e); return ''; }
}

// 사망·희생 개체의 투약 요약 — 투약 며칠, 그동안 평균 몇 mg/kg/일.
// 물통을 같이 쓰므로 개체값이 아니라 그 개체가 있던 케이지의 도달량이다.
// 평균은 섭취량·투여량 화면의 누적 평균선과 같은 방식(global.js metDoseIntervals, 구간 일수 가중)이고,
// 그 개체가 그 케이지에 있었고 투약 중이었던 시간만큼만 센다(케이지를 옮겼거나 구간 중간에 죽은 경우).
async function rdDoseSummaryHtml(cfg, rule) {
    const label = rdRat.sampleDate ? '희생' : '사망';
    const endDate = ciDateStr(rdRat.deathDate);
    const base = ciDateStr(rule.startAnchor === 'ligation' ? rdRat.surgeryDate
                         : rule.startAnchor === 'ovx' ? rdRat.ovxDate
                         : rule.startAnchor === 'arrival' ? rdRat.arrivalDate : null);
    const box = (t, s) => `
        <div style="background:var(--paper); border:1px solid var(--rule); border-radius:2px; padding:10px 12px; margin-bottom:10px;">
            <div style="font-size:0.72rem; letter-spacing:0.1em; font-weight:700; color:var(--ink-soft);">${rule.substance} · ${label}</div>
            <div style="font-size:1.05rem; font-weight:bold; color:var(--ink); margin:2px 0;">${t}</div>
            <div style="font-size:0.76rem; color:var(--ink-soft);">${s}</div>
        </div>`;
    if (!base) return box(`${label}${endDate ? ` · ${endDate}` : ''}`, '투약 시작일을 알 수 없어 투약 기간을 계산하지 못했습니다.');

    const start = ciShiftDate(base, rule.startOffset);
    if (!endDate || endDate < start) return box(`투약 시작 전 ${label}`, endDate ? `${endDate} · 투약은 ${start}부터 예정이었습니다.` : '');
    const dosingDays = Math.round((new Date(endDate + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000);

    // 이 개체가 머문 케이지 기간
    const hs = await db.collection('ratHousing').where('ratId', '==', rdRat.ratId).get();
    const t0 = new Date(start + 'T00:00:00').getTime();
    const tEnd = new Date(endDate + 'T00:00:00').getTime() + 86400000;
    const stays = [];
    hs.forEach(d => { const h = d.data();
        const from = h.from?.toMillis?.() || 0, to = h.to?.toMillis?.() || tEnd;
        const a = Math.max(from, t0), b = Math.min(to, tEnd);
        if (b > a) stays.push({ cageId: String(h.cageId), a, b }); });

    // 같은 코호트 기록을 한 번에 받아 케이지별로 나눈다 (섭취량·투여량 화면과 같은 조회)
    const fs = await db.collection('cageFeeding').where('cohort', '==', String(rdRat.cohort)).get();
    const byCage = {};
    fs.forEach(d => { const v = d.data(); (byCage[String(v.cageId)] = byCage[String(v.cageId)] || []).push(v); });

    let mg = 0, w = 0;
    stays.forEach(st => metDoseIntervals(byCage[st.cageId]).forEach(iv => {
        if (!iv.usable) return;
        const ov = Math.min(iv.end, st.b) - Math.max(iv.start, st.a);
        if (ov <= 0) return;
        const wt = iv.days * ov / (iv.end - iv.start);
        mg += iv.dose * wt; w += wt;
    }));
    if (!(w > 0)) return box(`투약 ${dosingDays}일 · ${label}`, `${start} ~ ${endDate} · 계산에 쓸 수 있는 섭취 기록이 없습니다.`);

    const avg = mg / w;
    const pct = avg / Number(rule.value) * 100;
    return box(`투약 ${dosingDays}일 · 평균 <span class="mono">${avg.toFixed(0)}</span> mg/kg/day`,
        `${start} ~ ${endDate} · 목표 ${rule.value}의 ${pct.toFixed(0)}% · 계산에 쓴 구간 ${w.toFixed(0)}일 · 물통을 같이 쓴 케이지 기준`);
}

async function rdRenderCageInfo(ratId, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const doseHtml = await rdDoseStatusHtml();

    try {
        const hs = await db.collection('ratHousing').where('ratId', '==', ratId).get();
        const recs = [];
        hs.forEach(d => recs.push(d.data()));
        recs.sort((a, b) => (b.from?.toMillis?.() || 0) - (a.from?.toMillis?.() || 0));
        const current = recs.find(r => !r.to);

        if (!current) {
            box.innerHTML = doseHtml + `<div style="color:var(--ink-soft); font-size:0.85rem;">
                배정된 케이지가 없습니다. ${recs.length ? `(지난 재실 ${recs.length}건)` : ''}</div>`;
            return;
        }

        // 이 케이지의 최근 급여 기록.
        // 케이지 전체 이력을 다 읽으면 코호트가 길어질수록 읽기가 무한정 늘어난다.
        // 화면에 쓰는 건 최근 7건뿐이라 날짜 하한을 두고, 케이지는 화면에서 거른다.
        // (cageId 등호 + 날짜 범위를 한 쿼리에 넣으면 복합 인덱스가 필요해서 —
        //  대시보드·케이지별 입력과 같은 '날짜 범위 단일 조회' 방식을 쓴다)
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 21);
        const fs = await db.collection('cageFeeding').where('dateStr', '>=', cutoff.toISOString().slice(0, 10)).get();
        const rows = [];
        fs.forEach(d => { const v = d.data();
            // 같은 번호를 다른 코호트가 쓴 기록은 뺀다 (케이지 번호 재사용, 2026-10-26)
            if (String(v.cageId) === String(current.cageId) && (!current.cohort || String(v.cohort) === String(current.cohort))
                && typeof v.waterPerCapita === 'number') rows.push(v); });
        rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
        const recent = rows.filter(r => !(r.flags || []).length).slice(0, 7);

        const avg = (key) => {
            const vals = recent.map(r => r[key]).filter(v => typeof v === 'number');
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        const w = avg('waterPerCapita'), f = avg('foodPerCapita');
        const last = rows[0];
        const since = doseDateOf(current.from) || '-';   // 한국 시각 날짜 (toISOString은 UTC라 오전 9시 전 입실이 전날로 보였다)

        box.innerHTML = doseHtml + `
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:110px; background:var(--sheet); border:1px solid var(--rule); border-radius:2px; padding:10px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--ink-soft);">현재 케이지</div>
                <div class="mono" style="font-size:1.4rem; font-weight:bold; color:var(--ink);">${current.cageId}번</div>
                <div style="font-size:0.72rem; color:var(--ink-soft);">${since}부터</div>
            </div>
            <div style="flex:1; min-width:110px; background:var(--sheet); border:1px solid var(--rule); border-radius:2px; padding:10px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--ink-soft);">물 (최근 ${recent.length}일)</div>
                <div class="mono" style="font-size:1.4rem; font-weight:bold; color:var(--ink-blue);">${w ? w.toFixed(0) : '-'}</div>
                <div style="font-size:0.72rem; color:var(--ink-soft);">mL/일 · 케이지 평균</div>
            </div>
            <div style="flex:1; min-width:110px; background:var(--sheet); border:1px solid var(--rule); border-radius:2px; padding:10px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--ink-soft);">사료 (최근 ${recent.length}일)</div>
                <div class="mono" style="font-size:1.4rem; font-weight:bold; color:#7A5C00;">${f ? f.toFixed(1) : '-'}</div>
                <div style="font-size:0.72rem; color:var(--ink-soft);">g/일 · 케이지 평균</div>
            </div>
            ${last && last.doseCc ? `
            <div style="flex:1; min-width:110px; background:var(--stock-blue-soft); border:1px solid var(--ink-blue); border-radius:2px; padding:10px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--ink-blue);">최근 투약</div>
                <div class="mono" style="font-size:1.4rem; font-weight:bold; color:var(--ink);">${last.doseCc} cc</div>
                <div class="mono" style="font-size:0.72rem; color:var(--ink-blue);">${last.dateStr}</div>
            </div>` : ''}
        </div>
        ${recent.length ? `
        <div style="margin-top:8px; font-size:0.75rem; color:var(--ink-soft);">
            물통을 같이 쓰므로 개체별 값이 아니라 케이지 평균입니다.
            ${recs.length > 1 ? ` · 재실 이력 ${recs.length}건` : ''}
        </div>` : `
        <div style="margin-top:8px; font-size:0.78rem; color:var(--ink-soft);">아직 급여 기록이 없습니다.</div>`}`;
    } catch (e) {
        console.error(e);
        box.innerHTML = `<div style="color:var(--stamp); font-size:0.82rem;">케이지 정보를 불러오지 못했습니다.</div>`;
    }
}

// 페이지를 벗어날 때(뒤로가기 포함) 저장 안 한 변경이 있으면 알린다 — global.js 뒤로가기 막기
if (typeof registerUnsavedCheck === 'function') {
    registerUnsavedCheck(() => rdDirtyCount() ? `랫드 상세(${(rdRat && rdRat.ratId) || ''})에 저장 안 한 변경이 ${rdDirtyCount()}개 있습니다.` : null);
} else {
    window.addEventListener('beforeunload', (e) => {
        if (rdDirtyCount()) { e.preventDefault(); e.returnValue = ''; }
    });
}


// ==========================================
//  기본 일정 패널 (랫드 상세) — 원장(ledger) 한 칸씩: 항목 | 입력 | 기준일로부터 며칠
//  날짜를 고치면 오른쪽 힌트가 바로 다시 계산된다. 저장은 rdSave 가 한 번에 한다.
// ==========================================
const RD_IN = "width:auto; padding:6px 8px; border:1px solid var(--rule); border-radius:2px; font-size:0.85rem; background:var(--sheet); color:var(--ink); font-family:var(--font-mono);";
const RD_SCHED = [
    { id: 'ovx-d',        ref: 'surgery', fmt: d => d < 0 ? `수술 ${-d}일 전` : d === 0 ? '수술 당일' : `수술 ${d}일 후` },
    { id: 'nacl-d',       ref: 'arrival', fmt: d => `반입 +${d}일` },
    { id: 'surg-d',       ref: 'arrival', fmt: d => `반입 +${d}일` },
    { id: 'bapn-d',       ref: 'surgery', fmt: d => `POD ${d}` },
    { id: 'dose-start-d', ref: 'surgery', fmt: d => `POD ${d}` },
    { id: 'nacl-end-d',   ref: 'surgery', fmt: d => `POD ${d} · 이날부터 일반식` },
];
function rdDays(a, b) {
    if (!a || !b) return null;
    const x = new Date(String(a).slice(0, 10) + 'T00:00:00'), y = new Date(String(b).slice(0, 10) + 'T00:00:00');
    return (isNaN(x) || isNaN(y)) ? null : Math.round((y - x) / 864e5);
}
function rdHintText(row) {
    const v = document.getElementById(row.id)?.value;
    if (!v) return '';
    const surg = document.getElementById('surg-d')?.value || rdRat.surgeryDate;
    const useSurg = row.ref === 'surgery' && surg;
    const base = useSurg ? surg : rdRat.arrivalDate;
    const d = rdDays(base, v);
    if (d === null) return '';
    const txt = useSurg ? row.fmt(d) : (row.ref === 'surgery' ? `반입 +${d}일` : row.fmt(d));
    const age = (!useSurg && rdRat.arrivalAge) ? ` · ${(Number(rdRat.arrivalAge) + d / 7).toFixed(1)}주령` : '';
    return txt + age;
}
function rdRefreshHints() {
    RD_SCHED.forEach(row => { const el = document.getElementById('hint-' + row.id); if (el) el.textContent = rdHintText(row); });
}
// ==========================================
//  혈액검사 (2026-11-09 사용자) — 「얻은 샘플」(Cast · Histology · 못함)과 별개 필드라 같이 있을 수 있다.
//  rats.bloodTests = [{ date, test, value, unit, memo }]. value 는 숫자로 읽히면 숫자, 아니면(예: '<0.2') 글자 그대로.
//  한 번 채혈에 여러 항목이 나오므로 줄을 여러 개 둔다. 저장은 다른 칸과 같이 rdSave 한 번에.
// ==========================================
const RD_BLOOD_TESTS = ['Creatinine', 'BUN', 'Na', 'K', 'Cl', 'Glucose', 'ALT', 'AST', 'Albumin', 'Total protein', 'Cholesterol', 'Triglyceride'];
const RD_BLOOD_UNITS = ['mg/dL', 'mmol/L', 'mEq/L', 'U/L', 'g/dL', 'µmol/L'];
function rdBloodList() { return (('bloodTests' in rdDraft) ? rdDraft.bloodTests : rdRat.bloodTests) || []; }
// 처음 그릴 때는 rdInit 전이라 rdRat 이 앞 개체일 수 있다 — 그래서 목록을 직접 받는다 (chart.js loadDetailData)
function rdBloodHtml(initial) {
    const list = initial || rdBloodList();
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rows = list.map((b, i) => `
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; width:100%;">
            <input type="date" value="${e(b.date)}" aria-label="채혈일" onchange="rdBloodSet(${i}, 'date', this.value)" style="${RD_IN}">
            <input type="text" list="rd-blood-tests" value="${e(b.test)}" placeholder="검사 항목" aria-label="검사 항목"
                   oninput="rdBloodSet(${i}, 'test', this.value)" style="${RD_IN} font-family:inherit; width:120px;">
            <input type="text" inputmode="decimal" value="${e(b.value)}" placeholder="수치" aria-label="수치"
                   oninput="rdBloodSet(${i}, 'value', this.value)" style="${RD_IN} width:76px;">
            <input type="text" list="rd-blood-units" value="${e(b.unit)}" placeholder="단위" aria-label="단위"
                   oninput="rdBloodSet(${i}, 'unit', this.value)" style="${RD_IN} width:76px;">
            <input type="text" value="${e(b.memo)}" placeholder="메모 (검사처 등)" aria-label="혈액검사 메모"
                   oninput="rdBloodSet(${i}, 'memo', this.value)" style="${RD_IN} font-family:inherit; flex:1; min-width:100px;">
            <button type="button" class="btn-small" onclick="rdBloodDel(${i})" aria-label="이 줄 지우기"
                    style="background:var(--paper); color:var(--stamp); outline:1px solid var(--rule);">✕</button>
        </div>`).join('');
    return `${rows || '<span style="font-size:0.8rem; color:var(--ink-soft);">기록 없음</span>'}
        <button type="button" class="btn-small" onclick="rdBloodAdd()"
                style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);">+ 검사 항목</button>
        <datalist id="rd-blood-tests">${RD_BLOOD_TESTS.map(t => `<option value="${t}">`).join('')}</datalist>
        <datalist id="rd-blood-units">${RD_BLOOD_UNITS.map(t => `<option value="${t}">`).join('')}</datalist>`;
}
function rdBloodCommit(list, redraw) {
    rdSet('bloodTests', list);
    if (redraw) { const el = document.getElementById('rd-blood'); if (el) el.innerHTML = rdBloodHtml(); }
}
function rdBloodAdd() {
    const list = rdBloodList().map(b => ({ ...b }));
    // 같은 날 여러 항목을 넣는 게 보통이라 바로 윗줄 날짜를 물려준다. 첫 줄은 샘플 채취일 → 사망일 → 오늘
    const prev = list[list.length - 1];
    const sampleD = document.getElementById('sample-d')?.value;
    list.push({ date: (prev && prev.date) || sampleD || rdRat.sampleDate || rdRat.deathDate || getTodayStr(),
                test: '', value: '', unit: (prev && prev.unit) || '', memo: '' });
    rdBloodCommit(list, true);
}
function rdBloodSet(i, key, val) {
    const list = rdBloodList().map(b => ({ ...b }));
    if (!list[i]) return;
    list[i][key] = val;
    rdBloodCommit(list, false);   // 한 글자마다 다시 그리면 커서가 빠진다
}
function rdBloodDel(i) {
    const list = rdBloodList().map(b => ({ ...b }));
    const b = list[i];
    if (b && (b.test || b.value) && !confirm(`${b.test || '이 줄'} ${b.value || ''} 을(를) 지울까요? (저장해야 반영됩니다)`)) return;
    list.splice(i, 1);
    rdBloodCommit(list, true);
}
// 저장용 정리: 빈 줄은 버리고, 수치는 숫자로 읽히면 숫자로. 항목 없이 수치만 있는 줄은 bad 로 돌려 저장을 막는다
function rdBloodClean(list) {
    const out = [], bad = [];
    (list || []).forEach(b => {
        const test = String(b.test || '').trim(), raw = String(b.value ?? '').trim();
        const unit = String(b.unit || '').trim(), memo = String(b.memo || '').trim();
        if (!test && !raw && !memo) return;
        if (!test) { bad.push(`${b.date || '날짜 없음'} · 수치 ${raw || '-'}`); return; }
        const num = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        out.push({ date: b.date || null, test, value: num, unit, memo });
    });
    if (bad.length) out.bad = bad.join('\n');
    return out;
}
// 다른 화면(코호트 분석 표 · 논문 CSV)에서 한 줄로 보여줄 때
function bloodTestsText(list) {
    return (list || []).map(b => `${b.test} ${b.value ?? ''}${b.unit ? ' ' + b.unit : ''}${b.date ? ` (${b.date})` : ''}`).join('; ');
}

function rdSchedRow(label, inner, hintId, extraStyle = '') {
    return `<div style="display:grid; grid-template-columns:112px minmax(0,1fr) auto; align-items:center; gap:10px; padding:7px 12px; border-bottom:1px solid var(--rule); ${extraStyle}">
        <span style="font-size:0.8rem; font-weight:700; color:var(--ink);">${label}</span>
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap;">${inner}</div>
        ${hintId ? `<span id="${hintId}" class="mono" style="font-size:0.75rem; color:var(--ink-soft); white-space:nowrap;"></span>` : '<span></span>'}
    </div>`;
}
