function toggleCrosshair() {
    isCrosshairEnabled = !isCrosshairEnabled;
    const buttons = document.querySelectorAll('.crosshair-toggle-btn');
    buttons.forEach(btn => {
        btn.innerHTML = isCrosshairEnabled ? '🎯 가이드선 ON' : '🎯 가이드선 OFF';
        btn.style.background = isCrosshairEnabled ? '#FFD600' : '#ddd';
        btn.style.color = isCrosshairEnabled ? '#000' : '#777';
    });
    sharedXValue = null;
    Object.values(Chart.instances).forEach(c => c.render({duration: 0}));
}


const syncCrosshairPlugin = {
    id: 'syncCrosshair',
    afterInit: (chart) => {
        const canvas = chart.canvas;
        const moveHandler = (e) => {
            if (!isCrosshairEnabled) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (x >= chart.chartArea.left && x <= chart.chartArea.right &&
                y >= chart.chartArea.top && y <= chart.chartArea.bottom) {
                
                // 마우스가 위치한 곳의 실제 데이터 값을 추출하여 공유
                sharedXValue = chart.scales.x.getValueForPixel(x);
                sharedYValue = chart.scales.y.getValueForPixel(y);
                sourceSyncType = chart._syncType; // 현재 차트의 타입 저장
                activeChartId = chart.id;

                // 모든 차트 인스턴스 갱신 ( v3+ 대응 Object.values 사용 )
                Object.values(Chart.instances).forEach(instance => {
                    instance.render({duration: 0}); 
                });
            }
        };

        const leaveHandler = () => {
            sharedXValue = null; sharedYValue = null; sourceSyncType = null; activeChartId = null;
            Object.values(Chart.instances).forEach(instance => instance.render({duration: 0}));
        };

        canvas.addEventListener('mousemove', moveHandler);
        canvas.addEventListener('mouseleave', leaveHandler);
    },
    
    afterDraw: (chart) => {
        if (!isCrosshairEnabled || sharedXValue === null) return;
        const {ctx, chartArea, scales} = chart;

        // 1. 세로 가이드선 (모든 차트 공통)
        const xPix = scales.x.getPixelForValue(sharedXValue);
        if (xPix >= chartArea.left && xPix <= chartArea.right) {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.strokeStyle = '#FFB300';
            ctx.moveTo(xPix, chartArea.top); ctx.lineTo(xPix, chartArea.bottom);
            ctx.stroke();

            // X축 하단 라벨 (POD 표시)
            const xLabel = "POD " + Math.round(sharedXValue);
            ctx.font = 'bold 11px sans-serif';
            const xTW = ctx.measureText(xLabel).width;
            ctx.fillStyle = '#FFB300';
            ctx.fillRect(xPix - (xTW/2 + 5), chartArea.bottom + 2, xTW + 10, 18);
            ctx.fillStyle = '#000'; ctx.textAlign = 'center';
            ctx.fillText(xLabel, xPix, chartArea.bottom + 15);
            ctx.restore();
        }

        // 2. 가로 가이드선 (동일한 타입의 차트끼리만 동기화)
        // 혈압은 혈압끼리, 체중은 체중끼리만 가로선이 나타납니다.
        if (sharedYValue !== null && chart._syncType === sourceSyncType) {
            const yPix = scales.y.getPixelForValue(sharedYValue);
            if (yPix >= chartArea.top && yPix <= chartArea.bottom) {
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.strokeStyle = '#FFB300';
                ctx.moveTo(chartArea.left, yPix); ctx.lineTo(chartArea.right, yPix);
                ctx.stroke();

                // Y축 수치 라벨 (안쪽 표시로 잘림 방지)
                const label = Math.round(sharedYValue).toString();
                ctx.font = 'bold 12px sans-serif';
                const textWidth = ctx.measureText(label).width;
                const boxWidth = textWidth + 14;
                const boxX = chartArea.right - boxWidth - 5;
                
                ctx.fillStyle = '#FFB300';
                ctx.fillRect(boxX, yPix - 11, boxWidth, 22);
                ctx.fillStyle = '#000'; ctx.textAlign = 'center';
                ctx.fillText(label, boxX + (boxWidth/2), yPix + 5);
                ctx.restore();
            }
        }
    }
};

// 개별 데이터(Scatter 점) On/Off 토글 함수
function toggleIndividual() {
    isIndividualVisible = !isIndividualVisible;
    const buttons = document.querySelectorAll('.indiv-toggle-btn');
    buttons.forEach(btn => {
        btn.innerHTML = isIndividualVisible ? '👥 개별점 ON' : '👥 개별점 OFF';
        btn.style.background = isIndividualVisible ? '#00c853' : '#ddd';
        btn.style.color = isIndividualVisible ? '#fff' : '#777';
    });

    // 모든 차트의 개별 데이터(scatter) 데이터셋 숨기기/보이기
    Object.values(Chart.instances).forEach(chart => {
        chart.data.datasets.forEach(ds => {
            // 데이터셋 라벨이나 타입을 확인하여 개별 데이터만 제어
            if (ds.type === 'scatter' || ds.label === 'Individual' || ds.label === 'Distribution') {
                ds.hidden = !isIndividualVisible;
            }
        });
        chart.update('none'); // 애니메이션 없이 즉시 반영
    });
}

async function loadDashboard() { 
    try { 
        // 캐시 함수 사용
        const ratsData = await getRatsWithCache(); 
        
        if(ratsData.length === 0) { document.getElementById('dash-container').innerHTML = "<p>데이터 없음</p>"; return; } 
        
        const memoSnap = await db.collection("cohortNotes").get();
        const noteData = {};
        memoSnap.forEach(d => noteData[d.id] = d.data());

        const grp = {}; 
        // forEach 대신 배열 순회 사용
        ratsData.forEach(d => { 
            if(!grp[d.cohort]) grp[d.cohort] = { rats: [], surg: d.surgeryDate || null }; 
            grp[d.cohort].rats.push(d); 
        });
        
        let html = '<div style="width:100%; text-align:right; color:#666; font-size:0.85rem; margin-bottom:10px;"><i class="material-icons" style="font-size:1rem; vertical-align:text-bottom;">touch_app</i> 랫드 번호를 누르면 상세보기로 이동합니다.</div>'; 
        
        const sortedCohorts = Object.keys(grp).sort((a,b)=>Number(b)-Number(a));
        const allTimepoints = Object.keys(globalPodMap).sort((a,b) => globalPodMap[a] - globalPodMap[b]);

        sortedCohorts.forEach(c => { 
            let podTag = `<span style="font-size:0.8rem; color:#888;">수술전</span>`; 
            if(grp[c].surg) { 
                const pod = Math.floor((new Date() - new Date(grp[c].surg))/(1000*60*60*24)); 
                const w = Math.floor(pod/7), d=pod%7; 
                podTag = `<span class="d-day-badge">W${w}+${d} (POD ${pod})</span>`; 
            } 
            
            const cData = noteData[c] || {};
            const currentMemo = cData.memo || "";
            const mrChecks = cData.mrChecks || {}; 
            const config = cData.mrConfig || ['D0','D2','W1','W4','W8','W12','W20'];
            
            // 메모 영역
            const memoHtml = `<div class="co-memo-box"><i class="material-icons edit-icon" onclick="toggleCoMemo('${c}')">edit</i><span id="memo-txt-${c}" class="memo-text">${currentMemo || ''}</span><div id="memo-edit-area-${c}" style="display:none;"><input type="text" id="memo-inp-${c}" class="co-memo-input" value="${currentMemo}"><button class="btn-small btn-blue" style="padding:2px 8px; margin-left:5px;" onclick="saveCoMemo('${c}')">OK</button></div></div>`;
            
            // MR 체크 영역
            let mrHtml = `<div class="mr-check-group" style="margin-left:0; margin-top:5px;"><span style="font-weight:bold; color:var(--navy); margin-right:4px;">MR:</span>`;
            mrHtml += `<i class="material-icons" style="font-size:1.1rem; cursor:pointer; color:#7f8c8d; vertical-align:middle; margin-right:5px;" onclick="toggleMrConfig('${c}')" title="MR 체크리스트 설정">settings</i>`;
            config.forEach(tp => {
                const isChecked = mrChecks[tp] ? 'checked' : '';
                mrHtml += `<label><input type="checkbox" onclick="toggleMr(event, '${c}', '${tp}')" ${isChecked}>${tp}</label>`;
            });
            mrHtml += `</div>`;

            // 설정 패널
            const configPanel = `
            <div id="mr-cfg-panel-${c}" style="display:none; width:100%; background:#fff; border:1px solid #ddd; padding:10px; margin-bottom:10px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <div style="font-weight:bold; color:var(--navy); font-size:0.9rem; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;">⚙️ Cohort ${c} - MR 시점 설정</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:120px; overflow-y:auto; margin-bottom:10px;">
                    ${allTimepoints.map(tp => {
                        const checked = config.includes(tp) ? 'checked' : '';
                        return `<label style="font-size:0.85rem; cursor:pointer; background:#f8f9fa; padding:2px 6px; border-radius:4px; border:1px solid #eee;"><input type="checkbox" class="mr-cfg-chk-${c}" value="${tp}" ${checked} style="vertical-align:middle;"> ${tp}</label>`;
                    }).join('')}
                </div>
                <div style="text-align:right;">
                    <button class="btn btn-blue btn-small" style="width:auto; padding:4px 12px;" onclick="saveMrConfig('${c}')">저장</button>
                    <button class="btn btn-red btn-small" style="width:auto; padding:4px 12px; background:#ccc; border:none;" onclick="toggleMrConfig('${c}')">닫기</button>
                </div>
            </div>`;

            html += `<div class="card">
                <div class="cohort-header" style="display:block;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                            <span style="font-weight:bold; font-size:1.1rem; color:var(--navy);">Cohort ${c}</span>
                            ${memoHtml}
                        </div>
                        ${podTag}
                    </div>
                    <div style="width:100%;">${mrHtml}</div>
                </div>
                ${configPanel}
                <div class="rat-grid">`; 
            
            // 랫드 목록 생성 (수정된 부분)
            grp[c].rats.forEach(r => { 
                let statusClass = 'rat-badge'; 
                if(r.status === '사망') statusClass += ' status-dead'; 
                else if(r.lastScore) { 
                    if(r.lastScore >= 13) statusClass += ' status-normal'; 
                    else if(r.lastScore >= 9) statusClass += ' status-mild'; 
                    else statusClass += ' status-severe'; 
                } 

                // [중요] 샘플 마크 생성 부분
                let sampleMark = '';
                if (r.sampleType === 'Cast') {
                    sampleMark = '<div class="sample-indicator sample-c">C</div>';
                } else if (r.sampleType === 'Histology') {
                    sampleMark = '<div class="sample-indicator sample-h">H</div>';
                }

                html += `<div class="rat-wrapper">
                            ${sampleMark}
                            <div class="${statusClass}" onclick="goToDetail('${r.ratId}')">${r.num}</div>
                        </div>`; 
            }); 
            html += `</div></div>`; 
        }); 
        document.getElementById('dash-container').innerHTML = html; 
    } catch(e) { 
        console.error(e);
        document.getElementById('dash-container').innerHTML = `<p style="color:red">${e.message}</p>`; 
    } 
}


async function initDetailSelectors(targetId) {
    try {
        // [변경] 캐시된 데이터 사용
        const ratsData = await getRatsWithCache();
        
        // [변경] 이미 배열 형태이므로 forEach로 push할 필요 없이 바로 할당
        allRatsForDetail = ratsData; 
        
        const cohorts = new Set(allRatsForDetail.map(r => r.cohort));
        const sortedCohorts = Array.from(cohorts).sort((a,b) => Number(b) - Number(a));
        
        const cSel = document.getElementById('dt-cohort-sel');
        cSel.innerHTML = '<option value="">-- 코호트 선택 --</option>' + sortedCohorts.map(c => `<option value="${c}">Cohort ${c}</option>`).join('');
        
        if(targetId) {
            const targetRat = allRatsForDetail.find(r => r.ratId === targetId);
            if(targetRat) {
                cSel.value = targetRat.cohort;
                updateRatList(targetId);
            }
        }
    } catch(e) { console.error(e); }
}


function updateRatList(preSelectId = null) {
    const cVal = document.getElementById('dt-cohort-sel').value;
    const rSel = document.getElementById('dt-rat-sel');
    if(!cVal) { rSel.innerHTML = '<option value="">-</option>'; return; }
    const filtered = allRatsForDetail.filter(r => r.cohort === cVal).sort((a,b) => a.ratId.localeCompare(b.ratId));
    rSel.innerHTML = '<option value="">-- 번호 선택 --</option>' + filtered.map(r => {
        const deadMark = r.status === '사망' ? ' (사망)' : '';
        return `<option value="${r.ratId}">${r.ratId}${deadMark}</option>`;
    }).join('');
    if(preSelectId) { rSel.value = preSelectId; loadDetailData(); }
}


