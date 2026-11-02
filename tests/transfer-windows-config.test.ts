/**
 * M4-03 — configs/transfer-windows.json (PRD FR-105). 실제 설정 파일을 zod로 읽고, 각 창의 UTC 값이 리그 현지 시각에서 나온 값인지
 * (`zonedToUtcIso` — 서머타임: 겨울 창은 GMT/CET, 여름 창은 BST/CEST) 확인한다. 아래 표가 변환 근거 기록이다 — 날짜를 바꾸면 표도 고친다.
 *
 * 출처(2026-11-02 확인, configs/README.md '이적 창'):
 *   - EPL 겨울: premierleague.com(2026-05-22) "open on Friday 1 January and close on 1 February, again at 23:00 GMT"
 *   - 리그 1 겨울: ligue1.com(LFP 이사회, 2026-05-21) "Opens: Friday, 1 January 2027 · Closes: Monday, 1 February 2027 at 19:59"
 *   - 세리에 A 겨울: Lega Serie A 이사회 결정 보도(Football Italia·Goal, 2026-04-27~28) "2 gennaio 2027 fino al 1° febbraio 2027 (ore 20)"
 *     — 12-28 앞당김은 FIGC 수용·FIFA 승인 대기(Football Italia 2026-09-25)
 *   - 분데스리가·라리가 겨울: SPOX 표(2026-08-30) "1. Januar – 1. Februar 2027"·"2. Januar – 1. Februar 2027"(공식 발표 미확인 —
 *     Mundo Deportivo 2026-03-17은 라리가 마감을 2월 2일로 적음), 마감 시각은 관례(DFL 20:00, 라리가 23:59)
 *   - 2027 여름: 발표 없음 — 2026 여름 관례 기반 추정(sourceUrl 없음)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompIdSchema,
  TransferWindowsFileSchema,
  type CompId,
} from "@/lib/schema";
import { zonedToUtcIso } from "@/lib/time";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = TransferWindowsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/transfer-windows.json"), "utf8"),
  ),
);

const LONDON = "Europe/London";
const CET = "Europe/Paris"; // 스페인·이탈리아·독일·프랑스 공통(CET/CEST — 같은 순간에 전환)

/** 리그 현지 시각(오프셋 없음) → 설정 UTC. estimated = 발표 없음(관례 기반 추정 — sourceUrl 없어야 함) */
const LOCAL: Array<{
  comp: CompId;
  season: number;
  kind: "summer" | "winter";
  tz: string;
  opens: string;
  closes: string;
  estimated: boolean;
}> = [
  // 2026-27 겨울 창(2027-01) — 현지 겨울 시간(GMT·CET)
  {
    comp: "EPL",
    season: 2026,
    kind: "winter",
    tz: LONDON,
    opens: "2027-01-01T00:00",
    closes: "2027-02-01T23:00",
    estimated: false,
  },
  {
    comp: "LALIGA",
    season: 2026,
    kind: "winter",
    tz: CET,
    opens: "2027-01-02T00:00",
    closes: "2027-02-01T23:59",
    estimated: false,
  },
  {
    comp: "SERIEA",
    season: 2026,
    kind: "winter",
    tz: CET,
    opens: "2027-01-02T00:00",
    closes: "2027-02-01T20:00",
    estimated: false,
  },
  {
    comp: "BUNDESLIGA",
    season: 2026,
    kind: "winter",
    tz: CET,
    opens: "2027-01-01T00:00",
    closes: "2027-02-01T20:00",
    estimated: false,
  },
  {
    comp: "LIGUE1",
    season: 2026,
    kind: "winter",
    tz: CET,
    opens: "2027-01-01T00:00",
    closes: "2027-02-01T19:59",
    estimated: false,
  },
  // 2027 여름 창 — 추정(현지 여름 시간 BST·CEST)
  {
    comp: "EPL",
    season: 2027,
    kind: "summer",
    tz: LONDON,
    opens: "2027-06-14T00:00",
    closes: "2027-09-01T23:00",
    estimated: true,
  },
  {
    comp: "LALIGA",
    season: 2027,
    kind: "summer",
    tz: CET,
    opens: "2027-07-01T00:00",
    closes: "2027-09-01T23:59",
    estimated: true,
  },
  {
    comp: "SERIEA",
    season: 2027,
    kind: "summer",
    tz: CET,
    opens: "2027-07-01T00:00",
    closes: "2027-09-01T20:00",
    estimated: true,
  },
  {
    comp: "BUNDESLIGA",
    season: 2027,
    kind: "summer",
    tz: CET,
    opens: "2027-07-01T00:00",
    closes: "2027-09-01T20:00",
    estimated: true,
  },
  {
    comp: "LIGUE1",
    season: 2027,
    kind: "summer",
    tz: CET,
    opens: "2027-06-14T00:00",
    closes: "2027-09-01T19:59",
    estimated: true,
  },
];

