/**
 * 깜빡임 없는 초기 테마·결과 가리기 스크립트 (D0-10, DR-02, DESIGN.md §8)
 * - 인라인 스크립트 문자열을 실제로 실행해(vm) 저장값 × 시스템 다크 조합마다 <html> 속성을 확인한다.
 * - 같은 로직의 순수 함수(readInitialRootState)와 결과가 같은지, 토글 순수 함수가 맞게 저장·적용하는지 본다.
 */
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

import {
  applyInitialRootState,
  applySpoilerPreference,
  applyThemePreference,
  isSpoilerOn,
  nextThemePreference,
  readInitialRootState,
  resolveTheme,
  SPOILER_STORAGE_KEY,
  THEME_CYCLE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  themePreferenceFromRoot,
  type AttributeTarget,
  type StorageLike,
  type ThemePreference,
} from "@/lib/theme";

import { extractThemeInitScript, readDesignMd } from "./support/design-tokens";

// ─── 가짜 DOM·저장소 ────────────────────────────────────────────────────────

class FakeRoot implements AttributeTarget {
  readonly attrs = new Map<string, string>();
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
}

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  constructor(initial: Record<string, string | undefined> = {}) {
    for (const [k, v] of Object.entries(initial)) {
      if (v !== undefined) this.items.set(k, v);
    }
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** 저장소 상황 */
type StorageCase =
  | { kind: "values"; theme?: string; spoiler?: string }
  /** localStorage 전역 접근 자체가 예외(쿠키 차단·샌드박스 iframe) */
  | { kind: "access-throws" }
  /** getItem이 예외 */
  | { kind: "get-throws" }
  /** 테마는 읽히고 가리기 키를 읽을 때 예외 */
  | { kind: "second-get-throws"; theme: string };

function makeStorage(c: StorageCase): () => FakeStorage {
  if (c.kind === "access-throws") {
    return () => {
      throw new Error("SecurityError: localStorage 접근 거부");
    };
  }
  const storage = new FakeStorage(
    c.kind === "values"
      ? { [THEME_STORAGE_KEY]: c.theme, [SPOILER_STORAGE_KEY]: c.spoiler }
      : c.kind === "second-get-throws"
        ? { [THEME_STORAGE_KEY]: c.theme }
        : {},
  );
  if (c.kind === "get-throws") {
    storage.getItem = () => {
      throw new Error("QuotaExceeded/SecurityError");
    };
  }
  if (c.kind === "second-get-throws") {
    const original = storage.getItem.bind(storage);
    storage.getItem = (key) => {
      if (key === SPOILER_STORAGE_KEY) throw new Error("두 번째 읽기 실패");
      return original(key);
    };
  }
  return () => storage;
}

/** 인라인 스크립트 문자열을 브라우저 비슷한 전역에서 실행하고 <html> 속성을 돌려준다. */
function runInitScript(
  c: StorageCase,
  systemPrefersDark: boolean,
): { attrs: Record<string, string>; matchMediaCalls: number } {
  const root = new FakeRoot();
  const getStorage = makeStorage(c);
  const matchMedia = vi.fn(() => ({ matches: systemPrefersDark }));
  const sandbox: Record<string, unknown> = {
    document: { documentElement: root },
    matchMedia,
  };
  Object.defineProperty(sandbox, "localStorage", {
    get: getStorage,
    enumerable: true,
  });
  sandbox.window = sandbox;
  vm.runInNewContext(THEME_INIT_SCRIPT, sandbox);
  return {
    attrs: Object.fromEntries(root.attrs),
    matchMediaCalls: matchMedia.mock.calls.length,
  };
}

function pureAttrs(c: StorageCase): Record<string, string> {
  const root = new FakeRoot();
  applyInitialRootState(root, readInitialRootState(makeStorage(c)));
  return Object.fromEntries(root.attrs);
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe("THEME_INIT_SCRIPT", () => {
  it("DESIGN.md §8 혼합안 원문과 글자 하나까지 같다", () => {
    expect(THEME_INIT_SCRIPT).toBe(extractThemeInitScript(readDesignMd()));
  });

  it("외부 참조·비동기 없이 한 줄 즉시 실행 함수다", () => {
    expect(THEME_INIT_SCRIPT).toMatch(/^\(function\(\)\{.*\}\)\(\);$/);
    expect(THEME_INIT_SCRIPT).not.toMatch(
      /https?:|import|fetch|setTimeout|<\/script/i,
    );
  });

  // 입력 → 기대 속성. 시스템 다크 여부는 속성에 영향이 없다(CSS가 고른다).
  const CASES: ReadonlyArray<{
    name: string;
    storage: StorageCase;
    attrs: Record<string, string>;
  }> = [
    { name: "저장값 없음", storage: { kind: "values" }, attrs: {} },
    {
      name: "ed-theme=system(저장하지 않는 값)",
      storage: { kind: "values", theme: "system" },
      attrs: {},
    },
    {
      name: "ed-theme=light",
      storage: { kind: "values", theme: "light" },
      attrs: { "data-theme": "light" },
    },
    {
      name: "ed-theme=dark",
      storage: { kind: "values", theme: "dark" },
      attrs: { "data-theme": "dark" },
    },
    {
      name: "ed-theme=DARK(대소문자 다름)",
      storage: { kind: "values", theme: "DARK" },
      attrs: {},
    },
    {
      name: "ed-theme=빈 문자열",
      storage: { kind: "values", theme: "" },
      attrs: {},
    },
    {
      name: 'ed-theme=JSON 문자열 "dark"',
      storage: { kind: "values", theme: '"dark"' },
      attrs: {},
    },
    {
      name: "ed-spoiler=on",
      storage: { kind: "values", spoiler: "on" },
      attrs: { "data-spoiler": "on" },
    },
    {
      name: "ed-spoiler=off",
      storage: { kind: "values", spoiler: "off" },
      attrs: {},
    },
    {
      name: "ed-spoiler=true",
      storage: { kind: "values", spoiler: "true" },
      attrs: {},
    },
    {
      name: "다크 + 가리기 켬",
      storage: { kind: "values", theme: "dark", spoiler: "on" },
      attrs: { "data-theme": "dark", "data-spoiler": "on" },
    },
    {
      name: "localStorage 접근 예외",
      storage: { kind: "access-throws" },
      attrs: {},
    },
    { name: "getItem 예외", storage: { kind: "get-throws" }, attrs: {} },
    {
      name: "테마는 읽고 가리기 읽기에서 예외",
      storage: { kind: "second-get-throws", theme: "light" },
      attrs: { "data-theme": "light" },
    },
  ];

  for (const systemPrefersDark of [false, true]) {
    const label = systemPrefersDark ? "시스템 다크" : "시스템 라이트";
    it.each(CASES)(`${label} · $name → 속성`, ({ storage, attrs }) => {
      const result = runInitScript(storage, systemPrefersDark);
      expect(result.attrs).toEqual(attrs);
      // 시스템 테마는 CSS(prefers-color-scheme)가 맡는다 — 스크립트는 matchMedia를 보지 않는다
      expect(result.matchMediaCalls).toBe(0);
    });
  }

  it.each(CASES)("순수 함수와 결과가 같다 · $name", ({ storage }) => {
    expect(pureAttrs(storage)).toEqual(runInitScript(storage, false).attrs);
  });

  it("예외가 나도 스크립트 밖으로 던지지 않는다", () => {
    expect(() => runInitScript({ kind: "access-throws" }, true)).not.toThrow();
    expect(() => runInitScript({ kind: "get-throws" }, false)).not.toThrow();
  });
});

describe("resolveTheme — 보이는 테마(CSS 선택자 규칙과 같다)", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("%s · 시스템 다크 %s → %s", (pref, systemDark, expected) => {
    expect(resolveTheme(pref, systemDark)).toBe(expected);
  });

  it("초기 상태 + 시스템 설정 → 보이는 테마", () => {
    const state = readInitialRootState(makeStorage({ kind: "access-throws" }));
    expect(resolveTheme(state.theme ?? "system", true)).toBe("dark");
    expect(resolveTheme(state.theme ?? "system", false)).toBe("light");
  });
});

describe("테마 토글 순수 함수", () => {
  it("순환: 시스템 → 라이트 → 다크 → 시스템", () => {
    expect(THEME_CYCLE).toEqual(["system", "light", "dark"]);
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("속성에서 지금 테마를 읽는다(없거나 모르는 값이면 시스템)", () => {
    const root = new FakeRoot();
    expect(themePreferenceFromRoot(root)).toBe("system");
    root.setAttribute("data-theme", "dark");
    expect(themePreferenceFromRoot(root)).toBe("dark");
    root.setAttribute("data-theme", "sepia");
    expect(themePreferenceFromRoot(root)).toBe("system");
  });

  it("라이트·다크는 속성을 달고 저장, 시스템은 속성과 키를 지운다", () => {
    const root = new FakeRoot();
    const storage = new FakeStorage();
    const seen: Array<[ThemePreference, string | null, string | null]> = [];
    let pref = themePreferenceFromRoot(root);
    for (let i = 0; i < 3; i++) {
      pref = nextThemePreference(pref);
      expect(applyThemePreference(root, () => storage, pref)).toBe(true);
      seen.push([
        pref,
        root.getAttribute("data-theme"),
        storage.getItem(THEME_STORAGE_KEY),
      ]);
    }
    expect(seen).toEqual([
      ["light", "light", "light"],
      ["dark", "dark", "dark"],
      ["system", null, null],
    ]);
  });

  it("저장소가 막혀도 속성은 바꾸고 false를 돌려준다", () => {
    const root = new FakeRoot();
    const blocked = (): StorageLike => {
      throw new Error("SecurityError");
    };
    expect(applyThemePreference(root, blocked, "dark")).toBe(false);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(applyThemePreference(root, blocked, "system")).toBe(false);
    expect(root.getAttribute("data-theme")).toBeNull();
  });

  it("저장한 값을 다음 방문의 초기 스크립트가 그대로 읽는다", () => {
    const storage = new FakeStorage();
    applyThemePreference(new FakeRoot(), () => storage, "dark");
    applySpoilerPreference(new FakeRoot(), () => storage, true);
    expect(readInitialRootState(() => storage)).toEqual({
      theme: "dark",
      spoiler: "on",
    });
  });
});

describe("결과 가리기 순수 함수", () => {
  it("켜면 data-spoiler=on과 ed-spoiler=on, 끄면 둘 다 지운다", () => {
    const root = new FakeRoot();
    const storage = new FakeStorage();
    expect(isSpoilerOn(root)).toBe(false);
    expect(applySpoilerPreference(root, () => storage, true)).toBe(true);
    expect(isSpoilerOn(root)).toBe(true);
    expect(storage.getItem(SPOILER_STORAGE_KEY)).toBe("on");
    expect(applySpoilerPreference(root, () => storage, false)).toBe(true);
    expect(isSpoilerOn(root)).toBe(false);
    expect(storage.getItem(SPOILER_STORAGE_KEY)).toBeNull();
  });

  it("저장소가 막혀도 속성은 바꾸고 false를 돌려준다", () => {
    const root = new FakeRoot();
    const blocked = (): StorageLike => {
      throw new Error("SecurityError");
    };
    expect(applySpoilerPreference(root, blocked, true)).toBe(false);
    expect(isSpoilerOn(root)).toBe(true);
  });
});
