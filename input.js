function score(k, n, btn) { btn.parentElement.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentScores[k] = n; const t = currentScores.act+currentScores.fur+currentScores.eye; document.getElementById('score-res').innerText=`총점: ${t}점`; }
function mkId(p) { const c=document.getElementById(`${p}-c`).value, r=document.getElementById(`${p}-r`).value; if(c&&r) document.getElementById(`${p}-id`).value = `C${c.padStart(2,'0')}${r.padStart(2,'0')}`; }
function calM() { const s=Number(document.getElementById('re-s').value), d=Number(document.getElementById('re-d').value); if(s&&d) document.getElementById('re-m').value = Math.round(d+(s-d)/3); }
async function saveBulk() { const c=document.getElementById('add-c').value, s=Number(document.getElementById('add-s').value), e=Number(document.getElementById('add-e').value), d=document.getElementById('add-d').value; for(let i=s; i<=e; i++) { await db.collection("rats").add({ratId:`C${c.padStart(2,'0')}${String(i).padStart(2,'0')}`, cohort:c, num:String(i), arrivalDate:d, status:'생존'}); } clearRatsCache(); alert("완료"); }

async function saveDaily() {
    const id = document.getElementById('dc-id').value;
    const date = document.getElementById('dc-date').value;
    if(!id || !date) return alert("ID와 날짜를 확인하세요");
    if(!(await checkRatValid(id))) return;
    
    const note = document.getElementById('dc-note').value;
    const dead = document.getElementById('is-dead').checked;
    const total = currentScores.act + currentScores.fur + currentScores.eye;

    if (!dead && (currentScores.act === 0 || currentScores.fur === 0 || currentScores.eye === 0)) { 
        alert("Activity, Fur, Eye 점수를 모두 선택해주세요."); 
        return; 
    }
    
    try {
        // [수정] scores 저장 시 'act'를 'activity'로 명확하게 저장
        await db.collection("dailyLogs").add({ 
            ratId: id, 
            date: date, 
            timestamp: new Date().toLocaleTimeString(), 
            scores: { 
                activity: currentScores.act, // 여기서 변환
                fur: currentScores.fur, 
                eye: currentScores.eye 
            }, 
            totalScore: total, 
            note: note, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        const rSnap = await db.collection("rats").where("ratId", "==", id).get();
        if(!rSnap.empty) { 
            if(dead) { await rSnap.docs[0].ref.update({ status: '사망', deathDate: date }); } 
            else { await rSnap.docs[0].ref.update({ lastScore: total }); } 
        }
        
        clearRatsCache();
        alert("저장되었습니다.");
        document.getElementById('dc-note').value = '';
        document.getElementById('is-dead').checked = false;
    } catch(e) { console.error(e); alert("에러: " + e.message); }
}

function upDose() { const ns=document.getElementsByClassName('dn'), c=document.getElementById('ds-c').value; for(let i=0; i<ns.length; i++) document.getElementsByClassName('di')[i].innerText = (c&&ns[i].value)?`C${c.padStart(2,'0')}${ns[i].value.padStart(2,'0')}`:'-'; }


async function saveDose() { 
    const c = document.getElementById('ds-c').value;
    const ws = document.getElementsByClassName('dw');
    const is = document.getElementsByClassName('di');
    
    let cnt = 0; let indivList = ''; let tMg = 0; let tVol = 0;
    try {
        for(let i=0; i<ws.length; i++) { 
            if(ws[i].value && is[i].innerText!=='-') { 
                const ratId = is[i].innerText;
                if(!(await checkRatValid(ratId))) continue; 
                const w = Number(ws[i].value); const mg = (w/1000)*4*1.15; const vol = mg/2.5;        
                tMg += mg; tVol += vol; cnt++;
                indivList += `<div style="padding:4px 0; border-bottom:1px solid #eee; display:flex; justify-content:space-between;"><span>${ratId}</span><span style="font-weight:bold;">${vol.toFixed(2)} ml</span></div>`;
                await db.collection("doseLogs").add({ ratId:ratId, cohort:c, weight:w, doseMg:mg, volMl:vol, date:new Date().toISOString().split('T')[0] }); 
            } 
        }
        if(cnt) {
            const resBox = document.getElementById('dose-res');
            resBox.style.display = 'block'; 
            resBox.innerHTML = `<div style="margin-bottom:20px;"><h4 style="color:var(--navy); margin-bottom:10px;">📊 오늘 소분 용량</h4><div style="background:white; padding:10px; border-radius:8px; border:1px solid #eee;">${indivList}</div></div><div style="background:#e8f5e9; padding:15px; border-radius:8px; border:1px solid #c8e6c9;"><h4 style="color:#2e7d32; margin:0 0 10px 0;">🧪 오늘 준비량</h4><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>약물 총량:</span><b>${tMg.toFixed(2)} mg</b></div><div style="display:flex; justify-content:space-between;"><span>용액 총량:</span><b>${tVol.toFixed(2)} ml</b></div></div>`;
            alert("저장되었습니다.");
        } else { alert("유효한 입력 데이터가 없습니다."); }
    } catch(e) { console.error(e); alert("저장 중 오류 발생: " + e.message); }
}

async function saveRec() { 
    const id=document.getElementById('re-id').value; 
    if(!(await checkRatValid(id))) return;
    const sbp = Number(document.getElementById('re-s').value); const dbp = Number(document.getElementById('re-d').value); const mean = Number(document.getElementById('re-m').value); const wt = Number(document.getElementById('re-w').value);
    await db.collection("measurements").add({ ratId:id, sbp: sbp, dbp: dbp, mean: mean, weight: wt, date:document.getElementById('re-date').value, timepoint:document.getElementById('re-tp').value }); 
    alert("저장되었습니다."); 
}

// ==========================================
//  신규 데이터 필드 제어 함수 (반입주령, OVX, MR, 샘플)
// ==========================================

async function upArrivalAge(did) {
    const val = document.getElementById('arr-age').value;
    try {
        await db.collection("rats").doc(did).update({ arrivalAge: Number(val) });
        clearRatsCache(); 
        alert("저장되었습니다."); 
        loadDetailData();
    } catch(e) { console.error(e); alert("오류: " + e.message); }
}

async function upOvx(did) {
    const val = document.getElementById('ovx-d').value;
    try {
        await db.collection("rats").doc(did).update({ ovxDate: val });
        clearRatsCache(); 
        alert("저장되었습니다."); 
        loadDetailData();
    } catch(e) { console.error(e); alert("오류: " + e.message); }
}


async function upSampleInfo(did) {
    const tp = document.getElementById('sample-tp').value;
    const dt = document.getElementById('sample-d').value;
    const memo = document.getElementById('sample-memo').value;
    try {
        await db.collection("rats").doc(did).update({ sampleType: tp, sampleDate: dt, sampleMemo: memo });
        clearRatsCache(); 
        alert("샘플 정보가 저장되었습니다."); 
        loadDetailData();
    } catch(e) { console.error(e); alert("오류: " + e.message); }
}

// [교체] MR 추가 함수
async function addMrDate(did) {
    const tp = document.getElementById('new-mr-tp').value;
    const dt = document.getElementById('new-mr-d').value;
    const size = document.getElementById('new-mr-infarct-size').value;
    const loc = document.getElementById('new-mr-infarct-loc').value;
    if(!dt) return alert("날짜를 선택하세요.");
    
    try {
        const docRef = db.collection("rats").doc(did);
        const doc = await docRef.get();
        const arr = doc.data().mrDates || [];
        arr.push({ timepoint: tp, date: dt, infarctSize: size, infarctLoc: loc }); // 데이터 속성 추가
        
        arr.sort((a,b) => new Date(a.date) - new Date(b.date));
        
        await docRef.update({ mrDates: arr });
        clearRatsCache(); 
        loadDetailData();
    } catch(e) { console.error(e); alert("오류: " + e.message); }
}

async function removeMrDate(did, idx) {
    if(!confirm("해당 MR 기록을 삭제하시겠습니까?")) return;
    try {
        const docRef = db.collection("rats").doc(did);
        const doc = await docRef.get();
        const arr = doc.data().mrDates || [];
        arr.splice(idx, 1);
        await docRef.update({ mrDates: arr });
        clearRatsCache(); 
        loadDetailData();
    } catch(e) { console.error(e); alert("오류: " + e.message); }
}


async function upDoseStart(did) {
    const doc = await db.collection("rats").doc(did).get();
    if(doc.exists) { const ratId = doc.data().ratId; if(!(await checkRatValid(ratId))) return; }
    await db.collection("rats").doc(did).update({ doseStartDate: document.getElementById('dose-start-d').value });
    alert("저장되었습니다."); loadDetailData();
}

async function upSurg(did) { 
    const doc = await db.collection("rats").doc(did).get();
    if(doc.exists) { const ratId = doc.data().ratId; if(!(await checkRatValid(ratId))) return; }
    await db.collection("rats").doc(did).update({ surgeryDate: document.getElementById('surg-d').value }); 
    alert("저장되었습니다."); loadDetailData(); 
}

// [추가] 샘플 타입 저장 함수
// [수정] 샘플 타입 저장 함수 (사망 여부 체크 로직 제거)
async function upSampleType(did) {
    // 1. 선택된 값 가져오기
    const el = document.getElementById('sample-tp');
    if (!el) return; 
    const val = el.value;

    try {
        // 2. 문서 참조 가져오기
        const docRef = db.collection("rats").doc(did);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            alert("해당 랫드 데이터를 찾을 수 없습니다.");
            return;
        }

        // 3. (중요) 사망 여부 체크(checkRatValid) 없이 즉시 업데이트
        await docRef.update({ sampleType: val });
        clearRatsCache();
        alert("샘플 정보가 저장되었습니다.");
        loadDetailData(); // 화면 갱신
    } catch(e) {
        console.error(e);
        alert("저장 중 오류 발생: " + e.message);
    }
}


async function toggleMr(e, c, tp) {
    e.stopPropagation(); 
    if(!confirm(`[Cohort ${c}] ${tp} 시점의 MR 촬영 여부를 변경하시겠습니까?`)) { e.preventDefault(); return; }
    const val = e.target.checked;
    try { await db.collection("cohortNotes").doc(c).set({ mrChecks: { [tp]: val } }, { merge: true }); } catch(err) { console.error(err); alert("저장 실패"); e.preventDefault(); }
}

function toggleCoMemo(c) {
    const txt = document.getElementById(`memo-txt-${c}`);
    const area = document.getElementById(`memo-edit-area-${c}`);
    if(area.style.display === 'none') { area.style.display = 'inline-block'; txt.style.display = 'none'; } else { area.style.display = 'none'; txt.style.display = 'inline-block'; }
}

async function saveCoMemo(c) {
    const val = document.getElementById(`memo-inp-${c}`).value;
    await db.collection("cohortNotes").doc(c).set({ memo: val }, { merge: true }); 
    document.getElementById(`memo-txt-${c}`).innerText = val;
    toggleCoMemo(c);
}

// MR 설정창 열기/닫기
function toggleMrConfig(c) {
    const el = document.getElementById(`mr-cfg-panel-${c}`);
    if(el.style.display === 'none') {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// MR 설정 저장
async function saveMrConfig(c) {
// [수정] 점(.)이 포함된 코호트 번호(예: 7.5) 오류 해결을 위해 
// 부모 컨테이너(ID)를 먼저 찾고 그 안의 체크박스를 조회합니다.
    const container = document.getElementById(`mr-cfg-panel-${c}`);
    if (!container) return; 

    const chks = container.querySelectorAll('input[type="checkbox"]:checked');
    const selected = Array.from(chks).map(cb => cb.value);
    
    if(selected.length === 0) { 
        if(!confirm("선택된 시점이 없습니다. 모든 MR 체크박스를 숨기시겠습니까?")) return; 
    }
    
    // 정렬 로직 (기존과 동일)
    selected.sort((a, b) => (globalPodMap[a] || 0) - (globalPodMap[b] || 0));
    
    try {
        await db.collection("cohortNotes").doc(String(c)).set({ mrConfig: selected }, { merge: true });
        alert("설정이 저장되었습니다.");
        loadDashboard();
    } catch(e) { 
        console.error(e); 
        alert("저장 중 오류가 발생했습니다: " + e.message); 
    }
}
