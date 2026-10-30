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

## 팀 키트 색·약어 `team-colors.json` (DR-05, PRD §15 D62 ②④, 2026-10-30 — M2-05)

손으로 고치지 않는다. **원본은 `docs/design/d1/team-colors-source.json`**(팀마다 키트 원색 2색 `kit` = [상의 주색, 하의(상의와 같으면 키트 둘째 색)] · football-data `tla` 원문 · 약어 `short` · 확신도 확실/추정 · 출처 · 키트 메모)이고, 설정 파일은 생성물이다.

1. 원본을 고친다(색이 틀렸으면 원색만 — 운영 중에도 이 파일만 고친다, 2026-10-30 사용자 결정).
2. `npx tsx scripts/build-team-colors.ts --write` — 상의 색에 대비 보정(D62 ④, `src/lib/kit-contrast.ts`)을 적용해 `{ colors: [보정 상의, 하의], short }`를 쓴다.
   - 약어 글자색 = `#FFFFFF`·`#14213D` 중 상의와 대비가 큰 쪽. 그 대비가 5.3 미만이면 상의 R·G·B × f(1.00에서 0.02씩, 채널 반올림) — 흰 글자 대비 5.3 이상이 되는 첫 f. 하의는 원색 그대로.
   - 글자색 자체는 저장하지 않는다 — 팀 배지가 화면 빌드 때 같은 함수(`kitTextColor`)로 계산한다.
3. `npx tsx scripts/build-team-colors-review.ts` — 검토 시트 `docs/design/d1/team-colors-review.html`을 다시 만든다.
4. `npm run validate`(교차 참조 6: 키 ⊂ team-ids, 빠진 팀은 경고 — 폴백 배지, 대비 5.3 미만은 오류) · `tests/team-colors.test.ts`(원본 → 설정 파일 일치).

약어는 football-data `tla`의 앞뒤 공백만 뺀 값이다. tla가 팀을 가리키지 못하는 이상치만 원본 `shortBasis`에 근거를 적고 바꾼다(보되/글림트 `FK`→`BOD`, 스트라스부르 `RC `→`STR`). 약어 충돌(FCB 바이에른·바르셀로나, BRE 브렌트포드·브레스트)은 바꾸지 않는다 — 화면이 한글 팀명을 병기한다(D62 ②). 새 팀은 원본에 항목을 더하고 위 절차를 돌린다(`/new-season`).

## 오늘 밤 볼 경기 `bigmatch-rules.json` (FR-80~82·FR-84, PRD §15 D62 ③, 2026-10-30 — M2-08)

LLM 없이 규칙으로 고른다. 선별은 `src/lib/tonight.ts`(`selectTonight` — 순수 함수), 빌드 때 로더는 `src/lib/data/tonight.ts`, 테스트는 `tests/tonight.test.ts`.

- **창** `window` 18:00 ~ 익일 07:00 KST(FR-80) — 기준 날짜는 빌드 시각의 KST 날짜(발행일). 킥오프 미확정(`tbc`)·연기 경기는 뺀다.
- **가중치** = FR-81 순서대로 내림차순: ① 한국 선수 소속팀 5 · ② UCL 4 · ③ 상위 6위 간 맞대결 4 · ④ 지정 더비 4 · ⑤ 승점 차 3 이내 2 · 빅클럽 1(동점 정리용). 걸린 규칙 weight 합 → 상위 5경기. `minScore` 0 = 창 안에 경기가 있으면 5경기까지 채운다(경기 없는 날만 빈 상태). weight 0은 그 규칙을 끈다. ③⑤는 리그 순위로만 본다(UCL 리그 페이즈 제외).
- **동점** = 킥오프 이른 순 → 대회 순서(`competitions.json`) → 경기 id.
- **이유 태그는 데이터로 확인되는 사실만**: "{선수} 소속"(활성 등록 선수 — 출전 예상 금지) · 더비 이름(이 목록) · "a·b위 맞대결" · "승점 차 n · a·b위". UCL·빅클럽은 태그가 없다.
- **더비 목록 근거**: 리그 안 더비 중 국내외 중계·보도에서 이름으로 통용되는 것만 — 잉글랜드(노스런던·머지사이드·맨체스터·노스웨스트·타인-위어), 스페인(엘 클라시코·마드리드·바르셀로나·세비야·바스크·갈리시아), 이탈리아(밀라노·로마·데르비 디탈리아·토리노), 독일(데어 클라시커·레비어·노르트·라인), 프랑스(르 클라시크·북부(Derby du Nord)·파리). 두 팀이 모두 2026-27 같은 리그(`scripts/lib/team-leagues.ts`)이고 slug가 `team-ids.json`에 있어야 한다(테스트가 확인). 상대 팀이 강등돼 없는 더비(예: 리옹–생테티엔, 제노아–삼프도리아)는 넣지 않았다 — 승격하면 `/new-season`에서 더한다. 이름 표기는 국내 통용 표기를 따르고, 바꾸면 화면 태그가 바로 바뀐다.
- **빅클럽** 16곳은 뉴스 점수화 키워드 표(`scripts/lib/news-keywords.ts` `BIG_CLUBS`, FR-06)와 같은 slug다 — 한쪽만 고치면 테스트가 실패한다.
