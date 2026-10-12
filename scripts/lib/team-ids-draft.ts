/**
 * `configs/team-ids.json` 초안 만들기 (PRD §15 D33 ⑤, M1-44) — I/O 없는 순수 함수. 진입점은 scripts/build-team-ids.ts.
 *
 * 입력
 *   - `fixtures/football/index.json` `teamIdPairs` 52쌍(M0-35 — 두 API에서 같은 경기를 찾아 뽑은 팀 id 쌍, 확정 아님)
 *   - fixtures 원본 응답에서 다시 짝지은 결과(`suggestTeamIdPairs` — 종료 경기의 대회·킥오프·스코어 일치) → 근거 강도
 *   - 활성 한국 선수 소속팀(`configs/korean-players.json`) + M0-32에서 `/players/squads`로 확인한 API-Football 팀 id
 *   - 기존 팀 slug(`configs/names.ko.json` team 항목) — 있으면 그 slug를 그대로 쓴다
 * 출력: 대응표(slug 순) + 사람이 확인할 표의 행(근거·확인 필요 표시) + 문제 목록.
 *
 * slug 규칙(M0-32 "팀 slug 제안 규칙" — 최종은 M2-04): football-data 정식 이름(`team.name`) 기준
 *   ① 악센트를 없앤다(ü→u, é→e, ø→o, ß→ss) ② 법인·형태 토큰(FC·AFC·CF·SC·SV·FSV·1.·Club)을 앞뒤에서 뗀다
 *   ③ 나머지를 소문자 kebab으로. 숫자(05·04)는 구단 정체성이라 남긴다. 규칙이 어색한 결과를 내는 행은 표시만 하고 고치지 않는다
 *   (규칙 확정은 M2-04 — 팀 페이지 URL이 생기기 전에 바꿀 수 있다).
 */
import { z } from "zod";

import type {
  CompId,
  CompetitionConfig,
  KoreanPlayersFile,
  TeamIdsFile,
} from "@/lib/schema";
import { parseFeedDate } from "@/lib/time";

import { toFinishedResults } from "./providers/football-data";
import type { PairingMatch, PairingReport } from "./team-ids";

// ─── slug 규칙 ───────────────────────────────────────────────────────────

/** M0-32 규칙의 법인·형태 토큰(앞뒤에서만 뗀다) */
export const SLUG_STRIP_TOKENS: readonly string[] = [
  "fc",
  "afc",
  "cf",
  "sc",
  "sv",
  "fsv",
  "1.",
  "club",
];

/** 규칙 밖이지만 법인·형태로 보이는 토큰 — slug에 남으면 "규칙 검토" 표시(M2-04 판단 자료) */
const FORM_LIKE_TOKENS: ReadonlySet<string> = new Set([
  "ac",
  "acf",
  "as",
  "bv",
  "calcio",
  "cfc",
  "osc",
  "rc",
  "sco",
  "ssc",
  "tsg",
  "us",
  "vfb",
  "vfl",
]);

const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ø: "o",
  Ø: "O",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  đ: "d",
  Đ: "D",
  ł: "l",
  Ł: "L",
};

