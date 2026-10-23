/**
 * 날짜 아카이브 화면 모델 — 이전·다음 호와 달력 점프 (PRD FR-33, plan M1-34)
 *
 * 순수 모듈이다(fs·zod·DOM 없음 — time.ts·issue.ts만). 입력은 발행된 호의 발행일 목록(`data/news` 일별 파일 — 빌드 때
 * src/lib/data/news.ts `listNewsDates`)과 보고 있는 호의 날짜뿐이다. 표현은 시안 A "스텁 넘김"(2026-10-23 사용자 선택) —
 * src/components/news/counterfoil.tsx(티켓 꼬리표 + 월 달력, 서버 컴포넌트)와 펼침 섬 calendar-island.tsx.
 *
 * 규칙
 * - **이전·다음 호는 발행된 호만 오간다** — 결호(파일이 없는 날, 실데이터 2026-10-15·16·19)는 건너뛴다. 호수는 날짜 기준이라
 *   (D29 — 결호가 나도 날짜만큼 는다) 10-14(제 3호)의 다음 호는 10-17(제 6호)이다. 첫 호는 이전 호가, 최신 호는 다음 호가 없다(null).
 * - **달력**은 첫 호의 달 ~ 최신 호의 달을 빠짐없이 잇는다(발행이 하나도 없는 달도 둔다 — 달 이동 범위). 그 밖의 달로는 가지 않는다.
 * - 날 상태: `published`(발행된 호 — 링크) · `missing`(첫 호와 최신 호 사이 결호) · `before`(첫 호 전) · `after`(최신 호 뒤 — 빌드 시점에
 *   아직 발행 전). **링크는 `published`만** 건다(없는 페이지로 가지 않는다 — `dynamicParams = false`라 그 밖의 날짜는 404).
 * - 주 첫 요일은 일요일(한국 달력 관례 · 시안 A 그대로 — `weekStartsOn: 1`이면 월요일 시작).
 * - 날짜는 KST 발행일 "YYYY-MM-DD"의 달력 계산뿐이다(시간대 변환 없음 — 요일은 그 달력 날짜의 요일).
 */
import { issueNumber } from "@/lib/issue";
import { formatKst, kstDayRangeUtc, shiftDate } from "@/lib/time";

// ─── 입력 정리 ──────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제 있는 달력 날짜 "YYYY-MM-DD"인가(2026-02-30 같은 값은 아니다) */
function isCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  try {
    return shiftDate(date, 0) === date;
  } catch {
    return false;
  }
}

/** 발행일 목록 정리 — 실제 달력 날짜만, 중복 없이 오름차순(ISO 날짜라 문자열 정렬 = 날짜 정렬) */
export function sortIssueDates(dates: Iterable<string>): string[] {
  return [...new Set([...dates].filter(isCalendarDate))].sort();
}

// ─── 이전·다음 호 ───────────────────────────────────────────────────────────

/** 호 하나 — 링크 대상 */
export interface IssueLink {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** 제 N호 — 창간일(`FIRST_ISSUE_DATE`) 전이면 null */
  no: number | null;
}

export function issueLink(date: string): IssueLink {
  return { date, no: issueNumber(date) };
}

export interface ArchiveNeighbors {
  /** 보고 있는 호 */
  current: IssueLink;
  /** 바로 앞 호(더 이른 발행일 — 결호는 건너뜀). 첫 호면 null */
  prev: IssueLink | null;
  /** 바로 뒤 호(더 늦은 발행일 — 결호는 건너뜀). 최신 호면 null */
  next: IssueLink | null;
  /** 첫 호(목록에서 가장 이른 발행일) */
  first: IssueLink;
  /** 최신 호(가장 늦은 발행일) — `/news/`가 싣는 호 */
  latest: IssueLink;
  /** 보고 있는 호가 최신 호인가 */
  isLatest: boolean;
  /** 발행된 호 가운데 몇 번째인가(1부터 — 결호는 세지 않는다. 호수 `no`와 다르다) */
  position: number;
  /** 발행된 호 수 */
  total: number;
}

