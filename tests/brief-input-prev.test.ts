/**
 * M2-03 브리핑 입력의 전일 순위(prev) — `briefPrevPositions`(대회 파일 스냅숏 → fd 팀 id별 기준 순위)·빌더의 `prev` 키·검사기
 * 순위 변동 문형(move·keep)과의 맞물림. 네트워크·LLM 없음 — fixtures/football 실응답 순위로 만든다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
  type StandingRow,
} from "@/lib/schema";

import {
  checkBriefOutput,
  briefInputKeys,
  type BriefCheckContext,
} from "../scripts/lib/brief-check";
import {
  BRIEF_PREV_ENABLED,
  briefInputWindow,
  briefPrevPositions,
  briefPrevSummary,
  buildBriefInput,
  serializeBriefInput,
  type BriefPrevFile,
} from "../scripts/lib/brief-input";
import type { CompStandings } from "../scripts/lib/match-data";
import { withJosa } from "../scripts/lib/josa";
import { buildNameIndex } from "../scripts/lib/names";
import {
  toCompStandings,
  toFinishedResults,
} from "../scripts/lib/providers/football-data";
import { buildTeamIdIndex } from "../scripts/lib/team-ids";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const TEAM_INDEX = buildTeamIdIndex(
  TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
);
const NAMES = buildNameIndex(
  NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
  COMPETITIONS,
);
const CTX: BriefCheckContext = { names: NAMES, competitions: COMPETITIONS };
const BRIEF_DATE = "2026-10-11";
const RESULTS = toFinishedResults(
  (
    readJson(
      "fixtures/football/football-data/matches-6comps-2026-10-10.json",
    ) as { matches: unknown[] }
  ).matches,
  COMPETITIONS,
  { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
).results;
const EPL_CONFIG = COMPETITIONS.find((c) => c.id === "EPL")!;
const PL: CompStandings = toCompStandings(
  readJson("fixtures/football/football-data/standings-pl-2026-10-11.json"),
  EPL_CONFIG,
  { fetchedAt: "2026-10-10T21:45:00.000Z", inProgress: 0 },
);
const PL_ROWS = PL.tables[0]!.rows;

/** fd 순위 행 → 대회 파일 순위 행(slug). posOf로 그때의 순위를 준다 */
function prevFile(
  updatedAt: string,
  posOf: (fdPos: number) => number,
  prevPosOf: (fdPos: number) => number | null = () => null,
  over: Partial<BriefPrevFile> = {},
): BriefPrevFile {
  const standings: StandingRow[] = PL_ROWS.map((r) => ({
    pos: posOf(r.pos),
    prevPos: prevPosOf(r.pos),
    team: TEAM_INDEX.byFd.get(r.team.id) ?? `fd-${r.team.id}`,
    played: r.played,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    pts: r.pts,
    form: [],
    zone: "none",
  }));
  return {
    comp: "EPL",
    season: EPL_CONFIG.season,
    updatedAt,
    standings,
    ...over,
  };
}

/** 지금 1·2위가 하루 전에는 2·1위, 3위는 5위에서 올라옴, 4위는 그대로 */
const SWAP = (pos: number) =>
  pos === 1 ? 2 : pos === 2 ? 1 : pos === 3 ? 5 : pos === 5 ? 3 : pos;

function prevFor(file: BriefPrevFile | null) {
  return briefPrevPositions({
    briefDate: BRIEF_DATE,
    standings: [PL],
    files: new Map([["EPL", file]]),
    competitions: COMPETITIONS,
    teamSlugByFd: TEAM_INDEX.byFd,
  });
}

function prevByName(file: BriefPrevFile | null): Map<string, number> {
  const pos = prevFor(file).positions.get("EPL") ?? new Map<number, number>();
  return new Map(
    PL_ROWS.filter((r) => pos.has(r.team.id)).map(
      (r) => [r.team.name, pos.get(r.team.id)!] as const,
    ),
  );
}

