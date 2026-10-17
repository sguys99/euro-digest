---
description: 시즌 전환 체크리스트 — 대회 시즌 ID·승강 팀(팀 id·팀→리그 표)·한국 선수 명단·표기 사전(축약 별칭 소속팀 표)·팀 컬러·포메이션·이적 창·대표팀·소스 건강도를 차례로 점검·갱신한다 (FR-156)
argument-hint: "<새 시즌 — 예: 2027-28>"
disable-model-invocation: true
---

# /new-season — 시즌 전환

새 시즌: **$ARGUMENTS** (비어 있으면 AskUserQuestion으로 확인)

목적: 시즌이 바뀔 때 손으로 관리하는 `configs/`를 빠짐없이 갱신해, 새 시즌 첫 수집부터 순위·팀·선수 화면이 맞게 나오게 한다.
근거: CLAUDE.md §11·§12 · PRD FR-156·FR-60·FR-64·FR-65·FR-105·DR-05 · plan §16(2027년 7~8월) · M5-11(커맨드 완성)

## 현재 상태 (M1-29 점검 — 2026-10-17)
- 오늘(UTC): !`date -u +%F`
- 설정 파일: !`ls configs/*.json 2>/dev/null || echo "(configs/*.json 없음)"`
- 코드 표: !`ls scripts/lib/names.ts scripts/lib/team-leagues.ts 2>/dev/null; test -f scripts/lib/team-leagues.ts || echo "(scripts/lib/team-leagues.ts 없음 — M1-17에서 생길 예정)"`
- 대상 configs 스키마(M0-16)·검증(M0-17)은 완료됐다. 지금 있는 설정: competitions · korean-players(M0-32 초안) · names.ko(M1-21) · team-ids(M1-44) · sources · publisher-domains · search-queries · takedowns. 팀 컬러는 M2-05, 한국 선수 명단 확정은 M3-01, 커맨드 완성은 M5-11이다.
- **그 전에는** 체크리스트 골격 확인용이며, 없는 설정 파일을 새로 만들지 않는다.
- 코드 상수(아래 B·D의 `TEAM_LEAGUES`·`KNOWN_PLAYER_TEAMS` 등)는 configs가 아니다. 섹션 승인 뒤 코드 변경으로 반영한다(사람 또는 `pipeline-dev` 작업 — 테스트 동반).

## 진행 방식
- 섹션(A~H)마다 ① 현재 값 ② 공식 출처로 확인한 새 값 ③ 변경안을 표로 만들고, 섹션 단위로 승인받은 뒤 반영한다.
- 외부 API 한도: football-data.org 분당 10회, API-Football 하루 100회(00:00 UTC 리셋)·분당 10회 — 둘 다 동시 1개·응답 후 6.5초 간격, API-Football 개발 호출은 하루 50건 이내 (CLAUDE §6.4).
- 응답 원문은 남기지 않고, 필요한 값만 근거 URL과 함께 표에 적는다.

## 체크리스트
**A. 대회·시즌 ID** — `configs/competitions.json`
- [ ] 6개 대회(EPL·LALIGA·SERIEA·BUNDESLIGA·LIGUE1·UCL)의 football-data.org 대회 코드·새 시즌 연도·시작/종료일
- [ ] API-Football: 6개 대회 `apiFootballLeagueId`가 그대로이고 새 시즌이 `current: true`인지(`/leagues?id=`), 무료 플랜의 경기 단건 경로(`/fixtures?date=` → `/fixtures?id=` — 시즌 단위 `season=` 조회는 무료 불가, PRD §15 D27)가 새 시즌 경기에도 열리는지 재확인 → 막히면(`errors.plan`) FR-65 폴백. 한국 선수 시즌 누적의 시즌 경계·집계 시작일 처리도 확인(M1-48 저장 스키마)
- [ ] `zones`: 리그 강등 구간은 리그 공식 규정(1차 출처)으로 재확인. 유럽 대항전 진출 구간은 그 시즌의 UEFA 액세스 리스트·국가 계수가 확정되기 전에는 넣지 않는다(관행값 금지 — M0-29, plan M2-01)
- [ ] UCL 리그 페이즈 36팀 확정(8월 말 추첨) 전에는 임시 상태로 표시
- [ ] 경기 기록 원장 `data/matches/meta.json`의 `since`·`playerSince`를 시즌 경계에서 어떻게 다룰지 정한다. 규칙이 아직 없으므로(M1-48 이월) 처음 실행할 때 선택지를 만들어 질문한다. `data/`는 손으로 고치지 않는다.

**B. 승강 팀** — 리그 공식 사이트 기준
- [ ] 리그별 승격·강등 팀 목록과 출처
- [ ] 승격 팀: `names.ko.json` 팀명 · `team-colors.json` 2색 + 영문 약어(DR-05, 로고 사용 금지) · 필요하면 `formations.json` 보조 포메이션(라인업 최빈값이 아직 없을 때만 — FR-55, D27)
- [ ] 강등 팀: 항목을 지우지 않는다(과거 카드·아카이브가 slug를 참조). 대회 소속만 바꾼다
- [ ] 팀 id 대응표 `configs/team-ids.json`(PRD §15 D33): 승격 팀의 football-data(fd)·API-Football(af) 팀 id를 공식 응답으로 확인해 넣는다(추측 금지). 활성 한국 선수의 소속팀은 `af`가 필수다(`npm run validate` 교차 검사 오류).
- [ ] 팀 → 리그 표 `scripts/lib/team-leagues.ts`의 `TEAM_LEAGUES`·`TEAM_LEAGUES_SEASON`(M1-17 — 코드 상수, 아직 main에 없으면 **예정**): 뉴스 대회 태그·점수화 범위의 근거다. 승격·강등 팀을 반영하고 시즌 연도를 `competitions.json` `season`과 맞춘다. slug는 `names.ko.json` 팀 slug와 같아야 한다(`tests/team-leagues.test.ts`가 순위표 fixture·사전과 대조).
- [ ] 이번 시즌 팀 가드 테스트(`tests/names-ko-dict.test.ts`의 `SEASON_TEAMS` — 2026-10-11 순위표 fixtures, 111팀)와 `tests/team-leagues.test.ts`의 기준 fixtures를 새 시즌 순위표로 바꿀지 정한다(fixtures 갱신 = 실제 응답 저장, API 한도 안에서).
- [ ] 팀 수가 바뀌어 주간 팀 한줄평 호출 수가 늘면 비용 영향을 보고하고 질문한다 (§1-3)

