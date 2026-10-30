/**
 * M2-05 — 팀 키트 색 대비 보정(src/lib/kit-contrast.ts, PRD §15 D62 ④)과 `configs/team-colors.json` 생성
 * (scripts/lib/team-colors.ts — 원본 docs/design/d1/team-colors-source.json). 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TeamColorsFileSchema, TeamIdsFileSchema } from "@/lib/schema";

import {
  contrastRatio,
  correctKitShirt,
  KIT_MIN_CONTRAST,
  kitShirtContrast,
  kitTextColor,
  scaleColor,
} from "@/lib/kit-contrast";
import {
  buildTeamColorRows,
  buildTeamColors,
  TEAM_COLORS_SOURCE_PATH,
  TeamColorSourceFileSchema,
} from "../scripts/lib/team-colors";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

describe("correctKitShirt — D62 ④ 키트 대비 보정", () => {
  /** D1 시안 보정 값 표(docs/design/d1/comparison.md §11.3) — [원래 상의, 보정 뒤, f] */
  const DESIGN_TABLE: Array<[string, string, string, number]> = [
    ["아스널", "#EF0107", "#D70106", 0.9],
    ["브렌트포드", "#E30613", "#D50612", 0.94],
    ["맨체스터 유나이티드", "#DA291C", "#CD271A", 0.94],
    ["노팅엄 포레스트", "#DD0000", "#D90000", 0.98],
    ["아틀레티코 마드리드", "#CB3524", "#C73423", 0.98],
    ["레알 베티스", "#00954C", "#007A3E", 0.82],
    ["AC 밀란", "#FB090B", "#D80809", 0.86],
    ["바이에른 뮌헨", "#DC052D", "#D3052B", 0.96],
    ["프라이부르크", "#E2001A", "#D40018", 0.94],
    ["레버쿠젠", "#E32221", "#D11F1E", 0.92],
    ["모나코", "#E7171E", "#D5151C", 0.92],
    ["릴", "#E01E13", "#D31C12", 0.94],
  ];

  it.each(DESIGN_TABLE)(
    "%s %s → %s (f %s) — 시안 표와 같다",
    (_name, original, expected, factor) => {
      const r = correctKitShirt(original);
      expect(r.corrected).toBe(true);
      expect(r.shirt).toBe(expected);
      expect(r.factor).toBe(factor);
      expect(r.text).toBe("#FFFFFF");
      expect(r.contrast).toBeGreaterThanOrEqual(KIT_MIN_CONTRAST);
      // 첫 f — 한 단계 덜 어둡게 하면 하한 미달
      expect(
        contrastRatio(
          scaleColor(original, Math.round((factor + 0.02) * 100) / 100),
          "#FFFFFF",
        ),
      ).toBeLessThan(KIT_MIN_CONTRAST);
    },
  );

  it("채널 반올림은 정수 백분율로 계산한다 — 선덜랜드 #EB172B × 0.90 = 211.5 → 212(#D41527). 시안 표의 #D31527은 0.02씩 빼며 쌓인 부동소수 오차(0.8999…)", () => {
    const r = correctKitShirt("#EB172B");
    expect(r.factor).toBe(0.9);
    expect(r.shirt).toBe("#D41527");
    expect(r.contrast).toBeGreaterThanOrEqual(KIT_MIN_CONTRAST);
    // 본머스(#DA291C)·브렌트포드처럼 .5 경계가 없는 색은 시안과 같다(위 표)
  });

  it("대비가 이미 5.3 이상이면 원색 그대로 — 밝은 색은 #14213D 글자(나폴리 5.35), 어두운 색은 흰 글자", () => {
    const napoli = correctKitShirt("#12A0D7");
    expect(napoli.corrected).toBe(false);
    expect(napoli.factor).toBe(1);
    expect(napoli.shirt).toBe("#12A0D7");
    expect(napoli.text).toBe("#14213D");
    expect(napoli.contrast).toBeCloseTo(5.35, 2);

    const chelsea = correctKitShirt("#034694");
    expect(chelsea.corrected).toBe(false);
    expect(chelsea.text).toBe("#FFFFFF");
  });

  it("글자색 = #FFFFFF·#14213D 중 대비가 큰 쪽 — 흰 상의·노랑 상의는 남색, 검정 상의는 흰색", () => {
    expect(kitTextColor("#FFFFFF")).toBe("#14213D");
    expect(kitTextColor("#FDE100")).toBe("#14213D");
    expect(kitTextColor("#000000")).toBe("#FFFFFF");
    expect(kitShirtContrast("#FFFFFF").contrast).toBeGreaterThan(15);
  });

  it("소문자 입력은 대문자로 정규화하고, 형식이 틀리면 오류", () => {
    expect(correctKitShirt("#ef0107").shirt).toBe("#D70106");
    expect(() => correctKitShirt("EF0107")).toThrow();
    expect(() => correctKitShirt("#EF01")).toThrow();
  });

  it("하한을 높이면 f가 더 내려간다 — 0.40까지 못 넘으면 오류", () => {
    expect(correctKitShirt("#EF0107", 7).factor).toBeLessThan(0.9);
    expect(() => correctKitShirt("#EF0107", 30)).toThrow(/0.4/);
  });
});

