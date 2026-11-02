import type { ComponentProps, ReactNode } from "react";

import {
  KoreanArmband,
  spoilerCardProps,
  TagList,
  TransferStage,
} from "@/components/news/feed-card";
import { SpoilerFlap } from "@/components/spoiler/spoiler-parts";
import { CardTitle } from "@/components/ui/card";
import { StampChip } from "@/components/ui/chip";
import { cx } from "@/lib/cx";
import { CATEGORY_LABEL } from "@/lib/news/labels";
import { sourceNameLang, type CardTagView } from "@/lib/news/feed-view";
import type { PlayerNewsItem } from "@/lib/player-detail-view";
import { formatKst } from "@/lib/time";

/**
 * 뉴스 행(A — DESIGN §9.3 D2 "뉴스 행") — `[날짜 거터 │ 본문]`: 대표 출처 날짜(KST, + 한국 완장) · 분류 도장 (+ 태그) · (코드가 판정한 이적
 * 단계 + Tier) · 원제목(원문 링크, 새 창) · 출처명 + 시각. 카드 그대로(원제목 · 출처명 · 원문 링크 — D23). 같은 카드가 같은 페이지 피드에
 * 다시 나올 수 있으므로 카드 ID 앵커는 두지 않는다. 선수 상세 옆단(이적설 · 대표팀 소식 — M3-10)과 대표팀 화면 · 홈 A매치 섹션(M3-13)이
 * 쓴다. 서버 컴포넌트 — JS 0.
 *
 * `tags`·`armband`(M3-13 — 혼합안 홈 A매치 · `/national-team` 뉴스 행): 여러 선수가 걸리는 대표팀 소식은 태그 줄과 한국 완장을 싣는다.
 * 선수 상세는 그 선수 구역이라 싣지 않는다(M3-10 그대로).
 *
 * `why`·`liProps`(M4-08 — 혼합안 '내 팀 소식'): 메타 줄 끝 걸린 팔로우 이름(800 `--ink`) · 행 `<li>` 속성(첫 페인트 전 스크립트가 고르는 후보 행 —
 * src/lib/my-news-dom.ts).
 * 결과 가림(M4-15 — FR-37): spoiler 카드는 행이 펼치는 단위(뜯김) — 가림이 켜지면 원제목을 접고 띠 "결과 가림 · {분류} 제목 · 보기"(뉴스
 * 카드와 같다 — feed-card.tsx `spoilerCardProps`).
 */
export function NewsRow({
  item,
  idPrefix,
  tags = [],
  armband = false,
  why,
  liProps,
}: {
  item: PlayerNewsItem;
  idPrefix: string;
  tags?: readonly CardTagView[];
  armband?: boolean;
  /** 메타 줄 끝 걸린 팔로우 이름 */
  why?: ReactNode;
  /** 행 `<li>` 속성(데이터 속성 · hidden) */
  liProps?: ComponentProps<"li"> & Record<`data-${string}`, string>;
}) {
  const { card } = item;
  const lead = card.src[0]!;
  const titleId = `${idPrefix}-${card.id}-t`;
  const spoil = spoilerCardProps(
    card,
    CATEGORY_LABEL[card.cat],
    `${idPrefix}-`,
  );
  return (
    <li
      {...liProps}
      {...(spoil ? { "data-spoil": "tear" } : {})}
      className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] gap-x-2.5 border-b border-rule pt-3.25 pb-3 lg:gap-x-3.5 xl:grid-cols-[48px_minmax(0,1fr)] xl:gap-x-2.5"
    >
      <p className="grid content-start justify-items-start gap-2">
        <time
          dateTime={lead.at}
          className="pt-0.75 font-numeric text-sm leading-none font-semibold tracking-[0.04em] text-ink-2 tabular-nums"
        >
          {formatKst(lead.at, "monthDay")}
        </time>
        {armband && card.kr ? <KoreanArmband /> : null}
      </p>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.25 text-type-tag text-ink-2">
          <StampChip>{CATEGORY_LABEL[card.cat]}</StampChip>
          {tags.length > 0 ? <TagList tags={tags} /> : null}
        </div>
        {card.transfer ? (
          <TransferStage
            status={card.transfer.status}
            tier={card.transfer.tier}
          />
        ) : null}
        <CardTitle
          id={titleId}
          as="h3"
          {...(spoil ? { "data-spoil-value": "" } : {})}
          href={lead.u}
          lang={card.lang}
          source={lead.n}
          className={card.lang === "ko" ? "text-[15px]" : "text-lg"}
        >
          {card.t}
        </CardTitle>
        {spoil ? (
          <SpoilerFlap descId={spoil.descId} className="mt-2">
            {spoil.desc}
          </SpoilerFlap>
        ) : null}
        <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-[1.3] text-ink-2">
          <span
            lang={sourceNameLang(lead.n, card.lang)}
            className="font-extrabold text-ink"
          >
            {lead.n}
          </span>
          {card.src.length > 1 ? (
            <span>
              외 <span className="tabular-nums">{card.src.length - 1}</span>건
            </span>
          ) : null}
          <time
            dateTime={lead.at}
            className="font-numeric text-[13.5px] font-semibold tracking-[0.02em] tabular-nums"
          >
            {formatKst(lead.at, "short")}
          </time>
          {why}
        </p>
      </div>
    </li>
  );
}

/** 뉴스 행 목록(최신순) — 위 1px `--rule` */
export function NewsRows({
  items,
  idPrefix,
  label,
  tagsOf,
  armband = false,
  className,
}: {
  items: readonly PlayerNewsItem[];
  idPrefix: string;
  label: string;
  /** 카드 → 태그(팀 → 선수, 한국 선수 굵게) — 없으면 태그 줄 없음 */
  tagsOf?: (item: PlayerNewsItem) => readonly CardTagView[];
  armband?: boolean;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cx("mt-2 border-t border-rule", className)}
    >
      {items.map((item) => (
        <NewsRow
          key={item.card.id}
          item={item}
          idPrefix={idPrefix}
          tags={tagsOf ? tagsOf(item) : []}
          armband={armband}
        />
      ))}
    </ol>
  );
}
