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
    const norm = (v) => (v === undefined || v === null) ? '' : v;

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
        if (k === 'arrivalAge' || k === 'refAge') payload[k] = Number(v);
        else if (k === 'isNonInduction') payload[k] = !!v;
        else payload[k] = v;
    });

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
            if (String(v.cageId) === String(current.cageId) && typeof v.waterPerCapita === 'number') rows.push(v); });
        rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
        const recent = rows.filter(r => !(r.flags || []).length).slice(0, 7);

        const avg = (key) => {
            const vals = recent.map(r => r[key]).filter(v => typeof v === 'number');
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        const w = avg('waterPerCapita'), f = avg('foodPerCapita');
        const last = rows[0];
        const since = current.from?.toDate ? current.from.toDate().toISOString().slice(0, 10) : '-';

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

// 페이지를 벗어날 때 저장 안 한 변경이 있으면 알린다
window.addEventListener('beforeunload', (e) => {
    if (rdDirtyCount()) { e.preventDefault(); e.returnValue = ''; }
});
