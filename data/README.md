# data/

파이프라인 산출물이다. **손 편집 금지** (CLAUDE.md §8).

- 파이프라인 스크립트만 쓴다: 봇 실행(`collect.yml`·`weekly.yml`)이 커밋하고, 개발 중 실행 기록 `runs-dev.json`만 개발자가 커밋한다.
- 내용이 잘못됐으면 이 폴더를 고치지 말고 스크립트나 `configs/`(예: `takedowns.json`)를 고쳐 다음 실행에서 반영한다.
- 시각은 UTC(ISO 8601)로 저장한다. KST 변환은 화면에서 `src/lib/time.ts`가 맡는다.
