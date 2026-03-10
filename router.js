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
        setTimeout(() => initTabs(), 50); 
    } catch (e) {
        console.error(e);
        alert('로그인 실패: ' + (e && e.message ? e.message : e));
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

    // 화면 너비 설정
    if (view === 'compare' || view === 'trend') {
        main.style.maxWidth = '98%';
        main.style.margin = '0 auto';
    } else {
        main.style.maxWidth = '1100px';
        main.style.margin = '0 auto';
    }

    // 1. Condition Analysis (조건 분석 - 구 Trend Analysis)
    // 1. Condition Analysis (조건 분석 - 구 Trend Analysis)
    if (view === 'trend') {
        main.innerHTML = `
        <div class="card">
            <h3>🔬 조건 분석 (Condition Analysis)</h3>
            <div class="trend-opt-box">
                <div style="font-weight:bold; color:var(--navy); margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">1. 코호트 선택</div>
                <div id="trend-cohort-list" style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:15px;">로딩 중...</div>
            </div>
            
            <div class="trend-opt-box">
                <div style="font-weight:bold; color:var(--navy); margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:5px;">2. 분류 기준 설정</div>
                
                <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
                    <div style="flex: 1; min-width: 300px; border: 1px solid #90caf9; padding: 15px; border-radius: 8px; background: #e3f2fd;">
                        <h5 style="margin-top:0; color:#1565C0; margin-bottom:15px;">✅ 그룹 분류 기준 (Target Group)</h5>
                        
                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer;"><input type="radio" name="trend-crit" value="weight" checked onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 체중</label>
                            <select id="trend-wt-tp" style="padding:4px;"><option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option><option value="W1">W1</option><option value="W2">W2</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                            <input type="number" id="trend-wt-val" placeholder="기준값" style="width:70px; padding:4px;"> g 미만
                        </div>
                        
                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer;"><input type="radio" name="trend-crit" value="pod" onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 생존기간</label>
                            <input type="number" id="trend-pod-val" placeholder="기준일" style="width:70px; padding:4px;" disabled> 일 미만
                        </div>

                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer;"><input type="radio" name="trend-crit" value="cod" onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 사망원인/ARE</label>
                        </div>
                        
                        <div id="trend-cod-area" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #90caf9;">
                            <button type="button" class="btn-small btn-blue" onclick="loadTrendCodList()">목록 갱신</button>
                            <div id="trend-cod-list-inc" style="margin-top:10px;"></div>
                        </div>
                    </div>

                    <div style="flex: 1; min-width: 300px; border: 1px solid #ef9a9a; padding: 15px; border-radius: 8px; background: #ffebee;">
                        <h5 style="margin-top:0; color:#c62828; margin-bottom:15px;">❌ 분석 제외 기준 (완전 배제)</h5>
                        
                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer; color:#c62828;"><input type="checkbox" id="exc-use-wt" onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 체중</label>
                            <select id="exc-wt-tp" style="padding:4px;" disabled><option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option><option value="W1">W1</option><option value="W2">W2</option><option value="W4">W4</option><option value="W8">W8</option><option value="W12">W12</option></select>
                            <input type="number" id="exc-wt-val" placeholder="기준값" style="width:70px; padding:4px;" disabled> g 미만 제외
                        </div>
                        
                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer; color:#c62828;"><input type="checkbox" id="exc-use-pod" onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 생존기간</label>
                            <input type="number" id="exc-pod-val" placeholder="기준일" style="width:70px; padding:4px;" disabled> 일 미만 제외
                        </div>

                        <div style="margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                            <label style="font-weight:bold; cursor:pointer; color:#c62828;"><input type="checkbox" id="exc-use-cod" onchange="toggleTrendInputs()" style="transform:scale(1.2); margin-right:4px;"> 사망원인/ARE</label>
                        </div>
                        
                        <div id="exc-cod-area" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #ef9a9a;">
                            <button type="button" class="btn-small btn-red" onclick="loadTrendCodList()">목록 갱신</button>
                            <div id="trend-cod-list-exc" style="margin-top:10px;"></div>
                        </div>
                    </div>
                </div>
            </div>
            <label style="display:block; margin-bottom:15px; font-weight:bold; color:var(--navy); cursor:pointer;">
                <input type="checkbox" id="trend-show-all" style="width:auto; margin-right:5px; transform:scale(1.2);"> 전체 타임라인 보기
            </label>
            <button class="btn btn-blue" onclick="analyzeTrend()">분석 시작 (Split View)</button>
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
            <label style="display:block; margin-bottom:15px; font-weight:bold; color:var(--navy); cursor:pointer;">
                <input type="checkbox" id="show-all-tp" style="width:auto; margin-right:5px; transform:scale(1.2);"> 전체 타임라인 보기
            </label>
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
                <label style="display:block; margin-bottom:15px; font-weight:bold; color:var(--navy); cursor:pointer;">
                    <input type="checkbox" id="comp-show-all-tp" style="width:auto; margin-right:5px; transform:scale(1.2);"> 전체 타임라인 보기
                </label>
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
                <label style="display:block; margin-bottom:15px; font-weight:bold; color:var(--navy); cursor:pointer;">
                    <input type="checkbox" id="grp-show-all-tp" style="width:auto; margin-right:5px; transform:scale(1.2);"> 전체 타임라인 보기
                </label>
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
        main.innerHTML = `<div class="card"><h3>데일리 체크</h3><div style="display:flex; gap:10px; margin-bottom:10px"><input type="number" id="dc-c" placeholder="C" oninput="mkId('dc')"><input type="number" id="dc-r" placeholder="N" oninput="mkId('dc')"></div><input type="text" id="dc-id" readonly style="background:#eee; margin-bottom:15px"><div class="input-group"><label>날짜</label><input type="date" id="dc-date"></div>${['act','fur','eye'].map(k => `<div class="input-group"><label>${k.toUpperCase()}</label><div class="rating-box">${[1,2,3,4,5].map(n => `<button class="rate-btn" onclick="score('${k}', ${n}, this)">${n}</button>`).join('')}</div></div>`).join('')}<div id="score-res" class="status-box">선택 필요</div><textarea id="dc-note" rows="2" placeholder="메모" style="margin-top:10px;"></textarea><div style="margin-top:10px;"><input type="checkbox" id="is-dead" style="width:auto;"> <label style="display:inline; color:var(--red);">사망 시 체크</label></div><button class="btn btn-green" onclick="saveDaily()" style="margin-top:15px;">저장</button></div>`;
        document.getElementById('dc-date').value = getTodayStr();
    }
    else if(view === 'add') { 
        main.innerHTML = `<div class="card"><h3>대량 등록</h3><div class="input-group"><label>코호트</label><input type="number" id="add-c"></div><div style="display:flex; gap:10px;"><input type="number" id="add-s" placeholder="시작"><input type="number" id="add-e" placeholder="끝"></div><div class="input-group" style="margin-top:10px;"><label>반입일</label><input type="date" id="add-d"></div><button class="btn btn-green" onclick="saveBulk()">등록</button></div>`; 
        document.getElementById('add-d').value = getTodayStr(); 
    }
    else if(view === 'dose') { 
        main.innerHTML = `<div class="card"><h3>투약 계산기</h3><input type="number" id="ds-c" placeholder="코호트" oninput="upDose()" style="margin-bottom:10px;"><table><thead><tr><th>번</th><th>WT(g)</th><th>ID</th></tr></thead><tbody>${Array.from({length:12},(_,i)=>`<tr><td><input type="number" class="dn" oninput="upDose()"></td><td><input type="number" class="dw"></td><td class="di">-</td></tr>`).join('')}</tbody></table><button class="btn btn-blue" onclick="saveDose()" style="margin-top:15px;">계산 및 저장</button><div id="dose-res" style="display:none;"></div></div>`; 
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
