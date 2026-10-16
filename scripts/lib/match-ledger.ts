/**
 * 경기 기록 원장 `data/matches/YYYY-MM.json` + `data/matches/meta.json` (M1-48b, PRD §15 D27·D33).
 * 스키마는 src/lib/schema/matches.ts. 이 파일은 원장 항목 조립(한국 선수 행·이름 후보)·달 파일 갱신·메타 규칙(순수 함수)과
 * 파일 읽기·쓰기(원자적 — 임시 파일 + rename)를 둔다. 실행 연결은 scripts/lib/collect-run.ts.
 *
 * 원장 항목 (D33 ①②): API-Football 경기 상세(`MatchDetail`) → 대회·라운드·킥오프·종료 상태·양 팀(id·원문 이름·포메이션)·스코어·
 * 승부차기·득점 이벤트·`goalsComplete`·등록 한국 선수 행·수집 시각. 전 선수 출전 시간은 저장하지 않는다.
 *   - 한국 선수 행: configs/korean-players.json **활성 + apiFootballId 있는 선수**마다 `playerAppearance`(선수 id로만 매칭 — FR-60)
 *     — 라인업에 있거나(이적 단서 포함) 소속팀(team-ids `af`)이 이 경기 팀이면 행 하나(start·sub·bench·absent·unknown).
 *   - `apiFootballId`가 null인 활성 선수(현재 김지수)는 행을 만들지 않고, 소속팀 경기의 라인업에서 이름 대조로 **후보만** 찾는다
 *     (`findKoreanNameCandidates` — 운영 리포트 M5-09 입력, 사람이 확인해 configs에 id를 채운다. M3-01은 확정·검토).
 *
 * 쓰기 조건 (오케스트레이터 결정 2026-10-13): **정기 운영이 켜진 prod 실행만**(저장소 변수 `COLLECT_ENABLED == 'true'` →
 * CollectDeps.ledgerEnabled). dry·dev 실행·뉴스 실패로 취소된 실행은 쓰지 않는다(`ledgerWriteMode`). 읽기(`known` — 이미 받은
 * 경기는 다시 받지 않음)는 모든 실행이 한다.
 *
 * 불완전 항목 재조회 (오케스트레이터 결정 2026-10-14): 득점 불완전(`goalsComplete` false)·한국 선수 행 `unknown`·양 팀 포메이션
 * 없음(`isIncompleteLedgerMatch`)인 항목은 원장에 쓰되 이월 목록(af-pending)에도 올린다. 이월 목록에 있는 동안 "이미 받음"에서 빠져
 * (`ledgerPlanKnown`) 날짜 창 안이면 날짜 조회로, 밖이면 이월 재조회로 다시 받고, 완전해지면 덮어쓴다. 정리 규칙(킥오프 후 3일·
 * 재조회 3회)으로 이월에서 빠지면 그대로 확정한다 — 재조회 횟수는 이월 항목이 이어 세므로 날짜 창 안에서도 다시 0이 되지 않는다.
 *
 * 달 파일: 경기 id `af-<id>` 기준 덮어쓰기, 킥오프·id 순, 내용(수집 시각 제외)이 같으면 다시 쓰지 않는다. 한 줄에 경기 하나로
 * 직렬화해 커밋 diff를 경기 단위로 남긴다(data/는 Prettier 대상 밖).
 *
 * 메타 (`nextLedgerMeta`) — 날짜는 모두 UTC 날짜:
 *   - since: 원장이 없을 때, COLLECT_ENABLED를 켠 뒤 처음 원장을 쓰는 실행(수동 prod 실행 포함 — 2026-10-14 사용자 확인)이 날짜
 *     조회로 받은 가장 이른 날짜를 한 번 쓰고 바꾸지 않는다. 메타를 달 파일보다 먼저 쓰고, 킥오프가 since 앞인 경기는 원장에 넣지
 *     않는다. 그 실행이 날짜를 하나도 받지 못하면 원장을 시작하지 않는다(다음 실행이 시작).
 *   - playerSince: 추적 선수(활성 + apiFootballId)마다 한 번 쓰고 바꾸지 않는다. 원장을 시작한 실행의 선수는 since. id를 나중에 채웠거나
 *     나중에 등록한 선수는 `playerStartDate` — 이번 실행이 받은 가장 이른 날짜부터 시작하되, 이미 원장에 그 선수 팀 경기가 행 없이
 *     들어 있으면 그 다음 날로 미룬다(그 경기는 다시 받지 않으므로 그 날의 기록이 빠진다). 행 보충(원장 id로 재조회 — D33 ②)은
 *     M3-01·M3-02 이후 과제.
 *   - gaps: 날짜 조회 실패(date-query · errors.plan이면 degraded) · 단계 건너뜀(skipped) · 이월 정리로 버린 경기(dropped).
 *     날짜 T는 R(T)(오늘 조회)·R(T+1)(어제 조회) 두 실행만 조회한다 — 날짜 단위 공백은 **첫 기회(오늘 조회)의 실패·건너뜀만** 새로
 *     만들고, 마지막 기회(어제 조회)의 실패·건너뜀은 기존 공백만 유지한다(첫 기회에 받았는지 알 수 없어 가짜 빈 날을 만들지 않는다 —
 *     둘 다 실패한 날은 남는다). 나중 실행이 그 날짜를 받으면 지운다. dropped는 그 경기가 원장에 들어오면 지운다. since 앞 날짜는
 *     남기지 않는다. 아무 실행도 T를 오늘로 조회하지 않은 날은 여기서 알 수 없다 — 운영 리포트(M5-09)가 runs.json으로 찾는다.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  LedgerMatchSchema,
  MatchLedgerFileSchema,
  MatchLedgerMetaSchema,
  type KoreanPlayersFile,
  type LedgerGap,
  type LedgerKoreanRow,
  type LedgerMatch,
  type MatchLedgerFile,
  type MatchLedgerMeta,
  type RunEnv,
  type TeamIdsFile,
} from "@/lib/schema";
import { shiftDate, utcDate, utcMonth } from "@/lib/time";

import {
  playerAppearance,
  type LineupPlayer,
  type MatchDetail,
  type Side,
} from "./match-data";

// ─── 경로·키 ─────────────────────────────────────────────────────────────

/** data/ 기준 원장 폴더 */
export const LEDGER_DIR_REL = "matches";

