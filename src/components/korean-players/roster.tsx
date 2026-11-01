import Link from "next/link";

import { FormChip } from "@/components/competition/marks";
import { Leader } from "@/components/about/leader";
import { TeamBadge } from "@/components/team/team-badge";
import { FlatTab } from "@/components/ui/chip";
import { SectionHead } from "@/components/ui/section-head";
import type {
  RosterGroupView,
  RosterRowView,
  RosterView,
} from "@/lib/korean-players-view";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";
import { formatKst } from "@/lib/time";

import {
  CompTag,
  MinutesGutter,
  NUMBER_TONE,
  OpponentName,
  OtherTab,
  PlayerLink,
  ResultCell,
  StateStamp,
} from "./player-marks";
import { RosterViews } from "./roster-views";

/**
 * 한국 선수 명단 표 — `/korean-players/` (PRD FR-61·FR-64·FR-65, DESIGN §9.3 D2 "선수 명단 행"·"출전 분 거터"·"결과 칸", DECISIONS D2 §4 A,
 * plan M3-09). 시안 `docs/design/d2/concept-mix.html` 화면 1 목록.
 *
 * 서버 컴포넌트 — D1 순위표와 같은 `<table>` 한 장. 리그 구간 머리(`tbody` 첫 줄 — 위 2px `--ink` + 평탄 탭 + 리그명 15px 800 + "n명")
 * 아래 선수 행: 출전 분 거터 · 선수(이름 16.5px 800 + 포지션 + 배지 xs + 팀) · 최근 경기(1024 이상 일시·대회 · 상대) · 결과 칸 · 시즌 누적 4열 ·
 * (1024 이상) UCL · 다음 경기(KST). 1023 이하는 보기 탭(섬 `roster-views.tsx`)이 `data-col` 열 묶음만 바꾼다(globals.css §12 — 가로 스크롤 없음).
 * 선수 이름은 상세 페이지 링크(M3-10 — `PlayerLink`, 누름 영역 44px). 소속팀 이름은 글자(M3-10 — M3-09의 팀 화면 링크는 이름 링크와 누름 영역이
 * 겹쳐 뺐다, 팀 화면은 선수 상세 티켓에서).
 */

export const ROSTER_TABLE_ID = "kp-list";

/** 열 수(구간 머리 colSpan) — 거터 · 선수 · 일시 · 상대 · 결과 · 출전 · 분 · 골 · 도움 · UCL · 다음 */
const COLUMNS = 11;

/** JS가 없으면 보기 탭을 숨긴다(최근 경기 보기 그대로 — 섬 머리 주석) */
const NOSCRIPT_STYLE =
  "<style>[data-slot=roster-tabs]{display:none!important}</style>";

/** 시즌 누적·UCL 칸 숫자 — N5 Barlow 600, 0은 `--ink-2`(18px 이하 표 숫자 — 윤곽 대신), null은 대시 */
function StatNum({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true" className="text-ink-2">
          –
        </span>
        <span className="sr-only">기록 없음</span>
      </>
    );
  }
  return (
    <span
      className={cx(
        "font-numeric text-num-n5 leading-none font-semibold tracking-[0.01em] tabular-nums",
        value === 0 && "text-ink-2",
      )}
    >
      {value}
    </span>
  );
}

const TH =
  "px-1 pt-2.25 pb-1.5 align-bottom text-xs font-extrabold whitespace-nowrap text-ink-2 border-b border-ink";
const TD =
  "border-b border-rule px-1 pt-2.25 pb-2 align-top lg:px-1.5 lg:py-3 lg:align-middle";
/** 시즌 누적 칸 — 1024 이상 첫 칸 왼쪽에 1px `--rule`(열 묶음 구분) */
const SEASON_TD = `${TD} w-9 px-0.5 text-right whitespace-nowrap lg:w-10`;

