# 유로 다이제스트 (Euro Digest)

> 매일 아침, 밤사이 유럽 축구를 한눈에.

밤사이 끝난 유럽 축구 경기를 한국어 브리핑 "오늘의 5줄"로 정리하고, 해외·국내 매체 뉴스는 원제목 그대로 같은 사건끼리 묶어 한국어 태그를 붙인 뒤 원문으로 연결하는 정적 웹사이트입니다. 하루 한 번 아침에 발행하고, 광고·회원가입·댓글이 없습니다.

- **사이트**: <https://sguys99.github.io/euro-digest/>
- **범위**: 5대 리그(프리미어리그·라리가·세리에 A·분데스리가·리그 1)와 UEFA 챔피언스리그, 한국 선수, 한국 대표팀 A매치
- **현재 상태**: 마지막 마일스톤 M5(다듬기·정식 공개)를 진행하고 있습니다(2026-11-04 기준). 공개 체크리스트(M5-16)를 통과하면 정식 공개를 선언합니다. 진행 현황은 [docs/plan.md](docs/plan.md) §1 대시보드에서 볼 수 있습니다.

## 매일 무엇을 하나

| 시점 | 내용 |
|---|---|
| 매일 아침 | 전날 경기 결과·순위·득점자 같은 **경기 데이터**로 "오늘의 5줄" 브리핑을 쓰고(AI 작성 줄에는 라벨 표시), 뉴스 카드 30~50장(휴식기는 더 적게)을 발행합니다. 대회 순위·일정·결과, 팀 페이지, 한국 선수 기록, 이적 트래커도 함께 갱신합니다 |
| 매주 월요일 | 팀 한줄평·강점/약점(5경기 이상 치른 팀), 한국 선수 주간 리포트, 운영 리포트(비용·성공률·소스 건강도) |

발행 시각은 계절에 따라 다릅니다. 유럽 서머타임 기간(3월 마지막 일요일 ~ 10월 마지막 일요일)은 **07:00 KST**, 유럽 표준시 기간은 **07:30 KST**에 공개합니다. 겨울에는 유럽 밤 경기가 한국 시간으로 더 늦게 끝나기 때문입니다(예: 챔피언스리그 21:00 CET 경기는 KST 06:55 무렵 종료). 계절은 코드가 판정합니다(`src/lib/time.ts`).

### 주요 페이지

| 경로 | 내용 |
|---|---|
| `/` | 홈 — 오늘의 5줄, 머리기사·뉴스 카드, 오늘 밤 볼 경기, 리그 순위 미니 |
| `/news/` · `/news/YYYY-MM-DD/` | 뉴스 피드(대회·팀·카테고리 필터) · 날짜별 아카이브(그날의 5줄 포함) |
| `/competitions/{epl·laliga·seriea·bundesliga·ligue1·ucl}/` | 대회 순위·일정·결과·득점 순위 |
| `/teams/{team}/` | 팀 페이지 — 한줄평·강점/약점, 주요 선수, 포메이션, 일정 |
| `/korean-players/` · `/korean-players/weekly/` | 한국 선수 현황·상세 · 주간 리포트(ISO 주차 아카이브) |
| `/tonight/` · `/national-team/` · `/transfers/` | 오늘 밤 볼 경기(KST) · A매치 · 이적시장 트래커(진행 단계·출처 Tier) |
| `/my/` · `/search/` | 마이 팀(브라우저 저장, 로그인 없음) · 정적 검색 |
| `/about/` · `/privacy/` · `/status/` | 소개·출처 정책·AI 고지·삭제 요청 · 개인정보 처리방침 · 공개 상태(마지막 발행·최근 30일 성공률·소스 건강도·이번 달 비용 사용률) |
| `/rss.xml` · `/rss/{comp}.xml` · `/rss/korean.xml` | 전체 · 대회별 · 한국 선수 RSS |
| `/calendar/{team}.ics` · `/calendar/korean.ics` | 팀 · 한국 선수 소속팀 경기 캘린더(webcal 구독) |

홈 화면 설치(PWA)와 오프라인 읽기, 결과 가리기(스포일러 방지) 모드를 지원합니다.

## 설계 원칙

