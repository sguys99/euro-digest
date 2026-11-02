import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { z } from "zod";

import { AppShell } from "@/components/shell/app-shell";
import {
  TransferFilterBar,
  TransferFilterContents,
} from "@/components/transfers/filter";
import { TransferFilterIsland } from "@/components/transfers/filter-island";
import { TransferHotList } from "@/components/transfers/hot-list";
import {
  LedgerFilterEmpty,
  LedgerHead,
  LedgerRows,
} from "@/components/transfers/ledger";
import { TransferWindowLine } from "@/components/transfers/window-line";
import { RunningHead, SectionHead } from "@/components/ui/section-head";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadTransferWindowState } from "@/lib/data/transfer-windows";
import { buildTransfersView } from "@/lib/data/transfers";
import type { CompLabel } from "@/lib/home-widgets";
import { PlayerCompSchema } from "@/lib/schema/player";
import type { CompId } from "@/lib/schema/common";
import { NewsCardSchema } from "@/lib/schema/news";
import { TransfersFileSchema } from "@/lib/schema/transfer";
import { TRANSFER_BOOT_SCRIPT } from "@/lib/transfer-filter-dom";
import { transferWindowLine } from "@/lib/transfer-window-view";
import { hotTransfers } from "@/lib/transfers-view";

/**
 * 이적 화면 견본(M4-04 — PRD FR-101 · FR-104 · FR-105 · FR-106) — `SPECIMEN=1` 빌드 전용(`/specimen/transfers/`, 공개 빌드에 없음).
 * 실데이터(`data/transfers.json`)는 루머 1건뿐이라 여러 상태를 볼 수 없다 — 합성 fixtures(`fixtures/transfers/specimen.json`: 김민재 실카드 +
 * 가명 선수 견본 카드, records = 집계 함수 결과)를 실제 화면과 같은 컴포넌트에 싣는다(tests/e2e-specimen/transfers.spec.ts · 스크린샷 비교).
 *  - 위: `/transfers/` 그대로(필터 · 원장 · 타임라인 — 단계별 · 결렬 · 공식 뒤 결렬 미반영 · 같은 단계 재보도 · 잠잠 · 행선지 미정 · 사전 미등록 이름 ·
 *    Tier 1~3 · 한국 선수 소속 칸). 머리 줄은 이적 창 열림(시각 주입 2027-01-15).
 *  - 아래: 이적 창 머리 줄 3상태(닫힘 = 빌드 시각 · 열림 · 마감 직후 — 시각 주입) · 홈 핫 리스트 평소 / 이적 창 모드 부제.
 */

export const metadata: Metadata = {
  title: "이적 견본",
  robots: { index: false, follow: false },
};

const FixtureSchema = z.object({
  now: z.string(),
  korean: z.array(
    z.object({
      slug: z.string(),
      nameKo: z.string(),
      team: z.string(),
      comp: PlayerCompSchema,
    }),
  ),
  names: z.record(z.string(), z.string()),
  records: TransfersFileSchema,
  cards: z.array(NewsCardSchema),
});

const WINDOWS = [
  ["open", "2027-01-15T00:00:00Z", "이적 창 열림 — 1월 15일"],
  ["grace", "2027-02-02T06:00:00Z", "마감 직후 — 2월 2일 아침(마감 뒤 24시간)"],
  ["closed", "2026-11-02T00:00:00Z", "닫힘 — 11월 2일(다음 겨울 창)"],
] as const;

function compLabels(): Map<CompId, CompLabel> {
  return new Map(
    loadCompetitionsConfig().map((c) => [
      c.id,
      { short: c.shortKo, name: c.nameKo },
    ]),
  );
}

function lineAt(iso: string) {
  const state = loadTransferWindowState(new Date(iso));
  if (!state) throw new Error("configs/transfer-windows.json 없음");
  return transferWindowLine(state);
}

export default function SpecimenTransfersPage() {
  const fixture = FixtureSchema.parse(
    JSON.parse(
      readFileSync(path.resolve("fixtures/transfers/specimen.json"), "utf8"),
    ),
  );
  const view = buildTransfersView(fixture.records, fixture.cards, {
    korean: fixture.korean.map((p) => ({ ...p, page: false })),
    names: fixture.names,
  });
  const comps = compLabels();
  const { issue } = loadLatestIssue();
  const hot = hotTransfers(view.rows);
  const open = lineAt(WINDOWS[0][1]);
  const target = "/specimen/transfers/";
  return (
    <AppShell
      current="transfers"
      issue={issue}
      contents={<TransferFilterContents view={view} comps={comps} />}
      contentsLabel="이적 필터"
    >
      <section aria-labelledby="tr-h" data-specimen="transfers-page">
        <header className="grid gap-1.5 pt-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span>단계 = 펀치 구멍 · 출처 Tier = 카드 최고 출처</span>
            <RunningHead className="ml-auto">TRANSFER LEDGER</RunningHead>
          </p>
          <h1
            id="tr-h"
            className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
          >
            이적
          </h1>
        </header>
        <TransferWindowLine line={open} labels={comps} className="mt-3.5" />
        <TransferFilterBar view={view} comps={comps} />
        <div className="mt-4 lg:mt-6">
          <LedgerHead />
          <LedgerRows rows={view.rows} />
          <LedgerFilterEmpty />
        </div>
        <script dangerouslySetInnerHTML={{ __html: TRANSFER_BOOT_SCRIPT }} />
        <TransferFilterIsland />
      </section>

      <section aria-labelledby="spec-window-h" className="mt-14">
        <SectionHead
          heading="견본 — 이적 창 머리 줄 3상태"
          headingId="spec-window-h"
          runningHead="SPECIMEN"
        />
        {WINDOWS.map(([id, iso, label]) => (
          <div key={id} data-specimen={`window-${id}`} className="mt-5">
            <p className="mb-1.5 text-xs font-extrabold text-ink-2">{label}</p>
            <TransferWindowLine line={lineAt(iso)} labels={comps} />
          </div>
        ))}
      </section>

      <section aria-labelledby="spec-hot-h" className="mt-14">
        <SectionHead
          heading="견본 — 홈 이적 핫 리스트"
          headingId="spec-hot-h"
          runningHead="SPECIMEN"
        />
        <div className="mt-6 grid gap-9 xl:grid-cols-2 xl:gap-8">
          <div data-specimen="hot-normal" className="min-w-0">
            <TransferHotList
              items={hot}
              total={view.rows.length}
              target={target}
              headingId="spec-hot-normal-h"
            />
          </div>
          <div data-specimen="hot-window" className="min-w-0">
            <TransferHotList
              items={hot}
              total={view.rows.length}
              windowLine={open}
              target={target}
              headingId="spec-hot-window-h"
            />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
