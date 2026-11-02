import { describe, expect, it } from "vitest";

import * as scripts from "../scripts/lib/transfers";
import {
  applyTransferStatus,
  initialTransferState,
  reduceTransferStatus,
  transferStatusChanges,
} from "@/lib/transfer-status";

// 이적 상태 머신을 src/lib/transfer-status.ts로 옮긴 것(M4-04) — 집계(scripts/lib/transfers.ts)는 같은 함수를 다시 내보낸다(동작 불변 —
// 규칙 자체는 tests/transfers.test.ts가 그대로 본다). 여기서는 옮김 · 화면 타임라인의 "상태를 바꾼 카드" 계산을 본다.

describe("상태 머신 옮김 — scripts가 같은 함수를 다시 내보낸다", () => {
  it("이름이 같은 객체", () => {
    expect(scripts.applyTransferStatus).toBe(applyTransferStatus);
    expect(scripts.initialTransferState).toBe(initialTransferState);
    expect(scripts.reduceTransferStatus).toBe(reduceTransferStatus);
  });
});

describe("transferStatusChanges — 각 근거 카드가 상태를 바꿨나", () => {
  it("빈 목록 → 빈 목록, 첫 카드는 늘 true", () => {
    expect(transferStatusChanges([])).toEqual([]);
    expect(transferStatusChanges(["agreed"])).toEqual([true]);
    expect(transferStatusChanges(["collapsed"])).toEqual([true]);
  });

  it("같은 단계 재보도 · 낮은 단계는 false, 높은 단계만 true", () => {
    expect(
      transferStatusChanges([
        "rumor",
        "negotiating",
        "negotiating",
        "rumor",
        "agreed",
      ]),
    ).toEqual([true, true, false, false, true]);
  });

  it("official 뒤 결렬은 false(D52 ②) · 진행 중 결렬은 true", () => {
    expect(
      transferStatusChanges(["rumor", "agreed", "official", "collapsed"]),
    ).toEqual([true, true, true, false]);
    expect(
      transferStatusChanges(["rumor", "negotiating", "collapsed"]),
    ).toEqual([true, true, true]);
  });

  it("결렬 뒤 재개 = 결렬 전 최고 단계보다 높을 때만(D67 ⑤)", () => {
    expect(
      transferStatusChanges(["negotiating", "collapsed", "rumor", "agreed"]),
    ).toEqual([true, true, false, true]);
    expect(
      transferStatusChanges(["negotiating", "collapsed", "negotiating"]),
    ).toEqual([true, true, false]);
  });

  it("마지막 true 카드까지 적용한 결과가 reduce 결과와 같다", () => {
    const seq = ["rumor", "agreed", "rumor", "collapsed", "official"] as const;
    const changes = transferStatusChanges(seq);
    const last = seq[changes.lastIndexOf(true)];
    expect(last).toBe(reduceTransferStatus(seq));
  });
});
