/**
 * 대회 화면 모델 — 순위표·구간·순위 변동·폼·라운드·득점 순위 (PRD FR-40~45, DESIGN §9.3 "D1 — 대회·팀 화면", plan M2-10·M2-11)
 *
 * I/O 없는 순수 함수만 둔다(파일 읽기는 src/lib/data/competition-page.ts, 그리기는 src/components/competition/*). 지금 시각은
 * 호출부가 넣는다(빌드 시각 — 테스트는 고정 값). 시각 표시는 src/lib/time.ts만 쓴다(CLAUDE §8 — 저장 UTC · 표시 KST).
 *
 * 규칙(근거)
 * - **순위 변동**(M2-03 · DESIGN §9.3 순위 변동): `prevPos − pos` > 0 상승 · < 0 하락 · 0 변동 없음("–") · `prevPos` null = 전날 자료 없음
 *   (첫 수집·승격 팀 — 빈칸 + 화면 밖 "변동 자료 없음", DESIGN §9.3. "–"는 '변동 없음'이라는 사실이라 자료가 없을 때 쓰지 않는다).
 * - **폼**(M2-03): `form` 0~5칸, 오래된 → 최근(최근이 오른쪽). 모자란 칸은 앞쪽(오래된 쪽) "자료 없음".
 * - **구간**(FR-42 · M2-01): `configs/competitions.json` zones를 `standingZoneOf`로 순위 **숫자**에 대어 판정(동순위는 같은 구간).
 *   규칙이 없는 구간(유럽 대항전 진출 — 2027-03 전후 추가)은 그리지 않는다. 구간 머리 줄은 구간이 바뀌는 첫 행 앞에, 구간 뒤로
 *   구간 밖 행이 이어지면 "구간 없음 {n}위 아래"(UCL 25위 아래 — DESIGN §9.3 구간 표시).
 * - **라운드**(FR-44): 리그·UCL 리그 페이즈는 숫자 라운드, UCL 녹아웃은 `ko-*`(M2-02 어댑터 — 단계 순서 → 차전). 날짜 머리는 킥오프의
 *   KST 날짜. `tbc`면 시각 대신 "임시"(날짜 머리는 데이터의 날짜 — M2-02 이월), 킥오프가 지났는데 `scheduled`면 "결과 대기"(D60),
 *   `postponed`면 "연기", `aet`면 "연장", `pens`면 "승부차기 h–a" 텍스트를 병기한다.
 * - **지금 라운드**: 라운드의 주 기간(킥오프 중앙값 ±4일 — 연기돼 몇 주 뒤로 옮긴 경기는 빼고) 안에 지금이 있으면 "진행 중", 아니면 다음에
 *   시작하는 라운드("예정"), 모두 지났으면 마지막 라운드("종료").
 * - **득점 순위**(FR-41): 배열 순서 = 순위(골 내림차순 — 어댑터), 같은 골은 공동 순위(1, 2, 3, 3, 3 …). 도움·PK·경기 `null`은 "–"
 *   (0으로 바꾸지 않는다). 선수 이름은 D63 ① — 사전 별칭 정확 일치면 한글, 아니면 원어.
 */
import type {
  CompetitionFile,
  Match,
  Scorer,
  StandingRow,
} from "@/lib/schema/competition";
import type { ZoneRule } from "@/lib/schema/configs";
import { standingZoneOf } from "@/lib/standing-zone";
import { formatKst, kstDate, parseUtcIso } from "@/lib/time";

// ─── 팀 ─────────────────────────────────────────────────────────────────────

/** 화면에 그릴 팀 하나 — 한글 이름 + 배지(키트 2색·약어). 색이 없으면 폴백 배지 */
export interface TeamView {
  slug: string;
  /** 한글 팀명(names.ko). 사전에 없으면 slug를 단어로 편 원어(`latin` true) */
  name: string;
  /** 이름이 라틴 글자(사전에 없는 팀) — `lang="en"` */
  latin: boolean;
  /** 배지 약어(team-colors.json `short`) — 색이 없으면 빈 문자열 */
  short: string;
  /** [상의, 하의] — 없으면 폴백 배지 */
  colors: readonly [string, string] | null;
  /** 팀 페이지(`/teams/{slug}/` — M2-13)가 있다 — 이름을 팀 화면 링크로 그린다. 없거나 false면 글자만(없는 페이지로 가는 링크 금지) */
  page?: boolean;
}

