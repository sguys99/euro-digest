/**
 * 팀 프로필 — 팀 한줄평 + 강점/약점 (M4-05·M4-06 — PRD FR-53·FR-56, §9.1 '20팀 묶음', §15 D24·D28, LLM 호출 지점 #2).
 * 순수 함수만 둔다. I/O(대회·팀 파일 읽기, Batches 호출, 팀 파일 쓰기)는 team-profile-stage.ts가 맡는다.
 *
 * ① 대상(`buildTeamMetrics`): 팀 파일의 `comp`(소속 대회 — 5대 리그 팀은 리그, 5대 리그 밖 UCL 팀은 UCL) 순위표에 그 팀 행이 있고
 *    경기 수가 `TEAM_PROFILE_MIN_PLAYED` 이상인 팀. 순위표가 없는 팀(대회 파일 없음 등)과 표본이 적은 팀(시즌 초 UCL 리그 페이즈
 *    3경기 — 강점/약점 근거가 1~2경기)은 부르지 않고 이전 값 규칙(⑦)을 따른다.
 * ② 지표(입력은 대회 파일만 — 기사·선수 정보 없음, D23·D24): 블록 lg(소속 대회) + ucl(5대 리그 팀의 UCL 리그 페이즈, 1경기 이상).
 *    블록 = 순위표(순위·경기·승무패·득실·승점) + 대회 안 득점·실점 순위 + 순위 구간(3등분) + 구간(zone) + 최근 5경기 폼(순위표 값 —
 *    오래된 → 최근) + 경기 목록에서 계산한 홈/원정·현재 연속 결과·무패·무승·무실점·무득점·3골 이상 경기('득점 분포' — FR-56).
 *    경기 목록이 순위표와 맞지 않으면(종료 경기 수·승무패·득실 합이 다름 — 순위표만 먼저 갱신된 날, D60) 경기 목록에서 계산하는
 *    값은 넣지 않는다(서로 어긋난 숫자를 보내지 않는다).
 * ③ LLM 입력: 팀 이름·slug를 보내지 않고 묶음 안 기호(t01…)만 보낸다 — 모델이 이름에서 아는 사실(선수·전술·역사)을 끌어오지 못하게
 *    (입력에 없는 사실 금지 — CLAUDE.md §1-7). 이름이 없으니 고유명사 치환(names.ko)·조사 보정은 할 일이 없고, 대신 출력에 사전의
 *    선수·팀 한글 표기나 라틴 글자가 나오면 입력 밖 이름으로 보고 실패시킨다(⑥).
 * ④ 묶음(`groupTeams` — PRD §9.1): 요청 하나에 최대 20팀, 묶음 수 = ceil(팀 수 / 20), 크기는 고르게(96팀 → 20·19·19·19·19).
 *    순서는 대회(EPL→…→UCL) → 순위. 같은 지시문(system)으로 여러 요청을 보내므로 지시문 캐싱을 켠다(D28 — 팀 프로필은 켬).
 * ⑤ 출력(`parseTeamProfileOutput`): 짧은 키 JSON `{"t":[{"id","o","s":[2],"w":[2]}]}`. 팀 항목마다 따로 zod — 한 팀의 형식 오류가 같은
 *    묶음의 다른 팀을 버리지 않는다.
 * ⑥ 코드 검증(`checkTeamProfile` — M0-30: zod만으로는 영어·한자·지어낸 사실을 거르지 못한다): 한자·가나·라틴 글자 · 형식
 *    (한줄평 '다.' 한 문장·80자 이내, 강점/약점 40자 이내·마침표 없음·'다'로 끝나지 않음·중복 없음) · 입력 밖 이름(사전 선수·팀 한글
 *    표기) · 지표 밖 주제 낱말(선수·감독·부상·이적·전술·점유·슈팅·전망 등) · 숫자 근거(모든 수가 그 팀 지표 수 집합에 있음) · 단위별
 *    수('n위'·'승점 n'·'n승/무/패'·'n실점'·'n골'·'n경기'·'n연승/연패'·'n경기 무패/무승'·'무실점/무득점 n경기') · 서술 대조(선두·최하위·
 *    상위권/중위권/하위권·강등·16강·플레이오프·탈락·최다 득점·최소 실점·최다 실점·최소 득점·홈/원정 무패·전승·무승·연승·연패 등) ·
 *    강점/약점 쪽(강점의 득점·실점 순위는 위 절반, 약점은 위 3분의 1 밖).
 *    하나라도 걸리면 그 팀 실패(팀 단위 — 같은 묶음의 다른 팀은 통과할 수 있다).
 * ⑦ 실패·대상 밖 팀(`decideProfile`): **템플릿으로 강등하지 않는다** — 팀 스키마 `profile`에 ai 표시가 없고 화면은 이 블록 머리에
 *    'AI 작성' 라벨을 붙인다(D64 ⑥). 코드 문장을 넣으면 사람이 쓴 문장에 AI 라벨이 붙는다(FR-29 템플릿은 `ai:false`를 표시할 수 있는
 *    브리핑 줄 전용). 그래서 이전 프로필이 `TEAM_PROFILE_KEEP_DAYS` 안이면 그대로 두고(생성 날짜가 함께 보인다 — FR-53), 더 오래됐거나
 *    없으면 null(화면은 블록을 숨긴다).
 */
import { z } from "zod";

import type {
  CompId,
  CompetitionFile,
  Match,
  StandingRow,
  Team,
} from "@/lib/schema";

import { unwrapBriefOutput } from "./brief";
import { estimateCost, type CostEstimate } from "./cost";
import type { LlmRequest } from "./llm";
import type { NameIndex } from "./names";
import { matchResultFor, teamForms, type FormResult } from "./standings-enrich";

// ─── 요청 설정 (CLAUDE.md §1-3 — 바꾸려면 사용자 승인) ─────────────────────

