const firebaseConfig = {
    apiKey: "AIzaSyCOrTBAQZ4WgFTT5Qk96k0Z_aTTVjKKQeI",
    authDomain: "nidd-lab.firebaseapp.com",
    projectId: "nidd-lab",
    storageBucket: "nidd-lab.firebasestorage.app",
    messagingSenderId: "959472997584",
    appId: "1:959472997584:web:d749f452f2cfc25e3d3ad5"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("🔥 파이어베이스 초기화 성공!"); // <- 이 줄을 추가!

// [로그인 유지] 세션을 기기에 저장 → 탭이 닫히거나 폰이 잠겨도 로그인 상태 유지
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(e => console.error("로그인 유지 설정 실패:", e));

let currentScores = { act: 0, fur: 0, eye: 0 };
let allBPData = [];
let bpChartInstance = null;
let globalBpData = [];
let allRatsForDetail = [];
// [전역 변수 추가] 분석된 데이터를 임시 저장할 공간
let currentAnalyzedData = {};
// [추가] 데이터 절약을 위한 캐시 변수
let cachedRatsList = null;      // 쥐 목록 캐시
let lastCacheTime = 0;          // 마지막으로 불러온 시간
const CACHE_DURATION = 1000 * 60 * 5; // 5분 동안은 다시 안 불러옴 (시간 조절 가능)

// COD Global States
let codTargetDocId = null;  // For Detail Page (Direct DB Save)
let codTargetInputId = null; // For Admin Page (Input Update only)
let codTempData = { type: '', secondary: '', causes: [] };
// [신규] 차트 간 마우스 동기화(Crosshair)를 위한 전역 변수
let syncChartsSbp = []; // SBP 차트들 모음
let syncChartsWt = [];  // WT 차트들 모음
let activeCrosshairValSbp = null; // 현재 마우스가 가리키는 SBP 값
let activeCrosshairValWt = null;  // 현재 마우스가 가리키는 WT 값
// [최종] 십자선(Crosshair) 기능: X축 연동 + Y축 표시 + On/Off 제어
let activeCrosshairPoint = null; // 현재 마우스 위치
// [최종 보정] 가이드선 동기화 + 라벨 잘림 방지 + X축 라벨 추가
// [오류 해결] Chart.instances 객체 처리 및 라벨 잘림 방지 로직
// [최종] 가로선(Y축) 수치 기반 동기화 및 타입별 필터링
let isCrosshairEnabled = true;
let sharedXValue = null;
let sharedYValue = null; // 공유 데이터 수치(Y)
let sourceSyncType = null; // sbp 또는 wt
let activeChartId = null;
// [전역 상태] 개별 데이터 표시 여부
let isIndividualVisible = false;
let activeCodRatId = null;
let stagedPhotos = [];
// 전역 변수: 차트/데이터 캐시 및 필터 상태 관리
let trendScatterCharts = { low: null, high: null };
let trendScatterDataCache = { low: [], high: [] };
let trendTimepointsCache = [];
// [추가] 각 그룹별 현재 필터 상태 저장 (기본값 All)
let trendFilterState = { low: 'All', high: 'All' };
// [1단계] 비교 분석용 전역 변수 추가 (스크립트 상단 전역변수 모음 쪽에 붙여넣으세요)
let compScatterCharts = {};      // 차트 인스턴스 저장
let compScatterDataCache = {};   // 원본 데이터 저장
let compFilterState = {};        // 필터 상태 저장
let combinedData = [];
let maxW = 0;
let minW = 9999;


// --- 프레젠테이션 & 데이터 ---
let csvUploadData = [];
let bpAllData = [];

// --- 사진 뷰어(Photo Viewer) 드래그 관련 전역 변수들 ---
// (중복되지 않게 한 번만 선언합니다!)
let pvDragging = false;
let pvStartX = 0;
let pvStartY = 0;
let pvTranslateX = 0;
let pvTranslateY = 0;
let pvScale = 1;
let pvTransX = 0;
let pvTransY = 0;

// [추가] 차트 X축 모드 (시점 vs 주령 연속) 토글 전역 상태
window.isAgeMode = false;

// [추가] 하이브리드 시간축 모드 (수술 전=달력, 수술 후=POD)
//        localStorage 에 저장해서 새로고침/재접속 후에도 마지막 상태 유지
try {
    window.isHybridMode = localStorage.getItem('rlm_hybrid_mode') === 'true';
} catch (e) {
    window.isHybridMode = false;
}

window.toggleHybridMode = function() {
    window.isHybridMode = !window.isHybridMode;
    try { localStorage.setItem('rlm_hybrid_mode', String(window.isHybridMode)); } catch (e) {}
    // 단일 코호트 분석 화면일 때만 다시 그리기
    const view = appTabs.find(t => t.id === activeTabId)?.view;
    if (view === 'cohort') loadCohortDetail();
};

window.toggleXAxisMode = function() {
    window.isAgeMode = !window.isAgeMode;
    
    // 현재 열려있는 탭을 확인해서 차트를 다시 그림
    const view = appTabs.find(t => t.id === activeTabId)?.view;
    if (view === 'cohort') loadCohortDetail();
    else if (view === 'compare') {
        if (document.getElementById('cp-ui-grp').style.display === 'block') loadGroupComparison();
        else loadCohortComparison();
    }
    else if (view === 'trend') analyzeTrend();
};


// globals.js 에 있는 코드를 이 코드로 덮어씌워 주세요.
window.observer = new MutationObserver(() => {
    const dropzone = document.querySelector('[id^="photo-dropzone-"]');
    if (dropzone) {
        window.currentRatDocId = dropzone.id.replace('photo-dropzone-', '');
    } else {
        window.currentRatDocId = null;
        window.stagedPhotos = [];
    }
});
window.addEventListener('DOMContentLoaded', () => {
    window.observer.observe(document.body, { childList: true, subtree: true });
});

// [1] 전역 변수: 모든 시점의 POD(수술 후 경과일) 수치화 정의
// Arrival을 -5로 설정하여 D00(-1)보다 확실히 앞에 오게 함
const globalPodMap = {
           // 수술 전 베이스라인 (통합 마커)
    "D0": 0,         // 수술 당일 (기준점 0)
    "D1": 1,         // 수술 후 1일
    "D2": 2,         // 수술 후 2일
    "D3": 3,         // 수술 후 3일
    "D4": 4,
};
// W1 ~ W50 자동 생성 (7일 간격)
for (let i = 1; i <= 50; i++) {
    globalPodMap[`W${i}`] = i * 7;
}

// Define Custom Color Palette for Clarity
// [수정됨] 색상 팔레트: 대비 강화 및 Aneurysm O/X 구분 확실화
// [필수] COD 차트 색상 매핑 (3차 분류 색상 포함)
const codColors = {
    // 1차 분류
    "Neurological": "#1565C0",      // 진한 파랑
    "Non-Neurological": "#D32F2F",  // 진한 빨강
    "Unknown": "#424242",           // 진한 회색

    // 2차 분류
    "Aneurysm(O)": "#C2185B",       // 진한 핑크
    "Aneurysm (O)": "#C2185B",
    "Aneurysm(X)": "#00897B",       // 청록색
    "Aneurysm (X)": "#00897B",
    "Surgical Failure": "#F57C00",  // 주황
    "Unknown (Sec)": "#E57373",     // 연한 빨강
    "Sacrifice (Sec)": "#FFB300",   // 호박색

    // 3차 분류 (Detail) - 여기가 회색으로 나오지 않도록 정의
    "SAH": "#64B5F6",               // 밝은 파랑
    "Infarction": "#26C6DA",        // 시안(Cyan)
    "Vasospasm": "#AB47BC",         // 보라
    "Sacrifice": "#FFF176",         // 노랑
    "Unknown (3rd)": "#EEEEEE",     // 연회색
    "None": "transparent"
};

// 약어 매핑 (기존 유지)
const codAbbrMap = {
    "Non-Neurological": "Non-Neuro",
    "Neurological": "Neuro",
    "Aneurysm(O)": "Aneurysm(O)", // 약어도 그대로 표시하여 혼동 방지
    "Aneurysm (O)": "Aneurysm(O)",
    "Aneurysm(X)": "Aneurysm(X)",
    "Aneurysm (X)": "Aneurysm(X)",
    "Infarction": "Infarc",
    "Vasospasm": "CVS",
    "Sacrifice": "Sacrifice",
    "Procedure related": "Proc. related",
    "Unknown": "Unknown",
    "None": "-"
};

// [신규] 쥐 목록 가져오기 (캐싱 적용됨 - 읽기 횟수 획기적 감소)
async function getRatsWithCache(forceRefresh = false) {
    const now = Date.now();
    // 1. 캐시가 있고, 5분이 안 지났고, 강제 새로고침이 아니면 -> 저장된 거 씀 (읽기 0회)
    if (cachedRatsList && (now - lastCacheTime < CACHE_DURATION) && !forceRefresh) {
        console.log("💾 캐시된 데이터 사용 (Firestore 읽기 절약)");
        return cachedRatsList;
    }

    // 2. 아니면 진짜로 불러옴 (읽기 발생)
    console.log("🔥 Firestore에서 데이터 로드 중...");
    const snap = await db.collection("rats").orderBy("ratId").get();

    // 결과 변수에 저장 (숨김 처리된 개체는 목록에서 제외. 데이터는 지워지지 않음)
    cachedRatsList = [];
    snap.forEach(doc => { const d = doc.data(); if (!d.archived) cachedRatsList.push(d); });
    lastCacheTime = now;

    return cachedRatsList;
}

// [추가] 데이터 변경 시 호출할 캐시 삭제 함수
function clearRatsCache() {
    cachedRatsList = null;
    lastCacheTime = 0;
    console.log("♻️ 데이터 변경 감지: 캐시가 초기화되었습니다.");
}


function getTodayStr() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const kstDate = new Date(now.getTime() - offset);
    return kstDate.toISOString().split('T')[0];
}

