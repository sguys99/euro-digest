---
description: 디자인 게이트(D0~D3) 시안 2~3개를 정적 HTML로 만들고 375/1280 × 라이트/다크 스크린샷·비교표·추천안을 제시한 뒤 사용자 선택을 기다린다 — 구현하지 않는다 (DR-00)
argument-hint: "<게이트 — d0 | d1 | d2 | d3>"
---

# /design-concepts — 디자인 시안 제작 (구현 금지)

게이트: **$0**

목적: CLAUDE §4 절차 ①~⑥ 중 **①범위 정리 → ②시안 2~3개 → ③제시·선택 요청까지만** 하고 멈춘다. DESIGN.md·`globals.css`·`src/` 구현(④ 이후)은 선택 뒤 별도 작업이다.
근거: CLAUDE.md §1-1·§1-2·§1-6·§4·§11 · PRD DR-00~DR-12·§6.2 · plan §5(D0)·§7(D1)·§9(D2)·§12(D3)·§3 U-10

## 현재 상태 (M0-08 초안)
- 진행 위치: !`grep -m1 '다음 작업' docs/plan.md || true`
- fixtures: !`ls fixtures fixtures/*/ 2>/dev/null | head -30 || true`
- 기존 시안·폰트: !`ls -R docs/design 2>/dev/null | head -30 || true`
- 서브에이전트: `.claude/agents/euro-digest/design-concepts.md`(M0-09, 쓰기 경로 훅 포함). 시안용 실데이터: M0-33~35(`fixtures/rss/`·`fixtures/news-sample.json`·`fixtures/football/`). **실데이터가 없으면 시작하지 않는다**(가짜 문구 금지).

## 절차
0. **선행 확인** — 게이트가 `d0|d1|d2|d3`가 아니면 묻는다. 순차 진행(PRD §15 D11): D0는 M0 완료 후, D1은 M1 코드 작업 완료 후, D2는 M2 완료 후, D3는 M4 완료 후. 조건이 안 되면 진행 여부를 묻는다.
1. **① 범위 정리** — 게이트 범위를 CLAUDE §4 표와 plan에서 읽어 화면·컴포넌트 목록으로 만든다. 큰 문서는 해당 절만 읽는다.
   - D0(plan §5 D0-01): 홈(오늘의 5줄 · 한국 선수 칩 자리 · 오늘 밤 경기 자리 · 주요 뉴스 피드), 헤더·모바일 하단 탭(2~5개 가변)·데스크톱 3단, 테마 토글, 상태 화면 4종(스켈레톤·빈 상태·오류·오프라인 — 텍스트·도형 기반), 뉴스 카드 변형 6종(기본 / 다출처 +N곳 / 이적 상태+Tier / 한국 선수 관련 / 경기 결과(결과 가리기 켬) / 강등 카드(원제목+링크)), 워드마크, 컬러·타이포 토큰, 대회 컬러 6종
   - D1 → plan §7 D1-01 · D2 → plan §9 D2-01 · D3 → plan §12 D3-01
   - 출발점: D0는 U-10(**에디토리얼 신문형·매거진 볼드형** 선호 + 다른 방향 제안 원함)과 plan §5 '시안 방향 후보'(A Broadsheet · B Floodlight · C Matchsheet). D1 이후는 확정된 DESIGN.md 토큰 위에서 레이아웃·표현을 달리한다.
   - 방향 조합을 AskUserQuestion으로 확인한 뒤 ②로 간다.
