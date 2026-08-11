// ============================================================
//  케이지별 입력 (Daily Cage Round)
//  - 작업 순서 그대로: 잔량 재기 → 채울 양 → 쥐 체중·상태 → 다음 케이지
//  - 저장 1회에 물/사료(cageFeeding) + 체중(measurements) + 상태(dailyLogs)로 갈라 저장
//
//  [기록 구조] 방문 1회 = 행 1개.
//  섭취량은 연속한 두 방문을 짝지어 계산한다.
//    섭취 = 지난방문.채운양 − 이번방문.잔량 − 로스(증발·탈착)
//  이러면 주말처럼 하루 건너뛰어도 자동으로 맞는다.
// ============================================================

let ciCohort = null;
let ciConfig = null;
let ciCages = [];        // 이 코호트 쥐가 들어있는 케이지만
let ciHousing = [];
let ciAllHousing = [];   // 끝난 재실 포함 (구간 중 변동을 반영하려면 필요)
let ciRats = [];
let ciLastFeed = {};     // cageId -> 직전 방문 기록
let ciRecentPc = {};     // cageId -> 최근 마리당 섭취량(mL/day)
let ciCurrent = null;    // 지금 입력 중인 케이지 id
let ciDoneToday = new Set();
let ciForm = {};         // 입력 중인 값
let ciLastSaved = null;  // 방금 저장한 케이지의 조제 지시 (다음 케이지로 넘어가도 계속 보이게)

// ---------- 진입점 ----------
async function renderCageInputView(main) {
    main.innerHTML = `
    <div class="card">
        <h3>📝 케이지별 입력</h3>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-weight:bold; color:var(--navy);">코호트</label>
            <select id="ci-cohort-sel" style="width:auto; min-width:130px; padding:8px; border-radius:6px; border:1px solid #ccc;">
                <option>로딩 중...</option>
            </select>
            <button class="btn-small btn-blue" onclick="ciLoad()">시작</button>
        </div>
    </div>
    <div id="ci-body"></div>`;

    const sel = document.getElementById('ci-cohort-sel');
    try {
        const rats = await getRatsWithCache();
        const nums = Array.from(new Set(rats.map(r => String(r.cohort)).filter(Boolean)))
            .sort((a, b) => Number(b) - Number(a));
        sel.innerHTML = nums.map(n => `<option value="${n}">코호트 ${n}</option>`).join('');
    } catch (e) { sel.innerHTML = '<option value="">불러오기 실패</option>'; }
}

async function ciLoad() {
    const sel = document.getElementById('ci-cohort-sel');
    if (!sel || !sel.value) return alert('코호트를 먼저 선택하세요.');
    ciCohort = sel.value;
    ciCurrent = null; ciForm = {}; ciDoneToday = new Set();

    const body = document.getElementById('ci-body');
    body.innerHTML = '<div class="card">불러오는 중...</div>';

    try {
        const [cageSnap, houseSnap, rats, cfg] = await Promise.all([
            db.collection('cages').get(),
            db.collection('ratHousing').where('to', '==', null).get(),
            getRatsWithCache(),
            getCohortConfig(ciCohort)
        ]);

        ciConfig = cfg;
        ciRats = rats.filter(r => String(r.cohort) === String(ciCohort));

        ciHousing = [];
        houseSnap.forEach(d => {
            const v = d.data();
            if (ciRats.some(r => r.ratId === v.ratId)) ciHousing.push(v);
        });

        // 끝난 재실까지 포함해서 받아둔다.
        // 구간 도중에 죽거나 옮겨간 경우를 animal_days에 정확히 반영하려면 필요하다.
        const allSnap = await db.collection('ratHousing').where('cohort', '==', String(ciCohort)).get();
        ciAllHousing = [];
        allSnap.forEach(d => ciAllHousing.push(d.data()));

        const usedCages = new Set(ciHousing.map(h => String(h.cageId)));
        ciCages = [];
        cageSnap.forEach(d => { if (usedCages.has(d.id)) ciCages.push(Object.assign({ id: d.id }, d.data())); });
        ciCages.sort((a, b) => Number(a.number) - Number(b.number));

        await ciLoadHistory();
        ciRenderList();
    } catch (e) {
        console.error(e);
        body.innerHTML = `<div class="card" style="color:red">불러오기 실패: ${e.message}</div>`;
    }
}

// 케이지별 직전 방문 + 최근 마리당 섭취량
// 마리당으로 기억해야 케이지를 합치거나 개체가 죽어도 예상치가 어긋나지 않는다.
async function ciLoadHistory() {
    ciLastFeed = {}; ciRecentPc = {};
    const todayStr = getTodayStr();

    // 케이지별로 따로 조회하면 복합 인덱스가 필요하고 읽기 횟수도 많아진다.
    // 최근 며칠치를 한 번에 받아 화면에서 케이지별로 나눈다 (단일 필드 조회라 인덱스 불필요).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 12);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const snap = await db.collection('cageFeeding').where('dateStr', '>=', cutoffStr).get();
    const byCage = {};
    snap.forEach(d => {
        const v = Object.assign({ id: d.id }, d.data());
        (byCage[String(v.cageId)] = byCage[String(v.cageId)] || []).push(v);
    });

    ciCages.forEach(cage => {
        const rows = byCage[String(cage.id)];
        if (!rows || !rows.length) return;
        rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));

        ciLastFeed[cage.id] = rows[0];
        if (rows[0].dateStr === todayStr) ciDoneToday.add(String(cage.id));

        // 예상 섭취량은 '마리당'으로 기억 → 합치거나 죽어도 어긋나지 않음.
        // 이상 플래그가 붙은 구간은 제외.
        const pcs = rows
            .filter(r => !(r.flags || []).length)
            .map(r => r.waterPerCapita)
            .filter(v => typeof v === 'number' && v > 0)
            .slice(0, 5);
        if (pcs.length) ciRecentPc[cage.id] = pcs.reduce((a, b) => a + b, 0) / pcs.length;
    });
}

