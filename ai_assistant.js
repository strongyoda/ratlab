// ============================================================
//  AI Assistant (Universal Action Dispatcher Edition)
//  - AI는 자연어 → JSON action 으로 변환만 담당
//  - 실제 데이터 검색/계산/렌더는 프론트가 로컬 캐시로 수행
// ============================================================

// ===== [1] 챗봇 UI 토글 =====================================
document.addEventListener("DOMContentLoaded", () => {
    const aiFab = document.getElementById('ai-chat-fab');
    const aiWindow = document.getElementById('ai-chat-window');
    if (aiFab) aiFab.style.display = 'none';
    if (aiWindow) aiWindow.style.display = 'none';
});

firebase.auth().onAuthStateChanged((user) => {
    const aiFab = document.getElementById('ai-chat-fab');
    const aiWindow = document.getElementById('ai-chat-window');
    if (user) {
        if (aiFab) aiFab.style.display = 'flex';
    } else {
        if (aiFab) aiFab.style.display = 'none';
        if (aiWindow) aiWindow.style.display = 'none';
    }
});

function toggleAiChat() {
    const chatWin = document.getElementById('ai-chat-window');
    if (chatWin) {
        chatWin.style.display = chatWin.style.display === 'none' ? 'flex' : 'none';
    }
}

