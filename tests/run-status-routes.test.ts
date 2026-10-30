/**
 * partial 조건 표 ↔ 이슈 경로 고정 (M1-27 리뷰 권장 6 — FR-152). runStatus의 partial 조건(collect-run.ts RUN_PARTIAL_CONDITIONS)마다
 * 그 조건만 맞는 예시 실행을 두고, 표에 적힌 경로(부분 실패 이슈 사유 · 소스 이슈 · 이슈 없음)가 실제로 그 실행에서 사건을 만드는지
 * (none이면 만들지 않는지) 확인한다. 조건을 더하면 여기 예시가 없어서 첫 테스트가 실패한다 — partial이 이슈 없이 지나가지 않게.
 */
import { describe, expect, it } from "vitest";

import type { RunSource } from "@/lib/schema";

import { apiFootballIssuePayloads } from "../scripts/lib/api-football-stage";
import {
  RUN_PARTIAL_CONDITIONS,
  apiFootballIncomplete,
  partialConditionsOf,
  runStatus,
  type BriefOutcome,
  type RunStatusInput,
} from "../scripts/lib/collect-run";
import { PIPELINE_PARTIAL_REASONS } from "../scripts/lib/github-issues";
import { withPurgeStatus } from "../scripts/lib/purge-stage";
import {
  matchDataIssuePayloads,
  partialFindings,
} from "../scripts/lib/run-issues";
import {
  assessSourceHealth,
  healthIssuePayloads,
} from "../scripts/lib/source-health";

const DONE: BriefOutcome = { state: "done", inputMatches: 3, lines: ["a"] };
const FD_OK = {
  provider: "football-data" as const,
  state: "done" as const,
  data: { standingsFailed: [] },
  elapsedMs: 1,
};

/** API-Football 끝난 단계(최소 모양 — 판정·사건에 쓰는 필드만) */
function afDone(stage: {
  dates?: Array<{ date: string; ok: boolean }>;
  degraded?: unknown;
  stoppedBy?: string | null;
  outcomes?: Array<{ result: { kind: string } }>;
  issues?: Array<{ kind: string; endpoint: string; message: string }>;
}) {
  return {
    provider: "api-football" as const,
    state: "done" as const,
    data: {
      stage: {
        dates: stage.dates ?? [{ date: "2026-10-16", ok: true }],
        degraded: stage.degraded ?? null,
        stoppedBy: stage.stoppedBy ?? null,
        outcomes: stage.outcomes ?? [],
        issues: stage.issues ?? [],
      },
    },
    elapsedMs: 1,
  };
}

type Scenario = Omit<RunStatusInput, "matchData"> & {
  matchData: Record<string, unknown> | null;
};

/** 대회 단계(M2-09) 끝남 — EPL 1개 대회, 조각 실패 목록 */
function competitionsDone(
  failures: Array<{ part: string; errorType: string; error: string }>,
) {
  return {
    state: "done" as const,
    results: [{ comp: "EPL", action: "write", failures }],
  };
}

const TEAMS_OK = {
  state: "done" as const,
  problems: [] as string[],
  writeErrors: [] as string[],
  backfill: {
    errors: [] as Array<{ errorType: string }>,
    cacheWriteError: null,
  },
};

function base(over: Partial<Scenario> = {}): Scenario {
  return {
    news: {
      ok: true,
      sources: [{ ok: true }],
      seen: { readError: null, writeError: null },
      clusterError: null,
    },
    brief: DONE,
    matchData: { footballData: FD_OK, ledger: null },
    briefFile: { action: "written", readError: null },
    ...over,
  };
}

