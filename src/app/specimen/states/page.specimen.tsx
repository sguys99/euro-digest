import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BriefMissing, TodayBrief } from "@/components/brief/today-brief";
import { NewsFeed } from "@/components/news-feed";
import { FilterEmptyState } from "@/components/news/news-filter";
import { IssueLateNotice } from "@/components/shell/issue-late-notice";
import { OfflineBand } from "@/components/shell/offline-band";
import { FilterClearButton } from "@/components/ui/filter-clear-button";
import { SectionHead } from "@/components/ui/section-head";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { issueLateWindows, issueMeta } from "@/lib/issue";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";
import { NewsFileSchema } from "@/lib/schema/news";

import briefEmptyJson from "../../../../fixtures/brief-empty.json";
import briefSampleJson from "../../../../fixtures/brief-sample.json";
import newsSampleJson from "../../../../fixtures/news-sample.json";

/**
 * 상태 화면 4종 견본(M1-37 — DESIGN §9.3 상태 화면 4종, PRD DR-07) — `SPECIMEN=1` 빌드 전용(`/specimen/states/`, 공개 빌드에 없음).
 * 혼합안 `concept-mix.html` "상태 화면 4종"(`#spec-states`)과 같은 배치·같은 fixtures로 실제 컴포넌트를 싣는다 — 로딩(스켈레톤) · 빈 상태(필터 0건 ·
 * 비시즌 종료·개막 전) · 오류(발행 지연 안내 + 마지막 정상 지면 · 5줄 자리 오류) · 오프라인(띠 + 지면). 실제 화면에서는 시각·연결에 따라 보였다
 * 숨는 상자를 여기서는 늘 보인다(`visible` — 스크립트·섬 없음). 실제 동작(가짜 시계·offline 이벤트)은 홈 견본·실제 홈 e2e가 본다.
 * 경기 없는 날(S4)은 기초 컴포넌트 견본의 5줄 S4(`/specimen/`)가 기준이다.
 */

export const metadata: Metadata = {
  title: "상태 화면 견본",
  robots: { index: false, follow: false },
};

const news = NewsFileSchema.parse(newsSampleJson);
const emptyBrief = BriefFileSchema.parse(briefEmptyJson);

function sameDayBrief(): BriefFile {
  const day = BriefFileSchema.array()
    .parse(briefSampleJson.days)
    .find((d) => d.date === news.date);
  if (!day) throw new Error(`fixtures/brief-sample.json에 ${news.date} 없음`);
  return day;
}

/** 오프라인 견본 지면 — 혼합안과 같은 fixture 카드 2장(c_d8ecc21d28 감독·구단 · c_92935e72fe 부상 — 게재 번호는 이 견본에서 06부터) */
const offlineNews = {
  ...news,
  cards: news.cards.filter((c) =>
    ["c_d8ecc21d28", "c_92935e72fe"].includes(c.id),
  ),
};

/** 비시즌 견본 — 같은 S4 합성 파일의 날짜만 시즌 밖으로(설정 실값으로 판정: 모두 끝남 · 개막 전) */
const OFF_SEASON = [
  ["ended", "모두 끝난 뒤(2027-06-10 — 가장 늦게 끝난 대회)", "2027-06-10"],
  ["upcoming", "개막 전(2026-08-01 — 가장 먼저 개막하는 대회)", "2026-08-01"],
] as const;

function Frame({
  caption,
  detail,
  slot,
  children,
}: {
  caption: string;
  detail: string;
  slot: string;
  children: ReactNode;
}) {
  return (
    <figure
      data-specimen={slot}
      className="m-0 min-w-0 border border-rule py-3.5 pl-3.5"
    >
      <figcaption className="mr-3.5 mb-3 text-[12.5px] leading-normal text-ink-2">
        <b className="mr-1 font-extrabold text-ink">{caption}</b>
        {detail}
      </figcaption>
      {children}
    </figure>
  );
}

