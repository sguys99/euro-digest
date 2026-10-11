# fixtures/football/ — 축구 데이터 API 원본 응답 샘플 (M0-35)

football-data.org v4와 API-Football v3 무료 플랜의 **실제 응답**에서 테스트에 필요한 대표 샘플만 남겼다. 어댑터·브리핑 입력 빌더 단위 테스트의 입력이다(M1-44·M1-48·M1-19·M1-24·M2-02·M2-07·M3-02·M3-03).

> **재수집 불가 — 지우지 말 것.** API-Football 무료 플랜은 날짜 조회가 오늘(UTC) ±1일만 열려 지난 날짜의 경기 목록을 다시 받을 수 없다. 순위표도 그 시각의 값만 받을 수 있다. M1-48 단위 테스트는 이 폴더만 쓴다.

## 수집

| API | 원본 작업 | 요청 시각 (UTC) | 이 폴더 파일 |
|---|---|---|---|
| football-data.org v4 | M0-28 | 2026-10-10 12:20~12:25 | 대회 메타·UCL 순위·전날 순위 스냅숏·득점 순위·대회별 경기·시즌 경기(트리밍)·경기 상세 |
| football-data.org v4 | M0-34 | 2026-10-11 06:45~06:46 | 5대 리그 순위(2026-10-11)·2026-10-10 경기·2026-09 경기(트리밍) |
| API-Football v3 | M0-29 | 2026-10-10 12:44~12:48 | 경기 단건 1575167·오류 응답 3개 |
| API-Football v3 | M0-34 | 2026-10-11 06:47~06:49 | 날짜 응답 2개(트리밍)·경기 단건 7개 |

- 이번 작업(M0-35)에서는 **새 API 호출을 하지 않았다.** 위 작업들이 받아 둔 원본에서 골랐다.
- 파일별 엔드포인트(키 없는 경로)·요청 시각·기준일·포함 경기 id·경계 사례 태그는 `index.json`의 `files[]`에 있다. 태그 뜻은 `tagLegend`, 없는 경계 사례는 `missing`에 있다.
- `index.json`의 `matchIdPairs`·`teamIdPairs`는 두 API에서 같은 경기를 찾아 뽑은 id 쌍이다. 대응표 설계(M1-44·M1-48)의 참고값이고 확정 대응표가 아니다. 두 API는 같은 숫자 id가 다른 팀을 가리키기도 한다(`idCollisions` — 57은 football-data 아스널, API-Football 입스위치).
- `brief:<날짜>` 태그는 `fixtures/brief-sample.json`의 그날 입력·근거 경기다.

## 지운 것과 그대로 둔 것

- **이미지 URL**: `crest`·`emblem`·`flag`(football-data), `logo`·`photo`·`flag`(API-Football)은 키를 남기고 값을 `null`로 바꿨다. 버림 동작을 테스트할 수 있게 **두 파일만** 값을 자리값 `https://example.invalid/stripped.png`로 두었다(`football-data/standings-pl-2026-10-11.json`, `api-football/fixtures-id-1575180.json` — 태그 `logo-key-kept`). 원래 `null`이던 값은 그대로다.
- **배당·요금제**: football-data `odds`(유료 상품 안내 문구)는 키째 지웠고, 교차 엔드포인트의 `filters.permission`(요금제 등급)도 지웠다. 계정 정보가 든 API-Football `/status` 응답과 요청 헤더·키는 넣지 않았다.
- **트리밍**: 일부 파일은 항목만 줄였다(`index.json` `trimmed`에 규칙과 원래 건수). 이때 API-Football `results`와 football-data `resultSet`(count·first·last·played·competitions)은 남긴 항목 기준으로 다시 셌다.
- **그대로 둔 것**: 나머지 키 이름·순서·중첩·`null`·시각 표기(football-data `…Z`, API-Football `+00:00`)·이름 철자. 파일은 응답 전송 형식(공백 없는 JSON)이고 Prettier 대상이 아니다.
- 시즌 단위 응답(`season=2026`의 standings·players 등)은 무료 플랜에서 막혀 오류 샘플 1개(`errors-plan-season.json`)만 두었다. 분리 엔드포인트(`/fixtures/events`·`lineups`·`players`), `leagues`·`squads`는 넣지 않았고, 시즌 전체 경기 목록(PL 380·UCL 144경기)은 한 라운드만 남겼다(`season-*-md*.json`).