/** 팀 slug → 화면 팀(이름·배지) — 호출부가 사전·색 표로 만든다 */
export type TeamLookup = (slug: string) => TeamView;

/** 사전에 없는 팀의 표시 이름 — slug 단어를 대문자로 편다("paris-fc" → "Paris Fc"). 실제로는 validate가 막는다 */
export function fallbackTeamName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── 순위 변동 ──────────────────────────────────────────────────────────────

export type TrendView =
  | { kind: "up"; by: number }
  | { kind: "down"; by: number }
  | { kind: "same" }
  | { kind: "none" };

/** 전날 순위 대비 변동(머리 주석 규칙) */
export function trendOf(pos: number, prevPos: number | null): TrendView {
  if (prevPos === null) return { kind: "none" };
  const diff = prevPos - pos;
  if (diff > 0) return { kind: "up", by: diff };
  if (diff < 0) return { kind: "down", by: -diff };
  return { kind: "same" };
}

// ─── 폼 ─────────────────────────────────────────────────────────────────────

export type FormResult = "W" | "D" | "L";

/** 폼 칸 수(DESIGN §9.3 폼 칩 — 5칸 고정) */
export const FORM_SLOTS = 5;

export const FORM_WORD: Readonly<Record<FormResult, string>> = {
  W: "승",
  D: "무",
  L: "패",
};

export interface FormView {
  /** 5칸, 오래된 → 최근. null = 자료 없음 */
  cells: ReadonlyArray<FormResult | null>;
  /** 자료 있는 경기 수 */
  count: number;
  /** 묶음 `aria-label` */
  label: string;
}

/**
 * 폼 → 5칸 + 읽는 이름. `scope`는 범위 이름("리그" — "최근 리그 경기 …").
 * 예) "최근 리그 경기 자료 2경기 (오래된 순): 승, 패 — 나머지 3경기 자료 없음" · "최근 리그 경기 5경기 (오래된 순): 승, 승, 무, 패, 승" ·
 *     "최근 리그 경기 자료 없음"
 */
export function formView(form: readonly FormResult[], scope: string): FormView {
  const recent = form.slice(-FORM_SLOTS);
  const count = recent.length;
  const cells: Array<FormResult | null> = [
    ...Array<null>(FORM_SLOTS - count).fill(null),
    ...recent,
  ];
  const words = recent.map((r) => FORM_WORD[r]).join(", ");
  let label: string;
  if (count === 0) label = `최근 ${scope} 경기 자료 없음`;
  else if (count === FORM_SLOTS)
    label = `최근 ${scope} 경기 ${count}경기 (오래된 순): ${words}`;
  else
    label = `최근 ${scope} 경기 자료 ${count}경기 (오래된 순): ${words} — 나머지 ${FORM_SLOTS - count}경기 자료 없음`;
  return { cells, count, label };
}

/** 폼 범위 이름 — 리그는 "리그", UCL은 "UCL"(그 대회 경기만 — M2-03) */
export function formScopeOf(comp: CompetitionFile["comp"]): string {
  return comp === "UCL" ? "UCL" : "리그";
}

// ─── 구간 ───────────────────────────────────────────────────────────────────

/**
 * 구간 띠 모양(DESIGN §9.3 구간 표시): 실선 = 확정 구간, 점선 = 플레이오프.
 * - `rel` 강등(레드 실선) · `relpo` 강등 PO(레드 점선 — 라벨에 "PO") · `ko` 16강 직행·진출 구간(잉크 실선) · `po` 플레이오프(잉크 2 점선)
 */
export type ZoneBand = "rel" | "relpo" | "ko" | "po";