/** 보고 있는 호의 앞뒤 호. 보고 있는 날짜가 발행된 호가 아니면 null */
export function archiveNeighbors(
  dates: Iterable<string>,
  current: string,
): ArchiveNeighbors | null {
  const list = sortIssueDates(dates);
  const index = list.indexOf(current);
  if (index < 0) return null;
  const prev = list[index - 1];
  const next = list[index + 1];
  return {
    current: issueLink(current),
    prev: prev === undefined ? null : issueLink(prev),
    next: next === undefined ? null : issueLink(next),
    first: issueLink(list[0]!),
    latest: issueLink(list.at(-1)!),
    isLatest: next === undefined,
    position: index + 1,
    total: list.length,
  };
}

// ─── 달력 ───────────────────────────────────────────────────────────────────

/**
 * 날 상태 — `published` 발행된 호(링크) · `missing` 첫 호와 최신 호 사이 결호 · `before` 첫 호 전 · `after` 최신 호 뒤(빌드 시점에 아직 발행 전)
 */
export type CalendarDayState = "published" | "missing" | "before" | "after";

export interface CalendarDay {
  /** "YYYY-MM-DD" */
  date: string;
  /** 일(1~31) */
  day: number;
  /** 요일(0 = 일요일 … 6 = 토요일) */
  weekday: number;
  state: CalendarDayState;
  /** 그날의 호수(D29 — 날짜 기준이라 결호에도 번호가 있다). 창간일 전이면 null */
  no: number | null;
  /** 보고 있는 호인가 */
  current: boolean;
}

export interface CalendarMonth {
  /** "YYYY-MM" */
  month: string;
  year: number;
  /** 1~12 */
  monthNumber: number;
  /** 1일 ~ 말일 */
  days: CalendarDay[];
  /** 주 행 — 7칸(`weekdays` 순서), 달 밖 칸(첫 주 앞·마지막 주 뒤)은 null */
  weeks: (CalendarDay | null)[][];
  /** 그 달의 발행일(오름차순) — 비면 발행이 없는 달 */
  issues: string[];
  /** 이동 범위 안 바로 앞 달 "YYYY-MM"(발행이 없는 달일 수 있다). 첫 호의 달이면 null */
  prevMonth: string | null;
  /** 이동 범위 안 바로 뒤 달. 최신 호의 달이면 null */
  nextMonth: string | null;
}

export interface ArchiveCalendar {
  /** 첫 호의 달 ~ 최신 호의 달(빠짐없이, 오름차순) */
  months: CalendarMonth[];
  /** 보고 있는 호의 달 "YYYY-MM" */
  currentMonth: string;
  /** 열 순서 요일(0 = 일요일) — `weekStartsOn`부터 7개 */
  weekdays: number[];
}

export interface ArchiveCalendarOptions {
  /** 주 첫 요일(0 = 일요일 — 기본 · 1 = 월요일) */
  weekStartsOn?: 0 | 1;
}

/** "YYYY-MM"의 [연, 월] */
function monthParts(month: string): [number, number] {
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
}

