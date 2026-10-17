// scripts/lib/purge-stage.ts — 수집 실행의 data/news 원본 삭제 단계 (M1-25, FR-143·D32) — 임시 폴더, 네트워크 없음
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  SeenUrlsFileSchema,
  type CardSource,
  type NewsCard,
  type Source,
  type TakedownsFile,
} from "@/lib/schema";

import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { RETENTION_PURGE_LEAD_MS } from "../scripts/lib/purge-plan";
import {
  formatPurgePlan,
  purgeSummary,
  runPurgeStage,
  withPurgeStatus,
  type PurgeStageDeps,
} from "../scripts/lib/purge-stage";
import { urlHash } from "../scripts/lib/url-normalize";

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTED = "2026-10-20T21:30:00.000Z";
const NOW = new Date("2026-10-20T21:31:00.000Z");

let root: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-purge-"));
  dataDir = path.join(root, "data");
  mkdirSync(path.join(root, "configs"), { recursive: true });
  writeFileSync(path.join(root, "configs", "takedowns.json"), "[]\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BBC_SOURCE: Source = {
  id: "bbc-sport-football",
  name: "BBC Sport — Football",
  type: "rss",
  url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
  lang: "en",
  enabled: true,
  summarize: false,
  weight: 1.4,
  tier: 1,
  competitions: [],
  terms_checked: true,
  robots_checked: false,
};
const ATHLETIC_SOURCE: Source = {
  ...BBC_SOURCE,
  id: "the-athletic-football",
  name: "The Athletic — Football",
  url: "https://www.nytimes.com/athletic/rss/football/",
  retentionDays: 7,
};

function src(n: string, u: string, at: string): CardSource {
  return { n, u, at, tier: 1 };
}

function card(id: string, sources: CardSource[], created: string): NewsCard {
  return {
    id,
    t: `title ${id}`,
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: sources,
    lang: "en",
    ai: false,
    created,
  };
}

