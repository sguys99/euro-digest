/**
 * 시간 유틸 — UTC 저장 · KST 표시 (CLAUDE.md §8, PRD NFR-10)
 *
 * 규칙
 * 1. **저장은 UTC ISO 8601, 끝이 `Z`** — zod `IsoSchema`(src/lib/schema/common.ts)와 같은 형식만 받는다.
 *    이 모듈이 만드는 시각 문자열은 모두 `Date#toISOString()` 형식(`2026-10-24T19:00:00.000Z`)이다.
 * 2. **표시는 KST** — `DISPLAY_TIME_ZONE`(src/lib/site.ts, Asia/Seoul). 한국은 1988년 이후 서머타임이 없어
 *    사실상 UTC+9 고정이지만, 오프셋을 하드코딩하지 않고 IANA 시간대 데이터(`Intl`)로 계산한다.
 * 3. **시간대 변환은 이 파일에서만** 한다. 다른 파일은 `Intl.DateTimeFormat`·`toLocaleDateString`·
 *    `toLocaleTimeString`·`getTimezoneOffset`·`timeZone:` 옵션·Date 로컬 getter/setter(getHours 등)를
 *    쓰지 않고 이 모듈의 함수를 쓴다 — tests/time.test.ts의 경계 가드가 src/·scripts/를 검사한다.
 * 4. 서버(빌드·scripts)와 브라우저 양쪽에서 쓴다 → 의존성·Node 전용 API 없이 `Intl`·`Date`만 쓰는 순수 함수.
 *    현재 시각이 필요한 함수는 `now`를 인자로 받는다(테스트·정적 빌드에서 결정적).
 * 5. 실행 환경의 시스템 시간대(TZ)와 무관하다 — Date의 UTC 메서드와 timeZone을 명시한 Intl만 쓴다.
 * 6. 잘못된 입력은 `TimeInputError`(RangeError)를 던진다. 파이프라인은 건 단위로 잡아서 그 건만 건너뛴다.
 *
 * 범위 표기: [a, b) = a 포함 · b 제외. 함수마다 끝 경계 규칙을 JSDoc에 적었다.
 *
 * 유럽 서머타임 (EU 지침 2000/84/EC — 5대 리그 공통: 3월·10월 마지막 일요일 01:00 UTC에 전환)
 * | 연도 | 시작(시계 1시간 앞으로) | 종료(시계 1시간 뒤로) |
 * |------|-------------------------|-----------------------|
 * | 2026 | 03-29 01:00Z            | 10-25 01:00Z          |
 * | 2027 | 03-28 01:00Z            | 10-31 01:00Z          |
 * | 2028 | 03-26 01:00Z            | 10-29 01:00Z          |
 * - 런던(EPL): GMT UTC+0 ↔ BST UTC+1 → KST와 9시간 / 8시간 차
 * - 마드리드·로마·베를린·파리: CET UTC+1 ↔ CEST UTC+2 → KST와 8시간 / 7시간 차
 * - 같은 "현지 20:00 킥오프"가 서머타임 종료 후에는 KST로 1시간 늦어지고(04:00 → 05:00),
 *   시작 후에는 1시간 당겨진다(05:00 → 04:00). 위 날짜 전후는 tests/time.test.ts가 고정값으로 검증한다.
 */
import { DISPLAY_TIME_ZONE } from "@/lib/site";

// ─── 상수·타입 ──────────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 요일 한글 약자 — 인덱스는 Date#getUTCDay와 같다(0 = 일요일). */
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 시간 입력이 형식·달력·시간대 규칙에 맞지 않을 때 던진다. */
export class TimeInputError extends RangeError {
  override readonly name: string = "TimeInputError";
}

/** 특정 시간대의 벽시계(현지 시각) 구성 요소. */
export interface TimeParts {
  year: number;
  /** 1~12 */
  month: number;
  /** 1~31 */
  day: number;
  /** 0~23 (24시간제) */
  hour: number;
  minute: number;
  second: number;
  /** 0 = 일요일 … 6 = 토요일 (Date#getUTCDay와 같은 규칙) */
  weekday: number;
}

