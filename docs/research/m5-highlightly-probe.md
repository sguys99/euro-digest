# Highlightly Football API 실측 — API-Football 대체 후보 (v0.1)

> 작성 2026-11-17 · 배경: API-Football 계정 정지(2026-11-04~, 이슈 #4 — `errors.access: Your account is suspended`, 로컬·Actions 모두, 지원팀 문의 무응답)
> 대상: 경기별 득점자·도움 · 라인업·포메이션 · 한국 선수 경기별 출전 시간 — football-data 무료 플랜에 없는 항목(M0-28). 경기 결과·순위·시즌 득점 순위는 football-data로 계속 받는다.
> 상태: **도입 결정(2026-11-17 — PRD §15 D80: 도입 + 공백 백필, 원장 id `af-` · `hl-` 공존)** · 구현 plan M5-18.

## 0. 한눈에

- **필요한 세 가지를 무료 플랜에서 모두 받았다.** 응답마다 `plan: { tier: "BASIC", message: "All data available with current plan." }`.
- **지난 날짜도 열린다.** 10~13일 전 경기(11-04 UCL · 11-07 · 11-08)를 날짜로 찾고 이벤트·라인업·출전 시간까지 받았다. API-Football 무료 플랜(날짜 조회 오늘 ±1일)과 달리 **정지 기간(11-04~) 원장 공백을 메울 수 있다.**
- **대상 리그 8개 모두 있다**: 5대 리그 · UCL · 덴마크 Superliga(미트윌란) · 벨기에 Jupiler Pro League(베스테를로).
- **스코어 정확도**: 받은 34경기(11-04~11-08) 모두 football-data에 저장된 결과와 킥오프·스코어 일치.
- 한도: 하루 100회(`x-ratelimit-requests-limit: 100`). 분당 한도·일 리셋 시각은 문서·헤더에 없다.

## 1. 요청 범위

2026-11-17 21:10~21:20 KST, 직접 접근(`https://soccer.highlightly.net`, 헤더 `x-rapidapi-key`) **12건**(예산 20건). 동시 1개, 앞 요청 뒤 7초 간격. 모두 HTTP 200, 응답 0.5~1.4초. 키는 `.env.local` 프로세스 환경에서만 읽었고 출력·저장하지 않았다. 응답 원본은 저장소 밖(scratchpad)에만 두었다. LLM 호출 0, 비용 0(무료 플랜).

| # | 요청 | 결과 |
|---|---|---|
| 1 | `/matches?leagueName=Bundesliga&date=2026-11-07&timezone=UTC` | 7경기(독일 5 + 오스트리아 2 — `leagueName`은 나라를 가리지 않는다 → `leagueId` 또는 `countryName` 병기) |
| 2 | `/matches/1340510451`(마인츠–바이에른) | `events` 15건: Goal · VAR Goal Cancelled · Substitution · Yellow Card, 득점자·도움·분·선수 id |
| 3 | `/box-score/1340510451` | 팀별 선수 19·20명 — `minutesPlayed` · `isSubstitute` · `goalsScored` · `assists` · `position` · `shirtNumber` |
| 4 | `/lineups/1340510451` | `formation`(3-5-2 · 4-2-3-1) · `initialLineup` 행(골키퍼 첫 행) · `substitutes` |
| 5~9 | EPL 11-07 · 라리가 11-08 · 세리에A 11-08 · 리그1 11-08 · UCL 11-04 | 4 · 5 · 5 · 6 · 9경기 |
| 10 | `/matches?leagueName=Superliga&countryName=Denmark&season=2026` | 132경기(한 쪽 100 — `offset` 필요), 미트윌란 포함 |
| 11 | `/matches?countryName=Belgium&season=2026&homeTeamName=Westerlo` | 0건 — 팀 이름 표기가 다르다(id로 조회해야 함) |
| 12 | `/matches?countryName=Belgium&date=2026-11-08` | Jupiler Pro League 4 + Challenger Pro League 2 |

리그 id: 분데스리가 67162 · EPL 33973 · 라리가 119924 · 세리에A 115669 · 리그1 52695 · UCL 2486 · Superliga 102053 · Jupiler Pro League 123328.

## 2. 확인한 사실

- **한국 선수 기록(예: 11-07 마인츠 1–2 바이에른)**: 김민재 `isSubstitute: true · minutesPlayed: 0`(미출전) · 이재성 선발 63분, 44분 `VAR Goal Cancelled`. W45 주간 리포트에서 빠진 경기다.
- **교체 이벤트 의미**: `player` = 나간 선수, `substituted` = 들어온 선수(이재성 `player`, 네벨 `substituted` — 이재성 63분, 네벨 27분 출전과 맞음).
- **선수 이름 표기가 응답마다 다르다**: 같은 선수가 `Lee Jae-Sung`(이벤트) · `Jae-sung Lee`(박스스코어), `Kim Min-jae` · `M. Neuer`(약칭). → **선수 id로 대응**해야 한다(`korean-players.json`에 Highlightly id 필요).
- **출전 시간 소수 오차**: 하프타임 골키퍼 교체가 44 + 46분으로 나온다. 합 90은 맞다.
- **이미지 URL이 응답에 섞여 온다**(`logo` — 팀·선수). 쓰지 않는다(CLAUDE §1-6).
- `/lineups`는 "킥오프 40분 전~종료 120분 뒤에 받아 둔다"고 문서에 적혀 있다. 10일 지난 경기도 받혔으므로 저장분을 돌려주는 것으로 보인다.

## 3. 약관 (확인 2026-11-17, https://highlightly.net/terms/ — Last updated: November 3, 2026)

| 항목 | 내용 | 우리 쪽 |
|---|---|---|
| 표시 | §6.1 자기 제품 안에서 최종 사용자에게 보여 주는 것 허용 | 사이트 표시 가능 |
| 저장 | §6.1 "You may store the data … to build and operate Your own applications" | 원장 저장 가능 |
| 금지 | §6.1 사전 서면 허가 없는 재판매·재라이선스, API의 프록시·미러 서비스 | 해당 없음 — 원본 응답을 그대로 내보내지 않는다 |
| 무료 플랜 | §4.1 "provides limited access and is not subject to the same terms as paid plans" | 무통보 변경 가능성 → 폴백 유지 |
| 정지 | §12 사전 통보 없이 정지·해지 가능 | API-Football과 같은 위험 |
| 출처 표기 · AI 가공 · 다중 계정 | 조항 없음 | 출처 문구는 자율(`/about`에 추가 권장) |
| 데이터 출처 | §2.2 공개 데이터 · 인가된 피드 | — |
| 준거법 | 슬로베니아 | — |

## 4. 도입 시 바뀌는 것 (결정 필요)

1. **원장 경기 id**(D33): `af-<id>` → `hl-<id>`. 기존 10-19~11-03 `af-` 경기와 공존 — 스키마·마이그레이션 여부 결정.
2. **설정 스키마**: `korean-players.json`에 Highlightly 선수 id, 팀 id 대응표에 Highlightly 팀 id, `competitions.json`에 Highlightly 리그 id.
3. **어댑터** `scripts/lib/providers/highlightly.ts` + 수집 단계 교체(날짜 조회 → 대상 경기 `/matches/{id}` · `/box-score` · `/lineups`). 경기당 2~3회 → 하루 대상 경기 20개 안팎이면 60회 안쪽.
4. **원장 공백 백필**: 11-04~ 대상 경기를 날짜로 다시 받아 원장을 채우고 W45·W46 주간 리포트를 `--force`로 재생성.
5. **문서**: PRD §15 새 결정(D80 — 제공자 교체), FR-65 폴백 조건, CLAUDE §3·§6.4·§13, `/about`·`/privacy` 데이터 출처.
