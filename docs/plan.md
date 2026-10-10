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
**다음 작업**: `M0-11` (§3 남은 사용자 작업: U-06 · U-08 · U-09)

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
- [ ] M0-11 README 초안 (소개, 로컬 실행, 문서 링크, 데이터 출처)

### M0-B 배포·자동화 뼈대
- [ ] M0-12 `ci.yml`: push마다 `check` + `build` + `check:bundle` + `test:e2e`(링크·접근성, NFR-12) → main에서 통과하면 `deploy.yml` 호출
- [ ] M0-13 Pages 배포 — 재사용 `deploy.yml`(`workflow_call` + 롤백용 수동 `workflow_dispatch`, `concurrency: pages`) 작성. 무스타일 Hello 페이지가 `https://sguys99.github.io/euro-digest/`에서 열리고 정적 자산·404·trailing slash 정상
- [ ] M0-14 `collect.yml` 골격: `workflow_dispatch` + 백업 `schedule`(06:40 KST — 06:30 실행이 진행 중이면 concurrency로 대기한 뒤 12시간 가드로 skip) + 12시간 내 성공 이력 시 skip + `concurrency: collect` + 실패 시 이슈 생성 (FR-150, FR-152)
- [ ] M0-15 🙋 cron-job.org → `workflow_dispatch` 호출 테스트 (06:30 정기 실행 활성화는 M1-40 리허설 후)

### M0-C 공용 기반 코드
- [ ] M0-16 zod 스키마 v0.1 구현 (`src/lib/schema/`) — **부록 A 기준**, configs·data 전부. 부록 A에 없는 스키마(competitions·names.ko·national-team·bigmatch-rules·search-queries·formations·team-colors·transfer-windows·`players/korean.json`·seen-urls·unknown-names)는 초안 작성 → ❓ 사용자 확인 후 부록 A에 추가
- [ ] M0-17 `scripts/validate.ts` 1차: `configs/*` 스키마 검증 → CI 연결 (잘못된 설정은 CI 실패)
- [ ] M0-18 `src/lib/time.ts`: UTC 저장·KST 표시 + DST 테스트 (2026-10-25, 2027-03-28 전후 케이스) (NFR-10)
- [ ] M0-19 `src/lib/paths.ts`: basePath 헬퍼(정적 자산·RSS·ics·OG) + 테스트
- [ ] M0-20 `scripts/lib/llm.ts`: live/mock 모드, Batches 제출·폴링, `usage` 집계 — SDK import는 이 파일에서만
- [ ] M0-21 `scripts/lib/cost.ts`: 모델 단가 표(구현 시점 공식 단가 확인), 예상 비용 계산, 비용 기록(prod → `runs.json`, dev → `runs-dev.json`), 가드는 두 파일 합산
- [ ] M0-22 구조화 로거 + GitHub 이슈 생성 헬퍼 (같은 원인이면 기존 이슈에 댓글)

### M0-D 외부 검증 (결과는 `docs/research/m0-validation.md`에 기록)
- [ ] M0-23 ❓ 1군 영문 RSS 8개 실작동·약관 확인 → 결과 보고·사용자 확인 후 `sources.json`에 `terms_checked`·`robots_checked` 기록, ESPN 처리 방식 결정 (CLAUDE §2·§6.4)
- [ ] M0-24 ❓ 2군 매체·기자 채널 확인: Romano Substack, CaughtOffside 작성자 페이지, Di Marzio, Plettenberg, Moretto, Ben Jacobs — RSS 유무·robots.txt → 사용자 확인 후 등록
- [ ] M0-25 ❓ 국내 매체 RSS(인터풋볼·풋볼리스트·스포탈코리아·베스트일레븐) 제공 여부·이용 조건 → 사용자 확인 후 등록
- [ ] M0-26 Google News RSS: 한/영 쿼리 5종 테스트, 이용 조건, 하루 쿼리 상한 결정
- [ ] M0-27 GDELT DOC API: 다국어 쿼리 3종 테스트
- [ ] M0-28 football-data.org: 6개 대회 2026-27 순위·경기·득점 응답 확인, 분당 10회 지연 설계
- [ ] M0-29 API-Football: **2026-27 시즌 무료 조회 가능 여부** → 분기 결정 기록 (§14 B1)
- [ ] M0-30 💰 Anthropic 실측: 샘플 5건 배치 1회 — 실제 단가, 배치 완료 소요 시간, 캐시 최소 프리픽스 충족 여부(`cache_read_input_tokens`) (§14 B3)
- [ ] M0-31 🙋 서비스명(KIPRIS)·저장소명 확인 결과 기록 (§14 B6)
- [ ] M0-32 2026-27 시즌 5대 리그 한국 선수 명단 **초안** (출처와 함께 기록, M3에서 확정)

