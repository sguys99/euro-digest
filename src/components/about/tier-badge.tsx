import type { Tier } from "@/lib/schema/common";
import { cn } from "@/lib/utils";

/**
 * 출처 Tier 배지 (DESIGN.md §9.3 Tier 배지 · §2.8) — 높이 20px, 좌우 6px, "Tier n" Barlow 600 13.5px 0.04em.
 * 1 = `--tier-1` 채운 면 + `--paper` 글자 · 2 = 2px `--tier-2` 실선 + `--ink` · 3 = 1px `--tier-3` 점선 + `--ink-2`.
 * 등급은 색이 아니라 "Tier n" 글자와 채움·실선·점선 모양으로 구분한다. 화면 밖 텍스트 "출처 "를 앞에 둔다.
 *
 * `/about` 출처 목록·Tier 표(M1-36)가 쓴다. 뉴스 카드 이적 단계 줄(M1-31)도 같은 규격의 배지를 쓰므로 둘이 합쳐지면 한 컴포넌트로 모은다.
 */

const TIER_CLASS: Readonly<Record<Tier, string>> = {
  1: "bg-tier-1 text-paper",
  2: "border-2 border-tier-2 text-ink",
  3: "border border-dashed border-tier-3 text-ink-2",
};

export function TierBadge({
  tier,
  className,
}: {
  tier: Tier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center px-1.5 font-numeric text-[13.5px] leading-none font-semibold tracking-[0.04em] whitespace-nowrap tabular-nums",
        TIER_CLASS[tier],
        className,
      )}
    >
      <span className="sr-only">출처 </span>Tier {tier}
    </span>
  );
}
