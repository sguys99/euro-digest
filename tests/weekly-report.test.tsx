import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BoxScore,
  RunnersUp,
  WeeklyArchiveList,
  WeeklyContents,
  WeeklyEmpty,
  WeeklyHead,
  WeeklySummary,
} from "@/components/korean-players/weekly-report";
import { listWeeklyWeeks, loadWeeklyReport } from "@/lib/data/weekly-report";
import type {
  MvpView,
  WeeklyIndexEntry,
  WeeklyReportView,
} from "@/lib/weekly-report-view";
import { weekName } from "@/lib/weekly-report-view";

// 주간 리포트 화면(M3-12 — DESIGN §9.3 D2 주간 지면 · MVP 머리기사 · 출전 기록 박스 · 문단 블록 AI 라벨, D64 ④⑥ · D65 ②)

const TEAM = {
  slug: "mainz",
  name: "마인츠",
  latin: false,
  short: "M05",
  colors: ["#C3141E", "#FFFFFF"] as const,
};

const mvp = (slug: string, nameKo: string): MvpView => ({
  slug,
  nameKo,
  team: TEAM,
  position: "MF",
  evidence: {
    kickoff: "2026-10-24T13:30:00.000Z",
    opponent: {
      name: "브레멘",
      latin: false,
      badge: { name: "브레멘", short: "SVW", colors: null },
    },
    home: true,
    scoring: "63분 골",
    result: { outcome: "L", for: 2, against: 3, pens: null },
    played: "75분 출전",
  },
});

const VIEW: WeeklyReportView = {
  name: weekName("2026-43"),
  range: {
    from: "2026-10-19T00:00:00.000Z",
    to: "2026-10-25T23:59:59.999Z",
    fromLabel: "10.19 (월)",
    toLabel: "10.25 (일)",
  },
  generatedAt: "2026-11-01T07:09:25.458Z",
  mvp: mvp("lee-jae-sung", "이재성"),
  coMvp: [],
  score: { points: 4, goals: 1, assists: 0, apps: 1 },
  summary: { text: "이번 주 MVP는 이재성이다.", ai: true },
  rows: [
    {
      slug: "lee-jae-sung",
      nameKo: "이재성",
      team: TEAM,
      apps: 1,
      minutes: 75,
      goals: 1,
      assists: 0,
      points: 4,
      mvp: true,
      matches: [
        {
          key: "fd-1-0",
          kickoff: "2026-10-24T13:30:00.000Z",
          comp: {
            kind: "comp",
            comp: "BUNDESLIGA",
            short: "분데스",
            name: "분데스리가",
          },
          opponent: {
            name: "브레멘",
            latin: false,
            badge: { name: "브레멘", short: "SVW", colors: null },
          },
          appearance: {
            text: "75",
            tone: "on",
            label: "선발",
            strong: true,
            sr: "선발 75분",
          },
          fill: 83,
          bar: "played",
        },
      ],
    },
    {
      slug: "jens-castrop",
      nameKo: "옌스 카스트로프",
      team: TEAM,
      apps: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      points: 0,
      mvp: false,
      matches: [
        {
          key: "fd-2-0",
          kickoff: "2026-10-24T13:30:00.000Z",
          comp: { kind: "other", name: "DFB 포칼", latin: false },
          opponent: {
            name: "Stuttgart",
            latin: true,
            badge: { name: "Stuttgart", short: "", colors: null },
          },
          appearance: {
            text: "–",
            tone: "null",
            label: "명단 제외",
            strong: false,
            sr: "명단 제외",
          },
          fill: 0,
          bar: "none",
        },
      ],
    },
  ],
  appeared: 1,
  runnersUp: [{ slug: "jens-castrop", nameKo: "옌스 카스트로프", points: 0 }],
  excluded: [
    { reason: "기록 연결 전", names: ["김지수", "박승수"] },
    { reason: "5대 리그 밖", names: ["홍현석"] },
  ],
  prev: { kind: "off", name: weekName("2026-42"), reason: "리포트 없음" },
  next: { kind: "link", name: weekName("2026-44") },
};

