import Link from "next/link";
import type { ReactNode } from "react";

import { KstTime } from "@/components/kst-time";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopNav, TopNavLink } from "@/components/ui/nav-tabs";
import type { IssueMeta } from "@/lib/issue";
import { routes } from "@/lib/paths";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { formatKst, kstDate, kstDayRangeUtc } from "@/lib/time";
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
 * 꼬리표(M1-34, DESIGN §9.3 티켓 꼬리표 — 시안 A `docs/design/m1-archive/concept-a.html`): `counterfoil`을 주면(`/news/`·날짜 아카이브만,
 * 홈에는 없음) 두 번째 가로 절취선(모든 폭, 양 끝 노치)과 꼬리표 줄이 티켓 마지막 두 줄로 붙는다 — 375 행 4·5, 1024 이상 행 3·4
 * (`1fr auto auto auto`). 1024 이상 세로 천공 줄은 위 14 · 아래 8px로 줄고 아래 노치를 지워 가로 절취선과 T자로 만난다. 판(`counterfoilPanel` —
 * 달력)은 티켓 바로 뒤, 티켓과 함께 `relative` 상자에 둔다(1024 이상 팝오버의 기준).
 *
 * 시각(DESIGN §9.3 스텁·FR-142): 발행·업데이트·마지막 업데이트는 데이터에서 계산한 `IssueMeta`(src/lib/issue.ts)를 KST HH:MM으로
 * 쓴다 — 07:00 같은 시각 문구를 두지 않는다(PRD §15 D26 계절별). `<time datetime>`에는 UTC ISO. 스텁은 늘 그 호, 상단 내비의 마지막
 * 업데이트는 사이트 기준(`lastUpdated` — 최신 호, 날짜 아카이브에서 다른 날이면 날짜를 붙인다, M1-34).
 */

/** 영문 워드마크 — 대문자는 원문 글자로 쓴다(text-transform 금지, DESIGN §3.6) */
const WORDMARK_EN = "EURO DIGEST";

export interface MastheadProps {
  /** 지금 호 — 없으면(발행 전) 호수·시각 없이 안내 한 줄 */
  issue: IssueMeta | null;
  /** 상단 내비의 현재 항목(`aria-current="page"`) */
  current?: NavKey;
  /** 현재 항목이 이 페이지(`"page"`) · 그 섹션 안의 다른 페이지(`"section"` → `aria-current="true"`, M1-34 날짜 아카이브) */
  currentKind?: "page" | "section";
  /** 워드마크 요소 — 홈은 h1(DESIGN §9.3), 다른 페이지는 p(그 페이지 제목이 h1) */
  wordmarkAs?: "h1" | "p";
  /** 도구 영역 테마 토글 앞 — 검색 버튼(M4-E) */
  search?: ReactNode;
  /** 결과 가리기 스위치(M4-15) — 375 스텁 오른쪽 · 1024 이상 본면 오른쪽 아래 */
  spoilerSwitch?: ReactNode;
  /**
   * 티켓 꼬리표(M1-34 — `/news/`·날짜 아카이브만, 홈에는 없음): 두 번째 절취선 아래 티켓 마지막 줄에 놓는다. 주면 1024 이상 세로 천공 줄이
   * 아래 8px에서 멈추고(아래 노치 없음 — 가로 절취선과 T자로 만난다) 티켓 격자에 두 줄(절취선 · 꼬리표)이 붙는다
   */
  counterfoil?: ReactNode;
  /** 꼬리표에서 펼치는 판(달력) — 티켓 바로 뒤. 375는 지면을 밀어내는 시트, 1024 이상은 티켓 기준 팝오버(판이 위치를 정한다) */
  counterfoilPanel?: ReactNode;
  /**
   * 상단 내비 "마지막 업데이트"(FR-142 — 사이트 갱신 시각 = 최신 호의 업데이트). 주지 않으면 `issue.updatedAt`(그 페이지 호가 최신 호일 때).
   * 날짜 아카이브처럼 그 시각의 KST 날짜가 보고 있는 호의 발행일과 다르면 날짜를 붙인다("10월 23일 (금) 07:05 KST")
   */
  lastUpdated?: string;
}

export function Masthead({
  issue,
  current,
  currentKind = "page",
  wordmarkAs: Wordmark = "p",
  search,
  spoilerSwitch,
  counterfoil,
  counterfoilPanel,
  lastUpdated,
}: MastheadProps) {
  const hasCounterfoil = counterfoil != null;
  const updated = lastUpdated ?? issue?.updatedAt;
  return (
    <header>
      {/* 티켓 + 꼬리표 판(1024 이상 팝오버의 기준 상자) */}
      <div className="relative">
        <div
          data-ticket=""
          data-counterfoil={hasCounterfoil ? "" : undefined}
          className={cn(
            "relative grid grid-cols-[auto_minmax(0,1fr)_auto] bg-ticket text-ticket-fg transition-colors duration-base [--ring:var(--ticket-fg)]",
            "lg:min-h-40 lg:grid-cols-[var(--col-contents)_4px_minmax(0,1fr)_auto]",
            hasCounterfoil
              ? "lg:grid-rows-[1fr_auto_auto_auto]"
              : "lg:grid-rows-[1fr_auto]",
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
              "lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-3 lg:mx-0 lg:h-auto lg:w-1 lg:perf-y",
              // 꼬리표가 있으면 아래 8px에서 멈추고 아래 노치를 지운다 — 아래 가로 절취선과 T자로 만난다(시안 A)
              hasCounterfoil
                ? "lg:mt-(--perf-inset) lg:mb-2 lg:after:hidden"
                : "lg:my-(--perf-inset)",
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

          {hasCounterfoil && (
            <>
              {/* 두 번째 절취선(모든 폭 가로) + 양 끝 노치 — 꼬리표를 떼는 줄 */}
              <span
                aria-hidden="true"
                data-slot="counterfoil-perf"
                className={cn(
                  "relative col-start-1 col-end-4 row-start-4 mx-(--perf-inset) h-1 perf-x [--perf-inset:--spacing(3.5)]",
                  "before:absolute before:top-1/2 before:-left-[calc(var(--perf-inset)_+_var(--notch))] before:-mt-(--notch) before:notch-hole before:content-['']",
                  "after:absolute after:top-1/2 after:-right-[calc(var(--perf-inset)_+_var(--notch))] after:-mt-(--notch) after:notch-hole after:content-['']",
                  "lg:col-end-5 lg:row-start-3",
                )}
              />
              <div className="col-start-1 col-end-4 row-start-5 min-w-0 lg:col-end-5 lg:row-start-4">
                {counterfoil}
              </div>
            </>
          )}
        </div>
        {counterfoilPanel}
      </div>

      {/* 상단 내비(1024 이상) — 티켓 아래, 마지막 업데이트(사이트 기준)는 오른쪽 끝 */}
      <TopNav className="hidden lg:flex">
        {NAV_ITEMS.map((item) => (
          <TopNavLink
            key={item.key}
            href={item.href}
            current={
              item.key === current &&
              (currentKind === "section" ? "section" : true)
            }
          >
            {item.label}
          </TopNavLink>
        ))}
        {issue && updated && (
          <span className="ml-auto text-[13px] text-ink-2">
            마지막 업데이트{" "}
            <KstTime iso={updated} withDate={kstDate(updated) !== issue.date} />
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
