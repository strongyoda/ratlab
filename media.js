window.addEventListener('paste', e => {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if(!window.currentRatDocId) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const files = [];
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) files.push(item.getAsFile());
    }
    if(files.length > 0) { e.preventDefault(); addFilesToStage(files, window.currentRatDocId); }
});

// [수정 완료] 중복된 3개의 이벤트를 1개로 깔끔하게 통합!
window.addEventListener('DOMContentLoaded', () => {
    const img = document.getElementById('photo-viewer-img');
    if(!img) return;

    img.addEventListener('wheel', (e) => {
        e.preventDefault();
        pvScale += e.deltaY < 0 ? 0.15 : -0.15;
        if(pvScale < 0.5) pvScale = 0.5;
        if(pvScale > 5) pvScale = 5;
        img.style.transform = `translate(${pvTransX}px, ${pvTransY}px) scale(${pvScale})`;
    });

    // 드래그(복사) 잔상 현상 차단
    img.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        pvDragging = true;
        pvStartX = e.clientX - pvTransX;
        pvStartY = e.clientY - pvTransY;
        img.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
        pvDragging = false;
        if(img) img.style.cursor = 'grab';
    });

    window.addEventListener('mousemove', (e) => {
        if(!pvDragging) return;
        pvTransX = e.clientX - pvStartX;
        pvTransY = e.clientY - pvStartY;
        img.style.transform = `translate(${pvTransX}px, ${pvTransY}px) scale(${pvScale})`;
    });
});


