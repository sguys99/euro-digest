/**
 * M1-24 브리핑 골든셋(fixtures/llm/golden/) 가드 — 네트워크·LLM 없음.
 *
 * - 목록(index.json)·소스(sources/)·입력(inputs/)이 zod 형식에 맞고 날짜가 서로 맞다(10일 — PRD §9.2).
 * - 입력 = 확정 빌더 출력: 소스 + configs → `buildBriefInput` → `canonicalizeBriefInput`과 바이트까지 같다(M1-19·M1-21 이월).
 *   빌더·설정이 바뀌어 다르면 `npm run eval:prompt -- --build-golden`으로 다시 쓴다.
 * - 태그가 입력과 맞고, 골든셋이 덮어야 할 유형(경기 많은 날·적은 날·UCL·대승·무승부·연장·승부차기)을 모두 덮는다.
 * - 입력 창(UTC 하루 D-1)·M0 기준선 키·기사 텍스트/URL/이미지 없음.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { briefInputWindow, type BriefInput } from "../scripts/lib/brief-input";
import { matchFacts } from "../scripts/lib/brief-template";
import { loadEvalContext } from "../scripts/lib/eval-prompt-run";
import {
  buildGoldenInput,
  GOLDEN_DAYS,
  GoldenIndexSchema,
  GoldenInputSchema,
  GoldenSourceSchema,
  goldenInputStats,
  serializeGoldenInput,
  type GoldenTag,
} from "../scripts/lib/golden";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = path.join(ROOT, "fixtures/llm/golden");
const read = (rel: string) => readFileSync(path.join(DIR, rel), "utf8");
const readJson = (rel: string): unknown => JSON.parse(read(rel));

const INDEX = GoldenIndexSchema.parse(readJson("index.json"));
const DATES = INDEX.days.map((d) => d.date);
const dateFiles = (sub: string) =>
  readdirSync(path.join(DIR, sub))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();

describe("목록·파일", () => {
  it("10일, 날짜 오름차순·중복 없음, 소스·입력 파일이 목록과 같다", () => {
    expect(INDEX.days).toHaveLength(GOLDEN_DAYS);
    expect(dateFiles("sources")).toEqual(DATES);
    expect(dateFiles("inputs")).toEqual(DATES);
  });

  it("입력 파일은 zod 형식(strict)이고 다시 직렬화해도 같은 바이트다(키 순서 = 빌더 순서)", () => {
    for (const date of DATES) {
      const text = read(`inputs/${date}.json`);
      const input = GoldenInputSchema.parse(JSON.parse(text)) as BriefInput;
      expect(input.briefDate, date).toBe(date);
      expect(serializeGoldenInput(input), date).toBe(text);
    }
  });

  it("소스는 zod 형식이고 결과는 입력 창(UTC 하루 D-1) 안 킥오프다", () => {
    for (const date of DATES) {
      const source = GoldenSourceSchema.parse(readJson(`sources/${date}.json`));
      expect(source.briefDate).toBe(date);
      const window = briefInputWindow(date);
      for (const r of source.results) {
        const t = Date.parse(r.kickoff);
        expect(
          t >= Date.parse(window.start) && t < Date.parse(window.end),
          `${date} ${r.matchId}`,
        ).toBe(true);
      }
      // 연결된 득점은 그날 결과 경기에만
      const ids = new Set(source.results.map((r) => r.matchId));
      for (const l of source.links)
        expect(ids.has(l.fd), `${date} link ${l.fd}`).toBe(true);
    }
  });
});

describe("입력 = 확정 빌더 출력(소스 + configs)", () => {
  it("buildBriefInput → canonicalizeBriefInput 결과와 저장된 입력이 같다", async () => {
    const ctx = await loadEvalContext(ROOT);
    for (const date of DATES) {
      const source = GoldenSourceSchema.parse(readJson(`sources/${date}.json`));
      const built = serializeGoldenInput(buildGoldenInput(source, ctx.golden));
      expect(
        built,
        `${date} — 빌더·configs가 바뀌었다면 npm run eval:prompt -- --build-golden`,
      ).toBe(read(`inputs/${date}.json`));
    }
  });
});

describe("태그·덮는 유형", () => {
  const inputs = new Map(
    DATES.map((d) => [
      d,
      GoldenInputSchema.parse(readJson(`inputs/${d}.json`)) as BriefInput,
    ]),
  );

  it("태그가 입력과 맞다", async () => {
    const ctx = await loadEvalContext(ROOT);
    for (const day of INDEX.days) {
      const input = inputs.get(day.date)!;
      const source = GoldenSourceSchema.parse(
        readJson(`sources/${day.date}.json`),
      );
      const stats = goldenInputStats(input);
      const facts = input.matches.map((m) => matchFacts(m));
      const expected = new Set<GoldenTag>();
      if (stats.matches >= 15) expected.add("busy");
      if (stats.matches <= 4) expected.add("light");
      if (stats.comps.includes("UEFA Champions League")) expected.add("ucl");
      if (
        source.results.some(
          (r) =>
            r.stage !== null &&
            !["REGULAR_SEASON", "LEAGUE_STAGE"].includes(r.stage),
        )
      )
        expected.add("knockout");
      if (input.matches.some((m) => m.round === "FINAL")) expected.add("final");
      if (facts.some((f) => f !== null && f.margin >= 3))
        expected.add("big-win");
      if (facts.some((f) => f !== null && f.winner === null))
        expected.add("draw");
      if (stats.extraTime > 0) expected.add("extra-time");
      if (stats.penalties > 0) expected.add("penalties");
      if (facts.some((f) => f !== null && f.comeback)) expected.add("comeback");
      if (stats.withGoals > 0) expected.add("goals");
      expected.add(stats.standings > 0 ? "standings" : "no-standings");
      if (
        source.results.some(
          (r) =>
            ctx.golden.koreanTeamIds.has(r.home.id) ||
            ctx.golden.koreanTeamIds.has(r.away.id),
        )
      )
        expected.add("korean-team");
      expect([...day.tags].sort(), day.date).toEqual([...expected].sort());
    }
  });

  it("골든셋이 경기 많은 날(23경기급)·적은 날·UCL·대승·무승부·연장·승부차기를 모두 덮는다(PRD §9.2·plan M1-24)", () => {
    const all = new Set(INDEX.days.flatMap((d) => d.tags));
    for (const tag of [
      "busy",
      "light",
      "ucl",
      "big-win",
      "draw",
      "extra-time",
      "penalties",
      "goals",
      "standings",
    ] as const) {
      expect(all.has(tag), tag).toBe(true);
    }
    const most = Math.max(...[...inputs.values()].map((i) => i.matches.length));
    expect(most).toBeGreaterThanOrEqual(23);
  });

  it("M0 기준선 키는 같은 발행일의 M0 입력을 가리킨다", () => {
    const cases = JSON.parse(
      readFileSync(path.join(ROOT, "fixtures/llm/brief-cases.json"), "utf8"),
    ) as { inputs: Record<string, { file: string; briefDate: string }> };
    const keyed = INDEX.days.filter((d) => d.m0 !== null);
    expect(keyed.map((d) => d.m0).sort()).toEqual(["A", "B", "C", "D", "E"]);
    for (const day of keyed) {
      expect(cases.inputs[day.m0!]!.briefDate, day.date).toBe(day.date);
    }
  });
});

describe("공개 저장소 규칙", () => {
  it("입력·소스·실행 기록에 URL·이미지 키·기사 필드가 없다", () => {
    const files = [
      ...DATES.flatMap((d) => [`inputs/${d}.json`, `sources/${d}.json`]),
      ...readdirSync(path.join(DIR, "runs")).map((r) => `runs/${r}/run.json`),
    ];
    for (const f of files) {
      const text = read(f);
      expect(text, f).not.toMatch(/https?:\/\//);
      expect(text, f).not.toMatch(
        /"(crest|emblem|logo|photo|flag|description|summary|title|url)"\s*:/,
      );
    }
  });
});