/** data/ 기준 메타 파일 */
export const LEDGER_META_REL = path.join(LEDGER_DIR_REL, "meta.json");

/**
 * `known`을 읽을 범위 — 지금(UTC 날짜) 앞 4일 ~ 뒤 1일이 걸친 달. 날짜 조회(D-1·D)와 이월 재조회(킥오프 후 최대 3일)가 고를 수
 * 있는 경기가 모두 이 안에 든다.
 */
export const LEDGER_KNOWN_LOOKBACK_DAYS = 4;

export function afMatchKey(id: number): string {
  return `af-${id}`;
}

/** `af-<id>` → id(형식이 아니면 null) */
export function afIdOfKey(key: string): number | null {
  const m = /^af-([1-9]\d*)$/.exec(key);
  return m ? Number(m[1]) : null;
}

/** 킥오프(UTC ISO) → 원장 달(UTC) */
export function ledgerMonthOf(kickoff: string): string {
  return utcMonth(kickoff);
}

export function ledgerMonthPath(dataDir: string, month: string): string {
  return path.join(dataDir, LEDGER_DIR_REL, `${month}.json`);
}

export function ledgerMetaPath(dataDir: string): string {
  return path.join(dataDir, LEDGER_META_REL);
}

/** 이번 실행이 읽을 원장 달(오름차순) */
export function ledgerMonthsAround(nowIso: string): string[] {
  const today = utcDate(nowIso);
  const months = new Set<string>();
  for (let d = -LEDGER_KNOWN_LOOKBACK_DAYS; d <= 1; d += 1) {
    months.add(shiftDate(today, d).slice(0, 7));
  }
  return [...months].sort();
}

// ─── 쓰기 조건 ───────────────────────────────────────────────────────────

/**
 * 저장소 변수 `COLLECT_ENABLED`(정기 운영 켜짐) — 앞뒤 공백·대소문자 무시 "true"일 때만. 가드(scripts/lib/collect-guard.ts
 * `parseFlag`)와 같은 규칙이라 "백업 schedule이 도는 날 = 원장을 쓰는 날"이 어긋나지 않는다.
 */
export function resolveLedgerEnabled(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/**
 * 원장 쓰기 여부 — write 외에는 쓰지 않는 이유.
 * dry(산출물 출력만) → dev(개발 실행) → ledger-disabled(정기 운영 전 — 수동 prod 실행이 원장을 시작하면 정기 실행 전까지 빈 날이
 * 생긴다) → cancelled(뉴스 실패 — 커밋되지 않는 실행) 순으로 본다.
 */
export type LedgerWriteMode =
  "write" | "dry" | "dev" | "ledger-disabled" | "cancelled";

export function ledgerWriteMode(input: {
  env: RunEnv;
  dry: boolean;
  enabled: boolean;
  cancelled: boolean;
}): LedgerWriteMode {
  if (input.dry) return "dry";
  if (input.env !== "prod") return "dev";
  if (!input.enabled) return "ledger-disabled";
  if (input.cancelled) return "cancelled";
  return "write";
}

// ─── 한국 선수 ───────────────────────────────────────────────────────────

/** 원장 행을 만드는 선수 — 활성 + apiFootballId */
export interface TrackedPlayer {
  slug: string;
  apiFootballId: number;
  /** 소속팀 API-Football 팀 id(team-ids.json `af`) — 없으면 null(validate 교차 검사가 막는 경우) */
  teamAf: number | null;
}

/** 행을 만들지 못하는 선수 — 활성인데 apiFootballId가 null(이름 대조로 후보만 찾는다) */
export interface UnidentifiedPlayer {
  slug: string;
  nameEn: string;
  teamAf: number | null;
}

export interface KoreanPlayerTargets {
  tracked: TrackedPlayer[];
  unidentified: UnidentifiedPlayer[];
}

/** configs → 추적 선수·id 없는 선수(설정 순서, 같은 apiFootballId는 처음 것만) */
export function koreanPlayerTargets(
  players: KoreanPlayersFile,
  teamIds: TeamIdsFile,
): KoreanPlayerTargets {
  const tracked: TrackedPlayer[] = [];
  const unidentified: UnidentifiedPlayer[] = [];
  const seen = new Set<number>();
  for (const p of players) {
    if (!p.active) continue;
    const teamAf = Object.hasOwn(teamIds, p.team)
      ? (teamIds[p.team]?.af ?? null)
      : null;
    if (p.apiFootballId === null) {
      unidentified.push({ slug: p.slug, nameEn: p.nameEn, teamAf });
      continue;
    }
    if (seen.has(p.apiFootballId)) continue;
    seen.add(p.apiFootballId);
    tracked.push({ slug: p.slug, apiFootballId: p.apiFootballId, teamAf });
  }
  return { tracked, unidentified };
}

/**
 * 경기 상세 → 등록 한국 선수 행(선수 id 순). 선수 id로만 매칭한다(`playerAppearance` — 라인업에 있으면 그 쪽, 없고 소속팀이 이
 * 경기 팀이면 absent·unknown, 둘 다 아니면 행 없음).
 */
export function koreanRowsOf(
  detail: MatchDetail,
  tracked: readonly TrackedPlayer[],
): LedgerKoreanRow[] {
  const rows: LedgerKoreanRow[] = [];
  for (const p of tracked) {
    const a = playerAppearance(detail, p.apiFootballId, p.teamAf);
    if (!a) continue;
    rows.push({
      player: p.apiFootballId,
      side: a.side,
      status: a.status,
      minutes: a.minutes,
      goals: a.goals,
      assists: a.assists,
    });
  }
  return rows.sort((a, b) => a.player - b.player);
}

/** 이름 토큰 — 악센트 제거·소문자, 공백·점으로 나누고 하이픈 등 기호를 지운다("Ji-Soo" → "jisoo", "J." → "j") */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s.]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 0);
}

export type NameMatchBasis = "full" | "initial";

