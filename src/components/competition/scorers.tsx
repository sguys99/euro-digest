import { TeamBadge } from "@/components/team/team-badge";
import { statText, type ScorerView } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

/**
 * 득점 순위 (PRD FR-41, DESIGN §9.3 "득점 순위 · 득점·도움 상위", D63 ①, plan M2-10)
 *
 * 서버 컴포넌트. 선수 이름은 사전 별칭 정확 일치면 한글, 아니면 원어(`lang="en"`). 공동 순위는 사실대로(같은 숫자 반복 + 잘리면 안내),
 * 자료 없는 값(도움·PK·경기 `null`)은 "–"(0으로 바꾸지 않는다). 소속 = 배지 xs(`aria-hidden`) + 한글 팀명.
 * - `ScorerList`: 순위표 패널 아래 요약(상위 5 — `<ol>` + 순위 숫자 `aria-hidden` + 화면 밖 "n위"; 공동 순위가 있어 목록 순서만으로는
 *   순위가 아니다)
 * - `ScorerTable`: 득점 순위 탭(표 — 화면 밖 caption + `th scope`, 선수 칸 `scope="row"`)
 */

function PlayerName({ view }: { view: ScorerView }) {
  return <span lang={view.latin ? "en" : undefined}>{view.name}</span>;
}

function TeamLine({ view }: { view: ScorerView }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-normal text-ink-2">
      <TeamBadge team={view.team} size="xs" />
      <span lang={view.team.latin ? "en" : undefined}>{view.team.name}</span>
    </span>
  );
}

export function ScorerList({
  rows,
  label,
}: {
  rows: readonly ScorerView[];
  label: string;
}) {
  return (
    <ol role="list" aria-label={label} className="mt-2">
      {rows.map((view) => (
        <li
          key={`${view.scorer.player}-${view.scorer.team}`}
          className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-rule py-2.5"
        >
          <span
            aria-hidden="true"
            className="font-numeric text-[26px] leading-[0.9] font-extrabold tracking-[-0.02em] tabular-nums"
          >
            {view.rank}
          </span>
          <span className="grid min-w-0 gap-1">
            <span className="sr-only">{view.rank}위 </span>
            <span className="text-[15px] leading-[1.25] font-extrabold">
              <PlayerName view={view} />
            </span>
            <TeamLine view={view} />
          </span>
          <span className="text-[12.5px] whitespace-nowrap text-ink-2">
            <b className="mr-0.5 font-numeric text-[26px] leading-none font-extrabold text-ink tabular-nums">
              {view.scorer.goals}
            </b>
            골
          </span>
        </li>
      ))}
    </ol>
  );
}

const TH =
  "border-b border-ink px-1.5 py-2.5 text-left text-xs font-extrabold text-ink-2";
const TD_NUM =
  "border-b border-rule px-1.5 py-2.5 text-right align-middle font-numeric text-[15px] leading-none font-semibold tabular-nums";

export function ScorerTable({
  rows,
  caption,
}: {
  rows: readonly ScorerView[];
  caption: string;
}) {
  return (
    <table className="mt-3 w-full border-collapse text-sm" data-slot="scorers">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={TH}>
            <span aria-hidden="true">#</span>
            <span className="sr-only">순위</span>
          </th>
          <th scope="col" className={TH}>
            선수
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            골
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            도움
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            PK
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            경기
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((view) => (
          <tr key={`${view.scorer.player}-${view.scorer.team}`}>
            <td className="border-b border-rule px-1.5 py-2.5 text-left align-middle font-numeric text-lg leading-none font-extrabold tabular-nums">
              {view.rank}
            </td>
            <th
              scope="row"
              className="border-b border-rule px-1.5 py-2.5 text-left align-middle font-normal"
            >
              <span className="block font-extrabold">
                <PlayerName view={view} />
              </span>
              <span className="mt-1 block">
                <TeamLine view={view} />
              </span>
            </th>
            <td className={cn(TD_NUM, "text-[19px] font-extrabold")}>
              {view.scorer.goals}
            </td>
            <td className={TD_NUM}>{statText(view.scorer.assists)}</td>
            <td className={TD_NUM}>{statText(view.scorer.penalties)}</td>
            <td className={TD_NUM}>{statText(view.scorer.played)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
