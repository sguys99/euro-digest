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

## 목차
- [M0-23 1군 영문 RSS](#m0-23-1군-영문-rss) ✅ 완료 — 사용자 결정(2026-10-10) 반영, `configs/sources.json` 등록
- [M0-24 2군 매체·기자 채널](#m0-24-2군-매체기자-채널)
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
(미착수)

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
