import Link from "next/link";

import { NewsFeed } from "@/components/news-feed";
import { NewsRows } from "@/components/news/news-row";
import { TeamBadge } from "@/components/team/team-badge";
import { Leader } from "@/components/about/leader";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import { issueNumber } from "@/lib/issue";
import type { RosterView } from "@/lib/korean-players-view";
import { routes } from "@/lib/paths";
import type {
  FixtureRowView,
  FixtureTeamView,
  LogRowView,
  NationalCallUpView,
  PlayerDetailView,
  PlayerNewsGroup,
  PlayerNewsItem,
  SeasonRowView,
} from "@/lib/player-detail-view";
import type { NewsFile } from "@/lib/schema/news";
import { formatKst } from "@/lib/time";
import { cx } from "@/lib/cx";
import { cn } from "@/lib/utils";

import { CompTag, NUMBER_TONE, OpponentName, ResultCell } from "./player-marks";
import { Perforation } from "./ticket-parts";

/**
 * 한국 선수 상세 구역 — 시즌 기록 표 · 최근 5경기 로그 · 다음 경기(입장권 + 일정 행) · 관련 뉴스 · 이적설 · 대표팀 소식 · 1024 이상 목차(명단)
 * (PRD FR-62·FR-73, DESIGN §9.3 D2 "경기 로그 행"·"시즌 기록 표"·"다음 경기 입장권"·화면별 배치 "선수 상세", DECISIONS D2 §4 · §6, plan M3-10)
 *
 * 서버 컴포넌트 — JS 0(관련 뉴스 피드의 상대 시간 · 카드 메뉴 섬은 뉴스 피드 그대로). 데이터가 없는 구역은 페이지가 숨긴다(자리 상자 없음 —
 * DECISIONS D2 §6 #8). 옆단 구역(다음 경기 · 이적설 · 대표팀 소식)의 머리는 1279 이하 지면 흐름에서 보통 머리, 1280 이상 옆단에서 얇은 머리.
 */

const SUB = "mt-0.75 text-[13px] leading-normal text-ink-2";

/** 구역 끝 텍스트 링크 — 홈 위젯 링크와 같은 모양(13px 800 `--brand-accent-text` 밑줄, 누름 영역 44px) */
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

// ─── 시즌 기록 표 ───────────────────────────────────────────────────────────

/** 표 숫자 — N5 Barlow 600(합계 19/20px 800), 18px 이하 표 숫자의 0은 `--ink-2`(윤곽 대신), null은 대시 */
function StatCell({
  value,
  total = false,
}: {
  value: number | null;
  total?: boolean;
}) {
  return (
    <td className="border-b border-rule px-1 py-2.5 text-right align-middle whitespace-nowrap lg:px-2 lg:py-3">
      {value === null ? (
        <>
          <span aria-hidden="true" className="text-ink-2">
            –
          </span>
          <span className="sr-only">기록 없음</span>
        </>
      ) : (
        <span
          className={cx(
            "font-numeric leading-none tabular-nums",
            total
              ? "text-[19px] font-extrabold lg:text-xl"
              : "text-num-n5 font-semibold tracking-[0.01em]",
            !total && value === 0 && "text-ink-2",
          )}
        >
          {value}
        </span>
      )}
    </td>
  );
}

