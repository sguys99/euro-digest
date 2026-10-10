# 🗺️ 유로 다이제스트 (Euro Digest) — 상세 개발계획 (plan.md) v0.1

> 매일 아침 07:00, 유럽 축구 소식을 한국어 3줄로.
> 작성일: 2026-10-10 · 버전: v0.1 · 저장 위치: `docs/plan.md`

| 항목 | 내용 |
|---|---|
| 상위 문서 | `docs/basic_plan.md` → `docs/PRD.md` → `CLAUDE.md` → **`docs/plan.md`(이 문서)** — 파생 순서. 충돌 시에는 CLAUDE.md 우선순위 표(PRD > CLAUDE > plan, basic_plan은 참고)를 따른다 |
| 하위 문서 | `DESIGN.md` (D0 시안 선택 후 작성), `docs/design/DECISIONS.md` |
| 역할 | **언제·어떤 순서로** 만드는지 + 진행 체크리스트. *무엇을*은 PRD, *어떻게 일하는지*는 CLAUDE.md가 단일 출처 |
| 문서 규칙 | 버전은 **v0.1 고정** (임의 상향 금지) |

---

## 0. 이 문서 사용법

### 0.1 표기
| 표기 | 의미 |
|---|---|
| `- [ ]` / `- [x]` | 미착수 / 완료 |
| 🚧 | 진행 중 — 체크박스 뒤에 붙인다 (예: `- [ ] 🚧 M1-13 …`) |
| ⏸ | 보류 — 사유를 괄호로 적는다 |
| 🎨 | **디자인 게이트** — 시안 2~3개 → 사용자 선택 전에는 해당 화면 스타일 구현 금지 |
| 🙋 | 사용자가 직접 해야 하는 작업 (계정·결제·Secrets·선택·검토) |
| 💰 | 실제 LLM 호출 발생 → 비용 기록 (개발 중 실행은 `data/runs-dev.json`, 봇 실행은 `data/runs.json`) |
| ❓ | 진행 전 사용자 질문 필요 (AskUserQuestion, 추천안 포함) |
| 🆕 | plan 단계에서 새로 추가한 항목 (PRD 범위를 바꾸지 않는 보강. 범위가 바뀌는 제안은 §15에서 승인 대기) |

### 0.2 작업 ID와 커밋
- 작업 ID: `<단계>-<번호>` (예: `M1-13`, `D0-03`)
- 커밋 메시지에 PRD 요구사항 ID와 작업 ID를 함께 적는다: `feat(news): 동일 사건 클러스터링 (FR-05, M1-13)`

### 0.3 작업 크기와 완료 처리
- 체크 항목 1개 = Claude Code 세션 1회(대략 1~3시간)에 끝낼 수 있는 크기. 더 크면 쪼개서 하위 항목을 추가한다.
- 체크는 **CLAUDE.md §9.2 완료 기준(DoD)** 을 통과한 뒤에만 한다.
- 세션 시작: §1 대시보드에서 현재 단계 확인 → 다음 미체크 항목 → 관련 FR/NFR/DR 수용 기준 확인
- 세션 종료: 체크박스 갱신 → §1 대시보드 갱신 → 범위·일정 변경은 부록 B 변경 이력에 한 줄

---

## 1. 진행 현황 대시보드

| 단계 | 내용 | 예상 기간 | 시작 | 완료 | 상태 |
|---|---|---|---|---|---|
| 사전 | 사용자 준비 작업 (§3) | M0 중 | 2026-10-10 | | 🚧 |
| **M0** | 셋업·검증 | 3~4일 | 2026-10-10 | | 🚧 |
| **D0** 🎨 | 전체 디자인 콘셉트 | 2~3일 | | | ⬜ |
| **M1** | 뉴스 MVP | 1주 | | | ⬜ |
| **D1** 🎨 | 대회·팀 화면 | 1~2일 | | | ⬜ |
| **M2** | 대회·팀 | 1주 | | | ⬜ |
| **D2** 🎨 | 한국 선수·이적·마이 팀 | 1~2일 | | | ⬜ |
| **M3** | 한국 선수·A매치 | 1주 | | | ⬜ |
| **M4** | 부가 기능 | 1.5주 | | | ⬜ |
| **D3** 🎨 | 아이콘·OG·빈 상태 | 1~2일 | | | ⬜ |
| **M5** | 다듬기·정식 공개 | 1주 | | | ⬜ |

상태: ⬜ 대기 · 🚧 진행 중 · ✅ 완료 · ⏸ 보류

**현재 위치**: M0 셋업·검증 진행 중
**다음 작업**: `M0-25` ❓ (M0-15는 사용자 설정 대기)

---

## 2. 전체 흐름과 일정

### 2.1 진행 순서 — 순차 진행 (사용자 결정, 2026-10-10)
각 단계는 **앞 단계의 완료 기준을 통과한 뒤** 시작한다. 디자인 게이트는 해당 마일스톤 바로 앞에 두고, 게이트가 끝나야 그 마일스톤 전체(데이터·UI)를 착수한다.

```
[사전 준비 🙋] → M0 셋업·검증 → D0 🎨 → M1 뉴스 MVP → D1 🎨 → M2 대회·팀
            → D2 🎨 → M3 한국 선수·A매치 → M4 부가 기능 → D3 🎨 → M5 다듬기·정식 공개
```
- 게이트 순서(CLAUDE §2)는 건너뛰지 않는다.
- 각 단계의 시작·완료일은 §1 대시보드에 **진행하면서 기록**한다 (사전 날짜 계획 없음).

### 2.2 단계별 예상 기간 (참고용, 날짜 없음)
| 순서 | 단계 | 예상 기간 | 비고 |
|---|---|---|---|
| 1 | M0 | 3~4일 | |
| 2 | D0 🎨 | 2~3일 | 사용자 선택 대기 포함 |
| 3 | M1 | 1주 + 7일 발행 관찰 | 관찰 기간에는 D1 시안 작업을 해도 된다 (M1 코드 작업은 끝난 상태) |
| 4 | D1 🎨 | 1~2일 | |
| 5 | M2 | 1주 | |
| 6 | D2 🎨 | 1~2일 | |
| 7 | M3 | 1주 | |
| 8 | M4 | 1.5주 | 범위가 커서 1.5주로 산정 🆕 |
| 9 | D3 🎨 | 1~2일 | |
| 10 | M5 | 1주 | 완료 시 정식 공개 |

> 첫 배포부터 공개·색인 허용(PRD §15 D10). 미완성 섹션은 내비게이션에서 숨긴다.

### 2.3 외부 일정 앵커 (참고) 🆕
날짜 계획은 두지 않지만, 아래 외부 일정과 겹치면 해당 작업의 우선순위를 조정한다.
| 날짜 | 이벤트 | 계획 영향 |
|---|---|---|
| **2026-10-25 (일)** | 유럽 서머타임 종료 | `time.ts` DST 테스트는 M0에서 끝낸다. 이 날짜 전후에 발행이 돌고 있으면 경기 시각(KST) 표시를 실데이터로 확인 |
| 11월 중순 | A매치 기간(FIFA 윈도우) | M3 진행 중이라면 A매치 기능을 실데이터로 검증할 기회 |
| **2027-01-01** | 겨울 이적시장 개장 | 이 시점까지 M4에 못 미치면, **이적 트래커(M4-A)만 먼저 당겨서** 개장 전에 붙이는 것을 검토 ❓ |
| 2027-01 말 ~ 02 | UCL 리그 페이즈 종료 → 녹아웃 | FR-43 녹아웃 대진 전환은 구조만 M2에서 만들고, 실데이터 검증은 공개 후 운영 체크리스트로 |
| 2027-03-28 (일) | 유럽 서머타임 시작 | DST 테스트 케이스에 포함 |

---

## 3. 사전 준비 — 사용자 작업 🙋 (M0 기간 중 완료)

- [X] U-01 GitHub 저장소 `euro-digest` 생성(Public) → Settings › Pages › Source를 **GitHub Actions**로
- [X] U-02 Anthropic API 키 발급 → Actions Secrets `ANTHROPIC_API_KEY`
- [X] U-03 🆕 Anthropic Console에서 **월 지출 한도 설정**(예: $5) — 코드 비용 가드(월 $3)가 고장 나도 막는 2차 안전장치
- [X] U-04 football-data.org 가입 → Secrets `FOOTBALL_DATA_API_KEY`
- [X] U-05 API-Football 가입 — API-SPORTS 사의 **api-football.com**(가입: `https://dashboard.api-football.com/register`)에서 **직접** 가입 → Secrets `API_FOOTBALL_KEY` (호출 주소 `https://v3.football.api-sports.io`, 인증 헤더 `x-apisports-key`). 이름이 비슷한 **apifootball.com**(다른 회사)과 **RapidAPI 경유 가입**(키·호출 주소·헤더가 달라 어댑터와 맞지 않음)은 쓰지 않는다
- [ ] U-06 cron-job.org 계정 + fine-grained PAT(대상 저장소 한정, Actions 권한만, **만료일 기록**) — PAT는 저장소에 두지 않음
- [x] U-07 연락용 전용 이메일 개설 → `CONTACT_EMAIL` (User-Agent·삭제 요청용) — 2026-10-10 사용자 결정: 전용 메일 대신 `sguys99@gmail.com` 사용
- [ ] U-08 GoatCounter 사이트 생성 (쿠키리스 분석)
- [ ] U-09 KIPRIS 상표 검색 — '유로 다이제스트' / 'Euro Digest'
- [x] U-10 (선택) 좋아하는/싫어하는 사이트·앱이 있으면 D0 전에 공유 — 시안 방향에 반영 — 2026-10-10 응답: **에디토리얼 신문형 · 매거진 볼드형** 선호 + 다른 방향 제안도 원함 (D0-02에서 반영). 템플릿의 Apple 디자인 분석 문서는 `docs/design/references/apple-design-analysis.md`에 참고자료로 보존

---

## 4. M0 — 셋업·검증 (3~4일)

**목표**: 빈 사이트가 GitHub Pages에 배포되고, 모든 외부 소스·API의 실작동과 약관이 확인된 상태.
**산출물**: 저장소 뼈대, CI·배포 워크플로, 공용 기반 코드, `docs/research/m0-validation.md`, 실데이터 fixtures

