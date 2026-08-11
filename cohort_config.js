// ============================================================
//  코호트 설정 (Cohort Config)
//  - 군 정의 / 시점 / 사육 기본값 / 약물·식이 프로토콜
//  - 저장은 화면당 한 번 (변경분을 모아 1회 쓰기)
//  - 컬렉션: cohortConfigs (문서 ID = 코호트 번호)
// ============================================================

// 기준 이벤트: 개체마다 날짜가 다르므로 절대 날짜가 아닌 '기준 + 며칠 뒤'로 정의한다
const CFG_ANCHORS = {
    arrival:  '반입일',
    ovx:      'OVX',
    ligation: 'Ligation(수술)',
    end:      '종료까지'
};

const CFG_MEDIUMS = { food: '사료', water: '물' };

// 새 코호트를 만들 때 채워지는 초기값
function cfgDefaultConfig(cohort) {
    return {
        cohort: String(cohort),
        memo: '',
        groups: [
            { key: 'G0', name: '대조군',      desc: '고염식 + BAPN, 메트포민 없음', color: '#3CB44B' },
            { key: 'G1', name: '초기 투여군',  desc: 'BAPN 시작과 함께 메트포민',    color: '#E6194B' },
            { key: 'G2', name: '후기 투여군',  desc: '수술 4주 뒤부터 메트포민',     color: '#4363D8' }
        ],
        timepoints: { mr: ['W4', 'W8', 'W12'], bp: ['W1', 'W5', 'W9'] },
        housing: { ratsPerCage: 3, cageCount: 24, waterFill: 600, foodFill: 150, bottleCount: 1,
                   evapPerHour: 0, lossPerHandling: 0 },
        dosing: [
            { substance: 'NaCl',      medium: 'food',  mode: 'percent',    value: 8,
              groups: ['G0', 'G1', 'G2'], startAnchor: 'ovx',      startOffset: 0,
              endAnchor: 'end', endOffset: 0 },
            { substance: 'BAPN',      medium: 'food',  mode: 'percent',    value: 0.12,
              groups: ['G0', 'G1', 'G2'], startAnchor: 'ligation', startOffset: 2,
              endAnchor: 'end', endOffset: 0 },
            { substance: 'Metformin', medium: 'water', mode: 'targetDose', value: 150, stockConc: 40,
              groups: ['G1'],             startAnchor: 'ligation', startOffset: 2,
              endAnchor: 'end', endOffset: 0 },
            { substance: 'Metformin', medium: 'water', mode: 'targetDose', value: 150, stockConc: 40,
              groups: ['G2'],             startAnchor: 'ligation', startOffset: 28,
              endAnchor: 'end', endOffset: 0 }
        ]
    };
}

// 화면에서 편집 중인 사본. 저장 전까지 DB에 쓰지 않는다.
let cfgDraft = null;
let cfgDirty = false;
let cfgLoadedCohort = null;

function cfgMarkDirty() {
    cfgDirty = true;
    const bar = document.getElementById('cfg-savebar');
    if (bar) bar.style.display = 'flex';
}

// 사료 %를 mg/g으로 (8% = 100g당 8g = 80mg/g)
function cfgPercentToMgPerG(pct) {
    const v = Number(pct);
    return isNaN(v) ? 0 : v * 10;
}

// ---------- 진입점 ----------
async function renderCohortConfigView(main) {
    main.innerHTML = `
    <div class="card">
        <h3>⚙️ 코호트 설정</h3>
        <div style="font-size:0.85rem; color:#666; margin-bottom:12px;">
            군·시점·약물 농도를 여기서 정하면 케이지 입력과 섭취량 계산이 이 값을 따라갑니다.
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-weight:bold; color:var(--navy);">코호트</label>
            <select id="cfg-cohort-sel" style="padding:8px; border-radius:6px; border:1px solid #ccc; min-width:140px;">
                <option>로딩 중...</option>
            </select>
            <button class="btn-small btn-blue" onclick="cfgLoadSelected()">불러오기</button>
            <span style="width:1px; height:24px; background:#ddd;"></span>
            <input type="number" id="cfg-new-cohort" placeholder="새 코호트 번호"
                   style="padding:8px; border-radius:6px; border:1px solid #ccc; width:140px;">
            <button class="btn-small btn-green" onclick="cfgCreateNew()">새로 만들기</button>
        </div>
    </div>
    <div id="cfg-body"></div>`;

    await cfgFillCohortSelector();
}

