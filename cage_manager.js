// ============================================================
//  케이지 현황 (Cage Status)
//  - 케이지에 어떤 쥐가 들어있는지 그림으로 보고, 끌어서 옮김
//  - 옮긴 '시각'이 남아야 마리당 섭취량(animal_days)이 정확해짐
//  - 컬렉션: cages (문서ID = 케이지 번호), ratHousing (재실 이력)
//
//  케이지 번호는 '박스'가 아니라 '자리'를 뜻한다.
//  청소하며 새 박스로 갈아도 번호는 그대로이므로 기록할 것이 없다.
// ============================================================

let cgCages = [];        // [{id, number, room, maxRats, active, cohort, group}]
let cgHousing = [];      // 현재 재실중(to == null)인 기록 — 코호트 구분 없이 전부
let cgAllRats = [];      // 전체 쥐 (케이지 안 개체를 찾기 위해)
let cgRats = [];         // 배정 패널에서 고른 코호트의 쥐
let cgCohort = null;     // 배정할 코호트 (화면 전체를 거르지는 않음)
let cgConfigs = {};      // 코호트별 설정 (군 색상)
let cgPickedRat = null;  // 폰에서 끌기 대신 '탭해서 옮기기'용

// ---------- 진입점 ----------
// 케이지 현황은 '우리 랩 케이지의 물리적 현황'이므로 코호트와 무관하게 전부 보여준다.
// 코호트 선택은 아래 배정 패널에서 '지금 넣을 쥐를 고를 때'만 쓴다.
async function renderCageStatusView(main) {
    main.innerHTML = `
    <div class="card">
        <h3>🏠 케이지 현황</h3>
        <div style="font-size:0.85rem; color:#666; margin-bottom:12px;">
            쥐를 끌어다 놓으면 옮겨집니다. 폰에서는 쥐를 누른 뒤 옮길 케이지를 누르세요.
            <b>옮긴 시각이 자동으로 기록</b>되어 섭취량 계산에 반영됩니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input type="number" id="cg-new-cage" placeholder="케이지 번호"
                   style="width:120px; padding:8px; border-radius:6px; border:1px solid #ccc;">
            <button class="btn-small btn-green" onclick="cgAddCage()">케이지 추가</button>
            <button class="btn-small" onclick="cgAutoCreate()"
                    style="background:#eee; color:#333;">설정대로 일괄 생성</button>
            <button class="btn-small btn-blue" onclick="cgLoadAll()" style="margin-left:auto;">새로고침</button>
        </div>
    </div>
    <div id="cg-body"><div class="card">불러오는 중...</div></div>`;

    await cgLoadAll();
}

// 케이지·재실·쥐를 전부 읽어온다 (코호트로 거르지 않음)
async function cgLoadAll() {
    cgPickedRat = null;
    const body = document.getElementById('cg-body');

    try {
        const [cageSnap, houseSnap, rats, cfgSnap] = await Promise.all([
            db.collection('cages').get(),
            db.collection('ratHousing').where('to', '==', null).get(),
            getRatsWithCache(),
            db.collection('cohortConfigs').get()
        ]);

        cgCages = [];
        cageSnap.forEach(d => cgCages.push(Object.assign({ id: d.id }, d.data())));
        cgCages.sort((a, b) => Number(a.number) - Number(b.number));

        cgHousing = [];
        houseSnap.forEach(d => cgHousing.push(Object.assign({ id: d.id }, d.data())));

        cgAllRats = rats;
        cgConfigs = {};
        cfgSnap.forEach(d => { cgConfigs[d.id] = d.data(); });

        // 배정 패널에서 이미 고른 코호트가 있으면 유지
        cgRats = cgCohort ? rats.filter(r => String(r.cohort) === String(cgCohort)) : [];

        cgRenderBody();
    } catch (e) {
        console.error(e);
        if (body) body.innerHTML = `<div class="card" style="color:red">불러오기 실패: ${e.message}</div>`;
    }
}

// 배정 패널: 넣을 코호트를 고르면 그 코호트의 미배정 개체만 보여준다
function cgPickCohort(val) {
    cgCohort = val || null;
    cgRats = cgCohort ? cgAllRats.filter(r => String(r.cohort) === String(cgCohort)) : [];
    cgPickedRat = null;
    cgRenderBody();
}

