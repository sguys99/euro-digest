import type { ReactNode } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { BUTTON_BASE } from "@/components/ui/button-classes";
import { cx } from "@/lib/cx";

/**
 * 결과 가림 표식 4종 — 서버 컴포넌트(JS 0). 모두 `data-spoil-mask`라 가림이 켜졌고 펼치지 않았을 때만 보인다(globals.css §13). 누르면 펼치는
 * 것은 스위치 섬의 문서 수준 위임 하나(src/lib/spoiler.ts `handleSpoilerClick`)다. 새 색·폰트 토큰 없음 — `--hatch` 빗금 + 1px `--ink-2`
 * 점선 · `--paper` 칸 · `--paper-2` + 4px `--brand-accent` 안내 띠(DESIGN §2.9).
 *
 * | 표식 | 쓰는 곳 | DESIGN |
 * |------|---------|--------|
 * | `SpoilerFlap` 띠(버튼) | 5줄 결과 줄 · spoiler 뉴스 카드 · 뉴스 행 · 375 순위표 펼침의 최근 경기 | §9.3 '결과 가림(줄·카드)' |
 * | `SpoilerCellButton` 결과 가림 칸(버튼) | 선수 기록 결과 칸 · 경기 줄 스코어 · 팀 일정 결과 · 팀 티켓 폼 · 대표팀 결과 · MVP 근거 | §9.3 '결과 가림 칸' |
 * | `SpoilerHatch` 빗금 자리(장식 + 화면 밖 글자) | 순위표 변동 ▲▼ · 최근 5경기 · 홈 순위 미니 변동 | §9.3 '결과 가림 — 순위표' |
 * | `SpoilerVeil` 안내 띠(+ 보조 버튼) | 5줄 모두 결과('모두 보기') · 순위표('변동 보기') · 순위 미니('변동 보기') | §9.3 안내 띠 |
 */

/** 빗금 면 — `--hatch` −45°, 5px 선 · 5px 간격(DESIGN §2.9) */
const HATCH =
  "bg-[repeating-linear-gradient(-45deg,var(--hatch)_0_5px,transparent_5px_10px)]";
/** 작은 빗금 자리용 — 3px 선 · 3px 간격(시안 `hx--fine`) */
const HATCH_FINE =
  "bg-[repeating-linear-gradient(-45deg,var(--hatch)_0_3px,transparent_3px_6px)]";

/**
 * 결과 가림 띠 — 최소 44px, 1px `--ink-2` 점선 + 빗금, "결과 가림"(800) + 설명(`--ink-2` — "{n}번 줄" · "경기 결과 제목") + "보기" 칸(`--paper`
 * 면, 왼쪽 점선, 16px 꺾쇠). 띠 전체가 버튼이다. `descId`를 주면 설명 글자에 그 id를 달고 버튼 설명으로 잇는다(카드 — DESIGN §9.3)
 */
export function SpoilerFlap({
  children,
  descId,
  className,
}: {
  /** 설명 — 가린 내용이 무엇인지(결과를 드러내지 않는 말) */
  children: ReactNode;
  descId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-spoil-mask=""
      data-spoil-reveal=""
      aria-describedby={descId}
      className={cx(
        "group/flap flex min-h-11 w-full items-center gap-2.5 border border-dashed border-ink-2 bg-transparent py-0 pl-3 text-left text-[13px] leading-[1.3] text-ink transition-colors duration-fast ease-print hover:border-ink",
        HATCH,
        className,
      )}
    >
      <span className="flex-none font-extrabold">결과 가림</span>
      <span id={descId} className="min-w-0 flex-1 py-1.5 text-ink-2">
        {children}
      </span>
      <span className="inline-flex items-center gap-0.5 self-stretch border-l border-dashed border-ink-2 bg-paper pr-2.5 pl-3 font-extrabold transition-colors duration-fast ease-print group-hover/flap:border-ink">
        보기
        <ChevronDownIcon size={16} />
      </span>
    </button>
  );
}