/**
 * 영문 이름(configs nameEn — "이름 성" 순, 예: "Ji-soo Kim")과 라인업 이름이 같은 사람으로 보이는가.
 * full = 성 + 이름(하이픈·띄어쓰기 무시, 성이 앞이든 뒤든 — "Kim Ji-Soo"·"Jisoo Kim"), initial = 성 + 이름 첫 글자("J. Kim").
 * 같은 성의 다른 선수일 수 있어 결과는 **후보**다(사람 확인).
 */
export function nameMatchBasis(
  nameEn: string,
  lineupName: string,
): NameMatchBasis | null {
  const own = nameTokens(nameEn);
  if (own.length < 2) return null;
  const family = own[own.length - 1]!;
  const given = own.slice(0, -1).join("");
  const tokens = nameTokens(lineupName);
  if (tokens.length < 2) return null;
  const givenOf = (): string | null => {
    if (tokens[0] === family) return tokens.slice(1).join("");
    if (tokens[tokens.length - 1] === family) {
      return tokens.slice(0, -1).join("");
    }
    return null;
  };
  const other = givenOf();
  if (other === null || other.length === 0) return null;
  if (other === given) return "full";
  if (other.length === 1 && other === given[0]) return "initial";
  return null;
}

export interface NameCandidate {
  /** 라인업의 API-Football 선수 id(없으면 null) — 사람이 확인해 korean-players.json apiFootballId에 넣을 값 */
  id: number | null;
  name: string;
  basis: NameMatchBasis;
  status: "start" | "sub" | "bench";
  minutes: number | null;
}

/** id 없는 선수 1명 × 소속팀 경기 1건의 이름 대조 결과(후보가 없어도 남긴다 — 운영 리포트가 "확인 못 함"을 셀 수 있게) */
export interface KoreanNameCheck {
  /** korean-players.json slug */
  player: string;
  nameEn: string;
  /** API-Football 경기 id */
  matchId: number;
  kickoff: string;
  side: Side;
  /** 그 팀 라인업이 응답에 있었는가(없으면 대조할 수 없다) */
  lineup: boolean;
  candidates: NameCandidate[];
}

/**
 * apiFootballId가 없는 활성 선수 — 소속팀(team-ids `af`)이 이 경기 팀이면 그 팀 라인업에서 이름이 맞는 선수를 후보로 찾는다
 * (순수 함수). 이미 추적 중인 선수 id는 후보에서 뺀다. 원장 행은 만들지 않는다.
 */
export function findKoreanNameCandidates(
  detail: MatchDetail,
  unidentified: readonly UnidentifiedPlayer[],
  trackedIds: ReadonlySet<number> = new Set(),
): KoreanNameCheck[] {
  const checks: KoreanNameCheck[] = [];
  for (const p of unidentified) {
    if (p.teamAf === null) continue;
    const side: Side | null =
      p.teamAf === detail.home.id
        ? "home"
        : p.teamAf === detail.away.id
          ? "away"
          : null;
    if (side === null) continue;
    const lineup = detail.lineups[side];
    const candidates: NameCandidate[] = [];
    const consider = (lp: LineupPlayer, started: boolean) => {
      if (lp.id !== null && trackedIds.has(lp.id)) return;
      const basis = nameMatchBasis(p.nameEn, lp.name);
      if (basis === null) return;
      candidates.push({
        id: lp.id,
        name: lp.name,
        basis,
        status: started ? "start" : (lp.minutes ?? 0) > 0 ? "sub" : "bench",
        minutes: lp.minutes,
      });
    };
    for (const lp of lineup?.startXI ?? []) consider(lp, true);
    for (const lp of lineup?.substitutes ?? []) consider(lp, false);
    checks.push({
      player: p.slug,
      nameEn: p.nameEn,
      matchId: detail.matchId,
      kickoff: detail.kickoff,
      side,
      lineup: lineup !== null,
      candidates,
    });
  }
  return checks;
}

// ─── 원장 항목 ───────────────────────────────────────────────────────────

/** 경기 상세 + 한국 선수 행 → 원장 항목(스키마 키 순서). 검증은 `buildLedgerEntries` */
export function toLedgerMatch(
  detail: MatchDetail,
  korean: readonly LedgerKoreanRow[],
): LedgerMatch {
  const season =
    detail.season !== null && detail.season >= 2000 && detail.season <= 2100
      ? detail.season
      : null;
  const team = (side: Side) => ({
    id: detail[side].id,
    name: detail[side].name,
    formation: detail.lineups[side]?.formation ?? null,
  });
  return {
    id: afMatchKey(detail.matchId),
    leagueId: detail.leagueId,
    league: detail.leagueName,
    comp: detail.comp,
    season,
    round: detail.round?.trim() || null,
    kickoff: detail.kickoff,
    status: detail.status,
    home: team("home"),
    away: team("away"),
    ft: { home: detail.score.ft.home, away: detail.score.ft.away },
    pens: detail.score.pens
      ? { home: detail.score.pens.home, away: detail.score.pens.away }
      : null,
    goals: detail.goals.map((g) => ({
      minute: g.minute,
      extra: g.extra,
      side: g.side,
      kind: g.kind,
      scorer: { id: g.scorer.id, name: g.scorer.name },
      assist:
        g.kind === "own-goal" || g.assist === null
          ? null
          : { id: g.assist.id, name: g.assist.name },
    })),
    goalsComplete: detail.goalsComplete,
    korean: korean.map((r) => ({ ...r })),
    fetchedAt: detail.fetchedAt,
  };
}

const DURATION_BY_LEDGER_STATUS = {
  FT: "REGULAR",
  AET: "EXTRA_TIME",
  PEN: "PENALTY_SHOOTOUT",
} as const satisfies Record<
  LedgerMatch["status"],
  MatchDetail["score"]["duration"]
>;

