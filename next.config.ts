import type { NextConfig } from "next";

// GitHub Pages 프로젝트 사이트 경로(https://sguys99.github.io/euro-digest).
// 환경변수 BASE_PATH로 바꿀 수 있고, 빈 값("")이면 루트(/)로 빌드한다.
const basePath = process.env.BASE_PATH ?? "/euro-digest";

// 정적 export 전용 설정 (CLAUDE.md §1-10, §7.1).
// API Route·ISR·middleware·next/image 최적화 등 서버 런타임 기능은 쓰지 않는다.
const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // `next dev`가 AGENTS.md를 자동 생성·수정하지 않게 한다. 작업 규칙은 CLAUDE.md가 단일 출처.
  agentRules: false,
};

export default nextConfig;
