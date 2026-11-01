/**
 * 한국 선수 목록 화면 모델 — `/korean-players/` 리그별 명단 표 (PRD FR-61·FR-64·FR-65, DESIGN §9.3 "D2 — 한국 선수·이적·마이 팀 화면"
 * 선수 명단 행 · 출전 분 거터 · 결과 칸 · 숫자 상태 규칙, DECISIONS D2 §4·§5 #5, plan M3-09)
 *
 * I/O 없는 순수 모듈 — 로더(src/lib/data/korean-players.ts)가 설정·데이터·사전을 읽어 넘긴다. 화면은 원장(`data/matches`)을 읽지 않는다(D33).
 *
 * 규칙
 * - **선수 상태**: `other` = 5대 리그 밖(설정 `comp` "OTHER" 또는 `active: false` — FR-64, 목록에서 빼지 않고 "갱신 중단") ·
 *   `not-linked` = 기록 연결 전(`apiFootballId` 없음, 또는 아직 추적을 시작하지 않아 기록의 집계 시작일 `since`가 없음) · `linked`.
 *   폴백(FR-65 — `provider: "fallback"`)은 상태가 아니라 값 — 분·도움이 null이면 대시로 그린다(0으로 바꾸지 않는다).
 * - **출전 분 거터 — 숫자 상태 규칙**: 분 > 0 = 실선(`on`) · 0 = 윤곽(`zero`) · 값 없음 = 대시(`null`). 상태 글자를 늘 함께 쓴다 —
 *   로그 `status`가 있으면 선발 · 교체 · 벤치(0 윤곽) · 명단 제외(대시) · 라인업 없음(대시), 없으면(옛 파일) `started`·`minutes`로 추론 —
 *   선발 · 교체 · 미출전(분 0 — 벤치와 명단 제외를 나눌 수 없다) · 라인업 없음(분 null).
 * - **결과 칸 — 스코어 맥락 규칙(D64 ③)**: 선수 기준 행이라 소속팀 득점이 먼저(`result.for`-`result.against`). W/D/L은 정규시간 + 연장
 *   스코어로 정하고 승부차기는 무(FIFA·UEFA 기록 규칙 — 대회 화면 폼 칩과 같다), 승부차기 스코어는 따로 싣는다(`pens`, 소속팀 먼저).
 * - **리그 구간 순서**: 선수 수가 많은 리그부터(같으면 대회 설정 순서), 기타 리그는 맨 끝. 구간 안은 설정 파일 순서(순위를 매기지 않는다).
 * - **시즌 누적**: 대회별 행(리그·UCL·컵)의 합. 한 행이라도 분·도움이 null이면 합도 null(대시 — 폴백, FR-65).
 * - **이름**: 컵 대회 원문 이름(`leagueRaw`)·사전에 없는 상대 팀은 사전(`names.ko.json`) 정확 일치일 때만 한글, 아니면 원문(`latin` — `lang="en"`).
 */
import type { FormResult, TeamLookup, TeamView } from "@/lib/competition-view";
import type { AppearanceStatus, CompId } from "@/lib/schema/common";
import type {
  KoreanPlayer,
  KoreanPlayerRecord,
  KoreanPlayersDataFile,
  Opponent,
  PlayerComp,
  PlayerMatchLog,
  PlayerSeasonStats,
} from "@/lib/schema/player";

// ─── 입력 ───────────────────────────────────────────────────────────────────

/** 대회 ID → 평탄 탭 약칭 · 정식 이름(`configs/competitions.json` 순서) */
export interface RosterCompetition {
  id: CompId;
  short: string;
  name: string;
}

export interface RosterInput {
  /** `configs/korean-players.json`(설정 순서 그대로) */
  players: readonly KoreanPlayer[];
  /** `data/players/korean.json` — 아직 없으면 null(모든 선수 '기록 연결 전') */
  data: KoreanPlayersDataFile | null;
  /** 대회 설정(순서 = 구간 동률 순서) */
  competitions: readonly RosterCompetition[];
  /** 팀 slug → 이름·배지 */
  team: TeamLookup;
  /** 사전 팀 항목 — 영문 원문 → 한글(정확 일치만, 없으면 null) */
  teamNameKo: (en: string) => string | null;
  /** 사전 대회 항목 — 컵 대회 원문(`leagueRaw`) → 한글(없으면 null) */
  competitionNameKo: (en: string) => string | null;
}

// ─── 출력 ───────────────────────────────────────────────────────────────────

export type RosterState = "linked" | "not-linked" | "other";

