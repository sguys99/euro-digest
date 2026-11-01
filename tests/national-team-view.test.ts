/**
 * M3-13 — 대표팀 화면 모델(src/lib/national-team-view.ts, PRD FR-70~73): 경기 기준 일정 행(홈 팀 먼저 · 홈-원정 스코어 · 한국 기준 결과) ·
 * 상태(결과 대기 · 연기 · 시각 미정) · 최신 소집 명단 · 근거 링크 묶음 · 대표팀 소식(한국) 선택. 실제 설정 값도 한 번 본다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadNationalTeamConfig } from "@/lib/data/national-team";
import {
  KOREA_NAME,
  isKoreaNationalCard,
  isNationalCard,
  koreaNationalNews,
  koreaResult,
  latestSquad,
  nationalMatchRow,
  nationalMatchRows,
  nationalSourceLinks,
  nationalSquadView,
  squadLabel,
} from "@/lib/national-team-view";
import type { NationalMatch, Squad } from "@/lib/schema/configs";
import { NewsFileSchema, type NewsCard } from "@/lib/schema/news";

const match = (over: Partial<NationalMatch> = {}): NationalMatch => ({
  id: "2026-11-13-saudi-arabia",
  kickoff: "2026-11-13T14:30:00.000Z",
  kickoffTbd: false,
  opponent: "사우디아라비아",
  home: false,
  venue: "도하 (카타르)",
  competition: "친선경기",
  status: "scheduled",
  result: null,
  sourceUrl: "https://example.com/a",
  ...over,
});
const NOW = Date.parse("2026-11-12T03:00:00Z");

describe("nationalMatchRow — 경기 기준(홈 팀 먼저)", () => {
  it("한국 원정 예정 경기: 상대가 홈 · KST 날짜 · 요일 · 킥오프", () => {
    expect(nationalMatchRow(match(), NOW)).toMatchObject({
      date: "11.13",
      weekday: "금",
      time: "23:30",
      home: "사우디아라비아",
      away: KOREA_NAME,
      koreaHome: false,
      state: "scheduled",
      score: null,
      result: null,
      venue: "도하 (카타르)",
    });
  });

  it("결과: 스코어는 홈-원정 순, 결과 칩은 한국 기준", () => {
    const home = nationalMatchRow(
      match({ home: true, status: "finished", result: { kor: 1, opp: 4 } }),
      NOW,
    );
    expect(home).toMatchObject({
      home: KOREA_NAME,
      score: { h: 1, a: 4 },
      result: "L",
    });
    const away = nationalMatchRow(
      match({ status: "finished", result: { kor: 2, opp: 1 } }),
      NOW,
    );
    expect(away).toMatchObject({ score: { h: 1, a: 2 }, result: "W" });
    expect(koreaResult({ kor: 0, opp: 0 })).toBe("D");
  });

  it("킥오프가 지났는데 scheduled면 결과 대기 · 연기 · 시각 미정 · 경기장 없음", () => {
    expect(
      nationalMatchRow(match(), Date.parse("2026-11-13T14:30:00Z")).state,
    ).toBe("pending");
    expect(nationalMatchRow(match({ status: "postponed" }), NOW).state).toBe(
      "postponed",
    );
    const tbd = nationalMatchRow(
      match({ kickoffTbd: true, venue: undefined }),
      NOW,
    );
    expect(tbd.time).toBeNull();
    expect(tbd.venue).toBeNull();
  });

  it("nationalMatchRows — 킥오프 순(같으면 입력 순)", () => {
    const rows = nationalMatchRows(
      [
        match({ id: "b", kickoff: "2026-11-17T14:00:00.000Z" }),
        match({ id: "a" }),
        match({ id: "c", kickoff: "2026-11-17T14:00:00.000Z" }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("소집 명단", () => {
  const squad = (over: Partial<Squad> = {}): Squad => ({
    id: "2026-11",
    announcedAt: "2026-10-29T04:58:00.000Z",
    matchIds: ["2026-11-13-saudi-arabia"],
    playerSlugs: ["kim-min-jae", "unknown"],
    sourceUrl: "https://example.com/squad",
    ...over,
  });

  it("latestSquad — 발표 시각이 가장 늦은 명단, 없으면 null", () => {
    const a = squad({ id: "2026-09", announcedAt: "2026-09-15T00:00:00Z" });
    const b = squad();
    expect(latestSquad({ squads: [b, a] })).toBe(b);
    expect(latestSquad({ squads: [] })).toBeNull();
  });

  it("squadLabel — 'YYYY-MM'이면 'N월 소집', 아니면 발표일", () => {
    expect(squadLabel(squad())).toBe("11월 소집");
    expect(squadLabel(squad({ id: "extra" }))).toBe("10.29 발표 소집");
  });

  it("nationalSquadView — 명단 경기만 · 등록되지 않은 slug는 뺀다", () => {
    const view = nationalSquadView(
      {
        squads: [squad()],
        matches: [
          match(),
          match({ id: "other", kickoff: "2026-12-01T00:00:00Z" }),
        ],
      },
      (slug) =>
        slug === "kim-min-jae"
          ? { slug, nameKo: "김민재", position: "DF", team: "t" }
          : null,
      NOW,
    );
    expect(view?.label).toBe("11월 소집");
    expect(view?.matches.map((m) => m.id)).toEqual(["2026-11-13-saudi-arabia"]);
    expect(view?.players.map((p) => p.slug)).toEqual(["kim-min-jae"]);
  });
});

describe("nationalSourceLinks — 근거 링크(같은 URL은 한 번)", () => {
  it("경기 라벨 '{M.DD} {상대}전', 소집 명단과 같은 URL은 'N월 소집 발표'", () => {
    const rows = nationalMatchRows(
      [
        match({
          id: "x",
          kickoff: "2026-09-24T11:00:00.000Z",
          home: true,
          opponent: "에콰도르",
          sourceUrl: "https://example.com/x",
        }),
        match({ sourceUrl: "https://example.com/squad" }),
        match({
          id: "y",
          kickoff: "2026-11-17T14:00:00.000Z",
          opponent: "카타르",
          sourceUrl: "https://example.com/squad",
        }),
        match({ id: "z", sourceUrl: undefined }),
      ],
      NOW,
    );
    expect(
      nationalSourceLinks(rows, {
        id: "2026-11",
        announcedAt: "2026-10-29T04:58:00.000Z",
        sourceUrl: "https://example.com/squad",
      }),
    ).toEqual([
      { url: "https://example.com/x", label: "09.24 에콰도르전" },
      { url: "https://example.com/squad", label: "11월 소집 발표" },
    ]);
    expect(
      nationalSourceLinks(
        rows.filter((r) => r.sourceUrl === "https://example.com/squad"),
        null,
      ),
    ).toEqual([
      {
        url: "https://example.com/squad",
        label: "11.13 사우디아라비아전 · 11.17 카타르전",
      },
    ]);
  });

  it("실제 설정 — 9·10월 4경기 각자 · 11월 2경기와 명단은 한 링크", () => {
    const config = loadNationalTeamConfig()!;
    const rows = nationalMatchRows(config.matches, NOW);
    const links = nationalSourceLinks(rows, latestSquad(config));
    expect(links).toHaveLength(5);
    expect(links.at(-1)!.label).toBe("11월 소집 발표");
  });
});

describe("대표팀 소식 — cat national", () => {
  const base = NewsFileSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve("fixtures/schema/data/news/2026-10-10.json"),
        "utf8",
      ),
    ),
  );
  const card0 = base.cards[0]!;
  const card = (id: string, at: string, over: Partial<NewsCard> = {}) =>
    ({
      ...card0,
      id,
      cat: "national",
      kr: true,
      src: [{ ...card0.src[0]!, at }],
      ...over,
    }) as NewsCard;

  it("판정 — 한국은 national + kr, 주요국은 national 전체", () => {
    expect(isKoreaNationalCard({ cat: "national", kr: true })).toBe(true);
    expect(isKoreaNationalCard({ cat: "national", kr: false })).toBe(false);
    expect(isKoreaNationalCard({ cat: "transfer", kr: true })).toBe(false);
    expect(isNationalCard({ cat: "national" })).toBe(true);
    expect(isNationalCard({ cat: "result" })).toBe(false);
  });

  it("koreaNationalNews — 기간 안 · 같은 ID 한 번(최신 호) · 대표 출처 시각 최신순 · limit + 전체 건수", () => {
    const issues = [
      {
        date: "2026-10-30",
        cards: [
          card("c_aaaaaaaaaa", "2026-10-29T10:00:00Z"),
          card("c_bbbbbbbbbb", "2026-10-30T10:00:00Z"),
          card("c_cccccccccc", "2026-10-30T11:00:00Z", { kr: false }),
        ],
      },
      {
        date: "2026-10-31",
        cards: [card("c_aaaaaaaaaa", "2026-10-29T10:00:00Z")],
      },
      {
        date: "2026-09-01",
        cards: [card("c_dddddddddd", "2026-09-01T10:00:00Z")],
      },
    ];
    const all = koreaNationalNews(issues, "2026-10-02");
    expect(all.total).toBe(2);
    expect(all.items.map((i) => [i.card.id, i.date])).toEqual([
      ["c_bbbbbbbbbb", "2026-10-30"],
      ["c_aaaaaaaaaa", "2026-10-31"],
    ]);
    const one = koreaNationalNews(issues, "2026-10-02", 1);
    expect(one).toMatchObject({ total: 2 });
    expect(one.items).toHaveLength(1);
  });
});
