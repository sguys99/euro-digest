// scripts/lib/retention-merge-stage.ts — 수집 실행의 월별 병합 단계 (M5-10, PRD FR-158·§8.4) — 임시 폴더, 네트워크 없음
//
// 병합 전후 대조: 같은 입력을 두 폴더에 두고 한쪽만 병합한 뒤, 뉴스 로더(src/lib/data/news.ts)의 날짜 목록·호(deep-equal)·최신 호·
// 보존 카드가 같은지 본다. 저장소 실데이터(data/news 전 호)로도 같은 대조를 한다. 날짜 페이지 HTML 대조는 tests/news-retention-build.test.tsx.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listNewsDates,
  loadLatestNews,
  loadNewsIssue,
  loadRetainedCards,
} from "@/lib/data/news";
import {
  NewsFileSchema,
  NewsMonthFileSchema,
  type NewsCard,
} from "@/lib/schema";

import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { readAllNewsIssues } from "../scripts/lib/news-month-file";
import {
  retentionMergeSummary,
  runRetentionMergeStage,
  type RetentionMergeDeps,
} from "../scripts/lib/retention-merge-stage";

const REAL_NEWS = path.resolve("data/news");
const TAKEDOWNS = path.resolve("configs/takedowns.json");
const NOW = new Date("2027-01-28T21:31:00.000Z");
/** 2027-01-29 06:30 KST — 2026-10의 첫 병합일 */
const FIRST_MERGE = "2027-01-28T21:30:00.000Z";
/** 2027-01-28 23:00 KST — 하루 전 */
const DAY_BEFORE = "2027-01-28T14:00:00.000Z";

let root: string;
const dirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
beforeEach(() => {
  root = tmp("euro-digest-merge-");
});
afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

const newsDir = (dataDir: string) => path.join(dataDir, "news");

function card(i: number): NewsCard {
  return {
    id: `c_${i.toString(16).padStart(10, "0")}`,
    t: `title ${i}`,
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [
      {
        n: "BBC Sport",
        u: `https://www.bbc.co.uk/sport/football/articles/${i}`,
        at: "2026-10-11T18:00:00.000Z",
        tier: 1,
      },
    ],
    lang: "en",
    ai: false,
    created: "2026-10-11T21:30:00.000Z",
  };
}

function writeDaily(dataDir: string, date: string, cards: NewsCard[]) {
  const file = path.join(newsDir(dataDir), `${date}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      NewsFileSchema.parse({
        date,
        generatedAt: `${date}T00:00:00.000Z`,
        runId: `prod-collect-${date}`,
        cards,
      }),
      null,
      2,
    )}\n`,
  );
}