// 'YYYY-MM-DD'를 로컬 자정으로 파싱한다.
// new Date('2026-08-25')는 UTC 자정으로 해석되어 한국시간으로는 오전 9시가 된다.
// 그래서 이 값을 '지금'과 빼면 오전 9시 이전에는 하루가 모자라게 나온다.
function parseDateLocal(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v.toDate) return v.toDate();
    const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

// 달력 기준 일수 차이. to를 생략하면 오늘.
function daysBetween(from, to) {
    const a = parseDateLocal(from);
    const b = to ? parseDateLocal(to) : parseDateLocal(getTodayStr());
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
}

// 열린 재실 기록을 전부 닫는다. 사망·희생을 기록하는 모든 화면이 이걸 불러야
// 죽은 개체가 마리·일(animal_days)에 계속 잡혀 섭취량이 낮게 계산되는 걸 막는다.
// 비게 된 케이지는 군 배정도 풀어준다 — 안 풀면 빈 케이지가 예전 군에 묶여
// 다음 배정이 '군이 다릅니다'로 영영 차단된다.
async function closeOpenHousing(ratId, endReason) {
    try {
        const now = firebase.firestore.Timestamp.now();
        const hs = await db.collection('ratHousing')
            .where('ratId', '==', ratId).where('to', '==', null).get();
        if (hs.empty) return 0;

        const cages = new Set();
        const batch = db.batch();
        hs.forEach(d => {
            cages.add(String(d.data().cageId));
            batch.update(d.ref, { to: now, endReason: endReason || '종료' });
        });
        await batch.commit();

        for (const cid of cages) {
            const remain = await db.collection('ratHousing')
                .where('cageId', '==', cid).where('to', '==', null).get();
            if (remain.empty) {
                await db.collection('cages').doc(cid).set({ group: null, cohort: null }, { merge: true });
            }
        }
        return hs.size;
    } catch (e) {
        console.error('재실 종료 실패:', ratId, e);
        return -1;
    }
}

