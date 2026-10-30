import type { CSSProperties, ReactNode } from "react";

import { KoreanArmband } from "@/components/news/feed-card";
import { SectionHead } from "@/components/ui/section-head";
import { kitTextColor } from "@/lib/kit-contrast";
import type { PitchSpot } from "@/lib/team-view";
import { cn } from "@/lib/utils";

import { TeamSheetIsland } from "./team-sheet-island";

/**
 * 팀시트 — 주 포메이션 + 피치 + 선발·교체 명단 (PRD FR-55, DESIGN §9.3 "팀시트", DECISIONS D1 §4 — B 팀시트, PRD §15 D63 ①②, plan M2-13)
 *
 * 서버 컴포넌트(+ 하이라이트 섬). 티켓 바로 아래 전폭 섹션.
 * - **주 포메이션**: 이름표 + 숫자(52/72px) + 근거 줄(집계 방식 · 피치와 명단의 경기 맥락 · API-Football — FR-45). 1024 이상은 숫자 | 근거 2열.
 * - **피치**(선발 11명 모두 grid가 있을 때만): 1023 이하 세로(68/105) · 1024 이상 가로(105/68) — 같은 DOM, 좌표 변수 `--a`·`--c`를 CSS가 돌린다
 *   (globals.css §11 `pitch-spot`). 표시선 SVG 1px `--ink-3`(센터 서클만 원 — DESIGN §5.1 예외), 등번호 상자 34px = 상의 색 + `--kf`(빌드 때
 *   `kitTextColor`), GK = `--paper` 면 + 1.5px `--ink`. 피치 전체 `aria-hidden`(정보는 명단에).
 * - **명단**: 선발 11 · 교체 n(`<ol>` — 등번호 거터 · 이름 · 포지션). 1023 이하 2단. 이름은 원어(API-Football 표기, `lang="en"`) 고정, 등록 한국
 *   선수만 한글 + 레드 띠 + 완장(D63 ①).
 * - **하이라이트**: 같은 `data-no`의 명단 행·피치 칸(마우스 전용 — 섬).
 */

export interface SheetPlayerView {
  /** 명단 ↔ 피치 짝 키 */
  key: string;
  number: number | null;
  name: string;
  /** 원어 표기(라틴) — `lang="en"` */
  latin: boolean;
  korean: boolean;
  /** "GK" · "DF" · "MF" · "FW" — 없으면 빈 문자열 */
  pos: string;
}

export interface TeamSheetProps {
  headingId: string;
  shape: string;
  /** 근거 줄 */
  basis: ReactNode;
  /** 명단 — 없으면 피치·명단을 두지 않는다 */
  lineup: { startXI: SheetPlayerView[]; substitutes: SheetPlayerView[] } | null;
  /** 선발 순서와 같은 피치 좌표 — null이면 피치 없이 명단만 */
  spots: PitchSpot[] | null;
  /** 상의 색(등번호 상자) — 없으면 `--paper-2` 면 + 잉크 글자 */
  kit: string | null;
}