describe("WeeklyHead — MVP 머리기사", () => {
  it("이름 h1(화면 밖 'W43 MVP') · 근거 줄 결과 묶음(골 분 · W/D/L · 스코어) · 홈은 묶음 밖", () => {
    const { container } = render(<WeeklyHead view={VIEW} headingId="wk-h" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("W43 MVP 이재성");
    expect(within(h1).getByRole("link", { name: "이재성" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/korean-players\/lee-jae-sung\/?$/),
    );
    const value = container.querySelector('[data-slot="result-value"]');
    expect(value).toHaveTextContent("63분 골");
    expect(value).toHaveTextContent("패");
    expect(value).toHaveTextContent("2-대3");
    expect(value).not.toHaveTextContent("홈");
    expect(
      container.querySelector('[data-slot="result-cell"]'),
    ).toHaveTextContent("홈");
    expect(screen.queryByText("공동")).toBeNull();
    // 기간 = 경기일 기준
    expect(container).toHaveTextContent("10.19 (월) ~ 10.25 (일) 경기일 기준");
  });

  it("주 넘기기 — 꺼진 앞 주(이유 화면 밖) · 다음 주 링크 rel=next", () => {
    render(<WeeklyHead view={VIEW} headingId="wk-h" />);
    const nav = screen.getByRole("navigation", { name: "주 넘기기" });
    const next = within(nav).getByRole("link");
    expect(next).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/korean-players\/weekly\/2026-44\/?$/),
    );
    expect(next).toHaveAttribute("rel", "next");
    expect(next).toHaveAccessibleName("다음 주 W44");
    expect(nav).toHaveTextContent("이전 주 W42 — 리포트 없음");
  });

  it("공동 MVP — 큰 이름은 첫 선수 + '공동' 도장, 나머지는 dek 줄(D65 ②)", () => {
    const view = { ...VIEW, coMvp: [mvp("hwang-hee-chan", "황희찬")] };
    const { container } = render(<WeeklyHead view={view} headingId="wk-h" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "W43 공동 MVP 이재성",
    );
    expect(screen.getByText("공동")).toBeInTheDocument();
    const co = container.querySelector('[data-slot="weekly-co-mvp"]');
    expect(co).toHaveTextContent("공동 MVP황희찬");
    expect(within(co as HTMLElement).getByRole("link", { name: "황희찬" }));
  });

  it("출전 0명 — 큰 이름 대신 쪽 머리 h1 + 사실 문장", () => {
    render(
      <WeeklyHead
        view={{ ...VIEW, mvp: null, score: null }}
        headingId="wk-h"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "2026년 43주 주간 리포트",
    );
    expect(
      screen.getByText("이번 주 출전한 선수가 없어요"),
    ).toBeInTheDocument();
  });
});

describe("WeeklySummary — 문단 블록 AI 라벨(D64 ⑥)", () => {
  it("LLM 총평 — 단 머리에 'AI 작성' 한 번 + 생성 날짜", () => {
    render(
      <WeeklySummary
        summary={VIEW.summary}
        generatedAt={VIEW.generatedAt}
        headingId="s"
      />,
    );
    expect(screen.getAllByRole("link", { name: "AI 작성" })).toHaveLength(1);
    expect(screen.getByText(/11\.01 \(일\)/)).toBeInTheDocument();
  });

  it("summaryAi false(템플릿 강등) — 라벨 · 생성 날짜 없음, 문단은 그대로", () => {
    render(
      <WeeklySummary
        summary={{ text: "템플릿 문장.", ai: false }}
        generatedAt={VIEW.generatedAt}
        headingId="s"
      />,
    );
    expect(screen.queryByText("AI 작성")).toBeNull();
    expect(screen.queryByText("생성", { exact: false })).toBeNull();
    expect(screen.getByText("템플릿 문장.")).toBeInTheDocument();
  });
});

describe("BoxScore — 출전 기록 박스", () => {
  it("표(caption · th scope) · MVP 행 · 경기 줄 · 각주(표 밖 선수)", () => {
    const { container } = render(<BoxScore view={VIEW} headingId="tb" />);
    const table = screen.getByRole("table");
    expect(table).toHaveAccessibleName(/W43 한국 선수 출전 기록 — MVP 점수 순/);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      // 경기 줄 날짜 기준은 1024 이상만 보인다(lg:inline — D2 §8 #31)
      "선수 · 경기 · 경기일 기준",
      "출전",
      "분",
      "골",
      "도움",
      "점수",
    ]);
    const rows = within(table).getAllByRole("rowheader");
    expect(rows[0]).toHaveTextContent("MVP이재성");
    expect(rows[1]).toHaveTextContent("명단 제외");
    expect(rows[1]).toHaveTextContent("DFB 포칼");
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(2);
    expect(container.querySelector('[data-bar="none"]')?.className).toContain(
      "border-dashed",
    );
    expect(
      container.querySelector('[data-slot="weekly-excluded"]'),
    ).toHaveTextContent(
      "표 밖 선수 — 기록 연결 전(김지수 · 박승수), 5대 리그 밖(홍현석)",
    );
    // 집계값(골 열)은 결과 묶음이 아니다 — 가리지 않는다(D64 ④)
    expect(container.querySelector('[data-slot="result-value"]')).toBeNull();
  });
});

describe("BoxScore — 경기 줄 · 다음 순위 모양(혼합안 `.wt__ms` · `.ru` — M3-14)", () => {
  it("경기 줄은 한 줄 글자 — 대회는 평탄 탭이 아니라 글자, 상태 글자만 800(분은 400)", () => {
    const { container } = render(<BoxScore view={VIEW} headingId="tb" />);
    const lines = [
      ...container.querySelectorAll('[data-slot="weekly-match-lines"] li'),
    ];
    expect(lines.map((li) => li.textContent)).toEqual([
      "10.24 (토) 분데스 · 브레멘 · 선발 75분",
      "10.24 (토) DFB 포칼 · Stuttgart · 명단 제외",
    ]);
    expect(lines[0]?.querySelector("b")?.textContent).toBe("선발");
    // 평탄 탭(색 면) 없음 — 대회 정식 이름은 마우스 올림 설명
    expect(
      lines[0]?.querySelector('[title="분데스리가"]')?.className ?? "",
    ).toBe("");
  });

  it("다음 순위 '점'은 숫자에 붙는다(-6px) · 11.5px `--ink-2`", () => {
    const { container } = render(
      <RunnersUp rows={VIEW.runnersUp} headingId="ru" />,
    );
    const unit = container.querySelector('[data-slot="points-unit"]');
    expect(unit?.textContent).toBe("점");
    expect(unit?.className).toContain("-ml-1.5");
    expect(unit?.className).toContain("text-[11.5px]");
    expect(unit?.className).toContain("text-ink-2");
  });
});