**C. 한국 선수** — `configs/korean-players.json`
- [ ] 전원 소속·리그·포지션·`active` 재확인(이적·임대·복귀). 5대 리그 밖 이적은 `comp: "OTHER"`·`active: false` (FR-64)
- [ ] 신규 선수는 `/add-player`로 등록, `search-queries.json`의 선수 쿼리 정리

**D. 표기 사전** — `configs/names.ko.json` + `scripts/lib/names.ts` 코드 표
- [ ] 여름 이적 영입 선수·새 감독 표기 추가, `/add-name`으로 미등록 고유명사 정리(표기 정책 D39 ②·D46 — KFA 통칭, 5대 리그 밖 한국 선수 미등록)
- [ ] `KNOWN_PLAYER_TEAMS`(`scripts/lib/names.ts` — 'X. 성' 첫 글자 축약 별칭이 있는 선수 slug → 소속팀 slug):
  - 이적·임대한 선수는 소속팀을 고친다. 고치지 않으면 축약 득점자('H. Kane')가 브리핑 입력에서 영문 그대로 남고 `unknown-names.json`에 쌓인다(안전한 방향이지만 표기가 빠진다).
  - 축약 별칭을 사전에서 지우면 표에서도 뺀다(`tests/names-ko-dict.test.ts`가 양쪽을 대조).
  - 등록 한국 선수는 `korean-players.json` 소속팀을 쓰므로 C에서 함께 확인된다.
- [ ] 같은 파일의 `COMPETITION_EN_ALIASES`(대회 영문 별칭 — 스폰서 이름 변경 'LaLiga EA Sports' 등)와 `PROTECTED_LATIN_PHRASES`(사전 이름을 품은 다른 팀 — 2군·다른 리그)를 갱신할지 확인한다.
- [ ] (M1-17 병합 뒤) `scripts/lib/tag-names.ts`의 `AMBIGUOUS_TAG_TERMS`: 승격 팀 별칭이 일반어·도시·다른 종목과 겹치면 추가한다.

**E. 이적 창·빅매치** — `transfer-windows.json` · `bigmatch-rules.json`
- [ ] 리그별 여름·겨울 이적 창 개폐일(공식 발표 기준, FR-105)
- [ ] 더비·빅매치 규칙에 승격 팀 반영 여부

**F. 대표팀** — `configs/national-team.json`
- [ ] 새 시즌 A매치 기간(FIFA 윈도)·예정 경기 일정

**G. 소스 건강도** — `configs/sources.json`
- [ ] `data/runs.json` 최근 30일 소스별 성공률·건수 확인 → 죽은 피드는 `enabled: false` (FR-11)
- [ ] `note`의 약관 확인일이 1년을 넘은 소스는 약관 재확인, 새 소스는 `/add-source`

**H. 마무리**
- [ ] `npm run validate` → `npm run check` → `npm run build` 통과
- [ ] `npm run collect -- --limit 5 --dry --mock`으로 새 설정의 수집·정제 흐름 확인. LLM 비용은 없지만 피드·축구 데이터 API 호출은 일어난다. 06:00~08:00 KST를 피하고, API-Football 개발 호출은 하루 50건 이내로 한다(§6.4).
- [ ] 빌드 결과에서 대회·팀 페이지가 새 시즌 팀으로 생성되는지(`generateStaticParams`) 확인

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 섹션별 변경안: [그대로 반영 (추천)] / [항목별 수정] / [이 섹션 보류].
- 지난 시즌 순위·팀 데이터 보관 방식은 아직 정하지 않았다 → 처음 실행할 때 선택지를 만들어 질문한다.
- 스키마 필드 추가·공개 URL 변경이 필요하면 중단하고 질문한다 (CLAUDE §2·§8).

## 금지 사항
- 금지 사이트(Transfermarkt·FBref·WhoScored·SofaScore·FotMob·포털·X)를 출처로 쓰지 않는다 (§1-5). 구단 로고·선수 사진을 쓰지 않는다 (§1-6).
- 출처로 확인하지 못한 날짜·명단·색을 채우지 않는다 (§1-7). `.env*`를 읽지 않는다 (§1-8).
- `data/`를 손으로 고치지 않는다. 새 시즌 데이터는 파이프라인이 만든다 (§8).

## 완료 보고 형식
```
## /new-season 결과 — <시즌>
| 섹션 | 상태(완료/보류/해당 없음) | 변경 파일·항목 수 | 근거 |
|---|---|---|---|
검증: validate · check · build 결과 · 남은 일(UCL 추첨 후 재확인 등)과 예정일
```
