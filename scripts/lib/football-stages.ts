/**
 * 수집 실행의 축구 데이터 단계 (M2-09 — PRD FR-40·FR-45·FR-50, §10, M2 완료 기준 ①②) — 대회 파일·팀 파일을 매일 갱신한다.
 * collect-run.ts `runCollect`가 브리핑 게시 뒤에 부른다. **이 단계의 어떤 실패도 뉴스·브리핑 발행을 멈추지 않는다** — 함수는 던지지
 * 않고 결과(state·실패 목록)를 돌려주며, 실행 상태(partial)·이슈 사건은 collect-run.ts가 결과로 정한다.
 *
 * ── 순서 (collect-run.ts) ──────────────────────────────────────────────────────────────────────
 *   ① 브리핑(단건 LLM) 게시 → ② 대회 단계 시작(football-data — 브리핑 입력의 football-data 단계가 끝난 뒤 그 마지막 응답 + 6.5초부터,
 *      `notBefore` — 같은 키의 분당 10회 간격을 클라이언트가 바뀌어도 잇는다) ‖ API-Football 나머지(원장·이월 — 호스트가 달라 병렬)
 *   → ③ 경기 데이터 마무리(원장 쓰기) → ④ 팀 단계(원장 + 방금 쓴 대회 파일 + API-Football 상세의 팀시트 + 라인업 백필) → 실행 기록.
 *   대회 단계를 브리핑 **뒤**에 두는 이유: 브리핑 입력의 전일 순위(brief-input.ts `briefPrevPositions`)가 대회 파일의 아침 스냅숏을
 *   읽는다(M2-03 이월 — 그날 아침 스냅숏이 다음 날 ▲▼ 기준).
 *
 * ── 언제 도나 (`planFootballStages`) ──────────────────────────────────────────────────────────────
 *   - 스위치: CollectDeps.footballStages(진입점 scripts/collect.ts가 `COLLECT_FOOTBALL_STAGES` — 저장소 변수 — 로 정한다. 기본 켬,
 *     `off`면 끔: 아침 봇 시간대(사람 push 금지)에 코드 수정 없이 끌 수 있게). 테스트 주입 deps는 기본 꺼짐.
 *   - 뉴스 단계가 실패한 실행(exit 1 — 커밋되지 않음)은 돌지 않는다(호출·시간 낭비 방지).
 *   - 대회 단계: **prod·비dry**이고 실행 시각이 **09:00 KST 전**일 때만(대회 파일 `updatedAt`이 하나라 늦은 실행이 다음 날 ▲▼ 기준을
 *     바꾼다 — M2-03 운영 규칙). 개발(dev)·dry 실행은 football-data 18요청을 쓰지 않는다(단독 실행 `npm run fetch:competitions`).
 *   - 팀 단계: prod·비dry면 data/teams를 쓰고(write), 그 밖은 계산만 하고 로그로 남긴다(preview — API 호출 없음).
 *   - 라인업 백필: prod·비dry·정기 운영(COLLECT_ENABLED)이고 API-Football 단계가 멈춤 없이 끝났을 때, 남은 일일 몫 안에서
 *     min(남은 몫, 5)건(`lineupBackfillAllowance` — 봇 일일 ≤ 60 우리 쪽 카운터, D27). 받아 본 id는 data/cache/lineup-backfill.json
 *     (30일)에 남겨 다음 실행이 다시 고르지 않는다(`exclude`).
 *
 * ── 시간 예산 ──────────────────────────────────────────────────────────────────────────────────
 *   새 단계는 브리핑 마감(공개 목표 − 10분) 뒤 `FOOTBALL_STAGES_GRACE_MS`(3분)까지만 쓴다 — 마감 뒤 10분은 검증·빌드·커밋·배포
 *   몫이라 그중 3분까지만 빌린다. 대회 단계 = min(4분, 그 상한), 백필 = min(90초, 그 상한). 상한에 걸린 대회는 받은 조각까지만
 *   반영하고 나머지는 전일 값을 유지한다(competition-file.ts — 세 조각 모두 실패면 파일을 쓰지 않음).
 *
 * ── 미등록 이름 ──────────────────────────────────────────────────────────────────────────────────
 *   대회 단계가 쓴 득점 순위에서 대회별 상위 `SCORER_NAMES_PER_COMP`(20)명만 unknown-names 후보로 넘긴다(600명 전부 넣지 않는다 —
 *   M2-02 이월). 적재 자체는 collect-run.ts의 기존 적재(prod·비dry만 쓴다)가 한다.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  LineupBackfillFileSchema,
  NamesKoFileSchema,
  TeamColorsFileSchema,
  type CompId,
  type CompetitionFile,
  type CompetitionsFile,
  type LedgerMatch,
  type LineupBackfillFile,
  type RunEnv,
} from "@/lib/schema";
import { kstParts, nowUtcIso, parseUtcIso } from "@/lib/time";

import type { ApiFootballData, CollectDeps } from "./collect-run";
import {
  readCompetitionFile,
  writeCompetitionFile,
  type CompetitionPart,
} from "./competition-file";
import { fetchCompetitionFiles, type PartFailure } from "./competitions-stage";
import { readConfigFile } from "./config-files";
import type { MatchDetail, ProviderOutcome } from "./match-data";
import {
  ApiFootballError,
  createApiFootballClient,
  toMatchDetail,
} from "./providers/api-football";
import {
  createFootballDataClient,
  FOOTBALL_DATA_MIN_INTERVAL_MS,
} from "./providers/football-data";
import {
  afToSlugOf,
  buildTeamFiles,
  koreanByAfIdOf,
  lineupBackfillPriority,
  planLineupBackfill,
  teamSheetsFromDetails,
  type TeamFilesInput,
  type TeamFilesStats,
} from "./team-files";
import {
  readCompetitionFiles,
  readFormations,
  readLedgerAll,
  readPreviousTeams,
  writeTeamFileIfChanged,
} from "./team-files-io";
import { buildTeamIdIndex, loadTeamIds } from "./team-ids";
import { allTeamSlugs } from "./team-leagues";
import type { UnknownNameObservation } from "./unknown-names";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 대회 단계 시간 예산 — 6개 대회 18요청 실측 약 2분 16초(M2-02) + 재시도 여유 */
export const COMPETITIONS_STAGE_BUDGET_MS = 240_000;
/** 새 단계가 브리핑 마감 뒤 쓸 수 있는 최대 시간(마감 뒤 10분 = 검증·빌드·커밋·배포 몫 중 3분까지) */
export const FOOTBALL_STAGES_GRACE_MS = 180_000;
/** 대회 단계를 돌리는 KST 시각 상한(시) — 이 시각부터는 건너뛴다(M2-03 운영 규칙: 09:00 KST 전에만) */
export const COMPETITIONS_STAGE_KST_CUTOFF_HOUR = 9;
/** 라인업 백필 실행당 상한(M2-06·07 이월 — min(60 − 사용, 5)) */
export const LINEUP_BACKFILL_PER_RUN = 5;
/** 라인업 백필 시간 예산 — 5요청 × (6.5초 간격 + 응답) ≈ 40초 */
export const LINEUP_BACKFILL_BUDGET_MS = 90_000;
/** 받아 본 경기 id 보존 기간(일) */
export const LINEUP_BACKFILL_CACHE_DAYS = 30;
/** 대회별 미등록 이름 후보로 넘길 득점 순위 상위 인원 */
export const SCORER_NAMES_PER_COMP = 20;
/** 백필 캐시 경로(data/ 기준) */
export const LINEUP_BACKFILL_REL_PATH = path.join(
  "cache",
  "lineup-backfill.json",
);

