# CLAUDE.md — 유로 다이제스트 (Euro Digest)

> 매일 아침 07:00 KST, 밤사이 유럽 축구를 한눈에.
> 버전: **v0.1** · 작성일: 2026-10-10 · 현재 단계: **설계 완료 → M0(셋업·검증) 착수 전**

이 문서는 Claude Code가 이 저장소에서 **어떻게 일하는지**를 정한다. 문서끼리 충돌하면 아래 우선순위를 따르고 사용자에게 알린다.

| 우선순위 | 문서 | 역할 |
|---|---|---|
| 1 | `docs/PRD.md` | 요구사항 단일 출처 (FR/NFR/DR ID, 결정 사항 §15) |
| 2 | `CLAUDE.md` | 작업 규칙·컨벤션·금지 사항 |
| 3 | `docs/plan.md` | 개발계획·진행 체크리스트 |
| 4 | `DESIGN.md` | 디자인 토큰·컴포넌트 규칙 (**D0 시안 선택 후** 작성) |
| 참고 | `docs/basic_plan.md`, `docs/design/DECISIONS.md` | 배경·소스 조사 / 디자인 선택 기록 |

> PRD·plan의 "상위 문서" 표기는 파생 순서이며, 충돌 시에는 위 표의 우선순위를 따른다(basic_plan은 참고). 큰 문서는 통째로 읽지 않고 작업 관련 PRD 절만 읽는다(예: 수집 → PRD §5.1·§5.2·§9).

## 1. 절대 규칙
1. **디자인은 시안 2~3개 → 사용자 선택 → 구현.** 선택 없이 UI 스타일 구현 금지("일단 기본 스타일로 만들고 나중에 바꾸기" 포함). (§4)
2. **세련되고 모던한 디자인이 핵심 차별점.** 기능을 줄여도 시각 품질은 낮추지 않는다. shadcn/ui 기본 모양·템플릿 느낌은 완료로 보지 않는다.
3. **LLM 호출 지점은 3곳뿐** — 정형 데이터 기반 한국어 브리핑("오늘의 5줄", 매일), 팀 한줄평+강점/약점(주 1회), 한국 선수 주간 총평(주 1회). **기사(제목·설명 포함)는 LLM에 넣지 않는다**(PRD §15 D23·D24). 새 지점·횟수 증가·모델 상향은 **사용자 승인 후**에만.
4. **개발 중 실호출은 자유, 비용은 항상 기록** — `data/runs-dev.json`(`env: "dev"`, 봇의 `runs.json`과 분리)에 남겨 커밋하고 월 $3 예산에 합산. 자동 테스트(Vitest·CI)만 `fixtures/` mock. (§6.3)
5. **본문 수집 금지.** 제목 + RSS 요약 + `og:description`만. 해외 기사는 피드 제목·URL을 그대로 게시한다(번역·요약·다듬기 금지 — D23). 금지 사이트(Transfermarkt, FBref, WhoScored, SofaScore, FotMob, 네이버·다음, X, 유료 본문)는 어떤 이유로도 크롤러를 만들지 않는다.
6. **이미지 자산 금지** — 기사 이미지·구단/리그 로고·선수 사진을 쓰지 않는다. 팀은 팀 컬러 이니셜 배지로.
7. **입력에 없는 사실은 쓰지 않는다**(프롬프트·후처리 모두). 루머는 보도 형식("~가 보도했다")을 유지.
8. **비밀값을 커밋·번들에 넣지 않는다.** `.env*` 파일 읽기·출력 금지. 키는 Actions Secrets로만.
9. **문서 버전은 항상 v0.1.** 모든 문서에서 임의로 올리지 않는다.
10. **정적 export 제약** — API Route·ISR·middleware·`next/image` 최적화·서버 런타임 기능 금지. (§7.1)