function appendMessage(sender, html, id = null) {
    const box = document.getElementById('ai-chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = sender === 'user' ? 'msg-user' : 'msg-bot';
    if (id) div.id = id;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}


// ===== [2] 캐시 (rats 외에 measurements, dailyLogs 도 캐싱) ===
let _aiMeasCache = null, _aiMeasCacheT = 0;
let _aiDailyCache = null, _aiDailyCacheT = 0;
const _AI_CACHE_TTL = 1000 * 60 * 5;

async function getAiMeasurements() {
    const now = Date.now();
    if (_aiMeasCache && (now - _aiMeasCacheT < _AI_CACHE_TTL)) return _aiMeasCache;
    const snap = await db.collection("measurements").get();
    _aiMeasCache = snap.docs.map(d => d.data());
    _aiMeasCacheT = now;
    return _aiMeasCache;
}

async function getAiDailyLogs() {
    const now = Date.now();
    if (_aiDailyCache && (now - _aiDailyCacheT < _AI_CACHE_TTL)) return _aiDailyCache;
    const snap = await db.collection("dailyLogs").get();
    _aiDailyCache = snap.docs.map(d => d.data());
    _aiDailyCacheT = now;
    return _aiDailyCache;
}


// ===== [3] 스마트 ID 매칭 (점이 있는 코호트 7.5 도 지원) =====
async function smartMatchRatIds(aiProvidedIds) {
    if (!aiProvidedIds || !Array.isArray(aiProvidedIds)) return [];
    const allRats = await getRatsWithCache();
    const matched = [];

    aiProvidedIds.forEach(raw => {
        // 점 보존 + 영숫자만
        const clean = String(raw).toUpperCase().replace(/[^A-Z0-9.]/g, '');

        // 1차: 풀 ID 정확매칭
        let found = allRats.find(r => r.ratId.toUpperCase() === clean);

        // 2차: G접미사 떼고 코어(C+코호트+번호) 프리픽스 매칭
        if (!found) {
            const coreMatch = clean.match(/^C[0-9.]+/);
            if (coreMatch) {
                // G로 시작하는 부분 직전까지가 코어
                const gIdx = clean.indexOf('G');
                const core = gIdx > 0 ? clean.slice(0, gIdx) : coreMatch[0];
                found = allRats.find(r => r.ratId.toUpperCase().startsWith(core));
            }
        }

        if (found && !matched.includes(found.ratId)) matched.push(found.ratId);
        else if (!found) console.warn(`⚠️ ID 매칭 실패: ${raw}`);
    });
    return matched;
}


// ===== [4] 시스템 프롬프트 (AI는 JSON action으로만 응답) =====
function buildSystemPrompt() {
    return `너는 뇌동맥류 실험 랫드 데이터 분석 어시스턴트야.
사용자의 한국어 요청을 받아 아래 스키마의 JSON 한 개만 반환해. 마크다운(\`\`\`) 절대 금지, 순수 JSON만.

[SCHEMA] (모든 응답에 "action"과 "reply"는 필수)
{
  "action": "<아래 8개 중 하나>",
  "reply": "<사용자에게 한 줄로 보여줄 한국어 응답>",
  ...action별 필드...
}

[ACTIONS]
1) "compare" — 그룹 비교 차트
   - "groups": [{"name":"A","ids":[...]}, {"name":"B","ids":[...]}]
   - 예: "C12의 1-3번 vs 21-23번 비교"
     → {"action":"compare","reply":"비교 차트를 생성합니다.","groups":[{"name":"A","ids":["C1201G1","C1202G1","C1203G1"]},{"name":"B","ids":["C1221G1","C1222G1","C1223G1"]}]}

2) "find_max" / "find_min" — 특정 지표 극값 개체
   - "target" 필수, 선택: "cohort","group","ids","window_pod","window_days","status","limit"
   - target:
     * "weight"           : 절대 체중
     * "weight_loss"      : 전체기간 체중 감소량 (max-min, 양수)
     * "weight_loss_recent": 최근 N일 체중 감소 (window_days 함께)
     * "weight_gain"      : 체중 증가량
     * "sbp" / "dbp" / "mean_bp" : 혈압
     * "score"            : 데일리 점수 (낮을수록 안 좋음 → find_min이 보통)
     * "pod_survival"     : 수술 후 생존일수
     * "age_at_death"     : 사망 주령
   - 예: "최근 2주간 체중 가장 많이 빠진 애" → {"action":"find_max","target":"weight_loss_recent","window_days":14,"limit":1,"reply":"최근 14일간 체중 감소 1위 개체를 검색합니다."}

3) "rank" — 상위 N개 랭킹
   - "target" 필수, "limit"(기본5), "sort":"desc"|"asc"
   - 예: "혈압 높은 순 5마리" → {"action":"rank","target":"sbp","sort":"desc","limit":5,"reply":"SBP 상위 5마리를 보여드릴게요."}

4) "filter" — 조건 부합 개체 목록
   - 가능 필드: cohort, group, ids, status, cod, are_size("macro"|"micro"|"any"|"none"),
     are_location(["BA","MCA",...]), has_ovx(bool), has_infarct(bool), is_sham(bool),
     timepoint, value_op, value, death_pod_op, death_pod, sample_type
   - 예: "코호트 12 SAH 사망" → {"action":"filter","cohort":"12","cod":["SAH"],"reply":"코호트 12에서 SAH로 사망한 개체를 찾습니다."}

5) "stat" — 통계 (수치 한 개)
   - "target": "survival_rate"|"are_rate"|"macro_rate"|"infarct_rate"|"cod_distribution"|"mean_weight"|"mean_sbp"|"count"
   - 그 외 scope 필드 동일
   - 예: "코호트 12 생존율" → {"action":"stat","target":"survival_rate","cohort":"12","reply":"코호트 12의 생존율을 계산합니다."}

6) "get_field" — 단일/소수 개체의 특정 필드
   - "ids" 또는 "rat_id" 필수
   - "field": "cod"|"are"|"weight_latest"|"weight_at_arrival"|"death_date"|"surgery_date"|"general_memo"|"all"
   - 예: "C1201G1 사망원인" → {"action":"get_field","ids":["C1201G1"],"field":"cod","reply":"C1201G1의 사망원인을 알려드릴게요."}

7) "search_memo" — 모든 메모 텍스트 검색 (general/sample/daily/photo)
   - "memo_keyword" 필수
   - 예: "럽쳐 언급된 애" → {"action":"search_memo","memo_keyword":"럽쳐","reply":"메모에 '럽쳐'가 들어간 개체를 찾습니다."}

8) "talk" — 분석 의도가 아닌 일반대화/모름
   - 예: 인사, 모르는 질문 → {"action":"talk","reply":"안녕하세요! 어떤 분석을 도와드릴까요?"}

[ID 규칙]
- 풀네임 "C{코호트2자리}{번호2자리}G{그룹}" 형식. 예 C1201G1.
- 그룹을 모를 땐 G1로 적어 — 프론트 매처가 실제 그룹으로 자동 보정.
- 코호트 7.5 처럼 점이 있을 수 있음. 이때만 "C7.501G1" 형태.

[필드 약속]
- cohort: "12" | ["3","4"] | null
- group: "G1" | ["G1","G2"] | null
- status: "alive" | "dead" | "all"(기본)
- window_pod: [from,to]   예 [0,7]   = POD 0~7일
- window_days: 최근 N일   예 14
- value_op: ">"|">="|"<"|"<="|"=="
- death_pod_op + death_pod: 사망 POD 비교 (예: "수술 후 30일 이내 사망" → death_pod_op:"<", death_pod:30)

[필수 규칙]
1. JSON 객체 1개만. 코드블록·주석·설명 금지.
2. reply는 반드시 포함, 한 줄 한국어.
3. 모호하면 가장 합리적 해석으로 채우고 reply에 그 해석을 명시.
4. 분석 의도가 아니면 action="talk".`;
}


// ===== [5] 메인 송신 ========================================
async function sendAiMessage() {
    const inp = document.getElementById('ai-chat-input');
    const text = inp.value.trim();
    if (!text) return;

    appendMessage('user', escapeHtml(text));
    inp.value = '';

    const loadingId = 'ai-loading-' + Date.now();
    appendMessage('bot',
        `<div class="loader" style="width:15px;height:15px;border-width:2px;display:inline-block;margin-right:5px;vertical-align:middle;"></div> 분석 중...`,
        loadingId);

    try {
        const res = await fetch("https://asia-northeast3-nidd-lab.cloudfunctions.net/askRatAI", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, systemOverride: buildSystemPrompt() })
        });

        const data = await res.json().catch(() => ({}));
        document.getElementById(loadingId)?.remove();

        if (!res.ok) throw new Error(data.detail || data.error || `서버 응답 오류`);

        // AI 응답 파싱
        let parsed;
        try {
            parsed = typeof data.reply === 'string' ? JSON.parse(data.reply) : data.reply;
        } catch (e) {
            // JSON 파싱 실패 → 그냥 텍스트 응답으로 처리
            parsed = { action: 'talk', reply: data.reply || '응답을 이해하지 못했습니다.' };
        }
        console.log("🤖 AI 액션:", parsed);

        // 호환성: 옛 포맷({type:"comparison",groups:...}) 변환
        if (!parsed.action && parsed.type === 'comparison' && parsed.groups) {
            parsed.action = 'compare';
        }
        // 호환성: 옛 포맷({intent:"open_view",view:"compare",params:{groupA,groupB}})
        if (!parsed.action && parsed.intent === 'open_view' && parsed.view === 'compare') {
            parsed.action = 'compare';
            const groups = [];
            if (parsed.params?.groupA?.length) groups.push({ name: 'A군', ids: parsed.params.groupA });
            if (parsed.params?.groupB?.length) groups.push({ name: 'B군', ids: parsed.params.groupB });
            parsed.groups = groups;
        }

        await dispatchAction(parsed);

    } catch (error) {
        console.error(error);
        document.getElementById(loadingId)?.remove();
        appendMessage('bot', `<span style="color:red;">통신 오류: ${escapeHtml(error.message)}</span>`);
    }
}