### M0-A 저장소·개발 환경
- [x] M0-01 Next.js(App Router) + TypeScript strict 생성, `next.config`: `output:'export'`, `basePath:'/euro-digest'`, `trailingSlash:true`, `images.unoptimized:true` (CLAUDE §3) — 2026-10-10 완료: next 16.4.0 · react 19.3.0 · TypeScript 6.0.3(typescript-eslint 호환 범위) · Node 24(`.nvmrc`도 여기서 생성)
- [x] M0-02 Tailwind CSS v4 + shadcn/ui 초기화 — **스타일 작업 금지**, `globals.css`에 토큰 자리만 둔다 — 2026-10-10 완료: tailwindcss 4.3.3, components.json 직접 작성(style·iconLibrary는 D0-12에서 확정), lucide·tw-animate-css 미설치, 클래스 탐색 범위 `src/` 한정
- [x] M0-03 ESLint · Prettier(+tailwind 플러그인) · Vitest · Testing Library · Playwright 설정, `.nvmrc`(Node LTS) — 2026-10-10 완료: ESLint 9(next 16.4 호환)·SDK import 제한 규칙, Vitest 5(node/happy-dom 분리, `LLM_MODE=mock` 강제), Playwright 1.64(375·1280), `scripts/serve-out.ts`(basePath 정적 서버)
- [x] M0-04 npm scripts 골격 — CLAUDE §5의 전 명령 등록 (미구현 명령은 TODO 메시지 출력) — 2026-10-10 완료: 진입점 스텁 8종(구현 예정 작업 ID 출력), `collect` 인자 파싱(`--limit`·`--dry`·`--mock`) + 테스트, env는 `node --env-file-if-exists=.env.local --import tsx`로 로드
- [x] M0-05 폴더 구조 생성 (CLAUDE §5), `@/*` 별칭이 `src/`와 `scripts/`(tsx) 양쪽에서 동작하는지 확인 — 2026-10-10 완료: 디렉터리 + `.gitkeep`, configs·data·fixtures 손 편집 규칙 README, `src/lib/site.ts`로 src·scripts(tsx)·Vitest 별칭 확인 (`public/`·`.github/`·`docs/design/fonts/`는 파일이 생길 때 만든다)
- [x] M0-06 문서 이관: `basic_plan.md`·`PRD.md`·`plan.md` → `docs/`, `CLAUDE.md` → 루트, `WORK-PLAN.md` 표기를 `plan.md`로 일괄 치환 (2026-10-10, 문서 정합성 검토 때 처리)
- [x] M0-07 `.claude/settings.json` — `.env*` 읽기 금지, 위험 명령 확인 — 2026-10-10 완료: 비밀 파일(`.env`·`.env.local`·`.env.*.local`·`.env.{development,production,test}`) Read·Bash 출력 차단(`.env.example`은 허용), force push 변형 차단, 위험 명령 15종 ask. 한계: 스크립트 하위 프로세스는 막지 못함
- [x] M0-08 커스텀 커맨드 6종 초안: `/add-player` `/add-source` `/add-name` `/new-season` `/takedown` `/design-concepts` (동작 완성은 해당 기능 단계에서) — 2026-10-10 완료: `.claude/commands/` 6종(목적·현재 상태·절차·확인 지점·금지·보고 형식), `/takedown`·`/new-season`은 직접 실행만 허용
- [x] M0-09 서브에이전트 3종: `design-concepts` · `pipeline-dev` · `code-reviewer` (CLAUDE §11 경계 명시) — 2026-10-10 완료: `.claude/agents/euro-digest/` 3종 + PreToolUse 쓰기 경로 훅(design-concepts는 `docs/design/` 한정, code-reviewer는 읽기 전용), 범용 `dev/code-reviewer.md` 삭제
- [x] M0-10 이슈 템플릿 3종: `summary-error` · `takedown` · `source-broken` (FR-36, FR-140) — 2026-10-10 완료: 이슈 폼 3종 + `config.yml`(빈 이슈 차단, 메일·/about 연락 링크), 운영 라벨 6종 생성(`summary-error`·`takedown`·`source-broken`·`source-health`·`pipeline-failure`·`ops-report`). 카드 미리 채우기 `?template=summary-error.yml&card=<id>&date=<date>`
- [x] M0-11 README 초안 (소개, 로컬 실행, 문서 링크, 데이터 출처) — 2026-10-10 완료: 템플릿 README 교체(현재 상태·MVP 범위·동작 방식·출처 원칙·로컬 실행·명령 표·문서 링크). 라이선스는 Apache-2.0(2026-10-10 사용자 결정, 콘텐츠·data는 제외 명시)