## 2. 작업 방식
**세션 루틴**: ① `docs/plan.md`에서 현재 마일스톤·다음 작업 확인 → ② 관련 PRD ID(FR/NFR/DR)의 수용 기준 확인 → ③ 작업 후 완료 기준(§9.2) 통과, plan.md 체크박스 갱신, 커밋 메시지에 요구사항 ID.

**마일스톤 순서 (건너뛰지 않는다)**: `M0 셋업·검증` → **`D0 전체 디자인`** → `M1 뉴스 MVP` → `D1` → `M2 대회·팀` → `D2` → `M3 한국 선수·A매치` → `M4 부가 기능` → `D3` → `M5 다듬기·공개`. **순차 진행**(PRD §15 D11): 앞 단계의 완료 기준을 통과해야 다음 단계를 시작하고, 게이트(D0~D3)가 끝나야 해당 마일스톤의 데이터·UI 작업을 착수한다. 예외는 M1의 7일 발행 관찰 기간 중 D1 시안 작업뿐이다(plan §2.2).

**반드시 먼저 질문한다** (AskUserQuestion, 선택지 + 추천안)
- PRD·결정 사항과 다르게 가야 하거나 문서끼리 충돌할 때 · 월 비용·LLM 토큰에 영향을 주는 변경
- 디자인 방향·레이아웃·컬러·타이포 선택 · 새 외부 서비스·유료 API·뉴스 소스 추가, 약관이 불분명한 소스
- 데이터 스키마(`data/*.json`)·공개 URL 구조 변경 · 새 런타임 의존성 추가(번들 예산 영향)

**스스로 정하고 결과만 알린다**: 내부 함수 구조·변수명·테스트 구성·동작 불변 리팩터링, PRD 수용 기준을 그대로 충족하는 구현 세부.

**제안하기**: 더 좋은 방법은 적극 제안하되 구현하지 않고 *무엇을 · 왜 · 비용(토큰·시간·번들) · 대안*으로 먼저 제시한다. 승인되면 PRD §14/§15와 plan.md에 반영한 뒤 구현.

## 3. 기술 스택
- **프레임워크**: Next.js(App Router, 최신 안정판) + React + TypeScript strict — `output: 'export'`, `basePath: '/euro-digest'`, `images.unoptimized: true`, `trailingSlash: true`
- **스타일**: Tailwind CSS v4 + shadcn/ui(커스텀). 토큰은 DESIGN.md → `src/app/globals.css`의 CSS 변수·`@theme` 단일 출처
- **스키마·실행**: zod(데이터·설정·LLM 출력 모두 경계에서 검증), tsx(`scripts/*.ts`), Node.js LTS(`.nvmrc` 고정), 패키지 매니저 **npm**
- **LLM**: `@anthropic-ai/sdk` Message Batches API, 기본 `LLM_MODEL=claude-haiku-5-5`. 호출은 `scripts/lib/llm.ts`에서만
- **수집·데이터**: rss-parser, 경량 HTML 파서(목록·OG 메타만) / football-data.org(주), API-Football(보조), 어댑터 구조
- **검색·분석**: Pagefind(빌드 후 인덱싱) / GoatCounter(쿠키리스, 허용되는 유일한 서드파티 스크립트)
- **테스트·품질**: Vitest(+Testing Library), Playwright(스크린샷·링크·접근성) / ESLint, Prettier(+tailwind 플러그인)
- **배포**: GitHub Actions → GitHub Pages(`actions/deploy-pages`), `https://sguys99.github.io/euro-digest`

## 4. 디자인 프로세스 (DR-00 — 필수)
**절차**: ① 게이트의 화면·컴포넌트 목록 정리 → ② 콘셉트가 서로 다른 시안 2~3개 → ③ 제시·선택 요청 → ④ 선택/혼합 지시 확정 → ⑤ DESIGN.md·DECISIONS.md 반영 → ⑥ 구현