export function lineupBackfillPath(dataDir: string): string {
  return path.join(dataDir, LINEUP_BACKFILL_REL_PATH);
}

/** 이 단계가 쓰는 수집 의존성 — collect-run.ts CollectDeps의 일부 */
export type FootballStagesDeps = Pick<
  CollectDeps,
  | "rootDir"
  | "dataDir"
  | "env"
  | "dry"
  | "ledgerEnabled"
  | "now"
  | "fetch"
  | "footballDataApiKey"
  | "footballDataSleep"
  | "footballDataNow"
  | "apiFootballApiKey"
  | "apiFootballSleep"
  | "apiFootballNow"
  | "logger"
>;

/** `COLLECT_FOOTBALL_STAGES` → 켬/끔. 비었거나 없으면 켬, `off`·`false`·`0`이면 끔 */
export function resolveFootballStagesEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? "";
  return !(value === "off" || value === "false" || value === "0");
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

// ─── 계획 (순수) ─────────────────────────────────────────────────────────

export type FootballStageSkipReason =
  "disabled" | "news-failed" | "dev" | "dry" | "after-cutoff" | "no-api-key";

export interface FootballStagesPlan {
  competitions: { run: true } | { run: false; reason: FootballStageSkipReason };
  teams:
    | { run: true; mode: "write" | "preview" }
    | { run: false; reason: FootballStageSkipReason };
}

/** 어느 단계를 어떻게 돌리나(머리 주석 "언제 도나") */
export function planFootballStages(input: {
  enabled: boolean;
  newsOk: boolean;
  env: RunEnv;
  dry: boolean;
  /** 실행 시작(UTC ISO) — 09:00 KST 판정 */
  startedAt: string;
  hasFootballDataKey: boolean;
}): FootballStagesPlan {
  if (!input.enabled) {
    return {
      competitions: { run: false, reason: "disabled" },
      teams: { run: false, reason: "disabled" },
    };
  }
  if (!input.newsOk) {
    return {
      competitions: { run: false, reason: "news-failed" },
      teams: { run: false, reason: "news-failed" },
    };
  }
  const write = input.env === "prod" && !input.dry;
  let competitions: FootballStagesPlan["competitions"];
  if (input.env !== "prod") competitions = { run: false, reason: "dev" };
  else if (input.dry) competitions = { run: false, reason: "dry" };
  else if (
    kstParts(input.startedAt).hour >= COMPETITIONS_STAGE_KST_CUTOFF_HOUR
  ) {
    competitions = { run: false, reason: "after-cutoff" };
  } else if (!input.hasFootballDataKey) {
    competitions = { run: false, reason: "no-api-key" };
  } else competitions = { run: true };
  return {
    competitions,
    teams: { run: true, mode: write ? "write" : "preview" },
  };
}

