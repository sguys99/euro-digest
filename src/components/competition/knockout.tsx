import { SectionHead } from "@/components/ui/section-head";
import { TeamBadge } from "@/components/team/team-badge";
import { TeamLink, TeamName } from "@/components/team/team-link";
import type {
  KnockoutStage,
  StageView,
  TieLegView,
  TieView,
} from "@/lib/knockout";
import { formatKst, kstDate } from "@/lib/time";

import { Score } from "./marks";
import { MatchRow } from "./rounds";

/**
 * UCL 녹아웃 대진 목록 — '대진' 보기 패널 (PRD FR-43, PRD §15 D63 ④, plan M2-12)
 *
 * 서버 컴포넌트. 시안이 없는 화면이라(DECISIONS D1 §6 #6 범위 밖 → D63 ④) **D1 확정 컴포넌트만으로 조립**하고 새 시각 모티프를 만들지 않는다 —
 * 대진표(브래킷) 그래픽은 실데이터가 나오는 2027-02 전에 별도 미니 시안.
 * - 대진 목록 = 1023 이하 한 줄, 1024 이상 2단(대회 페이지 순위표 아래 2단과 같은 간격 40px).
 * - 단계(최신 단계부터 — src/lib/knockout.ts `knockoutStagesView`) = 얇은 섹션 머리(§9.3 섹션 머리 thin) + 부제("대진 8 · 결정 3 · 킥오프 KST").
 * - 대진 하나 = 합산 줄(라운드 경기 줄 `match-row-full` 그대로 — 킥오프 칸에 "합산", 앞 팀 = 1차전 홈) + 줄 아래 보조 글자(진출·연장·승부차기 ·
 *   다음 차전 날짜·시각 — 진출은 글자로, 색만으로 뜻을 전하지 않는다) → 차전 줄 2개(`MatchRow` 그대로 · 작은 줄 — 킥오프 칸에 "1차전" + 날짜,
 *   결과·예정·결과 대기·연기·연장·승부차기 글자 병기). 결승은 단판이라 합산 줄 없이 날짜 머리 + 경기 줄 + 보조 글자.
 * - 팀 칸 = 팀 화면 링크(`TeamLink` — 팀 페이지가 있는 팀만) + 배지(`aria-hidden`, 옆 한글 팀명이 이름).
 */

/** 단계 러닝 헤드(영문 원문 — 장식, `aria-hidden`) */
const STAGE_RUNNING_HEAD: Readonly<Record<KnockoutStage, string>> = {
  "ko-playoff": "KNOCKOUT PLAY-OFFS",
  "ko-r16": "ROUND OF 16",
  "ko-qf": "QUARTER-FINALS",
  "ko-sf": "SEMI-FINALS",
  "ko-final": "FINAL",
};

/** 날짜 머리 — 라운드 날짜 머리(rounds.tsx `RoundDays`)와 같은 모양 */
const LEG_HEAD =
  "border-b border-ink pt-2.5 pb-1 text-[12.5px] font-extrabold text-ink-2";

export function KnockoutStages({ stages }: { stages: readonly StageView[] }) {
  return (
    <div id="knockout" data-slot="knockout" className="scroll-mt-4">
      {stages.map((stage, i) => (
        <section
          key={stage.stage}
          id={`stage-${stage.stage}`}
          data-stage={stage.stage}
          aria-labelledby={`stage-${stage.stage}-h`}
          className={i === 0 ? "mt-5 scroll-mt-4" : "mt-11 scroll-mt-4"}
        >
          <SectionHead
            thin
            heading={stage.label}
            headingId={`stage-${stage.stage}-h`}
            runningHead={STAGE_RUNNING_HEAD[stage.stage]}
          />
          <p className="mt-0.75 text-[13px] text-ink-2">
            {stage.summary} · 킥오프 KST
          </p>
          <ol
            role="list"
            className="mt-3 grid gap-y-5 lg:grid-cols-2 lg:gap-x-10"
          >
            {stage.ties.map((tie) => (
              <TieBlock key={tie.tie.id} tie={tie} />
            ))}
          </ol>
        </section>
      ))}
      <p className="mt-5 text-[12.5px] leading-normal text-ink-2">
        합산 = 1·2차전 스코어 합(연장 포함 · 승부차기 제외) · 합산이 같으면 연장
        → 승부차기(원정 다득점 없음) · 앞 팀 = 1차전 홈
      </p>
    </div>
  );
}

function TieBlock({ tie: view }: { tie: TieView }) {
  const { tie } = view;
  if (tie.legCount === 1) {
    // 결승 — 단판이라 합산 줄 없이 날짜 머리 + 경기 줄 + 보조 글자
    const leg = view.legs[0]!;
    return (
      <li id={tie.id} data-tie={tie.state} className="scroll-mt-4">
        <p className={LEG_HEAD}>
          {leg.label} ·{" "}
          <time dateTime={kstDate(leg.view.match.kickoff)}>{leg.view.day}</time>
        </p>
        <ul role="list">
          <MatchRow view={leg.view} full />
        </ul>
        {view.note ? (
          <p
            data-tie-note=""
            className="mt-1.5 text-center text-[12.5px] font-extrabold"
          >
            {view.note}
          </p>
        ) : null}
      </li>
    );
  }
  const missing = view.legs.length < tie.legCount;
  return (
    <li id={tie.id} data-tie={tie.state} className="scroll-mt-4">
      <ul role="list">
        <AggregateRow view={view} />
        {view.legs.map((leg) => (
          <MatchRow
            key={leg.view.match.id}
            view={leg.view}
            full={false}
            lead={<LegLead leg={leg} />}
          />
        ))}
        {missing ? (
          <li className="match-row" data-state="scheduled">
            <span data-t="label">
              {view.legs[0]?.label === "2차전" ? "1차전" : "2차전"}
            </span>
            <span className="col-span-3 text-[12.5px] text-ink-2">
              일정 미정
            </span>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

/** 합산 줄 — 라운드 경기 줄과 같은 칸(킥오프 칸 = "합산") */
function AggregateRow({ view }: { view: TieView }) {
  const { tie } = view;
  return (
    <li
      data-state={tie.aggregate ? "finished" : "scheduled"}
      data-aggregate=""
      className="match-row match-row-full"
    >
      <span data-t="label">합산</span>
      <TeamLink team={view.first} data-h="">
        <TeamName team={view.first} />
        <TeamBadge team={view.first} size="s" />
      </TeamLink>
      <span data-s="">
        {tie.aggregate ? (
          <Score h={tie.aggregate.first} a={tie.aggregate.second} />
        ) : (
          <span className="match-state">예정</span>
        )}
      </span>
      <TeamLink team={view.second} data-a="">
        <TeamBadge team={view.second} size="s" />
        <TeamName team={view.second} />
      </TeamLink>
      {view.note ? (
        <span data-x="" data-tie-note="">
          {tie.state === "decided" ? (
            <b className="font-extrabold text-ink">{view.note}</b>
          ) : (
            view.note
          )}
        </span>
      ) : null}
    </li>
  );
}

/** 차전 줄의 킥오프 칸 — "1차전" + KST 날짜("03.10" — 킥오프 시각은 일정·결과 탭과 보조 글자) */
function LegLead({ leg }: { leg: TieLegView }) {
  return (
    <span data-t="label">
      {leg.label}
      <time
        dateTime={kstDate(leg.view.match.kickoff)}
        className="mt-0.5 block font-numeric text-[12px] font-semibold tabular-nums"
      >
        {formatKst(leg.view.match.kickoff, "monthDay")}
      </time>
    </span>
  );
}
