
async function deleteRat() { const id=document.getElementById('del-id').value; if(!id||!confirm("삭제?"))return; (await db.collection("rats").where("ratId","==",id).get()).forEach(d=>d.ref.delete()); ["dailyLogs","doseLogs","measurements"].forEach(async c=>(await db.collection(c).where("ratId","==",id).get()).forEach(d=>d.ref.delete())); clearRatsCache(); alert("삭제됨"); }
async function deleteCohort() { const c=document.getElementById('del-cohort').value; if(!c||!confirm("전체삭제?"))return; (await db.collection("rats").where("cohort","==",c).get()).forEach(d=>d.ref.delete()); alert("삭제됨(로그제외)"); } 



async function searchForEdit() {
    const id = document.getElementById('edit-id').value.trim();
    if(!id) return alert("ID를 입력하세요");
    const resDiv = document.getElementById('edit-result');
    resDiv.innerHTML = '<div class="loader"></div> 데이터를 불러오는 중...';
    try {
        const ratQ = db.collection("rats").where("ratId", "==", id).get();
        const dailyQ = db.collection("dailyLogs").where("ratId", "==", id).orderBy("date").get();
        const measQ = db.collection("measurements").where("ratId", "==", id).orderBy("date").get();
        const [rSnap, dSnap, mSnap] = await Promise.all([ratQ, dailyQ, measQ]);
        if(rSnap.empty) { resDiv.innerHTML = "해당 ID의 랫드를 찾을 수 없습니다."; return; }
        const ratDoc = rSnap.docs[0];
        const rData = ratDoc.data();
        
        const currentCod = rData.cod || extractLegacyCod(rData.codFull);
        const currentAre = rData.are || '';
        let areMain = currentAre.split(' ')[0] || '';
        let areSub = currentAre.split(' ')[1] ? currentAre.split(' ')[1].replace(/[()]/g, '') : '';
        const mrOpts = ['-','D00','D0','D2','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','Death'];

        let html = `
        <div class="edit-container">
            <h3 style="color:var(--navy); border-bottom:2px solid var(--navy); padding-bottom:10px;">📝 통합 데이터 수정 (${rData.ratId})</h3>
            <div class="edit-section-title">기본 정보</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div class="input-group"><label>상태</label><select id="ed-status" style="padding:5px;"><option value="생존" ${rData.status==='생존'?'selected':''}>생존</option><option value="사망" ${rData.status==='사망'?'selected':''}>사망</option></select></div>
                <div class="input-group">
                    <label>사망 원인 (COD)</label>
                    <select id="ed-cod" style="padding:5px;">
                        <option value="">-</option>
                        ${['SAH', 'Infarction', 'Vasospasm', 'Sacrifice', 'Surgical Failure', 'Unknown'].map(c => `<option value="${c}" ${currentCod===c?'selected':''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group">
                    <label>ARE 유무</label>
                    <div style="display:flex; gap:5px;">
                        <select id="ed-are-main" style="padding:5px; flex:1;" onchange="document.getElementById('ed-are-sub').style.display = this.value==='O' ? 'block' : 'none';">
                            <option value="">-</option>
                            <option value="O" ${areMain==='O'?'selected':''}>O</option>
                            <option value="X" ${areMain==='X'?'selected':''}>X</option>
                        </select>
                        <select id="ed-are-sub" style="padding:5px; flex:1; display:${areMain==='O'?'block':'none'};">
                            <option value="미확인" ${areSub==='미확인'?'selected':''}>미확인</option>
                            <option value="micro" ${areSub==='micro'?'selected':''}>micro</option>
                            <option value="macro" ${areSub==='macro'?'selected':''}>macro</option>
                        </select>
                    </div>
                </div>
                <div class="input-group"><label>사망일</label><input type="date" id="ed-death" value="${rData.deathDate||''}"></div>
                <div class="input-group"><label>반입일</label><input type="date" id="ed-arrival" value="${rData.arrivalDate||''}"></div>
                <div class="input-group"><label>수술일</label><input type="date" id="ed-surgery" value="${rData.surgeryDate||''}"></div>
                <div class="input-group"><label>투약시작일</label><input type="date" id="ed-dose-start" value="${rData.doseStartDate||''}"></div>
                <div class="input-group">
                    <label>반입주령</label>
                    <select id="ed-arrival-age" style="padding:5px;">
                        ${[5,6,7,8,9,10].map(v => `<option value="${v}" ${(rData.arrivalAge||6)==v?'selected':''}>${v}주</option>`).join('')}
                    </select>
                </div>
                <div class="input-group"><label>OVX일자</label><input type="date" id="ed-ovx" value="${rData.ovxDate||''}"></div>
                
                <div class="input-group" style="grid-column: span 2;">
                    <label>샘플 (종류 & 날짜 & 메모)</label>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        <select id="ed-sample-tp" style="padding:5px; width:100px;">
                            <option value="">-</option>
                            <option value="Histology" ${rData.sampleType==='Histology'?'selected':''}>Histology</option>
                            <option value="Cast" ${rData.sampleType==='Cast'?'selected':''}>Cast</option>
                            <option value="Fail" ${rData.sampleType==='Fail'?'selected':''}>못함</option>
                        </select>
                        <input type="date" id="ed-sample-date" value="${rData.sampleDate||''}" style="padding:5px; width:130px;">
                        <input type="text" id="ed-sample-memo" value="${rData.sampleMemo||''}" placeholder="샘플 특이사항 메모" style="padding:5px; flex:1; min-width:150px;">
                    </div>
                </div>
                
                <div class="input-group" style="grid-column: span 2;">
                    <label>MR 촬영 이력</label>
                    <div id="ed-mr-list" style="background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #ddd;">
                        ${(rData.mrDates || []).map(mr => `
                            <div class="ed-mr-row" style="display:flex; gap:5px; margin-bottom:5px;">
                                <select class="ed-mr-tp" style="width:100px; padding:5px;">
                                    ${mrOpts.map(opt => `<option value="${opt}" ${mr.timepoint===opt?'selected':''}>${opt}</option>`).join('')}
                                </select>
                                <input type="date" class="ed-mr-dt" value="${mr.date}" style="padding:5px;">
                                <button class="btn-red btn-small" onclick="this.parentElement.remove()">X</button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-small btn-blue" onclick="addEdMrRow()" style="margin-top:5px;">+ MR 추가</button>
                </div>
            </div>

            <div class="edit-section-title">혈압/체중 <button class="btn btn-blue btn-small" style="float:right;" onclick="addTableRow('meas-tbody')">+ 추가</button></div>
            <table class="full-edit-table"><thead><tr><th>날짜</th><th>시점</th><th>SBP</th><th>DBP</th><th>Mean</th><th>WT</th><th>삭제</th></tr></thead><tbody id="meas-tbody">`;
        
        mSnap.forEach(doc => {
            const d = doc.data();
            html += `<tr data-id="${doc.id}" data-coll="measurements"><td><input type="date" class="row-date" value="${d.date}"></td><td><input type="text" class="row-tp" value="${d.timepoint||''}"></td><td><input type="number" class="row-sbp" value="${d.sbp||''}"></td><td><input type="number" class="row-dbp" value="${d.dbp||''}"></td><td><input type="number" class="row-mean" value="${d.mean||''}"></td><td><input type="number" class="row-wt" value="${d.weight||''}"></td><td><button class="del-btn" onclick="markRowDel(this)">삭제</button></td></tr>`;
        });
        html += `</tbody></table><div class="edit-section-title">데일리 체크 <button class="btn btn-blue btn-small" style="float:right;" onclick="addTableRow('daily-tbody')">+ 추가</button></div><table class="full-edit-table"><thead><tr><th>날짜</th><th>Act</th><th>Fur</th><th>Eye</th><th>Memo</th><th>삭제</th></tr></thead><tbody id="daily-tbody">`;
        dSnap.forEach(doc => {
            const d = doc.data();
            const actVal = (d.scores?.activity !== undefined) ? d.scores.activity : (d.scores?.act || 0);
            html += `<tr data-id="${doc.id}" data-coll="dailyLogs"><td><input type="date" class="row-date" value="${d.date}"></td><td><input type="number" class="row-act" value="${actVal}" style="width:40px"></td><td><input type="number" class="row-fur" value="${d.scores?.fur||0}" style="width:40px"></td><td><input type="number" class="row-eye" value="${d.scores?.eye||0}" style="width:40px"></td><td><input type="text" class="row-note" value="${d.note||''}"></td><td><button class="del-btn" onclick="markRowDel(this)">삭제</button></td></tr>`;
        });
        html += `</tbody></table><div style="height:60px;"></div> <button class="btn btn-green float-save-btn" onclick="saveTotalEdit('${ratDoc.id}')">💾 전체 저장</button></div>`;
        resDiv.innerHTML = html;
    } catch(e) { console.error(e); resDiv.innerHTML = `<p style="color:red">오류: ${e.message}</p>`; }
}


async function saveTotalEdit(ratDocId) {
    if(!confirm("모든 변경사항을 저장하시겠습니까?")) return;
    
    const batch = db.batch();
    const ratRef = db.collection("rats").doc(ratDocId);
    
    const mrRows = document.querySelectorAll('.ed-mr-row');
    const mrDatesArr = [];
    mrRows.forEach(row => {
        const tp = row.querySelector('.ed-mr-tp').value;
        const dt = row.querySelector('.ed-mr-dt').value;
        if(tp && dt) mrDatesArr.push({ timepoint: tp, date: dt });
    });

    const codVal = document.getElementById('ed-cod').value;
    const areMain = document.getElementById('ed-are-main').value;
    const areSub = document.getElementById('ed-are-sub').value;
    const areVal = areMain === 'O' ? `O (${areSub})` : (areMain === 'X' ? 'X' : '');

    batch.update(ratRef, {
        status: document.getElementById('ed-status').value,
        cod: codVal,
        are: areVal,
        codFull: `${codVal} / ARE: ${areVal}`, 
        arrivalDate: document.getElementById('ed-arrival').value,
        surgeryDate: document.getElementById('ed-surgery').value,
        doseStartDate: document.getElementById('ed-dose-start').value,
        deathDate: document.getElementById('ed-death').value,
        arrivalAge: Number(document.getElementById('ed-arrival-age').value),
        ovxDate: document.getElementById('ed-ovx').value,
        sampleType: document.getElementById('ed-sample-tp').value,
        sampleDate: document.getElementById('ed-sample-date').value,
        sampleMemo: document.getElementById('ed-sample-memo').value,
        mrDates: mrDatesArr
    });

    const tables = ['meas-tbody', 'daily-tbody'];
    const ratIdStr = document.getElementById('edit-id').value; 

    tables.forEach(tbodyId => {
        const rows = document.querySelectorAll(`#${tbodyId} tr`);
        rows.forEach(row => {
            const coll = row.dataset.coll;
            const docId = row.dataset.id;
            const isDel = row.classList.contains('row-del');
            const isNew = row.dataset.isNew === "true";
            const date = row.querySelector('.row-date').value;

            if (isDel && !isNew) {
                const ref = db.collection(coll).doc(docId);
                batch.delete(ref);
            } else if (!isDel) {
                let data = {};
                if (coll === 'measurements') {
                    const sbp = row.querySelector('.row-sbp').value;
                    const dbp = row.querySelector('.row-dbp').value;
                    const mean = row.querySelector('.row-mean').value;
                    const wt = row.querySelector('.row-wt').value;
                    const tp = row.querySelector('.row-tp').value;
                    if(!date) return; 
                    data = {
                        ratId: ratIdStr, date: date, timepoint: tp,
                        sbp: sbp ? Number(sbp) : null,
                        dbp: dbp ? Number(dbp) : null,
                        mean: mean ? Number(mean) : null,
                        weight: wt ? Number(wt) : null
                    };
                } else if (coll === 'dailyLogs') {
                    const act = Number(row.querySelector('.row-act').value);
                    const fur = Number(row.querySelector('.row-fur').value);
                    const eye = Number(row.querySelector('.row-eye').value);
                    const note = row.querySelector('.row-note').value;
                    if(!date) return;
                    data = {
                        ratId: ratIdStr, date: date,
                        scores: { activity: act, fur: fur, eye: eye },
                        totalScore: act + fur + eye,
                        note: note
                    };
                }

                if (isNew) {
                    const newRef = db.collection(coll).doc();
                    batch.set(newRef, data);
                } else {
                    const ref = db.collection(coll).doc(docId);
                    batch.update(ref, data);
                }
            }
        });
    });

    try {
        await batch.commit();
        clearRatsCache();
        alert("성공적으로 저장되었습니다.");
        searchForEdit(); 
    } catch(e) {
        console.error(e);
        alert("저장 중 오류 발생: " + e.message);
    }
}

// 행 삭제 표시 함수
function markRowDel(btn) {
    const row = btn.closest('tr');
    if(row.classList.contains('row-del')) {
        row.classList.remove('row-del');
        btn.innerText = '삭제';
        btn.style.background = 'var(--red)';
    } else {
        row.classList.add('row-del');
        btn.innerText = '복구';
        btn.style.background = 'gray';
    }
}



// 행 추가 함수
function addTableRow(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    const tr = document.createElement('tr');
    tr.dataset.isNew = "true"; // 신규 행 표시
    
    if(tbodyId === 'meas-tbody') {
        tr.dataset.coll = "measurements";
        tr.innerHTML = `
            <td><input type="date" class="row-date" value="${getTodayStr()}"></td>
            <td><input type="text" class="row-tp" placeholder="W1.."></td>
            <td><input type="number" class="row-sbp" placeholder="SBP"></td>
            <td><input type="number" class="row-dbp" placeholder="DBP"></td>
            <td><input type="number" class="row-mean" placeholder="Mean"></td>
            <td><input type="number" class="row-wt" placeholder="WT"></td>
            <td><button class="del-btn" onclick="this.closest('tr').remove()">취소</button></td>`;
    } else if(tbodyId === 'daily-tbody') {
        tr.dataset.coll = "dailyLogs";
        tr.innerHTML = `
            <td><input type="date" class="row-date" value="${getTodayStr()}"></td>
            <td><input type="number" class="row-act" value="0"></td>
            <td><input type="number" class="row-fur" value="0"></td>
            <td><input type="number" class="row-eye" value="0"></td>
            <td><input type="text" class="row-note" placeholder="메모"></td>
            <td><button class="del-btn" onclick="this.closest('tr').remove()">취소</button></td>`;
    }
    tbody.insertBefore(tr, tbody.firstChild);
}

async function searchLogsDel() {
    const id = document.getElementById('log-rat-id').value.trim();
    if(!id) return alert("ID를 입력하세요");

    const resDiv = document.getElementById('log-del-result');
    resDiv.innerHTML = '<div class="loader"></div> 로그 검색 중...';

    try {
        // Daily Logs와 Dose Logs를 동시에 조회
        const [dSnap, dsSnap] = await Promise.all([
            db.collection("dailyLogs").where("ratId", "==", id).orderBy("date", "desc").get(),
            db.collection("doseLogs").where("ratId", "==", id).orderBy("date", "desc").get()
        ]);

        if(dSnap.empty && dsSnap.empty) {
            resDiv.innerHTML = "<p>해당 ID의 로그 데이터가 없습니다.</p>";
            return;
        }

        let html = `<div style="text-align:right; margin-bottom:10px;">
                        <button class="btn btn-red btn-small" onclick="deleteSelectedLogs()">선택 항목 삭제하기</button>
                    </div>`;

        // 1. Daily Logs Table
        if(!dSnap.empty) {
            html += `<h4 style="margin-top:20px; color:var(--navy);">📝 데일리 체크 로그 (${dSnap.size}개)</h4>
            <label style="font-size:0.85rem; cursor:pointer; display:block; margin-bottom:5px;">
                <input type="checkbox" onchange="toggleAllLogs(this, 'chk-daily')"> 전체 선택
            </label>
            <div style="max-height:250px; overflow-y:auto; border:1px solid #eee;">
                <table style="font-size:0.85rem;">
                    <thead><tr><th width="30">✔</th><th>날짜</th><th>점수</th><th>메모</th></tr></thead>
                    <tbody>`;
            dSnap.forEach(doc => {
                const d = doc.data();
                html += `<tr>
                    <td><input type="checkbox" class="chk-daily" value="${doc.id}" data-coll="dailyLogs"></td>
                    <td>${d.date}</td>
                    <td>${d.totalScore}</td>
                    <td>${d.note || '-'}</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }

        // 2. Dose Logs Table
        if(!dsSnap.empty) {
            html += `<h4 style="margin-top:20px; color:var(--navy);">💊 투약 기록 로그 (${dsSnap.size}개)</h4>
            <label style="font-size:0.85rem; cursor:pointer; display:block; margin-bottom:5px;">
                <input type="checkbox" onchange="toggleAllLogs(this, 'chk-dose')"> 전체 선택
            </label>
            <div style="max-height:250px; overflow-y:auto; border:1px solid #eee;">
                <table style="font-size:0.85rem;">
                    <thead><tr><th width="30">✔</th><th>날짜</th><th>체중</th><th>용량(ml)</th></tr></thead>
                    <tbody>`;
            dsSnap.forEach(doc => {
                const d = doc.data();
                html += `<tr>
                    <td><input type="checkbox" class="chk-dose" value="${doc.id}" data-coll="doseLogs"></td>
                    <td>${d.date}</td>
                    <td>${d.weight}g</td>
                    <td>${d.volMl ? d.volMl.toFixed(2) : '-'}ml</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }

        resDiv.innerHTML = html;

    } catch(e) {
        console.error(e);
        resDiv.innerHTML = `<p style="color:red">오류 발생: ${e.message}</p>`;
    }
}


async function deleteSelectedLogs() {
    const dailies = document.querySelectorAll('.chk-daily:checked');
    const doses = document.querySelectorAll('.chk-dose:checked');
    const total = dailies.length + doses.length;

    if(total === 0) return alert("삭제할 항목을 선택해주세요.");
    if(!confirm(`총 ${total}개의 로그를 정말 삭제하시겠습니까?\n(삭제 후 복구 불가)`)) return;

    const batch = db.batch();
    let count = 0;

    // Firestore Batch Limit is 500. 간단한 처리를 위해 500개 미만 가정.
    // 만약 500개가 넘으면 나눠서 처리해야 하지만, 일반적인 사용 패턴상 이정도면 충분합니다.
    
    dailies.forEach(cb => {
        const ref = db.collection("dailyLogs").doc(cb.value);
        batch.delete(ref);
        count++;
    });

    doses.forEach(cb => {
        const ref = db.collection("doseLogs").doc(cb.value);
        batch.delete(ref);
        count++;
    });

    try {
        await batch.commit();
        alert(`${count}개의 로그가 삭제되었습니다.`);
        searchLogsDel(); // 목록 갱신
    } catch(e) {
        console.error(e);
        alert("삭제 중 오류 발생: " + e.message);
    }
}   


// [데이터 백업 기능] 모든 데이터를 JSON 파일로 다운로드
async function backupAllData() {
    if(!confirm("전체 데이터를 백업(다운로드) 하시겠습니까?\n데이터 양에 따라 시간이 걸릴 수 있습니다.")) return;
    
    const backupBtn = document.getElementById('btn-backup');
    const originalText = backupBtn.innerText;
    backupBtn.innerText = "데이터 수집 중...";
    backupBtn.disabled = true;

    try {
        const collections = ["rats", "measurements", "dailyLogs", "doseLogs", "cohortNotes"];
        const allData = {};

        // 모든 컬렉션 데이터 가져오기
        for (const col of collections) {
            const snapshot = await db.collection(col).get();
            allData[col] = [];
            snapshot.forEach(doc => {
                allData[col].push({ _id: doc.id, ...doc.data() });
            });
        }

        // 날짜 기반 파일명 생성
        const today = new Date();
        const dateStr = today.getFullYear() + "-" + (today.getMonth()+1) + "-" + today.getDate();
        const fileName = `RAT_LAB_BACKUP_${dateStr}.json`;

        // JSON 파일 생성 및 다운로드 링크 트리거
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        alert("백업 파일이 다운로드되었습니다.\nPC에 안전하게 보관하세요.");
    } catch (e) {
        console.error(e);
        alert("백업 중 오류 발생: " + e.message);
    } finally {
        backupBtn.innerText = originalText;
        backupBtn.disabled = false;
    }
} 



function loadBPFiles(e) {
    bpAllData = [];
    const files = Array.from(e.target.files);
    const mode = document.querySelector('input[name="bp-mode"]:checked').value;
    let loaded = 0;
    files.forEach(file => { const reader = new FileReader(); reader.onload = () => { parseBPCSV(reader.result, file.name); loaded++; if (loaded === files.length) analyzeBP(mode); }; reader.readAsText(file); });
}


function parseBPCSV(text, filename) {
    const rows = text.trim().split("\n").map(r => r.split(","));
    const header = rows.shift();
    // 헤더 공백 제거 후 인덱스 찾기 (더 안전함)
    const idx = n => header.findIndex(h => h && h.trim() === n);

    rows.forEach(r => {
        if (r.length < 5) return; 
        // 값의 앞뒤 공백을 제거하고 비교 (핵심 수정)
        bpAllData.push({ 
            file: filename, 
            time: r[idx("Time")], 
            specimen: r[idx("Specimen Name")], 
            regular: (r[idx("Regular Cycle")] || "").trim().toUpperCase() === "TRUE", 
            accepted: (r[idx("Accepted")] || "").trim().toUpperCase() === "TRUE",
            sbp: Number(r[idx("Systolic")]), 
            dbp: Number(r[idx("Diastolic")]), 
            mean: Number(r[idx("Mean")]), 
            volume: Number(r[12] || r[idx("Volume")]) // Volume 인덱스 안전 처리
        });
    });
}



function analyzeBP(mode) {
    const output = document.getElementById("bp-output");
    output.innerHTML = "";
    const grouped = {};
    currentAnalyzedData = {}; // 초기화

    // 데이터 그룹화
    bpAllData.forEach(r => {
        const match = r.specimen.match(/\(([^)]+)\)/);
        const ratId = match ? match[1].trim() : r.specimen.trim();
        if (!grouped[ratId]) grouped[ratId] = {};
        if (!grouped[ratId][r.file]) grouped[ratId][r.file] = [];
        grouped[ratId][r.file].push(r);
    });

    // "선택한 값 저장하기" 버튼 추가
    const actionDiv = document.createElement("div");
    actionDiv.innerHTML = `<button onclick="openBatchModal()" style="padding:10px 20px; background:#00c853; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; margin-bottom:20px;">✅ 선택한 값 DB 저장하기</button>`;
    output.appendChild(actionDiv);

    Object.keys(grouped).sort().forEach(ratId => {
        const box = document.createElement("div");
        box.className = "bp-rat-box";
        box.innerHTML = `<div class="bp-rat-title">🐀 개체 ID: ${ratId}</div>`;
        const table = document.createElement("table");
        
        // [변경] 맨 앞에 '선택' 헤더 추가
        table.innerHTML = `<tr><th>선택</th><th>File</th><th>n</th><th>SBP</th><th>DBP</th><th>Mean</th><th>Volume</th><th>상태</th></tr>`;

        Object.entries(grouped[ratId]).forEach(([file, rows], idx) => {
            // 1. Regular & Accepted 체크 (대소문자 무시)
            const valid = rows.filter(r => (String(r.regular).toUpperCase() === 'TRUE') && (String(r.accepted).toUpperCase() === 'TRUE'));
            
            let sbps = valid.map(r => r.sbp);
            let maxSBP = sbps.length ? Math.max(...sbps) : 0;
            let minSBP = sbps.length ? Math.min(...sbps) : 0;

            const judged = rows.map(r => {
                let reason = "✅ Accepted";
                // [대소문자 수정 적용됨]
                const isReg = String(r.regular).toUpperCase() === 'TRUE';
                const isAcc = String(r.accepted).toUpperCase() === 'TRUE';

                if (!isReg || !isAcc) { reason = "❌ Regular/Accepted"; } 
                else if (sbps.length > 0 && r.sbp === maxSBP) { reason = "❌ SBP = MAX"; } 
                else if (sbps.length > 0 && r.sbp === minSBP) { reason = "❌ SBP = MIN"; } 
                else {
                    const diff = r.sbp - r.dbp;
                    if (mode === "control" && (diff < 20 || diff > 60)) reason = "❌ Pulse diff";
                    if (mode === "induction" && (diff < 25 || diff > 80)) reason = "❌ Pulse diff";
                }
                return { ...r, reason };
            });

            const passed = judged.filter(r => r.reason === "✅ Accepted");
            const avgFloor = key => Math.floor(passed.reduce((s, r) => s + r[key], 0) / passed.length);
            
            const nVal = passed.length;
            const sbpVal = nVal > 0 ? avgFloor("sbp") : '-';
            const dbpVal = nVal > 0 ? avgFloor("dbp") : '-';
            const meanVal = nVal > 0 ? avgFloor("mean") : '-';
            const volVal = nVal > 0 ? avgFloor("volume") : '-';

            // 데이터를 전역 변수에 저장 (나중에 저장 버튼 누를 때 사용)
            const rowId = `${ratId}__${idx}`; 
            currentAnalyzedData[rowId] = {
                ratId: ratId,
                file: file,
                sbp: sbpVal, dbp: dbpVal, mean: meanVal, volume: volVal,
                date: rows[0].time.split(' ')[0], // 날짜 추출
                originalRows: passed
            };

            // [변경] 라디오 버튼 추가 (name을 ratId로 묶어서 쥐 한 마리당 하나만 선택되게 함)
            // 데이터가 없으면(n=0) 선택 불가능하게 disabled 처리
            const radioHtml = nVal > 0 
                ? `<input type="radio" name="bp_choice_${ratId}" value="${rowId}" style="transform:scale(1.5); cursor:pointer;">` 
                : `<input type="radio" disabled>`;

            const logId = `bp_log_${ratId.replace(/[^a-z0-9]/gi, '_')}_${idx}`;
            
            table.innerHTML += `
                <tr>
                    <td style="text-align:center;">${radioHtml}</td>
                    <td style="color:#e67e22; font-weight:500;">${file}</td>
                    <td>${nVal > 0 ? nVal : `<span style="color:red">0</span>`}</td>
                    <td>${sbpVal}</td>
                    <td>${dbpVal}</td>
                    <td>${meanVal}</td>
                    <td>${volVal}</td>
                    <td><button class="bp-toggle-btn" onclick="toggleBPLog('${logId}')">로그 확인</button></td>
                </tr>
                <tr id="${logId}" style="display:none;">
                    <td colspan="8">
                        <table class="bp-log-table">
                            <tr><th>Time</th><th>SBP</th><th>DBP</th><th>Mean</th><th>Volume</th><th>Reason</th></tr>
                            ${judged.map(r => `<tr style="${r.reason!=='✅ Accepted'?'color:#aaa':''}"><td>${r.time}</td><td>${r.sbp}</td><td>${r.dbp}</td><td>${r.mean}</td><td>${r.volume}</td><td>${r.reason}</td></tr>`).join("")}
                        </table>
                    </td>
                </tr>`;
        });
        box.appendChild(table);
        output.appendChild(box);
    });
}


function openBatchModal() {
    // 체크된 항목 가져오기
    const inputs = document.querySelectorAll('input[type="radio"]:checked');
    if (inputs.length === 0) return alert("저장할 데이터를 하나 이상 선택해주세요.");

    const tbody = document.getElementById("bpBatchList");
    tbody.innerHTML = "";

    // ✅ 시점 옵션: Manual + D00 + D0 + D2 + W1~W12
    let timeOptions = `<option value="Manual">Manual</option>
                    <option value="D00">D00</option>
                    <option value="D0">D0</option>
                    <option value="D2">D2</option>`;
    for (let i = 1; i <= 12; i++) {
        timeOptions += `<option value="W${i}">W${i}</option>`;
    }

    inputs.forEach((input, idx) => {
        const data = currentAnalyzedData[input.value];
        if (!data) return;

        // Rat ID 자동 포맷팅: "C0504G1 - 4" -> "C0504"
        let formattedId = data.ratId;
        const idMatch = data.ratId.match(/C\d{4}/i);
        if (idMatch) formattedId = idMatch[0].toUpperCase();

        const row = `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px; color:#888; font-size:13px;">${data.ratId}</td>
                
                <td style="padding:10px;">
                    <div style="font-weight:bold; color:#d32f2f;">SBP: ${data.sbp}</div>
                    <div style="font-size:12px;">DBP: ${data.dbp} / Mean: ${data.mean}</div>
                </td>
                
                <td style="padding:10px;">
                    <input type="date" id="save_date_${idx}" value="${data.date}" style="padding:5px; border:1px solid #ddd; border-radius:4px;">
                </td>
                
                <td style="padding:10px;">
                    <input type="text" id="save_id_${idx}" value="${formattedId}" 
                        style="padding:6px; width:120px; border:2px solid #00c853; border-radius:4px; font-weight:bold; font-size:14px;">
                </td>
                
                <td style="padding:10px; display:flex; align-items:center; gap:5px;">
                    <select id="save_time_${idx}" style="padding:6px; border:1px solid #1a237e; border-radius:4px; font-weight:bold;">
                        <option value="">--선택--</option>
                        ${timeOptions}
                    </select>
                    <input type="text" id="save_time_manual_${idx}" placeholder="직접입력" 
                        style="padding:6px; width:80px; border:1px solid #ddd; border-radius:4px;">
                </td>
                
                <input type="hidden" id="save_data_${idx}" value='${JSON.stringify(data)}'>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    // ✅ UX: 드롭다운 선택 시 직접입력 비활성화, 직접입력 타이핑 시 드롭다운 비우기
    inputs.forEach((_, idx) => {
        const sel = document.getElementById(`save_time_${idx}`);
        const manual = document.getElementById(`save_time_manual_${idx}`);
        if (!sel || !manual) return;

        const setManualEnabled = (enabled) => {
            manual.disabled = !enabled;
            manual.style.opacity = enabled ? "1" : "0.45";
            manual.style.background = enabled ? "#fff" : "#f3f3f3";
            manual.style.cursor = enabled ? "text" : "not-allowed";
        };

        // 초기 상태: 드롭다운이 비어있으면 직접입력 ON
        setManualEnabled(sel.value === '');

        sel.addEventListener('change', () => {
            // 드롭다운에서 뭐든 선택하면(Manual 포함) -> 직접입력 OFF + 초기화
            if (sel.value !== '') {
                manual.value = '';
                setManualEnabled(false);
            } else {
                // --선택-- 로 돌아가면 -> 직접입력 ON
                setManualEnabled(true);
                manual.focus();
            }
        });

        manual.addEventListener('input', () => {
            // 직접입력에 뭔가 쓰기 시작하면 -> 드롭다운은 비움(--선택--)
            const hasText = manual.value.trim().length > 0;
            if (hasText && sel.value !== '') {
                sel.value = '';
                setManualEnabled(true);
            }
        });
    });

    document.getElementById("bpBatchModal").style.display = "flex";
}


function closeBatchModal() {
    document.getElementById("bpBatchModal").style.display = "none";
}

async function saveBatchToDB() {
    const tbody = document.getElementById("bpBatchList");
    const rows = tbody.querySelectorAll("tr"); 
    const batchPromises = [];
    let savedCount = 0;

    if (rows.length === 0) return alert("저장할 데이터가 없습니다.");

    if (!confirm(`${rows.length}건의 데이터를 데이터베이스에 저장하시겠습니까?\n(기존 시점에 데이터가 있다면 혈압 값만 합쳐집니다.)`)) return;

    for (const row of rows) {
        const idInput = row.querySelector('input[id^="save_id_"]');
        const dateInput = row.querySelector('input[id^="save_date_"]'); // 새 데이터일 때만 사용
        const timeSelect = row.querySelector('select[id^="save_time_"]');
        const timeManual = row.querySelector('input[id^="save_time_manual_"]');
        const hiddenData = row.querySelector('input[id^="save_data_"]');

        if (!idInput || !hiddenData) continue;

        const ratId = idInput.value.trim();
        const inputDate = dateInput.value; 
        const timepoint = (timeManual.value.trim()) || timeSelect.value;
        
        let sourceData;
        try { sourceData = JSON.parse(hiddenData.value); } catch (e) { continue; }

        if (!ratId) { alert(`Rat ID가 비어있는 행이 있습니다.`); return; }
        if (!timepoint) { alert(`[${ratId}]의 시점(Timepoint)을 선택해주세요.`); return; }

        // ---------------------------------------------------------
        // [핵심 변경] 기존 데이터 확인 후 병합(Merge) 로직
        // ---------------------------------------------------------
        const docRef = db.collection("measurements").where("ratId", "==", ratId).where("timepoint", "==", timepoint);
        
        const promise = docRef.get().then(async (snapshot) => {
            if (!snapshot.empty) {
                // [Case A] 이미 해당 시점(timepoint)의 데이터가 존재함 -> 업데이트 (Merge)
                // 날짜(date)는 건드리지 않고, 혈압 데이터만 덮어씌움
                const existingDoc = snapshot.docs[0]; // 첫 번째 일치 문서 가져옴
                await db.collection("measurements").doc(existingDoc.id).update({
                    sbp: Number(sourceData.sbp),
                    dbp: Number(sourceData.dbp),
                    mean: Number(sourceData.mean),
                    // 기존에 있던 weight, memo 등은 그대로 유지됨
                    // date도 업데이트하지 않음 (기존 날짜 유지)
                    timestamp: firebase.firestore.FieldValue.serverTimestamp() // 수정 시간 갱신
                });
                console.log(`[Update] ${ratId} - ${timepoint} 병합 완료`);
            } else {
                // [Case B] 해당 시점 데이터가 없음 -> 새로 생성
                // 이때는 기준이 될 날짜가 필요하므로 입력받은 측정일을 사용
                await db.collection("measurements").add({
                    ratId: ratId,
                    timepoint: timepoint,
                    date: inputDate, // 새 데이터일 때만 날짜 저장
                    sbp: Number(sourceData.sbp),
                    dbp: Number(sourceData.dbp),
                    mean: Number(sourceData.mean),
                    weight: null,
                    memo: `Batch upload from ${sourceData.file}`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[Create] ${ratId} - ${timepoint} 신규 생성 완료`);
            }
            savedCount++;
        }).catch(err => {
            console.error(`[Error] ${ratId} 저장 실패:`, err);
        });

        batchPromises.push(promise);
    }

    if (batchPromises.length === 0) return alert("처리할 데이터가 없습니다.");

    try {
        await Promise.all(batchPromises);
        alert(`총 ${savedCount}건의 처리가 완료되었습니다!`);
        closeBatchModal();
        // location.reload(); // 필요 시 새로고침
    } catch (e) {
        console.error(e);
        alert("저장 중 오류가 발생했습니다.");
    }
}


function toggleBPLog(id) { const el = document.getElementById(id); el.style.display = el.style.display === "none" ? "table-row" : "none"; }

function parseRatUploadCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        // 맥/윈도우 줄바꿈 호환 처리
        const rows = text.trim().split(/\r?\n/);
        if (rows.length < 2) return alert("데이터가 비어있습니다.");

        const headers = rows[0].split(',').map(h => h.trim());
        const idIdx = headers.indexOf('Rat_ID');
        if (idIdx === -1) return alert("엑셀 첫 줄에 'Rat_ID' 열이 반드시 있어야 합니다.");

        csvUploadData = [];
        let previewHtml = '<table style="width:100%; border-collapse:collapse; white-space:nowrap;"><thead><tr style="background:#f1f3f5;">';
        headers.forEach(h => previewHtml += `<th style="border:1px solid #ddd; padding:5px;">${h}</th>`);
        previewHtml += '</tr></thead><tbody>';

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(',');
            if (cols.length < headers.length) continue; // 빈 줄 무시

            let rowData = {};
            previewHtml += '<tr>';
            headers.forEach((h, idx) => {
                const val = cols[idx] ? cols[idx].trim() : '';
                rowData[h] = val;
                previewHtml += `<td style="border:1px solid #eee; padding:5px;">${val}</td>`;
            });
            previewHtml += '</tr>';
            csvUploadData.push(rowData);
        }
        previewHtml += '</tbody></table>';
        
        document.getElementById('csv-preview-area').innerHTML = 
            `<p style="color:var(--navy); font-weight:bold; font-size:1rem; margin-bottom:10px;">
                ✅ 총 ${csvUploadData.length}마리의 데이터가 인식되었습니다. 표를 확인하시고 이상이 없으면 아래 저장 버튼을 누르세요.
            </p>` + previewHtml;
        
        document.getElementById('btn-save-csv').style.display = 'block';
    };
    // UTF-8로 읽어서 한글 깨짐 방지
    reader.readAsText(file, "UTF-8"); 
}

