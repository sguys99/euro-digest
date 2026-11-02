import Link from "next/link";

import {
  MinutesGutter,
  PlayerLink,
  ResultCell,
} from "@/components/korean-players/player-marks";
import { TeamBadge } from "@/components/team/team-badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { LastNightRowView, LastNightView } from "@/lib/korean-last-night";
import { routes } from "@/lib/paths";
import { formatKst } from "@/lib/time";

import { WIDGET_LINK } from "./tonight";

/**
 * 홈 "어젯밤 한국 선수" (PRD FR-58 · §4.2, DESIGN §9.3 D2 "홈 위젯 (D2)", DECISIONS D2 §4 A 명단 행 · §5 #5, plan M3-11)
 *
 * 서버 컴포넌트 — JS 0(홈 초기 JS · LCP 영향 없음). D1 오늘 밤 · 순위 미니와 같은 얇은 섹션 머리 + 부제("{경기일} 현지 경기 · 제 N호 · 결과는 소속팀 득점 먼저").
 * 행 `44px · 1fr · auto`(간격 10px, 위아래 10px, 아래 1px `--rule`) = 출전 분 거터(28px — 숫자 상태 규칙 + 상태 글자) · 이름(15px 800 — 선수
 * 상세 링크, 누름 영역 44px) + 배지 xs · "{팀} vs {상대}"(12.5px `--ink-2`) · 결과 칸(선수 기준 — 소속팀 득점 먼저 "W 6-1 · 홈", 결과 값은
 * `data-slot="result-value"` — 결과 가리기 M4-15). 출전 0명인 날은 머리에 윤곽 "0" + "출전 0명 · 명단 n명" 한 줄. 아래 "한국 선수 n명 ›".
 * 모델(창 · 대상 · 순서)은 src/lib/korean-last-night.ts — 실을 선수가 없으면 페이지가 이 섹션을 그리지 않는다.
 */
function Row({ row }: { row: LastNightRowView }) {
  return (
    <li
      data-slot="last-night-row"
      data-player={row.slug}
      className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule py-2.5"
    >
      <div>
        <MinutesGutter appearance={row.appearance} narrow />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] leading-[1.25] font-extrabold">
          <PlayerLink slug={row.slug}>{row.nameKo}</PlayerLink>
        </p>
        <p className="mt-1.25 flex items-center gap-1.5 text-[12.5px] leading-[1.3] text-ink-2">
          <TeamBadge team={row.team} size="xs" />
          <span className="min-w-0">
            <span lang={row.team.latin ? "en" : undefined}>
              {row.team.name}
            </span>{" "}
            vs{" "}
            <span lang={row.opponent.latin ? "en" : undefined}>
              {row.opponent.name}
            </span>
          </span>
        </p>
      </div>
      <div>
        <ResultCell
          result={row.result}
          home={row.home}
          goals={row.goals}
          assists={row.assists}
          revealLabel={`${row.nameKo} ${formatKst(row.kickoff, "monthDay")} ${row.opponent.name}전 결과 보기`}
        />
      </div>
    </li>
  );
}

export function KoreanLastNight({
  view,
  issueNo,
  total,
  headingId,
  className,
}: {
  view: LastNightView;
  /** 최신 호 번호(부제) — 없으면 생략 */
  issueNo: number | null;
  /** 등록 선수 수(아래 링크 "한국 선수 n명") */
  total: number;
  headingId: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-slot="last-night"
      className={className}
    >
      <SectionHead
        heading="어젯밤 한국 선수"
        headingId={headingId}
        runningHead="KOREANS"
        thin
      />
      <p className="mt-0.75 text-[13px] text-ink-2 tabular-nums">
        {formatKst(`${view.matchDate}T12:00:00Z`, "dayShort")} 현지 경기
        {issueNo !== null ? ` · 제 ${issueNo}호` : ""} · 결과는 소속팀 득점 먼저
      </p>
      {view.appeared === 0 ? (
        <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2.5 border-b border-rule pt-3 pb-2.5">
          <span
            aria-hidden="true"
            className="font-numeric text-[28px] leading-[0.86] font-extrabold text-transparent tabular-nums [-webkit-text-stroke:1.5px_var(--ink-2)]"
          >
            0
          </span>
          <p className="text-sm leading-[1.4] font-extrabold">
            출전 0명
            <span className="block text-[12.5px] font-normal text-ink-2">
              명단 {view.rows.length}명
            </span>
          </p>
        </div>
      ) : null}
      <ol
        aria-label="어젯밤 경기가 있던 한국 선수"
        className={view.appeared === 0 ? "" : "mt-2 border-t border-rule"}
      >
        {view.rows.map((row) => (
          <Row key={row.slug} row={row} />
        ))}
      </ol>
      <p className="mt-1 flex justify-end">
        <Link href={routes.koreanPlayers()} className={WIDGET_LINK}>
          한국 선수 {total}명
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </section>
  );
}
