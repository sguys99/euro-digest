import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  CompetitionViews,
  type CompetitionView,
} from "@/components/competition/competition-views";
import {
  CompetitionContents,
  CompetitionHead,
  CompetitionSource,
  CompetitionSwitch,
  StandingsLegend,
} from "@/components/competition/competition-parts";
import { RoundBook, RoundDays } from "@/components/competition/rounds";
import { ScorerList, ScorerTable } from "@/components/competition/scorers";
import { StandingsTable } from "@/components/competition/standings-table";
import { NewsFeed } from "@/components/news-feed";
import { AppShell } from "@/components/shell/app-shell";
import { LEAGUE_NAV_COMP } from "@/components/shell/site-nav";
import { SectionHead } from "@/components/ui/section-head";
import {
  currentRoundOf,
  cutScorers,
  formScopeOf,
  isCompetitionStale,
  roundStatusText,
  roundsOf,
  scorerViews,
  standingLines,
  trendLegendText,
} from "@/lib/competition-view";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadCompetitionPage } from "@/lib/data/competition-page";
import { loadLatestIssue } from "@/lib/data/issue";
import { compFromSegment, compSegment, routes } from "@/lib/paths";
import { seasonLabel } from "@/lib/rest-period";
import { competitionDescription, pageMetadata } from "@/lib/seo";
import { formatKst, nowUtcIso, parseUtcIso } from "@/lib/time";

/*
 * `/competitions/[comp]/` 대회 페이지 (PRD FR-40·41·42·44·45, DESIGN §9.3 "D1 — 대회·팀 화면", plan M2-10·M2-11)
 *
 * 확정 시안 `docs/design/d1/concept-mix.html` 화면 1(A 프로그램 리그표). 6개 대회(`configs/competitions.json`)를 정적 생성한다.
 * - 머리(평탄 탭 · 시즌 · h1 대회명 · 라운드 상태 · 순위 갱신 시각) → 대회 이동(1023 이하 6칸 / 1024 이상 앱 셸 목차 열) → 보기 탭 4개
 *   (순위표 · 일정·결과 · 득점 순위 · 뉴스 — 섬 하나, 패널은 모두 정적 HTML) → 데이터 출처 줄(FR-45).
 * - 순위표 패널 = 한 장 표 + 범례 + 아래 2단(지금 라운드 | 득점 상위 5 — 1024 이상 1.25fr · 1fr).
 * - 일정·결과 = 라운드 전체(지금 라운드가 보이고 앵커 링크로 이동 — JS 없이도 동작), 득점 순위 = 표(10위까지, 최대 20명),
 *   뉴스 = 최신 호 카드 중 이 대회 카드(게재 번호 유지) + `/news/?comp=` 링크.
 * - 시각은 빌드 시각 기준(정적 — "결과 대기"·"업데이트 지연"·지금 라운드). 하루 1회 발행 빌드가 다시 굳힌다.
 * - 데이터 파일이 없으면(CI·첫 수집 전) 머리 + 빈 상태. 오프라인 띠는 앱 셸(M1-37), 로딩 화면은 두지 않는다(정적 — M1-37 결정).
 * - 팀 이름은 아직 링크가 아니다(팀 페이지 M2-13 — 이월).
 */

export const dynamicParams = false;

export function generateStaticParams(): { comp: string }[] {
  return loadCompetitionsConfig().map((c) => ({ comp: compSegment(c.id) }));
}

/** 득점 순위 탭 — 이 순위까지, 최대 행 수 */
const SCORER_TABLE_RANK = 10;
const SCORER_TABLE_MAX = 20;
/** 순위표 패널 아래 득점 상위 */
const SCORER_SUMMARY = 5;

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

/** JS가 없으면 숨은 보기 패널을 모두 펼치고 탭 목록을 숨긴다(진보적 향상 — competition-views.tsx) */
const NOSCRIPT_STYLE =
  "<style>[data-competition] [role=tabpanel][hidden]{display:block!important}[data-competition] [data-slot=competition-tabs]{display:none!important}</style>";

