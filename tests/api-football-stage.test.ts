/**
 * M1-48 API-Football 단계 실행 (scripts/lib/api-football-stage.ts) — 가짜 클라이언트·가상 시계, 네트워크 없음.
 *
 * 필수 항목: 날짜 조회(브리핑 날짜 먼저) → 상세 요청 우선순위(brief → window → requery), 브리핑 컷오프(그때까지 받은 brief
 * 계층만 넘기고 나머지는 계속), 단계 예산·호출 상한 이월, errors.plan → 재시도 없이 강등 + 이슈 사건, 일 한도·그 밖 errors 사건,
 * 연속 실패 차단기, 이월 재조회, 이슈 payload가 source-broken 스키마를 통과.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  TeamIdsFileSchema,
  type AfPendingEntry,
} from "@/lib/schema";

import { briefInputWindow } from "../scripts/lib/brief-input";
import {
  afQueryDates,
  buildAfTargetConfig,
} from "../scripts/lib/api-football-plan";
import {
  API_FOOTBALL_BREAKER_FAILURES,
  API_FOOTBALL_ISSUE_SOURCE_ID,
  apiFootballIssuePayloads,
  runApiFootballStage,
  type AfBriefSnapshot,
  type AfStageInput,
} from "../scripts/lib/api-football-stage";
import { SourceBrokenPayloadSchema } from "../scripts/lib/github-issues";
import {
  ApiFootballError,
  createApiFootballClient,
  type ApiFootballClient,
} from "../scripts/lib/providers/api-football";
import type { FetchLike } from "../scripts/lib/rss";

import {
  AF_DATE_ITEMS,
  afEnvelope,
  afFixtureResponse,
  afPath,
  readAfFixture,
} from "./support/api-football-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const { targets: TARGETS } = buildAfTargetConfig({
  competitions: CompetitionsFileSchema.parse(
    readJson("configs/competitions.json"),
  ),
  koreanPlayers: KoreanPlayersFileSchema.parse(
    readJson("configs/korean-players.json"),
  ),
  teamIds: TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
});

const NOW = new Date("2026-10-10T21:30:00.000Z");
const WINDOW = briefInputWindow("2026-10-11");
const DATES = afQueryDates(NOW.toISOString(), WINDOW); // [10-10, 10-09]

type Handler = (p: string, n: number) => Response | Promise<Response>;

/** 실제 클라이언트 + 가상 시계(요청마다 latencyMs 흐름) — 호출 정책까지 함께 돈다 */
function setup(
  handler: Handler = (p) =>
    afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
  opts: {
    latencyMs?: number;
    maxCalls?: number | null;
    deadlineMs?: number | null;
  } = {},
) {
  let t = 0;
  const paths: Array<{ path: string; at: number }> = [];
  const fetch: FetchLike = async (url) => {
    const p = afPath(url)!;
    paths.push({ path: p, at: t });
    try {
      return await handler(p, paths.length);
    } finally {
      t += opts.latencyMs ?? 500;
    }
  };
  const client = createApiFootballClient({
    apiKey: "k",
    fetch,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    maxCalls: opts.maxCalls ?? null,
    deadline: opts.deadlineMs ?? null,
  });
  const snapshots: Array<AfBriefSnapshot & { at: number }> = [];
  const input = (over: Partial<AfStageInput> = {}): AfStageInput => ({
    client,
    targets: TARGETS,
    pending: [],
    known: new Set(),
    briefWindow: WINDOW,
    dates: DATES,
    now: () => NOW,
    clock: () => t,
    briefCutoffAt: null,
    onBriefReady: (s) => snapshots.push({ ...s, at: t }),
    ...over,
  });
  return { client, paths, snapshots, input, now: () => t };
}

const idPaths = (paths: Array<{ path: string }>) =>
  paths.filter((p) => p.path.startsWith("/fixtures?id=")).map((p) => p.path);

