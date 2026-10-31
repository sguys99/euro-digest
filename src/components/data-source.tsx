import { FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";
import type { DataSourceView } from "@/lib/data-source";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * 데이터 출처 줄 (PRD FR-45 · D27, DESIGN §9.3 "대회 화면 틀" 데이터 출처 줄, plan M2-16) — 대회·팀·홈 위젯·`/tonight` 공용.
 *
 * "**데이터** football-data.org — {무엇} {MM.DD HH:MM} KST 갱신 [· **업데이트 지연**] [· {무엇} API-Football] · Football data provided by the
 * Football-Data.org API". 12.5px/1.5 `--ink-2`, "데이터" 800 `--ink`, "업데이트 지연" 800 `--brand-accent-text`(글자 — 색만으로 전하지
 * 않는다). 필수 영문 문구는 약관 7.1 원문 그대로 `lang="en"`. 갱신 시각·지연 판정은 src/lib/data-source.ts(가장 오래된 `updatedAt` · 36시간).
 * 서버 컴포넌트 — JS 0.
 */
export function DataSourceNote({
  source,
  covers,
  apiFootball = null,
  scope,
  className,
}: {
  source: DataSourceView;
  /** football-data.org가 준 것("순위·경기·득점" 등) */
  covers: string;
  /** API-Football이 준 것("팀시트·포메이션" 등) — 그 데이터를 싣지 않은 화면은 null(병기하지 않는다) */
  apiFootball?: string | null;
  /** 어느 화면의 줄인지(`data-scope` — 검사용) */
  scope: "competition" | "team" | "home" | "tonight";
  className?: string;
}) {
  const { updatedAt, stale } = source;
  return (
    <p
      data-slot="data-source"
      data-scope={scope}
      className={cn("text-[12.5px] leading-normal text-ink-2", className)}
    >
      <b className="font-extrabold text-ink">데이터</b> football-data.org —{" "}
      {covers}
      {updatedAt ? (
        <>
          {" "}
          <time dateTime={updatedAt} className="tabular-nums">
            {formatKst(updatedAt, "short")} KST
          </time>{" "}
          갱신
        </>
      ) : null}
      {stale ? (
        <>
          {" "}
          ·{" "}
          <b
            data-slot="data-source-stale"
            className="font-extrabold text-brand-accent-text"
          >
            업데이트 지연
          </b>
        </>
      ) : null}
      {apiFootball ? <> · {apiFootball} API-Football</> : null} ·{" "}
      <span lang="en">{FOOTBALL_DATA_ATTRIBUTION}</span>
    </p>
  );
}
