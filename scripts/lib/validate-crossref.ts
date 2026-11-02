/**
 * `npm run validate` — configs 파일 사이 교차 참조 검사 (M0-17). I/O 없는 순수 함수만 둔다.
 *
 * 검사는 **관련 파일이 모두 있고 각자 스키마를 통과했을 때만** 실행한다. 한쪽이 없거나 스키마 오류면
 * 건너뛴다(스키마 오류는 그 파일에서 이미 보고되고, 파일은 기능 단계에서 하나씩 생긴다).
 *
 *   1. search-queries.json `queries[].source` → sources.json에 같은 id이면서 type "search"인 소스
 *   2. search-queries.json `queries[].player` → korean-players.json slug (`/add-player`가 함께 추가)
 *   3. national-team.json `squads[].playerSlugs[]` → korean-players.json slug (FR-73 선수 링크)
 *   4. publisher-domains.json `domains[].sourceIds[]` → sources.json id(판정이 소스의 terms_checked와 맞는지 포함),
 *      그리고 수집 대상 소스(`enabled && terms_checked`)의 피드 호스트가 "deny" 도메인에 속하지 않는지 (M0-26)
 *   5. korean-players.json 활성 선수의 `team` → team-ids.json에 있고 `af`(API-Football 팀 id)가 있어야 한다 (D33·D27).
 *      **오류로 둔다**: af가 없으면 M1-48이 그 팀의 다른 대회 경기(컵·UCL 등)를 날짜 응답에서 고르지 못해 그 선수의 경기 기록이
 *      조용히 빠지고, 지난 날짜는 다시 받을 수 없다(백필 불가 — D27). 이 오류는 사람이 configs를 고친 push의 CI에서만 나므로
 *      아침 무인 발행을 막지 않는다(`/add-player`가 team-ids 항목도 함께 확인한다).
 *   6. team-colors.json 키 → team-ids.json 팀(없는 팀은 오류) · team-ids 팀이 team-colors에 없으면 경고(화면은 폴백 배지 —
 *      DESIGN §9.3 D1) · 상의 색 위 약어 글자 대비 ≥ 5.3(PRD §15 D62 ④ — 보정은 scripts/build-team-colors.ts, M2-05)
 *
 *   7. data/teams/*.json(파생 — scripts/build-teams.ts, M2-06·M2-07) ↔ configs — 팀 파일이 하나라도 있을 때만(`--configs-only`는 건너뜀):
 *      팀 slug ⊂ team-ids · team-ids 팀마다 파일 · `colors`·`short` = team-colors(복사본) · `koreanPlayers`·팀시트 `korean` slug ⊂
 *      korean-players(소속 팀 일치) · 팀시트 상대 ⊂ team-ids는 오류. 활성 한국 선수가 소속 팀 파일 `koreanPlayers`에 없으면 경고
 *   8. data/players/korean.json ↔ korean-players·data/teams·team-ids·data/matches/meta.json (M3-03) — 레코드 slug ⊂ korean-players,
 *      활성 선수의 team·출전 로그·다음 경기 상대 slug ⊂ data/teams(팀 페이지 링크)는 오류. 설정 선수의 레코드가 없음·집계 시작일이
 *      원장 메타와 다름은 경고(설정을 바꾼 커밋 뒤 다음 수집이 다시 만든다 — 발행을 막지 않는다)
 *      (설정만 바꾸고 팀 파일을 다시 만들지 않은 경우 — 다음 생성에서 들어간다)
 *   9. data/transfers.json ↔ data/news·takedowns (M4-01) — 근거(history)가 빈 레코드는 오류(근거 없는 단계 주장 — CLAUDE §1-7).
 *      나머지는 경고(파이프라인 산출물 — 2026-10-10 Q7 결정처럼 발행을 막지 않는다): id ≠ 선수:행선지 · status ≠ history 적용 결과 ·
 *      updated ≠ 가장 늦은 근거 시각 · history 시각 순 아님 · 근거 카드가 data/news에 없음 · 근거 카드가 삭제 요청에 있음(등록 push는
 *      다음 수집 전에 돌아야 한다 — 발행 게이트 ⑥과 같은 이유) · 근거 카드의 transfer가 이 레코드(선수:행선지)와 다름.
 *      어긋나면 `npm run build:transfers`로 다시 만든다(다음 수집도 다시 만든다)
 *
 * formations.json·team-colors.json의 키 형식(slug)은 스키마(`z.record(SlugSchema, …)`)가 이미 검사한다.
 */
