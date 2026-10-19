/**
 * 브리핑 줄 대회 comps(PRD §15 D58 — scripts/lib/brief-comps.ts). 근거 id 접두사별 규칙(경기 m… → 입력 경기 대회 · 순위 s… →
 * 약칭표 · 한국 선수 k… → 그 선수 경기의 대회 · 그 밖 건너뜀), 순서·중복·빈 결과, 템플릿 줄, fixtures 대조. 네트워크 없음.
 * 실데이터(data/briefs)는 읽지 않는다 — 2026-10-17 발행 파일의 refs는 아래에 옮겨 적었다(내용 검증은 npm run validate).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BriefFileSchema,
  CompetitionsFileSchema,
  type BriefLine,
  type CompId,
} from "@/lib/schema";

import {
  briefCompIdOf,
  briefLineComps,
  briefLinesWithComps,
  withBriefComps,
  withoutBriefComps,
  type BriefCompsConfig,
  type BriefCompsInput,
} from "../scripts/lib/brief-comps";
import type { BriefInput } from "../scripts/lib/brief-input";
import { STANDINGS_REF_CODE } from "../scripts/lib/brief-input";
import {
  ENGLISH_NAMES,
  templateBriefLines,
} from "../scripts/lib/brief-template";

const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.resolve(rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);

/** 합성 입력 — 경기 3개(EPL 2·라리가 1) + 대상 밖 대회 1(순위표 항목은 읽지 않는다 — 순위 근거 id가 약칭을 담는다) */
const INPUT: BriefCompsInput = {
  matches: [
    { id: "m1", comp: "Premier League" },
    { id: "m2", comp: "LaLiga" },
    { id: "m3", comp: "Premier League" },
    { id: "m4", comp: "FA Cup" },
  ],
};

const comps = (refs: string[], input: BriefCompsInput = INPUT): CompId[] =>
  briefLineComps(refs, input, COMPETITIONS);

describe("briefCompIdOf — 입력 대회 이름 → 대회 id", () => {
  it("competitions.json nameEn · 코드 별칭(M0 입력 'Champions League') · 대회 id 그대로(설정에 없을 때 빌더 표기)", () => {
    expect(briefCompIdOf("Premier League", COMPETITIONS)).toBe("EPL");
    expect(briefCompIdOf("LaLiga", COMPETITIONS)).toBe("LALIGA");
    expect(briefCompIdOf("UEFA Champions League", COMPETITIONS)).toBe("UCL");
    expect(briefCompIdOf("Champions League", COMPETITIONS)).toBe("UCL");
    expect(briefCompIdOf("La Liga", COMPETITIONS)).toBe("LALIGA");
    expect(briefCompIdOf("SERIEA", [])).toBe("SERIEA");
    expect(briefCompIdOf("Bundesliga", [])).toBe("BUNDESLIGA"); // 설정 없이도 별칭으로
  });

  it("6개 대회 밖·모르는 표기는 null(짐작하지 않는다)", () => {
    for (const name of ["FA Cup", "Copa del Rey", "Eredivisie", "", "epl"]) {
      expect(briefCompIdOf(name, COMPETITIONS), name).toBeNull();
    }
  });
});

