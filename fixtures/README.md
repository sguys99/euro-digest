# fixtures/

개발·테스트·디자인 시안용 샘플(`rss/` RSS·OG 메타, `football/` 축구 API 응답, `llm/` LLM 응답, 뉴스 카드)을 둔다.

- 자동 테스트(Vitest·CI)는 `LLM_MODE=mock`으로 `llm/`의 응답을 쓴다. 결정적이고 비용이 없다 (CLAUDE.md §6.3).
- 응답 구조를 그대로 보존한다(Prettier 제외). 단, 기사 본문·이미지·비밀값(API 키·토큰)은 넣지 않는다 (CLAUDE.md §1-5·§1-6·§1-8).
- `schema/`는 zod 스키마(`src/lib/schema/`)의 **형식 예시**다. 저장소와 같은 경로(`schema/configs/…`, `schema/data/…`)에 두고 `tests/schema/`가 레지스트리 매핑·검증에 쓴다. 팀·선수·기사는 지어낸 예시(`sample-united`, `홍길동`, `example.com`)이며 사실 정보가 아니다 — 디자인 시안에는 쓰지 않는다.
