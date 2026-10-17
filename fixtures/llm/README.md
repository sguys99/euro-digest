# fixtures/llm/

LLM 응답 샘플. `LLM_MODE=mock`(또는 `--mock`)이면 `scripts/lib/llm.ts`가 실제 API 대신 여기 파일을 읽는다. 결정적이고 비용이 없다 (CLAUDE.md §6.3). Vitest는 항상 mock이다.

일일 LLM 호출은 정형 경기 데이터로 쓰는 한국어 브리핑("오늘의 5줄")뿐이다(PRD §15 D24). 뉴스 기사는 LLM에 보내지 않으므로(D23) 기사 요약 응답 fixture는 두지 않는다. 주간 호출(팀 한줄평+강점·약점, 한국 선수 주간 총평)의 mock은 M3·M4에서 추가한다.

> **M1-20 확정 (2026-10-17)** — 출력 zod 스키마는 M0-30 임시 스키마의 짧은 키 `{ l: [{ t, r }] }`를 그대로 확정했다(`scripts/lib/brief.ts` `BriefOutputSchema` — 아래 "출력 스키마"). 그래서 `mock/by-id/brief-*.json`은 **형식 때문에 다시 만들지 않았고** note와 `brief-cases.json` 기대값만 D40 판정으로 고쳤다. 단 mock의 `text`는 **M0-30·M0-34 임시 프롬프트**의 출력이다 — 지시문 v0.1(`configs/prompts/summarize.md`)의 실제 출력은 병합 뒤 dev 소량 실행(💰 M1-20)과 골든셋(M1-24, `npm run eval:prompt`)으로 더한다(비용은 `data/runs-dev.json`).

## mock/ — 요청별 응답

```
mock/
  by-id/<customId>.json       # 1순위: 요청의 customId(브리핑 날짜·팀 묶음 ID 등)로 찾는다
  by-hash/<h_해시>.json        # 2순위: system + user 내용 해시로 찾는다 (지금은 비어 있음 — 골든셋 M1-24 후보)
```

- 조회 순서는 `by-id` → `by-hash`. 둘 다 없으면 `LlmMockFixtureError`가 나고, 오류 메시지에 만들어야 할 파일 경로가 나온다.
- 해시 키는 `mockRequestKey({ system, user })` = `h_` + sha256(`system` + `\0` + `user`) 앞 16자리. 모델·max_tokens는 키에 들어가지 않는다. 프롬프트(`configs/prompts/*.md`)를 바꾸면 해시도 바뀐다.
- 배치는 제출 즉시 끝난(ended) 상태가 된다. 단건 호출(`callSingle`)에는 `succeeded`·`errored`만 쓸 수 있다.
- 같은 customId에는 언제나 같은 응답이 온다. 그래서 같은 id로 다시 부르는 재시도는 같은 결과가 된다.

### customId 규칙 (브리핑)

| 형식 | 뜻 |
|---|---|
| `brief-YYYY-MM-DD` | **발행일(KST) 정상 응답** — 그날 입력 `brief-inputs/YYYY-MM-DD.json`(briefDate)에 대한 실제 모델 출력. M1-45가 발행일로 customId를 만들면 mock 실행이 이 파일을 찾는다. 날짜 형식 id는 이 용도로만 쓴다(실패 사례에 날짜를 넣지 않는다). |
| `brief-YYYY-MM-DD-r1` | 예약(아직 없음) — 재시도 응답. M1-45가 재시도 customId를 이렇게 정하면 "재시도 뒤 성공" 경로를 fixture로 시험할 수 있다. |
| `brief-case-<유형>` | 실패·경계 사례. 날짜가 없어 발행일 id와 겹치지 않는다. 같은 유형의 두 번째는 `-2`. |
| `golden-YYYY-MM-DD` · `golden-pre-YYYY-MM-DD` | 골든셋(`golden/` — M1-24) 실측 응답. `npm run eval:prompt` live 실행의 `--update-mock`이 쓰고 `--mock`이 재생한다(base = 지시문 v0.1, pre = 🧪 사실 선계산 변형). note에 실행 라벨·지시문 판·thinking·지연 |

단건 호출의 customId는 API로 보내지 않는다(mock 조회·로그에만 쓰인다). 형식 제약은 배치와 같은 `^[a-zA-Z0-9_-]{1,64}$`.

