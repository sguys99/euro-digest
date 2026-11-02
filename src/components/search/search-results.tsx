"use client";

import type { CSSProperties, ReactNode } from "react";

import { COMPETITION_SURFACE } from "@/components/ui/competition";
import { cx } from "@/lib/cx";
import {
  SEARCH_TYPE_LABEL,
  type CompetitionHit,
  type KitMark,
  type NewsHit,
  type PlayerHit,
  type SearchHit,
  type SearchType,
  type TeamHit,
} from "@/lib/search/model";
import type { SearchGroup } from "@/lib/search/pagefind-client";
import { relativeKst } from "@/lib/time";

/**
 * 검색 결과 묶음 — 오버레이(listbox)·`/search/`(제목 + 목록)가 함께 쓴다 (DESIGN §9.3 "검색 오버레이 · 색인", 혼합안 `docs/design/d2/concept-mix.html`
 * 화면 4 · `.sres`, plan M4-14).
 *
 * - 묶음 머리 = 유형 글자 · 리더 점선 · 건수(Barlow 800). 위 괘선 2px(오버레이) / 3px + `--text-h2`(`/search/`).
 * - 선수 · 팀 · 대회 = 한 줄(이름 800 18px · 영문 Barlow 600 · 리더 · 오른쪽 보조 글자), 뉴스 = 뉴스 행 문법(분류 도장 · 태그 → 원제목 → 출처 ·
 *   상대 시각 · 절대 시각). 원제목은 그대로(D23), 원문 링크는 새 창.
 * - **결과 가림**(M4-15와 같은 규칙 — `<html data-spoiler="on">`): spoiler 카드는 제목 대신 빗금 띠 "결과 가림 · 경기 결과 제목"(가린 제목은
 *   보조기술에서도 숨는다 — 링크 이름은 띠 글자). `/search/`에서는 띠의 "보기"로 그 카드만 연다.
 * - 클래스 문자열만 쓴다(cva·tailwind-merge 없음 — 섬 크기).
 */

// ─── 공용 조각 ──────────────────────────────────────────────────────────────

/** 리더 점선(DESIGN §5.3 — 2px --ink-3) */
function Leader() {
  return (
    <span
      aria-hidden="true"
      className="min-w-3 flex-1 translate-y-1 self-center border-b-2 border-dotted border-ink-3"
    />
  );
}

/** 한국 완장 */
function Armband() {
  return (
    <span
      title="한국 선수"
      className="inline-block bg-brand-accent px-0.75 pt-0.75 pb-0.5 text-[10.5px] leading-[1.2] font-extrabold tracking-[-0.02em] text-brand-accent-foreground"
    >
      한국
    </span>
  );
}

/** 팀 배지(장식 — 옆에 한글 팀명이 늘 있다) */
function Kit({ kit, size }: { kit: KitMark; size: "s" | "xs" }) {
  const style = kit.colors
    ? ({
        "--k1": kit.colors[0],
        "--k2": kit.colors[1],
        "--kf": kit.colors[2],
      } as CSSProperties)
    : undefined;
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx(
        "kit",
        size === "s" ? "kit-s" : "kit-xs",
        !kit.colors && "kit-none",
      )}
    >
      <b>{kit.short}</b>
    </span>
  );
}

/** 분류 도장 */
function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block flex-none border border-ink px-1.5 pt-0.75 pb-0.5 text-type-stamp font-extrabold tracking-[0.01em] text-ink">
      {children}
    </span>
  );
}

const NAME = "text-lg leading-[1.3] font-extrabold tracking-[-0.03em]";
const EN =
  "font-numeric text-sm leading-none font-semibold tracking-[0.06em] text-ink-2";
const SIDE =
  "inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink-2";

// ─── 옵션 내용 ──────────────────────────────────────────────────────────────

