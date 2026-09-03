// ============================================================
//  데이터 수정 - 랫드 / 케이지
//  ID를 외워서 타이핑하는 대신 코호트를 고르면 목록이 뜨고, 눌러서 고친다.
// ============================================================

let deRats = [];
let deCageRows = [];
let deCageId = null;

// 손으로 켜고 끌 수 있는 플래그 (케이지별 입력의 체크박스와 같은 목록).
// 재실변동·사망발생은 저장 시 자동 판정된 기록이라 여기서는 건드리지 않고 보존한다.
const DE_FLAGS = ['이상', '처치일', '수술일', 'BP일'];

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
    <div style="font-size:0.82rem; color:var(--ink-soft); margin:10px 0 6px;">${rats.length}마리 · 눌러서 수정</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:6px;">
        ${rats.map(r => `
        <button onclick="searchForEdit('${r.ratId}')"
            style="padding:9px 6px; border-radius:2px; cursor:pointer; font-size:0.85rem; text-align:center;
                   border:1px solid ${r.status === '사망' ? 'var(--stock-pink)' : 'var(--approve)'};
                   background:${r.status === '사망' ? 'var(--stock-pink-soft)' : 'var(--stock-green-soft)'};">
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
    <div style="font-size:0.82rem; color:var(--ink-soft); margin:10px 0 6px;">케이지 ${keys.length}개 · 눌러서 기록 보기</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:6px;">
        ${keys.map(c => `
        <button onclick="deLoadCageRecords('${c}','${cohort}')"
            style="padding:9px 6px; border-radius:2px; cursor:pointer; font-size:0.85rem; border:1px solid var(--ink-blue); background:var(--stock-blue-soft);">
            <b>${c}번</b><br><span style="font-size:0.75rem; color:var(--ink-soft);">${byCage[c]}건</span>
        </button>`).join('')}
    </div>` : '<div style="color:var(--ink-soft); padding:10px;">이 코호트의 급여 기록이 없습니다.</div>';
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
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">
            값을 고치면 그 구간의 섭취량이 다시 계산됩니다. 뒤 구간 계산에도 영향을 주니 확인 후 저장하세요.<br>
            플래그도 여기서 고칠 수 있습니다 — 「이상」을 켜면 그 구간은 섭취량 기준·조제 계산에서 빠집니다 (잰 값 자체는 그대로).
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead><tr style="background:var(--paper);">
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
        <td style="padding:6px; text-align:center; color:var(--ink-soft);">
            ${typeof r.waterConsumed === 'number' ? r.waterConsumed.toFixed(0) : '-'} /
            ${typeof r.foodConsumed === 'number' ? r.foodConsumed.toFixed(0) : '-'}
            ${typeof r.waterPerCapita === 'number' ? `<br><span style="font-size:0.72rem; color:var(--ink-soft);">마리당 ${r.waterPerCapita.toFixed(0)}</span>` : ''}
        </td>
        <td style="padding:6px; font-size:0.75rem; white-space:nowrap;">
            ${DE_FLAGS.map(f => `
            <label style="display:inline-flex; align-items:center; gap:3px; margin-right:7px; cursor:pointer;
                          color:${f === '이상' ? 'var(--red)' : '#555'};">
                <input type="checkbox" id="de-fl-${i}-${f}" ${(r.flags || []).includes(f) ? 'checked' : ''}
                       style="width:auto; margin:0;">${f}</label>`).join('')}
            ${(r.flags || []).filter(f => !DE_FLAGS.includes(f)).length
                ? `<span style="color:var(--red);">${(r.flags || []).filter(f => !DE_FLAGS.includes(f)).join(', ')}</span>` : ''}
        </td>
        <td style="padding:6px; white-space:nowrap;">
            <button class="btn-small btn-blue" onclick="deSaveRow(${i})" style="padding:3px 9px;">저장</button>
            <button class="btn-small btn-red" onclick="deDeleteRow(${i})" style="padding:3px 9px;">삭제</button>
        </td>
    </tr>`;
}

// 한 구간(row)의 파생값을 '직전 기록(prev)' 기준으로 전부 다시 계산해 저장한다.
// 케이지별 입력과 같은 식: 섭취 = prev.채움 − row.잔량 − 로스,
// 로스 = 증발×시간 + 탈착×횟수, 마리·일 = 재실 겹침 합.
// keepHandlings: 구간이 안 바뀌는 단순 수정이면 손으로 넣었던 탈착 횟수를 유지한다.
// 물통을 뗀 횟수 = 그 구간에 체중을 잰 날 수 (+ 이 기록의 방문 1회).
// 체중이 있다는 건 그날 케이지를 열었다는 뜻이고, 주말처럼 아무도 안 간 날은 기록이 없다.
// 케이지별 입력의 ciCountHandlings와 같은 규칙이되, 여기서는 지난 기록을 소급 계산하므로
// 그날의 체중이 이미 저장돼 있다 — 그래서 시작일만 빼고 끝일까지 센다.
async function deCountHandlings(cageId, prevMs, rowMs) {
    if (!(prevMs > 0) || !(rowMs > prevMs)) return 1;
    const ymd = ms => {
        const d = new Date(ms);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };
    const ds = ymd(prevMs), de = ymd(rowMs);

    try {
        const hs = await db.collection('ratHousing').where('cageId', '==', String(cageId)).get();
        const ids = new Set();
        hs.forEach(d => {
            const h = d.data();
            const from = h.from && h.from.toMillis ? h.from.toMillis() : 0;
            const to = h.to && h.to.toMillis ? h.to.toMillis() : rowMs;
            if (Math.min(rowMs, to) > Math.max(prevMs, from)) ids.add(h.ratId);
        });
        if (!ids.size) return 1;

        const snap = await db.collection('measurements')
            .where('date', '>', ds).where('date', '<=', de).get();
        const days = new Set();
        snap.forEach(d => {
            const v = d.data();
            if (v.weight && ids.has(v.ratId)) days.add(String(v.date).slice(0, 10));
        });
        return Math.max(1, days.size);
    } catch (e) {
        console.error('탈착 횟수 추정 실패, 1회로 잡음', e);
        return 1;
    }
}

async function deRecomputeRow(row, prev, keepHandlings) {
    const payload = {};
    const rowAt = row.at && row.at.toMillis ? row.at.toMillis() : null;
    const prevAt = prev && prev.at && prev.at.toMillis ? prev.at.toMillis() : null;

    let hours = (rowAt && prevAt) ? (rowAt - prevAt) / 3600000
              : (typeof row.intervalHours === 'number' ? row.intervalHours : null);

    if (hours !== null && hours > 0) {
        // 경과일수로 세면 아무도 안 가는 토·일까지 세어 금→월 구간이 3회가 된다.
        // 케이지별 입력과 같은 기준으로 '체중을 잰 날'을 센다.
        const hnd = (keepHandlings && Number(row.handlings))
            ? Number(row.handlings)
            : await deCountHandlings(row.cageId, prevAt, rowAt);
        const loss = ((row.evapPerHour || 0) * hours
                    + (row.lossPerHandling || 0) * hnd) * (prev.bottleCount || 1);

        // 마리·일: 이 케이지의 재실 기록과 구간의 겹침 (구간 도중 사망·이동 반영)
        let animalDays = row.animalDays || null;
        if (rowAt && prevAt) {
            const hs = await db.collection('ratHousing').where('cageId', '==', String(row.cageId)).get();
            let animalHours = 0;
            hs.forEach(d => {
                const h = d.data();
                const from = h.from && h.from.toMillis ? h.from.toMillis() : 0;
                const to = h.to && h.to.toMillis ? h.to.toMillis() : rowAt;
                const ov = Math.min(rowAt, to) - Math.max(prevAt, from);
                if (ov > 0) animalHours += ov / 3600000;
            });
            animalDays = animalHours / 24;
        }

        payload.intervalHours = Number(hours.toFixed(2));
        payload.handlings = hnd;
        payload.lossTotal = Number(loss.toFixed(2));
        payload.animalDays = animalDays === null ? null : Number(animalDays.toFixed(3));

        if (typeof prev.waterGiven === 'number' && typeof row.waterRemaining === 'number') {
            const wc = prev.waterGiven - row.waterRemaining - loss;
            payload.waterConsumed = Number(wc.toFixed(1));
            payload.waterPerCapita = (animalDays > 0) ? Number((wc / animalDays).toFixed(1)) : null;
        }
        if (typeof prev.foodGiven === 'number' && typeof row.foodRemaining === 'number') {
            const fc = prev.foodGiven - row.foodRemaining;
            payload.foodConsumed = Number(fc.toFixed(1));
            payload.foodPerCapita = (animalDays > 0) ? Number((fc / animalDays).toFixed(1)) : null;
        }
    }

    if (Object.keys(payload).length) {
        await db.collection('cageFeeding').doc(row._id).set(payload, { merge: true });
        Object.assign(row, payload);
    }
    return payload;
}

// 고친 값으로 그 구간을 다시 계산하고, 이 행의 '채움'을 기준으로 삼는
// 다음(뒤) 구간까지 같이 다시 계산한다 — 안 하면 뒤 구간에 낡은 값이 남는다.
async function deSaveRow(i) {
    const r = deCageRows[i];
    const g = id => { const el = document.getElementById(id); return el && el.value !== '' ? Number(el.value) : null; };
    const wr = g(`de-wr-${i}`), wg = g(`de-wg-${i}`), fr = g(`de-fr-${i}`), fg = g(`de-fg-${i}`);

    // 체크박스의 수동 플래그 + 원래 있던 자동 플래그(재실변동 등)를 합쳐 저장한다
    const flags = DE_FLAGS.filter(f => {
        const el = document.getElementById(`de-fl-${i}-${f}`);
        return el && el.checked;
    }).concat((r.flags || []).filter(f => !DE_FLAGS.includes(f)));

    const base = {
        waterRemaining: wr, waterGiven: wg, foodRemaining: fr, foodGiven: fg,
        flags: flags,
        editedAt: firebase.firestore.FieldValue.serverTimestamp(),
        editedBy: (firebase.auth().currentUser && firebase.auth().currentUser.email) || null
    };

    try {
        await db.collection('cageFeeding').doc(r._id).set(base, { merge: true });
        Object.assign(r, { waterRemaining: wr, waterGiven: wg, foodRemaining: fr, foodGiven: fg, flags: flags });

        const prev = deCageRows[i + 1];               // 배열은 최신순 → i+1이 시간상 이전
        if (prev) await deRecomputeRow(r, prev, true);

        const later = deCageRows[i - 1];              // 시간상 다음 구간
        if (later) {
            await deRecomputeRow(later, r, true);
            const el = document.getElementById(`de-row-${i - 1}`);
            if (el) el.outerHTML = deRowHtml(later, i - 1);
        }

        document.getElementById(`de-row-${i}`).outerHTML = deRowHtml(r, i);
        if (typeof cfgToast === 'function') cfgToast(later ? '저장 · 뒤 구간도 다시 계산됨' : '저장되었습니다');
    } catch (e) { console.error(e); alert('저장 실패: ' + e.message); }
}

async function deDeleteRow(i) {
    const r = deCageRows[i];
    if (!confirm(`${r.dateStr} 기록을 삭제할까요?\n이 구간이 사라지면 앞뒤 구간이 하나로 이어져 다시 계산됩니다.`)) return;
    try {
        const later = deCageRows[i - 1];              // 시간상 다음 구간
        const newPrev = deCageRows[i + 1];            // 시간상 이전 구간
        await db.collection('cageFeeding').doc(r._id).delete();
        deCageRows.splice(i, 1);

        // 다음 구간이 삭제된 행을 기준으로 계산돼 있었다면, 새 이전 행 기준으로 잇는다.
        // (구간 시간·마리일·로스가 전부 달라지므로 탈착 횟수도 새로 추정)
        if (later && newPrev) await deRecomputeRow(later, newPrev, false);

        const cohort = document.getElementById('de-cage-cohort').value;
        await deLoadCageRecords(deCageId, cohort);
        if (typeof cfgToast === 'function') cfgToast(later && newPrev ? '삭제 · 다음 구간 다시 계산됨' : '삭제되었습니다');
    } catch (e) { console.error(e); alert('삭제 실패: ' + e.message); }
}
