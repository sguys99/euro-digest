/**
 * `/about` 화면 모델 (M1-36 — PRD FR-140·§15 D26, src/lib/about.ts) — 계절별 발행 시각표와 지금 싣는 매체 목록.
 * 렌더 결과는 tests/about-page.test.tsx, 폭별 배치·앵커 이동은 tests/e2e/about.spec.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { planDailySources } from "../scripts/lib/sources";
import { publisherNameOf as scriptsPublisherNameOf } from "../scripts/lib/publisher-name";
import {
  feedLabelOf,
  isDailyFeed,
  outletCountByTier,
  outletsFrom,
  publishSchedule,
  seasonSpanOf,
} from "@/lib/about";
import { ABOUT_SECTIONS, aboutHref } from "@/lib/about-sections";
import { issueFormUrl } from "@/lib/paths";
import { publisherNameOf } from "@/lib/publisher-name";
import { SourcesFileSchema, type Source } from "@/lib/schema/source";
import { REPO_URL } from "@/lib/site";
import { PUBLISH_TIMES_KST, publishSeason, shiftDate } from "@/lib/time";

const SOURCES = SourcesFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("configs/sources.json"), "utf8")),
);

function source(over: Partial<Source> & Pick<Source, "id" | "name">): Source {
  return {
    type: "rss",
    url: `https://example.com/${over.id}.xml`,
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 2,
    competitions: [],
    terms_checked: true,
    robots_checked: true,
    ...over,
  };
}

describe("seasonSpanOf · publishSchedule — 계절별 발행 시각(D26)", () => {
  it("전환 일요일 아침 호는 전환 전 계절, 다음 날(월) 호부터 새 계절", () => {
    expect(seasonSpanOf("2026-10-19")).toEqual({
      season: "summer",
      publish: "07:00",
      from: "2026-03-30",
      to: "2026-10-25",
    });
    expect(seasonSpanOf("2026-10-25").season).toBe("summer");
    expect(seasonSpanOf("2026-10-26")).toEqual({
      season: "winter",
      publish: "07:30",
      from: "2026-10-26",
      to: "2027-03-28",
    });
    // 1~3월(그해 서머타임 앞)은 지난해 10월 전환 다음 날부터
    expect(seasonSpanOf("2027-02-01")).toEqual({
      season: "winter",
      publish: "07:30",
      from: "2026-10-26",
      to: "2027-03-28",
    });
    expect(seasonSpanOf("2027-03-29").from).toBe("2027-03-29");
  });

  it("2025~2030년 모든 날: 구간이 그 날을 품고, 구간 안은 같은 계절, 양 끝 바깥은 다른 계절(publishSeason과 일치)", () => {
    for (
      let date = "2025-01-01";
      date <= "2030-12-31";
      date = shiftDate(date, 1)
    ) {
      const span = seasonSpanOf(date);
      expect(span.season).toBe(publishSeason(date));
      expect(span.publish).toBe(PUBLISH_TIMES_KST[span.season].publish);
      expect(span.from <= date && date <= span.to).toBe(true);
      expect(publishSeason(span.from)).toBe(span.season);
      expect(publishSeason(span.to)).toBe(span.season);
      expect(publishSeason(shiftDate(span.from, -1))).not.toBe(span.season);
      expect(publishSeason(shiftDate(span.to, 1))).not.toBe(span.season);
    }
  });

  it("시각표 = 지금 계절 + 바로 다음 계절(시간 순)", () => {
    const schedule = publishSchedule("2026-10-19");
    expect(schedule.current.season).toBe("summer");
    expect(schedule.next).toEqual({
      season: "winter",
      publish: "07:30",
      from: "2026-10-26",
      to: "2027-03-28",
    });
    const winter = publishSchedule("2026-12-01");
    expect(winter.current.season).toBe("winter");
    expect(winter.next.season).toBe("summer");
    expect(winter.next.from).toBe("2027-03-29");
    expect(winter.next.publish).toBe("07:00");
  });
});

describe("outletsFrom — 지금 싣는 매체(configs/sources.json)", () => {
  it("파이프라인 일일 수집 대상(planDailySources().feeds)과 같은 소스를 카드와 같은 매체명으로 묶는다", () => {
    const feeds = planDailySources(SOURCES).feeds;
    expect(SOURCES.filter(isDailyFeed).map((s) => s.id)).toEqual(
      feeds.map((s) => s.id),
    );
    const names = [...new Set(feeds.map(scriptsPublisherNameOf))];
    expect(
      outletsFrom(SOURCES)
        .map((o) => o.name)
        .sort(),
    ).toEqual(names.sort());
  });

  it("꺼진 소스·약관 미확인 소스·검색형은 싣지 않는다", () => {
    const names = outletsFrom(SOURCES).map((o) => o.name);
    for (const s of SOURCES) {
      if (!s.enabled || !s.terms_checked || s.type === "search") {
        // 같은 매체의 다른 피드가 실리는 경우(예: 인터풋볼)는 매체명이 남을 수 있다
        const sibling = SOURCES.some(
          (o) => isDailyFeed(o) && publisherNameOf(o) === publisherNameOf(s),
        );
        if (!sibling) expect(names).not.toContain(publisherNameOf(s));
      }
    }
  });

  it("같은 매체 피드는 한 줄 — 피드 이름(섹션·괄호 설명), Tier 중복 없이 오름차순, 순서는 Tier → 설정 순", () => {
    const outlets = outletsFrom([
      source({ id: "c-a", name: "C — 전체", lang: "ko", tier: 3 }),
      source({ id: "a-1", name: "A Sport — Football" }),
      source({ id: "a-2", name: "A Sport — League", tier: 1 }),
      source({ id: "b", name: "B Briefing (Writer)" }),
      source({ id: "off", name: "Off — X", enabled: false }),
      source({ id: "terms", name: "Terms — X", terms_checked: false }),
      source({ id: "search", name: "Search — X", type: "search" }),
      source({ id: "c-b", name: "C — 해외", lang: "ko", tier: 3 }),
    ]);
    expect(outlets).toEqual([
      {
        name: "A Sport",
        lang: "en",
        region: "overseas",
        tiers: [1, 2],
        feeds: ["Football", "League"],
      },
      {
        name: "B Briefing",
        lang: "en",
        region: "overseas",
        tiers: [2],
        feeds: ["Writer"],
      },
      {
        name: "C",
        lang: "ko",
        region: "domestic",
        tiers: [3],
        feeds: ["전체", "해외"],
      },
    ]);
    expect(outletCountByTier(outlets)).toEqual({ 1: 1, 2: 1, 3: 1 });
  });

  it("feedLabelOf — 섹션 > 괄호 설명 > 없음", () => {
    expect(feedLabelOf({ name: "BBC Sport — Premier League" })).toBe(
      "Premier League",
    );
    expect(feedLabelOf({ name: "the Daily Briefing (Fabrizio Romano)" })).toBe(
      "Fabrizio Romano",
    );
    expect(feedLabelOf({ name: "Gianluca Di Marzio" })).toBeNull();
  });

  it("publisherNameOf는 화면·파이프라인이 같은 함수다(scripts는 다시 내보내기)", () => {
    expect(scriptsPublisherNameOf).toBe(publisherNameOf);
  });
});

describe("앵커·이슈 양식 링크", () => {
  it("절 앵커는 6개·중복 없음, /about/#id 라우트", () => {
    const ids = ABOUT_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      "schedule",
      "sources",
      "tier",
      "ai",
      "data",
      "contact",
    ]);
    expect(aboutHref()).toBe("/about/");
    expect(aboutHref("ai")).toBe("/about/#ai");
  });

  it("issueFormUrl — 저장소 이슈 양식(파일이 있다), 미리 채우는 값 없음", () => {
    for (const form of ["takedown.yml", "summary-error.yml"] as const) {
      expect(existsSync(path.resolve(".github/ISSUE_TEMPLATE", form))).toBe(
        true,
      );
      expect(issueFormUrl(form)).toBe(
        `${REPO_URL}/issues/new?template=${form}`,
      );
    }
  });
});