function PlayerLine({ hit }: { hit: PlayerHit }) {
  return (
    <>
      <Armband />
      <span className={NAME}>{hit.name}</span>
      {hit.en ? (
        <span lang="en" className={EN}>
          {hit.en}
        </span>
      ) : null}
      <Leader />
      <span className={SIDE}>
        {hit.kit ? <Kit kit={hit.kit} size="xs" /> : null}
        {[hit.team, hit.pos].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

function TeamLine({ hit }: { hit: TeamHit }) {
  return (
    <>
      {hit.kit ? <Kit kit={hit.kit} size="s" /> : null}
      <span className={NAME}>{hit.name}</span>
      {!hit.sub && hit.en ? (
        <span lang="en" className={EN}>
          {hit.en}
        </span>
      ) : null}
      <Leader />
      {hit.sub ? <span className={SIDE}>{hit.sub}</span> : null}
    </>
  );
}

function CompetitionLine({ hit }: { hit: CompetitionHit }) {
  return (
    <>
      {hit.comp && hit.short ? (
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex h-5.5 min-w-11.5 items-center justify-center px-1.5 text-[11.5px] leading-none font-extrabold tracking-[-0.01em]",
            COMPETITION_SURFACE[hit.comp],
          )}
        >
          {hit.short}
        </span>
      ) : null}
      <span className={NAME}>{hit.name}</span>
      {hit.en ? (
        <span lang="en" className={EN}>
          {hit.en}
        </span>
      ) : null}
      <Leader />
      <span className={SIDE}>순위 · 일정</span>
    </>
  );
}

/** 태그 줄 — 사이 1px --rule 세로선, 한국 선수만 800 --ink */
function Tags({ hit, as: As }: { hit: NewsHit; as: "span" | "ul" }) {
  if (hit.tags.length === 0) return null;
  const Item = As === "ul" ? "li" : "span";
  return (
    <As
      {...(As === "ul" ? { role: "list", "aria-label": "태그" } : {})}
      className="flex flex-wrap gap-y-0.5"
    >
      {hit.tags.map((tag) => (
        <Item
          key={tag.label}
          className={cx(
            "border-l border-rule px-1.75 first:border-l-0 first:pl-0",
            tag.korean && "font-extrabold text-ink",
          )}
        >
          {tag.label}
        </Item>
      ))}
    </As>
  );
}

/** 결과 가림 띠(제목 자리) — 빗금 + 1px 점선 + "결과 가림"(800) + "경기 결과 제목" */
function SpoilerBand({ action }: { action?: ReactNode }) {
  return (
    <span className="mt-2 flex min-h-11 items-stretch border border-dashed border-ink-2 bg-[repeating-linear-gradient(-45deg,var(--hatch)_0_5px,transparent_5px_10px)] text-[13px]">
      <span className="flex flex-1 flex-wrap items-center gap-x-2 px-3 py-2">
        <b className="font-extrabold">결과 가림</b>
        <span className="text-ink-2">경기 결과 제목</span>
      </span>
      {action}
    </span>
  );
}

/** 원제목(그대로) + ↗ */
function NewsTitle({ hit, page }: { hit: NewsHit; page: boolean }) {
  const latin = hit.lang !== "ko";
  return (
    <span
      lang={hit.lang}
      className={cx(
        "block text-pretty",
        latin
          ? "font-latin text-lg leading-[1.16] font-semibold [word-break:normal]"
          : cx(
              "leading-[1.45] font-extrabold tracking-[-0.015em]",
              page ? "text-[15px] lg:text-base" : "text-[15px]",
            ),
      )}
    >
      {hit.title}
      <span
        aria-hidden="true"
        className="ml-0.5 font-sans text-[0.62em] font-normal text-ink-2"
      >
        ↗
      </span>
    </span>
  );
}

/** 출처 · 상대 시각 · 절대 시각 */
function NewsMeta({ hit, now }: { hit: NewsHit; now: Date }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-[1.3] text-ink-2">
      <span lang={hit.srcLang} className="font-extrabold text-ink">
        {hit.src}
      </span>
      {hit.at ? (
        <time dateTime={hit.at} className="contents">
          <span>{relativeKst(hit.at, now)}</span>
          {hit.abs ? (
            <span className="font-numeric text-[13.5px] font-semibold tracking-[0.02em] tabular-nums">
              {hit.abs}
            </span>
          ) : null}
        </time>
      ) : null}
    </span>
  );
}