export function SeasonRecord({
  headingId,
  rows,
  total,
  sinceLabel,
}: {
  headingId: string;
  rows: readonly SeasonRowView[];
  total: PlayerDetailView["total"];
  sinceLabel: string | null;
}) {
  const TH =
    "border-b border-ink px-1 pt-3 pb-1.75 text-right text-xs font-extrabold whitespace-nowrap text-ink-2 lg:px-2";
  return (
    <section
      aria-labelledby={headingId}
      data-slot="player-season"
      className="mt-9 lg:mt-11"
    >
      <SectionHead
        heading="시즌 기록"
        headingId={headingId}
        runningHead="SEASON RECORD"
      />
      <p className={SUB}>
        대회별{sinceLabel ? ` · ${sinceLabel}` : ""} — 리그와 UCL은 따로, 컵은
        기타 대회
      </p>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">
          대회별 시즌 기록{sinceLabel ? ` — ${sinceLabel}` : ""}. 출전 경기 ·
          출전 시간(분) · 골 · 도움.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "pl-0 text-left lg:pl-0")}>
              대회
            </th>
            <th scope="col" className={TH}>
              출전
            </th>
            <th scope="col" className={TH}>
              분
            </th>
            <th scope="col" className={TH}>
              골
            </th>
            <th scope="col" className={cn(TH, "pr-0 lg:pr-0")}>
              도움
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                className="min-w-21 border-b border-rule py-2.5 pr-2 text-left align-middle font-normal lg:py-3"
              >
                <CompTag comp={row.comp} stacked />
              </th>
              <StatCell value={row.apps} />
              <StatCell value={row.minutes} />
              <StatCell value={row.goals} />
              <StatCell value={row.assists} />
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr className="[&>*]:border-t-2 [&>*]:border-b-0 [&>*]:border-t-ink [&>*]:pt-2.75">
              <th
                scope="row"
                className="py-2.5 pr-2 text-left align-middle text-[13px] font-extrabold lg:py-3"
              >
                합계
              </th>
              <StatCell value={total.apps} total />
              <StatCell value={total.minutes} total />
              <StatCell value={total.goals} total />
              <StatCell value={total.assists} total />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </section>
  );
}

// ─── 최근 5경기 로그 ────────────────────────────────────────────────────────

