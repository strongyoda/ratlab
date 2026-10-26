// ============================================================
//  일괄 입력
//  하루에 MR 12마리, 수술 6마리를 개체마다 들어가서 넣는 대신
//  해당하는 쥐들을 골라 날짜/시점을 한 번에 기록한다.
// ============================================================

let beCohort = null;
let beRats = [];
let beHousing = {};        // ratId -> cageId
let beType = 'ligation';
let bePicked = new Set();
// 배치(반입 차수) 거르기. 전체 선택이 다른 배치까지 결찰일을 써버리던 것을 막는다 (2026-10-26 점검)
let beBatch = '';
let beBatchSize = 12;

// 처치 종류별 색은 새 세계(강조=스탬프 레드 하나)에서 제거 — 선택 상태는 잉크 문법으로 말한다
const BE_TYPES = {
    ligation: { label: '수술 (Ligation)', field: 'surgeryDate' },
    ovx:      { label: 'OVX',             field: 'ovxDate' },
    nacl:     { label: '고염식 시작',       field: 'naclStartDate' },
    bapn:     { label: 'BAPN 시작',        field: 'bapnStartDate' },
    dose:     { label: '투약(물) 시작',     field: 'doseStartDate' },
    mr:       { label: 'MR 촬영',          field: 'mrDates' },
    sacrifice:{ label: '희생 / 샘플 채취',  field: 'sampleDate' }
};

// 기록값이 HTML 속성을 깨뜨리지 않게 한다
const beEsc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderBatchEntryView(main) {
    main.innerHTML = `
    <div class="card">
        <h3 style="margin:0 0 12px 0; border-bottom:3px double var(--ink); padding-bottom:6px;">일괄 입력</h3>
        <div style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:12px;">
            오늘 같은 처치를 받은 개체들을 골라 한 번에 기록합니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label for="be-cohort" style="font-weight:bold; color:var(--ink);">코호트</label>
            <select id="be-cohort" style="width:auto; min-width:130px; padding:8px; border-radius:2px; border:1px solid #C9C5B8;">
                <option value="">로딩 중...</option>
            </select>
        </div>
    </div>
    <div id="be-body"></div>`;

    // 개체 선택 칩은 ID가 속성에 들어가므로 인라인 onclick 대신 위임으로 받는다
    const beBody = document.getElementById('be-body');
    beBody.addEventListener('click', e => {
        const el = e.target.closest('[data-be-pick]');
        if (el) bePick(el.dataset.bePick);
    });

    const sel = document.getElementById('be-cohort');
    const rats = await getRatsWithCache();
    const nums = Array.from(new Set(rats.map(r => String(r.cohort)).filter(Boolean)))
        .sort((a, b) => Number(b) - Number(a));
    sel.innerHTML = `<option value="">코호트 선택...</option>` +
        nums.map(n => `<option value="${n}">코호트 ${n}</option>`).join('');
    sel.onchange = () => beLoad(sel.value);
}

async function beLoad(cohort) {
    if (String(cohort) !== String(beCohort)) beBatch = '';
    beCohort = cohort;
    bePicked = new Set();
    const body = document.getElementById('be-body');
    if (!cohort) { body.innerHTML = ''; return; }
    body.innerHTML = '<div class="card">불러오는 중...</div>';
    try {
        const cf = typeof getCohortConfig === 'function' ? await getCohortConfig(cohort) : null;
        beBatchSize = Number(cf && cf.housing && cf.housing.batchSize) || 12;
    } catch (e) { beBatchSize = 12; }

    const rats = (await getRatsWithCache()).filter(r => String(r.cohort) === String(cohort));
    rats.sort((a, b) => String(a.ratId).localeCompare(String(b.ratId)));
    beRats = rats;

    // 케이지별로 묶어서 보여주면 오늘 처치한 케이지 단위로 고르기 쉽다
    beHousing = {};
    const hs = await db.collection('ratHousing').where('cohort', '==', String(cohort)).get();
    hs.forEach(d => { const v = d.data(); if (!v.to) beHousing[v.ratId] = String(v.cageId); });

    beRender();
}

