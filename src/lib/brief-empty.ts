/**
 * 오늘의 5줄 빈 상태 판정 — S4 가족(DESIGN §9.3 D3 "S4 가족", DECISIONS D3 #11 · #12, PRD §15 D71 ④ · DR-07 · FR-71, plan M5-17).
 * I/O 없는 순수 함수만 둔다(설정 읽기는 부르는 쪽 — src/components/brief/today-brief.tsx). 입력은 스키마를 통과한 configs 값.
 *
 * 판정(DECISIONS D3 #12 — `docs/design/d3/notes-mix.md` §3 그대로)
 * 1. 결과 지연(`emptyReason` `results-pending` — D60)은 늘 오류 상자(`pending`). 경기가 있었던 날이라 비시즌 · 휴식기 판정을 하지 않는다.
 * 2. 날짜 아카이브("이날의 5줄" — `scope: "issue"`)는 늘 경기 없음(`rest`) — 지난 호를 지금 설정으로 다시 쓰지 않는다.
 * 3. 홈(`scope: "today"`) 우선순위: 비시즌(`offSeasonFeature`) → A매치 휴식기(`restPeriodOf(발행일).reasons`에 `international-window`) → 경기 없음.
 * 4. 휴식기 경기 = `nationalWindowOn(발행일)` 기간의 `matchIds`(경기일 ±3일 · 이어지는 기간 합침 · `postponed` 제외), 킥오프 순.
 *    `national-team.json`이 없으면 경기 없음.
 * 5. **결과 노출 0** — 경기 화면 모델에 스코어 · 결과 필드가 없다. 킥오프가 지난 경기는 `past`(화면 "끝남")만 안다.
 *    지남 기준 = `nowMs`(빌드 시각 — 홈 A매치 섹션 `nationalMatchRows`와 같은 기준). 시각 미정(`kickoffTbd`)이면 시각이 뜻이 없어
 *    KST 날짜로만 본다(경기일 < 오늘). 설정이 `finished`면 늘 지남.
 */
import { nationalWindowOn } from "@/lib/national-team";
import {
  offSeasonFeature,
  restPeriodOf,
  type OffSeasonFeature,
} from "@/lib/rest-period";
import type { BriefEmptyReason } from "@/lib/schema/brief";
import type {
  CompetitionsFile,
  NationalMatch,
  NationalTeamFile,
} from "@/lib/schema/configs";
import { formatKst, kstDate, nowUtcIso, parseUtcIso } from "@/lib/time";

/** 휴식기 변형에 싣는 경기 한 건 — 스코어 · 결과 필드는 일부러 없다(결과 노출 0) */
export interface BriefRestMatch {
  id: string;
  /** 킥오프 UTC ISO(`<time datetime>`) */
  kickoff: string;
  /** 큰 날짜 "11.13"(KST) */
  date: string;
  /** 화면 밖 날짜 "11월 13일"(요일은 시각 줄이 말한다) */
  dateLabel: string;
  /** 요일 한 글자 "금" */
  weekday: string;
  /** 킥오프 "23:30"(KST) — 시각 미정이면 null */
  time: string | null;
  opponent: string;
  /** 한국 홈 경기인가 */
  home: boolean;
  /** 대회 표시명 "친선경기" */
  competition: string;
  /** 킥오프가 지났는가 — 화면은 날짜 `--ink-2` + "끝남"만(스코어 없음) */
  past: boolean;
}

export type BriefEmptyState =
  /** 결과 지연(D60) — 5줄 자리 오류와 같은 상자 */
  | { kind: "pending" }
  /** S4 가족 ① 경기 없음 */
  | { kind: "rest" }
  /** S4 가족 ③ 비시즌 */
  | { kind: "off-season"; feature: OffSeasonFeature }
  /** S4 가족 ② A매치 휴식기 — 기간(KST 날짜, 양 끝 포함) + 경기(킥오프 순) */
  | {
      kind: "international";
      window: { from: string; to: string };
      matches: BriefRestMatch[];
    };

export interface BriefEmptyInput {
  /** 발행일(브리핑 파일 date — KST 날짜) */
  date: string;
  emptyReason: BriefEmptyReason;
  /** 홈 오늘의 5줄(`today`) · 날짜 아카이브 이날의 5줄(`issue`) */
  scope: "today" | "issue";
  competitions: CompetitionsFile;
  /** `configs/national-team.json` — 없으면 null(휴식기 판정 안 함) */
  nationalTeam: NationalTeamFile | null;
  /** "끝남" 기준 시각(ms) — 빌드 시각 */
  nowMs: number;
}

const WEEKDAY_RE = /\((.)\)/;

/** 경기 한 건 → 휴식기 변형 화면 모델(결과 필드 없음) */
export function briefRestMatch(
  match: NationalMatch,
  nowMs: number,
): BriefRestMatch {
  const today = kstDate(nowUtcIso(new Date(nowMs)));
  const past =
    match.status === "finished" ||
    (match.kickoffTbd
      ? kstDate(match.kickoff) < today
      : parseUtcIso(match.kickoff).getTime() <= nowMs);
  const day = formatKst(match.kickoff, "date"); // "11월 13일 (금)"
  return {
    id: match.id,
    kickoff: match.kickoff,
    date: formatKst(match.kickoff, "monthDay"),
    dateLabel: day.replace(WEEKDAY_RE, "").trim(),
    weekday: WEEKDAY_RE.exec(day)?.[1] ?? "",
    time: match.kickoffTbd ? null : formatKst(match.kickoff, "time"),
    opponent: match.opponent,
    home: match.home,
    competition: match.competition,
    past,
  };
}

/** 빈 브리핑(mode empty)의 5줄 자리 상태 — 머리 주석의 판정 */
export function briefEmptyState(input: BriefEmptyInput): BriefEmptyState {
  const { date, emptyReason, scope, competitions, nationalTeam, nowMs } = input;
  if (emptyReason === "results-pending") return { kind: "pending" };
  if (scope === "issue") return { kind: "rest" };
  const feature = offSeasonFeature(date, competitions);
  if (feature) return { kind: "off-season", feature };
  if (
    nationalTeam === null ||
    !restPeriodOf(date, { nationalTeam }).reasons.includes(
      "international-window",
    )
  ) {
    return { kind: "rest" };
  }
  const window = nationalWindowOn(date, nationalTeam.matches);
  if (window === null) return { kind: "rest" };
  const inWindow = new Set(window.matchIds);
  const matches = nationalTeam.matches
    .map((m, index) => ({ m, index, at: parseUtcIso(m.kickoff).getTime() }))
    .filter(({ m }) => inWindow.has(m.id) && m.status !== "postponed")
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at - b.at))
    .map(({ m }) => briefRestMatch(m, nowMs));
  if (matches.length === 0) return { kind: "rest" };
  return {
    kind: "international",
    window: { from: window.from, to: window.to },
    matches,
  };
}
