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
let pptSlides = [];
let currentPptIndex = 0;
let pptChart = null;
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
    "Arrival": -5,   // 반입 (Induction 훨씬 전)
    "D00": -1,       // Baseline (수술 직전)
    "D0": 0,         // 수술 당일 (기준점 0)
    "D2": 2          // 2일차
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

    // 결과 변수에 저장
    cachedRatsList = [];
    snap.forEach(doc => cachedRatsList.push(doc.data()));
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

// [2] 헬퍼 함수: 라벨 -> POD(숫자) 변환
// 그래프 그릴 때 이 함수를 통해 X축 좌표를 계산합니다.
// [수정] 라벨 -> POD 변환 헬퍼 (사용자 선택 라벨 절대 우선)
function getPodForLabel(label, surgeryDate, recordDate) {
    // 1. [절대 우선] 사용자가 선택한 시점(Label)이 표준 맵에 있으면 무조건 그 위치 사용
    // 예: 실제론 9일차에 쟀어도 "W1"이라고 입력했으면 x=7 위치로 강제 고정
    if (label && globalPodMap.hasOwnProperty(label)) {
        return globalPodMap[label];
    }

    // 2. 표준 시점이 아닌 경우(Manual 입력 등)에만 실제 날짜 차이 계산
    if (surgeryDate && recordDate) {
        return Math.floor((new Date(recordDate) - new Date(surgeryDate)) / (1000 * 60 * 60 * 24));
    }

    return null; // 계산 불가
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