describe("configs/transfer-windows.json", () => {
  it("스키마 통과 · boost 1.5(이적 관련 키워드 곱 최대 1.2 × 1.5 × 1.3 = 2.34 < 한국 선수 3 — score.ts 주석)", () => {
    expect(FILE.boost).toBe(1.5);
  });

  it("창 = 위 표(현지 시각 → UTC 변환)와 같은 집합", () => {
    expect(FILE.windows).toHaveLength(LOCAL.length);
    for (const row of LOCAL) {
      const w = FILE.windows.find(
        (x) =>
          x.comp === row.comp && x.season === row.season && x.kind === row.kind,
      );
      expect(w, `${row.comp} ${row.season} ${row.kind}`).toBeDefined();
      expect(w!.opensAt).toBe(zonedToUtcIso(row.opens, row.tz));
      expect(w!.closesAt).toBe(zonedToUtcIso(row.closes, row.tz));
      // 추정 창은 출처가 없고, 발표 근거가 있는 창은 출처가 있다
      expect(w!.sourceUrl === undefined).toBe(row.estimated);
    }
  });

  it("서머타임 반영 — 겨울 창은 CET(UTC+1)·GMT(+0), 여름 창은 CEST(+2)·BST(+1)", () => {
    const get = (comp: CompId, kind: "summer" | "winter") =>
      FILE.windows.find((w) => w.comp === comp && w.kind === kind)!;
    expect(get("BUNDESLIGA", "winter").opensAt).toBe(
      "2026-12-31T23:00:00.000Z",
    );
    expect(get("BUNDESLIGA", "summer").opensAt).toBe(
      "2027-06-30T22:00:00.000Z",
    );
    expect(get("EPL", "winter").closesAt).toBe("2027-02-01T23:00:00.000Z");
    expect(get("EPL", "summer").closesAt).toBe("2027-09-01T22:00:00.000Z");
  });

  it("시즌·종류마다 5대 리그가 모두 있다(UCL은 스키마가 막는다)", () => {
    const leagues = CompIdSchema.options.filter((c) => c !== "UCL");
    for (const [season, kind] of [
      [2026, "winter"],
      [2027, "summer"],
    ] as const) {
      const have = FILE.windows
        .filter((w) => w.season === season && w.kind === kind)
        .map((w) => w.comp)
        .sort();
      expect(have).toEqual([...leagues].sort());
    }
  });

  it("PRD FR-105 기간 — 겨울 창은 1월(~2월 초), 여름 창은 6월~9월 초", () => {
    for (const w of FILE.windows) {
      const open = new Date(w.opensAt);
      const close = new Date(w.closesAt);
      if (w.kind === "winter") {
        expect(open >= new Date("2026-12-31T00:00:00Z")).toBe(true);
        expect(close <= new Date("2027-02-03T00:00:00Z")).toBe(true);
      } else {
        expect(open >= new Date("2027-06-01T00:00:00Z")).toBe(true);
        expect(close <= new Date("2027-09-10T00:00:00Z")).toBe(true);
      }
    }
  });
});
