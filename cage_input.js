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
let ciLastFeed = {};     // cageId -> 직전 방문 기록 (오늘 것일 수도 있음)
let ciPrevFeed = {};     // cageId -> 오늘 이전의 마지막 기록 (오늘 재입력 시 비교 기준)
let ciRecentPc = {};     // cageId -> 최근 마리당 섭취량(mL/day). 주말 낀 구간은 뺀 값
let ciRecentPcAny = {};  // 위와 같되 주말 구간도 포함. 평일 기록이 아예 없을 때만 쓴다
let ciCageRows = {};     // cageId -> 최근 기록(신→구). 직접 입력할 때 근거를 보여주려고 남긴다
let ciWeighDates = {};   // cageId -> Set('YYYY-MM-DD'). 체중을 잰 날 = 그날 케이지를 열었다는 뜻
let ciTodayMeas = {};    // ratId -> 오늘 저장된 체중 (다시 열었을 때 되살리기 위함)
let ciTodayLogs = {};    // ratId -> 오늘 저장된 상태 점수·메모
let ciSaving = false;    // 저장 중. 후임이 여러 번 눌러 다음 케이지까지 저장되던 것을 막는다
let ciCurrent = null;    // 지금 입력 중인 케이지 id
let ciDoneToday = new Set();
let ciForm = {};         // 입력 중인 값
let ciLastSaved = null;  // 방금 저장한 케이지의 조제 지시 (다음 케이지로 넘어가도 계속 보이게)
let ciDate = null;       // 작업일. 기본은 오늘이고, 어제 것을 오늘 넣을 때 바꾼다
let ciViewToken = 0;     // 화면을 다시 연 횟수. 전역 상태를 공유하므로 옛 화면의 저장을 막는다

// 작업일 기준 시각(ms). 오늘이면 지금, 과거 날짜면 '그날의 지금 시각'.
// 구간 길이와 기록 순서가 여기서 나온다.
function ciWorkMs() {
    const d = ciDate || getTodayStr();
    if (d === getTodayStr()) return Date.now();
    const midnightToday = parseDateLocal(getTodayStr()).getTime();
    return parseDateLocal(d).getTime() + (Date.now() - midnightToday);
}
function ciIsBackdated() { return (ciDate || getTodayStr()) !== getTodayStr(); }

// ---------- 진입점 ----------
async function renderCageInputView(main) {
    // 이 화면은 전역 상태(ciCurrent·ciForm)를 쓰므로 두 탭에서 동시에 열면 서로 덮어쓴다.
    // 새로 열 때마다 토큰을 올려 옛 화면에서의 저장을 막는다.
    const myToken = ++ciViewToken;
    ciDate = getTodayStr();

    main.innerHTML = `
    <div class="card">
        <h3>📝 케이지별 입력</h3>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-weight:bold; color:var(--navy);">코호트</label>
            <select id="ci-cohort-sel" style="width:auto; min-width:130px; padding:8px; border-radius:6px; border:1px solid #ccc;">
                <option>로딩 중...</option>
            </select>
            <label style="font-weight:bold; color:var(--navy); margin-left:6px;">작업일</label>
            <input type="date" id="ci-date-sel" value="${ciDate}" max="${getTodayStr()}"
                   onchange="ciSetDate(this.value)"
                   style="width:auto; padding:7px; border-radius:6px; border:1px solid #ccc;">
            <button class="btn-small btn-blue" onclick="ciLoad(${myToken})">시작</button>
        </div>
        <div id="ci-date-note" style="font-size:0.8rem; color:#666; margin-top:7px;">
            오늘 기록하면 그대로 두세요. 어제 것을 지금 넣어야 하면 날짜를 바꾸면 됩니다.
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

// 작업일 변경. 이미 목록을 불러왔으면 그 날짜 기준으로 다시 읽는다.
function ciSetDate(val) {
    ciDate = val || getTodayStr();
    const note = document.getElementById('ci-date-note');
    if (note) {
        note.innerHTML = ciIsBackdated()
            ? `<b style="color:#e65100;">${ciDate} 자로 기록합니다.</b> 시각은 그날의 지금 시각(${
                new Date().toTimeString().slice(0,5)})으로 들어갑니다.`
            : '오늘 기록하면 그대로 두세요. 어제 것을 지금 넣어야 하면 날짜를 바꾸면 됩니다.';
    }
    if (ciCohort) ciLoad(ciViewToken);
}

async function ciLoad(token) {
    if (token !== undefined && token !== ciViewToken) return;   // 옛 탭에서 온 호출
    const sel = document.getElementById('ci-cohort-sel');
    if (!sel || !sel.value) return alert('코호트를 먼저 선택하세요.');
    ciCohort = sel.value;
    if (!ciDate) ciDate = getTodayStr();
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
// 금요일에 채운 물이 월요일까지 가는 구간은 마리당 섭취량이 평일 구간과 다르다.
// 그 값으로 다음 회차 농도를 정하면 어긋나므로 예상 섭취량 계산에서 뺀다.
// 기록 자체는 그대로 남는다 (계획서 9항).
// 주말 판정은 대시보드와 같은 값을 써야 하므로 global.js 로 옮겼다
const ciSpansWeekend = spansWeekend;

// 랫드는 야행성이라 밤에 몰아 마신다. 구간이 24시간의 배수에서 벗어나면
// 밤낮 비중이 치우쳐 '시간당 × 24' 로 낸 하루치가 부풀거나 줄어든다.
// 라운드를 매일 오후 2시쯤 도는 것을 전제로, 몇 시간까지는 그대로 쓴다.
function ciOffFrom24(hours) {
    if (!(hours > 0)) return 0;
    return Math.abs(hours - Math.max(1, Math.round(hours / 24)) * 24);
}
const CI_SPAN_TOL_H = 3;   // 24시간 배수에서 이만큼까지는 이번 구간을 그대로 쓴다
// 채우는 물이 예상 섭취의 이 일수를 넘으면 계산을 멈추고 손으로 받는다.
// 정상은 2.7~4.7일치다 (물 500~700, 고염식 마리당 74~91).
// 5로 잡으면 물 700 을 채울 때 마리당 70 미만이 전부 막혀 정상 케이지도 걸린다.
// 7이면 50 미만에서만 걸리는데, 그 정도로 안 마시는 케이지는 사람이 봐야 하는 게 맞다.
const CI_DAYS_CAP = 7;

const ciRowSpansWeekend = rowSpansWeekend;

async function ciLoadHistory() {
    ciLastFeed = {}; ciPrevFeed = {}; ciRecentPc = {}; ciRecentPcAny = {}; ciWeighDates = {}; ciCageRows = {};
    ciTodayMeas = {}; ciTodayLogs = {};
    const todayStr = ciDate || getTodayStr();

    // 케이지별로 따로 조회하면 복합 인덱스가 필요하고 읽기 횟수도 많아진다.
    // 최근 며칠치를 한 번에 받아 화면에서 케이지별로 나눈다 (단일 필드 조회라 인덱스 불필요).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);   // 대시보드와 같은 범위
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 체중을 잰 날은 그날 케이지를 열었다는 뜻이고, 케이지를 열려면 물통을 뗀다.
    // 물 안 가는 날 체중은 「상태 & 체중 기록」으로 들어가 cageFeeding 행이 안 생기므로,
    // 탈착 횟수는 여기서 따로 세야 한다. (주말은 잰 기록이 없어 자동으로 0이 된다)
    const measSnap = await db.collection('measurements').where('date', '>=', cutoffStr).get();
    const weighByRat = {};
    measSnap.forEach(d => {
        const v = d.data();
        if (!v.weight || !v.date) return;
        const day = String(v.date).slice(0, 10);
        (weighByRat[v.ratId] = weighByRat[v.ratId] || new Set()).add(day);
        // 오늘 저장한 값은 케이지를 다시 열었을 때 그대로 되살린다
        if (day === todayStr) ciTodayMeas[v.ratId] = v.weight;
    });

    // 상태 점수도 같이 되살려야 '내가 넣은 게 맞나' 확인이 된다
    const logSnap = await db.collection('dailyLogs').where('date', '==', todayStr).get();
    logSnap.forEach(d => {
        const v = d.data();
        ciTodayLogs[v.ratId] = { scores: v.scores || {}, note: v.note || '' };
    });

    const snap = await db.collection('cageFeeding').where('dateStr', '>=', cutoffStr).get();
    const byCage = {};
    snap.forEach(d => {
        const v = Object.assign({ id: d.id }, d.data());
        (byCage[String(v.cageId)] = byCage[String(v.cageId)] || []).push(v);
    });

    ciCages.forEach(cage => {
        // 이 케이지 개체들이 체중을 잰 날을 모아둔다 (개체가 여럿이면 합집합)
        const days = new Set();
        ciOccupants(cage.id).forEach(r => {
            (weighByRat[r.ratId] || new Set()).forEach(d => days.add(d));
        });
        ciWeighDates[cage.id] = days;

        const rows = byCage[String(cage.id)];
        if (!rows || !rows.length) return;
        rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));

        ciCageRows[cage.id] = rows;
        ciLastFeed[cage.id] = rows[0];
        // 오늘 기록을 다시 여는 경우, 섭취량은 '오늘 이전 마지막 기록'과 비교해야 한다.
        // 오늘 자신과 비교하면 몇 분짜리 구간이 되어 계산이 통째로 빠지고,
        // 덮어쓰기 시 낡은 파생값이 남는다.
        const prevRow = rows.find(r => r.dateStr !== todayStr);
        if (prevRow) ciPrevFeed[cage.id] = prevRow;
        if (rows[0].dateStr === todayStr) ciDoneToday.add(String(cage.id));

        // 예상 섭취량은 '마리당'으로 기억 → 합치거나 죽어도 어긋나지 않음.
        // 대시보드와 같은 값을 써야 '오늘 만들 원액'이 두 곳에서 갈리지 않는다.
        const weekday = recentWaterPc(rows);
        const any = recentWaterPc(rows, { includeWeekend: true });
        if (weekday !== null) ciRecentPc[cage.id] = weekday;
        if (any !== null) ciRecentPcAny[cage.id] = any;
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
    const rows = [];
    let stock = null;

    ciCages.forEach(cage => {
        if (ciDoneToday.has(String(cage.id))) return;      // 이미 넣은 케이지는 뺀다
        const st = ciCageDoseState(cage.id);
        if (!st || st.key !== 'on') return;

        stock = Number(st.rule.stockConc) || stock;
        const n = ciOccupants(cage.id).length;
        const bw = (ciLastFeed[cage.id] || {}).sumBW;
        const pc = ciRecentPc[cage.id] || ciRecentPcAny[cage.id];   // 지시량과 같은 기준으로

        // 필요 약물량은 채우는 물의 양에 정비례한다 (mg = k × 물양).
        // 그래서 물양을 정하지 않고 계수 k 만 모아뒀다가, 카드에서 500·700 각각으로 곱한다.
        // 예측 섭취량이 비정상적으로 낮은 케이지는 계수가 폭주하므로 평균으로 메운다.
        const opts = fillOptions(ciConfig && ciConfig.housing);
        const maxFill = Math.max(...(opts.length ? opts : [700]));
        const ok = bw && pc && n && pcUsableForPrep(pc, n, maxFill);
        rows.push({
            number: cage.number,
            k: ok ? Number(st.rule.value) * (bw / 1000) / (pc * n) : null
        });
    });
    return { rows, stock };
}

function ciPrepPreviewCard() {
    const { rows, stock } = ciPrepPlan();
    if (!rows.length || !stock) return '';
    const known = rows.filter(r => r.k !== null);
    const unknown = rows.filter(r => r.k === null);
    if (!known.length) return '';

    // 모르는 케이지는 아는 케이지의 평균으로 메운다
    const avgK = known.reduce((a, r) => a + r.k, 0) / known.length;
    const totalK = known.reduce((a, r) => a + r.k, 0) + unknown.length * avgK;

    // 물통 안 총 부피 = 물 + 원액. 원액 부피까지 감안해 푼 식이 아래.
    const need = fill => {
        const mg = (totalK < stock) ? (totalK * fill) / (1 - totalK / stock) : totalK * fill;
        return { cc: mg / stock, make: makeVolume(mg / stock) };
    };
    const opts = fillOptions(ciConfig && ciConfig.housing);
    const list = opts.length ? opts : [700];

    return `
    <div class="card" style="background:#0d47a1; color:#fff; padding:14px 16px;">
        <div style="font-size:0.78rem; opacity:0.85;">사육실 가기 전 · 오늘 만들 원액</div>
        ${list.map(f => {
            const n = need(f);
            return `<div style="display:flex; align-items:baseline; gap:10px; margin:7px 0;">
                <span style="font-size:0.9rem; opacity:0.85; min-width:96px;">물 ${f} mL 채우면</span>
                <b style="font-size:1.25rem;">가루 ${(n.make * stock / 1000).toFixed(1)} g</b>
                <span style="font-size:0.85rem; opacity:0.9;">· 총 ${n.make} mL 눈금까지</span>
            </div>`;
        }).join('')}
        <div style="font-size:0.78rem; opacity:0.9; margin-top:6px;">
            투약 케이지 ${rows.length}개 · 원액 ${stock} mg/mL · 30% 여유 포함
            ${unknown.length ? ` · ${unknown.length}개(${unknown.map(u => u.number + '번').join(', ')})는 기록이 없거나 최근 섭취가 비정상이라 평균으로 추정` : ''}
        </div>
        <div style="font-size:0.73rem; opacity:0.75; margin-top:5px;">
            오늘 물을 얼마나 채울지에 따라 골라서 만드세요. 주말·연휴 앞이면 많이 채웁니다.
            물에 녹이는 게 아니라 가루를 넣고 눈금까지 채웁니다.
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

// 번호 오름차순으로 돌려준다. 재실 기록이 읽힌 순서(배정한 순서)를 그대로 쓰면
// 화면에서 개체가 뒤죽박죽 나와 체중을 잘못된 칸에 넣기 쉽다.
// 정렬 키는 ratId 문자열이 아니라 num(숫자)이다 — 군이 다르면 문자열 순서가 어긋난다.
function ciOccupants(cageId) {
    return ciHousing.filter(h => String(h.cageId) === String(cageId))
        .map(h => ciRats.find(r => r.ratId === h.ratId))
        .filter(r => r && r.status !== '사망')
        .sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0)
                     || String(a.ratId).localeCompare(String(b.ratId)));
}

