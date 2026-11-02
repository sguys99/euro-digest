/**
 * 주간 단계 team-profiles — 팀 한줄평 + 강점/약점 `data/teams/<slug>.json`의 `profile` (M4-06 — PRD FR-53·FR-56, §9.1, §15 D28).
 * 규칙(대상·지표·묶음·출력·검증·반영)은 team-profile.ts 순수 함수, 여기는 읽기 → 판정 → LLM(Batches) → 쓰기만 한다.
 *
 * 흐름
 *   ① 읽기: 대회 파일(data/competitions — 없거나 깨진 대회는 경고 후 빠지고 그 대회 팀은 대상 밖) + 팀 파일(data/teams — 하나도
 *      못 읽으면 던진다: 단계 실패) + 사전(configs names.ko·competitions — 입력 밖 이름 검사, 깨졌으면 던진다).
 *   ② 이미 했음: force가 아니고 대상 팀이 모두 이번 주(그 주차 다음 월요일 KST 이후) 생성 프로필을 갖고 있으면 건너뛴다
 *      (같은 주 수동 재실행에서 다시 과금하지 않게).
 *   ③ LLM(호출 지점 #2 — Message Batches API, D28): 대상 팀을 20팀 묶음으로 나눠 **배치 1개**(요청 = 묶음 수)로 보낸다. 지시문 캐싱 켬.
 *      시도마다 최악값 예상(배치 50%)을 출력하고 `ctx.budget.check`(runs.json + runs-dev.json — 판정 불가도 LLM 없이) → `runBatch`
 *      (단계 시작 + LLM 창 안에서 폴링). 결과는 팀 단위로 판정(team-profile.ts judgeGroup)하고, **실패한 팀만 모아** 남은 시간이 재시도
 *      최소 시간 이상일 때 1회 다시 보낸다(합쳐 2회). 새 배치가 중복 과금되지 않는 실패에서만 다시 낸다 — weekly-kr-stage.ts
 *      batchFailurePlan과 같은 규칙(연결 오류·타임아웃·예상 밖 오류는 다시 내지 않음, 상태 조회 실패·마감 초과는 그 배치를 취소하고
 *      처리된 결과의 비용을 기록). 부른 결과는 성공·실패 모두 `ctx.llm.addResults`(dry여도 — CLAUDE.md §1-4).
 *   ④ 반영(team-profile.ts decideProfile): 통과한 팀은 새 프로필(generatedAt = 단계 시각 UTC), 실패·대상 밖 팀은 템플릿 없이 이전 값
 *      (21일 안) 또는 null. 일부 팀만 실패해도 단계는 성공(partial은 counts·note로 남긴다) — 한 팀의 실패가 다른 팀의 발행을 막지 않는다.
 *   ⑤ 쓰기: dry가 아니면 끝에 한 번 — 바뀐 팀 파일만, 팀 스키마로 모두 검증한 뒤(임시 파일 → rename, team-files-io.ts).
 *      profile 밖의 값은 읽은 파일 그대로다(같은 실행 앞 단계 analysis-blogs가 바꾼 reading 포함 — 단계는 순서대로 돈다).
 *
 * data/teams 공유(weekly-stages.ts sharedWrites): 일일 수집과 analysis-blogs도 이 폴더를 쓴다. 이 단계가 실패하면 Actions가 data/teams를
 * main 상태로 되돌리므로 같은 실행의 analysis-blogs reading 갱신도 함께 사라진다(반대도 같다) — 그 주 갱신이 한 주 늦어질 뿐 이전 값은
 * 남는다. 이 단계는 실패를 줄이려고 팀 단위 실패를 단계 실패로 올리지 않는다(입력을 읽지 못함·시간 상한만 단계 실패).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  TeamSchema,
  type Team,
} from "@/lib/schema";
import { kstDate, nowUtcIso, shiftDate, utcDate } from "@/lib/time";

import { readConfigFile } from "./config-files";
import {
  LlmMockFixtureError,
  LlmRequestError,
  LlmTransportError,
  type LlmClient,
  type LlmResult,
} from "./llm";
import { buildNameIndex } from "./names";
import {
  readCompetitionFiles,
  readPreviousTeams,
  writeTeamFileIfChanged,
} from "./team-files-io";
import {
  TEAM_PROFILE_MAX_ATTEMPTS,
  TEAM_PROFILE_PROMPT_PATH,
  buildProfileRequest,
  buildTeamMetrics,
  decideProfile,
  estimateProfileWorstCase,
  groupTeams,
  judgeGroup,
  profileNameList,
  profileOf,
  type EligibilityReason,
  type ProfileAction,
  type ProfileCheckContext,
  type ProfileItem,
  type TeamMetrics,
  type TeamOutcomeReason,
  type TeamProfile,
} from "./team-profile";
import { batchFailurePlan } from "./weekly-kr-stage";
import type { WeeklyStageContext, WeeklyStageReport } from "./weekly-stages";

/** 이 단계가 쓰는 폴더(weekly-stages.ts writes·sharedWrites) */
export const TEAM_PROFILE_TEAMS_DIR = "data/teams";

