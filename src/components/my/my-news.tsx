import Link from "next/link";

import { NewsRow } from "@/components/news/news-row";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import type { MyNewsCandidate } from "@/lib/data/my-page";
import { MY_NEWS_BOOT_SCRIPT } from "@/lib/my-news-boot";
import { MN } from "@/lib/my-news-dom";
import { MINE_QUERY } from "@/lib/news/filter";
import { routes } from "@/lib/paths";
import { cn } from "@/lib/utils";

import { MyNewsIsland } from "./my-news-island";

/**
 * 내 팀 소식 (PRD FR-112, DESIGN §9.3 D2 "홈 위젯 (D2)" · "`/my` 틀", 혼합안 화면 4 · 5, plan M4-08)
 *
 * 서버 컴포넌트 + 첫 페인트 전 스크립트 + 섬. 최신 호 후보 뉴스 행(걸린 팀·선수가 디렉터리에 있는 카드 — 게재 순)을 모두 숨긴 채 싣고,
 * 팔로우와 맞는 행만 앞에서부터 `limit`개 보인다(DOM 약속 src/lib/my-news-dom.ts). 맞는 행이 없으면(팔로우 0 포함) 섹션 전체가 숨는다 —
 * 홈은 "팔로우가 있을 때만"(DESIGN), 첫 방문의 온보딩 진입 줄은 M4-09.
 * - **홈**(`variant="home"`): 얇은 섹션 머리(D1 오늘 밤 · 순위 미니와 같은 문법) "내 팀 소식" + MY NEWS, 부제 "제 n호 · m건", 뉴스 행 3장,
 *   "m건 모두 · 마이 ›"(→ `/my/`).
 * - **`/my`**(`variant="page"`): 보통 섹션 머리, 부제 "제 n호 · m건 — 메타 끝 굵은 글자가 걸린 팔로우", 뉴스 행 4장, "m건 모두 ›"(→ `/news/?mine=1`).
 * 행 메타 끝 굵은 글자 = 걸린 팔로우 이름(혼합안 `.why`). 같은 카드가 같은 페이지 피드에 있으므로 행 id 앞에 `idPrefix`를 붙인다.
 */
export function MyNews({
  candidates,
  issueNo,
  limit,
  variant,
  headingId,
  className,
}: {
  candidates: readonly MyNewsCandidate[];
  issueNo: number | null;
  limit: number;
  variant: "home" | "page";
  headingId: string;
  className?: string;
}) {
  if (candidates.length === 0) return null;
  const home = variant === "home";
  return (
    <>
      <section
        aria-labelledby={headingId}
        data-slot="my-news"
        {...{ [MN.section]: "", [MN.limit]: String(limit) }}
        hidden
        suppressHydrationWarning
        className={className}
      >
        <SectionHead
          heading="내 팀 소식"
          headingId={headingId}
          runningHead="MY NEWS"
          thin={home}
        />
        <p className="mt-0.75 text-[13px] leading-normal text-ink-2">
          {issueNo !== null ? (
            <>
              제 <span className="font-numeric tabular-nums">{issueNo}</span>호
              ·{" "}
            </>
          ) : null}
          <span
            {...{ [MN.count]: "" }}
            suppressHydrationWarning
            className="font-numeric tabular-nums"
          >
            0
          </span>
          건{home ? null : " — 메타 끝 굵은 글자가 걸린 팔로우"}
        </p>
        <ol
          aria-label="내 팀 소식 — 걸린 팔로우와 함께"
          className="mt-2 border-t border-rule"
        >
          {candidates.map((c) => (
            <NewsRow
              key={c.item.card.id}
              item={c.item}
              idPrefix={`${headingId}-n`}
              tags={c.tags}
              armband
              liProps={{
                hidden: true,
                suppressHydrationWarning: true,
                [MN.row]: "",
                [MN.keys]: JSON.stringify(c.pairs),
              }}
              why={
                <span className="font-extrabold text-ink">
                  <span className="sr-only">팔로우: </span>
                  <span {...{ [MN.why]: "" }} suppressHydrationWarning />
                </span>
              }
            />
          ))}
        </ol>
        <p
          className={cn(
            "mt-1 flex flex-wrap items-center gap-x-3",
            home ? "justify-start" : "justify-end",
          )}
        >
          <Link
            href={home ? routes.my() : `${routes.news()}?${MINE_QUERY}`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            <span>
              <span
                {...{ [MN.count]: "" }}
                suppressHydrationWarning
                className="font-numeric tabular-nums"
              >
                0
              </span>
              건 모두{home ? " · 마이" : ""}
            </span>
            <ChevronRightIcon size={18} />
          </Link>
        </p>
      </section>
      <script dangerouslySetInnerHTML={{ __html: MY_NEWS_BOOT_SCRIPT }} />
      <MyNewsIsland />
    </>
  );
}
