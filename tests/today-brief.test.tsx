/**
 * M1-32 — 오늘의 5줄 블록(src/components/brief/today-brief.tsx)·"AI 작성" 라벨(src/components/ui/ai-label.tsx)
 * (PRD FR-35·FR-36, D24·D30·D45·D58, DESIGN.md §9.3).
 *
 * FR-35 수용 기준: `ai:true` 줄 **전부**에 "AI 작성" 라벨(→ /about/#ai), 템플릿 줄(`ai:false`)에는 없음.
 * fixtures/brief-sample.json(읽기만)의 llm·mixed·template 날과 S4 합성 파일(fixtures/brief-empty.json)을 실제 설정(competitions)으로 그린다.
 * 실제 크기·색·폭별 배치는 견본 e2e(tests/e2e-specimen/brief.spec.ts)와 홈 e2e(tests/e2e/home.spec.ts)가 브라우저에서 본다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TodayBrief } from "@/components/brief/today-brief";
import { AiLabel, AiLabelMark } from "@/components/ui/ai-label";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { briefErrorIssueUrl } from "@/lib/paths";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";

const sample = BriefFileSchema.array().parse(
  (
    JSON.parse(
      readFileSync(path.resolve("fixtures/brief-sample.json"), "utf8"),
    ) as { days: unknown[] }
  ).days,
);
const emptyBrief = BriefFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/brief-empty.json"), "utf8")),
);
const competitions = new Map(loadCompetitionsConfig().map((c) => [c.id, c]));

function day(date: string): BriefFile {
  const found = sample.find((d) => d.date === date);
  if (!found) throw new Error(`fixtures/brief-sample.json에 ${date} 없음`);
  return found;
}

/** next/link href — 테스트 환경에서는 trailingSlash가 적용되지 않아 `/about#ai`로 나온다(빌드 결과는 `/about/#ai` — e2e) */
function hrefOf(el: Element | undefined): string | undefined {
  return el?.getAttribute("href")?.replace(/^\/about(?=#|$)/, "/about/");
}

function block(): HTMLElement {
  return screen.getByRole("region", { name: "오늘의 5줄" });
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("list", { name: /줄$/ })).getAllByRole(
    "listitem",
  );
}

/** 줄 문장(라벨 글자 뺀 것) */
function sentence(row: HTMLElement): string {
  const p = row.querySelector("[data-slot=brief-text]");
  if (!p) throw new Error("문장 없음");
  const clone = p.cloneNode(true) as HTMLElement;
  clone.querySelector("[data-slot=ai-label]")?.remove();
  // 라벨 앞 낱말 경계(폭 0 공백)를 뺀 문장
  return (clone.textContent ?? "").trimEnd();
}

describe("FR-35 — 'AI 작성' 라벨은 ai:true 줄 전부, ai:false 줄에는 없음", () => {
  it.each(sample.map((d) => [d.date, d.mode, d] as const))(
    "%s (%s)",
    (_date, _mode, brief) => {
      render(<TodayBrief brief={brief} />);
      const items = rows();
      expect(items).toHaveLength(brief.lines.length);
      brief.lines.forEach((line, index) => {
        const row = items[index] as HTMLElement;
        const labels = within(row).queryAllByRole("link", { name: "AI 작성" });
        if (line.ai) {
          expect(labels).toHaveLength(1);
          expect(hrefOf(labels[0])).toBe("/about/#ai");
          // 라벨은 문장 끝(문장 단락의 마지막 자식)
          expect(
            row.querySelector("[data-slot=brief-text]")?.lastElementChild,
          ).toBe(labels[0]);
          // 문장과 라벨 사이 낱말 경계 — 텍스트로 이으면 "….AI 작성"이 아니라 "…. AI 작성"
          expect(row.querySelector("[data-slot=brief-text]")?.textContent).toBe(
            `${line.text} AI 작성`,
          );
        } else {
          expect(labels).toEqual([]);
          expect(row).not.toHaveTextContent("AI 작성");
        }
        expect(row).toHaveAttribute("data-ai", String(line.ai));
      });
      // 블록 안 라벨 수 = ai:true 줄 수
      expect(block().querySelectorAll("[data-slot=ai-label]")).toHaveLength(
        brief.lines.filter((l) => l.ai).length,
      );
    },
  );
});

describe("오늘의 5줄 행", () => {
  it("섹션 머리 h2 '오늘의 5줄' + STARTING FIVE(장식), 부제 '{경기일}(현지) 경기 기준' — 경기일 = 발행일 − 1(브리핑 입력 창 = 유럽 현지 경기일)", () => {
    render(<TodayBrief brief={day("2026-10-11")} />);
    const el = block();
    expect(
      within(el).getByRole("heading", { level: 2, name: "오늘의 5줄" }),
    ).toBeInTheDocument();
    const rh = within(el).getByText("STARTING FIVE");
    expect(rh).toHaveAttribute("aria-hidden", "true");
    expect(rh).toHaveAttribute("lang", "en");
    const time = el.querySelector("time");
    expect(time).toHaveAttribute("datetime", "2026-10-10");
    expect(time?.parentElement).toHaveTextContent("10월 10일(현지) 경기 기준");
    expect(el).not.toHaveTextContent("이날");
  });

  it("목록 의미 — <ol role=list aria-label='N줄'>, 등번호 1~N은 장식(aria-hidden)", () => {
    render(<TodayBrief brief={day("2026-10-10")} />);
    const list = screen.getByRole("list", { name: "5줄" });
    expect(list.tagName).toBe("OL");
    const numbers = [
      ...list.querySelectorAll<HTMLElement>("[data-slot=brief-no]"),
    ];
    expect(numbers.map((n) => n.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    for (const n of numbers) expect(n).toHaveAttribute("aria-hidden", "true");
  });

  it("문장은 원문 그대로(무수정), 숫자만 조각으로 감싼다", () => {
    const brief = day("2026-10-10");
    render(<TodayBrief brief={brief} />);
    expect(rows().map(sentence)).toEqual(brief.lines.map((l) => l.text));
    // "90+2"·"2-2"가 한 조각
    const first = rows()[0] as HTMLElement;
    const nums = [
      ...first.querySelectorAll(
        "[data-slot=brief-text] > span:not([data-slot])",
      ),
    ].map((s) => s.textContent);
    expect(nums).toEqual(["2-2", "88", "90+2"]);
  });

  it("인덱스 탭 = comps 첫 값(약칭 글자 + 정식 이름 title), comps 없는 줄은 탭 없음", () => {
    const brief = day("2026-10-10");
    render(<TodayBrief brief={brief} />);
    rows().forEach((row, index) => {
      const comp = brief.lines[index]?.comps?.[0];
      const tabs = row.querySelectorAll("[data-slot=index-tab]");
      expect(tabs).toHaveLength(comp ? 1 : 0);
      if (comp) {
        const config = competitions.get(comp);
        expect(tabs[0]).toHaveTextContent(config?.shortKo ?? "");
        expect(tabs[0]).toHaveAttribute("title", config?.nameKo);
      }
    });
  });

  it("comps가 없는 옛 파일(2026-10-17·18 형식) — 탭 없이 행만", () => {
    render(
      <TodayBrief
        brief={{
          date: "2026-10-18",
          mode: "llm",
          lines: [
            { text: "바르셀로나가 레알 베티스를 5-2로 완파했다.", ai: true },
          ],
        }}
      />,
    );
    expect(rows()).toHaveLength(1);
    expect(block().querySelectorAll("[data-slot=index-tab]")).toHaveLength(0);
    expect(block()).toHaveTextContent("이날 1줄");
  });

  it("5줄 미만이면 부제에 '이날 N줄'(template 2줄 — 2026-09-18)", () => {
    render(<TodayBrief brief={day("2026-09-18")} />);
    expect(block()).toHaveTextContent("9월 17일(현지) 경기 기준이날 2줄");
    expect(screen.getByRole("list", { name: "2줄" })).toBeInTheDocument();
  });
});

describe("하단 — 데이터 출처 · AI 작성 안내 · 브리핑 오류 신고(FR-36)", () => {
  it("AI 줄이 있는 날: AI 작성 안내(/about/#ai) + 브리핑 오류 신고(발행 날짜를 채운 이슈 양식, 새 창)", () => {
    const brief = day("2026-10-11");
    render(<TodayBrief brief={brief} />);
    const foot = block().querySelector("[data-slot=brief-foot]") as HTMLElement;
    expect(foot).toHaveTextContent("데이터 football-data.org · API-Football");
    expect(
      hrefOf(within(foot).getByRole("link", { name: "AI 작성 안내" })),
    ).toBe("/about/#ai");
    const report = within(foot).getByRole("link", {
      name: /브리핑 오류 신고/,
    });
    expect(report).toHaveAttribute("href", briefErrorIssueUrl("2026-10-11"));
    expect(report.getAttribute("href")).toContain("date=2026-10-11");
    expect(report).toHaveAttribute("target", "_blank");
    expect(report.getAttribute("rel")).toContain("noopener");
    expect(report).toHaveTextContent("(새 창)");
  });

  it("AI 줄이 없는 날(template)은 AI 작성 안내를 싣지 않는다(혼합안 S3)", () => {
    render(<TodayBrief brief={day("2026-09-18")} />);
    expect(screen.queryByRole("link", { name: "AI 작성 안내" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /브리핑 오류 신고/ }),
    ).toHaveAttribute("href", briefErrorIssueUrl("2026-09-18"));
  });
});

describe("S4 경기 없는 날(mode empty — D30 #7)", () => {
  it("블록·머리는 두고 목록 대신 '0' 윤곽(장식) + 쉽니다 + 이유 + 주요 뉴스로 ↓, 날짜를 단정하지 않는다", () => {
    render(<TodayBrief brief={emptyBrief} />);
    const el = block();
    expect(el).toHaveAttribute("data-brief-mode", "empty");
    expect(within(el).queryByRole("list")).toBeNull();
    expect(el).toHaveTextContent("전날(현지) 경기 기준");
    expect(el.querySelector("time")).toBeNull();
    expect(el).not.toHaveTextContent(/\d+월 \d+일/);
    const rest = el.querySelector("[data-slot=brief-rest]") as HTMLElement;
    expect(rest.querySelector("[aria-hidden=true]")).toHaveTextContent("0");
    expect(rest).toHaveTextContent("오늘은 5줄을 쉽니다");
    expect(rest).toHaveTextContent(
      `전날 ${competitions.size}개 대회에 끝난 경기가 없었습니다.`,
    );
    expect(
      within(rest).getByRole("link", { name: "주요 뉴스로" }),
    ).toHaveAttribute("href", "#news");
    expect(el.querySelectorAll("[data-slot=ai-label]")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "AI 작성 안내" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /브리핑 오류 신고/ }),
    ).toHaveAttribute("href", briefErrorIssueUrl(emptyBrief.date));
  });
});

describe("AiLabel · AiLabelMark", () => {
  it("라벨 링크 — 이름 'AI 작성', /about/#ai, 44px 터치 확장(::after)", () => {
    render(<AiLabel />);
    const link = screen.getByRole("link", { name: "AI 작성" });
    expect(hrefOf(link)).toBe("/about/#ai");
    expect(link.className).toContain("after:h-11");
    expect(link.className).toContain("border-ink-2");
  });

  it("견본은 링크가 아니고 같은 상자 모양", () => {
    const { container } = render(
      <p>
        <AiLabelMark />
      </p>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    const mark = container.querySelector("span") as HTMLElement;
    expect(mark).toHaveTextContent("AI 작성");
    render(<AiLabel />);
    const link = screen.getByRole("link", { name: "AI 작성" });
    // 링크 클래스는 견본 클래스를 모두 포함(같은 상자)
    for (const cls of mark.className.split(" ")) {
      expect(link.className.split(" ")).toContain(cls);
    }
  });
});
