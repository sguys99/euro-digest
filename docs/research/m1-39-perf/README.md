# M1-39 성능 실측 — 모바일 4G LCP·CLS · 폰트 preload (v0.1)

> 작성 2026-10-23(측정) · 정리 2026-10-24 · plan M1-39 · DESIGN §11.3·§11.13 · PRD §15 D29 변경(2026-10-24 사용자 결정 — 웹폰트 preload 폐지)

CLAUDE §7.2 예산(LCP ≤ 2.0초 모바일 4G · CLS ≤ 0.05)을 실제 호로 재고, D0-11의 웹폰트 preload(한글 400 + Barlow 800)를 다시 정하려고 만든 측정 도구와 결과다. 테스트·CI·배포에는 쓰지 않는다(재현용). Lighthouse가 아니라 같은 조건을 CDP로 직접 건다 — M5-07(Lighthouse 모바일 ≥ 95)에서 Lighthouse로 다시 확인한다.

## 1. 파일

| 파일 | 하는 일 |
|---|---|
| `h2serve.mjs` | `out/`(또는 복사본)을 `/euro-digest` 아래에서 **HTTP/2(TLS) + gzip 6 + max-age=600**으로 서빙 — GitHub Pages(Fastly)와 같은 전송 조건. `scripts/serve-out.ts`(e2e용)는 HTTP/1.1·무압축이라 원본 666KB HTML을 그대로 보내 측정에 쓰면 안 된다 |
| `lcp.mjs` | 페이지마다 새 컨텍스트·캐시 없음으로 N회 열어 FCP·LCP(요소)·CLS(이동 출처)·TBT·폰트 응답 시각을 재고 중앙값을 JSON 한 줄로 |
| `fold-fonts.mjs` | 폰트 로드 뒤 첫 화면(뷰포트 안) 글자를 실제로 그린 글꼴(CDP `CSS.getPlatformFontsForNode`) — 글자 수와 넓이(글자 수 × 크기²/256) |
| `mkvar.py` | `out/`을 복사해 HTML의 웹폰트 preload 링크만 바꾼 변형 6가지(빌드 없이 preload 효과만 비교) |
| `summarize.py` | `lcp.mjs` 출력 → 표 |
| `results/` | 2026-10-23 원자료 — `h2var-{slow4g,fast4g}.jsonl`(preload 변형 6 × 2쪽), `final-{slow4g,fast4g}.jsonl`(HEAD 대비 전·후 × 6쪽), `fold-fonts.txt`(첫 화면 글꼴, 글자 수 기준 — 넓이는 아래 §3) |

## 2. 조건과 실행

- **환경**: WSL2 Ubuntu · Playwright 1.64 Chromium(headless) · 412×823 배율 1.75 모바일 에뮬레이션(Lighthouse 모바일 기기 크기) · 캐시 없음 · 5회 중앙값.
- **프로필**: `slow4g` = Lighthouse 모바일의 devtools 적용 스로틀링(RTT 562.5ms · 1,474.56 kbps · 업 675 kbps · CPU 4×) — 예산 판정 기준 · `fast4g` = DevTools "Fast 4G"(RTT 165ms · 9 Mbps · CPU 4×).
- **글꼴 환경**: Linux에는 한글 시스템 글꼴이 없어 폴백이 빈칸(두부)으로 그려진다. fontconfig로 Windows 글꼴(맑은 고딕·Arial)이나 Noto Sans KR·Liberation을 넣어 사용자 기기에 가깝게 잰다.