// ---------- 조회 헬퍼 ----------
function cgOccupants(cageId) {
    const seen = new Set();
    return cgHousing.filter(h => String(h.cageId) === String(cageId))
        .map(h => cgAllRats.find(r => r.ratId === h.ratId))
        .filter(r => {
            if (!r || seen.has(r.ratId)) return false;   // 중복 재실 기록이 있어도 한 번만
            seen.add(r.ratId); return true;
        });
}
function cgHousingOf(ratId) {
    return cgHousing.find(h => h.ratId === ratId) || null;
}
// 한 쥐에 열린 재실 기록이 둘 이상이면 animal_days가 중복 계산되므로 모두 닫는다
function cgAllOpenHousingOf(ratId) {
    return cgHousing.filter(h => h.ratId === ratId);
}
function cgGroupOf(rat) {
    return rat.group ? ('G' + String(rat.group).replace(/^G/, '')) : 'G1';
}
function cgGroupColor(key, cohort) {
    const cfg = cgConfigs[String(cohort)];
    if (cfg && cfg.groups) {
        const g = cfg.groups.find(x => x.key === key);
        if (g && g.color) return g.color;
    }
    return '#888';
}
function cgMaxRats(cage) {
    if (cage.maxRats) return Number(cage.maxRats);
    const cfg = cgConfigs[String(cage.cohort)] || cgConfigs[String(cgCohort)];
    if (cfg && cfg.housing && cfg.housing.ratsPerCage) return Number(cfg.housing.ratsPerCage);
    return 3;
}

// 빈 물통 무게는 통마다 다르다. 케이지(자리)에 붙여 관리하고,
// 값이 없는 자리만 코호트 기본값으로 넘어간다.
function cgTareFallback() {
    const cfg = cgConfigs[String(cgCohort)] ||
        cgConfigs[Object.keys(cgConfigs).sort((a, b) => Number(b) - Number(a))[0]];
    return Number(cfg && cfg.housing && cfg.housing.bottleTare) || 0;
}

async function cgSetTare(cageId, val) {
    const cage = cgCages.find(c => String(c.id) === String(cageId));
    if (!cage) return;
    const v = (val === '' || val === null) ? null : Number(val);
    if (v !== null && (isNaN(v) || v <= 0)) { alert('빈 물통 무게는 0보다 큰 숫자여야 합니다.'); cgRenderBody(); return; }
    try {
        await db.collection('cages').doc(String(cageId)).set({ bottleTare: v }, { merge: true });
        cage.bottleTare = v;
        cgRenderBody();
    } catch (e) { console.error(e); alert('저장 실패: ' + e.message); }
}
// 살아있는 쥐만 배정 대상 (사망/희생은 재실이 끝난 것으로 본다)
function cgIsAlive(rat) {
    return rat.status !== '사망';
}