/**
 * 원장 항목 → 경기 상세(브리핑 득점자 연결용 — M1-19, M1-48 이월). 같은 아침 두 번째 실행(백업·force)은 브리핑 창 경기가 원장에
 * 있어 다시 받지 않으므로, 브리핑은 원장 항목을 이번 실행의 상세처럼 잇는다(collect-run.ts — 득점자는 `goalsComplete`인 항목만,
 * brief-input.ts `briefGoalsOf`). 원장에 없는 값: 전반 스코어(저장하지 않음 — null)·라인업(한국 선수 행만 저장 — null, 이 변환
 * 결과로 출전 기록을 만들지 않는다)·팀 정식 이름(null). 90분 스코어는 정규시간 경기(FT)만 최종 스코어와 같다. 키가 `af-<id>`
 * 형식이 아니면 null.
 */
export function ledgerMatchToDetail(m: LedgerMatch): MatchDetail | null {
  const matchId = afIdOfKey(m.id);
  if (matchId === null) return null;
  const ft = { home: m.ft.home, away: m.ft.away };
  return {
    provider: "api-football",
    matchId,
    leagueId: m.leagueId,
    leagueName: m.league,
    comp: m.comp,
    season: m.season,
    round: m.round,
    kickoff: m.kickoff,
    status: m.status,
    home: { id: m.home.id, name: m.home.name, fullName: null },
    away: { id: m.away.id, name: m.away.name, fullName: null },
    score: {
      ft,
      ht: null,
      regular: m.status === "FT" ? ft : null,
      pens: m.pens ? { home: m.pens.home, away: m.pens.away } : null,
      duration: DURATION_BY_LEDGER_STATUS[m.status],
    },
    goals: m.goals.map((g) => ({
      minute: g.minute,
      extra: g.extra,
      side: g.side,
      kind: g.kind,
      scorer: { id: g.scorer.id, name: g.scorer.name },
      assist: g.assist ? { id: g.assist.id, name: g.assist.name } : null,
    })),
    goalsComplete: m.goalsComplete,
    lineups: { home: null, away: null },
    fetchedAt: m.fetchedAt,
  };
}

export interface LedgerEntriesBuild {
  /** 원장 항목(킥오프·id 순) */
  entries: LedgerMatch[];
  /** 스키마에 맞지 않아 뺀 경기(원장에 넣지 못함 — 이월 목록에 다시 넣는다) */
  invalid: Array<{ id: number; error: string }>;
  /** 한국 선수 행 수(모든 항목 합) */
  koreanRows: number;
  /** id 없는 선수의 이름 대조 결과 */
  nameChecks: KoreanNameCheck[];
}

const byKickoffKey = (a: LedgerMatch, b: LedgerMatch) =>
  Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
  (afIdOfKey(a.id) ?? 0) - (afIdOfKey(b.id) ?? 0);

/** 경기 상세들 → 원장 항목(메모리 — dry·dev도 만든다) + 이름 대조(순수 함수) */
export function buildLedgerEntries(
  details: readonly MatchDetail[],
  targets: KoreanPlayerTargets,
): LedgerEntriesBuild {
  const trackedIds = new Set(targets.tracked.map((p) => p.apiFootballId));
  const entries: LedgerMatch[] = [];
  const invalid: LedgerEntriesBuild["invalid"] = [];
  const nameChecks: KoreanNameCheck[] = [];
  let koreanRows = 0;
  for (const detail of details) {
    nameChecks.push(
      ...findKoreanNameCandidates(detail, targets.unidentified, trackedIds),
    );
    const korean = koreanRowsOf(detail, targets.tracked);
    const parsed = LedgerMatchSchema.safeParse(toLedgerMatch(detail, korean));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      invalid.push({
        id: detail.matchId,
        error: `${issue?.path.join(".") || "(루트)"}: ${issue?.message ?? "형식 오류"}`,
      });
      continue;
    }
    koreanRows += parsed.data.korean.length;
    entries.push(parsed.data);
  }
  return {
    entries: entries.sort(byKickoffKey),
    invalid,
    koreanRows,
    nameChecks,
  };
}

// ─── 달 파일 ─────────────────────────────────────────────────────────────

/** 키를 정렬한 JSON — 내용 비교용(키 순서와 무관) */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 같은 경기 기록인가 — 수집 시각(fetchedAt)은 비교하지 않는다(재조회만 하고 내용이 같으면 다시 쓰지 않는다) */
export function sameLedgerMatch(a: LedgerMatch, b: LedgerMatch): boolean {
  const { fetchedAt: _a, ...restA } = a;
  const { fetchedAt: _b, ...restB } = b;
  void _a;
  void _b;
  return canonicalJson(restA) === canonicalJson(restB);
}

export interface LedgerMonthUpdate {
  file: MatchLedgerFile;
  /** 파일을 다시 써야 하는가(새 경기·바뀐 경기가 있음) */
  changed: boolean;
  /** 새로 더한 경기 키 */
  added: string[];
  /** 내용이 바뀌어 덮어쓴 경기 키 */
  replaced: string[];
}

/**
 * 달 파일에 원장 항목을 더한다(순수 함수) — `af-<id>` 기준 덮어쓰기, 킥오프·id 순. 내용이 같은 경기는 기존 항목(기존 수집 시각)을
 * 그대로 두고, 바뀐 것이 없으면 `changed: false`(updatedAt도 그대로). 다른 달의 항목은 던진다(호출부 오류).
 */
export function upsertLedgerMonth(
  existing: MatchLedgerFile | null,
  month: string,
  entries: readonly LedgerMatch[],
  updatedAt: string,
): LedgerMonthUpdate {
  const byId = new Map((existing?.matches ?? []).map((m) => [m.id, m]));
  const added: string[] = [];
  const replaced: string[] = [];
  for (const entry of entries) {
    if (ledgerMonthOf(entry.kickoff) !== month) {
      throw new Error(
        `원장 달 ${month}에 다른 달(${ledgerMonthOf(entry.kickoff)}) 경기 ${entry.id}`,
      );
    }
    const old = byId.get(entry.id);
    if (old === undefined) {
      added.push(entry.id);
      byId.set(entry.id, entry);
    } else if (!sameLedgerMatch(old, entry)) {
      replaced.push(entry.id);
      byId.set(entry.id, entry);
    }
  }
  const changed = added.length > 0 || replaced.length > 0;
  return {
    file: {
      month,
      updatedAt: changed || !existing ? updatedAt : existing.updatedAt,
      matches: [...byId.values()].sort(byKickoffKey),
    },
    changed,
    added,
    replaced,
  };
}

