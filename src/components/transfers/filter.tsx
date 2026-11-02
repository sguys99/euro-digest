import type { ReactNode } from "react";

import { TeamBadge } from "@/components/team/team-badge";
import { ContentsRow, FilterChip, FlatTab } from "@/components/ui/chip";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { CompLabel } from "@/lib/home-widgets";
import { cx } from "@/lib/cx";
import { TRANSFER_STAGE } from "@/lib/news/labels";
import type { CompId } from "@/lib/schema/common";
import {
  TRANSFER_KR_VALUE,
  type TransferFilterAxis,
} from "@/lib/transfer-filter";
import { XF } from "@/lib/transfer-filter-dom";
import type { TransfersView } from "@/lib/transfers-view";

import { MiniPunch } from "./transfer-marks";

/**
 * 이적 필터 (PRD FR-104, DESIGN §9.3 D2 "이적 필터", DECISIONS D2 §4 A, plan M4-04) — 서버 컴포넌트(JS 0). 처음 상태(필터 없음)의 정적
 * HTML을 그리고, 상태는 섬 · 부트 스크립트가 속성만 바꾼다(src/lib/transfer-filter-dom.ts DOM 약속 — 바뀌는 요소에 `suppressHydrationWarning`).
 *
 * | 조각 | 자리 | 내용 |
 * |------|------|------|
 * | `TransferFilterContents` | 앱 셸 목차 열(1024 이상, sticky) | "필터"·FILTER → '한국 선수' 칩 → 단계 · 리그 · 팀 · 출처 Tier 체크 목록(14px 체크 칸 + 표식 + 이름 + 리더 + 건수) → 결과 수 줄 |
 * | `TransferFilterBar` | 지면 머리 아래(1023 이하) | '한국 선수' 칩 + 접힘 칩 "리그 · 팀 · 단계 · Tier n" → 펼친 칩 묶음(위 1px `--rule`) → 결과 수 줄 |
 *
 * 축 안 OR · 축 사이 AND(src/lib/transfer-filter.ts). 0건 항목은 숨기지 않고 비활성(점선 · `--ink-disabled` — Tier 1은 결과 0이 기본),
 * 눌린 채 주소로 들어오면 끌 수 있게 부트 스크립트가 활성으로 바꾼다. 결과 수는 `aria-live="polite"`(두 벌 중 보이는 쪽만 읽힌다).
 */

type Option = { value: string; count: number; lead?: ReactNode; label: string };

interface FilterGroups {
  axis: Exclude<TransferFilterAxis, "kr">;
  title: string;
  options: Option[];
  note?: string;
}

function groupsOf(
  view: TransfersView,
  comps: ReadonlyMap<CompId, CompLabel>,
): FilterGroups[] {
  const { options } = view;
  return [
    {
      axis: "status",
      title: "단계",
      options: options.status.map((o) => ({
        value: o.value,
        count: o.count,
        label: TRANSFER_STAGE[o.status].label,
        lead: <MiniPunch status={o.status} />,
      })),
    },
    {
      axis: "league",
      title: "리그",
      options: options.league.map((o) => {
        const label = comps.get(o.comp);
        return {
          value: o.value,
          count: o.count,
          label: label?.name ?? o.comp,
          lead: (
            <FlatTab
              comp={o.comp}
              size="contents"
              title={label?.name}
              aria-hidden="true"
            >
              {label?.short ?? o.comp}
            </FlatTab>
          ),
        };
      }),
    },
    ...(options.team.length > 0
      ? [
          {
            axis: "team" as const,
            title: "팀",
            options: options.team.map((o) => ({
              value: o.value,
              count: o.count,
              label: o.team.name,
              lead: <TeamBadge team={o.team} size="xs" />,
            })),
          },
        ]
      : []),
    {
      axis: "tier",
      title: "출처 Tier",
      note:
        options.tier[0]!.count === 0
          ? "Tier 1 출처의 이적 기사는 아직 없어요"
          : undefined,
      options: options.tier.map((o) => ({
        value: o.value,
        count: o.count,
        label: `Tier ${o.tier}`,
      })),
    },
  ];
}

/** 버튼 공통 속성 — 축 · 값, 0건이면 `data-xf-zero` + 처음 `disabled` */
function control(axis: TransferFilterAxis, value: string, count: number) {
  return {
    [XF.axis]: axis,
    [XF.value]: value,
    ...(count === 0 ? { [XF.zero]: "", disabled: true } : {}),
    suppressHydrationWarning: true,
  };
}

/** '한국 선수' 칩(두 벌 공통) */
function KoreanChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <FilterChip
      {...control("kr", TRANSFER_KR_VALUE, count)}
      tone="korean"
      pressed={false}
      label="한국 선수"
      count={count}
      className={className}
    />
  );
}