// ─── 시간 상한 (단계 timeoutMs 12분 안 — weekly-stages.ts) ─────────────────

/** 단계 시작부터 LLM(배치 제출·폴링·재시도)에 쓰는 시간 — 남은 시간은 취소 유예·쓰기 */
export const TEAM_PROFILE_LLM_WINDOW_MS = 10 * 60_000;
/** 첫 배치를 보낼 최소 남은 시간 */
export const TEAM_PROFILE_FIRST_MIN_MS = 60_000;
/** 재시도 배치를 보낼 최소 남은 시간 — M0-30 배치 완료 1분 50초~6분 33초 */
export const TEAM_PROFILE_RETRY_MIN_MS = 3 * 60_000;
/** 배치 상태 조회 간격(llm.ts 최소 5초) */
export const TEAM_PROFILE_POLL_INTERVAL_MS = 15_000;
/** 마감 초과·조회 실패 배치 취소 뒤 끝나기를 기다리는 시간(처리된 결과 비용 기록용) */
export const TEAM_PROFILE_CANCEL_GRACE_MS = 45_000;

// ─── 결과 형식 ───────────────────────────────────────────────────────────

export type ProfileFailReason =
  | TeamOutcomeReason
  | "budget" // 비용 가드 초과 예상
  | "budget-unreadable" // runs 파일·예산 설정 판정 불가
  | "timeout" // LLM 창을 넘김·남은 시간 부족
  | "batch-failed" // 제출 실패(다시 내지 않음)·상태 조회 실패
  | "mock-missing"
  | "prompt-unreadable";

export interface ProfileAttemptLog {
  attempt: number;
  groups: number;
  teams: number;
  estimatedUsd: number;
  outcome:
    | "ok"
    | "budget"
    | "budget-unreadable"
    | "timeout"
    | "submit-failed"
    | "submit-unknown"
    | "poll-failed"
    | "mock-missing";
  batchId?: string;
  detail?: string;
  /** 이 시도에서 통과한 팀 수 */
  passed: number;
  /** 묶음별 토큰 — 출력 잘림·캐시 적중 확인용 */
  usage: Array<{
    customId: string;
    ok: boolean;
    in: number;
    out: number;
    cacheRead: number;
    cacheWrite: number;
    thinking: number;
    error?: string;
  }>;
}

export interface ComposeProfilesResult {
  /** slug → 통과한 출력 */
  passed: Map<string, ProfileItem>;
  /** slug → 최종 실패 사유·상세 */
  failed: Map<string, { reason: ProfileFailReason; detail?: string }>;
  attempts: ProfileAttemptLog[];
}

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

// ─── LLM ────────────────────────────────────────────────────────────────

