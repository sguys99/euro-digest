/**
 * M1-43 첫 주간 품질 검수 표본 `scripts/lib/quality-sample.ts` 단위 테스트 (D23·D24·D47). 네트워크 없음 — 합성 브리핑·카드·경기와
 * 실제 configs(names.ko·competitions).
 *
 * - 브리핑 줄: AI 줄 먼저, 20줄 상한, 같은 시드 = 같은 표본(결정적), 결과는 발행일·줄 순
 * - 카드: 카테고리 층을 돌아가며 — 층이 모자라면 다른 층으로 채움, 같은 id는 한 번
 * - 입력 사실: football-data 종료 경기 + 원장 득점(대응표로 팀 id 연결·킥오프 5분 안), 원장 없음·득점 불완전은 그렇다고 적는다
 * - 자동 표시: 🔤 미등록 라틴 이름 · 漢 한자 · 🔗 창에 없는 경기·모르는 근거, 순위표 근거는 수동 대조
 * - 문서: 같은 키 행의 판정·메모를 옮기고 집계(정확도), 표본 밖 판정은 orphans
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
  type BriefFile,
  type LedgerMatch,
  type NewsCard,
} from "@/lib/schema";

import type { FinishedMatch } from "../scripts/lib/match-data";
import { buildNameIndex } from "../scripts/lib/names";
import {
  QUALITY_BLOCKS,
  briefLines,
  checkBriefLine,
  findLedgerMatch,
  judgement,
  matchFacts,
  renderQualityDoc,
  sampleBriefLines,
  sampleCards,
  tally,
  type CardItem,
  type QualityInput,
} from "../scripts/lib/quality-sample";
import { readBlock } from "../scripts/lib/research-doc";
import { buildTeamIdIndex } from "../scripts/lib/team-ids";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const config = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, "configs", name), "utf8"));
const COMPETITIONS = CompetitionsFileSchema.parse(config("competitions.json"));
const NAMES = buildNameIndex(
  NamesKoFileSchema.parse(config("names.ko.json")),
  COMPETITIONS,
);
const TEAMS = buildTeamIdIndex(
  TeamIdsFileSchema.parse({
    "bayern-munchen": { fd: 5, af: 157 },
    "rb-leipzig": { fd: 721, af: 173 },
  }),
);

function brief(
  date: string,
  lines: Array<[string, boolean, string[]]>,
): BriefFile {
  const ai = lines.filter(([, a]) => a).length;
  return {
    date,
    generatedAt: `${date}T00:00:00.000Z`,
    runId: `collect-prod-${date}`,
    mode: ai === lines.length ? "llm" : ai === 0 ? "template" : "mixed",
    lines: lines.map(([text, a, refs]) => ({ text, ai: a, refs })),
  };
}

describe("브리핑 줄 표본", () => {
  const files = [
    brief("2026-10-20", [
      ["바이에른 뮌헨이 라이프치히를 6-1로 꺾었다.", true, ["m565825"]],
      ["바이에른 뮌헨이 승점 14로 분데스리가 선두다.", true, ["sBL"]],
      ["템플릿 줄.", false, ["m1"]],
    ]),
    ...Array.from({ length: 5 }, (_, d) =>
      brief(`2026-10-2${d + 1}`, [
        ["가 줄.", true, ["m1"]],
        ["나 줄.", true, ["m2"]],
        ["다 줄.", true, ["m3"]],
        ["라 줄.", true, ["m4"]],
        ["마 줄.", false, ["m5"]],
      ]),
    ),
  ];
  const all = briefLines(files);

  it("키·번호 — 발행일·줄 순", () => {
    expect(all).toHaveLength(28);
    expect(all[0]).toMatchObject({ key: "B:2026-10-20#1", index: 1, ai: true });
  });

  it("AI 줄 먼저 20줄, 같은 시드는 같은 표본(결정적), 시드가 다르면 다른 표본", () => {
    const a = sampleBriefLines(all, 1);
    expect(a).toHaveLength(20);
    expect(a.every((l) => l.ai)).toBe(true); // AI 줄 22개 중 20
    expect(sampleBriefLines(all, 1)).toEqual(a);
    expect(sampleBriefLines(all, 2).map((l) => l.key)).not.toEqual(
      a.map((l) => l.key),
    );
    const keys = a.map((l) => `${l.date}#${String(l.index).padStart(2, "0")}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it("AI 줄이 모자라면 템플릿 줄로 채운다", () => {
    const few = sampleBriefLines(briefLines(files.slice(0, 1)), 1);
    expect(few.map((l) => l.ai)).toEqual([true, true, false]);
  });
});

function card(
  id: string,
  cat: NewsCard["cat"],
  over: Partial<NewsCard> = {},
): NewsCard {
  return {
    id,
    t: `제목 ${id}`,
    s: [],
    cat,
    comp: [],
    teams: [],
    players: [],
    imp: 2,
    kr: false,
    spoiler: false,
    src: [
      {
        n: "BBC Sport",
        u: `https://www.bbc.com/sport/football/articles/${id}`,
        at: "2026-10-20T00:00:00.000Z",
        tier: 1,
      },
    ],
    lang: "en",
    ai: false,
    created: "2026-10-20T00:00:00.000Z",
    ...over,
  };
}

describe("카드 표본 — 카테고리 층", () => {
  const items: CardItem[] = [
    ...Array.from({ length: 30 }, (_, i) => ({
      date: "2026-10-20",
      card: card(`c_${String(i).padStart(10, "0")}`, "other"),
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      date: "2026-10-21",
      card: card(`c_10000000${i}0`, "transfer", {
        transfer: { player: "X", status: "rumor", tier: 2 },
      }),
    })),
    {
      date: "2026-10-21",
      card: card("c_2000000000", "result", { spoiler: true }),
    },
    { date: "2026-10-22", card: card("c_2000000000", "result") }, // 같은 id는 한 번
  ];

  it("층을 돌아가며 1장씩 — 작은 층은 다 들어가고 나머지는 큰 층으로 채운다, 결정적", () => {
    const picked = sampleCards(items, 7);
    expect(picked).toHaveLength(20);
    const count = (cat: string) =>
      picked.filter((p) => p.card.cat === cat).length;
    expect(count("result")).toBe(1);
    expect(count("transfer")).toBe(3);
    expect(count("other")).toBe(16);
    expect(picked[0]!.card.cat).toBe("result");
    expect(sampleCards(items, 7)).toEqual(picked);
    expect(new Set(picked.map((p) => p.card.id)).size).toBe(20);
  });

  it("카드가 20장보다 적으면 전부", () => {
    expect(sampleCards(items.slice(30), 1)).toHaveLength(4);
  });
});

const BAYERN_LEIPZIG: FinishedMatch = {
  provider: "football-data",
  matchId: 565825,
  comp: "BUNDESLIGA",
  kickoff: "2026-10-17T13:30:00Z",
  matchday: 7,
  stage: "REGULAR_SEASON",
  home: { id: 5, name: "Bayern", fullName: "FC Bayern München" },
  away: { id: 721, name: "RB Leipzig", fullName: "RB Leipzig" },
  score: {
    ft: { home: 6, away: 1 },
    ht: null,
    regular: { home: 6, away: 1 },
    pens: null,
    duration: "REGULAR",
  },
};

function ledgerMatch(over: Partial<LedgerMatch> = {}): LedgerMatch {
  return {
    id: "af-1575190",
    leagueId: 78,
    league: "Bundesliga",
    comp: "BUNDESLIGA",
    season: 2026,
    round: "Regular Season - 7",
    kickoff: "2026-10-17T13:30:00.000Z",
    status: "FT",
    home: { id: 157, name: "Bayern München", formation: "4-2-3-1" },
    away: { id: 173, name: "RB Leipzig", formation: "4-4-2" },
    ft: { home: 6, away: 1 },
    pens: null,
    goals: [
      {
        minute: 12,
        extra: null,
        side: "home",
        kind: "normal",
        scorer: { id: 1, name: "Harry Kane" },
        assist: null,
      },
      {
        minute: 90,
        extra: 2,
        side: "away",
        kind: "penalty",
        scorer: { id: 2, name: "Lois Openda" },
        assist: null,
      },
    ],
    goalsComplete: false,
    korean: [],
    fetchedAt: "2026-10-17T21:35:00.000Z",
    ...over,
  };
}

describe("입력 사실 — football-data 경기 + 원장 득점", () => {
  it("대응표로 fd 팀 id → af 팀 id, 킥오프 5분 안이면 같은 경기", () => {
    expect(findLedgerMatch(BAYERN_LEIPZIG, [ledgerMatch()], TEAMS)?.id).toBe(
      "af-1575190",
    );
    expect(
      findLedgerMatch(
        BAYERN_LEIPZIG,
        [ledgerMatch({ kickoff: "2026-10-17T13:40:00.000Z" })],
        TEAMS,
      ),
    ).toBeNull();
    expect(
      findLedgerMatch(
        { ...BAYERN_LEIPZIG, home: { id: 999, name: "?", fullName: null } },
        [ledgerMatch()],
        TEAMS,
      ),
    ).toBeNull();
  });

  it("사실 문장 — 대회·KST 시각·팀(한글)·스코어·득점(PK·추가 시간), 득점 불완전·원장 없음은 그렇다고", () => {
    const complete = ledgerMatch({
      goalsComplete: true,
      ft: { home: 1, away: 1 },
    });
    const facts = matchFacts([BAYERN_LEIPZIG], {
      competitions: COMPETITIONS,
      ledger: [complete],
      teams: TEAMS,
      names: NAMES,
    });
    const text = facts.get(565825)!.text;
    expect(text).toMatch(
      /^분데스 10\.17 22:30 · Bayern\(바이에른 뮌헨\) 6-1 RB Leipzig\(라이프치히\)/,
    );
    expect(text).toContain("12' Harry Kane(해리 케인) (Bayern München)");
    expect(text).toContain("90+2'");
    expect(text).toContain(" PK ");
    const incomplete = matchFacts([BAYERN_LEIPZIG], {
      competitions: COMPETITIONS,
      ledger: [ledgerMatch()],
      teams: TEAMS,
      names: NAMES,
    });
    expect(incomplete.get(565825)!.text).toContain("득점 불완전");
    const noLedger = matchFacts([BAYERN_LEIPZIG], {
      competitions: COMPETITIONS,
      ledger: null,
      teams: TEAMS,
      names: null,
    });
    expect(noLedger.get(565825)!.text).toContain("원장 없음");
  });
});

describe("checkBriefLine — 자동 표시", () => {
  const facts = new Map([
    [
      "2026-10-18",
      matchFacts([BAYERN_LEIPZIG], {
        competitions: COMPETITIONS,
        ledger: null,
        teams: TEAMS,
        names: NAMES,
      }),
    ],
  ]);
  const line = (text: string, refs: string[], date = "2026-10-18") => ({
    key: `B:${date}#1`,
    date,
    index: 1,
    text,
    ai: true,
    refs,
  });

  it("refs 경기 사실·창에 없는 경기·순위표 수동·모르는 근거", () => {
    const c = checkBriefLine(
      line("바이에른 뮌헨이 라이프치히를 6-1로 완파했다.", [
        "m565825",
        "m1",
        "sBL",
        "x9",
      ]),
      facts,
      NAMES,
      COMPETITIONS,
    );
    expect(c.facts[0]).toContain("m565825: 분데스");
    expect(c.facts[1]).toBe("m1: 그 창의 종료 경기에 없음");
    expect(c.facts[2]).toContain("sBL: 분데스 순위표");
    expect(c.flags).toEqual(["🔗 m1 입력 창에 없음", "🔗 x9 모르는 근거"]);
  });

  it("🔤 미등록 라틴 이름 · 漢 한자 혼입 · 경기 데이터 없는 날은 확인 불가(표시 없음)", () => {
    const c = checkBriefLine(
      line(
        "레반테가 Zoltan Vexmire의 동점골로 出場했다.",
        ["m7"],
        "2026-10-19",
      ),
      facts,
      NAMES,
    );
    expect(c.facts).toEqual(["m7: 확인 불가(경기 데이터 없음)"]);
    expect(c.flags).toEqual(["🔤 Zoltan Vexmire", "漢 한자·가나 혼입"]);
  });
});

describe("판정 집계·문서", () => {
  it("판정 칸 해석(값 전체가 기호일 때만)과 정확도", () => {
    expect([
      judgement("✅"),
      judgement(" O "),
      judgement("❌"),
      judgement("x"),
      judgement("❌ 스코어"), // 설명은 메모 칸 — 기호 + 글은 미판정
      judgement("OK"),
      judgement("other"),
      judgement("—"),
      judgement(undefined),
    ]).toEqual([true, true, false, false, null, null, null, null, null]);
    expect(tally([true, true, false, null])).toEqual({
      judged: 3,
      correct: 2,
      wrong: 1,
      accuracy: 2 / 3,
    });
  });

  function input(
    lines: QualityInput["lines"],
    cards: CardItem[],
  ): QualityInput {
    return {
      from: "2026-10-20",
      to: "2026-10-26",
      seed: 1,
      generatedAt: "2026-10-27T01:00:00.000Z",
      lines,
      lineTotals: { all: lines.length, ai: lines.length },
      cards,
      cardTotal: cards.length,
      factsNote: "테스트",
      names: NAMES,
    };
  }

  it("다시 만들면 같은 키 행의 판정·메모를 옮기고 집계한다 — 표본 밖 판정은 orphans", () => {
    const l1 = {
      key: "B:2026-10-20#1",
      date: "2026-10-20",
      index: 1,
      text: "줄 하나.",
      ai: true,
      refs: ["m1"],
      check: { facts: ["m1: 사실"], flags: [] },
    };
    const l2 = { ...l1, key: "B:2026-10-20#2", index: 2, text: "줄 둘." };
    const c1 = {
      date: "2026-10-20",
      card: card("c_aaaaaaaaaa", "result", { teams: ["bayern-munchen"] }),
    };
    const first = renderQualityDoc(input([l1, l2], [c1]), null);
    expect(first.orphans).toEqual([]);
    expect(readBlock(first.doc, QUALITY_BLOCKS.cards)).toContain(
      "bayern-munchen(바이에른 뮌헨)",
    );

    // 사람이 판정을 적는다
    const judged = first.doc
      .replace(
        /(\| B:2026-10-20#1 \|.*)\| — \| — \| — \|$/m,
        "$1| ✅ | ✅ | — |",
      )
      .replace(
        /(\| B:2026-10-20#2 \|.*)\| — \| — \| — \|$/m,
        "$1| ❌ | ✅ | 스코어 틀림 |",
      )
      .replace(
        /(\| c_aaaaaaaaaa \|.*)\| — \| — \| — \| — \| — \|$/m,
        "$1| ✅ | ✅ | ✅ | ❌ | spoiler 빠짐 |",
      );
    const again = renderQualityDoc(input([l1, l2], [c1]), judged);
    expect(again.orphans).toEqual([]);
    const summary = readBlock(again.doc, QUALITY_BLOCKS.summary)!;
    expect(summary).toContain(
      "| 브리핑 줄 — 사실·고유명사 모두 ✅ | 2 | 1 | 1 | 50% | ≥ 90% |",
    );
    expect(summary).toContain("| 카드 — spoiler | 1 | 0 | 1 | 0% | — |");
    expect(again.doc).toContain("스코어 틀림");
    expect(again.doc).toContain("spoiler 빠짐");

    // 표본이 바뀌어 판정 행이 빠지면 orphans
    const changed = renderQualityDoc(input([l1], []), judged);
    expect(changed.orphans.sort()).toEqual(["B:2026-10-20#2", "c_aaaaaaaaaa"]);
  });
});
