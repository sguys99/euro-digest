import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  MinutesGutter,
  ResultCell,
} from "@/components/korean-players/player-marks";
import {
  ROSTER_TABLE_ID,
  RosterContents,
  RosterTable,
} from "@/components/korean-players/roster";
import type { RosterView } from "@/lib/korean-players-view";

// 한국 선수 목록 표(M3-09 — DESIGN §9.3 D2 선수 명단 행 · 결과 칸 · 출전 분 거터). 서버 컴포넌트 렌더 + 보기 탭 섬.

const TEAM = {
  slug: "bayern-munchen",
  name: "바이에른 뮌헨",
  latin: false,
  short: "FCB",
  colors: ["#DC052D", "#FFFFFF"] as const,
  page: true,
};

const VIEW: RosterView = {
  since: "2026-10-19",
  sinceLabel: "10월 19일 이후 집계",
  generatedAt: "2026-11-01T04:17:30.987Z",
  counts: { total: 2, linked: 1 },
  groups: [
    {
      key: "BUNDESLIGA",
      anchor: "kp-bundesliga",
      label: "분데스리가",
      short: "분데스",
      rows: [
        {
          slug: "kim-min-jae",
          nameKo: "김민재",
          position: "DF",
          team: TEAM,
          state: "linked",
          appearance: {
            text: "90",
            tone: "on",
            label: "선발",
            strong: true,
            sr: "선발 90분",
          },
          recent: {
            kickoff: "2026-10-31T17:30:00.000Z",
            comp: {
              kind: "comp",
              comp: "BUNDESLIGA",
              short: "분데스",
              name: "분데스리가",
            },
            opponent: {
              name: "도르트문트",
              latin: false,
              badge: { name: "도르트문트", short: "BVB", colors: null },
            },
            home: true,
            result: { outcome: "D", for: 2, against: 2, pens: null },
            goals: 0,
            assists: 0,
          },
          season: { apps: 2, minutes: 135, goals: 0, assists: 0 },
          ucl: { apps: 1, minutes: 45 },
          next: null,
          sinceNote: null,
          noMatches: false,
        },
      ],
    },
    {
      key: "OTHER",
      anchor: "kp-other",
      label: "기타 리그",
      short: "기타",
      rows: [
        {
          slug: "hong-hyun-seok",
          nameKo: "홍현석",
          position: "MF",
          team: {
            ...TEAM,
            slug: "midtjylland",
            name: "미트윌란",
            colors: null,
            short: "",
            page: false,
          },
          state: "other",
          appearance: {
            text: "–",
            tone: "null",
            label: "갱신 중단",
            strong: false,
            sr: "기록 갱신 중단",
          },
          recent: null,
          season: null,
          ucl: null,
          next: null,
          sinceNote: null,
          noMatches: false,
        },
      ],
    },
  ],
};

describe("결과 칸 — 스코어 맥락 규칙(D64 ③)", () => {
  it("칩 + 소속팀 득점 먼저 + 홈/원정, 결과 값 묶음과 홈/원정 글자는 나뉜다(M4-15 결과 가리기 대상)", () => {
    const { container } = render(
      <ResultCell
        result={{ outcome: "W", for: 6, against: 1, pens: null }}
        home
        goals={1}
        assists={2}
      />,
    );
    const values = container.querySelectorAll('[data-slot="result-value"]');
    expect(values).toHaveLength(2); // 칩·스코어 · 골·도움 배지
    expect(values[0]?.textContent).toBe("W승 6-대1");
    expect(container.textContent).toContain("홈");
    expect([...values].some((v) => v.textContent?.includes("홈"))).toBe(false);
    expect(values[1]?.textContent).toBe("1골2도움");
  });

  it("승부차기 — 무 칩 + 정규·연장 스코어 + '승부차기 4–3'(소속팀 먼저, 화면 밖 '대')", () => {
    const { container } = render(
      <ResultCell
        result={{
          outcome: "D",
          for: 1,
          against: 1,
          pens: { for: 4, against: 3 },
        }}
        home={false}
        goals={0}
        assists={null}
      />,
    );
    const values = container.querySelectorAll('[data-slot="result-value"]');
    expect(values).toHaveLength(2);
    expect(values[1]?.textContent).toBe("승부차기 4–대3");
    expect(container.textContent).toContain("원정");
    expect(container.querySelector('[data-outcome="D"]')).not.toBeNull();
  });

  it("결과 정보가 없으면 '결과 없음'(값을 지어내지 않는다)", () => {
    render(<ResultCell result={null} home goals={0} assists={0} />);
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
  });
});

describe("출전 분 거터", () => {
  it("숫자·상태 글자는 장식, 화면 밖 '{상태} {n}분' — 윤곽(0)은 data-tone=zero", () => {
    const { container } = render(
      <MinutesGutter
        appearance={{
          text: "0",
          tone: "zero",
          label: "미출전",
          strong: false,
          sr: "미출전 0분",
        }}
      />,
    );
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect([...hidden].map((n) => n.textContent)).toEqual(["0", "미출전"]);
    expect(container.querySelector('[data-tone="zero"]')?.className).toContain(
      "text-transparent",
    );
    expect(screen.getByText("미출전 0분")).toHaveClass("sr-only");
  });
});

