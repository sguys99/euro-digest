/**
 * D51(2026-10-17 사용자 결정) — LLM 요청 본문은 중요도 순 앞 15경기만. 템플릿·근거 대조·검사기 근거는 전체 입력, 모델이 보지 못한
 * 근거 id(잘린 경기·순위)를 단 줄은 `ref-hidden`으로 강등한다. 네트워크·LLM 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildBriefRequest } from "../scripts/lib/brief";
import { judgeBriefResponse } from "../scripts/lib/brief-check";
import {
  buildEvalRequest,
  evalHiddenRefs,
  evalUserMessage,
} from "../scripts/lib/brief-eval";
import {
  BRIEF_LLM_MAX_MATCHES,
  BRIEF_MAX_MATCHES,
  briefLlmInput,
  serializeBriefInput,
  type BriefInput,
  type BriefInputMatch,
} from "../scripts/lib/brief-input";
import {
  briefNamesFromIndex,
  templateBriefLines,
  templateMatchLine,
} from "../scripts/lib/brief-template";
import {
  configsFingerprint,
  loadEvalContext,
} from "../scripts/lib/eval-prompt-run";
import { loadGoldenSet } from "../scripts/lib/golden";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SET = await loadGoldenSet(path.join(ROOT, "fixtures/llm/golden"));
const CTX = await loadEvalContext(ROOT);
const BUSY = SET.days.find((d) => d.date === "2026-10-11")!.input; // 23경기
const SYSTEM = readFileSync(
  path.join(ROOT, "configs/prompts/summarize.md"),
  "utf8",
).trim();

function match(i: number, comp: string): BriefInputMatch {
  return {
    id: `m${1000 + i}`,
    comp,
    round: "Matchday 6",
    home: `Home ${i}`,
    away: `Away ${i}`,
    ft: "1-0",
    goals: null,
  };
}

describe("briefLlmInput — 앞 15경기·남은 대회의 순위만·모델이 못 본 근거 id", () => {
  it("상수 — LLM 본문 15 < 빌더 상한 30", () => {
    expect(BRIEF_LLM_MAX_MATCHES).toBe(15);
    expect(BRIEF_LLM_MAX_MATCHES).toBeLessThan(BRIEF_MAX_MATCHES);
  });

  it("16경기 이상 — 앞 15경기(순서 그대로), 경기가 모두 잘린 대회의 순위는 뺀다", () => {
    const input: BriefInput = {
      briefDate: "2026-10-11",
      matches: [
        ...Array.from({ length: 15 }, (_, i) => match(i, "Premier League")),
        match(15, "Ligue 1"),
        match(16, "Ligue 1"),
      ],
      standings: [
        {
          id: "sPL",
          comp: "Premier League",
          note: "n",
          rows: [{ pos: 1, team: "Home 0", played: 6, pts: 15, gd: 9 }],
        },
        {
          id: "sL1",
          comp: "Ligue 1",
          note: "n",
          rows: [{ pos: 1, team: "Home 15", played: 6, pts: 14, gd: 7 }],
        },
      ],
    };
    const view = briefLlmInput(input);
    expect(view.input.matches.map((m) => m.id)).toEqual(
      input.matches.slice(0, 15).map((m) => m.id),
    );
    expect(view.input.standings.map((s) => s.id)).toEqual(["sPL"]);
    expect([...view.hiddenRefs].sort()).toEqual(["m1015", "m1016", "sL1"]);
    expect(view.dropped).toEqual({ matches: 2, standings: ["sL1"] });
    // 원래 입력은 바꾸지 않는다
    expect(input.matches).toHaveLength(17);
    expect(input.standings).toHaveLength(2);
  });

  it("15경기 이하 — 그대로(본문 문자열 같음), 숨긴 근거 없음", () => {
    for (const day of SET.days.filter((d) => d.input.matches.length <= 15)) {
      const view = briefLlmInput(day.input);
      expect(serializeBriefInput(view.input), day.date).toBe(
        serializeBriefInput(day.input),
      );
      expect(view.hiddenRefs.size).toBe(0);
    }
  });

  it("골든셋 바쁜 날(23경기) — 본문 15경기·리그 1 순위 뺌, 본문 7,945자 → 5,876자", () => {
    const view = briefLlmInput(BUSY);
    expect(view.input.matches).toHaveLength(15);
    expect(view.dropped).toEqual({ matches: 8, standings: ["sL1"] });
    expect(serializeBriefInput(BUSY).length).toBe(7945);
    expect(serializeBriefInput(view.input).length).toBe(5876);
  });
});

describe("요청 본문 = 앞 15경기(brief.ts buildBriefRequest · eval:prompt 같은 잘림)", () => {
  it("buildBriefRequest — user는 잘린 본문, D28 설정 그대로", () => {
    const req = buildBriefRequest(BUSY, SYSTEM);
    const user = JSON.parse(req.user) as BriefInput;
    expect(user.matches).toHaveLength(15);
    expect(req.user).toBe(serializeBriefInput(briefLlmInput(BUSY).input));
    expect(req).toMatchObject({
      maxTokens: 8192,
      effort: "medium",
      thinking: "adaptive",
    });
  });

  it("eval:prompt — base·pre 모두 같은 잘림, 상한 null(D51 전 재판정)은 전체", () => {
    const day = { date: "2026-10-11", input: BUSY };
    expect(buildEvalRequest(day, SYSTEM, "base").user).toBe(
      buildBriefRequest(BUSY, SYSTEM).user,
    );
    const pre = JSON.parse(buildEvalRequest(day, SYSTEM, "pre").user) as {
      matches: unknown[];
    };
    expect(pre.matches).toHaveLength(15);
    expect(evalUserMessage(BUSY, "base", null)).toBe(serializeBriefInput(BUSY));
    expect(evalHiddenRefs(BUSY, null).size).toBe(0);
    expect(evalHiddenRefs(BUSY, 15).size).toBe(9);
  });

  it("설정 판에 상한이 들어간다(상한이 다르면 id가 다르다)", async () => {
    const a = await configsFingerprint(ROOT, 15);
    const b = await configsFingerprint(ROOT, null);
    expect(a.llmMaxMatches).toBe(15);
    expect(b.llmMaxMatches).toBeNull();
    expect(a.id).not.toBe(b.id);
    expect(await configsFingerprint(ROOT)).toEqual(a);
  });
});

describe("검사기 — 모델이 보지 못한 근거 id는 ref-hidden 강등(전체 입력으로 판정)", () => {
  const tctx = {
    competitions: CTX.competitions,
    names: briefNamesFromIndex(CTX.check.names),
  };
  const view = briefLlmInput(BUSY);
  const hiddenMatch = BUSY.matches.find((m) => view.hiddenRefs.has(m.id))!;
  const visibleMatch = BUSY.matches[0]!;
  const line = (m: BriefInputMatch) => ({
    t: templateMatchLine(m, tctx)!.text,
    r: [m.id],
  });
  const respond = (lines: Array<{ t: string; r: string[] }>) => ({
    ok: true as const,
    text: JSON.stringify({ l: lines }),
  });

  it("잘린 경기의 참 문장 — hiddenRefs가 없으면 통과, 있으면 그 줄만 ref-hidden", () => {
    const lines = [line(visibleMatch), line(hiddenMatch)];
    const all = judgeBriefResponse(respond(lines), BUSY, CTX.check);
    expect(all.label).toBe("ok"); // 템플릿 문장 = 입력에서 계산한 사실
    const judged = judgeBriefResponse(respond(lines), BUSY, CTX.check, {
      hiddenRefs: view.hiddenRefs,
    });
    expect(judged.label).toBe("downgrade-line:2");
    expect(judged.check!.lines[1]!.reasons).toContainEqual({
      code: "ref-hidden",
      detail: hiddenMatch.id,
    });
    expect(judged.check!.lines[0]!.ok).toBe(true);
  });

  it("입력에 아예 없는 id는 여전히 ref-unknown(ref-hidden 아님)", () => {
    const bad = { ...line(visibleMatch), r: [visibleMatch.id, "m999"] };
    const judged = judgeBriefResponse(respond([bad]), BUSY, CTX.check, {
      hiddenRefs: view.hiddenRefs,
    });
    const codes = judged.check!.lines[0]!.reasons.map((r) => r.code);
    expect(codes).toContain("ref-unknown");
    expect(codes).not.toContain("ref-hidden");
  });

  it("템플릿은 전체 입력 기준 — 잘린 경기도 템플릿 줄을 만들 수 있다", () => {
    expect(templateMatchLine(hiddenMatch, tctx)).not.toBeNull();
    const refs = templateBriefLines(BUSY, tctx).flatMap((l) => l.refs);
    expect(refs.length).toBeGreaterThan(0);
  });
});
