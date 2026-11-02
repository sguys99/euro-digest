import Link from "next/link";

import { WIDGET_LINK } from "@/components/home/tonight";
import { KoreanArmband, TransferStage } from "@/components/news/feed-card";
import { TeamBadge } from "@/components/team/team-badge";
import { CardTitle } from "@/components/ui/card";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import { TierBadge } from "@/components/ui/tier-badge";
import { routes } from "@/lib/paths";
import { formatKst } from "@/lib/time";
import type { TransferWindowLineView } from "@/lib/transfer-window-view";
import { timelineAnchor, type HotTransferView } from "@/lib/transfers-view";

import { RouteArrow } from "./transfer-marks";

/**
 * 홈 '이적 핫 리스트' (PRD §4.2 7 · FR-104 · FR-105, DESIGN §9.3 D2 "홈 위젯 (D2)", DECISIONS D2 §6 #4, plan M4-04) — 서버 컴포넌트(JS 0).
 * D1 오늘 밤 · 순위 미니와 같은 얇은 섹션 머리 + 부제 → 행(`1fr · auto`, 위아래 11px, 아래 1px `--rule`) = 단계 펀치 + 글자 / Tier + 갱신 날짜
 * (Barlow 600 13px) → 이름 14.5px 800 + 완장 + 화살표 + 행선지(배지 xs + 이름) = 이적 타임라인의 최근 기사로 가는 링크(`/transfers/#xt-{카드 ID}`,
 * 누름 영역 44px). 사전에 이름이 없는 선수는 그 원제목(원문 링크 — 혼합안 그대로). 아래 "이적 n건 ›". 순위 규칙은 src/lib/transfers-view.ts
 * `hotTransfers`, 실을 이적이 없으면 페이지가 섹션을 그리지 않는다. 이적 창 모드(FR-105)면 부제 앞에 창 상태를 붙인다(위치는 페이지가 옮긴다).
 */
export function TransferHotList({
  items,
  total,
  windowLine = null,
  target = routes.transfers(),
  headingId,
  className,
}: {
  items: readonly HotTransferView[];
  /** 원장 전체 건수(아래 링크) */
  total: number;
  /** 이적 창 모드일 때 머리 줄 모델(부제 앞 상태) — 평소 null */
  windowLine?: TransferWindowLineView | null;
  /** 도착 페이지(기본 `/transfers/` — 견본은 견본 페이지) */
  target?: string;
  headingId: string;
  className?: string;
}) {
  const mode =
    windowLine?.mode === "open"
      ? windowLine.daysLeft === 0
        ? "이적 창 오늘 마감 · "
        : `이적 창 열림 · 마감 D-${windowLine.daysLeft} · `
      : windowLine?.mode === "grace"
        ? "이적 창 마감 직후 · "
        : "";
  return (
    <section
      aria-labelledby={headingId}
      data-slot="transfer-hot"
      className={className}
    >
      <SectionHead
        heading="이적 핫 리스트"
        headingId={headingId}
        runningHead="TRANSFERS"
        thin
      />
      <p className="mt-0.75 text-[13px] text-ink-2 tabular-nums">
        {mode}최근 갱신 순 · {items.length}건
      </p>
      <ol aria-label="이적 핫 리스트" className="mt-2 border-t border-rule">
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="transfer-hot-row"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-b border-rule py-2.75"
          >
            <TransferStage status={item.status} tier={null} className="mt-0" />
            <p className="flex items-center gap-2">
              <TierBadge tier={item.bestTier} />
              <time
                dateTime={item.updated}
                className="font-numeric text-[13px] leading-none font-semibold text-ink-2 tabular-nums"
              >
                {formatKst(item.updated, "monthDay")}
              </time>
            </p>
            {item.player.name !== null ? (
              <p className="col-span-2 text-[14.5px] leading-[1.3] font-extrabold">
                <Link
                  href={`${target}#${timelineAnchor(item.lead.id)}`}
                  className="group/hl relative inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-ink no-underline after:absolute after:inset-x-[-4px] after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
                >
                  <span className="decoration-brand-accent decoration-2 underline-offset-3 group-hover/hl:underline">
                    {item.player.name}
                  </span>
                  {item.player.korean ? (
                    <KoreanArmband title="한국 선수" />
                  ) : null}
                  <RouteArrow size={18} />
                  {item.to ? (
                    <>
                      <span className="sr-only">행선지 </span>
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge team={item.to} size="xs" />
                        <span
                          lang={item.to.latin ? "en" : undefined}
                          className="whitespace-nowrap"
                        >
                          {item.to.name}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-[13px] text-ink-2">행선지 미정</span>
                  )}
                  <span className="sr-only">
                    {" "}
                    — 이적 타임라인의 최근 기사로
                  </span>
                </Link>
              </p>
            ) : (
              <CardTitle
                id={`${headingId}-${item.lead.id}-t`}
                as="h3"
                href={item.lead.url}
                lang={item.lead.lang}
                source={item.lead.source}
                linkProps={{ className: "py-3.5" }}
                className={
                  item.lead.lang === "ko"
                    ? "col-span-2 mt-0 text-[13.5px]"
                    : "col-span-2 mt-0 text-[16px] leading-[1.16]"
                }
              >
                {item.lead.title}
              </CardTitle>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-1 flex justify-end">
        <Link href={target} className={WIDGET_LINK}>
          이적 {total}건
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </section>
  );
}
