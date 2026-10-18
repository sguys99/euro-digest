import { StampChip } from "@/components/ui/chip";
import {
  SEASON_LABEL,
  type PublishSchedule,
  type SeasonSpan,
} from "@/lib/about";
import { formatKst, kstDayRangeUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * 계절별 발행 시각표 (M1-36 `/about#schedule` — PRD §15 D26, DESIGN §1 원칙 3 "숫자가 주인공")
 *
 * 행 = 공개 목표 시각(Barlow 800 `--num-score` 크기 — 템플릿 스코어와 같은 큰 숫자) + KST · 계절 이름(800) + 그 계절의 첫 호 ~ 마지막 호.
 * 지금 계절이 위, 다음 계절이 아래(시간 순). 지금 행은 시각이 `--brand-accent`(5줄 등번호와 같은 큰 숫자 레드)이고 "지금" 도장을 단다 —
 * 색만으로 전하지 않는다(DESIGN §10). 시각·날짜는 모두 src/lib/about.ts가 time.ts로 계산한 값이다(07:00 고정 문구 없음).
 */
export function ScheduleTable({ schedule }: { schedule: PublishSchedule }) {
  return (
    <ol role="list" className="border-t border-ink">
      <ScheduleRow span={schedule.current} current />
      <ScheduleRow span={schedule.next} current={false} />
    </ol>
  );
}

/** 발행일 라벨 — "2026년 10월 26일 (월)"(연도 생략 가능). 그날 00:00 KST 순간으로 바꿔 formatKst에 넘긴다 */
function issueDate(date: string, withYear: boolean): string {
  return formatKst(kstDayRangeUtc(date).start, withYear ? "fullDate" : "date");
}

function ScheduleRow({
  span,
  current,
}: {
  span: SeasonSpan;
  current: boolean;
}) {
  const sameYear = span.from.slice(0, 4) === span.to.slice(0, 4);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 border-b border-rule py-3.5 lg:gap-x-7 lg:py-4">
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-numeric text-num-score leading-none font-extrabold tracking-[0.02em] lining-nums tabular-nums",
            current ? "text-brand-accent" : "text-ink",
          )}
        >
          {span.publish}
        </span>
        <span className="font-numeric text-[13.5px] font-semibold tracking-[0.06em] text-ink-2">
          KST
        </span>
      </p>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-extrabold">
          {SEASON_LABEL[span.season]}
          {current ? <StampChip>지금</StampChip> : null}
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-2">
          {/* 날짜 하나는 한 줄에(좁은 폭에서는 "~" 뒤에서 줄이 바뀐다) */}
          <time dateTime={span.from} className="whitespace-nowrap">
            {issueDate(span.from, true)}
          </time>
          {" ~ "}
          <span className="whitespace-nowrap">
            <time dateTime={span.to}>{issueDate(span.to, !sameYear)}</time> 호
          </span>
        </p>
      </div>
    </li>
  );
}
