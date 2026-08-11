// ============================================================
//  데이터 수정 - 랫드 / 케이지
//  ID를 외워서 타이핑하는 대신 코호트를 고르면 목록이 뜨고, 눌러서 고친다.
// ============================================================

let deRats = [];
let deCageRows = [];
let deCageId = null;

// ---------- 공통 ----------
async function deFillCohortSel(selId, onchange) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const rats = await getRatsWithCache();
    const nums = Array.from(new Set(rats.map(r => String(r.cohort)).filter(Boolean)))
        .sort((a, b) => Number(b) - Number(a));
    sel.innerHTML = `<option value="">코호트 선택...</option>` +
        nums.map(n => `<option value="${n}">코호트 ${n}</option>`).join('');
    sel.onchange = () => onchange(sel.value);
}

// ---------- 랫드 수정 ----------
async function deInitRatEdit() {
    await deFillCohortSel('de-rat-cohort', deShowRatList);
}

async function deShowRatList(cohort) {
    const box = document.getElementById('de-rat-list');
    document.getElementById('edit-result').innerHTML = '';
    if (!cohort) { box.innerHTML = ''; return; }

    const rats = (await getRatsWithCache()).filter(r => String(r.cohort) === String(cohort));
    rats.sort((a, b) => String(a.ratId).localeCompare(String(b.ratId)));
    deRats = rats;

    box.innerHTML = `
    <div style="font-size:0.82rem; color:#666; margin:10px 0 6px;">${rats.length}마리 · 눌러서 수정</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:6px;">
        ${rats.map(r => `
        <button onclick="searchForEdit('${r.ratId}')"
            style="padding:9px 6px; border-radius:8px; cursor:pointer; font-size:0.85rem; text-align:center;
                   border:1px solid ${r.status === '사망' ? '#ffcdd2' : '#c8e6c9'};
                   background:${r.status === '사망' ? '#ffebee' : '#f1f8e9'};">
            ${r.status === '사망' ? '💀' : '🟢'} ${r.ratId}
        </button>`).join('')}
    </div>`;
}

// ---------- 케이지 수정 ----------
async function deInitCageEdit() {
    await deFillCohortSel('de-cage-cohort', deShowCageList);
}

async function deShowCageList(cohort) {
    const box = document.getElementById('de-cage-list');
    document.getElementById('de-cage-records').innerHTML = '';
    if (!cohort) { box.innerHTML = ''; return; }

    const snap = await db.collection('cageFeeding').where('cohort', '==', String(cohort)).get();
    const byCage = {};
    snap.forEach(d => {
        const v = d.data();
        byCage[String(v.cageId)] = (byCage[String(v.cageId)] || 0) + 1;
    });
    const keys = Object.keys(byCage).sort((a, b) => Number(a) - Number(b));

    box.innerHTML = keys.length ? `
    <div style="font-size:0.82rem; color:#666; margin:10px 0 6px;">케이지 ${keys.length}개 · 눌러서 기록 보기</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:6px;">
        ${keys.map(c => `
        <button onclick="deLoadCageRecords('${c}','${cohort}')"
            style="padding:9px 6px; border-radius:8px; cursor:pointer; font-size:0.85rem; border:1px solid #bbdefb; background:#e3f2fd;">
            <b>${c}번</b><br><span style="font-size:0.75rem; color:#666;">${byCage[c]}건</span>
        </button>`).join('')}
    </div>` : '<div style="color:#888; padding:10px;">이 코호트의 급여 기록이 없습니다.</div>';
}

async function deLoadCageRecords(cageId, cohort) {
    deCageId = String(cageId);
    const box = document.getElementById('de-cage-records');
    box.innerHTML = '<div class="loader"></div> 불러오는 중...';

    const snap = await db.collection('cageFeeding').where('cohort', '==', String(cohort)).get();
    deCageRows = [];
    snap.forEach(d => {
        const v = d.data();
        if (String(v.cageId) === deCageId) deCageRows.push(Object.assign({ _id: d.id }, v));
    });
    deCageRows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));

    box.innerHTML = `
    <div class="card" style="margin-top:12px;">
        <h4 style="margin-top:0; color:var(--navy);">${cageId}번 케이지 · 급여 기록 ${deCageRows.length}건</h4>
        <div style="font-size:0.8rem; color:#666; margin-bottom:10px;">
            값을 고치면 그 구간의 섭취량이 다시 계산됩니다. 뒤 구간 계산에도 영향을 주니 확인 후 저장하세요.
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead><tr style="background:#f5f5f5;">
                <th style="padding:7px;">날짜</th><th style="padding:7px;">물 잔량</th><th style="padding:7px;">물 채움</th>
                <th style="padding:7px;">사료 잔량</th><th style="padding:7px;">사료 채움</th>
                <th style="padding:7px;">섭취(물/사료)</th><th style="padding:7px;">플래그</th><th style="padding:7px;"></th>
            </tr></thead>
            <tbody>${deCageRows.map((r, i) => deRowHtml(r, i)).join('')}</tbody>
        </table>
        </div>
    </div>`;
}

