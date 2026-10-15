/**
 * M1-12 — `data/cache/seen-urls.json` 기억 (PRD FR-04 "같은 URL이 두 번 카드화되지 않음", §8.4 보존 90일, 부록 A 11).
 *
 * 필수 항목: 보존 기간 경계(90일 정확히 — 남김, 넘으면 정리, 미래 시각 남김) · 기억 = seen-urls ∪ 최근·오늘 발행 파일
 * (같은 키는 이른 시각) · 날짜 간 중복 판정(다른 날 카드 → 뺌, 오늘 파일 카드 → 남김, 오늘 지워진 카드 → 뺌) ·
 * 갱신(새 키만 더함, 처음 본 시각 유지) · 파일 형식(키 정렬·스키마) · 읽기 실패 관대 처리 · 원자적 쓰기 ·
 * 최근 발행 파일 범위(D-1~D-3, 오늘·D-4 제외, 깨진 파일은 오류로).
 * runCollect 통합(쓰기 시점·dry·뉴스 실패·쓰기 실패·손상 복구)은 tests/collect-window.test.ts "seen-urls" 블록.
 * 네트워크 없음 — 파일은 임시 폴더.
 */
import {
  existsSync,
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

import { SeenUrlsFileSchema, type NewsCard, type NewsFile } from "@/lib/schema";

import {
  buildSeenIndex,
  buildSeenUrlsFile,
  cardKeys,
  filterUnseen,
  pruneSeen,
  readRecentNewsCards,
  readSeenUrls,
  sameSeen,
  SEEN_RECENT_DAYS,
  SEEN_URLS_RETENTION_DAYS,
  SEEN_URLS_RETENTION_MS,
  seenFromCards,
  seenUrlsPath,
  serializeSeenUrls,
  updateSeen,
  writeSeenUrls,
} from "../scripts/lib/seen-urls";
import { urlHash } from "../scripts/lib/url-normalize";

const DAY = 24 * 60 * 60 * 1000;
/** 이번 실행 — 06:30 KST 2026-10-16 */
const NOW = "2026-10-15T21:30:00.000Z";
const iso = (ms: number) => new Date(ms).toISOString();
const daysBefore = (n: number, extraMs = 0) =>
  iso(Date.parse(NOW) - n * DAY + extraMs);

function card(
  url: string,
  created: string,
  extra: Partial<NewsCard> = {},
): NewsCard {
  return {
    id: `c_${urlHash(url).slice(0, 10)}`,
    t: `title ${url}`,
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [{ n: "BBC Sport", u: url, at: created, tier: 2 }],
    lang: "en",
    ai: false,
    created,
    ...extra,
  };
}

const A = "https://www.bbc.co.uk/sport/football/articles/aaa?at_medium=RSS";
const B = "https://www.bbc.co.uk/sport/football/articles/bbb?at_medium=RSS";
const C = "https://www.interfootball.co.kr/news/articleView.html?idxno=1";
const KA = urlHash(A);
const KB = urlHash(B);
const KC = urlHash(C);

describe("pruneSeen — 90일 보존 (PRD §8.4)", () => {
  it("상수: 90일", () => {
    expect(SEEN_URLS_RETENTION_DAYS).toBe(90);
    expect(SEEN_URLS_RETENTION_MS).toBe(90 * DAY);
  });

  it("경계 — 정확히 90일 전은 남기고, 1ms라도 넘으면 정리, 미래 시각(시계 오류)은 남긴다", () => {
    const seen = new Map([
      ["0000000000000001", daysBefore(90)], // 경계 — 남김
      ["0000000000000002", daysBefore(90, -1)], // 90일 + 1ms — 정리
      ["0000000000000003", daysBefore(91)], // 정리
      ["0000000000000004", daysBefore(1)],
      ["0000000000000005", daysBefore(-2)], // 미래 — 남김
    ]);
    const { seen: kept, pruned } = pruneSeen(seen, NOW);
    expect(pruned).toBe(2);
    expect([...kept.keys()]).toEqual([
      "0000000000000001",
      "0000000000000004",
      "0000000000000005",
    ]);
    // 입력은 바꾸지 않는다
    expect(seen.size).toBe(5);
  });
});

describe("buildSeenIndex — 기억 = seen-urls ∪ 최근·오늘 발행 파일", () => {
  it("발행 파일 카드의 모든 출처 링크를 처음 카드가 된 시각(created)으로 채우고, 같은 키는 이른 시각", () => {
    const stored = { [KA]: daysBefore(5), [KB]: daysBefore(1) };
    const recent = [
      card(A, daysBefore(2)), // 기억(5일 전)이 더 이르다 — 유지
      card(B, daysBefore(3)), // 발행 파일(3일 전)이 더 이르다 — 바꿈
      card(C, daysBefore(1), {
        src: [
          { n: "인터풋볼", u: C, at: daysBefore(1), tier: 3 },
          {
            n: "BBC Sport",
            u: `${A}&utm_source=x`,
            at: daysBefore(1),
            tier: 2,
          },
        ],
      }),
    ];
    const index = buildSeenIndex({
      stored,
      recentCards: recent,
      todayCards: [],
      now: NOW,
    });
    expect(Object.fromEntries(index.seen)).toEqual({
      [KA]: daysBefore(5),
      [KB]: daysBefore(3),
      [KC]: daysBefore(1),
    });
    expect(index).toMatchObject({ stored: 2, pruned: 0, backfilled: 1 });
    expect(index.todayKeys.size).toBe(0);
  });

  it("첫 실행(seen-urls 없음) — 발행 파일 카드로 전부 채운다(backfilled)", () => {
    const index = buildSeenIndex({
      stored: {},
      recentCards: [card(A, daysBefore(1)), card(B, daysBefore(2))],
      todayCards: [card(C, daysBefore(0))],
      now: NOW,
    });
    expect(index.seen.size).toBe(3);
    expect(index).toMatchObject({ stored: 0, backfilled: 3 });
    expect([...index.todayKeys]).toEqual([KC]);
  });

  it("90일 지난 기억은 정리하고 셈한다", () => {
    const index = buildSeenIndex({
      stored: { [KA]: daysBefore(91), [KB]: daysBefore(10) },
      recentCards: [],
      todayCards: [],
      now: NOW,
    });
    expect([...index.seen.keys()]).toEqual([KB]);
    expect(index).toMatchObject({ stored: 2, pruned: 1, backfilled: 0 });
  });

  it("cardKeys·seenFromCards — 출처 링크의 정규화 URL 해시", () => {
    const cards = [card(A, daysBefore(1)), card(`${A}#c`, daysBefore(3))];
    expect([...cardKeys(cards)]).toEqual([KA]);
    expect(Object.fromEntries(seenFromCards(cards))).toEqual({
      [KA]: daysBefore(3),
    });
  });
});

describe("filterUnseen — 날짜 간 중복 판정", () => {
  const groups = [
    { key: KA },
    { key: KB },
    { key: KC },
    { key: "ffffffffffffffff" },
  ];

  it("다른 날 카드가 된 키는 빼고, 오늘 파일에 있는 키·처음 보는 키는 남긴다(입력 순서 유지)", () => {
    const index = buildSeenIndex({
      stored: { [KA]: daysBefore(1) },
      recentCards: [card(B, daysBefore(2))],
      todayCards: [card(C, NOW)],
      now: NOW,
    });
    const { kept, seenBefore } = filterUnseen(groups, index);
    expect(seenBefore.map((g) => g.key)).toEqual([KA, KB]);
    expect(kept.map((g) => g.key)).toEqual([KC, "ffffffffffffffff"]);
  });

  it("오늘 카드가 됐다가 오늘 파일에서 빠진 키(삭제 요청 등)는 다시 넣지 않는다", () => {
    const index = buildSeenIndex({
      stored: { [KA]: NOW },
      recentCards: [],
      todayCards: [],
      now: NOW,
    });
    expect(filterUnseen([{ key: KA }], index).seenBefore).toEqual([
      { key: KA },
    ]);
  });

  it("기억이 비면 전부 남긴다", () => {
    const index = buildSeenIndex({
      stored: {},
      recentCards: [],
      todayCards: [],
      now: NOW,
    });
    expect(filterUnseen(groups, index)).toEqual({
      kept: groups,
      seenBefore: [],
    });
  });
});

describe("updateSeen · buildSeenUrlsFile · sameSeen", () => {
  it("발행 파일 카드로 새 키만 더하고(created), 있는 키의 처음 본 시각은 그대로", () => {
    const seen = new Map([[KA, daysBefore(3)]]);
    const { seen: next, added } = updateSeen(seen, [
      card(A, NOW),
      card(B, NOW),
    ]);
    expect(added).toBe(1);
    expect(Object.fromEntries(next)).toEqual({
      [KA]: daysBefore(3),
      [KB]: NOW,
    });
    expect(seen.size).toBe(1); // 입력은 바꾸지 않는다
  });

  it("파일은 키 정렬·스키마 통과(UrlHash 키·UTC 시각), 직렬화는 2칸 들여쓰기 + 끝 개행", () => {
    const file = buildSeenUrlsFile(
      new Map([
        [KB, NOW],
        [KA, daysBefore(1)],
        [KC, daysBefore(2)],
      ]),
      NOW,
    );
    expect(Object.keys(file.urls)).toEqual([KA, KB, KC].sort());
    expect(SeenUrlsFileSchema.safeParse(file).success).toBe(true);
    expect(serializeSeenUrls(file)).toBe(`${JSON.stringify(file, null, 2)}\n`);
  });

  it("형식이 틀린 키·시각은 쓰기 전에 거부한다", () => {
    expect(() =>
      buildSeenUrlsFile(new Map([["c_0123456789", NOW]]), NOW),
    ).toThrow();
    expect(() =>
      buildSeenUrlsFile(new Map([[KA, "2026-10-16T06:30:00+09:00"]]), NOW),
    ).toThrow();
  });

  it("sameSeen — 키·순간이 같으면 같다(표기·순서 무관), 하나라도 다르면 다르다", () => {
    const stored = { [KA]: "2026-10-15T21:30:00Z", [KB]: NOW };
    expect(
      sameSeen(
        stored,
        new Map([
          [KB, NOW],
          [KA, NOW],
        ]),
      ),
    ).toBe(true);
    expect(sameSeen(stored, new Map([[KA, NOW]]))).toBe(false);
    expect(
      sameSeen(
        stored,
        new Map([
          [KA, NOW],
          [KB, daysBefore(1)],
        ]),
      ),
    ).toBe(false);
    expect(
      sameSeen(
        stored,
        new Map([
          [KA, NOW],
          [KC, NOW],
        ]),
      ),
    ).toBe(false);
  });
});

// ─── 파일 I/O ────────────────────────────────────────────────────────────

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-seen-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeNews(date: string, cards: NewsCard[]): void {
  const file: NewsFile = {
    date,
    generatedAt: NOW,
    runId: "collect-prod-20261015T213000Z-0000",
    cards,
  };
  mkdirSync(path.join(dataDir, "news"), { recursive: true });
  writeFileSync(
    path.join(dataDir, "news", `${date}.json`),
    `${JSON.stringify(file, null, 2)}\n`,
    "utf8",
  );
}

describe("readSeenUrls · writeSeenUrls", () => {
  it("파일이 없으면 빈 기억(오류 아님)", async () => {
    await expect(readSeenUrls(dataDir)).resolves.toEqual({
      urls: {},
      exists: false,
      error: null,
    });
  });

  it.each([
    ["JSON이 깨짐", "{ broken", "JSON 파싱 실패"],
    [
      "스키마 위반(10자리 키)",
      JSON.stringify({ updatedAt: NOW, urls: { c_0123456789: NOW } }),
      "스키마 검증 실패(1건)",
    ],
  ])("%s → 던지지 않고 빈 기억 + 오류", async (_label, text, error) => {
    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    writeFileSync(seenUrlsPath(dataDir), text, "utf8");
    await expect(readSeenUrls(dataDir)).resolves.toEqual({
      urls: {},
      exists: true,
      error,
    });
  });

  it("쓴 파일을 다시 읽으면 같은 기억 — data/cache/seen-urls.json, 임시 파일이 남지 않는다", async () => {
    const file = buildSeenUrlsFile(
      new Map([
        [KA, NOW],
        [KB, daysBefore(1)],
      ]),
      NOW,
    );
    const written = await writeSeenUrls(dataDir, file);
    expect(written).toBe(path.join(dataDir, "cache", "seen-urls.json"));
    expect(readdirSync(path.join(dataDir, "cache"))).toEqual([
      "seen-urls.json",
    ]);
    expect(readFileSync(written, "utf8")).toBe(serializeSeenUrls(file));
    await expect(readSeenUrls(dataDir)).resolves.toEqual({
      urls: file.urls,
      exists: true,
      error: null,
    });
  });

  it("쓰기 실패(cache가 파일) → 던지고 기존 상태를 건드리지 않는다", async () => {
    writeFileSync(path.join(dataDir, "cache"), "not a dir", "utf8");
    await expect(
      writeSeenUrls(dataDir, buildSeenUrlsFile(new Map([[KA, NOW]]), NOW)),
    ).rejects.toThrow();
    expect(readFileSync(path.join(dataDir, "cache"), "utf8")).toBe("not a dir");
  });
});

describe("readRecentNewsCards — 이전 발행 파일 D-1~D-3", () => {
  it("상수 3일 — 수집 창 상한 51시간(D36)이 닿는 이전 발행일", () => {
    expect(SEEN_RECENT_DAYS).toBe(3);
  });

  it("D-1~D-3만 읽고(오늘·D-4 제외) 없는 날은 건너뛴다", async () => {
    writeNews("2026-10-16", [card(A, NOW)]); // 오늘 — 읽지 않음(호출부가 따로 읽는다)
    writeNews("2026-10-15", [card(B, daysBefore(1))]);
    writeNews("2026-10-13", [card(C, daysBefore(3))]);
    writeNews("2026-10-12", [card(`${A}x`, daysBefore(4))]); // D-4 — 읽지 않음
    const recent = await readRecentNewsCards(dataDir, "2026-10-16");
    expect(recent.dates).toEqual(["2026-10-15", "2026-10-13"]);
    expect(recent.cards.map((c) => c.src[0]!.u)).toEqual([B, C]);
    expect(recent.errors).toEqual([]);
  });

  it("깨진 파일은 오류로 돌려주고 나머지는 읽는다(던지지 않음)", async () => {
    writeNews("2026-10-15", [card(B, daysBefore(1))]);
    mkdirSync(path.join(dataDir, "news"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "news", "2026-10-14.json"),
      "{ broken",
      "utf8",
    );
    const recent = await readRecentNewsCards(dataDir, "2026-10-16");
    expect(recent.dates).toEqual(["2026-10-15"]);
    expect(recent.errors).toEqual([
      { date: "2026-10-14", error: expect.stringContaining("JSON 파싱 실패") },
    ]);
  });

  it("뉴스 폴더가 없으면 빈 결과", async () => {
    expect(existsSync(path.join(dataDir, "news"))).toBe(false);
    await expect(readRecentNewsCards(dataDir, "2026-10-16")).resolves.toEqual({
      cards: [],
      dates: [],
      errors: [],
    });
  });
});