**시안 규칙**
- `docs/design/<게이트>/concept-a.html`, `concept-b.html`, (`concept-c.html`) — 외부 의존 없는 단일 정적 HTML(웹폰트는 `docs/design/fonts/` 로컬 파일 참조만 허용), `fixtures/` 기반 **실제 데이터 샘플**, 모바일 375px + 데스크톱 1280px × **라이트·다크**.
- 최소 두 축 이상 달라야 한다: 레이아웃 구조 / 타이포 성격 / 색 전략 / 정보 밀도 / 모션 언어. 색만 바꾼 변형은 시안으로 인정하지 않는다.
- 각 시안에 **콘셉트 이름 · 한 줄 설명 · 장점 · 단점 · 구현 난이도/번들 영향**을 붙인다.
- 비교 표 + 추천안(이유)을 제시하되 결정은 사용자. 선택 결과·이유·혼합 지시는 `DECISIONS.md`에 날짜와 함께 기록.

| 게이트 | 시점 | 범위 |
|---|---|---|
| D0 전체 콘셉트 | M0 후, M1 UI 전 | 브랜드 무드, 컬러·타이포 토큰, 홈(오늘의 5줄 포함) + 뉴스 카드 |
| D1 대회·팀 | M2 UI 전 | 순위표, 팀 헤더·배지, 폼 칩, 포메이션 다이어그램 |
| D2 한국 선수·이적 | M3·M4 UI 전 | 선수 카드, 주간 리포트, 이적 진행 바·Tier 배지 |
| D3 아이콘·OG | M5 전 | 앱 아이콘, OG 이미지 템플릿, 빈 상태 일러스트 |

**품질 기준 (모든 UI 작업)**
- **Editorial, not portal** — 여백·타이포 위계로 정돈, 빽빽한 링크 목록 금지. 카드 하나를 **3초 안에 스캔**할 수 있는 밀도.
- **숫자가 주인공** — 스코어·순위·승점은 숫자 전용 서체 + `font-variant-numeric: tabular-nums`.
- **이미지 없이 아름답게** — 타이포·컬러·도형·데이터 시각화로 완성도를 만든다. 하드코딩 색·간격 금지, DESIGN.md 토큰만.
- **절제된 모션** — 150~250ms, 의미 있는 전환만, `prefers-reduced-motion` 시 제거. 한글 `word-break: keep-all`, 웹폰트 ≤ 2개 패밀리(서브셋, `font-display: swap`).
- 색만으로 의미 전달 금지(▲▼·W/D/L·텍스트 병기). WCAG AA 대비(다크 포함), 터치 타깃 44px, 포커스 링.
- **구현 후 시각 검증**: Playwright로 375/1280 × 라이트/다크 스크린샷을 찍어 선택 시안과 비교, 차이를 고친 뒤 완료.