// ---------- 케이지 목록 ----------
function ciRenderList() {
    const body = document.getElementById('ci-body');
    if (!ciCages.length) {
        body.innerHTML = `<div class="card" style="color:#666;">
            이 코호트의 쥐가 배정된 케이지가 없습니다. <b>케이지 현황</b>에서 먼저 배정해주세요.</div>`;
        return;
    }

    const done = ciCages.filter(c => ciDoneToday.has(String(c.id))).length;
    const states = {};
    ciCages.forEach(c => { states[c.id] = ciCageDoseState(c.id); });

    body.innerHTML = `
    ${ciLastSavedBanner()}
    ${ciPrepPreviewCard()}
    ${ciDoseAlertBanner(states)}
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; color:var(--navy);">오늘 진행</h4>
            <div style="display:flex; align-items:center; gap:10px;">
                ${done ? `<button class="btn-small btn-blue" onclick="ciShowPrepSheet()">조제 지시 (${done})</button>` : ''}
                <b style="color:${done === ciCages.length ? '#2e7d32' : 'var(--navy)'};">${done} / ${ciCages.length}</b>
            </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:8px;">
            ${ciCages.map(c => {
                const isDone = ciDoneToday.has(String(c.id));
                const n = ciOccupants(c.id).length;
                const st = states[c.id];
                // 오늘 시작이거나 날짜가 비어 있으면 테두리로 눈에 띄게 한다
                const urgent = st && (st.key === 'nodate' || st.today);
                return `<button onclick="ciOpen('${c.id}')"
                    style="padding:10px 6px; border-radius:8px; cursor:pointer; font-size:0.95rem; line-height:1.35;
                           border:${urgent ? '2px' : '1px'} solid ${urgent ? st.color : (isDone ? '#a5d6a7' : '#ccc')};
                           background:${isDone ? '#e8f5e9' : '#fff'}; color:${isDone ? '#2e7d32' : '#333'};">
                    <b>${c.number}번</b><br>
                    <span style="font-size:0.75rem;">${isDone ? '입력 완료' : n + '마리'}</span>
                    ${st ? `<br><span style="display:inline-block; margin-top:3px; padding:1px 6px; border-radius:9px;
                                 font-size:0.68rem; font-weight:bold; background:${st.bg}; color:${st.color};">
                        ${st.label}${st.partial ? ' ⚠' : ''}</span>` : ''}
                </button>`;
            }).join('')}
        </div>
    </div>
    ${done === ciCages.length ? `
    <div class="card" style="background:#e8f5e9; border:1px solid #a5d6a7;">
        <b style="color:#2e7d32;">오늘 입력이 모두 끝났습니다.</b>
    </div>` : ''}`;
}

// ---------- 오늘 조제량 미리보기 ----------
// 사육실에 가기 전 벤치에서 만들어야 하므로, 라운드를 돌기 전에 필요량을 알아야 한다.
// 지난 라운드의 체중(sumBW)과 마리당 섭취량으로 추정한다. 정확할 수는 없으니 여유를 얹는다.
function ciPrepPlan() {
    const fill = Number((ciConfig && ciConfig.housing && ciConfig.housing.waterFill)) || 700;
    const rows = [];
    let stock = null;

    ciCages.forEach(cage => {
        if (ciDoneToday.has(String(cage.id))) return;      // 이미 넣은 케이지는 뺀다
        const st = ciCageDoseState(cage.id);
        if (!st || st.key !== 'on') return;

        stock = Number(st.rule.stockConc) || stock;
        const n = ciOccupants(cage.id).length;
        const bw = (ciLastFeed[cage.id] || {}).sumBW;
        const pc = ciRecentPc[cage.id];

        rows.push({
            number: cage.number,
            mg: (bw && pc && n) ? Number(st.rule.value) * (bw / 1000) * (fill / (pc * n)) : null
        });
    });
    return { rows, stock, fill };
}

function ciPrepPreviewCard() {
    const { rows, stock } = ciPrepPlan();
    if (!rows.length || !stock) return '';

    const known = rows.filter(r => r.mg !== null);
    const unknown = rows.filter(r => r.mg === null);
    if (!known.length) return '';

    // 모르는 케이지는 아는 케이지의 평균으로 메운다
    const avg = known.reduce((a, r) => a + r.mg, 0) / known.length;
    const totalMg = known.reduce((a, r) => a + r.mg, 0) + unknown.length * avg;
    const needCc = totalMg / stock;
    const makeCc = Math.ceil((needCc * 1.3) / 10) * 10;    // 30% 여유 후 10 mL 단위

    return `
    <div class="card" style="background:#0d47a1; color:#fff; padding:14px 16px;">
        <div style="font-size:0.78rem; opacity:0.85;">사육실 가기 전 · 오늘 만들 원액</div>
        <div style="font-size:1.35rem; font-weight:bold; margin:6px 0;">
            가루 ${(makeCc * stock / 1000).toFixed(1)} g &nbsp;+&nbsp; 증류수로 총 ${makeCc} mL 눈금까지
        </div>
        <div style="font-size:0.78rem; opacity:0.9;">
            투약 케이지 ${rows.length}개 · 예상 사용 ${needCc.toFixed(0)} cc · 원액 ${stock} mg/mL
            ${unknown.length ? ` · ${unknown.length}개는 지난 기록이 없어 평균으로 추정` : ''}
        </div>
        <div style="font-size:0.73rem; opacity:0.75; margin-top:5px;">
            물 ${makeCc} mL에 녹이는 게 아니라, 가루를 넣고 눈금 ${makeCc} mL까지 채웁니다.
            지난 체중 기준 추정이라 30% 여유를 얹었습니다.
        </div>
    </div>`;
}

// 목록 맨 위에 오늘 챙겨야 할 것만 모아 띄운다.
// 케이지를 하나씩 열어봐야 알 수 있으면 놓치기 쉬운 것들이다.
function ciDoseAlertBanner(states) {
    const pick = fn => ciCages.filter(c => states[c.id] && fn(states[c.id]))
                              .map(c => c.number + '번');
    const noDate = pick(s => s.key === 'nodate' || s.noDateMixed);
    const today  = pick(s => s.today);
    const soon   = pick(s => s.soon);

    if (!noDate.length && !today.length && !soon.length) return '';

    const row = (color, bg, title, list, desc) => !list.length ? '' : `
        <div style="padding:9px 11px; border-radius:6px; background:${bg}; margin-bottom:6px;">
            <b style="color:${color}; font-size:0.88rem;">${title} · ${list.join(', ')}</b>
            <div style="font-size:0.76rem; color:${color}; opacity:0.85; margin-top:2px;">${desc}</div>
        </div>`;

    return `
    <div class="card" style="padding:12px 13px;">
        <div style="font-size:0.78rem; color:#999; margin-bottom:7px;">투약 알림</div>
        ${row('#c62828', '#ffebee', '기준 날짜 없음', noDate,
              '수술일이 비어 있어 투약이 시작되지 않습니다. 날짜를 먼저 넣으세요.')}
        ${row('#0d47a1', '#e3f2fd', '오늘 투약 시작', today,
              '오늘부터 물에 원액을 넣습니다.')}
        ${row('#e65100', '#fff3e0', '곧 시작', soon,
              '3일 이내에 시작합니다. 원액을 미리 준비하세요.')}
    </div>`;
}

// 방금 끝낸 케이지의 조제 지시. 다음 케이지를 입력하는 동안에도 계속 떠 있어야
// 바로 다음 작업으로 넘어갈 수 있다.
function ciLastSavedBanner() {
    if (!ciLastSaved) return '';
    const s = ciLastSaved;
    return `
    <div class="card" style="background:#0d47a1; color:#fff; padding:14px 16px;">
        <div style="font-size:0.78rem; opacity:0.85;">방금 완료</div>
        <div style="font-size:1.3rem; font-weight:bold; margin:5px 0;">
            ${s.number}번 · 물 ${s.water} mL${s.cc ? ` + 원액 ${s.cc.toFixed(1)} cc` : ''}
        </div>
        <div style="font-size:0.8rem; opacity:0.85;">
            사료 ${s.food} g${s.cc ? ` · 원액 ${s.stock} mg/mL` : ' · 원액 없음'}
        </div>
        <button class="btn-small" onclick="ciLastSaved=null; ciCurrent ? ciRenderForm() : ciRenderList();"
                style="background:rgba(255,255,255,0.2); color:#fff; margin-top:8px; padding:3px 10px; font-size:0.75rem;">닫기</button>
    </div>`;
}

