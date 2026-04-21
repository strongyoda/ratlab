// 1. 로그인 전에는 무조건 숨기기 (초기화)
document.addEventListener("DOMContentLoaded", () => {
    const aiFab = document.getElementById('ai-chat-fab');
    const aiWindow = document.getElementById('ai-chat-window');
    if(aiFab) aiFab.style.display = 'none';
    if(aiWindow) aiWindow.style.display = 'none';
});

// 2. 파이어베이스 로그인 상태에 따른 자동 표시/숨김
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

// 3. 채팅창 열고 닫기
function toggleAiChat() {
    const chatWin = document.getElementById('ai-chat-window');
    if(chatWin) {
        chatWin.style.display = chatWin.style.display === 'none' ? 'flex' : 'none';
    }
}

// 4. 메시지 추가 함수 (🔥반드시 innerHTML 이어야 로딩바가 그림으로 나옵니다!)
function appendMessage(sender, text, id = null) {
    const box = document.getElementById('ai-chat-messages');
    if(!box) return;
    
    const div = document.createElement('div');
    div.className = sender === 'user' ? 'msg-user' : 'msg-bot';
    if(id) div.id = id;
    
    div.innerHTML = text; // innerText 절대 금지!
    
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// 5. 쥐 ID 스마트 매칭 함수 (위험한 대충 검색 제거, 엄격한 C0000 코어 매칭)
async function smartMatchRatIds(aiProvidedIds) {
    if(!aiProvidedIds || !Array.isArray(aiProvidedIds)) return [];
    const allRats = await getRatsWithCache(); 
    const matched = [];
    
    aiProvidedIds.forEach(id => {
        const cleanId = String(id).toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // 무조건 'C' + 숫자 4자리 (예: C1201) 포맷만 추출합니다.
        const coreMatch = cleanId.match(/C\d{4}/);
        
        if (coreMatch) {
            const coreId = coreMatch[0]; // "C1205"
            // DB에서 "C1205"로 시작하는 쥐를 찾음 (G1, G2 상관없이 본체 번호로 100% 매칭)
            const found = allRats.find(r => r.ratId.startsWith(coreId));
            if(found && !matched.includes(found.ratId)) {
                matched.push(found.ratId);
            }
        } else {
            console.warn(`⚠️ AI가 잘못된 포맷의 ID를 줬습니다 무시함: ${id}`);
        }
    });
    return matched;
}

// 6. 메인 챗봇 전송 함수 (구형 백엔드 응답 완벽 호환 모드)
async function sendAiMessage() {
    const inp = document.getElementById('ai-chat-input');
    const text = inp.value.trim();
    if (!text) return;

    appendMessage('user', text);
    inp.value = '';

    const loadingId = 'ai-loading-' + Date.now();
    // 따옴표 오류 방지를 위해 백틱(`) 사용
    appendMessage('bot', `<div class="loader" style="width:15px; height:15px; border-width:2px; display:inline-block; margin-right:5px; vertical-align:middle;"></div> AI가 분석 중입니다...`, loadingId);

    try {
        // 🔥 프롬프트 초강력 업데이트! (sendAiMessage 함수 내부 fetch 부분)
        const res = await fetch("https://asia-northeast3-nidd-lab.cloudfunctions.net/askRatAI", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                systemOverride: `너는 실험 랫드 데이터 분석가야. 사용자의 요청을 분석해서 아래 JSON 형식으로만 대답해.
                [🚨 절대 엄수 규칙]
                1. 사용자가 언급한 모든 쥐의 ID를 하나도 빠짐없이 배열에 채워 넣어라 (1~12번이면 12개 다 적을 것).
                2. 쥐 ID는 무조건 'C' + 코호트2자리 + 번호2자리 + 'G1' 형식의 풀네임으로 적어라. 절대 "01", "1번" 처럼 번호만 적지 마라.
                   (예: 사용자가 "C12의 1번부터 3번"이라 하면 ["C1201G1", "C1202G1", "C1203G1"] 로 출력)
                3. 마크다운(\`\`\`json) 쓰지 말고 순수 JSON만 출력해.
                
                [출력 형식]
                {"type": "comparison", "groups": [{"name": "A군", "ids": ["C1201G1", "C1202G1"]}, {"name": "B군", "ids": ["C1221G1", "C1222G1"]}]}`
            })
        });

        const data = await res.json().catch(() => ({}));
        document.getElementById(loadingId)?.remove();

        if (!res.ok) throw new Error(data.detail || data.error || `서버 응답 오류`);

        // AI 결과 JSON 파싱 (이 부분에 console.log 추가!)
        let aiResult;
        try {
            aiResult = typeof data.reply === 'string' ? JSON.parse(data.reply) : data.reply;
            console.log("🤖 AI가 만든 원본 데이터:", aiResult); // <--- 이 줄 추가!
        } catch (e) {
            // ...
            aiResult = { reply: data.reply };
        }

        // 🔥 구형 백엔드의 intent/params를 신형 엔진으로 넘겨주는 브릿지 로직
        const intent = aiResult.intent || aiResult.type || '';
        const params = aiResult.params || {};
        const isCompareRequest = (intent === 'open_view' && aiResult.view === 'compare') || intent === 'comparison';

        if (isCompareRequest) {
            let groupsToCompare = [];
            
            // 1) 백엔드가 params.groupA (구형 포맷)으로 줬을 때 가로채서 매칭
            if (params.groupA || params.groupB) {
                if (params.groupA && params.groupA.length > 0) {
                    const idsA = await smartMatchRatIds(params.groupA);
                    if(idsA.length > 0) groupsToCompare.push({ name: "A군", ids: idsA });
                }
                if (params.groupB && params.groupB.length > 0) {
                    const idsB = await smartMatchRatIds(params.groupB);
                    if(idsB.length > 0) groupsToCompare.push({ name: "B군", ids: idsB });
                }
            } 
            // 2) 신형 포맷으로 올 때
            else if (aiResult.groups && aiResult.groups.length > 0) {
                groupsToCompare = aiResult.groups;
            }

            if (groupsToCompare.length > 0) {
                appendMessage('bot', `✅ 분석 완료! 비교 차트를 생성합니다.`);
                // 7번에 있는 차트 생성 함수 호출
                runCustomRatComparison(groupsToCompare);
            } else {
                appendMessage('bot', `🤔 ${aiResult.reply} (비교할 쥐의 정확한 데이터를 DB에서 찾지 못했습니다.)`);
            }
        } else {
            // 일반 대화
            appendMessage('bot', aiResult.reply || '요청을 처리했습니다.');
        }

    } catch (error) {
        console.error(error);
        document.getElementById(loadingId)?.remove();
        appendMessage('bot', `<span style="color:red;">통신 중 문제가 발생했어요.<br>${error.message}</span>`);
    }
}