export default async function CompetitionPage({
  params,
}: PageProps<"/competitions/[comp]">) {
  const { comp: segment } = await params;
  const comp = compFromSegment(segment);
  const page = comp ? loadCompetitionPage(comp) : null;
  if (!comp || !page) notFound();

  const { config, data, all, team, playerName } = page;
  const { issue, news } = loadLatestIssue();
  const now = nowUtcIso();
  const nowMs = parseUtcIso(now).getTime();
  const season = seasonLabel(config.season);
  const headingId = "competition-h";

  const rounds = data ? roundsOf(data.matches, team, nowMs) : [];
  const current = currentRoundOf(rounds, nowMs);
  const currentRound = current ? rounds[current.index] : undefined;

  const status = data ? (
    <>
      {currentRound && current
        ? `${roundStatusText(currentRound, current.state)} · `
        : null}
      순위{" "}
      <time dateTime={data.updatedAt}>
        {formatKst(data.updatedAt, "short")} KST
      </time>{" "}
      갱신
    </>
  ) : null;

  const shell = (children: ReactNode) => (
    <AppShell
      current="league"
      currentKind={comp === LEAGUE_NAV_COMP ? "page" : "section"}
      issue={issue}
      contents={<CompetitionContents current={comp} all={all} />}
      contentsLabel="대회"
    >
      <section
        aria-labelledby={headingId}
        data-competition={comp}
        data-slot="competition-page"
      >
        <CompetitionHead
          config={config}
          season={season}
          headingId={headingId}
          status={status}
        />
        <CompetitionSwitch current={comp} all={all} />
        {children}
      </section>
    </AppShell>
  );

  if (!data) {
    return shell(
      <div data-slot="competition-empty" className="mt-6 pt-1 pb-2">
        <p className="text-[15px] font-extrabold">
          아직 이 대회 자료가 없어요.
        </p>
        <p className="mt-2 text-[13.5px] text-ink-2">
          순위·일정 데이터를 받으면 이곳에 순위표와 경기 일정이 실립니다.
        </p>
      </div>,
    );
  }

  const formScope = formScopeOf(comp);
  const lines = standingLines(data.standings, config.zones, team, formScope);
  const hasPrev = data.standings.some((r) => r.prevPos !== null);
  const scorers = scorerViews(data.scorers, team, playerName);
  const scorerSummary = cutScorers(scorers, SCORER_SUMMARY);
  const scorerTable = cutScorers(scorers, SCORER_TABLE_MAX, SCORER_TABLE_RANK);
  const scorerDate = formatKst(data.updatedAt, "monthDay");
  const stale = isCompetitionStale(data.updatedAt, nowMs);

  const standingsPanel = (
    <>
      {data.standings.length > 0 ? (
        <>
          <StandingsTable
            id={`standings-${compSegment(comp)}`}
            compName={config.nameKo}
            updatedAt={data.updatedAt}
            lines={lines}
            matches={data.matches}
            formScope={formScope}
            team={team}
            hasPrev={hasPrev}
          />
          <StandingsLegend
            zones={config.zones}
            trendText={trendLegendText(data.standings)}
          />
        </>
      ) : (
        <EmptyNote
          title="아직 순위표가 없어요."
          body="시즌 첫 경기가 끝나면 순위표가 실립니다."
        />
      )}
      <div className="mt-9 grid gap-9 lg:mt-11 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
        {currentRound ? (
          <section aria-labelledby="round-now-h" data-slot="round-now">
            <SectionHead
              thin
              heading={currentRound.label}
              headingId="round-now-h"
              runningHead="FIXTURES"
            />
            <p className="mt-0.75 text-[13px] text-ink-2">
              {currentRound.range} · 킥오프 KST · 종료 {currentRound.finished} ·
              예정 {currentRound.upcoming}
            </p>
            <RoundDays round={currentRound} />
          </section>
        ) : null}
        {scorerSummary.rows.length > 0 ? (
          <section aria-labelledby="scorers-top-h" data-slot="scorers-top">
            <SectionHead
              thin
              heading="득점 순위"
              headingId="scorers-top-h"
              runningHead="TOP SCORERS"
            />
            <ScorerList
              rows={scorerSummary.rows}
              label={`득점 순위 상위 ${SCORER_SUMMARY}`}
            />
            <p className="mt-2 text-[12.5px] leading-normal text-ink-2">
              {scorerSummary.tieNote ? `${scorerSummary.tieNote} · ` : null}
              {scorerDate} 기준
            </p>
          </section>
        ) : null}
      </div>
    </>
  );

  const fixturesPanel =
    rounds.length > 0 && current ? (
      <RoundBook rounds={rounds} currentIndex={current.index} />
    ) : (
      <EmptyNote
        id="fixtures"
        title="아직 경기 일정이 없어요."
        body="일정이 발표되면 라운드별로 실립니다."
      />
    );

  const scorersPanel =
    scorerTable.rows.length > 0 ? (
      <div id="scorers" className="scroll-mt-4">
        <ScorerTable
          rows={scorerTable.rows}
          caption={`${config.nameKo} 득점 순위 ${SCORER_TABLE_RANK}위까지 — ${formatKst(data.updatedAt, "date")} 기준`}
        />
        <p className="mt-2 text-[12.5px] leading-normal text-ink-2">
          {scorerTable.tieNote ? `${scorerTable.tieNote} · ` : null}
          {scorerDate} 기준 · 도움·PK 자료가 없는 선수는 –
        </p>
      </div>
    ) : (
      <EmptyNote
        id="scorers"
        title="아직 득점 기록이 없어요."
        body="득점 순위 자료를 받으면 이곳에 실립니다."
      />
    );

  const newsPanel = (
    <div id="news" className="scroll-mt-4">
      <NewsFeed
        news={news}
        lead={false}
        id="competition-feed"
        titleAs="h2"
        scope={{
          match: (card) => card.comp.includes(comp),
          desc: config.nameKo,
          empty: `이 호에는 ${config.nameKo} 소식이 없어요.`,
        }}
      />
      <p className="mt-3">
        <Link
          href={`${routes.news()}?comp=${compSegment(comp)}`}
          className="inline-flex min-h-11 items-center text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          뉴스에서 {config.shortKo} 소식 모아 보기 ›
        </Link>
      </p>
    </div>
  );

  const views: CompetitionView[] = [
    { value: "table", label: "순위표", content: standingsPanel },
    { value: "fixtures", label: "일정·결과", content: fixturesPanel },
    { value: "scorers", label: "득점 순위", content: scorersPanel },
    { value: "news", label: "뉴스", content: newsPanel },
  ];

  return shell(
    <>
      <CompetitionViews label={`${config.nameKo} 보기`} views={views} />
      <CompetitionSource updatedAt={data.updatedAt} stale={stale} />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLE }} />
    </>,
  );
}

/** 패널 빈 상태 — 15px 800 + 안내 13.5px `--ink-2`(뉴스 피드 빈 상태와 같은 모양) */
function EmptyNote({
  id,
  title,
  body,
}: {
  id?: string;
  title: string;
  body: string;
}) {
  return (
    <div id={id} className="pt-7 pb-2">
      <p className="text-[15px] font-extrabold">{title}</p>
      <p className="mt-2 text-[13.5px] text-ink-2">{body}</p>
    </div>
  );
}
