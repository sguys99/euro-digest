---
description: 새 뉴스 소스 후보의 RSS 유효성·robots.txt·약관을 확인해 표로 보고하고, 사용자 승인 후에만 configs/sources.json·publisher-domains.json에 등록한다 (FR-01·FR-08·FR-09·FR-11)
argument-hint: "<소스 URL — RSS 피드 또는 사이트 주소>"
---

# /add-source — 뉴스 소스 추가

후보 URL: **$ARGUMENTS** (비어 있으면 AskUserQuestion으로 받는다)

목적: 약관·robots.txt를 확인한 소스만 수집 대상이 되게 한다. 등록은 이 절차로만 한다.
근거: CLAUDE.md §1-5·§2·§6.4·§11 · PRD FR-01·FR-02·FR-08·FR-09·FR-11 · PRD §15 D22·D23·D25·D32·D34·D39 ①·D45 ②·D48 ① · plan 부록 A `Source` · M0-23~27 · M1-29

## 현재 상태 (M1-29 — 2026-10-17)
- 오늘(UTC): !`date -u +%F`
- 등록 소스: !`node -e 'const s=require("./configs/sources.json");console.log(s.length+"개 · 수집 대상(enabled && terms_checked) "+s.filter(x=>x.enabled&&x.terms_checked).length+"개 · 보존 기간 "+(s.filter(x=>x.retentionDays).map(x=>x.id+" "+x.retentionDays+"일").join(", ")||"없음"))'`
- 요약문을 읽지 않는 소스 목록(D48 ①): !`grep -n -A4 "SUMMARY_UNREAD_SOURCE_IDS: " scripts/lib/source-policy.ts 2>/dev/null || echo "(scripts/lib/source-policy.ts 없음 — M1-17 병합 전: main은 어떤 소스의 요약문도 읽지 않는다)"`
- 구현됨: `Source` 스키마(`src/lib/schema/source.ts` — 모르는 키는 오류), 수집 로더(`scripts/lib/sources.ts` — `enabled && terms_checked`, `crawl`은 `robots_checked`도), `npm run validate`(스키마 · 교차 참조 · 설정 경고 · 같은 매체명끼리 `retentionDays` 일치), 보존 기간 삭제(M1-25 — 매체명 기준), 소스 건강도 이슈(M1-11).
- type별 경로(`scripts/lib/sources.ts`): `rss`·`journalist`·`aggregator`는 일일 RSS 루프로 간다. `crawl`은 크롤러가 등록된 것만 돈다(`CRAWLER_SOURCE_IDS` — 지금 0개, M1-05 보류 D32 ①). `search`는 검색 쿼리 로더가 맡는다(검색 요청 M1-07은 보류). `analysis`는 주간 수집이다(M3-08).
- M0 검증(M0-23~27)은 끝났다. 새 판정 근거는 `sources.json`의 `note`와 `publisher-domains.json`의 `basis`에 남긴다. `docs/research/m0-validation.md`는 M0 기록이라, 기존 판정을 뒤집을 때만 사용자 확인 후 갱신한다(판정 변경 = PRD 결정 변경).

## 절차
1. **금지 사이트 즉시 판정**: 호스트가 Transfermarkt·FBref·WhoScored·SofaScore·FotMob·네이버·다음·X(트위터)이거나 유료 본문(페이월) 사이트면 **즉시 중단**하고 사유만 보고한다. 추가 요청·등록안·크롤러 모두 만들지 않는다.
2. **중복·기존 판정 확인**
   - `sources.json`에서 같은 URL, 같은 호스트, 같은 매체명(6단계 `name` 규칙)이 있는지 본다. 있으면 기존 항목을 갱신할지 묻는다.
   - `publisher-domains.json`에서 그 호스트의 판정을 찾는다(가장 긴 도메인이 이긴다 — 하위 도메인 포함). `deny`면 근거(`basis`·`basisUrl`)를 보이고 중단을 추천한다. 뒤집으려면 PRD 결정 변경이므로 질문한다. `enabled && terms_checked` 소스가 deny 도메인에 속하면 validate 오류다.
