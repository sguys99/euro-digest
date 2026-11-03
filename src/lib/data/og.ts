/**
 * OG 이미지 카드 전부 — 빌드 스크립트(scripts/build-og.ts)가 구울 목록 (PRD DR-10, plan M5-01)
 *
 * 페이지가 메타에 거는 카드(src/app/** `pageMetadata({ og })`)와 **같은 빌더 · 같은 로더**로 만든다 — 그래서 페이지가 가리키는 이미지가
 * 늘 이 목록 안에 있다(tests/e2e/og.spec.ts가 out/ 전 페이지로 확인). 빌드 때(Node fs)만 쓴다.
 * - 기본 1 · 쪽 이름형(`OG_PAGES`) · 날짜(발행된 호 전부 — 날짜 아카이브 `generateStaticParams`와 같은 `listIssueDates`) ·
 *   대회(설정 전부 — 대회 페이지 `generateStaticParams`와 같다) · 팀(팀 파일 전부 — 배지 색 · 약어가 없으면 기본 OG로 접힌다).
 * - 같은 경로는 한 번만(팀이 기본 OG로 접히면 기본과 겹친다).
 */
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { listIssueDates } from "@/lib/data/issue";
import { listTeamSlugs, loadTeam } from "@/lib/data/teams";
import {
  competitionOgCard,
  DEFAULT_OG_CARD,
  newsOgCard,
  OG_PAGES,
  ogImageOf,
  pageOgCard,
  teamOgCard,
  type OgCard,
  type OgPageName,
} from "@/lib/og";
import { artifacts } from "@/lib/paths";

export interface PlannedOgCard {
  /** 사이트 경로(basePath 없음) — `/og/…png` */
  path: string;
  card: OgCard;
}

export function loadOgCards(): PlannedOgCard[] {
  const configs = loadCompetitionsConfig();
  const lookup = loadTeamLookup();
  const cards: OgCard[] = [
    DEFAULT_OG_CARD,
    ...(Object.keys(OG_PAGES) as OgPageName[]).map(pageOgCard),
    ...listIssueDates().map(newsOgCard),
    ...configs.map(competitionOgCard),
    ...listTeamSlugs().flatMap((slug) => {
      const team = loadTeam(slug);
      return team ? [teamOgCard(lookup(slug), team, configs)] : [];
    }),
  ];
  const byPath = new Map<string, PlannedOgCard>();
  for (const card of cards) {
    const path = artifacts.ogImage(ogImageOf(card));
    if (!byPath.has(path)) byPath.set(path, { path, card });
  }
  return [...byPath.values()];
}
