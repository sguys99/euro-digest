# M5-16 정식 공개 체크리스트 (v0.1)

> 작성 2026-11-04 · plan M5-16 · PRD §11.1 운영 KPI · §12 릴리스 계획 · §15 D79
> **공개 기준(D79, 사용자 결정 2026-11-04)**: 이 체크리스트의 🙋 사용자 작업(§3)이 끝나면 공개를 선언한다. 정시 발행 KPI는 '10-28(cron-job.org 정상화) 이후 연속 정시 + 30일 창 충족 예정 11-26'으로 기록하고, 선언을 30일 창 충족까지 미루지 않는다.
> 사이트는 M1 첫 배포부터 공개·색인 허용 상태다(PRD §12 · D10). '공개 선언'은 KPI 확인을 마치고 문서상 정식 공개일을 정하는 절차다.

## 0. 한눈에

- **자동 점검(§2)은 모두 통과했다.** 공개 주소의 주요 쪽 18개와 sitemap 158개 URL이 모두 200이다. noindex 쪽은 sitemap에 없다. OG·파비콘·manifest·RSS·ics·sw가 열리고, `/status` 배포 완료 시각이 채워져 있다. GoatCounter 스크립트는 공개 주소에서만 실린다. FR-45 필수 문구도 있고, 최근 collect·weekly·CI·배포가 성공했다. 고친 코드는 없다.
- **KPI(§1)**: 성공률·비용·일 최대·카드 수·중복·성능 예산·접근성(자동)은 충족했다. 정시 발행은 10-28부터 8일 연속이고 30일 창은 11-26에 충족될 예정이다. **브리핑 정확도는 사전 판정 70%로 미달**이다. 사실은 100%이고, 미등록 선수 이름이 영문으로 남은 6줄이 원인이다. 사용자 확인이 필요하다(§3-④).
- **공개 전 결정 1건(권장)**: 팀 쪽 '읽을거리'의 출처(Spielverlagerung)가 `/about` 매체 목록에 없다(§2.6, M3 이월).

## 1. 운영 KPI 현재 값 (PRD §11.1)

기준 시각 **2026-11-04 18:12 KST**(09:12:48Z). `src/lib/ops-metrics.ts`(`collectRunStats`·`runStats`·`publishDays`·`monthBudgetUsage`·`spendInRange`)를 tsx로 불러 `data/runs.json`·`data/runs-dev.json`로 다시 계산했다. 30일 창은 KST 10-06 ~ 11-04(`/status`와 같은 창)다. 카드·중복은 `data/news/*.json`을 직접 셌다. 성능·접근성은 CI 실행 41795268317(f005ade, 11-04 08:10Z)의 값이다.

