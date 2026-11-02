import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RSS_MIME, rssFeedLink, rssFeedTitle } from "@/lib/feed-links";
import { createPaths, rssUrl, type RssFeed } from "@/lib/paths";
import { CompetitionsFileSchema } from "@/lib/schema/configs";
import { pageMetadata } from "@/lib/seo";

import { channelMeta } from "../scripts/lib/site-rss";

// RSS 자동 발견(M4-11 이월 · M4-12 — PRD FR-122). 피드 이름은 채널 제목과 같고, 대회 · 한국 선수 페이지 메타가 alternates.types로 낸다.
const comps = CompetitionsFileSchema.parse(
  JSON.parse(readFileSync("configs/competitions.json", "utf8")),
);
const nameOf = (id: string) => comps.find((c) => c.id === id)?.nameKo ?? null;
const PATHS = createPaths({ basePath: "/euro-digest", siteUrl: undefined });

describe("rssFeedTitle — 채널 제목과 같은 이름", () => {
  const feeds: RssFeed[] = [
    { kind: "all" },
    { kind: "korean" },
    ...comps.map((c) => ({ kind: "competition" as const, comp: c.id })),
  ];
  for (const feed of feeds) {
    it(`${JSON.stringify(feed)}`, () => {
      const name = feed.kind === "competition" ? nameOf(feed.comp) : null;
      expect(rssFeedTitle(feed, name)).toBe(
        channelMeta(feed, PATHS, nameOf).title,
      );
    });
  }

  it("예: 전체 · 대회 · 한국 선수", () => {
    expect(rssFeedTitle({ kind: "all" })).toBe("유로 다이제스트");
    expect(
      rssFeedTitle({ kind: "competition", comp: "EPL" }, "프리미어리그"),
    ).toBe("유로 다이제스트 — 프리미어리그");
    expect(rssFeedTitle({ kind: "korean" })).toBe(
      "유로 다이제스트 — 한국 선수",
    );
  });
});

describe("pageMetadata({ feeds }) — 자동 발견 링크", () => {
  it("feeds를 주면 canonical과 함께 alternates.types[application/rss+xml]로(절대 URL · 이름)", () => {
    const meta = pageMetadata({
      title: "프리미어리그 2026-27 시즌",
      description: "설명",
      canonical: "/competitions/epl/",
      feeds: [
        rssFeedLink({ kind: "competition", comp: "EPL" }, "프리미어리그"),
      ],
    });
    expect(meta.alternates).toEqual({
      canonical: "https://sguys99.github.io/euro-digest/competitions/epl/",
      types: {
        [RSS_MIME]: [
          {
            url: rssUrl({ kind: "competition", comp: "EPL" }),
            title: "유로 다이제스트 — 프리미어리그",
          },
        ],
      },
    });
    expect(rssUrl({ kind: "competition", comp: "EPL" })).toBe(
      "https://sguys99.github.io/euro-digest/rss/epl.xml",
    );
  });

  it("feeds가 없으면 types 없음(전체 피드는 레이아웃 <head>), canonical도 없으면 alternates 자체가 없다", () => {
    expect(
      pageMetadata({ title: "x", description: "y", canonical: "/about/" })
        .alternates,
    ).toEqual({
      canonical: "https://sguys99.github.io/euro-digest/about/",
    });
    expect(
      pageMetadata({ title: "x", description: "y", canonical: null })
        .alternates,
    ).toBeUndefined();
  });
});