function makeDeps(dataDir: string, over: Partial<RetentionMergeDeps> = {}) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const deps: RetentionMergeDeps = {
    dataDir,
    env: "dev",
    dry: false,
    now: () => NOW,
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

const names = (dataDir: string) => readdirSync(newsDir(dataDir)).sort();

/** 두 폴더의 로더 결과가 같다(날짜 목록 · 날짜마다 호 · 최신 호 · 보존 카드) */
function expectSameIssues(before: string, after: string) {
  const opts = { takedownsFile: TAKEDOWNS };
  const dates = listNewsDates(before);
  expect(dates.length).toBeGreaterThan(0);
  expect(listNewsDates(after)).toEqual(dates);
  for (const date of dates) {
    expect(loadNewsIssue(date, after, opts)).toEqual(
      loadNewsIssue(date, before, opts),
    );
  }
  expect(loadLatestNews(after, opts)).toEqual(loadLatestNews(before, opts));
  expect(loadRetainedCards(after, opts)).toEqual(
    loadRetainedCards(before, opts),
  );
}

describe("runRetentionMergeStage — 말일 + 90일 지난 달을 한 번에 합친다", () => {
  function seed(dataDir: string) {
    writeDaily(dataDir, "2026-10-12", [card(1), card(2)]);
    writeDaily(dataDir, "2026-10-13", [card(1)]); // 같은 카드 ID가 다음 날 호에도(M1-16)
    writeDaily(dataDir, "2026-10-31", [card(3)]);
    writeDaily(dataDir, "2026-11-01", [card(4)]);
  }

  it("2027-01-29 06:30 KST 실행: 2026-10 일별 3개 → 2026-10.json, 11월은 그대로 — 로더 결과는 병합 전과 같다", async () => {
    const before = tmp("euro-digest-merge-before-");
    seed(before);
    seed(root);
    const { deps, records } = makeDeps(root);

    const outcome = await runRetentionMergeStage(deps, {
      startedAt: FIRST_MERGE,
    });

    expect(outcome.errors).toEqual([]);
    expect(outcome.today).toBe("2027-01-29");
    expect(outcome.merged).toEqual([
      {
        month: "2026-10",
        dates: ["2026-10-12", "2026-10-13", "2026-10-31"],
      },
    ]);
    expect(outcome.nextMergeDate).toBe("2027-02-28");
    expect(names(root)).toEqual(["2026-10.json", "2026-11-01.json"]);
    const month = NewsMonthFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(newsDir(root), "2026-10.json"), "utf8"),
      ),
    );
    expect(month.updatedAt).toBe(NOW.toISOString());
    // 호는 일별 파일 내용 그대로
    for (const issue of month.issues) {
      const original = NewsFileSchema.parse(
        JSON.parse(
          readFileSync(
            path.join(newsDir(before), `${issue.date}.json`),
            "utf8",
          ),
        ),
      );
      expect(issue).toEqual(original);
    }
    expectSameIssues(newsDir(before), newsDir(root));
    // scripts 쪽 읽기(이적 집계 등)도 같은 호를 낸다
    expect(await readAllNewsIssues(root)).toEqual(
      (await readAllNewsIssues(before)).map((i) => ({
        ...i,
        origin: i.date < "2026-11-01" ? "month" : "daily",
      })),
    );
    expect(retentionMergeSummary(outcome)).toBe("done:months1/files3");
    const done = records.find((r) => r.event === "collect.retention.done");
    expect(done).toMatchObject({ mergedMonths: 1, mergedFiles: 3, errors: 0 });

    // 다시 돌리면 할 일이 없다(멱등)
    const again = await runRetentionMergeStage(makeDeps(root).deps, {
      startedAt: FIRST_MERGE,
    });
    expect(again.merged).toEqual([]);
    expect(names(root)).toEqual(["2026-10.json", "2026-11-01.json"]);
  });

  it("하루 전(2027-01-28 KST)에는 아무것도 하지 않는다", async () => {
    seed(root);
    const outcome = await runRetentionMergeStage(makeDeps(root).deps, {
      startedAt: DAY_BEFORE,
    });
    expect(outcome.merged).toEqual([]);
    expect(outcome.due).toEqual([]);
    expect(outcome.nextMergeDate).toBe("2027-01-29");
    expect(names(root)).toEqual([
      "2026-10-12.json",
      "2026-10-13.json",
      "2026-10-31.json",
      "2026-11-01.json",
    ]);
  });

  it("dry: 계획만 출력하고 쓰지 않는다", async () => {
    seed(root);
    const { deps, printed } = makeDeps(root, { dry: true });
    const outcome = await runRetentionMergeStage(deps, {
      startedAt: FIRST_MERGE,
    });
    expect(outcome.state).toBe("dry");
    expect(outcome.merged.map((m) => m.month)).toEqual(["2026-10"]);
    expect(printed).toEqual([
      "── [dry] data/news 월별 병합 — 1달 · 일별 3개 — 쓰지 않음",
      "   2026-10.json ← 3개(2026-10-12 ~ 2026-10-31)",
    ]);
    expect(names(root)).toHaveLength(4);
  });

  it("이미 월별 파일이 있는 달의 일별 호는 더하고, 같은 날짜가 양쪽에 있으면 그 달만 건너뛴다(오류)", async () => {
    seed(root);
    // 2026-09: 월별 파일에 09-29, 일별 파일에 09-30 → 더한다
    writeDaily(root, "2026-09-30", [card(9)]);
    writeFileSync(
      path.join(newsDir(root), "2026-09.json"),
      JSON.stringify({
        month: "2026-09",
        updatedAt: "2026-12-30T21:31:00.000Z",
        issues: [
          {
            date: "2026-09-29",
            generatedAt: "2026-09-29T00:00:00.000Z",
            runId: "r",
            cards: [card(8)],
          },
        ],
      }),
    );
    // 2026-10: 월별 파일에 10-12가 이미 있음 → 충돌
    const conflictMonth = JSON.stringify({
      month: "2026-10",
      updatedAt: "2027-01-01T00:00:00.000Z",
      issues: [
        {
          date: "2026-10-12",
          generatedAt: "2026-10-12T00:00:00.000Z",
          runId: "r",
          cards: [card(1)],
        },
      ],
    });
    writeFileSync(path.join(newsDir(root), "2026-10.json"), conflictMonth);

    const outcome = await runRetentionMergeStage(makeDeps(root).deps, {
      startedAt: FIRST_MERGE,
    });

    expect(outcome.merged).toEqual([
      { month: "2026-09", dates: ["2026-09-30"] },
    ]);
    expect(outcome.errors.map((e) => `${e.step}:${e.month}`)).toEqual([
      "conflict:2026-10",
    ]);
    expect(readFileSync(path.join(newsDir(root), "2026-10.json"), "utf8")).toBe(
      conflictMonth,
    );
    expect(names(root)).toContain("2026-10-12.json");
    expect(names(root)).not.toContain("2026-09-30.json");
  });

  it("깨진 일별 파일이 있는 달은 건너뛰고(그 달 파일 그대로) 다른 달은 합친다 — 던지지 않는다", async () => {
    seed(root);
    writeFileSync(path.join(newsDir(root), "2026-10-20.json"), "{ broken");
    const { deps } = makeDeps(root);
    const outcome = await runRetentionMergeStage(deps, {
      startedAt: "2027-02-27T21:30:00.000Z", // 2027-02-28 KST — 10월·11월 모두 때가 됨
    });
    expect(outcome.errors.map((e) => `${e.step}:${e.month}`)).toEqual([
      "read:2026-10",
    ]);
    expect(outcome.merged.map((m) => m.month)).toEqual(["2026-11"]);
    expect(names(root)).toEqual([
      "2026-10-12.json",
      "2026-10-13.json",
      "2026-10-20.json",
      "2026-10-31.json",
      "2026-11.json",
    ]);
  });

  it("일별 파일을 지우다 실패하면 되돌린다(지운 일별 파일 복원 · 새 월별 파일 삭제) — 같은 날짜가 양쪽에 남지 않는다", async () => {
    seed(root);
    const originals = Object.fromEntries(
      names(root).map((n) => [
        n,
        readFileSync(path.join(newsDir(root), n), "utf8"),
      ]),
    );
    let calls = 0;
    const { deps, records } = makeDeps(root, {
      removeFile: async (file) => {
        calls += 1;
        if (calls === 2) throw new Error("EPERM");
        rmSync(file);
      },
    });
    const outcome = await runRetentionMergeStage(deps, {
      startedAt: FIRST_MERGE,
    });
    expect(outcome.merged).toEqual([]);
    expect(outcome.errors.map((e) => `${e.step}:${e.date}`)).toEqual([
      "remove:2026-10-13",
    ]);
    expect(names(root)).toEqual(Object.keys(originals).sort());
    for (const [n, text] of Object.entries(originals)) {
      expect(readFileSync(path.join(newsDir(root), n), "utf8")).toBe(text);
    }
    expect(records.some((r) => r.event === "collect.retention.rollback")).toBe(
      true,
    );
  });

  it("폴더가 없으면 할 일 없음", async () => {
    const outcome = await runRetentionMergeStage(
      makeDeps(path.join(root, "nope")).deps,
      { startedAt: FIRST_MERGE },
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.merged).toEqual([]);
    expect(outcome.nextMergeDate).toBeNull();
  });
});

