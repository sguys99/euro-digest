import { readFileSync } from "node:fs";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeamPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/teams/[team]/page";
import type { TeamLookup } from "@/lib/competition-view";
import type { TeamPageData } from "@/lib/data/team-page";
import { CompetitionFileSchema } from "@/lib/schema/competition";
import { CompetitionsFileSchema } from "@/lib/schema/configs";
import { TeamSchema, type Team } from "@/lib/schema/team";
import { FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";

// `/teams/[team]/`(M2-13 — PRD FR-50~58). 팀 페이지 입력(loadTeamPage)을 가짜 값으로 바꿔 끼운다(저장소 data/는 매일 바뀐다).
// 화면 모델 계산은 tests/team-view.test.ts, 빌드 결과(375·1280 · 접근성 · 111팀 링크)는 tests/e2e/team.spec.ts.
const { loadTeamPage, listTeamSlugs, loadLatestIssue } = vi.hoisted(() => ({
  loadTeamPage: vi.fn<(slug: string, now: Date) => TeamPageData | null>(),
  listTeamSlugs: vi.fn<() => readonly string[]>(() => ["fcb", "lhv"]),
  loadLatestIssue: vi.fn(() => ({ issue: null, news: null })),
}));
vi.mock("@/lib/data/team-page", () => ({ loadTeamPage }));
vi.mock("@/lib/data/teams", () => ({ listTeamSlugs }));
vi.mock("@/lib/data/issue", () => ({ loadLatestIssue }));

const NAMES: Record<string, string> = {
  fcb: "바이에른 뮌헨",
  scf: "프라이부르크",
  bvb: "도르트문트",
  vik: "Viking",
  lhv: "르아브르",
};
const lookup: TeamLookup = (slug) => ({
  slug,
  name: NAMES[slug] ?? slug,
  latin: slug === "vik",
  short: slug.toUpperCase(),
  colors: slug === "vik" ? null : ["#D3052B", "#FFFFFF"],
  page: slug !== "vik",
});

// 대회 설정은 저장소 설정 그대로(분데스리가 · UCL 순서만 쓴다)
const all = CompetitionsFileSchema.parse(
  JSON.parse(readFileSync("configs/competitions.json", "utf8")),
);
const configs = ["BUNDESLIGA", "UCL"].map((id) =>
  all.find((c) => c.id === id)!,
);

const bundesliga = CompetitionFileSchema.parse({
  comp: "BUNDESLIGA",
  season: 2026,
  provider: "football-data",
  updatedAt: "2026-10-29T21:00:00Z",
  standings: [
    {
      pos: 1,
      prevPos: null,
      team: "fcb",
      played: 7,
      w: 5,
      d: 2,
      l: 0,
      gf: 25,
      ga: 6,
      pts: 17,
      form: ["W", "D"],
      zone: "none",
    },
    {
      pos: 2,
      prevPos: null,
      team: "bvb",
      played: 7,
      w: 5,
      d: 2,
      l: 0,
      gf: 15,
      ga: 6,
      pts: 17,
      form: [],
      zone: "none",
    },
    {
      pos: 3,
      prevPos: null,
      team: "scf",
      played: 7,
      w: 4,
      d: 1,
      l: 2,
      gf: 12,
      ga: 9,
      pts: 13,
      form: [],
      zone: "none",
    },
  ],
  matches: [
    {
      id: "m1",
      comp: "BUNDESLIGA",
      round: "7",
      kickoff: "2026-10-25T16:30:00Z",
      home: "scf",
      away: "fcb",
      score: { h: 1, a: 3 },
      status: "finished",
    },
    {
      id: "m2",
      comp: "BUNDESLIGA",
      round: "8",
      kickoff: "2026-10-31T17:30:00Z",
      home: "fcb",
      away: "bvb",
      score: null,
      status: "scheduled",
    },
  ],
  scorers: [
    {
      player: "Kim Min-Jae",
      team: "fcb",
      goals: 1,
      assists: 0,
      penalties: 0,
      played: 5,
    },
  ],
});

function teamOf(extra: Partial<Team> = {}): Team {
  const startXI = [
    ["Jonas Urbig", 40, "G", "1:1"],
    ["Josip Stanišić", 44, "D", "2:4"],
    ["Dayot Upamecano", 2, "D", "2:3"],
    ["Jonathan Tah", 4, "D", "2:2"],
    ["Nathaniel Brown", 11, "D", "2:1"],
    ["Konrad Laimer", 27, "M", "3:2"],
    ["Tom Bischof", 8, "M", "3:1"],
    ["Michael Olise", 17, "M", "4:3"],
    ["Lennart Karl", 42, "M", "4:2"],
    ["Serge Gnabry", 7, "M", "4:1"],
    ["Harry Kane", 9, "F", "5:1"],
  ].map(([name, number, pos, grid]) => ({ name, number, pos, grid }));
  return TeamSchema.parse({
    slug: "fcb",
    nameKo: "바이에른 뮌헨",
    nameEn: "FC Bayern München",
    short: "FCB",
    comp: "BUNDESLIGA",
    alsoIn: [],
    colors: ["#D3052B", "#FFFFFF"],
    formation: {
      shape: "4-2-3-1",
      source: "api",
      updated: "2026-10-25T16:30:00Z",
    },
    topPlayers: [
      { name: "Michael Olise", goals: 6, assists: 3 },
      { name: "Harry Kane", goals: 4, assists: null },
    ],
    profile: null,
    koreanPlayers: ["kim-min-jae"],
    reading: [],
    lineup: {
      formation: "4-2-3-1",
      match: "af-1575198",
      kickoff: "2026-10-25T16:30:00Z",
      comp: "BUNDESLIGA",
      side: "away",
      opponent: "scf",
      startXI,
      substitutes: [
        {
          name: "Kim Min-Jae",
          number: 3,
          pos: "D",
          grid: null,
          korean: "kim-min-jae",
        },
        { name: "Sacha Boey", number: 23, pos: "D", grid: null },
      ],
    },
    ...extra,
  });
}

const kim = {
  slug: "kim-min-jae",
  nameKo: "김민재",
  nameEn: "Min-jae Kim",
  team: "fcb",
  comp: "BUNDESLIGA" as const,
  position: "DF" as const,
  birthYear: 1996,
  apiFootballId: 2897,
  active: true,
};

function pageData(team: Team = teamOf()): TeamPageData {
  return {
    team,
    self: lookup(team.slug),
    config: configs[0]!,
    data: bundesliga,
    contexts: [{ config: configs[0]!, data: bundesliga }],
    competitions: [bundesliga],
    configs,
    lookup,
    playerName: (en) =>
      ({ "Kim Min-Jae": "김민재", "Harry Kane": "해리 케인" })[en] ?? null,
    korean: team.koreanPlayers.length ? [kim] : [],
    koreanBySlug: new Map([[kim.slug, kim]]),
    related: [],
  };
}

async function renderPage(slug = "fcb") {
  render(
    await TeamPage({
      params: Promise.resolve({ team: slug }),
    } as PageProps<"/teams/[team]">),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T03:00:00Z"));
  loadTeamPage.mockImplementation(() => pageData());
});
afterEach(() => {
  vi.useRealTimers();
  loadTeamPage.mockReset();
});

describe("팀 페이지 — 정적 생성 · 메타", () => {
  it("팀 파일마다 정적 경로를 만든다(FR-50)", () => {
    expect(generateStaticParams()).toEqual([{ team: "fcb" }, { team: "lhv" }]);
  });

  it("제목 = 팀명 + 시즌, 설명에 순위·스코어 없음, canonical = 팀 경로", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ team: "fcb" }),
    } as never);
    expect(meta.title).toBe("바이에른 뮌헨 2026-27 시즌");
    expect(String(meta.description)).toContain("바이에른 뮌헨(분데스리가)");
    expect(meta.alternates?.canonical).toMatch(/\/teams\/fcb\/$/);
  });
});

