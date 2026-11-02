import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { TeamView } from "@/lib/competition-view";
import type { CompId } from "@/lib/schema/common";
import { NewsCardSchema, type NewsCard } from "@/lib/schema/news";
import { TransfersFileSchema, type Transfer } from "@/lib/schema/transfer";
import {
  AUX_LOOKBACK_DAYS,
  AUX_MAX,
  auxiliaryCards,
  compareHot,
  hotTransfers,
  timelineNodes,
  transferAnchor,
  transfersView,
  type KoreanTransferPlayer,
} from "@/lib/transfers-view";

// 이적 화면 모델(M4-04 — FR-101 · FR-104 · FR-106 · PRD §4.2 7, D64 ⑤ · D67 ①⑤⑥). 입력은 합성 견본 fixtures/transfers/specimen.json
// (김민재 실카드 7장 + 가명 견본 카드 — records는 집계 함수 결과). 팀 · 리그 조회는 가짜(데이터 파일과 무관하게).

const fixture = JSON.parse(
  readFileSync(path.resolve("fixtures/transfers/specimen.json"), "utf8"),
) as {
  korean: KoreanTransferPlayer[];
  names: Record<string, string>;
  records: unknown;
  cards: unknown[];
};
const records = TransfersFileSchema.parse(fixture.records);
const cards = fixture.cards.map((c) => NewsCardSchema.parse(c));
const LEAGUE: Record<string, CompId> = {
  arsenal: "EPL",
  "tottenham-hotspur": "EPL",
  chelsea: "EPL",
  liverpool: "EPL",
  barcelona: "LALIGA",
  napoli: "SERIEA",
  juventus: "SERIEA",
  mainz: "BUNDESLIGA",
  freiburg: "BUNDESLIGA",
  "bayern-munchen": "BUNDESLIGA",
};
const team = (slug: string): TeamView => ({
  slug,
  name: slug,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: null,
  page: true,
});
const korean: KoreanTransferPlayer[] = [
  {
    slug: "kim-min-jae",
    nameKo: "김민재",
    team: "bayern-munchen",
    comp: "BUNDESLIGA",
  },
  ...fixture.korean,
];
const view = transfersView({
  records,
  cards,
  korean,
  playerName: (slug) => fixture.names[slug] ?? null,
  team,
  leagueOf: (slug) => LEAGUE[slug] ?? null,
});
const rowOf = (id: string) => view.rows.find((r) => r.id === id)!;
const byId = new Map(cards.map((c) => [c.id, c]));

describe("원장 행", () => {
  it("파일 순서 그대로(잠잠은 맨 아래 — FR-106)", () => {
    expect(view.rows.map((r) => r.id)).toEqual(records.map((r) => r.id));
    expect(view.rows.at(-1)?.quiet).toBe(true);
  });

  it("선수 이름 — 등록 한국 선수 = 설정 이름 + 소속 칸, 사전 = 표기, 없으면 null(이름 표기 전)", () => {
    const kim = rowOf("kim-min-jae:arsenal");
    expect(kim.player).toEqual({
      slug: "kim-min-jae",
      name: "김민재",
      korean: true,
      page: true,
    });
    expect(kim.affiliation?.slug).toBe("bayern-munchen");
    expect(kim.from).toBeNull(); // 출발 칸은 from이 있을 때만 — 소속으로 메우지 않는다(D64 ②)
    const b = rowOf("test-player-b:chelsea");
    expect(b.player.name).toBe("이몽룡");
    expect(b.affiliation).toBeNull();
    expect(b.from?.slug).toBe("napoli");
    expect(rowOf("test-player-c:barcelona").player.name).toBeNull();
  });

  it("행선지 미정 레코드 — to 없음 · DOM id `x-{선수}--`", () => {
    const d = rowOf("test-player-d:-");
    expect(d.to).toBeNull();
    expect(d.anchor).toBe("x-test-player-d--");
    expect(transferAnchor("a-b", "c")).not.toBe(transferAnchor("a", "b-c"));
  });

  it("필터 값 — 리그는 소속 · 출발 · 행선지 팀의 5대 리그(소문자), 팀 · 단계 · Tier · 한국 선수", () => {
    expect(rowOf("kim-min-jae:arsenal").filter).toEqual({
      league: ["epl", "bundesliga"],
      team: ["bayern-munchen", "arsenal"],
      status: ["rumor"],
      tier: ["3"],
      kr: ["1"],
    });
    expect(rowOf("test-player-b:chelsea").filter.kr).toEqual([]);
  });

  it("필터 항목 건수 — 단계 5 · 리그 5 · Tier 3은 0건도 싣고, 팀은 나온 팀만(많은 순)", () => {
    expect(view.options.status.map((o) => [o.value, o.count])).toEqual([
      ["rumor", 3],
      ["negotiating", 0],
      ["agreed", 1],
      ["official", 1],
      ["collapsed", 1],
    ]);
    expect(view.options.league.find((o) => o.value === "ligue1")?.count).toBe(
      0,
    );
    expect(view.options.tier.map((o) => o.count)).toEqual([1, 2, 3]);
    expect(view.options.kr).toBe(3);
    expect(view.options.team[0]?.count).toBeGreaterThanOrEqual(
      view.options.team.at(-1)!.count,
    );
    expect(view.known.status).toHaveLength(5);
  });
});