- **LLM 호출은 3곳뿐**입니다: 경기 데이터 기반 일일 브리핑(매일), 팀 한줄평 + 강점/약점(주 1회), 한국 선수 주간 총평(주 1회). 수집·중복 제거·뉴스 분류(카테고리·태그·이적 단계·스포일러)·순위·고유명사 한글 표기·이적 상태 집계는 모두 코드가 합니다.
- **기사는 LLM에 넣지 않습니다.** 제목·설명을 포함해 어떤 기사 텍스트도 입력하지 않습니다. 해외 기사는 번역·요약하지 않고 피드의 원제목과 링크를 그대로 게시합니다. 브리핑 입력은 경기 결과·순위·득점자 같은 정형 데이터뿐이고, 입력에 없는 사실은 쓰지 않습니다(코드 검증기가 스코어·순위 서술을 입력과 대조하고, 어긋난 줄은 정해진 문형으로 바꿉니다).
- **이미지 자산이 없습니다.** 기사 이미지·구단/리그 로고·선수 사진을 쓰지 않습니다. 팀은 팀 컬러 이니셜 배지로, 나머지는 타이포·색·도형으로 표현합니다.
- **결과 가리기**: 켜면(기본 꺼짐) 경기 결과가 드러나는 카드 제목, 오늘의 5줄의 결과 줄, 순위 변동, 스코어를 흐리게 가리고 탭하면 보여 줍니다. 설정은 브라우저에만 저장합니다. 공유 이미지(OG)와 구조화 데이터에는 처음부터 경기 결과를 넣지 않습니다.
- **본문을 수집하지 않습니다.** 제목·RSS 요약·`og:description`만 쓰며, 이용 약관을 확인한 소스만 수집합니다.

## 동작 방식

```
cron-job.org (여름 06:30 · 겨울 07:10 KST) → GitHub Actions collect.yml   (백업 schedule: 여름 06:40 · 겨울 07:20)
 ① 수집     약관을 통과한 매체 RSS · 목록/OG 메타 + 전날 경기 데이터(football-data.org · API-Football)
 ② 정제·분류 URL 정규화 · 중복 제거 · 같은 사건 묶기 · 중요도 점수 · 상위 45건 · 한국어 태그        ← 코드
 ③ 브리핑   정형 경기 데이터만 Claude Haiku(Messages API 단건)에 → "오늘의 5줄"
            → zod 검증 → 코드 검증 → 1회 재시도 → 실패하면 코드 템플릿 문장(발행은 멈추지 않음)
 ④ 검증     configs·data 스키마 + 발행 검증 게이트 — 실패하면 발행 산출물을 커밋하지 않고 전날 사이트 유지
 ⑤ 빌드     OG 이미지 → next build(정적 export) → Pagefind 검색 색인 → RSS · ics → 서비스 워커
 ⑥ 발행     data/ 커밋 → deploy.yml → GitHub Pages   (공개 목표: 여름 07:00 · 겨울 07:30 KST, 늦어도 +15분)

월요일      weekly.yml: 팀 프로필 · 한국 선수 주간 총평(Message Batches API) · 분석 블로그 · 운영 리포트 이슈 → 빌드 → 배포
코드 push   ci.yml 검사(check · build · 번들 예산 · e2e · Lighthouse) 통과 → 배포
```

계절에 맞지 않는 트리거는 가드가 건너뛰고, 브리핑은 공개 목표 10분 전(여름 06:50 · 겨울 07:20)까지만 시도합니다. 비용 가드(하루 `$0.10`·월 `$3`)를 넘길 것으로 예상되면 LLM 없이 템플릿 문장으로 게시합니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, `output: 'export'`, `basePath: '/euro-digest'`) · React 19 · TypeScript 6 (strict) |
| 스타일 | Tailwind CSS 4 · shadcn/ui 패턴(커스텀) — 토큰은 [DESIGN.md](DESIGN.md) → `src/app/globals.css` |
| 스키마·실행 | zod 4(configs·data·LLM 출력 경계 검증, `src/lib/schema/`) · tsx · Node.js 24(`.nvmrc`) · npm |
| LLM | Claude Haiku 5.5 · `@anthropic-ai/sdk` — 일일 브리핑은 Messages API 단건, 주간 2곳은 Message Batches API, 호출은 `scripts/lib/llm.ts`에서만 |
| 수집·데이터 | rss-parser · football-data.org(주) · API-Football(보조, 경기 단건 조회) |
| 검색·분석 | Pagefind(빌드 후 색인) · GoatCounter(쿠키리스 — 유일한 서드파티 스크립트) |
| 테스트·품질 | Vitest · Testing Library · Playwright(+axe) · Lighthouse CI(`@lhci/cli`, 측정 전용) · ESLint · Prettier |
| 배포 | GitHub Actions → GitHub Pages |