/** 달 파일 직렬화 — 경기 하나를 한 줄(압축 JSON)로, 끝 개행. 커밋 diff가 경기 단위로 남는다 */
export function serializeLedgerMonth(file: MatchLedgerFile): string {
  const head = `{\n  "month": ${JSON.stringify(file.month)},\n  "updatedAt": ${JSON.stringify(file.updatedAt)},\n  "matches": [`;
  if (file.matches.length === 0) return `${head}]\n}\n`;
  const body = file.matches.map((m) => `    ${JSON.stringify(m)}`).join(",\n");
  return `${head}\n${body}\n  ]\n}\n`;
}

// ─── 메타 ────────────────────────────────────────────────────────────────

/** 이번 실행에서 메타에 반영할 사실 */
export interface LedgerRunFacts {
  /** 실행 시각(UTC ISO) */
  now: string;
  /** 집계 시즌(configs/competitions.json) — 모르면 null(원장을 새로 시작하지 않는다) */
  season: number | null;
  /** 날짜 조회 결과(UTC 날짜) */
  dates: ReadonlyArray<{ date: string; ok: boolean; errorType?: string }>;
  /** 단계가 돌지 않았으면 그 이유와 이번 실행이 조회했어야 할 날짜 */
  skipped: { dates: readonly string[]; cause: string } | null;
  /** 이월 정리 규칙(킥오프 후 3일·재조회 3회)으로 버린 경기 */
  dropped: ReadonlyArray<{ id: number; kickoff: string }>;
  /** 이번 쓰기 뒤 원장(읽은 달)에 있는 경기 id — dropped 공백을 지우는 근거 */
  stored: ReadonlySet<number>;
  /** 추적 선수(활성 + apiFootballId) */
  tracked: readonly TrackedPlayer[];
  /** 이번 실행 **전에** 원장(읽은 달)에 있던 경기 — 새 선수의 시작일 계산 */
  previous: ReadonlyArray<
    Pick<LedgerMatch, "kickoff" | "home" | "away" | "korean">
  >;
}

export interface LedgerMetaUpdate {
  /** 다음 메타 — null이면 원장을 아직 시작하지 않았다(메타 없음 + 이번 실행이 날짜를 하나도 받지 못함) */
  meta: MatchLedgerMeta | null;
  changed: boolean;
  created: boolean;
  playersAdded: Array<{ slug: string; since: string }>;
  gapsAdded: LedgerGap[];
  gapsHealed: LedgerGap[];
  /** 메타 시즌과 설정 시즌이 다르다(/new-season 확인 — 메타는 바꾸지 않는다) */
  seasonMismatch: boolean;
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

/**
 * 선수 집계 시작일(순수 함수) — `base`(since와 이번 실행이 받은 가장 이른 날짜 중 늦은 쪽)부터 시작하되, 이번 실행 전 원장에
 * 그 선수 팀 경기가 그 선수 행 없이 있으면(추적 전에 받은 경기 — 다시 받지 않는다) 그 경기 다음 날로 미룬다.
 * 소속팀 id를 모르면 내일(UTC)부터.
 */
export function playerStartDate(input: {
  player: TrackedPlayer;
  base: string;
  previous: LedgerRunFacts["previous"];
  now: string;
}): string {
  const { player } = input;
  if (player.teamAf === null) {
    return maxDate(input.base, shiftDate(utcDate(input.now), 1));
  }
  let start = input.base;
  for (const m of input.previous) {
    const date = utcDate(m.kickoff);
    if (date < input.base) continue;
    const plays = m.home.id === player.teamAf || m.away.id === player.teamAf;
    const hasRow = m.korean.some((r) => r.player === player.apiFootballId);
    if (plays && !hasRow) start = maxDate(start, shiftDate(date, 1));
  }
  return start;
}

/** cause 형식(소문자 오류 종류)으로 — 맞지 않으면 생략 */
function causeOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const c = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 40);
  return /^[a-z][a-z0-9-]{0,39}$/.test(c) ? c : undefined;
}

const byGapOrder = (a: LedgerGap, b: LedgerGap) =>
  a.date < b.date
    ? -1
    : a.date > b.date
      ? 1
      : a.reason < b.reason
        ? -1
        : a.reason > b.reason
          ? 1
          : 0;

function normalizeMeta(meta: MatchLedgerMeta): MatchLedgerMeta {
  return {
    season: meta.season,
    since: meta.since,
    playerSince: Object.fromEntries(
      Object.entries(meta.playerSince).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    ),
    gaps: [...meta.gaps].sort(byGapOrder),
  };
}

