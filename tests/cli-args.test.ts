import { describe, expect, it } from "vitest";

import {
  parseCollectArgs,
  parseLimit,
  resolveLlmMode,
  type CollectArgs,
  type ParseResult,
} from "../scripts/lib/cli-args";

/** 성공 결과의 값만 꺼낸다. 실패면 테스트를 깨뜨린다. */
function unwrap<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`예상치 못한 실패: ${result.error}`);
  return result.value;
}

/** 실패 결과의 메시지만 꺼낸다. 성공이면 테스트를 깨뜨린다. */
function errorOf<T>(result: ParseResult<T>): string {
  if (result.ok) throw new Error("실패를 기대했지만 성공했다");
  return result.error;
}

describe("parseCollectArgs", () => {
  it("인자가 없으면 기본값을 돌려준다", () => {
    expect(unwrap(parseCollectArgs([], undefined))).toEqual<CollectArgs>({
      limit: null,
      dry: false,
      mock: false,
      llmMode: "live",
      help: false,
    });
  });

  it("--limit 5 --dry --mock을 파싱한다", () => {
    expect(
      unwrap(parseCollectArgs(["--limit", "5", "--dry", "--mock"], "live")),
    ).toEqual<CollectArgs>({
      limit: 5,
      dry: true,
      mock: true,
      llmMode: "mock",
      help: false,
    });
  });

  it("--limit=10 형태도 받는다", () => {
    expect(unwrap(parseCollectArgs(["--limit=10"], undefined)).limit).toBe(10);
  });

  it("--help와 -h를 받는다", () => {
    expect(unwrap(parseCollectArgs(["--help"], undefined)).help).toBe(true);
    expect(unwrap(parseCollectArgs(["-h"], undefined)).help).toBe(true);
  });

  it.each([["abc"], ["0"], ["1.5"], ["1e3"], ["+5"], [""]])(
    "--limit=%j는 양의 정수가 아니라서 거부한다",
    (raw) => {
      expect(errorOf(parseCollectArgs([`--limit=${raw}`], undefined))).toMatch(
        /--limit에는 양의 정수/,
      );
    },
  );

  it("--limit 뒤에 음수를 띄어 쓰면 거부한다", () => {
    expect(errorOf(parseCollectArgs(["--limit", "-3"], undefined))).toMatch(
      /limit/,
    );
  });

  it("--limit 값이 없으면 거부한다", () => {
    expect(errorOf(parseCollectArgs(["--limit"], undefined))).toMatch(/limit/);
  });

  it("모르는 옵션은 거부한다", () => {
    expect(errorOf(parseCollectArgs(["--force"], undefined))).toMatch(/force/);
  });

  it("위치 인자는 거부한다 (npm run collect 5 처럼 `--`를 빠뜨린 경우)", () => {
    expect(errorOf(parseCollectArgs(["5"], undefined))).toMatch(/5/);
  });

  it("불리언 옵션에 값을 붙이면 거부한다", () => {
    expect(errorOf(parseCollectArgs(["--dry=yes"], undefined))).toMatch(/dry/);
  });

  it("LLM_MODE가 잘못된 값이면 거부한다", () => {
    expect(errorOf(parseCollectArgs([], "fake"))).toMatch(/LLM_MODE/);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const argv = Object.freeze(["--limit", "5", "--dry"]);
    expect(() => parseCollectArgs(argv, undefined)).not.toThrow();
    expect(argv).toEqual(["--limit", "5", "--dry"]);
  });
});

describe("parseLimit", () => {
  it.each([
    ["1", 1],
    ["5", 5],
    ["05", 5],
    ["45", 45],
  ])("%j → %d", (raw, expected) => {
    expect(unwrap(parseLimit(raw))).toBe(expected);
  });

  it("안전한 정수 범위를 넘으면 거부한다", () => {
    expect(parseLimit("9007199254740993").ok).toBe(false);
  });
});

describe("resolveLlmMode", () => {
  it("--mock은 LLM_MODE=live보다 우선한다 (LLM_MODE=mock과 같은 의미)", () => {
    expect(unwrap(resolveLlmMode(true, "live"))).toBe("mock");
  });

  it("LLM_MODE가 없거나 비어 있으면 live", () => {
    expect(unwrap(resolveLlmMode(false, undefined))).toBe("live");
    expect(unwrap(resolveLlmMode(false, ""))).toBe("live");
  });

  it("LLM_MODE=mock을 따른다", () => {
    expect(unwrap(resolveLlmMode(false, "mock"))).toBe("mock");
  });

  it("알 수 없는 LLM_MODE는 오류", () => {
    expect(resolveLlmMode(false, "LIVE").ok).toBe(false);
  });
});
