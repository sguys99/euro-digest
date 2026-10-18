# fixtures/llm/golden/ — 브리핑 골든셋 (M1-24)

일일 브리핑("오늘의 5줄") 지시문·검사기를 바꿀 때 **같은 10일치 입력**으로 출력과 판정을 비교한다(PRD §9.2 "브리핑은 10일치 입력", CLAUDE.md §6.3). 도구는 `npm run eval:prompt`(`scripts/eval-prompt.ts` → `scripts/lib/eval-prompt-run.ts`).

기사 텍스트(제목·설명·본문)·이미지 URL·비밀값은 없다 — football-data 결과·순위와 API-Football 득점(정형 데이터)만 있다(D23·D24).

## 파일

| 경로 | 내용 |
|---|---|
| `index.json` | 10일 목록 — 발행일(KST)·한 줄 설명·태그·M0 입력 키(`m0`)·출처(`provenance`). zod `GoldenIndexSchema`(`scripts/lib/golden.ts`) |
| `sources/<날짜>.json` | **빌더 입력**(내부 형식) — football-data 종료 경기(`FinishedMatch`), 순위(`BriefStandingsSource` — 빌더가 읽는 칸), 연결된 득점 목록(`MatchGoal[]`). 외부 API 원문이 아니라 어댑터(`toFinishedResults`·`toCompStandings`·`toMatchDetail` + `linkMatchDetails`)를 거친 값이다 |
| `inputs/<날짜>.json` | **LLM에 보내는 입력** = `buildBriefInput`(M1-19 확정 빌더) → `canonicalizeBriefInput`(M1-21). 소스 + configs(competitions·names.ko·korean-players·team-ids)에서 결정적으로 다시 만든다 |
| `runs/<라벨>/run.json` | 실행 기록 — 날짜마다 출력 원문·치환 뒤 문장·판정(`judgeBriefResponse` 첫 시도)·줄별 사유 코드·같은 근거의 템플릿 줄·토큰(thinking)·비용·지연, 지시문 판(`promptId`·`prompt`)·검사기 판(`checker.id` — 판정 코드 파일 해시). zod `EvalRunSchema`(`scripts/lib/brief-eval.ts`) |

mock 응답은 `../mock/by-id/golden-<날짜>.json`(base)·`golden-pre-<날짜>.json`(🧪 pre 변형)이다 — live 실행의 `--update-mock`이 쓴다. by-id라 지시문이 바뀌어도 같은 출력을 재생한다(지시문 비교는 live로).

## 10일

| 발행일 | 경기 | 덮는 유형 | M0 기준선 |
|---|---|---|---|
| 2026-02-26 | 4 | UCL 2025-26 플레이오프 2차전 — 연장(90분 3-0 → 연장 3-2, 두 경기 합산 연장), 대승, 무승부, 순위 없음 | — |
| 2026-05-31 | 1 | UCL 2025-26 결승 — 연장까지 1-1, 승부차기 4-3(중립 경기장) | — |
| 2026-09-11 | 6 | UCL 리그 페이즈 MD1 + 순위(입력 B) | B |
| 2026-09-19 | 5 | 09-18 UTC 전부, 7-0·득점자(입력 A는 2경기만) | A |
| 2026-09-21 | 20 | 바쁜 날(득점 데이터 없음, 입력 D는 EPL 4경기만) | D |
| 2026-10-10 | 3 | 적은 날, 막판 동점골(입력 C) | C |
| 2026-10-11 | 23 | 경기 많은 날, 득점 13경기·5대 리그 순위(입력 E) | E |
| 2026-10-14 | 9 | UCL MD2 첫날 — 3-3·3-4·1-4, 순위 없음 | — |
| 2026-10-15 | 9 | UCL MD2 둘째 날 + 순위 — 6-0·3-6·2-4 | — |
| 2026-10-17 | 4 | 금요일 4경기, 득점·4개 리그 순위(봇과 같은 경로로 받은 날) | — |

