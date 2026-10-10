/**
 * zod 스키마 v0.1 진입점 — `@/lib/schema`로 import한다(src·scripts·tests 공용, CLAUDE.md §5).
 *
 * v0.1 — plan.md 부록 A 기준. 초기 확정분 + 2026-10-10 사용자 확인분(configs 7종·names.ko·대회 파일·
 * 한국 선수 현황·캐시 2종)과 결정 10건(httpUrl·UCL 구간·takedowns handledAt null·configs strict 등)을 반영.
 *
 * 번들 주의: 서버 컴포넌트·빌드 스크립트에서만 import한다. `"use client"` 파일에서 import하면
 * zod가 브라우저 번들에 포함된다(초기 JS 예산 DR-11). 클라이언트에는 `import type`만 쓴다.
 */
export * from "./cache";
export * from "./common";
export * from "./competition";
export * from "./configs";
export * from "./names";
export * from "./news";
export * from "./player";
export * from "./registry";
export * from "./run";
export * from "./source";
export * from "./takedown";
export * from "./team";
export * from "./transfer";