function ciOccupants(cageId) {
    return ciHousing.filter(h => String(h.cageId) === String(cageId))
        .map(h => ciRats.find(r => r.ratId === h.ratId))
        .filter(r => r && r.status !== '사망');
}

// ---------- 입력 폼 ----------
function ciOpen(cageId) {
    const cage = ciCages.find(c => String(c.id) === String(cageId));
    if (!cage) {   // 다른 곳에서 케이지가 삭제되었거나 목록이 낡은 경우
        alert('해당 케이지를 찾을 수 없습니다. 목록을 새로 불러옵니다.');
        ciCurrent = null;
        ciLoad();
        return;
    }
    ciCurrent = String(cageId);
    const h = (ciConfig && ciConfig.housing) || {};
    const last = ciLastFeed[ciCurrent];

    ciForm = {
        waterRemaining: '', foodRemaining: '',
        waterGiven: last ? (last.waterGiven ?? h.waterFill ?? 600) : (h.waterFill ?? 600),
        foodGiven: last ? (last.foodGiven ?? h.foodFill ?? 150) : (h.foodFill ?? 150),
        bottleCount: last ? (last.bottleCount ?? h.bottleCount ?? 1) : (h.bottleCount ?? 1),
        note: '', flags: [], noRefill: false, waterScale: '',
        handlings: '',              // 비우면 경과일수로 자동
        rats: {}
    };
    ciOccupants(cageId).forEach(r => {
        ciForm.rats[r.ratId] = { weight: '', act: 0, fur: 0, eye: 0, note: '', dead: false };
    });
    ciRenderForm();
}

function ciRenderForm() {
    const body = document.getElementById('ci-body');
    const cage = ciCages.find(c => String(c.id) === ciCurrent);
    if (!cage) { ciCurrent = null; ciRenderList(); return; }
    const occ = ciOccupants(ciCurrent);
    const last = ciLastFeed[ciCurrent];
    const h = (ciConfig && ciConfig.housing) || {};
    const showBottle = Number(ciForm.bottleCount) > 1 || Number(h.bottleCount || 1) > 1;
    // 빈 물통 무게가 설정돼 있으면 저울에 올린 값을 그대로 받고 물 양은 앱이 뺀다
    const tare = Number(h.bottleTare) || 0;

    const idx = ciCages.findIndex(c => String(c.id) === ciCurrent);
    const next = ciCages[idx + 1];

    const lastStr = last && last.at && last.at.toDate
        ? last.at.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '이전 기록 없음';

    // 물통 탈착 횟수 기본값 (매일 만지므로 경과일수 기준)
    const hoursSince = (last && last.at && last.at.toDate)
        ? (Date.now() - last.at.toDate().getTime()) / 3600000 : 0;
    const autoHandlings = Math.max(1, Math.round(hoursSince / 24));

    body.innerHTML = `
    ${ciLastSavedBanner()}
    <div class="card" style="padding-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <button class="btn-small" onclick="ciBackToList()" style="background:#eee;">← 목록</button>
            <b style="font-size:1.15rem; color:var(--navy);">${cage.number}번 케이지</b>
            <span style="font-size:0.8rem; color:#666;">${idx + 1} / ${ciCages.length}</span>
        </div>
        <div style="font-size:0.8rem; color:#666; margin-top:6px;">
            ${occ.length}마리 · 지난 급여 ${lastStr}
            ${last ? `· 물 ${last.waterGiven}mL / 사료 ${last.foodGiven}g 채움` : ''}
        </div>
    </div>

    <div class="card">
        <div style="font-size:0.78rem; color:#999; margin-bottom:8px;">1 · 꺼내서 무게 재기</div>

        ${tare > 0 ? `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">물</span>
            <input type="number" inputmode="decimal" id="ci-ws" value="${ciForm.waterScale}"
                   oninput="ciSetScale(this.value)" placeholder="물통째 무게"
                   style="flex:1; height:44px; font-size:1.05rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">g 통째</span>
        </div>
        <div style="font-size:0.8rem; color:#666; margin:0 0 10px 62px;">
            빈 통 ${tare} g 제외 → 물 <b>${ciForm.waterRemaining === '' ? '-' : ciForm.waterRemaining} g</b>
        </div>` : `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">물</span>
            <input type="number" inputmode="decimal" id="ci-wr" value="${ciForm.waterRemaining}"
                   oninput="ciSet('waterRemaining', this.value)" placeholder="잔량"
                   style="flex:1; height:44px; font-size:1.05rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">g 잔량</span>
        </div>`}
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">사료</span>
            <input type="number" inputmode="decimal" id="ci-fr" value="${ciForm.foodRemaining}"
                   oninput="ciSet('foodRemaining', this.value)" placeholder="잔량"
                   style="flex:1; height:44px; font-size:1.05rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">g 잔량</span>
        </div>

        ${(Number(h.lossPerHandling) > 0 && last) ? `
        <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">탈착</span>
            <input type="number" inputmode="numeric" min="1" value="${ciForm.handlings}"
                   oninput="ciSet('handlings', this.value)" placeholder="${autoHandlings} (자동)"
                   style="flex:1; height:38px; font-size:0.95rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">회</span>
        </div>
        <div style="font-size:0.75rem; color:#888; margin:4px 0 0 62px;">
            지난 기록 이후 물통을 뗐다 낀 횟수. 비워두면 경과일수로 ${autoHandlings}회로 잡습니다.
        </div>` : ''}

        <div id="ci-consume" style="margin-top:10px;"></div>
    </div>

    <div class="card">
        <div style="font-size:0.78rem; color:#999; margin-bottom:8px;">2 · 다시 채울 양</div>
        <label style="display:block; margin-bottom:10px; font-size:0.88rem;">
            <input type="checkbox" ${ciForm.noRefill ? 'checked' : ''}
                   onchange="ciToggleNoRefill(this.checked)" style="width:auto;">
            물·사료 안 채우고 그대로 둠 <span style="color:#888; font-size:0.8rem;">(체중만 재는 날)</span>
        </label>
        <div style="display:flex; gap:10px; flex-wrap:wrap; ${ciForm.noRefill ? 'opacity:0.45; pointer-events:none;' : ''}">
            <div style="flex:1; min-width:120px;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">물 (mL)</div>
                <input type="number" inputmode="decimal" value="${ciForm.waterGiven}"
                       oninput="ciSet('waterGiven', this.value)" style="width:100%; height:42px;">
            </div>
            ${showBottle ? `
            <div style="width:100px;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">물통 개수</div>
                <input type="number" value="${ciForm.bottleCount}" oninput="ciSet('bottleCount', this.value)"
                       style="width:100%; height:42px;">
            </div>` : ''}
            <div style="flex:1; min-width:120px;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">사료 (g)</div>
                <input type="number" inputmode="decimal" value="${ciForm.foodGiven}"
                       oninput="ciSet('foodGiven', this.value)" style="width:100%; height:42px;">
            </div>
        </div>
        ${ciForm.noRefill ? `
        <div style="margin-top:8px; padding:8px 10px; background:#f5f5f5; border-radius:6px; font-size:0.8rem; color:#666;">
            잰 물통과 사료를 그대로 다시 넣습니다. 약도 새로 넣지 않습니다.
            다음 섭취량은 오늘 잔량(물 <b>${ciForm.waterRemaining || '-'} g</b> ·
            사료 <b>${ciForm.foodRemaining || '-'} g</b>)을 기준으로 계산됩니다.
        </div>` : ''}
    </div>

    <div class="card">
        <div style="font-size:0.78rem; color:#999; margin-bottom:8px;">3 · 쥐 체중과 상태</div>
        ${occ.map(r => ciRatBlock(r)).join('')}
    </div>

    <div id="ci-dose"></div>

    <div class="card">
        <div style="font-size:0.78rem; color:#666; margin-bottom:5px;">케이지 메모 (선택)</div>
        <input type="text" value="${ciForm.note}" oninput="ciSet('note', this.value)"
               placeholder="예: 물통에서 물 샘" style="width:100%; height:40px;">
        <label style="display:block; margin-top:8px; font-size:0.85rem; color:var(--red);">
            <input type="checkbox" ${ciForm.flags.includes('이상') ? 'checked' : ''}
                   onchange="ciToggleFlag('이상', this.checked)" style="width:auto;">
            누수·엎어짐 등 이상 있었음 (이 구간은 계산에서 제외)
        </label>
    </div>

    <button class="btn btn-green" onclick="ciSave()"
            style="width:100%; height:52px; font-size:1.05rem; margin-bottom:30px;">
        저장하고 ${next ? next.number + '번으로 →' : '목록으로'}
    </button>`;

    ciUpdateCalc();
}