/**
 * 대상 팀 → 프로필 출력(머리 주석 ③). 던지지 않는다 — 실패한 팀은 failed에 사유와 함께 남는다.
 * `stageStartMs`: 단계 시작 시각(ctx.now 기준) — LLM 창 계산. `label`: customId 라벨(주차).
 */
export async function composeTeamProfiles(
  ctx: WeeklyStageContext,
  targets: readonly TeamMetrics[],
  system: string,
  check: ProfileCheckContext,
  stageStartMs: number,
  label: string = ctx.week,
): Promise<ComposeProfilesResult> {
  const log = ctx.logger;
  const passed = new Map<string, ProfileItem>();
  const failed = new Map<
    string,
    { reason: ProfileFailReason; detail?: string }
  >();
  const attempts: ProfileAttemptLog[] = [];
  const deadlineMs = stageStartMs + TEAM_PROFILE_LLM_WINDOW_MS;
  let pending: TeamMetrics[] = [...targets];
  let client: LlmClient | null = null;
  const failAll = (
    list: readonly TeamMetrics[],
    reason: ProfileFailReason,
    detail?: string,
  ) => {
    for (const m of list)
      failed.set(
        m.slug,
        detail === undefined ? { reason } : { reason, detail },
      );
  };

  for (
    let attempt = 1;
    attempt <= TEAM_PROFILE_MAX_ATTEMPTS && pending.length > 0;
    attempt += 1
  ) {
    const remaining = deadlineMs - ctx.now().getTime();
    const minMs =
      attempt === 1 ? TEAM_PROFILE_FIRST_MIN_MS : TEAM_PROFILE_RETRY_MIN_MS;
    if (ctx.signal.aborted || remaining < minMs) {
      log.info("weekly.team-profiles.attempt.skip", {
        attempt,
        remainingMs: remaining,
        teams: pending.length,
      });
      if (attempt === 1) failAll(pending, "timeout");
      break; // 재시도를 못 하면 앞 시도의 실패 사유가 남는다
    }
    const groups = groupTeams(pending, label, attempt);
    const requests = groups.map((g) => buildProfileRequest(g, system));
    const estimate = estimateProfileWorstCase(requests, ctx.llm.model);
    ctx.print(
      `[weekly] 팀 프로필 시도 ${attempt}/${TEAM_PROFILE_MAX_ATTEMPTS} (Batches, ${ctx.llm.model}, 지시문 캐싱) — ${pending.length}팀 · ${requests.length}요청 · 예상 최악: 입력 약 ${(estimate.tokens.in + estimate.tokens.cacheWrite).toLocaleString("en-US")}토큰 · 출력 상한 ${estimate.tokens.out.toLocaleString("en-US")}토큰 · $${estimate.usd.toFixed(6)}`,
    );
    const entry: ProfileAttemptLog = {
      attempt,
      groups: groups.length,
      teams: pending.length,
      estimatedUsd: estimate.usd,
      outcome: "ok",
      passed: 0,
      usage: [],
    };
    attempts.push(entry);

    try {
      const verdict = await ctx.budget.check(estimate.usd);
      if (!verdict.allowed) {
        entry.outcome = "budget";
        entry.detail = verdict.reason;
        log.warn("weekly.team-profiles.budget.skip", {
          attempt,
          reason: verdict.reason,
          estimatedUsd: estimate.usd,
        });
        if (attempt === 1) failAll(pending, "budget", verdict.reason);
        break;
      }
    } catch (error) {
      entry.outcome = "budget-unreadable";
      entry.detail = errorText(error);
      log.error("weekly.team-profiles.budget.unreadable", {
        error: entry.detail,
      });
      if (attempt === 1) failAll(pending, "budget-unreadable", entry.detail);
      break;
    }

    let results: Map<string, LlmResult>;
    try {
      client ??= ctx.llm.createClient();
      const outcome = await client.runBatch(requests, {
        deadline: new Date(deadlineMs),
        intervalMs: TEAM_PROFILE_POLL_INTERVAL_MS,
      });
      entry.batchId = outcome.batchId;
      if (outcome.timedOut) {
        entry.outcome = "timeout";
        log.warn("weekly.team-profiles.batch.timeout", {
          attempt,
          batchId: outcome.batchId,
        });
        await cancelAndRecord(ctx, client, outcome.batchId);
        if (attempt === 1) failAll(pending, "timeout");
        break; // 마감을 넘겼다 — 재시도할 시간이 없다
      }
      ctx.llm.addResults(outcome.results.values());
      results = outcome.results;
      log.info("weekly.team-profiles.batch.done", {
        attempt,
        batchId: outcome.batchId,
        state: outcome.state,
        requests: requests.length,
        tokens: outcome.usage.total,
      });
    } catch (error) {
      if (error instanceof LlmMockFixtureError) {
        entry.outcome = "mock-missing";
        log.warn("weekly.team-profiles.mock-missing", { attempt });
        if (attempt === 1) failAll(pending, "mock-missing");
        break;
      }
      entry.detail =
        error instanceof LlmTransportError || error instanceof LlmRequestError
          ? errorText(error)
          : `예상 밖 오류: ${errorText(error)}`;
      const plan = batchFailurePlan(error);
      entry.outcome = plan.outcome;
      log.error("weekly.team-profiles.batch.fail", {
        attempt,
        outcome: plan.outcome,
        resubmit: plan.resubmit,
        ...(plan.batchId !== null ? { batchId: plan.batchId } : {}),
        error: entry.detail,
      });
      if (plan.batchId !== null && client !== null) {
        await cancelAndRecord(ctx, client, plan.batchId);
      }
      if (plan.batchId === null && !plan.resubmit) {
        ctx.print(
          `[weekly] 팀 프로필 배치 제출 결과를 알 수 없음(${entry.detail}) — 중복 과금을 피해 다시 내지 않는다. 배치가 생겼다면 Console에서 확인`,
        );
      }
      if (plan.resubmit) {
        failAll(pending, "batch-failed", entry.detail);
        continue; // 같은 팀으로 재시도(서버가 거부를 확정한 제출 — 과금 없음)
      }
      if (attempt === 1) failAll(pending, "batch-failed", entry.detail);
      break;
    }

    const next: TeamMetrics[] = [];
    for (const group of groups) {
      const r = results.get(group.customId);
      entry.usage.push({
        customId: group.customId,
        ok: r?.ok ?? false,
        in: r?.usage.in ?? 0,
        out: r?.usage.out ?? 0,
        cacheRead: r?.usage.cacheRead ?? 0,
        cacheWrite: r?.usage.cacheWrite ?? 0,
        thinking: r?.thinkingTokens ?? 0,
        ...(r && !r.ok ? { error: r.errorType } : {}),
      });
      const outcomes = judgeGroup(
        group,
        r === undefined
          ? { failure: "no-result" }
          : r.ok
            ? { text: r.text }
            : { failure: r.errorType },
        check,
      );
      for (const o of outcomes) {
        if (o.reason === "ok" && o.item) {
          passed.set(o.slug, o.item);
          failed.delete(o.slug);
          entry.passed += 1;
        } else {
          failed.set(
            o.slug,
            o.detail === undefined
              ? { reason: o.reason }
              : { reason: o.reason, detail: o.detail },
          );
          const m = group.teams.find((t) => t.metrics.slug === o.slug);
          if (m) next.push(m.metrics);
        }
      }
    }
    log.info("weekly.team-profiles.attempt.done", {
      attempt,
      passed: entry.passed,
      failed: next.length,
      usage: entry.usage,
    });
    pending = next;
  }
  return { passed, failed, attempts };
}