## 5. 저장소 구조 · 명령어
```
.claude/     settings.json(.env 읽기 금지 등) · agents/ · commands/ (§11)
.github/     workflows/ collect.yml(일일)·weekly.yml(월요일)·ci.yml(push 검사 → 통과 시 배포)·deploy.yml(재사용 배포)
             · ISSUE_TEMPLATE/ summary-error·takedown·source-broken
configs/     사람이 관리, 전부 zod 검증: sources · competitions · names.ko · korean-players · national-team · bigmatch-rules
             · search-queries · publisher-domains · formations · team-colors · transfer-windows · takedowns (.json) · prompts/ summarize(일일 브리핑)·team-profile·weekly-kr (.md)
data/        파이프라인 산출물(손 편집 금지): news/YYYY-MM-DD.json · competitions/ · teams/ · players/ · transfers.json
             · runs.json(봇) · runs-dev.json(dev 실행, 개발자 커밋) · cache/ seen-urls.json·unknown-names.json
fixtures/    개발·테스트 샘플 (RSS·API 응답·LLM 응답·뉴스 카드)       tests/  단위·스키마 (e2e는 tests/e2e)
scripts/     collect · summarize · weekly · validate · build-feeds · ops-report (.ts) · crawlers/<site>.ts
             · lib/ normalize·dedup·cluster·score·llm·cost·time·names·providers/ …
src/         app/(라우트, PRD §4 IA) · components/(ui/ shadcn 커스텀 + 도메인) · lib/(data 로더·schema/·time·paths)
docs/        basic_plan.md · PRD.md · plan.md · design/(d0~d3 시안 + DECISIONS.md)
public/      manifest, 아이콘, 폰트        루트: CLAUDE.md · DESIGN.md · README.md
```
공용 zod 스키마는 `src/lib/schema/`에 두고 `scripts/`도 `@/*` 별칭으로 같은 스키마를 import한다(tsx가 tsconfig paths 지원). 명령어는 M0에서 `package.json`에 정의:
```bash
npm run dev / build                  # build = next build(export) → pagefind → OG·RSS·ics 생성
npm run collect                      # 수집→정제·분류→데이터 브리핑→검증 (실제 LLM 호출)
npm run collect -- --limit 5 --dry   # 소량 실행, data/ 산출물 대신 출력만 (--mock: LLM 없이 fixtures 응답)
npm run weekly                       # 팀 프로필·주간 리포트·운영 리포트
npm run eval:prompt                  # 골든셋 회귀 평가 — 프롬프트 수정 전후 출력 diff (실제 LLM 호출, 소량)
npm run validate                     # configs·data 스키마 + 발행 검증 게이트
npm run check                        # typecheck + lint + test (커밋 전 필수)
npm run test:e2e / check:bundle      # Playwright 링크·접근성·스크린샷 / 번들 크기 예산 + 비밀값 grep
```

## 6. 파이프라인 · LLM
**6.1 흐름 (PRD §10)**: `06:30 KST cron-job.org → workflow_dispatch(collect.yml)` → ① 수집(뉴스 + 전날 경기 데이터) → ② 정제·분류(코드: URL 정규화·해시 중복제거·클러스터링·점수화·상위 45건 · 카테고리·태그·이적 단계·spoiler 규칙) → ③ 데이터 브리핑(Batches) → ④ 검증 게이트 → ⑤ 빌드 → ⑥ `data/` 커밋 → ⑦ 배포(`deploy.yml`). 검증이나 빌드가 실패하면 커밋하지 않는다. `weekly.yml`도 끝에서 빌드 → 커밋 → `deploy.yml`. 백업 `schedule`(06:40 KST)은 12시간 내 성공 이력이 있으면 skip, `concurrency: collect`.

### 6.2 LLM 구현
- 모든 호출은 `scripts/lib/llm.ts` 경유, 다른 파일에서 SDK 직접 import 금지. 단가는 `scripts/lib/cost.ts` 한 곳에서 관리(구현 시점 공식 단가 확인).
- **LLM은 글쓰기에만.** 수집·중복제거·필터링·**뉴스 분류(카테고리·태그·중요도·이적 단계·spoiler)**·순위·고유명사 변환·이적 상태 집계·MVP 선정은 코드로.
- **뉴스 기사는 LLM에 보내지 않는다**(D23). 해외 카드는 원제목+링크(`ai:false`, `s:[]`), 분류는 코드 규칙(키워드·`names.ko.json`·소스 메타). `Source.summarize`는 모두 false — 요약 경로를 다시 여는 것은 §1-3 승인 사항.
- 일일 브리핑 입력(D24): 전날(KST) 경기 결과·순위 변동·득점자·한국 선수 출전 등 데이터 API를 어댑터로 변환한 **정형 데이터만**(기사 텍스트 금지). 출력: 짧은 키 JSON, `max_tokens` 상한, 최대 5줄·줄당 60자 내외, 경기가 없으면 호출 생략.
- zod 검증 → 실패 시 1회 재시도 → 그래도 실패하면 **코드 템플릿 문장**(`ai:false`)으로 강등. 브리핑 실패가 발행을 멈추지 않는다.
- 고유명사는 LLM이 영문 그대로 출력 → `configs/names.ko.json`으로 코드 치환(뉴스 태그도 같은 사전). 미등록 이름은 `data/cache/unknown-names.json`에 적재.
- 비용 가드 `DAILY_BUDGET_USD=0.10`, `MONTHLY_BUDGET_USD=3`. 초과 예상 시 LLM 없이 브리핑을 코드 템플릿으로 게시.
- 배치가 06:50까지 끝나지 않으면 배치를 취소하고 브리핑을 코드 템플릿으로 게시.
- **프롬프트 캐싱**: 모델별 최소 캐시 프리픽스 길이 미달이면 미적용(일일 요청이 1~3개라 대개 미적용). M1 첫 실측에서 `usage.cache_read_input_tokens`가 0이면 캐싱 코드를 빼고 PRD 비용 표를 갱신.