## 약관·출처 표기 (M0-28·M0-29 판정)

- **football-data.org**: 약관 7.1에 따라 화면에 **"Football data provided by the Football-Data.org API"**를 영문 그대로 표기한다(FR-45). 9.1에 따라 구독을 해지하면 이 데이터를 참조할 수 없으므로 이 폴더도 지울 대상이다(git 이력에는 남는다).
- **API-Football**: 출처 표기 의무는 없지만 병기를 권장한다. 데이터 재판매는 금지다. 그래서 원본 덤프를 공개하지 않고, 테스트에 필요한 대표 경기만 둔다.
- 로고·사진은 두 약관 모두 권리자 저작물이라 쓰지 않는다(CLAUDE.md §1-6).

## 어댑터가 알아야 할 것 (M0-28·M0-29에서 확인)

- **오류도 HTTP 200** (API-Football): 정상 `errors: []`, 오류는 객체다(`errors.plan`·`errors.search`). 상태 코드보다 `errors`를 먼저 검사한다. `errors.plan`은 재시도하지 않고 FR-65 폴백으로 강등한다.
- **시각**: API-Football `fixture.date`는 `+00:00` 오프셋이라 경계에서 `Z`로 바꾼다. football-data는 `Z`다.
- **승부차기 점수 위치가 반대**: football-data는 `score.fullTime`에 승부차기 골이 들어가고 `regularTime`·`extraTime`·`penalties`가 따로 붙는다(문서 예시 — 이 폴더에는 사례 없음). API-Football은 `goals`·`score.fulltime`에 넣지 않고 `score.penalty`에 따로 둔다(`fixtures-date-2026-10-10.json`의 1639860).
- **골·도움은 `events`에서 센다**: `players[].statistics[0].goals.total`이 응답에 따라 0 또는 `null`이다(1575167은 null). `Goal`/`Missed Penalty`는 골이 아니다. 교체 이벤트는 `player`가 나간 선수, `assist`가 들어온 선수다.
- **선발은 `lineups[].startXI`**: `games.substitute`는 믿을 수 없다(1575167은 교체 투입 선수가 true, 2026-10-11 수집분 7개는 전원 false).
- **한국 선수는 `apiFootballId`로 매칭**한다. 이름 표기가 응답마다 다르다("Kim Min-Jae"·"Kim Min-jae"). 김지수는 id가 `null`이라 매칭되지 않는다(1557418).
- **football-data 상태**: `IN_PLAY`·`CANCELLED`에도 `score.fullTime`(0:0)과 `winner`("DRAW")가 채워져 온다. status로 걸러야 한다(560593·564698).
- **football-data 순위표**: `TOTAL`만 있고 `form`은 항상 `null`이다. `prevPos`는 없어 전날 스냅숏과 비교해 계산한다(`standings-pl·pd-2026-10-10` ↔ `-2026-10-11`). 진행 중 경기도 순위표에 반영된다(2026-10-10 스냅숏). UCL은 36팀 단일 테이블이다(`LEAGUE_STAGE`, `"League phase"`).
- **football-data 엔드포인트**: 교차 `/v4/matches`는 `dateTo` 당일을 빼고 준다(`matches-6comps-2026-10-10.json` — dateTo=10-11 요청, 10-10만 옴). 대회별 엔드포인트를 쓴다. 무료 경기 상세에는 `goals`·`lineups`가 없다(`match-564706.json`). 먼 라운드의 `TIMED` 시각은 임시값이다(`season-pl-md13.json`). UCL 대회 메타 `endDate`는 리그 페이즈 끝이다(`competition-cl.json`).
- 득점 순위의 `assists`·`penalties` `null`은 0으로 바꾸지 않는다.

## 다시 만들 때

원본은 세션 scratchpad에만 있었고 생성 스크립트는 일회성이라 저장소에 없다. 새 샘플을 더할 때는 06:00~08:00 KST를 피해 CLAUDE.md §6.4 호출 정책(동시 1개, 응답 후 6.5초 간격, API-Football 개발 호출 하루 50건 이내)을 지킨다. 원본은 저장소 밖에 두고 위 규칙대로 지운 뒤 넣는다. `index.json`도 갱신하고 `npm run test -- tests/fixtures-football.test.ts`를 통과시킨다.