function LogRow({ row }: { row: LogRowView }) {
  const a = row.appearance;
  const day = formatKst(row.kickoff, "dayShort"); // "10.31 (토)"
  const weekday = /\((.)\)/.exec(day)?.[1] ?? "";
  return (
    <li
      data-slot="log-row"
      data-tone={a.tone}
      className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-rule pt-3 pb-2.75 lg:gap-x-3.5 lg:pt-3.5 lg:pb-3.25"
    >
      <p className="grid content-start gap-1">
        <time
          dateTime={row.kickoff}
          className="font-numeric text-num-n4 leading-[0.95] font-extrabold tracking-[-0.01em] tabular-nums"
        >
          {formatKst(row.kickoff, "monthDay")}
        </time>
        <span className="font-numeric text-xs leading-none font-semibold whitespace-nowrap text-ink-2 tabular-nums">
          <span className="mr-1 font-sans font-normal">({weekday})</span>
          {formatKst(row.kickoff, "time")}
        </span>
      </p>
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[1.3] text-ink-2">
          <CompTag comp={row.comp} />
          {row.round ? <span>{row.round}</span> : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.75 gap-y-1 text-[15px] leading-[1.25] font-extrabold">
          <span className="text-[12.5px] font-normal text-ink-2">vs</span>
          <OpponentName opponent={row.opponent} />
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            aria-hidden="true"
            className={cx(
              "font-numeric text-num-n4 leading-none font-extrabold tabular-nums",
              NUMBER_TONE[a.tone],
              a.tone === "zero" && "[-webkit-text-stroke-width:1.25px]",
            )}
          >
            {a.text}
          </span>
          {a.tone !== "null" ? (
            <small
              aria-hidden="true"
              className="-ml-1.5 text-xs font-extrabold text-ink-2"
            >
              분
            </small>
          ) : null}
          <span
            aria-hidden="true"
            className={cx(
              "text-[12.5px] font-extrabold",
              a.strong ? "text-ink" : "text-ink-2",
            )}
          >
            {a.label}
          </span>
          <span className="sr-only">{a.sr}</span>
        </p>
      </div>
      <div className="pt-px">
        <ResultCell
          result={row.result}
          home={row.home}
          goals={row.goals}
          assists={row.assists}
        />
      </div>
    </li>
  );
}

/** 집계 시작 전 칸 — 거터 28×2px `--ink-3` 대시 + "집계 시작({M.DD}) 전" 800 + 위아래 1.5px dashed 띠(이유는 목록 아래 캡션 한 번) */
function GapRow({ sinceShort }: { sinceShort: string }) {
  return (
    <li
      data-slot="log-gap"
      className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-start gap-x-3 border-b border-rule pt-3 pb-2.75 text-ink-2 lg:gap-x-3.5 lg:pt-3.5 lg:pb-3.25"
    >
      <span aria-hidden="true" className="mt-2.5 block h-0.5 w-7 bg-ink-3" />
      <p className="flex min-h-7 items-center gap-3 text-[13px]">
        <b className="font-extrabold whitespace-nowrap text-ink">
          집계 시작(
          <span className="font-numeric tabular-nums">{sinceShort}</span>) 전
        </b>
        <span
          aria-hidden="true"
          className="h-5.5 flex-1 border-y-[1.5px] border-dashed border-ink-3"
        />
      </p>
    </li>
  );
}

export function MatchLog({
  headingId,
  rows,
  gap,
  since,
  sinceLabel,
  teamName,
}: {
  headingId: string;
  rows: readonly LogRowView[];
  gap: number;
  /** 집계 시작일(UTC 날짜) */
  since: string | null;
  sinceLabel: string | null;
  teamName: string;
}) {
  const sinceShort = since ? since.slice(5).replace("-", ".") : "";
  return (
    <section
      aria-labelledby={headingId}
      data-slot="player-log"
      className="mt-9 lg:mt-11"
    >
      <SectionHead
        heading="최근 5경기"
        headingId={headingId}
        runningHead="MATCH LOG"
      />
      <p className={SUB}>최신순 · 결과는 {teamName} 득점 먼저 · KST</p>
      {rows.length > 0 ? (
        <>
          <ol
            aria-label={`최근 ${rows.length}경기 — 최신순`}
            className="mt-2 border-t border-ink"
          >
            {rows.map((row) => (
              <LogRow key={row.key} row={row} />
            ))}
            {since
              ? Array.from({ length: gap }, (_, i) => (
                  <GapRow key={i} sinceShort={sinceShort} />
                ))
              : null}
          </ol>
          {gap > 0 && sinceLabel ? (
            <p className="mt-2.5 text-[12.5px] leading-[1.45] text-ink-2">
              점선 칸은 집계 시작일 전 경기예요 — {sinceLabel}이라 그 전 경기는
              기록에 없어요
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 border-t border-ink pt-4 pb-2 text-[15px] font-extrabold">
          집계 시작 뒤 경기가 없어요.
        </p>
      )}
    </section>
  );
}

// ─── 다음 경기 — 입장권 + 일정 행 ───────────────────────────────────────────

/**
 * 팀 한 줄(경기 기준 — 홈/원정): 배지 s + 팀명 15px 800 + "홈"/"원정" 11.5px. 글자다(시안 그대로 — 두 줄 간격 6px에 팀 링크 두 개의 누름
 * 영역 44px이 겹친다, 팀 화면은 선수 티켓의 "팀 화면" 링크로)
 */
function SideTeam({
  team,
  side,
}: {
  team: FixtureTeamView;
  side: "홈" | "원정";
}) {
  return (
    <span className="flex items-center gap-2 text-[15px] leading-[1.25] font-extrabold">
      <span className="sr-only">{side} </span>
      <span className="inline-flex min-w-0 items-center gap-2">
        <TeamBadge team={team.badge} size="s" />
        <span lang={team.latin ? "en" : undefined} className="min-w-0">
          {team.name}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="text-[11.5px] font-normal whitespace-nowrap text-ink-2"
      >
        {side}
      </span>
    </span>
  );
}

/** 다음 경기 입장권(B) — 가로형(1279 이하) · 세로형(1280 이상 옆단). 경기 기준이라 홈 팀 먼저 */
function Admission({
  row,
  headingId,
}: {
  row: FixtureRowView;
  headingId: string;
}) {
  return (
    <article
      aria-labelledby={headingId}
      data-slot="admission"
      className="relative mt-2.5 grid grid-cols-[auto_2px_minmax(0,1fr)] border-[1.5px] border-ink bg-paper xl:grid-cols-1 xl:grid-rows-[auto_2px_auto]"
    >
      <h3 id={headingId} className="sr-only">
        다음 경기 — {row.day} {row.time ?? "시각 미정"} KST, {row.home.name} 대{" "}
        {row.away.name}
      </h3>
      <div
        aria-hidden="true"
        className="flex min-w-26 flex-col justify-center gap-2 py-3.5 pr-3 pl-3.5 lg:min-w-37.5 lg:px-5 lg:py-4.5 xl:min-w-0 xl:flex-row xl:items-end xl:justify-between xl:px-4 xl:pt-4 xl:pb-3.5"
      >
        <time
          dateTime={row.kickoff}
          className="block font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] tabular-nums xl:text-[56px]"
        >
          {row.time ?? "미정"}
        </time>
        <span className="flex items-baseline gap-1.5 font-numeric text-sm leading-none font-extrabold tracking-[0.02em] text-ink-2 xl:flex-col xl:items-end xl:gap-1.25">
          <span className="text-ink tabular-nums">{row.day}</span>
          <span className="text-xs font-semibold">KST</span>
        </span>
      </div>
      <Perforation xlHorizontal />
      <div className="grid min-w-0 content-start gap-2 pt-3 pr-3.5 pb-3 pl-4 xl:px-4 xl:pt-3 xl:pb-3.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
          <CompTag comp={row.comp} />
          {row.round ? <span>{row.round}</span> : null}
        </p>
        <p className="grid gap-1.5">
          <SideTeam team={row.home} side="홈" />
          <SideTeam team={row.away} side="원정" />
        </p>
      </div>
    </article>
  );
}

/** 이어지는 경기 — D1 팀 일정 행 문법(거터 킥오프 + 날짜 · 대회 줄 · 홈/원정 두 줄) */
function FixtureRow({ row }: { row: FixtureRowView }) {
  return (
    <li className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-start gap-x-2.5 border-b border-rule py-2.75 xl:grid-cols-[56px_minmax(0,1fr)]">
      <p className="grid gap-1">
        <time
          dateTime={row.kickoff}
          className="font-numeric text-[21px] leading-[0.9] font-extrabold tracking-[-0.01em] tabular-nums"
        >
          {row.time ?? "미정"}
        </time>
        <span className="font-numeric text-[12.5px] leading-none font-semibold text-ink-2 tabular-nums">
          {row.day}
        </span>
      </p>
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
          <CompTag comp={row.comp} />
          {row.round ? <span>{row.round}</span> : null}
        </p>
        <p className="grid gap-1.5">
          <SideTeam team={row.home} side="홈" />
          <SideTeam team={row.away} side="원정" />
        </p>
      </div>
    </li>
  );
}

export function NextMatches({
  headingId,
  rows,
}: {
  headingId: string;
  rows: readonly FixtureRowView[];
}) {
  const [first, ...rest] = rows;
  if (!first) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-slot="player-next"
      data-side=""
      className="mt-9 lg:mt-11 xl:mt-0"
    >
      <SectionHead
        heading="다음 경기"
        headingId={headingId}
        runningHead="FIXTURES"
        sideAtXl
      />
      <p className={SUB}>KST · 홈 팀 먼저</p>
      <Admission row={first} headingId={`${headingId}-1`} />
      {rest.length > 0 ? (
        <ol aria-label="이어지는 경기" className="mt-2.5">
          {rest.map((row) => (
            <FixtureRow key={row.key} row={row} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

// ─── 관련 뉴스(뉴스 카드 피드 그대로) ──────────────────────────────────────

function IssueFeeds({
  group,
  feedPrefix,
  name,
}: {
  group: PlayerNewsGroup<NewsFile>;
  feedPrefix: string;
  name: string;
}) {
  return (
    <>
      {group.issues.map(({ news, ids }) => {
        const no = issueNumber(news.date);
        const keep = new Set(ids);
        return (
          <div key={news.date} className="mt-3">
            <Link
              href={routes.newsArchive(news.date)}
              className="inline-flex min-h-11 items-center gap-1 text-[12.5px] font-extrabold text-ink-2 no-underline hover:text-ink hover:underline hover:decoration-1 hover:underline-offset-4"
            >
              <time dateTime={news.date}>
                {formatKst(`${news.date}T03:00:00Z`, "dayShort")}
              </time>
              {no !== null ? <span>· 제 {no}호</span> : null}
              <ChevronRightIcon size={16} />
            </Link>
            <NewsFeed
              news={news}
              lead={false}
              meta={false}
              id={`${feedPrefix}-${news.date}`}
              titleAs="h3"
              scope={{
                match: (card) => keep.has(card.id),
                desc: name,
                empty: "",
              }}
            />
          </div>
        );
      })}
    </>
  );
}

function countLine(group: PlayerNewsGroup<NewsFile>): string {
  const shown = group.issues.reduce((n, g) => n + g.ids.length, 0);
  return shown < group.total
    ? `최근 30일 ${group.total}건 중 최신 ${shown}건`
    : `${shown}건 · 최근 30일`;
}

/**
 * 관련 뉴스(한/영) — 최근 30일 호의 이 선수 태그 카드(이적 · 대표팀 분류는 아래 두 구역으로). 원제목 언어로 나누고(한국어 → 영문), 0건인
 * 언어 묶음은 숨긴다. 둘 다 0건이면 빈 상태 문장. 카드 = 뉴스 카드 그대로(출처명 · 원문 링크 · 게재 번호는 그 호 순서).
 */
export function RelatedNews({
  headingId,
  ko,
  en,
  name,
}: {
  headingId: string;
  ko: PlayerNewsGroup<NewsFile>;
  en: PlayerNewsGroup<NewsFile>;
  name: string;
}) {
  const both = ko.total > 0 && en.total > 0;
  const label =
    "mt-5 flex flex-wrap items-baseline gap-x-2 text-sm font-extrabold";
  return (
    <section
      aria-labelledby={headingId}
      data-slot="player-news"
      className="mt-9 lg:mt-11"
    >
      <SectionHead
        heading="관련 뉴스"
        headingId={headingId}
        runningHead="PRESS"
      />
      {ko.total === 0 && en.total === 0 ? (
        <div className="pt-7 pb-2">
          <p className="text-[15px] font-extrabold">
            최근 30일 동안 {name} 소식이 없어요.
          </p>
          <p className="mt-2 text-[13.5px] text-ink-2">
            새 호에 {name} 소식이 실리면 이곳에 모입니다.
          </p>
        </div>
      ) : (
        <>
          <p className={cx(SUB, "flex flex-wrap justify-between gap-x-3")}>
            <span>원제목 그대로 · 최신 호부터</span>
            <span className="text-xs">
              작은 번호는 그 호의 게재 번호(순위 아님)
            </span>
          </p>
          {ko.total > 0 ? (
            <div data-lang="ko">
              <p className={cx(label, !both && "sr-only")}>
                한국어 보도
                <span className="font-normal text-ink-2 tabular-nums">
                  {countLine(ko)}
                </span>
              </p>
              {!both ? (
                <p className="mt-1 text-[13px] text-ink-2 tabular-nums">
                  {countLine(ko)}
                </p>
              ) : null}
              <IssueFeeds group={ko} feedPrefix="pd-ko" name={name} />
            </div>
          ) : null}
          {en.total > 0 ? (
            <div data-lang="en">
              <p className={label}>
                해외 보도
                <span className="font-normal text-ink-2 tabular-nums">
                  {countLine(en)}
                </span>
              </p>
              <IssueFeeds group={en} feedPrefix="pd-en" name={name} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// ─── 옆단 뉴스 행(이적설 · 대표팀 소식) — 뉴스 행은 src/components/news/news-row.tsx ─────────────

/** 이적설 — 이 선수 태그 + 이적 분류 카드(원제목 그대로 — 루머는 보도 형식 그대로). 0건이면 페이지가 숨긴다 */
export function TransferNews({
  id,
  items,
  total,
}: {
  /** 구역 id(티켓 꼬리표 링크 대상) — 머리 id는 `{id}-h` */
  id: string;
  items: readonly PlayerNewsItem[];
  total: number;
}) {
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="player-transfers"
      data-side=""
      className="mt-9 scroll-mt-4 lg:mt-11 xl:mt-11"
    >
      <SectionHead
        heading="이적설"
        headingId={headingId}
        runningHead="TRANSFERS"
        sideAtXl
      />
      <p className={SUB}>
        이적 분류 기사 · 최신순 ·{" "}
        {items.length < total
          ? `최근 30일 ${total}건 중 ${items.length}건`
          : `${total}건`}
      </p>
      <NewsRows items={items} idPrefix="pd-tr" label="이적설 기사 — 최신순" />
    </section>
  );
}

/** 대표팀 소식 — 최신 소집(명단에 있을 때 — 일정 한 줄씩) + 이 선수 태그 대표팀 분류 카드. 둘 다 없으면 페이지가 숨긴다 */
export function NationalNews({
  id,
  callUp,
  items,
  total,
}: {
  /** 구역 id(티켓 꼬리표 링크 대상) — 머리 id는 `{id}-h` */
  id: string;
  callUp: NationalCallUpView | null;
  items: readonly PlayerNewsItem[];
  total: number;
}) {
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="player-national"
      data-side=""
      className="mt-9 scroll-mt-4 lg:mt-11 xl:mt-11"
    >
      <SectionHead
        heading="대표팀 소식"
        headingId={headingId}
        runningHead="NATIONAL"
        sideAtXl
      />
      {callUp ? (
        <div data-slot="call-up" className="mt-2 border-t border-rule pt-2.5">
          <p className="text-sm font-extrabold">
            {callUp.label} 명단에 들었어요
            <span className="ml-1.5 text-[12.5px] font-normal text-ink-2">
              <time dateTime={callUp.announcedAt} className="tabular-nums">
                {formatKst(callUp.announcedAt, "monthDay")}
              </time>{" "}
              발표
            </span>
          </p>
          {callUp.matches.length > 0 ? (
            <ul role="list" className="mt-1.5 grid gap-1 pb-1">
              {callUp.matches.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-2"
                >
                  <time
                    dateTime={m.kickoff}
                    className="font-numeric text-[14.5px] font-semibold text-ink tabular-nums"
                  >
                    {formatKst(m.kickoff, "dayShort")}
                    {m.kickoffTbd ? "" : ` ${formatKst(m.kickoff, "time")}`}
                  </time>
                  <span>
                    <b className="font-extrabold text-ink">{m.opponent}</b>{" "}
                    {m.home ? "홈" : "원정"} · {m.competition}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {items.length > 0 ? (
        <>
          <p className={cx(SUB, "mt-3")}>
            대표팀 분류 기사 · 최신순 ·{" "}
            {items.length < total
              ? `최근 30일 ${total}건 중 ${items.length}건`
              : `${total}건`}
          </p>
          <NewsRows
            items={items}
            idPrefix="pd-nt"
            label="대표팀 소식 기사 — 최신순"
          />
        </>
      ) : null}
      {/* 대표팀 화면(M3-13 — 일정 · 결과 · 소집 명단 · 대표팀 소식 모아 보기) */}
      <p className="mt-1">
        <Link href={routes.nationalTeam()} className={TEXT_LINK}>
          대표팀 일정·소집 명단
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </section>
  );
}

// ─── 1024 이상 목차 — 명단 ──────────────────────────────────────────────────

/** 왼쪽 목차 — 한국 선수 명단(최근 경기 출전 분 · 이름 · 리더 점선 · 배지), 지금 선수 `aria-current="page"` */
export function PlayerIndex({
  roster,
  current,
}: {
  roster: RosterView;
  current: string;
}) {
  const rows = roster.groups.flatMap((g) => g.rows);
  return (
    <>
      <SectionHead heading="명단" headingAs="p" runningHead="SQUAD" />
      <ul role="list" className="mt-2">
        {rows.map((row) => {
          const me = row.slug === current;
          return (
            <li key={row.slug}>
              <Link
                href={routes.koreanPlayer(row.slug)}
                aria-current={me ? "page" : undefined}
                className={cx(
                  "group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink no-underline",
                  me &&
                    "bg-paper-2 pl-2 font-extrabold shadow-[inset_4px_0_0_var(--brand-accent)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "min-w-6.5 font-numeric text-lg leading-none font-extrabold tabular-nums",
                    NUMBER_TONE[row.appearance.tone],
                    row.appearance.tone === "zero" &&
                      "[-webkit-text-stroke-width:1.25px]",
                  )}
                >
                  {row.appearance.text}
                </span>
                <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                  {row.nameKo}
                </span>
                <Leader />
                <TeamBadge team={row.team} size="xs" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12.5px] leading-normal text-ink-2">
        숫자 = 최근 경기 출전 분
      </p>
    </>
  );
}