async function loadDetailData() {
    const id = document.getElementById('dt-rat-sel').value;
    const view = document.getElementById('detail-view');
    if(!id) return; 
    view.innerHTML = "로딩 중...";
    
    try {
        const rSnap = await db.collection("rats").where("ratId", "==", id).get();
        if(rSnap.empty) { view.innerHTML = "등록되지 않음"; return; }
        const rat = rSnap.docs[0].data();
        const docId = rSnap.docs[0].id;
        
        let baseDate = new Date();
        if(rat.status === '사망' && rat.deathDate) { baseDate = new Date(rat.deathDate); }
        const dPlus = rat.arrivalDate ? Math.floor((baseDate - new Date(rat.arrivalDate))/(1000*60*60*24)) : '-';
        const pod = rat.surgeryDate ? Math.floor((baseDate - new Date(rat.surgeryDate))/(1000*60*60*24)) : '-';
        
        const arrivalAgeNum = rat.arrivalAge ? Number(rat.arrivalAge) : 6;
        let ageAtSurgStr = '-';
        if(rat.arrivalDate && rat.surgeryDate) {
            const diffTime = new Date(rat.surgeryDate).getTime() - new Date(rat.arrivalDate).getTime();
            const calcAge = arrivalAgeNum + (diffTime / (1000 * 60 * 60 * 24 * 7));
            ageAtSurgStr = calcAge > 0 ? calcAge.toFixed(1) : '-';
        }

        let deathInfo = '';
        if(rat.status === '사망') {
            const displayCod = rat.cod || (rat.codFull ? extractLegacyCod(rat.codFull) : '미기록');
            const displayAre = rat.are || '미기록';
            deathInfo = `<div class="info-item" style="grid-column: span 2; color:var(--red); border:1px solid var(--red); background:#ffebee;">
                <b>사망: ${rat.deathDate||'날짜미상'} (POD ${pod})</b>
                <button class="btn-red btn-small" style="float:right; padding:2px 8px;" onclick="openSimpleCod('${docId}', '${displayCod}', '${displayAre}')">원인 기록</button>
                <br><span style="font-size:0.9rem; color:#d32f2f; font-weight:bold;">COD: ${displayCod} / ARE: ${displayAre}</span>
            </div>`;
        }

        let doseInfo = '';
        if(rat.doseStartDate) {
            const doseDay = Math.floor((baseDate - new Date(rat.doseStartDate))/(1000*60*60*24));
            doseInfo = `<div class="info-item"><b>Day ${doseDay}</b><br>투약 시작(${rat.doseStartDate})</div>`;
        } else { doseInfo = `<div class="info-item" style="color:#ccc;">-</div>`; }

        const mrOpts = ['D00','D0','D2','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','Death'];

        // --- 갤러리 날짜/시점 정렬 및 HTML 생성 ---
        let photos = rat.photos || [];
        const tpWeight = { 'D00':-1, 'D0':0, 'D2':2, 'W1':7, 'W2':14, 'W3':21, 'W4':28, 'W5':35, 'W6':42, 'W7':49, 'W8':56, 'W9':63, 'W10':70, 'W11':77, 'W12':84, 'none':9999 };

        photos.sort((a, b) => {
            // 1순위: 지정된 날짜(photoDate) 오름차순 정렬
            if (a.photoDate && b.photoDate && a.photoDate !== b.photoDate) {
                return new Date(a.photoDate) - new Date(b.photoDate);
            }
            // 2순위: 시점(timepoint) 가중치 정렬
            const wA = (a.timepoint && tpWeight[a.timepoint] !== undefined) ? tpWeight[a.timepoint] : 9999;
            const wB = (b.timepoint && tpWeight[b.timepoint] !== undefined) ? tpWeight[b.timepoint] : 9999;
            if (wA !== wB) return wA - wB;
            // 3순위: 업로드 타임스탬프
            return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
        });

        const photoHtml = photos.length > 0 ? photos.map(p => {
            let rMarkHtml = '';
            if (p.rMark && p.rMark !== 'none') {
                let posStyle = '';
                if (p.rMark === 'right') posStyle = 'top:50%; right:5px; transform:translateY(-50%);';
                if (p.rMark === 'left') posStyle = 'top:50%; left:5px; transform:translateY(-50%);';
                if (p.rMark === 'top') posStyle = 'top:5px; left:50%; transform:translateX(-50%);';
                if (p.rMark === 'bottom') posStyle = 'bottom:25px; left:50%; transform:translateX(-50%);';
                rMarkHtml = `<div style="position:absolute; ${posStyle} font-weight:900; color:#ffeb3b; text-shadow:1px 1px 3px #000; font-size:1.1rem; pointer-events:none;">R</div>`;
            }
            
            // 날짜 + 시점 조합 배지
            let tpBadgeText = '';
            if (p.photoDate) tpBadgeText += p.photoDate;
            if (p.timepoint && p.timepoint !== 'none') tpBadgeText += (tpBadgeText ? ' ' : '') + `[${p.timepoint}]`;

            let tpBadge = '';
            if (tpBadgeText) {
                tpBadge = `<div style="position:absolute; top:5px; left:5px; background:rgba(26,35,126,0.9); color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:bold; box-shadow:0 1px 3px rgba(0,0,0,0.3); pointer-events:none; z-index:5;">${tpBadgeText}</div>`;
            }

            return `
            <div style="position:relative; width:130px; height:130px; border:1px solid #ddd; border-radius:8px; overflow:hidden; background:#000; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <img src="${p.url}" draggable="false" style="width:100%; height:100%; object-fit:cover; cursor:pointer; user-select:none; -webkit-user-drag:none;" onclick="openPhotoViewer('${p.url}', '${p.memo||''}')">
                ${tpBadge}
                ${rMarkHtml}
                <button onclick="deletePhoto('${docId}', '${encodeURIComponent(JSON.stringify(p))}')" style="position:absolute; top:5px; right:5px; background:rgba(211,47,47,0.8); color:white; border:none; border-radius:50%; width:24px; height:24px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;">✖</button>
                <div style="position:absolute; bottom:0; left:0; width:100%; background:rgba(0,0,0,0.7); color:white; font-size:0.75rem; padding:4px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-sizing:border-box; z-index:5;">${p.memo||'메모없음'}</div>
            </div>`;
        }).join('') : '<div style="color:#888; font-size:0.85rem; padding:10px;">등록된 사진이 없습니다.</div>';

        // --- 화면 UI 조합 ---
        view.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content:space-between;">
                    <h3>${id}</h3><span style="color:${rat.status==='생존'?'green':'red'}">${rat.status}</span>
                </div>
                <div class="info-grid">
                    <div class="info-item"><b>D+${dPlus}</b><br>반입 후<br><span style="font-size:0.8rem; color:#666;">${rat.arrivalDate||'-'} (${arrivalAgeNum}주령)</span></div>
                    <div class="info-item"><b>POD ${pod}</b><br>수술 후<br><span style="font-size:0.8rem; color:#666; font-weight:bold;">수술 시: 약 ${ageAtSurgStr}주령</span></div>
                    ${deathInfo}
                    ${doseInfo}
                </div>
                
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px; padding:12px; background:#f8f9fa; border-radius:8px; border:1px solid #eee;">
                    <div style="display:flex; gap:15px; flex-wrap:wrap; align-items:center;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--navy);">반입주령</label>
                            <select id="arr-age" style="width:70px; padding:4px;">
                                ${[5,6,7,8,9,10].map(v=>`<option value="${v}" ${arrivalAgeNum===v?'selected':''}>${v}주</option>`).join('')}
                            </select>
                            <button class="btn-small" onclick="upArrivalAge('${docId}')">저장</button>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--navy);">OVX일자</label>
                            <input type="date" id="ovx-d" value="${rat.ovxDate||''}" style="width:130px; padding:4px 6px;">
                            <button class="btn-small" onclick="upOvx('${docId}')">저장</button>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--navy);">투약시작</label>
                            <input type="date" id="dose-start-d" value="${rat.doseStartDate||''}" style="width:130px; padding:4px 6px;">
                            <button class="btn-small" onclick="upDoseStart('${docId}')">저장</button>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:15px; flex-wrap:wrap; align-items:center; width:100%;">
                        <div style="display:flex; align-items:center; gap:15px; background:#fff3e0; padding:8px; border-radius:6px; border:1px solid #ffcc80; flex-wrap:wrap; flex:1;">
                            <label style="cursor:pointer; font-size:0.85rem; color:var(--red); font-weight:bold; display:flex; align-items:center;">
                                <input type="checkbox" id="chk-sham" ${rat.isNonInduction ? 'checked' : ''} 
                                    onchange="document.getElementById('surg-date-wrapper').style.display = this.checked ? 'none' : 'flex'; document.getElementById('sham-ref-wrapper').style.display = this.checked ? 'flex' : 'none';" style="transform:scale(1.2); margin-right:6px;">
                                Ligation 안 함 (Sham/Naïve)
                            </label>
                            
                            <div id="surg-date-wrapper" style="display:${rat.isNonInduction ? 'none' : 'flex'}; align-items:center; gap:6px;">
                                <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--navy);">수술일자</label>
                                <input type="date" id="surg-d" value="${rat.surgeryDate||''}" style="width:130px; padding:4px;">
                            </div>
                            
                            <div id="sham-ref-wrapper" style="display:${rat.isNonInduction ? 'flex' : 'none'}; align-items:center; gap:6px;">
                                <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--red);">비교 기준 주령</label>
                                <input type="number" id="sham-ref-age" value="${rat.refAge || 9}" step="0.1" style="width:70px; padding:4px;"> <span style="font-size:0.8rem; color:var(--red); font-weight:bold;">주</span>
                            </div>
                            
                            <button class="btn-small btn-red" onclick="saveSurgAndSham('${docId}', '${rat.arrivalDate || ''}', ${arrivalAgeNum})" style="margin-left:auto;">저장</button>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:6px; background:#e3f2fd; padding:8px; border-radius:6px; border:1px solid #bbdefb; flex-wrap:wrap;">
                        <label style="font-size:0.8rem; margin-right:0; font-weight:bold; color:var(--navy);">얻은 샘플</label>
                        <select id="sample-tp" style="width:100px; padding:4px;">
                            <option value="">-</option>
                            <option value="Histology" ${rat.sampleType==='Histology'?'selected':''}>Histology</option>
                            <option value="Cast" ${rat.sampleType==='Cast'?'selected':''}>Cast</option>
                            <option value="Fail" ${rat.sampleType==='Fail'?'selected':''}>못함</option>
                        </select>
                        <input type="date" id="sample-d" value="${rat.sampleDate||''}" style="width:130px; padding:4px;">
                        <input type="text" id="sample-memo" value="${rat.sampleMemo||''}" placeholder="메모 (예: 조직손상)" style="flex:1; min-width:150px; padding:4px;">
                        <button class="btn-small btn-blue" onclick="upSampleInfo('${docId}')">저장</button>
                    </div>

                    <div style="background:#fff; border:1px solid #ddd; padding:10px; border-radius:6px;">
                        <div style="font-size:0.85rem; font-weight:bold; color:var(--navy); margin-bottom:8px;">📷 MR 촬영 이력</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                            ${(() => {
                                const mrArr = rat.mrDates || [];
                                if(mrArr.length === 0) return '<span style="font-size:0.8rem; color:#888;">기록된 MR이 없습니다.</span>';
                                
                                return mrArr.map((mr, idx) => ({ ...mr, originalIdx: idx }))
                                    .sort((a, b) => {
                                        const wA = tpWeight[a.timepoint] !== undefined ? tpWeight[a.timepoint] : 9999;
                                        const wB = tpWeight[b.timepoint] !== undefined ? tpWeight[b.timepoint] : 9999;
                                        if (wA === wB) return new Date(a.date) - new Date(b.date); // 시점이 같거나 없으면 날짜순서대로 예쁘게 정렬
                                        return wA - wB;
                                    })
                                    .map(mr => `
                                        <span style="background:#f1f3f5; border:1px solid #ccc; padding:3px 8px; border-radius:4px; font-size:0.85rem; display:inline-flex; align-items:center; gap:5px;">
                                            <b>${mr.timepoint}</b>: ${mr.date} 
                                            <i class="material-icons" style="font-size:1.1rem; color:var(--red); cursor:pointer;" onclick="removeMrDate('${docId}', ${mr.originalIdx})">cancel</i>
                                        </span>
                                    `).join('');
                            })()}
                        </div>
                        <div style="display:flex; gap:6px; align-items:center; border-top:1px dashed #eee; padding-top:8px;">
                            ${rat.isNonInduction ? 
                                `<input type="hidden" id="new-mr-tp" value="-">
                                 <div style="font-size:0.85rem; font-weight:bold; color:var(--red); background:#ffebee; padding:4px 8px; border-radius:4px; text-align:center; width:90px; box-sizing:border-box;">시점 무관</div>` 
                            : 
                                `<select id="new-mr-tp" style="width:90px; padding:4px; font-size:0.85rem;">
                                    ${mrOpts.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                                </select>`
                            }
                            <input type="date" id="new-mr-d" value="${getTodayStr()}" style="width:130px; padding:4px; font-size:0.85rem;">
                            <button class="btn-small btn-green" onclick="addMrDate('${docId}')" style="padding:4px 10px; font-size:0.85rem;">+ 추가</button>
                        </div>
                </div>
            </div>

            <div class="card">
                <h4 style="color:var(--navy); margin-top:0;">🖼️ 사진 및 결과 기록</h4>
                
                <div id="photo-dropzone-${docId}" 
                        style="border: 2px dashed #1a237e; border-radius: 8px; padding: 20px; text-align: center; background: #f8f9fa; cursor: pointer; margin-bottom:15px; transition: 0.2s;" 
                        ondragover="event.preventDefault(); this.style.background='#e3f2fd'; this.style.borderColor='#00c853';" 
                        ondragleave="this.style.background='#f8f9fa'; this.style.borderColor='#1a237e';" 
                        ondrop="handlePhotoDrop(event, '${docId}')" 
                        onclick="document.getElementById('photo-upload-input-${docId}').click()">
                    <div style="font-size:2rem; margin-bottom:10px;">📸</div>
                    <div style="font-weight:bold; color:#333;">여기로 사진을 드래그하거나 클릭하여 선택하세요</div>
                    <div style="font-size:0.85rem; color:#666; margin-top:5px;">(Ctrl+V 복사/붙여넣기도 지원합니다. <b>여러 장 선택 가능</b>)</div>
                    <input type="file" id="photo-upload-input-${docId}" accept="image/*" multiple style="display:none;" onchange="handlePhotoSelect(event, '${docId}')">
                </div>
                
                <div id="photo-staging-area-${docId}" style="display:none; margin-bottom:15px; background:#fff; border:1px solid #ddd; border-radius:8px; padding:15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--navy); padding-bottom:8px; margin-bottom:10px;">
                        <h5 style="margin:0; color:var(--navy);">📤 업로드 대기 목록 (개별 설정 후 업로드)</h5>
                    </div>
                    <div id="photo-staging-list-${docId}" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto; margin-bottom:10px; padding-right:5px;"></div>
                    <button id="photo-upload-all-btn-${docId}" class="btn btn-green" onclick="uploadAllStagedPhotos('${docId}')" style="width:100%; font-size:1rem; padding:10px; font-weight:bold;">🚀 준비된 사진 모두 업로드</button>
                </div>

                <div id="photo-gallery" style="display:flex; gap:15px; flex-wrap:wrap;">
                    ${photoHtml}
                </div>
            </div>

            <div class="card"><h4>데일리</h4><div class="chart-area"><canvas id="dailyChart"></canvas></div>
            <div style="margin-top:10px; text-align:center;"><button class="btn btn-blue btn-small" onclick="toggleDailyLog()">Detail ▼</button></div>
            <div id="daily-detail-table" style="display:none; margin-top:10px;"></div></div>
            
            <div class="card">
                <h4>혈압/체중</h4>
                <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-bottom:10px; background:#f8f9fa; padding:8px; border-radius:8px;">
                    <label style="cursor:pointer; display:flex; align-items:center; font-weight:bold; color:var(--red);"><input type="checkbox" id="chk-sbp" checked onchange="renderBpChart()" style="margin-right:5px; width:auto; transform:scale(1.2);"> SBP</label>
                    <label style="cursor:pointer; display:flex; align-items:center; font-weight:bold; color:var(--green);"><input type="checkbox" id="chk-wt" checked onchange="renderBpChart()" style="margin-right:5px; width:auto; transform:scale(1.2);"> Weight</label>
                </div>
                <div class="chart-area"><canvas id="bpChart"></canvas></div>
                <div style="margin-top:10px; text-align:center;"><button class="btn btn-blue btn-small" onclick="toggleBpLog()">Detail ▼</button></div>
                <div id="bp-detail-table" style="display:none; margin-top:10px;"></div>
            </div>

            <div class="card"><h4>투약 이력</h4><div id="dose-logs"></div></div>
            <div class="card"><h4>기록 로그</h4><div id="rec-logs"></div></div>`;

        // 기존 차트 그리기 로직 등등 (생략 없이 유지)
        const logs = await db.collection("dailyLogs").where("ratId", "==", id).get();
        let processedLogs = [];
        logs.forEach(doc => {
            let v = doc.data();
            let dStr = v.date.trim();
            if(dStr.includes('.')) { const parts = dStr.split('.').map(s => s.trim()); if(parts.length >= 3) dStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`; }
            v.cleanDate = dStr;
            processedLogs.push(v);
        });
        processedLogs.sort((a, b) => new Date(a.cleanDate) - new Date(b.cleanDate));
        
        const uniqueMap = {};
        processedLogs.forEach(log => { uniqueMap[log.cleanDate] = log; });
        const finalLogs = Object.values(uniqueMap).sort((a, b) => new Date(a.cleanDate) - new Date(b.cleanDate));
        const dLab=[], dVal=[], dNotes=[], pStyles=[], pSizes=[], pColors=[];
        let tableHtml = `<table><tr><th>날짜</th><th>시간</th><th>Act</th><th>Fur</th><th>Eye</th><th>총점</th><th>메모</th></tr>`;
        finalLogs.forEach(v => { 
            dLab.push(v.cleanDate); dVal.push(v.totalScore); 
            if(v.note && v.note.trim()) { dNotes.push(v.note); pStyles.push('rectRot'); pSizes.push(8); pColors.push('#fdd835'); } 
            else { dNotes.push(null); pStyles.push('circle'); pSizes.push(3); pColors.push('#1a237e'); }
            const actScore = (v.scores.activity !== undefined) ? v.scores.activity : (v.scores.act || 0);
            tableHtml += `<tr><td>${v.cleanDate}</td><td>${v.timestamp || '-'}</td><td>${actScore}</td><td>${v.scores.fur}</td><td>${v.scores.eye}</td><td>${v.totalScore}</td><td style="text-align:left; max-width:200px; white-space:normal;">${v.note || ''}</td></tr>`;
        });
        tableHtml += `</table>`;
        document.getElementById('daily-detail-table').innerHTML = tableHtml;
        if(dVal.length) new Chart(document.getElementById('dailyChart'), { 
            type:'line', data:{ labels: dLab, datasets:[{ label:'Score', data: dVal, borderColor:'#1a237e', pointStyle: pStyles, pointRadius: pSizes, pointBackgroundColor: pColors, pointBorderColor: pColors }] }, 
            options:{ maintainAspectRatio:false, scales: { y: { min: 0, max: 17, ticks: { stepSize: 1 } } }, plugins:{ tooltip:{ callbacks:{ footer: (ti) => { const n = dNotes[ti[0].dataIndex]; if(!n) return ''; return ['📝 메모:', ...n.match(/.{1,20}/g)]; } } } } } 
        });

        const ms = await db.collection("measurements").where("ratId", "==", id).get();
        const ds = await db.collection("doseLogs").where("ratId", "==", id).get();
        const dataMap = {};
        ms.forEach(doc => {
            const v = doc.data();
            const date = v.date;
            if (!dataMap[date]) dataMap[date] = { date: date, label: v.timepoint || date, sbp: null, dbp: null, mean: null, wt: null };
            if (v.sbp) dataMap[date].sbp = v.sbp;
            if (v.dbp) dataMap[date].dbp = v.dbp;
            if (v.mean) dataMap[date].mean = v.mean;
            if (v.weight) dataMap[date].wt = v.weight;
            if (v.timepoint && !dataMap[date].label.includes('W') && v.timepoint.includes('W')) dataMap[date].label = v.timepoint; 
        });
        ds.forEach(doc => {
            const v = doc.data();
            const date = v.date;
            if (!dataMap[date]) dataMap[date] = { date: date, label: date, sbp: null, dbp: null, mean: null, wt: null };
            if (v.weight) dataMap[date].wt = v.weight;
        });
        globalBpData = Object.values(dataMap).sort((a,b) => new Date(a.date) - new Date(b.date));
        renderBpChart(); 

        let bpTable = '<table><tr><th>날짜</th><th>시점</th><th>SBP</th><th>DBP</th><th>Mean</th><th>WT</th></tr>';
        [...globalBpData].reverse().forEach(v => { bpTable += `<tr><td>${v.date}</td><td>${v.label}</td><td>${v.sbp||'-'}</td><td>${v.dbp||'-'}</td><td>${v.mean||'-'}</td><td>${v.wt||'-'}</td></tr>`; });
        bpTable += '</table>';
        document.getElementById('bp-detail-table').innerHTML = bpTable;

        let dHtml='<table><tr><th>날짜</th><th>WT(g)</th><th>Drug(mg)</th><th>Vol(ml)</th></tr>';
        const revDs = ds.docs.sort((a,b)=>new Date(b.data().date)-new Date(a.data().date));
        if(revDs.length) { revDs.slice(0,5).forEach(d=>{const v=d.data(); const mg=v.doseMg?v.doseMg:((v.weight/1000)*4*1.15).toFixed(3); dHtml+=`<tr><td>${v.date}</td><td>${v.weight}</td><td>${Number(mg).toFixed(2)}</td><td>${v.volMl.toFixed(2)}</td></tr>`;}); document.getElementById('dose-logs').innerHTML=dHtml+'</table>'; }
        else document.getElementById('dose-logs').innerHTML='데이터 없음';

        let rHtml='<table><tr><th>날짜</th><th>시점</th><th>SBP</th><th>WT</th></tr>';
        const sortedMs = ms.docs.map(d=>d.data()).sort((a,b)=>new Date(b.date)-new Date(a.date));
        sortedMs.slice(0,5).forEach(v=>{rHtml+=`<tr><td>${v.date}</td><td>${v.timepoint||'-'}</td><td>${v.sbp||'-'}</td><td>${v.weight||'-'}</td></tr>`;});
        document.getElementById('rec-logs').innerHTML = rHtml+'</table>';

    } catch(e) { console.error(e); }
}