export const TEAM_PROFILE_PROMPT_PATH = "configs/prompts/team-profile.md";
/** 요청 하나에 넣는 최대 팀 수(PRD §9.1 '20팀 묶음') */
export const TEAM_PROFILE_GROUP_SIZE = 20;
/**
 * 요청당 max_tokens 32,768 — 2026-11-02 사용자 승인(M4-06 안 A, llm.ts MAX_TOKENS_BY_CALL_SITE["team-profile"]). 16,384에서는 20팀
 * 묶음 5개 중 3개가 thinking만으로 잘렸다(실측 thinking 10~16K, 보이는 출력 20팀 약 2~3K). 브리핑·주간 총평은 16,384 그대로.
 */
export const TEAM_PROFILE_MAX_TOKENS = 32_768;
export const TEAM_PROFILE_EFFORT = "medium" as const;
export const TEAM_PROFILE_THINKING = "adaptive" as const;
/** 첫 시도 + 실패 팀만 모은 재시도 1회(FR-29와 같은 횟수 — 재시도 2회 이상은 사용자 승인 사항) */
export const TEAM_PROFILE_MAX_ATTEMPTS = 2;

// ─── 규칙 상수 ────────────────────────────────────────────────────────────

/** 프로필을 쓰는 최소 경기 수(소속 대회 기준) — 강점/약점이 1~2경기에 기대지 않게 */
export const TEAM_PROFILE_MIN_PLAYED = 5;
/** 이번 주 실패·대상 밖 팀이 이전 프로필을 유지하는 기간(일) — 넘으면 null */
export const TEAM_PROFILE_KEEP_DAYS = 21;
/** 한줄평 상한(팀 스키마 profile.oneLiner max 80) */
export const TEAM_PROFILE_ONE_LINER_MAX = 80;
/** 강점/약점 항목 상한(지시문 '40자 이내') */
export const TEAM_PROFILE_BULLET_MAX = 40;
/** 3골 이상 경기('득점 분포') 기준 */
export const BIG_SCORE_GOALS = 3;

// ─── ② 지표 ──────────────────────────────────────────────────────────────

export interface VenueRecord {
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}

export type ProfileBand = "top" | "mid" | "bottom";
/** relegation(리그) · knockout·playoff·out(UCL 리그 페이즈) */
export type ProfileZone = "relegation" | "knockout" | "playoff" | "out";

/** 성적 블록 1개(소속 대회 lg 또는 UCL) — 키 이름 = 지시문 [입력] 절 */
export interface MetricsBlock {
  pos: number;
  n: number;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  /** 대회 안 득점 순위(많은 순, 같은 값 같은 순위) */
  gfR: number;
  /** 대회 안 실점 순위(적은 순) */
  gaR: number;
  band: ProfileBand;
  zone?: ProfileZone;
  /** 최근 경기(최대 5, 오래된 → 최근) */
  form: FormResult[];
  // ↓ 경기 목록에서 계산 — 순위표와 맞을 때만
  home?: VenueRecord;
  away?: VenueRecord;
  /** 현재 같은 결과 연속(2 이상일 때만) */
  run?: { r: FormResult; n: number };
  /** 현재 무패 연속(2 이상) */
  unb?: number;
  /** 현재 무승 연속(2 이상) */
  wl?: number;
  cs?: number;
  fts?: number;
  big?: number;
}

export interface TeamMetrics {
  slug: string;
  comp: CompId;
  /** 소속 대회 블록(5대 리그 밖 팀은 UCL 리그 페이즈) */
  lg: MetricsBlock;
  /** 5대 리그 팀의 UCL 리그 페이즈(1경기 이상) — 소속 대회가 UCL이면 없음 */
  ucl: MetricsBlock | null;
}

export type CompetitionFiles = Partial<Record<CompId, CompetitionFile>>;

/** 순위 구간 — 3등분(위 round(n/3)팀 top, 아래 round(n/3)팀 bottom) */
export function bandOf(pos: number, n: number): ProfileBand {
  const third = Math.round(n / 3);
  if (pos <= third) return "top";
  if (pos > n - third) return "bottom";
  return "mid";
}

function zoneOf(row: StandingRow, comp: CompId): ProfileZone | undefined {
  if (comp === "UCL") {
    if (row.zone === "knockout") return "knockout";
    if (row.zone === "playoff") return "playoff";
    return "out";
  }
  return row.zone === "relegation" ? "relegation" : undefined;
}