/** 구간 규칙 → 띠 모양 */
export function zoneBandOf(rule: Pick<ZoneRule, "zone" | "label">): ZoneBand {
  switch (rule.zone) {
    case "relegation":
      return /PO/.test(rule.label) ? "relpo" : "rel";
    case "playoff":
      return "po";
    default:
      return "ko";
  }
}

/** 구간 범위 표기 — "18–20위" · 한 순위면 "16위" */
export function zoneRangeText(rule: Pick<ZoneRule, "from" | "to">): string {
  return rule.from === rule.to ? `${rule.from}위` : `${rule.from}–${rule.to}위`;
}

export interface StandingRowView {
  row: StandingRow;
  team: TeamView;
  trend: TrendView;
  form: FormView;
  /** 구간 띠 — 구간 밖이면 null */
  band: ZoneBand | null;
  /** 구간 라벨(구간 밖 null) */
  zoneLabel: string | null;
}

/** 표 한 줄 — 구간 머리 줄 또는 팀 행 */
export type StandingLine =
  | {
      kind: "zone";
      /** "강등 구간" · "구간 없음" */
      title: string;
      /** "18–20위" · "25위 아래" */
      range: string;
      /** 띠·괘선 모양 — 구간 밖 꼬리는 "none" */
      band: ZoneBand | "none";
    }
  | { kind: "row"; view: StandingRowView };

/**
 * 순위표 행 → 표 줄(구간 머리 줄 포함, 머리 주석 규칙). 행 순서는 데이터 순서(pos 오름차순 — 어댑터) 그대로.
 * 구간 머리 줄은 같은 규칙의 첫 행 앞에 한 번, 구간 뒤로 구간 밖 행이 오면 "구간 없음 {마지막 구간 끝 + 1}위 아래" 한 번.
 */
export function standingLines(
  rows: readonly StandingRow[],
  rules: readonly ZoneRule[],
  team: TeamLookup,
  formScope: string,
): StandingLine[] {
  const lines: StandingLine[] = [];
  let prevRule: ZoneRule | null = null;
  let seenZone = false;
  let tailShown = false;
  const lastZoneEnd = rules.reduce((max, r) => Math.max(max, r.to), 0);
  for (const row of rows) {
    const mark = standingZoneOf(row.pos, rules);
    const rule =
      mark.zone === "none"
        ? null
        : (rules.find((r) => row.pos >= r.from && row.pos <= r.to) ?? null);
    if (rule && rule !== prevRule) {
      lines.push({
        kind: "zone",
        title: `${rule.label} 구간`,
        range: zoneRangeText(rule),
        band: zoneBandOf(rule),
      });
      seenZone = true;
    } else if (!rule && seenZone && !tailShown && row.pos > lastZoneEnd) {
      lines.push({
        kind: "zone",
        title: "구간 없음",
        range: `${lastZoneEnd + 1}위 아래`,
        band: "none",
      });
      tailShown = true;
    }
    prevRule = rule;
    lines.push({
      kind: "row",
      view: {
        row,
        team: team(row.team),
        trend: trendOf(row.pos, row.prevPos),
        form: formView(row.form, formScope),
        band: rule ? zoneBandOf(rule) : null,
        zoneLabel: mark.label,
      },
    });
  }
  return lines;
}

/** 득실 표기 — "+8" · "0" · "−3"(마이너스 기호 U+2212 — 하이픈보다 숫자 폭에 맞는다) */
export function goalDiffText(gf: number, ga: number): string {
  const d = gf - ga;
  if (d > 0) return `+${d}`;
  if (d < 0) return `−${-d}`;
  return "0";
}

/** 표 아래 범례의 순위 변동 문구 — 전날 자료가 한 행이라도 있으면 "전날 대비", 없으면 "전날 자료 없음" */
export function trendLegendText(rows: readonly StandingRow[]): string {
  return rows.some((r) => r.prevPos !== null) ? "전날 대비" : "전날 자료 없음";
}

// ─── 경기 · 라운드 ──────────────────────────────────────────────────────────

