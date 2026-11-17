/**
 * 경기 상세 프로바이더 체계 (PRD §15 D80 — 2026-11-17 사용자 결정, plan M5-18).
 *
 * 경기별 득점자·라인업·한국 선수 출전 시간은 "경기 상세 프로바이더"가 준다. 2026-10-19 ~ 11-03은 API-Football(계정 정지 2026-11-04~),
 * 그 뒤로는 Highlightly다. 두 프로바이더는 경기·대회·팀·선수 id 체계가 달라(같은 숫자가 다른 팀일 수 있다) 원장(data/matches)에서
 * **경기 키 접두사**로 체계를 구별한다 — `af-<id>`(API-Football) · `hl-<id>`(Highlightly). 원장 항목의 leagueId·팀 id·선수 id·한국
 * 선수 행의 player는 모두 그 항목 접두사의 체계다(마이그레이션 없음 — 두 체계가 공존, D80 ②).
 *
 * 설정의 id 대응: 대회 `competitions.json` apiFootballLeagueId · highlightlyLeagueId, 팀 `team-ids.json` af · hl, 선수
 * `korean-players.json` apiFootballId · highlightlyId. 이 파일은 그 대응을 한 곳에서 고른다(순수 함수 — I/O 없음).
 *
 * 수집 경로는 환경변수 `MATCH_DETAIL_PROVIDER`(기본 highlightly, `api-football`로 되돌릴 수 있다)로 고른다. API-Football 코드는
 * 지우지 않는다(D80 ⑤ — 계정이 복구되면 다시 정한다).
 */
import type {
  CompetitionConfig,
  KoreanPlayer,
  TeamIdEntry,
  TeamIdsFile,
} from "@/lib/schema";

export type DetailProvider = "api-football" | "highlightly";

export const DETAIL_PROVIDERS: readonly DetailProvider[] = [
  "api-football",
  "highlightly",
];

/** 수집 경로 기본값(D80 ①) */
export const DEFAULT_DETAIL_PROVIDER: DetailProvider = "highlightly";

/** 원장 경기 키 접두사 */
export const LEDGER_KEY_PREFIX: Readonly<Record<DetailProvider, "af" | "hl">> =
  Object.freeze({ "api-football": "af", highlightly: "hl" });

/** `MATCH_DETAIL_PROVIDER` → 프로바이더(빈 값·미지정은 기본값). 형식이 틀리면 던진다 */
export function resolveDetailProvider(raw: string | undefined): DetailProvider {
  const value = raw?.trim().toLowerCase();
  if (!value) return DEFAULT_DETAIL_PROVIDER;
  if ((DETAIL_PROVIDERS as readonly string[]).includes(value)) {
    return value as DetailProvider;
  }
  throw new Error(
    `MATCH_DETAIL_PROVIDER는 ${DETAIL_PROVIDERS.join(" · ")} 중 하나여야 한다 (받은 값: "${raw}")`,
  );
}

/** 원장 경기 키 — `af-<id>` · `hl-<id>` */
export function ledgerMatchKey(provider: DetailProvider, id: number): string {
  return `${LEDGER_KEY_PREFIX[provider]}-${id}`;
}

/** 원장 경기 키 → 프로바이더·id(형식이 아니면 null) */
export function parseLedgerMatchKey(
  key: string,
): { provider: DetailProvider; id: number } | null {
  const m = /^(af|hl)-([1-9]\d*)$/.exec(key);
  if (!m) return null;
  return {
    provider: m[1] === "af" ? "api-football" : "highlightly",
    id: Number(m[2]),
  };
}

/** 원장 경기 키의 프로바이더(형식이 아니면 null) */
export function ledgerKeyProvider(key: string): DetailProvider | null {
  return parseLedgerMatchKey(key)?.provider ?? null;
}

/** 그 프로바이더 체계의 경기 id(키가 다른 프로바이더거나 형식이 아니면 null) */
export function ledgerIdFor(
  key: string,
  provider: DetailProvider,
): number | null {
  const parsed = parseLedgerMatchKey(key);
  return parsed !== null && parsed.provider === provider ? parsed.id : null;
}

/** 한국 선수의 그 프로바이더 선수 id(없으면 null) */
export function playerIdFor(
  player: Pick<KoreanPlayer, "apiFootballId" | "highlightlyId">,
  provider: DetailProvider,
): number | null {
  return provider === "api-football"
    ? player.apiFootballId
    : (player.highlightlyId ?? null);
}

/** 팀 대응표 항목의 그 프로바이더 팀 id(없으면 null) */
export function teamIdFor(
  entry: Pick<TeamIdEntry, "af" | "hl"> | undefined,
  provider: DetailProvider,
): number | null {
  if (entry === undefined) return null;
  return provider === "api-football" ? entry.af : (entry.hl ?? null);
}

/** 대응표에서 slug의 그 프로바이더 팀 id(없으면 null) */
export function teamIdOfSlug(
  teamIds: TeamIdsFile,
  slug: string,
  provider: DetailProvider,
): number | null {
  return Object.hasOwn(teamIds, slug)
    ? teamIdFor(teamIds[slug], provider)
    : null;
}

/** 대회 설정의 그 프로바이더 league id(없으면 null) */
export function leagueIdFor(
  comp: Pick<CompetitionConfig, "apiFootballLeagueId" | "highlightlyLeagueId">,
  provider: DetailProvider,
): number | null {
  return provider === "api-football"
    ? comp.apiFootballLeagueId
    : (comp.highlightlyLeagueId ?? null);
}

/** 그 프로바이더 팀 id → slug(대응표 — 스키마가 id 중복을 막으므로 한 id는 한 slug) */
export function teamToSlugOf(
  teamIds: TeamIdsFile,
  provider: DetailProvider,
): Map<number, string> {
  const index = new Map<number, string>();
  for (const [slug, entry] of Object.entries(teamIds)) {
    const id = teamIdFor(entry, provider);
    if (id !== null) index.set(id, slug);
  }
  return index;
}

/** 그 프로바이더 선수 id → 한국 선수 slug(id가 있는 선수 전원, 같은 id는 처음 것) */
export function koreanByIdOf(
  players: readonly Pick<
    KoreanPlayer,
    "slug" | "apiFootballId" | "highlightlyId"
  >[],
  provider: DetailProvider,
): Map<number, string> {
  const index = new Map<number, string>();
  for (const p of players) {
    const id = playerIdFor(p, provider);
    if (id !== null && !index.has(id)) index.set(id, p.slug);
  }
  return index;
}

/**
 * 원장 항목의 팀 id → slug(항목 키의 체계로 고른다). `hlToSlug`가 없으면(옛 호출부·테스트) `hl-` 항목은 모른다(undefined).
 * 키 형식이 아니면 API-Football로 본다(옛 동작과 같다).
 */
export function slugOfLedgerTeam(
  maps: {
    afToSlug: ReadonlyMap<number, string>;
    hlToSlug?: ReadonlyMap<number, string>;
  },
  matchKey: string,
  teamId: number,
): string | undefined {
  return ledgerKeyProvider(matchKey) === "highlightly"
    ? maps.hlToSlug?.get(teamId)
    : maps.afToSlug.get(teamId);
}
