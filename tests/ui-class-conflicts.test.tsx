/**
 * cx(병합 없음) 기반 컴포넌트의 클래스 겹침 검사 (D0-12 리뷰, DESIGN.md §9.4 "클래스 합치기", src/lib/cx.ts)
 *
 * 클라이언트 섬과 섬에서 쓰는 컴포넌트(버튼·칩·아이콘·탭·토스트·테마 토글·필터 해제 버튼)는 tailwind-merge 없이 클래스를
 * 이어 붙인다. 같은 조건(변형)에서 같은 CSS 속성을 두 클래스가 정하면 어느 쪽이 이길지 CSS 순서에 달리므로, 모든 변형·상태를
 * 렌더해 요소마다 겹침이 없는지 본다(분류는 tests/support/class-conflicts.ts — 모르는 유틸리티도 실패로 알린다).
 */
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants, Switch } from "@/components/ui/button";
import { BUTTON_VARIANTS, ICON_BUTTON } from "@/components/ui/button-classes";
import {
  ContentsRow,
  FilterChip,
  FlatTab,
  IndexTab,
  StampChip,
} from "@/components/ui/chip";
import { COMPETITION_SURFACE } from "@/components/ui/competition";
import { FilterClearButton } from "@/components/ui/filter-clear-button";
import * as Icons from "@/components/ui/icons";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { dismissToast, toast, Toaster, ToastView } from "@/components/ui/toast";
import type { CompId } from "@/lib/schema/common";

import {
  findClassConflicts,
  findDomClassConflicts,
  splitVariants,
} from "./support/class-conflicts";

const COMPS = Object.keys(COMPETITION_SURFACE) as CompId[];