```bash
# 0) 빌드 · 인증서(자체 서명 — 저장소에 두지 않는다)
npm run build
mkdir -p /tmp/m1-39-perf && openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/m1-39-perf/key.pem -out /tmp/m1-39-perf/cert.pem -days 2 -subj "/CN=127.0.0.1"

# 1) (선택) 글꼴 환경 — Windows 글꼴을 fontconfig로
mkdir -p /tmp/m1-39-perf/win/fonts /tmp/m1-39-perf/win/cache
cp /mnt/c/Windows/Fonts/{malgun,malgunbd,arial,arialbd}.ttf /tmp/m1-39-perf/win/fonts/
cat > /tmp/m1-39-perf/win/fonts.conf <<'XML'
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>/tmp/m1-39-perf/win/fonts</dir><cachedir>/tmp/m1-39-perf/win/cache</cachedir></fontconfig>
XML
export FONTCONFIG_FILE=/tmp/m1-39-perf/win/fonts.conf

# 2) 서버 + 측정
node docs/research/m1-39-perf/h2serve.mjs out 4199 &
BASE=https://127.0.0.1:4199/euro-digest/ node docs/research/m1-39-perf/lcp.mjs slow4g \
  ",news/,news/2026-10-22/,news/2026-10-22/#c_7d0214a219,about/,this-page-does-not-exist/" 5 412x823m > /tmp/m1-39-perf/slow4g.jsonl
python3 -I docs/research/m1-39-perf/summarize.py /tmp/m1-39-perf/slow4g.jsonl

# 3) preload 변형 비교 — 변형마다 서버를 띄워 같은 측정
python3 -I docs/research/m1-39-perf/mkvar.py out /tmp/m1-39-perf/var
node docs/research/m1-39-perf/h2serve.mjs /tmp/m1-39-perf/var/v0_d0-11 4191 &   # v1_none 4192 …

# 4) 첫 화면 글꼴
BASE=https://127.0.0.1:4199/euro-digest/ node docs/research/m1-39-perf/fold-fonts.mjs
```

측정 중에는 다른 무거운 작업(빌드·e2e)을 같이 돌리지 않는다(CPU 4× 스로틀링 결과가 흔들린다). 날짜 경로·카드 앵커는 그때의 `data/`에 맞춰 바꾼다.

## 3. 결과 (2026-10-23, 그날 `data/` — 최신 호 10-23 제 12호, 카드 45장)

### 3.1 첫 화면이 쓰는 웹폰트 — 모든 페이지·폭에서 4면 모두

넓이(글자 수 × 크기²/256) 기준 상위 순서. 375·412·1024·1280 × 홈·`/news/`·날짜·소개·404 전부 4면이 첫 화면에 나온다(원자료 `results/fold-fonts.txt`는 글자 수).

| 폭 · 페이지 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 412 홈 | 한글 800 (208) | 한글 400 (146) | Barlow 600 (32) | Barlow 800 (25) |
| 412 `/news/` | Barlow 600 (265) | 한글 800 (199) | 한글 400 (99) | Barlow 800 (24) |
| 412 날짜 10-22(5줄) | 한글 400 (271) | 한글 800 (115) | Barlow 600 (74) | Barlow 800 (60) |
| 1280 홈 | 한글 800 (501) | 한글 400 (202) | Barlow 800 (79) | Barlow 600 (41) |
| 1280 `/news/` | 한글 800 (492) | Barlow 600 (321) | 한글 400 (158) | Barlow 800 (73) |
| 1280 날짜 10-22 | 한글 400 (355) | 한글 800 (213) | Barlow 800 (135) | Barlow 600 (104) |

쓰임: 한글 800 = 워드마크·섹션 제목·한글 카드 제목 · 한글 400 = 본문·5줄 문장 · Barlow 600 = 러닝 헤드·시각·라틴 원제목 · Barlow 800 = 호수·5줄 등번호.

### 3.2 preload 변형 6가지 (HTTP/2, 412 모바일, 5회 중앙값, 맑은 고딕·Arial 환경 — `results/h2var-*.jsonl`)

| 변형 | preload | Slow 4G LCP 홈 · 날짜 | Fast 4G LCP 홈 · 날짜 | 웹폰트 다 바뀜(Slow · Fast) |
|---|---|---|---|---|
| v0 (D0-11~M1-37) | 한글 400 + Barlow 800 (204.5KB) | 1.79 · 1.82초 | 0.81 · 0.86초 | 4.34 · 0.93초 |
| **v1 (결정)** | **없음** | **1.50 · 1.47초** | **0.69 · 0.68초** | 4.87 · 1.07초 |
| v2 | 4면 모두 (417.9KB) | 1.75 · 1.79초 | 0.86 · 0.89초 | 4.34 · 0.91초 |
| v3 | 한글 400 + Barlow 600·800 | 1.86 · 1.88초 | 0.85 · 0.87초 | 4.34 · 0.92초 |
| v4 | 한글 800 + Barlow 600·800 | 1.86 · 1.89초 | 0.86 · 0.88초 | 4.34 · 0.91초 |
| v5 | Barlow 600·800 (55KB) | 1.80 · 1.82초 | 0.81 · 0.88초 | 4.76 · 1.05초 |

