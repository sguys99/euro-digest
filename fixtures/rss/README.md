# fixtures/rss/ — 실제 RSS 수집 샘플 (M0-33)

`configs/sources.json`에서 `enabled && terms_checked`인 소스 14개의 피드를 실제로 한 번 받아, **제목·링크·날짜 같은 메타데이터만** 남긴 샘플이다.

- 용도: ① M0-34 원제목 카드 샘플(`fixtures/news-sample.json`)의 원천 ② D0 디자인 시안의 실제 헤드라인(길이·언어 혼합) ③ M1 RSS 파서·정규화·중복제거·클러스터링·분류 단위 테스트 입력
- **기사 텍스트는 담지 않는다.** 본문(`content:encoded`)·RSS 요약문(`description`)·미디어·이미지는 모두 지웠다. 공개 저장소이고, 요약문은 국내·해외 모두 표시·저장하지 않기 때문이다 (CLAUDE.md §1-5·§1-6, PRD §15 D23·D25). 제목은 카드에 그대로 게시하는 원문이라 남긴다.

## 수집

| 항목 | 값 |
|---|---|
| 수집 시각 | 2026-10-11T06:17:17.669Z (15:17 KST) — 소스별 시각은 `index.json` `sources[].fetchedAt` |
| 요청 | 피드당 GET 1회(실패 시 1회 재시도 — 이번에는 재시도 0건), 요청 간 3.2초, 동시 요청 없음, 다른 호스트로의 리다이렉트는 따라가지 않음 |
| User-Agent | `EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; sguys99@gmail.com)` |
| 결과 | 14개 모두 HTTP 200 · RSS 2.0. 원본 항목 494건 → 보존 69건(고유 링크 56건) |

## 파일

- `<source-id>.xml`: 소스별 피드. 원래 포맷(RSS 2.0)과 XML 선언·네임스페이스 선언(쓰지 않게 된 `content:`·`media:` 선언 포함)을 그대로 두었다.
- `index.json`: 수집 메타(소스별 URL·HTTP 상태·원본/보존 항목 수·실패 사유·제거 요소·시간 표기), 항목별 커버리지 태그, 중복 링크, 클러스터 메모. 항목 참조는 `<source-id>#<pos>`이고, `pos`는 이 fixture 안 순서(0부터), `feedPos`는 원래 피드 안 순서다. `title`·`link`는 XML을 파싱한 값(엔티티·CDATA 해제)이다. 원본 표기는 XML이 기준이다.

## 남긴 것과 지운 것

- **남긴 요소** — 채널: `title`·`link`·`atom:link`·`language`·`lastBuildDate`·`pubDate`·`copyright`·`generator`·`ttl`·`sy:*` / 항목: `title`·`link`·`guid`·`pubDate`·`category`·`dc:creator`·`author`
- **지운 요소** — `description`·`content:encoded`·`media:*`·`enclosure`·`image`(채널 로고 URL)·`itunes:*`·`googleplay:*`·`webMaster`·`comments`·`wfw:commentRss`·`slash:comments`. 고르지 않은 항목은 통째로 지웠다.
- **원문 유지** — 남긴 요소는 원본 바이트를 그대로 잘라 붙였다(XML을 다시 직렬화하지 않음). 엔티티(`&amp;`·`&quot;`)·CDATA·시간대 표기(`GMT`·`EST`·`+0200`·`+0000`·오프셋 없는 KST)·추적 파라미터(`?at_medium=RSS&amp;at_campaign=rss`)·`http://` 링크·제목 앞뒤 공백·이모지를 고치지 않았다. 정규화 테스트 입력이므로 손대지 않는다.

## 고른 기준

원래 피드에서 최근 항목을 우선하되, 커버리지를 기준으로 소스당 2~8건을 골랐다. 파일 안 순서는 원래 피드 순서와 같다.

- 언어 4종: en 32 · it 4 · es 5 · ko 28
- 같은 사건을 여러 소스가 다룬 항목 12묶음(`cluster:*`) — 예: 맨유 1-1 토트넘(5개 매체), 아우크스부르크 2-2 바이에른(5개 매체, 설영우)
- 이적(`transfer:rumor|agreed|official|collapsed`) 7 · 재계약 3 · 한국 선수 13 · 경기 결과 23(그중 숫자 스코어 13)
- 수집 시각보다 36시간 넘게 이전 항목 13건(`older-than-36h` — FR-07 최대 수집 창 밖, 시간 창 필터 테스트용. M0-34 카드 샘플에는 쓰지 않는 것을 권장)
- 필터·경계 사례: 축구 외 종목(Relevo NFL), K리그, 미국 대표팀, 1년 넘은 항목, 스코어처럼 보이는 숫자(`10-man`·`8/10`), 같은 피드 안 중복 링크(BBC), 섹션 피드 ⊂ 전체기사 피드(인터풋볼·베스트일레븐 — 섹션 피드에서 고른 항목은 전체기사 피드에도 넣었다)

태그 뜻은 `index.json`의 `tagLegend`에 있다. 태그는 사람이 붙인 메모이고 M1-17 분류 규칙의 정답이 아니다.

## 다시 수집할 때

1. 06:00~08:00 KST(봇 수집 시간대)를 피한다. `configs/sources.json`의 `enabled && terms_checked` 소스만, 위 요청 규칙과 User-Agent로 받는다. 비활성 소스와 금지 사이트(CLAUDE.md §1-5)에는 접근하지 않는다.
2. 원본 XML(본문 포함)은 저장소 밖 임시 폴더에만 둔다.
3. 위 "남긴 요소"만 원문 그대로 잘라 남기고, 항목을 고른다. XML 라이브러리로 다시 쓰면 CDATA·엔티티가 바뀌므로 쓰지 않는다.
4. `index.json`(수집 시각·건수·태그)과 이 문서의 수치를 함께 갱신한다.
5. `npm run test -- tests/fixtures-rss.test.ts`로 가드(본문·요약·이미지 금지, 건수 일치, 소스 id 일치, 언어 4종)를 통과시킨다.