function monthString(year: number, monthNumber: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`;
}

/** 다음 달 "YYYY-MM" */
function addMonth(month: string): string {
  const [y, m] = monthParts(month);
  return m === 12 ? monthString(y + 1, 1) : monthString(y, m + 1);
}

/** 달 "YYYY-MM"에 달 수를 더한다(음수 가능, 해 넘김) — 달력 비활성 달 버튼의 바로 옆 달 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = monthParts(month);
  const index = y * 12 + (m - 1) + delta;
  return monthString(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1);
}

/** 그 달의 날 수(28~31) — UTC 달력 계산(시간대 무관) */
export function daysInMonth(month: string): number {
  const [y, m] = monthParts(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 달력 날짜의 요일(0 = 일요일) — UTC 달력 계산(시간대 무관) */
export function weekdayOf(date: string): number {
  const [y, m, d] = [
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  ];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 첫 달 ~ 끝 달 "YYYY-MM"(양 끝 포함, 오름차순) */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let month = from; month <= to; month = addMonth(month)) out.push(month);
  return out;
}

function dayState(
  date: string,
  published: ReadonlySet<string>,
  first: string,
  latest: string,
): CalendarDayState {
  if (published.has(date)) return "published";
  if (date < first) return "before";
  if (date > latest) return "after";
  return "missing";
}

/**
 * 달력 모델 — 첫 호의 달 ~ 최신 호의 달, 각 달의 날 상태·주 행·이동 범위. 보고 있는 날짜가 발행된 호가 아니면 null.
 */
export function archiveCalendar(
  dates: Iterable<string>,
  current: string,
  options: ArchiveCalendarOptions = {},
): ArchiveCalendar | null {
  const list = sortIssueDates(dates);
  if (!list.includes(current)) return null;
  const weekStartsOn = options.weekStartsOn ?? 0;
  const published = new Set(list);
  const first = list[0]!;
  const latest = list.at(-1)!;
  const range = monthRange(first.slice(0, 7), latest.slice(0, 7));
  const weekdays = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);

  const months = range.map((month, index): CalendarMonth => {
    const [year, monthNumber] = monthParts(month);
    const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      return {
        date,
        day: i + 1,
        weekday: weekdayOf(date),
        state: dayState(date, published, first, latest),
        no: issueNumber(date),
        current: date === current,
      } satisfies CalendarDay;
    });
    // 첫 주 앞 빈칸 = 1일의 요일이 열 순서에서 몇 번째인가
    const lead = (days[0]!.weekday - weekStartsOn + 7) % 7;
    const cells: (CalendarDay | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...days,
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = Array.from({ length: cells.length / 7 }, (_, w) =>
      cells.slice(w * 7, w * 7 + 7),
    );
    return {
      month,
      year,
      monthNumber,
      days,
      weeks,
      issues: list.filter((date) => date.startsWith(`${month}-`)),
      prevMonth: range[index - 1] ?? null,
      nextMonth: range[index + 1] ?? null,
    };
  });

  return { months, currentMonth: current.slice(0, 7), weekdays };
}

/** 달력의 그 달(이동 범위 밖이면 undefined) */
export function calendarMonth(
  calendar: ArchiveCalendar,
  month: string,
): CalendarMonth | undefined {
  return calendar.months.find((m) => m.month === month);
}

/**
 * 정적 달 이동 — `month`에서 `direction` 쪽으로 발행된 호가 있는 가장 가까운 달과 **그 달의 첫 호**(앞뒤 모두 — 2026-10-23
 * 오케스트레이터 결정: 달력 월 이동 = 그 달 첫 호 링크). 발행이 없는 달은 건너뛴다(정적 페이지가 없다). 없으면 null(달력 월 버튼 비활성).
 * 제자리에서 달을 넘기는 섬은 만들지 않는다 — 다른 달은 그 달의 호 페이지가 자기 달력으로 보여 준다.
 */
export function monthJumpTarget(
  calendar: ArchiveCalendar,
  month: string,
  direction: -1 | 1,
): { month: string; date: string } | null {
  const index = calendar.months.findIndex((m) => m.month === month);
  if (index < 0) return null;
  for (
    let i = index + direction;
    i >= 0 && i < calendar.months.length;
    i += direction
  ) {
    const target = calendar.months[i]!;
    const date = target.issues[0];
    if (date !== undefined) return { month: target.month, date };
  }
  return null;
}

// ─── 합친 모델 ──────────────────────────────────────────────────────────────

/** 날짜 아카이브 한 화면의 모델 — 앞뒤 호 + 달력 */
export interface ArchiveView extends ArchiveNeighbors {
  calendar: ArchiveCalendar;
}

/** 보고 있는 호의 아카이브 모델. 보고 있는 날짜가 발행된 호가 아니면 null */
export function buildArchiveView(
  dates: Iterable<string>,
  current: string,
  options: ArchiveCalendarOptions = {},
): ArchiveView | null {
  const list = sortIssueDates(dates);
  const neighbors = archiveNeighbors(list, current);
  const calendar = archiveCalendar(list, current, options);
  return neighbors && calendar ? { ...neighbors, calendar } : null;
}

// ─── 표시 문자열 ────────────────────────────────────────────────────────────

/** 요일 한 글자(0 = 일요일) */
export const WEEKDAY_LABELS = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
] as const;

/** 요일 이름("일요일") — 달력 열 머리의 접근 이름 */
export function weekdayName(weekday: number): string {
  return `${WEEKDAY_LABELS[weekday]}요일`;
}

/**
 * 발행일 라벨 "10월 21일 (수)". 기준 날짜(`base`)와 해가 다르면(또는 기준이 없으면) "2026년 10월 21일 (수)".
 * 날짜 라벨이라 그날 KST 00:00으로 바꿔 formatKst에 넘긴다(마스트헤드 스텁과 같은 표기).
 */
export function archiveDateLabel(date: string, base?: string): string {
  const sameYear = base !== undefined && base.slice(0, 4) === date.slice(0, 4);
  return formatKst(kstDayRangeUtc(date).start, sameYear ? "date" : "fullDate");
}

/** 호 라벨 "제 10호 · 10월 21일 (수)" — 호수가 없으면(창간일 전) 날짜만 */
export function issueLinkLabel(link: IssueLink, base?: string): string {
  const date = archiveDateLabel(link.date, base);
  return link.no === null ? date : `제 ${link.no}호 · ${date}`;
}

/** "10월 18일 일요일" — 꼬리표·달력 날의 화면 밖 글자(읽기용 — 보이는 표기는 `counterfoilDate`·일 숫자) */
export function spokenDate(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${weekdayName(weekdayOf(date))}`;
}