describe("BoxScore — 경기 줄 날짜 = 경기일(UTC 날짜, D2 §8 #31 사용자 결정 2026-11-01)", () => {
  it("일요일 밤 유럽 경기(KST 월요일 새벽)도 경기일 일요일로, 시각 없이", () => {
    const row = VIEW.rows[0]!;
    const view: WeeklyReportView = {
      ...VIEW,
      rows: [
        {
          ...row,
          matches: [
            // 2026-10-25T19:30Z = KST 10.26 (월) 04:30 — 경기일은 10.25 (일)
            { ...row.matches![0]!, kickoff: "2026-10-25T19:30:00.000Z" },
          ],
        },
      ],
    };
    const { container } = render(<BoxScore view={view} headingId="tb" />);
    const time = container.querySelector(
      'tbody time[datetime="2026-10-25T19:30:00.000Z"]',
    );
    expect(time).toHaveTextContent(/^10\.25 \(일\)$/);
    expect(container).not.toHaveTextContent("10.26");
  });
});

describe("아카이브 · 빈 상태", () => {
  const ENTRY: WeeklyIndexEntry = {
    name: weekName("2026-43"),
    range: VIEW.range,
    generatedAt: VIEW.generatedAt,
    mvpName: "이재성",
    mvpCount: 1,
    points: 4,
    rows: 7,
    appeared: 5,
  };

  it("색인 행 — 주차 · 기간(경기일 기준) · MVP · 출전 수, 최신 도장", () => {
    render(<WeeklyArchiveList index={[ENTRY]} headingId="h" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/korean-players\/weekly\/2026-43\/?$/),
    );
    expect(link).toHaveTextContent("W43");
    expect(link).toHaveTextContent("최신");
    expect(link).toHaveTextContent("10.19 (월) ~ 10.25 (일)경기일 기준");
    expect(link).toHaveTextContent("MVP 이재성 · 4점");
    expect(link).toHaveTextContent("5명 출전");
  });

  it("목차 — 발행 예정 줄 + 지금 주 aria-current", () => {
    render(
      <WeeklyContents
        index={[ENTRY]}
        current="2026-43"
        upcoming={{
          name: weekName("2026-44"),
          date: "2026-11-02",
          label: "11.02 (월)",
        }}
      />,
    );
    expect(screen.getByText("발행 예정", { exact: false })).toHaveTextContent(
      "11.02 (월) 발행 예정",
    );
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(
      "W43 10.19 ~ 10.25 5 명 출전",
    );
  });

  it("빈 상태 — 사실 문장만", () => {
    render(<WeeklyEmpty />);
    expect(
      screen.getByText("첫 주간 리포트는 월요일 아침에 발행돼요."),
    ).toBeInTheDocument();
  });
});

describe("로더 — data/players/weekly", () => {
  it("폴더가 없거나 비면 발행된 주 0개", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "weekly-"));
    expect(listWeeklyWeeks(path.join(dir, "none"))).toEqual([]);
    expect(listWeeklyWeeks(dir)).toEqual([]);
    expect(loadWeeklyReport("2026-43", dir)).toBeNull();
  });

  it("주차 이름 파일만 오름차순, 이름과 week가 다르면 던진다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "weekly-"));
    mkdirSync(dir, { recursive: true });
    const base = {
      from: "2026-10-19T00:00:00.000Z",
      to: "2026-10-25T23:59:59.999Z",
      rows: [],
      mvp: null,
      summary: "s",
      summaryAi: false,
      generatedAt: "2026-11-01T00:00:00.000Z",
    };
    writeFileSync(
      path.join(dir, "2026-44.json"),
      JSON.stringify({ ...base, week: "2026-44" }),
    );
    writeFileSync(
      path.join(dir, "2026-43.json"),
      JSON.stringify({ ...base, week: "2026-43" }),
    );
    writeFileSync(
      path.join(dir, "2026-45.json"),
      JSON.stringify({ ...base, week: "2026-40" }),
    );
    writeFileSync(path.join(dir, "notes.json"), "{}");
    expect(listWeeklyWeeks(dir)).toEqual(["2026-43", "2026-44", "2026-45"]);
    expect(loadWeeklyReport("2026-43", dir)?.week).toBe("2026-43");
    expect(() => loadWeeklyReport("2026-45", dir)).toThrow(/주차와 내용 week/);
  });
});