### 6.3 개발 중 LLM 사용
- 반복 실험은 소량(`--limit`, 브리핑은 1~3요청)으로 줄이고, 실행 전 예상 토큰·비용을 출력한다.
- prod 실행은 `data/runs.json`, dev 실행은 `data/runs-dev.json`(개발자가 커밋)에 `env`와 토큰·비용을 기록하고, 비용 가드는 두 파일을 합산해 판단. dev 사용이 그 달 예산의 50%를 넘으면 사용자에게 알린다.
- 자동 테스트·CI는 `LLM_MODE=mock`으로 `fixtures/llm/` 응답 사용(결정적·무비용).
- 프롬프트 수정 시 샘플 10건(브리핑은 10일치 입력) 회귀 비교(`npm run eval:prompt`, 이전/이후 출력 diff)를 실행하고 `fixtures/llm/`을 갱신.

### 6.4 수집·크롤링 · 축구 데이터
- `configs/sources.json`에서 `enabled: true` **그리고** `terms_checked: true`인 소스만 수집. 목록·OG 크롤링을 하는 소스는 `robots_checked: true`도 필요. `summarize: false` 소스는 LLM에 보내지 않고 피드 제목·URL을 그대로 쓴 원제목+링크(`ai:false`) 카드로만 게시(PRD §15 D22). 소스 URL 하드코딩 금지. 새 소스는 `/add-source` 절차로만.
- 크롤러는 `scripts/crawlers/<site>.ts`로 분리: robots.txt 준수, User-Agent에 서비스명·연락처, 사이트당 2~3초 지연, 하루 1회, 목록(제목·링크·날짜·작성자)과 OG 메타만.
- 소스 실패는 격리(해당 소스만 건너뛰고 이슈 생성). 3일 연속 0건이면 소스 건강도 이슈.
- football-data.org 분당 10회 → 호출 간 지연. API-Football 하루 100회, 일일 계획 ≤ 60회.
- 외부 데이터는 어댑터(`scripts/lib/providers/*`)로 내부 스키마로 변환. 화면 코드는 외부 API 형식을 모른다.

## 7. 프론트엔드
### 7.1 정적 export 함정
- 동적 라우트(날짜 아카이브·팀·선수·대회)는 모두 `generateStaticParams`로 생성.
- 내부 링크는 `next/link`, 정적 자산·RSS·ics·OG 경로는 `src/lib/paths.ts` 헬퍼로 `basePath`를 붙인다. `/` 경로 하드코딩 금지.
- `trailingSlash: true` 기준으로 링크와 404 확인(GitHub Pages).
- 필터·팔로우·스포일러 모드 등 개인화는 클라이언트에서. URL 쿼리 필터도 정적 페이지에서 클라이언트로 읽는다.