import {
  findPublisherDomain,
  type NewsFile,
  type TakedownsFile,
  type TransfersFile,
  type KoreanPlayersFile,
  type NationalTeamFile,
  type PublisherDomainsFile,
  type SearchQueriesFile,
  type SourcesFile,
  type KoreanPlayersDataFile,
  type MatchLedgerMeta,
  type Team,
  type TeamColorsFile,
  type TeamIdsFile,
} from "@/lib/schema";

import { KIT_MIN_CONTRAST, kitShirtContrast } from "@/lib/kit-contrast";
import { isDailyNewsPath } from "./publish-gate";
import { transferIdOf, transferRecordProblems } from "./transfers";
import { formatIssuePath, type ValidationIssue } from "./validate-schema";

/** 교차 참조에 쓰는 configs 경로 (레지스트리 패턴과 같은 값) */
export const CROSSREF_FILES = {
  sources: "configs/sources.json",
  searchQueries: "configs/search-queries.json",
  koreanPlayers: "configs/korean-players.json",
  nationalTeam: "configs/national-team.json",
  publisherDomains: "configs/publisher-domains.json",
  teamIds: "configs/team-ids.json",
  teamColors: "configs/team-colors.json",
} as const;

type CrossRefKey = keyof typeof CROSSREF_FILES;

/** 팀 파일 경로 접두사(레지스트리 `data/teams/*.json`) */
export const TEAM_FILES_PREFIX = "data/teams/";

/** 한국 선수 현황·원장 메타 경로(레지스트리 패턴과 같은 값) */
export const KOREAN_PLAYERS_DATA_FILE = "data/players/korean.json";
export const LEDGER_META_FILE = "data/matches/meta.json";
/** 이적 트래커·삭제 요청 경로(레지스트리 패턴과 같은 값) */
export const TRANSFERS_DATA_FILE = "data/transfers.json";
export const TAKEDOWNS_FILE = "configs/takedowns.json";

/** 스키마를 통과한 configs 값. 없거나 스키마 오류인 파일은 비워 둔다. */
export interface CrossRefInput {
  /** 스키마를 통과한 팀 파일(경로 → 값) — 하나도 없으면 비워 둔다 */
  teams?: ReadonlyMap<string, Team>;
  /** data/players/korean.json(스키마 통과) */
  koreanPlayersData?: KoreanPlayersDataFile;
  /** data/matches/meta.json(스키마 통과) */
  ledgerMeta?: MatchLedgerMeta;
  /** data/transfers.json(스키마 통과) */
  transfers?: TransfersFile;
  /** 스키마를 통과한 일별 뉴스 파일(경로 → 값) — 없으면 빈 맵 */
  news?: ReadonlyMap<string, NewsFile>;
  /** configs/takedowns.json(스키마 통과) */
  takedowns?: TakedownsFile;
  sources?: SourcesFile;
  searchQueries?: SearchQueriesFile;
  koreanPlayers?: KoreanPlayersFile;
  nationalTeam?: NationalTeamFile;
  publisherDomains?: PublisherDomainsFile;
  teamIds?: TeamIdsFile;
  teamColors?: TeamColorsFile;
}

export interface CrossRefResult {
  /** 실행한 검사 이름 */
  checked: string[];
  /** 파일이 없거나 스키마 오류라 건너뛴 검사 이름 */
  skipped: string[];
  issues: ValidationIssue[];
}

function crossRefError(
  file: string,
  path: readonly PropertyKey[],
  message: string,
): ValidationIssue {
  return {
    severity: "error",
    stage: "crossref",
    file,
    path: formatIssuePath(path),
    message,
  };
}

/** 1. 검색 쿼리의 source가 sources.json의 type "search" 소스인지 */
export function checkSearchQuerySources(
  searchQueries: SearchQueriesFile,
  sources: SourcesFile,
): ValidationIssue[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const issues: ValidationIssue[] = [];
  searchQueries.queries.forEach((query, i) => {
    const source = byId.get(query.source);
    const path = ["queries", i, "source"];
    if (!source) {
      issues.push(
        crossRefError(
          CROSSREF_FILES.searchQueries,
          path,
          `sources.json에 없는 소스 id "${query.source}"`,
        ),
      );
    } else if (source.type !== "search") {
      issues.push(
        crossRefError(
          CROSSREF_FILES.searchQueries,
          path,
          `소스 "${query.source}"의 type이 "${source.type}" — 검색 쿼리는 type "search" 소스만 참조`,
        ),
      );
    }
  });
  return issues;
}

