/**
 * M1-23 브리핑 자동 사실성 검사기(scripts/lib/brief-check.ts) — FR-29 순서 zod → 코드 검증 → 1회 재시도 → 템플릿(D24·D28·D40),
 * 줄 판정은 **닫힌 문법**(scripts/lib/brief-grammar.ts — 허용 문형만 통과, D50). 네트워크·LLM 없음(LLM_MODE=mock — mock
 * fixture의 text를 그대로 판정한다). 문법 자체·지시문 v0.2 [문형]과의 일치는 tests/brief-grammar.test.ts.
 *
 * - fixtures/llm/brief-cases.json 31개: `judgeBriefResponse` 판정(expected)·단계(stage)·줄별 코드(pass·downgrade·whole·fix)가 모두 같다.
 * - 사람 검토(M0-30·M0-34 실제 출력 90줄) 대비 미탐 0, 사실이 맞는데 막힌 줄은 모두 정해진 규칙(언어·두 문장·이름 표기·문형 밖) 때문.
 * - 템플릿 문장(brief-template.ts — 입력에서 계산한 사실만 쓴다)은 검사기를 모두 통과한다(오탐 0 기준선 — 템플릿도 문법 안), 그
 *   문장을 한 군데씩 틀리게 바꾼 변형·리뷰 유형 변형은 모두 걸린다(미탐 0 기준선).
 * - 리뷰 1·2회차 재현 문장(fixtures/llm/brief-check-probes.json): 거짓 460개 모두 강등, 참은 문법 안이면 통과·밖이면 grammar-unknown.
 * - 실제 출력 문형(결승골·동점골·역전승·연장·승부차기·순위·한국 선수)의 통과·강등과 사유 코드.
 * 입력은 LLM에 보낸 그대로 = canonicalizeBriefInput을 거친 입력(M1-21 이월 — 허용 목록 briefNameAllowlist).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
} from "@/lib/schema";

import { briefLinesOverLimit, parseBriefOutput } from "../scripts/lib/brief";
import {
  briefCheckLogFields,
  briefVerdictLabel,
  checkBriefOutput,
  describeLineCheck,
  isFinalBriefAttempt,
  judgeBriefResponse,
  substituteBriefLines,
  type BriefCheckContext,
  type BriefCheckInput,
  type BriefLineCheck,
  type BriefLineReasonCode,
  type BriefResponse,
} from "../scripts/lib/brief-check";
import {
  buildBriefInput,
  type BriefInputMatch,
} from "../scripts/lib/brief-input";
import {
  briefCompLabel,
  briefNamesFromIndex,
  chooseBriefCompForm,
  templateBriefLines,
  templateMatchLine,
  templateStandingsLine,
  type BriefTemplateContext,
} from "../scripts/lib/brief-template";
import {
  buildNameIndex,
  canonicalizeBriefInput,
  playerTeamsFrom,
  substituteNames,
} from "../scripts/lib/names";
import { withJosa } from "../scripts/lib/josa";
import {
  toCompStandings,
  toFinishedResults,
} from "../scripts/lib/providers/football-data";

// 전수 검사(변형·재현 문장 수천 줄 × 23경기 입력) 테스트가 있어 이 파일만 시간 상한을 늘린다. 한 줄 검사가 입력 모형을 매번 새로
// 만들어(실제 실행은 하루 1~2회라 캐시하지 않는다) 한 테스트가 단독 2초 안팎, 전체 스위트를 병렬로 돌리면 기본 5초를 넘을 때가 있다.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const NAMES = buildNameIndex(
  NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
  COMPETITIONS,
);
const PLAYER_TEAMS = playerTeamsFrom(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json")),
);
const CTX: BriefCheckContext = { names: NAMES, competitions: COMPETITIONS };
const KO_NAMES = briefNamesFromIndex(NAMES);

/** LLM에 보낸 입력 = 입력 정리(득점자 사전 대표 표기)를 거친 입력 */
function sent(raw: unknown): BriefCheckInput {
  return canonicalizeBriefInput(raw as BriefCheckInput, NAMES, {
    playerTeams: PLAYER_TEAMS,
  }).input as BriefCheckInput;
}

// ─── fixtures/llm/brief-cases.json ─────────────────────────────────────────

const LineNote = z.object({
  n: z.number().int(),
  human: z.enum(["ok", "error", "unsupported"]).optional(),
  code: z.enum(["pass", "downgrade", "whole", "fix", "undecided"]),
});
const Case = z.object({
  id: z.string(),
  input: z.string(),
  origin: z.enum(["real", "synthetic"]),
  stage: z.enum(["none", "transport", "zod", "whole", "line"]),
  expected: z.string(),
  review: z
    .object({ ok: z.number(), error: z.number(), unsupported: z.number() })
    .optional(),
  lines: z.array(LineNote).optional(),
});
const CASES_FILE = z
  .object({
    inputs: z.record(z.string(), z.object({ file: z.string() })),
    cases: z.array(Case),
  })
  .parse(readJson("fixtures/llm/brief-cases.json"));
type BriefCase = z.infer<typeof Case>;

const Fixture = z.union([
  z.object({
    type: z.literal("succeeded"),
    text: z.string(),
    stop_reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("errored"),
    error: z.object({ type: z.string() }),
  }),
]);

function inputFor(c: BriefCase): BriefCheckInput {
  return sent(readJson(`fixtures/llm/${CASES_FILE.inputs[c.input]!.file}`));
}

/** mock fixture → 판정 입력(llm.ts가 돌려주는 모양 — max_tokens·refusal·errored는 실패) */
function responseFor(id: string): BriefResponse {
  const f = Fixture.parse(readJson(`fixtures/llm/mock/by-id/${id}.json`));
  if (f.type === "errored") return { ok: false, errorType: f.error.type };
  const stop = f.stop_reason ?? "end_turn";
  return stop === "end_turn"
    ? { ok: true, text: f.text }
    : { ok: false, errorType: stop };
}

function judgeCase(c: BriefCase) {
  return judgeBriefResponse(responseFor(c.id), inputFor(c), CTX);
}

describe("brief-cases.json 31개 — FR-29 판정·단계가 기대값과 같다(M1-23)", () => {
  it("케이스는 31개이고 미정 판정이 없다(D40 — M1-20)", () => {
    expect(CASES_FILE.cases).toHaveLength(31);
  });

  it.each(CASES_FILE.cases.map((c) => [c.id, c] as const))("%s", (_, c) => {
    const j = judgeCase(c);
    const detail = (j.check?.lines ?? [])
      .map((l) => `L${l.n} ${describeLineCheck(l)}`)
      .join("\n");
    expect(j.label, detail).toBe(c.expected);
    expect(j.stage, detail).toBe(c.stage);
    // 줄 메모 — pass·fix(조사 보정 대상)는 통과, downgrade는 강등, whole은 출력 전체 실패의 원인
    for (const note of c.lines ?? []) {
      const line = j.check?.lines[note.n - 1];
      if (note.code === "whole") {
        expect(j.check?.whole.ok, `${c.id} L${note.n}`).toBe(false);
        continue;
      }
      if (note.code === "pass" || note.code === "fix") {
        expect(
          line?.ok,
          `${c.id} L${note.n} ${line && describeLineCheck(line)}`,
        ).toBe(true);
      }
      if (note.code === "downgrade") {
        expect(line?.ok, `${c.id} L${note.n}`).toBe(false);
      }
    }
  });

  it("재시도 판정은 마지막 시도(FR-29 재시도를 이미 씀)에서 템플릿(downgrade-all)이 된다 — 하루 요청 상한 불변", () => {
    expect(isFinalBriefAttempt(1)).toBe(false);
    expect(isFinalBriefAttempt(2)).toBe(true);
    for (const c of CASES_FILE.cases.filter((x) => x.expected === "retry")) {
      const j = judgeBriefResponse(responseFor(c.id), inputFor(c), CTX, {
        finalAttempt: true,
      });
      expect(j.label, c.id).toBe("downgrade-all");
      expect(j.stage, c.id).toBe(c.stage);
    }
    // 재시도가 아닌 판정은 시도 횟수와 무관
    const ok = CASES_FILE.cases.find((c) => c.id === "brief-2026-09-19")!;
    expect(
      judgeBriefResponse(responseFor(ok.id), inputFor(ok), CTX, {
        finalAttempt: true,
      }).label,
    ).toBe("ok");
  });

  it("transport: max_tokens = 재시도(출력 전체 실패, D40 ①) · refusal·errored·연결 오류 = 바로 템플릿", () => {
    const input = inputFor(CASES_FILE.cases[0]!);
    const label = (errorType: string) =>
      judgeBriefResponse({ ok: false, errorType }, input, CTX).label;
    expect(label("max_tokens")).toBe("retry");
    expect(label("refusal")).toBe("downgrade-all");
    expect(label("overloaded_error")).toBe("downgrade-all");
    expect(label("connection_error")).toBe("downgrade-all");
  });
});

// ─── 사람 검토 대비 (오탐·미탐) ─────────────────────────────────────────────

