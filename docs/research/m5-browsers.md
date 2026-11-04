# M5-12 브라우저 확인 — Chrome · Safari(iOS) · Edge · Samsung Internet 최신 2버전 (NFR-13)

> v0.1 · 2026-11-04 · 자동 확인(Playwright Chromium · WebKit) + 기능 지원 범위 점검. 실기기 확인은 `m5-accessibility.md` §5.4(🙋 사용자).

## 0. 요약

- **목표 브라우저(2026-11 기준 최신 2버전)**: Chrome · Edge 154~155 계열(4주 주기 — 정확한 번호는 실기기에서 확인, 이번 자동 확인 엔진은 Playwright Chromium 156 · WebKit UA Safari 27.2), **Safari 26.x · 27.x**(iOS 27 · Safari 27은 2026-09 정식), **Samsung Internet 29 · 30**(Android — Windows판은 31까지 나옴). Chrome · Edge · Samsung Internet은 모두 Chromium 엔진이라 자동 확인은 Chromium 하나로 대표하고, 기능 차이는 버전별 지원표(§2)로 본다. Samsung Internet은 Chromium 버전을 늦게 따라가므로(29 = Chromium 130대로 알려짐 — 공식 표기 없음) 지원표의 하한을 Chromium 125로 보수적으로 잡았다.
- **엔진 자동 확인**(§1): 핵심 e2e를 Chromium · WebKit 두 엔진으로 돌렸다. 결과는 §1 표.
- **기능 지원**(§2): 쓰는 CSS · JS 기능은 목표 브라우저에서 모두 지원된다. 미지원 기능 0 — 폴백 추가 없음. `color-mix()`는 Tailwind가 `@supports` 폴백을 이미 낸다.
- **고친 것**(§3): **인덱스 탭 세로 글자가 WebKit에서 겹쳤다**(웹폰트에 세로 메트릭이 없어 WebKit이 글자 높이만큼만 띄움) → `writing-mode` 없이 한 자씩 쌓는 방식으로 바꿔 두 엔진이 같은 모양(크롬 이전 모양 그대로). `/status` 띠 라벨 "발행일"도 같은 방식.
- **`/tonight` 상단 내비**(§4, 사용자 결정 2026-11-04): 리그와 한국 선수 사이에 '오늘 밤'. 1024~1440 × 라이트 · 다크 × 두 엔진 넘침 0.
- **결정 필요**(§5): 360 폭 7자 팀명 말줄임 — 1023 이하 일정·결과 탭 배지 xs로 줄일지.

## 1. 엔진별 e2e

실행: `npm run build` → `PORT=4183 npx playwright test --workers=2`(Chromium) / 같은 명령에 `E2E_ENGINE=webkit`(WebKit). 파일 필터에 쓴 `home`이 경로(`/home/…`)에도 걸려 **두 엔진 모두 e2e 전체(35파일 · 1,950건)**가 돌았다 — PWA(서비스 워커 · Chrome manifest 판정)는 WebKit 결과에서 분류만 하고 판정에서 뺀다.

| 엔진 | 통과 | 건너뜀 | 실패 | 시간(로컬 2 worker) | 실패 분류 |
|---|---|---|---|---|---|
| Chromium 156(Chrome · Edge · Samsung Internet 대표) | 1,751 | 196 | 3 → **0** | 17.2분 | `/tonight/` 현재 탭 기대값 2(이번 내비 변경 — 테스트 갱신) · 온보딩 키보드 1(부하 — 단독 재실행 통과) |
| WebKit(Safari 27.2 UA, Linux WPE) | 1,736 | 196 | 18 | 32.0분 | 진짜 Safari 문제로 고칠 것 **0**(인덱스 탭은 e2e가 아니라 스크린샷 비교로 찾았다 — §3) · 아래 표 |

WebKit 실패 18건 분류:

| 테스트 | 건수 | 분류 | 근거 |
|---|---|---|---|
| PWA(manifest · 오프라인 워커 캐시 · 오프라인 `/my`) | 6 | **제외 대상** | Chrome 전용 manifest 판정(CDP) · Playwright WebKit의 서비스 워커 제약. 설치 · 오프라인은 실기기 §5.1 |
| 공유 · 내보내기(클립보드) | 2 | **테스트가 Chromium 전제** | `grantPermissions(["clipboard-write"])` — WebKit에 없는 권한 이름 |
| localStorage 차단 → `/my` | 2 | **테스트가 Chromium 전제** · 사용자 영향 없음 | 페이지 이동으로 끊긴 RSC 프리페치를 WebKit이 `pageerror`("…due to access control checks")로 보고 — 화면 · 동작은 기대대로 |
| 타임라인 펼침(Enter) · `/status` 그래프 누름 · 팀시트 hover | 3 | **테스트 타이밍**(하이드레이션 전 조작) | WebKit 하이드레이션이 더 늦다. 하이드레이션 뒤 같은 조작은 두 엔진 모두 정상(별도 확인 — Enter · Space 펼침, 첫 칸 "10.06 (화) · 창간 전"), hover는 단독 재실행 통과 |
| 주간 리포트 '이전 주 W43' 누름 영역 71×43 | 1 | **측정 방식** | 실제 상자 70.02 × **44.00**px(`min-h-11`). 테스트가 상자 가운데(소수 좌표)에서 1px씩 눌러 보는데 WebKit 히트 판정 반올림이 달라 43 |
| 검색 대화상자(다크) axe color-contrast `.min-w-12` | 1 | **엔진별 axe 계산 차이** | 배경막(`--colophon` 62%) 아래 티켓의 단축키 글자("Ctrl K")를 WebKit에서는 겹친 색으로 계산 — 대화상자가 열린 동안 가려진 비대화형 글자 |
| 키보드 포커스가 하단 탭 · 오프라인 띠에 가림(1023 이하) | 3 | **WebKit 동작 차이 · AA 충족** | 여러 줄 카드 제목 링크에 Tab으로 갈 때 WebKit은 첫 줄 상자 기준으로 굴려 아래 줄 5~14px가 하단 탭 · 띠에 걸린다(Chromium 0). 첫 줄은 늘 보여 WCAG 2.4.11(AA — 완전히 가리지 않음)은 충족. `scroll-padding-bottom`을 16px 늘리면 온라인은 0이 되지만 오프라인 띠에서 다른 요소가 화면 밖으로 밀려 넣지 않았다. iOS 외부 키보드 실기기 항목(§5.4) |

### 1.1 WebKit 실행 환경 · CI

- `playwright.config.ts`에 **`E2E_ENGINE=webkit` 선택 실행**을 넣었다 — 같은 두 프로젝트(mobile · desktop)를 Desktop Safari 기기 설정으로 돌린다. 테스트가 프로젝트 이름으로 폭을 나누므로 이름은 그대로 둔다. 기본값은 Chromium이라 CI(`ci.yml`)와 `npm run test:e2e`는 바뀌지 않는다.
- **CI 기본 실행에는 넣지 않았다**: 같은 파일 묶음이 엔진 하나 더 → e2e 시간이 약 2배(CI 러너 3 worker 기준 지금 e2e job이 가장 길다). 넣는다면 ① 주 1회 `schedule` 별도 job ② 스모크 몇 개만 WebKit — 둘 중 하나를 권한다(§5 결정 2).
- WebKit 설치: `npx playwright install webkit`(devDependency 변경 없음). Linux는 시스템 라이브러리(`libevent` · `libavif16` · `libgstreamer-plugins-bad1.0-0` · `libmanette` · `libwayland-server0` · `libwebpdemux2` 등)가 필요하다 — CI는 `npx playwright install --with-deps webkit`, sudo가 없는 개발 기기는 `apt-get download`로 받은 .deb를 풀어 브라우저 폴더의 `sys/lib`에 두고 `PLAYWRIGHT_BROWSERS_PATH`로 그 사본을 가리켜 돌렸다(이번 확인 방식).
- **한계**: Playwright WebKit은 Linux용 WPE 빌드(글꼴 FreeType · HarfBuzz)라 iOS Safari(CoreText)와 글자 그리기 · 스크롤 · 주소창 · 안전 영역 동작이 다르다. 그래서 글자 모양 · 터치 동작은 실기기 목록(§5.4)에 남겼다.

## 2. 쓰는 기능의 지원 범위

빌드 산출 CSS(`out/_next/static/chunks/*.css` 131KB) · 클라이언트 JS 청크와 `src/`를 grep했다. '최소 버전'은 그 기능을 기본으로 켠 첫 안정판(MDN · caniuse 기준). 목표 하한: Chrome · Edge 150 · Safari 26 · Samsung Internet 29(Chromium 125 이상으로 보수적 — Samsung Internet 열은 그 기능이 들어간 Chromium 버전에서 환산한 값이라 ±1 차이가 있을 수 있다).