/** 마감 초과·조회 실패 배치 — 취소(남은 요청 과금 방지) → 짧게 기다려 처리된 결과의 비용만 기록. 던지지 않는다 */
async function cancelAndRecord(
  ctx: WeeklyStageContext,
  client: LlmClient,
  batchId: string,
): Promise<void> {
  try {
    await client.cancelBatch(batchId);
    const polled = await client.pollBatch(batchId, {
      deadline: new Date(ctx.now().getTime() + TEAM_PROFILE_CANCEL_GRACE_MS),
      intervalMs: 5_000,
    });
    if (polled.state !== "deadline") {
      ctx.llm.addResults((await client.collectBatchResults(batchId)).values());
    } else {
      ctx.logger.warn("weekly.team-profiles.cancel.pending", {
        batchId,
        note: "취소 처리 중 — 비용은 batchId로 나중에 확인",
      });
    }
  } catch (error) {
    ctx.logger.error("weekly.team-profiles.cancel.fail", {
      batchId,
      error: errorText(error),
    });
  }
}

// ─── 읽기 ────────────────────────────────────────────────────────────────

export interface TeamProfileInputs {
  teams: Map<string, Team>;
  targets: TeamMetrics[];
  /** 대상 밖 팀 → 사유 */
  skipped: Map<string, Exclude<EligibilityReason, "ok">>;
  check: ProfileCheckContext;
}

