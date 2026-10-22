import type { Metadata } from "next";

import { TodayBrief } from "@/components/brief/today-brief";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { AppShell } from "@/components/shell/app-shell";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import { issueMeta } from "@/lib/issue";
import { BriefFileSchema } from "@/lib/schema/brief";
import { NewsFileSchema } from "@/lib/schema/news";

import briefSampleJson from "../../../../fixtures/brief-sample.json";
import newsSampleJson from "../../../../fixtures/news-sample.json";

/**
 * 홈 견본(M1-33) — `SPECIMEN=1` 빌드 전용(`/specimen/home/`, 공개 빌드에 없음). 실제 홈과 같은 조립(앱 셸 + 목차 + 오늘의 5줄 + 필터가
 * 걸리는 피드)을 혼합안 홈과 같은 fixtures(2026-10-11 호 23장 · 같은 날 브리핑)로 싣는다 — 혼합안 `?stage=m1`과 같은 데이터로 목차 건수·
 * 필터 결과·색 면·0건 상태를 결정적으로 비교·검사한다(tests/e2e-specimen/news-filter.spec.ts). 실제 호는 날마다 바뀐다.
 */

export const metadata: Metadata = {
  title: "홈 견본",
  robots: { index: false, follow: false },
};

const news = NewsFileSchema.parse(newsSampleJson);

function sameDayBrief() {
  const day = BriefFileSchema.array()
    .parse(briefSampleJson.days)
    .find((d) => d.date === news.date);
  if (!day) throw new Error(`fixtures/brief-sample.json에 ${news.date} 없음`);
  return day;
}
const brief = sameDayBrief();

export default function SpecimenHomePage() {
  const filter = loadNewsFilterView(news);
  return (
    <AppShell
      current="home"
      issue={issueMeta(news, [])}
      contents={filter ? <NewsFilterContents view={filter} /> : undefined}
    >
      <TodayBrief brief={brief} />
      <NewsSection
        id="news"
        news={news}
        filter={filter}
        heading="주요 뉴스"
        headingAs="h2"
        headingId="news-h"
        titleAs="h3"
        className="mt-9 scroll-mt-4 lg:mt-11"
      />
    </AppShell>
  );
}
