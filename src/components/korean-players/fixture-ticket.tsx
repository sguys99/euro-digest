import type { ReactNode } from "react";

import { TeamBadge } from "@/components/team/team-badge";
import type { FixtureRowView, FixtureTeamView } from "@/lib/player-detail-view";

import { CompTag } from "./player-marks";
import { Perforation } from "./ticket-parts";

/**
 * 다음 경기 — 입장권(B) + 이어지는 경기 행(D1 팀 일정 행 문법) (DESIGN §9.3 D2 "다음 경기 입장권", plan M3-10 · M4-08)
 *
 * 선수 상세(서버 컴포넌트 — src/components/korean-players/player-detail.tsx `NextMatches`)와 `/my` 다음 경기(클라이언트 섬 —
 * src/components/my/my-board.tsx)가 같은 조각을 쓴다(M4-08에서 player-detail.tsx에서 떼어 냈다 — 동작 불변). 그래서 이 파일과 import하는 모듈은
 * 클라이언트에서도 그릴 수 있어야 한다: `cn`(tailwind-merge) · fs · zod 없음, 훅 없음.
 *
 * `why`(`/my` — DESIGN §9.3 D2 "`/my` 틀" 걸린 팔로우 줄): 팀 두 줄 아래 12px `--ink-2` 줄, 이름은 800 `--ink`(앞에 화면 밖 "팔로우: ").
 */

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

/** 걸린 팔로우 줄 — "팔로우: 아틀레티코 마드리드 · 이강인"(이름 800 `--ink`, 구분 점은 `--ink-2`) */
export function FollowWhy({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs leading-[1.35] text-ink-2">
      <span className="sr-only">팔로우: </span>
      {names.map((name, i) => (
        <span key={name} className="inline-flex gap-x-2.5">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          <b className="font-extrabold text-ink">{name}</b>
        </span>
      ))}
    </p>
  );
}

/** 다음 경기 입장권(B) — 가로형(1279 이하) · 세로형(1280 이상 옆단 — `xlVertical`). 경기 기준이라 홈 팀 먼저 */
export function Admission({
  row,
  headingId,
  why,
  xlVertical = true,
}: {
  row: FixtureRowView;
  headingId: string;
  /** `/my` 걸린 팔로우 줄 */
  why?: ReactNode;
  /** 1280 이상 세로형(선수 상세 옆단). `/my`는 지면 단이라 늘 가로형 */
  xlVertical?: boolean;
}) {
  return (
    <article
      aria-labelledby={headingId}
      data-slot="admission"
      className={
        xlVertical
          ? "relative mt-2.5 grid grid-cols-[auto_2px_minmax(0,1fr)] border-[1.5px] border-ink bg-paper xl:grid-cols-1 xl:grid-rows-[auto_2px_auto]"
          : "relative mt-2.5 grid grid-cols-[auto_2px_minmax(0,1fr)] border-[1.5px] border-ink bg-paper"
      }
    >
      <h3 id={headingId} className="sr-only">
        다음 경기 — {row.day} {row.time ?? "시각 미정"} KST, {row.home.name} 대{" "}
        {row.away.name}
      </h3>
      <div
        aria-hidden="true"
        className={
          xlVertical
            ? "flex min-w-26 flex-col justify-center gap-2 py-3.5 pr-3 pl-3.5 lg:min-w-37.5 lg:px-5 lg:py-4.5 xl:min-w-0 xl:flex-row xl:items-end xl:justify-between xl:px-4 xl:pt-4 xl:pb-3.5"
            : "flex min-w-26 flex-col justify-center gap-2 py-3.5 pr-3 pl-3.5 lg:min-w-37.5 lg:px-5 lg:py-4.5"
        }
      >
        <time
          dateTime={row.kickoff}
          className={
            xlVertical
              ? "block font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] tabular-nums xl:text-[56px]"
              : "block font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] tabular-nums"
          }
        >
          {row.time ?? "미정"}
        </time>
        <span
          className={
            xlVertical
              ? "flex items-baseline gap-1.5 font-numeric text-sm leading-none font-extrabold tracking-[0.02em] text-ink-2 xl:flex-col xl:items-end xl:gap-1.25"
              : "flex items-baseline gap-1.5 font-numeric text-sm leading-none font-extrabold tracking-[0.02em] text-ink-2"
          }
        >
          <span className="text-ink tabular-nums">{row.day}</span>
          <span className="text-xs font-semibold">KST</span>
        </span>
      </div>
      <Perforation xlHorizontal={xlVertical} />
      <div
        className={
          xlVertical
            ? "grid min-w-0 content-start gap-2 pt-3 pr-3.5 pb-3 pl-4 xl:px-4 xl:pt-3 xl:pb-3.5"
            : "grid min-w-0 content-start gap-2 pt-3 pr-3.5 pb-3 pl-4 lg:pt-3.5 lg:pr-5 lg:pb-3.5 lg:pl-5"
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
          <CompTag comp={row.comp} />
          {row.round ? <span>{row.round}</span> : null}
        </p>
        <p className="grid gap-1.5">
          <SideTeam team={row.home} side="홈" />
          <SideTeam team={row.away} side="원정" />
        </p>
        {why}
      </div>
    </article>
  );
}

/** 이어지는 경기 — D1 팀 일정 행 문법(거터 킥오프 + 날짜 · 대회 줄 · 홈/원정 두 줄) */
export function FixtureRow({
  row,
  why,
  narrowAtXl = true,
}: {
  row: FixtureRowView;
  why?: ReactNode;
  /** 1280 이상 거터 56px(선수 상세 옆단). `/my` 지면 단은 날짜 거터 그대로 */
  narrowAtXl?: boolean;
}) {
  return (
    <li
      className={
        narrowAtXl
          ? "grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-start gap-x-2.5 border-b border-rule py-2.75 xl:grid-cols-[56px_minmax(0,1fr)]"
          : "grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-start gap-x-2.5 border-b border-rule py-2.75"
      }
    >
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
        {why}
      </div>
    </li>
  );
}