describe("팀 페이지 — 티켓 · 팀시트 · 일정 · 주요 선수 · 리그 맥락 · 출처", () => {
  it("티켓: h1 한글 팀명 · 홀로 선 배지 · 순위·승점·경기·득실 · 전 대회 폼 · 다음 경기 KST · 한국 선수(FR-51·58)", async () => {
    await renderPage();
    const ticket = document.querySelector<HTMLElement>(
      "[data-slot=team-ticket]",
    )!;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "바이에른 뮌헨",
    );
    expect(
      within(ticket).getByRole("img", { name: "바이에른 뮌헨 배지 FCB" }),
    ).toBeTruthy();
    expect(ticket.textContent).toContain("+19");
    expect(ticket.textContent).toContain("5승 2무 0패");
    expect(
      within(ticket).getByRole("img", {
        name: /^최근 경기\(전 대회\) 자료 1경기/,
      }),
    ).toBeTruthy();
    // 다음 경기 = 10.31 17:30Z → 11.01 (일) 02:30 KST, 홈 도르트문트
    expect(ticket.textContent).toContain("11.01 (일) 02:30");
    expect(ticket.textContent).toContain("홈도르트문트");
    expect(ticket.textContent).toContain("김민재");
    // 포메이션은 티켓에 두지 않는다(D1 §4)
    expect(ticket.textContent).not.toContain("4-2-3-1");
  });

  it("팀시트: 포메이션 한 번 · 근거 줄(경기 맥락·API-Football) · 피치 11칸(aria-hidden) · 명단 원어 + 한국 선수만 한글·완장(D63 ①②)", async () => {
    await renderPage();
    const sheet = document.querySelector<HTMLElement>(
      "[data-slot=team-sheet]",
    )!;
    expect(document.body.textContent?.match(/4-2-3-1/g)).toHaveLength(1);
    expect(sheet.textContent).toContain("10.26 (월) 01:30");
    expect(sheet.textContent).toContain("프라이부르크 원정");
    expect(sheet.textContent).toContain("API-Football");
    const pitch = sheet.querySelector<HTMLElement>("[data-slot=pitch]")!;
    expect(pitch.getAttribute("aria-hidden")).toBe("true");
    expect(pitch.querySelectorAll("li[data-no]")).toHaveLength(11);
    expect(
      pitch.querySelector<HTMLElement>("li")!.style.getPropertyValue("--a"),
    ).toBe("91");
    const lists = within(sheet).getAllByRole("list");
    const subs = lists.at(-1)!;
    const kimRow = within(subs).getByText("김민재").closest("li")!;
    expect(kimRow.textContent).toContain("한국");
    expect(within(subs).getByText("Sacha Boey").getAttribute("lang")).toBe(
      "en",
    );
    expect(sheet.textContent).toContain("Harry Kane"); // 팀시트는 사전 치환 없음
  });

  it("라인업이 없으면 피치·명단 없이 포메이션만, 포메이션이 없으면 팀시트 섹션 없음(FR-55)", async () => {
    loadTeamPage.mockImplementation(() => pageData(teamOf({ lineup: null })));
    await renderPage();
    const sheet = document.querySelector("[data-slot=team-sheet]")!;
    expect(sheet.querySelector("[data-slot=pitch]")).toBeNull();
    expect(sheet.querySelectorAll("ol")).toHaveLength(0);
    expect(sheet.textContent).toContain("선수 배치 자료 없음");
  });

  it("포메이션 없음 → 팀시트 없음 · 득점 상위·한국 선수 없음 → 섹션 없음", async () => {
    loadTeamPage.mockImplementation(() =>
      pageData(
        teamOf({
          slug: "lhv",
          formation: null,
          lineup: null,
          topPlayers: [],
          koreanPlayers: [],
        }),
      ),
    );
    await renderPage("lhv");
    expect(document.querySelector("[data-slot=team-sheet]")).toBeNull();
    expect(document.querySelector("[data-slot=team-key-players]")).toBeNull();
  });

  it("일정·결과: 홈/원정 · 라운드 · 상대 링크 · 스코어 + 결과 칩 · 예정 KST(FR-52)", async () => {
    await renderPage();
    const fx = document.querySelector<HTMLElement>(
      "[data-slot=team-fixtures]",
    )!;
    const rows = fx.querySelectorAll("li[data-state]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("원정7라운드");
    expect(rows[0]!.textContent).toContain("승");
    expect(
      within(rows[0] as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toMatch(/^\/teams\/scf\/?$/); // 테스트 환경 next/link는 끝 / 를 뗀다
    expect(rows[1]!.textContent).toContain("02:30");
    expect(rows[1]!.textContent).toContain("예정 · KST");
  });

  it("주요 선수: 득점·도움 상위(한글 사전 일치만) · 도움 null은 – · 한국 선수 행(FR-54)", async () => {
    await renderPage();
    const kp = document.querySelector<HTMLElement>(
      "[data-slot=team-key-players]",
    )!;
    expect(kp.textContent).toContain("분데스리가 시즌 누적");
    expect(within(kp).getByText("Michael Olise").getAttribute("lang")).toBe(
      "en",
    );
    expect(kp.textContent).toContain("해리 케인");
    expect(kp.textContent).toContain("도움 자료 없음");
    expect(kp.textContent).toMatch(/김민재.*1골/);
  });

  it("리그 맥락: 순위표 행 앵커 링크 · 이 팀 표시 · 전체 순위", async () => {
    await renderPage();
    const ctx = document.querySelector<HTMLElement>(
      "[data-slot=league-context]",
    )!;
    const links = within(ctx).getAllByRole("link");
    // 테스트 환경 next/link는 trailingSlash 설정 없이 끝 / 를 뗀다(빌드 결과는 e2e가 본다)
    expect(
      links.map((a) =>
        a.getAttribute("href")?.replace("/#", "#").replace(/\/$/, ""),
      ),
    ).toEqual([
      "/competitions/bundesliga#fcb",
      "/competitions/bundesliga#bvb",
      "/competitions/bundesliga#scf",
      "/competitions/bundesliga",
    ]);
    expect(links[0]!.getAttribute("aria-current")).toBe("true");
  });

  it("관련 뉴스 빈 상태 · 출처 줄(필수 영문 문구 + API-Football)", async () => {
    await renderPage();
    expect(
      document.querySelector("[data-slot=team-news]")!.textContent,
    ).toContain("최근 30일 동안 이 팀 소식이 없어요.");
    const source = document.querySelector<HTMLElement>(
      "[data-slot=data-source][data-scope=team]",
    )!;
    expect(source.textContent).toContain("팀시트·포메이션 API-Football");
    expect(source.querySelector("[lang=en]")!.textContent).toBe(
      FOOTBALL_DATA_ATTRIBUTION,
    );
    expect(source.textContent).not.toContain("업데이트 지연");
  });
});
