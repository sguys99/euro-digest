import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TransferFilterBar,
  TransferFilterContents,
} from "@/components/transfers/filter";
import { LedgerFilterEmpty, LedgerRows } from "@/components/transfers/ledger";
import type { TeamView } from "@/lib/competition-view";
import type { CompLabel } from "@/lib/home-widgets";
import type { CompId } from "@/lib/schema/common";
import { NewsCardSchema } from "@/lib/schema/news";
import { TransfersFileSchema } from "@/lib/schema/transfer";
import {
  matchesTransferFilter,
  parseTransferFilterQuery,
} from "@/lib/transfer-filter";
import {
  drawTransferFilter,
  openTransferTarget,
  TRANSFER_BOOT_SCRIPT,
} from "@/lib/transfer-filter-dom";
import { timelineAnchor, transfersView } from "@/lib/transfers-view";

// 이적 필터 DOM(M4-04 — FR-104): 서버가 그린 원장 · 필터 버튼에 주소 쿼리를 그려 순수 규칙(transfer-filter.ts)과 같은 행이 남는지,
// 인라인 부트 스크립트(함수 원문을 떼어 실행)가 같은 결과를 내는지, 해시 도착이 접힌 타임라인을 펼치는지 본다.

const fixture = JSON.parse(
  readFileSync(path.resolve("fixtures/transfers/specimen.json"), "utf8"),
);
const LEAGUE: Record<string, CompId> = {
  arsenal: "EPL",
  "tottenham-hotspur": "EPL",
  chelsea: "EPL",
  liverpool: "EPL",
  barcelona: "LALIGA",
  napoli: "SERIEA",
  juventus: "SERIEA",
  mainz: "BUNDESLIGA",
  freiburg: "BUNDESLIGA",
  "bayern-munchen": "BUNDESLIGA",
};
const team = (slug: string): TeamView => ({
  slug,
  name: slug,
  latin: false,
  short: "",
  colors: null,
  page: false,
});
const view = transfersView({
  records: TransfersFileSchema.parse(fixture.records),
  cards: fixture.cards.map((c: unknown) => NewsCardSchema.parse(c)),
  korean: [
    {
      slug: "kim-min-jae",
      nameKo: "김민재",
      team: "bayern-munchen",
      comp: "BUNDESLIGA",
    },
    ...fixture.korean,
  ],
  playerName: (slug) => fixture.names[slug] ?? null,
  team,
  leagueOf: (slug) => LEAGUE[slug] ?? null,
});
const comps = new Map<CompId, CompLabel>([
  ["EPL", { short: "EPL", name: "프리미어리그" }],
  ["LALIGA", { short: "라리가", name: "라리가" }],
  ["SERIEA", { short: "세리에A", name: "세리에 A" }],
  ["BUNDESLIGA", { short: "분데스", name: "분데스리가" }],
  ["LIGUE1", { short: "리그1", name: "리그 1" }],
]);

function mount() {
  return render(
    <>
      <TransferFilterContents view={view} comps={comps} />
      <TransferFilterBar view={view} comps={comps} />
      <LedgerRows rows={view.rows} />
      <LedgerFilterEmpty />
    </>,
  );
}

const visibleIds = () =>
  [...document.querySelectorAll<HTMLElement>("[data-xf-row]")]
    .filter((el) => !el.hidden)
    .map((el) => el.id);
const expectedIds = (search: string) => {
  const state = parseTransferFilterQuery(search, view.known);
  return view.rows
    .filter((r) => matchesTransferFilter(r.filter, state))
    .map((r) => r.anchor);
};

