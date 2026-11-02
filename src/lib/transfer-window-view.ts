/**
 * 이적 창 머리 줄 · 홈 배치 화면 모델 (PRD FR-105, §15 D68 ①②, DESIGN §9.3 D2 "이적 창 머리 줄", plan M4-04) — I/O 없는 순수 함수.
 * 입력은 `transferWindowState`(src/lib/transfer-window.ts — 수집 선별 가중과 같은 판정)의 결과다. 기준 시각은 빌드 시각(매일 아침 발행
 * 빌드가 다시 굳힌다 — 홈 A매치 섹션과 같은 원칙).
 *
 * - **열림**(`open` — 어느 리그든 창이 열려 있다): 모드가 끝나는 마감(열린 창 중 가장 늦은 마감)과 KST 날짜 기준 D-n, 열린 리그.
 * - **마감 직후**(`grace` — 마지막 마감 뒤 24시간 유예): 방금 끝난 마감 시각과 그때 닫힌 리그. 홈 이적 섹션은 아직 위에 있다.
 * - **닫힘**(`closed`): 다음 창 — 가장 먼저 열리는 창과 같은 시즌 · 같은 종류(여름/겨울) 창들을 묶어 가장 이른 개장 ~ 가장 늦은 마감, 리그.
 *   다음 창이 설정에 없으면 null(날짜를 지어내지 않는다).
 */
import type { CompId } from "@/lib/schema/common";
import type { TransferWindowState } from "@/lib/transfer-window";

export type WindowKind = "summer" | "winter";

export interface NextWindowView {
  kind: WindowKind;
  opensAt: string;
  closesAt: string;
  comps: CompId[];
}

export type TransferWindowLineView =
  | { mode: "open"; closesAt: string; daysLeft: number; comps: CompId[] }
  | { mode: "grace"; closedAt: string; comps: CompId[] }
  | { mode: "closed"; next: NextWindowView | null };

const LEAGUE_ORDER: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
];
const ordered = (comps: Iterable<CompId>): CompId[] => {
  const set = new Set(comps);
  return LEAGUE_ORDER.filter((c) => set.has(c));
};

export const WINDOW_KIND_LABEL: Readonly<Record<WindowKind, string>> = {
  summer: "여름",
  winter: "겨울",
};

/** 판정 결과 → 머리 줄 */
export function transferWindowLine(
  state: TransferWindowState,
): TransferWindowLineView {
  if (state.grace && state.closedAt) {
    return {
      mode: "grace",
      closedAt: state.closedAt,
      comps: ordered(state.closedComps),
    };
  }
  if (state.active && state.closesAt && state.daysLeft !== null) {
    return {
      mode: "open",
      closesAt: state.closesAt,
      daysLeft: state.daysLeft,
      comps: ordered(state.open.map((w) => w.comp)),
    };
  }
  const first = state.upcoming[0];
  if (!first) return { mode: "closed", next: null };
  const group = state.upcoming.filter(
    (w) => w.season === first.season && w.kind === first.kind,
  );
  const opensAt = group.reduce(
    (min, w) => (w.opensAt < min ? w.opensAt : min),
    first.opensAt,
  );
  const closesAt = group.reduce(
    (max, w) => (w.closesAt > max ? w.closesAt : max),
    first.closesAt,
  );
  return {
    mode: "closed",
    next: {
      kind: first.kind,
      opensAt,
      closesAt,
      comps: ordered(group.map((w) => w.comp)),
    },
  };
}