describe("사람 검토 대비 — M0-30·M0-34 실제 출력 90줄", () => {
  /** 실제 출력 줄마다 (사람 판정, 막혔나, 사유) */
  const rows = CASES_FILE.cases
    .filter((c) => c.origin === "real" && c.stage !== "transport")
    .flatMap((c) => {
      const j = judgeCase(c);
      const human = new Map(
        (c.lines ?? []).map((l) => [l.n, l.human] as const),
      );
      return (j.check?.lines ?? []).map((l) => ({
        id: c.id,
        n: l.n,
        human: human.get(l.n) ?? "ok",
        blocked: !j.check!.whole.ok || !l.ok,
        codes: j.check!.whole.ok
          ? l.reasons.map((r) => r.code as string)
          : j.check!.whole.reasons,
      }));
    });

  it("미탐 0 — 사람이 틀림(error)·근거 없음(unsupported)으로 본 7줄은 모두 막힌다", () => {
    expect(rows).toHaveLength(90);
    const bad = rows.filter((r) => r.human !== "ok");
    expect(bad).toHaveLength(7);
    expect(bad.filter((r) => !r.blocked)).toEqual([]);
  });

  // D50(닫힌 문법) 뒤로 사실은 맞지만 문형 밖인 줄(쉼표 절·흐름 서술·목록 밖 술어·괄호·두 경기 나열 — M0-30·M0-34 지시문은 자유
  // 문장이었다)이 grammar-unknown으로 강등된다: 21 → 35줄(정상 줄 83줄의 42.2%) → D53 ② 문형 축소 뒤 37줄(44.6%) → D55 ② 승패
  // 문장 주어 팀 점수 먼저만(원정 승을 홈-원정 순서로 쓴 3줄) 40줄(48.2%). 지시문 v0.2~v0.4 출력의 실측은 골든셋(M1-24·D53 ③·D55)
  it("사실이 맞는데 막힌 40줄은 모두 정해진 규칙 때문이다(언어 10 · 이름 표기 5 · 두 문장·80자 3 · 문형 밖 19 · 점수 순서 3) — 규칙 밖 오탐 0", () => {
    const category = (codes: readonly string[]): string => {
      if (codes.includes("han") || codes.includes("korean-ratio"))
        return "language";
      if (
        ["sentence-multi", "over-limit", "sentence-form"].some((x) =>
          codes.includes(x),
        )
      )
        return "sentence";
      if (["latin-token", "ko-name-unofficial"].some((x) => codes.includes(x)))
        return "name-form";
      // 문형 밖(D50) — 사유가 grammar-unknown뿐(슬롯 대조로는 걸리지 않았다 = 사실과 어긋난 슬롯 없음)
      if (codes.length > 0 && codes.every((x) => x === "grammar-unknown"))
        return "grammar";
      // 승패 문장의 홈-원정 순서 점수(D55 ② — 주어 팀 점수 먼저만, 사실은 맞다)
      if (codes.length > 0 && codes.every((x) => x === "score-order"))
        return "score-order";
      return `other:${codes.join(",")}`;
    };
    const blockedOk = rows.filter((r) => r.human === "ok" && r.blocked);
    const counts: Record<string, number> = {};
    for (const r of blockedOk) {
      const k = category(r.codes);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts).toEqual({
      language: 10,
      "name-form": 5,
      sentence: 3,
      grammar: 19,
      "score-order": 3,
    });
    // 출력 전체 재시도(언어) 10줄을 빼면 줄 단위 강등 30/73(41.1%)
    const lineOnly = rows.filter(
      (r) =>
        r.human === "ok" &&
        !r.codes.includes("han") &&
        !r.codes.includes("korean-ratio"),
    );
    expect(lineOnly).toHaveLength(73);
    expect(lineOnly.filter((r) => r.blocked)).toHaveLength(30);
  });
});

// ─── fixtures/brief-sample.json ───────────────────────────────────────────

describe("fixtures/brief-sample.json (D0 표시용 6일치)", () => {
  const Sample = z.object({
    days: z.array(
      z.object({
        date: z.string(),
        lines: z.array(
          z.object({
            text: z.string(),
            ai: z.boolean(),
            refs: z.array(z.string()),
            textRaw: z.string().optional(),
          }),
        ),
      }),
    ),
  });
  const sample = Sample.parse(readJson("fixtures/brief-sample.json"));
  const inputByDate = (date: string) =>
    sent(readJson(`fixtures/llm/brief-inputs/${date}.json`));

  it("LLM 줄(textRaw) 24줄 중 막히는 줄은 mock 판정과 같은 5줄(10-10 L1 두 문장·80자, 09-11 L5 문형 밖 '1라운드 후 … 상위 5위에 올랐다', 09-11 L4·09-21 L2·10-11 L1 원정 승 홈-원정 순서 — D55 ②), 템플릿 줄 3줄은 통과", () => {
    const blocked: string[] = [];
    let ai = 0;
    let template = 0;
    for (const day of sample.days) {
      const lines = day.lines.map((l) => ({
        t: l.ai ? l.textRaw! : l.text,
        r: l.refs,
      }));
      const res = checkBriefOutput(lines, inputByDate(day.date), CTX);
      expect(res.whole.ok, day.date).toBe(true);
      res.lines.forEach((l, i) => {
        if (day.lines[i]!.ai) ai += 1;
        else template += 1;
        if (!l.ok) blocked.push(`${day.date} L${l.n}`);
      });
    }
    expect(ai).toBe(24);
    expect(template).toBe(3);
    expect(blocked.sort()).toEqual([
      "2026-09-11 L4",
      "2026-09-11 L5",
      "2026-09-21 L2",
      "2026-10-10 L1",
      "2026-10-11 L1",
    ]);
  });
});

// ─── 템플릿 자기 검증(오탐 0) · 변형(미탐 0) ─────────────────────────────────

/** M0-30·M0-34 입력 6일치 + 2026-10-10 football-data 실응답 입력 */
const REAL_INPUTS: BriefCheckInput[] = [
  ...readdirSync(path.join(ROOT, "fixtures/llm/brief-inputs"))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => sent(readJson(`fixtures/llm/brief-inputs/${f}`))),
  buildBriefInput({
    briefDate: "2026-10-11",
    results: toFinishedResults(
      (
        readJson(
          "fixtures/football/football-data/matches-6comps-2026-10-10.json",
        ) as { matches: unknown[] }
      ).matches,
      COMPETITIONS,
      { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
    ).results,
    competitions: COMPETITIONS,
    standings: (["pl", "pd", "sa", "bl1", "fl1"] as const).map((code) =>
      toCompStandings(
        readJson(
          `fixtures/football/football-data/standings-${code}-2026-10-11.json`,
        ),
        COMPETITIONS.find((c) => c.footballDataCode.toLowerCase() === code)!,
        { fetchedAt: "2026-10-11T06:45:00.000Z", inProgress: 0 },
      ),
    ),
  }).input,
];

const g = (
  min: string,
  team: string,
  player: string,
  type?: "penalty" | "own_goal",
) => (type ? { min, team, player, type } : { min, team, player });
const M = (over: Partial<BriefInputMatch>): BriefInputMatch => ({
  id: "m1",
  comp: "Premier League",
  round: "Matchday 6",
  home: "Arsenal",
  away: "Chelsea",
  ft: "2-1",
  goals: null,
  ...over,
});

/** 템플릿 문형의 모든 갈래(원정 승·완파·역전승·PK 결승골·자책골·동점골·해트트릭·4골·연장·승부차기 두 갈래·결승) */
const SCENARIOS: BriefInputMatch[] = [
  M({}),
  M({ ft: "0-2" }),
  M({ ft: "4-0" }),
  M({ ft: "1-1" }),
  M({ ft: "0-0" }),
  M({ ft: "2-1", ht: "0-1" }),
  M({ ft: "1-3", ht: "1-0" }),
  M({
    ft: "2-1",
    goals: [
      g("10", "Chelsea", "Cole Palmer"),
      g("55", "Arsenal", "Bukayo Saka"),
      g("90+2", "Arsenal", "Martin Ødegaard", "penalty"),
    ],
  }),
  M({ ft: "1-0", goals: [g("30", "Arsenal", "Reece James", "own_goal")] }),
  M({
    ft: "2-2",
    goals: [
      g("5", "Arsenal", "Bukayo Saka"),
      g("20", "Chelsea", "Cole Palmer"),
      g("60", "Arsenal", "Bukayo Saka"),
      g("88", "Chelsea", "Cole Palmer", "penalty"),
    ],
  }),
  M({
    ft: "4-1",
    goals: [
      g("5", "Arsenal", "Bukayo Saka"),
      g("20", "Arsenal", "Bukayo Saka"),
      g("33", "Chelsea", "Cole Palmer"),
      g("60", "Arsenal", "Bukayo Saka"),
      g("70", "Arsenal", "Declan Rice"),
    ],
  }),
  M({
    ft: "4-0",
    goals: [
      g("5", "Arsenal", "Bukayo Saka"),
      g("20", "Arsenal", "Bukayo Saka"),
      g("60", "Arsenal", "Bukayo Saka"),
      g("80", "Arsenal", "Bukayo Saka"),
    ],
  }),
  ...(
    [
      ["QUARTER_FINALS", "2-1", "1-1", undefined],
      ["QUARTER_FINALS", "2-1", "2-1", undefined],
      ["QUARTER_FINALS", "2-1", undefined, undefined],
      ["SEMI_FINALS", "1-1", "1-1", "4-3"],
      ["SEMI_FINALS", "1-1", "1-1", "3-5"],
      ["LAST_16", "1-0", "1-0", "2-4"],
      ["FINAL", "1-1", "1-1", "5-4"],
    ] as const
  ).map(([round, ft, regular, pens]) =>
    M({
      comp: "UEFA Champions League",
      round,
      ft,
      aet: true,
      ...(regular ? { regular } : {}),
      ...(pens ? { pens } : {}),
    }),
  ),
  M({ comp: "UEFA Champions League", round: "FINAL", ft: "2-0" }),
  M({
    comp: "UEFA Champions League",
    round: "League phase MD 3",
    home: "Bayern",
    away: "Bodø/Glimt",
    ft: "5-0",
  }),
];

const STANDINGS = [
  {
    id: "sPL",
    comp: "Premier League",
    note: "current table, top 4 positions only",
    rows: [
      { pos: 1, team: "Arsenal", played: 6, pts: 15, gd: 8 },
      { pos: 1, team: "Chelsea", played: 6, pts: 15, gd: 8 },
      { pos: 3, team: "Liverpool", played: 6, pts: 13, gd: 5 },
      { pos: 4, team: "Man City", played: 6, pts: 11, gd: 4 },
    ],
  },
  {
    id: "sBL",
    comp: "Bundesliga",
    note: "current table, top 4 positions only",
    rows: [
      { pos: 1, team: "Dortmund", played: 5, pts: 13, gd: 7 },
      { pos: 2, team: "Bayern", played: 5, pts: 11, gd: 12 },
      { pos: 3, team: "Freiburg", played: 5, pts: 10, gd: 3 },
      { pos: 3, team: "Bremen", played: 5, pts: 10, gd: 3 },
    ],
  },
];

const TEMPLATE_CTXS: Array<[string, BriefTemplateContext]> = [
  ["한글 이름", { competitions: COMPETITIONS, names: KO_NAMES }],
  ["영문 이름(사전 없음)", { competitions: COMPETITIONS }],
];