// ===== [6] 메인 디스패처 (만능 스위치) =======================
async function dispatchAction(spec) {
    const action = spec?.action;
    const reply = spec?.reply || '';

    try {
        switch (action) {
            case 'compare':       return await handleCompare(spec);
            case 'find_max':      return await handleFindExtreme(spec, 'max');
            case 'find_min':      return await handleFindExtreme(spec, 'min');
            case 'rank':          return await handleRank(spec);
            case 'filter':        return await handleFilter(spec);
            case 'stat':          return await handleStat(spec);
            case 'get_field':     return await handleGetField(spec);
            case 'search_memo':   return await handleSearchMemo(spec);
            case 'talk':
            default:
                appendMessage('bot', escapeHtml(reply || '요청을 처리했습니다.'));
                return;
        }
    } catch (e) {
        console.error("dispatchAction 오류:", e);
        appendMessage('bot', `<span style="color:red;">처리 중 오류: ${escapeHtml(e.message)}</span>`);
    }
}


// ===== [7] 스코프/필터 헬퍼 =================================
async function getRatsInScope(spec) {
    const all = await getRatsWithCache();
    let rats = all;

    // 1) 명시적 ID 우선
    if (spec.ids?.length || spec.rat_id) {
        const targetIds = spec.ids?.length ? spec.ids : [spec.rat_id];
        const matched = await smartMatchRatIds(targetIds);
        rats = all.filter(r => matched.includes(r.ratId));
        return rats;
    }

    // 2) cohort 필터
    if (spec.cohort != null) {
        const cs = Array.isArray(spec.cohort) ? spec.cohort.map(String) : [String(spec.cohort)];
        rats = rats.filter(r => cs.includes(String(r.cohort)));
    }

    // 3) group 필터
    if (spec.group != null) {
        const gs = (Array.isArray(spec.group) ? spec.group : [spec.group]).map(g => String(g).toUpperCase());
        rats = rats.filter(r => gs.includes(String(r.group || '').toUpperCase()));
    }

    // 4) status 필터
    if (spec.status === 'alive')      rats = rats.filter(r => r.status !== '사망');
    else if (spec.status === 'dead')  rats = rats.filter(r => r.status === '사망');

    // 5) sham 필터
    if (typeof spec.is_sham === 'boolean') {
        rats = rats.filter(r => Boolean(r.isNonInduction) === spec.is_sham);
    }

    // 6) OVX
    if (typeof spec.has_ovx === 'boolean') {
        rats = rats.filter(r => Boolean(r.ovxDate) === spec.has_ovx);
    }

    return rats;
}

function applyAreFilters(rats, spec) {
    let out = rats;

    if (spec.are_size) {
        const sz = String(spec.are_size).toLowerCase();
        out = out.filter(r => {
            const c = r.areCounts || {};
            const total = (c.micro || 0) + (c.macro || 0) + (c.unk || 0);
            if (sz === 'macro')      return (c.macro || 0) > 0;
            if (sz === 'micro')      return (c.micro || 0) > 0;
            if (sz === 'any')        return total > 0;
            if (sz === 'none')       return total === 0 && r.are && r.are.startsWith('X');
            return true;
        });
    }

    if (spec.are_location?.length) {
        const wantLocs = spec.are_location.map(l => String(l).toUpperCase());
        out = out.filter(r => {
            if (!r.areList?.length) return false;
            return r.areList.some(a => {
                const side = String(a.side || '').toUpperCase();
                const art = String(a.art || '').toUpperCase();
                return wantLocs.some(w => side.includes(w) || art.includes(w) || `${side} ${art}`.includes(w));
            });
        });
    }

    if (typeof spec.has_infarct === 'boolean') {
        out = out.filter(r => {
            const has = (r.mrDates || []).some(m => m.infarctSize && m.infarctSize !== 'None' && m.infarctSize !== '');
            return has === spec.has_infarct;
        });
    }

    return out;
}

