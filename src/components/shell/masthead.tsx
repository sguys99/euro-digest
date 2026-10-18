import Link from "next/link";
import type { ReactNode } from "react";

import { KstTime } from "@/components/kst-time";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopNav, TopNavLink } from "@/components/ui/nav-tabs";
import type { IssueMeta } from "@/lib/issue";
import { routes } from "@/lib/paths";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { formatKst, kstDayRangeUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

import { NAV_ITEMS, type NavKey } from "./site-nav";

/**
 * 마스트헤드 = 티켓 + 상단 내비 (DESIGN.md §9.3 티켓 마스트헤드·호수·스텁 · §9.2 Tabs 상단 내비, M1-30)
 *
 * 티켓 격자 — DOM 순서는 모든 폭에서 같고 칸 배치만 바뀐다(grid-area 대신 줄 번호로 놓는다 — 시안의 영역 이름은 주석에).
 * - 1023 이하: 열 `auto · 1fr · auto`, 행 "brand brand tools / perf perf perf / issue stub switch". 천공 줄이 가로로 눕는다.
 * - 1024 이상: 열 `--col-contents(232) · 4px · 1fr · auto`, 행 `1fr · auto`, "issue perf brand tools / stub perf brand switch",
 *   최소 높이 160px. 스텁 열이 아래 목차 열과 폭이 같고 천공 줄이 세로로 선다.
 * - 천공: 9px 간격 --paper 점 + 양 끝 --notch 반원 홈(globals.css `perf-x`·`perf-y`·`notch-hole`). 홈의 절반은 티켓 밖 지면에
 *   걸쳐 보이지 않아 반원으로 보인다. 장식이라 `aria-hidden`.
 * - 티켓 안 포커스 링은 --ticket-fg(색 면 안 재정의, DESIGN §9.1).
 *
 * 도구 영역: M1은 테마 토글만 — 검색(M4-E, Pagefind)과 결과 가리기 스위치(M4-15)는 그 작업에서 `search`·`spoilerSwitch`로 끼운다
 * (미완성 섹션 숨김 — DESIGN §9.3 "자리 대신 섹션을 숨긴다"). 둘을 빼도 격자는 그대로다(도구 열 = 토글 폭).
 *
 * 시각(DESIGN §9.3 스텁·FR-142): 발행·업데이트·마지막 업데이트는 데이터에서 계산한 `IssueMeta`(src/lib/issue.ts)를 KST HH:MM으로
 * 쓴다 — 07:00 같은 시각 문구를 두지 않는다(PRD §15 D26 계절별). `<time datetime>`에는 UTC ISO.
 */

/** 영문 워드마크 — 대문자는 원문 글자로 쓴다(text-transform 금지, DESIGN §3.6) */
const WORDMARK_EN = "EURO DIGEST";

export interface MastheadProps {
  /** 지금 호 — 없으면(발행 전) 호수·시각 없이 안내 한 줄 */
  issue: IssueMeta | null;
  /** 상단 내비의 현재 항목(`aria-current="page"`) */
  current?: NavKey;
  /** 워드마크 요소 — 홈은 h1(DESIGN §9.3), 다른 페이지는 p(그 페이지 제목이 h1) */
  wordmarkAs?: "h1" | "p";
  /** 도구 영역 테마 토글 앞 — 검색 버튼(M4-E) */
  search?: ReactNode;
  /** 결과 가리기 스위치(M4-15) — 375 스텁 오른쪽 · 1024 이상 본면 오른쪽 아래 */
  spoilerSwitch?: ReactNode;
}

export function Masthead({
  issue,
  current,
  wordmarkAs: Wordmark = "p",
  search,
  spoilerSwitch,
}: MastheadProps) {
  return (
    <header>
      <div
        data-ticket=""
        className={cn(
          "relative grid grid-cols-[auto_minmax(0,1fr)_auto] bg-ticket text-ticket-fg transition-colors duration-base [--ring:var(--ticket-fg)]",
          "lg:min-h-40 lg:grid-cols-[var(--col-contents)_4px_minmax(0,1fr)_auto] lg:grid-rows-[1fr_auto]",
        )}
      >
        {/* brand — 워드마크(홈 링크) · 영문 워드마크 · 태그라인 */}
        <div className="col-start-1 col-end-3 row-start-1 min-w-0 pt-4 pb-3.5 pl-4.5 lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-3 lg:self-center lg:pt-5.5 lg:pb-5 lg:pl-9">
          <Wordmark className="text-type-wordmark font-extrabold tracking-[-0.045em] lg:tracking-[-0.05em]">
            <Link
              href={routes.home()}
              className="-my-1.5 inline-block py-1.5 no-underline"
            >
              {SITE_NAME}
            </Link>
          </Wordmark>
          <p
            lang="en"
            className="mt-2 font-numeric text-[12px] leading-none font-extrabold tracking-[0.32em] text-ticket-fg-2 lg:mt-3 lg:text-[13px]"
          >
            {WORDMARK_EN}
          </p>
          <p className="mt-2.5 text-[13px] leading-[1.45] text-ticket-fg-2 lg:mt-3 lg:text-[15px]">
            {SITE_TAGLINE}
          </p>
        </div>

        {/* tools — (검색) · 테마 토글 */}
        <div className="col-start-3 row-start-1 flex items-start pt-1.5 pr-1.5 lg:col-start-4 lg:row-start-1 lg:gap-1 lg:pt-3.5 lg:pr-3.5">
          {search}
          <ThemeToggle />
        </div>

        {/* perf — 천공 줄 + 양 끝 노치 홈 */}
        <span
          aria-hidden="true"
          className={cn(
            // --perf-inset(14px): 천공 줄이 티켓 가장자리에서 들어온 거리 — 줄 여백과 노치 위치(가장자리 = 노치 중심)가 같은 값을 쓴다
            "relative col-start-1 col-end-4 row-start-2 mx-(--perf-inset) h-1 perf-x [--perf-inset:--spacing(3.5)]",
            "before:absolute before:top-1/2 before:-left-[calc(var(--perf-inset)_+_var(--notch))] before:-mt-(--notch) before:notch-hole before:content-['']",
            "after:absolute after:top-1/2 after:-right-[calc(var(--perf-inset)_+_var(--notch))] after:-mt-(--notch) after:notch-hole after:content-['']",
            "lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-3 lg:mx-0 lg:my-(--perf-inset) lg:h-auto lg:w-1 lg:perf-y",
            "lg:before:-top-[calc(var(--perf-inset)_+_var(--notch))] lg:before:left-1/2 lg:before:mt-0 lg:before:-ml-(--notch)",
            "lg:after:top-auto lg:after:right-auto lg:after:-bottom-[calc(var(--perf-inset)_+_var(--notch))] lg:after:left-1/2 lg:after:mt-0 lg:after:-ml-(--notch)",
          )}
        />

        {issue ? (
          <>
            {issue.no !== null && <IssueNumber no={issue.no} />}
            <Stub issue={issue} />
          </>
        ) : (
          <p className={cn(STUB, "text-ticket-fg-2")}>
            아직 발행된 호가 없어요.
          </p>
        )}

        {spoilerSwitch && (
          <div className="col-start-3 row-start-3 flex flex-col items-end justify-center gap-1 pt-2 pr-3.5 pb-2.5 lg:col-start-4 lg:row-start-2 lg:flex-row lg:items-center lg:gap-2.5 lg:self-end lg:pt-0 lg:pr-4.5 lg:pb-4.5">
            {spoilerSwitch}
          </div>
        )}
      </div>

      {/* 상단 내비(1024 이상) — 티켓 아래, 마지막 업데이트는 오른쪽 끝 */}
      <TopNav className="hidden lg:flex">
        {NAV_ITEMS.map((item) => (
          <TopNavLink
            key={item.key}
            href={item.href}
            current={item.key === current}
          >
            {item.label}
          </TopNavLink>
        ))}
        {issue && (
          <span className="ml-auto text-[13px] text-ink-2">
            마지막 업데이트 <KstTime iso={issue.updatedAt} />
          </span>
        )}
      </TopNav>
    </header>
  );
}

/** issue — "제 N호". 글자 13/17px 800 + 숫자 --num-issue Barlow 800(D29) */
function IssueNumber({ no }: { no: number }) {
  const unit = "text-[13px] font-extrabold lg:text-[17px]";
  return (
    <p className="col-start-1 row-start-3 flex items-baseline gap-0.75 py-3 pl-4.5 lg:col-start-1 lg:row-start-1 lg:gap-1.5 lg:self-start lg:pt-4.5 lg:pb-0 lg:pl-7">
      <span className={unit}>제</span>
      <span className="font-numeric text-num-issue leading-[0.82] font-extrabold tracking-[-0.02em] lining-nums tabular-nums lg:leading-[0.78]">
        {no}
      </span>
      <span className={unit}>호</span>
    </p>
  );
}

/** stub 칸 배치·글자 — 375 호수 오른쪽(가운데 정렬) · 1024 이상 호수 아래(아래 정렬) */
const STUB =
  "col-start-2 row-start-3 flex min-w-0 flex-col justify-center py-2.5 pr-2 pl-3.5 text-[12.5px] leading-[1.45] lg:col-start-1 lg:row-start-2 lg:justify-end lg:pt-0 lg:pr-4 lg:pb-4.5 lg:pl-7 lg:text-[13px]";

/** 보조 줄(발행·업데이트) — --ticket-fg-2 11.5/12.5px */
const STUB_LINE =
  "block text-[11.5px] leading-[1.4] text-ticket-fg-2 lg:text-[12.5px]";

/** stub — 발행일(800) · 발행 HH:MM KST · 업데이트 HH:MM KST */
function Stub({ issue }: { issue: IssueMeta }) {
  return (
    <p className={STUB}>
      {/* 날짜 라벨이라 그날 KST 00:00(UTC 시각)으로 바꿔 formatKst에 넘긴다. 한글 날짜는 비례 숫자(시안 그대로) */}
      <time dateTime={issue.date} className="font-extrabold normal-nums">
        {formatKst(kstDayRangeUtc(issue.date).start, "fullDate")}
      </time>
      <span className={STUB_LINE}>
        발행 <KstTime iso={issue.publishedAt} />
      </span>
      <span className={STUB_LINE}>
        업데이트 <KstTime iso={issue.updatedAt} />
      </span>
    </p>
  );
}