// ==========================================
//  멀티 이미지 업로드, 시점 설정, 뷰어 통합 제어 로직
// ==========================================
function compressImage(file, rMark = 'none') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const maxDim = 1280;

                if (width > maxDim || height > maxDim) {
                    if (width > height) { height = Math.round((height *= maxDim / width)); width = maxDim; }
                    else { width = Math.round((width *= maxDim / height)); height = maxDim; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                if (rMark && rMark !== 'none') {
                    const fontSize = Math.max(40, Math.floor(Math.min(width, height) * 0.08));
                    ctx.font = `900 ${fontSize}px Arial`;
                    ctx.fillStyle = '#ffeb3b'; 
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'; ctx.shadowBlur = 8;
                    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;

                    let x = width / 2, y = height / 2; const padding = fontSize;
                    if (rMark === 'right') x = width - padding;
                    else if (rMark === 'left') x = padding;
                    else if (rMark === 'top') y = padding;
                    else if (rMark === 'bottom') y = height - padding;
                    ctx.fillText('R', x, y);
                }
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };
            img.src = event.target.result;
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function handlePhotoSelect(e, docId) { addFilesToStage(e.target.files, docId); e.target.value = ''; }
function handlePhotoDrop(e, docId) {
    e.preventDefault();
    document.getElementById(`photo-dropzone-${docId}`).style.background = '#f8f9fa';
    document.getElementById(`photo-dropzone-${docId}`).style.borderColor = '#1a237e';
    addFilesToStage(e.dataTransfer.files, docId);
}

function addFilesToStage(files, docId) {
    let added = false;
    for(let i=0; i<files.length; i++) {
        if(files[i].type.startsWith('image/')) {
            stagedPhotos.push({ id: 'stage_' + Date.now() + '_' + i, file: files[i], url: URL.createObjectURL(files[i]) });
            added = true;
        }
    }
    if(added) renderStagingArea(docId);
}

function removeStagedPhoto(id, docId) { stagedPhotos = stagedPhotos.filter(p => p.id !== id); renderStagingArea(docId); }

function renderStagingArea(docId) {
    const area = document.getElementById(`photo-staging-area-${docId}`);
    const list = document.getElementById(`photo-staging-list-${docId}`);
    if(!area || !list) return;

    if(stagedPhotos.length === 0) { area.style.display = 'none'; return; }
    area.style.display = 'block';
    
    const tpOptions = ['D00','D0','D2','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'].map(v=>`<option value="${v}">${v}</option>`).join('');
    
    // 오늘 날짜를 기본값으로 세팅
    const todayStr = new Date().toISOString().split('T')[0];
    
    let html = '';
    stagedPhotos.forEach(p => {
        html += `
        <div style="display:flex; gap:10px; align-items:center; background:#f1f3f5; padding:10px; border-radius:6px; border:1px solid #ccc;">
            <img src="${p.url}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; border:1px solid #aaa;">
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                <span style="font-size:0.85rem; font-weight:bold; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${p.file.name}</span>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <input type="date" id="stage-date-${p.id}" value="${todayStr}" style="width:125px; padding:6px; font-size:0.85rem; border-radius:4px; border:1px solid #bbb;">
                    <select id="stage-tp-${p.id}" style="width:120px; padding:6px; font-size:0.85rem; border-radius:4px; border:1px solid #bbb;">
                        <option value="none">시점(선택안함)</option>
                        ${tpOptions}
                    </select>
                    <select id="stage-rmark-${p.id}" style="width:110px; padding:6px; font-size:0.85rem; border-radius:4px; border:1px solid #bbb;">
                        <option value="none">R 마크 (X)</option>
                        <option value="right">▶ 오른쪽 (R)</option>
                        <option value="left">◀ 왼쪽 (R)</option>
                        <option value="top">▲ 위쪽 (R)</option>
                        <option value="bottom">▼ 아래쪽 (R)</option>
                    </select>
                    <input type="text" id="stage-memo-${p.id}" placeholder="개별 메모 (예: 조직 채취시 손상)" style="flex:1; min-width:150px; padding:6px; font-size:0.85rem; border-radius:4px; border:1px solid #bbb;">
                </div>
            </div>
            <button class="btn-red" onclick="removeStagedPhoto('${p.id}', '${docId}')" style="padding:6px 12px; font-weight:bold; font-size:1.1rem;">✖</button>
        </div>
        `;
    });
    list.innerHTML = html;
}

async function uploadAllStagedPhotos(docId) {
    if(stagedPhotos.length === 0) return;
    const btn = document.getElementById(`photo-upload-all-btn-${docId}`);
    btn.innerText = `업로드 중... (0 / ${stagedPhotos.length})`;
    btn.disabled = true;

    let successCount = 0; const newPhotos = [];

    try {
        for(let i = 0; i < stagedPhotos.length; i++) {
            const p = stagedPhotos[i];
            const memoVal = document.getElementById(`stage-memo-${p.id}`).value.trim();
            const rMarkVal = document.getElementById(`stage-rmark-${p.id}`).value;
            const tpVal = document.getElementById(`stage-tp-${p.id}`).value;
            const dateVal = document.getElementById(`stage-date-${p.id}`).value; // 날짜 추출

            btn.innerText = `압축 및 업로드 중... (${i + 1} / ${stagedPhotos.length})`;

            const compressedBlob = await compressImage(p.file, rMarkVal);
            const filename = `rats_photos/${docId}/${Date.now()}_${i}_${p.file.name}.jpg`;
            const storageRef = firebase.storage().ref().child(filename);
            
            const snapshot = await storageRef.put(compressedBlob);
            const downloadURL = await snapshot.ref.getDownloadURL();

            newPhotos.push({
                url: downloadURL,
                memo: memoVal,
                rMark: rMarkVal,
                timepoint: tpVal,
                photoDate: dateVal, // DB에 날짜 저장
                timestamp: new Date().toISOString(),
                filename: filename
            });
            successCount++;
        }

        btn.innerText = `데이터베이스 저장 중...`;
        for (let np of newPhotos) {
            await db.collection('rats').doc(docId).update({ photos: firebase.firestore.FieldValue.arrayUnion(np) });
        }

        alert(`${successCount}장의 사진이 성공적으로 등록되었습니다.`);
        stagedPhotos = []; 
        clearRatsCache();
        await loadDetailData();

    } catch(e) {
        console.error(e); alert("오류 발생: " + e.message);
        btn.innerText = "🚀 준비된 사진 모두 업로드"; btn.disabled = false;
    }
}

async function deletePhoto(docId, photoObjStr) {
    if(!confirm("이 사진을 정말 삭제하시겠습니까?")) return;
    const photoObj = JSON.parse(decodeURIComponent(photoObjStr));
    try {
        await firebase.storage().ref().child(photoObj.filename).delete().catch(e=>console.warn(e));
        await db.collection('rats').doc(docId).update({ photos: firebase.firestore.FieldValue.arrayRemove(photoObj) });
        alert("삭제되었습니다."); clearRatsCache(); loadDetailData();
    } catch(e) { console.error(e); alert("삭제 실패"); }
}


function openPhotoViewer(url, memo) {
    const modal = document.getElementById('photo-viewer-modal');
    const img = document.getElementById('photo-viewer-img');
    document.getElementById('photo-viewer-memo').innerText = memo || '메모 없음';
    img.src = url;
    pvScale = 1; pvTransX = 0; pvTransY = 0;
    img.style.transform = `translate(0px, 0px) scale(1)`;
    modal.style.display = 'flex';
}
function closePhotoViewer() { document.getElementById('photo-viewer-modal').style.display = 'none'; }



// ==========================================
//  PPT 프레젠테이션 모드 엔진 (완벽 통합본)
// ==========================================


function openPptSetup() {
    const modal = document.getElementById('ppt-setup-modal');
    const sel = document.getElementById('ppt-cohort-sel');
    modal.style.display = 'flex';
    sel.innerHTML = '<option value="">데이터 불러오는 중...</option>';

    getRatsWithCache().then(ratsData => {
        const cohorts = new Set();
        ratsData.forEach(d => { if (d.cohort) cohorts.add(d.cohort); });
        const sorted = Array.from(cohorts).sort((a, b) => Number(b) - Number(a));
        
        if (sorted.length === 0) {
            sel.innerHTML = '<option value="">데이터 없음</option>';
        } else {
            sel.innerHTML = '<option value="">-- 코호트 선택 --</option>' + 
                            sorted.map(c => `<option value="${c}">Cohort ${c}</option>`).join('');
        }
    }).catch(e => {
        console.error(e);
        sel.innerHTML = '<option value="">오류 발생</option>';
    });
}

async function startPpt() {
    const cohort = document.getElementById('ppt-cohort-sel').value;
    if(!cohort) return alert("코호트를 선택하세요.");
    
    const btn = document.querySelector('#ppt-setup-modal .btn-blue');
    btn.innerText = "데이터 및 사진 미리 불러오는 중...";
    btn.disabled = true;

    try {
        const rSnap = await db.collection("rats").where("cohort", "==", cohort).get();
        if(rSnap.empty) { throw new Error("해당 코호트에 데이터가 없습니다."); }
        
        let rats = [];
        rSnap.forEach(d => rats.push(d.data()));
        rats.sort((a, b) => a.ratId.localeCompare(b.ratId));

        rats.forEach(r => {
            if(r.photos) {
                r.photos.forEach(p => {
                    if(p.url) { const img = new Image(); img.src = p.url; }
                });
            }
        });

        const promises = rats.map(r => db.collection("measurements").where("ratId", "==", r.ratId).get());
        const measSnaps = await Promise.all(promises);
        
        const ratMeasData = {}; 
        measSnaps.forEach((snap, idx) => {
            const r = rats[idx];
            ratMeasData[r.ratId] = [];
            snap.forEach(doc => {
                const d = doc.data();
                ratMeasData[r.ratId].push({
                    date: d.date,
                    label: d.timepoint || d.date,
                    sbp: d.sbp || null,
                    wt: d.weight || null
                });
            });
            ratMeasData[r.ratId].sort((a,b) => new Date(a.date) - new Date(b.date));
        });

        pptSlides = [];
        pptSlides.push({ type: 'title', title: `Cohort ${cohort}<br>프레젠테이션` });
        pptSlides.push({ type: 'summary', rats: rats });

        const tpWeight = { 'D00':-1, 'D0':0, 'D2':2, 'W1':7, 'W2':14, 'W3':21, 'W4':28, 'W5':35, 'W6':42, 'W7':49, 'W8':56, 'W9':63, 'W10':70, 'W11':77, 'W12':84, 'none':9999 };
        
        rats.forEach(r => {
            const codStr = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '미기록');
            let ageStr = '';
            if (r.status === '사망' && r.arrivalDate && r.deathDate) {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const deathAge = arrAge + ((new Date(r.deathDate) - new Date(r.arrivalDate)) / (1000 * 60 * 60 * 24 * 7));
                ageStr = ` <span style="color:#ff8a80; font-size:1.1rem; font-weight:bold;">(사망 시점: ${deathAge.toFixed(1)}주령)</span>`;
            } else if (r.status === '생존') {
                ageStr = ` <span style="color:#81c784; font-size:1.1rem; font-weight:bold;">(생존)</span>`;
            }
            
            // 기존 헤더 텍스트에 ageStr을 뒤에 붙여줍니다.
            const headerText = `${r.ratId} <span style="font-weight:400; font-size:1.2rem; color:#ffb74d; margin-left:15px;">| 사망원인: ${codStr}</span>${ageStr}`;

            let photos = r.photos || [];
            
            // --- 날짜순 최우선 정렬 ---
            photos.sort((a,b) => {
                if (a.photoDate && b.photoDate && a.photoDate !== b.photoDate) {
                    return new Date(a.photoDate) - new Date(b.photoDate);
                }
                const wA = (a.timepoint && tpWeight[a.timepoint] !== undefined) ? tpWeight[a.timepoint] : 9999;
                const wB = (b.timepoint && tpWeight[b.timepoint] !== undefined) ? tpWeight[b.timepoint] : 9999;
                if(wA !== wB) return wA - wB;
                return new Date(a.timestamp||0) - new Date(b.timestamp||0);
            });

            for(let i=0; i<photos.length; i+=2) {
                pptSlides.push({ type: 'photos', header: headerText, photos: photos.slice(i, i+2) });
            }
            pptSlides.push({ type: 'charts', header: headerText, ratId: r.ratId, data: ratMeasData[r.ratId] });
        });

        let totalN = rats.length;
        let surgFailN = 0, areO = 0, areX = 0, areMicro = 0, areMacro = 0, areUnk = 0;
        let sahN = 0, infarctN = 0, vasoN = 0, sacN = 0;
        let survivalN = 0;

        rats.forEach(r => {
            if(r.status === '생존') survivalN++;
            
            const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '');
            if (cod === 'Surgical Failure') surgFailN++;
            if (cod === 'SAH') sahN++;
            if (cod === 'Infarction') infarctN++;
            if (cod === 'Vasospasm') vasoN++;
            if (cod === 'Sacrifice') sacN++;

            if (r.are) {
                if (r.are.startsWith('O')) {
                    areO++;
                    if(r.are.includes('micro')) areMicro++;
                    else if(r.are.includes('macro')) areMacro++;
                    else areUnk++;
                } else if (r.are === 'X') {
                    areX++;
                }
            }
        });

        pptSlides.push({ 
            type: 'final-summary', 
            stats: { totalN, surgFailN, areO, areX, areMicro, areMacro, areUnk, sahN, infarctN, vasoN, sacN, survivalN } 
        });

        pptSlides.push({ type: 'end' });

        document.getElementById('ppt-setup-modal').style.display = 'none';
        document.getElementById('ppt-main-modal').style.display = 'flex';
        
        window.addEventListener('keydown', handlePptKeys);
        
        currentPptIndex = 0;
        renderCurrentSlide();

    } catch(e) {
        console.error(e);
        alert("오류: " + e.message);
    } finally {
        btn.innerText = "시작하기";
        btn.disabled = false;
    }
}