/** 조건 id → 그 조건만 맞는 실행 (표 순서와 같아야 한다) */
const SCENARIOS: Record<string, Scenario> = {
  "source-failed": base({
    news: {
      ok: true,
      sources: [{ ok: true }, { ok: false, errorType: "http-5xx" }],
    },
  }),
  "source-budget": base({
    news: {
      ok: true,
      sources: [{ ok: true }, { ok: false, errorType: "budget" }],
    },
  }),
  seen: base({
    news: {
      ok: true,
      sources: [{ ok: true }],
      seen: { readError: null, writeError: "ENOSPC" },
    },
  }),
  cluster: base({
    news: { ok: true, sources: [{ ok: true }], clusterError: "RangeError" },
  }),
  classify: base({
    news: { ok: true, sources: [{ ok: true }], classifyError: "TypeError" },
  }),
  "brief-failed": base({
    brief: {
      state: "failed",
      reason: "output",
      detail: "zod",
      inputMatches: 3,
    },
  }),
  // 고유명사 사전을 읽지 못해 LLM 없이 템플릿(M1-45 결정) — 부분 실패 이슈 brief
  "brief-names": base({
    brief: { state: "skipped", reason: "names-unreadable", inputMatches: 3 },
  }),
  // 브리핑 마감 강등(FR-26 — M1-45): 호출 전 시간 부족 · 마감에 걸린 요청 — 설계된 폴백이라 이슈 없음(partial만)
  "brief-deadline": base({
    brief: {
      state: "skipped",
      reason: "deadline",
      remainingMs: 12_000,
      inputMatches: 3,
    },
  }),
  "brief-football-data": base({
    brief: {
      state: "failed",
      reason: "football-data",
      detail: "HTTP 503",
      inputMatches: 0,
    },
    matchData: {
      footballData: {
        provider: "football-data",
        state: "failed",
        errorType: "http",
        error: "HTTP 503",
        elapsedMs: 1,
      },
    },
  }),
  "standings-failed": base({
    matchData: {
      footballData: {
        ...FD_OK,
        data: {
          standingsFailed: [
            { comp: "SA", errorType: "http", error: "HTTP 500" },
          ],
        },
      },
    },
  }),
  "football-data-no-key": base({
    brief: { state: "skipped", reason: "no-api-key", inputMatches: 0 },
    matchData: {
      footballData: {
        provider: "football-data",
        state: "skipped",
        reason: "no-api-key",
        elapsedMs: 0,
      },
    },
  }),
  "runs-unreadable": base({
    brief: {
      state: "skipped",
      reason: "budget",
      budget: {
        verdict: "runs_unreadable",
        estimatedUsd: 0.002,
        message: "runs-dev.json: 스키마 검증 실패",
      },
      inputMatches: 3,
    },
  }),
  "api-football-failed": base({
    matchData: {
      footballData: FD_OK,
      apiFootball: {
        provider: "api-football",
        state: "failed",
        errorType: "unexpected",
        error: "boom",
        elapsedMs: 1,
      },
    },
  }),
  "api-football-daily-cap": base({
    matchData: {
      footballData: FD_OK,
      apiFootball: {
        provider: "api-football",
        state: "skipped",
        reason: "daily-cap",
        elapsedMs: 0,
      },
    },
  }),
  "api-football-degraded": base({
    matchData: {
      footballData: FD_OK,
      apiFootball: afDone({
        degraded: { kind: "plan", endpoint: "date", message: "plan" },
        stoppedBy: "plan",
        issues: [
          {
            kind: "plan",
            endpoint: "date",
            message: "Free plans do not have access",
          },
        ],
      }),
    },
  }),
  "api-football-incomplete": base({
    matchData: {
      footballData: FD_OK,
      apiFootball: afDone({
        stoppedBy: "budget",
        outcomes: [{ result: { kind: "failed" } }],
      }),
    },
  }),
  "ledger-write": base({
    matchData: {
      footballData: FD_OK,
      ledger: { applied: { errors: ["2026-10.json: EACCES"] }, invalid: [] },
    },
  }),
  "ledger-invalid": base({
    matchData: {
      footballData: FD_OK,
      ledger: { applied: null, invalid: [{ id: 1, error: "kickoff" }] },
    },
  }),
  "brief-file": base({ briefFile: { action: "failed", readError: null } }),
  // M2-09 축구 데이터 단계 — 대회 조각의 football-data 응답 실패는 브리핑 쪽과 같은 원인 키(source:football-data)
  "competitions-api": base({
    football: {
      competitions: competitionsDone([
        { part: "matches", errorType: "http", error: "HTTP 500" },
      ]),
      teams: TEAMS_OK,
    },
  }),
  "competitions-budget": base({
    football: {
      competitions: competitionsDone([
        { part: "scorers", errorType: "budget", error: "예산 소진" },
      ]),
      teams: TEAMS_OK,
    },
  }),
  "football-stage": base({
    football: {
      competitions: competitionsDone([]),
      teams: {
        ...TEAMS_OK,
        problems: ["foo: names.ko.json 팀 항목(slug) 없음"],
      },
    },
  }),
  "lineup-backfill": base({
    football: {
      competitions: competitionsDone([]),
      teams: {
        ...TEAMS_OK,
        backfill: {
          errors: [{ errorType: "timeout" }],
          cacheWriteError: null,
        },
      },
    },
  }),
};

