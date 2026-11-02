import { KoreanArmband, TransferStage } from "@/components/news/feed-card";
import { PlayerLink } from "@/components/korean-players/player-marks";
import { CardTitle } from "@/components/ui/card";
import { SpoilerFlap } from "@/components/spoiler/spoiler-parts";
import { ChevronDownIcon } from "@/components/ui/icons";
import { TierBadge } from "@/components/ui/tier-badge";
import { cx } from "@/lib/cx";
import { sourceNameLang } from "@/lib/news/feed-view";
import { TRANSFER_STAGE } from "@/lib/news/labels";
import type { TransferStatus } from "@/lib/schema/common";
import { formatKst } from "@/lib/time";
import { XF, xfRowAttr } from "@/lib/transfer-filter-dom";
import {
  timelineAnchor,
  type TransferCardView,
  type TransferRowView,
} from "@/lib/transfers-view";

import { RouteArrow, TeamName, TransferName } from "./transfer-marks";

/**
 * 이적 원장 행 + 펼침 세로 타임라인 (PRD FR-101 · FR-106, DESIGN §9.3 D2 "이적 원장 행" · "이적 타임라인", DECISIONS D2 §4 A · C, D64 ②⑤,
 * plan M4-04) — 서버 컴포넌트(JS 0). 펼침 · 필터 · 해시 도착은 섬(filter-island.tsx)과 첫 페인트 전 부트 스크립트가 속성만 바꾼다
 * (src/lib/transfer-filter-dom.ts DOM 약속 — 바뀌는 요소에 `suppressHydrationWarning`).
 *
 * 행 격자(혼합안 `.xr` · `.xr--w`): 1023 이하 = `단계 · Tier / 선수 · 소속 / 경로 · 갱신 / 근거 기사 / 타임라인` 쌓기,
 * 1024~1279 = 열 `132 · 196 · 1fr · 72 · 92px`(간격 12px — 목차 열 옆 지면 728px에서 행선지 이름이 어절 중간에서 끊기지 않게, DECISIONS D2 §9),
 * 1280 이상 = 혼합안 `150 · 230 · 1fr · 76 · 104px`(간격 16px). 잠잠(FR-106) = 행 글자 `--ink-2` + '잠잠' 도장(파일 순서 그대로 맨 아래).
 */

/** 쌓기 격자(1023 이하 원장 · 선수 상세 옆단 — 혼합안 `.xr`) */
const ROW_GRID_STACKED = cx(
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.25 border-b border-rule pt-3.5 pb-3",
  "[grid-template-areas:'stg_tier'_'who_who'_'rt_upd'_'ev_ev'_'tl_tl']",
);
/** 원장 격자 — 1024 이상 열(혼합안 `.xr--w`) */
const ROW_GRID = cx(
  ROW_GRID_STACKED,
  "lg:grid-cols-[132px_196px_minmax(0,1fr)_72px_92px] lg:gap-x-3 lg:gap-y-2.5 lg:pt-4",
  "lg:[grid-template-areas:'stg_who_rt_tier_upd'_'._ev_ev_ev_ev'_'._tl_tl_tl_tl']",
  "xl:grid-cols-[150px_230px_minmax(0,1fr)_76px_104px] xl:gap-x-4",
  // 필터 결과 진입 찍힘(섬이 잠깐 단다 — 첫 로드에는 없음)
  "data-xf-in:animate-stamp",
);

/**
 * 행이 놓이는 곳 — `ledger` = `/transfers/` 원장(1024 이상 열 · 행 머리 h2 · 선수 이름 = 상세 링크),
 * `side` = 한국 선수 상세 '이적설' 구역(모든 폭 쌓기 — 혼합안 `.xr` · 구역 머리가 h2라 행 머리 h3 · 그 선수 쪽이라 이름 링크 없음 — M4-16)
 */
export type LedgerPlacement = "ledger" | "side";

/** 1024 이상 열 머리(장식 — 각 칸에 글자가 있다) */
export function LedgerHead() {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "hidden border-b border-ink pt-3 pb-1.75 text-xs font-extrabold text-ink-2 lg:grid",
        "lg:grid-cols-[132px_196px_minmax(0,1fr)_72px_92px] lg:gap-x-3 xl:grid-cols-[150px_230px_minmax(0,1fr)_76px_104px] xl:gap-x-4",
      )}
    >
      <span>단계</span>
      <span>선수 · 소속</span>
      <span>출발 → 행선지</span>
      <span className="text-right">Tier</span>
      <span className="text-right">최근 갱신</span>
    </div>
  );
}