/** 2. 검색 쿼리의 player가 korean-players.json에 있는 slug인지 */
export function checkSearchQueryPlayers(
  searchQueries: SearchQueriesFile,
  koreanPlayers: KoreanPlayersFile,
): ValidationIssue[] {
  const slugs = new Set(koreanPlayers.map((p) => p.slug));
  const issues: ValidationIssue[] = [];
  searchQueries.queries.forEach((query, i) => {
    if (query.player !== undefined && !slugs.has(query.player)) {
      issues.push(
        crossRefError(
          CROSSREF_FILES.searchQueries,
          ["queries", i, "player"],
          `korean-players.json에 없는 선수 slug "${query.player}"`,
        ),
      );
    }
  });
  return issues;
}

/** 3. 대표팀 소집 명단의 playerSlugs가 korean-players.json에 있는 slug인지 */
export function checkSquadPlayers(
  nationalTeam: NationalTeamFile,
  koreanPlayers: KoreanPlayersFile,
): ValidationIssue[] {
  const slugs = new Set(koreanPlayers.map((p) => p.slug));
  const issues: ValidationIssue[] = [];
  nationalTeam.squads.forEach((squad, i) => {
    squad.playerSlugs.forEach((slug, j) => {
      if (!slugs.has(slug)) {
        issues.push(
          crossRefError(
            CROSSREF_FILES.nationalTeam,
            ["squads", i, "playerSlugs", j],
            `korean-players.json에 없는 선수 slug "${slug}"`,
          ),
        );
      }
    });
  });
  return issues;
}

/**
 * 4. 매체 도메인 ↔ 소스
 * - sourceIds의 각 id가 sources.json에 있어야 한다.
 * - 판정이 소스의 약관 확인과 맞아야 한다: "allow"·"feed-only"의 근거 소스는 `terms_checked:true`,
 *   "deny"의 근거 소스는 `terms_checked:false`(한쪽만 바꾸면 두 파일의 판정이 엇갈린다).
 * - 수집 대상 소스(`enabled && terms_checked`)의 피드 호스트가 "deny" 도메인에 속하면 오류(이중 잠금 보강).
 */
export function checkPublisherDomainSources(
  publisherDomains: PublisherDomainsFile,
  sources: SourcesFile,
): ValidationIssue[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const issues: ValidationIssue[] = [];
  publisherDomains.domains.forEach((entry, i) => {
    entry.sourceIds.forEach((id, j) => {
      const path = ["domains", i, "sourceIds", j];
      const source = byId.get(id);
      if (!source) {
        issues.push(
          crossRefError(
            CROSSREF_FILES.publisherDomains,
            path,
            `sources.json에 없는 소스 id "${id}"`,
          ),
        );
        return;
      }
      const expected = entry.status !== "deny";
      if (source.terms_checked !== expected) {
        issues.push(
          crossRefError(
            CROSSREF_FILES.publisherDomains,
            path,
            `"${entry.status}" 도메인 "${entry.domain}"의 근거 소스 "${id}"가 terms_checked:${String(source.terms_checked)} — 판정이 엇갈림`,
          ),
        );
      }
    });
  });
  sources.forEach((source, i) => {
    if (!source.enabled || !source.terms_checked) return;
    const host = new URL(source.url).hostname;
    const match = findPublisherDomain(host, publisherDomains.domains);
    if (match?.status === "deny") {
      issues.push(
        crossRefError(
          CROSSREF_FILES.sources,
          [i, "url"],
          `수집 대상 소스 "${source.id}"의 호스트 ${host}가 publisher-domains.json의 deny 도메인 "${match.domain}"에 속함`,
        ),
      );
    }
  });
  return issues;
}

/**
 * 5. 활성 한국 선수의 소속팀이 team-ids.json에 있고 API-Football 팀 id(af)가 있는지 (D33).
 * 비활성 선수(기타 리그 이적 등 — 기록 수집 중단, FR-64)는 보지 않는다.
 */
