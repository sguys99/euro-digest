/**
 * M5-17 — 홈 5줄 S4 가족 렌더(src/components/brief/today-brief.tsx `BriefRest` — DESIGN §9.3 D3 "S4 가족", DECISIONS D3 #11 · #12).
 * 같은 틀(위아래 괘선 · 거터 레드 윤곽 0 · "오늘은 5줄을 쉽니다") 안에서 이유 블록만 바뀌는지, A매치 휴식기 변형의 표기(도장 · 기간 · 경기 —
 * 끝남 · 시각 미정)와 **결과 노출 0**, 앵커 링크 조건을 본다. 판정 자체는 tests/brief-empty.test.ts.
 * 대표팀 설정은 합성 값으로 바꾼다(configs/national-team.json이 바뀌어도 흔들리지 않게).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TodayBrief } from "@/components/brief/today-brief";
import { BriefFileSchema } from "@/lib/schema/brief";
import { NationalTeamFileSchema } from "@/lib/schema/configs";

// 동결한 2026-27 대회 설정(시즌 전환과 무관 — tests/support/season-2026.ts, /new-season T)
vi.mock("@/lib/data/competitions", async (importOriginal) =>
  (await import("./support/season-2026")).season2026CompetitionsModule(
    importOriginal,
  ),
);

const NATIONAL = NationalTeamFileSchema.parse({
  matches: [
    {
      id: "2026-11-13-saudi-arabia",
      kickoff: "2026-11-13T14:30:00.000Z",
      opponent: "사우디아라비아",
      home: false,
      competition: "친선경기",
      status: "finished",
      // 결과가 적혀 있어도 5줄 자리에는 나오지 않는다 — 다른 숫자와 겹치지 않는 값
      result: { kor: 9, opp: 9 },
    },
    {
      id: "2026-11-17-qatar",
      kickoff: "2026-11-17T00:00:00.000Z",
      kickoffTbd: true,
      opponent: "카타르",
      home: true,
      competition: "친선경기",
      status: "scheduled",
      result: null,
    },
  ],
});

vi.mock("@/lib/data/national-team", () => ({
  loadNationalTeamConfig: () => NATIONAL,
}));

const emptyBrief = BriefFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/brief-empty.json"), "utf8")),
);
/** 11-15 07:00 KST 발행 빌드 — 11-13 경기는 끝남, 11-17은 아직(시각 미정) */
const NOW = new Date("2026-11-14T22:00:00.000Z");
const intlBrief = { ...emptyBrief, date: "2026-11-15" };

function rest(): HTMLElement {
  return screen
    .getByRole("region", { name: "오늘의 5줄" })
    .querySelector("[data-slot=brief-rest]") as HTMLElement;
}

describe("S4 가족 ② A매치 휴식기(홈)", () => {
  it("같은 틀 + 이유 1줄 → 도장 'A매치 기간' + 기간(화면 밖 '부터 · 까지') → 경기 목록(킥오프 순) → A매치 섹션으로 ↓ · 주요 뉴스로 ↓", () => {
    render(<TodayBrief brief={intlBrief} now={NOW} nationalHref="#national" />);
    const el = rest();
    expect(el).toHaveAttribute("data-rest", "international");
    expect(el.querySelector(":scope > [aria-hidden=true]")).toHaveTextContent(
      "0",
    );
    expect(el).toHaveTextContent("오늘은 5줄을 쉽니다");
    expect(el).toHaveTextContent("끝난 경기가 없었습니다.");
    const intl = el.querySelector("[data-slot=brief-intl]") as HTMLElement;
    expect(intl.className).toContain("border-dotted");
    expect(intl).toHaveTextContent("A매치 기간");
    expect(intl).toHaveTextContent("11.10 – 11.20");
    expect(intl).toHaveTextContent("11월 10일부터 11월 20일까지");
    const list = within(intl).getByRole("list", {
      name: "A매치 기간 경기 — 킥오프 순",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const links = within(el).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["A매치 섹션으로↓", "#national"],
      ["주요 뉴스로↓", "#news"],
    ]);
    // 원인 서술 없음 — S4 문장 + 도장 + 기간뿐
    expect(el).not.toHaveTextContent("쉰다");
  });

  it("끝난 경기 = 날짜 --ink-2 + '끝남', 스코어 없음(결과 노출 0) · 아직인 경기 = 날짜 --ink · 시각 미정이면 '시각 미정'", () => {
    render(<TodayBrief brief={intlBrief} now={NOW} />);
    const [done, next] = within(rest()).getAllByRole("listitem");
    expect(done).toHaveAttribute("data-past", "true");
    expect(done?.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-11-13T14:30:00.000Z",
    );
    const doneDate = done?.querySelector("time [aria-hidden]");
    expect(doneDate).toHaveTextContent("11.13");
    expect(doneDate?.className).toContain("text-num-n2");
    expect(doneDate?.className).toContain("text-ink-2");
    expect(done).toHaveTextContent("11월 13일(금) 23:30 KST · 끝남");
    expect(done).toHaveTextContent("사우디아라비아원정 · 친선경기");
    expect(next).toHaveAttribute("data-past", "false");
    expect(next?.querySelector("time [aria-hidden]")?.className).toMatch(
      /\btext-ink\b/,
    );
    expect(next).toHaveTextContent("(화) 시각 미정");
    expect(next).not.toHaveTextContent("KST");
    expect(next).not.toHaveTextContent("끝남");
    expect(next).toHaveTextContent("카타르홈 · 친선경기");
    // 결과 노출 0 — 설정의 결과(9:9)가 블록 어디에도 없다
    const block = screen.getByRole("region", { name: "오늘의 5줄" });
    expect(block.textContent).not.toMatch(/9/);
  });

  it("홈 A매치 섹션을 그리지 않은 빌드(nationalHref 없음)는 'A매치 섹션으로' 링크를 싣지 않는다(빈 앵커 금지)", () => {
    render(<TodayBrief brief={intlBrief} now={NOW} />);
    expect(
      within(rest()).queryByRole("link", { name: /A매치 섹션으로/ }),
    ).toBeNull();
    expect(
      within(rest()).getByRole("link", { name: "주요 뉴스로" }),
    ).toHaveAttribute("href", "#news");
  });

  it("날짜 아카이브(이날의 5줄)는 A매치 기간이어도 경기 없음 그대로 · 결과 지연은 오류 상자", () => {
    const { unmount } = render(
      <TodayBrief brief={intlBrief} now={NOW} variant="issue" />,
    );
    const el = screen
      .getByRole("region", { name: "이날의 5줄" })
      .querySelector("[data-slot=brief-rest]");
    expect(el).toHaveAttribute("data-rest", "rest");
    expect(el?.querySelector("[data-slot=brief-intl]")).toBeNull();
    unmount();
    render(
      <TodayBrief
        brief={{ ...intlBrief, emptyReason: "results-pending" }}
        now={NOW}
      />,
    );
    expect(document.querySelector("[data-slot=brief-pending]")).not.toBeNull();
    expect(document.querySelector("[data-slot=brief-intl]")).toBeNull();
  });

  it("A매치 기간 밖(시즌 중) 경기 없는 날은 ① 경기 없음 — 이유 1줄 + 주요 뉴스로 ↓만", () => {
    render(
      <TodayBrief brief={emptyBrief} now={NOW} nationalHref="#national" />,
    );
    const el = rest();
    expect(el).toHaveAttribute("data-rest", "rest");
    expect(el.querySelector("[data-slot=brief-intl]")).toBeNull();
    expect(within(el).getAllByRole("link")).toHaveLength(1);
  });
});
