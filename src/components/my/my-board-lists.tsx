import { useId, useState } from "react";

import {
  Admission,
  FixtureRow,
  FollowWhy,
} from "@/components/korean-players/fixture-ticket";
import { CompTag, ResultCell } from "@/components/korean-players/player-marks";
import { KoreanArmband } from "@/components/news/korean-armband";
import { TeamBadge } from "@/components/team/team-badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import {
  MY_FIXTURES_SHOWN,
  MY_RESULTS_SHOWN,
  type mergeFixtures,
  type MyResultRowView,
} from "@/lib/my-view";

/**
 * `/my` 다음 경기 · 최근 결과 목록 — src/components/my/my-board.tsx가 지연 import하는 청크(M4-16 번들 절감). 모양 · 동작은 M4-08 그대로
 * (입장권 + 일정 행 + 모두 보기 · 결과 행 — 결과 값 `data-slot="result-value"`는 결과 가리기 M4-15가 가린다).
 */

/** 다음 경기 — 입장권 + 일정 행 + 모두 보기 */
export function MyFixtures({
  fixtures,
  headingId,
}: {
  fixtures: ReturnType<typeof mergeFixtures>;
  headingId: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [first, ...rest] = fixtures;
  if (!first) return null;
  const shown = open ? rest : rest.slice(0, MY_FIXTURES_SHOWN - 1);
  return (
    <>
      <Admission
        row={first.row}
        headingId={`${headingId}-1`}
        xlVertical={false}
        why={<FollowWhy names={first.why} />}
      />
      {shown.length > 0 ? (
        <ol id={listId} aria-label="이어지는 경기" className="mt-2.5">
          {shown.map((f) => (
            <FixtureRow
              key={f.row.key}
              row={f.row}
              narrowAtXl={false}
              why={<FollowWhy names={f.why} />}
            />
          ))}
        </ol>
      ) : null}
      {fixtures.length > MY_FIXTURES_SHOWN ? (
        <p className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-[13px] text-ink-2">
            <span className="font-numeric tabular-nums">{fixtures.length}</span>
            경기 중{" "}
            <span className="font-numeric tabular-nums">
              {open ? fixtures.length : MY_FIXTURES_SHOWN}
            </span>
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 bg-transparent text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            {open ? "처음 5경기만" : "모두 보기"}
            <ChevronRightIcon
              size={18}
              className={open ? "-rotate-90" : "rotate-90"}
            />
          </button>
        </p>
      ) : null}
    </>
  );
}

/** 최근 결과 한 줄 — `[날짜 거터 │ 팀(선수) · 대회 vs 상대 │ 결과 칸]` */
function ResultRow({ row }: { row: MyResultRowView }) {
  return (
    <li className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule py-2.75 lg:gap-x-3.5">
      <time
        dateTime={row.kickoff}
        className="font-numeric text-sm leading-none font-semibold tracking-[0.02em] text-ink-2 tabular-nums"
      >
        {row.date}
      </time>
      <div className="grid min-w-0 gap-1.25">
        <p className="flex min-w-0 items-center gap-1.75 text-[14.5px] leading-[1.25] font-extrabold">
          {row.player ? (
            <>
              <KoreanArmband title="한국 선수" />
              <span>{row.player}</span>
            </>
          ) : (
            <>
              <TeamBadge team={row.team} size="xs" />
              <span
                lang={row.team.latin ? "en" : undefined}
                className="min-w-0"
              >
                {row.team.name}
              </span>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[1.3] text-ink-2">
          <CompTag comp={row.comp} />
          <span>
            {row.player ? (
              <>
                <span lang={row.team.latin ? "en" : undefined}>
                  {row.team.name}
                </span>{" "}
              </>
            ) : null}
            vs{" "}
            <span lang={row.opponent.latin ? "en" : undefined}>
              {row.opponent.name}
            </span>
          </span>
        </p>
      </div>
      <ResultCell
        result={row.result}
        home={row.home}
        goals={row.goals}
        assists={row.player ? row.assists : null}
        revealLabel={`${row.player ? `${row.player} ` : ""}${row.date} ${row.opponent.name}전 결과 보기`}
      />
    </li>
  );
}

/** 최근 결과 — 결과 행 목록(처음 `MY_RESULTS_SHOWN`줄) */
export function MyResults({
  results,
}: {
  results: readonly MyResultRowView[];
}) {
  return (
    <ol
      aria-label="최근 결과 — 최근 경기부터"
      className="mt-2 border-t border-rule"
    >
      {results.slice(0, MY_RESULTS_SHOWN).map((row) => (
        <ResultRow
          key={`${row.key}-${row.player ?? row.team.slug}`}
          row={row}
        />
      ))}
    </ol>
  );
}