- LCP 요소는 처음 그린 시각 그대로다(swap — 폴백 글꼴로 그린 첫 페인트가 LCP, 웹폰트로 바뀌어도 다시 잡히지 않는다).
- preload가 하나라도 있으면(55KB만이어도) LCP가 **+0.12~0.4초** 늦다 — preload한 폰트가 첫 페인트 전에 도착하면 첫 페인트가 그만큼 밀린다(4× CPU에서 폰트 적용·다시 그리기). preload가 없으면 폰트 요청은 첫 레이아웃 뒤에 시작해 첫 페인트와 겹치지 않는다.
- 대가는 웹폰트로 다 바뀌는 시각뿐(Slow 4G +0.5초 · Fast 4G +0.14초). 바뀔 때 줄 바뀜은 메트릭 폴백(DESIGN §3.1)이 막아 CLS 0.0001.
- HTTP/1.1 서버로 잰 같은 비교(초기 실험)도 방향이 같았다(홈·날짜 — v1 LCP 1.54·1.52초 vs v0 1.81·1.82초).

### 3.3 전·후 (HEAD = preload 2파일 → preload 없음 + 목차·포커스 수정, `results/final-*.jsonl`)

| 페이지 | LCP Slow 4G 전 → 후 | LCP Fast 4G 전 → 후 | CLS(최대) | TBT Slow 4G | HTML gzip |
|---|---|---|---|---|---|
| 홈 | 1.82 → **1.51**초 | 0.82 → **0.70**초 | 0.0001 | 205ms | 50.6KB |
| `/news/` | 1.81 → **1.55** | 0.85 → **0.69** | 0.0003 | 254ms | 55.8KB |
| 날짜 10-22(5줄) | 1.82 → **1.50** | 0.90 → **0.74** | 0.0001 | 246ms | 56.5KB |
| 같은 날짜 공유 앵커(`#c_…`) | 1.84 → **1.47** | 0.87 → **0.69** | 0.0016 | 328ms | 56.5KB |
| `/about/` | 1.64 → **1.50** | 0.68 → **0.66** | 0.0099 | 118ms | 20.3KB |
| 404 | 1.58 → **1.40** | 0.61 → **0.53** | 0.0001 | 103ms | 8.5KB |

모두 예산 통과. 소개 CLS 0.0099는 한글 800이 바뀔 때 본문이 한 번 밀리는 것. TBT(4× CPU의 HTML 파싱·하이드레이션 — 홈 HTML 원본 651KB 중 RSC 페이로드 377KB)는 Lighthouse 95점 기준(약 200ms) 언저리라 M5-07에서 다시 본다.

### 3.4 폰트 지연 CLS(e2e `tests/e2e/fonts.spec.ts`, 폰트 응답 1.5초 지연)

| 글꼴 환경 | 홈 · `/news/` · 5줄 날짜 | 단언 |
|---|---|---|
| WSL 기본(한글 시스템 글꼴 없음 — CI와 같음) | 측정만 | 건너뜀(한글 폴백 없음) |
| fontconfig 맑은 고딕 · Arial | 0.0001 ~ 0.0002 | 건너뜀(라틴 폴백 크기 비례 오차 4.8%) |
| fontconfig Noto Sans KR · Liberation | 0.0003 ~ 0.0005 | 건너뜀(한글 800 비례 오차 1.9%) |

Linux Chromium은 `local()` + `size-adjust` 글꼴을 정수 px로 반올림해 그린다(기기 배율 1·2·3 모두 같음). CLS 단언은 Windows·macOS Chromium에서만 실제로 돈다 — CI에 넣을지는 plan M1-39 이월 메모의 선택지.

## 4. 한계

- 로컬 서버라 실제 CDN의 TLS·TCP 핸드셰이크·지역 지연은 CDP 지연 값으로만 흉내 낸다. 절대값보다 변형 사이의 차이를 본다.
- CPU 4×는 측정 PC 기준이다(Lighthouse처럼 기기 성능으로 보정하지 않는다).
- Safari·Firefox·실기기는 재지 않았다 — plan M1-39 이월 🙋 체크리스트.
