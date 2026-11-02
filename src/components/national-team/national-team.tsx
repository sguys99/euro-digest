import Link from "next/link";

import { Leader } from "@/components/about/leader";
import { ResultChip, Score } from "@/components/competition/marks";
import { PlayerLink } from "@/components/korean-players/player-marks";
import { NewsRows } from "@/components/news/news-row";
import { TeamBadge } from "@/components/team/team-badge";
import { IcsLink } from "@/components/ui/ics-link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { TeamView } from "@/lib/competition-view";
import { cx } from "@/lib/cx";
import { nationalIcsFeed } from "@/lib/ics-links";
import type {
  NationalHomeData,
  NationalNewsView,
} from "@/lib/data/national-page";
import type {
  NationalMatchRowView,
  NationalSourceLink,
  NationalSquadView,
} from "@/lib/national-team-view";
import type { CardTagView } from "@/lib/news/feed-view";
import { routes } from "@/lib/paths";
import type { PlayerNewsItem } from "@/lib/player-detail-view";
import { formatKst } from "@/lib/time";
import { SpoilerCellButton } from "@/components/spoiler/spoiler-parts";

/**
 * 대표팀 구역 — 일정 · 결과 행 · 소집 명단 · 대표팀 소식 · 근거 줄 · 홈 A매치 섹션 (PRD FR-70~73, DESIGN §9.3 D2 "`/national-team` 틀" ·
 * "홈 위젯 (D2)" A매치, DECISIONS D2 §5 #4 · §6 #8 · §8, plan M3-13)
 *
 * 서버 컴포넌트 — JS 0. 혼합안은 일정 · 소집 명단을 자리(데이터 대기)로만 그렸다 — 값은 기존 문법으로 채운다(새 모티프 없음):
 * - **일정 · 결과 행** = D1 팀 일정 행(`--gutter · 1fr · auto` — 거터 날짜 + 요일 · 대회 줄 · 오른쪽 결과/킥오프)에 선수 상세 일정 행의
 *   홈/원정 두 줄(경기 기준 — 홈 팀 먼저, D1 · D30). 국가대표팀 배지는 없다(팀 컬러 표에 국가가 없다 — 이미지 자산 금지). 결과는 스코어
 *   (홈-원정 순) + 한국 기준 결과 칩(D1 팀 일정과 같다)을 `data-slot="result-value"`로 묶는다(결과 가리기 M4-15).
 * - **소집 명단** = 목차 명단 행 문법(이름 · 리더 점선 · 배지 + 소속팀) — 이름은 선수 상세 링크(FR-73, 누름 영역 44px).
 * - **뉴스 행** = 선수 상세 옆단 뉴스 행 + 태그 줄 · 한국 완장(혼합안 홈 A매치 행).
 * 데이터가 없는 구역은 페이지가 숨긴다(자리 상자 없음 — DECISIONS D2 §6 #8).
 */

const SUB = "mt-0.75 text-[13px] leading-normal text-ink-2 tabular-nums";

/** 구역 끝 텍스트 링크 — 홈 위젯 링크와 같은 모양(13px 800 `--brand-accent-text` 밑줄, 누름 영역 44px) */
export const NATIONAL_LINK =
  "inline-flex min-h-11 min-w-11 items-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

// ─── 일정 · 결과 ────────────────────────────────────────────────────────────

function MatchSide({ name, side }: { name: string; side: "홈" | "원정" }) {
  return (
    <span className="flex items-baseline gap-2 text-[15px] leading-[1.25] font-extrabold">
      <span className="sr-only">{side} </span>
      <span className="min-w-0">{name}</span>
      <span
        aria-hidden="true"
        className="text-[11.5px] font-normal whitespace-nowrap text-ink-2"
      >
        {side}
      </span>
    </span>
  );
}