/** 숫자 상태(DESIGN §9.3 D2 숫자 상태 규칙): 실선 · 윤곽 · 대시 */
export type NumberTone = "on" | "zero" | "null";

/** 출전 분 거터 한 칸 */
export interface AppearanceView {
  /** 보이는 숫자("–"는 값 없음) */
  text: string;
  tone: NumberTone;
  /** 숫자 아래 상태 글자 — 선발 · 교체 · 미출전 · 라인업 없음 · 기록 없음 · 연결 전 · 갱신 중단 · 경기 없음 */
  label: string;
  /** 상태 글자를 잉크로(출전 — 선발·교체) */
  strong: boolean;
  /** 화면 밖 읽기("선발 67분" · "미출전 0분" · "기록 연결 전") */
  sr: string;
}

/** 대회 표식 — 6개 대회는 평탄 탭, 그 밖(컵)은 "기타" 탭 + 대회 이름 */
export type CompMark =
  | { kind: "comp"; comp: CompId; short: string; name: string }
  | { kind: "other"; name: string; latin: boolean };

/** 상대 팀 — 이름(한글 또는 원문) + 배지(데이터 팀이 아니면 폴백 배지) */
export interface OpponentView {
  name: string;
  latin: boolean;
  badge: Pick<TeamView, "name" | "short" | "colors">;
}

/** 선수 기준 결과(소속팀 득점 먼저) */
export interface ResultView {
  outcome: FormResult;
  for: number;
  against: number;
  /** 승부차기(소속팀 먼저) — 승부차기로 끝난 경기만 */
  pens: { for: number; against: number } | null;
}

export interface RecentView {
  kickoff: string;
  comp: CompMark;
  opponent: OpponentView;
  home: boolean;
  /** 스코어 정보가 없으면 null */
  result: ResultView | null;
  goals: number;
  /** 폴백이면 null */
  assists: number | null;
}

export interface SeasonTotalView {
  apps: number;
  minutes: number | null;
  goals: number;
  assists: number | null;
}

export interface NextView {
  kickoff: string;
  comp: CompMark;
  opponent: OpponentView;
  home: boolean;
}

export interface RosterRowView {
  slug: string;
  nameKo: string;
  position: string;
  /** 설정상 소속팀(목록의 소속 — 기록 시점 소속은 쓰지 않는다) */
  team: TeamView;
  state: RosterState;
  /** 거터 — 가장 최근 경기의 출전 분·상태(경기가 없으면 상태에 맞는 대시) */
  appearance: AppearanceView;
  /** 가장 최근 경기 — 없으면 null */
  recent: RecentView | null;
  /** 시즌 누적(대회별 합) — 행이 없으면 null */
  season: SeasonTotalView | null;
  /** UCL 시즌 누적 — UCL 행이 없으면 null */
  ucl: { apps: number; minutes: number | null } | null;
  next: NextView | null;
  /** 이 선수만 집계 시작일이 다르면 "11월 1일 이후 집계"(같으면 null — 머리 부제에 한 번만 쓴다) */
  sinceNote: string | null;
  /** 연결된 선수인데 집계 시작 뒤 경기가 없다 */
  noMatches: boolean;
}

export interface RosterGroupView {
  /** 구간 키 — 대회 ID 또는 "OTHER" */
  key: PlayerComp;
  /** 앵커 id(`kp-bundesliga` · `kp-other`) */
  anchor: string;
  /** 구간 이름(정식 이름 · "기타 리그") */
  label: string;
  /** 평탄 탭 약칭(기타 리그는 "기타") */
  short: string;
  rows: RosterRowView[];
}

export interface RosterView {
  /** 집계 시작일(UTC 날짜) — 데이터 파일이 없으면 null */
  since: string | null;
  /** "10월 19일 이후 집계" — 데이터 파일이 없으면 null */
  sinceLabel: string | null;
  /** 데이터 파일 생성 시각(UTC ISO) — 없으면 null */
  generatedAt: string | null;
  counts: { total: number; linked: number };
  groups: RosterGroupView[];
}

// ─── 규칙 ───────────────────────────────────────────────────────────────────

