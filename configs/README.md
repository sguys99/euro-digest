# configs/

사람이 관리하는 설정(`*.json`)과 LLM 프롬프트(`prompts/*.md`)를 둔다.

- 모든 JSON은 `src/lib/schema/`의 zod 스키마로 검증한다. 고친 뒤에는 `npm run validate`를 돌린다.
- 뉴스 소스(`sources.json`)는 `/add-source` 절차로만 추가하고, 프롬프트를 고치면 `npm run eval:prompt`로 회귀 비교한다 (CLAUDE.md §6.3·§6.4).
- 비밀값(API 키·토큰)은 넣지 않는다. 키는 Actions Secrets로만 관리한다 (CLAUDE.md §1-8).

## 팀 slug 규칙 (PRD §15 D63 ③, 2026-10-30 — M2-04)

팀 slug는 팀 페이지 URL(`/teams/<slug>/`)·뉴스 카드 태그·설정 파일 키(`team-ids`·`names.ko`·`team-colors`·`korean-players` `team`)가 함께 쓰는 영구 식별자다. 공개 URL이 생긴 뒤에는 바꾸지 않는다. 구현은 `scripts/lib/team-slugs.ts`(`teamSlugFor`), 테스트는 `tests/team-slugs.test.ts`.

**통용 영문 통칭 kebab** — football-data 정식 이름(`team.name`)에서

1. 악센트를 없앤다(ü→u, é→e, ø→o, ß→ss, Š→S).
2. 숫자 토큰(창단 연도 1899·1907·1913·1901, 숫자 접미 04·05·07·29, `1.`)을 뺀다.
3. 법인·형태 접두·접미사(FC·AFC·CF·SC·SV·FSV·AC·ACF·AS·SS·SSC·CFC·SCO·OSC·TSG·VfB·US·BC·RC·RCD·CA·UD·SK·FK·KV·PAE·OGC·AJ·ES·Calcio·Club)를 이름 **앞뒤에서** 뗀다(가운데 토큰은 이름의 일부).
4. 나머지를 소문자 kebab으로 쓴다. 영어권 클럽의 United·City·Town·Hotspur·Forest처럼 통칭에 들어가는 말은 남기고, 자국어 표기는 영어로 바꾸지 않는다(`koln`·`bayern-munchen`·`slavia-praha`).
5. 규칙 결과가 통칭과 다르면 **예외표**(`TEAM_SLUG_OVERRIDES` — football-data 팀 id → slug + 이유)에 넣는다. 예외는 두 경우뿐이다.
   - 지명 수식어·부가어를 뗀 통칭: `atletico-madrid`·`espanyol`·`rayo-vallecano`·`real-betis`·`real-sociedad`·`alaves`·`celta-vigo`·`racing-santander`·`inter`·`leverkusen`·`hamburg`·`brest`·`marseille`·`lyon`·`rennes`·`lens`·`strasbourg`·`brighton`·`sporting-cp`·`feyenoord`·`lask`
   - 동명 충돌·모호성 회피: `paris-fc`(PSG와 헷갈림)·`club-brugge`(세르클러 브뤼헤)·`aek-athens`(AEK 라르나카). `paris-saint-germain`은 `psg`로 줄이지 않는다.

새 팀(승격·UCL 새 참가 팀 — `/new-season`)은 `scripts/fetch-competition-teams.ts --write`(football-data 6요청) → `npx tsx scripts/build-team-ids.ts --roster [--af-pairs <짝짓기 결과>] --write`로 `team-ids.json`에 넣고, 규칙 결과가 통칭과 다를 때만 예외표에 이유와 함께 더한다. 리그·UCL 소속은 `scripts/lib/team-leagues.ts`(`TEAM_LEAGUES`·`UCL_TEAMS`)를 함께 고친다.