| KPI | 목표 | 현재 값 | 충족 | 충족 예정일 |
|---|---|---|---|---|
| 파이프라인 성공률(30일) | ≥ 95% | **96.3%**: collect 26/27(success 21 · partial 5 · failed 1 — 10-31 00:33 KST), weekly 2/2 | ✅ | — (10-31 실패는 11-30에 창 밖으로 나간다) |
| 정시 발행 | 계절별 목표(07:00/07:30) + 15분 이내 | **10-28 ~ 11-04 8일 연속 정시**(수집 완료 07:11 ~ 07:18 KST, 한도 07:45). 30일 창은 정시 9 · 늦음 11 · 결호 4 · 창간 전 6이다. 늦음·결호는 모두 10-27 이전, cron-job.org 정상화 전이다 | ⏳ (D79 — 연속 정시로 기록) | **11-26**(창 10-28 ~ 11-26이 모두 정시면 충족, 연속이 유지되는 경우) |
| 월 총비용 | ≤ $3 | 10월 **$0.1740**(5.80%, 확정 — prod $0.0458 · dev $0.1282) · 11월 **$0.1371**(4.57%, 11-04까지 — prod $0.0395 · dev $0.0977). dev 비율 3.26%로 50% 경고 아님 | ✅ | — (11월 확정은 12-01 기록) |
| 일 LLM 최대 | ≤ $0.10 | prod 최대 **$0.0300**(11-02 — 주간 배치 $0.0267 포함) · prod+dev 최대 $0.0996(10-17 — dev 실험일, 일 예산은 봇 실행이면 prod만 — D43) | ✅ | — |
| 일일 신규 카드 | 30 ~ 50건(휴식기 예외) | 10-17 이후 17개 호 모두 40 ~ 45장(평균 44.0). 30일 창 안의 10-12 · 13 · 14는 5 · 5 · 8장이다(M1 첫 슬라이스, 소스 확장 전) | ✅ (현행) | 첫 3개 호는 11-13에 창 밖으로 나간다 |
| 중복 카드 | 0건 | 같은 날 중복(ID · 원문 URL) 0. 날짜를 건넌 중복은 10-17(seen-urls 도입) 이후 0이다. 창 안 1건(`c_fb2dd57b4a` 10-12 → 10-13 재게시)은 seen-urls 도입 전에 생겼다 | ✅ (현행) | 그 1건은 11-12에 창 밖으로 나간다 |
| 모바일 성능 예산 | LCP ≤ 2.0s · CLS ≤ 0.05 · 초기 JS ≤ 160KB | CI 10쪽 중앙값 LCP **1.48 ~ 1.62s** · CLS **≤ 0.0012** · 초기 JS 최대 **152.9KB**(95.6%, 홈 · 검색). 성능 점수 81 ~ 95는 기록 · 회귀 감시만 하고, 회귀 경고는 '이상 없음'이다(D78) | ✅ (자동) · 🙋 iPhone 첫 방문 CLS(D78 ③) | 실기기 측정(§3-①) |
| Lighthouse 접근성 | ≥ 90 | **96 ~ 100**(최저 96 — `target-size` 하단 탭, `m5-accessibility.md` §1.3). axe e2e 매 push 통과(1754 passed) | ✅ (자동) · 🙋 스크린리더 실기기(M5-06) | 실기기 확인(§3-①) |
| 브리핑 정확도(주간 20줄) | ≥ 90% | **사전 판정 70%**(발행본 — 사실·표기·문법 모두 ✅ 14/20). 사실 20/20(100%), 표기 ❌ 6(미등록 이름 영문 잔존), 지금 사전으로 다시 치환하면 80%. 상세는 [`m5-brief-accuracy.md`](m5-brief-accuracy.md) | ❌ (사전 판정) · 🙋 사용자 확인 | `/add-name` 8명 확정 뒤 다음 주 표본(11-04 ~ 11-10)으로 다시 판정 |

## 2. 자동 점검 결과 (2026-11-04 18:00 ~ 18:30 KST, 공개 주소 GET만)

### 2.1 `npm run verify:deploy` — 통과(18개 항목)
홈 200 · `lang=ko` · 제목에 '유로 다이제스트'. 자산 13개 200. 404 쪽은 404이고 홈 링크가 있다. `/euro-digest`는 301로 `/euro-digest/`에 간다.

### 2.2 주요 쪽 · 자산 (curl, 캐시 우회 쿼리)
- **쪽 18개 모두 200**: `/` · `/news/` · `/news/2026-11-04/` · `/competitions/epl/` · `/competitions/ucl/` · `/teams/bayern-munchen/` · `/korean-players/` · `/korean-players/weekly/` · `/korean-players/weekly/2026-44/` · `/national-team/` · `/transfers/` · `/tonight/` · `/search/` · `/my/` · `/about/` · `/privacy/` · `/status/` · `/offline/`. 견본 `/specimen/`은 404다(공개 빌드에 없다).
- **OG**: `og/default.png` · `og/news/2026-11-04.png` · `og/competitions/epl.png` · `og/teams/bayern-munchen.png` · `og/pages/status.png` · `og/pages/about.png`가 모두 200 `image/png`다. 홈 · 날짜 · 팀 · `/about`의 `og:image`는 각자 맞는 PNG를 가리키고, 그 주소도 200이다. `twitter:card`는 `summary_large_image`, canonical은 자기 주소다.
- **아이콘**: `favicon.ico`(`image/vnd.microsoft.icon`) · `favicon.svg` · `icons/icon-192 · 512 · maskable-512 · monochrome-512 · apple-touch-icon.png`가 모두 200이다. `<link rel=icon>` 2개, apple-touch-icon, manifest, RSS alternate가 홈 `<head>`에 있다.
- **manifest**: `application/manifest+json`이다. `id`·`start_url`·`scope`는 `/euro-digest/`, `display: standalone`, `background_color #9E2F28`이고 아이콘 4개(any · maskable · monochrome)가 있다.
- **피드 · 캘린더 · 기타**: `rss.xml` 30항목 · `rss/korean.xml` 30항목(`application/xml`) · `calendar/korean.ics` VEVENT 235(`text/calendar`) · `sw.js` · `pagefind/pagefind.js` 200.

