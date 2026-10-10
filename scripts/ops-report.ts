/**
 * 운영 리포트 진입점 — 월요일 weekly에서 호출, 비용·성공률·소스 건강도·미등록 고유명사를 이슈로 (FR-155).
 */
import { todo } from "./lib/todo";

todo(
  "npm run ops-report",
  "M5-09",
  "runs.json·runs-dev.json 합산 비용, 발행 성공률, 소스 건강도, unknown-names 집계 → GitHub 이슈",
);