function MatchResult({ row }: { row: NationalMatchRowView }) {
  if (row.state === "finished" && row.score) {
    // 결과 가림 칸(M4-15): 가림이 켜지면 스코어·결과 칩 대신 "보기" 칸 — 펼치는 단위는 이 줄(li)
    return (
      <>
        <SpoilerCellButton
          label={`${row.date} ${row.koreaHome ? row.away : row.home}전 결과 보기`}
        />
        <span
          data-slot="result-value"
          className="grid justify-items-end gap-1.25"
        >
          <Score
            h={row.score.h}
            a={row.score.a}
            className="font-numeric text-2xl leading-none tracking-[0.04em] tabular-nums"
          />
          <span className="sr-only"> (홈-원정 순 스코어) 대한민국 </span>
          {row.result ? <ResultChip result={row.result} /> : null}
        </span>
      </>
    );
  }
  if (row.state === "scheduled") {
    // 경기별 .ics(M4-12) — 예정 행만(src/lib/ics-links.ts `nationalIcsFeed`)
    const ics = nationalIcsFeed(row);
    return (
      <>
        {row.time ? (
          <time
            dateTime={row.kickoff}
            className="font-numeric text-[22px] leading-none font-extrabold tabular-nums"
          >
            {row.time}
          </time>
        ) : (
          <span className="text-[15px] leading-none font-extrabold">미정</span>
        )}
        <span className="text-[11.5px] text-ink-2">
          {row.time ? "예정 · KST" : "킥오프 시각 미정"}
        </span>
        {ics ? (
          <IcsLink
            feed={ics}
            label=".ics"
            context={`${row.home} 대 ${row.away} 경기 캘린더에 추가`}
            variant="compact"
            className="-mr-0.5"
          />
        ) : null}
      </>
    );
  }
  return (
    <span className="match-state">
      {row.state === "pending" ? "결과 대기" : "연기"}
    </span>
  );
}

/** 일정 · 결과 한 줄(경기 기준 — 홈 팀 먼저) */
export function NationalMatchRow({ row }: { row: NationalMatchRowView }) {
  return (
    <li
      data-slot="national-match"
      data-state={row.state}
      {...(row.state === "finished" && row.score
        ? { "data-spoil": "stamp" }
        : {})}
      className="grid grid-cols-[var(--gutter)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule py-3"
    >
      <div className="grid gap-0.75 self-start pt-0.5">
        <time
          dateTime={row.kickoff}
          className="font-numeric text-[19px] leading-[0.9] font-extrabold tracking-[-0.01em] whitespace-nowrap tabular-nums"
        >
          {row.date}
        </time>
        <span className="text-[11.5px] font-extrabold text-ink-2">
          {row.weekday}
        </span>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] leading-[1.3] text-ink-2">
          <span className="font-extrabold text-ink">{row.competition}</span>
          {row.venue ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{row.venue}</span>
            </>
          ) : null}
        </p>
        <p className="grid gap-1.5">
          <MatchSide name={row.home} side="홈" />
          <MatchSide name={row.away} side="원정" />
        </p>
      </div>
      <div className="grid justify-items-end gap-1.25 text-right">
        <MatchResult row={row} />
      </div>
    </li>
  );
}

/** 일정 · 결과 목록(킥오프 순) — 위 1px `--rule` */
export function NationalMatchList({
  rows,
  label,
  className,
}: {
  rows: readonly NationalMatchRowView[];
  label: string;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cx("mt-2 border-t border-rule", className)}
    >
      {rows.map((row) => (
        <NationalMatchRow key={row.id} row={row} />
      ))}
    </ol>
  );
}

export function NationalSchedule({
  id,
  rows,
}: {
  id: string;
  rows: readonly NationalMatchRowView[];
}) {
  const headingId = `${id}-h`;
  const done = rows.filter((r) => r.state === "finished").length;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="national-schedule"
      className="scroll-mt-4"
    >
      <SectionHead
        heading="일정·결과"
        headingId={headingId}
        runningHead="FIXTURES"
      />
      <p className={SUB}>
        KST · 스코어는 홈-원정 순 · {rows.length}경기
        {done > 0 ? ` 중 ${done}경기 결과` : ""}
      </p>
      <NationalMatchList rows={rows} label="한국 대표팀 경기 — 킥오프 순" />
    </section>
  );
}

