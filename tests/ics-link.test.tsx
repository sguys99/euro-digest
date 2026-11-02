import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IcsLink, IcsSubscribe } from "@/components/ui/ics-link";

// 공용 .ics 링크(M4-12 — `/my`(M4-08)도 쓴다). 접근 이름 = 화면 밖 대상 + 보이는 글자, 누름 영역 44px 클래스, 일반 <a>(basePath 포함).
describe("IcsLink", () => {
  it("button — 팀 티켓 '.ics 일정 구독'(§9.2 보조 버튼 작은 꼴)", () => {
    render(
      <IcsLink
        feed={{ kind: "team", team: "atletico-madrid" }}
        label=".ics 일정 구독"
        context="아틀레티코 마드리드 경기"
        variant="button"
      />,
    );
    const a = screen.getByRole("link", {
      name: "아틀레티코 마드리드 경기 .ics 일정 구독",
    });
    expect(a).toHaveAttribute(
      "href",
      "/euro-digest/calendar/atletico-madrid.ics",
    );
    expect(a).toHaveAttribute("type", "text/calendar");
    expect(a).toHaveAttribute("data-ics", "team");
    expect(a).not.toHaveAttribute("download");
    expect(a.className).toContain("min-h-11");
    expect(a.className).toContain("border-ink");
    expect(a.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("link · compact — 경기별(입장권 · 오늘 밤 · 대표팀), 44 × 44", () => {
    render(
      <>
        <IcsLink
          feed={{ kind: "match", matchId: "538001" }}
          label="캘린더에 추가 .ics"
          context="바이에른 뮌헨 대 도르트문트 경기"
        />
        <IcsLink
          feed={{ kind: "match", matchId: "538002" }}
          label=".ics"
          context="아스널 대 첼시 경기 캘린더에 추가"
          variant="compact"
        />
      </>,
    );
    const link = screen.getByRole("link", {
      name: "바이에른 뮌헨 대 도르트문트 경기 캘린더에 추가 .ics",
    });
    expect(link).toHaveAttribute(
      "href",
      "/euro-digest/calendar/match/538001.ics",
    );
    const compact = screen.getByRole("link", {
      name: "아스널 대 첼시 경기 캘린더에 추가 .ics",
    });
    for (const a of [link, compact]) {
      expect(a.className).toContain("min-h-11");
      expect(a.className).toContain("min-w-11");
      expect(a).toHaveAttribute("data-ics", "match");
    }
  });
});

describe("IcsSubscribe — 구독형 캘린더(webcal + https 병기, M4-16 사용자 결정)", () => {
  it("팀 — webcal 구독 링크(버튼 꼴) + '.ics 받기'(https · text/calendar), 접근 이름 = 대상 + 보이는 글자", () => {
    render(
      <IcsSubscribe
        feed={{ kind: "team", team: "liverpool" }}
        label="일정 구독"
        context="리버풀 경기"
        variant="button"
      />,
    );
    const sub = screen.getByRole("link", { name: "리버풀 경기 일정 구독" });
    expect(sub).toHaveAttribute(
      "href",
      "webcal://sguys99.github.io/euro-digest/calendar/liverpool.ics",
    );
    expect(sub).toHaveAttribute("data-ics-mode", "webcal");
    expect(sub.className).toContain("min-h-11");
    const file = screen.getByRole("link", { name: "리버풀 경기 .ics 받기" });
    expect(file).toHaveAttribute("href", "/euro-digest/calendar/liverpool.ics");
    expect(file).toHaveAttribute("type", "text/calendar");
    expect(file.className).toContain("min-h-11");
  });
});
