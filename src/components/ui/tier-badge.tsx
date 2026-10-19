import { cx } from "@/lib/cx";
import type { Tier } from "@/lib/schema/common";

/**
 * 출처 Tier 배지 (DESIGN.md §9.3 Tier 배지 · §2.8, M1-31·M1-36) — 높이 20px, 좌우 6px, "Tier n" Barlow 600 13.5px 0.04em.
 * 1 = `--tier-1` 채운 면 + `--paper` 글자 · 2 = 2px `--tier-2` 실선 + `--ink` · 3 = 1px `--tier-3` 점선 + `--ink-2`.
 * 등급은 색이 아니라 "Tier n" 글자와 채움·실선·점선 모양으로 구분한다. 화면 밖 텍스트 "출처 "를 앞에 둔다.
 *
 * 뉴스 카드 이적 단계 줄(src/components/news/feed-card.tsx `TransferStage`)과 `/about` 출처 목록·Tier 표가 같이 쓴다.
 * "Tier"와 숫자 사이에서 줄이 갈리지 않고(`whitespace-nowrap`) 줄어들지 않는다(`flex-none`) — 리더 점선·이적 단계 줄 끝에 붙는다.
 * 서버 컴포넌트(상태 없음)지만 기초 컴포넌트라 `cx`(병합 없음)로 합친다 — 바깥 `className`은 여백·배치만 준다.
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
      className={cx(
        "inline-flex h-5 flex-none items-center px-1.5 font-numeric text-[13.5px] leading-none font-semibold tracking-[0.04em] whitespace-nowrap tabular-nums",
        TIER_CLASS[tier],
        className,
      )}
    >
      <span className="sr-only">출처 </span>Tier {tier}
    </span>
  );
}