## 파일 형식 (zod `MockFixtureSchema`, 키는 API 응답 이름을 따른다)

```jsonc
// 성공 — text는 모델이 낸 원문 출력(문자열). 출력 JSON 형식은 프롬프트가 정한다(브리핑은 M1-20 확정 스키마)
{ "type": "succeeded", "text": "...", "stop_reason": "end_turn",
  "usage": { "input_tokens": 250, "output_tokens": 150,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0 } }
// stop_reason 생략 시 end_turn. "max_tokens"·"refusal"이면 실패 결과(과금됨)로 처리되고 text는 버려진다
// usage 생략 시 0 — 비용 계산 테스트에 쓰려면 기록한다. thinking 토큰 칸은 없다(output_tokens에 포함)

{ "type": "errored", "error": { "type": "invalid_request_error", "message": "..." } }
// error.type은 API 오류 type(rate_limit_error·overloaded_error 등) 또는 connection_error(연결 오류·타임아웃 흉내)
{ "type": "expired" }
{ "type": "canceled" }
```

모든 형식에 사람용 메모 `note`(문자열)를 붙일 수 있다.

### llm.ts가 이 fixture를 처리하는 방식 (단건 `callSingle`, 2026-10-11 확인)

| fixture | 결과 | 재시도 | usage |
|---|---|---|---|
| `succeeded` + `end_turn` | `ok:true`, `text` | — | 기록값 |
| `succeeded` + `max_tokens` | `ok:false`, `errorType:"max_tokens"`, `retryable:false` | 없음 | 기록값(과금) |
| `succeeded` + `refusal` | `ok:false`, `errorType:"refusal"`, `retryable:false` | 없음 | 기록값(과금) |
| `errored` 429·5xx 성격(`rate_limit_error`·`api_error`·`timeout_error`·`overloaded_error`) | `ok:false`, `retryable:true` | 최대 2회 더(마감을 넘기는 대기는 안 함) | 0 |
| `errored` 4xx 성격(`invalid_request_error` 등) | `ok:false`, `retryable:false` | 없음 | 0 |
| `errored` `connection_error` | `ok:false`, **`retryable:true`(힌트)** | **없음**(중복 과금 위험) | 0 |

`retryable`은 호출부용 힌트다. 연결 오류는 llm.ts가 단건에서 재시도하지 않는데도 힌트가 true다(배치 결과 수거 같은 읽기 맥락 기준). 브리핑 호출부(M1-45)는 이 힌트만 보고 다시 보내지 않는다.

## 지금 있는 파일

| 파일 | 용도 |
|---|---|
| `mock/by-id/m0_sample_ok.json` | 전송 계층 테스트용 성공 응답(usage 포함) — M0-20 |
| `mock/by-id/m0_sample_errored.json` | 전송 계층 테스트용 errored 응답 — M0-20 |
| `mock/by-id/brief-*.json` (31개) | 일일 브리핑 mock — 발행일 정상 응답 5개 + 실패·경계 사례 26개 (M0-36, 아래 표) |
| `brief-cases.json` | 브리핑 mock 기대 판정 표 — 케이스별 원천 입력·단계·FR-29 판정·줄별 근거 (M0-36) |
| `brief-check-probes.json` | 사실성 검사기 회귀 문장 1,522개 — 리뷰 1회차 158개(거짓 112 · 참 46: 결과 동사 동의어·경기 중 점수 방향·숫자 없는 득점·도움·자책골·종류 모르는 숫자·prev 없는 순위 변동 동의어·장소·소속·대회), 2회차 511개(거짓 348 · 참 163: 명사형 결과어·목록 밖 술어·소유 골 명사·실점 술어·흐름·시간 낱말·도움 짝·근거 교차·한국 선수 서술·부정·입력에 없는 내용 …, 판단 보류 40개 제외), 3회차 788개(거짓 386 · 참 402: 손으로 쓴 재현 316 — 녹아웃 승점·분 목록 도움·다른 순위표·공동·두 절 다른 경기·주고받은 골·연장 결승골·해트트릭 수 …, 판단 보류 21개 제외 + 이전 판 b06ce02를 통과한 변이 472 — 독립 판정(오라클)), 4회차 65개(거짓 49 · 참 16: 입력 밖 한국 선수 경기·결과 아닌 절 뒤 순위 꼬리·경기와 다른 대회 순위표·후보 여럿·승부차기 점수 순서·합산 승부차기 승리·prev 일부 행, 판단 보류 5개 제외). `truth` = 사람(또는 오라클) 판정, `pass` = 기대 판정 — 거짓은 모두 강등, 참이 `pass:false`면 닫힌 문법(D50·D53 ② 축소) 밖의 꼴이거나 안전한 쪽 규칙(`code`)에 걸린 것(note에 이유 — D55 ② 뒤로 홈-원정 순서 승패 문장 참 15개는 `score-order`). 입력은 `inputs`(골든셋·합성 `r3-syn-*` 포함). 사람이 쓴 시험 문장이다(LLM 출력 아님) — `tests/brief-check.test.ts` (M1-23) |
| `brief-inputs/` | 브리핑 정형 입력 6일치(M0-30 A~D · M0-34 E·F) + E 메타 + 임시 프롬프트 2개 + 임시 고유명사 사전 (M0-36, M1-24 골든셋 씨앗) |
| `golden/` | 브리핑 골든셋 10일치 — 소스·확정 빌더 입력·실행 기록(`golden/README.md`, M1-24) |
| `mock/by-id/golden-*.json` (20개) | 골든셋 실측 응답 — v0.1 10개 + 🧪 pre 변형 10개(2026-10-17, M1-24) |