/** 꼬리표 날짜 "10.18 (일)" — 카드 절대 시각("10.18 19:26")과 같은 두 자리 월·일 + 요일 한 글자 */
export function counterfoilDate(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)} (${WEEKDAY_LABELS[weekdayOf(date)]})`;
}

/**
 * 첫 호 전 날의 표기 — 창간일(`FIRST_ISSUE_DATE`) 전이면 "창간 전", 창간일 뒤인데 첫 호(목록의 가장 이른 발행일)보다 앞이면 "발행 기록 없음"
 * (보존 기간 뒤 일별 파일이 월별로 합쳐지는 등 — 날짜를 단정하지 않고 사실만, M1-34 리뷰)
 */
export function beforeFirstLabel(date: string): string {
  return issueNumber(date) === null ? "창간 전" : "발행 기록 없음";
}

/** 달 "YYYY-MM" 전체가 창간 전인가(그 달 말일이 창간일보다 앞) — 달력 이전 달 비활성 안내 */
export function monthBeforeFounding(month: string): boolean {
  return (
    issueNumber(`${month}-${String(daysInMonth(month)).padStart(2, "0")}`) ===
    null
  );
}

/**
 * 달력 칸의 화면 밖 글자 — 발행 "제 1호, 10월 12일 월요일"(최신 호면 ", 최신 호"), 결호 "10월 15일, 결호", 첫 호 전 "10월 1일, 창간 전"
 * (창간일 뒤면 "…, 발행 기록 없음" — `beforeFirstLabel`),
 * 최신 호 뒤 "10월 23일, 발행 전". 칸의 보이는 글자(일 숫자·"N호"·"결호"·"최신")는 장식으로 숨기고 이 글자가 뜻을 전한다(시안 그대로).
 */
export function calendarCellLabel(day: CalendarDay, latest: string): string {
  const date = `${Number(day.date.slice(5, 7))}월 ${day.day}일`;
  switch (day.state) {
    case "published": {
      const head = day.no === null ? "" : `제 ${day.no}호, `;
      const tail = day.date === latest ? ", 최신 호" : "";
      return `${head}${date} ${weekdayName(day.weekday)}${tail}`;
    }
    case "missing":
      return `${date}, 결호`;
    case "before":
      return `${date}, ${beforeFirstLabel(day.date)}`;
    case "after":
      return `${date}, 발행 전`;
  }
}

/** 달 라벨 "2026년 10월" */
export function monthLabel(month: string): string {
  const [year, monthNumber] = monthParts(month);
  return `${year}년 ${monthNumber}월`;
}

/** 날짜 아카이브 페이지 제목 "2026년 10월 21일 (수) 뉴스 · 제 10호"(호수가 없으면 날짜 + 뉴스) — 레이아웃 템플릿이 " · 유로 다이제스트"를 붙인다 */
export function archiveTitle(date: string): string {
  const no = issueNumber(date);
  return `${archiveDateLabel(date)} 뉴스${no === null ? "" : ` · 제 ${no}호`}`;
}

/** 날짜 아카이브 화면 밖 h1 "제 9호 · 2026년 10월 20일 (화) 지면"(호수가 없으면 날짜 + 지면) — 시안 A */
export function archiveHeading(date: string): string {
  const no = issueNumber(date);
  return `${no === null ? "" : `제 ${no}호 · `}${archiveDateLabel(date)} 지면`;
}
