/**
 * M4-01 이적 트래커 집계(scripts/lib/transfers.ts) — 순수 함수. 네트워크·실호출 없음.
 * 역행 금지 · collapsed 예외(공식 뒤 결렬 무시 · 결렬 뒤 재개는 최고 단계 초과만) · 행선지 분리 · 행선지 미정 · 삭제 요청 제외 ·
 * Tier 최고값 · from · quiet(30일) · 정렬 · 결정성 · 빈 입력 · 중복 카드.
 */
import { describe, expect, it } from "vitest";

import {
  TransfersFileSchema,
  type CardTransfer,
  type NewsCard,
  type TransferStatus,
} from "@/lib/schema";

import {
  applyTransferStatus,
  buildTransfers,
  initialTransferState,
  reduceTransferStatus,
  serializeTransfersFile,
  transferIdOf,
  transferRecordProblems,
  type TransferNewsInput,
} from "../scripts/lib/transfers";

const NOW = "2026-11-02T00:00:00.000Z";
let seq = 0;

/** 이적 카드 — at = 대표 출처 시각 */
function card(
  transfer: CardTransfer | undefined,
  at: string,
  id?: string,
): NewsCard {
  seq += 1;
  return {
    id: id ?? `c_${seq.toString(16).padStart(10, "0")}`,
    t: "제목",
    s: [],
    cat: "transfer",
    comp: [],
    teams: [],
    players: transfer ? [transfer.player] : [],
    imp: 3,
    kr: false,
    spoiler: false,
    ...(transfer ? { transfer } : {}),
    src: [{ n: "매체", u: "https://example.com/x", at, tier: 2 }],
    lang: "en",
    ai: false,
    created: at,
  };
}

const t = (
  status: TransferStatus,
  over: Partial<CardTransfer> = {},
): CardTransfer => ({
  player: "saka",
  to: "real-madrid",
  status,
  tier: 2,
  ...over,
});

const day = (d: number) =>
  `2026-10-${String(d).padStart(2, "0")}T12:00:00.000Z`;

function build(
  cards: NewsCard[],
  opts: { takedown?: string[]; now?: string; news?: TransferNewsInput[] } = {},
) {
  return buildTransfers({
    news: opts.news ?? [{ date: "2026-10-20", cards }],
    takedownIds: new Set(opts.takedown ?? []),
    now: opts.now ?? NOW,
  });
}

describe("상태 머신 (FR-102)", () => {
  it("진행 단계는 올라가기만 한다 — 낮은 단계 카드는 상태를 바꾸지 않는다(역행 금지)", () => {
    expect(
      reduceTransferStatus(["rumor", "agreed", "negotiating", "rumor"]),
    ).toBe("agreed");
    expect(reduceTransferStatus(["official", "rumor", "agreed"])).toBe(
      "official",
    );
    expect(reduceTransferStatus(["negotiating", "official"])).toBe("official");
  });

  it("결렬은 진행 중인 이적을 닫는다 — rumor·negotiating·agreed에서 collapsed", () => {
    for (const s of ["rumor", "negotiating", "agreed"] as const) {
      expect(reduceTransferStatus([s, "collapsed"])).toBe("collapsed");
    }
  });

  it("공식 발표 뒤 결렬은 적용하지 않는다(진행 중이 아님 — D52 ②)", () => {
    expect(reduceTransferStatus(["official", "collapsed"])).toBe("official");
  });

  it("결렬 뒤에는 결렬 전 최고 단계보다 높은 단계만 다시 연다", () => {
    expect(reduceTransferStatus(["negotiating", "collapsed", "rumor"])).toBe(
      "collapsed",
    );
    expect(
      reduceTransferStatus(["negotiating", "collapsed", "negotiating"]),
    ).toBe("collapsed");
    expect(reduceTransferStatus(["negotiating", "collapsed", "agreed"])).toBe(
      "agreed",
    );
    // 다시 열린 뒤에도 같은 규칙
    expect(
      reduceTransferStatus(["rumor", "collapsed", "agreed", "collapsed"]),
    ).toBe("collapsed");
    // 결렬로 시작하면 어떤 진행 단계든 연다(peak -1)
    expect(reduceTransferStatus(["collapsed", "rumor"])).toBe("rumor");
    expect(reduceTransferStatus(["collapsed", "collapsed"])).toBe("collapsed");
  });

  it("바뀌지 않으면 같은 상태 객체 · 빈 목록은 null", () => {
    const s = initialTransferState("agreed");
    expect(applyTransferStatus(s, "rumor")).toBe(s);
    expect(reduceTransferStatus([])).toBeNull();
  });
});