function applyCodFilter(rats, spec) {
    if (!spec.cod) return rats;
    const wantList = (Array.isArray(spec.cod) ? spec.cod : [spec.cod])
        .map(c => String(c).toLowerCase());
    return rats.filter(r => {
        const primary = String(r.cod || '').toLowerCase();
        const sec = (r.codSec || []).map(s => String(s).toLowerCase());
        return wantList.some(w => primary.includes(w) || sec.some(s => s.includes(w)));
    });
}

function applyDeathPodFilter(rats, spec) {
    if (!spec.death_pod || !spec.death_pod_op) return rats;
    return rats.filter(r => {
        if (!r.deathDate || !r.surgeryDate) return false;
        const pod = Math.floor((new Date(r.deathDate) - new Date(r.surgeryDate)) / 86400000);
        return cmp(pod, spec.death_pod_op, spec.death_pod);
    });
}

function applySampleFilter(rats, spec) {
    if (!spec.sample_type) return rats;
    return rats.filter(r => String(r.sampleType || '').toLowerCase() === String(spec.sample_type).toLowerCase());
}

function cmp(a, op, b) {
    a = Number(a); b = Number(b);
    if (op === '>')  return a >  b;
    if (op === '>=') return a >= b;
    if (op === '<')  return a <  b;
    if (op === '<=') return a <= b;
    if (op === '==' || op === '=') return a === b;
    return false;
}


// ===== [8] Action handlers ==================================

// --- compare (기존 차트 비교 유지) -----------------
async function handleCompare(spec) {
    let groupsToCompare = [];

    if (spec.groups?.length) {
        for (const g of spec.groups) {
            const ids = await smartMatchRatIds(g.ids || []);
            if (ids.length) groupsToCompare.push({ name: g.name || '그룹', ids });
        }
    }

    if (groupsToCompare.length === 0) {
        appendMessage('bot', `🤔 ${escapeHtml(spec.reply || '')} <br>(비교할 개체를 DB에서 찾지 못했어요.)`);
        return;
    }

    appendMessage('bot', `✅ ${escapeHtml(spec.reply || '비교 차트를 생성합니다.')}`);
    runCustomRatComparison(groupsToCompare);
}

// --- find_max / find_min ---------------------------
async function handleFindExtreme(spec, mode /* 'max'|'min' */) {
    const target = spec.target;
    const limit = Math.max(1, Math.min(20, Number(spec.limit) || 1));

    let rats = await getRatsInScope(spec);
    rats = applyAreFilters(rats, spec);
    rats = applyCodFilter(rats, spec);
    rats = applyDeathPodFilter(rats, spec);

    const scored = await Promise.all(rats.map(async r => {
        const v = await computeMetric(r, target, spec);
        return { rat: r, value: v };
    }));

    const valid = scored.filter(s => s.value != null && !Number.isNaN(s.value));
    if (valid.length === 0) {
        appendMessage('bot', `🔎 조건에 맞는 데이터를 찾지 못했어요. (${escapeHtml(target || '?')})`);
        return;
    }

    valid.sort((a, b) => mode === 'max' ? b.value - a.value : a.value - b.value);
    const top = valid.slice(0, limit);

    const replyMsg = spec.reply ? escapeHtml(spec.reply) : '';
    const html = `
        ${replyMsg ? `<div style="margin-bottom:6px;">${replyMsg}</div>` : ''}
        <div style="font-size:0.85rem; color:#666; margin-bottom:6px;">${mode === 'max' ? '🔺 최대' : '🔻 최소'} <b>${escapeHtml(targetLabel(target))}</b> · 후보 ${valid.length}마리 중 상위 ${top.length}</div>
        ${renderRatList(top, target)}
        ${top.length > 1 ? renderCompareButton(top.map(t => t.rat.ratId)) : ''}
    `;
    appendMessage('bot', html);
}

// --- rank ------------------------------------------
async function handleRank(spec) {
    const sort = (spec.sort || 'desc').toLowerCase();
    const target = spec.target;
    const limit = Math.max(1, Math.min(20, Number(spec.limit) || 5));

    let rats = await getRatsInScope(spec);
    rats = applyAreFilters(rats, spec);
    rats = applyCodFilter(rats, spec);

    const scored = await Promise.all(rats.map(async r => {
        const v = await computeMetric(r, target, spec);
        return { rat: r, value: v };
    }));
    const valid = scored.filter(s => s.value != null && !Number.isNaN(s.value));

    if (valid.length === 0) {
        appendMessage('bot', `🔎 조건에 맞는 데이터를 찾지 못했어요.`);
        return;
    }

    valid.sort((a, b) => sort === 'desc' ? b.value - a.value : a.value - b.value);
    const top = valid.slice(0, limit);

    const html = `
        <div style="margin-bottom:6px;">${escapeHtml(spec.reply || `${targetLabel(target)} ${sort === 'desc' ? '높은' : '낮은'} 순 ${top.length}마리`)}</div>
        ${renderRatList(top, target, true)}
        ${top.length > 1 ? renderCompareButton(top.map(t => t.rat.ratId)) : ''}
    `;
    appendMessage('bot', html);
}