// ---------- 렌더 ----------
function cgRenderBody() {
    const box = document.getElementById('cg-body');
    if (!box) return;

    const housedIds = new Set(cgHousing.map(h => h.ratId));
    const occupied = cgCages.filter(c => cgOccupants(c.id).length).length;

    // 케이지에 남아있는데 사망 처리된 개체 (코호트 무관하게 전부 잡는다)
    const deadHoused = cgAllRats.filter(r => !cgIsAlive(r) && housedIds.has(r.ratId));

    // 배정 패널: 고른 코호트의 미배정 생존 개체
    const unassigned = cgRats.filter(r => cgIsAlive(r) && !housedIds.has(r.ratId));
    const cohortNums = Array.from(new Set(cgAllRats
        .filter(r => cgIsAlive(r))
        .map(r => String(r.cohort)).filter(Boolean)))
        .sort((a, b) => Number(b) - Number(a));

    box.innerHTML = `
    ${cgPickedRat ? `
    <div class="card" style="background:#fff8e1; border:1px solid #ffe082;">
        <b style="color:#7a5c00;">${cgPickedRat}</b>
        <span style="color:#7a5c00;">선택됨 — 옮길 케이지를 누르세요.</span>
        <button class="btn-small" onclick="cgPickedRat=null; cgRenderBody();"
                style="background:#fff; margin-left:8px;">취소</button>
    </div>` : ''}

    ${deadHoused.length ? `
    <div class="card" style="background:#ffebee; border:1px solid #ffcdd2;">
        <b style="color:var(--red);">⚠️ 사망 처리됐지만 케이지에 남아있는 개체 ${deadHoused.length}마리</b>
        <div style="font-size:0.85rem; color:#666; margin:6px 0;">
            그대로 두면 마리당 섭취량이 실제보다 낮게 계산됩니다.
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${deadHoused.map(r => `<button class="btn-small btn-red" onclick="cgRemoveRat('${r.ratId}','사망')">${r.ratId} 내보내기</button>`).join('')}
        </div>
    </div>` : ''}

    <div class="card" style="padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
            <h4 style="margin:0; color:var(--navy);">쥐 배정하기</h4>
            <select onchange="cgPickCohort(this.value)"
                    style="width:auto; min-width:150px; padding:7px; border-radius:6px; border:1px solid #ccc;">
                <option value="">코호트 선택...</option>
                ${cohortNums.map(n => `<option value="${n}" ${String(cgCohort) === n ? 'selected' : ''}>코호트 ${n}</option>`).join('')}
            </select>
            ${cgCohort ? `<span style="font-size:0.85rem; color:#666;">미배정 ${unassigned.length}마리</span>` : ''}
        </div>
        <div id="cg-unassigned" ondragover="cgAllowDrop(event)" ondrop="cgDropToUnassigned(event)"
             style="display:flex; flex-wrap:wrap; gap:8px; min-height:52px; padding:10px;
                    background:#f8f9fa; border:1px dashed #bbb; border-radius:8px;">
            ${!cgCohort
                ? '<span style="color:#999; font-size:0.9rem;">넣을 코호트를 고르면 미배정 개체가 여기 나옵니다. (케이지에서 빼려면 이 칸으로 끌어다 놓으세요)</span>'
                : (unassigned.length
                    ? unassigned.map(r => cgRatChip(r, null)).join('')
                    : (cgRats.some(cgIsAlive)
                        ? '<span style="color:#999; font-size:0.9rem;">이 코호트는 모두 배정되었습니다</span>'
                        : '<span style="color:#999; font-size:0.9rem;">이 코호트에 생존 개체가 없습니다</span>'))}
        </div>
    </div>

    ${(() => {
        const noTare = cgCages.filter(c => !(Number(c.bottleTare) > 0));
        if (!noTare.length) return '';
        return `
        <div class="card" style="background:#fff8e1; border:1px solid #ffe082;">
            <b style="color:#7a5c00;">빈 물통 무게가 없는 자리 ${noTare.length}개</b>
            <div style="font-size:0.82rem; color:#7a5c00; margin:6px 0;">
                ${noTare.slice(0, 20).map(c => c.number + '번').join(', ')}${noTare.length > 20 ? ' 외' : ''}
                <br>물통마다 무게가 다르므로 자리마다 실측값을 넣어야 마신 물이 정확해집니다.
                ${cgTareFallback() ? `지금은 코호트 기본값 ${cgTareFallback()}g으로 계산됩니다.` : ''}
            </div>
        </div>`;
    })()}

    <div class="card" style="padding:12px 16px;">
        <b style="color:var(--navy);">케이지 ${cgCages.length}개</b>
        <span style="font-size:0.85rem; color:#666;">
            · 사용중 ${occupied}개 · 비어 있음 ${cgCages.length - occupied}개
            · 재실 ${cgHousing.length}마리
        </span>
        <div style="font-size:0.78rem; color:#888; margin-top:6px;">
            케이지 번호는 <b>자리</b>를 뜻합니다. 빈 물통 무게를 자리에 붙여 관리하므로,
            <b>물통에 자리 번호를 적어두고 세척 후에도 같은 자리에 꽂아야</b> 합니다.
        </div>
    </div>

    ${cgCages.length ? `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:12px;">
        ${cgCages.map(c => cgCageCard(c)).join('')}
    </div>` : `
    <div class="card" style="color:#888;">
        아직 케이지가 없습니다. 위에서 번호를 넣어 추가하거나 <b>설정대로 일괄 생성</b>을 누르세요.
    </div>`}`;
}

function cgRatChip(rat, cageId) {
    const gkey = cgGroupOf(rat);
    const color = cgGroupColor(gkey, rat.cohort);
    const picked = cgPickedRat === rat.ratId;
    const dead = !cgIsAlive(rat);
    return `
    <div draggable="true" ondragstart="cgDragStart(event,'${rat.ratId}')"
         onclick="cgPickRat(event, '${rat.ratId}')"
         title="${rat.ratId} (${gkey})"
         style="display:flex; align-items:center; gap:5px; padding:5px 9px; cursor:pointer;
                background:${picked ? '#fff3cd' : '#fff'}; border:2px solid ${picked ? '#ff9800' : color};
                border-radius:16px; font-size:0.85rem; white-space:nowrap;
                ${dead ? 'opacity:0.55; text-decoration:line-through;' : ''}">
        <span style="width:9px; height:9px; border-radius:50%; background:${color}; display:inline-block;"></span>
        ${rat.ratId}
    </div>`;
}