async function cfgFillCohortSelector() {
    const sel = document.getElementById('cfg-cohort-sel');
    if (!sel) return;
    try {
        const nums = new Set();
        const rats = await getRatsWithCache();
        rats.forEach(r => { if (r.cohort) nums.add(String(r.cohort)); });

        const cfgSnap = await db.collection('cohortConfigs').get();
        const configured = new Set();
        cfgSnap.forEach(d => { nums.add(d.id); configured.add(d.id); });

        const sorted = Array.from(nums).sort((a, b) => Number(b) - Number(a));
        sel.innerHTML = sorted.map(n =>
            `<option value="${n}">코호트 ${n}${configured.has(n) ? ' ✓' : ' (미설정)'}</option>`
        ).join('') || '<option value="">코호트 없음</option>';
    } catch (e) {
        console.error(e);
        sel.innerHTML = '<option value="">불러오기 실패</option>';
    }
}

async function cfgCreateNew() {
    const val = (document.getElementById('cfg-new-cohort').value || '').trim();
    if (!val) return alert('새로 만들 코호트 번호를 입력하세요.');

    const existing = await db.collection('cohortConfigs').doc(val).get();
    if (existing.exists) {
        if (!confirm(`코호트 ${val} 설정이 이미 있습니다. 불러올까요?`)) return;
        return cfgOpen(val);
    }
    cfgDraft = cfgDefaultConfig(val);
    cfgLoadedCohort = val;
    cfgDirty = true;
    cfgRenderBody();
    const bar = document.getElementById('cfg-savebar');
    if (bar) bar.style.display = 'flex';
}

function cfgLoadSelected() {
    const sel = document.getElementById('cfg-cohort-sel');
    if (!sel || !sel.value) return;
    cfgOpen(sel.value);
}

async function cfgOpen(cohort) {
    if (cfgDirty && !confirm('저장하지 않은 변경사항이 있습니다. 버리고 이동할까요?')) return;
    try {
        const doc = await db.collection('cohortConfigs').doc(String(cohort)).get();
        cfgDraft = doc.exists ? Object.assign(cfgDefaultConfig(cohort), doc.data()) : cfgDefaultConfig(cohort);
        cfgLoadedCohort = String(cohort);
        cfgDirty = false;
        cfgRenderBody();
    } catch (e) {
        console.error(e);
        alert('설정 불러오기 실패: ' + e.message);
    }
}

// ---------- 본문 렌더 ----------
function cfgRenderBody() {
    const box = document.getElementById('cfg-body');
    if (!box || !cfgDraft) return;
    const c = cfgDraft;

    box.innerHTML = `
    ${cfgGroupsCard(c)}
    ${cfgTimepointsCard(c)}
    ${cfgHousingCard(c)}
    ${cfgDosingCard(c)}

    <div id="cfg-savebar" style="display:${cfgDirty ? 'flex' : 'none'}; position:sticky; bottom:0; z-index:50;
         background:var(--navy); color:#fff; padding:12px 78px 12px 18px; border-radius:10px; margin-top:16px;
         align-items:center; justify-content:space-between; box-shadow:0 -2px 12px rgba(0,0,0,0.15);">
        <span style="font-size:0.9rem;">저장하지 않은 변경사항이 있습니다</span>
        <div style="display:flex; gap:8px;">
            <button class="btn-small" onclick="cfgOpen('${c.cohort}')"
                    style="background:#fff; color:var(--navy);">되돌리기</button>
            <button class="btn-small btn-green" onclick="cfgSave()">저장</button>
        </div>
    </div>`;
}

