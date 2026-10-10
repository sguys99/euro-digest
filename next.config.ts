import type { NextConfig } from "next";

import { siteLocationFromBuildEnv } from "./src/lib/paths";

// 사이트 위치 — 정규화 규칙·기본값의 단일 출처는 src/lib/paths.ts (M0-19).
// - BASE_PATH: GitHub Pages 프로젝트 사이트 경로(기본 /euro-digest). 빈 값("")이면 루트(/)로 빌드한다.
// - SITE_URL: 사이트 출처(기본 https://sguys99.github.io). RSS·OG·canonical 절대 URL에 쓴다.
// 형식이 틀리면 여기서 빌드가 멈춘다.
const { basePath, siteUrl } = siteLocationFromBuildEnv(process.env);

// 정적 export 전용 설정 (CLAUDE.md §1-10, §7.1).
// API Route·ISR·middleware·next/image 최적화 등 서버 런타임 기능은 쓰지 않는다.
const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // 같은 값을 서버·브라우저 번들에 빌드 시 인라인한다 → src/lib/paths.ts가 읽는다.
  // 직접 지정하지 않는다(BASE_PATH·SITE_URL과 다르면 siteLocationFromBuildEnv가 오류).
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
  // `next dev`가 AGENTS.md를 자동 생성·수정하지 않게 한다. 작업 규칙은 CLAUDE.md가 단일 출처.
  agentRules: false,
};

export default nextConfig;