// [수정] 라벨 -> POD 변환 헬퍼 (최종 정석 버전)
function getPodForLabel(label, surgeryDate, recordDate) {
    // 🚨 Arrival을 여기서 빼야 합니다! 
    // Arrival을 빼면, 아래 1번 로직을 타서 개별 날짜가 달라도 무조건 '-50'이라는 하나의 위치로 묶이게 됩니다.
    const dynamicLabels = ['Surgery', 'Sacrifice', 'Death']; 
    
    // 1. Arrival이나 W1, D2 같은 정기 표준 시점은 기존처럼 예쁘게 고정 위치 사용
    if (label && globalPodMap.hasOwnProperty(label) && !dynamicLabels.includes(label)) {
        return globalPodMap[label];
    }

    // 2. 수기(Manual) 입력이거나 유동적 라벨인 경우 수술일 기준 '실제 날짜 차이(POD)' 계산
    if (surgeryDate && recordDate) {
        return Math.floor((new Date(recordDate) - new Date(surgeryDate)) / (1000 * 60 * 60 * 24));
    }

    // 3. 기록 날짜가 누락되었는데 라벨만 있는 경우 최후의 수단
    if (label && globalPodMap.hasOwnProperty(label)) {
        return globalPodMap[label];
    }

    return null; // 계산 불가
}

