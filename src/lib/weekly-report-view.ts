/**
 * 한국 선수 주간 리포트 화면 모델 — `/korean-players/weekly/`(아카이브 색인) · `/korean-players/weekly/[week]/`(한 주)
 * (PRD FR-90~93 · §15 D64 ③④⑥ · D65 ①~③, DESIGN §9.3 D2 주간 지면 틀 · MVP 머리기사 · MVP 점수 · 출전 기록 박스 · 90분 막대 · 문단 블록,
 * DECISIONS D2 §4 C · §6 #10 · §8, plan M3-12)
 *
 * I/O 없는 순수 모듈 — 로더(src/lib/data/weekly-report.ts)가 리포트 파일 · 설정 · 현황 파일 · 사전을 읽어 넘긴다. 화면은 원장을 읽지 않는다(D33).
 *
 * 규칙
 * - **기간**: 리포트 `from`·`to`는 UTC 월 00:00 ~ 일 23:59:59.999(D65 ① — 경기일 기준). 표시는 그 **UTC 날짜**("10.19 (월) ~ 10.25 (일)")에
 *   "경기일 기준"을 붙인다 — KST로 바꾸면 끝 날짜가 월요일로 밀려 기간이 틀려 보인다. 출전 기록 표의 경기 줄 날짜도 같은 경기일(UTC 날짜,
 *   시각 없음 — DECISIONS D2 §8 #31 사용자 결정 2026-11-01). MVP 근거 줄 일시 · 발행 시각은 KST(src/lib/time.ts).
 * - **순위**: `rows` 순서가 MVP 순위다(생성 코드 — scripts/lib/weekly-kr.ts). 점수는 화면이 같은 규칙(골×3 + 도움×2 + 출전 — FR-92)으로 다시
 *   센다(파일에 점수 칸이 없다). 공동 MVP(`coMvp`)는 큰 이름 = `mvp`(가나다 첫 선수) + '공동' 도장, 나머지는 dek 줄(D65 ②).
 * - **MVP 근거 줄**(dek): 그 주 경기 중 골×3 + 도움×2가 가장 큰 경기(같으면 분 많은 · 이른 경기). 골 · 도움이 있으면 "63분 골"(골 분이 없으면
 *   "1골") + W/D/L + 스코어(결과 칸 — 소속팀 득점 먼저, D64 ③), 없으면 "90분 출전"(D65 ③ — 사실만). 경기 줄이 없는 옛 파일은 근거 줄 없음.
 * - **표 밖 선수**: 설정의 선수 중 표에 없는 선수 — 지금 상태로 이유를 붙인다(5대 리그 밖 · 기록 연결 전 · 그 주 뒤 집계 시작). 이유를
 *   알 수 없으면(표에 없는데 지금은 연결됨) 이유 없이 이름만 싣지 않고 뺀다(지어내지 않는다).
 * - **주 이동**: 발행된 주 중 바로 앞 · 뒤(빠진 주는 건너뛴다). 뒤 주가 없으면 다음 주차와 — 발행 예정일(다음 주 끝 다음 월요일, weekly.yml
 *   월 08:00 KST)이 빌드 날짜(KST) 이후일 때만 — "발행 예정"을 쓴다(지난 예정일은 쓰지 않는다).
 */
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import {
  appearanceOf,
  compMarkOf,
  opponentOf,
  resultOf,
  type AppearanceView,
  type CompMark,
  type OpponentView,
  type ResultView,
  type RosterCompetition,
} from "@/lib/korean-players-view";
import type {
  KoreanPlayer,
  KoreanPlayersDataFile,
  WeeklyReport,
  WeeklyReportMatch,
} from "@/lib/schema/player";
import {
  formatDateDayShort,
  isoWeekOfDate,
  isoWeekRangeUtc,
  kstDate,
  shiftDate,
  utcDate,
} from "@/lib/time";

// ─── 입력 ───────────────────────────────────────────────────────────────────

