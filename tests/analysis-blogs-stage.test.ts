/**
 * 주간 단계 analysis-blogs (M3-08 — PRD FR-10·FR-57, D22·D23·D48) — scripts/lib/analysis-blogs-stage.ts. 네트워크 없음(가짜 fetch +
 * fixtures/analysis 합성 피드), LLM 없음.
 * - 임시 저장소(configs 사본 + data/teams 실데이터 사본)에서 reading만 바뀌고 나머지 팀 값은 그대로
 * - 요약문·본문을 읽지 않고(D48 ①) 저장하지 않는다 · 제목·URL 원문 그대로(D23) · 팀 0건 글은 버린다
 * - dry는 쓰지 않는다 · 소스 실패는 기존 reading 유지 + 단계 실패 · 실행 기록 sources[](usable = 지난 7일 새 글)
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TeamSchema, type RunSource, type Team } from "@/lib/schema";

import {
  ANALYSIS_FEED_GAP_MS,
  ANALYSIS_TEAMS_DIR,
  createAnalysisBlogsStage,
} from "../scripts/lib/analysis-blogs-stage";
import type { FeedClock } from "../scripts/lib/feed-collect";
import { createLogger } from "../scripts/lib/logger";
import type { WeeklyStageContext } from "../scripts/lib/weekly-stages";
import { WEEKLY_STAGES } from "../scripts/lib/weekly-stages";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FEED_URL = "https://spielverlagerung.com/feed/";
const FIXTURE = await readFile(
  path.join(ROOT, "fixtures/analysis/spielverlagerung-en.xml"),
  "utf8",
);
const TEAM_SLUGS = [
  "arsenal",
  "bayern-munchen",
  "borussia-dortmund",
  "inter",
  "napoli",
  "psv",
  "chelsea",
];
const NOW_MS = Date.parse("2026-11-01T23:00:00.000Z");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "analysis-blogs-"));
  await mkdir(path.join(root, "configs"), { recursive: true });
  for (const f of [
    "sources.json",
    "names.ko.json",
    "korean-players.json",
    "takedowns.json",
  ]) {
    await cp(path.join(ROOT, "configs", f), path.join(root, "configs", f));
  }
  await mkdir(path.join(root, "data/teams"), { recursive: true });
  for (const slug of TEAM_SLUGS) {
    await cp(
      path.join(ROOT, "data/teams", `${slug}.json`),
      path.join(root, "data/teams", `${slug}.json`),
    );
  }
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const readTeam = async (slug: string): Promise<Team> =>
  TeamSchema.parse(
    JSON.parse(
      await readFile(path.join(root, "data/teams", `${slug}.json`), "utf8"),
    ),
  );

interface Harness {
  ctx: WeeklyStageContext;
  calls: { url: string; ua: string | null }[];
  printed: string[];
  logs: string[];
  sources: RunSource[];
}

function harness(
  over: {
    dry?: boolean;
    respond?: (url: string) => Response | Promise<Response>;
  } = {},
): Harness {
  const calls: Harness["calls"] = [];
  const printed: string[] = [];
  const logs: string[] = [];
  const sources: RunSource[] = [];
  const ctx: WeeklyStageContext = {
    rootDir: root,
    dataDir: path.join(root, "data"),
    week: "2026-44",
    weekRange: {
      from: "2026-10-26T00:00:00.000Z",
      to: "2026-11-01T23:59:59.999Z",
    },
    env: "dev",
    llmMode: "mock",
    dry: over.dry ?? false,
    force: false,
    runId: "weekly-dev-20261101T230000Z-0000",
    startedAt: new Date(NOW_MS).toISOString(),
    now: () => new Date(NOW_MS),
    signal: new AbortController().signal,
    logger: createLogger({ scope: "weekly", sink: (line) => logs.push(line) }),
    print: (t) => printed.push(t),
    llm: {
      model: "claude-haiku-5-5",
      createClient: () => {
        throw new Error("분석 블로그 단계는 LLM을 부르지 않는다");
      },
      addResults: () => {
        throw new Error("분석 블로그 단계는 LLM 결과가 없다");
      },
      costSoFar: () => 0,
    },
    budget: {
      check: () => Promise.reject(new Error("예산을 보지 않는다")),
    },
    apiCalls: { add: () => {} },
    http: {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: input, ua: headers.get("user-agent") });
        if (over.respond) return over.respond(input);
        return new Response(FIXTURE, {
          status: 200,
          headers: { "content-type": "application/rss+xml; charset=UTF-8" },
        });
      },
      userAgent:
        "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; test@example.com)",
    },
    sources: {
      add: (entries) => {
        for (const e of entries) sources.push(e);
      },
    },
  };
  return { ctx, calls, printed, logs, sources };
}

const sleeps: number[] = [];
const CLOCK: FeedClock = {
  now: () => NOW_MS,
  sleep: (ms) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
};
const stage = createAnalysisBlogsStage({ clock: CLOCK });

describe("등록 — WEEKLY_STAGES analysis-blogs", () => {
  it("구현됨 · LLM 없음 · writes = data/teams", () => {
    const s = WEEKLY_STAGES.find((x) => x.id === "analysis-blogs");
    expect(s).toMatchObject({ task: "M3-08", llm: false });
    expect(s?.run).not.toBeNull();
    expect(s?.writes).toEqual([ANALYSIS_TEAMS_DIR]);
    expect(ANALYSIS_FEED_GAP_MS).toBeGreaterThanOrEqual(2_000);
    expect(ANALYSIS_FEED_GAP_MS).toBeLessThanOrEqual(3_000);
  });
});

describe("runAnalysisBlogs — fixture 피드 1개", () => {
  it("피드 1회 요청(UA) → 원제목으로 팀 연결 → reading만 갱신, 나머지 팀 값은 그대로", async () => {
    const before = await readTeam("arsenal");
    const h = harness();
    const report = await stage(h.ctx);

    expect(h.calls).toEqual([{ url: FEED_URL, ua: h.ctx.http.userAgent }]);
    expect(report?.counts).toMatchObject({
      sources: 1,
      failed: 0,
      items: 10,
      posts: 10,
      matched: 5,
      unmatched: 4,
      tooOld: 1,
      links: 7,
      teams: 6,
      written: 6,
    });
    expect([...(report?.outputs ?? [])].sort()).toEqual(
      [
        "arsenal",
        "bayern-munchen",
        "borussia-dortmund",
        "inter",
        "napoli",
        "psv",
      ].map((s) => `${ANALYSIS_TEAMS_DIR}/${s}.json`),
    );

    const arsenal = await readTeam("arsenal");
    expect(arsenal.reading).toEqual([
      {
        title: "Arsenal’s rest-defence: how Arteta builds behind the ball",
        url: "https://spielverlagerung.com/fixture/synthetic-0/",
        source: "Spielverlagerung",
      },
      {
        title: "Arsenal’s set-piece routines, revisited",
        url: "https://spielverlagerung.com/fixture/synthetic-6/",
        source: "Spielverlagerung",
      },
    ]);
    // reading 밖은 그대로
    expect({ ...arsenal, reading: before.reading }).toEqual(before);
    expect((await readTeam("psv")).reading.map((r) => r.title)).toEqual([
      "PSV onder Bosz: hoe de opbouw verandert",
    ]);
    // 팀이 제목에 없는 첼시(요약·본문에만 있음)는 바뀌지 않는다
    expect((await readTeam("chelsea")).reading).toEqual([]);
  });

  it("요약문·본문을 저장하지 않는다(D48 ① — 합성 SYNTH- 문자열이 어디에도 없다)", async () => {
    const h = harness();
    await stage(h.ctx);
    for (const slug of TEAM_SLUGS) {
      const text = await readFile(
        path.join(root, "data/teams", `${slug}.json`),
        "utf8",
      );
      expect(text, slug).not.toMatch(/SYNTH-(DESC|CONTENT)/u);
    }
    expect(h.printed.join("\n")).not.toMatch(/SYNTH-/u);
    expect(h.logs.join("\n")).not.toMatch(/SYNTH-/u);
    // 구조화 로그에 원제목을 넣지 않는다
    expect(h.logs.join("\n")).not.toContain("rest-defence");
  });

  it("실행 기록 sources[] — 지난 7일 새 글 수(usable)", async () => {
    const h = harness();
    await stage(h.ctx);
    expect(h.sources).toEqual([
      { id: "spielverlagerung-en", ok: true, items: 10, usable: 1 },
    ]);
  });

  it("dry — 쓰지 않고 글별 팀 연결을 출력한다", async () => {
    const h = harness({ dry: true });
    const report = await stage(h.ctx);
    expect(report?.outputs).toEqual([]);
    expect((await readTeam("arsenal")).reading).toEqual([]);
    const out = h.printed.join("\n");
    expect(out).toContain("dry");
    expect(out).toContain("[아스널] Arsenal’s rest-defence");
    expect(out).toContain("[팀 없음 — 버림] Positional play");
    expect(out).toContain("[오래됨] Real Madrid without");
  });

  it("두 번 돌려도 같은 결과(멱등) — 두 번째는 쓰지 않는다", async () => {
    await stage(harness().ctx);
    const second = await stage(harness().ctx);
    expect(second?.outputs).toEqual([]);
    expect(second?.counts?.teams).toBe(0);
  });

  it("기존 reading 뒤에 붙고 5건에서 자른다", async () => {
    const team = await readTeam("arsenal");
    const prev = [1, 2, 3, 4].map((n) => ({
      title: `Older ${n}`,
      url: `https://spielverlagerung.com/older-${n}/`,
      source: "Spielverlagerung",
    }));
    await writeFile(
      path.join(root, "data/teams/arsenal.json"),
      `${JSON.stringify({ ...team, reading: prev }, null, 2)}\n`,
    );
    await stage(harness().ctx);
    expect((await readTeam("arsenal")).reading.map((r) => r.title)).toEqual([
      "Arsenal’s rest-defence: how Arteta builds behind the ball",
      "Arsenal’s set-piece routines, revisited",
      "Older 1",
      "Older 2",
      "Older 3",
    ]);
  });
});

describe("runAnalysisBlogs — 실패 격리", () => {
  it("소스 실패(HTTP 503 — 재시도 1회 포함) → 단계 실패, 팀 파일은 그대로, 실행 기록에 실패 줄", async () => {
    const before = await readFile(
      path.join(root, "data/teams/arsenal.json"),
      "utf8",
    );
    const h = harness({
      respond: () => new Response("busy", { status: 503 }),
    });
    await expect(stage(h.ctx)).rejects.toThrow(
      /전부 실패.*spielverlagerung-en/u,
    );
    expect(h.calls).toHaveLength(2);
    expect(
      await readFile(path.join(root, "data/teams/arsenal.json"), "utf8"),
    ).toBe(before);
    expect(h.sources).toEqual([
      { id: "spielverlagerung-en", ok: false, items: 0, error: "http-5xx" },
    ]);
  });

  it("깨진 XML → 단계 실패(parse), 쓰지 않음", async () => {
    const h = harness({
      respond: () =>
        new Response("<rss><channel><item><title>x", {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        }),
    });
    await expect(stage(h.ctx)).rejects.toThrow(/parse/u);
    expect((await readTeam("arsenal")).reading).toEqual([]);
  });

  it("분석 소스가 아예 없으면 요청하지 않는다", async () => {
    const sources = JSON.parse(
      await readFile(path.join(root, "configs/sources.json"), "utf8"),
    ) as { id: string; type: string }[];
    await writeFile(
      path.join(root, "configs/sources.json"),
      JSON.stringify(sources.filter((s) => s.type !== "analysis")),
    );
    const h = harness();
    const report = await stage(h.ctx);
    expect(h.calls).toEqual([]);
    expect(report?.note).toBe("분석 블로그 소스 없음");
  });

  it("소스를 끄면(중단 요구) 요청하지 않고, 이전 reading에서 그 매체 글만 지운다", async () => {
    const team = await readTeam("arsenal");
    const other = {
      title: "Another blog post",
      url: "https://other.example.com/p/1/",
      source: "Other Blog",
    };
    await writeFile(
      path.join(root, "data/teams/arsenal.json"),
      `${JSON.stringify(
        {
          ...team,
          reading: [
            {
              title: "Old Spielverlagerung post",
              url: "https://spielverlagerung.com/old/",
              source: "Spielverlagerung",
            },
            other,
          ],
        },
        null,
        2,
      )}\n`,
    );
    const sources = JSON.parse(
      await readFile(path.join(root, "configs/sources.json"), "utf8"),
    ) as { id: string; enabled: boolean }[];
    await writeFile(
      path.join(root, "configs/sources.json"),
      JSON.stringify(
        sources.map((s) =>
          s.id === "spielverlagerung-en" ? { ...s, enabled: false } : s,
        ),
      ),
    );
    const h = harness();
    const report = await stage(h.ctx);
    expect(h.calls).toEqual([]);
    expect(h.sources).toEqual([]);
    expect(report?.note).toBe(
      "분석 블로그 소스 없음 — 수집을 멈춘 매체 글만 정리",
    );
    expect(report?.outputs).toEqual([`${ANALYSIS_TEAMS_DIR}/arsenal.json`]);
    expect((await readTeam("arsenal")).reading).toEqual([other]);
  });

  it("팀 파일이 없으면 요청하지 않는다", async () => {
    await rm(path.join(root, "data/teams"), { recursive: true });
    const h = harness();
    const report = await stage(h.ctx);
    expect(h.calls).toEqual([]);
    expect(report?.counts?.teams).toBe(0);
  });

  it("삭제 요청(takedowns) URL은 게시하지 않는다", async () => {
    const { cardIdFor } = await import("../scripts/lib/card-id");
    await writeFile(
      path.join(root, "configs/takedowns.json"),
      JSON.stringify([
        {
          id: cardIdFor("https://spielverlagerung.com/fixture/synthetic-0/"),
          requestedAt: "2026-11-01T00:00:00.000Z",
          handledAt: null,
          reason: "테스트",
        },
      ]),
    );
    await stage(harness().ctx);
    expect((await readTeam("arsenal")).reading.map((r) => r.url)).toEqual([
      "https://spielverlagerung.com/fixture/synthetic-6/",
    ]);
  });
});