/** 악센트 제거(NFKD + 결합 문자 제거, 분해되지 않는 글자는 표로) */
export function stripAccents(text: string): string {
  return text
    .replace(/[øØßæÆœŒđĐłŁ]/g, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

export interface SlugRuleResult {
  slug: string;
  /** 앞뒤에서 뗀 토큰(원문 표기) */
  stripped: string[];
}

/** football-data 정식 이름 → slug(M0-32 규칙) */
export function teamSlugFromName(fullName: string): SlugRuleResult {
  const tokens = stripAccents(fullName).trim().split(/\s+/).filter(Boolean);
  const stripped: string[] = [];
  const isStrip = (token: string | undefined) =>
    token !== undefined && SLUG_STRIP_TOKENS.includes(token.toLowerCase());
  while (tokens.length > 1 && isStrip(tokens[0])) {
    stripped.push(tokens.shift()!);
  }
  while (tokens.length > 1 && isStrip(tokens.at(-1))) {
    stripped.push(tokens.pop()!);
  }
  const slug = tokens
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { slug, stripped };
}

/** 이름 비교용 의미 토큰(악센트·형태 토큰·두 글자 이하 제거, 소문자) */
export function significantTokens(name: string): Set<string> {
  const generic = new Set([...SLUG_STRIP_TOKENS, ...FORM_LIKE_TOKENS, "de"]);
  return new Set(
    stripAccents(name)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !generic.has(t) && !/^\d+$/.test(t)),
  );
}

/** 두 API 이름이 같은 팀으로 보이는가 — 의미 토큰이 하나라도 겹치면 true */
export function namesLookSame(
  fdNames: readonly (string | null)[],
  afName: string,
): boolean {
  const af = significantTokens(afName);
  return fdNames.some(
    (name) =>
      name !== null && [...significantTokens(name)].some((t) => af.has(t)),
  );
}

// ─── fixtures 전용 최소 파서 ─────────────────────────────────────────────

/**
 * API-Football `/fixtures` 응답 항목 → 짝짓기 입력(**fixtures 전용** — M1-48 어댑터가 생기면 그 내부 형식으로 바꾼다).
 * 종료(FT·AET·PEN)일 때만 `goals`(승부차기 제외)를 ft로 쓰고, 대상 대회가 아니면 null.
 */
export function afFixtureToPairing(
  item: unknown,
  compByLeague: ReadonlyMap<number, CompId>,
): PairingMatch | null {
  if (typeof item !== "object" || item === null) return null;
  const r = item as {
    fixture?: { id?: unknown; date?: unknown; status?: { short?: unknown } };
    league?: { id?: unknown };
    teams?: {
      home?: { id?: unknown; name?: unknown };
      away?: { id?: unknown; name?: unknown };
    };
    goals?: { home?: unknown; away?: unknown };
  };
  const id = r.fixture?.id;
  const league = r.league?.id;
  const kickoff =
    typeof r.fixture?.date === "string" ? parseFeedDate(r.fixture.date) : null;
  const home = r.teams?.home;
  const away = r.teams?.away;
  if (
    typeof id !== "number" ||
    typeof league !== "number" ||
    kickoff === null ||
    typeof home?.id !== "number" ||
    typeof home.name !== "string" ||
    typeof away?.id !== "number" ||
    typeof away.name !== "string"
  ) {
    return null;
  }
  const comp = compByLeague.get(league);
  if (!comp) return null;
  const status = r.fixture?.status?.short;
  const gh = r.goals?.home;
  const ga = r.goals?.away;
  const finished =
    (status === "FT" || status === "AET" || status === "PEN") &&
    typeof gh === "number" &&
    typeof ga === "number";
  return {
    matchId: id,
    comp,
    kickoff,
    home: { id: home.id, name: home.name },
    away: { id: away.id, name: away.name },
    ft: finished ? { home: gh, away: ga } : null,
  };
}

// ─── fixtures 읽기 (파싱된 JSON → 짝짓기 입력·팀 정보) ─────────────────────

/**
 * 한국 선수 소속팀의 API-Football 팀 id — M0-32 `/players/squads?team=` 응답의 team.id(docs/research/m0-validation.md
 * "M0-32 … API-Football 보조 확인") + M0-29(Bayern München 157 · Union Berlin 182). 키는 korean-players.json `team`.
 */
export const M0_32_SQUAD_TEAM_IDS: Readonly<Record<string, number>> = {
  brentford: 55,
  "atletico-de-madrid": 530,
  "bayern-munchen": 157,
  "union-berlin": 182,
  "mainz-05": 164,
  "borussia-monchengladbach": 163,
  augsburg: 170,
  "schalke-04": 174,
};

/** 활성 한국 선수 → 소속팀별 묶음(설정 순서) + M0-32 af id */
export function koreanTeamsFrom(
  players: KoreanPlayersFile,
  afIds: Readonly<Record<string, number>> = M0_32_SQUAD_TEAM_IDS,
): KoreanTeamInput[] {
  const teams: KoreanTeamInput[] = [];
  for (const player of players) {
    if (!player.active) continue;
    const team = teams.find((t) => t.slug === player.team);
    if (team) {
      team.players.push(player.slug);
      continue;
    }
    teams.push({
      slug: player.team,
      afTeamId: Object.hasOwn(afIds, player.team)
        ? (afIds[player.team] ?? null)
        : null,
      players: [player.slug],
    });
  }
  return teams;
}

const FdTeamFieldsSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string().nullable(),
  shortName: z.string().nullable().optional(),
});