### M0-E 시안·테스트용 실데이터 fixtures 🆕
> 시안을 가짜 문구로 만들면 실제 헤드라인 길이·요약 줄바꿈에서 디자인이 깨진다. 실제 데이터로 시안을 그리기 위해 M0에서 확보한다.
- [ ] M0-33 실제 RSS 수집 샘플 50건 → `fixtures/rss/`
- [ ] M0-34 💰 샘플 15건 요약(임시 프롬프트) → `fixtures/news-sample.json` (D0 시안 입력)
- [ ] M0-35 순위·경기·득점 샘플(5대 리그 + UCL) → `fixtures/football/`
- [ ] M0-36 테스트용 LLM mock 응답 → `fixtures/llm/`

### ✅ M0 완료 기준
- [ ] 빈 사이트가 Pages에 배포되고 basePath·404 정상
- [ ] CI green (`check` · `build` · `check:bundle` · `test:e2e`), main push 시 `deploy.yml` 배포 확인
- [ ] `sources.json`의 모든 소스에 `terms_checked`·`robots_checked` 값이 채워짐
- [ ] API-Football 분기(B1)·캐싱 여부(B3) 결정이 기록됨
- [ ] 실측 단가로 PRD §9.3 가정을 확인 (차이가 크면 사용자에게 보고)
- [ ] §3 사용자 준비 작업 완료

---

## 5. D0 🎨 — 전체 디자인 콘셉트 (2~3일)

> **시안 2~3개 → 사용자 선택 → DESIGN.md → 구현.** 이 게이트가 끝나야 M1을 착수한다 (순차 진행, §2.1).

### D0-A 범위 정리
- [ ] D0-01 시안 범위 확정
  - 화면: **홈**(오늘의 5줄 · 한국 선수 칩 자리 · 오늘 밤 경기 자리 · 주요 뉴스 피드), 헤더·모바일 하단 탭(2~5개 가변 — 미완성 섹션은 숨김)·데스크톱 3단, 테마 토글
  - 상태 화면 기본형: 스켈레톤 · 빈 상태 · 오류 · 오프라인 (텍스트·도형 기반, 일러스트는 D3) 🆕
  - 뉴스 카드 변형 6종: 기본 / 다출처 클러스터(+N곳) / 이적(상태+Tier 배지) / 한국 선수 관련 / 경기 결과(결과 가리기 켠 상태) / 강등 카드(요약 없이 원제목+링크)
  - 브랜드: 워드마크(텍스트 로고), 컬러·타이포 토큰, 대회 컬러 6종 시범 적용
- [ ] D0-02 ❓ U-10 응답이 있으면 반영할 키워드 확인 (없으면 생략)

### D0-B 시안 제작 (`/design-concepts d0`, `design-concepts` 에이전트)
- [ ] D0-03 시안 2~3개: `docs/design/d0/concept-{a,b,c}.html` — 외부 의존 없는 단일 HTML, `fixtures/news-sample.json` 실데이터 사용
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

**목표**: 매일 07:00 KST에 30~50건의 한국어 요약 카드가 자동 발행되는 공개 사이트.
**관련 요구사항**: FR-01~09, FR-11~36 (FR-10은 M3-08, FR-37은 M4-15), FR-140, FR-150~154, NFR-04~06