function cfgGroupsCard(c) {
    const rows = c.groups.map((g, i) => `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
            <input type="color" value="${g.color}" onchange="cfgSetGroup(${i},'color',this.value)"
                   style="width:38px; height:34px; padding:0; border:1px solid #ccc; border-radius:6px;">
            <input type="text" value="${g.key}" onchange="cfgSetGroup(${i},'key',this.value)"
                   placeholder="G0" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:6px;">
            <input type="text" value="${g.name}" onchange="cfgSetGroup(${i},'name',this.value)"
                   placeholder="군 이름" style="width:130px; padding:6px; border:1px solid #ccc; border-radius:6px;">
            <input type="text" value="${g.desc || ''}" onchange="cfgSetGroup(${i},'desc',this.value)"
                   placeholder="설명" style="flex:1; min-width:180px; padding:6px; border:1px solid #ccc; border-radius:6px;">
            <button class="btn-small btn-red" onclick="cfgRemoveGroup(${i})" style="padding:4px 10px;">삭제</button>
        </div>`).join('');

    return `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">🧪 실험군</h4>
        <div style="font-size:0.8rem; color:#666; margin-bottom:10px;">
            군 코드(G0/G1…)는 랫드 ID와 연결되므로 실험 시작 후에는 바꾸지 마세요.
        </div>
        ${rows}
        <button class="btn-small btn-blue" onclick="cfgAddGroup()">+ 군 추가</button>
    </div>`;
}

function cfgTimepointsCard(c) {
    const mk = (kind, label, hint) => `
        <div class="input-group" style="flex:1; min-width:240px;">
            <label style="font-weight:bold; color:var(--navy);">${label}</label>
            <input type="text" value="${(c.timepoints[kind] || []).join(', ')}"
                   onchange="cfgSetTimepoints('${kind}', this.value)"
                   style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
            <div style="font-size:0.78rem; color:#888; margin-top:4px;">${hint}</div>
        </div>`;

    return `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">📅 검사 시점</h4>
        <div style="display:flex; gap:15px; flex-wrap:wrap;">
            ${mk('mr', 'MR 촬영', '쉼표로 구분. W4 = 수술 후 28일')}
            ${mk('bp', '혈압(BP) 측정', '쉼표로 구분. W1 = 수술 후 7일')}
        </div>
        <div style="margin-top:10px; padding:8px 10px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; font-size:0.82rem; color:#7a5c00;">
            이 날들은 마취·구속 때문에 물을 평소보다 적게 마십니다. 해당 구간은 <b>처치일</b>로 표시되어
            메트포민 용량 계산에서 자동 제외됩니다.
        </div>
    </div>`;
}

function cfgHousingCard(c) {
    const h = c.housing;
    const num = (key, label, unit, hint) => `
        <div class="input-group" style="min-width:150px;">
            <label style="font-weight:bold; color:var(--navy);">${label}</label>
            <div style="display:flex; align-items:center; gap:6px;">
                <input type="number" step="any" value="${h[key]}" onchange="cfgSetHousing('${key}', this.value)"
                       style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
                <span style="font-size:0.85rem; color:#666; white-space:nowrap;">${unit}</span>
            </div>
            ${hint ? `<div style="font-size:0.75rem; color:#888; margin-top:4px;">${hint}</div>` : ''}
        </div>`;

    return `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">🏠 사육 기본값</h4>
        <div style="font-size:0.8rem; color:#666; margin-bottom:10px;">
            케이지별 입력 화면에서 이 값이 미리 채워집니다. 그날 다르게 했으면 그 화면에서 고치면 됩니다.
        </div>
        <div style="display:flex; gap:15px; flex-wrap:wrap;">
            ${num('cageCount',   '케이지 수',      '개',  '')}
            ${num('ratsPerCage', '케이지당 마리수', '마리', '')}
            ${num('waterFill',   '물 채우는 양',   'mL',  '매일 리셋')}
            ${num('foodFill',    '사료 채우는 양', 'g',   '매일 리셋')}
            ${num('bottleCount', '물통 개수',      '개',  '1이면 입력창에서 숨김')}
        </div>

        <h4 style="color:var(--navy); margin:18px 0 6px;">💧 물 로스 보정</h4>
        <div style="font-size:0.8rem; color:#666; margin-bottom:10px;">
            빈 케이지에 물통만 걸어두고 잰 값입니다. 증발은 <b>시간에 비례</b>하고,
            탈착 로스는 <b>횟수마다 한 번</b>이라 따로 넣어야 주말(64시간)도 정확해집니다.
        </div>
        <div style="display:flex; gap:15px; flex-wrap:wrap;">
            ${num('evapPerHour',     '증발량',      'g/시간', '(L₇₂ − L₂₄) ÷ 48')}
            ${num('lossPerHandling', '탈착 로스',   'g/회',   'L₂₄ − 24×증발량')}
        </div>
        ${(!Number(h.evapPerHour) && !Number(h.lossPerHandling)) ? `
        <div style="margin-top:10px; padding:8px 10px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; font-size:0.82rem; color:#7a5c00;">
            아직 실측값이 없어 로스 보정 없이 계산됩니다. 값을 넣으면 이후 기록부터 반영됩니다.
        </div>` : ''}
    </div>`;
}

