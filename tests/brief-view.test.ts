/**
 * M1-32 — 오늘의 5줄 화면 모델(src/lib/brief-view.ts, PRD FR-35·FR-36, D24·D30·D38·D45·D58, DESIGN.md §3.5·§9.3).
 * 브리핑 파일 → 등번호·문장 조각·라벨·탭·부제 날짜. fixtures/brief-sample.json(읽기만) 날짜별 파일과 합성 입력으로 본다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  briefMatchDate,
  briefTextParts,
  buildBriefView,
  monthDayLabel,
} from "@/lib/brief-view";
import * as limits from "@/lib/brief-limits";
import {
  BRIEF_LINE_MAX,
  BRIEF_MAX_LINES,
  BRIEF_REFS_MAX,
  BriefFileSchema,
  type BriefFile,
} from "@/lib/schema/brief";

const sample = BriefFileSchema.array().parse(
  (
    JSON.parse(
      readFileSync(path.resolve("fixtures/brief-sample.json"), "utf8"),
    ) as { days: unknown[] }
  ).days,
);
const empty = BriefFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/brief-empty.json"), "utf8")),
);

function day(date: string): BriefFile {
  const found = sample.find((d) => d.date === date);
  if (!found) throw new Error(`fixtures/brief-sample.json에 ${date} 없음`);
  return found;
}

describe("briefTextParts — 문장 속 숫자 조각(DESIGN §3.5 — 문구 불변)", () => {
  it.each([
    [
      "도르트문트가 브레멘과 2-2로 비겼다. 브레멘은 레이스(88분)와 퓔크루크(90+2분)의 골로 막판에 동점을 만들었다.",
      ["2-2", "88", "90+2"],
    ],
    ["모나코는 승점 13으로 리그 1 1위다.", ["13", "1", "1"]],
    ["바르셀로나가 레알 베티스를 5-2로 완파했다.", ["5-2"]],
    ["숫자가 없는 줄이다.", []],
    ["1라운드 후 파리 생제르맹이 승점 3으로", ["1", "3"]],
  ])("%s", (text, nums) => {
    const parts = briefTextParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.num).map((p) => p.text)).toEqual(nums);
    // 숫자 아닌 조각에는 숫자가 남지 않는다
    for (const part of parts.filter((p) => !p.num)) {
      expect(part.text).not.toMatch(/\d/);
    }
  });

  it("빈 문장 조각을 만들지 않는다", () => {
    expect(briefTextParts("2-1")).toEqual([{ text: "2-1", num: true }]);
    expect(briefTextParts("가 1 나").every((p) => p.text.length > 0)).toBe(
      true,
    );
  });
});

describe("경기일 — 발행일 − 1(브리핑 입력 = UTC 하루 D−1 종료 경기)", () => {
  it.each([
    ["2026-10-18", "2026-10-17", "10월 17일"],
    ["2026-11-01", "2026-10-31", "10월 31일"],
    ["2027-01-01", "2026-12-31", "12월 31일"],
    // 유럽 서머타임 전환일(10월 마지막 일요일 2026-10-25) 전후 — KST 달력 계산이라 영향 없음
    ["2026-10-26", "2026-10-25", "10월 25일"],
  ])("%s → %s (%s)", (date, match, label) => {
    expect(briefMatchDate(date)).toBe(match);
    expect(monthDayLabel(match)).toBe(label);
  });
});

describe("buildBriefView", () => {
  it("llm(2026-10-10) — 1~5 등번호, 모든 줄 라벨, 부제 10월 9일, 줄 수 표시 없음, 탭 = comps 첫 값", () => {
    const brief = day("2026-10-10");
    const view = buildBriefView(brief);
    expect(view.mode).toBe("llm");
    expect(view.rows.map((r) => r.no)).toEqual([1, 2, 3, 4, 5]);
    expect(view.rows.every((r) => r.ai)).toBe(true);
    expect(view.matchDate).toBe("2026-10-09");
    expect(view.matchDateLabel).toBe("10월 9일");
    expect(view.shortCount).toBeNull();
    expect(view.hasAi).toBe(true);
    expect(view.rows.map((r) => r.text)).toEqual(
      brief.lines.map((l) => l.text),
    );
    expect(view.rows.map((r) => r.comp)).toEqual(
      brief.lines.map((l) => l.comps?.[0] ?? null),
    );
    expect(view.rows.map((r) => r.comp)).toEqual([
      "BUNDESLIGA",
      "BUNDESLIGA",
      "LIGUE1",
      "LALIGA",
      "LIGUE1",
    ]);
  });

  it("mixed(2026-10-11) — 라벨은 mode가 아니라 줄 단위 ai 그대로(FR-35)", () => {
    const brief = day("2026-10-11");
    const view = buildBriefView(brief);
    expect(view.mode).toBe("mixed");
    expect(view.rows.map((r) => r.ai)).toEqual(brief.lines.map((l) => l.ai));
    expect(view.rows.map((r) => r.ai)).toEqual([true, true, true, true, false]);
    expect(view.hasAi).toBe(true);
  });

  it("template 2줄(2026-09-18) — 라벨 없음, '이날 2줄', AI 작성 안내 없음", () => {
    const view = buildBriefView(day("2026-09-18"));
    expect(view.rows).toHaveLength(2);
    expect(view.rows.every((r) => !r.ai)).toBe(true);
    expect(view.shortCount).toBe(2);
    expect(view.hasAi).toBe(false);
    expect(view.matchDateLabel).toBe("9월 17일");
  });

  it("empty — 줄 없음, 날짜를 단정하지 않는다(D30 #7)", () => {
    const view = buildBriefView(empty);
    expect(view.mode).toBe("empty");
    expect(view.rows).toEqual([]);
    expect(view.matchDate).toBeNull();
    expect(view.matchDateLabel).toBeNull();
    expect(view.shortCount).toBeNull();
    expect(view.hasAi).toBe(false);
    expect(view.date).toBe(empty.date);
  });

  it("comps가 없는 옛 파일 줄(2026-10-17·18 형식)은 탭 없음", () => {
    const view = buildBriefView({
      date: "2026-10-18",
      mode: "llm",
      lines: [{ text: "바르셀로나가 레알 베티스를 5-2로 완파했다.", ai: true }],
    });
    expect(view.rows[0]?.comp).toBeNull();
    expect(view.shortCount).toBe(1);
  });

  it("줄 수 표시는 1~4줄일 때만 — 5줄(BRIEF_MAX_LINES)이면 없음", () => {
    expect(BRIEF_MAX_LINES).toBe(5);
    const line = { text: "가 1-0", ai: false };
    for (let n = 1; n <= BRIEF_MAX_LINES; n++) {
      const view = buildBriefView({
        date: "2026-10-18",
        mode: "template",
        lines: Array.from({ length: n }, () => line),
      });
      expect(view.shortCount).toBe(n < BRIEF_MAX_LINES ? n : null);
    }
  });
});

describe("화면 모델 모듈 — zod·fs 없는 순수 모듈(M1-32 리뷰 — 섬이 import해도 zod가 번들에 들어가지 않게)", () => {
  /** 런타임 import(타입 import 제외) */
  function runtimeImports(file: string): string[] {
    const text = readFileSync(path.resolve(file), "utf8");
    return [
      ...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms),
    ].map((m) => m[1] ?? "");
  }

  it.each([
    "src/lib/brief-view.ts",
    "src/lib/brief-limits.ts",
    "src/lib/time.ts",
  ])(
    "%s — 런타임 import에 node:·zod·@/lib/schema·@/lib/data가 없다",
    (file) => {
      expect(
        runtimeImports(file).filter(
          (spec) =>
            spec.startsWith("node:") ||
            spec === "zod" ||
            spec.startsWith("@/lib/schema") ||
            spec.startsWith("@/lib/data"),
        ),
      ).toEqual([]);
    },
  );

  it("상한 값의 단일 출처는 brief-limits — 스키마는 같은 값을 다시 내보낸다", () => {
    expect(BRIEF_MAX_LINES).toBe(limits.BRIEF_MAX_LINES);
    expect(BRIEF_LINE_MAX).toBe(limits.BRIEF_LINE_MAX);
    expect(BRIEF_REFS_MAX).toBe(limits.BRIEF_REFS_MAX);
    expect([BRIEF_MAX_LINES, BRIEF_LINE_MAX, BRIEF_REFS_MAX]).toEqual([
      5, 80, 6,
    ]);
  });
});
