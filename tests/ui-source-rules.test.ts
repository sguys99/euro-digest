/**
 * 기초 컴포넌트 소스 규칙 (D0-12, DESIGN.md §9.1 shadcn 기본 모양 탈피 · §6 모션 · §7.1 브레이크포인트 · CLAUDE.md §7.2)
 * src/components/ 안의 클래스 문자열을 읽어 shadcn/Tailwind 기본 모양이 다시 들어오지 않았는지 본다.
 * 색 리터럴은 tests/design-tokens.test.ts("하드코딩 색 금지")가 따로 검사한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_KEYS } from "@/lib/utils";

const COMPONENTS_DIR = path.resolve("src/components");
const UI_DIR = path.join(COMPONENTS_DIR, "ui");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? files(full)
      : /\.tsx?$/.test(name)
        ? [full]
        : [];
  });
}

const sources = files(COMPONENTS_DIR).map((file) => ({
  file: path.relative(process.cwd(), file),
  // 주석은 빼고 본다(설명에 shadcn 원래 클래스 이름을 적어 둔다)
  text: readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
}));

/** 금지 패턴 — [이름, 정규식] */
const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  // 모서리 0(DESIGN §5.1) — 원은 노치·천공·펀치 구멍(도메인 컴포넌트)에만
  ["둥근 모서리", /(?<![\w-])rounded-(?!none\b)[\w[]/],
  // 블러 그림자·글로우 금지(§5.2) — 인쇄 오프셋(shadow-print*)과 안쪽 막대(shadow-[inset_…])만
  [
    "블러 그림자",
    /(?<![\w-])(?:shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)|drop-shadow|blur-|backdrop-)/,
  ],
  // 비활성·hover를 투명도로 만들지 않는다(§9.1)
  ["투명도", /(?<![\w-])opacity-/],
  // shadcn 기본 포커스 링(ring-[3px] ring-ring/50) 대신 globals.css :focus-visible outline
  ["shadcn 포커스 링", /ring-ring\/|outline-ring\/|focus-visible:ring/],
  // 반복 애니메이션·스켈레톤 반짝임 금지(§6.2)
  ["반복 애니메이션", /animate-(?:pulse|spin|ping|bounce)/],
  // 컴포넌트는 dark:로 색을 따로 고르지 않는다(§2) — 토큰만
  ["dark: 변형", /(?<![\w-])dark:(?=[\w[!-])/],
  // 브레이크포인트는 lg:·xl:만(§7.1)
  [
    "lg·xl 밖 브레이크포인트",
    /(?<![\w-])(?:sm|md|2xl):(?=[\w[!-])|(?<![\w-])max-(?:sm|md|lg|xl|2xl|\[)[\w-]*:|(?<![\w-])min-\[/,
  ],
];

describe("shadcn 기본 모양 탈피 — src/components", () => {
  it("컴포넌트 파일이 있다", () => {
    expect(sources.map((s) => s.file)).toEqual(
      expect.arrayContaining([
        "src/components/ui/button.tsx",
        "src/components/ui/card.tsx",
        "src/components/ui/chip.tsx",
        "src/components/ui/skeleton.tsx",
        "src/components/ui/tabs.tsx",
        "src/components/ui/toast.tsx",
        "src/components/theme-toggle.tsx",
      ]),
    );
  });

  it.each(FORBIDDEN)("%s 없음", (_name, pattern) => {
    const hits = sources.flatMap(({ file, text }) =>
      text
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => pattern.test(line))
        .map(([n, line]) => `${file}:${n} ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("쓰는 animate-* 유틸리티는 인쇄형 모션 4종뿐이다(DESIGN §6.1)", () => {
    const used = new Set(
      sources.flatMap(({ text }) =>
        [...text.matchAll(/(?<![\w-])animate-([\w-]+)/g)].map((m) => m[1]),
      ),
    );
    const allowed = new Set<string>([...THEME_KEYS.animate, "none"]);
    expect([...used].filter((name) => name && !allowed.has(name))).toEqual([]);
  });

  it("클라이언트 섬은 상호작용이 필요한 것뿐이다 — ui/ 안에서는 tabs·toast만 'use client'(CLAUDE §7.2)", () => {
    const client = files(UI_DIR)
      .filter((file) =>
        /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.basename(file))
      .sort();
    expect(client).toEqual(["tabs.tsx", "toast.tsx"]);
  });

  it("아이콘은 인라인 SVG — 아이콘 라이브러리를 import하지 않는다", () => {
    const hits = sources.filter(({ text }) =>
      /from\s+["'](?:lucide-react|@radix-ui\/react-icons|react-icons|@tabler\/icons-react|@heroicons\/react)/.test(
        text,
      ),
    );
    expect(hits.map((s) => s.file)).toEqual([]);
  });

  /** root에서 import(타입 전용 제외)로 닿는 모듈 중 src/lib/utils.ts(cn)까지 가는 경로들 */
  function pathsToUtils(root: string): string[] {
    const SRC = path.resolve("src");
    const UTILS = path.join(SRC, "lib", "utils.ts");
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/")
        ? path.join(SRC, spec.slice(2))
        : spec.startsWith(".")
          ? path.resolve(path.dirname(from), spec)
          : null;
      if (!base) return null;
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const file = base + ext;
        try {
          if (statSync(file).isFile()) return file;
        } catch {
          // 다음 확장자
        }
      }
      return null;
    };
    const bad: string[] = [];
    const seen = new Set<string>();
    const stack: Array<[string, string[]]> = [[root, [root]]];
    while (stack.length) {
      const [file, trail] = stack.pop() as [string, string[]];
      if (seen.has(file)) continue;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      // 타입만 가져오는 import는 번들에 들어가지 않는다
      for (const m of text.matchAll(
        /^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm,
      )) {
        const target = resolve(file, m[1] ?? "");
        if (!target) continue;
        const next = [...trail, target];
        if (target === UTILS) {
          bad.push(next.map((f) => path.relative(SRC, f)).join(" → "));
        } else {
          stack.push([target, next]);
        }
      }
    }
    return bad;
  }

  it("클라이언트 섬('use client')에서 닿는 모듈은 cn(tailwind-merge, gzip 약 9KB)을 import하지 않는다 — cx를 쓴다", () => {
    const roots = files(path.resolve("src")).filter((file) =>
      /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
    );
    expect(roots.length).toBeGreaterThan(0);
    // 견본 페이지의 동작 칸(SPECIMEN=1 전용)은 예외가 아니다 — 같은 규칙을 지킨다
    expect(roots.flatMap(pathsToUtils)).toEqual([]);
  });

  it("섬이 import해 쓸 서버 컴포넌트(버튼·칩·아이콘·대회 색·필터 해제 버튼·AI 작성 라벨)도 cn에 닿지 않는다(DESIGN §9.4)", () => {
    // 지금 섬이 쓰지 않아도 M1 필터 섬(M1-33)·앱 셸(M1-30)이 가져다 쓸 모듈 — cn을 쓰면 그때 섬 번들이 9KB 늘어난다
    const ISLAND_SAFE = [
      "ai-label.tsx",
      "button.tsx",
      "button-classes.ts",
      "chip.tsx",
      "competition.ts",
      "filter-clear-button.tsx",
      "icons.tsx",
    ].map((name) => path.join(UI_DIR, name));
    expect(ISLAND_SAFE.flatMap(pathsToUtils)).toEqual([]);
  });
});
