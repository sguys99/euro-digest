import { describe, expect, it } from "vitest";

import { SourceSchema, SourcesFileSchema } from "@/lib/schema";

import {
  REJECTED_URLS,
  at,
  issuePaths,
  loadFixture,
  passes,
  validFixture,
} from "./helpers";

const sources = validFixture(SourcesFileSchema, "configs/sources.json");
const source = at(sources, 0);

describe("Source — configs/sources.json (부록 A, FR-01)", () => {
  it("fixture가 통과하고 competitions 생략 시 []로 채운다", () => {
    const raw = loadFixture("configs/sources.json") as Array<
      Record<string, unknown>
    >;
    expect(raw[1]).not.toHaveProperty("competitions");
    expect(at(sources, 1).competitions).toEqual([]);
  });

  it.each([3.1, -0.1])("weight %s는 실패한다 (0~3)", (weight) => {
    expect(issuePaths(SourceSchema, { ...source, weight })).toEqual(["weight"]);
  });

  it("weight 경계값 0·3은 통과한다", () => {
    expect(passes(SourceSchema, { ...source, weight: 0 })).toBe(true);
    expect(passes(SourceSchema, { ...source, weight: 3 })).toBe(true);
  });

  it("Tier 4·알 수 없는 type·잘못된 URL은 실패한다", () => {
    expect(issuePaths(SourceSchema, { ...source, tier: 4 })).toEqual(["tier"]);
    expect(issuePaths(SourceSchema, { ...source, type: "twitter" })).toEqual([
      "type",
    ]);
    expect(
      issuePaths(SourceSchema, { ...source, url: "feeds.bbci.co.uk/rss" }),
    ).toEqual(["url"]);
  });

  it("약관·robots 확인 여부는 필수 필드다 (FR-01)", () => {
    expect(
      issuePaths(SourceSchema, { ...source, terms_checked: undefined }),
    ).toEqual(["terms_checked"]);
    expect(
      issuePaths(SourceSchema, { ...source, robots_checked: undefined }),
    ).toEqual(["robots_checked"]);
  });

  it("summarize는 기본값 없는 필수 필드다 (PRD §15 D22 — 소스마다 명시)", () => {
    expect(
      issuePaths(SourceSchema, { ...source, summarize: undefined }),
    ).toEqual(["summarize"]);
    const withoutSummarize: Record<string, unknown> = { ...source };
    delete withoutSummarize.summarize;
    expect(issuePaths(SourceSchema, withoutSummarize)).toEqual(["summarize"]);
    expect(issuePaths(SourceSchema, { ...source, summarize: "false" })).toEqual(
      ["summarize"],
    );
  });

  it.each([true, false])(
    "summarize %s는 통과하고 값이 그대로 남는다",
    (summarize) => {
      const parsed = SourceSchema.safeParse({ ...source, summarize });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.summarize).toBe(summarize);
    },
  );

  it("fixture는 원제목+링크 전용(false)과 요약(true) 소스를 모두 담는다", () => {
    expect(sources.map((s) => s.summarize)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  describe("retentionDays — 소스별 보존 기간(일), 선택 필드 (PRD §15 D32)", () => {
    it("fixture: 생략한 소스는 undefined, 7일 소스는 값이 그대로 남는다", () => {
      expect(sources.map((s) => s.retentionDays)).toEqual([
        undefined,
        undefined,
        undefined,
        7,
      ]);
      expect(source).not.toHaveProperty("retentionDays");
    });

    it.each([1, 7, 90, 365])("양의 정수 %s는 통과한다", (retentionDays) => {
      const parsed = SourceSchema.safeParse({ ...source, retentionDays });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.retentionDays).toBe(retentionDays);
    });

    it.each([0, -1, -7, 1.5, 7.01, Number.NaN, Number.POSITIVE_INFINITY])(
      "0·음수·소수·NaN·무한대 %s는 실패한다",
      (retentionDays) => {
        expect(issuePaths(SourceSchema, { ...source, retentionDays })).toEqual([
          "retentionDays",
        ]);
      },
    );

    it.each(["7", null, true])(
      '숫자가 아닌 값 %s는 실패한다(문자열 "7"도 변환하지 않음)',
      (retentionDays) => {
        expect(issuePaths(SourceSchema, { ...source, retentionDays })).toEqual([
          "retentionDays",
        ]);
      },
    );
  });

  it("파일 안에서 id가 겹치면 실패한다", () => {
    expect(issuePaths(SourcesFileSchema, [source, { ...source }])).toEqual([
      "1.id",
    ]);
  });

  it.each(REJECTED_URLS)(
    "http/https 밖의 URL은 실패한다 (결정 Q3): %s",
    (url) => {
      expect(issuePaths(SourceSchema, { ...source, url })).toEqual(["url"]);
    },
  );

  it("알 수 없는 키(오타)는 실패한다 (결정 Q5 — configs strict)", () => {
    const typo = { ...source, terms_cheked: true };
    expect(issuePaths(SourceSchema, typo)).toEqual([""]);
    expect(SourceSchema.safeParse(typo).error?.issues[0]?.code).toBe(
      "unrecognized_keys",
    );
  });

  it("id는 slug 형식 (결정 Q7)", () => {
    expect(issuePaths(SourceSchema, { ...source, id: "BBC Football" })).toEqual(
      ["id"],
    );
  });
});
