import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import {
  TransferFilterBar,
  TransferFilterContents,
} from "@/components/transfers/filter";
import { TransferFilterIsland } from "@/components/transfers/filter-island";
import {
  LedgerFilterEmpty,
  LedgerHead,
  LedgerRows,
} from "@/components/transfers/ledger";
import { TransferWindowLine } from "@/components/transfers/window-line";
import { RunningHead } from "@/components/ui/section-head";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadTransferWindowState } from "@/lib/data/transfer-windows";
import { loadTransfersView } from "@/lib/data/transfers";
import type { CompLabel } from "@/lib/home-widgets";
import { routes } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import { pageMetadata, TRANSFERS_DESCRIPTION } from "@/lib/seo";
import { TRANSFER_BOOT_SCRIPT } from "@/lib/transfer-filter-dom";
import { transferWindowLine } from "@/lib/transfer-window-view";

/*
 * `/transfers/` 이적 (PRD FR-101 · FR-104 · FR-105 · FR-106, DESIGN §9.3 D2 "이적 원장 행" · "이적 필터" · "이적 타임라인" · "이적 창 머리 줄",
 * DECISIONS D2 §4 A · C · §5 #3 · #7, PRD §15 D64 ②⑤ · D67 ①⑤⑥ · D68 ①, plan M4-04). 확정 시안 `docs/design/d2/concept-mix.html` 화면 3 순서 그대로:
 * 쪽 머리(키커 · TRANSFER LEDGER · h1) → 이적 창 머리 줄 → 필터(1023 이하 칩 · 1024 이상 왼쪽 목차 열 체크 목록) → 원장 행(잠잠은 아래) → 펼침 타임라인.
 * - 읽는 것: `data/transfers.json`(M4-01 집계 — 파일 순서 그대로) · 보존된 뉴스 카드(근거 · 보조 노드, 삭제 요청 제외) · `configs/korean-players.json`
 *   (소속 칸) · 표기 사전 · 팀 배지 · `configs/transfer-windows.json`(창 상태 — 빌드 시각 기준).
 * - 필터는 정적 페이지에서 클라이언트가 주소 쿼리로(`?league=epl&status=rumor&kr=1` — 축 안 OR · 축 사이 AND), 첫 페인트 전 부트 스크립트가 같은
 *   결과를 그린다. 홈 핫 리스트 → `#xt-{카드 ID}` 도착은 접힌 타임라인을 펼친다(src/lib/transfer-filter-dom.ts).
 * - 상태 4종(M1-37 관례): 로딩 — 정적이라 없음 · 빈 상태 — 트래커 파일이 없거나 0건이면 문장(필터 숨김), 필터 0건이면 윤곽 '0' + 필터 해제 · 오류 —
 *   깨진 파일은 빌드 실패(로더가 던진다) · 오프라인 — 앱 셸 띠.
 * - 내비: 하단 탭에는 없다(PRD §4.1 — 하단 탭 5개 고정, 이적은 홈 섹션과 상단 메뉴에서 진입) — 1024 이상 상단 내비 '이적'(DECISIONS D2 §9).
 */

export const metadata: Metadata = pageMetadata({
  title: "이적",
  description: TRANSFERS_DESCRIPTION,
  canonical: routes.transfers(),
});

const HEADING_ID = "tr-h";

/** 대회 ID → 약칭 · 정식 이름(설정 순서) */
function compLabels(): Map<CompId, CompLabel> {
  return new Map(
    loadCompetitionsConfig().map((c) => [
      c.id,
      { short: c.shortKo, name: c.nameKo },
    ]),
  );
}

export default function TransfersPage() {
  const { issue } = loadLatestIssue();
  const view = loadTransfersView();
  const windowState = loadTransferWindowState(new Date());
  const line = windowState ? transferWindowLine(windowState) : null;
  const comps = compLabels();
  const hasRows = view !== null && view.rows.length > 0;

  return (
    <AppShell
      current="transfers"
      issue={issue}
      contents={
        hasRows ? (
          <TransferFilterContents view={view} comps={comps} />
        ) : undefined
      }
      contentsLabel="이적 필터"
    >
      <section aria-labelledby={HEADING_ID} data-slot="transfers-page">
        <header className="grid gap-1.5 pt-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span>단계 = 펀치 구멍 · 출처 Tier = 카드 최고 출처</span>
            <RunningHead className="ml-auto">TRANSFER LEDGER</RunningHead>
          </p>
          <h1
            id={HEADING_ID}
            className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
          >
            이적
          </h1>
        </header>
        {line ? (
          <TransferWindowLine line={line} labels={comps} className="mt-3.5" />
        ) : null}
        {hasRows ? (
          <>
            <TransferFilterBar view={view} comps={comps} />
            <div className="mt-4 lg:mt-6">
              <LedgerHead />
              <LedgerRows rows={view.rows} />
              <LedgerFilterEmpty />
            </div>
            {/* 첫 페인트 전 — 주소 쿼리 필터 · 해시 도착(목록 · 빈 상태 · 결과 수 뒤) */}
            <script
              dangerouslySetInnerHTML={{ __html: TRANSFER_BOOT_SCRIPT }}
            />
            <TransferFilterIsland />
          </>
        ) : (
          <div
            data-slot="transfers-empty"
            className="mt-6 border-t border-ink pt-4 pb-2"
          >
            <p className="text-[15px] font-extrabold">
              아직 집계된 이적이 없어요.
            </p>
            <p className="mt-2 text-[13.5px] leading-normal text-ink-2">
              이적 분류 기사에서 선수와 단계가 확인되면 선수 · 행선지별로 이곳에
              쌓여요.
            </p>
          </div>
        )}
        <p className="mt-3.5 text-[12.5px] leading-normal text-ink-2">
          단계는 기사 제목의 표현으로 분류하고, 루머는 보도 형식 그대로 실어요.
          출발 팀은 기사에 있을 때만 쓰고, 한국 선수의 소속 팀은 ‘소속’ 칸에
          따로 적어요. 기사 제목은 원문 그대로예요.
        </p>
      </section>
    </AppShell>
  );
}