### M1-0 얇은 수직 슬라이스 🆕 (첫날)
> 각 단계를 완벽히 만들기 전에, 전 구간이 한 번 끝까지 도는지부터 확인해 통합 위험을 먼저 없앤다.
- [ ] M1-01 💰 BBC RSS 1개 → 상위 5건 요약 → `data/news/YYYY-MM-DD.json` → 무스타일 목록 페이지 → Actions에서 커밋·빌드·Pages 배포까지 한 번에 성공

### M1-A 수집 (FR-01~11)
- [ ] M1-02 `configs/sources.json` 초기 등록(M0 검증 통과분만) + 로더(`enabled && terms_checked`만)
- [ ] M1-03 RSS 어댑터 (타임아웃·재시도, 소스별 실패 격리)
- [ ] M1-04 기자 채널: Substack RSS + 작성자 필터(Guardian·The Athletic)
- [ ] M1-05 목록 크롤러 `scripts/crawlers/<site>.ts` — M0에서 허용 확인된 사이트만 (robots.txt, User-Agent, 2~3초 지연, 하루 1회)
- [ ] M1-06 Google News RSS 검색 어댑터 + `configs/search-queries.json`
- [ ] M1-07 GDELT 어댑터
- [ ] M1-08 OG 메타 경량 수집기 — 요약 없는 항목만, `<head>`만 파싱, 최대 500자
- [ ] M1-09 공통 형식 정규화 + zod 검증 (FR-03), "본문 필드 없음" 테스트 (FR-02)
- [ ] M1-10 수집 시간 창: 직전 성공 실행 ~ 현재, 최대 36시간 (FR-07)
- [ ] M1-11 소스 건강도 기록 + 3일 연속 0건 이슈 (FR-11)

### M1-B 정제 — 코드, 순수 함수 + 단위 테스트
- [ ] M1-12 URL 정규화(utm·트래킹 파라미터·AMP) + 해시 중복 제거 + `seen-urls.json`(90일) (FR-04)
- [ ] M1-13 제목 유사도 클러스터링 — 한/영 혼합, 임계값은 fixtures로 튜닝 (FR-05)
- [ ] M1-14 점수화 + 상위 `MAX_ITEMS_PER_RUN` 선별, 이적 창 가중 연결 지점 마련 (FR-06, FR-105)
- [ ] M1-15 한국어 클러스터 경로: LLM 생략, RSS 요약 절단 또는 제목+링크, 분류(카테고리·태그·중요도·spoiler)는 코드 규칙 (FR-20)
- [ ] M1-16 카드 ID 결정적 해시 `c_` + 16진수 10자리 (대표 URL 기준, 공유 앵커 유지, PRD §15 D15)

### M1-C 요약 — LLM (FR-20~29)
- [ ] M1-17 `configs/prompts/summarize.md` v0.1 — 뉴스체(`~했다`), 3줄·줄당 60자 내외, 입력에 없는 사실 금지, 루머는 보도 형식, 고유명사는 영문 유지, 짧은 키 JSON. 출력에 이적 상태(`collapsed` 포함)·이적 선수/출발/행선지·`spoiler` 판정 포함 (FR-21, PRD §15 D17)
- [ ] M1-18 배치 구성: 10~20건 묶음, 고정 지시 캐싱(B3 결과에 따름), `max_tokens` 상한
- [ ] M1-19 💰 Batches 제출·폴링 + 06:50 폴백(상위 10건 일반 API, 나머지 원제목+링크) → 다음 실행에서 원래 날짜 카드를 같은 ID로 보충(보충 대기 목록 유지, 그날 상한에 포함) (FR-25, FR-26)
- [ ] M1-20 출력 zod 검증 → 1회 재시도 → 강등, 길이 재검증·절단 (FR-23, FR-29)
- [ ] M1-21 고유명사 치환 + `unknown-names.json` 적재, `names.ko.json` 초기 사전(빅클럽·주요 선수) (FR-24)
- [ ] M1-22 비용 가드: 일 $0.10 / 월 $3, dev+prod 합산, 실행 전 예상 비용 출력, dev 사용이 월 예산 50% 초과 시 알림 (FR-27, CLAUDE §6.3)
- [ ] M1-23 🆕 **자동 사실성 검사기**: 요약에 나온 숫자·스코어·금액·날짜·따옴표 인용이 입력에 실제로 있는지 코드로 대조 → 불일치 줄 제거 (재시도 없음 — 호출 증가는 CLAUDE §1-3에 따라 승인 필요. 비용 0, FR-22 보강)
- [ ] M1-24 🆕 **골든셋 회귀 평가**: 대표 기사 10건(`fixtures/llm/golden/`, PRD §9.2) + `npm run eval:prompt` — 프롬프트 수정 전후 출력 diff·검사기 결과 비교 (CLAUDE §6.3 구체화)

