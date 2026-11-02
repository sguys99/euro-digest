/**
 * M4-09 — 첫 방문 온보딩 순수 규칙(src/lib/onboarding.ts) · 첫 페인트 전 판정(src/lib/onboarding-boot.ts) · 자료 만들기(src/lib/onboarding-data.ts)
 * (PRD FR-113 · §15 D64 ⑥ · D67 ②, DESIGN §9.3 D2 "온보딩")
 */
import { describe, expect, it } from "vitest";

import { EMPTY_FOLLOWS, parseFollows } from "@/lib/follow";
import type { MyDirectory } from "@/lib/my-view";
import {
  ONBOARDING_ENTRY_ID,
  ONBOARDING_STORAGE_KEY,
  parseOnboardingMark,
  shouldOfferOnboarding,
} from "@/lib/onboarding";
import {
  leaguesForTeams,
  nextStep,
  onboardingSummary,
  parseOnboardingData,
  prevStep,
  stepAnnouncement,
  stepTone,
  TEAMS_SHOWN,
  toggleLeague,
  visibleTeams,
  type OnboardingData,
  type OnboardingLeague,
} from "@/lib/onboarding-steps";
import { ONBOARDING_BOOT_SCRIPT } from "@/lib/onboarding-boot";
import { buildOnboardingData } from "@/lib/onboarding-data";
import type { CompId } from "@/lib/schema/common";

describe("표시 조건 — 팔로우 0 + 기록 없음", () => {
  it("기록 값은 done · skipped만 인정", () => {
    expect(parseOnboardingMark("done")).toBe("done");
    expect(parseOnboardingMark("skipped")).toBe("skipped");
    expect(parseOnboardingMark(null)).toBeNull();
    expect(parseOnboardingMark("")).toBeNull();
    expect(parseOnboardingMark("yes")).toBeNull();
  });

  it("첫 방문(팔로우 0 · 기록 없음)만 보인다", () => {
    expect(shouldOfferOnboarding(EMPTY_FOLLOWS, null)).toBe(true);
    expect(
      shouldOfferOnboarding({ teams: ["arsenal"], players: [] }, null),
    ).toBe(false);
    expect(
      shouldOfferOnboarding({ teams: [], players: ["kim-min-jae"] }, null),
    ).toBe(false);
  });

  it("건너뛰거나 마친 사람은 팔로우가 다시 0이어도 보이지 않는다", () => {
    expect(shouldOfferOnboarding(EMPTY_FOLLOWS, "skipped")).toBe(false);
    expect(shouldOfferOnboarding(EMPTY_FOLLOWS, "done")).toBe(false);
  });
});

describe("첫 페인트 전 판정(ONBOARDING_BOOT_SCRIPT) ≡ shouldOfferOnboarding(parseFollows, parseOnboardingMark)", () => {
  function run(
    store: Record<string, string>,
    throws = false,
  ): { found: boolean; hidden: boolean } {
    const el = { hidden: true };
    const doc = {
      getElementById: (id: string) => (id === ONBOARDING_ENTRY_ID ? el : null),
    };
    const storage = {
      getItem: (k: string) => {
        if (throws) throw new Error("blocked");
        return Object.prototype.hasOwnProperty.call(store, k)
          ? store[k]!
          : null;
      },
    };
    new Function("window", "document", ONBOARDING_BOOT_SCRIPT)(
      { localStorage: storage },
      doc,
    );
    return { found: true, hidden: el.hidden };
  }
  const expected = (store: Record<string, string>) =>
    !shouldOfferOnboarding(
      parseFollows(store["ed-follow"] ?? null),
      parseOnboardingMark(store[ONBOARDING_STORAGE_KEY] ?? null),
    );

  it.each<Record<string, string>>([
    {},
    { "ed-follow": "not json" },
    { "ed-follow": JSON.stringify({ v: 1, teams: [], players: [] }) },
    { "ed-follow": JSON.stringify({ v: 1, teams: ["arsenal"], players: [] }) },
    {
      "ed-follow": JSON.stringify({
        v: 1,
        teams: [],
        players: ["kim-min-jae"],
      }),
    },
    { "ed-follow": JSON.stringify({ v: 1, teams: ["Bad Slug"] }) },
    { "ed-follow": JSON.stringify({ v: 2, teams: ["arsenal"] }) },
    { [ONBOARDING_STORAGE_KEY]: "done" },
    { [ONBOARDING_STORAGE_KEY]: "skipped" },
    { [ONBOARDING_STORAGE_KEY]: "other" },
    {
      [ONBOARDING_STORAGE_KEY]: "skipped",
      "ed-follow": JSON.stringify({ v: 1, teams: ["arsenal"] }),
    },
  ])("%o", (store) => {
    expect(run(store).hidden).toBe(expected(store));
  });

  it("저장소가 막히면(팔로우 · 기록 모두 못 읽음) 보인다 — 섬의 판정과 같다", () => {
    expect(run({}, true).hidden).toBe(false);
  });

  it("진입 줄이 없으면 아무것도 하지 않는다(던지지 않음)", () => {
    expect(() =>
      new Function("window", "document", ONBOARDING_BOOT_SCRIPT)(
        { localStorage: { getItem: () => null } },
        { getElementById: () => null },
      ),
    ).not.toThrow();
  });
});

