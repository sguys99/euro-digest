# 유로 다이제스트 (Euro Digest)

> 매일 아침 07:00 KST, 유럽 축구 소식을 한국어 3줄로.

해외 1차 소스의 유럽 축구 뉴스를 모아 같은 사건은 하나로 묶고, 한국어 제목 1줄과 3줄 요약으로 정리해 원문으로 연결하는 정적 웹사이트입니다. 광고·회원가입 없이 하루 한 번 발행합니다.

- 사이트: <https://sguys99.github.io/euro-digest/> (아직 배포 전)

## 현재 상태

**M0 셋업·검증 단계입니다.** 아직 사용할 수 있는 서비스가 아닙니다.

- 마련된 것: Next.js 정적 export 뼈대, 개발 도구(ESLint·Prettier·Vitest·Playwright), npm 명령 골격, 폴더 구조, 이슈 템플릿, CI 검사 워크플로(`ci.yml`)
- 아직 없는 것: 뉴스 수집·요약 파이프라인, 화면 디자인, 배포 워크플로, 데이터 스키마, 뉴스 소스 약관 검증
- 사이트 주소는 배포 워크플로(M0-13)가 연결되기 전까지 404입니다. 배포 후에도 D0 디자인 시안이 확정되기 전까지는 스타일 없는 임시 페이지만 보입니다.

개발은 `M0 셋업·검증 → D0 디자인 → M1 뉴스 MVP → D1 → M2 대회·팀 → D2 → M3 한국 선수·A매치 → M4 부가 기능 → D3 → M5 다듬기·공개` 순서로 진행합니다. 진행 현황은 [docs/plan.md](docs/plan.md) §1 대시보드에서 확인할 수 있습니다.

## 무엇을 하나

5대 리그(프리미어리그·라리가·세리에 A·분데스리가·리그 1)와 UEFA 챔피언스리그 소식을 매일 수집해 한국어 요약 카드 30~50건을 발행합니다. 번역이 아니라 요약이며, 모든 카드는 원문으로 연결됩니다.

MVP 범위 ([PRD](docs/PRD.md) §5 요약. P0 = MVP 필수, P1 = MVP 포함 목표):

| 기능 | 내용 | 우선순위 |
|---|---|---|
| 오늘의 5줄 · 뉴스 피드 | 홈 최상단에 그날 가장 중요한 사건 5개를 한 줄씩. 대회·팀·카테고리 필터, 날짜별 아카이브 | P0 |
| 대회 · 팀 | 5대 리그 + UCL 순위·일정·결과, 팀 페이지 | P0 |
| 한국 선수 | 5대 리그 한국 선수의 출전·기록·다음 경기(KST) | P0 |
| 오늘 밤 볼 경기 | 빅매치와 한국 선수 출전 경기를 KST로 | P0 |
| 정책 페이지 | 소개·출처 정책·AI 생성 고지(`/about`), 개인정보 처리방침(`/privacy`) | P0 |
| A매치 · 주간 리포트 | 한국 대표팀과 주요국 A매치, 한국 선수 주간 리포트 | P1 |
| 이적시장 트래커 | 진행 단계(루머 → 협상 → 합의 → 확정)와 출처 신뢰도(Tier) 배지 | P1 |
| 마이 팀 · 결과 가리기 | 팀·선수 팔로우(브라우저 저장, 로그인 없음), 스포일러 방지 모드 | P1 |
| PWA · RSS · 캘린더 · 검색 | 홈 화면 설치, 전체·대회별·한국 선수 RSS, 팀 경기 `.ics`, 정적 검색 | P1 |

하지 않는 것: 실시간 스코어, 회원가입·댓글, 기사 본문 번역, 기사 이미지·구단 로고·선수 사진, 광고·유료화.

## 동작 방식

아래는 설계 기준이며 M1부터 구현합니다.

