import { describe, expect, it } from "vitest";

import { loadTransferWindowState } from "@/lib/data/transfer-windows";
import { transferWindowLine } from "@/lib/transfer-window-view";

// 이적 창 머리 줄(M4-04 — FR-105, D68 ①②). 저장소 설정(configs/transfer-windows.json — 2026-27 겨울 · 2027 여름)에 시각을 주입한다.
const lineAt = (iso: string) =>
  transferWindowLine(loadTransferWindowState(new Date(iso))!);

describe("transferWindowLine", () => {
  it("닫힘 — 다음 창은 가장 먼저 열리는 창과 같은 시즌 · 종류 묶음(가장 이른 개장 ~ 가장 늦은 마감, 5대 리그 순)", () => {
    expect(lineAt("2026-11-02T00:00:00Z")).toEqual({
      mode: "closed",
      next: {
        kind: "winter",
        opensAt: "2026-12-31T23:00:00.000Z",
        closesAt: "2027-02-01T23:00:00.000Z",
        comps: ["EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1"],
      },
    });
  });

  it("열림 — 모드 마감(가장 늦은 마감) · KST D-n · 열린 리그", () => {
    const line = lineAt("2027-01-15T00:00:00Z");
    expect(line).toMatchObject({
      mode: "open",
      closesAt: "2027-02-01T23:00:00.000Z",
      daysLeft: 18,
    });
    if (line.mode === "open") expect(line.comps).toContain("EPL");
  });

  it("마감 직후 — 마지막 마감 뒤 24시간(D68 ①) · 그때 닫힌 리그", () => {
    expect(lineAt("2027-02-02T06:00:00Z")).toEqual({
      mode: "grace",
      closedAt: "2027-02-01T23:00:00.000Z",
      comps: ["EPL"],
    });
    expect(lineAt("2027-02-02T23:00:00Z").mode).toBe("closed");
  });
});