/** 경기 상태 표시 — finished 결과 · scheduled 예정 · pending 결과 대기(킥오프 지남) · postponed 연기 */
export type MatchState = "finished" | "scheduled" | "pending" | "postponed";

export interface MatchView {
  match: Match;
  home: TeamView;
  away: TeamView;
  state: MatchState;
  /** 킥오프 KST "20:30" — `tbc`면 null("임시") */
  time: string | null;
  /** 날짜 머리 "10.10 (토)" */
  day: string;
  /** 연장·승부차기 보조 문구(없으면 null) — "연장" · "연장 · 승부차기 4–3" */
  extra: string | null;
}

/** 킥오프 뒤 이만큼 지나도 `scheduled`면 "결과 대기"(정규 시간 + 여유 — 진행 중 경기를 결과 대기라 부르지 않게) */
export const RESULT_PENDING_AFTER_MS = 3 * 60 * 60 * 1000;

/** 경기 → 표시 상태(머리 주석 규칙) */
export function matchStateOf(match: Match, nowMs: number): MatchState {
  if (match.status === "finished") return "finished";
  if (match.status === "postponed") return "postponed";
  if (match.tbc) return "scheduled";
  return parseUtcIso(match.kickoff).getTime() + RESULT_PENDING_AFTER_MS <= nowMs
    ? "pending"
    : "scheduled";
}

/** 연장·승부차기 보조 문구 */
export function matchExtraText(match: Match): string | null {
  const score = match.score;
  if (!score) return null;
  if (score.pens) return `연장 · 승부차기 ${score.pens.h}–${score.pens.a}`;
  if (score.aet) return "연장";
  return null;
}

export function matchView(
  match: Match,
  team: TeamLookup,
  nowMs: number,
): MatchView {
  return {
    match,
    home: team(match.home),
    away: team(match.away),
    state: matchStateOf(match, nowMs),
    time: match.tbc ? null : formatKst(match.kickoff, "time"),
    day: formatKst(match.kickoff, "dayShort"),
    extra: matchExtraText(match),
  };
}

/** 한 팀 입장의 결과(승부차기는 무 — FIFA·UEFA 기록 규칙, M2-03 폼과 같다) */
export function resultFor(match: Match, team: string): FormResult | null {
  if (match.status !== "finished" || !match.score) return null;
  const { h, a } = match.score;
  if (h === a) return "D";
  const homeWon = h > a;
  return (match.home === team) === homeWon ? "W" : "L";
}

