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

## 목차
- [M0-23 1군 영문 RSS](#m0-23-1군-영문-rss) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록(원제목+링크 6 · 제외 2)
- [M0-24 2군 매체·기자 채널](#m0-24-2군-매체기자-채널) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록(원제목+링크 3 · 기록용 제외 5), FR-20 재정의(PRD §15 D23·D24)
- [M0-25 국내 매체 RSS](#m0-25-국내-매체-rss)
- [M0-26 Google News RSS](#m0-26-google-news-rss)
- [M0-27 GDELT DOC API](#m0-27-gdelt-doc-api)
- [M0-28 football-data.org](#m0-28-football-dataorg)
- [M0-29 API-Football](#m0-29-api-football)
- [M0-30 Anthropic 실측](#m0-30-anthropic-실측)
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
(미착수)

## M0-26 Google News RSS
(미착수)

## M0-27 GDELT DOC API
(미착수)

## M0-28 football-data.org
(미착수)

## M0-29 API-Football
(미착수)

## M0-30 Anthropic 실측
(미착수)

## M0-31 서비스명·저장소명
(미착수)

## M0-32 2026-27 한국 선수 명단 초안
(미착수)
