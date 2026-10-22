/**
 * M1-33 — 뉴스 필터 DOM (src/lib/news/filter-dom.ts · filter-boot.ts · src/components/news/news-filter.tsx · filter-island.tsx,
 * PRD FR-31·FR-32, DESIGN.md §6.2·§9.2·§9.3, DECISIONS D0 §5 #11·#13)
 *
 * 실제 서버 렌더 HTML(fixtures 23장 — 혼합안 홈과 같은 카드)에
 * ① 인라인 부트 스크립트 문자열과 ② TS `applyFilterToDom`을 쿼리마다 따로 돌려 DOM이 글자 하나까지 같은지 본다(로직을 두 벌 두는 대신의 안전장치).
 * 그다음 그 결과의 규칙(카드 숨김·연결 줄·머리기사·눌림·0건 비활성·피드 머리·부제·빈 상태)과 보류 스크립트, 섬의 클릭 → 주소·알림을 본다.
 * 실제 브라우저의 첫 페인트·스트리밍·폭별 모양은 e2e(tests/e2e/news-filter.spec.ts · tests/e2e-specimen/news-filter.spec.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { filterActionOf } from "@/components/news/filter-island";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import {
  FILTER_DESC_DEFAULT,
  parseFilterQuery,
  type NewsFilterView,
} from "@/lib/news/filter";
import {
  NEWS_FILTER_BOOT_SCRIPT,
  NEWS_FILTER_PENDING_SCRIPT,
} from "@/lib/news/filter-boot";
import {
  applyFilterToDom,
  FILTER_CONFIG_ID,
  NF,
  readFilterConfig,
} from "@/lib/news/filter-dom";
import { NewsFileSchema } from "@/lib/schema/news";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);
const view = loadNewsFilterView(sample) as NewsFilterView;

function Page() {
  return (
    <>
      <nav aria-label="뉴스 필터">
        <NewsFilterContents view={view} />
      </nav>
      <main>
        <NewsSection
          id="news"
          news={sample}
          filter={view}
          heading="주요 뉴스"
          headingAs="h2"
          headingId="news-h"
          titleAs="h3"
        />
      </main>
    </>
  );
}

/** 정적 HTML(서버 렌더 그대로 — 스크립트는 실행되지 않는다) */
const STATIC_HTML = renderToStaticMarkup(<Page />);

function setUrl(search: string): void {
  window.history.replaceState(null, "", `/news/${search}`);
}

function mountStatic(): void {
  document.documentElement.removeAttribute(NF.pending);
  document.body.innerHTML = STATIC_HTML;
}

function runScript(source: string): void {
  // 인라인 스크립트처럼 전역 범위에서 실행한다
  new Function(source)();
}

function q<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} 없음`);
  return el;
}

function visibleIds(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[${NF.card}]:not([hidden]) > article`,
    ),
  ].map((a) => a.id);
}

function button(key: string, value: string): HTMLButtonElement {
  return q<HTMLButtonElement>(
    `nav [${NF.key}="${key}"][${NF.value}="${value}"]`,
  );
}

const config = () => {
  const c = readFilterConfig(document);
  if (!c) throw new Error("설정 없음");
  return c;
};

beforeEach(() => {
  setUrl("");
});

afterEach(() => {
  document.documentElement.removeAttribute(NF.pending);
  document.body.innerHTML = "";
});

const QUERIES = [
  "",
  "?cat=transfer",
  "?cat=result",
  "?comp=epl",
  "?comp=bundesliga&cat=result",
  "?comp=ligue1",
  "?comp=ligue1&cat=ucl",
  "?cat=ucl",
  "?kr=1",
  "?kr=1&cat=result",
  "?team=chelsea",
  "?team=bayern-munchen&kr=1",
  "?comp=EPL&cat=TRANSFER&team=Manchester-United",
  "?comp=epl&cat=transfer&team=tottenham-hotspur&kr=1",
  "?comp=mls&cat=gossip&team=unknown-fc&kr=2",
  "?cat=constructor&team=__proto__",
  "?utm_source=x",
];