const FdDocSchema = z.object({
  competition: z.object({ code: z.string() }).optional(),
  matches: z.array(z.unknown()).optional(),
  standings: z
    .array(z.object({ table: z.array(z.object({ team: z.unknown() })) }))
    .optional(),
  homeTeam: z.unknown().optional(),
});

const FdMatchRefSchema = z.object({
  id: z.number().int(),
  competition: z.object({ code: z.string() }).optional(),
  homeTeam: z.unknown(),
  awayTeam: z.unknown(),
});

export interface FdFixtureData {
  /** fd 팀 id → 정식·짧은 이름·나온 대회 */
  teams: Map<number, FdTeamInfo>;
  /** 종료 경기(같은 경기 id는 처음 것) — 짝짓기 입력 */
  finished: PairingMatch[];
}

/** football-data 응답 문서들(경기 목록·경기 상세·순위·득점 순위) → 팀 정보 + 종료 경기 */
export function readFdFixtures(
  docs: readonly unknown[],
  competitions: readonly CompetitionConfig[],
): FdFixtureData {
  const compByCode = new Map<string, CompId>(
    competitions.map((c) => [c.footballDataCode, c.id]),
  );
  const teams = new Map<
    number,
    { name: string | null; shortName: string | null; comps: Set<CompId> }
  >();
  const noteTeam = (raw: unknown, comp: CompId | undefined) => {
    const t = FdTeamFieldsSchema.safeParse(raw);
    if (!t.success || t.data.id === null) return;
    const info = teams.get(t.data.id) ?? {
      name: t.data.name,
      shortName: t.data.shortName ?? null,
      comps: new Set<CompId>(),
    };
    if (comp) info.comps.add(comp);
    teams.set(t.data.id, info);
  };
  const rawById = new Map<number, unknown>();
  for (const doc of docs) {
    const d = FdDocSchema.safeParse(doc);
    if (!d.success) continue;
    const fileComp = compByCode.get(d.data.competition?.code ?? "");
    const matches =
      d.data.matches ?? (d.data.homeTeam !== undefined ? [doc] : []);
    for (const m of matches) {
      const ref = FdMatchRefSchema.safeParse(m);
      if (!ref.success) continue;
      const comp = compByCode.get(ref.data.competition?.code ?? "") ?? fileComp;
      noteTeam(ref.data.homeTeam, comp);
      noteTeam(ref.data.awayTeam, comp);
      if (!rawById.has(ref.data.id)) rawById.set(ref.data.id, m);
    }
    for (const s of d.data.standings ?? []) {
      for (const row of s.table) noteTeam(row.team, fileComp);
    }
  }
  const { results } = toFinishedResults([...rawById.values()], competitions, {
    start: "2000-01-01T00:00:00.000Z",
    end: "2100-01-01T00:00:00.000Z",
  });
  return {
    teams,
    finished: results.map((r) => ({
      matchId: r.matchId,
      comp: r.comp,
      kickoff: r.kickoff,
      home: { id: r.home.id, name: r.home.name },
      away: { id: r.away.id, name: r.away.name },
      ft: r.score.ft,
    })),
  };
}

/** API-Football `/fixtures` 응답 문서들 → 대상 대회 경기(같은 경기 id는 처음 것, 미종료는 ft null) */
export function readAfFixtures(
  docs: readonly unknown[],
  competitions: readonly CompetitionConfig[],
): PairingMatch[] {
  const compByLeague = new Map<number, CompId>(
    competitions.map((c) => [c.apiFootballLeagueId, c.id]),
  );
  const byId = new Map<number, PairingMatch>();
  for (const doc of docs) {
    const response =
      typeof doc === "object" && doc !== null && "response" in doc
        ? (doc as { response: unknown }).response
        : null;
    if (!Array.isArray(response)) continue;
    for (const item of response) {
      const m = afFixtureToPairing(item, compByLeague);
      if (m && !byId.has(m.matchId)) byId.set(m.matchId, m);
    }
  }
  return [...byId.values()];
}

