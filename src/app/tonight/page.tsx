import type { Metadata } from "next";

import {
  TonightCriteriaSection,
  TonightEmpty,
  TonightList,
} from "@/components/home/tonight";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadTonightRules, loadTonightWidget } from "@/lib/data/home-widgets";
import { tonightCriteria, tonightWindowLongText } from "@/lib/home-widgets";
import { routes } from "@/lib/paths";
import { pageMetadata, TONIGHT_DESCRIPTION } from "@/lib/seo";

/*
 * `/tonight/` 오늘 밤 볼 경기 (PRD F8 FR-80~82 · §4 IA "홈 섹션의 전체 보기", plan M2-14)
 *
 * PRD §15 D63 ④ — 시안 없는 화면이라 D1 확정 컴포넌트(오늘 밤 카드 — src/components/home/tonight.tsx)로 조립하고 새 시각 모티프를 만들지
 * 않는다. 머리(굵은 섹션 머리 h1 "오늘 밤 볼 경기" + TONIGHT · 창 긴 날짜 · n경기) → 카드 목록(홈 위젯과 같은 경기·순서) 또는 빈 상태 →
 * 선정 기준(`configs/bigmatch-rules.json` 값 그대로 — 사실만). 1280 이상은 선정 기준을 마주 보는 면에, 1279 이하는 목록 아래 지면 안에 둔다
 * (홈 위젯 두 자리와 같은 방식 — DESIGN §11.4).
 * - 기준 시각 = 빌드 시각(정적 — 하루 1회 발행 빌드가 다시 굳힌다). 내비 항목은 없다(PRD §4.1 — 홈 섹션에서 진입, 하단 탭 5개에 없음).
 * - 메타 설명에 시각("18:00")을 넣지 않는다(결과 노출 검사 `SCORE_LIKE_RE`가 시각을 스코어 모양으로 본다 — src/lib/seo.ts).
 */

export const metadata: Metadata = pageMetadata({
  title: "오늘 밤 볼 경기",
  description: TONIGHT_DESCRIPTION,
  canonical: routes.tonight(),
});

const HEADING_ID = "tonight-page-h";

export default function TonightPage() {
  const { issue } = loadLatestIssue();
  const widget = loadTonightWidget();
  const rules = loadTonightRules();
  const count = widget.cards.length;

  const criteria = (where: "flow" | "facing") =>
    rules ? (
      <TonightCriteriaSection
        criteria={tonightCriteria(rules)}
        windowText={`${rules.window.fromKst} ~ 다음 날 ${rules.window.toKst} KST`}
        maxMatches={rules.maxMatches}
        headingId={`tonight-criteria-${where}-h`}
        className={where === "flow" ? "mt-11" : undefined}
      />
    ) : null;

  return (
    <AppShell
      issue={issue}
      facing={rules ? criteria("facing") : undefined}
      facingLabel="선정 기준"
    >
      <section aria-labelledby={HEADING_ID} data-slot="tonight-page">
        <SectionHead
          heading="오늘 밤 볼 경기"
          headingAs="h1"
          headingId={HEADING_ID}
          runningHead="TONIGHT"
        />
        {widget.window ? (
          <p className="mt-0.75 text-[13px] text-ink-2 tabular-nums">
            {tonightWindowLongText(widget.window)}
            {count > 0 ? ` · ${count}경기` : null}
          </p>
        ) : null}
        {count > 0 ? (
          <TonightList cards={widget.cards} className="mt-4" />
        ) : (
          <TonightEmpty className="mt-4" />
        )}
      </section>
      <div className="xl:hidden">{criteria("flow")}</div>
    </AppShell>
  );
}
