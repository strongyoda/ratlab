// ==========================================
// 🚀 브라우저 스타일 탭 시스템 (Tab System)
// ==========================================
let appTabs = [];
let activeTabId = null;
let tabCounter = 0;

function initTabs() {
    if(appTabs.length === 0) createNewTab('dash');
}

function createNewTab(view = 'blank') {
    // 이미 띄워져 있는 메뉴를 새 탭으로 열려고 시도하면, 그 탭으로 포커스만 이동 (중복 방지)
    if (view !== 'blank') {
        const existing = appTabs.find(t => t.view === view);
        if (existing) {
            switchTab(existing.id);
            return;
        }
    }

    tabCounter++;
    const tId = 'tab_' + tabCounter;
    
    // 빈 탭이면 제목을 '새 탭'으로 설정
    const title = view === 'blank' ? '새 탭' : getTitleForView(view);
    appTabs.push({ id: tId, view: view, title: title });
    
    const container = document.getElementById('tab-views-container');
    const viewDiv = document.createElement('div');
    viewDiv.id = 'view_' + tId;
    viewDiv.className = 'tab-view-content';
    viewDiv.style.display = 'none';
    viewDiv.style.width = '100%';
    viewDiv.style.minHeight = '100%';
    viewDiv.style.padding = '20px';
    viewDiv.style.boxSizing = 'border-box';
    
    // 👇 빈 탭일 경우 예쁜 안내 문구 표시
    if (view === 'blank') {
        viewDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; height:80vh; align-items:center; justify-content:center; color:#999;">
                <i class="material-icons" style="font-size:4rem; margin-bottom:15px; color:#ccc;">touch_app</i>
                <h2 style="margin:0 0 10px 0; color:#666;">새 탭이 열렸습니다</h2>
                <p style="margin:0;">왼쪽(MENU) 메뉴에서 원하시는 작업을 선택해 주세요.</p>
            </div>`;
    }
    
    container.appendChild(viewDiv);
    
    renderTabs();
    switchTab(tId);
}

function renderTabs() {
    const tc = document.getElementById('app-tabs-container');
    tc.innerHTML = '';
    appTabs.forEach(t => {
        const isActive = (t.id === activeTabId);
        const tabEl = document.createElement('div');
        tabEl.style.cssText = `
            padding: 8px 15px; 
            background: ${isActive ? '#f4f6f8' : '#d5d9e0'}; 
            color: ${isActive ? 'var(--navy)' : '#555'}; 
            border-radius: 8px 8px 0 0; 
            font-size: 0.9rem; 
            font-weight: ${isActive ? 'bold' : 'normal'};
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            gap: 8px;
            border: 1px solid ${isActive ? '#ccc' : 'transparent'};
            border-bottom: none;
            white-space: nowrap;
            box-shadow: ${isActive ? '0 -2px 5px rgba(0,0,0,0.05)' : 'none'};
            margin-top: ${isActive ? '0' : '4px'};
            transition: 0.2s;
        `;
        tabEl.innerHTML = `
            <span onclick="switchTab('${t.id}')" style="flex:1;">${t.title}</span>
            ${appTabs.length > 1 ? `<span onclick="closeTab('${t.id}', event)" style="color:#d32f2f; font-weight:bold; font-size:1.2rem; line-height:1; margin-left:5px; padding:0 3px;">&times;</span>` : ''}
        `;
        tc.appendChild(tabEl);
    });
}

function switchTab(tId) {
    activeTabId = tId;
    document.querySelectorAll('.tab-view-content').forEach(el => el.style.display = 'none');
    
    const targetView = document.getElementById('view_' + tId);
    if(targetView) targetView.style.display = 'block';
    
    renderTabs();
    
    // 내용이 비어있으면 초기 로드
    const tab = appTabs.find(t => t.id === tId);
    if (targetView && targetView.innerHTML.trim() === '') {
        go(tab.view, null, tId);
    }
}

function closeTab(tId, event) {
    if(event) event.stopPropagation();
    if(appTabs.length <= 1) return; 
    
    const idx = appTabs.findIndex(t => t.id === tId);
    appTabs.splice(idx, 1);
    
    const viewDiv = document.getElementById('view_' + tId);
    if(viewDiv) viewDiv.remove();
    
    if(activeTabId === tId) {
        const nextTab = appTabs[Math.max(0, idx - 1)];
        switchTab(nextTab.id);
    } else {
        renderTabs();
    }
}

function getTitleForView(view) {
    const map = { 'dash':'대시보드', 'detail':'랫드 상세', 'cohort':'코호트 분석', 'compare':'코호트 비교', 'trend':'조건분석', 'daily':'데일리', 'add':'신규등록', 'dose':'투약', 'rec':'혈압/체중', 'bp':'BP계산기', 'admin':'데이터관리' };
    return map[view] || '새 탭';
}
// ==========================================

async function login() {
    const id = document.getElementById('uid').value.trim();
    const pw = document.getElementById('upw').value;

    try {
        await firebase.auth().signInWithEmailAndPassword(id, pw);

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        // 로그인 성공 시 챗봇 플로팅 버튼 보이기
        const aiFab = document.getElementById('ai-chat-fab');
        if(aiFab) aiFab.style.display = 'block';
        setTimeout(() => initTabs(), 50); 
    } catch (e) {
        console.error(e);
        alert('로그인 실패: ' + (e && e.message ? e.message : e));
    }
}

async function logout() {
    try {
        await firebase.auth().signOut();
        // 로그아웃 시 챗봇 플로팅 버튼 숨기기 및 채팅창 닫기
        const aiFab = document.getElementById('ai-chat-fab');
        const aiWindow = document.getElementById('ai-chat-window');
        if(aiFab) aiFab.style.display = 'none';
        if(aiWindow) aiWindow.style.display = 'none';
        location.reload();
    } catch (e) {
        console.error(e);
        alert('로그아웃 실패: ' + (e && e.message ? e.message : e));
    }
}

async function go(view, targetId = null, specificTabId = null) {
    // 🚨 1. 중복 탭 방지 로직 (이미 열린 메뉴를 누르면 거기로 점프)
    if (!specificTabId) {
        const existingTab = appTabs.find(t => t.view === view);
        if (existingTab) {
            // 이미 띄워진 탭이 있다면 포커스만 이동시키고 렌더링을 멈춤
            if (activeTabId !== existingTab.id) {
                switchTab(existingTab.id);
            }
            if(document.getElementById('sidebar').classList.contains('open')) toggleMenu();
            return; 
        }
    }

    // 🚨 2. 기존 화면(현재 탭) 내용 교체 (새로운 메뉴일 경우)
    const tId = specificTabId || activeTabId;
    if (!tId) return;
    const main = document.getElementById('view_' + tId);
    if (!main) return;
    
    // 탭 정보 업데이트
    const tabObj = appTabs.find(t => t.id === tId);
    if(tabObj) {
        tabObj.view = view;
        tabObj.title = getTitleForView(view);
        renderTabs();
    }

    if(document.getElementById('sidebar').classList.contains('open')) toggleMenu();

    // 🎯 가로 공간 제한 해제 (화면 전체 100% 사용)
    main.style.maxWidth = '100%';
    main.style.margin = '0';

    // 1. Condition Analysis (조건 분석 다중 필터 & 교차 비교 적용)
    if (view === 'trend') {
        // A와 B 탭의 HTML을 반복해서 쓰지 않도록 찍어내는 템플릿 함수
        const buildFilterUI = (grp) => `
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 10px;">
                <div class="filter-box inc">
                    <h5 class="filter-title">✅ Group ${grp.toUpperCase()} 포함 기준 (Target)</h5>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="inc-use-wt-${grp}" onchange="toggleTrendInputs('${grp}')"> 체중</label>
                        <div class="filter-controls">
                            <select id="inc-wt-tp-${grp}" disabled><option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option><option value="W1">W1</option><option value="W2">W2</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                            <input type="number" id="inc-wt-val-${grp}" placeholder="기준값" disabled style="width:80px;">
                            <select id="inc-wt-dir-${grp}" disabled style="font-weight:bold;"><option value="up">이상</option><option value="down">미만</option></select>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="inc-use-pod-${grp}" onchange="toggleTrendInputs('${grp}')"> 생존기간</label>
                        <div class="filter-controls">
                            <input type="number" id="inc-pod-val-${grp}" placeholder="기준일" disabled style="width:80px;">
                            <select id="inc-pod-dir-${grp}" disabled style="font-weight:bold;"><option value="up">이상</option><option value="down">미만</option></select>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="inc-use-cod-${grp}" onchange="toggleTrendInputs('${grp}')"> 사망원인</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="inc-cod-area-${grp}" style="display:none; padding-top:4px;">
                                <button type="button" class="btn-small btn-blue" onclick="loadTrendCodList()">사망원인 로드</button>
                                <div id="trend-cod-list-inc-${grp}" style="margin-top:10px; width:100%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="inc-use-are-${grp}" onchange="toggleTrendInputs('${grp}')"> ARE 발생</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="inc-are-area-${grp}" class="filter-controls" style="display:none; padding-top:4px;">
                                <label class="chk-label"><input type="checkbox" class="inc-are-chk-${grp}" value="micro"> Micro</label>
                                <label class="chk-label"><input type="checkbox" class="inc-are-chk-${grp}" value="macro"> Macro</label>
                                <label class="chk-label"><input type="checkbox" class="inc-are-chk-${grp}" value="미확인"> 미확인</label>
                            </div>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="inc-use-inf-${grp}" onchange="toggleTrendInputs('${grp}')"> 뇌경색</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="inc-inf-area-${grp}" class="filter-controls" style="display:none; padding-top:4px;">
                                <select id="inc-inf-tp-${grp}"><option value="all">시점 전체</option><option value="D2">D2</option><option value="W1">W1</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                                <select id="inc-inf-sz-${grp}"><option value="all">크기 전체(있음)</option><option value="Small">Small</option><option value="Large">Large</option><option value="None">없음(None)</option></select>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="filter-box exc">
                    <h5 class="filter-title">❌ Group ${grp.toUpperCase()} 제외 기준 (배제)</h5>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="exc-use-wt-${grp}" onchange="toggleTrendInputs('${grp}')"> 체중</label>
                        <div class="filter-controls">
                            <select id="exc-wt-tp-${grp}" disabled><option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option><option value="W1">W1</option><option value="W2">W2</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                            <input type="number" id="exc-wt-val-${grp}" placeholder="기준값" disabled style="width:80px;">
                            <select id="exc-wt-dir-${grp}" disabled style="font-weight:bold;"><option value="up">이상</option><option value="down">미만</option></select>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="exc-use-pod-${grp}" onchange="toggleTrendInputs('${grp}')"> 생존기간</label>
                        <div class="filter-controls">
                            <input type="number" id="exc-pod-val-${grp}" placeholder="기준일" disabled style="width:80px;">
                            <select id="exc-pod-dir-${grp}" disabled style="font-weight:bold;"><option value="up">이상</option><option value="down">미만</option></select>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="exc-use-cod-${grp}" onchange="toggleTrendInputs('${grp}')"> 사망원인</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="exc-cod-area-${grp}" style="display:none; padding-top:4px;">
                                <button type="button" class="btn-small btn-red" onclick="loadTrendCodList()">사망원인 로드</button>
                                <div id="trend-cod-list-exc-${grp}" style="margin-top:10px; width:100%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="exc-use-are-${grp}" onchange="toggleTrendInputs('${grp}')"> ARE 발생</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="exc-are-area-${grp}" class="filter-controls" style="display:none; padding-top:4px;">
                                <label class="chk-label"><input type="checkbox" class="exc-are-chk-${grp}" value="micro"> Micro</label>
                                <label class="chk-label"><input type="checkbox" class="exc-are-chk-${grp}" value="macro"> Macro</label>
                                <label class="chk-label"><input type="checkbox" class="exc-are-chk-${grp}" value="미확인"> 미확인</label>
                            </div>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label class="filter-label"><input type="checkbox" id="exc-use-inf-${grp}" onchange="toggleTrendInputs('${grp}')"> 뇌경색</label>
                        <div style="flex:1; min-width:180px;">
                            <div id="exc-inf-area-${grp}" class="filter-controls" style="display:none; padding-top:4px;">
                                <select id="exc-inf-tp-${grp}"><option value="all">시점 전체</option><option value="D2">D2</option><option value="W1">W1</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                                <select id="exc-inf-sz-${grp}"><option value="all">크기 전체(있음)</option><option value="Small">Small</option><option value="Large">Large</option><option value="None">없음(None)</option></select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        main.innerHTML = `
        <div class="card">
            <h3 style="margin-bottom:20px;">🔬 조건 분석 (다중 복합 필터)</h3>
            <div class="trend-opt-box">
                <div style="font-weight:bold; color:var(--navy); margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">1. 코호트 선택</div>
                <div id="trend-cohort-list" style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:15px;">로딩 중...</div>
            </div>
            
            <div class="trend-opt-box" style="padding-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;">
                    <div style="font-weight:bold; color:var(--navy); font-size:1.1rem;">2. 분류 기준 설정</div>
                    
                    <div style="display:flex; gap:20px; background:#f4f6f8; padding:8px 15px; border-radius:30px;">
                        <label style="font-weight:bold; cursor:pointer; color:#1565C0;">
                            <input type="radio" name="trend-mode" value="single" checked onchange="switchTrendMode()" style="transform:scale(1.2); margin-right:5px;"> 단일 조건 (A vs 나머지)
                        </label>
                        <label style="font-weight:bold; cursor:pointer; color:#2e7d32;">
                            <input type="radio" name="trend-mode" value="cross" onchange="switchTrendMode()" style="transform:scale(1.2); margin-right:5px;"> 교차 비교 (A vs B)
                        </label>
                    </div>
                </div>

                <div id="cross-mode-warning" style="display:none; color:#c62828; font-weight:bold; font-size:0.9rem; margin-bottom:15px; background:#ffebee; padding:10px 15px; border-radius:6px; border:1px solid #ffcdd2; align-items:center; gap:8px;">
                    <i class="material-icons" style="font-size:1.2rem;">info</i> 
                    <span>조건은 서로 겹치지 않게(배타적으로) 설정해 주세요. 양쪽 조건에 모두 해당되는 개체는 <b>Group A에 우선 배정</b>됩니다.</span>
                </div>
                
                <div id="trend-tabs" style="display:flex; gap:10px; margin-bottom: 20px;">
                    <button id="trend-tab-btn-a" onclick="switchTrendTab('a')" style="flex:1; padding:12px; font-size:1.1rem; font-weight:bold; border:2px solid #1565C0; background:#e3f2fd; color:#1565C0; border-radius:8px; cursor:pointer; transition:0.2s;">🟨 Group A 조건 세팅</button>
                    <button id="trend-tab-btn-b" onclick="switchTrendTab('b')" style="flex:1; padding:12px; font-size:1.1rem; font-weight:bold; border:2px solid #ccc; background:#f0f0f0; color:#888; border-radius:8px; cursor:pointer; transition:0.2s; display:none;">🟩 Group B 조건 세팅</button>
                </div>

                <div id="trend-panel-a">
                    ${buildFilterUI('a')}
                </div>
                <div id="trend-panel-b" style="display:none;">
                    ${buildFilterUI('b')}
                </div>
            </div>
            
            <button class="btn btn-blue" onclick="analyzeTrend()" style="font-size:1.2rem; padding:15px; width:100%; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.1);">🚀 설정된 조건으로 분석 시작</button>
        </div>
        <div id="trend-res-area" class="trend-container"></div>`;
        renderCohortCheckboxes('trend-cohort-list');
        return;
    }

    // 2. Admin (데이터 관리)
    if(view === 'admin') {
        const pw = prompt("관리자 비밀번호를 입력하세요");
        if(pw !== '1234') { alert("비밀번호 오류"); return; }
        main.innerHTML = `
        <div class="card">
            <h3>🛠 데이터 관리</h3>

            <div style="text-align:right; margin-bottom:10px;">
                <button id="btn-backup" class="btn btn-green btn-small" style="width:auto; background:#2c3e50;" onclick="backupAllData()">💾 전체 데이터 백업(JSON)</button>
            </div>

            <div class="tab-container">
                <div id="adm-del" class="tab active" onclick="admTab('del')">데이터 삭제</div>
                <div id="adm-edit" class="tab" onclick="admTab('edit')">데이터 수정</div>
                <div id="adm-logs" class="tab" onclick="admTab('logs')">로그 삭제</div>
                <div id="adm-up" class="tab" onclick="admTab('up')">업로드(CSV)</div>
                <div id="adm-ai" class="tab" onclick="admTab('ai')" style="background:#f3e5f5; color:#6a1b9a; font-weight:bold; border-bottom:3px solid #6a1b9a;">🤖 AI 논문 추출</div>
            </div>
            
            <div id="tab-del">
                <div class="input-group">
                    <label>개별 랫드 삭제 (ID)</label>
                    <div style="display:flex; gap:10px;"><input type="text" id="del-id" placeholder="C1101"><button class="btn btn-red btn-small" onclick="deleteRat()">삭제</button></div>
                </div>
                <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
                <div class="input-group">
                    <label>코호트 전체 삭제 (Cohort No)</label>
                    <div style="display:flex; gap:10px;"><input type="number" id="del-cohort" placeholder="11"><button class="btn btn-red btn-small" onclick="deleteCohort()">전체 삭제</button></div>
                </div>
            </div>
            
            <div id="tab-edit" style="display:none;">
                <div class="input-group">
                    <label>랫드 ID 검색 (전체 데이터 수정)</label>
                    <div style="display:flex; gap:10px;"><input type="text" id="edit-id" placeholder="C1101"><button class="btn btn-blue btn-small" onclick="searchForEdit()">검색</button></div>
                </div>
                <div id="edit-result"></div>
            </div>
            
            <div id="tab-logs" style="display:none;">
                <div class="input-group">
                    <label>랫드 ID 검색 (로그 불러오기)</label>
                    <div style="display:flex; gap:10px;"><input type="text" id="log-rat-id" placeholder="C1101"><button class="btn btn-blue btn-small" onclick="searchLogsDel()">로그 조회</button></div>
                </div>
                <div id="log-del-result" style="margin-top:15px;"></div>
            </div>

            <div id="tab-up" style="display:none;">
                <div style="background:#fff3e0; padding:15px; border-radius:8px; border:1px solid #ffcc80; margin-bottom:15px; font-size:0.9rem; line-height:1.5;">
                    <b>🚨 엑셀 업로드 주의사항</b><br>
                    1. 엑셀 첫 줄 헤더 명칭을 정확히 일치시켜주세요. (Rat_ID 필수)<br>
                    2. 날짜는 YYYY-MM-DD (예: 2026-02-23) 형식으로 적어주세요.<br>
                    3. 메모 란에는 절대 <b>쉼표(,)</b>를 쓰지 마세요. 열려있는 파일 형식 문제로 에러가 납니다.<br>
                    4. 파일을 반드시 <b>[CSV UTF-8 (쉼표로 분리)]</b> 형식으로 저장 후 올려주세요.
                </div>
                <div class="input-group">
                    <label>CSV 파일 선택</label>
                    <input type="file" id="csv-upload-input" accept=".csv" onchange="parseRatUploadCSV(event)" style="border:2px dashed var(--navy); padding:15px; background:#f8f9fa;">
                </div>
                <div id="csv-preview-area" style="margin-top:15px; max-height: 400px; overflow-y:auto; font-size:0.85rem;"></div>
                <button id="btn-save-csv" class="btn btn-green" style="margin-top:15px; display:none; width:100%; font-size:1.1rem; padding:12px;" onclick="saveCsvToDB()">🚀 검토 완료: 데이터베이스에 덮어쓰기</button>
            </div>

            <div id="tab-ai" style="display:none;">
                <div style="background:#f3e5f5; padding:15px; border-radius:8px; border:1px solid #ce93d8; margin-bottom:15px; font-size:0.95rem; line-height:1.5; color:#4a148c;">
                    <b>🧠 AI 딥러닝 & 논문 초안 작성용 데이터 추출기</b><br>
                    - 코호트 조건(메모), 개체별 타임라인(수술/사망/MR/샘플 채취일), 혈압/체중 변화, ARE 발생 여부가 AI가 읽기 가장 좋은 형태로 정리됩니다.<br>
                    - 추출된 텍스트 파일을 <b>Gemini, ChatGPT, Claude</b>에 업로드하고 논문 주제나 초안 작성을 지시하세요.
                </div>
                
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button id="btn-extract-ai" class="btn" style="background:#8e24aa; color:white; font-size:1.1rem; padding:15px;" onclick="exportForAI()">📄 AI 프롬프트용 텍스트 데이터 추출 및 다운로드</button>
                </div>
                <div id="ai-extract-status" style="margin-top:15px; font-weight:bold; color:var(--navy); text-align:center;"></div>
            </div>

        </div>`;
        return;
    }


    // 3. Cohort Analysis (코호트 분석)
    if(view === 'cohort') {
        main.innerHTML = `
        <div class="card">
            <h3>📊 코호트 분석 (통합 보기)</h3>
            <div id="co-check-list" style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:15px; padding:15px; background:#f8f9fa; border-radius:8px; border:1px solid #eee; max-height:150px; overflow-y:auto;">로딩 중...</div>

            <button class="btn btn-blue" onclick="loadCohortDetail()">분석 시작</button>
        </div>
        <div id="cohort-res"></div>`;
        await renderCohortCheckboxes('co-check-list');
        return;
    }
    
    // 4. Cohort Compare (코호트 비교)
    if (view === 'compare') {
        main.innerHTML = `
        <div class="card">
            <h3>🔄 코호트 비교</h3>
            <div class="tab-container">
                <div id="cp-tab-ind" class="tab active" onclick="switchCompTab('ind')">개별 비교</div>
                <div id="cp-tab-grp" class="tab" onclick="switchCompTab('grp')">그룹 비교</div>
            </div>
            <div id="cp-ui-ind">
                <div id="comp-check-list" style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:15px; padding:15px; background:#f8f9fa; border-radius:8px; border:1px solid #eee; max-height:150px; overflow-y:auto;">로딩 중...</div>

                <button class="btn btn-blue" onclick="loadCohortComparison()">개별 비교 시작</button>
            </div>
            <div id="cp-ui-grp" style="display:none;">
                <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:200px; border:1px solid #ddd; padding:10px; border-radius:8px; background:#f8f9fa;">
                        <div style="font-weight:bold; color:var(--navy); border-bottom:1px solid #ddd; margin-bottom:5px; padding-bottom:5px;">Group A</div>
                        <div id="grp-list-a" style="max-height:150px; overflow-y:auto;"></div>
                    </div>
                    <div style="flex:1; min-width:200px; border:1px solid #ddd; padding:10px; border-radius:8px; background:#f8f9fa;">
                        <div style="font-weight:bold; color:var(--navy); border-bottom:1px solid #ddd; margin-bottom:5px; padding-bottom:5px;">Group B</div>
                        <div id="grp-list-b" style="max-height:150px; overflow-y:auto;"></div>
                    </div>
                    <div style="flex:1; min-width:200px; border:1px solid #ddd; padding:10px; border-radius:8px; background:#f8f9fa;">
                        <div style="font-weight:bold; color:var(--navy); border-bottom:1px solid #ddd; margin-bottom:5px; padding-bottom:5px;">Group C (Optional)</div>
                        <div id="grp-list-c" style="max-height:150px; overflow-y:auto;"></div>
                    </div>
                </div>

                <button class="btn btn-blue" onclick="loadGroupComparison()">그룹 비교 시작</button>
            </div>
        </div>
        <div id="comp-res-area" class="comp-grid"></div>`;
        await renderCohortCheckboxes('comp-check-list');
        await renderGroupSelectors();
        return;
    }

    // 5. Other Views
    if(view === 'dash') { main.innerHTML = `<div id="dash-container">로딩 중...</div>`; loadDashboard(); }
    else if(view === 'detail') { 
        main.innerHTML = `
        <div class="card">
            <h3>랫드 상세</h3>
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label style="font-size:0.85rem; font-weight:bold; color:var(--navy);">코호트 선택</label>
                    <select id="dt-cohort-sel" onchange="updateRatList()" style="width:100%; padding:10px;">
                        <option value="">로딩 중...</option>
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.85rem; font-weight:bold; color:var(--navy);">번호(ID) 선택</label>
                    <select id="dt-rat-sel" onchange="loadDetailData()" style="width:100%; padding:10px;">
                        <option value="">-</option>
                    </select>
                </div>
            </div>
        </div>
        <div id="detail-view"></div>`; 
        await initDetailSelectors(targetId);
    }
else if(view === 'daily') {
        currentScores = { act: 0, fur: 0, eye: 0 };
        main.innerHTML = `
            <div class="card" style="padding: 15px;">
                <h3 style="margin-bottom:20px; color:var(--navy);">상태 & 체중 통합 기록</h3>
                
                <div style="background:#f8f9fa; padding:15px; border-radius:10px; margin-bottom:15px; display:inline-flex; gap:12px; flex-wrap:wrap; border:1px solid #eee; align-items:center;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="number" id="dc-c" placeholder="코호트" oninput="mkId('dc')" style="width:80px; padding:8px; border-radius:6px; border:1px solid #ccc; text-align:center; outline:none;">
                        <input type="number" id="dc-r" placeholder="번호" oninput="mkId('dc')" style="width:80px; padding:8px; border-radius:6px; border:1px solid #ccc; text-align:center; outline:none;">
                        <select id="dc-g" onchange="mkId('dc')" style="width:65px; padding:8px 4px; border-radius:6px; border:1px solid #ccc; outline:none; cursor:pointer;">
                            <option value="1">G1</option><option value="2">G2</option><option value="3">G3</option>
                            <option value="4">G4</option><option value="5">G5</option>
                        </select>
                    </div>
                    <input type="text" id="dc-id" readonly placeholder="ID 결과" style="width:130px; padding:8px; background:#e9ecef; border:1px solid #ddd; border-radius:6px; text-align:center; font-weight:bold; color:var(--navy);">
                    <input type="date" id="dc-date" style="width:150px; padding:8px; border-radius:6px; border:1px solid #ccc; outline:none; cursor:pointer;">
                </div>

                <div class="combined-record-container" style="display:flex; gap:15px;">
                    <div style="flex:1; padding:15px; border:1px solid #eee; border-radius:10px; background:#fff;">
                        <h4 style="margin-top:0;"><i class="material-icons" style="font-size:18px; vertical-align:middle;">assignment</i> 상태 (Daily)</h4>
                        ${['act','fur','eye'].map(k => `
                        <div class="input-group">
                            <label style="font-size:0.8rem;">${k.toUpperCase()}</label>
                            <div class="rating-box">${[1,2,3,4,5].map(n => `<button class="rate-btn" onclick="score('${k}', ${n}, this)">${n}</button>`).join('')}</div>
                        </div>`).join('')}
                        <div id="score-res" class="status-box">선택 필요</div>
                        <textarea id="dc-note" rows="2" placeholder="메모" style="width:100%; margin-top:10px;"></textarea>
                        <div style="margin-top:10px;"><input type="checkbox" id="is-dead" style="width:auto;"> <label style="display:inline; color:var(--red);">사망 시 체크</label></div>
                    </div>

                    <div style="flex:1; padding:15px; border:1px solid #e3f2fd; border-radius:10px; background:#f1f8ff;">
                        <h4 style="margin-top:0; color:#1565c0;"><i class="material-icons" style="font-size:18px; vertical-align:middle;">monitor_weight</i> 체중 (Weight)</h4>
                        <div class="input-group">
                            <label>시점 선택</label>
                            <select id="dc-tp" style="width:100%; padding:10px; border-radius:6px; border:1px solid #bbdefb;">
                                <option value="Manual">Manual (수기 입력)</option>
                                <option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option>
                                <option value="W1">W1</option><option value="W2">W2</option><option value="W4">W4</option>
                                <option value="W8">W8</option><option value="W12">W12</option>
                            </select>
                        </div>
                        <div class="input-group" style="margin-top:15px;">
                            <label>체중 (g)</label>
                            <input type="number" id="dc-wt" placeholder="체중 입력" style="width:100%; padding:10px; border:1px solid #bbdefb;">
                        </div>
                    </div>
                </div>

                <button class="btn btn-green" onclick="saveDaily()" style="margin-top:20px; width:100%; height:50px; font-size:1.1rem;">데이터 통합 저장</button>
            </div>
        `;
        document.getElementById('dc-date').value = getTodayStr();
    }
    else if(view === 'add') { 
        main.innerHTML = `<div class="card"><h3>대량 등록</h3><div style="display:flex; gap:10px; margin-bottom:10px;"><div class="input-group" style="flex:1;"><label>코호트</label><input type="number" id="add-c"></div><div class="input-group" style="flex:1;"><label>그룹</label><select id="add-g" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;"><option value="1">G1</option><option value="2">G2</option><option value="3">G3</option><option value="4">G4</option><option value="5">G5</option></select></div></div><div style="display:flex; gap:10px;"><input type="number" id="add-s" placeholder="시작번호"><input type="number" id="add-e" placeholder="끝번호"></div><div class="input-group" style="margin-top:10px;"><label>반입일</label><input type="date" id="add-d"></div><button class="btn btn-green" onclick="saveBulk()">등록</button></div>`; 
        document.getElementById('add-d').value = getTodayStr(); 
    }
    else if(view === 'dose') { 
        main.innerHTML = `<div class="card"><h3>투약 계산기</h3><div style="display:flex; gap:10px; margin-bottom:10px;"><input type="number" id="ds-c" placeholder="코호트" oninput="upDose()" style="flex:1;"><select id="ds-g" onchange="upDose()" style="padding:5px; border-radius:4px; border:1px solid #ccc;"><option value="1">G1</option><option value="2">G2</option><option value="3">G3</option><option value="4">G4</option><option value="5">G5</option></select></div><table><thead><tr><th>번</th><th>WT(g)</th><th>ID</th></tr></thead><tbody>${Array.from({length:12},(_,i)=>`<tr><td><input type="number" class="dn" oninput="upDose()"></td><td><input type="number" class="dw"></td><td class="di">-</td></tr>`).join('')}</tbody></table><button class="btn btn-blue" onclick="saveDose()" style="margin-top:15px;">계산 및 저장</button><div id="dose-res" style="display:none;"></div></div>`; 
    }
    else if(view === 'rec') { 
        let timeOpts = `<option>Manual</option><option>Arrival</option><option>D00</option><option>D0</option><option>D2</option>`;
        for(let i=1; i<=30; i++) { timeOpts += `<option>W${i}</option>`; }
        main.innerHTML = `
        <div class="card">
            <h3>혈압/체중 기록</h3>
            <div style="display:flex; gap:10px;">
                <input type="number" id="re-c" placeholder="C" oninput="mkId('re')">
                <input type="number" id="re-r" placeholder="N" oninput="mkId('re')">
                <select id="re-g" onchange="mkId('re')" style="padding:5px; border-radius:4px; border:1px solid #ccc;"><option value="1">G1</option><option value="2">G2</option><option value="3">G3</option><option value="4">G4</option><option value="5">G5</option></select>
            </div>
            <input type="text" id="re-id" readonly style="background:#eee; margin:10px 0;">
            <label style="font-size:0.8rem; font-weight:bold; color:var(--navy);">시점 선택</label>
            <select id="re-tp" style="margin-bottom:10px;">${timeOpts}</select>
            <input type="date" id="re-date" style="margin-top:5px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <input type="number" id="re-s" placeholder="SBP" oninput="calM()">
                <input type="number" id="re-d" placeholder="DBP" oninput="calM()">
            </div>
            <input type="number" id="re-m" placeholder="Mean" readonly style="background:#eee; margin-top:10px;">
            <input type="number" id="re-w" placeholder="WT(g)" step="0.1" style="margin-top:10px;">
            <button class="btn btn-green" onclick="saveRec()" style="margin-top:15px;">저장</button>
        </div>`; 
        document.getElementById('re-date').value = getTodayStr(); 
    }
    else if(view === 'bp') { 
        main.innerHTML = `<div class="card"><h3>BP Analyzer (PC Ver.)</h3><div class="bp-controls" style="background:#f8f9fa; padding:15px; border-radius:8px; border:1px solid #eee;"><label><input type="radio" name="bp-mode" value="control" checked> Control</label><label style="margin-left:20px;"><input type="radio" name="bp-mode" value="induction"> Induction</label><br><input type="file" id="bp-file-input" accept=".csv" multiple style="margin-top:15px; width:100%; border:2px dashed #cbd5e0; padding:10px; box-sizing:border-box;"></div><div id="bp-output" style="margin-top:20px;"></div></div>`; 
        document.getElementById('bp-file-input').addEventListener('change', loadBPFiles); 
    }
}