function byKickoff(a: Match, b: Match): number {
  const t = Date.parse(a.kickoff) - Date.parse(b.kickoff);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type DerivedFields = Pick<
  MetricsBlock,
  "home" | "away" | "run" | "unb" | "wl" | "cs" | "fts" | "big"
>;

/** 경기 목록에서 계산하는 값 — 순위표와 맞지 않으면 null(머리 주석 ②) */
function matchDerived(
  slug: string,
  row: StandingRow,
  matches: readonly Match[],
): DerivedFields | null {
  const mine = matches
    .filter(
      (m) =>
        m.status === "finished" &&
        m.score !== null &&
        (m.home === slug || m.away === slug),
    )
    .sort(byKickoff);
  const home: VenueRecord = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const away: VenueRecord = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const results: FormResult[] = [];
  let cs = 0;
  let fts = 0;
  let big = 0;
  for (const m of mine) {
    const r = matchResultFor(m, slug);
    if (r === null || m.score === null) continue;
    const isHome = m.home === slug;
    const own = isHome ? m.score.h : m.score.a;
    const opp = isHome ? m.score.a : m.score.h;
    const v = isHome ? home : away;
    v.p += 1;
    v.gf += own;
    v.ga += opp;
    if (r === "W") v.w += 1;
    else if (r === "D") v.d += 1;
    else v.l += 1;
    results.push(r);
    if (opp === 0) cs += 1;
    if (own === 0) fts += 1;
    if (own >= BIG_SCORE_GOALS) big += 1;
  }
  const consistent =
    home.p + away.p === row.played &&
    home.gf + away.gf === row.gf &&
    home.ga + away.ga === row.ga &&
    home.w + away.w === row.w &&
    home.d + away.d === row.d &&
    home.l + away.l === row.l;
  if (!consistent) return null;
  const tailCount = (pred: (r: FormResult) => boolean) => {
    let n = 0;
    for (let i = results.length - 1; i >= 0 && pred(results[i]!); i -= 1)
      n += 1;
    return n;
  };
  const last = results.at(-1);
  const runN = last === undefined ? 0 : tailCount((r) => r === last);
  const unb = tailCount((r) => r !== "L");
  const wl = tailCount((r) => r !== "W");
  return {
    home,
    away,
    ...(last !== undefined && runN >= 2 ? { run: { r: last, n: runN } } : {}),
    ...(unb >= 2 ? { unb } : {}),
    ...(wl >= 2 ? { wl } : {}),
    cs,
    fts,
    big,
  };
}

/** 대회 파일 1개 → 그 팀 블록(순위표 행이 없으면 null) */
export function buildMetricsBlock(
  slug: string,
  file: CompetitionFile,
): MetricsBlock | null {
  const row = file.standings.find((r) => r.team === slug);
  if (!row) return null;
  const n = file.standings.length;
  const gfR = 1 + file.standings.filter((r) => r.gf > row.gf).length;
  const gaR = 1 + file.standings.filter((r) => r.ga < row.ga).length;
  // 폼은 순위표 값(M2-03 — 화면 헤더와 같다). 비어 있으면 경기 목록에서 다시 계산
  const form =
    row.form.length > 0
      ? [...row.form]
      : (teamForms(file.matches).get(slug) ?? []);
  const zone = zoneOf(row, file.comp);
  const derived = matchDerived(slug, row, file.matches);
  return {
    pos: row.pos,
    n,
    p: row.played,
    w: row.w,
    d: row.d,
    l: row.l,
    gf: row.gf,
    ga: row.ga,
    gd: row.gf - row.ga,
    pts: row.pts,
    gfR,
    gaR,
    band: bandOf(row.pos, n),
    ...(zone !== undefined ? { zone } : {}),
    form,
    ...(derived ?? {}),
  };
}

export type EligibilityReason =
  | "ok"
  | "no-competition" // 소속 대회 파일 없음
  | "no-standing" // 순위표에 그 팀 행 없음
  | "few-matches"; // 경기 수 < TEAM_PROFILE_MIN_PLAYED

/** 대상 판정 + 지표(머리 주석 ①②) */
export function buildTeamMetrics(
  team: Pick<Team, "slug" | "comp">,
  competitions: CompetitionFiles,
): { reason: EligibilityReason; metrics: TeamMetrics | null } {
  const file = competitions[team.comp];
  if (!file) return { reason: "no-competition", metrics: null };
  const lg = buildMetricsBlock(team.slug, file);
  if (lg === null) return { reason: "no-standing", metrics: null };
  if (lg.p < TEAM_PROFILE_MIN_PLAYED)
    return { reason: "few-matches", metrics: null };
  let ucl: MetricsBlock | null = null;
  if (team.comp !== "UCL" && competitions.UCL) {
    const block = buildMetricsBlock(team.slug, competitions.UCL);
    if (block !== null && block.p >= 1) ucl = block;
  }
  return {
    reason: "ok",
    metrics: { slug: team.slug, comp: team.comp, lg, ucl },
  };
}

// ─── ③④ 입력·묶음·요청 ────────────────────────────────────────────────────

export interface ProfileGroupTeam {
  /** 묶음 안 기호(t01…) — LLM이 보는 유일한 팀 식별자 */
  id: string;
  metrics: TeamMetrics;
}

export interface ProfileGroup {
  customId: string;
  teams: ProfileGroupTeam[];
}

const COMP_ORDER: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

/** 묶음 순서 — 대회 → 순위 → slug */
export function sortForGroups(list: readonly TeamMetrics[]): TeamMetrics[] {
  return [...list].sort(
    (a, b) =>
      COMP_ORDER.indexOf(a.comp) - COMP_ORDER.indexOf(b.comp) ||
      a.lg.pos - b.lg.pos ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}

/** 균등 분할 — ceil(n/size)개 묶음, 크기 차이 최대 1(앞 묶음이 큼) */
export function chunkEvenly<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const count = Math.ceil(items.length / size);
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const len = base + (i < extra ? 1 : 0);
    out.push(items.slice(at, at + len));
    at += len;
  }
  return out;
}

/** customId — 첫 시도 `team-profile-<라벨>-g<n>`, 재시도 `team-profile-<라벨>-r1-g<n>`(라벨 = 주차 또는 golden) */
export function profileCustomId(
  label: string,
  attempt: number,
  index: number,
): string {
  return attempt <= 1
    ? `team-profile-${label}-g${index}`
    : `team-profile-${label}-r${attempt - 1}-g${index}`;
}

/** 팀 지표 → 묶음(정렬·균등 분할·기호 부여) */
export function groupTeams(
  list: readonly TeamMetrics[],
  label: string,
  attempt: number = 1,
  size: number = TEAM_PROFILE_GROUP_SIZE,
): ProfileGroup[] {
  return chunkEvenly(sortForGroups(list), size).map((chunk, i) => ({
    customId: profileCustomId(label, attempt, i + 1),
    teams: chunk.map((metrics, j) => ({
      id: `t${String(j + 1).padStart(2, "0")}`,
      metrics,
    })),
  }));
}