/** `fixtures/football/index.json`에서 쓰는 부분(M0-35 — 확정 대응표 아님) */
export const FixtureIndexSchema = z.object({
  matchIdPairs: z.object({
    pairs: z.array(
      z.object({
        fd: z.number().int(),
        af: z.number().int(),
        fdStatus: z.string(),
        afStatus: z.string(),
      }),
    ),
  }),
  teamIdPairs: z.object({
    pairs: z.array(
      z.object({
        fd: z.number().int().positive(),
        af: z.number().int().positive(),
        fdName: z.string(),
        afName: z.string(),
        evidence: z.string().regex(/^\d+↔\d+$/),
      }),
    ),
  }),
});

// ─── 초안 ────────────────────────────────────────────────────────────────

export interface IndexTeamPair {
  fd: number;
  af: number;
  fdName: string;
  afName: string;
  /** "fd경기id↔af경기id" */
  evidence: string;
}

export interface FdTeamInfo {
  /** 정식 이름(football-data name) */
  name: string | null;
  shortName: string | null;
  /** 이 팀이 나온 대회(설정 순서로 정렬해 쓴다) */
  comps: ReadonlySet<CompId>;
}

export interface KoreanTeamInput {
  /** korean-players.json `team` */
  slug: string;
  /** M0-32 `/players/squads`로 확인한 API-Football 팀 id — 모르면 null */
  afTeamId: number | null;
  /** 이 팀의 활성 선수 slug */
  players: string[];
}

export interface DraftInputs {
  indexPairs: readonly IndexTeamPair[];
  fdTeams: ReadonlyMap<number, FdTeamInfo>;
  /** fd 경기 id → 상태(FINISHED·CANCELLED·TIMED …) */
  fdMatchStatus: ReadonlyMap<number, string>;
  /** af 경기 id → 상태(FT·INT·NS …) */
  afMatchStatus: ReadonlyMap<number, string>;
  /** fixtures 원본을 빈 대응표로 짝지은 결과 */
  pairing: PairingReport;
  koreanTeams: readonly KoreanTeamInput[];
  /** names.ko.json team 항목 */
  nameSlugs: ReadonlyArray<{ slug: string; en: readonly string[] }>;
  /** 대회 표시 순서(competitions.json 순서) */
  compOrder: readonly CompId[];
  /** 초안 날짜(YYYY-MM-DD) — note에 남긴다 */
  draftDate: string;
}

export type DraftStrength = "strong" | "weak";

export interface DraftRow {
  slug: string;
  slugSource: "names.ko" | "rule";
  fd: number;
  fdName: string;
  fdShort: string | null;
  af: number;
  afName: string;
  /** 대표 대회(리그 우선) */
  comp: CompId | null;
  strength: DraftStrength;
  /** 근거 설명(한국어 한 줄) */
  basis: string;
  /** 확인 필요 표시(없으면 빈 배열) */
  flags: string[];
  /** 이 팀의 활성 한국 선수 slug */
  korean: string[];
}

export interface TeamIdsDraft {
  file: TeamIdsFile;
  rows: DraftRow[];
  problems: string[];
}

function normalizeName(name: string): string {
  return stripAccents(name).trim().toLowerCase();
}

function pickComp(
  comps: ReadonlySet<CompId> | undefined,
  order: readonly CompId[],
): CompId | null {
  if (!comps || comps.size === 0) return null;
  const sorted = order.filter((c) => comps.has(c));
  return sorted.find((c) => c !== "UCL") ?? sorted[0] ?? null;
}

