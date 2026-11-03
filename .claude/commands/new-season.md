---
description: 시즌 전환 — 읽기 전용 점검(npm run new-season:check)으로 남은 일을 뽑고, 대회 시즌·승강 팀(팀 표·team-ids·팀 컬러·표기)·한국 선수·원장 since·이적 창·대표팀·테스트·OG를 2단계(리그 먼저, UCL은 추첨 뒤)로 갱신한다 (FR-156)
argument-hint: "<새 시즌 — 예: 2027-28 또는 2027>"
disable-model-invocation: true
---

# /new-season — 시즌 전환

새 시즌: **$ARGUMENTS** (비어 있으면 AskUserQuestion으로 확인 — 시작 연도 `YYYY` 또는 `YYYY-YY`)

목적: 1년에 한 번(2027년 7~8월) 사람이 하는 일이라 잊기 쉽다. 시즌에 묶인 configs·코드 표·테스트·파생 파일을 빠짐없이 바꿔, 새 시즌 첫 수집부터 순위·팀·선수·브리핑이 맞게 나오게 한다. 각 단계에 **명령 · 확인 · 되돌리기 · 사용자 확인**을 둔다.
근거: CLAUDE.md §1·§6.4·§8·§10·§11·§12 · PRD FR-156·FR-42·FR-60·FR-64·FR-105·DR-05·DR-10 · PRD §15 D27·D33·D37·D46·D62·D63·D71 · plan §16(시즌·이벤트) · plan 이월 메모 M1-17·M1-21·M1-29·M1-48·M2-01·M2-04·M5-01 · `configs/README.md`(팀 slug·팀 컬러·더비·이적 창)

## 현재 상태 (M5-11 — 2026-11-03)
- 오늘: !`date -u +%F` (UTC) · KST !`TZ=Asia/Seoul date +"%F %H:%M"`
- 점검(지금 설정 시즌 기준 — 대상 시즌은 0단계에서 `--season`으로 다시 돌린다):
  !`npm run -s new-season:check 2>&1 | tail -n 30`
- 점검 도구 `npm run new-season:check -- [--season <YYYY|YYYY-YY>] [--date <YYYY-MM-DD>]` — 진입점 `scripts/new-season-check.ts`, 판정 `scripts/lib/new-season-check.ts`(순수 함수), 테스트 `tests/new-season-check.test.ts`
  - **읽기 전용**이다. 파일을 쓰지 않고 네트워크·LLM을 부르지 않는다(API-Football 한도와 무관). 언제 몇 번 돌려도 된다.
  - 종료 코드: 0 = 준비됨(오류 0) · 2 = 오류 있음 · 1 = 실행 실패(설정 스키마 오류 — `npm run validate`로 위치 확인).
  - 8개 섹션: ① 시기 ② 시즌·기간(대회 시즌·날짜 연도·팀 표 시즌·원장 meta·대회 파일) ③ 팀 목록(팀 수 = teamCount, 표 = team-ids, 팀마다 fd·af·컬러·표기, formations) ④ 한국 선수(소속팀·comp·af·apiFootballId, 축약 별칭 표) ⑤ 오늘 밤(더비 같은 리그, 빅클럽) ⑥ 이적 창(대상 시즌 여름·겨울, 다음 여름, 곧 열리는 추정 창) ⑦ 대표팀(예정 A매치) ⑧ 파생 파일(data/teams, 팀 OG).
  - ✗ 오류 = 이대로 전환하면 `validate`·`check`가 실패하거나 기록이 조용히 빠진다. ! 경고 = 사람이 확인. · 참고 = 다음 수집·빌드가 처리.
  - 점검이 보지 못하는 것: 출처 사실(날짜·명단·색이 맞는가 — 사람이 1차 출처로), 지난 시즌에서 넘어온 UCL 팀 표의 **내용**(팀 수만 본다), 시즌 고정 테스트(T단계 목록).

