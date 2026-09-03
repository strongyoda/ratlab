---
name: Rat Lab Manager Pro
description: 실험 기록지(Lab Record Sheet) — 잉크 괘선과 NCR 스톡 컬러로 구획된, 오늘 날짜가 스탬프된 한 장의 기록지
colors:
  ink: "#23282E"
  paper: "#FAF9F5"
  sheet: "#FFFFFF"
  rule: "#D8D4C6"
  ink-soft: "#5B5F66"
  stamp: "#C9252D"
  approve: "#2F6B3A"
  ink-blue: "#2B5F8A"
  stock-canary: "#F2C230"
  stock-canary-soft: "#FAF0CE"
  stock-pink: "#E8798A"
  stock-pink-soft: "#F9E4E7"
  stock-blue-soft: "#E7EFF6"
  stock-green-soft: "#E5EEDF"
typography:
  title:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.14em"
  measurement:
    fontFamily: "'Azeret Mono', 'Consolas', monospace"
    fontWeight: 700
    letterSpacing: "-0.02em"
rounded:
  sheet: "2px"
spacing:
  cell: "8px"
  card-y: "1.4rem"
  card-x: "1.5rem"
  gutter: "14px"
components:
  button-stamp-primary:
    backgroundColor: "{colors.ink-blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sheet}"
    padding: "0.5rem 1rem"
  button-stamp-approve:
    backgroundColor: "{colors.approve}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sheet}"
  button-stamp-danger:
    backgroundColor: "{colors.stamp}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sheet}"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  ledger-cell:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "1.4rem 1.5rem"
  input-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "0.8rem"
  face-instruction-inverted:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
  face-warning:
    backgroundColor: "{colors.stock-pink-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  face-caution:
    backgroundColor: "{colors.stock-canary-soft}"
    textColor: "#7A5C00"
    rounded: "{rounded.sheet}"
---

# Design System: Rat Lab Manager Pro

## Overview

**Creative North Star: "실험 기록지 (The Lab Record Sheet)"**

앱 전체가 잘 만든 GLP 실험 기록지 한 장이다. 화면은 카드 더미가 아니라 이어진 시트이고, 구획은 그림자가 아닌 잉크 괘선(1px 가는 괘선, 2px 잉크선, 3px 이중선)으로 한다. 상태는 NCR 카본지 스톡 컬러가 면 전체를 소유하는 것으로 말하고, 강조는 스탬프 레드 단 하나다. 측정 숫자는 전부 표형(tabular) 모노로 정렬되어 원장(ledger)처럼 읽힌다. 흐린 그림자 위에 흰 카드가 떠 있는 SaaS 관리자 배열을 명시적으로 거부한다.

라이트 장면이 강제된 세계다(동물실 밝은 조명 + 데스크탑 사무 조명). UI는 한국어이고, 밀도는 문서 밀도 — 여백으로 호흡하지 않고 괘선으로 호흡한다. 현재 이 세계를 완전히 입은 표면은 대시보드 + 앱 셸(헤더·탭·로그인·AI 챗)이며, 나머지 화면은 레거시 토큰 리매핑(`--navy`→`--ink`, `--red`→`--stamp`, `--bg`→`--paper` 등)을 통해 색만 물려받고 있다. 신규·개편 화면은 이 문서의 문법을 따른다.

**Key Characteristics:**
- 그림자 0 — 구획은 잉크 괘선과 이중 괘선으로만
- NCR 스톡 컬러는 칩이 아니라 면(face) 전체를 소유
- 강조 하나 — 스탬프 레드 #C9252D
- 측정 숫자는 Azeret Mono 표형 숫자, UI 본문은 Pretendard
- 모서리는 각지거나 2px
- 완료·날짜는 스탬프처럼 찍힌다(stamp-in 0.18s)

## Colors

한 장의 백지 위에 문서 잉크, 그리고 NCR 카본지의 스톡 컬러 — 팔레트 전체가 서류 재질에서 나온다.