/** 메타 규칙(머리 주석) — 순수 함수 */
export function nextLedgerMeta(
  current: MatchLedgerMeta | null,
  facts: LedgerRunFacts,
): LedgerMetaUpdate {
  const listed = [
    ...new Set(facts.dates.filter((d) => d.ok).map((d) => d.date)),
  ].sort();
  const update: LedgerMetaUpdate = {
    meta: null,
    changed: false,
    created: false,
    playersAdded: [],
    gapsAdded: [],
    gapsHealed: [],
    seasonMismatch: false,
  };
  let meta: MatchLedgerMeta;
  if (current === null) {
    if (listed.length === 0 || facts.season === null) return update;
    meta = {
      season: facts.season,
      since: listed[0]!,
      playerSince: {},
      gaps: [],
    };
    update.created = true;
  } else {
    meta = {
      season: current.season,
      since: current.since,
      playerSince: { ...current.playerSince },
      gaps: current.gaps.map((g) =>
        g.matches ? { ...g, matches: [...g.matches] } : { ...g },
      ),
    };
    update.seasonMismatch =
      facts.season !== null && facts.season !== current.season;
  }

  // 선수 — 이번 실행이 날짜를 받았을 때만(행이 만들어지는 실행)
  if (listed.length > 0) {
    const base = maxDate(meta.since, listed[0]!);
    for (const player of facts.tracked) {
      if (Object.hasOwn(meta.playerSince, player.slug)) continue;
      const since = playerStartDate({
        player,
        base,
        previous: facts.previous,
        now: facts.now,
      });
      meta.playerSince[player.slug] = since;
      update.playersAdded.push({ slug: player.slug, since });
    }
  }

  // 빠진 날 — 지우기(받은 날짜 · 원장에 들어온 경기)
  const listedSet = new Set(listed);
  const kept: LedgerGap[] = [];
  for (const gap of meta.gaps) {
    if (gap.reason !== "dropped") {
      if (listedSet.has(gap.date)) update.gapsHealed.push(gap);
      else kept.push(gap);
      continue;
    }
    const remaining = (gap.matches ?? []).filter((id) => !facts.stored.has(id));
    if (remaining.length === 0) update.gapsHealed.push(gap);
    else kept.push({ ...gap, matches: remaining });
  }
  meta.gaps = kept;

  // 빠진 날 — 더하기(since 이후만, 같은 날짜·사유는 하나 — dropped는 경기 id를 합친다)
  const addGap = (gap: LedgerGap) => {
    if (gap.date < meta.since) return;
    const same = meta.gaps.find(
      (g) => g.date === gap.date && g.reason === gap.reason,
    );
    if (!same) {
      meta.gaps.push(gap);
      update.gapsAdded.push(gap);
      return;
    }
    if (gap.matches && same.matches) {
      const merged = [...new Set([...same.matches, ...gap.matches])].sort(
        (a, b) => a - b,
      );
      if (merged.length !== same.matches.length) {
        same.matches = merged;
        update.gapsAdded.push(gap);
      }
    }
  };
  // 날짜 단위 공백은 그 날짜의 **첫 조회 기회**(실행 시각의 UTC 오늘)에서만 새로 만든다. 날짜 T는 R(T)(오늘 조회)·R(T+1)(어제
  // 조회) 두 실행만 조회하는데, 마지막 기회(어제 조회)의 실패·건너뜀은 첫 기회에 이미 받았는지 알 수 없어 새 공백을 만들지 않는다.
  // 기존 공백은 지우지 않으므로 두 번 모두 실패한 날은 남는다(M1-48b 리뷰). 아무 실행도 T를 오늘로 조회하지 않은 날은 여기서
  // 알 수 없다 — 운영 리포트(M5-09)가 runs.json으로 찾는다.
  const today = utcDate(facts.now);
  const firstChance = (date: string) => date >= today;
  for (const d of facts.dates) {
    if (d.ok || listedSet.has(d.date) || !firstChance(d.date)) continue;
    const cause = causeOf(d.errorType);
    addGap({
      date: d.date,
      reason: d.errorType === "plan" ? "degraded" : "date-query",
      ...(cause ? { cause } : {}),
    });
  }
  if (facts.skipped) {
    const cause = causeOf(facts.skipped.cause);
    for (const date of facts.skipped.dates) {
      if (listedSet.has(date) || !firstChance(date)) continue;
      addGap({ date, reason: "skipped", ...(cause ? { cause } : {}) });
    }
  }
  for (const d of facts.dropped) {
    if (facts.stored.has(d.id)) continue;
    addGap({ date: utcDate(d.kickoff), reason: "dropped", matches: [d.id] });
  }

  const next = normalizeMeta(meta);
  update.meta = MatchLedgerMetaSchema.parse(next);
  update.changed =
    current === null ||
    canonicalJson(normalizeMeta(current)) !== canonicalJson(next);
  return update;
}