export function checkKoreanPlayerTeamIds(
  koreanPlayers: KoreanPlayersFile,
  teamIds: TeamIdsFile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  koreanPlayers.forEach((player, i) => {
    if (!player.active) return;
    const entry = Object.hasOwn(teamIds, player.team)
      ? teamIds[player.team]
      : undefined;
    const path = [i, "team"];
    if (!entry) {
      issues.push(
        crossRefError(
          CROSSREF_FILES.koreanPlayers,
          path,
          `활성 선수 "${player.slug}"의 팀 "${player.team}"가 team-ids.json에 없음 — API-Football 팀 id(af)를 함께 등록할 것`,
        ),
      );
    } else if (entry.af === null) {
      issues.push(
        crossRefError(
          CROSSREF_FILES.koreanPlayers,
          path,
          `활성 선수 "${player.slug}"의 팀 "${player.team}"의 af(API-Football 팀 id)가 null — 소속팀 경기 기록을 수집하지 못함`,
        ),
      );
    }
  });
  return issues;
}

/**
 * 6. team-colors.json ↔ team-ids.json · 약어 글자 대비 (D62 ④, M2-05).
 * team-ids에 없는 키는 오류(오타·옛 slug), team-colors에 없는 팀은 경고(폴백 배지로 그려진다), 대비 미달은 오류.
 */
export function checkTeamColors(
  teamColors: TeamColorsFile,
  teamIds: TeamIdsFile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const file = CROSSREF_FILES.teamColors;
  for (const [slug, entry] of Object.entries(teamColors)) {
    if (!Object.hasOwn(teamIds, slug)) {
      issues.push(
        crossRefError(
          file,
          [slug],
          `팀 "${slug}"가 team-ids.json에 없음 — 팀 slug를 확인할 것`,
        ),
      );
    }
    const { text, contrast } = kitShirtContrast(entry.colors[0]);
    if (contrast < KIT_MIN_CONTRAST) {
      issues.push(
        crossRefError(
          file,
          [slug, "colors", 0],
          `상의 색 ${entry.colors[0]} 위 약어 글자(${text}) 대비 ${contrast.toFixed(2)} < ${KIT_MIN_CONTRAST} — scripts/build-team-colors.ts로 보정 값을 다시 만들 것(D62 ④)`,
        ),
      );
    }
  }
  for (const slug of Object.keys(teamIds)) {
    if (!Object.hasOwn(teamColors, slug)) {
      issues.push({
        severity: "warn",
        stage: "crossref",
        file,
        path: formatIssuePath([slug]),
        message: `team-ids.json 팀 "${slug}"의 키트 색이 없음 — 화면은 폴백 배지(점선·빗금)로 그린다`,
      });
    }
  }
  return issues;
}

/**
 * 7. data/teams/*.json ↔ team-ids·team-colors·korean-players (M2-06·M2-07). 팀 파일은 configs에서 만든 파생 파일이라 어긋나면
 * `scripts/build-teams.ts`로 다시 만든다.
 */
