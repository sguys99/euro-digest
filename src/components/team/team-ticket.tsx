import type { ReactNode } from "react";

import { FormChips } from "@/components/competition/marks";
import { KoreanArmband } from "@/components/news/feed-card";
import { FlatTab } from "@/components/ui/chip";
import {
  goalDiffText,
  type FormView,
  type TeamView,
} from "@/lib/competition-view";
import type { CompId } from "@/lib/schema/common";
import type { StandingRow } from "@/lib/schema/competition";
import type { CompetitionConfig } from "@/lib/schema/configs";
import type { KoreanPlayer } from "@/lib/schema/player";
import type { TeamFixtureView } from "@/lib/team-view";
import { cn } from "@/lib/utils";

import { TeamBadge } from "./team-badge";

/**
 * 팀 헤더 티켓 (PRD FR-51·FR-58, DESIGN §9.3 "팀 헤더 티켓", DECISIONS D1 §4 — A 티켓 헤더, plan M2-13)
 *
 * 서버 컴포넌트. 면 `--paper` + 1.5px `--ink` 테두리. 격자 `96px · 2px · 1fr`(1024 이상 `--col-contents` · 2px · 1fr — 스텁 열이 아래 리그 맥락
 * 열과 맞는다) + 아래 꼬리표 전폭.
 * - **스텁** = 팀 배지를 키운 것(홀로 선 배지 — `role="img"` "{팀명} 배지 {약어}"). 스텁과 본문 사이 2px dotted `--ink-3` 절취선 + 위아래 반원 노치
 *   (장식 `aria-hidden` — 원은 노치에만, DESIGN §5.1).
 * - **본문**: 대회 줄(평탄 탭 + "{리그} · {시즌}") → h1 한글 팀명 → 숫자 4칸 `<dl>`(순위 · 승점 · 경기 · 득실 — 대표 대회 순위표, 없으면 숨김).
 * - **꼬리표**: ① 최근 경기(전 대회 · 자료 n경기 + 폼 칩) ② 다음 경기(KST 시각 · 임시 · 평탄 탭 · 홈/원정 · 상대) ③ 한국 선수(완장 + 이름 + 포지션 —
 *   소속 선수가 있을 때만, FR-58). 1023 이하는 세로로 쌓고 1024 이상은 칸 수만큼 열(3칸 `1.1fr · 1.2fr · 1fr` · 2칸 `1fr · 1fr`).
 * - 포메이션은 티켓에 두지 않는다(팀시트에 한 번만 — DECISIONS D1 §4 중복 정리).
 * - 한국 선수 이름은 아직 선수 페이지 링크가 아니다(선수 페이지 M3 — 없는 페이지로 가는 링크를 만들지 않는다).
 */
