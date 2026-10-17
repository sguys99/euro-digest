/**
 * 실행 로그 — `data/runs.json`(prod, 봇) · `data/runs-dev.json`(dev, 개발자 커밋)
 * (plan.md 부록 A, PRD FR-151·FR-11, CLAUDE.md §6.3). 각 최근 180일, 비용 가드는 두 파일 합산.
 */
import { z } from "zod";

import { IsoSchema } from "./common";

/**
 * 실행 1회의 소스별 기록 (부록 A, PRD FR-11·FR-151).
 * v0.1 — 2026-10-12 사용자 결정(PRD §15 D35): 선택 필드 `usable`·`error` 추가. 옛 기록(`{id, ok, items}`)도 그대로 유효하다
 * (마이그레이션 없음). 7일 성공률·수집 건수는 이 기록에서 계산하고 요약 필드를 따로 저장하지 않는다
 * (scripts/lib/source-health.ts).
 */
export const RunSourceSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  /** 피드 원문 항목 수(받기·파싱 실패면 0) */
  items: z.number(),
  /**
   * 수집 창 안의 새 항목 수 — 정규화·작성자 필터·수집 시간 창(M1-10) 적용 뒤, 중복 제거 전 이 소스의 건수.
   * 건강도 "새 기사 없음" 판정에 쓴다. 성공한 소스에만 적는다(실패한 소스는 받은 항목이 없다).
   */
  usable: z.number().int().min(0).optional(),
  /**
   * 실패 종류 — 실패한 소스에만 적는다. 피드 수집은 timeout·http-4xx·http-5xx·network·redirect·too-large·parse·
   * budget·unexpected(scripts/lib/feed-collect.ts `SourceErrorType`). `budget`(수집 시간 예산 소진으로 건너뜀)은
   * 소스 장애가 아니라서 건강도 계산에서 뺀다.
   */
  error: z.string().optional(),
});
export type RunSource = z.infer<typeof RunSourceSchema>;

/**
 * 실행 1회의 일일 브리핑 요청 기록 (부록 A — v0.1, 2026-10-17 사용자 결정 PRD §15 D56, FR-25 '하루 1~3요청'·FR-151).
 *   - `requests` — 이 실행이 **실제로 보낸** 브리핑 요청 수(LLM 호출 지점 #1, 단건). 셈: `callSingle` 1번 = 1건(FR-29 출력 재시도는
 *     따로 1건), 그 안의 전송 재시도(429·5xx — 서버가 처리하지 않아 과금 없음)는 세지 않는다. 응답을 받은 요청(성공·refusal·
 *     max_tokens·빈 출력 — 과금)과 응답 없이 끊긴 요청(연결 오류·타임아웃 — 서버가 처리했을 수 있음)은 센다. 마감·예산·하루 상한
 *     때문에 보내지 않은 요청, 서버가 오류 응답(4xx·429·5xx)만 돌려준 요청은 세지 않는다(scripts/lib/cost.ts isBriefRequestResult).
 *     같은 env·같은 브리핑 날짜(KST — 수집 실행 startedAt의 KST 날짜 = 발행일)의 collect 기록을 합산해 하루 상한 3을 지킨다
 *     (scripts/lib/brief-publish.ts briefDailyAllowance — eval 기록 `eval-…`은 상한 밖).
 *   - `unbilledRisk` — 응답 없이 끊긴 요청(연결 오류·타임아웃)의 추정 **최대** 사용량(입력 어림 + max_tokens 상한). 실측 비용
 *     `costUsd`(0으로 기록됨)와 섞지 않고 비용 가드에도 넣지 않는다(과금 여부를 알 수 없다 — 운영 리포트 M5-09가 본다).
 * 선택 필드라 마이그레이션은 없다 — 이전 기록(필드 없음)은 브리핑 요청 0건으로 본다. 근거: 필드가 없는 기록은 모두 D56 이전 날짜라
 * 앞으로의 하루 상한 판정(그날 기록만 합산)에 들어가지 않고, LLM을 부르지 않은 실행·mock 실행은 앞으로도 필드를 남기지 않는다(0건).
 */
export const RunBriefSchema = z.object({
  requests: z.number().int().min(0),
  unbilledRisk: z
    .object({
      requests: z.number().int().min(1),
      inputTokens: z.number().int().min(0),
      outputTokensMax: z.number().int().min(0),
      usdMax: z.number().min(0),
    })
    .optional(),
});
export type RunBrief = z.infer<typeof RunBriefSchema>;

/** 실행 1회 (부록 A). */
export const RunLogSchema = z.object({
  runId: z.string(),
  env: z.enum(["dev", "prod"]),
  job: z.enum(["collect", "weekly"]),
  startedAt: IsoSchema,
  finishedAt: IsoSchema,
  collected: z.number(),
  clusters: z.number(),
  summarized: z.number(), // LLM이 작성한 브리핑 줄 수 — 필드 이름은 옛 "요약"에서 왔고 유지한다(PRD §8.2, D24)
  downgraded: z.number(), // 코드 템플릿으로 강등된 브리핑 줄 수 (D24)
  tokens: z.object({
    in: z.number(),
    out: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }),
  costUsd: z.number(),
  apiCalls: z.object({ footballData: z.number(), apiFootball: z.number() }),
  sources: z.array(RunSourceSchema),
  status: z.enum(["success", "partial", "failed", "skipped"]),
  /** 일일 브리핑 요청 기록(D56 — 위 RunBriefSchema). 브리핑 요청을 보내지 않은 실행·옛 기록은 없음 = 0건 */
  brief: RunBriefSchema.optional(),
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
