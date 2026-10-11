/**
 * cn — Tailwind 클래스 병합 (D0-10, DESIGN.md §11.2)
 * - tailwind-merge 설정(THEME_KEYS)이 globals.css `@theme`에 실제로 등록된 키와 같은지 대조한다.
 * - 토큰 유틸리티가 같은 속성끼리만 덮고(같은 그룹), 다른 속성(글자 크기 + 색 등)은 함께 남는지 본다.
 *
 * 입력 클래스는 cn("…") 리터럴로 쓰지 않는다 — prettier-plugin-tailwindcss가 cn 인자 안 클래스 순서를 바꾸면
 * 병합 결과(뒤가 이김)가 달라진다. 배열로 두고 공백으로 이어 넘긴다.
 */
import { describe, expect, it } from "vitest";

import { cn, THEME_KEYS } from "@/lib/utils";

import {
  globalsCssBlocks,
  parseCss,
  readGlobalsCss,
} from "./support/design-tokens";

const blocks = globalsCssBlocks(parseCss(readGlobalsCss()));

/**
 * Tailwind v4 테마 네임스페이스(가장 긴 것부터 맞춘다 — `--text-shadow-*`는 text가 아니라 text-shadow).
 * 여기 없는 네임스페이스가 globals.css에 생기면 "모르는 네임스페이스"로 실패한다.
 */
const TAILWIND_NAMESPACES = [
  "color",
  "font",
  "font-weight",
  "text",
  "tracking",
  "leading",
  "breakpoint",
  "container",
  "spacing",
  "radius",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "blur",
  "perspective",
  "aspect",
  "ease",
  "animate",
  "transition-duration",
].sort((a, b) => b.length - a.length);

/** globals.css `@theme static`·`@theme inline` 키 → 네임스페이스별 유틸리티 키 */
function themeKeysFromGlobalsCss(): {
  keys: Record<string, string[]>;
  unknown: string[];
} {
  const keys: Record<string, string[]> = {};
  const unknown: string[] = [];
  for (const [name] of [
    ...blocks.themeStatic.declarations,
    ...blocks.themeInline.declarations,
  ]) {
    const body = name.slice(2);
    // `--default-*`는 유틸리티 기본값, `--X--line-height` 같은 하위 속성은 클래스가 아니다
    if (body.startsWith("default-") || body.includes("--")) continue;
    const ns = TAILWIND_NAMESPACES.find((n) => body.startsWith(`${n}-`));
    if (!ns) {
      unknown.push(name);
      continue;
    }
    (keys[ns] ??= []).push(body.slice(ns.length + 1));
  }
  return { keys, unknown };
}

function sorted(record: Readonly<Record<string, readonly string[]>>) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, list]) => [ns, [...list].sort()]),
  );
}

/** 클래스 목록을 공백으로 이어 cn에 넘긴다 */
function merge(classes: readonly string[]): string {
  return cn(classes.join(" "));
}

describe("cn 설정 ↔ globals.css @theme 키", () => {
  const { keys, unknown } = themeKeysFromGlobalsCss();

  it("globals.css의 @theme 키는 모두 아는 Tailwind 네임스페이스다", () => {
    expect(unknown).toEqual([]);
  });

  it("THEME_KEYS가 globals.css에 등록된 키와 네임스페이스·이름까지 같다", () => {
    expect(sorted(THEME_KEYS)).toEqual(sorted(keys));
  });
});

describe("cn — 리뷰 실측 조합", () => {
  it.each<[input: string[], expected: string]>([
    // 글자 크기 + 색은 함께 남는다(이전: 크기를 색으로 봐서 지웠다)
    [["text-type-card", "text-ink"], "text-type-card text-ink"],
    [
      ["text-num-score", "text-brand-accent"],
      "text-num-score text-brand-accent",
    ],
    // 같은 속성은 뒤가 이긴다(이전: 그룹을 몰라 둘 다 남았다)
    [["px-edge", "px-4"], "px-4"],
    [["shadow-print", "shadow-none"], "shadow-none"],
    [["max-w-page", "max-w-none"], "max-w-none"],
  ])("%j → %s", (input, expected) => {
    expect(merge(input)).toBe(expected);
  });
});