### 2.3 sitemap
`sitemap.xml` 200이고 URL은 158개다(홈 1 · 뉴스 20 · 대회 6 · 팀 111 · 한국 선수 15 · 대표팀 · 이적 · 오늘 밤 · about · privacy 각 1). **158개 모두 200이고 `<meta name="robots">`가 없다**. noindex 쪽(`/status/` · `/my/` · `/search/` · `/offline/` — 각 쪽에 `noindex` 메타가 있음을 확인)과 404 · 견본은 sitemap에 없다.

### 2.4 `/status` 배포 완료 시각
- 최근 CI 배포(실행 41795268317, 빌드 job 로그)에 **"배포 기록 200건 (GraphQL 2회, 커밋 시각 없음 0건)"**이 찍혔다. 11-04 아침 collect 배포(실행 41728410767)는 "배포 기록 100건"이었는데, 이 판의 로그 줄에는 커밋 시각 집계가 없다(M5-13에서 그 집계를 넣기 전 판).
- 공개 `/status/`의 발행일 띠에는 날마다 '배포 완료 hh:mm'이 채워져 있다. 예: 11-04 '수집 완료 07:15 · 배포 완료 07:18'은 collect 배포 job 완료 22:18:41Z와 맞다. 11-03 07:20, 11-02 07:20, 10-30 07:13도 채워져 있다.

### 2.5 GoatCounter (Playwright Chromium — `gc.zgo.at` · `goatcounter.com` 요청은 route로 모두 abort, 집계 요청 0)
- 공개 주소 `/`와 `/about/`을 열면 `https://gc.zgo.at/count.v5.js` 요청이 1건씩 생긴다(abort됨). DOM의 스크립트 태그는 `integrity` sha384 · `crossorigin=anonymous` · `data-goatcounter=https://euro-digest.goatcounter.com/count`다(D75).
- **다른 origin**(`http://127.0.0.1:9/euro-digest/` — 공개 HTML을 그대로 넘겨 흉내)에서는 요청이 0건이다. 공개 주소에서만 싣는다는 뜻이다.
- curl로 받은 공개 HTML에는 `zgo.at`이 0건이다. 스크립트를 동적으로 주입하므로 정상이다.

### 2.6 `/about` 출처 · FR-45
- 섹션: 발행 시각 · 출처·저작권 정책 · 출처 Tier · AI 작성 고지 · 데이터 출처 · 삭제·정정 요청.
- 매체 목록은 일일 수집 매체(`enabled && terms_checked` + 일일 RSS 루프 — `src/lib/about.ts`)다. BBC Sport · The Athletic · the Daily Briefing · Di Marzio · Relevo · 인터풋볼 · 풋볼리스트 · 베스트일레븐이 모두 보인다.
- **FR-45 필수 문구 "Football data provided by the Football-Data.org API"**가 `/` · `/about/` · `/news/2026-11-04/` · `/status/`에 원문 그대로 있다. 데이터 출처에는 API-Football을 병기한다.
- ⚠ **발견(공개 전 결정 권장)**: 주 1회 분석 블로그 소스 **Spielverlagerung**(type `analysis`, D66)은 `/about` 매체 목록에 없다. 이 글은 팀 쪽 '읽을거리'(`data/teams/*.json` `reading`)에 실린다. `about.ts`가 일일 RSS 루프만 세기 때문이고, plan M3 이월 '분석 블로그 `/about` 출처 표기'가 아직 열려 있다. 문구와 위치를 정해야 하는 일이라 고치지 않았다(§3-⑥).