describe("부트 스크립트 ≡ applyFilterToDom — 실제 서버 렌더 DOM에서 쿼리마다 같은 결과", () => {
  it.each(QUERIES)("%s", (search) => {
    setUrl(search);
    mountStatic();
    document.documentElement.setAttribute(NF.pending, "");
    runScript(NEWS_FILTER_BOOT_SCRIPT);
    const fromBoot = document.body.innerHTML;
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(false);

    mountStatic();
    applyFilterToDom(
      document,
      parseFilterQuery(location.search, config()),
      config(),
    );
    expect(document.body.innerHTML).toBe(fromBoot);
  });

  it("필터가 없는 주소의 TS 그리기는 정적 HTML을 바꾸지 않는다(서버 HTML = 필터 없음 상태)", () => {
    mountStatic();
    const before = document.body.innerHTML;
    applyFilterToDom(document, parseFilterQuery("", config()), config());
    expect(document.body.innerHTML).toBe(before);
  });

  it("같은 상태로 두 번 그려도 같다(멱등)", () => {
    setUrl("?kr=1&cat=result");
    mountStatic();
    const state = parseFilterQuery(location.search, config());
    applyFilterToDom(document, state, config());
    const once = document.body.innerHTML;
    applyFilterToDom(document, state, config());
    expect(document.body.innerHTML).toBe(once);
  });
});

