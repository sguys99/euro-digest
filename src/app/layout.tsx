import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";

import { fontFaceCss, fontPreloadHrefs } from "@/lib/fonts";
import { withBasePath } from "@/lib/paths";
import { siteMetadata } from "@/lib/seo";
import { THEME_COLOR_METAS, THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

// 기본 SEO(M1-38, FR-124) — metadataBase(SITE_URL + basePath), 제목 템플릿("뉴스 · 유로 다이제스트" — 홈은 서비스 이름 그대로),
// 기본 설명, OG·twitter 기본값. canonical·og:url은 페이지마다(`pageMetadata`) — 규칙은 src/lib/seo.ts 머리 주석.
export const metadata: Metadata = siteMetadata();

// 라이트·다크 둘 다 지원한다고 CSS보다 먼저 알린다(<meta name="color-scheme">).
// theme-color(브라우저 UI 색 = 지면 --paper, DESIGN §2.1·§8)는 viewport.themeColor로 내보내지 않고 아래 <head>에 직접 렌더한다.
// Next는 viewport 메타를 페이지 이동(next/link 클라이언트 이동)마다 새 노드로 바꿔 넣어서, 초기 스크립트·테마 토글이 고친
// media가 시스템 기준으로 돌아갔다(D0-12 리뷰). 루트 레이아웃의 메타는 이동 때 다시 마운트되지 않는다.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

// 웹폰트(DR-03, DESIGN §3.1·§11.3) — 빌드 때 한 번 만든다. 경로는 모두 withBasePath(basePath 포함, src/lib/fonts.ts 설명 참고).
const FONT_FACE_CSS = fontFaceCss(withBasePath);
const FONT_PRELOAD_HREFS = fontPreloadHrefs(withBasePath);

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // `preload: true`인 웹폰트만 미리 받는다 — 지금은 없음(2026-10-24 사용자 결정, DESIGN §11.3: preload한 폰트가 첫 페인트 전에 오면 모바일 4G LCP가 늦어짐).
  // 다시 켜면 React가 <head> 앞쪽에 <link rel="preload" as="font">를 한 번만 넣는다(JSX <link>로 쓰면 끌어올린 것과 제자리 것이 두 번 나온다).
  // 폰트는 CORS 모드로 요청되므로 crossOrigin이 없으면 preload를 버리고 다시 받는다.
  for (const href of FONT_PRELOAD_HREFS) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    // 초기 스크립트가 하이드레이션 전에 data-theme·data-spoiler를 단다 → 속성 불일치 경고를 끈다(이 요소만, DESIGN §8).
    // scroll-padding-bottom: 1023 이하에서 키보드 포커스·앵커로 스크롤할 때 하단 탭(58px + 위 괘선, sticky)에 가리지 않게(WCAG 2.4.11)
    <html
      lang="ko"
      suppressHydrationWarning
      className="scroll-pb-16 lg:scroll-pb-0"
    >
      <head>
        {/*
         * theme-color 2개(시스템 기준 미디어 쿼리 — 값·미디어 문자열은 theme.ts가 단일 출처). React 19는 <meta>를 끌어올려
         * <head> 자식(아래 스크립트)보다 앞에 내보내므로 초기 스크립트가 실행될 때 이미 있다. 사용자가 테마를 저장했으면
         * 초기 스크립트(재방문 첫 페인트)와 테마 토글이 media를 고친다. React는 하이드레이션 때 이 메타를 content·name으로
         * 찾아 그대로 가져가고 media는 대조하지 않으며, 이후 props가 같아 다시 쓰지 않는다 — 고친 media가 유지된다(DESIGN §8).
         */}
        {THEME_COLOR_METAS.map(({ theme, media, content }) => (
          <meta
            key={theme}
            name="theme-color"
            media={media}
            content={content}
          />
        ))}
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
      <body>
        {/*
         * 건너뛰기 링크(DESIGN §10) — <body> 첫 요소. 평소 화면 밖(top −80px), 포커스하면 왼쪽 위 8px에 잉크 면 + 지면 글자.
         * 그 자리는 티켓(라이트 = 잉크와 같은 네이비, 다크 = 벽돌 레드) 위라서 둘레에 7px 지면 테두리(번짐 없는 펼침 그림자 —
         * 2px 띄움 + 3px 링 + 2px)를 둘러 상자와 포커스 링이 늘 지면 위에 놓이게 한다(링 = --ring, 비텍스트 3:1 이상 — M1-30 리뷰).
         * 대상 #main은 앱 셸(src/components/shell/app-shell.tsx)의 <main id="main" tabindex="-1">.
         */}
        <a
          href="#main"
          className="absolute -top-20 left-2 z-30 bg-ink px-4 py-3 font-extrabold text-paper no-underline shadow-[0_0_0_7px_var(--paper)] focus:top-2"
        >
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