### 2.7 최근 Actions
| 워크플로 | 최근 실행 | 결과 |
|---|---|---|
| Collect | 11-04 07:10 KST dispatch(겨울 슬롯) → 수집 · 빌드 · 커밋 · 배포 성공(22:18:41Z). 06:30 dispatch(여름 슬롯)와 백업 schedule 2회(10:38 · 11:22 KST)도 success다. 셋 모두 '실행 판단(계절 · 12시간 가드)' job에서 끝났고 collect job은 skipped였다(여름 슬롯은 계절 가드, 백업은 같은 발행일 성공 이력) | ✅ |
| Weekly | 11-02 dispatch(W44 발행) · 11-02 schedule(가드 `already-published`로 건너뜀) · 11-02 dispatch(`only team-profiles`) 모두 success | ✅ (정기 '자동' 실행 확인은 11-09) |
| CI(+배포) | 최근 4회(11-04 06:29 ~ 07:52Z) success: 검사 · 견본 · Lighthouse · 배포 job 모두 성공. 같은 날 01:10 ~ 06:26Z의 실패 7회(취소 1회는 따로)는 모두 Lighthouse job 단언 실패였다. M5-08로 이 job을 도입하고 조정하던 중이었고, 0207f50(fonts-noto-cjk) 뒤로는 통과한다 | ✅ |
| Deploy(단독 dispatch) | 마지막 10-17(롤백 리허설) success. 평소 배포는 CI · Collect · Weekly가 재사용 호출한다 | ✅ |

### 2.8 고친 것
없다. 코드 · 데이터 변경은 0이고 문서만 추가했다.

## 3. 🙋 사용자 작업 (끝나면 공개 선언)

- [ ] **① 실기기 확인** — [`m5-accessibility.md`](m5-accessibility.md) §5. 결과는 그 문서 체크박스에 표시하거나 plan M5-06 · M5-12에 적는다.
  - [ ] §5.1 구독 · 설치(RSS 리더 2피드 · iPhone/Mac webcal · Android .ics · Outlook · Android/iOS 홈 화면 설치 · 다크 모드 설치 앱 색). 기대: 원제목 · 원문 링크 그대로, 일정 시각이 KST, 독립 창으로 열림, 오프라인에서 최근 3일 호를 볼 수 있음
  - [ ] §5.2 아이콘 · 스플래시(테마 아이콘 · maskable · iOS 아이콘 · 스플래시 `#9E2F28` · favicon 라이트/다크). 기대: ED가 잘리지 않음, 흰 여백 없음
  - [ ] §5.3 스크린리더 흐름 1 ~ 3(VoiceOver · TalkBack). 기대: 머리말 · 랜드마크로 이동, 'AI 작성' 라벨이 읽힘, ▲▼ 기호 대신 '상승/하락'으로 읽힘, 결과 가림 상태에서 스코어가 읽히지 않음
  - [ ] §5.4 iOS Safari · Samsung Internet(세로 글자 · 안전 영역 · 검색 대화상자 · 컨테이너 쿼리 · `:has()` · 결과 가림 첫 화면 · 테마 · 글자 크기 · 공유). 기대: 겹침 · 깜빡임 · 튐 없음
  - [ ] §5.5 iPhone 첫 방문 CLS(홈 · 최신 날짜, 캐시 비우기). 기대: shift 합 ≤ 0.05. 넘으면 기기 · iOS 버전 · 값을 적어 전달한다(Apple SD Gothic Neo 보정 면 추가 — D78 ③)
  - [ ] (결정) `m5-accessibility.md` §6-1 `target-size` 96 ~ 97을 그대로 둘지 정한다. 추천은 A(그대로)다
