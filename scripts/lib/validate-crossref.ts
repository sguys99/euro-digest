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
 * formations.json·team-colors.json의 키 형식(slug)은 스키마(`z.record(SlugSchema, …)`)가 이미 검사한다.
 */
import {
  findPublisherDomain,
  type KoreanPlayersFile,
  type NationalTeamFile,
  type PublisherDomainsFile,
  type SearchQueriesFile,
  type SourcesFile,
  type TeamColorsFile,
  type TeamIdsFile,
} from "@/lib/schema";

import { KIT_MIN_CONTRAST, kitShirtContrast } from "@/lib/kit-contrast";
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

/** 스키마를 통과한 configs 값. 없거나 스키마 오류인 파일은 비워 둔다. */
export interface CrossRefInput {
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

/** 교차 참조 검사 전체를 실행한다. */
export function runCrossRefChecks(input: CrossRefInput): CrossRefResult {
  const result: CrossRefResult = { checked: [], skipped: [], issues: [] };
  for (const check of CHECKS) {
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
  return input;
}