export function checkTeamFiles(
  teams: ReadonlyMap<string, Team>,
  teamIds: TeamIdsFile,
  teamColors: TeamColorsFile,
  koreanPlayers: KoreanPlayersFile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const regen = "scripts/build-teams.ts로 다시 만들 것";
  const playerBySlug = new Map(koreanPlayers.map((p) => [p.slug, p]));
  const seen = new Set<string>();
  for (const [file, team] of teams) {
    seen.add(team.slug);
    if (!Object.hasOwn(teamIds, team.slug)) {
      issues.push(
        crossRefError(
          file,
          ["slug"],
          `팀 "${team.slug}"가 team-ids.json에 없음 — 옛 slug 파일이면 지울 것`,
        ),
      );
    }
    const color = teamColors[team.slug];
    if (
      color !== undefined &&
      (color.short !== team.short ||
        color.colors[0] !== team.colors[0] ||
        color.colors[1] !== team.colors[1])
    ) {
      issues.push(
        crossRefError(
          file,
          ["colors"],
          `colors·short가 team-colors.json과 다름 — ${regen}`,
        ),
      );
    }
    team.koreanPlayers.forEach((slug, i) => {
      const player = playerBySlug.get(slug);
      if (player === undefined || player.team !== team.slug) {
        issues.push(
          crossRefError(
            file,
            ["koreanPlayers", i],
            `한국 선수 "${slug}"가 korean-players.json에 없거나 소속 팀이 다름 — ${regen}`,
          ),
        );
      }
    });
    if (team.lineup !== null) {
      if (!Object.hasOwn(teamIds, team.lineup.opponent)) {
        issues.push(
          crossRefError(
            file,
            ["lineup", "opponent"],
            `상대 팀 "${team.lineup.opponent}"가 team-ids.json에 없음 — ${regen}`,
          ),
        );
      }
      for (const list of ["startXI", "substitutes"] as const) {
        team.lineup[list].forEach((p, i) => {
          if (p.korean !== undefined && !playerBySlug.has(p.korean)) {
            issues.push(
              crossRefError(
                file,
                ["lineup", list, i, "korean"],
                `한국 선수 "${p.korean}"가 korean-players.json에 없음 — ${regen}`,
              ),
            );
          }
        });
      }
    }
  }
  for (const slug of Object.keys(teamIds)) {
    if (!seen.has(slug)) {
      issues.push({
        severity: "error",
        stage: "crossref",
        file: `${TEAM_FILES_PREFIX}${slug}.json`,
        message: `team-ids.json 팀 "${slug}"의 팀 파일이 없음 — ${regen}`,
      });
    }
  }
  for (const p of koreanPlayers) {
    if (!p.active) continue;
    const team = [...teams.values()].find((t) => t.slug === p.team);
    if (team !== undefined && !team.koreanPlayers.includes(p.slug)) {
      issues.push({
        severity: "warn",
        stage: "crossref",
        file: `${TEAM_FILES_PREFIX}${p.team}.json`,
        path: formatIssuePath(["koreanPlayers"]),
        message: `활성 한국 선수 "${p.slug}"가 팀 파일에 없음 — ${regen}`,
      });
    }
  }
  return issues;
}

/**
 * 8. data/players/korean.json ↔ korean-players·data/teams·원장 메타 (M3-03 — 머리 주석). 파생 파일이라 어긋나면
 * `npm run build:players`로 다시 만든다.
 */
export function checkKoreanPlayersData(
  data: KoreanPlayersDataFile,
  koreanPlayers: KoreanPlayersFile,
  teams: ReadonlyMap<string, Team>,
  meta: MatchLedgerMeta | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const file = KOREAN_PLAYERS_DATA_FILE;
  const regen = "npm run build:players로 다시 만들 것";
  const bySlug = new Map(koreanPlayers.map((p) => [p.slug, p]));
  const teamSlugs = new Set([...teams.values()].map((t) => t.slug));
  const warn = (path: readonly PropertyKey[], message: string) =>
    issues.push({
      severity: "warn",
      stage: "crossref",
      file,
      path: formatIssuePath(path),
      message,
    });
  const teamLink = (path: readonly PropertyKey[], slug: string | null) => {
    if (slug !== null && !teamSlugs.has(slug)) {
      issues.push(
        crossRefError(
          file,
          path,
          `팀 "${slug}"의 팀 파일(data/teams)이 없음 — ${regen}`,
        ),
      );
    }
  };
  data.players.forEach((r, i) => {
    const player = bySlug.get(r.slug);
    if (player === undefined) {
      issues.push(
        crossRefError(
          file,
          ["players", i, "slug"],
          `korean-players.json에 없는 선수 slug "${r.slug}" — ${regen}`,
        ),
      );
      return;
    }
    // 비활성(기타 리그 — FR-64) 선수는 기록이 멈춘 레코드라 팀 파일 링크를 보지 않는다
    if (!player.active) return;
    teamLink(["players", i, "team"], r.team);
    r.recent.forEach((log, j) =>
      teamLink(
        ["players", i, "recent", j, "opponent", "slug"],
        log.opponent.slug,
      ),
    );
    if (r.next !== null) {
      teamLink(
        ["players", i, "next", "opponent", "slug"],
        r.next.opponent.slug,
      );
    }
    if (meta !== undefined) {
      const since =
        player.apiFootballId !== null
          ? (meta.playerSince[r.slug] ?? null)
          : null;
      if (r.since !== since) {
        warn(
          ["players", i, "since"],
          `집계 시작일(${String(r.since)})이 원장 메타 playerSince(${String(since)})와 다름 — ${regen}`,
        );
      }
    }
  });
  const recorded = new Set(data.players.map((r) => r.slug));
  for (const p of koreanPlayers) {
    if (!recorded.has(p.slug)) {
      warn(["players"], `설정 선수 "${p.slug}"의 레코드가 없음 — ${regen}`);
    }
  }
  if (
    meta !== undefined &&
    (data.since !== meta.since || data.season !== meta.season)
  ) {
    warn(
      ["since"],
      `집계 시작일·시즌(${data.since}·${data.season})이 원장 메타(${meta.since}·${meta.season})와 다름 — ${regen}`,
    );
  }
  return issues;
}

