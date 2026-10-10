# ⚽ 유로 다이제스트 (Euro Digest) — 기본 계획서 (v0.1)

> 매일 아침 07:00 KST, 밤사이 유럽 축구를 한눈에.
> 작성일: 2026-10-10 · 버전: v0.1

---

## 0. 서비스명

| 항목 | 내용 |
|---|---|
| 서비스명 | **유로 다이제스트 (Euro Digest)** |
| 의미 | 유럽(Euro) 축구 소식을 매일 소화하기 쉽게 요약(Digest) |
| 저장소명 (안) | `euro-digest` → `https://<user>.github.io/euro-digest` |
| 확정 전 확인 | ① KIPRIS 상표 검색 ② GitHub 저장소명 사용 가능 여부 ③ SNS 계정명 ④ 'Euro'가 대회명(UEFA EURO)과 겹치므로 검색 노출 시 "유로 다이제스트 축구" 등 브랜드 키워드 일관 사용 |

> 이전 후보 '하프타임'은 동일 분야 중복(축구 게임·퀴즈 사이트·베팅 앱)과 일반 명사로 인한 SEO 불리 문제로 제외.

---

## 1. 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 대상 | **일반 공개 서비스** → SEO·공유·분석·접근성 필수 |
| 2 | 프론트엔드 | **Next.js static export** (`output: 'export'`) |
| 3 | 발행 | **하루 1회, 07:00 KST** |
| 4 | 뉴스 소스 | **영문 해외 매체 우선** + 한국 매체 일부 (3장) |
| 5 | 대회 범위 | 유럽 5대 리그 + **UEFA 챔피언스리그(UCL)** + **A매치** |
| 6 | 한국 선수 범위 | **유럽 5대 리그 소속 선수로 한정** |
| 7 | 팀 분석 | **한줄평으로 시작** 후 단계적 확장 |
| 8 | 예산 | **월 $3 이하** (LLM + 데이터 API 합산) |
| 9 | 디자인 | 레퍼런스 없음 → 추후 시안 여러 개 제작 후 선택 (별도 요청 시 진행) |
| 10 | MVP 추가 기능 | **A** 오늘 밤 볼 경기 · **B** 한국 선수 주간 리포트 · **C** 이적시장 트래커 · **E** 마이 팀 팔로우 · **G** PWA + RSS |
| 11 | 도메인 | `*.github.io` 사용 (커스텀 도메인 없음) |
| 12 | 관리자 화면 | **없음** — `configs/*.json` 직접 수정 + Claude Code로 관리 |
| 13 | 문서 버전 | 모든 문서는 **v0.1로 통일** |

---

## 2. 개요

### 2.1 목적
해외 축구 뉴스를 매일 07:00 KST에 자동 수집해 **핵심만 한국어로 요약**하고 원문 링크를 제공한다. 유럽 5대 리그·UCL 팀 정보, 5대 리그 한국 선수 현황, 대표팀 소식을 한곳에서 보여주는 **공개 웹서비스**.

### 2.2 핵심 원칙
1. **요약, 번역 아님** — 기사당 제목 1줄 + 핵심 3줄 이내, 원문 링크·매체명 필수.
2. **월 $3 이하** — 정적 호스팅 + GitHub Actions + 최소 LLM 호출 + 무료 데이터 API.
3. **LLM은 '글쓰기'에만** — 수집·중복제거·필터링·순위·고유명사 변환은 코드로.
4. **RSS·API 우선, 크롤링 최소화** — 약관·robots.txt를 지키는 범위에서만 수집 (3장).
5. **세련된 디자인** — 모바일 우선, 빠른 로딩, 다크/라이트 모드.
6. **운영 무인화** — 관리자 화면 없이 설정 파일과 Actions 로그로 운영.

### 2.3 기술 스택
| 영역 | 선택 | 비고 |
|---|---|---|
| 개발 | Claude Code | CLAUDE.md / DESIGN.md / docs/PRD.md / docs/plan.md |
| 프론트엔드 | Next.js (App Router) + `output: 'export'` | `basePath` 설정, `images.unoptimized: true` |
| 스타일 | Tailwind CSS + shadcn/ui | 토큰은 DESIGN.md에서 관리 |
| 데이터 | 날짜별 JSON 파일 (git 커밋) | 빌드 시 읽어서 정적 페이지 생성 |
| 배치 | GitHub Actions + 외부 크론 `workflow_dispatch` | 07:00 정시 발행, 백업 `schedule` + 12시간 guard |
| 요약 | Anthropic API — Haiku 계열 + Message Batches API | `LLM_MODEL` 환경변수로 전환 |
| 축구 데이터 | football-data.org (무료) + API-Football (무료, 보조) | 4장 |
| 호스팅 | GitHub Pages | `actions/deploy-pages` |
| 검색 | Pagefind (정적 검색) | 빌드 후 인덱싱 |
| 분석 | GoatCounter 또는 Umami (쿠키리스) | |

