import Link from "next/link";
import type { ReactNode } from "react";

import { FlatTab } from "@/components/ui/chip";
import { COMPETITION_CURRENT_LINK } from "@/components/ui/competition";
import { RunningHead, SectionHead } from "@/components/ui/section-head";
import {
  zoneBandOf,
  zoneRangeText,
  type ZoneBand,
} from "@/lib/competition-view";
import { routes } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import type { CompetitionConfig, ZoneRule } from "@/lib/schema/configs";
import { cn } from "@/lib/utils";

import { FormChip } from "./marks";

/**
 * 대회 화면 틀 조각 — 머리 · 대회 이동 · 목차 · 표 범례 · 데이터 출처 줄 (DESIGN §9.3 "대회 화면 틀"·"순위표" 범례, FR-45, plan M2-10)
 * 서버 컴포넌트. 대회 이동은 페이지 이동이라 링크(`next/link` + `aria-current="page"`)다 — ARIA 탭이 아니다(DESIGN §9.2).
 */

/** 머리 — 평탄 탭 + "{시즌} 시즌" + 러닝 헤드 → h1 정식 대회명 → 부제 */
export function CompetitionHead({
  config,
  season,
  headingId,
  status,
}: {
  config: Pick<CompetitionConfig, "id" | "nameKo" | "shortKo">;
  /** "2026-27 시즌"(src/lib/rest-period.ts `seasonLabel`) */
  season: string;
  headingId: string;
  /** 부제 — 라운드 상태 · 갱신 시각(없으면 부제 없음) */
  status: ReactNode;
}) {
  return (
    <header className="grid gap-1.5 pt-1.5">
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <FlatTab comp={config.id} title={config.nameKo}>
          {config.shortKo}
        </FlatTab>
        <span>{season}</span>
        <RunningHead className="ml-auto">LEAGUE TABLE</RunningHead>
      </p>
      <h1
        id={headingId}
        className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
      >
        {config.nameKo}
      </h1>
      {status ? <p className="text-[13px] text-ink-2">{status}</p> : null}
    </header>
  );
}

/** 1023 이하 대회 이동 — 6칸 한 줄(§9.2 대회 탭 모양, 링크 + `aria-current`) */
export function CompetitionSwitch({
  current,
  all,
}: {
  current: CompId;
  all: readonly Pick<CompetitionConfig, "id" | "shortKo" | "nameKo">[];
}) {
  return (
    <nav
      aria-label="대회 이동"
      className="mt-4 grid grid-cols-[repeat(6,minmax(0,1fr))] gap-1 lg:hidden"
    >
      {all.map((c) => (
        <Link
          key={c.id}
          href={routes.competition(c.id)}
          aria-current={c.id === current ? "page" : undefined}
          title={c.nameKo}
          className={cn(
            "relative inline-flex min-h-11 min-w-0 items-center justify-center border border-ink-2 bg-transparent px-0.5 text-[12.5px] font-extrabold tracking-[-0.02em] text-ink no-underline",
            "transition-colors duration-base ease-print hover:border-ink hover:bg-paper-2",
            "aria-[current=page]:[--ring:var(--ink)]",
            COMPETITION_CURRENT_LINK[c.id],
          )}
        >
          {c.shortKo}
        </Link>
      ))}
    </nav>
  );
}

/** 1024 이상 목차 — 섹션 머리 "대회" + 대회 목차 행(평탄 탭 42px + 정식명, 현재 대회 800 + " ✓") */
export function CompetitionContents({
  current,
  all,
}: {
  current: CompId;
  all: readonly Pick<CompetitionConfig, "id" | "shortKo" | "nameKo">[];
}) {
  return (
    <>
      <SectionHead heading="대회" headingAs="p" runningHead="COMPETITIONS" />
      <ul role="list" className="mt-2">
        {all.map((c) => {
          const here = c.id === current;
          return (
            <li key={c.id}>
              <Link
                href={routes.competition(c.id)}
                aria-current={here ? "page" : undefined}
                className="group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink no-underline aria-[current=page]:font-extrabold"
              >
                <FlatTab
                  comp={c.id}
                  size="contents"
                  title={c.nameKo}
                  aria-hidden="true"
                >
                  {c.shortKo}
                </FlatTab>
                <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                  {c.nameKo}
                  {here ? (
                    <span
                      aria-hidden="true"
                      className="whitespace-pre text-brand-accent-text"
                    >
                      {" ✓"}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 범례의 구간 띠 견본(4×18px) */
const SWATCH: Readonly<Record<ZoneBand, string>> = {
  rel: "bg-brand-accent",
  relpo:
    "bg-[repeating-linear-gradient(to_bottom,var(--brand-accent)_0_5px,transparent_5px_9px)]",
  ko: "bg-ink",
  po: "bg-[repeating-linear-gradient(to_bottom,var(--ink-2)_0_5px,transparent_5px_9px)]",
};

const TREND_TRIANGLE =
  "inline-block h-1.75 w-2 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]";

/** 표 아래 범례 — 구간(실값만) · ▲▼ 변동 기준 · W/D/L + 자료 없음 */
export function StandingsLegend({
  zones,
  trendText,
}: {
  zones: readonly ZoneRule[];
  /** "전날 대비" · "전날 자료 없음" */
  trendText: string;
}) {
  const item = "inline-flex flex-wrap items-center gap-1.5";
  return (
    <div
      role="group"
      aria-label="표 읽는 법"
      className="mt-3.5 flex flex-wrap gap-x-4.5 gap-y-2 text-[12.5px] leading-[1.4] text-ink-2"
    >
      {zones.map((rule) => (
        <span key={`${rule.from}-${rule.to}`} className={item}>
          <i
            aria-hidden="true"
            className={cn("inline-block h-4.5 w-1", SWATCH[zoneBandOf(rule)])}
          />
          <b className="font-extrabold text-ink">{rule.label}</b>
          {zoneRangeText(rule)}
        </span>
      ))}
      <span className={item}>
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <i className={cn(TREND_TRIANGLE, "text-trend-up")} />
          <i className={cn(TREND_TRIANGLE, "rotate-180 text-trend-down")} />
        </span>
        <b className="font-extrabold text-ink">변동</b>
        {trendText}
      </span>
      <span className={item}>
        <span aria-hidden="true" className="inline-flex gap-0.75">
          <FormChip result="W" />
          <FormChip result="D" />
          <FormChip result="L" />
        </span>
        <b className="font-extrabold text-ink">승·무·패</b>
        <FormChip result={null} />
        자료 없음
      </span>
    </div>
  );
}