2. **② 시안 제작** — `design-concepts` 서브에이전트에 위임한다(시안만, `src/` 수정 금지).
   - 경로: `docs/design/<게이트>/concept-a.html`, `concept-b.html`, (`concept-c.html`)
   - 외부 의존 없는 단일 정적 HTML(CSS·JS 인라인, CDN 금지). 웹폰트는 `docs/design/fonts/` 로컬 파일만, 시안마다 2패밀리 이하, 서브셋·`font-display: swap`, 공개 저장소에 둘 수 있는 라이선스(OFL 등)인지 확인.
   - 데이터는 `fixtures/` 실데이터만. 해당 fixture가 없는 영역은 "자리"로 명시하고 문구를 지어내지 않는다.
   - 375px·1280px 반응형, 라이트·다크(`prefers-color-scheme` + `data-theme` 토글).
   - 시안 상단(또는 첫 주석)에 **콘셉트 이름 · 한 줄 설명 · 장점 · 단점 · 구현 난이도 · 번들/폰트 영향**.
   - 시안끼리 **최소 두 축 이상** 달라야 한다: 레이아웃 / 타이포 성격 / 색 전략 / 정보 밀도 / 모션 언어.
3. **스크린샷** — 시안마다 4장: `npx playwright screenshot --full-page --viewport-size=375,812 --color-scheme=light "file://$PWD/docs/design/<게이트>/concept-a.html" docs/design/<게이트>/screenshots/concept-a-375-light.png` 형식으로 375/1280 × light/dark.
4. **자체 점검** — 아래 품질 기준을 시안별로 체크하고, 핵심 색 쌍(본문/배경, 보조 텍스트, 액센트, 대회 컬러 위 텍스트)의 대비비를 라이트·다크 각각 계산해 표에 적는다.
5. **③ 제시·선택 요청** — 비교표 + 추천안(이유)을 보이고 '사용자 확인 지점'에서 **멈춘다**.
6. **선택 후** — 사용자가 고르면 `docs/design/DECISIONS.md`에 날짜·선택안·이유·혼합 지시를 기록한다. 혼합 지시면 혼합안 `docs/design/<게이트>/concept-mix.html`을 1회 만들어 다시 확인한다(D0-07). DESIGN.md·토큰·컴포넌트 구현은 이 커맨드 밖에서 한다.

## 품질 기준 (시안 인정 조건)
- **Editorial, not portal** — 여백·타이포 위계로 정돈, 빽빽한 링크 목록 금지, 카드 하나 3초 스캔.
- **숫자가 주인공** — 스코어·순위·승점은 숫자 전용 서체 + `font-variant-numeric: tabular-nums`.
- **이미지 없이 아름답게** — 기사 이미지·구단/리그 로고·선수 사진 금지. 팀은 팀 컬러 이니셜 배지, 대회는 컬러 토큰으로.
- 색만 바꾼 변형, shadcn/ui 기본 모양·템플릿 느낌은 시안으로 인정하지 않는다.
- WCAG AA 대비(다크 포함), 색 외 기호·텍스트 병기(▲▼·W/D/L), 터치 타깃 44px, 포커스 링.
- 한글 `word-break: keep-all`, 모션 150~250ms + `prefers-reduced-motion` 시 제거.

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- ① 끝: 시안 방향 조합 (예: [A Broadsheet + 매거진 볼드 + C Matchsheet (추천)] / [U-10 두 방향만 2안] / [직접 지정]).
- ③: [A] / [B] / [C] / [혼합 지시] — 추천안 표시, 결정은 사용자.

## 금지 사항
- 선택 전 UI 스타일 구현, DESIGN.md·`globals.css`·`src/` 수정 금지 (CLAUDE §1-1).
- 이미지 자산·외부 CDN·외부 웹폰트 금지 (§1-6·§4). 가짜 문구·lorem ipsum 금지.
- 시안용 새 요약을 만들려고 LLM을 부르지 않는다. 데이터가 부족하면 질문한다 (§1-3).

## 완료 보고 형식
```
## /design-concepts <게이트> — 시안 N개
| | A <이름> | B <이름> | C <이름> |
|---|---|---|---|
| 한 줄 설명 / 다른 축 | | | |
| 장점 / 단점 | | | |
| 구현 난이도 / 번들·폰트 영향 | | | |
| 대비비(라이트/다크) | | | |
스크린샷: docs/design/<게이트>/screenshots/concept-{a,b,c}-{375,1280}-{light,dark}.png
추천: <안> — 이유 2~3줄 · 선택을 기다리는 중 (구현하지 않음)
```