function UclCell({ row }: { row: RosterRowView }) {
  if (!row.ucl) {
    return (
      <>
        <span aria-hidden="true" className="text-[12.5px] text-ink-2">
          –
        </span>
        <span className="sr-only">UCL 기록 없음</span>
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-2 xl:flex-nowrap xl:whitespace-nowrap">
      <FlatTab comp="UCL" title="UEFA 챔피언스리그">
        UCL
      </FlatTab>
      <b className="font-extrabold text-ink">
        출전 <span className="font-numeric tabular-nums">{row.ucl.apps}</span>
      </b>
      {row.ucl.minutes !== null ? (
        <span className="font-numeric tabular-nums">{row.ucl.minutes}분</span>
      ) : null}
    </span>
  );
}

function RecentCells({ row }: { row: RosterRowView }) {
  const r = row.recent;
  if (!r) {
    const stamp =
      row.state === "not-linked"
        ? "기록 연결 전"
        : row.state === "other"
          ? "갱신 중단"
          : null;
    const note =
      row.state === "not-linked"
        ? "경기 기록이 아직 연결되지 않았어요"
        : row.state === "linked"
          ? "집계 시작 뒤 경기가 없어요"
          : null;
    return (
      <td data-col="recent" colSpan={3} className={cx(TD, "text-left")}>
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {stamp ? <StateStamp>{stamp}</StateStamp> : null}
          {note ? (
            <span
              className={cx(
                "text-[12.5px] leading-normal text-ink-2",
                stamp && "hidden lg:inline",
              )}
            >
              {note}
            </span>
          ) : null}
        </span>
      </td>
    );
  }
  const day = formatKst(r.kickoff, "dayShort");
  return (
    <>
      <td
        data-col="recent"
        className={cx(TD, "hidden w-22.5 text-left lg:table-cell")}
      >
        <span className="grid justify-items-start gap-1.25">
          <time
            dateTime={r.kickoff}
            className="font-numeric text-[14.5px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap tabular-nums"
          >
            {day}
          </time>
          <CompTag comp={r.comp} />
        </span>
      </td>
      <td
        data-col="recent"
        className={cx(
          TD,
          // 상대 칸 최소 150px는 1280 이상만 — 1024~1279 지면(728~983px)에서 11열이 넘치지 않게 팀명을 어절로 접는다
          "hidden text-left text-sm leading-[1.25] font-extrabold [overflow-wrap:normal] lg:table-cell xl:min-w-37.5",
        )}
      >
        <OpponentName opponent={r.opponent} />
      </td>
      <td data-col="recent" className={cx(TD, "pr-0 text-right lg:w-19")}>
        <ResultCell
          result={r.result}
          home={r.home}
          goals={r.goals}
          assists={r.assists}
        />
        {/* 1023 이하 — 결과 아래 날짜 · 상대(1024 이상은 앞 두 칸) */}
        <span className="mt-1.25 ml-auto block max-w-[13.5em] text-xs leading-[1.3] text-ink-2 lg:hidden">
          <time
            dateTime={r.kickoff}
            className="font-numeric text-[12.5px] font-semibold tabular-nums"
          >
            {formatKst(r.kickoff, "monthDay")}
          </time>{" "}
          <span lang={r.opponent.latin ? "en" : undefined}>
            {r.opponent.name}
          </span>
        </span>
      </td>
    </>
  );
}

function NextCell({ row }: { row: RosterRowView }) {
  const n = row.next;
  if (!n) {
    return (
      <td data-col="next" className={cx(TD, "pr-0 text-right lg:w-37.5")}>
        <span aria-hidden="true" className="text-ink-2">
          –
        </span>
        <span className="sr-only">
          {row.state === "other" ? "기록 갱신 중단" : "예정된 경기 없음"}
        </span>
      </td>
    );
  }
  return (
    <td data-col="next" className={cx(TD, "pr-0 text-right lg:w-37.5")}>
      <span className="grid justify-items-end gap-1.25">
        <time dateTime={n.kickoff} className="grid justify-items-end gap-1.25">
          <span className="font-numeric text-[17px] leading-none font-extrabold tracking-[0.01em] tabular-nums">
            {formatKst(n.kickoff, "time")}
          </span>
          <span className="font-numeric text-[12.5px] leading-none font-semibold text-ink-2 tabular-nums">
            {formatKst(n.kickoff, "dayShort")}
          </span>
        </time>
        <span className="flex flex-wrap items-center justify-end gap-x-1.25 gap-y-1 text-right text-[12.5px] leading-[1.3] text-ink-2">
          <CompTag comp={n.comp} />
          <b
            className="font-extrabold text-ink"
            lang={n.opponent.latin ? "en" : undefined}
          >
            {n.opponent.name}
          </b>
          <span className="whitespace-nowrap">{n.home ? "홈" : "원정"}</span>
        </span>
      </span>
    </td>
  );
}

function RosterRow({ row }: { row: RosterRowView }) {
  const season = row.season;
  return (
    <tr data-player={row.slug} data-state={row.state}>
      <td className={cx(TD, "w-gutter-date pl-0 text-left lg:pl-0.5")}>
        <MinutesGutter appearance={row.appearance} />
      </td>
      <th
        scope="row"
        className={cx(TD, "min-w-37.5 pr-2 text-left font-normal lg:w-41.5")}
      >
        <span className="grid min-w-0 gap-1">
          <span className="flex flex-wrap items-baseline gap-x-1.75 gap-y-0.5 text-[16.5px] leading-[1.22] font-extrabold tracking-[-0.02em]">
            <PlayerLink slug={row.slug}>{row.nameKo}</PlayerLink>
            <span className="font-numeric text-[12.5px] font-semibold tracking-[0.04em] text-ink-2">
              {row.position}
            </span>
          </span>
          {/* 소속팀은 글자(M3-10 — 이름 링크와 위아래로 붙어 두 누름 영역 44px이 겹친다. 팀 화면은 선수 상세 티켓의 "팀 화면" 링크로) */}
          <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.3] text-ink-2">
            <TeamBadge team={row.team} size="xs" />
            <span lang={row.team.latin ? "en" : undefined}>
              {row.team.name}
            </span>
          </span>
          {row.sinceNote ? (
            <span className="text-xs leading-[1.35] text-ink-2">
              {row.sinceNote}
            </span>
          ) : null}
          {/* 1279 이하 — UCL 칸 대신 이름 아래 한 줄(1023 이하는 시즌 누적 보기에서만, 1024~1279는 늘 — 11열이 지면에 들어가지 않는다) */}
          {row.ucl ? (
            <span data-col="season" className="xl:hidden">
              <UclCell row={row} />
            </span>
          ) : null}
        </span>
      </th>
      <RecentCells row={row} />
      <td
        data-col="season"
        className={cx(SEASON_TD, "lg:border-l lg:border-l-rule")}
      >
        <StatNum value={season ? season.apps : null} />
      </td>
      <td data-col="season" className={SEASON_TD}>
        <StatNum value={season ? season.minutes : null} />
      </td>
      <td data-col="season" className={SEASON_TD}>
        <StatNum value={season ? season.goals : null} />
      </td>
      <td data-col="season" className={cx(SEASON_TD, "pr-0 lg:pr-1.5")}>
        <StatNum value={season ? season.assists : null} />
      </td>
      <td className={cx(TD, "hidden w-23 pl-3 text-left xl:table-cell")}>
        <UclCell row={row} />
      </td>
      <NextCell row={row} />
    </tr>
  );
}

