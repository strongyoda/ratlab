async function login() {
    const id = document.getElementById('uid').value.trim();
    const pw = document.getElementById('upw').value;

    try {
        await firebase.auth().signInWithEmailAndPassword(id, pw);

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        setTimeout(() => go('dash'), 50);
    } catch (e) {
        console.error(e);
        alert('로그인 실패: ' + (e && e.message ? e.message : e));
    }
}


async function go(view, targetId = null) {
    const main = document.getElementById('content');
    if(document.getElementById('sidebar').classList.contains('open')) toggleMenu();

    // 화면 너비 설정
    if (view === 'compare' || view === 'trend') {
        main.style.maxWidth = '95%';
    } else {
        main.style.maxWidth = '1000px';
    }

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
                
                <div style="display:flex; flex-direction:column; gap:12px;">
                    
                    <div class="trend-row" style="display:flex; align-items:center; flex-wrap:nowrap;">
                        <label style="cursor:pointer; display:flex; align-items:center; margin-right:15px; min-width:140px;">
                            <input type="radio" name="trend-crit" value="weight" checked onchange="toggleTrendInputs()" style="margin-right:8px;"> 
                            <span style="font-weight:bold; white-space:nowrap;">체중(Weight) 기준</span>
                        </label>
                        <div style="display:flex; align-items:center; flex-wrap:nowrap;">
                            <select id="trend-wt-tp" style="width:auto; padding:4px; margin-right:5px;">
                                <option value="D00">D00</option><option value="D0">D0</option><option value="D2">D2</option>
                            </select>
                            <input type="number" id="trend-wt-val" placeholder="기준값" style="width:80px; padding:4px; margin-right:5px;"> 
                            <span>g</span>
                        </div>
                    </div>

                    <div class="trend-row" style="display:flex; align-items:center; flex-wrap:nowrap;">
                        <label style="cursor:pointer; display:flex; align-items:center; margin-right:15px; min-width:140px;">
                            <input type="radio" name="trend-crit" value="pod" onchange="toggleTrendInputs()" style="margin-right:8px;"> 
                            <span style="font-weight:bold; white-space:nowrap;">수명(POD) 기준</span>
                        </label>
                        <div style="display:flex; align-items:center; flex-wrap:nowrap;">
                            <span style="margin-right:5px; color:#666; font-size:0.9rem; white-space:nowrap;">POD</span>
                            <input type="number" id="trend-pod-val" placeholder="기준값" style="width:80px; padding:4px; margin-right:5px;" disabled> 
                            <span>일</span>
                        </div>
                    </div>

                    <div>
                        <div class="trend-row" style="display:flex; align-items:center; flex-wrap:nowrap;">
                            <label style="cursor:pointer; display:flex; align-items:center; min-width:140px;">
                                <input type="radio" name="trend-crit" value="cod" onchange="toggleTrendInputs()" style="margin-right:8px;"> 
                                <span style="font-weight:bold; white-space:nowrap;">사망 원인(COD) 포함</span>
                            </label>
                        </div>
                        
                        <div id="trend-cod-area" style="display:none; margin-top:8px; margin-left:24px; width:90%; background:#f8f9fa; border:1px solid #eee; padding:10px; border-radius:6px;">
                            <div style="font-size:0.85rem; color:#555; margin-bottom:8px; line-height:1.4;">
                                * 코호트를 먼저 선택하고 <b>[목록 갱신]</b>을 누르세요.<br>
                                * 선택한 키워드가 <b>하나라도 포함된</b> 개체가 그룹 A로 분류됩니다.
                            </div>
                            <button class="btn btn-blue btn-small" onclick="loadTrendCodList()" style="width:auto; padding:4px 10px; margin-bottom:10px;">목록 갱신 (선택된 코호트)</button>
                            <div id="trend-cod-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:8px; max-height:150px; overflow-y:auto; background:white; padding:5px; border:1px solid #ddd; border-radius:4px;">
                                <span style="color:#aaa; padding:5px;">목록 갱신 필요</span>
                            </div>
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
function toggleBpLog() { const t = document.getElementById('bp-detail-table'); t.style.display = t.style.display === 'none' ? 'block' : 'none'; }
