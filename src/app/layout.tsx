import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";

import { fontFaceCss, fontPreloadHrefs } from "@/lib/fonts";
import { withBasePath } from "@/lib/paths";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_TAGLINE,
};

// 라이트·다크 둘 다 지원한다고 CSS보다 먼저 알린다(<meta name="color-scheme">). 브라우저 UI 색은 지면(--paper) — DESIGN §2.1·§8.
// theme-color는 시스템 설정 기준이다. 사용자가 시스템과 다른 테마를 고른 경우의 보정은 테마 토글(D0-12)에서 한다.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

// 웹폰트(DR-03, DESIGN §3.1·§11.3) — 빌드 때 한 번 만든다. 경로는 모두 withBasePath(basePath 포함, src/lib/fonts.ts 설명 참고).
const FONT_FACE_CSS = fontFaceCss(withBasePath);
const FONT_PRELOAD_HREFS = fontPreloadHrefs(withBasePath);

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // 첫 화면 웹폰트 2개만 미리 받는다(한글 400 · Barlow 800 — DESIGN §11.3). React가 <head> 앞쪽에
  // <link rel="preload" as="font">를 한 번만 넣는다(JSX <link>로 쓰면 끌어올린 것과 제자리 것이 두 번 나온다).
  // 폰트는 CORS 모드로 요청되므로 crossOrigin이 없으면 preload를 버리고 다시 받는다.
  for (const href of FONT_PRELOAD_HREFS) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    // 초기 스크립트가 하이드레이션 전에 data-theme·data-spoiler를 단다 → 속성 불일치 경고를 끈다(이 요소만, DESIGN §8).
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
         * 깜빡임 없는 초기 테마·결과 가리기 스크립트(DR-02, DESIGN §8). 첫 페인트 전에 동기 실행해야 해서
         * next/script(비동기 주입)가 아니라 인라인 <script>로 둔다. 내용은 저장소 안 상수(src/lib/theme.ts)뿐이고
         * 외부 입력이 섞이지 않으므로 dangerouslySetInnerHTML을 쓴다. 정적 export에서 그대로 HTML에 들어간다.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
         * @font-face(웹폰트 4면 swap + 메트릭 맞춘 폴백 14면). globals.css의 url()에는 basePath가 붙지 않아서
         * 인라인으로 둔다. 내용은 저장소 안 상수에서 만든 문자열뿐이다(src/lib/fonts.ts가 따옴표·꺾쇠를 막는다).
         */}
        <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