> 정적 export 제약: 동적 라우트는 `generateStaticParams` 필수, API Route·ISR·middleware 불가. 팔로우·필터는 브라우저에서 처리.

---

## 3. 뉴스 소스 및 크롤링 대상 (조사 결과)

### 3.1 수집 방식 우선순위
```
① 공식 RSS 피드  →  ② 유명 기자·블로그 (RSS/Substack/목록 페이지 크롤링)  →  ③ 뉴스 검색(Google News RSS·GDELT)
→  ④ 메타데이터 경량 크롤링(OG 태그)  →  ✕ 본문 크롤링(하지 않음)
```
- 본문 전체를 긁지 않고 **제목 + RSS 요약 + (필요 시) og:description** 만 사용 → 저작권 위험·토큰 비용 동시 절감
- 모든 소스는 `configs/sources.json`에 `enabled / lang / weight / tier / competitions / terms_checked` 필드로 관리

### 3.2 영문 소스 — 1군 (RSS 확인됨)
| 매체 | RSS URL | 범위 | 비고 |
|---|---|---|---|
| BBC Sport — Football | `https://feeds.bbci.co.uk/sport/football/rss.xml` | 축구 전체 | 핵심 소스, 속보 빠름 |
| BBC Sport — Premier League | `https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml` | EPL | |
| BBC Sport — Champions League | `https://feeds.bbci.co.uk/sport/football/champions-league/rss.xml` | UCL | |
| BBC Sport — European football | `https://feeds.bbci.co.uk/sport/football/european/rss.xml` | 라리가·세리에A·분데스·리그1 | 대륙 리그 보강 |
| Sky Sports — Football | `https://www.skysports.com/rss/11095` | 축구 전체 (최신 20건) | 이적 뉴스 강점 |
| The Guardian — Football | `https://www.theguardian.com/football/rss` | 축구 전체 | 분석 기사 다수 (URL 실작동 확인 필요) |
| The Athletic | `https://www.nytimes.com/athletic/rss/news/` | 종합 | 본문 유료 → 제목·요약만, 원문 링크 |
| ESPN — Soccer | `https://www.espn.com/espn/rss/soccer/news` | 축구 전체 | ⚠️ 약관 주의 (아래) |

> ⚠️ **ESPN RSS 약관**: 피드 내용 그대로만 표시, 원문 링크 필수, ESPN 출처 표기, 광고 삽입 금지, 제목·요약 수정 금지. 우리 서비스는 자체 요약을 생성하므로 **ESPN은 `enabled: false`로 시작**하거나 '원제목 + 링크'만 표시하는 방식으로 제한.

### 3.3 영문 소스 — 2군 (리그 특화, RSS 존재 여부 M0에서 확인)
| 대상 리그 | 후보 매체 | 용도 |
|---|---|---|
| 세리에A | Football Italia | 이탈리아 소식 영문 커버 |
| 분데스리가 | Bundesliga.com 영문 뉴스, Get German Football News | 독일 소식 |
| 라리가 | Marca English, Football España | 스페인 소식 |
| 리그1 | Get French Football News | 프랑스 소식 |
| UCL | UEFA.com 뉴스 | 공식 발표·조추첨·징계 |

### 3.4 한국어 소스 (보조, 전체의 20~30%)
| 방식 | 대상 | 용도 | 비고 |
|---|---|---|---|
| **Google News RSS 검색** | `https://news.google.com/rss/search?q=<선수명>&hl=ko&gl=KR&ceid=KR:ko` | 5대 리그 한국 선수별 국내 보도 | 선수 10명 내외 × 1쿼리. 결과 링크는 원 매체로 연결. 이용 조건 확인 필요 |
| 국내 축구 전문지 RSS | 인터풋볼, 풋볼리스트, 스포탈코리아, 베스트일레븐 등 | 한국 선수·대표팀 소식 | 매체별 RSS 제공 여부·이용 조건 M0에서 확인 |
| 대한축구협회(KFA) | 대표팀 일정·소집 명단 발표 | A매치 | RSS 없으면 일정은 `configs/national-team.json` 수동 관리 |