function GroupHead({
  group,
  first,
}: {
  group: RosterGroupView;
  /** 첫 구간 — 표 머리 줄 바로 아래라 위 괘선을 두지 않는다 */
  first: boolean;
}) {
  return (
    <tr>
      <th
        scope="rowgroup"
        id={group.anchor}
        colSpan={COLUMNS}
        className={cx(
          "scroll-mt-4 border-b border-b-rule pb-1.75 text-left",
          first ? "pt-3" : "border-t-2 border-t-ink pt-4",
        )}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-extrabold tracking-[-0.01em]">
          {group.key === "OTHER" ? (
            <OtherTab title="5대 리그 밖" />
          ) : (
            <FlatTab comp={group.key} title={group.label} aria-hidden="true">
              {group.short}
            </FlatTab>
          )}
          <span>{group.label}</span>
          <span className="ml-0.5 font-numeric text-[15px] leading-none font-semibold tracking-[0.02em] text-ink-2 tabular-nums">
            {group.rows.length}명
          </span>
          {group.key === "OTHER" ? (
            <span className="ml-auto text-[12.5px] font-normal text-ink-2">
              5대 리그 밖 — 기록 갱신 중단
            </span>
          ) : null}
        </span>
      </th>
    </tr>
  );
}

/** 명단 표 + 보기 탭 + 범례 */
export function RosterTable({
  view,
  headingId,
}: {
  view: RosterView;
  headingId: string;
}) {
  // 집계 시작일은 날짜 값(UTC 날짜 — 시각 변환 없음) → "10.19"
  const since = view.since ? view.since.slice(5).replace("-", ".") : null;
  return (
    <>
      <RosterViews tableId={ROSTER_TABLE_ID}>
        <table
          id={ROSTER_TABLE_ID}
          aria-labelledby={headingId}
          className="mt-0.5 w-full text-sm"
        >
          <caption className="sr-only">
            한국 선수 명단 — 리그별. 첫 열은 가장 최근 경기의 출전 분과 출전
            상태. 결과는 그 선수 소속팀 득점이 먼저.
            {view.sinceLabel ? ` 시즌 누적은 ${view.sinceLabel}.` : ""} 시각은
            한국 시간.
          </caption>
          <thead>
            <tr className="hidden lg:table-row">
              <td colSpan={2} className="p-0" />
              <th
                scope="colgroup"
                colSpan={3}
                className="px-1 pt-3 text-left text-xs font-extrabold"
              >
                <span className="block border-b border-ink-3 pb-1.5">
                  최근 경기
                </span>
              </th>
              <th
                scope="colgroup"
                colSpan={4}
                className="px-1 pt-3 text-left text-xs font-extrabold"
              >
                <span className="block border-b border-ink-3 pb-1.5">
                  시즌 누적
                  {since ? (
                    <span className="font-normal text-ink-2">
                      {" "}
                      · <span className="tabular-nums">{since}</span>부터
                    </span>
                  ) : null}
                </span>
              </th>
              <th
                scope="col"
                className="hidden px-1 pt-3 pl-3 text-left text-xs font-extrabold xl:table-cell"
              >
                <span className="block pb-1.5">UCL</span>
              </th>
              <th
                scope="colgroup"
                className="px-1 pt-3 text-left text-xs font-extrabold"
              >
                <span className="block border-b border-ink-3 pb-1.5">
                  다음 경기 KST
                </span>
              </th>
            </tr>
            <tr>
              <th scope="col" className={cx(TH, "pl-0 text-left")}>
                분
              </th>
              <th scope="col" className={cx(TH, "text-left")}>
                선수 · 소속
              </th>
              <th
                scope="col"
                className={cx(TH, "hidden text-left lg:table-cell")}
              >
                일시 · 대회
              </th>
              <th
                scope="col"
                className={cx(TH, "hidden text-left lg:table-cell")}
              >
                상대
              </th>
              <th
                scope="col"
                data-col="recent"
                className={cx(TH, "pr-0 text-right")}
              >
                결과
              </th>
              <th
                scope="col"
                data-col="season"
                className={cx(TH, "text-right lg:border-l lg:border-l-rule")}
              >
                <abbr title="출전 경기" className="no-underline">
                  출전
                </abbr>
              </th>
              <th
                scope="col"
                data-col="season"
                className={cx(TH, "text-right")}
              >
                분
              </th>
              <th
                scope="col"
                data-col="season"
                className={cx(TH, "text-right")}
              >
                골
              </th>
              <th
                scope="col"
                data-col="season"
                className={cx(TH, "pr-0 text-right lg:pr-1")}
              >
                도움
              </th>
              <th
                scope="col"
                className={cx(TH, "hidden pl-3 text-left xl:table-cell")}
              >
                출전 · 분
              </th>
              <th
                scope="col"
                data-col="next"
                className={cx(TH, "pr-0 text-right")}
              >
                일시 · 상대
              </th>
            </tr>
          </thead>
          {view.groups.map((group, i) => (
            <tbody key={group.key} data-group={group.key}>
              <GroupHead group={group} first={i === 0} />
              {group.rows.map((row) => (
                <RosterRow key={row.slug} row={row} />
              ))}
            </tbody>
          ))}
        </table>
      </RosterViews>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLE }} />
      <RosterLegend />
    </>
  );
}