function goToDetail(ratId) { go('detail', ratId); }

async function loadCohortDetail() {
    const checkboxes = document.querySelectorAll('#co-check-list .co-checkbox:checked');
    if(checkboxes.length === 0) return alert("분석할 코호트를 하나 이상 선택하세요.");
    const selectedCohorts = Array.from(checkboxes).map(cb => cb.value);
    
    // 코호트 분석 실행 (수정된 함수 호출)
    await runCohortAnalysis(selectedCohorts, 'cohort-res', '_main');
}


async function runCohortAnalysis(targetCohorts, targetDivId, uniqueSuffix = '', fixedOptions = null, customTitle = null) {
    const resDiv = document.getElementById(targetDivId);

    let headerHtml = '';
    if (customTitle) {
        headerHtml = `<div style="position:sticky; top:60px; z-index:80; background:#fff; padding:10px; border-bottom:2px solid var(--navy); margin-bottom:15px; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
            <span style="font-weight:bold; color:var(--navy); font-size:1rem;">${customTitle}</span>
        </div>`;
    }
    resDiv.innerHTML = headerHtml + `<div class="loader"></div> 데이터 분석 중...`;

    try {
        const ratPromises = targetCohorts.map(c => db.collection("rats").where("cohort", "==", c).get());
        const ratSnaps = await Promise.all(ratPromises);
        let rats = [];
        const ratInfoMap = {};

        ratSnaps.forEach(snap => { snap.forEach(d => { const r = d.data(); rats.push(r); ratInfoMap[r.ratId] = r; }); });
        if (rats.length === 0) { resDiv.innerHTML = "데이터 없음"; return; }

        const deadRats = rats.filter(r => r.status === "사망");
        rats.sort((a, b) => a.ratId.localeCompare(b.ratId));
        const ratIds = rats.map(r => r.ratId);

        const promises = ratIds.map(rid => db.collection("measurements").where("ratId", "==", rid).get());
        const snapshots = await Promise.all(promises);

        const scatterDataWt = [], scatterDataSbp = [];
        const existTicksWt = new Set(), existTicksSbp = new Set();
        const tickLabelMap = {};
        let maxDataPod = 0, minWt = 9999, maxWt = 0, minSbp = 9999, maxSbp = 0;

        snapshots.forEach((snap, idx) => {
            const r = rats[idx], rid = r.ratId;
            snap.forEach(doc => {
                const d = doc.data();
                let labelText = d.timepoint;
                if (!labelText || labelText === 'Manual') labelText = d.date;
                const pod = getPodForLabel(d.timepoint, r.surgeryDate, d.date);
                if ((d.timepoint === 'Manual' || !d.timepoint) && pod !== null) labelText = `D${pod}`;
                if (pod !== null) {
                    if (pod > maxDataPod) maxDataPod = pod;
                    const jitter = (Math.random() - 0.5) * 0.4;
                    if (d.weight) { scatterDataWt.push({ x: pod + jitter, y: d.weight, rid: rid, label: labelText }); existTicksWt.add(pod); if (d.weight < minWt) minWt = d.weight; if (d.weight > maxWt) maxWt = d.weight; }
                    if (d.sbp) { scatterDataSbp.push({ x: pod + jitter, y: d.sbp, rid: rid, label: labelText }); existTicksSbp.add(pod); if (d.sbp < minSbp) minSbp = d.sbp; if (d.sbp > maxSbp) maxSbp = d.sbp; }
                    if (!tickLabelMap[pod] || globalPodMap.hasOwnProperty(labelText)) tickLabelMap[pod] = labelText;
                }
            });
        });

        const standardKeys = Object.keys(globalPodMap).filter(k => k === 'Arrival' || k === 'D00' || k === 'D0' || k === 'D2' || k.startsWith('W'));
        standardKeys.forEach(k => { tickLabelMap[globalPodMap[k]] = k; });

        const arrivalPod = globalPodMap["Arrival"];
        const podToLabel = (pod) => pod <= arrivalPod ? "Arrival" : (tickLabelMap[pod] || `D${pod}`);

        const getRangeX = (ticksSet) => { if (ticksSet.size === 0) return { min: arrivalPod, max: 14 }; const arr = Array.from(ticksSet).sort((a, b) => a - b); const minVal = (arr[0] < arrivalPod) ? (arr[0] - 2) : arrivalPod; return { min: minVal, max: arr[arr.length - 1] + 2 }; };
        const rangeWtX = fixedOptions ? { min: fixedOptions.minX, max: fixedOptions.maxX } : getRangeX(existTicksWt);
        const rangeSbpX = fixedOptions ? { min: fixedOptions.minX, max: fixedOptions.maxX } : getRangeX(existTicksSbp);

        const calcYRange = (minVal, maxVal, defaultMin, defaultMax) => { if (minVal === 9999) return { min: defaultMin, max: defaultMax }; const diff = maxVal - minVal; const padding = diff === 0 ? 50 : diff * 0.3; let finalMin = minVal - padding; let finalMax = maxVal + padding; if (finalMin < 0) finalMin = 0; return { min: finalMin, max: finalMax }; };
        const rangeWtY = calcYRange(minWt, maxWt, 0, 500);
        const rangeSbpY = calcYRange(minSbp, maxSbp, 0, 250);

        const avgsWt = {}, avgsSbp = {};
        const calcAvg = (dataset, targetObj, isInt) => { const map = {}; dataset.forEach(p => { const roundedX = Math.round(p.x); if (!map[roundedX]) map[roundedX] = { sum: 0, cnt: 0 }; map[roundedX].sum += p.y; map[roundedX].cnt++; }); Object.keys(map).forEach(x => { targetObj[x] = isInt ? Math.round(map[x].sum / map[x].cnt) : (map[x].sum / map[x].cnt).toFixed(1); }); };
        calcAvg(scatterDataWt, avgsWt, false); calcAvg(scatterDataSbp, avgsSbp, true);

        const avgLineWt = Object.keys(avgsWt).map(pod => ({ x: Number(pod), y: avgsWt[pod] })).sort((a, b) => a.x - b.x);
        const avgLineSbp = Object.keys(avgsSbp).map(pod => ({ x: Number(pod), y: avgsSbp[pod] })).sort((a, b) => a.x - b.x);

        // --- 데이터 및 UI 생성 시작 ---
        let surgAgeSum = 0, surgAgeCnt = 0;
        let smpHist = 0, smpCast = 0, smpFail = 0;
        const mrStats = {}; 
        const podDaysMap = { 'D00': -1, 'D0': 0, 'D2': 2, 'W1': 7, 'W2': 14, 'W3': 21, 'W4': 28, 'W5': 35, 'W6': 42, 'W7': 49, 'W8': 56, 'W9': 63, 'W10': 70, 'W11': 77, 'W12': 84 };

        // 샘플 상세 모달 HTML 생성
        let sampleModalRows = '';

        rats.forEach(r => {
            if(r.sampleType === 'Histology') smpHist++;
            else if(r.sampleType === 'Cast') smpCast++;
            else if(r.sampleType === 'Fail') smpFail++;

            // 샘플 팝업을 위한 데이터 파싱 (+ MR 대비 경과일)
            let mrDiffStr = '-';
            if(r.sampleDate && r.mrDates && r.mrDates.length > 0) {
                const validMr = r.mrDates.filter(m => m.date).sort((a,b) => new Date(a.date) - new Date(b.date));
                if(validMr.length > 0) {
                    const lastMr = validMr[validMr.length - 1];
                    const diff = Math.round((new Date(r.sampleDate) - new Date(lastMr.date)) / (1000*60*60*24));
                    mrDiffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                }
            }
            
            sampleModalRows += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px; text-align:center;">${r.ratId} <span style="font-size:0.75rem; color:${r.status==='생존'?'green':'red'};">(${r.status})</span></td>
                    <td style="padding:8px; text-align:center;">
                        <span style="color:${r.sampleType==='Fail'?'red':'var(--navy)'}; font-weight:bold;">${r.sampleType||'-'}</span>
                    </td>
                    <td style="padding:8px; text-align:center;">${r.sampleDate||'-'}</td>
                    <td style="padding:8px; text-align:center; color:#e65100; font-weight:bold;">${mrDiffStr !== '-' ? mrDiffStr + '일' : '-'}</td>
                    <td style="padding:8px;">${r.sampleMemo||''}</td>
                </tr>
            `;

            if(r.arrivalDate && r.surgeryDate) {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const diff = new Date(r.surgeryDate) - new Date(r.arrivalDate);
                const surgAge = arrAge + (diff / (1000*60*60*24*7));
                surgAgeSum += surgAge;
                surgAgeCnt++;
            }

            if(r.surgeryDate && r.mrDates) {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const surgDt = new Date(r.surgeryDate);
                const isValidSurg = !isNaN(surgDt.getTime());
                const arrDt = r.arrivalDate ? new Date(r.arrivalDate) : null;
                const isValidArr = arrDt && !isNaN(arrDt.getTime());
                
                r.mrDates.forEach(mr => {
                    if(mr.timepoint === 'Death') return;
                    const expDays = podDaysMap[mr.timepoint];
                    if(expDays !== undefined && mr.date) {
                        const mrDt = new Date(mr.date);
                        if(isNaN(mrDt.getTime())) return; // 🚨 유효하지 않은 MR 날짜는 평균 계산에서 제외
                        
                        if(!mrStats[mr.timepoint]) mrStats[mr.timepoint] = { sum:0, cnt:0, sumAge:0, ageCnt:0 };

                        // 편차 계산 (수술일이 정상일 때만)
                        if(isValidSurg) {
                            const actDays = (mrDt - surgDt) / (1000*60*60*24);
                            const dev = actDays - expDays;
                            mrStats[mr.timepoint].sum += dev;
                            mrStats[mr.timepoint].cnt++;
                        }
                        
                        // 주령 계산 (반입일 우선, 없으면 수술일 기준 7.5주령으로 가상 계산)
                        let age = NaN;
                        if(isValidArr) {
                            age = arrAge + ((mrDt - arrDt) / (1000*60*60*24*7));
                        } else if(isValidSurg) {
                            age = 7.5 + ((mrDt - surgDt) / (1000*60*60*24*7));
                        }

                        if(!isNaN(age)) {
                            mrStats[mr.timepoint].sumAge += age;
                            mrStats[mr.timepoint].ageCnt++;
                        }
                    }
                });
            }
        });

        const avgSurgAge = surgAgeCnt > 0 ? (surgAgeSum/surgAgeCnt).toFixed(1) : '-';
        const mrKeys = Object.keys(mrStats).sort((a,b) => podDaysMap[a] - podDaysMap[b]);
        const mrHtml = mrKeys.length === 0 ? '<span style="color:#888;">데이터 없음</span>' : mrKeys.map(k => {
            const stat = mrStats[k];
            
            let devStr = '-';
            if(stat.cnt > 0) {
                const avgDev = (stat.sum / stat.cnt).toFixed(1);
                devStr = avgDev > 0 ? `+${avgDev}` : avgDev;
            }

            let ageStr = '-';
            let printCnt = stat.cnt > 0 ? stat.cnt : stat.ageCnt; // 표시할 n수
            if(stat.ageCnt > 0) {
                ageStr = (stat.sumAge / stat.ageCnt).toFixed(1);
            }

            if (k === 'D00' || k === 'D0') {
                return `<span style="background:#e3f2fd; padding:3px 8px; border-radius:4px; font-size:0.85rem;"><b>${k}</b>: ${ageStr}주령 (n=${printCnt})</span>`;
            } else {
                return `<span style="background:#e3f2fd; padding:3px 8px; border-radius:4px; font-size:0.85rem;"><b>${k}</b>: ${ageStr}주령 / 편차 ${devStr}일 (n=${printCnt})</span>`;
            }
        }).join('');

        let surgFailN = 0, areO = 0, areX = 0, areMicro = 0, areMacro = 0, areUnk = 0;
        rats.forEach(r => {
            const cod = r.cod || extractLegacyCod(r.codFull) || '';
            if (cod === 'Surgical Failure') surgFailN++;
            
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
        
        const totalN = rats.length;
        const validN = totalN - surgFailN;
        const rateTotal = totalN > 0 ? ((areO / totalN) * 100).toFixed(1) : 0;
        const rateValid = validN > 0 ? ((areO / validN) * 100).toFixed(1) : 0;

        let finalHtml = headerHtml;

        // 샘플 상세 모달 추가
        finalHtml += `
        <div id="sample-modal-${uniqueSuffix}" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; justify-content:center; align-items:center;">
            <div style="background:white; padding:20px; border-radius:12px; width:95%; max-width:700px; max-height:85vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--navy); padding-bottom:10px; margin-bottom:15px;">
                    <h3 style="margin:0; color:var(--navy);">🔬 샘플 획득 상세 내역 (총 ${rats.length}마리)</h3>
                    <button class="btn-red btn-small" onclick="document.getElementById('sample-modal-${uniqueSuffix}').style.display='none'">닫기 ✖</button>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="background:#f5f5f5; text-align:center;">
                            <th style="padding:8px;">Rat ID</th>
                            <th style="padding:8px;">종류</th>
                            <th style="padding:8px;">채취일</th>
                            <th style="padding:8px;">마지막 MR 기준</th>
                            <th style="padding:8px;">메모</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sampleModalRows || '<tr><td colspan="5" style="text-align:center; padding:15px;">데이터가 없습니다.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

        finalHtml += `
        <div class="card" style="border-left:5px solid #00c853;">
            <h4 style="margin-top:0; color:var(--navy);">📋 기본 정보 요약</h4>
            <div class="info-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom:10px;">
                <div class="info-item"><b>평균 수술 주령</b><br><span style="color:var(--navy); font-size:1.2rem;">${avgSurgAge} 주</span></div>
                <div class="info-item" style="cursor:pointer; background:#fff3e0; border:1px solid #ffcc80;" onclick="document.getElementById('sample-modal-${uniqueSuffix}').style.display='flex'">
                    <b>획득 샘플 수</b> <span style="font-size:0.75rem; color:var(--red);">(클릭하여 상세확인)</span><br>
                    <span style="font-size:0.9rem;">Histology: <b>${smpHist}</b> / Cast: <b>${smpCast}</b> / Fail: <b>${smpFail}</b></span>
                </div>
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee;">
                <b style="font-size:0.9rem; color:var(--navy);">📷 MR 촬영 편차 (수술일 기준)</b>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">${mrHtml}</div>
            </div>
        </div>`;

        finalHtml += `
        <div class="card" style="border-left:5px solid #9c27b0;">
            <h4 style="margin-top:0; margin-bottom:10px; color:var(--navy);">🧠 ARE 발생률</h4>
            <div id="are-data-wrap-${uniqueSuffix}" style="display:flex; justify-content:flex-end; gap:15px; margin-bottom:15px; font-size:0.9rem;"
                data-total="${totalN}" data-valid="${validN}" data-micro="${areMicro}" data-macro="${areMacro}" data-unk="${areUnk}">
                <label style="cursor:pointer;"><input type="checkbox" value="micro" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> micro</label>
                <label style="cursor:pointer;"><input type="checkbox" value="macro" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> macro</label>
                <label style="cursor:pointer;"><input type="checkbox" value="미확인" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> 미확인</label>
            </div>
            <div style="margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:5px; color:#555;">
                    <span>전체 기준 (Total N = ${totalN})</span>
                    <span id="are-text-total-${uniqueSuffix}" style="font-weight:bold; color:#333;">${areO} / ${totalN} (${rateTotal}%)</span>
                </div>
                <div style="width:100%; background:#e0e0e0; height:14px; border-radius:7px; overflow:hidden;">
                    <div id="are-bar-total-${uniqueSuffix}" style="width:${rateTotal}%; background:#1565C0; height:100%; transition: width 0.3s;"></div>
                </div>
            </div>
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:5px; color:#555;">
                    <span>Surgical Failure 제외 (Valid N = ${validN})</span>
                    <span id="are-text-valid-${uniqueSuffix}" style="font-weight:bold; color:#333;">${areO} / ${validN} (${rateValid}%)</span>
                </div>
                <div style="width:100%; background:#e0e0e0; height:14px; border-radius:7px; overflow:hidden;">
                    <div id="are-bar-valid-${uniqueSuffix}" style="width:${rateValid}%; background:#F57C00; height:100%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>`;

        const sChartId = `survChart${uniqueSuffix}`, sTableId = `survTable${uniqueSuffix}`;
        const codChartId = `codChart${uniqueSuffix}`, areChartId = `areChart${uniqueSuffix}`;
        const bpChartId = `coChartSbp${uniqueSuffix}`, bpTableId = `coTableSbp${uniqueSuffix}`;
        const wtChartId = `coChartWt${uniqueSuffix}`, wtTableId = `coTableWt${uniqueSuffix}`;
        const chartHeight = "500px";

        if (deadRats.length > 0) {
            let survTable = `<table><tr><th>ID</th><th>사망일</th><th>시점</th></tr>`;
            deadRats.forEach(r => {
                const pod = r.surgeryDate && r.deathDate ? Math.floor((new Date(r.deathDate) - new Date(r.surgeryDate)) / (1000 * 60 * 60 * 24)) : '?';
                const displayCod = r.cod || extractLegacyCod(r.codFull) || '미기록';
                survTable += `<tr><td>${r.ratId}</td><td>${r.deathDate || '-'}</td><td>POD ${pod}<br><span style="font-size:0.8em; color:gray">${displayCod}</span></td></tr>`;
            });
            survTable += `</table>`;
            
            finalHtml += `
            <div class="card" style="border-left:5px solid var(--red)">
                <h4>⚰️ 사망 분석 (${deadRats.length}) - 생존율 (주령 기준)</h4>
                <div class="chart-area" style="height:250px;"><canvas id="${sChartId}"></canvas></div>
                <button class="data-toggle-btn" onclick="toggleDisplay('${sTableId}')">▼ 상세 데이터</button>
                <div id="${sTableId}" class="data-detail-box">${survTable}</div>
                
                <div style="display:flex; gap:20px; margin-top:30px; border-top:1px solid #eee; padding-top:20px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:250px; text-align:center;">
                        <h5 style="color:var(--navy); margin-bottom:10px;">사망 원인 (COD) 비율</h5>
                        <div style="height:220px;"><canvas id="${codChartId}"></canvas></div>
                    </div>
                    <div style="flex:1; min-width:250px; text-align:center;">
                        <h5 style="color:var(--navy); margin-bottom:10px;">전체 ARE 비율 (O/X)</h5>
                        <div style="height:220px;"><canvas id="${areChartId}"></canvas></div>
                    </div>
                </div>
            </div>`;
        }

        const controlPanel = `<div style="display:flex; align-items:center; gap:10px;"><button class="crosshair-toggle-btn" onclick="toggleCrosshair()" style="padding:4px 8px; border:none; border-radius:4px; font-size:0.75rem; cursor:pointer; background:${isCrosshairEnabled ? '#FFD600' : '#ddd'}; color:${isCrosshairEnabled ? '#000' : '#777'}; transition:0.2s; font-weight:bold;">${isCrosshairEnabled ? '🎯 가이드선 ON' : '🎯 가이드선 OFF'}</button><button class="indiv-toggle-btn" onclick="toggleIndividual()" style="padding:4px 8px; border:none; border-radius:4px; font-size:0.75rem; cursor:pointer; background:${isIndividualVisible ? '#00c853' : '#ddd'}; color:${isIndividualVisible ? '#fff' : '#777'}; transition:0.2s; font-weight:bold;">${isIndividualVisible ? '👥 개별점 ON' : '👥 개별점 OFF'}</button><span style="font-size:0.75rem; color:#fff; background:#555; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="Chart.getChart('${bpChartId}').resetZoom(); Chart.getChart('${wtChartId}').resetZoom();">🖱️ 줌 초기화</span></div>`;
        const sortedTicksSbp = Array.from(existTicksSbp).sort((a, b) => a - b);
        let bpTableHeaders = `<th style="width:40px;">Show</th><th>ID</th>` + sortedTicksSbp.map(pod => `<th style="min-width:60px; text-align:center; padding:5px;"><label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;"><input type="checkbox" checked onchange="toggleTimepointVisibility('${bpChartId}', ${pod}, this.checked)" style="transform:scale(1.1); margin-bottom:4px;"><span style="line-height:1;">${podToLabel(pod)}</span></label></th>`).join('');
        let bpTable = `<div style="overflow-x:auto;"><table><tr>${bpTableHeaders}</tr>`;
        const avgSbpRow = sortedTicksSbp.map(pod => avgsSbp[pod] || '-');
        ratIds.forEach(id => { const rInfo = ratInfoMap[id]; const rData = scatterDataSbp.filter(d => d.rid === id); bpTable += `<tr><td style="text-align:center;"><input type="checkbox" checked onchange="toggleRatVisibility('${bpChartId}', '${id}', this.checked)" style="transform:scale(1.2); cursor:pointer;"></td><td>${rInfo.status === '사망' ? '💀' : '🟢'} ${id}</td>`; sortedTicksSbp.forEach(pod => { const match = rData.find(d => Math.abs(d.x - pod) < 0.5); bpTable += `<td>${match ? match.y : '-'}</td>`; }); bpTable += `</tr>`; });
        bpTable += `<tr style="background:#e3f2fd; font-weight:bold;"><td>-</td><td>AVG</td>${avgSbpRow.map(v => `<td>${v}</td>`).join('')}</tr></table></div>`;
        finalHtml += `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h4>🩸 혈압 (SBP)</h4>${controlPanel}</div><div class="chart-area" style="height:${chartHeight}"><canvas id="${bpChartId}"></canvas></div><button class="data-toggle-btn" onclick="toggleDisplay('${bpTableId}')">▼ 상세 데이터</button><div id="${bpTableId}" class="data-detail-box">${bpTable}</div></div>`;

        const sortedTicksWt = Array.from(existTicksWt).sort((a, b) => a - b);
        let wtTableHeaders = `<th style="width:40px;">Show</th><th>ID</th>` + sortedTicksWt.map(pod => `<th style="min-width:60px; text-align:center; padding:5px;"><label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;"><input type="checkbox" checked onchange="toggleTimepointVisibility('${wtChartId}', ${pod}, this.checked)" style="transform:scale(1.1); margin-bottom:4px;"><span style="line-height:1;">${podToLabel(pod)}</span></label></th>`).join('');
        let wtTable = `<div style="overflow-x:auto;"><table><tr>${wtTableHeaders}</tr>`;
        const avgWtRow = sortedTicksWt.map(pod => avgsWt[pod] || '-');
        ratIds.forEach(id => { const rInfo = ratInfoMap[id]; const rData = scatterDataWt.filter(d => d.rid === id); wtTable += `<tr><td style="text-align:center;"><input type="checkbox" checked onchange="toggleRatVisibility('${wtChartId}', '${id}', this.checked)" style="transform:scale(1.2); cursor:pointer;"></td><td>${rInfo.status === '사망' ? '💀' : '🟢'} ${id}</td>`; sortedTicksWt.forEach(pod => { const match = rData.find(d => Math.abs(d.x - pod) < 0.5); wtTable += `<td>${match ? match.y : '-'}</td>`; }); wtTable += `</tr>`; });
        wtTable += `<tr style="background:#e8f5e9; font-weight:bold;"><td>-</td><td>AVG</td>${avgWtRow.map(v => `<td>${v}</td>`).join('')}</tr></table></div>`;
        finalHtml += `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h4>⚖️ 체중 (Weight)</h4>${controlPanel}</div><div class="chart-area" style="height:${chartHeight}"><canvas id="${wtChartId}"></canvas></div><button class="data-toggle-btn" onclick="toggleDisplay('${wtTableId}')">▼ 상세 데이터</button><div id="${wtTableId}" class="data-detail-box">${wtTable}</div></div>`;

        resDiv.innerHTML = finalHtml;

        if (deadRats.length > 0) {
            let minAge = 999, maxAge = 0; const deathByAge = {};
            rats.forEach(r => {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6; let endAge = arrAge;
                if(r.status === '사망' && r.deathDate && r.arrivalDate) { endAge = arrAge + ((new Date(r.deathDate) - new Date(r.arrivalDate)) / (1000*60*60*24*7)); const w = Math.floor(endAge); deathByAge[w] = (deathByAge[w] || 0) + 1; }
                else if (r.arrivalDate) { endAge = arrAge + ((new Date() - new Date(r.arrivalDate)) / (1000*60*60*24*7)); }
                if(endAge < minAge) minAge = Math.floor(endAge); if(endAge > maxAge) maxAge = Math.ceil(endAge);
            });
            if(minAge === 999) minAge = 6;
            const survLabels = [], survData = []; let currentAlive = rats.length;
            for (let w = minAge; w <= maxAge; w++) { survLabels.push(`${w}주령`); if (deathByAge[w]) currentAlive -= deathByAge[w]; survData.push((currentAlive / rats.length) * 100); }
            new Chart(document.getElementById(sChartId), { type: 'line', data: { labels: survLabels, datasets: [{ label: 'Survival Rate (%)', data: survData, borderColor: '#333', backgroundColor: 'rgba(0,0,0,0.1)', fill: true, stepper: true }] }, options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } } });

            const codCounts = {}; deadRats.forEach(r => { const cod = r.cod || extractLegacyCod(r.codFull) || 'Unknown'; codCounts[cod] = (codCounts[cod] || 0) + 1; });
            const areCountsObj = { 'O':0, 'X':0, '미기록':0 }; rats.forEach(r => { const areMain = r.are ? r.are.split(' ')[0] : '미기록'; if(['O','X'].includes(areMain)) areCountsObj[areMain]++; else areCountsObj['미기록']++; });
            const dOpt = { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a,b)=>a+b,0); return `${ctx.label}: ${ctx.raw} (${((ctx.raw/total)*100).toFixed(1)}%)`; } } } } };
            const codBgColors = Object.keys(codCounts).map(k => typeof codColors !== 'undefined' && codColors[k] ? codColors[k] : '#C9CBCF');
            new Chart(document.getElementById(codChartId), { type: 'doughnut', data: { labels: Object.keys(codCounts), datasets: [{ data: Object.values(codCounts), backgroundColor: codBgColors }] }, options: dOpt });
            new Chart(document.getElementById(areChartId), { type: 'doughnut', data: { labels: Object.keys(areCountsObj), datasets: [{ data: Object.values(areCountsObj), backgroundColor: ['#1565C0', '#4CAF50', '#9E9E9E'] }] }, options: dOpt });
        }

        const getStandardPodsInRange = (minX, maxX) => { const pods = []; ["Arrival", "D00", "D0", "D2"].forEach(k => { const v = globalPodMap[k]; if (v >= minX && v <= maxX) pods.push(v); }); for (let i = 1; i <= 12; i++) { const k = `W${i}`; const v = globalPodMap[k]; if (v >= minX && v <= maxX) pods.push(v); } pods.sort((a, b) => a - b); return Array.from(new Set(pods)); };
        const buildLinearTicks = (minX, maxX, step) => { const ticks = []; const start = Math.ceil(minX); const end = Math.floor(maxX); for (let v = start; v <= end; v += step) ticks.push(v); return ticks; };
        const createChartOptions = (minX, maxX, minY, maxY) => ({ maintainAspectRatio: false, layout: { padding: { right: 10, bottom: 28 } }, scales: { x: { type: 'linear', min: minX, max: maxX, afterBuildTicks: (scale) => { const range = scale.max - scale.min; if (range > 70) { scale.ticks = getStandardPodsInRange(scale.min, scale.max).map(v => ({ value: v })); return; } const ticks = buildLinearTicks(scale.min, scale.max, range > 30 ? 2 : 1); getStandardPodsInRange(scale.min, scale.max).forEach(v => ticks.push(v)); ticks.sort((a, b) => a - b); scale.ticks = Array.from(new Set(ticks)).map(v => ({ value: v })); }, ticks: { minRotation: 90, maxRotation: 90, autoSkip: false, callback: function (value) { return podToLabel(value); } }, grid: { color: (ctx) => tickLabelMap[ctx.tick.value] ? '#ddd' : '#f5f5f5' } }, y: { min: minY, max: maxY, ticks: { maxTicksLimit: 16 } } }, plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }, pan: { enabled: true, mode: 'xy', threshold: 10 }, limits: { x: { min: arrivalPod, max: maxX + 50 }, y: { min: 0, max: maxY + 200 } } }, tooltip: { enabled: true, callbacks: { title: (items) => { if (!items || !items.length) return ''; const it = items[0]; const pod = Math.round(it.parsed.x); if (it.dataset && it.dataset.label === 'Average') return podToLabel(pod); return (it.raw && it.raw.label) ? it.raw.label : podToLabel(pod); } } } } });

        const wtOpts = createChartOptions(rangeWtX.min, rangeWtX.max, rangeWtY.min, rangeWtY.max);
        const wtChart = new Chart(document.getElementById(wtChartId), { type: 'scatter', data: { datasets: [{ type: 'line', label: 'Average', data: avgLineWt, borderColor: '#00c853', borderWidth: 2, tension: 0.1, pointRadius: 3 }, { type: 'scatter', label: 'Individual', data: scatterDataWt, backgroundColor: 'rgba(0, 200, 83, 0.3)', pointRadius: 3, hidden: !isIndividualVisible }] }, options: wtOpts, plugins: [syncCrosshairPlugin] });
        document.getElementById(wtChartId).ondblclick = () => wtChart.resetZoom();

        const bpOpts = createChartOptions(rangeSbpX.min, rangeSbpX.max, rangeSbpY.min, rangeSbpY.max);
        const bpChart = new Chart(document.getElementById(bpChartId), { type: 'scatter', data: { datasets: [{ type: 'line', label: 'Average', data: avgLineSbp, borderColor: '#d32f2f', borderWidth: 2, tension: 0.1 }, { type: 'scatter', label: 'Individual', data: scatterDataSbp, backgroundColor: 'rgba(211, 47, 47, 0.3)', pointRadius: 3, hidden: !isIndividualVisible }] }, options: bpOpts, plugins: [syncCrosshairPlugin] });
        document.getElementById(bpChartId).ondblclick = () => bpChart.resetZoom();

        const enableCompareSync = (uniqueSuffix && (uniqueSuffix.includes('_comp_') || uniqueSuffix.includes('_grp_')));
        wtChart._syncType = 'wt'; bpChart._syncType = 'sbp';

        if (enableCompareSync) {
            syncChartsWt = syncChartsWt.filter(c => c && !c._destroyed); syncChartsSbp = syncChartsSbp.filter(c => c && !c._destroyed);
            if (!syncChartsWt.includes(wtChart)) syncChartsWt.push(wtChart);
            if (!syncChartsSbp.includes(bpChart)) syncChartsSbp.push(bpChart);
            let __zoomSyncLock = false;
            function syncZoomPeers(source, peers) { if (__zoomSyncLock) return; __zoomSyncLock = true; const sx = source.scales.x; const sy = source.scales.y; peers.forEach(t => { if (!t || t === source || t._destroyed) return; if (t._syncType !== source._syncType) return; t.options.scales.x.min = sx.min; t.options.scales.x.max = sx.max; t.options.scales.y.min = sy.min; t.options.scales.y.max = sy.max; t.update('none'); }); __zoomSyncLock = false; }
            wtChart.options.plugins.zoom.zoom.onZoomComplete = ({ chart }) => syncZoomPeers(chart, syncChartsWt); wtChart.options.plugins.zoom.pan.onPanComplete   = ({ chart }) => syncZoomPeers(chart, syncChartsWt);
            bpChart.options.plugins.zoom.zoom.onZoomComplete = ({ chart }) => syncZoomPeers(chart, syncChartsSbp); bpChart.options.plugins.zoom.pan.onPanComplete   = ({ chart }) => syncZoomPeers(chart, syncChartsSbp);
            wtChart.update('none'); bpChart.update('none');
        }
    } catch (e) { console.error(e); resDiv.innerHTML = `<p style="color:red">오류: ${e.message}</p>`; }
}