export interface WeeklyViewContext {
  /** `configs/korean-players.json`(설정 순서) */
  players: readonly KoreanPlayer[];
  /** `data/players/korean.json` — 표 밖 선수 이유(집계 시작일)에만 쓴다. 없으면 null */
  data: KoreanPlayersDataFile | null;
  competitions: readonly RosterCompetition[];
  team: TeamLookup;
  teamNameKo: (en: string) => string | null;
  competitionNameKo: (en: string) => string | null;
}

// ─── 출력 ───────────────────────────────────────────────────────────────────

/** 주차 이름 — "2026-43" → W43 · 2026년 43주 */
export interface WeekName {
  week: string;
  /** "W43" */
  short: string;
  /** "2026년 43주" */
  long: string;
}

/** 기간(경기일 기준 UTC 날짜) */
export interface WeekRangeView {
  /** UTC ISO(리포트 값 그대로) */
  from: string;
  to: string;
  /** "10.19 (월)" */
  fromLabel: string;
  /** "10.25 (일)" */
  toLabel: string;
}

/** MVP 근거 줄(dek) — 한 경기 */
export interface EvidenceView {
  kickoff: string;
  opponent: OpponentView;
  home: boolean;
  /** 골 · 도움 글자("63분 골" · "1골 · 1도움") — 없으면 null(출전 글자를 쓴다) */
  scoring: string | null;
  /** 결과 — 스코어 정보가 없으면 null */
  result: ResultView | null;
  /** 골 · 도움이 없을 때 출전 글자("90분 출전" · "교체 출전") */
  played: string;
}

export interface MvpView {
  slug: string;
  nameKo: string;
  team: TeamView;
  position: string;
  evidence: EvidenceView | null;
}

/** 표의 경기 줄(1024 이상) · 90분 막대 한 칸 */
export interface WeeklyMatchView {
  key: string;
  kickoff: string;
  comp: CompMark;
  opponent: OpponentView;
  appearance: AppearanceView;
  /** 90분 막대 채움(0~100 정수) — 값이 없으면 0 */
  fill: number;
  /** 막대 모양: 출전(채움) · 벤치(빈 막대) · 값 없음(점선 — 명단 제외 · 라인업 없음) */
  bar: "played" | "bench" | "none";
}

export interface WeeklyRowView {
  slug: string;
  nameKo: string;
  team: TeamView;
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  points: number;
  mvp: boolean;
  /** 경기 줄이 없는 옛 파일이면 null(막대 · 경기 줄 없음) */
  matches: WeeklyMatchView[] | null;
}

export interface ExcludedGroupView {
  reason: string;
  names: string[];
}

/** 주 이동 한쪽 — 발행된 주면 링크, 아니면 꺼진 상자 + 이유 */
export type WeekStepView =
  | { kind: "link"; name: WeekName }
  | { kind: "off"; name: WeekName; reason: string };

export interface WeeklyReportView {
  name: WeekName;
  range: WeekRangeView;
  generatedAt: string;
  mvp: MvpView | null;
  coMvp: MvpView[];
  /** MVP 점수 · 산식(MVP가 있을 때) */
  score: {
    points: number;
    goals: number;
    assists: number;
    apps: number;
  } | null;
  summary: { text: string; ai: boolean };
  rows: WeeklyRowView[];
  /** 출전 선수 수(출전 1경기 이상) */
  appeared: number;
  /** 다음 순위 — MVP · 공동 MVP를 뺀 행(표 순서) */
  runnersUp: Array<{ slug: string; nameKo: string; points: number }>;
  excluded: ExcludedGroupView[];
  prev: WeekStepView;
  next: WeekStepView;
}

/** 아카이브 색인 한 줄 */
export interface WeeklyIndexEntry {
  name: WeekName;
  range: WeekRangeView;
  generatedAt: string;
  /** MVP 이름(공동이면 첫 선수) — 출전 0명이면 null */
  mvpName: string | null;
  /** 공동 MVP 수(MVP 포함) — 단독이면 1 */
  mvpCount: number;
  points: number | null;
  rows: number;
  appeared: number;
}