function cgCageCard(cage) {
    const occ = cgOccupants(cage.id);
    const max = cgMaxRats(cage);
    const full = occ.length >= max;
    const groupKey = cage.group || (occ.length ? cgGroupOf(occ[0]) : null);
    const cohort = cage.cohort || (occ.length ? occ[0].cohort : null);
    const color = groupKey ? cgGroupColor(groupKey, cohort) : '#ccc';
    const cfg = cgConfigs[String(cohort)];
    const gname = groupKey
        ? (((cfg && cfg.groups && (cfg.groups.find(g => g.key === groupKey) || {}).name)) || groupKey)
        : '비어 있음';
    const label = groupKey ? `${cohort ? 'C' + cohort + ' · ' : ''}${gname}` : '비어 있음';
    const tareFb = cgTareFallback();
    const hasTare = Number(cage.bottleTare) > 0;

    return `
    <div ondragover="cgAllowDrop(event)" ondrop="cgDropToCage(event,'${cage.id}')"
         onclick="cgCageClicked('${cage.id}')"
         style="border:1px solid #e0e0e0; border-top:4px solid ${color}; border-radius:10px;
                padding:10px; background:#fff; min-height:120px; cursor:${cgPickedRat ? 'pointer' : 'default'};
                ${cgPickedRat ? 'outline:2px dashed #ff9800; outline-offset:2px;' : ''}">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <b style="font-size:1.05rem; color:var(--navy);">${cage.number}번</b>
            <span style="font-size:0.75rem; color:${full ? 'var(--red)' : '#888'};">
                ${occ.length}/${max}
            </span>
        </div>
        <div style="font-size:0.75rem; color:${groupKey ? color : '#aaa'}; margin-bottom:8px; font-weight:bold;">
            ${label}
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; min-height:40px;">
            ${occ.length ? occ.map(r => cgRatChip(r, cage.id)).join('') : ''}
        </div>

        <div onclick="event.stopPropagation()"
             style="margin-top:9px; padding-top:8px; border-top:1px dashed #e8e8e8;
                    display:flex; align-items:center; gap:5px;">
            <span style="font-size:0.72rem; color:#888; white-space:nowrap;">빈 통</span>
            <input type="number" step="any" inputmode="decimal"
                   value="${cage.bottleTare != null ? cage.bottleTare : ''}"
                   placeholder="${tareFb ? tareFb + ' (기본)' : '미설정'}"
                   onchange="cgSetTare('${cage.id}', this.value)"
                   style="flex:1; min-width:0; height:30px; padding:2px 6px; font-size:0.82rem;
                          border:1px solid ${hasTare ? '#c8e6c9' : '#ffcdd2'}; border-radius:5px;
                          background:${hasTare ? '#fff' : '#fff8f8'};">
            <span style="font-size:0.72rem; color:#888;">g</span>
        </div>
        ${!hasTare ? `<div style="font-size:0.68rem; color:var(--red); margin-top:3px;">
            이 자리의 물통 무게가 없습니다${tareFb ? ` · 지금은 기본 ${tareFb}g으로 계산됩니다` : ''}</div>` : ''}

        ${occ.length === 0 ? `
        <button class="btn-small btn-red" onclick="event.stopPropagation(); cgDeleteCage('${cage.id}')"
                style="margin-top:8px; padding:3px 8px; font-size:0.75rem;">케이지 삭제</button>` : ''}
    </div>`;
}

// ---------- 끌어놓기 / 탭해서 옮기기 ----------
function cgDragStart(ev, ratId) { ev.dataTransfer.setData('text/plain', ratId); }
function cgAllowDrop(ev) { ev.preventDefault(); }

function cgDropToCage(ev, cageId) {
    ev.preventDefault();
    const ratId = ev.dataTransfer.getData('text/plain');
    if (ratId) cgMoveRat(ratId, cageId);
}
function cgDropToUnassigned(ev) {
    ev.preventDefault();
    const ratId = ev.dataTransfer.getData('text/plain');
    if (ratId) cgRemoveRat(ratId, '이동');
}

