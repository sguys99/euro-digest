/**
 * 폼 결과 글자(W/D/L) ↔ 화면 밖 낱말 — 의존 없는 작은 모듈(M4-16 번들 절감).
 *
 * 클라이언트 섬(`/my` 결과 칸 등)이 `FORM_WORD` 하나 때문에 src/lib/competition-view.ts 전체(+ time.ts · standing-zone)를
 * 브라우저 번들로 끌어오지 않게 따로 둔다. competition-view.ts가 다시 내보내므로 기존 import는 그대로 쓴다.
 */

export type FormResult = "W" | "D" | "L";

export const FORM_WORD: Readonly<Record<FormResult, string>> = {
  W: "승",
  D: "무",
  L: "패",
};
