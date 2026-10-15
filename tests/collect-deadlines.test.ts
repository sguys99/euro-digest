/**
 * M1-47 브리핑 마감·단계 예산 (scripts/lib/collect-deadlines.ts — 순수 함수, PRD §15 D26·D28, FR-26).
 * 기대값은 손으로 계산해 고정했다. 시각 주석은 KST.
 */
import { describe, expect, it } from "vitest";

import { TimeInputError } from "@/lib/time";

import { API_FOOTBALL_BRIEF_CUTOFF_MS } from "../scripts/lib/api-football-stage";
import {
  BRIEF_LLM_RESERVE_MS,
  deadlineLogFields,
  MIN_SLOT_WINDOW_MS,
  msUntil,
  OFF_SLOT_BRIEF_WINDOW_MS,
  planCollectDeadlines,
  stageBudgets,
  type StageBudgets,
} from "../scripts/lib/collect-deadlines";
import { FOOTBALL_DATA_STAGE_BUDGET_MS } from "../scripts/lib/providers/football-data";

const SEC = 1_000;
const MIN = 60 * SEC;

describe("상수 — 정시 실행의 예산은 M1-47 전과 같다", () => {
  it("LLM 몫 4분, 슬롯 최소 창 3분(150초 + 30초), off-slot 창 8분(컷오프 4분 + LLM 4분)", () => {
    expect(BRIEF_LLM_RESERVE_MS).toBe(4 * MIN);
    expect(MIN_SLOT_WINDOW_MS).toBe(3 * MIN);
    expect(MIN_SLOT_WINDOW_MS).toBeGreaterThanOrEqual(
      FOOTBALL_DATA_STAGE_BUDGET_MS,
    );
    expect(OFF_SLOT_BRIEF_WINDOW_MS).toBe(8 * MIN);
    expect(OFF_SLOT_BRIEF_WINDOW_MS).toBe(
      API_FOOTBALL_BRIEF_CUTOFF_MS + BRIEF_LLM_RESERVE_MS,
    );
  });
});

describe("planCollectDeadlines — slot(그날 슬롯의 공개 −10분) / off-slot(시작 + 8분)", () => {
  it.each([
    // [실행 시작(UTC), 기준, 브리핑 마감(UTC), 설명]
    ["2026-10-10T21:32:00Z", "slot", "2026-10-10T21:50:00.000Z"], // 여름 06:32 → 06:50 (18분)
    ["2026-10-10T21:40:00Z", "slot", "2026-10-10T21:50:00.000Z"], // 여름 백업 06:40 → 06:50 (10분)
    ["2026-10-24T21:32:00Z", "slot", "2026-10-24T21:50:00.000Z"], // 전환일 10-25(일) 아침 = 여름
    ["2026-10-25T22:12:00Z", "slot", "2026-10-25T22:20:00.000Z"], // 첫 겨울 10-26 07:12 → 07:20 (8분)
    ["2026-10-25T22:17:00Z", "slot", "2026-10-25T22:20:00.000Z"], // 07:17 — 정확히 3분 남음(경계 포함)
    ["2026-10-25T22:17:00.001Z", "off-slot", "2026-10-25T22:25:00.001Z"], // 3분 미만 → 시작 + 8분
    ["2026-10-25T22:21:00Z", "off-slot", "2026-10-25T22:29:00.000Z"], // 겨울 백업 07:20 schedule(늦게 시작)
    ["2027-03-27T22:12:00Z", "slot", "2027-03-27T22:20:00.000Z"], // 전환일 03-28(일) 아침 = 겨울
    ["2027-03-28T21:32:00Z", "slot", "2027-03-28T21:50:00.000Z"], // 첫 여름 03-29 06:32 → 06:50
    ["2026-10-11T05:00:00Z", "off-slot", "2026-10-11T05:08:00.000Z"], // 오후 14:00 수동 실행
    ["2026-10-10T17:00:00Z", "slot", "2026-10-10T21:50:00.000Z"], // 02:00 개발 실행 — 마감이 멀다
    ["2026-10-24T22:12:00Z", "off-slot", "2026-10-24T22:20:00.000Z"], // 10-25(여름) 07:12 — 여름 마감 06:50 지남
  ] as const)("%s → %s %s", (startedAt, basis, briefDeadline) => {
    expect(planCollectDeadlines(startedAt)).toMatchObject({
      basis,
      briefDeadline,
    });
  });

  it("slot에는 그날 슬롯(계절·공개 목표)이 함께 온다 — off-slot도 발행일 슬롯은 같다", () => {
    expect(planCollectDeadlines("2026-10-25T22:12:00Z").slot).toMatchObject({
      date: "2026-10-26",
      season: "winter",
      publishTarget: "2026-10-25T22:30:00.000Z",
    });
    expect(planCollectDeadlines("2026-10-25T22:21:00Z").slot).toMatchObject({
      date: "2026-10-26",
      season: "winter",
    });
  });

  it("Z가 아닌 시각은 TimeInputError", () => {
    expect(() => planCollectDeadlines("2026-10-26T07:12:00+09:00")).toThrow(
      TimeInputError,
    );
  });
});