/** 표 범례 — 숫자 상태 3종 + 결과 칸 읽는 법 */
function RosterLegend() {
  const num =
    "inline-block min-w-4 font-numeric text-xl leading-none font-extrabold tabular-nums";
  return (
    <p
      data-slot="roster-legend"
      className="mt-3.5 flex flex-wrap gap-x-4.5 gap-y-1.5 text-[12.5px] leading-[1.4] text-ink-2"
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cx(num, NUMBER_TONE.on)}>
          75
        </span>
        출전 분
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cx(
            num,
            NUMBER_TONE.zero,
            "[-webkit-text-stroke-width:1.25px]",
          )}
        >
          0
        </span>
        벤치 · 미출전
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cx(num, NUMBER_TONE.null)}>
          –
        </span>
        값 없음(명단 제외 · 라인업 없음 · 기록 연결 전)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FormChip result="W" />
        <b className="font-numeric text-[15px] font-extrabold text-ink tabular-nums">
          6-1
        </b>
        · 홈 = 그 선수 소속팀 득점 먼저
      </span>
    </p>
  );
}

/**
 * 1024 이상 왼쪽 목차 — 리그별 구간 앵커(평탄 탭 + 리그명 + 리더 점선 + 인원) + 집계 시작 안내 + (주면) 아래 떨어진 묶음에
 * '주간 리포트' 행(M3-12 — 최신 주차, 색인 페이지로) · '대표팀' 행(M3-13 — 최신 소집 명단 이름, `/national-team/`로).
 * 이적 행은 페이지(M4-04) 전이라 넣지 않는다(DECISIONS D2 §8 #10).
 */
