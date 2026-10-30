import { ChevronDownIcon } from "@/components/ui/icons";
import { TeamBadge } from "@/components/team/team-badge";
import {
  formView,
  goalDiffText,
  recentMatchesOf,
  resultFor,
  type StandingLine,
  type StandingRowView,
  type TeamLookup,
  type ZoneBand,
} from "@/lib/competition-view";
import type { Match } from "@/lib/schema/competition";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";

import { FormChips, ResultChip, Score, TrendMark } from "./marks";
import { StandingsIsland } from "./standings-island";

/**
 * 순위표 — 한 장 표 (PRD FR-42, DESIGN §9.3 "순위표"·"구간 표시"·"순위 변동"·"폼 칩", DECISIONS D1 §4·§5 #5·#7·#8·#9, plan M2-11)
 *
 * 서버 컴포넌트. DOM은 모든 폭에서 같고 1023 이하에서 6열(승·무·패·득점·실점·최근 5경기)을 숨긴다 — 어느 폭에서도 가로 스크롤이 없다.
 * - 1023 이하 5열: 순위(번호 + 변동) · 팀 · 경기 · 득실 · 승점(펼침 버튼). 펼침 행(처음 `hidden`)에 5칸 숫자 · 폼 · 최근 경기 목록.
 *   펼침은 섬(standings-island.tsx) — JS가 없으면 펼치지 못하지만 1024 이상 전체 열은 그대로다.
 * - 1024 이상 11열: 순위 · 팀 · 경기 · 승 · 무 · 패 · 득점 · 실점 · 득실 · 승점 · 최근 5경기.
 * - 구간: 순위 칸 왼쪽 4px 띠(색 — 실선 확정 · 점선 플레이오프) + 구간 머리 줄(글자) — 색만으로 뜻을 전하지 않는다(FR-42).
 * - 행 id = 팀 slug — 다른 화면에서 오는 링크(`/competitions/<comp>/#<팀>` — 홈 순위 미니 M2-15·팀 화면 리그 맥락 M2-13)는 도착
 *   강조(`:target`, slow — DECISIONS D1 §5 #9)를 받는다. 강조 면 `--paper-2`는 순위 칸(▲ 초록)·폼 칸(W 초록)에는 칠하지 않는다
 *   (초록 글자는 `--paper` 위에만 — D1 §5 #8).
 * - **팀 이름은 아직 링크가 아니다** — 팀 페이지(`/teams/[team]/`)는 M2-13에서 생긴다(없는 페이지로 가는 링크를 만들지 않는다 — plan §2.3).
 *   M2-13에서 팀 칸을 `next/link`로, 펼침 행 끝에 "{팀} 팀 화면 ›"을 더한다(이월 메모).
 * - 배지는 옆 한글 팀명이 이름이라 `aria-hidden`(D1 §5 #5).
 */

/** 순위 칸·구간 머리 줄의 띠(DESIGN §9.3 구간 표시 — 4px, 점선 = 5px 선 · 4px 틈) */
const BAND: Readonly<Record<ZoneBand, string>> = {
  rel: "shadow-[inset_4px_0_0_var(--brand-accent)]",
  relpo:
    "bg-[repeating-linear-gradient(to_bottom,var(--brand-accent)_0_5px,transparent_5px_9px)] bg-size-[4px_100%] bg-no-repeat",
  ko: "shadow-[inset_4px_0_0_var(--ink)]",
  po: "bg-[repeating-linear-gradient(to_bottom,var(--ink-2)_0_5px,transparent_5px_9px)] bg-size-[4px_100%] bg-no-repeat",
};

/** 구간 머리 줄 위 괘선·글자 */
const ZONE_HEAD: Readonly<Record<ZoneBand | "none", string>> = {
  rel: "border-t-2 border-brand-accent text-brand-accent-text",
  relpo: "border-t-2 border-brand-accent text-brand-accent-text",
  ko: "border-t-2 border-ink",
  po: "border-t-2 border-ink-2",
  none: "border-t border-dashed border-ink-2 text-ink-2",
};

/** 표 열 수(펼침 행·구간 머리 줄 colspan) */
const COLUMNS = 11;

/** 1024 이상에서만 보이는 열 */
const WIDE = "hidden lg:table-cell";

/** 숫자 칸 — Barlow 600 15px(1024 이상 16px · 좌우 8px). globals.css §10 `standing-num`(20행 × 7칸 반복) */
const NUM = "standing-num";

/** 머리 줄 칸 */
const HEAD =
  "border-b border-ink px-1 pt-3 pb-2 text-right text-xs font-extrabold whitespace-nowrap text-ink-2";

/** `:target` 도착 강조를 받는 칸(순위·폼 칸 제외 — 머리 주석) */
const HL = { "data-hl": "" } as const;