describe("runApiFootballStage — 날짜 조회 → 계획 → 상세(브리핑 먼저)", () => {
  it("2026-10-10: 브리핑 날짜 먼저 조회, 종료 23경기 상세 → 브리핑 몫 complete, INT는 이월(요청 2 + 23)", async () => {
    const s = setup();
    const result = await runApiFootballStage(s.input());
    expect(s.paths.slice(0, 2).map((p) => p.path)).toEqual([
      "/fixtures?date=2026-10-10",
      "/fixtures?date=2026-10-09",
    ]);
    expect(s.client.calls).toBe(25);
    expect(result.dates).toEqual([
      { date: "2026-10-10", ok: true, listed: 36, invalid: 0 },
      { date: "2026-10-09", ok: true, listed: 0, invalid: 0 },
    ]);
    expect(result.planned).toEqual({ brief: 23, window: 0, requery: 0 });
    expect(result.details).toHaveLength(23);
    expect(result.outcomes.every((o) => o.result.kind === "fetched")).toBe(
      true,
    );
    // 단건 fixture가 있는 7경기는 득점 완전, 날짜 항목으로 합성한 나머지는 득점 이벤트가 없어 0-0이 아니면 불완전
    const complete = result.details
      .filter((d) => d.goalsComplete)
      .map((d) => d.matchId);
    expect(complete).toEqual(
      expect.arrayContaining([
        1552780, 1557418, 1570403, 1575177, 1575180, 1575181, 1575182,
      ]),
    );
    expect(s.snapshots).toHaveLength(1);
    expect(s.snapshots[0]).toMatchObject({ reason: "complete", missing: [] });
    expect(s.snapshots[0]!.details).toHaveLength(23);
    expect(result.brief.reason).toBe("complete");
    expect(result.pending.map((p) => [p.id, p.status])).toEqual([
      [1570410, "INT"],
    ]);
    expect(result.stoppedBy).toBeNull();
    expect(result.degraded).toBeNull();
    expect(result.issues).toEqual([]);
  });

  it("우선순위: brief 계층(킥오프 순) → window(한국 선수 소속팀 기타 대회) → requery(날짜 창 밖 이월)", async () => {
    const pokal = {
      ...AF_DATE_ITEMS.get(1575180)!,
      fixture: {
        ...(AF_DATE_ITEMS.get(1575180)!.fixture as object),
        id: 9_100_001,
        date: "2026-10-10T18:45:00+00:00",
      },
      league: {
        id: 81,
        name: "DFB Pokal",
        country: "Germany",
        season: 2026,
        round: "2nd Round",
      },
    };
    const pending: AfPendingEntry[] = [
      {
        id: 9_200_001,
        comp: "EPL",
        leagueId: 39,
        kickoff: "2026-10-08T19:00:00.000Z",
        status: "INT",
        firstSeen: "2026-10-08T21:30:00.000Z",
        requeries: 0,
      },
    ];
    const s = setup((p) => {
      if (p === "/fixtures?date=2026-10-10") {
        return new Response(
          afEnvelope([
            AF_DATE_ITEMS.get(1557417),
            AF_DATE_ITEMS.get(1575180),
            pokal,
          ]),
        );
      }
      if (p === "/fixtures?id=9100001") {
        return new Response(
          afEnvelope([{ ...pokal, events: [], lineups: [], players: [] }]),
        );
      }
      if (p === "/fixtures?id=9200001") {
        return new Response(
          afEnvelope([
            {
              ...AF_DATE_ITEMS.get(1557417)!,
              fixture: {
                id: 9_200_001,
                date: "2026-10-08T19:00:00+00:00",
                status: { short: "FT" },
              },
              events: [],
              lineups: [],
              players: [],
            },
          ]),
        );
      }
      return afFixtureResponse(`https://v3.football.api-sports.io${p}`)!;
    });
    const result = await runApiFootballStage(s.input({ pending }));
    expect(idPaths(s.paths)).toEqual([
      "/fixtures?id=1557417", // brief 11:30
      "/fixtures?id=1575180", // brief 13:30
      "/fixtures?id=9100001", // window(DFB 포칼 — 6개 대회 아님)
      "/fixtures?id=9200001", // requery(날짜 창 밖)
    ]);
    expect(result.planned).toEqual({ brief: 2, window: 1, requery: 1 });
    expect(result.counts.koreanOther).toBe(1);
    expect(result.details.map((d) => [d.matchId, d.comp])).toEqual([
      [9_200_001, "EPL"],
      [1557417, "EPL"],
      [1575180, "BUNDESLIGA"],
      [9_100_001, null],
    ]);
    // 브리핑 몫은 brief 계층만(window 시작 전에 넘김)
    expect(s.snapshots[0]!.details.map((d) => d.matchId)).toEqual([
      1557417, 1575180,
    ]);
    expect(result.pending).toEqual([]);
  });

  it("브리핑 컷오프: 컷오프 전에 끝낼 수 없는 brief 요청 앞에서 그때까지 받은 것만 넘기고, 나머지는 계속 받는다", async () => {
    // 요청 1건 = 응답 10초 + 간격 6.5초. 컷오프 60초 → 날짜 2건 + 단건 1건 뒤 신호
    const s = setup(undefined, { latencyMs: 10_000 });
    const result = await runApiFootballStage(
      s.input({ briefCutoffAt: 60_000, requestSlotMs: 6_500 + 10_000 }),
    );
    expect(s.snapshots).toHaveLength(1);
    const snap = s.snapshots[0]!;
    expect(snap.reason).toBe("cutoff");
    expect(snap.at + 16_500).toBeGreaterThan(60_000);
    expect(snap.details.length).toBeGreaterThan(0);
    expect(snap.details.length + snap.missing.length).toBe(23);
    // 신호 뒤에도 나머지 brief 경기를 받았다(원장·이월용)
    expect(result.details).toHaveLength(23);
    expect(result.brief).toMatchObject({ reason: "cutoff" });
  });

  it("단계 예산(마감) — 넘으면 남은 경기는 요청 없이 이월(status FT 유지·재조회 수 그대로)", async () => {
    const s = setup(undefined, { latencyMs: 1_000, deadlineMs: 60_000 });
    const result = await runApiFootballStage(s.input());
    expect(result.stoppedBy).toBe("budget");
    const fetched = result.outcomes.filter((o) => o.result.kind === "fetched");
    const deferred = result.outcomes.filter(
      (o) => o.result.kind === "deferred",
    );
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.length + deferred.length).toBe(23);
    expect(s.now()).toBeLessThanOrEqual(60_000);
    const carried = result.pending.filter((p) => p.status === "FT");
    expect(carried).toHaveLength(deferred.length);
    expect(carried.every((p) => p.requeries === 0)).toBe(true);
    expect(s.snapshots[0]!.reason).toBe("stopped");
  });

  it("호출 상한(maxCalls 12 = 날짜 2 + 단건 10) — 나머지 13경기는 이월", async () => {
    const s = setup(undefined, { maxCalls: 12 });
    const result = await runApiFootballStage(s.input());
    expect(s.client.calls).toBe(12);
    expect(result.stoppedBy).toBe("cap");
    expect(result.details).toHaveLength(10);
    expect(result.pending.filter((p) => p.status === "FT")).toHaveLength(13);
    expect(result.pending).toHaveLength(14); // + INT 1
  });
});

