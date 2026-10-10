# 🔎 유로 다이제스트 — M0 외부 검증 기록 (m0-validation.md) v0.1

> 작성일: 2026-10-10 · 버전: v0.1 · 저장 위치: `docs/research/m0-validation.md`

| 항목 | 내용 |
|---|---|
| 목적 | M0 ❓ 외부 검증(M0-23~M0-32)의 원자료와 판정 근거를 한곳에 남긴다. 사용자가 확인한 결과만 `configs/*.json`·PRD·plan에 반영한다 |
| 상위 문서 | `docs/PRD.md`(FR-01~FR-11, NFR-09) · `CLAUDE.md` §1-5·§2·§6.4 · `docs/plan.md` §14(B1~B6) · `docs/basic_plan.md` §3 |
| 확인 날짜 | 2026-10-10 (피드 요청 시각 약 06:34 UTC = 15:34 KST) |
| 요청 예절 | User-Agent `EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; sguys99@gmail.com)` · 같은 호스트 요청 간격 2~3초 · 피드·robots.txt·약관 페이지만 요청(기사 본문 페이지 요청 0건) · 금지 사이트 접근 0건 |
| 판정 용어 | **허용**(우리 이용 방식이 약관에 명시적으로 허용됨) / **조건부**(정해진 조건을 지킬 때만 허용) / **불명확**(근거가 모호하거나 서로 충돌) / **금지**(명시적으로 금지) / **찾지 못함** |
| 문서 규칙 | 버전은 v0.1 고정. 인용은 짧게 원문 그대로, 요약은 한국어 |

> **누적 결론 (M0-23 + M0-24, 2026-10-10)** — 해외 매체·기자 채널 26개(영문 24·이탈리아어 1·스페인어 1)를 약관 기준으로 판정한 결과 **AI 요약 가능 0 · 원제목+링크 9**(BBC 4·ESPN·The Athletic·the Daily Briefing·Di Marzio·Relevo) **· 제외 17**이다. 약관상 LLM 요약이 허용되는 해외 뉴스 소스가 없으므로 FR-20을 재정의했다(PRD §15 D23·D24): 해외 뉴스는 모두 원제목+링크 + 코드 규칙 한국어 태그로 게시하고, 일일 LLM 호출 #1은 "정형 데이터 기반 한국어 브리핑"으로 바꾼다. 앞으로 `summarize:true` 소스는 없다(`Source.summarize` 필드는 유지).
>
> **국내 매체 (M0-25, 2026-10-10)** — 8개 매체 중 **원제목+링크 3개 매체(인터풋볼·풋볼리스트·베스트일레븐, 피드 5개) · 기록용 2(스포탈코리아 — 피드 부적합, 연합뉴스 — 금지) · 미등록 3(스포티비뉴스·엑스포츠뉴스·OSEN — 피드 없음)**. RSS 요약문(description)은 본문 첫 300자 절단이라 표시·저장하지 않는다 → 국내 카드도 원제목+링크(`ai:false`).
>
> **Google News·검색 결과 매체 (M0-26, 2026-10-10)** — Google News RSS는 피드 고지(개인 피드 리더 외 이용 금지)·robots.txt `Disallow: /`·Google 약관 때문에 **사용 불가**다 → plan §14 B2 발동(뉴스 검색은 GDELT + 국내 매체 RSS). 검색형 소스가 돌려준 기사는 **`configs/publisher-domains.json` 매체 도메인 허용 목록**으로 거른다 — `allow`만 게시, 목록에 없는 도메인은 기본 차단(allow 4 · feed-only 7 · deny 16).
>
> **GDELT (M0-27, 2026-10-10)** — 약관은 허용(조건부: GDELT 인용·링크)이지만 레이트 리밋(성공률 32%)·색인 희소·허용 목록 통과 0/5로 **판정 기록용 비활성**(`gdelt-doc`)이다. `configs/search-queries.json`은 쿼리 9개 모두 비활성(`maxEnabled` 10). → **현재 뉴스 검색 단계는 없고, 한국어 뉴스는 국내 매체 RSS 5개 피드뿐이다.** M1 7일 관찰 기간에 소량 재측정한 뒤 다시 결정한다.

## 목차
- [M0-23 1군 영문 RSS](#m0-23-1군-영문-rss) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록(원제목+링크 6 · 제외 2)
- [M0-24 2군 매체·기자 채널](#m0-24-2군-매체기자-채널) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록(원제목+링크 3 · 기록용 제외 5), FR-20 재정의(PRD §15 D23·D24)
- [M0-25 국내 매체 RSS](#m0-25-국내-매체-rss) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록(원제목+링크 3개 매체·피드 5 · 기록용 2 → 전체 23개), 요약문(description) 표시·저장 안 함
- [M0-26 Google News RSS](#m0-26-google-news-rss) ✅ 완료 — 사용자 결정(2026-10-10) 반영, 판정 금지(사용 불가)·plan §14 B2 발동, `configs/sources.json` 기록용 2개 등록(→ 25개), 검색 결과 매체 도메인 허용 목록 `configs/publisher-domains.json` 신설(allow 4 · feed-only 7 · deny 16)
- [M0-27 GDELT DOC API](#m0-27-gdelt-doc-api) ✅ 완료 — 결정(2026-10-10) 반영, 판정 약관 허용(조건부)·기술 부적합 → `configs/sources.json` 기록용 `gdelt-doc` 비활성 등록(→ 26개), `configs/search-queries.json` 신설(`maxEnabled` 10 · 쿼리 9개 전부 비활성), M1 관찰 기간 소량 재측정 후 재결정
- [M0-28 football-data.org](#m0-28-football-dataorg) ⏳ 조사 완료 — 사용자 확인 대기. 6개 대회 순위·경기·득점 무료 제공 확인(경기별 득점자·폼은 미제공), 약관 조건부 허용(출처 표기 필수)·**B7 미발동**, `competitions.json` 초안은 scratchpad(저장소 미기록)
- [M0-29 API-Football](#m0-29-api-football) ⏳ 조사 완료 — 사용자 확인 대기. 무료 플랜 2026-27 **일부 가능**(시즌 단위 막힘·경기 단위 가능 → B1 부분 발동), 경기별 득점자·라인업·선수 기록 무료, 약관 조건부 허용·B7 미발동, `configs/competitions.json` 저장소 기록(validate 통과)
- [M0-30 Anthropic 실측](#m0-30-anthropic-실측) ⏳ 실측 완료 — 사용자 확인 대기. Haiku 5.5 단가는 M0-21 표와 같음, 요청 17건 $0.007474(`runs-dev.json` 3건), 배치 완료 1분 50초~6분 33초(겨울 실제 여유 4~5분을 넘는 표본 1개), 캐시 동작(B3 미발동), thinking 기본값이 사실성 최고(45/45줄)
- [M0-31 서비스명·저장소명](#m0-31-서비스명저장소명)
- [M0-32 2026-27 한국 선수 명단 초안](#m0-32-2026-27-한국-선수-명단-초안)

---

## M0-23 1군 영문 RSS

대상: basic_plan §3.2의 8개 피드(BBC Sport 4 · Sky Sports · The Guardian · The Athletic · ESPN).
요청 범위: 피드 8개 + 추가 피드 후보 2개(The Athletic 축구 피드), robots.txt 6개 호스트, 약관·RSS 안내 페이지 10여 개.

### 핵심 결론 (먼저 읽기)
1. **8개 피드는 기술적으로 모두 정상**이다(HTTP 200, 리다이렉트 없음, RSS 2.0 파싱 가능). 우리 UA 기준 robots.txt도 피드 경로를 모두 허용한다. Crawl-delay를 둔 호스트는 없다.
2. **8개 모두 약관상 "LLM으로 한국어 요약을 새로 쓰는" 이용은 허용되지 않는다.**
   - 명시적 금지: The Guardian(AI로 콘텐츠 생성 금지), NYT·The Athletic(AI 운영·grounding·RAG 이용 금지), ESPN(제목·요약 수정 금지)
   - 허가 필요: BBC(AI·컴퓨터 분석, 비영리를 포함한 business 이용), Sky(봇으로 콘텐츠를 수집·집계하려면 서면 허가)
3. **원제목+링크 게재**는 ESPN(RSS Terms가 명시적으로 허용)과 The Athletic(RSS 약관이 비상업 블로그 게재를 허용)만 근거가 분명하다. BBC는 "개인 웹사이트" 조항과 "비영리=business" 조항이 엇갈려 **불명확**하다. Sky·Guardian은 허용 근거가 없다.
4. 그래서 **plan §14 B5(핵심 RSS 약관상 요약 불가)가 실제로 일어났다.** 조사 시점의 Source 스키마로는 "원제목+링크만" 모드를 표현할 수 없어 사용자 결정을 받았다 → 아래 "사용자 결정".

### 사용자 결정 (2026-10-10)

| # | 항목 | 결정 | 반영 |
|---|---|---|---|
| 1 | 요약 정책 | **(A) 약관 준수.** 금지·불명확 소스는 원제목+링크 또는 제외. M0-24~26을 같은 기준으로 판정한 뒤 요약 가능한 소스가 부족하면 FR-20 범위를 재검토한다 | PRD FR-20·§15 D22, plan §14 B5 |
| 2 | 스키마 | **`Source.summarize: boolean` — 기본값 없는 필수 필드.** `false`면 LLM에 보내지 않고 원제목+링크(`ai:false`) 카드로만 게시(피드 제목·URL 무수정). `terms_checked`는 "note에 적은 이용 방식(요약 또는 원제목+링크)이 약관상 허용됨"을 뜻하고, 금지·불명확이면 `false`(FR-01 이중 잠금 유지) | `src/lib/schema/source.ts`, `fixtures/schema/configs/sources.json`, `tests/schema/source.test.ts` |
| 3 | 소스별 | **BBC 4개 원제목+링크로 켬**(ToU §15 a "개인 웹사이트에 피드를 바꾸지 않고 게재" 근거 + 사용자 결정. robots.txt 주석의 요약 금지는 `summarize:false`로 준수). **ESPN·The Athletic(축구 피드 URL로 변경) 원제목+링크로 켬. Sky·Guardian 제외** | `configs/sources.json` |

**등록 결과 — `configs/sources.json`** (8개, `npm run validate` 통과, 수집 대상 `enabled && terms_checked` = 6개, LLM 요약 대상 0개)

| id | 피드 URL | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|
| `bbc-sport-football` | feeds.bbci.co.uk/sport/football/rss.xml | true | false | true | true | 2 | 3 | [] | 원제목+링크 |
| `bbc-sport-premier-league` | …/football/premier-league/rss.xml | true | false | true | true | 2 | 2 | [EPL] | 원제목+링크 |
| `bbc-sport-champions-league` | …/football/champions-league/rss.xml | true | false | true | true | 2 | 1 | [UCL] | 원제목+링크(갱신 드묾 — FR-11 관찰) |
| `bbc-sport-european` | …/football/european/rss.xml | true | false | true | true | 2 | 2.5 | [LALIGA, SERIEA, BUNDESLIGA, LIGUE1] | 원제목+링크 |
| `sky-sports-football` | www.skysports.com/rss/11095 | false | false | false | true | 2 | 2.5 | [] | 제외 |
| `guardian-football` | www.theguardian.com/football/rss | false | false | false | true | 2 | 2 | [] | 제외 |
| `the-athletic-football` | www.nytimes.com/athletic/rss/football/ | true | false | true | true | 2 | 1.5 | [] | 원제목+링크 |
| `espn-soccer` | www.espn.com/espn/rss/soccer/news | true | false | true | true | 2 | 1 | [] | 원제목+링크 |

- 모든 항목 `type:"rss"`, `lang:"en"`. 각 `note`에 확인 날짜·근거 URL·이용 방식·지킬 조건·미해결 사항을 적었다.
- 출처 표기: BBC 4개는 "BBC Sport"(텍스트+링크, 로고 없음), The Athletic은 "The Athletic", ESPN은 "ESPN".
- 남은 위험(사용자 인지): BBC는 같은 약관이 비영리 이용도 business(허가 필요)로 정의하는 문구가 있다 — 사용자가 §15 a 해석으로 결정. The Athletic은 ToS 4.1(5) 캐시·보관 금지와 우리 보관 정책(일별 90일·월별 병합)의 관계를 M1에서 검토한다.
- 결과적으로 **1군 영문 소스 중 LLM 요약 대상은 0개**다. 요약 대상 확보는 M0-24~26 판정에 달려 있다.

### 요약 표 (조사 결과 + 결정)

| 소스 | 피드 상태 | 항목 수 | 최신(UTC) · 24h/7일 | robots(우리 UA) | 약관 핵심 | 결정(2026-10-10) |
|---|---|---|---|---|---|---|
| BBC Sport — Football | ✅ 200 `text/xml` | 78 | 10-10 06:29 · 36/61 | 허용 | 원제목: 개인 사이트에 피드 무수정 게재 허용(§15 a), 단 business(비영리 포함) 정의와 충돌 / LLM: 허가 필요·robots 주석 "요약 생성 금지" | **원제목+링크** |
| BBC Sport — Premier League | ✅ 200 | 53 | 10-10 05:56 · 9/19 | 허용 | 위와 같음 | **원제목+링크** |
| BBC Sport — Champions League | ⚠️ 200, 갱신 드묾 | 14 | 10-07 20:14 · 0/1 | 허용 | 위와 같음 | **원제목+링크** |
| BBC Sport — European football | ✅ 200 | 26 | 10-09 09:57 · 2/5 | 허용 | 위와 같음 | **원제목+링크** |
| Sky Sports — Football | ✅ 200 `application/xml` | 20 | 10-09 21:31 · 14/19 | 허용(GPTBot·CCBot 차단) | **금지에 가까움** — RSS 약관 없음, sky.com T&C가 봇 수집·집계·재게시 금지 | **제외** |
| The Guardian — Football | ✅ 200 `text/xml` | 60 | 10-09 21:30 · 19/44 | 허용(ClaudeBot 등 AI 봇 차단) | **금지** — "AI 기술로 콘텐츠 생성" 금지, RSS는 개인·비상업만, RSL은 ai-input을 유료 라이선스로만 허용 | **제외** |
| The Athletic | ✅ 200 `application/xml` | 100(전 종목) | 10-10 05:51 · 86/100 | 허용(AI 봇 전면 차단) | **LLM 금지 / 원제목 조건부** — RSS 비상업 블로그 게재 허용, ToS가 AI 운영·RAG 이용 금지 | 축구 피드 `/athletic/rss/football/`로 바꿔 **원제목+링크** |
| ESPN — Soccer | ✅ 200 `text/xml` | 17 | 10-10 00:22 · 16/17 | 허용(GPTBot·anthropic-ai 등 차단) | **LLM 금지 / 원제목 조건부** — 피드 내용만 그대로, 원문 링크·ESPN 표기 필수, 광고·수정 금지 | **원제목+링크** |

> 24h/7일 = 요청 시각(2026-10-10 06:35 UTC) 기준 최근 24시간·7일 안에 발행된 항목 수. Sky는 `BST` 약어를 +01:00으로 바꿔 계산했다.

### robots.txt 매트릭스 (피드 경로 기준)

| 호스트 · 경로 | EuroDigestBot | GPTBot | ClaudeBot | Claude-User | CCBot | Google-Extended | anthropic-ai | PerplexityBot | Crawl-delay |
|---|---|---|---|---|---|---|---|---|---|
| feeds.bbci.co.uk `/sport/football/rss.xml` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 없음 |
| www.bbc.co.uk (기사 경로, 참고) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | 없음 |
| www.skysports.com `/rss/11095` | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | 없음 |
| www.theguardian.com `/football/rss` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | 없음 |
| www.nytimes.com `/athletic/rss/news/`·`/athletic/rss/football/` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 없음 |
| www.espn.com `/espn/rss/soccer/news` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | 없음 |

- 판정 방법: RFC 9309 방식(UA 그룹 매칭 → 가장 긴 경로 규칙, 같으면 Allow 우선)으로 검사했다. 우리 UA는 어느 호스트에서도 별도 그룹이 없어 `User-agent: *` 규칙을 따른다.
- **AI 관련 의사 표시(robots 주석)**: 우리는 학습용 크롤러가 아니지만 LLM 요약 서비스이므로 참고한다.
  - www.bbc.co.uk: "No using BBC content to create summaries for your own use", "No retrieval-augmented generation (RAG), AI-powered search, agentic AI or grounding using BBC content", "No business use without permission"
  - www.theguardian.com: "Any other uses are not permitted, incl. but not limited to: for large language models (LLMs), machine learning and/or artificial intelligence-related purposes" + `License: https://theguardian.com/license.xml`
  - www.nytimes.com: "Use of any device, tool, or process designed to data mine or scrape the content using automated means is prohibited without prior written permission" · 금지 용도로 "(2) the development of any software, machine learning, artificial intelligence (AI), and/or large language models (LLMs)", "(4) any commercial purposes"
  - www.skysports.com·www.espn.com: 주석 없음, AI 봇 UA만 차단
- NYT는 `/athletic/rss-feed/`와 `/athletic/*?*rss=1`을 막지만 우리가 쓰는 `/athletic/rss/...` 경로는 막지 않는다.

### 소스별 상세

#### 1) BBC Sport (피드 4개)

**피드**

| 피드 | URL | 항목 | 최신 · 가장 오래된 항목 | 메인과 겹침 | 비고 |
|---|---|---|---|---|---|
| Football(메인) | `https://feeds.bbci.co.uk/sport/football/rss.xml` | 78 | 2026-10-10 06:29 · 2026-08-04 | — | 같은 링크 중복 5건, Bitesize 5·Sounds 2·영상 다수 |
| Premier League | `…/football/premier-league/rss.xml` | 53 | 2026-10-10 05:56 · 2026-06-08 | 13건 | |
| Champions League | `…/football/champions-league/rss.xml` | 14 | 2026-10-07 20:14 · **2025-04-04** | 0건 | 최근 7일 1건 — 사실상 정체 |
| European football | `…/football/european/rss.xml` | 26 | 2026-10-09 09:57 · 2026-08-13 | 1건 | 대륙 리그 보강용, 최근 7일 5건 |

- 공통: HTTP 200, 리다이렉트 없음, `text/xml; charset=utf-8`, RSS 2.0, `ttl` 15분. 항목은 날짜순이 아니라 섞여 있다.
- 항목 필드: `title` · `description`(평문, 중앙값 약 140자, 최대 273자) · `link` · `guid` · `pubDate`(GMT) · `media:thumbnail`(이미지 — 쓰지 않음, CLAUDE §1-6). **author·category 없음.**
- 링크에 추적 파라미터 `?at_medium=RSS&at_campaign=rss`가 붙는다 → FR-04 URL 정규화 대상.
- 축구 외·범위 밖 혼입: 여자축구(Lionesses), 스코틀랜드 프리미어십, EFL, 대표팀, 퀴즈, Bitesize·Sounds·iPlayer 링크.
- 예시 제목: "Arteta's conscience clear over Man City charges" · "Time to rise? Ranking European football's sleeping giants" · "Luis Enrique signs new deal to extend PSG stay"
- 채널 `copyright`가 약관 위치를 직접 가리킨다: "see https://www.bbc.co.uk/usingthebbc/terms-of-use/#15metadataandrssfeeds for terms and conditions of reuse."

**약관** (확인 2026-10-10)
- BBC Terms of Use §15 Metadata and RSS feeds — https://www.bbc.co.uk/usingthebbc/terms-of-use/
  - a. For people: "You can add the BBC News RSS feed to your website or social media account. Provided: You don't change the RSS feed or remove any of our branding or logos" · 출처는 "BBC News, bbc.co.uk/news or bbc.com/news"를 텍스트와 하이퍼링크로 가까이 표시 · "You're not allowed to pluck metadata from our content or RSS feeds."
  - b. For business: "For business use of our RSS feeds you'll need to get our permission, and there may be a fee to pay."
- 같은 문서 §8 a(허가가 필요한 것): "Anything plucked from our services to develop or train artificial intelligence or to do computer analysis"
- business 이용의 정의 — https://www.bbc.co.uk/usingthebbc/terms/can-i-use-bbc-content-for-my-business/ : "It's a business use if you're using any of our services: … For educational, non-profit, charitable or government uses"
- 피드 안내 — https://www.bbc.co.uk/news/10628494 : 웹사이트에서 피드를 쓰는 것을 권장하되 "proper format and attribution", "You may not use any BBC logo or other BBC trademark."
- 요약: ① **LLM 요약은 불가**(피드 변경 금지 + AI·컴퓨터 분석 허가 필요 + robots 주석의 요약·RAG 금지). ② 원제목+링크 게재는 "개인이 자기 웹사이트에 피드를 수정 없이 게재" 조항에 기대면 가능하지만, 비영리 이용도 business로 본다는 정의가 있어 **불명확**. ③ 로고 금지(우리 §1-6과 일치). ④ 캐싱·보관 기간을 정한 조항은 찾지 못함.

**조사 시점 권고**: 4개 모두 제외(불명확이라 `terms_checked:false`).
**결정(2026-10-10)**: 4개 모두 **원제목+링크로 켬** — `enabled:true`, `summarize:false`, `terms_checked:true`, `robots_checked:true`. 근거는 §15 a(개인 웹사이트에 피드를 바꾸지 않고 게재) + 사용자 결정. 조건: 제목·설명 수정·번역 금지, 표시 링크는 피드 URL 원문 그대로, 출처 "BBC Sport" 텍스트+링크, 로고 미사용. robots 주석의 요약·RAG 금지는 `summarize:false`(LLM 미전송)로 지킨다. Tier 2(basic_plan §3.8), weight 메인 3 · European 2.5 · EPL 2 · UCL 1.

#### 2) Sky Sports — Football

**피드** — `https://www.skysports.com/rss/11095`
- HTTP 200, 리다이렉트 없음, `application/xml`, RSS 2.0, `ttl` 120분. 20건(최신 20건 고정), 최신 2026-10-09 21:31 UTC, 가장 오래된 항목 2026-09-28.
- 항목 필드: `title`(CDATA) · `description`(평문, 중앙값 122자, **20건 중 6건은 빈 값** — 라이브블로그 5건 포함) · `link` · `pubDate` · `category`(News Story 10 · Liveblog 5 · Article/Blog 3 · Report 2) · `enclosure`(이미지 — 쓰지 않음). **guid·author 없음.**
- `pubDate`가 `Thu, 08 Oct 2026 09:00:00 BST` 형식이다. JS `Date.parse`는 `BST`를 읽지 못한다(`NaN`) → 시각 파싱 시 `BST→+01:00`, `GMT→+00:00` 변환이 필요하다.
- 혼입: 여자 대표팀·잉글랜드 대표팀 경기, 챔피언십(West Ham v QPR), 라이브블로그(내용이 계속 바뀌는 페이지).
- 예시 제목: "Carrick demands Man City verdict clarity: 'It has affected me personally'" · "'I only found out this morning' - Moyes surprised Everton are up for sale" · "Papers: Man Utd forced into transfer market in January?"

**약관** (확인 2026-10-10)
- Sky Sports RSS 전용 이용 약관: **찾지 못함**(`https://www.skysports.com/rss`는 404, 검색 결과에도 없음).
- skysports.com 하단 링크가 가리키는 Sky.com and Sky Identity terms and conditions — https://www.sky.com/help/articles/skycom-terms-and-conditions (적용 범위: "Sky's websites, platforms, services, products and apps including sky.com")
  - 2.7: "You will not copy, download, reproduce, republish, frame, broadcast, transmit in any manner whatsoever, any material on any Sky Service … unless it is necessary for Your own personal non-commercial home use"
  - 2.8: "(a) you may not use any robots, bots, spiders, crawlers, devices, scripts or other data gathering or extraction software and/or tools, whether automated or manual, to access, acquire, copy, monitor, scrape, data mine, or aggregate any Content or any portion of the Sky Service for any purpose" · "(b) you may not use any Content for the purpose of directly or indirectly training, developing or improving a software tool or service, including any artificial intelligence tool"
- 요약: 피드는 공개돼 있지만 이를 웹사이트에 다시 보여 줘도 된다는 근거가 없고, 일반 약관은 "목적 불문" 자동 수집·집계와 재게시를 막는다. 요약·원제목 모두 허용 근거가 없어 **금지에 가까운 불명확**으로 본다.

**결정(2026-10-10)**: **제외** — `enabled:false`, `summarize:false`, `terms_checked:false`, `robots_checked:true`, Tier 2, weight 2.5(이적 강점 — 허가를 받으면 쓸 값).

#### 3) The Guardian — Football

**피드** — `https://www.theguardian.com/football/rss` (basic_plan의 "URL 실작동 확인 필요" → **정상 작동 확인**)
- HTTP 200, 리다이렉트 없음, `text/xml; charset=UTF-8`, RSS 2.0. 60건, 최신 2026-10-09 21:30 UTC.
- 항목 필드: `title` · `description`(**HTML**, 스탠드퍼스트 + 본문 첫 1~6문단 + "Continue reading..." 링크 — 평문 중앙값 758자, 최대 1,613자) · `link` · `guid` · `pubDate` · `dc:creator`(60/60) · `dc:date` · `category`(60/60, 팀·대회·인물 태그 다수) · `media:content`·`media:credit`(이미지 — 쓰지 않음).
- 60건 중 39건이 요청 시각 기준 36시간 밖이다(2017·2022년 상시 노출 항목 포함).
- 혼입: 여자축구 10, US sports 4, Newsletter sign-up 4, 인터랙티브·영상·오디오·사진 페이지.
- 예시 제목: "Managers react to Manchester City's guilty verdict: 'Uncertainty is not good for anyone'" · "West Ham's penalty pain costs them top spot in Championship after QPR draw"

**약관** (확인 2026-10-10)
- RSS 안내 — https://www.theguardian.com/help/feeds : "You can use these feeds in a number of ways for personal, non-commercial purposes in accordance with our terms of service."
- Terms and conditions §3 — https://www.theguardian.com/help/terms-of-service : 이용은 "your own personal and non-commercial use only". 사전 서면 승인 없이 할 수 없는 일로 "(c) with any machine learning and/or artificial intelligence technologies to generate any data or content or to synthesise or combine with any other data or content", "(d) for any commercial use"를 든다. 또한 "robot, bot, spider, scraper, crawler … or other automated device"의 사용을 금지하고, "Our robots.txt notice does not, and shall not, constitute the Guardian's permission"이라고 못 박는다.
- `license.xml`(RSL) — https://www.theguardian.com/license.xml : `<permits type="usage">ai-train ai-input</permits>` + `<payment type="subscription">`(licensing.theguardian.com) + `<prohibits type="usage">all</prohibits>` → AI 입력은 유료 구독 라이선스로만 허용.
- Open Platform(Content API) 약관 — https://www.theguardian.com/open-platform/terms-and-conditions : 번역·수정 금지("Edit, adapt, translate or otherwise alter"), AI 이용 금지, "Powered by The Guardian" 로고 필수, 24시간마다 갱신·삭제 의무 → **대안이 되지 못한다**(로고 의무가 CLAUDE §1-6과도 충돌).
- 요약: LLM 요약은 **명시적 금지**. 원제목 게재도 "개인·비상업" 범위를 넘는 공개 재게시이고 자동화 도구 금지 조항에 걸린다.

**결정(2026-10-10)**: **제외** — `enabled:false`, `summarize:false`, `terms_checked:false`, `robots_checked:true`, Tier 2, weight 2. **영향**: basic_plan §3.5.1의 "Romano의 Guardian 기고를 작성자 필터로 수집" 계획도 함께 불가 → M0-24에서 Romano 채널을 다시 검토한다.

#### 4) The Athletic (NYT)

**피드**
- basic_plan URL `https://www.nytimes.com/athletic/rss/news/`: HTTP 200, `application/xml`, RSS 2.0, 100건(약 3일치), 최신 2026-10-10 05:51 UTC. **전 종목 피드**(NFL·NBA·MLB·NHL·F1·WNBA·NASCAR…)라 축구는 약 40%(100건 중 약 40건)이고, 축구 항목 중에도 "How to watch … in the U.S." 중계 안내가 섞인다. `dc:creator`는 100건 중 10건(라이브블로그)뿐이다.
- **축구 전용 피드 확인**: `https://www.nytimes.com/athletic/rss/football/` (`/athletic/rss/soccer/`도 같은 항목) — HTTP 200, 채널명 "Soccer - The Athletic", 100건(약 8일치), 최신 2026-10-10 04:14 UTC, 24h 13건 · 7일 88건. 분석·기획 기사 위주이고, 메인 news 피드에 있던 짧은 팀 뉴스(예: 부상 소식 4건)는 빠져 있다.
- 항목 필드(축구 피드): `title` · `description`(평문, 중앙값 128자, 최대 140자) · `link` · `guid` · `pubDate`(GMT) · `media:content`·`media:description`(이미지 — 쓰지 않음). **author(`dc:creator`)·category 없음** → basic_plan §3.5.1의 "David Ornstein 작성자 필터"는 이 피드로는 불가능하다(제목에 이름이 들어간 Q&A 정도만 잡힘).
- 본문은 유료(페이월) — 링크만 건다.
- 예시 제목(축구 피드): "Why Real Madrid's Mbappe-Vinicius Jr dilemma is Mourinho's biggest challenge" · "Aleksander Ceferin to stand for unprecedented fourth and final term as UEFA president"

**약관** (확인 2026-10-10)
- NYT RSS 안내 — https://www.nytimes.com/rss : "We allow the use of NYTimes.com RSS feeds for personal use in a news reader or as part of a non-commercial blog. We require proper format and attribution whenever New York Times content is posted on your website, and we reserve the right to require that you cease distributing NYTimes.com content."
- NYT Terms of Service(The Athletic 포함, Effective January 20, 2026) — https://help.nytimes.com/hc/en-us/articles/115014893428-Terms-of-Service
  - 1.1: 적용 대상에 The Athletic과 "RSS feeds"가 들어 있다.
  - 2.1: 비상업 이용에는 사전 서면 동의 없이 "training or using the Content in connection with the development or operation of a machine learning or artificial intelligence (AI) system (including any use of the Content for training, fine tuning, or grounding the machine learning or AI system or as part of retrieval-augmented generation)"이 포함되지 않는다.
  - 4.1(3): 같은 AI 이용을 금지 행위로 다시 명시. 4.1(5): "cache or archive the Content"(검색엔진의 링크·짧은 비AI 스니펫 예외) 금지.
- 요약: ① LLM 요약·번역은 **명시적 금지**(LLM에 입력하는 것 자체가 "operation of an AI system"). ② 원제목+링크 게재는 RSS 약관의 "non-commercial blog" 조항으로 **조건부 허용**(형식·출처 표기, 중단 요구 시 즉시 중단). ③ 4.1(5) 캐시·보관 금지 때문에 원제목 카드를 90일 보관·월별 병합 아카이브(CLAUDE §8)에 남기는 것은 **불명확** — 보관 기간을 짧게 하거나 아카이브에서 빼는 방안을 검토해야 한다.

**결정(2026-10-10)**: URL을 축구 피드 `https://www.nytimes.com/athletic/rss/football/`로 바꾸고 **원제목+링크로 켬** — `enabled:true`, `summarize:false`, `terms_checked:true`, `robots_checked:true`, Tier 2, weight 1.5. 조건: LLM 입력·번역 금지, 제목 무수정, 링크는 피드 URL 원문 그대로, 출처 "The Athletic" 표기, 중단 요구 시 즉시 중단. 미해결: 4.1(5) 캐시·보관 금지와 보관 정책의 관계(M1 검토).

#### 5) ESPN — Soccer

**피드** — `https://www.espn.com/espn/rss/soccer/news`
- HTTP 200, 리다이렉트 없음, `text/xml;charset=UTF-8`, RSS 2.0, `ttl` 30분. 17건, 최신 2026-10-10 00:22 UTC, 가장 오래된 항목 2026-10-07.
- 항목 필드: `title`(CDATA, 이모지가 들어간 제목 있음 — 예: "⚽ What's next for Man City…") · `description`(평문, 중앙값 146자, 최대 216자) · `dc:creator`(17/17, 기자명 또는 PA·ESPN) · `link` · `guid`(`US-EN-<id>`) · `pubDate`. **category 없음.**
- `pubDate`가 10월(미국 서머타임 기간)에도 `EST`로 표기되고, **17건 중 9건이 같은 시각(`19:22:00~01 EST`)**이라 실제 발행 시각이 아니라 일괄 갱신 시각으로 보인다 → 최신성 점수(FR-06)에 쓰기 어렵다.
- 혼입: 미국 여자 대표팀, MLS, 멕시코 대표팀, 사우디 리그, 월드컵 파워랭킹.
- 예시 제목: "Arteta insists conscience is clear over time at Man City" · "Transfer rumors, news: Real Madrid eye McTominay as Napoli talks stall"

**약관** (확인 2026-10-10)
- ESPN RSS Terms — https://www.espn.com/espn/news/story?page=rssinfo : "If you choose to display an ESPN RSS feed on a website or app, you are only permitted to display the content that is provided in the feed, you must link to the full article on espn.com using the URLs provided in the feed, and you must indicate that the content has been provided by ESPN. You may not incorporate advertising into any ESPN RSS content. You may not modify any content provided in the feed, including but not limited to story headlines, story summaries, or URLs."
- Disney Terms of Use(Last Updated May 24, 2024) — https://disneytermsofuse.com/english/ : 2.B.viii "commercial or business-related use … whether or not for profit" 금지, 2.B.x 로봇·스크립트로 접근·추출 금지("for the purposes of creating or developing any AI Tool, data mining or web scraping" 포함). RSS Terms는 웹사이트·앱에 피드를 보여 주는 것을 명시적으로 전제하므로, 피드 표시는 RSS Terms의 특별 조건을 따르는 것으로 해석했다.
- 요약: ① LLM 요약·번역은 **금지**(제목·요약 수정 금지). ② 원제목(+원문 요약 그대로)+링크 게재는 **조건부 허용**: 피드 내용 그대로, 링크는 피드 URL 그대로, "ESPN" 출처 표기, 광고 없음 — 우리 서비스는 광고가 없어 충족한다. ③ 로고 관련 조항은 RSS Terms에 없음(우리는 원래 로고를 쓰지 않음).

**권고 (ESPN 결론)**: **원제목+링크 전용 소스로 쓴다.** `terms_checked:true`(원제목 모드 한정), `robots_checked:true`, Tier 2, weight 1(미국 중심 혼입·시각 신뢰도 낮음).
- 지킬 조건: LLM 입력·번역·제목 다듬기 금지(`ai:false` 카드), 카드 링크는 **피드 URL 원문 그대로**(FR-04 정규화 URL은 중복 판정 해시에만 쓰고 표시 링크는 바꾸지 않는다), 출처명 "ESPN" 표기, 광고 없음.
- **결정(2026-10-10)**: 위 결론대로 **원제목+링크로 켬** — `enabled:true`, `summarize:false`, `terms_checked:true`, `robots_checked:true`.
- 근거: 8개 가운데 원제목 게재 조건이 가장 분명하게 적혀 있고(RSS Terms), 같은 사건 클러스터의 "보도 매체 수"(FR-06)와 출처 링크(FR-05)를 늘리는 효과가 있으며, LLM 토큰을 쓰지 않는다.

### Source 등록값 메모
- 최종 등록값은 위 "사용자 결정 — 등록 결과" 표와 `configs/sources.json`이 단일 출처다. (조사 시점의 제안안은 8개 모두 `enabled:false`였고, 결정 후 위와 같이 바뀌었다.)
- **`terms_checked`의 의미(결정)**: "약관을 확인했고, `note`에 적은 이용 방식(요약 또는 원제목+링크)이 약관상 허용된다". 금지·불명확이면 `false`. 누군가 `enabled`만 `true`로 바꿔도 금지 소스는 수집되지 않는다(FR-01 이중 잠금).
- `competitions`는 피드가 다루는 범위 힌트다. 전체 축구 피드는 빈 배열로 두었다.

### '원제목+링크만' 모드 표현 방법 비교 (plan §14 B5) — 결정: ② 필수 필드

| 항목 | ① `enabled:false`로 제외 | ② 스키마에 `summarize: boolean` 추가 |
|---|---|---|
| 변경 | 없음 | `Source` zod 스키마 → fixtures → 테스트 순으로 변경(CLAUDE §8), **사용자 승인 필요** |
| 동작 | ESPN·Athletic도 수집하지 않음 | `summarize:false` 소스는 **LLM 입력에서 빼고** 원제목+링크 카드(`ai:false`)로 게시. 기존 강등 카드 형식(FR-26·27·29, 원제목 200자 — PRD §15 D15)과 "AI 요약" 라벨 미표시(FR-35)를 그대로 재사용 |
| 클러스터 | — | 요약 가능 소스와 같은 사건이면 **링크만 추가**하고 요약 입력에는 넣지 않음. 클러스터가 원제목 소스로만 이뤄지면 대표 원제목 카드 |
| 비용 | 0 | 토큰 감소(요약 대상 축소), 번들 영향 없음, 구현 소량(M1-02 로더·M1 요약 입력 필터) |
| 위험 | 1군 영문 소스 0개 → 클러스터 크기·출처 다양성 하락 | 원제목(영문) 카드 비중이 늘면 한국어 서비스 체감 품질 하락 → D0 시안에 "원제목 카드" 상태를 포함해야 함 |

- **결정: ②, 기본값 없는 필수 필드.** 기본값을 `true`로 두면 새 소스를 등록할 때 약관 확인을 빠뜨려도 AI 요약이 켜진다. 필수로 두면 소스마다 명시적으로 고르게 된다. 스키마·fixture·테스트는 CLAUDE §8 순서로 반영했다(`configs/sources.json`이 아직 없었으므로 마이그레이션 불필요).

### M1 구현 메모 (M1-02 로더·수집·정제·요약 단계)

**`summarize:false` 소스 처리 (PRD FR-20·§15 D22)**
- **LLM 미전송**: 요약 배치 입력을 만들 때 `summarize:false` 소스의 항목(제목·설명)은 넣지 않는다. 같은 사건 클러스터에 요약 가능한 소스가 있으면 그 소스들로만 요약하고, `summarize:false` 소스는 출처 링크(`src[]`)로만 붙인다. 클러스터가 `summarize:false` 소스로만 이뤄지면 대표 항목의 원제목 카드(`ai:false`)로 게시한다.
- **원제목 그대로**: 피드 `title`을 번역·다듬기·자르기 없이 쓴다(엔티티 디코딩·앞뒤 공백 정리만). 원제목 상한 200자(PRD §15 D15)를 넘는 항목은 자르면 "수정"이 될 수 있으므로 건너뛰고 로그를 남기는 쪽을 권장한다(관찰된 최대 길이: The Athletic 114자, 나머지 84자 이하). ESPN 제목의 이모지("⚽")도 그대로 둔다.
- **설명(description)**: 원제목 카드에 설명을 보여 줄 때도 원문 그대로만. 기본은 표시하지 않는다(원제목+링크). 표시가 필요해지면 D0 시안에서 정한다.
- **링크 원문**: 카드의 표시 링크는 피드 `link` 원문 그대로다(BBC `?at_medium=RSS&at_campaign=rss` 포함). FR-04 URL 정규화(추적 파라미터 제거·AMP→원본)는 **중복 판정 해시·카드 ID 계산에만** 쓴다. 이렇게 해도 카드 ID는 정규화 URL 기반이라 결정적이다(CLAUDE §8).
- **분류**: 원제목 카드의 카테고리·태그·중요도는 한국어 카드와 같은 코드 규칙(키워드·`names.ko.json`)으로 채운다(FR-20). "AI 요약" 라벨은 붙이지 않는다(FR-35).
- **출처 표기**: 카드 출처명은 `Source.name`의 매체명 — "BBC Sport", "The Athletic", "ESPN". 로고는 쓰지 않는다(CLAUDE §1-6).
- **D0 영향**: 원제목(영문) 카드가 주력이 될 수 있으므로 D0 시안에 원제목 카드 상태를 반드시 넣는다.

**피드별 파싱**
- **시각(`src/lib/time.ts`)**: Sky `pubDate`는 `BST`/`GMT` 약어(JS `Date.parse`가 `BST`를 못 읽음 → `BST=+01:00`, `GMT=+00:00`). ESPN은 서머타임 기간에도 `EST`로 표기되고 일괄 갱신 시각(17건 중 9건 동일)이라, 약어 표에 `EST=-05:00`·`EDT=-04:00`를 두되 ESPN 시각은 최신성 가중을 낮추거나 "처음 본 시각"으로 대체하는 방안을 테스트로 비교한다. 결과는 모두 UTC ISO로 저장한다.
- **중복**: BBC 메인 피드 안에서도 같은 링크가 5건 겹친다. BBC EPL 피드는 메인과 13건 겹친다 → 정규화 URL 해시로 제거(FR-04).
- **혼입 필터(코드 규칙)**: 여자축구·스코틀랜드·EFL·MLS·미국 대표팀·퀴즈·Bitesize/Sounds/iPlayer 링크·중계 안내("How to watch") 등은 경로·키워드 규칙으로 거른다(LLM 아님).
- **본문성 필드**: Guardian(제외됨)처럼 `description`이 HTML 문단이면 첫 문단만·태그 제거·500자 컷(요약 소스용 규칙). `content:encoded`는 읽지 않는다(FR-02).
- **OG 보충 안 함**: 이번 5개 매체는 모두 약관상 봇 접근 제한이 있어, 설명이 빈 항목(Sky 라이브블로그 등)을 기사 페이지 OG로 보충하지 않는다.
- **이미지 필드**: `media:thumbnail`·`media:content`·`enclosure`는 읽지 않는다(CLAUDE §1-6).
- **건강도**: BBC Champions League 피드는 최근 7일 1건 → FR-11의 "3일 연속 0건" 이슈가 자주 날 수 있다. 첫 1주 관찰 후 기준 조정 또는 비활성 검토.

### 결론

피드 8개는 모두 작동하지만 8개 모두 약관상 LLM 한국어 요약 대상이 될 수 없다. 사용자 결정(2026-10-10)에 따라 BBC 4개·The Athletic(축구 피드)·ESPN 6개를 원제목+링크(`summarize:false`)로 켜고, Sky·Guardian은 제외했다. 1군 영문 소스의 LLM 요약 대상은 0개이므로, M0-24~26(2군·기자·국내·Google News)을 같은 기준으로 판정한 뒤 요약 가능한 소스가 부족하면 FR-20 범위를 재검토한다.

**후속 영향**
- plan §14 B5 발생 → M1-02(소스 로더)에 `summarize` 처리, D0 시안에 원제목(영문) 카드 상태 포함.
- basic_plan §3.5.1: Romano(Guardian 기고)·Ornstein(Athletic 작성자 필터) 수집 경로가 막힘 → M0-24에서 대체 채널 확인.
- PRD 비용 표: 1군 영문 소스가 요약 대상에서 빠지면 일일 LLM 토큰이 줄어든다(M0-30 실측 때 함께 갱신).

---

## M0-24 2군 매체·기자 채널

> 상태: **✅ 완료 — 사용자 결정(2026-10-10) 반영.** `configs/sources.json`에 8개 등록(원제목+링크 3 · 기록용 제외 5 → 전체 16개). 아래 "핵심 결론"~"사용자 확인 질문"은 조사 시점 기록이고, 최종 결과는 "사용자 결정 (2026-10-10)"이 단일 출처다.

대상: plan M0-24의 기자 채널 6개(basic_plan §3.5.1)에 오케스트레이터 결정으로 리그 특화 2군 7개(§3.3)와 이적 집계 사이트 5개(§3.5.2)를 더한 **18개 채널**.
판정 기준·용어는 M0-23과 같다(문서 머리 표의 판정 용어, PRD §15 D22). "명시적 허용"과 "명시적 금지 없음 + RSS 게재 허용"을 구분해 적고, 근거가 모호하면 보수적으로 판정했다.
요청 범위: 2026-10-10 07:03~07:15 UTC(16:03~16:15 KST), 82건(200: 66 · 404: 5 · 403: 3 · 503: 3 · 연결 실패: 5). 피드·robots.txt·약관/RSS 안내 페이지와 목록 페이지(홈·섹션·작성자 페이지) 1회씩만 요청했고, 기사 본문 페이지 요청 0건, 금지 사이트 접근 0건이다. 같은 호스트 요청 간격 2~3초.

### 핵심 결론 (먼저 읽기)
1. **(조사 시점 권고) 18개 채널 모두 제외.** 약관상 AI 요약(`summarize:true`)이 가능한 소스는 **0개**이고, 원제목+링크 게재 근거가 분명한 소스도 **0개**다. → 결정: 불명확 3개는 원제목+링크로 켬(아래 "사용자 결정").
   - 금지(명시) 11: CaughtOffside 2(Romano 작성자 피드·사이트 전체), Football Italia, Football España, Sky Sport DE, Bundesliga.com, UEFA.com, Marca English, Calciomercato.com, TEAMtalk, Football365
   - 불명확 3: the Daily Briefing(Romano Substack), Gianluca Di Marzio, Relevo
   - 채널 소멸·접속 불가 4: Ben Jacobs의 CBS Sports 기고(2022-08 이후 없음), Get German Football News(연결 거부), Get French Football News(Cloudflare 봇 차단), 90min 영문판(Sports Illustrated로 이전, 피드 1년 정체)
2. **"명시적 허용"은 하나도 없었다.** M0-23의 ESPN·NYT 같은 "RSS를 웹사이트에 게재해도 된다"는 약관 조항도 없었다. AI 이용을 허용하는 쪽의 표시는 **기계 판독 신호 2건**뿐이고, 둘 다 같은 사이트의 약관 본문과 충돌한다.
   - the Daily Briefing robots.txt `Content-Signal: search=yes, ai-input=yes, ai-train=no` — Substack 공통값으로 보이고, Substack ToS는 수집(crawl·scrape)을 금지한다. 발행사(Rocket Sports Internet)는 자기 다른 사이트에서 AI 요약을 명시적으로 금지한다.
   - Relevo robots.txt 주석 "Crawlers de IA / LLM — acceso explícitamente permitido" — 접근 허용일 뿐이고, 이용 약관 §7은 전부·일부 복제와 수정을 서면 허가 없이 금지한다.
3. **기자 채널이 한 회사로 모였다.** Romano·Moretto·Ben Jacobs가 지금 쓰는 곳은 모두 Rocket Sports Internet 계열(the Daily Briefing 뉴스레터 섹션, CaughtOffside 칼럼)이다. Rocket의 "Search Only Terms Contract"(robots.txt `License` 줄이 가리킴)는 AI 요약 제품을 비상업 이용에서 빼고, 검색 결과 외의 표시와 요약·새 제목 생성을 금지하며, 무허가 접근에 건당 £500 접근료를 매긴다. Plettenberg(Sky Sport DE)는 RSS가 없고 TDM 이용이 금지돼 있다.
4. **리그 특화 영문 매체가 많이 사라졌다.** Di Marzio `/en`·Calciomercato `/en`은 404(영문판 폐지), 90min 영문판은 SI로 이전했고, GGFN·GFFN은 우리 UA로 접근할 수 없다. 남은 영문 매체(Football Italia·Football España)는 Rocket 계약 대상이다.
5. **FR-20 재검토에 필요한 입력**: M0-23과 M0-24를 합치면 26개 채널 중 AI 요약 가능 0, 원제목+링크 가능 6(M0-23의 BBC 4·ESPN·The Athletic)이다. 영문 매체 RSS를 LLM으로 요약한다는 FR-20의 전제가 약관상 성립하지 않는다. M0-25(국내)·M0-26(Google News)·M0-27(GDELT) 판정을 받은 뒤 FR-20 범위를 다시 정해야 한다(아래 "사용자 확인 질문" 3). → 결정: 지금 재정의(PRD §15 D23·D24, 아래 "사용자 결정" 3).

### 사용자 결정 (2026-10-10)

| # | 항목 | 결정 | 반영 |
|---|---|---|---|
| 1 | 불명확 3개(the Daily Briefing·Di Marzio·Relevo) | **원제목+링크로 켬** — `enabled:true`, `summarize:false`, `terms_checked:true`. 약관이 불명확한 상태에서 원제목+링크 전용 게재를 **사용자 결정으로 수용한 위험**으로 note에 명시(BBC 선례와 같은 방식) | `configs/sources.json` |
| 2 | 피드가 작동하는 나머지 5개(CaughtOffside 2·Football Italia·Football España·UEFA UCL) | **판정 기록용 등록** — `enabled:false`, `summarize:false`, `terms_checked:false`(M0-23 Sky·Guardian 선례). m4ow 계약 대상 4개(Rocket 계열 CaughtOffside 2·Football Italia + robots.txt가 같은 계약을 가리키는 Football España)는 **m4ow 약관 — 접근 자체를 하지 않음(검증 요청도 금지)** | `configs/sources.json` |
| 3 | FR-20 재검토 | **지금 재정의.** 해외 뉴스는 모두 원제목+링크 + 코드 규칙 한국어 태그로 게시하고, 일일 LLM 호출 #1(뉴스 요약·분류)은 "정형 데이터 기반 한국어 브리핑"으로 교체한다. 앞으로 `summarize:true` 소스는 없다(`Source.summarize` 필드는 유지) | PRD §15 D23·D24(오케스트레이터 반영) |

- 피드가 없거나 작동하지 않는 10개(Sky Sport DE·Bundesliga.com·TEAMtalk·Football365·Marca English·Calciomercato.com·Ben Jacobs CBS·GGFN·GFFN·90min)는 등록하지 않고 이 문서에만 남긴다.

**등록 결과 — `configs/sources.json`** (8개 추가 → 16개, `npm run validate` 통과, 수집 대상 `enabled && terms_checked` = 9개, LLM 요약 대상 0개)

| id | 피드 URL | type | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `daily-briefing` | thedailybriefing.io/feed | journalist | en | true | false | true | true | 2 | 1.5 | [] | 원제목+링크(수용한 위험) |
| `di-marzio` | www.gianlucadimarzio.com/rss | journalist | it | true | false | true | true | 2 | 2 | [SERIEA] | 원제목+링크(수용한 위험) |
| `relevo` | www.relevo.com/feed/ | rss | es | true | false | true | true | 2 | 1 | [LALIGA] | 원제목+링크(수용한 위험) |
| `caughtoffside-romano` | www.caughtoffside.com/author/fabrizio-romano/feed/ | journalist | en | false | false | false | true | 1 | 2.5 | [] | 제외 — 접근 금지(m4ow) |
| `caughtoffside` | www.caughtoffside.com/feed/ | aggregator | en | false | false | false | true | 3 | 1 | [] | 제외 — 접근 금지(m4ow) |
| `football-italia` | football-italia.net/feed/ | rss | en | false | false | false | true | 3 | 1.5 | [SERIEA] | 제외 — 접근 금지(m4ow) |
| `football-espana` | www.football-espana.net/feed | rss | en | false | false | false | true | 3 | 1.5 | [LALIGA] | 제외 — 접근 금지(m4ow) |
| `uefa-ucl-news` | www.uefa.com/rss/uefachampionsleague/rss.xml | rss | en | false | false | false | true | 1 | 1.5 | [UCL] | 제외 |

- `caughtoffside-romano`만 `author: "Fabrizio Romano"`(작성자 피드). 각 `note`에 확인 날짜·결정·근거 URL·짧은 인용·지킬 조건을 적었다.
- 켠 3개의 공통 조건: 피드 제목 무수정·번역 금지(이탈리아어·스페인어 원제목 그대로), 표시 링크는 피드 URL 원문 그대로, 출처명 표기(`the Daily Briefing`·`Gianluca Di Marzio`·`Relevo`), description·`content:encoded`는 읽거나 표시하지 않음(FR-02), 중단 요구가 오면 즉시 끔.
- **M1 구현 메모**
  - Relevo는 전 종목 피드(15건/24시간 중 축구 10 — NFL·모터사이클·테니스·사이클 등 혼입)라 **축구 외 기사 필터가 필수**다. 링크 경로(`/futbol/…`)와 `category`로 거르는 코드 규칙을 쓴다(LLM 아님).
  - Di Marzio는 이탈리아어, Relevo는 스페인어 원제목 카드가 된다 → D0 시안의 원제목 카드 상태에 비영어 제목 예시를 넣는다. Di Marzio 피드에는 author가 없다.
  - the Daily Briefing 제목은 모두 "🚨"로 시작한다 — ESPN 이모지와 같이 그대로 둔다(수정 금지). 작성자는 Mark Brus·the Daily Briefing뿐이라 Romano 작성자 필터를 쓰지 않는다.
  - m4ow 계약 대상 4개는 `enabled:false`라 수집되지 않지만, 검증 스크립트·건강도 점검(FR-11)·`/add-source` 재확인에서도 이 URL에 요청하지 않도록 한다.

### 요약 표

| # | 대상 | 피드 / 크롤 | 상태 (항목 · 최신 UTC · 24h/7일) | 작성자 필드 | robots (우리 UA · AI 봇) | 약관 핵심 | 판정 | 권고 |
|---|---|---|---|---|---|---|---|---|
| 1 | Romano — the Daily Briefing (Substack) | RSS `thedailybriefing.io/feed` | ✅ 20 · 10-10 06:54 · 2/16 | dc:creator 20/20 — Mark Brus·the Daily Briefing만, **Romano 0/20** | 허용 · GPTBot·ClaudeBot·CCBot·Google-Extended·anthropic-ai 차단, `Content-Signal: ai-input=yes` | Substack ToS: 수집(crawl·scrape)·상당 부분 복사 금지, RSS 게재 조항 없음 | **불명확** | 제외 |
| 2 | Romano — CaughtOffside 작성자 페이지 | RSS `…/author/fabrizio-romano/feed/` (목록 크롤링 불필요) | ⚠️ 10 · **09-11** 15:00 · 0/0 (한 달 공백) | dc:creator = Fabrizio Romano | 허용 · 모두 허용, `License: m4ow.uk/socw/2.txt` | Rocket ToS + Search Only Terms Contract: AI 요약 제품 제외·요약·새 제목 금지·검색 외 표시 금지·건당 £500 | **금지** | 제외 |
| 3 | Gianluca Di Marzio | RSS `gianlucadimarzio.com/rss` (**이탈리아어**, `/en` 404) | ✅ 10 · 10-10 07:00 · 10/10 | 없음 | 허용 · 모두 허용 | RSS 안내: "per uso personale", 상업 이용은 편집부 문의. AI 조항 찾지 못함 | **불명확** | 제외(허가 요청 시 재검토) |
| 4 | Plettenberg — Sky Sport DE | RSS 없음 → 목록 `sport.sky.de/transfer-news` | 목록 약 12건(제목·링크만, 날짜·작성자 없음) | 없음(필터 불가) | robots.txt 404(제한 없음) | Impressum: "Text und Data Mining im Sinne von § 44b UrhG … ist untersagt", 복제권 유보 | **금지** | 제외 |
| 5 | Moretto — Relevo | RSS `relevo.com/feed/` (스페인어, 전 종목) | ✅ 15 · 10-10 06:02 · 15/15 | dc:creator 있음, **Moretto 0** | 허용 · AI 봇 명시 허용 | 조건 §7: 전부·일부 복제·이용 금지(서면 허가), 요약·언론 리뷰 형태 반대, 수정 금지 | **불명확** | 제외 |
| 6 | Ben Jacobs — CBS Sports | 작성자 페이지 `cbssports.com/writers/ben-jacobs/` · RSS `…/rss/headlines/soccer/` | 작성자 글 최신 **2022-08-11** · 축구 RSS 36건에 Jacobs 0 | RSS dc:creator 있음 | 허용(GPTBot만 차단) | — (채널 비활성이라 약관 미조사) | **채널 소멸** | 제외 |
| 7 | Football Italia | RSS `football-italia.net/feed/` | ✅ 20 · 10-09 19:07 · 20/20 | dc:creator 있음 | 허용 · 모두 허용, `License: m4ow` | Rocket 소유 — #2와 같은 계약 | **금지** | 제외 |
| 8 | Bundesliga.com 영문 뉴스 | 뉴스 RSS 없음(라이브티커 RSS만) → 목록 `/en/bundesliga/news` | 목록 13건 + `publishedAt` | — | 허용 · AI 봇 명시 허용, 단 주석에 § 44b TDM 유보·봇 사용 금지 | 이용약관 6.2·법적 고지 2.2: 봇으로 접근·분석·다운로드 금지 | **금지** | 제외 |
| 9 | Get German Football News | `getgermanfootballnews.com` | ❌ 연결 거부(https·http, www·non-www) | — | 확인 불가 | 확인 불가 | **접속 불가** | 제외 |
| 10 | Marca English | RSS `marca.com/en/rss/googlenews/portada.xml` · `e00-marca.uecdn.es/rss/en/index.xml` | ❌ 503 ×3(우리 UA) · index.xml은 **2026-04-28**에 멈춤(NFL·미국 연예 위주) | dc:creator 있음 | 허용 · GPTBot·anthropic-ai·CCBot·Google-Extended 등 차단 | ToS 3.4: 전부·일부 수정·복사·재사용·추출·복제 금지, 인용 예외 반대 | **금지** | 제외 |
| 11 | Football España | RSS `football-espana.net/feed` | ✅ 10 · 10-09 20:00 · 3/10 | dc:creator 있음 | 허용 · 모두 허용, `License: m4ow` | #2와 같은 계약 | **금지** | 제외 |
| 12 | Get French Football News | `getfootballnewsfrance.com` | ❌ 403 Cloudflare "Just a moment…"(robots.txt·피드 모두) | — | 확인 불가(봇 차단) | 확인 불가 | **접속 불가** | 제외 |
| 13 | UEFA.com 뉴스 | RSS `uefa.com/rss/uefachampionsleague/rss.xml` (+`/rss/insideuefa/rss.xml`) | ✅ 50 · 10-09 07:00 · 0/15 | 없음 | 허용 · 모두 허용 | 약관 6.2: 개인 열람 외 이용·표시 금지, 자동 수집 금지, AI 개발 이용 금지 | **금지** | 제외 |
| 14 | CaughtOffside (사이트 전체) | RSS `caughtoffside.com/feed/` | ✅ 10 · 10-10 06:28 · 10/10 | dc:creator 있음 | 허용 · 모두 허용, `License: m4ow` | #2와 같은 계약 | **금지** | 제외 |
| 15 | Calciomercato.com 영문 | `/en` **404**(영문판 폐지) · 사이트 피드는 FootballCo 이탈리아어 | 이탈리아어 피드 20건(약 3시간치) | dc:creator 6/20 | 허용 · AI 봇 차단, 피드 호스트 robots 403 | FootballCo ToS: TDM·웹 스크래핑 금지("access, obtain, copy, monitor or republish") | **금지** | 제외 |
| 16 | TEAMtalk | RSS 없음(`/feed` 404) → 홈 목록 | 홈 링크 57개 + `datetime` | — | 허용 | Planet Sport ToS: 자동 시스템·AI로 색인·분석·재게시 금지(§6) | **금지** | 제외 |
| 17 | Football365 | RSS 없음(`/feed` 404) → 홈 목록 | 홈 링크 38개 + `datetime` | — | 허용 | TEAMtalk과 같은 Planet Sport ToS | **금지** | 제외 |
| 18 | 90min | RSS `90min.com/feed`·`/posts.rss` | ⚠️ 90 · **2025-09-29** · 0/0 — 홈: "We've Moved To Sports Illustrated" | author 43/90 | 허용 | Minute Media T&C: 권리 유보, AI·수집 조항 찾지 못함 | **채널 소멸** | 제외 |

> 24h/7일은 각 피드 요청 시각(07:05~07:12 UTC) 기준이다. "AI 봇"은 아래 매트릭스의 8개 UA다.

### robots.txt 매트릭스 (피드·목록 경로 기준)

| 호스트 · 경로 | EuroDigestBot | GPTBot | ClaudeBot | Claude-User | CCBot | Google-Extended | anthropic-ai | PerplexityBot | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| thedailybriefing.io `/feed` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | `Content-Signal: search=yes, ai-input=yes, ai-train=no` |
| www.caughtoffside.com `/feed/`·`/author/fabrizio-romano/feed/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `# License https://m4ow.uk/socw/2.txt` + `tdl:` |
| football-italia.net `/feed/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 위와 같은 License 줄 |
| www.football-espana.net `/feed` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 위와 같은 License 줄 |
| www.gianlucadimarzio.com `/rss` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| sport.sky.de | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | robots.txt 404(규칙 없음) |
| www.relevo.com `/feed/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 주석: AI·LLM 크롤러 명시 허용 |
| www.cbssports.com `/rss/headlines/soccer/` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| www.bundesliga.com `/en/bundesliga/news` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 주석: § 44b UrhG TDM 유보·봇 사용 금지 |
| www.marca.com `/en/rss/googlenews/portada.xml` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 우리 UA에 503 응답 |
| e00-marca.uecdn.es `/rss/en/index.xml` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | |
| www.uefa.com `/rss/uefachampionsleague/rss.xml` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| www.calciomercato.com `/en` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | feeds.footballco.com robots.txt는 403 |
| www.teamtalk.com `/` · www.football365.com `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| www.90min.com `/feed` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| www.getfootballnewsfrance.com | — | — | — | — | — | — | — | — | 403 Cloudflare 챌린지 — 판정 불가 |
| getgermanfootballnews.com | — | — | — | — | — | — | — | — | 연결 거부 — 판정 불가 |

- 판정 방법은 M0-23과 같다(RFC 9309 방식, 우리 UA는 어느 호스트에서도 별도 그룹이 없어 `*` 규칙을 따름). Crawl-delay를 둔 호스트는 없다.
- robots.txt가 허용해도 약관이 막으면 쓰지 않는다. 이번에는 robots.txt가 열려 있고 약관이 막는 경우(Rocket 계열·Bundesliga·UEFA·Planet Sport)가 대부분이었다.

### 대상별 상세

#### A. 기자 채널 (basic_plan §3.5.1)

**1) Fabrizio Romano — the Daily Briefing (Substack)**
- 피드 `https://thedailybriefing.io/feed`: HTTP 200, `application/xml`, RSS 2.0, 20건(10-02~10-10), 24h 2 · 7일 16. 채널 `copyright`는 "Rocket Sports Internet"(CaughtOffside 운영사). About 페이지: "in exclusive partnership with caughtoffside.com".
- 항목 필드: `title`(모두 "🚨"로 시작) · `description`(평문 티저 23~97자) · `link` · `guid` · `pubDate`(GMT) · `dc:creator` · `content:encoded`(무료 글 본문 — 읽지 않음, FR-02) · `enclosure`(이미지). category 없음.
- **Romano 작성 글 0/20.** 작성자는 "Mark Brus"(단독 기사) 10건과 "the Daily Briefing"(아침 라운드업) 10건뿐이다. 사이트 메뉴의 섹션은 Ben Jacobs·Matteo Moretto·Christian Falk·Neil Jones 등이고 Romano 섹션은 메뉴에 없다 → author 필터로 Romano를 고를 수 없다.
- 예시 제목: "🚨 EXCL: Clubs lurking as Liverpool may soon have a big decision to make on £116m star..." · "🚨 Haaland future HINT, six new clubs chasing unsettled Arsenal star, …"
- 약관(확인 2026-10-10): 사이트 하단 Terms → Substack Terms of Use(Last Updated October 6, 2026) — https://substack.com/tos
  - Acceptable Use: "“Crawls,” “scrapes,” or “spiders” any page, data, or portion of Substack (through use of manual or automated means)" · "Copies or stores any significant portion of the content on Substack" 금지.
  - RSS 피드를 다른 웹사이트에 게재하는 것에 관한 조항: 찾지 못함. 발행물 자체 약관: 찾지 못함.
  - robots.txt `Content-Signal: … ai-input=yes`: Cloudflare Content Signals Policy의 정의로 ai-input은 "inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers)"(https://blog.cloudflare.com/content-signals-policy/). 우리 요약 입력에 가까운 용도에 대한 **허용 신호**이지만, 이용 선호 표시일 뿐 재게시 라이선스가 아니고, Substack 플랫폼 공통값으로 보이며(발행사가 따로 정한 값이라는 근거 없음), ToS의 수집 금지와 충돌한다.
- 판정: **불명확** — 요약은 신호(ai-input=yes)와 약관(수집 금지)·발행사의 다른 사이트 방침(AI 요약 금지, #2)이 충돌, 원제목 게재는 허용 근거가 없다. Romano 글도 거의 없다. → 제외 권고.

**2) Fabrizio Romano — CaughtOffside 작성자 페이지**
- 목록 페이지 `https://www.caughtoffside.com/author/fabrizio-romano/`(1회): WordPress, `<link rel="alternate">`로 **작성자 RSS** `…/author/fabrizio-romano/feed/`를 제공 → 목록 크롤링은 필요 없다.
- 작성자 피드: HTTP 200, 10건, 최신 **2026-09-11 15:00**, 가장 오래된 항목 2026-08-18 → 최근 한 달 동안 Romano 명의 글이 없다. 필드 `dc:creator`(=Fabrizio Romano) · `category`(Exclusives 등) · `description`(HTML 약 450자) · `content:encoded`(본문 — 읽지 않음) · `media:*`(이미지).
- 예시 제목: "Fabrizio Romano exclusive: Chelsea calm despite transfer rumours, new deal talks soon"
- 약관(확인 2026-10-10)
  - Rocket Sports Internet Terms of Service(Last Updated & Effective From 8th June 2026) — https://football-italia.net/terms-of-service/ (적용 대상에 caughtoffside.com·football-italia.net 등 20여 개 사이트). CaughtOffside의 `/terms-of-service/` 페이지는 본문이 비어 있다.
  - 같은 ToS: "Our Search Only Terms Contract … governs crawling, indexing, scraping and other automated or programmatic access to the Services and Content." 자동 접근은 "except where such activity is expressly permitted as Licensed Access under the Search Only Terms Contract"만 허용.
  - Search Only Terms Contract — https://m4ow.uk/socw/2.txt (robots.txt `# License` 줄이 가리킴)
    - Annex A "Non-Commercial Use": "For the avoidance of doubt, this does not include free or bundled software or any other technology that features Artificial Intelligence Systems summaries or other functionality."
    - Annex A "Search Indexing": "the Accessing Party must not alter the Website Content, this includes but is not limited to creating new titles, regenerating content or generating summaries of the Website Content"
    - 4.1.1: "All Website Content may not be reproduced, distributed, transmitted, displayed, altered, or used in any way … without prior written permission" · 4.6.2.1: "Any rendering of the Website Content outside of Search, or of the Website is an Unlicensed Access"
    - 4.3: 무허가 접근은 "a fee, of £500 being five hundred pounds sterling, per Product accessed" · 7.1: 검색 색인 외 목적의 수집·이용 금지
- 판정: **금지** — AI 요약은 명시적으로 금지되고, 원제목+링크 게재도 "검색 서비스" 밖의 표시라 허용되지 않는다. → 제외. 참고: 이번 M0 확인 요청(CaughtOffside 6건·Football Italia 4건·Football España 4건, 피드·robots·약관·목록 1회씩)도 이 계약이 말하는 "접근"에 해당할 수 있으므로 이후에는 접근하지 않는다.

**3) Gianluca Di Marzio**
- `https://gianlucadimarzio.com/en` → `www.` 리다이렉트 후 **404**("Pagina non trovata") — 영문 섹션은 폐지된 것으로 보인다. 사이트 메뉴도 이탈리아어뿐이다.
- 피드 `https://www.gianlucadimarzio.com/rss`(→ `/rss/`): HTTP 200, `application/rss+xml`, 10건(약 13시간치), 최신 2026-10-10 07:00 UTC. 필드 `title` · `description`(평문 약 170자) · `link` · `guid` · `pubDate`(+0200) · `category`(News Calcio 등) · `enclosure`(이미지). **author 없음**, `language` 없음(내용은 이탈리아어).
- 섹션 피드: `/rss/?section=5`(News Calcio)·`6`(Interviste e Storie)·`2`(Calciomercato로 보임)·`51`(Caffè Di Marzio)·`49`(Consapevolezze) — 섹션 대응은 안내 페이지 순서로 추정(미검증).
- 예시 제목: "Bologna, Miranda: \"Abbiamo la squadra per arrivare in alto. Tedesco? Gli auguro il meglio\""
- 약관(확인 2026-10-10): RSS 안내 — https://www.gianlucadimarzio.com/info_rss/ : "Il servizio è gratuito e non richiede nessuna registrazione per uso personale. Per eventuali utilizzi commerciali contattare la Redazione." · "I feed RSS … comprendono il titolo, il sommario e l'indirizzo internet (url) degli ultimi 20 articoli". 별도 이용약관·AI 조항: 찾지 못함(하단 링크는 Privacy·Cookie뿐). 운영 G.D.M. Comunication S.r.l.(TMW 플랫폼).
- 판정: **불명확** — 개인 이용(리더기 구독)만 명시하고, 비영리 공개 웹사이트 게재나 AI 요약은 허용도 금지도 적혀 있지 않다. 편집부(Redazione)에 허가를 요청할 수 있는 유일한 경로가 적혀 있다. → 제외 권고(허가를 받으면 재판정).

**4) Florian Plettenberg — Sky Sport Deutschland**
- `https://sport.sky.de/robots.txt` 404(규칙 없음). 홈·이적 페이지에 RSS `<link>` 없음, 외부 검색에서도 공식 RSS를 찾지 못함.
- 목록 후보 `https://sport.sky.de/transfer-news`(1회): 서버 렌더링 HTML에 기사 약 12건(제목·`/transfer/news/34132/<id>/<slug>` 링크·"Transfer/Exklusiv/Analyse" 라벨)만 있고 **발행 시각과 작성자가 없다**. `/transfer`(→`/transfers`)는 JS로 불러오는 라이브블로그다.
  - 크롤러로 만들면: 목록에서 제목·링크를 얻고 날짜는 기사별 OG(`article:published_time`) 요청이 필요 → 하루 1회·2~3초 간격이면 §6.4는 지킬 수 있지만 요청 수가 늘고, **Plettenberg 작성자 필터는 불가**(목록에 이름 없음). 난이도 중.
- 약관(확인 2026-10-10): `/agb`는 Sky Deutschland 유료 방송 계약 AGB(PDF) 링크뿐이고 웹 이용 약관은 없다. Impressum — https://sport.sky.de/impressum "Urheberrecht": "Alle Rechte, insbesondere das Recht zur Vervielfältigung, sind vorbehalten." · "Die Nutzung sämtlicher Daten zum Zwecke des Text und Data Mining im Sinne von § 44b UrhG und des Trainings von KI-Modellen ist untersagt."
- 판정: **금지** — TDM 목적 이용을 명시적으로 유보·금지하고 복제권을 유보했다. RSS도 없다. → 제외.

**5) Matteo Moretto — Relevo**
- 홈(1회)·`/futbol/mercado-fichajes/`(1회)에 RSS `<link>`는 없지만 WordPress 기본 경로 `https://www.relevo.com/feed/`가 작동: HTTP 200, 15건(모두 24시간 안), 스페인어, 전 종목(축구 10·NFL·모터사이클·테니스 등). 필드 `dc:creator` · `category` · `description`(HTML 약 280자) · `content:encoded`(본문 — 읽지 않음).
- **Moretto 기사 0건**(피드 작성자: Heath Chesters·Marcos Durán·Miguel Ruiz 등). Moretto의 Substack 프로필(`matteomoretto.substack.com/feed` → `substack.com/@matteomoretto`로 리다이렉트)은 the Daily Briefing만 표시하고, the Daily Briefing에 `/s/matteo-moretto` 섹션이 있다 → 현재 주 채널은 #1(the Daily Briefing)이다.
- 운영사: "la sociedad iGaming.com Group GmbH, con domicilio social en … Berlín"(이용 조건 서두).
- 약관(확인 2026-10-10): Condiciones de uso — https://www.relevo.com/condiciones-uso.html §7: "Queda prohibida la reproducción total o parcial, distribución, puesta a disposición, comunicación pública y utilización, total o parcial, de los contenidos de esta web, en cualquier forma o modalidad, sin previa, expresa y escrita autorización, incluyendo, en particular, su mera reproducción y/o puesta a disposición como resúmenes, reseñas o revistas de prensa con fines comerciales o directa o indirectamente lucrativos, a la que se manifiesta oposición expresa." · "quedando prohibida cualquier alteración o modificación de los contenidos". robots.txt 주석은 AI·LLM 크롤러 접근을 명시적으로 허용한다.
- 판정: **불명확** — 접근(robots)은 AI에 열려 있지만 이용 약관은 일부 복제(원제목 포함)와 수정을 서면 허가 없이 금지한다. 요약 반대 문구는 "상업·영리 목적"에 한정돼 비영리인 우리에게 직접 걸리지는 않지만, 그 앞의 일반 금지 조항이 남는다. Moretto 채널로서의 가치도 없다. → 제외 권고.

**6) Ben Jacobs — CBS Sports 등**
- CBS 작성자 페이지 `https://www.cbssports.com/writers/ben-jacobs/`(1회): 기사 15건, 최신 **2022-08-11** → CBS 기고는 사실상 끝났다.
- CBS 축구 RSS `https://www.cbssports.com/rss/headlines/soccer/`: HTTP 200, 36건, `dc:creator` 36/36(James Benge·Pardeep Cattry·Chuck Booth·Francesco Porzio·Sandra Herrera) — **Ben Jacobs 0건**. (CBS 축구 RSS 자체는 이번 대상이 아니라 약관을 조사하지 않았다. 일반 소스로 쓰려면 `/add-source`로 따로 확인.)
- 현재 기고처: CaughtOffside 칼럼니스트 목록과 the Daily Briefing `/s/ben-jacobs` 섹션(둘 다 Rocket 계열 — #1·#2 판정을 따름). 참고로 GiveMeSport(Valnet)도 확인했으나 robots.txt 주석이 "Use of any robot, crawler, or other tool to scrape, harvest, extract, or retrieve any content on this website using automated means is prohibited", 금지 용도 "(2) development or operation of artificial intelligence … including … retrieval-augmented generation"를 명시하고, 피드 10건에 Jacobs 글이 없었다.
- 판정: **채널 소멸** → 제외. 대체 채널도 모두 금지·불명확.

#### B. 리그 특화 2군 (basic_plan §3.3)

**7) Football Italia** — 피드 `https://football-italia.net/feed/`: HTTP 200, 20건(약 10시간치 — 하루 수십 건), en-GB, `dc:creator`(Peter Young·Lorenzo Bettoni) · `category`(Serie A·Azzurri·Transfer Market 등) · `description`(평문 약 100자) · `content:encoded`(본문). 예시: "Juric frustrated by Italy call-up for 20-year-old Kouadio: ‘A waste of time’". 약관: Rocket ToS의 적용 사이트 목록에 football-italia.net이 들어 있고, robots.txt도 같은 `License` 줄 → #2와 같은 Search Only Terms Contract. 판정 **금지** → 제외.

**8) Bundesliga.com 영문 뉴스** — 뉴스 RSS 없음(robots.txt의 `Sitemap:` 줄에 라이브티커 RSS `…/rss/en/rss-liveticker.rss`만 있음). 목록 `/en/bundesliga/news`(1회): 기사 링크 13개와 JSON `publishedAt`(UTC)이 있어 크롤러 난이도는 낮다. 그러나 robots.txt 주석과 약관이 막는다.
- robots.txt: "Pursuant to Section 44b (3) UrhG, the rights holder expressly reserves the right to reproduce the content available on this website for the purposes of text and data mining. Any automated programmes, applets, bots or similar technologies must not be used to access, analyse or download the content distributed under this domain or any subdomain."
- 이용약관 6.2 — https://www.bundesliga.com/en/bundesliga/info/terms-of-use-services · 법적 고지 2.2 — https://www.bundesliga.com/en/bundesliga/info/legal-notices : 같은 문구.
- 판정 **금지** → 제외. (AI 봇 UA를 robots에서 허용하는 것은 DFL과 개별 계약한 검색·AI 업체용으로 보인다.)

**9) Get German Football News** — `https://www.getgermanfootballnews.com`·`https://getgermanfootballnews.com`·`http://getgermanfootballnews.com` 모두 연결 거부(ECONNREFUSED, DNS는 85.233.160.215로 응답). 판정 **접속 불가** → 제외(사이트 상태는 M5 전에 다시 볼 수 있음).

**10) Marca English**
- 홈 `https://www.marca.com/en/`(1회)이 알리는 RSS `https://www.marca.com/en/rss/googlenews/portada.xml`과 RSS 목록 `/en/sports/rss/index.html`이 우리 UA에 **503**("En estos momentos el servicio no está disponible", 약 8분 뒤 재시도도 503). 웹 검색에 나오는 `https://e00-marca.uecdn.es/rss/en/index.xml`은 200이지만 최신 항목 **2026-04-28**에서 멈췄고, 31건 중 다수가 NFL·NCAAF·미국 연예 기사다.
- 약관(확인 2026-10-10): Terms of Service — https://www.marca.com/en/corporate/terms-of-service.shtml 3.4 "it is prohibited to modify, copy, reuse, extract, exploit, reproduce, communicate publicly, make second or subsequent publications, … all or part of the Content included in the Website without express written authorisation" · "INFORMACIÓN DEPORTIVA expressly opposes the possibility of reproduction of its pages being considered a quote in the terms provided in Article 32, 1st paragraph, point 2, of the Spanish Intellectual Property Act."
- 판정 **금지** → 제외(피드도 기술적으로 쓸 수 없음).

**11) Football España** — 피드 `https://www.football-espana.net/feed`: HTTP 200, 10건(3일치), en-GB, `dc:creator`·`category`·`description`(HTML 약 250자)·`content:encoded`. 예시: "Modrić leaves future Real Madrid role undecided". 사이트에 ToS 링크는 없고 robots.txt가 `# License https://m4ow.uk/socw/2.txt`를 가리킨다(편집장 Ruairidh Barlow는 CaughtOffside 칼럼니스트 목록에도 있음). 판정 **금지** → 제외.

**12) Get French Football News** — `https://www.getfootballnewsfrance.com/robots.txt`와 `/feed/` 모두 403 Cloudflare 챌린지("Just a moment...") → 우리 UA의 자동 접근을 막고 있어 robots·피드 모두 확인할 수 없다. 판정 **접속 불가** → 제외.

**13) UEFA.com 뉴스**
- `https://www.uefa.com/rss/uefachampionsleague/rss.xml`: HTTP 200, 50건(09-09~10-09), 7일 15건, 채널 "UEFA.com - UEFA Champions League - News", `category`는 모두 "Editorial", **author 없음**, `description` 평문 약 90자, 링크에 `?rss=…` 파라미터. 예시: "Matchday 2: Key stats on every game" · "League phase fixtures, results".
- `https://www.uefa.com/rss/insideuefa/rss.xml`: 50건, 7일 3건, 기관 소식(About UEFA·Media Releases).
- 약관(확인 2026-10-10): General Terms and Conditions — https://www.uefa.com/termsconditions/ 6.2 "Content provided by UEFA … may not be used, reproduced, distributed, transmitted, broadcast, displayed, sold, licensed or otherwise exploited for any other purposes than your personal access and viewing of the Content on the UEFA Platforms." · "you are prohibited from using automated tools, such as robots, spiders, or scripts, to scrape or collect Content and you must not use the Content to develop or train any software, model, algorithm, or AI tool". 6.9는 출처 표기 등 조건으로 링크를 허용. RSS 전용 약관: 찾지 못함.
- 판정 **금지** — 피드 표시·요약 모두 "개인 열람" 밖이고 자동 수집 금지 조항에 걸린다. → 제외. 공식 일정·결과·조추첨은 football-data.org(M0-28)로 얻는다.

#### C. 이적 집계 사이트 (basic_plan §3.5.2, Tier 3)

**14) CaughtOffside (사이트 전체)** — 피드 `https://www.caughtoffside.com/feed/`: HTTP 200, 10건(약 13시간치), en-US, `dc:creator`(Mark Brus·Saikat)·`category`·`description`(HTML 약 500자)·`content:encoded`. 예시: "Chelsea eye signing of 19-year-old whose value has shot up from €18m to €65m in a year". 약관은 #2와 같다. 판정 **금지** → 제외.

**15) Calciomercato.com 영문** — `https://www.calciomercato.com/en` **404**(영문판 폐지로 보임). 사이트 `<link>`가 가리키는 피드는 FootballCo의 `https://feeds.footballco.com/calcio/feed/g8r5n1czq4mw7v2k`(이탈리아어, 20건 약 3시간치, `dc:creator` 6/20)이고, 이 호스트의 robots.txt는 403. 약관 — https://www.calciomercato.com/about/condizioni-uso (FootballCo Media Terms of Use, Last updated: May 2026): "You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our site" · "Any \"robot\", \"bot\", \"spider\", \"scraper\" or other automated device … to access, obtain, copy, monitor or republish any portion of the site" · "an express reservation of our rights … for the purposes of Article 4(3) of Digital Copyright Directive". 판정 **금지** → 제외.

**16) TEAMtalk · 17) Football365** (둘 다 Planet Sport Ltd)
- RSS: `/feed` 404, 홈(1회씩)에 RSS `<link>` 없음. 홈 HTML에 기사 링크(TEAMtalk 57개·Football365 38개)와 `datetime` 속성이 있어 목록 크롤러 난이도는 낮다.
- 약관(확인 2026-10-10): https://www.teamtalk.com/terms-conditions · https://www.football365.com/terms-conditions — "Use of any content in automated systems, including bots, scrapers, or artificial intelligence technologies for indexing, training, analysis, or republication, is strictly prohibited without written authorisation from the Business." · §6 "Prohibition on Automated Access and AI Scraping: You may not use automated tools, bots, scripts, or software to access, extract, download, index, or analyse content … 3. Replicating content for use on other platforms or services."
- 판정 **금지** → 둘 다 제외.

**18) 90min** — `https://www.90min.com/feed`(홈 `<link>`가 가리킴)와 `/posts.rss` 모두 같은 내용으로 **2025-09-29에 멈춤**(90건). 홈 본문: "Looking For Fresh Football Coverage? We've Moved To Sports Illustrated". Minute Media T&C(Last updated August 24, 2026, https://www.minutegroup.com/policies/terms-and-conditions): 지식재산 권리 유보, AI·수집 조항 찾지 못함. 판정 **채널 소멸** → 제외. (후속 매체 Sports Illustrated FC는 별도 `/add-source` 대상.)

### 판정 요약

| 구분 | 개수 | 소스 |
|---|---|---|
| `summarize: true` 가능 | **0** | — |
| 원제목+링크만 | **0** | — |
| 제외 — 금지(명시) | 11 | CaughtOffside(Romano·전체) · Football Italia · Football España · Sky Sport DE · Bundesliga.com · UEFA.com · Marca English · Calciomercato.com · TEAMtalk · Football365 |
| 제외 — 불명확 | 3 | the Daily Briefing · Gianluca Di Marzio · Relevo |
| 제외 — 채널 소멸·접속 불가 | 4 | Ben Jacobs(CBS) · Get German Football News · Get French Football News · 90min |

- 근거 강도: **명시적 허용 0건.** "명시적 금지 없음 + RSS 게재 허용"(M0-23의 ESPN·NYT 유형)도 **0건**. AI 허용 신호는 기계 판독 신호 2건(the Daily Briefing `ai-input=yes`, Relevo robots 주석)뿐이고 둘 다 약관 본문과 충돌한다.
- 크롤링(`type: crawl`) 후보: Sky Sport DE(목록에 날짜·작성자 없음, OG 보충 필요 — 난이도 중), Bundesliga.com(`publishedAt` JSON — 하), TEAMtalk·Football365(`datetime` — 하). 넷 다 §6.4(하루 1회·2~3초 간격·목록과 OG만)는 기술적으로 지킬 수 있지만 **약관이 봇 접근 자체를 금지**해 만들지 않는다. CaughtOffside 작성자 페이지는 RSS가 있어 크롤링이 필요 없다.

### Source 권고값 (조사 시점 — 최종값은 "사용자 결정"의 등록 결과)

권고안 파일: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-24-sources-proposal.json` — 피드가 작동하는 8개를 **`enabled:false` · `summarize:false` · `terms_checked:false` 기록용**으로 제안한다(M0-23 Sky·Guardian 선례: 다시 조사하지 않게 하고, 허가를 받으면 바로 켤 수 있게 함). 각 `note`에 확인 날짜·판정·근거 URL·짧은 인용을 적었다.

| id | type | URL | lang | tier | weight | competitions | author | robots_checked | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| `daily-briefing` | journalist | thedailybriefing.io/feed | en | 2 | 1.5 | [] | — | true | 불명확 |
| `caughtoffside-romano` | journalist | caughtoffside.com/author/fabrizio-romano/feed/ | en | 1 | 2.5 | [] | Fabrizio Romano | true | 금지 |
| `caughtoffside` | aggregator | caughtoffside.com/feed/ | en | 3 | 1 | [] | — | true | 금지 |
| `di-marzio` | journalist | gianlucadimarzio.com/rss | it | 2 | 2 | [SERIEA] | — | true | 불명확 |
| `relevo` | rss | relevo.com/feed/ | es | 2 | 1 | [LALIGA] | — | true | 불명확 |
| `football-italia` | rss | football-italia.net/feed/ | en | 3 | 1.5 | [SERIEA] | — | true | 금지 |
| `football-espana` | rss | football-espana.net/feed | en | 3 | 1.5 | [LALIGA] | — | true | 금지 |
| `uefa-ucl-news` | rss | uefa.com/rss/uefachampionsleague/rss.xml | en | 1 | 1.5 | [UCL] | — | true | 금지 |

- 8개 모두 `enabled:false`, `summarize:false`, `terms_checked:false`.
- **등록하지 않을 것을 권고(문서 기록만)**: Sky Sport DE·Bundesliga.com·TEAMtalk·Football365(RSS 없음 + 봇 금지), Marca English(피드 503·정체), Calciomercato.com(영문판 없음), Ben Jacobs CBS(비활성), GGFN·GFFN(접속 불가), 90min(이전). URL이 없거나 작동하지 않는 소스를 넣으면 FR-11 건강도 이슈만 늘어난다.
- Tier는 basic_plan §3.8 기준: Romano 작성자 피드·UEFA 공식 = 1, Di Marzio·the Daily Briefing(Moretto·Jacobs·Falk 등 이적 기자 섹션)·Relevo = 2, CaughtOffside 전체·Football Italia·Football España(현지 보도 2차 인용 위주) = 3.
- **스키마 검증**(`node --import tsx`, `src/lib/schema/source.ts`): 권고안 `SourceSchema.array()` **통과(8개)**, 기존 `configs/sources.json` 8개와 합친 16개 `SourcesFileSchema` **통과**(id 중복 없음). 합친 뒤에도 수집 대상(`enabled && terms_checked`)은 6개, LLM 요약 대상은 0개로 그대로다.

### FR-20 재검토 입력 (M0-23 + M0-24 누적)

| 범위 | 채널 | AI 요약 가능 | 원제목+링크 | 제외 |
|---|---|---|---|---|
| M0-23 1군 영문 RSS | 8 | 0 | 6 (BBC 4·ESPN·The Athletic) | 2 |
| M0-24 2군·기자·집계 | 18 | 0 | 0 | 18 |
| 합계 | 26 | **0** | 6 | 20 |
| **결정 반영 후**(2026-10-10) | 26 | **0** | **9** (+ the Daily Briefing·Di Marzio·Relevo) | 17 |

- 관찰된 경향: 이번에 확인한 영국·독일·스페인 매체 약관 대부분에 **AI 이용·자동 수집 금지 조항이 들어 있다**(Rocket의 Search Only Terms Contract, DFL·Sky DE의 § 44b UrhG 유보, Planet Sport·FootballCo·Valnet의 AI 조항). "약관 확인 + 영문 RSS LLM 요약"이라는 FR-20의 기본 경로는 2군 매체로 넓혀도 열리지 않는다.
- 남은 판정: M0-25(국내 매체 — 원래 LLM 생략 대상), M0-26(Google News RSS), M0-27(GDELT DOC API). 이 셋은 "다른 매체 기사를 LLM에 넣는" 문제를 그대로 안고 있어 같은 기준이면 요약 가능 소스가 늘어날 가능성은 낮다.
- 허가 요청 경로가 적혀 있는 곳: Di Marzio(편집부 "contattare la Redazione"), Rocket(4.4 waiver·서면 합의), Relevo·Marca·UEFA·Planet Sport·FootballCo(서면 허가). 비영리·광고 없음·원문 링크라는 조건으로 요청할 수 있지만 회신은 보장되지 않는다.

### 사용자 확인 질문 — 2026-10-10 답변 완료

> 답변: 1 → (C) 원제목+링크로 켬(수용한 위험으로 note 명시) · 2 → (A) 기록용 등록 · 3 → (B) 지금 재정의(PRD §15 D23·D24). 자세한 내용은 위 "사용자 결정 (2026-10-10)".


1. **불명확 3개(the Daily Briefing·Di Marzio·Relevo) 처리**
   - (A) **제외(추천)** — `terms_checked:false`. 근거가 엇갈리면 끈다는 D22 기준과 같다.
   - (B) 제외한 뒤 Di Marzio 편집부(와 원하면 Relevo)에 비영리·원문 링크 조건으로 허가 요청 메일을 보내고, 회신을 받으면 재판정 — 비용 0, 시간이 걸리고 회신이 불확실하다.
   - (C) BBC처럼 사용자 해석으로 원제목+링크(`summarize:false`)로 켬 — Di Marzio는 "개인 이용" 문구, Relevo는 "일부 복제 금지" 조항과 정면으로 부딪혀 위험하다.
2. **`configs/sources.json` 기록 방식**
   - (A) **작동 피드 8개를 `enabled:false` 기록용으로 등록(추천)** — M0-23 Sky·Guardian 선례. 다시 조사하지 않게 하고, 허가를 받으면 바로 켤 수 있다.
   - (B) 문서에만 남기고 등록하지 않음 — `sources.json`이 수집 대상만 담아 단순해진다.
3. **FR-20 재검토 시점** (26개 채널 중 AI 요약 가능 0)
   - (A) **M0-25~27 판정을 마친 뒤 한 번에 재검토(추천)** — 국내 매체·Google News·GDELT 결과까지 보고 "원제목+링크 중심 + 코드 규칙 한국어 메타" 등 대안의 비용·품질을 함께 비교한다.
   - (B) 지금 바로 재검토 — M1 설계(요약 파이프라인 범위)와 D0 시안(원제목 카드 비중)을 일찍 확정할 수 있지만 국내·검색 소스 판정 전이라 다시 바뀔 수 있다.

## M0-25 국내 매체 RSS

> 상태: **✅ 완료 — 사용자 결정(2026-10-10) 반영.** `configs/sources.json`에 7개 등록(원제목+링크 3개 매체·피드 5 · 기록용 2 → 전체 23개). 아래 "핵심 결론"~"사용자 확인 질문"은 조사 시점 기록이고, 최종 결과는 "사용자 결정 (2026-10-10)"이 단일 출처다.

대상: plan M0-25의 필수 4개(인터풋볼·풋볼리스트·스포탈코리아·베스트일레븐)에 오케스트레이터가 고른 추가 후보 4개(연합뉴스·스포티비뉴스·엑스포츠뉴스·OSEN)를 더한 **8개 매체**.
판정 기준·용어는 M0-23·M0-24와 같다(문서 머리 표, PRD §15 D22). D23·D24에 따라 **국내 매체 카드도 LLM 요약을 하지 않으므로**, 쟁점은 ① 원제목+링크 게시 ② RSS 요약문(description)을 잘라 표시하는 것(PRD NFR-09 예외 조항) ③ 봇 수집, 이 세 가지다.
요청 범위: 2026-10-10 08:10~08:19 UTC(17:10~17:19 KST), 57건(200: 51 · 404: 6). 피드·robots.txt·RSS 안내·약관 페이지와, RSS·약관 링크를 찾기 위한 홈 페이지 1회씩(8건), 참고 기준 페이지 1건(경향신문 뉴스이용규칙, robots.txt 확인 후)을 요청했다. 기사 본문 요청 0건, 금지 사이트(네이버·다음 포함) 접근 0건, 같은 호스트 요청 간격 2~3초. 엑스포츠뉴스 약관(`/company/ajax_law`)은 robots.txt가 `/company/`를 막고 있어 **요청하지 않았다**.

### 핵심 결론 (먼저 읽기)
1. **RSS가 작동하는 곳은 5개**(인터풋볼·풋볼리스트·스포탈코리아·베스트일레븐·연합뉴스)다. 스포티비뉴스·엑스포츠뉴스·OSEN은 RSS를 찾지 못했다(홈 `<link>`·푸터에 없고 표준 경로도 404이거나 빈 응답).
2. **필수 4개는 같은 CMS(엔디소프트)의 표준 약관 문구를 쓴다.** 명시적 허용 조항은 없고 AI·봇·TDM 조항도 없다. 다만 각 매체의 **자사 RSS 안내가 "B사이트의 운영자는 A라는 사이트의 각종 정보(갱신된 글의 제목, 링크, 주요 내용 등)를 RSS파일을 통해 수집한 다음에 자신이 운영하는 B사이트에 올려놓을 수 있습니다"라고 안내**하고, 저작권보호정책은 "저작물"의 복제·전송을 승낙 없이 금지할 뿐이다. → 원제목+링크는 **조건부(해석)** 로 본다. ESPN·NYT 같은 명시적 허용보다는 약하고, BBC·Di Marzio처럼 사용자 결정으로 위험을 받아들인 경우보다는 근거가 낫다.
3. **RSS 요약문(description)을 잘라 표시할 수 있는 매체는 0개다.** 4개 매체의 description은 편집자가 쓴 요약이 아니라 **본문 첫 300자를 기계적으로 자른 것**이다(바이라인 포함, 문장 중간에서 끊김, 문단 사이 공백 사라짐). 그대로 보여 주면 본문 일부를 복제하는 것이고, 다듬으면 "변형"이 된다. 저작권보호정책 2조와 국내 언론계 기준(KONA 이용규칙: 여러 기사의 제목+본문 일부 표시 금지)에 모두 걸린다 → NFR-09 예외 조항을 쓸 매체가 없다.
4. **콘텐츠 가치는 인터풋볼 > 베스트일레븐 >> 풋볼리스트 순이다.** 인터풋볼 해외축구 피드는 제목의 50%(10/20)에 한국 선수가 나오고, 베스트일레븐 WORLD는 유럽 리그 19/20·한국 선수 5/20이다. 풋볼리스트 축구 피드는 K리그가 17/20이다. 스포탈코리아 피드는 머니투데이·뉴시스발 연예·사회 기사로 채워져 축구가 거의 없다. 연합뉴스는 저작권규약이 "비영리 목적의 정보서비스"를 명시적으로 금지한다.
5. **섹션 피드는 20건 고정이라 8.6~10.7시간치뿐이다.** 하루 1회(06:30 KST) 수집하면 하루 기사의 절반가량을 놓친다. 전체기사 피드(50건, 인터풋볼 24.8시간·베스트일레븐 50시간)는 섹션 피드 항목을 모두 포함하므로 함께 쓰면 하루를 덮는다(아래 질문 3).
6. **권고**: 원제목+링크로 켬 3개 매체(피드 5개: 인터풋볼 2·베스트일레븐 2·풋볼리스트 1), 판정 기록용 등록 2개(스포탈코리아 — 피드 부적합, 연합뉴스 — 금지), 미등록 3개(스포티비뉴스·엑스포츠뉴스·OSEN — 피드 없음). → 결정: 권고대로(아래 "사용자 결정").

### 사용자 결정 (2026-10-10)

| # | 항목 | 결정 | 반영 |
|---|---|---|---|
| 1 | 국내 전문지 3곳(인터풋볼·풋볼리스트·베스트일레븐) | **원제목+링크로 켬** — `enabled:true`, `summarize:false`, `terms_checked:true`. 명시적 허용 조항은 없고, 자사 RSS 안내(제3자 사이트 게재 안내)와 저작권보호정책의 금지 범위(저작물 복제·전송)를 근거로 한 **해석**이라는 점을 note에 명시 | `configs/sources.json` |
| 2 | 수집 창 | **섹션 피드 + 전체기사 피드 함께 등록** — 인터풋볼·베스트일레븐 각 2개. 섹션 피드 항목은 전체기사 피드에 모두 들어 있으므로 정규화 URL 해시로 중복 제거하고, 축구 외·K리그 기사는 M1 코드 필터로 뺀다. 풋볼리스트는 축구 피드 1개만(전체기사 피드는 K리그 `[포토]` 위주) | `configs/sources.json`, M1-02 |
| 3 | RSS 요약문(description) | **표시·저장하지 않음** (오케스트레이터 결정 — 약관 준수, D23과 일관). 국내 카드도 원제목+링크만. PRD NFR-09 예외와 FR-20 "RSS 요약 절단" 문구는 적용 매체가 없다(PRD 반영은 오케스트레이터) | `configs/sources.json` note, M1-02 |
| 4 | 스포탈코리아·연합뉴스 | **판정 기록용 비활성** — 스포탈코리아는 피드 부적합(`terms_checked:true`, `enabled:false`), 연합뉴스는 금지(`terms_checked:false`, M0-23 Sky·Guardian 선례) | `configs/sources.json` |

- 피드가 없는 3개(스포티비뉴스·엑스포츠뉴스·OSEN)는 등록하지 않고 이 문서에만 남긴다(M0-24 결정과 같은 원칙).

**등록 결과 — `configs/sources.json`** (7개 추가 → 23개, `npm run validate`·`npm run format:check` 통과, 수집 대상 `enabled && terms_checked` = 9 → 14개, LLM 요약 대상 0개)

| id | 피드 URL | type | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `interfootball-world` | www.interfootball.co.kr/rss/S1N1.xml | rss | ko | true | false | true | true | 3 | 1.5 | [] | 원제목+링크(해석 근거) |
| `interfootball-all` | www.interfootball.co.kr/rss/allArticle.xml | rss | ko | true | false | true | true | 3 | 1 | [] | 원제목+링크(수집 창 보강, M1 필터) |
| `footballist-football` | www.footballist.co.kr/rss/S1N1.xml | rss | ko | true | false | true | true | 3 | 0.5 | [] | 원제목+링크(K리그·`[포토]` 필터) |
| `besteleven-world` | www.besteleven.com/rss/S1N2.xml | rss | ko | true | false | true | true | 3 | 1 | [] | 원제목+링크(해석 근거) |
| `besteleven-all` | www.besteleven.com/rss/allArticle.xml | rss | ko | true | false | true | true | 3 | 0.5 | [] | 원제목+링크(수집 창 보강, M1 필터) |
| `sportalkorea-all` | www.sportalkorea.com/rss/allArticle.xml | rss | ko | false | false | true | true | 3 | 0.5 | [] | 판정 기록용 — 피드 부적합 |
| `yna-sports` | www.yna.co.kr/rss/sports.xml | rss | ko | false | false | false | true | 2 | 1 | [] | 판정 기록용 — 금지 |

- 켠 5개 피드의 공통 조건(각 `note`에 명시): 피드 제목 무수정(엔티티 디코딩·앞뒤 공백 정리만), 표시 링크는 피드 URL 원문 그대로(기사 식별자 `idxno` 쿼리 보존 — FR-04 정규화에서 지우지 않음, 풋볼리스트 `http://`는 해시용 정규화에서만 https로 통일), **description 표시·저장 안 함**, 출처 매체명 텍스트+링크(로고 없음), 중단 요청 시 즉시 끔. 엔디소프트 `pubDate`·`lastBuildDate`는 오프셋 없는 `YYYY-MM-DD HH:mm:ss`(KST로 해석해 UTC 저장). 섹션·전체 피드는 정규화 URL 해시로 중복 제거하고, 섹션 피드에도 있는 URL은 "해외축구" 확정 신호로 쓴다.
- 자세한 M1 처리 방법은 아래 "M1 구현 메모".

### 요약 표

| # | 매체 | RSS (권고 피드) | 상태 (항목 · 최신 KST · 창) | description | robots (우리 UA · AI 봇) | 약관 핵심 | 해외 / 한국 선수 비중 (제목 기준) | 판정 | 권고 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 인터풋볼 | `interfootball.co.kr/rss/S1N1.xml`(해외축구) + `/rss/allArticle.xml` | ✅ 20 · 10-10 16:05 · 10.7h / 전체 50 · 24.8h | 평문, 본문 첫 300자(바이라인 포함) | 허용 · 모두 허용 | 엔디소프트 공통: RSS 안내가 제3자 사이트 게재를 안내 / 저작권보호정책 2조: 승낙 없는 저작물 복제·전송 금지 / AI·봇 조항 없음 | 해외 섹션 20/20(유럽 구단·유럽 대표팀 중심) / 한국 선수 10/20(유럽파 7·손흥민 3) · 전체 피드 23/50 | **원제목+링크 가능(조건부)** | 켬 |
| 2 | 풋볼리스트 | `footballist.co.kr/rss/S1N1.xml`(축구) | ✅ 20 · 10-10 16:29 · 23.0h | 평문, 본문 앞 119~300자 | 허용 · 모두 허용 | 1과 같음 | 해외 2/20 · K리그 17/20 / 한국 선수(유럽파) 1/20 | **원제목+링크 가능(조건부)** | 켬(가중치 낮게, K리그 필터) |
| 3 | 스포탈코리아 | `sportalkorea.com/rss/allArticle.xml`(전체만, 축구 섹션 피드 404) | ⚠️ 50 · 10-10 12:46 · 0.8h, 4시간 넘게 갱신 없음 | 평문, 17~300자 | 허용 · GPTBot만 차단 | 1과 같음 | 축구 0~1/50(머니투데이·뉴시스발 연예·사회 위주) / 0 | 원제목+링크 가능(조건부) — **피드 부적합** | 기록용(비활성) |
| 4 | 베스트일레븐 | `besteleven.com/rss/S1N2.xml`(WORLD) + `/rss/allArticle.xml` | ✅ 20 · 10-10 15:51 · 8.6h / 전체 50 · 50.4h | 평문, 본문 첫 272~300자(바이라인 포함) | 허용 · 모두 허용 | 1과 같음 | 유럽 리그 19/20 / 한국 선수 5/20(모두 이강인) · 전체 피드 6/50 | **원제목+링크 가능(조건부)** | 켬 |
| 5 | 연합뉴스 | `yna.co.kr/rss/sports.xml`(스포츠 전체, 축구 피드 없음) | ✅ 120 · 10-10 17:07 · 55h | 평문, 83자에서 자름 | 허용 · AI 봇 30여 종 차단(ClaudeBot·anthropic-ai·GPTBot 포함) | RSS: "비상업적 블로그와 개인적인 용도로만" 허용 / 저작권규약 5: **"비영리 목적의 정보서비스를 할 수 없습니다"** / 채널 "AI 학습 및 활용 금지" | 해외축구 약 3/120 / 0 | **제외(금지)** | 기록용 |
| 6 | 스포티비뉴스 | 찾지 못함(`/rssIndex.html`·`/rss/allArticle.xml`·`/rss/S1N5.xml` 404) | — | — | 허용 · GPTBot 등 4종 차단 | 이용약관·저작권정책 페이지 없음. 푸터: "무단 전재와 복사, 배포 등을 금합니다" | (해외축구 섹션은 있음) | **제외(피드 없음)** | 미등록 |
| 7 | 엑스포츠뉴스 | 찾지 못함(`/rss`는 홈 HTML을 반환) | — | — | 허용 · 모두 허용. 단 약관 경로 `/company/`는 모든 UA Disallow | 약관 확인 불가(robots Disallow라 요청 안 함) | — | **제외(피드 없음)** | 미등록 |
| 8 | OSEN | 찾지 못함(`/rss`는 "OSEN RSS" 8바이트 빈 응답) | — | — | 허용 · 모두 허용 | 저작권 규약 4: 허가 없이 "인터넷 및 데이터 베이스를 비롯한 각종 정보서비스 등에 사용하는 것을 금지" | — | **제외(금지·피드 없음)** | 미등록 |

> 창 = 피드 항목의 가장 오래된 시각부터 최신 시각까지. 비중은 제목 키워드로 센 근사치다(유럽파 = 이강인·김민재·이영준 등 유럽 구단 소속 선수, 손흥민은 LAFC라 따로 셈). 요청 시각 17:10~17:19 KST(토요일 오후)의 한 시점 표본이라, 경기가 몰리는 주말 밤·월요일 오전에는 창이 더 짧아질 수 있다.

### robots.txt 매트릭스 (피드 경로 기준)

| 호스트 · 경로 | EuroDigestBot | GPTBot | ClaudeBot | Claude-User | CCBot | Google-Extended | anthropic-ai | PerplexityBot | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| www.interfootball.co.kr `/rss/S1N1.xml`·`/rss/allArticle.xml` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `*`는 `/admin/`만 막음. 파일 끝의 목록·포토 경로 Disallow는 문법상 마지막 그룹(`Google Search Console`)에 붙음 |
| www.footballist.co.kr `/rss/S1N1.xml` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `/admin/`만 막음 |
| www.besteleven.com `/rss/S1N2.xml`·`/rss/allArticle.xml` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | bingbot만 Crawl-delay 30 |
| www.sportalkorea.com `/rss/allArticle.xml` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | bingbot만 Crawl-delay 30 |
| www.yna.co.kr `/rss/sports.xml` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | AI 봇별 차단 목록에 날짜 주석(2023-10~2026-02) |
| www.spotvnews.co.kr `/` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Bytespider·Amazonbot·AhrefsBot도 차단 |
| www.xportsnews.com `/rss` · `/company/` | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | ✅ · ❌ | `/user/`·`/company/`는 모든 UA Disallow |
| www.osen.co.kr | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `Disallow:`(빈 값) |

- 판정 방법은 M0-23과 같다(RFC 9309 방식). 우리 UA는 어느 호스트에서도 별도 그룹이 없어 `*` 규칙을 따른다.
- cdn 호스트(`cdn.interfootball.co.kr`·`cdn.sportalkorea.com`·`cdn.besteleven.com`)의 robots.txt는 www와 같은 내용이다. `join.yna.co.kr`(연합뉴스 이용약관 호스트)은 `/robots.txt`에 SPA HTML을 돌려줘 규칙이 없다.

### 국내 참고 기준 — 한국온라인신문협회(KONA) 디지털뉴스 이용규칙

경향신문 게시본 — https://www.khan.co.kr/company/sub03_2.html (확인 2026-10-10)
- 일반원칙 3: "비영리적 목적의 일반 개인 네티즌이 한정적 범위에서 직접링크를 사용한다는 조건 하에 저작권자의 허락 없는 자유로운 직접링크를 허용합니다." · "직접링크는 기본적으로 일반 개인 사용자들을 제외한 법인, 기타 단체 사용자에게는 허용되지 않습니다."
- 직접링크 2: "이용자는 한개 또는 여러개의 기사를 그 URL이나 그 기사의 제목을 링크수단으로 하여 직접링크 방식으로 이용 할 수 있습니다."
- 직접링크 4: "이용자는 여러개의 기사를 그 URL 또는 그 기사의 제목과 해당 기사 본문의 일부를 함께 표시하는 방법으로 직접링크 할 수 없습니다."
- 직접링크 5: "기사 제목 등 기사의 콘텐츠를 아웃링크(Out Link)방식을 포함한 직접링크 등으로 노출, 공중송신하는 것은 저작권자인 언론사의 권리입니다."
- RSS: "RSS를 통해 구독하고 있는 뉴스 콘텐츠를 저작권자의 허락 없이 공중에 배포하거나 다시 재(再)RSS서비스를 하는 행위는 무단 복제, 무단 공중송신에 해당하므로 금지됩니다."
- 해석: 회원사는 국민·경향·조선·동아·매경·서울·세계·한국·전자·중앙·한겨레·한경 12곳이고 이번 8개 매체 중 회원사는 없다 → 직접 구속력은 없고 **국내 언론계의 보수적 기준**으로만 참고한다. 이 기준에서도 ① **제목+직접링크는 인정되는 이용 형태**다(비영리·개인·한정적 범위 조건, 우리는 비영리·개인 운영이지만 공개 사이트라 "한정적 범위"는 다툴 여지가 있다). ② **여러 기사의 제목+본문 일부 표시는 금지**다 → description 절단 표시는 국내 기준으로도 금지 쪽이다. ③ RSS 재배포 금지 문구는 엄격하지만, 필수 4개 매체는 자사 RSS 안내에서 반대 취지(제3자 사이트 게재)를 안내하므로 **결론은 각 매체의 자사 문서를 따른다**.
- 판례 참고(일반 해석, 이번에 판결문 원문은 확인하지 않음): 인터넷 링크는 저작권법상 복제·전송에 해당하지 않는다(대법원 2009. 11. 26. 선고 2008다77405). 짧은 제목은 창작성이 낮아 저작물로 보호되지 않는 경향이 있다.

### 매체별 상세

#### A. 필수 4개 — 엔디소프트 공통 약관

네 매체 모두 같은 CMS(엔디소프트 뉴스 시스템, `articleView.html?idxno=` 형식)를 쓰고, RSS 안내·저작권보호정책·이용약관 문구가 매체명과 담당자만 다르고 같다(확인 2026-10-10).
- **RSS 안내**(`/rssIndex.html`): "또, RSS파일을 이용해 사이트의 각종 정보를 수집할 수 있습니다. … (예를 들어 B사이트의 운영자는 A라는 사이트의 각종 정보(갱신된 글의 제목, 링크, 주요 내용 등)를 RSS파일을 통해 수집한 다음에 자신이 운영하는 B사이트에 올려놓을 수 있습니다. 이렇게 하면 B사이트 방문자는 A사이트를 방문하지 않더라도 A사이트의 최신 변환 내용을 쉽게 알 수 있습니다.)" — 이용 조건(비상업·출처 표기 등)은 적혀 있지 않다.
- **저작권보호정책**(`/com/copyright.html`) 1조: "회사의 서비스에서 제공되는 모든 콘텐츠(기사, 사진, 그래픽, 영상, 오디오, 첨부파일, DB정보 등)는 저작권법에 의하여 보호받는 저작물로써 … 원칙적으로 회사에 저작권이 있습니다." 2조: "서비스 내 모든 저작물은 회사의 승낙 없이 복제, 출판, 전송, 배포, 판매, 변형, 방송 등의 행위를 금지합니다." · "회사의 승낙을 받은 후 해당 저작물을 이용하는 경우에도 … 무단변경을 금지하며 반드시 출처를 표시해야 합니다."
- **이용약관**(`/com/service.html`, 회원 가입 계약 형식) 9조: "회원은 회사의 사전 승낙없이 서비스를 이용하여 어떠한 영리행위도 할 수 없습니다." 10조: 모든 저작물은 "사전 승낙 없이 복제, 출판, 전송, 배포, 방송 기타 방법에 의하여 이용하거나 제3자에게 이용하게 할 수 없으며".
- 봇·크롤링·TDM·AI·링크·제목 이용 조항: **4개 모두 찾지 못함.**
- 해석
  - ① **원제목+링크 — 조건부(해석).** 금지 대상은 "저작물"의 복제·전송·변형이다. 짧은 기사 제목은 저작물성이 낮다는 것이 일반 해석이고 링크는 복제·전송이 아니다. 여기에 자사 RSS 안내가 제3자 사이트 게재를 RSS 이용 방법으로 직접 안내한다. 명시적 라이선스 문구는 아니므로 "허용"이 아니라 "조건부(해석)"로 적는다. 조건: 제목 무수정, 링크는 피드 원문 그대로, 출처(매체명) 표기, 로고 미사용, 중단 요청 시 즉시 끔.
  - ② **요약문(절단) 표시 — 비권고.** description이 본문 첫 300자를 그대로 자른 것이다(예: "[인터풋볼=이태훈 기자] 빈첸초 몬텔라 감독이 결국 튀르키예 축구 국가대표팀에서 경질됐다.튀르키예축구협회(TFF)는…", 끝은 "…2002 한일"처럼 단어 중간에서 끊김). 그대로 보이면 본문 일부 복제(2조), 바이라인을 지우거나 문장 단위로 다듬으면 "변형"(2조)이고, KONA 직접링크 4항에도 걸린다. 또 `data/`는 공개 저장소에 커밋되므로 **description을 저장하는 것만으로도 공개 게시와 같다** → 저장도 하지 않는다.
  - ③ **봇 수집 — 허용(금지 조항 없음).** robots.txt가 피드 경로를 모든 UA에 열어 두고, 약관에 자동 수집 금지 조항이 없다. 하루 1회(질문 3의 C를 고르면 2회) 피드만 요청한다.

**1) 인터풋볼** — 운영 (주)인터풋볼, 저작권 담당 ask@interfootball.co.kr
- RSS 목록(`https://www.interfootball.co.kr/rssIndex.html`): 전체기사 `allArticle.xml` · 인기기사 `clickTop.xml` · 해외축구 `S1N1` · 국내축구 `S1N2` · 경기분석 `S1N4` · 피치&걸스 `S1N5` · Buzz뉴스 `S1N7` · 연예 `S1N8` · K Football `S1N9` · 인터라인업 `S1N10` (모두 `https://www.interfootball.co.kr/rss/<코드>.xml`). 홈 `<link rel="alternate">`가 가리키는 cdn `gns_*.xml`은 항목이 0건인 빈 채널이라 쓰지 않는다.
- 해외축구 `S1N1.xml`: HTTP 200, `application/xml`, RSS 2.0, 20건(05:25~16:05 KST, 10.7시간). 필드 `title`(CDATA 아님) · `link` · `description`(CDATA, 평문 299~300자) · `author`("이태훈 기자" 같은 이름 — 이메일 아님) · `pubDate`. category·guid 없음.
- 전체기사 `allArticle.xml`: 50건(10-09 15:55 ~ 10-10 16:45, 24.8시간), **해외축구 피드 20건을 모두 포함**. 국내축구·K리그 약 7/50, 이번 표본에 연예 기사는 없었지만 연예(S1N8)·피치&걸스 섹션이 섞일 수 있다.
- 시각 형식: `pubDate`·`lastBuildDate`가 **`2026-10-10 16:05:00`처럼 오프셋 없는 KST 문자열**(RFC 822 아님).
- 혼입: 대표팀(튀르키예 감독 경질·호날두 대표팀 이탈), 손흥민(LAFC, MLS) 관련 기사 3건(LAFC 감독 발언·과거 활약 조명·토트넘 후계자 근황), 스위스 리그(이영준·그라스호퍼).
- 예시 제목: "끊이지 않는 김민재 토트넘 이적설…이번엔 “이적 도미노 효과 생길 수도 있어, 자금 마련에 도움될 수도” 전망" · "“맨시티에서 3년 반이나 일했는데 양심에 거리낄 것 없나?”…재정 규정 위반 불똥 튄 아르테타, 단 한마디로 답했다 “그렇다”" · "[오피셜] 한국 축구 경사! 이강인, ATM 9월 이달의 선수 선정…“동료들 덕분이야” 소감"
- 판정: **원제목+링크 가능(조건부)**. 한국 선수 비중이 가장 높아(10/20) 한국어 보강 목적에 가장 맞는다.

**2) 풋볼리스트** — 운영 (주)퍼스트디비전, 저작권 담당 김정용(cohenwise@firstdivision.co.kr)
- RSS 목록(`https://www.footballist.co.kr/rssIndex.html`): 전체기사 · 인기기사 · 축구 `S1N1` · 야구 `S1N3` · 종합 `S1N4` · 정치/사회/경제/문화 `S1N5`. 해외축구 하위 섹션 피드(`/rss/S2N2.xml`)는 **404**.
- 축구 `S1N1.xml`: 20건(10-09 17:32 ~ 10-10 16:29, 23.0시간), description 119~300자(대부분 "[풋볼리스트=천안] 김진혁 기자= …"로 시작). **item 링크가 `http://`** 다(피드 자체는 https로 받음).
- 내용: K리그 17/20([케터뷰]·[케리뷰]·[포토] 연속 게시 다수), 해외 2/20, 유소년 1. 한국 선수(유럽파) 1/20. 전체기사 피드(50건)는 축구 피드 20건 외 30건도 모두 K리그 기사·`[포토]` 연속 게시였고, RSS 목록상 야구·종합·정치/사회 섹션도 섞일 수 있어 쓰지 않는다.
- 푸터의 "이용약관" 링크가 `/com/emailno.html`(이메일무단수집거부)로 잘못 연결돼 있다. 이용약관 본문은 `/com/service.html`에 있다.
- 예시 제목: "‘한국인 빅클럽 에이스’ 실존! 이강인, 아틀레티코 9월 이달의 선수 수상 후 거듭 “팀원 덕, 가족같은 분위기 덕” 겸손 가득한 소감!" · "“구단 100% 신뢰” 맨시티 감독, ‘1조 6천억 가짜 계약’ 유죄 판결에도 “항소에서 승리하면 다시 말하자”"
- 판정: **원제목+링크 가능(조건부)**. 해외축구 수확이 하루 2~3건뿐이라 가중치를 낮게 두고 K리그·[포토] 필터를 반드시 건다.

**3) 스포탈코리아** — 운영 (주)에스피앤코, 저작권 담당 한상현(hanz@sportalkorea.com)
- RSS 목록(`https://www.sportalkorea.com/rssIndex.html`): **전체기사·인기기사뿐**이다. 홈 메뉴의 섹션 코드(축구 `S1N1`, 해외축구 `S2N2`)로 만든 `/rss/S1N1.xml`·`/rss/S2N2.xml`은 **404**.
- 전체기사 `allArticle.xml`: 50건이 **12:00~12:46 KST(약 47분)** 에 몰려 있고, 요청 시각(17:14 KST) 기준 4시간 넘게 갱신되지 않았다(`lastBuildDate` 12:51). 작성자가 "(…@mt.co.kr)"·"(…@newsis.com)"인 머니투데이·뉴시스발 연예·사회 기사가 대부분이고 축구는 0~1건이다. idxno가 `2025052909553603165` 같은 날짜형이라 외부 기사 재게시로 보인다. 홈 `<link>`가 가리키는 cdn `gn_rss_allArticle.xml`도 내용이 같다(RFC 822 `+0900` 시각).
- 판정: 약관은 1과 같아 **원제목+링크 조건부 가능**이지만 **피드가 축구 소스로 쓸 수 없다** → 판정 기록용(`enabled:false`). 축구 섹션 피드가 생기면 다시 확인한다.

**4) 베스트일레븐** — 운영 (주)베스트일레븐, 저작권 담당 김관혁(coolman44@soccerbest11.co.kr)
- RSS 목록(`https://www.besteleven.com/rssIndex.html`): 전체기사 · 인기기사 · KOREA `S1N1` · WORLD `S1N2` · WORLD CUP `S1N6` · 국내 `S2N3` · 해외 `S2N4`. **해외 `S2N4`는 2026-07-23에 멈춰 있다**(20건 모두 7월 22~23일).
- WORLD `S1N2.xml`: 20건(07:17~15:51 KST, 8.6시간), description 272~300자("<베스트일레븐> 이창현 기자…"로 시작하는 본문 앞부분). 유럽 리그 19/20(나머지는 호날두·포르투갈 대표팀), 한국 선수 5/20(모두 이강인).
- 전체기사 `allArticle.xml`: 50건(10-08 14:13 ~ 10-10 16:35, 50.4시간), **WORLD 20건을 모두 포함**. K리그 약 3/50, 한국 선수 6/50.
- 예시 제목: "154경기 152골… 뮌헨, ‘괴력의 골잡이’ 케인과 재계약 자신 “협상은 매우 긍정적, 선수 의지 강해”" · "세슈코 정강이 부상, 수술대 오르나… 맨유 캐릭 감독 “선택지 살펴보는 중, 복귀 시점은 아직 불투명”"
- 판정: **원제목+링크 가능(조건부)**. 유럽 리그 비중이 가장 높다.

#### B. 추가 후보 4개

**5) 연합뉴스**
- RSS 안내 — https://www.yna.co.kr/rss/index : "연합뉴스는 비상업적 블로그와 개인적인 용도로만 연합뉴스 RSS 피드를 사용하는 것을 허용합니다. 연합뉴스의 사전 서면 허가 없이 RSS 서비스를 상업적으로 이용하는 것을 금지합니다." 분야별 피드 15개(최신·정치·…·스포츠·오피니언·사람들), **축구 전용 피드는 없다**.
- 스포츠 `sports.xml`: HTTP 200, 120건(10-08 09:47 ~ 10-10 17:07, 55시간), 전 종목(야구·배구·골프·농구 등), 해외축구 약 3/120(호날두·실바·사우샘프턴), 한국 선수 0. description은 83자에서 "…"로 자름(예: "(서울=연합뉴스) 이영호 기자 = 김효주가…"). 채널 `copyright`: "저작권자(c) 연합뉴스, 무단 전재-재배포, AI 학습 및 활용 금지".
- 저작권규약 — https://www.yna.co.kr/policy/copyright : "연합뉴스의 사전 허가 없이 연합뉴스 정보를 출판, 방송, 복사, 저장, 배포, 전송, 전시, 판매, 왜곡, 변조, 개작하는 행위는 금지돼 있습니다." · 2 "인공지능(AI)의 학습이나 인공지능 서비스에 사용하는 등 허가된 목적 이외에 연합뉴스 정보를 이용할 수 없습니다"(계약 사용자 대상) · 4 "사전 서면 허가 없이 연합뉴스 정보를 전자장치를 이용하여 저장 또는 배포할 수 없습니다." · 5 "사전 서면 허가 없이 연합뉴스 자료를 이용해 영리 목적의 정보 재판매 서비스나 **비영리 목적의 정보서비스**를 할 수 없습니다." 문의처에 "AI 학습 및 사용 문의 : 디지털사업부"가 따로 있다.
- AI 활용 준칙 — https://www.yna.co.kr/policy/ai-usage-guidelines : 연합뉴스 기자·편집자의 내부 준칙(외부 이용자 조항 아님).
- 이용약관(`join.yna.co.kr/ko/policy/terms`): JS로 그리는 페이지라 본문을 확인하지 못함.
- 판정: **금지** — RSS 안내의 "비상업적 블로그" 허용과 저작권규약 5의 "비영리 목적의 정보서비스" 금지가 엇갈리는데, 매일 여러 매체를 모아 보여 주는 우리 서비스는 후자에 정면으로 해당한다. 해외축구 비중도 낮다 → 제외, 판정 기록용 등록(M0-24 결정 2 선례). 허가 문의처: 콘텐츠사업부(RSS 안내)·디지털사업부(제휴).

**6) 스포티비뉴스** — 운영 ㈜뉴스플레이어
- 홈에 RSS `<link>`·푸터 링크 없음. 목록 URL은 엔디소프트형(`articleList.html?sc_section_code=S1N5` 해외축구)인데 `/rssIndex.html`·`/rss/allArticle.xml`·`/rss/S1N5.xml`이 모두 **404**(JSON 응답) → RSS를 제공하지 않는 것으로 본다.
- 약관: 푸터에 회사소개·고객센터·개인정보처리방침·이메일무단수집거부·청소년보호정책만 있고 이용약관·저작권정책은 **찾지 못함**. 푸터 문구: "SPOTV NEWS 모든 콘텐츠(영상,기사, 사진)는 저작권법의 보호를 받는 바, 무단 전재와 복사, 배포 등을 금합니다."
- 판정: **제외(피드 없음)** — 등록하지 않는다. 목록 크롤링은 약관 근거가 없어 검토하지 않았다.

**7) 엑스포츠뉴스** — 운영 (주)엑스포츠미디어
- 홈에 RSS `<link>` 없음. `https://www.xportsnews.com/rss`는 RSS가 아니라 홈과 같은 HTML(200)을 돌려준다 → RSS를 찾지 못함.
- 약관: 푸터 "이용약관"은 `/company/ajax_law`를 불러오는 팝업인데, robots.txt가 모든 UA에 `Disallow: /company/`라 **요청하지 않았다** → 확인 불가.
- 판정: **제외(피드 없음)** — 등록하지 않는다.

**8) OSEN**
- 홈에 RSS `<link>` 없음. `https://www.osen.co.kr/rss`는 본문이 "OSEN RSS" 8바이트뿐인 빈 응답 → RSS를 찾지 못함.
- 저작권 규약 — https://www.osen.co.kr/pages/copyright : 1 "본 서비스를 통해 제공받은 기사는 전자매체로 복사, 재사용을 위한 저장은 허가되지 않습니다." · 2 "계약에 의거하지 않은 본 서비스 결과물은 참조나 교육적 목적 등 비영리적 사용을 원칙으로 합니다." · 4 "허가없이 전재, 변조, 복사, 양도, 배포, 출판, 전시, 판매하거나 상품제작, 인터넷 및 데이터 베이스를 비롯한 각종 정보서비스 등에 사용하는 것을 금지합니다."
- 판정: **제외(금지·피드 없음)** — 등록하지 않는다.

### 판정 요약

| 구분 | 개수 | 매체 |
|---|---|---|
| 원제목+요약문(절단) 가능 | **0** | — (NFR-09 예외를 쓸 매체 없음) |
| 원제목+링크 가능(조건부) | **4** | 인터풋볼 · 풋볼리스트 · 베스트일레븐 · 스포탈코리아(약관상 가능, 피드 부적합으로 비활성) |
| 제외 — 금지(명시) | 2 | 연합뉴스(저작권규약 5) · OSEN(저작권 규약 4, 피드도 없음) |
| 제외 — 피드 없음 | 2 | 스포티비뉴스 · 엑스포츠뉴스 |

- 근거 강도: **명시적 허용 0건.** "자사 RSS 안내가 제3자 사이트 게재를 안내 + 금지 조항은 저작물 복제·전송 일반 금지"(필수 4개)가 이번에 찾은 가장 강한 근거다. AI·봇·TDM 조항은 필수 4개에 없고, 연합뉴스·OSEN은 정보서비스 이용 자체를 막는다.
- **봇 수집**: 필수 4개는 robots.txt·약관 모두 피드 수집을 막지 않는다. 연합뉴스는 우리 UA를 허용하지만 AI 봇을 대거 차단하고, 약관이 전자 저장·배포를 막는다.

### Source 권고값 (조사 시점 — 최종값은 "사용자 결정 (2026-10-10)"의 등록 결과)

권고안 파일: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-25-sources-proposal.json` — 7개. 각 `note`에 확인 날짜·근거 URL·짧은 인용·지킬 조건·피드 특성을 적었다.

| id | 피드 URL | type | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `interfootball-world` | www.interfootball.co.kr/rss/S1N1.xml | rss | ko | true | false | true | true | 3 | 1.5 | [] | 원제목+링크 |
| `interfootball-all` | www.interfootball.co.kr/rss/allArticle.xml | rss | ko | true | false | true | true | 3 | 1 | [] | 원제목+링크(수집 창 보강 — 질문 3, 필터 필수) |
| `footballist-football` | www.footballist.co.kr/rss/S1N1.xml | rss | ko | true | false | true | true | 3 | 0.5 | [] | 원제목+링크(K리그·[포토] 필터 필수) |
| `besteleven-world` | www.besteleven.com/rss/S1N2.xml | rss | ko | true | false | true | true | 3 | 1 | [] | 원제목+링크 |
| `besteleven-all` | www.besteleven.com/rss/allArticle.xml | rss | ko | true | false | true | true | 3 | 0.5 | [] | 원제목+링크(수집 창 보강 — 질문 3, 필터 필수) |
| `sportalkorea-all` | www.sportalkorea.com/rss/allArticle.xml | rss | ko | false | false | true | true | 3 | 0.5 | [] | 판정 기록용 — 피드 부적합 |
| `yna-sports` | www.yna.co.kr/rss/sports.xml | rss | ko | false | false | false | true | 2 | 1 | [] | 판정 기록용 — 금지 |

- Tier(basic_plan §3.8): 국내 전문지의 해외 소식은 대부분 해외 보도를 옮긴 2차 인용이라 3, 통신사인 연합뉴스는 2.
- weight: 해외·한국 선수 비중 기준 초기값(인터풋볼 해외 1.5 > 베스트일레븐 WORLD·인터풋볼 전체 1 > 베스트일레븐 전체·풋볼리스트 0.5). M1 첫 주 관찰 후 조정.
- `sportalkorea-all`은 약관 판정이 1과 같아 `terms_checked:true`로 두고 `enabled:false`로 끈다(이유는 피드 품질). `yna-sports`는 M0-23 Sky·Guardian 선례대로 `terms_checked:false`.
- 질문 3에서 (B)·(C)를 고르면 `interfootball-all`·`besteleven-all`을 빼거나 `enabled:false`로 바꾼다.
- 스포티비뉴스·엑스포츠뉴스·OSEN은 피드가 없어 등록하지 않는다(M0-24 결정과 같은 원칙).
- **스키마 검증**(`node --import tsx`, `src/lib/schema/source.ts`): 권고안 `SourceSchema.array()` **통과(7개)**, 기존 `configs/sources.json` 16개와 합친 23개 `SourcesFileSchema` **통과**(id 중복 없음). 합치면 수집 대상(`enabled && terms_checked`)은 9개 → 14개, LLM 요약 대상은 0개 그대로다.

### M1 구현 메모 (M1-02 로더·수집·정제 단계)
- **시각(`src/lib/time.ts`)**: 엔디소프트 피드의 `pubDate`·`lastBuildDate`는 `YYYY-MM-DD HH:mm:ss`(오프셋 없음, KST)다. rss-parser의 `isoDate`는 실행 환경 시간대로 해석하므로 **CI(UTC)에서 9시간 어긋난다** → 이 형식은 KST(+09:00)로 직접 파싱해 UTC ISO로 저장하고, 서머타임 테스트처럼 고정 케이스 테스트를 둔다. 연합뉴스·cdn `gn_*` 피드는 RFC 822 `+0900`.
- **링크·중복**: 기사 식별자가 쿼리 `idxno`라 FR-04 정규화에서 쿼리를 통째로 지우면 안 된다(추적 파라미터만 제거). 풋볼리스트 item 링크는 `http://` → 해시용 정규화에서만 https로 맞추고 표시 링크는 원문 그대로. 섹션 피드 ⊂ 전체기사 피드(인터풋볼·베스트일레븐 모두 20/20)라 같은 URL이 두 소스에서 들어온다 → URL 해시로 합치고, 섹션 피드에도 있는 URL은 "해외축구 확정" 신호로 쓴다.
- **필터(코드 규칙)**: K리그·국내축구(구단명, `[케터뷰]`·`[케리뷰]`), `[포토]`, 연예·걸스·야구 등 축구 외 섹션은 제외. 대표팀 기사·손흥민(LAFC, MLS) 기사·스위스 등 5대 리그 밖 유럽파 기사의 포함 여부는 한국 선수·A매치 범위(M3)와 함께 정한다.
- **description**: 표시·저장하지 않는다(사용자 결정 3). 한국 선수·카테고리 판정에 쓰더라도 메모리 안에서만 쓰고 `data/`에 남기지 않는다(`data/`는 공개 저장소).
- **제목**: 최대 80자(D15 원제목 상한 200자 안), 따옴표·"…"·"→"·"韓"·"西" 같은 약어와 `[오피셜]` 말머리를 그대로 둔다(엔티티 디코딩·앞뒤 공백 정리만). 원제목 카드 정책(D22·D23)과 같다.
- **출처 표기**: 카드 출처명은 매체명 — "인터풋볼"·"풋볼리스트"·"베스트일레븐"(`Source.name`의 " — 섹션" 부분은 화면에 쓰지 않음). 로고 미사용.
- **건강도(FR-11)**: 섹션 피드는 20건 고정이라 "3일 연속 0건"은 거의 나지 않지만, 베스트일레븐 '해외' 피드처럼 **피드가 멈춘 채 같은 항목을 계속 돌려줄 수 있다** → 최신 항목 시각이 오래되면 정체로 보는 규칙을 함께 둔다.
- **D0 영향**: 한국어 원제목 카드(따옴표·말줄임표가 많은 60~80자 제목)를 시안 예시에 넣는다.

### 사용자 확인 질문 — 2026-10-10 답변 완료

> 답변: 1 → (A) 원제목+링크로 켬(note에 해석 근거 명시) · 2 → (A) 표시·저장하지 않음(오케스트레이터 결정 — 약관 준수, D23과 일관) · 3 → (A) 섹션+전체기사 피드 함께 등록(축구 외 기사는 M1 코드 필터). 자세한 내용은 위 "사용자 결정 (2026-10-10)".


1. **국내 전문지 3곳(인터풋볼·풋볼리스트·베스트일레븐) 원제목+링크 등록**
   - (A) **원제목+링크로 켬(추천)** — `terms_checked:true`, note에 "자사 RSS 안내 해석 — 명시적 허용 아님"을 적는다. 근거는 ESPN·NYT(명시적 허용)보다 약하고 BBC·Di Marzio(사용자가 위험을 받아들임)보다 낫다. 중단 요청이 오면 즉시 끈다.
   - (B) A로 켜고, 연락용 이메일(CLAUDE §13 미결)이 생기면 각 매체 저작권 담당자에게 비영리·원제목+링크 이용을 알리는 메일을 보낸다 — 비용 0, 위험을 더 줄인다.
   - (C) 허락 회신을 받은 매체만 켬 — 가장 안전하지만 회신이 오지 않으면 한국어 소스가 0이 된다(M0-26 Google News 판정에 의존).
2. **RSS 요약문(description) 표시 — PRD NFR-09 예외 조항**
   - (A) **표시·저장하지 않음 — 국내 카드도 원제목+링크만(추천).** NFR-09의 "한국어 소스는 약관 확인 후 RSS가 제공하는 요약문을 잘라 표시" 예외와 FR-20의 "RSS 요약 절단" 문구를 "M0-25 판정: 적용 매체 없음"으로 갱신한다. 해외 원제목 카드와 형식이 같아져 D0 시안도 단순해진다.
   - (B) 첫 문장만 잘라 표시(바이라인 제거) — 가공 자체가 "변형"(저작권보호정책 2조)이고, 여러 기사의 제목+본문 일부 표시는 KONA 이용규칙 4항에도 걸린다.
   - (C) 300자 그대로 절단 표시 — 바이라인·단어 중간 절단이 그대로 보이고 본문 복제 위험이 가장 크다.
3. **수집 창 — 섹션 피드 20건 = 8.6~10.7시간치**
   - (A) **섹션 피드 + 전체기사 피드를 함께 등록(추천)** — 인터풋볼·베스트일레븐 각 2개(권고안 그대로). 하루 요청 +2건, 코드 필터가 필요하다(전체 피드의 K리그·연예 등).
   - (B) 섹션 피드만 — 가장 단순하지만 하루 기사의 절반가량을 놓친다.
   - (C) 섹션 피드만 + 하루 2회 수집(예: 18:30 KST 보조 실행에서 RSS 원자료만 `data/cache/`에 쌓고 06:30 실행이 합침) — 누락이 가장 적지만 `collect.yml`·캐시 구조를 바꿔야 한다.

## M0-26 Google News RSS

> 상태: **✅ 완료 — 사용자 결정(2026-10-10) 반영.** 판정 금지(사용 불가), plan §14 B2 발동. `configs/sources.json`에 판정 기록용 2개 등록(→ 25개), 검색 결과 매체 도메인 허용 목록 `configs/publisher-domains.json`과 스키마를 새로 만들었다. `configs/search-queries.json`은 M0-27에서 만든다. 아래 "핵심 결론"~"사용자 확인 질문"은 조사 시점 기록이고, 최종 결과는 "사용자 결정 (2026-10-10)"이 단일 출처다.

대상: basic_plan §3.4·§3.6의 Google News RSS 검색(`https://news.google.com/rss/search?q=…&hl=…&gl=…&ceid=…`). 한국어 2종·영어 3종 쿼리 테스트, 이용 조건 확인, 하루 쿼리 상한 결정이 과제다.
판정 기준·용어는 M0-23~M0-25와 같다(문서 머리 표, PRD §15 D22~D24). 검색 결과에는 여러 매체의 기사가 섞여 나오므로 Google의 조건과 함께 **결과 매체의 약관이 따라오는지(상속)**도 봤다.
요청 범위: 2026-10-10 08:34~08:37 UTC(17:34~17:37 KST)에 직접 요청 5건을 보냈다. news.google.com robots.txt 1, policies.google.com robots.txt 1(404), support.google.com robots.txt 1, Google 서비스 약관 1, 서비스별 추가 약관 목록 1이다. **news.google.com의 `/rss/`·`/articles/` 경로 요청은 0건이다.** 보조 조사로 웹 검색 5회, 제3자 안내 문서 3건(WebFetch), GitHub 공개 저장소에 커밋된 Google News 피드 수집본 2건(`gh api`)을 확인했다. 금지 사이트 접근은 0건이다.

### 핵심 결론 (먼저 읽기)
1. **쿼리 5종 실측은 하지 않았다.** news.google.com robots.txt는 `User-agent: *`에 `Disallow: /`를 걸었고, 허용 목록(`/topics/`·`/stories/`·`/publications/`·`/about` 등)에 `/rss/`가 없다. ClaudeBot·anthropic-ai·GPTBot 같은 AI 봇은 별도 그룹으로 전면 차단한다. Google 서비스 약관은 robots.txt를 어기는 자동 접근을 금지하므로, 우리 봇 UA로 피드를 받는 것부터 약관 위반이 된다. M0-25 선례(엑스포츠뉴스 `/company/`는 robots Disallow라 요청하지 않음)와 CLAUDE §6.4에 따라 요청을 보내지 않았다. 판정은 실측 수치와 상관없이 정해진다(아래 4).
2. **피드 스스로 공개 게시를 금지한다.** Google News RSS 채널의 `<copyright>`는 "personal feed reader for personal, non-commercial use"만 허용하고 "Any other use of the feed is expressly prohibited"라고 적었다. 공개 수집본 두 건(2025-01 토픽 피드, 2026-06 검색 피드)에서 같은 문구를 확인했다. 비영리여도 공개 웹사이트는 "개인 피드 리더"가 아니다. 결과를 게시하지 않고 내부 신호(기사 발견·클러스터 점수)로만 쓰는 것도 "using these results in any manner whatsoever"에 걸린다.
3. **링크만으로는 원문 URL을 알 수 없다.** item `link`는 `news.google.com/rss/articles/<불투명 토큰>?oc=5` 형태의 리다이렉트이고, 2024년 형식 변경 뒤로는 토큰을 오프라인으로 풀 수 없다. 디코딩하려면 robots가 막은 경로(`/rss/articles/`·`/_/…/batchexecute`)를 기사마다 호출해야 한다. 따라서 원문 URL 해시로 만드는 카드 ID와 FR-04 중복 제거를 설계대로 쓸 수 없다.
4. **판정: 금지(사용 불가).** 근거는 세 겹이다. 피드 고지의 명시적 금지, robots.txt 불허, 서비스 약관의 자동 접근·타사 콘텐츠 조항. 근거가 엇갈렸던 BBC·Di Marzio("불명확")와 달리 세 근거가 모두 같은 방향이라, 사용자 결정으로 위험을 받아들일 사안도 아니다. → **plan §14 B2가 일어났다.** Google News RSS 대신 GDELT(M0-27)와 국내 매체 RSS(M0-25에서 켠 5개 피드)를 쓴다.
5. **매체 약관 상속 문제는 GDELT에서도 똑같이 생긴다.** 검색 결과에는 M0-23~25에서 금지·불명확으로 판정한 매체가 섞인다. 검색형 소스에는 매체 도메인 허용 목록(allowlist)이 필요하고, 이 규칙은 M0-27 판정 전에 정해 두기를 권고한다(아래 "사용자 확인 질문" 2).

### 사용자 결정 (2026-10-10)

| # | 항목 | 결정 | 반영 |
|---|---|---|---|
| 1 | Google News RSS | **금지 판정 수용 · 판정 기록용 등록 · 실측 없이 마감.** `google-news-ko`·`google-news-en`을 `enabled`·`summarize`·`terms_checked`·`robots_checked` 모두 `false`로 등록한다. **plan §14 B2 발동** — 뉴스 검색은 GDELT(M0-27) + 국내 매체 RSS(M0-25)로 대체 | `configs/sources.json` |
| 2 | 검색형 소스의 매체 약관 상속 | **별도 도메인 허용 목록 `configs/publisher-domains.json` — 목록에 없는 도메인은 기본 차단.** 새 스키마 승인 | `src/lib/schema/publisher.ts`·`registry.ts`, `scripts/lib/validate-crossref.ts`, `fixtures/schema/configs/publisher-domains.json`, 테스트, `configs/publisher-domains.json` |
| 3 | `configs/search-queries.json` | **지금 만들지 않는다.** M0-27(GDELT)에서 쿼리와 함께 만들고 `maxEnabled`도 그때 정한다(조사 시점 권고는 20 잠정) | — |

**스키마 요지** — `PublisherDomainsFileSchema = { domains: PublisherDomain[] }` (configs라 strictObject, 도메인 중복 금지)
- `domain`: 소문자 호스트 이름(스킴·포트·경로·끝 점·`www.` 없음). 호스트가 domain과 같거나 `"." + domain`으로 끝나면 매칭(하위 도메인 포함)하고, 여러 항목이 맞으면 가장 긴 domain이 이긴다. 경로 단위 구분은 하지 않는다.
- `status`: `allow`(검색 결과로도 원제목+링크 게시) · `feed-only`(자기 피드로만 — `sourceIds` 1개 이상 필수) · `deny`(어떤 경로로도 게시 안 함). 목록 밖은 판정이 아니라 기본 차단이다.
- 그 밖의 필드: `publisher` · `sourceIds`(기본 `[]`) · `basis` · `basisUrl`(필수) · `checkedAt`(YYYY-MM-DD) · `note?`.
- 판정 함수: `findPublisherDomain(host, domains)`·`isSearchResultAllowed(host, domains)` — `allow`만 true, 목록 밖은 false. M1-07 GDELT 어댑터가 쓴다.
- 교차 참조(`npm run validate` 4번 검사): ① `sourceIds`가 sources.json에 있는지 ② 판정이 소스의 약관 확인과 맞는지(`allow`·`feed-only` → `terms_checked:true`, `deny` → `terms_checked:false`) ③ 수집 대상 소스(`enabled && terms_checked`)의 피드 호스트가 `deny` 도메인에 속하지 않는지.
- 오케스트레이터 초안에서 조정한 점: `basisUrl`을 필수로 추가(configs 공통 원칙 "근거 URL을 남긴다"), `feed-only`는 근거 피드 소스가 있어야 한다는 규칙, 교차 참조 ②·③ 추가(두 파일의 판정이 엇갈리지 않게 하는 이중 잠금).

**등록 결과 — `configs/publisher-domains.json`** (27개 도메인, `npm run validate` 통과 — 교차 참조 오류 0건)

| status | 개수 | 도메인 |
|---|---|---|
| allow | 4 | interfootball.co.kr · footballist.co.kr · besteleven.com · sportalkorea.com |
| feed-only | 7 | bbc.co.uk · bbc.com · espn.com · nytimes.com · thedailybriefing.io · gianlucadimarzio.com · relevo.com |
| deny | 16 | theguardian.com · skysports.com · sport.sky.de · caughtoffside.com · football-italia.net · football-espana.net · uefa.com · bundesliga.com · marca.com · calciomercato.com · teamtalk.com · football365.com · givemesport.com · yna.co.kr · osen.co.kr · news.google.com |

- 각 항목의 `basis`에 조사 항목 ID(M0-23~26)·조항 요지·결정을, `basisUrl`에 대표 근거 URL을 적었다.
- BBC는 기사 도메인 2개(bbc.co.uk·bbc.com)를 같은 판정으로 둔다. 피드 호스트 feeds.bbci.co.uk는 기사 도메인이 아니라 넣지 않았다.
- nytimes.com은 도메인 단위라 NYT 전체가 `feed-only`다(RSS 조건이 NYT 전체에 같다).
- givemesport.com은 M0-24 참고 조사(robots.txt 주석)만으로 넣었다(note에 명시).
- 판정하지 않았거나 판정할 수 없던 곳(CBS Sports·90min·스포티비뉴스·엑스포츠뉴스·Get German/French Football News 등)은 넣지 않았다 → 기본 차단.

**등록 결과 — `configs/sources.json`** (2개 추가 → 25개, `npm run validate` 통과, 수집 대상 `enabled && terms_checked` 14개·LLM 요약 대상 0개 그대로)

| id | url | type | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|
| `google-news-ko` | news.google.com/rss/search | search | ko | false | false | false | false | 3 | 1 | 판정 기록용 — 금지 |
| `google-news-en` | news.google.com/rss/search | search | en | false | false | false | false | 3 | 1 | 판정 기록용 — 금지 |

- 각 `note`에 판정·근거 3가지(피드 고지·robots.txt·Google 약관)·링크 구조·B2 발동을 적었다.
- 테스트: `tests/schema/publisher.test.ts`(신규 — 도메인 형식·하위 도메인 매칭·가장 긴 항목 우선·기본 차단), `tests/validate-crossref.test.ts`(4번 검사), `tests/validate.test.ts`·`tests/schema/registry.test.ts`(개수 갱신).

### 쿼리별 결과 표

설계한 5종과 상태를 적는다. 최근 24시간 연산자(`when:1d`)는 붙이지 않고 테스트할 계획이었다.

| # | 쿼리 `q` | hl · gl · ceid | 목적(purpose) | 상태 | 항목 수·최신/오래된 시각·매체 분포·중복·적합도 |
|---|---|---|---|---|---|
| 1 | `이강인` | ko · KR · KR:ko | korean | **요청 안 함** — robots.txt Disallow | 측정 안 함 |
| 2 | `프리미어리그` | ko · KR · KR:ko | general | 요청 안 함 | 측정 안 함 |
| 3 | `Arsenal transfer` | en-GB · GB · GB:en | transfer | 요청 안 함 | 측정 안 함 |
| 4 | `"Champions League"` | en-GB · GB · GB:en | ucl | 요청 안 함 | 측정 안 함 |
| 5 | `"Kim Min-jae"` | en-GB · GB · GB:en | korean | 요청 안 함 | 측정 안 함 |

**피드 구조 — 실측이 아니라 공개 수집본 기준.** GitHub 공개 저장소에 커밋된 Google News 피드 원본 두 건에서 확인한 값이다. 우리 쿼리의 결과는 아니다.
- 수집본 A: 검색 피드(`q=enterprise mashup`, `hl=en-US&gl=US&ceid=US:en`), `lastBuildDate` 2026-06-06, 63건 — https://github.com/nerevu/riko/blob/main/riko/data/news.google.com_rss_hl=en-US&gl=US&ceid=US_3Aen&q=enterprise%2Bmashup.xml
- 수집본 B: 스포츠 토픽 피드, `lastBuildDate` 2025-01-14 — https://github.com/spragginsdesigns/web-scraper-assistant/blob/d46575d9293149f9362178cd671bdd0bcd70abf0/gnSports.md

| 필드 | 형식 | 우리 파이프라인에 미치는 영향 |
|---|---|---|
| channel `generator`·`copyright` | `NFE/5.0` · 아래 "약관"의 고지문(A·B 같은 문구, 연도만 다름) | 이용 조건이 피드 안에 들어 있다 |
| item `title` | `기사 제목 - 매체명` (Google이 " - 매체명"을 덧붙임) | 원제목으로 쓰려면 꼬리를 잘라야 해서 FR-20의 "피드 제목 무수정"과 부딪힌다 |
| item `link` | `https://news.google.com/rss/articles/CBMi…?oc=5` | 원문 URL이 아니다(아래 "링크 구조") |
| item `guid` | `isPermaLink="false"`, link의 토큰과 같은 값(`?oc=5` 없음) | Google 토큰끼리의 중복 판정에만 쓸 수 있다 |
| item `pubDate` | RFC 822 GMT | 파싱이 쉽다 |
| item `description` | HTML `<a href="(Google 링크)">제목</a>&nbsp;&nbsp;<font color="#6f6f6f">매체명</font>`. 토픽 피드는 같은 사건의 관련 기사를 `<ol><li>`로 나열 | 본문 발췌가 없다(제목·매체명뿐) |
| item `source` | `<source url="https://solutionsreview.com">Solutions Review</source>` — 매체 **홈** URL(스킴+호스트) | 매체 도메인을 알 수 있는 유일한 필드라 허용 목록 대조에 쓸 수 있다 |
| 항목 수 | 검색 피드 최대 약 100건, 관련도순(시간순 아님), `when:1d`로 기간 제한 | 제3자 안내 https://feeder.co/knowledge-base/rss-feed-creation/google-news-rss-feeds/ |

- 레이트 리밋(429)은 요청을 보내지 않아 관찰하지 못했다. 공개 디코더 문서에 "does not avoid rate-limiting or CAPTCHAs presented by Google"(https://readme.hex.pm/google_news_decoder/0.1.0)이라는 문구가 있고, 다른 공개 명세 문서는 리다이렉트 링크가 "often triggering CAPTCHAs or 429s for bots"라고 적었다(https://github.com/JoaoCarabetta/arquivo-da-violencia 의 `docs/google news spec.md`). 봇 요청은 차단될 수 있다는 참고로만 둔다.

### 링크 구조와 카드 ID·중복 제거 영향

| 카드 링크 후보 | 방법 | 약관 | 기술 안정성 | 카드 ID(CLAUDE §8)·FR-04 영향 | 평가 |
|---|---|---|---|---|---|
| ① Google 링크 그대로 | item `link` 원문을 표시 링크로 쓴다 | 피드 이용 자체가 금지(고지). "표시 링크는 피드 원문"(FR-20) 규칙과는 맞는다 | 토큰 형식이 2024년에 한 번 바뀌었다 | ID를 Google 토큰 해시로 만들면 토큰이 같은 동안은 결정적이다. 형식이 바뀌면 ID가 한꺼번에 바뀌고 공유 앵커가 깨진다. 직접 RSS(BBC 등)로 들어온 같은 기사와는 URL 해시로 합칠 수 없어, `source` 도메인 + 꼬리를 뗀 제목으로 보조 키를 만들어야 한다(오탐·누락 위험). 독자의 클릭이 Google을 거친다(우리 사이트의 쿠키리스 방침과 결이 다름) | 쓸 수 있다면 유일한 후보 |
| ② `source` url(매체 홈) | 매체 홈만 링크한다 | 링크 자체는 문제없음 | 안정 | **원문 링크 요건(FR-30)을 채우지 못한다.** 같은 매체 기사가 모두 같은 URL이 돼 ID가 충돌하고 FR-04 판정도 불가능하다 | 불가 |
| ③ 디코딩 | 기사 페이지(`/rss/articles/…`)에서 서명(`data-n-a-sg`)·시각(`data-n-a-ts`)을 읽어 내부 `batchexecute` 엔드포인트에 POST(공개 디코더들의 방식) | robots가 막은 경로(`/rss/articles/`·`/_/`)를 자동으로 호출한다 → 약관의 robots 위반 자동 접근 금지, "bypassing our systems or protective measures" 조항에 걸린다 | 비공개 내부 API다. 2024년 변경 때 기존 방식이 깨졌다. 기사마다 1~2요청(45건이면 하루 45~90요청)이고 429·CAPTCHA 위험이 있다 | 원문 URL을 얻으면 ID·FR-04가 설계대로 동작한다 | **불가**(약관) |

- 결론: Google News 결과로는 **"원문 URL 기반 결정적 해시"라는 카드 ID 규칙(CLAUDE §8, PRD §15 D15)을 지킬 수 없다.** 이론상 ①만 남지만 피드 이용 자체가 금지라 의미가 없다.
- B2 대체재인 GDELT DOC API는 기사 원문 URL을 직접 돌려준다. FR-04 정규화·해시·카드 ID가 설계대로 동작한다는 점이 장점이다(M0-27에서 확인).

### 약관 (확인 2026-10-10)

- **피드 고지(RSS 전용 조건)** — 채널 `<copyright>`. RSS 이용 조건을 따로 적은 Google 웹 문서는 찾지 못했다(Google News 도움말을 검색하면 게시자용 Publisher Center 문서만 나온다). 수집본 A(2026-06-06) 원문:
  > "Copyright © 2026 Google. All rights reserved. This XML feed is made available solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use. Any other use of the feed is expressly prohibited. By accessing this feed or using these results in any manner whatsoever, you agree to be bound by the foregoing restrictions."
  - 수집본 B(2025-01-14)는 연도만 다르고 문구가 같다. 제3자 안내(feeder.co, 위 링크)도 "Each feed limits its use to a personal feed reader for personal, non-commercial use"라고 설명한다.
  - 우리가 직접 피드를 받지 않았으므로 오늘(2026-10-10) 날짜의 문구는 확인하지 못했다. 다만 1년 넘게 같은 문구가 유지됐고, 문구가 바뀌었더라도 아래 robots·약관 판정은 그대로다.
- **robots.txt** — https://news.google.com/robots.txt (200 `text/plain`, 33줄)
  - `User-agent: *` 그룹: `Disallow: /`와 `Allow: /$`·`/?`·`/home$`·`/home?`·`/home/`·`/nwshp$`·`/topics/`·`/publications/`·`/stories/`·`/swg/`·`/about$`·`/about?`·`/about/`. RFC 9309 방식(가장 긴 경로 규칙)으로 보면 `/rss/search?q=…`는 `Disallow: /`에만 걸려 **불허**다. `/rss/articles/…`·`/articles/…`·`/_/…`도 불허다.
  - `User-agent: CCBot · GPTBot · ChatGPT-User · PerplexityBot · anthropic-ai · ClaudeBot · Claude-Web` 그룹: `Disallow: /`(전면 차단).
  - 사용자가 직접 구독하는 RSS 리더 요청은 robots.txt 적용 대상이 아니라는 해석도 있다. 하지만 우리 파이프라인은 정해진 시각에 스스로 돌고 결과를 공개 게시하는 봇이라 이 해석에 기댈 수 없다.
- **Google 서비스 약관** — https://policies.google.com/terms (Effective July 30, 2026)
  - "Don't abuse our services": "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)" · "spamming, hacking, or bypassing our systems or protective measures" · "using our services (including the content they provide) to violate anyone’s legal rights, such as intellectual property or privacy rights"
  - "Content in Google services": "some of our services give you access to content that belongs to other people or organizations — for example, … a newspaper article displayed in Google News. You may not use this content without that person or organization’s permission, or as otherwise allowed by law."
  - 서비스 이용 중단 사유의 예: "scraping content that doesn’t belong to you".
- **서비스별 추가 약관** — https://policies.google.com/terms/service-specific : "News" 항목에는 "Terms of Service" 1건만 있다. **Google News 전용 추가 약관은 없다.**
- **요약** — ① 원제목+링크 게시: **금지.** 피드 고지가 개인 피드 리더 밖의 이용을 명시적으로 막고, 비영리·광고 없음은 예외가 되지 않는다. ② 자동 수집: **금지.** robots.txt가 불허하고 약관이 robots 위반 자동 접근을 금지한다. ③ 결과를 내부 신호로만 쓰기: **금지.** 고지가 "using these results in any manner whatsoever"까지 묶는다. ④ 결과 기사의 권리는 Google이 아니라 각 매체에 있다(약관 "Content in Google services").

### 매체 약관 상속

Google 약관이 직접 밝히듯 Google News에 보이는 기사의 권리는 각 매체에 있다. 그러니 Google News를 쓸 수 있었더라도 결과 기사마다 그 매체의 판정을 따라야 했다. GDELT(M0-27)도 수많은 매체의 기사 URL·제목을 돌려주므로 **같은 문제가 그대로 생긴다.** 그래서 이 절은 검색형 소스 전체에 대한 제안으로 쓴다.

1. **금지·불명확 매체 도메인은 반드시 걸러야 한다.** 우리가 제외한 매체의 기사를 검색 경로로 게시하면 판정을 우회하는 것과 같다.
   - `sources.json`의 `terms_checked:false` 소스: skysports.com · theguardian.com · caughtoffside.com · football-italia.net · football-espana.net · uefa.com · yna.co.kr
   - 문서에만 남긴 금지 판정: sport.sky.de · bundesliga.com · marca.com · calciomercato.com · teamtalk.com · football365.com · osen.co.kr, 그리고 M0-24 참고 조사에서 자동 수집·AI 이용 금지 문구를 확인한 givemesport.com
   - m4ow 계약(Rocket 계열)은 "검색 서비스 밖의 표시"를 금지하고 무허가 접근에 건당 £500을 매긴다. 검색 결과를 거쳐 게시해도 그대로 걸린다.
2. **차단 목록(denylist)만으로는 부족하고 허용 목록(allowlist)이 필요하다.** 검색 결과의 대부분은 우리가 판정하지 않은 매체다. "근거가 모호하면 보수적으로"(D22)를 따르면 미판정 매체를 기본 게시로 둘 수 없다.
3. **`sources.json`의 판정을 그대로 가져다 쓸 수는 없다.** 허가 범위가 피드에 묶인 매체가 있기 때문이다.

| 구분 | 매체 | 판정 근거의 범위 | 검색 결과 게시 |
|---|---|---|---|
| 피드 한정 허가 | ESPN(RSS Terms "content that is provided in the feed", "URLs provided in the feed") · The Athletic(NYT RSS "use of NYTimes.com RSS feeds … as part of a non-commercial blog") · BBC(ToU §15 a "add the BBC News RSS feed to your website") | 피드에 실린 항목의 게시만 허가 | **불가.** 검색으로만 찾은 기사는 피드 밖이다. 피드에 실린 기사라면 이미 피드로 받는다 |
| 사용자 결정(위험 수용) | the Daily Briefing · Di Marzio · Relevo | 피드 게시에 대한 결정 | **불가**(결정 범위 밖). 넓히려면 새 결정이 필요하다 |
| 매체 단위 해석 근거 | 인터풋볼 · 풋볼리스트 · 베스트일레븐 · 스포탈코리아 | RSS 안내(제3자 사이트 게재)에, "금지 대상은 저작물의 복제·전송이고 짧은 제목은 저작물성이 낮으며 링크는 복제가 아니다"라는 매체 단위 해석이 더해짐 | **조건부 가능.** 제목 무수정·원문 링크·매체명 표기 |
| 금지·불명확 | 위 1의 도메인 | — | **불가**(차단) |
| 미판정 | 그 밖의 모든 매체 | — | **보류.** 게시하지 않고 빈도만 집계한 뒤 `/add-source`로 매체를 판정한다 |

4. **권고 규칙(검색형 소스 공통, M1-07에서 구현)**
   - 결과마다 매체 도메인을 얻는다(GDELT는 기사 URL의 호스트, Google News라면 `source` url). `www.`를 떼고 eTLD+1로 맞추되, 한 도메인 안에서 경로로 매체가 갈리는 곳(nytimes.com/athletic)은 경로 접두사까지 본다.
   - 매체 도메인 판정표에서 "검색 결과 게시 = 허용"인 도메인만 게시한다. 차단 도메인은 버리고, 미판정 도메인은 게시하지 않은 채 `data/cache/`에 도메인별 빈도를 쌓아 주간 이슈로 올린다(`/add-source` 후보).
   - 판정표를 어디에 둘지는 스키마 변경이라 사용자 결정 사항이다(아래 질문 2). 후보는 (a) 새 설정 `configs/publisher-domains.json`(도메인 → 판정·근거 URL·검색 게시 허용·연결 소스 id)과 (b) `Source`에 `domains[]`·검색 게시 플래그를 더하는 방식이다. `sources.json`은 "피드" 단위라서 피드 없는 금지 매체(OSEN·Marca 등)를 담기 어렵다. 그래서 (a)를 권고한다.
   - 지금 판정만으로 허용할 수 있는 도메인은 국내 4개뿐이다. 해외 매체는 하나씩 판정하기 전까지 검색형 소스에서 얻을 기사가 거의 없다.

### 하루 쿼리 상한 권고

- **Google News: 0개.** 사용할 수 없으므로 활성 쿼리를 두지 않는다.
- **`configs/search-queries.json` `maxEnabled`: 20(잠정).** B2에 따라 검색 쿼리는 GDELT 전용이 되고, 최종값은 M0-27의 GDELT 실측(요청 간격·쿼리당 결과 수·허용 매체 비율)으로 정한다. basic_plan의 20~30에서 하한을 고른 이유는 두 가지다. ① 허용 목록을 적용하면 쿼리당 게시할 수 있는 결과가 적어, 쿼리를 늘려도 얻는 기사가 비례해서 늘지 않는다. ② 요청 예절상 요청은 적을수록 좋다.
- **쿼리 구성 원칙(GDELT 기준 제안)**
  1. 한국 선수: 1명당 영문 이름 쿼리 1개(약 10개). 한국어 보도는 국내 매체 RSS 5개 피드가 맡는다(인터풋볼 해외축구 피드는 제목의 50%가 한국 선수, M0-25). 한국어 쿼리는 M0-27에서 GDELT의 한국어 매체 범위를 확인한 뒤 정한다.
  2. 이적: 클럽마다 쿼리를 두지 않고 빅클럽을 묶은 쿼리 3~5개(OR 연산자).
  3. UCL 1개, 대표팀 1개(A매치 기간 ±3일에만 `enabled`, FR-71), 여유 2~3개.
  4. 쿼리마다 시간 창(직전 성공 실행 ~ 현재, 최대 36시간 — FR-07)과 결과 상한을 고정하고, `purpose`는 점수화 힌트로만 쓴다(FR-06).
  5. 쿼리는 `/add-player`(선수)와 수동 편집으로만 추가하고, 상한은 `npm run validate`가 검사한다.
- 기존 fixture(`fixtures/schema/configs/search-queries.json`)가 `google-news-ko`·`google-news-en` id를 쓴다. 판정 기록용으로 등록하면 같은 id가 생기지만 `enabled:false`라 실행되지 않는다. fixture를 GDELT 예시로 바꿀지는 M0-27 결과와 함께 정한다.

### Source 권고값 (판정 기록용)

권고안 파일: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-26-proposal.json` — `sources` 2개와 `searchQueries` 초안. 각 `note`에 확인 날짜·근거 URL·짧은 인용을 적었다.

| id | type | url | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `google-news-ko` | search | news.google.com/rss/search | ko | false | false | false | false | 3 | 1 | [] | 판정 기록용 — 금지 |
| `google-news-en` | search | news.google.com/rss/search | en | false | false | false | false | 3 | 1 | [] | 판정 기록용 — 금지 |

- 한/영 두 소스로 나눈 것은 기존 fixture의 id 관례를 따른 것이다. hl·gl은 쿼리의 `lang`·`region`으로 정한다.
- `robots_checked:false`는 "확인했으나 불허"라는 뜻이다. 지금까지 등록한 23개는 모두 허용이라 `true`였다. `terms_checked`와 함께 이중 잠금이 모두 `false`다.
- `searchQueries` 초안에는 `maxEnabled: 20`과 설계한 5종(`gn-ko-lee-kang-in`·`gn-ko-premier-league`·`gn-en-arsenal-transfer`·`gn-en-champions-league`·`gn-en-kim-min-jae`)을 모두 `enabled:false`로 넣었다. **`player` slug는 비워 두었다.** `korean-players.json`이 아직 없기 때문이다(M0-32). 나중에 `/add-player`가 채운다.
- **스키마 검증**(`node --import tsx`): 권고안 `SourceSchema.array()` **통과(2개)**, 기존 23개와 합친 25개 `SourcesFileSchema` **통과**(id 중복 없음), `SearchQueriesFileSchema` **통과**(쿼리 5 · 활성 0 · 상한 20), 교차 참조 `checkSearchQuerySources`(`scripts/lib/validate-crossref.ts`) **통과**(5개 모두 type `search` 소스를 가리킴). rss 소스를 가리키게 바꾼 음성 대조는 오류 1건으로 잡혔다. 합친 뒤에도 수집 대상(`enabled && terms_checked`)은 14개, LLM 요약 대상은 0개 그대로다.

### 판정·B2 분기

| 항목 | 판정 |
|---|---|
| 원제목+링크 게시(`type: search`) | **금지** — 피드 고지가 "personal feed reader" 밖의 이용을 명시적으로 금지 |
| 자동 수집 | **금지** — robots.txt `Disallow: /`(`/rss/` 불허) + 약관의 robots 위반 자동 접근 금지 |
| 원문 URL 디코딩 | **불가** — robots 불허 경로·비공개 내부 API |
| 내부 신호로만 사용 | **금지** — "using these results in any manner whatsoever" |
| 종합 | **사용 불가** → plan §14 **B2 발생** |

**B2 분기 결론**: Google News RSS는 쓰지 않는다. 뉴스 검색은 **GDELT(M0-27) + 국내 매체 RSS(M0-25, 5개 피드)**로 대체한다. NewsData.io 같은 다른 API는 plan대로 사용자 승인 후에만 검토하고, 지금은 권고하지 않는다(새 외부 서비스이고, 결과 매체 약관 상속 문제가 똑같이 생긴다).

**잃는 것과 남는 것**
- 잃는 것: 한국 선수별 국내 보도의 폭(basic_plan §3.4의 "선수 10명 × 1쿼리"). 다만 허용 목록을 적용했다면 Google News 한국어 결과에서 게시할 수 있는 것은 국내 4개 매체 기사뿐이었다. 이 매체들은 이미 RSS로 받고 있으므로 실제 손실은 "RSS 20건 창 밖으로 밀려난 같은 매체 기사" 정도로 작다.
- 남는 것: 국내 RSS 5개 피드, 해외 원제목 소스 9개, GDELT(원문 URL 제공 — 허용 목록 규칙 적용).

**후속 반영 대상**(사용자 확인 후 오케스트레이터가 반영 — 이 작업에서는 고치지 않았다)
- PRD: FR-02 수집 우선순위의 "뉴스 검색(Google News RSS·GDELT)" → GDELT, §15 D23의 "한국어 콘텐츠는 국내 매체 RSS·Google News 한국어로 보강" → 국내 매체 RSS, §13 위험 표의 "Google News RSS 차단·조건 변경" → 발생, NFR-09에 검색 결과 매체 약관 상속 규칙 추가 여부.
- plan: M1-06(Google News 어댑터) → 취소하거나 `search-queries` 처리를 M1-07 GDELT 어댑터로 통합, D0 뉴스 카드 변형의 "한국어 보도 카드(국내 매체·Google News 한국어)" → 국내 매체만, M0-34의 "국내 카드는 M0-25·M0-26 판정 통과분" → M0-25 통과분만.
- CLAUDE §13 미결의 "Google News RSS·GDELT 이용 조건" → Google News는 해결(사용 불가), GDELT는 M0-27.
- M0-27(GDELT): 이 절의 "매체 약관 상속" 규칙을 같은 기준으로 적용한다.

### 사용자 확인 질문 — 2026-10-10 답변 완료

> 답변: 1 → (A) 기록용 등록·B2 발동 · 2 → (A) 별도 도메인 허용 목록 `configs/publisher-domains.json`(목록 밖 기본 차단) · 3 → (A) 실측 없이 마감, `search-queries.json`은 M0-27에서 만든다. 자세한 내용은 위 "사용자 결정 (2026-10-10)".

1. **Google News RSS 판정과 B2 발동**
   - (A) **금지 판정을 받아들여 B2를 발동하고, 판정 기록용 2개를 등록(추천)** — `google-news-ko`·`google-news-en`을 `enabled:false`·`terms_checked:false`·`robots_checked:false`로 등록한다(M0-23 Sky·Guardian, M0-25 연합뉴스 선례). fixture의 id 관례와 맞고, 같은 조사를 다시 하지 않게 막는다.
   - (B) 판정·B2 발동은 같고 `sources.json`에는 등록하지 않는다 — 설정 파일이 단순해지는 대신 검색 쿼리 초안(GN 5종)도 함께 뺀다.
   - (C) 사용자 해석으로 켬 — **비권고.** BBC·Di Marzio처럼 근거가 엇갈리는 경우가 아니다. 명시적 금지 문구·robots 불허·약관 조항이 모두 같은 방향이고, 차단(IP·계정) 위험도 있다.
2. **검색형 소스(GDELT 포함)의 매체 약관 상속 규칙** — M0-27 전에 정하면 GDELT를 같은 기준으로 판정할 수 있다.
   - (A) **매체 도메인 허용 목록을 새 설정 `configs/publisher-domains.json`에 둔다(추천).** 도메인마다 판정·근거 URL·검색 게시 허용 여부·연결 소스 id를 적고, 미판정 도메인은 게시하지 않은 채 빈도만 집계해 주간 이슈로 올린다. 새 zod 스키마·fixture·테스트가 필요하다(CLAUDE §8 순서). 처음 허용되는 도메인은 국내 4개뿐이고, 해외 매체는 하나씩 판정해 늘린다.
   - (B) `Source`에 `domains: string[]`와 검색 게시 플래그를 더해 `sources.json`을 재사용한다 — 파일은 하나로 유지된다. 대신 피드 없는 금지 매체(OSEN·Marca 등)도 소스로 등록해야 하고, "피드 한정 허가"와 "매체 단위 허가"를 가르는 플래그가 필요하다.
   - (C) 차단 목록만 둔다(금지 판정 도메인만 막고 나머지는 게시) — **비권고.** 미판정 매체가 대부분이라 D22의 보수 원칙과 맞지 않는다.
3. **쿼리 5종 실측을 하지 않은 것의 처리**
   - (A) **실측 없이 이대로 마감(추천)** — 판정은 robots·피드 고지·약관만으로 확정되고, 매체 분포 같은 수치는 판정을 바꾸지 않는다. `maxEnabled`는 20 잠정으로 두고 M0-27에서 확정한다.
   - (B) 사용자가 개인 브라우저로 5개 URL을 직접 열어 결과 매체 분포만 기록 — 피드 고지의 "개인 열람"으로 볼 여지는 있지만, 결과를 공개 저장소 문서에 남기는 것도 "그 밖의 이용"으로 볼 수 있어 얻는 것이 적다.
   - (C) 봇 UA로 5건만 실측 — **비권고.** robots.txt 위반이라 약관에 걸리고, M0-25 선례와 CLAUDE §6.4에 어긋난다.

## M0-27 GDELT DOC API

> 상태: **✅ 완료 — 결정(2026-10-10) 반영.** 판정 기록용 `gdelt-doc`을 `configs/sources.json`에 비활성으로 등록했고(→ 26개), `configs/search-queries.json`을 새로 만들었다(`maxEnabled` 10 · 쿼리 9개 전부 비활성). 아래 "핵심 결론"~"사용자 확인 질문"은 조사 시점 기록이고, 최종 결과는 "결정 (2026-10-10)"이 단일 출처다.

대상: GDELT DOC 2.0 API(`https://api.gdeltproject.org/api/v2/doc/doc`, `mode=ArtList&format=json`). plan §14 B2에서 Google News를 대신할 검색 소스로 정한 곳이다. 과제는 쿼리 3종 실측(한국어 선수 · 영어 빅클럽 이적 · 다국어 UCL), 허용 도메인 `domain:` 조회, 한국어 매체 커버리지, 이용 조건, 하루 쿼리 상한 확정이다.
판정 기준·용어는 M0-23~M0-26과 같다(문서 머리 표, PRD §15 D22~D25). 검색 결과에는 `src/lib/schema/publisher.ts`의 `isSearchResultAllowed`(`allow`만 true, 목록 밖은 차단)를 실제로 적용했다.
요청 범위: 2026-10-10 09:01~09:14 UTC(18:01~18:14 KST)에 **직접 요청 20건**을 보냈다. api.gdeltproject.org robots.txt 1건(404)과 DOC API 19건(200: 6 · 429: 12 · 네트워크 오류: 1)이다. 고정 파라미터는 `mode=ArtList&format=json&maxrecords=250&sort=DateDesc`이고 `timespan`은 1d~1m을 썼다. 다음 요청은 앞 요청의 **응답이 끝난 뒤 6~60초** 간격을 두고 보냈다(GDELT 권장은 5초 이상). 결과 링크의 원문 기사 요청은 0건, 금지 사이트 접근도 0건이다. 보조 조사로 GDELT 문서 3건(DOC 2.0 소개 글, 2022 레이트 리밋 공지, About·Terms of Use)과 제3자 보고 3건을 WebFetch로 읽었고, 웹 검색을 6회 했다.

### 핵심 결론 (먼저 읽기)
1. **약관은 허용(조건부)이다.** GDELT 데이터는 상업적 이용을 포함해 무제한·무료로 쓸 수 있다. 조건은 **GDELT 인용과 https://www.gdeltproject.org/ 링크**다. api.gdeltproject.org의 robots.txt는 404라 제한이 없다. 결과 기사 제목의 권리는 각 매체에 있으므로 D25 허용 목록이 그대로 처리한다. Google News와 달리 결과 이용을 막는 고지는 없다.
2. **레이트 리밋이 문서보다 훨씬 엄격하다.** 19건 중 6건만 성공했다(32%). 응답이 끝나고 60초를 기다렸다가 보낸 요청 4건도 모두 429였다. 429 본문은 "one every 5 seconds"를 요구하지만 간격을 늘려도 나아지지 않았다. 2026-07~10에 나온 제3자 보고 3건도 같은 현상을 적었다. 측정값으로 계산하면 **쿼리 1개를 성공시키는 데 평균 약 1분**이 든다.
3. **측정 시점의 색인은 극히 희소했다.** `sourcelang:korean` 24시간 결과가 3건, `"Champions League"` 3일 결과가 2건(축구와 무관한 기사), `"Real Madrid" transfer`(영어) 3일 결과가 0건, `이강인`(한국어) 1주 결과가 0건, `domain:interfootball.co.kr` 1개월 결과가 0건이다. 받은 5건은 **모두 seendate 06:45:00Z 한 배치**였다. 요청 시각보다 2.3~2.5시간 전이고, 그 뒤 배치는 하나도 검색되지 않았다.
4. **허용 목록을 통과한 결과는 0/5다.** 허용 도메인 4개(국내 엔디소프트 매체)는 결과에 한 번도 나오지 않았다. GDELT가 정상이라도 구조적 한계가 있다. 지금 허용 목록에서 게시할 수 있는 것은 이미 RSS(전체기사 피드 24.8~50시간 창, M0-25)로 받는 매체의 기사뿐이다. 영문·스페인어·이탈리아어 쿼리(선수·이적·UCL)는 해외 `allow` 도메인이 없으므로 **정의상 0건**이다.
5. **`title`은 원제목이 아닐 수 있다.** 구두점 앞에 공백이 들어가 있고(`정부 , 18년`, `Meetings , Reaffirming`) 따옴표가 있었을 자리에 공백이 겹친다. GDELT가 제목을 정규화한 흔적으로 보인다. 원문 페이지를 열지 않았으므로 원제목과 직접 대조하지는 않았다. FR-20의 "제목 무수정"을 지키려면 같은 URL의 RSS 제목이나 og:title을 써야 한다.
6. **권고**: `gdelt-doc`을 `type: search` **판정 기록용으로 등록하고 비활성으로 둔다**(`enabled:false` · `terms_checked:true` · `robots_checked:true`, `sportalkorea-all` 선례). `search-queries.json`은 쿼리 9개를 모두 비활성으로 두고 **`maxEnabled: 10`**으로 만든다. 당분간 하루 GDELT 쿼리는 0개다. → 결정: 권고대로(아래 "결정").

### 결정 (2026-10-10)

오케스트레이터가 기존 사용자 결정 선례(M0-25 스포탈코리아 — 약관 통과·기술 부적합으로 비활성, M0-26 판정 기록용 등록)에 따라 정했다.

| # | 항목 | 결정 | 반영 |
|---|---|---|---|
| 1 | GDELT DOC API | **판정 기록용 등록·비활성** — `gdelt-doc`: `enabled:false` · `summarize:false` · `terms_checked:true` · `robots_checked:true`. `note`에 판정·약관 인용·429 실측·재활성 기준을 적는다. 뉴스 검색 단계는 당분간 쓰지 않는다 | `configs/sources.json` |
| 2 | `configs/search-queries.json` | **지금 만든다** — `maxEnabled: 10`, 쿼리 9개 전부 `enabled:false`. 선수 쿼리 3개는 `player` 필드를 생략해 **보류**로 둔다(스키마상 선택 필드 — `korean-players.json`이 생기면 `/add-player`가 slug를 채우거나 쿼리를 바꾼다, M0-32) | `configs/search-queries.json` |
| 3 | 재측정 | **M1 7일 발행 관찰 기간에 하루 1회 소량 수동 재측정**(쿼리 2개 — `sourcelang:korean` 1d·허용 도메인 OR 1d, 하루 직접 요청 3건 이내) 후 재결정. 켜는 기준은 아래 "판정·설계 권고" 3 | plan M1-46(오케스트레이터) |

**등록 결과 — `configs/sources.json`** (1개 추가 → 26개, `npm run validate` 통과 — configs 4개 검사·교차 참조 2건 실행·오류 0건, 수집 대상 `enabled && terms_checked` 14개·LLM 요약 대상 0개 그대로)

| id | url | type | lang | enabled | summarize | terms_checked | robots_checked | tier | weight | competitions | 이용 방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gdelt-doc` | api.gdeltproject.org/api/v2/doc/doc | search | mul | false | false | true | true | 3 | 1 | [] | 판정 기록용 — 약관 허용(조건부)·기술 부적합 |

**등록 결과 — `configs/search-queries.json`** (신규, `maxEnabled` 10 · 쿼리 9 · 활성 0, 교차 참조 "search-queries.source → sources(type search)" 통과)

| id | q | lang | purpose | player | enabled |
|---|---|---|---|---|---|
| `gd-ko-allow-domains` | `(domain:interfootball.co.kr OR domain:footballist.co.kr OR domain:besteleven.com OR domain:sportalkorea.com)` | ko | general | — | false |
| `gd-ko-lee-kang-in` | `이강인` | ko | korean | 보류(생략) | false |
| `gd-en-lee-kang-in` | `"Lee Kang-in"` | en | korean | 보류(생략) | false |
| `gd-en-kim-min-jae` | `"Kim Min-jae"` | en | korean | 보류(생략) | false |
| `gd-en-transfer-epl` | `(Arsenal OR Chelsea OR Liverpool OR "Manchester City" OR "Manchester United" OR Tottenham) transfer` | en | transfer | — | false |
| `gd-es-transfer-laliga` | `("Real Madrid" OR Barcelona OR "Atletico Madrid") fichaje` | es | transfer | — | false |
| `gd-it-transfer-seriea` | `(Juventus OR Inter OR Milan OR Napoli) calciomercato` | it | transfer | — | false |
| `gd-mul-champions-league` | `"Champions League"` | mul | ucl | — | false |
| `gd-en-korea-national` | `"South Korea" (football OR soccer)` | en | national | — | false |

- 모든 쿼리의 `source`는 `gdelt-doc`이다. `q`에는 `sourcelang:`을 넣지 않는다 — M1 어댑터가 `lang`을 GDELT 언어명으로 바꿔 붙이고 `mul`이면 언어 필터를 붙이지 않는다(아래 "판정·설계 권고" 2). `region`은 쓰지 않는다(GDELT `sourcecountry`는 FIPS 코드).
- 선수 쿼리 3개는 M0-26 문서에 나온 이름을 쓴 예시다. 2026-27 명단(M0-32)이 확정되면 `/add-player`가 slug를 채우거나 쿼리를 바꾼다.
- fixture `fixtures/schema/configs/search-queries.json`·`sources.json`은 바꾸지 않았다. `google-news-ko/en` id는 실제 `configs/sources.json`에도 기록용으로 남아 있어 fixture가 여전히 유효하고, 테스트(`tests/validate.test.ts` ⑤)가 그 fixture에 맞춰져 있다.
- PRD·plan·CLAUDE 반영은 오케스트레이터 몫이다: PRD FR-02·§15 D25, plan M1-06(검색형 소스 공통)·M1-07(GDELT 어댑터 보류)·M1-46(재측정), CLAUDE §13 미결 "GDELT 이용 조건" → 해결. GDELT를 켜게 되면 NFR-09 출처 표기에 GDELT 인용·링크를 넣는다.

### API 파라미터 (문서 확인 2026-10-10)

출처: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ (소개 글). 실측으로 확인한 항목은 따로 표시했다.

| 파라미터 | 내용 | 우리 용도 |
|---|---|---|
| `query` | `"…"` 정확한 구문 · `(A OR B)` 괄호와 대문자 OR, "Boolean OR blocks cannot be nested" · `-` 제외 · `domain:`(하위 도메인 포함)과 `domainis:`(정확히 일치) · `sourcecountry:`(공백 없는 국가명 또는 **FIPS 코드**) · `sourcelang:` · `theme:` · `near:` · `repeat:` · `tone` | 허용 도메인 매칭 규칙(하위 도메인 포함)은 `domain:`과 같다. `sourcelang:korean`이 동작함을 실측으로 확인. 도메인 4개를 OR로 묶은 쿼리는 구문 오류 없이 0건 |
| `mode=ArtList` | 기사 목록. `maxrecords` 기본 75, 최대 250 | 250 |
| `format` | HTML(기본) · CSV · JSON · JSONP · RSS · RSSArchive · JSONFeed | JSON |
| `timespan` | 기본 3개월. 단위 `min`(최소 15) · `h` · `d` · `w` · `m`. 또는 `startdatetime`·`enddatetime`(`YYYYMMDDHHMMSS`, 최근 3개월 안) | 직전 성공 실행부터 지금까지(최대 36시간, FR-07) → `startdatetime`·`enddatetime` |
| `sort` | `DateDesc` · `DateAsc` · `ToneDesc` · `ToneAsc` · `HybridRel`(기본은 관련도) | `DateDesc` |
| 레이트 리밋 | 소개 글에는 수치가 없다. 429 본문: "Please limit requests to one every 5 seconds or contact … for larger queries. All high-traffic users should switch to our ngrams dataset". 2022 공지: "Our APIs are rate limited to protect the underlying ElasticSearch clusters"(https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/) | 아래 "레이트 리밋 실측" |

**응답 필드(실측)** — 결과가 있는 응답 2건(5개 기사) 기준

| 필드 | 실측 형식 | 파이프라인 영향 |
|---|---|---|
| `url` | **원문 기사 URL**(리다이렉트 아님). 예: `https://www.hani.co.kr/arti/politics/diplomacy/…html`. `http://` 스킴이 그대로 오기도 한다(argentinastar.com) | FR-04 정규화·해시와 카드 ID가 설계대로 동작한다. 표시 링크는 원문 그대로 둔다 |
| `url_mobile` | 5건 모두 빈 문자열 | 쓰지 않는다 |
| `title` | 정규화 흔적: `주우크라 대사 오전 소환 귀국 … 정부 , 18년 만의 강경 외교 조치`, 앞뒤 공백·이중 공백 | 표시 제목으로 쓰지 않는다(위 핵심 결론 5) |
| `seendate` | `20261010T064500Z`(UTC). GDELT가 **처음 본 시각**이고 15분 배치 단위다 | 게시 시각이 아니다. `publishedAt`으로 쓴다면 그렇다는 사실을 남긴다 |
| `socialimage` | 기사 대표 이미지 URL | **쓰지 않는다**(CLAUDE §1-6). 어댑터 경계에서 버린다 |
| `domain` | `www.`를 뗀 호스트(`hani.co.kr`)이고 하위 도메인은 남긴다(`biz.heraldcorp.com`) | 판정은 `url` 호스트로 한다. 이 필드는 로그용 |
| `language` | 영어 언어명(`Korean`, `English`) | lang 코드로 바꾼다 |
| `sourcecountry` | 영어 국가명(`South Korea`, `Argentina`, `Pakistan`). 신디케이션 사이트는 사이트의 명목상 국가가 나온다 | 쓰지 않는다 |
| 빈 결과 | HTTP 200 + `{}`(`articles` 키 없음) | 0건으로 처리한다 |
| 429 | HTTP 429 + 일반 텍스트 본문(JSON 아님, content-type 없음) | 파싱 전에 상태 코드부터 본다 |

### 쿼리별 결과 표

표의 "결과"는 HTTP 200을 받은 시도 기준이다. 같은 쿼리를 여러 번 보낸 경우가 있고, 429만 받은 쿼리는 "측정 실패"로 적었다.

| # | 쿼리 `query` | 목적 | timespan | 시도(200 / 429 / 오류) | 결과 | 최신 / 가장 오래된 seendate | 도메인 분포 | 중복 | 허용 목록 통과 |
|---|---|---|---|---|---|---|---|---|---|
| ① | `이강인 sourcelang:korean` | 한국 선수(한국어) | 3d → 1w | 3d 0/3/0 · 1w 1/0/0 | **0** (1w) | — | — | — | 0 |
| ①b | `"Lee Kang-in"` (언어 제한 없음) | 한국 선수(영문 이름) | 3d → 1w | 3d 0/2/1 · 1w 0/1/0 | 측정 실패 | — | — | — | — |
| ② | `"Real Madrid" transfer sourcelang:english` | 빅클럽 이적(영어) | 3d | 1/0/0 | **0** | — | — | — | 0 |
| ②b | `"Real Madrid"` | 대조(영어권 축구 색인량) | 1d | 0/1/0 | 측정 실패 | — | — | — | — |
| ③ | `"Champions League"` | UCL(다국어) | 3d | 1/1/0 | **2** | 2026-10-10T06:45:00Z / 같음 | argentinastar.com 1 · pakistantelegraph.com 1 | 고유 URL 2 · 고유 제목 1(같은 기사를 신디케이션 사이트 두 곳이 실음) | **0/2** |
| ③b | `"Champions League"` | UCL(색인 기간 대조) | 2w | 0/2/0 | 측정 실패 | — | — | — | — |
| ④ | `(domain:interfootball.co.kr OR domain:footballist.co.kr OR domain:besteleven.com OR domain:sportalkorea.com)` | 허용 도메인만 조회 | 3d | 1/0/0 | **0** | — | — | — | 0 |
| ④b | `domain:interfootball.co.kr` | 허용 도메인 색인 여부 | 1m | 1/2/0 | **0** | — | — | — | 0 |
| ⑤ | `sourcelang:korean` | 한국어 매체 커버리지 | 1d | 1/1/0 | **3** | 2026-10-10T06:45:00Z / 같음 | hani.co.kr 2 · biz.heraldcorp.com 1 | 없음 | **0/3** |

**예시 제목**(제목만, GDELT `title` 원문 그대로. 공백도 그대로 두었다)
- ③ `Finance Minister Guides Press Through QSNCC Ahead of 2026 IMF - World Bank Group Annual Meetings , Reaffirming Thailand Readiness on All Fronts` (2건이 같은 제목). 축구와 무관하다. "Champions League"가 페이지 주변 텍스트에서 걸린 것으로 보인다.
- ⑤ `주우크라 대사 오전 소환 귀국 … 정부 , 18년 만의 강경 외교 조치` · `대낮 뉴욕 주택가서 ICE 요원 , 5살 아이 탄 차량에 7발 총격` · `  강호동 아들  강시후 군 … 188cm 고교생 골퍼로 성장  화제  ` (모두 축구와 무관한 종합 뉴스)
- ①·②·④는 결과가 0건이라 예시가 없다.

### 레이트 리밋 실측

| 묶음 | 시각(UTC) | 간격(앞 응답 완료 후) | 요청 | 200 | 429 | 오류 |
|---|---|---|---|---|---|---|
| 1 | 09:02:08~09:03:46 | 7초 | 5 | 2 | 2 | 1 (`fetch failed`) |
| 2 | 09:04:09~09:05:46 | 30초 | 3 | 1 | 2 | 0 |
| 3 | 09:06:27~09:10:08 | 60초 | 4 | **0** | 4 | 0 |
| 4 | 09:11:11~09:12:03 | 6초 | 3 | 2 | 1 | 0 |
| 5 | 09:12:15~09:12:55 | 6초 | 3 | 0 | 3 | 0 |
| 6 | 09:13:47 | 약 52초 | 1 | 1 | 0 | 0 |
| 합계 | | | **19** | **6** | **12** | **1** |

- 응답 시간은 200이 평균 16.2초(11.8~19.5초), 429가 평균 10.5초(8.4~13.1초)다. 429에도 10초가 걸리므로 서버 쪽 대기열을 거치는 것으로 보인다.
- **간격을 늘려도 나아지지 않았다**(60초 간격 0/4). 제3자 보고도 같다.
  - gdelt-mcp-server #44(2026-09-18 작성, 09-22 재측정): "a request sent 5.2 s after the previous one _completed_ is still rejected"이고, 30초 간격으로 보낸 3건도 모두 거부됐다. "No 429 carries `Retry-After`" — https://github.com/cyanheads/gdelt-mcp-server/issues/44
  - errata-pulse #16(2026-10-06): "GDELT DOC API returns 429 to this server nearly always (1 ok of 14 in 30 h)". 그 뒤 GKG 15분 대량 파일로 옮겼다 — https://github.com/ikorfale/errata-pulse/issues/16
  - APITube 이전 안내(판매사 문서, 2026-07-27 측정): 6초 간격 1/7 · 16초 4/12 · 60초 3/8 · 150초 0/3 · 300초 0/7 — https://docs.apitube.io/platform/migrations/from-gdelt
- `Retry-After` 헤더: 우리 스크립트는 응답 헤더를 기록하지 않았다(위 #44는 없다고 보고).
- **처리량 추정**: 시도 1회에 응답 약 12.3초(가중 평균)와 간격 6초를 더해 약 18초가 걸린다. 성공 확률이 0.32이므로 **성공 1건당 약 58초**다. 쿼리 10개면 약 10분, 20개면 약 19분이다. collect.yml은 06:30 KST에 시작하고 06:50에 배치 폴백을 하므로(20분 창) 20개는 이 창 안에 끝낼 수 없다.

### 허용 목록 적용 결과

`node --import tsx`로 `configs/publisher-domains.json`(27개)을 `PublisherDomainsFileSchema`로 파싱하고, 결과마다 `isSearchResultAllowed(new URL(url).hostname, domains)`를 적용했다.

| 쿼리 | 결과 | allow | feed-only | deny | 목록 밖(기본 차단) | 통과 |
|---|---|---|---|---|---|---|
| ③ `"Champions League"` 3d | 2 | 0 | 0 | 0 | 2 (argentinastar.com · pakistantelegraph.com) | 0 |
| ⑤ `sourcelang:korean` 1d | 3 | 0 | 0 | 0 | 3 (hani.co.kr · biz.heraldcorp.com) | 0 |
| ① · ② · ④ · ④b | 0 | — | — | — | — | 0 |
| **합계** | **5** | 0 | 0 | 0 | 5 | **0** |

- 스모크 검사: `www.interfootball.co.kr` → true(`www.` 하위 도메인 매칭), `www.bbc.com`(feed-only) → false, `www.skysports.com`(deny) → false. GDELT `url`의 호스트 형태(`www.` 포함, `http://` 스킴)에서도 판정 함수가 의도대로 동작한다.
- **구조적 한계**: `allow` 4개는 모두 국내 엔디소프트 매체다.
  - 영어·스페인어·이탈리아어 쿼리는 GDELT가 정상이어도 통과 결과가 0건이다. M0-26 구성안의 "선수별 영문 쿼리 약 10개"도 게시할 수 있는 결과를 만들지 못한다.
  - 국내 4개 매체 중 3개는 이미 RSS 5개 피드(전체기사 피드 24.8~50시간 창)로 받는다. GDELT로 더 얻을 수 있는 것은 "RSS 창 밖으로 밀린 기사"와 스포탈코리아(피드 부적합으로 비활성) 기사 정도다.
- 실효성을 높이려면 해외 매체를 매체 단위로 하나씩 판정해 허용 목록을 넓혀야 한다(`/add-source`). M0-23·M0-24에서는 매체 단위 허용 근거가 나온 해외 매체가 0개였다.

### 지연·커버리지

- **수집 지연**: 받은 5건의 seendate가 모두 2026-10-10T06:45:00Z였다. 요청 시각(09:04:09Z·09:13:47Z) 기준 각각 2시간 19분·2시간 29분 전이다. 06:45Z 뒤의 배치는 하나도 검색되지 않았으므로 측정 시점의 지연은 **2.3~2.5시간 이상**이다. 소개 글에는 갱신 주기 수치가 없다. basic_plan §3의 "15분 단위 갱신"은 GDELT 2.0 전반에 대한 설명이다.
- **최근 24시간 커버리지**: `sourcelang:korean` + `timespan=1d` 결과는 06:45Z 한 배치의 3건뿐이었다. 정상이라면 15분 배치 96개에 걸친 한국어 기사가 나와야 한다. `"Champions League"` 3일 결과도 같은 배치에서만 나왔다. 측정 시점의 DOC 색인은 사실상 최신 배치 하나만 검색되는 상태였다. 일시 장애인지 상시 상태인지는 이번 실측(약 13분)으로 가릴 수 없다.
- **한국어 매체**: 색인에서 확인한 한국어 매체는 hani.co.kr·biz.heraldcorp.com(종합지)이다. 허용 도메인 4개는 **색인 여부를 확인하지 못했다**(interfootball.co.kr 1개월 0건, 4개 도메인 OR 3일 0건). 다만 색인 희소와 겹쳐 있어 "색인하지 않는다"고 단정할 수는 없다.
- **한국어 키워드**: `이강인 sourcelang:korean` 1주 결과는 오류 문구 없는 200 `{}`이었다. 한글 키워드를 지원하는지도 색인 희소와 겹쳐 판단하지 못했다.

### 약관 (확인 2026-10-10)

- **GDELT Terms of Use** — https://www.gdeltproject.org/about.html
  > "all datasets released by the GDELT Project are available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee."
  >
  > "You may redistribute, rehost, republish, and mirror any of the GDELT datasets in any form."
  >
  > "However, any use or redistribution of the data must include a citation to the GDELT Project and a link to this website (https://www.gdeltproject.org/)."
  - 라이선스 이름(CC 등)은 적혀 있지 않다. 매체 기사 저작권에 대한 언급도 없다.
  - 판정: **허용(조건부)**. 조건은 GDELT 인용과 링크다. 켜게 되면 사이트(푸터·소개 페이지 또는 GDELT를 거친 카드)에 "뉴스 검색: The GDELT Project"와 https://www.gdeltproject.org/ 링크를 표기한다.
- **robots.txt** — https://api.gdeltproject.org/robots.txt 는 **404**(`text/html`, `Server: GDELT Server`)다. RFC 9309에서 404는 제한 없음으로 보므로 `robots_checked:true`다.
- **레이트 리밋 고지** — 429 본문의 "Please limit requests to one every 5 seconds … All high-traffic users should switch to our ngrams dataset". 우리 계획(하루 0~10쿼리)은 high-traffic이 아니다.
- **결과 기사 제목의 권리** — GDELT 약관은 GDELT "datasets"에 대한 이용 허락이다. 기사 제목·URL이 가리키는 원 저작물의 권리까지 넘겨주지는 않는다. 그래서 제목 게시는 매체 판정을 따라야 하고, 이 부분은 **D25 허용 목록(`allow`만 게시, 목록 밖 차단)이 그대로 처리한다.** Google News(M0-26)는 피드 고지가 결과 이용 자체를 금지했지만, GDELT 단계에 남는 조건은 인용·링크 표기뿐이다.
- **이미지** — `socialimage`는 쓰지도 저장하지도 않는다(CLAUDE §1-6).

### 판정·설계 권고

| 항목 | 판정 |
|---|---|
| GDELT 약관(원제목+링크 게시, `allow` 도메인만) | **허용(조건부)** — GDELT 인용 + 링크 |
| robots.txt | **제한 없음**(404) |
| 기술 안정성(레이트 리밋) | **부적합** — 성공률 32%, 간격을 늘려도 개선 없음 |
| 데이터 품질(색인·지연) | **부적합(측정 시점)** — 한국어 24시간 3건, 지연 2.3시간 이상 |
| 허용 목록 적용 후 실효성 | **0/5** — 구조적으로도 국내 4개 매체만 통과할 수 있고, 이 매체들은 이미 RSS로 받는다 |
| 종합 | **판정 기록용 등록·비활성**(`enabled:false` · `terms_checked:true` · `robots_checked:true`) |

**설계 권고**
1. **Source `gdelt-doc`** — `type: search`, `url` = DOC API 엔드포인트, `lang: "mul"`, `tier: 3`, `weight: 1`, `summarize:false`, `enabled:false`. 한국어·영어 소스로 나누지 않는다. GDELT는 소스 하나에서 쿼리마다 `sourcelang`만 바꾸면 된다(Google News가 hl·gl별로 나뉘던 것과 다르다). `note`에 약관 인용, robots 404, 실측 요약, 비활성 이유, 켤 때의 조건을 적었다.
2. **`configs/search-queries.json`** — **`maxEnabled: 10`**(M0-26 잠정 20에서 낮춤)
   - 근거: 성공 1건당 약 58초이므로 10개(약 10분)가 06:30~06:50 창에서 감당할 수 있는 상한이다. 영문 쿼리는 허용 목록상 통과 결과가 0건이라 늘릴 이유도 없다.
   - 초안 9개는 모두 `enabled:false`다. 허용 도메인 OR 1, 선수 3(예시, `player` slug 보류), 이적 3(영어·스페인어·이탈리아어 각 1, 빅클럽을 OR로 묶음), UCL 1(다국어), 대표팀 1(A매치 기간 ±3일만, FR-71)이다.
   - **하루 GDELT 쿼리 수는 0**(활성 0)이다.
   - 표기 규칙(제안): `q`에는 `sourcelang:`을 넣지 않는다. 어댑터가 `lang`(ko·en·es·it)을 GDELT 언어명(korean·english·spanish·italian)으로 바꿔 붙이고, `lang: "mul"`이면 언어 필터를 붙이지 않는다. `region`은 쓰지 않는다. GDELT `sourcecountry`는 FIPS 코드라 ISO와 다르다(한국 `KS` ≠ `KR`, 영국 `UK` ≠ `GB`).
3. **다시 켜는 기준**(재측정 후 사용자 결정). 다음 셋을 모두 충족하면 `gd-ko-allow-domains` 1개만 먼저 켠다.
   - ① 하루 1회 소량 재측정에서 7일 성공률 ≥ 80%
   - ② `sourcelang:korean` 24시간 결과가 수백 건 이상이고 최신 seendate 지연이 1시간 이하
   - ③ 허용 도메인 OR 쿼리가 1주 1건 이상
4. **M1 어댑터 메모**(켜는 경우. 지금 plan의 M1-06·M1-07)
   - 요청: 동시 1개, 응답 완료 후 6초 이상 간격.
   - **429를 받으면 그 실행의 GDELT 단계를 멈춘다.** 재시도 큐로 계속 밀어 넣지 않는다(백오프해도 창이 다시 열리지 않는다는 보고). 단계 전체 시간 예산(예: 8분)을 넘겨도 멈춘다. 429 횟수는 소스 건강도(FR-11)에 기록한다.
   - 기간은 `timespan` 대신 `startdatetime`·`enddatetime`(직전 성공 실행부터 지금까지, 최대 36시간, FR-07)으로 준다.
   - 응답은 상태 코드부터 확인한다(429는 텍스트 본문). 200 `{}`은 0건으로 처리하고, `articles`는 zod로 파싱한다.
   - 판정은 `url` 호스트에 `isSearchResultAllowed`를 적용한다(`domain` 필드를 쓰지 않는다). 목록 밖 도메인의 빈도는 `data/cache/`에 쌓는다.
   - **표시 제목에 GDELT `title`을 쓰지 않는다.** 같은 정규화 URL이 RSS에 있으면 RSS 제목을 쓰고, 없으면 `allow` 도메인 기사의 og:title을 쓴다(OG 메타 경량 크롤링, 그 매체의 기사 경로 robots 확인 후).
   - `seendate`는 "처음 본 시각"(15분 단위)이다. 게시 시각이 필요하면 og 메타의 `article:published_time`을 우선한다. `socialimage`·`url_mobile`은 경계에서 버린다.
   - 사이트에 GDELT 인용과 링크를 표기한다(약관 조건).
5. **실효성이 낮을 때의 대안**
   - (a) **GDELT 없이 운영(추천)**: 뉴스 검색 단계를 생략한다. 한국어 보도는 국내 RSS 5개 피드가, 해외 소식은 원제목 소스 9개가 맡는다. 지금 허용 목록에서 GDELT가 보탤 수 있던 몫이 원래 작았으므로 잃는 것이 거의 없다.
   - (b) `domain:` 필터 쿼리로 허용 도메인만 조회: 쿼리 1개로 4개 도메인을 덮는 가장 효율적인 설계다(초안 `gd-ko-allow-domains`). 하지만 실측이 0건(3일·1개월)이라 지금은 효과가 없다. 재측정 기준 ③으로 다시 본다.
   - (c) GDELT 대량 파일(GKG 2.0 15분 파일·Web NGrams 3.0): 429는 없다. 대신 하루 96개 파일을 받아 로컬에서 매칭해야 해서 파이프라인 시간과 복잡도가 늘고, 새 데이터 경로라 사용자 승인 사항이다. 허용 목록 한계도 그대로라 **비권고**.
   - (d) NewsData.io 같은 다른 검색 API: 새 외부 서비스이고 매체 약관 상속 문제가 같다. **비권고**(M0-26 B2 메모와 같은 판단).
   - (e) 해외 매체로 허용 목록 넓히기: 실효성의 근본 병목이다. 다만 M0-23·M0-24 결과로 보아 매체 단위 허용 근거가 나올 가능성은 낮다.

**권고안 검증**(`node --import tsx`, 스키마는 `src/lib/schema/*`, 교차 참조는 `scripts/lib/validate-crossref.ts`)
- 권고안 `SourceSchema.array()` **통과(1개)**. 기존 25개와 합친 26개도 `SourcesFileSchema` **통과**(id 중복 없음).
- `SearchQueriesFileSchema` **통과**(쿼리 9 · 활성 0 · 상한 10).
- 교차 참조 `checkSearchQuerySources` **통과**(9개 모두 type `search` 소스 `gdelt-doc`을 가리킴). 합친 소스 기준 `checkPublisherDomainSources`도 **통과**.
- 음성 대조: rss 소스를 가리키게 바꾸면 오류 1건, 활성 11개 > 상한 10이면 오류 1건으로 잡혔다.
- 합친 뒤에도 수집 대상(`enabled && terms_checked`)은 14개, LLM 요약 대상은 0개 그대로다.

**후속 반영 대상**(사용자 확인 후 오케스트레이터가 반영한다. 이 작업에서는 고치지 않았다)
- `configs/sources.json`에 `gdelt-doc` 추가(→ 26개), `configs/search-queries.json` 신설. fixture `fixtures/schema/configs/search-queries.json`(`google-news-ko/en` id 사용)을 GDELT 예시로 바꿀지도 함께 정한다.
- PRD: FR-02·§15 D25에 GDELT 실측 결과(비활성)를 반영한다. GDELT를 켜면 NFR-09 출처 표기에 GDELT 인용을 넣는다. §13 위험 표에 "GDELT 레이트 리밋·색인 희소"를 추가한다.
- plan: M1-06·M1-07(GDELT 어댑터)을 비활성 기간에 미룰지 정한다. CLAUDE §13 미결의 "GDELT 이용 조건"은 해결로 바꾼다(약관 허용·기술 부적합).

### 사용자 확인 질문 — 2026-10-10 답변 완료

> 답변(오케스트레이터 결정, 기존 사용자 결정 선례): 1 → (A) 판정 기록용 등록·비활성 · 2 → (A) 지금 생성, `maxEnabled` 10·쿼리 9개 전부 비활성 · 3 → (A) M1 7일 관찰 기간에 하루 1회 소량 재측정 후 재결정. 자세한 내용은 위 "결정 (2026-10-10)".

1. **GDELT 판정과 등록 방식**
   - (A) **판정 기록용으로 등록하고 비활성으로 둔다(추천)** — `gdelt-doc`을 `enabled:false` · `terms_checked:true` · `robots_checked:true`로 등록한다(`sportalkorea-all` 선례: 약관 통과, 기술 부적합). 뉴스 검색 단계는 당분간 쓰지 않고, M1-06·M1-07 어댑터 구현은 다시 켤 때까지 미룬다.
   - (B) 켜되 허용 도메인 OR 쿼리 1개만 돌린다 — 하루 1~3요청이라 부담은 작다. 하지만 실측 0건이고 429가 잦아 소스 건강도 이슈(3일 연속 0건, FR-11)가 거의 매일 생긴다. 얻는 것이 거의 없다.
   - (C) 등록하지 않고 문서에만 남긴다 — 설정 파일은 단순해진다. 대신 `search-queries.json`이 가리킬 search 소스가 기록용 Google News뿐이라 초안도 만들 수 없다.
2. **`configs/search-queries.json`과 `maxEnabled`**
   - (A) **지금 만든다. `maxEnabled: 10`, 쿼리 9개는 모두 비활성(추천)** — 측정 처리량(성공 1건당 약 58초) 기준 상한이다. `npm run validate` 교차 참조 1번이 실제 파일로 동작한다.
   - (B) `maxEnabled: 20`을 유지한다(M0-26 잠정) — 허용 목록이 넓어질 때를 대비한 값이다. 다만 측정 처리량으로는 06:50 창 안에 끝나지 않는다.
   - (C) 만들지 않는다 — GDELT를 다시 켤 때 함께 만든다.
3. **재측정**
   - (A) **M1의 7일 발행 관찰 기간에 하루 1회 소량 재측정(추천)** — 쿼리 2개(`sourcelang:korean` 1d, 허용 도메인 OR 1d), 하루 직접 요청 3건 이내, 개발자가 수동으로 실행한다. 레이트 리밋과 색인 희소가 일시 장애인지 가리고, 위 "다시 켜는 기준"으로 다시 결정한다.
   - (B) 재측정하지 않고 GDELT를 닫는다 — 뉴스 검색 없이 RSS만으로 운영한다. 허용 목록이 넓어지면 그때 다시 조사한다.
   - (C) GKG 대량 파일이나 다른 검색 API를 조사한다 — 새 데이터 경로·외부 서비스라 승인 사항이고, 허용 목록 한계가 같아 기대 효과가 작다.

## M0-28 football-data.org

> 상태: **⏳ 조사 완료 — 사용자 확인 대기.** 약관 판정은 **조건부 허용**(LLM 입력·재가공을 막는 조항 없음, 조건은 출처 표기 문구 등)이라 **plan §14 B7은 발동하지 않는다.** `configs/competitions.json`은 scratchpad 초안만 만들었다. 스키마 검증은 통과했지만 저장소에는 쓰지 않았다(이유는 아래 "competitions.json 초안"). 결정이 필요한 것은 아래 "사용자 확인 질문" 3개다.

대상: football-data.org API v4 무료 플랜(TIER_ONE). 6개 대회 `PL`·`PD`·`SA`·`BL1`·`FL1`·`CL`의 2026-27 시즌 응답과 약관을 확인했다.
요청 범위: 2026-10-10 12:20:31~12:28:08 UTC(21:20~21:28 KST)에 **직접 요청 30건**을 보냈고 결과는 **전부 200**이었다(403·429·5xx·네트워크 오류 0건). 다음 요청은 앞 요청의 응답이 끝나고 **6.5초 이상** 지난 뒤 보냈다. 키는 `node --env-file-if-exists=.env.local` 프로세스 환경에서만 읽어 `X-Auth-Token` 헤더로 보냈다. 키 값은 로그·파일·문서 어디에도 남기지 않았다. 약관·요금·문서·UEFA 일정은 WebFetch 18회(404 2회 포함)와 웹 검색 10회로 확인했다. 원본 응답은 scratchpad에만 저장했다(아래 "M0-35 fixtures용 원본 위치").

### 요약 (먼저 읽기)
1. **6개 대회 모두 무료 플랜으로 순위·경기·득점 순위를 받을 수 있다.** 현재 시즌은 6개 모두 2026(2026-27)이다. 리그 순위표는 20·20·20·18·18팀이고, **UCL은 리그 페이즈 36팀 단일 테이블**이다(`stage: LEAGUE_STAGE`, `group: "League phase"`). 시각은 모두 UTC `Z` 형식(524/524건)이고 `src/lib/time.ts`로 KST 변환이 맞는 것을 확인했다.
2. **무료 플랜에는 경기별 득점자가 없다.** 경기 상세(`/v4/matches/{id}`)에 `goals`·`bookings`·`lineups` 필드가 없다. 요금표는 "Goal scorers"를 **Free + Deep Data(€29/월)부터** 제공한다고 적고 있다. 대회 득점 순위(`/scorers`)는 무료다(기본 10명, `limit`으로 늘릴 수 있음). → D24 브리핑의 "득점자" 입력은 그대로 얻을 수 없다(사용자 확인 질문 2).
3. **순위표 `form`은 6개 대회 모두 `null`이다**(유료 "Advanced trend/form data"). 순위표 종류도 `TOTAL`뿐이다(홈·원정 표 없음). `prevPos`도 응답에 없다. → 폼·순위 변동·홈/원정 성적은 **경기 목록과 전날 데이터로 코드에서 계산**해야 한다. 계산 시험은 통과했다.
4. **06:30 KST 수집 시점에는 경기가 아직 진행 중일 수 있다.** 순위표는 진행 중인 경기 점수까지 반영한다(실측: Arsenal–Leeds 진행 중 0:0이 순위표에 "1무"로 들어감). 유럽 겨울 시간(2026-10-25~2027-03-28)에는 현지 20:45~21:00 킥오프가 **06:30 KST에 끝나지 않는다.** UCL 리그 페이즈 144경기 중 **74경기(51%)**가 20:00Z 킥오프(05:00 KST 시작, 06:55 KST 무렵 종료)다. → "전날 경기 결과" 브리핑을 설계할 때 반영해야 한다(사용자 확인 질문 1).
5. **약관(D24 핵심): 조건부 허용.** 약관(General Terms and Conditions, 2018-06-01 시행)에는 AI·머신러닝·가공·파생물·재배포·캐싱·상업적 이용에 관한 조항이 **하나도 없다**. 의무는 셋이다. ① 앱·웹사이트에 **"Football data provided by the Football-Data.org API"** 문구를 보이는 곳에 표기 ② API 키 1개는 애플리케이션 1개(웹은 도메인 1개)에만 사용 ③ 구독을 해지한 뒤에는 데이터를 참조하지 않는다. 로고·사진은 저작권 대상이라 따로 허가가 필요하다(우리는 쓰지 않는다). → **B7 미발동**, 일일 브리핑 LLM 입력으로 쓸 수 있다.
6. **레이트 리밋 설계**: 하루 수집은 대회당 순위·경기·득점 3건으로 **18건**이면 된다. 요청 간격 6.5초에 응답 0.8~1.9초를 더하면 건당 약 8초, **합계 약 2.5분**이라 06:30~06:50 창에 넉넉히 들어간다. 카운터는 첫 요청부터 60초 고정 창으로 동작했다. 6.5초 간격이면 한 창에 8건 이하라 한도(10)에 닿지 않는다.

### 엔드포인트별 결과 (2026-10-10 실측)

**대회 정보 `/v4/competitions/{code}`** (6건, 모두 200)

| 내부 ID | 코드 | football-data 대회 id | 현재 시즌 id | startDate | endDate | currentMatchday | 비고 |
|---|---|---|---|---|---|---|---|
| EPL | PL | 2021 | 2502 | 2026-08-21 | 2027-05-30 | 6 | 시즌 경기 목록의 첫·마지막 경기일과 일치(실측) |
| LALIGA | PD | 2014 | 2518 | 2026-08-16 | 2027-05-30 | 8 | |
| SERIEA | SA | 2019 | 2494 | 2026-08-23 | 2027-05-30 | 6 | |
| BUNDESLIGA | BL1 | 2002 | 2522 | 2026-08-28 | 2027-05-22 | 5 | |
| LIGUE1 | FL1 | 2015 | 2497 | 2026-08-22 | 2027-05-29 | 6 | 2차 출처에는 "8월 21일 개막"이라는 서술이 있다. API 값을 따른다 |
| UCL | CL | 2001 | 2557 | 2026-09-08 | **2027-01-27** | 2 | **endDate가 리그 페이즈 마지막 날이다.** 결승(2027-06-05)이 아니다. 시즌 경기 목록도 리그 페이즈 144경기뿐이고 녹아웃 경기는 아직 없다 |

- `season` 파라미터는 시작 연도(`"2026"`)를 쓴다. 응답 `filters.season`이 `"2026"`이었다(`SeasonSchema`와 같은 값). 시즌 id(2502 등)는 우리 설정에 필요 없다.
- 순위·경기 응답에도 같은 `season` 객체(id·startDate·endDate·currentMatchday)가 들어 있다. **매일 `/competitions/{code}`를 부를 필요는 없다**(시즌 전환 `/new-season` 때만 확인).

**순위 `/v4/competitions/{code}/standings`** (6건, 모두 200)

| 코드 | standings 수 | stage / type / group | 행 수 | 경기 수(최소~최대) | `form` | 홈·원정 표 |
|---|---|---|---|---|---|---|
| PL | 1 | REGULAR_SEASON / TOTAL / "Matchday" | 20 | 5~6 | 20행 모두 null | 없음 |
| PD | 1 | REGULAR_SEASON / TOTAL / "Matchday" | 20 | 6~8 | 모두 null | 없음 |
| SA | 1 | REGULAR_SEASON / TOTAL / "Matchday" | 20 | 5 | 모두 null | 없음 |
| BL1 | 1 | REGULAR_SEASON / TOTAL / "Matchday" | 18 | 4~5 | 모두 null | 없음 |
| FL1 | 1 | REGULAR_SEASON / TOTAL / "Matchday" | 18 | 5~6 | 모두 null | 없음 |
| CL | 1 | **LEAGUE_STAGE / TOTAL / "League phase"** | **36** | 1 | 모두 null | 없음 |

- 행 필드: `position`·`team{id,name,shortName,tla,crest}`·`playedGames`·`form`·`won`·`draw`·`lost`·`points`·`goalsFor`·`goalsAgainst`·`goalDifference`.
- 일관성 검사(6대회 132행): W+D+L = 경기 수, 승점 = 3W+D, 득실 = GF−GA가 모두 맞았다.
- **진행 중 경기 반영**: PL 순위표를 같은 시각의 FINISHED 경기로 다시 계산해 보니 Arsenal·Leeds 두 팀만 1경기씩 차이가 났다. 요청 시점에 진행 중(`IN_PLAY` 0:0)이던 경기가 순위표에 무승부로 들어가 있었다. UCL은 차이 0이었다.

**경기 `/v4/competitions/{code}/matches?dateFrom=2026-10-07&dateTo=2026-10-13`** (6건, 모두 200)

| 코드 | 건수 | 실제 범위(resultSet) | status | 비고 |
|---|---|---|---|---|
| PL | 10 | 10-10~10-12 | IN_PLAY 1 · TIMED 9 | 10-07~09 경기 없음 |
| PD | 10 | 10-09~10-12 | FINISHED 1 · IN_PLAY 1 · TIMED 8 | Málaga 1:1 Espanyol |
| SA | 10 | 10-10~10-12 | TIMED 10 | |
| BL1 | 9 | 10-09~10-11 | FINISHED 1 · TIMED 8 | Dortmund 2:2 Bremen |
| FL1 | 9 | 10-09~10-11 | FINISHED 1 · TIMED 8 | Lens 2:1 Lyon |
| CL | 9 | 10-13 | TIMED 9 | 리그 페이즈 MD2(10-13·14) 첫날 |

- 경기 필드: `id`·`utcDate`·`status`·`matchday`·`stage`·`group`·`lastUpdated`·`homeTeam`·`awayTeam`·`score{winner,duration,fullTime,halfTime}`·`odds`·`referees`(+ `area`·`competition`·`season`). 경기 상세에만 `venue`가 더 있다(실측은 null).
- `odds`는 `{"msg":"Activate Odds-Package in User-Panel to retrieve odds."}`이다(유료 부가 상품).
- **진행 중 경기도 점수가 나온다**: `IN_PLAY`일 때 `score.fullTime`은 현재 점수(0:0)이고 `winner`는 `"DRAW"`다. FINISHED처럼 보이지 않도록 어댑터가 status로 걸러야 한다.
- 시즌 전체(`/competitions/PL/matches`·`/competitions/CL/matches`, 필터 없음): PL 380경기(368KB) · CL 144경기(139KB). 본 기간에 POSTPONED·SUSPENDED·CANCELLED·AWARDED는 0건이었다. **먼 미래 경기도 `TIMED`인데 시각은 임시값이다.** PL MD13은 10경기 모두 2026-12-02T20:00Z, MD14·MD30·MD38은 모두 15:00Z다. → `TIMED`만 보고 "시각 확정"이라고 판단할 수 없다(F8·.ics는 매일 갱신값을 쓴다).
- 상태 값 전체(문서 Lookup Tables): `SCHEDULED | TIMED | IN_PLAY | PAUSED | EXTRA_TIME | PENALTY_SHOOTOUT | FINISHED | SUSPENDED | POSTPONED | CANCELLED | AWARDED`. `score.duration`: `REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT`.
- **승부차기 경기는 `fullTime`에 승부차기 골이 포함된다**(문서 "Dealing with overtime and penalty shootout"의 예: fullTime 7:6 = regularTime 1:1 + extraTime 0:0 + penalties 6:5). 이때는 `regularTime`·`extraTime`·`penalties` 노드가 따로 붙는다.

**교차 대회 `/v4/matches`** (2건, 200) — 쓰지 않기를 권고한다

| 요청 | 결과 |
|---|---|
| `?dateFrom=2026-10-09&dateTo=2026-10-13` (대회 지정 없음) | 90경기, `filters.permission: "TIER_ONE"` — 무료 12개 대회 중 경기가 있는 9개(BSA·PPL·DED·ELC 포함)가 섞여 온다. 마지막 경기 2026-10-13T00:00Z |
| `?competitions=PL,PD,SA,BL1,FL1,CL&dateFrom=2026-10-09&dateTo=2026-10-13` | 48경기(BL1·FL1·PD·PL·SA). **10-13의 CL 9경기가 빠졌다.** 마지막 경기 2026-10-12T19:00Z |

- 같은 `dateTo`를 줘도 결과가 다르다. 대회별 엔드포인트는 **dateTo 날짜를 하루 끝까지 포함**한다(CL 10-13 19:00Z 포함). 교차 엔드포인트는 사실상 **dateTo 00:00Z까지만** 포함한다. 응답 시간도 3.3~5.2초로 대회별(0.8~1.9초)보다 길다.
- → 어댑터는 **대회별 엔드포인트만 쓴다**(대회 단위 실패 격리와도 맞다). 교차 엔드포인트를 쓰면 dateTo를 하루 늘려야 한다.

**경기 상세 `/v4/matches/564706`** (1건, 200 — Málaga 1:1 Espanyol, FINISHED)
- 키: `area`·`competition`·`season`·`id`·`utcDate`·`status`·`venue`·`matchday`·`stage`·`group`·`lastUpdated`·`homeTeam`·`awayTeam`·`score`·`odds`·`referees`. **`goals`·`bookings`·`substitutions`·`lineups`가 없다**(무료 플랜). 403이 아니라 필드가 빠진 채 200으로 온다.

**득점 순위 `/v4/competitions/{code}/scorers`** (7건, 200)

| 코드 | 기본 건수 | 1위 | assists null | penalties null | 비고 |
|---|---|---|---|---|---|
| PL | 10 (`filters.limit: 10`) | Erling Haaland 5골 | 5/10 | 7/10 | `?limit=50` → 50명(30KB), 1골 선수까지 내려감 |
| PD | 10 | Raphinha 12골 | 4/10 | 6/10 | |
| SA | 10 | Donyell Malen 6골 | 8/10 | 8/10 | |
| BL1 | 10 | Michael Olise 4골 | 5/10 | 10/10 | |
| FL1 | 10 | Amine Gouiri 4골 | 6/10 | 4/10 | |
| CL | 10 | Ermedin Demirovic 3골 | 8/10 | 9/10 | |

- 행 필드: `player{id,name,firstName,lastName,dateOfBirth,nationality,section,position,shirtNumber,lastUpdated}`·`team{…,clubColors,venue,website,founded…}`·`playedMatches`·`goals`·`assists`·`penalties`. `playedMatches`는 null이 0건이다.
- **assists·penalties의 `0`은 한 번도 나오지 않았다**(PL 50명 기준 assists null 30·0은 0건). null이 "0"인지 "미집계"인지 응답만으로는 가릴 수 없다. → 스키마대로 **null을 유지**하고 0으로 바꾸지 않는다(FR-22, 입력에 없는 사실 금지).
- `limit`은 문서상 1~500이다(Lookup Tables "Filters").
- 팀 객체의 `clubColors`(예: "Sky Blue / White")는 색 이름 텍스트라 hex 팀 컬러(`configs/team-colors.json`)에는 바로 쓸 수 없다. 참고용이다.

**팀 규모 (팀 페이지 FR-50)**
- 5대 리그 **96팀**(20+20+20+18+18, 중복 없음) + UCL 36팀 중 5대 리그 소속 21팀(PL 5·PD 5·SA 4·BL1 4·FL1 3) → **UCL 전용 15팀**(Sporting CP·AEK·Shakhtar·Fenerbahçe·PSV·Club Brugge·Slavia Praha·LASK·Galatasaray·Viking·Porto·Feyenoord·Sabah·Slovan Bratislava·Bodø/Glimt) → **고유 팀 111개**(정적 페이지 111개).
- **TLA는 고유하지 않다**: `BRE`(Brentford·Brest), `FCB`(Barça·Bayern). Bodø/Glimt의 TLA는 `FK`(2자)다. → 팀 slug와 배지 약어(`team-colors.json` `short`)를 TLA로 자동 생성하면 안 된다. **football-data 팀 id → slug 대응**으로 관리한다.
- 비ASCII 이름(Barça·Alavés·Málaga·1. FC Köln·Fenerbahçe·Bodø/Glimt)이 있다. slug는 NFKD 정규화 후 kebab으로 만들고(ø 별도 처리), 한 번 정하면 바꾸지 않는다.
- 엠블럼·크레스트·국기 URL은 모두 `crests.football-data.org`다. **경계에서 버린다**(CLAUDE §1-6, 약관 9.2).

### 무료 플랜 제한 (6개 대회에서 403은 0건 — 제한은 "필드 누락"으로 나타난다)

| 항목 | 무료(TIER_ONE) | 근거 | 우리 대응 |
|---|---|---|---|
| 대상 대회 | 12개(우리 6개 포함) | 요금표 "12 competitions", 응답 `permission: TIER_ONE` | — |
| 호출 한도 | **10회/분** | 요금표 "10 calls/minute", 문서 API policies | 6.5초 간격 |
| 점수 | **"Scores delayed"** (지연 폭은 문서에 없음) | 요금표 | 06:30 KST 시점 status 분포를 M1 관찰 기간에 기록 |
| 일정 | "Fixtures" · **"Schedules delayed"** | 요금표 | 매일 갱신 |
| 순위표 | TOTAL만, `form` null | 실측 | 폼·홈/원정 코드 계산 |
| 경기별 득점자·카드·라인업·교체 | **없음**(Free + Deep Data €29/월부터) | 요금표 "Goal scorers", "Line-ups & Subs", 실측(상세에 필드 없음) | 질문 2 |
| 스쿼드 | 없음(Deep Data부터) | 요금표 "Squads" | 주요 선수는 득점 순위로(FR-54) |
| 폼·트렌드 | 없음(ML Pack Light €29/월부터 "Advanced trend/form data") | 요금표 | 코드 계산 |
| 배당 | 없음 | 응답 `odds.msg` | 버림 |
| 득점 순위 | **있음**(기본 10, `limit` ≤ 500) | 실측·문서 | FR-41·FR-52 |

### 내부 스키마 매핑 (`src/lib/schema/competition.ts`)

시험 변환 스크립트(`scratchpad/m0-28/scripts/map-check.ts`)로 6개 대회 응답을 `CompetitionFileSchema`에 넣어 봤다. **6/6 통과**했다. PL·CL은 시즌 전체 경기로 폼까지 계산했고 순위표 팀과 경기·득점 팀의 slug가 모두 맞았다. 샘플 결과는 `scratchpad/m0-28/mapped-PL.sample.json`에 있다.

**StandingRow**

| 내부 필드 | football-data | 변환 |
|---|---|---|
| `pos` | `position` | 그대로 |
| `prevPos` | **없음** | **전날 `data/competitions/{comp}.json`의 같은 팀 `pos`와 비교해 우리가 계산한다**(M2-03). 첫 수집일은 null |
| `team` | `team.id`(+`name`) | football-data 팀 id → slug 대응표(TLA 사용 금지) |
| `played` | `playedGames` | 그대로 |
| `w`·`d`·`l` | `won`·`draw`·`lost` | 그대로 |
| `gf`·`ga` | `goalsFor`·`goalsAgainst` | 그대로(`goalDifference`는 버림 — 계산 가능) |
| `pts` | `points` | 그대로 |
| `form` | `form` = **항상 null** | **코드 계산**: 같은 대회 FINISHED 경기 중 그 팀의 최근 5경기 W/D/L(시즌 전체 경기 목록 필요). 칩 순서(최신이 앞/뒤)는 D1에서 정한다 |
| `zone` | 없음 | `configs/competitions.json` `zones` 규칙으로 코드 계산, 규칙 밖은 `none` |

**Match**

| 내부 필드 | football-data | 변환 |
|---|---|---|
| `id` | `id`(정수) | 문자열. 제안: `fd-560593` — API-Football 폴백(FR-45 provider 전환)과 겹치지 않게 접두어를 붙인다 |
| `comp` | `competition.code` | PL→EPL · PD→LALIGA · SA→SERIEA · BL1→BUNDESLIGA · FL1→LIGUE1 · CL→UCL |
| `round` | `matchday`·`stage` | 리그·UCL 리그 페이즈는 matchday 숫자, 녹아웃은 stage(PLAYOFFS·LAST_16…). 표시 문자열은 코드에서 만든다 |
| `kickoff` | `utcDate` | 그대로(`2026-10-11T15:30:00Z` — 초 포함 `Z`, `IsoSchema` 통과 524/524) |
| `home`·`away` | `homeTeam.id`·`awayTeam.id` | slug. 녹아웃 대진 미정 팀은 null로 올 수 있다(이번 응답에는 없음 — M2-02에서 처리 방식을 정한다) |
| `score` | `score.fullTime{home,away}` | `finished`일 때만 값, 나머지는 null. `duration: PENALTY_SHOOTOUT`이면 fullTime에 승부차기 골이 들어 있으므로 **`regularTime + extraTime`을 쓴다.** 승부차기 스코어를 둘 자리는 스키마에 없다(UCL 녹아웃 표시 — M2·D1 확인 사항) |
| `status` | `status` | `SCHEDULED`·`TIMED` → scheduled · `FINISHED`·`AWARDED` → finished · `POSTPONED`·`SUSPENDED`·`CANCELLED` → postponed · `IN_PLAY`·`PAUSED`·`EXTRA_TIME`·`PENALTY_SHOOTOUT` → **scheduled + score null**(진행 중 점수는 쓰지 않는다) |
| (버림) | `odds`·`referees`·`halfTime`·crest·emblem·flag | — |

**Scorer**

| 내부 필드 | football-data | 변환 |
|---|---|---|
| `player` | `player.name` | 영문 원문 그대로(표시할 때 names.ko로 치환, FR-24) |
| `team` | `team.id` | slug |
| `goals` | `goals` | 그대로 |
| `assists` | `assists` | null 유지(0으로 바꾸지 않는다) |
| `penalties` | `penalties` | null 유지 |
| `played` | `playedMatches` | 그대로 |

**KST 표시 확인** (`src/lib/time.ts` `formatKst`·`kstDate`·`zonedParts`, 실행 결과)

| 경기 | utcDate | 현지 시각 | KST 표시 |
|---|---|---|---|
| PL Liverpool–Man City | 2026-10-11T15:30:00Z | 런던 16:30(BST) | 10월 12일 (월) 00:30 |
| CL Inter–Club Brugge | 2026-10-13T19:00:00Z | 로마 21:00(CEST) | 10월 14일 (수) 04:00 |
| PD Málaga–Espanyol | 2026-10-09T19:00:00Z | 마드리드 21:00(CEST) | 10월 10일 (토) 04:00 |
| PL Chelsea–Man United (서머타임 종료 후) | 2026-10-31T12:30:00Z | 런던 12:30(GMT) | 10월 31일 (토) 21:30 |

### 06:30 KST 수집 시점의 미종료 경기 (브리핑 설계 입력)

- 06:30 KST = 전날 21:30 UTC다. 경기는 킥오프부터 약 115분 걸리므로 **19:35Z 이후 킥오프는 수집 시점에 끝나지 않았을 가능성이 크다.** 여기에 무료 플랜 점수 지연("Scores delayed")이 더해진다.
- 시즌 경기 목록 기준: PL 380경기 중 **43경기**(20:00·20:15Z 킥오프 — 겨울 금·월요일 밤·주중 라운드, 먼 라운드의 임시 시각 포함), UCL 리그 페이즈 144경기 중 **74경기**(20:00Z = 21:00 CET, MD4~MD8)가 해당한다. 라리가·세리에A·리그1의 겨울 20:45/21:00 CET 경기(19:45/20:00Z)도 같다. 서머타임 기간(~10-24, 2027-03-28~)에는 같은 현지 시각이 1시간 이르므로 대부분 끝나 있다.
- 순위표는 진행 중 점수를 반영한다(위 실측). 수집 시점의 순위표를 "현재 순위"로 브리핑에 넣으면 **확정되지 않은 사실**이 된다.
- 설계 권고(코드, LLM 비용 0): ① 브리핑 대상 경기는 "KST 전날 날짜"가 아니라 **"직전 브리핑 이후 `FINISHED`가 된 경기"**로 잡고, 미종료 경기는 다음 날로 넘긴다. ② 해당 대회에 `IN_PLAY`·`PAUSED` 경기가 있으면 그 대회의 순위 문장은 생략한다(대회 페이지 순위표에는 갱신 시각만 표기). → 운영 방식은 사용자 확인 질문 1.

### 레이트 리밋 설계

**관측한 카운터 동작**
- 응답 헤더: `X-API-Version: v4` · `X-Authenticated-Client`(등록 계정명 — **로그에 남기지 않는다**) · `X-Requests-Available-Minute` · `X-RequestCounter-Reset`. 문서(Lookup Tables)의 헤더 이름은 `X-RequestsAvailable`이지만 실제로 받은 이름은 `X-Requests-Available-Minute`다.
- **60초 고정 창**이다. 창의 첫 요청에서 `Reset: 60`·`Available: 9`이고, 그 뒤 Reset은 남은 초를 세고 Available은 1씩 준다(예: #1 9/60 → #8 3/7 → #9 9/60). 응답 완료 후 6.5초 간격(실제 약 7.5초 주기)이면 한 창에 **최대 8건**이라 한도 10에 닿지 않았다.
- 응답 시간: 대회별 엔드포인트 0.8~1.9초(시즌 전체 PL 368KB도 1.5초), 교차 `/v4/matches` 3.3~5.2초.

**하루 호출 수**

| 단계 | 호출 | 건수 |
|---|---|---|
| M1-44 최소 어댑터(브리핑 입력) | 대회별 `standings` + `matches?dateFrom={D-2}&dateTo={D}`(전날 KST 창 + 이월분 여유) | 12 |
| (질문 2에서 B를 고르면) | 대회별 `scorers?limit=200` | +6 → 18 |
| M2-02 전체 어댑터(대회·팀 페이지) | 대회별 `standings` + `matches`(시즌 전체, 필터 없음 — 결과·일정·폼·홈/원정 계산을 한 번에) + `scorers?limit=…` | **18** |
| 시즌 정보 | `/competitions/{code}` — `/new-season`·주 1회만 | 0(일일) |

- 18건 × 약 8초 ≈ **2.4분**(최악 응답 2초 가정 시 약 2.6분). 06:30 트리거 직후 RSS 수집과 **병렬**로 돌리면(호스트가 다름) 06:33 무렵 끝난다. 06:50 배치 마감까지 여유가 15분 이상 남는다. 하루 데이터량은 약 1.5MB(시즌 전체 6개 대회)다.

**요청·재시도 정책(권고 — M1-44·M2-02 구현용)**
1. 동시 1개, **앞 응답 완료 후 6.5초 대기**. 그리고 `X-Requests-Available-Minute ≤ 1`이면 `X-RequestCounter-Reset + 1`초를 기다린다(헤더 가드).
2. **429**: 문서는 "You exceeded your allowed requests per minute/day…"라고만 적고 본문 예시가 없다(실측에서도 일부러 만들지 않았다). `X-RequestCounter-Reset`가 있으면 그 값 + 1초, 없으면 61초를 기다린 뒤 **같은 요청을 1회만 재시도**한다. 다시 실패하면 그 대회 단계를 실패로 처리한다.
3. **5xx·네트워크 오류·타임아웃(15초)**: 10초 후 1회 재시도.
4. **403**(문서: 유료 전용 등 "not available for you") · **400**(필터 형식 오류): 재시도하지 않는다. `{message, errorCode}` 또는 `{error}` 본문을 상태 코드와 함께 로그에 남기고 이슈를 만든다.
5. 대회 단위로 실패를 격리한다. M2는 전일 데이터를 유지하고 "업데이트 지연"을 표시한다(M2-02). M1-44는 그 대회를 브리핑 입력에서 뺀다(전부 실패하면 브리핑 생략 — 뉴스는 발행).
6. football-data 단계 전체 시간 예산은 **6분**이다. 넘으면 남은 대회를 실패로 처리한다.
7. 키는 1개라 개발 실행과 봇이 같은 분당 한도를 나눠 쓴다. **06:25~06:45 KST에는 개발 중 수동 호출을 하지 않는다.**
8. 응답은 경계에서 zod로 파싱한다(`.passthrough` 없이 필요한 필드만 — crest·odds·referees는 스키마에 넣지 않아 자동으로 버려진다).

### 약관 판정 (D24 핵심) · B7

확인 날짜: 2026-10-10. 약관 원문은 별도 URL이 없고 **가입 화면과 About 페이지 하단에 같은 "General Terms and Conditions"**(12.1: 2018-06-01 시행)가 실려 있다. `https://www.football-data.org/terms`·`/documentation/policies`는 404였다.

| 조항 | 인용(짧게) | 의미 |
|---|---|---|
| 1.1 수락 | "By signing-up for the Service, the Customer accepts these General Terms and Conditions in full" | 가입 시 동의(이미 가입함) |
| 2.3 앱 1개 | "The API Key applies to a single Application, in its web and/or mobile form and on any platform (i.e. for the web Application: the Subscription applies to a single domain name)." | 키 1개 = 사이트 1개(`sguys99.github.io/euro-digest`). 개발 실행은 같은 애플리케이션의 개발이다 |
| 3.1·3.3 공정 이용 | "Customers who subscribe to the Service must adhere to Service Provider's Fair Usage Policy." · "The Service Provider will monitor the Customer's usage…" | 하루 18건이면 문제없다. 별도의 Fair Usage Policy 문서는 찾지 못했다 |
| 6.1 자격 증명 | "Developer credentials may not be stored in code repositories of open source projects." | 공개 저장소에 키 금지 → Actions Secrets(CLAUDE §1-8과 같음) |
| **7.1 출처 표기** | "You agree to include the following attribution to Football-Data in your app or website:" "**Football data provided by the Football-Data.org API**"(이어서 푸터나 소개 섹션에 둘 수 있다는 취지) | **필수 조건.** 사이트 푸터(또는 소개 페이지) + FR-45 대회 페이지 하단에 이 문구를 그대로 둔다. 브리핑 옆 출처 표기에도 쓴다 |
| 8.x 보증 없음 | "The Service Provider goes to great lengths to ensure the accuracy, correctness and reliability of the Services, …"(보증하지 않는다는 취지로 이어짐) | 오류 데이터 책임은 우리에게 있다 → 검증 게이트(FR-151) |
| **9.1 해지 후** | "After cancellation of the subscription to the Service, the Customer is not permitted to reference the football data (incl. match fixtures, results, league tables, player/squad data, top scorers) obtained through the Football-Data API" … "on their own site or service." | 계정을 해지하거나 다른 소스로 옮기면 **사이트에서 football-data 출처 데이터를 내려야 한다.** 공개 저장소의 git 이력에 남은 `data/competitions/*.json`은 지울 수 없다 → 위험 메모 |
| 9.2 이미지 | "All graphics, including team logos and profile photos, are copyrighted by their legal owner." | crest·emblem 미사용(CLAUDE §1-6)과 같다 |
| 10.1 준거법 | 네덜란드법 | — |

- **약관에 없는 단어**(WebFetch로 약관 전문에서 검색): "commercial"·"non-commercial"·"redistribut"·"resell"·"cache"·"derivative"·"modify"·"machine learning"·"artificial intelligence"·"AI"(단어)·"train"·"scrap" — 모두 **없음**. "store"는 6.1(자격 증명 저장 금지)에만 나온다.
- 요금표·소개 페이지도 이용 목적을 제한하지 않는다("Free to use. Easy to integrate.", "Free Plan is Free Forever."). 유료 상품 이름에 "ML Pack Light"가 있어 데이터의 기계학습·분석 이용을 상정한 서비스로 보인다(허용 근거는 아니고 정황).

**판정**

| 쟁점 | 판정 | 근거 |
|---|---|---|
| 비상업·광고 없는 웹사이트에 순위·경기·득점 표시 | **허용(조건부)** | 2.3·7.1이 "app or website"에서의 이용을 전제로 한다. 조건은 7.1 문구 표기 |
| 출처 표기 | **필수** — "Football data provided by the Football-Data.org API" | 7.1 |
| **정형 데이터를 LLM 입력으로 써서 한국어 문장 생성(재가공)** | **조건부 허용** — 명시적 금지 없음 | 약관에 가공·파생물·AI 조항이 없고, 이용 방식은 "app or website"로만 묶여 있다. 브리핑은 그 데이터를 우리 사이트에 다른 형식(문장)으로 보여 주는 것이다. Anthropic API로 보내는 것은 처리 위탁이지 공개 재배포가 아니다. 조건은 7.1 표기·9.1(해지 후 중단). 득점·스코어 같은 사실 자체는 일반적으로 저작권 보호 대상이 아니다 |
| 변환된 내부 스키마를 `data/*.json`으로 공개 저장소에 커밋 | **허용(조건부)** — 금지 조항 없음 | 재배포·캐싱 조항이 없다. 원본 응답이 아니라 변환·축약된 값이다. 단 9.1 때문에 해지 후에는 사이트에서 내려야 하고, git 이력 잔존은 위험으로 남는다 |
| 원본 응답 덤프 공개 | 하지 않는다 | 필요 없음. crest URL 등이 섞인다 |
| API 키 | 공개 저장소 금지(6.1) | Secrets만 |

→ **plan §14 B7(데이터 API 약관이 LLM 입력을 막음)은 발동하지 않는다.** D24 브리핑 입력으로 football-data 정형 데이터를 쓸 수 있다. 확인 메일(`daniel@football-data.org`, 약관 페이지의 연락처)은 필수가 아니다. 보내고 싶으면 공개 전(M5)에 "비상업 사이트에서 결과·순위를 LLM으로 한국어 문장화해 표시해도 되는지"를 한 번 묻는 정도면 된다.

**후속 반영 대상**(오케스트레이터 — 이 작업에서는 고치지 않았다)
- PRD FR-45·NFR-09(출처 표기): football-data 문구 **"Football data provided by the Football-Data.org API"**(영문 그대로)를 푸터와 대회 페이지 하단에 둔다. 브리핑 영역에도 데이터 출처를 표기한다.
- PRD §15 D24 "데이터 API 약관 확인" → football-data 판정 조건부 허용, B7 미발동(API-Football은 M0-29).
- PRD §13 위험: "football-data 해지·이전 시 9.1에 따라 데이터 비표시 + git 이력 잔존", "무료 플랜 점수 지연 + 06:30 KST 미종료 경기".
- plan M1-44: 경기별 득점자 없음(질문 2), 대회별 엔드포인트만 사용, 재시도 정책. M2-02·M2-03: 폼·홈/원정·순위 변동은 코드 계산. M0-35: 원본 위치(아래).

### competitions.json 초안

초안 파일: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-28/competitions.draft.json`
검증: `CompetitionsFileSchema`(`npm run validate`가 쓰는 레지스트리 스키마) **통과(6개)**. football-data 값 대조는 6개 중 5개가 일치하고, UCL endDate만 의도적으로 다르다(아래). **저장소(`configs/competitions.json`)에는 쓰지 않았다.**

| id | nameKo / shortKo | fd 코드 | season | startDate | endDate | teamCount | zones(초안) |
|---|---|---|---|---|---|---|---|
| EPL | 프리미어리그 / EPL | PL | 2026 | 2026-08-21 | 2027-05-30 | 20 | 강등 18~20 |
| LALIGA | 라리가 / 라리가 | PD | 2026 | 2026-08-16 | 2027-05-30 | 20 | 강등 18~20 |
| SERIEA | 세리에 A / 세리에A | SA | 2026 | 2026-08-23 | 2027-05-30 | 20 | 강등 18~20 |
| BUNDESLIGA | 분데스리가 / 분데스 | BL1 | 2026 | 2026-08-28 | 2027-05-22 | 18 | 강등 PO 16 · 강등 17~18 |
| LIGUE1 | 리그 1 / 리그1 | FL1 | 2026 | 2026-08-22 | 2027-05-29 | 18 | 강등 PO 16 · 강등 17~18 |
| UCL | UEFA 챔피언스리그 / UCL | CL | 2026 | 2026-09-08 | **2027-06-05** | 36 | 16강 직행 1~8 · PO 9~24 |

**값의 출처와 확신도**
- `footballDataCode`·`season`·`startDate`·`endDate`(UCL 제외)·`teamCount`: **football-data 실측**(위 표).
- UCL `endDate` 2027-06-05: API는 리그 페이즈 끝(2027-01-27)을 준다. 스키마 정의("시즌 마지막 경기일")에 맞춰 **UEFA 공식 결승일**을 넣었다 — "concludes with the final at Estadio Metropolitano in Madrid on Saturday 5 June 2027"(https://www.uefa.com/uefachampionsleague/news/02a6-20d57cfcd03e-407c22a7f465-1000--2026-27-champions-league-teams-dates-draws-format-final/). 어댑터는 UCL의 비시즌 판단에 API endDate를 쓰면 안 된다. 참고로 `fixtures/schema/configs/competitions.json`의 UCL endDate(2027-05-29)는 형식 예시라 실제 값과 다르다.
- UCL 구간(1~8 / 9~24 / 25~36 탈락): **UEFA 공식** — "The clubs ranked one to eight … qualify for the round of 16", "ranked nine to 24 … knockout phase play-offs", "25 to 36 are eliminated"(https://www.uefa.com/uefachampionsleague/news/0268-12157d69ce2d-9f011c70f6fa-1000--new-format-for-champions-league-post-2024-everything-you-ne/). 2026-27 안내 페이지도 "third under the league phase format"이라고 적고 있다.
- 리그 강등 구간: 리그 규정 1차 출처(리그 공식 규정집)는 이번 작업에서 **확보하지 못했다.** 2차 출처로만 확인했다 — 분데스리가 17·18위 직강등 + 16위 2부 3위와 플레이오프, 리그1 17·18위 직강등 + 16위 바라주(2027-06-03·06 예정 — https://en.wikipedia.org/wiki/2026%E2%80%9327_Ligue_1 등), PL은 2025-26 3팀 강등·3팀 승격(https://www.nbcsportsboston.com/news/sports/soccer/premier-league-teams-2026-27/). **라리가·세리에A 2026-27 강등 팀 수는 이번 검색으로 확인하지 못했다**(관행상 3팀).
- **챔스·유로파·컨퍼런스 진출 구간은 넣지 않았다.** 2027-28 대회 출전권은 ① 다음 주기(2027-28~) UEFA 액세스 리스트(이번 검색에서 미공개 확인), ② 2026-27 시즌 국가 계수에 따른 European Performance Spot(EPL·세리에A 등 5번째 챔스 자리), ③ 국내 컵 우승팀에 따라 순위가 밀리는 규칙에 따라 정해진다. 지금 적으면 추정이다.
- `apiFootballLeagueId`: 스키마 **필수 필드**다(빼면 6건 오류). 초안에는 검증용으로 널리 알려진 값(39·140·135·78·61·2)을 넣었지만 **M0-29에서 확인 전**이다.
- `nameKo`·`shortKo`: 표기 제안이다(한국 매체 관용 표기). D0 디자인·names.ko 정책과 함께 확정한다.
- 스키마에 `note` 필드가 없다(strictObject). 근거 URL은 설정 파일에 넣을 수 없으므로 이 문서에 남긴다. note 필드를 추가하려면 스키마 변경(사용자 확인)이 필요하다.

**저장소에 쓰지 않은 이유**: ① `apiFootballLeagueId`가 필수인데 M0-29 전이라 확인 안 된 값이 들어간다. ② 리그 강등 구간은 2차 출처뿐이고(라리가·세리에A는 2차 출처도 없음) 유럽 대항전 구간은 아직 정할 수 없다. 지시("zone 규칙에 추정이 섞이면 저장소에 쓰지 말 것")에 따라 보고만 한다 → 사용자 확인 질문 3.

### M0-35 fixtures에 쓸 원본 위치

디렉터리: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-28/`(세션 scratchpad — M0-35를 같은 세션에서 하지 않으면 다시 받아야 한다. 재수집하려면 아래 요청 목록대로 30건 이내로)

| 파일(`raw/`) | 내용 | 크기 |
|---|---|---|
| `comp-{PL,PD,SA,BL1,FL1,CL}.json` | 대회 정보·시즌 목록 | 6~23KB |
| `standings-{…}.json` | 순위표(UCL 36팀 리그 페이즈) | 5~10KB |
| `matches-{…}.json` | 2026-10-07~13 경기(FINISHED·IN_PLAY·TIMED 포함) | 9~10KB |
| `season-PL.json`·`season-CL.json` | 시즌 전체 경기(PL 380·CL 144) — 폼 계산·임시 킥오프 시각 예시 | 368KB·139KB |
| `scorers-{…}.json`·`scorers-PL-limit50.json` | 득점 순위(기본 10명·50명) | 6~31KB |
| `match-564706.json` | 경기 상세(FINISHED, goals 없음 확인용) | 1KB |
| `matches-all.json`·`matches-6comps.json` | 교차 `/v4/matches`(dateTo 경계 차이 증거) | 88KB·47KB |

- 그 밖에 `log.jsonl`(요청 30건의 상태·헤더·소요 시간 — `X-Authenticated-Client` 계정명이 들어 있으므로 **fixtures로 복사하지 않는다**), `scripts/`(요청기 `fetch.mjs`·KST 확인 `kst-check.ts`·매핑 시험 `map-check.ts`·초안 검증 `validate-draft.ts`), `mapped-PL.sample.json`(내부 스키마 변환 샘플), `competitions.draft.json`이 있다.
- fixtures로 옮길 때는 `crest`·`emblem`·`flag` URL과 `odds`를 지우고(CLAUDE §1-6), 경기 수를 줄여 크기를 맞춘다(예: 시즌 전체는 특정 라운드만). 키·계정명은 원본에 없다(본문에 키 반사 0건 확인).

### 사용자 확인 질문

1. **06:30 KST 수집 시점에 끝나지 않은 경기(겨울철 UCL의 51%)를 브리핑·순위에서 어떻게 다룰까**
   - (A) **상태 기준 이월(추천)** — 브리핑은 "직전 브리핑 이후 FINISHED가 된 경기"를 다룬다. 05:00 KST 킥오프 UCL 경기는 다음 날 07:00 브리핑에 들어간다(하루 늦음). 진행 중 경기가 있는 대회는 순위 문장을 뺀다. 코드만 바꾸면 되고 비용·호출 수 변화가 없다.
   - (B) (A) + **07:40 KST 데이터 전용 재수집** — LLM 없이 football-data 18건만 다시 받아 대회 페이지·순위·결과를 갱신하고 재배포한다(하루 Actions 실행 1회 추가, 커밋 1회 추가). 브리핑은 그대로 하루 늦지만 사이트 데이터는 아침에 최신이 된다. M2에서 도입해도 된다.
   - (C) 겨울 시간 동안 발행을 08:00 KST로 늦춘다 — PRD의 07:00 약속(G1·FR-150)을 바꿔야 하고, 무료 플랜 점수 지연 폭을 모르는 점은 그대로다.
2. **경기별 득점자(무료 미제공)를 브리핑에 어떻게 넣을까**
   - (A) **득점자 없이 시작하고 M0-29 후 재결정(추천)** — 브리핑 입력은 결과·순위·시즌 득점 순위 상위만으로 한다. API-Football 무료 플랜이 2026-27 경기 이벤트(득점자)를 주는지(M0-29) 보고 다시 정한다. 위험이 없다.
   - (B) **득점 순위 일간 비교로 추론** — 매일 `scorers?limit=200`을 받아 전날보다 골이 는 선수를, 그 사이 경기가 1경기뿐인 팀의 경기에 붙인다. 호출 +6건, 비용 0. 다만 추론이라 틀리면 FR-22(입력에 없는 사실 금지)를 어긴다. 자책골·같은 날 2경기·데이터 갱신 지연에 약하다.
   - (C) Free + Deep Data 구독(€29/월) — 월 예산 $3을 크게 넘는다. 비추천.
3. **`configs/competitions.json`을 언제·어떻게 저장소에 쓸까**
   - (A) **M0-29 직후에 쓴다(추천)** — `apiFootballLeagueId`를 확인값으로 채우고, zones는 UCL(공식 출처)과 리그 강등 구간만 넣는다(그때 리그 규정 1차 출처를 함께 확인). 유럽 대항전 구간은 비워 두고 시즌 후반(2027-03 전후 액세스 리스트·계수 확정 시) `/new-season`과 별도로 갱신한다.
   - (B) 지금 초안 그대로 쓴다 — 리그 강등은 관행값, `apiFootballLeagueId`는 알려진 값으로 넣고 M0-29에서 고친다. 빠르지만 확인 안 된 값이 저장소에 들어간다.
   - (C) 유럽 대항전 구간도 지난 시즌 관행값(예: EPL 챔스 1~4·유로파 5·컨퍼런스 6)으로 넣는다 — 색 구간이 바로 보인다. 다만 시즌 말 실제 배정(EPS·컵 우승)과 다를 수 있어 FR-42 표시가 틀릴 수 있다.

## M0-29 API-Football

> 상태: **⏳ 조사 완료 — 사용자 확인 대기.** 무료 플랜으로 2026-27 시즌은 **일부만** 받을 수 있다. `season` 파라미터를 쓰는 시즌 단위 요청(순위·선수 시즌 기록·득점 순위·리그 경기 목록)은 막히고, **경기 단위 요청(이벤트·라인업·경기별 선수 기록)은 된다.** → plan §14 **B1은 "시즌 누적·과거 경기 백필"에 한해 부분 발동**한다. 약관은 **조건부 허용**이라 **B7은 발동하지 않는다.** `configs/competitions.json`은 `apiFootballLeagueId`를 확인값으로 채워 저장소에 썼다(`npm run validate` 통과). 결정이 필요한 것은 아래 "사용자 확인 질문" 2개다.

대상: API-Football v3(`https://v3.football.api-sports.io`, 인증 헤더 `x-apisports-key`, api-football.com 대시보드 직접 가입 — RapidAPI 아님, plan U-05).
요청 범위: 2026-10-10 12:44:23~12:49:27 UTC(21:44~21:49 KST)에 **직접 요청 23건**(예산 25건)을 보냈다. HTTP 상태는 **전부 200**이었고, 그중 7건은 본문 `errors`에 오류가 담겨 왔다(플랜 제한 6 · 입력 검증 1). 다음 요청은 앞 응답이 끝나고 **7초 이상** 지난 뒤 보냈다. 키는 `node --env-file-if-exists=.env.local` 프로세스 환경에서만 읽었고 로그·파일·문서에 남기지 않았다(scratchpad 전체에서 키 문자열 0건 확인). `/status`의 계정 정보(이름·이메일)는 저장 전에 지웠다. 약관은 라이브 페이지가 Cloudflare 챌린지로 막혀(WebFetch·curl·headless Chromium 모두 403) Wayback 스냅숏으로 읽었다(아래 "약관 판정"). LLM 호출은 없었다(비용 0).

### 요약 (먼저 읽기)
1. **플랜**: Free, 하루 100회(`limit_day`), **분당 10회**(`x-ratelimit-limit: 10`), 일 한도는 **00:00 UTC(09:00 KST)에 리셋**된다(약관 "Daily Quota Limit Reset" — 대시보드 가입). 한도에 닿으면 초과 과금 없이 그날 남은 시간 동안 막힌다.
2. **6개 대회 ID 확인**: EPL 39 · 라리가 140 · 세리에A 135 · 분데스리가 78 · 리그1 61 · UCL 2. 6개 모두 `seasons[]`에 2026이 `current: true`이고 coverage 항목(이벤트·라인업·경기/선수 통계·순위·선수·득점 순위·부상 등)이 **전부 true**다. 다만 coverage는 "데이터가 있다"는 뜻이지 "무료로 받을 수 있다"는 뜻이 아니다.
3. **무료 플랜 제한은 파라미터 단위로 걸린다**(HTTP 200 + `errors.plan`):
   - `season=2026` → **"Free plans do not have access to this season, try from 2022 to 2024."** (`/fixtures`·`/standings`·`/players` 모두 같은 문구)
   - `date=` → **오늘(UTC) ±1일만**: "Free plans do not have access to this date, try from 2026-10-09 to 2026-10-11."(요청 시각 2026-10-10 12:46 UTC)
   - `ids=` → "Free plans do not have access to the Ids parameter." · `next=` → "Free plans do not have access to the Next parameter."
4. **경기 단위는 된다**: `/fixtures?date=2026-10-09`(어제)로 2026 시즌 경기 id를 얻고(480경기, 우리 대회 3경기 포함), `/fixtures/events`·`/fixtures/lineups`·`/fixtures/players?fixture=…`가 모두 200이었다. **`/fixtures?id=…` 단건은 날짜 창 밖(2026-09-18) 경기도 열리고, 한 번에 이벤트·라인업·팀 통계·선수 기록을 모두 준다**(76KB). → **경기별 득점자(M0-28에서 football-data 무료에 없던 항목)·포메이션·한국 선수 경기 기록을 무료로 받을 수 있다.**
5. **못 받는 것**: 시즌 누적(선수 시즌 기록·순위·득점 순위 — 순위·득점 순위는 football-data로 충분), "다음 경기"(`next` — football-data 일정으로 충분), **과거 경기 백필**(`season`·`date` 범위 밖 경기는 id를 알아낼 방법이 없다). → 한국 선수 **시즌 누적은 "집계 시작일 이후" 합산**이 된다(사용자 확인 질문 2).
6. **하루 호출 계획**: 날짜 조회 2건 + 경기 단건 조회(6개 대회 전날 경기 전부 + 한국 선수 소속팀의 다른 대회 경기). 실측 토요일(2026-10-10) 24경기 → **26~28건**, 최악(주중 라운드 겹침) 약 **35건** → **일일 계획 ≤ 60회 안에 든다.** 한국 선수 경기만 받으면 하루 최대 약 12건.
7. **약관(D24): 조건부 허용.** 데이터로 "애플리케이션·웹사이트"를 만드는 용도를 명시적으로 허용하고, 금지는 **데이터 재판매**("you cannot directly sell the data we provide")다. 출처 표기 의무·AI/가공 조항·저장/캐싱 조항은 **없다.** 대신 리그 등 권리자에 대한 게시 라이선스는 이용자 책임이라고 적고 있다(비상업·사실 데이터라 위험 낮음). 계정 1개·공유 금지, **분당 한도 위반은 중대한 위반**. → **B7 미발동.**

### 플랜·시즌 커버리지

**`/status`** (요청 #1·#23 — 계정 정보 제거 후 저장)

| 항목 | 값 | 비고 |
|---|---|---|
| `subscription.plan` | **Free** | `active: true`, `end: 2027-10-09`(대시보드 표시 기간 — 무료 플랜은 만료 후에도 Free로 유지된다는 약관 취지) |
| `requests.limit_day` | **100** | 시작 시 `current: 0` → 끝에 `current: 9` |
| 분당 한도 | **10** | 응답 헤더 `x-ratelimit-limit: 10`, `x-ratelimit-remaining` |
| 일 리셋 | **00:00 UTC (09:00 KST)** | 약관 "SUBSCRIPTION ON DASHBOARD.API-FOOTBALL.COM … The daily quota period starts at 00:00:00 UTC." |
| 한도 초과 | 그날 정지(초과 과금 없음) | 약관 "when your quota limit is reached, your account will be suspended for the rest of the day." |

- **카운터가 일관되지 않다.** 성공 응답의 `x-ratelimit-requests-remaining`은 100→98→97→99→98→97→94→93→94→91→92→91→88→87→86→90→91로 **단조 감소하지 않았다.** `/status`의 `current`는 성공한 비-status 요청 14건 뒤에 9였다. 플랜 오류 응답 7건에는 레이트 헤더가 **아예 없었다**(오류 요청은 집계되지 않는 것으로 보인다 — 확정은 못 함). → 어댑터는 헤더나 `/status`가 아니라 **우리 쪽 호출 카운터**(FR-151 "API 호출 수")로 상한을 지킨다.
- 응답 헤더: `x-ratelimit-requests-limit`·`x-ratelimit-requests-remaining`(일)·`x-ratelimit-limit`·`x-ratelimit-remaining`(분)·`content-type`·`date`·`server`. `retry-after`·reset 헤더는 없었다.

**`/leagues?id=…`** (6건, 모두 200 — 2026 시즌 항목)

| 내부 ID | league.id | name / type / country | 2026 start ~ end (API) | current | 2026 coverage | 시즌 배열 |
|---|---|---|---|---|---|---|
| EPL | **39** | Premier League / League / England | 2026-08-21 ~ 2027-05-30 | true | 전부 true | 2010~2026 |
| LALIGA | **140** | La Liga / League / Spain | 2026-08-15 ~ 2027-05-30 | true | 전부 true | 2010~2026 |
| SERIEA | **135** | Serie A / League / Italy | 2026-08-22 ~ 2027-05-30 | true | 전부 true | 2010~2026 |
| BUNDESLIGA | **78** | Bundesliga / League / Germany | 2026-08-28 ~ 2027-05-22 | true | 전부 true | 2010~2026 |
| LIGUE1 | **61** | Ligue 1 / League / France | 2026-08-21 ~ 2027-05-29 | true | 전부 true | 2010~2026 |
| UCL | **2** | UEFA Champions League / Cup / World | 2026-07-07 ~ 2027-01-27 | true | 전부 true | 2011~2026 |

- coverage 키: `fixtures{events, lineups, statistics_fixtures, statistics_players}`·`standings`·`players`·`top_scorers`·`top_assists`·`top_cards`·`injuries`·`predictions`·`odds` — 2026은 12개 모두 true(EPL 2010~2013은 경기 통계 false 등 과거 시즌만 일부 false).
- 시즌 날짜가 football-data(M0-28)와 하루씩 다른 대회가 있다: 라리가 08-15(fd 08-16)·세리에A 08-22(fd 08-23)·리그1 08-21(fd 08-22). UCL은 예선 시작(07-07)~리그 페이즈 끝(01-27)이다. `competitions.json`은 M0-28 값(football-data 실측·UCL은 UEFA 결승일)을 유지했다 — 비시즌 빈 상태 판단에 하루 차이는 영향이 없다.
- **판정 방법**: coverage는 모두 true인데 같은 시즌을 `season=2026`으로 요청하면 플랜 오류가 난다. "무료 플랜이 조회 가능한 시즌 범위"는 오류 원문이 직접 알려 준다 — **2022~2024**(현재 시즌 2026과 직전 2025 모두 제외).

### 엔드포인트별 결과 (2026-10-10 실측)

| # | 요청 | 결과 | 응답 요지 | 우리에게 필요한 필드 |
|---|---|---|---|---|
| 3 | `/fixtures?league=39&season=2026&date=2026-09-20` | ❌ `errors.plan` | "Free plans do not have access to this season, try from 2022 to 2024." | — |
| 4 | `/fixtures?date=2026-10-09` (대회·시즌 지정 없음) | ✅ 480경기, 653KB, 0.5초 | 전 세계 경기. 우리 대회: Dortmund 2-2 Bremen(78, id 1575176) · Lens 2-1 Lyon(61) · Malaga 1-1 Espanyol(140), 모두 `league.season: 2026`, `FT` | `fixture.id·date·timestamp·status.short`, `league.id·season·round`, `teams.home/away.id·name`, `goals`, `score{halftime,fulltime,extratime,penalty}` |
| 9 | `/fixtures?date=2026-09-09` | ❌ `errors.plan` | "Free plans do not have access to this date, try from 2026-10-09 to 2026-10-11." | — |
| 8 | `/fixtures?ids=1575176-1552775-1570408` | ❌ `errors.plan` | "Free plans do not have access to the Ids parameter." | — |
| 16 | `/fixtures?team=157&next=1` | ❌ `errors.plan` | "Free plans do not have access to the Next parameter." (`last`는 미시험 — 같은 제한으로 추정) | — |
| 17 | `/fixtures?id=1575167` (**2026-09-18, 날짜 창 밖**) | ✅ 1경기, 76KB | Bayern 7-0 Union Berlin(BL MD4). **한 응답에 `events` 21 · `lineups` 2 · `statistics` 2 · `players` 2** | 득점자·도움·분, 포메이션, 선발·출전 시간 — 아래 전부 |
| 5 | `/fixtures/events?fixture=1575176` | ✅ 16건 | 골 4(득점자·도움·분·`detail: Normal Goal`), 카드 4, 교체 8 | `time.elapsed·extra`, `team.id`, `player.id·name`, `assist.id·name`, `type`, `detail` |
| 6 | `/fixtures/lineups?fixture=1575176` | ✅ 2팀 | **`formation` "3-4-2-1" / "4-2-3-1"**, `startXI` 11, `substitutes` 9, `coach`, `player.grid`("1:1") | `formation`(FR-55), `startXI[].player.id`(선발 여부) |
| 7 | `/fixtures/players?fixture=1575176` | ✅ 팀당 20명, 49KB | `statistics[0].games{minutes,position,rating,captain,substitute}`·`goals{total,assists}`·`cards`·`shots`·`passes` 등 11묶음 | `games.minutes`, `goals.total·assists`(아래 주의) |
| 12 | `/players?id=2897&season=2026` | ❌ `errors.plan` | 시즌 오류(위와 같은 문구) | — |
| 15 | `/standings?league=39&season=2026` | ❌ `errors.plan` | 시즌 오류 | — (football-data로 대체, M0-28) |
| 10·11 | `/players/squads?team=85`·`team=157` | ✅ 25명·30명 | 현재 스쿼드(시즌 파라미터 없음). **Kim Min-Jae(id 2897) — Bayern 명단에 있음.** PSG 명단에 이강인 **없음**(아래 M0-32) | `players[].id·name·position` |
| 13 | `/players/teams?player=2897` | ✅ 8팀 | 경력: Bayern München 2026·2025·2024·2023, Napoli 2022, Fenerbahçe 2021 … | 2026 소속 확인(이적 감지 보조) |
| 14 | `/players/profiles?search=Kang-In` | ⚠️ `errors.search` | "The Search field may only contain alpha-numeric characters and spaces." — 입력 검증 오류(플랜 제한 아님) | — |
| 1·23 | `/status` | ✅ | 위 표 | — |
| 2·18~22 | `/leagues?id=…` ×6 | ✅ | 위 표 | `league.id`, `seasons[].year·current·coverage` |

**한국 선수 경기 기록 실제 예** (`/fixtures?id=1575167`, 2026-09-18 Bayern 7-0 Union Berlin)

| 선수(API 표기) | id | 팀 | 선발 | 출전 시간 | 골 | 도움 |
|---|---|---|---|---|---|---|
| Kim Min-jae | 2897 | Bayern München | 교체(라인업 `startXI`에 없음) | 45 | null(이벤트상 0) | 0 |
| Woo-Yeong Jeong | 512 | Union Berlin | 선발 | 60 | null(이벤트상 0) | 0 |

**응답 구조 주의 (M1-44·M2-07·M3-02 어댑터 입력)**
- **오류는 HTTP 200으로 온다.** 정상이면 `errors: []`(배열), 오류면 `errors: { plan | search | … : "문구" }`(객체)이고 `results: 0`. → 상태 코드가 아니라 **`errors`를 먼저 검사**한다(zod: 빈 배열 또는 문자열 레코드). `errors.plan`은 재시도하지 않고 그 기능을 폴백으로 내리고 이슈를 만든다. 분당 초과 시 본문은 실측하지 않았다(일부러 만들지 않음).
- **시각은 `+00:00` 오프셋 형식**("2026-10-09T18:30:00+00:00")이라 **우리 `IsoSchema`(`z.iso.datetime()`)를 통과하지 못한다**(실행 확인: `+00:00` false, `Z` true). → 경계에서 `Z` 형식으로 바꾼다(`fixture.timestamp` 초 단위도 있음). football-data는 `…:00Z`였다.
- **`games.substitute`는 믿을 수 없다** — 1575176 경기 40명 전원 `false`(교체 투입·미출전 선수 포함). 선발 여부는 **`lineups[].startXI`**로 판정한다(`PlayerMatchLog.started`).
- **`goals.total`이 0 대신 null로 오는 응답이 있다** — `/fixtures/players`는 0, `/fixtures?id=`의 `players` 블록은 null(같은 의미). → **골·도움은 `events`(type `Goal`, detail `Normal Goal`·`Penalty`·`Own Goal`, `Missed Penalty` 제외)에서 센다.** 자책골의 팀·선수 귀속은 M3 테스트로 확인한다(이번 표본에 없음). 출전 시간은 `games.minutes`(미출전 벤치는 0, 추가 시간은 90에 포함 안 됨).
- **교체 이벤트는 `player` = 나간 선수, `assist` = 들어온 선수**다(확인: 19분 Amos Pieper — 선발 명단에 있음 → 아웃, Oskar Wójcik — 선발 아님 → 인).
- **승부차기**: `goals`·`score.fulltime`은 승부차기를 **포함하지 않고**(예: PEN 경기 3-3), `score.penalty`(4-2)가 따로 온다. football-data(승부차기 골이 fullTime에 포함)와 반대다.
- 포메이션 문자열("3-4-2-1"·"4-2-3-1")은 `FormationShapeSchema`를 그대로 통과한다. `lineups[].team.colors`는 null이다(팀 컬러는 `team-colors.json` 수동 그대로).
- **이름 표기가 응답마다 다르다**: "Kim Min-Jae"(squads) · "Kim Min-jae"(players) · "Woo-Yeong Jeong"(이름-성 순서), 선수 일반은 "J. Musiala"처럼 약자. → 한국 선수는 **`apiFootballId`로 매칭**하고 이름 문자열로 매칭하지 않는다. 브리핑 득점자 이름은 names.ko 사전(FR-24) 키를 API 표기 기준으로 잡아야 한다.
- **팀 id 체계가 football-data와 다르다**(Bayern: API-Football 157 / football-data 별도 id, Dortmund 165, PSG 85). → **API-Football 팀 id → 팀 slug 대응표**가 필요하다(M2-02·M2-05 — 어디에 둘지는 스키마 결정, football-data 팀 id 대응과 함께).
- 로고·선수 사진·국기 URL(`media.api-sports.io`)은 **경계에서 버린다**(CLAUDE §1-6).

### B1 판정 — **일부 가능 (부분 발동)**

근거: 시즌 단위 요청은 플랜 오류 원문 "Free plans do not have access to this season, try from 2022 to 2024."로 막히고, 경기 단위 요청은 2026 시즌 경기에서 200으로 열린다(#4·#5·#6·#7·#17). 경기 id는 `date` 창(오늘 UTC ±1일)으로만 얻을 수 있다.

| 기능 | 필요한 데이터 | 무료 가능? | 경로 |
|---|---|---|---|
| **D24 브리핑 득점자**(M1-44, M0-28 질문 2) | 경기 이벤트 | ✅ | `date`(D-1·D) → `/fixtures?id=` 단건 |
| FR-61 최근 경기 출전·골/도움, UCL 출전 여부 | 경기별 선수 기록 | ✅ | 소속팀 경기 다음 날 `/fixtures?id=` |
| FR-62 최근 5경기 출전 로그 | 경기별 선수 기록 | ✅ (수집 시작 후 5경기째부터 완전) | 같음 |
| FR-91·92 주간 리포트 표·MVP | 주간 경기 기록 합산 | ✅ | 매일 쌓은 로그 합산(코드) |
| **FR-55 주 포메이션**(M2-07) | 최근 라인업 | ✅ | 6개 대회 전 경기를 받으면 **같은 응답에 라인업이 들어 있어 추가 호출 0**. 최빈값은 수집 시작 후 경기로 계산 |
| FR-61·62 **시즌 누적** | `/players?season=` | ❌ | **폴백** — 우리 로그 합산("집계 시작일 이후"). 리그·UCL 골 수만은 football-data 득점 순위(`scorers?limit=…`, 시즌 전체)로 보정 가능 |
| **과거 경기 백필**(2026-08~10-08) | `season`·`date` 범위 밖 | ❌ | 불가 — 경기 id를 얻을 방법이 없다(`ids`·`last`·`season` 막힘). id 추측은 하지 않는다 |
| 다음 경기(FR-61) | `next` | ❌ | football-data 일정(M0-28)으로 충분 |
| 순위·득점 순위·일정(F4) | `standings`·`topscorers` | ❌ | football-data(M0-28) 그대로 |

→ **B1 원안("무료로 2026-27 조회 불가 → 한국 선수는 경기 결과 + 득점 순위 + 뉴스 기반 출전·득점 소식, 포메이션 수동/미표시")은 그대로 발동하지 않는다.** 한국 선수 경기 기록·포메이션·득점자는 API-Football 경로(`provider: "api-football"`)로 간다. 폴백이 필요한 부분은 **시즌 누적(집계 시작 전 경기)** 하나다.
- **FR-65 폴백 경로는 계속 필요하다** — 약관이 "We reserve the right to modify the Free Plan and the available data at any time without prior notice."라고 적고 있다. 어댑터가 `errors.plan`을 받으면 그 기능을 `provider: "fallback"`(스키마에 이미 있음)으로 자동 강등한다.
- 영향 작업
  - **M1-44**(브리핑 최소 어댑터): 득점자를 API-Football 이벤트로 받을 수 있다 → M0-28 질문 2에 선택지 추가(아래 질문 1).
  - **M2-07**(포메이션): "API-Football 라인업 최빈값" 경로 가능. 원안의 "주 1회, 일 50회 이내 분산" 대신 **일일 경기 수집 응답의 라인업을 누적**하면 추가 호출이 없다. `formations.json`은 수집 초기(경기 수 부족)·데이터 누락 팀 보완용으로만.
  - **M3-02**(선수 기록 어댑터): `date` → `/fixtures?id=` 경로. 시즌 누적은 로그 합산 + "집계 시작일" 표시(질문 2).
  - **PRD FR-65**: "현재 시즌 무료 조회 불가 시" → 실제로는 "시즌 단위 조회 불가 → 시즌 누적만 폴백" (오케스트레이터 반영 대상).

### 하루 호출 계획 (일일 계획 ≤ 60회)

수집 실행은 06:30 KST = 전날 21:30 UTC(D)다. 이때 `date` 창은 D-1~D+1(UTC)이다.

| 단계 | 호출 | 건수 |
|---|---|---|
| ① 경기 id 찾기 | `/fixtures?date={D-1}`·`/fixtures?date={D}` (UTC, 대회 필터 없음 → 코드에서 `league.id ∈ {39,140,135,78,61,2}` ∪ 한국 선수 소속팀 id로 거름) | **2** (각 약 0.65MB) |
| ② 경기 상세 | 직전 실행 이후 `FT`·`AET`·`PEN`이 된 대상 경기마다 `/fixtures?id=` (이벤트·라인업·선수 기록 한 번에) | 경기 수만큼 |
| ③ 미종료 이월 | 실행 시점 `NS`·진행 중 경기 id는 `data/cache`에 보관 → 다음 실행에서 `/fixtures?id=`로 재조회(**id 단건은 날짜 창 밖에서도 열린다** — #17) | ②에 포함 |
| 주 1회 | 없음(필수 아님). 이적 감지 보조로 `/players/teams?player=`를 쓰면 선수당 1건(약 10건) — FR-63은 뉴스 기반이라 기본 미사용 | 0 |

**경기 수 추정** (M0-28 football-data 실측 10-07~13 · 시즌 경기 목록)

| 날(UTC) | 6개 대회 경기 | 한국 선수 기타 대회(컵 등) | ① | **합계** |
|---|---|---|---|---|
| 경기 없는 평일 | 0 | 0 | 2 | **2** |
| 금요일(10-09 실측) | 3 | 0 | 2 | **5** |
| **토요일(10-10 실측)** | **24**(PL 6·PD 4·SA 3·BL1 6·FL1 5) | 0~2 | 2 | **26~28** |
| 일요일(10-11 실측) | 17 | 0~2 | 2 | **19~21** |
| UCL 리그 페이즈 화·수 | 9 (MD8 2027-01-27은 하루 18) | 0 | 2 | **11~20** |
| 최악(주중 라운드 겹침 — 예: PL 한 날 10경기 + 라리가·세리에A 주중 라운드) | 약 30 | 약 3 | 2 | **약 35** |

- **경기별 득점자를 API-Football로 받으면** 하루 최대 약 26~28건(실측 토요일 24경기 + 날짜 2), 최악 약 35건이다. **일일 계획 60회 안에 든다**(CLAUDE §6.4).
- 한국 선수 경기만 받는 경우: 소속팀 약 10개 × 하루 최대 1경기 + 날짜 2 = **최대 약 12건**.
- 소요 시간: 분당 10회라 **응답 완료 후 6.5초 간격**(M0-28과 같은 정책) → 35건 × 약 7.5초 ≈ **4.4분**. football-data(약 2.5분)와 호스트가 달라 **병렬**로 돌리면 06:35 무렵 끝난다. API-Football 단계 시간 예산은 6분, 넘으면 남은 경기는 이월(③).
- **개발 사용 한도**: 일 한도 리셋이 00:00 UTC(09:00 KST)라 **09:00 KST~다음 날 06:30 KST의 개발 호출이 봇 실행과 같은 하루 한도를 쓴다.** 개발은 하루 약 50건 이내로 하고, 06:20~06:50 KST에는 수동 호출을 하지 않는다(분당 한도 공유). 날짜 창 때문에 지난 날짜로 개발·테스트할 수 없으니 **테스트는 저장한 원본(fixtures)으로**만 한다.
- 요청·재시도 정책(권고): 동시 1개, 6.5초 간격, 우리 쪽 카운터로 하루 60건 상한(헤더 값은 참고만 — 위 "카운터가 일관되지 않다"). `errors.plan`·`errors`(입력 오류)는 재시도 없음 + 이슈. 5xx·네트워크·타임아웃(15초)은 10초 후 1회 재시도. 분당 초과 응답은 61초 대기 후 1회. **분당 한도를 넘기면 약관상 중대한 위반**("Failure to comply with the per-minute rate limits … constitutes a material breach")이라 간격을 줄이지 않는다.

### 약관 판정 (D24) · B7

확인 날짜: 2026-10-10. 라이브 약관(`https://www.api-football.com/terms`, `https://api-sports.io/terms`)은 Cloudflare JS 챌린지로 WebFetch·curl·headless Chromium 모두 403이었다. **Wayback 스냅숏(2026-02-01, `http://web.archive.org/web/20260201222612/https://www.api-football.com/terms`)**을 읽었고, 본문 끝에 **"Last updated: Mai 21, 2025"**가 있다. 그 뒤 개정 여부는 확인하지 못했다(사용자가 브라우저로 한 번 열어 날짜만 대조하면 된다 — 선택).

| 주제 | 인용(짧게) | 의미 |
|---|---|---|
| 이용 목적 | "We provide data for you to create different projects such as applications, websites, fantasy soccer games etc." | 웹사이트 이용 명시 허용 |
| **재판매 금지** | "it is prohibited to resell this data to third parties" · "you cannot directly sell the data we provide" · "If you sell our data directly, you are competing with our own data. This is not allowed !" | 비상업·광고 없음 → 해당 없음. 원본 응답 덤프를 공개하는 것은 "경쟁"으로 볼 여지가 있어 하지 않는다 |
| 문의 권장 | "If you have any doubts about how you would like to use it, you can contact us directly by email." | 필수 아님 |
| 계정·키 | "Accounts are individual and may not be shared with other developers. It is forbidden to have multiple accounts to increase the limit of the free plan." · "you are responsible for maintaining the security of your account" | 계정 1개, 키는 Actions Secrets만(CLAUDE §1-8). 한도를 늘리려고 계정을 더 만들지 않는다 |
| **게시 라이선스** | "We do not provide a "license" for the use and publication of the data … Any license or permission to publish the data must be requested by the user from the competent authorities." · "It is the responsibility of the user to verify and obtain any necessary authorizations or licenses" | 리그 등 권리자에 대한 책임은 우리에게 있다. 결과·득점·출전 시간 같은 사실 데이터를 비상업 사이트에 표시 → 위험 낮음(football-data 데이터와 같은 성격). "betting platforms, television broadcasting, fantasy sports platforms, or any mass media distribution may require additional licenses"에는 해당하지 않는다 |
| 권리자 이의 | "In case of a formal complaint or legal notice from a recognized rights holder … we reserve the right to immediately suspend or terminate the client's access" | 접근 중단 위험 → FR-65 폴백 유지 |
| 분당 한도 | "Failure to comply with the per-minute rate limits … constitutes a material breach of these Terms of Service." | 6.5초 간격 엄수 |
| 무료 플랜 변경 | "We reserve the right to modify the Free Plan and the available data at any time without prior notice." | `errors.plan` 감지 시 자동 폴백 |
| 로고·이미지 | "Logos, images and trademarks delivered through the API are provided solely for identification and descriptive purposes" · "may require additional authorization or licensing from the respective rights holders" | 쓰지 않는다(CLAUDE §1-6) |
| 보증 없음 | "The data is provided "as is" and without any guarantee." | 검증 게이트·사실성 검사(FR-22) |
| 준거법 | "These terms are governed by French law." | — |

- **약관에 없는 조항**: 출처 표기 의무 · AI/머신러닝/LLM · 가공·파생물(derivative)·변환 · 캐싱·저장·데이터베이스 · 해지 후 데이터 삭제(football-data 9.1 같은 조항) — 모두 **없음**. 참고로 사이트 `robots.txt`에 `Content-Signal: search=yes, ai-input=yes, ai-train=yes`가 있지만 이는 웹페이지 콘텐츠 신호라 API 데이터 이용 근거로 쓰지 않는다.

| 쟁점 | 판정 | 근거 |
|---|---|---|
| 비상업·광고 없는 웹사이트에 경기 기록·득점자·포메이션 표시 | **허용(조건부)** | "applications, websites" 명시. 조건: 재판매 금지, 권리자 라이선스는 이용자 책임(비상업 사실 데이터 — 위험 낮음) |
| 출처 표기 | 의무 없음 → **표기 권장** | 조항 없음. FR-45·FR-142 "데이터 출처"에 "API-Football"을 football-data 문구와 함께 적는다(투명성) |
| **정형 데이터를 LLM 입력으로 한국어 문장 생성(D24)** | **조건부 허용 — 명시적 금지 없음** | AI·가공 조항 없음. 결과물은 우리 사이트에 다른 형식(문장)으로 보여 주는 것이고 데이터를 파는 것이 아니다. Anthropic API 전송은 처리 위탁이다 |
| 변환된 내부 스키마를 `data/*.json`으로 공개 저장소에 커밋 | **허용(조건부)** | 저장·캐싱 금지 조항 없음. 단 "재판매·경쟁" 취지에 맞춰 **필요한 필드만 변환·축약해** 커밋하고 원본 응답은 커밋하지 않는다 |
| 원본 응답 덤프 공개 | **하지 않는다** | "competing with our own data" 소지, 로고·사진 URL 포함 |
| API 키 | 공개 저장소 금지 | 계정 보안 책임 조항 · CLAUDE §1-8 |

→ **plan §14 B7은 API-Football에서도 발동하지 않는다.** M0-28(football-data)과 합치면 D24 브리핑의 두 데이터 API 모두 LLM 입력으로 쓸 수 있다.

### `configs/competitions.json` (저장소 기록)

M0-28 초안(`scratchpad/m0-28/competitions.draft.json`)에 이번에 확인한 값을 넣어 **`configs/competitions.json`으로 썼다.** `npm run validate` 통과(configs 5개 · 오류 0), `vitest` 32파일 1236건 통과.

| id | apiFootballLeagueId | season | zones | 강등 구간 1차 출처 |
|---|---|---|---|---|
| EPL | **39** | 2026 | 강등 18~20 | premierleague.com(2026-04-23) "The clubs who finish 18th, 19th and 20th in the final table go down to the Championship" — https://www.premierleague.com/en/news/4638928/the-run-in-202526-your-relegation-questions-answered |
| LALIGA | **140** | 2026 | 강등 18~20 | laliga.com(2026-05-25) "desde la temporada 1999/2000, se estableció que fueran los tres últimos clasificados quienes perdieran la categoría" — https://www.laliga.com/noticias/equipos-que-bajan-a-segunda |
| SERIEA | **135** | 2026 | 강등 18~20 | **FIGC 공식 공문 CU 179/A(2026-03-20)**, NOIF 제49조 새 조문 "Le squadre classificate al 18°, 19° e 20° posto del Campionato di Serie A retrocedono al Campionato di Serie B." — https://files.figc.it/version/c:ODk1MzQ3YjYtZjM1OS00:ODMyYjgwNDEtMzY0Ni00/179%20-%20Modifica%20art.%2049%20NOIF.pdf (언론에 나온 "세리에A 강등 2팀 축소" 제안은 이 조문에 반영되지 않았다) |
| BUNDESLIGA | **78** | 2026 | 강등 PO 16 · 강등 17~18 | bundesliga.com(© 2026 Bundesliga-Gruppe GmbH) "the teams who finish 16th in the Bundesliga and third in Bundesliga 2 contest the promotion/relegation play-off" · "Germany's top two tiers only have two automatic movers between the divisions" — https://www.bundesliga.com/en/bundesliga/news/how-does-bundesliga-promotion-and-relegation-work-play-off-4061 (18팀 리그에서 16위가 PO이고 자동 강등이 2팀 → 17·18위) |
| LIGUE1 | **61** | 2026 | 강등 PO 16 · 강등 17~18 | ligue1.com(LFP, 2025-12-04) 2026/27 일정 "La double confrontation opposera le 16e de Ligue 1 McDonald's au vainqueur des Play-offs de Ligue 2 BKT"(2027-06-03·06) — https://ligue1.com/fr/articles/l1_article_3795-calendrier-26-27-reprise-fixee-le-week-end-du-8-aout-l2 · ligue1.com(2026-06-08) Ligue 2 "The top two sides will earn automatic promotion" — https://ligue1.com/en/articles/l1_article_5616-ligue-2-preview-the-most-compelling-season-in-recent-memory (18팀 유지 + 2팀 자동 승격 → 17·18위 직강등) |
| UCL | **2** | 2026 | 16강 직행 1~8 · PO 9~24 | UEFA 공식(M0-28 절의 인용) |

- `footballDataCode`·`startDate`·`endDate`(UCL 제외)·`teamCount`·`nameKo`·`shortKo`는 M0-28 초안 그대로다(UCL endDate 2027-06-05는 UEFA 결승일 — M0-28 근거).
- **유럽 대항전(챔스·유로파·컨퍼런스) 진출 구간은 넣지 않았다.** 2027-28 출전권은 ① 다음 주기(2027-28~) UEFA 액세스 리스트, ② 2026-27 국가 계수에 따른 European Performance Spot, ③ 국내 컵 우승팀에 따라 순위가 밀리는 규칙으로 시즌 말에 정해진다. 지금 "챔스 1~4" 같은 관행값을 넣으면 FR-42 순위표 색·텍스트가 틀릴 수 있고, 출처로 확인한 값만 적는다는 원칙(configs.ts 머리말, CLAUDE §1-7)에 어긋난다. 시즌 후반(액세스 리스트·계수 확정 시) 별도로 갱신한다.
- 분데스리가·리그1 직강등 순위(17~18)는 1차 출처가 "PO 16위 + 자동 이동 2팀"으로 적은 것을 18팀 리그에 적용한 값이다(직접 "17·18위"라고 쓴 1차 문장은 찾지 못함 — 2차 출처는 모두 17·18위로 일치).
- 스키마에 `note` 필드가 없어(strictObject) 근거 URL은 이 문서에만 남긴다.

### M0-32·M0-35에 넘길 것

**M0-32 (2026-27 한국 선수 명단 초안)**
- 확인된 `apiFootballId`: **김민재 2897**(Bayern München, team 157 — 2026-10-10 squads 명단에 있음, `/players/teams` 2026 Bayern) · **정우영 512**(Union Berlin — 2026-09-18 Bayern전 선발 60분, API 표기 "Woo-Yeong Jeong").
- **이강인**: `/players/squads?team=85`(PSG) 응답 25명(2026-10-10)에 **없다.** squads 데이터가 늦을 수도 있으니 1차 출처(구단 공식 명단·이적 발표)로 2026-27 소속을 확인해야 한다.
- API로 ID 찾는 법(요청 수 적게): 후보 구단마다 `/players/squads?team=<id>`(시즌 파라미터 없음, 1건) → 선수 id, `/players/teams?player=<id>`(경력 시즌에 2026 소속이 나옴, 1건). `/players/profiles?search=`는 영숫자·공백만 받는다(하이픈 이름 거부 — #14).
- 2025-26 시즌 강등 팀(2026-27 1부에 없음 — football-data 2026-27 순위표에 없는 것으로 교차 확인): EPL West Ham·Burnley·Wolverhampton(NBC 보도), 라리가 Real Oviedo·Girona·Mallorca(laliga.com 2026-05-25), 리그1 Nantes·Metz(ligue1.com 2026-06-08). 이 팀 소속 한국 선수는 FR-64 `comp: "OTHER"`·`active: false` 후보다.

**M0-35 (fixtures)** — 원본: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-29/raw/` (세션 scratchpad — 날짜 창 때문에 **같은 경기를 다시 받을 수 없다.** `/fixtures?id=`로는 다시 받을 수 있다)

| 파일 | 내용 | 용도 |
|---|---|---|
| `fx-id-1575167.json` | Bayern 7-0 Union Berlin, 이벤트·라인업·통계·선수 기록 전부(76KB) | **한국 선수 2명 포함** — M3-02 어댑터·M2-07 포메이션·브리핑 득점자 테스트의 기본 표본 |
| `events-`·`lineups-`·`fplayers-1575176.json` | Dortmund 2-2 Bremen 분리 엔드포인트 | 교체 이벤트 의미, `goals.total` 0/null 차이, `substitute` 항상 false 회귀 테스트 |
| `fx-date-1009.json` | 2026-10-09 전 세계 480경기(653KB) | 대회 id 필터 테스트 — **우리 대회 3경기 + PEN 경기 1개만 남겨 줄인다** |
| `fx-39-2026-0920.json`·`players-2897-2026.json`·`standings-39-2026.json`(season) · `fx-date-0909.json`(date) · `fx-ids-3.json`(ids) · `fx-157-next.json`(next) · `profiles-kangin.json`(입력 검증) | 오류 본문 원문 | `errors` 객체 분기·폴백 전환 테스트 |
| `leagues-{39,140,135,78,61,2}.json` | 시즌·coverage | 대회 ID 검증 |
| `squads-85.json`·`squads-157.json`·`pteams-2897.json` | 스쿼드·경력 | M0-32 참고 |
| `status.json`·`status-end.json` | 계정 정보 제거됨 | **fixtures로 복사하지 않는다** |

- 그 밖에 `log.jsonl`(요청 23건의 상태·레이트 헤더·`errors`), `scripts/fetch.mjs`(요청기 — 키는 env만, 25건 상한, 7초 간격, account 제거), `scripts/terms.cjs`(약관 페이지 시도), `terms/`(약관 Wayback 원문·텍스트)가 있다.
- fixtures로 옮길 때 `logo`·`photo`·`flag` URL(`media.api-sports.io`)을 지우고(CLAUDE §1-6) 크기를 줄인다. 원본에 키·계정 정보는 없다(확인함).

### 사용자 확인 질문

1. **API-Football 경기 단건 조회를 어디까지 쓸까** (M1-44 브리핑 득점자 · M2-07 포메이션 · M3-02 한국 선수 — M0-28 질문 2에 새 선택지가 생겼다)
   - (A) **6개 대회 전날 경기 전부 + 한국 선수 소속팀의 다른 대회 경기(추천)** — 하루 최대 약 26~28건(토요일 실측), 최악 약 35건. 한 응답으로 **득점자(브리핑) · 라인업(포메이션) · 한국 선수 기록**을 모두 얻는다. 비용 0, 소요 약 4.4분(football-data와 병렬). 개발 호출 여유는 하루 약 50건으로 준다.
   - (B) 한국 선수 소속팀 경기 + 브리핑 대상 상위 N경기(예: 빅매치 규칙 상위 5)만 — 하루 최대 약 17건. 포메이션은 `formations.json` 수동(빅클럽 우선) 또는 미표시, 브리핑 득점자는 일부 경기만.
   - (C) 한국 선수 소속팀 경기만 — 하루 최대 약 12건. 브리핑 득점자는 없음(M0-28 질문 2 (A) 유지), 포메이션은 수동/미표시.
2. **한국 선수 시즌 누적을 어떻게 시작할까** (과거 경기 백필 불가)
   - (A) **M1(브리핑 어댑터)부터 경기 기록을 쌓기 시작하고, 시즌 누적은 "집계 시작일 이후"로 표시(추천)** — 질문 1에서 (A)를 고르면 M1-44가 이미 같은 응답을 받으므로 한국 선수 경기 로그를 함께 저장하는 비용이 거의 없다. M3 전에 몇 달치가 쌓인다. 화면에 "○월 ○일 이후 집계"를 표시하려면 `data/players/korean.json`에 집계 시작일 필드가 필요하다(스키마 변경 — 그때 사용자 확인). 리그·UCL 골 수는 football-data 득점 순위(시즌 전체)로 보정할 수 있다.
   - (B) M3-02에서 수집을 시작한다 — 계획 순서를 바꾸지 않지만 M3 시작 전 경기는 모두 빠진다.
   - (C) 유료 플랜 1개월로 시즌 전체 백필 — 월 $3 예산을 넘는다(요금은 이번에 확인 못 함 — 약관 페이지만 열림). 비추천.

**후속 반영 대상**(오케스트레이터 — 이 작업에서는 고치지 않았다)
- plan §14 **B1**: "부분 발동 — 시즌 단위 조회 불가(2022~2024만), 경기 단위(이벤트·라인업·선수 기록)는 무료 → 시즌 누적만 폴백". M2-07(라인업은 일일 경기 수집 응답에서 — 추가 호출 0)·M3-02(`date` → `/fixtures?id=`)·M1-44(득점자 = API-Football 이벤트, 질문 1에 따라) 문구.
- PRD FR-65(폴백 범위를 "시즌 누적"으로 축소 + `errors.plan` 감지 시 자동 폴백), FR-45·FR-142(데이터 출처에 "API-Football" 병기 — 의무는 아님), §13 위험("무료 플랜 무통보 변경", "권리자 이의 시 접근 중단"), §15 D24(API-Football 약관 조건부 허용·B7 미발동).
- CLAUDE §6.4: "API-Football 하루 100회(00:00 UTC 리셋)·**분당 10회**, 일일 계획 ≤ 60회", §13 미결 사항 "API-Football 2026-27 무료 조회" → 일부 가능으로 갱신.
- `.env.example`·Secrets 이름은 그대로(`API_FOOTBALL_KEY`).

## M0-30 Anthropic 실측

> 상태: **⏳ 실측 완료 — 사용자 확인 대기.** Haiku 5.5 단가는 M0-21 표와 같다. 일일 브리핑 1요청은 배치 기준 $0.0001~0.0005라 월 비용은 문제가 아니다. 결정할 것은 **배치 완료 시간**(겨울 여유를 넘는 표본이 있음)과 **thinking 설정**(사실성 차이가 큼)이다. 아래 "사용자 확인 질문" 3개.

대상: `claude-haiku-5-5`(기본 `LLM_MODEL`). 저장소의 `scripts/lib/llm.ts`(전송)·`scripts/lib/cost.ts`(예상·기록)를 **수정 없이** 불렀고, 측정 스크립트는 scratchpad에 두었다.
요청 범위: 2026-10-10 16:30:45~16:41:23 UTC(2026-10-11 01:30~01:41 KST, 토요일 — **실제 발행 시각대가 아니다**)에 **요청 17건**(배치 4개 12건 + 단건 5건)을 보냈고 **17건 모두 성공**했다(오류·재시도·max_tokens 도달 0건). 실행 전 `formatEstimate`로 최악 예상(출력 = max_tokens)을 출력했고 합계 $0.024633였다. 실제 비용은 **$0.007474**다. 실행 3회를 `data/runs-dev.json`에 기록했다(아래 "기록"). 키는 `node --env-file-if-exists=.env.local` 프로세스 환경에서만 읽었고, 로그·결과 파일에 키와 HTTP 응답 원문을 남기지 않았다(scratchpad 전체에서 키 문자열 0건 확인). 입력은 M0-28·M0-29 원본에서 만든 **정형 데이터 JSON뿐이고 기사 텍스트는 없다.**

### 요약 (먼저 읽기)
1. **단가는 M0-21 표와 같다.** 공식 가격 페이지를 2026-10-11에 다시 확인했다. 입력 $0.10 · 5분 캐시 쓰기 $0.125 · 캐시 읽기 $0.01 · 출력 $0.50 per MTok이고, 배치는 50% 할인($0.05 / $0.25)이다. **thinking 토큰은 `output_tokens`에 포함되고, `output_tokens_details.thinking_tokens`로 따로도 온다**(실측). `llm.ts`의 `thinkingTokens`가 이 값을 그대로 읽는다. 청구액 대조는 콘솔 Usage·Cost 화면에서만 할 수 있다(Admin 키 없음 — 선택 작업, 대조할 값 $0.007474).
2. **비용**: 경기 2~6개짜리 입력(약 1.4K토큰)의 요청 1건 비용은 배치 기준 **thinking 기본 $0.00035~0.00054**, **thinking 끔 $0.00013~0.00014**다. 일일 브리핑 월 비용은 배치 **약 $0.013**(실측 평균 × 30일)~**$0.03**(바쁜 날 상한 가정)이다. PRD §9.3 가정($0.007~0.012)의 1~3배이고, 차이는 thinking 출력에서 온다. 그래도 월 예산의 1% 안팎이다.
3. **배치 완료 시간**: 3요청 배치 4개를 측정했다. 동시에 낸 3개는 **1분 50초 안팎**에 끝났고, 4분 뒤 낸 1개는 **6분 33초**가 걸렸다. 여름 여유(실제 약 14분)에는 4개 모두 든다. 겨울은 명목 10분이지만 경기 데이터를 받은 뒤 제출하므로 **실제 여유는 4~5분**이다. 6분 33초 표본은 이 여유를 넘는다. 일반 API 단건은 **2.0~8.5초**였다.
4. **캐싱은 동작한다 → B3(캐시 읽기 0) 미발동.** 시스템 프롬프트는 짧은 판 685토큰, 긴 판 2,034토큰으로 둘 다 최소 512토큰 이상이다. 같은 배치의 3요청 중 첫 요청이 캐시를 쓰고 나머지 2요청이 읽었다. 단건 연속 2회도 쓰기 다음에 읽기가 됐다. 다만 일일 브리핑이 1요청이면 쓰기 할증(1.25배)만 붙어 손해다. 3요청이어도 절약액은 월 $0.002 미만이다.
5. **thinking 설정에 따라 사실성이 갈린다**(사람 검토, 입력 JSON과 줄마다 대조).
   - **기본**(적응형 thinking·effort medium): **45/45줄 일치**
   - **effort low**: 19/20줄 일치. 대신 출력 하나는 통째로 영어였고, 하나는 이름을 모델이 한글로 음역했다.
   - **thinking 끔**: 15/20줄 일치(**틀린 사실 2 · 근거 없는 서술 3**)
   - zod는 17/17건 모두 통과했다. 영어 문장·한자 혼입·음역도 통과했으므로 **zod만으로는 품질을 거를 수 없다.**
6. **max_tokens**: 실측 최대 출력은 2,040토큰(thinking 1,721 포함)이고 `stop_reason: max_tokens`는 0건이었다. 권고 상한은 **4,096**이다(thinking 기본 기준).

### 실측 설계

**입력(정형 JSON, 사용자 메시지로 그대로 전송)** — scratchpad `m0-30/inputs/`
| 키 | 브리핑 날짜(KST) | 내용(원본) | 크기 |
|---|---|---|---|
| A | 2026-09-19 | EPL Brentford 3-0 Chelsea(football-data, 득점자 없음) + 분데스 Bayern 7-0 Union Berlin(API-Football `fx-id-1575167` 득점 7개) + EPL 순위 5행(prev 포함) + **한국 선수 2명**(김민재 교체 45분 · 정우영 선발 60분, `apiFootballId`로 매칭, 선발은 `startXI`) | 1,461자 · 약 778토큰 |
| B | 2026-09-11 | UCL 리그 페이즈 1차전 셋째 날 6경기(득점자 없음) + 1차전 후 순위 상위 5(시즌 경기로 코드 계산). **한국 선수 키 없음**(Bayern 경기가 있어도 김민재를 언급하면 안 되는 시험) | 1,272자 · 약 650토큰 |
| C | 2026-10-10 | 10-09 금요일 3경기(분데스·리그1·라리가) + Dortmund 2-2 Bremen 득점 4개(API-Football `events-1575176`) + 분데스·리그1 현재 순위(prev 없음). 라리가 순위는 수집 시점 진행 중 경기가 반영돼 뺐다(M0-28) | 1,273자 · 약 728토큰 |
| D | 2026-09-21 | EPL 4경기 + 순위 11행(prev 포함) — 캐시 실험용 추가 입력 | 1,379자 · 약 755토큰 |

- 로고 URL·odds·평점(rating)은 옮기지 않았다. 순위 변동(`prev`)은 시즌 경기 목록에서 코드로 계산했다(승점 → 득실차 → 다득점).
- 사용자 메시지 토큰은 긴 판 캐시 실험에서 캐시 밖 입력(`input_tokens`)으로 쟀다. 영문 JSON은 약 0.5토큰/자다.

**프롬프트(임시, scratchpad `m0-30/prompts/`)**
- 짧은 판(`short.md`, 694자 = **685토큰**): 사실성(입력에 없는 수치·이름·평가 금지, goals null이면 득점자 금지, korean 없으면 한국 선수 금지, prev 있을 때만 순위 변동), 표기(영문 이름 그대로, 홈-원정 스코어), 뉴스체·최대 5줄, 짧은 키 JSON 출력.
- 긴 판(`long.md`, 2,119자 = **2,034토큰**): 짧은 판 + 입력 필드 설명, 금지 표현(연승·첫 승 등), 자리표시자 예문(좋은 예·나쁜 예).
- 한국어 프롬프트는 **약 1토큰/자**다. 짧은 판도 이미 캐시 최소 길이(512)를 넘는다.
- 출력 스키마(zod, 임시): `{ l: [{ t: string(5~150), r: string[](1~6) }](1~5) }`. `r`은 근거 입력 항목 id(경기 `m…`, 순위 `s…`, 한국 선수 `k…`)다.

**매트릭스(17요청)** — 측정용 `max_tokens` 4,096
| 단계 | 방식 | 설정 | 프롬프트 | 입력 | 요청 |
|---|---|---|---|---|---|
| ① 설정 비교 | 배치 3개 동시 제출 | 기본 / `effort:"low"` / `thinking:"disabled"` | 짧은 판 | A·B·C | 3 × 3 = 9 |
| ② 지연 비교 | 단건 | 기본 / low / 끔 | 짧은 판 | A | 3 |
| ③ 캐시 | 배치 1개 → 단건 2회 연속 | 기본 | 긴 판 + `cacheSystem` | 배치 B·C·D, 단건 A → D | 3 + 2 = 5 |

### 측정 결과 — 설정별
| 설정 | 방식 | n | in 평균 | out 평균(최대) | thinking 평균 | 본문(out−thinking) | 요청당 비용 | 지연 | zod |
|---|---|---|---|---|---|---|---|---|---|
| 기본(thinking 켜짐·medium) | 배치 | 3 | 1,404 | 1,484 (1,850) | 1,207 | 243~329 | $0.000351~0.000536 (평균 $0.000441) | — | 3/3 |
| effort low | 배치 | 3 | 1,404 | 259 (273) | **0** | 250~273 | $0.000129~0.000139 | — | 3/3 |
| thinking 끔 | 배치 | 3 | 1,403 | 266 (280) | 0 | 252~280 | $0.000130~0.000143 | — | 3/3 |
| 기본 | 단건 | 1 | 1,463 | 1,226 | 942 | 284 | $0.000759 | **6.9초** | 1/1 |
| effort low | 단건 | 1 | 1,463 | 1,237 | **960** | 277 | $0.000765 | 5.4초 | 1/1 |
| thinking 끔 | 단건 | 1 | 1,462 | 293 | 0 | 293 | $0.000293 | **2.0초** | 1/1 |
| 기본 + 긴 판 캐시 | 배치 | 3 | 711 + 캐시 2,034 | 1,517 (1,762) | 1,266 | 231~272 | $0.000363~0.000542 | — | 3/3 |
| 기본 + 긴 판 캐시 | 단건 | 2 | 767 + 캐시 2,034 | 1,698 (2,040) | 1,428 | 220~319 | $0.000773(읽기)~0.001352(쓰기) | 6.3~8.5초 | 2/2 |

- **effort low는 thinking 양이 들쭉날쭉하다.** 배치 3건은 thinking을 아예 하지 않았고(0), 같은 입력의 단건은 960토큰을 썼다. 모델이 요청마다 thinking 여부를 정하기 때문이다(적응형).
- 출력 본문(5줄 JSON)은 설정과 관계없이 **약 220~330토큰**이다. 기본 설정의 비용 차이는 거의 전부 thinking(900~1,700토큰)에서 나온다.
- 17건 모두 `strict` JSON이었다(코드블록·머리말 0건). 모두 5줄이었다(입력이 3경기여도 순위 줄로 5줄을 채웠다).

### 배치 완료 시간
| 배치 | 제출(UTC) | 요청 | 설정 | 완료 − 제출(서버 `ended_at` 기준) | 폴링 관측(10초 간격) |
|---|---|---|---|---|---|
| `msgbatch_01Vm8…` | 16:30:45 | 3 | low | **1분 50초**(109.5초) | 118.5초 |
| `msgbatch_01Mcm…` | 16:30:45 | 3 | 끔 | **1분 51초**(111.0초) | 118.9초 |
| `msgbatch_01Ed7…` | 16:30:45 | 3 | 기본 | **1분 52초**(112.0초) | 118.6초 |
| `msgbatch_01QK9…` | 16:34:30 | 3 | 기본·긴 판·캐시 | **6분 33초**(392.7초) | 398.3초 |

- 요청 하나를 처리하는 데는 2~8.5초(단건 실측)가 걸린다. 나머지 시간은 배치 대기열에서 보낸 시간이다. 동시에 낸 3개가 2.5초 안에 함께 끝난 것으로 보아, 처리가 묶음 단위로 진행되는 것으로 보인다(추정).
- 배치 4번에서 3요청은 한꺼번에 처리되지 않았다. 첫 요청이 캐시를 쓴 뒤 나머지 2요청이 그 캐시를 읽었다(아래 캐시 표).
- **표본의 한계**: 4개뿐이고 한국 시각 토요일 새벽(미국 토요일 오전)에 쟀다. 실제 발행 시각(여름 06:35 무렵 · 겨울 07:15 무렵 KST = 21:35·22:15 UTC = 미국 평일 오후)의 대기열은 측정하지 못했다. 공식 문서는 "대부분 1시간 안"이라고만 하고 완료 시간 SLA는 없다.

**마감 여유와 비교** (D26: 브리핑 마감 = 공개 목표 −10분)
| 계절 | 수집 시작 | 배치 제출(추정) | 브리핑 마감 | 실제 여유 | 실측 1분 50초 | 실측 6분 33초 |
|---|---|---|---|---|---|---|
| 여름 | 06:30 | 06:35~06:36 | 06:50 | 약 14분 | ✅ | ✅ |
| 겨울 | 07:10 | 07:15~07:16 | 07:20 | **약 4~5분** | ✅ | ❌ (템플릿 강등) |

- 제출 시각 추정 근거: Actions 시작·설치 약 1분 + 경기 데이터 수집이다. 브리핑 입력에는 API-Football 득점자가 필요한데, 최악 약 4.4분(M0-29, football-data 약 2.5분과 병렬)이 걸린다. 경기 수가 적은 날은 1~2분 일찍 제출할 수 있다.

### 캐시 (`cacheSystem: true`, 긴 판 2,034토큰, 5분 TTL)
| 요청 | 방식 | 순서 | `cache_creation_input_tokens` | `cache_read_input_tokens` | 비용 |
|---|---|---|---|---|---|
| B | 배치 | 배치 안 첫 처리 | **2,034** | 0 | $0.000542 |
| C | 배치 | 배치 안 | 0 | **2,034** | $0.000487 |
| D | 배치 | 배치 안 | 0 | **2,034** | $0.000363 |
| A | 단건 | 배치 종료 7초 뒤 | **2,034** | 0 | $0.001352 |
| D | 단건 | 직후 | 0 | **2,034** | $0.000773 |

- 캐시는 배치 안에서도, 단건 연속에서도 동작했다. 단건 A가 배치가 남긴 캐시를 읽지 못한 이유는 이 표본으로는 가릴 수 없다. 배치 요청이 5분보다 일찍 처리됐을 수도 있고, 배치와 일반 API의 캐시가 따로일 수도 있다.
- **일일 브리핑 효과(배치, 짧은 판 685토큰 기준)**: 캐시하지 않으면 시스템 프롬프트 비용은 요청당 $0.000034이고, 캐시 쓰기는 $0.000043, 읽기는 $0.000003이다.
  - 하루 1요청: 쓰기 할증만 붙어 월 **+$0.0003**(손해)
  - 하루 3요청이 모두 캐시를 읽는 경우: 월 **−$0.0016**(절약)
  - 어느 쪽이든 무시할 만한 금액이다. 시스템 프롬프트가 같은 요청을 여러 번 보내는 주간 팀 한줄평(20팀 묶음 × 약 6요청)에서는 이득이 있다.

### 출력 품질 — 사람 검토 (줄마다 입력 항목과 대조, 전체 표: scratchpad `m0-30/results/review.json`)
| 설정 | 출력 | 줄 | 입력과 일치 | 틀린 사실 | 근거 없는 서술 | 주요 형식 문제 |
|---|---|---|---|---|---|---|
| **기본** | 9 | 45 | **45 (100%)** | 0 | 0 | 한자 혼입 1줄("선발로 出场해"), 축약 이름 2줄("Olise"·"Lens"), 한 줄 두 문장 1, 원정-홈 순서 스코어 1, 영문 일반어 잔존("Matchday") 1 |
| effort low | 4 | 20 | 19 (95%) | 0 | 1 | **출력 1개 전체가 영어 문장**(단건), **출력 1개가 이름을 한글로 음역**("브렌트포드" — 사전 표기 "브렌트퍼드"와 다름, FR-24 위반) |
| thinking 끔 | 4 | 20 | **15 (75%)** | **2** | **3** | 음역 1개 출력, 한 줄 두 문장 3, 원정-홈 순서 스코어 1, 문법 오류 1("브레멘을 비겼다") |

틀리거나 근거 없는 줄(전부)
| 출력 | 줄 | 입력 | 판정 |
|---|---|---|---|
| 끔·배치·B | "PSG와 Bayern이 … 공동 1위다" | `sUCL` PSG pos 1, Bayern pos 2 | **틀림** |
| 끔·단건·A | "Chelsea는 7점으로 7위에 머물렀다" | `sPL` Chelsea prev 6 → pos 7 | **틀림**(하락했다) |
| 끔·배치·C | "Dortmund … 선두를 지켰다" · "Bremen … 4위에 머물렀다" · "리옹은 리그 2위를 유지했다" | `sBL`·`sL1`에 prev 없음 | 근거 없음(현실과는 맞음) |
| low·배치·C | "Dortmund은 … 선두를 유지했다" | `sBL`에 prev 없음 | 근거 없음 |

- **입력에 없는 사실을 만든 사례는 없었다**(득점자·연승·평가를 지어낸 줄 0). 틀린 줄은 모두 **순위 관계 해석**에서 나왔다(동률 순위, 변동 방향). 득점자가 없는 B 입력에서 득점자를 쓴 줄도, 한국 선수 키가 없는 B 입력에서 김민재를 언급한 줄도 0이었다.
- 잘한 점(기본 설정)
  - "Bremen은 88분과 90+2분에 연속 득점해 경기를 원점으로 돌렸다", "Olise가 3골 1도움"처럼 이벤트를 정확히 합산했다.
  - 긴 판 규칙("원정 승도 홈-원정 순서")을 지켜 "본머스 원정에서 0-1로 이겼다"라고 썼다. 다만 한국어 독자에게는 어색하다(아래 M1 메모).
- **줄 길이**(임시 사전으로 한글 치환한 뒤): 한국어로 쓴 70줄 기준 17~66자다. 60자를 넘는 줄은 3개(61·65·66자)이고, 그중 2개는 한 줄에 두 문장을 쓴 경우다. 영문 이름이 그대로 있는 원문은 20~95자다.
- **조사**: 영문 이름 뒤 조사를 모델이 들쭉날쭉하게 붙였다("Bayern가", "Dortmund은"). 한글로 치환한 뒤 받침 기준으로 고치는 시험판 코드가 출력마다 0~2곳을 바로잡았다.

### 비용 재계산 (PRD §9.3 일일 브리핑 행)
| 가정 | 요청/일 | 입력 | 출력 | 배치 월(30일) | 단건 월(30일) |
|---|---|---|---|---|---|
| 실측 평균(경기 2~6개), thinking 기본 | 1 | ~1.4K | ~1.5K | **$0.013** | $0.023 |
| 실측 평균, thinking 끔 | 1 | ~1.4K | ~0.27K | $0.004 | $0.009 |
| 바쁜 날 상한 가정(경기 24개·득점 약 70개, thinking 2.7K) | 1 | ~5K | ~3K | $0.030 | $0.060 |
| PRD §9.3 현재 가정 | 1~3 | 3K~5K | 300~600 | $0.007~0.012 | — |

- PRD 표는 thinking 출력이 빠져 있어 실측보다 낮다. 갱신 권고는 **"배치 월 약 $0.01~0.03(thinking 기본), 단건이면 2배"**이다. 전체 LLM 합계(팀 프로필·주간 리포트 포함)도 월 $0.1 안팎으로 예산 $3의 3% 수준이다. 하루 최대도 약 $0.002라 `DAILY_BUDGET_USD=0.10`과 거리가 멀다. **B4(일 비용 > $0.10)는 발생 가능성이 없다.**

### 판정과 권고
1. **실제 단가**: M0-21 표와 **일치**한다(2026-10-11 재확인). `cost.ts` 변경은 필요 없다. 비용은 `cost.ts`가 실측 usage로 계산한 값이다. 청구액 대조는 콘솔에서 선택적으로 한다.
2. **월 비용**: 일일 브리핑은 배치 약 $0.01~0.03, 단건 약 $0.02~0.06이다. PRD §9.3 표와 §14.1 "월 약 $0.01"은 thinking 출력을 반영해 갱신하는 것을 권고한다(오케스트레이터 반영 대상).
3. **배치 시간**: 여름은 충분하다. **겨울은 실제 여유 4~5분인데 실측 최대가 6분 33초**이고, 실제 발행 시각대는 측정하지 못했다. → 사용자 확인 질문 1. 추천은 **일일 브리핑만 일반 Messages API 단건으로 바꾸는 것**이다(FR-25 변경). 비용은 월 +$0.01~0.03, 지연은 2~9초다.
4. **캐싱(B3)**: **미발동**이다(캐시 읽기 > 0, 프롬프트 ≥ 512). `llm.ts`의 `cacheSystem`은 유지한다. 일일 브리핑은 기본으로 끄고, 한 실행에서 같은 시스템 프롬프트로 2요청 이상 보낼 때(재시도 포함)만 켠다. 주간 팀 프로필은 켠다. → 사용자 확인 질문 3.
5. **thinking**: **기본(적응형 thinking, `effort:"medium"`을 명시)**을 권고한다. 사실성이 100%(45/45)이고 비용은 끔의 약 3배지만 요청당 $0.0004다. thinking 끔은 75%(15/20)로 PRD KPI(정확 ≥ 90%)에 못 미치고, effort low는 thinking 여부가 들쭉날쭉하고 영어로 출력한 사례가 있다. 표본이 작다(설정당 출력 4~9개). M1-22 `eval:prompt`(10일치)에서 다시 확인한다. → 사용자 확인 질문 2.
6. **max_tokens**: thinking 기본이면 **4,096**(실측 최대 2,040의 약 2배)을 권고한다. 잘리면 그 요청은 템플릿으로 강등되고 쓴 토큰은 버려지므로 여유 있게 둔다. 이 상한에서 최악 비용도 요청당 $0.001(배치)~$0.002(단건)다. thinking을 끄는 경우엔 1,024면 충분하다. 경기 수가 많은 날 thinking이 얼마나 느는지는 M1-44 입력 상한(경기 수)과 함께 M1에서 잰다.

### M1 구현 메모 (M1-19~M1-23 · M1-44 · M1-45 입력)
- **zod 다음에 코드 검증이 꼭 필요하다**(FR-22·23). 이번 표본에서 zod를 통과했지만 쓸 수 없던 경우와 대응 검증은 아래와 같다.
  - 한국어 비율: 영어 문장 출력 → 한글 글자 수 < 영문 글자 수면 실패
  - 한자 혼입: CJK 통합 한자가 있으면 실패
  - 영문 토큰 허용 목록: 줄에 남은 영문 토큰이 입력의 팀·선수·대회 이름 중 하나가 아니면 실패. 축약 이름("Olise"·"Kane"·"Lens")과 일반어("Matchday"·"UCL")가 걸린다. 모델이 한 음역(입력 영문 이름이 하나도 없는데 한글 고유명사가 있음)은 별도 규칙이 필요하다
  - 스코어: 줄의 `a-b`가 입력 `ft`·`ht`에 있는지 확인한다. 순서를 뒤집은 것도 잡는다
  - 문장 수 1 · 치환 후 길이 ≤ 60자 안팎
  - 순위 서술: "지켰다·유지·머물렀다·올랐다·내려갔다"가 있으면 `prev`가 있는지 확인하고, "공동 n위"면 pos가 같은지 확인한다
  - `r` id 존재
- **고유명사 치환(FR-24)**: 조사 보정이 필요하다(받침 기준 이/가·은/는·을/를·과/와·으로/로). 이름이 입력과 다르게 축약될 수 있으므로, 입력에 넣는 선수 이름 표기와 `names.ko.json` 키를 같게 정한다(예: API 원문 "M. Olise" 대신 사전 키로 쓸 표기). 프롬프트에 "입력 표기를 줄이지 말 것"을 넣는다(긴 판에서는 "M. Olise"를 그대로 썼다).
- **스코어 순서 문구**: "원정에서 0-1로 이겼다"는 규칙상 맞지만 읽기 어색하다. "홈-원정 순서 유지"(현재)와 "이긴 팀 기준 서술" 중 무엇으로 할지는 D0 시안(브리핑 표시 방식)에서 정하면 된다.
- **입력 크기**: 경기 2~6개 입력이 650~780토큰이었다. 바쁜 날(24경기)은 약 4~5K토큰으로 추정한다. 입력이 커질 때 thinking과 지연이 얼마나 느는지 모르므로 M1-44에서 경기 수 상한(예: 빅매치 규칙 상위 N + 한국 선수 경기)을 둔다.
- **llm.ts**: 수정할 것은 없었다. `thinkingTokens`·캐시 usage·배치 결과 매칭·단건 지연 모두 의도대로 동작했다. 구조화 출력(`output_config.format`)은 이번 표본에서 JSON 실패가 0건이라 필요 없다(도입하면 요청 형태가 바뀌므로 그때 확인).

### 기록 (`data/runs-dev.json`, `cost.ts` `createRunRecorder`가 기록 — 손 편집 없음)
| runId | 단계 | 요청 | tokens(in/out/cacheRead/cacheWrite) | costUsd | 상태 |
|---|---|---|---|---|---|
| `collect-dev-20261010T163045Z-40b0` | ① 배치 3개 | 9 | 12,630 / 6,028 / 0 / 0 | $0.002139 | success |
| `collect-dev-20261010T163217Z-9add` | ② 단건 3회 | 3 | 4,388 / 2,756 / 0 / 0 | $0.001817 | success |
| `collect-dev-20261010T163429Z-6027` | ③ 캐시 | 5 | 3,666 / 7,947 / 6,102 / 4,068 | $0.003518 | success |
| **합계** | | **17** | | **$0.007474** | |

- `job`은 `"collect"`다. RunLog `job` enum이 `collect`·`weekly`뿐이고 일일 브리핑은 collect 실행 안의 단계이기 때문이다. `summarized`에는 zod를 통과한 줄 수(45·15·25)를 넣었고, 실험이라 템플릿 강등이 없어 `downgraded`는 0이다. 이 값에는 영어로 쓴 5줄도 들어가 있다. 실험 기록이라 그대로 두지만, 운영에서는 코드 검증을 통과한 줄만 센다.
- 이번 달(2026-10 KST) 사용: prod $0 + dev **$0.007474** = 월 예산 $3의 **0.25%**다(dev 50% 경보 기준과 거리가 멀다). 오늘(2026-10-11 KST) 일일 예산 대비 7.5%다.

### 원자료 위치 (scratchpad — 저장소에 넣지 않음)
디렉터리: `/tmp/claude-1000/-home-sguys99-project-euro-digest/7c9f579e-56cb-4022-8cf1-1b0af43189dd/scratchpad/m0-30/`
| 파일 | 내용 |
|---|---|
| `inputs/{A,B,C,D}.json` | 정형 입력(사용자 메시지 원문) |
| `prompts/{short,long}.md` | 임시 시스템 프롬프트 |
| `results/{batch3,single3,cache}-*.json` | 요청별 usage·thinking·비용·지연·**출력 텍스트**·zod 결과 |
| `results/*.log` | 실행 로그(단계·건수·소요 시간, 프롬프트·응답 원문 없음) |
| `results/analysis.{json,md}` | 자동 점검(근거 id·입력에 없는 숫자·스코어·영문 토큰·한자·한국어 비율·줄 길이·한글 치환) |
| `results/review.json` | 사람 검토 — 75줄 판정과 근거 |
| `brief-samples.json` | **M0-34용 브리핑 샘플 4일치**(기본 설정·긴 판 출력, 임시 사전 치환본 + 원문 + refs). 4일치 모두 사람 검토에서 입력과 일치 |
| `names-ko.tmp.json` | 샘플 표시용 임시 표기 사전(`configs/names.ko.json` 아님) |
| `scripts/` | `build-inputs.ts`(입력 생성) · `run.ts`(실측 — llm.ts·cost.ts 사용) · `analyze.ts`(점검·치환 시험판) · `common.ts` |

샘플(2026-09-19 브리핑, 임시 사전 치환):
> 김민재는 바이에른의 우니온 베를린전에서 후반 46분 교체 투입돼 45분을 뛰었다.
> 바이에른이 홈에서 우니온 베를린을 7-0으로 꺾었고 올리세가 3골을 넣었다.
> 브렌트퍼드는 7위에서 3위로 올랐고 첼시는 6위에서 7위로 내려갔다.

### 사용자 확인 질문
1. **일일 브리핑을 배치로 계속 보낼까** (FR-25·FR-26, D26 겨울 여유)
   - (A) **일일 브리핑만 일반 Messages API 단건으로 바꾼다(추천).** 실측 지연은 2~8.5초이고 비용은 배치의 2배(월 +$0.01~0.03, 예산의 1% 안팎)다. 폴링·취소 코드가 빠지고, 마감 초과는 사실상 API 장애일 때만 생긴다. 429·5xx는 `llm.ts` 재시도로 처리하고, 실패하면 템플릿으로 간다. 주간 작업(팀 프로필·주간 총평)은 배치를 유지한다. 호출 지점·요청 수는 그대로다.
   - (B) 배치를 유지하고 마감에 템플릿 강등한다(현행 FR-25·26). 가장 싸지만, 이번 표본 기준으로 겨울에 4개 중 1개꼴로 템플릿 강등이 생길 수 있다. M1 7일 관찰(M1-42)에서 실제 시각대 완료 시간을 재고 다시 정한다.
   - (C) 혼합: 배치를 먼저 내고, 마감 1분 전까지 끝나지 않으면 배치를 취소한 뒤 단건 1회를 보내고, 그것도 실패하면 템플릿으로 간다. 대개 배치 가격이지만 코드가 가장 복잡하다. 취소 직전에 처리된 요청은 과금되므로 드물게 이중 과금이 생길 수 있다.
2. **브리핑 thinking 설정** (월 비용·품질)
   - (A) **기본 — 적응형 thinking, `effort:"medium"` 명시(추천).** 사실성 45/45줄이다. 요청당 배치 $0.0004 · 단건 $0.0008이고, 단건 지연은 6~8.5초다.
   - (B) `thinking:"disabled"` — 비용은 약 1/3이고 단건 2초다. 하지만 사실성 15/20줄(틀린 순위 해석 2·근거 없는 서술 3)로 KPI 90%에 못 미친다. 사실성 검사기가 일부를 잡아 템플릿으로 바꾸겠지만 강등이 늘어난다.
   - (C) `effort:"low"` — thinking 여부가 요청마다 다르고, 영어로 출력한 사례가 1건 있었다. 비추천.
3. **캐싱(B3)**
   - (A) **B3 미발동으로 닫는다(추천).** `cacheSystem` 코드는 유지하고, 일일 브리핑은 2요청 이상일 때만 켜고, 주간 팀 프로필은 켠다. PRD §9.3의 "캐싱 미적용 가정"은 그대로 둔다(일일 효과가 월 $0.002 미만).
   - (B) 원안대로 캐싱 코드를 제거한다. 주간 팀 프로필(같은 프롬프트 약 6요청)의 절약 기회를 버린다.
   - (C) 모든 호출에서 항상 켠다. 일일 1요청일 때 쓰기 할증(+25%)만 붙는다.

**후속 반영 대상**(오케스트레이터 — 이 작업에서는 고치지 않았다)
- plan M0-30 체크, §14 B3(미발동 — 캐시 동작 확인, 호출 지점별 적용), PRD §9.3·§14.1(일일 브리핑 비용 thinking 반영), 질문 1 결정에 따라 PRD FR-25·FR-26·§9.1·§10, CLAUDE §6.2, `llm.ts` 머리말("callSingle은 그 경로에서 쓰지 않는다").
- M1-20(프롬프트·출력 스키마 — 이번 임시 프롬프트·스키마 출발점), M1-21(조사 보정 포함 치환), M1-23(사실성 검사기 — 위 "M1 구현 메모"의 검증 목록), M0-34(브리핑 샘플 `brief-samples.json` 재사용), M0-36(LLM mock — 이번 실제 출력에서 정상·한자 혼입·영어 출력·순위 오해 사례를 뽑아 쓸 수 있다).

## M0-31 서비스명·저장소명
(미착수)

## M0-32 2026-27 한국 선수 명단 초안
(미착수)
