# 🗺️ 유로 다이제스트 (Euro Digest) — 상세 개발계획 (plan.md) v0.1

> 매일 아침, 밤사이 유럽 축구를 한눈에.
> 작성일: 2026-10-10 · 버전: v0.1 · 저장 위치: `docs/plan.md`

| 항목 | 내용 |
|---|---|
| 상위 문서 | `docs/basic_plan.md` → `docs/PRD.md` → `CLAUDE.md` → **`docs/plan.md`(이 문서)** — 파생 순서. 충돌 시에는 CLAUDE.md 우선순위 표(PRD > CLAUDE > plan, basic_plan은 참고)를 따른다 |
| 하위 문서 | `DESIGN.md` (D0에서 작성 — v0.1), `docs/design/DECISIONS.md` |
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
| 사전 | 사용자 준비 작업 (§3) | M0 중 | 2026-10-10 | 2026-10-11 | ✅ |
| **M0** | 셋업·검증 | 3~4일 | 2026-10-10 | 2026-10-11 | ✅ |
| **D0** 🎨 | 전체 디자인 콘셉트 | 2~3일 | 2026-10-11 | 2026-10-12 | ✅ |
| **M1** | 뉴스 MVP | 1주 | 2026-10-12 | | 🚧 |
| **D1** 🎨 | 대회·팀 화면 | 1~2일 | | | ⬜ |
| **M2** | 대회·팀 | 1주 | | | ⬜ |
| **D2** 🎨 | 한국 선수·이적·마이 팀 | 1~2일 | | | ⬜ |
| **M3** | 한국 선수·A매치 | 1주 | | | ⬜ |
| **M4** | 부가 기능 | 1.5주 | | | ⬜ |
| **D3** 🎨 | 아이콘·OG·빈 상태 | 1~2일 | | | ⬜ |
| **M5** | 다듬기·정식 공개 | 1주 | | | ⬜ |

상태: ⬜ 대기 · 🚧 진행 중 · ✅ 완료 · ⏸ 보류

**현재 위치**: M1 뉴스 MVP 진행 중 — M1-01 수직 슬라이스(2026-10-12) · **M1-A 수집 완료(2026-10-14)**: M1-02·03·04·06·09·10·11·44·48 완료, M1-05·07·08 보류(D32 — 대상 없음·M1-46 재측정 후). 결정 D32~D56 · **M1-B 완료**(M1-12~18, 2026-10-15~17) · **M1-C 완료**(M1-19~24·45, 2026-10-16~18 — M1-45 첫 실제 게시 10-17 22:00 mode llm) · **M1-D 완료**(M1-25~29·47, 2026-10-15~17 — D48 ④ Actions 첫 확인·M1-28 롤백 리허설 10-17 22:00) · **M1-E 완료(2026-10-18~23)** — M1-30 앱 셸 완료(2026-10-18, 창간일 2026-10-12 확정) · M1-31 뉴스 카드 6변형 완료(2026-10-18 — 머리기사·연결 줄·출처 스택·상대 시간) · M1-36 `/about`·404 완료(2026-10-19) · M1-32 홈 오늘의 5줄 완료(2026-10-19 — AI 줄에만 "AI 작성" 라벨, 템플릿 줄 = 같은 문장 행, S4, 탭 = `comps` D58) · **M1-33 뉴스 필터 완료(2026-10-22 — 목차 2단·칩 줄·대회 색 면·주소 쿼리 동기화, 첫 페인트 전 적용)** · **M1-34 날짜 아카이브 완료(2026-10-23 — 시안 A "스텁 넘김": 티켓 꼬리표 + 월 달력, 이날의 5줄)** · **M1-37 상태 화면 4종 완료(2026-10-23 — 발행 지연 안내 · 5줄 자리 오류 · 비시즌 · 오프라인 띠, 로딩 스켈레톤은 견본 전용)** · **M1-39 시각 검증 완료(2026-10-23) → M1-E 완료** — 화면 사이 어긋남 없음, 짧은 화면 목차·칩 포커스 스크롤 수정, 폰트 preload 0, 모바일 4G LCP 1.40~1.55초 · CLS ≤ 0.01
**다음 작업**: `M1-F` 운영 리허설·관찰 — M1-40 남은 🙋(cron-job.org 본 작업 2개 slot 본문·활성화 + 백업 2개 — 정상화 전까지 발행은 09시대 백업 schedule) → 정상화 뒤 7일 발행 관찰(M1-41 정시 · M1-42 첫 주 비용 · M1-43 첫 주간 품질 검수 · M1-46 GDELT 재측정) · 🙋 M1-39 실기기 폰트 확인(이월 메모 체크리스트)

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
| **2026-10-25 (일)** | 유럽 서머타임 종료 | `time.ts` DST 테스트는 M0에서 끝낸다. 이 날짜 전후에 발행이 돌고 있으면 경기 시각(KST) 표시를 실데이터로 확인. **이날 전환 → 겨울 시각(07:10 수집 → 07:30 발행, D26)** — 전환 순간이 10:00 KST라 10-25 아침 발행은 아직 여름(07:00), 첫 07:30 발행은 **10-26(월)** |
| 11월 중순 | A매치 기간(FIFA 윈도우) | M3 진행 중이라면 A매치 기능을 실데이터로 검증할 기회 |
| **2027-01-01** | 겨울 이적시장 개장 | 이 시점까지 M4에 못 미치면, **이적 트래커(M4-A)만 먼저 당겨서** 개장 전에 붙이는 것을 검토 ❓ |
| 2027-01 말 ~ 02 | UCL 리그 페이즈 종료 → 녹아웃 | FR-43 녹아웃 대진 전환은 구조만 M2에서 만들고, 실데이터 검증은 공개 후 운영 체크리스트로 |
| 2027-03-28 (일) | 유럽 서머타임 시작 | DST 테스트 케이스에 포함. 여름 시각(06:30 수집 → 07:00 발행, D26) 복귀 — 첫 07:00 발행은 **03-29(월)** |

---

## 3. 사전 준비 — 사용자 작업 🙋 (M0 기간 중 완료)

- [X] U-01 GitHub 저장소 `euro-digest` 생성(Public) → Settings › Pages › Source를 **GitHub Actions**로
- [X] U-02 Anthropic API 키 발급 → Actions Secrets `ANTHROPIC_API_KEY`
- [X] U-03 🆕 Anthropic Console에서 **월 지출 한도 설정**(예: $5) — 코드 비용 가드(월 $3)가 고장 나도 막는 2차 안전장치
- [X] U-04 football-data.org 가입 → Secrets `FOOTBALL_DATA_API_KEY`
- [X] U-05 API-Football 가입 — API-SPORTS 사의 **api-football.com**(가입: `https://dashboard.api-football.com/register`)에서 **직접** 가입 → Secrets `API_FOOTBALL_KEY` (호출 주소 `https://v3.football.api-sports.io`, 인증 헤더 `x-apisports-key`). 이름이 비슷한 **apifootball.com**(다른 회사)과 **RapidAPI 경유 가입**(키·호출 주소·헤더가 달라 어댑터와 맞지 않음)은 쓰지 않는다
- [x] U-06 cron-job.org 계정 + fine-grained PAT(대상 저장소 한정, Actions 권한만, **만료일 기록**) — PAT는 저장소에 두지 않음 — 2026-10-11 완료(M0-15 Test run으로 확인). **PAT 만료일: 없음**(2026-10-11 사용자 결정 — 만료일 대신 매월 1일 점검에서 유효 여부 확인, §16)
- [x] U-07 연락용 전용 이메일 개설 → `CONTACT_EMAIL` (User-Agent·삭제 요청용) — 2026-10-10 사용자 결정: 전용 메일 대신 `sguys99@gmail.com` 사용
- [x] U-08 GoatCounter 사이트 생성 (쿠키리스 분석) — 2026-10-11 완료: 계정 `euro-digest` → `https://euro-digest.goatcounter.com`(Site domain `sguys99.github.io`, 기본 설정·스크립트 미삽입 — 연동은 M5-04). 계정명은 비밀값 아님
- [x] U-09 KIPRIS 상표 검색 — '유로 다이제스트' / 'Euro Digest' — 2026-10-11 사용자 확인: 충돌 없음
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
- [x] M0-15 🙋 cron-job.org → `workflow_dispatch` 호출 테스트 — **작업 2개(06:30·07:10 KST, 시간대 Asia/Seoul — D26)를 만들어 둘 다 비활성으로 저장**하고 하나를 수동 실행해 호출만 확인 (정기 실행 활성화는 M1-40 리허설 후) (사용자 설정 대기 — 2026-10-10 설정 안내 전달: fine-grained PAT(Actions R/W, 이 저장소만) + POST `…/actions/workflows/collect.yml/dispatches` body `{"ref":"main"}`. 계절 슬롯 입력이 필요하면 M1-47에서 정하고 M1-40 활성화 때 본문을 갱신) — 2026-10-11 완료: 사용자 Test run → `collect.yml` workflow_dispatch 실행 확인(19:51 KST, run 38133463178, 실행자 sguys99, 12시간 가드·collect job 성공, 변경 없어 배포 skip). 정기 실행 활성화는 M1-40

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
- [x] M0-25 ❓ 국내 매체 RSS(인터풋볼·풋볼리스트·스포탈코리아·베스트일레븐) 제공 여부·이용 조건 → 사용자 확인 후 등록 — 2026-10-10 완료: 8곳 판정 → 인터풋볼·풋볼리스트·베스트일레븐 원제목+링크(섹션+전체기사 피드 5개, 해석 근거), RSS 요약문은 표시·저장 안 함, 스포탈코리아·연합뉴스 기록용 비활성, OSEN·스포티비뉴스·엑스포츠뉴스 제외
- [x] M0-26 Google News RSS: 한/영 쿼리 5종 테스트, 이용 조건, 하루 쿼리 상한 결정 — 2026-10-10 완료: **사용 불가**(robots `Disallow: /`·피드 약관 개인 리더 전용·링크 리다이렉트) → 실측 요청 없이 마감, B2 발동(GDELT + 국내 매체 RSS). 사용자 결정: `google-news-ko/en` 기록용 비활성, 검색 결과는 `configs/publisher-domains.json` 허용 목록(allow 4·feed-only 7·deny 16, 목록 밖 기본 차단)으로 제한 (PRD §15 D25)
- [x] M0-27 GDELT DOC API: 다국어 쿼리 3종 테스트 — 2026-10-10 완료: 약관 허용(인용·링크 표기 조건), 그러나 429 다발(성공 32%)·한국어 커버리지 희박·허용 목록 통과 0건 → `gdelt-doc` 기록용 비활성, `search-queries.json` 생성(`maxEnabled` 10, 쿼리 9개 전부 비활성), M1-46에서 재측정. **현재 한국어 뉴스 = 국내 매체 RSS 5피드**
- [x] M0-28 football-data.org: 6개 대회 2026-27 순위·경기·득점 응답 확인, 분당 10회 지연 설계 + **약관: 응답 데이터의 LLM 입력·재가공(한국어 브리핑) 허용 여부, 무료 티어의 경기 득점자 제공 범위** (§14 B7, PRD §15 D24) — 2026-10-10 완료: 6개 대회 2026-27 순위·경기·득점 순위 무료 제공(30건 모두 200), 경기별 득점자·form·prevPos 없음(코드 계산), UCL 36팀 단일 테이블, 고유 팀 111. 약관 조건부 허용(출처 문구 "Football data provided by the Football-Data.org API" 필수) → **B7 미발동**. 하루 약 18건·약 2.5분. 겨울철 06:30 미종료 경기 문제 → 사용자 결정 D26(겨울 07:30 발행). competitions.json은 M0-29 직후
- [x] M0-29 API-Football: **2026-27 시즌 무료 조회 가능 여부** → 분기 결정 기록 (§14 B1) + 약관: LLM 입력·재가공 허용 여부 (D24) — 2026-10-10 완료: **B1 일부 발동** — 무료 플랜은 시즌 단위(`season=2026`) 조회 불가(2022~2024만), 경기 단위(`date=` 오늘±1일 → `fixtures?id=`)는 2026-27도 가능 → 득점자·도움·포메이션·출전 시간 확보, 시즌 누적·백필 불가. 약관 조건부 허용(재판매 금지). 사용자 결정 D27: 6개 대회 전 경기 조회(하루 최대 약 35건), 경기 기록은 M1부터 누적('집계 시작일 이후' 표시). `configs/competitions.json` 작성(리그 ID·UCL·강등 구간 1차 출처)
- [x] M0-30 💰 Anthropic 실측: **정형 데이터 브리핑 샘플** 소량 배치 1회(M0-35 경기 데이터 입력, 1~3요청, 임시 프롬프트 — M0-28에서 LLM 입력 허용 확인 후) — 실제 단가, 배치 완료 소요 시간, 캐시 최소 프리픽스 충족 여부(`cache_read_input_tokens`), `effort:low`/`thinking:disabled` 출력 토큰 비교 (§14 B3, D24) — 2026-10-11 완료: 브리핑 샘플 17요청 $0.0075(월 예산 0.25%, `data/runs-dev.json`), 단가 M0-21과 일치, 배치 완료 1분50초~6분33초(겨울 실제 여유 4~5분 초과 가능), 캐시 동작 → **B3 미발동**, thinking 기본(적응형·medium)이 사실성 45/45로 최선(끔은 75%). 사용자 결정 D28: 일일 브리핑은 단건 Messages API, 주간 2곳은 배치 유지
- [x] M0-31 🙋 서비스명(KIPRIS)·저장소명 확인 결과 기록 (§14 B6) — 2026-10-11 완료: 예비 조사(웹 29회·도메인·해외 미러 동명 0건, 잠정 충돌 가능성 낮음) + 사용자 KIPRIS 확인 충돌 없음 → **B6 미발동**, 이름·저장소명·basePath 유지
- [x] M0-32 2026-27 시즌 5대 리그 한국 선수 명단 **초안** (출처와 함께 기록, M3에서 확정) — 2026-10-11 완료: 5대 리그 8명(EPL 1·라리가 1·분데스리가 6, 세리에A·리그1 0) + OTHER 1(홍현석 `active:false`), API-Football id 7명 확인(김지수 `null` — 라인업 첫 등장 때 사람이 채움). 사용자 결정: 추천안 일괄 적용 — `configs/korean-players.json`(9명)·`configs/names.ko.json`(선수 9·팀 9, 팀 한글 = KFA 표기) 지금 등록, 포지션 = 소속 리그 공식 표기, `nameEn` 서양식·하이픈, 팀 slug = football-data 팀 이름 kebab(M2-04에서 확정), 비활성 검색 쿼리 3개에 `player` 연결. 출처는 `docs/research/m0-validation.md` M0-32

### M0-E 시안·테스트용 실데이터 fixtures 🆕
> 시안을 가짜 문구로 만들면 실제 헤드라인 길이·브리핑 줄바꿈에서 디자인이 깨진다. 실제 데이터로 시안을 그리기 위해 M0에서 확보한다.
- [x] M0-33 실제 RSS 수집 샘플 50건 → `fixtures/rss/` — 2026-10-11 완료: 수집 대상 14개 피드 1회씩(모두 HTTP 200·RSS 2.0) 494건 → **69건 보존**(en 32·it 4·es 5·ko 28, 고유 링크 56), 본문·요약문·미디어·이미지 제거 + 남긴 요소는 원본 바이트 그대로(CDATA·엔티티·시간대 표기·추적 파라미터). `index.json`에 커버리지 태그(클러스터 12묶음·이적 7·한국 선수 13·경기 결과 23·36시간 초과 13), 가드 테스트 `tests/fixtures-rss.test.ts`(요약문·이미지 혼입 차단). M1 파서 주의점(guid로 중복 판정 불가 · 국내 3사 오프셋 없는 KST 시각 · ESPN `EST` 고정)은 `fixtures/rss/README.md`
- [x] M0-34 💰 D0 시안 입력 (D23·D24): ① **원제목 카드 샘플** 15건 이상(M0-33 실데이터 — 피드 제목·링크 무수정, 영문·이탈리아어·스페인어 포함, 분류 태그는 임시 규칙 초안으로 채움, 국내 카드는 M0-25·M0-26 판정 통과분) → `fixtures/news-sample.json` ② **데이터 브리핑 샘플** 3~5일치(M0-35 입력, 임시 프롬프트 — M0-30 출력 재사용 가능) → `fixtures/brief-sample.json` — 2026-10-11 완료: ① 원제목 카드 **23장**(`NewsFileSchema` 통과, en 10·it 3·es 1·ko 9, 변형 6종 — 기본 8·다출처 8·이적 2·한국 선수 5·결과 10·국내 9, imp 1~5 고르게, 손 수정 4건) + 시안 표시 보조 `fixtures/news-sample.meta.json`(slug → 한글 라벨 — 사전에 없는 것은 `provisional`, 변형 목록, 원천 항목, 손 수정 기록). 카드 ID는 임시 `sha256(링크 원문)`(M1-16 확정 뒤에도 재생성하지 않음 — D0 시안·견본 앵커 기록으로 유지(2026-10-16)), 스페인어 카드 1장은 36시간 창 밖 예외(Relevo 창 안 축구 항목 없음) ② 데이터 브리핑 **6일치**(초안 형식 — M1-19 확정 시 갱신): **2026-10-11 실측 1회**(단건, 입력 6,590·출력 3,231 토큰, $0.002275 — 뉴스 카드와 같은 날, 한국 선수 4줄 사실 일치, 1줄은 코드 검사가 잡은 오류 '2골'(실제 3골)을 템플릿으로 강등 = 실제 강등 사례) + M0-30 4일 + 경기 2개뿐인 날(템플릿 2줄). 가드 테스트 `tests/fixtures-news-sample.test.ts`. dev 누적 $0.009749(월 예산 0.3%)
- [x] M0-35 순위·경기·득점 샘플(5대 리그 + UCL) → `fixtures/football/` — 2026-10-11 완료(새 API 호출 0): M0-28·M0-29·M0-34 원본에서 **39개**(football-data 26: 6개 대회 순위·득점 순위·경기 목록 — 브리핑 샘플 날짜 근거, API-Football 13: 날짜 응답 2(대회 밖 경기 섞음·트리밍)·경기 단건 8·`errors.plan` 오류 응답) + `index.json`(경계 사례 태그 — 한국 선수 선발·교체·벤치·명단 제외, INT·CANCELLED·승부차기·VAR 취소·해트트릭, 두 API 경기·팀 id 쌍과 숫자 id 충돌 6건) + README(어댑터 주의점, "재수집 불가 — 지우지 말 것"). 이미지 URL·odds·요금제 정보 제거, 응답 구조 보존, 약 580KB. 가드 테스트 `tests/fixtures-football.test.ts`. 없는 경계 사례(자책골·AET·POSTPONED 등)는 index `missing` — M1 실데이터로 보강
- [x] M0-36 테스트용 브리핑 LLM mock 응답(정상 · 스키마 위반 · 입력에 없는 숫자 포함 사례) → `fixtures/llm/` (D24) + 🆕 M0-30·M0-34 브리핑 정형 입력(A~F, scratchpad에만 있음 — 그날 순위 등은 재수집 불가)을 `fixtures/llm/`에 보관(M1-24 골든셋 씨앗) — 2026-10-11 완료(LLM 호출 0): 브리핑 mock **31개**(`mock/by-id/brief-*` — 실제 출력 18건: M0-30 17건 전부 + M0-34 1건 / 합성 13건: 스키마 위반 5·스코어 3·근거 id·max_tokens·refusal·errored 2) + 기대 판정 표 `fixtures/llm/brief-cases.json`(FR-29 단계별 기대값, 미정 판정은 note) + 정형 입력 6일치·임시 프롬프트 2종·임시 고유명사 사전(130개, 확정 아님)을 `fixtures/llm/brief-inputs/`에 보관. 가드 테스트 `tests/fixtures-llm-brief.test.ts`(llm.ts `callSingle` mock 통합 포함)

### ✅ M0 완료 기준
- [x] 빈 사이트가 Pages에 배포되고 basePath·404 정상 — 2026-10-11 `npm run verify:deploy` 15개 항목 통과(홈·자산·404 본문 홈 링크·슬래시 301)
- [x] CI green (`check` · `build` · `check:bundle` · `test:e2e`), main push 시 `deploy.yml` 배포 확인 — 2026-10-11 M0-32~36 push 모두 CI 성공·배포
- [x] `sources.json`의 모든 소스에 `terms_checked`·`robots_checked` 값이 채워짐 — 26개 전부(수집 14)
- [x] API-Football 분기(B1)·캐싱 여부(B3)·데이터 API의 LLM 입력 허용 여부(B7, D24) 결정이 기록됨 — B1 일부 발동(D27)·B3 미발동(D28)·B7 미발동(M0-28·M0-29)
- [x] 실측 단가로 PRD §9.3 가정을 확인 (차이가 크면 사용자에게 보고) — M0-21 단가·M0-30 실측·M0-34 실측(바쁜 날 $0.0023)으로 갱신, 월 약 $0.05~0.09(상한 $3의 3% 안팎) — 큰 차이 없음
- [x] §3 사용자 준비 작업 완료 — 2026-10-11: U-01~10 전부 완료(U-06·M0-15 cron-job.org Test run 확인 — workflow_dispatch run 38133463178, 19:51 KST · U-08 GoatCounter `euro-digest` 생성 확인)

---

## 5. D0 🎨 — 전체 디자인 콘셉트 (2~3일)

> **시안 2~3개 → 사용자 선택 → DESIGN.md → 구현.** 이 게이트가 끝나야 M1을 착수한다 (순차 진행, §2.1).

### D0-A 범위 정리
- [x] D0-01 시안 범위 확정 — 2026-10-11 완료: `docs/design/d0/scope.md`(시안 HTML 7개 영역, 5줄 상태 S1~S4 ↔ brief 날짜, 카드 23장 표 + 변형 6종 대표 카드, 놓치기 쉬운 항목 33개 — FR-45 출처 문구·줄 단위 "AI 작성" 라벨·FR-34 공유 앵커·FR-36 오류 신고·D26 발행 시각 등, 컴포넌트·토큰 견본 섹션 의무화). 사용자 확인: 한국 선수 칩·오늘 밤 경기 = 자리만, 내 팀·A매치 생략·이적 핫 리스트·순위 미니 = 자리, 홈 밖 M1 화면은 필터·날짜 표시만, 이적은 실데이터 2장 + 견본 범례. 기준 시각 15:54 KST(fixture 생성 시각). `.claude` design-concepts 커맨드·에이전트의 Google News 표기(M0-26 사용 불가) 정정
  - 화면: **홈**(오늘의 5줄 = 데이터 브리핑 — "AI 작성" 라벨, 템플릿 강등 줄, 줄이 5개보다 적은 날 상태 포함 · 한국 선수 칩 자리 · 오늘 밤 경기 자리 · 주요 뉴스 피드), 헤더·모바일 하단 탭(2~5개 가변 — 미완성 섹션은 숨김)·데스크톱 3단, 테마 토글 (D24)
  - 상태 화면 기본형: 스켈레톤 · 빈 상태 · 오류 · 오프라인 (텍스트·도형 기반, 일러스트는 D3) 🆕
  - 뉴스 카드 변형 6종 (D23): **기본 = 원제목 카드**(영문·이탈리아어·스페인어 원제목 그대로 + 한국어 태그) / 다출처 클러스터(+N곳) / 이적(단계 + Tier 배지) / 한국 선수 관련 / 경기 결과(결과 가리기 켠 상태) / 한국어 보도 카드(국내 매체 RSS 원제목 — M0-25 판정, Google News는 사용 불가 M0-26). 강등 카드는 기본 카드와 같아져 한국어 보도 카드로 대체
  - 브랜드: 워드마크(텍스트 로고), 컬러·타이포 토큰, 대회 컬러 6종 시범 적용
- [x] D0-02 ❓ U-10 응답이 있으면 반영할 키워드 확인 (없으면 생략) — 2026-10-11 완료: `docs/design/d0/directions.md`(방향 후보 5개 A Broadsheet·M Cover·B Floodlight·C Matchsheet·P Programme(새 제안), 10쌍 축 매트릭스, 폰트 서브셋 실측 — SUIT·IBM Plex Sans KR·나눔명조는 악센트 글자 없음, Noto Serif KR 등 tnum 없음 → 제외). 사용자 확정(PRD §15 D29): **A Broadsheet + M Cover + P Programme**, 한글 웹폰트 KS X 1001 단일 서브셋·굵기 ≤ 2, 마스트헤드 날짜 기반 "제 N호"(§14.1), 대회 컬러 강도는 시안 재량(카드 배경 전체 칠하기·약칭 없는 색 표식 금지)

### D0-B 시안 제작 (`/design-concepts d0`, `design-concepts` 에이전트)
- [x] D0-03 시안 2~3개: `docs/design/d0/concept-{a,b,c}.html` — 외부 의존 없는 단일 HTML, `fixtures/news-sample.json`(원제목 카드)·`fixtures/brief-sample.json`(데이터 브리핑) 실데이터 사용 (M0-34) — 2026-10-11 완료: **A Broadsheet**(조간 1면 — 괘선 위계·명조·단 조판, 함렛 400·600 + Newsreader 가변 403KB) · **B Cover**(매거진 커버 — 거대 숫자 "5"·볼트 표지·극굵은 고딕, 원티드 산스 가변 + Archivo 가변 388KB) · **C Programme**(매치데이 프로그램 — 등번호 거터·티켓 스텁·인덱스 탭·2도 인쇄, Pretendard 400·800 + Barlow Condensed 418KB). 3개 모두 scope.md 7개 영역(홈·5줄 상태 S1~S4·카드 변형 6종·상태 4종·내비·컴포넌트/토큰 견본·OG 축소 견본), 원제목 23장 무수정, 외부 참조 0, 375 가로 넘침 0, 대비비 AA 미달 0(라이트·다크), 인라인 JS 7.7~8.3KB. 폰트는 `docs/design/fonts/`(OFL 원문 동봉). D0-11로 넘길 발견: ① 마루부리는 공식 라이선스 원문 미확인 → 함렛(OFL)으로 대체 ② **Pretendard는 OFL 예약 글꼴명(RFN)** — 직접 서브셋은 이름 변경 필요(시안은 "EuroDigest Sans"로 바꿈), 대안은 공식 subset 파일(굵기당 267KB) ③ Barlow Condensed는 힌팅 제거 서브셋에서 자간이 깨짐(힌팅 유지 +9KB/굵기) — 다른 TrueType 라틴 서체도 확인 ④ ⌘·🚨는 모든 서브셋 밖(시스템 폴백), ▲▼는 EuroDigest Sans·함렛에만 있음 → ▲▼는 CSS/SVG로 그림
- [x] D0-04 Playwright 스크린샷: 시안별 375px·1280px × 라이트·다크 (4장씩) — 2026-10-11 완료: 3시안을 같은 조건(DPR 1·colorScheme·reducedMotion·localStorage 비움·웹폰트 2패밀리 로드 확인)으로 다시 캡처 — 전체 페이지 12장 + 첫 화면(fold) 12장 `docs/design/d0/screenshots/concept-{a,b,c}-{375,1280}-{light,dark}[-fold].png`, 합계 9.9MB(전체 페이지는 단색 보존 256색 양자화 — 단색 오차 0, fold는 무손실). 기계 검사 12조합: 가로 넘침 0·콘솔 오류 0·외부 요청 0·폰트 로드 확인. 조건 통일 수정: 375 메타 띠 기본 접힘(B·C), C의 자동화 브라우저 감지 분기 제거, B 하단 탭을 처음부터 고정(캡처용 우회 제거). 버그 수정: C 375 칩 줄 거터 소실(`scroll-padding-inline`), C 5줄 스켈레톤 넘침. 남은 것(구현 단계): 🚨 이모지는 캡처 환경에 이모지 폰트가 없어 빈칸, `text-wrap: pretty` 적용 여부
- [x] D0-05 비교표: 콘셉트명 · 한 줄 설명 · 장점 · 단점 · 구현 난이도 · 번들/폰트 영향 + 추천안(이유) — 2026-10-11 완료: `docs/design/d0/comparison.md`(요약표 · 10개 기준 매트릭스 · 실측 · 대비 · 추천 · D0-06 결정 항목 10개) + 브라우저 비교판 `docs/design/d0/index.html`(fold 스크린샷 나란히, 외부 의존 0, axe 0). 10기준 점수 **C 42 · A 40 · B 35**. 실측: 375 첫 화면에 다 보이는 5줄 A 3 · B 2 · C 4줄, 카드 평균 높이(375/1280) A 207/240 · B 226/234 · C 181/149px. 추천: **C Programme 기반 + A의 1280 지면 위계(머리기사 1장·M1 우측 열 빌 때 중앙 확장) 혼합**. 구현 시 주의: A 오류 견본의 opacity 키커 4.47:1(토큰 색으로), C 중요도 빈 칸 테두리 2.5:1(3:1 이상으로), 세 시안 OG 견본 첫 줄 스코어 = 스포일러
- [x] D0-06 🙋 사용자 선택 또는 혼합 지시 — 2026-10-11 사용자 결정(PRD §15 D30, `comparison.md` §8): **C Programme 기반 + A Broadsheet 1280 지면 위계 혼합** + A 같은 사건 국내·해외 연결 줄 + B 대회 필터 헤더 색 면, 게재 번호 작게·보조색, 브리핑 스코어 주어 팀 득점 먼저, 대회 표기 현행 확정, 경기 없는 날 블록 유지·높이 축소, 태그라인 현행 확정, OG는 워드마크·날짜·호수만
- [x] D0-07 (혼합 지시 시) 혼합안 1회 제작 → 재확인 — 2026-10-12 **사용자 확정**: `docs/design/d0/concept-mix.html` + 스크린샷 8장(`concept-mix-{375,1280}-{light,dark}[-fold].png`), 비교판 `index.html` 맨 위 "선택안(혼합)". C 대비: 1280 머리기사(imp 최고 1장, 가운데 단 전폭), M1 상태(우측 열 빔 → 중앙 확장, 5줄 중앙 최상단 — `?stage=m1` 견본), 같은 사건 연결 줄(게재 번호 교차 참조), 대회 필터 시 피드 머리 색 면, 게재 번호 14/15px 보조색, 크림 채도↓·스팟 레드 `#B32F25`, opacity 글자 0, S4 블록 유지·높이 축소, OG 워드마크·날짜·호수만, 컴포넌트 6종 × 5상태 매트릭스·브레이크포인트 견본. 검사 4조합: 넘침 0·오류 0·외부 요청 0·axe 0·44px 미달 0, 대비 최저 5.32(텍스트)·3.49(비텍스트). 폰트 417.8KB(C와 동일), 인라인 JS gzip 4.0KB. 재확인 결정: 연결 줄 짝은 **빌드 시 엄격 규칙 계산**(같은 팀 2개 또는 같은 선수 + 같은 분류 + 36시간 이내 + 상대 1장 — 스키마 변경 없음, M1-31), 375 대회 필터 진입점 없음(분류 칩만, 대회는 M2 리그 탭), 다크 티켓 벽돌 레드 유지, 필터 결과에는 머리기사 없음(찾기 모드 — 오케스트레이터 결정)

### D0-C 확정·토큰화
- [x] D0-08 `docs/design/DECISIONS.md`에 선택안·이유·혼합 지시 기록 (날짜 포함) — 2026-10-12 완료: D0 절(결정 요약·기준 스크린샷 8장, D0-01~07 타임라인, 선택 이유와 기각 안, 혼합 지시 확정본 — 실제 색 값 변경 포함, 화면·문구 결정 13건, 폰트·라이선스 메모, D0-09~12 구현 메모 10건, 시안 파일 목록), D1~D3 자리. 정리: scope.md 점수화 작업 ID(M1-16 → M1-14), D0-03 ▲▼ 글리프 메모 정정
- [x] D0-09 `DESIGN.md` v0.1 작성: 컬러(중립·액센트·대회 6·상태: 승/무/패·상승/하락·이적 단계·Tier), 타이포 스케일(본문 + 숫자 폰트, tabular nums), 간격·radius·그림자·모션 토큰, 브레이크포인트, 컴포넌트 규칙 (DR-04, DR-12) — 2026-10-12 완료: 저장소 루트 `DESIGN.md`(§0 기계 판독 표 규칙 — `| 토큰 | 라이트 | 다크 | 용도 |`·`| 토큰 | 375 | 1280 | 용도 |`·`| 토큰 | 값 | 용도 |`, §1 원칙, §2 컬러 62(중립·브랜드·shadcn 매핑 18·대회 12·결과·변동·이적·Tier·상태), §3 타이포(EuroDigest Sans·Barlow Condensed, 스케일 16), §4 간격·레이아웃, §5 radius 0·그림자·괘선, §6 모션, §7 브레이크포인트, §8 테마(`ed-theme`·`ed-spoiler`), §9 컴포넌트(기초 6종 5상태 + 도메인 약 30종), §10 접근성, §11 구현 메모). 토큰 값은 `concept-mix.html`에서 스크립트로 추출해 대조(불일치 0). 작성 중 DR-01 차이 발견 → 사용자 결정 D31: 1023 이하 1단·1024~1279 2단·1280 이상 3단, 첫 로드 모션 없음 → 혼합안에 2단 구간 반영(1024 fold 2장 추가, 견본 넘침 수정, 16조합 QA 통과). D0-10 메모: `--text-card` 같은 이름은 `--color-card`와 충돌 → 타입 토큰은 다른 키로, 다크 값은 `[data-theme="dark"]`·`prefers-color-scheme` 두 곳, 컴포넌트는 `dark:` 대신 토큰만
- [x] D0-10 토큰 → `globals.css` CSS 변수 + `@theme`, 다크 모드 + 깜빡임 없는 초기 테마 스크립트 (DR-02) — 2026-10-12 완료: `src/app/globals.css` 자리표시값 제거 → DESIGN.md 토큰 105개(컬러 62·반응형 19·고정 24) — `:root`(라이트·375)·`@media (width >= 64rem)`(lg 1280 열)·`[data-theme="dark"]`·`prefers-color-scheme` 다크(같은 값), 이름이 Tailwind 키와 같은 폰트 3·인쇄 그림자 2는 `@theme static`, 유틸리티 연결은 `@theme inline`(컬러 `--color-<토큰>`, 타입 `--text-X`→`text-type-X`·`--num-X`→`text-num-X` — `--color-card` 충돌 회피), Tailwind 기본 팔레트·radius·블러 그림자·곡선·애니메이션 제거, `dark:` 변형은 사용자·시스템 다크 둘 다, base(body·keep-all·포커스 링·모션 줄이기). 초기 스크립트 `src/lib/theme.ts`(DESIGN §8 원문 + 같은 로직 순수 함수·토글 함수) → `layout.tsx` `<head>` 인라인, `suppressHydrationWarning`, viewport `color-scheme`·`theme-color`(--paper). 테스트: `tests/design-tokens.test.ts`(표 대조·대비 하한·하드코딩 색·Tailwind 컴파일 결과) · `tests/theme.test.ts`(스크립트 vm 실행 × 저장값·시스템 다크) · `tests/e2e/theme.spec.ts`(속성이 `<body>` 전에 달림·계산 색·반응형 토큰). 초기 JS 135.7KB 변화 없음. 커밋 전 리뷰 반영: cn 병합 설정(extendTailwindMerge), 블러 그림자 기본값 제거, 테스트 보강
- [x] D0-11 웹폰트 2종 서브셋·self-host, `font-display: swap` (DR-03) — 2026-10-12 완료: 방식은 손으로 쓴 `@font-face`(`next/font/local` 기각 — 해시 패밀리 이름, 패밀리 단위 preload라 굵기 하나만 preload 불가, 폴백 메트릭이 Arial 기준이라 한글 폭을 못 맞춤). 단일 출처 `src/lib/fonts.ts` → `layout.tsx` `<head>` 인라인 `<style>`(globals.css `url()`에는 basePath가 안 붙음) + React `preload()`, 경로는 모두 `withBasePath`. 파일은 `public/fonts/eurodigest-sans/`(400·800 + LICENSE·FONTLOG)·`public/fonts/barlow-condensed/`(600·800 + OFL), 시안 파일과 같은 바이트 417.9KB, preload 한글 400 + Barlow 800 204.5KB, 4면 모두 `font-display: swap`. CLS 대책으로 메트릭 폴백 3패밀리 14면(맑은 고딕·Noto CJK KR — 한글 음절·공백 면, Arial Bold 계열 — 문자·표 숫자·하이픈 면, `size-adjust`·세로 override) → DESIGN §3.1 스택에 추가. 지연 CLS 실측(스크래치, fixtures 5줄 6일치 × 카드 12장, 360~414px, 폰트 1.2~1.5초 지연): Noto 환경 평균 0.102 → 0.0001(24/24 ≤ 0.05), 맑은 고딕 환경 0.168 → 0.0085(23/24), 실제 자리표시 홈 0. 테스트: `tests/fonts.test.ts`(woff2 직접 읽기 — 패밀리·굵기·OFL 예약 글꼴명·라이선스·메트릭·폴백 계산·CSS·preload·스택 정합), `tests/fonts-coverage.test.ts`(KS X 1001 2,350자·fixtures·configs·src 문구 → 서브셋 밖은 이모지·⌘만, 지금은 🚨 하나), `tests/e2e/fonts.spec.ts`(basePath 아래 200·한 번씩·외부 0, swap·`document.fonts.check`, preload 2, 지연 시 FCP < 폰트·CLS ≤ 0.05). 초기 JS 135.7KB 변화 없음. 남은 일(DESIGN §11.3): Apple SD Gothic Neo·Android 실기기 메트릭, M1 실제 홈에서 지연 CLS 재측정(M1-39)
- [x] D0-12 기초 컴포넌트 토큰 적용: Chip · Card · Button · Tabs · Skeleton · Toast — shadcn 기본 모양 탈피 — 2026-10-12 완료: 의존성 추가 없이(사용자 결정) cva + 클래스 합치기 패턴으로 `src/components/ui/` 직접 구현 — Button·Switch(`button.tsx`·`button-classes.ts`), Chip 계열(FilterChip·ContentsRow·StampChip·FlatTab·IndexTab, `chip.tsx`·`competition.ts`), Card 껍데기(격자·게재 번호·제목 링크·:target, 내용은 슬롯 — `card.tsx`), Skeleton(움직이지 않음, `skeleton.tsx`), 링크 탭(하단 탭·상단 내비, `nav-tabs.tsx`), 섹션 머리·필터 색 면(`section-head.tsx`), 인라인 SVG 아이콘(`icons.tsx`, 라이브러리 없음 — components.json `iconLibrary: "none"`)은 서버 컴포넌트(JS 0), Tabs(WAI-ARIA, roving tabindex·←/→/Home/End·자동 활성화)·Toast(`toast()` 이벤트 + aria-live 영역 하나, 배출 모션·2.4초·포인터/포커스 시 멈춤·선택 닫기 버튼 44px)·테마 토글(`src/components/theme-toggle.tsx`, 3상태·저장 실패 허용·토스트)은 클라이언트 섬 — gzip 1.6 · 1.7 · 1.8KB(esbuild 실측). 섬 번들에 tailwind-merge(약 9KB)가 들어가지 않게 섬 쪽은 병합 없는 `cx`(`src/lib/cx.ts`), `cn`은 서버 전용(import 그래프 테스트). theme-color 재방문 어긋남은 초기 스크립트에서 보정(저장 테마 메타 `media="all"`·다른 쪽 `not all`, 토글도 같은 규칙 — DESIGN §8·`theme.ts`·테스트 함께, 스크립트 243→414자, HTML 페이지당 gzip +127B). 인쇄형 모션 `--animate-stamp·tear·eject·arrive`를 DESIGN §6.1 → globals.css `@theme static`. 견본 라우트 `src/app/specimen/page.specimen.tsx`는 `SPECIMEN=1` 빌드에서만(`pageExtensions` + `distDir: out-specimen`) — 일반 out/에 없음을 단위·e2e로 고정. 테스트: 단위 6파일(컴포넌트 변형·ARIA, Tabs 키보드, Toast 가짜 타이머, 테마 토글, 소스 규칙 — shadcn 기본 모양·`dark:`·lg/xl 밖 브레이크포인트·아이콘 라이브러리 금지, next.config 플래그) + `theme.test.ts` 보강, `npm run test:specimen`(axe 0 375/1280×라이트/다크 · 44px · 키보드 포커스 링 = `--ring`·둘레 3:1 · 모션 줄이기 0 · 토스트·탭·테마 토글 동작 · 스크린샷 4장 — hover/focus/:target은 CDP 강제 의사 클래스) 24개, `tests/e2e/theme.spec.ts` theme-color 검사. 시각 비교: `docs/design/d0/screenshots/impl-components-{375,1280}-{light,dark}.png` ↔ 시안 매트릭스 행별 — 같은 크기 행의 평균 픽셀 차이 칩 0.2~0.9·대회 탭 1.5·필터 머리 1.2(1280), 남은 차이는 견본 축소 대신 실제 값을 쓴 것(카드 실제 거터·제목 크기, 하단 탭 58px, 상단 내비 48px·간격 28px, 스위치 70px, 글자로 끝나는 토스트 오른쪽 16px, 스켈레톤 ≥1024 여백, 목차 선택 ✓ — DESIGN §11.4). 홈 초기 JS 135.7KB 변화 없음. 커밋 전 리뷰 반영: theme-color가 `next/link` 클라이언트 이동마다 풀리던 문제(Next viewport 메타 교체)를 메타를 루트 레이아웃 `<head>`에서 직접 렌더해 해결(`THEME_COLOR_METAS`, 추가 JS 0 — 하이드레이션 뒤·이동 뒤·뒤로 가기 뒤 e2e, 수정 전 빌드에서 실패 확인), cx 겹침 검사를 모든 cx 컴포넌트 변형으로 확대(`tests/ui-class-conflicts.test.tsx` — 버튼 공통 `no-underline`↔링크 `underline` 겹침 발견·변형으로 이동), `FilterClearButton`을 `filter-clear-button.tsx`(cx)로 분리 + 섬용 서버 컴포넌트 import 그래프 검사, Tabs 선택 탭 없음·비활성 시 활성인 첫 탭을 Tab 순서에(APG), Toast 키보드로 닫으면 이전 포커스(없으면 `#main`)로 복귀, theme-color e2e를 하이드레이션 뒤에도 검사, 견본 e2e 1024 폭 추가(스크린샷은 375·1280 4장 유지), 견본 configs·fixtures zod 파싱, DESIGN §8·§9.4·§11.4·DECISIONS §5 #18~20 — 단위 2,054 · 견본 e2e 32 · e2e 76 통과, 섬 gzip Tabs 1.9 · Toast 1.9 · 토글 1.9KB, 홈 초기 JS 135.7KB 그대로

### 참고: 시안 방향 후보 (초안) 🆕
D0에서 실제로 비교할 방향의 출발점이다. 최소 두 축(레이아웃·타이포·색 전략·밀도·모션)이 서로 다르게 잡았다. 최종 시안은 fixtures를 넣어 보며 조정한다.

| 후보 | 콘셉트 | 레이아웃 | 타이포 | 색 전략 | 밀도·모션 |
|---|---|---|---|---|---|
| **A. Broadsheet** | 조간신문 같은 에디토리얼 | 컬럼 그리드, 큰 1면 헤드라인 | 굵은 명조/세리프 헤드라인 + 산세리프 본문 (숫자는 둘 중 하나의 tabular 숫자 — 웹폰트 2종 이내, DR-11) | 모노톤 + 액센트 1색 | 낮은 밀도, 정적 |
| **B. Floodlight** | 야간 경기장 조명 | 카드 스택, 대담한 섹션 전환 | 굵은 그로테스크, 큰 숫자 | 다크 퍼스트, 대회 컬러를 빛처럼 | 중간 밀도, 모션 강조 |
| **C. Matchsheet** | 스위스 스타일 데이터 시트 | 정밀 그리드, 표·리스트 중심 | 그로테스크 + 모노 숫자 | 중립 + 대회 컬러 코딩 바 | 높은 밀도, 미세 모션 |

### ✅ D0 완료 기준
- [x] 사용자 선택이 DECISIONS.md에 기록됨 — `docs/design/DECISIONS.md` D0 절(2026-10-12): 선택안·이유·혼합 지시·화면 문구 결정 20건(사용자 결정 PRD §15 D29·D30·D31 + 오케스트레이터 결정 표기)
- [x] DESIGN.md v0.1 + 토큰이 `globals.css`로 생성됨 — DESIGN.md 토큰 105개 → `src/app/globals.css`(라이트·다크·시스템 다크·lg), `tests/design-tokens.test.ts`가 값·대비·하드코딩을 대조(D0-10)
- [x] 기초 컴포넌트 스크린샷(375/1280 × 라이트/다크)이 선택 시안과 일치 — `docs/design/d0/screenshots/impl-components-{375,1280}-{light,dark}.png` ↔ `concept-mix.html` 견본 매트릭스, 행별 평균 픽셀 차 0.1~2.2(0~255), 의도적 차이(시안 견본의 축소값 대신 실제 컴포넌트 값)는 D0-12 항목에 기록. 견본 e2e는 CI `specimen` job(배포 조건 아님 — M1-30에서 승격 → 2026-10-18 M1-30에서 배포 조건으로 승격)

---

## 6. M1 — 뉴스 MVP (1주)

**목표**: 매일 아침 계절별 발행 시각(유럽 서머타임 07:00 · 표준시 07:30 KST — D26)에 뉴스 카드 30~50건(해외 원제목 + 한국어 태그, 국내 한국어 카드)과 데이터 브리핑 "오늘의 5줄"이 자동 발행되는 공개 사이트 (D23·D24).
**관련 요구사항**: FR-01~09, FR-11~36 (FR-10은 M3-08, FR-37은 M4-15), FR-140, FR-150~154, NFR-04~06, 브리핑 입력 데이터(M2-02 어댑터의 일부를 M1-44로 당김), API-Football 경기 단건 어댑터·경기 기록 누적(M3-02 경로를 M1-48로 당김 — FR-55·FR-61·FR-65·FR-91 입력, D27)

> **D23·D24 반영 (2026-10-10)** — 뉴스 카드는 LLM 없이 원제목+링크와 코드 규칙 분류로 만들고(M1-B), LLM은 정형 데이터 기반 일일 브리핑에만 쓴다(M1-C). 작업 ID는 유지하고 M1-15·M1-17~M1-24의 내용을 바꿨으며 M1-44·M1-45를 추가했다.
> **D27 반영 (2026-10-10)** — 경기별 득점자·라인업·한국 선수 경기 기록은 API-Football 경기 단건 조회로 받고(M1-48), 시즌 누적은 M1부터 쌓은 경기 기록으로 직접 집계한다(백필 불가 — "집계 시작일 이후" 표시).
> **D28 반영 (2026-10-11)** — 일일 브리핑은 일반 Messages API 단건으로 보낸다(배치 아님 — M0-30 배치 완료 최대 6분 33초가 겨울 마감 여유 4~5분을 넘음). 주간 2곳(M3-07·M4-06)은 배치 유지. 출력 검증은 zod → 코드 검증(M1-23) → 1회 재시도 → 템플릿.

### M1-0 얇은 수직 슬라이스 🆕 (첫날)
> 각 단계를 완벽히 만들기 전에, 전 구간이 한 번 끝까지 도는지부터 확인해 통합 위험을 먼저 없앤다.
- [x] M1-01 💰 BBC RSS 1개 → 상위 5건 원제목 카드(분류 최소 규칙) → `data/news/YYYY-MM-DD.json` + 전날 경기 결과로 브리핑 1요청(저장은 M1-19 스키마 확정 전이라 로그 출력만) → 무스타일 목록 페이지 → Actions에서 커밋·빌드·Pages 배포까지 한 번에 성공 (D23·D24) — 2026-10-12 완료: Actions run 38242745914(workflow_dispatch) 가드·수집·검증·빌드·커밋(`16f0291 chore(data): 2026-10-12 발행`, 카드 5장)·Pages 배포 전부 성공, 공개 사이트에 카드 5장 확인. 브리핑 1요청(17경기 → 5줄, 입력과 대조해 사실 일치) prod $0.000967 → `runs.json`, dev 실호출 1회 $0.001239 → `runs-dev.json`. 화면은 "무스타일" 대신 D0 토큰·기초 컴포넌트만 쓴 단정한 목록(새 디자인 결정 없음 — 정식은 M1-30~32). 리뷰(code-reviewer) 차단 0 — 중요 1(뉴스 실패 시 브리핑 생략)은 반영
  - 🆕 M1-01 이월 메모: **M1-03** `rss.ts` 리다이렉트 `manual`·크기 상한 스트리밍 검사 · **M1-09** 국내 피드는 시간대 없는 날짜(KST)라 지금 전부 `no-date`로 건너뜀 → 소스별 기본 시간대 필요 · **M1-14** 슬라이스 기본 5건(`SLICE_DEFAULT_LIMIT`)을 `MAX_ITEMS_PER_RUN`으로 되돌리고 사용법·dispatch 설명 갱신, 카드는 화면 표시 순서로 쓴다(화면은 파일 순서 그대로), 최신순만으로 뽑은 첫 발행 5건이 하부 리그·사건 기사였음 → 범위 밖 기사 감점·제외 규칙(M1-17과 함께) · **M1-16** 지금 카드 ID = 피드 원문 링크 해시 — 정규화 URL로 바꾸면 이미 나간 앵커가 바뀜(공개 전이라 피해 적음, 착수 때 결정) · **M1-20** 프롬프트를 `fixtures/llm/brief-inputs/prompt-m0-30-long.md`에서 읽음 → `configs/prompts/summarize.md`로 교체 · **M1-25** 스키마가 허용하는 뉴스 카드 `ai:true`를 게이트에서 거부(D23 — 라벨 없이 AI 제목이 나가지 않게) · **M1-27** 실패 실행(exit 1)은 커밋되지 않아 그 실행의 runs 기록이 사라짐, 브리핑 실패는 `partial`·exit 0이라 이슈가 안 생김 · **M1-31** D0-12 `CardTitle` 한글 제목 링크 높이 40~41px(44px 미달)·원제목 짧은 하이픈 단어 붙이기 미구현 · **M1-37** 홈은 빈 상태만 있음(오류 = 빌드 실패로 전날 사이트 유지, 오프라인 없음) · **M1-39** CI e2e가 빈 홈만 검사 → fixture 데이터 디렉터리로 빌드하는 옵션

### M1-A 수집 (FR-01~11)
- [x] M1-02 `configs/sources.json` 초기 등록(M0 검증 통과분만) + 로더(`enabled && terms_checked`만) — `summarize` 값과 무관하게 LLM 미전송 (D23). ~~❓ The Athletic ToS 4.1(5) 캐시·보관 금지와 우리 보관 정책의 관계~~ → 2026-10-12 사용자 결정(PRD §15 D32): **Athletic 카드는 7일만 보관** — `Source`에 선택 필드 `retentionDays`(부록 A) 추가, `the-athletic-football`에 7. 기간이 지난 출처의 삭제는 M1-25가 takedown 원본 삭제 경로로 처리(`fixtures/rss/` 5건은 테스트 입력이라 그대로) — 2026-10-12 완료: 수집 대상 = `enabled && terms_checked`(crawl은 `robots_checked` + 크롤러 모듈) 중 rss·journalist·aggregator **14개 피드**(BBC 4·The Athletic·ESPN·the Daily Briefing·Di Marzio·Relevo·국내 5), search·analysis·disabled 12개 제외(사유 로그). 소스별 실패 격리(일부 실패 = `partial`·exit 0, 전부 실패 = exit 1). `Source.retentionDays` 추가 + Athletic 7, 조회 함수 `retentionBySource`. validate에 설정 모순 경고 3종. dry 실행: 491건 수신 → 쓸 수 있는 331(국내 160건 `no-date`) → 같은 링크 32 제거
  - 🆕 M1-02 이월 메모: **M1-03** 순차 14개 × 타임아웃 15초 = 최악 210초 → 전체 시간 상한·호스트별 병렬 결정, 소스 실패 종류는 runs.json에 남지 않음(`{id, ok, items}`) · **M1-12** 같은 링크를 합칠 때 소스 메타(대회 태그)도 합칠 것(지금은 설정 순서상 먼저 나온 소스가 가져 BBC Football이 PL 피드의 EPL 태그를 잃음) · **M1-14** ESPN 일괄 갱신 시각('EST' 고정)이 최신순 상위를 차지(dry 선별 5건 중 3건) · **M1-25** 카드 `src[]`에 소스 id가 없어 보존 기간 역참조 필요 — 추천: 매체명(`publisherNameOf`)으로 찾고 같은 매체명끼리 보존 기간이 같아야 한다는 validate 규칙(스키마 변경 없음), 기간 기준(`src.at` vs `created`) 결정
- [x] M1-03 RSS 어댑터 (타임아웃·재시도, 소스별 실패 격리) — 2026-10-12 완료: 재시도 1회(5xx·429·네트워크·타임아웃, 대기 2초, `Retry-After` ≤10초만 존중), 소스별 30초·단계 예산 90초(초과 = `budget`), 동시 호스트 4·같은 호스트 순차 1초 간격, 결과는 설정 순서(결정적), 리다이렉트는 같은 호스트·http→https 승격만 최대 3회(다른 호스트는 요청 없이 거부), 크기 상한 5MiB(Content-Length + 스트리밍). dry 실행 14개 피드 5.1초
  - 🆕 M1-03 이월 메모: **M1-11** PRD §10 "수집 일부 실패 → 해당 소스 건너뜀, 이슈 생성"·FR-152(같은 원인은 댓글)에 따라 **소스 실패 이슈를 건강도 이슈와 함께 M1-11에서 구현**(fingerprint `source:<id>`, `source-broken`) · runs.json `sources[]`가 `{id, ok, items}`뿐이라 예산 초과(`budget`)와 실제 장애가 구별되지 않고 `items`는 피드 원문 항목 수(쓸 수 있는 건수 아님) → M1-11 착수 때 ❓ `sources[]` 선택 필드(오류 종류·쓸 수 있는 건수) 추가 여부 사용자 확인 · **M1-44** football-data 단건 응답 약 12초(타임아웃 15초에 근접) → 타임아웃 여유 재검토
  - 🆕 2026-10-14 보강: 피드 파싱 실패 진단(본문 없이 HTTP 상태·미디어 타입·크기·본문 형태·파서 위치 — 로그·`source-broken` 이슈 표). Actions 실측으로 **ESPN 피드가 러너에만 HTTP 202·`text/html`·0바이트**(클라우드 IP 봇 차단 추정, 로컬은 200 정상 RSS)임을 확인 → 사용자 결정으로 `espn-soccer` **비활성**(차단 회피 안 함), 수집 대상 13개 피드, 이슈 #3 원인 기록 후 닫음
- [x] M1-04 기자 채널 RSS: the Daily Briefing(Substack)·Di Marzio — 작성자 필터는 현재 대상 없음(M0-23·M0-24: Guardian 제외, The Athletic은 축구 피드 전체를 원제목으로 수집), `author` 필드 지원만 — 2026-10-12 완료: 작성자 목록 파싱(RSS `author`·여러 `dc:creator`·Atom `author/name`, email 버림), `Source.author` 필터(대소문자·공백·NFC 무시, 공동 기명 조각 비교, 작성자 없는 항목 제외, `skipped.author`), 빈 `author` validate 경고. 실측: Daily Briefing `dc:creator` 1개('the Daily Briefing'·'Mark Brus'), Di Marzio·BBC·Athletic 작성자 없음, 국내는 '○○○ 기자' 형식(국내 기자 필터를 쓰게 되면 접미사 규칙 필요)
- [ ] ⏸ M1-05 목록 크롤러 `scripts/crawlers/<site>.ts` — M0에서 허용 확인된 사이트만 (robots.txt, User-Agent, 2~3초 지연, 하루 1회) (보류 — 2026-10-12 사용자 결정, PRD §15 D32: M0-23~25 판정에서 크롤링을 허용한 사이트가 0곳(후보 Sky Sport DE·Bundesliga.com·TEAMtalk·Football365 모두 약관상 봇 접근 금지)이라 만들 대상이 없다. `/add-source`로 `type: crawl` + `robots_checked` 소스가 승인되면 그때 착수)
- [x] M1-06 검색형 소스 공통: `configs/search-queries.json` 로더 + 매체 도메인 허용 목록 필터(`configs/publisher-domains.json`, `allow`만 게시, `isSearchResultAllowed`) — Google News RSS는 사용 불가(M0-26, PRD §15 D25) — 2026-10-12 완료(D32 범위 — 로더·필터만, 검색 요청 코드 없음): 활성 쿼리 = `enabled` + 수집 가능한 검색형 소스(현재 0개 → `collect.search.skip`), 허용 목록 필터는 `allow`만 통과(`feed-only`·`deny`·`not-listed`·`invalid-url` 집계, 위장 호스트 차단), 검색 제목·시각은 `titleFromSearch`·`timeFromSearch` 타입으로만 받아 카드에 바로 쓸 수 없게 막음(M0-27). `SearchAdapter`는 인터페이스만
  - 🆕 M1-06 이월 메모(M1-07·M1-08 보류 해제 시): 어댑터를 `runSearchStage`의 `no-adapter` 자리에 등록, 허용 판정은 수집 단계가 결과 전체에 적용, 제목·시각을 RSS 제목·og:title·`article:published_time`으로 바꾸지 못한 항목은 게시 안 함 · 지금 `allow` 4도메인은 모두 RSS로 받는 국내 매체라 검색 실익이 작음(M1-12 중복 제거에서 RSS 쪽이 남음) · 쿼리별 결과를 runs에 남기려면 스키마 확인 필요, 검색 실패를 `partial`로 볼지 결정 · validate 경고 후보: 켠 쿼리의 소스가 비활성이라 조용히 실행되지 않는 경우
- [ ] ⏸ M1-07 GDELT 어댑터 — ⏸ M0-27 판정: 약관 허용·**현재 비활성**(429 다발·허용 목록 통과 0건). M1-46 재측정 결과로 착수 여부 결정 ❓. 제목은 GDELT가 손본 흔적이 있어 RSS 제목·og:title로 교체 필요 (보류 유지 — 2026-10-12 사용자 결정 D32: M1-46 재측정을 통과하면 M1-08과 함께 착수)
- [ ] ⏸ M1-08 OG 메타 경량 수집기 — 요약 없는 항목만, `<head>`만 파싱, 최대 500자. 해외 원제목 소스는 OG 보충 안 함(M0-23·D23), 국내 소스는 M0-25 판정에 따름 (보류 — 2026-10-12 사용자 결정 D32: RSS 요약문·OG 설명을 표시·저장하지 않으므로(M0-25) 지금 소비처가 없고, 유일한 소비처는 GDELT 결과의 og:title·`article:published_time` 교체(M0-27)다 → M1-07과 함께 착수. 그때 CLAUDE §3의 "경량 HTML 파서" 패키지를 후보·크기와 함께 사용자 승인)
- [x] M1-09 공통 형식 정규화 + zod 검증 (FR-03), "본문 필드 없음" 테스트 (FR-02) · 🆕 2026-10-12 사용자 결정(PRD §15 D34): `Source`에 선택 필드 `tz`(IANA, 예: `Asia/Seoul`) 추가 — 피드 날짜에 시간대가 없을 때만 이 값으로 해석(시간대가 있으면 그대로), 국내 5피드에 `Asia/Seoul`. 지금은 국내 5피드 약 160건/일이 `no-date`로 버려짐(M1-01·M1-02 실측) — 2026-10-12 완료: `FeedItemSchema`(`src/lib/schema/feed-item.ts`, strictObject — 본문·요약·이미지 키 거부, 부록 A) 항목별 검증, 실패 항목만 `schema`로 건너뜀. `Source.tz` + 국내 5피드 `Asia/Seoul` → dry 실행에서 국내 160건 전부 수집(no-date 0, KST→UTC 손계산 대조). `parseFeedDate(raw, fallbackTz)` — DST 겹침 = 먼저 오는 순간, 간격 = 전환 전 오프셋으로 앞으로 밂. **`summary`는 모든 소스에서 null**(오케스트레이터 결정 — the Daily Briefing note '읽지 않음'·국내 '미표시·미저장', 유일한 소비처는 M1-17)
  - 🆕 M1-09 이월 메모: **M1-10** ESPN 'EST' 고정 표기(서머타임 기간에도)로 발행 시각이 최대 1시간 미래로 찍힘(dry 실측 +35분) → 미래 시각 가드(스키마 변경 없음 — 오케스트레이터 결정, 잘못된 tz 설정의 9시간 미래도 같은 가드가 막음) · **M1-12** `url`은 피드 원문 그대로(국내 `idxno` 보존·풋볼리스트 `http://`), 국내 섹션 피드 ⊂ 전체기사 피드라 같은 링크가 대량(dry 71건) — 합칠 때 소스 메타도 합칠 것 · **M1-17** ❓ 분류에 RSS 요약문을 쓸 소스를 사용자 확인(쓰더라도 카드·data 저장 금지), 국내 피드가 들어오며 UFC 등 축구 외 기사가 최신순 상위에 섞임(dry 실측) → 축구 외·K리그 필터
- [x] M1-10 수집 시간 창: 직전 성공 실행 ~ 현재, 최대 ~~36시간~~ **51시간**(48시간 + 겹침 3시간 — 2026-10-12 사용자 결정 PRD §15 D36: 하루 전체 실패 다음 날에도 누락 없음) (FR-07) — 2026-10-12 완료: 창 시작 = max(현재 − 51시간, 직전 성공 실행 시작 − 겹침 3시간)(prod `runs.json`, 깨진 기록·첫 실행은 51시간), **소스별 창**(직전 실행에서 실패한 소스·새 소스는 그 소스의 마지막 성공부터 — dry에서 M1-01 실행에 없던 13개 소스의 누락 방지), 미래 시각 가드(+5분 그대로·+3시간까지 수집 시각으로 낮춤·초과 제외). dry: 피드 492 → 창 안 243·창 밖 249·낮춤 11(전부 ESPN, 최대 +43분)
  - 🆕 M1-10 이월 메모: **M1-12** 겹침 3시간·실패 소스 넓은 창 때문에 날짜 간 중복이 지금은 막히지 않음(`tests/collect-window.test.ts` 겹침 테스트 단언을 0으로 뒤집을 것), 낮춘 기사는 다음 날 원래 시각으로 다시 나오므로 중복 키는 정규화 URL만 · **M1-14** 수집 시각으로 낮춘 ESPN 항목이 최신순 맨 위를 차지(dry 선별 5건 전부) → 낮춘 항목 최신성 감점, 근본 해결은 ESPN 'EST'를 `America/New_York` 현지 시각으로 읽는 소스 설정(Source 스키마 변경 ❓) · **M1-27** prod dry 실행이 LLM을 부르면 runs.json 기록이 발행 기록으로 판정될 수 있음(지금 워크플로에 dry 경로 없음)
- [x] M1-11 소스 건강도 기록 + ~~3일 연속 0건~~ 실패·빈 피드 3회·새 기사 없음 7회 연속 이슈 (FR-11, D35) · 🆕 2026-10-12 사용자 결정(PRD §15 D35): ① `RunLog.sources[]`에 선택 필드 `usable`(창 안 새 항목 수)·`error`(실패 종류) 추가(부록 A) — 7일 성공률·수집 건수는 이 기록에서 계산(요약 필드 따로 저장 안 함) ② 건강도 이슈 = **요청 실패·빈 피드 3회 연속**(FR-11) 또는 **새 기사 없음 7회 연속**(느린 피드 오탐 방지), 시간 예산 초과(`budget`)는 어느 쪽에도 세지 않음 ③ PRD §10 '수집 일부 실패 → 이슈'도 같은 소스별 이슈(`source-broken`, fingerprint `source:<id>`)에 기록, 재발은 댓글(FR-152) — 2026-10-12 완료: `RunLog.sources[]` `usable`·`error` 기록, `source-health.ts` 상태 분류·연속 횟수(budget 건너뜀)·7일 집계(KST), 소스별 `source-broken` 이슈(원인 키 `source:<id>` — 매 실행 실패·`failing-streak` 3회·`stale-streak` 7회, 재발 댓글). 전체 실패면 소스별 `failed` 사건은 생략하고 pipeline-failure 하나로(FR-152 같은 원인 하나 — 오케스트레이터 결정). `collect.yml`: 수집 단계는 사건 파일만 쓰고 뒤 단계가 `issues: write` 토큰으로 보고(env 수준 격리), 사건이 없으면 node 미실행, 일괄 보고 상한 50건. 이슈 템플릿 문구 갱신. 리뷰(code-reviewer) 차단·중요 0, 권장 3건 반영
  - 🆕 M1-11 이월 메모: **M1-27** 연속 횟수·7일 집계는 커밋된 실행 기록만 센다 — 실패해 커밋되지 않은 실행이 빠져 전체 장애가 며칠 이어져도 `failing-streak`이 되지 않음(이슈 댓글은 매 실행 남음) → 실패 실행 기록 보존 · **M5-09** 운영 리포트·/status는 `sourceStats`·`assessSourceHealth` 재사용, 이슈 보고 단계 실패(continue-on-error — 주석으로만 보임)를 점검 항목에 · 완전한 토큰 격리(별도 job + 아티팩트)는 필요하면 커밋 단계와 함께 검토 · Actions 검증(2026-10-13, run 38270456676 force): 수집·커밋·배포 성공, ESPN이 러너에서 `parse` 실패(로컬은 정상 — 일시 응답 이상 추정) → 이슈 #3 자동 생성 확인(관찰용으로 열어 둠). 진단 개선 후보: 파싱 실패 때 본문 없이 content-type·첫 태그 이름만 기록
- [x] M1-44 🆕 football-data 최소 어댑터 (D24): 브리핑 입력용으로 전날(KST 창) 6개 대회 경기 결과·현재 순위만 → `scripts/lib/providers/`, 분당 10회 지연, 실패 시 그날 브리핑 생략(뉴스는 발행). 경기별 득점자는 football-data 무료 미제공(M0-28)이라 **M1-48(API-Football)이 맡는다** — 두 어댑터는 호스트가 달라 병렬로 돌린다. 두 API는 팀 id 체계가 달라 같은 경기를 맞추려면 팀 id 대응이 필요하다(M0-29) → 2026-10-12 사용자 결정(PRD §15 D33): **`configs/team-ids.json` 신설**(팀 slug → `{ fd, af }`, 각 id 중복 금지 — 같은 숫자가 두 API에서 다른 팀인 경우 6건), 초안은 `fixtures/football/index.json` `teamIdPairs` 52쌍 + 한국 선수 소속팀으로 스크립트가 만들고 사용자 확인 후 커밋, 나머지 팀은 실행 때 후보(대회·킥오프·스코어 일치 + 후보 1개)를 운영 리포트로 제안, 대응표에 없는 경기는 득점자 없이 진행 (D27). M2-02가 이 어댑터를 대회 페이지용으로 확장 — 2026-10-13 완료: 경계 zod(경기·순위), 순위는 표 단계 종료 경기가 있는 대회만(UCL 36팀 단일 테이블), 타임아웃 30초(교차 `/v4/matches` 실측 3.3~5.2 → 12 → **17.6초**로 증가), 429·5xx·타임아웃만 재시도 1회, 단계 예산 150초, 경기 데이터 단계 = football-data ∥ API-Football 병렬·실패 격리(경기 실패 → 브리핑만 생략, 순위 실패 → 그 대회만). 공통 내부 형식 `match-data.ts`(ft = 정규시간+연장, 승부차기 `pens` 분리). **`configs/team-ids.json` 52팀**(종료 경기 대회·킥오프·스코어 일치 48 + 취소·미종료 경기 4 — 알려진 id와 일치, 한국 선수 소속 8팀은 M0-32 id와 일치) — 사용자 확인(2026-10-13): **id 확정, slug는 M2-04에서 정리**. validate 교차 검사(활성 선수 팀의 `af` 필수 — 오류), 짝짓기 도우미 `suggestTeamIdPairs`, `/add-player`에 team-ids 확인 단계 추가
  - 🆕 M1-44 이월 메모: **M1-48** ⚠ 겨울 시간 — 경기 데이터 단계는 두 프로바이더가 모두 끝나야 브리핑으로 가므로 API-Football 단계 예산 6분이면 겨울(07:10 → 07:20 마감)에 LLM 몫이 30초 남짓 → 브리핑에 필요한 경기(전날 6개 대회 종료 경기 득점자)를 먼저 받고 브리핑이 쓸 마감을 따로 두거나 겨울 예산 축소(M1-47과 함께), `runApiFootballProvider` 자리 교체·`apiCalls.apiFootball` 기록, 근거 약한 4팀(Athletic·Rayo·Köln·Freiburg)은 첫 실데이터 짝짓기로 재확인 · **M1-19** `standings` 공동 순위 있음(응답 순서 유지), `inProgress > 0`인 대회는 순위 문장 금지, 연장·승부차기 경기는 지금 입력에서 빠짐(`pens`·`regular` 표기 규칙 필요) · **M2-02** 클라이언트·`toCompStandings` 재사용, 대응표 밖 59팀은 fd-only(`af: null`)로 채움 · football-data 응답이 25초를 넘기 시작하면 대회별 엔드포인트(0.8~1.9초, 요청 1 → 6)로 전환 검토
- [x] M1-48 🆕 API-Football 경기 단건 어댑터 + 경기 기록 누적 (FR-55·FR-61·FR-62·FR-65·FR-91 입력, PRD §15 D27): ① `scripts/lib/providers/` 어댑터 — `/fixtures?date=` D-1·D(UTC) 2건을 대회 필터 없이 받아 `configs/competitions.json`의 `apiFootballLeagueId` ∪ 한국 선수 소속팀으로 거르고, 직전 실행 이후 종료(`FT`·`AET`·`PEN`)된 대상 경기마다 `/fixtures?id=`(이벤트·라인업·선수 기록 한 번에). 미종료 경기 id는 `data/cache`에 두고 다음 실행에서 재조회(id 단건은 날짜 창 밖도 열림) ② 응답 경계(zod): HTTP 200이어도 `errors`(정상 `[]` · 오류 객체) 먼저 검사, `errors.plan` → 재시도 없이 해당 기능을 FR-65 폴백으로 강등 + 이슈, 시각 `+00:00` → `Z`, 선발 = `lineups[].startXI`(`games.substitute` 무시), 골·도움 = `events`(`goals.total`은 0/null 혼재), 승부차기는 `score.penalty` 별도(football-data와 반대), 로고·사진 URL 버림, 한국 선수는 `apiFootballId`로 매칭 ③ 호출 정책: 동시 1개·응답 후 6.5초 간격, 우리 쪽 카운터로 하루 ≤ 60회(예상 최대 약 35건), 5xx·타임아웃(15초)은 10초 후 1회 재시도, 단계 시간 예산 6분(넘으면 남은 경기는 다음 실행으로 이월), 호출 수는 `runs.json` `apiCalls.apiFootball` ④ ~~❓ 경기 기록 누적 저장 스키마~~ → 2026-10-12 사용자 결정(PRD §15 D33): **월별 원장 `data/matches/YYYY-MM.json`**(킥오프 UTC 월, `{ month, updatedAt, matches[] }`, 경기 id `af-<id>` 기준 덮어쓰기) + `data/matches/meta.json`(`since` = 첫 실행이 한 번 쓰고 바꾸지 않는 집계 시작일, `playerSince` = API id를 나중에 채운 선수별 시작일, `gaps` = 수집 실패로 빠진 날). 저장 범위는 **득점·도움·포메이션 + 등록 한국 선수 행만**(출전 상태 선발·교체·벤치·명단 제외, 출전 시간·골·도움) — 전 선수 출전 시간은 저장하지 않고, 나중에 등록된 선수는 원장의 경기 id로 그 경기만 재조회해 보충. 원장에는 API-Football id·원문 이름만(slug는 읽을 때 `team-ids.json`·`names.ko.json`으로), 화면은 원장을 직접 읽지 않고 파생 파일(`players/korean.json`·팀 포메이션·주간 리포트·브리핑 입력)만 읽는다. 부록 A의 `PlayerMatchLog`·`PlayerSeasonStats`·`WeeklyReport`는 그대로 두고 원장의 출력으로 쓴다. 미종료 경기 id는 `data/cache/af-pending.json`. 한국 선수 소속팀의 기타 대회 필터에서 클럽 친선경기는 뺀다. 확정 zod는 구현 때 부록 A에 추가. 원본 응답은 커밋하지 않고 필요한 필드만 변환 저장 ⑤ 한국 선수 대상은 `korean-players.json` 등록분 — M0-32 초안 9명이 이미 등록됨(2026-10-11 사용자 결정). `apiFootballId`가 `null`인 활성 선수(현재 김지수)는 매칭되지 않으므로 라인업 이름 대조로 후보를 찾아 운영 리포트에 알린다(사람이 확인해 채움, M3-01은 확정·검토) ⑥ 브리핑 입력(M1-19)에 득점자 제공. 단위 테스트는 M0-35 원본에서 만든 fixtures로(날짜 창 때문에 지난 날짜 재수집 불가). 착수 때 보강 호출 3회 — `/status` + `/fixtures?id=1639860`(승부차기 events) + `/fixtures?id=1570410`(INT 경기 재조회 응답) — 로 `fixtures/football/` 빈칸(index `missing`)을 채운다(id 단건은 날짜 창 밖도 열림)
  - 🆕 M1-48a 완료(2026-10-13, 어댑터·호출 정책·수집 연결 — 리뷰 차단 0, 중요 2건 반영): ① 대상 = 6개 대회 ∪ 한국 선수 소속팀 af(클럽 친선 league 667 제외), 요청 순서 brief(전날 6개 대회 종료) → window → requery, `data/cache/af-pending.json` 이월(부록 A 13) ② errors 우선 검사, `plan` → 재시도 없이 강등·`auth`(token·401·403) → 즉시 중단, 둘 다 `source:api-football` 이슈 사건, 날짜 조회 하나의 `plan`도 단계 전체를 멈춤(의도된 범위) ③ 동시 1개·응답 후 6.5초(60초 창 최대 10건), 429·rateLimit 뒤 61초 가드 유지·연속 2회 중단, 5xx·타임아웃 10초 뒤 1회 ④ 일일 카운터 = runs.json+runs-dev.json `apiCalls.apiFootball` 합(UTC 날짜, prod 60·dev 50·전체 100, 읽기 실패 시 10), 데이터 API 호출이 있으면 mock·dry도 runs 기록, dev 06:00~08:00 KST는 건너뜀 ⑤ 뉴스와 경기 데이터 병렬 시작(뉴스 실패·예외 시 abort), 브리핑 컷오프 = 단계 시작 + 4분(최악 약 130초 늦음 — `TODO(M1-47)`), 단계 예산 6분 ⑥ fixtures 실응답 7개(승부차기 킥 = Goal + 'Penalty Shootout', 자책골 team = 득점 인정 팀, 1570410 INT → ABD), Köln·Freiburg 대응 실측 확인. 실호출 API-Football 18건(dev 상한 20 안, 08:01~08:05 KST). **실측: 월요일 브리핑 대상 4경기 팀이 모두 대응표 밖 → 득점자 0** → 사용자 결정 D37(강한 증거 실행 중 자동 연결)을 M1-48b에서 구현
  - 🆕 M1-48b 완료(2026-10-14, 원장·한국 선수 행·D37·브리핑 득점자 — 리뷰 차단 0, 중요 3건 반영): 월별 원장 `data/matches/YYYY-MM.json` + `meta.json`(부록 A 14·15, D33 보강 사용자 확인), **원장 쓰기는 `COLLECT_ENABLED=true` 정기 운영 prod 비-dry만**(켠 뒤 첫 쓰기 실행이 `since` — 아직 원장 파일 없음), 새 원장은 meta 먼저·since 앞 경기 제외. 한국 선수 행 5상태(start·sub·bench·absent·unknown), apiFootballId 없는 선수(김지수)는 라인업 이름 후보만 로그. gaps는 그 날짜의 첫 조회 기회 실패만 새로(가짜 빈 날 방지). 불완전 항목(득점 불완전·라인업 없음·포메이션 없음)은 af-pending 재조회 상한(3회·3일) 안에서 다시 받아 덮어씀. D37 자동 연결은 대회·킥오프 ±5분·스코어·끝난 방식 일치 + 양방향 유일 + **같은 칸에 점수 모르는 후보가 있으면 차단**, configs 자동 수정 없음. 브리핑 입력 `goals`는 연결+`goalsComplete` 경기만. dry 실측(10-14): UCL 9경기 전부 연결(대응표 3·증거 6), 한국 선수 행 2(이강인 61분·김민재 90분), 브리핑 goals 9경기, 경기당 약 0.8KB(시즌 약 1.3MB)
  - 🆕 M1-48 이월 메모: **M1-19** 같은 아침 두 번째 실행(백업·force)은 브리핑 창 경기가 원장에 있어 다시 받지 않으므로 득점자가 빠짐 → 원장의 완전 항목을 득점자 입력으로 사용, `briefGoalsOf` 재사용, 연장·승부차기 경기는 아직 입력에서 빠짐 · **M1-27** 커밋되지 않은 실행의 원장·이월 쓰기도 사라짐(실패 실행 기록 보존과 함께) · **M1-47** 브리핑 컷오프(단계 시작 + 4분)·football-data 150초 예산을 계절별 마감 기준으로 · **M3-02·M3-03** `PlayerMatchLog`는 원장 행에서(started: start → true·sub/bench/absent → false·unknown → null), 시즌 누적은 kickoff ≥ `playerSince[slug]`, `goalsComplete:false` 경기 골은 확정 값 아님, 나중 등록 선수 행 보충(원장 id 재조회)은 미구현 · **M5-09** 운영 리포트 입력 = 로그 `collect.teamids.auto-link`(configs 이전 후보)·`collect.teamids.candidate`·`collect.ledger.player-candidate`·meta `gaps`·`seasonMismatch`, 실행 자체가 없던 날은 runs.json으로 감지 · 라인업 정보가 없는 대회(일부 컵·기타 대회) 경기는 늘 불완전이라 경기당 최대 3번 더 받음(requery 계층·일일 60 안) · **/new-season** 시즌 전환 때 meta(새 since) 처리 규칙 필요

### M1-B 정제·분류 — 코드, 순수 함수 + 단위 테스트
- [x] M1-12 URL 정규화(utm·트래킹 파라미터·AMP) + 해시 중복 제거 + `seen-urls.json`(90일) (FR-04) · 🆕 실측(2026-10-13 발행): 겹침 구간 때문에 전날 카드('Police officer hurt after Liverpool-Man City game')가 다음 날 파일에 다시 들어감 — M1-10 이월 메모대로 seen-urls로 막을 것 — 2026-10-15 완료: `scripts/lib/url-normalize.ts` 정규화(추적 파라미터 `utm_`·`at_`(BBC)·`ns_` 접두사 + 클릭 id 28종, AMP 경로 조각·`.amp`·`articleViewAmp.html`·AMP 쿼리·Google AMP 뷰어·cdn.ampproject.org·`amp.` 호스트, http=https·`www.`/`m.` 제거, 끝 슬래시·조각 제거, 쿼리 이름순 — `ref`·`source` 등 애매한 파라미터와 국내 `idxno`는 보존) + `urlHash` = sha256 앞 16자리(seen 키). `dedup.ts`: 정규화 URL 해시로 묶고 대표 = 설정 순서상 처음 항목(카드 링크는 피드 원문 — 정규화 URL은 키로만, D23), 카드 소스 = 대표 소스 그대로 + 대회 합집합(M1-02 이월: BBC Football+PL 공통 링크가 EPL 유지, 카드 `src[].n`·`tier`는 같은 출처 값). 묶음 최고 tier·최대 weight·최단 보존 기간은 점수화·보존 입력(`GroupSourceMeta.bestTier`·`maxWeight`·`minRetentionDays`)으로만. `seen-urls.ts`: 기억 = `seen-urls.json`(90일 정리) ∪ 발행 파일 D-1~D-3 ∪ 오늘 파일. **기억에는 카드가 된 URL만**(정규화 해시 → 처음 카드가 된 시각) — FR-04 수용 기준 '두 번 카드화되지 않음' 해석, 선별에서 빠진 항목은 다음 실행에서 다시 경쟁. 다른 날 카드는 후보에서 제외, 오늘 파일 카드는 선별 자리 유지(같은 날 재실행 파일 팽창 방지), 오늘 지워진 카드는 제외. 쓰기는 발행 파일을 쓴 뒤 그 카드로만(dry·뉴스 실패는 안 씀, 내용 같으면 안 씀 → 커밋된 기억 ⊂ 커밋된 카드), 손상·쓰기 실패는 경고 + `partial`로 발행 계속. `mergeCards`도 정규화 URL로 같은 카드 판정(M1-16 ID 전환 대비). 실측: 10-13 'Police officer…' 재게시를 10-12 파일로 차단 확인, 실제 피드 dry(RSS만) 창 안 234 → 고유 168(중복 66·여러 소스 묶음 59) → 이전 카드 4 제외, fixtures 69건·실제 발행 출처 18건 잘못 합쳐짐 0. M1-10 겹침 테스트 단언을 0으로 뒤집음. 테스트 +83(3,084), 스키마 변경 없음(부록 A 11). 리뷰(code-reviewer) 차단 0·중요 0, 권장 4건 반영(카드 tier = 대표 출처 값, 주석 예시, 쓰기만 실패 테스트, 스키마 주석 문구)
  - 🆕 M1-12 이월 메모: **M1-13** 입력은 `DedupGroup[]`(key·item·sources), 기억 판정은 지금 묶음 키 단위 → 클러스터 안 URL 하나가 다른 날 카드였을 때 클러스터 전체를 뺄지·그 출처만 뺄지 결정, 같은 날 재실행에서 기존 카드에 새 출처를 붙일지(`mergeCards`는 지금 출처 URL이 하나라도 겹치면 새 카드를 통째로 건너뜀) 결정, 보도 매체 수는 `DedupGroup.sources` 수가 아니라 매체명(`publisherNameOf`) 기준으로 셀 것(같은 매체 섹션 피드 중복 계산 방지) · **M1-14** 점수화 입력은 `groupSource()`의 `bestTier`·`maxWeight`(카드 tier 아님), 묶음 단위로 동작하는 `selectLatest`가 대체 대상 · **M1-16** `cardIdFor`를 `c_` + `urlHash(url).slice(0, 10)`로 바꾸면 카드 ID가 seen 키의 접두사, 이미 발행된 카드(10-12~) ID는 그대로, `collect-slice`의 'M0-34 샘플과 같은 ID' 테스트·`fixtures/news-sample.json` 처리 필요 · **M1-17** 분류는 합친 소스(대회 합집합)를 받음 — BBC European처럼 4개 리그가 붙는 소스는 팀→리그 규칙으로 좁힐 것 · **M1-25** 삭제·보존 만료 카드는 seen 해시가 남아 다시 올라오지 않음(의도, URL·제목은 남지 않음), 카드 `src`의 보존 기간은 대표 소스 기준·묶음 최단 값은 `minRetentionDays`(지금 설정에서는 서로 다른 호스트가 같은 URL로 묶일 일 없음) · **M1-27** 실패 실행의 runs 기록만 커밋하는 경로를 만들면 `seen-urls.json`은 커밋하지 않아야 커밋된 기억 ⊂ 커밋된 카드 유지 · **dev 실행** dry 없이 로컬 실행하면 `data/cache/seen-urls.json`·`data/news`가 바뀜 → dev 커밋에는 `runs-dev.json`만 넣는다 · **M5-09** 평소 `collect.seen.load`의 `backfilled > 0`은 지난 실행의 기억 쓰기 실패·파일 유실 신호(제안: validate 경고 — 최근 3일 발행 카드 URL이 seen에 모두 있는지)
- [x] M1-13 제목 유사도 클러스터링 — 다국어 혼합(en·it·es·ko), 임계값은 fixtures로 튜닝 (FR-05) — 2026-10-15 완료: `scripts/lib/cluster.ts` — 같은 문자 묶음 안 IDF 가중 코사인(라틴은 단어: 발음 기호 제거·약칭 통일·복수 s·앞 6글자·고유명사 구 1/√k, 한국어는 음절 2-gram, 스코어는 작은 수-큰 수로 통일, 대괄호 머리표 제거), 완전 연결 탐욕 병합(linkRatio 0.6 — 사슬 효과 없음). **국내·해외는 비교하지 않음**(D30 — 연결 줄은 M1-31). 하한 en·es·it 같은 언어 0.28 · 언어 간 0.45 · ko 0.30, 공유 특징 라틴 2개/한국어 3개, 시각 차 8→24시간에 하한 +0.1·48시간 초과 비교 안 함, 같은 매체는 12시간 안에서만, 묶음·해설 제목(& more·gossip·briefing·Q&A·의문사 시작·쉼표 3개 이상)은 합치지 않음. `scripts/lib/news-cluster.ts` 계획 — 다른 날 카드 URL이 든 클러스터는 통째로 제외(로그 `seenBeforeExtra`), 같은 날 재실행이면 오늘 카드(제목 anchor)에 새 출처를 붙임(id·created·제목 유지, `mergeCards` attachments — 서로 다른 오늘 카드끼리는 합치지 않음), 보도 매체 수는 `publisherNameOf` 기준(`NewsCluster.publishers`), 카드 `src`는 URL 묶음마다 1건(대표 먼저·같은 매체 여러 번 가능), 대회는 클러스터 소스 합집합, 클러스터링(주입 함수) 예외는 클러스터 없이 발행 + `partial`. 튜닝(손 판정, LLM 없음): 51시간 창 실제 피드 오탐 0·must 10/23, 2차 표본 약한 오탐 1클러스터, fixtures/rss 오탐 0·9/16 → 쌍 정밀도 93%·재현율 약 49% — **제목만으로는 '중복 0'이 불가해 FR-05 기준을 바꿈(PRD §15 D42, 사용자 결정)**. 결정성: 입력 200가지 순서에서 같은 결과, 성능 1,000건 89ms. 저장소 표본 `fixtures/cluster/titles-2026-10-15.json`(실제 제목 252건·손 판정, 링크·요약·Athletic 없음). D42에 따라 `fixtures/rss/the-athletic-football.xml` 합성 제목 교체. 스키마 변경 없음. 리뷰(code-reviewer) 차단 0·중요 1(D42 승인 — 사용자 결정으로 해소), 권장 반영(stats `existingSeenBefore`, 실패 격리 주석 범위, import 정리, 번호 통일, `groupSource` 정리)
  - 🆕 M1-13 이월 메모: **M1-14** 점수화 입력은 `NewsCluster.publishers.length`(매체 수)와 `clusterSourceMeta(cluster)`의 bestTier·maxWeight(M1-12 메모의 `groupSource()`가 아님), `selectLatest`(클러스터·`latestItem`) 대체, 오늘 카드 클러스터가 선별 자리만 차지하는 규칙(파일 팽창 방지) 유지 · **M1-15** 대표 선정은 `cluster.members`에서(Tier·weight·최신성), 언어가 섞인 클러스터는 대표가 카드 제목 언어를 정함, 같은 날 오늘 카드의 id·제목은 바꾸지 않음 · **M1-17** 축구 외·K리그·**연예 기사**(인터풋볼 전체기사 피드에 콘서트·결혼·영화제·K-pop 등 10-15 수집분 50건 중 10여 건) 제외는 클러스터링 **전**(묶음 단계)에 — IDF·병합에 섞이지 않게, 클러스터 대회 태그는 서로 다른 기사의 소스 합집합(BBC European 4개 리그가 퍼질 수 있음) → 팀→리그로 좁힘, **D42 엔티티 2단계 병합**(같은 두 팀 + 같은 스코어/경기일 + 12시간) · **M1-18** 이적 `tier` = `clusterSourceMeta(cluster).bestTier` · **M1-25** 클러스터 카드에 비대표 Athletic 출처가 흔해짐 → 보존 만료는 '그 출처만 삭제'가 기본 경로(대표면 카드 삭제) · **M1-31** '+N곳' = 서로 다른 `src[].n` 수 − 1, 카드 정렬은 최신 출처 시각인데 표시 시각은 `src[0].at`라 어긋날 수 있음, 지금 홈은 `src[0]`만 보여 합쳐진 출처가 M1-31 전까지 화면에서 닿지 않음 · **M1-43·M1-46** 관찰 주간에 `collect.select.done`의 clustered·merged·seenBeforeExtra·existingSeenBefore 기록 + 합쳐진 카드 샘플 검수 → ko 0.28 재검토, **이탈리아어 양성 쌍 0개**(실데이터에 Di Marzio 없음 — 로컬 네트워크 오류) 검수, '이전 날 사건 제외'가 어제 카드 URL이 겹침 창에 다시 들어올 때만 작동하는 한계 → D-1~D-3 카드 제목을 '이미 본 사건' anchor로 쓰는 안(`readRecentNewsCards` 재사용)을 데이터로 판단 · **아이디어(제안만)** 국내 제목 인용부(“…”·‘…’) 가중치 낮추기로 재현율 개선(토큰 0, 반나절)
- [x] M1-14 점수화 + 상위 `MAX_ITEMS_PER_RUN` 선별, 이적 창 가중 연결 지점 마련 (FR-06, FR-105) — 2026-10-16 완료: `scripts/lib/score.ts` 점수 = 클러스터 최대 weight × Tier(1 1.25·2 1·3 0.8) × 키워드(활성 등록 한국 선수 3·빅클럽 1.3·UCL 1.25·이적 1.2 × 이적 창 배수) × 보도 매체 수(1 + 0.5/곳, 상한 3) × 최신성(반감기 24시간) × 범위(소스 대회 ∪ 제목 대회 ∪ 빅클럽 ∪ 등록 선수 근거가 없으면 0.5 — 감점만, 제외는 M1-17). 가중치는 코드 상수 `DEFAULT_SCORE_WEIGHTS` 한 곳, 이적 창 배수는 `transferWindowBoost(at, file)` 자리만(기본 중립 1 — M4-03에서 transfer-windows.json 연결). 상한 `MAX_ITEMS_PER_RUN`(기본 45, `--limit`은 소량 실행 — 슬라이스 기본 5건 폐지, M1-01 이월). 미래 시각을 수집 시각으로 낮춘 기사는 창 단계 `clampedKeys`로 알아보고 경과 12시간으로 봄(섞인 클러스터는 min(믿을 수 있는 나이, 12시간) — M1-02·M1-10 이월). **(D44) 일일 카드 상한은 그날 파일 기준** — 새 카드 자리 = 상한 − 오늘 파일 카드 수(`planSlots`, 오늘 카드 클러스터는 출처만 붙고 자리를 쓰지 않음), **국내 최소 몫** = 상한 ÷ 3(15장)을 국내 점수 순으로 먼저 채우고 나머지는 전체 점수 순(`selectWithQuota`, 국내가 모자라면 해외로), 재실행 몫은 그날 파일 기준(하루 몫 − 기존 국내 카드). 점수는 `buildClusterCard → buildCard → classify(signals)`로 넘기고 카드·스키마는 그대로(imp는 M1-17). **파일 순서 = 화면 순서: imp 내림차순 → 최신 출처 시각 → id**(PRD §4.2 '중요도·시각 순'). `scripts/lib/news-keywords.ts` 공용 키워드 표 — 이적 en·it·es·ko + 라틴 공통 'here we go', 대회 6개('PL' 약칭 포함 — 한국어 표의 라틴 약칭은 라틴 경계로만 맞춰 SPL·ATMOSPHERE 오탐 없음, 한국어 '리그1'은 K리그1과 겹쳐 제외), 빅클럽 16곳(코드 상수 — M2-08 `bigmatch-rules.json`으로 이전 예정) + names.ko 같은 slug 표기, 한국 선수 = 활성 등록 선수만(FR-60·FR-64 — `koreanKeywordPlayers`, M1-17 `kr`과 같은 기준), 제외 표현(Inter Miami·Inter de Miami·Juve Stabia·뮌헨글라트바흐·프랑스 리그2·AFC 챔스·Concacaf/AFC/CAF 대회·여자팀·득점 관용구 'firma il gol'·'title bid' 등). 키워드 설정 읽기 실패는 경고 후 코드 표로 계속. 로그 `collect.select.done`에 점수 상·하한·`selectedMix`(koQuota·koByQuota). 실제 피드 dry(10-16 01:10 KST, RSS만): 45장 중 국내 15(몫으로 6)·빅클럽 다수·범위 감점 0, 하위 = K리그·LAFC·연예. 테스트 3,237 → 3,303. 리뷰(code-reviewer) 차단 0, 중요 3(D44 구현·m1-22 병합 의미 충돌·범위 감점 한계 → M1-17 이월) 반영, 권장 반영
  - 🆕 M1-14 이월 메모: **M1-17** imp = `signals.score` 구간 — 분위수가 아니라 절대 임계값 권장(같은 날 재실행 카드끼리 같은 기준, 10-16 dry 분포 1위 5.3·45위 1.8·꼴찌 0.13), 머리기사(D30) 안정성을 위해 imp 5 = 그 실행 최고 점수 1장(또는 임계값 이상)인지 결정, **범위 감점 한계** — BBC Football `competitions: []`라 빅클럽 밖 EPL 기사(‘Wolves striker Jimenez to have knee surgery’·‘Jackson steps up again as Aston Villa revival continues’ 등)가 0.5배 → 팀→리그 근거를 `ScoreSignals.comps`로(분류를 점수화보다 먼저 하거나 `clusterSignals` 확장), Relevo는 소스 대회 LALIGA라 비축구 기사(F1·체조·NFL 'Eagles-Jaguars en Tottenham' — 빅클럽 오탐 포함)가 감점 없이 통과 → 축구 외 제외로 해결, 김지수·정우영 동명이인(연예 기사) 오탐은 연예 제외로, `kr`은 `koreanKeywordPlayers`(활성 선수만) 기준, 공용 표 `news-keywords.ts` 확장 · **M1-18** 상태 표는 `TRANSFER_TERMS`(화제 판정) 옆에, 'here we go'는 라틴 공통 · **M1-21** names.ko 초기 사전에 빅클럽을 같은 slug로 넣으면 `BIG_CLUBS` 별칭에 자동 합류, 'milan' slug는 team-ids.json에 아직 없음(football-data 'AC Milan' kebab 규칙 확인), 여자팀 제외는 빅클럽 별칭 + 접미어 방식('PSG 위민'처럼 라틴 약칭 + 한글 접미어는 잡히지 않음 — 드묾) · **M1-31** 파일 순서를 그대로 그림, 낮춘 시각 카드(`src.at` = 실행 시작)는 같은 imp 안에서 맨 위에 설 수 있음 · **M1-43·M1-46** `collect.select.done`의 scoreTop·scoreCutoff·scoreFirstOut·selectedMix 기록 → 국내 몫 1/3·한국 선수 배수 3·범위 0.5 재검토, **국내 몫 15장이 전부 인터풋볼**(10-16 dry — 인터풋볼 1.5/1·베스트일레븐 1/0.5·풋볼리스트 0.5) → 국내 매체 다양성(매체별 상한 또는 weight 조정) 검토, 인터풋볼 '해외축구'(1.5)는 피드가 짧아 하루 지난 기사가 '전체기사'(1)에만 남아 weight가 시간에 따라 떨어짐 → M1-17 제외 규칙 뒤 전체기사 weight 조정 검토(사용자 결정) · **M4-03** `transferWindowBoost`를 `scoreCtx.transferBoost`에 연결(파일 읽기 실패는 중립), 리그별 창 적용 방식(EPL만 열렸을 때 EPL 기사만?) 결정
- [x] M1-15 카드 생성 경로 (FR-20, D23): 해외 클러스터 → 원제목+링크 카드(`ai:false`, `s:[]`, 대표 항목의 피드 `title`·`link` 무수정 — 엔티티 디코딩·앞뒤 공백 정리만, 200자 초과는 건너뛰고 로그, 대표 항목은 Tier·weight·최신성 순). 한국어 클러스터 → LLM 생략, 제목+링크(`s:[]`) — RSS 요약 절단은 M0-25 판정 결과 적용 매체 없음 — 요약문(description)은 표시·저장하지 않는다(2026-10-10). 원제목·링크가 피드 원문과 같은지 테스트 — 2026-10-16 완료: `scripts/lib/card-lead.ts` 대표 선정 — 클러스터 `members` 중 **⓪ 보존 기간 소스(`retentionDays` — Athletic) 후순위**(다른 후보가 있으면 맨 뒤, D45 ②) → Tier(묶음 최고) → weight(같은 링크 소스 중 최대) → 최신(수집 시각으로 낮춘 기사는 같은 Tier·weight에서 뒤) → 입력 순서. 설정에 없는 소스·200자 초과(방어선) 묶음은 다음 후보(200자 초과는 출처로 남음), 후보가 없으면 그 클러스터만 카드 없음(`collect.card.skip`), 언어가 섞인 클러스터는 대표가 `lang`을 정함. 출처 순서 = 대표 → Tier 오름차순 → 시각 내림차순 → URL(카드 저장 값만 — `mergeCards`가 출처를 붙일 때도 같은 규칙으로 `src[1..]` 재정렬, `src[0]`·id·제목·created 유지 — 오늘 카드는 대표를 다시 고르지 않음). **원제목 정리 범위 확정(D45 ① — 보이는 글자 불변)**: 엔티티 최대 3회(여분 인코딩 3겹까지 멱등), 숫자 엔티티 0x80~0x9F와 XML 파서가 먼저 푼 글자 C1을 HTML5 Windows-1252 표(27자)로(`&#146;`→’ 등, 표에 없는 값은 원문), 줄바꿈·탭 구간 → 공백 1칸(NBSP·U+3000은 유지), 제어 문자 제거, 앞뒤 공백. 200자 판정은 정리 뒤 UTF-16 길이, 초과 항목은 정규화에서 그 항목만 빠짐. 로그 `collect.select.done.leadReordered`. fixtures: 국내 3매체 묶음 대표가 인터풋볼 → 베스트일레븐(동률 최신). 실제 피드 dry: 45장 중 다출처 3·`ai:true` 0. FR-20 수용 기준 테스트(fixture 14피드 `t`·`src[0].u` = 원문, 요약문·본문 없음, 전 카드 `ai:false`·`s:[]`). 테스트 3,342 → 3,373, 스키마 변경 없음. 리뷰(code-reviewer) 차단 0, 중요 2(Windows-1252 엔티티 삭제·문서 문구 → D45) 반영, 권장 반영
  - 🆕 M1-15 이월 메모: **M1-16** 카드 id = `cardIdFor(대표 링크)` — 대표가 첫 묶음이 아닐 수 있음(`clusterCard` 한 곳), `fixtures/news-sample.json` 대표와 현재 규칙의 일치 여부 확인 · **M1-17** 분류 입력(팀·선수·`kr`·대회 키워드)은 대표 제목만이 아니라 **클러스터 모든 묶음 제목**(최신성 대표 때문에 김민재·설영우 분데스 카드가 노이어 중심 제목으로 바뀌어 대표 제목에서 '김민재'가 빠진 실측 — score.ts `matchTitles(items)`처럼 합집합), `&nbsp;`는 U+00A0로 남으므로 여러 단어 키워드 매칭은 매칭 쪽에서 공백 정규화, 요약문을 분류 입력으로 열어도 `buildCard`는 `summary`를 쓰지 않음(테스트 있음) · **M1-25** 보존 기간 소스는 다른 후보가 있으면 대표가 되지 않으므로 만료는 대부분 '그 출처만 삭제' 경로, Athletic 혼자인 카드만 카드 삭제 · **M1-31** `src`는 파일 순서 = 출처 스택 순서, `src[0].at`(표시 시각)은 가장 최신 출처가 아닐 수 있음(대표는 weight 우선) · **M4-11** 사이트 RSS 제목도 XML 이스케이프(제어 문자는 `cleanTitle`이 이미 제거) · **M1-43·M1-46** 최신성 대표의 편집 품질(대표 제목이 사건 전체를 대표하는지, 해설·단신이 대표가 되는 사례)·`leadReordered`·`collect.card.skip` 관찰
- [x] M1-16 카드 ID 결정적 해시 `c_` + 16진수 10자리 (대표 URL 기준, 공유 앵커 유지, PRD §15 D15) — 2026-10-16 완료: `cardIdFor` = `c_` + `urlHash(대표 링크)` 앞 10자리 = sha256(**정규화 URL** — M1-12 `normalizeUrl`) 40비트 = 대표 링크 seen 키의 접두사(같은 함수 재사용). 추적 파라미터·AMP·http·`www.`/`m.`·끝 슬래시만 다른 같은 기사는 같은 ID(공유 앵커 안정 — 오케스트레이터 결정, CLAUDE §8 문구 갱신). ID를 만드는 곳은 `clusterCard → buildCard` 한 곳(대표 = M1-15 규칙). **이미 발행된 카드(10-12~14 — 18장 중 17장이 새 규칙과 다름)와 `fixtures/news-sample.json`(23장 중 22장 — D0 시안·견본·DECISIONS 앵커 기록)은 다시 계산하지 않음**: 카드 ID는 저장된 값을 불투명한 키로만 쓰고, 같은 기사인지는 출처 링크의 정규화 URL로 판정(`mergeCards`를 ID 우선 → 출처 URL 우선으로 변경). 출처 링크가 겹치지 않는데 ID만 같은 카드(충돌)는 넣지 않고 `idCollisions` + `collect.card.id-collision` 경고(예전엔 다른 기사가 출처로 조용히 붙었음). 충돌 확률: 파일당 약 9×10⁻¹⁰, 90일 전체 약 7.5×10⁻⁶, 1년 약 1.2×10⁻⁴ — 파일 안 중복은 NewsFileSchema·validate가 거부. takedown·앵커·오류 신고 링크는 형식만 보므로 두 규칙이 섞여도 받음. 테스트 +19(3,392) — card-id.test.ts(고정값 3개는 coreutils sha256sum으로 따로 계산), 옛 ID 오늘 파일 재실행·다음 날, 충돌 경고, 단언 2개 뒤집음(추적 파라미터 변형이 이제 같은 ID). 스키마 변경 없음
  - 🆕 M1-16 이월 메모: **M1-25** takedown은 **저장된 `card.id`로 모든 날짜 파일에서** 찾고(URL에서 `cardIdFor`로 다시 계산하면 옛 규칙 ID를 놓침), 일치하는 카드를 모두 지움 — 이미 `c_fb2dd57b4a`가 10-12·10-13 두 파일에 있음(같은 기사, M1-12 이전 재게시)이라 'ID는 날짜를 넘어 유일'은 data/의 불변식이 아님(validate에 파일 사이 ID 유일 오류를 걸면 기존 데이터에서 실패), takedown 뒤 재수집 차단은 그 카드 `src[].u`의 `urlHash`(seen 키)로 · **M1-31·M1-33·M1-35** 앵커 `id`·오류 신고 링크 `card=`는 저장된 ID 그대로(화면·빌드 코드에서 ID를 계산하지 않음 — `cardIdFor`는 scripts 전용) · **M1-39** fixture 데이터 빌드의 news-sample ID는 옛 규칙 — '`id` = `cardIdFor(src[0].u)`' 같은 단언을 data/·fixtures에 걸지 않음, news-sample은 M1-15 대표·출처 순서 규칙과 다름 — 대표 1장(Ronaldo `c_8630993971`, Athletic 합성 링크 대표 — D45 ② 이전)·출처 순서 3장(`c_f598c95798`·`c_d8eac2777b`·`c_cd33b9b380` — 같은 Tier 안 최신순 아님) → M1-31 출처 스택·M1-39 e2e가 이 샘플을 쓰면 파이프라인 출력과 순서가 다름, **M1-25** `/takedown` 구현도 저장된 ID를 불투명한 키로만 씀(`card-id.ts` 머리 주석) · **M5-09** ops-report에 `collect.card.id-collision` 건수(평소 0) · **아이디어(제안만)** validate 경고 — 서로 다른 날짜 파일에 같은 ID인데 대표 정규화 URL이 다르면(진짜 충돌) 경고(같은 기사 재게시는 제외), 토큰 0
- [x] M1-17 코드 분류 규칙 v0.1 (FR-21, D23) + 🆕 **엔티티 2단계 병합**(PRD §15 D42·D49 ② — 분류 뒤 '같은 두 팀 + 같은 스코어 + 12시간 이내' 경기 카드를 합침(스코어 없는 기사는 대상 아님), 국내·해외는 합치지 않음): 카테고리(언어별 키워드 en·it·es·ko), 대회(소스 `competitions` + 팀→리그 + 키워드), 팀·선수(`names.ko.json` 영문 표기 매칭), `kr`(`korean-players.json`), 중요도(FR-06 점수 → 1~5 구간), spoiler(결과 카테고리·스코어 패턴·승패 키워드 → `true`). M0-33 실데이터 fixtures로 언어별 단위 테스트 — fixture에는 요약문이 없으므로(공개 저장소·D25) 제목 규칙은 실데이터로, 설명 키워드 규칙은 짧은 합성 문자열로 따로 테스트한다. 🆕 2026-10-15 사용자 결정(PRD §15 D39 ①): RSS 요약문(`description`)은 메모리에서 분류 입력으로만 사용(카드·`data/`·LLM에 넣지 않음). `kr`은 FR-60 기준(등록 선수만) — 국내 피드에 자주 나오는 5대 리그 밖 한국 선수(손흥민 LAFC·황인범·김민수 등, fixture 태그 `korean-unregistered:*`) 기사는 `kr`이 아닌 국내 매체 카드로 게시(범위 확장은 별도 제안 사항) · 🆕 실측(2026-10-13 발행): **Relevo 피드는 종합 스포츠**라 F1 기사가 카드가 됨, 인터풋볼은 UFC·K리그 기사 포함 → 축구 외·K리그 제외 규칙 필수 — 2026-10-17 완료(worktree 브랜치 `m1-17` → main 병합): ① **분류(FR-21 — `classify.ts`·`tag-names.ts`·`team-leagues.ts`)** — 입력 = 클러스터 **모든 묶음 제목**(M1-15 이월) + 소스 대회 + 메모리 안 RSS 요약문(D39 ① — spoiler와 범위 밖 제외의 남기는 근거로만, 카테고리·태그에는 쓰지 않음 — D47 ①, **D48 ① 위험 수용 3소스(daily-briefing·di-marzio·relevo)는 요약문을 읽지 않음** — `source-policy.ts`, 파서·정규화 양쪽). 카테고리 순서: 대표팀 → 이적(재계약만이면 감독·구단) → 결과(**UCL 결과도 result — D47 ②**) → UCL(결과 아닌 UCL 소식) → 부상(스코어 없으면 결과보다 먼저) → 감독·구단 → 기타. 경기 전 표현(법조동사 + 승패 동사·'앞둔'·'프리뷰' 등)은 결과가 아님, 결과 동사 표 + 주어가 있어야 결과로 보는 동사 표, 숫자 범위 뒤 단위어(위·주·월·weeks 등)는 스코어가 아님. 팀·선수 태그는 names.ko(185항목)·빅클럽 표·등록 한국 선수 — 라틴 단어 경계 / 한국어 낱말 경계(`koTermRegex`·`koWhole`·`koInfix` — '김민재가 수비'≠'가수' 같은 부분 문자열 함정 차단), 일반어·도시 별칭(Como·Nice·Lens·Roma·Milan 등 `AMBIGUOUS_TAG_TERMS`)은 발음 기호 원문('Cómo')·장소 앞말 뒤 제외 + 같은 리그 다른 팀·리그 표현·한 리그 소스가 근거일 때만, 여자팀 제목은 팀 태그 없음. 대회는 팀→리그(2026-27 5대 리그 96팀 코드 상수 — slug는 사전과 일치)로 좁힘. kr = 활성 등록 선수(국내 제목은 축구 근거가 있어야). spoiler = 결과·스코어·승패·경기 사건(보수적). imp = 점수 절대 임계값 [1.3, 2, 3] → 1~4, 머리기사 imp 5는 그날 파일에 없을 때 카드 생성 뒤 점수 1위 1장 ② **범위 밖 제외(`news-scope.ts`, 클러스터링 전)** — 축구 외(강한 표현 NFL·NBA·F1 등 / 약한 표현 종목 이름 — 라틴 제목은 팀 태그로 남김, 국내 제목은 사전 팀 태그가 남기는 근거, Relevo는 링크 경로 `/futbol/` 규칙 — sources.json note), K리그(구단 이름 + 유럽 근거 없음, **대표팀 강한 표현이 있으면 K리그 표현이 있어도 남김** — A매치는 범위), 연예(낱말 전체 '배우'·'가수'·'주연' + 구 단위 표현, 등록 선수 + 선수 문맥어가 있어야 남김 — 동명이인 배우 김지수 등). 로그 `collect.filter.done`(사유·소스별 건수), 범위 판정 실패 격리(`deps.filterOutOfScope`) ③ 점수화: 팀·한국 선수 리그를 범위 근거로(`extraComps` — M1-14 이월) ④ **D42 엔티티 2단계 병합**(`entity-merge.ts`·`cluster-classify.ts`) — 대상은 '경기 결과' 경기 기사만(구성 제목에 경기 전·부상·이적·재계약·감독·묶음 신호가 하나라도 있으면 제외), 같은 두 팀 + 공통 스코어(충돌이면 안 합침) + 첫 기사 12시간 창(사슬 없음), 해외 스코어 없는 기사는 같은 창에 스코어 기사가 있고 그보다 같거나 늦을 때만, 국내는 스코어 있을 때만, 국내·해외 분리, 오늘 카드 1장이면 그 카드의 출처(같은 조건, id·제목 유지) ⑤ RSS description 읽기(`rss.ts`·`normalize.ts` `cleanSummary` — 태그 제거·엔티티·500자, 본문은 읽지 않음, 카드·data·로그·dry 출력에 없음을 테스트로 고정). 손 판정 대조: fixtures/rss spoiler 22/22·kr 10/10·범위 밖 3/3, news-sample 카테고리 22/23·팀 29/29·대회 23/23, window 제외 43/49(오탐 0), **잘못 합친 쌍 0**(사전 확장 흉내 포함). 실제 피드 dry(10-17 11:20, RSS만): 219묶음 중 35 제외(축구 외 9·K리그 20·연예 6 — 하나씩 확인 오탐 0), imp {5:1, 4:4, 3:14, 2:23, 1:3}, 기타 24/45(D47 ① — M1-43에서 ≤ 30% 목표), spoiler 13/45. 테스트 3,508 → 3,800. 스키마 변경 없음. 리뷰(code-reviewer) 1차 차단 3(D42 오병합·한국어 부분 문자열·위험 수용 소스 요약문)·중요 8 → 2차 차단 1(스코어 없는 기사 우회 오병합 — 'turn down'·'hold talks'·'cup draw'·U21 팀)·중요 6 → **D42는 스코어 있는 기사끼리만(D49 ②)**, 추첨 표현은 결과 아님(UCL 조 추첨 = UCL 칩 — D47 ②), 구동사·'hold … talks' 제외, 유소년·2군 접미 팀은 1군 태그 없음, '격파' 낱말·'(으)로 부상'(떠오르다) 제외, 합성어(프로야구·여자배구·남자골프·프로당구·무릎부상·완전이적·전격영입) 인식, kr 축구 근거 요구는 동명이인 확인 선수(김지수·정우영 — `KOREAN_HOMONYM_PLAYERS`)에게만·점수화 한국 선수 배수도 같은 결과, 대표팀 발탁·소집·명단 기사는 K리그 표현이 있어도 남김, 같은 리그 겹치는 별칭 둘 + 스코어는 서로를 근거로, CDATA 없는 HTML 요약문 자식 글자 보존 → 재현 A~F·K 잘못 합치기 0, window 제외 43·오탐 0, 실제 RSS 10-17 12:06 제외 34·오탐 0·kr 손실 0, 3차 확인 리뷰
  - 🆕 M1-17 이월 메모: **M1-18** 이적 합성어 표 `KO_TRANSFER_COMPOUNDS`와 'hold * talks' 제외(회담 = 이적 협상 신호일 수 있음)를 이적 단계 판정에서 이어받을 것, 상태 표는 `RENEWAL_TERMS`·`TRANSFER_STRONG_TERMS`·`TRANSFER_TERMS` 옆에, 클러스터 분석은 `classifyClusters().analysisOf`, 카테고리 순서상 이적이 부상보다 앞이라 '이강인 이적 설득한 코케, 부상 이탈'이 이적으로 분류 — 함께 재검토 · **M1-31** 태그는 사전에 있는 slug만 그려짐, imp 5가 없는 날 머리기사는 최고 imp 중 최신 카드 · **M1-43·M1-46** 로그 `collect.filter.done` bySource·`collect.entity.done`·`classifiedMix`, 제외 놓침 유형(선수 이름만 나오는 테니스·Jerez 모터사이클·연예 표현 없는 연예 기사·'부산' 훈련장·구단 이름 + 대표팀 표현이 있는 K리그 시상), 기타 비율(D47 ① ≤ 30% 목표), 국내 카드 대부분이 인터풋볼(매체 다양성), imp 임계값, **엄격해진 D42의 실제 병합 수와 중복 감소율**(해외 스코어 없는 같은 경기 쌍을 다시 허용할지), 겹치는 별칭 팀(Roma·Como·Nice)의 유럽 대항전 태그 누락 · **/add-source** 새 위험 수용 소스는 `SUMMARY_UNREAD_SOURCE_IDS`와 경로 규칙 `FOOTBALL_PATH_RULES`를 함께 검토 · **/new-season** `TEAM_LEAGUES`(96팀 코드 상수) 승강 반영 · **/add-player** 새 등록 선수의 동명이인 연예인 여부 확인 → `KOREAN_HOMONYM_PLAYERS` 추가 · **M2-08** 점수화 빅클럽 배수(`BIG_CLUBS`)는 유소년 접미를 보지 않음('Arsenal U21'도 1.3배) — bigmatch-rules로 옮길 때 같은 접미 규칙 · **M1-43 추가** 스코어만으로 합치므로 같은 경기 중복 감소율 감소 기록, 실데이터 기타 48.9%(10-17 낮), 남은 오분류('10-10클럽'을 스코어로·'비겨' 미등록·'가수겸배우'·'이적 설득한 코케 부상'·'0-2 완패할 것' 예상 제목), 제안: 스코어 없는 같은 경기 기사를 전날 경기 데이터(두 팀 + 킥오프)로 확인되면 합치기(D49 ② 대안 — 토큰 0) · **M1-21 후속** 사전에 'Villa'·'Palace'·'Forest' 같은 짧은 별칭을 넣는다면 `AMBIGUOUS_TAG_TERMS` 등록 여부 결정, 선수 성 별칭(Kane·Saka 등) 정책(선수 태그 재현 6/26의 원인) · **M5-09** 운영 리포트에 제외·병합 건수 · **아이디어(제안만)** M2 순위 데이터가 생기면 팀→리그 표를 데이터에서 읽기, 지난 data/news(10-12~14) 카드 일괄 재분류 스크립트(화면 아카이브 품질용, 토큰 0)
- [x] M1-18 이적 추출 규칙 (FR-21·FR-100~103 입력, D23): 상태 키워드 표(언어별, 의문·부정형은 rumor), 선수·출발·행선지는 사전 매칭으로 확실할 때만, `tier` = 클러스터 최고 출처 Tier, `agreed` 이상 승격 조건(PRD F10 "정확도 한계") + 단위 테스트 — 2026-10-17 완료(worktree `m1-18`, 리뷰 1~4회차 반영 — 1회차 차단 2·중요 8 → D52, 2회차 차단 4(변형 242개 중 155개 통과) → **D54 재설계(높은 단계 = 닫힌 문형만)**, 3회차 차단 3·중요 7 → 오케스트레이터 결정 A~D, 4회차 차단 1·중요 2): `scripts/lib/transfer-extract.ts`·`transfer-patterns.ts`(순수 함수, LLM 없음 — D23) ① 높은 단계(negotiating 이상·결렬)는 언어별 닫힌 문형 44개(`STAGE_PATTERNS` — 앵커드 + 꼬리 슬롯(원자 묶음, 꼬리 출발 팀은 하나일 때만))에만, 문형 절 밖은 닫힌 목록 꼴만(라틴 무해한 꼬리 / 국내 등번호·이적료·계약 기간·N년 계약·메디컬·입단식·발표·오피셜·중립 감탄·HWG), 머리표('[오피셜]'·'Official:')는 첫 실질 절에만, 인용은 중립 감탄만 벗김, 부정·보도·출처 낱말·이모지·물음표·등위 팀·가정·게임 속 제목은 문형 없음 ② 결정 A — 합의·협상 꼴은 움직임 근거(from·금액·움직임 낱말 — 선수-구단 '사이' 꼴은 금액 제외)가 있을 때만, 그 꼴에만 맞고 rumor 표현이 없으면 주장 없음(재계약 오인 방지) · B — 계약 기간은 signs-form 꼴에서 재계약 단서, 계약 길이는 합류 동사(joins·ficha por)를 뺀 꼴에서만 · C — 'here we go' 제목은 agreed 상한(FR-103) · D — 국내 '영입 추진'은 rumor ③ rumor는 키워드를 그 선수에게 귀속할 때만(꾸밈 자리·닮은꼴·동료·등위 두 선수 제외), 방향은 문형 슬롯 또는 확실한 규칙만(팀 하나여도 — D52 ③, 사람 명사·지난 이적·여행·'deal/fee/talks for' 제외, 한국 선수 행선지 = 지금 소속이면 생략) ④ 승격 D52(official = 명시 표현 + Tier 2 이상 또는 매체 2곳, agreed 이상·결렬 = Tier 2 이상 또는 매체 2곳, 못 미치는 결렬은 버림), tier = 클러스터 최고 Tier ⑤ 태그: 같은 자리 긴 별칭, 다른 팀 표기 안 짧은 표기 버림, 'T행' 이적 배수(score.ts `transferTopic`), 문형에 맞는 제목은 이적 화제. 검증: fixtures + data 314제목 transfer 3건 손 판정 일치·오탐 0, 사전 확장 흉내 496제목 10건 방향·과대 0, 리뷰 하네스 1~4회차 오탐 시도 전부 차단(의도 판정 5건), 실제 RSS dry 오탐 0, 카테고리 diff 3건(산초 헤타페행 가능성 → 이적, 코케 부상 → 부상, '아틀레티코 이적하자마자 주연' → UCL — 모두 정당), 최악 35ms/제목·fuzz 4,000건 예외 0. 테스트 M1-18 몫 80건(전체 4,531). 스키마 변경 없음
  - 🆕 M1-18 이월 메모: **M4-01·/add-player** 해외 선수의 지금 소속을 configs에 두면(스키마 변경 — 사용자 확인) 결정 A·B로 잃은 재현율 회복(재계약 = 행선지가 지금 소속이면 생략), 같은 날 재실행에서 붙인 출처로 transfer를 다시 판정하지 않음, 결렬 뒤 재개 규칙·FR-103 Tier 1 가중 미구현, 국내 매체 여럿이 같은 해외 원보도를 전달하면 매체 2곳으로 셈(원보도 단위 집계 검토) · **M1-43·M4-01** 높은 단계 재현율은 실제 피드 제목을 보고 `STAGE_PATTERNS`·목록 꼴 보강으로만(추측으로 넓히지 않음 — fee 움직임 낱말 여부, 'in shock transfer' 꼬리, 'T행' 문형, 두 팀 'T1→T2' 문형, 'joins … until'), `classifiedMix.transfer·transferTo·transferFrom` 기록으로 단계별 건수 관찰 · **M1-17 후속(카테고리)** 'joins'·'medical'·움직임 근거 없는 합의 꼴은 transfer 없이 카테고리만 이적으로 남음('joins … injury list', 재계약 기사), 'leaves'·'eye'·'al'은 화제 표 밖 · **/add-name** 성 별칭(Sancho·Rashford·카르바할·알바레스)·'인터밀란' 같은 붙여 쓴 팀 표기가 재현율을 정함 · **/add-player·FR-63** korean-players `team`이 늦게 갱신되면 '지금 소속 = 행선지 → 생략'이 새 이적을 놓침 · **D2·M1-31** 화면에 transfer를 보일지는 디자인 게이트

### M1-C 데이터 브리핑 — LLM (FR-22~29, D24)
> 일일 LLM 호출 #1 — 일반 Messages API 단건(D28). 입력은 정형 데이터만, 기사 텍스트 금지. 데이터 API 약관이 LLM 입력을 막으면(B7) 코드 템플릿 브리핑만 운영하고 ❓ 사용자 확인.
- [x] M1-19 브리핑 입력 빌더 + 코드 템플릿 문장 (D24): M1-44 데이터(결과·순위) + M1-48 데이터(득점자, D27 — 실패·강등 시 득점자 없이) → 정형 JSON(전날 KST 창 경기 결과·득점자·현재 순위, 짧은 키, 중요도 순 상한), 경기가 없으면 호출 생략. 같은 입력으로 템플릿 문장 생성기(폴백·강등·예산 초과 공용, 결정적, `ai:false`). 순위 변동은 M2-03, 한국 선수 출전은 M3-03 이후 입력에 추가. ~~❓ 브리핑 저장 스키마(PRD §8.2 초안) 사용자 확인~~ → 2026-10-15 사용자 결정(PRD §15 D38): `data/briefs/YYYY-MM-DD.json` + `mode`(llm·mixed·template·empty) → 부록 A — 2026-10-16 완료(M1-15·M1-16과 병렬 — worktree 브랜치 `m1-19` → main 병합): ① 입력 창 = **UTC 하루 D-1 = KST [D-1 09:00, D 09:00)**(유럽 현지 '어제' — KST 달력 하루로 자르면 유럽 저녁 경기가 다음 날로 밀림), 입력 = 중요도 순(한국 선수 소속팀 +3·UCL +3·빅클럽 팀당 +2·리그 기본 EPL 2/라리가·세리에·분데스 1·상위 4위 맞대결 +1·5골 이상 또는 3골 차 +1, 같은 점수면 킥오프 → id) 상한 30 + 확정 순위표 상위 4위(`standings` — 공동 순위는 같은 순위 팀 모두·응답 순서 유지, `inProgress > 0`·여러 표 대회 제외, id `sPL` 등·`note`) + 연장·승부차기(`aet`·`regular`·`pens`) — M1-44 이월 ② 득점자 = 이번 실행 상세 + 원장(`data/matches`) 같은 창 항목(`ledgerMatchToDetail`·`mergeBriefDetails`·`briefGoalsOf` 재사용 — 백업 실행·API-Football 키 없음에서도 득점자, M1-48 이월), API-Football 단계가 돌지 않은 실행은 D37 자동 연결 끔(대응표 매칭만) ③ `scripts/lib/brief-template.ts` 템플릿 생성기 — 결정적·`ai:false`·줄마다 refs, 입력에서 계산되는 서술만(결승골·PK 결승골·동점골·해트트릭(자책 제외)·역전승(전반 또는 완전한 득점 순서로 뒤진 적 확인)·n골 차(3골 이상)·연장 끝에·승부차기, 득점 목록이 불완전하거나 스코어와 안 맞으면 득점자 서술 안 함), 순위 줄 '1위 X(승점 n), 2위 Y… 순이다'(변동 서술 없음 — D40 ③), 60자 목표·80자 상한·절단 없음, football-data만으로 5줄(M1-47 이월), 이름 뒤 가변 조사 없음. **문형은 D45 ④에 따라 M1-21에서 자연 문장(주어 팀 점수 먼저)으로 교체** ④ `data/briefs/YYYY-MM-DD.json` 게시(D38, 부록 A 16 `BriefFileSchema` — 레지스트리 등록, mode↔줄 일관성): M1-45 전에는 LLM이 성공해도 **검증 안 된 LLM 줄은 저장하지 않고 템플릿만**(테스트 고정 — LLM 출력은 로그·dry 출력만), 경기 없음 `empty`, 정형 입력 없음(football-data 키 없음·실패) 파일 없음, 예산 초과 등은 템플릿(M1-22 이월). 같은 날 재실행: llm·mixed는 LLM 없이 유지, 줄 있는 template은 llm·mixed 또는 줄이 더 많은 template으로만 갱신(공개 뒤 내용이 바뀌거나 줄지 않게), empty는 줄 있는 결과로 갱신, 같은 내용은 안 씀, 쓰기 실패·깨진 파일은 `partial`로 뉴스 발행 계속 ⑤ LLM 입력에 순위표가 들어가 하루 약 +530토큰(약 $0.00005) — 호출 수·`max_tokens`·thinking·모델·경기 상한 불변, 입력 어림 여유(약 +18%) 유지 확인. 질문 확정(2026-10-16): 파생 서술(입력에서 계산되는 사실)은 유지, 중요도 가중치는 관찰 주간(M1-43)에 조정, `data/briefs` 무기한 보존(D45 ③). 테스트 +65 이상(3,408+). 리뷰(code-reviewer) 차단 0·중요 0, 권장 반영(원장만 실행의 자동 연결 끔, 늦은 재실행 template 보호, '연장 끝에 비겼다', fixture 문장 D30, collect.yml 주석)
  - 🆕 M1-19 이월 메모: **M1-45** `planBriefPublish`의 done → template(unverified)을 검증 통과 줄(llm·mixed)로 교체, 줄 강등은 `templateLineForRefs(input, refs, ctx)`(null이면 그 줄 버림 — 같은 근거 줄 중복은 호출부가 거름), `BriefStageRun.input` = 보낸 입력, kept 사전 판정은 이미 예산 판정 앞, runs.json `summarized`·`downgraded`는 **게시 줄 기준**(지금은 LLM 응답 줄 수를 셈) · **M1-21** `briefTemplateNames` resolver 교체(별칭 + 데이터 API 이름 미등록 적재), football-data 짧은 이름(Bayern·Man City·Barça·Brighton Hove·HSV 등) 별칭 필요(D39 ②), 템플릿에 영문·한글 혼재(‘프리미어리그 Arsenal 2-1 Leeds United’) — 한 브리핑 안에서 대회 표기('EPL'/'프리미어리그')도 통일, **D45 ④ 템플릿 문형을 자연 문장(주어 팀 점수 먼저)으로 교체**(조사 보정 헬퍼 사용) · **M1-20** 지시문에 `aet`·`regular`·`pens`·`standings.note` 설명(승부차기 경기 `ft` 1-1을 무승부로 쓰지 않게), prev 없음 → '~위다', 앞쪽(중요) 경기 우선 · **M1-23** 허용 숫자에 regular·pens, 승부차기 '(h-a)' 표기 인식, 승부차기 경기의 '비겼다' 서술 검사 · **M1-24** 골든셋은 확정 빌더 출력으로 다시 만들 것(M0 입력은 킥오프 순·note 다름) · **M1-32** `data/briefs` 읽기 — empty는 블록 높이만 줄임(D30), 파일 없음은 오류·빈 상태, `ai:true`에만 라벨 · **M2-03** 순위 행에 `prev`를 더하면 순위 변동 서술 가능(D40 ③) · **M2** `NEUTRAL_ROUNDS`의 결승 matchday null 가정을 실응답으로 확인 · **M3-03** `korean` 블록과 한국 선수 템플릿 문형 · **아이디어(제안만)** 순위 줄에 '2위와 승점 n 차'(D40 ② 허용 파생 숫자), 중요도 판정 근거 로그(M1-41 관찰용) — 모두 토큰 0
- [x] M1-20 `configs/prompts/summarize.md` v0.1(파일명 유지 = 일일 브리핑 프롬프트) + 출력 zod 스키마 — 뉴스체(`~했다`), 최대 5줄·줄당 60자 내외, 입력에 없는 사실 금지, 고유명사는 영문 유지, 짧은 키 JSON(줄마다 근거 경기 ID), `max_tokens` 4,096·thinking 적응형 + `effort:"medium"` 명시(D28). 출발점은 M0-30 임시 프롬프트·출력 스키마. **스코어 표기 순서**(D0-06 사용자 확정 — PRD §15 D30): M0-30·M0-34 출력이 원정 승리를 '원정에서 1-2로 이겼다'처럼 홈-원정 순서로 써 한국어 독자에게 어색하다 → '이겼다/졌다' 문장은 주어 팀 점수를 먼저 쓰는 규칙을 지시문에 넣고 M1-23 스코어 대조가 두 순서를 모두 인식하게 한다(템플릿 문장은 ~~'홈 h-a 원정' 고정~~ → D45 ④로 주어 팀 점수 먼저 자연 문장, M1-21). 💰 dev 소량 실행으로 길이·문체 확인 (FR-22, FR-23) — 2026-10-17 **구현 완료·main 병합, 💰 dev 실측 대기**(LLM DoD — M1-24 골든셋 실행에서 경기 많은 날 포함 `output_tokens`·thinking·비용 확인 후 체크): ① `configs/prompts/summarize.md` v0.1(약 4,300자 · 약 4,130토큰 어림 — **지시문 증가 +약 2,100토큰/요청(≈ +$0.00021, 월 약 +$0.006) 사용자 승인**, 하루 예산 판정 최악값 약 $0.0058 = 예산의 6%) — 입력 키 설명(ft·ht·regular·pens 홈-원정, aet, goals type·null, standings note·prev, korean 없으면 언급 금지), 사실(흐름·평가 금지, 평가 어휘는 '완파'(3골 차)·'역전승'만 — '대파'·'신승' 없음, 파생 숫자는 그 줄 r 항목 두 숫자의 차·합만 — D40 ②, 세는 숫자는 한 선수의 골 수뿐, 결승골·동점골 정의(자책골이면 득점자 이름으로 쓰지 않음)), 순위(prev 없으면 '~위다·~위를 달린다' — D40 ③, note에 적힌 범위만), 연장·승부차기(승자 = 승부차기·'비겼다' 금지, ft가 동점이 아니면 '…의 경기는 h-a로 끝났고 승부차기에서…', 이긴 팀이 90분에 앞섰거나 90분 점수가 없는 연장 경기는 '…의 경기는 연장까지 h-a로 끝났다' — 합계 미기재), 표기(영문 그대로·줄이지 않기, round는 결승·4강·8강·16강·플레이오프만, 주어 팀 점수 먼저 — D30, '승점 n'), 문체(뉴스체·한 줄 한 문장·사실 둘까지·쉼표로 절을 잇지 않음·60자 안팎·80자 초과 버림·번역투·과장·같은 문형 반복 피하기), 한국 선수·앞쪽 경기 우선, 자리표시자 예문, 쓰기 전 확인. 호출 설정 불변(D28 — 단건·max_tokens 4,096·thinking 적응형·effort medium·캐싱 끔) ② 출력 스키마 확정 `{l:[{t,r}]}`(strict, r 1~6·줄 안 중복 합침) + 관용 파싱(D40 ⑤ — 출력 전체를 감싼 코드블록만 벗김·앞 5줄·치환 뒤 80자 초과는 `briefLinesOverLimit` 표시, 강등은 M1-45), `loadBriefPrompt`(M1-01 이월), 로그에 지시문 판 id·fenced·droppedLines·overLimitLines ③ brief-cases D40 확정(json-fenced ok·too-many-lines ok·line-over-schema downgrade-line:1·max-tokens retry·refusal downgrade-all, 미정 줄 4개 → 미정 0) ④ 템플릿 연장 문형도 같은 사실 문형으로(M1-21 템플릿 갱신). 사용자 결정(2026-10-17): 파생 서술은 정의대로 허용 + 검사기 검증, 사실 선계산(승자·결승골 등 코드 계산값을 입력에 추가 — 에이전트 제안)은 M1-24 회귀로 효과 확인 후 결정. 테스트 3,604 → 3,618. 리뷰(code-reviewer) 차단 0, 중요 4(dev 실측 → M1-24, 파생 서술 범위·토큰 증가 → 사용자 결정, M1-21 이월 대조) 반영 — 2026-10-17 dev 실측(M1-24): v0.1 출력 711~3,112토큰(thinking 약 90%)·입력 4.3K~8.5K·요청당 평균 $0.00164, 바쁜 날 반복 1건 4,096 잘림 → D51(LLM 입력 15경기), v0.2(D50 [문형]) + D51 골든셋은 사실 오류 0/40·강등 0/40이지만 3,500 초과 3건·4경기 날 잘림 1건 → **D53 사용자 결정: `max_tokens` 8,192 + 지시문 [문형] 축소** — 반영·재측정 뒤 체크 — 2026-10-17 진행: D53 ①(8,192) 반영, [문형] 축소는 v0.3(thinking +73%) → D55 v0.4(입력에 없는 키 꼴 삭제·주어 팀 점수 먼저) → **v0.4 골든 9/10일 실측(멈춤 기준 = 잘림만, 6,000은 경고 — 사용자 결정): 잘림 0/9(8,192), 출력 1,068~6,729(평균 3,907, thinking 94%), 통과 38/39줄·사실 오류 0, 지연 5.2~28.7s, 9일 $0.022417(v0.2 대비 thinking +47%·비용 +32%)**, 남은 4요청(10-15 + 반복 10-10·10-11·10-17, 최악 약 $0.0195)은 일 예산 소진으로 2026-10-18 00:00 KST 이후 — 2026-10-18 **실측 마감·완료**(💰 남은 4요청 00:02~00:04 KST, $0.012532): 지시문 v0.4 골든 10일 + 긴 날 반복 3회 = **13요청 잘림 0/13**(상한 8,192), 출력 평균 4,271·최대 6,729(상한의 82%, 6,000 초과 경고 2건), thinking 94%, 같은 날 반복 편차 최대 36%(약 2,000토큰 — 10-17 4,636 → 6,649), 통과 줄 58/59·**사실 오류 0**(강등 1은 문형 밖 앞 수식), 지연 평균 18.4s·최대 29.0s(브리핑 마감 안), 13요청 $0.034949(요청당 평균 $0.0027), v0.2 10일 대비 thinking +46%·비용 +31%. D53(8,192)·D55(v0.4) 설정 유지, PRD §9.3 확정. 이번 달 누적 prod $0.008137 + dev $0.119468 = $0.127605(월 예산 4.3%)
  - 🆕 M1-20 이월 메모: **M1-43** 잘림까지 남은 가장 작은 여유(1,463토큰)가 같은 날 반복 편차(최대 약 2,000토큰)보다 작다 — 관찰 주간 prod `runs.json`의 브리핑 출력 토큰·잘림·FR-29 재시도 빈도와 `eval.output-over-alert`(6,000 초과) 빈도를 지표로, 잘림이 나오면 지시문 규칙 원인 실험(10-10 변형 — 규칙 문장/[문형] 교차)부터
  - 🆕 M1-20 이월 메모: **M1-23** 검사 목록 — '완파' ⇒ 점수 차 3+, '해트트릭'·'n골' ⇒ 그 선수 goals 항목 수(자책골 제외, '후반 4골' 같은 팀·시간대별 수 불허), '결승골' ⇒ 이긴 팀의 (진 팀 점수+1)번째 골이고 자책골 아님, '동점골' ⇒ 비긴 경기의 마지막 골이고 자책골 아님, '역전승' ⇒ ht 또는 득점 순서, round 낱말 ⇒ 근거 경기 round 값(FINAL·SEMI_FINALS·QUARTER_FINALS·LAST_16·PLAYOFFS), '홈에서'·'원정에서' ⇒ 주어 팀, 'PK'·'90+2분' 허용 토큰, 문장 안 줄바꿈 줄 강등(저장 스키마가 거부), '연장 끝에' ⇒ regular가 있고 이긴 팀이 90분에 앞서지 않음, 쉼표로 절을 이은 줄·사실 셋 이상 줄은 문체 위반 후보, 목록 밖 평가 어휘('대파'·'신승')는 강등 후보 · **M1-24** v0.1 실측에 경기 많은 날(입력 E, 23경기) 포함 — M0-34 바쁜 날 출력 3,231토큰(thinking 2,842)으로 상한 4,096 여유 약 21%뿐 → `output_tokens`가 3,500을 넘으면 지시문 축소 또는 사용자에게 `max_tokens` 질문(D28), 사실 선계산 효과도 이 회귀로, 실측 뒤 M1-20 체크·PRD §9.3 입력 범위('1.4K~5K' → 바쁜 날 약 8K) 갱신 · **M1-45** M1-20 실측·M1-24 기준선 뒤 착수(순서 M1-23 → M1-24 → M1-45), 사전(names.ko)을 못 읽었을 때 80자 판정 경로 결정
- [x] M1-45 🆕 💰 브리핑 실행 (D28): **일반 Messages API 단건**(`llm.ts` `callSingle`, 하루 1~3요청 — 배치 아님). thinking 적응형 기본 + `effort:"medium"` 명시, `max_tokens` ~~4,096~~ → ~~8,192(D53)~~ → 16,384(D57), 지시문 캐싱(`cacheSystem`)은 같은 지시문으로 요청 2개 이상일 때만(B3 미발동). 브리핑 마감(공개 목표 −10분 — 여름 06:50·겨울 07:20, M1-47 슬롯 함수, D26)까지만 시도: 요청 타임아웃과 재시도(429·5xx만 — `llm.ts` 정책) 대기를 마감 안으로 제한하고, 마감까지 성공하지 못하면 템플릿 게시. 검증(FR-29): zod → 코드 검증(M1-23) → 출력 전체가 실패하면 1회 재시도(zod 실패와 합쳐 1회) → 템플릿 강등, 줄 단위 불일치는 그 줄만 템플릿, 길이 재검증(치환 뒤 80자 초과 줄은 템플릿 강등 — 절단 안 함, D40 ⑤). `llm.ts` 머리말의 낡은 주석(06:50 폴백 = 배치 취소, `callSingle`은 그 경로에서 쓰지 않음) 정리. M0-36 확인: ① `deadline`은 재시도 대기만 제한하고 요청 타임아웃(60초 고정)은 제한하지 않음 → 남은 시간으로 요청 타임아웃을 잡는다 ② 연결 오류 결과의 `retryable` 힌트가 true(`isRetryableErrorType`)라 재시도 금지 정책과 어긋남 → 힌트를 false로 고치거나 무시(중복 과금 방지) ③ ~~❓ max_tokens·refusal 처리~~ → 2026-10-15 사용자 결정(PRD §15 D40 ①): max_tokens = 출력 전체 실패 → 1회 재시도 안에서, refusal = 바로 템플릿. 실행 기록(`runs.json`)은 줄 검증·강등 **뒤에** 써서 `summarized`·`downgraded`를 채운다(M0-34 dev 기록은 검증 전에 써서 0으로 남음) (FR-25, FR-26, FR-29) — 2026-10-17 완료(worktree `m1-45` → main 병합 a03e10a, **실호출 확인 22:00 KST — D48 ④ Actions 수동 실행 `collect-prod-20261017T125647Z-8161`: 첫 실제 게시 mode llm·AI 줄 5/5·강등 0·`brief.requests` 1·입력 5,791/출력 6,069토큰·$0.003614·status success**, 수집 470·카드 45·football-data 5·API-Football 15회 — 정기 schedule은 `COLLECT_ENABLED` 꺼짐으로 10-15부터 판단 단계에서 skip 중(M1-40에서 켬)): ① 시도 루프 — `judgeBriefResponse(…, { finalAttempt, hiddenRefs: briefLlmInput(input).hiddenRefs })`, `retry`(zod·출력 전체·max_tokens)면 같은 요청을 `brief-<날짜>-r1`로 1회(BRIEF_MAX_ATTEMPTS 2), refusal·전송 실패·검사기 오류는 재시도 없이 템플릿(D40 ①), 판정이 없거나 예외면 LLM 줄은 절대 게시하지 않음 ② 게시 — `scripts/lib/brief-publish.ts` `composeVerifiedBrief`: 통과 줄 = 검사기 치환 뒤 문장(ai:true, 모델 r) + BriefLineSchema 방어선, 강등 줄 = 전체 입력 `templateLineForRefs`(D51), 같은 근거 중복 규칙 ⓐ `duplicate-template`(앞 템플릿 줄과 겹침) ⓑ `duplicate-result`(같은 경기 결과 문형 통과 줄) ⓑ' `duplicate-rank`(같은 순위표 순위 문형 통과 줄) ⓒ `duplicate-ai-result`(같은 경기 결과 통과 줄 둘이면 뒤 줄) — 득점·도움 통과 줄과만 겹치면 템플릿 결과 줄 유지, 5줄 상한, mode llm·mixed, 통과 줄 0이면 전체 템플릿(`all-lines-downgraded`), 템플릿 이유 11종 ③ 마감 — 예산 판정 뒤 남은 시간 < 40초(`BRIEF_LLM_MIN_ATTEMPT_MS` — 출력 상한 8,192 ≈ 36초, 슬롯 판정 `SLOT_LLM_MIN_MS` 30초·D41 3분 창과 분리)면 호출 생략, `callSingle` 상대 예산 `budgetMs` + 요청별 타임아웃 min(60초, 남은 시간) + `AbortSignal.timeout`(응답 본문 읽기까지 묶음 — SDK 0.133 타이머는 헤더에서 해제), 429·5xx 재시도는 대기 + 40초 ≤ 남은 시간일 때만, 연결 오류 `retryable` 힌트 false(M0-36 ②), 마감에 걸린 끊김은 `deadlineCut`(1초 여유) → LLM 단계가 구조적으로 마감 안(겨울 정시 최악 07:20:00 이하, 여름 06:44 무렵) ④ D56 날짜당 요청 상한 3 — `RunLog.brief.requests`(보낸 요청 수: FR-29 재시도 1건, 429·5xx·마감 미전송 제외) 같은 env·KST 날짜 합, 남은 몫으로 시도 수 제한(`daily-cap` 템플릿 — success·이슈 없음), `unbilledRisk`(연결 오류·타임아웃 추정 최대 비용 — costUsd와 분리, 가드 미포함), eval 기록은 상한 밖 ⑤ 사전(names.ko) 실패 → LLM 없이 영문 이름 템플릿·partial·이슈 brief, 마감 강등은 partial·이슈 없음, mock이 쓴 llm·mixed는 kept 제외 + 경고 ⑥ runs summarized·downgraded = 게시 줄 기준 ⑦ 로그 `summarize.brief.attempt`·`retry`·`retry.skip`·`daily-cap`·`unbilled-risk`·`done`(publishedAi·publishedTemplate·droppedOutputLines·grammar 분포)·`publish` ⑧ 입력 일치 합성 mock `slice-2026-10-11-llm·mixed`. 리뷰(code-reviewer) 차단 1(병합 순서 — 검사기 4회차 3c44e4d 먼저 병합으로 해소)·중요 2(순위 중복·본문 타임아웃)·권장 7 반영. 테스트 4,556 → 4,621
  - 🆕 M1-45 이월 메모: **M1-32** 2026-10-18 아침부터 `data/briefs`에 llm·mixed가 쌓인다(지금 UI는 이 폴더를 읽지 않음) — ai:true 줄에만 'AI 작성' 라벨(FR-35), mixed는 줄마다 · **M1-41** 관찰: `summarize.brief.skip reason deadline`·`retry.skip`·`daily-cap`, `llm.single.done` timeoutMs(60000 미만 = 마감으로 줄인 요청), partial 중 brief-deadline 비율, `unbilled-risk` 빈도 · **M1-43** `summarize.brief.done` publishedAi·publishedTemplate·droppedOutputLines·grammar 분포, 중복 버림 사유별 빈도 · **M1-26·M1-41** LLM 단계 최악 = 브리핑 마감 → 시간 예산(여름 06:43~06:45·겨울 07:23~07:26) 약 1분 줄여 재계산 · **M5-09** 운영 리포트에 브리핑 mode 분포(템플릿 이유별)·시도 수·`brief.requests`·`unbilledRisk` 합 · **M1-23 후속** `brief.ts` 머리말의 낡은 주석('출력은 로그로만… M1-45')은 검사기 지문 파일(CHECKER_FIXED_FILES)이라 다음 검사기 변경 커밋에 같이 · eval 기록 runId 접두사 `eval-`가 daily-cap 합산 제외 기준 — eval 쪽 runId 규칙을 바꾸면 함께
- [x] M1-21 고유명사 치환(브리핑 출력) + 태그 한글 표시 + 치환 뒤 조사 보정(받침 기준 이/가·은/는·을/를·과/와·으로/로 — M0-30) + `unknown-names.json` 적재(데이터 API 이름·브리핑 출력). 브리핑 입력의 선수 표기를 `names.ko.json` 키와 같게 맞춘다(모델 축약 방지 — M0-30). `names.ko.json` 초기 사전(빅클럽·주요 선수·감독 + 원제목에 자주 나오는 이름 — M1-17 매칭에도 씀) (FR-24). ~~❓ 표기 확정~~ → 2026-10-15 사용자 결정(PRD §15 D39 ②): KFA 기준 `configs/names.ko.json`으로 통일 — 'Bayern' → 바이에른 뮌헨, Brentford → 브렌트포드 (M0-36 `fixtures/llm/brief-inputs/names-ko.tmp.json`이 초기 사전 후보) — 2026-10-17 완료(병렬 — worktree 브랜치 `m1-21` → main 병합): ① `scripts/lib/names.ts` 치환 — 접기(대소문자·악센트, 길이 보존)·긴 이름 먼저·단어 경계·별칭, 보호 구(Inter Miami·Juve Stabia·Real Madrid Castilla 등)는 그대로, 치환 뒤 붙은 조사를 받침 기준으로 보정(`josa.ts` — 이/가·은/는·을/를·과/와·으로/로(ㄹ 예외)·서술격 21형, 숫자 끝 0=받침·1·7·8=ㄹ, 라틴 약어는 글자 이름, 정해진 형태만 고침 — '토트넘다운' 보존), 대회 이름은 브리핑 단위 표기. 브리핑 입력의 득점자·도움을 사전 대표 표기로(`canonicalizeBriefInput` — 모델 축약 방지, M0-30), 첫 글자 축약 별칭('H. Kane' 등)은 치환에 쓰지 않고 입력 정리에서 소속팀이 확인될 때만(`KNOWN_PLAYER_TEAMS` 코드 표 — 이적하면 영문 그대로 남는 안전한 방향), football-data 짧은 이름 별칭(Bayern·Man City·Barça·HSV·M'gladbach — D39 ②). LLM 출력은 치환·조사 보정 뒤 문장을 출력에만(저장 M1-45) ② `data/cache/unknown-names.json` 적재(`unknown-names.ts`, 부록 A 12 그대로) — 데이터 API 이름 + 치환 구간을 가린 출력(`masked`)에서 남은 이름, 실행당 이름 1회, 사전·ignore 등록 시 다음 실행이 제거, **prod·비dry만 쓰기** ③ `configs/names.ko.json` 18 → **185항목**(팀 110·선수 62·감독 13, 항목마다 근거 note — KFA 명단·한국어 위키백과 문서명·국내 매체 RSS 제목), **D46 사용자 확정**(표기가 갈린 31개 추천안 — 인테르·브라이턴·에버턴·애스턴 빌라·홀란·팔머·조제 무리뉴 등, 클럽 브뤼헤 예외, Viking FK·Sabah FK 보류, KFA 통칭 정책, 5대 리그 밖 **한국** 선수 제외 — 손흥민 미등록, 등록 선수 홍현석(`active:false`)은 FR-64에 따라 유지, 외국 선수(그리즈만·산초 등)는 D46 대상이 아니라 유지), slug는 team-ids.json 또는 M0-32 규칙, BIG_CLUBS 16곳 전부 합류(`milan` → `ac-milan`), news-sample 태그 slug 정리(ac-milan·ssc-napoli·us-sassuolo-calcio — 카드 id 불변) ④ 태그 한글 표시 `src/lib/data/names.ts`(빌드 시 서버 전용 — 사전을 번들에 싣지 않음, M1-31이 씀) ⑤ **D45 ④ 템플릿 문형 교체** — 주어 팀 점수 먼저 자연 문장('아스널이 프리미어리그 홈경기에서 리즈 유나이티드를 2-1로 꺾었다'·원정에서·완파(3골 차)·역전승·동점골 팀 주어·순위 '도르트문트가 승점 13으로 분데스리가 선두, 바이에른 뮌헨이 승점 11로 2위다'), **승부차기 승자는 늘 승부차기 결과**(경기 점수가 동점이 아니면 '…의 경기는 1-0으로 끝났고 승부차기에서 …가 4-3으로 이겼다' — 합계 미기재, 승부차기를 '비겼다'로 쓰지 않음), '연장 끝에'는 90분 점수가 동점·열세일 때만, 조사를 붙인 뒤 60자 목표·80자 상한·절단 없음, 브리핑 단위 대회 표기(nameKo 기본). 7일치 입력 재확인: 템플릿 영문 팀명은 보류 중인 Sabah FK 1건뿐, 남은 영문은 미등록 선수(unknown-names 적재) ⑥ M1-23용 `briefNameAllowlist`. LLM 호출·스키마·토큰 불변. 테스트 3,410 → 3,468. 리뷰(code-reviewer) 차단 1(승부차기 승자 역전 — 해소)·중요 4(Inter Milan 오치환·한글 표기 속 라틴 미등록 적재·연장 문형 오해·영문 혼재 → D46) 반영, 권장 반영
  - 🆕 M1-21 이월 메모: **M1-45** LLM 줄은 `substituteNames(line.t, names, {competitionLabel})`로 치환, 대회 표기는 같은 입력의 `chooseBriefCompForm(input, ctx)`로 정해 템플릿 강등(`templateLineForRefs` — ctx.compForm)과 맞춤, 80자 검사는 치환 뒤, runs `summarized`도 치환 뒤 게시 줄 기준, 미등록 후보는 `substituteNames(...).masked`에서, `BriefStageRun.names`·`outputNames` 이미 있음 · **M1-23** 허용 목록은 입력 정리를 거친 입력으로 `briefNameAllowlist(input, names, competitions)`, 사전 별칭 짧은 이름('Lens'·'Bayern')은 이제 허용·치환되므로 `brief-cases.json`의 `brief-case-short-name-team`(Lens) 기대값 재정의, 성만 쓴 'Olise'는 여전히 미등록, D40 ④ 한글 고유명사 판정은 사전 `ko` 집합 + 입력 대상 확인(모델 음역 '유니온 베를린' ≠ 사전 '우니온 베를린' → 강등), 소속팀을 확인 못 한 축약 이름은 대표 표기 불허 · **M1-17** names.ko 별칭에 일반어·도시명과 겹치는 짧은 이름(Nice·Lens·Como·Angers·Athletic·Roma·Milan·Valencia·Sevilla·Porto 등 — 악센트 접기로 스페인어 'cómo'가 'Como'에 맞음) → 원제목 태그 매칭에는 별도 제외·신뢰 규칙, 카드 태그 slug = 사전 slug(`labelTags`는 모르는 slug를 숨김) · **M1-31** 서버 컴포넌트에서 `loadTagLabels()` + `labelTags(card.teams, "team", labels)`, 고른 문자열만 클라이언트 섬에 · **M1-24** 골든셋 입력은 `canonicalizeBriefInput`을 거친 빌더 출력 · **M1-29** `/add-name`은 `unknown-names.json`(kind·count)을 읽고 반영 이름은 다음 prod 실행이 자동 제거, 후보 근거로 위키 문서명 조회(en.wikipedia langlinks) · **M2-04** 규칙 slug 중 어색한 것(`real-betis-balompie`·`stade-rennais-fc-1901`·`bologna-fc-1909`·`fk-bodo-glimt`·`brugge-kv`·`rcd-espanyol-de-barcelona`) 팀 페이지 URL 전 확정, `team-ids.json`은 51팀뿐(6개 대회 111팀) · **M1-20** 지시문에 '입력 영문 표기를 줄이지 말 것', plan M1-20 줄의 '템플릿 문장은 홈 h-a 원정 고정'은 D45 ④로 낡음 · **M2** 승부차기 합산 점수가 입력에 들어오면 '합계 n-n 뒤 승부차기' 문형 가능 · **M1-29·/new-season** `KNOWN_PLAYER_TEAMS`(축약 별칭 소속팀 코드 표)는 시즌마다 점검(`.claude/commands/new-season.md`에 항목 추가), `/add-name`으로 'X. 성' 축약 후보를 넣으면 치환되지 않는다는 안내 · **참고** 'FC Bayern München II'처럼 보호 구 앞에 접두가 붙으면 막지 못함(6개 대회 밖 2군 — 영향 작음), `brief-input.ts`는 승부차기 경기면 늘 `aet:true`(연장 없이 바로 승부차기하는 대회가 들어오면 `extraTime` 유무로 판정), 감독 축약 별칭 'D. Simeone'·'V. Kompany'는 쓰이는 곳 없음 · **아이디어(제안만)** 별칭 신뢰 등급 분리(`en` vs 브리핑 전용 `enShort` — 스키마 변경, 대안 M1-17 코드 상수 제외 목록), `/add-name` 보조 스크립트(unknown-names 상위 이름에 한국어 위키 문서명 후보를 붙임, 토큰 0)
- [x] M1-22 비용 가드: 일 $0.10 / 월 $3, dev+prod 합산, 실행 전 예상 비용 출력, 초과 예상 시 템플릿 브리핑, dev 사용이 월 예산 50% 초과 시 알림 (FR-27, CLAUDE §6.3) — 2026-10-16 완료(M1-14와 병렬 — worktree 브랜치 `m1-22` → main 병합): ① 판정은 넉넉한 예상 — 요청마다 입력 어림(실측 대비 약 +19%) + `max_tokens` 4,096을 `BRIEF_MAX_ATTEMPTS` 2(첫 호출 + FR-29 재시도)번, 단건 정가, 캐싱 켠 지시문은 매번 캐시 쓰기, 장문 단가는 요청별(fixture 입력 기준 약 $0.0046~0.0057 — 일 예산의 약 5%, 실측 약 $0.001~0.002) → 재시도 직전 재판정 불필요 ② 집계 칸은 실행 시작(startedAt) KST 날짜·달 — 실행 기록 귀속과 같은 칸이라 자정을 넘긴 실행도 시작한 날 예산(이전 코드는 판정 시점 `now`라 어긋남). **월 prod+dev 합산, 일은 봇(prod) 실행이면 prod만·dev 실행이면 합산(M0-21 유지 — PRD §15 D43, FR-27·CLAUDE §6.3 문구 정정)**, 예산과 정확히 같으면 허용 ③ runs 파일 없음은 사용 0, 손상·I/O 오류·잘못된 값(CostError)은 판정 불가로 LLM 생략(fail-closed, `runs_unreadable`, 실행 상태 partial — Actions에서는 runs-dev 손상이면 다음 validate가 실패해 커밋되지 않고 runs.json 손상이면 기록 단계가 exit 1) ④ 브리핑 결과 `skipped`·reason `budget`·`budget:{verdict(daily_exceeded·monthly_exceeded·runs_unreadable), estimatedUsd, message}`, 로그 `summarize.brief.budget`·`summarize.brief.skip`, prod 차단 시 Actions 경고 주석 ⑤ 실행 시작 `cost.month.usage` 로그, dev 50% 초과 시 dev는 눈에 띄는 여러 줄 출력·prod는 경고 로그 + Actions 주석(이슈 없음 — dev 사용은 로컬 실행으로만 늘고 그때 같은 사람에게 보임) ⑥ `scripts/lib/budget-guard.ts` 신설, `cost.ts`에 `assessDevUsage`·`formatDevAlert`·`tryLoadRuns`. **템플릿 게시는 M1-19가 이 결과를 받아 처리**(아래 이월 메모 — 지금은 브리핑을 아직 게시하지 않아 사용자에게 보이는 퇴행 없음). 리뷰(code-reviewer) 차단 0, 중요 2(병합 시 테스트의 `SLICE_DEFAULT_LIMIT` 제거 대응·템플릿 연결 이월) 반영, 권장 반영(주석 정확화, CostError → 판정 불가)
  - 🆕 M1-22 이월 메모: **M1-19** `brief.state === "skipped" && reason === "budget"`(verdict 셋 다)이면 같은 입력으로 템플릿 게시(`mode: template`, `ai:false` — D38) · **M1-45** FR-29 재시도 루프는 `BRIEF_MAX_ATTEMPTS`(2)를 넘지 않음(넘으면 가드의 예상이 무효), 요청을 나누면(하루 1~3요청) 모든 요청을 `guardBriefBudget({requests})`에 넘김, 예산 판정은 `BRIEF_LLM_MIN_ATTEMPT_MS` 확인보다 먼저, 예산 생략 실행의 `downgraded` 기록 · **M1-24** eval:prompt는 dev 실행이라 일일 판정에 prod 사용분이 합산됨 → `guardBriefBudget({env:"dev", requests: 골든셋 전체, attempts: 1})` 권장(20요청 예상 약 $0.05, attempts 2면 약 $0.094로 그날 prod와 합쳐 막힐 수 있음), `noticeMonthlyUsage`(dev 50% 알림)도 함께 붙일 것 · **M1-27** `runs_unreadable`(partial) 실행은 기록 파일 수리가 필요한 상태 · **M3-07·M4-06** 주간 배치는 별도 예상(배치 50%)과 `tryLoadRuns` fail-closed 경로를 쓸 것(`checkBudgetFromFiles`는 파일 손상 시 던짐) · **M5-09** 운영 리포트에 월 비용(prod/dev)·dev 비율·예산 생략 횟수(verdict별) 한 줄(제안: dev 50% 알림도 이슈 대신 이 리포트 줄로) · **M1-41** `summarize.brief.budget`의 예상과 실측 비용 비교 관찰
- [x] M1-23 🆕 **자동 사실성 검사기(브리핑 코드 검증 — FR-29 순서 zod → 코드 검증 → 1회 재시도 → 템플릿, D28)**: M0-30에서 zod를 통과했지만 쓸 수 없던 출력을 잡는다. ① 출력 전체 — 한국어 비율(한글 글자 수 < 영문 글자 수면 실패)·CJK 한자 혼입 → 실패하면 FR-29의 1회 재시도(zod 실패와 합쳐 1회, 하루 요청 상한 불변) → 템플릿 강등 ② 줄 단위 — 숫자·스코어(입력 결과의 `a-b`, 순서 뒤집힘 포함)·팀·선수 이름(영문 토큰 허용 목록 = 입력의 팀·선수·대회 이름 → 축약 이름·일반 영단어, 입력 영문 없이 나온 한글 고유명사(모델 음역) 탐지)·순위 서술("유지·상승·하락"은 전일 순위가 입력에 있을 때만, "공동 n위"는 같은 순위일 때만)·근거 id 존재·1줄 1문장 → 불일치 줄은 템플릿 문장으로 교체 (재시도 없음 — 호출 증가는 CLAUDE §1-3에 따라 승인 필요. 비용 0, FR-22 보강). M0-30 실제 출력(정상·한자 혼입·영어 출력·순위 오해 — M0-36 mock)으로 단위 테스트 (D24·D28). 🆕 M0-36 반영: ① 승패 동사 검사 추가 — '꺾었다·이겼다·졌다'의 주어가 실제 승자/패자인지(`brief-case-winner-swap`) ② 스코어는 '홈-원정' 또는 '주어 팀 점수 먼저'와 일치할 때만 인정(순서 무시하면 `brief-case-score-reversed` 통과) ③ ~~❓ 미정 판정~~ → 2026-10-15 사용자 결정(PRD §15 D40 ②~⑤): 파생 숫자는 근거 항목 숫자의 차·합과 정확히 일치할 때만 허용, prev 없는 변동 서술은 줄 강등 + 지시문, 한글 고유명사는 사전 공식 표기와 같고 입력에 있으면 허용, 코드블록은 벗겨서 파싱·6줄 이상은 앞 5줄·80자 초과 줄은 강등(`brief-cases.json`의 미정 항목 확정) — 2026-10-17 **구현·main 반영(로그·dry 표시만 — 게시 영향 없음), 집중 재리뷰 대기**: ① `scripts/lib/brief-check.ts` `judgeBriefResponse` — FR-29 판정 `ok`·`retry`·`downgrade-line:n`·`downgrade-all` + 단계(none·transport·zod·whole·line), 마지막 시도면 retry → downgrade-all(D40 ①), **허용 목록 방식(알아본 서술만 통과)**. 출력 전체: 이름을 가린 뒤 한국어 비율·한자·가나. 줄 단위(어휘 표 `brief-check-lexicon.ts`): 이름(허용 목록 `briefNameAllowlist` + 한국 선수 블록·'PK', D40 ④ 공식 표기·입력 대상, 그 줄 근거 항목, 'T의 X'·'T 소속' 소속 대조, 결과·순위 절의 대회 이름 대조 — `comp-mismatch`, '챔피언스리그' 약칭 강등 — M1-24 빈도 보고 검토), 승패(**알아본 결과 동사만 — 목록 밖 동사가 팀 주어·점수와 쓰이면 `result-verb-unknown` 강등**, 주어·목적어 역할(주어 여럿 포함), 종료 동사만이면 주어 점수 먼저, 승부차기 승자·'비겼다' 금지, 90분에 앞선 연장 승리를 이긴 것처럼 쓰지 않음), 점수(홈-원정 또는 주어 팀 먼저, 'A와 B의 경기'는 앞 팀 먼저, **경기 중 '앞서·뒤지' 방향**, '전반' = ht), **득점·도움(숫자 없이도 — 그 선수의 자책골 아닌 골·도움이 있어야, 'X의 골로'·'Y의 결승골을 도왔다'·만회골 대조, 한국 선수 블록 골·도움 수)**, **자책골은 그 절에 '자책'이 있을 때만**, 파생 서술 정의 검증(완파 3골 차·해트트릭/n골·결승골/동점골/선제골·역전승·round·홈/원정·장소 낱말(안방·원정길·적지 등)·연장 끝에·무실점·승점 3), **목록 밖 평가어('대파·대승·압승·신승·진땀승·석패·완패·대패·참패' 등)는 점수 차가 맞아도 강등**(사용자 결정 2026-10-17), **숫자는 종류를 알아본 것만**(근거 숫자 아무 둘의 합·차 허용 폐지 — D40 ②는 승점 차(방향 포함)·점수 차·두 팀 골 합 전용 규칙, '골 n개·도움 n개·n번'은 개수 대조, 종류 모르는 숫자 강등), **prev 없는 순위 변동**(동의어 되찾·꿰차·진입·밀렸·끌어내리 + 도착 'n위로·선두로' + 'n계단' — D40 ③), '공동 n위', 분·출전 기록, 1줄 1문장·줄바꿈·80자. 경고(강등 아님 — 관찰 주간에 승격 판단): 쉼표 절·사실 셋 이상·한 줄 두 경기·괄호 ② 브리핑 단계: `summarize.brief.done`에 판정·줄별 사유, dry 출력에 줄마다 판정, 검사기 호출·판정 조립 방어선(예외는 `summarize.brief.check-fail` 경고 후 템플릿 게시), 저장은 템플릿(M1-45 전) ③ brief-cases 5건 재정의(D40 ④·M1-21 별칭·목록 밖 평가어), 리뷰 재현 fixture `fixtures/llm/brief-check-probes.json` ④ **수치(미탐 0은 이 시험 범위에 한정)**: 실제 출력 90줄 중 사람 지적 7/7 차단, 리뷰 재현 거짓 문장 112/112 강등·참 문장 46/46 통과, 리뷰 유형 변형 2,122개·템플릿 어휘 변형 638개 미탐 0, 템플릿 줄 186 + 합성 48 오탐 0, 리뷰 유형 참 문장 610개 통과, 실제 출력 정상 줄 강등 21/83(25.3% — 출력 전체 재시도 포함, 줄 단위만 11/73 = 15.1%, 모두 정해진 규칙). 범위 밖 문형(주어·목적어 아닌 자리의 사전 밖 음역, 경기 흐름 세부)은 M1-24 골든셋·M1-43에서 계속 확인. 호출 약 9ms. LLM 호출·스키마·토큰 불변. 테스트 3,813 → 3,968. 리뷰(code-reviewer) 1회차 차단 6(목록 밖 승패 동사·경기 중 방향·숫자 없는 득점·자책골·파생 숫자 남용·prev 없는 변동 동의어 — 모두 미탐)·중요 3 반영 — 2026-10-17 **재설계·main 반영(D50 사용자 결정 — 닫힌 문법, b06ce02), 적대적 재리뷰(3회차) 대기**: 2회차 리뷰에서 거부 목록 방식의 미탐(이전 판 160개)이 반복돼 ① `scripts/lib/brief-grammar.ts` 허용 문형 문법(절 17종 — 결과 win·loss·draw·pens·end·endPens, 득점 goal·count·assist, 한국 선수 korean·koreanTail, 순위 rank·rankList·move·keep·gap·points, 결과 수식은 순서 자유·종류마다 한 번, 한 줄 = 절 1~2개(-고·-며)·관형 앞절 + 순위, 주어 생략 순위 절은 앞 절 주어를 이어받음, 이름 조사는 역할만·숫자 조사는 받침까지) → `brief-check.ts` 줄 판정 = 사전 검사(근거·문장·문자·이름 D40 ④) + 문법 + 슬롯 대조(점수 방향·주어 팀 먼저 D30·승부차기·연장·결승골/동점골/선제골/만회골 정의·자책골·분/구간·출전 기록·순위·공동·prev D40 ③·승점 차 D40 ②), 문형 밖은 `grammar-unknown`(근거 = 처음 읽지 못한 낱말), 거부 목록 판 사유 8종 폐지·경고 2종만 ② 지시문 v0.2 — [문형] 목록, 4,305 → 4,453자(약 +143토큰/요청, 월 약 +$0.0009), D28 설정 불변 ③ 인터페이스·로그 필드·dry 출력·방어선 불변(`BriefLineCheck.grammar` 추가) ④ 수치(미탐 0은 이 시험 범위에 한정): 리뷰 재현 거짓 460/460 강등(1회차 112 + 2회차 348), 템플릿 변형 638·리뷰 유형 변형 2,122 미탐 0, 템플릿 232줄(실제 186 + 합성 46) 오탐 0, 문형 안 참 문장 610 + 문형별 51 통과, 실제 출력 사람 지적 7/7 차단, M0 지시문 출력의 정상 줄 강등 21/83 → 35/83(42.2% — 늘어난 14줄은 사실은 맞지만 문형 밖, v0.2 실측은 M1-24 재측정), 판정 평균 4.4ms ⑤ brief-cases 7건 재정의(발행일 5건 불변), probes 158 → 669문장(`truth` 추가). LLM 호출·스키마 불변. 테스트 4,140 → 4,272. 동점골 정의는 좁게(비긴 경기의 마지막 골) 유지 — v0.2 실측 빈도로 재판단 — 2026-10-17 **3회차 반영**(적대적 재리뷰 3회차 차단 6 — 녹아웃 '승점'·분 목록 도움·다른 순위표 나열·gap/keep '공동'·두 절 다른 경기·'주고받은' 한쪽 득점, 중요 5·권장 8): `roundLabel` stage 우선(리그 단계만 matchday — 버그 수정, 골든 02-26 'PLAYOFFS'로 재빌드), 사유 코드 `clause-mismatch`(한 줄 두 절은 같은 경기·주어 팀 순위)·`rank-table`(한 나열·공동 묶음은 같은 순위표), '공동' 필수/금지, 승점 차 ≥ 1, '{n}골을 주고받은'은 두 팀 득점 때만, 연장에서 갈리지 않은 경기는 결승골 없음, 만회골 = 넣은 뒤에도 뒤진 골, 해트트릭 = 3골, 골 수 ≥ 1, 앞자리 0 금지, '연장까지'는 aet만, 후보 고정, 80자 조기 종료, '벤치를 지켰다'·경기 승점 꼴·분 목록 + 도움 꼴 삭제 · D53 ① `max_tokens` 8,192(가드 최악값 일 예산 4.9% → 9.0%), ② 문법 목록(`PATTERNS` 22·`MODIFIERS` 12)에서 지시문 [문형] 생성(`renderBriefPatterns`, 양방향 테스트) — 지시문 v0.3(4,871자), eval은 출력 6,000 초과·잘림이면 남은 날 멈춤 · 수치: 회귀 문장 1,457개 중 거짓 846 모두 강등(미탐 0 — 이 시험 범위), 템플릿 876줄 오탐 0, 사람 검토 정상 83줄 중 37 강등 · 💰 v0.3 골든 6일(25줄 통과·사실 오류 0·잘림 0, 그러나 thinking +73%·10-10 출력 6,101 → 멈춤, $0.014563) → **D55 사용자 결정: v0.4(입력에 없는 키 korean·prev 꼴 삭제) + 승패 문장 주어 팀 점수 먼저만** 진행, 그 뒤 적대적 재리뷰 4회차. 테스트 4,384 → 4,451 — 2026-10-17 **D55 반영**: ① 입력 선택 키(korean·prev) 문형 5개를 `requires`로 표시 — 입력에 키가 없으면 문법 밖·지시문 [문형]에도 없음, 키가 있는 입력에서는 다시 켜짐(테스트 고정, `briefInputKeys`) ② 승패 문장 점수는 주어 팀 먼저만(`score-order`, 지시문 [표기] '원정 팀이 주어면 ft를 뒤집는다'), 승부차기 꼴·'경기는 끝났다'·무승부는 그대로 · 지시문 v0.4(4,871 → 4,455자 — v0.2 수준) · 기대값 변경: brief-cases 3건·회귀 참 15개 → `score-order`(의도), 사람 검토 정상 83줄 중 강등 37 → 40 · 템플릿 876줄 오탐 0, 변이 88,032개 중 통과 867개를 독립 오라클로 판정해 거짓 0(지난 보고의 '통과 6개'는 집계 오류 — 정정) · 💰 v0.4 2요청: 09-19 출력 4,183(v0.2 3,772), **10-10 6,729(thinking 6,527 — v0.2의 3.3배, 길이를 되돌려도 줄지 않음 → 원인은 규칙 내용으로 추정)**, 사실 오류 0·잘림 0, $0.006482 → 사용자 결정: 잘림만 멈춤 기준으로 측정 마저(6,000은 경고), 잘림이 나오면 원인 실험. 테스트 4,451 → 4,461 — 2026-10-17 **완료(4회차 반영)**: 적대적 재리뷰 4회차(f716ed0 — 3회차 항목 전부 차단 확인, 새 차단 3·중요 3) 반영 — 주어 생략 순위 꼬리는 한 팀 주어 결과 문형 뒤만(`PatternEntry.after` — rank-after·end-pens·korean-tail), 경기와 순위를 한 줄에 쓰면 같은 대회 + 후보 여럿이면 모든 후보에서(`Focus.alts`), 입력 밖 한국 선수 경기도 그 id로 대조(M3-03 대비), 합산 승부차기 승리 꼴 강등(`shootout`), 승부차기 점수는 이긴 팀 먼저만(오케스트레이터 결정 — 지시문·템플릿과 일치), 점 묶음 주어 주석. 지시문은 v0.4 그대로(검사기 판 `c_5ceb8b24`). 수치(미탐 0은 이 시험 범위에 한정): 회귀 문장 1,522개 중 거짓 895 모두 강등, 4회차 b10·b11 거짓 49 미탐 0(기준선 27), 3회차 묶음 거짓 127 미탐 0, 변이 105,904개 중 통과 986개를 독립 오라클로 판정해 거짓 0, 중의성 0/66,939, 템플릿 876줄 오탐 0, 실제 LLM 출력 판정 불변(v0.2 40/40·v0.3 24/25·v0.4 38/39 통과, 통과 줄 사실 오류 0). 리뷰 4회차 판정 '차단 해결 뒤 M1-45 착수 가능' → 하네스 전부 재실행으로 확인(별도 재리뷰 생략 — 오케스트레이터 판단). 테스트 4,461 → 4,556(M1-18 포함)
  - 🆕 M1-23 이월 메모(4회차): **M1-43** 후보를 고정하지 못한 절은 모든 후보에서 참이어야 해 같은 팀이 하루 두 경기인 날의 '이기고 승점 …' 줄이 강등됨(안전한 쪽) — 빈도 관찰, D53 ② 축소로 늘어난 참 강등('후반 결승골로'·'{선수}의 결승골로 {팀}이'·'역전패'·'한 골 차로'·'공격포인트는 없었다'·앞 수식 '대회 결승에서 {팀}이')을 지표로 · **M3-03** 한국 선수 블록 경기가 입력 밖(컵 등)이면 그 줄은 다른 경기·순위와 잇지 못함 — korean 키를 켤 때 블록 경기가 입력 경기 목록에 들어오는지 확인
  - 🆕 M1-23 이월 메모: **M1-24** 실측에서 오탐이 늘 수 있는 곳은 `result-verb-unknown`(목록 밖 동사)·`number-unsupported`·`name-unknown` → 빈도를 보고 `brief-check-lexicon.ts` 조정, 제안: 지시문에 '결과 동사는 이 목록에서만'(약 +20토큰 — eval:prompt 회귀 필요) · **M1-45** `judgeBriefResponse(response, input, ctx, { finalAttempt: isFinalBriefAttempt(n) })` 그대로 — `retry`면 같은 입력으로 1회 재전송(mock id `brief-<날짜>-r1`), `downgrade-line:n` 줄은 `templateLineForRefs`로 교체(같은 근거 중복 거름), 통과 줄은 `check.substitutions[i].text` 게시(80자를 잰 문장과 같음), `summarize.brief.check-fail`(판정 없음)은 downgrade-all, 사전을 못 읽으면 한글 이름 줄 강등·영문 이름 줄 영문 게시 → 전체 템플릿으로 갈지 결정, runs summarized·downgraded는 이 판정 기준, collect-slice mock(입력 E 원문)은 슬라이스 입력과 근거가 맞지 않아 5줄 모두 강등 → llm·mixed 게시 테스트용 입력 일치 mock 필요 · **M1-24** 회귀 비교 기준 = `briefCheckLogFields`(verdict + lineReasons), v0.1 실측 오탐은 `brief-check-lexicon.ts` 수정 후 brief-check.test 재실행, '챔피언스리그' 빈도 확인 · **M1-43** 경고 5종과 `name-unknown`·`latin-token` 빈도 집계 → 강등 승격·완화 결정, 판정 집계를 ops-report(M5-09)에 · **M2-03** prev를 더하면 순위 변동 검사 자동 활성 · **M3-03** 한국 선수 블록은 M0 형식 기준 — 확정 형식에 맞춰 출전 규칙 수정, 허용 목록을 `briefNameAllowlist`로 · **M2** 라운드 낱말이 football-data stage 값과 맞는지 토너먼트 실응답 확인 · 🆕 재설계(D50) 반영: 위 사유 코드 `result-verb-unknown`·`number-unsupported`·`name-unknown` 등 8종은 `grammar-unknown`으로 통합, 관찰 대상 = `grammar-unknown` 근거 낱말 빈도(M1-43), 고치는 곳은 `brief-check-lexicon.ts`가 아니라 `brief-grammar.ts` `PREDICATES`·문형 + 지시문 [문형](함께 바꾸고 `tests/brief-grammar.test.ts` `PATTERN_LINES`에 참 문장) · **M1-45** `check.lines[i].grammar`로 게시 줄 문형 분포 로그(선택) · 제안: 지시문 [문형] 절을 문법에서 생성(단일 출처, 토큰 0), v0.2 뒤에도 문형 밖 강등이 높으면 출력을 슬롯 JSON으로 받아 코드가 문장 조립(출력 스키마 변경 — 사용자 결정)
- [x] M1-24 🆕 **골든셋 회귀 평가(브리핑)**: 대표 입력 10일치(`fixtures/llm/golden/` — 경기 많은 날·적은 날·UCL 주간·대승·무승부 포함, PRD §9.2) + `npm run eval:prompt` — 프롬프트 수정 전후 출력 diff·검사기 결과 비교 (CLAUDE §6.3 구체화) (D24) — 2026-10-17 완료: ① `fixtures/llm/golden/` 10일치(02-26·05-31 UCL 2025-26 연장·승부차기, 09-11·09-19·09-21·10-10·10-11 = M0 입력 B·A·D·C·E의 그날 전체, 10-14·10-15 UCL MD2, 10-17 봇과 같은 경로) — 소스(어댑터 출력) + configs → `buildBriefInput` → `canonicalizeBriefInput`, 테스트가 다시 빌드해 바이트 일치 확인(외부 호출 football-data 7·API-Football 5회) ② `npm run eval:prompt` — D28 단건·첫 시도만, `guardBriefBudget(attempts 1)`·dev 50% 알림·runs-dev 기록, `runs/<라벨>/run.json`에 지시문 판·검사기 판(닫힌 문법 `brief-grammar*.ts` 포함)·설정 판(configs 4개 + LLM 본문 상한 D51)·출력·판정·토큰·thinking·지연, 이전 실행 또는 M0 기준선과 비교, `--prompt`·`--rejudge`·`--mock`·`--dry`·`--limit`·`--dates`·`--variant pre`·`--build-golden` ③ 실측(💰 dev): v0.1 기준선 ok 8·mixed 2·사실 오류 0/43·최대 출력 3,112·$0.016388, 🧪 사실 선계산 변형 바쁜 날 3,941(보류 — 사용자 결정), v0.1 바쁜 날 반복 2,922 · **4,096 잘림**(→ D51), 닫힌 문법 재판정(무료) v0.1 정상 줄 강등 2/45 → 11/45(모두 `grammar-unknown` — '전반을'·'n골이 터진'·'비겼지만'·목적어 없는 '완파했다' 등), **v0.2 + D51 골든셋: 강등 0/40·통과 줄 사실 오류 0/40**, 출력 합계 +20%(thinking +24%), 3,500 초과 3건(09-19 3,772·10-11 3,796·**10-17 4경기인데 4,096 잘림**), $0.018649 → D53(사용자 결정 — `max_tokens` 8,192 + [문형] 축소) ④ D51 구현: `briefLlmInput`(앞 15경기, 경기가 모두 잘린 대회 순위 제외 — 바쁜 날 입력 8,435 → 7,469토큰), 모델이 못 본 근거 id를 단 줄은 `ref-hidden` 강등(템플릿·검사기는 전체 입력), `summarize.brief.done`에 `llmMatches`·`llmDroppedMatches`, dry 출력 안내. 이번 달 누적 dev $0.0700 + prod $0.0045 = $0.0745(월 예산 2.5%). 테스트 4,204 → 4,384
  - 🆕 M1-24 이월 메모: **M1-45** 검사기는 `judgeBriefResponse(response, input, ctx, { finalAttempt, hiddenRefs: briefLlmInput(input).hiddenRefs })`(input = 전체 입력, 템플릿 강등도 전체 입력), `max_tokens` 잘림이 실측 2/13으로 실제로 일어남 → FR-29 재시도 1회 뒤 템플릿 경로 테스트 필수(같은 지시문이라 재시도도 잘릴 수 있음), `golden-<날짜>` mock은 입력과 근거가 맞는 실측 응답이라 llm·mixed 게시 테스트에 바로 사용(지금은 v0.1 출력 — 지시문 확정 뒤 `--update-mock`·`tests/eval-prompt.test.ts` `BASE_RUN` 라벨 갱신), runs `summarized`·`downgraded`에 `ref-hidden` 강등 포함 · **M2** `roundLabel`이 토너먼트 2차전에 matchday를 받아 'Matchday 2'로 씀(PLAYOFFS인데 stage가 입력에 없음) → M1-23 3회차 반영에서 처리, 바쁜 날 대승(6-0)이 중요도 16위로 잘림(`goalFest` +1) — 중요도 가중치 검토 · **M1-29 후속·/add-name** 출력에 남은 미등록 이름(SL Benfica·Viking·Deportivo·Sabah FK·Jordan Henderson·Niclas Füllkrug·Antonio Raimondo 등) · **M1-43** 문체 관찰(목적어 누락·미등록 이름 뒤 조사·대회 이름 생략·짧은 줄) · 제안: 검사기 판을 바꾸는 커밋마다 `--rejudge`(무료·약 1초)를 CI에서 보여 주기

### M1-D 검증·발행·운영
- [x] M1-25 발행 검증 게이트: 스키마, 카드 수 하한(≥10, 휴식기 5), 링크 형식, `configs/takedowns.json` 등록 카드 제외 + 다음 수집에서 `data/` 원본 삭제 · 🆕 소스별 보존 기간(`Source.retentionDays`, D32): 기간이 지난 출처를 같은 삭제 경로로 `data/`에서 지움(대표 출처면 카드 삭제 — 현재 The Athletic 7일) (FR-143, FR-153) — 2026-10-17 완료: ① **발행 검증 게이트**(`scripts/lib/publish-gate.ts`, validate stage `gate`, FR-153) — 오류: 뉴스 카드 `ai:true`(M1-01 이월)·요약 줄 `s` 비어 있지 않음(D23·M0-25 보호 — 추가 규칙), 링크 형식(`link-check.ts` — zod httpUrl이 통과시키는 공백·제어/서식 문자·역슬래시·user@host·2,048자 초과, 정규화 `bad-link`도 같은 함수), 오늘(KST)보다 늦은 날짜의 news·briefs 파일, **카드 수 하한은 발행일 파일만**(평시 10·휴식기 5 — 비시즌은 `competitions.json` 시즌 범위, A매치 기간은 `national-team.json` ±3일(M3-05 전엔 판정 안 함), takedown 카드도 셈; 기존 10-12~14 파일은 5·5·8장이라 전체 적용 불가), 발행일은 `--publish-date`(파일 없으면 오류) 또는 KST 오늘(파일 있을 때만 — 사람 push의 CI가 아침 전에 막히지 않게). 경고: 남은 takedown 카드(등록 push가 원본 삭제보다 먼저 배포돼야 해서 오류 아님)·접수 후 72시간 지난 handledAt null·보존 기간 만료 출처·sources.json에 없는 매체명. configs 오류: 같은 매체명끼리 retentionDays가 같아야 함(M1-02 이월). data/briefs는 스키마·미래 날짜만(무기한 보존 — D45 ③) ② **takedown**(FR-143) — 빌드: `src/lib/data/news.ts`가 등록 ID와 저장된 `card.id`가 같은 카드를 즉시 제외(등록 파일 없음·깨짐이면 빌드 실패 — fail-closed), 원본: 다음 수집의 ⓪ 단계(`purge-stage.ts`, 뉴스 단계 전)가 **모든 날짜 파일**에서 저장된 ID로 삭제(옛 규칙 ID 포함 — 다시 계산하지 않음, M1-16 이월), 재수집 차단은 지운 카드 `src[].u`의 urlHash를 seen에 **먼저** 기록(seen 오류면 뉴스 파일을 지우지 않음 — `blocked`) ③ **소스별 보존 기간**(D32) — 출처 매체명(`src.n`)으로 역참조(스키마 불변), 기준 시각 min(`src.at`, `created`), 대표 출처(`src[0]`)가 만료되면 카드 삭제·아니면 그 출처만 삭제(D45 ②로 대부분 출처만), **수집 실행은 `만료 ≤ 실행 시작 + 30시간`이면 미리 지움**(`RETENTION_PURGE_LEAD_MS` = 커밋되는 다음 실행까지 최대 간격 — 24시간 + 계절 전환 40분 + 백업 10분 + schedule 지연 4시간 + 커밋 30분, 실제 보관이 7일을 넘지 않게 — 오케스트레이터 판단·D32 취지, 게이트 ⑧은 여유 없이 정확한 시각) 빌드 경로 가드 — 날짜 파일 읽기는 `src/lib/data/news.ts` `readIssue` 한 곳(`loadNewsIssue` 추가 — M1-34용), `tests/takedown-build-guard.test.ts`가 `src/`·`build-feeds.ts`의 data/news 직접 읽기와 로더 표 누락을 잡음, `collect.done`에 `purge` 칸 ④ 삭제 단계는 던지지 않음 — 실패하면 partial·발행 계속(공개 사이트는 빌드 제외가 지킴), prod 오류 주석, dry는 계획만. 실데이터 purge dry: 지울 것 0. 테스트 3,460 → 3,610(+150), 단언 변경 1건(부록 A 스키마 예시 fixture의 LLM 형식 카드는 이제 게이트 오류). 스키마 변경 없음
  - 🆕 M1-25 이월 메모: **M1-26** collect.yml validate 단계에 `--publish-date <collect 단계 출력 발행일>`(`today`는 자정 넘김 실행에서 어긋남), ci.yml·collect.yml의 'M1-25에서 추가' 주석 정리, `limit` 10 미만 dispatch는 게이트에 막힘(M1-40 리허설은 기본 상한) · **M1-27** 삭제 단계 오류(partial)는 이슈가 생기지 않음, runs.json에는 삭제 건수 필드가 없음(로그 `collect.purge.done`) · **M1-29** `/takedown` 문서 갱신 — 빌드 제외·원본 삭제 구현됨, 등록 직후 validate 경고 1건과 72시간 경고는 정상, (제안) purge 단계만 실행하는 takedown 단독 CLI(package.json 스크립트 — 수집을 기다리지 않고 원본 삭제) · **M1-31·M1-34·M4-11·M4-14·M5-01** 카드를 내보내는 모든 빌드 경로는 `withoutTakedowns`를 거칠 것(제외 뒤 게재 번호가 앞당겨짐) · **M1-32·M1-37** 휴식기 안내는 `restPeriodOf` 재사용(빌드에서 쓰려면 src/lib로) · **M3-05** `national-team.json`이 생기면 A매치 기간 하한 5 자동 적용, FR-71 판정 함수와 통합 · **M5-10** 월별 병합 파일도 purge·로더·게이트 대상 · **M5-09** 운영 리포트에 `collect.purge.done` 건수·72시간 경고 수 · **M1-43** 첫 Athletic 만료 삭제 실측 · **한계** seen 키는 90일 뒤 정리 — 그 뒤 피드가 같은 기사의 pubDate를 새로 찍으면 다시 카드가 될 수 있음(막으려면 takedown 링크 해시 별도 저장 — 스키마 변경, 제안만), takedown은 카드 단위만(그 링크가 다른 카드의 비대표 출처로 있으면 남음 — 연쇄 삭제는 제안만)
- [x] M1-26 `collect.yml` 완성: 수집 → 정제·분류 → 데이터 브리핑 → 검증 → 빌드 → `data/` 커밋(변경분만, `pull --rebase`) → `deploy.yml` 호출. 빌드 실패 시 커밋하지 않음 (CLAUDE §10) — 2026-10-17 완료(**Actions 실제 실행 확인은 D48 ④에 따라 M1-D 마무리 때 — 구조는 테스트로 고정**): ① 수집 진입점이 `$GITHUB_OUTPUT`에 publish_date(수집 시작 KST 날짜)·run_id·status·run_recorded를 씀(`scripts/lib/collect-outputs.ts` — 줄바꿈·빈 값 거부로 출력 주입 방지, 실패 실행도 씀, 출력 쓰기 실패 → exit 1), Step Summary '수집 결과' ② 검증 게이트 = `npm run validate -- --publish-date <publish_date>`(형식 확인 뒤 — `today` 제거, M1-25 이월), 커밋 메시지도 같은 발행일 ③ 커밋 단계: data/·public/만, pull --rebase → push 3회 재시도, rebase 충돌은 abort·`::error`·충돌 파일 기록 후 재시도 없이 실패, push 뒤 요약 쓰기가 실패해도 배포됨 ④ `실패 단계 기록`(`if: failure()`, 토큰 없음) → job output reason → 기존 이슈 헬퍼가 collect 행 메모로 씀 ⑤ collect job outputs에 publish_date·run_id·status·reason(M1-27이 이어받음), 의존성 설치 단계 시간 제한 ⑥ 주석: push 금지는 사람 규칙·봇 커밋은 그 시간대가 정상(CLAUDE §10 명확화), limit 10(휴식기 5) 미만 dispatch는 게이트에서 멈춤, rebase 뒤 트리는 validate를 다시 하지 않음. 테스트 3,669 → 3,713(`collect-workflow.test.ts` — 단계 순서·if·발행일 전달·주입·커밋 경로·이름 없는 step, 변형 7가지 모두 잡힘, `collect-outputs.test.ts`), actionlint 없음(js-yaml·PyYAML 파싱·`bash -n`). 시간 예산(코드 상한 기준): 여름 공개 약 06:43~06:45, 겨울 약 07:23~07:26(+Pages CDN max-age 600초) — 두 계절 모두 목표 시각 안(D48 ②). **실측 발견**: GitHub 백업 schedule 2시간 이상 지연 → D48 ③ cron-job.org 백업 작업 2개(M1-40). 리뷰(code-reviewer) 차단 0, 중요 2(요약 실패 시 배포 skipped·±15분 문구) 반영, 권장 반영
  - 🆕 M1-26 이월 메모: **M1-27** 실패 실행 기록 보존에는 `needs.collect.outputs.publish_date·run_id·status`와 단계 출력 `run_recorded`(true면 러너의 runs.json에 이번 기록이 있음), 지금 원인 키는 `collect:collect` 하나라 검증 실패·빌드 실패·rebase 충돌이 한 이슈에 댓글로 쌓임 → 단계별 키 검토, push 뒤에 단계를 붙일 때 deploy `if`의 암묵적 `success()` 주의 · **D48 ④(M1-D 마무리)** 첫 dispatch(`gh workflow run collect.yml --ref main -f force=true`)에서 Step Summary '수집 결과'·검증 로그의 `(--publish-date)` 줄·`chore(data): <KST 오늘> 발행`·deploy SHA 확인, 실패한 job outputs가 needs로 넘어가는지·rebase 충돌 경로는 그때 확인(실패 경로는 그날 첫 실행 limit=1로 게이트 실패를 내면 재현 — LLM 1요청·API-Football 사용, 추천은 생략) · **M1-40** 리허설은 limit 없이, cron-job.org 백업 작업 2개 추가 · **M1-41** 백업 schedule 지연 관찰, Pages CDN max-age 600초를 공개 시각 측정에 반영 · **M1-45** 마감을 넘기는 요청 1건(최대 60초)이 해소되면 최악 시간 예산 1분 단축 · **제안(구현 안 함)** main이 움직였을 때만 push 전 validate 재실행(약 10줄, +2초)
- [x] M1-47 🆕 계절별 발행 시각 (FR-26, FR-150, NFR-05, PRD §15 D26): ① `src/lib/time.ts`에 발행 슬롯 함수 — 발행일(KST) → 계절(`europeanSummerTimeTransitions` 기준 여름/겨울)·수집 시작(06:30/07:10)·브리핑 마감(공개 목표 −10분: 06:50/07:20)·공개 목표(07:00/07:30) + 전환 경계 테스트(2026-10-25 여름 → 10-26 겨울, 2027-03-28 겨울 → 03-29 여름) ② collect 가드에 계절 판정 추가 — 계절에 맞지 않는 트리거(여름의 07:10·07:20, 겨울의 06:30·06:40)는 skip(실패 아님, collect job이 skipped라 12시간 가드의 성공 이력에 들어가지 않음). 트리거 구분은 백업 schedule = `github.event.schedule` cron 문자열, cron-job.org = dispatch 입력(예: `slot`, M1-40 활성화 때 본문 갱신), 입력 없는 수동 dispatch는 계절 판정 없이 기존 12시간 가드만 ③ `collect.yml` 백업 schedule 2개(`40 21 * * *` = 06:40 KST, `20 22 * * *` = 07:20 KST)와 워크플로 주석, `ci.yml`의 push 금지 시간대 주석(06:00~08:00) 갱신 ④ M1-45 브리핑 마감을 ① 함수로 계산(06:50 고정값 제거)하고 `scripts/`의 06:30·06:50 주석 정리. 가드·슬롯 함수는 순수 함수 단위 테스트 — 2026-10-15 완료(M1-13과 병렬 — 별도 worktree 브랜치 `m1-47` → main 병합): ① `src/lib/time.ts` `publishSeason`·`publishSlot`·`publishSlotAt`·`isEuropeanSummerTime` — **발행일 계절 = 그날 00:00 KST의 유럽 서머타임 여부**(전환은 일요일 10:00 KST라 전환일 아침은 전환 전 계절: 10-25 여름·10-26 겨울·2027-03-28 겨울·03-29 여름), `PUBLISH_TIMES_KST`, 브리핑 마감 = 공개 − `BRIEF_DEADLINE_LEAD_MINUTES`(10분 — 06:50·07:20 고정값 없음) ② 가드 판단 순서 event → main → `COLLECT_ENABLED` → **계절(`off-season` skip — 실패 아님, collect job skipped라 성공 이력 아님)** → force → 12시간. schedule은 `github.event.schedule` cron(`SCHEDULE_SEASONS` `40 21`=여름·`20 22`=겨울), cron-job.org는 dispatch 입력 `slot`(summer·winter), 모르는 cron·slot은 precheck 3단계 뒤에 가드 실패, 입력 없는 수동 dispatch·force는 기존 동작 유지, slot은 force보다 먼저 판정 ③ collect.yml 백업 schedule 2개·`slot` 입력·guard env·run-name·주석, ci.yml push 금지 주석 ④ `scripts/lib/collect-deadlines.ts` — **실행 마감 = 슬롯 마감(마감까지 3분 이상 남은 정시 실행) / 시작 + 8분(그 밖 — 수동·지연·개발 실행, PRD §15 D41 사용자 결정)**, 단계 예산 football-data min(150초, R) · API-Football 브리핑 컷오프 min(4분, R − LLM 몫 4분) · API-Football 단계 min(6분, R) — 정시 실행은 기존 상수 그대로, `callSingle` deadline 전달(재시도 대기만 — 요청 타임아웃 축소는 M1-45), `collect.deadline` 로그, llm.ts 머리말 등 낡은 06:50·배치 주석 정리(M1-45 줄의 주석 정리 항목 포함). **M1-44 이월 ⚠(겨울 LLM 몫 30초) 해소** — 겨울 정시 07:12 시작이면 컷오프 07:16·LLM 몫 4분. 테스트 3,084 → 3,170+(+86 이상). 리뷰(code-reviewer) 차단 0, 중요 2(M1-40 `slot` 본문 필수·D41 기록) 반영, 권장 반영(파싱 오류 판정을 COLLECT_ENABLED 뒤로, LLM 몫 주석 정확화, 낡은 테스트 이름)
  - 🆕 M1-47 이월 메모: **M1-45** `runBriefStage`의 `ctx.briefDeadline`을 그대로 쓰고 요청 타임아웃 = min(60초, 마감 − 현재)(M0-36 ①), 남은 시간이 `BRIEF_LLM_MIN_ATTEMPT_MS`(30초)보다 짧으면 호출 없이 템플릿, FR-29 재시도도 마감 안에서만, llm.ts 클라이언트 시계(`now`)를 deps.now와 같은 시계로 주입해 테스트(지금은 실제 Date.now라 가짜 시각 collect 테스트에서 마감이 과거로 잡혀 재시도가 억제됨) — 이 축소 뒤에야 'LLM 몫 4분 안에 끝남'이 최악값(약 253초)에서도 성립 · **M1-19** 템플릿은 football-data 데이터만으로 만들 수 있어야 함(football-data 단계는 LLM 몫을 떼지 않고 마감까지 받음) · **M1-40** cron-job.org 본문 `slot` 필수(위 M1-40 줄) · **M1-41** 관찰: `collect.deadline` 로그(basis·remainingMs·예산), 트리거 → 스크립트 시작 Actions 준비 시간 실측(겨울 R < 8분이면 컷오프가 줄어 득점자가 빠짐 → LLM 몫 4분 재검토), off-season skip 기록, **concurrency 취소 위험**(여름 06:30 실행이 07:10까지 안 끝나면 07:10 winter dispatch가 대기 중 06:40 백업을 취소 — 대기는 최신 1건만) · **M5-09** 운영 리포트에 가드 reason별 횟수(off-season·schedule-disabled) · **아이디어(제안만)** API-Football 클라이언트 `readyAt()` 노출로 컷오프 판정에 분당 가드 포함 → 최악 지연 130→75초, LLM 몫 약 3분으로 줄여 늦은 겨울 실행 득점자 시간 +1분(토큰 0, 소량 수정)
- [x] M1-27 `runs.json` 기록 완성 (토큰·비용·건수·실패 소스·API 호출 수) + 실패 이슈 (FR-151, FR-152) — 2026-10-17 완료(worktree 브랜치 `m1-27` → main 병합, **Actions 실제 실패 경로 확인은 D48 ④ — 구조는 테스트·로컬 git 시뮬레이션 3종으로 고정**): ① **실패 실행 기록 보존** — collect.yml 새 단계 `실패 실행 기록 보존`(`failure() && run_recorded`, 3분)이 러너의 이번 실행 기록을 **상태 failed로** 보관(판정값 그대로면 수집 창이 발행 실행으로 봐 다음 실행이 기사를 놓침)하고, main 최신(fetch → reset --hard → clean data·public) 위에 runs.json 1건 추가(이미 있으면 그대로) + 원장(data/matches)·이월(af-pending)은 레지스트리 스키마를 통과하고 main의 그 경로가 기준 커밋(새 단계 `기준 커밋 기록`) 뒤로 그대로일 때만 함께 → 세 경로만 `chore(data): <발행일> 실행 기록 (발행 실패)` 커밋·push(배포 없음, 토큰은 git 헤더로만·node 전 unset). **뉴스·브리핑·seen-urls·unknown-names는 커밋하지 않음**(커밋된 기억 ⊂ 커밋된 카드 — M1-12 이월). LLM 비용 기록 누락(CLAUDE §1-4)·소스 건강도 연속 집계 누락(M1-11 이월)·API-Football 재호출(M1-48 이월) 해소(`scripts/lib/run-preserve.ts`·`scripts/preserve-run.ts`) ② 실패 이슈 원인 키 단계별 `collect:collect/<step>`(install·collect·validate·build·commit·setup — M1-26 이월) ③ **부분 실패 이슈** — 새 kind pipeline-partial(라벨 pipeline-failure 재사용, 키 `collect:partial:<사유>`, 사유 purge·seen·cluster·brief·brief-file·runs-unreadable·ledger — `scripts/lib/run-issues.ts`, M1-01·M1-22·M1-25 이월), 데이터 API 실패는 source-broken(football-data 실패·키 없음·순위 실패, API-Football 예상 밖 실패 — budget·cancelled 제외) ④ 전체 실패 실행은 소스별 연속 사건도 억제(실패 실행이 이제 기록되므로 전체 장애 3회째 소스 수만큼 이슈가 생기는 것 방지 — 전체 실패 자체는 pipeline-failure) ⑤ prod dry 기록 status skipped(M1-10 이월) ⑥ RunLog 필드는 스키마 변경 없이 이미 채워짐(tokens·costUsd·collected·clusters·sources ok/error·apiCalls) — `summarized`·`downgraded` 게시 줄 기준은 M1-45. 오케스트레이터 확인(2026-10-17): 보존 기록 status failed('발행되지 않음'), 전체 실패 시 소스별 사건 억제, pipeline-failure 라벨 재사용, 원장·이월 보존 — 에이전트 판단 수용. RunLog 새 필드(`failedStep`·`purged`)는 스키마 변경이라 M5-09 착수 때 다시 질문. CLAUDE §10 봇 커밋 형식·§5 명령 목록 갱신. 테스트 +44(3,856). 리뷰(code-reviewer)
  - 🆕 M1-27 이월 메모: **D48 ④(M1-D 마무리)** 첫 실패 실행(그날 첫 실행 limit=1로 게이트 실패 재현 — LLM 1요청·API-Football 사용)에서: 실패한 collect 단계 출력 `run_recorded`·`run_id`가 다음 단계로 넘어오는지, `needs.collect.outputs.step`·`reason`이 report-failure로 넘어오는지(키 `collect:collect/validate`), main의 `실행 기록 (발행 실패)` 커밋이 세 경로만 담는지, 다음 실행의 `collect.window` basis가 그 실패 기록이 아니라 직전 발행 실행인지 · **M1-28** 롤백 리허설은 `발행` 커밋만 revert(`실행 기록 (발행 실패)` 커밋은 되돌리지 않음 — 비용·호출 수 기록) · **M1-45** 마감·재시도 소진에 따른 템플릿 강등이 정상 경로가 되면 `partialFindings`의 `brief` 사유를 다시 맞출 것(의도된 강등은 이슈에서 뺄지), summarized·downgraded 자리는 collect-run.ts recordRun 호출부 · **M5-09·M5-15** runs.json에 status failed(발행 안 됨)·skipped(prod dry)가 있음 → 성공률은 failed를 실패로·skipped는 제외, 운영 리포트에 열린 pipeline-partial 이슈 수, 삭제 건수 필드는 그때 질문 · **PRD §8.2** 실행 로그 예시가 부록 A와 다름(`clusters: 160`·`failedSources`·`tokens.cached`) — 예시 갱신 필요 · **한계** 뉴스 실패 실행은 경기 데이터가 취소돼 원장·이월을 쓰지 않음(제안: 이미 받은 상세는 쓰고 새 요청만 막기 — 약 20줄, 토큰 0), runCollect가 예상 밖 예외로 던지거나 collect 단계가 22분 시간 초과로 끊기면 기록 보존 불가, 원인 키 변경으로 열린 `collect:collect` 이슈와 매칭이 1회 끊김
- [x] M1-28 롤백 리허설: `data/` 커밋 revert → `deploy.yml` 수동 실행 (FR-154, CLAUDE §12) · 🆕 2026-10-15 사용자 승인: Claude가 06:00~08:00 KST를 피해 최신 발행 커밋 revert → 배포 → 공개 사이트 확인 → 즉시 원복·재배포 — 2026-10-17 완료(22:00~22:15 KST, 06:00~08:00 회피): D48 ④ Actions 수동 실행의 발행 커밋 `8a7b993 chore(data): 2026-10-17 발행`(뉴스·브리핑·seen-urls·unknown-names·af-pending·runs.json) → `git revert`(8638e00) → validate·build·check 통과 → push → `deploy.yml` 수동 실행(ref = revert SHA) + ci.yml 배포 성공 → 공개 사이트가 직전 발행(10-14) 내용으로 돌아감 확인(10-17 표기 0건) → 원복 revert(a7a9ad4, 발행 커밋과 data diff 0) → deploy.yml·CI 성공 → 10-17 복원 확인. 소요 약 15분(배포 1회 약 3분). 참고: 발행 커밋에는 그 실행의 runs.json 기록이 들어 있어 리허설 중 잠시 빠졌다가 원복됨 — 실제 롤백에서 비용 기록을 남기려면 revert 뒤 runs.json만 되살리는 것을 권장(CLAUDE §10 '실행 기록은 되돌리지 않음'의 취지 — 🆕 M5 운영 절차 이월)
- [x] M1-29 커스텀 커맨드 동작 완성: `/add-source` · `/add-name` · `/takedown` — 2026-10-17 완료(코드 변경 없음 — `.claude/commands/` 문서를 구현과 하나씩 대조, general-purpose 에이전트): ① `/takedown` — M1-25 구현(빌드 제외·⓪ 원본 삭제·게이트 경고)을 '정상 경고'로 명시(남은 카드 = 그 카드가 든 날짜 파일마다 1건 — `c_fb2dd57b4a`는 2건, 72시간, 하한이 takedown 카드도 셈), 여러 카드·원문 URL 접수(저장된 id로만 찾는 명령 — 추적 파라미터만 떼고 `idxno` 보존), 비대표 출처·정정(원제목은 고칠 수 없어 비공개 또는 `summary-error`)·브리핑 줄(대상 아님) 분기, requestedAt `Z`, **배포 확인 거짓 통과 교정**(`/news/<date>/`는 M1-33 전 404라 grep 0이 통과로 보였음 → 홈 캐시 우회 + HTTP 200), `deploy.yml` 수동 실행 `-f ref=main`, 다음 수집 뒤 원본 삭제 확인·한계(카드 단위·90일 뒤 재수집) ② `/add-name` — 캐시 형식(`kind`·`count`, prod·비dry만 쓰고 등록된 이름은 다음 prod 실행이 자동 제거), 표기 정책(D39 ②·D46 — KFA 통칭·클럽 브뤼헤 예외·5대 리그 밖 한국 선수 미등록·대회 이름 금지·Viking/Sabah 보류), 근거 순서(KFA → en.wikipedia langlinks API → 국내 RSS 제목 → 외래어 표기법), `NameEntry` 규칙(en[0] 대표 표기·6개 대회 팀은 정식 + 짧은 이름·팀 slug = team-ids 또는 `teamSlugFromName`·note 머리말·`ko` 라틴 약칭 제한), 'X. 성' 축약 별칭은 `KNOWN_PLAYER_TEAMS` 없이 넣지 않음, 제외는 `ignore`, 검증 = validate + `tests/names-ko-dict.test.ts`(validate가 못 잡는 사전 규칙) + 치환 미리보기(토큰 0), `ko` 변경은 카드 태그 소급·저장 브리핑 비소급 ③ `/add-source` — `tz`(D34)·`retentionDays`(D32)·`author`·링크 형식·축구 외 비율, 매체명(`publisherNameOf` = 출처 표시이자 보존 기간 키 — 등록 뒤 바꾸지 않음), 위험 수용 소스는 `SUMMARY_UNREAD_SOURCE_IDS`(D48 ①)·`FOOTBALL_PATH_RULES`에 들기 전 켜지 않음, publisher-domains 판정 규칙, `tests/sources.test.ts` 스냅숏 갱신·첫 수집 뒤 러너 확인(ESPN 선례) ④ `/new-season` — team-ids(D33)·`TEAM_LEAGUES`·`KNOWN_PLAYER_TEAMS`·대회 별칭·보호 구·`AMBIGUOUS_TAG_TERMS`·원장 since 규칙, `collect --dry --mock`도 축구 데이터 API를 호출한다는 주의 ⑤ `/add-player` 예시를 5대 리그 선수로(D46 — 오케스트레이터). 드라이런(configs 무변경)으로 빠진 단계 보강
  - 🆕 M1-29 이월 메모: **코드(제안)** `names.ts` `isKnownName`이 축약 별칭(`initials`)을 몰라 등록된 'H. Kane'·'J. Castrop'이 소속팀 확인 실패 시 unknown-names에 쌓이고 자동 제거되지 않음 → 신호 로그 분리 또는 정리 기준에 축약 포함(M1-45 또는 M1-43) · **제안 유지** takedown purge 단독 CLI(M1-25 이월), 연쇄 삭제, takedown 링크 해시 별도 저장(스키마 변경) · **M5-11** `/new-season` 나머지

### M1-E 화면
- [x] M1-30 앱 셸: 헤더(워드마크·검색 자리·테마 토글), 모바일 하단 탭(최종 5개, M1 시점은 홈·뉴스만 노출 — 미완성 섹션 숨김), 1023 이하 1단·1024~1279 2단·1280 이상 3단 그리드(D31), 푸터(데이터 출처·AI 고지·마지막 업데이트 HH:MM KST) (DR-01, FR-142) — 2026-10-18 완료: `src/components/shell/`(app-shell·masthead·colophon·site-nav) — 페이지마다 `<AppShell current issue contents? facing?>`(서버 컴포넌트 — 현재 탭 `aria-current`·워드마크 h1(홈만)을 정적 HTML로, 루트 레이아웃에 두면 경로를 알 섬이 필요), 티켓 마스트헤드(천공·노치 = globals.css `@utility perf-x·perf-y·notch-hole`, 시안 `?stage=m1`과 375·1024·1280 × 라이트·다크 요소 상자·색 일치), 하단 탭·상단 내비 홈·뉴스(`NAV_ITEMS`), 뒤표지(FR-45 원문·데이터 출처 문장·GitHub↗·마지막 업데이트 — AI 작성 고지는 5줄과 함께 M1-32), 건너뛰기 링크(루트 레이아웃 `<body>` 첫 요소, 티켓 위에서도 링·상자가 지면 위에 놓이게 7px 지면 테두리 — 실측 링 6.04·7.11 · 상자 14.04·15.75, 화면 픽셀 e2e), 열은 페이지가 채운 슬롯만(목차·마주 보는 면이 없으면 1024 이상도 지면 한 열 — 빈 232px 열을 두지 않음), **창간일 2026-10-12**(2026-10-18 사용자 결정 — `FIRST_ISSUE_DATE`·`issueNumber`, 10-17 호 = 제 6호), 발행 = 그 발행일 prod collect 실행(success·partial)의 첫 finishedAt · 업데이트 = 마지막 finishedAt과 파일 generatedAt 중 늦은 값(`src/lib/issue.ts` — 07:00 문구 없음, D26), 페이지는 `loadLatestIssue()`(`src/lib/data/issue.ts` — M1-34용 `loadIssue(date)`), `/news/` 골격(최신 호 카드, 카드 제목 h2 — 제목 단계 건너뜀 없음, 필터 M1-33)·404도 셸 안, 검색·결과 가리기 토글은 숨김(M4-E·M4-15 — `Masthead search`·`spoilerSwitch` 칸만), CI specimen job을 배포 조건으로 승격. 홈 초기 JS 135.7 → 138.0KB(테마 토글·토스트 섬), 커밋 전 리뷰 8건 반영(건너뛰기 링크 대비·제목 단계·뒤표지 문구·노치 여백 `--perf-inset`·`role="list"`·호 로더·DESIGN 낡은 서술·runs 테스트 격리), 검사 결과는 아래 이월 메모 끝
  - 🆕 M1-30 이월 메모: **M1-32** 뒤표지 설명 문단(colophon.tsx)에 오늘의 5줄·AI 작성 고지 문장(AI 줄에만 'AI 작성' 라벨, 검증 실패 줄은 코드 문장, 뉴스 카드는 원문 제목 그대로)을 5줄과 함께 더함 · **M1-32·M1-33** 목차는 `AppShell contents`(1024 이상 232px sticky top 16px, `<nav aria-label="뉴스 필터">`)로 넣으면 2단이 켜진다 — 셸 main이 첫 섹션 위 여백(24/28px)을 주므로 5줄 아래 주요 뉴스만 `mt-9 lg:mt-11`, 홈 섹션 머리(주요 뉴스·SQUAD)는 지금 홈에 그대로 · **M1-36** 뒤표지 `LINKS`(colophon.tsx)에 AI 작성 고지(`/about/#ai`)·소개·출처 정책(`/about/`)·삭제·정정 요청(`/about/#takedown`)을 페이지와 함께 추가, 404 본문 디자인 · **M5-05** 개인정보 처리방침(`/privacy/`) 링크 · **M1-34** 날짜 아카이브는 `loadIssue(date)`의 `issue`를 셸에 넘김(마지막 업데이트를 최신 호 기준으로 따로 둘지 결정) · **M4-E·M4-15** 검색 버튼(≥1024 상자형 + `/` 단축키)·결과 가리기 스위치를 `Masthead`의 `search`·`spoilerSwitch`로 · **M4-D(PWA)** `viewport-fit=cover`를 켜면 하단 탭 safe-area(지금 `pb-[env(safe-area-inset-bottom)]`)·좌우 inset 확인 · **M2** weekly 실행(팀·선수 데이터)을 마지막 업데이트에 넣을지 · 검사: 단위 4,686 · e2e 129(셸 35 + axe heading-order 신규) · 견본 32 통과, axe 0, 홈 초기 JS 138.0KB
- [x] M1-31 뉴스 카드 + D0의 6개 변형 — 원제목(무수정)·한국어 태그 칩, 출처 스택(+N곳), 중요도, KST 상대 시간, 게재 번호(작게·보조색), 같은 사건 국내·해외 **연결 줄**(빌드 시 엄격 규칙 계산 — 같은 팀 2개 또는 같은 선수 + 같은 분류 + 36시간 이내 + 상대 카드 1장일 때만, 스키마 변경 없음 — D30), 1280 머리기사(imp 최고 1장, 필터 결과에는 없음) (FR-30, D23, D30) — 2026-10-18 완료: 화면 모델 순수 함수 `src/lib/news/feed-view.ts`(게재 번호 06~ · 머리기사 `leadIndex` = imp 최고·동점이면 앞 — 파일이 중요도 순이라 늘 첫 카드, 옮기지 않고 그 자리에서 1024 이상만 크게(DOM 순서 = 보이는 순서, 두 번 그리지 않음) · 태그(사전 밖 slug 제외·한국 선수 굵게) · 대회 탭 · '+N곳' = 서로 다른 출처명 수 − 1, 추가 출처가 모두 같은 매체면 '+N건'(2026-10-19 사용자 결정) · 이적 단계 — fs·zod 없는 순수 모듈, 태그 표는 `tag-labels.ts`) + 연결 줄 `src/lib/news/link-pairs.ts`(D30 엄격 규칙, 시안처럼 양쪽 — 해외 "국내 보도 ↓"·국내 "해외 보도 ↑") + 카드 `src/components/news/feed-card.tsx`(서버 컴포넌트) + 피드마다 섬 하나 `feed-island.tsx`(상대 시간 1분 갱신 + '+N곳' 위임 토글 — `<details>` 기각: 버튼은 메타 줄 안·목록은 메타 아래라 한 상자로 못 묶고 명세 `aria-expanded`를 못 지킴) + 표시 이름 로더 `src/lib/data/card-labels.ts`. 실측으로 고친 것: 상대 시간 칸 미리 잡기(가상 요소 치수 "00시간 전" — 채울 때 375 공유 앵커 CLS 0.16 → 0), 한글 제목 링크 패딩 13px(40 → 45.7px, M1-01 이월), 짧은 하이픈 단어 붙이기(M1-01 이월), '+N곳' 44px 영역 z 우선(혼합안 간격에서 제목 빈 패딩·연결 줄 빈 윗부분과 겹침), 출처 행 45px, 연결 줄 매체명은 리더 점선이 다 줄어든 뒤에만 줄바꿈. 실제 데이터 연결 줄 **0쌍**(10-17·10-18 — fixtures는 혼합안 4쌍 그대로), 견본(`SPECIMEN=1`)에 fixtures 23장 + 경계 사례(출처 8곳·태그 0·대회 0·이적 5단계 × Tier 1~3·긴 매체명 연결 줄). 초기 JS 138.0 → 139.7KB. 시안과 남은 차이는 메타 줄 5~8px(시안의 메뉴 버튼 — M1-35)·태그 표기(사전 D39 정식 표기), 검사 결과는 아래 이월 메모 끝
  - 🆕 M1-31 이월 메모: **M1-35** 카드 메뉴 버튼은 `CardMeta` 오른쪽 끝(시안 `ibtn--sm` 44px · margin −8 / −10)에 — 메타 줄이 시안 높이가 되고 375에서 시각이 둘째 줄로 내려간다(상대 시간 칸은 이미 자리를 잡아 CLS 없음), 메뉴 버튼 44px 영역도 '+N곳'처럼 위 제목 패딩과의 겹침을 견본 e2e로 확인 · **M1-33** 필터 결과는 `NewsFeed lead={false}`, 짝 카드가 숨으면 연결 줄도 숨김(`a[href="#짝 ID"]`), 피드 머리 "· 중요도 순"이 필터 설명 자리(news-feed.tsx), 상대 시간·'+N곳'은 `FeedIsland rootId`가 맡으므로 필터 섬과 역할을 나눔 · **M1-34** 7일이 넘은 카드의 상대 시간은 날짜 표기("10월 11일 (일)")라 치수 칸보다 넓다 — 아카이브에서 상대 시간을 뺄지 결정 · **M4-E** 결과 가림 띠는 feed-card.tsx 제목 바로 아래 자리 + 카드 `data-spoiler` · **M4-14** 치수 글자는 가상 요소라 Pagefind 색인에 들어가지 않음 · ~~사용자 결정 대기: 같은 매체 기사만 겹친 카드~~ → 2026-10-19 사용자 결정 '+N건'(추가 출처가 모두 같은 매체면 '+N건', 섞이면 '+N곳' + 기사 전부 — DECISIONS D0 §5 #30) 반영 · **/add-name** 사전에 없는 선수(marcos-rojo·cristiano-ronaldo 등)는 태그가 빠지고 연결 줄도 못 건다(10-17 리스 제임스 부상 해외·국내 카드 — 팀 1개만 같아 짝 없음) · 10-19 커밋 전 리뷰 반영: '+N건', 44px e2e 허용을 '+N곳' 버튼 가림으로만 좁힘(겹침 우선순위는 오케스트레이터 결정으로 유지), 미래 원문 시각은 "방금"(`cardRelativeTime`), `IndexTab data-slot`, 출처 행 `min-h-11.25` · 검사(리뷰 반영 후): 단위 4,773 · e2e 145(카드 16 신규) · 견본 53(카드 21 신규) 통과, axe 0, 홈 초기 JS 139.7KB
- [x] M1-32 홈: 오늘의 5줄(데이터 브리핑 — LLM 줄에 "AI 작성" 라벨, 템플릿 줄은 라벨 없음) + 주요 뉴스 피드 (다른 섹션은 해당 단계에서 노출) (FR-35, D24) — 2026-10-19 완료: `src/components/brief/today-brief.tsx`(`TodayBrief` — 서버 컴포넌트, JS 0) + 화면 모델 `src/lib/brief-view.ts`(순수 — 등번호 1~N·숫자 조각 `\d+(?:\+\d+)?(?:-\d+)?`·라벨 = 줄의 `ai`·탭 = `comps[0]`(D58)·부제 "{M월 D일}(현지) 경기 기준" — 경기일 = 발행일 − 1 = 입력 창 UTC 하루 D−1의 유럽 현지 경기일(사용자 결정)·1~4줄이면 "이날 N줄") + 로더 `src/lib/data/brief.ts`(`loadBrief(date)` — 없으면 null, 깨졌거나 date ≠ 파일명이면 던짐) + 라벨 `src/components/ui/ai-label.tsx`(`AiLabel` 링크 → `/about/#ai`, `::after` 44px · `AiLabelMark` 링크 아닌 견본 — `/about`의 `AiLabelSample`을 대체) + `briefErrorIssueUrl(date)`(paths.ts — summary-error 양식에 발행 날짜만, FR-36). 홈 = 5줄(main 첫 섹션) → 주요 뉴스(`id="news"`, 5줄 아래 `mt-9 lg:mt-11`), 다른 섹션 숨김, 목차 없음(M1-33). 결정: ① **템플릿 줄 = AI 줄과 같은 문장 행, 라벨만 없음**(2026-10-19 사용자 결정) — D45 ④로 템플릿 문형이 자연 문장이 되어 DESIGN의 '팀 이름 + 큰 스코어' 행(옛 홈 h-a 원정 문형)은 쓰지 않음(문장에서 팀·점수를 다시 뽑으면 문구를 바꾸게 되고, D45가 블록 안 문체 통일을 위해 바꾼 것) ② **그 호의 브리핑 파일이 없으면 블록을 싣지 않음**(10-12~14 같은 D38 전 호 — 사실 없는 안내 금지), 그 호 날짜 파일만 읽음(다른 날 브리핑 금지) ③ **S4(empty)** = 블록 유지·높이만 줄임: 거터 '0' 2px 레드 윤곽 + "오늘은 5줄을 쉽니다" + "전날 {대회 수}개 대회에 끝난 경기가 없었습니다."(입력 경기 0 = 종료 경기 없음 — 혼합안 '경기가 없었습니다'에 '끝난'을 더함, 수는 competitions.json, 오케스트레이터 확정) + "주요 뉴스로 ↓"(#news), 부제 "전날(현지) 경기 기준"(날짜 단정 없음 D30 #7) ④ 하단 "AI 작성 안내"는 AI 줄이 있는 날만(혼합안 S3·S4), 목록 `aria-label` = 실제 줄 수("2줄" — 혼합안 S3) ⑤ 숫자 조각 `whitespace-nowrap`(375에서 "1-/0" 줄 갈림 실측 → 수정). 뒤표지 설명 문단에 5줄·AI 작성 고지 문장(M1-30 이월 — /about#ai와 같은 사실, AI 답을 쓸 수 없는 날은 모든 줄 코드 문장까지). 리뷰 반영: 상한 상수를 zod 없는 `src/lib/brief-limits.ts`로(스키마가 다시 내보냄 — 화면 모델 zod 0, 단위 테스트가 import 검사) · `AiLabel` `cx`(섬 안전 목록·겹침 검사에 추가) · 라벨 앞 폭 0 공백(텍스트 "…. AI 작성") · /about "전날 끝난 경기가 없으면" · brief-file.ts 머리 주석(파일 없음 = 블록 없음). 견본에 S2(10-11 mixed)·S1(10-10)·S3(09-18 template 2줄)·S4(새 fixture `fixtures/brief-empty.json`) — 혼합안 S2와 같은 문장 4줄은 375·1024·1280 × 라이트·다크 요소 상자·글자·색이 같음(스크래치 실측). 검사: 단위 +54(brief-view·data-brief·today-brief — FR-35 ai:true 줄 전부 라벨·ai:false 없음, home-page 5줄·S4·파일 없음, paths) · e2e +9(home.spec — 첫 섹션·FR-35·375 첫 화면 4줄·라벨 → /about/#ai·이슈 URL 날짜) · 견본 e2e +20(brief.spec — 상태 4종·폭 5종 넘침·격자·글자·44px·숫자 한 조각·S4 앵커) · axe 0 · 초기 JS 139.7KB(변화 없음)
  - 🆕 M1-32 이월 메모: **M1-33** 목차(`AppShell contents`)를 넣으면 1024 이상 5줄도 지면 폭(728 @1024 · 984 @1280)으로 줄어 혼합안 `?stage=m1`과 같아진다(지금은 지면 한 열 1216px — 행 격자는 같고 문장은 46em에서 끊김) · **M4-15** 결과 가림: 5줄 줄 단위 띠·"모두 보기" 안내 띠·가린 줄의 AI 라벨 숨김(DESIGN §9.3 결과 가림, 혼합안 `.flap--line`) — 줄의 결과 여부 판정은 refs(m…)로 · **M1-35** 카드 메뉴 "오류 신고"는 `summaryErrorIssueUrl`(카드), 브리핑은 이미 `briefErrorIssueUrl` · **M1-37** 5줄 로딩 스켈레톤(`BriefRowSkeleton`)·오류 상태는 정적 빌드라 지금 쓰는 곳 없음(오류 = 빌드 실패 → 전날 사이트 유지) · **M1-34** 날짜 아카이브에 그날 5줄을 실을지(지금은 홈만) · **M1-33** 홈 1024 이상 한 열(1216px)은 목차로 해결(오케스트레이터 확정) · **실데이터** 10-17·18 파일은 `comps`가 없어 탭 없음 — 10-20 첫 정기 발행부터 탭이 붙는지 관찰(M1-41) · **M1-43** 5줄 브리핑 오류 신고 이슈 집계(날짜만 채움)
  - 🆕 D58 메모(2026-10-19): **M1-32** 5줄 행 대회 탭은 `line.comps`(CompId 배열, 첫 값이 대표) — comps 없는 파일(10-17·18 등 D58 전 발행)·대회를 못 찾은 줄은 탭 생략. 표기는 competitions.json shortKo/nameKo. 10-18 경기 ref의 대회는 추가 API 호출 없이 10-20 첫 발행 파일로 확인
- [x] M1-33 `/news` 필터(대회·팀·카테고리·한국 선수) + URL 쿼리 동기화 (FR-31, FR-32) — 2026-10-22 완료: 홈·`/news/` 공통(`NewsSection` + 앱 셸 `contents` = `NewsFilterContents`) — 1024 이상 목차(대회 6 · 분류 "전체" + 7 · 한국 선수 관련만 + 건수, 0건 비활성)로 2단(5줄·피드 지면 728 @1024 · 984 @1280 — M1-32 이월 해결), 1023 이하 분류 칩 줄(+ 한국 선수만, 대회 진입점 없음 #11), 대회 = 피드 머리 색 면(200ms) + 약칭·해제(`SectionHead liveFilter` — `data-comp` 속성 변형), 팀 = 주소 `?team=`만(진입 UI 없음, 머리 팀 상자 + 해제, 그 호 카드에 태그로 실린 팀만 유효), 쿼리 `comp`(소문자 ID)·`cat`·`team`·`kr=1`(순서 고정, 잘못된 값은 그 필터만 무시, 다른 쿼리·앵커 보존 — `src/lib/news/filter.ts`), 필터 섬 하나가 `history.replaceState` + `useSearchParams`(같은 페이지 링크·뒤로 가기 반영). 결정: ① **첫 페인트 전 적용** — 목차 맨 앞 보류 스크립트(`<html data-nf-pending>` → 필터 범위 `visibility:hidden`·전환 끔)와 피드 뒤 부트 스크립트(ES5 인라인, `filter-dom.ts`와 같은 결과 — 쿼리 17개로 DOM 동일 단위 테스트)가 하이드레이션 전에 그림(JS 차단·HTML 스트리밍 중에도 거를 카드 0프레임 e2e), 바꾸는 요소는 `suppressHydrationWarning`(글자 불일치 = 프로덕션 재렌더 방지) ② 필터 결과 머리기사 없음(#13 — 카드 `data-lead`·`data-paired` 속성 변형으로 바꿈), 짝 카드가 숨으면 연결 줄 숨김 + 아래 여백 복귀 ③ 홈도 주소 동기화(혼합안 홈이 갱신 — 추천안) ④ 건수는 그 호 전체 기준(시안), 0건 행·칩은 비활성(눌린 채 들어오면 활성) ⑤ 찍힘 150ms(사용자 조작만, 끝나면 속성 제거 — 쌓임 맥락 방지), 결과 `aria-live`("이적 4건"), 사라지거나 비활성이 된 버튼(눌린 채 들어온 0건 항목 끄기 포함)의 포커스는 보이는 눌린 분류로, 목록 머리가 화면 위로 지나가 있으면 피드 머리로. 견본 `/specimen/home/`(fixtures 23장 — 혼합안 홈과 목차·머리·칩·빈 상태 상자·색 실측 일치, 의도한 차이는 DESIGN §11.9). 검사·수치는 아래 이월 메모 끝
  - 🆕 M1-33 이월 메모: **M1-34** 날짜 아카이브는 `NewsSection filter` + `NewsFilterContents`를 그대로 쓴다(0건 안내는 이미 "이 호에는" — 2026-10-22 오케스트레이터 결정, 날짜 단정 없음), 목차를 실으면 설정 JSON·부트도 함께(`NewsFilterBoot` — 보류 스크립트의 `DOMContentLoaded` 안전망은 있다), 공유 앵커(`#카드ID`)와 필터 쿼리가 함께 오면(카드가 숨으면) 무엇을 우선할지 결정 · **M1-35** 카드 메뉴는 `li[data-nf-in]` 찍힘이 끝나면 속성이 지워져 쌓임 맥락이 남지 않는다(메뉴 z 5) — 메뉴를 연 채 필터를 바꾸면 닫을지 · **M2** 팀 화면이 `/news/?team=slug`로 링크할 때 그 호에 없는 팀은 무시(전체 피드) — 0건 안내를 원하면 사전 팀 전체 표기를 설정 JSON에 싣는 안(HTML gzip 약 +1.5KB) · **M1-37** 상태 4종의 빈 상태 ②는 `FilterEmptyState`로 구현됨 · **M1-39** 목차 행은 맞붙은 44px 상자(시안 그대로)라 실제 누름 판정 대신 상자 크기로 검사(경계가 소수점 위치 — DESIGN §11.9) · 2026-10-22 오케스트레이터 확정: 보고한 결정 5건 추천안대로(0건 비활성 · 팀 필터 현행 · 목차 44px · HTML +10.7KB 감수 · 깊이 스크롤 시 피드 머리로) · 리뷰 반영: 눌린 채 들어온 0건 항목을 끄면 포커스를 보이는 눌린 분류로(비활성 버튼에서 body로 떨어지던 것) · 부트가 보류 해제 전 머리 스타일 확정(Safari·Firefox 첫 로드 색 면 전환 방지) · 보류 스크립트 `DOMContentLoaded` 안전망 + 목차 있는 페이지 = 설정 JSON·부트 있음(페이지 테스트·빌드 결과 e2e) · JS 차단 375 `?kr=1` 칩 줄 밀기 e2e · 카드 `suppressHydrationWarning`은 머리기사·연결 줄 카드만 · 0건 안내 "이 호에는" · 검사: 단위 +83(news-filter 28 · news-filter-dom 49 · 페이지·UI 6) = 5,070 · e2e +52(news-filter — 실제 호: 클릭·주소·새로고침·해제·0건·키보드·내비 링크·뒤로 가기·JS 차단·칩 줄 밀기·스트리밍 첫 페인트·빌드 결과 부트 짝·axe·넘침 5폭·44px·포커스 링, shell 열 구성 갱신) = 229 통과(59 건너뜀) · 견본 +25(news-filter — 0건 항목 끄기 포커스 포함) = 98 통과 · axe 0 · 초기 JS 139.7 → **141.6KB**(+1.9 — 필터 섬) · HTML gzip 홈·뉴스 +10.7KB(목차·칩 마크업 + RSC 페이로드 중복)
- [x] M1-34 `/news/[date]` 아카이브: 이전/다음 날짜, 달력 점프, `generateStaticParams` (FR-33) — 2026-10-23 완료: 날짜 이동은 미니 시안 3개(`docs/design/m1-archive/` — D0에 없던 UI) 중 **A "스텁 넘김"**(2026-10-23 사용자 선택 — DECISIONS "M1-34 아카이브 날짜 이동"). 라우트 `src/app/news/[date]/page.tsx`(발행일 전부 `generateStaticParams` · `dynamicParams = false` → 결호·없는 날짜 404 · 빈 data/news는 창간일 한 칸 not-found — export 빈 배열 빌드 오류 회피), 순수 모델 `src/lib/news/archive.ts`(이전·다음 호 결호 건너뜀 · 달력 날 상태 4종·주 행·달 이동 = 그 달 첫 호), 표현 `src/components/news/counterfoil.tsx`(티켓 두 번째 절취선 + 꼬리표 ‹ 이전 호 · 달력 · 다음 호 ›, 끝은 "창간호예요"·"최신 호예요" + 월 격자 판 — 375 시트·≥1024 팝오버, 결호 점선·취소선, 보는 호 반전, 최신 호 테두리, 범례) + 렌더 없는 섬 `calendar-island.tsx`(펼침·보는 호 포커스·화살표·Esc·바깥 클릭, gzip 0.98KB). 결정: ① **이날의 5줄**(아카이브 h2, 파일 없는 호는 블록 없음 — `TodayBrief variant="issue"`, 사용자) ② **꼬리표는 `/news/`·아카이브만**(홈 없음 — `/news/` 임시 링크 대체, 사용자) ③ 마지막 업데이트(상단 내비·뒤표지) = 사이트 기준(최신 호), 티켓 스텁 = 그 호, 다른 날이면 날짜 붙임(오케스트레이터 + 서브에이전트) ④ 화면 밖 h1 "제 N호 · 날짜 지면"·7일 넘은 상대 시간 유지·월 이동 정적 링크·일요일 시작(오케스트레이터) ⑤ canonical = 날짜 페이지 자신, `/news/` → 최신 날짜 페이지. 시안 대조: 375·1024·1280 × 라이트·다크 × 접힘·펼침 12조합 요소 상자 전부 일치(스크래치 실측 — 픽셀 차이는 노치 안티앨리어싱·스텁 자간·데이터·사이트 업데이트뿐, DESIGN §11.10). 검사: 단위 5,070 → 5,138 · e2e 229 → 363 통과(아카이브 spec 53 + 필터 e2e에 지난 호 페이지 + links·a11y가 날짜 9쪽 자동) · 견본 98 · axe 0(펼친 달력 포함) · 초기 JS 홈 141.6 그대로 · `/news/`·아카이브 142.6KB(+1.0). 커밋 전 리뷰 반영(2026-10-23): ≥1024 팝오버는 판·버튼 밖으로 간 포커스(Tab)에도 닫힘(WCAG 2.4.11) · Esc는 판 안·버튼 포커스일 때만 버튼 복귀 · 팝오버 left 토큰 계산 · 창간일 뒤 첫 호 전 칸 "발행 기록 없음"(창간 전은 창간일 전만, 범례도 그 달 표기만) · 아카이브 S4 이유 대회 수 없음(CLAUDE §1-7) · 아카이브 "뉴스" 탭 `aria-current="true"`(`/news/`만 "page") · e2e 날짜 페이지는 표본(첫 호·최신·최근 3·결호 앞뒤·월 경계 — `archiveSample`, a11y도 표본, 링크 검사는 HTTP만이라 전수 유지)
  - 🆕 M1-34 이월 메모: **M1-35** 공유 URL은 `cardShareUrl(date, id)` = 날짜 아카이브 앵커(빌드에 9쪽 — 앵커·CLS e2e 있음), 카드 메뉴(z 5)는 달력 팝오버(z 6) 아래 · **M1-38** sitemap은 날짜 페이지(canonical)를 싣고 `/news/`는 최신 날짜 페이지가 canonical(별칭) · ~~**M1-29 문서** `.claude/commands/takedown.md` 10단계 날짜 페이지 확인~~ → 반영됨(2026-10-23 오케스트레이터 — 카드가 실렸던 날짜 페이지마다 확인) · **제안(보류 — 오케스트레이터 결정)** 필터를 유지하며 호 넘기기(꼬리표·달력 링크에 지금 필터 쿼리를 잇는 작은 섬 — 이번엔 넘기지 않음) · **달 이동 UX** 다른 달 첫 호로 가면 달력이 닫힌 채 열린다(제자리 월 전환 섬 없음 결정) — 11월 첫 호(2026-11-01 이후)부터 실제로 쓰임, 그때 펼친 채 이어 보기(세션 저장 플래그 등)를 다시 볼지 · **공유 앵커 × 필터 쿼리**(M1-33 이월) 앵커 카드가 필터에 걸리면 필터 우선(현행) — 공유 URL엔 쿼리가 없어 손으로 조합한 주소에서만 · **JS 없으면** 달력이 열리지 않는다(꼬리표 이전·다음은 링크라 동작) · **도구** Next 16.4.0 critical 권고(이미지 최적화 SVG RCE · Server Actions DoS · `use cache` RCE — 정적 export라 셋 다 안 씀) → **16.4.2 업그레이드 완료(사용자 승인 2026-10-23 — 01b4461, 운영 의존성 audit 0, 에이전트 세션 빌드 정지 해소)**. 그때까지 에이전트 세션에서는 `next build`가 업그레이드 안내로 한 번 멈추고 다시 돌리면 통과, `test:specimen`은 `out-specimen/cache`가 지워져 매번 멈춤(`npm run build:specimen` 결과는 완성 — 견본 Playwright를 따로 돌려 확인)
- [x] M1-35 카드 공유(Web Share/링크 복사, 카드 앵커) + 오류 신고 링크(카드 ID·브리핑 날짜 자동 입력) (FR-34, FR-36) — 2026-10-23 완료: 카드 메뉴 `src/components/news/card-menu.tsx`(서버 — 혼합안 `.menu-wrap`·`.ibtn--sm`·`.menu` 그대로: 카드마다 메타 줄 끝 44px 가로 점 3개 버튼 `CardMenuButton`(`data-card-id`·`aria-describedby` 제목·`aria-controls` 피드 메뉴) + **피드마다 메뉴 하나** `CardMenuPanel`(`hidden` `role="menu"` "공유하기"·"오류 신고↗", 목록 뒤 — 리뷰 반영: 카드마다 그리던 메뉴는 홈 DOM 23%·HTML gzip +8.7KB) + **피드 섬에 합침**(`feed-island.tsx` 위임 리스너 — 카드마다 섬 없음, 연 카드의 메뉴 묶음으로 메뉴를 옮기고 공유 URL·이슈 폼 URL의 카드 ID만 바꾼다, 닫으면 원래 자리로) + DOM 약속 `src/lib/news/card-menu-dom.ts`(열린 메뉴는 모듈 변수 하나 — 목록 순회 없음) + 공유 분기 `src/lib/share.ts`(의존성 없음). **공유 URL = 그 카드가 실린 호의 날짜 페이지 앵커**(`cardShareUrl(뉴스 파일 date, 저장된 카드 ID)` — 홈·`/news/`에서도, 절대 URL SITE_URL + basePath), 오류 신고 = `summaryErrorIssueUrl(ID, 날짜)` 새 창(↗ + 화면 밖 "(새 창)") — 서버가 빌더로 만든 피드 메뉴 값에서 섬이 카드 ID만 바꾼다(URL API, 빌더 결과와 같음 — 빌더를 섬에서 부르면 `cardShareUrl`이 `createPaths` 전체를 끌어와 gzip +2.4KB 실측). 메뉴 패턴 **APG Menu Button**(DESIGN §9.3 `aria-haspopup`·첫 항목 포커스 + 화살표 요구 — disclosure보다 맞음): ↓↑ 순환·Home·End·Esc 닫고 복귀(`preventDefault` — 달력 섬은 `defaultPrevented`면 건너뜀, 375 시트와 분리)·Tab 닫고 다음 요소·버튼에서 ↓↑로 열기·링크 Space, 문서 전체 하나만, 바깥 클릭·바깥 포커스·popstate로 닫힘(필터 칩 누름도 바깥 → 숨는 카드 메뉴 안 남음). 공유: 터치 기기 + Web Share → 시트(취소 조용히·그 밖의 거부는 복사로) / 그 밖 → 클립보드 → 토스트 "공유 · 링크를 복사했어요" / **복사 막힘 → "링크를 복사하지 못했어요" + "링크 열기"**(같은 출처 날짜 페이지 앵커로 이동 — 주소창에 링크, prompt·execCommand 없음, 6초 · 대체 경로라 액션으로 포커스 + 닫기 버튼 — Toast `focusAction`, 닫히면 메뉴 버튼으로 복귀). 앵커 도착은 M1-31 `:target`(250ms 틴트)·필터 우선(M1-33) 그대로. 혼합안 `?stage=m1` ↔ 홈 견본 실측(375·1024·1280 × 라이트·다크 × 닫힘·열림·토스트): 메타 줄·버튼·메뉴·항목·토스트 상자 0.1px까지 같음 — **M1-31 메타 줄 5~8px 차이 해소**. 의도한 차이: 열린 버튼 면 `--paper-2`(§9.2 아이콘 버튼) · 토스트 키 "공유"(§9.2 견본) · "(새 창)" · 항목 hover fast. 초기 JS 홈 141.7 → **143.1KB** · 뉴스·아카이브 142.7 → **144.1KB**(+1.4 — 메뉴 옮기기 +0.3 포함), 404·소개 138.1 → 138.2(Toast `focusAction`), HTML gzip 홈 45.9 → **49.9KB**(+4.0 — 카드마다 메뉴였을 때 +8.7), 홈 DOM 1,998개 중 메뉴 188개(9.4%). 이슈 양식 안내(summary-error·takedown)를 실제 UI "카드 메뉴(⋯) → 공유하기"로. 검사: 단위 +37(share 12 · card-menu 23 · 달력 Esc 1 · Toast focusAction 1) = 5,191 · e2e +24(`card-menu.spec` 375 터치·1280 — 연 카드마다 공유 URL·이슈 폼 전수·메뉴 하나·닫으면 제자리, 키보드, 복사 → 토스트·클립보드 값, Web Share 대역·취소, 복사 거부 → 링크 열기 포커스·Enter, 앵커 도착, 꼬리표 클라이언트 이동 뒤 메뉴, 375 달력 시트 + 메뉴 Esc, axe 메뉴 열림 라이트·다크, 넘침 5폭, 44px) = 365 통과(69 건너뜀) · 견본 +11(혼합안 치수 3폭 · axe · 스크린샷 6) = 109 · 견본 44px e2e에 메뉴 버튼 포함 통과(DECISIONS #29) · axe 0
  - 🆕 M1-35 이월 메모: ~~**M1-39** HTML gzip +8.7KB~~ → 리뷰 반영(오케스트레이터 결정 — 피드마다 메뉴 하나, +4.0KB) · **M5-10** 월별 병합 뒤에도 날짜 페이지 생성(공유 URL 영구 주소 — M5-10 줄 아래) · **M4-14** Pagefind가 메뉴 문구("공유하기"·"오류 신고" — 피드마다 하나)·카드마다 "카드 메뉴" 버튼을 색인하지 않게 `data-pagefind-ignore` · **M4-15** 결과 가림은 제목 아래 띠라 메타 줄 메뉴와 겹치지 않음(가린 카드도 공유 가능 — 공유 URL·미리보기에 결과 없음, OG는 D0 #9·M5-01) · **M1-43** 카드 오류 신고 이슈(카드 ID·날짜 채움)도 `summary-error` 집계 대상
- [x] M1-36 `/about`(서비스·발행 시각·출처·저작권 정책·Tier 설명·AI 고지·데이터 출처·연락처) + 커스텀 404 (FR-140) — 2026-10-19 완료: `src/app/about/page.tsx` + `src/components/about/`(차례·시각표·항목 목록·매체 목록·리더 점선) — 절 6개(`#schedule`·`#sources`·`#tier`·`#ai`·`#data`·`#contact`, `src/lib/about-sections.ts` `ABOUT_SECTIONS`·`aboutHref`), 1024 이상은 앱 셸 목차 열 차례(sticky)·1023 이하는 본문 2열 차례(같은 페이지 앵커는 일반 `<a>` — `:target` 머리 괘선 레드). 사실은 빌드 때 계산: 발행 시각 = `src/lib/about.ts` `publishSchedule`(D26 계절 구간·다음 전환 호, 기준일 = 최신 호), 매체·Tier = `configs/sources.json` 일일 수집 대상(`planDailySources().feeds`와 같은 규칙 — 테스트 대조)을 카드 매체명(`publisherNameOf` → `src/lib/publisher-name.ts`로 옮겨 화면·파이프라인 공용)으로 묶음, 대회 = `competitions.json`, 연락처 `CONTACT_EMAIL`(site.ts)·이슈 양식 `issueFormUrl`(paths.ts — takedown·summary-error). 404 = 섹션 머리 h1 + 빈 상태 윤곽 숫자 "404"(112/176px) + 홈·뉴스 링크(basePath 절대 경로 — 깊은 경로 e2e). 뒤표지 링크 = 혼합안 그대로 AI 작성 고지 · 소개·출처 정책 · 삭제·정정 요청 · GitHub(개인정보 처리방침은 M5-05). 모델 이름은 데이터 근거가 없어 쓰지 않음. 리뷰 반영(M1-31 병합 뒤): Tier 배지 `src/components/ui/tier-badge.tsx` 하나로(카드·about), 설정 읽기 `src/lib/data/config-file.ts` `readConfigFile` + 대회 설정 `src/lib/data/competitions.ts` 한 곳, 시각표 지금 계절 첫 호 = 창간일 이후, AI 고지 "바꾸거나 빼고"·"발행 전 마감" · 이월: "AI 작성" 라벨 견본을 M1-32 라벨과 맞춤 · `next/link`로 들어온 `/about/#…`(뒤표지·AI 라벨)은 `:target` 괘선이 안 걸림(위치는 맞음) · 검사: 단위 +25(about·about-page·404) · e2e +21(about.spec — 폭 5종 넘침·차례·앵커·404 깊은 경로) · axe 0(about·404 라이트·다크, heading-order) · 초기 JS 138.0KB(변화 없음)
- [x] M1-37 상태 디자인 4종: 스켈레톤 · 빈 상태 · 오류(마지막 정상 데이터) · 오프라인 (DR-07) — 2026-10-23 완료: D0 혼합안 견본(`#spec-states`)을 픽셀 수준으로 — 견본 `/specimen/states/`(SPECIMEN=1)와 혼합안 상자 실측 일치(오류 상자 313×95.09 @375·566×74.17 @1280, 오프라인 띠 313×61.84·566×44.92, 비시즌 날짜 160×41, 스켈레톤 375 행 37·78·128 — DESIGN §11.12). **① 로딩 = 견본 전용**(`LoadingSkeleton`): `app/loading.tsx` 실측 — 정적 export에서 로딩 경계가 생기면 HTML이 스켈레톤을 먼저 내보내고 본문을 숨긴 채 인라인 스크립트로 바꿔 끼워 **JS 끈 브라우저는 스켈레톤만 남음**, 경계 없이도 미리 받기로 이동 120~170ms·400ms 지연 응답에서도 이전 지면 유지 → 바로 교체(CLS 0) → 채택 안 함. **② 비시즌** = 홈 5줄 S4 자리(모든 대회 시즌 밖 — 개막 전 대회가 있으면 가장 먼저 개막하는 대회의 개막일, 모두 끝났으면 가장 늦게 끝난 대회의 종료일, `configs/competitions.json` 실값 startDate·endDate·season — 스키마 변경 없음), `restPeriodOf`를 `src/lib/rest-period.ts`로 옮김(M1-25 이월 — 게이트는 다시 내보냄), 날짜 아카이브는 S4 그대로, A매치 휴식기 문구 없음(근거 파일 M3-05). **③ 오류 — 발행 지연 안내**(홈·`/news/` main 맨 앞): 빌드가 최신 호 다음 날부터 14일치 [계절별 공개 목표 + 15분, 다음 날 KST 00:00) 구간(epoch ms — `issueLateWindows`, `PUBLISH_GRACE_MINUTES`를 time.ts로)을 싣고 상자 바로 뒤 **인라인 스크립트가 첫 페인트 전** `Date.now()`로 `<html data-issue-late>` → CSS 변형 `issue-late:`(첫 로드 CLS 0.0000~0.0006), 클라이언트 이동은 셸 섬. 문구 "오늘 호 발행이 늦어지고 있어요" + "지금 보이는 지면은 마지막으로 발행된 10월 23일 (금) 제 12호예요."(견본의 '검증 통과·원인 확인 중'은 사실 확인 불가로 뺌). 지금 cron-job.org 문제로 09시대 발행이라 07:15(10-26부터 07:45)~발행 사이에 실제로 뜬다(정상). **③ 5줄 자리 오류**(M1-32 이월): 파일 없음 + 첫 브리핑 파일 날짜 뒤 + runs.json 그날 게시 실행(success·partial) 기록일 때만 섹션 머리 + 상자 "오늘은(이날은) 5줄을 싣지 못했어요" + "이 호를 발행할 때 브리핑을 만들지 못했어요. 뉴스는 아래에 그대로 있어요."(원인 미기록 — 쓰지 않음, `src/lib/brief-slot.ts`). **④ 오프라인** = 셸 흐름 끝 sticky 띠(하단 탭 바로 위 · ≥1024 화면 아래 — 끊기는 순간 이동 0, 견본의 피드 위 위치와 다름), 토스트·scroll-padding이 띠 높이(`--offline-band-h`)만큼 비킴, 문구 "지금 페이지는 그대로 볼 수 있어요. 다른 페이지는 열리지 않을 수 있어요."(서비스 워커 없음 — M4-D). 섬 `StatusIsland` 하나(렌더 없음 — 오프라인·지연). 커밋 전 리뷰 반영: 띠 위치를 하단 탭 실측 높이(`--bottom-tabs-h`)로(글자 크기 20px에서 겹치던 것 — e2e) · 지연 재판정은 마운트(클라이언트 이동)만, 뒤로 가기 캐시 복원(`pageshow`)으로는 안 함(오래된 사본이 그사이 발행된 호를 늦었다고 말하지 않게) · 오프라인은 `pageshow`에도 다시 봄 · 상자·띠 `data-nosnippet`. 검사: 단위 5,234 → 5,284(issue-late 계절 경계·+15분·자정~목표·스크립트 = 섬 함수 · brief-slot · rest-period · states 컴포넌트·섬 · 홈·아카이브 페이지) · e2e 381 → 413 통과(`tests/e2e/states.spec.ts` — 가짜 시계 경계·당일·자정·이틀·아카이브·소개 없음·클라이언트 이동 · offline 이벤트 띠 위치·이동 0·토스트·글자 20px 탭 위 · axe 라이트·다크 · 넘침 5폭, 기존 홈·필터 e2e는 main 첫 섹션 기준으로) · 견본 109 → 122(`tests/e2e-specimen/states.spec.ts` 혼합안 상자 값·axe·넘침·44px) · axe 0 · 초기 JS 홈 143.1 → **143.4KB** · `/news/`·날짜 144.1 → **144.4KB**(+0.3). 지연 안내를 강제로 켠 빌드에서 기존 e2e 전부 통과 확인(CI가 07:15~발행 사이에 돌아도 깨지지 않음). DECISIONS "M1-37 상태 화면" 7건 확정(2026-10-23 — 스켈레톤 견본 전용·오프라인 띠 하단 sticky는 사용자 결정, 나머지 오케스트레이터 확정)
  - 🆕 M1-37 이월 메모: **제안(스키마 — 사용자 확인)** 5줄 자리 오류에 원인을 쓰려면 `RunLog.brief`에 게시 계획 이유(`planBriefPublish` reason — no-input·no-lines·brief-file 실패) 선택 필드 — 지금은 원인 없이 '싣지 못했어요'만 · **M1-41** 관찰 기간 07:15~09시대 발행 사이 지연 안내가 실제로 뜨는지 1회 확인(발행 뒤 새로고침하면 사라짐) · **M4-D** 서비스 워커가 생기면 오프라인 문구를 '저장해 둔 호'로·새 버전 토스트(FR-121)와 띠 정리 · **M4-14** 검색 결과 대기에 `LoadingSkeleton`, 지연 안내·오프라인 띠에 `data-pagefind-ignore`(숨은 안내 문구 색인 제외) · **M3-05** national-team.json이 생기면 A매치 휴식기 안내(`restPeriodOf` international-window) · **M1-39** 상태 화면도 시각 검증 대상(견본 `/specimen/states/`) · 한계: 페이지를 열어 둔 채 목표 + 15분을 넘겨도 안내가 새로 뜨지 않는다(새로고침·이동 때 반영 — 입력 없는 이동 방지), HTTP 캐시(Pages max-age 600초)로 받은 발행 직후 몇 분의 옛 사본은 첫 로드에 안내가 뜰 수 있다 · **M1-40 전 노출** cron-job.org 본 작업이 켜지기 전에는 매일 07:15(10-26부터 07:45)~실제 발행(지금 09시대 — 백업 schedule) 사이 홈·`/news/`에 안내가 뜬다(사실 그대로)
  - 🆕 M1-32 이월 메모(리뷰 중요 2): **D38 이후 호인데 브리핑 파일 없음(정형 입력 실패 — `planBriefPublish` no-input)** → 지금은 5줄 블록을 싣지 않는다(D38 전 호와 같은 처리). 5줄 자리에 사실이 확인되는 오류 상태를 보일지 — 판단 근거는 runs.json의 그 발행일 브리핑 단계 결과(입력 실패를 기록으로 확인할 때만, 추측 문구 금지). D38 전 호(10-12~14)는 계속 블록 없음
- [x] M1-38 기본 SEO: 페이지별 title/description/OG 기본값, sitemap, robots.txt (FR-124) — ~~❓ 프로젝트 사이트라 `/euro-digest/robots.txt`는 크롤러가 읽지 않음(호스트 루트만 유효) → Search Console sitemap 제출 vs 사용자 사이트 저장소 루트에 두기 결정 (M0-19 메모)~~ → 2026-10-18 사용자 결정: **sitemap.xml만 만들고 robots.txt는 만들지 않는다**(basePath 아래 robots.txt는 무효 — sguys99.github.io 저장소는 건드리지 않음), Search Console 제출·색인 정책은 M5 — 2026-10-23 완료: `src/lib/seo.ts`(순수 — `siteMetadata`·`pageMetadata`·`archiveDescription`·`newsDescription`·`sitemapEntries`) · 레이아웃 = metadataBase(SITE_URL + basePath)·제목 템플릿 "%s · 유로 다이제스트"·기본 설명(태그라인 + 오늘의 5줄·원문 링크)·OG(website·site_name·ko_KR)·twitter summary, canonical·og:url은 페이지마다(얕은 병합 — 404가 홈 주소를 물려받지 않게). 페이지: 홈(서비스 이름 단독·canonical 자신) · `/news/`("뉴스", 설명 = 최신 호 호수·날짜·카드 수, canonical·og:url = 최신 날짜 페이지 — M1-34 별칭) · `/news/[date]/`(제목 M1-34 그대로 "2026년 10월 14일 (수) 뉴스 · 제 3호", 설명 = "제 3호 · 2026년 10월 14일 (수) 지면 — (브리핑 줄이 있으면 ‘이날의 5줄’과) 유럽 축구 소식 N건…" — 사실만, 원제목·브리핑 문장 없음, canonical 자신) · `/about/`(canonical 자신) · 404(noindex는 Next가 넣는다 — 직접 주면 robots 메타가 두 번 나와 쓰지 않음). **결과 노출 0**(DECISIONS D0 §5 #9): `pageMetadata`가 제목·설명의 스코어 모양("2-1"·"2:1"·"2대1")을 만나면 빌드 실패. **og:image 없음**(D3에서 확정 — 워드마크·날짜·호수만). `src/app/sitemap.ts`(`force-static` → `out/sitemap.xml`): 홈(lastmod = 최신 호 generatedAt) · `/about/` · 발행된 날짜 페이지 전부(lastmod = 그 호 generatedAt), `/news/` 제외 — 현재 11항목. 검사: 단위 5,152 → 5,187(seo·sitemap 라우트·페이지 메타) · e2e 341 → 357 통과(`tests/e2e/seo.spec.ts` — out/ head 정적 HTML 전수: 색인 대상 title 유일·description·canonical 1개 = og:url·OG·twitter, 404 noindex 1개·canonical 없음, sitemap 파싱 → 모든 URL 200·canonical 자기 자신·lastmod = generatedAt, 색인 대상 = sitemap + `/news/` 별칭뿐(새 라우트를 sitemap에 빠뜨리면 실패), 스코어 모양·og:image 없음, robots.txt 없음) · 견본 98 · 초기 JS 홈 141.7·날짜 142.7KB(메타는 서버 전용 — 클라이언트 청크 변화 없음) · 이월: **M5-03** Search Console 등록·sitemap 제출(속성은 URL 접두어 `https://sguys99.github.io/euro-digest/` — 프로젝트 사이트라 robots.txt `Sitemap:` 줄 대신 제출), 구조화 데이터, 새 라우트(M2 대회·팀 등)는 `sitemapEntries`에 추가 · **D3/M5-01** OG 이미지가 생기면 `pageMetadata`에 `images` 추가(공통 OG 객체 한 곳)
- [x] M1-39 시각 검증: 375/1280 × 라이트/다크 스크린샷 ↔ D0 선택안 비교, 접근성 자동 검사, 번들 예산 확인 · 🆕 D0-11 이월: 실제 홈 콘텐츠로 폰트 지연 CLS·LCP 재측정(D0-11 scratchpad 하네스를 e2e로 — `local()` 폴백 글꼴이 없는 CI에서는 skip), Apple SD Gothic Neo·Android(삼성 글꼴·가변 Roboto) 실기기 폴백 메트릭(Safari `ascent-override` 미지원 확인), Barlow 800 preload 유지 여부(M1 홈에서 실제 사용 확인) · 🆕 2026-10-14 CI e2e 폰트 지연 CLS 실패(375 0.12 · 1280 0.28) 처리: 원인 = CI 한글 글꼴(WenQuanYi) 폴백 없음 + Linux Chromium이 size-adjust `local()` 글꼴을 정수 px로 반올림(라틴 폴백 약 +3%) + 375·414 라틴 제목 경계 사례(폴백 있는 구성에서도 1건, 메트릭 오차 안) → `tests/e2e/fonts.spec.ts`를 swap 단언(항상)과 CLS 단언(폴백 `local()` 있음 + 크기 비례일 때만, 아니면 skip + annotations에 측정값·사유)으로 나눔, 메트릭 값 변경 없음(DESIGN §11.3 ③). 남은 일: Windows·macOS·iOS·Android 실기기에서 실제 홈 지연 CLS(경계 사례 빈도) · 라틴 제목이 쓰는 Barlow 600(27KB)이 preload 밖이고 preload한 Barlow 800은 지금 홈에서 안 쓰임(D29 preload 재검토) · CLS 단언을 실제로 돌릴 환경(Windows 러너 또는 fixture 데이터 빌드) 결정 — 2026-10-23 완료(DESIGN §11.13): **시각 대조** 홈·`/news/`·날짜(최신·5줄 10-22·결호 앞뒤·첫 호)·`/about/`·404 × 375·1024·1280 × 라이트·다크(첫 화면·전체 + 지연 안내·오프라인 띠·견본 상태) ↔ 혼합안 `?stage=m1` — 티켓·섹션 머리(전부 `SectionHead` 하나)·섹션 간격(36·44px = 혼합안)·5줄·카드·목차·뒤표지 일치, 화면 사이 어긋남 없음(의도한 차이 4건 기록 — 소개 절 간격 48·64 · 뒤표지 업데이트 줄 · 상대 시간 칸 빈 폭 · 원제목 한자·🚨 시스템 글꼴). 구현 스크린샷 6장 `docs/design/d0/screenshots/impl-{home,archive}-*-fold.png`(DESIGN §0.1). **고친 것 3**: ① 짧은 화면의 목차 — 뉴스 필터 목차 820px가 sticky라 1280×800·1366×768·1024×768에서 '한국 선수'·아래 분류 행이 피드 내내 화면 밖 → 높이 화면 − 32px(− 오프라인 띠)·안에서 스크롤(넘칠 때 얇은 스크롤바 — 리뷰 반영, 포커스 링 6px — 행 위치 그대로, DESIGN §4.4) ② 포커스 스크롤 — Chrome은 가로 칩 줄에서 일부 보이는 칩에 포커스 스크롤을 안 해 375 Tab에서 '감독·구단'·'한국 선수만' 칩·링이 잘림 → 필터 섬 `focusin`(키보드 포커스만 — 리뷰 반영) → `scrollIntoView(nearest)`(WCAG 2.4.11) ③ **폰트 preload 0**(2026-10-24 사용자 결정 — PRD §15 D29 변경, D0-11의 한글 400 + Barlow 800 204.5KB 폐지): 첫 화면이 4면 모두 쓰고(CDP 실측) swap이라 LCP는 폰트를 기다리지 않는데, preload한 폰트가 첫 페인트 전에 오면 LCP가 늦어짐(조합 6가지 × HTTP/2 × 4G 2조건 — preload 하나라도 있으면 +0.12~0.4초) → 웹폰트 교체만 Slow 4G +0.5초·Fast 4G +0.14초 늦어짐, CLS는 메트릭 폴백이 막음. **성능**(모바일 4G — CDP 스로틀링, HTTP/2·gzip, 412px 배율 1.75, 5회 중앙값; Slow 4G = Lighthouse 모바일 기준 RTT 562.5ms·1.47Mbps·CPU 4×): LCP 홈 1.82 → **1.51초** · `/news/` 1.81 → **1.55** · 날짜 10-22 1.82 → **1.50** · 공유 앵커 진입 1.84 → **1.47** · 소개 1.64 → **1.50** · 404 1.58 → **1.40**(Fast 4G 0.53~0.74초), CLS 최대 0.0099(소개) · 나머지 ≤ 0.0016 — **예산(LCP ≤ 2.0초 · CLS ≤ 0.05) 통과**, 초기 JS 홈 **143.5KB** · 뉴스·날짜 **144.4KB**(+0.1 — `focusin`), HTML gzip 홈 50.6 · 뉴스 55.8 · 날짜 56.5 · 소개 20.3 · 404 8.5KB(홈 RSC 페이로드가 gzip 28.4KB — 56%), TBT 205~328ms(Slow 4G — M5-07 95점 기준 언저리). **폰트(D0-11 이월)**: 실제 화면 지연 CLS를 e2e로(`fonts.spec` — 홈·`/news/`·5줄 날짜 페이지, LCP < 첫 폰트 응답은 어디서나 단언, CLS는 폴백 조건일 때만) — WSL + Windows 글꼴(맑은 고딕·Arial) 0.0001~0.0002 · Noto Sans KR·Liberation 0.0003~0.0005, Linux Chromium은 배율 1·2·3 모두 size-adjust `local()` 반올림(라틴 폴백 +2.9%·−4.8%)이라 여전히 skip. **접근성**: axe 0(전 페이지 × 라이트·다크 + 기존 상태별), 페이지 전체 검사 2종 신설(`a11y.spec` — 실제 누름 영역 44px(문장 속 링크만 예외) · Tab 순회 포커스 링 3px·3:1·화면 안·스크롤 상자에 잘림 없음 × 5쪽 × 라이트·다크 × 375·1280 — ①②를 잡음, M1-33 이월 '목차 행 상자 크기 검사'도 실제 누름 판정으로 덮음), 가로 넘침 5폭 기존 spec. M1-01 이월(CI e2e가 빈 홈만) — data/가 9호 쌓여 CI도 실제 호로 돈다(fixture 빌드 불요). 검사: 단위 5,284 → 5,285(`news-filter-dom` focusin) · e2e 556개 중 471 통과·85 건너뜀(신규 +68 — a11y 누름 영역 26·포커스 링 20·오프라인 포커스 2, news-filter 짧은 화면·오프라인 목차 10(데스크톱 실행)·칩 탭 2(모바일 실행), fonts 8 → 16 — 두 프로젝트 합) · 견본 122 통과 · check:bundle 통과(홈 143.5 · 뉴스·날짜 144.5KB) · **리뷰 반영(2026-10-24)**: [중요] ① 필터 섬 `focusin` 스크롤을 키보드 포커스(`:focus-visible`)일 때만 — 누름·탭은 mousedown 포커스로 칩이 굴러 click이 빗나갔다(375 일부만 보이는 칩 탭 회귀, e2e '칩 줄 끝 탭 → 눌림' — 가드를 뺀 빌드에서 실패 확인) ② 44px 검사의 '문장 속 링크' 예외를 문단(p·dd) 속 인라인 `<a>`로 좁히고 예외 목록 단언(지금 `/about` '요청 방법' 하나 — 처음 규칙은 카드 `li`를 문단으로 보아 카드 제목 링크 45개를 뺐다, 카드 제목이 검사 대상인지도 단언) ③ 목차 스크롤바 — 오케스트레이터 결정으로 넘칠 때 얇은 스크롤바(`scrollbar-thin-ink` — 썸 `--ink-3`·트랙 투명·웹킷 대응, 클래식 스크롤바는 행 폭이 막대만큼 줄고 위치는 그대로) · [권장] 목차 높이에서 오프라인 띠 높이(`--offline-band-h`)를 뺌(e2e) · 칩 줄 `scrollbar-none`·목차 `scrollbar-thin-ink`를 globals.css `@utility`로, 높이 `100dvh − --spacing(8)`(sticky top-4 × 2) · fonts.spec preload 링크 type·crossorigin 루프 복원(0개면 통과)·낡은 주석·수치 통일(+0.12~0.4초) · 측정 도구·원자료를 `docs/research/m1-39-perf/`(서버·LCP·첫 화면 글꼴·preload 변형·요약 + 결과 jsonl·README 재현 절차) · 짧은 화면 목차 e2e를 목차가 실제로 붙는 스크롤 위치로(지면이 짧은 호는 skip) + '일부만 보이는 행' 실제 재현(행이 목차 아래 끝에 반쯤 걸친 상태에서 Tab → 행·링이 다 보임 — 세로 목차는 Chrome이 Tab으로 스스로 굴림, 가로 칩 줄만 섬이 필요) · 포커스 순회 400번 상한 전에 한 바퀴 완료 단언 + 가림 검사(요소 상자 가운데 `elementFromPoint` — 하단 탭·오프라인 띠) + 홈 오프라인 띠 상태 순회 · PRD §15 D29·DECISIONS D0 §5 #2·§6에 preload 폐지 기록
  - 🆕 M1-39 이월 메모: **🙋 실기기 확인**(이 환경에서 불가 — 체크리스트) ① iPhone Safari(Mac Web Inspector 연결): 콘솔에서 `new FontFace('t','local(Arial)',{ascentOverride:'90%'}).ascentOverride`가 '90%'면 ascent-override 지원(아니면 미지원 — Safari 세로 override 미지원 확인), Network 'Disable Cache' + 느린 회선으로 홈·`/news/`·5줄 날짜 페이지를 새로 열어 웹폰트로 바뀔 때 카드 제목·5줄 줄 수가 바뀌는지(화면 녹화), 콘솔에서 Apple SD Gothic Neo와 EuroDigest Sans의 한글 폭 비(아래 스니펫) — 2% 넘으면 macOS·iOS 폴백 패밀리 추가 검토 ② Android Chrome(삼성 — PC `chrome://inspect` 원격): 같은 스니펫으로 기본 한글 글꼴 폭 비·`document.fonts`에서 'EuroDigest Sans Fallback Noto' 면 status(loaded면 Noto 있음), DevTools Performance(Slow 4G·CPU 4×)로 LCP·CLS 기록 ③ Windows Chrome·Edge: Lighthouse 모바일로 홈·`/news/`·날짜 페이지 LCP·CLS·TBT, 원하면 `npx playwright test tests/e2e/fonts.spec.ts`(Windows는 폴백 반올림이 없어 CLS 단언이 실제로 돈다) — 스니펫: `(()=>{const t='다람쥐 헌 쳇바퀴에 타고파 이강인 김민재';const w=f=>{const s=document.createElement('span');s.style.cssText='position:absolute;white-space:pre;font:400 20px '+f;s.textContent=t;document.body.append(s);const x=s.getBoundingClientRect().width;s.remove();return x};const web=w('"EuroDigest Sans"'),sys=w('-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif');console.log({web,sys,ratio:sys/web})})()` · **❓ CLS 단언 환경 선택지**(추천 A): A 지금처럼 Linux CI는 skip + annotations, 실기기 ③에서 수동 확인(비용 0) · B CI에 `windows-latest` job으로 `fonts.spec`만(맑은 고딕·Arial — 실제로 단언, 공개 저장소라 분 비용 없음·실행 +3~4분·빌드 산출물 전달 필요) · C macOS 러너(Apple SD Gothic Neo 폴백 패밀리가 없어 한글 그룹이 늘 skip — 측정용으로만) → M5-07 성능 마무리 때 B 재검토 · **제안(HTML 크기 — 사용자 결정 전 구현 안 함)**: 홈 HTML gzip 50.6KB의 56%가 RSC 페이로드(같은 카드가 HTML·RSC에 두 번). 안 ① 홈 피드를 상위 N장(예 20장) + '전체 45건 → /news/'로(HTML·DOM 약 절반, 제품 결정 — 화면 구성 변경) ② 카드 피드를 정형 JSON을 받는 클라이언트 렌더로(RSC −60~70% 추정, 초기 JS +5~8KB·하이드레이션 구조 변경 — 큰 작업) ③ 지금은 두고 `check:bundle`에 HTML gzip 경고선(예 64KB)만 — 추천 ③(LCP 1.5초로 예산 여유, M2 위젯·M5-07 Lighthouse 때 다시) · **M5-07** TBT 205~328ms(Slow 4G — 4× CPU의 HTML 파싱·하이드레이션 긴 작업 최대 0.4초)가 Lighthouse 95점 기준(≈200ms) 언저리 · **M4-14** 원제목 한자(韓·獨·西·日·前·無)·이모지는 서브셋 밖(Pretendard에 한자 없음 — DESIGN §3.7) · 측정 도구는 `docs/research/m1-39-perf/`(README 재현 절차 — M5-07 Lighthouse 전후 비교에 다시 쓴다)

### M1-F 운영 리허설·실측 🆕
> 🆕 관찰 도구 준비(2026-10-18, M1-41·42·43·46): `npm run observe -- [--date D]`(Actions 실행·가드 판단·공개 시각(배포 완료) → 계절별 목표 07:00/07:30 대비 정시·+15분·지각 판정, runs.json 비용·토큰·캐시, 브리핑 mode, 카드 수, 수집 로그의 경기 상태 분포 `windowStatus`(창 안 미종료·킥오프 130분 뒤 미종료 = 점수 지연 의심)) · `--week`(정시 일수·비용·캐시 적중 — 재시도로 생긴 2요청 날은 미적중 정상으로 구분, 시험 측정 날 제외) → `docs/research/m1-observation.md` · `npm run probe:gdelt`(하루 1회, 쿼리 2개·요청 ≤ 3건·간격 6초, 7일 재활성 판정 — 본문 읽기 실패는 network로, `--force`는 앞 시도도 성공률에 포함) · `npm run quality:sample -- --from D1 --to D2`(브리핑 20줄·카드 20건 검수표, 라틴 이름·한자·refs 자동 표시 → `docs/research/m1-quality-review.md`). 출력은 `docs/research/` 아래 .md만(data/ 쓰기 금지). 10-18 시험: observe 수동 dispatch 3회(첫 공개 14:39 KST — 참고용) · GDELT 3요청 중 429 2건, ① `sourcelang:korean` 재시도 200 · 250건(상한) · 최신 seendate 지연 91분(기준 60분 초과) · 허용 도메인 0 → 관찰 기간(10-20~10-26) 하루 1회 측정. 매일 아침 공개 뒤(08:00 KST 이후) `git pull` → `npm run observe` → `npm run probe:gdelt`
- [ ] 🚧 M1-40 수동 dispatch 3회 연속 성공 → cron-job.org **작업 2개(06:30·07:10 KST) 정기 실행 활성화**(D26 — M1-47 가드가 계절에 맞지 않는 쪽을 skip). 🆕 **cron-job.org 백업 작업 2개 추가**(06:40 `slot=summer`·07:20 `slot=winter` — PRD §15 D48 ③, GitHub schedule은 실측 2시간 이상 지연) · 🆕 **dispatch 본문에 `slot` 필수**(M1-47, 2026-10-15): 06:30 작업 `{"ref":"main","inputs":{"slot":"summer"}}` · 07:10 작업 `{"ref":"main","inputs":{"slot":"winter"}}` — `slot` 없는 dispatch는 수동 실행으로 취급돼 계절 판정 없이 12시간 가드만 거치므로, 본문을 `{"ref":"main"}`으로 두면 겨울에 06:30 실행이 수집하고 07:10이 skip돼 D26이 무력화된다. M1-47이 main에 들어간 뒤 바꾸고(정의되지 않은 입력은 GitHub 422), 활성화 후 Step Summary '계절 슬롯' 행 확인, 겨울 첫 발행일 10-26 전 완료 + 저장소 변수 `COLLECT_ENABLED=true`(백업 schedule 2개 활성화, M0-14·M1-47)
  - 🆕 M1-40 진행(2026-10-18): **수동 dispatch 3회 연속 성공** — run 39100995214(카드 45장·브리핑 llm 2요청(FR-29 재시도)·$0.0082·API-Football 23회) → 39101357630(force, 새 카드 0·브리핑 생략·API-Football 23회) → 39101698305(force, API-Football 14회 = 그 UTC 날 봇 상한 60 도달 → 실행 상태 partial, 상한 경로 정상 동작) — 세 번 모두 수집·검증·빌드·커밋·배포 성공. **정기 실행 활성화는 10-19(09:00 KST 한도 리셋 뒤)로 미룸**(오케스트레이터 결정): 오늘 낮 dispatch가 쓴 UTC 10-18 한도를 10-19 06:30 첫 봇 실행이 나눠 쓰지 않게 → 첫 정기 발행 10-20, 7일 관찰 10-20~10-26(전환일 10-25·겨울 첫 발행 10-26 포함). 남은 일: `COLLECT_ENABLED=true`(오케스트레이터, 10-19) · 🙋 cron-job.org 본 작업 2개 본문 slot 갱신·활성화 + 백업 작업 2개(06:40 summer·07:20 winter) 추가 → 첫 실행 Step Summary 계절 슬롯 확인. 발견: 같은 발행일 재실행이 브리핑 게시 뒤에도 API-Football 상세를 다시 받음(②에서 23회) → M1-41 관찰 메모·개선 후보(브리핑이 이미 게시된 날은 원장 갱신에 필요한 미종료 경기만 재조회)
  - 🆕 M1-40 진행(2026-10-19 20:16 KST): 저장소 변수 `COLLECT_ENABLED=true` 설정(오케스트레이터 — 10-19 낮 dispatch 없음, 첫 봇 실행 10-20 06:30 KST가 UTC 10-19 한도를 온전히 씀). 남은 일: 🙋 cron-job.org 본 작업 2개 본문 slot·활성화 + 백업 2개 추가 → 10-20 첫 실행 Step Summary 계절 슬롯 확인 후 M1-40 완료 처리
- [ ] M1-41 7일 연속 정시 발행 관찰 — 그날 계절의 목표 시각(유럽 서머타임 07:00 · 표준시 07:30 KST)까지, 늦어도 +15분 기준(D48 — 일찍 공개 허용) (D26). 계절에 맞지 않는 트리거가 skip되는지 확인하고, 관찰 기간이 서머타임 전환일과 겹치면 전환 다음 날 발행 시각 변경과 경기 시각 KST 표시도 확인. 수집 시점의 경기 상태 분포(미종료·점수 지연)를 기록(M0-28) · 🆕 ESPN 피드(2026-10-14 러너 202 빈 응답으로 비활성)를 관찰 기간에 러너에서 1회 재확인 → 정상이면 재활성
  - 🆕 2026-10-25 사건·D60(사용자 결정): 10-25 호 08:42 KST 수집(run 40143777845)에서 football-data가 브리핑 창(UTC 10-24) 19경기를 킥오프 10시간 뒤에도 IN_PLAY 5·TIMED 14로 줌 → 종료 0 → mode empty → 홈 S4 "전날 6개 대회에 끝난 경기가 없었습니다" 오게시(21:07 재수집 40191669281도 같음, API-Football 19경기 상세는 아침에 모두 받아 원장에 있음). 조치: ① football-data 미종료(awaiting) 경기를 같은 실행·원장의 API-Football 종료 결과로 보충(추가 호출·LLM 0 — `scripts/lib/brief-supplement.ts`, 연결은 대응표가 팀을 확인하는 쌍만 `team-ids.ts linkPendingMatches`, 그 대회 순위 제외, 로그 `summarize.input.done` supplemented…) ② 보충 뒤에도 입력 0이고 창 안에 기다리는 경기가 있으면 `emptyReason: "results-pending"`(BriefFile 선택 필드) → 5줄 블록은 S4 대신 '5줄을 싣지 못했어요' 상자, 같은 날 수동 재실행(force dispatch)만 덮음(결과 지연 실행도 수집 job 성공이라 백업 schedule은 12시간 가드로 건너뜀). 리뷰 반영(2026-10-25): 연결은 대응표가 확인한 쪽 팀 이름을 교차 확인(`teamNamesAgree` — 사전 팀 항목 우선, 어긋나면 `name-mismatch`), 홈·원정 뒤집힘 회귀 테스트. 10-25 원장 재현: 19경기 중 16경기 보충(대응표 두 팀 5·한쪽 11), 3경기 대응표 밖 미보충. 관찰: `summarize.input.done` fdAwaiting·supplemented·awaitingAfterSupplement·supplementUnlinked(unconfirmed 빈도 → team-ids.json 보강 후보), `summarize.brief.skip reason results-pending` 빈도. 10-25 파일(키 없는 empty)은 다음 수집이 덮지 않으면 S4 그대로 — 재수집(force dispatch)은 오케스트레이터 판단
- [x] M1-42 💰 첫 주 실측 비용(단건 브리핑, thinking 포함) 확인 → PRD §9.3 비용표 갱신. 캐싱 코드는 유지(B3 미발동 — D28)하고 요청 2개 이상인 날의 캐시 적중만 확인 — 2026-10-25 완료(사용자 결정 2026-10-24: 정시 관찰과 별개로 첫 주 정기 발행 10-18~24 기준): D57 이후 하루 평균 $0.0025·30일 환산 약 $0.074(월 예산 2.5%)·잘림 0·2요청 이상인 날 없음(캐시 적중 대상 없음 — 캐싱 코드 유지) → PRD §9.3 비용표 실측 행. 근거: `npm run observe -- --week --from 2026-10-17 --to 2026-10-24`(docs/research/m1-observation.md 주간 요약)
  - 🆕 2026-10-18 D57(사용자 결정): 10-18 prod 첫 브리핑 요청이 `max_tokens` 8,192에서 잘림(thinking 8,190·34.8초 → FR-29 재시도 4,963으로 성공) → `max_tokens` 16,384·브리핑 요청 타임아웃 120초(마감 안 min(120초, 마감 − 현재) — thinking·effort·단건·모델 불변). 💰 dev 확인 eval 2요청(`eval-dev-20261018T064719Z-01b6`, $0.008719): 10-11 골든 출력 9,483(thinking 9,206)·37초(8,192였다면 잘림)·10-10 5,446·22초, 잘림 0/2 · 가드 최악값 요청당 약 $0.018(일 예산 18%) · 첫 주 실측에서 잘림·마감 강등(남은 40~70초 구간)을 함께 본다 · `MAX_TOKENS_CEILING`(llm.ts 전역 상한)도 16,384라 주간 배치 2곳(M3-07·M4-05) 착수 때 호출 지점별 `max_tokens`를 따로 정한다(사용자 승인 — CLAUDE §1-3)
- [x] M1-46 🆕 GDELT 소량 재측정 — 7일 관찰 기간(M1-41)에 하루 1회, 쿼리 2개·요청 3건 이내. 재활성 기준: 7일 성공률 ≥ 80% · 한국어 24시간 결과 수백 건 · seendate 지연 ≤ 1시간 · 허용 도메인 결과 주 1건 이상 → 충족 시 허용 도메인 OR 쿼리 1개만 켬 ❓ (M0-27) — 2026-10-25 종결 **재활성 안 함**(사용자 결정 2026-10-24): 10-18 시험 측정 요청 3건 중 429 2건·최신 seendate 지연 91분(기준 ≤ 60분)·허용 도메인 0건, 10-22부터 이 개발 머신에서 api.gdeltproject.org 연결 시간 초과(www는 정상) — 재활성 기준 4개 중 2개(지연·허용 도메인) 미달이 확인됐고 측정 환경도 불안정. `gdelt-doc` 비활성 유지, M1-05·07 보류 그대로, 측정 도구(`npm run probe:gdelt`)는 남겨 M5 이후 필요하면 러너에서 재측정
- [x] M1-43 첫 주간 품질 검수: 브리핑 20줄(입력 데이터 대조·고유명사) → 정확도 ≥ 90%, 카드 20건 코드 분류(카테고리·태그·이적 단계·spoiler) → 정확도 기록·규칙 보정 (D23·D24) — 2026-10-25 완료(사용자 결정 2026-10-24: 정시 관찰과 별개로 지난 7개 호 10-17·18·20·21·22·23·24 — 10-23 브리핑 empty): `npm run quality:sample -- --from 2026-10-17 --to 2026-10-24`(시드 1) → `docs/research/m1-quality-review.md`(판정·메모 + 결과·원인·개선안 절) ① **브리핑 20줄 — 사실 20/20(100%, FR-22 충족)**: 스코어·승패·득점자·분·결승/동점/만회골·순위 서술 모두 입력과 일치(원장·골든 입력 10-17·MD2 표 + MD3 원장 재계산 UCL 순위로 대조, 표본 밖 10줄도 사실 10/10, 기간 30줄 모두 AI 줄 — 템플릿 강등 0(M1-23 이월 지표)). **고유명사(발행본) 12/20 → '둘 다 ✅' 60%(발행본 기준 ≥ 90% 미달)** — ❌ 8줄 모두 미등록 이름 영문 잔존(조사 오류 0), 1·2차 사전 반영 뒤 지금 사전으로 재치환하면 남은 영문 3줄(Deportivo 저장분 — 지금은 입력 정리로 해소·Pavel Kacor·Sabah FK) → **현재 규칙 기준 18/20 = 90%(경계 통과)**, 지시문 수정·eval:prompt 불필요 ② **카드 20장(층별 — 규칙 점검 값): cat 12/20(60%) · 태그 18/20(90%) · 이적 단계 19/20(95%) · spoiler 19/20(95%) · 4항목 모두 10/20** — cat ❌ 8 중 4 보정('take knee'→부상·'breaking down'→결과 오탐, '줄부상'·'fiducia a' 미인식) → 보정 뒤 같은 표본 cat 16/20·spoiler 20/20, 태그 ❌는 성 별칭(Diaz·Kane)·'샬케' 국내 별칭, 이적 ❌는 김민재→AC 밀란 rumor 보수적 미탐(기간 이적 카드 34장 중 transfer 정보 1장 — 등록 선수 없음 24) ③ **기타 비율(D47 ① ≤ 30%)**: 발행분 149/314 = **47.5%**(ko 29%·en 49%·it 80%) → 키워드 보강 뒤 재분류(대표 제목 + 출처 대회 근사) 157 → 133장(50.0% → 42.4%), 발행분 기준 추정 **47.5% → 41.1% — 미달**, 변경 40장 하나씩 확인 **새 오분류 0**(기간 밖 63장 변경 1장 — 정당) ④ **규칙 보정**(`news-keywords.ts`만 — 스키마·카테고리·LLM 변경 없음, 다음 수집부터 적용, 기존 data 불변): 이적 +'리턴설'·'done deal(s)' / 제외 'sign of'·중계권 입찰 문형('invite(s) bids for new'·'bids for tv rights' 등)·'far from a/not a done deal'·'사전에 합의된/한'·'영입생'·'이적생' · 결과 +'come out on top'(법조동사 꼴은 경기 전 — `MODAL_RESULT_PHRASES`)·'연속 무승'·'무승 수렁/늪'(약한 표현) · 주어 있는 결과 +'held at home'·'humbled by'·'nets double'·'double helps'·'ribalta(no)'·'regala tre punti'·'결승골'·'극장골' / 제외 'breaking/broken down'·협상 결렬 구('talks break down' 등 — 맨 'break down'은 결과 숙어)·'humbled by'+감사 대상·'alla ribalta'·'ribalta la sentenza/il verdetto/la decisione' · 부상 +'taken to hospital'·'could be out for'·'out for 기간'·'a doubt'·'fuori per'·'coscia' 등·'타박상'·'통증'·'시즌 아웃'·'감염'·'구급차'·'줄부상' / 제외 'take(s)/took (the/a) knee'·'without/never/not a doubt'·'cast(s) a doubt'·'out for revenge/blood/redemption'·'fuori per scelta/squalifica/mano/motivi/un soffio/lutto' · 감독·구단 +'resign'·'bans'·'suspension'·'suspended'·'director of football'·'technical director'·감독 일 구('returns to management'·'into management' 등)·'captaincy'·'fiducia a' / 제외 'match/play suspended'·'temporarily suspended'·'suspension of play'·'suspended sentence' — 테스트 `tests/classify.test.ts` 'M1-43 실데이터' describe(it 7개 — 리뷰 회귀·경기 전 기사 spoiler 보수적 true 포함). 🆕 리뷰(2026-10-25) 반영: 중요 4(맨 'break down' 제외의 결과·spoiler 미탐 회귀·'out for revenge'·흔한 낱말 오탐 7종·테스트) + 권장 5(사전 합의·invite bids 좁힘·MODAL 'come out on top'·무릎 꿇기 변형·'시즌아웃' 중복) — 재분류 결과 같음(기타 42.4%·변경 40·새 오분류 0), 현행 유지 4건 근거는 검수 문서. check·validate·build 통과. football-data 12요청(도구 2회 × 6일), LLM 0·API-Football 0
  - 🆕 고유명사 반영(사용자 결정): **2026-10-22 1차** names.ko +26(높음·중간 24 — 표기 갈림 7명은 국내 매체 관용 페드로 네투·이고르 티아고·브래들리 바르콜라·알렉스 이워비·일리만 은디아예·산데르 베르게·아코르 애덤스, 낮음 중 브리핑 노출 2 — 안토니오 라이몬도·다니 레케나) + rodri 별칭, 브리핑 입력 정리가 사전에 없는 팀 짧은 이름을 football-data 정식 이름으로 보냄(D46 'Deportivo' — names.ts teamFullNames, 뉴스 태그 규칙 불변) · **2026-10-23 2차** +6(국내 매체 관용 — 오마르 마르무시·비티냐·세루 기라시·마르틴 사트리아노·지오반니 시메오네·조슈아 지르크지), 아코르 아담스 → 애덤스 정정(1차 근거 오인), 파벨 카초르 보류 → 10-17~10-23 브리핑 25줄 남은 영문 14 → 3(Deportivo 저장분·Pavel Kacor·Sabah FK). 근거 URL은 각 사전 항목 note
  - 🆕 M1-43 이월 메모: **D47 기타 ≤ 30%** 키워드만으로는 41%대(남은 기타는 인터뷰 인용·감독 이름 제목 43·선발 명단 9·기획) → **사용자 결정 A(2026-10-25) — 감독 항목 20~30명 확장(/add-name — 표기안 → 사용자 확인) 후 인용 머리 규칙**('Team, 감독: "…"'·'… - 감독'·제목 주어 감독 = 감독·구단, 예상 29~31%, 위험 동명 선수 시메오네 — 이번 보정에는 넣지 않음) → ✅ **반영됨(2026-10-25)**: names.ko 감독 13 → 32명(현직 17 + 키스 앤드류스·안토니오 콘테, 국내 매체 관용 — '한지 플리크' → '한지 플릭'), 성 단독 별칭은 저위험 14개만(D46 '기본 미반영'의 사용자 예외) + `news-keywords.ts` `managerSpeechOf`(감독 이름 + 인용 머리·출처·발언 동사·국내 큰따옴표 문형 → classify.ts 감독·구단 자리, 앞선 카테고리 우선, 이름만 있으면 기타) → 10-17~25 8개 호 359장 재분류(대표 제목 + 출처 대회 근사) **기타 148 → 136장(41.2% → 37.9%)**, 바뀐 12장 모두 기타 → 감독·구단(감독 인터뷰 인용 — 하나씩 확인, **새 오분류 0**), spoiler·태그·kr·이적 변화 0, 결과 카드 1장 엔티티 병합 대상에서 빠짐(감독 발언 — D42 의도대로), 기간 밖 18장 변화 0 · **≤ 30% 미달** — 남은 감독 발언 제목 13장은 성 별칭이 없는 감독(기존 감독 저위험 성 Carrick·Mourinho·Emery·Arteta·De Zerbi 8장 → 35.7%, 중간·고위험 Amorim·Abate·Conte·Andrews 5장 → 34.3%), 나머지는 프리뷰·선발 명단·해설·선수 인터뷰 → 🙋 다음 결정 후보(기존 감독 저위험 성 별칭 · 목표 재설정 B ≤ 40%) — 검수 문서 §6 · 🙋 /add-name 보류 2건(Pavel Kacor·Sabah FK) + 태그 후보('샬케' 국내 별칭, 성 별칭 정책) · **제안** 브리핑 영문 잔존 줄을 이름 없는 템플릿으로 바꾸는 옵션(FR-24 변경 — 사용자 결정, 테스트 초안은 검수 문서), 득점 상위자 선제 등록(football-data scorers 6요청), quality-sample `findLedgerMatch` 근거 연결(원장 자동 연결 5/14), 작은 규칙 후보('UEFA 계수·랭킹' 제목 국가 이름 제외·'doppietta contro'+팀 = 결과·'EXCL:'/금액 소문 = 이적) · **M5-09** 운영 리포트에 기타 비율·영문 잔존 줄 수

### ✅ M1 완료 기준
- [ ] 7일 연속 계절별 목표 시각(07:00/07:30 KST, D26)까지·늦어도 +15분 발행(D48) (일 30~50건, 잘못 합친 카드 0 — 같은 사건 중복 감소율은 샘플 검수로 기록, PRD §15 D42)
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
> 🆕 D60 이월(2026-10-25): 결과 지연 판정(`briefEmptyReason`)은 창 안 6개 대회 API-Football 종료 상세가 있으면 football-data가 경기를 모를 때도 `results-pending`이다 — UCL 예선 등 football-data 무료 플랜이 주지 않는 경기를 API-Football만 가지면 매일 결과 지연으로 판정된다(S4 대신 '5줄을 싣지 못했어요'). M2 전에 football-data 대회 포함 범위(예선·플레이오프 단계)를 확인하고, 빠지는 단계는 판정에서 제외할 것
- [ ] M2-01 `configs/competitions.json` 마무리 — 6개 대회·`apiFootballLeagueId`·시즌·UCL 구간·리그 강등 구간은 M0-29에서 1차 출처로 작성했다. M2에서는 순위표 구간 표시(FR-42)가 이 값으로 동작하는지 확인한다. 남은 것은 **유럽 대항전(챔스·유로파·컨퍼런스) 진출 구간**뿐이다 — 2027-28 UEFA 액세스 리스트·2026-27 국가 계수(EPS)·국내 컵 우승팀 반영 규칙이 확정되는 시즌 후반(2027-03 전후)에 1차 출처로만 추가한다(관행값 금지 — §16 시즌·이벤트)
- [ ] M2-02 football-data 어댑터(`scripts/lib/providers/`, M1-44 최소 어댑터를 확장): 순위·경기·득점, 분당 10회 지연, 실패 시 전일 데이터 유지 + "업데이트 지연" 표시
- [ ] M2-03 순위 변동(전일 대비)·최근 5경기 폼 계산 + 단위 테스트 → 브리핑 입력(M1-19)에 순위 변동 추가 (D24)
- [ ] M2-04 팀 목록 생성: 5대 리그 96팀 + UCL 외부 팀 → `data/teams/*.json`, slug 규칙 확정 · 🆕 slug 규칙 확정 때 `configs/team-ids.json`(M1-44, D33)의 어색한 slug 14개를 함께 정리(`07-elversberg`·`acf-fiorentina`·`ssc-napoli`·`genoa-cfc`·`parma-calcio-1913`·`frosinone-calcio`·`tsg-1899-hoffenheim`·`vfb-stuttgart`·`angers-sco`·`as-monaco`·`le-havre-ac`·`lille-osc`·`paris`·`koln`·`paderborn-07`, `hamburger`·`internazionale-milano` 검토 — 2026-10-13 사용자 결정), 대응표에서 팀 목록을 시작
- [ ] M2-05 `names.ko.json` 팀명 전체(~110팀) + `team-colors.json`(2색 + 영문 약어) — Claude Code가 초안 작성 → 🙋 사용자 검토 (DR-05)
- [ ] M2-06 주요 선수: 팀 내 득점·도움 상위 3명 (FR-54)
- [ ] M2-07 포메이션 (D27): M1-48이 쌓은 라인업(`lineups[].formation`)의 최빈값 — 추가 API 호출 없음. `formations.json` 수동은 보조(수집 초기 경기 수 부족·데이터 누락 팀), 둘 다 없으면 미표시. `Team.formation.source`는 `api`/`manual` (FR-55)
- [ ] M2-08 `bigmatch-rules.json`(더비 목록·가중치) + "오늘 밤 볼 경기" 선별 로직 + 테스트 (FR-80~82, FR-84)
- [ ] M2-09 `collect.yml`에 축구 데이터 단계 통합, API 호출 수 `runs.json` 기록

### M2-B 화면
> 🆕 M1-38 이월(2026-10-23): 메타 문구 결과 노출 검사(`src/lib/seo.ts` `SCORE_LIKE_RE`)가 시즌 "2026-27"·시각 "06:50"·범위 "3–5줄"도 막는다 — 대회·팀 페이지 제목에 시즌을 넣기 전에 예외(연도-시즌·시각)를 두거나 검사 범위를 데이터 부분으로 좁힐 것(안 하면 빌드 실패)
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
- [ ] M3-01 🙋 `korean-players.json` 확정(2026-27, M0-32에서 등록한 초안 9명 검토 — 이적·임대 변동, 김지수 `apiFootballId`, 팀 slug는 M2-04 규칙으로 재확인) → 추가·변경분은 `/add-player`로(표기 사전·검색 쿼리 포함) (FR-60)
- [ ] M3-02 선수 기록 (D27): M1-48이 쌓은 경기 기록에서 한국 선수 경기 로그 추출(`apiFootballId` 매칭, 추가 호출 없음) + FR-65 폴백 경로(`errors.plan` 강등 시 경기 결과 + 득점 순위 + 뉴스 기반 "출전·득점 소식") (FR-61, FR-65)
- [ ] M3-03 `data/players/korean.json`: 최근 출전·골/도움·시즌 누적·다음 경기(KST)·UCL 출전 → 브리핑 입력(M1-19)에 한국 선수 출전·골 추가 (D24). 시즌 누적은 쌓은 경기 기록의 자체 집계 + "집계 시작일 이후" 표시, 다음 경기는 football-data 일정(API-Football `next`는 무료 불가) (D27) — 집계 시작일 필드 위치는 M1-48 스키마 확인 결과를 따른다
- [ ] M3-04 이적 감지 이슈 자동 생성(FR-63), 5대 리그 밖 이적 시 '기타 리그' 처리(FR-64)
- [ ] M3-05 🙋 `national-team.json`에 현 시즌 A매치 일정 입력 + A매치 기간 판정(±3일) (FR-70, FR-71)
- [ ] M3-06 `weekly.yml` 골격: **매주 월요일 08:00 KST** (일일 발행 이후, push 금지 시간대 회피), 단계별 실패 격리, `concurrency: collect` 공유(같은 `data/` 파일 동시 쓰기 방지), 끝에서 빌드 → `data/` 커밋 → `deploy.yml` 호출(월요일 당일 공개, FR-90)
- [ ] M3-07 `configs/prompts/weekly-kr.md` + 💰 주간 총평 1회 호출(Batches API — D28) + 이번 주 MVP 규칙 계산(코드) — 표·MVP 입력은 M1-48이 쌓은 지난 월~일 경기 기록 합산 (FR-90~92, D27)
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
- [ ] M4-06 💰 `weekly.yml`에 20팀 묶음 배치 추가(Batches API 유지, 지시문 캐싱 켬 — D28), 팀 페이지에 생성 날짜 표시, 골든셋 10팀 회귀 비교

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
  - 🆕 M1-32 이월 메모: 5줄 줄 끝 "AI 작성" 라벨(`data-slot="ai-label"`)·러닝 헤드·등번호는 색인에서 뺄지 결정(`data-pagefind-ignore`) — 라벨 앞에는 폭 0 공백이 있어 문장 텍스트는 "…. AI 작성"으로 끊긴다
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
  - 🆕 M1-38 이월(2026-10-23): OG 이미지가 생기면 `src/lib/seo.ts` `pageMetadata`의 공통 OG 객체에 `images`만 추가(D3 — 워드마크·날짜·호수만, 결과 노출 0)
- [ ] M5-02 앱 아이콘·테마 컬러 교체
- [ ] M5-03 SEO: canonical, 구조화 데이터(NewsArticle·SportsTeam·SportsEvent), 전체 sitemap (NFR-03)
  - 🆕 M1-38 이월(2026-10-23): Search Console은 URL 접두어 속성 `https://sguys99.github.io/euro-digest/` 등록 + sitemap URL 직접 제출(D59 — 블로그 저장소 robots.txt는 건드리지 않음, 오케스트레이터 추천 확정), robots.txt 결정, 새 라우트는 `src/lib/seo.ts` `sitemapEntries`에 추가(e2e가 빠뜨림을 잡음), og:type은 지금 모두 website — 구조화 데이터와 함께 날짜 페이지 article 여부 재검토, 삭제 요청으로 카드가 빠져도 lastmod(generatedAt)가 그대로라 재크롤 신호 없음 → 함께 검토
- [ ] M5-04 GoatCounter 연동(계정 `euro-digest` — U-08) + 이벤트(원문 클릭·RSS/ics 클릭·PWA 설치·마이 팀 설정) (PRD §11.2)
- [ ] M5-05 `/privacy` (FR-141)
- [ ] M5-06 접근성 감사: WCAG AA(다크 포함)·키보드·스크린리더 라벨 → Lighthouse 접근성 ≥ 90 (NFR-02)
- [ ] M5-07 성능 최적화 → Lighthouse 모바일 성능 ≥ 95, LCP ≤ 2.0s, CLS ≤ 0.05 (NFR-01, DR-11)
- [ ] M5-08 `check:bundle` 비밀값 grep + Lighthouse CI를 `ci.yml`에 추가 (NFR-07)
- [ ] M5-09 `ops-report.ts`: 월요일 운영 리포트 이슈(비용·성공률·소스 건강도·미등록 고유명사) (FR-155)
- [ ] M5-10 데이터 보존: 90일 지난 일별 JSON 월별 병합, `runs.json`·`runs-dev.json` 180일 (FR-158)
  - 🆕 M1-35 이월 메모(리뷰): 90일 월별 병합 뒤에도 **날짜 페이지(`/news/{date}/`)를 계속 생성**해야 한다 — 카드 공유 URL(`…/news/{date}/#c_…`)이 영구 주소다(FR-34). 지금 `listNewsDates`(src/lib/data/news.ts — `listIssueDates`·`generateStaticParams`·달력의 출처)는 일별 파일만 보므로 월별 파일 안의 날짜도 내도록 바꾸고, `loadIssue(date)`도 월별 파일에서 그날 카드를 읽게(병합 전후 같은 HTML·카드 ID — e2e로 대조)
- [ ] M5-11 `/new-season` 커맨드 완성 (FR-156)
- [ ] M5-12 브라우저 확인: Chrome·Safari(iOS)·Edge·Samsung Internet 최신 2버전 (NFR-13)
- [ ] M5-13 `code-reviewer` 전체 리뷰 → 지적 사항 수정
- [ ] M5-14 문서 정리: README, CLAUDE.md §13 미결 사항, PRD 비용표·결정 사항 갱신
- [ ] M5-15 🆕 `/status` 공개 상태 페이지(빌드 시 `runs.json`·`runs-dev.json`에서 생성): 마지막 발행 시각, 최근 30일 성공률, 소스 건강도, 이번 달 비용 사용률(prod+dev 합산, 예산 대비 %) — 푸터에서 링크 (P-1)
- [ ] M5-16 정식 공개 체크리스트 통과 → 공개

### ✅ M5 완료 기준 = PRD §11.1 운영 KPI
- [ ] Lighthouse 성능 ≥ 95 / 접근성 ≥ 90 (모바일)
- [ ] 최근 30일 파이프라인 성공률 ≥ 95%, 정시 발행(목표 시각까지·늦어도 +15분, D48)
- [ ] 월 총비용 ≤ $3 (실측)
- [ ] 주간 샘플 브리핑 정확도 ≥ 90% (D24)

---

## 14. M0 결과에 따른 분기 계획

| ID | 상황 | 대응 | 영향 작업 |
|---|---|---|---|
| **B1** | API-Football 무료로 2026-27 시즌 조회 불가 — ⚠️ **일부 발생(M0-29, 2026-10-10)**: 시즌 단위(`season=2026` — 순위·선수 시즌 기록·득점 순위·과거 경기) 불가("try from 2022 to 2024"), 경기 단위(`/fixtures?date=` 오늘 ±1일 → `/fixtures?id=` 단건: 이벤트·라인업·선수 기록)는 가능 | 원안 대응(한국 선수는 경기 결과 + 득점 순위 + 뉴스 기반 "출전·득점 소식", 포메이션 수동/미표시)은 발동하지 않는다. **시즌 누적만 대체** — M1부터 경기 기록을 쌓아 자체 집계, "집계 시작일 이후" 표시(백필 불가). 득점자·포메이션·한국 선수 경기 기록은 경기 단건 조회(6개 대회 전 경기 + 한국 선수 소속팀 다른 대회, 하루 최대 약 35건). 원안 폴백(FR-65)은 `errors.plan` 수신 시 자동 강등 경로로 유지 (PRD §15 D27) | M1-44, M1-48, M1-19, M2-07, M3-02, M3-03, M3-07 |
| **B2** | Google News RSS 이용 불가 — ⚠️ **발생(M0-26, 2026-10-10)**: robots `Disallow: /`·피드 약관 개인 리더 전용 | GDELT + 국내 매체 RSS로 대체, 검색 결과는 `publisher-domains.json` 허용 목록으로 제한(PRD §15 D25), NewsData.io 등은 ❓ 승인 후 | M1-06 |
| **B3** | 프롬프트 캐싱 최소 길이 미달 — ✅ **미발생(M0-30, 2026-10-11)**: 임시 프롬프트 685·2,034토큰 모두 최소 프리픽스(512) 이상, 배치 안·단건 연속 모두 캐시 읽기 확인 | 원안(캐싱 코드 제거)은 발동하지 않는다. 캐싱 코드(`cacheSystem`) 유지, 호출 지점별 적용 — 일일 브리핑은 같은 지시문으로 요청 2개 이상일 때만(1요청이면 쓰기 할증만 붙음), 주간 팀 프로필은 켬. PRD §9.3은 캐싱 미적용 가정 유지(일일 효과 월 $0.002 미만) (PRD §15 D28) | M1-45, M1-42, M4-06 |
| **B4** | 실측 일 비용 > $0.10 | ❓ 승인 후 순서대로: 브리핑 입력 축소(경기 수 상한·필드) → `effort`/thinking 조정 → (주간) 팀 프로필 묶음 확대. M0-30 실측(단건 브리핑 하루 최대 약 $0.002 — PRD §9.3, D28)상 발생 가능성은 사실상 없다 (D24) | M1-19, M1-22 |
| **B5** | 핵심 RSS 약관상 요약 불가 — ⚠️ **발생(M0-23, 2026-10-10)**: 1군 8개 모두 AI 요약 불가 판정 | 해당 소스는 원제목+링크만 또는 제외 → `Source.summarize` 필드 도입 (PRD §15 D22). M0-24까지 누적 26채널 AI 요약 가능 0 → **FR-20 재정의(PRD §15 D23·D24)**: 해외 카드는 모두 원제목+링크 + 코드 분류, LLM 호출 #1은 정형 데이터 브리핑 | M1-02, M1-15, M1-17~M1-24, M1-44, M1-45, D0-01, M0-30·M0-34·M0-36 |
| **B6** | 서비스명 상표·저장소명 충돌 | ❓ 이름 재검토 — 저장소명·basePath에 영향하므로 **M0에서 먼저** 결정 | M0-01, M0-13 |
| **B7** 🆕 | 데이터 API 약관상 LLM 입력·재가공 불가 (M0-28·M0-29, D24) — ✅ **미발생(M0-28·M0-29, 2026-10-10)**: 두 API 모두 조건부 허용 | 코드 템플릿 브리핑만 운영(LLM 없음), 호출 지점 #1 재검토 ❓ | M1-19, M1-45 |

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
- cron-job.org PAT 유효 여부 확인(만료 없음 — U-06, 최근 dispatch 응답 2xx·cron-job.org 실패 알림 없음), 작업 2개(06:30·07:10 KST)가 모두 활성인지 확인 (D26)
**시즌·이벤트**
- 유럽 서머타임 전환(10월·3월 마지막 일요일) 다음 날 아침: 발행 시각이 바뀌었는지(10월 → 07:30, 3월 → 07:00)와 계절에 맞지 않는 트리거의 skip을 실행 기록으로 확인 (D26)
- 이적 창 개폐 전 `transfer-windows.json` 확인 (2027 여름 창 일정)
- UCL 녹아웃 전환(2월) 대진 표시 확인
- 2027-03 전후(2027-28 UEFA 액세스 리스트·국가 계수 확정 시): `competitions.json`에 유럽 대항전 진출 구간 추가 — 1차 출처만(M2-01)
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
  tz: z.string().refine(isIanaTimeZone).optional(),  // 피드 날짜에 시간대가 없을 때만 해석할 IANA 이름(지역/장소 형식 + Intl 확인, UTC·Etc/UTC 허용, 약어·오프셋·Etc/GMT±N 거부). DST 겹침 = 먼저 오는 순간, 간격 = 전환 전 오프셋으로 앞으로 밂 (PRD §15 D34, 2026-10-12)
  retentionDays: z.number().int().positive().optional(), // 소스별 보존 기간(일) — 없으면 §8.4 기본(90일 → 월별 병합). 지나면 수집 실행이 data/에서 그 출처를 지운다(대표 출처면 카드 삭제, M1-25). The Athletic 7 (PRD §15 D32, 2026-10-12)
  terms_checked: z.boolean(), robots_checked: z.boolean(), // terms_checked = note의 이용 방식(요약/원제목+링크)이 약관상 허용됨, 금지·불명확이면 false
  note: z.string().optional(),                       // 약관 확인 메모·날짜
});

// 수집 결과 공통 형식 — 메모리 경계(data/ 파일 아님) src/lib/schema/feed-item.ts (FR-02·FR-03, M1-09, 2026-10-12)
const FeedItem = z.strictObject({                  // strict: content·content:encoded·description·body·enclosure·image 등 모르는 키 = 오류(FR-02)
  title: z.string().min(1).max(200),               // 원제목(보이는 글자 불변 정리만 — 엔티티·Windows-1252·공백·제어 문자, D45) — 200자 초과는 정규화가 건너뜀
  url: HttpUrl,                                    // 피드 원문 링크(idxno 등 쿼리 보존) — URL 정규화는 중복 해시에만(M1-12)
  publishedAt: Iso,                                // UTC Z — 시간대 없는 피드 날짜는 Source.tz로만 해석(D34)
  summary: z.string().max(500).nullable(),         // RSS description(태그 제거·500자) — 메모리 분류 입력 전용(D39 ①·D47 ① — spoiler·범위 밖 제외 근거), 카드·data·LLM에 넣지 않음, 위험 수용 3소스는 null(D48 ①)
  source: Slug,                                    // Source.id
  author: z.string().min(1).nullable(),            // FR-03 author? — authors를 ", "로 이은 값(카드에 저장 안 함)
  authors: z.array(z.string().min(1)),             // 내부 필드(M1-04 작성자 필터용)
  lang: z.string().min(1),
}).refine((i) => i.author === (i.authors.length ? i.authors.join(", ") : null), { path: ["author"] });

// data/news/YYYY-MM-DD.json  → { date, generatedAt, runId, cards: NewsCard[] }
const NewsCard = z.object({
  id: z.string().regex(/^c_[0-9a-f]{10}$/),         // 대표 URL 결정적 해시 (16진수 10자리)
  t: z.string().max(200),                            // 제목: AI 한국어 제목 ≤80자(아래 refine), 원제목·한국어 원문 카드 ≤200자
  s: z.array(z.string().max(80)).max(3),             // 요약 줄 — 해외·국내 뉴스 카드 모두 [] (D23 · M0-25: RSS 요약문은 표시·저장 안 함, 2026-10-10)
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

// configs/team-ids.json (PRD §15 D33 ⑤, M1-44, 2026-10-13) — 팀 slug → 두 데이터 API 팀 id
const ProviderTeamId = z.number().int().positive().nullable();
const TeamIdEntry = z.strictObject({
  fd: ProviderTeamId,                    // football-data.org 팀 id
  af: ProviderTeamId,                    // API-Football 팀 id (같은 숫자가 다른 팀일 수 있어 키로 구분 — M0 idCollisions 6건)
  note: z.string().min(1).optional(),    // 근거·확인 메모
}).refine((e) => e.fd !== null || e.af !== null, { error: "fd·af 중 하나는 있어야 함" });
const TeamIdsFile = z.record(Slug, TeamIdEntry);  // + 파일 안 fd·af 각각 중복 금지(null 제외). slug는 M2-04 규칙 확정 때 정리
// validate 교차 검사: korean-players.json 활성 선수의 team → team-ids에 있고 af !== null (오류)

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
  sources: z.array(z.object({ id: z.string(), ok: z.boolean(), items: z.number(),   // items = 피드 원문 항목 수
    usable: z.number().int().min(0).optional(),     // 성공 기록에만 — 수집 창 안의 새 항목 수(정규화·작성자 필터·창 적용 뒤, 중복 제거 전) — 건강도 "새 기사 없음" 판정 (PRD §15 D35, 2026-10-12)
    error: z.string().optional(),                   // 실패 기록에만 — 실패 종류(timeout·http-4xx·http-5xx·network·redirect·too-large·parse·budget·unexpected) — budget은 건강도 계산에서 제외 (D35)
  })),
  status: z.enum(["success", "partial", "failed", "skipped"]),
  brief: z.object({                                  // 🆕 선택 필드(PRD §15 D56, 2026-10-17 사용자 결정, FR-25·FR-151) — 옛 기록(필드 없음) = 0건, 마이그레이션 없음
    requests: z.number().int().min(0),               // 이 실행이 실제로 보낸 브리핑 요청 수 — callSingle 1번 = 1건(FR-29 재시도 따로 1건), 응답 받음·응답 없이 끊김(연결 오류·타임아웃)만,
                                                     // 마감·예산·하루 상한으로 안 보냄·서버 오류 응답(4xx·429·5xx — 전송 재시도 포함)은 제외. 하루 상한 3(FR-25) = 같은 env·같은 KST 날짜(startedAt)의 collect 기록 합(eval-… 제외)
    unbilledRisk: z.object({                         // 응답 없이 끊긴 요청의 추정 최대 사용량 — costUsd와 따로, 비용 가드에 넣지 않음(과금 여부 불확실)
      requests: z.number().int().min(1), inputTokens: z.number().int().min(0), outputTokensMax: z.number().int().min(0), usdMax: z.number().min(0),
    }).optional(),
  }).optional(),
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
  q: z.string().min(1), lang: z.string().min(2),     // GDELT sourcelang (Google News는 사용 불가 — D25)
  region: z.string().regex(/^[A-Z]{2}$/).optional(), // GDELT sourcecountry 등 (Google News gl 용도는 폐기 — D25)
  purpose: z.enum(["korean", "transfer", "team", "ucl", "national", "general"]),
  player: Slug.optional(), team: Slug.optional(),    // 대상 slug (/add-player가 한/영 1개씩)
  enabled: z.boolean(),
});
const SearchQueriesFile = z.strictObject({ maxEnabled: z.number().int().min(1).max(100), queries: z.array(SearchQuery) }); // 상한 값은 M0-26

// 5-1. configs/publisher-domains.json  (FR-02·NFR-09, M0-26) — 검색형 소스 결과의 매체 도메인 허용 목록, 목록 밖 = 기본 차단
//   매칭: 호스트 === domain 또는 "." + domain으로 끝남(하위 도메인 포함), 여러 개면 가장 긴 domain 우선. 경로 단위 구분 없음
//   교차 참조(validate): sourceIds ∈ sources.json id · allow/feed-only ↔ 근거 소스 terms_checked:true, deny ↔ false · 수집 대상 소스 호스트 ∉ deny
const PublisherHost = z.string()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/)
  .refine((d) => !d.startsWith("www."));                  // 소문자 호스트 — 스킴·포트·경로·끝 점·www. 없음
const PublisherDomain = z.strictObject({
  domain: PublisherHost,
  publisher: z.string().min(1),                           // 매체명
  status: z.enum(["allow", "feed-only", "deny"]),         // allow = 검색 결과로도 원제목+링크 / feed-only = 자기 피드로만 / deny = 게시 안 함
  sourceIds: z.array(Slug).default([]),                   // 판정 근거가 된 sources.json 소스 id
  basis: z.string().min(1), basisUrl: HttpUrl,            // 짧은 근거(조사 ID·조항 요지·결정) + 대표 근거 URL
  checkedAt: IsoDate, note: z.string().optional(),
}).refine((d) => d.status !== "feed-only" || d.sourceIds.length > 0); // feed-only는 근거 피드 소스 1개 이상
const PublisherDomainsFile = z.strictObject({ domains: z.array(PublisherDomain) }); // domain 중복 금지

// 6. configs/formations.json → Record<팀 slug, ManualFormation>  (FR-55 보조 — 라인업 최빈값(D27)이 없을 때만: 수집 초기 경기 수 부족·데이터 누락 팀 → Team.formation, source:"manual")
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
const SeenUrlsFile = z.object({ updatedAt: Iso, urls: z.record(UrlHash, Iso) });   // 카드가 된 URL의 정규화 해시(sha256 앞 16자리) → 처음 카드가 된 시각(card.created) — M1-12

// 12. data/cache/unknown-names.json  (FR-24) — 키 = LLM 영문 표기 그대로, 사전 등록·ignore 이름은 다음 수집이 제거
const UnknownName = z.object({
  count: z.number().int().min(1),                    // /add-name 빈도순
  firstSeen: Iso, lastSeen: Iso,                     // firstSeen ≤ lastSeen
  kind: NameKind.optional(),                         // teams/players 태그에서 왔으면 추정
  cards: z.array(CardId).max(5),                     // 예시 카드(최근 5개)
});
const UnknownNamesFile = z.object({ updatedAt: Iso, names: z.record(NameText, UnknownName) });

// 13. data/cache/af-pending.json  (M1-48, D27·D33, 2026-10-13) — API-Football 미종료·이월 경기 id(다음 실행에서 id 단건 재조회)
const AfPendingEntry = z.object({
  id: z.number().int().positive(), comp: CompId.nullable(),   // 6개 대회 밖(한국 선수 소속팀 기타 대회)은 null
  leagueId: z.number().int().positive(), kickoff: Iso,
  status: z.string().regex(/^[A-Z0-9]{1,6}$/),                 // API-Football short status (NS·1H·FT…)
  firstSeen: Iso, requeries: z.number().int().min(0),
});
const AfPendingFile = z.object({ updatedAt: Iso, fixtures: z.array(AfPendingEntry) }); // id 중복 금지, 킥오프·id 순
// 정리: 상세를 받음·PST·CANC·ABD·AWD·WO·킥오프 후 3일·재조회 3회째·대상 밖·원장에 있음(M1-48b 구현) — 원장에 못 넣은 경기는 다시 넣음(재조회 +1)

// 14. data/matches/YYYY-MM.json  (M1-48b, PRD §15 D33·2026-10-14 보강) — 킥오프 UTC 달, af-<id> 덮어쓰기, 킥오프·id 순,
//     내용(fetchedAt 제외)이 같으면 다시 쓰지 않음. 파이프라인 원장 — 화면은 읽지 않고 파생 파일만 읽는다
const AfId = z.number().int().positive();
const LedgerPerson = z.object({ id: AfId.nullable(), name: z.string().min(1) });            // API-Football 원문 이름
const LedgerTeam = z.object({ id: AfId, name: z.string().min(1), formation: z.string().min(1).nullable() });
const LedgerScore = z.object({ home: z.number().int().min(0), away: z.number().int().min(0) });
const LedgerGoal = z.object({ minute: z.number().int().min(0), extra: z.number().int().nullable(),
  side: z.enum(["home", "away"]), kind: z.enum(["normal", "penalty", "own-goal"]),
  scorer: LedgerPerson, assist: LedgerPerson.nullable() });                                 // 자책골은 assist null, 승부차기 킥 제외
const LedgerKoreanRow = z.object({ player: AfId /* korean-players apiFootballId */, side: z.enum(["home", "away"]),
  status: z.enum(["start", "sub", "bench", "absent", "unknown"]),                           // unknown = 라인업 없음
  minutes: z.number().int().min(0).nullable(), goals: z.number().int().min(0), assists: z.number().int().min(0) });
const LedgerMatch = z.object({ id: z.string().regex(/^af-[1-9]\d*$/), leagueId: AfId, league: z.string(),
  comp: CompId.nullable(), season: Season.nullable(), round: z.string().min(1).nullable(), kickoff: Iso,
  status: z.enum(["FT", "AET", "PEN"]), home: LedgerTeam, away: LedgerTeam, ft: LedgerScore /* 정규시간+연장 */,
  pens: LedgerScore.nullable(), goals: z.array(LedgerGoal), goalsComplete: z.boolean(),
  korean: z.array(LedgerKoreanRow), fetchedAt: Iso });
  // + PEN ⇔ pens · home.id ≠ away.id · goalsComplete ⇒ 쪽별 득점 수 = ft · korean player 중복 금지 · 전 선수 출전 시간·전반 스코어·로고 저장 안 함
const MatchLedgerFile = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), updatedAt: Iso, matches: z.array(LedgerMatch) });
  // 파일 단위: id 중복 금지, 킥오프·id 순, month = 킥오프 UTC 달 = 파일명

// 15. data/matches/meta.json — 날짜는 모두 UTC 날짜. since는 첫 정기 실행(COLLECT_ENABLED=true)이 한 번 쓰고 바꾸지 않음
const LedgerGap = z.object({ date: IsoDate, reason: z.enum(["date-query", "degraded", "skipped", "dropped"]),
  cause: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional(),          // 오류 종류
  matches: z.array(AfId).min(1).optional() });                            // dropped(이월 정리로 버린 경기)만, 오름차순
const MatchLedgerMeta = z.object({ season: Season, since: IsoDate,
  playerSince: z.record(Slug, IsoDate),                                   // 추적 중인 선수 전원의 시작일(나중 등록 선수 구분)
  gaps: z.array(LedgerGap) });                                            // + playerSince·gaps ≥ since, (날짜, 사유) 순·중복 금지
  // gaps 치유: date-query·degraded·skipped는 나중 실행이 그 날짜를 받으면, dropped는 그 경기가 원장에 들어오면 지움

// 16. data/briefs/YYYY-MM-DD.json  (FR-22~26·FR-35, PRD §15 D38·D45·D58·D60, M1-19, 2026-10-16) — KST 발행일 = 파일명, 무기한 보존(§8.4)
const BriefMode = z.enum(["llm", "mixed", "template", "empty"]);  // llm 모든 줄 LLM · mixed 일부 줄 템플릿 강등 · template LLM 없음(출력 전체 실패·예산·마감·약관·M1-45 전) · empty 입력 경기 0(호출 생략)
const BriefEmptyReason = z.enum(["no-matches", "results-pending"]); // D60 — no-matches 창 안에 끝난 경기 없음 · results-pending 경기는 있었지만 결과를 받지 못함(football-data 미종료 + API-Football 보충 불가)
const BriefRef = z.string().regex(/^[a-z][A-Za-z0-9]{1,31}$/);   // 정형 입력 항목 id — m<fd 경기 id> · s<대회 약칭> · k<af 선수 id>
const BriefLine = z.object({
  text: z.string().min(1).max(80).regex(/^\S(?:[^\r\n]*\S)?$/),  // 한 줄·앞뒤 공백 없음, 80자(D40 ⑤ — 목표 60자), 치환 뒤 문장
  ai: z.boolean(),                                               // true = LLM("AI 작성" 라벨) · false = 코드 템플릿
  refs: z.array(BriefRef).min(1).max(6),                         // 줄 안 중복 금지
  comps: z.array(CompId).min(1).max(6).optional(),               // D58 — 줄 대회(게시 때 refs에서 코드 계산 · refs 처음 나온 순 · 중복 금지 · 모르면 키 없음)
});
const BriefFile = z.object({ date: IsoDate, generatedAt: Iso, runId: z.string().min(1), mode: BriefMode,
  emptyReason: BriefEmptyReason.optional(),                      // D60 — mode empty일 때만(그 밖 mode에 있으면 오류) · 키 없는 옛 empty = no-matches
  lines: z.array(BriefLine).max(5) });
  // + empty ⇔ 줄 0개 · llm ⇒ 모두 ai:true · template ⇒ 모두 ai:false · mixed ⇒ 둘 다 · emptyReason ⇒ empty. 치환 전 원문(textRaw)은 저장 안 함
  // 같은 날 재실행: llm·mixed는 덮지 않음(LLM도 부르지 않음) · 줄 있는 template은 llm·mixed 또는 줄이 더 많은 template으로만 갱신 ·
  //   empty는 줄 있는 결과·이유(emptyReason)가 다른 empty로 갱신(results-pending은 그날 수동 force 재실행이 보충에 성공하면 덮는다 — 백업 schedule은 12시간 가드로 건너뜀) · 내용(mode·줄·empty 이유) 같으면 안 씀
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
| 2026-10-10 | M0-23~26 약관 판정 반영: `Source.summarize`(D22), 해외 카드 원제목+링크·LLM #1 데이터 브리핑(D23·D24), Google News 사용 불가·B2 발동·`publisher-domains.json`(D25), 태그라인 교체 | 사용자 결정 |
| 2026-10-10 | 계절별 발행 시각(PRD §15 D26): 유럽 표준시 기간 07:10 수집 → 07:30 공개, cron-job.org·백업 schedule 계절별 2개, 브리핑 마감 "공개 목표 −10분", push 금지 06:00~08:00 KST. M1-47 추가, M0-15·M1-40·M1-41·M1-45·M1 목표·완료 기준·§2.3·§16 문구 갱신, 태그라인에서 시각 약속 제거 | 사용자 결정 — M0-28 실측: 겨울철 06:30 수집 시 UCL 리그 페이즈 51% 미종료 |
| 2026-10-10 | API-Football 사용 범위·시즌 누적(PRD §15 D27): §14 B1 일부 발생, M1-48 추가(경기 단건 어댑터 + 경기 기록 누적, 저장 스키마 ❓), M1-44(득점자 → M1-48)·M1-19·M2-07(포메이션 = 라인업 누적)·M3-02·M3-03·M3-07(누적 집계 기반)·M1 관련 요구사항 문구 갱신 | 사용자 결정 — M0-29 실측: 무료 플랜 시즌 단위 조회 불가·경기 단건 조회 가능 |
| 2026-10-11 | 일일 브리핑 호출 방식(PRD §15 D28): 일일 브리핑은 일반 Messages API 단건(주간 2곳은 배치 유지), thinking 적응형 + `effort:"medium"`·`max_tokens` 4,096, §14 B3 미발동으로 닫음(캐싱은 호출 지점별), 검증 순서 zod → 코드 검증 → 1회 재시도 → 템플릿. M1-20·M1-21·M1-23·M1-42·M1-45·M3-07·M4-06·§14 B3·B4 갱신. 함께 정리: M2-01(유럽 대항전 구간만 남음 — §16에 시즌 후반 갱신 추가), 부록 A `formations.json` 주석(보조), §14 B7 미발생 표기 | 사용자 결정 — M0-30 실측: 배치 완료 최대 6분 33초로 겨울 마감 여유 4~5분 초과, 단건 2~8.5초 |
| 2026-10-11 | M0 완료: U-06·M0-15(cron-job.org)를 M1-40 선행으로, U-08(GoatCounter)을 M5-04 선행으로 이월 · M0-33~36 발견 사항을 M1-02(The Athletic 보관 조항 ❓)·M1-17·M1-20(스코어 표기 순서)·M1-21·M1-23(승패 동사·스코어 순서·미정 판정 ❓)·M1-45(요청 타임아웃·연결 오류 retryable 힌트·max_tokens/refusal ❓·실행 기록 순서)·M1-48(보강 호출 3회·`apiFootballId` null 알림)에 반영 | 사용자 결정(이월) · M0-32~36 서브에이전트 보고 |
| 2026-10-11 | U-06·M0-15 완료(cron-job.org Test run → workflow_dispatch run 38133463178 확인, 19:51 KST) — M1-40 선행 이월 해제. U-08만 M5-04 전 이월 유지 · PAT 만료일 없음 → U-06·§16 월간 점검을 "만료일 확인"에서 "유효 여부 확인"으로 | 사용자 확인 · 사용자 결정(PAT 만료 없음) |
| 2026-10-11 | U-08 완료(GoatCounter `euro-digest`) — M5-04 선행 이월 해제, §3 사용자 준비 작업 전부 완료 → M0 완료 기준 6개 모두 충족 | 사용자 확인 |
| 2026-10-11 | D0 시안 방향·폰트·마스트헤드(PRD §15 D29): 시안 조합 A Broadsheet + M Cover + P Programme, 한글 웹폰트 KS X 1001 단일 서브셋·굵기 ≤ 2, 날짜 기반 "제 N호" 마스트헤드(PRD §14.1), 대회 컬러 강도 시안 재량. D0-01 범위(`docs/design/d0/scope.md`)·D0-02 방향(`directions.md`) 기록 | 사용자 결정 |
| 2026-10-11 | D0 시안 선택(PRD §15 D30): C Programme 기반 + A Broadsheet 1280 지면 위계 혼합(+ A 연결 줄·B 대회 필터 헤더 색 면), 게재 번호 작게, 브리핑 스코어 주어 팀 먼저(M1-20 확정 표기), 대회 표기·태그라인 현행 확정, 경기 없는 날 5줄 블록 유지, OG 결과 노출 0 | 사용자 결정 |
| 2026-10-12 | D0-07 혼합안 확정(PRD §15 D30 보강): 연결 줄 짝은 빌드 시 엄격 규칙 계산(스키마 변경 없음 — M1-31 반영), 375 대회 필터 진입점 없음(대회는 M2 리그 탭), 다크 티켓 벽돌 레드 유지, 필터 결과 머리기사 없음 | 사용자 결정 |
| 2026-10-12 | 브레이크포인트·첫 로드 모션(PRD §15 D31): 1023 이하 1단·1024~1279 2단·1280 이상 3단(DR-01 갱신), 첫 로드 진입 모션 없음(DR-08 해석 갱신). M1-30 그리드 문구 갱신 | 사용자 결정 — D0-09 DESIGN.md 작성 중 혼합안·DR-01 차이 발견 |
| 2026-10-12 | **D0 완료**: D0-01~D0-12 + 완료 기준 3개 충족. CI에 견본 검사 job(`test:specimen`, 배포 조건 아님) 추가, ci.yml 주석의 push 금지 시간 06:00~08:00로 정정. CLAUDE.md 현재 단계·DESIGN.md 설명·명령 목록(`test:specimen`) 갱신 | D0 완료 |
| 2026-10-12 | M1-A 수집 범위·The Athletic 보관(PRD §15 D32): M1-05 목록 크롤러 ⏸(허용 사이트 0곳), M1-07 GDELT·M1-08 OG 수집기 ⏸(M1-46 재측정 통과 시 함께 착수), M1-06은 로더·허용 목록 필터만. The Athletic 카드 7일 보관 — `Source.retentionDays`(부록 A) 추가, 삭제는 M1-25 | 사용자 결정 |
| 2026-10-12 | 경기 기록 원장·팀 id 대응표(PRD §15 D33): M1-48 ④ 월별 원장 `data/matches/YYYY-MM.json` + `meta.json`(집계 시작일 자동), 득점·도움·포메이션 + 한국 선수 행만 저장 · M1-44 팀 id 대응표 `configs/team-ids.json` 신설 | 사용자 결정 |
| 2026-10-12 | 피드 날짜 시간대(PRD §15 D34): `Source.tz`(부록 A) 추가 — 시간대 없는 피드 날짜만 해석, 국내 5피드 `Asia/Seoul` (M1-09) | 사용자 결정 |
| 2026-10-12 | 소스 건강도(PRD §15 D35): `RunLog.sources[]` 선택 필드 `usable`·`error`(부록 A), 이슈 기준 = 실패·빈 피드 3회 연속 또는 새 기사 없음 7회 연속(`budget` 제외), 매 실행 소스 실패도 같은 소스별 이슈 (M1-11) | 사용자 결정 |
| 2026-10-12 | 수집 시간 창 상한 36 → 51시간(PRD §15 D36, FR-07 수치 변경): 하루 전체 실패 다음 날 누락 방지, 소스별 창, 미래 시각 가드 (M1-10) | 사용자 결정 — M1-10 구현 중 FR-07 수치와 수용 기준 충돌 발견 |
| 2026-10-13 | 팀 id 대응표 밖 경기 득점자 자동 연결(PRD §15 D37, D33 보완): 대회·킥오프 ±5분·스코어 일치·후보 하나면 실행 안에서 연결, configs는 사람이 관리 (M1-48) · 부록 A af-pending 추가 | 사용자 결정 — M1-48 실측(대응표 밖 4경기) |
| 2026-10-14 | 경기 원장 세부 확정(PRD §15 D33 보강): goalsComplete·season·leagueId·출전 상태 unknown·gaps cause 추가, 전반 스코어 미저장, playerSince = 추적 선수 전원 시작일, since = COLLECT_ENABLED 켠 뒤 첫 쓰기 실행 · 부록 A 14·15 · **M1-A 수집 완료**(M1-05·07·08 ⏸) | 사용자 확인 — M1-48b 구현 |
| 2026-10-14 | `espn-soccer` 비활성 — Actions 러너에만 HTTP 202·0바이트(봇 차단 추정), 수집 대상 13개 피드, M1-41에서 재확인 (M1-03 보강) | 사용자 결정 |
| 2026-10-15 | M1-B·M1-C·M1-D 착수 전 ❓ 일괄 확정: 일일 브리핑 저장 `data/briefs/YYYY-MM-DD.json` + `mode`(PRD §15 D38), RSS 요약문은 메모리 분류 입력으로만·팀 표기 KFA 통일(D39), 브리핑 판정 기준 — max_tokens 재시도·refusal 템플릿·파생 숫자·prev 없는 변동·음역·형식 관용(D40), M1-28 롤백 리허설 Claude 실행 승인 | 사용자 결정 |
| 2026-10-15 | 정시가 아닌 수집 실행의 브리핑 마감(PRD §15 D41): 정시 슬롯 실행만 '공개 목표 −10분', 수동·지연·개발 실행은 시작 + 8분, 단계 예산은 남은 시간으로 (M1-47) | 사용자 결정 — M1-47 구현 중 FR-26 해석 필요 |
| 2026-10-15 | FR-05 수용 기준 변경(PRD §15 D42): '일일 중복 카드 0건' → '잘못 합친 카드 0건 + 중복 감소율 샘플 검수 기록', M1-17에 엔티티 2단계 병합 추가, M1 완료 기준 문구 갱신, `fixtures/rss/the-athletic-football.xml` 합성 제목 교체(D32) | 사용자 결정 — M1-13 실측(제목만으로 중복 약 절반 감소) |
| 2026-10-16 | 일일 예산 범위(PRD §15 D43): 월은 항상 prod+dev 합산, 일은 봇 실행이면 prod만(M0-21 유지 — FR-27·CLAUDE §6.3 문구 정정) · D0 시안 HTML·scope.md의 Athletic 실제 제목·링크를 합성 값으로 교체(D42 확장, 스크린샷 유지) | 사용자 결정 — M1-22 구현 중 문서 불일치 발견 |
| 2026-10-16 | 국내 카드 최소 몫(상한의 1/3, 관찰 주간에 확정)·일일 카드 상한은 그날 파일 기준(PRD §15 D44, FR-06 보강) (M1-14) | 사용자 결정(국내 몫) · 오케스트레이터 판단(파일 상한 — PRD '일 30~50건') |
| 2026-10-16 | 원제목 정리 범위 '보이는 글자 불변'(FR-20 문구 갱신)·보존 기간 소스 대표 후순위·`data/briefs` 무기한 보존(§8.4)·브리핑 템플릿 문형을 자연 문장으로 통일(D30 갱신, M1-21 뒤) (PRD §15 D45) | 사용자 결정 — M1-15·M1-19 구현 중 |
| 2026-10-17 | 고유명사 한글 표기 확정(PRD §15 D46): 표기가 갈린 팀 14·선수 14·감독 3 추천안 적용(보류 2), KFA 통칭 정책 유지, Club Brugge는 '클럽 브뤼헤'(D39 ② 예외), 5대 리그 밖 한국 선수는 사전 제외 (M1-21) | 사용자 결정 |
| 2026-10-17 | 뉴스 카테고리 판정 v0.1(PRD §15 D47): '기타' 비율은 v0.1 유지 후 M1-43에서 보강(목표 ≤ 30%), 요약문은 카테고리·태그 근거로 쓰지 않음, UCL 경기 결과는 '경기 결과' 카테고리 (M1-17) | 사용자 결정 |
| 2026-10-17 | 수집 운영 보강(PRD §15 D48): 위험 수용 3소스는 요약문 읽지 않음, NFR-05 '목표 시각까지·늦어도 +15분'으로 정정, M1-40에 cron-job.org 백업 작업 2개 추가, collect.yml Actions 첫 확인·M1-28 롤백 리허설은 M1-D 마무리 때 · 브리핑 파생 서술 허용 범위(완파·n골·해트트릭·결승골·역전승·round 한국어 — 검사기 검증, '대파'·'신승' 제외)·지시문 토큰 증가 승인·사실 선계산은 M1-24 뒤 결정 (M1-20) · CLAUDE §10 push 금지는 사람 push 규칙으로 명확화 | 사용자 결정 |
| 2026-10-17 | 실패 실행 기록 보존(PRD §15 D49 ①): 검증·빌드·커밋 실패 실행도 runs.json(failed)·원장·이월만 '실행 기록 (발행 실패)' 커밋(발행 산출물·배포 없음) — PRD §10·CLAUDE §6.1·§10 문구 보강 (M1-27) · D42 엔티티 병합은 스코어 있는 기사끼리만(D49 ② — '또는 같은 경기일' 미사용, 잘못 합치기 0 우선) (M1-17) | 사용자 결정(①) · 오케스트레이터 판단(② — D42 '잘못 합치기 0' 우선) |
| 2026-10-17 | 브리핑 검사기를 닫힌 문법(허용 문형만 통과)으로 재설계(PRD §15 D50) — M1-23 재리뷰 2회차 미탐 약 160개, 지시문에도 같은 문형 목록, M1-45는 닫힌 문법 + M1-24 회귀 뒤 착수 (M1-23·M1-20·M1-24) | 사용자 결정 |
| 2026-10-17 | 사실 선계산(승자·결승골·역전 여부 등 코드 계산값을 브리핑 입력에 추가)은 보류 — v0.1 실측 사실 오류 0/43, 선계산 변형은 바쁜 날 출력 3,941토큰(상한 96%), 닫힌 문법 v0.2 뒤 재비교 (M1-24) | 사용자 결정 |
| 2026-10-17 | 바쁜 날 브리핑 출력 잘림 대응(PRD §15 D51): `max_tokens`·thinking·effort 불변, LLM 요청 본문에만 중요도 순 앞 15경기(템플릿·검사기 근거는 전체 30) + 지시문 v0.2로 골든셋·바쁜 날 반복 재측정, 3,500토큰 초과 시 다시 질문 (M1-24·M1-20) | 사용자 결정 |
| 2026-10-17 | 브리핑 `max_tokens` 4,096 → 8,192(D28 변경 — PRD §15 D53) + 지시문 [문형] 축소: v0.2 골든셋에서 thinking +24%·4경기 날도 잘림, 잘리면 쓴 토큰이 버려지고 재시도·템플릿으로 감 — 실제 비용은 쓴 만큼이라 거의 불변, 예산 가드 최악값만 증가 (M1-20·M1-24) | 사용자 결정 |
| 2026-10-17 | 이적 단계 승격 조건 보강(PRD §15 D52 — M1-18 리뷰): `official`은 명시 표현 또는 매체 2곳일 때만(단일 Tier 2 출처의 방향 동사만이면 `agreed`까지), `collapsed`에도 같은 승격 조건(못 미치면 진행 단계 유지), 출발·행선지는 팀 하나여도 방향 표현이 확실하면 채움(PRD F10 문구 정정) (M1-18) | 사용자 결정 |
| 2026-10-17 | 이적 높은 단계(negotiating 이상·결렬)는 닫힌 문형에 앞뒤까지 맞을 때만(PRD §15 D54 — M1-18 재리뷰 2회차 변형 242개 중 155개 통과), 'here we go'는 FR-103대로 agreed 근거(official 명시 표현 아님 — D52 문구 정정) (M1-18) | 사용자 결정 |
| 2026-10-17 | 브리핑 지시문 v0.4 — 지금 입력에 없는 키(korean·prev)의 꼴을 문법·지시문에서 함께 뺌(v0.3 thinking +73%), 승패 문장은 주어 팀 점수 먼저만 허용(PRD §15 D55 — D30 보강) (M1-23·M1-20) | 사용자 결정 |
| 2026-10-17 | D48 ④ 수정한 collect.yml Actions 첫 확인(수동 dispatch force — 판단·수집·검증·빌드·커밋·배포 모두 success, 첫 LLM 브리핑 게시)·M1-28 롤백 리허설은 그 발행 커밋(8a7b993)으로 10-17 22:00 실행 — 정기 schedule이 `COLLECT_ENABLED` 꺼짐으로 skip 중이라 12시간 가드가 아침 발행을 막지 않음을 확인한 뒤 (M1-26·M1-27·M1-28·M1-45) | 오케스트레이터 판단(D48 ④ 'M1-D 마무리 때 한 번에') |
| 2026-10-17 | 실행 기록 RunLog에 선택 필드 `brief?: { requests, unbilledRisk? }`(PRD §15 D56) — 브리핑 LLM 요청을 브리핑 날짜 단위 3회로 묶고(FR-25, 넘으면 `daily-cap` 템플릿), 연결 오류·타임아웃 시도의 추정 과금 위험을 따로 기록 (M1-45) | 사용자 결정 |
| 2026-10-18 | 일일 브리핑 `max_tokens` 8,192 → 16,384·브리핑 HTTP 요청 타임아웃 60초 → 120초(PRD §15 D57 — 마감 안 min(120초, 마감 − 현재), thinking·effort·단건·모델 불변) · 비용 가드 최악값 요청당 약 $0.018 · M1-42 메모 | 사용자 결정 — 10-18 prod 첫 브리핑 요청 max_tokens 잘림(thinking 8,190) |
| 2026-10-18 | 창간일 2026-10-12 확정 — 마스트헤드·뒤표지 "제 N호" N = 발행일 − 2026-10-12 + 1(결호가 나도 증가, 빌드 시 계산, D29) · M1 공개 상태는 검색·결과 가리기 토글을 숨김(M4-E·M4-15에서 노출 — 미완성 섹션 숨김) (M1-30) | 사용자 결정(창간일) · 오케스트레이터 결정(토글 숨김) |
| 2026-10-19 | 일일 브리핑 줄에 선택 필드 `comps`(대회 ID 배열 — PRD §15 D58): 게시 때 refs에서 코드 계산(m… 입력 경기 대회 · s… 순위 약칭표 · k… 그 선수 경기), LLM 호출·지시문·비용 불변, 기존 data/briefs 손 편집 없음(10-20 발행부터) · 부록 A 16 갱신 (M1-32) | 사용자 결정 — 홈 5줄 대회 인덱스 탭(D0 선택 시안)에 줄 대회가 필요하고 화면은 원장을 읽지 않음(D33) |
| 2026-10-25 | 브리핑 결과 보충·결과 지연 구분(PRD §15 D60 — 10-25 호 사건): football-data 미종료 창 안 경기를 같은 실행·원장의 API-Football 종료 결과로 보충(추가 호출·LLM 0, 대응표가 팀을 확인하는 쌍만, 그 대회 순위 제외), 보충 뒤에도 입력 0 + 기다리는 경기 → BriefFile 선택 필드 `emptyReason: "results-pending"`(empty일 때만, 옛 파일 유효) → 5줄 블록은 S4 대신 '5줄을 싣지 못했어요' · 부록 A 16 갱신 · M1-41 메모 | 사용자 결정 — 10-25 홈 S4 오게시 |
| 2026-10-25 | 감독 표기 확장·감독 발언 → 감독·구단 규칙(PRD §15 D47 사용자 결정 A 반영 · D46 보완): names.ko 감독 +19(현직 17 + 키스 앤드류스·안토니오 콘테 — 국내 매체 관용), '한지 플리크' → '한지 플릭', 성 단독 별칭은 저위험 성 14개만(중간·고위험 성·기존 감독 제외), 감독 이름 + 인용 머리·출처 문형 = 감독·구단(앞선 카테고리 우선) — 재분류 기타 41.2% → 37.9%(새 오분류 0, ≤ 30% 미달) (M1-43 이월) | 사용자 결정 — M1-43 검수 |