- 한국어 기사는 이미 한국어이므로 **LLM 요약 생략** → RSS 요약문을 잘라 쓰거나 제목+링크만 표시 (비용 ≈ 0)

### 3.5 유명 축구 기자·블로그 (크롤링 포함)

#### 3.5.1 이적 전문 기자
| 기자 | 수집 채널 | 수집 방식 | 비고 |
|---|---|---|---|
| **Fabrizio Romano** | ① Substack 'the Daily Briefing' (CaughtOffside 운영) ② CaughtOffside 작성자 페이지 (`caughtoffside.com/author/fabrizio-romano`) ③ The Guardian 기고 | ① Substack 공개 RSS(`/feed`) ② 작성자 목록 페이지 크롤링(제목·링크·날짜) ③ Guardian RSS에서 작성자 필터 | 유료 글은 제목·링크만. 'Here we go' 키워드 감지 시 이적 상태 '확정 임박'으로 가중 |
| Gianluca Di Marzio | `gianlucadimarzio.com/en` (영문 섹션) | 영문 뉴스 목록 페이지 크롤링 또는 사이트 RSS | 세리에A 이적 1차 소스 |
| David Ornstein | The Athletic | 3.2 The Athletic RSS에서 작성자 필터 | EPL 이적 신뢰도 최상위 |
| Florian Plettenberg | Sky Sport Germany | 사이트 RSS/목록 페이지 확인 필요 | 분데스리가 이적 |
| Matteo Moretto | Relevo (스페인) | 사이트 RSS/목록 페이지 확인 필요 | 라리가 이적, 스페인어 → 요약 시 번역 |
| Ben Jacobs | CBS Sports 등 기고 매체 | 기고 매체 RSS에서 작성자 필터 | |

> **X(트위터) 직접 수집은 하지 않음**: X API 무료 티어가 사실상 폐지되어 유료(종량제)만 가능 → 월 $3 예산 초과. 기자들의 X 속보는 위 웹·Substack 채널과, 이를 인용 보도하는 매체로 간접 반영.

#### 3.5.2 이적 소식 집계 사이트 (속도 빠름, 신뢰도 Tier 3)
| 사이트 | 특징 | 수집 방식 |
|---|---|---|
| CaughtOffside | Romano 칼럼 게재, 이적 루머 다수 | RSS/목록 페이지 |
| Calciomercato.com (영문) | 이탈리아 이적 시장 영문 | RSS/목록 페이지 |
| TEAMtalk, Football365, 90min | EPL 중심 루머·이슈 | RSS |

#### 3.5.3 전술·데이터 분석 블로그 (팀 한줄평·주간 콘텐츠 참고용)
| 블로그 | 특징 | 활용 |
|---|---|---|
| The Analyst (Opta) | 데이터 기반 리그·팀 분석 | 팀 한줄평 확장 단계에서 참고 링크 |
| StatsBomb 블로그 | 고급 지표(xG 등) 해설 | 〃 |
| Total Football Analysis | 경기·팀 전술 분석 | 〃 |
| Spielverlagerung | 전술 심층 분석 (독일어/영어) | 〃 |

- 분석 블로그는 **매일 수집하지 않고 주 1회** 수집 → 팀 페이지의 '더 읽을거리' 링크로 노출 (LLM 요약 없이 제목+링크, 비용 0)
- 모든 블로그·기자 채널은 `configs/sources.json`에 `type: "journalist" | "aggregator" | "analysis"`로 구분

### 3.6 뉴스 검색 (키워드 기반 수집)
RSS로 놓치는 소식(특정 팀·선수·한국 선수)을 키워드 검색으로 보강합니다.

| 도구 | 비용·한도 | 용도 | 판단 |
|---|---|---|---|
| **Google News RSS 검색** | 무료, 키 불필요 | 한국 선수명(한/영), 빅클럽명 + "transfer", UCL 등 키워드별 최신 기사 | ✅ 주 도구. 하루 1회 · 쿼리 20~30개 이내 · 이용 조건 확인 필요 |
| **GDELT 2.0 DOC API** | 완전 무료, 키 불필요, 15분 단위 갱신, 쿼리당 최대 250건, 최근 약 3개월 | 다국어(스페인어·이탈리아어·독일어·프랑스어) 현지 매체 보강, 이슈 급상승 감지 | ✅ 보조 도구 |
| NewsAPI.org | 무료 플랜은 개발·테스트 전용, 공개 서비스 사용 금지, 기사 24시간 지연 | — | ❌ 제외 (상용 플랜 월 $449) |
| NewsData.io / GNews / TheNewsAPI 등 | 무료 티어 존재, 상업 이용 조건 상이 | 대안 | △ Google News RSS 차단 시 대체 후보 |