// --- filter ----------------------------------------
async function handleFilter(spec) {
    let rats = await getRatsInScope(spec);
    rats = applyAreFilters(rats, spec);
    rats = applyCodFilter(rats, spec);
    rats = applyDeathPodFilter(rats, spec);
    rats = applySampleFilter(rats, spec);

    // timepoint + value 필터 (예: "W4에서 체중 250 이상")
    if (spec.timepoint && spec.value_op && spec.value != null) {
        const meas = await getAiMeasurements();
        const tp = String(spec.timepoint).toUpperCase();
        const cutoff = Number(spec.value);
        rats = rats.filter(r => {
            const ms = meas.filter(m => m.ratId === r.ratId && String(m.timepoint || '').toUpperCase() === tp);
            return ms.some(m => m.weight != null && cmp(m.weight, spec.value_op, cutoff));
        });
    }

    if (rats.length === 0) {
        appendMessage('bot', `🔎 조건에 맞는 개체가 없어요.`);
        return;
    }

    rats.sort((a, b) => a.ratId.localeCompare(b.ratId));
    const display = rats.slice(0, 30);

    const html = `
        <div style="margin-bottom:6px;">${escapeHtml(spec.reply || '검색 결과')}</div>
        <div style="font-size:0.85rem; color:#666; margin-bottom:6px;">총 <b>${rats.length}</b>마리${rats.length > 30 ? ` (앞 30마리만 표시)` : ''}</div>
        ${renderRatList(display.map(r => ({ rat: r, value: null })), null)}
        ${rats.length > 1 ? renderCompareButton(rats.slice(0, 10).map(r => r.ratId), '상위 10마리 비교 차트로 보기') : ''}
    `;
    appendMessage('bot', html);
}