describe("briefPrevPositions — 브리핑 기준 스냅숏", () => {
  // 입력 창 = UTC 10-10 하루 = KST [10-10 09:00, 10-11 09:00)
  it("입력 창은 KST D-1 09:00부터(전제)", () => {
    expect(briefInputWindow(BRIEF_DATE).start).toBe("2026-10-10T00:00:00.000Z");
  });

  it("D-1 아침 정기 수집 파일(창 시작 전) → 그 파일의 pos", () => {
    // 10-10 06:30 KST(여름 슬롯) = 10-09T21:30Z
    const r = prevFor(prevFile("2026-10-09T21:30:00.000Z", SWAP));
    expect(r.states.EPL).toBe("ok");
    const byName = prevByName(prevFile("2026-10-09T21:30:00.000Z", SWAP));
    expect(byName.get(PL_ROWS[0]!.team.name)).toBe(2);
    expect(byName.get(PL_ROWS[1]!.team.name)).toBe(1);
    expect(byName.get(PL_ROWS[2]!.team.name)).toBe(5);
    expect(byName.size).toBe(PL_ROWS.length);
  });

  it("발행일 D에 이미 쓴 파일(같은 아침 백업) → 그 파일의 prevPos(null은 넣지 않는다)", () => {
    const f = prevFile(
      "2026-10-10T22:00:00.000Z", // 10-11 07:00 KST
      (p) => p,
      (p) => (p === 1 ? 3 : p === 2 ? null : p),
    );
    const byName = prevByName(f);
    expect(byName.get(PL_ROWS[0]!.team.name)).toBe(3);
    expect(byName.has(PL_ROWS[1]!.team.name)).toBe(false);
    expect(byName.size).toBe(PL_ROWS.length - 1);
  });

  it("창 안에서 받은 D-1 파일(수동 실행 — 어제 경기 일부 반영)·이틀 이상 묵은 파일은 stale → prev 없음", () => {
    for (const at of [
      "2026-10-10T00:00:00.000Z", // KST 10-10 09:00 — 창 시작(포함)
      "2026-10-10T14:00:00.000Z", // KST 10-10 23:00
      "2026-10-08T22:10:00.000Z", // KST 10-09 07:10 — D-2
    ]) {
      const r = prevFor(prevFile(at, SWAP));
      expect(r.states.EPL, at).toBe("stale");
      expect(r.positions.has("EPL"), at).toBe(false);
    }
    // 창 시작 1ms 전은 쓴다
    expect(prevFor(prevFile("2026-10-09T23:59:59.999Z", SWAP)).states.EPL).toBe(
      "ok",
    );
  });

  it("파일 없음(첫 수집)·시즌이 다른 파일(시즌 전환)·표가 여러 개인 순위는 prev 없음", () => {
    expect(prevFor(null).states.EPL).toBe("no-file");
    expect(
      prevFor(
        prevFile("2026-10-09T21:30:00.000Z", SWAP, () => null, {
          season: EPL_CONFIG.season - 1,
        }),
      ).states.EPL,
    ).toBe("season");
    const multi = briefPrevPositions({
      briefDate: BRIEF_DATE,
      standings: [{ ...PL, tables: [PL.tables[0]!, PL.tables[0]!] }],
      files: new Map([["EPL", prevFile("2026-10-09T21:30:00.000Z", SWAP)]]),
      competitions: COMPETITIONS,
      teamSlugByFd: TEAM_INDEX.byFd,
    });
    expect(multi.states.EPL).toBe("multi-table");
  });

  it("대응표에 없는 팀·대회 파일에 없는 팀은 prev 없음", () => {
    const first = PL_ROWS[0]!.team.id;
    const noSlug = new Map(TEAM_INDEX.byFd);
    noSlug.delete(first);
    const r = briefPrevPositions({
      briefDate: BRIEF_DATE,
      standings: [PL],
      files: new Map([["EPL", prevFile("2026-10-09T21:30:00.000Z", SWAP)]]),
      competitions: COMPETITIONS,
      teamSlugByFd: noSlug,
    });
    expect(r.positions.get("EPL")!.has(first)).toBe(false);
    expect(r.positions.get("EPL")!.size).toBe(PL_ROWS.length - 1);
  });
});