| 기능 | 쓰는 곳 | Chrome · Edge | Safari | Samsung Internet | 목표 최신 2버전 |
|---|---|---|---|---|---|
| 컨테이너 쿼리 `@container`(min-width 35rem · 37.5rem) | 팀 · 선수 티켓 팔로우 위치 | 105 | 16.0 | 20 | 지원 |
| `cqw` 단위 | OG 이미지만(빌드 때 서버에서 굽는다 — 브라우저 무관) | – | – | – | 해당 없음 |
| `:has()` | 이적 타임라인 펼침 · 라운드 `:target` · 경기 줄 연장 표기 · 마이 가져오기 | 105 | 15.4 | 20 | 지원 |
| `color-mix()` | 검색 대화상자 배경 · 투명도 수식어(`/55` 등) · placeholder | 111 | 16.2 | 22 | 지원(Tailwind가 `@supports` 밖에 단색 폴백도 냄) |
| `text-wrap: balance` | 소개 · 개인정보 머리 문장 | 114 | 17.5 | 23 | 지원(미지원이어도 보통 줄바꿈 — 점진적) |
| `text-wrap: pretty` | 5줄 문장 · 카드 제목 · 검색 결과 · 마이 안내 | 117 | 26.0 | 24 | 지원(점진적) |
| `@property` | Tailwind v4 내부 변수(그림자 · 변형 · 테두리) 44곳 | 85 | 16.4 | 14 | 지원 |
| `@layer` | Tailwind 기본 · 컴포넌트 · 유틸리티 층 | 99 | 15.4 | 18 | 지원 |
| CSS 중첩(`&`) | globals.css 원본 — **빌드가 펼쳐서 산출물에는 없음**(`&`는 클래스 이름 이스케이프뿐) | 120 | 17.2 | 25 | 해당 없음 |
| `writing-mode: vertical-rl` · `text-orientation: upright` | ~~인덱스 탭 · `/status` 띠 라벨~~ → **M5-12에서 제거**(§3) | 48 | 10.1 | 5 | 쓰지 않음 |
| `dvh` | 앱 셸 최소 높이 · 1024 이상 목차 · 검색 대화상자 상한 | 108 | 15.4 | 21 | 지원 |
| `env(safe-area-inset-bottom)` | 하단 탭 · 오프라인 띠 | 69 | 11.2 | 10 | 지원 |
| 개별 변형 속성 `translate` · `scale` | 모션 토큰(찍힘 · 뜯김 · 접힘) | 104 | 14.1 | 20 | 지원 |
| `:focus-visible` | 포커스 링 | 86 | 15.4 | 14 | 지원 |
| `size-adjust` (`@font-face`) | 메트릭 폴백 글꼴(CLS) | 92 | 17.0 | 16 | 지원 |
| `scrollbar-width` · `scrollbar-color` | 칩 줄 스크롤바 숨김 · 1024 이상 목차 얇은 스크롤바 | 121 | 버전에 따라 다름 | 25 | **`::-webkit-scrollbar` 폴백이 같은 규칙에 있음** — Safari도 숨김 · 얇은 막대 |
| `hyphens: auto` | (유틸리티 — `-webkit-` 접두 함께) | 88 | `-webkit-` 접두로 지원 | 15 | 지원 |
| `aspect-ratio` | 1024 이상 피치 | 88 | 15.0 | 15 | 지원 |
| JS `Array.prototype.at` · `Object.hasOwn` | 클라이언트 섬 | 92 · 93 | 15.4 | 16 | 지원 |
| JS `navigator.share` | 카드 메뉴 공유(없으면 링크 복사 — 함수 존재 검사) | Android 61 · 데스크톱 89 · Edge 93 | 12.2 | 지원 | 지원(없으면 링크 복사) |
| JS `IntersectionObserver` · `ResizeObserver` · `matchMedia` | 섬(스크롤 · 테마) | 58 · 64 | 12.1 · 13.1 | 지원 | 지원 |
| `document.startViewTransition` | Next.js 라우터 내부(존재 검사 후 호출) | 111 | 18.0 | 23 | 지원(없으면 보통 이동) |
| `URL.canParse` 등 | Next.js noModule 폴리필 청크(모던 브라우저는 받지 않음) | – | – | – | 해당 없음 |

판정: **목표 브라우저 최신 2버전에서 미지원 0** — 폴백을 새로 넣을 것이 없다. Next.js 16 기본 브라우저 대상(Chrome 111 · Safari 16.4)도 목표 하한보다 낮다.

## 3. 고친 것 — 인덱스 탭 세로 글자(M2-16 이월 ①)