**검색 쿼리 관리** (`configs/search-queries.json`, 예시)
```json
[
  { "q": "\"Here we go\" Romano", "lang": "en", "purpose": "transfer" },
  { "q": "<한국 선수 영문명>", "lang": "en", "purpose": "korean" },
  { "q": "<한국 선수 한글명>", "lang": "ko", "purpose": "korean" },
  { "q": "Champions League", "lang": "en", "purpose": "ucl" }
]
```
- 검색 결과도 동일 파이프라인(URL 중복제거 → 클러스터링 → 점수화)을 거쳐 RSS 기사와 합쳐짐 → **추가 LLM 비용 없음**(선별 상한 N개 유지)

### 3.7 크롤링 대상과 금지 대상
| 구분 | 대상 | 수집 범위 | 이유 |
|---|---|---|---|
| ✅ 목록 크롤링 | RSS가 없는 기자·블로그 목록 페이지 (CaughtOffside 작성자 페이지, Di Marzio 영문 섹션 등), 2군 매체, UEFA.com 뉴스 목록 | 제목·링크·발행시각·작성자 | robots.txt 준수, 하루 1회, 요청 간 지연 |
| ✅ 메타 크롤링 | RSS·검색 결과에 요약이 없는 기사 URL | `og:title / og:description / article:published_time` 만 | 요약 입력 보강, 본문 미수집 |
| ❌ 금지 | Transfermarkt, FBref/Sports-Reference, WhoScored, SofaScore, FotMob | — | 약관상 스크래핑 제한·봇 차단 → 데이터는 API로 대체 |
| ❌ 금지 | 네이버·다음 스포츠 포털 | — | 포털 약관, 기사 저작권은 원 매체 |
| ❌ 금지 | X(트위터) 직접 수집 | — | 유료 API·약관 → 3.5 채널로 간접 반영 |
| ❌ 금지 | 유료 기사·유료 Substack 본문 | — | 저작권 |

**크롤러 구현 원칙**
- 사이트별 파서를 `scripts/crawlers/<site>.ts`로 분리, 구조 변경으로 실패하면 해당 소스만 건너뛰고 GitHub 이슈 생성
- User-Agent에 서비스명·연락처 명시, 사이트당 요청 간 2~3초 지연, 하루 1회
- 수집 결과는 RSS와 동일한 형식(제목·링크·날짜·요약·출처)으로 정규화

### 3.8 이적 트래커용 출처 신뢰도 Tier (초안)
| Tier | 기준 | 예시 |
|---|---|---|
| 1 | 구단·리그 공식 발표, 신뢰도 최상위 기자 | 구단 공식, UEFA.com, Fabrizio Romano('Here we go'), David Ornstein |
| 2 | 주요 매체·주요 이적 기자 | BBC Sport, Sky Sports, The Guardian, The Athletic, Di Marzio, Plettenberg, Moretto |
| 3 | 집계·2차 인용 매체 | CaughtOffside(Romano 외 기사), TEAMtalk, Football365, 90min, Calciomercato.com |

> Tier는 `configs/sources.json`에서 조정. 카드에는 "Tier 1 출처" 같은 신뢰도 배지로 표시.

---

## 4. 축구 데이터 API (조사 결과)

### 4.1 비교
| 항목 | football-data.org (무료) | API-Football (무료) |
|---|---|---|
| 대회 | **12개 대회**: 5대 리그 + UCL + 에레디비시 + 프리메이라리가 + 챔피언십 + 브라질 세리에A + 월드컵 + 유로 | 1,200여 개 대회 (전 엔드포인트) |
| 호출 한도 | **분당 10회** (일일 한도 없음) | **하루 100회**, 분당 10회, 00:00 UTC 초기화 |
| 제공 | 순위표, 일정·결과(지연), 득점 순위, 팀 정보 | 일정·결과, 순위, 선수 기록, **라인업**, 부상, 이적 등 |
| 미제공 | **상세 선수 기록·라인업 없음**(유료 애드온), 실시간 스코어 없음 | 무료 플랜은 **이용 가능한 시즌이 제한됨** → 현재 시즌 접근 여부 확인 필수 |
| 유료 전환 | Deep Data €29/월 | Pro $19/월 |
| 판단 | **주 데이터 소스** (순위·일정·결과·득점) | **보조 소스** (한국 선수 기록·포메이션) |