export interface StandingsTableProps {
  /** 표 id — 펼침 섬의 범위 */
  id: string;
  /** 대회 정식 이름(caption) */
  compName: string;
  /** 순위 갱신 시각(UTC ISO — caption) */
  updatedAt: string;
  lines: readonly StandingLine[];
  /** 그 대회 경기 전부 — 펼침 행의 최근 경기 목록 */
  matches: readonly Match[];
  /** 폼 범위 이름("리그"·"UCL") */
  formScope: string;
  team: TeamLookup;
  /** 전날 자료가 있는가(caption 문구) */
  hasPrev: boolean;
}

export function StandingsTable({
  id,
  compName,
  updatedAt,
  lines,
  matches,
  formScope,
  team,
  hasPrev,
}: StandingsTableProps) {
  return (
    <>
      <table
        id={id}
        data-slot="standings"
        className="mt-1 w-full border-collapse text-sm"
      >
        <caption className="sr-only">
          {compName} 순위 — {formatKst(updatedAt, "datetime")} 기준,{" "}
          {hasPrev ? "변동은 전날 수집 순위 대비" : "변동은 전날 자료 없음"}.
          좁은 화면에서는 승점 칸 버튼으로 행을 펼칩니다
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(HEAD, "w-11.5 pl-3 text-left lg:w-24 lg:pl-4")}
            >
              <span aria-hidden="true">#</span>
              <span className="sr-only">순위·변동</span>
            </th>
            <th scope="col" className={cn(HEAD, "pl-0.5 text-left")}>
              팀
            </th>
            <th scope="col" className={HEAD}>
              경기
            </th>
            <th scope="col" className={cn(HEAD, WIDE)}>
              승
            </th>
            <th scope="col" className={cn(HEAD, WIDE)}>
              무
            </th>
            <th scope="col" className={cn(HEAD, WIDE)}>
              패
            </th>
            <th scope="col" className={cn(HEAD, WIDE)}>
              득점
            </th>
            <th scope="col" className={cn(HEAD, WIDE)}>
              실점
            </th>
            <th scope="col" className={cn(HEAD, "w-10")}>
              득실
            </th>
            <th
              scope="col"
              className={cn(HEAD, "w-14.5 pr-0 lg:w-16 lg:pr-1.5")}
            >
              승점
            </th>
            <th scope="col" className={cn(HEAD, WIDE, "pl-3.5 text-left")}>
              최근 5경기
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) =>
            line.kind === "zone" ? (
              <tr
                key={`zone-${line.title}-${line.range}`}
                data-zone-head={line.band}
              >
                <td
                  colSpan={COLUMNS}
                  className={cn(
                    "pt-3 pb-1.25 pl-3 text-left text-xs font-extrabold",
                    ZONE_HEAD[line.band],
                    line.band !== "none" && BAND[line.band],
                  )}
                >
                  {line.title}
                  <span className="ml-1 font-numeric text-[13px] leading-none font-semibold tracking-[0.02em] tabular-nums">
                    {line.range}
                  </span>
                </td>
              </tr>
            ) : (
              <StandingRowLines
                key={line.view.row.team}
                view={line.view}
                matches={matches}
                formScope={formScope}
                team={team}
              />
            ),
          )}
        </tbody>
      </table>
      <StandingsIsland tableId={id} />
    </>
  );
}

