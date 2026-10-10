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
