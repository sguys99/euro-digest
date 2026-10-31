/**
 * M2-14·M2-15 — 홈 위젯 화면 모델(src/lib/home-widgets.ts)과 그리기(src/components/home/*), `/tonight` 페이지.
 *   - 오늘 밤 카드: 화면 순서 = 킥오프 순(같은 킥오프는 선별 순서 — 2026-10-31 사용자 결정) · 킥오프 KST(서머타임 전후) · 이유 태그 label 그대로(한국 = 완장) · 이유 없으면 태그 줄 없음 ·
 *     끝난 경기 = "종료"(스코어 없음) · 킥오프 + 3시간 지난 scheduled = "결과 대기" · 창 문구 · 빈 상태
 *   - 순위 미니: 상위 5행 · ▲▼(prevPos null = 빈칸) · 구간 띠(UCL 16강 직행) · 팀 행 앵커 링크 · 기준 날짜 줄 · 탭 6개 · 빈 패널
 *   - 선정 기준: bigmatch-rules 값 그대로 · weight 0 규칙 제외
 * 네트워크 없음(합성 입력 · 저장소 configs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeagueMini } from "@/components/home/league-mini";
import { TonightSection } from "@/components/home/tonight";
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import {
  leagueMiniPanel,
  tonightCards,
  tonightCriteria,
  tonightWindowLongText,
  tonightWindowText,
  type CompLabel,
} from "@/lib/home-widgets";
import {
  BigmatchRulesFileSchema,
  type CompetitionConfig,
  type Match,
  type StandingRow,
} from "@/lib/schema";
import type { CompId } from "@/lib/schema/common";
import type { TonightPick } from "@/lib/tonight";
import { kstWindowRangeUtc } from "@/lib/time";

// ─── 합성 입력 ──────────────────────────────────────────────────────────────

const team: TeamLookup = (slug) =>
  ({
    slug,
    name:
      (
        {
          "bayern-munchen": "바이에른 뮌헨",
          "borussia-dortmund": "보루시아 도르트문트",
          milan: "AC 밀란",
          inter: "인테르",
          arsenal: "아스널",
        } as Record<string, string>
      )[slug] ?? slug,
    latin: slug === "viking",
    short: slug.slice(0, 3).toUpperCase(),
    colors: slug === "viking" ? null : ["#DC052D", "#FFFFFF"],
    // 팀 페이지(M2-13)가 있는 팀 — 인테르는 없다고 둔다(링크 없이 글자만)
    page: slug !== "inter",
  }) satisfies TeamView;

const COMPS = new Map<CompId, CompLabel>([
  ["BUNDESLIGA", { short: "분데스", name: "분데스리가" }],
  ["SERIEA", { short: "세리에A", name: "세리에 A" }],
  ["UCL", { short: "UCL", name: "UEFA 챔피언스리그" }],
]);

function match(
  id: string,
  comp: CompId,
  home: string,
  away: string,
  kickoff: string,
  extra: Partial<Match> = {},
): Match {
  return {
    id,
    comp,
    round: "9",
    kickoff,
    home,
    away,
    score: null,
    status: "scheduled",
    ...extra,
  };
}

const PICKS: TonightPick[] = [
  {
    match: match(
      "m1",
      "BUNDESLIGA",
      "bayern-munchen",
      "borussia-dortmund",
      "2026-10-31T17:30:00Z",
    ),
    score: 17,
    rules: ["korean", "topClash", "derby", "closeRace"],
    reasons: [
      {
        kind: "korean",
        player: "kim-min-jae",
        team: "bayern-munchen",
        label: "김민재 소속",
      },
      { kind: "derby", name: "데어 클라시커", label: "데어 클라시커" },
      { kind: "topClash", pos: [1, 2], label: "1·2위 맞대결" },
    ],
  },
  {
    match: match("m2", "SERIEA", "milan", "inter", "2026-10-31T19:45:00Z"),
    score: 8,
    rules: ["derby", "topClash"],
    reasons: [],
  },
];

// 빌드 시각 2026-10-31 08:00 KST(= 10-30T23:00Z) — 아침 발행 빌드
const MORNING = Date.parse("2026-10-30T23:00:00Z");

// ─── 오늘 밤 화면 모델 ───────────────────────────────────────────────────────

describe("tonightCards — 선별 결과 → 카드", () => {
  it("킥오프 KST(시각·날짜), 대회 약칭·정식명, 이유 label 그대로", () => {
    const cards = tonightCards(PICKS, team, COMPS, MORNING);
    expect(cards.map((c) => c.id)).toEqual(["m1", "m2"]);
    expect(cards[0]).toMatchObject({
      comp: "BUNDESLIGA",
      compLabel: { short: "분데스", name: "분데스리가" },
      time: "02:30",
      date: "11.01",
      state: "scheduled",
      stateText: null,
      reasons: [
        { kind: "korean", label: "김민재 소속" },
        { kind: "derby", label: "데어 클라시커" },
        { kind: "topClash", label: "1·2위 맞대결" },
      ],
    });
    expect(cards[0]?.home.name).toBe("바이에른 뮌헨");
    expect(cards[1]?.reasons).toEqual([]);
  });

  it("화면 순서는 킥오프 순 — 선별(점수 순)은 그대로 두고, 같은 킥오프는 선별 순서를 유지", () => {
    const pick = (id: string, kickoff: string, score: number): TonightPick => ({
      match: match(id, "UCL", "arsenal", "milan", kickoff),
      score,
      rules: ["ucl"],
      reasons: [],
    });
    // 점수 순 선별 결과(높은 점수가 늦은 킥오프)
    const picks = [
      pick("late-top", "2026-10-31T20:00:00Z", 13),
      pick("early-a", "2026-10-31T17:30:00Z", 9),
      pick("mid", "2026-10-31T19:45:00Z", 8),
      pick("early-b", "2026-10-31T17:30:00Z", 5),
      pick("early-c", "2026-10-31T17:30:00.000Z", 4),
    ];
    expect(tonightCards(picks, team, COMPS, MORNING).map((c) => c.id)).toEqual([
      "early-a",
      "early-b",
      "early-c",
      "mid",
      "late-top",
    ]);
    // 입력 배열은 바꾸지 않는다
    expect(picks.map((p) => p.match.id)[0]).toBe("late-top");
  });

  it("유럽 서머타임 종료(2026-10-25) 전후 — 킥오프 KST는 UTC + 9 그대로", () => {
    const before = match(
      "a",
      "UCL",
      "arsenal",
      "milan",
      "2026-10-21T19:00:00Z",
    );
    const after = match("b", "UCL", "arsenal", "milan", "2026-10-28T20:00:00Z");
    const [x, y] = tonightCards(
      [before, after].map((m) => ({
        match: m,
        score: 4,
        rules: ["ucl"],
        reasons: [],
      })),
      team,
      COMPS,
      MORNING,
    );
    expect([x?.time, x?.date]).toEqual(["04:00", "10.22"]);
    expect([y?.time, y?.date]).toEqual(["05:00", "10.29"]);
  });

  it("저녁 빌드 — 끝난 경기는 '종료'(스코어는 카드 모델에 없다), 킥오프 + 3시간 지난 scheduled는 '결과 대기'", () => {
    const finished = match(
      "f",
      "UCL",
      "arsenal",
      "milan",
      "2026-10-31T10:00:00Z",
      {
        status: "finished",
        score: { h: 2, a: 1 },
      },
    );
    const late = match("p", "UCL", "arsenal", "inter", "2026-10-31T10:00:00Z");
    const live = match("l", "UCL", "milan", "inter", "2026-10-31T12:30:00Z");
    const now = Date.parse("2026-10-31T13:30:00Z");
    const cards = tonightCards(
      [finished, late, live].map((m) => ({
        match: m,
        score: 4,
        rules: ["ucl"],
        reasons: [],
      })),
      team,
      COMPS,
      now,
    );
    expect(cards.map((c) => [c.state, c.stateText])).toEqual([
      ["finished", "종료"],
      ["pending", "결과 대기"],
      ["scheduled", null],
    ]);
    expect(JSON.stringify(cards)).not.toMatch(/"h":2/);
  });

  it("창 문구 — '10.31 18:00 ~ 11.01 07:00 KST'(끝 07:00), 긴 문구는 요일까지", () => {
    const w = kstWindowRangeUtc("2026-10-31", {
      fromKst: "18:00",
      toKst: "07:00",
    });
    expect(tonightWindowText(w)).toBe("10.31 18:00 ~ 11.01 07:00 KST");
    expect(tonightWindowLongText(w)).toBe(
      "10월 31일 (토) 18:00 ~ 11월 1일 (일) 07:00 KST",
    );
  });
});

// ─── 오늘 밤 그리기 ─────────────────────────────────────────────────────────

describe("TonightSection — 홈 위젯", () => {
  const window = kstWindowRangeUtc("2026-10-31", {
    fromKst: "18:00",
    toKst: "07:00",
  });

  it("머리·부제(창 · n경기)·목록 <ol>·이유 <ul aria-label='선정 이유'>·한국 완장·도장·배지 aria-hidden·'대'·인덱스 탭·<time datetime>", () => {
    const cards = tonightCards(PICKS, team, COMPS, MORNING);
    render(
      <TonightSection
        widget={{ baseKstDate: "2026-10-31", window, cards }}
        headingId="t-h"
      />,
    );
    const section = screen.getByRole("region", { name: "오늘 밤 볼 경기" });
    expect(section).toHaveTextContent("10.31 18:00 ~ 11.01 07:00 KST · 2경기");
    const rows = within(section)
      .getAllByRole("listitem")
      .filter((li) => li.matches("[data-slot=tonight-row]"));
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    const why = within(first).getByRole("list", { name: "선정 이유" });
    expect(
      within(why)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["한국김민재 소속", "데어 클라시커", "1·2위 맞대결"]);
    expect(why.querySelector("[data-reason=korean] [title]")).toHaveTextContent(
      "한국",
    );
    // 이유가 없는 경기는 태그 줄이 없다
    expect(
      within(second).queryByRole("list", { name: "선정 이유" }),
    ).toBeNull();
    // 대진: 홈 / 화면 밖 "대" / 원정, 배지는 장식
    expect(first.querySelector(".sr-only")?.textContent).toBe("대");
    for (const badge of first.querySelectorAll(".kit")) {
      expect(badge).toHaveAttribute("aria-hidden", "true");
    }
    expect(first.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-31T17:30:00Z",
    );
    expect(first.querySelector("[data-slot=index-tab]")).toHaveAttribute(
      "title",
      "분데스리가",
    );
    // 팀 이름(배지 + 이름) = 팀 화면 링크(M2-13 — 팀 페이지가 있는 팀만, 인테르는 글자만) + '선정 기준 ›'
    const links = within(section).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "BAY바이에른 뮌헨",
      "BOR보루시아 도르트문트",
      "MILAC 밀란",
      "선정 기준",
    ]);
    expect(links[0]?.getAttribute("href")).toMatch(
      /^\/teams\/bayern-munchen\/?$/,
    );
    expect(links[3]?.getAttribute("href")).toMatch(/^\/tonight\/?$/);
    expect(second).toHaveTextContent("인테르");
  });

  it("끝난 경기 — 거터에 '종료', 스코어 숫자는 없다", () => {
    const finished = match(
      "f",
      "UCL",
      "arsenal",
      "milan",
      "2026-10-31T10:00:00Z",
      {
        status: "finished",
        score: { h: 3, a: 0 },
      },
    );
    const cards = tonightCards(
      [{ match: finished, score: 4, rules: ["ucl"], reasons: [] }],
      team,
      COMPS,
      Date.parse("2026-10-31T14:00:00Z"),
    );
    render(
      <TonightSection
        widget={{ baseKstDate: "2026-10-31", window, cards }}
        headingId="t-h"
      />,
    );
    const row = document.querySelector(
      "[data-slot=tonight-row]",
    ) as HTMLElement;
    expect(row).toHaveAttribute("data-state", "finished");
    expect(row.querySelector("[data-slot=tonight-state]")).toHaveTextContent(
      "종료",
    );
    expect(row.textContent).not.toMatch(/3\s*[-–:]\s*0/);
  });

  it("빈 상태 — 경기 없는 날은 부제(창, 경기 수 없음) + 빈 상태 문구, 선정 규칙 파일이 없으면(창 null) 부제도 없다", () => {
    const { rerender } = render(
      <TonightSection
        widget={{ baseKstDate: "2026-11-05", window, cards: [] }}
        headingId="t-h"
      />,
    );
    const section = screen.getByRole("region", { name: "오늘 밤 볼 경기" });
    expect(section).toHaveTextContent("10.31 18:00 ~ 11.01 07:00 KST");
    expect(section).not.toHaveTextContent("경기 ·");
    expect(
      section.querySelector("[data-slot=tonight-empty]"),
    ).toHaveTextContent("오늘 밤에는 6개 대회 경기가 없어요.");
    expect(section.querySelector("ol")).toBeNull();
    rerender(
      <TonightSection
        widget={{ baseKstDate: "2026-11-05", window: null, cards: [] }}
        headingId="t-h"
      />,
    );
    expect(
      screen.getByRole("region", { name: "오늘 밤 볼 경기" }),
    ).not.toHaveTextContent("KST");
  });
});

// ─── 순위 미니 ──────────────────────────────────────────────────────────────

function srow(
  team: string,
  pos: number,
  pts: number,
  prevPos: number | null,
): StandingRow {
  return {
    pos,
    prevPos,
    team,
    played: 4,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    pts,
    form: [],
    zone: "none",
  };
}

const EPL_CONFIG = {
  id: "EPL",
  nameKo: "프리미어리그",
  shortKo: "EPL",
  zones: [{ zone: "relegation", from: 18, to: 20, label: "강등" }],
} satisfies Pick<CompetitionConfig, "id" | "nameKo" | "shortKo" | "zones">;

const UCL_CONFIG = {
  id: "UCL",
  nameKo: "UEFA 챔피언스리그",
  shortKo: "UCL",
  zones: [
    { zone: "knockout", from: 1, to: 8, label: "16강 직행" },
    { zone: "playoff", from: 9, to: 24, label: "PO" },
  ],
} satisfies Pick<CompetitionConfig, "id" | "nameKo" | "shortKo" | "zones">;

const EPL_ROWS = [
  srow("manchester-city", 1, 15, 1),
  srow("arsenal", 2, 15, 3),
  srow("brighton", 3, 13, 2),
  srow("brentford", 4, 10, 5),
  srow("chelsea", 5, 10, null),
  srow("everton", 6, 9, 6),
];

describe("leagueMiniPanel — 상위 5위", () => {
  it("상위 5행 · ▲▼(prevPos null = 자료 없음) · 행 링크 = 대회 순위표의 팀 행 앵커 · 기준 날짜 줄(KST)", () => {
    const panel = leagueMiniPanel(
      EPL_CONFIG,
      { standings: EPL_ROWS, updatedAt: "2026-10-30T15:30:00Z" },
      team,
    );
    expect(
      panel.rows.map((r) => [r.pos, r.team.slug, r.pts, r.trend.kind]),
    ).toEqual([
      [1, "manchester-city", 15, "same"],
      [2, "arsenal", 15, "up"],
      [3, "brighton", 13, "down"],
      [4, "brentford", 10, "up"],
      [5, "chelsea", 10, "none"],
    ]);
    expect(panel.rows[1]?.href).toBe("/competitions/epl/#arsenal");
    expect(panel.rows.every((r) => r.band === null)).toBe(true);
    // updatedAt 15:30Z = KST 10.31 00:30
    expect(panel.note).toBe("10.31 기준 · 변동 전날 대비");
    expect(panel.href).toBe("/competitions/epl/");
  });

  it("전날 자료가 한 행도 없으면 '변동 자료 없음' · UCL 16강 직행 구간은 띠(ko)", () => {
    const rows = EPL_ROWS.map((r) => ({ ...r, prevPos: null }));
    const panel = leagueMiniPanel(
      UCL_CONFIG,
      { standings: rows, updatedAt: "2026-10-30T02:00:00Z" },
      team,
    );
    expect(panel.note).toBe("10.30 기준 · 변동 자료 없음");
    expect(panel.rows.map((r) => r.band)).toEqual([
      "ko",
      "ko",
      "ko",
      "ko",
      "ko",
    ]);
  });

  it("데이터가 없거나 순위표가 비면 빈 패널(행 없음 · 아래 줄 없음)", () => {
    expect(leagueMiniPanel(EPL_CONFIG, null, team)).toMatchObject({
      rows: [],
      note: null,
      updatedAt: null,
    });
    expect(
      leagueMiniPanel(
        EPL_CONFIG,
        { standings: [], updatedAt: "2026-08-01T00:00:00Z" },
        team,
      ).note,
    ).toBeNull();
  });
});

describe("LeagueMini — 탭 섬", () => {
  const panels = [
    leagueMiniPanel(
      EPL_CONFIG,
      { standings: EPL_ROWS, updatedAt: "2026-10-30T02:00:00Z" },
      team,
    ),
    leagueMiniPanel(UCL_CONFIG, null, team),
  ];

  it("탭 목록 '대회 선택'(grid 3열) · 첫 탭 선택 · 패널 목록 이름 · 승점 뒤 화면 밖 '점' · 행 링크 · '전체 순위'", () => {
    render(<LeagueMini panels={panels} headingId="m-h" />);
    const section = screen.getByRole("region", { name: "리그 순위" });
    // happy-dom은 <noscript> 안 스타일(JS 없을 때 탭 목록 숨김)도 적용해 접근 이름 계산에서 빠진다 — 속성으로 찾는다
    const list = section.querySelector("[role=tablist]") as HTMLElement;
    expect(list).toHaveAttribute("aria-label", "대회 선택");
    expect(list.className).toContain("grid-cols-3");
    const tabs = within(list).getAllByRole("tab", { hidden: true });
    expect(
      tabs.map((t) => [t.textContent, t.getAttribute("aria-selected")]),
    ).toEqual([
      ["EPL", "true"],
      ["UCL", "false"],
    ]);
    const top = within(section).getByRole("list", {
      name: "프리미어리그 상위 5위",
    });
    const links = within(top).getAllByRole("link");
    expect(links).toHaveLength(5);
    // 다른 페이지 앵커는 보통 <a>(next/link 클라이언트 이동은 :target을 바꾸지 않는다) — basePath를 붙인 주소
    expect(links[0]).toHaveAttribute(
      "href",
      "/euro-digest/competitions/epl/#manchester-city",
    );
    expect(links[0]).toHaveTextContent(/^1위.*15점$/);
    expect(links[0]?.querySelector(".kit")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      within(section).getAllByRole("link", { name: "전체 순위" })[0],
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/competitions\/epl\/?$/),
    );
  });

  it("탭을 바꾸면 그 패널이 보이고(찍힘 표시) 자료 없는 대회는 빈 상태 문구", () => {
    render(<LeagueMini panels={panels} headingId="m-h" />);
    const ucl = [...document.querySelectorAll("[role=tab]")].find(
      (t) => t.textContent === "UCL",
    ) as HTMLElement;
    act(() => {
      fireEvent.click(ucl);
    });
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("data-comp", "UCL");
    expect(panel).toHaveAttribute("data-in");
    expect(
      panel.querySelector("[data-slot=league-mini-empty]"),
    ).toHaveTextContent("아직 이 대회 순위 자료가 없어요.");
  });

  it("JS 없을 때 — noscript 스타일이 숨은 패널을 펼치고 탭 목록을 숨긴다(패널 머리가 대신)", () => {
    const { container } = render(
      <LeagueMini panels={panels} headingId="m-h" />,
    );
    expect(
      container.querySelectorAll("[data-slot=league-mini-caption]"),
    ).toHaveLength(2);
    expect(container.querySelector("noscript")).not.toBeNull();
  });

  it("패널이 없으면 위젯을 그리지 않는다", () => {
    const { container } = render(<LeagueMini panels={[]} headingId="m-h" />);
    expect(container.innerHTML).toBe("");
  });
});

// ─── 선정 기준 ──────────────────────────────────────────────────────────────

describe("tonightCriteria — 선정 기준(bigmatch-rules 값 그대로)", () => {
  const rules = BigmatchRulesFileSchema.parse(
    JSON.parse(
      readFileSync(path.resolve("configs/bigmatch-rules.json"), "utf8"),
    ),
  );

  it("FR-81 순서 · 설정 값(상위 N위·더비 수·승점 차·빅클럽 수)·가중치", () => {
    const rows = tonightCriteria(rules);
    expect(rows.map((r) => r.rule)).toEqual([
      "korean",
      "ucl",
      "topClash",
      "derby",
      "closeRace",
      "bigClub",
    ]);
    expect(rows.find((r) => r.rule === "topClash")?.label).toBe(
      `리그 상위 ${rules.rules.topClash.topN}위끼리 맞대결`,
    );
    expect(rows.find((r) => r.rule === "derby")?.label).toBe(
      `지정 더비 ${rules.rules.derby.list.length}개`,
    );
    expect(rows.map((r) => r.weight)).toEqual([
      rules.rules.korean.weight,
      rules.rules.ucl.weight,
      rules.rules.topClash.weight,
      rules.rules.derby.weight,
      rules.rules.closeRace.weight,
      rules.rules.bigClub.weight,
    ]);
    // 한국 선수 — 출전이 아니라 소속(D62 ③)
    expect(rows[0]?.note).toContain("소속");
    expect(rows[0]?.note).not.toMatch(/출전 예상/);
  });

  it("weight 0 규칙(끈 규칙)은 뺀다", () => {
    const off = { ...rules, rules: { ...rules.rules, ucl: { weight: 0 } } };
    expect(tonightCriteria(off).map((r) => r.rule)).not.toContain("ucl");
  });
});

// ─── /tonight 페이지 ────────────────────────────────────────────────────────

describe("/tonight 페이지", () => {
  it("메타 — 제목 '오늘 밤 볼 경기', canonical = /tonight/, 설명에 시각·스코어 모양 없음", async () => {
    vi.resetModules();
    const { metadata } = await import("@/app/tonight/page");
    expect(metadata.title).toBe("오늘 밤 볼 경기");
    expect(metadata.alternates?.canonical).toBe(
      "https://sguys99.github.io/euro-digest/tonight/",
    );
    expect(String(metadata.description)).not.toMatch(/\d\s*[-–:]\s*\d/);
  });
});
