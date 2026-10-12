/**
 * 견본 빌드 플래그 (D0-12) — next.config.ts가 `SPECIMEN=1`일 때만 견본 라우트(`*.specimen.tsx`)를 페이지로 보고
 * 결과를 out-specimen/에 낸다. 일반 빌드 설정에는 견본 흔적이 없어야 한다(공개 URL 불변).
 * 실제 out/에 견본이 없는지는 tests/e2e/smoke.spec.ts가 빌드 결과로 확인한다.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig(specimen: string | undefined): Promise<NextConfig> {
  vi.resetModules();
  if (specimen === undefined) vi.stubEnv("SPECIMEN", undefined);
  else vi.stubEnv("SPECIMEN", specimen);
  const mod = (await import("../next.config")) as { default: NextConfig };
  return mod.default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config.ts — 견본 빌드 플래그", () => {
  it("일반 빌드: 기본 페이지 확장자만, distDir 기본값(→ out/)", async () => {
    const config = await loadConfig(undefined);
    expect(config.pageExtensions).toEqual(["tsx", "ts", "jsx", "js"]);
    expect(config.distDir).toBeUndefined();
    expect(config.output).toBe("export");
  });

  it.each(["0", "true", "yes", ""])(
    "SPECIMEN=%j는 견본을 켜지 않는다(정확히 1만)",
    async (value) => {
      const config = await loadConfig(value);
      expect(config.pageExtensions).not.toContain("specimen.tsx");
      expect(config.distDir).toBeUndefined();
    },
  );

  it("SPECIMEN=1: specimen.tsx 확장자를 더하고 결과는 out-specimen/", async () => {
    const config = await loadConfig("1");
    expect(config.pageExtensions).toEqual([
      "specimen.tsx",
      "tsx",
      "ts",
      "jsx",
      "js",
    ]);
    expect(config.distDir).toBe("out-specimen");
    // 공개 URL 구조는 같다
    expect(config.basePath).toBe((await loadConfig(undefined)).basePath);
    expect(config.trailingSlash).toBe(true);
  });

  it("견본 라우트 파일은 *.specimen.tsx뿐이다 — 일반 확장자(page.tsx)로 두면 공개 빌드에 들어간다", () => {
    const dir = path.resolve("src/app/specimen");
    expect(existsSync(dir)).toBe(true);
    const routeFiles = readdirSync(dir).filter((name) =>
      /^(?:page|layout|loading|error|not-found|template|default|route)\./.test(
        name,
      ),
    );
    expect(routeFiles).toEqual(["page.specimen.tsx"]);
  });
});