async function saveCsvToDB() {
    if (!csvUploadData.length) return;
    if (!confirm(`총 ${csvUploadData.length}마리의 데이터를 데이터베이스에 업데이트하시겠습니까?\n(기존 데이터에 덮어씌워지며 빈 칸은 안전하게 무시됩니다.)`)) return;

    const btn = document.getElementById('btn-save-csv');
    btn.innerText = "데이터 저장 중... 화면을 끄지 마세요!";
    btn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    try {
        // 직렬화 처리 (안정성을 위해 한 마리씩 순차 업데이트)
        for (const row of csvUploadData) {
            const ratId = row['Rat_ID'];
            if (!ratId) continue;

            const rSnap = await db.collection("rats").where("ratId", "==", ratId).get();
            if (rSnap.empty) {
                console.warn(`[${ratId}] 해당 쥐를 DB에서 찾을 수 없습니다.`);
                failCount++;
                continue;
            }
            
            const docRef = rSnap.docs[0].ref;
            const existingData = rSnap.docs[0].data();
            let updates = {};

            // 1. 단일 데이터 매핑
            if (row['Death_Date']) { updates.deathDate = row['Death_Date']; updates.status = '사망'; }
            if (row['OVX_Date']) updates.ovxDate = row['OVX_Date'];
            if (row['Sample_Type']) updates.sampleType = row['Sample_Type'];
            if (row['Sample_Date']) updates.sampleDate = row['Sample_Date'];
            if (row['Sample_Memo']) updates.sampleMemo = row['Sample_Memo'];

            // 2. 사망 원인(COD) 및 ARE 논리 매핑
            const cod = row['COD'];
            const areMain = row['ARE_Main'];
            const areSub = row['ARE_Sub'];
            
            let finalCod = cod || existingData.cod;
            let finalAreStr = existingData.are; 

            if (areMain === 'O') finalAreStr = `O (${areSub || '미확인'})`;
            else if (areMain === 'X') finalAreStr = 'X';

            if (cod || areMain) {
                if (finalCod) updates.cod = finalCod;
                if (finalAreStr) updates.are = finalAreStr;
                // 호환성을 위한 codFull 통합 저장
                if (finalCod && finalAreStr) updates.codFull = `${finalCod} / ARE: ${finalAreStr}`;
                else if (finalCod) updates.codFull = finalCod;
            }

            // 3. MR 촬영 시점 매핑 (기존 배열과 병합)
            let mrArr = existingData.mrDates || [];
            let hasNewMr = false;

            Object.keys(row).forEach(key => {
                if (key.startsWith('MR_') && row[key]) {
                    hasNewMr = true;
                    const timepoint = key.replace('MR_', '');
                    const newDate = row[key];
                    
                    // 기존 배열에 해당 시점이 이미 있다면 날짜만 덮어쓰고, 없다면 새로 밀어넣음
                    const existingIdx = mrArr.findIndex(m => m.timepoint === timepoint);
                    if (existingIdx > -1) {
                        mrArr[existingIdx].date = newDate;
                    } else {
                        mrArr.push({ timepoint: timepoint, date: newDate });
                    }
                }
            });

            if (hasNewMr) {
                // 시간 순서대로 예쁘게 정렬 후 업데이트
                mrArr.sort((a,b) => new Date(a.date) - new Date(b.date));
                updates.mrDates = mrArr;
            }

            // 업데이트 할 내용이 하나라도 있다면 DB 전송
            if (Object.keys(updates).length > 0) {
                await docRef.update(updates);
                successCount++;
            }
        }

        // 완료 후 캐시 비우고 알림
        clearRatsCache();
        alert(`✨ 대량 업데이트가 완료되었습니다!\n\n- 성공: ${successCount}건\n- 실패(없는 ID 등): ${failCount}건`);
        
        // UI 초기화
        document.getElementById('csv-preview-area').innerHTML = '';
        btn.style.display = 'none';
        document.getElementById('csv-upload-input').value = '';

    } catch (e) {
        console.error(e);
        alert("저장 중 시스템 오류가 발생했습니다: " + e.message);
    } finally {
        btn.innerText = "🚀 검토 완료: 데이터베이스에 덮어쓰기";
        btn.disabled = false;
    }
}


