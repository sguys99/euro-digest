/**
 * 팀 페이지 '더 읽을거리' 제목 `lang`(src/lib/reading.ts — FR-57 · WCAG 3.1.2, M3 이월). 렌더는 tests/team-page.test.tsx.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analysisLangs,
  looksDutch,
  readingTitleLang,
  readingView,
} from "@/lib/reading";
import { SourcesFileSchema, type Source } from "@/lib/schema/source";

const SOURCES = SourcesFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("configs/sources.json"), "utf8")),
);

function source(over: Partial<Source> & Pick<Source, "id" | "name">): Source {
  return {
    type: "analysis",
    url: `https://example.com/${over.id}.xml`,
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 3,
    competitions: [],
    terms_checked: true,
    robots_checked: true,
    ...over,
  };
}

describe("looksDutch — 네덜란드어 기능어", () => {
  it("fixtures/analysis의 네덜란드어 제목은 nl, 영어 제목은 아니다", () => {
    expect(looksDutch("PSV onder Bosz: hoe de opbouw verandert")).toBe(true);
    expect(looksDutch("Waarom zonedekking terugkomt")).toBe(true);
    for (const title of [
      "Man for Man: How Brighton’s Press Suffocated Arsenal",
      "Access, Not Chances: How Como Took Manchester United Apart – LC",
      "Aspect analysis: Leipzig never found a trigger – LC",
      "Bayern – Dortmund: Kompany’s pressing traps against Kovač’s back three",
      "Positional play in the modern game – part 3",
    ]) {
      expect(looksDutch(title)).toBe(false);
    }
  });

  it("이름에 붙는 de·van·ten·der는 근거로 삼지 않는다", () => {
    expect(looksDutch("De Zerbi’s Marseille and van Dijk’s Liverpool")).toBe(
      false,
    );
    expect(looksDutch("Ten Hag and the Van der Sar years")).toBe(false);
  });
});

describe("readingTitleLang · readingView", () => {
  it("영문 피드의 네덜란드어 제목만 nl, 그 밖은 피드 언어", () => {
    expect(readingTitleLang("Waarom zonedekking terugkomt", "en")).toBe("nl");
    expect(readingTitleLang("Arsenal’s rest-defence", "en")).toBe("en");
    expect(readingTitleLang("Wie Leipzig presst", "de")).toBe("de");
  });

  it("매체명(publisherNameOf)으로 피드 언어를 찾고, 없으면 en — 항목은 그대로", () => {
    const sources = [
      source({ id: "rss", name: "News — Football", type: "rss", lang: "fr" }),
      source({ id: "blog", name: "Blog — Deutsch", lang: "de" }),
    ];
    expect(analysisLangs(sources)).toEqual(new Map([["Blog", "de"]]));
    const items = [
      {
        title: "Wie Leipzig presst",
        url: "https://example.com/1",
        source: "Blog",
      },
      {
        title: "PSV onder Bosz",
        url: "https://example.com/2",
        source: "Unknown",
      },
    ];
    expect(readingView(items, sources)).toEqual([
      { ...items[0], lang: "de" },
      { ...items[1], lang: "nl" },
    ]);
  });

  it("실제 설정: Spielverlagerung = en", () => {
    expect(analysisLangs(SOURCES).get("Spielverlagerung")).toBe("en");
  });
});