function writeNews(date: string, cards: NewsCard[]): string {
  const target = path.join(dataDir, "news", `${date}.json`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify(
      NewsFileSchema.parse({
        date,
        generatedAt: `${date}T00:00:00.000Z`,
        runId: `prod-collect-old-${date}`,
        cards,
      }),
      null,
      2,
    )}\n`,
  );
  return target;
}

function readNews(date: string) {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

function readSeen() {
  return SeenUrlsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "cache", "seen-urls.json"), "utf8"),
    ),
  );
}

function makeDeps(over: Partial<PurgeStageDeps> = {}) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const deps: PurgeStageDeps = {
    rootDir: root,
    dataDir,
    env: "dev",
    dry: false,
    now: () => NOW,
    loadSources: async () => [BBC_SOURCE, ATHLETIC_SOURCE],
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
    print: (text) => printed.push(text),
    ...over,
  };
  return { deps, records, printed };
}

const takedowns = (ids: string[]): TakedownsFile =>
  ids.map((id) => ({
    id,
    requestedAt: "2026-10-20T00:00:00Z",
    handledAt: null,
    reason: "저작권자 삭제 요청 (#1)",
  }));

// ─── 시나리오 데이터 ─────────────────────────────────────────────────────

const DUP_URL =
  "https://www.bbc.co.uk/news/articles/c8x23ekvp3ywo?at_medium=RSS&at_campaign=rss";
const DUP = card(
  "c_fb2dd57b4a",
  [src("BBC Sport", DUP_URL, "2026-10-11T18:00:00.000Z")],
  "2026-10-11T21:30:00.000Z",
);
const KEEP = card(
  "c_0ece511965",
  [
    src(
      "BBC Sport",
      "https://www.bbc.co.uk/sport/football/articles/keep",
      "2026-10-11T17:00:00.000Z",
    ),
  ],
  "2026-10-11T21:30:00.000Z",
);
const ATHLETIC_AT = "2026-10-13T20:00:00.000Z"; // + 7일 = 2026-10-20T20:00Z < STARTED → 만료
const MIXED = card(
  "c_5555555555",
  [
    src(
      "BBC Sport",
      "https://www.bbc.co.uk/sport/football/articles/mixed",
      "2026-10-13T19:00:00.000Z",
    ),
    src("The Athletic", "https://www.nytimes.com/athletic/5/", ATHLETIC_AT),
  ],
  "2026-10-13T21:30:00.000Z",
);
const FRESH_ATHLETIC = card(
  "c_6666666666",
  [
    src(
      "The Athletic",
      "https://www.nytimes.com/athletic/6/",
      "2026-10-19T20:00:00.000Z",
    ),
  ],
  "2026-10-19T21:30:00.000Z",
);

describe("runPurgeStage — 삭제 요청 (FR-143)", () => {
  it("저장된 card.id로 모든 날짜 파일에서 지우고, 링크 해시를 기억에 남기고, 그 파일만 다시 쓴다(generatedAt·runId 갱신)", async () => {
    writeNews("2026-10-12", [DUP, KEEP]);
    writeNews("2026-10-13", [DUP]);
    const untouched = writeNews("2026-10-14", [KEEP]);
    const mtime = statSync(untouched).mtimeMs;
    const { deps, records } = makeDeps({
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
    });

    const outcome = await runPurgeStage(deps, {
      runId: "dev-collect-20261020T213000Z",
      startedAt: STARTED,
    });

    expect(outcome.state).toBe("done");
    expect(outcome.errors).toEqual([]);
    expect(outcome.written).toEqual(["2026-10-12", "2026-10-13"]);
    expect(outcome.plan.counts.takedownCards).toBe(2);
    expect(readNews("2026-10-12").cards.map((c) => c.id)).toEqual([
      "c_0ece511965",
    ]);
    const emptied = readNews("2026-10-13");
    expect(emptied.cards).toEqual([]);
    expect(emptied.generatedAt).toBe(NOW.toISOString());
    expect(emptied.runId).toBe("dev-collect-20261020T213000Z");
    expect(statSync(untouched).mtimeMs).toBe(mtime);
    // 기억 파일이 없었으면 지운 링크 해시로 새로 만든다(처음 카드가 된 시각 = card.created)
    expect(readSeen().urls).toEqual({
      [urlHash(DUP_URL)]: "2026-10-11T21:30:00.000Z",
    });
    expect(outcome.seenAdded).toBe(1);
    // 로그에는 카드 ID·건수만(링크·제목 없음)
    const text = JSON.stringify(records);
    expect(text).not.toContain(DUP_URL);
    expect(text).not.toContain("title c_");
    expect(records.find((r) => r.event === "collect.purge.done")).toMatchObject(
      {
        takedownCards: 2,
        written: 2,
        seenAdded: 1,
      },
    );
  });

  it("기억에 이미 있는 키는 그대로 두고 파일을 다시 쓰지 않는다", async () => {
    writeNews("2026-10-12", [DUP, KEEP]);
    const seenPath = path.join(dataDir, "cache", "seen-urls.json");
    mkdirSync(path.dirname(seenPath), { recursive: true });
    const seenText = `${JSON.stringify({ updatedAt: "2026-10-12T00:00:00.000Z", urls: { [urlHash(DUP_URL)]: "2026-10-11T21:30:00.000Z" } }, null, 2)}\n`;
    writeFileSync(seenPath, seenText);
    const { deps } = makeDeps({
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
    });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.seenAdded).toBe(0);
    expect(readFileSync(seenPath, "utf8")).toBe(seenText);
    expect(readNews("2026-10-12").cards).toHaveLength(1);
  });

  it("기본 경로는 <rootDir>/configs/takedowns.json", async () => {
    writeNews("2026-10-12", [DUP, KEEP]);
    writeFileSync(
      path.join(root, "configs", "takedowns.json"),
      JSON.stringify(takedowns(["c_fb2dd57b4a"])),
    );
    const { deps } = makeDeps();
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.takedowns).toBe(1);
    expect(outcome.plan.counts.takedownCards).toBe(1);
  });
});

describe("runPurgeStage — 보존 기간 (D32)", () => {
  it("만료된 비대표 출처만 빼고, 기간 안의 Athletic 카드는 그대로", async () => {
    writeNews("2026-10-14", [MIXED]);
    writeNews("2026-10-20", [FRESH_ATHLETIC]);
    const { deps } = makeDeps();
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.retention).toEqual({ "The Athletic": 7 });
    expect(outcome.written).toEqual(["2026-10-14"]);
    const [mixed] = readNews("2026-10-14").cards;
    expect(mixed?.src.map((s) => s.n)).toEqual(["BBC Sport"]);
    expect(readNews("2026-10-20").cards).toEqual([FRESH_ATHLETIC]);
  });

  it("수집 실행은 30시간 미리 지운다 — 경계: 만료 30시간 + 1ms 전 실행은 유지, 정확히 30시간 전 실행은 삭제", async () => {
    const expiresAt = Date.parse(ATHLETIC_AT) + 7 * DAY_MS;
    expect(RETENTION_PURGE_LEAD_MS).toBe(30 * 60 * 60 * 1000);

    writeNews("2026-10-14", [MIXED]);
    const early = await runPurgeStage(makeDeps().deps, {
      runId: "r",
      startedAt: new Date(
        expiresAt - RETENTION_PURGE_LEAD_MS - 1,
      ).toISOString(),
    });
    expect(early.written).toEqual([]);
    expect(readNews("2026-10-14").cards).toEqual([MIXED]);

    const onTime = await runPurgeStage(makeDeps().deps, {
      runId: "r",
      startedAt: new Date(expiresAt - RETENTION_PURGE_LEAD_MS).toISOString(),
    });
    expect(onTime.written).toEqual(["2026-10-14"]);
    // 아직 만료 전이지만 지웠다 — 계획의 만료 시각은 실제 만료 시각 그대로
    expect(onTime.plan.files[0]?.removedSources).toEqual([
      {
        cardId: "c_5555555555",
        index: 1,
        publisher: "The Athletic",
        expiresAt: new Date(expiresAt).toISOString(),
      },
    ]);
  });
});

describe("runPurgeStage — dry·실패 격리", () => {
  it("dry는 계획만 출력하고 아무것도 쓰지 않는다(링크·제목 없음)", async () => {
    const target = writeNews("2026-10-12", [DUP, KEEP]);
    const before = readFileSync(target, "utf8");
    const { deps, printed } = makeDeps({
      dry: true,
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
    });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.state).toBe("dry");
    expect(readFileSync(target, "utf8")).toBe(before);
    expect(readdirSync(dataDir)).toEqual(["news"]);
    expect(printed[0]).toMatch(
      /^── \[dry\] data\/news 원본 삭제 — 카드 1장\(삭제 요청 1 · 보존 기간 0\)/,
    );
    expect(printed.join("\n")).toContain(
      "2026-10-12 — 카드 c_fb2dd57b4a(삭제 요청)",
    );
    expect(printed.join("\n")).not.toContain("bbc.co.uk");
  });

  it("지울 것이 없으면 파일·출력 없이 끝난다", async () => {
    writeNews("2026-10-12", [KEEP]);
    const { deps, printed } = makeDeps();
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome).toMatchObject({ state: "done", written: [], errors: [] });
    expect(printed).toEqual([]);
    expect(readdirSync(dataDir)).toEqual(["news"]);
  });

  it("data/news 폴더가 없어도 오류 없이 끝난다", async () => {
    const { deps } = makeDeps();
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome).toMatchObject({ state: "done", scanned: 0, errors: [] });
  });

  it("깨진 날짜 파일은 건너뛰고 나머지는 지운다(오류로 남김)", async () => {
    writeNews("2026-10-12", [DUP]);
    mkdirSync(path.join(dataDir, "news"), { recursive: true });
    writeFileSync(path.join(dataDir, "news", "2026-10-13.json"), "{ broken");
    const { deps } = makeDeps({
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
    });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.written).toEqual(["2026-10-12"]);
    expect(outcome.errors).toEqual([
      {
        step: "read",
        date: "2026-10-13",
        error: expect.stringMatching(/JSON 파싱 실패/),
      },
    ]);
    expect(withPurgeStatus("success", outcome)).toBe("partial");
  });

  it("삭제 요청 설정을 못 읽어도 보존 기간 삭제는 한다(반대도 같다)", async () => {
    writeNews("2026-10-14", [MIXED]);
    const { deps } = makeDeps({
      loadTakedowns: async () => {
        throw new Error("configs/takedowns.json 스키마 검증 실패(1건)");
      },
    });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.takedowns).toBeNull();
    expect(outcome.errors.map((e) => e.step)).toEqual(["takedowns"]);
    expect(outcome.written).toEqual(["2026-10-14"]);

    writeNews("2026-10-12", [DUP]);
    const second = makeDeps({
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
      loadSources: async () => {
        throw new Error("configs/sources.json 읽기 실패");
      },
    });
    const outcome2 = await runPurgeStage(second.deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome2.retention).toBeNull();
    expect(outcome2.errors.map((e) => e.step)).toEqual(["sources"]);
    expect(outcome2.written).toEqual(["2026-10-12"]);
  });

  it("기억 파일이 깨졌으면 뉴스 파일을 지우지 않는다(blocked — 다시 카드가 되지 않게), prod는 오류 주석", async () => {
    const target = writeNews("2026-10-12", [DUP, KEEP]);
    const before = readFileSync(target, "utf8");
    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    writeFileSync(path.join(dataDir, "cache", "seen-urls.json"), "not json");
    const { deps, printed } = makeDeps({
      env: "prod",
      loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]),
    });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(outcome.state).toBe("blocked");
    expect(outcome.errors.map((e) => e.step)).toEqual(["seen"]);
    expect(readFileSync(target, "utf8")).toBe(before);
    expect(
      printed.some((l) => l.startsWith("::error title=data 원본 삭제")),
    ).toBe(true);
    expect(withPurgeStatus("success", outcome)).toBe("partial");
    expect(withPurgeStatus("failed", outcome)).toBe("failed");
  });

  it("오류가 없으면 실행 상태를 바꾸지 않는다", () => {
    expect(withPurgeStatus("success", { errors: [] })).toBe("success");
    expect(withPurgeStatus("partial", { errors: [] })).toBe("partial");
    expect(withPurgeStatus("success", null)).toBe("success");
  });
});

describe("purgeSummary — collect.done 한 칸", () => {
  it("state:cards/sources(+오류)", async () => {
    writeNews("2026-10-12", [DUP, KEEP]);
    writeNews("2026-10-14", [MIXED]);
    const done = await runPurgeStage(
      makeDeps({ loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]) }).deps,
      { runId: "r", startedAt: STARTED },
    );
    expect(purgeSummary(done)).toBe("done:cards1/sources1");

    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    writeFileSync(path.join(dataDir, "cache", "seen-urls.json"), "not json");
    writeNews("2026-10-13", [DUP]);
    const blocked = await runPurgeStage(
      makeDeps({ loadTakedowns: async () => takedowns(["c_fb2dd57b4a"]) }).deps,
      { runId: "r", startedAt: STARTED },
    );
    expect(purgeSummary(blocked)).toBe("blocked:cards1/sources0/errors1");
  });
});

describe("formatPurgePlan", () => {
  it("카드 ID·매체명·만료 시각만 쓴다", async () => {
    writeNews("2026-10-14", [MIXED]);
    const { deps } = makeDeps({ dry: true });
    const outcome = await runPurgeStage(deps, {
      runId: "r",
      startedAt: STARTED,
    });
    expect(formatPurgePlan(outcome.plan)).toEqual([
      "data/news 원본 삭제 — 카드 0장(삭제 요청 0 · 보존 기간 0) · 출처 1건 · 파일 1개 · 기억에 남길 링크 1개",
      "   2026-10-14 — 출처 c_5555555555[1](The Athletic 만료 2026-10-20T20:00:00.000Z)",
    ]);
  });
});
