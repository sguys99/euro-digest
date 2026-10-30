/**
 * 팀 파일 생성의 파일 입출력 (M2-06·M2-07 → M2-09) — 단독 진입점(scripts/build-teams.ts)과 수집 실행의 팀 단계
 * (scripts/lib/football-stages.ts)가 같은 읽기·쓰기를 쓴다. 생성 규칙 자체는 순수 함수(scripts/lib/team-files.ts).
 *
 *   - 원장 전체(data/matches/YYYY-MM.json 모든 달 + meta.season) — 읽기·형식 오류는 던진다(원장이 깨진 채 포메이션을 세지 않는다)
 *   - 대회 파일(data/competitions) — 없거나 깨진 대회는 빠진다(주요 선수 []) · 이전 팀 파일(data/teams) — 깨진 파일은 경고 후 빠진다
 *   - configs/formations.json — 없으면 {}(수동 보조 없음), 형식 오류는 던진다
 *   - 팀 파일 쓰기 — 내용이 같으면 쓰지 않는다(결정적 직렬화 — 재실행 쓰기 0), 임시 파일 → rename
 *   - 단독 백필 호출 기록(`recordBackfillApiCalls`) — `build-teams --backfill`의 API-Football 호출 수를 실행 기록(로컬 = runs-dev.json)에
 *     남긴다. 봇의 일일 카운터(api-football-plan.ts `apiFootballCallAllowance`)가 같은 UTC 날의 dev 사용을 합산한다(M2-09)
 */
import { randomBytes } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  FormationsFileSchema,
  TeamSchema,
  type CompId,
  type CompetitionFile,
  type FormationsFile,
  type LedgerMatch,
  type RunEnv,
  type Team,
} from "@/lib/schema";

import { readCompetitionFile } from "./competition-file";
import { readConfigFile } from "./config-files";
import { recordRun, type RecordRunResult } from "./cost";
import { DEFAULT_LLM_MODEL } from "./llm";
import { readLedgerMeta, readLedgerMonth } from "./match-ledger";
import { serializeTeamFile } from "./team-files";

/** 팀 파일이 읽는 대회 파일(설정 순서와 같다 — 주요 선수·백필 우선순위 입력) */
export const TEAM_COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

export function teamsDir(dataDir: string): string {
  return path.join(dataDir, "teams");
}

type Warn = (event: string, fields: Record<string, unknown>) => void;

/** 원장 전체(모든 달) + 시즌(meta.season, 없으면 null). 읽기·형식 오류는 던진다 */
export async function readLedgerAll(dataDir: string): Promise<{
  matches: LedgerMatch[];
  season: number | null;
}> {
  const meta = await readLedgerMeta(dataDir);
  if (meta.error) throw new Error(`data/matches/meta.json ${meta.error}`);
  let names: string[] = [];
  try {
    names = await readdir(path.join(dataDir, "matches"));
  } catch {
    names = [];
  }
  const matches: LedgerMatch[] = [];
  for (const name of names.sort()) {
    const m = /^(\d{4}-\d{2})\.json$/.exec(name);
    if (!m) continue;
    const read = await readLedgerMonth(dataDir, m[1]!);
    if (read.error) throw new Error(`data/matches/${name} ${read.error}`);
    if (read.value) matches.push(...read.value.matches);
  }
  return { matches, season: meta.value?.season ?? null };
}

/** 대회 파일(있는 것만) — 없거나 깨진 대회는 경고 후 빠진다 */
export async function readCompetitionFiles(
  dataDir: string,
  warn: Warn,
): Promise<Partial<Record<CompId, CompetitionFile>>> {
  const competitions: Partial<Record<CompId, CompetitionFile>> = {};
  for (const comp of TEAM_COMP_IDS) {
    const read = await readCompetitionFile(dataDir, comp);
    if (read.status === "ok") competitions[comp] = read.file;
    else warn("teams.competition-missing", { comp, status: read.status });
  }
  return competitions;
}

/** 이전 팀 파일(slug → 값) — 스키마에 맞지 않는 파일은 경고 후 빠진다 */
export async function readPreviousTeams(
  dataDir: string,
  warn: Warn,
): Promise<Map<string, Team>> {
  const dir = teamsDir(dataDir);
  const previous = new Map<string, Team>();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return previous;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = TeamSchema.safeParse(
        JSON.parse(await readFile(path.join(dir, name), "utf8")),
      );
      if (parsed.success) previous.set(parsed.data.slug, parsed.data);
      else warn("teams.previous-invalid", { file: name });
    } catch {
      warn("teams.previous-invalid", { file: name });
    }
  }
  return previous;
}

/** configs/formations.json — 파일이 없으면 {}(수동 보조 없음), 형식 오류는 던진다 */
export async function readFormations(rootDir: string): Promise<FormationsFile> {
  try {
    return await readConfigFile(
      rootDir,
      "formations.json",
      FormationsFileSchema,
    );
  } catch (error) {
    if (error instanceof Error && /ENOENT|no such file/i.test(error.message)) {
      return {};
    }
    throw error;
  }
}

/** 팀 파일 1개 쓰기 — 내용이 같으면 쓰지 않고 false */
export async function writeTeamFileIfChanged(
  dataDir: string,
  team: Team,
): Promise<boolean> {
  const dir = teamsDir(dataDir);
  const target = path.join(dir, `${team.slug}.json`);
  const text = serializeTeamFile(team);
  try {
    if ((await readFile(target, "utf8")) === text) return false;
  } catch {
    // 없으면 새로 쓴다
  }
  await mkdir(dir, { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return true;
}

/**
 * `build-teams --backfill`(단독 실행)의 API-Football 호출 기록 — RunLog 스키마 그대로 한 건(job collect·status skipped = 발행하지 않은
 * 실행, LLM 비용 0, apiCalls.apiFootball만). 로컬(dev)은 data/runs-dev.json, Actions(prod)는 data/runs.json(resolveRunEnv와 같은 기준).
 * 호출이 0이면 쓰지 않는다(null). 기록은 cost.ts `recordRun`이 한다 — 사람이 적지 않는다(CLAUDE.md §6.3).
 */
export async function recordBackfillApiCalls(input: {
  env: RunEnv;
  dataDir: string;
  /** 백필 시작(UTC ISO) — 카운터는 이 시각의 UTC 날짜로 센다 */
  startedAt: string;
  apiFootballCalls: number;
  now?: Date;
  /** 생략하면 now */
  finishedAt?: string;
}): Promise<RecordRunResult | null> {
  if (input.apiFootballCalls <= 0) return null;
  return recordRun({
    env: input.env,
    job: "collect",
    model: DEFAULT_LLM_MODEL,
    startedAt: input.startedAt,
    ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
    status: "skipped",
    apiCalls: { footballData: 0, apiFootball: input.apiFootballCalls },
    dataDir: input.dataDir,
  });
}