describe("저장소 실데이터 data/news (M5-10)", () => {
  it("오늘(2026-11-03 06:30 KST) dry 실행: 병합 대상 0, 다음 병합 2026-10 → 2027-01-29, 파일을 바꾸지 않는다", async () => {
    const copy = tmp("euro-digest-merge-real-");
    cpSync(REAL_NEWS, newsDir(copy), { recursive: true });
    const before = names(copy);
    const { deps, printed } = makeDeps(copy, { dry: true });
    const outcome = await runRetentionMergeStage(deps, {
      startedAt: "2026-11-02T21:30:00.000Z",
    });
    expect(outcome.due).toEqual([]);
    expect(outcome.merged).toEqual([]);
    expect(outcome.nextMergeDate).toBe("2027-01-29");
    expect(printed[0]).toMatch(
      /^── \[dry\] data\/news 월별 병합 — 대상 없음\(일별 \d+개 · 다음 병합 2026-10 → 2027-01-29\)$/,
    );
    expect(names(copy)).toEqual(before);
  });

  it("전 호를 합친 뒤(먼 미래 기준 — 모든 달이 대상)에도 로더의 날짜 목록·호·최신 호·보존 카드가 병합 전과 같다(삭제 요청 제외 포함)", async () => {
    const merged = tmp("euro-digest-merge-real-all-");
    cpSync(REAL_NEWS, newsDir(merged), { recursive: true });
    const outcome = await runRetentionMergeStage(makeDeps(merged).deps, {
      startedAt: "2099-12-31T21:30:00.000Z",
    });
    expect(outcome.errors).toEqual([]);
    expect(outcome.merged.length).toBeGreaterThan(0);
    // 일별 파일이 하나도 남지 않는다
    expect(
      names(merged).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)),
    ).toEqual([]);
    expectSameIssues(REAL_NEWS, newsDir(merged));
  });
});