function cgPickRat(ev, ratId) {
    if (ev) ev.stopPropagation();   // 케이지 카드의 클릭까지 같이 발생하지 않도록
    cgPickedRat = (cgPickedRat === ratId) ? null : ratId;
    cgRenderBody();
}
function cgCageClicked(cageId) {
    if (!cgPickedRat) return;
    const ratId = cgPickedRat;
    cgPickedRat = null;
    cgMoveRat(ratId, cageId);
}

// ---------- 실제 이동 (가드레일 + 시각 기록) ----------
async function cgMoveRat(ratId, cageId) {
    const rat = cgAllRats.find(r => r.ratId === ratId);
    const cage = cgCages.find(c => String(c.id) === String(cageId));
    if (!rat || !cage) return;

    const current = cgHousingOf(ratId);
    if (current && String(current.cageId) === String(cageId)) { cgRenderBody(); return; }

    const occ = cgOccupants(cageId);

    // 가드레일 1: 정원 초과
    if (occ.length >= cgMaxRats(cage)) {
        alert(`${cage.number}번 케이지가 이미 정원(${cgMaxRats(cage)}마리)입니다.`);
        cgRenderBody(); return;
    }

    // 가드레일 2: 다른 군 섞임 방지
    // 메트포민은 물에 타는데 물통은 케이지 공유라, 군이 섞이면 프로토콜 위반이 된다.
    const ratGroup = cgGroupOf(rat);
    const cageGroup = cage.group || (occ.length ? cgGroupOf(occ[0]) : null);
    if (cageGroup && cageGroup !== ratGroup) {
        alert(`군이 다릅니다.\n\n${ratId} = ${ratGroup}\n${cage.number}번 케이지 = ${cageGroup}\n\n` +
              `물통을 공유하므로 서로 다른 군을 같은 케이지에 둘 수 없습니다.`);
        cgRenderBody(); return;
    }

    // 가드레일 3: 다른 코호트 섞임
    if (occ.length && String(occ[0].cohort) !== String(rat.cohort)) {
        if (!confirm(`${cage.number}번에 다른 코호트(${occ[0].cohort}) 개체가 있습니다. 그래도 넣을까요?`)) {
            cgRenderBody(); return;
        }
    }

    try {
        const now = firebase.firestore.Timestamp.now();

        // 이전 재실 종료 → 새 재실 시작 (구간이 시각으로 이어짐)
        // 혹시 열린 기록이 여러 개면 전부 닫는다 (중복 집계 방지)
        const opens = cgAllOpenHousingOf(ratId);
        if (opens.length) {
            const fromCages = new Set(opens.map(h => String(h.cageId)));
            for (const h of opens) {
                await db.collection('ratHousing').doc(h.id).update({ to: now, endReason: '이동' });
            }
            cgHousing = cgHousing.filter(h => h.ratId !== ratId);
            for (const cid of fromCages) await cgClearCageIfEmpty(cid);
        }
        const ref = await db.collection('ratHousing').add({
            ratId: ratId, cageId: String(cageId), cohort: String(rat.cohort),
            group: ratGroup, from: now, to: null,
            startReason: current ? '이동' : '입실',
            by: (firebase.auth().currentUser && firebase.auth().currentUser.email) || null
        });
        cgHousing.push({ id: ref.id, ratId, cageId: String(cageId), cohort: String(rat.cohort), group: ratGroup, from: now, to: null });

        // 케이지가 비어 있었다면 군을 물려받음
        if (!cage.group) {
            await db.collection('cages').doc(String(cageId)).set(
                { group: ratGroup, cohort: String(rat.cohort) }, { merge: true });
            cage.group = ratGroup; cage.cohort = String(rat.cohort);
        }
        cgRenderBody();
    } catch (e) {
        console.error(e);
        alert('이동 실패: ' + e.message);
    }
}

// 케이지가 비면 군 배정을 풀어 다른 군이 들어올 수 있게 한다.
// (안 풀면 빈 케이지가 예전 군에 묶여 다음 배정이 잘못 차단됨)
async function cgClearCageIfEmpty(cageId) {
    if (cgOccupants(cageId).length) return;
    await db.collection('cages').doc(String(cageId)).set({ group: null, cohort: null }, { merge: true });
    const cage = cgCages.find(c => String(c.id) === String(cageId));
    if (cage) { cage.group = null; cage.cohort = null; }
}

