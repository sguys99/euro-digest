import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import type { CompId } from "@/lib/schema/common";
import { cx } from "@/lib/cx";

import { COMPETITION_SURFACE } from "./competition";

/**
 * Chip 계열 (DESIGN.md §9.2 Chip · §9.3 도장 칩·평탄 탭·인덱스 탭, D0-12)
 *
 * | 컴포넌트      | 요소                    | 쓰는 곳 |
 * |---------------|-------------------------|---------|
 * | `FilterChip`  | `<button aria-pressed>` | 1023 이하 칩 줄 — 분류(`tone="category"`)·한국 선수만(`tone="korean"`) (FR-31·FR-32) |
 * | `ContentsRow` | `<button aria-pressed>` | 1024 이상 목차 행 — 대회(평탄 탭)·분류(10px 칸)·한국 선수(16px 체크 칸) |
 * | `StampChip`   | `<span>`                | 카드 태그 줄의 분류 도장(상호작용 없음) |
 * | `FlatTab`     | `<span>`                | 대회 약칭 평탄 탭(목차·범례) — 대회 색 면 + 약칭 |
 * | `IndexTab`    | `<span>`                | 카드·5줄 오른쪽 세로 인덱스 탭 — 대회 색 면 + 약칭(세로쓰기) |
 *
 * - 모두 서버 컴포넌트(상태 없음)라 JS를 만들지 않는다. 눌림 상태는 서버가 처음 값(`pressed`)을 그리고, 필터 부트 스크립트·섬(M1-33)이
 *   `aria-pressed`·`disabled` 속성만 바꾼다(클릭은 위임 리스너 — src/lib/news/filter-dom.ts). 개수 뒤 화면 밖 "건"(접근 이름 "이적 4건").
 *   섬 안에서도 쓰이므로 `cn`(tailwind-merge) 대신 `cx`(병합 없음)로 합친다 — 바깥 `className`은 여백·배치만 준다.
 * - 선택은 반전(잉크 면 + 지면 글자)이나 레드 면 + ✓ + 굵기다(색만으로 전하지 않는다, DESIGN §10).
 * - 비활성(0건)은 --ink-disabled 글자·점선(opacity 금지). 보이는 높이 36px인 칩은 `::after`로 누르는 영역을 46px로 넓힌다.
 * - 대회 색 면에는 항상 약칭 글자를 같이 쓰고(D29) 정식 이름은 `title`로 준다.
 */

// ─── FilterChip ─────────────────────────────────────────────────────────────

export const filterChipVariants = cva(
  [
    "group/chip relative my-1 inline-flex h-9 flex-none snap-start items-center gap-1.5 border bg-transparent px-3 text-[13.5px] font-extrabold",
    "transition-colors duration-fast ease-print",
    // 터치 타깃: 보이는 36px → 위아래 5px·좌우 3px 넓혀 46px(DESIGN §9.1)
    "after:absolute after:-inset-x-0.75 after:-inset-y-1.25 after:content-['']",
    "hover:border-ink",
    "disabled:border-dashed disabled:border-ink-disabled disabled:text-ink-disabled",
  ],
  {
    variants: {
      tone: {
        /** 분류 칩: 면 없음 · 1px --ink-2 → 선택 = 잉크 면 반전 */
        category:
          "border-ink-2 text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper",
        /** 한국 선수만: 레드 글자·테두리 → 선택 = 레드 면 */
        korean:
          "border-brand-accent-text text-brand-accent-text aria-pressed:border-brand-accent aria-pressed:bg-brand-accent aria-pressed:text-brand-accent-foreground",
      },
    },
    defaultVariants: { tone: "category" },
  },
);

export interface FilterChipProps
  extends
    Omit<ComponentProps<"button">, "aria-pressed" | "children">,
    VariantProps<typeof filterChipVariants> {
  /** 선택(필터 켬) — `aria-pressed` */
  pressed: boolean;
  /** 칩 이름(예: "이적", "한국 선수만") */
  label: ReactNode;
  /** 해당 카드 수(Barlow 600 16px). 0이면 보통 `disabled`와 함께 쓴다 */
  count: number;
}