/**
 * 결과 가림 칸 — 최소 44×64px(`wide`면 폭 112px — 폼 칩 5칸 줄 자리), 1px dashed `--ink-2` + 빗금 + "보기"(`--paper` 칸, 12px 800).
 * 버튼 이름은 "{날짜} {상대}전 결과 보기"처럼 무엇의 결과인지(DESIGN §9.3) — 보이는 글자 "보기"를 포함한다(WCAG 2.5.3)
 */
export function SpoilerCellButton({
  label,
  wide = false,
  className,
}: {
  label: string;
  wide?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-spoil-mask=""
      data-spoil-reveal=""
      aria-label={label}
      // 몸 = globals.css §14 `spoil-cell`(빗금 포함 — 위 HATCH와 같은 값, 경기 줄마다 반복돼 짧은 이름으로 — M5-07)
      className={cx("spoil-cell", wide ? "min-w-28" : "min-w-16", className)}
    >
      <span className="bg-paper px-1.25 py-0.5">보기</span>
    </button>
  );
}

/**
 * 빗금 자리 — 누를 수 없는 표식(펼치기는 표 · 패널 단위의 안내 띠 버튼이 맡는다). 빗금 상자는 장식(`aria-hidden`), 화면 밖 글자가 뜻
 * ("변동 가림" · "최근 5경기 가림"). 크기는 쓰는 곳이 준다(변동 26×13 · 최근 5경기 112×20)
 */
export function SpoilerHatch({
  sr,
  box,
  className,
}: {
  /** 화면 밖 글자 */
  sr: string;
  /** 빗금 상자 크기 클래스(예: `h-3.25 w-6.5`) */
  box: string;
  className?: string;
}) {
  return (
    <span data-spoil-mask="" className={cx("block", className)}>
      <span
        aria-hidden="true"
        className={cx(
          "block border border-dashed border-ink-2",
          HATCH_FINE,
          box,
        )}
      />
      <span className="sr-only">{sr}</span>
    </span>
  );
}

/** 안내 띠 보조 버튼 — §9.2 Button 보조(1px 잉크 → hover 반전)의 작은 크기(최소 44px · 좌우 12px · 13px, 시안 `btn--s`) */
const VEIL_BUTTON = `${BUTTON_BASE} min-h-11 flex-none justify-center border border-ink bg-transparent px-3 text-[13px] text-ink no-underline hover:bg-ink hover:text-paper active:translate-y-px`;

/** 안내 띠 보조 버튼만(띠 없이 — 홈 순위 미니 패널 아래 줄 '변동 보기') */
export function SpoilerRevealButton({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** 접근 이름 — 무엇을 펴는지("라리가 순위 변동 보기") */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-spoil-mask=""
      data-spoil-reveal=""
      aria-label={label}
      className={cx(VEIL_BUTTON, className)}
    >
      {children}
    </button>
  );
}

/**
 * 결과 가림 안내 띠 — `--paper-2` 면 + 왼쪽 4px `--brand-accent` 막대, "결과 가리기 켜짐."(800) + 안내(`--ink-2`) + 보조 버튼(그 단위를 모두
 * 편다). 띠 자체는 표식이라 펼치면 사라진다
 */
export function SpoilerVeil({
  children,
  action,
  actionLabel,
  className,
}: {
  /** 안내 문장 */
  children: ReactNode;
  /** 버튼 글자("모두 보기" · "변동 보기") */
  action: string;
  /** 버튼 접근 이름(보이는 글자를 포함) */
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div
      data-spoil-mask=""
      data-slot="spoiler-veil"
      className={cx(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-l-4 border-brand-accent bg-paper-2 py-2.5 pr-3 pl-3.5 text-[13.5px] leading-normal",
        className,
      )}
    >
      <p className="min-w-0 flex-[1_1_18em]">
        <b className="font-extrabold">결과 가리기 켜짐.</b>{" "}
        <span className="text-ink-2">{children}</span>
      </p>
      <button
        type="button"
        data-spoil-reveal=""
        aria-label={actionLabel}
        className={VEIL_BUTTON}
      >
        {action}
      </button>
    </div>
  );
}
