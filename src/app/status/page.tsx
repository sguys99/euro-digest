import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { StatusBody, StatusToc } from "@/components/status/status-body";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadStatusView } from "@/lib/data/status";
import { OG_PAGES, pageOgCard } from "@/lib/og";
import { pageMetadata } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

/*
 * `/status/` 공개 상태 페이지 (PRD P-1 · §4 IA · §15 D12 · D71 ③, DESIGN §9.3 D3 `/status`, DECISIONS D3 #10 · §8 #2, plan M5-15).
 * 빌드 때 `data/runs.json` · `data/runs-dev.json` · `configs/sources.json`에서 계산한다(src/lib/data/status.ts → src/lib/status-view.ts) —
 * "이 쪽 기준" = 빌드 시각. 발행(collect · weekly)과 사람 커밋마다 배포 빌드가 다시 만든다.
 *
 * **색인 제외 · sitemap 제외**(2026-11-03 사용자 결정 — DECISIONS D3 §8 #2, PRD §15 D71): 뒤표지 '발행 상태 {n}%' 링크로만 들어온다.
 * noindex · canonical 없음(`/my` · `/offline/`과 같은 규칙), src/lib/seo.ts `sitemapEntries`에 넣지 않는다(tests/e2e/seo.spec.ts).
 * 공유 미리보기는 쪽 이름형 OG(`/og/pages/status.png`).
 */

export const metadata: Metadata = {
  ...pageMetadata({
    title: OG_PAGES.status,
    description: `${SITE_NAME}의 최근 30일 발행 기록 — 마지막 발행 시각, 실행 성공률, 이번 달 비용 사용률(월 예산 대비 %), 소스 건강도.`,
    canonical: null,
    og: pageOgCard("status"),
  }),
  robots: { index: false },
};

export default function StatusPage() {
  const { issue } = loadLatestIssue();
  const view = loadStatusView();
  return (
    <AppShell issue={issue} contents={<StatusToc />} contentsLabel="이 쪽 차례">
      <StatusBody view={view} />
    </AppShell>
  );
}