export async function loadTeamProfileInputs(
  ctx: Pick<WeeklyStageContext, "rootDir" | "dataDir" | "logger">,
): Promise<TeamProfileInputs> {
  const warn = (event: string, fields: Record<string, unknown>) =>
    ctx.logger.warn(event, fields);
  const [competitions, teams, namesFile, compConfig] = await Promise.all([
    readCompetitionFiles(ctx.dataDir, warn),
    readPreviousTeams(ctx.dataDir, warn),
    readConfigFile(ctx.rootDir, "names.ko.json", NamesKoFileSchema),
    readConfigFile(ctx.rootDir, "competitions.json", CompetitionsFileSchema),
  ]);
  if (teams.size === 0) {
    throw new Error(
      "data/teams에서 읽을 수 있는 팀 파일이 없다 — 팀 프로필을 만들 수 없다",
    );
  }
  const targets: TeamMetrics[] = [];
  const skipped = new Map<string, Exclude<EligibilityReason, "ok">>();
  for (const team of teams.values()) {
    const r = buildTeamMetrics(team, competitions);
    if (r.metrics) targets.push(r.metrics);
    else if (r.reason !== "ok") skipped.set(team.slug, r.reason);
  }
  return {
    teams,
    targets,
    skipped,
    check: { names: profileNameList(buildNameIndex(namesFile, compConfig)) },
  };
}

/** 이번 주 실행이 만든 프로필인가 — 그 주차 다음 월요일(KST) 이후 생성(머리 주석 ②) */
export function generatedThisRun(
  profile: Team["profile"],
  weekRange: { to: string },
): boolean {
  if (profile === null) return false;
  const monday = shiftDate(utcDate(weekRange.to), 1);
  return kstDate(profile.generatedAt) >= monday;
}

// ─── 단계 ────────────────────────────────────────────────────────────────

function previewLines(
  slug: string,
  nameKo: string,
  profile: TeamProfile,
): string {
  return [
    `  ${nameKo}(${slug}) — ${profile.oneLiner}`,
    `    강점: ${profile.strengths.join(" / ")}`,
    `    약점: ${profile.weaknesses.join(" / ")}`,
  ].join("\n");
}

