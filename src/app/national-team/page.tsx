import type { Metadata } from "next";
import Link from "next/link";

import { Leader } from "@/components/about/leader";
import {
  NATIONAL_LINK,
  NationalNews,
  NationalSchedule,
  NationalSourceNote,
  NationalSquad,
} from "@/components/national-team/national-team";
import { NewsFeed } from "@/components/news-feed";
import { AppShell } from "@/components/shell/app-shell";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import { cx } from "@/lib/cx";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadNationalPage, nationalNewsTags } from "@/lib/data/national-page";
import { issueNumber } from "@/lib/issue";
import { isNationalCard } from "@/lib/national-team-view";
import { routes } from "@/lib/paths";
import { NATIONAL_TEAM_DESCRIPTION, pageMetadata } from "@/lib/seo";

/*
 * `/national-team/` 대표팀 (PRD FR-70~73, DESIGN §9.3 D2 "`/national-team` 틀", DECISIONS D2 §5 #4 · §6 #8 · §8, D64 ⑦, plan M3-13)
 *
 * 혼합안 `docs/design/d2/concept-mix.html` 견본 "/national-team 구조" 순서 그대로: 머리("대표팀" h1 + NATIONAL TEAM) → 한국 대표팀 일정·결과 →
 * 소집 명단(등록 한국 선수 = 선수 상세 링크, FR-73) → 대표팀 소식(한국 — 뉴스 행) → 주요국 A매치 뉴스(최신 호 `cat: national` 전체 —
 * `/news/?cat=national`과 같은 결과, FR-72) → 출처 줄(일정 · 결과 · 명단은 사람이 적는 설정 — 근거 링크). 혼합안이 자리로만 그린 일정 ·
 * 명단 값은 기존 문법으로 채웠다(src/components/national-team/national-team.tsx 머리 주석).
 * - **DOM 순서 = 1279 이하 순서**(선수 상세와 같은 규칙 — `display: contents` · `order` 없음). 1024 이상은 왼쪽 목차 열(차례 + 건수), 1280
 *   이상은 지면 안 grid 2열(`1fr · --col-facing`, 옆단 왼쪽 1px `--ink` 세로 괘선): 지면 열 = 1행 일정·결과 · 2행 주요국 A매치 뉴스 · 3행 출처 줄,
 *   옆단 = **이어지는 형제** 소집 명단 · 대표팀 소식을 묶어 1행부터 마지막 `1fr` 행(4행)까지 걸친다(옆단이 길어도 지면 행이 벌어지지 않는다 —
 *   선수 상세 옆단과 같은 방식, DESIGN §11.21).
 * - 데이터가 없는 구역은 숨긴다(자리 상자 없음 — DECISIONS D2 §6 #8): 설정이 없으면 일정 · 명단 · 출처 줄이 없다. 주요국 A매치 뉴스는 늘 —
 *   최신 호에 대표팀 카드가 없으면 빈 상태 문장.
 * - 시각은 빌드 시각 기준(일정 행의 예정 · 결과 대기). 내비 탭에는 없는 페이지다(PRD §4.1 — 홈 A매치 섹션 · 선수 상세 대표팀 소식에서 진입).
 */

export const metadata: Metadata = pageMetadata({
  title: "대표팀",
  description: NATIONAL_TEAM_DESCRIPTION,
  canonical: routes.nationalTeam(),
});

const HEADING_ID = "nt-page-h";
const IDS = {
  schedule: "nt-schedule",
  squad: "nt-squad",
  news: "nt-news",
  world: "nt-world",
} as const;

/** 1280 이상 두 열(머리 주석) — 선수 상세와 같은 값 */
const GRID =
  "xl:relative xl:grid xl:grid-cols-[minmax(0,1fr)_var(--col-facing)] xl:grid-rows-[auto_auto_auto_1fr] xl:items-start xl:before:absolute xl:before:inset-y-0 xl:before:right-[calc(var(--col-facing)-1px)] xl:before:w-px xl:before:bg-ink xl:before:content-['']";
const MAIN = "xl:col-start-1 xl:pr-8";
const SIDE =
  "xl:col-start-2 xl:row-span-4 xl:row-start-1 xl:min-w-0 xl:pl-[33px]";

