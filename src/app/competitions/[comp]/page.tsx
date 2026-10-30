import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompetitionScreen } from "@/components/competition/competition-screen";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadCompetitionPage } from "@/lib/data/competition-page";
import { loadLatestIssue } from "@/lib/data/issue";
import { compFromSegment, compSegment, routes } from "@/lib/paths";
import { seasonLabel } from "@/lib/rest-period";
import { competitionDescription, pageMetadata } from "@/lib/seo";
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
  return (
    <CompetitionScreen
      comp={comp}
      config={page.config}
      data={page.data}
      all={page.all}
      team={page.team}
      playerName={page.playerName}
      issue={issue}
      news={news}
      nowMs={parseUtcIso(nowUtcIso()).getTime()}
    />
  );
}