/** 필터 0건 빈 상태(DESIGN §9.3 상태 화면 ② — 윤곽 '0' + 안내 + 필터 해제). 처음엔 `hidden` */
export function LedgerFilterEmpty() {
  return (
    <div
      {...{ [XF.empty]: "" }}
      hidden
      suppressHydrationWarning
      className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 border-b border-rule pt-4 pb-3.5 lg:grid-cols-[64px_minmax(0,1fr)] lg:gap-x-3.5"
    >
      <span
        aria-hidden="true"
        className="font-numeric text-[40px] leading-[0.9] font-extrabold text-transparent tabular-nums [-webkit-text-stroke:1.5px_var(--ink-2)]"
      >
        0
      </span>
      <div className="text-sm leading-normal text-ink-2">
        <p className="text-[15px] font-extrabold text-ink">
          조건에 맞는 이적이 없어요
        </p>
        <p className="mt-0.5">
          고른 조건 가운데 하나를 풀면 다시 보여요.{" "}
          <button
            type="button"
            {...{ [XF.reset]: "empty" }}
            className="inline-flex min-h-11 min-w-11 items-center bg-transparent text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            필터 해제
          </button>
        </p>
      </div>
    </div>
  );
}

/** 원장 행 목록(파일 순서 — 잠잠은 맨 아래) */
export function LedgerRows({
  rows,
  idPrefix = "x",
}: {
  rows: readonly TransferRowView[];
  /** 같은 페이지에 목록이 여럿이면(견본) DOM id 앞머리를 바꾼다 */
  idPrefix?: string;
}) {
  return (
    <div
      data-slot="transfer-ledger"
      className="mt-1.5 border-t border-ink lg:mt-0 lg:border-t-0"
    >
      {rows.map((row) => (
        <LedgerRow key={row.id} row={row} idPrefix={idPrefix} />
      ))}
    </div>
  );
}

function rowId(row: TransferRowView, idPrefix: string): string {
  return idPrefix === "x" ? row.anchor : `${idPrefix}-${row.anchor}`;
}

function nodeId(cardId: string, idPrefix: string): string {
  return idPrefix === "x"
    ? timelineAnchor(cardId)
    : `${idPrefix}-${timelineAnchor(cardId)}`;
}