### M0-B 배포·자동화 뼈대
- [x] M0-12 `ci.yml`: push마다 `check` + `build` + `check:bundle` + `test:e2e`(링크·접근성, NFR-12) → main에서 통과하면 `deploy.yml` 호출 — 2026-10-10 완료: `check:bundle` 실구현(페이지별 초기 JS gzip ≤ 160KB + `out/` 비밀값 grep), e2e 링크·axe WCAG 2.1 AA(라이트·다크), CI green 확인. deploy 호출은 M0-13에서 연결
- [x] M0-13 Pages 배포 — 재사용 `deploy.yml`(`workflow_call` + 롤백용 수동 `workflow_dispatch`, `concurrency: pages`) 작성. 무스타일 Hello 페이지가 `https://sguys99.github.io/euro-digest/`에서 열리고 정적 자산·404·trailing slash 정상 — 2026-10-10 완료: ci(main push) → deploy.yml 배포 성공, `npm run verify:deploy` 15개 항목 통과(홈·`_next/static`·404 본문·`/euro-digest` 301). 롤백은 deploy.yml 수동 실행(Use workflow from: main + ref 입력)
- [x] M0-14 `collect.yml` 골격: `workflow_dispatch` + 백업 `schedule`(06:40 KST — 06:30 실행이 진행 중이면 concurrency로 대기한 뒤 12시간 가드로 skip) + 12시간 내 성공 이력 시 skip + `concurrency: collect` + 실패 시 이슈 생성 (FR-150, FR-152) — 2026-10-10 완료: 실실행 3경로 확인(정상·12시간 가드 skip·실패 이슈 생성 → 재발 시 댓글, 테스트 이슈 #1 닫음). 🆕 백업 schedule은 저장소 변수 `COLLECT_ENABLED=true`일 때만 실행(M1 전 빈 실행 방지)
- [ ] ⏸ M0-15 🙋 cron-job.org → `workflow_dispatch` 호출 테스트 (06:30 정기 실행 활성화는 M1-40 리허설 후) (사용자 설정 대기 — 2026-10-10 설정 안내 전달: fine-grained PAT(Actions R/W, 이 저장소만) + POST `…/actions/workflows/collect.yml/dispatches` body `{"ref":"main"}`)

### M0-C 공용 기반 코드
- [x] M0-16 zod 스키마 v0.1 구현 (`src/lib/schema/`) — **부록 A 기준**, configs·data 전부. 부록 A에 없는 스키마(competitions·names.ko·national-team·bigmatch-rules·search-queries·formations·team-colors·transfer-windows·`players/korean.json`·seen-urls·unknown-names)는 초안 작성 → ❓ 사용자 확인 후 부록 A에 추가 — 2026-10-10 완료: zod 4.6, `src/lib/schema/` + `schemaRegistry`(21개), 초안 12종·결정 10건 사용자 일괄 승인 → 부록 A 반영, `fixtures/schema/` 예시 22개·스키마 테스트 258개
- [x] M0-17 `scripts/validate.ts` 1차: `configs/*` 스키마 검증 → CI 연결 (잘못된 설정은 CI 실패) — 2026-10-10 완료: configs·data(있으면) 스키마 + 교차 참조 3종(search-queries→sources·korean-players, 대표팀 명단→korean-players), 미등록 파일·BOM은 오류, 필수 파일 `takedowns.json`(seed `[]`), CI `::error` 주석
- [x] M0-18 `src/lib/time.ts`: UTC 저장·KST 표시 + DST 테스트 (2026-10-25, 2027-03-28 전후 케이스) (NFR-10) — 2026-10-10 완료: `Intl`만 사용(의존성 0), KST 날짜·포맷·ISO 주차·KST 창·현지→UTC(DST 경계는 RFC 5545 `compatible`), 테스트 158개(시스템 TZ 5종 통과), 다른 파일의 시간대 API 사용 금지 가드 테스트
- [x] M0-19 `src/lib/paths.ts`: basePath 헬퍼(정적 자산·RSS·ics·OG) + 테스트 — 2026-10-10 완료: `routes.*`(PRD §4 IA 전 경로, basePath 없음·trailing slash)·`artifacts.*`·`withBasePath`·`absoluteUrl`·`summaryErrorIssueUrl`, next.config가 같은 정규화로 `NEXT_PUBLIC_*` 인라인, `/euro-digest` 하드코딩 가드, 루트 빌드(`BASE_PATH=`)도 통과. OG 경로는 잠정(M5-01에서 확인)
- [x] M0-20 `scripts/lib/llm.ts`: live/mock 모드, Batches 제출·폴링, `usage` 집계 — SDK import는 이 파일에서만 — 2026-10-10 완료: `@anthropic-ai/sdk` 0.133, `createLlmClient`(submit/poll/collect/cancel/runBatch/callSingle), 429·5xx만 재시도, mock은 `fixtures/llm/mock/by-id|by-hash`, usage → RunLog.tokens(배치·단건 구분), 테스트 77개(실호출 없음). Haiku 5.5는 thinking 기본 켜짐 → M0-30에서 `effort:low`/`thinking:disabled` 비교 실측
- [x] M0-21 `scripts/lib/cost.ts`: 모델 단가 표(구현 시점 공식 단가 확인), 예상 비용 계산, 비용 기록(prod → `runs.json`, dev → `runs-dev.json`), 가드는 두 파일 합산 — 2026-10-10 완료: Haiku 5.5 공식 단가 확인(입력 $0.10/출력 $0.50 per MTok, 배치 50%, 캐시 읽기 0.1×·쓰기 1.25×/2×, 프롬프트 100K 초과 5×), KST 월·일 경계, 월 예산 prod+dev 합산·일일 예산은 prod 실행이면 prod만, dev 50% 알림, runs 원자적 기록·180일 보존. PRD §9.3 가정 재계산: 배치 기준 월 약 $0.10~0.24(thinking 출력 1~3배)
- [x] M0-22 구조화 로거 + GitHub 이슈 생성 헬퍼 (같은 원인이면 기존 이슈에 댓글) — 2026-10-10 완료: `scripts/lib/logger.ts`(비밀값 마스킹·Actions 주석), `scripts/lib/github-issues.ts`(fingerprint 마커로 같은 원인 → 댓글), collect.yml 실패 보고 전환 + 셸 폴백. 실실행 검증: 새 이슈 #2 → 재발 시 '2번째 발생' 댓글(테스트 이슈 닫음)

### M0-D 외부 검증 (결과는 `docs/research/m0-validation.md`에 기록)
- [x] M0-23 ❓ 1군 영문 RSS 8개 실작동·약관 확인 → 결과 보고·사용자 확인 후 `sources.json`에 `terms_checked`·`robots_checked` 기록, ESPN 처리 방식 결정 (CLAUDE §2·§6.4) — 2026-10-10 완료: 8개 피드 모두 정상, **약관상 AI 요약 가능 소스 0개**(B5 발생). 사용자 결정: BBC 4개·ESPN·The Athletic(축구 피드) 원제목+링크(`summarize:false`)로 수집, Sky·Guardian 제외. ESPN은 피드 URL·제목 무수정 조건. 결과 `docs/research/m0-validation.md`
- [x] M0-24 ❓ 2군 매체·기자 채널 확인: Romano Substack, CaughtOffside 작성자 페이지, Di Marzio, Plettenberg, Moretto, Ben Jacobs — RSS 유무·robots.txt → 사용자 확인 후 등록 — 2026-10-10 완료: 18개 채널 판정(AI 요약 0·금지 11·불명확 3·소멸 4). 사용자 결정: the Daily Briefing·Di Marzio·Relevo 원제목+링크(위험 수용), 5곳 기록용 비활성(m4ow 계약 대상은 접근 금지). 누적 결론으로 FR-20 재정의(PRD §15 D23·D24)
- [ ] M0-25 ❓ 국내 매체 RSS(인터풋볼·풋볼리스트·스포탈코리아·베스트일레븐) 제공 여부·이용 조건 → 사용자 확인 후 등록
- [ ] M0-26 Google News RSS: 한/영 쿼리 5종 테스트, 이용 조건, 하루 쿼리 상한 결정
- [ ] M0-27 GDELT DOC API: 다국어 쿼리 3종 테스트
- [ ] M0-28 football-data.org: 6개 대회 2026-27 순위·경기·득점 응답 확인, 분당 10회 지연 설계 + **약관: 응답 데이터의 LLM 입력·재가공(한국어 브리핑) 허용 여부, 무료 티어의 경기 득점자 제공 범위** (§14 B7, PRD §15 D24)
- [ ] M0-29 API-Football: **2026-27 시즌 무료 조회 가능 여부** → 분기 결정 기록 (§14 B1) + 약관: LLM 입력·재가공 허용 여부 (D24)
- [ ] M0-30 💰 Anthropic 실측: **정형 데이터 브리핑 샘플** 소량 배치 1회(M0-35 경기 데이터 입력, 1~3요청, 임시 프롬프트 — M0-28에서 LLM 입력 허용 확인 후) — 실제 단가, 배치 완료 소요 시간, 캐시 최소 프리픽스 충족 여부(`cache_read_input_tokens`), `effort:low`/`thinking:disabled` 출력 토큰 비교 (§14 B3, D24)
- [ ] M0-31 🙋 서비스명(KIPRIS)·저장소명 확인 결과 기록 (§14 B6)
- [ ] M0-32 2026-27 시즌 5대 리그 한국 선수 명단 **초안** (출처와 함께 기록, M3에서 확정)

### M0-E 시안·테스트용 실데이터 fixtures 🆕
> 시안을 가짜 문구로 만들면 실제 헤드라인 길이·브리핑 줄바꿈에서 디자인이 깨진다. 실제 데이터로 시안을 그리기 위해 M0에서 확보한다.
- [ ] M0-33 실제 RSS 수집 샘플 50건 → `fixtures/rss/`
- [ ] M0-34 💰 D0 시안 입력 (D23·D24): ① **원제목 카드 샘플** 15건 이상(M0-33 실데이터 — 피드 제목·링크 무수정, 영문·이탈리아어·스페인어 포함, 분류 태그는 임시 규칙 초안으로 채움, 국내 카드는 M0-25·M0-26 판정 통과분) → `fixtures/news-sample.json` ② **데이터 브리핑 샘플** 3~5일치(M0-35 입력, 임시 프롬프트 — M0-30 출력 재사용 가능) → `fixtures/brief-sample.json`
- [ ] M0-35 순위·경기·득점 샘플(5대 리그 + UCL) → `fixtures/football/`
- [ ] M0-36 테스트용 브리핑 LLM mock 응답(정상 · 스키마 위반 · 입력에 없는 숫자 포함 사례) → `fixtures/llm/` (D24)

### ✅ M0 완료 기준
- [ ] 빈 사이트가 Pages에 배포되고 basePath·404 정상
- [ ] CI green (`check` · `build` · `check:bundle` · `test:e2e`), main push 시 `deploy.yml` 배포 확인
- [ ] `sources.json`의 모든 소스에 `terms_checked`·`robots_checked` 값이 채워짐
- [ ] API-Football 분기(B1)·캐싱 여부(B3)·데이터 API의 LLM 입력 허용 여부(B7, D24) 결정이 기록됨
- [ ] 실측 단가로 PRD §9.3 가정을 확인 (차이가 크면 사용자에게 보고)
- [ ] §3 사용자 준비 작업 완료

---

## 5. D0 🎨 — 전체 디자인 콘셉트 (2~3일)

> **시안 2~3개 → 사용자 선택 → DESIGN.md → 구현.** 이 게이트가 끝나야 M1을 착수한다 (순차 진행, §2.1).

### D0-A 범위 정리
- [ ] D0-01 시안 범위 확정
  - 화면: **홈**(오늘의 5줄 = 데이터 브리핑 — "AI 작성" 라벨, 템플릿 강등 줄, 줄이 5개보다 적은 날 상태 포함 · 한국 선수 칩 자리 · 오늘 밤 경기 자리 · 주요 뉴스 피드), 헤더·모바일 하단 탭(2~5개 가변 — 미완성 섹션은 숨김)·데스크톱 3단, 테마 토글 (D24)
  - 상태 화면 기본형: 스켈레톤 · 빈 상태 · 오류 · 오프라인 (텍스트·도형 기반, 일러스트는 D3) 🆕
  - 뉴스 카드 변형 6종 (D23): **기본 = 원제목 카드**(영문·이탈리아어·스페인어 원제목 그대로 + 한국어 태그) / 다출처 클러스터(+N곳) / 이적(단계 + Tier 배지) / 한국 선수 관련 / 경기 결과(결과 가리기 켠 상태) / 한국어 보도 카드(국내 매체·Google News 한국어 — M0-25·M0-26 판정 결과). 강등 카드는 기본 카드와 같아져 한국어 보도 카드로 대체
  - 브랜드: 워드마크(텍스트 로고), 컬러·타이포 토큰, 대회 컬러 6종 시범 적용
- [ ] D0-02 ❓ U-10 응답이 있으면 반영할 키워드 확인 (없으면 생략)

### D0-B 시안 제작 (`/design-concepts d0`, `design-concepts` 에이전트)
- [ ] D0-03 시안 2~3개: `docs/design/d0/concept-{a,b,c}.html` — 외부 의존 없는 단일 HTML, `fixtures/news-sample.json`(원제목 카드)·`fixtures/brief-sample.json`(데이터 브리핑) 실데이터 사용 (M0-34)
- [ ] D0-04 Playwright 스크린샷: 시안별 375px·1280px × 라이트·다크 (4장씩)
- [ ] D0-05 비교표: 콘셉트명 · 한 줄 설명 · 장점 · 단점 · 구현 난이도 · 번들/폰트 영향 + 추천안(이유)
- [ ] D0-06 🙋 사용자 선택 또는 혼합 지시
- [ ] D0-07 (혼합 지시 시) 혼합안 1회 제작 → 재확인

### D0-C 확정·토큰화
- [ ] D0-08 `docs/design/DECISIONS.md`에 선택안·이유·혼합 지시 기록 (날짜 포함)
- [ ] D0-09 `DESIGN.md` v0.1 작성: 컬러(중립·액센트·대회 6·상태: 승/무/패·상승/하락·이적 단계·Tier), 타이포 스케일(본문 + 숫자 폰트, tabular nums), 간격·radius·그림자·모션 토큰, 브레이크포인트, 컴포넌트 규칙 (DR-04, DR-12)
- [ ] D0-10 토큰 → `globals.css` CSS 변수 + `@theme`, 다크 모드 + 깜빡임 없는 초기 테마 스크립트 (DR-02)
- [ ] D0-11 웹폰트 2종 서브셋·self-host, `font-display: swap` (DR-03)
- [ ] D0-12 기초 컴포넌트 토큰 적용: Chip · Card · Button · Tabs · Skeleton · Toast — shadcn 기본 모양 탈피

### 참고: 시안 방향 후보 (초안) 🆕
D0에서 실제로 비교할 방향의 출발점이다. 최소 두 축(레이아웃·타이포·색 전략·밀도·모션)이 서로 다르게 잡았다. 최종 시안은 fixtures를 넣어 보며 조정한다.

| 후보 | 콘셉트 | 레이아웃 | 타이포 | 색 전략 | 밀도·모션 |
|---|---|---|---|---|---|
| **A. Broadsheet** | 조간신문 같은 에디토리얼 | 컬럼 그리드, 큰 1면 헤드라인 | 굵은 명조/세리프 헤드라인 + 산세리프 본문 (숫자는 둘 중 하나의 tabular 숫자 — 웹폰트 2종 이내, DR-11) | 모노톤 + 액센트 1색 | 낮은 밀도, 정적 |
| **B. Floodlight** | 야간 경기장 조명 | 카드 스택, 대담한 섹션 전환 | 굵은 그로테스크, 큰 숫자 | 다크 퍼스트, 대회 컬러를 빛처럼 | 중간 밀도, 모션 강조 |
| **C. Matchsheet** | 스위스 스타일 데이터 시트 | 정밀 그리드, 표·리스트 중심 | 그로테스크 + 모노 숫자 | 중립 + 대회 컬러 코딩 바 | 높은 밀도, 미세 모션 |

### ✅ D0 완료 기준
- [ ] 사용자 선택이 DECISIONS.md에 기록됨
- [ ] DESIGN.md v0.1 + 토큰이 `globals.css`로 생성됨
- [ ] 기초 컴포넌트 스크린샷(375/1280 × 라이트/다크)이 선택 시안과 일치

---

## 6. M1 — 뉴스 MVP (1주)

**목표**: 매일 07:00 KST에 뉴스 카드 30~50건(해외 원제목 + 한국어 태그, 국내 한국어 카드)과 데이터 브리핑 "오늘의 5줄"이 자동 발행되는 공개 사이트 (D23·D24).
**관련 요구사항**: FR-01~09, FR-11~36 (FR-10은 M3-08, FR-37은 M4-15), FR-140, FR-150~154, NFR-04~06, 브리핑 입력 데이터(M2-02 어댑터의 일부를 M1-44로 당김)

> **D23·D24 반영 (2026-10-10)** — 뉴스 카드는 LLM 없이 원제목+링크와 코드 규칙 분류로 만들고(M1-B), LLM은 정형 데이터 기반 일일 브리핑에만 쓴다(M1-C). 작업 ID는 유지하고 M1-15·M1-17~M1-24의 내용을 바꿨으며 M1-44·M1-45를 추가했다.

### M1-0 얇은 수직 슬라이스 🆕 (첫날)
> 각 단계를 완벽히 만들기 전에, 전 구간이 한 번 끝까지 도는지부터 확인해 통합 위험을 먼저 없앤다.
- [ ] M1-01 💰 BBC RSS 1개 → 상위 5건 원제목 카드(분류 최소 규칙) → `data/news/YYYY-MM-DD.json` + 전날 경기 결과로 브리핑 1요청(저장은 M1-19 스키마 확정 전이라 로그 출력만) → 무스타일 목록 페이지 → Actions에서 커밋·빌드·Pages 배포까지 한 번에 성공 (D23·D24)

### M1-A 수집 (FR-01~11)
- [ ] M1-02 `configs/sources.json` 초기 등록(M0 검증 통과분만) + 로더(`enabled && terms_checked`만) — `summarize` 값과 무관하게 LLM 미전송 (D23)
- [ ] M1-03 RSS 어댑터 (타임아웃·재시도, 소스별 실패 격리)
- [ ] M1-04 기자 채널 RSS: the Daily Briefing(Substack)·Di Marzio — 작성자 필터는 현재 대상 없음(M0-23·M0-24: Guardian 제외, The Athletic은 축구 피드 전체를 원제목으로 수집), `author` 필드 지원만
- [ ] M1-05 목록 크롤러 `scripts/crawlers/<site>.ts` — M0에서 허용 확인된 사이트만 (robots.txt, User-Agent, 2~3초 지연, 하루 1회)
- [ ] M1-06 Google News RSS 검색 어댑터 + `configs/search-queries.json`
- [ ] M1-07 GDELT 어댑터
- [ ] M1-08 OG 메타 경량 수집기 — 요약 없는 항목만, `<head>`만 파싱, 최대 500자. 해외 원제목 소스는 OG 보충 안 함(M0-23·D23), 국내 소스는 M0-25 판정에 따름
- [ ] M1-09 공통 형식 정규화 + zod 검증 (FR-03), "본문 필드 없음" 테스트 (FR-02)
- [ ] M1-10 수집 시간 창: 직전 성공 실행 ~ 현재, 최대 36시간 (FR-07)
- [ ] M1-11 소스 건강도 기록 + 3일 연속 0건 이슈 (FR-11)
- [ ] M1-44 🆕 football-data 최소 어댑터 (D24): 브리핑 입력용으로 전날(KST 창) 6개 대회 경기 결과·득점자(무료 티어 제공 범위는 M0-28)·현재 순위만 → `scripts/lib/providers/`, 분당 10회 지연, 실패 시 그날 브리핑 생략(뉴스는 발행). M2-02가 이 어댑터를 대회 페이지용으로 확장

### M1-B 정제·분류 — 코드, 순수 함수 + 단위 테스트
- [ ] M1-12 URL 정규화(utm·트래킹 파라미터·AMP) + 해시 중복 제거 + `seen-urls.json`(90일) (FR-04)
- [ ] M1-13 제목 유사도 클러스터링 — 다국어 혼합(en·it·es·ko), 임계값은 fixtures로 튜닝 (FR-05)
- [ ] M1-14 점수화 + 상위 `MAX_ITEMS_PER_RUN` 선별, 이적 창 가중 연결 지점 마련 (FR-06, FR-105)
- [ ] M1-15 카드 생성 경로 (FR-20, D23): 해외 클러스터 → 원제목+링크 카드(`ai:false`, `s:[]`, 대표 항목의 피드 `title`·`link` 무수정 — 엔티티 디코딩·앞뒤 공백 정리만, 200자 초과는 건너뛰고 로그, 대표 항목은 Tier·weight·최신성 순). 한국어 클러스터 → LLM 생략, RSS 요약 절단(약관 허용 시) 또는 제목+링크. 원제목·링크가 피드 원문과 같은지 테스트
- [ ] M1-16 카드 ID 결정적 해시 `c_` + 16진수 10자리 (대표 URL 기준, 공유 앵커 유지, PRD §15 D15)
- [ ] M1-17 코드 분류 규칙 v0.1 (FR-21, D23): 카테고리(언어별 키워드 en·it·es·ko), 대회(소스 `competitions` + 팀→리그 + 키워드), 팀·선수(`names.ko.json` 영문 표기 매칭), `kr`(`korean-players.json`), 중요도(FR-06 점수 → 1~5 구간), spoiler(결과 카테고리·스코어 패턴·승패 키워드 → `true`). M0-33 실데이터 fixtures로 언어별 단위 테스트
- [ ] M1-18 이적 추출 규칙 (FR-21·FR-100~103 입력, D23): 상태 키워드 표(언어별, 의문·부정형은 rumor), 선수·출발·행선지는 사전 매칭으로 확실할 때만, `tier` = 클러스터 최고 출처 Tier, `agreed` 이상 승격 조건(PRD F10 "정확도 한계") + 단위 테스트

### M1-C 데이터 브리핑 — LLM (FR-22~29, D24)
> 일일 LLM 호출 #1. 입력은 정형 데이터만, 기사 텍스트 금지. 데이터 API 약관이 LLM 입력을 막으면(B7) 코드 템플릿 브리핑만 운영하고 ❓ 사용자 확인.
- [ ] M1-19 브리핑 입력 빌더 + 코드 템플릿 문장 (D24): M1-44 데이터 → 정형 JSON(전날 KST 창 경기 결과·득점자·현재 순위, 짧은 키, 중요도 순 상한), 경기가 없으면 호출 생략. 같은 입력으로 템플릿 문장 생성기(폴백·강등·예산 초과 공용, 결정적, `ai:false`). 순위 변동은 M2-03, 한국 선수 출전은 M3-03 이후 입력에 추가. ❓ 브리핑 저장 스키마(PRD §8.2 초안) 사용자 확인 → 부록 A
- [ ] M1-20 `configs/prompts/summarize.md` v0.1(파일명 유지 = 일일 브리핑 프롬프트) + 출력 zod 스키마 — 뉴스체(`~했다`), 최대 5줄·줄당 60자 내외, 입력에 없는 사실 금지, 고유명사는 영문 유지, 짧은 키 JSON(줄마다 근거 경기 ID), `max_tokens` 상한. 💰 dev 소량 실행으로 길이·문체 확인 (FR-22, FR-23)
- [ ] M1-45 🆕 💰 브리핑 실행: Batches 제출·폴링(하루 1~3요청, 캐싱은 B3 결과에 따름), 06:50 미완료 → 배치 취소 + 템플릿 게시, zod 실패 → 1회 재시도 → 템플릿 강등, 길이 재검증·절단 (FR-25, FR-26, FR-29)
- [ ] M1-21 고유명사 치환(브리핑 출력) + 태그 한글 표시 + `unknown-names.json` 적재(데이터 API 이름·브리핑 출력), `names.ko.json` 초기 사전(빅클럽·주요 선수·감독 + 원제목에 자주 나오는 이름 — M1-17 매칭에도 씀) (FR-24)
- [ ] M1-22 비용 가드: 일 $0.10 / 월 $3, dev+prod 합산, 실행 전 예상 비용 출력, 초과 예상 시 템플릿 브리핑, dev 사용이 월 예산 50% 초과 시 알림 (FR-27, CLAUDE §6.3)
- [ ] M1-23 🆕 **자동 사실성 검사기(브리핑)**: 브리핑에 나온 숫자·스코어·팀·선수 이름이 입력 데이터에 실제로 있는지 코드로 대조 → 불일치 줄은 템플릿 문장으로 교체 (재시도 없음 — 호출 증가는 CLAUDE §1-3에 따라 승인 필요. 비용 0, FR-22 보강) (D24)
- [ ] M1-24 🆕 **골든셋 회귀 평가(브리핑)**: 대표 입력 10일치(`fixtures/llm/golden/` — 경기 많은 날·적은 날·UCL 주간·대승·무승부 포함, PRD §9.2) + `npm run eval:prompt` — 프롬프트 수정 전후 출력 diff·검사기 결과 비교 (CLAUDE §6.3 구체화) (D24)

### M1-D 검증·발행·운영
- [ ] M1-25 발행 검증 게이트: 스키마, 카드 수 하한(≥10, 휴식기 5), 링크 형식, `configs/takedowns.json` 등록 카드 제외 + 다음 수집에서 `data/` 원본 삭제 (FR-143, FR-153)
- [ ] M1-26 `collect.yml` 완성: 수집 → 정제·분류 → 데이터 브리핑 → 검증 → 빌드 → `data/` 커밋(변경분만, `pull --rebase`) → `deploy.yml` 호출. 빌드 실패 시 커밋하지 않음 (CLAUDE §10)
- [ ] M1-27 `runs.json` 기록 완성 (토큰·비용·건수·실패 소스·API 호출 수) + 실패 이슈 (FR-151, FR-152)
- [ ] M1-28 롤백 리허설: `data/` 커밋 revert → `deploy.yml` 수동 실행 (FR-154, CLAUDE §12)
- [ ] M1-29 커스텀 커맨드 동작 완성: `/add-source` · `/add-name` · `/takedown`

### M1-E 화면
- [ ] M1-30 앱 셸: 헤더(워드마크·검색 자리·테마 토글), 모바일 하단 탭(최종 5개, M1 시점은 홈·뉴스만 노출 — 미완성 섹션 숨김), 데스크톱 3단 그리드, 푸터(데이터 출처·AI 고지·마지막 업데이트 HH:MM KST) (DR-01, FR-142)
- [ ] M1-31 뉴스 카드 + D0의 6개 변형 — 원제목(무수정)·한국어 태그 칩, 출처 스택(+N곳), 중요도, KST 상대 시간 (FR-30, D23)
- [ ] M1-32 홈: 오늘의 5줄(데이터 브리핑 — LLM 줄에 "AI 작성" 라벨, 템플릿 줄은 라벨 없음) + 주요 뉴스 피드 (다른 섹션은 해당 단계에서 노출) (FR-35, D24)
- [ ] M1-33 `/news` 필터(대회·팀·카테고리·한국 선수) + URL 쿼리 동기화 (FR-31, FR-32)
- [ ] M1-34 `/news/[date]` 아카이브: 이전/다음 날짜, 달력 점프, `generateStaticParams` (FR-33)
- [ ] M1-35 카드 공유(Web Share/링크 복사, 카드 앵커) + 오류 신고 링크(카드 ID·브리핑 날짜 자동 입력) (FR-34, FR-36)
- [ ] M1-36 `/about`(서비스·발행 시각·출처·저작권 정책·Tier 설명·AI 고지·데이터 출처·연락처) + 커스텀 404 (FR-140)
- [ ] M1-37 상태 디자인 4종: 스켈레톤 · 빈 상태 · 오류(마지막 정상 데이터) · 오프라인 (DR-07)
- [ ] M1-38 기본 SEO: 페이지별 title/description/OG 기본값, sitemap, robots.txt (FR-124) — ❓ 프로젝트 사이트라 `/euro-digest/robots.txt`는 크롤러가 읽지 않음(호스트 루트만 유효) → Search Console sitemap 제출 vs 사용자 사이트 저장소 루트에 두기 결정 (M0-19 메모)
- [ ] M1-39 시각 검증: 375/1280 × 라이트/다크 스크린샷 ↔ D0 선택안 비교, 접근성 자동 검사, 번들 예산 확인

### M1-F 운영 리허설·실측 🆕
- [ ] M1-40 수동 dispatch 3회 연속 성공 → cron-job.org **06:30 KST 정기 실행 활성화** + 저장소 변수 `COLLECT_ENABLED=true`(백업 schedule 활성화, M0-14)
- [ ] M1-41 7일 연속 정시 발행 관찰 (관찰 기간이 서머타임 전환일과 겹치면 경기 시각 KST 표시도 확인)
- [ ] M1-42 💰 첫 주 실측 비용·캐시 적중 확인 → PRD §9.3 비용표 갱신, 캐시 적중 0이면 캐싱 코드 제거
- [ ] M1-43 첫 주간 품질 검수: 브리핑 20줄(입력 데이터 대조·고유명사) → 정확도 ≥ 90%, 카드 20건 코드 분류(카테고리·태그·이적 단계·spoiler) → 정확도 기록·규칙 보정 (D23·D24)

### ✅ M1 완료 기준
- [ ] 7일 연속 07:00 KST ±15분 발행 (일 30~50건, 중복 카드 0)
- [ ] 일 LLM 비용 ≤ $0.10 실측, `runs.json`에 기록
- [ ] 검증 게이트 실패 시 전날 사이트 유지가 실제로 동작함 (의도적 실패 1회 테스트)
- [ ] 모든 카드에 출처명·원문 링크, 해외 카드 제목·링크가 피드 원문과 일치, 브리핑의 LLM 줄(`ai:true`) 전부에 "AI 작성" 라벨 (뉴스 카드·템플릿 줄에는 없음) (D23·D24)

---

## 7. D1 🎨 — 대회·팀 화면 (1~2일, M1 코드 작업 완료 후 — 7일 발행 관찰과 병행 가능, §2.2)

> D0 토큰 위에서 **레이아웃·표현 방식**이 다른 시안 2~3개. 색만 바꾼 변형은 시안으로 인정하지 않는다.
- [ ] D1-01 범위: 순위표(모바일 좁은 화면 처리 방식 포함), 폼 칩(W/D/L), 순위 변동 ▲▼, 구간 표시(챔스·유로파·강등), 팀 헤더 + 팀 컬러 이니셜 배지, 포메이션 피치 다이어그램, 경기 카드(오늘 밤 선정 이유 태그), 일정 리스트
- [ ] D1-02 시안 2~3개(`docs/design/d1/`) + 스크린샷 + 비교표·추천안
- [ ] D1-03 🙋 사용자 선택 → DECISIONS.md 기록, DESIGN.md 컴포넌트 절 추가

---

## 8. M2 — 대회·팀 (1주)

**목표**: 5대 리그 + UCL 순위·일정·결과가 매일 갱신되고, 모든 팀 페이지와 "오늘 밤 볼 경기"가 제공됨.
**관련 요구사항**: FR-40~59, FR-80~84

### M2-A 데이터
- [ ] M2-01 `configs/competitions.json`: 6개 대회, API ID, 시즌, 구간 규칙(챔스·유로파·강등권)
- [ ] M2-02 football-data 어댑터(`scripts/lib/providers/`, M1-44 최소 어댑터를 확장): 순위·경기·득점, 분당 10회 지연, 실패 시 전일 데이터 유지 + "업데이트 지연" 표시
- [ ] M2-03 순위 변동(전일 대비)·최근 5경기 폼 계산 + 단위 테스트 → 브리핑 입력(M1-19)에 순위 변동 추가 (D24)
- [ ] M2-04 팀 목록 생성: 5대 리그 96팀 + UCL 외부 팀 → `data/teams/*.json`, slug 규칙 확정
- [ ] M2-05 `names.ko.json` 팀명 전체(~110팀) + `team-colors.json`(2색 + 영문 약어) — Claude Code가 초안 작성 → 🙋 사용자 검토 (DR-05)
- [ ] M2-06 주요 선수: 팀 내 득점·도움 상위 3명 (FR-54)
- [ ] M2-07 포메이션: B1 결과에 따라 API-Football 라인업 최빈값(주 1회, 일 50회 이내 분산) 또는 `formations.json` 수동 / 미표시 (FR-55)
- [ ] M2-08 `bigmatch-rules.json`(더비 목록·가중치) + "오늘 밤 볼 경기" 선별 로직 + 테스트 (FR-80~82, FR-84)
- [ ] M2-09 `collect.yml`에 축구 데이터 단계 통합, API 호출 수 `runs.json` 기록

### M2-B 화면
- [ ] M2-10 `/competitions/[comp]` 탭: 순위표 · 일정/결과(라운드 이동, KST) · 득점 순위 · 뉴스 (FR-40, FR-41, FR-44)
- [ ] M2-11 순위표 컴포넌트: ▲▼ 변동, 폼 칩, 구간 표시(색 + 텍스트 병기) (FR-42)
- [ ] M2-12 UCL 리그 페이즈 순위표 + 녹아웃 대진 자동 전환 구조 (FR-43)
- [ ] M2-13 `/teams/[team]`: 헤더(배지·순위·폼·다음 경기), 일정·결과, 득점 상위, 주요 선수, 포메이션 피치, 관련 뉴스(30일), 소속 한국 선수 자리 (FR-50~52, FR-54~58)
- [ ] M2-14 `/tonight` + 홈 "오늘 밤 볼 경기" 섹션 (FR-80~82; ics 버튼은 M4)
- [ ] M2-15 홈 "리그 순위 미니" 위젯(탭 전환, 상위 5위)
- [ ] M2-16 데이터 출처·갱신 시각 표기 (FR-45) + 시각 검증·접근성 검사

### ✅ M2 완료 기준
- [ ] 6개 대회 페이지 + 전 팀 페이지 정적 생성, 데이터 매일 갱신
- [ ] football-data 하루 18회 내외, API-Football 하루 ≤ 60회 실측
- [ ] 오늘 밤 볼 경기가 매일 1~5경기 선별됨 (경기 없는 날은 빈 상태)

---

## 9. D2 🎨 — 한국 선수·이적·마이 팀 (1~2일, M2 완료 후)

- [ ] D2-01 범위: 한국 선수 카드(목록·상세), 출전 로그, 홈 하이라이트 칩, 주간 리포트 레이아웃, 이적 카드(상태 진행 바·Tier 배지·기사 타임라인), A매치 섹션, **마이 팀 온보딩·`/my`**, **검색 오버레이·`/search`** 🆕(PRD 게이트 목록에 없던 화면을 여기에 포함)
- [ ] D2-02 시안 2~3개(`docs/design/d2/`) + 스크린샷 + 비교표·추천안
- [ ] D2-03 🙋 사용자 선택 → DECISIONS.md, DESIGN.md 갱신

---

## 10. M3 — 한국 선수·A매치 (1주)

**목표**: 5대 리그 한국 선수 현황·상세, 대표팀 페이지, 주간 리포트 첫 발행.
**관련 요구사항**: FR-60~73, FR-90~93, FR-10

### M3-A 데이터
- [ ] M3-01 🙋 `korean-players.json` 확정(2026-27, M0-32 초안 검토) → `/add-player`로 등록(표기 사전·검색 쿼리 포함) (FR-60)
- [ ] M3-02 선수 기록 어댑터: API-Football(소속팀 경기 다음 날만 호출) 또는 B1 폴백 경로 (FR-61, FR-65)
- [ ] M3-03 `data/players/korean.json`: 최근 출전·골/도움·시즌 누적·다음 경기(KST)·UCL 출전 → 브리핑 입력(M1-19)에 한국 선수 출전·골 추가 (D24)
- [ ] M3-04 이적 감지 이슈 자동 생성(FR-63), 5대 리그 밖 이적 시 '기타 리그' 처리(FR-64)
- [ ] M3-05 🙋 `national-team.json`에 현 시즌 A매치 일정 입력 + A매치 기간 판정(±3일) (FR-70, FR-71)
- [ ] M3-06 `weekly.yml` 골격: **매주 월요일 08:00 KST** (일일 발행 이후, push 금지 시간대 회피), 단계별 실패 격리, `concurrency: collect` 공유(같은 `data/` 파일 동시 쓰기 방지), 끝에서 빌드 → `data/` 커밋 → `deploy.yml` 호출(월요일 당일 공개, FR-90)
- [ ] M3-07 `configs/prompts/weekly-kr.md` + 💰 주간 총평 1회 호출 + 이번 주 MVP 규칙 계산(코드) (FR-90~92)
- [ ] M3-08 분석 블로그 주 1회 수집(LLM 없음) → 팀 페이지 "더 읽을거리" (FR-10, FR-57)

### M3-B 화면
- [ ] M3-09 `/korean-players`: 리그별 그룹 카드 (FR-61)
- [ ] M3-10 `/korean-players/[slug]`: 시즌 기록, 최근 5경기 출전 로그, 다음 경기, 관련 뉴스(한/영) (FR-62)
- [ ] M3-11 홈 "한국 선수 하이라이트" 칩 + 팀 페이지 소속 한국 선수 연결 (FR-58)
- [ ] M3-12 `/korean-players/weekly` + 아카이브 `/korean-players/weekly/[yyyy-ww]` (FR-93)
- [ ] M3-13 `/national-team` + 홈 A매치 자동 섹션 + 소집 선수 → 선수 상세 링크 (FR-71~73)
- [ ] M3-14 시각 검증·접근성 검사

### ✅ M3 완료 기준
- [ ] 주간 리포트 1회 실제 발행 (월요일 자동 실행)
- [ ] 한국 선수 전원 상세 페이지 생성, 소속팀 경기 다음 날 갱신 확인

---

## 11. M4 — 부가 기능 (1.5주)

**목표**: 이적 트래커·팀 프로필·마이 팀·PWA·RSS·캘린더·검색·결과 가리기.
**우선순위**: 1월 이적시장 대비 **C 이적 트래커를 가장 먼저** 끝낸다 (§2.3).

### M4-A 이적시장 트래커 (C) — FR-100~106
- [ ] M4-01 `transfers.json` 집계: 카드의 `transfer` 필드 → 선수 단위, 상태 머신(역행 금지, `collapsed` 예외) + 단위 테스트 (FR-100, FR-102)
- [ ] M4-02 'Here we go' 키워드(+ Tier 1 출처) → `agreed` 가중, 30일 무갱신 "잠잠" 처리 (FR-103, FR-106, D23)
- [ ] M4-03 `transfer-windows.json` + 이적 창 모드(홈 이적 섹션 상단, 선별 가중) (FR-105)
- [ ] M4-04 `/transfers`(리그·팀·상태·Tier·한국 선수 필터) + 홈 "이적 핫 리스트" (FR-101, FR-104)

### M4-B 팀 프로필 — 한줄평 + 강점/약점 (FR-53, FR-56)
- [ ] M4-05 `configs/prompts/team-profile.md` — 입력 지표(득점·실점·홈/원정·폼·득점 분포)에 근거한 내용만, 한줄평 1문장 + 강점/약점 각 2개를 **한 호출로**
- [ ] M4-06 💰 `weekly.yml`에 20팀 묶음 배치 추가, 팀 페이지에 생성 날짜 표시, 골든셋 10팀 회귀 비교

### M4-C 마이 팀 (E) — FR-110~115
- [ ] M4-07 안전한 저장소 유틸(모든 접근 try/catch) + 팔로우 상태 훅
- [ ] M4-08 팔로우 버튼(팀·선수), `/my`, 홈 "내 팀 소식", 피드 "내 팀만" (FR-110~112, FR-59)
- [ ] M4-09 첫 방문 온보딩: 리그 → 팀(최대 5) → 한국 선수, 건너뛰기 가능 (FR-113)
- [ ] M4-10 팔로우 내보내기/가져오기(URL 파라미터) (FR-114)

### M4-D PWA·RSS·캘린더 (G) — FR-120~123
- [ ] M4-11 `build-feeds.ts`: `/rss.xml`(상위 30), `/rss/[comp].xml`, `/rss/korean.xml` (FR-122)
- [ ] M4-12 `.ics`: 팀별, 한국 선수 소속팀 묶음, 경기별 + 버튼 연결, 시간대 테스트 (FR-59, FR-83, FR-115, FR-123)
- [ ] M4-13 manifest + 서비스워커(basePath scope, 앱 셸 + 최근 3일 뉴스 캐시, 새 버전 토스트) — 아이콘은 임시, D3에서 교체 (FR-120, FR-121)

### M4-E 검색·결과 가리기
- [ ] M4-14 Pagefind 인덱싱 + 한/영 별칭 메타 + `/`·`⌘K` 검색 오버레이 + `/search` (FR-130~132)
- [ ] M4-15 결과 가리기 토글(기본 꺼짐): `spoiler` 카드·오늘의 5줄 결과 줄·순위 변동·스코어 흐림, 탭하면 공개 (FR-37, D24)
- [ ] M4-16 시각 검증 + 번들 예산 재확인(검색·서비스워커 추가 후 초기 JS ≤ 160KB, PRD §15 D21)

### ✅ M4 완료 기준
- [ ] 기능별 PRD 수용 기준 통과
- [ ] 팀 프로필 첫 주간 실행 비용 실측·기록
- [ ] 오프라인에서 최근 3일 뉴스 열람 가능, RSS·ics가 외부 리더·캘린더 앱에서 정상 동작

---

## 12. D3 🎨 — 아이콘·OG·빈 상태·상태 페이지 (1~2일, M4 완료 후)

- [ ] D3-01 범위: 앱 아이콘(maskable 포함), OG 이미지 템플릿(날짜별·대회별·팀별), 빈 상태 일러스트(비시즌·휴식기·검색 결과 없음 — **도형·타이포 기반 SVG**, 이미지 자산 금지 규칙 준수), **`/status` 페이지** 🆕(P-1 승인분)
- [ ] D3-02 시안 2~3개(`docs/design/d3/`) + 비교표·추천안
- [ ] D3-03 🙋 사용자 선택 → DECISIONS.md, DESIGN.md 갱신

---

## 13. M5 — 다듬기·정식 공개 (1주)

**목표**: PRD KPI(Lighthouse·접근성·SEO·운영)를 달성하고 정식 공개.

- [ ] M5-01 OG 이미지 빌드 시 생성(날짜·대회·팀) — **Playwright로 템플릿 HTML 스크린샷**(확정, 새 의존성 없음) (DR-10) — ❓ 파일 경로는 M0-19 잠정안(`/og/default.png`·`/og/news/{date}.png`·`/og/competitions/{comp}.png`·`/og/teams/{team}.png`, `artifacts.ogImage`) — 공개 URL 구조라 착수 전 사용자 확인
- [ ] M5-02 앱 아이콘·테마 컬러 교체
- [ ] M5-03 SEO: canonical, 구조화 데이터(NewsArticle·SportsTeam·SportsEvent), 전체 sitemap (NFR-03)
- [ ] M5-04 GoatCounter 연동 + 이벤트(원문 클릭·RSS/ics 클릭·PWA 설치·마이 팀 설정) (PRD §11.2)
- [ ] M5-05 `/privacy` (FR-141)
- [ ] M5-06 접근성 감사: WCAG AA(다크 포함)·키보드·스크린리더 라벨 → Lighthouse 접근성 ≥ 90 (NFR-02)
- [ ] M5-07 성능 최적화 → Lighthouse 모바일 성능 ≥ 95, LCP ≤ 2.0s, CLS ≤ 0.05 (NFR-01, DR-11)
- [ ] M5-08 `check:bundle` 비밀값 grep + Lighthouse CI를 `ci.yml`에 추가 (NFR-07)
- [ ] M5-09 `ops-report.ts`: 월요일 운영 리포트 이슈(비용·성공률·소스 건강도·미등록 고유명사) (FR-155)
- [ ] M5-10 데이터 보존: 90일 지난 일별 JSON 월별 병합, `runs.json`·`runs-dev.json` 180일 (FR-158)
- [ ] M5-11 `/new-season` 커맨드 완성 (FR-156)
- [ ] M5-12 브라우저 확인: Chrome·Safari(iOS)·Edge·Samsung Internet 최신 2버전 (NFR-13)
- [ ] M5-13 `code-reviewer` 전체 리뷰 → 지적 사항 수정
- [ ] M5-14 문서 정리: README, CLAUDE.md §13 미결 사항, PRD 비용표·결정 사항 갱신
- [ ] M5-15 🆕 `/status` 공개 상태 페이지(빌드 시 `runs.json`·`runs-dev.json`에서 생성): 마지막 발행 시각, 최근 30일 성공률, 소스 건강도, 이번 달 비용 사용률(prod+dev 합산, 예산 대비 %) — 푸터에서 링크 (P-1)
- [ ] M5-16 정식 공개 체크리스트 통과 → 공개

### ✅ M5 완료 기준 = PRD §11.1 운영 KPI
- [ ] Lighthouse 성능 ≥ 95 / 접근성 ≥ 90 (모바일)
- [ ] 최근 30일 파이프라인 성공률 ≥ 95%, 정시 발행 ±15분
- [ ] 월 총비용 ≤ $3 (실측)
- [ ] 주간 샘플 브리핑 정확도 ≥ 90% (D24)

---

## 14. M0 결과에 따른 분기 계획

| ID | 상황 | 대응 | 영향 작업 |
|---|---|---|---|
| **B1** | API-Football 무료로 2026-27 시즌 조회 불가 | 한국 선수는 경기 결과 + 득점 순위 + 뉴스 기반 "출전·득점 소식"(FR-65), 포메이션은 `formations.json` 수동(빅클럽 우선) 또는 미표시 | M2-07, M3-02 |
| **B2** | Google News RSS 이용 불가 | GDELT + 국내 매체 RSS로 대체, NewsData.io 등은 ❓ 승인 후 | M1-06 |
| **B3** | 프롬프트 캐싱 최소 길이 미달 | 캐싱 코드 제거(일일 브리핑은 하루 1~3요청이라 대개 해당), PRD 비용표 갱신 (D24) | M1-45, M1-42 |
| **B4** | 실측 일 비용 > $0.10 | ❓ 승인 후 순서대로: 브리핑 입력 축소(경기 수 상한·필드) → `effort`/thinking 조정 → (주간) 팀 프로필 묶음 확대. PRD §9.3 추정(하루 $0.001 미만)상 발생 가능성은 낮다 (D24) | M1-19, M1-22 |
| **B5** | 핵심 RSS 약관상 요약 불가 — ⚠️ **발생(M0-23, 2026-10-10)**: 1군 8개 모두 AI 요약 불가 판정 | 해당 소스는 원제목+링크만 또는 제외 → `Source.summarize` 필드 도입 (PRD §15 D22). M0-24까지 누적 26채널 AI 요약 가능 0 → **FR-20 재정의(PRD §15 D23·D24)**: 해외 카드는 모두 원제목+링크 + 코드 분류, LLM 호출 #1은 정형 데이터 브리핑 | M1-02, M1-15, M1-17~M1-24, M1-44, M1-45, D0-01, M0-30·M0-34·M0-36 |
| **B6** | 서비스명 상표·저장소명 충돌 | ❓ 이름 재검토 — 저장소명·basePath에 영향하므로 **M0에서 먼저** 결정 | M0-01, M0-13 |
| **B7** 🆕 | 데이터 API 약관상 LLM 입력·재가공 불가 (M0-28·M0-29, D24) | 코드 템플릿 브리핑만 운영(LLM 없음), 호출 지점 #1 재검토 ❓ | M1-19, M1-45 |

---

## 15. 제안 사항 (plan 단계)

### 15.1 이 문서에 반영한 보강 🆕 (PRD 범위 변경 없음)
| # | 제안 | 이유 | 비용 |
|---|---|---|---|
| 1 | **얇은 수직 슬라이스** 우선 (M1-01) | 수집→LLM→커밋→Pages 통합 위험을 첫날 제거 | 소량 |
| 2 | **실데이터 fixtures로 시안 제작** (M0-E) | 실제 헤드라인 길이에서 깨지지 않는 디자인 | 소량 |
| 3 | **자동 사실성 검사기** (M1-23) | 브리핑의 숫자·이름 환각을 입력 데이터와 대조해 코드로 차단 — 무인 운영의 신뢰도 핵심 (D24) | 0 |
| 4 | **골든셋 회귀 평가** (M1-24) | 프롬프트 변경 품질을 매번 같은 기준으로 비교 | 실행 시 소량 |
| 5 | **Anthropic Console 지출 한도** (U-03) | 코드 가드가 고장 나도 과금 폭주 방지 | 0 |
| 6 | **운영 리허설 후 cron 활성화** (M1-40) | 첫 자동 발행 실패 위험 감소 | 0 |
| 7 | **일정 앵커** (§2.3) | 서머타임·1월 이적창에 맞춘 우선순위 | 0 |
| 8 | D2에 **마이 팀 온보딩·/my·검색 오버레이** 포함 | 디자인 게이트에서 빠져 있던 화면 | 0 |

### 15.2 범위 변경 제안 (PRD 반영 필요)
| # | 제안 | 설명 | 비용 | 상태 |
|---|---|---|---|---|
| P-1 | **`/status` 공개 상태 페이지** | `runs.json` 기반: 마지막 발행 시각, 소스 건강도, 이번 달 비용 사용률. 관리자 화면 없이 운영 상태를 한눈에 보고, 방문자에게 투명성 제공 | 0 (빌드 시 생성) | ✅ 승인 (2026-10-10) → D3·M5-15. PRD §4 IA·§14.1·§15 D12 반영 완료 |
| P-2 | OG 이미지 생성 방식 | Playwright 템플릿 스크린샷 (새 의존성 없음) | 0 | ✅ 승인 (2026-10-10) → M5-01. PRD DR-10·§15 D13 반영 완료 |

---

## 16. 공개 후 운영 루틴 (반복 체크리스트)

> 아래는 템플릿이다. 실제 기록은 GitHub 이슈(주간 운영 리포트)에 남기고, 이 문서에는 월별 비용 표만 갱신한다.

**매일 (자동)** — 사람은 실패 이슈 알림만 확인
**매주 월요일**
- 운영 리포트 이슈 확인 (비용·성공률·소스 건강도)
- 브리핑 사실 검수 20줄 + 카드 분류 검수 20건 + `summary-error` 신고 처리 (D23·D24)
- `/add-name`으로 미등록 고유명사 반영
**매월 1일**
- 비용 실측을 아래 표에 기록, 예산 대비 점검
- 죽은 소스 정리, 신규 소스 후보 검토(`/add-source`)
- cron-job.org PAT 만료일 확인
**시즌·이벤트**
- 이적 창 개폐 전 `transfer-windows.json` 확인 (2027 여름 창 일정)
- UCL 녹아웃 전환(2월) 대진 표시 확인
- 시즌 전환(2027년 7~8월) `/new-season`

### 16.1 월별 비용 기록
| 월 | LLM (prod) | LLM (dev) | 데이터 API | 합계 | 예산 대비 | 메모 |
|---|---|---|---|---|---|---|
| 2026-10 | | | $0 | | / $3 | |
| 2026-11 | | | $0 | | / $3 | |

---

## 17. P2 백로그 (MVP 이후)

- [ ] 텔레그램 채널 "오늘의 5줄" 자동 발행 (PRD §15 D9 — 공개 후 검토)
- [ ] 주간 다이제스트 / 뉴스레터
- [ ] 빅매치 프리뷰 (오늘 밤 상위 1~2경기, 데이터 기반)
- [ ] 축구 용어 사전 툴팁 (정적 사전)
- [ ] 팀 전술 분석 단락 (빅클럽 우선)
- [ ] "어제 놓친 소식" 배지 (localStorage)
- [ ] UEL·UECL 한국 선수 소속팀 경기 일정

---

## 부록 A. 데이터 스키마 v0.1 (zod 확정안)

> PRD §8.2 초안을 확정한 것이다. 구현은 `src/lib/schema/`, `scripts/`도 같은 스키마를 import한다. **변경 시 사용자 확인 필수**(CLAUDE §8): zod → 마이그레이션 스크립트 → fixtures → 테스트 순으로 함께 바꾼다.

```ts
// 공통
const Iso = z.iso.datetime();                      // UTC ISO 8601 — 끝이 Z, 초 필수, 오프셋(+09:00) 불허
const CompId = z.enum(["EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1", "UCL"]);
const Category = z.enum(["result", "transfer", "injury", "club", "national", "ucl", "other"]);
const TransferStatus = z.enum(["rumor", "negotiating", "agreed", "official", "collapsed"]);
const Tier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const HttpUrl = z.httpUrl();                       // http/https + 도메인 호스트만 — javascript:·mailto:·data:·localhost 거부 (결정 Q3)
const IsoDate = z.iso.date();                      // "2026-10-10" — 시각이 아닌 날짜 라벨에만
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);   // kebab-case, 한 번 정하면 불변 — configs·팀·선수 데이터에만 (결정 Q7)
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Season = z.number().int().min(2000).max(2100);           // 시즌 시작 연도(2026 = 2026-27) = 두 API의 season 파라미터
const CardId = z.string().regex(/^c_[0-9a-f]{10}$/);           // NewsCard.id와 같은 정규식
// configs/*.json의 객체는 모두 z.strictObject — 모르는 키(오타)는 오류. data/는 z.object 유지 (결정 Q5)

// configs/sources.json
const Source = z.strictObject({
  id: Slug, name: z.string(),
  type: z.enum(["rss", "crawl", "search", "journalist", "aggregator", "analysis"]),
  url: HttpUrl, lang: z.string(),                    // "en" | "ko" | "es" …
  enabled: z.boolean(), weight: z.number().min(0).max(3), tier: Tier,
  summarize: z.boolean(),                            // 필수(기본값 없음). false = LLM 미전송, 원제목+링크(ai:false) 카드만 — 피드 제목·URL 무수정 (PRD §15 D22). D23 이후 모든 소스 false
  competitions: z.array(CompId).default([]),
  author: z.string().optional(),                     // 작성자 필터(기자 채널)
  terms_checked: z.boolean(), robots_checked: z.boolean(), // terms_checked = note의 이용 방식(요약/원제목+링크)이 약관상 허용됨, 금지·불명확이면 false
  note: z.string().optional(),                       // 약관 확인 메모·날짜
});

// data/news/YYYY-MM-DD.json  → { date, generatedAt, runId, cards: NewsCard[] }
const NewsCard = z.object({
  id: z.string().regex(/^c_[0-9a-f]{10}$/),         // 대표 URL 결정적 해시 (16진수 10자리)
  t: z.string().max(200),                            // 제목: AI 한국어 제목 ≤80자(아래 refine), 원제목·한국어 원문 카드 ≤200자
  s: z.array(z.string().max(80)).max(3),             // 요약 줄 — 해외 원제목 카드는 [] (D23), 한국어 카드는 RSS 요약 절단(약관 허용 시)
  cat: Category, comp: z.array(CompId),
  teams: z.array(z.string()), players: z.array(z.string()),   // slug
  imp: z.number().int().min(1).max(5),
  kr: z.boolean(), spoiler: z.boolean(),
  transfer: z.object({
    player: z.string(), from: z.string().optional(), to: z.string().optional(),
    status: TransferStatus, tier: Tier,
  }).optional(),
  src: z.array(z.object({ n: z.string(), u: HttpUrl, at: Iso, tier: Tier })).min(1),
  lang: z.string(),
  ai: z.boolean(),                                   // AI 작성 여부 — D23 이후 뉴스 카드는 모두 false (원제목·한국어 원문)
  created: Iso,
}).refine((c) => !c.ai || c.t.length <= 80, { path: ["t"], error: "AI 제목은 80자 이내" });

// data/transfers.json → Transfer[]
const Transfer = z.object({
  id: z.string(), player: z.string(), from: z.string().optional(), to: z.string().optional(),
  status: TransferStatus, bestTier: Tier, updated: Iso, quiet: z.boolean(),
  history: z.array(z.object({ at: Iso, status: TransferStatus, card: z.string() })),
});

// data/competitions/{comp}.json
const StandingRow = z.object({
  pos: z.number(), prevPos: z.number().nullable(), team: z.string(),
  played: z.number(), w: z.number(), d: z.number(), l: z.number(),
  gf: z.number(), ga: z.number(), pts: z.number(),
  form: z.array(z.enum(["W", "D", "L"])).max(5),
  zone: z.enum(["ucl", "uel", "uecl", "knockout", "playoff", "relegation", "none"]), // knockout·playoff = UCL 리그 페이즈 1~8위·9~24위 (결정 Q4)
});
const Match = z.object({
  id: z.string(), comp: CompId, round: z.string(), kickoff: Iso,
  home: z.string(), away: z.string(),
  score: z.object({ h: z.number(), a: z.number() }).nullable(),
  status: z.enum(["scheduled", "finished", "postponed"]),
});

// data/teams/{team}.json
const Team = z.object({
  slug: Slug, nameKo: z.string(), nameEn: z.string(), short: z.string().max(4),
  comp: CompId, alsoIn: z.array(CompId).default([]),          // 예: ["UCL"]
  colors: z.tuple([HexColor, HexColor]),
  formation: z.object({ shape: z.string(), source: z.enum(["api", "manual"]), updated: Iso }).nullable(),
  topPlayers: z.array(z.object({ name: z.string(), goals: z.number(), assists: z.number().nullable() })).max(3),
  profile: z.object({                                          // 주 1회 LLM
    oneLiner: z.string().max(80),
    strengths: z.array(z.string()).length(2), weaknesses: z.array(z.string()).length(2),
    generatedAt: Iso,
  }).nullable(),
  koreanPlayers: z.array(Slug),
  reading: z.array(z.object({ title: z.string(), url: HttpUrl, source: z.string() })),
});

// configs/korean-players.json → KoreanPlayer[]
const KoreanPlayer = z.strictObject({
  slug: Slug, nameKo: z.string(), nameEn: z.string(),
  team: Slug, comp: CompId.or(z.literal("OTHER")),
  position: z.enum(["GK", "DF", "MF", "FW"]), birthYear: z.number(),
  apiFootballId: z.number().nullable(), active: z.boolean(),
});

// data/players/weekly/{yyyy-ww}.json
const WeeklyReport = z.object({
  week: z.string().regex(/^\d{4}-(?:0[1-9]|[1-4]\d|5[0-3])$/), from: Iso, to: Iso,   // ISO 8601 주차 01~53(연도는 ISO week-year, 예: 2026-12-28 → "2026-53")
  rows: z.array(z.object({ player: Slug, apps: z.number(), minutes: z.number(),
                           goals: z.number(), assists: z.number() })),
  mvp: Slug.nullable(),                              // 코드 규칙: 골×3 + 도움×2 + 출전
  summary: z.string(),                               // LLM 총평 3~5문장
  generatedAt: Iso,
});

// data/runs.json(prod) · data/runs-dev.json(dev, 개발자 커밋) → RunLog[] (각 최근 180일, 비용 가드는 합산)
const RunLog = z.object({
  runId: z.string(), env: z.enum(["dev", "prod"]), job: z.enum(["collect", "weekly"]),
  startedAt: Iso, finishedAt: Iso,
  collected: z.number(), clusters: z.number(), summarized: z.number(), downgraded: z.number(), // D24: summarized·downgraded = 브리핑 줄 수(LLM 작성·템플릿 강등)
  tokens: z.object({ in: z.number(), out: z.number(), cacheRead: z.number(), cacheWrite: z.number() }),
  costUsd: z.number(),
  apiCalls: z.object({ footballData: z.number(), apiFootball: z.number() }),
  sources: z.array(z.object({ id: z.string(), ok: z.boolean(), items: z.number() })),
  status: z.enum(["success", "partial", "failed", "skipped"]),
});

// configs/takedowns.json → Takedown[] — 등록만으로 빌드 제외, 다음 수집에서 data/ 원본 삭제
const Takedown = z.strictObject({
  id: CardId,
  requestedAt: Iso,                                  // 요청 접수 시각 = 72시간 기준점
  handledAt: Iso.nullable(),                         // 등록 시 null → 배포 확인 후 기록(커밋 2회), 값이 있으면 ≥ requestedAt (결정 Q1)
  reason: z.string(),                                // 요청 종류 + 이슈 번호만(요청자 개인정보 금지)
});
```

**v0.1 추가 스키마 (2026-10-10 사용자 확인)** — 파일 래퍼·파일 단위 검사 + 부록 A에 없던 configs·data 12종.

```ts
// ── 파일 래퍼·파일 단위 검사 (항목 스키마는 위 그대로) ──
// configs/sources.json → Source[] · configs/korean-players.json → KoreanPlayer[] · configs/takedowns.json → Takedown[]
// data/transfers.json → Transfer[] — 각 파일 안에서 id(slug) 중복 금지
const NewsFile = z.object({                          // data/news/YYYY-MM-DD.json
  date: IsoDate,                                     // KST 발행일 = 파일명 (06:30 KST 실행은 UTC로 전날이므로 KST 날짜)
  generatedAt: Iso,                                  // 마지막으로 쓴 시각 (D23 이후 FR-26 카드 보충 없음)
  runId: z.string().min(1),                          // RunLog.runId
  cards: z.array(NewsCard),                          // 카드 ID 중복 금지 (FR-04)
});
// data/runs.json → RunLog[] (env "prod"만) · data/runs-dev.json → RunLog[] (env "dev"만)

// 1. configs/competitions.json → CompetitionConfig[]  (M2-01, /new-season A) — id·footballDataCode 중복 금지
const ZoneRule = z.strictObject({
  zone: StandingZone.exclude(["none"]),              // StandingRow.zone 값, 규칙 밖 순위는 "none"
  from: z.number().int().min(1), to: z.number().int().min(1),  // 순위 구간(포함), from ≤ to
  label: z.string().min(1),                          // 텍스트 병기 라벨 "챔스"·"16강 직행"·"강등 PO" (FR-42)
});
const CompetitionConfig = z.strictObject({
  id: CompId, nameKo: z.string().min(1), nameEn: z.string().min(1),   // nameEn은 검색 별칭(FR-131)
  shortKo: z.string().min(1).max(6),                 // 탭·칩 "EPL"·"라리가"·"분데스"
  footballDataCode: z.enum(["PL", "PD", "SA", "BL1", "FL1", "CL"]),
  apiFootballLeagueId: z.number().int().positive(),
  season: Season, startDate: IsoDate, endDate: IsoDate,               // 비시즌 빈 상태(DR-07) 판단, startDate ≤ endDate
  teamCount: z.number().int().min(2).max(64),        // 20·18·36 — 구간·순위표 행 수 검사
  zones: z.array(ZoneRule),                          // 구간 겹침 금지, to ≤ teamCount
});

// 2. configs/names.ko.json  (FR-24·FR-131, /add-name·/add-player) — 대상 1개 = 항목 1개
const NameKind = z.enum(["player", "team", "manager", "competition", "venue", "other"]);
const NameText = z.string().regex(/^\S(?:.*\S)?$/);  // 비어 있지 않고 앞뒤 공백 없음
const NameEntry = z.strictObject({
  ko: NameText,                                      // 한글 표기(치환 결과)
  en: z.array(NameText).min(1),                      // LLM·API 영문 표기 + 변형, 첫 값이 대표
  kind: NameKind,
  slug: Slug.optional(),                             // 팀·선수 페이지 연결
  note: z.string().optional(),                       // 표기 근거(확신도 + 출처 URL)
});
const NamesKoFile = z.strictObject({
  entries: z.array(NameEntry),
  ignore: z.array(NameText).default([]),             // 고유명사 아닌 반복 검출어 — unknown-names 적재 제외
});  // 영문 표기는 사전 전체에서 1회(대소문자 무시), ignore와 겹침 금지, (kind, slug) 중복 금지

// 3. configs/national-team.json  (F7 FR-70~73) — A매치 기간 = 경기일 ±3일(FR-71), 주요국은 뉴스 national
const NationalMatch = z.strictObject({
  id: Slug,                                          // "2026-11-14-friendly" — .ics·명단 연결, 중복 금지
  kickoff: Iso, kickoffTbd: z.boolean().default(false),               // 시각 미정이면 true(날짜만 의미)
  opponent: z.string().min(1), home: z.boolean(), venue: z.string().optional(),
  competition: z.string().min(1),                    // "친선경기"·"월드컵 예선"
  status: MatchStatus,                               // Match.status와 같은 값
  result: z.strictObject({ kor: z.number().int().min(0), opp: z.number().int().min(0) }).nullable(), // finished ⇔ 값 있음
  sourceUrl: HttpUrl.optional(),
});
const Squad = z.strictObject({
  id: Slug, announcedAt: Iso,
  matchIds: z.array(Slug).min(1),                    // matches[].id에 있어야 함
  playerSlugs: z.array(Slug),                        // 소집된 등록 한국 선수 slug만 (FR-73)
  sourceUrl: HttpUrl.optional(),
});
const NationalTeamFile = z.strictObject({ matches: z.array(NationalMatch), squads: z.array(Squad).default([]) });

// 4. configs/bigmatch-rules.json  (F8 FR-80~84, LLM 미사용) — 해당 규칙 weight 합 → minScore 이상 상위 maxMatches
const Weight = z.number().min(0).max(10);
const Derby = z.strictObject({ name: z.string().min(1), teams: z.tuple([Slug, Slug]) });   // 두 팀 달라야 함, name은 이유 태그
const BigmatchRulesFile = z.strictObject({
  window: z.strictObject({ fromKst: z.iso.time({ precision: -1 }), toKst: z.iso.time({ precision: -1 }) }), // "18:00"~익일 "07:00"
  maxMatches: z.number().int().min(1).max(10),       // 5
  minScore: z.number().min(0),
  rules: z.strictObject({
    korean: z.strictObject({ weight: Weight }),                                                 // ① 한국 선수 소속팀
    ucl: z.strictObject({ weight: Weight }),                                                    // ② UCL
    topClash: z.strictObject({ weight: Weight, topN: z.number().int().min(2).max(20) }),        // ③ 상위 6위 맞대결
    derby: z.strictObject({ weight: Weight, list: z.array(Derby) }),                            // ④ 지정 더비
    closeRace: z.strictObject({ weight: Weight, maxPointsGap: z.number().int().min(0).max(10) }), // ⑤ 승점 차 3 이내
    bigClub: z.strictObject({ weight: Weight, teams: z.array(Slug) }),                          // 빅클럽(FR-06 키워드와 공유 가능)
  }),
});

// 5. configs/search-queries.json  (FR-02, M1-06·M1-07) — 활성 쿼리 수 ≤ maxEnabled, id 중복 금지
const SearchQuery = z.strictObject({
  id: Slug,
  source: Slug,                                      // sources.json의 type:"search" 소스 id → 그 소스의 enabled·terms_checked를 따름
  q: z.string().min(1), lang: z.string().min(2),     // Google News hl / GDELT sourcelang
  region: z.string().regex(/^[A-Z]{2}$/).optional(), // Google News gl
  purpose: z.enum(["korean", "transfer", "team", "ucl", "national", "general"]),
  player: Slug.optional(), team: Slug.optional(),    // 대상 slug (/add-player가 한/영 1개씩)
  enabled: z.boolean(),
});
const SearchQueriesFile = z.strictObject({ maxEnabled: z.number().int().min(1).max(100), queries: z.array(SearchQuery) }); // 상한 값은 M0-26

// 6. configs/formations.json → Record<팀 slug, ManualFormation>  (FR-55 폴백 → Team.formation, source:"manual")
const FormationShape = z.string().regex(/^[1-9](?:-[1-9]){2,4}$/);  // + 필드 플레이어 합 10
const ManualFormation = z.strictObject({ shape: FormationShape, updated: Iso, sourceUrl: HttpUrl.optional() });
const FormationsFile = z.record(Slug, ManualFormation);

// 7. configs/team-colors.json → Record<팀 slug, TeamColor>  (DR-05, 로고 대체 — M2-05)
const TeamColor = z.strictObject({
  colors: z.tuple([HexColor, HexColor]),             // [주색, 보조색] → Team.colors, 두 색 달라야 함
  short: z.string().regex(/^[A-Z0-9]{2,4}$/),        // → Team.short (LIV)
});
const TeamColorsFile = z.record(Slug, TeamColor);

// 8. configs/transfer-windows.json  (FR-105) — (comp, season, kind) 중복 금지
const TransferWindow = z.strictObject({
  comp: CompId.exclude(["UCL"]), season: Season, kind: z.enum(["summer", "winter"]),
  opensAt: Iso, closesAt: Iso,                       // UTC(공식 현지 시각 변환), opensAt < closesAt
  sourceUrl: HttpUrl.optional(),
});
const TransferWindowsFile = z.strictObject({
  boost: z.number().min(1).max(3),                   // 이적 창 기간 transfer 점수 배수 — 그 밖의 점수화 가중치는 코드 상수
  windows: z.array(TransferWindow),
});

// 9. data/competitions/{comp 소문자}.json  (F4) — 경기 comp = 파일 comp, 순위표 팀·경기 id 중복 금지
const Scorer = z.object({
  player: z.string().min(1), team: z.string().min(1),   // 선수명은 API 원문(names.ko로 치환), 팀은 slug
  goals: z.number().int().min(0),
  assists: z.number().int().min(0).nullable(), penalties: z.number().int().min(0).nullable(),
  played: z.number().int().min(0).nullable(),
});
const CompetitionFile = z.object({
  comp: CompId, season: Season,
  provider: z.enum(["football-data", "api-football"]),  // 출처 표기(FR-45)
  updatedAt: Iso,                                    // 실패 시 전일 데이터 유지 → "업데이트 지연" 판단(M2-02)
  standings: z.array(StandingRow), matches: z.array(Match),
  scorers: z.array(Scorer).default([]),
});

// 10. data/players/korean.json  (F6 FR-61·62·65, M3-03) — 관련 뉴스는 빌드 시 카드 태그로 찾는다
const PlayerComp = CompId.or(z.literal("OTHER"));    // KoreanPlayer.comp와 같은 범위
const Opponent = z.object({ slug: Slug.nullable(), name: z.string().min(1) });   // data/teams 없는 팀은 slug null
const PlayerSeasonStats = z.object({                 // 대회별 1행(리그·UCL 따로)
  comp: PlayerComp, apps: z.number().int().min(0),
  minutes: z.number().int().min(0).nullable(), goals: z.number().int().min(0),
  assists: z.number().int().min(0).nullable(),       // 폴백(FR-65)이면 minutes·assists null
});
const PlayerMatchLog = z.object({
  matchId: z.string().min(1), comp: PlayerComp, kickoff: Iso, opponent: Opponent, home: z.boolean(),
  result: z.object({ for: z.number().int().min(0), against: z.number().int().min(0) }).nullable(),
  started: z.boolean().nullable(), minutes: z.number().int().min(0).nullable(),   // 0 = 미출전, null = 정보 없음
  goals: z.number().int().min(0), assists: z.number().int().min(0).nullable(),
});
const KoreanPlayerRecord = z.object({
  slug: Slug,                                        // korean-players.json slug
  team: Slug,                                        // 기록 시점 소속 — 설정과 다르면 이적 단서(FR-63)
  provider: z.enum(["api-football", "fallback"]),
  season: z.array(PlayerSeasonStats),                // comp 중복 금지
  recent: z.array(PlayerMatchLog).max(5),            // 최신순
  next: z.object({ matchId: z.string().min(1), comp: PlayerComp, kickoff: Iso, opponent: Opponent, home: z.boolean() }).nullable(),
  updatedAt: Iso,                                    // 소속팀 경기 다음 날만 갱신, active:false면 멈춤
});
const KoreanPlayersDataFile = z.object({ season: Season, generatedAt: Iso, players: z.array(KoreanPlayerRecord) }); // slug 중복 금지

// 11. data/cache/seen-urls.json  (FR-04, 90일) — 키 정렬 저장(diff 최소화)
const UrlHash = z.string().regex(/^[0-9a-f]{16}$/); // 정규화 URL 해시 앞 16자(64비트) — 카드 ID와 같은 해시면 카드 ID가 접두사
const SeenUrlsFile = z.object({ updatedAt: Iso, urls: z.record(UrlHash, Iso) });   // 해시 → 처음 본 시각

// 12. data/cache/unknown-names.json  (FR-24) — 키 = LLM 영문 표기 그대로, 사전 등록·ignore 이름은 다음 수집이 제거
const UnknownName = z.object({
  count: z.number().int().min(1),                    // /add-name 빈도순
  firstSeen: Iso, lastSeen: Iso,                     // firstSeen ≤ lastSeen
  kind: NameKind.optional(),                         // teams/players 태그에서 왔으면 추정
  cards: z.array(CardId).max(5),                     // 예시 카드(최근 5개)
});
const UnknownNamesFile = z.object({ updatedAt: Iso, names: z.record(NameText, UnknownName) });
```

**PRD 초안 대비 변경점**: `src[].tier`·`spoiler`·`ai`·`transfer.player/from/to`는 PRD 그대로 확정. 추가된 필드는 `Transfer.quiet`(FR-106), `RunLog.env`·`job`·`downgraded`·`sources`(소스 건강도 FR-11), `Team.alsoIn`(UCL 외부 팀·이중 소속 표현), `KoreanPlayer.active`(FR-64). 바뀐 구조는 `RunLog.tokens.cached` → `cacheRead`·`cacheWrite`(캐시 쓰기 단가가 따로 있음), `RunLog.failedSources` → `sources[]`(실패 소스는 `ok:false`로 도출), 뉴스 파일 최상위를 카드 배열 대신 `{ date, generatedAt, runId, cards }` 객체로. 카드 ID를 16진수 6자리에서 10자리로, 제목 상한을 AI 80자 / 원제목·한국어 원문 200자로 분리(PRD §15 D15).

**v0.1 확정 결정 사항 (2026-10-10 사용자 확인)** — M0-16에서 추천안 일괄 승인
1. takedowns `handledAt`: `Iso.nullable()` — 등록 시 null, 배포 확인 후 기록(커밋 2회). 값이 있으면 ≥ requestedAt. 빌드 제외는 등록만으로 적용
2. names.ko에 선택 필드 `ignore` — 고유명사가 아닌 반복 검출어는 unknown-names에 적재하지 않음
3. 링크 URL은 `z.httpUrl()`(http/https + 도메인 호스트): Source.url · NewsCard.src[].u · Team.reading[].url · configs의 sourceUrl
4. `StandingRow.zone`에 `knockout`(UCL 1~8위)·`playoff`(UCL 9~24위) 추가. 리그 강등 PO는 relegation + label
5. configs/*.json의 객체는 `z.strictObject`(모르는 키 = 오류). data/는 `z.object` 유지
6. names.ko는 대상별 항목 배열 `{ ko, en[], kind, slug?, note? }` — 변형 표기 묶음을 검색 별칭(FR-131)에도 사용
7. Slug·HexColor·CardId·주차(01~53) 형식 검사는 사람이 편집하는 configs와 팀·선수 데이터에만. 뉴스 카드 태그·Transfer.history[].card는 검사하지 않음(발행 차단 방지)
8. search-queries는 `{ maxEnabled, queries[] }` 객체, 각 쿼리는 `source`로 sources.json의 search 소스를 참조(약관 게이트 일원화)
9. 대표팀 소집 명단은 등록된 한국 선수 slug만(`playerSlugs`). 소집 소식 전체는 뉴스로(FR-70)
10. 점수화 가중치는 코드 상수(`scripts/lib/score.ts`), 설정은 이적 창 배수 `boost`만. M1 튜닝이 잦으면 `configs/scoring.json` 신설을 다시 제안

---

## 부록 B. 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-10 | 최초 작성 (v0.1) | basic_plan·PRD·CLAUDE.md 기반 상세 개발계획 |
| 2026-10-10 | 일정은 날짜 없이 순서·기간만, 순차 진행(병행 트랙 없음), `/status` 페이지·Playwright OG 생성 승인 | 사용자 결정 |
| 2026-10-10 | 4문서 정합성 검토 반영: CLAUDE 절 참조 수정, 빌드 후 커밋 순서, 백업 schedule 06:40, D0·D2 게이트 범위 보강, M1-23 재시도 제거, 골든셋 10건 | 문서 간 충돌 해소 |
| 2026-10-10 | takedowns `configs/` 이관, 카드 ID 10자리·제목 상한 분리, 강등분 같은 ID 보충, 요약 출력 항목 추가, `runs-dev.json` 분리, AI 라벨 `ai:true`만, 재사용 `deploy.yml` (PRD §15 D14~D20) | 사용자 결정 |
| 2026-10-10 | 초기 JS 예산 120KB → 160KB(gzip) 상향 (PRD §15 D21) | M0-01 실측: 프레임워크 기본 런타임만 약 138KB |
| 2026-10-10 | 부록 A v0.1 확정: 링크 URL `z.httpUrl`, zone `knockout`·`playoff`, takedowns `handledAt` null 허용, configs strict, 형식 검사 범위, configs·data 12종 추가 (M0-16) | 사용자 결정(추천안 일괄 승인) |
| 2026-10-10 | 해외 뉴스 카드를 원제목+링크·코드 분류로 재정의, LLM 호출 #1을 정형 데이터 기반 한국어 브리핑으로 교체 (PRD §15 D23·D24): M0-28~30·M0-34·M0-36, D0-01·D0-03, M1 재구성(M1-15·M1-17~M1-24 내용 교체, M1-44·M1-45 추가), M2-02·M2-03·M3-03·M4-02·M4-15, §14 B3~B5·B7 추가, 부록 A 주석(스키마 변경 없음) | 사용자 결정 — M0-23·M0-24 누적 해외 26채널 중 약관상 AI 요약 가능 0 |
