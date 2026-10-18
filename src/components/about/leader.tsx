import { cn } from "@/lib/utils";

/**
 * 리더 점선 (DESIGN §5.3 점선 dotted — 2px `--ink-3`, 목차·출처 목록·연결 줄) — 이름과 값 사이를 채운다. 장식이라 `aria-hidden`.
 * 목차 행(chip.tsx `ContentsRow`)과 같은 값: 남은 폭을 모두 차지하고 기준선 쪽으로 4px 내린다.
 */
export function Leader({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "min-w-4 flex-1 translate-y-1 self-center border-b-2 border-dotted border-ink-3",
        className,
      )}
    />
  );
}
