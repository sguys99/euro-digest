import Link from "next/link";

import { KoreanArmband } from "@/components/news/feed-card";
import { NewsFeed } from "@/components/news-feed";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { TeamLookup } from "@/lib/competition-view";
import { statText } from "@/lib/competition-view";
import { issueNumber } from "@/lib/issue";
import { routes } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import type { StandingRow } from "@/lib/schema/competition";
import type { NewsFile } from "@/lib/schema/news";
import type { Team } from "@/lib/schema/team";
import { FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";
import type { KeyPlayerView, RelatedIssue } from "@/lib/team-view";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";

import { TeamBadge } from "./team-badge";
import { TeamName } from "./team-link";

/**
 * 팀 화면 조각 — 득점·도움 상위(주요 선수) · 리그 맥락 · 관련 뉴스 · 더 읽을거리 · 데이터 출처 줄 (DESIGN §9.3 "득점·도움 상위"·
 * "팀 화면 틀 · 리그 맥락", PRD FR-54·FR-57·FR-45, plan M2-13). 서버 컴포넌트.
 */

const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

// ─── 득점·도움 상위 (FR-54) ─────────────────────────────────────────────────

export interface KoreanKeyPlayer {
  slug: string;
  name: string;
  position: string;
  /** 대표 대회 득점 순위에 있으면 골·도움, 없으면 null(자료 없음) */
  goals: number | null;
  assists: number | null;
}

/**
 * 주요 선수 — 득점·도움 상위 3명(대표 대회 득점 순위 — 시즌 누적, M2-06) + 소속 한국 선수.
 * 행 `28px · 1fr · auto · auto`: 순위(Barlow 800 22px, 목록 순서라 `aria-hidden` + 화면 밖 "n위") · 이름 800 14px · 골 · 도움(Barlow 800 22px + 단위 12px).
 * 도움 자료가 없으면 "–"(0으로 바꾸지 않는다). 한국 선수 행은 레드 띠 + 완장(팀시트 한국 행과 같은 표식).
 */
export function KeyPlayers({
  headingId,
  players,
  korean,
  scope,
}: {
  headingId: string;
  players: readonly KeyPlayerView[];
  korean: readonly KoreanKeyPlayer[];
  /** 부제 — "분데스리가 시즌 누적 · 10.30 기준" */
  scope: string;
}) {
  return (
    <section aria-labelledby={headingId} data-slot="team-key-players">
      <SectionHead
        heading="득점·도움 상위"
        headingId={headingId}
        runningHead="KEY PLAYERS"
      />
      <p className="mt-0.75 text-[13px] text-ink-2">{scope}</p>
      {players.length > 0 ? (
        <>
          <p
            aria-hidden="true"
            className="mt-1.5 grid grid-cols-[28px_minmax(0,1fr)_52px_60px] gap-x-1.5 border-b border-ink pt-2 pb-1 text-[13px] font-extrabold text-ink-2 *:last:text-right *:nth-3:text-right"
          >
            <span />
            <span>선수</span>
            <span>득점</span>
            <span>도움</span>
          </p>
          <ol role="list" aria-label="팀 내 득점 상위">
            {players.map((p) => (
              <li
                key={`${p.rank}-${p.name}`}
                className="grid grid-cols-[28px_minmax(0,1fr)_52px_60px] items-center gap-x-1.5 border-b border-rule py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="font-numeric text-[22px] leading-[0.9] font-extrabold tabular-nums"
                >
                  {p.rank}
                </span>
                <span className="text-sm leading-[1.25] font-extrabold">
                  <span className="sr-only">{p.rank}위 </span>
                  <span lang={p.latin ? "en" : undefined}>{p.name}</span>
                </span>
                <Stat value={p.goals} unit="골" />
                <Stat value={p.assists} unit="도움" />
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {korean.length > 0 ? (
        <>
          <h3 className="mt-4 border-b border-ink pt-2 pb-1 text-[13px] font-extrabold text-ink-2">
            한국 선수
          </h3>
          <ul role="list">
            {korean.map((p) => (
              <li
                key={p.slug}
                className="grid grid-cols-[28px_minmax(0,1fr)_52px_60px] items-center gap-x-1.5 border-b border-rule bg-paper-2 py-2.5 shadow-[inset_4px_0_0_var(--brand-accent)]"
              >
                <span />
                <span className="flex flex-wrap items-center gap-1.5 text-sm leading-[1.25] font-extrabold">
                  {p.name}
                  <KoreanArmband title="한국 선수" />
                  <span className="font-numeric text-[12.5px] font-semibold tracking-[0.06em] text-ink-2">
                    {p.position}
                  </span>
                </span>
                <Stat value={p.goals} unit="골" />
                <Stat value={p.assists} unit="도움" />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Stat({ value, unit }: { value: number | null; unit: string }) {
  return (
    <span className="text-right text-xs whitespace-nowrap text-ink-2">
      <b className="mr-0.5 font-numeric text-[22px] leading-none font-extrabold text-ink tabular-nums">
        {statText(value)}
      </b>
      {value === null ? (
        <span className="sr-only">{unit} 자료 없음</span>
      ) : (
        unit
      )}
    </span>
  );
}

// ─── 리그 맥락 ──────────────────────────────────────────────────────────────

/**
 * 리그 맥락 — "{대회} 순위" 얇은 섹션 머리 + 이 팀 앞뒤 2팀(행 `24px · auto · 1fr · auto`, 최소 44px). 행 = 대회 순위표 행 앵커 링크
 * (`/competitions/{comp}/#{팀}` — 도착 강조 `:target`, DECISIONS D1 §5 #9). 이 팀 행은 `--paper-2` + 왼쪽 4px `--brand-accent` + 800.
 * 아래 "전체 순위 ›".
 */
export function LeagueContext({
  headingId,
  comp,
  title,
  rows,
  self,
  lookup,
}: {
  headingId: string;
  comp: CompId;
  title: string;
  rows: readonly StandingRow[];
  self: string;
  lookup: TeamLookup;
}) {
  const href = routes.competition(comp);
  return (
    <section aria-labelledby={headingId} data-slot="league-context">
      <SectionHead thin heading={title} headingId={headingId} />
      <ol role="list" className="mt-2">
        {rows.map((row) => {
          const team = lookup(row.team);
          const me = row.team === self;
          return (
            <li key={row.team}>
              <Link
                href={`${href}#${row.team}`}
                aria-current={me ? "true" : undefined}
                className={cn(
                  "group/lc grid min-h-11 grid-cols-[24px_auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule text-sm text-ink no-underline",
                  me &&
                    "bg-paper-2 pl-2 font-extrabold shadow-[inset_4px_0_0_var(--brand-accent)]",
                )}
              >
                <span className="font-numeric text-lg leading-none font-extrabold tabular-nums">
                  {row.pos}
                  <span className="sr-only">위</span>
                </span>
                <TeamBadge team={team} size="xs" />
                <span className="min-w-0 decoration-brand-accent decoration-2 underline-offset-3 group-hover/lc:underline">
                  <TeamName team={team} />
                  {me ? <span className="sr-only"> (이 팀)</span> : null}
                </span>
                <span className="font-numeric text-lg leading-none font-extrabold tabular-nums">
                  {row.pts}
                  <span className="sr-only">점</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Link href={href} className={TEXT_LINK}>
        전체 순위
        <ChevronRightIcon size={16} />
      </Link>
    </section>
  );
}

// ─── 관련 뉴스 (FR-57) ──────────────────────────────────────────────────────

/**
 * 관련 뉴스 — 최근 30일 호의 카드 중 이 팀 카드(새 모티프 없이 뉴스 카드 피드 그대로). 공유 링크·오류 신고가 그 호 날짜를 쓰므로 호별로
 * 피드를 나누고(게재 번호는 그 호 순서 유지), 묶음마다 날짜 머리 = 그 호 아카이브 링크. 부제(건수·게재 번호 안내)는 섹션에 한 번.
 */
export function RelatedNews({
  headingId,
  issues,
  teamName,
}: {
  headingId: string;
  issues: readonly RelatedIssue<NewsFile>[];
  teamName: string;
}) {
  const count = issues.reduce((n, g) => n + g.ids.length, 0);
  return (
    <section aria-labelledby={headingId} data-slot="team-news">
      <SectionHead
        heading="관련 뉴스"
        headingId={headingId}
        runningHead="NEWS"
      />
      {count === 0 ? (
        <div className="pt-7 pb-2">
          <p className="text-[15px] font-extrabold">
            최근 30일 동안 이 팀 소식이 없어요.
          </p>
          <p className="mt-2 text-[13.5px] text-ink-2">
            새 호에 {teamName} 소식이 실리면 이곳에 모입니다.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-0.75 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
            <span>
              <span className="tabular-nums">{count}</span>건 · 최근 30일 · 최신
              호부터
            </span>
            <span className="text-xs">
              작은 번호는 그 호의 게재 번호(순위 아님)
            </span>
          </p>
          {issues.map(({ news, ids }) => {
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
                  id={`team-feed-${news.date}`}
                  titleAs="h3"
                  scope={{
                    match: (card) => keep.has(card.id),
                    desc: teamName,
                    empty: "",
                  }}
                />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/** 더 읽을거리(FR-57 — 분석 블로그 링크). 빈 배열이면 섹션을 두지 않는다(호출부) */
export function Reading({
  headingId,
  items,
}: {
  headingId: string;
  items: Team["reading"];
}) {
  return (
    <section aria-labelledby={headingId} data-slot="team-reading">
      <SectionHead thin heading="더 읽을거리" headingId={headingId} />
      <ul role="list" className="mt-2">
        {items.map((item) => (
          <li key={item.url} className="border-b border-rule py-1">
            <a
              href={item.url}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-[15px] leading-[1.35] font-extrabold text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              <span lang="en">{item.title}</span>
              <span className="text-[12.5px] font-normal text-ink-2">
                {item.source}
              </span>
              <span aria-hidden="true">↗</span>
              <span className="sr-only">(새 창)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── 데이터 출처 줄 (FR-45) ─────────────────────────────────────────────────

/**
 * 팀 화면 출처 줄 — 대회 페이지(`CompetitionSource`)와 같은 문구 + 팀시트·포메이션 API-Football 병기(FR-45 권장, D27). `updatedAt`이 36시간
 * 이상 지났으면 "업데이트 지연"(대회 페이지와 같은 기준 — M2-16에서 확정).
 */
export function TeamSource({
  updatedAt,
  stale,
  apiFootball,
}: {
  updatedAt: string | null;
  stale: boolean;
  /** 팀시트·포메이션(API-Football 라인업)을 실었는가 */
  apiFootball: boolean;
}) {
  return (
    <p
      data-slot="team-source"
      className="mt-9 text-[12.5px] leading-normal text-ink-2"
    >
      <b className="font-extrabold text-ink">데이터</b> football-data.org —
      순위·경기·득점
      {updatedAt ? (
        <>
          {" "}
          <time dateTime={updatedAt}>
            {formatKst(updatedAt, "short")} KST
          </time>{" "}
          갱신
        </>
      ) : null}
      {stale ? (
        <>
          {" "}
          ·{" "}
          <b className="font-extrabold text-brand-accent-text">업데이트 지연</b>
        </>
      ) : null}
      {apiFootball ? <> · 팀시트·포메이션 API-Football</> : null} ·{" "}
      <span lang="en">{FOOTBALL_DATA_ATTRIBUTION}</span>
    </p>
  );
}