/**
 * `formatKst` 스타일 (한국어, 24시간제). 예시는 2026-10-24T19:00:00Z(= KST 10월 25일 일요일 04:00).
 * - `date`     → `10월 25일 (일)`
 * - `fullDate` → `2026년 10월 25일 (일)`   (아카이브 제목 등 연도가 필요한 곳)
 * - `time`     → `04:00`
 * - `datetime` → `10월 25일 (일) 04:00`
 * - `short`    → `10.25 04:00`             (월·일·시를 두 자리로 맞춤 — 표에서 tabular-nums 정렬)
 */
export type KstFormatStyle =
  "date" | "fullDate" | "time" | "datetime" | "short";

/**
 * 현지 시각이 서머타임 전환 때문에 없거나(봄 gap) 두 번 있을 때(가을 fold) 고르는 규칙.
 * 이름과 의미는 TC39 Temporal의 `disambiguation` 옵션과 같다.
 * - `compatible`(기본) — fold는 먼저 오는 시각(서머타임 쪽), gap은 전환 전 오프셋으로 해석해 뒤로 민다.
 *   RFC 5545(iCalendar) §3.3.5 규칙이고 Temporal 기본값이다. 우리가 생성하는 .ics(F12)와 해석이 같고,
 *   올바른 형식의 입력이면 절대 던지지 않는다(한 건의 경계 시각이 수집 전체를 멈추지 않게).
 * - `earlier` — 둘 중 이른 시각(gap이면 전환 후 오프셋으로 해석해 앞으로 당김).
 * - `later`   — 둘 중 늦은 시각(gap이면 compatible과 같음).
 * - `reject`  — gap·fold 모두 `TimeInputError`. 수동 입력 검증처럼 애매함을 허용하지 않을 때.
 * 실제 킥오프는 이 시간대(현지 01:00~03:00)에 잡히지 않으므로 여기에 걸리면 데이터 오류일 가능성이 크다.
 */
export type Disambiguation = "compatible" | "earlier" | "later" | "reject";

const DISAMBIGUATIONS: readonly string[] = [
  "compatible",
  "earlier",
  "later",
  "reject",
] satisfies readonly Disambiguation[];

/** UTC ISO 구간. 끝 경계 포함 여부는 반환하는 함수의 JSDoc을 따른다. */
export interface UtcRange {
  start: string;
  end: string;
}

/**
 * KST 시간 창 — `configs/bigmatch-rules.json`의 `window`와 같은 모양("HH:MM", KST).
 * `toKst`가 `fromKst`보다 늦지 않으면(같거나 이르면) 다음 날로 넘어가는 창으로 본다.
 */
export interface KstWindow {
  fromKst: string;
  toKst: string;
}

// ─── 내부 도우미: 파싱·달력 계산 ────────────────────────────────────────────

/** zod `z.iso.datetime()` 기본 옵션과 같은 형식: 초 필수, 소수 초 자릿수 자유, `Z` 필수. */
const UTC_ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const HHMM_RE = /^(\d{2}):(\d{2})$/;
const WEEK_RE = /^(\d{4})-(\d{2})$/;

/** 오류 메시지용 입력 표시(길이 제한). */
function quote(value: unknown): string {
  return JSON.stringify(String(value).slice(0, 64));
}