export type LineupBackfillSkipReason =
  | "not-write"
  | "ledger-disabled"
  | "no-api-key"
  | "af-not-done"
  | "af-stopped"
  | "daily-cap";

/**
 * 라인업 백필 건수 — min(이번 실행 허용량 − 이번 실행 사용, 5). 허용량(api-football-plan.ts `apiFootballCallAllowance`)이 이미
 * min(봇 60 − 오늘 봇 사용, 100 − 오늘 전체 사용, 실행당 상한)이라 일일 카운터를 그대로 지킨다. API-Football 단계가 멈췄으면
 * (시간 예산·일 한도·플랜·키·연속 실패) 백필하지 않는다 — 남은 대상 경기는 이월로 다음 실행이 먼저 받는다.
 */
export function lineupBackfillAllowance(input: {
  env: RunEnv;
  dry: boolean;
  ledgerEnabled: boolean;
  hasApiKey: boolean;
  apiFootball: ProviderOutcome<
    Pick<ApiFootballData, "allowance" | "calls"> & {
      stage: Pick<ApiFootballData["stage"], "stoppedBy" | "degraded">;
    }
  > | null;
}): { count: number; reason: LineupBackfillSkipReason | null } {
  if (input.env !== "prod" || input.dry)
    return { count: 0, reason: "not-write" };
  if (!input.ledgerEnabled) return { count: 0, reason: "ledger-disabled" };
  if (!input.hasApiKey) return { count: 0, reason: "no-api-key" };
  const af = input.apiFootball;
  if (af === null || af.state !== "done") {
    return { count: 0, reason: "af-not-done" };
  }
  if (af.data.stage.stoppedBy !== null || af.data.stage.degraded !== null) {
    return { count: 0, reason: "af-stopped" };
  }
  const left = af.data.allowance.remaining - af.data.calls;
  const count = Math.max(0, Math.min(LINEUP_BACKFILL_PER_RUN, left));
  return count > 0
    ? { count, reason: null }
    : { count: 0, reason: "daily-cap" };
}

/** 단계 마감(단계 시계 ms) — min(예산, 상한 시각까지 남은 시간). 상한이 지났으면 지금(요청을 보내지 않는다) */
export function stageDeadline(input: {
  clockNow: number;
  wallNow: Date;
  budgetMs: number;
  /** 새 단계 상한(UTC ISO) — 브리핑 마감 + FOOTBALL_STAGES_GRACE_MS */
  capAt: string;
}): number {
  const untilCap = parseUtcIso(input.capAt).getTime() - input.wallNow.getTime();
  return input.clockNow + Math.max(0, Math.min(input.budgetMs, untilCap));
}

/** 새 단계 상한 시각 = 브리핑 마감 + 3분 */
export function footballStagesCapAt(briefDeadline: string): string {
  return nowUtcIso(
    new Date(parseUtcIso(briefDeadline).getTime() + FOOTBALL_STAGES_GRACE_MS),
  );
}

/** 대회 파일들 → 미등록 이름 후보(대회별 득점 순위 상위 n명, 파일 순서 = 순위 순) */
export function scorerNameObservations(
  files: readonly Pick<CompetitionFile, "scorers">[],
  perComp: number = SCORER_NAMES_PER_COMP,
): UnknownNameObservation[] {
  const seen = new Set<string>();
  const out: UnknownNameObservation[] = [];
  for (const file of files) {
    for (const s of file.scorers.slice(0, perComp)) {
      if (seen.has(s.player)) continue;
      seen.add(s.player);
      out.push({ name: s.player, kind: "player" });
    }
  }
  return out;
}

// ─── 백필 캐시 (순수 + 파일) ─────────────────────────────────────────────

/**
 * 받아 본 id 기록 갱신 — 이번에 응답을 받은 id(`tried`)는 시각을 지금으로, 보존 기간(30일)이 지난 항목은 지운다. id 순 정렬.
 * 바뀐 것이 없으면 changed false(다시 쓰지 않는다). 항목이 없고 이전 파일도 없으면 file null(만들지 않는다).
 */