// ---------- 배치 ----------
// 반입 순서 번호(num)로 배치가 자동으로 갈린다. 12마리씩이면 1~12 = B1, 13~24 = B2 …
// 새 필드도 마이그레이션도 필요 없다.
//
// 코호트 14부터만 적용한다. 그 이전 코호트는 배치를 군(G1/G2…)으로 나눠 쓴 곳이 있어
// 같은 규칙을 적용하면 없는 배치가 생겨 오히려 헷갈린다.
const BATCH_FROM_COHORT = 14;

function getBatchNo(rat, batchSize) {
    if (!rat) return null;
    const c = Number(rat.cohort);
    if (!(c >= BATCH_FROM_COHORT)) return null;
    const n = Number(rat.num);
    const size = Number(batchSize) > 0 ? Number(batchSize) : 12;
    if (!(n > 0)) return null;
    return Math.ceil(n / size);
}

// 어디서나 같은 모양으로 쓰는 회색 칩. 해당 없으면 빈 문자열이라 그냥 끼워 넣으면 된다.
function batchChipHtml(rat, batchSize, opts) {
    const b = getBatchNo(rat, batchSize);
    if (!b) return '';
    const o = opts || {};
    return `<span title="Batch ${b} (반입 ${b}차)" style="display:inline-block; padding:1px 6px;
        background:#eceff1; color:#546e7a; border-radius:9px; font-size:${o.size || '0.72rem'};
        font-weight:bold; white-space:nowrap; vertical-align:middle;">B${b}</span>`;
}

function extractLegacyCod(fullStr) {
    if (!fullStr || fullStr === '미기록') return 'Unknown';
    const lower = fullStr.toLowerCase();

    // 1. 핵심 3차 원인 키워드를 '먼저' 찾아서 최우선으로 빼냅니다.
    if (lower.includes('sah') || lower.includes('subarachnoid')) return 'SAH';
    if (lower.includes('infarction')) return 'Infarction';
    if (lower.includes('vasospasm')) return 'Vasospasm';
    if (lower.includes('sacrifice')) return 'Sacrifice';
    if (lower.includes('surgical failure')) return 'Surgical Failure';

    // 2. 만약 SAH 등이 없고, 'None-neurological'이 아닌 
    // 순수 'Neurological' (수술 실패 등)만 적혀있을 경우에만 Surgical Failure로 분류
    if (lower.includes('neurological') && !lower.includes('none-neurological')) {
        return 'Surgical Failure';
    }

    return 'Unknown';
}

// [추가] 대시보드 DOM 강제 새로고침 (데이터 변경 시 빨간불 등 즉시 반영)
function invalidateDashboardDom() {
    if (typeof appTabs === 'undefined' || !Array.isArray(appTabs)) return;
    const dashTab = appTabs.find(t => t.view === 'dash');
    if (!dashTab) return;
    const viewDiv = document.getElementById('view_' + dashTab.id);
    if (!viewDiv) return;

    if (typeof activeTabId !== 'undefined' && dashTab.id === activeTabId) {
        viewDiv.innerHTML = `<div id="dash-container">로딩 중...</div>`;
        if (typeof loadDashboard === 'function') loadDashboard();
    } else {
        viewDiv.innerHTML = '';
    }
}

