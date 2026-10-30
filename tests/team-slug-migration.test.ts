/**
 * M2-04 — 팀 slug 일회성 이전(scripts/lib/team-slug-migration.ts, PRD §15 D63 ③): 팀 slug 자리만 바꾸고 카드 ID·다른 필드는
 * 그대로, 두 번 돌려도 같다. 이전 뒤 저장소 상태(data/news·configs·fixtures 뉴스 샘플)에 옛 slug가 남지 않았는지도 본다.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NamesKoFileSchema,
  NewsFileSchema,
  TeamIdsFileSchema,
} from "@/lib/schema";

import {
  TEAM_SLUG_RENAMES_M2_04,
  findOldSlugs,
  migrateKoreanPlayersJson,
  migrateNamesKoJson,
  migrateNewsJson,
  migrateNewsMetaJson,
  serializeJson,
} from "../scripts/lib/team-slug-migration";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const readJson = (rel: string): unknown => JSON.parse(readText(rel));
const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));

const NEWS = {
  date: "2026-10-20",
  generatedAt: "2026-10-19T21:40:00.000Z",
  runId: "r",
  cards: [
    {
      id: "c_0123456789",
      t: "Napoli beat Paris FC — 'paris' stays in titles",
      s: [],
      cat: "transfer",
      comp: ["SERIEA"],
      teams: ["ssc-napoli", "arsenal", "paris"],
      players: ["hojlund"],
      imp: 3,
      kr: false,
      spoiler: false,
      transfer: {
        player: "x",
        from: "internazionale-milano",
        to: "arsenal",
        status: "rumor",
        tier: 2,
      },
      src: [
        {
          n: "BBC",
          u: "https://www.bbc.co.uk/sport/football/1",
          at: "2026-10-19T20:00:00.000Z",
          tier: 1,
        },
      ],
      lang: "en",
      ai: false,
      created: "2026-10-19T21:40:00.000Z",
    },
  ],
};

describe("TEAM_SLUG_RENAMES_M2_04 — 옛 → 새 slug 표", () => {
  it("63건 · 새 slug는 모두 team-ids.json에 있고 옛 slug는 없다 · 사슬(새 slug가 다시 옛 slug)·중복 대상 없음", () => {
    const entries = Object.entries(TEAM_SLUG_RENAMES_M2_04);
    expect(entries).toHaveLength(63);
    for (const [old, next] of entries) {
      expect(Object.hasOwn(TEAM_IDS, next), next).toBe(true);
      expect(Object.hasOwn(TEAM_IDS, old), old).toBe(false);
      expect(Object.hasOwn(TEAM_SLUG_RENAMES_M2_04, next), next).toBe(false);
    }
    const targets = entries.map(([, next]) => next);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("migrateNewsJson — 카드의 팀 slug 자리만", () => {
  it("teams·transfer.from·to만 바꾸고 카드 ID·제목·다른 필드는 그대로, 입력은 건드리지 않는다", () => {
    const before = structuredClone(NEWS);
    const { json, changed } = migrateNewsJson(NEWS);
    expect(NEWS).toEqual(before);
    expect(changed).toBe(3);
    const card = (json as typeof NEWS).cards[0]!;
    expect(card.teams).toEqual(["napoli", "arsenal", "paris-fc"]);
    expect(card.transfer).toMatchObject({ from: "inter", to: "arsenal" });
    expect({ ...card, teams: [], transfer: null }).toEqual({
      ...NEWS.cards[0],
      teams: [],
      transfer: null,
    });
    expect(NewsFileSchema.safeParse(json).success).toBe(true);
  });

  it("두 번 돌려도 같다 · 형식이 다른 입력은 그대로", () => {
    const once = migrateNewsJson(NEWS).json;
    const twice = migrateNewsJson(once);
    expect(twice.changed).toBe(0);
    expect(twice.json).toEqual(once);
    expect(migrateNewsJson(null)).toEqual({ json: null, changed: 0 });
    expect(migrateNewsJson({ cards: "x" }).changed).toBe(0);
  });

  it("직렬화는 news-file.ts와 같다(2칸 + 끝 줄바꿈) — 바뀌지 않은 파일은 바이트가 같다", () => {
    const text = readText("data/news/2026-10-12.json");
    expect(serializeJson(migrateNewsJson(JSON.parse(text)).json)).toBe(text);
  });
});

describe("다른 대상 — 뉴스 샘플 메타·표기 사전·한국 선수", () => {
  it("meta labels.teams 키(순서 유지)", () => {
    const { json, changed } = migrateNewsMetaJson({
      labels: {
        teams: { arsenal: { ko: "아스널" }, "as-roma": { ko: "로마" } },
      },
    });
    expect(changed).toBe(1);
    expect(
      Object.keys((json as { labels: { teams: object } }).labels.teams),
    ).toEqual(["arsenal", "roma"]);
  });

  it("names.ko는 kind team 항목만, korean-players는 team만", () => {
    const names = migrateNamesKoJson({
      entries: [
        { kind: "team", slug: "mainz-05", ko: "마인츠", en: ["Mainz"] },
        { kind: "player", slug: "paris", ko: "x", en: ["x"] },
      ],
    });
    expect(names.changed).toBe(1);
    expect(
      (names.json as { entries: Array<{ slug: string }> }).entries.map(
        (e) => e.slug,
      ),
    ).toEqual(["mainz", "paris"]);
    const players = migrateKoreanPlayersJson([
      { slug: "lee-jae-sung", team: "mainz-05" },
      { slug: "son", team: "lafc" },
    ]);
    expect(players.changed).toBe(1);
    expect(players.json).toEqual([
      { slug: "lee-jae-sung", team: "mainz" },
      { slug: "son", team: "lafc" },
    ]);
  });
});

describe("이전 뒤 저장소 상태", () => {
  const newsFiles = readdirSync(path.join(ROOT, "data/news"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => `data/news/${f}`);

  it("data/news·configs·뉴스 샘플에 따옴표로 둘러싼 옛 slug가 없다", () => {
    const files = [
      ...newsFiles,
      "configs/names.ko.json",
      "configs/korean-players.json",
      "configs/team-ids.json",
      "fixtures/news-sample.json",
      "fixtures/news-sample.meta.json",
    ];
    for (const rel of files)
      expect(findOldSlugs(readText(rel)), rel).toEqual([]);
  });

  it("발행 카드의 팀 태그는 모두 사전(names.ko) 팀 slug다", () => {
    const names = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
    const teamSlugs = new Set(
      names.entries.flatMap((e) =>
        e.kind === "team" && e.slug !== undefined ? [e.slug] : [],
      ),
    );
    for (const rel of newsFiles) {
      const file = NewsFileSchema.parse(readJson(rel));
      for (const card of file.cards) {
        for (const slug of card.teams) {
          expect(teamSlugs.has(slug), `${rel} ${card.id} ${slug}`).toBe(true);
        }
      }
    }
  });
});