- [ ] **② Google Search Console**
  1. 속성 추가 → **URL 접두어** `https://sguys99.github.io/euro-digest/`(D59 · D74 — 도메인 속성이나 블로그 저장소 robots.txt는 쓰지 않는다)
  2. 소유권 확인 방법을 고른다. 'HTML 파일'이면 받은 파일을, 'HTML 태그'면 `content` 값을 에이전트에게 넘긴다. 에이전트가 `public/`이나 레이아웃 메타에 넣어 배포한다(코드 변경이 생기므로 따로 커밋한다)
  3. Sitemaps → `https://sguys99.github.io/euro-digest/sitemap.xml` 제출. 기대: 상태 '성공', 발견된 URL 약 158개(호가 늘면 더 많다)
  4. **리치 결과 테스트 2쪽**: `https://sguys99.github.io/euro-digest/news/2026-11-04/`(이날의 5줄 `NewsArticle` · `CollectionPage`)와 `https://sguys99.github.io/euro-digest/competitions/epl/`(다가오는 경기 `SportsEvent`). 기대: 구조화 데이터를 읽고 **오류 0**. 이미지 · 로고 같은 권장 필드 경고는 D74 · 이미지 자산 금지(CLAUDE §1-6) 결정대로 허용한다. 리치 결과 '해당 없음'으로 나오면 schema.org Markup Validator로 오류 0만 확인한다
  5. (며칠 뒤) URL 검사에서 홈 · 최신 날짜가 '색인 생성됨' 또는 '크롤링됨'인지 본다
- [ ] **③ GoatCounter**(`https://euro-digest.goatcounter.com`)
  1. Settings → 시간대 **Asia/Seoul**(아침 집중도 KPI가 KST 기준 — PRD §11.2)
  2. 본인 방문 제외: Settings의 무시 IP(Ignore IPs)에 본인 IP를 넣는다. 기기마다 하려면 공개 주소에 `#toggle-goatcounter`를 붙여 연다(count.js의 브라우저별 제외 기능이다. 알림이 뜨지 않으면 IP 방식만 쓴다)
  3. 첫 수신 확인: 제외를 걸기 전이나 다른 기기에서 홈을 한 번 연다. 기대: 대시보드에 `/euro-digest/` 경로 페이지뷰 1(쿼리 없음, D75). 이벤트(`out/…` · `feed/…`)는 원문이나 RSS 링크를 누르면 생긴다
- [ ] **④ 브리핑 판정 확인** — [`m5-brief-accuracy.md`](m5-brief-accuracy.md) §2의 `사용자 확인` 칸에 ✅/❌를 넣는다(빈 칸이면 사전 판정을 받아들인 것으로 본다). 함께 정할 것:
  - [ ] 영문 잔존을 KPI ❌로 셀지(M1-43과 같이 셀 것인지)
  - [ ] `/add-name`으로 8명(Daniel Birligea · Leandro Cabrera · Andrea Pinamonti · Thierno Barry · Nicola Zalewski · Olivier Giroud · Fábio Silva · Kai Havertz)의 표기를 확정할지. 추천은 확정이다
- [ ] **⑤ 11-09(월) 주간 정기 실행 + cron-job.org 주간 작업**
  1. 그 전에 cron-job.org에서 **주간 작업(월 08:05 KST, Asia/Seoul → `weekly.yml` workflow_dispatch, 본문 `{"ref":"main"}`)이 활성**인지, 최근 실행 응답이 2xx인지 확인한다. 일일 작업 2개(06:30 · 07:10)도 함께 확인한다
  2. 11-09 08:05 이후 Actions → Weekly가 success인지, `chore(data): 2026-11-09 주간 발행 (2026-45)` 커밋과 배포가 있는지, Step Summary에 'W45 누락 가능'이 없는지, 운영 리포트 이슈가 생겼는지 본다. 기대: cron-job.org(주 경로)나 08:00 schedule(백업) 가운데 하나가 발행하고 다른 하나는 가드로 건너뜀
  3. 확인되면 plan M3 '월요일 자동 실행' [x] → M3 ✅
- [ ] **⑥ (권장) `/about` 분석 블로그 출처 표기** — Spielverlagerung(팀 쪽 '읽을거리')을 `/about` 매체 목록에 넣을지, 넣는다면 위치와 문구를 정한다(§2.6). M3 이월 항목이다