// ─── 소집 명단 ──────────────────────────────────────────────────────────────

/** 소집 선수 한 줄 — 이름(선수 상세 링크) · 포지션 · 리더 점선 · 배지 + 소속팀 */
function SquadRow({
  player,
}: {
  player: NationalSquadView<TeamView>["players"][number];
}) {
  return (
    <li
      data-slot="squad-player"
      data-player={player.slug}
      className="flex min-h-11 items-center gap-2 border-b border-rule py-1.5"
    >
      <span className="flex min-w-0 items-baseline gap-1.75">
        <span className="text-[15px] leading-[1.25] font-extrabold">
          <PlayerLink slug={player.slug}>{player.nameKo}</PlayerLink>
        </span>
        <span className="font-numeric text-[12.5px] font-semibold tracking-[0.04em] text-ink-2">
          {player.position}
        </span>
      </span>
      <Leader />
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] leading-[1.3] text-ink-2">
        <TeamBadge team={player.team} size="xs" />
        <span lang={player.team.latin ? "en" : undefined}>
          {player.team.name}
        </span>
      </span>
    </li>
  );
}

export function NationalSquad({
  id,
  squad,
  sideAtXl = false,
}: {
  id: string;
  squad: NationalSquadView<TeamView>;
  /** 1280 이상 옆단(얇은 머리 · 한 열) */
  sideAtXl?: boolean;
}) {
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="national-squad"
      className="scroll-mt-4"
    >
      <SectionHead
        heading="소집 명단"
        headingId={headingId}
        runningHead="SQUAD"
        sideAtXl={sideAtXl}
      />
      <p className={SUB}>
        {squad.label} ·{" "}
        <time dateTime={squad.announcedAt}>
          {formatKst(squad.announcedAt, "monthDay")}
        </time>{" "}
        발표 · 등록 한국 선수 {squad.players.length}명
      </p>
      <ul
        role="list"
        aria-label={`${squad.label} — 등록 한국 선수`}
        className={cx(
          "mt-2 border-t border-rule",
          !sideAtXl && "lg:grid lg:grid-cols-2 lg:gap-x-8",
        )}
      >
        {squad.players.map((p) => (
          <SquadRow key={p.slug} player={p} />
        ))}
      </ul>
      <p className="mt-2.5 text-[12.5px] leading-[1.45] text-ink-2">
        이 사이트에 등록된 한국 선수 중 소집된 선수만 실었어요 — 전체 소집
        명단이 아니에요.
      </p>
    </section>
  );
}

// ─── 대표팀 소식(한국) · 주요국 ─────────────────────────────────────────────

function countText(news: NationalNewsView): string {
  return news.items.length < news.total
    ? `최근 30일 ${news.total}건 중 최신 ${news.items.length}건`
    : `최근 30일 ${news.total}건`;
}

export function NationalNews({
  id,
  news,
  tagsOf,
  sideAtXl = false,
}: {
  id: string;
  news: NationalNewsView;
  tagsOf: (item: PlayerNewsItem) => readonly CardTagView[];
  sideAtXl?: boolean;
}) {
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="national-kr-news"
      className="scroll-mt-4"
    >
      <SectionHead
        heading="대표팀 소식"
        headingId={headingId}
        runningHead="NATIONAL"
        sideAtXl={sideAtXl}
      />
      <p className={SUB}>
        한국 대표팀 기사 · 원제목 그대로 · {countText(news)}
      </p>
      <NewsRows
        items={news.items}
        idPrefix={id}
        label="대표팀 소식 기사 — 최신순"
        tagsOf={tagsOf}
        armband
      />
    </section>
  );
}

// ─── 근거 줄 ────────────────────────────────────────────────────────────────

