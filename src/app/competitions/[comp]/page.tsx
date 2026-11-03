import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompetitionScreen } from "@/components/competition/competition-screen";
import { SearchRecord } from "@/components/search/search-record";
import { JsonLd } from "@/components/seo/json-ld";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadCompetitionPage } from "@/lib/data/competition-page";
import { loadLatestIssue } from "@/lib/data/issue";
import { competitionPageSearchRecord } from "@/lib/data/search";
import { rssFeedLink } from "@/lib/feed-links";
import { compFromSegment, compSegment, routes } from "@/lib/paths";
import { seasonLabel } from "@/lib/rest-period";
import { competitionOgCard } from "@/lib/og";
import { competitionDescription, pageMetadata } from "@/lib/seo";
import {
  COMPETITION_EVENT_LIMIT,
  eventInputs,
  eventsJsonLd,
  upcomingMatches,
} from "@/lib/structured-data";
import { nowUtcIso, parseUtcIso } from "@/lib/time";

/*
 * `/competitions/[comp]/` 대회 페이지 (PRD FR-40~45, DESIGN §9.3 "D1 — 대회·팀 화면", plan M2-10·M2-11·M2-12)
 *
 * 6개 대회(`configs/competitions.json`)를 정적 생성한다. 화면 조립은 `CompetitionScreen`(src/components/competition/competition-screen.tsx —
 * 녹아웃 견본과 공용)이 하고, 이 파일은 파일을 읽어 넘긴다. 시각은 빌드 시각 기준(정적 — 하루 1회 발행 빌드가 다시 굳힌다).
 */

export const dynamicParams = false;

export function generateStaticParams(): { comp: string }[] {
  return loadCompetitionsConfig().map((c) => ({ comp: compSegment(c.id) }));
}

export async function generateMetadata({
  params,
}: PageProps<"/competitions/[comp]">): Promise<Metadata> {
  const { comp: segment } = await params;
  const comp = compFromSegment(segment);
  const page = comp ? loadCompetitionPage(comp) : null;
  if (!comp || !page) return {};
  const season = seasonLabel(page.config.season);
  return pageMetadata({
    title: `${page.config.nameKo} ${season}`,
    description: competitionDescription(page.config.nameKo, season),
    canonical: routes.competition(comp),
    feeds: [rssFeedLink({ kind: "competition", comp }, page.config.nameKo)],
    og: competitionOgCard(page.config),
  });
}

export default async function CompetitionPage({
  params,
}: PageProps<"/competitions/[comp]">) {
  const { comp: segment } = await params;
  const comp = compFromSegment(segment);
  const page = comp ? loadCompetitionPage(comp) : null;
  if (!comp || !page) notFound();

  const { issue, news } = loadLatestIssue();
  const nowMs = parseUtcIso(nowUtcIso()).getTime();
  // 구조화 데이터(NFR-03 — M5-03): 다가오는 경기 `COMPETITION_EVENT_LIMIT`개만 SportsEvent로(지난 경기 · 스코어 없음, 일정 전체는 싣지
  // 않는다 — 페이지 크기 M5-07). 데이터가 없거나 다가오는 경기가 없으면 스크립트 없음
  const events = page.data
    ? eventsJsonLd(
        eventInputs(
          upcomingMatches(page.data.matches, nowMs, COMPETITION_EVENT_LIMIT),
          page.team,
          () => ({ id: comp, name: page.config.nameKo }),
        ),
        `/competitions/${segment}/ JSON-LD`,
      )
    : null;
  return (
    <>
      <CompetitionScreen
        comp={comp}
        config={page.config}
        data={page.data}
        all={page.all}
        team={page.team}
        playerName={page.playerName}
        issue={issue}
        news={news}
        nowMs={nowMs}
      />
      <SearchRecord record={competitionPageSearchRecord(page.config)} />
      <JsonLd data={events} />
    </>
  );
}
