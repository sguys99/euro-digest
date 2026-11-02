# fixtures/llm/golden-team/ — 팀 프로필 골든셋 (M4-06)

팀 한줄평 + 강점/약점 지시문(`configs/prompts/team-profile.md`)·검사기(`scripts/lib/team-profile.ts`)를 바꿀 때 **같은 10팀 지표**로 출력과 판정을 비교한다(PRD §9.2 '샘플 10건', CLAUDE.md §6.3). 도구는 `npm run eval:prompt -- --team-profile`(`scripts/lib/team-profile-eval.ts`).

기사·선수·팀 이름·비밀값은 없다 — 대회 파일(football-data 순위표·경기 결과)에서 코드가 계산한 지표뿐이다(D23·D24). LLM에도 팀 이름 없이 기호(t01…)만 간다.

| 경로 | 내용 |
|---|---|
| `inputs.json` | 10팀 지표 스냅숏(`buildTeamMetrics` 결과를 얼린 것 — 2026-11-02 data/competitions). `--build-golden`으로 다시 쓴다(LLM 없음 — 다시 쓰면 이전 실행과 입력이 달라진다) |
| `runs/<라벨>.json` | 실행 기록 — 팀별 출력·판정 사유·토큰(thinking·캐시)·비용·지시문 판 |

mock 응답은 `../mock/by-id/team-profile-golden-g1.json`(live `--update-mock`).

## 10팀

| 팀 | 덮는 유형 |
|---|---|
| arsenal | 리그 선두 + UCL 16강 직행권, 4연승 |
| barcelona | 리그 최다 득점(46골) 선두 + UCL |
| atletico-madrid | 리그 최소 실점·7연승 + UCL 플레이오프권 |
| lazio | 무패 선두·최소 실점 |
| bayern-munchen | 무패 선두·최다 득점 + UCL |
| hull-city | 무승부가 많은 중위권(7경기 무승) |
| napoli | 중위권 + UCL |
| eintracht-frankfurt | 순위표 8경기·경기 목록 7경기(D60) — 홈/원정·연속·무실점 값 없음 |
| le-havre | 무승·5연패 최하위(강등권) |
| malaga | 11경기 무승 최하위 |

## 실행

```bash
npm run eval:prompt -- --team-profile --dry            # 계획·예상 비용만
npm run eval:prompt -- --team-profile --label <라벨>     # 1요청 실호출(dev — data/runs-dev.json) → runs/<라벨>.json → 이전 실행과 diff
npm run eval:prompt -- --team-profile --mock           # mock 재생(결정적·무비용, 저장 안 함)
npm run eval:prompt -- --team-profile --update-mock    # live 출력을 mock fixture로
```

## 실행 기록

| 라벨 | 지시문 | 통과 | 출력(thinking) | 비용 |
|---|---|---|---|---|
| 2026-11-02-v0.1 | v0.1 | 10/10 | 11,523 (10,417) | $0.003159 |
| 2026-11-02-v0.2 | v0.2 — 강점/약점 '뜻이 드러나는 지표' 규칙 | 9/10 → 검사기 '16강' 수 예외 뒤 10/10(mock 재생) | 14,915 (13,805) | $0.004019 |