> 두 유료 플랜 모두 월 $3 예산을 넘음 → **무료 티어 조합이 전제**.

### 4.2 일일 호출 계획
| 작업 | API | 호출 수/일 |
|---|---|---|
| 순위표 (5대 리그 + UCL) | football-data.org | 6 |
| 일정·결과 (6개 대회) | football-data.org | 6 |
| 득점 순위 (6개 대회) | football-data.org | 6 |
| 한국 선수 시즌 기록 (5대 리그, 약 10명 내외) | API-Football | ~10 (소속팀 경기 다음 날만) |
| 포메이션용 라인업 | API-Football | 주 1회 몰아서, 하루 50회 이내로 분산 |
| **합계** | | football-data 18회 (분당 10회 지키도록 지연), API-Football 하루 ≤ 60회 |

### 4.3 API 리스크와 대체안
| 리스크 | 대체안 |
|---|---|
| API-Football 무료로 현재 시즌 조회 불가 | ① 한국 선수: football-data 득점 순위 + 경기 결과 + 뉴스로 '출전·득점 소식' 중심 표시 ② 포메이션: 표시 보류 또는 `configs/formations.json` 수동 입력(주 1회) |
| A매치 데이터 미제공 (친선전 등) | `configs/national-team.json`에 일정 수동 입력 + 결과는 뉴스로 반영 |
| 무료 정책 변경 | 데이터 수집 모듈을 어댑터 구조로 분리해 교체 가능하게 설계 |

---

## 5. 주요 콘텐츠 (정보 구조)

```
/                         홈: 오늘의 헤드라인 + 오늘 밤 볼 경기 + 한국 선수 하이라이트 + 내 팀 소식
/news                     뉴스 피드 (대회·팀·카테고리 필터)
/news/[date]              날짜별 아카이브
/competitions/[comp]      EPL · 라리가 · 세리에A · 분데스리가 · 리그1 · UCL — 순위, 일정·결과, 득점 순위
/teams/[team]             팀: 순위·최근 5경기 폼, 주요 선수, 주 포메이션, 한줄평, 관련 뉴스
/national-team            A매치: 한국 대표팀 일정·결과·소집 소식 + 주요국 A매치 뉴스
/korean-players           5대 리그 한국 선수 현황
/korean-players/[slug]    선수 상세: 시즌 기록, 최근 출전, 다음 경기, 관련 뉴스
/korean-players/weekly    한국 선수 주간 리포트 (B)
/transfers                이적시장 트래커 (C)
/my                       마이 팀 (E, localStorage)
/about                    소개, 출처·저작권 정책, 데이터 출처, 발행 시각
/rss.xml                  사이트 RSS (G)
```

### 5.1 주요 뉴스
- 카드: 한국어 제목 · 3줄 요약 · 대회/팀 태그 · 중요도(★1~5) · 출처명 · 원문 링크 · 발행 시각(KST)
- 카테고리: 경기 결과 / 이적 / 부상 / 감독·구단 / 대표팀 / UCL / 기타
- **동일 사건 클러스터링**: 여러 매체의 같은 소식은 1개 카드 + 출처 링크 여러 개 (요약 1회)

### 5.2 대회·팀 정보 (5대 리그 + UCL)
| 항목 | 데이터 출처 | LLM | 갱신 |
|---|---|---|---|
| 순위표 (리그 + UCL 리그 페이즈) | football-data.org | ❌ | 매일 |
| 최근 5경기 폼, 일정·결과 | football-data.org | ❌ | 매일 |
| 득점 상위 선수 | football-data.org | ❌ | 매일 |
| 주 포메이션 | API-Football 라인업 최빈값 (4.3 대체안) | ❌ | 주 1회 |
| **팀 한줄평** | 순위·폼·득실 지표 → LLM 1문장 | ✅ | 주 1회 |

- **팀 페이지 대상**: 5대 리그 96팀 + **UCL 참가 팀 중 5대 리그 외 팀 전체** (예: 포르투갈·네덜란드 등 구단)
  - 5대 리그 외 UCL 팀은 UCL 경기·순위 기준으로 페이지 구성, 한줄평도 동일하게 주 1회