// 섭취량 계산의 비교 기준 기록.
// 최신 기록이 오늘 것이면(재입력) 오늘 이전 기록을 쓴다 — 오늘 방문을 '교체'하는 의미.
function ciBaseline(cageId) {
    const last = ciLastFeed[cageId];
    if (last && last.dateStr === (ciDate || getTodayStr())) return ciPrevFeed[cageId] || null;
    return last || null;
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
        // 사료는 매번 설정값으로 리셋한다. 직전 기록을 물려받으면 251.1 같은 실측값이
        // 다음 회차 기본값으로 흘러가 케이지마다 제각각이 된다.
        foodGiven: h.foodFill ?? 250,
        bottleCount: last ? (last.bottleCount ?? h.bottleCount ?? 1) : (h.bottleCount ?? 1),
        note: '', flags: [], noWater: false, noFood: false, waterScale: '',
        fillScale: '',              // 물 채운 통 무게(원액 넣기 전). 여기서 부피를 구한다
        handlings: '',              // 비우면 체중 잰 날 기준으로 자동
        manualPc: '',               // 쓸 만한 섭취 기록이 없을 때 손으로 넣는 예상 섭취량
        bottleSwap: false, newTare: '',   // 오늘 물통을 갈았는가 + 새 통 무게
        rats: {}
    };
    ciOccupants(cageId).forEach(r => ciEnsureRatForm(r.ratId));

    // 오늘 이미 저장한 케이지면 그때 넣은 값을 그대로 되살린다.
    // '입력 완료'만 뜨고 값을 다시 볼 수 없어, 물·사료처럼 개체 상세로도 확인이
    // 안 되는 항목은 제대로 들어갔는지 확인할 길이 아예 없었다.
    if (last && last.dateStr === (ciDate || getTodayStr())) ciRestoreToday(last);

    ciRenderForm();
}

// 오늘 저장된 기록 → 입력 폼. 저장할 때 쓴 값만 되살리고, 저장 시점에 자동으로
// 붙는 값(재실변동·사망발생 플래그, 파생 계산값)은 되살리지 않는다 — 다시 저장하면 또 붙는다.
function ciRestoreToday(row) {
    const num = v => (v === null || v === undefined) ? '' : String(v);

    ciForm.waterScale     = num(row.waterScale);
    ciForm.waterRemaining = num(row.waterRemaining);
    ciForm.foodRemaining  = num(row.foodRemaining);
    ciForm.fillScale      = num(row.fillScale);
    // waterGiven 은 원액까지 더한 값이라, 물만 담은 fillWater 를 쓴다
    ciForm.waterGiven     = Number(row.fillWater ?? row.waterGiven) || 0;
    ciForm.foodGiven      = Number(row.foodGiven) || ciForm.foodGiven;
    ciForm.bottleCount    = Number(row.bottleCount) || 1;
    // 옛 기록은 noRefill 하나로 물·사료를 묶어 저장했다
    ciForm.noWater        = row.noWater !== undefined ? !!row.noWater : !!row.noRefill;
    ciForm.noFood         = row.noFood  !== undefined ? !!row.noFood  : !!row.noRefill;
    ciForm.note           = row.note || '';
    ciForm.handlings      = row.handlings ? String(row.handlings) : '';
    ciForm.manualPc       = row.manualPerCapita ? String(row.manualPerCapita) : '';
    ciForm.flags          = (row.flags || []).filter(f => ['이상', '처치일', '수술일'].includes(f));

    if (row.bottleSwapped && Number(row.newBottleTare) > 0) {
        ciForm.bottleSwap = true;
        ciForm.newTare = String(row.newBottleTare);
    }
    // 통을 간 날은 자리에 등록된 무게가 이미 새 통으로 바뀌어 있다.
    // 잔량은 그날 쓴 옛 통 무게로 계산해야 하므로 그 값을 그대로 물려준다.
    if (Number(row.bottleTare) > 0) ciForm._tareOverride = Number(row.bottleTare);

    ciOccupants(ciCurrent).forEach(r => {
        const f = ciEnsureRatForm(r.ratId);
        if (ciTodayMeas[r.ratId] !== undefined) f.weight = String(ciTodayMeas[r.ratId]);
        const lg = ciTodayLogs[r.ratId];
        if (lg) {
            f.act = Number(lg.scores.activity) || 0;
            f.fur = Number(lg.scores.fur) || 0;
            f.eye = Number(lg.scores.eye) || 0;
            f.note = lg.note || '';
        }
    });
    ciForm._restored = true;
}

