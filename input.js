function score(k, n, btn) { btn.parentElement.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentScores[k] = n; const t = currentScores.act+currentScores.fur+currentScores.eye; document.getElementById('score-res').innerText=`총점: ${t}점`; }
function mkId(p) { const c=document.getElementById(`${p}-c`).value, r=document.getElementById(`${p}-r`).value, g=document.getElementById(`${p}-g`).value || '1'; if(c&&r) document.getElementById(`${p}-id`).value = `C${c.padStart(2,'0')}${r.padStart(2,'0')}G${g}`; }
function calM() { const s=Number(document.getElementById('re-s').value), d=Number(document.getElementById('re-d').value); if(s&&d) document.getElementById('re-m').value = Math.round(d+(s-d)/3); }
// 입력된 Rat ID가 DB에 존재하는지 확인하는 함수
async function checkRatValid(ratId) {
    if (!ratId) {
        alert("Rat ID를 입력해주세요.");
        return false;
    }
    
    try {
        const snap = await db.collection("rats").where("ratId", "==", ratId).get();
        if (snap.empty) {
            alert(`DB에 존재하지 않는 개체입니다: ${ratId}\nID를 다시 확인해주세요.`);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Rat ID 검증 중 오류:", e);
        alert("ID 확인 중 시스템 오류가 발생했습니다.");
        return false;
    }
}

async function saveBulk() { 
    const c=document.getElementById('add-c').value, g=document.getElementById('add-g').value || '1';
    const s=Number(document.getElementById('add-s').value), e=Number(document.getElementById('add-e').value), d=document.getElementById('add-d').value; 
    for(let i=s; i<=e; i++) { 
        await db.collection("rats").add({
            ratId:`C${c.padStart(2,'0')}${String(i).padStart(2,'0')}G${g}`, 
            cohort:c, 
            group:`G${g}`, 
            num:String(i), 
            arrivalDate:d, 
            status:'생존'
        }); 
    } 
    clearRatsCache(); alert("완료"); 
}

async function saveDaily() {
    const id = document.getElementById('dc-id').value;
    const date = document.getElementById('dc-date').value;
    if(!id || !date) return alert("ID와 날짜를 확인하세요");
    if(!(await checkRatValid(id))) return;
    
    const note = document.getElementById('dc-note').value;
    const dead = document.getElementById('is-dead').checked;
    const total = currentScores.act + currentScores.fur + currentScores.eye;

    // [신규] 체중 입력창 데이터 (프론트엔드에 id="dc-wt", id="dc-tp"가 있다고 가정)
    const wtInput = document.getElementById('dc-wt');
    const tpInput = document.getElementById('dc-tp');
    const wt = wtInput ? wtInput.value : '';
    const tp = tpInput ? tpInput.value : '';

    if (!dead && total === 0 && !note && !wt) { 
        alert("상태 점수, 메모, 체중 중 최소 하나 이상을 입력해주세요."); 
        return; 
    }
    
    try {
        let savedCount = 0;

        // 1. 데일리 체크 내용이 있을 때 저장
        if (total > 0 || note || dead) {
            await db.collection("dailyLogs").add({ 
                ratId: id, 
                date: date, 
                timestamp: new Date().toLocaleTimeString(), 
                scores: { activity: currentScores.act, fur: currentScores.fur, eye: currentScores.eye }, 
                totalScore: total, 
                note: note, 
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            
            const rSnap = await db.collection("rats").where("ratId", "==", id).get();
            if(!rSnap.empty) {
                if(dead) {
                    await rSnap.docs[0].ref.update({ status: '사망', deathDate: date });
                    await closeOpenHousing(id, '사망');   // 케이지 재실도 닫아야 섭취량 계산이 안 어긋남
                }
                else { await rSnap.docs[0].ref.update({ lastScore: total }); }
            }
            savedCount++;
        }

        // 2. 체중(WT) 내용이 있을 때 저장
        if (wt) {
            if (!tp) return alert("체중을 저장하시려면 '시점(W1, D2 등)'을 반드시 선택해야 합니다.");
            
            await db.collection("measurements").add({ 
                ratId: id, 
                weight: Number(wt), 
                date: date, 
                timepoint: tp,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            savedCount++;
        }

        if (savedCount > 0) {
            clearRatsCache();
            invalidateDashboardDom(); // 🌟 대시보드 색상 즉시 반영
            alert("입력하신 데이터가 성공적으로 저장되었습니다!");
            
            // 입력창 초기화
            document.getElementById('dc-note').value = '';
            document.getElementById('is-dead').checked = false;
            if(wtInput) wtInput.value = '';
            
            document.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active'));
            currentScores = { act: 0, fur: 0, eye: 0 };
            const scoreRes = document.getElementById('score-res');
            if (scoreRes) scoreRes.innerText = '총점: 0점';
        }
    } catch(e) { console.error(e); alert("에러: " + e.message); }
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

// ==========================================
// 그룹 메모 토글 및 저장 함수
// ==========================================
window.toggleGrpMemo = function(c, g) {
    const txt = document.getElementById(`memo-txt-${c}-${g}`);
    const area = document.getElementById(`memo-edit-area-${c}-${g}`);
    if(area.style.display === 'none') { 
        area.style.display = 'inline-flex'; 
        txt.style.display = 'none'; 
    } else { 
        area.style.display = 'none'; 
        txt.style.display = 'inline-block'; 
    }
}

window.saveGrpMemo = async function(c, g) {
    const val = document.getElementById(`memo-inp-${c}-${g}`).value;
    const key = `memo_${g}`; // DB에 저장될 키값 (예: memo_G1)
    try {
        await db.collection("cohortNotes").doc(String(c)).set({ [key]: val }, { merge: true }); 
        document.getElementById(`memo-txt-${c}-${g}`).innerText = val || '그룹 메모';
        toggleGrpMemo(c, g);
    } catch(e) { console.error(e); alert("메모 저장 실패"); }
}

// ==========================================
// 랫드 그룹(G) 변경 및 연관 데이터 ID 마이그레이션 함수
// ==========================================
window.changeRatGroup = async function(docId, oldRatId, newGroupNum) {
    const newGroup = "G" + newGroupNum;
    const newRatId = oldRatId.replace(/G\d+$/, '') + newGroup; // 기존 ID에서 G숫자만 갈아끼움
    if (oldRatId === newRatId) return;

    if(!confirm(`[${oldRatId}] 개체를 [${newGroup}] 그룹으로 이동하시겠습니까?\n모든 관련 데이터(혈압/체중/투약/데일리)의 소유자 ID가 [${newRatId}](으)로 연동 변경됩니다.`)) {
        loadDetailData(oldRatId); // 취소 시 셀렉트박스 원상복구를 위해 화면 새로고침
        return;
    }

    try {
        // 1. 쥐 본체 정보 업데이트
        await db.collection("rats").doc(docId).update({
            ratId: newRatId,
            group: newGroup
        });

        // 2. 연관된 하위 기록들의 ID를 모두 새 ID로 갈아끼우는 작업
        const collections = ["measurements", "dailyLogs", "doseLogs"];
        for (const col of collections) {
            const snap = await db.collection(col).where("ratId", "==", oldRatId).get();
            const promises = snap.docs.map(d => d.ref.update({ ratId: newRatId }));
            await Promise.all(promises);
        }

        // 2-1. 재실 기록(ratHousing)도 반드시 같이 갈아끼운다.
        // 여기를 빠뜨리면 케이지 안의 쥐가 통째로 사라진 것처럼 보이고,
        // 케이지에 남은 옛 군 표기 때문에 재배정까지 막힌다.
        const hSnap = await db.collection("ratHousing").where("ratId", "==", oldRatId).get();
        const touchedCages = new Set();
        await Promise.all(hSnap.docs.map(d => {
            if (d.data().to === null) touchedCages.add(String(d.data().cageId));
            return d.ref.update({ ratId: newRatId, group: newGroup });
        }));

        // 2-2. 케이지 문서에 사본으로 남아 있는 군 표기도 현재 입주 상태로 맞춘다.
        for (const cid of touchedCages) {
            const openSnap = await db.collection("ratHousing")
                .where("cageId", "==", cid).where("to", "==", null).get();
            const groups = openSnap.docs.map(d => d.data().group).filter(Boolean);
            await db.collection("cages").doc(cid).set({ group: groups[0] || null }, { merge: true });
        }

        clearRatsCache(); // 데이터가 바뀌었으니 캐시 날리기 (아래 재계산이 새 값을 읽어야 한다)

        // 2-3. 이미 저장된 급여 기록의 군 표기도 재실 이력 기준으로 다시 맞춘다.
        // 섭취량 분석은 기록에 박힌 군을 우선하므로, 안 고치면 그 구간이 옛 군으로 집계된다.
        try {
            const ratSnap = await db.collection("rats").doc(docId).get();
            const cohort = ratSnap.exists ? ratSnap.data().cohort : null;
            if (cohort) {
                const fixes = await feedingGroupFixes(cohort);
                if (fixes.length && confirm(
                        `급여 기록 ${fixes.length}건의 군 표기가 옛 군으로 남아 있습니다.` + "\n" +
                        fixes.slice(0, 10).map(f => `${f.cageId}번 · ${f.dateStr} · ${f.from || '미지정'} → ${f.to}`).join("\n") +
                        (fixes.length > 10 ? `\n… 외 ${fixes.length - 10}건` : '') +
                        "\n\n지금 함께 정정할까요? (바꾸기 전 값은 백업 파일로 받습니다)")) {
                    feedingGroupBackup(fixes);
                    await applyFeedingGroupFixes(fixes);
                }
            }
        } catch (e) {
            console.error('급여 기록 군 표기 재계산 실패:', e);
        }

        alert("✅ 그룹 이동 및 모든 데이터 연동이 성공적으로 완료되었습니다!");
        
        // 모달창이 열려있다면 모달 타이틀 업데이트
        const modalTitle = document.getElementById('rdm-title');
        if (modalTitle && modalTitle.innerText === oldRatId) {
            modalTitle.innerText = newRatId;
        }
        
        // 바뀐 ID로 상세 화면 다시 로드
        loadDetailData(newRatId); 
        
        // 배경의 대시보드도 갱신 (열려있는 경우)
        if (document.getElementById('dash-container')) loadDashboard();

    } catch(e) {
        console.error(e);
        alert("변경 중 오류가 발생했습니다: " + e.message);
    }
}