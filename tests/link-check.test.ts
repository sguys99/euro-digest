// scripts/lib/link-check.ts — 링크 형식 검사 (M1-25, FR-153) + 정규화(normalize.ts)와 같은 판정
import { describe, expect, it } from "vitest";

import { HttpUrlSchema } from "@/lib/schema";

import {
  LINK_MAX_LENGTH,
  LINK_PROBLEM_MESSAGES,
  linkFormatProblem,
} from "../scripts/lib/link-check";
import { normalizeFeedItem } from "../scripts/lib/normalize";

describe("linkFormatProblem", () => {
  it.each([
    "https://www.bbc.co.uk/sport/football/articles/cmkgq1dz5keko?at_medium=RSS&at_campaign=rss",
    "https://www.interfootball.co.kr/news/articleView.html?idxno=696262",
    "https://www.relevo.com/futbol/copa-sudamericana/montevideo-city-torque-historia-mineiro.html",
    "https://medium.com/@writer/post-1", // 경로의 @는 사용자 정보가 아니다
    "https://example.com/한글-경로#frag",
    "http://example.com:8080/a",
  ])("실데이터·정상 링크는 문제 없음: %s", (url) => {
    expect(linkFormatProblem(url)).toBeNull();
  });

  it.each([
    ["https://a.com/b c", "whitespace"],
    ["https://a.com/b\u00a0c", "whitespace"], // NBSP
    ["https://a.com/b\tc", "whitespace"],
    ["https://a.com/b\u0000c", "control"],
    ["https://a.com/b\u0085c", "control"], // NEL(C1)은 JS \s가 아니라 제어 문자
    ["https://a.com/b\u0090c", "control"], // C1
    ["https://a.com/b\u007fc", "control"], // DEL
    ["https://a.com/b\u200bc", "invisible"], // 폭 없는 공백
    ["https://a.com/b\u202ec", "invisible"], // 방향 제어(RLO)
    ["https://a.com\\@evil.example/", "backslash"],
    ["https://www.bbc.co.uk@evil.example/x", "userinfo"],
    ["https://user:pw@a.com/x", "userinfo"],
    [`https://a.com/${"a".repeat(LINK_MAX_LENGTH)}`, "too-long"],
  ] as const)("%j → %s", (url, problem) => {
    expect(linkFormatProblem(url)).toBe(problem);
  });

  it("스키마(z.httpUrl)는 위 값 대부분을 통과시킨다 — 그래서 게이트가 따로 본다", () => {
    for (const url of [
      "https://a.com/b c",
      "https://a.com/b\u0000c",
      "https://www.bbc.co.uk@evil.example/x",
      "https://a.com/b\u200bc",
    ]) {
      expect(HttpUrlSchema.safeParse(url).success).toBe(true);
      expect(linkFormatProblem(url)).not.toBeNull();
    }
  });

  it("문제마다 설명이 있다(링크 값은 넣지 않는다)", () => {
    for (const message of Object.values(LINK_PROBLEM_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/https?:/);
    }
  });
});

describe("normalize.ts — 같은 판정으로 피드 항목을 건너뛴다(게이트와 어긋나지 않게)", () => {
  const source = { id: "bbc-sport-football", lang: "en" };
  const raw = (link: string) => ({
    title: "Title",
    link,
    pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
    authors: [],
  });

  it.each([
    "https://a.com/b c",
    "https://www.bbc.co.uk@evil.example/x",
    "https://a.com/b\u200bc",
  ])("형식 문제가 있는 링크는 bad-link: %j", (link) => {
    expect(normalizeFeedItem(raw(link), source)).toEqual({
      ok: false,
      reason: "bad-link",
    });
  });

  it("앞뒤 공백은 정리하고 통과한다(무수정 원칙의 정리 범위)", () => {
    const result = normalizeFeedItem(raw("  https://example.com/a  "), source);
    expect(result).toMatchObject({
      ok: true,
      item: { url: "https://example.com/a" },
    });
  });
});