function ciRenderForm() {
    const body = document.getElementById('ci-body');
    const cage = ciCages.find(c => String(c.id) === ciCurrent);
    if (!cage) { ciCurrent = null; ciRenderList(); return; }
    const occ = ciOccupants(ciCurrent);
    occ.forEach(r => ciEnsureRatForm(r.ratId));   // 폼과 재실 목록을 항상 맞춰둔다
    const last = ciBaseline(ciCurrent);           // 오늘 재입력이면 어제 기록이 기준
    const redo = ciDoneToday.has(String(ciCurrent));
    const h = (ciConfig && ciConfig.housing) || {};
    const showBottle = Number(ciForm.bottleCount) > 1 || Number(h.bottleCount || 1) > 1;
    // 빈 물통 무게가 설정돼 있으면 저울에 올린 값을 그대로 받고 물 양은 앱이 뺀다
    const tare = ciTareOf(ciCurrent);
    const tareIsOwn = Number(cage.bottleTare) > 0;   // 이 자리 실측값인지, 코호트 기본값인지

    const idx = ciCages.findIndex(c => String(c.id) === ciCurrent);
    const next = ciCages[idx + 1];

    const lastStr = last && last.at && last.at.toDate
        ? last.at.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '이전 기록 없음';

    // 물통 탈착 횟수 기본값 (체중을 잰 날 기준)
    const autoHandlings = last ? ciCountHandlings(ciCurrent, last.dateStr) : 1;
    // 지난 기록 이후 있었던 일. 둘의 성격이 다르다.
    //  · 수술일 : 물통을 우리가 다뤘으므로 측정과 로스 상수가 그대로 유효하다.
    //             마취 때문에 덜 마셨을 뿐이라, 기록은 남기고 약물 산정에서만 뺀다.
    //  · MR·BP  : 물통을 남이 다뤄 로스 상수가 성립하지 않는다. 잔량을 재도 쓸 수 없다.
    const proc = ciForm.flags.includes('처치일');
    // 이 케이지의 첫 기록이면 뺄 잔량이 없다. 잰 값을 넣을 칸이 보이면
    // 채운 통 무게를 거기에 적게 되므로(실제로 그런 일이 있었다) 아예 감춘다.
    const first = !last;
    const surg = ciForm.flags.includes('수술일');
    // 통을 간 날은 잔량(옛 통)과 채움(새 통)의 빈 통 무게가 다르다
    const swapped = !!(ciForm.bottleSwap && Number(ciForm.newTare) > 0);
    const fillTare = ciFillTareOf();

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
        ${redo ? `<div style="margin-top:6px; padding:6px 9px; background:#fff8e1; border-radius:5px; font-size:0.78rem; color:#7a5c00;">
            <b>오늘 저장한 값을 그대로 불러왔습니다.</b> 확인하거나 고칠 수 있습니다.
            다시 저장하면 오늘 기록을 <b>교체</b>하며, 섭취량·투약량은
            ${ciPrevFeed[ciCurrent] ? ciPrevFeed[ciCurrent].dateStr + ' 기록' : '직전 기록'}과 비교해 다시 계산됩니다.
        </div>` : ''}
    </div>

    <div class="card">
        <div style="font-size:0.78rem; color:#999; margin-bottom:8px;">1 · 꺼내서 무게 재기</div>

        <div style="margin-bottom:10px; padding:9px 11px; border-radius:6px;
                    background:${(proc || surg) ? '#fff3e0' : '#fafafa'};
                    border:1px solid ${(proc || surg) ? '#ffb74d' : '#e0e0e0'};">
            <div style="font-size:0.78rem; color:#888; margin-bottom:6px;">
                ${last ? `${lastStr} 이후` : '지난 기록 이후'}에 있었던 일
            </div>
            <label style="display:block; font-size:0.88rem; cursor:pointer;">
                <input type="checkbox" ${surg ? 'checked' : ''}
                       onchange="ciToggleSurgery(this.checked)" style="width:auto;">
                <b>수술 (OVX · Ligation)</b>
                <div style="font-size:0.77rem; color:#666; margin:3px 0 0 22px;">
                    물통을 우리가 다뤘으므로 <b>잔량은 평소대로 재서 기록</b>합니다.
                    마취로 덜 마신 값이라 <b>약물 지시량 계산에서만</b> 빠집니다.
                </div>
            </label>
            <label style="display:block; font-size:0.88rem; cursor:pointer; margin-top:7px;
                          padding-top:7px; border-top:1px dashed #e0d0b0;">
                <input type="checkbox" ${proc ? 'checked' : ''}
                       onchange="ciToggleProcedure(this.checked)" style="width:auto;">
                <b>MR · BP</b>
                <div style="font-size:0.77rem; color:#666; margin:3px 0 0 22px;">
                    물통을 우리 방식대로 다루지 않아 로스를 알 수 없습니다.
                    <b>잔량은 재지 않고</b> 채울 양만 넣으면 됩니다.
                </div>
            </label>
        </div>

        ${first ? `
        <div style="padding:9px 11px; background:#e8f5e9; border-radius:6px; font-size:0.82rem; color:#2e7d32;">
            이 케이지의 <b>첫 기록</b>입니다. 뺄 지난 채움이 없어 잔량은 재지 않습니다.
            아래 <b>2단계에서 채울 양</b>과 <b>3단계 체중</b>만 넣으세요.
            <br>새 통에 물을 채워 저울에 올린 값은 <b>2단계</b>에 넣습니다.
        </div>` : proc ? `
        <div style="padding:9px 11px; background:#f5f5f5; border-radius:6px; font-size:0.82rem; color:#666;">
            이 구간은 계산에서 제외되므로 잔량을 재지 않습니다. 아래 <b>2단계에서 채울 양</b>과
            <b>3단계 체중</b>만 입력하세요. 체중은 투약량 계산에 필요하니 빠짐없이 넣습니다.
        </div>` : `
        ${tare > 0 ? `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">물</span>
            <input type="number" inputmode="decimal" id="ci-ws" value="${ciForm.waterScale}"
                   oninput="ciSetScale(this.value)" placeholder="물통째 무게"
                   style="flex:1; height:44px; font-size:1.05rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">g 통째</span>
        </div>
        <div style="font-size:0.8rem; color:${tareIsOwn ? '#666' : '#c62828'}; margin:0 0 10px 62px;">
            빈 통 ${tare} g 제외 → 물 <b id="ci-ws-out">${ciForm.waterRemaining === '' ? '-' : ciForm.waterRemaining} g</b>
            ${tareIsOwn ? '' : '<br>이 자리의 물통 무게가 등록되지 않아 <b>코호트 기본값</b>을 씁니다. 케이지 현황에서 실측값을 넣어주세요.'}
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

        ${tare > 0 ? `
        <div style="margin-top:2px; padding-top:8px; border-top:1px dashed #eee;">
            <label style="display:block; font-size:0.85rem;">
                <input type="checkbox" ${ciForm.bottleSwap ? 'checked' : ''}
                       onchange="ciToggleBottleSwap(this.checked)" style="width:auto;">
                오늘 물통을 새것으로 갈았음
            </label>
            ${ciForm.bottleSwap ? `
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
                <span style="width:52px; font-size:0.85rem; color:#555;">새 통</span>
                <input type="number" step="any" inputmode="decimal" value="${ciForm.newTare}"
                       oninput="ciSet('newTare', this.value)" placeholder="빈 통 무게"
                       style="flex:1; height:38px; font-size:0.95rem;">
                <span style="font-size:0.85rem; color:#888; width:52px;">g</span>
            </div>
            <div style="font-size:0.75rem; color:#7a5c00; margin:5px 0 0 62px; background:#fff8e1;
                        padding:6px 9px; border-radius:5px;">
                방금 잰 건 <b>떼어낸 옛 통(${tare} g)</b>이라 그 값으로 계산합니다.
                새 통 무게는 <b>저장할 때</b> 이 자리에 등록되어 다음 회차부터 쓰입니다.
            </div>` : ''}
        </div>` : ''}

        ${(Number(h.lossPerHandling) > 0 && last) ? `
        <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
            <span style="width:52px; font-size:0.9rem; color:#555;">탈착</span>
            <input type="number" inputmode="numeric" min="1" value="${ciForm.handlings}"
                   oninput="ciSet('handlings', this.value)" placeholder="${autoHandlings} (자동)"
                   style="flex:1; height:38px; font-size:0.95rem;">
            <span style="font-size:0.85rem; color:#888; width:52px;">회</span>
        </div>
        <div style="font-size:0.75rem; color:#888; margin:4px 0 0 62px;">
            지난 기록 이후 물통을 뗐다 낀 횟수. 비워두면 <b>체중을 잰 날</b> 기준으로 ${autoHandlings}회로 잡습니다.
            (주말처럼 아무도 안 간 날은 세지 않습니다)
        </div>` : ''}
        `}

        <div id="ci-consume" style="margin-top:10px;"></div>
    </div>

    <div class="card">
        <div style="font-size:0.78rem; color:#999; margin-bottom:8px;">2 · 다시 채울 양</div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; font-size:0.88rem;">
            <label style="cursor:pointer;">
                <input type="checkbox" ${ciForm.noWater ? 'checked' : ''}
                       onchange="ciToggleNoWater(this.checked)" style="width:auto;">
                물 그대로 둠
            </label>
            <label style="cursor:pointer;">
                <input type="checkbox" ${ciForm.noFood ? 'checked' : ''}
                       onchange="ciToggleNoFood(this.checked)" style="width:auto;">
                사료 그대로 둠
            </label>
            <label style="cursor:pointer; padding-left:10px; border-left:1px solid #ddd;">
                <input type="checkbox" ${(ciForm.noWater && ciForm.noFood) ? 'checked' : ''}
                       onchange="ciToggleNoBoth(this.checked)" style="width:auto;">
                <b>둘 다 그대로 둠</b> <span style="color:#888; font-size:0.8rem;">(체중만 재는 날)</span>
            </label>
            <span style="color:#888; font-size:0.8rem; flex-basis:100%;">
                잰 것을 그대로 다시 넣습니다. 사료만 갈 날은 <b>물 그대로 둠</b>만 켜세요.
            </span>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:170px; ${ciForm.noWater ? 'opacity:0.4; pointer-events:none;' : ''}">
            ${tare > 0 ? `
            <div style="flex:1; min-width:170px;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">물 채운 통 무게 (g)</div>
                <input type="number" step="any" inputmode="decimal" id="ci-fs" value="${ciForm.fillScale}"
                       oninput="ciSetFillScale(this.value)" placeholder="원액 넣기 전"
                       style="width:100%; height:42px;">
                <div style="font-size:0.75rem; color:#666; margin-top:4px;">
                    빈 통 <b>${fillTare} g</b>${swapped ? ' <b style="color:#e65100;">(새 통)</b>' : ''} 제외 → 물
                    <b id="ci-fs-out" style="color:var(--navy);">${ciForm.fillScale === '' ? '-' : Number(ciForm.waterGiven).toFixed(0)} mL</b>
                    <span style="color:#999;">· 700 mL면 ${(fillTare + 700).toFixed(0)} g 근처</span>
                    ${swapped ? `<br><span style="color:#e65100;">채워서 다는 건 새 통이라 새 무게로 뺍니다.
                        1단계에서 잰 잔량은 떼어낸 옛 통(${tare} g) 기준입니다.</span>` : ''}
                </div>
            </div>` : `
            <div>
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">물 (mL)</div>
                <input type="number" inputmode="decimal" value="${ciForm.waterGiven}"
                       oninput="ciSet('waterGiven', this.value)" style="width:100%; height:42px;">
            </div>`}
            </div>
            ${showBottle ? `
            <div style="width:100px;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">물통 개수</div>
                <input type="number" value="${ciForm.bottleCount}" oninput="ciSet('bottleCount', this.value)"
                       style="width:100%; height:42px;">
            </div>` : ''}
            <div style="flex:1; min-width:120px; ${ciForm.noFood ? 'opacity:0.4; pointer-events:none;' : ''}">
                <div style="font-size:0.78rem; color:#666; margin-bottom:3px;">사료 (g)</div>
                <input type="number" inputmode="decimal" value="${ciForm.foodGiven}"
                       oninput="ciSet('foodGiven', this.value)" style="width:100%; height:42px;">
            </div>
        </div>
        ${(ciForm.noWater || ciForm.noFood) ? `
        <div style="margin-top:8px; padding:8px 10px; background:#f5f5f5; border-radius:6px; font-size:0.8rem; color:#666;">
            ${ciForm.noWater ? `물은 잰 통(<b id="ci-nr-wr">${ciForm.waterRemaining || '-'} g</b>)을 그대로 다시 답니다. 약도 넣지 않습니다.<br>` : ''}
            ${ciForm.noFood ? `사료는 잰 것(<b id="ci-nr-fr">${ciForm.foodRemaining || '-'} g</b>)을 그대로 다시 넣습니다.<br>` : ''}
            그대로 둔 쪽은 <b>오늘 잔량</b>이 다음 구간의 기준이 되므로 섭취량은 끊기지 않습니다.
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
            <div style="font-size:0.75rem; color:#888; margin:3px 0 0 22px;">
                잰 값은 그대로 기록에 남기고 계산에서만 뺍니다.
                MR·BP 때문이라면 위쪽 체크를 쓰세요 — 사유를 나눠 집계합니다.
            </div>
        </label>
    </div>

    <button class="btn btn-green" onclick="ciSave()"
            style="width:100%; height:52px; font-size:1.05rem; margin-bottom:30px;">
        저장하고 ${next ? next.number + '번으로 →' : '목록으로'}
    </button>`;

    ciUpdateCalc();
}

// 개체별 입력칸의 기본 모양. 폼과 재실 목록이 어긋나도 화면이 죽지 않도록
// 없으면 만들어 준다 (예전에 저장이 통째로 실패하던 원인이 이 어긋남이었다).
function ciEnsureRatForm(ratId) {
    if (!ciForm.rats) ciForm.rats = {};
    if (!ciForm.rats[ratId]) ciForm.rats[ratId] = { weight: '', act: 0, fur: 0, eye: 0, note: '', dead: false };
    return ciForm.rats[ratId];
}

function ciRatBlock(rat) {
    const f = ciEnsureRatForm(rat.ratId);
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
            <b style="flex:1; font-size:0.95rem;">${rat.ratId}
                ${typeof batchChipHtml === 'function'
                    ? batchChipHtml(rat, ciConfig && ciConfig.housing && ciConfig.housing.batchSize) : ''}</b>
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
// 예상 섭취량을 손으로 넣는 칸.
// oninput으로 두면 한 글자마다 지시 카드가 다시 그려져 입력칸이 사라진다
// (예전에 저울 칸에서 겪은 것과 같은 문제). 다 쓰고 칸을 벗어날 때 반영한다.
function ciSetManualPc(val) {
    ciForm.manualPc = val;
    ciUpdateCalc();
}

function ciSet(key, val) {
    ciForm[key] = val;
    // 새 통 무게를 고치면 그 통에 채운 양도 따라 바뀐다
    if (key === 'newTare') ciRecalcFill();
    // 그대로 두는 쪽은 '준 양'이 곧 지금 남은 양이므로 같이 따라가야 한다
    if (ciForm.noWater && key === 'waterRemaining') ciForm.waterGiven = val === '' ? 0 : Number(val);
    if (ciForm.noFood  && key === 'foodRemaining')  ciForm.foodGiven  = val === '' ? 0 : Number(val);
    ciUpdateCalc();
}
// 빈 물통 무게는 통마다 다르다. 그 자리에 등록된 값이 우선이고,
// 없으면 코호트 기본값으로 넘어간다.
function ciTareOf(cageId) {
    // 오늘 기록을 다시 열었으면 그때 쓴 값을 그대로 쓴다 (통을 간 날은 자리 값이 이미 바뀌어 있다)
    if (ciForm && ciForm._tareOverride > 0 && String(cageId) === String(ciCurrent))
        return Number(ciForm._tareOverride);
    const cage = ciCages.find(c => String(c.id) === String(cageId));
    if (cage && Number(cage.bottleTare) > 0) return Number(cage.bottleTare);
    return Number((ciConfig && ciConfig.housing && ciConfig.housing.bottleTare) || 0);
}

// 물을 채운 통을 저울에 올린 값 → 실제 부피.
// 700 mL를 정확히 맞춰 붓는 대신 대충 채우고 무게로 부피를 확정한다.
// 원액은 아직 넣기 전이어야 한다 (넣은 뒤면 약까지 물로 세어진다).
// 통을 간 날은 한 기록 안에서 빈 통 무게가 둘로 갈린다.
// 1단계에서 잰 건 떼어낸 '옛 통'이고, 2단계에서 물을 채워 다는 건 '새 통'이다.
// 여기를 옛 무게로 빼면 채운 양이 그 차이만큼 어긋나고,
// 채운 양은 다음 구간 섭취량의 기준이라 오차가 그대로 넘어간다.
function ciFillTareOf() {
    if (ciForm.bottleSwap && Number(ciForm.newTare) > 0) return Number(ciForm.newTare);
    return ciTareOf(ciCurrent);
}

// 빈 통 무게가 바뀌면(통 교체 체크·새 통 무게 수정) 채운 양을 다시 구해야 한다
function ciRecalcFill() {
    const v = ciForm.fillScale;
    if (v === '' || v === undefined || isNaN(Number(v))) return;
    const w = Math.round((Number(v) - ciFillTareOf()) * 10) / 10;
    ciForm.waterGiven = w > 0 ? w : 0;
}

function ciSetFillScale(val) {
    ciForm.fillScale = val;
    const tare = ciFillTareOf();
    const v = (val === '' || isNaN(Number(val))) ? 0 : Math.round((Number(val) - tare) * 10) / 10;
    ciForm.waterGiven = v > 0 ? v : 0;
    ciUpdateCalc();   // 한 글자 칠 때마다 화면을 다시 그리면 입력칸에서 커서가 빠진다
}

// 저울에 올린 값(물통째)에서 빈 통 무게를 빼 물 양을 구한다
function ciSetScale(val) {
    ciForm.waterScale = val;
    const tare = ciTareOf(ciCurrent);
    const water = (val === '' || isNaN(Number(val))) ? '' : Math.round((Number(val) - tare) * 10) / 10;
    ciForm.waterRemaining = water === '' ? '' : String(water);
    if (ciForm.noWater) ciForm.waterGiven = water === '' ? 0 : water;
    ciUpdateCalc();
}

// 무게 → 부피처럼 입력을 받아 다른 곳에 보여주는 값들만 갱신한다.
// 폼 전체를 다시 그리지 않으므로 입력 중인 칸의 포커스가 유지된다.
function ciSyncDerived() {
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('ci-ws-out', ciForm.waterRemaining === '' ? '- g' : ciForm.waterRemaining + ' g');
    set('ci-fs-out', ciForm.fillScale === '' ? '- mL' : Number(ciForm.waterGiven).toFixed(0) + ' mL');
    set('ci-nr-wr', (ciForm.waterRemaining || '-') + ' g');
    set('ci-nr-fr', (ciForm.foodRemaining || '-') + ' g');
}

function ciSetRat(ratId, key, val) {
    ciEnsureRatForm(ratId)[key] = val;
    if (key === 'dead') ciRenderForm(); else ciUpdateCalc();
}
function ciScore(ratId, key, n) {
    const f = ciEnsureRatForm(ratId);
    f[key] = (f[key] === n) ? 0 : n;
    ciRenderForm();
}
// 물·사료를 안 갈고 그대로 두는 날: 다음 구간의 '준 양'은 지금 남아있는 양이 된다.
// 사료도 물과 같은 날 함께 채우므로 물만 처리하면 다음 구간 섭취량이 부풀려진다.
// 물과 사료를 따로 둔다.
// 고염식·BAPN 시작일이 물 교체일과 어긋날 때, 사료만 갈고 물은 재서 그대로 넣으면 된다.
// 케이지를 열려면 물통을 어차피 떼므로 그 김에 재두면 구간이 끊기지 않는다.
function ciToggleNoWater(on) {
    ciForm.noWater = on;
    const h = (ciConfig && ciConfig.housing) || {};
    const last = ciBaseline(ciCurrent);
    if (on) {
        ciForm.waterGiven = ciForm.waterRemaining === '' ? 0 : Number(ciForm.waterRemaining);
        ciForm.fillScale  = '';
    } else {
        ciForm.waterGiven = last ? (last.waterGiven ?? h.waterFill ?? 600) : (h.waterFill ?? 600);
    }
    ciRenderForm();
}

// 체중만 재는 날. 물·사료를 한 번에 켜고 끈다.
function ciToggleNoBoth(on) {
    ciForm.noWater = on; ciForm.noFood = on;
    const h = (ciConfig && ciConfig.housing) || {};
    const last = ciBaseline(ciCurrent);
    if (on) {
        ciForm.waterGiven = ciForm.waterRemaining === '' ? 0 : Number(ciForm.waterRemaining);
        ciForm.foodGiven  = ciForm.foodRemaining  === '' ? 0 : Number(ciForm.foodRemaining);
        ciForm.fillScale  = '';
    } else {
        ciForm.waterGiven = last ? (last.waterGiven ?? h.waterFill ?? 600) : (h.waterFill ?? 600);
        ciForm.foodGiven  = h.foodFill ?? 250;
    }
    ciRenderForm();
}

function ciToggleNoFood(on) {
    ciForm.noFood = on;
    const h = (ciConfig && ciConfig.housing) || {};
    if (on) ciForm.foodGiven = ciForm.foodRemaining === '' ? 0 : Number(ciForm.foodRemaining);
    else    ciForm.foodGiven = h.foodFill ?? 250;   // 사료는 항상 설정값으로 리셋
    ciRenderForm();
}

// 물통을 가는 날: 지금 저울에 올린 건 '떼어낸 옛 통'이므로 계산은 옛 무게로 하고,
// 새 통 무게는 저장할 때 이 자리에 등록해 다음 회차부터 쓰이게 한다.
// (케이지 현황에서 미리 바꿔두면 그날 측정이 새 통 무게로 계산되어 어긋난다)
function ciToggleBottleSwap(on) {
    ciForm.bottleSwap = on;
    if (!on) ciForm.newTare = '';
    ciRecalcFill();     // 채울 통이 옛 통↔새 통으로 바뀌었으므로 채운 양을 다시 구한다
    ciRenderForm();
}

// MR·BP가 낀 구간. 물통을 우리 절차대로 다루지 않아 로스 상수가 성립하지 않는다.
// 어차피 버릴 구간이라 잔량을 재지 않고, 오늘 채운 양만 남겨 다음 구간의 기준으로 쓴다.
// (다음 구간은 '오늘 채운 양'에서 출발하므로 잔량이 없어도 사슬이 끊기지 않는다)
// 수술일. 측정은 유효하므로 잔량 칸을 그대로 두고, 플래그만 붙여 약물 산정에서 뺀다.
function ciToggleSurgery(on) {
    ciToggleFlag('수술일', on);
    if (on) ciToggleFlag('처치일', false);   // 둘을 동시에 켜면 잔량 입력이 사라져 앞뒤가 안 맞는다
    ciRenderForm();
}

function ciToggleProcedure(on) {
    ciToggleFlag('처치일', on);
    if (on) {
        ciToggleFlag('수술일', false);
        ciForm.waterRemaining = ''; ciForm.foodRemaining = '';
        ciForm.waterScale = ''; ciForm.handlings = '';
        ciForm.noWater = false;      // 안 채우면 다음 구간의 기준이 사라진다
    }
    ciRenderForm();
}

function ciToggleFlag(flag, on) {
    if (on) { if (!ciForm.flags.includes(flag)) ciForm.flags.push(flag); }
    else ciForm.flags = ciForm.flags.filter(f => f !== flag);
    ciUpdateCalc();
}

// 마신 양 = 지난번 채운 양 − 이번 잔량 − 로스
// 기준은 ciBaseline: 오늘 재입력이면 오늘 이전 기록과 비교해 파생값을 새로 만든다.
// 지난 기록 다음날부터 어제까지 체중을 잰 날 수 + 오늘 이 방문 1회.
// 오늘 체중은 아직 저장 전이라 DB에 없으므로 날짜로 세지 않고 상수 1로 더한다.
function ciCountHandlings(cageId, prevDateStr) {
    const today = ciDate || getTodayStr();
    let n = 1;                                  // 지금 이 방문에서 뗀 것
    const days = ciWeighDates[cageId];
    if (days && prevDateStr) {
        days.forEach(d => { if (d > prevDateStr && d < today) n++; });
    }
    return n;
}

function ciComputeIntake() {
    const last = ciBaseline(ciCurrent);
    if (!last) return null;

    const wr = Number(ciForm.waterRemaining);
    const fr = Number(ciForm.foodRemaining);
    if (ciForm.waterRemaining === '' || isNaN(wr)) return null;

    const hours = (ciWorkMs() - last.at.toDate().getTime()) / 3600000;
    // 같은 케이지를 방금 또 저장한 경우(수정 등) 몇 분을 한 구간으로 계산하면
    // 마리당 값이 터무니없이 커진다. 너무 짧은 구간은 계산하지 않는다.
    if (hours < 4) return { tooShort: true, hours };
    const cfgH = (ciConfig && ciConfig.housing) || {};
    const evapPerHour = Number(cfgH.evapPerHour) || 0;
    const lossPerHandling = Number(cfgH.lossPerHandling) || 0;
    const bottles = Number(last.bottleCount) || 1;

    // 물통을 뗐다 낄 때마다 로스가 난다.
    // 경과일수로 잡으면 아무도 안 가는 토·일까지 세어 금→월 구간이 3회가 됐다.
    // 실제로는 금요일에 꽂고 월요일에 뽑는 게 전부라 1회다.
    // 그래서 '체중을 잰 날'을 센다 — 체중이 있다는 건 케이지를 열었다는 뜻이고,
    // 주말·공휴일은 잰 기록이 없어 저절로 빠진다.
    const autoHandlings = ciCountHandlings(ciCurrent, last.dateStr);
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
    const t1 = ciWorkMs();
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
        spansWeekend: ciSpansWeekend(t0, t1),
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
                ${c.spansWeekend ? '<br>주말이 낀 구간이라 투약 농도 산정에는 쓰지 않고, 최근 평일 값으로 계산합니다. 섭취량 기록 자체는 그대로 남습니다.' : ''}
                ${(!c.spansWeekend && ciOffFrom24(c.hours) > CI_SPAN_TOL_H)
                    ? `<br>구간이 24시간 배수에서 ${ciOffFrom24(c.hours).toFixed(1)}시간 벗어났습니다. 밤낮 비중이 치우쳐 하루치가 ${c.hours < 24 ? '부풀' : '줄'}었을 수 있어, 투약 농도는 최근 평일 값으로 계산합니다.` : ''}
                ${bad ? '<br><b>잔량이 채운 양보다 많습니다. 입력을 확인하세요.</b>' : ''}
            </div>
        </div>`;
    }
    ciSyncDerived();
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

    const today = ciDate || getTodayStr();
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
    return Math.round((new Date((ciDate || getTodayStr()) + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000);
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

// 예상 섭취량을 직접 넣어야 할 때, 아무 근거 없이 숫자를 요구하면 넣을 수가 없다.
// 옆 케이지가 지금 얼마인지, 이 케이지의 지난 구간은 왜 빠졌는지, 넣으면 얼마가 되는지를
// 같이 보여준다. (실제로 새 케이지 첫 회차에 빈 칸만 덩그러니 뜬 적이 있다)
function ciManualPcBox(rule, sumBW, aliveN, fill, stock) {
    const why = r => {
        const f = (r.flags || []).join(' · ');
        if (f) return f;
        if (ciRowSpansWeekend(r)) return '주말 낌';
        if (!(r.waterPerCapita > 0)) return '섭취량 없음';
        return '';
    };
    // 같은 코호트 다른 케이지가 지금 쓰는 값
    const others = ciCages
        .filter(c => String(c.id) !== ciCurrent && ciRecentPc[c.id])
        .map(c => `${c.number}번 <b>${ciRecentPc[c.id].toFixed(1)}</b>`);

    // 이 케이지의 지난 기록과 못 쓰는 이유
    const mine = (ciCageRows[ciCurrent] || []).filter(r => r.dateStr !== (ciDate || getTodayStr()))
        .slice(0, 4)
        .map(r => `${r.dateStr.slice(5)} ${r.waterPerCapita > 0 ? r.waterPerCapita.toFixed(1) : '–'}` +
                  `${why(r) ? ` <span style="opacity:0.75;">(${why(r)})</span>` : ''}`);

    const v = Number(ciForm.manualPc);
    const preview = (v > 0) ? (() => {
        const k = Number(rule.value) * (sumBW / 1000) / (v * aliveN);
        const mg = (k < stock) ? (k * fill) / (1 - k / stock)
                               : Number(rule.value) * (sumBW / 1000) * (fill / (v * aliveN));
        return `넣으면 → 원액 <b>${(mg / stock).toFixed(1)} cc</b> · 물통 농도 ${(mg / fill).toFixed(3)} mg/mL`;
    })() : '값을 넣으면 원액 양이 여기에 나옵니다.';

    return `
    <div style="margin-top:9px; padding-top:9px; border-top:1px dashed #ffe082;">
        <div style="font-size:0.8rem; color:#7a5c00; margin-bottom:6px;">
            예상 섭취량을 직접 넣으면 그 값으로 계산합니다. 손으로 넣었다는 것이 기록에 남습니다.
        </div>
        <div style="font-size:0.78rem; color:#7a5c00; background:#fffdf5; border-radius:5px;
                    padding:7px 9px; margin-bottom:7px; line-height:1.6;">
            ${others.length ? `오늘 다른 케이지 · ${others.join(' &nbsp; ')}<br>` : ''}
            ${mine.length ? `이 케이지 지난 기록 · ${mine.join(' &nbsp; ')}` :
                            '이 케이지는 지난 기록이 없습니다. 다른 케이지 값을 보고 넣으세요.'}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" inputmode="decimal" value="${ciForm.manualPc || ''}"
                   onchange="ciSetManualPc(this.value)" placeholder="마리당 mL/day"
                   style="width:150px; height:38px;">
            <span style="font-size:0.8rem; color:#7a5c00;">mL / 마리 / 일</span>
        </div>
        <div style="font-size:0.78rem; color:#7a5c00; margin-top:6px;">${preview}</div>
    </div>`;
}

function ciUpdateDose() {
    const box = document.getElementById('ci-dose');
    if (!box) return;

    const rule = ciGetMetforminRule();
    const occ = ciOccupants(ciCurrent);
    if (!rule || !occ.length) { ciForm._doseCc = 0; box.innerHTML = ''; return; }

    // 물을 안 갈면 약도 새로 넣지 않는다
    if (ciForm.noWater) {
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

    // 지금 채우는 물은 앞으로 며칠간 마실 물이다.
    // 오늘 사망으로 표시한 개체는 그 물을 마시지 않으므로 계산에서 뺀다.
    const alive = occ.filter(r => !((ciForm.rats && ciForm.rats[r.ratId]) || {}).dead);
    if (!alive.length) {
        ciForm._doseCc = 0; ciForm._doseMg = 0;
        box.innerHTML = `<div class="card" style="background:#f5f5f5;">
            <b style="color:#666;">이 케이지에 남는 개체가 없어 ${rule.substance}을 넣지 않습니다.</b>
        </div>`;
        return;
    }

    // 체중은 오늘 입력한 값 우선, 없으면 계산 불가
    let sumBW = 0, missing = [];
    alive.forEach(r => {
        const w = Number(((ciForm.rats && ciForm.rats[r.ratId]) || {}).weight);
        if (w > 0) sumBW += w; else missing.push(r.ratId);
    });

    const c = ciComputeIntake();

    // 예상 섭취량은 평일 구간에서만 가져온다. 주말이 낀 구간은 마리당 값이 달라
    // 그대로 쓰면 다음 회차 농도가 어긋난다 (계획서 9항).
    // 월요일 라운드가 바로 이 경우다 — 방금 잰 금→월 구간 대신 최근 평일 평균을 쓴다.
    // 이상·처치일로 표시한 구간은 방금 쟀더라도 쓰지 않는다.
    // 표시는 저장 뒤 '다음' 회차부터 걸러졌기 때문에, 정작 오늘 넣을 원액이
    // 그 못 쓸 값으로 계산되고 있었다. (누수면 섭취량이 부풀어 약이 적게 들어간다)
    const flagged = (ciForm.flags || []).length > 0;

    // 구간이 24시간 배수에서 크게 벗어나면 이번 값은 밤낮 비중에 치우쳐 있다.
    // 그런 날만 최근 평일 평균으로 넘긴다. 평소에는 최신 값을 그대로 쓴다.
    const spanOff = c && !c.tooShort ? ciOffFrom24(c.hours) : 0;
    const spanOdd = spanOff > CI_SPAN_TOL_H;

    let expectedPc = null, pcSource = '';
    if (Number(ciForm.manualPc) > 0) {
        expectedPc = Number(ciForm.manualPc); pcSource = '손으로 입력';
    } else if (c && c.waterPc > 0 && !c.spansWeekend && !flagged && !spanOdd) {
        expectedPc = c.waterPc; pcSource = '이번 구간';
    } else if (ciRecentPc[ciCurrent]) {
        expectedPc = ciRecentPc[ciCurrent];
        const why = (c && c.spansWeekend) ? '주말이 껴서'
                  : (ciForm.flags || []).includes('수술일') ? '수술일이라'
                  : (ciForm.flags || []).includes('처치일') ? 'MR·BP가 껴서'
                  : (ciForm.flags || []).includes('이상')   ? '이상이 있어서'
                  : spanOdd ? `구간이 24h에서 ${spanOff.toFixed(1)}h 벗어나서` : null;
        pcSource = why ? `최근 평일 평균 (이번 구간은 ${why} 제외)` : '최근 평일 평균';
    } else if (ciRecentPcAny[ciCurrent]) {
        // 평일 기록이 아직 하나도 없으면 투약을 막는 것보다 주말 값이라도 쓰는 편이 낫다
        expectedPc = ciRecentPcAny[ciCurrent];
        pcSource = '주말 포함 구간 (평일 기록이 아직 없음)';
    }

    const fill = Number(ciForm.waterGiven) || 0;
    const stock = Number(rule.stockConc) || 0;

    // 하한 : 아파서 덜 마신 값으로 농도를 잡으면 회복하는 순간 과다투여가 된다.
    // 대비책 경로뿐 아니라 '이번 구간' 값에도 걸어야 한다.
    // (파일럿에서 이번 구간 마리당 1.5 mL 가 그대로 쓰여 원액 194 cc 가 나온 적이 있다)
    const floorPc = ciRecentPc[ciCurrent] || 0;
    if (!(Number(ciForm.manualPc) > 0) && floorPc > expectedPc) {
        expectedPc = floorPc;
        pcSource = '최근 최대 (이번 구간이 그보다 낮아 하한 적용)';
    }

    // 채우는 물이 예상 섭취의 몇 일치인가. 평일 3일치 · 금요일 4~5일치가 정상이다.
    // 섭취량이 비정상적으로 낮게 잡히면 이 값이 수십~수백 일치로 튀고, 그대로 두면
    // 물통 하나에 몇 g 을 타라는 지시가 나온다. 그때는 계산을 멈추고 손으로 받는다.
    const daysWorth = (expectedPc > 0) ? fill / (expectedPc * alive.length) : Infinity;
    const wild = daysWorth > CI_DAYS_CAP;

    if (missing.length || !expectedPc || !stock || !fill || wild) {
        // 계산 못 하면 지시량도 0으로 — 이전 계산값이 남은 채 저장되면
        // 화면엔 지시가 없었는데 기록에는 투약한 것으로 남는다
        ciForm._doseCc = 0; ciForm._doseMg = 0;
        box.innerHTML = `<div class="card" style="background:#fff8e1; border:1px solid #ffe082;">
            <b style="color:#7a5c00;">${rule.substance} 지시량 계산 대기</b>
            <div style="font-size:0.8rem; color:#7a5c00; margin-top:4px;">
                ${missing.length ? `체중 미입력: ${missing.join(', ')}<br>` : ''}
                ${!expectedPc ? (flagged
                    ? '이 구간을 계산에서 뺐고, 대신 쓸 최근 기록도 없습니다.<br>'
                    : '이전 섭취 기록이 없어 예상 섭취량을 알 수 없습니다.<br>') : ''}
                ${!stock ? '코호트 설정에 원액 농도가 없습니다.<br>' : ''}
                ${wild ? `예상 섭취량이 마리당 <b>${(expectedPc || 0).toFixed(1)} mL/일</b>로 너무 낮습니다.
                    이대로 계산하면 채우는 물이 <b>${daysWorth.toFixed(0)}일치</b>가 되어
                    물통 하나에 원액을 몇십 cc씩 넣으라는 지시가 나옵니다.
                    쥐가 실제로 마실 만한 값을 손으로 넣으세요.<br>` : ''}
            </div>
            ${((!expectedPc || wild) && !missing.length && stock && fill) ? ciManualPcBox(rule, sumBW, alive.length, fill, stock) : ''}
        </div>`;
        return;
    }

    // 예상 섭취량은 '마리당 × 앞으로 남는 마리수' → 합치거나 죽어도 자동으로 맞음
    const expectedIntake = expectedPc * alive.length;

    // 물통 안 총 부피 = 물 + 넣을 원액. 약도 그 안에 녹아 있으므로 농도는 총 부피 기준이다.
    // needMg = k × (물 + needMg/원액농도)  →  풀면 아래.  (원액 부피를 빼먹으면 약 1% 적게 들어간다)
    const k = Number(rule.value) * (sumBW / 1000) / expectedIntake;
    const needMg = (k < stock) ? (k * fill) / (1 - k / stock)
                               : Number(rule.value) * (sumBW / 1000) * (fill / expectedIntake);
    const cc = needMg / stock;
    const totalVol = fill + cc;
    ciForm._doseCc = Number(cc.toFixed(1));
    ciForm._doseMg = Number(needMg.toFixed(1));
    ciForm._stockConc = stock;

    const deadNow = occ.length - alive.length;
    const partial = started.filter(r => !((ciForm.rats && ciForm.rats[r.ratId]) || {}).dead).length !== alive.length;
    box.innerHTML = `
    <div class="card" style="background:#e3f2fd; border:1px solid #90caf9;">
        <div style="font-size:0.85rem; color:#0d47a1;">오늘 이 케이지</div>
        <div style="font-size:1.25rem; font-weight:bold; color:#0d47a1; margin:4px 0;">
            물 ${fill.toFixed(0)} mL + ${rule.substance} 원액 ${cc.toFixed(1)} cc
        </div>
        <div style="font-size:0.75rem; color:#1565c0;">
            총체중 ${sumBW.toFixed(0)}g · 목표 ${rule.value} mg/kg/day · 필요 ${needMg.toFixed(0)}mg
            · 예상섭취 ${expectedIntake.toFixed(0)}mL<span style="opacity:0.8;"> (${pcSource})</span>
            · 채우는 물은 <b>${daysWorth.toFixed(1)}일치</b>${daysWorth > 5 ? ' ⚠' : ''}
            · 원액 ${stock}mg/mL · 통 안 총량 ${totalVol.toFixed(0)}mL
            ${deadNow ? `<br>사망 표시한 ${deadNow}마리는 빼고 ${alive.length}마리 기준으로 계산했습니다.` : ''}
        </div>
        ${partial ? `<div style="font-size:0.78rem; color:#b71c1c; margin-top:5px;">
            ⚠️ 같은 케이지인데 투약 구간이 아닌 개체가 있습니다 (투약 중 ${started.filter(r => !((ciForm.rats && ciForm.rats[r.ratId]) || {}).dead).length}/${alive.length}).
            ${alive.filter(r => win.get(r.ratId) !== 'on').map(r => `${r.ratId}(${
                { before: '시작 전', after: '종료', nodate: '날짜 없음' }[win.get(r.ratId)]
            })`).join(', ')}<br>
            물통을 공유하므로 전원에게 들어갑니다.</div>` : ''}
    </div>`;
}

// ---------- 저장 ----------
// 저장은 쓰기가 여러 번 일어나 한두 초 걸린다. 그동안 화면이 그대로라
// 멈춘 줄 알고 다시 누르면 다음 케이지로 넘어가 그 케이지까지 저장돼 버렸다.
// 화면을 덮어 터치를 막고, 지금 뭘 하는 중인지 보여준다.
function ciBusy(on, msg) {
    let el = document.getElementById('ci-busy');
    if (!on) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('div');
        el.id = 'ci-busy';
        el.style.cssText = 'position:fixed; inset:0; z-index:99998; background:rgba(255,255,255,0.92);'
            + 'display:flex; flex-direction:column; align-items:center; justify-content:center;'
            + 'gap:16px; touch-action:none;';
        el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div style="width:54px; height:54px; border:5px solid #e3f2fd; border-top-color:#1565c0;
                    border-radius:50%; animation:ci-spin 0.8s linear infinite;"></div>
        <div style="font-size:1.15rem; font-weight:bold; color:#0d47a1;">${msg || '저장 중입니다'}</div>
        <div style="font-size:0.9rem; color:#666;">끝나면 다음 케이지로 넘어갑니다. 누르지 말고 기다려주세요.</div>`;
}

function ciBackToList() { ciCurrent = null; ciRenderList(); }

async function ciSave() {
    if (!ciCurrent) return;
    if (ciSaving) return;              // 이미 저장 중 — 두 번째 누름은 무시한다
    ciSaving = true;
    const savingCage = ciCurrent;
    const savingNumber = (ciCages.find(x => String(x.id) === savingCage) || {}).number || savingCage;
    ciBusy(true, `${savingNumber}번 케이지 저장 중`);
    try {

    // 화면을 열어둔 사이에 케이지 현황에서 쥐를 옮기면 개체 목록과 입력 폼이 어긋난다.
    // 그대로 저장하면 ciForm.rats[개체]가 없어 저장이 통째로 실패했다. 먼저 맞춰본다.
    const fresh = await db.collection('ratHousing').where('to', '==', null).get();
    const nowIds = [];
    fresh.forEach(d => {
        const v = d.data();
        if (String(v.cageId) === String(savingCage) && ciRats.some(r => r.ratId === v.ratId)) nowIds.push(v.ratId);
    });
    const formIds = Object.keys(ciForm.rats || {});
    const changed = nowIds.length !== formIds.length || nowIds.some(id => !formIds.includes(id));
    if (changed) {
        alert(`이 케이지의 재실이 화면을 연 뒤에 바뀌었습니다.\n\n` +
              `화면: ${formIds.join(', ') || '없음'}\n지금: ${nowIds.join(', ') || '없음'}\n\n` +
              `최신 상태로 다시 불러옵니다. 입력값을 확인하고 다시 저장해주세요.`);
        ciSaving = false; ciBusy(false);
        await ciLoad(ciViewToken);
        ciOpen(savingCage);
        return;
    }

    const occ = ciOccupants(savingCage);
    const c = ciComputeIntake();

    // 잔량이 지난번 채운 양보다 많으면 마신 양이 음수가 된다. 물리적으로 불가능하므로
    // 측정이나 입력이 틀린 것이다 — 저울 영점, 사료 흘림 주워 담김, 통 짝 바뀜 등.
    // 소량(측정 오차 범위)은 조용히 넘어가고, 그 이상이면 저장 전에 알린다.
    // (실제로 사료 '마심'이 -3 g 으로 저장돼 섭취량 평균을 끌어내린 일이 있다)
    if (c && !c.tooShort) {
        const probs = [];
        // 물은 로스 추정이 섞여 있어 -5 mL 까지는 추정 오차로 본다.
        // 사료는 보정이 없으므로 저울 흔들림(-2 g)을 넘는 음수는 전부 이상하다.
        if (typeof c.water === 'number' && c.water < -5)
            probs.push(`물 마심이 ${c.water.toFixed(0)} mL — 잔량(${ciForm.waterRemaining} g)이 지난번 채운 양보다 많습니다`);
        if (typeof c.food === 'number' && c.food !== null && c.food < -2)
            probs.push(`사료 마심이 ${c.food.toFixed(1)} g — 잔량(${ciForm.foodRemaining} g)이 지난번 채운 양(전 회차)보다 많습니다`);
        if (probs.length && !confirm(
            '측정값이 앞뒤가 맞지 않습니다.\n\n· ' + probs.join('\n· ') +
            '\n\n저울값을 다시 확인해주세요. 이대로 저장하면 음수 섭취량이 기록에 남습니다.' +
            '\n\n그래도 저장할까요?')) {
            ciSaving = false; ciBusy(false);
            return;
        }
    }

    const now = firebase.firestore.Timestamp.fromDate(new Date(ciWorkMs()));
    const dateStr = ciDate || getTodayStr();
    const by = (firebase.auth().currentUser && firebase.auth().currentUser.email) || null;

    // 잰 값(잔량·체중)이 없어도 '채운 양'만 있는 날은 정상적인 기록이다.
    // 첫 급여처럼 비교할 지난 기록이 없으면 잴 잔량 자체가 없다.
    const measured = ciForm.waterRemaining !== '' || ciForm.foodRemaining !== '' ||
                     ciForm.waterScale !== '' ||
                     Object.values(ciForm.rats).some(f => f.weight !== '');
    const filled = !ciForm.noWater &&
                   (ciForm.fillScale !== '' || !ciBaseline(savingCage));
    if (!measured && !filled) {
        ciSaving = false; ciBusy(false);
        return alert('입력된 값이 없습니다.');
    }

    // 소급 입력인데 뒤에 이미 기록이 있으면, 그 기록은 이 구간을 모른 채 계산돼 있다.
    if (ciIsBackdated()) {
        const later = (ciLastFeed[savingCage] && ciLastFeed[savingCage].at &&
                       ciLastFeed[savingCage].at.toMillis() > ciWorkMs()) ? ciLastFeed[savingCage] : null;
        if (later && !confirm(
            `${dateStr} 자로 기록합니다.\n\n이 케이지에는 이후 기록(${later.dateStr})이 이미 있습니다.\n` +
            `그 기록의 섭취량은 이 구간을 모른 채 계산되어 있어 자동으로 고쳐지지 않습니다.\n\n` +
            `계속할까요?`)) return;
    }

    {
        const cfgH = (ciConfig && ciConfig.housing) || {};
        // 계산에 쓴 상수를 그 기록에 함께 남긴다 → 나중에 설정을 바꿔도 과거가 변하지 않음
        const cageDoc = ciCages.find(x => String(x.id) === ciCurrent);
        const feed = {
            cageId: String(ciCurrent), cohort: String(ciCohort),
            // 군을 기록 자체에 박아둔다. 케이지가 비면 케이지의 군은 해제되므로
            // 분석이 '현재 케이지 상태'에 기대면 코호트가 끝난 순간 과거가 전부 미지정이 된다.
            group: (cageDoc && cageDoc.group) || (occ.length ? ('G' + String(occ[0].group || 1).replace(/^G/, '')) : null),
            at: now, dateStr: dateStr,
            waterRemaining: ciForm.waterRemaining === '' ? null : Number(ciForm.waterRemaining),
            foodRemaining: ciForm.foodRemaining === '' ? null : Number(ciForm.foodRemaining),
            // waterGiven = 물통에 실제로 들어간 총 액체량(물 + 원액).
            // 다음 구간의 섭취량이 여기서 잔량을 빼므로 원액 부피도 포함해야 맞다.
            waterGiven: Number(ciForm.waterGiven) + (ciForm.noWater ? 0 : (Number(ciForm._doseCc) || 0)),
            fillWater: Number(ciForm.waterGiven),                                  // 물만
            fillScale: ciForm.fillScale === '' ? null : Number(ciForm.fillScale),  // 물 채운 통 무게 원본
            foodGiven: Number(ciForm.foodGiven),
            bottleCount: Number(ciForm.bottleCount) || 1,
            noWater: !!ciForm.noWater,
            noFood: !!ciForm.noFood,
            noRefill: !!(ciForm.noWater && ciForm.noFood),   // 옛 화면 호환
            ratCount: occ.length,
            ratIds: occ.map(r => r.ratId),
            evapPerHour: Number(cfgH.evapPerHour) || 0,
            lossPerHandling: Number(cfgH.lossPerHandling) || 0,
            // 저울에 찍힌 원본값과 그때 쓴 빈 통 무게를 같이 남긴다.
            // 나중에 빈 통 무게가 틀린 걸로 밝혀져도 원본이 있으면 되돌려 계산할 수 있다.
            waterScale: ciForm.waterScale === '' ? null : Number(ciForm.waterScale),
            bottleTare: ciTareOf(ciCurrent),        // 잔량을 잰 통(= 떼어낸 옛 통)의 빈 무게
            // 통을 간 날은 채워서 다는 게 새 통이라 빈 무게가 다르다.
            // 두 값을 따로 남겨야 나중에 저울 원본값에서 되돌려 계산할 수 있다.
            fillBottleTare: ciFillTareOf(),
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
        } else {
            // 계산 못 한 저장(잔량 미입력 등)이 오늘 기록을 덮어쓸 때,
            // merge로 이전 파생값이 살아남으면 실제 입력과 어긋난 값이 남는다. 명시적으로 비운다.
            feed.handlings = null; feed.lossTotal = null; feed.intervalHours = null;
            feed.waterConsumed = null; feed.foodConsumed = null; feed.animalDays = null;
            feed.waterPerCapita = null; feed.foodPerCapita = null;
        }
        // 투약량도 항상 이번 화면이 계산한 값으로 쓴다 (0이면 0으로 — 낡은 값 잔존 방지)
        feed.doseCc = Number(ciForm._doseCc) || 0;
        feed.doseMg = Number(ciForm._doseMg) || 0;
        feed.stockConc = feed.doseCc > 0 ? (ciForm._stockConc || null) : null;
        // 예상 섭취량을 손으로 넣었으면 남긴다 — 나중에 이상값을 만났을 때 판단 근거가 된다
        feed.manualPerCapita = Number(ciForm.manualPc) > 0 ? Number(ciForm.manualPc) : null;
        // 다음 라운드 조제량을 미리 계산하려면 체중이 필요하다.
        // 투약을 아직 안 하는 케이지도 남겨둬야 '이번에 새로 시작하는 케이지'까지 예측된다.
        // 오늘 사망한 개체는 다음 구간에 없으므로 예측용 합계에서 뺀다.
        // (개체별 체중은 measurements에 그대로 남으므로 기록이 사라지진 않는다)
        const fv = r => (ciForm.rats && ciForm.rats[r.ratId]) || {};
        const aliveNow = occ.filter(r => !fv(r).dead);
        const bwSum = aliveNow.reduce((a, r) => a + (Number(fv(r).weight) || 0), 0);
        const bwAll = occ.reduce((a, r) => a + (Number(fv(r).weight) || 0), 0);
        if (bwSum > 0) feed.sumBW = Number(bwSum.toFixed(0));
        if (bwAll > 0) feed.sumBWMeasured = Number(bwAll.toFixed(0));   // 그날 실제로 잰 전체 합

        // 물통 교체: 새 통 무게는 이 자리에 등록해 '다음 회차부터' 적용한다.
        // 오늘 측정은 위에서 이미 옛 통 무게로 계산됐다.
        let swapTo = null;
        if (ciForm.bottleSwap) {
            swapTo = Number(ciForm.newTare);
            if (!(swapTo > 0)) return alert('새 물통의 빈 통 무게를 입력하세요.');
            feed.bottleSwapped = true;
            feed.newBottleTare = swapTo;
        }

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
            const f = (ciForm.rats && ciForm.rats[r.ratId]) || null;
            if (!f) continue;
            if (f.weight !== '' && Number(f.weight) > 0) {
                const payload = {
                    ratId: r.ratId, weight: Number(f.weight), date: dateStr,
                    timepoint: 'Manual', source: 'cageInput', cageId: String(ciCurrent),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                const prev = findMine(todayMeas, r.ratId);
                if (prev) await prev.ref.set(payload, { merge: true });
                else await db.collection('measurements').add(payload);
                // 다시 열었을 때 되살릴 수 있도록 메모리 캐시도 같이 채운다.
                // (예전엔 화면을 처음 열 때만 채워서, 저장 후 다시 열면 체중 칸이 비었고
                //  그대로 저장하면 투약 지시량이 0으로 덮어써졌다)
                ciTodayMeas[r.ratId] = Number(f.weight);
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
                ciTodayLogs[r.ratId] = { scores: payload.scores, note: payload.note };
            }
            if (f.dead) await ciMarkDead(r, dateStr, now);
            else if (total > 0) {
                const snap = await db.collection('rats').where('ratId', '==', r.ratId).get();
                if (!snap.empty) await snap.docs[0].ref.update({ lastScore: total });
            }
        }

        if (swapTo) {
            await db.collection('cages').doc(String(ciCurrent)).set({ bottleTare: swapTo }, { merge: true });
            const cg = ciCages.find(x => String(x.id) === ciCurrent);
            if (cg) cg.bottleTare = swapTo;
        }

        clearRatsCache();
        // 오늘 이전 기록은 재입력의 비교 기준으로 계속 필요하다 — 오늘 것으로 덮기 전에 보존
        const lf = ciLastFeed[ciCurrent];
        if (lf && lf.dateStr !== dateStr) ciPrevFeed[ciCurrent] = lf;
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

        if (next) { ciOpen(next.id); window.scrollTo(0, 0); }
        else { ciBackToList(); window.scrollTo(0, 0); }
    }
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    } finally {
        ciSaving = false;
        ciBusy(false);
    }
}

// 사망 처리는 한 곳으로: 상태 기록 + 재실 종료가 항상 같이 일어나야
// 죽은 개체가 animal_days에 계속 잡히지 않는다.
async function ciMarkDead(rat, dateStr, now) {
    const snap = await db.collection('rats').where('ratId', '==', rat.ratId).get();
    if (!snap.empty) await snap.docs[0].ref.update({ status: '사망', deathDate: dateStr, deathFoundAt: now });
    await closeOpenHousing(rat.ratId, '사망');   // 재실 종료 + 빈 케이지 군 해제 (공용 헬퍼)
}

// ---------- 조제 지시 요약 ----------
async function ciShowPrepSheet() {
    const todayStr = ciDate || getTodayStr();
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
            ${(() => {
                // 케이지마다 실제로 넣은 무게가 다르다. 첫 케이지 값을 '전 케이지'로 단정하면
                // 나머지가 전부 그 값인 것처럼 보인다.
                const fed = rows.filter(r => typeof r.food === 'number');
                if (!fed.length) return '사료: 기록 없음';
                const uniq = [...new Set(fed.map(r => r.food))];
                if (uniq.length === 1) return `사료: 전 케이지 ${uniq[0]} g으로 리셋`;
                return `사료 (케이지마다 실제로 넣은 무게)<div style="margin-top:5px; color:#555;">`
                    + fed.map(r => `${r.n}번 ${r.food} g`).join(' · ') + '</div>';
            })()}
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