function openCodFlow(docId, inputId = null) {
    // Reset state
    codTargetDocId = docId;
    codTargetInputId = inputId;
    codTempData = { type: '', secondary: '', causes: [] };
    
    // Clear checks
    document.querySelectorAll('input[name="cod-check"]').forEach(cb => cb.checked = false);

    document.getElementById('cod-modal').style.display = 'flex';
    showCodStep(1);
}

function closeCod() {
    document.getElementById('cod-modal').style.display = 'none';
}

function showCodStep(step) {
    document.querySelectorAll('.cod-step-container').forEach(el => el.classList.remove('active'));
    // step can be '1', '2-neuro', '2-non-neuro', '3'
    document.getElementById(`cod-step-${step}`).classList.add('active');
}

function selectCodType(type) {
    codTempData.type = type;
    if(type === 'Neurological') {
        showCodStep('2-neuro');
    } else {
        showCodStep('2-non-neuro');
    }
}

// Neuro Path
function selectCodAn(anStatus) {
    codTempData.secondary = anStatus;
    showCodStep(3);
}

// Non-Neuro Path
function selectCodNonNeuroCause(cause) {
    // For Non-Neuro, secondary is the cause (Unknown or Surgical Failure or Sacrifice)
    codTempData.secondary = cause;
    // No Step 3. Save immediately.
    codTempData.causes = []; // Empty causes means no 3rd level
    saveCodFinal();
}

