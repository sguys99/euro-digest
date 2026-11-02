/**
 * 이적 단계 상태 머신 (PRD FR-102, §15 D67 ⑤) — I/O 없는 순수 함수. 수집 파이프라인의 이적 트래커 집계(scripts/lib/transfers.ts — M4-01)와
 * 화면의 타임라인(src/lib/transfers-view.ts — M4-04, 어느 근거 카드가 상태를 바꿨는지 다시 계산)이 같은 규칙을 쓴다. 규칙은 M4-01에서
 * scripts/lib/transfers.ts에 있던 것을 그대로 옮겼다(동작 불변 — tests/transfers.test.ts가 그대로 돈다).
 *
 * - 진행 단계 rumor < negotiating < agreed < official — 더 높은 단계만 올린다(역행 금지). 같거나 낮은 단계 카드는 상태를 바꾸지 않는다.
 * - collapsed(결렬)는 예외 — 진행 중인 이적(rumor·negotiating·agreed)을 닫는다. official 뒤의 결렬은 적용하지 않는다(F10 D52 ②).
 * - 결렬 뒤에는 결렬 전 최고 단계(`peak`)보다 **높은** 진행 단계 카드만 다시 연다(D67 ⑤).
 */
import type { TransferStatus } from "@/lib/schema/common";

type ProgressStatus = Exclude<TransferStatus, "collapsed">;

/** 진행 단계 순서(FR-102) */
export const PROGRESS_RANK: Readonly<Record<ProgressStatus, number>> = {
  rumor: 0,
  negotiating: 1,
  agreed: 2,
  official: 3,
};

/** 상태 머신의 현재 값 — peak = 지금까지 도달한 최고 진행 단계 순위(결렬로 시작했으면 -1) */
export interface TransferState {
  status: TransferStatus;
  peak: number;
}

/** 첫 근거 카드의 상태 */
export function initialTransferState(status: TransferStatus): TransferState {
  return {
    status,
    peak: status === "collapsed" ? -1 : PROGRESS_RANK[status],
  };
}

/** 근거 카드 1장 적용(머리 주석 규칙) — 바뀌지 않으면 같은 객체를 돌려준다 */
export function applyTransferStatus(
  state: TransferState,
  next: TransferStatus,
): TransferState {
  if (next === "collapsed") {
    // 공식 발표 뒤 결렬은 적용하지 않는다 · 이미 결렬이면 그대로
    if (state.status === "official" || state.status === "collapsed") {
      return state;
    }
    return { status: "collapsed", peak: state.peak };
  }
  const rank = PROGRESS_RANK[next];
  if (state.status === "collapsed") {
    // 결렬 뒤에는 결렬 전 최고 단계보다 높은 단계만 다시 연다
    return rank > state.peak ? { status: next, peak: rank } : state;
  }
  return rank > PROGRESS_RANK[state.status]
    ? { status: next, peak: Math.max(state.peak, rank) }
    : state;
}

/** 단계 목록(적용 순서) → 최종 상태. 빈 목록이면 null */
export function reduceTransferStatus(
  statuses: readonly TransferStatus[],
): TransferStatus | null {
  const [first, ...rest] = statuses;
  if (first === undefined) return null;
  let state = initialTransferState(first);
  for (const s of rest) state = applyTransferStatus(state, s);
  return state.status;
}

/**
 * 단계 목록(적용 순서) → 각 카드가 상태를 바꿨는가(같은 길이의 boolean 목록). 첫 카드는 상태를 연 카드라 늘 true, 그 뒤는
 * `applyTransferStatus`가 새 상태를 돌려준 카드만 true — 같은 단계 재보도 · 낮은 단계 · official 뒤 결렬 · 결렬 뒤 같거나 낮은 단계는 false.
 * 화면 타임라인이 "상태를 올린(바꾼) 노드"를 강조할 때 쓴다(M4-04 — `history`에는 상태를 바꾸지 않은 카드도 남는다, D67 ⑤).
 */
export function transferStatusChanges(
  statuses: readonly TransferStatus[],
): boolean[] {
  const out: boolean[] = [];
  let state: TransferState | null = null;
  for (const s of statuses) {
    if (state === null) {
      state = initialTransferState(s);
      out.push(true);
      continue;
    }
    const next = applyTransferStatus(state, s);
    out.push(next !== state);
    state = next;
  }
  return out;
}