// ─── 단계 ────────────────────────────────────────────────────────────────────

function league(id: CompId, n: number): OnboardingLeague {
  return {
    id,
    n: id,
    s: id,
    t: Array.from({ length: n }, (_, i) => ({
      k: `${id.toLowerCase()}-t${i + 1}`,
      n: `팀${i + 1}`,
      s: `T${i + 1}`,
      p: i + 1,
    })),
  };
}

const DATA: OnboardingData = {
  v: 1,
  l: [league("EPL", 20), league("LALIGA", 20), league("BUNDESLIGA", 18)],
  p: [
    { k: "kim-min-jae", n: "김민재", pos: "DF", t: "바이에른 뮌헨" },
    {
      k: "kim-ji-soo",
      n: "김지수",
      pos: "DF",
      t: "브렌트포드",
      st: "not-linked",
    },
  ],
};

describe("단계 상태", () => {
  it("번호 모양 — 앞 단계 완료 · 지금 현재 · 뒤 다음, 마친 뒤엔 모두 완료", () => {
    expect([0, 1, 2].map((i) => stepTone(i as 0 | 1 | 2, 1))).toEqual([
      "done",
      "current",
      "todo",
    ]);
    expect([0, 1, 2].map((i) => stepTone(i as 0 | 1 | 2, 0))).toEqual([
      "current",
      "todo",
      "todo",
    ]);
    expect([0, 1, 2].map((i) => stepTone(i as 0 | 1 | 2, 2, true))).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("다음 · 이전 — 끝에서 null", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(2)).toBeNull();
    expect(prevStep(2)).toBe(1);
    expect(prevStep(0)).toBeNull();
  });

  it("리그 고르기 — 켜고 끄고, 순서는 자료 순서", () => {
    const order: CompId[] = ["EPL", "LALIGA", "BUNDESLIGA"];
    let s = toggleLeague([], "BUNDESLIGA", order);
    s = toggleLeague(s, "EPL", order);
    expect(s).toEqual(["EPL", "BUNDESLIGA"]);
    expect(toggleLeague(s, "EPL", order)).toEqual(["BUNDESLIGA"]);
    expect(leaguesForTeams(DATA, s).map((l) => l.id)).toEqual([
      "EPL",
      "BUNDESLIGA",
    ]);
  });

  it("팀 — 앞 6팀 + 그 뒤에서 고른 팀, 펼치면 전부", () => {
    const epl = DATA.l[0]!;
    expect(visibleTeams(epl, false, []).length).toBe(TEAMS_SHOWN);
    const picked = visibleTeams(epl, false, ["epl-t10"]);
    expect(picked.map((t) => t.k)).toEqual([
      "epl-t1",
      "epl-t2",
      "epl-t3",
      "epl-t4",
      "epl-t5",
      "epl-t6",
      "epl-t10",
    ]);
    expect(visibleTeams(epl, false, new Set(["epl-t10"])).length).toBe(7);
    expect(visibleTeams(epl, true, []).length).toBe(20);
  });

  it("진행 알림 — 몇 단계 중 몇 번째 + 이름", () => {
    expect(stepAnnouncement(0)).toMatch(/^3단계 중 1단계, 리그\./);
    expect(stepAnnouncement(1)).toMatch(/^3단계 중 2단계, 팀\./);
    expect(stepAnnouncement(2)).toMatch(/^3단계 중 3단계, 한국 선수\./);
  });

  it("완료 요약 — 팔로우 순 이름, 자료 밖 slug는 수만 센다", () => {
    expect(
      onboardingSummary(
        { teams: ["epl-t2", "x-team"], players: ["kim-min-jae"] },
        DATA,
      ),
    ).toEqual({ teams: ["팀2"], players: ["김민재"], total: 3 });
  });
});