/**
 * 일정 · 결과 · 소집 명단 출처 줄 — 데이터 API가 아니라 사람이 적는 설정(FR-70 수동 관리)이라 football-data 출처 줄(DataSourceNote)과
 * 나눈다. 같은 글자 크기 · 색(12.5px `--ink-2`, 머리말 800 `--ink`). 근거(설정 `sourceUrl`)는 외부 링크(새 창 + ↗ + 화면 밖 "(새 창)").
 */
export function NationalSourceNote({
  links,
  className,
}: {
  links: readonly NationalSourceLink[];
  className?: string;
}) {
  return (
    <p
      data-slot="national-source"
      className={cx("text-[12.5px] leading-normal text-ink-2", className)}
    >
      <b className="font-extrabold text-ink">일정·결과·소집 명단</b> 발표와
      보도를 보고 직접 정리해요
      {links.length > 0 ? (
        <>
          {" "}
          — 근거{" "}
          {links.map((link, i) => (
            <span key={link.url}>
              {i > 0 ? " · " : null}
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-4 hover:text-ink hover:decoration-2"
              >
                <span className="tabular-nums">{link.label}</span>
                <span aria-hidden="true">&nbsp;↗</span>
                <span className="sr-only"> (새 창)</span>
              </a>
            </span>
          ))}
        </>
      ) : null}
    </p>
  );
}

// ─── 홈 A매치 섹션(FR-71) ───────────────────────────────────────────────────

/**
 * 홈 A매치 — A매치 기간(빌드 시각 KST 날짜가 경기일 ±3일)에만. 얇은 섹션 머리 "A매치" + NATIONAL TEAM → 부제 → 그 기간 경기(일정 행) →
 * 소집 선수(이름 = 선수 상세 링크) → 대표팀 뉴스 행 3장 → "대표팀 소식 n건 ›"(`/national-team/`). 기간이 아니면 페이지가 그리지 않는다.
 */
export function NationalHome({
  data,
  headingId,
  tagsOf,
  className,
}: {
  data: NationalHomeData;
  headingId: string;
  tagsOf: (item: PlayerNewsItem) => readonly CardTagView[];
  className?: string;
}) {
  const { rows, squad, news } = data;
  return (
    <section
      aria-labelledby={headingId}
      data-slot="home-national"
      className={className}
    >
      <SectionHead
        heading="A매치"
        headingId={headingId}
        runningHead="NATIONAL TEAM"
        thin
      />
      <p className={SUB}>
        {squad ? `${squad.label} · ` : ""}
        {rows.length}경기 · KST · 스코어는 홈-원정 순
      </p>
      <NationalMatchList rows={rows} label="이번 A매치 기간 경기 — 킥오프 순" />
      {squad && squad.players.length > 0 ? (
        <div data-slot="home-national-squad" className="mt-3">
          <p className="text-[13px] font-extrabold">
            소집된 등록 한국 선수{" "}
            <span className="font-numeric tabular-nums">
              {squad.players.length}
            </span>
            명
          </p>
          <ul
            role="list"
            aria-label={`${squad.label} — 등록 한국 선수`}
            className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-1"
          >
            {squad.players.map((p) => (
              <li
                key={p.slug}
                className="flex min-h-11 items-center gap-1.5 text-[15px] font-extrabold"
              >
                <TeamBadge team={p.team} size="xs" />
                <PlayerLink slug={p.slug}>{p.nameKo}</PlayerLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {news.items.length > 0 ? (
        <NewsRows
          items={news.items}
          idPrefix={`${headingId}-n`}
          label="대표팀 소식 기사 — 최신순"
          tagsOf={tagsOf}
          armband
          className="mt-3"
        />
      ) : null}
      <p className="mt-1 flex justify-end">
        <Link href={routes.nationalTeam()} className={NATIONAL_LINK}>
          {news.total > 0 ? `대표팀 소식 ${news.total}건` : "대표팀 일정·명단"}
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </section>
  );
}
