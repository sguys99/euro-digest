/**
 * 실행 로그 — `data/runs.json`(prod, 봇) · `data/runs-dev.json`(dev, 개발자 커밋)
 * (plan.md 부록 A, PRD FR-151·FR-11, CLAUDE.md §6.3). 각 최근 180일, 비용 가드는 두 파일 합산.
 */
import { z } from "zod";

import { IsoSchema } from "./common";

/** 실행 1회 (부록 A). */
export const RunLogSchema = z.object({
  runId: z.string(),
  env: z.enum(["dev", "prod"]),
  job: z.enum(["collect", "weekly"]),
  startedAt: IsoSchema,
  finishedAt: IsoSchema,
  collected: z.number(),
  clusters: z.number(),
  summarized: z.number(),
  downgraded: z.number(),
  tokens: z.object({
    in: z.number(),
    out: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }),
  costUsd: z.number(),
  apiCalls: z.object({ footballData: z.number(), apiFootball: z.number() }),
  sources: z.array(
    z.object({ id: z.string(), ok: z.boolean(), items: z.number() }),
  ),
  status: z.enum(["success", "partial", "failed", "skipped"]),
});
export type RunLog = z.infer<typeof RunLogSchema>;
export type RunEnv = RunLog["env"];

/** 파일 단위 검사: 파일과 env가 섞이지 않게 한다(runs.json = prod만, runs-dev.json = dev만). */
function runsFileSchema(env: RunEnv) {
  return z.array(RunLogSchema).superRefine((runs, ctx) => {
    runs.forEach((run, index) => {
      if (run.env !== env) {
        ctx.addIssue({
          code: "custom",
          path: [index, "env"],
          message: `이 파일에는 env "${env}" 실행만 기록한다 (받은 값: "${run.env}")`,
        });
      }
    });
  });
}

/** `data/runs.json` → RunLog[] (env: "prod"만). */
export const RunsFileSchema = runsFileSchema("prod");
/** `data/runs-dev.json` → RunLog[] (env: "dev"만). */
export const RunsDevFileSchema = runsFileSchema("dev");
export type RunsFile = z.infer<typeof RunsFileSchema>;