/** LLM user 본문 — 결정적 JSON(키 순서 고정), 팀 이름·slug 없음 */
export function serializeGroupInput(group: ProfileGroup): string {
  return JSON.stringify({
    t: group.teams.map((t) => ({
      id: t.id,
      lg: t.metrics.lg,
      ...(t.metrics.ucl ? { ucl: t.metrics.ucl } : {}),
    })),
  });
}

export function buildProfileRequest(
  group: ProfileGroup,
  system: string,
): LlmRequest {
  return {
    customId: group.customId,
    system,
    user: serializeGroupInput(group),
    maxTokens: TEAM_PROFILE_MAX_TOKENS,
    effort: TEAM_PROFILE_EFFORT,
    thinking: TEAM_PROFILE_THINKING,
    callSite: "team-profile", // max_tokens 상한 32,768(llm.ts MAX_TOKENS_BY_CALL_SITE) — 배치 전용
    // 같은 지시문으로 요청 여러 개(묶음) — D28: 주간 팀 프로필은 지시문 캐싱 켬(Haiku 5.5 최소 프리픽스 512토큰)
    cacheSystem: true,
  };
}

/**
 * 시도 1회 최악값(배치 50%) — 입력 어림은 brief·weekly와 같다(한국어 지시문 글자당 1토큰, 영문 JSON 1.5자당 1토큰), 출력은 max_tokens.
 * 지시문은 캐시 쓰기(1.25배)로 셈한다(최악 — 실제로는 같은 배치 안 적중분이 읽기 0.1배).
 */
export function estimateProfileWorstCase(
  requests: readonly Pick<LlmRequest, "system" | "user" | "maxTokens">[],
  model: string,
): CostEstimate {
  if (requests.length === 0) {
    return estimateCost({
      model,
      requests: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      batch: true,
    });
  }
  const inputs = requests.map((r) =>
    Math.ceil(r.system.length + r.user.length / 1.5),
  );
  const avgIn = Math.ceil(inputs.reduce((a, b) => a + b, 0) / inputs.length);
  const maxOut = Math.max(...requests.map((r) => r.maxTokens));
  const systemTokens = requests.reduce((a, r) => a + r.system.length, 0);
  return estimateCost({
    model,
    requests: requests.length,
    avgInputTokens: avgIn,
    avgOutputTokens: maxOut,
    batch: true,
    cacheWriteTokens: systemTokens,
  });
}

// ─── ⑤ 출력 ──────────────────────────────────────────────────────────────

const TextSchema = z.string().trim().min(2);
export const ProfileItemSchema = z.strictObject({
  id: z.string(),
  o: TextSchema,
  s: z.array(TextSchema).length(2),
  w: z.array(TextSchema).length(2),
});
export type ProfileItem = z.infer<typeof ProfileItemSchema>;

const OutputEnvelopeSchema = z.strictObject({ t: z.array(z.unknown()) });

export type ProfileParseResult =
  | {
      ok: true;
      /** 기호 → 항목(형식에 맞은 것만, 같은 기호가 두 번이면 둘 다 뺀다) */
      items: Map<string, ProfileItem>;
      /** 형식이 틀린 항목의 기호(알 수 있으면)·사유 */
      invalid: Array<{ id: string | null; detail: string }>;
    }
  | { ok: false; reason: "json" | "schema"; detail: string };

const cleanText = (text: string) =>
  text.normalize("NFC").replace(/\s+/gu, " ").trim();