## 시즌에 묶인 것
| 종류 | 위치 | 단계 |
|---|---|---|
| 대회 시즌·기간·팀 수·구간 | `configs/competitions.json` | A1(리그) · A2(UCL) |
| 팀 → 리그 표·UCL 팀 표·표 시즌 | `scripts/lib/team-leagues.ts` `TEAM_LEAGUES`·`UCL_TEAMS`·`TEAM_LEAGUES_SEASON`(코드 상수) | B · A2 |
| 팀 목록 fixtures | `fixtures/football/football-data/teams-<code>-<시즌>.json`(`scripts/fetch-competition-teams.ts --write`) | B · A2 |
| 팀 id 대응표 | `configs/team-ids.json`(6개 대회 팀만 — `tests/team-leagues.test.ts`) | B · A2 |
| 팀 컬러·약어 | `docs/design/d1/team-colors-source.json`(원본) → `configs/team-colors.json`(생성) | B |
| 팀·선수·감독 표기 | `configs/names.ko.json` · `scripts/lib/names.ts` `KNOWN_PLAYER_TEAMS`·`COMPETITION_EN_ALIASES`·`PROTECTED_LATIN_PHRASES` · `scripts/lib/tag-names.ts` `AMBIGUOUS_TAG_TERMS` | B · C · D |
| 더비·빅클럽 | `configs/bigmatch-rules.json` · `scripts/lib/news-keywords.ts` `BIG_CLUBS` | B |
| 수동 포메이션 | `configs/formations.json` | B |
| 한국 선수 | `configs/korean-players.json` · `configs/search-queries.json` | C |
| 원장 집계 시작일 | `data/matches/meta.json` `season`·`since`·`playerSince`(파이프라인만 쓴다) | E |
| 이적 창 | `configs/transfer-windows.json` + `tests/transfer-windows-config.test.ts` 표 | F |
| A매치 일정 | `configs/national-team.json` | G |
| 소스 약관 재확인 | `configs/sources.json` | H |
| 시즌 고정 테스트 | T단계 목록 | T |
| 팀 파일·팀 OG | `data/teams/*.json`(`npm run build:teams`) · `public/og/`(`npm run build:og`) | B · J |

## 언제 — 2단계 (2026-11-03 사용자 결정 ④)
- **0단계 준비(5~6월)**: 0단계 점검으로 남은 일을 본다. 원장 since는 자동이다(E — 할 일은 첫 수집 뒤 확인뿐).
- **1단계 — 5대 리그(7월, 늦어도 첫 리그 개막 2주 전)**. 조건:
  1. 지난 시즌 모든 대회가 끝났다(2026-27은 UCL 결승 2027-06-05).
  2. 리그 공식 일정이 발표됐다.
  3. football-data `/competitions/{code}/teams?season=<새 시즌>`이 새 승격 팀을 낸다.
  리그 5개의 시즌·팀 표·team-ids·컬러·표기·테스트를 **한 번에 push**한다(시즌과 팀 표가 어긋난 채 push하면 `npm run check`가 실패한다). UCL은 지난 시즌 그대로 둔다 — 점검은 이것을 경고 "UCL만 … 2단계 전환 대기"로 보여 준다.
- **2단계 — UCL(리그 페이즈 추첨 뒤, 8월 말~9월 초 첫 경기 전)**: UCL 시즌·기간·36팀 표·새 참가 팀 id·컬러·표기.
- 두 단계 사이의 영향: 대회 시즌이 하나가 아니어서 이적 이슈의 행선지 리그 판정이 쉰다(`scripts/lib/transfer-issues-io.ts` `leagueTableCurrent` — 메모 "/new-season 뒤 다시 판단"). UCL 대회 화면은 지난 시즌 최종 상태를 계속 보여 준다.
- 비시즌 화면(DR-07 — `src/lib/rest-period.ts`)은 설정 날짜로만 판단한다. 1단계 전에는 "모두 끝남(지난 시즌 종료일)", 1단계 뒤에는 "개막 전(새 개막일)"이 나온다. 다음 시즌 날짜는 설정을 바꾼 뒤에만 쓴다(DECISIONS D3).
- 서머타임: 전환 기간(7~9월)은 여름 시각(06:30 수집 → 07:00 공개, D26)이다. 계절은 `src/lib/time.ts`가 판정하므로 바꿀 것이 없다. 10월 마지막 일요일 다음 날 겨울 시각 전환 확인은 plan §16 루틴대로.