/** "2026-10-19"(UTC 날짜) → "10월 19일 이후 집계" — 날짜 값이라 시간대 변환이 없다 */
export function sinceLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일 이후 집계`;
}

/** 선수 상태(머리 주석) */
export function rosterStateOf(
  player: Pick<KoreanPlayer, "comp" | "active" | "apiFootballId">,
  record: Pick<KoreanPlayerRecord, "since"> | null,
): RosterState {
  if (player.comp === "OTHER" || !player.active) return "other";
  if (player.apiFootballId === null || !record || record.since === null) {
    return "not-linked";
  }
  return "linked";
}

/** 결과(정규시간 + 연장, 승부차기는 무) — 스코어 정보가 없으면 null */
export function resultOf(
  log: Pick<PlayerMatchLog, "result">,
): ResultView | null {
  const r = log.result;
  if (!r) return null;
  const outcome: FormResult =
    r.for === r.against ? "D" : r.for > r.against ? "W" : "L";
  return {
    outcome,
    for: r.for,
    against: r.against,
    pens: r.pens ? { for: r.pens.for, against: r.pens.against } : null,
  };
}

/**
 * 한 경기의 출전 분 거터(숫자 상태 규칙) — 로그 `status`(공용 출전 상태 — 2026-11-01 사용자 결정, 스키마 필수)를 먼저 쓴다. 키가 없는
 * 입력(옛 파일·다른 화면의 부분 값)은 `started`·`minutes`로 추론한다(벤치와 명단 제외를 나눌 수 없어 "미출전").
 */
export function appearanceOf(
  log: Pick<PlayerMatchLog, "started" | "minutes"> & {
    status?: AppearanceStatus | undefined;
  },
  fallback: boolean,
): AppearanceView {
  const { minutes, started, status } = log;
  const dash = (label: string): AppearanceView => ({
    text: "–",
    tone: "null",
    label,
    strong: false,
    sr: label,
  });
  const zero = (label: string): AppearanceView => ({
    text: "0",
    tone: "zero",
    label,
    strong: false,
    sr: `${label} 0분`,
  });
  const played = (label: string, m: number): AppearanceView =>
    m === 0
      ? zero(label)
      : {
          text: String(m),
          tone: "on",
          label,
          strong: true,
          sr: `${label} ${m}분`,
        };
  // 명단 제외는 값 없음(대시), 벤치는 0(윤곽) — DESIGN §9.3 D2 숫자 상태 규칙
  switch (status) {
    case "absent":
      return dash("명단 제외");
    case "unknown":
      return dash("라인업 없음");
    case "bench":
      return zero("벤치");
    case "start":
    case "sub":
      return minutes === null
        ? dash(status === "start" ? "선발" : "교체")
        : played(status === "start" ? "선발" : "교체", minutes);
    case undefined:
      break;
  }
  if (minutes === null) return dash(fallback ? "기록 없음" : "라인업 없음");
  if (minutes === 0) return zero("미출전");
  return played(
    started === true ? "선발" : started === false ? "교체" : "출전",
    minutes,
  );
}

/** 경기가 없는 행의 거터 — 상태별 대시 + 글자 */
function emptyAppearance(state: RosterState): AppearanceView {
  const label =
    state === "other"
      ? "갱신 중단"
      : state === "not-linked"
        ? "연결 전"
        : "경기 없음";
  const sr =
    state === "not-linked"
      ? "기록 연결 전"
      : state === "other"
        ? "기록 갱신 중단"
        : "집계된 경기 없음";
  return { text: "–", tone: "null", label, strong: false, sr };
}

/** 대회별 행의 합 — 분·도움은 한 행이라도 null이면 null */
export function seasonTotalOf(
  rows: readonly PlayerSeasonStats[],
): SeasonTotalView | null {
  if (rows.length === 0) return null;
  let apps = 0;
  let goals = 0;
  let minutes: number | null = 0;
  let assists: number | null = 0;
  for (const r of rows) {
    apps += r.apps;
    goals += r.goals;
    minutes =
      minutes === null || r.minutes === null ? null : minutes + r.minutes;
    assists =
      assists === null || r.assists === null ? null : assists + r.assists;
  }
  return { apps, minutes, goals, assists };
}

function compMarkOf(
  comp: PlayerComp,
  leagueRaw: string | undefined,
  comps: ReadonlyMap<CompId, RosterCompetition>,
  competitionNameKo: (en: string) => string | null,
): CompMark {
  if (comp !== "OTHER") {
    const c = comps.get(comp);
    return {
      kind: "comp",
      comp,
      short: c?.short ?? comp,
      name: c?.name ?? comp,
    };
  }
  if (leagueRaw === undefined) {
    return { kind: "other", name: "기타 대회", latin: false };
  }
  const ko = competitionNameKo(leagueRaw);
  return { kind: "other", name: ko ?? leagueRaw, latin: ko === null };
}

function opponentOf(
  o: Opponent,
  team: TeamLookup,
  teamNameKo: (en: string) => string | null,
): OpponentView {
  if (o.slug) {
    const t = team(o.slug);
    // 데이터 팀인데 사전에 한글이 없으면(원어 — slug를 편 이름) API 원문 이름이 더 정확하다
    return t.latin
      ? { name: o.name, latin: true, badge: t }
      : { name: t.name, latin: false, badge: t };
  }
  const ko = teamNameKo(o.name);
  const name = ko ?? o.name;
  return {
    name,
    latin: ko === null,
    badge: { name, short: "", colors: null },
  };
}

const GROUP_LABEL_OTHER = "기타 리그";

/** 구간 앵커 — `kp-bundesliga` */
export function rosterAnchor(key: PlayerComp): string {
  return `kp-${key.toLowerCase()}`;
}

/** 목록 화면 모델(머리 주석 규칙) */
export function rosterView(input: RosterInput): RosterView {
  const { players, data, competitions, team, teamNameKo, competitionNameKo } =
    input;
  const comps = new Map(competitions.map((c) => [c.id, c]));
  const records = new Map((data?.players ?? []).map((r) => [r.slug, r]));
  const fileSince = data?.since ?? null;

  const rows = players.map((p): [PlayerComp, RosterRowView] => {
    const record = records.get(p.slug) ?? null;
    const state = rosterStateOf(p, record);
    const fallback = record?.provider === "fallback";
    // 5대 리그 밖 선수는 마지막 기록을 '최근 경기'로 내세우지 않는다(갱신 중단 — FR-64)
    const log = state === "linked" ? (record?.recent[0] ?? null) : null;
    const recent: RecentView | null = log
      ? {
          kickoff: log.kickoff,
          comp: compMarkOf(log.comp, log.leagueRaw, comps, competitionNameKo),
          opponent: opponentOf(log.opponent, team, teamNameKo),
          home: log.home,
          result: resultOf(log),
          goals: log.goals,
          assists: log.assists,
        }
      : null;
    const season = record ? seasonTotalOf(record.season) : null;
    const uclRow = record?.season.find((s) => s.comp === "UCL") ?? null;
    const n = state === "other" ? null : (record?.next ?? null);
    const playerSince = record?.since ?? null;
    return [
      p.comp,
      {
        slug: p.slug,
        nameKo: p.nameKo,
        position: p.position,
        team: team(p.team),
        state,
        appearance: log ? appearanceOf(log, fallback) : emptyAppearance(state),
        recent,
        season,
        ucl: uclRow ? { apps: uclRow.apps, minutes: uclRow.minutes } : null,
        next: n
          ? {
              kickoff: n.kickoff,
              comp: compMarkOf(n.comp, n.leagueRaw, comps, competitionNameKo),
              opponent: opponentOf(n.opponent, team, teamNameKo),
              home: n.home,
            }
          : null,
        sinceNote:
          state === "linked" && playerSince && playerSince !== fileSince
            ? sinceLabel(playerSince)
            : null,
        noMatches: state === "linked" && log === null,
      },
    ];
  });

  const byKey = new Map<PlayerComp, RosterRowView[]>();
  for (const [key, row] of rows) {
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const order = (key: PlayerComp): number => {
    if (key === "OTHER") return Number.MAX_SAFE_INTEGER;
    const i = competitions.findIndex((c) => c.id === key);
    return i < 0 ? competitions.length : i;
  };
  const groups = [...byKey]
    .sort(([a, ra], [b, rb]) => {
      if (a === "OTHER" || b === "OTHER") return order(a) - order(b);
      return rb.length - ra.length || order(a) - order(b);
    })
    .map(([key, list]): RosterGroupView => {
      const c = key === "OTHER" ? null : comps.get(key);
      return {
        key,
        anchor: rosterAnchor(key),
        label: key === "OTHER" ? GROUP_LABEL_OTHER : (c?.name ?? key),
        short: key === "OTHER" ? "기타" : (c?.short ?? key),
        rows: list,
      };
    });

  return {
    since: fileSince,
    sinceLabel: fileSince ? sinceLabel(fileSince) : null,
    generatedAt: data?.generatedAt ?? null,
    counts: {
      total: players.length,
      linked: rows.filter(([, r]) => r.state === "linked").length,
    },
    groups,
  };
}

/** 스코어 표기 "6-1"(소속팀 먼저) — 결과 칸·화면 밖 문장 */
export function scoreText(r: Pick<ResultView, "for" | "against">): string {
  return `${r.for}-${r.against}`;
}