/** 1024 이상 목차 — 차례 + 구역별 건수(장식 숫자 — 각 구역 부제가 같은 수를 글자로 쓴다) */
function NationalToc({
  items,
}: {
  items: ReadonlyArray<{ id: string; title: string; count: number }>;
}) {
  return (
    <>
      <SectionHead heading="차례" headingAs="p" runningHead="CONTENTS" />
      <ol role="list" className="mt-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="group/row flex min-h-11 items-center gap-1.75 border-b border-rule text-sm leading-[1.3] text-ink no-underline"
            >
              <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                {item.title}
              </span>
              <Leader className="min-w-2" />
              <span
                aria-hidden="true"
                className="min-w-4.5 text-right font-numeric text-[17px] leading-none font-semibold text-ink-2 lining-nums tabular-nums"
              >
                {item.count}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function NationalTeamPage() {
  const now = new Date();
  const { news: latest, issue } = loadLatestIssue();
  const page = loadNationalPage(now);
  const tagsOf = nationalNewsTags();
  const worldCount = latest ? latest.cards.filter(isNationalCard).length : 0;
  const no = latest ? issueNumber(latest.date) : null;

  const hasSchedule = page.rows.length > 0;
  const hasSquad = page.squad !== null && page.squad.players.length > 0;
  const hasNews = page.news.items.length > 0;
  const hasSide = hasSquad || hasNews;

  const toc = [
    ...(hasSchedule
      ? [{ id: IDS.schedule, title: "일정·결과", count: page.rows.length }]
      : []),
    ...(hasSquad
      ? [
          {
            id: IDS.squad,
            title: "소집 명단",
            count: page.squad!.players.length,
          },
        ]
      : []),
    ...(hasNews
      ? [{ id: IDS.news, title: "대표팀 소식", count: page.news.total }]
      : []),
    { id: IDS.world, title: "주요국 A매치 뉴스", count: worldCount },
  ];

  return (
    <AppShell
      issue={issue}
      contents={<NationalToc items={toc} />}
      contentsLabel="대표팀 차례"
    >
      <div data-slot="national-page">
        <SectionHead
          heading="대표팀"
          headingAs="h1"
          headingId={HEADING_ID}
          runningHead="NATIONAL TEAM"
        />
        <p className="mt-0.75 text-[13px] leading-normal text-ink-2">
          한국 대표팀 A매치와 소집 선수, 대표팀 소식 · 주요국 A매치 뉴스
        </p>
        <div className={cx("mt-6 lg:mt-8", hasSide && GRID)}>
          {hasSchedule ? (
            <div className={cx(hasSide && MAIN, hasSide && "xl:row-start-1")}>
              <NationalSchedule id={IDS.schedule} rows={page.rows} />
            </div>
          ) : null}
          {/* 옆단 묶음 — 소집 명단 · 대표팀 소식(1279 이하 순서 그대로 이어지는 형제) */}
          {hasSide ? (
            <div
              data-slot="national-side"
              className={cx(
                SIDE,
                "[&>section+section]:mt-9 lg:[&>section+section]:mt-11",
                hasSchedule &&
                  "[&>section:first-child]:mt-9 lg:[&>section:first-child]:mt-11 xl:[&>section:first-child]:mt-0",
              )}
            >
              {hasSquad ? (
                <NationalSquad id={IDS.squad} squad={page.squad!} sideAtXl />
              ) : null}
              {hasNews ? (
                <NationalNews
                  id={IDS.news}
                  news={page.news}
                  tagsOf={tagsOf}
                  sideAtXl
                />
              ) : null}
            </div>
          ) : null}
          <section
            id={IDS.world}
            aria-labelledby={`${IDS.world}-h`}
            data-slot="national-world"
            className={cx(
              "scroll-mt-4",
              (hasSchedule || hasSide) && "mt-9 lg:mt-11",
              hasSide && MAIN,
              hasSide &&
                (hasSchedule ? "xl:row-start-2" : "xl:row-start-1 xl:mt-0"),
            )}
          >
            <SectionHead
              heading="주요국 A매치 뉴스"
              headingId={`${IDS.world}-h`}
              runningHead="INTERNATIONALS"
            />
            <p className="mt-0.75 text-[13px] leading-normal text-ink-2 tabular-nums">
              {no !== null ? `제 ${no}호 · ` : ""}뉴스의 ‘대표팀’ 필터와 같은
              목록
            </p>
            <NewsFeed
              news={latest}
              lead={false}
              id="national-world-feed"
              titleAs="h3"
              scope={{
                match: isNationalCard,
                desc: "대표팀",
                empty: "이 호에는 대표팀 소식이 없어요.",
              }}
            />
            <p className="mt-3">
              <Link
                href={`${routes.news()}?cat=national`}
                className={NATIONAL_LINK}
              >
                뉴스에서 대표팀 소식 모아 보기
                <ChevronRightIcon size={16} />
              </Link>
            </p>
          </section>
          {hasSchedule || hasSquad ? (
            <div
              className={cx(
                "pt-9 lg:pt-11",
                hasSide && MAIN,
                hasSide && (hasSchedule ? "xl:row-start-3" : "xl:row-start-2"),
              )}
            >
              <NationalSourceNote links={page.sources} />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