3. **RSS 확인**: 요청은 모두 `-A "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; sguys99@gmail.com)"`(수집기 `scripts/lib/rss.ts`와 같은 UA)로 보낸다. 같은 호스트 요청 사이에는 2~3초 간격을 둔다.
   - 예: `curl -sSL --max-time 15 -A "<위 UA>" "<URL>" | head -c 5000`
   - 확인할 것: RSS/Atom 형식, 항목 수, 최근 24시간·7일 항목 수, 최신 `pubDate`, 필드 유무(title·link·pubDate·`dc:creator`·description·`content:encoded`), 언어, 축구 외 기사 비율.
   - **날짜 형식**: `pubDate`에 시간대가 없으면(예 `2026-10-12 10:00:00` — 국내 피드) `tz`(IANA 이름, 예 `Asia/Seoul`)가 필요하다. 없으면 그 항목은 `no-date`로 빠진다(D34, `parseFeedDate`). 약어(`KST`)·오프셋(`+09:00`)은 스키마가 거부한다.
   - **링크**: 피드 링크를 그대로 게시한다(D23). 공백·제어 문자·`user@host`·2,048자 초과 링크는 정규화가 건너뛰므로(`scripts/lib/link-check.ts`) 그런 항목의 비율을 적는다.
   - **요약문(description)**: 평균 길이만 적는다. 내용은 표·note·fixtures에 옮기지 않는다(D39 ① — 공개 저장소에 요약문을 넣지 않음). 카드에는 저장·표시하지 않고, M1-17 이후에는 메모리 분류 입력으로만 쓴다. 본문 필드(`content:encoded`)는 "버림"으로 적는다.
   - **축구 외 기사**: 전 종목 피드면 비율을 적는다. 걸러 내려면 코드 규칙(M1-17의 링크 경로 규칙 `scripts/lib/source-policy.ts` `FOOTBALL_PATH_RULES`·제목 규칙 `scripts/lib/news-scope.ts`)을 늘려야 하므로 후속 작업으로 보고한다(Relevo 선례 — 이 커맨드는 코드를 고치지 않는다).
   - **작성자**: 피드에서 특정 기자 글만 받을 때만 `author`를 쓴다(`dc:creator` 비교 — `scripts/lib/author-filter.ts`). 작성자 필드가 없거나 이름이 다르면 쓰지 않는다(the Daily Briefing 선례: Romano 0/20).
   - RSS가 없으면 `type: crawl` 후보로 보고하고, 목록(제목·링크·날짜·작성자)과 OG 메타만으로 충분한지 판단한다. 승인되면 M1-05(크롤러)를 착수할 근거가 된다(D32 ①).
   - 응답 원문은 저장하지 않는다(fixtures 포함). 필요한 값만 표에 적는다.
4. **robots.txt**: `https://<host>/robots.txt`를 받아 `User-agent: *`와 봇별 규칙이 피드·목록 경로를 막는지 본다. AI·크롤러 전면 차단(GPTBot·ClaudeBot Disallow 등)이나 `Content-Signal`이 있으면 위험으로 표시한다. `robots_checked`는 "확인했고 피드(또는 목록) 경로가 허용됨"이라는 뜻이다(crawl 소스는 이 값이 false면 수집되지 않는다).
5. **약관**: 이용약관·RSS 이용 조건 페이지에서 다음을 확인한다.
   - ① 헤드라인·발췌·링크 재게시 허용 범위
   - ② 자동 수집 금지 조항
   - ③ AI·머신러닝 이용·요약·가공 제한
   - ④ 출처 표시 요구(표기할 매체명)
   - ⑤ 비상업 조건
   - ⑥ **캐시·보관 기간 제한**(The Athletic ToS 4.1(5) 선례 → `retentionDays`, D32)

   근거 URL과 핵심 문구(짧게 인용)를 남긴다. 결론은 **허용 / 제한(조건) / 금지 / 불명확** 중 하나로 적는다.