const asInput = (s: Scenario) => s as unknown as RunStatusInput;
const CTX = {
  occurredAt: "2026-10-16T21:41:00.000Z",
  runId: "collect-prod-20261016T213000Z-3fa2",
};

/** 그 실행이 실제로 내는 이슈 원인 키 — 부분 실패 · 데이터 API 소스 · 피드 소스 */
function issueKeysOf(s: Scenario): string[] {
  const input = asInput(s);
  const md = input.matchData;
  const partial = partialFindings({
    purge: null,
    news: input.news,
    brief: input.brief,
    briefFile: input.briefFile
      ? {
          ...input.briefFile,
          error: input.briefFile.action === "failed" ? "x" : null,
        }
      : null,
    ledger: md?.ledger ?? null,
    football: input.football ?? null,
  }).map((f) => `collect:partial:${f.reason}`);
  const af = md?.apiFootball;
  const dataApi = [
    ...matchDataIssuePayloads(
      md === null
        ? null
        : { ...md, competitions: input.football?.competitions ?? null },
      CTX,
    ),
    ...(af?.state === "done"
      ? apiFootballIssuePayloads(af.data.stage.issues, CTX)
      : []),
  ].map((p) => `source:${p.sourceId}`);
  const feedRecords: RunSource[] = (input.news.sources ?? []).map((src, i) =>
    src.ok
      ? { id: `feed-${i}`, ok: true, items: 10, usable: 2 }
      : {
          id: `feed-${i}`,
          ok: false,
          items: 0,
          error: src.errorType ?? "unexpected",
        },
  );
  const feed = healthIssuePayloads(
    assessSourceHealth({
      run: { runId: CTX.runId, startedAt: CTX.occurredAt },
      current: feedRecords,
      history: [],
    }),
    { sourceNames: new Map() },
  ).map((p) => `source:${p.sourceId}`);
  return [...partial, ...new Set([...dataApi, ...feed])];
}