async function cgRemoveRat(ratId, reason) {
    const opens = cgAllOpenHousingOf(ratId);
    if (!opens.length) { cgRenderBody(); return; }
    try {
        const now = firebase.firestore.Timestamp.now();
        const fromCages = new Set(opens.map(h => String(h.cageId)));
        for (const h of opens) {
            await db.collection('ratHousing').doc(h.id).update({ to: now, endReason: reason || '내보냄' });
        }
        cgHousing = cgHousing.filter(h => h.ratId !== ratId);
        for (const cid of fromCages) await cgClearCageIfEmpty(cid);
        cgRenderBody();
    } catch (e) {
        console.error(e);
        alert('내보내기 실패: ' + e.message);
    }
}

// ---------- 케이지 추가 / 삭제 ----------
async function cgAddCage() {
    const val = (document.getElementById('cg-new-cage').value || '').trim();
    if (!val) return alert('케이지 번호를 입력하세요.');
    if (cgCages.some(c => String(c.number) === val)) return alert(`${val}번 케이지가 이미 있습니다.`);

    try {
        const cfg = cgConfigs[String(cgCohort)] || Object.values(cgConfigs)[0];
        const maxRats = (cfg && cfg.housing && cfg.housing.ratsPerCage) || 3;
        await db.collection('cages').doc(val).set({
            number: Number(val), room: 'A', maxRats: maxRats, active: true,
            group: null, cohort: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        cgCages.push({ id: val, number: Number(val), room: 'A', maxRats: maxRats, active: true, group: null, cohort: null });
        cgCages.sort((a, b) => Number(a.number) - Number(b.number));
        document.getElementById('cg-new-cage').value = '';
        cgRenderBody();
    } catch (e) { console.error(e); alert('추가 실패: ' + e.message); }
}

async function cgAutoCreate() {
    // 배정할 코호트를 골랐으면 그 설정, 아니면 가장 최근 코호트 설정을 쓴다
    const cfg = cgConfigs[String(cgCohort)] ||
        cgConfigs[Object.keys(cgConfigs).sort((a, b) => Number(b) - Number(a))[0]];
    if (!cfg || !cfg.housing) return alert('먼저 코호트 설정에서 케이지 수를 정해주세요.');
    const want = Number(cfg.housing.cageCount) || 0;
    const perCage = Number(cfg.housing.ratsPerCage) || 3;
    if (!want) return alert('코호트 설정의 케이지 수가 0입니다.');

    const missing = [];
    for (let i = 1; i <= want; i++) if (!cgCages.some(c => Number(c.number) === i)) missing.push(i);
    if (!missing.length) return alert(`1~${want}번 케이지가 모두 있습니다.`);
    if (!confirm(`${missing.length}개 케이지(${missing.join(', ')})를 만들까요?`)) return;

    try {
        const batch = db.batch();
        missing.forEach(n => {
            batch.set(db.collection('cages').doc(String(n)), {
                number: n, room: 'A', maxRats: perCage, active: true, group: null, cohort: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        missing.forEach(n => cgCages.push({ id: String(n), number: n, room: 'A', maxRats: perCage, active: true, group: null, cohort: null }));
        cgCages.sort((a, b) => Number(a.number) - Number(b.number));
        cgRenderBody();
    } catch (e) { console.error(e); alert('생성 실패: ' + e.message); }
}

async function cgDeleteCage(cageId) {
    if (cgOccupants(cageId).length) return alert('쥐가 들어있는 케이지는 삭제할 수 없습니다.');
    const cage = cgCages.find(c => String(c.id) === String(cageId));
    if (!confirm(`${cage ? cage.number : cageId}번 케이지를 삭제할까요?\n(지난 재실·급여 기록은 그대로 남습니다)`)) return;
    try {
        await db.collection('cages').doc(String(cageId)).delete();
        cgCages = cgCages.filter(c => String(c.id) !== String(cageId));
        cgRenderBody();
    } catch (e) { console.error(e); alert('삭제 실패: ' + e.message); }
}

// 다른 화면에서 쓰는 조회 함수 (케이지별 입력에서 사용 예정)
async function getCageOccupantsAt(cageId) {
    const snap = await db.collection('ratHousing')
        .where('cageId', '==', String(cageId)).where('to', '==', null).get();
    const ids = [];
    snap.forEach(d => ids.push(d.data().ratId));
    return ids;
}