function StandingRowLines({
  view,
  matches,
  formScope,
  team,
}: {
  view: StandingRowView;
  matches: readonly Match[];
  formScope: string;
  team: TeamLookup;
}) {
  const { row, band } = view;
  const name = view.team.name;
  const detailId = `${row.team}-d`;
  return (
    <>
      <tr
        id={row.team}
        data-row=""
        data-zone={band ?? undefined}
        className={cn(
          "cursor-pointer scroll-mt-4 lg:cursor-auto",
          // 펼친 행은 행 밑줄을 지워 펼침과 한 덩어리로
          "data-open:*:border-b-transparent",
          // 도착 강조(:target, slow) — 순위·폼 칸 제외(초록 글자는 --paper 위에만)
          "[&:target>[data-hl]]:animate-arrive [&:target>[data-hl]]:bg-paper-2",
        )}
      >
        <td
          className={cn(
            "w-11.5 border-b border-rule pl-3 text-left align-middle lg:w-24 lg:pl-4",
            band && BAND[band],
          )}
        >
          <span className="block lg:flex lg:items-start lg:gap-1.5">
            <span className="block font-numeric text-[26px] leading-[0.9] font-extrabold tracking-[-0.02em] tabular-nums lg:text-[40px] lg:leading-[0.82]">
              {row.pos}
              <span className="sr-only">위</span>
            </span>
            <TrendMark
              trend={view.trend}
              className="mt-1.25 flex lg:mt-px lg:inline-flex"
            />
          </span>
        </td>
        <th
          scope="row"
          {...HL}
          className="border-b border-rule pl-0.5 text-left align-middle font-normal"
        >
          <span className="flex min-h-13.5 items-center gap-2.25 py-2 text-[15px] leading-[1.25] font-extrabold tracking-[-0.02em] lg:min-h-15 lg:gap-3 lg:text-[17px]">
            <TeamBadge team={view.team} size="table" />
            <span lang={view.team.latin ? "en" : undefined}>{name}</span>
          </span>
        </th>
        <td {...HL} className={NUM}>
          {row.played}
        </td>
        <td {...HL} className={cn(NUM, WIDE)}>
          {row.w}
        </td>
        <td {...HL} className={cn(NUM, WIDE)}>
          {row.d}
        </td>
        <td {...HL} className={cn(NUM, WIDE)}>
          {row.l}
        </td>
        <td {...HL} className={cn(NUM, WIDE)}>
          {row.gf}
        </td>
        <td {...HL} className={cn(NUM, WIDE)}>
          {row.ga}
        </td>
        <td {...HL} className={cn(NUM, "w-10")}>
          {goalDiffText(row.gf, row.ga)}
        </td>
        <td
          {...HL}
          className="w-14.5 border-b border-rule pr-0 text-right align-middle lg:w-16 lg:pr-1.5"
        >
          <span className="hidden font-numeric text-2xl leading-none font-extrabold tracking-[-0.01em] tabular-nums lg:inline">
            {row.pts}
          </span>
          <button
            type="button"
            data-row-toggle=""
            aria-expanded="false"
            aria-controls={detailId}
            className="group/btn inline-flex min-h-12 min-w-13.5 items-center justify-end gap-px border-0 bg-transparent p-0 text-ink lg:hidden"
          >
            <span className="font-numeric text-[21px] leading-none font-extrabold tracking-[-0.01em] tabular-nums">
              {row.pts}
            </span>
            <ChevronDownIcon
              size={18}
              className="text-ink-2 transition-transform duration-base ease-print group-aria-expanded/btn:rotate-180"
            />
            <span className="sr-only">{name} 상세 펼치기</span>
          </button>
        </td>
        <td className={cn(WIDE, "border-b border-rule pl-3.5 align-middle")}>
          <FormChips form={view.form} />
        </td>
      </tr>
      <tr id={detailId} hidden className="lg:hidden" data-detail="">
        <td
          colSpan={COLUMNS}
          className={cn("pb-4 pl-3 text-left", band && BAND[band])}
        >
          <RowDetail
            view={view}
            matches={matches}
            formScope={formScope}
            team={team}
          />
        </td>
      </tr>
    </>
  );
}

/** 375 펼침 내용 — 5칸 숫자 → 최근 경기(폼 + 목록) */
function RowDetail({
  view,
  matches,
  formScope,
  team,
}: {
  view: StandingRowView;
  matches: readonly Match[];
  formScope: string;
  team: TeamLookup;
}) {
  const { row } = view;
  const recent = recentMatchesOf(matches, row.team);
  // 폼은 순위표 값(파이프라인 계산 — M2-03)을 그대로 쓰고, 경기 목록은 같은 범위(그 대회 종료 경기 최근 5)를 보여 준다
  const form = formView(row.form, formScope);
  const stats: ReadonlyArray<[string, number]> = [
    ["승", row.w],
    ["무", row.d],
    ["패", row.l],
    ["득점", row.gf],
    ["실점", row.ga],
  ];
  return (
    <div
      data-detail-body=""
      className="mr-0.5 grid gap-3 border-t border-dotted border-ink-3 pt-3 data-tear:animate-tear"
    >
      {/* 칸·줄마다 같은 클래스를 되풀이하지 않게 목록에 한 번 건다(20행 × 펼침 — 페이지 크기) */}
      <dl className="grid grid-cols-5 gap-1 *:grid *:gap-1 [&_dd]:font-numeric [&_dd]:text-[22px] [&_dd]:leading-none [&_dd]:font-extrabold [&_dd]:tabular-nums [&_dt]:text-[11.5px] [&_dt]:font-extrabold [&_dt]:text-ink-2">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-1.5 text-[12.5px] font-extrabold">
          최근 {formScope} 경기
          <span className="ml-1.5 font-normal text-ink-2">
            {form.count > 0
              ? `자료 ${form.count}경기 · 오래된 → 최근`
              : "자료 없음"}
          </span>
        </p>
        <FormChips form={form} />
        {recent.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-[13px] *:flex *:flex-wrap *:items-center *:gap-2 [&_time]:font-numeric [&_time]:leading-none [&_time]:font-semibold [&_time]:text-ink-2">
            {recent.map((m) => {
              const result = resultFor(m, row.team);
              const home = team(m.home);
              const away = team(m.away);
              return (
                <li key={m.id}>
                  {result ? <ResultChip result={result} /> : null}
                  <time dateTime={m.kickoff}>
                    {formatKst(m.kickoff, "dayShort")}{" "}
                    {formatKst(m.kickoff, "time")}
                  </time>
                  <span>
                    <span lang={home.latin ? "en" : undefined}>
                      {home.name}
                    </span>{" "}
                    {m.score ? (
                      <Score
                        h={m.score.h}
                        a={m.score.a}
                        className="mx-0.5 font-numeric text-[15px] leading-none"
                      />
                    ) : null}{" "}
                    <span lang={away.latin ? "en" : undefined}>
                      {away.name}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