async function runRatListAnalysis(ratDataList, targetDivId, uniqueSuffix, customTitle, fixedOptions, groupKey) {
    const resDiv = document.getElementById(targetDivId);
    const headerHtml = `<div style="position:sticky; top:60px; z-index:90; background:#f8f9fa; padding:10px; border-bottom:2px solid var(--navy); margin-bottom:15px; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);"><span style="font-weight:bold; color:var(--navy); font-size:1rem;">${customTitle}</span></div>`;
    if (!ratDataList || ratDataList.length === 0) { resDiv.innerHTML = headerHtml + `<div style="padding:20px; text-align:center; color:#777;">해당 그룹에 포함된 개체가 없습니다.</div>`; return; }
    resDiv.innerHTML = headerHtml + `<div class="loader"></div> 로딩 중...`;

    try {
        const deadRats = ratDataList.filter(r => r.status === "사망");
        ratDataList.sort((a, b) => a.ratId.localeCompare(b.ratId));
        const ratIds = ratDataList.map(r => r.ratId);
        const ratInfoMap = {}; ratDataList.forEach(r => ratInfoMap[r.ratId] = r);

        const promises = ratIds.map(rid => db.collection("measurements").where("ratId", "==", rid).get());
        const snapshots = await Promise.all(promises);

        const scatterDataWt = [], scatterDataSbp = [];
        const existTicksWt = new Set(), existTicksSbp = new Set();
        const tickLabelMap = {};
        let minWt = 9999, maxWt = 0, minSbp = 9999, maxSbp = 0, maxDataPod = 0;

        snapshots.forEach((snap, idx) => {
            const r = ratDataList[idx], rid = r.ratId;
            snap.forEach(doc => {
                const d = doc.data();
                let labelText = d.timepoint;
                if (!labelText || labelText === 'Manual') labelText = d.date;
                const pod = getPodForLabel(d.timepoint, r.surgeryDate, d.date);
                if ((d.timepoint === 'Manual' || !d.timepoint) && pod !== null) labelText = `D${pod}`;
                if (pod !== null) {
                    if (pod > maxDataPod) maxDataPod = pod;
                    const jitter = (Math.random() - 0.5) * 0.4;
                    if (d.weight) { scatterDataWt.push({ x: pod + jitter, y: d.weight, rid: rid, label: labelText }); existTicksWt.add(pod); if (d.weight < minWt) minWt = d.weight; if (d.weight > maxWt) maxWt = d.weight; }
                    if (d.sbp) { scatterDataSbp.push({ x: pod + jitter, y: d.sbp, rid: rid, label: labelText }); existTicksSbp.add(pod); if (d.sbp < minSbp) minSbp = d.sbp; if (d.sbp > maxSbp) maxSbp = d.sbp; }
                    if (!tickLabelMap[pod] || globalPodMap.hasOwnProperty(labelText)) tickLabelMap[pod] = labelText;
                }
            });
        });

        const standardKeys = Object.keys(globalPodMap).filter(k => k === 'Arrival' || k === 'D00' || k === 'D0' || k === 'D2' || k.startsWith('W'));
        standardKeys.forEach(k => { tickLabelMap[globalPodMap[k]] = k; });
        const arrivalPod = globalPodMap["Arrival"];
        const podToLabel = (pod) => pod <= arrivalPod ? "Arrival" : (tickLabelMap[pod] || `D${pod}`);
        const getRangeX = (ticksSet) => { if (ticksSet.size === 0) return { min: arrivalPod, max: 14 }; const arr = Array.from(ticksSet).sort((a, b) => a - b); const minVal = (arr[0] < arrivalPod) ? (arr[0] - 2) : arrivalPod; return { min: minVal, max: arr[arr.length - 1] + 2 }; };
        const rangeWtX = getRangeX(existTicksWt); const rangeSbpX = getRangeX(existTicksSbp);
        const calcYRange = (minVal, maxVal, defaultMin, defaultMax) => { if (minVal === 9999) return { min: defaultMin, max: defaultMax }; const diff = maxVal - minVal; const padding = diff === 0 ? 50 : diff * 0.3; let finalMin = minVal - padding; let finalMax = maxVal + padding; if (finalMin < 0) finalMin = 0; return { min: finalMin, max: finalMax }; };
        const rangeWtY = (fixedOptions && fixedOptions.maxWt) ? { min: 0, max: fixedOptions.maxWt + 50 } : calcYRange(minWt, maxWt, 0, 500);
        const rangeSbpY = (fixedOptions && fixedOptions.maxSbp) ? { min: 0, max: fixedOptions.maxSbp + 20 } : calcYRange(minSbp, maxSbp, 0, 250);

        const avgsWt = {}, avgsSbp = {};
        const calcAvg = (dataset, targetObj, isInt) => { const map = {}; dataset.forEach(p => { const roundedX = Math.round(p.x); if (!map[roundedX]) map[roundedX] = { sum: 0, cnt: 0 }; map[roundedX].sum += p.y; map[roundedX].cnt++; }); Object.keys(map).forEach(x => { targetObj[x] = isInt ? Math.round(map[x].sum / map[x].cnt) : (map[x].sum / map[x].cnt).toFixed(1); }); };
        calcAvg(scatterDataWt, avgsWt, false); calcAvg(scatterDataSbp, avgsSbp, true);
        const avgLineWt = Object.keys(avgsWt).map(pod => ({ x: Number(pod), y: avgsWt[pod] })).sort((a, b) => a.x - b.x);
        const avgLineSbp = Object.keys(avgsSbp).map(pod => ({ x: Number(pod), y: avgsSbp[pod] })).sort((a, b) => a.x - b.x);

        // --- UI 및 데이터 파싱 ---
        let surgAgeSum = 0, surgAgeCnt = 0;
        let smpHist = 0, smpCast = 0, smpFail = 0;
        const mrStats = {}; 
        const podDaysMap = { 'D00': -1, 'D0': 0, 'D2': 2, 'W1': 7, 'W2': 14, 'W3': 21, 'W4': 28, 'W5': 35, 'W6': 42, 'W7': 49, 'W8': 56, 'W9': 63, 'W10': 70, 'W11': 77, 'W12': 84 };

        let sampleModalRows = '';

        ratDataList.forEach(r => {
            if(r.sampleType === 'Histology') smpHist++;
            else if(r.sampleType === 'Cast') smpCast++;
            else if(r.sampleType === 'Fail') smpFail++;

            let mrDiffStr = '-';
            if(r.sampleDate && r.mrDates && r.mrDates.length > 0) {
                const validMr = r.mrDates.filter(m => m.date).sort((a,b) => new Date(a.date) - new Date(b.date));
                if(validMr.length > 0) {
                    const lastMr = validMr[validMr.length - 1];
                    const diff = Math.round((new Date(r.sampleDate) - new Date(lastMr.date)) / (1000*60*60*24));
                    mrDiffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                }
            }
            
            sampleModalRows += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px; text-align:center;">${r.ratId} <span style="font-size:0.75rem; color:${r.status==='생존'?'green':'red'};">(${r.status})</span></td>
                    <td style="padding:8px; text-align:center;">
                        <span style="color:${r.sampleType==='Fail'?'red':'var(--navy)'}; font-weight:bold;">${r.sampleType||'-'}</span>
                    </td>
                    <td style="padding:8px; text-align:center;">${r.sampleDate||'-'}</td>
                    <td style="padding:8px; text-align:center; color:#e65100; font-weight:bold;">${mrDiffStr !== '-' ? mrDiffStr + '일' : '-'}</td>
                    <td style="padding:8px;">${r.sampleMemo||''}</td>
                </tr>
            `;

            if(r.arrivalDate && r.surgeryDate) {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const diff = new Date(r.surgeryDate) - new Date(r.arrivalDate);
                const surgAge = arrAge + (diff / (1000*60*60*24*7));
                surgAgeSum += surgAge;
                surgAgeCnt++;
            }

            if(r.surgeryDate && r.mrDates) {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
                const surgDt = new Date(r.surgeryDate);
                const isValidSurg = !isNaN(surgDt.getTime());
                const arrDt = r.arrivalDate ? new Date(r.arrivalDate) : null;
                const isValidArr = arrDt && !isNaN(arrDt.getTime());
                
                r.mrDates.forEach(mr => {
                    if(mr.timepoint === 'Death') return;
                    const expDays = podDaysMap[mr.timepoint];
                    if(expDays !== undefined && mr.date) {
                        const mrDt = new Date(mr.date);
                        if(isNaN(mrDt.getTime())) return; // 🚨 유효하지 않은 MR 날짜는 평균 계산에서 제외
                        
                        if(!mrStats[mr.timepoint]) mrStats[mr.timepoint] = { sum:0, cnt:0, sumAge:0, ageCnt:0 };

                        // 편차 계산 (수술일이 정상일 때만)
                        if(isValidSurg) {
                            const actDays = (mrDt - surgDt) / (1000*60*60*24);
                            const dev = actDays - expDays;
                            mrStats[mr.timepoint].sum += dev;
                            mrStats[mr.timepoint].cnt++;
                        }
                        
                        // 주령 계산 (반입일 우선, 없으면 수술일 기준 7.5주령으로 가상 계산)
                        let age = NaN;
                        if(isValidArr) {
                            age = arrAge + ((mrDt - arrDt) / (1000*60*60*24*7));
                        } else if(isValidSurg) {
                            age = 7.5 + ((mrDt - surgDt) / (1000*60*60*24*7));
                        }

                        if(!isNaN(age)) {
                            mrStats[mr.timepoint].sumAge += age;
                            mrStats[mr.timepoint].ageCnt++;
                        }
                    }
                });
            }
        });

        const avgSurgAge = surgAgeCnt > 0 ? (surgAgeSum/surgAgeCnt).toFixed(1) : '-';
        const mrKeys = Object.keys(mrStats).sort((a,b) => podDaysMap[a] - podDaysMap[b]);
        const mrHtml = mrKeys.length === 0 ? '<span style="color:#888;">데이터 없음</span>' : mrKeys.map(k => {
            const stat = mrStats[k];
            
            let devStr = '-';
            if(stat.cnt > 0) {
                const avgDev = (stat.sum / stat.cnt).toFixed(1);
                devStr = avgDev > 0 ? `+${avgDev}` : avgDev;
            }

            let ageStr = '-';
            let printCnt = stat.cnt > 0 ? stat.cnt : stat.ageCnt; // 표시할 n수
            if(stat.ageCnt > 0) {
                ageStr = (stat.sumAge / stat.ageCnt).toFixed(1);
            }

            if (k === 'D00' || k === 'D0') {
                return `<span style="background:#e3f2fd; padding:3px 8px; border-radius:4px; font-size:0.85rem;"><b>${k}</b>: ${ageStr}주령 (n=${printCnt})</span>`;
            } else {
                return `<span style="background:#e3f2fd; padding:3px 8px; border-radius:4px; font-size:0.85rem;"><b>${k}</b>: ${ageStr}주령 / 편차 ${devStr}일 (n=${printCnt})</span>`;
            }
        }).join('');

        let surgFailN = 0, areO = 0, areX = 0, areMicro = 0, areMacro = 0, areUnk = 0;
        ratDataList.forEach(r => {
            const cod = r.cod || extractLegacyCod(r.codFull) || '';
            if (cod === 'Surgical Failure') surgFailN++;
            if (r.are) {
                if (r.are.startsWith('O')) { areO++; if(r.are.includes('micro')) areMicro++; else if(r.are.includes('macro')) areMacro++; else areUnk++; } 
                else if (r.are === 'X') { areX++; }
            }
        });
        
        const totalN = ratDataList.length;
        const validN = totalN - surgFailN;
        const rateTotal = totalN > 0 ? ((areO / totalN) * 100).toFixed(1) : 0;
        const rateValid = validN > 0 ? ((areO / validN) * 100).toFixed(1) : 0;

        let finalHtml = headerHtml;

        // 샘플 상세 모달 추가
        finalHtml += `
        <div id="sample-modal-${uniqueSuffix}" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; justify-content:center; align-items:center;">
            <div style="background:white; padding:20px; border-radius:12px; width:95%; max-width:700px; max-height:85vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--navy); padding-bottom:10px; margin-bottom:15px;">
                    <h3 style="margin:0; color:var(--navy);">🔬 샘플 획득 상세 내역 (총 ${ratDataList.length}마리)</h3>
                    <button class="btn-red btn-small" onclick="document.getElementById('sample-modal-${uniqueSuffix}').style.display='none'">닫기 ✖</button>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="background:#f5f5f5; text-align:center;">
                            <th style="padding:8px;">Rat ID</th>
                            <th style="padding:8px;">종류</th>
                            <th style="padding:8px;">채취일</th>
                            <th style="padding:8px;">마지막 MR 기준</th>
                            <th style="padding:8px;">메모</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sampleModalRows || '<tr><td colspan="5" style="text-align:center; padding:15px;">데이터가 없습니다.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

        finalHtml += `
        <div class="card" style="border-left:5px solid #00c853;">
            <h4 style="margin-top:0; color:var(--navy);">📋 기본 정보 요약</h4>
            <div class="info-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom:10px;">
                <div class="info-item"><b>평균 수술 주령</b><br><span style="color:var(--navy); font-size:1.2rem;">${avgSurgAge} 주</span></div>
                <div class="info-item" style="cursor:pointer; background:#fff3e0; border:1px solid #ffcc80;" onclick="document.getElementById('sample-modal-${uniqueSuffix}').style.display='flex'">
                    <b>획득 샘플 수</b> <span style="font-size:0.75rem; color:var(--red);">(클릭하여 상세확인)</span><br>
                    <span style="font-size:0.9rem;">Histology: <b>${smpHist}</b> / Cast: <b>${smpCast}</b> / Fail: <b>${smpFail}</b></span>
                </div>
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee;">
                <b style="font-size:0.9rem; color:var(--navy);">📷 MR 촬영 편차 (수술일 기준)</b>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">${mrHtml}</div>
            </div>
        </div>`;

        finalHtml += `
        <div class="card" style="border-left:5px solid #9c27b0;">
            <h4 style="margin-top:0; margin-bottom:10px; color:var(--navy);">🧠 ARE 발생률</h4>
            <div id="are-data-wrap-${uniqueSuffix}" style="display:flex; justify-content:flex-end; gap:15px; margin-bottom:15px; font-size:0.9rem;"
                data-total="${totalN}" data-valid="${validN}" data-micro="${areMicro}" data-macro="${areMacro}" data-unk="${areUnk}">
                <label style="cursor:pointer;"><input type="checkbox" value="micro" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> micro</label>
                <label style="cursor:pointer;"><input type="checkbox" value="macro" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> macro</label>
                <label style="cursor:pointer;"><input type="checkbox" value="미확인" checked onchange="updateAreBarMulti('${uniqueSuffix}')" style="transform:scale(1.2); margin-right:5px;"> 미확인</label>
            </div>
            <div style="margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:5px; color:#555;">
                    <span>전체 기준 (Total N = ${totalN})</span>
                    <span id="are-text-total-${uniqueSuffix}" style="font-weight:bold; color:#333;">${areO} / ${totalN} (${rateTotal}%)</span>
                </div>
                <div style="width:100%; background:#e0e0e0; height:14px; border-radius:7px; overflow:hidden;">
                    <div id="are-bar-total-${uniqueSuffix}" style="width:${rateTotal}%; background:#1565C0; height:100%; transition: width 0.3s;"></div>
                </div>
            </div>
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:5px; color:#555;">
                    <span>Surgical Failure 제외 (Valid N = ${validN})</span>
                    <span id="are-text-valid-${uniqueSuffix}" style="font-weight:bold; color:#333;">${areO} / ${validN} (${rateValid}%)</span>
                </div>
                <div style="width:100%; background:#e0e0e0; height:14px; border-radius:7px; overflow:hidden;">
                    <div id="are-bar-valid-${uniqueSuffix}" style="width:${rateValid}%; background:#F57C00; height:100%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>`;

        const sChartId = `survChart${uniqueSuffix}`, sTableId = `survTable${uniqueSuffix}`;
        const codChartId = `codChart${uniqueSuffix}`, areChartId = `areChart${uniqueSuffix}`;
        const bpChartId = `coChartSbp${uniqueSuffix}`, bpTableId = `coTableSbp${uniqueSuffix}`;
        const wtChartId = `coChartWt${uniqueSuffix}`, wtTableId = `coTableWt${uniqueSuffix}`;
        const chartHeight = "500px";

        if (deadRats.length > 0) {
            let survTable = `<table><tr><th>ID</th><th>사망일</th><th>시점</th></tr>`;
            deadRats.forEach(r => { const pod = r.surgeryDate && r.deathDate ? Math.floor((new Date(r.deathDate) - new Date(r.surgeryDate)) / (1000 * 60 * 60 * 24)) : '?'; const displayCod = r.cod || extractLegacyCod(r.codFull) || '미기록'; survTable += `<tr><td>${r.ratId}</td><td>${r.deathDate || '-'}</td><td>POD ${pod}<br><span style="font-size:0.8em; color:gray">${displayCod}</span></td></tr>`; });
            survTable += `</table>`;
            finalHtml += `<div class="card" style="border-left:5px solid var(--red)"><h4>⚰️ 사망 분석 (${deadRats.length}) - 생존율 (주령 기준)</h4><div class="chart-area" style="height:250px;"><canvas id="${sChartId}"></canvas></div><button class="data-toggle-btn" onclick="toggleDisplay('${sTableId}')">▼ 상세 데이터</button><div id="${sTableId}" class="data-detail-box">${survTable}</div><div style="display:flex; gap:20px; margin-top:30px; border-top:1px solid #eee; padding-top:20px; flex-wrap:wrap;"><div style="flex:1; min-width:250px; text-align:center;"><h5 style="color:var(--navy); margin-bottom:10px;">사망 원인 (COD) 비율</h5><div style="height:220px;"><canvas id="${codChartId}"></canvas></div></div><div style="flex:1; min-width:250px; text-align:center;"><h5 style="color:var(--navy); margin-bottom:10px;">전체 ARE 비율 (O/X)</h5><div style="height:220px;"><canvas id="${areChartId}"></canvas></div></div></div></div>`;
        }

        const controlPanel = `<div style="display:flex; align-items:center; gap:10px;"><button class="crosshair-toggle-btn" onclick="toggleCrosshair()" style="padding:4px 8px; border:none; border-radius:4px; font-size:0.75rem; cursor:pointer; background:${isCrosshairEnabled ? '#FFD600' : '#ddd'}; color:${isCrosshairEnabled ? '#000' : '#777'}; transition:0.2s; font-weight:bold;">${isCrosshairEnabled ? '🎯 가이드선 ON' : '🎯 가이드선 OFF'}</button><button class="indiv-toggle-btn" onclick="toggleIndividual()" style="padding:4px 8px; border:none; border-radius:4px; font-size:0.75rem; cursor:pointer; background:${isIndividualVisible ? '#00c853' : '#ddd'}; color:${isIndividualVisible ? '#fff' : '#777'}; transition:0.2s; font-weight:bold;">${isIndividualVisible ? '👥 개별점 ON' : '👥 개별점 OFF'}</button><span style="font-size:0.75rem; color:#fff; background:#555; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="Chart.getChart('${bpChartId}').resetZoom(); Chart.getChart('${wtChartId}').resetZoom();">🖱️ 줌 초기화</span></div>`;
        const sortedTicksSbp = Array.from(existTicksSbp).sort((a, b) => a - b);
        let bpTableHeaders = `<th style="width:40px;">Show</th><th>ID</th>` + sortedTicksSbp.map(pod => `<th style="min-width:60px; text-align:center; padding:5px;"><label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;"><input type="checkbox" checked onchange="toggleTimepointVisibility('${bpChartId}', ${pod}, this.checked)" style="transform:scale(1.1); margin-bottom:4px;"><span style="line-height:1;">${podToLabel(pod)}</span></label></th>`).join('');
        let bpTable = `<div style="overflow-x:auto;"><table><tr>${bpTableHeaders}</tr>`;
        const avgSbpRow = sortedTicksSbp.map(pod => avgsSbp[pod] || '-');
        ratIds.forEach(id => { const rInfo = ratInfoMap[id]; const rData = scatterDataSbp.filter(d => d.rid === id); bpTable += `<tr><td style="text-align:center;"><input type="checkbox" checked onchange="toggleRatVisibility('${bpChartId}', '${id}', this.checked)" style="transform:scale(1.2); cursor:pointer;"></td><td>${rInfo.status === '사망' ? '💀' : '🟢'} ${id}</td>`; sortedTicksSbp.forEach(pod => { const match = rData.find(d => Math.abs(d.x - pod) < 0.5); bpTable += `<td>${match ? match.y : '-'}</td>`; }); bpTable += `</tr>`; });
        bpTable += `<tr style="background:#e3f2fd; font-weight:bold;"><td>-</td><td>AVG</td>${avgSbpRow.map(v => `<td>${v}</td>`).join('')}</tr></table></div>`;
        finalHtml += `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h4>🩸 혈압 (SBP)</h4>${controlPanel}</div><div class="chart-area" style="height:${chartHeight}"><canvas id="${bpChartId}"></canvas></div><button class="data-toggle-btn" onclick="toggleDisplay('${bpTableId}')">▼ 상세 데이터</button><div id="${bpTableId}" class="data-detail-box">${bpTable}</div></div>`;

        const sortedTicksWt = Array.from(existTicksWt).sort((a, b) => a - b);
        let wtTableHeaders = `<th style="width:40px;">Show</th><th>ID</th>` + sortedTicksWt.map(pod => `<th style="min-width:60px; text-align:center; padding:5px;"><label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;"><input type="checkbox" checked onchange="toggleTimepointVisibility('${wtChartId}', ${pod}, this.checked)" style="transform:scale(1.1); margin-bottom:4px;"><span style="line-height:1;">${podToLabel(pod)}</span></label></th>`).join('');
        let wtTable = `<div style="overflow-x:auto;"><table><tr>${wtTableHeaders}</tr>`;
        const avgWtRow = sortedTicksWt.map(pod => avgsWt[pod] || '-');
        ratIds.forEach(id => { const rInfo = ratInfoMap[id]; const rData = scatterDataWt.filter(d => d.rid === id); wtTable += `<tr><td style="text-align:center;"><input type="checkbox" checked onchange="toggleRatVisibility('${wtChartId}', '${id}', this.checked)" style="transform:scale(1.2); cursor:pointer;"></td><td>${rInfo.status === '사망' ? '💀' : '🟢'} ${id}</td>`; sortedTicksWt.forEach(pod => { const match = rData.find(d => Math.abs(d.x - pod) < 0.5); wtTable += `<td>${match ? match.y : '-'}</td>`; }); wtTable += `</tr>`; });
        wtTable += `<tr style="background:#e8f5e9; font-weight:bold;"><td>-</td><td>AVG</td>${avgWtRow.map(v => `<td>${v}</td>`).join('')}</tr></table></div>`;
        finalHtml += `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h4>⚖️ 체중 (Weight)</h4>${controlPanel}</div><div class="chart-area" style="height:${chartHeight}"><canvas id="${wtChartId}"></canvas></div><button class="data-toggle-btn" onclick="toggleDisplay('${wtTableId}')">▼ 상세 데이터</button><div id="${wtTableId}" class="data-detail-box">${wtTable}</div></div>`;

        resDiv.innerHTML = finalHtml;

        if (deadRats.length > 0) {
            let minAge = 999, maxAge = 0; const deathByAge = {};
            ratDataList.forEach(r => {
                const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6; let endAge = arrAge;
                if(r.status === '사망' && r.deathDate && r.arrivalDate) { endAge = arrAge + ((new Date(r.deathDate) - new Date(r.arrivalDate)) / (1000*60*60*24*7)); const w = Math.floor(endAge); deathByAge[w] = (deathByAge[w] || 0) + 1; }
                else if (r.arrivalDate) { endAge = arrAge + ((new Date() - new Date(r.arrivalDate)) / (1000*60*60*24*7)); }
                if(endAge < minAge) minAge = Math.floor(endAge); if(endAge > maxAge) maxAge = Math.ceil(endAge);
            });
            if(minAge === 999) minAge = 6;
            const survLabels = [], survData = []; let currentAlive = ratDataList.length;
            for (let w = minAge; w <= maxAge; w++) { survLabels.push(`${w}주령`); if (deathByAge[w]) currentAlive -= deathByAge[w]; survData.push((currentAlive / ratDataList.length) * 100); }
            new Chart(document.getElementById(sChartId), { type: 'line', data: { labels: survLabels, datasets: [{ label: 'Survival Rate (%)', data: survData, borderColor: '#333', backgroundColor: 'rgba(0,0,0,0.1)', fill: true, stepper: true }] }, options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } } });

            const codCounts = {}; deadRats.forEach(r => { const cod = r.cod || extractLegacyCod(r.codFull) || 'Unknown'; codCounts[cod] = (codCounts[cod] || 0) + 1; });
            const areCountsObj = { 'O':0, 'X':0, '미기록':0 }; ratDataList.forEach(r => { const areMain = r.are ? r.are.split(' ')[0] : '미기록'; if(['O','X'].includes(areMain)) areCountsObj[areMain]++; else areCountsObj['미기록']++; });
            const dOpt = { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a,b)=>a+b,0); return `${ctx.label}: ${ctx.raw} (${((ctx.raw/total)*100).toFixed(1)}%)`; } } } } };
            const codBgColors = Object.keys(codCounts).map(k => typeof codColors !== 'undefined' && codColors[k] ? codColors[k] : '#C9CBCF');
            new Chart(document.getElementById(codChartId), { type: 'doughnut', data: { labels: Object.keys(codCounts), datasets: [{ data: Object.values(codCounts), backgroundColor: codBgColors }] }, options: dOpt });
            new Chart(document.getElementById(areChartId), { type: 'doughnut', data: { labels: Object.keys(areCountsObj), datasets: [{ data: Object.values(areCountsObj), backgroundColor: ['#1565C0', '#4CAF50', '#9E9E9E'] }] }, options: dOpt });
        }

        const getStandardPodsInRange = (minX, maxX) => { const pods = []; ["Arrival", "D00", "D0", "D2"].forEach(k => { const v = globalPodMap[k]; if (v >= minX && v <= maxX) pods.push(v); }); for (let i = 1; i <= 12; i++) { const k = `W${i}`; const v = globalPodMap[k]; if (v >= minX && v <= maxX) pods.push(v); } pods.sort((a, b) => a - b); return Array.from(new Set(pods)); };
        const buildLinearTicks = (minX, maxX, step) => { const ticks = []; const start = Math.ceil(minX); const end = Math.floor(maxX); for (let v = start; v <= end; v += step) ticks.push(v); return ticks; };
        const createChartOptions = (minX, maxX, minY, maxY) => ({ maintainAspectRatio: false, layout: { padding: { right: 10, bottom: 28 } }, scales: { x: { type: 'linear', min: minX, max: maxX, afterBuildTicks: (scale) => { const range = scale.max - scale.min; if (range > 70) { scale.ticks = getStandardPodsInRange(scale.min, scale.max).map(v => ({ value: v })); return; } const ticks = buildLinearTicks(scale.min, scale.max, range > 30 ? 2 : 1); getStandardPodsInRange(scale.min, scale.max).forEach(v => ticks.push(v)); ticks.sort((a, b) => a - b); scale.ticks = Array.from(new Set(ticks)).map(v => ({ value: v })); }, ticks: { minRotation: 90, maxRotation: 90, autoSkip: false, callback: function (value) { return podToLabel(value); } }, grid: { color: (ctx) => tickLabelMap[ctx.tick.value] ? '#ddd' : '#f5f5f5' } }, y: { min: minY, max: maxY, ticks: { maxTicksLimit: 16 } } }, plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }, pan: { enabled: true, mode: 'xy', threshold: 10 }, limits: { x: { min: arrivalPod, max: maxX + 50 }, y: { min: 0, max: maxY + 200 } } }, tooltip: { enabled: true, callbacks: { title: (items) => { if (!items || !items.length) return ''; const it = items[0]; const pod = Math.round(it.parsed.x); if (it.dataset && it.dataset.label === 'Average') return podToLabel(pod); return (it.raw && it.raw.label) ? it.raw.label : podToLabel(pod); } } } } });

        const wtOpts = createChartOptions(rangeWtX.min, rangeWtX.max, rangeWtY.min, rangeWtY.max);
        const wtChart = new Chart(document.getElementById(wtChartId), { type: 'scatter', data: { datasets: [{ type: 'line', label: 'Average', data: avgLineWt, borderColor: '#00c853', borderWidth: 2, tension: 0.1, pointRadius: 3 }, { type: 'scatter', label: 'Individual', data: scatterDataWt, backgroundColor: 'rgba(0, 200, 83, 0.3)', pointRadius: 3, hidden: !isIndividualVisible }] }, options: wtOpts, plugins: [syncCrosshairPlugin] });
        document.getElementById(wtChartId).ondblclick = () => wtChart.resetZoom();

        const bpOpts = createChartOptions(rangeSbpX.min, rangeSbpX.max, rangeSbpY.min, rangeSbpY.max);
        const bpChart = new Chart(document.getElementById(bpChartId), { type: 'scatter', data: { datasets: [{ type: 'line', label: 'Average', data: avgLineSbp, borderColor: '#d32f2f', borderWidth: 2, tension: 0.1 }, { type: 'scatter', label: 'Individual', data: scatterDataSbp, backgroundColor: 'rgba(211, 47, 47, 0.3)', pointRadius: 3, hidden: !isIndividualVisible }] }, options: bpOpts, plugins: [syncCrosshairPlugin] });
        document.getElementById(bpChartId).ondblclick = () => bpChart.resetZoom();

        wtChart._syncType = 'wt'; bpChart._syncType = 'sbp'; wtChart._syncScope = 'trend'; bpChart._syncScope = 'trend';
        syncChartsWt = syncChartsWt.filter(c => c && !c._destroyed); syncChartsSbp = syncChartsSbp.filter(c => c && !c._destroyed);
        if (!syncChartsWt.includes(wtChart)) syncChartsWt.push(wtChart);
        if (!syncChartsSbp.includes(bpChart)) syncChartsSbp.push(bpChart);
        let __zoomSyncLock = false;
        function syncZoomPeers(source, peers) { if (__zoomSyncLock) return; __zoomSyncLock = true; const sx = source.scales.x; const sy = source.scales.y; peers.forEach(t => { if (!t || t === source || t._destroyed) return; if (t._syncType !== source._syncType) return; if (t._syncScope !== source._syncScope) return; t.options.scales.x.min = sx.min; t.options.scales.x.max = sx.max; t.options.scales.y.min = sy.min; t.options.scales.y.max = sy.max; t.update('none'); }); __zoomSyncLock = false; }
        wtChart.options.plugins.zoom.zoom.onZoomComplete = ({ chart }) => syncZoomPeers(chart, syncChartsWt); wtChart.options.plugins.zoom.pan.onPanComplete   = ({ chart }) => syncZoomPeers(chart, syncChartsWt);
        bpChart.options.plugins.zoom.zoom.onZoomComplete = ({ chart }) => syncZoomPeers(chart, syncChartsSbp); bpChart.options.plugins.zoom.pan.onPanComplete   = ({ chart }) => syncZoomPeers(chart, syncChartsSbp);
        wtChart.update('none'); bpChart.update('none');

    } catch (e) { console.error(e); resDiv.innerHTML = headerHtml + `<p style="color:red">오류 발생: ${e.message}</p>`; }
}