describe("명단 표", () => {
  it("표 한 장 — caption · 선수 칸 th[scope=row] · 리그 구간 머리(rowgroup, 앵커) · 선수 이름은 상세 링크(M3-10)", () => {
    render(<RosterTable view={VIEW} headingId="kp-h" />);
    const table = screen.getByRole("table");
    expect(table.id).toBe(ROSTER_TABLE_ID);
    expect(table.querySelector("caption")?.textContent).toContain(
      "결과는 그 선수 소속팀 득점이 먼저",
    );
    const rowHeads = table.querySelectorAll('th[scope="row"]');
    expect(rowHeads).toHaveLength(2);
    expect(
      within(rowHeads[0] as HTMLElement)
        .getByRole("link", { name: "김민재" })
        .getAttribute("href"),
    ).toMatch(/^\/korean-players\/kim-min-jae\/?$/);
    // 소속팀은 글자(M3-10 — 이름 링크와 누름 영역이 겹친다) — 행마다 링크는 선수 이름 하나
    for (const head of rowHeads) {
      expect(within(head as HTMLElement).getAllByRole("link")).toHaveLength(1);
    }
    const groups = table.querySelectorAll('th[scope="rowgroup"]');
    expect([...groups].map((g) => g.id)).toEqual(["kp-bundesliga", "kp-other"]);
    expect(groups[1]?.textContent).toContain("5대 리그 밖 — 기록 갱신 중단");
    // 기타 리그 행 — 갱신 중단 도장, 다음 경기 대시 + 화면 밖 글자
    expect(screen.getAllByText("갱신 중단").length).toBeGreaterThan(0);
    for (const el of screen.getAllByText("기록 갱신 중단")) {
      expect(el).toHaveClass("sr-only");
    }
    // 시즌 누적 열 묶음 머리 — 집계 시작일
    expect(table.textContent).toContain("10.19부터");
  });

  it("보기 탭(1023 이하) — 처음은 최근 경기, 탭을 바꾸면 감싼 요소의 data-roster-view만 바뀐다(표는 그대로)", () => {
    const { container } = render(<RosterTable view={VIEW} headingId="kp-h" />);
    const wrap = () =>
      container.querySelector<HTMLElement>('[data-slot="roster-view"]');
    expect(wrap()?.dataset.rosterView).toBe("recent");
    expect(wrap()?.hasAttribute("data-in")).toBe(false);
    // happy-dom은 <noscript> 스타일(JS 없을 때 탭 숨김)을 적용한다 — 숨은 요소까지 찾는다
    const tabs = screen.getAllByRole("tab", { hidden: true });
    expect(tabs.map((t) => t.textContent)).toEqual([
      "최근 경기",
      "시즌 누적",
      "다음 경기",
    ]);
    expect(
      tabs.every((t) => t.getAttribute("aria-controls") === ROSTER_TABLE_ID),
    ).toBe(true);
    fireEvent.click(tabs[1]!);
    expect(wrap()?.dataset.rosterView).toBe("season");
    expect(wrap()?.hasAttribute("data-in")).toBe(true);
    expect(screen.getAllByRole("tab", { hidden: true })[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // 열 묶음 표식 — 시즌 누적 칸 4 + 머리 4
    expect(
      container.querySelectorAll('[data-col="season"]').length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("목차 — 리그 구간 앵커 · 인원 · 집계 시작 안내", () => {
    render(<RosterContents view={VIEW} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#kp-bundesliga",
      "#kp-other",
    ]);
    // 평탄 탭 약칭은 장식(aria-hidden) — 이름은 정식 리그명 + 인원
    expect(links[0]?.textContent).toBe("분데스분데스리가1명");
    expect(links[0]?.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "분데스",
    );
    expect(
      screen.getByText("10월 19일 이후 집계 — 그 전 경기는 기록에 없어요"),
    ).toBeInTheDocument();
  });

  it("목차 아래 묶음 — '주간 리포트' · '대표팀' 행(M3-12 · M3-13), 값이 없으면 글자", () => {
    const { container, rerender } = render(
      <RosterContents
        view={VIEW}
        weekly={{ latest: "W43" }}
        national={{ label: "11월 소집" }}
      />,
    );
    // next/link는 테스트 환경에서 끝 슬래시를 붙이지 않는다(빌드 결과는 trailingSlash — e2e가 본다)
    const links = screen.getAllByRole("link").slice(2);
    expect(links.map((a) => [a.getAttribute("href"), a.textContent])).toEqual([
      ["/korean-players/weekly", "주간 리포트W43"],
      ["/national-team", "대표팀11월 소집"],
    ]);
    // 주간 행 바로 아래 이어 붙는다(위 선 없음 — 주간 행 아래 선을 같이 쓴다)
    expect(links[1]?.className).not.toContain("border-t");
    expect(
      container.querySelector('[data-slot="roster-national-link"]')?.className,
    ).toBeFalsy();
    rerender(<RosterContents view={VIEW} national={{ label: null }} />);
    const national = screen.getByRole("link", { name: /대표팀/ });
    expect(national).toHaveTextContent("대표팀A매치 일정");
    expect(national.className).toContain("border-t");
  });
});