## 진행 규칙
- 단계마다 ① 현재 값 ② 1차 출처로 확인한 새 값(근거 URL) ③ 변경안을 표로 만들고, **단계 단위로 승인**받은 뒤 반영한다. 출처로 확인하지 못한 날짜·명단·색·id는 채우지 않는다(§1-7).
- 커밋은 작게 나눈다(CLAUDE §10). 단 1단계의 A1·B·T·J는 함께 통과해야 하므로 한 번에 push한다. 커밋 메시지 예: `chore(season): 2027-28 5대 리그 시즌·승강 팀 (FR-156)`.
- 매 push 전: `npm run new-season:check -- --season <S>` → `npm run validate` → `npm run check` → `npm run format:check` → `npm run build`. **06:00~08:00 KST에는 push하지 않는다**(§10 — 봇 발행 시간대, 계절 무관). push 전 `git pull --rebase`.
- 외부 API는 필요한 만큼만 부른다(§6.4):
  - football-data: 분당 10회.
  - API-Football: 하루 100회(00:00 UTC = 09:00 KST 리셋), 개발 호출 하루 50건 이내, 06:00~08:00 KST 금지.
  - 둘 다 동시 1개·응답 후 6.5초 간격. 응답 원문은 저장소에 남기지 않는다(fixtures는 축약 규칙대로).
- **되돌리기 기본값**: configs·코드 표·fixtures 변경은 그 커밋을 `git revert`한다(force push·`reset --hard` 금지). `data/`는 손으로 고치지 않는다 — 다음 수집이나 해당 생성 스크립트가 다시 만든다(§8).

## 체크리스트

### 0. 사전 점검 (읽기 전용 — 언제든)
- 명령: `npm run new-season:check -- --season <S>` · `npm run validate` · `git status`(작업 트리가 깨끗한지)
- 확인: 출력의 오류·경고를 이 문서의 단계별로 나눈 표를 만든다. 시기 섹션이 "아직 시즌 중"이면 남은 일만 보고하고 멈춘다.
- 사용자 확인: '정해진 결정' ①~⑤와 다르게 가야 할 사정이 있으면 먼저 묻는다(예: UCL 방식 변경으로 2단계가 맞지 않을 때).

### A1. 대회 시즌·기간 — 5대 리그 (1단계)
- 바꿀 것(`configs/competitions.json` 리그 5개):
  - `season` = S
  - `startDate`·`endDate` = 리그 공식 일정의 첫·마지막 경기일
  - `teamCount` = 리그 규모가 바뀔 때만
  - `zones` 강등 구간 = 리그 공식 규정으로 재확인
- 유럽 대항전 진출 구간은 넣지 않는다. 그 시즌의 UEFA 액세스 리스트·국가 계수가 확정되는 시즌 후반(다음 해 3월 전후)에 1차 출처로만 넣는다(plan §16, M2-01). 관행값 금지.
- API-Football 확인:
  - 리그 `apiFootballLeagueId`가 그대로이고 새 시즌이 `current: true`인가(`/leagues?id=` 리그당 1회).
  - 무료 플랜의 경기 단건 경로(`/fixtures?date=` → `/fixtures?id=`)가 새 시즌 경기에도 열리는가.
  - 막히면(`errors.plan`) FR-65 폴백 대상이다. 중단하고 보고한다(D27).
