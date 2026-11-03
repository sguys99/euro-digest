/**
 * 일별 뉴스 → 월별 병합 계획 (PRD FR-158·§8.4 '90일 일별 → 이후 월별 병합, 영구', plan M5-10 — 2026-11-03 사용자 결정 A안·T1) — 순수 함수만.
 * 파일 읽기·쓰기·로그는 retention-merge-stage.ts(수집 실행), 형식은 `NewsMonthFileSchema`(src/lib/schema/news.ts).
 *
 * 규칙
 * - **달 단위로 한 번**(T1): 그 달(KST 발행일의 달)의 말일 + 90일(`NEWS_DAILY_RETENTION_DAYS`)이 된 날부터(그날 포함) 첫 수집 실행이 그 달
 *   일별 파일을 통째로 `YYYY-MM.json` 하나로 합친다. 예) 2026-10 → 10-31 + 90일 = **2027-01-29**. 그래서 일별 파일은 90~120일 남는다.
 *   매일 덧붙이지 않는 이유: 커지는 월별 파일(약 1MB)을 한 달에 30번 다시 쓰면 git 이력에 사본이 쌓인다(용량 관리 취지와 반대).
 * - 기준 날짜(`today`)는 수집 실행의 KST 발행일이다.
 * - 이미 월별 파일이 있는 달에 일별 파일이 남아 있으면(늦게 들어온 호 등) 그 호를 더한다. 같은 날짜가 양쪽에 있으면 **충돌**로 그 달을
 *   건너뛴다(어느 쪽이 맞는지 정하지 않는다 — 로더도 이 상태에서 던진다, src/lib/data/news.ts).
 * - 호는 바꾸지 않는다 — 일별 파일의 `NewsFile`(date·generatedAt·runId·cards)을 그대로 담는다(병합 전후 같은 화면·카드 ID).
 * - 월별 파일의 `updatedAt` = 이번 실행 시각. 호는 날짜 오름차순.
 */
import {
  NewsMonthFileSchema,
  type NewsFile,
  type NewsMonthFile,
} from "@/lib/schema";
import { shiftDate } from "@/lib/time";

/** 일별 파일로 두는 기간(일) — 그 달 말일부터 센다(T1) */
export const NEWS_DAILY_RETENTION_DAYS = 90;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 달 "YYYY-MM"의 마지막 날 "YYYY-MM-DD" */
export function lastDateOfNewsMonth(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`달 형식(YYYY-MM)이 아님: ${month}`);
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const nextFirst =
    mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, "0")}-01`;
  return shiftDate(nextFirst, -1);
}

/** 그 달을 합치기 시작하는 날(KST 발행일, 그날 포함) = 말일 + 90일 */
export function monthMergeDate(
  month: string,
  days: number = NEWS_DAILY_RETENTION_DAYS,
): string {
  return shiftDate(lastDateOfNewsMonth(month), days);
}

/** 기준 날짜(KST 발행일)에 그 달을 합칠 때인가 */
export function isMonthMergeDue(
  month: string,
  today: string,
  days: number = NEWS_DAILY_RETENTION_DAYS,
): boolean {
  return today >= monthMergeDate(month, days);
}

export interface MonthMergeTarget {
  month: string;
  /** 그 달 일별 파일 날짜(오름차순) */
  dates: string[];
}

/** 일별 파일 날짜 → 이번에 합칠 달과 그 날짜들(달 오름차순). 합칠 때가 안 된 달은 넣지 않는다 */
export function planMonthMerges(
  dailyDates: readonly string[],
  today: string,
  days: number = NEWS_DAILY_RETENTION_DAYS,
): MonthMergeTarget[] {
  const byMonth = new Map<string, string[]>();
  for (const date of [...dailyDates].sort()) {
    const month = date.slice(0, 7);
    if (!isMonthMergeDue(month, today, days)) continue;
    const list = byMonth.get(month) ?? [];
    list.push(date);
    byMonth.set(month, list);
  }
  return [...byMonth]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, dates]) => ({ month, dates }));
}

export type MonthMergeResult =
  | { ok: true; file: NewsMonthFile; added: string[] }
  | { ok: false; conflicts: string[] };

/**
 * 기존 월별 파일(없으면 null) + 그 달 일별 호 → 새 월별 파일. 같은 날짜가 양쪽에 있으면 `ok: false`(충돌 날짜).
 * 일별 호의 date가 그 달이 아니면 던진다(호출부 계획 오류). 결과는 NewsMonthFileSchema로 검증한다.
 */
export function mergeMonthFile(input: {
  month: string;
  existing: NewsMonthFile | null;
  daily: readonly NewsFile[];
  updatedAt: string;
}): MonthMergeResult {
  for (const issue of input.daily) {
    if (issue.date.slice(0, 7) !== input.month) {
      throw new RangeError(`호 ${issue.date}는 ${input.month} 달이 아님`);
    }
  }
  const have = new Set(input.existing?.issues.map((i) => i.date) ?? []);
  const conflicts = input.daily
    .map((i) => i.date)
    .filter((date) => have.has(date))
    .sort();
  if (conflicts.length > 0) return { ok: false, conflicts };
  const issues = [...(input.existing?.issues ?? []), ...input.daily].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  );
  const file = NewsMonthFileSchema.parse({
    month: input.month,
    updatedAt: input.updatedAt,
    issues,
  });
  return {
    ok: true,
    file,
    added: input.daily.map((i) => i.date).sort(),
  };
}

/** 월별 파일의 호 하나를 바꾼 새 파일(삭제 요청 원본 삭제용 — purge-stage.ts). 없는 날짜면 던진다 */
export function replaceMonthIssues(
  file: NewsMonthFile,
  replacements: ReadonlyMap<string, NewsFile>,
  updatedAt: string,
): NewsMonthFile {
  for (const date of replacements.keys()) {
    if (!file.issues.some((i) => i.date === date)) {
      throw new RangeError(`월별 파일 ${file.month}에 호 ${date}가 없음`);
    }
  }
  return NewsMonthFileSchema.parse({
    month: file.month,
    updatedAt,
    issues: file.issues.map((i) => replacements.get(i.date) ?? i),
  });
}