describe("cn — 토큰 유틸리티 병합 규칙", () => {
  it.each<[input: string[], expected: string]>([
    // 글자 크기끼리(타입·숫자·Tailwind 기본) 덮기
    [["text-type-card", "text-type-h2"], "text-type-h2"],
    [["text-type-card", "text-num-score"], "text-num-score"],
    [["text-num-score", "text-num-issue"], "text-num-issue"],
    [["text-sm", "text-type-card"], "text-type-card"],
    // 타입 유틸리티는 행간을 포함하므로 앞의 leading을 지운다(tailwind-merge 기본 규칙)
    [["leading-tight", "text-type-card"], "text-type-card"],
    // 색끼리 덮기 — 토큰 색·shadcn 의미 색·키워드·투명도·변형
    [["text-ink", "text-ink-2"], "text-ink-2"],
    [["bg-paper", "bg-competition-epl"], "bg-competition-epl"],
    [["border-rule", "border-input"], "border-input"],
    [["bg-transparent", "bg-paper"], "bg-paper"],
    [["text-current", "text-result-win"], "text-result-win"],
    [["bg-paper/50", "bg-ink"], "bg-ink"],
    [["dark:bg-paper", "dark:bg-paper-2"], "dark:bg-paper-2"],
    // 다른 속성은 함께 남는다
    [["shadow-print", "shadow-paper"], "shadow-print shadow-paper"],
    [["ring-ring", "ring-2"], "ring-ring ring-2"],
    [["border-border", "border-2"], "border-border border-2"],
    [["font-bold", "font-numeric"], "font-bold font-numeric"],
    [["text-center", "text-ink"], "text-center text-ink"],
    // 폰트·간격·폭·그림자·모션
    [["font-numeric", "font-latin"], "font-latin"],
    [["px-4", "px-edge"], "px-edge"],
    [["gap-gutter", "gap-6"], "gap-6"],
    [["w-tab-w", "w-4"], "w-4"],
    [["w-col-contents", "w-col-facing"], "w-col-facing"],
    [["shadow-print", "shadow-print-accent"], "shadow-print-accent"],
    [["rounded-lg", "rounded-none"], "rounded-none"],
    [["duration-base", "duration-fast"], "duration-fast"],
    [["duration-slow", "duration-100"], "duration-100"],
    [["ease-print", "ease-linear"], "ease-linear"],
    // 등록하지 않은 이름은 색으로 짐작하지 않는다(지우지 않고 둘 다 남긴다)
    [["text-headline", "text-ink"], "text-headline text-ink"],
  ])("%j → %s", (input, expected) => {
    expect(merge(input)).toBe(expected);
  });
});

describe("cn — 등록한 키 전부", () => {
  it("모든 색 키: 글자 크기와 함께 남고, 같은 속성 색은 뒤가 이긴다", () => {
    const bad = THEME_KEYS.color.flatMap((c) => {
      const out: string[] = [];
      const withSize = merge(["text-type-card", `text-${c}`]);
      if (withSize !== `text-type-card text-${c}`) out.push(withSize);
      const bg = merge([`bg-${c}`, "bg-paper"]);
      if (bg !== "bg-paper") out.push(bg);
      const border = merge(["border-rule", `border-${c}`]);
      if (border !== `border-${c}`) out.push(border);
      return out;
    });
    expect(bad).toEqual([]);
  });

  it("모든 글자 크기 키: 색과 함께 남고, 다른 글자 크기가 덮는다", () => {
    const bad = THEME_KEYS.text.flatMap((t) => {
      const out: string[] = [];
      const withColor = merge([`text-${t}`, "text-ink"]);
      if (withColor !== `text-${t} text-ink`) out.push(withColor);
      const size = merge([`text-${t}`, "text-sm"]);
      if (size !== "text-sm") out.push(size);
      return out;
    });
    expect(bad).toEqual([]);
  });

  it("모든 간격·폭·폰트·모서리·그림자·곡선·전환 시간 키: 같은 속성 유틸리티가 덮는다", () => {
    const cases: Array<[string[], string]> = [
      ...THEME_KEYS.spacing.flatMap((k): Array<[string[], string]> => [
        [[`px-${k}`, "px-4"], "px-4"],
        [[`w-${k}`, "w-full"], "w-full"],
        [[`gap-${k}`, "gap-2"], "gap-2"],
      ]),
      ...THEME_KEYS.container.map((k): [string[], string] => [
        [`max-w-${k}`, "max-w-none"],
        "max-w-none",
      ]),
      ...THEME_KEYS.font.map((k): [string[], string] => [
        [`font-${k}`, "font-mono"],
        "font-mono",
      ]),
      ...THEME_KEYS.radius.map((k): [string[], string] => [
        [`rounded-${k}`, "rounded-none"],
        "rounded-none",
      ]),
      ...THEME_KEYS.shadow.map((k): [string[], string] => [
        [`shadow-${k}`, "shadow-none"],
        "shadow-none",
      ]),
      ...THEME_KEYS.ease.map((k): [string[], string] => [
        [`ease-${k}`, "ease-linear"],
        "ease-linear",
      ]),
      ...THEME_KEYS["transition-duration"].map((k): [string[], string] => [
        [`duration-${k}`, "duration-0"],
        "duration-0",
      ]),
    ];
    const bad = cases
      .map(([input, expected]) => [input, merge(input), expected] as const)
      .filter(([, actual, expected]) => actual !== expected)
      .map(
        ([input, actual, expected]) =>
          `${input.join(" ")} → ${actual} (기대 ${expected})`,
      );
    expect(bad).toEqual([]);
  });
});