describe("자료 읽기(parseOnboardingData)", () => {
  it("버전 · 배열이 틀리면 null", () => {
    expect(parseOnboardingData(null)).toBeNull();
    expect(parseOnboardingData({ v: 2, l: [], p: [] })).toBeNull();
    expect(parseOnboardingData({ v: 1, l: {}, p: [] })).toBeNull();
  });
  it("맞는 자료는 그대로, 깨진 항목은 버린다", () => {
    expect(parseOnboardingData(JSON.parse(JSON.stringify(DATA)))).toEqual(DATA);
    const broken = {
      v: 1,
      l: [{ id: "EPL", n: "EPL", s: "EPL", t: [{ k: 1 }, DATA.l[0]!.t[0]] }, 3],
      p: [{ k: "x" }, DATA.p[0]],
    };
    const parsed = parseOnboardingData(broken)!;
    expect(parsed.l).toHaveLength(1);
    expect(parsed.l[0]!.t).toHaveLength(1);
    expect(parsed.p).toEqual([DATA.p[0]]);
  });
});

describe("자료 만들기(buildOnboardingData)", () => {
  const directory: MyDirectory = {
    teams: {
      arsenal: {
        n: "아스널",
        s: "ARS",
        c: ["#D70106", "#FFFFFF"],
        u: "EPL 1위",
      },
      brentford: { n: "브렌트포드", s: "BRE", u: "EPL 6위" },
      newcomer: { n: "새 팀", s: "NEW", u: "EPL" },
      "bayern-munchen": { n: "바이에른 뮌헨", s: "FCB", u: "분데스 1위" },
      "club-brugge": { n: "Club Brugge", l: 1, s: "CLU", u: "UCL" },
    },
    players: {
      "kim-min-jae": { n: "김민재", t: "바이에른 뮌헨" },
      "yang-min-hyeok": { n: "양민혁", t: "Westerlo", tl: 1 },
    },
  };
  const data = buildOnboardingData({
    competitions: [
      { id: "EPL", nameKo: "프리미어리그", shortKo: "EPL" },
      { id: "BUNDESLIGA", nameKo: "분데스리가", shortKo: "분데스" },
      { id: "UCL", nameKo: "챔피언스리그", shortKo: "UCL" },
    ],
    teamComp: new Map<string, CompId>([
      ["arsenal", "EPL"],
      ["brentford", "EPL"],
      ["newcomer", "EPL"],
      ["bayern-munchen", "BUNDESLIGA"],
      ["club-brugge", "UCL"],
    ]),
    standings: new Map([
      [
        "EPL" as CompId,
        new Map([
          ["brentford", 6],
          ["arsenal", 1],
        ]),
      ],
    ]),
    directory,
    players: [
      {
        slug: "kim-min-jae",
        position: "DF",
        team: "bayern-munchen",
        active: true,
        comp: "BUNDESLIGA",
        state: "linked",
      },
      {
        slug: "kim-ji-soo",
        position: "DF",
        team: "brentford",
        active: true,
        comp: "EPL",
        state: "not-linked",
      },
      {
        slug: "yang-min-hyeok",
        position: "FW",
        team: "westerlo",
        active: false,
        comp: "OTHER",
        state: "other",
      },
    ],
  });

  it("UCL은 리그에서 뺀다 · 팀은 순위 순(순위 없는 팀 뒤) · 한국 선수 팀 표시", () => {
    expect(data.l.map((l) => l.id)).toEqual(["EPL", "BUNDESLIGA"]);
    expect(data.l[0]!.t).toEqual([
      { k: "arsenal", n: "아스널", s: "ARS", c: ["#D70106", "#FFFFFF"], p: 1 },
      { k: "brentford", n: "브렌트포드", s: "BRE", p: 6, kr: 1 },
      { k: "newcomer", n: "새 팀", s: "NEW", p: null },
    ]);
    expect(data.l[1]!.t).toEqual([
      { k: "bayern-munchen", n: "바이에른 뮌헨", s: "FCB", p: null, kr: 1 },
    ]);
  });

  it("선수 — 디렉터리에 있는 선수만, 상태 · 라틴 소속 표시", () => {
    expect(data.p).toEqual([
      { k: "kim-min-jae", n: "김민재", pos: "DF", t: "바이에른 뮌헨" },
      {
        k: "yang-min-hyeok",
        n: "양민혁",
        pos: "FW",
        t: "Westerlo",
        tl: 1,
        st: "other",
      },
    ]);
    expect(parseOnboardingData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