골든셋(`golden/` — 브리핑 입력 10일치, `npm run eval:prompt`)은 M1-24에서 추가했다(`brief-inputs/` 5일 + football-data·API-Football 실응답 5일 — `golden/README.md`). 기사 텍스트(본문·제목·설명)·이미지·비밀값은 넣지 않는다.

## 브리핑 mock 케이스 (M0-36)

실제 = M0-30(2026-10-11 01:30 KST 실측 17건 전부)·M0-34(2026-10-11 실측 1건) 모델 원문 그대로, usage도 실측값(thinking 포함, `data/runs-dev.json` 4개 runId). 합성 = 실제 사례가 없는 유형만, 실제 출력을 최소 변형했다(각 파일 `note`에 "합성 — 무엇을 어떻게").

| id | 유형 | 실제·합성 | 입력 | 기대 판정 |
|---|---|---|---|---|
| `brief-2026-09-11` | 정상 · prev 없는 '올랐다' · 원정 승 홈-원정 순서 | 실제 | B | downgrade-line:4,5 (D40 ③ — M1-20 · L4 D55 ②) |
| `brief-2026-09-19` | 정상 · 한국 선수 | 실제 | A | ok |
| `brief-2026-09-21` | 정상 · 원정 승 홈-원정 순서 | 실제 | D | downgrade-line:2 (D55 ② — 그 전에는 ok) |
| `brief-2026-10-10` | 정상 · 한 줄 두 문장 | 실제 | C | downgrade-line:1 |
| `brief-2026-10-11` | 정상 · 사실 오류 1줄('2골' — 입력 3골) · 원정 승 홈-원정 순서 | 실제 | E | downgrade-line:1,5 (L1 D55 ②) |
| `brief-case-han` | 한자 혼입('出场') | 실제 | A | retry |
| `brief-case-english` | 영어 출력(effort low) | 실제 | A | retry |
| `brief-case-translit` | 모델 음역(고유명사 전부 한글) | 실제 | A | downgrade-line:1,2 (L3~L5 사전 공식 표기 — D40 ④, M1-23) |
| `brief-case-rank-direction` | 순위 변동 방향 오류('7위에 머물렀다' — 6→7) | 실제 | A | downgrade-line:3,4 |
| `brief-case-rank-tie` | 공동 순위 오해('공동 1위' — 1·2위) | 실제 | B | downgrade-line:5 |
| `brief-case-rank-no-prev` | prev 없이 '선두를 유지' | 실제 | C | downgrade-line:5 |
| `brief-case-translit-rank` | 음역 + 근거 없는 순위 서술 | 실제 | C | downgrade-line:1,2,3,4 (L5 사전 공식 표기 — D40 ④, M1-23) |
| `brief-case-short-name-player` | 축약 선수 이름('Olise') | 실제 | A | downgrade-line:4 |
| `brief-case-short-name-team` | 짧은 팀 이름('Lens' — 사전 별칭) | 실제 | B | ok (M1-21 별칭 — M1-23 재정의) |
| `brief-case-short-name-team-2` | 짧은 팀 이름(effort low) | 실제 | B | downgrade-line:5 (L4 사전 별칭 — M1-23, L5 D40 ③ — M1-20) |
| `brief-case-leftover-word` | 영문 일반어('Matchday') | 실제 | C | downgrade-line:1 (L5 파생 숫자 통과 — D40 ②) |
| `brief-case-particle` | 조사 오류('Bayern가' — 보정 대상) + 축약 이름 + 목록 밖 평가어('대파') | 실제 | A | downgrade-line:1,2 (L1 '대파' — 사용자 결정 2026-10-17, L5 '프리미어리그' 통과 — D40 ④) |
| `brief-case-score-winner-first` | 이긴 팀 점수 먼저('1-0으로 이겼다' — ft 0-1) | 실제 | D | ok |
| `brief-case-json-invalid` | JSON 파싱 불가 | 합성 | A | retry |
| `brief-case-json-fenced` | 코드블록으로 감싼 JSON | 합성 | A | ok (코드블록 벗김 — D40 ⑤) |
| `brief-case-missing-key` | 필수 키(r) 누락 | 합성 | A | retry |
| `brief-case-too-many-lines` | 6줄 | 합성 | A | ok (앞 5줄 — D40 ⑤, 임시 스키마에서는 retry) |
| `brief-case-line-over-schema` | 한 줄 150자 초과(치환 뒤 146자) | 합성 | A | downgrade-line:1 (80자 초과 — D40 ⑤, 임시 스키마에서는 retry) |
| `brief-case-score-mismatch` | 입력에 없는 스코어(3-1) | 합성 | A | downgrade-line:4 |
| `brief-case-score-reversed` | 스코어 순서 뒤집힘(0-3으로 꺾었다) | 합성 | A | downgrade-line:4 |
| `brief-case-winner-swap` | 승자 뒤바뀜(스코어는 그대로) | 합성 | A | downgrade-line:4 |
| `brief-case-bad-ref` | 입력에 없는 근거 id | 합성 | A | downgrade-line:4 |
| `brief-case-max-tokens` | `stop_reason: max_tokens`(잘린 JSON) | 합성 | A | retry (출력 전체 실패 — D40 ①) |
| `brief-case-refusal` | `stop_reason: refusal` | 합성 | A | downgrade-all (재시도 없이 템플릿 — D40 ①) |
| `brief-case-errored-overloaded` | 529 과부하 — llm.ts 재시도 대상 | 합성 | A | downgrade-all |
| `brief-case-errored-timeout` | 연결 오류·타임아웃 — 재시도 안 함 | 합성 | A | downgrade-all |