function one(
  text: string,
  refs: string[],
  input: BriefCheckInput,
): { line: BriefLineCheck; wholeOk: boolean } {
  const res = checkBriefOutput([{ t: text, r: refs }], input, CTX);
  return { line: res.lines[0]!, wholeOk: res.whole.ok };
}

describe("템플릿 문장은 모두 통과한다(오탐 0 기준선 — 템플릿은 입력에서 계산한 사실만 쓴다)", () => {
  it.each(TEMPLATE_CTXS)(
    "실제 입력 7일치 — 브리핑 줄 + 모든 경기 줄 (%s)",
    (_, tctx) => {
      let checked = 0;
      for (const input of REAL_INPUTS) {
        const form = chooseBriefCompForm(input, tctx);
        const lines = [
          ...templateBriefLines(input, tctx),
          ...input.matches.flatMap(
            (m) => templateMatchLine(m, { ...tctx, compForm: form }) ?? [],
          ),
        ];
        const res = checkBriefOutput(
          lines.map((l) => ({ t: l.text, r: l.refs })),
          input,
          CTX,
        );
        expect(res.whole.ok, input.briefDate).toBe(true);
        res.lines.forEach((l, i) => {
          expect(l.ok, `${lines[i]!.text} → ${describeLineCheck(l)}`).toBe(
            true,
          );
        });
        checked += lines.length;
      }
      expect(checked).toBeGreaterThan(90);
    },
  );

  it.each(TEMPLATE_CTXS)(
    "합성 경기(연장·승부차기·결승·자책골·동점골·해트트릭)와 공동 순위표 (%s)",
    (_, tctx) => {
      for (const m of SCENARIOS) {
        const line = templateMatchLine(m, tctx);
        expect(line, JSON.stringify(m)).not.toBeNull();
        const { line: l, wholeOk } = one(line!.text, line!.refs, {
          briefDate: "2026-10-11",
          matches: [m],
          standings: [],
        });
        expect(wholeOk).toBe(true);
        expect(l.ok, `${line!.text} → ${describeLineCheck(l)}`).toBe(true);
      }
      for (const s of STANDINGS) {
        const line = templateStandingsLine(s, tctx)!;
        const { line: l } = one(line.text, line.refs, {
          briefDate: "2026-10-11",
          matches: [],
          standings: [s],
        });
        expect(l.ok, `${line.text} → ${describeLineCheck(l)}`).toBe(true);
      }
    },
  );
});

/** 템플릿 문장 한 군데를 틀리게 바꾼 변형 — 모두 사실과 다르다(뒤집은 점수가 홈-원정 순서인 원정 승리는 합법이라 뺀다) */
function mutations(
  text: string,
  m: BriefInputMatch | null,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const sc = /(\d+)-(\d+)/.exec(text);
  if (sc) {
    out.push(["점수+1", text.replace(sc[0], `${Number(sc[1]) + 1}-${sc[2]}`)]);
    if (sc[1] !== sc[2] && !(m && `${sc[2]}-${sc[1]}` === m.ft))
      out.push(["점수 뒤집기", text.replace(sc[0], `${sc[2]}-${sc[1]}`)]);
  }
  const mn = /(\d+)(\+\d+)?분/.exec(text);
  if (mn)
    out.push([
      "분+1",
      text.replace(mn[0], `${Number(mn[1]) + 1}${mn[2] ?? ""}분`),
    ]);
  const rk = /(\d+)위/.exec(text);
  if (rk) out.push(["순위+1", text.replace(rk[0], `${Number(rk[1]) + 1}위`)]);
  const pt = /승점 (\d+)/.exec(text);
  if (pt)
    out.push(["승점+1", text.replace(pt[0], `승점 ${Number(pt[1]) + 1}`)]);
  if (/꺾었다|이겼다|완파했다/.test(text))
    out.push(["승→패", text.replace(/꺾었다|이겼다|완파했다/, "졌다")]);
  if (/비겼다/.test(text))
    out.push(["무→승", text.replace("비겼다", "이겼다")]);
  if (/선두|\d위다/.test(text))
    out.push([
      "순위 변동 추가",
      text.replace(/(선두|\d+위)(다|,)/, "$1로 올라섰$2"),
    ]);
  out.push(["한자", text.replace(/다\.$/, "出场다.")]);
  if (/해트트릭/.test(text))
    out.push(["해트트릭→2골", text.replace("해트트릭을", "2골을")]);
  if (/결승골/.test(text))
    out.push(["결승골→동점골", text.replace("결승골", "동점골")]);
  if (/동점골/.test(text))
    out.push(["동점골→결승골", text.replace("동점골", "결승골")]);
  if (/홈경기에서/.test(text))
    out.push(["홈→원정", text.replace("홈경기에서", "원정에서")]);
  if (m) {
    const [h, a] = m.ft.split("-").map(Number);
    for (const [home, away] of [
      [m.home, m.away],
      [KO_NAMES.team(m.home), KO_NAMES.team(m.away)],
    ] as const) {
      if (text.includes(home) && text.includes(away) && h !== a) {
        out.push([
          "팀 맞바꾸기",
          text
            .replace(home, "\u0001")
            .replace(away, home)
            .replace("\u0001", away),
        ]);
      }
    }
    const players = [...new Set((m.goals ?? []).map((x) => x.player))];
    for (const p of players)
      for (const q of players)
        for (const [pp, qq] of [
          [p, q],
          [KO_NAMES.person(p), KO_NAMES.person(q)],
        ] as const)
          if (pp !== qq && text.includes(pp) && !text.includes(qq))
            out.push(["득점자 바꾸기", text.replace(pp, qq)]);
    if (m.pens && /이겼다/.test(text))
      out.push(["승부차기→비겼다", text.replace("이겼다", "비겼다")]);
    if (!m.aet)
      out.push(["연장 추가", text.replace(/(\d+-\d+)/, "연장까지 $1")]);
    if (
      !(m.goals ?? []).some((x) => x.type === "penalty") &&
      /결승골/.test(text)
    )
      out.push(["PK 추가", text.replace("결승골", "PK 결승골")]);
    if (Math.abs(h! - a!) < 3 && /꺾었다/.test(text))
      out.push(["완파 추가", text.replace("꺾었다", "완파했다")]);
  }
  return out.filter(([, t]) => t !== text);
}

/**
 * 리뷰 유형 변형(M1-23 리뷰 — 템플릿 어휘 변형은 동의어·숫자 없는 서술·장소·소속을 시험하지 못했다). 경기 1건과 그 이름 표기로
 * 사실과 다른 문장을 만든다 — 모두 걸려야 한다.
 */
function reviewMutations(
  m: BriefInputMatch,
  team: (n: string) => string,
  person: (n: string) => string,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const [h, a] = m.ft.split("-").map(Number) as [number, number];
  const pens = m.pens?.split("-").map(Number) as [number, number] | undefined;
  const winnerSide = pens
    ? pens[0] > pens[1]
      ? "home"
      : "away"
    : h > a
      ? "home"
      : h < a
        ? "away"
        : null;
  const H = team(m.home);
  const A = team(m.away);
  if (winnerSide) {
    const W = winnerSide === "home" ? H : A;
    const L = winnerSide === "home" ? A : H;
    const hw = `${h}-${a}`; // 홈-원정 순서(D30 — 순서로는 걸리지 않는다)
    // 목록 밖 승패 동사 + 주어 뒤바꿈
    for (const v of ["제쳤다", "따돌렸다", "울렸다"])
      out.push([
        `동의어 ${v}`,
        `${withJosa(L, "이/가")} ${withJosa(W, "을/를")} ${withJosa(hw, "으로/로")} ${v}.`,
      ]);
    out.push([
      "동의어 웃었다",
      `${withJosa(L, "이/가")} ${withJosa(W, "을/를")} 상대로 ${withJosa(hw, "으로/로")} 웃었다.`,
    ]);
    for (const v of [
      "무너졌다",
      "발목을 잡혔다",
      "고개를 숙였다",
      "일격을 당했다",
    ])
      out.push([
        `동의어 ${v}`,
        `${withJosa(W, "이/가")} ${L}에 ${withJosa(hw, "으로/로")} ${v}.`,
      ]);
    // 진 팀이 최종 점수로 앞섰다(불가능)
    const w = winnerSide === "home" ? h : a;
    const l = winnerSide === "home" ? a : h;
    if (!pens && w > l)
      out.push([
        "진 팀 앞섰다",
        `${withJosa(L, "이/가")} ${withJosa(`${w}-${l}`, "으로/로")} 앞섰다.`,
      ]);
    // 장소 반대
    if (m.round !== "FINAL") {
      const venue = winnerSide === "home" ? "원정길에서" : "홈 팬들 앞에서";
      out.push([
        "장소 반대",
        `${withJosa(W, "이/가")} ${venue} ${withJosa(L, "을/를")} ${withJosa(`${w}-${l}`, "으로/로")} 꺾었다.`,
      ]);
    }
    // 목록 밖 평가어(사용자 결정 — 점수 차가 맞아도 강등)
    out.push([
      "목록 밖 평가어",
      `${withJosa(W, "이/가")} ${withJosa(L, "을/를")} ${withJosa(`${w}-${l}`, "으로/로")} 대파했다.`,
    ]);
    // 종류 모르는 숫자
    out.push([
      "종류 모르는 숫자",
      `${withJosa(W, "이/가")} 슈팅 7개 끝에 ${withJosa(L, "을/를")} ${withJosa(`${w}-${l}`, "으로/로")} 꺾었다.`,
    ]);
  }
  const goals = m.goals ?? [];
  const scorers = new Set(
    goals.filter((x) => x.type !== "own_goal").map((x) => x.player),
  );
  for (const x of goals) {
    const P = person(x.player);
    if (x.type === "own_goal") {
      // 자책골을 일반 골처럼
      out.push([
        "자책골→골",
        `${withJosa(P, "이/가")} ${x.min}분 골을 넣었다.`,
      ]);
      continue;
    }
    // 소속 오류 — 상대 팀 선수라고 쓴다
    const otherTeam = x.team === m.home ? A : H;
    out.push([
      "소속 오류",
      `${otherTeam}의 ${withJosa(P, "이/가")} ${x.min}분 골을 넣었다.`,
    ]);
    out.push(["시즌 n호골", `${withJosa(P, "이/가")} 시즌 2호골을 터뜨렸다.`]);
    if (x.assist && !scorers.has(x.assist))
      out.push([
        "도움 선수 득점",
        `${withJosa(person(x.assist), "이/가")} 골을 넣었다.`,
      ]);
  }
  for (const x of goals) {
    // 득점 수 부풀리기(개수 표현)
    const n = goals.filter(
      (y) => y.player === x.player && y.type !== "own_goal",
    ).length;
    if (x.type !== "own_goal")
      out.push([
        "골 n개",
        `${withJosa(person(x.player), "이/가")} 골 ${n + 1}개를 넣었다.`,
      ]);
  }
  return out;
}

