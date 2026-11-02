/**
 * 호출 지점별 max_tokens 상한 고정 (2026-11-02 사용자 승인 — M4-06 안 A, CLAUDE.md §1-3).
 * 팀 프로필(LLM 호출 지점 #2)만 32,768, 일일 브리핑(#1)·한국 선수 주간 총평(#3)은 16,384 그대로. 다른 지점이 실수로 올라가지 않게
 * 표·값·요청 빌더를 함께 고정한다. 네트워크 없음(mock 클라이언트).
 */
import { describe, expect, it } from "vitest";

import { BRIEF_MAX_TOKENS, buildBriefRequest } from "../scripts/lib/brief";
import {
  LlmRequestError,
  MAX_TOKENS_BY_CALL_SITE,
  MAX_TOKENS_CEILING,
  SINGLE_CALL_MAX_TOKENS,
  buildMessageParams,
  createLlmClient,
  maxTokensCeilingFor,
  validateRequests,
} from "../scripts/lib/llm";
import {
  TEAM_PROFILE_MAX_TOKENS,
  buildProfileRequest,
} from "../scripts/lib/team-profile";
import {
  WEEKLY_KR_MAX_TOKENS,
  buildWeeklyRequest,
} from "../scripts/lib/weekly-kr";

const teamRequest = () =>
  buildProfileRequest({ customId: "team-profile-x-g1", teams: [] }, "지시문");

describe("호출 지점별 max_tokens 상한", () => {
  it("표는 팀 프로필 32,768 하나뿐, 기본 상한 16,384", () => {
    expect(MAX_TOKENS_BY_CALL_SITE).toEqual({ "team-profile": 32_768 });
    expect(MAX_TOKENS_CEILING).toBe(16_384);
    expect(maxTokensCeilingFor(undefined)).toBe(16_384);
    expect(maxTokensCeilingFor("team-profile")).toBe(32_768);
    expect(SINGLE_CALL_MAX_TOKENS).toBe(16_384);
  });

  it("브리핑·주간 총평은 16,384, callSite 없음 — 그보다 크면 거부", () => {
    expect(BRIEF_MAX_TOKENS).toBe(16_384);
    expect(WEEKLY_KR_MAX_TOKENS).toBe(16_384);
    const brief = buildBriefRequest(
      { briefDate: "2026-11-02", matches: [], standings: [] },
      "지시문",
    );
    const weekly = buildWeeklyRequest(
      {
        week: "2026-44",
        from: "2026-10-26",
        to: "2026-11-01",
        mvp: [],
        mvpPts: null,
        players: [],
      },
      "지시문",
    );
    for (const req of [brief, weekly]) {
      expect(req.callSite).toBeUndefined();
      expect(validateRequests([req])).toHaveLength(1);
      expect(() => validateRequests([{ ...req, maxTokens: 16_385 }])).toThrow(
        /maxTokens는 16384 이하/,
      );
    }
  });

  it("팀 프로필은 callSite team-profile + 32,768 — 32,769·callSite 없는 32,768은 거부", () => {
    const req = teamRequest();
    expect(TEAM_PROFILE_MAX_TOKENS).toBe(32_768);
    expect(req).toMatchObject({ callSite: "team-profile", maxTokens: 32_768 });
    expect(validateRequests([req])).toHaveLength(1);
    expect(() => validateRequests([{ ...req, maxTokens: 32_769 }])).toThrow(
      /maxTokens는 32768 이하/,
    );
    const noSite = { ...req };
    delete noSite.callSite;
    expect(() => validateRequests([noSite])).toThrow(/maxTokens는 16384 이하/);
  });

  it("callSite는 API로 보내지 않는다", () => {
    const params = buildMessageParams(teamRequest(), "claude-haiku-5-5");
    expect(params.max_tokens).toBe(32_768);
    expect(JSON.stringify(params)).not.toContain("callSite");
  });

  it("큰 max_tokens는 배치 전용 — 단건 호출은 거부", async () => {
    const client = createLlmClient({
      mode: "mock",
      model: "claude-haiku-5-5",
      env: {},
    });
    await expect(client.callSingle(teamRequest())).rejects.toBeInstanceOf(
      LlmRequestError,
    );
  });
});