/** 발행 예정 — 최신 호 다음 주차와 예정일(빌드 날짜 이후일 때만) */
export interface WeeklyUpcomingView {
  name: WeekName;
  /** 발행 예정일 KST "YYYY-MM-DD"(월요일) */
  date: string;
  /** "11.02 (월)" */
  label: string;
}

// ─── 규칙 ───────────────────────────────────────────────────────────────────

/** "2026-43" → W43 · 2026년 43주 */
export function weekName(week: string): WeekName {
  const [year, w] = week.split("-");
  return { week, short: `W${w}`, long: `${year}년 ${Number(w)}주` };
}

/** 날짜 값 "YYYY-MM-DD" → "10.19 (월)". 날짜 값이라 시간대를 바꾸지 않는다(src/lib/time.ts `formatDateDayShort`) */
export function dayLabel(date: string): string {
  return formatDateDayShort(date);
}

/** 리포트 기간 → 경기일 기준 UTC 날짜 표기 */
export function weekRangeView(r: { from: string; to: string }): WeekRangeView {
  return {
    from: r.from,
    to: r.to,
    fromLabel: dayLabel(utcDate(r.from)),
    toLabel: dayLabel(utcDate(r.to)),
  };
}

/** MVP 점수(FR-92) — scripts/lib/weekly-kr.ts mvpPoints와 같은 규칙 */
export function weeklyPoints(r: {
  goals: number;
  assists: number;
  apps: number;
}): number {
  return r.goals * 3 + r.assists * 2 + r.apps;
}

/** 다음 ISO 주차 */
export function nextIsoWeek(week: string): string {
  return isoWeekOfDate(shiftDate(utcDate(isoWeekRangeUtc(week).from), 7));
}

/** 이전 ISO 주차 */
export function prevIsoWeek(week: string): string {
  return isoWeekOfDate(shiftDate(utcDate(isoWeekRangeUtc(week).from), -7));
}

/**
 * 그 주차 리포트의 발행 예정일(KST 날짜) — 주가 끝난 다음 월요일(weekly.yml 월 08:00 KST — FR-90). 주의 UTC 월요일 + 7일.
 * 예) "2026-44"(10.26~11.01) → "2026-11-02"
 */
export function plannedPublishDate(week: string): string {
  return shiftDate(utcDate(isoWeekRangeUtc(week).from), 7);
}

/** 최신 호 다음 주차의 발행 예정 — 예정일이 빌드 날짜(KST) 이후일 때만, 아니면 null(지난 예정일은 쓰지 않는다) */
export function upcomingWeek(
  latest: string | null,
  now: Date,
): WeeklyUpcomingView | null {
  if (latest === null) return null;
  const week = nextIsoWeek(latest);
  const date = plannedPublishDate(week);
  if (date < kstDate(now.toISOString())) return null;
  return { name: weekName(week), date, label: dayLabel(date) };
}

/** 경기 줄 → 출전 분 칸(숫자 상태 규칙 — status가 있으니 폴백 추론 없음) */
function appearanceOfMatch(m: WeeklyReportMatch): AppearanceView {
  return appearanceOf(
    {
      status: m.status,
      minutes: m.minutes,
      started: m.status === "start" ? true : m.status === "sub" ? false : null,
    },
    false,
  );
}

function barOf(m: WeeklyReportMatch): WeeklyMatchView["bar"] {
  if (m.status === "bench") return "bench";
  if (m.status === "absent" || m.status === "unknown") return "none";
  return m.minutes === null ? "none" : "played";
}

