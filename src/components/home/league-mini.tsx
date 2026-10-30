import Link from "next/link";

import { TrendMark } from "@/components/competition/marks";
import { TeamBadge } from "@/components/team/team-badge";
import { FlatTab } from "@/components/ui/chip";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { ZoneBand } from "@/lib/competition-view";
import type { LeagueMiniPanelView } from "@/lib/home-widgets";
import { withBasePath } from "@/lib/paths";
import { cn } from "@/lib/utils";

import { WIDGET_LINK } from "./tonight";
import { LeagueMiniTabs } from "./league-mini-tabs";

/**
 * 홈 리그 순위 미니 (PRD §4.2 ⑧, DESIGN §9.3 "홈 리그 순위 미니" · §11.14 섬 ②, plan M2-15 — 확정 시안 `docs/design/d1/concept-mix.html` 화면 3)
 *
 * 얇은 섹션 머리 "리그 순위" + LEAGUE TABLE → 대회 탭 6개(3열 × 2줄 — §9.2 Tabs `grid` 모양) → 패널 = 상위 5위 목록 + 아래 줄("{M.DD} 기준 ·
 * 변동 전날 대비" + "전체 순위 ›"). 여섯 패널은 서버가 모두 그린다(정적 HTML) — 탭 섬(league-mini-tabs.tsx)은 선택 상태만 가진다.
 * - 행 = 대회 페이지 순위표의 그 팀 행 링크(`/competitions/{comp}/#{slug}` — `:target` 도착 강조, DECISIONS D1 §5 #9 — 보통 `<a>`:
 *   next/link 클라이언트 이동은 `:target`을 바꾸지 않는다). 격자 `30px · auto · 1fr ·
 *   auto · auto`(간격 8px, 최소 48px, 왼쪽 8px, 아래 1px `--rule`, 800 14.5px): 순위(Barlow 800 20px) · 배지 s · 팀명 · ▲▼ · 승점(Barlow 800 20px).
 *   hover = 팀명 밑줄 2px `--brand-accent`(3px 띄움 — 순위표 팀명과 같다). 구간 띠는 순위표와 같은 규칙(왼쪽 안쪽 4px).
 * - 접근성: 목록 `aria-label="{대회} 상위 5위"`, 순위 뒤 화면 밖 "위", 승점 뒤 화면 밖 "점", 배지 `aria-hidden`, ▲▼ 화면 밖 글자(TrendMark).
 * - JS가 없으면 `<noscript>` 스타일이 탭 목록을 숨기고 패널 6개를 모두 펼친다(패널마다 평탄 탭 + 대회명 머리가 나타난다 — 진보적 향상).
 * - 자료가 없는 대회(첫 수집 전·개막 전 빈 순위표)는 그 패널만 빈 상태 문구.
 */

/** 구간 띠(순위표 standings-table.tsx BAND와 같은 값 — DESIGN §9.3 구간 표시, 4px · 점선 = 5px 선 · 4px 틈) */
const BAND: Readonly<Record<ZoneBand, string>> = {
  rel: "shadow-[inset_4px_0_0_var(--brand-accent)]",
  relpo:
    "bg-[repeating-linear-gradient(to_bottom,var(--brand-accent)_0_5px,transparent_5px_9px)] bg-size-[4px_100%] bg-no-repeat",
  ko: "shadow-[inset_4px_0_0_var(--ink)]",
  po: "bg-[repeating-linear-gradient(to_bottom,var(--ink-2)_0_5px,transparent_5px_9px)] bg-size-[4px_100%] bg-no-repeat",
};

/** JS가 없으면 탭 목록을 숨기고 패널을 모두 펼친다(머리 주석) */
const NOSCRIPT_STYLE =
  "<style>[data-league-mini] [role=tabpanel][hidden]{display:block!important}[data-league-mini] [data-slot=league-mini-tabs]{display:none!important}[data-league-mini] [data-slot=league-mini-caption]{display:flex!important}</style>";

function MiniPanel({ panel }: { panel: LeagueMiniPanelView }) {
  return (
    <>
      {/* JS 없을 때만 보이는 패널 머리(탭 목록 대신) */}
      <p
        data-slot="league-mini-caption"
        className="mt-3 hidden items-center gap-2 text-[13px] font-extrabold"
      >
        <FlatTab comp={panel.comp} title={panel.name}>
          {panel.short}
        </FlatTab>
        {panel.name}
      </p>
      {panel.rows.length > 0 ? (
        <ol
          role="list"
          aria-label={`${panel.name} 상위 ${panel.rows.length}위`}
          className="mt-2.5 border-t border-rule"
        >
          {panel.rows.map((row) => (
            <li key={row.team.slug}>
              {/* 다른 페이지의 앵커 — next/link(클라이언트 이동, pushState)는 `:target`을 바꾸지 않아 순위표 행 도착 강조가 일어나지
                  않는다 → 보통 링크로 문서를 새로 연다(basePath는 paths.ts 헬퍼 — CLAUDE §7.1) */}
              <a
                href={withBasePath(row.href)}
                data-slot="league-mini-row"
                data-zone={row.band ?? undefined}
                className={cn(
                  "group/row grid min-h-12 grid-cols-[30px_auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-rule pl-2 text-[14.5px] font-extrabold",
                  row.band && BAND[row.band],
                )}
              >
                <span className="font-numeric text-[20px] leading-none font-extrabold tabular-nums">
                  {row.pos}
                  <span className="sr-only">위</span>
                </span>
                <TeamBadge team={row.team} size="s" />
                <span
                  lang={row.team.latin ? "en" : undefined}
                  className="min-w-0 decoration-brand-accent decoration-2 underline-offset-3 group-hover/row:underline"
                >
                  {row.team.name}
                </span>
                <TrendMark trend={row.trend} />
                <span className="font-numeric text-[20px] leading-none font-extrabold tabular-nums">
                  {row.pts}
                  <span className="sr-only">점</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p
          data-slot="league-mini-empty"
          className="mt-2.5 border-t border-rule pt-4 pb-1 text-[13.5px] text-ink-2"
        >
          아직 이 대회 순위 자료가 없어요.
        </p>
      )}
      <p className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
        {panel.note ? (
          <span
            data-slot="league-mini-note"
            className="text-[12.5px] leading-normal text-ink-2 tabular-nums"
          >
            {panel.note}
          </span>
        ) : (
          <span />
        )}
        <Link href={panel.href} className={WIDGET_LINK}>
          전체 순위
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </>
  );
}

export function LeagueMini({
  panels,
  headingId,
  className,
}: {
  panels: readonly LeagueMiniPanelView[];
  headingId: string;
  className?: string;
}) {
  if (panels.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-slot="league-mini"
      data-league-mini=""
      className={className}
    >
      <SectionHead
        heading="리그 순위"
        headingId={headingId}
        runningHead="LEAGUE TABLE"
        thin
      />
      <LeagueMiniTabs
        label="대회 선택"
        panels={panels.map((panel) => ({
          value: panel.comp,
          label: panel.short,
          content: <MiniPanel panel={panel} />,
        }))}
      />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLE }} />
    </section>
  );
}