// [2] 그룹 비교 로딩 함수 (전역변수 초기화 추가)
async function loadGroupComparison() {
    // 1. 전역 변수 초기화
    compScatterCharts = {};
    compScatterDataCache = {};
    compFilterState = {};

    const getSelected = (id) => Array.from(document.querySelectorAll(`#${id} input:checked`)).map(cb => cb.value);
    const grpA = getSelected('grp-list-a');
    const grpB = getSelected('grp-list-b');
    const grpC = getSelected('grp-list-c');

    const activeGroups = [];
    if(grpA.length > 0) activeGroups.push({ name: 'Group A', cohorts: grpA });
    if(grpB.length > 0) activeGroups.push({ name: 'Group B', cohorts: grpB });
    if(grpC.length > 0) activeGroups.push({ name: 'Group C', cohorts: grpC });

    if(activeGroups.length < 2) return alert("비교를 위해 최소 2개 그룹에 코호트를 선택해주세요.");

    const container = document.getElementById('comp-res-area');
    container.innerHTML = '<div class="loader"></div> 그룹 데이터 범위 계산 중...';

    let globalLabels = [];
    let globalMaxSbp = 0;
    let globalMaxWt = 0;
    let globalMaxPod = 0;
    
    let allRatIds = [];
    let allRatsObj = [];
    let surgeryMap = {};

    try {
        const allCohorts = [];
        activeGroups.forEach(g => allCohorts.push(...g.cohorts));
        const uniqueCohorts = [...new Set(allCohorts)];

        const ratPromises = uniqueCohorts.map(c => db.collection("rats").where("cohort", "==", c).get());
        const ratSnaps = await Promise.all(ratPromises);
        

        ratSnaps.forEach(snap => {
            snap.forEach(d => {
                const r = d.data();
                allRatsObj.push(r);
                allRatIds.push(r.ratId);
                if(r.surgeryDate) surgeryMap[r.ratId] = r.surgeryDate;
                if(r.surgeryDate && r.deathDate) {
                    const pod = Math.floor((new Date(r.deathDate) - new Date(r.surgeryDate))/(1000*60*60*24));
                    if(pod > globalMaxPod) globalMaxPod = pod;
                }
            });
        });

        const measPromises = allRatIds.map(rid => db.collection("measurements").where("ratId", "==", rid).get());
        const measSnaps = await Promise.all(measPromises);

        const stdPodMap = globalPodMap;
        const tempColumns = [];
        const labelSet = new Set();
        const showAll = document.getElementById('grp-show-all-tp')?.checked;

        measSnaps.forEach((snap, idx) => {
            const rid = allRatIds[idx];
            const surgDate = surgeryMap[rid];
            snap.forEach(doc => {
                const d = doc.data();
                if(d.sbp && d.sbp > globalMaxSbp) globalMaxSbp = d.sbp;
                if(d.weight && d.weight > globalMaxWt) globalMaxWt = d.weight;
                
                if (d.timepoint && stdPodMap.hasOwnProperty(d.timepoint)) {
                    if (!labelSet.has(d.timepoint)) {
                        labelSet.add(d.timepoint);
                        tempColumns.push({ label: d.timepoint, sortVal: stdPodMap[d.timepoint] });
                    }
                } else if (showAll && d.date && surgDate) {
                    if (!labelSet.has(d.date)) {
                        const diff = new Date(d.date) - new Date(surgDate);
                        const pod = Math.floor(diff / (1000 * 60 * 60 * 24));
                        labelSet.add(d.date);
                        tempColumns.push({ label: d.date, sortVal: pod });
                    }
                }
            });
        });

        tempColumns.sort((a,b) => a.sortVal - b.sortVal);
        globalLabels = tempColumns.map(c => c.label);

    } catch(e) { console.error("Group Scale Calc Error", e); }

    container.innerHTML = ''; 

    const grpColors = ['#E6194B', '#3CB44B', '#4363D8'];
    const groupsData = activeGroups.map((g, i) => ({
        name: g.name + ' (' + g.cohorts.join(',') + ')',
        color: grpColors[i % grpColors.length],
        rats: allRatsObj.filter(r => g.cohorts.includes(r.cohort))
    }));
    renderUnifiedTimeline(groupsData, container);

    for(let i=0; i<activeGroups.length; i++) {
        const g = activeGroups[i];
        const colDiv = document.createElement('div');
        colDiv.className = 'comp-col';
        colDiv.id = `comp-res-grp-${i}`;
        colDiv.innerHTML = `<div class="loader"></div>`;
        container.appendChild(colDiv);
        
        const title = `${g.name} : Cohort ${g.cohorts.join(', ')}`;
        await runCohortAnalysis(g.cohorts, `comp-res-grp-${i}`, `_grp_${i}`, {
            labels: globalLabels,
            maxSbp: globalMaxSbp,
            maxWt: globalMaxWt,
            maxPod: globalMaxPod
        }, title);
    }
}