발행일 5개는 `fixtures/brief-sample.json`(D0 시안 입력)과 같은 날·같은 출력이다(가드 테스트가 확인). 단 brief-sample은 표시용이라 2026-10-10 L1(두 문장)·2026-09-11 L5(prev 없는 '올랐다' — M1-20에서 D40 ③으로 확정)를 강등하지 않았다.

### brief-cases.json

FR-29 순서(zod → 출력 전체 코드 검증 → 1회 재시도 → 템플릿, 줄 단위 불일치는 재시도 없이 그 줄만 템플릿)에 맞춘 기대값이다. M1-23·M1-45 테스트가 그대로 읽는다.

> **M1-23 확정 (2026-10-17)** — 코드 검증기 `scripts/lib/brief-check.ts`(`judgeBriefResponse`)의 판정이 31개 케이스의 `expected`·`stage`와 모두 같다(`tests/brief-check.test.ts`가 고정 — 입력은 `canonicalizeBriefInput`을 거친 입력). D40 ④(모델이 쓴 한글 고유명사는 사전 공식 표기와 같고 대상이 입력에 있으면 허용)와 M1-21 사전 별칭('Lens')으로 4건을 재정의했다: `brief-case-translit` 1~5 → 1,2 · `brief-case-translit-rank` 1~5 → 1~4 · `brief-case-short-name-team` 4 → ok · `brief-case-short-name-team-2` 4,5 → 5. 리뷰 반영(사용자 결정 2026-10-17 — 지시문 목록 밖 평가어 '대파'·'대승'·'신승' 등은 점수 차가 맞아도 그 줄 강등)으로 `brief-case-particle` 2 → 1,2. 사유 코드(`BriefLineReasonCode`)는 M1-24 회귀 비교·M1-43 검수의 기준이다.