describe("겹침 분류기(tests/support/class-conflicts.ts)", () => {
  it.each([
    ["px-4.5 px-2", "px-4.5 ↔ px-2 (padding-left, padding-right)"],
    ["p-0 pl-3", "p-0 ↔ pl-3 (padding-left)"],
    ["text-sm text-[13px]", "text-sm ↔ text-[13px] (font-size)"],
    ["text-ink text-paper", "text-ink ↔ text-paper (color)"],
    ["border border-t-3", "border ↔ border-t-3 (border-width-top)"],
    [
      "border-ink border-t-competition-epl",
      "border-ink ↔ border-t-competition-epl (border-color-top)",
    ],
    [
      "hover:bg-ink hover:bg-paper-2",
      "hover:bg-ink ↔ hover:bg-paper-2 (background-color)",
    ],
    ["inline-flex grid", "inline-flex ↔ grid (display)"],
    [
      "items-center place-items-center",
      "items-center ↔ place-items-center (align-items)",
    ],
    [
      "font-extrabold font-semibold",
      "font-extrabold ↔ font-semibold (font-weight)",
    ],
    [
      "[--ring:var(--paper)] [--ring:var(--ink)]",
      "[--ring:var(--paper)] ↔ [--ring:var(--ink)] (--ring)",
    ],
    ["-ml-2 ml-1", "-ml-2 ↔ ml-1 (margin-left)"],
    [
      "decoration-1 decoration-2",
      "decoration-1 ↔ decoration-2 (text-decoration-thickness)",
    ],
  ])("겹침을 찾는다: %s", (classes, expected) => {
    expect(findClassConflicts(classes).conflicts).toContain(expected);
  });

  it.each([
    "text-sm text-ink text-left leading-none",
    "bg-ink hover:bg-brand-accent aria-pressed:bg-ink disabled:bg-transparent",
    "border border-ink border-dashed",
    "font-extrabold font-numeric",
    "underline decoration-1 underline-offset-4 decoration-ink",
    "[--ring:var(--paper)] aria-selected:[--ring:var(--ink)]",
    "inset-x-0 bottom-19 lg:bottom-7",
    "inset-ring inset-ring-ink-disabled",
    "px-2.5 -ml-2",
    "flex flex-none flex-col flex-wrap",
    "group/chip relative",
  ])("겹치지 않는다: %s", (classes) => {
    expect(findClassConflicts(classes)).toEqual({ conflicts: [], unknown: [] });
  });

  it("변형은 대괄호·괄호 안의 콜론에서 나누지 않는다", () => {
    expect(splitVariants("aria-selected:[--ring:var(--ink)]")).toEqual({
      variants: ["aria-selected"],
      utility: "[--ring:var(--ink)]",
    });
    expect(splitVariants("group-aria-pressed/row:after:block")).toEqual({
      variants: ["group-aria-pressed/row", "after"],
      utility: "block",
    });
  });

  it("모르는 유틸리티는 unknown으로 돌려준다(검사가 조용히 빠지지 않게)", () => {
    expect(findClassConflicts("frobnicate-3 px-2").unknown).toEqual([
      "frobnicate-3",
    ]);
  });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

/** 렌더하고 모든 요소의 클래스를 검사한다 */
function check(element: ReactElement) {
  const { container, unmount } = render(element);
  const report = findDomClassConflicts(container);
  unmount();
  return report;
}

const ICON_COMPONENTS = Object.entries(Icons).filter(
  (entry): entry is [string, (props: Icons.IconProps) => ReactElement] =>
    typeof entry[1] === "function" && entry[0].endsWith("Icon"),
);

const CASES: ReadonlyArray<[string, () => ReactElement]> = [
  // box(상자형)는 아이콘 변형에만 쓴다(button-classes.ts BUTTON_BOX)
  ...(
    [
      ["primary", false],
      ["secondary", false],
      ["link", false],
      ["icon", false],
      ["icon", true],
    ] as const
  ).map(
    ([variant, box]) =>
      [
        `Button ${variant}${box ? " box" : ""}`,
        () => (
          <>
            <Button variant={variant} box={box}>
              x
            </Button>
            <Button variant={variant} box={box} disabled>
              x
            </Button>
            <Button variant={variant} box={box} aria-pressed>
              x
            </Button>
          </>
        ),
      ] as [string, () => ReactElement],
  ),
  [
    "buttonVariants 링크·ICON_BUTTON 문자열",
    () => (
      <>
        <a href="#x" className={buttonVariants({ variant: "link" })}>
          x
        </a>
        <button type="button" className={ICON_BUTTON}>
          x
        </button>
      </>
    ),
  ],
  [
    "Switch 켬·끔",
    () => (
      <>
        <span id="l">결과 가리기</span>
        <Switch checked aria-labelledby="l" />
        <Switch checked={false} aria-labelledby="l" />
      </>
    ),
  ],
  ...(["category", "korean"] as const).map(
    (tone) =>
      [
        `FilterChip ${tone}`,
        () => (
          <>
            <FilterChip tone={tone} pressed={false} label="이적" count={4} />
            <FilterChip tone={tone} pressed label="이적" count={4} />
            <FilterChip
              tone={tone}
              pressed={false}
              label="UCL"
              count={0}
              disabled
            />
          </>
        ),
      ] as [string, () => ReactElement],
  ),
  [
    "ContentsRow 대회·분류·한국 × 선택·비활성",
    () => (
      <>
        {[true, false].flatMap((pressed) =>
          [
            {
              kind: "competition" as const,
              comp: "EPL" as const,
              short: "EPL",
            },
            { kind: "category" as const },
            { kind: "korean" as const },
          ].map((marker) => (
            <ContentsRow
              key={`${marker.kind}-${pressed}`}
              pressed={pressed}
              label="행"
              count={3}
              marker={marker}
              disabled={!pressed}
            />
          )),
        )}
      </>
    ),
  ],
  [
    "FlatTab·IndexTab 6대회 × 크기(머리기사 탭 포함), StampChip",
    () => (
      <>
        {COMPS.map((comp) => (
          <span key={comp}>
            <FlatTab comp={comp}>약칭</FlatTab>
            <FlatTab comp={comp} size="contents">
              약칭
            </FlatTab>
            <IndexTab comp={comp}>약칭</IndexTab>
            <IndexTab comp={comp} lead>
              약칭
            </IndexTab>
          </span>
        ))}
        <StampChip>이적</StampChip>
      </>
    ),
  ],
  [
    "아이콘 전부",
    () => (
      <>
        {ICON_COMPONENTS.map(([name, Icon]) => (
          <Icon key={name} />
        ))}
      </>
    ),
  ],
  [
    "Tabs — 대회 6색·잉크 면·비활성·패널",
    () => (
      <Tabs defaultValue="EPL">
        <TabsList aria-label="대회">
          {COMPS.map((comp) => (
            <TabsTrigger key={comp} value={comp} competition={comp}>
              {comp}
            </TabsTrigger>
          ))}
          <TabsTrigger value="plain">잉크</TabsTrigger>
          <TabsTrigger value="off" disabled>
            비활성
          </TabsTrigger>
        </TabsList>
        <TabsPanel value="EPL">패널</TabsPanel>
      </Tabs>
    ),
  ],
  [
    "ToastView — 글자로 끝남·액션·닫기·액션+닫기·정적",
    () => (
      <>
        <ToastView>문구</ToastView>
        <ToastView kind="새 소식" action={{ label: "새로고침" }}>
          문구
        </ToastView>
        <ToastView onDismiss={() => {}}>문구</ToastView>
        <ToastView kind="공유" action={{ label: "열기" }} onDismiss={() => {}}>
          문구
        </ToastView>
        <ToastView animated={false}>문구</ToastView>
      </>
    ),
  ],
  [
    "테마 토글 · 필터 해제 버튼",
    () => (
      <>
        <ThemeToggle />
        <FilterClearButton />
      </>
    ),
  ],
];

describe("cx 기반 컴포넌트 — 한 요소 안에서 같은 조건으로 같은 CSS 속성을 두 번 정하지 않는다", () => {
  it("아이콘을 모두 찾았다", () => {
    expect(ICON_COMPONENTS.length).toBeGreaterThanOrEqual(11);
  });

  it.each(CASES)("%s", (_name, element) => {
    expect(check(element())).toEqual({ conflicts: [], unknown: [] });
  });

  it("Toaster — 영역 + 띄운 토스트(액션·닫기)", () => {
    const { container, unmount } = render(<Toaster />);
    act(() => {
      toast({
        message: "새 소식 3건",
        kind: "새 소식",
        action: { label: "새로고침", onClick: () => {} },
        dismissible: true,
      });
    });
    expect(findDomClassConflicts(container)).toEqual({
      conflicts: [],
      unknown: [],
    });
    act(() => dismissToast());
    unmount();
  });

  it("Button 변형 문자열(BUTTON_VARIANTS) 자체에도 겹침이 없다", () => {
    for (const [variant, classes] of Object.entries(BUTTON_VARIANTS)) {
      expect(findClassConflicts(classes), variant).toEqual({
        conflicts: [],
        unknown: [],
      });
    }
  });
});