/** 골 · 도움 글자 — "63분 골" · "12분 · 63분 골" · "1골"(골 분 없음) · "1도움" */
export function scoringText(m: {
  goals: number;
  assists: number | null;
  goalMinutes?: readonly string[] | undefined;
}): string | null {
  const parts: string[] = [];
  if (m.goals > 0) {
    parts.push(
      m.goalMinutes && m.goalMinutes.length === m.goals
        ? `${m.goalMinutes.map((x) => `${x}분`).join(" · ")} 골`
        : `${m.goals}골`,
    );
  }
  if (m.assists !== null && m.assists > 0) parts.push(`${m.assists}도움`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 근거 경기 고르기(머리 주석) — 출전한 경기 중 골×3 + 도움×2 → 분 → 이른 킥오프 */
export function evidenceMatch(
  matches: readonly WeeklyReportMatch[],
): WeeklyReportMatch | null {
  const played = matches.filter(
    (m) =>
      m.status === "start" ||
      m.status === "sub" ||
      m.goals > 0 ||
      (m.assists ?? 0) > 0,
  );
  const score = (m: WeeklyReportMatch) => m.goals * 3 + (m.assists ?? 0) * 2;
  const sorted = [...played].sort(
    (a, b) =>
      score(b) - score(a) ||
      (b.minutes ?? 0) - (a.minutes ?? 0) ||
      a.kickoff.localeCompare(b.kickoff),
  );
  return sorted[0] ?? null;
}

function evidenceOf(
  matches: readonly WeeklyReportMatch[] | undefined,
  ctx: WeeklyViewContext,
): EvidenceView | null {
  if (!matches) return null;
  const m = evidenceMatch(matches);
  if (!m) return null;
  const appearance = appearanceOfMatch(m);
  return {
    kickoff: m.kickoff,
    opponent: opponentOf(m.opponent, ctx.team, ctx.teamNameKo),
    home: m.home,
    scoring: scoringText(m),
    result: resultOf(m),
    played:
      appearance.tone === "on"
        ? `${appearance.text}분 출전`
        : `${appearance.label} 출전`,
  };
}

/** 표 밖 선수 묶음(머리 주석) — 이유 순서: 기록 연결 전 → 그 주 뒤 집계 시작 → 5대 리그 밖 */
export function excludedGroups(
  report: Pick<WeeklyReport, "rows" | "to">,
  ctx: Pick<WeeklyViewContext, "players" | "data">,
): ExcludedGroupView[] {
  const inTable = new Set(report.rows.map((r) => r.player));
  const records = new Map((ctx.data?.players ?? []).map((r) => [r.slug, r]));
  const weekEnd = utcDate(report.to);
  const groups = new Map<string, string[]>();
  const add = (reason: string, name: string) =>
    groups.set(reason, [...(groups.get(reason) ?? []), name]);
  for (const p of ctx.players) {
    if (inTable.has(p.slug)) continue;
    const since = records.get(p.slug)?.since ?? null;
    if (p.comp === "OTHER" || !p.active) add("5대 리그 밖", p.nameKo);
    else if (p.apiFootballId === null || since === null)
      add("기록 연결 전", p.nameKo);
    else if (since > weekEnd)
      add(
        `${Number(since.slice(5, 7))}월 ${Number(since.slice(8))}일부터 집계`,
        p.nameKo,
      );
  }
  const order = (reason: string) =>
    reason === "기록 연결 전" ? 0 : reason === "5대 리그 밖" ? 2 : 1;
  return [...groups]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([reason, names]) => ({ reason, names }));
}

/** 주 이동 한쪽 — 발행된 이웃 주(빠진 주 건너뜀), 없으면 바로 옆 주차 + 이유 */
function stepOf(
  published: readonly string[],
  week: string,
  dir: "prev" | "next",
  upcoming: WeeklyUpcomingView | null,
): WeekStepView {
  const sorted = [...published].sort();
  const neighbour =
    dir === "prev"
      ? sorted.filter((w) => w < week).at(-1)
      : sorted.find((w) => w > week);
  if (neighbour) return { kind: "link", name: weekName(neighbour) };
  const adjacent = dir === "prev" ? prevIsoWeek(week) : nextIsoWeek(week);
  if (dir === "next" && upcoming && upcoming.name.week === adjacent) {
    return {
      kind: "off",
      name: upcoming.name,
      reason: `${upcoming.label} 발행 예정`,
    };
  }
  return { kind: "off", name: weekName(adjacent), reason: "리포트 없음" };
}

function playerOf(
  slug: string,
  ctx: WeeklyViewContext,
): { nameKo: string; team: TeamView; position: string } {
  const p = ctx.players.find((x) => x.slug === slug);
  if (!p) {
    // 설정에서 빠진 선수(옛 리포트) — slug만 남는다. 팀은 폴백 배지
    return {
      nameKo: slug,
      team: { slug: "", name: "", latin: false, short: "", colors: null },
      position: "",
    };
  }
  return { nameKo: p.nameKo, team: ctx.team(p.team), position: p.position };
}

/** 한 주 화면 모델 */
export function weeklyReportView(
  report: WeeklyReport,
  published: readonly string[],
  ctx: WeeklyViewContext,
  now: Date,
): WeeklyReportView {
  const comps = new Map(ctx.competitions.map((c) => [c.id, c]));
  const mvpSlugs = new Set(
    report.mvp === null ? [] : [report.mvp, ...(report.coMvp ?? [])],
  );
  const rows = report.rows.map((r): WeeklyRowView => {
    const who = playerOf(r.player, ctx);
    return {
      slug: r.player,
      nameKo: who.nameKo,
      team: who.team,
      apps: r.apps,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      points: weeklyPoints(r),
      mvp: mvpSlugs.has(r.player),
      matches: r.matches
        ? r.matches.map((m, i) => ({
            key: `${m.matchId}-${i}`,
            kickoff: m.kickoff,
            comp: compMarkOf(m.comp, m.leagueRaw, comps, ctx.competitionNameKo),
            opponent: opponentOf(m.opponent, ctx.team, ctx.teamNameKo),
            appearance: appearanceOfMatch(m),
            fill:
              m.minutes === null
                ? 0
                : Math.min(100, Math.round((m.minutes / 90) * 100)),
            bar: barOf(m),
          }))
        : null,
    };
  });
  const mvpOf = (slug: string): MvpView => {
    const who = playerOf(slug, ctx);
    const row = report.rows.find((r) => r.player === slug);
    return {
      slug,
      nameKo: who.nameKo,
      team: who.team,
      position: who.position,
      evidence: evidenceOf(row?.matches, ctx),
    };
  };
  const mvpRow = report.mvp
    ? report.rows.find((r) => r.player === report.mvp)
    : undefined;
  const upcoming = upcomingWeek(
    [...published].sort().at(-1) ?? report.week,
    now,
  );
  return {
    name: weekName(report.week),
    range: weekRangeView(report),
    generatedAt: report.generatedAt,
    mvp: report.mvp ? mvpOf(report.mvp) : null,
    coMvp: (report.coMvp ?? []).map(mvpOf),
    score: mvpRow
      ? {
          points: weeklyPoints(mvpRow),
          goals: mvpRow.goals,
          assists: mvpRow.assists,
          apps: mvpRow.apps,
        }
      : null,
    summary: { text: report.summary, ai: report.summaryAi },
    rows,
    appeared: report.rows.filter((r) => r.apps > 0).length,
    runnersUp: rows
      .filter((r) => !r.mvp)
      .map((r) => ({ slug: r.slug, nameKo: r.nameKo, points: r.points })),
    excluded: excludedGroups(report, ctx),
    prev: stepOf(published, report.week, "prev", upcoming),
    next: stepOf(published, report.week, "next", upcoming),
  };
}

/** 아카이브 색인 한 줄 */
export function weeklyIndexEntry(
  report: WeeklyReport,
  ctx: Pick<WeeklyViewContext, "players">,
): WeeklyIndexEntry {
  const mvpRow = report.mvp
    ? report.rows.find((r) => r.player === report.mvp)
    : undefined;
  const mvpName = report.mvp
    ? (ctx.players.find((p) => p.slug === report.mvp)?.nameKo ?? report.mvp)
    : null;
  return {
    name: weekName(report.week),
    range: weekRangeView(report),
    generatedAt: report.generatedAt,
    mvpName,
    mvpCount: report.mvp ? 1 + (report.coMvp?.length ?? 0) : 0,
    points: mvpRow ? weeklyPoints(mvpRow) : null,
    rows: report.rows.length,
    appeared: report.rows.filter((r) => r.apps > 0).length,
  };
}