### M1-D 검증·발행·운영
- [ ] M1-25 발행 검증 게이트: 스키마, 카드 수 하한(≥10, 휴식기 5), 링크 형식, `configs/takedowns.json` 등록 카드 제외 + 다음 수집에서 `data/` 원본 삭제 (FR-143, FR-153)
- [ ] M1-26 `collect.yml` 완성: 수집 → 정제 → 요약 → 검증 → 빌드 → `data/` 커밋(변경분만, `pull --rebase`) → `deploy.yml` 호출. 빌드 실패 시 커밋하지 않음 (CLAUDE §10)
- [ ] M1-27 `runs.json` 기록 완성 (토큰·비용·건수·실패 소스·API 호출 수) + 실패 이슈 (FR-151, FR-152)
- [ ] M1-28 롤백 리허설: `data/` 커밋 revert → `deploy.yml` 수동 실행 (FR-154, CLAUDE §12)
- [ ] M1-29 커스텀 커맨드 동작 완성: `/add-source` · `/add-name` · `/takedown`

### M1-E 화면
- [ ] M1-30 앱 셸: 헤더(워드마크·검색 자리·테마 토글), 모바일 하단 탭(최종 5개, M1 시점은 홈·뉴스만 노출 — 미완성 섹션 숨김), 데스크톱 3단 그리드, 푸터(데이터 출처·AI 고지·마지막 업데이트 HH:MM KST) (DR-01, FR-142)
- [ ] M1-31 뉴스 카드 + D0의 6개 변형 — 출처 스택(+N곳), "AI 요약" 라벨, 카테고리 칩, 중요도, KST 상대 시간 (FR-30, FR-35)
- [ ] M1-32 홈: 오늘의 5줄 + 주요 뉴스 피드 (다른 섹션은 해당 단계에서 노출)
- [ ] M1-33 `/news` 필터(대회·팀·카테고리·한국 선수) + URL 쿼리 동기화 (FR-31, FR-32)
- [ ] M1-34 `/news/[date]` 아카이브: 이전/다음 날짜, 달력 점프, `generateStaticParams` (FR-33)
- [ ] M1-35 카드 공유(Web Share/링크 복사, 카드 앵커) + 오류 신고 링크(카드 ID 자동 입력) (FR-34, FR-36)
- [ ] M1-36 `/about`(서비스·발행 시각·출처·저작권 정책·Tier 설명·AI 고지·데이터 출처·연락처) + 커스텀 404 (FR-140)
- [ ] M1-37 상태 디자인 4종: 스켈레톤 · 빈 상태 · 오류(마지막 정상 데이터) · 오프라인 (DR-07)
- [ ] M1-38 기본 SEO: 페이지별 title/description/OG 기본값, sitemap, robots.txt (FR-124)
- [ ] M1-39 시각 검증: 375/1280 × 라이트/다크 스크린샷 ↔ D0 선택안 비교, 접근성 자동 검사, 번들 예산 확인