/** 9. data/transfers.json ↔ data/news·takedowns (M4-01 — 머리 주석) */
export function checkTransfersData(
  transfers: TransfersFile,
  news: ReadonlyMap<string, NewsFile>,
  takedowns: TakedownsFile | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const file = TRANSFERS_DATA_FILE;
  const regen =
    "npm run build:transfers로 다시 만들 것(다음 수집도 다시 만든다)";
  const push = (
    severity: "error" | "warn",
    path: readonly PropertyKey[],
    message: string,
  ) =>
    issues.push({
      severity,
      stage: "crossref",
      file,
      path: formatIssuePath(path),
      message,
    });
  const cards = new Map<string, NonNullable<NewsFile["cards"][number]>>();
  for (const f of news.values()) {
    for (const c of f.cards) if (!cards.has(c.id)) cards.set(c.id, c);
  }
  const takedownIds = new Set((takedowns ?? []).map((t) => t.id));
  transfers.forEach((t, i) => {
    if (t.history.length === 0) {
      push(
        "error",
        [i, "history"],
        `이적 "${t.id}"의 근거 카드가 없음 — 근거 없는 단계는 게시하지 않는다(${regen})`,
      );
    }
    for (const problem of transferRecordProblems(t)) {
      push("warn", [i], `이적 "${t.id}": ${problem} — ${regen}`);
    }
    t.history.forEach((h, j) => {
      const path = [i, "history", j, "card"];
      if (takedownIds.has(h.card)) {
        push(
          "warn",
          path,
          `근거 카드 ${h.card}가 삭제 요청(takedowns)에 있음 — ${regen}`,
        );
        return;
      }
      const card = cards.get(h.card);
      if (card === undefined) {
        push("warn", path, `근거 카드 ${h.card}가 data/news에 없음 — ${regen}`);
      } else if (
        card.transfer === undefined ||
        transferIdOf(card.transfer.player, card.transfer.to) !== t.id
      ) {
        push(
          "warn",
          path,
          `근거 카드 ${h.card}의 transfer가 이적 "${t.id}"와 다름 — ${regen}`,
        );
      }
    });
  });
  return issues;
}

interface CrossRefCheck {
  name: string;
  /** 필요한 파일이 모두 있으면 이슈 목록, 하나라도 없으면 null(건너뜀) */
  run: (input: CrossRefInput) => ValidationIssue[] | null;
}

const CHECKS: readonly CrossRefCheck[] = [
  {
    name: "search-queries.source → sources(type search)",
    run: ({ searchQueries, sources }) =>
      searchQueries && sources
        ? checkSearchQuerySources(searchQueries, sources)
        : null,
  },
  {
    name: "search-queries.player → korean-players",
    run: ({ searchQueries, koreanPlayers }) =>
      searchQueries && koreanPlayers
        ? checkSearchQueryPlayers(searchQueries, koreanPlayers)
        : null,
  },
  {
    name: "national-team.squads.playerSlugs → korean-players",
    run: ({ nationalTeam, koreanPlayers }) =>
      nationalTeam && koreanPlayers
        ? checkSquadPlayers(nationalTeam, koreanPlayers)
        : null,
  },
  {
    name: "publisher-domains.sourceIds → sources",
    run: ({ publisherDomains, sources }) =>
      publisherDomains && sources
        ? checkPublisherDomainSources(publisherDomains, sources)
        : null,
  },
  {
    name: "korean-players.team(활성) → team-ids(af)",
    run: ({ koreanPlayers, teamIds }) =>
      koreanPlayers && teamIds
        ? checkKoreanPlayerTeamIds(koreanPlayers, teamIds)
        : null,
  },
  {
    name: "team-colors → team-ids · 약어 대비 5.3",
    run: ({ teamColors, teamIds }) =>
      teamColors && teamIds ? checkTeamColors(teamColors, teamIds) : null,
  },
];

