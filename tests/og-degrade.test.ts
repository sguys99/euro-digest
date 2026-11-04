/**
 * OG 이미지 굽기 강등 (M5-13 — PRD §15 D77): 공유 이미지 하나가 그날 발행을 막지 않는다.
 * - 모드: 기본 strict(ci · 로컬 — 템플릿 회귀를 잡는다) · OG_BUILD_MODE=soft / --soft(collect · weekly · deploy 빌드 단계)
 * - 경고 · Step Summary 문구(scripts/lib/og-degrade.ts)
 * - 페이지 메타는 있는 PNG만 가리킨다 — 없으면 기본 OG(src/lib/seo.ts bakedOgCard · ogImageMeta)
 * - 실제 스크립트: Chromium이 없으면 soft는 exit 0 + 경고 · og_failed · Step Summary, strict는 exit 1. 아무 PNG도 쓰지 않는다
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  failureMessage,
  ogBuildMode,
  ogSummaryMarkdown,
  ogWarning,
} from "../scripts/lib/og-degrade";
import { existingOgPngs, ogFileOf } from "../scripts/lib/og-plan";
import { newsOgCard, pageOgCard, DEFAULT_OG_CARD } from "../src/lib/og";
import { bakedOgCard, ogImageMeta } from "../src/lib/seo";
import { SITE_NAME, SITE_TAGLINE } from "../src/lib/site";

describe("ogBuildMode — 기본 strict, soft는 명시할 때만", () => {
  it("환경변수 · 인자", () => {
    expect(ogBuildMode({}, new Set())).toBe("strict");
    expect(ogBuildMode({ OG_BUILD_MODE: "" }, new Set())).toBe("strict");
    expect(ogBuildMode({ OG_BUILD_MODE: "strict" }, new Set())).toBe("strict");
    expect(ogBuildMode({ OG_BUILD_MODE: "soft" }, new Set())).toBe("soft");
    expect(ogBuildMode({ OG_BUILD_MODE: " soft " }, new Set())).toBe("soft");
    expect(ogBuildMode({}, new Set(["--soft"]))).toBe("soft");
  });

  it("모르는 값은 던진다(오타로 조용히 바뀌지 않게)", () => {
    expect(() => ogBuildMode({ OG_BUILD_MODE: "warn" }, new Set())).toThrow(
      /strict 또는 soft/,
    );
  });
});

describe("경고 · Step Summary 문구", () => {
  const failures = [
    { path: "/og/news/2026-11-05.png", message: "Chromium 실행 실패 — x" },
    { path: "/og/teams/a.png", message: "Chromium 실행 실패 — x" },
    { path: "/og/teams/b.png", message: "Chromium 실행 실패 — x" },
    { path: "/og/teams/c.png", message: "글꼴 미준비 | y" },
  ];

  it("경고 — 장 수 · 앞 3장 · 첫 사유 · 기본 OG로 접힘 · 다시 굽는다", () => {
    const w = ogWarning(failures);
    expect(w.title).toBe("OG 이미지 굽기 실패 — 발행 계속");
    expect(w.message).toBe(
      "4장 못 구움(/og/news/2026-11-05.png · /og/teams/a.png · /og/teams/b.png 외): Chromium 실행 실패 — x. 그 쪽 메타는 /og/default.png(옛 PNG가 있으면 옛 그림)로 접히고, 다음 빌드가 다시 굽는다.",
    );
    expect(ogWarning([{ path: null, message: "m" }]).message).toMatch(
      /^굽기 계획을 세우지 못함: m\./,
    );
  });

  it("Step Summary — 사유별 한 줄(장 수 · 앞 3장), 표의 | 이스케이프", () => {
    const md = ogSummaryMarkdown(failures);
    expect(md).toContain("## OG 이미지 — 강등(발행 계속)");
    expect(md).toContain(
      "| Chromium 실행 실패 — x | 3 | `/og/news/2026-11-05.png` · `/og/teams/a.png` · `/og/teams/b.png` |",
    );
    expect(md).toContain("| 글꼴 미준비 \\| y | 1 | `/og/teams/c.png` |");
    expect(ogSummaryMarkdown([{ path: null, message: "m" }])).toContain(
      "| m | 0 | (계획 단계) |",
    );
  });

  it("failureMessage — 첫 줄만 · 길이 제한", () => {
    expect(failureMessage(new Error("a\nb"))).toBe("a");
    expect(failureMessage("x".repeat(300), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("페이지 메타 — 있는 PNG만 가리킨다(없으면 기본 OG)", () => {
  const none = () => false;
  const all = () => true;

  it("bakedOgCard — PNG가 없으면 기본 카드, 있으면 그대로, 기본은 늘 기본", () => {
    const card = newsOgCard("2026-11-02");
    expect(bakedOgCard(card, all)).toEqual(card);
    expect(bakedOgCard(card, none)).toEqual(DEFAULT_OG_CARD);
    expect(bakedOgCard(DEFAULT_OG_CARD, none)).toEqual(DEFAULT_OG_CARD);
  });

  it("ogImageMeta — 접히면 경로 · alt가 함께 기본으로(이미지와 alt가 어긋나지 않게)", () => {
    const meta = ogImageMeta(pageOgCard("transfers"), none);
    expect(meta.url.endsWith("/og/default.png")).toBe(true);
    expect(meta.alt).toBe(`${SITE_NAME} — ${SITE_TAGLINE}`);
    expect(
      ogImageMeta(pageOgCard("transfers"), all).url.endsWith(
        "/og/pages/transfers.png",
      ),
    ).toBe(true);
  });

  it("기본 판단은 public/og 파일 — 커밋된 날짜 PNG는 그대로, 굽지 않은 날짜는 기본", () => {
    const committed = existingOgPngs().find((p) => p.startsWith("/og/news/"));
    expect(committed).toBeDefined();
    const date = /(\d{4}-\d{2}-\d{2})/.exec(committed ?? "")?.[1] ?? "";
    expect(ogImageMeta(newsOgCard(date)).url.endsWith(committed ?? "")).toBe(
      true,
    );
    const future = newsOgCard("2099-01-01");
    expect(future.kind).toBe("news");
    expect(ogImageMeta(future).url.endsWith("/og/default.png")).toBe(true);
  });
});

describe("scripts/build-og.ts — Chromium이 없을 때 (실제 스크립트)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "og-degrade-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** 브라우저 경로를 빈 폴더로 돌려 실행 실패를 만든다. --force라 모든 장이 굽기 대상이지만, 실패하므로 아무것도 쓰지 않는다 */
  function runBuildOg(mode: "soft" | "strict") {
    const output = path.join(dir, `${mode}-output`);
    const summary = path.join(dir, `${mode}-summary.md`);
    const before = existingOgPngs().map((p) => readFileSync(ogFileOf(p)));
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/build-og.ts", "--force"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OG_BUILD_MODE: mode,
          PLAYWRIGHT_BROWSERS_PATH: path.join(dir, "no-browsers"),
          GITHUB_ACTIONS: "true",
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      },
    );
    const after = existingOgPngs().map((p) => readFileSync(ogFileOf(p)));
    const read = (file: string) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    };
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      output: read(output),
      summary: read(summary),
      unchanged:
        before.length === after.length &&
        before.every((b, i) => b.equals(after[i] ?? Buffer.alloc(0))),
    };
  }

  it("soft — exit 0, ::warning:: · og_failed=<n> · Step Summary, public/og 그대로", () => {
    const r = runBuildOg("soft");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      "::warning title=OG 이미지 굽기 실패 — 발행 계속::",
    );
    expect(r.output).toMatch(/^og_failed=[1-9]\d*$/m);
    expect(r.summary).toContain("## OG 이미지 — 강등(발행 계속)");
    expect(r.summary).toContain("Chromium 실행 실패");
    expect(r.unchanged).toBe(true);
  }, 60_000);

  it("strict(기본 — ci · 로컬) — exit 1, 경고 · 요약 없음", () => {
    const r = runBuildOg("strict");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("[build-og] 실패");
    expect(r.output).not.toContain("og_failed");
    expect(r.summary).toBe("");
    expect(r.unchanged).toBe(true);
  }, 60_000);
});