function idOf(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("id" in raw)) return null;
  const id = (raw as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function parseTeamProfileOutput(text: string): ProfileParseResult {
  const { body } = unwrapBriefOutput(text);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: "json", detail: "JSON 파싱 실패" };
  }
  const envelope = OutputEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    return {
      ok: false,
      reason: "schema",
      detail: envelope.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join(" · "),
    };
  }
  const items = new Map<string, ProfileItem>();
  const dup = new Set<string>();
  const invalid: Array<{ id: string | null; detail: string }> = [];
  for (const raw of envelope.data.t) {
    const parsed = ProfileItemSchema.safeParse(raw);
    if (!parsed.success) {
      invalid.push({
        id: idOf(raw),
        detail: parsed.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join(".") || "(item)"}: ${i.message}`)
          .join(" · "),
      });
      continue;
    }
    const item: ProfileItem = {
      id: parsed.data.id,
      o: cleanText(parsed.data.o),
      s: parsed.data.s.map(cleanText),
      w: parsed.data.w.map(cleanText),
    };
    if (items.has(item.id) || dup.has(item.id)) {
      items.delete(item.id);
      dup.add(item.id);
      invalid.push({ id: item.id, detail: "같은 id가 두 번" });
      continue;
    }
    items.set(item.id, item);
  }
  return { ok: true, items, invalid };
}

// ─── ⑥ 코드 검증 ────────────────────────────────────────────────────────

export type ProfileCheckCode =
  | "han"
  | "latin"
  | "too-short"
  | "sentence-form" // 한줄평: '다.' 한 문장
  | "bullet-form" // 강점/약점: 마침표 없음·'다'로 끝나지 않음
  | "too-long"
  | "duplicate"
  | "name" // 입력 밖 이름(사전 선수·팀 한글 표기)
  | "topic" // 지표 밖 주제 낱말
  | "number" // 문장의 수가 지표 수 집합에 없음
  | "unit" // 단위별 수가 맞는 지표 값이 아님
  | "claim" // 서술(선두·최소 실점·홈 무패 등)이 지표와 다름
  | "side"; // 강점에 하위 순위·약점에 상위 순위(득점·실점 순위)

export interface ProfileCheckIssue {
  code: ProfileCheckCode;
  /** o · s1 · s2 · w1 · w2 */
  field: string;
  detail?: string;
}

export interface ProfileCheckContext {
  /** 사전 선수·팀 한글 표기(2글자 이상, 긴 것부터) — `profileNameList` */
  names: readonly string[];
}

/** 사전(names.ko)의 선수·팀 한글 표기 — 입력 밖 이름 찾기용 */
export function profileNameList(index: NameIndex): string[] {
  const out = new Set<string>();
  for (const e of index.byEn.values()) {
    if ((e.kind === "player" || e.kind === "team") && e.ko.length >= 2)
      out.add(e.ko);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * 지표 밖 주제 — 입력에 근거가 있을 수 없는 낱말(선수 개인·감독·부상·이적·전술·경기 내용 지표·전망·감탄). 하나라도 있으면 실패.
 * '공격력·수비력·득점력'처럼 득실 지표로 말할 수 있는 낱말은 막지 않는다.
 */
export const PROFILE_TOPIC_WORDS: readonly string[] = Object.freeze([
  "선수",
  "감독",
  "부상",
  "이적",
  "영입",
  "전술",
  "포메이션",
  "점유",
  "패스",
  "슈팅",
  "슛",
  "압박",
  "역습",
  "세트피스",
  "코너킥",
  "프리킥",
  "크로스",
  "빌드업",
  "골키퍼",
  "수비수",
  "공격수",
  "미드필더",
  "스트라이커",
  "에이스",
  "주전",
  "스쿼드",
  "유망주",
  "관중",
  "경기장",
  "재정",
  "기대 득점",
  "퇴장",
  "페널티",
  "심판",
  "체력",
  "로테이션",
  "우승",
  "전망",
  "예상",
  "기대",
  "가능성",
  "맹활약",
  "폭발",
  "아쉽",
  "역사",
  "전통",
]);

interface BlockFacts {
  block: MetricsBlock;
  isUcl: boolean;
}

interface ProfileFacts {
  blocks: BlockFacts[];
  all: Set<number>;
  pos: Set<number>;
  pts: Set<number>;
  wins: Set<number>;
  draws: Set<number>;
  losses: Set<number>;
  conceded: Set<number>;
  goals: Set<number>;
  games: Set<number>;
  teams: Set<number>;
  gd: Set<number>;
}

function factsOf(metrics: TeamMetrics): ProfileFacts {
  const f: ProfileFacts = {
    blocks: [{ block: metrics.lg, isUcl: metrics.comp === "UCL" }],
    all: new Set(),
    pos: new Set(),
    pts: new Set(),
    wins: new Set(),
    draws: new Set(),
    losses: new Set(),
    conceded: new Set(),
    goals: new Set(),
    games: new Set(),
    teams: new Set(),
    gd: new Set(),
  };
  if (metrics.ucl) f.blocks.push({ block: metrics.ucl, isUcl: true });
  const add = (set: Set<number>, ...values: Array<number | undefined>) => {
    for (const v of values) {
      if (v === undefined) continue;
      set.add(v);
      f.all.add(v);
    }
  };
  for (const { block: b } of f.blocks) {
    add(f.pos, b.pos, b.gfR, b.gaR);
    add(f.teams, b.n);
    add(f.pts, b.pts);
    const count = (r: FormResult) => b.form.filter((x) => x === r).length;
    add(f.wins, b.w, b.home?.w, b.away?.w, count("W"));
    add(f.draws, b.d, b.home?.d, b.away?.d, count("D"));
    add(f.losses, b.l, b.home?.l, b.away?.l, count("L"));
    add(f.conceded, b.ga, b.home?.ga, b.away?.ga);
    add(
      f.goals,
      b.gf,
      b.ga,
      b.home?.gf,
      b.home?.ga,
      b.away?.gf,
      b.away?.ga,
      BIG_SCORE_GOALS,
    );
    add(
      f.games,
      b.p,
      b.home?.p,
      b.away?.p,
      b.cs,
      b.fts,
      b.big,
      b.unb,
      b.wl,
      b.run?.n,
      b.form.length,
    );
    add(f.gd, Math.abs(b.gd));
  }
  return f;
}

const HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LATIN = /\p{Script=Latin}/u;
const HANGUL = /[가-힣]/gu;

interface Claim {
  label: string;
  re: RegExp;
  ok: (f: ProfileFacts) => boolean;
}

const some = (
  f: ProfileFacts,
  pred: (b: MetricsBlock, isUcl: boolean) => boolean,
) => f.blocks.some(({ block, isUcl }) => pred(block, isUcl));

const allWins = (v: VenueRecord | undefined) =>
  v !== undefined && v.p > 0 && v.w === v.p;

/** 홈/원정 서술 앞부분 — '홈', '홈에서', '홈 경기', '홈 5경기' */
const VENUE_HEAD = (venue: "홈" | "원정") =>
  `${venue}(?:에서|\\s*경기)?\\s*(?:\\d+\\s*경기\\s*)?`;

/** 서술 대조(머리 주석 ⑥) — 표현이 있으면 지표 블록 중 하나가 그렇게 말해야 한다 */
const CLAIMS: readonly Claim[] = [
  { label: "선두", re: /선두/u, ok: (f) => some(f, (b) => b.pos === 1) },
  {
    label: "최하위",
    re: /최하위|꼴찌/u,
    ok: (f) => some(f, (b) => b.pos === b.n),
  },
  {
    label: "상위권",
    re: /상위권/u,
    ok: (f) => some(f, (b) => b.band === "top"),
  },
  {
    label: "중위권",
    re: /중위권/u,
    ok: (f) => some(f, (b) => b.band === "mid"),
  },
  {
    label: "하위권",
    re: /하위권/u,
    ok: (f) => some(f, (b) => b.band === "bottom"),
  },
  {
    label: "강등",
    re: /강등/u,
    ok: (f) =>
      some(
        f,
        (b, isUcl) =>
          !isUcl && (b.zone === "relegation" || b.band === "bottom"),
      ),
  },
  {
    label: "16강",
    re: /16강/u,
    ok: (f) => some(f, (b) => b.zone === "knockout"),
  },
  {
    label: "플레이오프",
    re: /플레이오프/u,
    ok: (f) => some(f, (b) => b.zone === "playoff"),
  },
  { label: "탈락", re: /탈락/u, ok: (f) => some(f, (b) => b.zone === "out") },
  {
    label: "최다 득점",
    re: /최다\s*득점|최다\s*골|가장\s*많은\s*(?:골|득점)|득점(?:이|은)?\s*가장\s*많|득점\s*1위/u,
    ok: (f) => some(f, (b) => b.gfR === 1),
  },
  {
    label: "최소 실점",
    re: /최소\s*실점|가장\s*적은\s*실점|실점(?:이|은)?\s*가장\s*적|실점\s*1위/u,
    ok: (f) => some(f, (b) => b.gaR === 1),
  },
  {
    label: "최다 실점",
    re: /최다\s*실점|가장\s*많은\s*실점|실점(?:이|은)?\s*가장\s*많/u,
    ok: (f) => some(f, (b) => b.gaR === b.n),
  },
  {
    label: "최소 득점",
    re: /최소\s*득점|가장\s*적은\s*(?:골|득점)|득점(?:이|은)?\s*가장\s*적/u,
    ok: (f) => some(f, (b) => b.gfR === b.n),
  },
  {
    label: "홈 무패",
    re: new RegExp(`${VENUE_HEAD("홈")}무패`, "u"),
    ok: (f) => some(f, (b) => b.home !== undefined && b.home.l === 0),
  },
  {
    label: "원정 무패",
    re: new RegExp(`${VENUE_HEAD("원정")}무패`, "u"),
    ok: (f) => some(f, (b) => b.away !== undefined && b.away.l === 0),
  },
  {
    label: "홈 전승",
    re: new RegExp(`${VENUE_HEAD("홈")}전승`, "u"),
    ok: (f) => some(f, (b) => allWins(b.home)),
  },
  {
    label: "원정 전승",
    re: new RegExp(`${VENUE_HEAD("원정")}전승`, "u"),
    ok: (f) => some(f, (b) => allWins(b.away)),
  },
  {
    label: "홈 무승",
    re: new RegExp(`${VENUE_HEAD("홈")}무승(?!부)`, "u"),
    ok: (f) => some(f, (b) => b.home !== undefined && b.home.w === 0),
  },
  {
    label: "원정 무승",
    re: new RegExp(`${VENUE_HEAD("원정")}무승(?!부)`, "u"),
    ok: (f) => some(f, (b) => b.away !== undefined && b.away.w === 0),
  },
  {
    label: "전승",
    re: /전승/u,
    ok: (f) =>
      some(
        f,
        (b) => (b.p > 0 && b.w === b.p) || allWins(b.home) || allWins(b.away),
      ),
  },
  {
    label: "무패",
    re: /무패/u,
    ok: (f) =>
      some(
        f,
        (b) =>
          b.l === 0 || (b.unb ?? 0) >= 2 || b.home?.l === 0 || b.away?.l === 0,
      ),
  },
  {
    label: "무승",
    re: /무승(?!부)/u,
    ok: (f) =>
      some(
        f,
        (b) =>
          b.w === 0 || (b.wl ?? 0) >= 2 || b.home?.w === 0 || b.away?.w === 0,
      ),
  },
  {
    label: "연승",
    re: /연승|연속\s*승리/u,
    ok: (f) => some(f, (b) => b.run?.r === "W"),
  },
  {
    label: "연패",
    re: /연패|연속\s*패배/u,
    ok: (f) => some(f, (b) => b.run?.r === "L"),
  },
  {
    label: "연속 무승부",
    re: /연속\s*무승부/u,
    ok: (f) => some(f, (b) => b.run?.r === "D"),
  },
  {
    // '무실점 경기 없음'·'무실점 0경기'는 cs 0을 말한다
    label: "무실점 없음",
    re: /무실점\s*(?:경기\s*)?(?:없|0\s*경기)/u,
    ok: (f) => some(f, (b) => b.cs === 0),
  },
  {
    label: "무실점",
    re: /무실점(?!\s*(?:경기\s*)?(?:없|0\s*경기))/u,
    ok: (f) => some(f, (b) => (b.cs ?? 0) >= 1),
  },
  {
    label: "무득점 없음",
    re: /무득점\s*(?:경기\s*)?(?:없|0\s*경기)/u,
    ok: (f) => some(f, (b) => b.fts === 0),
  },
  {
    label: "무득점",
    re: /무득점(?!\s*(?:경기\s*)?(?:없|0\s*경기))/u,
    ok: (f) => some(f, (b) => (b.fts ?? 0) >= 1),
  },
  {
    label: "홈·원정",
    re: /홈|원정/u,
    ok: (f) => some(f, (b) => b.home !== undefined),
  },
];

interface UnitRule {
  label: string;
  re: RegExp;
  allowed: (f: ProfileFacts) => Set<number>;
}

const blockValues = (
  f: ProfileFacts,
  ...picks: Array<(b: MetricsBlock) => number | undefined>
) => {
  const out = new Set<number>();
  for (const { block } of f.blocks) {
    for (const pick of picks) {
      const v = pick(block);
      if (v !== undefined) out.add(v);
    }
  }
  return out;
};

const runOf = (r: FormResult) => (b: MetricsBlock) =>
  b.run?.r === r ? b.run.n : undefined;

/** 단위별 수(머리 주석 ⑥) — 그 단위의 지표 값이어야 한다 */
const UNITS: readonly UnitRule[] = [
  { label: "위", re: /(\d+)\s*위/gu, allowed: (f) => f.pos },
  { label: "승점", re: /승점\s*(\d+)/gu, allowed: (f) => f.pts },
  {
    label: "연승",
    re: /(\d+)\s*(?:연승|경기\s*연속\s*승리)/gu,
    allowed: (f) => blockValues(f, runOf("W")),
  },
  {
    label: "연패",
    re: /(\d+)\s*(?:연패|경기\s*연속\s*패배)/gu,
    allowed: (f) => blockValues(f, runOf("L")),
  },
  {
    label: "연속 무승부",
    re: /(\d+)\s*(?:경기\s*)?연속\s*무승부/gu,
    allowed: (f) => blockValues(f, runOf("D")),
  },
  {
    label: "경기 무패",
    re: /(\d+)\s*경기\s*(?:연속\s*)?무패/gu,
    allowed: (f) =>
      blockValues(
        f,
        (b) => b.unb,
        (b) => (b.l === 0 ? b.p : undefined),
        (b) => (b.home?.l === 0 ? b.home.p : undefined),
        (b) => (b.away?.l === 0 ? b.away.p : undefined),
      ),
  },
  {
    label: "경기 무승",
    re: /(\d+)\s*경기\s*(?:연속\s*)?무승(?!부)/gu,
    allowed: (f) =>
      blockValues(
        f,
        (b) => b.wl,
        (b) => (b.w === 0 ? b.p : undefined),
        (b) => (b.home?.w === 0 ? b.home.p : undefined),
        (b) => (b.away?.w === 0 ? b.away.p : undefined),
      ),
  },
  {
    label: "무실점 경기",
    re: /무실점\s*(\d+)\s*경기|(\d+)\s*경기\s*무실점/gu,
    allowed: (f) => blockValues(f, (b) => b.cs),
  },
  {
    label: "무득점 경기",
    re: /무득점\s*(\d+)\s*경기|(\d+)\s*경기\s*무득점/gu,
    allowed: (f) => blockValues(f, (b) => b.fts),
  },
  { label: "승", re: /(\d+)\s*승(?!점)/gu, allowed: (f) => f.wins },
  { label: "무", re: /(\d+)\s*무(?![패승실득])/gu, allowed: (f) => f.draws },
  { label: "패", re: /(\d+)\s*패/gu, allowed: (f) => f.losses },
  { label: "실점", re: /(\d+)\s*실점/gu, allowed: (f) => f.conceded },
  { label: "골", re: /(\d+)\s*(?:골|득점)/gu, allowed: (f) => f.goals },
  { label: "경기", re: /(\d+)\s*경기/gu, allowed: (f) => f.games },
  { label: "팀", re: /(\d+)\s*팀/gu, allowed: (f) => f.teams },
  {
    label: "득실차",
    re: /득실차\s*[+＋-]?\s*(\d+)/gu,
    allowed: (f) => f.gd,
  },
];

/**
 * 강점/약점 쪽 대조 — '득점(실점) 순위 n위'·'득점(실점) n위'·'최소 실점 n위'는 그 순위가 강점이면 위 절반, 약점이면 위 3분의 1
 * 밖이어야 한다(2026-11-02 dev 실행: 18팀 중 실점 13·14위를 강점으로 쓴 사례. 지시문 6은 상위 팀의 '상대적으로 낮은 지표'를 약점으로
 * 허용하므로 약점 쪽은 느슨하게). 그 순위 값을 가진 블록이 하나라도 맞으면 통과.
 */
const RANK_PHRASE = /(득점|실점)\s*(?:순위\s*)?(\d+)\s*위/gu;

function rankSideIssues(
  text: string,
  side: "s" | "w",
  facts: ProfileFacts,
): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(RANK_PHRASE)) {
    const n = Number(m[2]);
    const ok = facts.blocks.some(({ block: b }) => {
      const rank = m[1] === "득점" ? b.gfR : b.gaR;
      if (rank !== n) return false;
      return side === "s" ? n <= Math.ceil(b.n / 2) : n > Math.round(b.n / 3);
    });
    if (!ok) out.push(`${m[1]} ${n}위`);
  }
  return out;
}

function checkText(
  text: string,
  field: string,
  kind: "one-liner" | "bullet",
  facts: ProfileFacts,
  ctx: ProfileCheckContext,
): ProfileCheckIssue[] {
  const issues: ProfileCheckIssue[] = [];
  const push = (code: ProfileCheckCode, detail?: string) =>
    issues.push(
      detail === undefined ? { code, field } : { code, field, detail },
    );
  if (HAN.test(text)) push("han");
  if (LATIN.test(text)) push("latin");
  // 한글 글자 수 하한 — 한줄평 5자, 강점/약점 2자('2연패'·'홈 무패'처럼 짧은 구는 허용)
  if ((text.match(HANGUL)?.length ?? 0) < (kind === "one-liner" ? 5 : 2))
    push("too-short");
  if (kind === "one-liner") {
    if (
      /[\r\n]/u.test(text) ||
      !/다\.$/u.test(text) ||
      /[.!?]/u.test(text.replace(/다\.$/u, ""))
    )
      push("sentence-form");
    if (text.length > TEAM_PROFILE_ONE_LINER_MAX)
      push("too-long", String(text.length));
  } else {
    if (/[\r\n.!?]/u.test(text) || /다$/u.test(text)) push("bullet-form");
    if (text.length > TEAM_PROFILE_BULLET_MAX)
      push("too-long", String(text.length));
  }
  // 입력 밖 이름 — 사전 표기가 한글 낱말 속(예: '프랑스' 속 '랑스')이 아니라 따로 나올 때
  for (const ko of ctx.names) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(ko, from);
      if (at < 0) break;
      const before = at > 0 ? text[at - 1]! : "";
      if (!/[가-힣]/u.test(before)) {
        push("name", ko);
        break;
      }
      from = at + 1;
    }
  }
  for (const word of PROFILE_TOPIC_WORDS) {
    if (text.includes(word)) push("topic", word);
  }
  // '16강'(UCL 16강 직행권 — zone knockout)은 대회 구간 이름이라 수 근거에서 뺀다(서술 대조가 zone을 본다)
  for (const m of text.replace(/16강/gu, "").matchAll(/\d+/gu)) {
    if (!facts.all.has(Number(m[0]))) push("number", m[0]);
  }
  for (const rule of UNITS) {
    const allowed = rule.allowed(facts);
    for (const m of text.matchAll(rule.re)) {
      const raw = m[1] ?? m[2];
      if (raw === undefined) continue;
      if (!allowed.has(Number(raw))) push("unit", `${raw}${rule.label}`);
    }
  }
  for (const claim of CLAIMS) {
    if (claim.re.test(text) && !claim.ok(facts)) push("claim", claim.label);
  }
  if (kind === "bullet") {
    const side = field.startsWith("s") ? "s" : "w";
    for (const d of rankSideIssues(text, side, facts)) push("side", d);
  }
  return issues;
}

export interface ProfileCheckResult {
  ok: boolean;
  issues: ProfileCheckIssue[];
}

/** 팀 1개 출력 검사(머리 주석 ⑥). 순수 함수 */
export function checkTeamProfile(
  item: ProfileItem,
  metrics: TeamMetrics,
  ctx: ProfileCheckContext,
): ProfileCheckResult {
  const facts = factsOf(metrics);
  const issues: ProfileCheckIssue[] = [
    ...checkText(item.o, "o", "one-liner", facts, ctx),
    ...item.s.flatMap((t, i) =>
      checkText(t, `s${i + 1}`, "bullet", facts, ctx),
    ),
    ...item.w.flatMap((t, i) =>
      checkText(t, `w${i + 1}`, "bullet", facts, ctx),
    ),
  ];
  const bullets = [...item.s, ...item.w];
  if (new Set(bullets).size !== bullets.length) {
    issues.push({ code: "duplicate", field: "s·w" });
  }
  return { ok: issues.length === 0, issues };
}

export function formatProfileIssues(
  issues: readonly ProfileCheckIssue[],
  limit = 4,
): string {
  return issues
    .slice(0, limit)
    .map((i) => `${i.code}@${i.field}${i.detail ? `(${i.detail})` : ""}`)
    .join(" · ");
}

// ─── 묶음 결과 판정 (단계·eval 공용) ───────────────────────────────────────

export type TeamOutcomeReason =
  | "ok"
  | "result-failed" // 배치 결과 오류·만료·잘림·결과 없음
  | "json"
  | "schema"
  | "missing" // 출력에 그 팀 기호가 없음
  | "item-invalid" // 그 팀 항목 형식 오류
  | "check"; // 코드 검증 실패

export interface TeamOutcome {
  slug: string;
  id: string;
  reason: TeamOutcomeReason;
  item: ProfileItem | null;
  detail?: string;
}

/**
 * 묶음 하나의 결과 텍스트(성공이면 text, 실패면 null + 사유) → 팀별 판정. 순수 함수.
 * 같은 묶음의 팀은 서로 독립 — 한 팀의 형식·검증 실패가 다른 팀을 버리지 않는다(머리 주석 ⑤⑥).
 */
export function judgeGroup(
  group: ProfileGroup,
  output: { text: string } | { failure: string },
  ctx: ProfileCheckContext,
): TeamOutcome[] {
  const base = (t: ProfileGroupTeam) => ({ slug: t.metrics.slug, id: t.id });
  if ("failure" in output) {
    return group.teams.map((t) => ({
      ...base(t),
      reason: "result-failed",
      item: null,
      detail: output.failure,
    }));
  }
  const parsed = parseTeamProfileOutput(output.text);
  if (!parsed.ok) {
    return group.teams.map((t) => ({
      ...base(t),
      reason: parsed.reason,
      item: null,
      detail: parsed.detail,
    }));
  }
  return group.teams.map((t): TeamOutcome => {
    const item = parsed.items.get(t.id);
    if (!item) {
      const bad = parsed.invalid.find((i) => i.id === t.id);
      return bad
        ? { ...base(t), reason: "item-invalid", item: null, detail: bad.detail }
        : { ...base(t), reason: "missing", item: null };
    }
    const checked = checkTeamProfile(item, t.metrics, ctx);
    if (!checked.ok) {
      return {
        ...base(t),
        reason: "check",
        item,
        detail: formatProfileIssues(checked.issues),
      };
    }
    return { ...base(t), reason: "ok", item };
  });
}

// ─── ⑦ 반영 ──────────────────────────────────────────────────────────────

export type TeamProfile = NonNullable<Team["profile"]>;

export function profileOf(item: ProfileItem, generatedAt: string): TeamProfile {
  return {
    oneLiner: item.o,
    strengths: [item.s[0]!, item.s[1]!],
    weaknesses: [item.w[0]!, item.w[1]!],
    generatedAt,
  };
}

export type ProfileAction = "new" | "kept" | "cleared" | "none";

/** 새 프로필 → 새 값 · 없으면 이전 값(KEEP_DAYS 안) · 더 오래됐으면 null(머리 주석 ⑦) */
export function decideProfile(input: {
  previous: Team["profile"];
  fresh: TeamProfile | null;
  now: Date;
  keepDays?: number;
}): { profile: Team["profile"]; action: ProfileAction } {
  if (input.fresh !== null) return { profile: input.fresh, action: "new" };
  if (input.previous === null) return { profile: null, action: "none" };
  const ageMs = input.now.getTime() - Date.parse(input.previous.generatedAt);
  const keepMs = (input.keepDays ?? TEAM_PROFILE_KEEP_DAYS) * 86_400_000;
  if (ageMs <= keepMs) return { profile: input.previous, action: "kept" };
  return { profile: null, action: "cleared" };
}