// [오류 완전 해결] 선택된 COD나 ARE가 실제 랫드의 데이터에 정확히 들어맞는지 판단합니다.
async function analyzeTrend() {
    const checkboxes = document.querySelectorAll('#trend-cohort-list .co-checkbox:checked');
    if (checkboxes.length === 0) return alert("분석할 코호트를 하나 이상 선택하세요.");
    const selectedCohorts = Array.from(checkboxes).map(cb => cb.value);

    const mode = document.querySelector('input[name="trend-crit"]:checked').value;
    let criteriaVal = 0, criteriaTp = '', selectedCods = [];

    if (mode === 'weight') {
        criteriaTp = document.getElementById('trend-wt-tp').value;
        const val = document.getElementById('trend-wt-val').value;
        if (!val) return alert("체중 기준값(g)을 입력하세요.");
        criteriaVal = Number(val);
    } else if (mode === 'pod') {
        const val = document.getElementById('trend-pod-val').value;
        if (!val) return alert("POD 기준값(일)을 입력하세요.");
        criteriaVal = Number(val);
    } else if (mode === 'cod') {
        const codChks = document.querySelectorAll('.trend-cod-chk:checked');
        if(codChks.length === 0) return alert("하나 이상의 조건을 선택해주세요.");
        selectedCods = Array.from(codChks).map(c => c.value);
    }

    const container = document.getElementById('trend-res-area');
    container.innerHTML = '<div class="loader"></div> 데이터 분석 중...';

    trendScatterCharts = { low: null, high: null };
    trendScatterDataCache = { low: [], high: [] };
    trendTimepointsCache = [];
    trendFilterState = { low: 'All', high: 'All' }; 

    try {
        const ratPromises = selectedCohorts.map(c => db.collection("rats").where("cohort", "==", c).get());
        const ratSnaps = await Promise.all(ratPromises);
        let allRats = [], allRatIds = []; const surgeryMap = {};

        ratSnaps.forEach(snap => {
            snap.forEach(d => {
                const r = d.data();
                allRats.push(r); allRatIds.push(r.ratId);
                if(r.surgeryDate) surgeryMap[r.ratId] = r.surgeryDate;
            });
        });

        if (allRats.length === 0) { container.innerHTML = "해당 코호트에 데이터가 없습니다."; return; }

        const measPromises = allRatIds.map(rid => db.collection("measurements").where("ratId", "==", rid).get());
        const measSnaps = await Promise.all(measPromises);

        let globalMaxSbp = 0, globalMaxWt = 0, globalMaxPod = 0;
        const stdPodMap = globalPodMap, tempColumns = [], labelSet = new Set();
        const showAll = document.getElementById('trend-show-all')?.checked;
        const measMap = {}; 

        measSnaps.forEach((snap, idx) => {
            const rid = allRatIds[idx];
            const surgDate = surgeryMap[rid];
            if(!measMap[rid]) measMap[rid] = {};

            snap.forEach(doc => {
                const d = doc.data();
                if(d.timepoint) measMap[rid][d.timepoint] = d.weight;
                measMap[rid][d.date] = d.weight; 

                if(d.sbp && d.sbp > globalMaxSbp) globalMaxSbp = d.sbp;
                if(d.weight && d.weight > globalMaxWt) globalMaxWt = d.weight;
                if(surgDate && d.date) {
                        const p = Math.floor((new Date(d.date) - new Date(surgDate))/(1000*60*60*24));
                        if(p > globalMaxPod) globalMaxPod = p;
                }

                if (d.timepoint && stdPodMap.hasOwnProperty(d.timepoint)) {
                    if (!labelSet.has(d.timepoint)) { labelSet.add(d.timepoint); tempColumns.push({ label: d.timepoint, sortVal: stdPodMap[d.timepoint] }); }
                } else if (showAll && d.date && surgDate) {
                    if (!labelSet.has(d.date)) {
                        const pod = Math.floor((new Date(d.date) - new Date(surgDate)) / (1000 * 60 * 60 * 24));
                        labelSet.add(d.date); tempColumns.push({ label: d.date, sortVal: pod });
                    }
                }
            });
        });

        tempColumns.sort((a,b) => a.sortVal - b.sortVal);
        const globalLabels = tempColumns.map(c => c.label);
        trendTimepointsCache = globalLabels;

        let groupTarget = [], groupControl = [];
        
        if (mode === 'cod') {
            allRats.forEach(r => {
                const myCod = r.cod || extractLegacyCod(r.codFull);
                const myAre = r.are ? `ARE: ${r.are.split(' ')[0]}` : '';

                // 선택된 키워드 중 COD와 ARE 중 하나라도 정확히 일치하면 포함
                const hasCause = selectedCods.some(key => {
                    if(key.startsWith('ARE:')) return myAre === key;
                    return myCod === key;
                });
                
                if (hasCause) groupTarget.push(r);
                else groupControl.push(r);
            });
        } else if (mode === 'pod') {
            allRats.forEach(r => {
                if (r.surgeryDate) {
                    const endDate = r.deathDate ? new Date(r.deathDate) : new Date();
                    const pod = Math.floor((endDate - new Date(r.surgeryDate)) / (1000 * 60 * 60 * 24));
                    if (pod < criteriaVal) groupTarget.push(r);
                    else groupControl.push(r);
                }
            });
        } else { 
            allRats.forEach(r => {
                let w = measMap[r.ratId]?.[criteriaTp];
                if (w !== undefined) {
                    if (w < criteriaVal) groupTarget.push(r);
                    else groupControl.push(r);
                }
            });
        }

        container.innerHTML = '';
        const splitBox = document.createElement('div');
        splitBox.className = 'trend-container';
        container.appendChild(splitBox);

        const divA = document.createElement('div'); divA.className = 'trend-half'; divA.id = 'trend-res-low'; splitBox.appendChild(divA);
        const divB = document.createElement('div'); divB.className = 'trend-half'; divB.id = 'trend-res-high'; splitBox.appendChild(divB);

        const fixedOptions = { labels: globalLabels, maxSbp: globalMaxSbp, maxWt: globalMaxWt, maxPod: globalMaxPod, mode: mode };

        let titleA = '', titleB = '';
        if(mode === 'cod') {
            const keysStr = selectedCods.length > 3 ? `${selectedCods.slice(0,3).join(', ')}...` : selectedCods.join(', ');
            titleA = `Condition: [${keysStr}] (n=${groupTarget.length})`;
            titleB = `Control: 미포함 (n=${groupControl.length})`;
        } else {
            const critText = mode === 'weight' ? `${criteriaTp} 체중` : `POD`;
            titleA = `${critText} < ${criteriaVal} (n=${groupTarget.length})`;
            titleB = `${critText} ≥ ${criteriaVal} (n=${groupControl.length})`;
        }

        const titleAFull = `${titleA} (n=${groupTarget.length})`;
        const titleBFull = `${titleB} (n=${groupControl.length})`;

        // 👇 신규 추가: 조건 분석에도 비교군 통합 타임라인 렌더링 👇
        const groupsData = [
            { name: titleA, color: '#E6194B', rats: groupTarget }, // Group A (조건 부합)
            { name: titleB, color: '#3CB44B', rats: groupControl } // Group B (대조군)
        ];
        renderUnifiedTimeline(groupsData, container);
        // 👆 여기까지 👆

        await runRatListAnalysis(groupTarget, 'trend-res-low', '_tr_low', titleA, fixedOptions, 'low');
        await runRatListAnalysis(groupControl, 'trend-res-high', '_tr_high', titleB, fixedOptions, 'high');

    } catch (e) { console.error(e); container.innerHTML = `<p style="color:red">분석 중 오류 발생: ${e.message}</p>`; }
}