describe("configs/team-colors.json — 원본(team-colors-source.json)에서 생성(M2-05)", () => {
  const SOURCE = TeamColorSourceFileSchema.parse(
    readJson(TEAM_COLORS_SOURCE_PATH),
  );
  const CONFIG = TeamColorsFileSchema.parse(
    readJson("configs/team-colors.json"),
  );
  const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
  const rows = buildTeamColorRows(SOURCE);

  it("설정 파일은 원본에 보정 규칙을 적용한 결과와 같다 — 원본을 고치면 scripts/build-team-colors.ts --write", () => {
    expect(CONFIG).toEqual(buildTeamColors(SOURCE));
  });

  it("team-ids.json 111팀과 키가 같다(빠진 팀·남는 팀 없음)", () => {
    expect(Object.keys(CONFIG).sort()).toEqual(Object.keys(TEAM_IDS).sort());
    expect(Object.keys(CONFIG)).toHaveLength(111);
  });

  it("모든 팀의 약어 글자 대비 ≥ 5.3, 하의 색은 원색 그대로", () => {
    for (const [slug, t] of Object.entries(CONFIG)) {
      expect(
        kitShirtContrast(t.colors[0]).contrast,
        slug,
      ).toBeGreaterThanOrEqual(KIT_MIN_CONTRAST);
      expect(t.colors[1], slug).toBe(SOURCE.teams[slug]!.kit[1]);
    }
  });

  it("약어는 football-data tla trim — 이상치 2팀(보되/글림트 'FK'·스트라스부르 'RC ')만 근거와 함께 다른 값", () => {
    const differs = rows
      .filter((r) => r.source.short !== r.source.tla.trim())
      .map((r) => `${r.slug}:${r.source.tla}→${r.source.short}`);
    expect(differs).toEqual(["bodo-glimt:FK→BOD", "strasbourg:RC →STR"]);
  });

  it("약어 충돌 FCB·BRE는 그대로 둔다 — 화면이 한글 팀명을 병기한다(D62 ②, 덮어쓰기 필드 없음)", () => {
    const byShort = new Map<string, string[]>();
    for (const [slug, t] of Object.entries(CONFIG)) {
      byShort.set(t.short, [...(byShort.get(t.short) ?? []), slug]);
    }
    const dup = [...byShort].filter(([, s]) => s.length > 1);
    expect(dup).toEqual([
      ["FCB", ["barcelona", "bayern-munchen"]],
      ["BRE", ["brentford", "brest"]],
    ]);
  });
});
