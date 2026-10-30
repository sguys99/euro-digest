# fixtures/

개발·테스트·디자인 시안용 샘플(`rss/` RSS·OG 메타, `football/` 축구 API 응답, `llm/` 브리핑 LLM mock 응답, 뉴스 카드 `news-sample.json`·데이터 브리핑 `brief-sample.json` — M0-33~36, 오늘의 5줄 S4(경기 없는 날) 합성 파일 `brief-empty.json` — M1-32, `cluster/` 제목 유사도 클러스터링 실데이터 제목 표본·사람 판정 — M1-13, `brief-pending/` 2026-10-25 호 사건 재현(football-data 미종료 19경기 합성 응답 + 원장의 API-Football 종료 결과 발췌 — PRD §15 D60))을 둔다.

- 뉴스 카드 샘플은 원제목 카드다 — 피드 제목·링크를 고치지 않고, 요약 줄 없이(`s:[]`, `ai:false`) 코드 규칙 분류 태그만 붙인다. RSS 요약문(description)은 카드에 넣지 않는다 (PRD §15 D23, M0-25). AI가 쓴 문장은 브리핑 샘플에만 있다(D24).
- 자동 테스트(Vitest·CI)는 `LLM_MODE=mock`으로 `llm/`의 응답을 쓴다. 결정적이고 비용이 없다 (CLAUDE.md §6.3).
- 응답 구조를 그대로 보존한다(Prettier 제외). 단, 기사 본문·이미지·비밀값(API 키·토큰)은 넣지 않는다 (CLAUDE.md §1-5·§1-6·§1-8).
- **The Athletic 항목은 합성 값이다**(PRD §15 D32·D42 — 보관 금지): `rss/the-athletic-football.xml`·`news-sample.json`의 Athletic 제목·링크는 실존하지 않는 값으로 바꿨고(구조·날짜·태그는 유지, 자세한 내용은 `rss/README.md`), `cluster/` 표본에는 Athletic을 넣지 않았다.
- `schema/`는 zod 스키마(`src/lib/schema/`)의 **형식 예시**다. 저장소와 같은 경로(`schema/configs/…`, `schema/data/…`)에 두고 `tests/schema/`가 레지스트리 매핑·검증에 쓴다. 팀·선수·기사는 지어낸 예시(`sample-united`, `홍길동`, `example.com`)이며 사실 정보가 아니다 — 디자인 시안에는 쓰지 않는다.
- **`competitions/ucl-knockout.json`은 합성 데이터다**(M2-12 — UCL 녹아웃 대진 견본·테스트용, 실제 녹아웃 데이터는 2027-02에 생긴다): `file`(대회 파일 형식 — 순위표·리그 페이즈 8라운드 대진·득점 순위는 2026-10-30 실제 UCL 파일에서 가져왔고 경기 스코어·녹아웃 대진·결과는 지어낸 값) + `now`(16강 진행 중 시각) + `final`(4강·결승 뒤 시나리오의 경기·시각). 실제 결과가 아니다 — 견본(`/specimen/knockout/`, SPECIMEN=1 빌드 전용)·`tests/knockout.test.ts`·`tests/competition-page.test.tsx`만 쓴다.