describe("타임라인 — 단계 근거 + 보조(D64 ⑤)", () => {
  it("김민재 — 근거 2 + 보조 4(아스널 태그만 — AC 밀란 기사는 빼고), 최신순", () => {
    const kim = rowOf("kim-min-jae:arsenal");
    expect(kim.stageCount).toBe(2);
    expect(kim.auxCount).toBe(4);
    const ids = kim.timeline.map((n) => n.card.id);
    expect(ids).not.toContain("c_d097ad3ee7"); // milan
    const at = kim.timeline.map((n) => n.card.at);
    expect([...at].sort().reverse()).toEqual(at);
    expect(kim.lead?.id).toBe("c_1501d40b10"); // 최신 단계 근거
  });

  it("상태를 바꾼 카드 = changed — 같은 단계 재보도 · 공식 뒤 결렬은 false(단계 유지)", () => {
    const kim = rowOf("kim-min-jae:arsenal").timeline.filter(
      (n) => n.kind === "stage",
    );
    expect(kim.map((n) => n.kind === "stage" && n.changed)).toEqual([
      false,
      true,
    ]);
    const b = rowOf("test-player-b:chelsea").timeline.filter(
      (n) => n.kind === "stage",
    );
    expect(b.map((n) => n.kind === "stage" && [n.status, n.changed])).toEqual([
      ["collapsed", false],
      ["official", true],
      ["agreed", true],
      ["rumor", true],
    ]);
  });

  it("빌드 입력에 없는 카드(삭제 요청)는 노드에서 빠지고, changed는 history 전체 기준", () => {
    const record = records.find(
      (r) => r.id === "test-player-a:tottenham-hotspur",
    )!;
    const without = new Map(byId);
    without.delete(record.history[0]!.card); // 첫 루머 카드가 빠짐
    const nodes = timelineNodes(record, without, []);
    expect(nodes).toHaveLength(record.history.length - 1);
    // 두 번째 협상(재보도)은 여전히 '단계 유지'
    expect(nodes.filter((n) => n.kind === "stage" && !n.changed)).toHaveLength(
      1,
    );
  });
});