export function RosterContents({
  view,
  weekly = null,
  national = null,
}: {
  view: RosterView;
  /** 최신 주간 리포트 주차 이름("W43") — 없으면 null(행 대신 '월요일 발행' 글자) */
  weekly?: { latest: string | null } | null;
  /** 최신 소집 명단 이름("11월 소집") — 없으면 null(값 대신 'A매치 일정' 글자) */
  national?: { label: string | null } | null;
}) {
  return (
    <>
      <SectionHead heading="리그별" headingAs="p" runningHead="INDEX" />
      <ul role="list" className="mt-2">
        {view.groups.map((group) => (
          <li key={group.key}>
            <a
              href={`#${group.anchor}`}
              className="group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink no-underline"
            >
              {group.key === "OTHER" ? (
                <span aria-hidden="true" className="contents">
                  <OtherTab size="contents" title="5대 리그 밖" />
                </span>
              ) : (
                <FlatTab
                  comp={group.key}
                  size="contents"
                  title={group.label}
                  aria-hidden="true"
                >
                  {group.short}
                </FlatTab>
              )}
              <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                {group.label}
              </span>
              <Leader />
              <span className="font-numeric text-[17px] leading-none font-semibold text-ink-2 tabular-nums">
                {group.rows.length}
                <span className="sr-only">명</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {view.sinceLabel ? (
        <p className="mt-3 text-[12.5px] leading-normal text-ink-2">
          {view.sinceLabel} — 그 전 경기는 기록에 없어요
        </p>
      ) : null}
      {weekly ? (
        <ul role="list" data-slot="roster-weekly-link" className="mt-4.5">
          <li>
            <Link
              href={routes.weeklyReport()}
              className="group/row flex min-h-11 items-center gap-2 border-t border-b border-rule text-sm text-ink no-underline"
            >
              <span className="min-w-0 font-extrabold underline-offset-3 group-hover/row:underline">
                주간 리포트
              </span>
              <Leader />
              <span className="font-numeric text-[17px] leading-none font-semibold text-ink-2 tabular-nums">
                {weekly.latest ?? (
                  <span className="font-sans text-[12.5px] font-normal">
                    월요일 발행
                  </span>
                )}
              </span>
            </Link>
          </li>
        </ul>
      ) : null}
      {national ? (
        <ul
          role="list"
          data-slot="roster-national-link"
          className={weekly ? undefined : "mt-4.5"}
        >
          <li>
            <Link
              href={routes.nationalTeam()}
              className={cx(
                "group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink no-underline",
                !weekly && "border-t",
              )}
            >
              <span className="min-w-0 font-extrabold underline-offset-3 group-hover/row:underline">
                대표팀
              </span>
              <Leader />
              <span className="text-[12.5px] leading-none text-ink-2">
                {national.label ?? "A매치 일정"}
              </span>
            </Link>
          </li>
        </ul>
      ) : null}
    </>
  );
}
