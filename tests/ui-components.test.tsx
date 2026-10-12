/**
 * 기초 컴포넌트(서버 컴포넌트) — Button·Switch·Chip 계열·Card·Skeleton·섹션 머리·링크 탭 (D0-12, DESIGN.md §9)
 * 변형 클래스(토큰 유틸리티)·ARIA 속성·비활성 처리를 본다. 실제 색·크기·hover는 견본 e2e(tests/e2e-specimen)가 브라우저에서 본다.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants, Switch } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardGutter,
  CardNumber,
  CardTabs,
  CardTitle,
  splitLastWord,
} from "@/components/ui/card";
import {
  ContentsRow,
  FilterChip,
  FlatTab,
  IndexTab,
  StampChip,
} from "@/components/ui/chip";
import { ShareIcon } from "@/components/ui/icons";
import {
  BottomTab,
  BottomTabs,
  TopNav,
  TopNavLink,
} from "@/components/ui/nav-tabs";
import { FilterClearButton } from "@/components/ui/filter-clear-button";
import { SectionHead } from "@/components/ui/section-head";
import {
  BriefRowSkeleton,
  CardSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

function classesOf(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

describe("Button", () => {
  it("기본은 주 버튼(잉크 면 → hover 레드 면), type=button", () => {
    render(<Button>모두 보기</Button>);
    const button = screen.getByRole("button", { name: "모두 보기" });
    expect(button).toHaveAttribute("type", "button");
    expect(classesOf(button)).toEqual(
      expect.arrayContaining([
        "bg-ink",
        "text-paper",
        "border-ink",
        "min-h-11",
        "hover:bg-brand-accent",
        "hover:text-brand-accent-foreground",
        "active:translate-y-px",
      ]),
    );
  });

  it.each([
    [
      "secondary",
      ["border-ink", "text-ink", "hover:bg-ink", "aria-pressed:bg-ink"],
    ],
    [
      "link",
      [
        "text-brand-accent-text",
        "underline",
        "decoration-1",
        "hover:decoration-2",
        "min-h-11",
      ],
    ],
    [
      "icon",
      ["h-11", "min-w-11", "hover:bg-current/12", "aria-expanded:bg-paper-2"],
    ],
  ] as const)("변형 %s", (variant, expected) => {
    render(
      <Button variant={variant} aria-label="버튼">
        x
      </Button>,
    );
    expect(classesOf(screen.getByRole("button"))).toEqual(
      expect.arrayContaining([...expected]),
    );
  });

  it("아이콘 상자형: 1px --ink-2 테두리 + --ink 글자, 열림이면 테두리 --ink", () => {
    render(
      <Button variant="icon" box aria-label="공유" aria-expanded>
        <ShareIcon />
      </Button>,
    );
    const button = screen.getByRole("button", { name: "공유" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(classesOf(button)).toEqual(
      expect.arrayContaining([
        "border",
        "border-ink-2",
        "text-ink",
        "aria-expanded:border-ink",
      ]),
    );
    // 아이콘은 장식
    const svg = button.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("stroke-linecap", "square");
  });

  it("비활성: disabled 속성 + --ink-disabled 점선(투명도로 흐리게 하지 않는다)", () => {
    render(<Button disabled>모두 보기</Button>);
    const button = screen.getByRole("button", { name: "모두 보기" });
    expect(button).toBeDisabled();
    const classes = classesOf(button);
    expect(classes).toEqual(
      expect.arrayContaining([
        "disabled:border-dashed",
        "disabled:border-ink-disabled",
        "disabled:text-ink-disabled",
        "disabled:bg-transparent",
      ]),
    );
    expect(classes.some((c) => c.includes("opacity"))).toBe(false);
  });

  it("aria-disabled도 같은 모양(포커스는 남는다)", () => {
    render(<Button aria-disabled="true">모두 보기</Button>);
    const button = screen.getByRole("button", { name: "모두 보기" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(classesOf(button)).toEqual(
      expect.arrayContaining([
        "aria-disabled:border-dashed",
        "aria-disabled:text-ink-disabled",
      ]),
    );
  });

  it("buttonVariants는 링크에도 쓴다", () => {
    render(
      <a href="#x" className={buttonVariants({ variant: "link" })}>
        AI 작성 안내
      </a>,
    );
    expect(classesOf(screen.getByRole("link"))).toContain(
      "text-brand-accent-text",
    );
  });

  it("className은 덧붙인다(병합 없음 — 섬 번들에 tailwind-merge를 넣지 않는다, src/lib/cx.ts)", () => {
    render(<Button className="ml-auto">x</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toEqual(expect.arrayContaining(["ml-auto", "px-4.5"]));
  });
});

describe("Switch(결과 가리기)", () => {
  it("role=switch + aria-checked, 보이는 라벨로 이름을 준다, 선택 칸만 면", () => {
    render(
      <>
        <span id="label">결과 가리기</span>
        <Switch checked aria-labelledby="label" />
      </>,
    );
    const sw = screen.getByRole("switch", { name: "결과 가리기" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    const [off, on] = [...sw.querySelectorAll("span")];
    expect(off).toHaveTextContent("끔");
    expect(on).toHaveTextContent("켬");
    expect(classesOf(on as Element)).toContain("bg-ticket-fg");
    expect(classesOf(off as Element)).not.toContain("bg-ticket-fg");
    // 누르는 영역 확장(::after)
    expect(classesOf(sw)).toEqual(
      expect.arrayContaining(["after:-inset-y-2", "h-7.5"]),
    );
  });

  it("끄면 끔 칸이 면", () => {
    render(
      <>
        <span id="l2">결과 가리기</span>
        <Switch checked={false} aria-labelledby="l2" />
      </>,
    );
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(classesOf(sw.querySelector("span") as Element)).toContain(
      "bg-ticket-fg",
    );
  });
});

describe("FilterChip", () => {
  it("분류 칩: aria-pressed 토글 버튼, 개수, 36px + 46px 누르는 영역", () => {
    render(<FilterChip pressed={false} label="이적" count={4} />);
    const chip = screen.getByRole("button", { name: /이적/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveTextContent("이적4");
    expect(classesOf(chip)).toEqual(
      expect.arrayContaining([
        "h-9",
        "border-ink-2",
        "text-ink",
        "hover:border-ink",
        "aria-pressed:bg-ink",
        "aria-pressed:text-paper",
        "after:-inset-y-1.25",
      ]),
    );
    // ✓는 선택일 때만 보인다(장식)
    const check = within(chip).getByText("✓");
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(classesOf(check)).toEqual(
      expect.arrayContaining(["hidden", "group-aria-pressed/chip:inline"]),
    );
  });

  it("선택이면 aria-pressed=true", () => {
    render(<FilterChip pressed label="이적" count={4} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("한국 선수만: 레드 글자·테두리 → 선택 레드 면", () => {
    render(
      <FilterChip
        tone="korean"
        pressed={false}
        label="한국 선수만"
        count={5}
      />,
    );
    expect(classesOf(screen.getByRole("button"))).toEqual(
      expect.arrayContaining([
        "border-brand-accent-text",
        "text-brand-accent-text",
        "aria-pressed:bg-brand-accent",
        "aria-pressed:text-brand-accent-foreground",
      ]),
    );
  });

  it("비활성(0건): disabled + 점선 --ink-disabled", () => {
    render(<FilterChip pressed={false} label="UCL" count={0} disabled />);
    const chip = screen.getByRole("button", { name: /UCL/ });
    expect(chip).toBeDisabled();
    expect(classesOf(chip)).toEqual(
      expect.arrayContaining([
        "disabled:border-dashed",
        "disabled:text-ink-disabled",
      ]),
    );
  });
});

describe("대회 표식·도장", () => {
  it("평탄 탭: 대회 색 면 + 면 위 글자 + 약칭, 정식 이름은 title", () => {
    render(
      <FlatTab comp="LIGUE1" title="리그 1">
        리그1
      </FlatTab>,
    );
    const tab = screen.getByText("리그1");
    expect(tab).toHaveAttribute("title", "리그 1");
    expect(classesOf(tab)).toEqual(
      expect.arrayContaining([
        "bg-competition-ligue1",
        "text-competition-ligue1-foreground",
        "min-w-11.5",
        "h-5.5",
      ]),
    );
  });

  it("인덱스 탭: 세로쓰기, 너비 --tab-w", () => {
    render(
      <IndexTab comp="EPL" title="프리미어리그">
        EPL
      </IndexTab>,
    );
    const tab = screen.getByTitle("프리미어리그");
    expect(tab).toHaveTextContent("EPL");
    expect(classesOf(tab)).toEqual(
      expect.arrayContaining([
        "w-tab-w",
        "[writing-mode:vertical-rl]",
        "bg-competition-epl",
        "text-competition-epl-foreground",
      ]),
    );
  });

  it("도장 칩: 1px --ink 실선, --text-stamp 800 — 상호작용 없음", () => {
    render(<StampChip>감독·구단</StampChip>);
    const stamp = screen.getByText("감독·구단");
    expect(stamp.tagName).toBe("SPAN");
    expect(classesOf(stamp)).toEqual(
      expect.arrayContaining([
        "border",
        "border-ink",
        "text-type-stamp",
        "font-extrabold",
      ]),
    );
  });
});

describe("ContentsRow(대회 목차 행)", () => {
  it("대회 행: 평탄 탭 + 이름 + 리더 점선 + 개수, 선택이면 ✓(장식)", () => {
    render(
      <ContentsRow
        pressed
        label="라리가"
        count={6}
        marker={{ kind: "competition", comp: "LALIGA", short: "라리가" }}
      />,
    );
    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(classesOf(row)).toEqual(
      expect.arrayContaining([
        "min-h-11",
        "border-b",
        "border-rule",
        "aria-pressed:font-extrabold",
      ]),
    );
    expect(within(row).getByText(/✓/)).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("6")).toBeInTheDocument();
  });

  it("선택이 아니면 ✓ 없음, 분류·한국 행은 칸 표식", () => {
    const { rerender } = render(
      <ContentsRow
        pressed={false}
        label="이적"
        count={4}
        marker={{ kind: "category" }}
      />,
    );
    expect(screen.queryByText(/✓/)).toBeNull();
    rerender(
      <ContentsRow
        pressed
        label="한국 선수 관련만"
        count={5}
        marker={{ kind: "korean" }}
      />,
    );
    // 체크는 CSS 도형(::after) — 글자 ✓가 없다
    expect(screen.queryByText(/✓/)).toBeNull();
  });

  it("비활성(0건): 평탄 탭은 면 없이 안쪽 테두리", () => {
    render(
      <ContentsRow
        pressed={false}
        label="리그 1"
        count={0}
        disabled
        marker={{ kind: "competition", comp: "LIGUE1", short: "리그1" }}
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(classesOf(screen.getByText("리그1"))).toEqual(
      expect.arrayContaining([
        "group-disabled/row:bg-transparent",
        "group-disabled/row:inset-ring",
      ]),
    );
  });
});

describe("Card", () => {
  function SampleCard() {
    return (
      <Card id="c_d8ecc21d28" aria-labelledby="c_d8ecc21d28-t" bleed>
        <CardGutter>
          <CardNumber n={6} />
        </CardGutter>
        <CardBody>
          <CardTitle
            id="c_d8ecc21d28-t"
            href="https://www.bbc.co.uk/sport/football/articles/cwe9lngxzjpno"
            lang="en"
            source="BBC Sport"
          >
            Palmer signs new Chelsea contract until 2034
          </CardTitle>
        </CardBody>
        <CardTabs>
          <IndexTab comp="EPL">EPL</IndexTab>
        </CardTabs>
      </Card>
    );
  }

  it("article + 제목으로 이름, 격자 [--gutter │ 본문 │ --tab-w], 상자·그림자 없음", () => {
    render(<SampleCard />);
    const article = screen.getByRole("article", {
      name: /Palmer signs new Chelsea contract until 2034/,
    });
    expect(article).toHaveAttribute("id", "c_d8ecc21d28");
    const classes = classesOf(article);
    expect(classes).toEqual(
      expect.arrayContaining([
        "grid",
        "grid-cols-[var(--gutter)_minmax(0,1fr)_var(--tab-w)]",
        "border-b",
        "border-rule",
        "target:bg-paper-2",
        "target:animate-arrive",
        "-mr-edge",
        "lg:mr-0",
      ]),
    );
    expect(
      classes.some((c) => /^(rounded|shadow-(?:xs|sm|md|lg))/.test(c)),
    ).toBe(false);
  });

  it("게재 번호: 2자리 0 채움, 장식(aria-hidden), 카드 hover면 레드", () => {
    render(<SampleCard />);
    const no = screen.getByText("06");
    expect(no).toHaveAttribute("aria-hidden", "true");
    expect(classesOf(no)).toEqual(
      expect.arrayContaining([
        "text-num-card-no",
        "text-ink-2",
        "group-hover/card:text-brand-accent",
      ]),
    );
  });

  it("제목 링크: 원문 새 창, 라틴 규칙, ↗는 장식 + 화면 밖 안내, 마지막 단어와 ↗는 붙인다", () => {
    render(<SampleCard />);
    const title = screen.getByRole("heading", { level: 3 });
    expect(title).toHaveAttribute("lang", "en");
    expect(classesOf(title)).toEqual(
      expect.arrayContaining([
        "font-latin",
        "text-type-card-latin",
        "[word-break:normal]",
      ]),
    );
    const link = within(title).getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAccessibleName(
      "Palmer signs new Chelsea contract until 2034 (원문 BBC Sport, 새 창)",
    );
    const mark = within(link).getByText("↗");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.parentElement).toHaveTextContent("2034↗");
    expect(classesOf(mark.parentElement as Element)).toContain(
      "whitespace-nowrap",
    );
  });

  it("한국어 제목은 한글 규칙(800, 46em)", () => {
    render(
      <CardTitle
        id="t"
        href="https://example.com/a"
        lang="ko"
        source="인터풋볼"
      >
        손흥민, 시즌 5호골
      </CardTitle>,
    );
    expect(classesOf(screen.getByRole("heading"))).toEqual(
      expect.arrayContaining([
        "text-type-card",
        "font-extrabold",
        "max-w-[46em]",
      ]),
    );
  });

  it("splitLastWord — 원제목을 바꾸지 않고 마지막 단어만 나눈다", () => {
    expect(splitLastWord("until 2034")).toEqual(["until ", "2034"]);
    expect(splitLastWord("한 단어")).toEqual(["한 ", "단어"]);
    expect(splitLastWord("solo")).toEqual(["", "solo"]);
    const title = "10-man Spurs draw with Man Utd";
    expect(splitLastWord(title).join("")).toBe(title);
  });
});

describe("Skeleton", () => {
  it("--paper-3 면, 움직이지 않음(animate 없음), aria-hidden", () => {
    render(<Skeleton data-testid="s" className="h-4" />);
    const s = screen.getByTestId("s");
    expect(s).toHaveAttribute("aria-hidden", "true");
    expect(classesOf(s)).toContain("bg-paper-3");
    expect(
      classesOf(s).some(
        (c) => c.startsWith("animate") || c.startsWith("rounded"),
      ),
    ).toBe(false);
  });

  it("5줄 행·카드 스켈레톤은 실제 행과 같은 격자, 전체가 aria-hidden", () => {
    const { container } = render(
      <>
        <BriefRowSkeleton />
        <CardSkeleton />
      </>,
    );
    const [brief, card] = [...container.children];
    for (const el of [brief, card]) {
      expect(el).toHaveAttribute("aria-hidden", "true");
      expect(classesOf(el as Element)).toContain(
        "grid-cols-[var(--gutter)_minmax(0,1fr)_var(--tab-w)]",
      );
    }
    expect(classesOf(card as Element)).toContain("min-h-29.5");
  });
});

describe("SectionHead · 필터 머리 색 면", () => {
  it("기본: 3px 잉크 괘선 + h2 + 러닝 헤드(장식, lang=en)", () => {
    render(<SectionHead heading="주요 뉴스" runningHead="SQUAD" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "주요 뉴스" }),
    ).toBeInTheDocument();
    const rh = screen.getByText("SQUAD");
    expect(rh).toHaveAttribute("aria-hidden", "true");
    expect(rh).toHaveAttribute("lang", "en");
  });

  it("대회 필터: 대회 색 면 + 링 재정의, 러닝 헤드 대신 약칭 상자 + 해제 버튼", () => {
    const { container } = render(
      <SectionHead
        heading="주요 뉴스"
        runningHead="SQUAD"
        filter={{
          comp: "SERIEA",
          short: "세리에A",
          clear: <FilterClearButton />,
        }}
      />,
    );
    const head = container.firstElementChild as Element;
    expect(classesOf(head)).toEqual(
      expect.arrayContaining([
        "bg-competition-seriea",
        "text-competition-seriea-foreground",
        "border-t-competition-seriea",
        "[--ring:var(--competition-seriea-foreground)]",
      ]),
    );
    expect(screen.queryByText("SQUAD")).toBeNull();
    expect(screen.getByText("세리에A")).toBeInTheDocument();
    const clear = screen.getByRole("button", { name: "해제 대회 필터" });
    expect(classesOf(clear)).toEqual(
      expect.arrayContaining(["min-h-11", "min-w-11"]),
    );
  });
});

describe("링크 탭(하단 탭·상단 내비)", () => {
  it("현재 페이지는 aria-current=page, 아니면 속성 없음 — ARIA 탭이 아니다", () => {
    render(
      <>
        <BottomTabs>
          <BottomTab href="/" icon={<span />} current>
            홈
          </BottomTab>
          <BottomTab href="/news/" icon={<span />}>
            뉴스
          </BottomTab>
        </BottomTabs>
        <TopNav>
          <TopNavLink href="/" current>
            홈
          </TopNavLink>
        </TopNav>
      </>,
    );
    expect(
      screen.getByRole("navigation", { name: "하단 탭" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "주요 메뉴" }),
    ).toBeInTheDocument();
    const [home, news] = within(
      screen.getByRole("navigation", { name: "하단 탭" }),
    ).getAllByRole("link");
    expect(home).toHaveAttribute("aria-current", "page");
    expect(news).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(classesOf(home as Element)).toEqual(
      expect.arrayContaining([
        "min-h-14.5",
        "aria-[current=page]:text-ink",
        "aria-[current=page]:before:block",
      ]),
    );
  });
});