describe("그리기 규칙", () => {
  function draw(search: string): number {
    setUrl(search);
    mountStatic();
    return applyFilterToDom(
      document,
      parseFilterQuery(location.search, config()),
      config(),
    );
  }

  it("분류 — 맞는 카드만, 부제 건수·설명, 눌림(전체 → 이적)", () => {
    expect(draw("?cat=transfer")).toBe(4);
    expect(visibleIds()).toEqual(
      sample.cards.filter((c) => c.cat === "transfer").map((c) => c.id),
    );
    expect(q(`[${NF.count}]`).textContent).toBe("4");
    expect(q(`[${NF.desc}]`).textContent).toBe("이적");
    expect(button("cat", "transfer")).toHaveAttribute("aria-pressed", "true");
    expect(button("cat", "all")).toHaveAttribute("aria-pressed", "false");
    // 375 칩 줄도 같은 상태
    expect(
      q(`[${NF.chips}] [${NF.key}="cat"][${NF.value}="transfer"]`),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("필터 결과에는 머리기사가 없다(DECISIONS #13) — 필터를 풀면 돌아온다", () => {
    draw("?comp=epl");
    expect(document.querySelector("[data-lead]")).toBeNull();
    expect(document.querySelector(`[${NF.lead}]`)?.id).toBe("c_f598c95798");
    applyFilterToDom(document, parseFilterQuery("", config()), config());
    expect(document.querySelector("[data-lead]")?.id).toBe("c_f598c95798");
  });

  it("짝 카드가 숨으면 연결 줄도 숨기고 카드 data-paired를 끈다(DESIGN §9.3) — 한국 선수만: 09는 남고 짝 07은 숨음", () => {
    draw("?kr=1");
    const kept = q("#c_d8eac2777b");
    expect(kept.closest("li")?.hidden).toBe(false);
    expect(q("#c_6fa142d217").closest("li")?.hidden).toBe(true);
    const line = kept.querySelector<HTMLElement>(`[${NF.link}]`);
    expect(line?.hidden).toBe(true);
    expect(kept.hasAttribute("data-paired")).toBe(false);
    // 둘 다 남는 짝(06 ↔ 14 — 같은 경기 결과·EPL)은 줄이 그대로
    draw("?comp=epl&cat=result");
    const lead = q("#c_f598c95798");
    expect(lead.querySelector<HTMLElement>(`[${NF.link}]`)?.hidden).toBe(false);
    expect(lead.hasAttribute("data-paired")).toBe(true);
  });

  it("대회 — 피드 머리 색 면(data-comp) + 약칭 상자, 설명은 정식 이름", () => {
    draw("?comp=epl");
    const head = q(`[${NF.head}]`);
    expect(head.getAttribute("data-comp")).toBe("EPL");
    expect(head.hasAttribute("data-team")).toBe(false);
    expect(q(`[${NF.compBadge}]`).textContent).toBe("EPL");
    expect(q(`[${NF.desc}]`).textContent).toBe("프리미어리그");
    expect(button("comp", "EPL")).toHaveAttribute("aria-pressed", "true");
    // 색 면 클래스는 속성 변형이다(서버 HTML은 기본 머리)
    expect(head.className).toContain("data-[comp=EPL]:bg-competition-epl");
  });

  it("0건 — 빈 상태(윤곽 0 · 안내 · 필터 해제), 부제 0건, 0건 대회 행은 눌렸으면 활성", () => {
    expect(draw("?comp=ligue1&cat=ucl")).toBe(0);
    const empty = q(`[${NF.empty}]`);
    expect(empty.hidden).toBe(false);
    expect(empty).toHaveTextContent("이 조건에 맞는 소식이 이 호에는 없어요.");
    expect(empty.querySelector(`[${NF.reset}]`)).toHaveTextContent("필터 해제");
    expect(q(`[${NF.count}]`).textContent).toBe("0");
    expect(q(`[${NF.desc}]`).textContent).toBe("리그 1 · UCL");
    expect(button("comp", "LIGUE1").disabled).toBe(false);
    expect(button("comp", "LIGUE1")).toHaveAttribute("aria-pressed", "true");
    expect(button("cat", "ucl").disabled).toBe(false);
    // 눌리지 않은 0건 행은 그대로 비활성
    expect(button("comp", "UCL").disabled).toBe(true);
  });

  it("결과가 있으면 빈 상태는 숨는다", () => {
    draw("?cat=injury");
    expect(q(`[${NF.empty}]`).hidden).toBe(true);
  });

  it("팀(주소로만) — 팀 칸(data-team) + 한글 표기, 설명에 팀", () => {
    expect(draw("?team=chelsea")).toBe(2);
    expect(q(`[${NF.head}]`).hasAttribute("data-team")).toBe(true);
    expect(q(`[${NF.teamBadge}]`).textContent).toBe(view.config.teams.chelsea);
    expect(q(`[${NF.desc}]`).textContent).toBe(view.config.teams.chelsea);
  });

  it("잘못된 값은 무시 — 전체 그대로", () => {
    mountStatic();
    const before = document.body.innerHTML;
    expect(draw("?comp=mls&cat=gossip&team=nobody&kr=yes")).toBe(23);
    expect(document.body.innerHTML).toBe(before);
  });
});

describe("정적 HTML — 처음 상태", () => {
  beforeEach(mountStatic);

  it("목차: 대회 6 · 분류 8(전체 + 7) · 한국 선수 1, 건수 = 혼합안 홈", () => {
    const rows = [...document.querySelectorAll(`nav [${NF.key}]`)];
    expect(rows.map((r) => r.textContent)).toEqual([
      "EPL프리미어리그 ✓8건",
      "라리가라리가 ✓6건",
      "세리에A세리에 A ✓3건",
      "분데스분데스리가 ✓3건",
      "리그1리그 1 ✓0건",
      "UCLUEFA 챔피언스리그 ✓0건",
      "전체23건",
      "경기 결과7건",
      "이적4건",
      "부상1건",
      "감독·구단4건",
      "대표팀4건",
      "UCL0건",
      "기타3건",
      "한국 선수 관련만5건",
    ]);
    expect(button("cat", "all")).toHaveAttribute("aria-pressed", "true");
    // 0건은 비활성(DESIGN §9.2) — "전체"는 늘 활성
    expect(
      rows
        .filter((r) => (r as HTMLButtonElement).disabled)
        .map((r) => r.getAttribute(NF.value)),
    ).toEqual(["LIGUE1", "UCL", "ucl"]);
  });

  it("목차 묶음은 목록 이름(aria-labelledby) — 제목 요소를 만들지 않는다", () => {
    const nav = q("nav");
    expect(nav.querySelectorAll("h1, h2, h3, h4")).toHaveLength(0);
    const lists = [...nav.querySelectorAll("ul")];
    expect(
      lists.map(
        (ul) =>
          document.getElementById(ul.getAttribute("aria-labelledby") ?? "")
            ?.textContent,
      ),
    ).toEqual(["대회", "분류", "한국 선수"]);
  });

  it("대회 행의 약칭 상자는 장식(접근 이름 겹침 방지), ✓는 눌림일 때만 보이는 장식", () => {
    const row = button("comp", "LALIGA");
    expect(row.querySelector("span")).toHaveAttribute("aria-hidden", "true");
    const check = [...row.querySelectorAll("span")].find(
      (s) => s.textContent === " ✓",
    );
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(check?.className).toContain("group-aria-pressed/row:inline");
  });

  it("375 칩 줄: role=group '분류 필터', 전체 + 7 + 한국 선수만, 1024 이상 숨김", () => {
    const row = q(`[${NF.chips}]`);
    expect(row).toHaveAttribute("role", "group");
    expect(row).toHaveAttribute("aria-label", "분류 필터");
    expect(row.className).toContain("lg:hidden");
    expect(
      [...row.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual([
      "✓전체23건",
      "✓경기 결과7건",
      "✓이적4건",
      "✓부상1건",
      "✓감독·구단4건",
      "✓대표팀4건",
      "✓UCL0건",
      "✓기타3건",
      "✓한국 선수만5건",
    ]);
    // 대회 진입점 없음(DECISIONS #11)
    expect(row.querySelector(`[${NF.key}="comp"]`)).toBeNull();
  });

  it("피드 머리: 기본 섹션 머리(러닝 헤드 SQUAD) — 필터 칸은 속성 변형으로만 보인다", () => {
    const head = q(`[${NF.head}]`);
    expect(head.hasAttribute("data-comp")).toBe(false);
    expect(head.querySelector("h2")).toHaveTextContent("주요 뉴스");
    expect(q(`[${NF.clear}="comp"]`)).toHaveTextContent("해제 대회 필터");
    expect(q(`[${NF.clear}="team"]`)).toHaveTextContent("해제 팀 필터");
    expect(q(`[${NF.count}]`).textContent).toBe("23");
    expect(q(`[${NF.desc}]`).textContent).toBe(FILTER_DESC_DEFAULT);
  });

  it("빈 상태·결과 알림 영역·설정 JSON", () => {
    expect(q(`[${NF.empty}]`).hidden).toBe(true);
    expect(q(`[${NF.live}]`)).toHaveAttribute("aria-live", "polite");
    const json = q(`#${FILTER_CONFIG_ID}`);
    expect(json).toHaveAttribute("type", "application/json");
    expect(JSON.parse(json.textContent ?? "")).toEqual(view.config);
    expect(json.textContent).not.toContain("<");
  });

  it("카드 <li>에 필터 값 — 분류·대회·팀(공백 구분)·한국 선수", () => {
    const li = q("#c_b24a3b9263").closest("li") as HTMLElement;
    expect(li.getAttribute(NF.cat)).toBe("transfer");
    expect(li.getAttribute(NF.comps)).toBe("EPL BUNDESLIGA");
    expect(li.getAttribute(NF.teams)?.split(" ")).toContain("bayern-munchen");
    expect(q("#c_d8eac2777b").closest("li")?.hasAttribute(NF.kr)).toBe(true);
    expect(li.hasAttribute(NF.kr)).toBe(false);
  });

  it("부트·보류 스크립트는 목차 맨 앞·피드 뒤 순서다(그리는 요소가 모두 앞에)", () => {
    const scripts = [...document.querySelectorAll("script:not([type])")];
    expect(scripts.map((s) => s.textContent)).toEqual([
      NEWS_FILTER_PENDING_SCRIPT,
      NEWS_FILTER_BOOT_SCRIPT,
    ]);
    expect(q("nav [data-nf-scope]").firstElementChild).toBe(scripts[0]);
    const boot = scripts[1] as Element;
    for (const sel of [
      `[${NF.empty}]`,
      `[${NF.head}]`,
      `[${NF.chips}]`,
      "ol#feed",
      `#${FILTER_CONFIG_ID}`,
    ])
      expect(
        q(sel).compareDocumentPosition(boot) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });
});

describe("보류 스크립트·실패 안전", () => {
  it.each([
    ["?cat=transfer", true],
    ["?comp=nope", true],
    ["?kr", true],
    ["?team=", true],
    ["", false],
    ["?utm_source=x", false],
  ])("%s → data-nf-pending %s", (search, pending) => {
    setUrl(search);
    document.documentElement.removeAttribute(NF.pending);
    runScript(NEWS_FILTER_PENDING_SCRIPT);
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(pending);
  });

  it("안전망 — 부트 스크립트가 없어도 문서를 다 읽으면(DOMContentLoaded) 보류를 푼다", () => {
    setUrl("?cat=transfer");
    document.documentElement.removeAttribute(NF.pending);
    runScript(NEWS_FILTER_PENDING_SCRIPT);
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(true);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(false);
  });

  it("설정 JSON이 없거나 깨져도 부트 스크립트는 보류를 푼다(전체 피드로 물러남)", () => {
    setUrl("?cat=transfer");
    mountStatic();
    q(`#${FILTER_CONFIG_ID}`).textContent = "{깨짐";
    document.documentElement.setAttribute(NF.pending, "");
    runScript(NEWS_FILTER_BOOT_SCRIPT);
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(false);
    expect(visibleIds()).toHaveLength(23);

    q(`#${FILTER_CONFIG_ID}`).remove();
    document.documentElement.setAttribute(NF.pending, "");
    runScript(NEWS_FILTER_BOOT_SCRIPT);
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(false);
  });
});

describe("필터 섬", () => {
  it("filterActionOf — 버튼 → 조작", () => {
    const make = (attrs: Record<string, string>) => {
      const b = document.createElement("button");
      for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
      return b;
    };
    expect(
      filterActionOf(make({ [NF.key]: "cat", [NF.value]: "all" })),
    ).toEqual({ type: "cat", value: null });
    expect(
      filterActionOf(make({ [NF.key]: "cat", [NF.value]: "injury" })),
    ).toEqual({ type: "cat", value: "injury" });
    expect(
      filterActionOf(make({ [NF.key]: "comp", [NF.value]: "UCL" })),
    ).toEqual({ type: "comp", value: "UCL" });
    expect(filterActionOf(make({ [NF.key]: "kr", [NF.value]: "1" }))).toEqual({
      type: "kr",
    });
    expect(filterActionOf(make({ [NF.clear]: "comp" }))).toEqual({
      type: "clear-comp",
    });
    expect(filterActionOf(make({ [NF.clear]: "team" }))).toEqual({
      type: "clear-team",
    });
    expect(filterActionOf(make({ [NF.reset]: "" }))).toEqual({ type: "reset" });
    expect(filterActionOf(make({}))).toBeNull();
  });

  it("클릭 → 그리기 · 주소(replaceState, 다른 쿼리·앵커 보존) · 결과 알림 · 찍힘", () => {
    setUrl("?utm_source=x#c_d8eac2777b");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<Page />);
    act(() => {
      fireEvent.click(button("cat", "transfer"));
    });
    expect(visibleIds()).toHaveLength(4);
    expect(replace).toHaveBeenLastCalledWith(
      null,
      "",
      "/news/?utm_source=x&cat=transfer#c_d8eac2777b",
    );
    expect(q(`[${NF.live}]`).textContent).toBe("이적 4건");
    expect(document.querySelectorAll(`[${NF.enter}]`)).toHaveLength(4);

    // 대회 → 피드 머리 색 면, 해제 → 대회만 풀림
    act(() => {
      fireEvent.click(button("comp", "EPL"));
    });
    expect(q(`[${NF.head}]`).getAttribute("data-comp")).toBe("EPL");
    expect(replace).toHaveBeenLastCalledWith(
      null,
      "",
      "/news/?utm_source=x&comp=epl&cat=transfer#c_d8eac2777b",
    );
    act(() => {
      fireEvent.click(q(`[${NF.clear}="comp"]`));
    });
    expect(q(`[${NF.head}]`).hasAttribute("data-comp")).toBe(false);
    expect(q(`[${NF.live}]`).textContent).toBe("이적 4건");

    // 눌린 분류를 다시 누르면 전체
    act(() => {
      fireEvent.click(button("cat", "transfer"));
    });
    expect(visibleIds()).toHaveLength(23);
    expect(q(`[${NF.live}]`).textContent).toBe("전체 23건");
    expect(replace).toHaveBeenLastCalledWith(
      null,
      "",
      "/news/?utm_source=x#c_d8eac2777b",
    );
    replace.mockRestore();
  });

  it("주소에 필터가 있으면 마운트할 때 그린다(모션·알림 없이) + 보류 표시를 지운다", () => {
    setUrl("?comp=ligue1");
    document.documentElement.setAttribute(NF.pending, "");
    render(<Page />);
    expect(document.documentElement.hasAttribute(NF.pending)).toBe(false);
    expect(visibleIds()).toHaveLength(0);
    expect(q(`[${NF.empty}]`).hidden).toBe(false);
    expect(q(`[${NF.live}]`).textContent).toBe("");
    expect(document.querySelectorAll(`[${NF.enter}]`)).toHaveLength(0);
  });

  it("주소로 눌린 채 들어온 0건 항목을 끄면 그 버튼이 비활성이 된다 → 포커스는 눌린 분류 컨트롤로(body로 떨어지지 않게)", () => {
    setUrl("?comp=ligue1");
    render(<Page />);
    const row = button("comp", "LIGUE1");
    expect(row.disabled).toBe(false);
    row.focus();
    act(() => {
      fireEvent.click(row);
    });
    expect(row.disabled).toBe(true);
    expect(document.activeElement).toBe(button("cat", "all"));
  });

  it("0건 빈 상태의 '필터 해제' → 모두 풀림", () => {
    setUrl("?comp=ligue1&kr=1");
    render(<Page />);
    act(() => {
      fireEvent.click(q(`[${NF.reset}]`));
    });
    expect(visibleIds()).toHaveLength(23);
    expect(q(`[${NF.empty}]`).hidden).toBe(true);
    expect(location.search).toBe("");
  });

  it("모션 줄이기면 찍힘을 걸지 않는다", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query.includes("reduce"),
    })) as typeof window.matchMedia;
    try {
      render(<Page />);
      act(() => {
        fireEvent.click(button("kr", "1"));
      });
      expect(visibleIds()).toHaveLength(5);
      expect(document.querySelectorAll(`[${NF.enter}]`)).toHaveLength(0);
    } finally {
      window.matchMedia = original;
    }
  });
});