// --- stat ------------------------------------------
async function handleStat(spec) {
    let rats = await getRatsInScope(spec);
    rats = applyAreFilters(rats, spec);
    rats = applyCodFilter(rats, spec);

    if (rats.length === 0) {
        appendMessage('bot', `🔎 대상 개체가 없어요.`);
        return;
    }

    const target = spec.target;
    let resultLine = '';

    if (target === 'count') {
        resultLine = `<b>${rats.length}</b>마리`;
    }
    else if (target === 'survival_rate') {
        const alive = rats.filter(r => r.status !== '사망').length;
        const pct = (alive / rats.length * 100).toFixed(1);
        resultLine = `생존 <b>${alive}/${rats.length}</b> (<b>${pct}%</b>)`;
    }
    else if (target === 'are_rate') {
        const has = rats.filter(r => {
            const c = r.areCounts || {};
            return (c.micro || 0) + (c.macro || 0) + (c.unk || 0) > 0;
        }).length;
        const pct = (has / rats.length * 100).toFixed(1);
        resultLine = `ARE 발생 <b>${has}/${rats.length}</b> (<b>${pct}%</b>)`;
    }
    else if (target === 'macro_rate') {
        const has = rats.filter(r => (r.areCounts?.macro || 0) > 0).length;
        const pct = (has / rats.length * 100).toFixed(1);
        resultLine = `Macro ARE 발생 <b>${has}/${rats.length}</b> (<b>${pct}%</b>)`;
    }
    else if (target === 'infarct_rate') {
        const has = rats.filter(r =>
            (r.mrDates || []).some(m => m.infarctSize && m.infarctSize !== 'None' && m.infarctSize !== '')
        ).length;
        const pct = (has / rats.length * 100).toFixed(1);
        resultLine = `Infarction 발생 <b>${has}/${rats.length}</b> (<b>${pct}%</b>)`;
    }
    else if (target === 'cod_distribution') {
        const dist = {};
        rats.filter(r => r.status === '사망').forEach(r => {
            const c = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : 'Unknown');
            dist[c] = (dist[c] || 0) + 1;
        });
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        const rows = Object.entries(dist).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<tr><td style="padding:4px 8px;">${escapeHtml(k)}</td><td style="padding:4px 8px; text-align:right;"><b>${v}</b> (${(v / total * 100).toFixed(1)}%)</td></tr>`).join('');
        resultLine = `<table style="margin-top:6px; font-size:0.9rem;"><tr style="background:#f4f6f8;"><th style="padding:4px 8px;">사망원인</th><th style="padding:4px 8px;">건수</th></tr>${rows}</table>`;
    }
    else if (target === 'mean_weight' || target === 'mean_sbp') {
        const meas = await getAiMeasurements();
        const ids = new Set(rats.map(r => r.ratId));
        const key = target === 'mean_weight' ? 'weight' : 'sbp';
        let vals = meas.filter(m => ids.has(m.ratId) && m[key] != null).map(m => Number(m[key]));
        if (spec.timepoint) {
            const tp = String(spec.timepoint).toUpperCase();
            vals = meas.filter(m => ids.has(m.ratId) && m[key] != null && String(m.timepoint || '').toUpperCase() === tp).map(m => Number(m[key]));
        }
        if (vals.length === 0) { resultLine = '데이터 없음'; }
        else {
            const mean = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
            resultLine = `평균 <b>${mean}</b> ${key === 'weight' ? 'g' : 'mmHg'} (n=${vals.length}${spec.timepoint ? ', ' + escapeHtml(spec.timepoint) : ''})`;
        }
    }
    else {
        resultLine = `(미지원 통계: ${escapeHtml(String(target))})`;
    }

    const html = `
        <div style="margin-bottom:6px;">${escapeHtml(spec.reply || '통계 결과')}</div>
        <div style="background:#f4f6f8; padding:10px 14px; border-radius:8px; border-left:3px solid #1565c0;">
            ${resultLine}
        </div>
    `;
    appendMessage('bot', html);
}

// --- get_field -------------------------------------
async function handleGetField(spec) {
    const ids = await smartMatchRatIds(spec.ids?.length ? spec.ids : (spec.rat_id ? [spec.rat_id] : []));
    if (ids.length === 0) {
        appendMessage('bot', `🔎 해당 개체를 찾지 못했어요.`);
        return;
    }
    const all = await getRatsWithCache();
    const target = ids.map(id => all.find(r => r.ratId === id)).filter(Boolean);

    const field = String(spec.field || 'all').toLowerCase();
    const lines = [];

    for (const r of target) {
        let val = '';
        if (field === 'all') {
            val = await formatRatSummary(r);
        } else if (field === 'cod') {
            const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '-');
            const sec = (r.codSec || []).join(', ') || 'None';
            val = `Primary [${cod}] / Secondary [${sec}]`;
        } else if (field === 'are') {
            const summary = r.are || '-';
            const locs = (r.areList || []).map(a => `${a.type}(${a.side || '-'} ${a.art || ''})`.trim()).join(', ');
            val = `${summary}${locs ? ' · ' + locs : ''}`;
        } else if (field === 'weight_latest') {
            const w = await getLatestWeight(r.ratId);
            val = w != null ? `${w}g` : '데이터 없음';
        } else if (field === 'weight_at_arrival') {
            val = r.arrivalAge ? `${r.arrivalAge}주령 도착` : '-';
        } else if (field === 'death_date') {
            val = r.deathDate || '생존 중';
        } else if (field === 'surgery_date') {
            val = r.surgeryDate ? `${r.surgeryDate}${r.isNonInduction ? ' (Sham)' : ''}` : '미수술';
        } else if (field === 'general_memo') {
            val = r.generalMemo ? escapeHtml(r.generalMemo).replace(/\n/g, '<br>') : '메모 없음';
        } else {
            val = `(미지원 필드: ${escapeHtml(field)})`;
        }
        lines.push(`<div style="margin-bottom:8px;"><b>${escapeHtml(r.ratId)}</b> · <span style="color:#1565c0;">${escapeHtml(field)}</span><br><span>${val}</span></div>`);
    }

    appendMessage('bot', `<div style="margin-bottom:6px;">${escapeHtml(spec.reply || '')}</div>${lines.join('')}`);
}

// --- search_memo ------------------------------------
async function handleSearchMemo(spec) {
    const kw = String(spec.memo_keyword || '').trim();
    if (!kw) { appendMessage('bot', '검색어가 비어있어요.'); return; }
    const kwLow = kw.toLowerCase();

    const rats = await getRatsInScope(spec);
    const dailyAll = await getAiDailyLogs();

    const hits = [];
    for (const r of rats) {
        const matches = [];
        if (r.generalMemo && r.generalMemo.toLowerCase().includes(kwLow)) {
            matches.push({ src: 'General', text: r.generalMemo });
        }
        if (r.sampleMemo && r.sampleMemo.toLowerCase().includes(kwLow)) {
            matches.push({ src: 'Sample', text: r.sampleMemo });
        }
        (r.photos || []).forEach(p => {
            if (p.memo && p.memo.toLowerCase().includes(kwLow)) {
                matches.push({ src: `Photo(${p.timepoint || '-'})`, text: p.memo });
            }
        });
        dailyAll.filter(d => d.ratId === r.ratId && d.note && d.note.toLowerCase().includes(kwLow))
            .forEach(d => matches.push({ src: `Daily(${d.date})`, text: d.note }));

        if (matches.length) hits.push({ rat: r, matches });
    }

    if (hits.length === 0) {
        appendMessage('bot', `🔎 메모에 "${escapeHtml(kw)}" 가 들어간 개체가 없어요.`);
        return;
    }

    const cards = hits.slice(0, 15).map(h => {
        const m = h.matches.slice(0, 3).map(x =>
            `<div style="font-size:0.85rem; padding:2px 0;">
                <span style="color:#888;">[${escapeHtml(x.src)}]</span> ${highlightKeyword(x.text, kw)}
            </div>`).join('');
        return `<div style="border-left:3px solid #ff9800; padding:6px 10px; margin-bottom:8px; background:#fff8e1;">
            <a href="javascript:void(0)" onclick="goToDetail('${escapeJs(h.rat.ratId)}')" style="font-weight:bold; color:#1565c0; text-decoration:none;">${escapeHtml(h.rat.ratId)}</a>
            ${m}
        </div>`;
    }).join('');

    appendMessage('bot', `
        <div style="margin-bottom:6px;">${escapeHtml(spec.reply || '')} <span style="color:#666;">(${hits.length}건)</span></div>
        ${cards}
    `);
}


// ===== [9] 지표 계산 (target → 숫자) ========================
async function computeMetric(rat, target, spec) {
    const meas = await getAiMeasurements();
    const ratMeas = meas.filter(m => m.ratId === rat.ratId);

    const surgDate = rat.surgeryDate ? new Date(rat.surgeryDate) : null;
    const filterByPodWindow = (arr) => {
        if (!spec.window_pod || !surgDate) return arr;
        const [from, to] = spec.window_pod;
        return arr.filter(m => {
            if (!m.date) return false;
            const pod = Math.floor((new Date(m.date) - surgDate) / 86400000);
            return pod >= from && pod <= to;
        });
    };
    const filterByRecentDays = (arr) => {
        if (!spec.window_days) return arr;
        const cutoff = Date.now() - spec.window_days * 86400000;
        return arr.filter(m => m.date && new Date(m.date).getTime() >= cutoff);
    };

    const weightSeries = () => {
        let s = ratMeas.filter(m => m.weight != null && m.date).map(m => ({ d: new Date(m.date), v: Number(m.weight) }));
        s = filterByPodWindow(s);
        if (spec.window_days) s = filterByRecentDays(s);
        s.sort((a, b) => a.d - b.d);
        return s;
    };

    if (target === 'weight') {
        const s = weightSeries();
        if (s.length === 0) return null;
        return s[s.length - 1].v;  // 최근 체중 기본
    }
    if (target === 'weight_loss') {
        const s = weightSeries();
        if (s.length < 2) return null;
        const max = Math.max(...s.map(p => p.v));
        const min = Math.min(...s.map(p => p.v));
        return max - min;
    }
    if (target === 'weight_loss_recent') {
        const days = Number(spec.window_days) || 14;
        const all = ratMeas.filter(m => m.weight != null && m.date)
            .map(m => ({ d: new Date(m.date), v: Number(m.weight) }))
            .sort((a, b) => a.d - b.d);
        if (all.length < 2) return null;
        const last = all[all.length - 1];
        const cutoff = last.d.getTime() - days * 86400000;
        const window = all.filter(p => p.d.getTime() >= cutoff);
        if (window.length < 2) return null;
        const peak = Math.max(...window.map(p => p.v));
        return peak - last.v;  // 최근 N일 내 피크 대비 현재 체중 감소량 (양수)
    }
    if (target === 'weight_gain') {
        const s = weightSeries();
        if (s.length < 2) return null;
        return s[s.length - 1].v - s[0].v;
    }
    if (target === 'sbp' || target === 'dbp' || target === 'mean_bp') {
        const key = target === 'mean_bp' ? 'mean' : target;
        let vals = ratMeas.filter(m => m[key] != null);
        vals = filterByPodWindow(vals);
        if (spec.window_days) vals = filterByRecentDays(vals);
        if (spec.timepoint) {
            const tp = String(spec.timepoint).toUpperCase();
            vals = vals.filter(m => String(m.timepoint || '').toUpperCase() === tp);
        }
        if (vals.length === 0) return null;
        return Math.max(...vals.map(m => Number(m[key])));  // 최댓값 기본
    }
    if (target === 'score') {
        const daily = await getAiDailyLogs();
        const ds = daily.filter(d => d.ratId === rat.ratId);
        if (ds.length === 0) return null;
        return Math.min(...ds.map(d => Number(d.totalScore || 15)));  // 최저점이 가장 안 좋은 상태
    }
    if (target === 'pod_survival') {
        if (!rat.deathDate || !rat.surgeryDate) return null;
        return Math.floor((new Date(rat.deathDate) - new Date(rat.surgeryDate)) / 86400000);
    }
    if (target === 'age_at_death') {
        if (!rat.deathDate || !rat.arrivalDate) return null;
        const arrAge = Number(rat.arrivalAge) || 6;
        return arrAge + (new Date(rat.deathDate) - new Date(rat.arrivalDate)) / (1000 * 60 * 60 * 24 * 7);
    }
    return null;
}

async function getLatestWeight(ratId) {
    const meas = await getAiMeasurements();
    const ms = meas.filter(m => m.ratId === ratId && m.weight != null && m.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return ms.length ? Number(ms[0].weight) : null;
}


// ===== [10] 렌더 헬퍼 =======================================
function targetLabel(target) {
    const map = {
        weight: '체중', weight_loss: '체중 감소량', weight_loss_recent: '최근 체중 감소',
        weight_gain: '체중 증가량', sbp: 'SBP', dbp: 'DBP', mean_bp: 'Mean BP',
        score: '데일리 점수', pod_survival: '수술 후 생존일수', age_at_death: '사망 시 주령'
    };
    return map[target] || target || '값';
}

function formatValue(target, v) {
    if (v == null) return '-';
    if (target === 'weight' || target === 'weight_loss' || target === 'weight_loss_recent' || target === 'weight_gain') {
        return `${Number(v).toFixed(0)}g`;
    }
    if (target === 'sbp' || target === 'dbp' || target === 'mean_bp') {
        return `${Number(v).toFixed(0)} mmHg`;
    }
    if (target === 'pod_survival') return `${Number(v).toFixed(0)}일`;
    if (target === 'age_at_death') return `${Number(v).toFixed(1)}w`;
    if (target === 'score') return `${Number(v).toFixed(0)}점`;
    return String(v);
}

function renderRatList(scoredArr, target, showRank = false) {
    return scoredArr.map((s, i) => {
        const r = s.rat;
        const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '');
        const are = r.are || '';
        const valStr = (s.value != null && target) ? formatValue(target, s.value) : '';
        return `<div style="border-left:3px solid #1565c0; padding:6px 10px; margin-bottom:6px; background:#f4f6f8; border-radius:4px;">
            ${showRank ? `<span style="color:#666; font-size:0.85rem;">#${i + 1}</span> ` : ''}
            <a href="javascript:void(0)" onclick="goToDetail('${escapeJs(r.ratId)}')" style="font-weight:bold; color:#1565c0; text-decoration:none;">${escapeHtml(r.ratId)}</a>
            ${valStr ? ` <span style="color:#c62828; font-weight:bold;">${escapeHtml(valStr)}</span>` : ''}
            <div style="font-size:0.8rem; color:#666; margin-top:2px;">
                ${escapeHtml(r.status || '-')} ${cod ? `· ${escapeHtml(cod)}` : ''} ${are ? `· ARE ${escapeHtml(are)}` : ''}
            </div>
        </div>`;
    }).join('');
}

function renderCompareButton(ids, label = '이 개체들 비교 차트로 보기') {
    const idsStr = ids.join(',');
    return `<button onclick="aiTriggerCompareFromIds('${escapeJs(idsStr)}')"
        style="margin-top:6px; background:var(--navy); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">
        📊 ${escapeHtml(label)}
    </button>`;
}

window.aiTriggerCompareFromIds = function(idsCsv) {
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    runCustomRatComparison([{ name: 'AI 선택군', ids }]);
};

async function formatRatSummary(r) {
    const cod = r.cod || (r.codFull ? extractLegacyCod(r.codFull) : '-');
    const sec = (r.codSec || []).join(', ') || 'None';
    const lw = await getLatestWeight(r.ratId);
    return `Status: ${escapeHtml(r.status || '-')}${r.deathDate ? ` (${escapeHtml(r.deathDate)})` : ''}<br>
        COD: Primary [${escapeHtml(cod)}] / Secondary [${escapeHtml(sec)}]<br>
        ARE: ${escapeHtml(r.are || '-')}<br>
        Surgery: ${escapeHtml(r.surgeryDate || '-')}${r.isNonInduction ? ' (Sham)' : ''}<br>
        Latest WT: ${lw != null ? lw + 'g' : '-'}<br>
        ${r.generalMemo ? `Memo: ${escapeHtml(r.generalMemo).slice(0, 200).replace(/\n/g, '<br>')}` : ''}`;
}

function highlightKeyword(text, kw) {
    if (!text) return '';
    const safe = escapeHtml(text);
    const safeKw = escapeHtml(kw);
    const re = new RegExp(safeKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return safe.replace(re, m => `<mark style="background:#ffeb3b; padding:0 2px;">${m}</mark>`);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function escapeJs(s) { return String(s ?? '').replace(/'/g, "\\'"); }


// ===== [11] 차트 렌더 엔진 (기존 그대로) ====================
async function runCustomRatComparison(parsedGroups) {
    go('compare');

    const container = document.getElementById('comp-res-area');
    if (!container) return alert("결과 표시 영역을 찾을 수 없습니다.");

    container.innerHTML = '<div class="loader"></div> AI가 지목한 랫드 데이터를 불러오는 중...';

    try {
        const allRats = await getRatsWithCache();
        const colors = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4'];

        const groupsData = parsedGroups.map((g, idx) => {
            const matched = allRats.filter(r => g.ids.includes(r.ratId));
            return { name: g.name, color: colors[idx % colors.length], rats: matched };
        });

        container.innerHTML = '';

        if (typeof renderUnifiedTimeline === 'function') {
            renderUnifiedTimeline(groupsData, container);
        }

        for (let i = 0; i < groupsData.length; i++) {
            const g = groupsData[i];
            const divId = `ai-comp-res-${i}`;
            const colDiv = document.createElement('div');
            colDiv.className = 'comp-col';
            colDiv.id = divId;
            container.appendChild(colDiv);

            const title = `🤖 [AI] ${g.name} (${g.rats.length}마리)`;
            if (typeof runRatListAnalysis === 'function') {
                await runRatListAnalysis(g.rats, divId, `_ai_${i}`, title);
            } else {
                colDiv.innerHTML = "분석 함수(runRatListAnalysis)를 찾을 수 없습니다.";
            }
        }

        container.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("AI 렌더 오류:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">차트 생성 중 오류: ${error.message}</p>`;
    }
}
