import { describe, expect, it } from "vitest";

import {
  RunLogSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  TakedownSchema,
  TakedownsFileSchema,
} from "@/lib/schema";

import { at, issueMessages, issuePaths, passes, validFixture } from "./helpers";

describe("RunLog — data/runs.json · data/runs-dev.json (부록 A, FR-151)", () => {
  const prod = at(validFixture(RunsFileSchema, "data/runs.json"), 0);
  const dev = at(validFixture(RunsDevFileSchema, "data/runs-dev.json"), 0);

  it("prod·dev fixture가 각 파일 스키마를 통과한다", () => {
    expect(prod.env).toBe("prod");
    expect(dev.env).toBe("dev");
  });

  it("파일과 env가 섞이면 실패한다 (CLAUDE.md §6.3 — dev 기록은 runs-dev.json에만)", () => {
    expect(issuePaths(RunsFileSchema, [prod, dev])).toEqual(["1.env"]);
    expect(issuePaths(RunsDevFileSchema, [prod])).toEqual(["0.env"]);
    expect(issueMessages(RunsDevFileSchema, [prod])[0]).toContain('"dev"');
  });

  it("토큰은 in·out·cacheRead·cacheWrite 4개가 모두 필요하다", () => {
    const tokens = { ...prod.tokens, cacheWrite: undefined };
    expect(issuePaths(RunLogSchema, { ...prod, tokens })).toEqual([
      "tokens.cacheWrite",
    ]);
  });

  it("sources[] 선택 필드 usable(창 안 새 항목 수)·error(실패 종류) — 옛 {id, ok, items} 기록도 유효 (D35)", () => {
    const runs = validFixture(RunsFileSchema, "data/runs.json");
    // fixture: 새 기록(usable·error 포함)과 옛 기록(선택 필드 없음)이 함께 통과한다
    expect(at(runs, 0).sources).toContainEqual({
      id: "bbc-football",
      ok: true,
      items: 38,
      usable: 21,
    });
    expect(at(runs, 0).sources).toContainEqual({
      id: "besteleven-all",
      ok: false,
      items: 0,
      error: "budget",
    });
    expect(at(runs, 1).sources).toEqual([
      { id: "bbc-football", ok: true, items: 40 },
      { id: "google-news-ko", ok: false, items: 0 },
    ]);
    expect(at(dev.sources, 0).usable).toBe(12);
  });

  it("usable은 0 이상의 정수, error는 문자열", () => {
    const withSource = (source: Record<string, unknown>) => ({
      ...prod,
      sources: [source],
    });
    const base = { id: "bbc-football", ok: true, items: 3 };
    expect(passes(RunLogSchema, withSource({ ...base, usable: 0 }))).toBe(true);
    expect(
      issuePaths(RunLogSchema, withSource({ ...base, usable: -1 })),
    ).toEqual(["sources.0.usable"]);
    expect(
      issuePaths(RunLogSchema, withSource({ ...base, usable: 1.5 })),
    ).toEqual(["sources.0.usable"]);
    expect(
      issuePaths(
        RunLogSchema,
        withSource({ id: "x", ok: false, items: 0, error: 503 }),
      ),
    ).toEqual(["sources.0.error"]);
  });

  it("brief(D56 — 브리핑 요청 수·응답 없이 끊긴 요청의 추정 최대 사용량)는 선택 필드 — 옛 기록(필드 없음 = 0건)도 유효", () => {
    const runs = validFixture(RunsFileSchema, "data/runs.json");
    expect(at(runs, 0).brief).toEqual({
      requests: 2,
      unbilledRisk: {
        requests: 1,
        inputTokens: 6609,
        outputTokensMax: 8192,
        usdMax: 0.004757,
      },
    });
    expect(at(runs, 1).brief).toBeUndefined();
    expect(dev.brief).toEqual({ requests: 1 });
    expect(passes(RunLogSchema, { ...prod, brief: { requests: 0 } })).toBe(
      true,
    );
    expect(
      issuePaths(RunLogSchema, { ...prod, brief: { requests: 1.5 } }),
    ).toEqual(["brief.requests"]);
    expect(
      issuePaths(RunLogSchema, { ...prod, brief: { requests: -1 } }),
    ).toEqual(["brief.requests"]);
    expect(issuePaths(RunLogSchema, { ...prod, brief: {} })).toEqual([
      "brief.requests",
    ]);
    const risk = {
      requests: 1,
      inputTokens: 10,
      outputTokensMax: 8192,
      usdMax: 0.01,
    };
    expect(
      issuePaths(RunLogSchema, {
        ...prod,
        brief: { requests: 1, unbilledRisk: { ...risk, requests: 0 } },
      }),
    ).toEqual(["brief.unbilledRisk.requests"]);
    expect(
      issuePaths(RunLogSchema, {
        ...prod,
        brief: { requests: 1, unbilledRisk: { ...risk, usdMax: -1 } },
      }),
    ).toEqual(["brief.unbilledRisk.usdMax"]);
  });

  it("job·status 열거값을 검사한다", () => {
    expect(issuePaths(RunLogSchema, { ...prod, job: "deploy" })).toEqual([
      "job",
    ]);
    expect(issuePaths(RunLogSchema, { ...prod, status: "ok" })).toEqual([
      "status",
    ]);
    expect(passes(RunLogSchema, { ...prod, status: "skipped" })).toBe(true);
  });
});

describe("Takedown — configs/takedowns.json (부록 A, FR-143)", () => {
  const takedowns = validFixture(TakedownsFileSchema, "configs/takedowns.json");
  const handled = at(takedowns, 0);
  const pending = at(takedowns, 1);

  it("fixture: 처리 완료 1건 + 배포 확인 대기(handledAt null) 1건", () => {
    expect(handled.handledAt).not.toBeNull();
    expect(pending.handledAt).toBeNull();
  });

  it("handledAt은 null 허용, 키 자체는 필수 (결정 Q1 — 등록 시 null, 배포 확인 후 기록)", () => {
    expect(passes(TakedownSchema, { ...handled, handledAt: null })).toBe(true);
    expect(
      issuePaths(TakedownSchema, { ...handled, handledAt: undefined }),
    ).toEqual(["handledAt"]);
  });

  it("handledAt이 있으면 requestedAt보다 앞설 수 없다", () => {
    const backwards = { ...handled, handledAt: "2026-10-10T02:59:59Z" };
    expect(issuePaths(TakedownSchema, backwards)).toEqual(["handledAt"]);
    expect(
      passes(TakedownSchema, { ...handled, handledAt: handled.requestedAt }),
    ).toBe(true);
  });

  it("알 수 없는 키는 실패한다 (결정 Q5 — 요청자 정보 같은 필드가 끼어들지 않게)", () => {
    expect(
      issuePaths(TakedownSchema, {
        ...pending,
        requester: "someone@example.com",
      }),
    ).toEqual([""]);
  });

  it("카드 ID 형식과 중복을 검사한다", () => {
    expect(
      issuePaths(TakedownSchema, { ...handled, id: "8f3a1b2c4d" }),
    ).toEqual(["id"]);
    expect(issuePaths(TakedownsFileSchema, [handled, handled])).toEqual([
      "1.id",
    ]);
  });
});
