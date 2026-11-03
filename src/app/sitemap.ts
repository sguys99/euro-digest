import type { MetadataRoute } from "next";

import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { issuePageLastModified, listIssueDates } from "@/lib/data/issue";
import { loadKoreanPlayersData } from "@/lib/data/korean-players";
import { listKoreanPlayerSlugs } from "@/lib/data/player-page";
import { loadTransfersFile } from "@/lib/data/transfers";
import { listTeamSlugs, loadTeam } from "@/lib/data/teams";
import { listWeeklyWeeks, loadWeeklyReport } from "@/lib/data/weekly-report";
import { sitemapEntries } from "@/lib/seo";

/*
 * `/sitemap.xml` (PRD FR-124, plan M1-38) — 빌드 때 out/sitemap.xml 한 파일로 굳힌다(정적 export는 라우트 핸들러를 `force-static`으로만
 * 받는다 — 서버 런타임 없음, CLAUDE §1-10). 항목 규칙(홈 · `/about/` · `/privacy/`(M5-05) · 대회 페이지(M2-10) · 팀 페이지(M2-13) · 한국 선수 목록(M3-09)·상세(M3-10) · 주간 리포트 색인·발행된 주(M3-12) · 대표팀(M3-13) · 이적(M4-04) · 발행된 날짜 페이지 전부, `/news/` 별칭 제외)은 src/lib/seo.ts
 * `sitemapEntries`. 날짜 페이지 lastmod = 그 호 지면 수정 시각(뉴스 파일 generatedAt · 그 호 카드에 걸린 삭제 요청 반영 시각 · 브리핑
 * 파일 generatedAt 가운데 늦은 것 — `issuePageLastModified`, M5-03).
 *
 * robots.txt는 만들지 않는다(확정 — PRD §15 D59 · D74) — 프로젝트 사이트(basePath 아래)의 robots.txt는 크롤러가 읽지 않는다(호스트
 * 루트 robots.txt만 유효, 호스트 루트 저장소는 건드리지 않는다). sitemap은 Search Console URL 접두어 속성(사이트 주소 + basePath)에
 * 직접 제출한다(사용자 작업).
 */

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // 날짜 페이지 lastmod = 지면 수정 시각(뉴스 파일 generatedAt · 그 호 카드에 걸린 삭제 요청 반영 시각 · 브리핑 파일 generatedAt 가운데
  // 늦은 것 — M5-03, src/lib/data/issue.ts `issuePageLastModified`): 삭제 요청으로 카드가 빠진 날 · 브리핑만 다시 쓴 날도 재크롤 신호가 나간다
  const issues = listIssueDates().flatMap((date) => {
    const lastModified = issuePageLastModified(date);
    return lastModified ? [{ date, generatedAt: lastModified }] : [];
  });
  // 대회 페이지(M2-10) — 데이터 파일이 있는 대회만(없으면 페이지가 빈 상태라 색인하지 않는다)
  const competitions = loadAllCompetitionData().map((c) => ({
    comp: c.comp,
    updatedAt: c.updatedAt,
  }));
  // 팀 페이지(M2-13) — 팀 파일이 있는 팀 전부, lastModified = 대표 대회 데이터 updatedAt
  const updatedByComp = new Map(competitions.map((c) => [c.comp, c.updatedAt]));
  const teams = listTeamSlugs().map((slug) => {
    const team = loadTeam(slug);
    return {
      slug,
      updatedAt: team ? (updatedByComp.get(team.comp) ?? null) : null,
    };
  });
  // 한국 선수 목록(M3-09) · 상세(M3-10 — 설정의 선수 전원) — 명단 설정만으로 늘 생기는 페이지, lastModified = 현황 파일 generatedAt
  const korean = {
    updatedAt: loadKoreanPlayersData()?.generatedAt ?? null,
    players: listKoreanPlayerSlugs(),
    // 주간 리포트(M3-12) — 색인은 늘 생기고(빈 상태 포함), 주 페이지는 발행된 주만
    weekly: listWeeklyWeeks().flatMap((week) => {
      const report = loadWeeklyReport(week);
      return report ? [{ week, generatedAt: report.generatedAt }] : [];
    }),
  };
  // 대표팀(M3-13) — `/national-team/`은 설정 유무와 관계없이 늘 생긴다(소식 구역)
  // 이적(M4-04) — `/transfers/`도 늘 생긴다(빈 상태 포함), lastModified = 레코드 중 가장 늦은 갱신
  const transferUpdated =
    (loadTransfersFile() ?? [])
      .map((t) => t.updated)
      .sort()
      .at(-1) ?? null;
  return sitemapEntries(issues, competitions, teams, korean, true, {
    updatedAt: transferUpdated,
  });
}