// 7. 차트 렌더링 엔진 (이전 3단계 코드 - 이 파일 안에 두는 것이 가장 안전합니다)
async function runCustomRatComparison(parsedGroups) {
    go('compare'); // 코호트 비교 탭으로 자동 이동
    
    const container = document.getElementById('comp-res-area');
    if (!container) return alert("결과를 표시할 화면 영역을 찾을 수 없습니다.");
    
    container.innerHTML = '<div class="loader"></div> AI가 지목한 랫드 데이터를 불러오고 있습니다...';

    try {
        const allRats = await getRatsWithCache();
        const colors = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4'];
        
        const groupsData = parsedGroups.map((g, idx) => {
            const matchedRats = allRats.filter(r => g.ids.includes(r.ratId));
            return { name: g.name, color: colors[idx % colors.length], rats: matchedRats };
        });

        container.innerHTML = '';
        
        // 1. 상단 타임라인 렌더링 (chart.js 내장 함수 활용)
        if(typeof renderUnifiedTimeline === 'function') {
            renderUnifiedTimeline(groupsData, container);
        }

        // 2. 그룹별 세로 차트 렌더링 (chart.js 내장 함수 활용)
        for (let i = 0; i < groupsData.length; i++) {
            const g = groupsData[i];
            const divId = `ai-comp-res-${i}`;
            const colDiv = document.createElement('div');
            colDiv.className = 'comp-col';
            colDiv.id = divId;
            container.appendChild(colDiv);
            
            const title = `🤖 [AI 자동 분류] ${g.name} (${g.rats.length}마리)`;
            
            // chart.js에 있는 만능 분석 함수 호출
            if(typeof runRatListAnalysis === 'function') {
                await runRatListAnalysis(g.rats, divId, `_ai_${i}`, title);
            } else {
                colDiv.innerHTML = "분석 함수(runRatListAnalysis)를 찾을 수 없습니다.";
            }
        }
        
        container.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("AI 렌더링 엔진 오류:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">차트를 그리는 중 오류가 발생했습니다.<br>${error.message}</p>`;
    }
}