/** 분류 칩·한국 선수만 칩 — 토글 버튼(`aria-pressed`), 칩 줄은 `role="group" aria-label="분류 필터"`로 감싼다 */
export function FilterChip({
  pressed,
  label,
  count,
  tone,
  className,
  type = "button",
  ...props
}: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(filterChipVariants({ tone }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="hidden text-xs group-aria-pressed/chip:inline"
      >
        ✓
      </span>
      {label}
      <span className="font-numeric text-base leading-none font-semibold text-ink-2 tabular-nums group-disabled/chip:text-current group-aria-pressed/chip:text-current">
        {count}
        <span className="sr-only">건</span>
      </span>
    </button>
  );
}

// ─── 대회 표식: FlatTab · IndexTab ──────────────────────────────────────────

export interface CompetitionMarkProps extends Omit<
  ComponentProps<"span">,
  "children"
> {
  /** 대회 ID — 색 면을 고른다 */
  comp: CompId;
  /** 약칭(`configs/competitions.json` shortKo — EPL·라리가·세리에A·분데스·리그1·UCL) */
  children: string;
  /** 정식 대회명(마우스 올림 설명) */
  title?: string;
}

export const flatTabVariants = cva(
  [
    "inline-flex h-5.5 items-center justify-center px-1.5 text-[11.5px] leading-none font-extrabold tracking-[-0.01em]",
    "transition-colors duration-base ease-print",
  ],
  {
    variants: {
      size: {
        /** 범례·필터 등 — 최소 46px */
        default: "min-w-11.5",
        /** 목차 행 안 — 최소 42px. 목차 행이 비활성(0건)이면 면 없이 1px --ink-disabled 안쪽 테두리 */
        contents:
          "min-w-10.5 group-disabled/row:bg-transparent group-disabled/row:text-ink-disabled group-disabled/row:inset-ring group-disabled/row:inset-ring-ink-disabled",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/** 평탄 탭 — 대회 약칭 칩(최소 46px × 22px, 11.5px 800, 대회 색 면) */
export function FlatTab({
  comp,
  size,
  className,
  children,
  ...props
}: CompetitionMarkProps & VariantProps<typeof flatTabVariants>) {
  return (
    <span
      className={cx(
        flatTabVariants({ size }),
        COMPETITION_SURFACE[comp],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * 인덱스 탭 — 카드·5줄 행 오른쪽 열의 세로 대회 탭(너비 --tab-w, 세로쓰기, 10.5px · ≥1024 11px 800).
 * `writing-mode`는 점진적 향상이다(지원하지 않으면 가로로 좁게 나온다). 약칭 글자가 접근 이름이다.
 * `lead`(머리기사, M1-31): 1024 이상에서 카드 높이만큼 늘이고 12px(DESIGN §9.3 머리기사) — 카드에 `data-lead`가 있을 때만(M1-33 필터 결과는
 * 속성을 지운다). 1023 이하는 일반 탭과 같다.
 */
export function IndexTab({
  comp,
  lead = false,
  className,
  children,
  ...props
}: CompetitionMarkProps & { lead?: boolean }) {
  return (
    <span
      data-slot="index-tab"
      className={cx(
        "flex w-tab-w items-center justify-center pt-1.75 pb-1.5 font-sans text-[10.5px] leading-[1.08] font-extrabold tracking-normal [text-orientation:upright] [writing-mode:vertical-rl]",
        "transition-colors duration-base ease-print lg:pt-2.25 lg:pb-2",
        // 머리기사: 카드(`group/card`)에 `data-lead`가 있을 때만 — 필터 결과(M1-33)는 속성을 지워 일반 탭으로 돌아간다
        "lg:text-[11px]",
        lead &&
          "lg:group-data-lead/card:flex-1 lg:group-data-lead/card:text-[12px]",
        COMPETITION_SURFACE[comp],
        className,
      )}
      {...props}
    >
      {/* 세로쓰기 글자 줄 길이를 글꼴과 무관하게 고정한다 — 웹폰트(EuroDigest Sans)는 세로 메트릭(vmtx)이 없어 글자마다 ascent + descent
          (약 1.19em, 화면에서 1.24em 안팎으로 반올림)를 쓰고, 메트릭 폴백(맑은 고딕·Noto)은 1em × size-adjust라 웹폰트가 오면 탭이 약 11px
          길어져 5줄 행 전체가 밀렸다(홈 CLS 0.15 — M2-16). 글자 수 × 1.25em 상자 안에서 가운데 정렬 */}
      <span
        className="block text-center"
        style={{ height: `${[...children].length * 1.25}em` }}
      >
        {children}
      </span>
    </span>
  );
}

// ─── StampChip ──────────────────────────────────────────────────────────────

/** 분류 도장 — 1px --ink 실선, --text-stamp 800, 안쪽 3·6·2px. 상호작용 없는 표식(카드 태그 줄 맨 앞) */
export function StampChip({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cx(
        "inline-block flex-none border border-ink px-1.5 pt-0.75 pb-0.5 text-type-stamp font-extrabold tracking-[0.01em] text-ink",
        className,
      )}
      {...props}
    />
  );
}

// ─── ContentsRow ────────────────────────────────────────────────────────────

/** 목차 행 앞 표식 */
export type ContentsMarker =
  | { kind: "competition"; comp: CompId; short: string; title?: string }
  | { kind: "category" }
  | { kind: "korean" };

export interface ContentsRowProps extends Omit<
  ComponentProps<"button">,
  "aria-pressed" | "children"
> {
  pressed: boolean;
  /** 행 이름(대회 정식 이름·분류 이름·"한국 선수 관련만") */
  label: ReactNode;
  count: number;
  marker: ContentsMarker;
}

function ContentsMarkerView({ marker }: { marker: ContentsMarker }) {
  switch (marker.kind) {
    case "competition":
      // 행 이름이 정식 대회명이라 약칭은 보이는 표식만(D29) — 접근 이름이 "라리가 라리가 6건"처럼 겹치지 않게 숨긴다(M1-33)
      return (
        <FlatTab
          comp={marker.comp}
          size="contents"
          title={marker.title}
          aria-hidden="true"
        >
          {marker.short}
        </FlatTab>
      );
    case "category":
      // 분류 행 — 10px 칸, 선택이면 --brand-accent 면
      return (
        <span
          aria-hidden="true"
          className="size-2.5 flex-none border border-ink-2 group-aria-pressed/row:border-brand-accent group-aria-pressed/row:bg-brand-accent"
        />
      );
    case "korean":
      // 한국 선수 행 — 16px 체크 칸, 선택이면 --brand-accent 면 + 체크(CSS 도형)
      return (
        <span
          aria-hidden="true"
          className={cx(
            "grid size-4 flex-none place-items-center border-[1.5px] border-ink-2",
            "group-aria-pressed/row:border-brand-accent group-aria-pressed/row:bg-brand-accent",
            "after:hidden after:h-2.25 after:w-1.25 after:-translate-y-px after:rotate-45 after:border-r-2 after:border-b-2 after:border-brand-accent-foreground after:content-['']",
            "group-aria-pressed/row:after:block",
          )}
        />
      );
  }
}

/**
 * 대회 목차 행(1024 이상 왼쪽 목차) — 표식 + 이름 + 리더 점선 + 개수(Barlow 600 17px).
 * 최소 44px, 14px, 아래 1px --rule. hover는 이름 밑줄(3px 띄움), 선택은 800 굵기 + 개수 --ink(대회 행은 이름 뒤 ✓),
 * 비활성(0건)은 글자·개수 --ink-disabled이고 평탄 탭은 면 없이 안쪽 테두리.
 */
export function ContentsRow({
  pressed,
  label,
  count,
  marker,
  className,
  type = "button",
  ...props
}: ContentsRowProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(
        "group/row flex min-h-11 w-full items-center gap-1.75 border-b border-rule bg-transparent p-0 text-left text-sm leading-[1.3] text-ink",
        "disabled:text-ink-disabled aria-pressed:font-extrabold",
        className,
      )}
      {...props}
    >
      <ContentsMarkerView marker={marker} />
      <span className="min-w-0 underline-offset-3 group-hover/row:underline">
        {label}
        {/* 대회 행 ✓는 늘 그려 두고 눌림(aria-pressed)에만 보인다 — 필터 섬이 속성만 바꿔도 따라온다(M1-33). 공백도 글자 안에 두어 숨으면 같이 빠진다 */}
        {marker.kind === "competition" ? (
          <span
            aria-hidden="true"
            className="hidden whitespace-pre text-brand-accent-text group-aria-pressed/row:inline"
          >
            {" ✓"}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className="min-w-2 flex-1 translate-y-1 border-b-2 border-dotted border-ink-3"
      />
      <span className="min-w-4.5 text-right font-numeric text-[17px] leading-none font-semibold text-ink-2 tabular-nums group-disabled/row:text-ink-disabled group-aria-pressed/row:text-ink">
        {count}
        <span className="sr-only">건</span>
      </span>
    </button>
  );
}