describe("buildBriefInput — prev 키", () => {
  const prev = prevFor(prevFile("2026-10-09T21:30:00.000Z", SWAP)).positions;
  const base = {
    briefDate: BRIEF_DATE,
    results: RESULTS,
    competitions: COMPETITIONS,
    standings: [PL],
  };

  it("정기 실행 스위치는 꺼져 있다 — 지시문 v0.4가 prev를 설명하지 않는다(D55 ①, 켜려면 지시문 v0.5 + 회귀)", () => {
    expect(BRIEF_PREV_ENABLED).toBe(false);
  });

  it("prevPositions가 없으면 입력은 지금과 같다(prev 키 없음)", () => {
    const built = buildBriefInput(base);
    expect(serializeBriefInput(built.input)).not.toContain('"prev"');
    expect(built.standings.prevRows).toBe(0);
  });

  it("있으면 상위 4위 행 끝에 prev(M0-30 입력과 같은 키 순서), 집계와 관찰 요약이 같다", () => {
    const built = buildBriefInput({ ...base, prevPositions: prev });
    const sPL = built.input.standings.find((s) => s.id === "sPL")!;
    expect(sPL.rows.map((r) => [r.pos, r.prev])).toEqual([
      [1, 2],
      [2, 1],
      [3, 5],
      [4, 4],
    ]);
    expect(Object.keys(sPL.rows[0]!)).toEqual([
      "pos",
      "team",
      "played",
      "pts",
      "gd",
      "prev",
    ]);
    expect(built.standings.prevRows).toBe(4);
    expect(briefPrevSummary(built.standings.included, [PL], prev)).toEqual({
      rows: 4,
      moved: 3,
    });
    // 입력 크기 — 행당 ',"prev":n' 9자 안팎
    const plain = serializeBriefInput(buildBriefInput(base).input).length;
    expect(serializeBriefInput(built.input).length - plain).toBe(4 * 9);
  });

  it("검사기 — prev가 있으면 변동·유지 문형이 켜지고 입력 값으로 대조한다(없으면 변동 서술 강등, D40 ③)", () => {
    const withPrev = buildBriefInput({ ...base, prevPositions: prev }).input;
    const without = buildBriefInput(base).input;
    expect([...briefInputKeys(withPrev)]).toEqual(["prev"]);
    expect([...briefInputKeys(without)]).toEqual([]);
    const [r1, , r3, r4] = withPrev.standings.find((s) => s.id === "sPL")!.rows;
    const lines = [
      `${withJosa(r3!.team, "은/는")} 5위에서 3위로 올랐다.`,
      `${withJosa(r1!.team, "은/는")} 2위에서 1위로 올랐다.`,
      `${withJosa(r4!.team, "은/는")} 4위를 지켰다.`,
      `${withJosa(r3!.team, "은/는")} 6위에서 3위로 올랐다.`, // prev 5 — 틀림
      `${withJosa(r1!.team, "은/는")} 1위를 지켰다.`, // prev 2 — 틀림
    ];
    const check = (input: typeof withPrev) =>
      checkBriefOutput(
        lines.map((t) => ({ t, r: ["sPL"] })),
        input,
        CTX,
      ).lines.map((l) => (l.ok ? null : l.reasons.map((x) => x.code)[0]));
    const got = check(withPrev);
    expect(got.slice(0, 3), lines.slice(0, 3).join(" / ")).toEqual([
      null,
      null,
      null,
    ]);
    expect(got.slice(3)).toEqual(["rank-move", "rank-move"]);
    // prev가 없으면 변동 문형이 꺼져 문법 밖
    expect(check(without).every((c) => c !== null)).toBe(true);
  });
});