### 7.2 컴포넌트
- 서버 컴포넌트 기본, `"use client"`는 상호작용이 필요한 작은 섬에만.
- `localStorage` 접근은 모두 try/catch, 실패해도 정상 렌더. 테마는 초기 인라인 스크립트로 `data-theme` 설정(깜빡임 없음).
- 성능 예산: 초기 JS ≤ 160KB(gzip, 모던 브라우저 module 스크립트 합·noModule polyfill 제외 — 프레임워크 기본 약 138KB, PRD §15 D21), LCP ≤ 2.0s(모바일 4G), CLS ≤ 0.05. 새 의존성은 번들 영향 확인 후 질문.
- 모든 데이터 화면에 상태 4종(로딩 스켈레톤·빈 상태·오류·오프라인). 모든 뉴스 카드에 출처명·원문 링크. LLM이 쓴 브리핑 줄(`ai:true`)에는 "AI 작성" 라벨, 뉴스 카드·템플릿 강등 줄(`ai:false`)에는 붙이지 않음(D24).

## 8. 데이터 · 시간
- **저장은 UTC(ISO 8601), 표시는 KST.** 변환은 `src/lib/time.ts`에서만. 유럽 서머타임 전환(3·10월 마지막 일요일) 테스트 필수.
- `data/`는 파이프라인만 쓴다. 수정은 스크립트를 고치거나 `configs/`(예: `takedowns.json`)로 반영.
- 스키마 변경은 사용자 확인 후 zod 스키마 → 마이그레이션 스크립트 → fixtures → 테스트 순으로 함께 바꾼다.
- 카드 ID(`c_` + 16진수 10자리)는 원문 URL 기반 결정적 해시(공유 앵커가 깨지지 않게).
- 보존: 일별 뉴스 90일 후 월별 병합, seen-urls 90일, runs.json·runs-dev.json 180일.

## 9. 코드 품질
### 9.1 컨벤션
- TypeScript strict, `any` 금지(불가피하면 이유 주석). 외부 입력(RSS·API·LLM·configs)은 경계에서 zod로 파싱.
- 파이프라인 단계는 **순수 함수**(입력 → 출력, I/O는 바깥)로 작성해 테스트.
- 파일명 kebab-case, 컴포넌트 PascalCase, 경로 별칭 `@/*`. 주석·문서·커밋 메시지는 한국어, 식별자는 영어.
- 로그는 단계·소스·건수 중심 구조화 로그. 비밀값·전체 응답 본문은 남기지 않는다.

### 9.2 완료 기준 (DoD)
- [ ] `npm run check` 통과(typecheck·lint·단위 테스트), `npm run build`(정적 export) 성공
- [ ] PRD 수용 기준 충족 + 테스트 추가 (정규화·중복제거·클러스터링·점수화·분류 규칙·시간대·이적 상태 집계는 필수)
- [ ] UI: 선택 시안과 스크린샷 비교, 접근성 검사, 번들 예산 확인
- [ ] LLM: 실측 비용을 `runs.json`·`runs-dev.json`에서 확인·보고, 테스트는 mock으로 결정적 검증
- [ ] plan.md 체크박스·관련 문서 갱신

## 10. Git · 배포 · 환경변수
- 커밋: Conventional Commits + 한국어 요약 + 요구사항 ID. 예: `feat(news): 동일 사건 클러스터링 (FR-05)`
- 봇 데이터 커밋: `chore(data): YYYY-MM-DD 발행` — 변경분만, `data/`·`public/` 산출물에 한정.
- 개발·봇 모두 `main`에 직접 커밋(무인 발행 브랜치) → **커밋 전 `npm run check`·`npm run build` 통과 필수**. `ci.yml`이 push마다 같은 검사를 돌리고, 실패하면 즉시 수정 또는 revert. main push가 검사를 통과하면 `deploy.yml`로 배포된다(`concurrency: pages`).
- 큰 변경(스키마·파이프라인 구조)은 작은 커밋으로 나눈다. 06:00~07:30 KST에는 push 금지. push 전 항상 `git pull --rebase`.
- Secrets: `ANTHROPIC_API_KEY`, `FOOTBALL_DATA_API_KEY`, `API_FOOTBALL_KEY`는 Actions Secrets. cron-job.org용 PAT(Actions 권한만)는 저장소에 두지 않는다.
- 환경변수 기본값: `LLM_MODEL=claude-haiku-5-5` · `LLM_MODE=live`(테스트·CI는 `mock`) · `MAX_ITEMS_PER_RUN=45`(일일 카드 선별 상한) · `DAILY_BUDGET_USD=0.10` / `MONTHLY_BUDGET_USD=3` · `SITE_URL=https://sguys99.github.io` / `BASE_PATH=/euro-digest` · `CONTACT_EMAIL`(User-Agent·삭제 요청 연락처, M0에서 개설)