6. **등록안 작성** — 부록 A `Source`의 필드만 쓴다(그 밖의 키는 스키마 오류).
   - `id`: kebab-case, 한 번 정하면 바꾸지 않는다(`runs.json` sources[].id·`search-queries.json`·`publisher-domains.json` sourceIds·코드 상수가 참조).
   - `name`: `<매체명> — <피드 이름>` 또는 `<매체명> (<설명>)`. **매체명**(` — ` 앞, 끝 괄호 제외 — `scripts/lib/news-file.ts` `publisherNameOf`)은 카드 출처 표시(`src.n`)이면서 보존 기간을 찾는 키다.
     - 약관의 출처 표시 요구에 맞춘다.
     - 등록 뒤에는 바꾸지 않는다. 바꾸면 옛 카드가 보존 기간 삭제에서 빠진다(게이트 경고 ⑨).
     - 매체명이 같은 소스끼리는 `retentionDays`가 같아야 한다(validate 오류).
   - `type` · `url` · `lang`(`en`·`ko`·`es`·`it` …) · `enabled`
   - `summarize`: **항상 `false`**(원제목+링크 전용 — D22·D23). `true`는 무시되고 validate가 경고한다. LLM 요약 경로를 다시 여는 것은 별도 승인 사항이다(CLAUDE §1-3).
   - `weight`(0~3)·`tier`(1~3, 1이 가장 높음): 비슷한 기존 소스(같은 언어·매체 성격)와 비교한 추천값과 근거를 붙인다.
   - `competitions`: 그 대회 **전용** 피드일 때만 넣는다. 분류가 소스 대회를 대회 태그 범위와 겹치는 팀 별칭('Roma'·'Milan')의 확인 근거로 쓰기 때문이다(M1-17). 여러 대회를 섞는 종합 피드는 `[]`로 둔다.
   - `author`(선택): 3단계 작성자 확인을 통과했을 때만 넣는다. 빈 문자열은 그 소스 항목을 전부 빼므로 validate가 경고한다.
   - `tz`(선택): 3단계 날짜 형식 확인에서 필요할 때만 넣는다.
   - `retentionDays`(선택, D32): 약관에 캐시·보관 제한이 있을 때만 양의 정수(일)로 넣는다. 없으면 키를 넣지 않는다(§8.4 기본 — 일별 90일 → 월별 병합, 영구 보존). 값이 있으면 다음이 따라온다.
     - 기간이 지난 출처는 수집 실행이 `data/`에서 지운다(대표 출처면 카드째).
     - 클러스터에 다른 후보가 있으면 대표 순위 맨 뒤로 간다(D45 ②).
   - `terms_checked`: note에 적은 이용 방식(원제목+링크)이 약관상 허용될 때, 또는 사용자가 위험 수용을 결정했을 때만 `true`(아래 위험 수용 소스).
   - `robots_checked`: 4단계 결과.
   - `note`: 기존 형식을 따른다 — `"YYYY-MM-DD 확인 · 사용자 결정 YYYY-MM-DD. 이용 방식: 원제목+링크 전용(LLM 미전송). 근거: 약관 <URL> '<짧은 인용>' · robots <URL> 피드 경로 허용. 조건: 제목 무수정·번역 금지, 링크는 피드 URL 원문 그대로, 출처 '<매체명>' 표기, 중단 요구 시 즉시 중단."`
   - **위험 수용 소스**(약관이 불명확한데 사용자가 원제목+링크 전용으로 위험을 수용 — D22, 선례 the Daily Briefing·Di Marzio·Relevo):
     - `terms_checked: true`로 두고, note에 "약관 불명확 — 원제목+링크 전용은 사용자 결정(YYYY-MM-DD)으로 수용한 위험"과 조건 "description·content:encoded는 읽거나 표시하지 않음"을 적는다.
     - 그 id를 **요약문을 읽지 않는 목록**에 넣어야 한다: `scripts/lib/source-policy.ts`의 `SUMMARY_UNREAD_SOURCE_IDS`(D48 ① — 코드 상수, M1-17에서 생김). 이 커맨드는 코드를 고치지 않으므로, 같은 커밋에 그 목록 추가가 필요하다고 보고한다.
     - 목록에 들어가기 전에는 `enabled: true`로 켜지 않는다. M1-17 병합 전의 main이라도 마찬가지다 — 병합되는 순간 요약문을 분류 입력으로 읽기 시작한다.
     - `publisher-domains.json` 판정은 `feed-only`다.
