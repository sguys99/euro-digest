/**
 * 분석 진입점 — 공용 `track()` 도우미 (PRD NFR-08 · §11.2 제품 KPI, plan M5-04)
 *
 * 화면 코드(셸 상태 섬 · 팔로우 저장소)와 원문 링크 마크업은 이 파일만 본다. GoatCounter 구현(src/lib/goatcounter.ts — 스크립트 싣기 ·
 * 페이지뷰 · 위임 리스너 · 규칙 전부)은 **공개 빌드 + 공개 사이트 출처**일 때만 `import()`로 받는 지연 조각이다:
 * - 초기 JS(check:bundle — HTML `<script src>` 합)에 들어가지 않는다. 이 파일은 상수 · 판정 몇 줄뿐이다.
 * - 개발 서버(`NODE_ENV`) · 견본 빌드(`NEXT_PUBLIC_ANALYTICS=off`) · 로컬 미리보기와 e2e(출처가 `NEXT_PUBLIC_SITE_URL`이 아님)에서는 조각을
 *   받지도 않는다 — 아무것도 보내지 않는다. basePath 아래인지 등 세부 판정은 구현의 `startAnalytics`가 한 번 더 한다.
 * - 조각을 받지 못해도(오프라인 · 차단) 조용히 넘어간다 — 분석은 화면 동작을 막지 않는다.
 */

/** 원문 링크 표시 속성 — 이 속성이 붙은 `<a>`만 `out/{호스트}`로 센다(src/lib/goatcounter.ts `linkEvent`) */
export const TRACK_ATTR = "data-track";
export const TRACK_OUT = "out";
/** 원문 링크에 펼쳐 넣는 속성 묶음(`<a {...OUT_LINK_PROPS}>`) — 카드 제목 · 출처 목록 · 검색 결과 기사 · 팀 '더 읽을거리' */
export const OUT_LINK_PROPS = { [TRACK_ATTR]: TRACK_OUT } as const;

export type FeedFormat = "rss" | "ics" | "webcal";

/** 보내는 이벤트(이름 규칙은 src/lib/goatcounter.ts `eventPath`) */
export type AnalyticsEvent =
  | { kind: "out"; host: string }
  | { kind: "feed"; format: FeedFormat; scope: string }
  | { kind: "pwa-install" }
  | { kind: "my-set" };

type GoatCounterModule = typeof import("./goatcounter");

let loading: Promise<GoatCounterModule> | null = null;

/** 공개 빌드 + 공개 사이트 출처인가(그렇지 않으면 구현 조각을 받지 않는다) */
export function analyticsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ANALYTICS === "on" &&
    typeof window !== "undefined" &&
    window.location.origin === process.env.NEXT_PUBLIC_SITE_URL
  );
}

/** 구현 조각(한 번만 받는다 — 실패하면 다음 호출에서 다시). 꺼져 있으면 null */
export function loadAnalytics(): Promise<GoatCounterModule> | null {
  if (!analyticsEnabled()) return null;
  loading ??= import("./goatcounter").catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

const ignore = () => {};

/** 이벤트 보내기 — 공용 도우미. 꺼져 있거나 조각 · 스크립트가 막혀도 조용히 넘어간다 */
export function track(event: AnalyticsEvent): void {
  loadAnalytics()?.then((m) => m.track(event), ignore);
}

/** 분석 시작(셸 상태 섬 — 문서마다 한 번) */
export function startAnalytics(): void {
  loadAnalytics()?.then(
    (m) =>
      m.startAnalytics({
        origin: process.env.NEXT_PUBLIC_SITE_URL ?? "",
        basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
      }),
    ignore,
  );
}

/** 페이지뷰(셸 상태 섬 — 경로가 바뀔 때마다). 주소는 부른 순간의 값 */
export function trackPageview(): void {
  if (!analyticsEnabled()) return;
  const { pathname } = window.location;
  loadAnalytics()?.then((m) => m.trackPageview(pathname), ignore);
}