/** 메타 직렬화 — 2칸 들여쓰기 + 끝 개행 */
export function serializeLedgerMeta(meta: MatchLedgerMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

// ─── 파일 읽기·쓰기 ──────────────────────────────────────────────────────

export interface LedgerFileRead<T> {
  value: T | null;
  /** 파일이 있었는가 */
  exists: boolean;
  /** 읽기·형식 오류 — 있으면 그 파일은 쓰지 않는다(덮어쓰면 기록을 잃는다 — 검증 게이트가 커밋 전에 막는 경우) */
  error: string | null;
}

async function readJsonFile<T>(
  file: string,
  parse: (
    json: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: unknown[] } },
): Promise<LedgerFileRead<T>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return { value: null, exists: false, error: null };
    return {
      value: null,
      exists: false,
      error: `읽기 실패: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { value: null, exists: true, error: "JSON 파싱 실패" };
  }
  const parsed = parse(json);
  if (!parsed.success) {
    return {
      value: null,
      exists: true,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { value: parsed.data, exists: true, error: null };
}

export function readLedgerMonth(
  dataDir: string,
  month: string,
): Promise<LedgerFileRead<MatchLedgerFile>> {
  return readJsonFile(ledgerMonthPath(dataDir, month), (json) =>
    MatchLedgerFileSchema.safeParse(json),
  );
}

export function readLedgerMeta(
  dataDir: string,
): Promise<LedgerFileRead<MatchLedgerMeta>> {
  return readJsonFile(ledgerMetaPath(dataDir), (json) =>
    MatchLedgerMetaSchema.safeParse(json),
  );
}

/**
 * 불완전한 원장 항목 — 득점 목록이 불완전(`goalsComplete` false)하거나, 라인업이 없어 한국 선수 행이 `unknown`이거나, 양 팀
 * 포메이션이 모두 없다(오케스트레이터 결정 2026-10-14). 이월 목록(af-pending)에 있는 동안 다시 받는다 — `ledgerPlanKnown`.
 */
export function isIncompleteLedgerMatch(
  m: Pick<LedgerMatch, "goalsComplete" | "korean" | "home" | "away">,
): boolean {
  return (
    !m.goalsComplete ||
    m.korean.some((r) => r.status === "unknown") ||
    (m.home.formation === null && m.away.formation === null)
  );
}

/** 이번 실행이 읽은 원장(근처 달) */
export interface LedgerWindowRead {
  months: Map<string, LedgerFileRead<MatchLedgerFile>>;
  /** 원장에 있는 경기 id(완전·불완전 모두) — 빠진 날(dropped) 치유·저장 확인 기준 */
  known: Set<number>;
  /** 그중 불완전한 경기 id(`isIncompleteLedgerMatch`) */
  incomplete: Set<number>;
  /** 읽은 달의 모든 경기(이번 실행 전) */
  previous: LedgerMatch[];
  /** 읽기·형식 오류(파일별) */
  errors: Array<{ file: string; error: string }>;
}

/**
 * 상세 요청 계획에 넘길 "이미 받은 경기"(순수 함수) — 원장 경기 중 **불완전 + 이월 목록에 있음**은 빼서 다시 받는다(날짜 창 안이면
 * 날짜 조회로, 밖이면 이월 재조회로 — 횟수는 이월 항목의 requeries가 이어 센다). 불완전 항목은 원장에 처음 들어갈 때 이월 목록에
 * 오르고(`requeueAfPending` incomplete), 정리 규칙(3일·재조회 3회)으로 빠지면 이 집합에 다시 들어와 그대로 확정된다 — 날짜 창 안에서
 * 정리돼도 횟수가 다시 0부터 세지지 않는다.
 */
export function ledgerPlanKnown(
  read: Pick<LedgerWindowRead, "known" | "incomplete">,
  pendingIds: ReadonlySet<number>,
): Set<number> {
  const known = new Set<number>();
  for (const id of read.known) {
    if (read.incomplete.has(id) && pendingIds.has(id)) continue;
    known.add(id);
  }
  return known;
}

/** 근처 달 원장 읽기 — 던지지 않는다(오류는 errors, 그 달은 known에서 빠지고 쓰지 않는다) */
export async function readLedgerWindow(
  dataDir: string,
  months: readonly string[],
): Promise<LedgerWindowRead> {
  const read: LedgerWindowRead = {
    months: new Map(),
    known: new Set(),
    incomplete: new Set(),
    previous: [],
    errors: [],
  };
  for (const month of months) {
    const r = await readLedgerMonth(dataDir, month);
    read.months.set(month, r);
    if (r.error !== null) {
      read.errors.push({
        file: path.posix.join("data", LEDGER_DIR_REL, `${month}.json`),
        error: r.error,
      });
    }
    for (const m of r.value?.matches ?? []) {
      const id = afIdOfKey(m.id);
      if (id !== null) {
        read.known.add(id);
        if (isIncompleteLedgerMatch(m)) read.incomplete.add(id);
      }
      read.previous.push(m);
    }
  }
  return read;
}

/** 임시 파일에 쓴 뒤 rename(반쯤 쓴 파일이 남지 않게) */
async function writeAtomic(target: string, text: string): Promise<string> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

export interface LedgerMonthWrite {
  month: string;
  added: number;
  replaced: number;
  /** 쓴 경로(변화 없음·실패면 null) */
  written: string | null;
  error: string | null;
}

/** 달 파일을 쓴 뒤 호출부에 알리는 결과 — 이월 목록 갱신용 */
export interface LedgerSettleInput {
  /** 원장에 넣지 못한 경기(달·메타 읽기·쓰기 실패) — 다시 받는다(재조회 +1) */
  unstored: readonly number[];
  /** 원장에 들어갔지만(또는 같은 내용이 이미 있음) 불완전한 경기 — 이월 목록에 올려 다시 받는다 */
  incomplete: readonly number[];
}

/** 호출부의 이월 목록 갱신 결과 — 정리 규칙(3일·재조회 3회)으로 버린 경기(빠진 날 dropped 후보) */
export interface LedgerSettleOutput {
  dropped: ReadonlyArray<{ id: number; kickoff: string }>;
}

export interface LedgerApplyResult {
  /**
   * started = 원장이 있거나 이번에 시작했다 · not-started = 메타 없음 + 받은 날짜 없음(쓰지 않음) · meta-unreadable = 메타를 읽지
   * 못해 쓰지 않음 · meta-unwritable = 새 원장의 메타를 먼저 쓰다 실패해 쓰지 않음
   */
  state: "started" | "not-started" | "meta-unreadable" | "meta-unwritable";
  months: LedgerMonthWrite[];
  /** 원장에 넣지 못한 경기 id(달 읽기·쓰기 실패·메타 실패) — 이월 목록에 다시 넣는다(settle) */
  unstored: number[];
  /** 원장에 있지만 불완전한 이번 경기 id — 이월 목록에 올린다(settle) */
  incomplete: number[];
  /** 킥오프가 since 앞이라 원장에 넣지 않은 경기 id(집계 밖 — 다시 받지 않는다) */
  beforeSince: number[];
  meta: LedgerMetaUpdate | null;
  /** 메타를 쓴 경로(변화 없음·실패면 null) */
  metaWritten: string | null;
  errors: string[];
}

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

const idsOf = (entries: readonly LedgerMatch[]) =>
  entries.flatMap((e) => {
    const id = afIdOfKey(e.id);
    return id === null ? [] : [id];
  });

/** 두 번의 메타 계산(새 원장 → 최종)을 한 보고로 합친다 */
function mergeMetaUpdates(
  first: LedgerMetaUpdate,
  second: LedgerMetaUpdate,
): LedgerMetaUpdate {
  return {
    meta: second.meta,
    changed: first.changed || second.changed,
    created: first.created || second.created,
    playersAdded: [...first.playersAdded, ...second.playersAdded],
    gapsAdded: [...first.gapsAdded, ...second.gapsAdded],
    gapsHealed: [...first.gapsHealed, ...second.gapsHealed],
    seasonMismatch: first.seasonMismatch || second.seasonMismatch,
  };
}

/**
 * 원장 쓰기(I/O) — (새 원장이면 메타 먼저) → 달 파일(새·바뀐 경기만) → `settle`(호출부가 이월 목록을 갱신하고 정리 규칙으로 버린
 * 경기를 돌려준다) → 메타. 쓰기 조건은 호출부가 정한다(`ledgerWriteMode`). 던지지 않는다.
 *   - 메타를 읽지 못하면 아무것도 쓰지 않고 이번 경기는 모두 `unstored`(settle은 부른다 — 이월 목록에 다시 넣는다).
 *   - 원장이 아직 없으면 새 메타(since)를 **먼저** 쓴다 — 달 파일만 있고 메타가 없는 상태(다음 실행이 since를 늦게 잡는다)를 막는다.
 *     이번 실행이 날짜를 하나도 받지 못했거나 시즌을 모르면 시작하지 않는다(not-started — 아무것도 쓰지 않고 settle도 부르지 않음).
 *   - 킥오프 UTC 날짜가 since 앞인 경기는 원장에 넣지 않는다(`beforeSince` — 집계 밖. 소비자는 since로 거를 필요가 없다).
 */
export async function applyLedger(input: {
  dataDir: string;
  now: string;
  read: LedgerWindowRead;
  entries: readonly LedgerMatch[];
  facts: Omit<LedgerRunFacts, "stored" | "previous" | "now">;
  settle?: (r: LedgerSettleInput) => LedgerSettleOutput;
}): Promise<LedgerApplyResult> {
  const result: LedgerApplyResult = {
    state: "started",
    months: [],
    unstored: [],
    incomplete: [],
    beforeSince: [],
    meta: null,
    metaWritten: null,
    errors: [],
  };
  const settle = (): ReadonlyArray<{ id: number; kickoff: string }> => {
    if (!input.settle) return [];
    try {
      return input.settle({
        unstored: result.unstored,
        incomplete: result.incomplete,
      }).dropped;
    } catch (error) {
      result.errors.push(`이월 목록 갱신: ${errorText(error)}`);
      return [];
    }
  };
  const metaRead = await readLedgerMeta(input.dataDir);
  if (metaRead.error !== null) {
    result.state = "meta-unreadable";
    result.unstored = idsOf(input.entries);
    result.errors.push(`data/${LEDGER_META_REL}: ${metaRead.error}`);
    settle();
    return result;
  }

  // 새 원장 — 메타(since·playerSince·첫 기회 공백)를 먼저 쓴다
  let current = metaRead.value;
  let created: LedgerMetaUpdate | null = null;
  if (current === null) {
    const first = nextLedgerMeta(null, {
      ...input.facts,
      dropped: [],
      now: input.now,
      stored: new Set(),
      previous: input.read.previous,
    });
    if (first.meta === null) {
      result.state = "not-started";
      return result;
    }
    try {
      result.metaWritten = await writeAtomic(
        ledgerMetaPath(input.dataDir),
        serializeLedgerMeta(first.meta),
      );
    } catch (error) {
      result.state = "meta-unwritable";
      result.unstored = idsOf(input.entries);
      result.errors.push(`data/${LEDGER_META_REL}: ${errorText(error)}`);
      settle();
      return result;
    }
    current = first.meta;
    created = first;
  }

  // since 앞 경기는 넣지 않는다
  const since = current.since;
  const kept: LedgerMatch[] = [];
  for (const e of input.entries) {
    if (utcDate(e.kickoff) < since) {
      const id = afIdOfKey(e.id);
      if (id !== null) result.beforeSince.push(id);
    } else {
      kept.push(e);
    }
  }

  // 달 파일
  const byMonth = new Map<string, LedgerMatch[]>();
  for (const e of kept) {
    const month = ledgerMonthOf(e.kickoff);
    byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
  }
  const reads = new Map(input.read.months);
  const stored = new Set(input.read.known);
  for (const [month, entries] of [...byMonth.entries()].sort()) {
    const ids = idsOf(entries);
    let read = reads.get(month);
    if (read === undefined) {
      read = await readLedgerMonth(input.dataDir, month);
      reads.set(month, read);
      for (const m of read.value?.matches ?? []) {
        const id = afIdOfKey(m.id);
        if (id !== null) stored.add(id);
      }
    }
    if (read.error !== null) {
      result.unstored.push(...ids);
      result.months.push({
        month,
        added: 0,
        replaced: 0,
        written: null,
        error: read.error,
      });
      result.errors.push(`data/${LEDGER_DIR_REL}/${month}.json: ${read.error}`);
      continue;
    }
    const update = upsertLedgerMonth(read.value, month, entries, input.now);
    if (!update.changed) {
      for (const id of ids) stored.add(id);
      result.months.push({
        month,
        added: 0,
        replaced: 0,
        written: null,
        error: null,
      });
      continue;
    }
    try {
      const written = await writeAtomic(
        ledgerMonthPath(input.dataDir, month),
        serializeLedgerMonth(MatchLedgerFileSchema.parse(update.file)),
      );
      for (const id of ids) stored.add(id);
      result.months.push({
        month,
        added: update.added.length,
        replaced: update.replaced.length,
        written,
        error: null,
      });
    } catch (error) {
      // 새·바뀐 경기만 원장에 없다(같은 내용은 이미 있다)
      const changedKeys = new Set([...update.added, ...update.replaced]);
      result.unstored.push(
        ...entries.flatMap((e) => {
          const id = afIdOfKey(e.id);
          return id !== null && changedKeys.has(e.id) ? [id] : [];
        }),
      );
      for (const e of entries) {
        const id = afIdOfKey(e.id);
        if (id !== null && !changedKeys.has(e.id)) stored.add(id);
      }
      result.months.push({
        month,
        added: 0,
        replaced: 0,
        written: null,
        error: errorText(error),
      });
      result.errors.push(
        `data/${LEDGER_DIR_REL}/${month}.json: ${errorText(error)}`,
      );
    }
  }
  const unstoredSet = new Set(result.unstored);
  result.incomplete = kept.flatMap((e) => {
    const id = afIdOfKey(e.id);
    return id !== null && !unstoredSet.has(id) && isIncompleteLedgerMatch(e)
      ? [id]
      : [];
  });

  // 이월 목록(호출부) → 메타 — 이월 정리로 버린 경기까지 빠진 날(dropped)에 남긴다
  const dropped = [...input.facts.dropped, ...settle()];
  try {
    const meta = nextLedgerMeta(current, {
      ...input.facts,
      dropped,
      now: input.now,
      stored,
      previous: input.read.previous,
    });
    result.meta = created ? mergeMetaUpdates(created, meta) : meta;
    if (meta.meta !== null && meta.changed) {
      result.metaWritten = await writeAtomic(
        ledgerMetaPath(input.dataDir),
        serializeLedgerMeta(meta.meta),
      );
    }
  } catch (error) {
    result.errors.push(`data/${LEDGER_META_REL}: ${errorText(error)}`);
  }
  return result;
}