/** 결과 수 줄 — "n건 중 m건" + 필터 해제(필터가 있을 때만) */
export function TransferFilterSummary({
  total,
  className,
}: {
  total: number;
  className?: string;
}) {
  return (
    <p
      aria-live="polite"
      className={cx(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-2",
        className,
      )}
    >
      <span>
        <b className="font-numeric text-[15px] leading-none font-extrabold text-ink tabular-nums">
          {total}
        </b>
        건 중{" "}
        <b
          {...{ [XF.shown]: "" }}
          suppressHydrationWarning
          className="font-numeric text-[15px] leading-none font-extrabold text-ink tabular-nums"
        >
          {total}
        </b>
        건
      </span>
      <button
        type="button"
        {...{ [XF.reset]: "sum" }}
        hidden
        suppressHydrationWarning
        className="inline-flex min-h-11 min-w-11 items-center bg-transparent text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
      >
        필터 해제
      </button>
    </p>
  );
}

/** 1024 이상 목차 열 — 체크 목록 */
export function TransferFilterContents({
  view,
  comps,
}: {
  view: TransfersView;
  comps: ReadonlyMap<CompId, CompLabel>;
}) {
  return (
    <div data-slot="transfer-filter-contents">
      <SectionHead heading="필터" headingAs="p" runningHead="FILTER" />
      <KoreanChip count={view.options.kr} className="mt-2.5" />
      {groupsOf(view, comps).map((group) => (
        <div
          key={group.axis}
          role="group"
          aria-labelledby={`xfc-${group.axis}`}
          className="pt-3"
        >
          <p
            id={`xfc-${group.axis}`}
            className="border-b border-ink pb-1.5 text-xs font-extrabold text-ink-2"
          >
            {group.title}
          </p>
          {group.note ? (
            <p className="mt-1 text-xs leading-[1.45] text-ink-2">
              {group.note}
            </p>
          ) : null}
          <ul role="list">
            {group.options.map((o) => (
              <li key={o.value}>
                <ContentsRow
                  {...control(group.axis, o.value, o.count)}
                  pressed={false}
                  label={o.label}
                  count={o.count}
                  marker={{ kind: "check", lead: o.lead }}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <TransferFilterSummary total={view.rows.length} className="mt-3" />
    </div>
  );
}

/** 1023 이하 — '한국 선수' 칩 + 접힘 칩 → 칩 묶음 */
export function TransferFilterBar({
  view,
  comps,
}: {
  view: TransfersView;
  comps: ReadonlyMap<CompId, CompLabel>;
}) {
  return (
    <div data-slot="transfer-filter-bar" className="mt-3 lg:hidden">
      <div
        role="group"
        aria-label="이적 필터"
        className="flex flex-wrap items-center gap-x-1.5"
      >
        <KoreanChip count={view.options.kr} />
        <button
          type="button"
          {...{ [XF.panelToggle]: "" }}
          aria-expanded="false"
          aria-controls="xf-panel"
          suppressHydrationWarning
          className={cx(
            "group/xt relative my-1 inline-flex h-9 min-w-11 flex-none items-center gap-1.5 border border-ink-2 bg-transparent px-3 text-[13.5px] font-extrabold text-ink",
            "transition-colors duration-fast ease-print after:absolute after:-inset-x-0.75 after:-inset-y-1.25 after:content-[''] hover:border-ink",
            "aria-expanded:border-ink aria-expanded:bg-paper-2",
          )}
        >
          리그 · 팀 · 단계 · Tier
          <span
            {...{ [XF.picked]: "" }}
            suppressHydrationWarning
            className="font-numeric text-[15px] leading-none font-semibold text-ink-2 tabular-nums"
          >
            0
          </span>
          <span className="sr-only">개 고름</span>
          <ChevronDownIcon
            size={16}
            className="text-ink-2 transition-transform duration-fast ease-print group-aria-expanded/xt:rotate-180"
          />
        </button>
      </div>
      <div
        id="xf-panel"
        hidden
        suppressHydrationWarning
        className="mt-2 border-t border-rule pt-1 pb-0.5"
      >
        {groupsOf(view, comps).map((group) => (
          <div
            key={group.axis}
            role="group"
            aria-labelledby={`xfb-${group.axis}`}
            className="border-b border-rule pt-2.5 pb-1 last:border-b-0"
          >
            <p
              id={`xfb-${group.axis}`}
              className="mb-0.5 text-xs font-extrabold text-ink-2"
            >
              {group.title}
            </p>
            {group.note ? (
              <p className="mt-1 mb-1.5 text-xs leading-[1.45] text-ink-2">
                {group.note}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
              {group.options.map((o) => (
                <FilterChip
                  key={o.value}
                  {...control(group.axis, o.value, o.count)}
                  pressed={false}
                  label={
                    <>
                      {o.lead}
                      {o.label}
                    </>
                  }
                  count={o.count}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <TransferFilterSummary total={view.rows.length} className="mt-2.5" />
    </div>
  );
}