- 확인: `npm run new-season:check -- --season S` ② 시즌·기간에서 리그 오류가 사라지고 UCL 대기 경고만 남는다.
- 효과:
  - 다음 수집이 football-data `season=S`로 리그를 받고 `data/competitions/<comp>.json`을 새로 쓴다. 지난 시즌 값은 이어 쓰지 않는다(`scripts/lib/competition-file.ts`).
  - 순위 변동(▲▼)은 첫날 비어 있다(prevPos null — DECISIONS D1 #4).
- 되돌리기: 커밋 revert → 다음 수집이 지난 시즌으로 다시 받는다.

### B. 승강 팀 — 팀 표·team-ids·컬러·표기 (1단계 — UCL 팀은 A2)
1. **팀 목록 받기**(football-data 6요청): `node --env-file-if-exists=.env.local --import tsx scripts/fetch-competition-teams.ts`(요약만) → 맞으면 `--write`(`fixtures/football/football-data/teams-<code>-<S>.json` + `fixtures/football/index.json`). 키가 든 환경 파일은 사용자 환경에서만 쓰고, `.env*`를 읽거나 출력하지 않는다(§1-8).
2. **승격·강등 목록**: 리그 공식 사이트로 확인한 승격·강등 팀을 1의 fixtures와 대조해 표로 보고한다(출처 URL).
3. **팀 id**: `npx tsx scripts/build-team-ids.ts --roster [--af-pairs <짝짓기 결과>] --review <저장소 밖 경로>` → 검토 → `--write`.
   - 새 팀 `af`는 공식 응답으로만 넣는다(추측 금지). 모르면 null로 두고, 운영 리포트의 D37 자동 연결 후보(`collect.teamids.auto-link`)를 사람이 옮긴다.
   - **활성 한국 선수 소속팀은 af 필수**(`validate` 교차 참조 5 오류).
   - slug는 `configs/README.md` 규칙. 예외표 `TEAM_SLUG_OVERRIDES`(`scripts/lib/team-slugs.ts`)는 통칭이 다를 때만.
4. **팀 → 리그 표**: `scripts/lib/team-leagues.ts` `TEAM_LEAGUES`(승격 넣고 강등 빼기) · `TEAM_LEAGUES_SEASON = S`. `UCL_TEAMS`는 A2에서. 리그 팀 수 = `teamCount`(점검 ③).
5. **팀 컬러**:
   - `docs/design/d1/team-colors-source.json`에 승격 팀을 더하고 강등 팀을 뺀다. 항목 = 키트 원색 2색 · football-data `tla` 원문 · 약어 · 확신도 · 출처(로고 금지 §1-6).
   - `npx tsx scripts/build-team-colors.ts --write` → `npx tsx scripts/build-team-colors-review.ts`(검토 시트).
   - 색은 출처와 함께 사용자 확인 뒤 확정한다.
6. **표기**: 승격 팀의 정식·짧은 이름 별칭을 `names.ko.json` 팀 항목(slug 포함)으로 넣는다(`/add-name` 절차 — D39 ②·D46). 강등 팀 항목은 **지우지 않는다** — 지난 호 카드의 태그·검색 별칭이 쓴다.
7. **오늘 밤·점수화**:
   - `bigmatch-rules.json` 더비에서 강등 팀이 든 더비를 빼고, 승격 팀의 통용 더비를 더한다(`configs/README.md` 더비 근거 — 예: 리옹–생테티엔).
   - 빅클럽이 강등됐으면 `bigClub.teams`와 `scripts/lib/news-keywords.ts` `BIG_CLUBS`를 함께 고친다(한쪽만 고치면 테스트 실패).
8. **코드 표 점검** — 승격 팀 별칭이 일반어·도시·다른 팀과 겹치는지 본다. 바꾸면 해당 테스트도 함께 고친다.
   - `scripts/lib/tag-names.ts` `AMBIGUOUS_TAG_TERMS`
   - `scripts/lib/names.ts` `PROTECTED_LATIN_PHRASES`(사전 이름을 품은 다른 팀 — 2군·다른 리그)
   - `scripts/lib/names.ts` `COMPETITION_EN_ALIASES`(대회 스폰서 이름 변경 — 예: 'LaLiga EA Sports')
9. **수동 포메이션**: `configs/formations.json`에서 이번 시즌 밖 팀을 뺀다(점검 ③ 경고).
10. **팀 파일**(2026-11-03 사용자 결정 ② — 지난 시즌 팀 페이지는 내린다):
    - `npm run build:teams`(API 호출 없음)로 새 팀 파일을 만든다.
    - 지난 시즌 팀 파일은 **같은 커밋에서** 정리한다: `node --env-file-if-exists=.env.local --import tsx scripts/build-teams.ts --prune --dry`(지울 목록만 — 로그 `teams.prune.plan`) → 확인 → `--prune`(로그 `teams.prune.done`).
    - 지우는 파일 = 이번 시즌 팀 표에도 `team-ids.json`에도 없는 팀만(3에서 대응표에서 뺀 팀). 대응표에 남은 팀은 `teams.prune.keep`으로 이유와 함께 남긴다. 25% 넘게 지우게 되거나 팀 생성 문제가 있으면 멈춘다(`teams.prune.blocked`, 종료 코드 1).
    - 정기 collect는 지우지 않는다(`collect.teams.stale-files` 경고만). 공개 URL을 없애는 일이라 사람이 대응표를 고친 커밋에서 확인하고 실행한다. team-ids에서 뺀 팀의 파일이 남아 있으면 `validate`(교차 참조 7)가 그 push를 막으므로 빠뜨릴 수 없다.
    - 결과: `/teams/<slug>/`는 404가 된다. 사이트 안 링크는 팀 파일이 없으면 글자로만 그린다(`TeamLink` — 깨진 링크 없음). 팔로우는 '빠진 팀'(`/my`). 표기 사전 항목은 남기므로 지난 카드 태그는 한글 그대로다. 팀 OG는 J(`build:og`)가 지운다.
11. **비용**: 주간 팀 한줄평(Batches)은 팀 수만큼 요청한다(지금 111팀). 6개 대회 팀 수가 늘면 예상 토큰·비용을 보고하고 묻는다(§1-3).
- 확인: 점검 ③④⑤⑧ · `npm run validate`(교차 참조 5·6·7) · T단계 테스트.
- 되돌리기: 커밋 revert(팀 컬러 원본과 생성 파일은 같은 커밋) → `npm run build:teams`.

### C. 한국 선수 — `configs/korean-players.json`
- 전원 소속·리그·포지션·`active`를 다시 확인한다(여름 이적·임대·복귀 — 구단·리그 공식 → KFA 순).
  - 이적은 `/add-player` 갱신 흐름으로 team·comp를 고친다(필요하면 team-ids af도).
  - 5대 리그 밖 이적은 `comp: "OTHER"`·`active: false`(FR-64·D46 — 목록 유지, 기록 중단).
- 신규 선수는 `/add-player`로 등록한다(명단·표기·검색 쿼리 세 곳). `search-queries.json` 선수 쿼리를 정리하고 `maxEnabled`를 넘지 않게 한다.
- `scripts/lib/names.ts` `KNOWN_PLAYER_TEAMS`('X. 성' 축약 별칭 선수 → 소속팀):
  - 이적한 선수는 팀을 고친다. 고치지 않으면 축약 득점자('H. Kane')가 브리핑에 영문 그대로 남고 `unknown-names.json`에 쌓인다.
  - 6개 대회를 떠났으면 사전의 축약 별칭과 함께 뺀다(`tests/names-ko-dict.test.ts`가 대조).
- 확인: 점검 ④ · `npm run validate`(교차 참조 2·3·5). 첫 수집 뒤 `data/players/korean.json` 소속.
- 되돌리기: 커밋 revert → 다음 수집이 `data/players/korean.json`을 다시 만든다.

### D. 표기 사전 — 여름 이적 영입·새 감독
- `/add-name`으로 미등록 고유명사(`data/cache/unknown-names.json`)를 정리하고, 빅클럽 영입 선수·새 감독 표기를 더한다(KFA 통칭, 5대 리그 밖 한국 선수 미등록 — D39 ②·D46).
- 'X. 성' 축약 후보는 사전에만 넣으면 치환되지 않는다 — C의 `KNOWN_PLAYER_TEAMS`도 함께 고친다.
- 확인: `npm run validate` · `npx vitest run tests/names-ko-dict.test.ts`.

### E. 경기 원장 새 시즌 since (자동 — 2026-11-03 사용자 결정 ①)
- 규칙(`scripts/lib/match-ledger.ts` `nextLedgerMeta`·`applyLedger` 머리 주석 '새 시즌'):
  - 설정 시즌(competitions.json 최댓값)이 meta.season보다 커진 뒤 **날짜를 받은 첫 정기 쓰기 실행**이 meta를 달 파일보다 먼저 새로 쓴다: `{ season: S, since: 그 실행이 받은 가장 이른 UTC 날짜, playerSince: {}(추적 선수는 since부터 다시), gaps: [] }`. 스키마는 그대로다.
  - 그 실행이 날짜를 하나도 받지 못하면 바꾸지 않고(`seasonMismatch`) 다음 실행이 다시 시도한다. 새 since 앞 킥오프 경기는 원장에 넣지 않는다.
  - 설정 시즌이 meta보다 작아지면(되돌림) 바꾸지 않는다. 달 파일은 그대로 둔다(경기마다 season이 있다).
  - 지난 시즌 meta는 git 이력에만 남는다(지난 시즌 누적은 화면에서 다시 볼 수 없다 — 결정 ①·③).
- 1단계(리그 시즌을 S로)부터 수집 시즌은 S다. 2단계 사이에도 원장은 S로 넘어간다(최댓값).
- 확인(1단계 뒤 첫 정기 수집):
  - 로그 `collect.ledger.meta`의 `seasonReset`("2026→2027 (이전 since …)").
  - `data/matches/meta.json` `season = S`·`since` = 그 실행이 받은 첫 날짜.
  - `data/players/korean.json` 최상위 `season`·`since`가 meta와 같다(`validate` 교차 참조 8). 선수 화면 "○월 ○일 이후 집계"가 새 날짜다.
- 손으로 meta를 고치지 않는다. 되돌리기: 시즌 설정 커밋을 revert해도 meta는 되돌아가지 않는다(설정이 meta보다 작으면 바꾸지 않는 규칙). 정말 되돌려야 하면 그 발행 커밋을 revert한다(CLAUDE §12 — 사용자 확인).

### F. 이적 창 — `configs/transfer-windows.json`
- 그 시즌 여름 창: 이미 있으면 추정값을 공식 발표로 바꾸고 `sourceUrl`을 단다.
- 그 시즌 겨울 창: 발표되면 넣는다(보통 가을).
- 다음 여름 창: 관례 기반 추정으로 넣는다(`sourceUrl` 없음).
- 시각은 현지 시각 → UTC(`configs/README.md` 이적 창). 같은 값을 `tests/transfer-windows-config.test.ts` 표에도 적는다.
- 확인: 점검 ⑥(45일 안에 열리는 추정 창 경고가 없어야 한다) · `npx vitest run tests/transfer-windows-config.test.ts tests/transfer-window.test.ts`.

### G. 대표팀 — `configs/national-team.json`
- 새 시즌 FIFA A매치 윈도의 한국 경기를 넣는다(대한축구협회 발표 — 시각 미정이면 `kickoffTbd`). 휴식기 판정(FR-71)과 `/national-team` 다음 경기가 이 파일을 쓴다.
- 확인: 점검 ⑦ · `npm run validate`.

### H. 소스 건강도 — `configs/sources.json`
- 최근 30일 소스별 성공률·건수를 본다(`/status` 또는 월요일 운영 리포트). 죽은 피드는 `enabled: false`(FR-11).
- 약관 확인일(`note`)이 1년을 넘은 소스는 약관·robots.txt를 다시 확인한다. 새 소스는 `/add-source`.

### T. 시즌 고정 테스트 (1단계·A2 커밋에 함께)
2026-11-03 결정 ⑤로, 고정 날짜·2026 응답 fixtures·"2026-27 시즌" 문구를 기대하는 테스트는 **동결한 2026-27 사본**을 읽는다(`fixtures/season-2026/competitions.json` — 손으로 고치지 않는다, 읽기 도우미 `tests/support/season-2026.ts`). 설정 시즌만 2027로 바꾼 실험(2026-11-03, 단위 테스트 전체)에서 이 테스트들은 더 이상 깨지지 않는다. 시즌을 바꿀 때 고칠 것은 설정 자체를 검사하는 테스트뿐이다.
- **전환 때 고친다 — 팀 목록(새 시즌 fixtures 필요)**
  - `tests/team-leagues.test.ts`: 리그 96·전체 111·UCL 21 리터럴, 순위표 fixture 이름(`standings-*-2026-10-11.json`), `teams-<code>-${TEAM_LEAGUES_SEASON}.json`(B1 `--write`가 만든다). 두 단계 사이에는 UCL fixture를 UCL 대회 시즌으로 읽게 한다.
  - `tests/team-slugs.test.ts`(같은 teams fixtures)
  - `tests/names-ko-dict.test.ts`: `SEASON_TEAMS`(순위표 fixture), 111 리터럴, 확인 대기 목록(승강이 있을 때)
  - `tests/team-colors.test.ts`: 111 리터럴(팀 수가 바뀔 때)
- **전환 때 고친다 — 산출물**: `tests/og.test.ts`(커밋된 `public/og` = 지금 입력 — J 뒤 통과)
- **설정을 따라간다**: `tests/tonight.test.ts`(더비 두 팀 같은 리그 — B7) · `tests/transfer-windows-config.test.ts`(F)
- **동결 사본으로 옮긴 테스트**(전환과 무관 — 손대지 않는다): `brief-empty` · `brief-rest` · `states` · `today-brief` · `rest-period` · `competition-page`(화면 코드의 `loadCompetitionsConfig()`를 vi.mock으로 사본에) · `publish-gate` · `team-page` · `football-data-competition` · `competition-file`(사본을 직접 읽음) · `collect-football-stages` · `collect-matchdata`(configs 사본 루트 `season2026Root()`). 새로 고정 날짜 테스트를 쓸 때도 이 도우미를 쓴다.

### J. OG 다시 굽기
- `npm run build:og`(`npm run build`의 첫 단계와 같다): 대회 OG(시즌 표기)와 새 팀 OG를 굽고, 목록에 없는 PNG(빠진 팀)는 지운다(`scripts/build-og.ts`). `public/og/` 변경을 같은 커밋에 넣는다.
- 다음 봇 발행 커밋도 올리지만, 그 전에 `tests/og.test.ts`가 push 검사에서 실패하므로 함께 올린다.
- 확인: `npx vitest run tests/og.test.ts` · `git status public/og`.

### K. 검증·배포
- 순서: `npm run new-season:check -- --season S` → `npm run validate` → `npm run check` → `npm run format:check` → `npm run build` → `npm run test:e2e`(팀·대회 페이지·링크 무결성 — `tests/e2e/team.spec.ts`) → `npm run check:bundle`.
  - 점검 목표: 1단계 뒤 = UCL 대기 경고만 · A2 뒤 = 오류·경고 0.
- 수집 흐름 소량 확인(선택): `npm run collect -- --limit 5 --dry --mock`. LLM 비용은 없지만 **피드와 축구 데이터 API를 부른다** — 06:00~08:00 KST를 피하고 API-Football 개발 호출 하루 50건 이내(§6.4).
- push(06:00~08:00 KST 제외, `git pull --rebase` 먼저) → `ci.yml` 통과 → `deploy.yml`.
- 다음 날 아침 발행 뒤 확인: `data/runs.json` 상태 success · `data/competitions/*.json` `season = S`·새 팀 · 대회·팀 페이지에 새 시즌 팀 · 원장 meta(E) · 브리핑의 승격 팀 이름이 한글.

### A2. UCL — 2단계 (리그 페이즈 추첨 뒤)
- `competitions.json` UCL: `season = S` · `startDate`(리그 페이즈 첫 경기)·`endDate`(결승) · `teamCount`(36 — 대회 방식이 바뀌면 규정대로) · `zones`(16강 직행·PO — UEFA 규정 확인).
- B1을 다시 돌려 `teams-cl-<S>.json`을 받는다. 이어서 `UCL_TEAMS`(slug 순) · team-ids(5대 리그 밖 새 참가 팀 추가, 지난 시즌 5대 리그 밖 팀 제거) · 컬러 · 표기 · `npm run build:teams` · J · T의 UCL 부분.
- 확인: 점검 오류·경고 0(남은 참고는 다음 수집 몫) · K.

## 정해진 결정 (2026-11-03 사용자 결정 — PRD §15)
1. **원장 새 시즌 since** = 자동 초기화(E). 스키마 변경 없음.
2. **지난 시즌 팀(강등·UCL 탈락)** = 팀 페이지를 내린다. `build-teams --prune`을 사람이 실행한다(B10). 표기 사전은 유지.
3. **지난 시즌 순위·대회 데이터** = git 이력에만(새 시즌 수집이 `data/competitions`를 덮어쓴다).
4. **전환 방식** = 2단계(리그 7월 · UCL 추첨 뒤).
5. **시즌 고정 테스트** = 동결한 2026-27 사본(`fixtures/season-2026/competitions.json` · `tests/support/season-2026.ts`)으로 옮겼다(T).

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 단계별 변경안: [그대로 반영 (추천)] / [항목별 수정] / [이 단계 보류].
- 팀 수가 바뀌어 주간 LLM 요청이 늘 때: [예상 비용 보고 후 진행] / [보류] — §1-3, 반드시 묻는다.
- 스키마 필드 추가·공개 URL 변경이 필요하면 중단하고 질문한다(CLAUDE §2·§8).

## 금지 사항
- 금지 사이트(Transfermarkt·FBref·WhoScored·SofaScore·FotMob·네이버·다음·X)를 출처로 쓰지 않는다(§1-5). 구단 로고·선수 사진을 쓰지 않는다(§1-6).
- 출처로 확인하지 못한 날짜·명단·색·API id를 채우지 않는다(§1-7). 유럽 대항전 구간에 관행값을 넣지 않는다.
- `.env*`를 읽거나 키를 출력하지 않는다(§1-8). `data/`를 손으로 고치지 않는다 — 생성 스크립트·다음 수집이 만든다(§8). 원장 meta도 마찬가지다.
- 06:00~08:00 KST에 push하지 않는다. force push·`reset --hard`로 이력을 지우지 않는다.

## 완료 보고 형식
```
## /new-season 결과 — <시즌> (<1단계|2단계>)
| 단계 | 상태(완료/보류/해당 없음) | 변경 파일·항목 수 | 근거 URL |
|---|---|---|---|
점검: npm run new-season:check -- --season <S> → 오류 n · 경고 n (남은 것과 이유)
검증: validate · check · format:check · build · test:e2e 결과
사용자 결정: ①~⑤ 결정 내용(또는 대기)
남은 일과 예정일: (예) 2단계 UCL — 리그 페이즈 추첨 뒤 · 겨울 이적 창 — 발표 뒤 · 유럽 대항전 구간 — 다음 해 3월 전후
```