/** 정규식 그룹 i를 숫자로(없으면 NaN). */
function group(m: RegExpExecArray, i: number): number {
  const v = m[i];
  return v === undefined ? Number.NaN : Number(v);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, month: number): number {
  if (month === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidYmd(y: number, month: number, day: number): boolean {
  return (
    Number.isInteger(y) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(y, month)
  );
}

function isValidHms(h: number, mi: number, s: number): boolean {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}

/**
 * 달력 필드를 UTC로 해석한 epoch ms. 시간대와 무관한 "벽시계 → 숫자" 변환이다.
 * Date.UTC는 0~99년을 1900년대로 바꾸므로 setUTCFullYear를 쓴다.
 */
function fieldsToMs(
  y: number,
  month: number,
  day: number,
  h = 0,
  mi = 0,
  s = 0,
  ms = 0,
): number {
  const d = new Date(0);
  d.setUTCFullYear(y, month - 1, day);
  d.setUTCHours(h, mi, s, ms);
  return d.getTime();
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** 1970-01-01부터 센 날짜 번호(달력 날짜끼리 일수 차이 계산용). */
function epochDay(y: number, month: number, day: number): number {
  return Math.floor(fieldsToMs(y, month, day) / DAY_MS);
}

/** 달력 날짜의 요일(0 = 일요일). */
function weekdayOf(y: number, month: number, day: number): number {
  return new Date(fieldsToMs(y, month, day)).getUTCDay();
}

function ymdString(y: number, month: number, day: number): string {
  return `${pad4(y)}-${pad2(month)}-${pad2(day)}`;
}

/** 날짜 번호 → "YYYY-MM-DD". */
function epochDayToDate(n: number): string {
  const d = new Date(n * DAY_MS);
  return ymdString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** UTC ISO 문자열 → epoch ms. 형식·달력이 틀리면 던진다. */
function parseUtcIsoMs(s: unknown): number {
  if (typeof s !== "string") {
    throw new TimeInputError(`UTC ISO 시각은 문자열이어야 함: ${typeof s}`);
  }
  const m = UTC_ISO_RE.exec(s);
  if (!m) {
    throw new TimeInputError(
      `UTC ISO 8601 형식(YYYY-MM-DDTHH:mm:ss[.sss]Z)이 아님: ${quote(s)}`,
    );
  }
  const [y, month, day, h, mi, sec] = [1, 2, 3, 4, 5, 6].map((i) =>
    group(m, i),
  ) as [number, number, number, number, number, number];
  if (!isValidYmd(y, month, day) || !isValidHms(h, mi, sec)) {
    throw new TimeInputError(`달력에 없는 시각: ${quote(s)}`);
  }
  // 소수 초는 밀리초 3자리까지만 쓴다(그 아래는 버림 — Date의 정밀도).
  const ms = Number((m[7] ?? "").padEnd(3, "0").slice(0, 3));
  return fieldsToMs(y, month, day, h, mi, sec, ms);
}

/** "YYYY-MM-DD" → [y, m, d]. 형식·달력이 틀리면 던진다. */
function parseDate(date: unknown): [number, number, number] {
  if (typeof date !== "string") {
    throw new TimeInputError(`날짜는 문자열이어야 함: ${typeof date}`);
  }
  const m = DATE_RE.exec(date);
  if (!m) {
    throw new TimeInputError(`날짜 형식(YYYY-MM-DD)이 아님: ${quote(date)}`);
  }
  const y = group(m, 1);
  const month = group(m, 2);
  const day = group(m, 3);
  if (!isValidYmd(y, month, day)) {
    throw new TimeInputError(`달력에 없는 날짜: ${quote(date)}`);
  }
  return [y, month, day];
}

/** "HH:MM" → 자정부터의 분. */
function parseHhmm(value: unknown, label: string): number {
  const m = typeof value === "string" ? HHMM_RE.exec(value) : null;
  const h = m ? group(m, 1) : Number.NaN;
  const mi = m ? group(m, 2) : Number.NaN;
  if (!m || !isValidHms(h, mi, 0)) {
    throw new TimeInputError(
      `${label}는 "HH:MM"(00:00~23:59)이어야 함: ${quote(value)}`,
    );
  }
  return h * 60 + mi;
}

// ─── 내부 도우미: 시간대 (Intl) ─────────────────────────────────────────────

/** 시간대별 포매터 캐시 — 생성 비용이 커서 재사용한다(관찰 가능한 부수효과 없음). */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    // 숫자만 뽑아 쓰므로 로케일은 출력 형식이 안정적인 en-US + 라틴 숫자 + 그레고리력으로 고정한다.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    throw new TimeInputError(
      `알 수 없는 시간대(IANA 이름이 아님): ${quote(timeZone)}`,
    );
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** epoch ms → 그 시간대의 벽시계 필드. */
function wallFields(ms: number, timeZone: string): TimeParts {
  const parts = formatterFor(timeZone).formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    // 일부 구형 엔진은 h23을 지정해도 자정을 "24"로 내보낸다 → 0으로 맞춘다.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
    weekday: weekdayOf(year, month, day),
  };
}

/** 그 순간 시간대의 UTC 오프셋(ms, 동쪽이 +). 예) Asia/Seoul → +9h, 런던 BST → +1h. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallFields(ms, timeZone);
  const wallMs = fieldsToMs(w.year, w.month, w.day, w.hour, w.minute, w.second);
  return wallMs - Math.floor(ms / 1000) * 1000;
}

// ─── 공개 API: 현재 시각·파싱 ───────────────────────────────────────────────

/** 저장용 현재 시각(UTC ISO, `toISOString()` 형식). 테스트·재현을 위해 `now`를 주입할 수 있다. */
export function nowUtcIso(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new TimeInputError("유효하지 않은 Date(Invalid Date)");
  }
  return now.toISOString();
}

/**
 * `Z`로 끝나는 UTC ISO 8601 문자열만 받아 Date로 바꾼다. 오프셋(`+09:00`)·초 없는 값·날짜만·
 * 달력에 없는 날짜는 `TimeInputError`. 허용 형식은 zod `IsoSchema`와 같다.
 */
export function parseUtcIso(s: string): Date {
  return new Date(parseUtcIsoMs(s));
}

/** `parseUtcIso`가 받는 값인지(던지지 않는 판별). */
export function isUtcIso(s: unknown): s is string {
  try {
    parseUtcIsoMs(s);
    return true;
  } catch {
    return false;
  }
}

// ─── 공개 API: UTC → 현지(KST) ──────────────────────────────────────────────

/** UTC ISO → 지정 시간대의 벽시계 구성 요소. KST는 `kstParts`를 쓴다. */
export function zonedParts(iso: string, timeZone: string): TimeParts {
  return wallFields(parseUtcIsoMs(iso), timeZone);
}

/** UTC ISO → KST 구성 요소 { year, month, day, hour, minute, second, weekday }. */
export function kstParts(iso: string): TimeParts {
  return zonedParts(iso, DISPLAY_TIME_ZONE);
}

/**
 * UTC ISO → KST 날짜 "YYYY-MM-DD". 뉴스 파일명 `data/news/YYYY-MM-DD.json`·발행일(NewsFile.date)에 쓴다.
 * 예) 06:30 KST 실행 = 전날 21:30Z → KST 당일 날짜. UTC 14:59:59 → 당일, 15:00:00 → 다음 날.
 */
export function kstDate(iso: string): string {
  const p = kstParts(iso);
  return ymdString(p.year, p.month, p.day);
}

/** UTC ISO → KST 표시 문자열(한국어, 24시간제). 스타일은 `KstFormatStyle` 참고. */
export function formatKst(iso: string, style: KstFormatStyle): string {
  const p = kstParts(iso);
  const weekday = WEEKDAYS_KO[p.weekday];
  const date = `${p.month}월 ${p.day}일 (${weekday})`;
  const time = `${pad2(p.hour)}:${pad2(p.minute)}`;
  switch (style) {
    case "date":
      return date;
    case "fullDate":
      return `${p.year}년 ${date}`;
    case "time":
      return time;
    case "datetime":
      return `${date} ${time}`;
    case "short":
      return `${pad2(p.month)}.${pad2(p.day)} ${time}`;
    default: {
      // 타입상 도달 불가 — 런타임 문자열(JSON 등)이 들어온 경우를 막는다.
      const unknownStyle: never = style;
      throw new TimeInputError(
        `알 수 없는 표시 스타일: ${quote(unknownStyle)}`,
      );
    }
  }
}

/**
 * 상대 시간(한국어, KST 달력 기준). 발행 시각 표시용(FR-30). 규칙 — 경과 시간 기준:
 * - 1분 미만 → `방금` / 1시간 미만 → `N분 전` / 24시간 미만 → `N시간 전`
 * - 24시간 이상이면 KST 날짜 차이로: 1일 → `어제`, 2~6일 → `N일 전`
 * - 그보다 오래되면 `formatKst(iso, "date")`(올해) 또는 `"fullDate"`(다른 해)
 * - 미래 시각(시계 오차)은 1분 이내면 `방금`, 그 이상은 `formatKst(iso, "datetime")`
 * 정적 빌드 결과에 굳으면 안 되는 값이라 `now`를 필수로 받는다(클라이언트 섬에서 계산).
 */
export function relativeKst(iso: string, now: Date): string {
  const t = parseUtcIsoMs(iso);
  const nowIso = nowUtcIso(now);
  const diff = now.getTime() - t;
  if (diff < 0) return diff > -MINUTE_MS ? "방금" : formatKst(iso, "datetime");
  if (diff < MINUTE_MS) return "방금";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}분 전`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}시간 전`;
  const then = kstParts(iso);
  const today = kstParts(nowIso);
  const days =
    epochDay(today.year, today.month, today.day) -
    epochDay(then.year, then.month, then.day);
  if (days <= 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return formatKst(iso, then.year === today.year ? "date" : "fullDate");
}

/** UTC ISO → iCalendar(RFC 5545) UTC 형식 `YYYYMMDDTHHMMSSZ` — F12 .ics의 DTSTART·DTEND·DTSTAMP용. */
export function formatIcsUtc(iso: string): string {
  const d = new Date(parseUtcIsoMs(iso));
  return (
    `${pad4(d.getUTCFullYear())}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

// ─── 공개 API: 현지 → UTC ───────────────────────────────────────────────────

/**
 * 현지 벽시계 시각 → UTC ISO. 유럽 현지 킥오프(`"2026-10-24T20:00"`, `Europe/London`) 변환과
 * KST 날짜·시각의 UTC 경계 계산에 쓴다. 입력은 `YYYY-MM-DDTHH:mm` 또는 `YYYY-MM-DDTHH:mm:ss`(오프셋 없음).
 *
 * 서머타임 경계(`Disambiguation` 참고, 기본 `compatible`):
 * - fold(가을, 같은 현지 시각이 두 번): 런던 2026-10-25 01:30 → 먼저 오는 BST 쪽 `00:30Z`
 *   (`later`면 GMT 쪽 `01:30Z`). 마드리드 02:30도 같은 방식으로 CEST 쪽 `00:30Z`.
 * - gap(봄, 현지 시각이 없음): 런던 2027-03-28 01:30 → 전환 전 오프셋(GMT)으로 해석한 `01:30Z`
 *   (= BST 02:30, 1시간 뒤로 밀림. `earlier`면 `00:30Z`).
 * - `reject`면 둘 다 `TimeInputError`.
 */
export function zonedToUtcIso(
  localDateTime: string,
  timeZone: string,
  options: { disambiguation?: Disambiguation } = {},
): string {
  const disambiguation = options.disambiguation ?? "compatible";
  if (!DISAMBIGUATIONS.includes(disambiguation)) {
    throw new TimeInputError(
      `알 수 없는 disambiguation: ${quote(disambiguation)}`,
    );
  }
  const m =
    typeof localDateTime === "string"
      ? LOCAL_DATETIME_RE.exec(localDateTime)
      : null;
  if (!m) {
    throw new TimeInputError(
      `현지 시각 형식(YYYY-MM-DDTHH:mm[:ss], 오프셋 없음)이 아님: ${quote(localDateTime)}`,
    );
  }
  const y = group(m, 1);
  const month = group(m, 2);
  const day = group(m, 3);
  const h = group(m, 4);
  const mi = group(m, 5);
  const sec = m[6] === undefined ? 0 : group(m, 6);
  if (!isValidYmd(y, month, day) || !isValidHms(h, mi, sec)) {
    throw new TimeInputError(`달력에 없는 현지 시각: ${quote(localDateTime)}`);
  }

  // 벽시계를 UTC로 읽은 값 t에서 오프셋을 빼면 실제 순간 u = t − offset(u)이다.
  // 전환은 하루에 많아야 한 번이므로 t ± 1일의 오프셋이 전환 전·후 오프셋 후보를 모두 덮는다.
  const t = fieldsToMs(y, month, day, h, mi, sec);
  const offsetBefore = offsetAt(t - DAY_MS, timeZone);
  const offsetAfter = offsetAt(t + DAY_MS, timeZone);
  const candidates = [...new Set([offsetBefore, offsetAfter])].map(
    (o) => t - o,
  );
  const valid = candidates
    .filter((u) => offsetAt(u, timeZone) === t - u)
    .sort((a, b) => a - b);

  if (valid.length === 1) return toIso(valid[0] as number);

  const sorted = [...candidates].sort((a, b) => a - b);
  const earliest = sorted[0] as number;
  const latest = sorted[sorted.length - 1] as number;
  if (valid.length === 0) {
    // gap: 시계가 앞으로 가서 이 현지 시각이 없다. 전환 전 오프셋(더 작음)으로 해석한 값이 latest.
    if (disambiguation === "reject") {
      throw new TimeInputError(
        `서머타임 시작으로 존재하지 않는 현지 시각: ${quote(localDateTime)} (${timeZone})`,
      );
    }
    return toIso(disambiguation === "earlier" ? earliest : latest);
  }
  // fold: 시계가 뒤로 가서 같은 현지 시각이 두 번 있다(먼저 = 서머타임 쪽).
  if (disambiguation === "reject") {
    throw new TimeInputError(
      `서머타임 종료로 두 번 나타나는 현지 시각: ${quote(localDateTime)} (${timeZone})`,
    );
  }
  return toIso(disambiguation === "later" ? latest : earliest);
}

// ─── 공개 API: 날짜·구간 ────────────────────────────────────────────────────

/** 달력 날짜 "YYYY-MM-DD"에 일수를 더한다(음수 가능). 시간대와 무관한 순수 달력 계산. */
export function shiftDate(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new TimeInputError(`일수는 정수여야 함: ${quote(days)}`);
  }
  const [y, month, day] = parseDate(date);
  return epochDayToDate(epochDay(y, month, day) + days);
}

/**
 * KST 하루의 UTC 구간 [start, end) — end는 다음 날 KST 00:00(제외).
 * 예) "2026-10-25" → { start: 2026-10-24T15:00:00.000Z, end: 2026-10-25T15:00:00.000Z }
 */
export function kstDayRangeUtc(date: string): UtcRange {
  parseDate(date);
  return {
    start: zonedToUtcIso(`${date}T00:00`, DISPLAY_TIME_ZONE),
    end: zonedToUtcIso(`${shiftDate(date, 1)}T00:00`, DISPLAY_TIME_ZONE),
  };
}

/**
 * KST 시간 창의 UTC 구간 [start, end) — `baseKstDate`의 `fromKst`부터,
 * `toKst`가 `fromKst`보다 늦으면 같은 날 `toKst`까지, 아니면(같거나 이르면) 다음 날 `toKst`까지(제외).
 * 예) FR-80 "오늘 밤 볼 경기" { fromKst: "18:00", toKst: "07:00" }, "2026-10-24"
 *     → [2026-10-24T09:00:00.000Z, 2026-10-24T22:00:00.000Z)
 */
export function kstWindowRangeUtc(
  baseKstDate: string,
  window: KstWindow,
): UtcRange {
  parseDate(baseKstDate);
  const from = parseHhmm(window.fromKst, "fromKst");
  const to = parseHhmm(window.toKst, "toKst");
  const endDate = to > from ? baseKstDate : shiftDate(baseKstDate, 1);
  return {
    start: zonedToUtcIso(`${baseKstDate}T${window.fromKst}`, DISPLAY_TIME_ZONE),
    end: zonedToUtcIso(`${endDate}T${window.toKst}`, DISPLAY_TIME_ZONE),
  };
}

/**
 * UTC 시각이 KST 시간 창 [start, end)에 드는지. 자정을 넘는 창을 지원한다(`kstWindowRangeUtc` 참고).
 * 예) 킥오프 2026-10-24T19:00Z(KST 10/25 04:00)는 "2026-10-24" 18:00~07:00 창 안.
 */
export function isWithinKstWindow(
  iso: string,
  window: KstWindow,
  baseKstDate: string,
): boolean {
  const t = parseUtcIsoMs(iso);
  const range = kstWindowRangeUtc(baseKstDate, window);
  return t >= Date.parse(range.start) && t < Date.parse(range.end);
}

// ─── 공개 API: ISO 8601 주차 ────────────────────────────────────────────────

/** 달력 날짜 "YYYY-MM-DD"의 ISO 8601 주차 "YYYY-WW"(연도는 ISO week-year — 목요일이 속한 해). */
export function isoWeekOfDate(date: string): string {
  const [y, month, day] = parseDate(date);
  const n = epochDay(y, month, day);
  const isoWeekday = ((weekdayOf(y, month, day) + 6) % 7) + 1; // 월 = 1 … 일 = 7
  const thursday = new Date((n + 4 - isoWeekday) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const ordinal =
    epochDay(weekYear, thursday.getUTCMonth() + 1, thursday.getUTCDate()) -
    epochDay(weekYear, 1, 1);
  const week = Math.floor(ordinal / 7) + 1;
  return `${pad4(weekYear)}-${pad2(week)}`;
}

/**
 * UTC ISO → 그 순간의 **KST 날짜** 기준 ISO 8601 주차 "YYYY-WW" (WeeklyReport.week, FR-93).
 * 예) 2026-12-27T15:00:00Z(= KST 12/28 월 00:00) → "2026-53", 2027-01-03(일) → "2026-53", 2027-01-04 → "2027-01".
 */
export function isoWeek(iso: string): string {
  return isoWeekOfDate(kstDate(iso));
}

/** ISO week-year의 주 수(52 또는 53). 12월 28일은 항상 그해 마지막 주에 속한다. */
export function isoWeeksInYear(year: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new TimeInputError(`연도는 1~9999 정수여야 함: ${quote(year)}`);
  }
  return Number(isoWeekOfDate(`${pad4(year)}-12-28`).slice(5));
}

/**
 * ISO 주차 "YYYY-WW" → KST 기준 그 주의 UTC 구간 (WeeklyReport.from·to, FR-90 "지난 월~일").
 * - from = KST 월요일 00:00:00.000 (포함)
 * - to   = KST 일요일 23:59:59.999 (포함) = 다음 주 from − 1ms
 * to를 "다음 월요일 00:00"이 아니라 그 직전으로 두는 이유: 그대로 저장·표시해도 일요일로 보이고
 * (`formatKst(to, "date")` → "…(일)"), `from ≤ t ≤ to` 포함 판정이 바로 맞는다.
 * 예) "2026-43" → { from: 2026-10-18T15:00:00.000Z, to: 2026-10-25T14:59:59.999Z }
 * 그해에 없는 주차(예: 52주인 해의 "-53")는 `TimeInputError`.
 */
export function isoWeekRange(week: string): { from: string; to: string } {
  const m = typeof week === "string" ? WEEK_RE.exec(week) : null;
  if (!m) {
    throw new TimeInputError(`ISO 주차 형식(YYYY-WW)이 아님: ${quote(week)}`);
  }
  const year = group(m, 1);
  const w = group(m, 2);
  if (year < 1 || w < 1 || w > isoWeeksInYear(year)) {
    throw new TimeInputError(`${year}년에 없는 ISO 주차: ${quote(week)}`);
  }
  // 1월 4일은 항상 1주차에 속한다 → 그 주의 월요일이 1주차 시작.
  const jan4 = epochDay(year, 1, 4);
  const jan4IsoWeekday = ((weekdayOf(year, 1, 4) + 6) % 7) + 1;
  const monday = jan4 - (jan4IsoWeekday - 1) + (w - 1) * 7;
  const from = zonedToUtcIso(
    `${epochDayToDate(monday)}T00:00`,
    DISPLAY_TIME_ZONE,
  );
  const nextFrom = zonedToUtcIso(
    `${epochDayToDate(monday + 7)}T00:00`,
    DISPLAY_TIME_ZONE,
  );
  return { from, to: toIso(Date.parse(nextFrom) - 1) };
}

// ─── 공개 API: 유럽 서머타임 ────────────────────────────────────────────────

/** 그 달의 마지막 일요일(1~31). */
function lastSunday(year: number, month: number): number {
  const last = daysInMonth(year, month);
  return last - weekdayOf(year, month, last);
}

/**
 * 유럽(EU 지침 2000/84/EC) 서머타임 전환 순간 — 3월·10월 마지막 일요일 01:00 UTC.
 * 영국·스페인·이탈리아·독일·프랑스가 같은 순간에 바뀐다. 테스트 기준점·운영 안내용.
 * - start: 서머타임 시작(시계 1시간 앞으로) / end: 서머타임 종료(시계 1시간 뒤로)
 * 예) 2026 → { start: 2026-03-29T01:00:00.000Z, end: 2026-10-25T01:00:00.000Z }
 */
export function europeanSummerTimeTransitions(year: number): UtcRange {
  if (!Number.isInteger(year) || year < 1996 || year > 9999) {
    // 1996년부터 EU 전역이 10월 마지막 일요일 규칙을 썼다(그 이전은 이 규칙이 아님).
    throw new TimeInputError(`연도는 1996~9999 정수여야 함: ${quote(year)}`);
  }
  return {
    start: toIso(fieldsToMs(year, 3, lastSunday(year, 3), 1)),
    end: toIso(fieldsToMs(year, 10, lastSunday(year, 10), 1)),
  };
}