## 11. Claude Code 보조 설정 (M0에서 생성)
**커맨드** (`.claude/commands/`)
- `/add-player <이름>` — `korean-players.json`에 선수(한/영 이름·slug·소속·API ID) + `names.ko.json` 표기 + 검색 쿼리 추가 → `npm run validate`
- `/add-source <URL>` — RSS·robots.txt·약관 확인 결과 보고 → 사용자 확인 후 `sources.json`에 `terms_checked`와 함께 등록
- `/add-name` — `unknown-names.json`의 미등록 고유명사를 한글 표기안과 함께 제시 → 확인분만 `names.ko.json`에 반영
- `/new-season` — 시즌 전환 체크리스트(시즌 ID·승강 팀·한국 선수 명단·표기 사전·팀 컬러)
- `/takedown <card-id>` — `configs/takedowns.json` 등록 → 재빌드·배포 → 처리 시각 기록 (원본 카드는 다음 수집 실행에서 삭제)
- `/design-concepts <게이트>` — §4 절차로 시안 2~3개 생성 → 비교표 제시 → 선택 대기(구현하지 않음)

**서브에이전트** (`.claude/agents/`)
- `design-concepts` — 게이트 시안 HTML, 375/1280·라이트/다크 스크린샷. 시안만 만들고 `src/` 수정 금지
- `pipeline-dev` — 수집·정제·분류·브리핑·검증 스크립트와 단위 테스트. LLM 호출 지점 추가 금지, 비용 기록 필수
- `code-reviewer` — 커밋 전 리뷰(§1 절대 규칙·정적 export·비밀값·번들 예산·접근성). 읽기 전용, 문제 목록만 보고

## 12. 운영 절차
- **잘못된 발행**: `data/` 해당 커밋 revert → `deploy.yml` 수동 실행 → 원인 이슈 기록. **검증 게이트 실패**: 배포 중단·전날 사이트 유지 → 원인 수정.
- **삭제·정정 요청**: `/takedown <card-id>` → 재빌드 (접수 후 72시간 이내). **브리핑·분류 오류 신고**: `summary-error` 이슈 집계 → 주간 검수 → 회귀 비교 후 프롬프트·분류 규칙 개선.
- **한국 선수 이적 감지**: `/add-player` 또는 `korean-players.json` 수정. **미등록 고유명사**: `/add-name`. **시즌 전환**: `/new-season`.

## 13. 미결 사항 (M0 검증 후 이 문서·PRD 갱신)
- API-Football 무료 플랜의 2026-27 시즌 조회 가능 여부 → 불가 시 FR-65 폴백
- ~~각 RSS·기자 채널·크롤링 대상의 약관·robots.txt, Google News RSS 이용 조건~~ → M0-23~26 완료(`docs/research/m0-validation.md`, PRD §15 D22~D25). GDELT 이용 조건은 M0-27
- football-data.org·API-Football 약관의 LLM 입력·재가공(한국어 브리핑) 허용 여부 (M0-28·M0-29, D24)
- 서비스명 상표·저장소명 확인, 연락용 이메일 개설, 2026-27 시즌 5대 리그 한국 선수 명단
