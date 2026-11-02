/**
 * M4-08 — '내 팀 소식'(src/components/my/my-news.tsx · src/lib/my-news-dom.ts · my-news-boot.ts — PRD FR-112, DESIGN §9.3 D2 홈 위젯)
 *
 * 실제 서버 렌더 HTML(fixtures 카드)에 ① 첫 페인트 전 부트 스크립트 문자열과 ② TS `applyMyNews`를 팔로우마다 따로 돌려 DOM이 같은지 본다.
 * 그다음 규칙(맞는 행만 앞에서부터 limit · 걸린 이름 · 건수 · 맞는 행 0이면 섹션 숨김)과 섬(팔로우가 바뀌면 다시 그림)을 본다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MyNews } from "@/components/my/my-news";
import { MyNewsIsland } from "@/components/my/my-news-island";
import type { MyNewsCandidate } from "@/lib/data/my-page";
import { FOLLOW_STORAGE_KEY, parseFollows } from "@/lib/follow";
import { followKey, followKeySet } from "@/lib/my-view";
import { MY_NEWS_BOOT_SCRIPT } from "@/lib/my-news-boot";
import { applyMyNews, MN } from "@/lib/my-news-dom";
import { NewsFileSchema } from "@/lib/schema/news";
import { followStore } from "@/lib/use-follows";

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);

/** 후보 — 카드 태그 그대로(디렉터리 대신 slug를 이름으로) */
const CANDIDATES: MyNewsCandidate[] = sample.cards.flatMap((card) => {
  const pairs: Array<[string, string]> = [
    ...card.teams.map((t): [string, string] => [followKey("teams", t), t]),
    ...card.players.map((p): [string, string] => [followKey("players", p), p]),
  ];
  return pairs.length > 0
    ? [{ item: { card, date: sample.date }, pairs, tags: [] }]
    : [];
});

const HTML = renderToStaticMarkup(
  <MyNews
    candidates={CANDIDATES}
    issueNo={20}
    limit={3}
    variant="home"
    headingId="t-my"
  />,
);

function mount(): void {
  document.body.innerHTML = HTML;
  // 서버 HTML 속 스크립트·섬 자리는 이 테스트에서 돌지 않는다(innerHTML 스크립트는 실행되지 않는다)
}

function setFollows(value: unknown): void {
  window.localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(value));
}

const section = () => document.querySelector<HTMLElement>(`[${MN.section}]`)!;
const visibleRows = () => [
  ...document.querySelectorAll<HTMLElement>(`[${MN.row}]:not([hidden])`),
];

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

const FOLLOWS = [
  null,
  { v: 1, teams: [], players: [] },
  { v: 1, teams: ["manchester-united"], players: [] },
  { v: 1, teams: ["bayern-munchen", "chelsea"], players: ["lee-kang-in"] },
  { v: 1, teams: ["nowhere-fc"], players: [] },
  { v: 1, teams: ["arsenal"], players: ["kim-min-jae", "seol-young-woo"] },
  { v: 2, teams: ["arsenal"] },
];

describe("부트 스크립트 ≡ applyMyNews — 실제 서버 렌더 DOM에서 팔로우마다 같은 결과", () => {
  it.each(FOLLOWS.map((f) => [JSON.stringify(f), f] as const))(
    "%s",
    (_label, follows) => {
      if (follows !== null) setFollows(follows);
      mount();
      new Function(MY_NEWS_BOOT_SCRIPT)();
      const fromBoot = document.body.innerHTML;
      mount();
      applyMyNews(
        document,
        followKeySet(
          parseFollows(window.localStorage.getItem(FOLLOW_STORAGE_KEY)),
        ),
      );
      expect(document.body.innerHTML).toBe(fromBoot);
    },
  );
});

describe("그리기 규칙", () => {
  it("서버 HTML — 섹션 · 후보 행 모두 숨김(팔로우를 모른다), 건수 0", () => {
    mount();
    expect(section().hidden).toBe(true);
    expect(visibleRows()).toHaveLength(0);
    expect(document.querySelectorAll(`[${MN.row}]`)).toHaveLength(
      CANDIDATES.length,
    );
  });

  it("맞는 행만 앞에서부터 limit(3)개, 걸린 이름 · 건수(부제 · 더 보기)", () => {
    mount();
    const keys = new Set(["t:manchester-united", "t:bayern-munchen"]);
    const n = applyMyNews(document, keys);
    const expected = CANDIDATES.filter((c) =>
      c.pairs.some(([k]) => keys.has(k)),
    );
    expect(n).toBe(expected.length);
    expect(section().hidden).toBe(false);
    const rows = visibleRows();
    expect(rows).toHaveLength(Math.min(3, expected.length));
    expect(
      rows.map((r) => r.querySelector(`[${MN.why}]`)?.textContent),
    ).toEqual(
      expected.slice(0, 3).map((c) =>
        c.pairs
          .filter(([k]) => keys.has(k))
          .map(([, name]) => name)
          .join(" · "),
      ),
    );
    for (const el of document.querySelectorAll(`[${MN.count}]`))
      expect(el.textContent).toBe(String(expected.length));
  });

  it("맞는 행이 없으면 섹션째 숨김(팔로우 0 포함)", () => {
    mount();
    applyMyNews(document, new Set(["t:nowhere-fc"]));
    expect(section().hidden).toBe(true);
    applyMyNews(document, new Set());
    expect(section().hidden).toBe(true);
  });

  it("멱등 — 같은 팔로우로 두 번 그려도 같다", () => {
    mount();
    const keys = new Set(["p:lee-kang-in"]);
    applyMyNews(document, keys);
    const once = document.body.innerHTML;
    applyMyNews(document, keys);
    expect(document.body.innerHTML).toBe(once);
  });

  it("깨진 data-mn-keys 행은 맞지 않는 행으로 본다(던지지 않음)", () => {
    mount();
    const first = document.querySelector(`[${MN.row}]`)!;
    first.setAttribute(MN.keys, "{broken");
    expect(() => new Function(MY_NEWS_BOOT_SCRIPT)()).not.toThrow();
    expect(() => applyMyNews(document, new Set(["t:x"]))).not.toThrow();
  });

  it('홈 링크 = /my/("n건 모두 · 마이"), 마이 링크 = /news/?mine=1', () => {
    mount();
    expect(
      [...document.querySelectorAll("section > p a")].map((a) =>
        // 테스트 환경의 next/link는 trailingSlash를 모른다(끝 슬래시를 뗀다) — 빌드 HTML은 e2e가 본다
        a.getAttribute("href")?.replace(/\/?$/, "/"),
      ),
    ).toEqual(["/my/"]);
    const page = renderToStaticMarkup(
      <MyNews
        candidates={CANDIDATES}
        issueNo={20}
        limit={4}
        variant="page"
        headingId="p-my"
      />,
    );
    expect(page).toMatch(/href="\/news\/?\?mine=1"/);
    expect(page).toContain(`${MN.limit}="4"`);
  });
});

describe("섬 — 팔로우가 바뀌면 다시 그린다", () => {
  it("같은 탭에서 팔로우하면 행이 나타난다", () => {
    mount();
    render(<MyNewsIsland />);
    expect(section().hidden).toBe(true);
    act(() => {
      followStore.update(() => ({
        v: 1,
        teams: ["manchester-united"],
        players: [],
      }));
    });
    expect(section().hidden).toBe(false);
    expect(visibleRows().length).toBeGreaterThan(0);
    act(() => {
      followStore.update(() => ({ v: 1, teams: [], players: [] }));
    });
    expect(section().hidden).toBe(true);
  });
});