/** 대응표 초안 + 확인용 행 */
export function buildTeamIdsDraft(inputs: DraftInputs): TeamIdsDraft {
  const problems: string[] = [];

  // 짝짓기 도우미가 fixtures에서 다시 찾은 팀 쌍(빈 대응표 → 모두 new 후보)
  const derived = new Map<string, string[]>();
  for (const c of inputs.pairing.candidates) {
    derived.set(
      `${c.fd.id}:${c.af.id}`,
      c.evidence.map((e) => `${e.fdMatchId}↔${e.afMatchId}`),
    );
  }
  for (const c of inputs.pairing.conflicts) {
    problems.push(
      `짝짓기 충돌: fd ${c.fd.name}(${c.fd.id}) ↔ af ${c.af.name}(${c.af.id}) — ${c.detail}`,
    );
  }
  const indexKeys = new Set(inputs.indexPairs.map((p) => `${p.fd}:${p.af}`));
  for (const [key, evidence] of derived) {
    if (!indexKeys.has(key)) {
      problems.push(
        `짝짓기 도우미가 찾았지만 index.json teamIdPairs에 없는 쌍 ${key} (${evidence.join(", ")}) — 초안에 넣지 않음`,
      );
    }
  }

  const slugByName = new Map<string, string>();
  for (const entry of inputs.nameSlugs) {
    for (const en of entry.en) slugByName.set(normalizeName(en), entry.slug);
  }
  const koreanByAf = new Map<number, KoreanTeamInput>();
  for (const team of inputs.koreanTeams) {
    if (team.afTeamId !== null) koreanByAf.set(team.afTeamId, team);
  }

  const rows: DraftRow[] = [];
  const seenFd = new Set<number>();
  for (const pair of inputs.indexPairs) {
    if (seenFd.has(pair.fd)) {
      problems.push(
        `index.json teamIdPairs에 fd ${pair.fd}가 두 번 나옴 — 두 번째는 뺌`,
      );
      continue;
    }
    seenFd.add(pair.fd);
    const info = inputs.fdTeams.get(pair.fd);
    const fdName = info?.name ?? pair.fdName;
    const fdShort = info?.shortName ?? null;
    const korean = koreanByAf.get(pair.af);
    const flags: string[] = [];

    // slug — names.ko(이미 쓰는 slug) → 한국 선수 소속팀 → 규칙
    const known =
      [fdName, fdShort, pair.afName]
        .filter((n): n is string => n !== null)
        .map((n) => slugByName.get(normalizeName(n)))
        .find((s) => s !== undefined) ?? korean?.slug;
    let slug: string;
    let slugSource: DraftRow["slugSource"];
    if (known !== undefined) {
      slug = known;
      slugSource = "names.ko";
      if (korean && korean.slug !== known) {
        problems.push(
          `slug 불일치: names.ko "${known}" ↔ korean-players team "${korean.slug}" (af ${pair.af})`,
        );
      }
    } else {
      const rule = teamSlugFromName(fdName);
      slug = rule.slug;
      slugSource = "rule";
      if (/^\d/.test(slug)) {
        flags.push(
          `slug가 숫자로 시작 — 규칙이 "${rule.stripped.join(" ")}"를 떼어 냄`,
        );
      }
      const shortTokens = new Set(
        (fdShort ?? "").toLowerCase().split(/\s+/).filter(Boolean),
      );
      const identity = rule.stripped.filter((t) =>
        shortTokens.has(t.toLowerCase()),
      );
      if (identity.length > 0) {
        flags.push(
          `규칙이 뗀 "${identity.join(" ")}"가 football-data 짧은 이름 "${fdShort}"에 남아 있음 — 이름의 일부일 수 있음`,
        );
      }
      const leftover = slug.split("-").filter((t) => FORM_LIKE_TOKENS.has(t));
      if (leftover.length > 0) {
        flags.push(
          `규칙 밖 법인·형태 토큰이 남음(${leftover.join("·")}) — M2-04 규칙 확정 때 검토`,
        );
      }
    }

    // 근거
    const derivedEvidence = derived.get(`${pair.fd}:${pair.af}`);
    let strength: DraftStrength;
    let basis: string;
    if (derivedEvidence) {
      strength = "strong";
      basis = `종료 경기 ${derivedEvidence.length}건 대회·킥오프·스코어 일치(${derivedEvidence.join(", ")})`;
    } else {
      const [fdMatch, afMatch] = pair.evidence.split("↔").map(Number);
      const fdStatus = inputs.fdMatchStatus.get(fdMatch ?? NaN) ?? "?";
      const afStatus = inputs.afMatchStatus.get(afMatch ?? NaN) ?? "?";
      strength = "weak";
      basis = `경기 ${pair.evidence}(${fdStatus}/${afStatus}) 대회·킥오프·팀 이름 일치만 — 스코어 대조 없음`;
    }
    if (korean) {
      basis += ` · M0-32 /players/squads 팀 id ${pair.af} 확인(${korean.players.join("·")})`;
      if (strength === "weak") strength = "strong";
    }
    if (strength === "weak") {
      flags.unshift("근거 약함 — 미종료·취소 경기라 스코어로 확인하지 못함");
    }
    if (!namesLookSame([fdName, fdShort], pair.afName)) {
      flags.unshift(`이름이 겹치지 않음(fd "${fdName}" · af "${pair.afName}")`);
    }

    rows.push({
      slug,
      slugSource,
      fd: pair.fd,
      fdName,
      fdShort,
      af: pair.af,
      afName: pair.afName,
      comp: pickComp(info?.comps, inputs.compOrder),
      strength,
      basis,
      flags,
      korean: korean?.players ?? [],
    });
  }

  // slug 중복
  const bySlug = new Map<string, DraftRow[]>();
  for (const row of rows) {
    bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row]);
  }
  for (const [slug, same] of bySlug) {
    if (same.length > 1) {
      problems.push(
        `slug "${slug}" 중복: fd ${same.map((r) => r.fd).join(", ")} — 사람이 정해야 함`,
      );
    }
  }

  // 한국 선수 소속팀 확인
  for (const team of inputs.koreanTeams) {
    const row = rows.find((r) => r.slug === team.slug);
    if (!row) {
      problems.push(
        `활성 한국 선수 소속팀 "${team.slug}"(${team.players.join("·")})가 초안에 없음 — af ${team.afTeamId ?? "미확인"}`,
      );
    } else if (team.afTeamId !== null && row.af !== team.afTeamId) {
      problems.push(
        `"${team.slug}" af 불일치: 초안 ${row.af} ↔ M0-32 ${team.afTeamId}`,
      );
    }
  }

  const compRank = (c: CompId | null) =>
    c === null ? inputs.compOrder.length : inputs.compOrder.indexOf(c);
  rows.sort(
    (a, b) =>
      compRank(a.comp) - compRank(b.comp) ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );

  const file: TeamIdsFile = {};
  for (const row of [...rows].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  )) {
    if (Object.hasOwn(file, row.slug)) continue; // 중복은 problems에 있다
    const check = row.flags.length > 0 ? "확인 필요 · " : "";
    file[row.slug] = {
      fd: row.fd,
      af: row.af,
      note: `${check}${row.strength === "strong" ? "근거 강함" : "근거 약함"} — ${row.basis} · fd "${row.fdName}" · af "${row.afName}" (M0 fixtures, 초안 ${inputs.draftDate})`,
    };
  }
  return { file, rows, problems };
}