7. **보고 → 승인**: 아래 보고 표와 함께 '사용자 확인 지점'을 거친다. 승인 전에는 파일을 수정하지 않는다.
8. **반영** — 승인된 내용만 쓴다. 소스 URL은 설정 파일에만 두고 코드에 하드코딩하지 않는다(§6.4).
   - `sources.json`: 비슷한 소스 옆(매체·언어 묶음)에 넣는다.
   - `publisher-domains.json`: 매체 도메인 단위로 `{ domain, publisher, status, sourceIds, basis, basisUrl, checkedAt, note? }`를 넣는다.
     - `domain`은 소문자, `www.` 없이 쓴다.
     - `status`:
       - `allow`: 매체 단위 근거가 있어 검색 결과로도 게시할 수 있다.
       - `feed-only`: 허가·결정이 피드에 묶여 있다(sourceIds 1개 이상 필수).
       - `deny`: 금지. 근거 소스는 `terms_checked: false`여야 한다(validate 교차 검사).
     - 목록에 없는 도메인은 기본 차단이므로 판정 없이 넣지 않는다. 약관이 "불명확"이고 위험 수용도 하지 않았다면(`terms_checked: false`, 기록용 `enabled: false`) 항목을 넣지 않는다. 결과는 기본 차단과 같다. `deny`는 약관상 금지로 판정했을 때만 쓴다.
   - `type: crawl`이면 M1-05(크롤러 `scripts/crawlers/<site>.ts` + `CRAWLER_SOURCE_IDS` 등록)가 필요하다고 보고만 한다.
   - `type: search`면 `search-queries.json`의 `source`가 이 id를 참조해야 한다. 검색 요청(M1-07)은 보류 중이므로 `enabled: false`를 추천한다(D32 ①).
9. **검증**
   - `npm run validate -- --configs-only`: 스키마, 교차 참조, 설정 경고(enabled인데 terms_checked false · summarize true · 빈 author), 매체명별 retentionDays를 본다.
   - `npm run check`: `tests/sources.test.ts`의 수집 대상 스냅숏(현재 피드 13개)은 설정이 바뀌면 함께 고치게 되어 있다. 승인된 변경만큼 기대값을 고치고 diff를 보고한다. 다른 테스트가 실패하면 고치지 말고 보고한다.
10. **커밋**: 사용자가 고른 경우에만 한다. 메시지는 `chore(config): <id> 소스 추가 — <판정 요지> (FR-01, …)`. `npm run build`도 통과해야 하고(CLAUDE §10), 06:00~08:00 KST에는 push하지 않는다.
11. **후속(보고)**
    - 첫 수집 뒤 확인: `data/runs.json` 해당 소스의 `ok`·`items`·`usable`, 그리고 `source-broken` 이슈. 로컬에서 받아져도 Actions 러너에서 막힐 수 있다(ESPN 선례 — HTTP 202·0바이트).
    - 새 언어·종합 피드면 분류 규칙(M1-17) 점검.

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 등록 여부: [등록 `enabled: true`] / [근거만 기록, `enabled: false`] / [등록 안 함].
  - 약관이 "불명확"이면 `enabled: false` 또는 등록 안 함을 추천한다.
  - 위험 수용(D22)은 사용자가 직접 고르는 선택지로만 제시하고, 고르면 6단계 위험 수용 소스 규칙을 그대로 따른다.