// [공통] 필터 적용 로직 (개체 숨김 + 시점 숨김 동시 적용)
function applyChartFilters(chart) {
    chart.data.datasets.forEach(ds => {
        // 원본 데이터 캐싱 (최초 1회)
        if (!ds._originalData) {
            ds._originalData = [...ds.data];
        }

        ds.data = ds._originalData.filter(d => {
            // 1. 개체(Rat ID) 필터 확인 (Individual 점에만 해당)
            if (d.rid && chart._hiddenRats && chart._hiddenRats.has(d.rid)) {
                return false;
            }

            // 2. 시점(Timepoint) 필터 확인 (Average 선, Individual 점 모두 해당)
            // Scatter는 jitter가 있으므로 반올림하여 POD 비교
            const p = Math.round(d.x);
            if (chart._hiddenTimepoints && chart._hiddenTimepoints.has(p)) {
                return false;
            }

            return true;
        });
    });

    chart.update('none'); // 애니메이션 없이 즉시 반영
}



// [신규] 차트 데이터 표시/숨김 토글 함수 (테이블 체크박스 연동)
function toggleRatVisibility(chartId, ratId, isChecked) {
    const chart = Chart.getChart(chartId);
    if (!chart) return;

    // 숨겨진 랫드 목록 관리
    if (!chart._hiddenRats) chart._hiddenRats = new Set();
    
    if (isChecked) {
        chart._hiddenRats.delete(ratId);
    } else {
        chart._hiddenRats.add(ratId);
    }

    applyChartFilters(chart);
}

function toggleTimepointVisibility(chartId, pod, isChecked) {
    const chart = Chart.getChart(chartId);
    if (!chart) return;

    // 숨겨진 시점 목록 관리
    if (!chart._hiddenTimepoints) chart._hiddenTimepoints = new Set();

    if (isChecked) {
        chart._hiddenTimepoints.delete(pod);
    } else {
        chart._hiddenTimepoints.add(pod);
    }

    applyChartFilters(chart);
}

function updateCompScatter(filterTp, uniqueSuffix) {
// 1. 현재 차트의 필터 상태 업데이트
compFilterState[uniqueSuffix] = filterTp;

// 2. 버튼 스타일 업데이트 (수정된 부분)
// 기존: document.querySelectorAll('.comp-filter-btn-' + uniqueSuffix) -> 점(.) 오류 발생 가능
// 변경: id가 'btn-comp-SUFFIX-'로 시작하는 모든 요소를 찾음 -> 안전함
const btns = document.querySelectorAll(`[id^="btn-comp-${uniqueSuffix}-"]`);

btns.forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-white');
    b.style.border = '1px solid #ccc';
});

const activeBtn = document.getElementById(`btn-comp-${uniqueSuffix}-${filterTp}`);
if(activeBtn) {
    activeBtn.classList.remove('btn-white');
    activeBtn.classList.add('btn-blue');
    activeBtn.style.border = 'none';
}

// 3. 데이터 통합 및 스케일 계산 (기존 로직 동일)

Object.keys(compScatterDataCache).forEach(key => {
    const cache = compScatterDataCache[key];
    const currentFilter = compFilterState[key] || 'All'; 
    const filtered = (currentFilter === 'All') ? cache : cache.filter(pt => pt.tp === currentFilter);
    combinedData = combinedData.concat(filtered);
});


if (combinedData.length > 0) {
    combinedData.forEach(p => { 
        if (p.y > maxW) maxW = p.y; 
        if (p.y < minW) minW = p.y; 
    });
} else { maxW = 500; minW = 0; }

const yMax = Math.ceil((maxW + 10) / 5) * 5; 
const yMin = Math.max(0, Math.floor((minW - 10) / 5) * 5);

// 4. 차트 업데이트 (기존 로직 동일)
Object.keys(compScatterCharts).forEach(key => {
    const chart = compScatterCharts[key];
    const cache = compScatterDataCache[key];
    const currentFilter = compFilterState[key] || 'All';

    if(!chart || !cache) return;

    const filteredData = (currentFilter === 'All') ? cache : cache.filter(pt => pt.tp === currentFilter);
    chart.data.datasets[0].data = filteredData;

    const labels = chart.customLabels || [];
    if (currentFilter === 'All') {
            chart.data.datasets[1].data = [];
            chart.options.scales.x.min = -0.5;
            chart.options.scales.x.max = labels.length - 0.5;
    } else {
            if(filteredData.length > 0) {
                const sum = filteredData.reduce((acc, cur) => acc + cur.y, 0);
                const avg = sum / filteredData.length;
                const idx = labels.indexOf(currentFilter);
                const minX = idx - 0.5;
                const maxX = idx + 0.5;
                
                chart.data.datasets[1].data = [{ x: minX, y: avg }, { x: maxX, y: avg }];
                chart.options.scales.x.min = minX;
                chart.options.scales.x.max = maxX;
            } else {
                chart.data.datasets[1].data = [];
            }
    }

    chart.options.scales.y.max = yMax;
    chart.options.scales.y.min = yMin;
    chart.options.scales.y.ticks.stepSize = 5; 

    chart.update();
});
}


// [수정] 개별 필터 업데이트 및 축 동기화
function updateTrendScatter(filterTp, groupKey) {
    // 1. 해당 그룹의 필터 상태 업데이트
    trendFilterState[groupKey] = filterTp;

    // 2. 해당 그룹의 버튼 스타일만 업데이트
    const btns = document.querySelectorAll(`.trend-filter-btn-${groupKey}`);
    btns.forEach(b => {
        b.classList.remove('btn-blue');
        b.classList.add('btn-white');
        b.style.border = '1px solid #ccc';
    });
    const activeBtn = document.getElementById(`btn-trend-${groupKey}-${filterTp}`);
    if(activeBtn) {
        activeBtn.classList.remove('btn-white');
        activeBtn.classList.add('btn-blue');
        activeBtn.style.border = 'none';
    }

    // 3. 축 통일을 위해 Low와 High 양쪽의 현재 표시 데이터(필터 적용됨)를 모두 가져와서 Min/Max 계산
    let combinedData = [];
    
    ['low', 'high'].forEach(key => {
        const currentFilter = trendFilterState[key];
        const cache = trendScatterDataCache[key];
        if(cache) {
            const filtered = (currentFilter === 'All') ? cache : cache.filter(pt => pt.tp === currentFilter);
            combinedData = combinedData.concat(filtered);
        }
    });

    // 통합 Y축 범위 계산
    let maxW = 0;
    let minW = 9999;
    if (combinedData.length > 0) {
        combinedData.forEach(p => { 
            if (p.y > maxW) maxW = p.y; 
            if (p.y < minW) minW = p.y; 
        });
    } else { maxW = 500; minW = 0; }

    const yMax = maxW + 10;
    const yMin = Math.max(0, minW - 10);

    // 4. Low/High 차트 각각 업데이트 (각자의 필터 상태에 맞춰 데이터 갱신하되, 축은 위에서 계산한 값으로 통일)
    ['low', 'high'].forEach(key => {
        const chart = trendScatterCharts[key];
        const cache = trendScatterDataCache[key];
        const currentFilter = trendFilterState[key];
        
        if(!chart || !cache) return;

        const filteredData = (currentFilter === 'All') ? cache : cache.filter(pt => pt.tp === currentFilter);
        
        // 데이터 업데이트
        chart.data.datasets[0].data = filteredData;

        // 평균선 (가로 직선)
        if (currentFilter === 'All') {
            chart.data.datasets[1].data = [];
            chart.options.scales.x.min = -0.5;
            chart.options.scales.x.max = trendTimepointsCache.length - 0.5;
        } else {
            if (filteredData.length > 0) {
                const sum = filteredData.reduce((acc, cur) => acc + cur.y, 0);
                const avg = sum / filteredData.length;
                const idx = trendTimepointsCache.indexOf(currentFilter);
                const minX = idx - 0.5;
                const maxX = idx + 0.5;
                chart.data.datasets[1].data = [{ x: minX, y: avg }, { x: maxX, y: avg }];
                chart.options.scales.x.min = minX;
                chart.options.scales.x.max = maxX;
            } else {
                chart.data.datasets[1].data = [];
            }
        }

        // Y축 업데이트 (동기화된 값 적용 + 5단위)
        chart.options.scales.y.max = yMax;
        chart.options.scales.y.min = yMin;
        chart.options.scales.y.ticks.stepSize = 5; // 5단위 보장

        chart.update();
    });
}

function updateAreBarMulti(suffix) {
    const wrap = document.getElementById(`are-data-wrap-${suffix}`);
    if (!wrap) return;
    
    const totalN = Number(wrap.dataset.total);
    const validN = Number(wrap.dataset.valid);
    const chks = wrap.querySelectorAll('input[type="checkbox"]:checked');
    
    let targetCount = 0;
    chks.forEach(chk => {
        if(chk.value === 'micro') targetCount += Number(wrap.dataset.micro);
        if(chk.value === 'macro') targetCount += Number(wrap.dataset.macro);
        if(chk.value === '미확인') targetCount += Number(wrap.dataset.unk);
    });

    const rateTotal = totalN > 0 ? ((targetCount / totalN) * 100).toFixed(1) : 0;
    const rateValid = validN > 0 ? ((targetCount / validN) * 100).toFixed(1) : 0;

    document.getElementById(`are-text-total-${suffix}`).innerText = `${targetCount} / ${totalN} (${rateTotal}%)`;
    document.getElementById(`are-bar-total-${suffix}`).style.width = `${rateTotal}%`;
    document.getElementById(`are-text-valid-${suffix}`).innerText = `${targetCount} / ${validN} (${rateValid}%)`;
    document.getElementById(`are-bar-valid-${suffix}`).style.width = `${rateValid}%`;
}