export default function SpecimenStatesPage() {
  const issue = issueMeta(news, []);
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-page px-edge py-8">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">
        상태 화면 견본
      </h1>
      <section
        aria-labelledby="spec-states-h"
        className="mt-8 border-t-3 border-ink pt-2.5"
      >
        <h2
          id="spec-states-h"
          className="text-[22px] font-extrabold tracking-[-0.03em]"
        >
          상태 화면 4종
        </h2>
        <p className="mt-1 mb-4 max-w-[72ch] text-[13.5px] text-ink-2">
          글자와 도형만 쓴다(일러스트는 D3). 스켈레톤은 실제 카드와 같은 높이로
          두고 움직이지 않는다. 빈 상태 2(경기 없는 날)는 기초 컴포넌트 견본의
          5줄 S4.
        </p>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
          <Frame
            caption="로딩"
            detail="스켈레톤 · 5줄 블록 + 카드 3장"
            slot="state-loading"
          >
            <LoadingSkeleton headClassName="mr-3.5" />
          </Frame>
          <div className="grid content-start gap-4">
            <Frame
              caption="빈 상태 1"
              detail="필터 0건 · 대회 리그 1 + 분류 UCL (fixture 카드 0장) — 피드 머리는 대회 색 면"
              slot="state-empty-filter"
            >
              {/* 혼합안처럼 색 면 머리는 틀 오른쪽 끝까지, 부제·빈 상태는 오른쪽 14px */}
              <SectionHead
                heading="주요 뉴스"
                headingAs="h3"
                runningHead="SQUAD"
                filter={{
                  comp: "LIGUE1",
                  short: "리그1",
                  clear: <FilterClearButton />,
                }}
              />
              <div className="mr-3.5">
                <p className="mt-0.75 text-[13px] text-ink-2">
                  <span className="tabular-nums">0</span>건 · 리그 1 · UCL
                </p>
                <FilterEmptyState visible />
              </div>
            </Frame>
            {OFF_SEASON.map(([phase, detail, date]) => (
              <Frame
                key={phase}
                caption="빈 상태 3"
                detail={`비시즌 · ${detail} · 날짜는 configs/competitions.json 실값`}
                slot={`state-off-season-${phase}`}
              >
                <div className="mr-3.5">
                  <TodayBrief
                    brief={{ ...emptyBrief, date }}
                    headingAs="h3"
                    headingId={`specimen-off-${phase}-h`}
                  />
                </div>
              </Frame>
            ))}
          </div>
          <Frame
            caption="오류"
            detail="발행 지연 안내 + 마지막 정상 지면(D49 — 전날 사이트 유지) · 2026-10-11 호로 시연"
            slot="state-error"
          >
            <div className="mr-3.5">
              <IssueLateNotice
                issue={issue}
                windows={issueLateWindows(issue.date)}
                visible
              />
              <TodayBrief
                brief={sameDayBrief()}
                headingAs="h3"
                headingId="specimen-stale-h"
              />
            </div>
          </Frame>
          <div className="grid content-start gap-4">
            <Frame
              caption="오프라인"
              detail="연결 끊김 · 지금 열린 지면 유지(서비스 워커 없음 — M4-D)"
              slot="state-offline"
            >
              <div className="mr-3.5">
                <OfflineBand visible />
              </div>
              <div className="mt-1.5">
                <NewsFeed
                  news={offlineNews}
                  lead={false}
                  id="specimen-offline-feed"
                />
              </div>
            </Frame>
            <Frame
              caption="오류 2"
              detail="5줄 자리 — 브리핑 파일 없음 + 그날 게시 실행 기록(원인은 쓰지 않음)"
              slot="state-brief-missing"
            >
              <div className="mr-3.5">
                <BriefMissing headingAs="h3" headingId="specimen-missing-h" />
              </div>
            </Frame>
          </div>
        </div>
      </section>
    </main>
  );
}
