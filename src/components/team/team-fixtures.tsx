import type { ReactNode } from "react";

import { ResultChip, Score } from "@/components/competition/marks";
import { FlatTab } from "@/components/ui/chip";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { CompId } from "@/lib/schema/common";
import type { FixtureWindow, TeamFixtureView } from "@/lib/team-view";

import { TeamBadge } from "./team-badge";
import { TeamLink, TeamName } from "./team-link";

/**
 * 팀 일정·결과 (PRD FR-52, DESIGN §9.3 "일정·결과 목록 ② 팀 일정·결과", plan M2-13)
 *
 * 서버 컴포넌트. 이 팀의 시즌 전체 경기(6개 대회 데이터 — 킥오프 순). 행 `--gutter · 1fr · auto`: 거터 날짜 + 요일 · 대회 줄(평탄 탭 + 홈/원정 +
 * 라운드) + 상대(배지 s + 팀명 — 팀 화면 링크) · 오른쪽 결과(스코어 + 결과 칩) 또는 예정(킥오프 KST + "예정 · KST").
 * 상태 표기는 대회 페이지와 같은 규칙(src/lib/competition-view.ts — 임시 킥오프 "임시" · 결과 대기 · 연기 · 연장/승부차기 글자 병기).
 * 첫 화면은 지난 경기 최근 4 + 다가올 경기 4만 펼치고, 나머지는 앞뒤 `<details>`로 접는다(JS 없이 동작 — 3초 스캔, 시즌 40여 경기).
 */
export function TeamFixtures({
  headingId,
  window,
  comps,
}: {
  headingId: string;
  window: FixtureWindow<TeamFixtureView>;
  comps: ReadonlyMap<CompId, { short: string; name: string }>;
}) {
  const total =
    window.earlier.length + window.shown.length + window.later.length;
  return (
    <section aria-labelledby={headingId} data-slot="team-fixtures">
      <SectionHead
        heading="일정·결과"
        headingId={headingId}
        runningHead="FIXTURES"
      />
      <p className="mt-0.75 text-[13px] text-ink-2">
        KST · 스코어는 홈-원정 순 · 시즌 {total}경기
      </p>
      {total === 0 ? (
        <p className="pt-6 pb-2 text-[15px] font-extrabold">
          아직 경기 일정이 없어요.
        </p>
      ) : (
        <div className="mt-2 border-t border-rule">
          {window.earlier.length > 0 ? (
            <More label={`지난 경기 ${window.earlier.length}경기 더 보기`}>
              <FixtureList rows={window.earlier} comps={comps} />
            </More>
          ) : null}
          <FixtureList rows={window.shown} comps={comps} />
          {window.later.length > 0 ? (
            <More label={`남은 일정 ${window.later.length}경기 더 보기`}>
              <FixtureList rows={window.later} comps={comps} />
            </More>
          ) : null}
        </div>
      )}
    </section>
  );
}

function More({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group/more">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDownIcon
          size={16}
          className="transition-transform duration-base ease-print group-open/more:rotate-180"
        />
      </summary>
      {children}
    </details>
  );
}

function FixtureList({
  rows,
  comps,
}: {
  rows: readonly TeamFixtureView[];
  comps: ReadonlyMap<CompId, { short: string; name: string }>;
}) {
  return (
    <ol role="list">
      {rows.map((row) => (
        <FixtureRow key={row.match.id} row={row} comp={comps.get(row.comp)} />
      ))}
    </ol>
  );
}

function FixtureRow({
  row,
  comp,
}: {
  row: TeamFixtureView;
  comp: { short: string; name: string } | undefined;
}) {
  const { match, state } = row;
  return (
    <li
      data-state={state}
      className="grid grid-cols-[var(--gutter)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule py-3"
    >
      <div className="grid gap-0.75">
        <time
          dateTime={match.kickoff}
          className="font-numeric text-[19px] leading-[0.9] font-extrabold tracking-[-0.01em] whitespace-nowrap tabular-nums"
        >
          {row.date}
        </time>
        <span className="text-[11.5px] font-extrabold text-ink-2">
          {row.weekday}
        </span>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
          {comp ? (
            <FlatTab comp={row.comp} title={comp.name}>
              {comp.short}
            </FlatTab>
          ) : null}
          <span>{row.side === "home" ? "홈" : "원정"}</span>
          <span>{row.round}</span>
        </p>
        <TeamLink
          team={row.opponent}
          className="flex w-fit max-w-full items-center gap-2 text-[15px] leading-[1.25] font-extrabold"
        >
          <TeamBadge team={row.opponent} size="s" />
          <TeamName team={row.opponent} />
        </TeamLink>
      </div>
      <div className="grid justify-items-end gap-1.25 text-right">
        <FixtureResult row={row} />
      </div>
    </li>
  );
}

function FixtureResult({ row }: { row: TeamFixtureView }) {
  const { match, state } = row;
  if (state === "finished" && match.score) {
    return (
      <>
        <Score
          h={match.score.h}
          a={match.score.a}
          className="font-numeric text-2xl leading-none tracking-[0.04em] tabular-nums"
        />
        {row.result ? <ResultChip result={row.result} /> : null}
        <span className="sr-only"> (홈-원정 순 스코어)</span>
        {row.extra ? (
          <span className="text-[11.5px] text-ink-2">{row.extra}</span>
        ) : null}
      </>
    );
  }
  if (state === "scheduled") {
    return (
      <>
        {row.time ? (
          <time
            dateTime={match.kickoff}
            className="font-numeric text-[22px] leading-none font-extrabold tabular-nums"
          >
            {row.time}
          </time>
        ) : (
          <span className="text-[15px] leading-none font-extrabold">임시</span>
        )}
        <span className="text-[11.5px] text-ink-2">
          {row.time ? "예정 · KST" : "킥오프 시각 미정"}
        </span>
      </>
    );
  }
  return (
    <span className="match-state">
      {state === "pending" ? "결과 대기" : "연기"}
    </span>
  );
}
