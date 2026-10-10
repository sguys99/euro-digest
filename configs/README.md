# configs/

사람이 관리하는 설정(`*.json`)과 LLM 프롬프트(`prompts/*.md`)를 둔다.

- 모든 JSON은 `src/lib/schema/`의 zod 스키마로 검증한다. 고친 뒤에는 `npm run validate`를 돌린다.
- 뉴스 소스(`sources.json`)는 `/add-source` 절차로만 추가하고, 프롬프트를 고치면 `npm run eval:prompt`로 회귀 비교한다 (CLAUDE.md §6.3·§6.4).
- 비밀값(API 키·토큰)은 넣지 않는다. 키는 Actions Secrets로만 관리한다 (CLAUDE.md §1-8).