function renderSankeyChart(ctxId, deadRats, colorsMap) {
    const ctx = document.getElementById(ctxId);
    if (!ctx) return;

    const flows = {}; 

    deadRats.forEach(r => {
        const cod = r.cod || extractLegacyCod(r.codFull) || "Unknown";
        const areFull = r.are || "Unknown";
        let areMain = areFull.split(' ')[0]; // 'O', 'X', '미확인' (괄호 제거용)

        // 1차 연결: All Dead -> COD (사망원인)
        flows[`Dead|${cod}`] = (flows[`Dead|${cod}`] || 0) + 1;
        
        // 2차 연결: COD -> ARE 여부
        // Surgical Failure 나 Sacrifice 는 보통 ARE와 무관하므로 제외합니다.
        if(cod !== "Surgical Failure" && cod !== "Sacrifice" && cod !== "Unknown") {
                flows[`${cod}|ARE: ${areMain}`] = (flows[`${cod}|ARE: ${areMain}`] || 0) + 1;
        }
    });

    const sankeyData = Object.keys(flows).map(key => {
        const [from, to] = key.split('|');
        return { from, to, flow: flows[key] };
    });

    const getNodeColor = (node) => {
        if (colorsMap && colorsMap[node]) return colorsMap[node];
        if (node.includes("ARE: O")) return "#d32f2f";
        if (node.includes("ARE: X")) return "#1565C0";
        return '#bdbdbd';
    };

    if (window._sankeyCharts && window._sankeyCharts[ctxId]) {
        try { window._sankeyCharts[ctxId].destroy(); } catch(e) {}
    }
    if (!window._sankeyCharts) window._sankeyCharts = {};

    window._sankeyCharts[ctxId] = new Chart(ctx, {
        type: 'sankey',
        data: {
            datasets: [{
                data: sankeyData,
                colorFrom: (c) => getNodeColor(c.dataset.data[c.dataIndex].from),
                colorTo: (c) => getNodeColor(c.dataset.data[c.dataIndex].to),
                borderWidth: 0,
                labels: sankeyData.reduce((acc, cur) => { acc[cur.from] = cur.from; acc[cur.to] = cur.to; return acc; }, {})
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderBpChart() {
    if (bpChartInstance) bpChartInstance.destroy();
    const showSbp = document.getElementById('chk-sbp').checked;
    const showWt = document.getElementById('chk-wt').checked;
    const ctx = document.getElementById('bpChart');
    const datasets = [];
    if (showSbp) { datasets.push({ label: 'SBP', data: globalBpData.map(d => d.sbp), borderColor: '#d32f2f', yAxisID: 'y', spanGaps: true }); }
    if (showWt) { datasets.push({ label: 'WT', data: globalBpData.map(d => d.wt), borderColor: '#00c853', yAxisID: 'y1', spanGaps: true }); }

    bpChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: globalBpData.map(d => (d.label && d.label !== d.date) ? `${d.date} (${d.label})` : d.date), datasets: datasets },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { position: 'left', display: showSbp }, y1: { position: 'right', display: showWt, grid: { drawOnChartArea: false } } } }
    });
}

async function renderGroupSelectors() {
    // [변경] 캐시된 데이터 사용
    const ratsData = await getRatsWithCache();
    
    const cohorts = new Set();
    ratsData.forEach(d => cohorts.add(d.cohort));
    const sorted = Array.from(cohorts).sort((a,b)=>Number(b)-Number(a));
    
    const createList = (id) => {
        const con = document.getElementById(id);
        con.innerHTML = '';
        sorted.forEach(c => {
            const div = document.createElement('div');
            div.innerHTML = `<label style="cursor:pointer; display:block; padding:2px 0;"><input type="checkbox" value="${c}" style="width:auto; margin-right:5px;"> Cohort ${c}</label>`;
            con.appendChild(div);
        });
    };
    createList('grp-list-a');
    createList('grp-list-b');
    createList('grp-list-c');
}

// ... [Existing renderCohortCheckboxes, initDetailSelectors, updateRatList ...]
async function renderCohortCheckboxes(containerId) {
    // [변경] 매번 DB를 읽지 않고 캐시 함수를 통해 데이터 가져옴
    const ratsData = await getRatsWithCache();
    
    const cohorts = new Set();
    // [변경] 스냅샷(forEach)이 아니라 배열(forEach)을 순회
    ratsData.forEach(d => cohorts.add(d.cohort));
    
    const sorted = Array.from(cohorts).sort((a,b)=>Number(b)-Number(a));
    
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if(sorted.length === 0) {
        container.innerHTML = '데이터 없음';
    } else {
        sorted.forEach(c => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `<label style="cursor:pointer; font-weight:bold; color:var(--navy); display:flex; align-items:center;"><input type="checkbox" class="co-checkbox" value="${c}" style="width:auto; margin-right:8px; transform:scale(1.2);">Cohort ${c}</label>`;
            container.appendChild(wrapper);
        });
    }
}


async function loadCohortComparison() {
    // 1. 전역 변수 초기화
    compScatterCharts = {};
    compScatterDataCache = {};
    compFilterState = {};
    
    // [추가] 동기화 차트 목록 초기화
    syncChartsSbp = [];
    syncChartsWt = [];
    activeCrosshairValSbp = null;
    activeCrosshairValWt = null;

    const checkboxes = document.querySelectorAll('#comp-check-list .co-checkbox:checked');
    const selectedCohorts = Array.from(checkboxes).map(cb => cb.value);

    if(selectedCohorts.length < 2) return alert("비교할 코호트를 2개 이상 선택해주세요.");

    const container = document.getElementById('comp-res-area');
    container.innerHTML = '<div class="loader"></div> 데이터 범위 계산 중...';

    try {
        const ratPromises = selectedCohorts.map(c => db.collection("rats").where("cohort", "==", c).get());
        const ratSnaps = await Promise.all(ratPromises);
        
        let allRats = [];
        ratSnaps.forEach(snap => snap.forEach(d => allRats.push(d.data())));

        const measPromises = allRats.map(r => db.collection("measurements").where("ratId", "==", r.ratId).get());
        const measSnaps = await Promise.all(measPromises);

        let globalMinX = 0, globalMaxX = 0, globalMaxSbp = 0, globalMaxWt = 0;
        const unionStandardTicks = new Set(); 

        measSnaps.forEach((snap, i) => {
            const r = allRats[i];
            snap.forEach(d => {
                const v = d.data();
                const pod = getPodForLabel(v.timepoint, r.surgeryDate, v.date);
                
                if (pod !== null) {
                    if (pod < globalMinX) globalMinX = pod;
                    if (pod > globalMaxX) globalMaxX = pod;
                }
                if (v.sbp && v.sbp > globalMaxSbp) globalMaxSbp = v.sbp;
                if (v.weight && v.weight > globalMaxWt) globalMaxWt = v.weight;

                if (v.timepoint && globalPodMap.hasOwnProperty(v.timepoint)) {
                    unionStandardTicks.add(v.timepoint);
                }
            });
        });

        const fixedOptions = {
            minX: globalMinX - 2,
            maxX: globalMaxX + 2,
            maxSbp: globalMaxSbp,
            maxWt: globalMaxWt,
            standardTicks: Array.from(unionStandardTicks)
        };

        container.innerHTML = ''; 
        const colors = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#46F0F0'];
        const groupsData = selectedCohorts.map((c, i) => ({
            name: 'Cohort ' + c,
            color: colors[i % colors.length],
            rats: allRats.filter(r => r.cohort === c)
        }));
        renderUnifiedTimeline(groupsData, container);
        for(let i=0; i<selectedCohorts.length; i++) {
            const c = selectedCohorts[i];
            const divId = `comp-res-${c}`;
            const colDiv = document.createElement('div');
            colDiv.className = 'comp-col';
            colDiv.id = divId;
            container.appendChild(colDiv);
            
            await runCohortAnalysis([c], divId, `_comp_${c}`, fixedOptions, `Cohort ${c}`);
        }

    } catch(e) { 
        console.error("Comparison Error", e); 
        container.innerHTML = `<p style="color:red">오류: ${e.message}</p>`;
    }
}


function toggleTrendInputs() {
    const mode = document.querySelector('input[name="trend-crit"]:checked').value;
    
    // Weight Inputs
    const isWt = (mode === 'weight');
    document.getElementById('trend-wt-tp').disabled = !isWt;
    document.getElementById('trend-wt-val').disabled = !isWt;
    
    // POD Inputs
    document.getElementById('trend-pod-val').disabled = (mode !== 'pod');

    // COD Area
    const codArea = document.getElementById('trend-cod-area');
    if(mode === 'cod') {
        codArea.style.display = 'block';
    } else {
        codArea.style.display = 'none';
    }
}


async function loadTrendCodList() {
    const checkboxes = document.querySelectorAll('#trend-cohort-list .co-checkbox:checked');
    if (checkboxes.length === 0) return alert("분석할 코호트를 먼저 선택해주세요.");
    const selectedCohorts = Array.from(checkboxes).map(cb => cb.value);

    const container = document.getElementById('trend-cod-list');
    container.innerHTML = '<div class="loader"></div> 데이터 분석 중...';

    try {
        const promises = selectedCohorts.map(c => db.collection("rats").where("cohort", "==", c).get());
        const snaps = await Promise.all(promises);
        
        const codSet = new Set();
        const areSet = new Set();

        snaps.forEach(snap => {
            snap.forEach(doc => {
                const r = doc.data();
                if(r.status === '사망') {
                    const c = r.cod || extractLegacyCod(r.codFull);
                    const a = r.are ? `ARE: ${r.are.split(' ')[0]}` : null;
                    if(c && c !== "Unknown") codSet.add(c);
                    if(a && a !== "ARE: 미확인") areSet.add(a);
                }
            });
        });

        container.innerHTML = '';
        if(codSet.size === 0 && areSet.size === 0) {
            container.innerHTML = '<span style="padding:10px; color:#999;">기록된 사망 원인이 없습니다.</span>';
            return;
        }

        const createSection = (title, set, color) => {
            if(set.size === 0) return;
            const wrap = document.createElement('div');
            wrap.style.marginBottom = "10px"; wrap.style.padding = "5px"; wrap.style.borderBottom = "1px dashed #eee";
            wrap.innerHTML = `<div><span style="font-size:0.8rem; font-weight:bold; color:${color}; margin-right:5px;">● ${title}</span></div>`;

            const box = document.createElement('div');
            box.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;';

            Array.from(set).sort().forEach(val => {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; align-items:center; font-size:0.85rem; cursor:pointer; background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #ddd;';
                label.innerHTML = `<input type="checkbox" class="trend-cod-chk" value="${val}" style="margin-right:4px;"> ${val}`;
                box.appendChild(label);
            });
            wrap.appendChild(box);
            container.appendChild(wrap);
        };

        createSection("사망 원인 (COD)", codSet, "var(--navy)");
        createSection("ARE 발생 여부", areSet, "var(--red)");

    } catch(e) {
        console.error(e);
        container.innerHTML = '<span style="color:red">데이터 로드 실패</span>';
    }
}

// 👇 [최종 기능] 그룹 통합 타임라인 (주령 6~30 고정 & 차선 분리 정렬 방식) 👇
function renderUnifiedTimeline(groupsData, container) {
    const existing = document.getElementById('unified-timeline-wrapper');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'unified-timeline-wrapper';
    wrapper.style.width = '98%';
    wrapper.style.gridColumn = '1 / -1'; 
    wrapper.style.flex = '0 0 100%';     
    wrapper.style.marginBottom = '25px';
    wrapper.style.background = '#fff';
    wrapper.style.border = '2px solid #1a237e';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '15px';
    wrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
    
    const canvasId = 'unified-timeline-' + Date.now();
    
    wrapper.innerHTML = `
        <h4 style="margin:0 0 5px 0; color:var(--navy); text-align:center;">⏳ 비교군 통합 이벤트 타임라인</h4>
        <div style="text-align:center; font-size:0.85rem; color:#666; margin-bottom:10px; background:#f8f9fa; padding:5px; border-radius:4px;">
            <b>도형 의미:</b> 🔵 MR 촬영 &nbsp;|&nbsp; 🟩 Histology 샘플 &nbsp;|&nbsp; 🔺 Cast 샘플 <br>
            <span style="font-size:0.75rem;">(차선 분리: 같은 세로선상에 위치한 도형들은 완벽히 같은 주령에 진행된 이벤트입니다)</span>
        </div>
        <div style="position:relative; height:150px; width:100%;">
            <canvas id="${canvasId}"></canvas>
        </div>
    `;
    
    container.parentNode.insertBefore(wrapper, container);

    const datasets = [];
    let minAge = 999;
    let maxAge = 0;

    // Y축에 띄워줄 그룹 이름 목록
    const groupNames = groupsData.map(g => g.name);

    groupsData.forEach((g, groupIndex) => {
        const dataPoints = [];
        // 맨 위부터 Group A가 나오도록 Y축 높이(차선) 계산
        const laneY = groupNames.length - 1 - groupIndex; 

        g.rats.forEach(r => {
            const arrAge = r.arrivalAge ? Number(r.arrivalAge) : 6;
            const arrDate = r.arrivalDate ? new Date(r.arrivalDate) : null;
            if(!arrDate) return;

            // 1. MR 촬영 시점 (무작위 흩뿌리기 제거 -> 정확한 Y축(차선)에 고정)
            if(r.mrDates && r.mrDates.length > 0) {
                r.mrDates.forEach(mr => {
                    if(mr.date && mr.timepoint !== 'Death') {
                        const age = arrAge + (new Date(mr.date) - arrDate) / (1000*60*60*24*7);
                        dataPoints.push({ x: age, y: laneY, rId: r.ratId, event: 'MR ('+mr.timepoint+')', type: 'MR' });
                        if(age < minAge) minAge = age; if(age > maxAge) maxAge = age;
                    }
                });
            }

            // 2. 샘플 채취 시점
            if(r.sampleDate && r.sampleType && r.sampleType !== 'Fail') {
                const age = arrAge + (new Date(r.sampleDate) - arrDate) / (1000*60*60*24*7);
                dataPoints.push({ x: age, y: laneY, rId: r.ratId, event: 'Sample ('+r.sampleType+')', type: r.sampleType });
                if(age < minAge) minAge = age; if(age > maxAge) maxAge = age;
            }
        });

        datasets.push({
            label: g.name,
            data: dataPoints,
            // 투명도를 60(헥사코드) 정도 주어서 여러 점이 겹치면 색이 진해지도록 설정
            backgroundColor: g.color + '90', 
            borderColor: g.color,
            pointStyle: (ctx) => {
                const type = ctx.raw?.type;
                if(type === 'MR') return 'circle';
                if(type === 'Histology') return 'rect';
                if(type === 'Cast') return 'triangle';
                return 'cross';
            },
            pointRadius: 8,         // 점 크기 키움
            pointHoverRadius: 12,   // 올렸을 때 더 커지게
            borderWidth: 1
        });
    });

    // 가로축 동적 범위 설정 (최소 6, 최대 30 유지하되 넘어가면 확장)
    const finalMinX = Math.min(6, Math.floor(minAge));
    const finalMaxX = Math.max(30, Math.ceil(maxAge));

    setTimeout(() => {
        new Chart(document.getElementById(canvasId), {
            type: 'scatter',
            data: { datasets: datasets },
            options: {
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        min: -0.5, 
                        max: groupsData.length - 0.5,
                        ticks: {
                            stepSize: 1,
                            // 숫자가 아닌 그룹 이름을 Y축 라벨로 출력
                            callback: function(value) { return groupNames[groupNames.length - 1 - value] || ''; },
                            font: { weight: 'bold', size: 12 },
                            color: '#1a237e'
                        },
                        // 세로 정렬을 돋보이게 하기 위해 Y축(가로선) 그리드는 숨김
                        grid: { display: false, drawBorder: false } 
                    },
                    x: { 
                        title: { display: true, text: 'Age (Weeks / 주령)', color: '#333', font: { weight: 'bold', size: 14 } },
                        min: finalMinX,
                        max: finalMaxX,
                        // 같은 주령(세로선)을 확인하기 쉽게 세로 그리드 선을 선명하게 그림
                        grid: { color: '#e0e0e0', tickLength: 10 }, 
                        ticks: { stepSize: 1, font: { size: 12 } } // 1주 단위로 눈금 표시
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const d = ctx.raw;
                                return ` [${d.rId}] ${d.event} : ${d.x.toFixed(1)}주령`;
                            }
                        }
                    },
                    legend: { display: false } // Y축에 이미 그룹 이름이 있으므로 상단 범례는 숨김
                }
            }
        });
    }, 50);
}

// 👇 [신규 추가] Sham 대조군 가상 기준일 자동 계산 및 저장 👇
window.saveSurgAndSham = async function(docId, arrDateStr, arrAgeNum) {
    const isSham = document.getElementById('chk-sham').checked;
    let updateData = { isNonInduction: isSham };
    
    if (isSham) {
        const refAge = Number(document.getElementById('sham-ref-age').value) || 9;
        updateData.refAge = refAge;
        
        if (arrDateStr) {
            // 가상 수술일 계산: 반입일 + (기준주령 - 반입주령)*7 일
            const arrDate = new Date(arrDateStr);
            const diffDays = (refAge - arrAgeNum) * 7;
            arrDate.setDate(arrDate.getDate() + diffDays);
            const virtualDateStr = arrDate.toISOString().split('T')[0];
            updateData.surgeryDate = virtualDateStr; // 차트를 속이기 위한 가상 날짜 (그래프 동기화용)
        } else {
            alert("가상 기준일을 계산하려면 반입일(Arrival Date)이 먼저 입력되어 있어야 합니다.");
            return;
        }
    } else {
        updateData.surgeryDate = document.getElementById('surg-d').value;
        updateData.refAge = firebase.firestore.FieldValue.delete();
    }
    
    try {
        await db.collection("rats").doc(docId).update(updateData);
        alert("저장되었습니다.");
        clearRatsCache();
        loadDetailData();
    } catch(e) {
        console.error(e);
        alert("저장 실패: " + e.message);
    }
};