function renderCurrentSlide() {
    const container = document.getElementById('ppt-slide-container');
    const headerInfo = document.getElementById('ppt-header-info');
    const progress = document.getElementById('ppt-progress');
    
    const slide = pptSlides[currentPptIndex];
    progress.innerText = `${currentPptIndex + 1} / ${pptSlides.length}`;

    if(pptChart) { pptChart.destroy(); pptChart = null; }

    if(slide.type === 'title') {
        headerInfo.innerHTML = 'Presentation Start';
        container.innerHTML = `<div style="text-align:center;"><h1 style="font-size:4rem; color:var(--navy); margin-bottom:20px;">${slide.title}</h1><p style="font-size:1.5rem; color:#666;">방향키(◀ ▶)를 눌러 이동하세요</p></div>`;
    } 
    else if(slide.type === 'summary') {
        headerInfo.innerHTML = '📋 전체 코호트 요약 데이터';
        
        const codCounts = {};
        const areCounts = { 'O': 0, 'X': 0, 'micro': 0, 'macro': 0, '미확인': 0 };
        
        slide.rats.forEach(r => {
            if(r.status === '사망') {
                const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '미기록');
                codCounts[cod] = (codCounts[cod] || 0) + 1;
                if(r.are) {
                    if(r.are.startsWith('O')) {
                        areCounts['O']++;
                        if(r.are.includes('micro')) areCounts['micro']++;
                        else if(r.are.includes('macro')) areCounts['macro']++;
                        else areCounts['미확인']++;
                    } else if(r.are === 'X') {
                        areCounts['X']++;
                    }
                }
            }
        });

        const codStatHtml = Object.entries(codCounts).map(([k,v]) => `<span style="background:#e3f2fd; color:var(--navy); padding:4px 10px; border-radius:6px; font-size:0.9rem; font-weight:bold;">${k}: ${v}마리</span>`).join('');
        const areStatHtml = `
            <span style="background:#ffebee; color:var(--red); padding:4px 10px; border-radius:6px; font-size:0.9rem; font-weight:bold;">ARE(O): ${areCounts['O']}마리 (micro ${areCounts['micro']}, macro ${areCounts['macro']}, 미확인 ${areCounts['미확인']})</span>
            <span style="background:#e8f5e9; color:var(--green); padding:4px 10px; border-radius:6px; font-size:0.9rem; font-weight:bold;">ARE(X): ${areCounts['X']}마리</span>
        `;

        const rowCount = slide.rats.length || 1;
        const fontSizeRem = Math.max(0.7, 1.2 - Math.max(0, rowCount - 5) * 0.035);
        const paddingPx = Math.max(2, 12 - Math.max(0, rowCount - 5) * 0.6);

        let tbody = '';
        slide.rats.forEach(r => {
            const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
            let surgAgeStr = '-', deathAgeStr = '-', smpAgeStr = '-';
            
            if(r.arrivalDate && r.surgeryDate) {
                const surgAge = arrAge + ((new Date(r.surgeryDate) - new Date(r.arrivalDate))/(1000*60*60*24*7));
                surgAgeStr = `${r.surgeryDate} <span style="color:#666; font-size:0.85em;">(${surgAge.toFixed(1)}주)</span>`;
            }
            if(r.arrivalDate && r.deathDate && r.status === '사망') {
                const deathAge = arrAge + ((new Date(r.deathDate) - new Date(r.arrivalDate))/(1000*60*60*24*7));
                deathAgeStr = `${r.deathDate} <span style="color:var(--red); font-size:0.85em;">(${deathAge.toFixed(1)}주)</span>`;
            } else if(r.status === '생존') { deathAgeStr = '<span style="color:green; font-weight:bold;">생존</span>'; }
            
            if(r.sampleDate && r.arrivalDate) {
                const smpAge = arrAge + ((new Date(r.sampleDate) - new Date(r.arrivalDate))/(1000*60*60*24*7));
                smpAgeStr = `${r.sampleDate} <span style="color:var(--navy); font-size:0.85em;">(${smpAge.toFixed(1)}주)</span>`;
            }

            const codStr = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '-');
            const areStr = r.are || '-';

            tbody += `
                <tr style="border-bottom:1px solid #ddd; text-align:center;">
                    <td style="padding:${paddingPx}px; font-weight:bold; color:var(--navy);">${r.ratId}</td>
                    <td style="padding:${paddingPx}px;">${arrAge}주</td>
                    <td style="padding:${paddingPx}px;">${surgAgeStr}</td>
                    <td style="padding:${paddingPx}px;">${deathAgeStr}</td>
                    <td style="padding:${paddingPx}px; font-weight:bold; color:#d32f2f;">${codStr} <span style="font-size:0.8rem; color:#666; font-weight:normal;">(ARE: ${areStr})</span></td>
                    <td style="padding:${paddingPx}px;">${r.sampleType||'-'} ${smpAgeStr==='-'?'':smpAgeStr}</td>
                </tr>
            `;
        });

        container.innerHTML = `
        <div style="width:95%; max-width:1400px; height:85vh; display:flex; flex-direction:column; gap:15px;">
            <div style="background:white; border-radius:12px; box-shadow:0 5px 15px rgba(0,0,0,0.1); padding:15px 20px; flex-shrink:0;">
                <h4 style="margin:0 0 10px 0; color:var(--navy);">📊 사망 원인 및 ARE 발생 요약</h4>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px; align-items:center;">
                    <b style="color:#555; font-size:0.95rem; width:80px;">사망원인:</b> ${codStatHtml || '<span style="color:#888;">사망 개체 없음</span>'}
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                    <b style="color:#555; font-size:0.95rem; width:80px;">ARE 통계:</b> ${areCounts['O']+areCounts['X'] > 0 ? areStatHtml : '<span style="color:#888;">기록 없음</span>'}
                </div>
            </div>
            <div style="flex:1; background:white; border-radius:12px; box-shadow:0 5px 15px rgba(0,0,0,0.1); padding:10px 20px; overflow:hidden; display:flex; flex-direction:column;">
                <table style="width:100%; border-collapse:collapse; font-size:${fontSizeRem}rem; height:100%;">
                    <thead style="background:#f1f3f5; color:#333; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                        <tr>
                            <th style="padding:10px; border-bottom:2px solid #ccc;">Rat ID</th>
                            <th style="border-bottom:2px solid #ccc;">반입주령</th>
                            <th style="border-bottom:2px solid #ccc;">수술일자 (주령)</th>
                            <th style="border-bottom:2px solid #ccc;">사망일자 (주령)</th>
                            <th style="border-bottom:2px solid #ccc;">사망원인</th>
                            <th style="border-bottom:2px solid #ccc;">얻은 샘플 (날짜/주령)</th>
                        </tr>
                    </thead>
                    <tbody style="display:table-row-group;">${tbody}</tbody>
                </table>
            </div>
        </div>`;
    }
    else if(slide.type === 'photos') {
        headerInfo.innerHTML = slide.header;
        
        let photoHtml = '';
        slide.photos.forEach(p => {
            // PPT에서도 날짜와 시점 표기
            let tpText = '';
            if (p.photoDate) tpText += p.photoDate;
            if (p.timepoint && p.timepoint !== 'none') tpText += (tpText ? ' ' : '') + `[${p.timepoint}]`;
            if (!tpText) tpText = '일자/시점 미지정';

            photoHtml += `
            <div style="flex:1; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
                <div style="flex:1; width:100%; display:flex; align-items:center; justify-content:center; background:#000; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                    <img src="${p.url}" style="max-width:100%; max-height:100%; object-fit:contain; cursor:pointer;" onclick="openPhotoViewer('${p.url}', '${p.memo||''}')">
                </div>
                <div style="margin-top:15px; text-align:center; font-size:1.3rem;">
                    <span style="background:var(--navy); color:white; padding:4px 12px; border-radius:6px; font-weight:bold; margin-right:10px;">${tpText}</span>
                    <span style="color:#333;">${p.memo || '메모 없음'}</span>
                </div>
            </div>`;
        });

        container.innerHTML = `<div style="display:flex; width:100%; height:85vh; gap:30px; justify-content:center;">${photoHtml}</div>`;
    }
    else if(slide.type === 'charts') {
        headerInfo.innerHTML = slide.header;
        
        container.innerHTML = `
        <div style="width:90%; height:85vh; display:flex; flex-direction:column; background:white; border-radius:12px; padding:20px; box-shadow:0 5px 20px rgba(0,0,0,0.1);">
            <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-bottom:10px; background:#f8f9fa; padding:8px; border-radius:8px;">
                <span style="font-weight:bold; color:var(--red);">■ 혈압 (SBP)</span>
                <span style="font-weight:bold; color:var(--green);">■ 체중 (Weight)</span>
            </div>
            <div style="position:relative; flex:1; width:100%;"><canvas id="ppt-canvas-bp"></canvas></div>
        </div>`;

        setTimeout(() => {
            const ctx = document.getElementById('ppt-canvas-bp');
            const dArr = slide.data; 

            const showSbp = dArr.some(d => d.sbp !== null);
            const showWt = dArr.some(d => d.wt !== null);

            const datasets = [];
            if (showSbp) { datasets.push({ label: 'SBP', data: dArr.map(d => d.sbp), borderColor: '#d32f2f', yAxisID: 'y', spanGaps: true }); }
            if (showWt) { datasets.push({ label: 'WT', data: dArr.map(d => d.wt), borderColor: '#00c853', yAxisID: 'y1', spanGaps: true }); }

            pptChart = new Chart(ctx, {
                type: 'line',
                data: { 
                    labels: dArr.map(d => (d.label && d.label !== d.date) ? `${d.date} (${d.label})` : d.date), 
                    datasets: datasets 
                },
                options: { 
                    maintainAspectRatio: false, 
                    animation: false, 
                    interaction: { mode: 'index', intersect: false }, 
                    scales: { 
                        y: { position: 'left', display: showSbp }, 
                        y1: { position: 'right', display: showWt, grid: { drawOnChartArea: false } } 
                    } 
                }
            });
        }, 50);
    }
    else if(slide.type === 'final-summary') {
        headerInfo.innerHTML = '🎯 Final Conclusion';
        
        const { totalN, surgFailN, areO, areX, areMicro, areMacro, areUnk, sahN, infarctN, vasoN, sacN, survivalN } = slide.stats;
        const validN = totalN - surgFailN;
        const rateValid = validN > 0 ? ((areO / validN) * 100).toFixed(1) : 0;

        container.innerHTML = `
        <div style="width:90%; display:flex; flex-direction:column; justify-content:center; gap:40px;">
            <h2 style="color:var(--navy); text-align:center; font-size:3rem; margin:0; text-shadow:2px 2px 5px rgba(0,0,0,0.1);">📊 Cohort Final Summary</h2>
            
            <div style="display:flex; justify-content:center; gap:30px; flex-wrap:wrap;">
                <div style="background:#fff; border-radius:15px; padding:30px; box-shadow:0 10px 30px rgba(0,0,0,0.1); flex:1; min-width:250px; text-align:center; border-top:8px solid var(--navy);">
                    <h3 style="color:#555; margin-top:0; font-size:1.5rem;">총 개체 수</h3>
                    <div style="font-size:4rem; font-weight:900; color:var(--navy); line-height:1;">${totalN}<span style="font-size:1.5rem; font-weight:bold;"> 마리</span></div>
                    <div style="font-size:1.1rem; color:#888; margin-top:15px; font-weight:bold;">(Surgical Failure 제외 유효 N = ${validN})</div>
                </div>

                <div style="background:#fff; border-radius:15px; padding:30px; box-shadow:0 15px 40px rgba(211, 47, 47, 0.2); flex:1.2; min-width:300px; text-align:center; border:4px solid var(--red); transform:scale(1.05);">
                    <h3 style="color:var(--red); margin-top:0; font-size:1.6rem;">🎯 ARE 발생률 (유효 N 기준)</h3>
                    <div style="font-size:5rem; font-weight:900; color:var(--red); line-height:1; margin:10px 0;">${rateValid}<span style="font-size:2.5rem; font-weight:bold;"> %</span></div>
                    <div style="font-size:1.4rem; color:#333; font-weight:bold;">${areO} / ${validN} 마리</div>
                    <div style="font-size:1rem; color:#666; margin-top:10px; background:#ffebee; padding:5px 10px; border-radius:8px; display:inline-block;">
                        <b>micro:</b> ${areMicro} &nbsp;|&nbsp; <b>macro:</b> ${areMacro} &nbsp;|&nbsp; <b>미확인:</b> ${areUnk}
                    </div>
                </div>

                <div style="background:#fff; border-radius:15px; padding:30px; box-shadow:0 10px 30px rgba(0,0,0,0.1); flex:1; min-width:250px; text-align:center; border-top:8px solid #00c853;">
                    <h3 style="color:#555; margin-top:0; font-size:1.5rem;">주요 결과 분포</h3>
                    <div style="display:flex; flex-direction:column; gap:10px; text-align:left; display:inline-flex; width:100%; max-width:200px; font-size:1.2rem;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:5px;"><b>SAH:</b> <span><b style="color:var(--navy);">${sahN}</b> 마리</span></div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:5px;"><b>Infarction:</b> <span><b style="color:var(--navy);">${infarctN}</b> 마리</span></div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:5px;"><b>Vasospasm:</b> <span><b style="color:var(--navy);">${vasoN}</b> 마리</span></div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:5px;"><b>Sacrifice:</b> <span><b style="color:var(--navy);">${sacN}</b> 마리</span></div>
                        <div style="display:flex; justify-content:space-between; padding-bottom:5px;"><b>생존:</b> <span><b style="color:var(--green);">${survivalN}</b> 마리</span></div>
                    </div>
                </div>
            </div>
        </div>`;
    }
    else if(slide.type === 'end') {
        headerInfo.innerHTML = 'Presentation End';
        container.innerHTML = `
        <div style="text-align:center;">
            <h1 style="font-size:4rem; color:var(--navy); margin-bottom:20px;">프레젠테이션이 종료되었습니다.</h1>
            <button class="btn btn-red" onclick="closePpt()" style="font-size:1.5rem; padding:15px 40px; border-radius:30px;">나가기 (ESC)</button>
        </div>`;
    }
}

function nextPptSlide() {
    if(currentPptIndex < pptSlides.length - 1) {
        currentPptIndex++;
        renderCurrentSlide();
    }
}

function prevPptSlide() {
    if(currentPptIndex > 0) {
        currentPptIndex--;
        renderCurrentSlide();
    }
}

function handlePptKeys(e) {
    const viewer = document.getElementById('photo-viewer-modal');
    if(viewer && viewer.style.display === 'flex') {
        if(e.key === 'Escape') closePhotoViewer();
        return; 
    }

    if(e.key === 'ArrowRight' || e.key === ' ') { nextPptSlide(); }
    else if(e.key === 'ArrowLeft') { prevPptSlide(); }
    else if(e.key === 'Escape') { closePpt(); }
}

function closePpt() {
    document.getElementById('ppt-main-modal').style.display = 'none';
    window.removeEventListener('keydown', handlePptKeys);
    
    // 닫을 때도 확실하게 파괴
    if(pptChart) { 
        pptChart.destroy(); 
        pptChart = null; 
    }
    pptSlides = [];
}