/** 원장 행 1건 */
export function LedgerRow({
  row,
  idPrefix = "x",
  placement = "ledger",
}: {
  row: TransferRowView;
  idPrefix?: string;
  placement?: LedgerPlacement;
}) {
  const side = placement === "side";
  const RowHeading = side ? "h3" : "h2";
  const cardAs = side ? "h4" : "h3";
  const id = rowId(row, idPrefix);
  const headingId = `${id}-h`;
  const panelId = `${id}-tl`;
  const hasTimeline = row.timeline.length > 1;
  const filterAttrs = Object.fromEntries(
    (Object.keys(row.filter) as Array<keyof typeof row.filter>).map((axis) => [
      xfRowAttr(axis),
      row.filter[axis].join(" "),
    ]),
  );
  return (
    <article
      id={id}
      aria-labelledby={headingId}
      {...{ [XF.row]: "" }}
      {...filterAttrs}
      data-quiet={row.quiet ? "" : undefined}
      suppressHydrationWarning
      className={cx(
        side ? ROW_GRID_STACKED : ROW_GRID,
        "scroll-mt-4",
        row.quiet && "mt-2 text-ink-2",
      )}
    >
      <div className="[grid-area:stg]">
        <TransferStage status={row.status} tier={null} className="mt-0" />
      </div>
      <div
        className={cx(
          "flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 [grid-area:who]",
          !side && "lg:flex-col lg:items-start",
        )}
      >
        <RowHeading
          id={headingId}
          className="text-lg leading-[1.2] font-extrabold tracking-[-0.02em]"
        >
          {side && row.player.name !== null ? (
            // 그 선수 상세 안 — 이름은 글자 + 완장(혼합안 `.xr__nm`, 자기 쪽 링크 없음)
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span>{row.player.name}</span>
              {row.player.page ? <KoreanArmband title="한국 선수" /> : null}
            </span>
          ) : row.player.page && row.player.name !== null ? (
            // 등록 한국 선수 — 이름은 선수 상세 링크(누름 영역 44px) + 완장
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <PlayerLink slug={row.player.slug}>{row.player.name}</PlayerLink>
              <KoreanArmband title="한국 선수" />
            </span>
          ) : (
            <TransferName player={row.player} />
          )}
        </RowHeading>
        {row.affiliation ? (
          <p className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] leading-[1.2] text-ink-2">
            <span className="inline-block flex-none border border-ink-2 px-1.25 pt-0.5 pb-px text-xs font-extrabold">
              소속
            </span>
            <TeamName
              team={row.affiliation}
              className="font-extrabold text-ink"
            />
          </p>
        ) : null}
      </div>
      <p className="flex min-w-0 items-center gap-2 text-[15px] leading-tight font-extrabold [grid-area:rt]">
        {row.from ? (
          <>
            <span className="sr-only">출발 </span>
            <TeamName team={row.from} size="s" className="flex-[0_1_auto]" />
          </>
        ) : (
          <span className="sr-only">출발 팀 정보 없음, </span>
        )}
        <RouteArrow />
        {row.to ? (
          <>
            <span className="sr-only">행선지 </span>
            <TeamName team={row.to} size="s" className="flex-[0_1_auto]" />
          </>
        ) : (
          <span className="text-[13px] whitespace-nowrap text-ink-2">
            행선지 미정
          </span>
        )}
      </p>
      <div className="flex flex-col items-end gap-1 justify-self-end [grid-area:tier]">
        {row.quiet ? (
          <span className="inline-block border border-ink-2 px-1.5 pt-0.75 pb-0.5 text-type-stamp font-extrabold text-ink-2">
            잠잠
          </span>
        ) : null}
        <TierBadge tier={row.bestTier} />
      </div>
      <p className="grid justify-items-end gap-0.75 justify-self-end text-[11.5px] font-extrabold text-ink-2 [grid-area:upd]">
        <span className={side ? undefined : "lg:sr-only"}>최근 갱신</span>
        <time
          dateTime={row.updated}
          className={cx(
            "font-numeric text-[14.5px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap tabular-nums",
            row.quiet ? "text-ink-2" : "text-ink",
          )}
        >
          {formatKst(row.updated, "short")}
        </time>
      </p>
      {row.lead ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-t border-dotted border-ink-3 pt-2.25 [grid-area:ev] lg:pt-2.5">
          <div
            id={hasTimeline ? undefined : nodeId(row.lead.id, idPrefix)}
            tabIndex={hasTimeline ? undefined : -1}
            className={cx("min-w-0", !hasTimeline && ARRIVE)}
          >
            <LeadCard card={row.lead} titleId={`${id}-lead-t`} as={cardAs} />
          </div>
          {hasTimeline ? (
            <button
              type="button"
              {...{ [XF.tlToggle]: "" }}
              aria-expanded="false"
              aria-controls={panelId}
              suppressHydrationWarning
              className="group/tl -mt-3 inline-flex min-h-11 items-center gap-1 bg-transparent pl-2.5 text-[13px] font-extrabold whitespace-nowrap text-ink"
            >
              <span className="underline decoration-1 underline-offset-4 group-hover/tl:decoration-2">
                타임라인
              </span>
              <span className="font-numeric text-[15px] font-semibold tabular-nums">
                {row.timeline.length}
              </span>
              <span className="sr-only">건</span>
              <ChevronDownIcon
                size={16}
                className="text-ink-2 transition-transform duration-fast ease-print group-aria-expanded/tl:rotate-180"
              />
            </button>
          ) : (
            <span className="text-[12.5px] whitespace-nowrap text-ink-2">
              기사{" "}
              <span className="font-numeric text-[15px] font-semibold text-ink tabular-nums">
                1
              </span>
            </span>
          )}
        </div>
      ) : null}
      {hasTimeline ? (
        <div
          id={panelId}
          {...{ [XF.tlPanel]: "" }}
          hidden
          suppressHydrationWarning
          className="pt-0.5 [grid-area:tl]"
        >
          <Timeline row={row} idPrefix={idPrefix} cardAs={cardAs} />
        </div>
      ) : null}
    </article>
  );
}

/** 도착 강조(`:target` · 해시 도착 속성) — `--paper-2` + 왼쪽 4px `--brand-accent`, 도착 모션 slow(모션 줄이기면 globals.css가 끈다) */
const ARRIVE =
  "scroll-mt-4 target:bg-paper-2 target:shadow-[inset_4px_0_0_var(--brand-accent)] target:animate-arrive data-xt-arrive:bg-paper-2 data-xt-arrive:shadow-[inset_4px_0_0_var(--brand-accent)] data-xt-arrive:animate-arrive focus:outline-none";