성능 예산: 초기 JS ≤ 160KB(gzip) · LCP ≤ 2.0초 · CLS ≤ 0.05(모바일), Lighthouse 접근성 ≥ 90. CI가 매 push마다 확인합니다.

## 로컬에서 실행하기

요구 사항: Node.js 24(`.nvmrc`, `engines: >=24`), npm.

```bash
nvm use                       # Node 24
npm ci
cp .env.example .env.local    # 선택 — 실제 수집·브리핑을 돌릴 때만 키를 채운다
npm run dev                   # http://localhost:3000/euro-digest/
```

`basePath`가 `/euro-digest`라서 `http://localhost:3000/`이 아니라 `/euro-digest/` 경로로 엽니다. 저장소에 커밋된 `data/`로 화면이 바로 뜨므로 `dev`·`build`·`check`는 API 키 없이 동작합니다. `.env.local`은 커밋하지 않으며, 배포 환경의 키(`ANTHROPIC_API_KEY`·`FOOTBALL_DATA_API_KEY`·`API_FOOTBALL_KEY`)는 GitHub Actions Secrets로만 관리합니다.

정적 빌드 미리보기:

```bash
npm run build      # OG → next build → 검색 색인 → RSS·ics → 서비스 워커 → out/
npm run preview    # http://127.0.0.1:4173/euro-digest/ (GitHub Pages처럼 basePath 아래로 서빙)
```

처음 `npm run test:e2e`나 빌드(OG 굽기)를 돌리기 전에는 `npx playwright install chromium`으로 브라우저를 설치합니다.

### 주요 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `preview` | 개발 서버 / 정적 export(`out/`) / 미리보기 서버 |
| `npm run check` | typecheck + lint + 단위 테스트 — **커밋 전 필수** |
| `npm run test` / `test:watch` | Vitest 단위 테스트(LLM은 항상 mock) |
| `npm run test:e2e` | Playwright — 375·1280px, 링크·axe 접근성·스크린샷. 먼저 `npm run build`. `E2E_ENGINE=webkit`이면 WebKit(수동 실행 전용) |
| `npm run test:specimen` | 기초 컴포넌트 견본 빌드(`SPECIMEN=1`, 공개 빌드에는 없음) + 검사 |
| `npm run check:bundle` | 쪽별 초기 JS 예산(160KB gzip) + `out/` 비밀값 검사. 먼저 `npm run build` |
| `npm run lighthouse` | Lighthouse 모바일 10쪽 × 3회(`lighthouserc.json`, 회귀 기준선 `lighthouse-baseline.json`) |
| `npm run format` / `format:check` / `lint` / `typecheck` | Prettier / ESLint / `tsc --noEmit` |
| `npm run validate` | configs·data 스키마 + 발행 검증 게이트(`-- --configs-only`로 configs만) |
| `npm run collect` | 수집 → 정제·분류 → 데이터 브리핑 → 검증 (**실제 LLM 호출**) |
| `npm run summarize` | 일일 데이터 브리핑 단계만 따로 실행 |
| `npm run weekly` | 팀 프로필 · 한국 선수 주간 리포트 · 운영 리포트 (`--write` 없으면 미리보기) |
| `npm run eval:prompt` | 프롬프트 골든셋 회귀 평가 — 수정 전후 출력 비교 (실제 LLM 호출, 소량) |
| `npm run ops-report -- --dry` | 지난 주 운영 리포트 미리보기(LLM 없음) |
| `npm run new-season:check` | 시즌 전환 준비 읽기 전용 점검 |
| `npm run fetch:competitions` / `build:teams` / `build:players` / `build:transfers` | 대회 · 팀 · 한국 선수 · 이적 데이터 단계만 따로 실행 |
| `npm run build:og` / `build:icons` / `build:search` | OG 이미지 · 앱 아이콘 · 검색 색인만 따로 생성 |
| `npm run verify:deploy` | 배포된 사이트를 HTTP로 확인 |
| `npm run observe` / `quality:sample` / `probe:gdelt` | 발행 관찰 · 품질 검수표 · GDELT 재측정(M1 운영 도구) |