// ============================================================
//  구간이 주말에 걸쳤는지 · 최근 마리당 섭취량
//  케이지별 입력과 대시보드가 같은 값을 써야 '오늘 만들 원액'이 두 곳에서
//  다르게 나오지 않는다. 예전에 한쪽은 주말 구간을 넣고 한쪽은 빼서 갈렸다.
// ============================================================
function spansWeekend(startMs, endMs) {
    if (!(startMs > 0) || !(endMs > startMs)) return false;
    const d = new Date(startMs); d.setHours(0, 0, 0, 0);
    const last = new Date(endMs); last.setHours(0, 0, 0, 0);
    for (; d <= last; d.setDate(d.getDate() + 1)) {
        const w = d.getDay();
        if (w === 0 || w === 6) return true;   // 일 · 토
    }
    return false;
}

// 저장된 기록의 구간이 주말에 걸쳤는지. 구간 길이를 함께 저장해두므로 소급해서도 판정된다.
function rowSpansWeekend(row) {
    const h = Number(row.intervalHours);
    if (!(h > 0) || !row.at || !row.at.toDate) return false;
    const end = row.at.toDate().getTime();
    return spansWeekend(end - h * 3600000, end);
}

// 최근 마리당 섭취량 (mL/마리·일). 다음 회차 메트포민 농도를 정하는 기준값.
//
// 평균이 아니라 '최근에 보인 최대'를 쓴다. 아파서 덜 마시는 구간의 낮은 값에
// 농도를 맞추면, 그 쥐가 회복하는 순간 물을 정상만큼 마시면서 목표의 몇 배를
// 삼키게 된다 (파일럿에서 마리당 25 mL 에 맞춘 농도로 73.9 mL 를 마시면 3배였다).
// 최대값을 쓰면 이런 일이 없다.
//  · 정상적으로 크는 동안에는 최근 값이 곧 최대라 사실상 최근값과 같다
//  · 아플 때만 하한처럼 작동해 농도가 올라가지 않게 막는다
//  · 덜 마시는 동안에는 약도 덜 들어간다. 목표를 넘기는 것보다 낫다
// 잘못 잰 큰 값이 섞였으면 그 구간에 「이상」을 체크해 빼면 된다.
//
//  · 이상 플래그가 붙은 구간은 뺀다
//  · 주말이 낀 구간은 밤낮 비중이 달라 마리당 값이 왜곡되므로 기본에서 뺀다
function recentWaterPc(rows, opts) {
    const clean = (rows || []).filter(r => !(r.flags || []).length
        && typeof r.waterPerCapita === 'number' && r.waterPerCapita > 0);
    const list = (opts && opts.includeWeekend) ? clean : clean.filter(r => !rowSpansWeekend(r));
    return list.length ? Math.max(...list.map(r => r.waterPerCapita)) : null;
}

// 채울 수 있는 물의 양 후보. 평일 구간과 긴 구간(주말·연휴 앞)의 두 가지다.
// 앱은 달력을 모르므로 어느 쪽인지 추측하지 않는다. 조제 카드에 둘 다 적어두고
// 물을 채우는 사람이 고른다. (요일로 판정하면 연휴가 낀 주에 틀린다)
function fillOptions(housing) {
    const h = housing || {};
    const v = [Number(h.waterFill) || 0, Number(h.waterFillLong) || 0].filter(x => x > 0);
    return [...new Set(v)].sort((a, b) => a - b);
}

// 30% 여유를 얹고 1 mL 단위로 올린다. 최소 5 mL.
// 10 mL 단위로 올리던 때가 있었는데, 원액을 100 mg/mL 로 올리고 나니
// 그 한 칸이 가루 1 g 이라 소량을 만들 때 두 배 넘게 만들게 됐다.
function makeVolume(needCc) {
    return Math.max(5, Math.ceil(needCc * 1.3));
}