- 한줄평 확장 로드맵: 한줄평 → 강점/약점 각 2개 불릿 → 전술 분석 단락(빅클럽 우선). 단계마다 비용 KPI 확인 후 진행
- 팀명·선수명 한글 표기는 `configs/names.ko.json` 정적 사전으로 관리

### 5.3 한국 선수 현황 (5대 리그 한정)
- 관리: `configs/korean-players.json` (이름, 소속, 리그, 포지션, API 선수 ID) — 시즌 시작 시점 최신 명단으로 작성
- 표시: 리그별 그룹 카드 · 이번 주 출전 여부·골/도움 · 시즌 누적 · 다음 경기(KST) · UCL 출전 여부 · 관련 뉴스
- 이적 감지: 뉴스에서 등록된 한국 선수명 + 이적 카테고리 감지 시 GitHub 이슈 자동 생성 → 수동 갱신
- 5대 리그 밖으로 이적한 선수는 목록에서 '기타 리그' 표시 후 기록 갱신 중단

### 5.4 A매치
- 한국 대표팀 일정·결과, 소집 명단 소식, 주요국 A매치 핵심 뉴스
- A매치 기간에는 홈 상단에 대표팀 섹션 자동 노출

### 5.5 MVP 추가 기능
| 코드 | 기능 | 구현 방식 | LLM 비용 |
|---|---|---|---|
| **A** | 오늘 밤 볼 경기 | 당일 18:00~익일 07:00 KST 경기 중 빅매치(순위·더비 규칙) + UCL 경기 + 한국 선수 소속팀 경기 자동 선별 | 0 |
| **B** | 한국 선수 주간 리포트 | 매주 월요일, 선수별 주간 기록을 1회 호출로 요약 | 주 1회 소량 |
| **C** | 이적시장 트래커 | 요약 결과의 이적 상태(루머/협상/합의/확정) + 출처 Tier(3.8)로 선수 단위 카드 | 추가 호출 없음 |
| **E** | 마이 팀 팔로우 | localStorage로 팀·선수 저장, 홈·피드 필터 (저장 실패 대비 try/catch) | 0 |
| **G** | PWA + RSS | manifest + 서비스워커, 빌드 시 `rss.xml` 생성 | 0 |

> 보류: D 주간 다이제스트/뉴스레터, F 빅매치 프리뷰, H 축구 용어 사전

---

## 6. 시스템 아키텍처

```
외부 크론 (06:30 KST) ──workflow_dispatch──▶ GitHub Actions: collect.yml
     (백업: schedule, 12h 내 성공 이력 있으면 skip)
                                   │
  ① 수집      RSS(영문·한국) + 유명 기자·블로그(Substack·목록 크롤링)
              + 뉴스 검색(Google News RSS·GDELT) + OG 메타 경량 크롤링
              + football-data.org / API-Football
  ② 정제(코드) URL 정규화·해시 중복제거 → 제목 유사도 클러스터링
              → 키워드·소스 가중치 점수화 → 상위 N개 선별
  ③ 가공(LLM) 신규 영문 클러스터만 Batches API로 요약 (Haiku)
              타임아웃 시 일반 API 소량 폴백 / 예산 초과 시 제목만 게시
  ④ 저장      data/*.json 커밋 (변경분만)
  ⑤ 빌드·배포 next build → Pagefind 인덱싱 → GitHub Pages (07:00 공개 목표)
```

- 유럽 저녁 경기는 KST 새벽 4~6시경 종료 → 06:30 수집 시작이면 대부분 결과 반영
- `concurrency: collect`로 직렬 실행, 실패 시 GitHub 이슈 자동 생성
- 실행 로그 `data/runs.json`: 수집 건수, 토큰, 비용, 실패 소스, API 호출 수