/** 순위표 변형 — prev 없는 순위 변동 동의어(D40 ③) */
function standingsReviewMutations(
  st: (typeof STANDINGS)[number],
  team: (n: string) => string,
): Array<[string, string]> {
  const first = team(st.rows[0]!.team);
  const second = st.rows.find((r) => r.pos === 2);
  const out: Array<[string, string]> = [
    ["선두 되찾음", `${withJosa(first, "이/가")} 선두를 되찾았다.`],
    ["선두 자리 꿰참", `${withJosa(first, "이/가")} 선두 자리를 꿰찼다.`],
    ["선두로 나섬", `${withJosa(first, "이/가")} 선두로 나섰다.`],
  ];
  if (second) {
    const S = team(second.team);
    out.push(["한 계단 밀림", `${withJosa(S, "은/는")} 2위로 한 계단 밀렸다.`]);
    out.push([
      "끌어내림",
      `${withJosa(first, "이/가")} ${withJosa(S, "을/를")} 2위로 끌어내렸다.`,
    ]);
  }
  return out;
}

describe("리뷰 재현 문장(fixtures/llm/brief-check-probes.json — 1·2·3회차) — 거짓은 모두 강등, 참은 문법 안이면 통과", () => {
  const Probe = z.object({
    input: z.string(),
    /** 기대 판정 */
    pass: z.boolean(),
    /** 사람 판정(사실 여부) */
    truth: z.boolean(),
    group: z.string(),
    t: z.string(),
    r: z.array(z.string()),
    note: z.string().optional(),
    /** 참인데 강등되는 문장의 사유(없으면 grammar-unknown — 문형 밖) */
    code: z.string().optional(),
  });
  const file = z
    .object({
      inputs: z.record(z.string(), z.unknown()),
      probes: z.array(Probe),
    })
    .parse(readJson("fixtures/llm/brief-check-probes.json"));
  const inputs = new Map(
    Object.entries(file.inputs).map(([k, v]) => [
      k,
      sent(typeof v === "string" ? readJson(`fixtures/llm/${v}`) : v),
    ]),
  );
  const round = (p: z.infer<typeof Probe>) =>
    p.group.startsWith("r3-") ? 3 : p.group.startsWith("r2-") ? 2 : 1;

  it("문장 수 — 1회차 158(거짓 112 · 참 46), 2회차 511(거짓 348 · 참 163), 3회차 788(재현 316 = 거짓 122 · 참 194, 이전 판을 통과한 변이 472 = 거짓 264 · 참 208)", () => {
    const of = (n: number, truth: boolean) =>
      file.probes.filter((p) => round(p) === n && p.truth === truth);
    expect(of(1, false)).toHaveLength(112);
    expect(of(1, true)).toHaveLength(46);
    expect(of(2, false)).toHaveLength(348);
    expect(of(2, true)).toHaveLength(163);
    expect(of(3, false)).toHaveLength(386);
    expect(of(3, true)).toHaveLength(402);
    expect(
      of(3, false).filter((p) => p.group.startsWith("r3-mut-")),
    ).toHaveLength(264);
    // 거짓은 늘 강등 기대. 참 611 중 문법 안 325 · 강등 286(문형 밖 257 + 안전한 쪽 규칙 29 — 좁은 동점골·두 절 다른 대상·문자 형식 …
    // + 승패 문장 홈-원정 순서 점수 15(D55 ② — 주어 팀 점수 먼저만))
    expect(file.probes.filter((p) => !p.truth && p.pass)).toEqual([]);
    expect(file.probes.filter((p) => p.truth && p.pass)).toHaveLength(325);
    expect(file.probes.filter((p) => p.truth && !p.pass)).toHaveLength(286);
    expect(file.probes.filter((p) => p.code !== undefined)).toHaveLength(29);
    expect(
      file.probes.filter((p) => p.code === "score-order").map((p) => p.truth),
    ).toEqual(Array(15).fill(true));
  });

  it.each(
    [...new Set(file.probes.map((p) => p.group))].map((g) => [g] as const),
  )("%s", (group) => {
    for (const p of file.probes.filter((x) => x.group === group)) {
      const res = checkBriefOutput(
        [{ t: p.t, r: p.r }],
        inputs.get(p.input)!,
        CTX,
      );
      const line = res.lines[0]!;
      const ok = res.whole.ok && line.ok;
      expect(ok, `${p.t} → ${describeLineCheck(line)}`).toBe(p.pass);
      // 참인데 강등되는 문장은 문형 밖(grammar-unknown만)이어야 한다 — 슬롯 대조에 걸리면 검사기가 참을 거짓으로 본 것(오탐)
      if (p.truth && !p.pass) {
        const codes = line.reasons.map((r) => r.code);
        if (p.code) expect(codes, p.t).toContain(p.code);
        else
          expect(codes, `${p.t} → ${describeLineCheck(line)}`).toEqual([
            "grammar-unknown",
          ]);
      }
    }
  });
});

describe("리뷰 유형의 참 문장(문형 안)은 통과한다(오탐 기준선)", () => {
  it.each(TEMPLATE_CTXS)(
    "실제 입력 7일치 모든 경기 — 맞는 장소·패자 주어 점수 먼저·완파·소속·n골·'Y의 골을 도왔다' (%s)",
    (_, tctx) => {
      const team = (n: string) => (tctx.names ? tctx.names.team(n) : n);
      const person = (n: string) => (tctx.names ? tctx.names.person(n) : n);
      const blocked: string[] = [];
      let total = 0;
      for (const input of REAL_INPUTS) {
        for (const m of input.matches) {
          const out: string[] = [];
          const [h, a] = m.ft.split("-").map(Number) as [number, number];
          const H = team(m.home);
          const A = team(m.away);
          if (h !== a && !m.aet) {
            const homeWon = h > a;
            const W = homeWon ? H : A;
            const L = homeWon ? A : H;
            const w = Math.max(h, a);
            const l = Math.min(h, a);
            out.push(
              `${withJosa(W, "이/가")} ${homeWon ? "홈에서" : "원정에서"} ${withJosa(L, "을/를")} ${withJosa(`${w}-${l}`, "으로/로")} 꺾었다.`,
            );
            out.push(
              `${withJosa(L, "이/가")} ${W}에 ${withJosa(`${l}-${w}`, "으로/로")} 졌다.`,
            );
            if (w - l >= 3)
              out.push(
                `${withJosa(W, "이/가")} ${withJosa(L, "을/를")} ${withJosa(`${w}-${l}`, "으로/로")} 완파했다.`,
              );
          }
          for (const x of m.goals ?? []) {
            const P = person(x.player);
            // 자책골·'도움을 기록했다' 꼴은 D53 ② 축소로 문형 밖(이 시험은 문형 안의 참 문장만)
            if (x.type === "own_goal") continue;
            out.push(
              `${x.team === m.home ? H : A}의 ${withJosa(P, "이/가")} ${x.min}분 골을 넣었다.`,
            );
            const n = (m.goals ?? []).filter(
              (y) => y.player === x.player && y.type !== "own_goal",
            ).length;
            out.push(`${withJosa(P, "이/가")} ${n}골을 넣었다.`);
            if (x.assist) {
              out.push(
                `${withJosa(person(x.assist), "이/가")} ${person(x.player)}의 ${x.min}분 골을 도왔다.`,
              );
            }
          }
          for (const t of out) {
            total += 1;
            const { line, wholeOk } = one(t, [m.id], input);
            if (!line.ok || !wholeOk)
              blocked.push(`${t} → ${describeLineCheck(line)}`);
          }
        }
      }
      expect(blocked).toEqual([]);
      expect(total).toBeGreaterThan(250);
    },
  );
});

describe("승패 문장 점수 순서 — 주어 팀 점수 먼저만(D55 ② — D30 보강, 2026-10-17 사용자 결정)", () => {
  it.each(TEMPLATE_CTXS)(
    "실제 입력 7일치 원정 승리 경기 — 승패 문장의 홈-원정 순서는 score-order, 주어 팀 먼저는 통과, 'A와 B의 경기는'은 앞 팀 먼저 그대로 (%s)",
    (_, tctx) => {
      const team = (n: string) => (tctx.names ? tctx.names.team(n) : n);
      const wrong: string[] = [];
      let away = 0;
      for (const input of REAL_INPUTS) {
        for (const m of input.matches) {
          const [h, a] = m.ft.split("-").map(Number) as [number, number];
          if (m.aet || m.pens || !(a > h)) continue;
          away += 1;
          const H = team(m.home);
          const A = team(m.away);
          const hw = withJosa(`${h}-${a}`, "으로/로"); // 홈-원정 순서
          const aw = withJosa(`${a}-${h}`, "으로/로"); // 원정(주어) 먼저
          const cases: Array<[string, BriefLineReasonCode | null]> = [
            [
              `${withJosa(A, "이/가")} ${H} 원정에서 ${hw} 이겼다.`,
              "score-order",
            ],
            [
              `${withJosa(A, "이/가")} ${withJosa(H, "을/를")} ${hw} 꺾었다.`,
              "score-order",
            ],
            [
              `${withJosa(A, "이/가")} ${H}에 ${h}-${a} 승리를 거뒀다.`,
              "score-order",
            ],
            [`${withJosa(A, "이/가")} ${H} 원정에서 ${aw} 이겼다.`, null],
            [`${withJosa(H, "이/가")} 홈에서 ${A}에 ${hw} 졌다.`, null],
            [
              `${withJosa(H, "이/가")} 홈에서 ${A}에 ${aw} 졌다.`,
              "score-order",
            ],
            [`${withJosa(H, "과/와")} ${A}의 경기는 ${hw} 끝났다.`, null],
            [`${withJosa(A, "과/와")} ${H}의 경기는 ${aw} 끝났다.`, null],
            [
              `${withJosa(A, "과/와")} ${H}의 경기는 ${hw} 끝났다.`,
              "score-order",
            ],
          ];
          for (const [t, want] of cases) {
            const { line, wholeOk } = one(t, [m.id], input);
            const codes = line.reasons.map((r) => r.code);
            const ok = line.ok && wholeOk;
            if (want === null ? !ok : ok || !codes.includes(want))
              wrong.push(
                `${t} → ${describeLineCheck(line)} (기대 ${want ?? "통과"})`,
              );
          }
        }
      }
      expect(wrong).toEqual([]);
      expect(away).toBeGreaterThan(10);
    },
  );
});