describe("auxiliaryCards — 보조 노드 범위", () => {
  const base = cards.find((c) => c.id === "c_f0e40fd803")!;
  const make = (
    id: string,
    at: string,
    teams: string[],
    extra: Partial<NewsCard> = {},
  ): NewsCard => ({
    ...base,
    id,
    teams,
    src: [{ ...base.src[0]!, at }],
    ...extra,
  });
  const rec = (to?: string): Pick<Transfer, "player" | "to" | "history"> => ({
    player: "kim-min-jae",
    ...(to ? { to } : {}),
    history: [
      { at: "2026-10-17T09:35:00.000Z", status: "rumor", card: "c_aad5c2482e" },
    ],
  });

  it("행선지 레코드 = 그 행선지 팀 태그가 있는 이적 분류 · 단계 없는 · 선수 태그 카드만", () => {
    const list = [
      make("c_0000000001", "2026-10-20T00:00:00.000Z", ["arsenal"]),
      make("c_0000000002", "2026-10-20T00:00:00.000Z", ["milan"]),
      make("c_0000000003", "2026-10-20T00:00:00.000Z", ["arsenal"], {
        cat: "result",
      }),
      make("c_0000000004", "2026-10-20T00:00:00.000Z", ["arsenal"], {
        players: ["lee-kang-in"],
      }),
      make("c_0000000005", "2026-10-20T00:00:00.000Z", ["arsenal"], {
        transfer: {
          player: "kim-min-jae",
          to: "arsenal",
          status: "rumor",
          tier: 3,
        },
      }),
    ];
    expect(auxiliaryCards(rec("arsenal"), list).map((c) => c.id)).toEqual([
      "c_0000000001",
    ]);
  });

  it("행선지 미정 레코드 = 팀 태그가 소속 · 출발 팀뿐(또는 없음)일 때만", () => {
    const list = [
      make("c_0000000001", "2026-10-20T00:00:00.000Z", []),
      make("c_0000000002", "2026-10-21T00:00:00.000Z", ["bayern-munchen"]),
      make("c_0000000003", "2026-10-22T00:00:00.000Z", [
        "bayern-munchen",
        "arsenal",
      ]),
    ];
    expect(
      auxiliaryCards(rec(), list, ["bayern-munchen"]).map((c) => c.id),
    ).toEqual(["c_0000000002", "c_0000000001"]);
  });

  it(`첫 근거보다 ${AUX_LOOKBACK_DAYS}일 넘게 앞선 카드는 빼고, 최신 ${AUX_MAX}장까지`, () => {
    const old = make("c_00000000ff", "2026-09-16T09:34:00.000Z", ["arsenal"]);
    const edge = make("c_00000000fe", "2026-09-17T09:35:00.000Z", ["arsenal"]);
    expect(
      auxiliaryCards(rec("arsenal"), [old, edge]).map((c) => c.id),
    ).toEqual(["c_00000000fe"]);
    const many = Array.from({ length: AUX_MAX + 3 }, (_, i) =>
      make(
        `c_00000001${String(i).padStart(2, "0")}`,
        `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
        ["arsenal"],
      ),
    );
    const got = auxiliaryCards(rec("arsenal"), many);
    expect(got).toHaveLength(AUX_MAX);
    expect(got[0]!.src[0]!.at > got.at(-1)!.src[0]!.at).toBe(true);
  });
});

describe("hotTransfers — 홈 핫 리스트 순위", () => {
  it("잠잠 제외 · KST 갱신 날짜 늦은 순 → 단계 무게 → Tier → 시각 → id, 최대 5", () => {
    const hot = hotTransfers(view.rows);
    expect(hot).toHaveLength(5);
    expect(hot.map((h) => h.id)).not.toContain("test-player-e:juventus");
    expect(hot.map((h) => h.id)).toEqual([
      "test-player-b:chelsea", // 11-01 KST
      "test-player-d:-", // 10-30 KST(10-29T23:10Z)
      "test-player-a:tottenham-hotspur", // 10-29 KST · 합의
      "kim-min-jae:arsenal", // 10-29 KST · 루머
      "test-player-c:barcelona",
    ]);
    expect(hot[0]!.lead.id).toBe(rowOf("test-player-b:chelsea").lead!.id);
  });

  it("같은 KST 날짜면 단계 무게 → Tier", () => {
    const r = (
      id: string,
      status: Transfer["status"],
      bestTier: 1 | 2 | 3,
      updated: string,
    ) => ({
      id,
      status,
      bestTier,
      updated,
    });
    const day = "2026-10-29T";
    const list = [
      r("a", "rumor", 1, `${day}10:00:00.000Z`),
      r("b", "agreed", 3, `${day}01:00:00.000Z`),
      r("c", "agreed", 2, `${day}00:30:00.000Z`),
      r("d", "rumor", 1, "2026-10-29T16:00:00.000Z"), // KST 10-30 — 가장 위
    ].sort(compareHot);
    expect(list.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("최대 개수 · 근거 카드가 없는 레코드는 뺀다", () => {
    expect(hotTransfers(view.rows, 2)).toHaveLength(2);
    expect(hotTransfers(view.rows.map((r) => ({ ...r, lead: null })))).toEqual(
      [],
    );
  });
});
