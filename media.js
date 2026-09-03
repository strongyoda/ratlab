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
    
    // 오늘 날짜를 기본값으로 세팅 (한국시간 기준. UTC로 하면 오전 9시 이전에 전날이 찍힘)
    const todayStr = getTodayStr();
    
    let html = '';
    stagedPhotos.forEach(p => {
        html += `
        <div style="display:flex; gap:10px; align-items:center; background:var(--paper); padding:10px; border-radius:2px; border:1px solid #C9C5B8;">
            <img src="${p.url}" style="width:70px; height:70px; object-fit:cover; border-radius:2px; border:1px solid #aaa;">
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                <span style="font-size:0.85rem; font-weight:bold; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${p.file.name}</span>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <input type="date" id="stage-date-${p.id}" value="${todayStr}" style="width:125px; padding:6px; font-size:0.85rem; border-radius:2px; border:1px solid #C9C5B8;">
                    <select id="stage-tp-${p.id}" style="width:120px; padding:6px; font-size:0.85rem; border-radius:2px; border:1px solid #C9C5B8;">
                        <option value="none">시점(선택안함)</option>
                        ${tpOptions}
                    </select>
                    <select id="stage-rmark-${p.id}" style="width:110px; padding:6px; font-size:0.85rem; border-radius:2px; border:1px solid #C9C5B8;">
                        <option value="none">R 마크 (X)</option>
                        <option value="right">▶ 오른쪽 (R)</option>
                        <option value="left">◀ 왼쪽 (R)</option>
                        <option value="top">▲ 위쪽 (R)</option>
                        <option value="bottom">▼ 아래쪽 (R)</option>
                    </select>
                    <input type="text" id="stage-memo-${p.id}" placeholder="개별 메모 (예: 조직 채취시 손상)" style="flex:1; min-width:150px; padding:6px; font-size:0.85rem; border-radius:2px; border:1px solid #C9C5B8;">
                </div>
            </div>
            <button class="btn-red" onclick="removeStagedPhoto('${p.id}', '${docId}')" style="padding:6px 12px; font-weight:bold; font-size:1.1rem;">✖</button>
        </div>
        `;
    });
    list.innerHTML = html;
}

// ==========================================
// 📸 멀티 이미지 업로드 & 향상된 사진 뷰어 로직
// ==========================================

window.uploadAllStagedPhotos = async function(docId) {
    if(!stagedPhotos || stagedPhotos.length === 0) return;
    const btn = document.getElementById(`photo-upload-all-btn-${docId}`);
    if(!btn) return;
    btn.innerText = `업로드 중... (0 / ${stagedPhotos.length})`;
    btn.disabled = true;

    let successCount = 0; 
    const newPhotos = [];

    try {
        for(let i = 0; i < stagedPhotos.length; i++) {
            const p = stagedPhotos[i];
            const memoVal = document.getElementById(`stage-memo-${p.id}`)?.value.trim() || '';
            const rMarkVal = document.getElementById(`stage-rmark-${p.id}`)?.value || 'none';
            const tpVal = document.getElementById(`stage-tp-${p.id}`)?.value || 'none';
            const dateVal = document.getElementById(`stage-date-${p.id}`)?.value || '';

            btn.innerText = `압축 및 업로드 중... (${i + 1} / ${stagedPhotos.length})`;

            let compressedBlob;
            if(typeof compressImage === 'function') compressedBlob = await compressImage(p.file, rMarkVal);
            else compressedBlob = p.file;
            
            const filename = `rats_photos/${docId}/${Date.now()}_${i}_${p.file.name}.jpg`;
            const storageRef = firebase.storage().ref().child(filename);
            
            const snapshot = await storageRef.put(compressedBlob);
            const downloadURL = await snapshot.ref.getDownloadURL();

            newPhotos.push({
                url: downloadURL,
                memo: memoVal,
                rMark: rMarkVal,
                timepoint: tpVal,
                photoDate: dateVal,
                timestamp: new Date().toISOString(),
                filename: filename,
                originalName: p.file.name // 🌟 원본 파일명 저장 추가!
            });
            successCount++;
        }

        btn.innerText = `데이터베이스 저장 중...`;
        for (let np of newPhotos) {
            await db.collection('rats').doc(docId).update({ photos: firebase.firestore.FieldValue.arrayUnion(np) });
        }

        alert(`${successCount}장의 사진이 성공적으로 등록되었습니다.`);
        stagedPhotos = [];
        if(typeof renderStagingArea === 'function') renderStagingArea(docId);
        clearRatsCache();
        
        if(typeof loadDetailData === 'function') loadDetailData();
        
    } catch(e) {
        console.error(e); 
        alert("오류 발생: " + e.message);
        btn.innerText = "🚀 준비된 사진 모두 업로드"; 
        btn.disabled = false;
    }
};

