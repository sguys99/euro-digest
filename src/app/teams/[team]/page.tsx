import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Score } from "@/components/competition/marks";
import { AppShell } from "@/components/shell/app-shell";
import { TeamFixtures } from "@/components/team/team-fixtures";
import {
  KeyPlayers,
  LeagueContext,
  Reading,
  RelatedNews,
  TeamSource,
  type KoreanKeyPlayer,
} from "@/components/team/team-parts";
import { TeamSheet, type SheetPlayerView } from "@/components/team/team-sheet";
import { TeamTicket } from "@/components/team/team-ticket";
import { isCompetitionStale } from "@/lib/competition-view";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadTeamPage, type TeamPageData } from "@/lib/data/team-page";
import { listTeamSlugs } from "@/lib/data/teams";
import { absoluteUrl, routes } from "@/lib/paths";
import { seasonLabel } from "@/lib/rest-period";
import type { CompId } from "@/lib/schema/common";
import type { TeamSheetPlayer } from "@/lib/schema/team";
import { pageMetadata, teamDescription } from "@/lib/seo";
import {
  fixtureWindow,
  keyPlayerViews,
  leagueContextRows,
  nextFixtureOf,
  pitchSpots,
  POS_LABEL,
  teamFixtureViews,
  teamFormAll,
  teamMatchesOf,
  type TeamFixtureView,
} from "@/lib/team-view";
import { formatKst, parseUtcIso } from "@/lib/time";

/*
 * `/teams/[team]/` 팀 페이지 (PRD FR-50~52·FR-54~58, DESIGN §9.3 "D1 — 대회·팀 화면", DECISIONS D1 §4, plan M2-13)
 *
 * 확정 시안 `docs/design/d1/concept-mix.html` 화면 2 — A 티켓 헤더 + B 팀시트 + 리그 맥락 + 일정·결과 | 득점·도움 상위. 팀 파일
 * (`data/teams/*.json` — 5대 리그 96팀 + UCL 외부 팀, FR-50)마다 정적 생성한다.
 * - 순서: 티켓(전폭) → 팀시트(전폭, 포메이션이 없으면 섹션 없음) → 2단(1024 이상 왼쪽 목차 열 = 리그 맥락(sticky) | 지면 = 일정·결과 →
 *   득점·도움 상위(1280 이상 `1.25fr · 1fr` 2단) → 관련 뉴스 → 더 읽을거리). 1023 이하: 일정·결과 → 득점·도움 상위 → 리그 맥락 → 관련 뉴스.
 *   목차 열은 앱 셸의 목차(nav)가 아니라 이 페이지 지면 안의 열이다 — 티켓·팀시트가 목차 열 위까지 전폭이어야 해서(DESIGN §9.3 팀 화면 틀).
 * - 시각은 빌드 시각 기준(정적 — 다음 경기·결과 대기·업데이트 지연). 하루 1회 발행 빌드가 다시 굳힌다.
 * - 팀 한줄평·강점/약점(FR-53·56)·팔로우·.ics(FR-59)는 M4 — 자리를 그리지 않는다. 한국 선수 이름은 선수 페이지(M3) 전이라 링크가 아니다.
 * - 오프라인 띠는 앱 셸(M1-37), 로딩 화면은 두지 않는다(정적). 데이터가 없는 요소는 숨긴다(자리 상자 없음 — DESIGN §9.3 자리).
 */

export const dynamicParams = false;

export function generateStaticParams(): { team: string }[] {
  return listTeamSlugs().map((team) => ({ team }));
}

/** "2026-27 시즌" → "2026-27" */
function seasonShort(season: number): string {
  return seasonLabel(season).replace(/ 시즌$/, "");
}

export async function generateMetadata({
  params,
}: PageProps<"/teams/[team]">): Promise<Metadata> {
  const { team: slug } = await params;
  const page = loadTeamPage(slug, new Date());
  if (!page) return {};
  const season = page.config
    ? seasonLabel(page.config.season)
    : `${page.data ? seasonLabel(page.data.season) : "이번"}`;
  return pageMetadata({
    title: `${page.self.name} ${season}`,
    description: teamDescription(
      page.self.name,
      page.config?.nameKo ?? null,
      season,
    ),
    canonical: routes.team(slug),
  });
}