describe("변형은 모두 걸린다(미탐 0 기준선)", () => {
  it.each(TEMPLATE_CTXS)("템플릿 문장 1곳 변형 (%s)", (_, tctx) => {
    const missed: string[] = [];
    let total = 0;
    const run = (
      text: string,
      refs: string[],
      m: BriefInputMatch | null,
      input: BriefCheckInput,
    ) => {
      for (const [kind, t] of mutations(text, m)) {
        total += 1;
        const { line, wholeOk } = one(t, refs, input);
        if (line.ok && wholeOk) missed.push(`[${kind}] ${t}`);
      }
    };
    for (const m of SCENARIOS) {
      const line = templateMatchLine(m, tctx)!;
      run(line.text, line.refs, m, {
        briefDate: "2026-10-11",
        matches: [m],
        standings: [],
      });
    }
    for (const s of STANDINGS) {
      const line = templateStandingsLine(s, tctx)!;
      run(line.text, line.refs, null, {
        briefDate: "2026-10-11",
        matches: [],
        standings: [s],
      });
    }
    // 실제 입력 7일치의 브리핑 줄(실제 팀·선수 이름·득점·순위표)
    for (const input of REAL_INPUTS) {
      for (const line of templateBriefLines(input, tctx)) {
        const m = input.matches.find((x) => x.id === line.refs[0]) ?? null;
        run(line.text, line.refs, m, input);
      }
    }
    expect(missed).toEqual([]);
    expect(total).toBeGreaterThan(250);
  });

  it.each(TEMPLATE_CTXS)(
    "리뷰 유형 변형 — 동의어 동사·진 팀 앞섬·장소·소속·자책골·도움 선수 득점·개수·숫자·목록 밖 평가어·prev 없는 순위 변동 (%s)",
    (_, tctx) => {
      const team = (n: string) => (tctx.names ? tctx.names.team(n) : n);
      const person = (n: string) => (tctx.names ? tctx.names.person(n) : n);
      const missed: string[] = [];
      let total = 0;
      const run = (
        kind: string,
        t: string,
        refs: string[],
        input: BriefCheckInput,
      ) => {
        total += 1;
        const { line, wholeOk } = one(t, refs, input);
        if (line.ok && wholeOk) missed.push(`[${kind}] ${t}`);
      };
      for (const m of SCENARIOS) {
        const input: BriefCheckInput = {
          briefDate: "2026-10-11",
          matches: [m],
          standings: [],
        };
        for (const [kind, t] of reviewMutations(m, team, person))
          run(kind, t, [m.id], input);
      }
      for (const input of REAL_INPUTS) {
        for (const m of input.matches) {
          for (const [kind, t] of reviewMutations(m, team, person))
            run(kind, t, [m.id], input);
        }
      }
      for (const st of STANDINGS) {
        const input: BriefCheckInput = {
          briefDate: "2026-10-11",
          matches: [],
          standings: [st],
        };
        for (const [kind, t] of standingsReviewMutations(st, team))
          run(kind, t, [st.id], input);
      }
      expect(missed).toEqual([]);
      expect(total).toBeGreaterThan(1000);
    },
  );
});

// ─── v0.1 문형 — 통과·강등과 사유 코드 ─────────────────────────────────────

type Probe = [text: string, refs: string[], expect: string | null];

function runProbes(input: BriefCheckInput, probes: readonly Probe[]) {
  const res = checkBriefOutput(
    probes.map(([t, r]) => ({ t, r })),
    input,
    CTX,
  );
  return res.lines.map((l, i) => ({ probe: probes[i]!, l }));
}

const INPUT_E = sent(readJson("fixtures/llm/brief-inputs/2026-10-11.json"));
const INPUT_A = sent(readJson("fixtures/llm/brief-inputs/2026-09-19.json"));

/** 입력 E(2026-10-11, 23경기·득점 13경기·5대 리그 순위 상위 4) */
const PROBES_E: Probe[] = [
  [
    "Real Madrid가 Yan Diomande의 62분 결승골로 Villarreal을 1-0으로 꺾었다.",
    ["m564702"],
    null,
  ],
  [
    "Chelsea가 João Pedro의 멀티골을 앞세워 Bournemouth를 5-1로 완파했다.",
    ["m560595"],
    "grammar-unknown",
  ],
  [
    "Napoli는 Kevin De Bruyne의 PK 포함 2골로 Frosinone을 3-0으로 꺾었다.",
    ["m558586"],
    "grammar-unknown",
  ],
  [
    "PSG가 Le Mans를 3-1로 꺾었고 Khvicha Kvaratskhelia가 61분 골을 넣었다.",
    ["m559672"],
    null,
  ],
  [
    "Tottenham이 Dominic Solanke의 90+2분 동점골로 Man United와 1-1로 비겼다.",
    ["m560600"],
    null,
  ],
  ["Hoffenheim은 홈에서 HSV에 2-3으로 졌다.", ["m565818"], null],
  ["HSV가 Hoffenheim 원정에서 3-2로 이겼다.", ["m565818"], null],
  // 홈-원정 순서 — D30은 두 순서를 인정했지만 승패 문장은 주어 팀 점수 먼저만(D55 ②, 2026-10-17 사용자 결정)
  ["Atleti가 Alavés 원정에서 1-2로 이겼다.", ["m564699"], "score-order"],
  [
    "Arsenal은 Leeds United에 0-1로 뒤지다 2-1 역전승을 거뒀다.",
    ["m560593"],
    "grammar-unknown",
  ],
  [
    "Arsenal이 Riccardo Calafiori와 Bruno Guimarães의 연속골로 Leeds United에 2-1 역전승을 거뒀다.",
    ["m560593"],
    "grammar-unknown",
  ],
  ["Bayern은 Augsburg 원정에서 2-2로 비겼다.", ["m565819"], null],
  [
    "Real Madrid는 Villarreal을 1-0으로 꺾고 승점 18로 3위를 달렸다.",
    ["m564702", "sLL"],
    null,
  ],
  [
    "Christopher Nkunku가 5분·41분·44분 연속골로 해트트릭을 기록했다.",
    ["m565815"],
    "grammar-unknown",
  ],
  [
    "Leverkusen이 Mainz 원정에서 7골을 주고받은 끝에 4-3으로 이겼다.",
    ["m565812"],
    null,
  ], // D40 ② 합(지시문 예문)
  [
    "Man City가 승점 15로 Premier League 선두, Arsenal이 승점 15로 2위다.",
    ["sPL"],
    null,
  ],
  [
    "Real Madrid가 Villarreal을 1-0으로 꺾고 승점 3을 챙겼다.",
    ["m564702"],
    "grammar-unknown",
  ],
  [
    "Napoli가 Frosinone을 무실점으로 3-0 완파했다.",
    ["m558586"],
    "grammar-unknown",
  ],
  [
    "Brentford는 두 골을 넣었지만 Aston Villa와 2-2로 비겼다.",
    ["m560601"],
    "grammar-unknown",
  ],
  [
    "PSG가 19분 Lucas Beraldo의 PK 선제골로 앞서갔고 Le Mans를 3-1로 꺾었다.",
    ["m559672"],
    "grammar-unknown",
  ],
  ["Christopher Nkunku는 두 골을 넣었다.", ["m565815"], "grammar-unknown"], // 고유어 수사도 센다(입력 3골)
  [
    "Real Madrid가 Yan Diomande의 61분 결승골로 Villarreal을 1-0으로 꺾었다.",
    ["m564702"],
    "decisive-goal",
  ],
  [
    "Villarreal이 Real Madrid를 1-0으로 꺾었다.",
    ["m564702"],
    "winner-mismatch",
  ],
  ["Napoli가 Frosinone을 3-1로 꺾었다.", ["m558586"], "score-mismatch"],
  ["Hoffenheim이 HSV를 3-2로 꺾었다.", ["m565818"], "winner-mismatch"],
  [
    "Inter가 Parma를 3-0으로 꺾고 Serie A 선두로 올라섰다.",
    ["m558582", "sSA"],
    "grammar-unknown",
  ],
  ["Arsenal은 승점 15로 Premier League 선두다.", ["sPL"], "rank-pos"],
  ["Man City와 Arsenal이 승점 15로 공동 선두다.", ["sPL"], "rank-tie"],
  [
    "Chelsea가 Bournemouth를 5-1로 대파하며 3연승을 달렸다.",
    ["m560595"],
    "grammar-unknown",
  ],
  ["Genoa가 Fiorentina를 2-1로 완파했다.", ["m558588"], "margin"],
  [
    "Man United는 Bryan Mbeumo의 73분 결승골로 Tottenham을 1-0으로 꺾었다.",
    ["m560600"],
    "winner-mismatch",
  ],
  ["Leverkusen이 홈에서 Mainz를 4-3으로 꺾었다.", ["m565812"], "venue"],
  ["Lille이 Le Havre를 1-0으로 꺾었다.", ["m559666"], "name-not-in-refs"],
  [
    "Atleti가 Cristian Romero의 87분 결승골로 Alavés에 2-1 역전승을 거뒀다.",
    ["m564699"],
    "comeback",
  ],
  [
    "Union Berlin이 리버풀을 1-0으로 꺾었다.",
    ["m565817"],
    "ko-name-not-in-input",
  ],
  [
    "Union Berlin이 엘베르스베르크를 1-0으로 꺾었다.",
    ["m565817"],
    "grammar-unknown",
  ], // 사전 '엘페르스베르크'와 다른 음역
  [
    "레버쿠젠이 마인츠를 4-3으로 꺾었고 퀀사가 55분 골을 넣었다.",
    ["m565812"],
    "grammar-unknown",
  ],
  [
    "Chelsea는 João Pedro의 해트트릭으로 Bournemouth를 5-1로 꺾었다.",
    ["m560595"],
    "grammar-unknown",
  ],
  [
    "Bayern이 Augsburg 원정에서 2-2로 비기며 선두 Dortmund와 승점 차를 2로 좁혔다.",
    ["m565819", "sBL"],
    "grammar-unknown",
  ],
  [
    "Napoli가 Frosinone을 3-0으로 꺾고 승점 1을 챙겼다.",
    ["m558586"],
    "grammar-unknown",
  ],
  [
    "Real Madrid가 Villarreal을 후반 17분 결승골로 1-0으로 꺾었다.",
    ["m564702"],
    "grammar-unknown",
  ], // 바꿔 쓴 분
  [
    "RB Leipzig이 Frankfurt를 6-0으로 완파했고 Christopher Nkunku가 후반 4골을 몰아쳤다.",
    ["m565815"],
    "grammar-unknown",
  ],
  // 위 문형 밖 참 문장의 문형 안 대응(D50 — 지시문 v0.2 [문형])
  [
    "Napoli가 Kevin De Bruyne의 2골을 앞세워 Frosinone을 3-0으로 완파했다.",
    ["m558586"],
    null,
  ],
  ["Christopher Nkunku가 해트트릭을 기록했다.", ["m565815"], null],
  [
    "Real Madrid가 Yan Diomande의 전반 62분 결승골로 Villarreal을 1-0으로 꺾었다.",
    ["m564702"],
    "minute-half",
  ],
  ["Christopher Nkunku가 4골을 넣었다.", ["m565815"], "goal-count"],
];