window.deletePhoto = async function(docId, photoObjStr) {
    if(!confirm("이 사진을 정말 삭제하시겠습니까?")) return;
    const photoObj = JSON.parse(decodeURIComponent(photoObjStr));
    try {
        await firebase.storage().ref().child(photoObj.filename).delete().catch(e=>console.warn(e));
        await db.collection('rats').doc(docId).update({ photos: firebase.firestore.FieldValue.arrayRemove(photoObj) });
        alert("삭제되었습니다."); clearRatsCache(); loadDetailData();
    } catch(e) { console.error(e); alert("삭제 실패"); }
};

let currentPhotoIndex = 0;

window.openPhotoViewer = function(indexOrUrl, memo = '') {
    // 예전 방식(URL 전달)으로 호출되면 URL로 인덱스를 역추적
    if (typeof indexOrUrl === 'string') {
        currentPhotoIndex = window.currentRatPhotos ? window.currentRatPhotos.findIndex(p => p.url === indexOrUrl) : 0;
        if(currentPhotoIndex === -1) currentPhotoIndex = 0;
    } else {
        currentPhotoIndex = indexOrUrl;
    }

    if (!window.currentRatPhotos || window.currentRatPhotos.length === 0) return;
    const p = window.currentRatPhotos[currentPhotoIndex];
    if (!p) return;

    const modal = document.getElementById('photo-viewer-modal');
    const img = document.getElementById('photo-viewer-img');
    if(!modal || !img) return; 
    
    const memoEl = document.getElementById('photo-viewer-memo');
    if(memoEl) memoEl.innerText = p.memo || '메모 없음';
    
    const filenameEl = document.getElementById('photo-viewer-filename');
    if(filenameEl) filenameEl.innerText = p.originalName || '';

    img.src = p.url;
    if(typeof pvScale !== 'undefined') {
        pvScale = 1; pvTransX = 0; pvTransY = 0;
        img.style.transform = `translate(0px, 0px) scale(1)`;
    }
    
    const prevBtn = document.getElementById('pv-prev-btn');
    const nextBtn = document.getElementById('pv-next-btn');
    if(prevBtn) prevBtn.style.display = (currentPhotoIndex > 0) ? 'block' : 'none';
    if(nextBtn) nextBtn.style.display = (currentPhotoIndex < window.currentRatPhotos.length - 1) ? 'block' : 'none';

    modal.style.display = 'flex';
};

window.closePhotoViewer = function() { 
    document.getElementById('photo-viewer-modal').style.display = 'none'; 
};

window.pvNext = function(e) {
    if(e) e.stopPropagation();
    if(window.currentRatPhotos && currentPhotoIndex < window.currentRatPhotos.length - 1) {
        openPhotoViewer(currentPhotoIndex + 1);
    }
};

window.pvPrev = function(e) {
    if(e) e.stopPropagation();
    if(currentPhotoIndex > 0) openPhotoViewer(currentPhotoIndex - 1);
};

// 사진 뷰어 키보드 조작. 정의만 되어 있고 등록이 빠져 있어 동작하지 않던 것을 연결했다.
window.handlePhotoViewerKeys = function(e) {
    const viewer = document.getElementById('photo-viewer-modal');
    if (!viewer || viewer.style.display !== 'flex') return;
    if (e.key === 'Escape') closePhotoViewer();
    else if (e.key === 'ArrowRight' || e.key === ' ') pvNext();
    else if (e.key === 'ArrowLeft') pvPrev();
};
document.addEventListener('keydown', window.handlePhotoViewerKeys);