- `stage` — 처음 걸리는 단계: `none` · `transport`(llm.ts 실패) · `zod` · `whole`(한국어 비율·한자) · `line`
- `expected` — `ok` · `retry`(같은 응답이 다시 오면 `downgrade-all`) · `downgrade-line:<n>[,<n>]` · `downgrade-all`
- 판정 기준이 아직 없으면 `expected` 대신 `candidates`(케이스 전체) 또는 `undecidedLines`(일부 줄)에 둔다. 테스트는 미정 항목을 단정하지 않는다
- `llm` — `callSingle` 결과 기대(ok·errorType·retryable·시도 횟수)
- `lines[]` — 눈여겨볼 줄: `code`(`pass` = 오탐하면 안 되는 함정 · `downgrade` · `whole` · `fix` = 조사 보정 대상 · `undecided`), `human`(사람 검토 판정), `why`
- `review` — 실제 출력의 사람 검토 수(M0-30 review·M0-34 판정): ok·error(틀린 사실)·unsupported(입력에 근거 없음)
- `traps` — 검사기 구현 함정(이름 속 숫자 'Como 1907', 한국어 비율은 이름을 지운 뒤 비교, 숫자 대조는 근거 id 범위, 스코어 두 순서, 순위 동사 등)

## brief-inputs/ — 브리핑 정형 입력 (M0-30·M0-34 임시 형식 — 바이트 그대로 보존)

> **M1-19 확정 형식과의 차이** (2026-10-16, `scripts/lib/brief-input.ts` 머리 주석이 기준): 이 폴더의 파일은 mock 출력의 근거라 고치지 않는다. 확정 빌더는 ① 경기를 **중요도 순**(한국 선수 소속팀·UCL·빅클럽·리그·상위 맞대결·다득점)으로 정렬하고 상한 30경기를 그 순서로 자른다(M0 입력은 킥오프 순) ② 연장·승부차기 경기를 `aet: true`·`regular`(90분)·`pens`(승부차기, 홈-원정)로 넣는다 ③ `standings`는 확정 순위표(진행 중 경기가 있는 대회 제외)의 상위 4위까지(공동 순위 포함), `note`는 `"current table, top 4 positions only"`, `prev`는 없다(M2-03) ④ `korean`은 없다(M3-03) ⑤ 대회 이름은 `competitions.json` nameEn(`"UEFA Champions League"` — B는 `"Champions League"`). 입력 창은 M1-19에서 아래 "입력 창"대로 확정했다. 골든셋(M1-24)은 확정 빌더 출력으로 다시 만든다.

그날 순위표 등은 다시 받을 수 없어(API 날짜 창·현재 순위만 제공) M0-30·M0-34 scratchpad 원본을 바이트 그대로 옮겼다. 요청의 user 메시지 = 파일 내용 `.trim()`.

| 파일 | 키 | 발행일(KST) | 내용 | LLM 출력 |
|---|---|---|---|---|
| `2026-09-11.json` | B | 2026-09-11 | 09-10 UTC UCL 리그 페이즈 1차전 6경기(득점 없음) + UCL 순위 상위 5(prev 없음). **korean 키 없음**(Bayern 경기가 있어도 김민재를 언급하면 안 되는 시험) | M0-30 |
| `2026-09-18.json` | F | 2026-09-18 | 09-17 UTC 라리가 2경기(득점 없음), 순위 없음, korean 없음 | 없음 — 템플릿만 게시한 날 시연(M1-19 템플릿 테스트용) |
| `2026-09-19.json` | A | 2026-09-19 | 09-18 UTC 5경기 중 **2개만**(측정용 부분 입력): EPL 1(득점 없음) + 분데스 1(득점 7개, API-Football) + EPL 순위 5행(prev 있음) + **한국 선수 2명** | M0-30 |
| `2026-09-21.json` | D | 2026-09-21 | 09-20 UTC 20경기 중 **EPL 4개만** + EPL 순위 11행(prev 있음) | M0-30 |
| `2026-10-10.json` | C | 2026-10-10 | 10-09 UTC 3경기 전부(득점 1경기) + 분데스·리그1 순위(prev 없음, 라리가 순위는 진행 중 경기 반영이라 제외) | M0-30 |
| `2026-10-11.json` | E | 2026-10-11 | 10-10 UTC 종료 23경기 전부(취소 1 제외, 득점은 API-Football로 조회한 13경기) + 5대 리그 순위 상위 4(prev 없음) + **한국 선수 5명** | M0-34 |
| `2026-10-11.meta.json` | — | — | E의 입력 창·취소 경기·API-Football↔football-data 경기 id 대응 | — |