function codBack(toStep) {
    // toStep: 1, 'neuro-2', etc.
    if(toStep === 1) showCodStep(1);
    else if(toStep === 'neuro-2') showCodStep('2-neuro');
}

async function saveCodFinal() {
    // If Neuro path, collect checkboxes
    if(codTempData.type === 'Neurological') {
        const checkedBoxes = document.querySelectorAll('input[name="cod-check"]:checked');
        if(checkedBoxes.length === 0) return alert("하나 이상의 세부 원인을 선택해주세요.");
        codTempData.causes = Array.from(checkedBoxes).map(cb => cb.value);
    }

    // Construct Final String
    let finalStr = `${codTempData.type}`;
    
    // Format: Type (Secondary) - Causes...
    if(codTempData.secondary) {
        finalStr += ` (${codTempData.secondary})`;
    }
    
    if(codTempData.causes.length > 0) {
        finalStr += ' - ' + codTempData.causes.join(', ');
    }

    // Save Logic
    if(codTargetInputId) {
        document.getElementById(codTargetInputId).value = finalStr;
        closeCod();
    } else if(codTargetDocId) {
        try {
            await db.collection("rats").doc(codTargetDocId).update({ 
                codFull: finalStr,
                status: '사망', 
                
            });
            alert(`저장됨: ${finalStr}`);
            closeCod();
            loadDetailData(); 
        } catch(e) {
            console.error(e);
            alert("저장 실패");
        }
    }
}