/** 단계 함수(weekly-stages.ts team-profiles) */
export async function runTeamProfiles(
  ctx: WeeklyStageContext,
): Promise<WeeklyStageReport> {
  const started = ctx.now().getTime();
  const log = ctx.logger;
  const inputs = await loadTeamProfileInputs(ctx);
  const { teams, targets, skipped } = inputs;

  if (
    !ctx.force &&
    targets.length > 0 &&
    targets.every((m) =>
      generatedThisRun(teams.get(m.slug)?.profile ?? null, ctx.weekRange),
    )
  ) {
    return {
      outputs: [],
      counts: { targets: targets.length },
      note: `대상 ${targets.length}팀 모두 이번 주 프로필 있음 — 건너뜀(다시 만들려면 force)`,
    };
  }
  log.info("weekly.team-profiles.targets", {
    targets: targets.length,
    skipped: [...skipped.entries()].map(([slug, reason]) => ({ slug, reason })),
  });

  let composed: ComposeProfilesResult = {
    passed: new Map(),
    failed: new Map(),
    attempts: [],
  };
  if (targets.length > 0) {
    let system: string | null = null;
    try {
      system = (
        await readFile(path.join(ctx.rootDir, TEAM_PROFILE_PROMPT_PATH), "utf8")
      ).trim();
      if (!system) throw new Error(`${TEAM_PROFILE_PROMPT_PATH}가 비어 있다`);
    } catch (error) {
      log.error("weekly.team-profiles.prompt.fail", {
        error: errorText(error),
      });
      system = null;
    }
    composed =
      system === null
        ? {
            passed: new Map(),
            failed: new Map(
              targets.map((m) => [m.slug, { reason: "prompt-unreadable" }]),
            ),
            attempts: [],
          }
        : await composeTeamProfiles(
            ctx,
            targets,
            system,
            inputs.check,
            started,
          );
  }
  if (ctx.signal.aborted) throw new Error("단계 시간 상한 — 쓰지 않는다");

  // ④ 반영
  const generatedAt = nowUtcIso(ctx.now());
  const now = ctx.now();
  const actions: Record<ProfileAction, number> = {
    new: 0,
    kept: 0,
    cleared: 0,
    none: 0,
  };
  const next: Team[] = [];
  const preview: string[] = [];
  for (const team of teams.values()) {
    const item = composed.passed.get(team.slug);
    const fresh = item ? profileOf(item, generatedAt) : null;
    const decided = decideProfile({ previous: team.profile, fresh, now });
    actions[decided.action] += 1;
    if (fresh) preview.push(previewLines(team.slug, team.nameKo, fresh));
    next.push(TeamSchema.parse({ ...team, profile: decided.profile }));
  }
  const failedLines = [...composed.failed.entries()].map(
    ([slug, f]) => `  ${slug}: ${f.reason}${f.detail ? ` — ${f.detail}` : ""}`,
  );
  ctx.print(
    [
      `[weekly] 팀 프로필 — 대상 ${targets.length}팀(대상 밖 ${skipped.size}) · 통과 ${composed.passed.size} · 실패 ${composed.failed.size}${ctx.dry ? " · dry(쓰지 않음)" : ""}`,
      ...preview,
      ...(failedLines.length > 0 ? ["  [실패]", ...failedLines] : []),
    ].join("\n"),
  );

  // ⑤ 쓰기 — 모두 검증한 뒤 끝에 한 번
  const outputs: string[] = [];
  if (!ctx.dry) {
    for (const team of next) {
      if (await writeTeamFileIfChanged(ctx.dataDir, team)) {
        outputs.push(`${TEAM_PROFILE_TEAMS_DIR}/${team.slug}.json`);
      }
    }
  }
  const usage = composed.attempts.flatMap((a) => a.usage);
  const counts = {
    targets: targets.length,
    skipped: skipped.size,
    passed: composed.passed.size,
    failed: composed.failed.size,
    attempts: composed.attempts.length,
    requests: usage.length,
    cacheRead: usage.reduce((s, u) => s + u.cacheRead, 0),
    kept: actions.kept,
    cleared: actions.cleared,
    written: outputs.length,
  };
  log.info("weekly.team-profiles.done", { ...counts, dry: ctx.dry });
  return {
    outputs,
    counts,
    note: `통과 ${counts.passed}/${counts.targets}팀${counts.failed > 0 ? ` · 실패 ${counts.failed}(이전 값 유지 ${actions.kept} · 비움 ${actions.cleared})` : ""}${ctx.dry ? " · dry" : ""}`,
  };
}