- **입력 창(M1-19 확정)**: 발행일 D의 입력 = UTC 하루 D-1에 시작한 종료 경기 = KST [D-1 09:00, D 09:00) — `time.ts` `kstWindowRangeUtc(D-1, {fromKst:"09:00", toKst:"09:00"})`와 같다(E meta로 확인). PRD "전날(KST)"을 KST 달력 하루로 자르면 유럽 저녁 경기(KST 새벽 킥오프)가 다음 날로 밀려 UTC 하루(유럽 현지의 어제 경기 전부)로 확정했다. A·D는 측정용 부분 입력이라 그날 경기 전부가 아니다.
- **필드**
  - `briefDate` — 발행일(KST, YYYY-MM-DD)
  - `matches[]` — `id`(`m` + football-data 경기 id, 예외: A의 `m1575167`은 API-Football 경기 id) · `comp`(대회 표시명) · `round` · `home` · `away` · `ft`·`ht`(**홈-원정** 순서 `"h-a"`) · `goals`(`null` = 득점 데이터 없음 / `[{ min("90+2"), team(골이 기록된 팀), player, assist?, type?("penalty"·"own_goal") }]`)
  - `standings[]` — `id`(`s` + 대회 약칭: sPL·sLL·sSA·sBL·sL1·sUCL) · `comp` · `note?`(순위표 범위) · `rows[{ pos, team, played, pts, gd, prev?(직전 순위 — 시즌 경기 목록에서 코드 계산, A·D만) }]`
  - `korean[]?` — `id`(`k` + API-Football 선수 id) · `player` · `team` · `match`(matches id) · `started`(선발 = 라인업 startXI) · `minutes` · `goals` · `assists` · `subOn?` · `subOff?`. 키가 없으면 한국 선수를 언급하지 않는다
- **표기 차이(M1-19에서 통일)**: 한국 선수 이름이 A는 성-이름("Kim Min-jae"), E는 이름-성("Kang-in Lee"), 득점 선수가 A는 API-Football 축약("M. Olise"), C·E는 전체 이름이다. 모두 `configs/names.ko.json` 별칭에 있거나 임시 사전에 있다.
- 로고·사진 URL·배당(odds)·평점은 옮기지 않았다. 기사 텍스트는 없다.

### 임시 프롬프트 (M1-20 출발점, mock 재현 근거 — 파이프라인 지시문은 `configs/prompts/summarize.md`)

`docs/research/m0-validation.md` M0-30 절에는 요약만 있어 전문을 보관한다. system = 파일 내용 `.trim()`.

| 파일 | 크기 | 쓴 출력 |
|---|---|---|
| `prompt-m0-30-short.md` | 694자 · 685토큰 | M0-30 배치 9건·단건 3건(`brief-case-*` 실제 사례 대부분) |
| `prompt-m0-30-long.md` | 2,119자 · 2,034토큰 | M0-30 캐시 실험 5건(발행일 2026-09-11·09-19·09-21·10-10, `brief-case-score-winner-first`) + M0-34 1건(2026-10-11) |

요청 설정: M0-30 "기본" = 모델 기본값(적응형 thinking, effort medium — 명시하지 않음), "effort low", "thinking 끔" 세 가지. M0-34는 thinking 적응형 + `effort:"medium"` 명시. 모두 `max_tokens` 4,096. 케이스별 값은 `brief-cases.json` `request`.