function beRender() {
    const body = document.getElementById('be-body');
    const t = BE_TYPES[beType];
    const isMr = beType === 'mr';

    // 케이지별 묶음 (배정 안 된 개체는 '미배정'으로)
    const groups = {};
    const bnos = beBatchList();
    beVisible().forEach(r => {
        const key = beHousing[r.ratId] ? `${beHousing[r.ratId]}번 케이지` : '미배정';
        (groups[key] = groups[key] || []).push(r);
    });
    const groupKeys = Object.keys(groups).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));

    body.innerHTML = `
    <div class="card">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
            ${Object.entries(BE_TYPES).map(([k, v]) => `
            <button onclick="beSetType('${k}')" aria-pressed="${beType === k}"
                style="padding:9px 14px; border-radius:2px; cursor:pointer; font-size:0.9rem; font-weight:bold;
                       border:${beType === k ? '2px solid var(--ink)' : '1px dashed var(--rule)'};
                       background:${beType === k ? 'var(--ink)' : 'var(--paper)'}; color:${beType === k ? 'var(--paper)' : 'var(--ink-soft)'};">
                ${v.label}
            </button>`).join('')}
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div>
                <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">날짜</div>
                <input type="date" id="be-date" value="${getTodayStr()}" style="width:auto; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
            </div>
            ${isMr ? `
            <div>
                <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">시점</div>
                <select id="be-mr-tp" style="width:auto; min-width:90px; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
                    ${['D00','D0','D2','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12']
                        .map(v => `<option value="${v}" ${v === 'W4' ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
            </div>
            <div>
                <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">Infarct 크기</div>
                <select id="be-mr-size" style="width:auto; min-width:90px; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
                    <option value="">-</option><option value="None">None</option>
                    <option value="Small">Small</option><option value="Large">Large</option>
                </select>
            </div>
            <div>
                <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">위치</div>
                <select id="be-mr-loc" style="width:auto; min-width:80px; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
                    <option value="">-</option><option value="R">R</option>
                    <option value="L">L</option><option value="Both">Both</option>
                </select>
            </div>` : ''}
            ${beType === 'sacrifice' ? `
            <div>
                <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:3px;">샘플 종류</div>
                <select id="be-sample-type" style="width:auto; min-width:110px; padding:8px; border:1px solid #C9C5B8; border-radius:2px;">
                    <option value="">-</option><option value="Histology">Histology</option>
                    <option value="Cast">Cast</option><option value="Fail">못함</option>
                </select>
            </div>` : ''}
        </div>
        ${isMr ? `<div style="font-size:0.78rem; color:var(--ink-soft); margin-top:8px;">
            Infarct는 나중에 판독 후 개체별로 채워도 됩니다. 비워두면 기록만 남습니다.</div>` : ''}
    </div>

    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <h4 style="margin:0; color:var(--ink);">대상 선택
                <span class="mono" style="font-size:0.85rem; color:var(--ink-soft); font-weight:normal;">(${bePicked.size}마리 선택됨${bePicked.size ? ' · ' + beBatchSummary(beRats.filter(r => bePicked.has(r.ratId))) : ''})</span></h4>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                ${bnos.length ? `<label for="be-batch" style="font-size:0.8rem; color:var(--ink-soft);">배치</label>
                <select id="be-batch" onchange="beSetBatch(this.value)" style="width:auto; min-width:90px; padding:5px; border:1px solid #C9C5B8; border-radius:2px;">
                    <option value="" ${!beBatch ? 'selected' : ''}>전체</option>
                    ${bnos.map(b => `<option value="${b}" ${beBatch === b ? 'selected' : ''}>B${b}</option>`).join('')}
                </select>` : ''}
                <button class="btn-small db-tap" onclick="bePickAll(true)" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);">${beBatch ? `B${beBatch} 전체 선택` : '전체 선택'}</button>
                <button class="btn-small db-tap" onclick="bePickAll(false)" style="background:var(--paper); color:var(--ink); outline:1px solid var(--rule);">전체 해제</button>
            </div>
        </div>

        ${groupKeys.map(g => `
        <div style="margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <b class="mono" style="font-size:0.85rem; color:var(--ink);">${g}</b>
                <button class="btn-small" onclick="bePickGroup('${g}')" style="background:var(--paper); color:var(--ink-soft); outline:1px solid var(--rule); padding:2px 8px; font-size:0.72rem;">이 묶음 전체</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:6px;">
                ${groups[g].map(r => beRatChip(r)).join('')}
            </div>
        </div>`).join('')}

        <button class="btn btn-green" onclick="beSave()"
                style="width:100%; height:48px; font-size:1rem; margin-top:10px;">
            선택한 ${bePicked.size}마리에 ${t.label} 기록
        </button>
    </div>`;
}

// 이미 값이 있는 개체는 미리 표시해서 덮어쓸지 판단할 수 있게 한다
function beExistingText(r) {
    if (beType === 'mr') {
        const n = (r.mrDates || []).length;
        return n ? `MR ${n}건` : '';
    }
    if (beType === 'sacrifice') return [r.sampleDate ? `희생 ${r.sampleDate}` : '', r.deathDate ? `사망 ${r.deathDate}` : ''].filter(Boolean).join(' · ');
    return r[BE_TYPES[beType].field] || '';
}

// ---------- 배치 ----------
function beBatchOf(r) { return typeof getBatchNo === 'function' ? getBatchNo(r, beBatchSize) : null; }
function beBatchList() { return [...new Set(beRats.map(beBatchOf).filter(Boolean))].sort((a, b) => a - b); }
function beVisible() { return beBatch ? beRats.filter(r => beBatchOf(r) === beBatch) : beRats; }
// 고른 개체의 배치별 마리수 "B1 6 · B2 3" (배치 없는 코호트는 빈 문자열)
function beBatchSummary(list) {
    const m = {};
    list.forEach(r => { const b = beBatchOf(r); if (b) m[b] = (m[b] || 0) + 1; });
    return Object.keys(m).sort((a, b) => a - b).map(b => `B${b} ${m[b]}마리`).join(' · ');
}
function beSetBatch(v) {
    beBatch = Number(v) || '';
    // 화면에서 안 보이는 배치의 선택은 버린다 — 보이지 않는 개체가 같이 저장되지 않게
    if (beBatch) bePicked = new Set([...bePicked].filter(id => beVisible().some(r => r.ratId === id)));
    beRender();
}

function beRatChip(r) {
    const picked = bePicked.has(r.ratId);
    const exist = beExistingText(r);
    const dead = r.status === '사망';
    return `
    <button data-be-pick="${beEsc(r.ratId)}" aria-pressed="${picked}"
        style="text-align:left; padding:8px 10px; border-radius:2px; cursor:pointer; font-size:0.85rem;
               border:${picked ? '2px solid var(--ink)' : '1px solid var(--rule)'};
               background:${picked ? 'var(--stock-canary-soft)' : 'var(--sheet)'};
               ${dead ? 'opacity:0.5;' : ''}">
        <div style="display:flex; align-items:center; gap:6px;">
            <span aria-hidden="true" style="font-size:1rem;">${picked ? '☑' : '☐'}</span>
            <b class="mono">${beEsc(r.ratId)}</b>${dead ? ' <span aria-hidden="true">💀</span>' : ''}
        </div>
        ${exist ? `<div style="font-size:0.72rem; color:#7A5C00; margin-top:2px;">이미 있음: ${beEsc(exist)}</div>` : ''}
    </button>`;
}

function beSetType(t) { beType = t; beRender(); }
function bePick(id) { bePicked.has(id) ? bePicked.delete(id) : bePicked.add(id); beRender(); }
function bePickAll(on) {
    // 고른 배치 안에서만 (배치를 안 골랐으면 전체)
    bePicked = new Set(on ? beVisible().filter(r => r.status !== '사망').map(r => r.ratId) : []);
    beRender();
}
function bePickGroup(g) {
    const ids = beVisible().filter(r => (beHousing[r.ratId] ? `${beHousing[r.ratId]}번 케이지` : '미배정') === g)
        .filter(r => r.status !== '사망').map(r => r.ratId);
    const allOn = ids.every(id => bePicked.has(id));
    ids.forEach(id => allOn ? bePicked.delete(id) : bePicked.add(id));
    beRender();
}

async function beSave() {
    if (!bePicked.size) return alert('대상을 선택하세요.');
    const date = document.getElementById('be-date').value;
    if (!date) return alert('날짜를 선택하세요.');

    const t = BE_TYPES[beType];
    const targets = beRats.filter(r => bePicked.has(r.ratId));

    // 날짜 검사 (global.js checkRatDates). 결찰일 하나가 틀리면 BAPN · 사료 전환 · 메트포민이 전부 따라 틀린다.
    const today = getTodayStr();
    const errs = [], warns = [];
    if (date > today) errs.push(`날짜 ${date}가 오늘(${today})보다 뒤입니다`);
    targets.forEach(r => {
        const dead = r.status === '사망';
        const patch = beType === 'ligation' ? { surgeryDate: date }
            : beType === 'ovx' ? { ovxDate: date }
            : beType === 'sacrifice' ? (dead ? { sampleDate: date } : { sampleDate: date, deathDate: date })
            : null;
        if (beType === 'sacrifice' && dead && r.deathDate && date < String(r.deathDate).slice(0, 10))
            warns.push(`${r.ratId}: 희생일 ${date}이 사망일 ${r.deathDate}보다 앞입니다`);
        if (!patch || typeof checkRatDates !== 'function') return;
        const c = checkRatDates(r, patch, today);
        c.errors.forEach(x => errs.push(`${r.ratId}: ${x}`));
        c.warns.forEach(x => warns.push(x));
    });
    if (errs.length) return alert('저장하지 않았습니다 — 날짜를 확인하세요:\n\n' + [...new Set(errs)].slice(0, 12).join('\n') + (errs.length > 12 ? `\n… 외 ${errs.length - 12}건` : ''));
    if (warns.length && !confirm('확인해주세요:\n\n' + [...new Set(warns)].slice(0, 10).join('\n') + '\n\n계속할까요?')) return;

    // 배치가 둘 이상 섞였으면 한 번 더 묻는다 — 전체 선택으로 다른 배치까지 쓰는 사고 방지
    const bsum = beBatchSummary(targets);
    const nBatch = new Set(targets.map(beBatchOf).filter(Boolean)).size;
    if (!confirm(`${t.label} ${date}\n${targets.length}마리${bsum ? ` (${bsum})` : ''}\n\n기록할까요?`)) return;
    if (nBatch > 1 && !confirm(`배치 ${nBatch}개가 섞여 있습니다 (${bsum}).\n\n같은 날 같은 처치를 받은 게 맞습니까? 다르면 취소하고 배치를 고르세요.`)) return;

    // Sham/Naïve의 surgeryDate는 '반입일 + 기준주령'으로 만든 가상 날짜다.
    // 여기서 실제 수술일을 덮어쓰면 그래프의 POD 축이 조용히 어긋난다.
    if (beType === 'ligation') {
        const shams = targets.filter(r => r.isNonInduction);
        if (shams.length && !confirm(
            `Sham/Naïve로 표시된 개체가 ${shams.length}마리 있습니다.\n` +
            `${shams.slice(0, 6).map(r => r.ratId).join(', ')}${shams.length > 6 ? ' 외' : ''}\n\n` +
            `이 개체들의 수술일은 그래프 기준용 가상 날짜입니다.\n덮어쓰면 POD 축이 달라집니다. 계속할까요?`)) return;
    }

    // 이미 값이 있는 개체는 덮어쓰기 전에 확인
    // 희생: 이미 사망한 개체는 사망일·상태를 그대로 두고 희생일·샘플만 적으므로, 덮어쓰기는 희생일 또는 (생존인데 사망일이 있는) 경우
    const overwrite = targets.filter(r => beType === 'sacrifice'
        ? (r.sampleDate || (r.status !== '사망' && r.deathDate))
        : (beType !== 'mr' && beExistingText(r)));
    const deadSac = beType === 'sacrifice' ? targets.filter(r => r.status === '사망') : [];
    if (deadSac.length && !confirm(`이미 사망한 ${deadSac.length}마리는 사망일·상태를 그대로 두고 희생일·샘플만 적습니다.\n\n` +
        deadSac.slice(0, 8).map(r => `${r.ratId} (사망 ${r.deathDate || '날짜 없음'})`).join('\n') + (deadSac.length > 8 ? '\n... 외' : '') + '\n\n계속할까요?')) return;
    if (overwrite.length) {
        const list = overwrite.slice(0, 8).map(r => `${r.ratId} (${beExistingText(r)})`).join('\n');
        if (!confirm(`이미 기록이 있는 개체 ${overwrite.length}마리를 덮어씁니다.\n\n${list}` +
            (overwrite.length > 8 ? `\n... 외 ${overwrite.length - 8}마리` : '') + '\n\n계속할까요?')) return;
    }

    const mrTp = document.getElementById('be-mr-tp')?.value;
    const mrSize = document.getElementById('be-mr-size')?.value || '';
    const mrLoc = document.getElementById('be-mr-loc')?.value || '';
    const sampleType = document.getElementById('be-sample-type')?.value || '';

    // MR은 같은 시점이 이미 있으면 건너뛴다 (중복 기록 방지)
    const skipped = [];
    const sacLiving = [];   // 이번에 희생으로 사망 처리된 개체 (재실 닫기 · 마지막 생존 확인일 대상)

    try {
        const snap = await db.collection('rats').where('cohort', '==', String(beCohort)).get();
        const docByRat = {};
        snap.forEach(d => { docByRat[d.data().ratId] = d; });

        const batch = db.batch();
        let n = 0;

        for (const r of targets) {
            const doc = docByRat[r.ratId];
            if (!doc) continue;

            if (beType === 'mr') {
                const arr = (doc.data().mrDates || []).slice();
                if (arr.some(m => m.timepoint === mrTp)) { skipped.push(`${r.ratId} (${mrTp} 이미 있음)`); continue; }
                arr.push({ timepoint: mrTp, date: date, infarctSize: mrSize, infarctLoc: mrLoc });
                arr.sort((a, b) => new Date(a.date) - new Date(b.date));
                batch.update(doc.ref, { mrDates: arr });
            } else if (beType === 'sacrifice') {
                // 희생 = 사망. 지금까지의 관례(샘플 있는 111마리 전원 status 사망,
                // 계획 희생은 cod 'Sacrifice')에 맞춰 상태까지 같이 기록한다.
                // 단, 이미 사망한 개체(사후 샘플)는 사망일·상태·사인을 건드리지 않는다
                const upd = { sampleDate: date };
                if (sampleType) upd.sampleType = sampleType;
                if (doc.data().status !== '사망') {
                    upd.status = '사망'; upd.deathDate = date;
                    if (!doc.data().cod && !doc.data().codFull) upd.cod = 'Sacrifice';
                    sacLiving.push(r.ratId);
                }
                batch.update(doc.ref, upd);
            } else {
                batch.update(doc.ref, { [t.field]: date });
            }
            n++;
        }

        if (!n) return alert('반영할 대상이 없습니다.\n\n' + skipped.join('\n'));
        await batch.commit();

        // 희생 처리된 개체는 케이지 재실도 닫는다 (안 닫으면 섭취량 마리·일에 계속 잡힘)
        if (beType === 'sacrifice') {
            for (const id of sacLiving) {
                await closeOpenHousing(id, '희생');
                // 사망일 = 희생일. 마지막 생존 확인일도 같이 (사건 기록 evSave와 같음, global.js lastAliveDateFor)
                try { await docByRat[id].ref.update({ lastAliveDate: await lastAliveDateFor(id, date) }); }
                catch (e) { console.warn('lastAliveDate 저장 실패', id, e); }
            }
        }
        clearRatsCache();

        bePicked = new Set();
        await beLoad(beCohort);

        let msg = `${n}마리에 ${t.label} 기록 완료`;
        if (skipped.length) msg += `\n\n건너뜀 ${skipped.length}건:\n` + skipped.slice(0, 10).join('\n');
        alert(msg);
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    }
}
