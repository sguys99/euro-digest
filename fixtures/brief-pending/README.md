# fixtures/brief-pending/ — 2026-10-25 호 사건 재현 (PRD §15 D60)

브리핑 결과 보충(API-Football)·결과 지연(`results-pending`) 구분의 단위 테스트 입력이다(`tests/brief-supplement.test.ts`).

## 사건

2026-10-25 08:42 KST 수집(run 40143777845)에서 football-data `/matches`가 브리핑 창(UTC 2026-10-24, 토요일)의 대상 대회 19경기를
킥오프 10시간 뒤에도 `IN_PLAY` 5 · `TIMED` 14로 줬다 → 종료 경기 0 → 브리핑 mode `empty` → 홈에 "전날 6개 대회에 끝난 경기가
없었습니다"가 게시됐다(사실과 다름). 같은 실행의 API-Football은 19경기 상세를 모두 받았다(`brief-ready complete details 19`).
21:07 KST 재수집(run 40191669281)에서도 football-data는 19경기 미종료였고, API-Football 상세는 원장(`data/matches`)에 있었다.

## 파일

| 파일 | 내용 | 출처 |
|---|---|---|
| `af-ledger-2026-10-24.json` | 경기 기록 원장 형식(`MatchLedgerFileSchema`)의 UTC 2026-10-24 19경기 — 상태 FT·스코어·득점 | `data/matches/2026-10.json`(그날 prod 실행이 쓴 원장)에서 그대로 발췌 |
| `fd-matches-2026-10-24-stale.json` | football-data `/v4/matches` 응답 모양의 **합성** 19경기 — 모두 미종료 | 아래 규칙으로 만든 합성 값 |

`fd-matches-2026-10-24-stale.json` 합성 규칙 (football-data 원본 응답은 저장하지 않았다):

- 대회·킥오프·상태 분포는 실제 로그의 `windowStatus`(IN_PLAY 5 · TIMED 14)와 같다. 분데스리가 13:30 다섯 경기 중 IN_PLAY였던 1경기는
  로그에 경기 구별이 없어 원장 id 순 마지막 경기(파더보른–함부르크)로 두었다.
- 점수는 비웠다(`null`) — 미종료 경기의 점수는 어댑터가 읽지 않는다.
- 경기 id는 합성 값(990001~990019, 킥오프·원장 id 순). 실제 football-data id가 아니다.
- 팀 id: `configs/team-ids.json`에 있는 팀(af id로 찾음)은 그 표의 football-data id, 없는 팀은 합성 값 900001~900017. 팀 이름은
  API-Football 원장 표기를 그대로 썼다(football-data 표기 아님).

합성 값이 섞여 있으므로 디자인 시안·문서의 사실 근거로 쓰지 않는다.