describe("partial 조건 표 ↔ 이슈 경로 (FR-152 — partial이 이슈 없이 지나가지 않게)", () => {
  it("표의 모든 조건에 예시 실행이 있다(표 순서) — 조건을 더하면 여기에 예시와 경로 확인을 더할 것", () => {
    expect(RUN_PARTIAL_CONDITIONS.map((c) => c.id)).toEqual(
      Object.keys(SCENARIOS),
    );
  });

  it.each(RUN_PARTIAL_CONDITIONS.map((c) => [c.id, c] as const))(
    "%s: 그 조건만 맞고 partial이며, 표의 경로대로 이슈가 생긴다(none이면 생기지 않는다)",
    (id, condition) => {
      const scenario = SCENARIOS[id]!;
      const input = asInput(scenario);
      expect(partialConditionsOf(input)).toEqual([id]);
      expect(
        runStatus(
          input.news,
          input.brief,
          input.matchData,
          input.briefFile,
          input.football,
        ),
      ).toBe("partial");
      const keys = issueKeysOf(scenario);
      const route = condition.route;
      switch (route.kind) {
        case "pipeline-partial":
          expect(PIPELINE_PARTIAL_REASONS).toContain(route.reason);
          expect(keys).toEqual([`collect:partial:${route.reason}`]);
          break;
        case "source-broken":
          expect(keys).toEqual([
            route.source === "feed"
              ? "source:feed-1"
              : `source:${route.source}`,
          ]);
          break;
        case "none":
          expect(route.why.length).toBeGreaterThan(20);
          expect(keys).toEqual([]);
          break;
      }
    },
  );

  it("문제가 없으면 success(이슈 없음), 뉴스 실패면 failed — 표 밖 partial은 삭제 단계 오류(withPurgeStatus → 사유 purge)뿐", () => {
    const clean = asInput(base());
    expect(partialConditionsOf(clean)).toEqual([]);
    expect(
      runStatus(clean.news, clean.brief, clean.matchData, clean.briefFile),
    ).toBe("success");
    expect(issueKeysOf(base())).toEqual([]);
    expect(runStatus({ ...clean.news, ok: false }, clean.brief)).toBe("failed");
    const purge = { errors: [{ step: "write" as const, error: "EACCES" }] };
    expect(withPurgeStatus("success", purge)).toBe("partial");
    expect(
      partialFindings({
        purge,
        news: clean.news,
        brief: clean.brief,
        briefFile: null,
        ledger: null,
      }).map((f) => f.reason),
    ).toEqual(["purge"]);
  });

  it("브리핑 마감 강등(M1-45)은 skipped·failed 어느 모양이든 이슈가 없고, 마감이 아닌 실패(원인 output·transport·refusal)는 brief 이슈다", () => {
    const deadlineFailed = base({
      brief: {
        state: "failed",
        reason: "output",
        detail: "FR-29 재시도할 시간이 없다",
        inputMatches: 3,
        attempts: 1,
        cause: "deadline",
      },
    });
    expect(partialConditionsOf(asInput(deadlineFailed))).toEqual([
      "brief-deadline",
    ]);
    expect(issueKeysOf(deadlineFailed)).toEqual([]);
    for (const cause of [
      "output",
      "transport",
      "refusal",
      "max-tokens",
    ] as const) {
      const scenario = base({
        brief: {
          state: "failed",
          reason:
            cause === "transport" || cause === "refusal" ? "llm" : "output",
          detail: "x",
          inputMatches: 3,
          attempts: 2,
          cause,
        },
      });
      expect(partialConditionsOf(asInput(scenario)), cause).toEqual([
        "brief-failed",
      ]);
      expect(issueKeysOf(scenario), cause).toEqual(["collect:partial:brief"]);
    }
  });

  it("하루 요청 상한(D56 — skipped daily-cap · 재시도를 막은 failed cause daily-cap)은 의도된 제한 — success, 이슈 없음(예산 생략과 같다)", () => {
    for (const brief of [
      {
        state: "skipped" as const,
        reason: "daily-cap" as const,
        used: 3,
        cap: 3,
        inputMatches: 3,
      },
      {
        state: "failed" as const,
        reason: "output" as const,
        detail: "FR-29 재시도 몫 없음",
        inputMatches: 3,
        attempts: 1,
        cause: "daily-cap" as const,
      },
    ]) {
      const scenario = base({ brief });
      const input = asInput(scenario);
      expect(partialConditionsOf(input), brief.state).toEqual([]);
      expect(
        runStatus(input.news, input.brief, input.matchData, input.briefFile),
      ).toBe("success");
      expect(issueKeysOf(scenario)).toEqual([]);
    }
  });

  it("모든 부분 실패 사유는 표(또는 삭제 단계)에서 쓰인다 — 쓰이지 않는 사유가 남지 않게", () => {
    const used = new Set<string>(["purge"]);
    for (const c of RUN_PARTIAL_CONDITIONS) {
      if (c.route.kind === "pipeline-partial") used.add(c.route.reason);
    }
    expect([...used].sort()).toEqual([...PIPELINE_PARTIAL_REASONS].sort());
  });

  it("API-Football 조건 4개의 합 = apiFootballIncomplete(이전 판정과 같다)", () => {
    const cases = [
      SCENARIOS["api-football-failed"]!,
      SCENARIOS["api-football-daily-cap"]!,
      SCENARIOS["api-football-degraded"]!,
      SCENARIOS["api-football-incomplete"]!,
      base({ matchData: { footballData: FD_OK, apiFootball: afDone({}) } }),
      base({
        matchData: {
          footballData: FD_OK,
          apiFootball: afDone({ stoppedBy: "cancelled" }),
        },
      }),
      base({
        matchData: {
          footballData: FD_OK,
          apiFootball: afDone({ dates: [{ date: "2026-10-16", ok: false }] }),
        },
      }),
      base({
        matchData: {
          footballData: FD_OK,
          apiFootball: {
            provider: "api-football",
            state: "skipped",
            reason: "no-api-key",
            elapsedMs: 0,
          },
        },
      }),
    ];
    for (const scenario of cases) {
      const input = asInput(scenario);
      const af = input.matchData!.apiFootball!;
      const viaTable = partialConditionsOf(input).some((id) =>
        id.startsWith("api-football-"),
      );
      expect(viaTable).toBe(apiFootballIncomplete(af));
    }
  });
});
