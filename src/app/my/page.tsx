import type { Metadata } from "next";

import { MyBoard } from "@/components/my/my-board";
import { MyHead } from "@/components/my/my-head";
import { MyImport } from "@/components/my/my-import";
import { MyManage } from "@/components/my/my-manage";
import { MyNews } from "@/components/my/my-news";
import { AppShell } from "@/components/shell/app-shell";
import { RunningHead, SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadMyDirectory, loadMyNewsCandidates } from "@/lib/data/my-page";
import { issueNumber } from "@/lib/issue";
import { MY_EMPTY_BOOT_SCRIPT } from "@/lib/my-empty-boot";
import { MY_IMPORT_BOOT_SCRIPT } from "@/lib/my-import-boot";
import { MY_DIRECTORY_ID, MY_NEWS_PAGE } from "@/lib/my-view";
import { MY_DESCRIPTION, pageMetadata } from "@/lib/seo";
import { OG_PAGES, pageOgCard } from "@/lib/og";

/*
 * `/my/` 마이 (PRD FR-110~112 · §4.1 하단 탭 '마이', DESIGN §9.3 D2 "`/my` 틀", DECISIONS D2 §4 A · §6 #9 · §9, PRD §15 D64 ③ · D67 ②, plan M4-08).
 * 확정 시안 `docs/design/d2/concept-mix.html` 화면 4: 쪽 머리(키커 · MY REGISTER · h1 · 팔로우 이름) → 다음 경기(입장권 + 일정 행) · 최근 결과
 * (1280 이상 2단) → 내 팀 소식 + 관리 열(1024 이상 왼쪽 목차 열 · 1023 이하 지면 끝).
 *
 * **정적 셸 + 클라이언트**(CLAUDE §7.1 — 팔로우는 브라우저 저장소에만 있다, DECISIONS D2 §9):
 * - 디렉터리(팔로우할 수 있는 팀 · 선수의 이름 · 배지 · 부제 — 약 9KB)는 이 HTML에 JSON으로 싣는다 → 머리 · 관리 열이 하이드레이션 즉시 그려진다.
 * - 다음 경기 · 최근 결과는 팀 · 선수마다 정적 JSON(`/my/data/{teams|players}/{slug}.json` — build-feeds)을 팔로우한 것만 지연 fetch(섬 `MyBoard`).
 *   팀 111 · 선수 11개 전부를 페이지에 직렬화하면 약 0.5MB(HTML + RSC 두 번)라 고르지 않았다.
 * - 내 팀 소식은 최신 호 후보 뉴스 행을 서버가 숨긴 채 싣고 첫 페인트 전 스크립트가 고른다(홈과 같은 조각 — src/components/my/my-news.tsx).
 * - 상태 4종: 로딩(하이드레이션 · 받는 중 — 교정쇄) · 빈 상태(팔로우 0 — 윤곽 '0' + 고르는 곳) · 오류(받기 실패 — 다시 시도) · 오프라인(셸 띠 + 같은 줄).
 * 색인 대상이 아니다(사람마다 다른 화면 — noindex, sitemap에 넣지 않는다).
 */

// 색인 대상이 아니다(팔로우는 브라우저에만 — 크롤러에게는 빈 상태): noindex · canonical 없음 · sitemap 밖(404와 같은 규칙 — tests/e2e/seo.spec.ts)
export const metadata: Metadata = {
  ...pageMetadata({
    // 쪽 제목 "마이 팀"(OG 쪽 이름형 글자 · h1과 같은 값 — 2026-11-03 사용자 결정). 내비 라벨(하단 탭 · 상단 내비)만 "마이"
    title: OG_PAGES.my,
    description: MY_DESCRIPTION,
    canonical: null,
    og: pageOgCard("my"),
  }),
  robots: { index: false },
};

const HEADING_ID = "my-h";

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function ManageHead({ where }: { where: "contents" | "flow" }) {
  return (
    <SectionHead
      heading="내 명단"
      // 1024 이상 목차 열은 DOM에서 h1보다 앞이라 제목 단계를 만들지 않는다(뉴스 목차 "목차"와 같은 규칙)
      headingAs={where === "contents" ? "p" : "h2"}
      headingId={`my-manage-${where}-h`}
      runningHead="MY REGISTER"
    />
  );
}

export default function MyPage() {
  const { news, issue } = loadLatestIssue();
  const dir = loadMyDirectory();
  const candidates = loadMyNewsCandidates(news, dir);

  return (
    <AppShell
      current="my"
      issue={issue}
      contents={
        <MyManage where="contents" head={<ManageHead where="contents" />} />
      }
      contentsLabel="팔로우 관리"
    >
      <script
        id={MY_DIRECTORY_ID}
        type="application/json"
        dangerouslySetInnerHTML={{ __html: scriptJson(dir) }}
      />
      <section aria-labelledby={HEADING_ID} data-slot="my-page">
        <MyHead
          runningHead={
            <RunningHead className="ml-auto">MY REGISTER</RunningHead>
          }
          heading={
            <h1
              id={HEADING_ID}
              className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
            >
              {OG_PAGES.my}
            </h1>
          }
        />
        {/* 공유 링크(`?t=…&p=…`)로 열었을 때만 — 가져오기 확인 띠(FR-114, M4-10). 부트가 첫 페인트 전에 자리를 연다(CLS) */}
        <script dangerouslySetInnerHTML={{ __html: MY_IMPORT_BOOT_SCRIPT }} />
        <MyImport />
        {/* 팔로우 0이면 첫 페인트 전에 빈 상태로(교정쇄 → 빈 상태 이동 없음 — M4-16) */}
        <script dangerouslySetInnerHTML={{ __html: MY_EMPTY_BOOT_SCRIPT }} />
        <MyBoard
          fixturesHeadingId="my-fx-h"
          resultsHeadingId="my-rs-h"
          fixturesHead={
            <SectionHead
              heading="다음 경기"
              headingId="my-fx-h"
              runningHead="FIXTURES"
            />
          }
          resultsHead={
            <SectionHead
              heading="최근 결과"
              headingId="my-rs-h"
              runningHead="RESULTS"
            />
          }
        />
        <MyNews
          candidates={candidates}
          issueNo={issue ? issueNumber(issue.date) : null}
          limit={MY_NEWS_PAGE}
          variant="page"
          headingId="my-news-h"
          className="mt-9 lg:mt-11"
        />
      </section>
      {/* 1023 이하 — 관리 열을 지면 끝에(1024 이상은 왼쪽 목차 열) */}
      <div data-slot="my-manage-flow" className="mt-10 lg:hidden">
        <MyManage where="flow" head={<ManageHead where="flow" />} />
      </div>
    </AppShell>
  );
}