function deRowHtml(r, i) {
    const num = (v) => (v === null || v === undefined) ? '' : v;
    return `
    <tr id="de-row-${i}" style="border-bottom:1px solid #eee;">
        <td style="padding:6px; white-space:nowrap;">${r.dateStr || '-'}</td>
        <td style="padding:6px;"><input type="number" step="any" id="de-wr-${i}" value="${num(r.waterRemaining)}" style="width:80px; padding:4px;"></td>
        <td style="padding:6px;"><input type="number" step="any" id="de-wg-${i}" value="${num(r.waterGiven)}" style="width:80px; padding:4px;"></td>
        <td style="padding:6px;"><input type="number" step="any" id="de-fr-${i}" value="${num(r.foodRemaining)}" style="width:80px; padding:4px;"></td>
        <td style="padding:6px;"><input type="number" step="any" id="de-fg-${i}" value="${num(r.foodGiven)}" style="width:80px; padding:4px;"></td>
        <td style="padding:6px; text-align:center; color:#555;">
            ${typeof r.waterConsumed === 'number' ? r.waterConsumed.toFixed(0) : '-'} /
            ${typeof r.foodConsumed === 'number' ? r.foodConsumed.toFixed(0) : '-'}
            ${typeof r.waterPerCapita === 'number' ? `<br><span style="font-size:0.72rem; color:#888;">마리당 ${r.waterPerCapita.toFixed(0)}</span>` : ''}
        </td>
        <td style="padding:6px; font-size:0.75rem; color:var(--red);">${(r.flags || []).join(', ') || '-'}</td>
        <td style="padding:6px; white-space:nowrap;">
            <button class="btn-small btn-blue" onclick="deSaveRow(${i})" style="padding:3px 9px;">저장</button>
            <button class="btn-small btn-red" onclick="deDeleteRow(${i})" style="padding:3px 9px;">삭제</button>
        </td>
    </tr>`;
}

// 고친 값으로 그 구간의 섭취량을 다시 계산한다.
// 직전 방문의 '채운 양'에서 이번 '잔량'과 로스를 뺀다 — 입력 화면과 같은 방식.
async function deSaveRow(i) {
    const r = deCageRows[i];
    const g = id => { const el = document.getElementById(id); return el && el.value !== '' ? Number(el.value) : null; };
    const wr = g(`de-wr-${i}`), wg = g(`de-wg-${i}`), fr = g(`de-fr-${i}`), fg = g(`de-fg-${i}`);

    const payload = { waterRemaining: wr, waterGiven: wg, foodRemaining: fr, foodGiven: fg };

    // 시간순으로 바로 앞 기록 (배열은 최신순이라 i+1)
    const prev = deCageRows[i + 1];
    if (prev && typeof r.intervalHours === 'number' && r.animalDays) {
        const loss = ((r.evapPerHour || 0) * r.intervalHours + (r.lossPerHandling || 0)) * (prev.bottleCount || 1);
        if (typeof prev.waterGiven === 'number' && wr !== null) {
            const consumed = prev.waterGiven - wr - loss;
            payload.waterConsumed = Number(consumed.toFixed(1));
            payload.waterPerCapita = Number((consumed / r.animalDays).toFixed(1));
        }
        if (typeof prev.foodGiven === 'number' && fr !== null) {
            const fc = prev.foodGiven - fr;
            payload.foodConsumed = Number(fc.toFixed(1));
            payload.foodPerCapita = Number((fc / r.animalDays).toFixed(1));
        }
    }
    payload.editedAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.editedBy = (firebase.auth().currentUser && firebase.auth().currentUser.email) || null;

    try {
        await db.collection('cageFeeding').doc(r._id).set(payload, { merge: true });
        Object.assign(deCageRows[i], payload);
        document.getElementById(`de-row-${i}`).outerHTML = deRowHtml(deCageRows[i], i);
        if (typeof cfgToast === 'function') cfgToast('저장되었습니다');
    } catch (e) { console.error(e); alert('저장 실패: ' + e.message); }
}

async function deDeleteRow(i) {
    const r = deCageRows[i];
    if (!confirm(`${r.dateStr} 기록을 삭제할까요?\n이 구간이 사라지면 앞뒤 구간이 하나로 이어져 계산됩니다.`)) return;
    try {
        await db.collection('cageFeeding').doc(r._id).delete();
        deCageRows.splice(i, 1);
        const cohort = document.getElementById('de-cage-cohort').value;
        await deLoadCageRecords(deCageId, cohort);
        if (typeof cfgToast === 'function') cfgToast('삭제되었습니다');
    } catch (e) { console.error(e); alert('삭제 실패: ' + e.message); }
}
