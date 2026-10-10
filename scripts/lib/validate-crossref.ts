/**
 * `npm run validate` — configs 파일 사이 교차 참조 검사 (M0-17). I/O 없는 순수 함수만 둔다.
 *
 * 검사는 **관련 파일이 모두 있고 각자 스키마를 통과했을 때만** 실행한다. 한쪽이 없거나 스키마 오류면
 * 건너뛴다(스키마 오류는 그 파일에서 이미 보고되고, 파일은 기능 단계에서 하나씩 생긴다).
 *
 *   1. search-queries.json `queries[].source` → sources.json에 같은 id이면서 type "search"인 소스
 *   2. search-queries.json `queries[].player` → korean-players.json slug (`/add-player`가 함께 추가)
 *   3. national-team.json `squads[].playerSlugs[]` → korean-players.json slug (FR-73 선수 링크)
 *
 * formations.json·team-colors.json의 키 형식(slug)은 스키마(`z.record(SlugSchema, …)`)가 이미 검사한다.
 */
import type {
  KoreanPlayersFile,
  NationalTeamFile,
  SearchQueriesFile,
  SourcesFile,
} from "@/lib/schema";

import { formatIssuePath, type ValidationIssue } from "./validate-schema";

/** 교차 참조에 쓰는 configs 경로 (레지스트리 패턴과 같은 값) */
export const CROSSREF_FILES = {
  sources: "configs/sources.json",
  searchQueries: "configs/search-queries.json",
  koreanPlayers: "configs/korean-players.json",
  nationalTeam: "configs/national-team.json",
} as const;

type CrossRefKey = keyof typeof CROSSREF_FILES;

/** 스키마를 통과한 configs 값. 없거나 스키마 오류인 파일은 비워 둔다. */
export interface CrossRefInput {
  sources?: SourcesFile;
  searchQueries?: SearchQueriesFile;
  koreanPlayers?: KoreanPlayersFile;
  nationalTeam?: NationalTeamFile;
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
  return input;
}