/**
 * 원제목 링크 위아래 패딩 14px — 여러 줄 제목의 줄 조각마다 누름 영역 44px(14.5px 한글 · 18px 라틴 제목의 글자 상자 + 28px, DESIGN §10).
 * 카드 기본 패딩(13 · 10px)은 16 · 20px 제목 기준이다
 */
const TITLE_LINK = { className: "py-3.5" };

/** 근거 줄 — 최신 단계 근거 카드(원제목 · 출처명 · 날짜) */
function LeadCard({
  card,
  titleId,
  as,
}: {
  card: TransferCardView;
  titleId: string;
  as: "h3" | "h4";
}) {
  return (
    // 결과 가림(M4-15): spoiler 카드면 이 묶음이 펼치는 단위 — 원제목을 접고 띠. 부모가 블록 흐름이라 보통 블록 묶음(모양 같음 —
    // `display: contents`를 쓰지 않는다: 선수 상세 옆단에서도 쓰므로 DECISIONS D2 §6 #6 규칙, M4-16)
    <div {...(card.spoiler !== null ? { "data-spoil": "tear" } : {})}>
      <CardTitle
        id={titleId}
        as={as}
        {...(card.spoiler !== null ? { "data-spoil-value": "" } : {})}
        href={card.url}
        lang={card.lang}
        source={card.source}
        linkProps={TITLE_LINK}
        className={cx(
          "mt-0",
          card.lang === "ko" ? "text-[14.5px]" : "text-[18px] leading-[1.16]",
        )}
      >
        {card.title}
      </CardTitle>
      {card.spoiler !== null ? (
        <SpoilerFlap className="mt-1">{card.spoiler}</SpoilerFlap>
      ) : null}
      <CardMetaLine card={card} />
    </div>
  );
}

function CardMetaLine({
  card,
  className,
}: {
  card: TransferCardView;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-[1.3] text-ink-2",
        className,
      )}
    >
      <span
        lang={sourceNameLang(card.source, card.lang)}
        className="font-extrabold text-ink"
      >
        {card.source}
      </span>
      {card.more > 0 ? (
        <span>
          외 <span className="tabular-nums">{card.more}</span>건
        </span>
      ) : null}
      <time dateTime={card.at} className="whitespace-nowrap">
        {formatKst(card.at, "date")}
      </time>
    </p>
  );
}

// ─── 타임라인 ────────────────────────────────────────────────────────────

const NODE = 14;
const NODE_STROKE = 1.5;

type NodeShape =
  { kind: "aux" } | { kind: "stage"; status: TransferStatus; changed: boolean };

/** 노드(장식) — 단계 근거: 상태를 바꾼 카드 = 채운 원(공식 레드 · 결렬 빈 원 + 사선) · 단계 유지 = 빈 원 `--ink-2` / 보조 = 12×2 가로 눈금 */
function NodeMark({ node }: { node: NodeShape }) {
  if (node.kind === "aux") {
    return <span className="block h-0.5 w-3 bg-ink" />;
  }
  const r = (NODE - NODE_STROKE) / 2;
  const collapsed = node.status === "collapsed";
  const cls = !node.changed
    ? "fill-paper stroke-ink-2"
    : collapsed
      ? "fill-paper stroke-transfer-collapsed"
      : node.status === "official"
        ? "fill-transfer-official stroke-transfer-official"
        : "fill-transfer-progress stroke-transfer-progress";
  return (
    <span
      className={cx(
        "relative block",
        node.changed &&
          collapsed &&
          "after:absolute after:-inset-x-0.75 after:top-1/2 after:h-0.5 after:-rotate-8 after:bg-transfer-collapsed after:content-['']",
      )}
    >
      <svg
        width={NODE}
        height={NODE}
        viewBox={`0 0 ${NODE} ${NODE}`}
        focusable="false"
        className="block"
      >
        <circle
          cx={NODE / 2}
          cy={NODE / 2}
          r={r}
          strokeWidth={NODE_STROKE}
          className={cls}
        />
      </svg>
    </span>
  );
}

function StageLabel({
  status,
  changed,
}: {
  status: TransferStatus;
  changed: boolean;
}) {
  return (
    <>
      <b
        className={cx(
          "text-[12.5px] font-extrabold",
          status === "official" && changed
            ? "text-brand-accent-text"
            : "text-ink",
        )}
      >
        <span className="sr-only">단계 근거 </span>
        {TRANSFER_STAGE[status].label}
      </b>
      {changed ? null : <span className="text-xs text-ink-2">단계 유지</span>}
    </>
  );
}