function cfgDosingCard(c) {
    // 전역 CSS가 select를 100% 폭으로 늘리므로 여기서 폭을 지정한다
    const anchorSel = (val, onchange) => `
        <select onchange="${onchange}" style="width:auto; min-width:120px; padding:6px; border:1px solid #ccc; border-radius:6px; font-size:0.9rem;">
            ${Object.entries(CFG_ANCHORS).map(([k, label]) =>
                `<option value="${k}" ${val === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>`;

    const rows = (c.dosing || []).map((d, i) => {
        const isWater = d.medium === 'water';
        const groupChecks = c.groups.map(g => `
            <label style="font-size:0.85rem; margin-right:10px; white-space:nowrap;">
                <input type="checkbox" ${(d.groups || []).includes(g.key) ? 'checked' : ''}
                       onchange="cfgToggleDoseGroup(${i}, '${g.key}', this.checked)"
                       style="width:auto; vertical-align:middle;"> ${g.key}
            </label>`).join('');

        const concBlock = isWater ? `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="min-width:160px;">
                    <div style="font-size:0.78rem; color:#666;">목표 용량</div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" step="any" value="${d.value}" onchange="cfgSetDose(${i},'value',this.value)"
                               style="width:90px; padding:6px; border:1px solid #ccc; border-radius:6px;">
                        <span style="font-size:0.82rem; color:#666;">mg/kg/day</span>
                    </div>
                </div>
                <div style="min-width:160px;">
                    <div style="font-size:0.78rem; color:#666;">원액 농도</div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" step="any" value="${d.stockConc || 0}" onchange="cfgSetDose(${i},'stockConc',this.value)"
                               style="width:90px; padding:6px; border:1px solid #ccc; border-radius:6px;">
                        <span style="font-size:0.82rem; color:#666;">mg/mL</span>
                    </div>
                </div>
            </div>` : `
            <div style="min-width:160px;">
                <div style="font-size:0.78rem; color:#666;">사료 내 농도</div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <input type="number" step="any" value="${d.value}" onchange="cfgSetDose(${i},'value',this.value)"
                           style="width:90px; padding:6px; border:1px solid #ccc; border-radius:6px;">
                    <span style="font-size:0.82rem; color:#666;">% (w/w)</span>
                    <span style="font-size:0.82rem; color:var(--navy); font-weight:bold;">= ${cfgPercentToMgPerG(d.value)} mg/g</span>
                </div>
            </div>`;

        return `
        <div style="border:1px solid #e0e0e0; border-left:4px solid ${isWater ? '#1565c0' : '#e65100'};
                    border-radius:8px; padding:12px; margin-bottom:10px; background:#fafafa;">
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <input type="text" value="${d.substance}" onchange="cfgSetDose(${i},'substance',this.value)"
                       style="width:130px; padding:6px; border:1px solid #ccc; border-radius:6px; font-weight:bold;">
                <select onchange="cfgSetDoseMedium(${i}, this.value)" style="width:auto; min-width:120px; padding:6px; border:1px solid #ccc; border-radius:6px; font-size:0.9rem;">
                    ${Object.entries(CFG_MEDIUMS).map(([k, label]) =>
                        `<option value="${k}" ${d.medium === k ? 'selected' : ''}>${label}에 섞음</option>`).join('')}
                </select>
                <button class="btn-small btn-red" onclick="cfgRemoveDose(${i})" style="margin-left:auto; padding:4px 10px;">삭제</button>
            </div>

            ${concBlock}

            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ddd;">
                <div style="font-size:0.78rem; color:#666; margin-bottom:4px;">적용 군</div>
                <div>${groupChecks}</div>
            </div>

            <div style="margin-top:10px; display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end;">
                <div>
                    <div style="font-size:0.78rem; color:#666; margin-bottom:4px;">시작</div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        ${anchorSel(d.startAnchor, `cfgSetDose(${i},'startAnchor',this.value)`)}
                        <span style="font-size:0.85rem;">+</span>
                        <input type="number" value="${d.startOffset || 0}" onchange="cfgSetDose(${i},'startOffset',this.value)"
                               style="width:64px; padding:6px; border:1px solid #ccc; border-radius:6px;">
                        <span style="font-size:0.85rem; color:#666;">일</span>
                    </div>
                </div>
                <div>
                    <div style="font-size:0.78rem; color:#666; margin-bottom:4px;">종료</div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        ${anchorSel(d.endAnchor, `cfgSetDose(${i},'endAnchor',this.value)`)}
                        ${d.endAnchor === 'end' ? '' : `
                        <span style="font-size:0.85rem;">+</span>
                        <input type="number" value="${d.endOffset || 0}" onchange="cfgSetDose(${i},'endOffset',this.value)"
                               style="width:64px; padding:6px; border:1px solid #ccc; border-radius:6px;">
                        <span style="font-size:0.85rem; color:#666;">일</span>`}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="card">
        <h4 style="margin-top:0; color:var(--navy);">💊 약물 · 식이 프로토콜</h4>
        <div style="font-size:0.8rem; color:#666; margin-bottom:12px;">
            개체마다 수술 날짜가 다르므로 <b>절대 날짜가 아니라 "기준 + 며칠 뒤"</b>로 정합니다.
            중간에 농도가 바뀌면 행을 두 개로 나누세요.
        </div>
        ${rows || '<div style="color:#888; padding:10px;">등록된 항목이 없습니다.</div>'}
        <button class="btn-small btn-blue" onclick="cfgAddDose()">+ 항목 추가</button>
    </div>`;
}

// ---------- 편집 핸들러 (전부 화면 사본만 수정, DB에는 안 씀) ----------
function cfgSetGroup(i, key, val) { cfgDraft.groups[i][key] = val; cfgMarkDirty(); if (key === 'key') cfgRenderBody(); }
function cfgAddGroup() {
    cfgDraft.groups.push({ key: 'G' + cfgDraft.groups.length, name: '새 군', desc: '', color: '#888888' });
    cfgMarkDirty(); cfgRenderBody();
}
function cfgRemoveGroup(i) {
    if (!confirm(`'${cfgDraft.groups[i].name}' 군을 삭제할까요?`)) return;
    cfgDraft.groups.splice(i, 1); cfgMarkDirty(); cfgRenderBody();
}

function cfgSetTimepoints(kind, val) {
    cfgDraft.timepoints[kind] = val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    cfgMarkDirty();
}

function cfgSetHousing(key, val) { cfgDraft.housing[key] = Number(val); cfgMarkDirty(); }

function cfgSetDose(i, key, val) {
    const numeric = ['value', 'stockConc', 'startOffset', 'endOffset'];
    cfgDraft.dosing[i][key] = numeric.includes(key) ? Number(val) : val;
    cfgMarkDirty();
    if (key === 'value' || key === 'endAnchor') cfgRenderBody();
}
function cfgSetDoseMedium(i, val) {
    const d = cfgDraft.dosing[i];
    d.medium = val;
    d.mode = (val === 'water') ? 'targetDose' : 'percent';
    if (val === 'water' && !d.stockConc) d.stockConc = 40;
    cfgMarkDirty(); cfgRenderBody();
}
function cfgToggleDoseGroup(i, key, on) {
    const d = cfgDraft.dosing[i];
    d.groups = d.groups || [];
    if (on) { if (!d.groups.includes(key)) d.groups.push(key); }
    else d.groups = d.groups.filter(g => g !== key);
    cfgMarkDirty();
}
function cfgAddDose() {
    cfgDraft.dosing.push({
        substance: '새 항목', medium: 'food', mode: 'percent', value: 0,
        groups: cfgDraft.groups.map(g => g.key),
        startAnchor: 'ligation', startOffset: 0, endAnchor: 'end', endOffset: 0
    });
    cfgMarkDirty(); cfgRenderBody();
}
function cfgRemoveDose(i) {
    if (!confirm(`'${cfgDraft.dosing[i].substance}' 항목을 삭제할까요?`)) return;
    cfgDraft.dosing.splice(i, 1); cfgMarkDirty(); cfgRenderBody();
}

// ---------- 저장 (변경분을 모아 1회 쓰기) ----------
function cfgValidate(c) {
    const errs = [];
    const keys = c.groups.map(g => (g.key || '').trim());
    if (keys.some(k => !k)) errs.push('군 코드가 비어 있는 항목이 있습니다.');
    if (new Set(keys).size !== keys.length) errs.push('군 코드가 중복됩니다.');

    (c.dosing || []).forEach(d => {
        if (!d.substance || !d.substance.trim()) errs.push('이름이 비어 있는 약물 항목이 있습니다.');
        if (!(d.groups || []).length) errs.push(`'${d.substance}'에 적용 군이 선택되지 않았습니다.`);
        if (!(Number(d.value) > 0)) errs.push(`'${d.substance}'의 농도/용량이 0입니다.`);
        if (d.medium === 'water' && !(Number(d.stockConc) > 0)) errs.push(`'${d.substance}'의 원액 농도가 0입니다.`);
    });
    return errs;
}

async function cfgSave() {
    if (!cfgDraft) return;
    const errs = cfgValidate(cfgDraft);
    if (errs.length) return alert('저장 전에 확인해주세요:\n\n· ' + errs.join('\n· '));

    try {
        const payload = Object.assign({}, cfgDraft, {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: (firebase.auth().currentUser && firebase.auth().currentUser.email) || null
        });
        await db.collection('cohortConfigs').doc(String(cfgDraft.cohort)).set(payload, { merge: true });

        cfgDirty = false;
        const bar = document.getElementById('cfg-savebar');
        if (bar) bar.style.display = 'none';
        await cfgFillCohortSelector();
        const sel = document.getElementById('cfg-cohort-sel');
        if (sel) sel.value = String(cfgDraft.cohort);
        cfgToast('저장되었습니다');
    } catch (e) {
        console.error(e);
        alert('저장 실패: ' + e.message);
    }
}

// 알림창 대신 잠깐 떴다 사라지는 표시 (저장할 때마다 확인 누르지 않도록)
function cfgToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%);' +
        'background:#2e7d32; color:#fff; padding:10px 20px; border-radius:20px; z-index:99999;' +
        'box-shadow:0 3px 12px rgba(0,0,0,0.25); font-size:0.9rem;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
}

// 다른 화면에서 설정을 읽어갈 때 쓰는 함수 (케이지 입력·섭취량 계산에서 사용 예정)
async function getCohortConfig(cohort) {
    const doc = await db.collection('cohortConfigs').doc(String(cohort)).get();
    return doc.exists ? doc.data() : null;
}