describe("briefLineComps — 근거 id 접두사별 규칙", () => {
  it("경기 m… → 입력 경기의 대회", () => {
    expect(comps(["m1"])).toEqual(["EPL"]);
    expect(comps(["m2"])).toEqual(["LALIGA"]);
  });

  it("순위 s… → 약칭표(STANDINGS_REF_CODE)를 거꾸로 — 6개 대회 모두, 입력에 없어도 같은 값", () => {
    const all = Object.entries(STANDINGS_REF_CODE) as Array<[CompId, string]>;
    expect(all).toHaveLength(6);
    for (const [comp, code] of all) {
      expect(comps([`s${code}`]), code).toEqual([comp]);
      expect(comps([`s${code}`], { matches: [] }), code).toEqual([comp]);
    }
  });

  it("순위 약칭은 football-data 코드가 아니다 — sPD·sBL1·sFL1·sCL은 모르는 근거(sPL·sSA만 우연히 같다)", () => {
    for (const ref of ["sPD", "sBL1", "sFL1", "sCL", "sXX"]) {
      expect(comps([ref]), ref).toEqual([]);
    }
  });

  it("혼합 — refs에서 처음 나온 순, 중복 없음", () => {
    expect(comps(["m1", "sLL", "m3"])).toEqual(["EPL", "LALIGA"]);
    expect(comps(["sLL", "m1", "m2", "sPL"])).toEqual(["LALIGA", "EPL"]);
  });

  it("모르는 근거는 건너뛴다 — 입력에 없는 경기·대상 밖 대회·다른 접두사·블록 없는 한국 선수", () => {
    expect(comps(["m999"])).toEqual([]);
    expect(comps(["m4"])).toEqual([]); // FA Cup
    expect(comps(["x1", "t9"])).toEqual([]);
    expect(comps(["k927"])).toEqual([]); // 한국 선수 블록 없음(M3-03 전)
    expect(comps(["m999", "m4", "m2", "k927"])).toEqual(["LALIGA"]);
  });

  it("한국 선수 k… → 블록의 그 선수 경기(match)의 대회 — 경기가 입력에 없으면 건너뜀", () => {
    const withKorean: BriefCompsInput = {
      ...INPUT,
      korean: [
        { id: "k927", match: "m2" },
        { id: "k512", match: "m999" },
      ],
    };
    expect(comps(["k927"], withKorean)).toEqual(["LALIGA"]);
    expect(comps(["m2", "k927"], withKorean)).toEqual(["LALIGA"]);
    expect(comps(["k512"], withKorean)).toEqual([]);
  });

  it("2026-10-17 prod 발행 줄의 refs(data/briefs/2026-10-17.json 옮겨 적음) + 같은 날 골든 입력 → 줄마다 대회 1개", () => {
    const input = readJson(
      "fixtures/llm/golden/inputs/2026-10-17.json",
    ) as BriefInput;
    const refs = [["m558573"], ["sSA"], ["m559661"], ["m565828"], ["m564716"]];
    expect(refs.map((r) => comps(r, input))).toEqual([
      ["SERIEA"],
      ["SERIEA"],
      ["LIGUE1"],
      ["BUNDESLIGA"],
      ["LALIGA"],
    ]);
  });
});

describe("withBriefComps — 게시 줄에 대회 채우기", () => {
  const LINES: BriefLine[] = [
    { text: "가", ai: true, refs: ["m1", "sLL"] },
    { text: "나", ai: false, refs: ["m4"] },
    { text: "다", ai: true, refs: ["sPL"], comps: ["UCL"] },
  ];

  it("줄마다 refs로 다시 계산 — 비면 키 없음, 이미 있던 comps는 덮는다, 키 순서 text·ai·refs·comps, 원본은 그대로", () => {
    const before = JSON.stringify(LINES);
    const out = withBriefComps(LINES, INPUT, COMPETITIONS);
    expect(out).toEqual([
      { text: "가", ai: true, refs: ["m1", "sLL"], comps: ["EPL", "LALIGA"] },
      { text: "나", ai: false, refs: ["m4"] },
      { text: "다", ai: true, refs: ["sPL"], comps: ["EPL"] },
    ]);
    expect(out[1]).not.toHaveProperty("comps");
    expect(Object.keys(out[0]!)).toEqual(["text", "ai", "refs", "comps"]);
    expect(JSON.stringify(LINES)).toBe(before);
    expect(out[0]!.refs).not.toBe(LINES[0]!.refs);
  });

  it("줄이 없으면(empty 모드) 빈 배열", () => {
    expect(withBriefComps([], INPUT, COMPETITIONS)).toEqual([]);
  });

  it("코드 템플릿 줄(ai:false — 경기 3개인 날: 경기 3줄 + 순위 2줄)도 같은 규칙", () => {
    const input = readJson(
      "fixtures/llm/brief-inputs/2026-10-10.json",
    ) as BriefInput;
    const lines = templateBriefLines(input, {
      competitions: COMPETITIONS,
      names: ENGLISH_NAMES,
    });
    expect(lines.length).toBeGreaterThan(0);
    const out = withBriefComps(lines, input, COMPETITIONS);
    expect(out.map((l) => [l.refs, l.comps])).toEqual([
      [["m565820"], ["BUNDESLIGA"]],
      [["m559669"], ["LIGUE1"]],
      [["m564706"], ["LALIGA"]],
      [["sBL"], ["BUNDESLIGA"]],
      [["sL1"], ["LIGUE1"]],
    ]);
    expect(out.every((l) => !l.ai)).toBe(true);
  });
});