### M1-F 운영 리허설·실측 🆕
- [ ] M1-40 수동 dispatch 3회 연속 성공 → cron-job.org **06:30 KST 정기 실행 활성화**
- [ ] M1-41 7일 연속 정시 발행 관찰 (관찰 기간이 서머타임 전환일과 겹치면 경기 시각 KST 표시도 확인)
- [ ] M1-42 💰 첫 주 실측 비용·캐시 적중 확인 → PRD §9.3 비용표 갱신, 캐시 적중 0이면 캐싱 코드 제거
- [ ] M1-43 첫 주간 품질 검수 20건 (사실 일치·고유명사·카테고리·이적 상태 체크리스트) → 정확도 ≥ 90%

### ✅ M1 완료 기준
- [ ] 7일 연속 07:00 KST ±15분 발행 (일 30~50건, 중복 카드 0)
- [ ] 일 LLM 비용 ≤ $0.10 실측, `runs.json`에 기록
- [ ] 검증 게이트 실패 시 전날 사이트 유지가 실제로 동작함 (의도적 실패 1회 테스트)
- [ ] 모든 카드에 출처명·원문 링크, `ai:true` 카드 전부에 AI 라벨 (`ai:false` 카드에는 없음)

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
- [ ] M2-02 football-data 어댑터(`scripts/lib/providers/`): 순위·경기·득점, 분당 10회 지연, 실패 시 전일 데이터 유지 + "업데이트 지연" 표시
- [ ] M2-03 순위 변동(전일 대비)·최근 5경기 폼 계산 + 단위 테스트
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
- [ ] M3-03 `data/players/korean.json`: 최근 출전·골/도움·시즌 누적·다음 경기(KST)·UCL 출전
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
- [ ] M4-02 'Here we go' + Romano 출처 → `agreed` 가중, 30일 무갱신 "잠잠" 처리 (FR-103, FR-106)
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
- [ ] M4-15 결과 가리기 토글(기본 꺼짐): `spoiler` 카드·순위 변동·스코어 흐림, 탭하면 공개 (FR-37)
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

- [ ] M5-01 OG 이미지 빌드 시 생성(날짜·대회·팀) — **Playwright로 템플릿 HTML 스크린샷**(확정, 새 의존성 없음) (DR-10)
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
- [ ] 주간 샘플 요약 정확도 ≥ 90%

---

## 14. M0 결과에 따른 분기 계획

| ID | 상황 | 대응 | 영향 작업 |
|---|---|---|---|
| **B1** | API-Football 무료로 2026-27 시즌 조회 불가 | 한국 선수는 경기 결과 + 득점 순위 + 뉴스 기반 "출전·득점 소식"(FR-65), 포메이션은 `formations.json` 수동(빅클럽 우선) 또는 미표시 | M2-07, M3-02 |
| **B2** | Google News RSS 이용 불가 | GDELT + 국내 매체 RSS로 대체, NewsData.io 등은 ❓ 승인 후 | M1-06 |
| **B3** | 프롬프트 캐싱 최소 길이 미달 | 캐싱 코드 제거, 묶음 크기로 비용 조정, PRD 비용표 갱신 | M1-18, M1-42 |
| **B4** | 실측 일 비용 > $0.10 | ❓ 승인 후 순서대로: 입력 500→300자 → 묶음 확대 → `MAX_ITEMS_PER_RUN` 45→35 | M1-22 |
| **B5** | 핵심 RSS 약관상 요약 불가 | 해당 소스는 원제목+링크만 또는 제외 | M1-02 |
| **B6** | 서비스명 상표·저장소명 충돌 | ❓ 이름 재검토 — 저장소명·basePath에 영향하므로 **M0에서 먼저** 결정 | M0-01, M0-13 |

---

## 15. 제안 사항 (plan 단계)

