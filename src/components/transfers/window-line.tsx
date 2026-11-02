import { cx } from "@/lib/cx";
import type { CompLabel } from "@/lib/home-widgets";
import type { CompId } from "@/lib/schema/common";
import { formatKst } from "@/lib/time";
import {
  WINDOW_KIND_LABEL,
  type TransferWindowLineView,
} from "@/lib/transfer-window-view";

/**
 * 이적 창 머리 줄 (PRD FR-105, §15 D68 ①, DESIGN §9.3 D2 "이적 창 머리 줄", plan M4-04) — 서버 컴포넌트(JS 0). 목록 위 한 줄
 * (위 1px `--ink` · 아래 1px `--rule`, 위아래 10px, 13px `--ink-2`). 시각은 KST.
 * - 닫힘 = 도장 "이적 창 닫힘" + 다음 창(설정의 다음 시즌 · 종류 묶음 — "겨울 창 01.01 (금) ~ 02.02 (화)") + "창이 열리면 홈 이적 섹션이 위로 올라가요"
 * - 열림 = `--ink` 면 + `--paper` 글자 · 반전 도장 "이적 창 열림" + "마감 D-n"(KST 날짜 — 0이면 "오늘 마감") + 마감 일시 + 열린 리그
 * - 마감 직후(24시간 유예 — D68 ①) = 반전 + 도장 "마감 직후" + 마감 일시 + 닫힌 리그 + "하루 동안 홈 이적 섹션을 위에 둬요"
 * 리그는 약칭(평탄 탭이 아니라 글자 — 반전 면 위 색 면을 피한다), 정식 이름은 `title`.
 */

function Stamp({ children, inverse }: { children: string; inverse: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex flex-none items-center border px-1.5 pt-0.75 pb-0.5 text-type-stamp font-extrabold tracking-[0.01em]",
        inverse ? "border-paper text-paper" : "border-ink-2 text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

function Comps({
  comps,
  labels,
}: {
  comps: readonly CompId[];
  labels: ReadonlyMap<CompId, CompLabel>;
}) {
  return (
    <span className="whitespace-nowrap">
      {comps.map((c, i) => (
        <span key={c} title={labels.get(c)?.name}>
          {i > 0 ? " · " : ""}
          {labels.get(c)?.short ?? c}
        </span>
      ))}
    </span>
  );
}

const dayTime = (iso: string) =>
  `${formatKst(iso, "dayShort")} ${formatKst(iso, "time")}`;

export function TransferWindowLine({
  line,
  labels,
  className,
}: {
  line: TransferWindowLineView;
  labels: ReadonlyMap<CompId, CompLabel>;
  className?: string;
}) {
  const on = line.mode !== "closed";
  return (
    <p
      data-slot="transfer-window"
      data-mode={line.mode}
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-b py-2.5 text-[13px] leading-normal",
        on
          ? "border-ink bg-ink px-3 text-paper"
          : "border-t-ink border-b-rule text-ink-2",
        className,
      )}
    >
      {line.mode === "open" ? (
        <>
          <Stamp inverse>이적 창 열림</Stamp>
          <b className="font-extrabold">
            {line.daysLeft === 0 ? (
              "오늘 마감"
            ) : (
              <>
                마감{" "}
                <span className="font-numeric text-[15px] tabular-nums">
                  D-{line.daysLeft}
                </span>
              </>
            )}
          </b>
          <span className="tabular-nums">
            <time dateTime={line.closesAt}>{dayTime(line.closesAt)}</time> KST
          </span>
          <span>
            열린 리그 <Comps comps={line.comps} labels={labels} />
          </span>
        </>
      ) : line.mode === "grace" ? (
        <>
          <Stamp inverse>마감 직후</Stamp>
          <span className="tabular-nums">
            <time dateTime={line.closedAt}>{dayTime(line.closedAt)}</time> KST
            마감 · <Comps comps={line.comps} labels={labels} />
          </span>
          <span>하루 동안 홈 이적 섹션을 위에 둬요</span>
        </>
      ) : (
        <>
          <Stamp inverse={false}>이적 창 닫힘</Stamp>
          {line.next ? (
            <span className="tabular-nums">
              다음 {WINDOW_KIND_LABEL[line.next.kind]} 창{" "}
              <b className="font-extrabold text-ink">
                <time dateTime={line.next.opensAt}>
                  {formatKst(line.next.opensAt, "dayShort")}
                </time>{" "}
                ~{" "}
                <time dateTime={line.next.closesAt}>
                  {formatKst(line.next.closesAt, "dayShort")}
                </time>
              </b>
            </span>
          ) : null}
          <span>창이 열리면 홈 이적 섹션이 위로 올라가요</span>
        </>
      )}
    </p>
  );
}