/** 토너먼트(연장·승부차기·결승) 합성 입력 */
const INPUT_KO: BriefCheckInput = {
  briefDate: "2027-04-15",
  matches: [
    M({
      id: "m1",
      comp: "UEFA Champions League",
      round: "QUARTER_FINALS",
      home: "Arsenal",
      away: "Real Madrid",
      ft: "1-1",
      ht: "0-1",
      aet: true,
      regular: "1-1",
      pens: "4-3",
      goals: [
        g("30", "Real Madrid", "Kylian Mbappé"),
        g("88", "Arsenal", "Bukayo Saka"),
      ],
    }),
    M({
      id: "m2",
      comp: "UEFA Champions League",
      round: "QUARTER_FINALS",
      home: "Bayern",
      away: "Inter",
      ft: "2-1",
      ht: "1-1",
      aet: true,
      regular: "1-1",
      goals: [
        g("20", "Bayern", "Harry Kane"),
        g("40", "Inter", "Lautaro Martínez"),
        g("105", "Bayern", "Jamal Musiala"),
      ],
    }),
    M({
      id: "m3",
      comp: "UEFA Champions League",
      round: "QUARTER_FINALS",
      home: "PSG",
      away: "Barça",
      ft: "1-0",
      ht: "0-0",
      aet: true,
      regular: "1-0",
      pens: "3-5",
    }),
    M({
      id: "m4",
      comp: "UEFA Champions League",
      round: "FINAL",
      home: "Liverpool",
      away: "Man City",
      ft: "2-0",
      ht: "1-0",
    }),
    M({
      id: "m5",
      comp: "UEFA Champions League",
      round: "LAST_16",
      home: "Dortmund",
      away: "Napoli",
      ft: "2-0",
      ht: "1-0",
      aet: true,
      regular: "1-0",
    }),
  ],
  standings: [],
};

const PROBES_KO: Probe[] = [
  [
    "Arsenal이 Real Madrid와 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    ["m1"],
    null,
  ],
  [
    "Arsenal이 Real Madrid와 1-1(4-3)로 맞선 뒤 승부차기에서 이겼다.",
    ["m1"],
    "grammar-unknown",
  ], // '(h-a)' 승부차기 표기(M1-19 이월)
  ["Arsenal이 8강에서 Real Madrid를 승부차기 끝에 꺾었다.", ["m1"], null],
  ["Bayern이 연장 끝에 Inter를 2-1로 꺾었다.", ["m2"], null],
  ["Bayern이 8강에서 연장 끝에 Inter를 2-1로 꺾었다.", ["m2"], null],
  [
    "Bayern이 Jamal Musiala의 105분 결승골로 Inter를 2-1로 꺾었다.",
    ["m2"],
    null,
  ],
  [
    "Bayern과 Inter는 90분을 1-1로 마쳤고 Bayern이 연장 끝에 2-1로 이겼다.",
    ["m2"],
    "grammar-unknown",
  ], // regular 점수
  [
    "PSG와 Barça의 경기는 연장까지 1-0으로 끝났고 승부차기에서 Barça가 5-3으로 이겼다.",
    ["m3"],
    null,
  ],
  ["Liverpool이 결승에서 Man City를 2-0으로 꺾었다.", ["m4"], null],
  ["Dortmund와 Napoli의 경기는 연장까지 2-0으로 끝났다.", ["m5"], null],
  ["Arsenal과 Real Madrid는 1-1로 비겼다.", ["m1"], "shootout-draw"],
  [
    "Real Madrid가 Arsenal과 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    ["m1"],
    "winner-mismatch",
  ],
  [
    "Arsenal이 승부차기 끝에 Real Madrid를 3-4로 꺾었다.",
    ["m1"],
    "score-order",
  ],
  ["PSG가 Barça를 1-0으로 꺾었다.", ["m3"], "winner-mismatch"], // 승부차기 승자는 Barça
  ["Liverpool이 홈에서 Man City를 2-0으로 꺾었다.", ["m4"], "venue"], // 결승 = 중립
  ["Liverpool이 4강에서 Man City를 2-0으로 꺾었다.", ["m4"], "round"],
  ["Bayern이 16강에서 연장 끝에 Inter를 2-1로 꺾었다.", ["m2"], "round"],
  [
    "Bayern이 Harry Kane의 결승골로 Inter를 2-1로 꺾었다.",
    ["m2"],
    "decisive-goal",
  ],
  ["Arsenal이 Real Madrid에 역전승을 거뒀다.", ["m1"], "comeback"],
  [
    "Bayern이 챔피언스리그 8강에서 Inter를 연장 끝에 2-1로 꺾었다.",
    ["m2"],
    "ko-name-unofficial",
  ], // 공식 'UEFA 챔피언스리그'(D40 ④)
  ["Bayern과 Inter는 90분을 2-1로 마쳤다.", ["m2"], "grammar-unknown"],
  ["Dortmund가 Napoli를 2-0으로 꺾었다.", ["m5"], "extra-time"], // 90분에 앞선 연장 승 — 이긴 것처럼 쓰지 않는다(M1-20)
  ["Dortmund가 연장 끝에 Napoli를 2-0으로 꺾었다.", ["m5"], "extra-time"],
  [
    "Napoli와 Dortmund의 경기는 연장까지 2-0으로 끝났다.",
    ["m5"],
    "score-order",
  ], // 'A와 B의 경기' = 앞 팀 점수 먼저
];

/** 입력 A(2026-09-19 — prev 있는 순위표 + 한국 선수 블록) */
const PROBES_A: Probe[] = [
  [
    "Kim Min-jae는 46분 교체 투입돼 45분을 뛰었다.",
    ["k2897", "m1575167"],
    null,
  ],
  ["Jeong Woo-yeong은 선발 출전해 60분을 뛰고 교체됐다.", ["k512"], null],
  ["Brentford는 7위에서 3위로 올랐다.", ["sPL"], null],
  ["Chelsea는 6위에서 7위로 밀려났다.", ["sPL"], "grammar-unknown"],
  ["Arsenal이 승점 12로 Premier League 선두를 지켰다.", ["sPL"], null], // prev 1 = pos 1
  [
    "Bayern이 홈에서 Union Berlin을 7-0으로 완파했고 Michael Olise가 해트트릭을 기록했다.",
    ["m1575167"],
    null,
  ],
  [
    "Harry Kane은 39분 PK 골을 포함해 2골을 넣었다.",
    ["m1575167"],
    "grammar-unknown",
  ],
  ["Michael Olise는 3골 1도움을 기록했다.", ["m1575167"], "grammar-unknown"], // D53 ② — n골 m도움 꼴 뺌
  [
    "Bayern이 Jamal Musiala의 18분 선제골로 앞서갔고 Union Berlin을 7-0으로 꺾었다.",
    ["m1575167"],
    "grammar-unknown",
  ],
  [
    "Brentford가 5라운드에서 Chelsea를 3-0으로 꺾었다.",
    ["m560591"],
    "grammar-unknown",
  ],
  ["김민재는 46분 교체 투입돼 45분을 뛰었다.", ["k2897"], null], // 사전 공식 표기(D40 ④)
  ["Kim Min-jae는 선발 출전해 45분을 뛰었다.", ["k2897"], "appearance"],
  ["Kim Min-jae는 60분 교체 투입돼 45분을 뛰었다.", ["k2897"], "minute"],
  ["Jeong Woo-yeong은 선발 출전해 90분을 뛰었다.", ["k512"], "minute"],
  ["Jeong Woo-yeong은 1골을 넣었다.", ["k512"], "goal-count"],
  ["Chelsea는 7위를 지켰다.", ["sPL"], "rank-move"],
  ["Brentford는 6위에서 3위로 올랐다.", ["sPL"], "rank-move"],
  [
    "김민재는 바이에른의 우니온 베를린전에서 45분을 뛰었다.",
    ["k2897"],
    "ko-name-unofficial",
  ], // '바이에른' ≠ '바이에른 뮌헨'
  [
    "Bayern이 Union Berlin을 7-0으로 완파했고 올리세가 3골을 넣었다.",
    ["m1575167"],
    "ko-name-unofficial",
  ],
  ["Michael Olise는 3골 2도움을 기록했다.", ["m1575167"], "grammar-unknown"],
  ["Harry Kane이 해트트릭을 기록했다.", ["m1575167"], "goal-count"],
  [
    "Bayern이 Union Berlin을 7-0으로 꺾었다. Michael Olise가 3골을 넣었다.",
    ["m1575167"],
    "sentence-multi",
  ],
  [
    "Bayern이 Union Berlin을 7-0으로 꺾었다\nMichael Olise가 3골을 넣었다.",
    ["m1575167"],
    "newline",
  ],
  [
    "Bayern이 Union Berlin을 7-0으로 꺾고 Bundesliga 1위에 올랐다.",
    ["m1575167"],
    "grammar-unknown",
  ],
  [
    "Bayern이 Union Berlin을 상대로 압도적인 경기 끝에 7-0으로 이겼다.",
    ["m1575167"],
    "grammar-unknown",
  ],
  [
    "Brentford가 6라운드에서 Chelsea를 3-0으로 꺾었다.",
    ["m560591"],
    "grammar-unknown",
  ],
  ["Olise가 43분에 골을 넣었다.", ["m1575167"], "latin-token"], // 성만 쓴 축약(M1-21 — 사전 별칭 아님)
  [
    "Bayern이 Matchday 4에서 Union Berlin을 7-0으로 꺾었다.",
    ["m1575167"],
    "latin-token",
  ],
];