### Primary
- **스탬프 레드** (#C9252D, `--stamp`): 유일한 강조 수단. 로고타입의 "Pro", 위험 버튼, 이상 개체의 감소율 수치, 탭 닫기 ×. 희소해야 스탬프다 — 화면당 극소량.

### Secondary
- **승인 그린** (#2F6B3A, `--approve`): 승인·완료 스탬프. "오늘 입력이 모두 끝났습니다" 스탬프 테두리, 완료 수치, 저장 버튼.
- **잉크 블루** (#2B5F8A, `--ink-blue`): 액션·링크의 잉크. 주 이동 버튼, 포커스 링, 정보 면의 테두리.

### Tertiary — NCR 스톡 컬러 (면 전용)
- **카나리** (#F2C230 진한 / #FAF0CE 연한, `--stock-canary`, `--stock-canary-soft`): 주의·진행. 텍스트 선택 하이라이트, 주의 경보의 면, 반전 면 위의 핵심 수치 색.
- **카본핑크** (#E8798A / #F9E4E7, `--stock-pink`, `--stock-pink-soft`): 경고·이상. 이상 개체 행의 면, 레드 경보의 면. 진한 값은 테두리, 연한 값은 면.
- **스톡 블루** (#E7EFF6, `--stock-blue-soft`): 정보·조제 구역의 면.
- **스톡 그린** (#E5EEDF, `--stock-green-soft`): 이상 없음·투약 시작의 면.

### Neutral
- **문서 잉크** (#23282E, `--ink`): 본문 텍스트, 굵은 괘선, 반전 면의 배경, 사이드바 배경.
- **흐린 잉크** (#5B5F66, `--ink-soft`): 보조 텍스트, 설명 문장, 비활성 탭.
- **기록지 백지** (#FAF9F5, `--paper`): 페이지 배경, 조용한 버튼의 면.
- **낱장 시트** (#FFFFFF, `--sheet`): 카드·시트·헤더·입력 필드의 면.
- **가는 괘선** (#D8D4C6, `--rule`): 셀 경계, 행 구분선, 조용한 테두리.
- **면 위 잉크 파생값**: 카나리 면 위 텍스트 #7A5C00 / #6B571C, 핑크 면 위 텍스트 #7C2A30 — soft 면 위에서 대비를 지키는 어두운 잉크.

### Named Rules
**The One Stamp Rule.** 강조 수단은 스탬프 레드 하나다. 두 번째 강조색을 만들지 않는다. 그린과 블루는 강조가 아니라 기능(승인·액션)이다.

**The Full Face Rule.** 스톡 컬러는 칩·배지·점이 아니라 면 전체를 소유한다. soft 값이 배경, 진한 값이 1px 테두리, 텍스트는 그 면의 어두운 잉크 파생값.

**The Legacy Remap Rule.** 옛 토큰명(`--navy` `--red` `--green` `--blue` `--bg`)은 새 값으로 리매핑되어 있다. 새 코드는 새 토큰명(`--ink` `--stamp` `--approve` `--ink-blue` `--paper`)을 직접 쓴다.

## Typography

**Body Font:** Pretendard Variable (Noto Sans KR, Apple SD Gothic Neo 폴백) — `--font-ui`
**Measurement/Mono Font:** Azeret Mono (Consolas 폴백) — `--font-mono`, weights 400/600/700

**Character:** 한국어 문서체와 계기판 모노의 짝. Pretendard가 기록지의 서술을, Azeret Mono가 원장의 숫자 칸을 맡는다. `body`에 `font-variant-numeric: tabular-nums`가 전역 적용되어 어떤 숫자든 표처럼 정렬된다.

### Hierarchy
- **Logotype** (900, 1.15rem, letter-spacing -0.02em): 헤더의 "RLM Pro" — Pro만 스탬프 레드.
- **Title / 섹션 제목** (800, 1.05rem, letter-spacing -0.01em): `.section-title` 및 카드 h4 — 항상 3px 이중 괘선(`border-bottom: 3px double var(--ink)`, padding-bottom 6px)을 깔고 앉는다.
- **Body** (400–700, 0.85–0.9rem, line-height 1.65): 서술 텍스트. 항목 이름은 700.
- **Label / 스탬프 라벨** (700, 0.66–0.78rem, letter-spacing 0.1–0.16em): "DAILY RECORD", "조제 지시 · 사육실 가기 전" 같은 서류 양식 라벨. 흐린 잉크색.
- **Measurement** (Azeret Mono 600–700, 0.8–1.3rem, letter-spacing -0.02em): 개체 수·용량·감소율·D-day — 측정값이면 크기와 무관하게 `.mono`.

### Named Rules
**The Mono Measurement Rule.** 측정된 숫자(마리 수, mL, g, %, 날짜, POD)는 예외 없이 `.mono`(Azeret Mono, tabular)다. 단위와 조사("마리", "/마리·일")는 `--font-ui`로 되돌린다.

**The Double Rule Title Rule.** 섹션 제목은 3px 이중 괘선 위에 선다. 제목 크기를 키우는 대신 괘선의 격으로 위계를 만든다.

## Layout

한 장의 이어진 시트. 대시보드는 `.db-sheet` — 흰 시트에 1px `--rule` 테두리, 상단 3px 이중 잉크선 — 이고 내부 카드들은 테두리·마진을 잃고 2px 잉크 괘선으로만 서로 구획된다(`.db-sheet .card { border-bottom: 2px solid var(--ink) }`). 시트 밖 일반 카드는 1px `--rule` 테두리에 14px 아래 간격.

- 헤더 60px 고정, 아래 2px 잉크선. 사이드바 260px, 잉크색 배경, 왼쪽에서 슬라이드.
- 본문 컨테이너는 전폭(`max-width:100%`), 탭 내부 패딩 20px. 카드 내부 패딩 1.4rem 1.5rem.
- 행 리듬: 원장 행은 `padding: 8px 0` + `border-bottom: 1px solid var(--rule)`. 2열 배치는 `flex; gap:14px; min-width:340px`으로 좁으면 세로로 접힌다.
- 터치 타깃: `.db-tap` 최소 34px, coarse pointer에서 44px(장갑 낀 손 기준). 클릭 요소는 div onclick이 아니라 진짜 `<button>`을 글줄처럼 리셋해 쓴다(`.db-btn`).
- 모바일(≤768px): 다열 컨테이너는 세로 적층.

미해결 후속(빌드가 안고 있는 것): 살펴볼 개체/섭취량 점검의 2열 구역 사이에 세로 `--rule` 구분선이 없다 — 다음 손질에서 추가.

## Elevation & Depth

그림자를 쓰지 않는다. 카드·버튼·FAB·챗 창 전부 `box-shadow: none`. 깊이는 괘선의 격(1px 가는 괘선 < 2px 잉크선 < 3px 이중선)과 면의 반전(잉크 면 위 백지 글자)으로 만든다. 입력 필드 포커스만 예외적으로 `box-shadow: 0 1px 0 0 var(--ink)` — 그림자가 아니라 밑줄이 두꺼워지는 잉크 표현이다. 눌림은 그림자 대신 `transform: translateY(1px)`.

### Named Rules
**The No Shadow Rule.** 어떤 표면도 떠 있지 않다. 구획이 필요하면 괘선을, 위계가 필요하면 더 굵은 괘선이나 반전 면을 쓴다.

## Shapes

각지거나 2px. 카드·버튼·셀·스탬프 박스·FAB·챗 창 모두 `border-radius: 2px`. 시트 안 카드는 0. 앱 탭은 위 모서리만 2px(`2px 2px 0 0`)로 바인더에서 펼쳐진 낱장 모양 — 활성 탭은 `--paper` 면에 잉크 테두리, 비활성은 투명. 날짜 스탬프는 2px 잉크 테두리 박스, 완료 스탬프는 2px `--approve` 테두리 박스. 대기 상태는 실선 대신 1px dashed `--rule`(아직 안 찍힌 칸). 원·알약형은 이 세계의 형태가 아니다.

## Components

### Buttons — 스탬프
평평하고 각지고, 누르면 눌린다.
- **Shape:** 2px radius, 테두리 없음, 그림자 없음, 굵은 글자(700).
- **Primary(액션):** `--ink-blue` 면 + 흰 글자. **승인/저장:** `--approve`. **위험:** `--stamp`.
- **조용한 버튼:** `--paper` 면 + 잉크 글자 + `outline: 1px solid var(--rule)`.
- **Hover / Active:** `filter: brightness(1.08)` / `transform: translateY(1px)` — 스탬프가 눌리는 감각.
- **Focus:** `outline: 2px solid var(--blue); outline-offset: 2px`.

### Ledger Cells — 태그는 칩이 아니라 원장 셀
- **Style:** `--sheet` 면 + `1px solid var(--ink)` 테두리 + 2px radius + `.mono` 600, `padding: 3px 9px`. 텍스트 색으로 의미를 구분(잉크 블루=입력 대기, 승인 그린=투약, #7A5C00=주의).
- 대기·미정 상태 셀은 1px dashed `--rule` 테두리.
- 알약형 배경색 칩은 금지 — 색이 필요하면 면(face) 전체로 격상한다.

### Cards / Containers — 기록지 낱장
- **Corner:** 2px. **Background:** `--sheet`. **Border:** 1px `--rule`; 시트 안에서는 2px 잉크 괘선으로만 구획. **Shadow:** 없음. **Padding:** 1.4rem 1.5rem.
- **상태 면(face) 카드:** 경고 면은 `--stock-pink-soft` 배경 + `--stock-pink` 1px 테두리, 주의 면은 `--stock-canary-soft` + #E3C55C, 이상 없음 면은 `--stock-green-soft` + `--approve` 테두리.
- **반전 지시 면:** 사육실 가기 전 조제 지시는 잉크(#23282E) 면 전체 + 백지 글자, 핵심 수치는 카나리색 `.mono` 1.3rem. 데이터 준비 전에는 `--paper` 면 + 1px dashed 테두리의 회색 상태로 대기.

### Inputs / Fields
- **Style:** `--sheet` 면, 1px #C9C5B8 테두리, 2px radius, 0.8rem 패딩.
- **Focus:** 테두리가 잉크색으로 + `box-shadow: 0 1px 0 0 var(--ink)`(잉크 밑줄 강화). 글로우 없음.

### Navigation
- **헤더:** 흰 시트, 아래 2px 잉크선, MENU 버튼은 1px 잉크 테두리 박스, 로고 "RLM Pro"(Pro만 스탬프 레드).
- **앱 탭:** 펼쳐진 낱장 — 활성은 `--paper` 면·잉크 테두리·700, 비활성은 투명·흐린 잉크. 닫기 ×는 스탬프 레드.
- **사이드바:** 잉크색 면, 섹션 라벨은 0.74rem·letter-spacing 0.12em·반투명 흰색, 항목은 rgba(255,255,255,0.7).

### Date Stamp / Completion Stamp (signature)
2px 잉크(또는 `--approve`) 테두리 박스, 위에 letter-spaced 라벨("DAILY RECORD"), 아래 `.mono` 700 값. 등장할 때 `.stamp-in`(0.18s, scale 1.3→0.96→1, -1deg 회전) — 도장이 찍히는 순간. `prefers-reduced-motion`에서는 애니메이션 제거.

### Ledger Fold (signature)
섭취량 근거 행의 접기: `grid-template-rows 0fr→1fr`, 0.28s `cubic-bezier(0.16,1,0.3,1)`. 헤더는 진짜 button + `aria-expanded`, 캐럿은 인라인 SVG chevron(글리프 아이콘 아님) 180° 회전. 펼쳐진 내용에 `.stamp-in` 재적용으로 수치가 찍히듯 등장.

## Do's and Don'ts

### Do:
- **Do** 구획은 괘선으로 — 가는 경계 1px `--rule`, 구역 경계 2px `--ink`, 섹션 제목 3px double `--ink`.
- **Do** 측정 숫자는 전부 `.mono`(Azeret Mono, tabular)로, 단위·조사는 `--font-ui`로.
- **Do** 상태색이 필요하면 스톡 컬러 면 전체(soft 배경 + 진한 1px 테두리 + 어두운 잉크 파생 텍스트)로.
- **Do** 태그는 원장 셀(흰 면 + 잉크 테두리 + 모노)로, 대기 상태는 dashed 테두리로.
- **Do** 모서리는 2px, 버튼 눌림은 `translateY(1px)`, 완료·날짜 등장은 `.stamp-in`.
- **Do** 클릭 요소는 진짜 `<button>` + `:focus-visible` 2px 아웃라인, coarse pointer에서 44px 타깃.
- **Do** 새 코드는 새 토큰명(`--ink` `--stamp` `--approve` `--ink-blue` `--paper` `--rule`)을 직접 참조.

### Don't:
- **Don't** 그림자로 카드를 띄우지 않는다 — `box-shadow: none`이 기본이고, 유일한 예외는 입력 포커스의 1px 잉크 밑줄이다.
- **Don't** 스탬프 레드 외의 강조색을 만들지 않는다. 색 배경의 알약형 칩·배지를 만들지 않는다.
- **Don't** 4px 이상 radius, 원형 버튼, 알약형 입력을 새로 만들지 않는다(레거시 화면의 8–12px는 아직 안 갈아입은 잔재다).
- **Don't** 다크 장면을 만들지 않는다 — 라이트 장면이 강제된 세계다(잉크 반전 면은 장면이 아니라 지시 면 하나의 재질이다).
- **Don't** 현장 입력 화면(케이지별 입력)의 버튼 위치·순서·크기를 바꾸지 않는다. 빌드 단계 도구를 전제하지 않는다(GitHub 웹 커밋만).
- **Don't** 인터랙티브가 아닌 상태 표시에 잉크 블루 텍스트를 새로 쓰지 않는다 — 링크색과 충돌한다. 코호트 단계 'on' 토큰이 현재 이렇게 되어 있고(빌드가 안고 있는 미해결 후속), 대체는 잉크 문법의 테두리 변형(solid/dashed/double)이다.