export function updateLineupBackfillCache(
  previous: LineupBackfillFile | null,
  tried: readonly number[],
  nowIso: string,
): { file: LineupBackfillFile | null; changed: boolean; pruned: number } {
  const cutoff =
    parseUtcIso(nowIso).getTime() - LINEUP_BACKFILL_CACHE_DAYS * 86_400_000;
  const byId = new Map<number, string>();
  let pruned = 0;
  for (const e of previous?.fixtures ?? []) {
    if (parseUtcIso(e.at).getTime() < cutoff) pruned += 1;
    else byId.set(e.id, e.at);
  }
  for (const id of tried) byId.set(id, nowIso);
  const fixtures = [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, at]) => ({ id, at }));
  if (fixtures.length === 0 && previous === null) {
    return { file: null, changed: false, pruned };
  }
  const changed =
    previous === null ||
    JSON.stringify(previous.fixtures) !== JSON.stringify(fixtures);
  return {
    file: {
      updatedAt: changed ? nowIso : (previous?.updatedAt ?? nowIso),
      fixtures,
    },
    changed,
    pruned,
  };
}

/** 백필 캐시 읽기 — 없으면 null, 깨졌으면 error(빈 기록으로 진행 — 이번 쓰기가 고친다) */
export async function readLineupBackfillCache(
  dataDir: string,
): Promise<{ value: LineupBackfillFile | null; error: string | null }> {
  let text: string;
  try {
    text = await readFile(lineupBackfillPath(dataDir), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { value: null, error: null };
    }
    return { value: null, error: errorText(error) };
  }
  try {
    const parsed = LineupBackfillFileSchema.safeParse(JSON.parse(text));
    return parsed.success
      ? { value: parsed.data, error: null }
      : {
          value: null,
          error: parsed.error.issues[0]?.message ?? "스키마 오류",
        };
  } catch {
    return { value: null, error: "JSON 파싱 실패" };
  }
}

