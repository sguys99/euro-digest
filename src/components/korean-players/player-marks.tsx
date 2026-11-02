import Link from "next/link";
import type { ReactNode } from "react";

import { FormChip } from "@/components/competition/form-chip";
import { TeamBadge } from "@/components/team/team-badge";
import { FlatTab, flatTabVariants } from "@/components/ui/chip";
import { FORM_WORD } from "@/lib/competition-view";
import type {
  AppearanceView,
  CompMark,
  NumberTone,
  OpponentView,
  ResultView,
} from "@/lib/korean-players-view";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";

/**
 * 한국 선수 화면 표식 — 출전 분 거터 · 결과 칸 · 대회 표식 · 상대 팀 · 상태 도장 (DESIGN §9.3 "D2 — 한국 선수·이적·마이 팀 화면"
 * 숫자 상태 규칙 · 출전 분 거터 · 결과 칸 · 스코어 맥락, §3.5, plan M3-09 — 상세(M3-10)·홈 위젯(M3-11)도 같은 표식을 쓴다)
 *
 * 서버 컴포넌트(JS 0). 색만으로 뜻을 전하지 않는다 — 윤곽·대시 숫자는 장식(`aria-hidden`)이고 뜻은 늘 함께 쓰는 상태 글자와 화면 밖 글자,
 * W/D/L은 글자 + 화면 밖 "승·무·패".
 */

/** 숫자 상태 규칙(DESIGN §9.3 D2): 실선 `--ink` · 윤곽(채움 투명 + 1.5px `--ink-2` 외곽선) · 대시 `--ink-2` */
export const NUMBER_TONE: Readonly<Record<NumberTone, string>> = {
  on: "text-ink",
  zero: "text-transparent [-webkit-text-stroke:1.5px_var(--ink-2)]",
  null: "text-ink-2",
};

/**
 * 출전 분 거터 — 숫자 N3(Barlow 800 · 행간 0.86) + 아래 상태 글자 11px 800(출전 = `--ink`, 그 밖 `--ink-2`). 숫자·글자는 장식, 화면 밖
 * "{상태} {n}분". 폭(`--gutter-date`)은 담는 칸이 정한다.
 */
export function MinutesGutter({
  appearance,
  narrow = false,
}: {
  appearance: AppearanceView;
  /** 좁은 단(홈 위젯 · 1280 마주 보는 면 — 거터 44px): 숫자 28px 고정(DESIGN §9.3 D2 출전 분 거터) */
  narrow?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        data-tone={appearance.tone}
        className={cx(
          "block font-numeric leading-[0.86] font-extrabold tracking-[-0.02em] tabular-nums",
          narrow ? "text-[28px]" : "text-num-n3",
          NUMBER_TONE[appearance.tone],
        )}
      >
        {appearance.text}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "mt-1.5 block text-[11px] leading-[1.2] font-extrabold whitespace-nowrap",
          appearance.strong ? "text-ink" : "text-ink-2",
        )}
      >
        {appearance.label}
      </span>
      <span className="sr-only">{appearance.sr}</span>
    </>
  );
}

/** 골·도움 배지 — `--brand-accent` 면 + 면 위 글자, 숫자 Barlow 800 13px */
function GoalBadge({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="inline-flex items-center bg-brand-accent px-1.25 pt-0.5 pb-px text-[11.5px] leading-[1.25] font-extrabold text-brand-accent-foreground">
      <span className="mr-px font-numeric text-[13px] tabular-nums">{n}</span>
      {unit}
    </span>
  );
}

/**
 * 결과 칸 — 선수·팀 기준 행(스코어 맥락 규칙, D64 ③): `[W/D/L 칩] 기준 팀 득점-상대 · 홈/원정` + 아래 승부차기 · 골·도움 배지.
 * 오른쪽 정렬(`align="start"`면 왼쪽), 칸 안 간격 6px. 결과 값(칩·스코어·승부차기·골·도움)은 `data-slot="result-value"` 묶음 —
 * 결과 가리기(M4-15)가 이 묶음만 가리고 홈/원정 글자는 남긴다(D64 ④). 결과 정보가 없으면 "결과 없음".
 */