function ciRatBlock(rat) {
    const f = ciForm.rats[rat.ratId];
    const scoreRow = (key, label) => `
        <div style="display:flex; gap:5px; align-items:center; margin-top:4px;">
            <span style="font-size:0.72rem; color:#666; width:28px;">${label}</span>
            ${[1, 2, 3, 4, 5].map(n => `
                <button onclick="ciScore('${rat.ratId}','${key}',${n})"
                        style="width:32px; height:32px; padding:0; font-size:0.8rem; border-radius:6px;
                               border:1px solid ${f[key] === n ? '#1565c0' : '#ccc'};
                               background:${f[key] === n ? '#1565c0' : '#fff'};
                               color:${f[key] === n ? '#fff' : '#555'};">${n}</button>`).join('')}
        </div>`;

    const total = f.act + f.fur + f.eye;
    return `
    <div style="border:1px solid #e0e0e0; border-radius:8px; padding:10px; margin-bottom:8px;
                ${f.dead ? 'background:#ffebee;' : ''}">
        <div style="display:flex; align-items:center; gap:8px;">
            <b style="flex:1; font-size:0.95rem;">${rat.ratId}</b>
            <input type="number" inputmode="decimal" value="${f.weight}"
                   oninput="ciSetRat('${rat.ratId}','weight', this.value)" placeholder="체중"
                   style="width:82px; height:38px; font-size:1rem;">
            <span style="font-size:0.8rem; color:#888;">g</span>
        </div>
        ${scoreRow('act', 'ACT')}
        ${scoreRow('fur', 'FUR')}
        ${scoreRow('eye', 'EYE')}
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <span style="font-size:0.75rem; color:${total ? 'var(--navy)' : '#bbb'};">총점 ${total || '-'}</span>
            <input type="text" value="${f.note}" oninput="ciSetRat('${rat.ratId}','note', this.value)"
                   placeholder="메모" style="flex:1; height:32px; font-size:0.85rem;">
            <label style="font-size:0.78rem; color:var(--red); white-space:nowrap;">
                <input type="checkbox" ${f.dead ? 'checked' : ''}
                       onchange="ciSetRat('${rat.ratId}','dead', this.checked)" style="width:auto;"> 사망
            </label>
        </div>
    </div>`;
}

// ---------- 입력 반영 + 실시간 계산 ----------
function ciSet(key, val) {
    ciForm[key] = val;
    // 그대로 두는 날은 '준 양'이 곧 지금 남은 양이므로 같이 따라가야 한다
    if (ciForm.noRefill) {
        if (key === 'waterRemaining') ciForm.waterGiven = val === '' ? 0 : Number(val);
        if (key === 'foodRemaining')  ciForm.foodGiven  = val === '' ? 0 : Number(val);
    }
    ciUpdateCalc();
}
// 저울에 올린 값(물통째)에서 빈 통 무게를 빼 물 양을 구한다
function ciSetScale(val) {
    ciForm.waterScale = val;
    const tare = Number((ciConfig && ciConfig.housing && ciConfig.housing.bottleTare) || 0);
    const water = (val === '' || isNaN(Number(val))) ? '' : Math.round((Number(val) - tare) * 10) / 10;
    ciForm.waterRemaining = water === '' ? '' : String(water);
    if (ciForm.noRefill) ciForm.waterGiven = water === '' ? 0 : water;
    ciRenderForm();
}

function ciSetRat(ratId, key, val) {
    ciForm.rats[ratId][key] = (key === 'dead') ? val : val;
    if (key === 'dead') ciRenderForm(); else ciUpdateCalc();
}
function ciScore(ratId, key, n) {
    const f = ciForm.rats[ratId];
    f[key] = (f[key] === n) ? 0 : n;
    ciRenderForm();
}
// 물·사료를 안 갈고 그대로 두는 날: 다음 구간의 '준 양'은 지금 남아있는 양이 된다.
// 사료도 물과 같은 날 함께 채우므로 물만 처리하면 다음 구간 섭취량이 부풀려진다.
function ciToggleNoRefill(on) {
    ciForm.noRefill = on;
    const h = (ciConfig && ciConfig.housing) || {};
    const last = ciLastFeed[ciCurrent];
    if (on) {
        ciForm.waterGiven = ciForm.waterRemaining === '' ? 0 : Number(ciForm.waterRemaining);
        ciForm.foodGiven  = ciForm.foodRemaining  === '' ? 0 : Number(ciForm.foodRemaining);
    } else {
        ciForm.waterGiven = last ? (last.waterGiven ?? h.waterFill ?? 600) : (h.waterFill ?? 600);
        ciForm.foodGiven  = last ? (last.foodGiven  ?? h.foodFill  ?? 250) : (h.foodFill  ?? 250);
    }
    ciRenderForm();
}

function ciToggleFlag(flag, on) {
    if (on) { if (!ciForm.flags.includes(flag)) ciForm.flags.push(flag); }
    else ciForm.flags = ciForm.flags.filter(f => f !== flag);
    ciUpdateCalc();
}

// 마신 양 = 지난번 채운 양 − 이번 잔량 − 로스
function ciComputeIntake() {
    const last = ciLastFeed[ciCurrent];
    if (!last) return null;

    const wr = Number(ciForm.waterRemaining);
    const fr = Number(ciForm.foodRemaining);
    if (ciForm.waterRemaining === '' || isNaN(wr)) return null;

    const hours = (Date.now() - last.at.toDate().getTime()) / 3600000;
    // 같은 케이지를 방금 또 저장한 경우(수정 등) 몇 분을 한 구간으로 계산하면
    // 마리당 값이 터무니없이 커진다. 너무 짧은 구간은 계산하지 않는다.
    if (hours < 4) return { tooShort: true, hours };
    const cfgH = (ciConfig && ciConfig.housing) || {};
    const evapPerHour = Number(cfgH.evapPerHour) || 0;
    const lossPerHandling = Number(cfgH.lossPerHandling) || 0;
    const bottles = Number(last.bottleCount) || 1;

    // 물통을 뗐다 낄 때마다 로스가 난다.
    // 물은 월·수·금만 갈지만 체중은 매일 재므로, 기록 사이에 체중만 잰 날이 있으면
    // 그날의 탈착도 세야 한다. 매일 만지는 프로토콜이라 경과일수로 기본값을 잡는다.
    const autoHandlings = Math.max(1, Math.round(hours / 24));
    const handlings = (ciForm.handlings === '' || ciForm.handlings === undefined)
        ? autoHandlings : Math.max(1, Number(ciForm.handlings) || 1);

    const evapLoss = evapPerHour * hours * bottles;
    const handLoss = lossPerHandling * handlings * bottles;
    const loss = evapLoss + handLoss;
    const water = Number(last.waterGiven) - wr - loss;
    const food = (ciForm.foodRemaining === '' || isNaN(fr)) ? null : Number(last.foodGiven) - fr;

    // animal-days: 구간과 각 개체의 재실 기간이 겹친 시간을 모두 더한다.
    // (구간 도중에 죽거나 옮겨가도 그만큼만 세어짐)
    const t0 = last.at.toDate().getTime();
    const t1 = Date.now();
    let animalHours = 0, changed = false;
    ciAllHousing.forEach(h => {
        if (String(h.cageId) !== String(ciCurrent)) return;
        const from = h.from && h.from.toMillis ? h.from.toMillis() : 0;
        const to = h.to && h.to.toMillis ? h.to.toMillis() : t1;
        const ov = Math.min(t1, to) - Math.max(t0, from);
        if (ov > 0) {
            animalHours += ov / 3600000;
            if (from > t0 || to < t1) changed = true;   // 구간 중간에 들어오거나 나감
        }
    });
    const days = hours / 24;
    const animalDays = animalHours / 24;
    const n = ciOccupants(ciCurrent).length;

    return {
        hours, days, loss, evapLoss, handLoss, handlings, autoHandlings,
        water, food, n, animalDays, housingChanged: changed,
        waterPc: animalDays > 0 ? water / animalDays : null,
        foodPc: (food !== null && animalDays > 0) ? food / animalDays : null,
        lossKnown: (evapPerHour > 0 || lossPerHandling > 0)
    };
}

function ciUpdateCalc() {
    const box = document.getElementById('ci-consume');
    if (!box) return;
    const c = ciComputeIntake();

    if (c && c.tooShort) {
        box.innerHTML = `<div style="padding:8px 10px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; font-size:0.82rem; color:#7a5c00;">
            직전 기록이 ${c.hours.toFixed(1)}시간 전이라 섭취량을 계산하지 않습니다.
            오늘 이미 입력한 케이지라면 저장할 때 <b>덮어쓰기</b>됩니다.
        </div>`;
    } else if (!c) {
        box.innerHTML = `<div style="padding:8px 10px; background:#f5f5f5; border-radius:6px; font-size:0.82rem; color:#777;">
            ${ciLastFeed[ciCurrent] ? '잔량을 입력하면 섭취량이 계산됩니다.' : '이 케이지의 첫 기록입니다. 오늘 채운 양만 저장됩니다.'}
        </div>`;
    } else {
        const bad = c.water < 0;
        box.innerHTML = `
        <div style="padding:9px 11px; border-radius:6px; font-size:0.85rem;
                    background:${bad ? '#ffebee' : '#e8f5e9'}; color:${bad ? '#b71c1c' : '#1b5e20'};">
            섭취 · 물 <b>${c.water.toFixed(0)} mL</b>
            ${c.food !== null ? ` / 사료 <b>${c.food.toFixed(0)} g</b>` : ''}
            &nbsp;·&nbsp; 마리당 <b>${c.waterPc ? c.waterPc.toFixed(0) : '-'} mL/day</b>
            <div style="font-size:0.75rem; opacity:0.85; margin-top:3px;">
                ${c.hours.toFixed(1)}시간 · ${c.animalDays.toFixed(2)} 마리·일
                ${c.lossKnown ? `· 로스 ${c.loss.toFixed(1)}g
                    <span style="opacity:0.8;">(증발 ${c.evapLoss.toFixed(1)} + 탈착 ${c.handLoss.toFixed(1)}, ${c.handlings}회)</span>`
                    : '· <b>로스 상수 미설정</b>'}
                ${c.housingChanged ? '<br>구간 중 재실 변동이 있어 이 구간은 예상치 계산에서 제외됩니다.' : ''}
                ${bad ? '<br><b>잔량이 채운 양보다 많습니다. 입력을 확인하세요.</b>' : ''}
            </div>
        </div>`;
    }
    ciUpdateDose();
}

// ---------- 메트포민 지시량 ----------
// 물에 타므로 '마신 양'만큼 들어간다 → 안 마시고 버려지는 몫까지 감안해 진하게 탄다
function ciGetMetforminRule(cageId) {
    if (!ciConfig || !ciConfig.dosing) return null;
    const id = String(cageId === undefined ? ciCurrent : cageId);
    const cage = ciCages.find(c => String(c.id) === id);
    const occ = ciOccupants(id);
    if (!cage || !occ.length) return null;
    const gkey = cage.group || ('G' + String(occ[0].group || 1).replace(/^G/, ''));

    return ciConfig.dosing.find(d =>
        d.medium === 'water' && (d.groups || []).includes(gkey) && Number(d.value) > 0) || null;
}

// 'YYYY-MM-DD' 문자열끼리 비교한다.
// new Date('2026-08-25')는 UTC 자정으로 파싱되어 KST로는 오전 9시가 된다.
// 아침에 도는 라운드가 시작일 당일인데도 '시작 전'으로 나오던 원인.
function ciDateStr(v) {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    if (v.toDate) {
        const d = v.toDate();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    }
    return null;
}
function ciShiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');           // 로컬 자정으로 고정
    d.setDate(d.getDate() + (Number(days) || 0));
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

// 기준 이벤트 + 오프셋으로 개체별 투약 구간을 판정한다.
// 'nodate' 기준 날짜가 비어 있음 | 'before' 시작 전 | 'on' 투약 중 | 'after' 종료됨
function ciDoseWindow(rat, rule) {
    if (!rule) return 'nodate';
    const pick = a => ciDateStr(a === 'ligation' ? rat.surgeryDate
                             : a === 'ovx'      ? rat.ovxDate
                             : a === 'arrival'  ? rat.arrivalDate : null);

    const base = pick(rule.startAnchor);
    if (!base) return 'nodate';

    const today = getTodayStr();
    if (today < ciShiftDate(base, rule.startOffset)) return 'before';

    // endAnchor가 'end'면 실험 종료까지 계속 투약한다
    if (rule.endAnchor && rule.endAnchor !== 'end') {
        const eb = pick(rule.endAnchor);
        if (eb && today > ciShiftDate(eb, rule.endOffset)) return 'after';
    }
    return 'on';
}

// ---------- 투약 상태 (목록·랫드 상세에서 공용) ----------
// 상태를 따로 저장하지 않는다. ligation 날짜 + 코호트 설정 오프셋으로 매번 계산한다.
// 저장해두면 수술일을 고치거나 설정을 바꿨을 때 조용히 어긋난다.

// 오늘이 투약 시작일로부터 며칠째인가. 음수면 아직 시작 전.
function ciDaysFromStart(rat, rule) {
    if (!rule) return null;
    const base = ciDateStr(rule.startAnchor === 'ligation' ? rat.surgeryDate
                         : rule.startAnchor === 'ovx'      ? rat.ovxDate
                         : rule.startAnchor === 'arrival'  ? rat.arrivalDate : null);
    if (!base) return null;
    const start = ciShiftDate(base, rule.startOffset);
    return Math.round((new Date(getTodayStr() + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000);
}

// 케이지 단위 상태. 한 케이지에 여러 상태가 섞이면 급한 쪽을 대표로 삼는다.
function ciCageDoseState(cageId, rats) {
    const occ = rats || ciOccupants(cageId);
    const rule = ciGetMetforminRule(cageId);
    if (!occ.length || !rule) return null;

    const wins = occ.map(r => ciDoseWindow(r, rule));
    const days = occ.map(r => ciDaysFromStart(r, rule)).filter(v => v !== null);
    const partial = !wins.every(w => w === wins[0]);

    // 한 마리라도 투약 중이면 물통을 공유하므로 케이지 전체가 투약된다.
    // 날짜 없는 개체가 섞여 있어도 '오늘 할 일'은 투약이므로 이쪽이 우선이다.
    // (날짜 누락 자체는 위쪽 알림 배너에서 따로 짚는다)
    if (wins.includes('on')) {
        const d = Math.max(...days);
        return { key:'on', today: d === 0, rule, partial,
                 noDateMixed: wins.includes('nodate'),
                 label: d === 0 ? '오늘 투약 시작' : `투약 중 D+${d}`,
                 color:'#0d47a1', bg:'#e3f2fd' };
    }

    if (wins.includes('nodate'))
        return { key:'nodate', label:'날짜 없음', color:'#c62828', bg:'#ffebee', rule, partial };

    if (wins.every(w => w === 'after'))
        return { key:'after', label:'투약 종료', color:'#666', bg:'#f5f5f5', rule, partial:false };

    const d = Math.max(...days);                 // 시작 전이므로 음수, 가장 임박한 개체
    const soon = d >= -3;
    return { key:'before', soon, rule, partial,
             label:`투약 시작 D${d}`, color: soon ? '#e65100' : '#888', bg: soon ? '#fff3e0' : '#fafafa' };
}

function ciUpdateDose() {
    const box = document.getElementById('ci-dose');
    if (!box) return;

    const rule = ciGetMetforminRule();
    const occ = ciOccupants(ciCurrent);
    if (!rule || !occ.length) { box.innerHTML = ''; return; }

    // 물을 안 갈면 약도 새로 넣지 않는다
    if (ciForm.noRefill) {
        ciForm._doseCc = 0;
        box.innerHTML = `<div class="card" style="background:#f5f5f5;">
            <b style="color:#666;">물을 그대로 두므로 ${rule.substance}도 추가하지 않습니다.</b>
        </div>`;
        return;
    }

    const win = new Map(occ.map(r => [r.ratId, ciDoseWindow(r, rule)]));
    const started = occ.filter(r => win.get(r.ratId) === 'on');
    if (!started.length) {
        ciForm._doseCc = 0;
        // 기준 날짜가 비어 있으면 영영 시작되지 않는다. '시작 전'과 구분해서 알린다.
        const noDate = occ.filter(r => win.get(r.ratId) === 'nodate');
        if (noDate.length) {
            box.innerHTML = `<div class="card" style="background:#fff8e1; border:1px solid #ffe082;">
                <b style="color:#7a5c00;">${rule.substance} 투약 시작일을 판정할 수 없습니다</b>
                <div style="font-size:0.8rem; color:#7a5c00; margin-top:4px;">
                    ${noDate.map(r => r.ratId).join(', ')} 의 ${rule.startAnchor} 날짜가 비어 있습니다.<br>
                    날짜를 넣기 전까지 투약이 시작되지 않습니다.
                </div>
            </div>`;
        } else if (occ.every(r => win.get(r.ratId) === 'after')) {
            box.innerHTML = `<div class="card" style="background:#f5f5f5;">
                <b style="color:#666;">${rule.substance} 투약 종료</b>
                <div style="font-size:0.8rem; color:#888; margin-top:4px;">물만 채우세요.</div>
            </div>`;
        } else {
            box.innerHTML = `<div class="card" style="background:#f5f5f5;">
                <b style="color:#666;">${rule.substance} 아직 시작 전</b>
                <div style="font-size:0.8rem; color:#888; margin-top:4px;">물만 채우세요.</div>
            </div>`;
        }
        return;
    }

    // 체중은 오늘 입력한 값 우선, 없으면 계산 불가
    let sumBW = 0, missing = [];
    occ.forEach(r => {
        const w = Number(ciForm.rats[r.ratId].weight);
        if (w > 0) sumBW += w; else missing.push(r.ratId);
    });

    const c = ciComputeIntake();
    const expectedPc = (c && c.waterPc > 0) ? c.waterPc : ciRecentPc[ciCurrent];
    const fill = Number(ciForm.waterGiven) || 0;
    const stock = Number(rule.stockConc) || 0;

    if (missing.length || !expectedPc || !stock || !fill) {
        box.innerHTML = `<div class="card" style="background:#fff8e1; border:1px solid #ffe082;">
            <b style="color:#7a5c00;">${rule.substance} 지시량 계산 대기</b>
            <div style="font-size:0.8rem; color:#7a5c00; margin-top:4px;">
                ${missing.length ? `체중 미입력: ${missing.join(', ')}<br>` : ''}
                ${!expectedPc ? '이전 섭취 기록이 없어 예상 섭취량을 알 수 없습니다.<br>' : ''}
                ${!stock ? '코호트 설정에 원액 농도가 없습니다.<br>' : ''}
            </div>
        </div>`;
        return;
    }

    // 예상 섭취량은 '마리당 × 현재 마리수' → 합치거나 죽어도 자동으로 맞음
    const expectedIntake = expectedPc * occ.length;
    const needMg = Number(rule.value) * (sumBW / 1000) * (fill / expectedIntake);
    const cc = needMg / stock;
    ciForm._doseCc = Number(cc.toFixed(1));
    ciForm._doseMg = Number(needMg.toFixed(1));
    ciForm._stockConc = stock;

    const partial = started.length !== occ.length;
    box.innerHTML = `
    <div class="card" style="background:#e3f2fd; border:1px solid #90caf9;">
        <div style="font-size:0.85rem; color:#0d47a1;">오늘 이 케이지</div>
        <div style="font-size:1.25rem; font-weight:bold; color:#0d47a1; margin:4px 0;">
            물 ${fill} mL + ${rule.substance} 원액 ${cc.toFixed(1)} cc
        </div>
        <div style="font-size:0.75rem; color:#1565c0;">
            총체중 ${sumBW.toFixed(0)}g · 목표 ${rule.value} mg/kg/day · 필요 ${needMg.toFixed(0)}mg
            · 예상섭취 ${expectedIntake.toFixed(0)}mL · 원액 ${stock}mg/mL
        </div>
        ${partial ? `<div style="font-size:0.78rem; color:#b71c1c; margin-top:5px;">
            ⚠️ 같은 케이지인데 투약 구간이 아닌 개체가 있습니다 (투약 중 ${started.length}/${occ.length}).
            ${occ.filter(r => win.get(r.ratId) !== 'on').map(r => `${r.ratId}(${
                { before: '시작 전', after: '종료', nodate: '날짜 없음' }[win.get(r.ratId)]
            })`).join(', ')}<br>
            물통을 공유하므로 전원에게 들어갑니다.</div>` : ''}
    </div>`;
}

// ---------- 저장 ----------
function ciBackToList() { ciCurrent = null; ciRenderList(); }

async function ciSave() {
    if (!ciCurrent) return;
    const occ = ciOccupants(ciCurrent);
    const c = ciComputeIntake();
    const now = firebase.firestore.Timestamp.now();
    const dateStr = getTodayStr();
    const by = (firebase.auth().currentUser && firebase.auth().currentUser.email) || null;

    if (ciForm.waterRemaining === '' && ciForm.foodRemaining === '' &&
        !Object.values(ciForm.rats).some(f => f.weight !== '')) {
        return alert('입력된 값이 없습니다.');
    }

    try {
        const cfgH = (ciConfig && ciConfig.housing) || {};
        // 계산에 쓴 상수를 그 기록에 함께 남긴다 → 나중에 설정을 바꿔도 과거가 변하지 않음
        const feed = {
            cageId: String(ciCurrent), cohort: String(ciCohort),
            at: now, dateStr: dateStr,
            waterRemaining: ciForm.waterRemaining === '' ? null : Number(ciForm.waterRemaining),
            foodRemaining: ciForm.foodRemaining === '' ? null : Number(ciForm.foodRemaining),
            waterGiven: Number(ciForm.waterGiven), foodGiven: Number(ciForm.foodGiven),
            bottleCount: Number(ciForm.bottleCount) || 1,
            noRefill: !!ciForm.noRefill,
            ratCount: occ.length,
            ratIds: occ.map(r => r.ratId),
            evapPerHour: Number(cfgH.evapPerHour) || 0,
            lossPerHandling: Number(cfgH.lossPerHandling) || 0,
            flags: ciForm.flags.concat(
                (c && !c.tooShort && c.housingChanged) ? ['재실변동'] : [],
                Object.values(ciForm.rats).some(f => f.dead) ? ['사망발생'] : []),
            note: ciForm.note || '',
            by: by
        };
        if (c && !c.tooShort) {
            feed.handlings = c.handlings;
            feed.lossTotal = Number(c.loss.toFixed(2));
            feed.intervalHours = Number(c.hours.toFixed(2));
            feed.waterConsumed = Number(c.water.toFixed(1));
            feed.foodConsumed = c.food === null ? null : Number(c.food.toFixed(1));
            feed.animalDays = Number(c.animalDays.toFixed(3));
            feed.waterPerCapita = c.waterPc === null ? null : Number(c.waterPc.toFixed(1));
            feed.foodPerCapita = c.foodPc === null ? null : Number(c.foodPc.toFixed(1));
        }
        if (ciForm._doseCc) {
            feed.doseCc = ciForm._doseCc; feed.doseMg = ciForm._doseMg; feed.stockConc = ciForm._stockConc;
        }
        // 다음 라운드 조제량을 미리 계산하려면 체중이 필요하다.
        // 투약을 아직 안 하는 케이지도 남겨둬야 '이번에 새로 시작하는 케이지'까지 예측된다.
        const bwSum = occ.reduce((a, r) => a + (Number(ciForm.rats[r.ratId].weight) || 0), 0);
        if (bwSum > 0) feed.sumBW = Number(bwSum.toFixed(0));

        // 오늘 이미 입력한 케이지면 새로 만들지 않고 덮어쓴다.
        // (두 줄이 생기면 다음 구간이 '몇 분짜리'로 잡혀 섭취량 계산이 망가짐)
        const todaySnap = await db.collection('cageFeeding').where('dateStr', '==', dateStr).get();
        let existing = null;
        todaySnap.forEach(d => { if (String(d.data().cageId) === String(ciCurrent)) existing = d; });

        if (existing) {
            if (!confirm(`${ciCages.find(x => String(x.id) === ciCurrent).number}번은 오늘 이미 입력했습니다.\n덮어쓸까요?`)) return;
            await existing.ref.set(feed, { merge: true });
        } else {
            await db.collection('cageFeeding').add(feed);
        }

        // 체중 → measurements, 상태 → dailyLogs (기존 구조 그대로)
        // 같은 날 다시 입력하면 줄이 쌓이지 않도록, 이 화면이 만든 오늘 기록은 덮어쓴다.
        // (source로 구분하므로 '상태 & 체중 기록' 화면에서 따로 넣은 값은 건드리지 않는다)
        const todayMeas = await db.collection('measurements').where('date', '==', dateStr).get();
        const todayLogs = await db.collection('dailyLogs').where('date', '==', dateStr).get();
        const findMine = (snap, ratId) => {
            let hit = null;
            snap.forEach(d => { const v = d.data(); if (v.ratId === ratId && v.source === 'cageInput') hit = d; });
            return hit;
        };

        for (const r of occ) {
            const f = ciForm.rats[r.ratId];
            if (f.weight !== '' && Number(f.weight) > 0) {
                const payload = {
                    ratId: r.ratId, weight: Number(f.weight), date: dateStr,
                    timepoint: 'Manual', source: 'cageInput', cageId: String(ciCurrent),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                const prev = findMine(todayMeas, r.ratId);
                if (prev) await prev.ref.set(payload, { merge: true });
                else await db.collection('measurements').add(payload);
            }
            const total = f.act + f.fur + f.eye;
            if (total > 0 || f.note || f.dead) {
                const payload = {
                    ratId: r.ratId, date: dateStr, timestamp: new Date().toLocaleTimeString(),
                    scores: { activity: f.act, fur: f.fur, eye: f.eye },
                    totalScore: total, note: f.note || '',
                    source: 'cageInput', cageId: String(ciCurrent),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const prev = findMine(todayLogs, r.ratId);
                if (prev) await prev.ref.set(payload, { merge: true });
                else await db.collection('dailyLogs').add(payload);
            }
            if (f.dead) await ciMarkDead(r, dateStr, now);
            else if (total > 0) {
                const snap = await db.collection('rats').where('ratId', '==', r.ratId).get();
                if (!snap.empty) await snap.docs[0].ref.update({ lastScore: total });
            }
        }

        clearRatsCache();
        ciLastFeed[ciCurrent] = feed;
        ciDoneToday.add(String(ciCurrent));

        // 방금 계산한 지시량을 다음 케이지로 넘어가도 볼 수 있게 남긴다
        const savedCage = ciCages.find(x => String(x.id) === ciCurrent);
        ciLastSaved = {
            number: savedCage ? savedCage.number : ciCurrent,
            water: feed.waterGiven, food: feed.foodGiven,
            cc: feed.doseCc || 0, stock: feed.stockConc || null
        };

        const idx = ciCages.findIndex(x => String(x.id) === ciCurrent);
        const next = ciCages[idx + 1];

        // 사망 처리가 있었으면 재실 목록을 새로 읽는다
        if (Object.values(ciForm.rats).some(f => f.dead)) {
            const houseSnap = await db.collection('ratHousing').where('to', '==', null).get();
            ciHousing = [];
            houseSnap.forEach(d => { const v = d.data(); if (ciRats.some(r => r.ratId === v.ratId)) ciHousing.push(v); });
            const rats = await getRatsWithCache(true);
            ciRats = rats.filter(r => String(r.cohort) === String(ciCohort));
        }

        if (next) ciOpen(next.id); else ciBackToList();
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    }
}

// 사망 처리는 한 곳으로: 상태 기록 + 재실 종료가 항상 같이 일어나야
// 죽은 개체가 animal_days에 계속 잡히지 않는다.
async function ciMarkDead(rat, dateStr, now) {
    const snap = await db.collection('rats').where('ratId', '==', rat.ratId).get();
    if (!snap.empty) await snap.docs[0].ref.update({ status: '사망', deathDate: dateStr, deathFoundAt: now });

    const hs = await db.collection('ratHousing')
        .where('ratId', '==', rat.ratId).where('to', '==', null).get();
    const batch = db.batch();
    hs.forEach(d => batch.update(d.ref, { to: now, endReason: '사망' }));
    await batch.commit();
}

// ---------- 조제 지시 요약 ----------
async function ciShowPrepSheet() {
    const todayStr = getTodayStr();
    // 오늘치를 한 번에 받아 케이지별로 나눈다 (복합 인덱스 불필요)
    const snap = await db.collection('cageFeeding').where('dateStr', '==', todayStr).get();
    const todayByCage = {};
    snap.forEach(d => { const v = d.data(); todayByCage[String(v.cageId)] = v; });

    const rows = [];
    ciCages.forEach(cage => {
        const v = todayByCage[String(cage.id)];
        if (!v) return;
        rows.push({ n: cage.number, water: v.waterGiven, food: v.foodGiven, cc: v.doseCc || 0, stock: v.stockConc });
    });
    rows.sort((a, b) => a.n - b.n);

    const dosed = rows.filter(r => r.cc > 0);
    const plain = rows.filter(r => !r.cc);
    const stock = dosed.length ? dosed[0].stock : null;

    const body = document.getElementById('ci-body');
    body.innerHTML = `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; color:var(--navy);">🧪 오늘 조제 지시</h4>
            <button class="btn-small" onclick="ciRenderList()" style="background:#eee;">← 목록</button>
        </div>
        <div style="font-size:0.82rem; color:#666; margin:6px 0 12px;">
            ${todayStr}${stock ? ` · 원액 ${stock} mg/mL` : ''}
        </div>
        ${dosed.map(r => `
            <div style="display:flex; justify-content:space-between; padding:9px 4px; border-bottom:1px solid #eee;">
                <b>${r.n}번</b>
                <span>물 ${r.water} mL &nbsp;+&nbsp; <b style="color:#0d47a1;">원액 ${r.cc.toFixed(1)} cc</b></span>
            </div>`).join('')}
        ${plain.length ? `
        <div style="margin-top:12px; padding-top:10px; border-top:2px solid #eee;">
            ${plain.map(r => `
            <div style="display:flex; justify-content:space-between; padding:7px 4px; color:#666;">
                <b>${r.n}번</b><span>물 ${r.water} mL <span style="font-size:0.8rem;">(원액 없음)</span></span>
            </div>`).join('')}
        </div>` : ''}
        <div style="margin-top:14px; padding:9px 11px; background:#f5f5f5; border-radius:6px; font-size:0.85rem;">
            사료: 전 케이지 ${rows.length ? rows[0].food : '-'} g으로 리셋
        </div>
        ${ciStockSummary(dosed, stock)}
    </div>`;
}

// 원액은 사육실에 가기 전에 만들어야 하는데, 정확한 필요량은 그날 체중을 재봐야 안다.
// 그래서 오늘 쓴 양을 보여주고 그걸 기준으로 다음 교체일에 만들 양을 제안한다.
// 조제는 '물 N mL에 녹이기'가 아니라 '눈금 N mL까지 채우기'다.
// 가루가 부피를 차지하므로 전자는 농도가 몇 % 묽어진다.
function ciStockSummary(dosed, stock) {
    if (!dosed.length || !stock) return '';
    const usedCc = dosed.reduce((a, r) => a + r.cc, 0);
    const usedG = usedCc * stock / 1000;
    const suggestCc = Math.ceil((usedCc * 1.3) / 10) * 10;   // 30% 여유 후 10cc 단위로 올림
    const suggestG = suggestCc * stock / 1000;

    return `
    <div style="margin-top:10px; padding:11px 13px; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:6px;">
        <div style="font-size:0.85rem; color:#1b5e20;">
            오늘 쓴 원액 <b>${usedCc.toFixed(1)} cc</b> (가루 ${usedG.toFixed(2)} g)
        </div>
        <div style="font-size:0.85rem; color:#1b5e20; margin-top:6px;">
            다음 교체일 조제 &nbsp;·&nbsp; 가루 <b>${suggestG.toFixed(1)} g</b>
            &nbsp;+&nbsp; 증류수로 <b>총 ${suggestCc} mL 눈금까지</b>
            <span style="font-size:0.75rem; opacity:0.8;">(오늘보다 30% 여유)</span>
        </div>
        <div style="font-size:0.75rem; color:#2e7d32; margin-top:5px; opacity:0.9;">
            물 ${suggestCc} mL에 녹이는 게 아니라, 가루를 넣고 눈금 ${suggestCc} mL까지 채웁니다.
        </div>
    </div>`;
}