- 입력 창은 봇과 같다 — 발행일 D의 입력 = UTC 하루 D-1에 킥오프한 종료 경기(M1-19).
- 순위는 그날 아침 표를 다시 받을 수 없는 날이 있다: 2026-09-19·09-21·10-10은 M0-30 입력(fixtures/llm/brief-inputs)의 순위 행(M0-30이 시즌 경기 목록에서 계산)을 옮겼고 승·무·패 수가 없다(빌더는 읽지 않는다). 10-10 리그 1은 M0 행이 1~3위 + 7위뿐이라 입력이 3행이다. 2026-10-14는 MD2 절반만 끝난 표를 받을 수 없어 순위가 없다.
- 2026-10-11 득점은 API-Football 단건 7경기(저장소 fixture) + M0-34 입력 E goals 6경기(같은 응답에서 옮긴 것, 원문은 저장소에 없음).
- 2026-02-26의 round는 `PLAYOFFS`다 — football-data가 토너먼트 2차전에도 matchday 2를 주지만 `roundLabel`은 stage를 먼저 본다(M1-23 3회차 리뷰 버그 수정 — 리그 페이즈·정규 리그만 matchday 표기, 결승은 `FINAL`). 이 수정으로 이날 입력 해시가 바뀌어 이전 실행과의 비교에 '입력 다름'이 붙는다.

## 실행

```bash
npm run eval:prompt -- --dry                     # 계획·예상 비용만(호출 없음)
npm run eval:prompt -- --label <라벨>             # 10요청 실호출(dev — data/runs-dev.json) → runs/<라벨>/run.json → 이전 실행과 비교
npm run eval:prompt -- --prompt <지시문 경로>      # 새 지시문 판(파이프라인 반영 전)으로 실호출
npm run eval:prompt -- --rejudge <라벨> --save    # 저장된 출력을 지금 검사기로 다시 판정(LLM 없음 — 검사기 판 비교)
npm run eval:prompt -- --baseline m0              # 기준선 = M0-30·M0-34 지시문의 기존 출력(그 원래 입력으로 판정)
npm run eval:prompt -- --variant pre              # 🧪 사실 선계산 변형(입력 x + 지시문 덧붙임 — brief-precompute.ts, 실험)
npm run eval:prompt -- --mock                     # mock 재생(결정적·무비용, 저장 안 함)
npm run eval:prompt -- --build-golden             # 빌더·configs가 바뀌었을 때 inputs 다시 쓰기(LLM 없음)
```

- 설정은 파이프라인 그대로(단건·`max_tokens` 16,384(D57 — D28 4,096 → D53 8,192 → D57)·요청 타임아웃 120초(D57)·thinking 적응형·`effort` medium·캐싱 끔), 첫 시도만 보낸다(FR-29 재시도 없음). 실행 기록 `settings.requestTimeoutMs`는 D57부터 남는다(그 전 실행은 클라이언트 기본 60초).
- 요청 본문은 파이프라인과 같이 **중요도 순 앞 15경기**(D51 — `briefLlmInput`, 그 대회 경기가 모두 잘린 순위도 뺀다)이고, 판정·템플릿은 전체 입력으로 한다. 잘린 근거 id를 단 줄은 `ref-hidden`으로 강등한다. 상한은 실행 기록 `configs.llmMaxMatches`(설정 판 해시에 포함)에 남고, 상한 기록이 없는 D51 전 실행은 `--rejudge`에서 자르지 않은 입력으로 다시 판정한다.
- 실행 전에 비용 가드(`guardBriefBudget({env:"dev", requests, attempts:1})` — 일 $0.10·월 $3, prod+dev 합산)와 이번 달 dev 사용 알림(50%)이 돈다. 넘으면 부르지 않는다 — `--dates`로 나눠 실행한다.
- live 실행은 잘린 날(max_tokens)이 나오면 그 뒤의 요청을 보내지 않고 멈춘다(실행 기록 상태 `partial` — 사용자 결정 2026-10-17: 판단 기준은 상한에서의 잘림률 — 그때 8,192, D57부터 16,384). 출력 토큰이 6,000을 넘은 날은 멈추지 않고 로그와 run.json `warnings`(`output-over-alert`)에 남긴다 — D57 뒤에는 상한 여유가 아니라 thinking 증가 신호다. 지시문 축소나 `max_tokens` 변경은 사용자 승인.
- D57로 요청 1건의 최악 예상이 약 $0.009가 되어(출력 16,384 × $0.50/M) 10일 전체 실행의 가드 예상이 약 $0.09로 일 예산($0.10)에 가깝다 — 그날 사용이 있으면 `--dates`로 나눠 실행한다.

## 다시 만들 때

새 날짜를 넣으려면 소스를 같은 형식으로 만들고(외부 원문은 저장소 밖에서 어댑터를 거쳐 변환 — API-Football 지난 날짜는 날짜 조회로 다시 받을 수 없다), `index.json`에 출처를 적은 뒤 `--build-golden`. 테스트(`tests/golden.test.ts`)가 목록·소스·입력의 일치, 태그와 입력의 일치, 기사 텍스트·URL 없음을 확인한다.
