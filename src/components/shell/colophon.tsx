import Link from "next/link";

import { KstTime } from "@/components/kst-time";
import { aboutHref } from "@/lib/about-sections";
import type { IssueMeta } from "@/lib/issue";
import { FOOTBALL_DATA_ATTRIBUTION, REPO_URL, SITE_NAME } from "@/lib/site";
import { formatKst, kstDayRangeUtc } from "@/lib/time";

/**
 * 뒤표지(푸터) (DESIGN.md §9.3 뒤표지 · PRD FR-142·FR-45, M1-30)
 *
 * - 면 --colophon, 위 천공 줄(--paper 점, 6px 내려 면 안쪽에 뚫린 구멍처럼). 1023 이하는 화면 폭 전체(좌우 --edge만큼 넘침),
 *   1024 이상은 지면 폭 안에서 2단(1.1fr · 1fr, 간격 48px): 왼쪽 football-data 문구·설명, 오른쪽 링크·마지막 업데이트.
 * - 내용은 지금 화면에 있는 것의 사실만: football-data.org 필수 문구(영문 원문, FR-45) · 데이터 출처(football-data.org · API-Football,
 *   D27) · AI 작성 고지(M1-32 — 오늘의 5줄은 AI가 쓰고 AI 줄에만 'AI 작성' 라벨(FR-35·D24), 검증에 맞지 않는 줄은 라벨 없는 코드
 *   문장으로 바꾸거나 뺀다(FR-29 — brief-publish 강등·dropped), AI 답을 쓸 수 없는 날(재시도 뒤 실패·마감·비용 상한 — FR-26·27·29)은
 *   모든 줄이 코드 문장, 뉴스 카드는 AI 없이 원문 제목 그대로(D23). `/about#ai` 문구와 같은
 *   사실) · GitHub 저장소 · 마지막 업데이트 HH:MM KST(FR-142).
 * - 링크는 있는 페이지만 건다(e2e 링크 검사). 순서·문구는 DESIGN §9.3·혼합안 뒤표지 그대로: AI 작성 고지(`/about/#ai`) ·
 *   소개·출처 정책(`/about/` — 한 링크) · [개인정보 처리방침(`/privacy/`) — M5-05에서 이 자리에] · 삭제·정정 요청(`/about/#contact`) ·
 *   GitHub↗. `/about` 앵커는 `ABOUT_SECTIONS`(src/lib/about-sections.ts — M1-36)가 정한다.
 * - 안쪽 포커스 링은 --colophon-fg(색 면 안 재정의, DESIGN §9.1).
 */

interface FooterLink {
  label: string;
  href: string;
  /** 사이트 밖 링크 — 새 창 + ↗ + 화면 밖 "(새 창)"(DESIGN §9.1 외부 링크). 아니면 `next/link`(routes.* — basePath는 Link가 붙인다) */
  external?: boolean;
}

const LINKS: readonly FooterLink[] = [
  { label: "AI 작성 고지", href: aboutHref("ai") },
  { label: "소개·출처 정책", href: aboutHref() },
  { label: "삭제·정정 요청", href: aboutHref("contact") },
  { label: "GitHub", href: REPO_URL, external: true },
];

/** 링크 — 800 밑줄 1px(4px 띄움), hover 2px, 최소 44px */
const LINK =
  "inline-flex min-h-11 items-center font-extrabold underline decoration-1 underline-offset-4 hover:decoration-2";

export function Colophon({ issue }: { issue: IssueMeta | null }) {
  return (
    <footer className="relative -mx-edge mt-14 bg-colophon text-colophon-fg transition-colors duration-base [--ring:var(--colophon-fg)] before:block before:h-1 before:translate-y-1.5 before:perf-x before:content-[''] lg:mx-0 lg:mt-18">
      <div className="grid gap-2.5 px-edge pt-6.5 pb-7 text-[13px] leading-[1.6] lg:grid-cols-[1.1fr_1fr] lg:gap-x-12 lg:px-9 lg:pt-8 lg:pb-8.5">
        <p className="text-[17px] font-extrabold tracking-[-0.03em] lg:col-span-full">
          {SITE_NAME}{" "}
          {issue && (
            <span className="ml-1.5 text-[12.5px] font-normal tracking-normal text-colophon-fg-2">
              {issue.no !== null && <>제 {issue.no}호 · </>}
              <time dateTime={issue.date}>
                {formatKst(kstDayRangeUtc(issue.date).start, "fullDate")}
              </time>
            </span>
          )}
        </p>
        <p
          lang="en"
          className="font-numeric text-[15px] leading-[1.3] font-semibold tracking-[0.03em] lg:col-start-1"
        >
          {FOOTBALL_DATA_ATTRIBUTION}
        </p>
        <p className="max-w-[62ch] text-colophon-fg-2 lg:col-start-1">
          경기·출전 데이터 football-data.org · API-Football. 오늘의 5줄은 이
          데이터로 AI가 쓰고, AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다. 검증에
          맞지 않는 줄은 라벨 없는 코드 문장으로 바꾸거나 빼고, AI 답을 쓸 수
          없는 날은 모든 줄을 코드 문장으로 싣습니다. 뉴스 카드는 AI 없이 원문
          제목 그대로 싣습니다.
        </p>
        {/* list-style: none인 목록의 의미를 Safari가 지우지 않게 role="list"(DESIGN §9.3 5줄 행과 같은 처리) */}
        <ul role="list" className="flex flex-wrap gap-x-4.5 lg:col-start-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              {link.external ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener"
                  className={LINK}
                >
                  {link.label}
                  <span aria-hidden="true"> ↗</span>
                  <span className="sr-only"> (새 창)</span>
                </a>
              ) : (
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        {issue && (
          <p className="text-colophon-fg-2 lg:col-start-2">
            마지막 업데이트 <KstTime iso={issue.updatedAt} />
          </p>
        )}
      </div>
    </footer>
  );
}
