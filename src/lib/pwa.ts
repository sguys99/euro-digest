/**
 * PWA 공용 규칙 — Web App Manifest · 임시 아이콘 목록 · 오프라인 프리캐시 대상 호 (PRD FR-120·FR-121, plan M4-13)
 *
 * 빌드 때만 쓴다(manifest 라우트 src/app/manifest.ts · 오프라인 화면 src/app/offline/page.tsx · 빌드 후 단계 scripts/build-sw.ts).
 * 화면 섬은 이 파일을 import하지 않는다(time.ts를 끌어오지 않게).
 *
 * - manifest: `start_url`·`scope`·`id` = basePath + `/`(GitHub Pages 프로젝트 사이트 — 루트 `/`로 두면 설치 범위가 사이트 밖까지 잡힌다),
 *   `display: standalone`, 색은 DESIGN §2.1 `--paper`(라이트) 값. manifest는 색을 하나만 받는다 — 다크 화면의 브라우저 UI 색은 루트 레이아웃의
 *   theme-color 메타 2개(라이트·다크 미디어 쿼리 — DESIGN §8)가 맡는다(설치 앱에서도 메타가 manifest 값보다 우선).
 * - 아이콘: **임시**(D3 아이콘 게이트에서 교체) — 코드로 그린 PNG(scripts/build-icons.ts → public/icons/). 이미지 자산 금지(CLAUDE §1-6)라
 *   로고·사진 없이 단색 면 + 이니셜 도형만 쓴다.
 * - 최근 3일 호: 오프라인 화면이 목록으로 보여 주는 호 = 서비스 워커가 미리 받아 두는 호. 같은 함수로 정해 둘이 어긋나지 않는다.
 */
import type { MetadataRoute } from "next";

import { SITE_NAME, SITE_TAGLINE } from "./site";
import { THEME_COLOR } from "./theme";
import { shiftDate } from "./time";

/** 오프라인으로 볼 수 있게 미리 받아 두는 호의 기간(일) — FR-121 "최근 3일 뉴스" */
export const RECENT_NEWS_DAYS = 3;

/** 임시 아이콘(D3에서 교체) — 사이트 경로(basePath 없음). `purpose: maskable`은 안전 영역(가운데 지름 80%) 안에만 그린다 */
export const PWA_ICONS = [
  { path: "/icons/icon-192.png", size: 192, purpose: "any" },
  { path: "/icons/icon-512.png", size: 512, purpose: "any" },
  { path: "/icons/icon-maskable-512.png", size: 512, purpose: "maskable" },
] as const;

/** iOS 홈 화면 아이콘(180px, 투명 없음) — `<link rel="apple-touch-icon">` */
export const APPLE_TOUCH_ICON = {
  path: "/icons/apple-touch-icon.png",
  size: 180,
} as const;

/**
 * Web App Manifest(FR-120). `withBasePath`는 src/lib/paths.ts 헬퍼(사이트 경로 → basePath 포함 href).
 * Chrome 설치 조건 필드: name·short_name·start_url·display·icons(192·512 PNG).
 */
export function webManifest(
  withBasePath: (path: string) => string,
): MetadataRoute.Manifest {
  const root = withBasePath("/");
  return {
    id: root,
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    lang: "ko",
    dir: "ltr",
    start_url: root,
    scope: root,
    display: "standalone",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    categories: ["news", "sports"],
    icons: PWA_ICONS.map(({ path, size, purpose }) => ({
      src: withBasePath(path),
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose,
    })),
  };
}

/**
 * 최근 3일 호 — 발행된 호(KST 발행일 오름차순·내림차순 무관) 가운데 **오늘(KST) 이전의 최신 호**를 끝으로 하는 `days`일 달력 구간에 든 호를
 * 최신순으로. 결호 날짜는 건너뛴다(구간을 늘리지 않는다 — 10-17·10-18·10-20이 최신이면 10-18·10-20 두 호). 오늘보다 뒤 날짜(잘못 들어간
 * 미래 파일)는 뺀다. 빌드 시각이 아니라 최신 호를 기준으로 삼아 발행이 며칠 멈춰도 마지막 3일치가 남는다.
 */
export function recentIssueDates(
  dates: readonly string[],
  todayKst: string,
  days: number = RECENT_NEWS_DAYS,
): string[] {
  const published = [...new Set(dates)].filter((d) => d <= todayKst).sort();
  const latest = published.at(-1);
  if (latest === undefined || days < 1) return [];
  const from = shiftDate(latest, -(days - 1));
  return published.filter((d) => d >= from).reverse();
}