> **비용 주의** — `collect`·`summarize`·`weekly`·`eval:prompt`는 실제 Claude API를 호출합니다. 개발 중에는 소량·모의 실행을 쓰세요(`npm` 뒤의 `--`를 빼면 옵션이 전달되지 않습니다).
>
> ```bash
> npm run collect -- --limit 5          # 처리 건수 제한
> npm run collect -- --limit 5 --dry    # data/에 쓰지 않고 결과만 출력 (LLM은 호출함)
> npm run collect -- --mock             # LLM 대신 fixtures/llm/ 응답 (LLM_MODE=mock과 같음, 비용 0)
> ```
>
> 개발 중 실제 호출의 토큰·비용은 `data/runs-dev.json`에 남겨 커밋하고, 봇 실행(`data/runs.json`)과 합산해 월 예산을 관리합니다.

## 운영

| 상황 | 하는 일 |
|---|---|
| 매일 | 자동 발행. 실패하면 Actions가 이슈를 만들고, 검증 게이트·빌드가 실패한 날은 전날 사이트가 그대로 남습니다(실행 기록만 커밋) |
| 매주 월요일 | 운영 리포트 이슈(비용·실행 성공률·브리핑 상태·소스 건강도·미등록 고유명사) 확인, 브리핑 20줄·카드 20장 검수, `/add-name`으로 고유명사 반영 |
| 언제든 | [`/status/`](https://sguys99.github.io/euro-digest/status/)에서 마지막 발행 시각·최근 30일 성공률·소스 건강도·이번 달 비용 사용률 확인 |
| 잘못된 발행 | 해당 `chore(data): … 발행` 커밋 revert → `deploy.yml` 수동 실행 → 원인 이슈 기록 |
| 삭제·정정 요청 | Claude Code `/takedown <card-id>` → `configs/takedowns.json` 등록 → 재빌드·배포(접수 후 72시간 이내) |
| 시즌 전환(7~8월) | `/new-season` 체크리스트 + `npm run new-season:check` |

운영 규칙 전체는 [CLAUDE.md](CLAUDE.md) §10·§12와 [docs/plan.md](docs/plan.md) §16에 있습니다. `06:00~08:00 KST`에는 봇 발행과 겹치지 않도록 사람이 push하지 않습니다.

## 비용 (실측)

`data/runs.json`(봇) · `data/runs-dev.json`(개발) 기준. 축구 데이터 API 두 곳은 무료 플랜이라 $0입니다.

| 달 | 봇(prod) | 개발(dev) | 합계 | 월 예산 $3 대비 |
|---|---|---|---|---|
| 2026-10 | $0.0458 | $0.1282 | $0.1740 | 5.8% |
| 2026-11 (11-04까지) | $0.0394 | $0.0977 | $0.1371 | 4.6% |

봇 운영만 보면 월 약 $0.2(일일 브리핑 하루 약 $0.003, 주간 팀 프로필 회당 약 $0.024)입니다. 상세는 [PRD](docs/PRD.md) §9.3과 [plan](docs/plan.md) §16.1에 있습니다.

## 출처·저작권

- 모든 뉴스 카드에 매체명과 원문 링크를 붙이고, 피드의 제목·링크를 고치지 않고 그대로 씁니다. 원문 기사의 저작권은 각 매체·저작권자에게 있습니다.
- RSS 요약문은 수집 실행 중 메모리에서 분류 신호로만 쓰고, 화면에 표시하거나 `data/`에 저장하지 않습니다.
- 크롤러는 robots.txt를 따르고, 사이트당 2~3초 간격으로 하루 한 번만 접근하며, User-Agent에 서비스명과 연락처를 밝힙니다.
- Transfermarkt, FBref, WhoScored, SofaScore, FotMob, 네이버·다음, X, 유료 기사 본문은 수집하지 않습니다.
- 수집하는 소스 목록은 사이트의 [`/about/`](https://sguys99.github.io/euro-digest/about/)에 공개합니다.

### 데이터 출처

| 데이터 | 출처 |
|---|---|
| 뉴스 | 약관 판정을 통과한 매체 RSS(해외·국내 14개 채널, `configs/sources.json`) — LLM 미사용, 원제목 + 코드 분류 |
| 순위 · 일정 · 결과 · 득점 순위 | [football-data.org](https://www.football-data.org/) — **Football data provided by the Football-Data.org API** |
| 경기별 득점자 · 라인업(포메이션) · 한국 선수 경기 기록 | [API-Football](https://www.api-football.com/) — 경기 단위로 받아 쌓은 기록이라 한국 선수 시즌 누적은 "집계 시작일 이후" 값입니다 |
| 오늘의 5줄 · 팀 한줄평 · 주간 총평 | 위 경기 데이터를 바탕으로 Claude가 작성 — 화면에 "AI 작성" 표시 |
| A매치 일정 · 한국 선수 명단 · 팀 컬러 | 직접 관리하는 설정 파일(`configs/`) |

### 삭제·정정 요청과 오류 신고

- **삭제·정정 요청**: [삭제·정정 요청 이슈](https://github.com/sguys99/euro-digest/issues/new?template=takedown.yml) 또는 비공개로 sguys99@gmail.com — 접수 후 72시간 이내에 해당 카드를 비공개 처리합니다(공개 저장소의 git 이력에는 남을 수 있습니다).
- **브리핑·분류 오류**: [오류 신고](https://github.com/sguys99/euro-digest/issues/new?template=summary-error.yml) — 주간 검수에서 모아 프롬프트·분류 규칙 개선에 씁니다.
- **소스 수집 이상**: [소스 고장](https://github.com/sguys99/euro-digest/issues/new?template=source-broken.yml)

## 연락처

sguys99@gmail.com — 사이트 표기는 `src/lib/site.ts`의 `CONTACT_EMAIL`, 수집 User-Agent는 워크플로(`collect.yml`·`weekly.yml`)의 환경변수 `CONTACT_EMAIL`에서 옵니다. 연락처를 바꿀 때는 두 곳과 이슈 양식(`.github/ISSUE_TEMPLATE/`)을 함께 고칩니다.

## 저장소 구조

```
.claude/    Claude Code 설정 · 커맨드(/takedown · /new-season · /add-source · /add-player · /add-name …) · 서브에이전트
.github/    워크플로(collect · weekly · ci · deploy) · 이슈 템플릿
configs/    사람이 관리하는 설정 JSON · LLM 프롬프트 (모두 zod 검증)
data/       파이프라인 산출물 — 손 편집 금지
docs/       PRD · 개발 계획 · 디자인 시안·결정 · 검증·실측 기록(research/)
fixtures/   개발·테스트 샘플 데이터
public/     폰트 · 앱 아이콘 · OG 이미지(og/)
scripts/    파이프라인 · 빌드 스크립트 (tsx)
src/        Next.js 앱 — app/(라우트) · components/ · lib/
tests/      단위 테스트 · e2e/(Playwright)
```

`configs/`·`data/`·`fixtures/`의 편집 규칙은 각 폴더의 README에 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 요구사항 단일 출처 — 기능(FR)·비기능(NFR)·디자인(DR) ID와 결정 사항(§15) |
| [CLAUDE.md](CLAUDE.md) | 작업 규칙·컨벤션·금지 사항 (Claude Code와 개발자 공통) |
| [docs/plan.md](docs/plan.md) | 개발 계획·진행 체크리스트·월별 비용 기록 |
| [DESIGN.md](DESIGN.md) | 디자인 토큰·컴포넌트 규칙 |
| [docs/design/](docs/design/) | 디자인 게이트(D0~D3) 시안과 선택 기록(`DECISIONS.md`) |
| [docs/research/](docs/research/) | 소스·약관 검증, 발행 관찰, 성능·접근성·브라우저 실측 |

문서끼리 내용이 다르면 `docs/PRD.md` → `CLAUDE.md` → `docs/plan.md` → `DESIGN.md` 순으로 우선합니다.

## 라이선스

- **코드**: [Apache License 2.0](LICENSE)
- **콘텐츠는 제외**: 원문 기사의 저작권은 각 매체에 있습니다. `data/`의 뉴스 카드(원제목 포함)와 `fixtures/`의 수집 샘플은 원문을 바탕으로 한 것이라 이 라이선스로 재배포를 허락하지 않습니다. 축구 데이터는 football-data.org·API-Football 이용 약관을 따릅니다.