// ─── 확인용 표(Markdown) ─────────────────────────────────────────────────

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** 사람이 확인할 표 — 보고서에 그대로 붙일 수 있는 Markdown */
export function formatDraftReview(draft: TeamIdsDraft): string {
  const weak = draft.rows.filter((r) => r.strength === "weak").length;
  const flagged = draft.rows.filter((r) => r.flags.length > 0).length;
  const lines = [
    `# configs/team-ids.json 초안 확인표 (M1-44, PRD §15 D33)`,
    "",
    `- 행 ${draft.rows.length}개 · 근거 약함 ${weak}개 · 확인 필요 표시 ${flagged}개 · 한국 선수 소속팀 ${draft.rows.filter((r) => r.korean.length > 0).length}개`,
    `- 근거 "강함" = fixtures 원본에서 짝짓기 도우미가 종료 경기의 대회·킥오프(±5분)·스코어 일치로 다시 찾은 쌍(또는 M0-32 squads로 af 확인).`,
    `- slug: names.ko = configs/names.ko.json에 이미 있는 slug, rule = M0-32 규칙(football-data 정식 이름 → 악센트 제거 → FC·AFC·CF·SC·SV·FSV·1.·Club 앞뒤 제거 → kebab).`,
    "",
    "| # | slug | slug 출처 | 대회 | fd id | fd 이름(정식 / 짧은) | af id | af 이름 | 근거 | 한국 선수 | 확인 필요 |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  draft.rows.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | \`${r.slug}\` | ${r.slugSource} | ${r.comp ?? "?"} | ${r.fd} | ${cell(r.fdName)} / ${cell(r.fdShort ?? "-")} | ${r.af} | ${cell(r.afName)} | ${r.strength === "strong" ? "강함" : "**약함**"} — ${cell(r.basis)} | ${r.korean.join(", ") || "-"} | ${r.flags.length > 0 ? cell(r.flags.join(" / ")) : "-"} |`,
    );
  });
  lines.push("", "## 문제", "");
  if (draft.problems.length === 0) lines.push("- 없음");
  else for (const p of draft.problems) lines.push(`- ${p}`);
  return `${lines.join("\n")}\n`;
}