export function TeamTicket({
  self,
  headingId,
  config,
  season,
  row,
  form,
  next,
  nextComp,
  korean,
}: {
  self: TeamView;
  headingId: string;
  /** 대표 대회 설정 — 없으면 대회 줄 없음 */
  config: Pick<CompetitionConfig, "id" | "nameKo" | "shortKo"> | null;
  /** "2026-27" */
  season: string | null;
  /** 대표 대회 순위표 행 — 없으면 숫자 칸 없음 */
  row: StandingRow | null;
  form: FormView;
  next: TeamFixtureView | null;
  /** 다음 경기 대회의 평탄 탭 표기 */
  nextComp: { id: CompId; short: string; name: string } | null;
  korean: readonly KoreanPlayer[];
}) {
  const cells = korean.length > 0 ? 3 : 2;
  return (
    <div
      data-slot="team-ticket"
      className="relative grid grid-cols-[96px_2px_minmax(0,1fr)] border-[1.5px] border-ink bg-paper lg:min-h-55 lg:grid-cols-[var(--col-contents)_2px_minmax(0,1fr)]"
    >
      <TeamBadge team={self} size="stub" standalone />
      <span
        aria-hidden="true"
        className={cn(
          "relative border-l-2 border-dotted border-ink-3",
          // 위아래 반원 노치 — 지름 --notch × 2, --paper 면 + 1.5px --ink 테두리, 테두리 밖 반쪽은 잘라 낸다
          "before:absolute before:-top-2.75 before:left-1/2 before:size-[calc(var(--notch)*2)] before:-translate-x-1/2 before:bg-[radial-gradient(circle_closest-side,var(--paper)_calc(100%-1.5px),var(--ink)_calc(100%-1.5px),var(--ink)_100%,transparent_100%)] before:content-[''] before:[clip-path:inset(50%_0_0_0)]",
          "after:absolute after:-bottom-2.75 after:left-1/2 after:size-[calc(var(--notch)*2)] after:-translate-x-1/2 after:bg-[radial-gradient(circle_closest-side,var(--paper)_calc(100%-1.5px),var(--ink)_calc(100%-1.5px),var(--ink)_100%,transparent_100%)] after:content-[''] after:[clip-path:inset(0_0_50%_0)]",
        )}
      />
      <div className="min-w-0 pt-3.5 pr-3.5 pb-3.5 pl-4 lg:pt-5.5 lg:pr-7 lg:pb-5 lg:pl-8">
        {config ? (
          <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <FlatTab comp={config.id} title={config.nameKo}>
              {config.shortKo}
            </FlatTab>
            <span>
              {config.nameKo}
              {season ? ` · ${season}` : null}
            </span>
          </p>
        ) : null}
        <h1
          id={headingId}
          lang={self.latin ? "en" : undefined}
          className="mt-2 text-[27px] leading-[1.15] font-extrabold tracking-[-0.04em] lg:text-5xl"
        >
          {self.name}
        </h1>
        {row ? <TicketNumbers row={row} /> : null}
      </div>
      <div
        className={cn(
          "col-span-3 grid border-t-2 border-dotted border-ink-3",
          cells === 3 ? "lg:grid-cols-[1.1fr_1.2fr_1fr]" : "lg:grid-cols-2",
        )}
      >
        <TailCell
          label="최근 경기"
          aside={
            form.count > 0 ? `전 대회 · 자료 ${form.count}경기` : "전 대회"
          }
        >
          <FormChips form={form} />
        </TailCell>
        <TailCell label="다음 경기">
          {next && nextComp ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
              <time
                dateTime={next.match.kickoff}
                className="font-numeric text-[15px] leading-none font-semibold tracking-[0.02em] tabular-nums"
              >
                {next.date} ({next.weekday}){" "}
                {next.time ?? (
                  <span className="font-sans text-[13px] font-extrabold">
                    임시<span className="sr-only"> — 킥오프 시각 미정</span>
                  </span>
                )}
              </time>
              <FlatTab comp={nextComp.id} title={nextComp.name}>
                {nextComp.short}
              </FlatTab>
              <span>{next.side === "home" ? "홈" : "원정"}</span>
              <span lang={next.opponent.latin ? "en" : undefined}>
                {next.opponent.name}
              </span>
            </p>
          ) : (
            <p className="text-[13px] text-ink-2">예정된 경기 자료 없음</p>
          )}
        </TailCell>
        {korean.length > 0 ? (
          <TailCell label="한국 선수">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-extrabold">
              {korean.map((p) => (
                <li key={p.slug} className="flex min-h-11 items-center gap-1.5">
                  <KoreanArmband title="한국 선수" />
                  <span>{p.nameKo}</span>
                  <span className="font-numeric text-[12.5px] font-semibold tracking-[0.06em] text-ink-2">
                    {p.position}
                  </span>
                </li>
              ))}
            </ul>
          </TailCell>
        ) : null}
      </div>
    </div>
  );
}

/** 숫자 4칸 — 순위(+ "위") · 승점 · 경기(+ "n승 n무 n패") · 득실(+ "득-실") */
function TicketNumbers({ row }: { row: StandingRow }) {
  const items: Array<{ label: string; value: ReactNode; sub?: ReactNode }> = [
    {
      label: "순위",
      value: (
        <>
          {row.pos}
          <span className="ml-px font-sans text-[13px] leading-none font-extrabold">
            위
          </span>
        </>
      ),
    },
    { label: "승점", value: row.pts },
    {
      label: "경기",
      value: row.played,
      sub: (
        <>
          <span className="font-numeric tabular-nums">{row.w}</span>승{" "}
          <span className="font-numeric tabular-nums">{row.d}</span>무{" "}
          <span className="font-numeric tabular-nums">{row.l}</span>패
        </>
      ),
    },
    {
      label: "득실",
      value: goalDiffText(row.gf, row.ga),
      sub: (
        <span className="font-numeric tabular-nums">
          {row.gf}-{row.ga}
          <span className="sr-only">
            {" "}
            (득점 {row.gf} 실점 {row.ga})
          </span>
        </span>
      ),
    },
  ];
  return (
    <dl className="mt-3 grid grid-cols-[repeat(4,auto)] justify-start gap-x-4 gap-y-1 lg:mt-4 lg:gap-x-8 lg:gap-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="grid content-start gap-0.75">
          <dt className="text-[11.5px] font-extrabold text-ink-2">
            {item.label}
          </dt>
          <dd className="flex flex-col gap-0.75 text-xs text-ink-2">
            <b className="font-numeric text-2xl leading-none font-extrabold tracking-[-0.01em] text-ink tabular-nums lg:text-[34px]">
              {item.value}
            </b>
            {item.sub ? <span>{item.sub}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 꼬리표 칸 — 이름(12.5px 800 + 보조 400) + 값. 1023 이하 칸 사이 1px --rule 가로줄, 1024 이상 세로줄 */
function TailCell({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 border-b border-rule px-3.5 py-2.5 last:border-b-0 lg:min-h-16 lg:border-b-0 lg:border-l lg:px-4.5 lg:py-3 lg:first:border-l-0">
      <p className="text-[12.5px] font-extrabold">
        {label}
        {aside ? (
          <span className="ml-1.5 font-normal text-ink-2">{aside}</span>
        ) : null}
      </p>
      {children}
    </div>
  );
}