- **증상**: WebKit에서 인덱스 탭 글자가 겹쳤다. 글자 간격(위 글자 시작 → 다음 글자 시작) Chromium 13px(1.24em) · WebKit 라틴 6~8px · 한글 9~10px. 상자 안 세로 가운데 정렬은 두 엔진 모두 맞았다(위아래 여백 차 1px 미만). 스크린샷: `docs/design/m5/screenshots/impl-m5-12-index-tab-{chromium,webkit}-before.png`.
- **원인**: 웹폰트 EuroDigest Sans에 세로 메트릭(vhea · vmtx)이 없다. 세로쓰기 글자 간격을 엔진이 지어내는데, Chromium은 ascent + descent, Playwright WebKit(FreeType)은 글리프 높이를 쓴다. iOS Safari(CoreText)가 어느 쪽인지는 실기기로만 알 수 있다 — 엔진 추측에 기대지 않게 바꿨다.
- **수정**: `writing-mode`를 쓰지 않고 **가로 글자를 한 자씩 줄 바꿈해 쌓는다** — 안쪽 상자 폭 `min-content`(가장 넓은 글자 하나) + `word-break: break-all` + 줄 높이 1.25em, 상자 높이 = 글자 수 × 1.25em(M2-16 CLS 고정 그대로). 텍스트 노드는 하나라 접근 이름 · `textContent`가 그대로다. 결과: 두 엔진 모두 간격 13.1px · 가운데, 크롬 이전 모양과 같다. `/status` 30칸 띠 라벨 "발행일"(장식 — `aria-hidden`)도 같은 방식.
- 시각 확인: 375 · 1280 × 라이트 · 다크 × 두 엔진(§4 스크린샷과 같은 실행).

## 4. `/tonight` 상단 내비(M2-16 이월 ③ — 2026-11-04 사용자 결정)

- 순서 **홈 · 뉴스 · 리그 · 오늘 밤 · 한국 선수 · 이적 · 마이**, 하단 탭 5개 그대로. 자리 근거: 리그(대회 순위 · 일정)와 오늘 밤(그 일정에서 고른 경기)은 같은 대회 데이터 · D1 화면이고, 한국 선수 · 이적은 D2 화면이다 — 상단 내비가 '매일 읽기 → 경기 → 사람 → 개인' 묶음 순이 된다.
- 같은 `TopNavLink`(15px 800 · 최소 48px · 간격 28px · 현재 = 글자 `--ink` + 아래 3px `--brand-accent` 막대 · `aria-current="page"` · 3px 포커스 링). `/tonight/`가 셸에 `current="tonight"`을 넘긴다.
- 넘침: 1024 · 1100 · 1200 · 1279 · 1280 · 1440 × 라이트 · 다크 × Chromium · WebKit, 홈 · `/news/` · `/tonight/` — 내비 · 페이지 가로 넘침 0, '마지막 업데이트'와의 간격 1024에서 317~320px, 링크 최소 48 × 44px.
- 스크린샷: `docs/design/m5/screenshots/impl-m5-12-tonight-nav-*`.

## 5. 사용자 결정이 필요한 것

1. **360 폭 7자 팀명 말줄임**(M2-16 이월 ②) — DECISIONS D1 §8 #11은 "칸보다 긴 어절(360 이하 폭)만 말줄임"으로 정했고 배지 xs는 제안으로만 남아 있다(결정 아님). 360 Bundesliga 일정·결과 탭 실측: 지금 18개 팀명 중 2개 말줄임("묀헨글라트…" · "아우크스부…"), 배지 xs(24 × 27)면 0개. 375는 둘 다 0개.
   - (A, 추천) **1023 이하 일정·결과 탭 배지를 xs로** — 갤럭시 기본 폭(360)에서 팀명이 온전히 보인다. 라운드 줄(대회 화면 기본 탭)이 이미 xs라 크기가 하나로 맞는다. 비용: `rounds.tsx` 배지 크기 분기 1줄(반응형 크기 — `lg:`에서 s) + e2e 1개. 스크린샷 `impl-m5-12-fixtures-360-badge-{s-now,xs-option}.png`
   - (B) 그대로(말줄임 허용) — 시안 크기 유지, 360에서 2팀만
2. **WebKit e2e를 CI에 넣을지** — (A, 추천) 넣지 않고 M5 공개 전 · 큰 UI 변경 때 수동 실행(`E2E_ENGINE=webkit`) / (B) 주 1회 schedule job / (C) 스모크만 매 push. 비용: (B) Actions 시간 주 1회 약 20~30분 · (C) push마다 약 2~3분