- 이용 방식: [원제목+링크 `summarize: false` (기본·추천)] / [제외].
  - 뉴스 기사는 LLM에 보내지 않으므로(D23) 모든 소스는 `summarize: false`다.
  - 약관에 제목 수정 금지·AI 이용 금지가 있으면 원제목 무수정 조건을 note에 적는다.
  - 재게시 자체가 막히면 제외를 추천한다.
- 보존 기간(D32): [`retentionDays` 없음 — §8.4 기본 (약관에 보관 제한이 없을 때 추천)] / [N일 (약관 조항 근거와 함께)] / [등록 보류].
- tier·weight·competitions·tz·author 값: 추천값과 근거를 제시한다.
- robots.txt에 AI 봇 차단 조항이 있을 때 진행 여부.
- 축구 외 기사가 많은 피드: [코드 필터 규칙을 만든 뒤 켬 (추천)] / [지금 켬 — 범위 감점만] / [등록 안 함].
- 소스를 늘리면 카드 후보가 늘어난다. 일일 카드 선별 상한(`MAX_ITEMS_PER_RUN=45`)은 그대로 두고, 바꿔야 하면 따로 묻는다(§2). 뉴스는 LLM에 보내지 않으므로 LLM 비용은 늘지 않는다(D23).

## 금지 사항
- 금지 사이트·유료 본문은 어떤 이유로도 크롤러·등록안을 만들지 않는다 (CLAUDE §1-5).
- 본문 수집 금지 — 제목 + RSS 요약 + `og:description`만 (§1-5). 기사 이미지·로고를 받지 않는다 (§1-6).
- 사용자 승인 없이 `terms_checked: true`·`robots_checked: true`를 쓰지 않는다 (§2·§6.4).
- 요약문·응답 본문을 note·fixtures·보고서에 옮기지 않는다(길이·필드 유무만 — D39 ①).
- 코드(`scripts/`·`src/`)를 고치지 않는다. 필요한 코드 규칙(요약문 미사용 목록·축구 경로 규칙·크롤러)은 보고만 한다. `tests/sources.test.ts`의 스냅숏 기대값 갱신만 예외다.
- `.env*`를 읽지 않는다 (§1-8).

## 완료 보고 형식
```
## /add-source 결과 — <name> (<host>)
| 항목 | 결과 | 근거 |
|---|---|---|
| 금지 사이트·기존 판정 | 해당 없음 / publisher-domains <status> | — |
| RSS | 유효(Atom, 30건, 24시간 8건, 최신 2026-10-10) / 없음 | <피드 URL> |
| 날짜·링크 | pubDate 시간대 있음 / 없음 → tz 필요 · 링크 형식 문제 0건 | |
| 요약·본문 필드 | description 평균 180자(분류 입력만, 표시·저장 안 함) / content:encoded 있음 → 버림 | |
| 축구 외 기사 | 0% / 30%(NFL·테니스) → 코드 필터 필요 | |
| robots.txt | 피드 경로 허용 / AI 봇 차단 있음 | <robots URL> |
| 약관 | 허용 / 제한(…) / 금지 / 불명확 · 보관 제한 있음(N일)/없음 | <약관 URL> "인용" |
| 등록안 | id·name(매체명)·type·lang·tier·weight·competitions·tz·retentionDays | 추천 근거 |
결정: 등록(enabled true/false) | 보류 · 변경 파일(sources.json·publisher-domains.json·tests/sources.test.ts) · 검증 결과
후속: (예) SUMMARY_UNREAD_SOURCE_IDS 추가 필요(위험 수용) · 축구 경로 규칙 · 크롤러 M1-05 · 첫 수집 뒤 runs.json 확인
```
