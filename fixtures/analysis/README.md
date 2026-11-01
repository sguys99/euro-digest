# fixtures/analysis/ — 분석 블로그 피드 샘플 (M3-08, 전부 합성)

주간 단계 `analysis-blogs`(scripts/lib/analysis-blogs-stage.ts — PRD FR-10·FR-57) 테스트 입력이다. 일일 수집 fixture(`fixtures/rss/`, M0-33 실제
수집 샘플)와 따로 둔다 — 분석 블로그는 일일 수집 대상이 아니고(type `analysis`), 이 파일은 실제 수집본이 아니다.

- `spielverlagerung-en.xml` — `configs/sources.json` `spielverlagerung-en` 피드(`https://spielverlagerung.com/feed/`)의 **형태**만 따른 합성 샘플.
  2026-11-01 조사(M3-08)에서 확인한 실제 피드 구조를 반영했다: WordPress RSS 2.0 · 채널 네임스페이스(content·wfw·dc·atom·sy·slash) ·
  항목 요소 `title`·`link`·`comments`·`dc:creator`(CDATA, 대부분 'Next Generation')·`pubDate`(`+0000`)·`category`(CDATA)·
  `guid isPermaLink="false"`(`?p=<번호>`)·`description`·`content:encoded`·`wfw:commentRss`·`slash:comments`, 제목의 숫자 엔티티(`&#8217;`·
  `&#8211;`), 네덜란드어 글 섞임, 월 1~2건 간격, 1년 넘은 항목.
- **제목·링크·요약·본문은 실존하지 않는 합성 값**이다(약관 불명확 소스 — 위험 수용으로 원제목+링크만 게시, 공개 저장소에 실제 글을 보관하지
  않는다). 링크는 `https://spielverlagerung.com/fixture/synthetic-<n>/` 형식이라 실제 글 경로가 아니다. `description`·`content:encoded`는
  `SYNTH-DESC`·`SYNTH-CONTENT`로 시작하는 합성 문자열이고, 팀 이름을 일부러 넣어 "요약문·본문으로 팀을 잇지 않는다"(D47 ①·D48 ①)를 검사한다.
- 항목별 기대값(실행 시각 2026-11-01T23:00Z 기준 — tests/analysis-blogs-stage.test.ts):

| # | 날짜 | 기대 |
|---|---|---|
| 0 | 2026-10-30 | 아스널 (지난 7일 새 글) |
| 1 | 2026-10-24 | 바이에른 뮌헨 · 도르트문트 |
| 2 | 2026-10-05 | 인테르 · 나폴리 |
| 3 | 2026-09-20 | PSV (네덜란드어 제목) |
| 4 | 2026-09-02 | 팀 없음 — 버림 (요약·본문에만 팀 이름) |
| 5 | 2026-08-15 | 팀 없음 — 버림 (네덜란드어) |
| 6 | 2026-08-01 | 아스널 |
| 7 | 2026-07-01 | 팀 없음 — 버림 ('Nice' 일반어 — 겹치는 별칭, 근거 없음) |
| 8 | 2026-06-10 | 팀 없음 — 버림 (여자팀) |
| 9 | 2025-01-20 | 기간 밖 (180일 초과) |
