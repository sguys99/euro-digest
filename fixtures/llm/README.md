# fixtures/llm/

LLM 응답 샘플. `LLM_MODE=mock`(또는 `--mock`)이면 `scripts/lib/llm.ts`가 실제 API 대신 여기 파일을 읽는다. 결정적이고 비용이 없다 (CLAUDE.md §6.3). Vitest는 항상 mock이다.

## mock/ — 요청별 응답

```
mock/
  by-id/<customId>.json       # 1순위: 요청의 customId(카드 ID 등)로 찾는다
  by-hash/<h_해시>.json        # 2순위: system + user 내용 해시로 찾는다
```

- 조회 순서는 `by-id` → `by-hash`. 둘 다 없으면 `LlmMockFixtureError`가 나고, 오류 메시지에 만들어야 할 파일 경로가 나온다.
- 해시 키는 `mockRequestKey({ system, user })` = `h_` + sha256(`system` + `\0` + `user`) 앞 16자리. 모델·max_tokens는 키에 들어가지 않는다. 프롬프트(`configs/prompts/*.md`)를 바꾸면 해시도 바뀐다.
- 배치는 제출 즉시 끝난(ended) 상태가 된다. 단건 호출(`callSingle`)에는 `succeeded`·`errored`만 쓸 수 있다.

## 파일 형식 (zod `MockFixtureSchema`, 키는 API 응답 이름을 따른다)

```jsonc
// 성공 — text는 모델이 낸 원문 출력(문자열). 출력 JSON 형식은 프롬프트(M1-17)가 정한다
{ "type": "succeeded", "text": "...", "stop_reason": "end_turn",
  "usage": { "input_tokens": 250, "output_tokens": 150,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0 } }
// stop_reason 생략 시 end_turn. "max_tokens"·"refusal"이면 실패 결과(과금됨)로 처리된다
// usage 생략 시 0 — 비용 계산 테스트에 쓰려면 기록한다

{ "type": "errored", "error": { "type": "invalid_request_error", "message": "..." } }
{ "type": "expired" }
{ "type": "canceled" }
```

모든 형식에 사람용 메모 `note`(문자열)를 붙일 수 있다.

## 지금 있는 파일

| 파일 | 용도 |
|---|---|
| `mock/by-id/m0_sample_ok.json` | 전송 계층 테스트용 성공 응답(usage 포함) — M0-20 |
| `mock/by-id/m0_sample_errored.json` | 전송 계층 테스트용 errored 응답 — M0-20 |

실제 요약 응답 fixture는 M0-36에서, 골든셋(`golden/`, `npm run eval:prompt`)은 M1-24에서 추가한다. 기사 본문·이미지·비밀값은 넣지 않는다.
