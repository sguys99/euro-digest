import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataSourceNote } from "@/components/data-source";
import {
  MatchLog,
  NationalNews,
  NextMatches,
  PlayerIndex,
  RelatedNews,
  SeasonRecord,
  TransferNews,
} from "@/components/korean-players/player-detail";
import { PlayerTicket } from "@/components/korean-players/player-ticket";
import { AppShell } from "@/components/shell/app-shell";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { RunningHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import {
  listKoreanPlayerSlugs,
  loadPlayerPage,
  type PlayerPageData,
} from "@/lib/data/player-page";
import { cx } from "@/lib/cx";
import { absoluteUrl, routes } from "@/lib/paths";
import { koreanPlayerDescription, pageMetadata } from "@/lib/seo";

/*
 * `/korean-players/[slug]/` 한국 선수 상세 (PRD FR-62·FR-64·FR-65·FR-73, DESIGN §9.3 "D2 — 한국 선수·이적·마이 팀 화면" 선수 티켓 · 시즌 기록 표 ·
 * 경기 로그 행 · 다음 경기 입장권 · 화면별 배치 "선수 상세", DECISIONS D2 §4 · §6 #6~#8 · §8, plan M3-10)
 *
 * 확정 시안 `docs/design/d2/concept-mix.html` 화면 1 상세 — B 선수 티켓 · A 시즌 기록 표 · C 최근 5경기 로그 · B 다음 경기 입장권 · 1280 옆단.
 * 설정(`configs/korean-players.json`)의 선수 전원을 정적 생성한다(비활성 · 기록 연결 전 포함 — 상태에 맞게 숨기고 상태 문장을 쓴다).
 * - **DOM 순서 = 1279 이하 순서**(DECISIONS D2 §6 #6): 쪽 머리 → 선수 티켓 → 시즌 기록 → 최근 5경기 → 다음 경기 → 관련 뉴스 → 이적설 →
 *   대표팀 소식 → 출처 줄. `display: contents` · `order`는 쓰지 않는다 — 접근성 트리 순서 = 1279 이하 화면 순서. 1280 이상은 grid 2열
 *   (`1fr · --col-facing`, 옆단 왼쪽 1px `--ink` 세로 괘선)에 **이어지는 형제만 묶은 두 묶음**(머리 묶음 = 쪽 머리 · 티켓 · 시즌 · 로그, 아래 옆단
 *   묶음 = 이적설 · 대표팀 — 1279 이하 순서는 그대로)과 다음 경기 · 관련 뉴스 · 출처 줄을 행에 놓는다. 서로 끼어 있는 두 열을 각자 높이로 쌓는
 *   것은 CSS만으로 안 되므로(masonry — float도 앞 요소 위로 못 올라간다) 행 배치를 상태로 고른다: 기록 연결 선수는 다음 경기를 머리 묶음 행에
 *   붙이고(sticky — 머리 묶음을 읽는 동안 남는다) 이적설 · 대표팀을 관련 뉴스 옆에, 연결 전 · 기타 리그는 다음 경기를 머리 묶음 + 관련 뉴스 행에
 *   걸치고 아래 묶음을 그다음 행에 둔다(DESIGN §11.21). 옆단 항목이 하나도 없으면 1280도 지면 한 열.
 * - 데이터가 없으면 그 구역을 숨긴다(자리 상자 없음 — DECISIONS D2 §6 #8). 관련 뉴스만 0건이면 빈 상태 문장(DESIGN §9.3 화면별 배치).
 * - 팔로우 버튼(M4-08) · .ics(M4-12) · 결과 가리기(M4-15 — 결과 칸 구조만)는 범위 밖. 시각은 빌드 시각 기준(다음 경기 · 업데이트 지연).
 */

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listKoreanPlayerSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/korean-players/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = loadPlayerPage(slug, new Date());
  if (!page) return {};
  const { view } = page;
  return pageMetadata({
    title: `${view.nameKo} — 한국 선수`,
    description: koreanPlayerDescription(
      view.nameKo,
      view.team.name,
      view.league.kind === "comp" ? view.league.name : null,
      view.sinceLabel,
    ),
    canonical: routes.koreanPlayer(slug),
  });
}

/** 1280 이상 두 열(머리 주석) — 시안 그대로: 옆단 열 = `--col-facing`(296px — 왼쪽 1px 괘선 + 안쪽 32px 포함), 지면 오른쪽 32px */
const GRID =
  "xl:relative xl:grid xl:grid-cols-[minmax(0,1fr)_var(--col-facing)] xl:items-start xl:before:absolute xl:before:inset-y-0 xl:before:right-[calc(var(--col-facing)-1px)] xl:before:w-px xl:before:bg-ink xl:before:content-['']";
const MAIN = "xl:col-start-1 xl:pr-8";
const SIDE = "xl:col-start-2 xl:min-w-0 xl:pl-[33px]";

const TRANSFERS_ID = "pd-transfers";
const NATIONAL_ID = "pd-national";