### 6.1 저장소 구조
```
euro-digest/
├─ .claude/                    # Claude Code 설정, 커스텀 커맨드 (/add-player, /add-source)
├─ .github/workflows/
│  ├─ collect.yml              # 일일 수집·요약·배포
│  ├─ weekly.yml               # 팀 한줄평 + 한국 선수 주간 리포트 + 포메이션
│  └─ deploy.yml
├─ configs/
│  ├─ sources.json             # 뉴스 소스 (lang, enabled, weight, tier, terms_checked)
│  ├─ competitions.json        # 5대 리그 + UCL · API ID · 시즌
│  ├─ names.ko.json            # 팀/선수 한글 표기 사전
│  ├─ korean-players.json      # 5대 리그 한국 선수
│  ├─ national-team.json       # A매치 일정 (수동)
│  ├─ bigmatch-rules.json      # 오늘 밤 볼 경기 선별 규칙
│  ├─ search-queries.json      # 뉴스 검색 쿼리 (Google News RSS·GDELT)
│  └─ prompts/                 # summarize / team-oneliner / weekly-kr
├─ data/
│  ├─ news/YYYY-MM-DD.json
│  ├─ competitions/{comp}.json
│  ├─ teams/{team}.json
│  ├─ players/korean.json
│  ├─ transfers.json
│  ├─ cache/seen-urls.json
│  └─ runs.json
├─ scripts/                    # collect / summarize / weekly / kpi / build-rss
│  └─ crawlers/                # 사이트별 목록 크롤러 (caughtoffside, dimarzio …)
├─ src/app/
├─ public/
├─ CLAUDE.md  DESIGN.md  README.md
└─ docs/  PRD.md  plan.md
```

### 6.2 뉴스 데이터 스키마
```json
{
  "id": "c_8f3a1b",
  "t": "한국어 제목",
  "s": ["요약1", "요약2", "요약3"],
  "cat": "transfer",
  "comp": ["EPL"],
  "teams": ["liverpool"],
  "players": [],
  "imp": 4,
  "kr": false,
  "transfer": { "status": "negotiating", "tier": 2 },
  "src": [{ "n": "BBC Sport", "u": "https://…", "at": "2026-10-09T20:10:00Z" }],
  "lang": "en",
  "created": "2026-10-09T21:30:00Z"
}
```

---

## 7. LLM 토큰 비용 절감 전략

| # | 전략 | 효과 |
|---|---|---|
| 1 | 코드로 선별 — 중복제거·클러스터링·점수화 후 상위 40~50건만 LLM 투입 | 호출 대상 50~70%↓ |
| 2 | 본문 크롤링 안 함 — 제목 + RSS 요약/og:description(최대 ~500자)만 | 입력 토큰↓ |
| 3 | Message Batches API (일 1회 비동기) | 단가 약 50%↓ |
| 4 | 1요청에 10~20건 묶음, 시스템 프롬프트 공유 | 반복 지시문 제거 |
| 5 | 프롬프트 캐싱 (고정 지시·카테고리·규칙) | 캐시 적중분 입력 단가↓ |
| 6 | 짧은 키 JSON, 요약 3문장 고정, `max_tokens` 상한 | 출력 토큰↓ |
| 7 | `seen-urls.json`으로 재요약 금지 | 중복 비용 0 |
| 8 | 고유명사 사전 치환 (코드 후처리) | 일관성↑ |
| 9 | 정형 데이터(순위·일정·기록)에는 LLM 미사용 | 팀 페이지 대부분 0 |
| 10 | 팀 한줄평·주간 리포트는 주 1회 | 일일 비용 고정 |
| 11 | 한국어 기사는 LLM 생략 | 한국 소스 ≈ 0 |
| 12 | 이적 상태 판정을 요약 호출에 통합 | 기능 추가 비용 0 |
| 13 | 비용 가드 — `MAX_ITEMS_PER_RUN`, `MONTHLY_BUDGET_USD=3` 누적 체크 | 예산 초과 방지 |

### 7.1 비용 추정 (가정치 — 실제 단가는 구현 시 확인)
| 작업 | 주기 | 규모 |
|---|---|---|
| 뉴스 요약 | 매일 | 약 45건 × (입력 ~250 + 출력 ~150 토큰) |
| 팀 한줄평 | 주 1회 | 약 110팀(5대 리그 96 + UCL 외부 팀) × (입력 ~200 + 출력 ~60 토큰) |
| 한국 선수 주간 리포트 | 주 1회 | 1회, 입력 ~2K + 출력 ~1K 토큰 |

- Haiku급 + 배치 할인 가정 시 **월 $1~2 예상**, 데이터 API는 무료 → **월 $3 상한 내**

---

## 8. 디자인 방향 (시안은 추후 별도 진행)

- 레퍼런스 없음 → 추후 콘셉트가 다른 시안 여러 개 제작 후 선택
- 공통 요구: 모바일 우선 카드 피드, 데스크톱 3단 레이아웃, 다크/라이트 모드, 한국어 본문 폰트 + 숫자 강조 폰트, 대회별 컬러 토큰(로고 미사용), 순위 변동 ▲▼·폼(W/D/L) 칩, Lighthouse 95+
- 선택된 시안 기준으로 DESIGN.md 작성 후 개발