// ─── 오버레이(listbox) ──────────────────────────────────────────────────────

/** 옵션 id(`aria-activedescendant`) */
export function optionId(prefix: string, type: SearchType, i: number): string {
  return `${prefix}-${type}-${i}`;
}

const OPTION =
  "flex min-h-13 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-rule py-2 pr-1.5 text-ink no-underline transition-[background-color] duration-fast ease-print hover:bg-paper-2 aria-selected:bg-paper-2 aria-selected:pl-2.5 aria-selected:shadow-[inset_4px_0_0_var(--brand-accent)]";

/**
 * 오버레이 결과 — `role="listbox"` 안에 묶음(`role="group"`)과 옵션(`role="option"` 링크)만. 0건 묶음은 그리지 않는다(listbox 안에 글자 줄을 둘
 * 수 없다 — 건수는 아래 요약 줄). `active` = 선택 옵션 순번(전체 순서).
 */
export function ListboxGroups({
  id,
  prefix,
  groups,
  active,
  spoiler,
  now,
  onHover,
}: {
  id: string;
  prefix: string;
  groups: readonly SearchGroup[];
  active: number;
  spoiler: boolean;
  now: Date;
  onHover(index: number): void;
}) {
  // 묶음마다 앞 묶음 옵션 수의 합(옵션 순번 = 시작 + 묶음 안 순번)
  const shown = groups.filter((g) => g.hits.length > 0);
  const starts = shown.map((_, gi) =>
    shown.slice(0, gi).reduce((sum, g) => sum + g.hits.length, 0),
  );
  return (
    <div
      id={id}
      role="listbox"
      aria-label="검색 결과"
      // 결과가 없으면 숨긴다(빈 listbox는 자식 역할 규칙 위반 — 입력의 aria-controls 대상은 늘 있게 요소는 남긴다)
      hidden={!groups.some((g) => g.hits.length > 0)}
      className="px-3.5 pt-1 pb-2 lg:px-5.5"
    >
      {shown.map((group, gi) => {
        const headId = `${prefix}-${group.type}-h`;
        return (
          <div
            key={group.type}
            role="group"
            aria-labelledby={headId}
            className={gi === 0 ? "mt-3.5" : "mt-6"}
          >
            <div
              id={headId}
              className="flex items-baseline gap-2 border-t-2 border-ink pt-1.5 text-[17px] leading-[1.3] font-extrabold tracking-[-0.025em]"
            >
              <span>{SEARCH_TYPE_LABEL[group.type]}</span>
              <Leader />
              <b className="font-numeric text-xl leading-none font-extrabold tabular-nums">
                {group.total}
              </b>
            </div>
            {group.hits.map((hit, i) => {
              const index = (starts[gi] ?? 0) + i;
              const selected = index === active;
              const news = hit.type === "news";
              const hidden = news && spoiler && hit.spoiler;
              return (
                <a
                  key={`${hit.type}-${hit.url}-${i}`}
                  id={optionId(prefix, group.type, i)}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  href={news ? hit.link : hit.url}
                  {...(news ? { target: "_blank", rel: "noopener" } : {})}
                  data-search-option=""
                  onMouseMove={() => onHover(index)}
                  className={cx(OPTION, news && "grid gap-1.5 pt-3 pb-2.5")}
                >
                  {hit.type === "player" ? <PlayerLine hit={hit} /> : null}
                  {hit.type === "team" ? <TeamLine hit={hit} /> : null}
                  {hit.type === "competition" ? (
                    <CompetitionLine hit={hit} />
                  ) : null}
                  {hit.type === "news" ? (
                    <>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1.25 text-type-tag text-ink-2">
                        <Stamp>{hit.cat}</Stamp>
                        <Tags hit={hit} as="span" />
                      </span>
                      {hidden ? (
                        <SpoilerBand />
                      ) : (
                        <NewsTitle hit={hit} page={false} />
                      )}
                      <NewsMeta hit={hit} now={now} />
                      <span className="sr-only">{`(원문 ${hit.src}, 새 창)`}</span>
                    </>
                  ) : null}
                </a>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 옵션 순서대로의 결과(키보드 이동·Enter) */
export function flatHits(groups: readonly SearchGroup[]): SearchHit[] {
  return groups.flatMap((g) => g.hits);
}

// ─── `/search/` 결과 ────────────────────────────────────────────────────────

const EMPTY_LINE: Readonly<Record<SearchType, string>> = {
  player: "찾은 선수가 없어요",
  team: "찾은 팀이 없어요",
  competition: "찾은 대회가 없어요",
  news: "관련 뉴스가 아직 없어요",
};

/** 묶음 앵커 id(목차 → 묶음) */
export function groupAnchor(type: SearchType): string {
  return `search-${type}`;
}

function PageNewsRow({
  hit,
  now,
  spoiler,
  revealed,
  onReveal,
}: {
  hit: NewsHit;
  now: Date;
  spoiler: boolean;
  revealed: boolean;
  onReveal(): void;
}) {
  const hidden = spoiler && hit.spoiler && !revealed;
  const date = hit.abs.split(" ")[0] ?? "";
  return (
    <li className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] gap-x-2.5 border-b border-rule pt-3.25 pb-3 lg:gap-x-3.5">
      <p className="grid content-start justify-items-start gap-2">
        <span
          aria-hidden="true"
          className="pt-0.75 font-numeric text-sm leading-none font-semibold tracking-[0.04em] text-ink-2 tabular-nums"
        >
          {date}
        </span>
        {hit.kr ? <Armband /> : null}
      </p>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.25 text-type-tag text-ink-2">
          <Stamp>{hit.cat}</Stamp>
          <Tags hit={hit} as="ul" />
        </div>
        {hidden ? (
          <SpoilerBand
            action={
              <button
                type="button"
                onClick={onReveal}
                className="relative min-w-16 border-l border-dashed border-ink-2 bg-paper px-3 text-xs font-extrabold text-ink"
              >
                보기
              </button>
            }
          />
        ) : (
          <h3 className="mt-2">
            <a
              href={hit.link}
              target="_blank"
              rel="noopener"
              // 누름 영역: 한 줄 제목(블록 34~36px)은 위아래 5px을 ::before로 넓혀 44px 이상(줄 높이 그대로 — 위 태그 줄 · 아래 메타 줄은 누르는 요소가 아니다, M4-16)
              className="relative block py-1.5 no-underline decoration-brand-accent decoration-2 underline-offset-3 before:absolute before:inset-x-0 before:-inset-y-1.25 before:content-[''] hover:underline"
            >
              <NewsTitle hit={hit} page />
              <span className="sr-only">{`(원문 ${hit.src}, 새 창)`}</span>
            </a>
          </h3>
        )}
        <p className="mt-1.5">
          <NewsMeta hit={hit} now={now} />
        </p>
      </div>
    </li>
  );
}

const PAGE_OPTION =
  "flex min-h-13 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-rule py-2 pr-1.5 text-ink no-underline transition-[background-color] duration-fast ease-print hover:bg-paper-2";

export function PageGroups({
  groups,
  spoiler,
  now,
  revealed,
  onReveal,
  moreNews,
  moreBusy,
}: {
  groups: readonly SearchGroup[];
  spoiler: boolean;
  now: Date;
  revealed: ReadonlySet<string>;
  onReveal(url: string): void;
  moreNews: ReactNode;
  moreBusy: boolean;
}) {
  return (
    <div aria-busy={moreBusy || undefined}>
      {groups
        // 대회는 찾았을 때만(혼합안 묶음은 선수 · 팀 · 뉴스 — 대회 묶음은 M4-14에서 더함)
        .filter((g) => g.type !== "competition" || g.total > 0)
        .map((group, gi) => (
          <section
            key={group.type}
            id={groupAnchor(group.type)}
            aria-labelledby={`${groupAnchor(group.type)}-h`}
            className={cx("scroll-mt-4", gi === 0 ? "mt-3.5" : "mt-6")}
          >
            <h2
              id={`${groupAnchor(group.type)}-h`}
              className="flex items-baseline gap-2 border-t-3 border-ink pt-2 text-type-h2 leading-[1.3] font-extrabold tracking-[-0.025em]"
            >
              <span>{SEARCH_TYPE_LABEL[group.type]}</span>
              <Leader />
              <b className="font-numeric text-[26px] leading-none font-extrabold tabular-nums">
                {group.total}
              </b>
            </h2>
            {group.total === 0 ? (
              <p className="border-b border-rule py-3 text-[13px] text-ink-2">
                {EMPTY_LINE[group.type]}
              </p>
            ) : group.type === "news" ? (
              <>
                <ol aria-label="뉴스 결과" className="mt-0">
                  {group.hits.map((hit) =>
                    hit.type === "news" ? (
                      <PageNewsRow
                        key={hit.url}
                        hit={hit}
                        now={now}
                        spoiler={spoiler}
                        revealed={revealed.has(hit.url)}
                        onReveal={() => onReveal(hit.url)}
                      />
                    ) : null,
                  )}
                </ol>
                {moreNews}
              </>
            ) : (
              <ul className="mt-1.5">
                {group.hits.map((hit) => (
                  <li key={hit.url}>
                    <a href={hit.url} className={PAGE_OPTION}>
                      {hit.type === "player" ? <PlayerLine hit={hit} /> : null}
                      {hit.type === "team" ? <TeamLine hit={hit} /> : null}
                      {hit.type === "competition" ? (
                        <CompetitionLine hit={hit} />
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </div>
  );
}

// ─── 요약 · 상태 ────────────────────────────────────────────────────────────

/** "선수 1 · 팀 1 · 뉴스 32" — 대회는 찾았을 때만 */
export function countSummary(groups: readonly SearchGroup[]): string {
  return groups
    .filter((g) => g.type !== "competition" || g.total > 0)
    .map((g) => `${SEARCH_TYPE_LABEL[g.type]} ${g.total}`)
    .join(" · ");
}

/** 전체 0건 — '0' 윤곽(장식) + 안내 */
export function NoResults({ query }: { query: string }) {
  return (
    <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 border-t border-b border-t-ink border-b-rule py-4.5">
      <span
        aria-hidden="true"
        className="font-numeric text-[64px] leading-[0.8] font-extrabold text-transparent lining-nums tabular-nums [-webkit-text-stroke:2px_var(--ink-2)]"
      >
        0
      </span>
      <p className="text-sm leading-normal text-ink-2">
        <b className="mb-0.5 block text-base font-extrabold text-ink">
          “{query}” 결과가 없어요
        </b>
        선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾아요
      </p>
    </div>
  );
}

/** 오류·오프라인 상자(DESIGN §9.3 상태 화면 ③ — `--paper-2` + 1px `--ink`) */
export function SearchProblem({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry(): void;
}) {
  return (
    <div role="alert" className="mt-3 border border-ink bg-paper-2 px-3.5 py-3">
      <p className="text-[15px] font-extrabold">
        {offline
          ? "오프라인이라 찾을 수 없어요"
          : "검색 색인을 불러오지 못했어요"}
      </p>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {offline
          ? "연결되면 다시 시도해 주세요. 지금 페이지는 그대로 볼 수 있어요."
          : "잠시 뒤 다시 시도해 주세요."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex min-h-11 items-center border border-ink px-4.5 text-sm font-extrabold text-ink hover:bg-ink hover:text-paper"
      >
        다시 시도
      </button>
    </div>
  );
}

/** 로딩 스켈레톤 — 묶음 머리 + 행 3(장식, `role="status"` + 화면 밖 글자) */
export function SearchSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" className={cx("pt-3.5", className)}>
      <span className="sr-only">검색하는 중</span>
      <div aria-hidden="true">
        <div className="border-t-2 border-ink pt-2">
          <div className="h-5 w-24 bg-paper-3" />
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 border-b border-rule py-3.5"
          >
            <div className="h-6 w-8 bg-paper-3" />
            <div
              className={cx("h-4.5 bg-paper-3", i === 1 ? "w-2/5" : "w-3/5")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