describe("실제 출력 문형(지시문 v0.1·M0 출력에서 온 꼴) — 통과·강등과 사유 코드", () => {
  it.each([
    ["입력 E(2026-10-11)", INPUT_E, PROBES_E],
    ["토너먼트 합성 입력", INPUT_KO, PROBES_KO],
    ["입력 A(prev·한국 선수)", INPUT_A, PROBES_A],
  ] as const)("%s", (_, input, probes) => {
    for (const { probe, l } of runProbes(input, probes)) {
      const [text, , want] = probe;
      if (want === null) {
        expect(l.ok, `${text} → ${describeLineCheck(l)}`).toBe(true);
      } else {
        expect(l.ok, text).toBe(false);
        expect(
          l.reasons.map((r) => r.code),
          `${text} → ${describeLineCheck(l)}`,
        ).toContain(want);
      }
    }
  });
});

// ─── 규칙별 단위 ──────────────────────────────────────────────────────────

describe("출력 전체 — 한국어 비율·한자(FR-29 재시도 대상)", () => {
  const text = (lines: string[]) =>
    JSON.stringify({ l: lines.map((t) => ({ t, r: ["m1575167"] })) });

  it("한국어 비율은 입력 영문 이름을 지운 뒤 잰다 — 이름이 많은 정상 줄(한글 < 영문)은 통과", () => {
    const j = judgeBriefResponse(
      {
        ok: true,
        text: text(["Bayern이 Union Berlin을 7-0으로 꺾었다."]),
      },
      INPUT_A,
      CTX,
    );
    expect(j.check!.whole).toMatchObject({ ok: true, latin: 0 });
    expect(j.label).toBe("ok");
  });

  it("영어 문장 = 출력 전체 실패(retry) · 한자·가나 한 글자 = 출력 전체 실패", () => {
    expect(
      judgeBriefResponse(
        { ok: true, text: text(["Bayern beat Union Berlin 7-0 at home."]) },
        INPUT_A,
        CTX,
      ),
    ).toMatchObject({ label: "retry", stage: "whole", reason: "korean-ratio" });
    for (const bad of ["出场", "シュート"]) {
      const j = judgeBriefResponse(
        {
          ok: true,
          text: text([`Bayern이 Union Berlin을 7-0으로 꺾었다${bad}다.`]),
        },
        INPUT_A,
        CTX,
      );
      expect(j).toMatchObject({
        label: "retry",
        stage: "whole",
        reason: "han",
      });
      expect(j.check!.lines[0]!.reasons.map((r) => r.code)).toContain("han");
    }
  });
});

describe("문장 형식·근거 id·80자(D40 ⑤)", () => {
  it("80자 판정은 치환 뒤 문장(briefLinesOverLimit과 같은 판정) — 치환 뒤 80자 이하는 통과", () => {
    const long =
      "Bayern이 홈에서 Union Berlin을 7-0으로 꺾었고 Michael Olise는 43분 73분 76분에 연속으로 골을 넣으며 3골을 기록했다.";
    const res = checkBriefOutput([{ t: long, r: ["m1575167"] }], INPUT_A, CTX);
    const subText = res.substitutions[0]!.text;
    expect(long.length).toBeGreaterThan(80);
    const over = briefLinesOverLimit([subText]).length > 0;
    expect(res.lines[0]!.reasons.some((r) => r.code === "over-limit")).toBe(
      over,
    );
  });

  it("'M. Olise'의 마침표는 문장 끝이 아니다 · 마침표 없이 '다'로 끝나면 경고만 · '다.'로 끝나지 않으면 강등", () => {
    const ok = one(
      "Bayern이 홈에서 Union Berlin을 7-0으로 꺾었고 M. Olise가 3골을 넣었다.",
      ["m1575167"],
      INPUT_A,
    ).line;
    expect(ok.ok, describeLineCheck(ok)).toBe(true);
    const noPeriod = one(
      "Bayern이 Union Berlin을 7-0으로 꺾었다",
      ["m1575167"],
      INPUT_A,
    ).line;
    expect(noPeriod.ok).toBe(true);
    expect(noPeriod.warnings.map((w) => w.code)).toContain(
      "sentence-no-period",
    );
    const headline = one(
      "Bayern 7-0 Union Berlin.",
      ["m1575167"],
      INPUT_A,
    ).line;
    expect(headline.reasons.map((r) => r.code)).toContain("sentence-form");
  });

  it("입력에 없는 근거 id는 강등(brief-case-bad-ref)", () => {
    const l = one(
      "Brentford가 홈에서 Chelsea를 3-0으로 꺾었다.",
      ["m999"],
      INPUT_A,
    ).line;
    expect(l.reasons).toContainEqual({ code: "ref-unknown", detail: "m999" });
  });
});

describe("닫힌 문법(D50) — 문형 밖은 강등, 경고는 마침표 없는 끝·한 줄 두 경기만", () => {
  it("쉼표로 절을 이은 줄·술어 셋 이상·괄호는 사실이 맞아도 문형 밖(grammar-unknown — 근거는 처음 읽지 못한 낱말)", () => {
    const lines = [
      "Kim Min-jae는 46분 교체 투입돼 45분을 소화했고, Jeong Woo-yeong은 60분을 뛰고 교체 아웃됐다.",
      "Jeong Woo-yeong은 선발로 출전해 60분을 뛰고 교체 아웃됐으며 득점은 없었고 팀은 졌다.",
      "Bayern이 Union Berlin(분데스리가)을 7-0으로 꺾었다.",
    ];
    const refs = [["k2897", "k512"], ["k512"], ["m1575167"]];
    const res = checkBriefOutput(
      lines.map((t, i) => ({ t, r: refs[i]! })),
      INPUT_A,
      CTX,
    );
    expect(res.lines.map((l) => l.reasons)).toEqual([
      [{ code: "grammar-unknown", detail: "소화했고," }],
      [{ code: "grammar-unknown", detail: "없었고" }],
      [{ code: "grammar-unknown", detail: "Union Berlin(분데스리가)을" }],
    ]);
    for (const l of res.lines) expect(l.grammar).toBeNull();
  });

  it("문형 안의 두 절(-고·-며)·관형 앞절은 통과하고 고른 문형을 남긴다", () => {
    const res = checkBriefOutput(
      [
        {
          t: "Jeong Woo-yeong은 선발로 출전해 60분을 뛰고 교체 아웃됐으며 득점은 없었다.",
          r: ["k512"],
        },
        {
          t: "Bayern이 홈에서 Union Berlin을 7-0으로 꺾었고 M. Olise가 3골을 넣었다.",
          r: ["m1575167"],
        },
        {
          t: "Chelsea를 3-0으로 꺾은 Brentford는 승점 9로 3위다.",
          r: ["m560591", "sPL"],
        },
      ],
      INPUT_A,
      CTX,
    );
    expect(res.lines.map((l) => [l.ok, l.grammar])).toEqual([
      [true, "korean+koreanTail"],
      [true, "win+count"],
      [true, "win+rank"],
    ]);
  });

  it("두 절이 서로 다른 경기면 사실대로 써도 강등(clause-mismatch — 리뷰 3회차 차단 5, 경고 style-multi-match도 남는다), 쉼표 나열은 문형 밖", () => {
    const multi = one(
      "Real Madrid가 Villarreal을 1-0으로 꺾었고 Genoa가 Fiorentina를 2-1로 꺾었다.",
      ["m564702", "m558588"],
      INPUT_E,
    ).line;
    expect(multi.reasons.map((r) => r.code)).toEqual(["clause-mismatch"]);
    expect(multi.warnings.map((w) => w.code)).toContain("style-multi-match");
    const listed = one(
      "Real Madrid가 1-0, Genoa가 2-1로 각각 이겼다.",
      ["m564702", "m558588"],
      INPUT_E,
    ).line;
    expect(listed.reasons.map((r) => r.code)).toEqual(["grammar-unknown"]);
  });

  it("지시문 목록('완파'·'역전승') 밖 평가어는 점수 차가 맞아도 강등(사용자 결정 2026-10-17 — 이제 문형 밖 술어) · '완파'는 3골 차 정의대로", () => {
    const codes = (t: string, r: string[], input = INPUT_E) =>
      one(t, r, input).line.reasons.map((x) => x.code);
    for (const t of [
      "Bayern이 Union Berlin을 7-0으로 대파했다.",
      "Bayern이 Union Berlin에 7-0 대승을 거뒀다.",
      "Bayern이 Union Berlin을 7-0으로 압승했다.",
    ])
      expect(codes(t, ["m1575167"], INPUT_A), t).toEqual(["grammar-unknown"]);
    for (const [t, r] of [
      ["Inter가 Parma를 3-0으로 신승했다.", ["m558582"]],
      ["Union Berlin이 Elversberg에 1-0 진땀승을 거뒀다.", ["m565817"]],
      ["Frankfurt가 RB Leipzig에 0-6으로 대패했다.", ["m565815"]],
      ["Inter가 Parma를 3-0으로 완승했다.", ["m558582"]],
    ] as const)
      expect(codes(t, [...r]), t).toEqual(["grammar-unknown"]);
    expect(codes("Genoa가 Fiorentina를 2-1로 완파했다.", ["m558588"])).toEqual([
      "margin",
    ]);
    expect(
      one("Inter가 Parma를 3-0으로 완파했다.", ["m558582"], INPUT_E).line.ok,
    ).toBe(true);
  });

  it("사전 밖 한글 낱말(모델 음역)은 이름으로 읽히지 않아 그 자리에서 문법이 깨진다", () => {
    const l = one(
      "Union Berlin이 엘베르스베르크를 1-0으로 꺾었다.",
      ["m565817"],
      INPUT_E,
    ).line;
    expect(l.reasons).toEqual([
      { code: "grammar-unknown", detail: "엘베르스베르크를" },
    ]);
  });

  it("숫자 뒤 조사는 받침에 맞아야 문형 안이다('1-0로')", () => {
    expect(
      one("Real Madrid가 Villarreal을 1-0로 꺾었다.", ["m564702"], INPUT_E).line
        .reasons,
    ).toEqual([{ code: "grammar-unknown", detail: "1-0로" }]);
  });
});