export function ResultCell({
  result,
  home,
  goals,
  assists,
  align = "end",
}: {
  result: ResultView | null;
  home: boolean;
  goals: number;
  assists: number | null;
  align?: "start" | "end";
}) {
  const badges = (
    <>
      {goals > 0 ? <GoalBadge n={goals} unit="골" /> : null}
      {assists !== null && assists > 0 ? (
        <GoalBadge n={assists} unit="도움" />
      ) : null}
    </>
  );
  const hasBadges = goals > 0 || (assists !== null && assists > 0);
  return (
    <span
      data-slot="result-cell"
      className={cx(
        "inline-grid gap-1.5 align-middle",
        align === "end" ? "justify-items-end" : "justify-items-start",
      )}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {result ? (
          <span
            data-slot="result-value"
            data-outcome={result.outcome}
            className="inline-flex items-center gap-1.5"
          >
            <FormChip result={result.outcome} />
            <span className="sr-only">{FORM_WORD[result.outcome]} </span>
            {/* 스코어 "3-1"(하이픈 장식 · 화면 밖 "대") — marks.tsx `Score`에 이 칸 크기를 병합한 결과와 같은 클래스(M4-08: 클라이언트 섬에서도
                그리도록 `cn` 병합 없이 완성된 문자열로) */}
            <span className="inline-flex gap-0 font-numeric text-lg leading-none font-extrabold tracking-[0.04em] tabular-nums">
              <span>{result.for}</span>
              <span aria-hidden="true">-</span>
              <span className="sr-only">대</span>
              <span>{result.against}</span>
            </span>
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-2">결과 없음</span>
        )}
        <span className="text-xs font-extrabold text-ink-2 before:mr-1.5 before:font-normal before:content-['·']">
          {home ? "홈" : "원정"}
        </span>
      </span>
      {result?.pens ? (
        <span
          data-slot="result-value"
          className="text-[11.5px] leading-none font-extrabold whitespace-nowrap text-ink-2"
        >
          승부차기{" "}
          <span className="font-numeric text-[12.5px] tabular-nums">
            {result.pens.for}
            <span aria-hidden="true">–</span>
            <span className="sr-only">대</span>
            {result.pens.against}
          </span>
        </span>
      ) : null}
      {hasBadges ? (
        <span
          data-slot="result-value"
          className={cx(
            "inline-flex flex-wrap gap-1",
            align === "end" ? "justify-end" : "justify-start",
          )}
        >
          {badges}
        </span>
      ) : null}
    </span>
  );
}

/** "기타" 평탄 탭 — 6개 대회 밖(컵 대회 · 기타 리그): 면 없이 1px `--ink-2` 안쪽 테두리 + `--ink-2` 글자 */
export function OtherTab({
  size,
  title = "기타 대회",
}: {
  size?: "default" | "contents";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        flatTabVariants({ size }),
        "text-ink-2 inset-ring inset-ring-ink-2",
      )}
    >
      기타
    </span>
  );
}

/** 대회 표식 — 6개 대회는 평탄 탭(정식 이름은 마우스 올림 설명), 컵은 "기타" 탭 + 대회 이름(사전에 없으면 원문 `lang="en"`) */
export function CompTag({
  comp,
  stacked = false,
}: {
  comp: CompMark;
  /** 컵 대회 이름을 탭 아래 줄로(시즌 기록 표 대회 칸 — M3-10) */
  stacked?: boolean;
}) {
  if (comp.kind === "comp") {
    return (
      <FlatTab comp={comp.comp} title={comp.name}>
        {comp.short}
      </FlatTab>
    );
  }
  return (
    <span
      className={cx(
        "inline-flex gap-x-1.5 gap-y-1",
        stacked ? "flex-col items-start" : "flex-wrap items-center",
      )}
    >
      <OtherTab />
      <span
        lang={comp.latin ? "en" : undefined}
        className="text-[12.5px] leading-[1.3] text-ink-2"
      >
        {comp.name}
      </span>
    </span>
  );
}

/** 상대 팀 — 배지 xs(장식) + 이름(사전에 없으면 원문 `lang="en"`) */
export function OpponentName({
  opponent,
  badge = true,
  className,
}: {
  opponent: OpponentView;
  badge?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1.75", className)}>
      {badge ? <TeamBadge team={opponent.badge} size="xs" /> : null}
      <span lang={opponent.latin ? "en" : undefined}>{opponent.name}</span>
    </span>
  );
}

/** 상태 도장 — 1px dashed `--ink-2` + 11.5px 800 `--ink-2`(기록 연결 전 · 갱신 중단 — DESIGN §9.3 D2 선수 명단 행 상태) */
export function StateStamp({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center border border-dashed border-ink-2 px-1.5 pt-0.75 pb-0.5 text-[11.5px] leading-[1.3] font-extrabold whitespace-nowrap text-ink-2">
      {children}
    </span>
  );
}

/**
 * 선수 이름 링크 — 한국 선수 상세(`/korean-players/{slug}/`, M3-10)로. 누름 영역은 `::after`로 가운데 기준 44 × max(글자 폭, 44)px(세 글자
 * 이름 15~16.5px는 글자 폭이 40px 안팎이라 가로도 넓힌다 — DESIGN §10), hover 2px `--brand-accent` 밑줄(팀 이름 링크와 같은 모양).
 * 상세는 설정의 선수 전원을 정적으로 만들므로 늘 링크다.
 */
export function PlayerLink({
  slug,
  className,
  children,
}: {
  slug: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={routes.koreanPlayer(slug)}
      className={cx(
        "relative text-inherit no-underline decoration-brand-accent decoration-2 underline-offset-3 after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-[max(100%,44px)] after:-translate-1/2 after:content-[''] hover:underline",
        className,
      )}
    >
      {children}
    </Link>
  );
}