const QUERIES = [
  "",
  "?kr=1",
  "?status=rumor,official",
  "?league=epl&kr=1",
  "?league=ligue1",
  "?tier=1,2&status=collapsed",
  "?team=arsenal,chelsea",
  "?status=negotiating",
  "?league=EPL,bogus&tier=3",
];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("drawTransferFilter — 순수 규칙과 같은 행", () => {
  it.each(QUERIES)("%s", (q) => {
    mount();
    const shown = drawTransferFilter(document, q);
    expect(visibleIds()).toEqual(expectedIds(q));
    expect(shown).toBe(expectedIds(q).length);
    // 결과 수 · 0건 빈 상태 · 결과 수 줄 해제 버튼
    for (const el of document.querySelectorAll("[data-xf-shown]"))
      expect(el.textContent).toBe(String(shown));
    expect(document.querySelector<HTMLElement>("[data-xf-empty]")!.hidden).toBe(
      shown !== 0,
    );
    const active = Object.values(parseTransferFilterQuery(q, view.known)).some(
      (v) => v.length > 0,
    );
    for (const el of document.querySelectorAll<HTMLElement>(
      '[data-xf-reset="sum"]',
    ))
      expect(el.hidden).toBe(!active);
  });

  it("눌린 버튼은 두 벌(목차 · 칩) 모두 aria-pressed, 0건 버튼은 눌렸을 때만 활성", () => {
    mount();
    const zero = () => [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-xf-axis="status"][data-xf-value="negotiating"]',
      ),
    ];
    expect(zero()).toHaveLength(2);
    expect(zero().every((b) => b.disabled)).toBe(true);
    drawTransferFilter(document, "?status=negotiating");
    expect(
      zero().every(
        (b) => !b.disabled && b.getAttribute("aria-pressed") === "true",
      ),
    ).toBe(true);
    expect(document.querySelector("[data-xf-picked]")!.textContent).toBe("1");
    drawTransferFilter(document, "");
    expect(
      zero().every(
        (b) => b.disabled && b.getAttribute("aria-pressed") === "false",
      ),
    ).toBe(true);
  });
});

describe("인라인 부트 스크립트 — 함수 원문만 떼어 실행해도 같다", () => {
  it.each(QUERIES.filter(Boolean))("%s", (q) => {
    mount();
    window.history.replaceState(null, "", `/transfers/${q}`);
    new Function(TRANSFER_BOOT_SCRIPT)();
    expect(visibleIds()).toEqual(expectedIds(q));
  });
});

describe("openTransferTarget — 해시 도착", () => {
  it("접힌 타임라인을 펼치고 버튼 aria-expanded · 도착 표시(다른 도착 표시는 지운다)", () => {
    mount();
    const row = view.rows.find((r) => r.id === "kim-min-jae:arsenal")!;
    const target = openTransferTarget(
      document,
      `#${timelineAnchor(row.lead!.id)}`,
    )!;
    expect(target).not.toBeNull();
    const panel = target.closest<HTMLElement>("[data-xt-panel]")!;
    expect(panel.hidden).toBe(false);
    expect(
      document
        .querySelector(`[data-xt-toggle][aria-controls="${panel.id}"]`)!
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(target.hasAttribute("data-xt-arrive")).toBe(true);
    const other = view.rows.find((r) => r.id === "test-player-b:chelsea")!;
    openTransferTarget(document, `#${timelineAnchor(other.lead!.id)}`);
    expect(target.hasAttribute("data-xt-arrive")).toBe(false);
  });

  it("타임라인이 없는 행(기사 1)은 근거 줄이 도착 대상 · 필터로 숨은 행은 보인다", () => {
    mount();
    const d = view.rows.find((r) => r.id === "test-player-d:-")!;
    drawTransferFilter(document, "?status=official");
    const target = openTransferTarget(
      document,
      `#${timelineAnchor(d.lead!.id)}`,
    )!;
    expect(target.closest<HTMLElement>("[data-xf-row]")!.hidden).toBe(false);
  });

  it("xt- 해시가 아니거나 없는 id면 null", () => {
    mount();
    expect(openTransferTarget(document, "")).toBeNull();
    expect(openTransferTarget(document, "#main")).toBeNull();
    expect(openTransferTarget(document, "#xt-c_ffffffffff")).toBeNull();
    expect(openTransferTarget(document, "#xt-%E0%A4%A")).toBeNull();
  });
});