export default async function TeamPage({ params }: PageProps<"/teams/[team]">) {
  const { team: slug } = await params;
  const now = new Date();
  const page = loadTeamPage(slug, now);
  if (!page) notFound();
  const { issue } = loadLatestIssue();
  const nowMs = now.getTime();

  const { team, self, config, data, lookup } = page;
  const comps = new Map<CompId, { short: string; name: string }>(
    page.configs.map((c) => [c.id, { short: c.shortKo, name: c.nameKo }]),
  );
  const fixtures = teamFixtureViews(
    teamMatchesOf(
      page.competitions.map((c) => c.matches),
      slug,
    ),
    slug,
    lookup,
    nowMs,
  );
  const row = data?.standings.find((r) => r.team === slug) ?? null;
  const next = nextFixtureOf(fixtures, nowMs);
  const nextComp = next
    ? {
        id: next.comp,
        ...(comps.get(next.comp) ?? { short: next.comp, name: next.comp }),
      }
    : null;

  const keyPlayers = keyPlayerViews(team.topPlayers, page.playerName);
  const koreanKey = koreanKeyPlayers(page);
  const leagueName = config?.nameKo ?? null;
  const updatedAt = data?.updatedAt ?? null;
  const stale = updatedAt ? isCompetitionStale(updatedAt, nowMs) : false;

  return (
    <AppShell current="league" currentKind="section" issue={issue}>
      <article aria-labelledby="team-h" data-slot="team-page" data-team={slug}>
        <TeamTicket
          self={self}
          headingId="team-h"
          config={config}
          season={config ? seasonShort(config.season) : null}
          row={row}
          form={teamFormAll(fixtures)}
          next={next}
          nextComp={nextComp}
          korean={page.korean}
        />
        <JsonLd page={page} slug={slug} />
        {team.formation ? (
          <TeamSheet
            headingId="team-sheet-h"
            shape={team.formation.shape}
            basis={<SheetBasis page={page} fixtures={fixtures} />}
            lineup={
              team.lineup
                ? {
                    startXI: team.lineup.startXI.map((p, i) =>
                      sheetPlayer(p, `s${i}`, page),
                    ),
                    substitutes: team.lineup.substitutes.map((p, i) =>
                      sheetPlayer(p, `b${i}`, page),
                    ),
                  }
                : null
            }
            spots={team.lineup ? pitchSpots(team.lineup.startXI) : null}
            kit={self.colors?.[0] ?? null}
          />
        ) : null}
        <div className="mt-9 grid gap-9 lg:mt-10 lg:grid-cols-[var(--col-contents)_minmax(0,1fr)] lg:gap-x-9 lg:gap-y-12">
          <div className="grid content-start gap-9 lg:col-start-2 lg:row-start-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-10">
            <TeamFixtures
              headingId="team-fixtures-h"
              window={fixtureWindow(fixtures, nowMs)}
              comps={comps}
            />
            {keyPlayers.length > 0 || koreanKey.length > 0 ? (
              <KeyPlayers
                headingId="team-key-h"
                players={keyPlayers}
                korean={koreanKey}
                scope={[
                  leagueName ? `${leagueName} 시즌 누적` : "시즌 누적",
                  updatedAt ? `${formatKst(updatedAt, "monthDay")} 기준` : null,
                  "football-data.org",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
          </div>
          {page.contexts.length > 0 ? (
            <div className="grid content-start gap-9 lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
              {page.contexts.map(({ config: c, data: d }) => (
                <LeagueContext
                  key={c.id}
                  headingId={`team-context-${c.id.toLowerCase()}-h`}
                  comp={c.id}
                  title={`${c.nameKo} 순위`}
                  rows={leagueContextRows(d.standings, slug)}
                  self={slug}
                  lookup={lookup}
                />
              ))}
            </div>
          ) : null}
          <div className="grid content-start gap-9 lg:col-start-2 lg:row-start-2">
            <RelatedNews
              headingId="team-news-h"
              issues={page.related}
              teamName={self.name}
            />
            {team.reading.length > 0 ? (
              <Reading headingId="team-reading-h" items={team.reading} />
            ) : null}
          </div>
        </div>
        <TeamSource
          updatedAt={updatedAt}
          stale={stale}
          apiFootball={team.formation?.source === "api" || team.lineup !== null}
        />
      </article>
    </AppShell>
  );
}

/** 팀시트 선수 — 이름은 원어 고정, 등록 한국 선수만 한글(D63 ①) */
function sheetPlayer(
  p: TeamSheetPlayer,
  key: string,
  page: TeamPageData,
): SheetPlayerView {
  const korean = p.korean ? page.koreanBySlug.get(p.korean) : undefined;
  return {
    key,
    number: p.number,
    name: korean?.nameKo ?? p.name,
    latin: !korean,
    korean: Boolean(korean),
    pos: p.pos ? POS_LABEL[p.pos] : "",
  };
}

/** 팀시트 근거 줄 — 집계 방식 · 피치와 명단의 경기 맥락(KST 시각 · 상대 · 홈/원정 · 스코어) · API-Football */
function SheetBasis({
  page,
  fixtures,
}: {
  page: TeamPageData;
  fixtures: readonly TeamFixtureView[];
}) {
  const { formation, lineup } = page.team;
  if (!formation) return null;
  if (formation.source === "manual") {
    return <>수동 입력 · {formatKst(formation.updated, "monthDay")} 기준</>;
  }
  if (!lineup) {
    return (
      <>
        최근 라인업 최빈값 · {formatKst(formation.updated, "monthDay")} 경기까지
        집계 · 선수 배치 자료 없음 · API-Football
      </>
    );
  }
  const opponent = page.lookup(lineup.opponent);
  const kickoffMs = parseUtcIso(lineup.kickoff).getTime();
  // 원장 경기(af-) ↔ 대회 데이터 경기(football-data)는 id가 달라 대회 · 상대 · 킥오프(±3시간)로 맞춘다
  const played = fixtures.find(
    (f) =>
      f.comp === lineup.comp &&
      f.opponent.slug === lineup.opponent &&
      Math.abs(parseUtcIso(f.match.kickoff).getTime() - kickoffMs) <=
        3 * 60 * 60 * 1000,
  );
  const score = played?.match.status === "finished" ? played.match.score : null;
  return (
    <>
      최근 라인업 최빈값 · 피치와 명단은 최근 선발{" "}
      <time
        dateTime={lineup.kickoff}
        className="font-numeric text-[13px] font-semibold tabular-nums"
      >
        {formatKst(lineup.kickoff, "dayShort")}{" "}
        {formatKst(lineup.kickoff, "time")}
      </time>{" "}
      <span lang={opponent.latin ? "en" : undefined}>{opponent.name}</span>{" "}
      {lineup.side === "home" ? "홈" : "원정"}
      {score ? (
        <>
          {" "}
          <Score
            h={score.h}
            a={score.a}
            className="font-numeric font-semibold tabular-nums"
          />
        </>
      ) : null}{" "}
      · API-Football
    </>
  );
}

/** 소속 한국 선수 — 대표 대회 득점 순위에서 표기 사전 한글이 같은 선수의 골·도움(없으면 자료 없음) */
function koreanKeyPlayers(page: TeamPageData): KoreanKeyPlayer[] {
  const scorers = page.data?.scorers ?? [];
  return page.korean.map((p) => {
    const hit = scorers.find(
      (s) =>
        s.team === page.team.slug && page.playerName(s.player) === p.nameKo,
    );
    return {
      slug: p.slug,
      name: p.nameKo,
      position: p.position,
      goals: hit ? hit.goals : null,
      assists: hit ? hit.assists : null,
    };
  });
}

/** SportsTeam 구조화 데이터(NFR-03 선택) — 이름·영문 이름·종목·리그·주소만(순위·스코어 없음) */
function JsonLd({ page, slug }: { page: TeamPageData; slug: string }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: page.self.name,
    alternateName: page.team.nameEn,
    sport: "Soccer",
    url: absoluteUrl(routes.team(slug)),
    ...(page.config
      ? {
          memberOf: {
            "@type": "SportsOrganization",
            name: page.config.nameKo,
          },
        }
      : {}),
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