### 15.1 이 문서에 반영한 보강 🆕 (PRD 범위 변경 없음)
| # | 제안 | 이유 | 비용 |
|---|---|---|---|
| 1 | **얇은 수직 슬라이스** 우선 (M1-01) | 수집→LLM→커밋→Pages 통합 위험을 첫날 제거 | 소량 |
| 2 | **실데이터 fixtures로 시안 제작** (M0-E) | 실제 헤드라인 길이에서 깨지지 않는 디자인 | 소량 |
| 3 | **자동 사실성 검사기** (M1-23) | 숫자·인용 환각을 코드로 차단 — 무인 운영의 신뢰도 핵심 | 0 |
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
- 요약 품질 검수 20건 + `summary-error` 신고 처리
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
const Iso = z.string().datetime();                 // UTC ISO 8601
const CompId = z.enum(["EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1", "UCL"]);
const Category = z.enum(["result", "transfer", "injury", "club", "national", "ucl", "other"]);
const TransferStatus = z.enum(["rumor", "negotiating", "agreed", "official", "collapsed"]);
const Tier = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// configs/sources.json
const Source = z.object({
  id: z.string(), name: z.string(),
  type: z.enum(["rss", "crawl", "search", "journalist", "aggregator", "analysis"]),
  url: z.string().url(), lang: z.string(),           // "en" | "ko" | "es" …
  enabled: z.boolean(), weight: z.number().min(0).max(3), tier: Tier,
  competitions: z.array(CompId).default([]),
  author: z.string().optional(),                     // 작성자 필터(기자 채널)
  terms_checked: z.boolean(), robots_checked: z.boolean(),
  note: z.string().optional(),                       // 약관 확인 메모·날짜
});

// data/news/YYYY-MM-DD.json  → { date, generatedAt, runId, cards: NewsCard[] }
const NewsCard = z.object({
  id: z.string().regex(/^c_[0-9a-f]{10}$/),         // 대표 URL 결정적 해시 (16진수 10자리)
  t: z.string().max(200),                            // 제목: AI 한국어 제목 ≤80자(아래 refine), 원제목·한국어 원문 카드 ≤200자
  s: z.array(z.string().max(80)).max(3),             // 3줄 요약 (강등 카드는 [])
  cat: Category, comp: z.array(CompId),
  teams: z.array(z.string()), players: z.array(z.string()),   // slug
  imp: z.number().int().min(1).max(5),
  kr: z.boolean(), spoiler: z.boolean(),
  transfer: z.object({
    player: z.string(), from: z.string().optional(), to: z.string().optional(),
    status: TransferStatus, tier: Tier,
  }).optional(),
  src: z.array(z.object({ n: z.string(), u: z.string().url(), at: Iso, tier: Tier })).min(1),
  lang: z.string(),
  ai: z.boolean(),                                   // AI 요약 여부 (false = 원문/한국어 카드)
  created: Iso,
}).refine((c) => !c.ai || c.t.length <= 80, { path: ["t"], message: "AI 제목은 80자 이내" });

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
  zone: z.enum(["ucl", "uel", "uecl", "relegation", "none"]),
});
const Match = z.object({
  id: z.string(), comp: CompId, round: z.string(), kickoff: Iso,
  home: z.string(), away: z.string(),
  score: z.object({ h: z.number(), a: z.number() }).nullable(),
  status: z.enum(["scheduled", "finished", "postponed"]),
});

// data/teams/{team}.json
const Team = z.object({
  slug: z.string(), nameKo: z.string(), nameEn: z.string(), short: z.string().max(4),
  comp: CompId, alsoIn: z.array(CompId).default([]),          // 예: ["UCL"]
  colors: z.tuple([z.string(), z.string()]),
  formation: z.object({ shape: z.string(), source: z.enum(["api", "manual"]), updated: Iso }).nullable(),
  topPlayers: z.array(z.object({ name: z.string(), goals: z.number(), assists: z.number().nullable() })).max(3),
  profile: z.object({                                          // 주 1회 LLM
    oneLiner: z.string().max(80),
    strengths: z.array(z.string()).length(2), weaknesses: z.array(z.string()).length(2),
    generatedAt: Iso,
  }).nullable(),
  koreanPlayers: z.array(z.string()),
  reading: z.array(z.object({ title: z.string(), url: z.string().url(), source: z.string() })),
});