```
06:30 KST  cron-job.org → GitHub Actions(collect.yml)
 ① 수집   RSS · 기자 채널 · 목록/OG 메타 크롤링 · Google News RSS · GDELT
 ② 정제   URL 정규화 · 중복 제거 · 같은 사건 묶기 · 중요도 점수 · 상위 45건   ← 코드
 ③ 요약   외국어 기사만 Claude Haiku(Message Batches API)로 한국어 3줄 요약·분류
 ④ 검증   스키마·발행 검증 게이트 — 실패하면 발행하지 않고 전날 사이트를 유지
 ⑤ 빌드   Next.js 정적 export → 검색 인덱스 · RSS · 캘린더
 ⑥ 발행   data/ 커밋 → GitHub Pages 배포 (07:00 KST 목표)
```

매주 월요일에는 `weekly.yml`이 팀 한줄평·강점/약점, 한국 선수 주간 총평, 운영 리포트를 만듭니다. 순위·일정·결과는 축구 데이터 API에서 받아 LLM 없이 표시합니다.

LLM 사용 원칙:

- 호출 지점은 3곳뿐입니다: 뉴스 요약·분류(매일), 팀 한줄평 + 강점/약점(주 1회), 한국 선수 주간 총평(주 1회).
- LLM은 글쓰기에만 씁니다. 수집·중복 제거·순위 산정·고유명사 한글 표기(사전 치환)·이적 상태 집계는 코드가 합니다.
- 입력은 기사 제목과 요약/OG 설명(최대 500자)뿐입니다. 입력에 없는 사실은 쓰지 않고, 루머는 "~가 보도했다" 형식을 유지합니다.
- 비용 상한은 월 $3입니다. 하루 예산(`DAILY_BUDGET_USD`)이나 월 예산을 넘길 것으로 예상되면 LLM 없이 원제목과 링크만 게시합니다.

## 출처·저작권 원칙

- **기사 본문을 수집하지 않습니다.** 제목, RSS 요약, `og:description`만 씁니다. 원문 기사의 저작권은 각 매체·저작권자에게 있습니다.
- 모든 카드에 매체명과 원문 링크를 붙이고, AI가 요약한 카드에는 "AI 요약" 라벨을 표시합니다.
- 기사 이미지, 구단·리그 로고, 선수 사진을 쓰지 않습니다. 팀은 팀 컬러 이니셜 배지로 표시합니다.
- 이용 약관을 확인한 소스만 수집합니다. 목록·OG 메타를 읽는 크롤러는 robots.txt를 따르고, 사이트당 2~3초 간격으로 하루 한 번만 접근하며, User-Agent에 서비스명과 연락처를 밝힙니다.
- Transfermarkt, FBref, WhoScored, SofaScore, FotMob, 네이버·다음, X, 유료 기사 본문은 수집하지 않습니다.
- 뉴스 소스 목록은 M0 검증(약관·robots.txt 확인)을 마친 뒤 `configs/sources.json`에 등록하고 사이트의 `/about`에 공개합니다.

### 데이터 출처