describe("buildTransfers — 레코드", () => {
  it("빈 입력 → 빈 목록, transfer 없는 카드는 근거가 아니다(보조 노드는 transfers.json 밖)", () => {
    expect(build([]).transfers).toEqual([]);
    expect(
      buildTransfers({ news: [], takedownIds: new Set(), now: NOW }).transfers,
    ).toEqual([]);
    expect(build([card(undefined, day(1))]).transfers).toEqual([]);
  });

  it("역행 카드도 history에 그 카드의 단계 그대로 남고, 상태는 최고 단계 · updated = 가장 늦은 근거", () => {
    const a = card(t("rumor"), day(1));
    const b = card(t("agreed"), day(3));
    const c = card(t("rumor"), day(5));
    const [rec] = build([c, a, b]).transfers;
    expect(rec).toMatchObject({
      id: "saka:real-madrid",
      player: "saka",
      to: "real-madrid",
      status: "agreed",
      updated: day(5),
    });
    expect(rec!.history).toEqual([
      { at: day(1), status: "rumor", card: a.id },
      { at: day(3), status: "agreed", card: b.id },
      { at: day(5), status: "rumor", card: c.id },
    ]);
    expect(rec).not.toHaveProperty("from");
  });

  it("행선지별로 따로 진행한다 — 한 행선지의 결렬이 다른 행선지를 닫지 않는다", () => {
    const out = build([
      card(t("negotiating", { to: "arsenal" }), day(1)),
      card(t("collapsed", { to: "arsenal" }), day(2)),
      card(t("rumor", { to: "chelsea" }), day(3)),
    ]).transfers;
    expect(out.map((r) => [r.id, r.status])).toEqual([
      ["saka:chelsea", "rumor"],
      ["saka:arsenal", "collapsed"],
    ]);
  });

  it("행선지 없는 카드는 '행선지 미정' 레코드(선수:-)로 — 다른 행선지에 붙이지 않는다", () => {
    const out = build([
      card(t("agreed", { to: "arsenal" }), day(1)),
      card(t("collapsed", { to: undefined, from: "bayern" }), day(2)),
    ]);
    const byId = new Map(out.transfers.map((r) => [r.id, r]));
    expect(byId.get("saka:arsenal")?.status).toBe("agreed");
    const unknown = byId.get("saka:-");
    expect(unknown).toMatchObject({
      player: "saka",
      from: "bayern",
      status: "collapsed",
    });
    expect(unknown).not.toHaveProperty("to");
    expect(out.stats.unknownDestination).toBe(1);
  });

  it("같은 시각이면 진행 단계 먼저, 결렬 나중(결렬이 이긴다)", () => {
    const at = day(4);
    const [rec] = build([
      card(t("collapsed"), at, "c_0000000001"),
      card(t("negotiating"), at, "c_0000000002"),
    ]).transfers;
    expect(rec!.status).toBe("collapsed");
    expect(rec!.history.map((h) => h.status)).toEqual([
      "negotiating",
      "collapsed",
    ]);
  });

  it("삭제 요청 카드는 근거에서 뺀다 — 근거가 모두 빠지면 레코드도 없다", () => {
    const a = card(t("rumor"), day(1));
    const b = card(t("official"), day(2));
    const out = build([a, b], { takedown: [b.id] });
    expect(out.transfers[0]!.status).toBe("rumor");
    expect(out.transfers[0]!.history.map((h) => h.card)).toEqual([a.id]);
    expect(out.stats.takedown).toBe(1);
    expect(build([b], { takedown: [b.id] }).transfers).toEqual([]);
  });

  it("bestTier = 근거 카드 중 가장 높은 Tier(숫자가 작은 쪽)", () => {
    const [rec] = build([
      card(t("rumor", { tier: 3 }), day(1)),
      card(t("negotiating", { tier: 1 }), day(2)),
      card(t("rumor", { tier: 2 }), day(3)),
    ]).transfers;
    expect(rec!.bestTier).toBe(1);
  });

  it("from = 출발 팀이 있는 가장 늦은 근거 카드의 값", () => {
    const [rec] = build([
      card(t("rumor", { from: "arsenal" }), day(1)),
      card(t("rumor", { from: "bayern" }), day(2)),
      card(t("rumor"), day(3)),
    ]).transfers;
    expect(rec!.from).toBe("bayern");
  });

  it("quiet(FR-106) = rumor + 30일 이상 근거 없음 — 그 밖의 단계는 잠잠하지 않다", () => {
    const old = "2026-10-03T00:00:00.000Z"; // NOW − 30일
    expect(build([card(t("rumor"), old)]).transfers[0]!.quiet).toBe(true);
    expect(
      build([card(t("rumor"), "2026-10-03T00:00:00.001Z")]).transfers[0]!.quiet,
    ).toBe(false);
    expect(build([card(t("negotiating"), old)]).transfers[0]!.quiet).toBe(
      false,
    );
  });

  it("같은 카드 id가 여러 날짜 파일에 있으면 앞 날짜의 것 하나만", () => {
    const first = card(t("rumor"), day(1), "c_00000000aa");
    const again = { ...first, transfer: t("official") };
    const out = build([], {
      news: [
        { date: "2026-10-02", cards: [again] },
        { date: "2026-10-01", cards: [first] },
      ],
    });
    expect(out.transfers[0]!.status).toBe("rumor");
    expect(out.transfers[0]!.history).toHaveLength(1);
    expect(out.stats.duplicates).toBe(1);
  });
});