describe("파생 숫자(D40 ②) — 그 줄 근거 항목 숫자 두 개의 차·합", () => {
  it("승점 차(sBL 13−10 = 3) — '2위 Bayern에 승점 3 앞선 선두다' 통과, 방향·값이 틀리면 강등('n점'·'보다 … 앞섰다' 꼴은 문형 밖 — D53 ②)", () => {
    const C = sent(readJson("fixtures/llm/brief-inputs/2026-10-10.json"));
    for (const t of [
      "Dortmund는 2위 Bayern에 승점 3 앞선 선두다.",
      "Bayern은 선두 Dortmund에 승점 3 뒤진 2위다.",
    ])
      expect(one(t, ["sBL"], C).line.ok, t).toBe(true);
    for (const t of [
      "Dortmund는 2위 Bayern에 승점 4 앞선 선두다.",
      "Bayern은 선두 Dortmund에 승점 3 앞선 2위다.",
    ])
      expect(
        one(t, ["sBL"], C).line.reasons.map((r) => r.code),
        t,
      ).toContain("points");
    expect(
      one("Dortmund는 승점 13으로 2위 Bayern보다 3점 앞섰다.", ["sBL"], C).line
        .reasons,
    ).toEqual([{ code: "grammar-unknown", detail: "Bayern보다" }]);
    expect(
      one(
        "Dortmund는 2위 Bayern에 승점 0 앞선 선두다.",
        ["sBL"],
        C,
      ).line.reasons.map((r) => r.code),
    ).toEqual(["grammar-unknown"]);
  });

  it("숫자 대조 범위는 그 줄 근거(r)다 — 다른 경기의 숫자로는 통과하지 않는다(brief-2026-10-11 L5)", () => {
    const l = one(
      "Christopher Nkunku는 2골을 넣었다.",
      ["m565815"],
      INPUT_E,
    ).line;
    expect(l.reasons.map((r) => r.code)).toContain("goal-count");
  });

  it("이름 속 숫자(Como 1907·Ligue 1)는 숫자로 보지 않는다", () => {
    const B = sent(readJson("fixtures/llm/brief-inputs/2026-09-11.json"));
    expect(
      one("Como 1907이 RB Leipzig을 4-1로 꺾었다.", ["m575339"], B).line.ok,
    ).toBe(true);
    const C = sent(readJson("fixtures/llm/brief-inputs/2026-10-10.json"));
    expect(one("Monaco는 승점 13으로 Ligue 1 1위다.", ["sL1"], C).line.ok).toBe(
      true,
    );
  });
});

describe("고유명사(D40 ④·M1-21 허용 목록)", () => {
  it("사전 별칭 짧은 이름('Lens'·'Bayern'·'Man City')은 허용, 성만 쓴 'Olise'·일반 영단어는 강등, 'PK'는 허용", () => {
    const B = sent(readJson("fixtures/llm/brief-inputs/2026-09-11.json"));
    expect(
      one("Lens가 Slavia Praha 원정에서 3-2로 이겼다.", ["m575340"], B).line.ok,
    ).toBe(true);
    expect(
      one("Slavia Praha와 RC Lens의 경기는 2-3으로 끝났다.", ["m575340"], B)
        .line.ok,
    ).toBe(true);
    const latin = (t: string) =>
      one(t, ["m1575167"], INPUT_A)
        .line.reasons.filter((r) => r.code === "latin-token")
        .map((r) => r.detail);
    expect(latin("Olise가 43분에 골을 넣었다.")).toEqual(["Olise"]);
    expect(
      latin(
        "Bayern이 Union Berlin을 7-0으로 꺾었고 Harry Kane이 39분 PK 골을 넣었다.",
      ),
    ).toEqual([]);
  });

  it("한글 공식 표기라도 대상이 입력에 없으면 강등, 공식 표기의 일부·띄어쓰기 변형·별칭은 강등", () => {
    const codes = (t: string) =>
      one(t, ["m1575167"], INPUT_A).line.reasons.map((r) => r.code);
    expect(codes("토트넘이 Union Berlin을 7-0으로 꺾었다.")).toContain(
      "ko-name-not-in-input",
    );
    expect(codes("바이에른뮌헨이 Union Berlin을 7-0으로 꺾었다.")).toContain(
      "ko-name-unofficial",
    );
    expect(codes("뮌헨이 Union Berlin을 7-0으로 꺾었다.")).toContain(
      "ko-name-unofficial",
    );
    expect(codes("바이에른 뮌헨이 우니온 베를린을 7-0으로 꺾었다.")).toEqual(
      [],
    );
  });

  it("언급한 이름은 그 줄 근거 항목에 있어야 한다", () => {
    const l = one(
      "Brentford가 홈에서 Chelsea를 3-0으로 꺾었다.",
      ["m1575167"],
      INPUT_A,
    ).line;
    expect(l.reasons.map((r) => r.code)).toContain("name-not-in-refs");
  });

  it("사전을 읽지 못하면(대회 별칭만 아는 색인) 입력 영문 이름만 허용 — 한글 이름은 확인할 수 없다", () => {
    const ctx: BriefCheckContext = {
      names: buildNameIndex(null, COMPETITIONS),
      competitions: COMPETITIONS,
    };
    const res = checkBriefOutput(
      [
        { t: "Bayern이 Union Berlin을 7-0으로 꺾었다.", r: ["m1575167"] },
        {
          t: "바이에른 뮌헨이 우니온 베를린을 7-0으로 꺾었다.",
          r: ["m1575167"],
        },
      ],
      INPUT_A,
      ctx,
    );
    expect(res.lines[0]!.ok).toBe(true);
    expect(res.lines[1]!.ok).toBe(false);
  });
});

describe("판정 형식·로그(M1-45·M1-43·M1-24가 쓴다)", () => {
  it("briefVerdictLabel — brief-cases.json expected와 같은 문자열", () => {
    expect(briefVerdictLabel({ verdict: "ok" })).toBe("ok");
    expect(briefVerdictLabel({ verdict: "retry" })).toBe("retry");
    expect(briefVerdictLabel({ verdict: "downgrade-all" })).toBe(
      "downgrade-all",
    );
    expect(
      briefVerdictLabel({ verdict: "downgrade-line", lines: [1, 4] }),
    ).toBe("downgrade-line:1,4");
  });

  it("briefCheckLogFields — 줄 번호 → 사유 코드(중복 없음)·경고, 문장 원문은 없다", () => {
    const c = CASES_FILE.cases.find((x) => x.id === "brief-2026-10-11")!;
    const fields = briefCheckLogFields(judgeCase(c));
    // L1 원정 승을 홈-원정 순서로 썼다(D55 ② — 주어 팀 점수 먼저만) · L5 골 수 오류
    expect(fields).toMatchObject({
      verdict: "downgrade-line:1,5",
      stage: "line",
      reason: null,
      lineReasons: { "1": ["score-order"], "5": ["goal-count"] },
    });
    expect(JSON.stringify(fields)).not.toContain("Nkunku는");
  });

  it("describeLineCheck — '통과' · '강등 대상 — 코드(근거)'", () => {
    const c = CASES_FILE.cases.find((x) => x.id === "brief-2026-10-11")!;
    const lines = judgeCase(c).check!.lines;
    expect(describeLineCheck(lines[1]!)).toMatch(/^통과/);
    expect(describeLineCheck(lines[0]!)).toBe("강등 대상 — score-order(1-2)");
    expect(describeLineCheck(lines[4]!)).toBe(
      "강등 대상 — goal-count(Christopher Nkunku 2골)",
    );
  });

  it("substituteBriefLines = M1-21 치환(substituteNames + 같은 입력의 브리핑 단위 대회 표기) — M1-45가 게시할 문장", () => {
    const c = CASES_FILE.cases.find((x) => x.id === "brief-2026-10-11")!;
    const parsed = parseBriefOutput(
      (responseFor(c.id) as { text: string }).text,
    );
    if (!parsed.ok) throw new Error("파싱 실패");
    const texts = parsed.lines.map((l) => l.t);
    const form = chooseBriefCompForm(INPUT_E, {
      competitions: COMPETITIONS,
      names: KO_NAMES,
    });
    const expected = texts.map((t) =>
      substituteNames(t, NAMES, {
        competitionLabel: (comp) =>
          briefCompLabel(
            COMPETITIONS.find((x) => x.id === comp)!.nameEn,
            { competitions: COMPETITIONS },
            form,
          ),
      }),
    );
    expect(substituteBriefLines(texts, INPUT_E, CTX)).toEqual(expected);
    expect(checkBriefOutput(parsed.lines, INPUT_E, CTX).substitutions).toEqual(
      expected,
    );
  });

  it("결정적이다 — 같은 입력·출력은 같은 판정", () => {
    for (const c of CASES_FILE.cases) {
      expect(judgeCase(c)).toEqual(judgeCase(c));
    }
  });
});