| 데이터 | 출처 |
|---|---|
| 뉴스 | 매체 RSS · 기자 채널 · 목록/OG 메타 · Google News RSS · GDELT (외국어 기사만 LLM 요약) |
| 순위 · 일정 · 결과 · 득점 | [football-data.org](https://www.football-data.org/) |
| 한국 선수 기록 · 라인업 | [API-Football](https://www.api-football.com/) (보조) |
| 팀 한줄평 · 주간 총평 | 위 데이터의 지표를 바탕으로 LLM이 작성 (주 1회) |
| A매치 일정 · 한국 선수 명단 · 팀 컬러 | 직접 관리하는 설정 파일(`configs/`) |

### 삭제·정정 요청과 오류 신고

- **삭제·정정 요청**: [삭제·정정 요청 이슈](https://github.com/sguys99/euro-digest/issues/new?template=takedown.yml)를 열어 주세요. 이슈는 공개되므로 비공개 연락이 필요하면 sguys99@gmail.com 으로 보내 주세요. 두 경로 모두 접수 후 72시간 이내에 해당 카드를 비공개 처리합니다. 다만 공개 저장소의 git 이력에는 남을 수 있습니다.
- **요약 오류**: [요약 오류 신고](https://github.com/sguys99/euro-digest/issues/new?template=summary-error.yml) — 주간 검수에서 모아 요약 품질 개선에 씁니다.
- **소스 수집 이상**: [소스 고장](https://github.com/sguys99/euro-digest/issues/new?template=source-broken.yml)

## 로컬 개발

### 요구 사항

- Node.js 24 ([`.nvmrc`](.nvmrc), `package.json`의 `engines: >=24`)
- npm (`package-lock.json` 기준)

### 시작하기

```bash
nvm use                       # .nvmrc → Node 24
npm ci
cp .env.example .env.local    # 선택 — 실제 수집·요약을 돌릴 때만 키를 채운다
npm run dev
```

개발 서버 주소는 <http://localhost:3000/euro-digest/> 입니다. GitHub Pages 프로젝트 경로에 맞춰 `basePath`가 `/euro-digest`이므로 `http://localhost:3000/`이 아니라 이 경로로 열어야 합니다(`next.config.ts`, 환경변수 `BASE_PATH`).

`.env.local`은 커밋하지 않습니다(`.gitignore` 대상). 현재 단계에서는 API 키 없이도 `dev`·`build`·`check`가 동작합니다. 배포 환경의 키는 GitHub Actions Secrets로만 관리합니다.

### 정적 빌드 미리보기

```bash
npm run build      # 정적 export → out/
npm run preview    # out/을 GitHub Pages처럼 basePath 아래로 서빙
```

미리보기 주소는 <http://127.0.0.1:4173/euro-digest/> 입니다. 처음 `npm run test:e2e`를 돌리기 전에는 `npx playwright install chromium`으로 브라우저를 설치하세요.

### npm 명령

| 명령 | 설명 | 상태 |
|---|---|---|
| `npm run dev` | 개발 서버 | 사용 가능 |
| `npm run build` | `next build`(정적 export) → 검색 인덱스·OG 이미지·RSS·ics 생성 | `next build`만 동작, 후처리는 준비 중 (M4-11·M4-12·M4-14·M5-01) |
| `npm run preview` | `out/` 미리보기 서버 (포트 4173) | 사용 가능 |
| `npm run check` | typecheck + lint + test — 커밋 전 필수 | 사용 가능 |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` | 사용 가능 |
| `npm run lint` | ESLint | 사용 가능 |
| `npm run format` / `format:check` | Prettier 적용 / 검사 | 사용 가능 |
| `npm run test` / `test:watch` | Vitest 단위 테스트 (LLM은 항상 mock) | 사용 가능 |
| `npm run test:e2e` | Playwright — 375px·1280px, 빌드 결과(`out/`) 대상이라 먼저 `npm run build` | 사용 가능 (스모크 · 내부 링크 · axe 접근성 WCAG 2.1 AA) |
| `npm run collect` | 수집 → 정제 → 요약 → 검증 | 준비 중 (M1) — 현재 인자 파싱만 |
| `npm run summarize` | 요약 단계만 따로 실행 | 준비 중 (M1-17~M1-23) |
| `npm run weekly` | 팀 프로필·한국 선수 주간 리포트·운영 리포트 | 준비 중 (M2-07·M3-06~M3-08·M4-06·M5-09) |
| `npm run ops-report` | 비용·발행 성공률·소스 건강도 리포트 | 준비 중 (M5-09) |
| `npm run eval:prompt` | 프롬프트 회귀 평가 — 수정 전후 출력 비교 | 준비 중 (M1-24) |
| `npm run validate` | configs·data 스키마 + 발행 검증 게이트 | 준비 중 (M0-17·M1-25) |
| `npm run check:bundle` | 페이지별 초기 JS 예산(gzip 160KB) + `out/` 비밀값 검사, 먼저 `npm run build` | 사용 가능 (Lighthouse CI는 M5-08) |

"준비 중" 명령은 실행하면 구현 예정 작업 ID만 출력하고 정상 종료합니다. 작업 ID는 [docs/plan.md](docs/plan.md)의 체크리스트 ID입니다.

> **주의 — 구현 후 `npm run collect`·`summarize`·`weekly`·`eval:prompt`는 실제 Claude API를 호출하므로 비용이 발생합니다.**
> 개발 중에는 소량 실행이나 모의 실행을 쓰세요. `npm` 뒤의 `--`를 빼면 옵션이 스크립트에 전달되지 않습니다.
>
> ```bash
> npm run collect -- --limit 5          # 요약 대상을 상위 5건으로 제한
> npm run collect -- --limit 5 --dry    # data/에 쓰지 않고 결과만 출력 (LLM은 호출함)
> npm run collect -- --mock             # LLM 대신 fixtures/llm/ 응답 사용 (LLM_MODE=mock과 같음, 비용 없음)
> ```
>
> 개발 중 실제 호출의 토큰·비용은 `data/runs-dev.json`에 기록되어 월 예산에 합산됩니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16.4 (App Router, `output: 'export'`) · React 19.3 · TypeScript 6.0 (strict) |
| 스타일 | Tailwind CSS 4.3 · shadcn/ui (커스텀 — 디자인 확정 후 적용) |
| 실행 | Node.js 24 · tsx |
| 테스트·품질 | Vitest 5 · Testing Library · Playwright 1.64 · ESLint 9 · Prettier 3 |
| 배포 | GitHub Actions → GitHub Pages (검사 `ci.yml` 완료, 배포 `deploy.yml`은 M0-13) |
| 도입 예정 | zod (M0-16) · Anthropic Claude Haiku + `@anthropic-ai/sdk` Message Batches API (M0-20) · rss-parser (M1) · football-data.org · API-Football · Pagefind (M4-14) · GoatCounter 쿠키리스 분석 (M5-04) |

## 저장소 구조

```
.claude/    Claude Code 설정 · 커스텀 커맨드 · 서브에이전트
.github/    이슈 템플릿 · Actions 워크플로 (`ci.yml` 검사, 배포·수집은 M0-13~M0-14에서 추가)
configs/    사람이 관리하는 설정 JSON · LLM 프롬프트 (zod 검증 예정)
data/       파이프라인 산출물 — 손 편집 금지
docs/       PRD · 개발 계획 · 배경 조사 · 디자인 시안
fixtures/   개발·테스트·디자인 시안용 샘플 데이터
scripts/    파이프라인 · 빌드 스크립트 (tsx로 실행)
src/        Next.js 앱 — app/(라우트) · components/ · lib/
tests/      단위 테스트 · e2e/(Playwright)
```

`configs/`·`data/`·`fixtures/`의 편집 규칙은 각 폴더의 README에 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 작업 규칙·컨벤션·금지 사항 (Claude Code와 개발자 공통) |
| [docs/PRD.md](docs/PRD.md) | 요구사항 단일 출처 — 기능(FR)·비기능(NFR)·디자인(DR) ID와 결정 사항 |
| [docs/plan.md](docs/plan.md) | 개발 계획과 진행 체크리스트 |
| [docs/basic_plan.md](docs/basic_plan.md) | 배경과 소스 조사 (참고용) |
| [docs/design/](docs/design/) | 디자인 시안과 선택 기록 (D0부터 채워짐) |

문서끼리 내용이 다르면 `docs/PRD.md` → `CLAUDE.md` → `docs/plan.md` 순으로 우선합니다. 디자인 토큰 문서 `DESIGN.md`는 D0 시안 선택 후 작성합니다.

## 라이선스

라이선스는 아직 정하지 않았습니다(저장소에 LICENSE 파일 없음).
