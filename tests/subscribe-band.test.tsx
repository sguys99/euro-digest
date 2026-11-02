import { readFileSync } from "node:fs";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubscribeBand } from "@/components/shell/subscribe-band";
import { CompetitionsFileSchema } from "@/lib/schema/configs";

// 뒤표지 '구독' 단(M4-12 · M4-11 이월 — PRD FR-122 · FR-123, DECISIONS M4 미니 게이트 #6). 빌드 결과(파일 200 · 폭별 배치)는 e2e.
const comps = CompetitionsFileSchema.parse(
  JSON.parse(readFileSync("configs/competitions.json", "utf8")),
);

describe("SubscribeBand", () => {
  it("머리 '구독' · RSS 전체 · 한국 선수 · 대회별 6개(설정 순서) · 한국 선수 소속팀 캘린더(구독 · .ics 받기) · 안내 1줄", () => {
    render(<SubscribeBand />);
    const band = screen.getByRole("region", { name: "구독" });
    const rows = within(band).getAllByRole("listitem");
    expect(rows.map((r) => r.firstElementChild!.textContent)).toEqual([
      "RSS",
      "대회별",
      "캘린더",
    ]);
    const links = within(band).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["전체 소식 RSS", "/euro-digest/rss.xml"],
      ["한국 선수 RSS", "/euro-digest/rss/korean.xml"],
      ...comps.map((c) => [
        `${c.shortKo} RSS`,
        `/euro-digest/rss/${c.id.toLowerCase()}.xml`,
      ]),
      // 구독형 캘린더 = webcal 구독 + https 파일 병기(2026-11-02 사용자 결정, M4-16)
      [
        "한국 선수 소속팀 경기 구독",
        "webcal://sguys99.github.io/euro-digest/calendar/korean.ics",
      ],
      ["한국 선수 소속팀 경기 .ics 받기", "/euro-digest/calendar/korean.ics"],
    ]);
    // RSS 링크는 type 표기, 대회 링크는 정식 이름 title
    for (const a of links.slice(0, 8)) {
      expect(a.getAttribute("type")).toBe("application/rss+xml");
    }
    expect(links[2]!.getAttribute("title")).toBe(`${comps[0]!.nameKo} RSS`);
    expect(band.textContent).toContain("RSS는 리더에 주소를 붙여 넣어요.");
    // 결과 가리기 범위 안내(M4-16 리뷰)
    expect(band.textContent).toContain(
      "RSS에는 결과 가리기가 적용되지 않아요 (캘린더에는 스코어가 없어요).",
    );
  });
});