// configs/korean-players.json → KoreanPlayer[]
const KoreanPlayer = z.object({
  slug: z.string(), nameKo: z.string(), nameEn: z.string(),
  team: z.string(), comp: CompId.or(z.literal("OTHER")),
  position: z.enum(["GK", "DF", "MF", "FW"]), birthYear: z.number(),
  apiFootballId: z.number().nullable(), active: z.boolean(),
});

// data/players/weekly/{yyyy-ww}.json
const WeeklyReport = z.object({
  week: z.string().regex(/^\d{4}-\d{2}$/), from: Iso, to: Iso,   // ISO 8601 주차(연도는 ISO week-year, 예: 2026-12-28 → "2026-53")
  rows: z.array(z.object({ player: z.string(), apps: z.number(), minutes: z.number(),
                           goals: z.number(), assists: z.number() })),
  mvp: z.string().nullable(),                        // 코드 규칙: 골×3 + 도움×2 + 출전
  summary: z.string(),                               // LLM 총평 3~5문장
  generatedAt: Iso,
});

// data/runs.json(prod) · data/runs-dev.json(dev, 개발자 커밋) → RunLog[] (각 최근 180일, 비용 가드는 합산)
const RunLog = z.object({
  runId: z.string(), env: z.enum(["dev", "prod"]), job: z.enum(["collect", "weekly"]),
  startedAt: Iso, finishedAt: Iso,
  collected: z.number(), clusters: z.number(), summarized: z.number(), downgraded: z.number(),
  tokens: z.object({ in: z.number(), out: z.number(), cacheRead: z.number(), cacheWrite: z.number() }),
  costUsd: z.number(),
  apiCalls: z.object({ footballData: z.number(), apiFootball: z.number() }),
  sources: z.array(z.object({ id: z.string(), ok: z.boolean(), items: z.number() })),
  status: z.enum(["success", "partial", "failed", "skipped"]),
});

// configs/takedowns.json → { id(카드 ID), requestedAt, handledAt, reason }[] — 빌드 시 제외, 다음 수집에서 data/ 원본 삭제
```

**PRD 초안 대비 변경점**: `src[].tier`·`spoiler`·`ai`·`transfer.player/from/to`는 PRD 그대로 확정. 추가된 필드는 `Transfer.quiet`(FR-106), `RunLog.env`·`job`·`downgraded`·`sources`(소스 건강도 FR-11), `Team.alsoIn`(UCL 외부 팀·이중 소속 표현), `KoreanPlayer.active`(FR-64). 바뀐 구조는 `RunLog.tokens.cached` → `cacheRead`·`cacheWrite`(캐시 쓰기 단가가 따로 있음), `RunLog.failedSources` → `sources[]`(실패 소스는 `ok:false`로 도출), 뉴스 파일 최상위를 카드 배열 대신 `{ date, generatedAt, runId, cards }` 객체로. 카드 ID를 16진수 6자리에서 10자리로, 제목 상한을 AI 80자 / 원제목·한국어 원문 200자로 분리(PRD §15 D15).

---

## 부록 B. 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-10 | 최초 작성 (v0.1) | basic_plan·PRD·CLAUDE.md 기반 상세 개발계획 |
| 2026-10-10 | 일정은 날짜 없이 순서·기간만, 순차 진행(병행 트랙 없음), `/status` 페이지·Playwright OG 생성 승인 | 사용자 결정 |
| 2026-10-10 | 4문서 정합성 검토 반영: CLAUDE 절 참조 수정, 빌드 후 커밋 순서, 백업 schedule 06:40, D0·D2 게이트 범위 보강, M1-23 재시도 제거, 골든셋 10건 | 문서 간 충돌 해소 |
| 2026-10-10 | takedowns `configs/` 이관, 카드 ID 10자리·제목 상한 분리, 강등분 같은 ID 보충, 요약 출력 항목 추가, `runs-dev.json` 분리, AI 라벨 `ai:true`만, 재사용 `deploy.yml` (PRD §15 D14~D20) | 사용자 결정 |
| 2026-10-10 | 초기 JS 예산 120KB → 160KB(gzip) 상향 (PRD §15 D21) | M0-01 실측: 프레임워크 기본 런타임만 약 138KB |