function openSimpleCod(docId, currentCod, currentAre, currentDeathDate = '') {
    activeCodRatId = docId;
    document.getElementById('modal-cod').value = currentCod && currentCod !== '미기록' ? currentCod : '';
    
    let main = '', sub = '미확인';
    if(currentAre && currentAre !== '미기록') {
        main = currentAre.split(' ')[0];
        const s = currentAre.split(' ')[1];
        if(s) sub = s.replace(/[()]/g, '');
    }
    document.getElementById('modal-are-main').value = main;
    document.getElementById('modal-are-sub').value = sub;
    document.getElementById('modal-are-sub').style.display = main === 'O' ? 'block' : 'none';
    
    // 👇 사망일 필드 동적 생성 👇
    let deathInputBox = document.getElementById('modal-death-date-box');
    if (!deathInputBox) {
        const modalContent = document.querySelector('#simple-cod-modal > div');
        if(modalContent) {
            const btnDiv = modalContent.querySelector('div[style*="justify-content: flex-end"]') || modalContent.lastElementChild;
            deathInputBox = document.createElement('div');
            deathInputBox.id = 'modal-death-date-box';
            deathInputBox.style.marginBottom = '15px';
            deathInputBox.innerHTML = `
                <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:5px; color:var(--navy);">사망일 (선택)</label>
                <input type="date" id="modal-death-date" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
            `;
            modalContent.insertBefore(deathInputBox, btnDiv);
        }
    }
    if(document.getElementById('modal-death-date')) {
        document.getElementById('modal-death-date').value = currentDeathDate || '';
    }

    document.getElementById('simple-cod-modal').style.display = 'flex';
}

