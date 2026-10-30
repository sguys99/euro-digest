/**
 * 대회 파일 `data/competitions/{comp}.json` 조립·읽기·쓰기 (M2-02, PRD FR-40~45).
 *
 * 조립(`mergeCompetitionFile`)은 순수 함수다: 이전 파일 + 이번 실행의 조각 결과(순위·경기·득점 — 각각 성공/실패) → 새 파일.
 *   - **대회 단위 실패 격리**: 세 조각이 모두 실패하면 파일을 쓰지 않는다(`keep`) — 전일 파일과 `updatedAt`이 그대로 남아
 *     화면이 "업데이트 지연"을 판단한다(FR-45).
 *   - **조각 단위 유지**: 일부만 실패하면 그 조각만 이전 파일 값을 쓴다(이전 파일이 없거나 시즌이 다르면 빈 배열).
 *   - `updatedAt`은 세 조각이 모두 이번에 받은 값일 때만 이번 시각으로 바꾼다. 하나라도 이전 값이면 이전 `updatedAt`을 둔다 —
 *     파일에 시각이 하나뿐이라, 새 시각을 쓰면 묵은 조각이 새것처럼 보인다(보수적으로 "지연" 쪽). 이전 파일이 없으면 이번 시각.
 *   - 순위 보강(`enrichStandings` — 전일 대비 변동·최근 5경기 폼, M2-03 standings-enrich.ts)은 **이번에 받은 순위에만** 적용한다.
 *     이전 값을 유지한 순위는 이미 보강된 값이다. 보강 함수를 넘기지 않으면 어댑터 기본값 그대로(prevPos null·form []) —
 *     대회 단계(competitions-stage.ts)는 기본으로 standings-enrich.ts를 넘긴다.
 * 쓰기는 스키마 검증 → 임시 파일 → rename(원자적). 검증에 걸리는 파일은 쓰지 않는다.
 */
import { randomBytes } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

import {
  CompetitionFileSchema,
  type CompId,
  type CompetitionConfig,
  type CompetitionFile,
  type Match,
  type Scorer,
  type StandingRow,
} from "@/lib/schema";

export const COMPETITION_PARTS = ["standings", "matches", "scorers"] as const;
export type CompetitionPart = (typeof COMPETITION_PARTS)[number];

export type PartResult<T> =
  { ok: true; value: T } | { ok: false; errorType: string; error: string };

export interface CompetitionParts {
  standings: PartResult<StandingRow[]>;
  matches: PartResult<Match[]>;
  scorers: PartResult<Scorer[]>;
}

/**
 * 순위 보강(M2-03 — 기본 구현 standings-enrich.ts `enrichStandings`) — 이번에 받은 순위 행 + 이전 파일(같은 대회·시즌일 때만) +
 * 이번 경기 목록 + 이번 수집 시각(같은 KST 날짜 판정) → 보강한 행. 행 순서·팀·숫자는 바꾸지 않고 prevPos·form만 채우는 것이 계약이다.
 */
export type StandingsEnricher = (input: {
  rows: readonly StandingRow[];
  previous: CompetitionFile | null;
  matches: readonly Match[];
  fetchedAt: string;
}) => StandingRow[];

export interface MergeCompetitionInput {
  comp: Pick<CompetitionConfig, "id" | "season">;
  /** 전일(직전) 파일 — 없거나 읽지 못하면 null */
  previous: CompetitionFile | null;
  parts: CompetitionParts;
  /** 이번에 받은 시각(UTC ISO) */
  fetchedAt: string;
  enrichStandings?: StandingsEnricher;
}

export type MergeCompetitionOutcome =
  | {
      action: "write";
      file: CompetitionFile;
      /** 이번에 받은 조각 */
      fresh: CompetitionPart[];
      /** 이전 파일 값을 유지한 조각 */
      kept: CompetitionPart[];
      /** 실패했고 이전 값도 없어 빈 배열로 둔 조각 */
      empty: CompetitionPart[];
    }
  | { action: "keep"; reason: "all-failed" };