describe("runApiFootballStage — 오류·강등·사건", () => {
  it("날짜 조회 errors.plan → 재시도 없이 멈춤·FR-65 강등·사건, 이월 항목은 그대로(재조회 수 안 올림)", async () => {
    const pending: AfPendingEntry[] = [
      {
        id: 9_300_001,
        comp: "EPL",
        leagueId: 39,
        kickoff: "2026-10-09T19:00:00.000Z",
        status: "NS",
        firstSeen: "2026-10-09T21:30:00.000Z",
        requeries: 1,
      },
    ];
    const s = setup(() => new Response(readAfFixture("errors-plan-date.json")));
    const result = await runApiFootballStage(s.input({ pending }));
    expect(s.client.calls).toBe(1);
    expect(result.dates).toEqual([
      expect.objectContaining({
        date: "2026-10-10",
        ok: false,
        errorType: "plan",
      }),
      expect.objectContaining({
        date: "2026-10-09",
        ok: false,
        errorType: "plan",
      }),
    ]);
    expect(result.stoppedBy).toBe("plan");
    expect(result.degraded).toMatchObject({ kind: "plan", endpoint: "date" });
    expect(result.issues).toEqual([result.degraded]);
    expect(result.pending).toEqual(pending);
    expect(s.snapshots).toEqual([
      expect.objectContaining({ reason: "stopped", details: [] }),
    ]);
  });

  it("경기 단건 errors.plan → 남은 단건은 보내지 않고 이월(받은 것은 유지)", async () => {
    const s = setup((p, n) =>
      n === 5
        ? new Response(
            afEnvelope([], {
              plan: "Free plans do not have access to this fixture.",
            }),
          )
        : afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
    );
    const result = await runApiFootballStage(s.input());
    expect(s.client.calls).toBe(5);
    expect(result.details).toHaveLength(2);
    expect(result.degraded).toMatchObject({ kind: "plan", endpoint: "id" });
    expect(
      result.outcomes.filter((o) => o.result.kind === "deferred"),
    ).toHaveLength(21);
    expect(result.pending.filter((p) => p.requeries > 0)).toEqual([]);
  });

  it("일 한도(errors.requests) → 멈춤 + quota 사건, 그 밖 errors → 실패(이월 재조회 +1) + api 사건", async () => {
    const quota = setup((p, n) =>
      n === 3
        ? new Response(
            afEnvelope([], {
              requests: "You have reached the request limit for the day",
            }),
          )
        : afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
    );
    const q = await runApiFootballStage(quota.input());
    expect(q.stoppedBy).toBe("quota");
    expect(q.issues.map((i) => i.kind)).toEqual(["quota"]);
    expect(q.degraded).toBeNull();

    const api = setup((p, n) =>
      n === 3
        ? new Response(
            afEnvelope([], { id: "The Id field must contain an integer." }),
          )
        : afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
    );
    const a = await runApiFootballStage(api.input());
    expect(a.stoppedBy).toBeNull();
    expect(a.issues.map((i) => i.kind)).toEqual(["api"]);
    const failed = a.outcomes.filter((o) => o.result.kind === "failed");
    expect(failed).toHaveLength(1);
    expect(a.pending.find((p) => p.id === failed[0]!.task.id)).toMatchObject({
      status: "FT",
      requeries: 1,
    });
  });

  it("키 오류(errors.token) → 추가 요청 없이 멈춤 + auth 사건, 남은 경기는 이월(재조회 수 안 올림)", async () => {
    const s = setup((p, n) =>
      n === 3
        ? new Response(
            afEnvelope([], { token: "Error/Missing application key." }),
          )
        : afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
    );
    const result = await runApiFootballStage(s.input());
    expect(s.client.calls).toBe(3);
    expect(result.stoppedBy).toBe("auth");
    expect(result.issues.map((i) => [i.kind, i.endpoint])).toEqual([
      ["auth", "id"],
    ]);
    expect(
      result.outcomes.filter((o) => o.result.kind === "deferred"),
    ).toHaveLength(23);
    expect(result.pending.every((p) => p.requeries === 0)).toBe(true);
    const [payload] = apiFootballIssuePayloads(result.issues, {
      occurredAt: NOW.toISOString(),
    });
    expect(SourceBrokenPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({ errorType: "auth" });
  });

  it("분당 초과 연속 2회(첫 시도 + 61초 뒤 재시도) → 단계 멈춤 + rate 사건, 남은 경기는 이월", async () => {
    const s = setup((p) =>
      p.startsWith("/fixtures?id=")
        ? new Response("x", { status: 429 })
        : afFixtureResponse(`https://v3.football.api-sports.io${p}`)!,
    );
    const result = await runApiFootballStage(s.input());
    expect(idPaths(s.paths)).toHaveLength(2); // 같은 경기 첫 시도 + 재시도
    expect(result.stoppedBy).toBe("rate");
    expect(result.issues.map((i) => i.kind)).toEqual(["rate"]);
    expect(
      result.outcomes.filter((o) => o.result.kind === "deferred"),
    ).toHaveLength(23);
    expect(s.snapshots[0]!.reason).toBe("stopped");
  });

  it("연속 실패 3회(차단기) → 남은 단건을 멈춘다(러너 네트워크 장애 때 한도를 헛되이 쓰지 않게)", async () => {
    const s = setup((p) => {
      if (p.startsWith("/fixtures?id=")) throw new TypeError("fetch failed");
      return afFixtureResponse(`https://v3.football.api-sports.io${p}`)!;
    });
    const result = await runApiFootballStage(s.input());
    expect(API_FOOTBALL_BREAKER_FAILURES).toBe(3);
    // 경기 단건 연결 오류는 재시도하지 않는다 → 단건 3회
    expect(idPaths(s.paths)).toHaveLength(3);
    expect(result.stoppedBy).toBe("breaker");
    expect(
      result.outcomes.filter((o) => o.result.kind === "failed"),
    ).toHaveLength(3);
    expect(
      result.outcomes.filter((o) => o.result.kind === "deferred"),
    ).toHaveLength(20);
  });

  it("한 날짜가 실패해도 다른 날짜는 받는다(날짜 조회 연결 오류는 1회 재시도)", async () => {
    const s = setup((p) => {
      if (p === "/fixtures?date=2026-10-10")
        throw new TypeError("fetch failed");
      return afFixtureResponse(`https://v3.football.api-sports.io${p}`)!;
    });
    const result = await runApiFootballStage(s.input());
    expect(s.paths.map((x) => x.path)).toEqual([
      "/fixtures?date=2026-10-10",
      "/fixtures?date=2026-10-10",
      "/fixtures?date=2026-10-09",
    ]);
    expect(result.dates.map((d) => [d.date, d.ok, d.errorType])).toEqual([
      ["2026-10-10", false, "network"],
      ["2026-10-09", true, undefined],
    ]);
    expect(result.issues).toEqual([]); // 연결 오류는 이슈 사건이 아니다(실행 상태 partial로 드러난다)
  });

  it("이월 재조회: 아직이면 재조회 +1, 경기 없이 끝났으면(CANC) 빠진다, 0건이면 +1", async () => {
    const entry = (id: number): AfPendingEntry => ({
      id,
      comp: "LALIGA",
      leagueId: 140,
      kickoff: "2026-10-09T12:00:00.000Z",
      status: "INT",
      firstSeen: "2026-10-09T21:30:00.000Z",
      requeries: 0,
    });
    const base = AF_DATE_ITEMS.get(1570410)! as {
      fixture: Record<string, unknown>;
    };
    const withStatus = (id: number, short: string) => ({
      ...base,
      fixture: {
        ...base.fixture,
        id,
        status: { long: short, short, elapsed: null, extra: null },
      },
    });
    const s = setup((p) => {
      if (p === "/fixtures?id=1")
        return new Response(afEnvelope([withStatus(1, "INT")]));
      if (p === "/fixtures?id=2")
        return new Response(afEnvelope([withStatus(2, "CANC")]));
      if (p === "/fixtures?id=3") return new Response(afEnvelope([]));
      return new Response(afEnvelope([]));
    });
    const result = await runApiFootballStage(
      s.input({ pending: [entry(1), entry(2), entry(3)], dates: [] }),
    );
    expect(result.planned.requery).toBe(3);
    // 재조회 응답의 킥오프로 갱신된다(1은 10-10 12:00 — 킥오프 순으로 3 다음)
    expect(result.pending.map((p) => [p.id, p.status, p.requeries])).toEqual([
      [3, "INT", 1],
      [1, "INT", 1],
    ]);
    expect(result.dropped).toEqual([{ id: 2, status: "CANC", reason: "void" }]);
  });
});

describe("apiFootballIssuePayloads — M1-11 소스 이슈 경로 재사용(source-broken, source:api-football)", () => {
  it("종류별 1건, 스키마 통과, 응답 본문 없이 errors 문구만", () => {
    const payloads = apiFootballIssuePayloads(
      [
        {
          kind: "plan",
          endpoint: "date",
          message:
            "API-Football 날짜 조회 응답 errors.plan: Free plans do not have access to this date",
        },
        { kind: "plan", endpoint: "id", message: "again" },
        { kind: "quota", endpoint: "id", message: "limit" },
      ],
      {
        occurredAt: NOW.toISOString(),
        runId: "collect-prod-20261010T213000Z-abcd",
        runUrl: "https://github.com/sguys99/euro-digest/actions/runs/1",
      },
    );
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      const parsed = SourceBrokenPayloadSchema.safeParse(p);
      expect(parsed.success).toBe(true);
      expect(p.sourceId).toBe(API_FOOTBALL_ISSUE_SOURCE_ID);
    }
    expect(payloads[0]).toMatchObject({
      errorType: "plan",
      error: expect.stringContaining("/fixtures?date="),
      note: expect.stringContaining("FR-65"),
    });
    expect(
      apiFootballIssuePayloads([], { occurredAt: NOW.toISOString() }),
    ).toEqual([]);
  });

  it("ApiFootballError는 클라이언트 밖에서도 종류를 유지한다", () => {
    const e = new ApiFootballError("plan", "x", { errorKeys: ["plan"] });
    expect(e).toMatchObject({
      kind: "plan",
      errorKeys: ["plan"],
      status: null,
    });
    const client: Pick<ApiFootballClient, "calls"> = { calls: 0 };
    expect(client.calls).toBe(0);
  });
});