export function TeamSheet({
  headingId,
  shape,
  basis,
  lineup,
  spots,
  kit,
}: TeamSheetProps) {
  const sheetId = `${headingId}-body`;
  return (
    <section
      aria-labelledby={headingId}
      data-slot="team-sheet"
      className="mt-8"
    >
      <SectionHead
        heading="팀시트"
        headingId={headingId}
        runningHead="TEAM SHEET"
      />
      <div className="mt-2.5 grid gap-y-1.5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-4.5">
        <p className="text-[13px] font-extrabold text-ink-2 lg:col-span-2">
          주 포메이션
        </p>
        <p className="font-numeric text-[52px] leading-[0.9] font-extrabold tracking-[0.01em] tabular-nums lg:text-[72px]">
          {shape}
        </p>
        <p className="pb-1 text-[12.5px] leading-normal text-ink-2">{basis}</p>
      </div>
      {lineup ? (
        <div
          id={sheetId}
          className={cn(
            "mt-3.5 grid gap-4.5",
            spots &&
              "lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)] lg:items-start lg:gap-8",
          )}
        >
          {spots ? (
            <Pitch players={lineup.startXI} spots={spots} kit={kit} />
          ) : null}
          <div>
            <Roster title="선발" players={lineup.startXI} />
            {lineup.substitutes.length > 0 ? (
              <Roster title="교체" players={lineup.substitutes} subs />
            ) : null}
          </div>
          {spots ? <TeamSheetIsland rootId={sheetId} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** 표시선 — 실제 68×105m 비율(터치라인·하프라인·센터 서클·페널티 박스·골 에어리어). 굵기는 화면 1px(non-scaling-stroke) */
function PitchLines({ horizontal }: { horizontal: boolean }) {
  const line = { vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={horizontal ? "0 0 105 68" : "0 0 68 105"}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "absolute inset-0 size-full",
        horizontal ? "hidden lg:block" : "lg:hidden",
      )}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {horizontal ? (
          <>
            <rect x="0.5" y="0.5" width="104" height="67" {...line} />
            <path d="M52.5 0.5V67.5" {...line} />
            <circle cx="52.5" cy="34" r="9.15" {...line} />
            <rect x="0.5" y="13.85" width="16.5" height="40.3" {...line} />
            <rect x="0.5" y="24.85" width="5.5" height="18.3" {...line} />
            <rect x="88" y="13.85" width="16.5" height="40.3" {...line} />
            <rect x="99" y="24.85" width="5.5" height="18.3" {...line} />
          </>
        ) : (
          <>
            <rect x="0.5" y="0.5" width="67" height="104" {...line} />
            <path d="M0.5 52.5H67.5" {...line} />
            <circle cx="34" cy="52.5" r="9.15" {...line} />
            <rect x="13.85" y="0.5" width="40.3" height="16.5" {...line} />
            <rect x="24.85" y="0.5" width="18.3" height="5.5" {...line} />
            <rect x="13.85" y="88" width="40.3" height="16.5" {...line} />
            <rect x="24.85" y="99" width="18.3" height="5.5" {...line} />
          </>
        )}
      </g>
    </svg>
  );
}

function Pitch({
  players,
  spots,
  kit,
}: {
  players: readonly SheetPlayerView[];
  spots: readonly PitchSpot[];
  kit: string | null;
}) {
  const kitVars = kit
    ? ({ "--k1": kit, "--kf": kitTextColor(kit) } as CSSProperties)
    : undefined;
  return (
    <div
      aria-hidden="true"
      data-slot="pitch"
      style={kitVars}
      className="relative aspect-[68/105] bg-paper-2 text-ink-3 lg:aspect-[105/68]"
    >
      <PitchLines horizontal={false} />
      <PitchLines horizontal />
      <ul className="absolute inset-0">
        {players.map((p, i) => {
          const spot = spots[i];
          if (!spot) return null;
          const gk = p.pos === "GK";
          return (
            <li
              key={p.key}
              data-no={p.key}
              style={{ "--a": spot.a, "--c": spot.c } as CSSProperties}
              className="group/spot pitch-spot grid w-17.5 justify-items-center gap-1 text-center lg:w-21"
            >
              <span
                className={cn(
                  "grid size-8.5 place-items-center font-numeric text-[17px] leading-none font-extrabold tabular-nums transition-shadow duration-fast ease-print",
                  "group-data-hl/spot:shadow-[0_0_0_3px_var(--paper),0_0_0_5px_var(--ink)]",
                  gk
                    ? "bg-paper text-ink outline-[1.5px] -outline-offset-[1.5px] outline-ink outline-solid"
                    : kit
                      ? "bg-(--k1) text-(--kf) outline-1 -outline-offset-1 outline-rule outline-solid"
                      : "bg-paper text-ink outline-1 -outline-offset-1 outline-ink-2 outline-dashed",
                )}
              >
                {p.number ?? ""}
              </span>
              <span className="text-[11px] leading-[1.2] font-extrabold text-ink decoration-brand-accent decoration-2 underline-offset-3 group-data-hl/spot:underline lg:text-xs">
                {p.name}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Roster({
  title,
  players,
  subs = false,
}: {
  title: string;
  players: readonly SheetPlayerView[];
  subs?: boolean;
}) {
  return (
    <>
      <h3 className="flex justify-between border-b border-ink pt-2 pb-1.25 text-[13px] font-extrabold">
        {title}
        <span className="font-numeric text-ink-2 tabular-nums">
          {players.length}
        </span>
      </h3>
      <ol role="list" className="mb-3.5 columns-2 gap-x-4 lg:columns-1">
        {players.map((p) => (
          <li
            key={p.key}
            data-no={p.key}
            className={cn(
              "grid break-inside-avoid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-1.5 border-b border-rule text-[13.5px] transition-colors duration-fast ease-print data-hl:bg-paper-2 lg:grid-cols-[30px_minmax(0,1fr)_auto] lg:gap-2",
              subs ? "min-h-8.5 lg:min-h-8" : "min-h-8.5 lg:min-h-9 lg:text-sm",
              p.korean &&
                "bg-paper-2 shadow-[inset_4px_0_0_var(--brand-accent)]",
            )}
          >
            <span
              aria-hidden="true"
              className="text-right font-numeric text-base leading-none font-extrabold tabular-nums lg:text-[17px]"
            >
              {p.number ?? ""}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 leading-[1.25] font-extrabold">
              {p.number !== null ? (
                <span className="sr-only">등번호 {p.number}</span>
              ) : null}
              <span lang={p.latin ? "en" : undefined}>{p.name}</span>
              {p.korean ? <KoreanArmband title="한국 선수" /> : null}
            </span>
            <span className="font-numeric text-[12.5px] leading-none font-semibold tracking-[0.06em] text-ink-2">
              {p.pos}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