function toggleMenu() {
    const nav = document.getElementById('sidebar');
    const ol = document.getElementById('overlay');
    nav.classList.toggle('open');
    ol.style.display = nav.classList.contains('open') ? 'block' : 'none';
}

// 간단한 토글 헬퍼 함수 (script 태그 내 아무데나 추가해주세요)
function toggleDisplay(id) {
    const el = document.getElementById(id);
    if(el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}


function toggleDetails(detailId, btnId) {
    const el = document.getElementById(detailId);
    const btn = document.getElementById(btnId);
    if(el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerText = '▲ 상세 데이터 접기';
        btn.classList.replace('btn-blue', 'btn-red');
    } else {
        el.style.display = 'none';
        btn.innerText = '▼ 상세 데이터 보기 (Detail)';
        btn.classList.replace('btn-red', 'btn-blue');
    }
}

function admTab(mode) {
    // 1. 모든 탭 버튼의 활성화(active) 상태 해제
    document.querySelectorAll('.tab-container .tab').forEach(t => t.classList.remove('active'));
    
    // 2. 클릭한 탭 버튼만 활성화
    const btn = document.getElementById('adm-' + mode);
    if(btn) btn.classList.add('active');
    
    // 3. 내용 화면 숨기기/보이기 제어 (여기에 'up', 'ai'가 추가되어야 겹치지 않습니다)
    ['del', 'edit', 'logs', 'up', 'ai'].forEach(m => {
        const el = document.getElementById('tab-' + m);
        if(el) {
            el.style.display = (m === mode) ? 'block' : 'none';
        }
    });
}


// --- Group Comparison Helpers ---
function switchCompTab(mode) {
    document.getElementById('cp-tab-ind').className = mode==='ind' ? 'tab active' : 'tab';
    document.getElementById('cp-tab-grp').className = mode==='grp' ? 'tab active' : 'tab';
    document.getElementById('cp-ui-ind').style.display = mode==='ind' ? 'block' : 'none';
    document.getElementById('cp-ui-grp').style.display = mode==='grp' ? 'block' : 'none';
}


function toggleDailyLog() { const t = document.getElementById('daily-detail-table'); t.style.display = t.style.display === 'none' ? 'block' : 'none'; }
function toggleBpLog() { const t = document.getElementById('bp-detail-table'); t.style.display = t.style.display === 'none' ? 'block' : 'none'; }// JavaScript source code