describe("fixtures 대조 — 저장된 comps = 같은 날 입력으로 계산한 값", () => {
  /** 저장된 줄 → 다시 계산한 comps와 같은가(없으면 키도 없어야 한다) */
  function expectSame(
    lines: readonly BriefLine[],
    input: BriefCompsInput,
    label: string,
  ): void {
    lines.forEach((line, i) => {
      const computed = briefLineComps(line.refs, input, COMPETITIONS);
      if (computed.length === 0) {
        expect(line, `${label} L${i + 1}`).not.toHaveProperty("comps");
      } else {
        expect(line.comps, `${label} L${i + 1}`).toEqual(computed);
      }
    });
  }

  it("fixtures/brief-sample.json(D0 표시용 6일치) — 모든 줄에 comps가 있다", () => {
    const sample = readJson("fixtures/brief-sample.json") as {
      days: unknown[];
    };
    for (const raw of sample.days) {
      const day = BriefFileSchema.parse(raw);
      const input = readJson(
        `fixtures/llm/brief-inputs/${day.date}.json`,
      ) as BriefCompsInput;
      expectSame(day.lines, input, day.date);
      for (const line of day.lines) {
        expect(line.comps?.length, `${day.date} ${line.text}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("fixtures/schema/data/briefs/2026-10-11.json(부록 A 예시) — 한국 선수 근거(k…)는 같은 경기라 대회가 겹치지 않는다", () => {
    const file = BriefFileSchema.parse(
      readJson("fixtures/schema/data/briefs/2026-10-11.json"),
    );
    const input = readJson(
      "fixtures/llm/brief-inputs/2026-10-11.json",
    ) as BriefCompsInput;
    expectSame(file.lines, input, file.date);
    expect(file.lines[0]).toMatchObject({
      refs: ["m564699", "k927"],
      comps: ["LALIGA"],
    });
  });
});

describe("briefLinesWithComps — 계산 실패는 게시를 막지 않는다(D58 리뷰)", () => {
  const line: BriefLine = {
    text: "바르셀로나가 이겼다.",
    ai: true,
    refs: ["m1", "sLL"],
  };
  const input: BriefCompsInput = { matches: [] };

  it("대회 설정을 읽다 던지면 comps 없이 원래 줄과 오류를 돌려준다", () => {
    const broken = {
      find() {
        throw new Error("설정 손상");
      },
    } as unknown as BriefCompsConfig;
    const result = briefLinesWithComps(
      [line],
      { matches: [{ id: "m1", comp: "Primera Division" }] },
      broken,
    );
    expect(result.error).toBeInstanceOf(Error);
    expect(result.lines).toEqual([
      { text: line.text, ai: true, refs: ["m1", "sLL"] },
    ]);
    expect(result.lines[0]).not.toHaveProperty("comps");
  });

  it("정상이면 오류 null과 계산한 comps", () => {
    const result = briefLinesWithComps([line], input, []);
    expect(result.error).toBeNull();
    expect(result.lines[0]?.comps).toEqual(["LALIGA"]);
  });

  it("withoutBriefComps — comps 키를 빼고 원본은 그대로", () => {
    const withComps: BriefLine = { ...line, comps: ["LALIGA"] };
    expect(withoutBriefComps([withComps])).toEqual([
      { text: line.text, ai: true, refs: ["m1", "sLL"] },
    ]);
    expect(withComps.comps).toEqual(["LALIGA"]);
  });
});