### 출력 스키마 (M1-20 확정 — `scripts/lib/brief.ts`)

M0-30 임시 스키마(`common.ts` — `t` 5~150자, `l` 1~5줄)의 짧은 키를 그대로 두고, 길이·줄 수는 스키마가 아니라 관용 파싱·줄 판정으로 옮겼다(D40 ⑤).

```ts
BriefOutputSchema = z.strictObject({            // 모르는 키 거부 → 출력 전체 실패(FR-29 재시도)
  l: z.array(z.strictObject({
    t: z.string().trim().min(5),                 // 브리핑 문장 1개 — 팀·선수·대회 이름은 입력 영문 그대로(치환은 names.ts)
    r: z.array(z.string().trim().min(1)).min(1).max(6)  // 근거 입력 항목 id(m…·s…·k…) — 줄 안 중복은 하나로
      .transform((refs) => [...new Set(refs)]),
  })).min(1),                                    // 줄 수 상한 없음 — 파서가 앞 5줄만 쓴다
})
```

관용 파싱 `parseBriefOutput` (D40 ⑤, 비용 0): ① 출력 **전체**를 감싼 ```` ``` ````·```` ```json ```` 코드블록은 벗긴다(`fenced`) — 앞뒤에 다른 글이 붙으면 벗기지 않고 `json` 실패. M0-30이 잰 첫 `{`~마지막 `}` 추출은 쓰지 않는다 ② 6줄 이상이면 앞 5줄만(`droppedLines`) ③ 80자 초과 줄은 **고유명사 치환·조사 보정 뒤 문장**으로 재서(`briefLinesOverLimit`) 그 줄만 템플릿 강등 대상으로 표시한다(자르지 않음 — 실제 강등은 M1-45). 실패 이유는 `json`·`schema`(둘 다 출력 전체 실패).

### 임시 고유명사 사전 `names-ko.tmp.json`

**확정 아님 — M1-21 초기 사전 후보이고 `configs/names.ko.json`이 우선한다.** M0-30 임시 사전(55개)과 M0-34 추가분(75개)을 합쳤다(`teams`·`players`·`comps`, 영문 → 한글). 두 파일에 함께 있던 키(RB Leipzig·Bournemouth·Roma)는 값이 같았다. `/add-name` 절차로 확정한다.

> **2026-10-16 M1-21 반영**: `configs/names.ko.json` 초기 사전(팀 98·선수 48·감독 10)이 생겨 이 파일은 **표시용 보조**로만 남는다 — `fixtures/brief-sample.json`의 LLM 줄은 configs 사전 → (없을 때만) 이 파일 순서로 다시 치환했다(`scripts/lib/names.ts` substituteNames + 받침 기준 조사 보정). 팀 표기는 D39 ②(KFA 기준)로 configs가 정하고(예: 바이에른 → **바이에른 뮌헨**, 맨시티 → **맨체스터 시티**, 리즈 → **리즈 유나이티드**), 선수는 configs가 성·이름 전체를 쓴다(예: 올리세 → **마이클 올리세**). 이 파일의 선수 값(성만)·확인 대기 팀(브라이턴·크리스털 팰리스·에버턴 등 — M1-21 보고)은 파이프라인이 쓰지 않는다.

`configs/names.ko.json`과 겹치는 항목(2026-10-11 기준)

| 영문 | 임시 사전 | configs/names.ko.json | 비고 |
|---|---|---|---|
| Brentford | 브렌트퍼드 | **브렌트포드** | 다름 — configs 우선(brief-sample도 브렌트포드로 맞춤) |
| Bayern | 바이에른 | **바이에른 뮌헨**(M1-21에서 별칭 "Bayern" 추가 — D39 ②) | 다름 — configs 우선 |
| Union Berlin | 우니온 베를린 | 우니온 베를린 | 같음 |
| Atleti | 아틀레티코 마드리드 | 아틀레티코 마드리드 | 같음 |
| Augsburg | 아우크스부르크 | 아우크스부르크 | 같음 |
| Mainz | 마인츠 | 마인츠 | 같음 |
| Kim Min-jae | 김민재 | 김민재 | 같음 |
| Jeong Woo-yeong | 정우영 | 정우영 | 같음 |
