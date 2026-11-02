import type { FormResult } from "@/lib/competition-view";
import { cx } from "@/lib/cx";

/**
 * 폼 칩 한 칸 — 글자 + 1.5px 현재 글자색 테두리. `result` null = 자료 없음(가운데 8×2 짧은 선). 모양은 globals.css §10 `form-chip`
 * (순위표 20행 × 5칸이 두 번 — 표·펼침 — 반복돼 짧은 유틸리티로 묶었다).
 *
 * 순위표 표식 모듈(marks.tsx)에서 떼어 냈다(M4-08) — 클래스 병합(`cn` = tailwind-merge)이 필요 없는 칸이라 `cx`로 이어 붙이고, `/my` 최근 결과처럼
 * 클라이언트 섬이 그리는 결과 칸(ResultCell)이 tailwind-merge를 번들에 끌어오지 않게 한다. marks.tsx가 같은 함수를 다시 내보낸다(동작 불변).
 */
const CHIP_COLOR: Readonly<Record<FormResult, string>> = {
  W: "text-result-win",
  D: "text-result-draw",
  L: "text-result-loss",
};

export function FormChip({
  result,
  className,
}: {
  result: FormResult | null;
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={cx(
        "form-chip",
        result === null ? "form-chip-none" : CHIP_COLOR[result],
        className,
      )}
    >
      {result}
    </i>
  );
}