/** 이어 쓸 수 있는 이전 파일인가 — 같은 대회·같은 시즌만(시즌 전환 뒤 지난 시즌 값을 끌어오지 않는다) */
export function usablePrevious(
  comp: Pick<CompetitionConfig, "id" | "season">,
  previous: CompetitionFile | null,
): CompetitionFile | null {
  return previous !== null &&
    previous.comp === comp.id &&
    previous.season === comp.season
    ? previous
    : null;
}

/** 이전 파일 + 조각 결과 → 새 파일(위 규칙). 결과 파일이 스키마에 맞지 않으면 던진다(경기 id 중복 등) */
export function mergeCompetitionFile(
  input: MergeCompetitionInput,
): MergeCompetitionOutcome {
  const { comp, parts, fetchedAt } = input;
  if (COMPETITION_PARTS.every((p) => !parts[p].ok)) {
    return { action: "keep", reason: "all-failed" };
  }
  const previous = usablePrevious(comp, input.previous);
  const fresh: CompetitionPart[] = [];
  const kept: CompetitionPart[] = [];
  const empty: CompetitionPart[] = [];
  function pick<T>(
    part: CompetitionPart,
    result: PartResult<T[]>,
    prev: T[] | undefined,
  ): T[] {
    if (result.ok) {
      fresh.push(part);
      return result.value;
    }
    if (prev !== undefined) {
      kept.push(part);
      return prev;
    }
    empty.push(part);
    return [];
  }
  const matches = pick("matches", parts.matches, previous?.matches);
  let standings = pick("standings", parts.standings, previous?.standings);
  const scorers = pick("scorers", parts.scorers, previous?.scorers);
  if (parts.standings.ok && input.enrichStandings) {
    standings = input.enrichStandings({
      rows: standings,
      previous,
      matches,
      fetchedAt,
    });
  }
  const allFresh = fresh.length === COMPETITION_PARTS.length;
  const file = CompetitionFileSchema.parse({
    comp: comp.id,
    season: comp.season,
    provider: "football-data",
    updatedAt: allFresh ? fetchedAt : (previous?.updatedAt ?? fetchedAt),
    standings,
    matches,
    scorers,
  });
  return { action: "write", file, fresh, kept, empty };
}

// ─── 파일 I/O ───────────────────────────────────────────────────────────

/** `<dataDir>/competitions/<comp 소문자>.json` */
export function competitionFilePath(dataDir: string, comp: CompId): string {
  return path.join(dataDir, "competitions", `${comp.toLowerCase()}.json`);
}

export type ReadCompetitionResult =
  | { status: "ok"; file: CompetitionFile }
  | { status: "missing" }
  | { status: "invalid"; error: string };

/** 이전 파일 읽기 — 없으면 missing, JSON·스키마 오류면 invalid(던지지 않는다 — 호출부가 이전 값 없이 진행하고 로그) */
export async function readCompetitionFile(
  dataDir: string,
  comp: CompId,
): Promise<ReadCompetitionResult> {
  let text: string;
  try {
    text = await fsPromises.readFile(
      competitionFilePath(dataDir, comp),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing" };
    }
    throw error;
  }
  try {
    const parsed = CompetitionFileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return {
        status: "invalid",
        error: parsed.error.issues[0]?.message ?? "스키마 오류",
      };
    }
    return { status: "ok", file: parsed.data };
  } catch {
    return { status: "invalid", error: "JSON 파싱 실패" };
  }
}

export function serializeCompetitionFile(file: CompetitionFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 검증 → 임시 파일 → rename. 쓰는 도중 실패해도 기존 파일이 반쯤 쓰인 채로 남지 않는다 */
export async function writeCompetitionFile(
  dataDir: string,
  file: CompetitionFile,
): Promise<string> {
  const valid = CompetitionFileSchema.parse(file);
  const target = competitionFilePath(dataDir, valid.comp);
  await fsPromises.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsPromises.writeFile(tmp, serializeCompetitionFile(valid), "utf8");
    await fsPromises.rename(tmp, target);
  } catch (error) {
    await fsPromises.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}
