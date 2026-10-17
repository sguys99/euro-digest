// scripts/lib/purge-plan.ts — 삭제 요청·소스별 보존 기간 삭제 계획 (M1-25, FR-143·D32·D45)
import { describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  type CardSource,
  type NewsCard,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import {
  isEmptyPurge,
  isSourceExpired,
  mergeSeenKeys,
  planPurge,
  publisherRetentionConflicts,
  RETENTION_PURGE_LEAD_MS,
  retentionByPublisher,
  sourceExpiryMs,
} from "../scripts/lib/purge-plan";
import { urlHash } from "../scripts/lib/url-normalize";

const DAY_MS = 24 * 60 * 60 * 1000;

function src(
  n: string,
  u: string,
  at: string,
  tier: 1 | 2 | 3 = 1,
): CardSource {
  return { n, u, at, tier };
}

function card(
  id: string,
  sources: CardSource[],
  created = "2026-10-10T21:30:00.000Z",
): NewsCard {
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

function file(
  date: string,
  cards: NewsCard[],
): { date: string; file: NewsFile } {
  return {
    date,
    file: NewsFileSchema.parse({
      date,
      generatedAt: "2026-10-10T21:31:00.000Z",
      runId: `prod-collect-${date}`,
      cards,
    }),
  };
}

const ATHLETIC = "The Athletic";
const BBC = "BBC Sport";
const RETENTION = new Map([[ATHLETIC, 7]]);

/** 아무 규칙에도 걸리지 않는 계획 입력 */
const base = {
  takedownIds: new Set<string>(),
  retention: new Map<string, number>(),
  now: "2026-10-20T21:30:00.000Z",
};

function sourceConfig(
  id: string,
  name: string,
  retentionDays?: number,
): Pick<Source, "id" | "name" | "retentionDays"> {
  return retentionDays === undefined
    ? { id, name }
    : { id, name, retentionDays };
}

describe("retentionByPublisher — 매체명으로 보존 기간 찾기 (M1-02 이월)", () => {
  it("보존 기간을 둔 소스의 매체명(publisherNameOf — 섹션·괄호 설명 제외)만 담는다", () => {
    const table = retentionByPublisher([
      sourceConfig("the-athletic-football", "The Athletic — Football", 7),
      sourceConfig("bbc-sport-football", "BBC Sport — Football"),
    ]);
    expect([...table]).toEqual([[ATHLETIC, 7]]);
  });

  it("같은 매체명이 여럿이면 가장 짧은 값(보수적) — 활성 여부와 무관", () => {
    const table = retentionByPublisher([
      sourceConfig("athletic-a", "The Athletic — Football", 7),
      sourceConfig("athletic-b", "The Athletic (Transfers)", 3),
    ]);
    expect(table.get(ATHLETIC)).toBe(3);
  });

  it("저장소 configs/sources.json은 The Athletic 7일", async () => {
    const { loadSources } = await import("../scripts/lib/sources");
    const sources = await loadSources(process.cwd());
    expect([...retentionByPublisher(sources)]).toEqual([[ATHLETIC, 7]]);
    expect(publisherRetentionConflicts(sources)).toEqual([]);
  });
});

describe("publisherRetentionConflicts — 같은 매체명 = 같은 보존 기간", () => {
  it("값이 다르면(없음 포함) 그 매체명 묶음을 돌려준다", () => {
    const conflicts = publisherRetentionConflicts([
      sourceConfig("bbc-a", "BBC Sport — Football"),
      sourceConfig("athletic-a", "The Athletic — Football", 7),
      sourceConfig("bbc-b", "BBC Sport — Premier League"),
      sourceConfig("athletic-b", "The Athletic — Transfers"),
    ]);
    expect(conflicts).toEqual([
      {
        publisher: ATHLETIC,
        sources: [
          { index: 1, id: "athletic-a", retentionDays: 7 },
          { index: 3, id: "athletic-b", retentionDays: null },
        ],
      },
    ]);
  });

  it("같은 값끼리는 충돌 아님", () => {
    expect(
      publisherRetentionConflicts([
        sourceConfig("a", "X — 1", 7),
        sourceConfig("b", "X — 2", 7),
        sourceConfig("c", "Y — 1"),
        sourceConfig("d", "Y — 2"),
      ]),
    ).toEqual([]);
  });
});

describe("보존 만료 판정 — 기준 = min(src.at, card.created), 정확히 7일부터 만료", () => {
  const created = "2026-10-11T06:30:00.000Z";
  const at = "2026-10-10T20:00:00.000Z"; // 기사 시각이 더 이르다 → 기준

  it("기사 시각이 이르면 그 시각 + 7일이 만료", () => {
    const expiry = sourceExpiryMs({ created }, { n: ATHLETIC, at }, RETENTION);
    expect(expiry).toEqual({
      basisMs: Date.parse(at),
      expiresAtMs: Date.parse(at) + 7 * DAY_MS,
      days: 7,
    });
  });

  it("카드 생성이 이르면(같은 날 재실행으로 붙은 출처의 기사 시각이 늦은 경우) 생성 시각이 기준", () => {
    const late = "2026-10-12T01:00:00.000Z";
    const expiry = sourceExpiryMs(
      { created },
      { n: ATHLETIC, at: late },
      RETENTION,
    );
    expect(expiry?.basisMs).toBe(Date.parse(created));
  });

  it("경계: 7일 − 1ms는 유지, 정확히 7일은 만료", () => {
    const expiresAt = Date.parse(at) + 7 * DAY_MS;
    expect(
      isSourceExpired(
        { created },
        { n: ATHLETIC, at },
        RETENTION,
        expiresAt - 1,
      ),
    ).toBe(false);
    expect(
      isSourceExpired({ created }, { n: ATHLETIC, at }, RETENTION, expiresAt),
    ).toBe(true);
  });

  it("보존 기간이 없는 매체는 만료되지 않는다", () => {
    expect(sourceExpiryMs({ created }, { n: BBC, at }, RETENTION)).toBeNull();
    expect(
      isSourceExpired(
        { created },
        { n: BBC, at },
        RETENTION,
        Date.parse(at) + 999 * DAY_MS,
      ),
    ).toBe(false);
  });
});

describe("planPurge — 삭제 요청 (FR-143, M1-16 이월)", () => {
  const dup = card("c_fb2dd57b4a", [
    src(
      BBC,
      "https://www.bbc.co.uk/news/articles/c8x23ekvp3ywo?at_medium=RSS&at_campaign=rss",
      "2026-10-11T18:00:00.000Z",
    ),
  ]);
  const other = card("c_0ece511965", [
    src(
      BBC,
      "https://www.bbc.co.uk/sport/football/articles/cqpvg4ez0dpno",
      "2026-10-11T17:00:00.000Z",
    ),
  ]);

  it("저장된 card.id가 같은 카드를 모든 날짜 파일에서 지운다(ID는 날짜를 넘어 유일하지 않음)", () => {
    const plan = planPurge({
      ...base,
      files: [
        file("2026-10-13", [dup]),
        file("2026-10-12", [dup, other]),
        file("2026-10-14", [other]),
      ],
      takedownIds: new Set(["c_fb2dd57b4a"]),
    });
    expect(plan.files.map((f) => f.date)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(plan.files[0]?.cards.map((c) => c.id)).toEqual(["c_0ece511965"]);
    expect(plan.files[1]?.cards).toEqual([]);
    expect(plan.files.flatMap((f) => f.removedCards)).toEqual([
      { id: "c_fb2dd57b4a", reason: "takedown", sources: 1 },
      { id: "c_fb2dd57b4a", reason: "takedown", sources: 1 },
    ]);
    expect(plan.counts).toEqual({
      takedownCards: 2,
      retentionCards: 0,
      retentionSources: 0,
    });
    expect(plan.takedownsFound).toEqual(["c_fb2dd57b4a"]);
  });

  it("옛 규칙 ID(대표 URL에서 다시 계산한 값과 다름)도 저장된 ID로 찾는다 — URL에서 cardIdFor로 계산하지 않는다", async () => {
    const { cardIdFor } = await import("../scripts/lib/card-id");
    const oldRule = card("c_0123456789", [
      src(
        BBC,
        "https://www.bbc.co.uk/sport/football/articles/old?at_medium=RSS",
        "2026-10-11T18:00:00.000Z",
      ),
    ]);
    expect(cardIdFor(oldRule.src[0]!.u)).not.toBe(oldRule.id);
    const byStored = planPurge({
      ...base,
      files: [file("2026-10-12", [oldRule])],
      takedownIds: new Set([oldRule.id]),
    });
    expect(byStored.counts.takedownCards).toBe(1);
    const byRecomputed = planPurge({
      ...base,
      files: [file("2026-10-12", [oldRule])],
      takedownIds: new Set([cardIdFor(oldRule.src[0]!.u)]),
    });
    expect(isEmptyPurge(byRecomputed)).toBe(true);
  });

  it("지운 카드의 모든 출처 링크 해시를 기억 후보로 남긴다(처음 카드가 된 시각 = 같은 키 중 이른 created)", () => {
    const multi = card(
      "c_aaaaaaaaaa",
      [
        src(BBC, "https://www.bbc.co.uk/a", "2026-10-11T18:00:00.000Z"),
        src("Relevo", "https://www.relevo.com/b", "2026-10-11T18:30:00.000Z"),
      ],
      "2026-10-11T21:30:00.000Z",
    );
    const earlier = { ...multi, created: "2026-10-10T21:30:00.000Z" };
    const plan = planPurge({
      ...base,
      files: [file("2026-10-12", [multi]), file("2026-10-11", [earlier])],
      takedownIds: new Set(["c_aaaaaaaaaa"]),
    });
    expect(plan.seenKeys).toEqual(
      new Map([
        [urlHash("https://www.bbc.co.uk/a"), "2026-10-10T21:30:00.000Z"],
        [urlHash("https://www.relevo.com/b"), "2026-10-10T21:30:00.000Z"],
      ]),
    );
  });

  it("등록 ID가 data에 없으면 계획이 비고, 입력 파일을 바꾸지 않는다", () => {
    const input = file("2026-10-12", [dup, other]);
    const before = JSON.stringify(input);
    const plan = planPurge({
      ...base,
      files: [input],
      takedownIds: new Set(["c_9999999999"]),
    });
    expect(isEmptyPurge(plan)).toBe(true);
    expect(plan.seenKeys.size).toBe(0);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("planPurge — 소스별 보존 기간 (D32·D45 ②)", () => {
  const created = "2026-10-11T21:30:00.000Z";
  const athleticAt = "2026-10-11T20:00:00.000Z";
  const expiresAt = new Date(Date.parse(athleticAt) + 7 * DAY_MS).toISOString();

  const leadAthletic = card(
    "c_1111111111",
    [
      src(ATHLETIC, "https://www.nytimes.com/athletic/1/", athleticAt),
      src(BBC, "https://www.bbc.co.uk/sport/1", "2026-10-11T19:00:00.000Z"),
    ],
    created,
  );
  const tailAthletic = card(
    "c_2222222222",
    [
      src(BBC, "https://www.bbc.co.uk/sport/2", "2026-10-11T19:00:00.000Z"),
      src(ATHLETIC, "https://www.nytimes.com/athletic/2/", athleticAt, 2),
      src("Relevo", "https://www.relevo.com/2", "2026-10-11T19:30:00.000Z", 2),
    ],
    created,
  );
  const plain = card(
    "c_3333333333",
    [src(BBC, "https://www.bbc.co.uk/sport/3", "2026-10-01T00:00:00.000Z")],
    "2026-10-01T00:00:00.000Z",
  );

  const plan = (now: string) =>
    planPurge({
      ...base,
      files: [file("2026-10-12", [leadAthletic, tailAthletic, plain])],
      retention: RETENTION,
      now,
    });

  it("만료 1ms 전에는 아무것도 지우지 않는다", () => {
    expect(
      isEmptyPurge(plan(new Date(Date.parse(expiresAt) - 1).toISOString())),
    ).toBe(true);
  });

  it("정확히 7일: 대표 출처가 만료된 카드는 삭제, 아닌 카드는 그 출처만 뺀다(순서 유지), 다른 매체는 오래돼도 그대로", () => {
    const result = plan(expiresAt);
    const [change] = result.files;
    expect(change?.removedCards).toEqual([
      {
        id: "c_1111111111",
        reason: "retention",
        publisher: ATHLETIC,
        expiresAt,
        sources: 2,
      },
    ]);
    expect(change?.removedSources).toEqual([
      { cardId: "c_2222222222", index: 1, publisher: ATHLETIC, expiresAt },
    ]);
    expect(change?.cards.map((c) => c.id)).toEqual([
      "c_2222222222",
      "c_3333333333",
    ]);
    expect(change?.cards[0]?.src.map((s) => s.n)).toEqual([BBC, "Relevo"]);
    // 출처를 뺀 카드의 다른 필드는 그대로(분류는 다시 계산하지 않음)
    expect({ ...change?.cards[0], src: [] }).toEqual({
      ...tailAthletic,
      src: [],
    });
    expect(change?.cards[1]).toEqual(plain);
    expect(result.counts).toEqual({
      takedownCards: 0,
      retentionCards: 1,
      retentionSources: 1,
    });
    // 기억 후보: 지운 카드의 모든 출처 + 뺀 출처
    expect([...result.seenKeys.keys()].sort()).toEqual(
      [
        urlHash("https://www.nytimes.com/athletic/1/"),
        urlHash("https://www.bbc.co.uk/sport/1"),
        urlHash("https://www.nytimes.com/athletic/2/"),
      ].sort(),
    );
  });

  it("삭제 요청이 보존 기간보다 먼저 — 같은 카드는 takedown 사유로 한 번만", () => {
    const result = planPurge({
      ...base,
      files: [file("2026-10-12", [leadAthletic])],
      retention: RETENTION,
      takedownIds: new Set(["c_1111111111"]),
      now: expiresAt,
    });
    expect(result.files[0]?.removedCards.map((c) => c.reason)).toEqual([
      "takedown",
    ]);
    expect(result.counts.retentionCards).toBe(0);
  });

  it("Athletic 혼자인 카드는 카드 삭제", () => {
    const solo = card(
      "c_4444444444",
      [src(ATHLETIC, "https://www.nytimes.com/athletic/4/", athleticAt)],
      created,
    );
    const result = planPurge({
      ...base,
      files: [file("2026-10-12", [solo])],
      retention: RETENTION,
      now: expiresAt,
    });
    expect(result.files[0]?.cards).toEqual([]);
    expect(result.counts.retentionCards).toBe(1);
  });
});

describe("보존 기간 미리 삭제 — 수집 실행 여유 30시간(실제 보관이 7일을 넘지 않게)", () => {
  const HOUR_MS = 60 * 60 * 1000;
  /** KST 벽시계 → UTC ISO (KST = UTC+9, 서머타임 없음) */
  const kst = (local: string) =>
    new Date(Date.parse(`${local}:00+09:00`)).toISOString();
  const athletic = (at: string, created: string) =>
    card(
      "c_7777777777",
      [src(ATHLETIC, "https://www.nytimes.com/athletic/7/", at)],
      created,
    );
  const removedAt = (c: NewsCard, runAt: string, leadMs?: number) =>
    planPurge({
      ...base,
      files: [file("2026-10-12", [c])],
      retention: RETENTION,
      now: runAt,
      ...(leadMs !== undefined ? { leadMs } : {}),
    }).counts.retentionCards === 1;

  it("여유는 30시간 = 정기 간격 24시간 + 계절 전환 40분 + 백업 10분 + schedule 지연·실행 시간 여유", () => {
    expect(RETENTION_PURGE_LEAD_MS).toBe(30 * HOUR_MS);
  });

  it("경계: 만료 30시간 전 실행은 지우고, 30시간 + 1ms 전 실행은 남긴다(기본 여유 0은 정확한 만료)", () => {
    const c = athletic(kst("2026-10-12T06:00"), kst("2026-10-12T06:30"));
    const expiresAt = Date.parse(kst("2026-10-19T06:00"));
    const at = (ms: number) => new Date(ms).toISOString();
    expect(
      removedAt(
        c,
        at(expiresAt - RETENTION_PURGE_LEAD_MS),
        RETENTION_PURGE_LEAD_MS,
      ),
    ).toBe(true);
    expect(
      removedAt(
        c,
        at(expiresAt - RETENTION_PURGE_LEAD_MS - 1),
        RETENTION_PURGE_LEAD_MS,
      ),
    ).toBe(false);
    expect(removedAt(c, at(expiresAt - 1))).toBe(false);
    expect(removedAt(c, at(expiresAt))).toBe(true);
  });

  it("저녁 18:00 KST 수동 실행 카드(기사 17:30) — 7일째 아침 06:30 정기 실행이 지운다(보관 6일 12시간 30분), 여유 없으면 8일째까지 남는다", () => {
    const created = kst("2026-10-12T18:00");
    const c = athletic(kst("2026-10-12T17:30"), created);
    // 만료 10-19 17:30 KST
    expect(removedAt(c, kst("2026-10-18T06:30"), RETENTION_PURGE_LEAD_MS)).toBe(
      false,
    ); // 35시간 전
    const run = kst("2026-10-19T06:30"); // 11시간 전
    expect(removedAt(c, run, RETENTION_PURGE_LEAD_MS)).toBe(true);
    expect(removedAt(c, run)).toBe(false); // 여유가 없으면 다음 날(10-20 06:30)까지 — 7일 12시간 30분
    expect(Date.parse(run) - Date.parse(created)).toBeLessThan(7 * DAY_MS);
  });

  it("06:40 백업 실행 카드(기사 시각 = 생성 06:40) — 만료 24시간 10분 전 06:30 실행이 지운다, 여유 없으면 만료 10분 전 실행도 놓쳐 8일", () => {
    const created = kst("2026-10-12T06:40");
    const c = athletic(created, created);
    // 만료 10-19 06:40 KST
    const run = kst("2026-10-18T06:30");
    expect(removedAt(c, run, RETENTION_PURGE_LEAD_MS)).toBe(true);
    expect(Date.parse(run) - Date.parse(created)).toBeLessThan(7 * DAY_MS);
    expect(removedAt(c, kst("2026-10-19T06:30"))).toBe(false); // 여유 0: 만료 10분 전이라 남김 → 10-20
  });

  it("계절 전환(10-25 여름 06:30 → 10-26 겨울 07:10, D26): 다음 실행까지 24시간 40분 — 24시간 여유로는 넘는다", () => {
    // 만료 10-26 07:00 KST — 여름 마지막 정기 실행(10-25 06:30)과 겨울 첫 정기 실행(10-26 07:10) 사이
    const c = athletic(kst("2026-10-19T07:00"), kst("2026-10-19T07:10"));
    const summerRun = kst("2026-10-25T06:30");
    expect(removedAt(c, summerRun, 24 * HOUR_MS)).toBe(false); // 24시간 여유라면 07:10 실행까지 남아 7일 초과
    expect(removedAt(c, summerRun, RETENTION_PURGE_LEAD_MS)).toBe(true);
  });
});

describe("mergeSeenKeys — 없는 키만 더한다", () => {
  it("있는 키는 시각도 그대로, 새 키 수를 센다", () => {
    const { seen, added } = mergeSeenKeys(
      { aaaaaaaaaaaaaaaa: "2026-10-12T00:00:00.000Z" },
      new Map([
        ["aaaaaaaaaaaaaaaa", "2026-10-01T00:00:00.000Z"],
        ["bbbbbbbbbbbbbbbb", "2026-10-02T00:00:00.000Z"],
      ]),
    );
    expect(added).toBe(1);
    expect(seen).toEqual(
      new Map([
        ["aaaaaaaaaaaaaaaa", "2026-10-12T00:00:00.000Z"],
        ["bbbbbbbbbbbbbbbb", "2026-10-02T00:00:00.000Z"],
      ]),
    );
  });
});