export async function writeLineupBackfillCache(
  dataDir: string,
  file: LineupBackfillFile,
): Promise<string> {
  const valid = LineupBackfillFileSchema.parse(file);
  const target = lineupBackfillPath(dataDir);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

// ─── 대회 단계 ───────────────────────────────────────────────────────────

/** 대회 1개 결과(로그·실행 상태·이슈용 — 파일 내용은 `files`) */
export interface CompetitionCollectResult {
  comp: CompId;
  /** write = 파일을 썼다 · keep = 세 조각 모두 실패라 전일 파일 유지 · error = 조립·쓰기 오류(전일 파일 유지) */
  action: "write" | "keep" | "error";
  failures: PartFailure[];
  /** 이전 값을 유지한 조각 */
  kept: CompetitionPart[];
  error: string | null;
}

export type CompetitionsCollectOutcome =
  | {
      state: "skipped";
      reason: FootballStageSkipReason;
      apiCalls: 0;
      elapsedMs: 0;
    }
  | {
      state: "failed";
      errorType: "setup" | "unexpected";
      error: string;
      apiCalls: number;
      elapsedMs: number;
    }
  | {
      state: "done";
      results: CompetitionCollectResult[];
      /** 이번에 쓴 파일(미등록 이름 후보 입력) */
      files: CompetitionFile[];
      apiCalls: number;
      retries: number;
      elapsedMs: number;
    };

export function skippedCompetitions(
  reason: FootballStageSkipReason,
): CompetitionsCollectOutcome {
  return { state: "skipped", reason, apiCalls: 0, elapsedMs: 0 };
}

/**
 * 대회 단계 — football-data 대회당 3요청 → data/competitions/{comp}.json. 던지지 않는다.
 * `notBefore`(fd 시계 ms)는 앞선 football-data 클라이언트의 마지막 응답 + 간격, `capAt`은 새 단계 상한(UTC ISO).
 * 호출 수는 `sink.apiCalls.footballData`에 더한다(실패해도 — 실행 기록).
 */
export async function runCompetitionsCollectStage(
  deps: FootballStagesDeps,
  input: {
    notBefore: number | null;
    capAt: string;
    sink: { apiCalls: { footballData: number } };
  },
): Promise<CompetitionsCollectOutcome> {
  const log = deps.logger;
  const now = deps.footballDataNow ?? Date.now;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  const apiKey = deps.footballDataApiKey?.trim();
  if (!apiKey) return skippedCompetitions("no-api-key");
  let competitions: CompetitionsFile;
  let teams: ReturnType<typeof buildTeamIdIndex>;
  try {
    competitions = await readConfigFile(
      deps.rootDir,
      "competitions.json",
      CompetitionsFileSchema,
    );
    teams = buildTeamIdIndex(await loadTeamIds(deps.rootDir));
  } catch (error) {
    log.error("collect.competitions.fail", {
      stage: "setup",
      error: errorText(error),
    });
    return {
      state: "failed",
      errorType: "setup",
      error: errorText(error),
      apiCalls: 0,
      elapsedMs: elapsed(),
    };
  }
  const deadline = stageDeadline({
    clockNow: started,
    wallNow: deps.now(),
    budgetMs: COMPETITIONS_STAGE_BUDGET_MS,
    capAt: input.capAt,
  });
  log.info("collect.competitions.start", {
    comps: competitions.map((c) => c.id),
    budgetMs: deadline - started,
    waitMs:
      input.notBefore === null ? 0 : Math.max(0, input.notBefore - started),
    capAt: input.capAt,
  });
  const client = createFootballDataClient({
    apiKey,
    fetch: deps.fetch,
    sleep: deps.footballDataSleep,
    now,
    deadline,
    notBefore: input.notBefore,
    onRetry: (event) =>
      log.warn("collect.competition.retry", {
        path: event.path,
        retry: event.retry,
        errorType: event.error.kind,
        status: event.error.status ?? null,
        delayMs: event.delayMs,
      }),
  });
  try {
    const stage = await fetchCompetitionFiles({
      client,
      competitions,
      teams,
      now: deps.now,
      log,
      readPrevious: async (comp) => {
        const read = await readCompetitionFile(deps.dataDir, comp);
        if (read.status === "invalid") {
          log.warn("collect.competition.previous-invalid", {
            comp,
            error: read.error,
          });
        }
        return read.status === "ok" ? read.file : null;
      },
    });
    const results: CompetitionCollectResult[] = [];
    const files: CompetitionFile[] = [];
    for (const r of stage.results) {
      const o = r.outcome;
      if (o.action === "keep" || o.action === "error") {
        const error = o.action === "error" ? o.error : null;
        log.warn("collect.competition.keep", {
          comp: r.comp,
          reason: o.action === "keep" ? o.reason : error,
        });
        results.push({
          comp: r.comp,
          action: o.action,
          failures: r.failures,
          kept: [],
          error,
        });
        continue;
      }
      try {
        await writeCompetitionFile(deps.dataDir, o.file);
        files.push(o.file);
        results.push({
          comp: r.comp,
          action: "write",
          failures: r.failures,
          kept: o.kept,
          error: null,
        });
        log.info("collect.competition.write", {
          comp: r.comp,
          file: `data/competitions/${r.comp.toLowerCase()}.json`,
          updatedAt: o.file.updatedAt,
        });
      } catch (error) {
        log.error("collect.competition.write.fail", {
          comp: r.comp,
          error: errorText(error),
        });
        results.push({
          comp: r.comp,
          action: "error",
          failures: r.failures,
          kept: [],
          error: `쓰기: ${errorText(error)}`,
        });
      }
    }
    return {
      state: "done",
      results,
      files,
      apiCalls: stage.apiCalls,
      retries: stage.retries,
      elapsedMs: elapsed(),
    };
  } catch (error) {
    // 방어선 — fetchCompetitionFiles는 던지지 않는다. 여기 오면 예상 밖 오류(코드 버그)
    log.error("collect.competitions.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    return {
      state: "failed",
      errorType: "unexpected",
      error: errorText(error),
      apiCalls: client.calls,
      elapsedMs: elapsed(),
    };
  } finally {
    input.sink.apiCalls.footballData += client.calls;
  }
}

// ─── 팀 단계 + 라인업 백필 ───────────────────────────────────────────────

export interface LineupBackfillOutcome {
  state: "done" | "skipped";
  reason: LineupBackfillSkipReason | null;
  /** 허용 건수 */
  allowed: number;
  planned: number;
  /** 종료 상세를 받은 경기 수 */
  fetched: number;
  /** 응답 종류별 건수(finished·not-finished·invalid·missing) */
  results: Record<string, number>;
  /** 요청 실패(재시도 뒤) — 받아 본 id로 남기지 않는다(다음 실행이 다시 고를 수 있다) */
  errors: Array<{ match: number; errorType: string }>;
  /** 허용량을 넘어 남은 팀 수 */
  pending: number;
  /** 캐시 때문에 고르지 않은 id 수 */
  excluded: number;
  apiCalls: number;
  cacheReadError: string | null;
  cacheWritten: boolean;
  cacheWriteError: string | null;
}

function skippedBackfill(
  reason: LineupBackfillSkipReason,
): LineupBackfillOutcome {
  return {
    state: "skipped",
    reason,
    allowed: 0,
    planned: 0,
    fetched: 0,
    results: {},
    errors: [],
    pending: 0,
    excluded: 0,
    apiCalls: 0,
    cacheReadError: null,
    cacheWritten: false,
    cacheWriteError: null,
  };
}

export type TeamsCollectOutcome =
  | { state: "skipped"; reason: FootballStageSkipReason }
  | {
      state: "failed";
      mode: "write" | "preview";
      errorType: "setup" | "unexpected";
      error: string;
      backfill: LineupBackfillOutcome;
      elapsedMs: number;
    }
  | {
      state: "done";
      mode: "write" | "preview";
      stats: TeamFilesStats;
      /** 이번 실행 상세에서 뽑은 팀시트 후보 수(백필 포함) */
      sheets: number;
      /** 설정이 어긋나 만들지 못한 팀(전일 파일 유지) */
      problems: string[];
      /** 내용이 바뀌어 쓴 파일 수(preview는 0) */
      written: number;
      writeErrors: string[];
      /** team-ids에 없는 옛 slug 파일(지우지 않는다 — 검증 게이트가 오류로 알린다) */
      stale: string[];
      backfill: LineupBackfillOutcome;
      elapsedMs: number;
    };

/**
 * 팀 단계 — configs + 원장(디스크 + 이번 실행 메모리 항목) + 대회 파일 + 이전 팀 파일 + 팀시트(이번 API-Football 상세 + 백필) →
 * data/teams/<slug>.json(write 모드만, 내용이 같으면 쓰지 않음). 던지지 않는다. 백필 호출 수는 `sink.apiCalls.apiFootball`에 더한다.
 */
export async function runTeamsCollectStage(
  deps: FootballStagesDeps,
  input: {
    mode: "write" | "preview";
    /** 이번 실행 API-Football 단계의 종료 상세 */
    details: readonly MatchDetail[];
    /** 원장에 쓰지 않은(dry·dev) 이번 실행 원장 항목 — 디스크 원장에 겹치면 이 값이 이긴다 */
    ledgerExtra: readonly LedgerMatch[];
    backfill: { count: number; reason: LineupBackfillSkipReason | null };
    /** API-Football 단계가 끝난 시각(af 시계 ms) + 간격 — 백필 첫 요청 하한 */
    afNotBefore: number | null;
    capAt: string;
    sink: { apiCalls: { apiFootball: number } };
  },
): Promise<TeamsCollectOutcome> {
  const log = deps.logger;
  const clock = deps.apiFootballNow ?? Date.now;
  const started = clock();
  const elapsed = () => Math.max(0, clock() - started);
  const warn = (event: string, fields: Record<string, unknown>) =>
    log.warn(event, fields);
  let backfill = skippedBackfill(input.backfill.reason ?? "not-write");
  let base: TeamFilesInput;
  let compByLeague: Map<number, CompId>;
  try {
    const [teamIds, names, colors, koreanPlayers, competitionsCfg, formations] =
      await Promise.all([
        loadTeamIds(deps.rootDir),
        readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
        readConfigFile(deps.rootDir, "team-colors.json", TeamColorsFileSchema),
        readConfigFile(
          deps.rootDir,
          "korean-players.json",
          KoreanPlayersFileSchema,
        ),
        readConfigFile(
          deps.rootDir,
          "competitions.json",
          CompetitionsFileSchema,
        ),
        readFormations(deps.rootDir),
      ]);
    const ledger = await readLedgerAll(deps.dataDir);
    const merged = new Map(ledger.matches.map((m) => [m.id, m]));
    for (const m of input.ledgerExtra) merged.set(m.id, m);
    base = {
      slugs: allTeamSlugs(),
      teamIds,
      names,
      colors,
      koreanPlayers,
      formations,
      ledger: [...merged.values()],
      season:
        ledger.season ??
        (competitionsCfg.length > 0
          ? Math.max(...competitionsCfg.map((c) => c.season))
          : null),
      competitions: await readCompetitionFiles(deps.dataDir, warn),
      previous: await readPreviousTeams(deps.dataDir, warn),
      sheets: [],
    };
    compByLeague = new Map(
      competitionsCfg.map((c) => [c.apiFootballLeagueId, c.id]),
    );
  } catch (error) {
    log.error("collect.teams.fail", {
      stage: "setup",
      error: errorText(error),
    });
    return {
      state: "failed",
      mode: input.mode,
      errorType: "setup",
      error: errorText(error),
      backfill,
      elapsedMs: elapsed(),
    };
  }
  try {
    const sheetCtx = {
      afToSlug: afToSlugOf(base.teamIds),
      koreanByAfId: koreanByAfIdOf(base.koreanPlayers),
    };
    const extract = teamSheetsFromDetails(input.details, sheetCtx);
    const first = buildTeamFiles({ ...base, sheets: extract.sheets });
    let sheets = extract.sheets;
    let result = first;
    if (input.backfill.count > 0) {
      const run = await runLineupBackfill(deps, {
        count: input.backfill.count,
        teams: first.teams,
        uses: first.uses,
        priority: lineupBackfillPriority({
          slugs: base.slugs,
          koreanPlayers: base.koreanPlayers,
          competitions: base.competitions,
        }),
        compByLeague,
        notBefore: input.afNotBefore,
        capAt: input.capAt,
        sink: input.sink,
      });
      backfill = run.outcome;
      if (run.details.length > 0) {
        const more = teamSheetsFromDetails(run.details, sheetCtx);
        sheets = [...sheets, ...more.sheets];
        result = buildTeamFiles({ ...base, sheets });
      }
    }
    for (const p of result.problems)
      log.error("collect.teams.problem", { problem: p });
    const written: string[] = [];
    const writeErrors: string[] = [];
    if (input.mode === "write") {
      for (const team of result.teams) {
        try {
          if (await writeTeamFileIfChanged(deps.dataDir, team)) {
            written.push(team.slug);
          }
        } catch (error) {
          writeErrors.push(`${team.slug}: ${errorText(error)}`);
        }
      }
      for (const e of writeErrors.slice(0, 5)) {
        log.error("collect.teams.write.fail", { error: e });
      }
    }
    const stale = [...base.previous.keys()].filter(
      (s) => !base.slugs.includes(s),
    );
    if (stale.length > 0)
      log.warn("collect.teams.stale-files", { slugs: stale });
    log.info("collect.teams.done", {
      mode: input.mode,
      ...result.stats,
      sheets: sheets.length,
      sheetSkipped: extract.skipped.length,
      problems: result.problems.length,
      written: written.length,
      writtenSlugs: written.slice(0, 20),
      writeErrors: writeErrors.length,
      backfill:
        backfill.state === "done" ? "done" : `skipped:${backfill.reason}`,
      backfillCalls: backfill.apiCalls,
      elapsedMs: elapsed(),
    });
    return {
      state: "done",
      mode: input.mode,
      stats: result.stats,
      sheets: sheets.length,
      problems: result.problems,
      written: written.length,
      writeErrors,
      stale,
      backfill,
      elapsedMs: elapsed(),
    };
  } catch (error) {
    log.error("collect.teams.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    return {
      state: "failed",
      mode: input.mode,
      errorType: "unexpected",
      error: errorText(error),
      backfill,
      elapsedMs: elapsed(),
    };
  }
}

/** 한도·키·플랜·상한·시간 예산 오류 — 남은 백필 요청을 보내지 않는다 */
const BACKFILL_STOP_KINDS: ReadonlySet<string> = new Set([
  "plan",
  "quota",
  "auth",
  "cap",
  "budget",
  "rate",
  "cancelled",
]);

async function runLineupBackfill(
  deps: FootballStagesDeps,
  input: {
    count: number;
    teams: Parameters<typeof planLineupBackfill>[0]["teams"];
    uses: Parameters<typeof planLineupBackfill>[0]["uses"];
    priority: readonly string[];
    compByLeague: ReadonlyMap<number, CompId>;
    notBefore: number | null;
    capAt: string;
    sink: { apiCalls: { apiFootball: number } };
  },
): Promise<{ outcome: LineupBackfillOutcome; details: MatchDetail[] }> {
  const log = deps.logger;
  const apiKey = deps.apiFootballApiKey?.trim();
  if (!apiKey) {
    return { outcome: skippedBackfill("no-api-key"), details: [] };
  }
  const cache = await readLineupBackfillCache(deps.dataDir);
  if (cache.error !== null) {
    log.warn("collect.teams.backfill.cache-unreadable", {
      file: "data/cache/lineup-backfill.json",
      error: cache.error,
    });
  }
  const exclude = new Set((cache.value?.fixtures ?? []).map((f) => f.id));
  const all = planLineupBackfill({
    teams: input.teams,
    uses: input.uses,
    priority: input.priority,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const plan = planLineupBackfill({
    teams: input.teams,
    uses: input.uses,
    priority: input.priority,
    limit: input.count,
    exclude,
  });
  const excluded = all.targets.filter((t) => exclude.has(t.matchId)).length;
  const outcome: LineupBackfillOutcome = {
    state: "done",
    reason: null,
    allowed: input.count,
    planned: plan.targets.length,
    fetched: 0,
    results: {},
    errors: [],
    pending: plan.pending.length,
    excluded,
    apiCalls: 0,
    cacheReadError: cache.error,
    cacheWritten: false,
    cacheWriteError: null,
  };
  const details: MatchDetail[] = [];
  const tried: number[] = [];
  if (plan.targets.length > 0) {
    const clock = deps.apiFootballNow ?? Date.now;
    const client = createApiFootballClient({
      apiKey,
      fetch: deps.fetch,
      sleep: deps.apiFootballSleep,
      now: clock,
      deadline: stageDeadline({
        clockNow: clock(),
        wallNow: deps.now(),
        budgetMs: LINEUP_BACKFILL_BUDGET_MS,
        capAt: input.capAt,
      }),
      maxCalls: input.count,
      notBefore: input.notBefore,
      onRetry: (e) =>
        log.warn("collect.teams.backfill.retry", {
          path: e.path,
          retry: e.retry,
          errorType: e.error.kind,
          status: e.error.status ?? null,
        }),
    });
    try {
      for (const target of plan.targets) {
        try {
          const raw = await client.getFixtureById(target.matchId);
          const converted =
            raw === null || raw === undefined
              ? null
              : toMatchDetail(raw, {
                  compByLeague: input.compByLeague,
                  fetchedAt: nowUtcIso(deps.now()),
                });
          const kind = converted?.kind ?? "missing";
          outcome.results[kind] = (outcome.results[kind] ?? 0) + 1;
          tried.push(target.matchId);
          if (converted?.kind === "finished") details.push(converted.detail);
          log.info("collect.teams.backfill.fixture", {
            match: target.matchId,
            teams: target.teams,
            result: kind,
          });
        } catch (error) {
          const kind =
            error instanceof ApiFootballError ? error.kind : "unexpected";
          outcome.errors.push({ match: target.matchId, errorType: kind });
          log.warn("collect.teams.backfill.error", {
            match: target.matchId,
            errorType: kind,
          });
          if (BACKFILL_STOP_KINDS.has(kind)) break;
        }
      }
    } finally {
      outcome.apiCalls = client.calls;
      input.sink.apiCalls.apiFootball += client.calls;
    }
  }
  outcome.fetched = details.length;
  const update = updateLineupBackfillCache(
    cache.value,
    tried,
    nowUtcIso(deps.now()),
  );
  if (update.file !== null && (update.changed || cache.error !== null)) {
    try {
      await writeLineupBackfillCache(deps.dataDir, update.file);
      outcome.cacheWritten = true;
    } catch (error) {
      outcome.cacheWriteError = errorText(error);
      log.error("collect.teams.backfill.cache-write.fail", {
        file: "data/cache/lineup-backfill.json",
        error: errorText(error),
      });
    }
  }
  log.info("collect.teams.backfill.summary", {
    allowed: input.count,
    planned: plan.targets.length,
    fetched: details.length,
    results: outcome.results,
    errors: outcome.errors.length,
    pending: plan.pending.length,
    excluded,
    pruned: update.pruned,
    cacheWritten: outcome.cacheWritten,
    apiCalls: outcome.apiCalls,
  });
  return { outcome, details };
}

/** 앞 클라이언트가 끝난 시각 → 다음 클라이언트 첫 요청 하한(간격 6.5초 — 두 API 모두 같은 값) */
export function nextClientNotBefore(settledAt: number | null): number | null {
  return settledAt === null ? null : settledAt + FOOTBALL_DATA_MIN_INTERVAL_MS;
}

/** 수집 실행의 축구 데이터 단계 결과 */
export interface FootballStagesOutcome {
  plan: FootballStagesPlan;
  competitions: CompetitionsCollectOutcome;
  teams: TeamsCollectOutcome;
}

/** 로그 한 줄 요약 */
export function footballStagesLogFields(
  outcome: FootballStagesOutcome | null,
): Record<string, unknown> {
  if (outcome === null) return { competitions: null, teams: null };
  const c = outcome.competitions;
  const t = outcome.teams;
  return {
    competitions:
      c.state === "done"
        ? `done:${c.results.filter((r) => r.action === "write").length}/${c.results.length}`
        : c.state === "skipped"
          ? `skipped:${c.reason}`
          : `failed:${c.errorType}`,
    competitionsCalls: c.apiCalls,
    competitionsMs: c.elapsedMs,
    teams:
      t.state === "done"
        ? `${t.mode}:${t.written}`
        : t.state === "skipped"
          ? `skipped:${t.reason}`
          : `failed:${t.errorType}`,
    backfillCalls: t.state === "skipped" ? 0 : t.backfill.apiCalls,
  };
}

/** 사람이 읽는 dry 출력 */
export function formatFootballStagesSummary(
  outcome: FootballStagesOutcome,
): string {
  const lines = ["── [dry] 축구 데이터 단계 (M2-09)"];
  const c = outcome.competitions;
  lines.push(
    c.state === "skipped"
      ? `- 대회 단계: 건너뜀 (${c.reason})`
      : c.state === "failed"
        ? `- 대회 단계: 실패 (${c.errorType}: ${c.error})`
        : `- 대회 단계: ${c.results.map((r) => `${r.comp}:${r.action}`).join(" · ")} (요청 ${c.apiCalls})`,
  );
  const t = outcome.teams;
  lines.push(
    t.state === "skipped"
      ? `- 팀 단계: 건너뜀 (${t.reason})`
      : t.state === "failed"
        ? `- 팀 단계: 실패 (${t.errorType}: ${t.error})`
        : `- 팀 단계(${t.mode === "write" ? "씀" : "쓰지 않음"}): 팀 ${t.stats.teams} · 포메이션 api ${t.stats.formation.api}/manual ${t.stats.formation.manual}/none ${t.stats.formation.none} · 팀시트 ${t.stats.lineup} · 이번 후보 ${t.sheets} · 문제 ${t.problems.length} · 백필 ${t.backfill.state === "done" ? `${t.backfill.fetched}/${t.backfill.planned}` : `건너뜀(${t.backfill.reason})`}`,
  );
  return lines.join("\n");
}