## 4. 공개 선언 때 할 일 (§3 완료 뒤 — 에이전트)

- [ ] `docs/plan.md`: §1 대시보드 M5 행에 완료일과 ✅. M5-16 · M5-06 · M5-12 [x]. ✅ M5 완료 기준 4줄을 갱신한다. 정시 발행은 D79 문구('10-28 이후 연속 정시 · 30일 창 11-26')로 적는다. §1 현재 위치 · 다음 작업을 '정식 공개 — 운영 루틴(§16)'으로 바꾼다
- [ ] `CLAUDE.md` 머리 '현재 단계' → '정식 공개(YYYY-MM-DD) — 운영 단계'(문서 버전은 v0.1 그대로 — CLAUDE §1-9)
- [ ] `README.md`: 상태 문구를 개발 중에서 공개로 바꾸고 공개일을 넣는다
- [ ] `docs/PRD.md` §12: M5 행 또는 표 아래에 **정식 공개일**을 적는다. D79에 선언일을 덧붙인다
- [ ] (선택) `/about`에 공개일 표기 — 화면 문구 변경이라 사용자 확인 뒤에만

## 5. 공개 뒤 루틴 (plan §16과 연결)

plan §16을 정기 루틴으로 삼는다(매주 월요일 운영 리포트 이슈 · 브리핑 20줄과 카드 20건 검수 · `/add-name` / 매월 1일 비용 기록 · 소스 정리 · cron-job.org 작업 활성 확인). 이번 공개와 함께 날짜가 정해진 일은 아래와 같다.

| 날짜 | 할 일 | 근거 |
|---|---|---|
| 11-09(월) | 주간 정기 실행 확인 → M3 ✅ · 운영 리포트 이슈 첫 정기 생성 · 브리핑 표본 11-04 ~ 11-10(`npm run quality:sample -- --from 2026-11-04 --to 2026-11-10 --out docs/research/<새 문서>.md` — M1 문서를 덮어쓰지 않게 `--out`을 쓴다) | plan M3 · §16 · D24 |
| 11-12 · 11-13 | 30일 창에서 중복 1건(10-13)과 초기 소량 호(10-12 ~ 14)가 빠진다 — `/status` · 운영 리포트 값 확인 | §1 |
| 11-16 이후 | `@lhci/cli` 0.16 검토. 0.16.0은 11-02에 나와 2주 규칙상 보류 중이다. 올릴지는 기준선 · 단언 회귀를 확인하고 정한다 | D78 ④ · `m5-performance.md` §2 · §9 |
| 11-26 | **정시 발행 30일 창 충족 확인**(10-28 ~ 11-26 모두 정시면 KPI ✅) — plan M5 완료 기준 · D79에 적는다 | D79 · D48 |
| 11월 말 | `/tonight` 오늘 밤 가중치 재검토(`docs/research/m5-tonight-weights.md`) | D76 |
| 11-30 | 성공률 창에서 10-31 실패가 빠진다(참고) | §1 |
| 12-01 | 11월 비용 확정 → plan §16.1 표 · PRD §9.3 실측 갱신, cron-job.org PAT · 작업 3개 활성 확인 | plan §16 · §16.1 |

## 6. 재현 방법

- KPI: 이 문서 §1 값은 `src/lib/ops-metrics.ts` 함수를 직접 부르는 임시 스크립트로 계산했다(파일로 남기지 않음). 같은 값은 `/status`(성공률 · 30칸 띠 · 월 사용률)와 `npm run ops-report -- --dry`(주간)에서도 볼 수 있다.
- 자동 점검: `npm run verify:deploy` · `curl -s -o /dev/null -w '%{http_code}' https://sguys99.github.io/euro-digest/<경로>` · sitemap `<loc>` 전수 GET · `gh run view <id> --log --job <배포 빌드 job>`에서 '배포 기록' 줄 · Playwright `context.route(/zgo\.at|goatcounter\.com/, r => r.abort())`.