async function saveSimpleCod() {
    const cod = document.getElementById('modal-cod').value;
    const areMain = document.getElementById('modal-are-main').value;
    const areSub = document.getElementById('modal-are-sub').value;
    const deathDateEl = document.getElementById('modal-death-date');
    
    if(!cod || !areMain) return alert("COD와 ARE를 모두 선택해주세요.");
    
    const areStr = areMain === 'O' ? `O (${areSub})` : (areMain === 'X' ? 'X' : '');
    
    const updateData = {
        cod: cod,
        are: areStr,
        codFull: `${cod} / ARE: ${areStr}`
    };
    
    if (deathDateEl && deathDateEl.value) {
        updateData.deathDate = deathDateEl.value;
        updateData.status = '사망';
    }

    try {
        await db.collection("rats").doc(activeCodRatId).update(updateData);
        alert("저장되었습니다.");
        document.getElementById('simple-cod-modal').style.display = 'none';
        clearRatsCache();
        loadDetailData();
    } catch(e) {
        console.error(e);
        alert("오류: " + e.message);
    }
}


// ============================================================
//  AI 논문 작성용 풀-컨텍스트 구조화 데이터 추출 로직
// ============================================================
// ============================================================
//  AI 논문 작성용 풀-컨텍스트 데이터 추출 (100% 완벽 통합판)
// ============================================================
async function exportForAI() {
    const btn = document.getElementById('btn-extract-ai');
    const statusText = document.getElementById('ai-extract-status');
    
    if(!confirm("모든 데이터를 분석하여 AI가 읽기 좋은 텍스트 파일로 추출하시겠습니까?\n(주령, 사진 메모, DBP/Mean, 데일리 로그가 100% 포함됩니다.)")) return;

    btn.disabled = true;
    btn.style.background = '#ccc';
    statusText.innerHTML = '<div class="loader"></div> 데이터를 구조화하는 중...';

    try {
        const [rSnap, mSnap, cSnap, dailySnap, doseSnap] = await Promise.all([
            db.collection("rats").get(),
            db.collection("measurements").get(),
            db.collection("cohortNotes").get(),
            db.collection("dailyLogs").get(),
            db.collection("doseLogs").get()
        ]);

        const cohortInfo = {};
        cSnap.forEach(doc => { cohortInfo[doc.id] = doc.data().memo || "조건 미기재"; });

        const measData = {};
        mSnap.forEach(doc => { const d = doc.data(); if (!measData[d.ratId]) measData[d.ratId] = []; measData[d.ratId].push(d); });
        
        const dailyData = {};
        dailySnap.forEach(doc => { const d = doc.data(); if (!dailyData[d.ratId]) dailyData[d.ratId] = []; dailyData[d.ratId].push(d); });

        const doseData = {};
        doseSnap.forEach(doc => { const d = doc.data(); if (!doseData[d.ratId]) doseData[d.ratId] = []; doseData[d.ratId].push(d); });

        let aiText = `[SYSTEM PROMPT & CONTEXT]\n`;
        aiText += `당신은 최고 수준의 신경외과 및 기초의학 연구원입니다. 아래 제공되는 데이터는 뇌동맥류(Cerebral Aneurysm, ARE) 동물 모델(Rat)의 Raw Data입니다.\n`;
        aiText += `각 개체별 타임라인(수술, 사망, MR 촬영, 샘플 획득)과 해당 시점의 정확한 '주령(Age in weeks)'이 명시되어 있습니다.\n`;
        aiText += `혈압(SBP/DBP/Mean), 체중(WT), 매일의 상태 점수(Daily Score), 약물 투여량 및 연구자의 특이사항 메모(Photo/Sample Memos)까지 모두 활용하여 SCI급 논문 분석 및 초안 작성을 수행하십시오.\n\n`;
        aiText += `[🚨 중요: Sham/Naïve 대조군 데이터 해석 주의사항]\n`;
        aiText += `일부 개체는 'Ligation 안 함(Sham/Naïve)' 상태의 대조군입니다. 이 개체들의 타임라인에 표시되는 'Reference Date (Sham/Naïve, NO Ligation)'는 실제 수술을 받은 날짜가 아닙니다.\n`;
        aiText += `이 날짜는 수술군(평균 9주령 수술)과 동일한 기준점(Day 0)을 맞추기 위해, 해당 개체가 9주령이 되는 시점을 수학적으로 역산하여 부여한 '가상의 기준일'일 뿐입니다. 분석 시 이 개체들을 절대 수술을 받은 개체로 착각하지 말고, 완벽한 비수술 대조군으로 분리해서 분석하십시오.\n\n`;
        aiText += `=================================================\n\n`;
        
        aiText += `[1. COHORT EXPERIMENTAL CONDITIONS (코호트별 실험 조건)]\n`;
        
        const ratsByCohort = {};
        rSnap.forEach(doc => { const r = doc.data(); if (!ratsByCohort[r.cohort]) ratsByCohort[r.cohort] = []; ratsByCohort[r.cohort].push(r); });
        const sortedCohorts = Object.keys(ratsByCohort).sort((a,b) => Number(a) - Number(b));

        sortedCohorts.forEach(c => { aiText += `- Cohort ${c}: ${cohortInfo[c] || '메모 없음'}\n`; });
        aiText += `\n=================================================\n\n`;

        aiText += `[2. RAT TIMELINES & ALL LOGS (개체별 상세 타임라인 및 전체 로그)]\n`;

        sortedCohorts.forEach(c => {
            aiText += `\n### COHORT ${c} ###\n`;
            const rats = ratsByCohort[c].sort((a, b) => a.ratId.localeCompare(b.ratId));

            rats.forEach(r => {
                aiText += `\n▶ Rat ID: ${r.ratId}\n`;
                
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const arrDate = r.arrivalDate;
                
                const getAgeStr = (targetDateStr) => {
                    if(!targetDateStr || !arrDate) return '';
                    const target = new Date(targetDateStr);
                    const base = new Date(arrDate);
                    if(isNaN(target.getTime()) || isNaN(base.getTime())) return '';
                    const age = arrAge + ((target - base) / (1000*60*60*24*7));
                    return ` (${age.toFixed(1)} weeks old)`;
                };

                const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '-');
                const deathAgeStr = r.deathDate ? getAgeStr(r.deathDate) : '';
                aiText += `  - Status: ${r.status} ${r.deathDate ? `(Death Date: ${r.deathDate}${deathAgeStr})` : ''}\n`;
                aiText += `  - Cause of Death (COD): ${cod}\n`;
                aiText += `  - Aneurysm (ARE): ${r.are || '-'}\n`;

                aiText += `  - Timeline Events:\n`;
                aiText += `    * Arrival: ${r.arrivalDate || '-'} (Age: ${arrAge.toFixed(1)}w)\n`;
                if (r.ovxDate) aiText += `    * OVX Surgery: ${r.ovxDate}${getAgeStr(r.ovxDate)}\n`;
                
                // 🔥 AI에게 수술 여부 명확히 알리기
                if (r.isNonInduction) {
                    aiText += `    * Reference Date (Sham/Naïve, NO Ligation): ${r.surgeryDate || '-'}${getAgeStr(r.surgeryDate)}  <- 가상의 비교 기준점\n`;
                } else {
                    aiText += `    * Ligation Surgery (Day 0): ${r.surgeryDate || '-'}${getAgeStr(r.surgeryDate)}\n`;
                }

                if (r.mrDates && r.mrDates.length > 0) {
                    const mrStr = r.mrDates.sort((a,b) => new Date(a.date) - new Date(b.date))
                                    .map(m => `${m.timepoint} on ${m.date}${getAgeStr(m.date)}`).join(' | ');
                    aiText += `    * MR Scans: ${mrStr}\n`;
                } else { aiText += `    * MR Scans: None\n`; }

                if (r.sampleType && r.sampleType !== 'Fail') {
                    aiText += `    * Sample Acquired: ${r.sampleType} on ${r.sampleDate || '-'}${getAgeStr(r.sampleDate)} (Memo: ${r.sampleMemo || 'None'})\n`;
                } else if (r.sampleType === 'Fail') { aiText += `    * Sample Acquired: Failed\n`; }

                // 1. 혈압/체중 데이터 (DBP, Mean 추가)
                const ratMeas = measData[r.ratId] || [];
                if (ratMeas.length > 0) {
                    ratMeas.sort((a, b) => new Date(a.date) - new Date(b.date));
                    let measStrArr = ratMeas.map(m => {
                        const tp = m.timepoint || m.date;
                        let str = `[${tp}]`;
                        if (m.sbp) str += ` SBP:${m.sbp}`;
                        if (m.dbp) str += ` DBP:${m.dbp}`;
                        if (m.mean) str += ` Mean:${m.mean}`;
                        if (m.weight) str += ` WT:${m.weight}g`;
                        return str;
                    });
                    aiText += `  - Measurements (BP/WT): ${measStrArr.join(' | ')}\n`;
                } else { aiText += `  - Measurements (BP/WT): No data\n`; }

                // 2. 데일리 체크
                const ratDaily = dailyData[r.ratId] || [];
                if (ratDaily.length > 0) {
                    ratDaily.sort((a, b) => new Date(a.date) - new Date(b.date));
                    let dailyStrArr = ratDaily.map(d => {
                        const act = d.scores?.activity !== undefined ? d.scores.activity : (d.scores?.act || 0);
                        const fur = d.scores?.fur || 0;
                        const eye = d.scores?.eye || 0;
                        return `[${d.date}] Score:${d.totalScore}(A${act}/F${fur}/E${eye}) Memo:${d.note || '-'}`;
                    });
                    aiText += `  - Daily Checks: ${dailyStrArr.join(' | ')}\n`;
                }

                // 3. 투약 기록 (부피 ml 추가)
                const ratDose = doseData[r.ratId] || [];
                if (ratDose.length > 0) {
                    ratDose.sort((a, b) => new Date(a.date) - new Date(b.date));
                    let doseStrArr = ratDose.map(d => {
                        return `[${d.date}] WT:${d.weight}g Dose:${Number(d.doseMg).toFixed(2)}mg Vol:${Number(d.volMl).toFixed(2)}ml`;
                    });
                    aiText += `  - Dosing History: ${doseStrArr.join(' | ')}\n`;
                }

                // 4. 사진 메모 기록 (AI에게 특이사항 전달용)
                if (r.photos && r.photos.length > 0) {
                    const photoStrs = r.photos.map(p => `[${p.timepoint || p.photoDate || 'Unspecified'}] ${p.memo || 'No memo'}`);
                    aiText += `  - Researcher Memos (from Photos): ${photoStrs.join(' | ')}\n`;
                }
            });
        });

        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
        const fileName = `AI_Research_Data_Cerebral_Aneurysm_${dateStr}.txt`;

        const blob = new Blob([aiText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.innerHTML = `<span style="color:green;">✅ 데이터가 성공적으로 추출되어 다운로드되었습니다! (파일명: ${fileName})</span><br><span style="font-size:0.9rem; font-weight:normal; color:#555;">이 텍스트 파일을 AI 챗봇에 업로드하고 지시를 내려보세요.</span>`;

    } catch (e) {
        console.error(e);
        statusText.innerHTML = `<span style="color:red;">❌ 오류 발생: ${e.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.style.background = '#8e24aa';
    }
}

function toggleAllLogs(source, targetClass) {
    const checkboxes = document.querySelectorAll('.' + targetClass);
    checkboxes.forEach(cb => cb.checked = source.checked);
}


function uploadDailyLogs() {
    alert("CSV 업로드 기능은 현재 준비중입니다.");
}