/** 그 대회에서 한 팀의 최근 종료 경기(오래된 → 최근, 최대 `limit`) — 375 행 펼침 경기 목록 */
export function recentMatchesOf(
  matches: readonly Match[],
  team: string,
  limit: number = FORM_SLOTS,
): Match[] {
  return matches
    .filter(
      (m) =>
        m.status === "finished" &&
        m.score !== null &&
        (m.home === team || m.away === team),
    )
    .sort(
      (a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
    )
    .slice(-limit);
}

const KNOCKOUT_STAGES: ReadonlyArray<
  [code: string, label: string, short: string]
> = [
  ["ko-playoff", "녹아웃 PO", "PO"],
  ["ko-r16", "16강", "16강"],
  ["ko-qf", "8강", "8강"],
  ["ko-sf", "4강", "4강"],
  ["ko-final", "결승", "결승"],
];

interface RoundKey {
  /** 정렬 키 — 숫자 라운드 그대로, 녹아웃은 1000 + 단계 × 10 + 차전 */
  order: number;
  /** "9라운드" · "16강 1차전" */
  label: string;
  /** 라운드 이동 버튼 "9R" · "16강 1" */
  short: string;
}

/** 라운드 문자열 → 정렬·표기. 모르는 꼴은 끝으로(원문 그대로) */
export function roundKeyOf(round: string): RoundKey {
  if (/^\d+$/.test(round)) {
    const n = Number(round);
    return { order: n, label: `${n}라운드`, short: `${n}R` };
  }
  for (const [index, [code, label, short]] of KNOCKOUT_STAGES.entries()) {
    if (round === code || round.startsWith(`${code}-`)) {
      const leg = round.slice(code.length + 1);
      const legNo = /^\d+$/.test(leg) ? Number(leg) : 0;
      return {
        order: 1000 + index * 10 + legNo,
        label: legNo ? `${label} ${legNo}차전` : label,
        short: legNo ? `${short} ${legNo}` : short,
      };
    }
  }
  return { order: 9999, label: round, short: round };
}

/** 라운드 앵커 id — `round-9` · `round-ko-r16-1` */
export function roundAnchorId(round: string): string {
  return `round-${round.replace(/[^A-Za-z0-9-]/g, "-")}`;
}

export interface RoundDay {
  /** KST 날짜 "YYYY-MM-DD" */
  date: string;
  /** "10.10 (토)" */
  label: string;
  matches: MatchView[];
}

export interface RoundView {
  round: string;
  id: string;
  label: string;
  short: string;
  /** 주 기간 KST "10.10–10.13"(하루면 "10.10") */
  range: string;
  days: RoundDay[];
  finished: number;
  /** 예정 + 결과 대기 + 연기 */
  upcoming: number;
  /** 주 기간(UTC ms) — 지금 라운드 판정 */
  window: { start: number; end: number };
}

/** 라운드 주 기간에서 뺄 연기 경기 기준 — 킥오프 중앙값에서 이 이상 떨어진 경기(머리 주석) */
const ROUND_OUTLIER_MS = 4 * 24 * 60 * 60 * 1000;

function roundWindow(matches: readonly Match[]): {
  start: number;
  end: number;
} {
  const times = matches
    .filter((m) => m.status !== "postponed")
    .map((m) => parseUtcIso(m.kickoff).getTime())
    .sort((a, b) => a - b);
  const all = times.length
    ? times
    : matches
        .map((m) => parseUtcIso(m.kickoff).getTime())
        .sort((a, b) => a - b);
  const median = all[Math.floor((all.length - 1) / 2)] ?? 0;
  const main = all.filter((t) => Math.abs(t - median) <= ROUND_OUTLIER_MS);
  const start = main[0] ?? median;
  const end = (main.at(-1) ?? median) + RESULT_PENDING_AFTER_MS;
  return { start, end };
}

/** 대회 경기 → 라운드 목록(라운드 순서, 날짜 머리별 경기 — 킥오프 · id 순) */
export function roundsOf(
  matches: readonly Match[],
  team: TeamLookup,
  nowMs: number,
): RoundView[] {
  const byRound = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byRound.get(m.round);
    if (list) list.push(m);
    else byRound.set(m.round, [m]);
  }
  const rounds: RoundView[] = [];
  for (const [round, list] of byRound) {
    const key = roundKeyOf(round);
    const sorted = [...list].sort(
      (a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
    );
    const days: RoundDay[] = [];
    for (const m of sorted) {
      const date = kstDate(m.kickoff);
      const view = matchView(m, team, nowMs);
      const last = days.at(-1);
      if (last && last.date === date) last.matches.push(view);
      else days.push({ date, label: view.day, matches: [view] });
    }
    const window = roundWindow(list);
    const first = formatKst(new Date(window.start).toISOString(), "monthDay");
    const last = formatKst(
      new Date(window.end - RESULT_PENDING_AFTER_MS).toISOString(),
      "monthDay",
    );
    const finished = list.filter((m) => m.status === "finished").length;
    rounds.push({
      round,
      id: roundAnchorId(round),
      label: key.label,
      short: key.short,
      range: first === last ? first : `${first}–${last}`,
      days,
      finished,
      upcoming: list.length - finished,
      window,
    });
  }
  return rounds.sort(
    (a, b) =>
      roundKeyOf(a.round).order - roundKeyOf(b.round).order ||
      a.round.localeCompare(b.round),
  );
}

export type RoundState = "live" | "next" | "done";

export interface CurrentRound {
  index: number;
  state: RoundState;
}

/** 지금 라운드(머리 주석 규칙). 라운드가 없으면 null */
export function currentRoundOf(
  rounds: readonly RoundView[],
  nowMs: number,
): CurrentRound | null {
  if (rounds.length === 0) return null;
  const live = rounds.findIndex(
    (r) => r.window.start <= nowMs && nowMs < r.window.end,
  );
  if (live >= 0) return { index: live, state: "live" };
  const next = rounds.findIndex((r) => r.window.start > nowMs);
  if (next >= 0) return { index: next, state: "next" };
  return { index: rounds.length - 1, state: "done" };
}

/** 머리 부제의 라운드 문구 — "9라운드 진행 중" · "10라운드 10.31 (토) 시작" · "38라운드 종료" */
export function roundStatusText(round: RoundView, state: RoundState): string {
  switch (state) {
    case "live":
      return `${round.label} 진행 중`;
    case "next":
      return `${round.label} ${formatKst(new Date(round.window.start).toISOString(), "dayShort")} 시작`;
    case "done":
      return `${round.label} 종료`;
  }
}

// ─── 득점 순위 ──────────────────────────────────────────────────────────────

export interface ScorerView {
  /** 공동 순위(같은 골 = 같은 순위) */
  rank: number;
  scorer: Scorer;
  /** 표시 이름 — 사전 별칭 정확 일치면 한글, 아니면 원어 */
  name: string;
  /** 원어 표기(라틴) — `lang="en"` */
  latin: boolean;
  team: TeamView;
}

/** 득점 순위(배열 순서) → 공동 순위를 매긴 행 */
export function scorerViews(
  scorers: readonly Scorer[],
  team: TeamLookup,
  koreanName: (en: string) => string | null,
): ScorerView[] {
  const out: ScorerView[] = [];
  scorers.forEach((scorer, index) => {
    const prev = out.at(-1);
    const rank =
      prev && prev.scorer.goals === scorer.goals ? prev.rank : index + 1;
    const ko = koreanName(scorer.player);
    out.push({
      rank,
      scorer,
      name: ko ?? scorer.player,
      latin: ko === null,
      team: team(scorer.team),
    });
  });
  return out;
}

export interface ScorerCut {
  rows: ScorerView[];
  /** 잘린 공동 순위 안내 — "공동 3위 8명 중 3명"(자르지 않았으면 null) */
  tieNote: string | null;
}

/**
 * 앞에서 `limit`명 — 마지막 행이 공동 순위 묶음을 자르면 그 묶음 크기를 함께 알린다(사실대로 — DESIGN §9.3 득점 순위).
 * `maxRank`를 주면 그 순위 밖은 뺀다(표 "n위까지").
 */
export function cutScorers(
  all: readonly ScorerView[],
  limit: number,
  maxRank: number = Number.POSITIVE_INFINITY,
): ScorerCut {
  const inRank = all.filter((s) => s.rank <= maxRank);
  const rows = inRank.slice(0, limit);
  const last = rows.at(-1);
  if (!last) return { rows, tieNote: null };
  const group = all.filter((s) => s.rank === last.rank).length;
  const shown = rows.filter((s) => s.rank === last.rank).length;
  return {
    rows,
    tieNote:
      group > shown ? `공동 ${last.rank}위 ${group}명 중 ${shown}명` : null,
  };
}

/** 자료 없는 수(null)는 "–"(0으로 바꾸지 않는다) */
export function statText(value: number | null): string {
  return value === null ? "–" : String(value);
}

// ─── 데이터 신선도 ──────────────────────────────────────────────────────────

/** `updatedAt`이 빌드 시각보다 이만큼 이상 오래되면 "업데이트 지연"(하루 1회 갱신 — 한 번 거르면 약 48시간이 된다) */
export const COMPETITION_STALE_HOURS = 36;

/** 대회 데이터가 지연됐는가(빌드 시각 기준) */
export function isCompetitionStale(updatedAt: string, nowMs: number): boolean {
  return (
    nowMs - parseUtcIso(updatedAt).getTime() >=
    COMPETITION_STALE_HOURS * 60 * 60 * 1000
  );
}
