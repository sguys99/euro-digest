import type { ReactNode } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { TeamBadge } from "@/components/team/team-badge";
import { TeamLink, TeamName } from "@/components/team/team-link";
import type { MatchView, RoundView } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

import { Score } from "./marks";

/**
 * 대회 라운드 — 일정·결과 목록 (PRD FR-44, DESIGN §9.3 "일정·결과 목록 ① 대회 라운드", plan M2-10)
 *
 * 서버 컴포넌트. 킥오프는 KST(src/lib/time.ts — 화면 모델에서 계산), 스코어는 홈-원정 순.
 * - `RoundDays`: 날짜 머리("10.31 (토)") + 경기 줄(킥오프 · 홈 + 배지 · 스코어/상태 · 배지 + 원정). `full`(일정·결과 탭)은 줄 54px · 팀명
 *   14.5px · 배지 s, 아니면(순위표 패널 아래 현재 라운드) 46px · 13.5px · 배지 xs.
 * - 상태 칸: 종료 = 스코어(하이픈 장식 + 화면 밖 "대") · 예정 = "예정" · 킥오프가 지났는데 결과가 없음 = "결과 대기"(D60) · 연기 = "연기"
 *   (점선 상자 — 같은 모양). 임시 킥오프(`tbc`)는 시각 대신 "임시"(M2-02 이월). 연장·승부차기는 줄 아래 글자로 병기.
 * - `RoundBook`(일정·결과 탭): 모든 라운드를 그리고 CSS가 하나만 보인다 — 지금 라운드(`data-current`) 또는 주소 `#round-n`이 가리키는
 *   라운드(`:target` — globals.css §9). 라운드 이동은 앵커 링크라 JS 없이도 동작한다(FR-44). 탭 섬이 앵커가 가리키는 패널을 연다.
 * - 팀 칸(이름 + 배지)은 팀 화면 링크(M2-13 — `TeamLink`, 팀 페이지가 있는 팀만, 누름 영역 위아래 44px). 배지는 `aria-hidden`(옆 한글 팀명이 이름).
 */

/** 경기 줄 — 모양은 globals.css §10 `match-row`(시즌 380경기가 반복돼 짧은 유틸리티로 묶었다 — 자식 칸은 data-t·h·s·a·x). 녹아웃 대진 차전 줄도 쓴다(M2-12) */
export function MatchRow({
  view,
  full,
  lead,
}: {
  view: MatchView;
  full: boolean;
  /** 킥오프 칸 대신 둘 내용(녹아웃 차전 줄 "1차전" + 날짜 — M2-12). 없으면 킥오프 시각·"임시" */
  lead?: ReactNode;
}) {
  const { match, state } = view;
  const badge = full ? "s" : "xs";
  return (
    <li
      data-state={state}
      className={full ? "match-row match-row-full" : "match-row"}
    >
      {lead !== undefined ? (
        lead
      ) : view.time === null ? (
        <span data-t="tbc">
          임시<span className="sr-only"> 일정 — 킥오프 시각 미정</span>
        </span>
      ) : (
        <time
          data-t={state === "finished" ? "done" : ""}
          dateTime={match.kickoff}
        >
          {view.time}
        </time>
      )}
      <TeamLink team={view.home} data-h="">
        <TeamName team={view.home} />
        <TeamBadge team={view.home} size={badge} />
      </TeamLink>
      <span data-s="">
        {state === "finished" && match.score ? (
          <Score h={match.score.h} a={match.score.a} />
        ) : (
          <span className="match-state">{STATE_TEXT[state]}</span>
        )}
      </span>
      <TeamLink team={view.away} data-a="">
        <TeamBadge team={view.away} size={badge} />
        <TeamName team={view.away} />
      </TeamLink>
      {view.extra ? <span data-x="">{view.extra}</span> : null}
    </li>
  );
}

/** 상태 상자 글자(종료는 스코어) */
const STATE_TEXT: Readonly<Record<MatchView["state"], string>> = {
  finished: "종료",
  scheduled: "예정",
  pending: "결과 대기",
  postponed: "연기",
};

/** 날짜 머리 + 경기 줄 */
export function RoundDays({
  round,
  full = false,
  className,
}: {
  round: RoundView;
  full?: boolean;
  className?: string;
}) {
  return (
    <ol role="list" className={cn("mt-2", className)}>
      {round.days.map((day) => (
        <li key={day.date}>
          <p className="border-b border-ink pt-2.5 pb-1 text-[12.5px] font-extrabold text-ink-2">
            <time dateTime={day.date}>{day.label}</time>
          </p>
          <ul role="list">
            {day.matches.map((view) => (
              <MatchRow key={view.match.id} view={view} full={full} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** 라운드 이동 버튼 — 앵커 링크(최소 44×56px) · 갈 라운드가 없으면 점선 비활성 */
function RoundNavButton({
  to,
  dir,
}: {
  to: RoundView | null;
  dir: "prev" | "next";
}) {
  const base =
    "inline-flex min-h-11 min-w-14 items-center justify-center gap-1 border px-2.5 font-numeric text-sm leading-none font-extrabold tracking-[0.04em] no-underline";
  const icon =
    dir === "prev" ? (
      <ChevronLeftIcon size={16} />
    ) : (
      <ChevronRightIcon size={16} />
    );
  if (!to) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          base,
          "border-dashed border-ink-disabled text-ink-disabled",
        )}
      >
        {icon}
        <span className="sr-only">
          {dir === "prev" ? "이전 라운드 없음" : "다음 라운드 없음"}
        </span>
      </span>
    );
  }
  return (
    <a
      href={`#${to.id}`}
      aria-label={to.label}
      className={cn(
        base,
        "border-ink-2 text-ink transition-colors duration-fast ease-print hover:border-ink hover:bg-paper-2",
      )}
    >
      {dir === "prev" ? icon : null}
      <span>{to.short}</span>
      {dir === "next" ? icon : null}
    </a>
  );
}

/** 일정·결과 탭 — 라운드 전체(하나만 보임 — 머리 주석) */
export function RoundBook({
  rounds,
  currentIndex,
}: {
  rounds: readonly RoundView[];
  currentIndex: number;
}) {
  return (
    <div data-rounds="" id="fixtures" className="scroll-mt-4">
      {rounds.map((round, i) => (
        <section
          key={round.round}
          id={round.id}
          data-round=""
          data-current={i === currentIndex ? "" : undefined}
          aria-labelledby={`${round.id}-h`}
          className="scroll-mt-4"
        >
          <nav
            aria-label="라운드 이동"
            className="mt-3.5 flex items-center justify-between gap-2 border-b-3 border-ink pb-2"
          >
            <RoundNavButton to={rounds[i - 1] ?? null} dir="prev" />
            <div className="text-center text-[15px]">
              <h2 id={`${round.id}-h`} className="inline font-extrabold">
                {round.label}
              </h2>
              <span className="ml-1.5 font-numeric font-semibold text-ink-2 tabular-nums">
                {round.range}
              </span>
            </div>
            <RoundNavButton to={rounds[i + 1] ?? null} dir="next" />
          </nav>
          <p className="mt-2 text-[13px] text-ink-2">
            킥오프 KST · 종료 {round.finished} · 예정 {round.upcoming}
          </p>
          <RoundDays round={round} full className="mt-1" />
        </section>
      ))}
    </div>
  );
}