describe("buildTransfers — 정렬·결정성·스키마", () => {
  const cards = [
    card(
      t("rumor", { player: "kane", to: "barcelona" }),
      "2026-09-01T00:00:00.000Z",
    ), // 잠잠
    card(t("rumor", { player: "saka", to: "arsenal" }), day(10)),
    card(t("agreed", { player: "yamal", to: "chelsea" }), day(10)),
    card(t("official", { player: "musiala", to: "real-madrid" }), day(20)),
  ];

  it("잠잠하지 않은 것 먼저 → updated 내림차순 → id", () => {
    expect(build(cards).transfers.map((r) => r.id)).toEqual([
      "musiala:real-madrid",
      "saka:arsenal",
      "yamal:chelsea",
      "kane:barcelona",
    ]);
  });

  it("입력 순서·파일 나눔과 상관없이 같은 출력(결정적) · 스키마 통과 · 레코드 자기 검사 문제 없음", () => {
    const a = build(cards);
    const b = build([], {
      news: [
        { date: "2026-10-21", cards: [cards[3]!, cards[1]!] },
        { date: "2026-10-20", cards: [cards[2]!, cards[0]!] },
      ],
    });
    expect(serializeTransfersFile(b.transfers)).toBe(
      serializeTransfersFile(a.transfers),
    );
    expect(TransfersFileSchema.safeParse(a.transfers).success).toBe(true);
    for (const r of a.transfers) expect(transferRecordProblems(r)).toEqual([]);
    expect(a.stats.byStatus).toEqual({
      rumor: 2,
      negotiating: 0,
      agreed: 1,
      official: 1,
      collapsed: 0,
    });
  });
});

describe("transferIdOf · transferRecordProblems", () => {
  it("id = 선수:행선지, 행선지 없으면 선수:-", () => {
    expect(transferIdOf("kim-min-jae", "arsenal")).toBe("kim-min-jae:arsenal");
    expect(transferIdOf("kim-min-jae", undefined)).toBe("kim-min-jae:-");
  });

  it("id·status·updated·history 순서가 규칙과 어긋나면 문제로 알린다", () => {
    const [rec] = build([
      card(t("rumor"), day(1)),
      card(t("agreed"), day(2)),
    ]).transfers;
    expect(
      transferRecordProblems({
        ...rec!,
        id: "saka:arsenal",
        status: "official",
        updated: day(9),
        history: [...rec!.history].reverse(),
      }),
    ).toEqual([
      'id가 "saka:real-madrid"(선수:행선지)와 다름',
      "status official ≠ history 적용 결과 agreed",
      `updated ${day(9)} ≠ 가장 늦은 근거 시각 ${day(2)}`,
      "history가 시각 순이 아님",
    ]);
  });
});
