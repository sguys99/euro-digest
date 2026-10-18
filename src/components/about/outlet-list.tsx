import { langLabel, type Outlet } from "@/lib/about";

import { Leader } from "./leader";
import { TierBadge } from "./tier-badge";

/**
 * 지금 싣는 매체 목록 (M1-36 `/about#sources` — PRD FR-140 "출처", DESIGN §9.3 출처 스택 "매체 이름은 텍스트만 — 로고 금지")
 *
 * 한 줄 = 매체명(800 `--ink`, 그 매체 언어의 `lang`) + 리더 점선 + 출처 Tier 배지, 아래 보조 줄(13px `--ink-2`: 언어 · 피드 이름).
 * 목차 행·펼친 출처 목록과 같은 리더 점선 행이다. 매체명·피드 이름은 `configs/sources.json` 이름 그대로(번역하지 않는다).
 */
export function OutletList({
  outlets,
  showLang,
}: {
  outlets: readonly Outlet[];
  /** 보조 줄에 언어 이름을 쓸지(해외 매체 — 국내는 모두 한국어라 뺀다) */
  showLang: boolean;
}) {
  return (
    <ul role="list" className="border-t border-rule">
      {outlets.map((outlet) => {
        const sub = [
          ...(showLang ? [langLabel(outlet.lang)] : []),
          ...outlet.feeds,
        ];
        return (
          <li key={outlet.name} className="border-b border-rule py-2.5">
            <p className="flex min-h-6 items-center gap-2">
              <span lang={outlet.lang} className="min-w-0 font-extrabold">
                {outlet.name}
              </span>
              <Leader />
              <span className="flex flex-none gap-1">
                {outlet.tiers.map((tier) => (
                  <TierBadge key={tier} tier={tier} />
                ))}
              </span>
            </p>
            {sub.length > 0 ? (
              <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-2">
                {sub.map((part, index) => (
                  <span key={part}>
                    {index > 0 ? " · " : null}
                    {/* 언어 이름은 한국어, 피드 이름은 그 매체 언어(WCAG 3.1.2) */}
                    <span
                      lang={showLang && index === 0 ? undefined : outlet.lang}
                    >
                      {part}
                    </span>
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