describe("stageBudgets — 남은 시간 R → 단계 예산(단계 시작 기준 상대 ms)", () => {
  it.each<[string, number, StageBudgets]>([
    // 정시 실행: 여름 18분·겨울 8분 → 상수 그대로(150초 · 4분 · 6분)
    [
      "여름 정시 18분",
      18 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 4 * MIN,
        apiFootballStageMs: 6 * MIN,
      },
    ],
    [
      "겨울 정시 8분",
      8 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 4 * MIN,
        apiFootballStageMs: 6 * MIN,
      },
    ],
    // 늦게 시작한 겨울 실행: 컷오프 = R − 4분, 단계 = R
    [
      "7분",
      7 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 3 * MIN,
        apiFootballStageMs: 6 * MIN,
      },
    ],
    [
      "5분",
      5 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 1 * MIN,
        apiFootballStageMs: 5 * MIN,
      },
    ],
    [
      "4분 — 득점자 없이",
      4 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 0,
        apiFootballStageMs: 4 * MIN,
      },
    ],
    [
      "3분",
      3 * MIN,
      {
        footballDataMs: 150 * SEC,
        apiFootballBriefCutoffMs: 0,
        apiFootballStageMs: 3 * MIN,
      },
    ],
    // slot 기준에서는 나오지 않지만(3분 미만은 off-slot) 함수는 그대로 줄인다 — football-data도 마감을 넘지 않는다
    [
      "100초",
      100 * SEC,
      {
        footballDataMs: 100 * SEC,
        apiFootballBriefCutoffMs: 0,
        apiFootballStageMs: 100 * SEC,
      },
    ],
    [
      "0",
      0,
      { footballDataMs: 0, apiFootballBriefCutoffMs: 0, apiFootballStageMs: 0 },
    ],
    [
      "지남(음수)",
      -5 * MIN,
      { footballDataMs: 0, apiFootballBriefCutoffMs: 0, apiFootballStageMs: 0 },
    ],
  ])("%s", (_label, remaining, budgets) => {
    expect(stageBudgets(remaining)).toEqual(budgets);
  });

  it("컷오프 + LLM 몫은 마감을 넘지 않는다, 단계 예산도 마감을 넘지 않는다", () => {
    for (let r = 0; r <= 20 * MIN; r += 10 * SEC) {
      const b = stageBudgets(r);
      if (b.apiFootballBriefCutoffMs > 0) {
        expect(
          b.apiFootballBriefCutoffMs + BRIEF_LLM_RESERVE_MS,
        ).toBeLessThanOrEqual(r);
      }
      expect(b.footballDataMs).toBeLessThanOrEqual(r);
      expect(b.apiFootballStageMs).toBeLessThanOrEqual(r);
    }
  });

  it("off-slot 창(8분)에서는 상수 예산이 줄지 않는다 — 수동·지연 실행은 M1-47 전과 같다", () => {
    expect(stageBudgets(OFF_SLOT_BRIEF_WINDOW_MS)).toEqual(
      stageBudgets(60 * MIN),
    );
  });
});

describe("msUntil · deadlineLogFields", () => {
  it("마감까지 남은 ms(지나면 음수)", () => {
    const now = new Date("2026-10-25T22:15:00Z");
    expect(msUntil("2026-10-25T22:20:00.000Z", now)).toBe(5 * MIN);
    expect(msUntil("2026-10-25T22:10:00.000Z", now)).toBe(-5 * MIN);
  });

  it("collect.deadline 로그 — 계절·기준·마감(UTC·KST)·남은 시간·단계 예산", () => {
    const startedAt = "2026-10-25T22:15:00.000Z"; // 10-26 07:15 KST
    expect(
      deadlineLogFields(planCollectDeadlines(startedAt), startedAt),
    ).toEqual({
      date: "2026-10-26",
      season: "winter",
      basis: "slot",
      briefDeadline: "2026-10-25T22:20:00.000Z",
      briefDeadlineKst: "07:20",
      publishTargetKst: "07:30",
      remainingMs: 5 * MIN,
      footballDataBudgetMs: 150 * SEC,
      afBriefCutoffMs: 1 * MIN,
      afStageBudgetMs: 5 * MIN,
    });
  });
});
