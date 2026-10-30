import type { FormResult, FormView, TrendView } from "@/lib/competition-view";
import { FORM_WORD } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

/**
 * 순위표 표식 — 순위 변동 ▲▼ · 폼 칩 W/D/L · 스코어 (DESIGN §9.3 "순위 변동 ▲▼"·"폼 칩 W/D/L", §10 색 외 표식, M2-11)
 *
 * 서버 컴포넌트. 색만으로 뜻을 전하지 않는다 — ▲▼는 도형 + 숫자(+ 화면 밖 "계단 상승/하락"), 폼은 W·D·L 글자 + 색, 자료 없음은 짧은 선.
 * 승 초록(`--result-win`·`--trend-up`)은 `--paper` 위에만 둔다(DECISIONS D1 §5 #8 — `--paper-2` 위 5.10).
 */

const TREND_SHAPE =
  "block h-1.75 w-2 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]";

/** 순위 변동 — 상승 ▲n · 하락 ▼n · 변동 없음 "–" · 전날 자료 없음 = 빈칸(화면 밖 "변동 자료 없음") */
export function TrendMark({
  trend,
  className,
}: {
  trend: TrendView;
  className?: string;
}) {
  const base =
    "inline-flex min-h-3.25 items-center gap-0.5 font-numeric text-[13px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap tabular-nums";
  switch (trend.kind) {
    case "up":
      return (
        <span data-trend="up" className={cn(base, "text-trend-up", className)}>
          <i aria-hidden="true" className={TREND_SHAPE} />
          <span>{trend.by}</span>
          <span className="sr-only">계단 상승</span>
        </span>
      );
    case "down":
      return (
        <span
          data-trend="down"
          className={cn(base, "text-trend-down", className)}
        >
          <i aria-hidden="true" className={cn(TREND_SHAPE, "rotate-180")} />
          <span>{trend.by}</span>
          <span className="sr-only">계단 하락</span>
        </span>
      );
    case "same":
      return (
        <span data-trend="same" className={cn(base, "text-ink-2", className)}>
          <span aria-hidden="true">–</span>
          <span className="sr-only">변동 없음</span>
        </span>
      );
    case "none":
      return (
        <span data-trend="none" className={cn(base, "text-ink-2", className)}>
          <span className="sr-only">변동 자료 없음</span>
        </span>
      );
  }
}

const CHIP_COLOR: Readonly<Record<FormResult, string>> = {
  W: "text-result-win",
  D: "text-result-draw",
  L: "text-result-loss",
};

/**
 * 폼 칩 한 칸 — 글자 + 1.5px 현재 글자색 테두리. `result` null = 자료 없음(가운데 8×2 짧은 선). 모양은 globals.css §10 `form-chip`
 * (순위표 20행 × 5칸이 두 번 — 표·펼침 — 반복돼 짧은 유틸리티로 묶었다)
 */
export function FormChip({
  result,
  className,
}: {
  result: FormResult | null;
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={cn(
        "form-chip",
        result === null ? "form-chip-none" : CHIP_COLOR[result],
        className,
      )}
    >
      {result}
    </i>
  );
}

/** 폼 칩 5칸 묶음 — `role="img"` + 읽는 이름(칸은 장식) */
export function FormChips({
  form,
  className,
}: {
  form: FormView;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={form.label}
      className={cn("inline-flex flex-none gap-0.75 align-middle", className)}
    >
      {form.cells.map((result, i) => (
        <FormChip key={i} result={result} />
      ))}
    </span>
  );
}

/** 결과 칩 1개 + 화면 밖 결과 낱말("승") — 경기 줄 앞(375 펼침·팀 일정) */
export function ResultChip({ result }: { result: FormResult }) {
  return (
    <>
      <FormChip result={result} />
      <span className="sr-only">{FORM_WORD[result]}</span>
    </>
  );
}

/** 스코어 "2-1" — 하이픈은 장식, 화면 밖 "대"(DESIGN §9.3 일정·결과). 홈-원정 순 */
export function Score({
  h,
  a,
  className,
}: {
  h: number;
  a: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex gap-0.75 font-extrabold", className)}>
      <span>{h}</span>
      <span aria-hidden="true">-</span>
      <span className="sr-only">대</span>
      <span>{a}</span>
    </span>
  );
}