/** data 파일이 걸린 교차 참조 — data 스키마 검사(⑤) 뒤에 실행한다(`--configs-only`면 팀 파일이 없어 건너뛴다) */
const DATA_CHECKS: readonly CrossRefCheck[] = [
  {
    name: "data/teams → team-ids · team-colors · korean-players",
    run: ({ teams, teamIds, teamColors, koreanPlayers }) =>
      teams && teams.size > 0 && teamIds && teamColors && koreanPlayers
        ? checkTeamFiles(teams, teamIds, teamColors, koreanPlayers)
        : null,
  },
  {
    name: "data/players/korean.json → korean-players · data/teams · 원장 메타",
    run: ({ koreanPlayersData, koreanPlayers, teams, ledgerMeta }) =>
      koreanPlayersData && koreanPlayers && teams && teams.size > 0
        ? checkKoreanPlayersData(
            koreanPlayersData,
            koreanPlayers,
            teams,
            ledgerMeta,
          )
        : null,
  },
  {
    name: "data/transfers.json → data/news · takedowns",
    run: ({ transfers, news, takedowns }) =>
      transfers
        ? checkTransfersData(transfers, news ?? new Map(), takedowns)
        : null,
  },
];

/** 교차 참조 검사 전체를 실행한다(`scope` "data"면 data 파일이 걸린 검사만). */
export function runCrossRefChecks(
  input: CrossRefInput,
  scope: "configs" | "data" = "configs",
): CrossRefResult {
  const result: CrossRefResult = { checked: [], skipped: [], issues: [] };
  for (const check of scope === "configs" ? CHECKS : DATA_CHECKS) {
    const issues = check.run(input);
    if (issues === null) {
      result.skipped.push(check.name);
    } else {
      result.checked.push(check.name);
      result.issues.push(...issues);
    }
  }
  return result;
}

/**
 * 경로 → 스키마 통과 값 맵에서 교차 참조 입력을 고른다.
 * 호출 규약: 맵에는 레지스트리 스키마(registry.ts — 경로마다 위 타입의 스키마)로 safeParse에 성공한 값만 넣는다.
 * 그래서 타입 단언이 안전하다(registry.test.ts가 경로 ↔ 스키마 매핑을 확인).
 */
export function pickCrossRefInput(
  parsedByPath: ReadonlyMap<string, unknown>,
): CrossRefInput {
  const input: CrossRefInput = {};
  const pick = <K extends CrossRefKey>(key: K): void => {
    const value = parsedByPath.get(CROSSREF_FILES[key]);
    if (value !== undefined) input[key] = value as CrossRefInput[K];
  };
  pick("sources");
  pick("searchQueries");
  pick("koreanPlayers");
  pick("nationalTeam");
  pick("publisherDomains");
  pick("teamIds");
  pick("teamColors");
  const teams = new Map<string, Team>();
  for (const [file, value] of parsedByPath) {
    if (file.startsWith(TEAM_FILES_PREFIX) && file.endsWith(".json")) {
      teams.set(file, value as Team); // 레지스트리 TeamSchema 통과 값(호출 규약)
    }
  }
  if (teams.size > 0) input.teams = teams;
  // 레지스트리 KoreanPlayersDataFileSchema·MatchLedgerMetaSchema 통과 값(호출 규약)
  const koreanData = parsedByPath.get(KOREAN_PLAYERS_DATA_FILE);
  if (koreanData !== undefined) {
    input.koreanPlayersData = koreanData as KoreanPlayersDataFile;
  }
  const meta = parsedByPath.get(LEDGER_META_FILE);
  if (meta !== undefined) input.ledgerMeta = meta as MatchLedgerMeta;
  // 레지스트리 TransfersFileSchema·NewsFileSchema·TakedownsFileSchema 통과 값(호출 규약)
  const transfers = parsedByPath.get(TRANSFERS_DATA_FILE);
  if (transfers !== undefined) input.transfers = transfers as TransfersFile;
  const news = new Map<string, NewsFile>();
  for (const [file, value] of parsedByPath) {
    if (isDailyNewsPath(file)) news.set(file, value as NewsFile);
  }
  if (news.size > 0) input.news = news;
  const takedowns = parsedByPath.get(TAKEDOWNS_FILE);
  if (takedowns !== undefined) input.takedowns = takedowns as TakedownsFile;
  return input;
}