export default async function KoreanPlayerPage({
  params,
}: PageProps<"/korean-players/[slug]">) {
  const { slug } = await params;
  const page = loadPlayerPage(slug, new Date());
  if (!page) notFound();
  const { issue } = loadLatestIssue();
  const { view, news, callUp } = page;

  const hasNext = view.upcoming.length > 0;
  const hasTransfers = news.transfer.items.length > 0;
  const hasNational = callUp !== null || news.national.items.length > 0;
  const hasLower = hasTransfers || hasNational;
  const hasSide = hasNext || hasLower;
  // 1280 이상 행 배치(머리 주석): 지면 1행 = 머리 묶음(쪽 머리 · 티켓 · 시즌 · 로그), 2행 = 관련 뉴스, 3행 = 출처 줄.
  // 기록이 연결된 선수는 머리 묶음이 다음 경기보다 늘 길어 다음 경기를 1행에 붙이고(sticky — 머리 묶음을 읽는 동안 남는다) 이적설 ·
  // 대표팀을 관련 뉴스 옆(2~3행)에 둔다. 연결 전 · 기타 리그는 머리 묶음이 짧아 다음 경기를 1~2행에 걸치고 아래 묶음을 3행에 둔다.
  const tall = view.state === "linked";
  const nextRows = tall
    ? "xl:sticky xl:top-4 xl:row-start-1"
    : "xl:row-span-2 xl:row-start-1";
  const lowerRows = !hasNext
    ? "xl:row-span-3 xl:row-start-1 xl:[&>div:first-child>section]:mt-0"
    : tall
      ? "xl:row-span-2 xl:row-start-2"
      : "xl:row-start-3";

  return (
    <AppShell
      current="korean"
      currentKind="section"
      issue={issue}
      contents={<PlayerIndex roster={page.roster} current={slug} />}
      contentsLabel="한국 선수 명단"
    >
      <div
        data-slot="player-page"
        data-player={slug}
        data-state={view.state}
        className={cx(hasSide && GRID)}
      >
        {/* 머리 묶음 — 쪽 머리 · 선수 티켓 · 시즌 기록 · 최근 5경기(1279 이하 순서 그대로 이어지는 형제를 감쌌다) */}
        <div className={cx(hasSide && MAIN, hasSide && "xl:row-start-1")}>
          <p className="flex items-center justify-between gap-2 pt-1">
            <Link
              href={routes.koreanPlayers()}
              className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              <ChevronLeftIcon size={16} />
              한국 선수
            </Link>
            <RunningHead>PLAYER REGISTER</RunningHead>
          </p>
          <PlayerTicket
            view={view}
            headingId="pd-h"
            transferTag={page.transferTag}
            transferCount={news.transfer.total}
            callUp={callUp}
            nationalCount={news.national.total}
            transferHref={`#${TRANSFERS_ID}`}
            nationalHref={`#${NATIONAL_ID}`}
          />
          {view.season.length > 0 ? (
            <SeasonRecord
              headingId="pd-season-h"
              rows={view.season}
              total={view.total}
              sinceLabel={view.sinceLabel}
            />
          ) : null}
          {view.state === "linked" ? (
            <MatchLog
              headingId="pd-log-h"
              rows={view.log}
              gap={view.logGap}
              since={view.since}
              sinceLabel={view.sinceLabel}
              teamName={view.team.name}
            />
          ) : null}
        </div>
        {hasNext ? (
          <div className={cx(SIDE, nextRows)}>
            <NextMatches headingId="pd-next-h" rows={view.upcoming} />
          </div>
        ) : null}
        <div className={cx(hasSide && MAIN, hasSide && "xl:row-start-2")}>
          <RelatedNews
            headingId="pd-news-h"
            ko={news.ko}
            en={news.en}
            name={view.nameKo}
          />
        </div>
        {/* 아래 옆단 묶음 — 이적설 · 대표팀 소식(이어지는 형제를 감쌌다) */}
        {hasLower ? (
          <div className={cx(SIDE, lowerRows)}>
            {hasTransfers ? (
              <div>
                <TransferNews
                  id={TRANSFERS_ID}
                  items={news.transfer.items}
                  total={news.transfer.total}
                />
              </div>
            ) : null}
            {hasNational ? (
              <div>
                <NationalNews
                  id={NATIONAL_ID}
                  callUp={callUp}
                  items={news.national.items}
                  total={news.national.total}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {/* 출처 줄 — football-data(순위 · 일정)나 API-Football(출전 기록)을 실은 선수만(기타 리그 선수는 실은 데이터가 없다) */}
        {view.standing || hasNext || view.state === "linked" ? (
          <div
            className={cx(
              "pt-9 lg:pt-11",
              hasSide && MAIN,
              hasSide && "xl:row-start-3",
            )}
          >
            <DataSourceNote
              source={page.source}
              covers="순위·다음 경기 일정"
              apiFootball={view.state === "linked" ? "출전·분·골·도움" : null}
              scope="korean-player"
            />
          </div>
        ) : null}
      </div>
      <JsonLd page={page} slug={slug} />
    </AppShell>
  );
}

/** Person 구조화 데이터(NFR-03 선택) — 이름 · 영문 이름 · 소속 팀만(출전 · 결과 수치 없음) */
function JsonLd({ page, slug }: { page: PlayerPageData; slug: string }) {
  const { view } = page;
  const json = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: view.nameKo,
    alternateName: view.nameEn,
    url: absoluteUrl(routes.koreanPlayer(slug)),
    memberOf: { "@type": "SportsTeam", name: view.team.name },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(json).replace(/</g, "\\u003c"),
      }}
    />
  );
}
