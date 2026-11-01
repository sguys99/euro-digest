/**
 * A매치 기간 판정 (PRD FR-71, plan M3-05) — 화면(홈 대표팀 섹션 자동 노출 M3-13 · 휴식기 안내)과 스크립트(발행 게이트 카드 수 하한 —
 * src/lib/rest-period.ts `restPeriodOf`)가 같은 규칙을 쓴다. I/O 없는 순수 함수만 둔다. 입력은 스키마를 통과한
 * `configs/national-team.json` 경기 목록.
 *
 * 규칙
 * - 경기일 = 킥오프의 **KST 날짜**(표시 기준 — 발행일·홈 화면이 KST 날짜다, CLAUDE §8). 변환은 src/lib/time.ts `kstDate`.
 *   KST는 서머타임이 없어 유럽 서머타임 전환과 무관하다. 킥오프 시각 미정(`kickoffTbd`)이면 kickoff의 날짜만 의미가 있으므로 같은
 *   방식으로 KST 날짜를 쓴다(시각 미정 경기는 KFA 일정 날짜를 KST 기준으로 적는다).
 * - 기간 = 경기일 −3일 ~ +3일(양 끝 포함, `NATIONAL_WINDOW_DAYS`).
 * - 경기마다 생긴 기간이 겹치거나 **바로 이어지면**(앞 기간 끝 다음 날 = 뒤 기간 시작) 하나로 합친다 — 한 소집의 두 경기가 끊긴 두
 *   기간으로 나뉘지 않게(예 2026-11-13·11-17 경기 → 11-10 ~ 11-20 한 기간).
 * - 상태: `postponed`(연기 — 새 날짜 미정) 경기는 기간을 만들지 않는다(일정 근거가 사라진 경기 — 근거 없는 노출 금지, CLAUDE §1-7).
 *   연기 뒤 새 날짜가 정해지면 사람이 kickoff·status를 고친다. `scheduled`·`finished`는 기간을 만든다.
 */
import type { NationalMatch } from "@/lib/schema/configs";
import { kstDate, shiftDate } from "@/lib/time";

/** A매치 기간 = 경기일 ±3일(FR-71) */
export const NATIONAL_WINDOW_DAYS = 3;

/** 판정에 필요한 경기 필드 — `configs/national-team.json` `matches[]` */
export type NationalWindowMatch = Pick<
  NationalMatch,
  "id" | "kickoff" | "status"
>;

/** A매치 기간 하나 — KST 날짜 "YYYY-MM-DD", 양 끝 포함 */
export interface NationalWindow {
  from: string;
  to: string;
  /** 이 기간을 만든 경기 id(경기일 순, 같은 날이면 입력 순) */
  matchIds: string[];
}

/** 경기 한 건의 KST 경기일 — 기간을 만들지 않는 경기(연기)면 null */
export function nationalMatchDay(match: NationalWindowMatch): string | null {
  if (match.status === "postponed") return null;
  return kstDate(match.kickoff);
}

/**
 * 경기 목록 → A매치 기간 목록(시작일 순). 겹치거나 바로 이어지는 기간은 합친다(머리 주석).
 * `days`는 테스트·화면 실험용 — 기본 FR-71 ±3일.
 */
export function nationalWindows(
  matches: readonly NationalWindowMatch[],
  days: number = NATIONAL_WINDOW_DAYS,
): NationalWindow[] {
  const dated = matches
    .map((m, index) => ({ id: m.id, day: nationalMatchDay(m), index }))
    .filter(
      (m): m is { id: string; day: string; index: number } => m.day !== null,
    )
    .sort((a, b) =>
      a.day === b.day ? a.index - b.index : a.day < b.day ? -1 : 1,
    );
  const windows: NationalWindow[] = [];
  for (const m of dated) {
    const from = shiftDate(m.day, -days);
    const to = shiftDate(m.day, days);
    const last = windows.at(-1);
    // 겹치거나 바로 이어지면(앞 끝 + 1일 ≥ 뒤 시작) 합친다
    if (last !== undefined && shiftDate(last.to, 1) >= from) {
      if (to > last.to) last.to = to;
      last.matchIds.push(m.id);
    } else {
      windows.push({ from, to, matchIds: [m.id] });
    }
  }
  return windows;
}

/** KST 날짜 `date`("YYYY-MM-DD")가 든 A매치 기간 — 없으면 null */
export function nationalWindowOn(
  date: string,
  matches: readonly NationalWindowMatch[],
  days: number = NATIONAL_WINDOW_DAYS,
): NationalWindow | null {
  return (
    nationalWindows(matches, days).find(
      (w) => w.from <= date && date <= w.to,
    ) ?? null
  );
}

/** KST 날짜 `date`가 A매치 기간인가(FR-71 — 홈 대표팀 섹션 자동 노출 조건) */
export function isNationalWindow(
  date: string,
  matches: readonly NationalWindowMatch[],
  days: number = NATIONAL_WINDOW_DAYS,
): boolean {
  return nationalWindowOn(date, matches, days) !== null;
}