---

## 9. 공개 서비스 고려사항

| 영역 | 내용 |
|---|---|
| 저작권·출처 | 본문 전재 금지, 3줄 이내 재서술, 매체명·원문 링크 필수, 기사 이미지 미사용, /about에 정책·삭제 요청 연락처 |
| RSS 약관 | 매체별 RSS 이용 조건을 `sources.json`의 `terms_checked`로 관리, 조건이 엄격한 매체(ESPN 등)는 제외 또는 원제목+링크만 |
| 상표·초상 | 구단·리그 로고, 선수 사진 미사용 |
| 데이터 이용약관 | football-data.org·API-Football 출처 표기 조건 준수, 푸터에 데이터 출처 표기 |
| 크롤링 예절 | robots.txt 준수, User-Agent에 서비스명·연락처 명시, 하루 1회, 요청 간 지연 |
| SEO | 페이지별 메타/OG, sitemap, 구조화 데이터(NewsArticle), 날짜별 고유 URL |
| 접근성 | WCAG AA 대비, 키보드 탐색, 색 외 텍스트 병기 |
| 품질 관리 | "입력에 없는 사실 금지" 규칙, 주 20건 샘플 리뷰, 오류 신고(GitHub 이슈 템플릿) |
| AI 생성 고지 | 요약이 AI로 생성되었음을 명시 |
| 보안 | 모든 키는 Actions Secrets, 정적 번들 포함 금지 |
| 저장소 용량 | 90일 지난 일별 JSON은 월별 병합 |

---

## 10. 개발 로드맵

| 단계 | 기간 | 범위 |
|---|---|---|
| **M0 셋업·검증** | 3~4일 | 서비스명 상표·저장소명 확인, 저장소·CLAUDE.md, Next.js export + Pages 배포, **RSS·기자 채널·크롤링 대상 실작동·약관/robots.txt 확인**, **Google News RSS·GDELT 쿼리 테스트**, **API-Football 현재 시즌 무료 조회 검증** |
| **M1 뉴스 MVP** | 1주 | RSS·기자 채널·뉴스 검색 수집 → 중복제거·클러스터링 → Batches 요약 → 피드·아카이브, 07:00 발행, 비용 가드 |
| **M2 대회·팀** | 1주 | 5대 리그 + UCL 순위·일정·결과, 팀 페이지(UCL 외부 팀 포함), **A 오늘 밤 볼 경기** |
| **M3 한국 선수·A매치** | 1주 | 5대 리그 한국 선수, 대표팀 페이지, **B 주간 리포트** |
| **M4 부가 기능** | 1주 | **C 이적 트래커**, **E 마이 팀**, 팀 한줄평, **G PWA·RSS**, 검색 |
| **M5 디자인·공개** | 1주 | 시안 선택·적용, SEO·접근성·분석, 정식 공개 |

---

## 11. KPI

| 항목 | 목표 |
|---|---|
| 월 총비용 (LLM + API) | ≤ $3 (일일 LLM ≤ $0.10) |
| 파이프라인 성공률 (30일) | ≥ 95% |
| 정시 발행 | 매일 07:00 KST ±15분 |
| 일일 신규 뉴스 카드 | 30~50건 |
| 중복 카드 | 0건 |
| 요약 품질 (주간 샘플 20건) | ≥ 90% 정확 |
| Lighthouse 성능 / 접근성 | ≥ 95 / ≥ 90 |

---

## 12. 남은 확인 사항

1. **서비스명 '유로 다이제스트'**: KIPRIS 상표, GitHub 저장소명(`euro-digest`) 사용 가능 여부 확인
2. **API-Football 무료 플랜의 현재 시즌 조회 가능 여부** (M0 검증) → 불가 시 4.3 대체안 적용
3. **국내 매체 RSS 제공 여부와 이용 조건**, Google News RSS 사용 조건
4. **2군 영문 매체·기자 채널 RSS 실작동 여부** (Plettenberg·Moretto·Di Marzio 등), CaughtOffside 작성자 페이지 robots.txt 허용 여부
5. **Google News RSS·GDELT 이용 조건**과 하루 쿼리 수 상한
6. **한국 선수 초기 명단**: 2026-27 시즌 5대 리그 소속 기준으로 M3 전 작성
7. **디자인 시안 진행 시점** (권장: M1 완료 후)