/** 펼침 세로 타임라인(최신순) + 범례 */
export function Timeline({
  row,
  idPrefix = "x",
  cardAs = "h3",
}: {
  row: TransferRowView;
  idPrefix?: string;
  /** 기사 제목 단계 — 원장 h3 · 선수 상세 옆단 h4(행 머리 아래) */
  cardAs?: "h3" | "h4";
}) {
  const kept = row.timeline.some((n) => n.kind === "stage" && !n.changed);
  const base = rowId(row, idPrefix);
  return (
    <>
      <ol
        aria-label={`기사 타임라인 — 최신순, 단계 근거 ${row.stageCount}건${row.auxCount ? ` · 보조 ${row.auxCount}건` : ""}`}
        className="relative mt-1.5 before:absolute before:top-4 before:bottom-4.5 before:left-[calc(var(--gutter-date)+18px)] before:w-0.5 before:bg-ink before:content-['']"
      >
        {row.timeline.map((node) => (
          <li
            key={`${node.kind}-${node.card.id}`}
            id={
              node.kind === "stage" ? nodeId(node.card.id, idPrefix) : undefined
            }
            tabIndex={node.kind === "stage" ? -1 : undefined}
            className={cx(
              "relative grid grid-cols-[var(--gutter-date)_14px_minmax(0,1fr)] gap-x-3 pt-2.5 pb-3 transition-colors duration-fast ease-print",
              ARRIVE,
            )}
          >
            <p className="grid content-start justify-items-end gap-0.75 pr-0.5 text-right">
              <time
                dateTime={node.card.at}
                className="font-numeric text-num-n4 leading-[0.95] font-extrabold tabular-nums"
              >
                {formatKst(node.card.at, "monthDay")}
              </time>
              <span className="font-numeric text-xs leading-none font-semibold text-ink-2 tabular-nums">
                {formatKst(node.card.at, "time")}
              </span>
            </p>
            <span
              aria-hidden="true"
              className={cx(
                "relative z-1 justify-self-center",
                node.kind === "stage" ? "pt-0.75" : "pt-2.5",
              )}
            >
              <NodeMark node={node} />
            </span>
            <div
              className="min-w-0"
              {...(node.card.spoiler !== null ? { "data-spoil": "tear" } : {})}
            >
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {node.kind === "stage" ? (
                  <>
                    <StageLabel status={node.status} changed={node.changed} />
                    <TierBadge tier={node.tier} />
                  </>
                ) : (
                  <span className="text-xs font-extrabold text-ink-2">
                    보조 · 단계 없음
                  </span>
                )}
              </p>
              <CardTitle
                id={`${base}-n-${node.card.id}-t`}
                as={cardAs}
                {...(node.card.spoiler !== null
                  ? { "data-spoil-value": "" }
                  : {})}
                href={node.card.url}
                lang={node.card.lang}
                source={node.card.source}
                linkProps={TITLE_LINK}
                className={cx(
                  "mt-1.5 max-w-[40em]",
                  node.card.lang === "ko"
                    ? cx("text-[15px]", node.kind === "aux" && "font-normal")
                    : "text-[18px] leading-[1.16]",
                )}
              >
                {node.card.title}
              </CardTitle>
              {node.card.spoiler !== null ? (
                <SpoilerFlap className="mt-1.5">
                  {node.card.spoiler}
                </SpoilerFlap>
              ) : null}
              <CardMetaLine card={node.card} className="mt-1" />
            </div>
          </li>
        ))}
      </ol>
      <p
        aria-hidden="true"
        className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dotted border-ink-3 pt-2 pb-0.5 text-xs text-ink-2"
      >
        <span className="inline-flex items-center gap-1.5">
          <NodeMark node={{ kind: "stage", status: "rumor", changed: true }} />
          단계 근거
        </span>
        {kept ? (
          <span className="inline-flex items-center gap-1.5">
            <NodeMark
              node={{ kind: "stage", status: "rumor", changed: false }}
            />
            단계 유지(같거나 낮은 단계 보도)
          </span>
        ) : null}
        {row.auxCount ? (
          <span className="inline-flex items-center gap-1.5">
            <NodeMark node={{ kind: "aux" }} />
            보조 · 같은 선수의 이적 기사(단계 없음)
          </span>
        ) : null}
      </p>
    </>
  );
}
