/**
 * `npm run build` 후반 단계 — next build(정적 export)로 out/이 생긴 뒤 실행 (CLAUDE.md §5).
 * 순서: Pagefind 인덱싱 → OG 이미지 → RSS → ics. Pagefind는 아직 설치하지 않았다.
 */
import { todo } from "./lib/todo";

todo(
  "build-feeds (npm run build)",
  "M4-11(RSS)·M4-12(ics)·M4-14(Pagefind)·M5-01(OG 이미지)",
  "out/에 Pagefind 인덱스·OG 이미지·rss.xml·.ics 생성",
);
