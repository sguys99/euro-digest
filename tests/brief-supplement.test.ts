/**
 * PRD §15 D60 — 브리핑 결과 보충(API-Football) · 결과 지연(results-pending) 구분 (2026-10-25 사용자 결정, 10-25 호 사건).
 *
 * 필수 항목: football-data 미종료 경기 분류(awaiting·void — providers/football-data.ts), API-Football 종료 스코어 → football-data
 * FINISHED 결과와 같은 내부 형식(정규·연장·승부차기 — providers/api-football.ts `afResultScore`), 점수 없는 경기 연결(team-ids.ts
 * `linkPendingMatches` — 두 팀 대응표 · 한쪽 팀 대응표 + 어긋나지 않음 + 후보 하나), 보충·결과 지연 판정(brief-supplement.ts),
 * 10-25 호 재현(fixtures/brief-pending — football-data 19경기 미종료 + 원장의 API-Football 종료 결과) → 브리핑 입력·순위 제외·
 * 템플릿·검사기·대회(D58). 네트워크·LLM 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
} from "@/lib/schema";

import {
  checkBriefOutput,
  describeLineCheck,
  type BriefCheckInput,
} from "../scripts/lib/brief-check";
import { briefLinesWithComps } from "../scripts/lib/brief-comps";
import { buildBriefInput, type BriefInput } from "../scripts/lib/brief-input";
import {
  afFinishedInWindow,
  briefEmptyReason,
  supplementBriefResults,
  teamDictionaryKey,
  toSupplementedResult,
} from "../scripts/lib/brief-supplement";
import {
  briefNamesFromIndex,
  chooseBriefCompForm,
  templateBriefLines,
  templateMatchLine,
} from "../scripts/lib/brief-template";
import type {
  CompStandings,
  MatchDetail,
  MatchScore,
  UnsettledMatch,
} from "../scripts/lib/match-data";
import { ledgerMatchToDetail } from "../scripts/lib/match-ledger";
import {
  buildNameIndex,
  canonicalizeBriefInput,
  playerTeamsFrom,
} from "../scripts/lib/names";
import { afResultScore } from "../scripts/lib/providers/api-football";
import {
  toFinishedResults,
  toMatchScore,
  unsettledStateOf,
  type FdMatch,
} from "../scripts/lib/providers/football-data";
import {
  buildTeamIdIndex,
  compactTeamName,
  EMPTY_TEAM_ID_INDEX,
  linkPendingMatches,
  teamNamesAgree,
} from "../scripts/lib/team-ids";

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
const PLAYER_TEAMS = playerTeamsFrom(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json")),
);

/** 발행일 2026-10-25의 브리핑 입력 창 = UTC 2026-10-24 */
const WINDOW_1024 = {
  start: "2026-10-24T00:00:00.000Z",
  end: "2026-10-25T00:00:00.000Z",
};

// ─── 10-25 호 재현 fixture ───────────────────────────────────────────────

const FD_STALE = (
  readJson("fixtures/brief-pending/fd-matches-2026-10-24-stale.json") as {
    matches: unknown[];
  }
).matches;
const LEDGER_1024 = MatchLedgerFileSchema.parse(
  readJson("fixtures/brief-pending/af-ledger-2026-10-24.json"),
);
const AF_DETAILS_1024: MatchDetail[] = LEDGER_1024.matches.flatMap((m) => {
  const d = ledgerMatchToDetail(m);
  return d ? [d] : [];
});
const STALE = toFinishedResults(FD_STALE, COMPETITIONS, WINDOW_1024);

// ─── 합성 도우미 ─────────────────────────────────────────────────────────

const score = (home: number, away: number) => ({ home, away });

function pending(
  over: Partial<UnsettledMatch> & Pick<UnsettledMatch, "matchId">,
): UnsettledMatch {
  return {
    provider: "football-data",
    comp: "EPL",
    kickoff: "2026-10-24T14:00:00Z",
    matchday: 8,
    stage: "REGULAR_SEASON",
    home: { id: 1, name: "Home FC", fullName: null },
    away: { id: 2, name: "Away FC", fullName: null },
    state: "awaiting",
    status: "TIMED",
    ...over,
  };
}

function detail(
  over: Partial<MatchDetail> & Pick<MatchDetail, "matchId">,
): MatchDetail {
  return {
    provider: "api-football",
    leagueId: 39,
    leagueName: "Premier League",
    comp: "EPL",
    season: 2026,
    round: "Regular Season - 8",
    kickoff: "2026-10-24T14:00:00.000Z",
    status: "FT",
    home: { id: 101, name: "Home", fullName: null },
    away: { id: 102, name: "Away", fullName: null },
    score: {
      ft: score(2, 1),
      ht: score(1, 0),
      regular: score(2, 1),
      pens: null,
      duration: "REGULAR",
    },
    goals: [],
    goalsComplete: false,
    lineups: { home: null, away: null },
    fetchedAt: "2026-10-24T23:43:00.000Z",
    ...over,
  };
}

/** 합성 대응표 — home-fc(fd 1 ↔ af 101) · away-fc(2 ↔ 102) · other-fc(3 ↔ 103) */
const MINI_INDEX = buildTeamIdIndex({
  "home-fc": { fd: 1, af: 101 },
  "away-fc": { fd: 2, af: 102 },
  "other-fc": { fd: 3, af: 103 },
});

// ─── football-data 미종료 분류 ───────────────────────────────────────────

describe("football-data 창 안 미종료 경기(unsettled — providers/football-data.ts)", () => {
  it("10-25 호 재현: 종료 0 · 미종료 19 — 모두 결과를 기다림(awaiting, IN_PLAY 5 · TIMED 14), 팀·라운드는 football-data 그대로", () => {
    expect(STALE.results).toEqual([]);
    expect(STALE.unsettled).toHaveLength(19);
    expect(STALE.unsettled.every((m) => m.state === "awaiting")).toBe(true);
    const byStatus = new Map<string, number>();
    for (const m of STALE.unsettled) {
      byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
    }
    expect(Object.fromEntries(byStatus)).toEqual({ IN_PLAY: 5, TIMED: 14 });
    expect(STALE.unsettled[0]).toEqual({
      provider: "football-data",
      matchId: 990001,
      comp: "EPL",
      kickoff: "2026-10-24T11:30:00Z",
      matchday: 8,
      stage: "REGULAR_SEASON",
      home: { id: 58, name: "Aston Villa", fullName: "Aston Villa" },
      away: {
        id: 900001,
        name: "Manchester City",
        fullName: "Manchester City",
      },
      state: "awaiting",
      status: "IN_PLAY",
    });
    // others(D37 후보 수 세기)에도 그대로 남는다(ft null)
    expect(STALE.others).toHaveLength(19);
    expect(STALE.others.every((s) => s.ft === null)).toBe(true);
  });

  it("상태 분류 — 예정·진행 중·스코어를 쓸 수 없는 FINISHED는 awaiting, 연기·취소·중단·몰수·모르는 상태는 void", () => {
    for (const s of [
      "SCHEDULED",
      "TIMED",
      "IN_PLAY",
      "PAUSED",
      "LIVE",
      "EXTRA_TIME",
      "PENALTY_SHOOTOUT",
      "FINISHED",
    ]) {
      expect(unsettledStateOf(s), s).toBe("awaiting");
    }
    for (const s of ["POSTPONED", "CANCELLED", "SUSPENDED", "AWARDED", "NEW"]) {
      expect(unsettledStateOf(s), s).toBe("void");
    }
  });

  it("창 밖·대상 밖 대회·팀 미정은 넣지 않고, 승부차기 점수가 없는 FINISHED는 awaiting으로 넣는다", () => {
    const base = FD_STALE[0] as FdMatch;
    const raw = [
      { ...base, id: 1, status: "POSTPONED" },
      { ...base, id: 2, utcDate: "2026-10-23T19:00:00Z" }, // 창 밖
      { ...base, id: 3, competition: { code: "ELC" } }, // 대상 밖
      { ...base, id: 4, awayTeam: { id: null, name: null } }, // 대진 미정
      {
        ...base,
        id: 5,
        status: "FINISHED",
        score: {
          duration: "PENALTY_SHOOTOUT",
          fullTime: score(5, 4),
          halfTime: score(0, 0),
        },
      }, // penalties 없음 → 스코어를 쓸 수 없음
    ];
    const summary = toFinishedResults(raw, COMPETITIONS, WINDOW_1024);
    expect(summary.results).toEqual([]);
    expect(
      summary.unsettled.map((m) => [m.matchId, m.state, m.status]),
    ).toEqual([
      [1, "void", "POSTPONED"],
      [5, "awaiting", "FINISHED"],
    ]);
  });
});

// ─── 스코어 변환 ─────────────────────────────────────────────────────────

describe("afResultScore — API-Football 종료 스코어 → football-data FINISHED 결과와 같은 내부 형식", () => {
  it("정규(FT) — 90분 = 최종, 승부차기 없음 · 연장(AET) — 90분은 있을 때만 · 승부차기(PEN) — pens 필수", () => {
    expect(afResultScore(detail({ matchId: 1 }))).toEqual({
      ft: score(2, 1),
      ht: score(1, 0),
      regular: score(2, 1),
      pens: null,
      duration: "REGULAR",
    });
    expect(
      afResultScore(
        detail({
          matchId: 2,
          status: "AET",
          score: {
            ft: score(2, 1),
            ht: null,
            regular: score(1, 1),
            pens: null,
            duration: "EXTRA_TIME",
          },
        }),
      ),
    ).toEqual({
      ft: score(2, 1),
      ht: null,
      regular: score(1, 1),
      pens: null,
      duration: "EXTRA_TIME",
    });
    expect(
      afResultScore(
        detail({
          matchId: 3,
          status: "PEN",
          score: {
            ft: score(1, 1),
            ht: score(0, 1),
            regular: null,
            pens: score(4, 3),
            duration: "PENALTY_SHOOTOUT",
          },
        }),
      ),
    ).toEqual({
      ft: score(1, 1),
      ht: score(0, 1),
      regular: null,
      pens: score(4, 3),
      duration: "PENALTY_SHOOTOUT",
    });
  });

  it("같은 승부차기 경기 — football-data(fullTime에 승부차기 골 포함)와 API-Football(goals 제외)이 같은 내부 스코어가 된다", () => {
    const fd = toMatchScore({
      duration: "PENALTY_SHOOTOUT",
      fullTime: score(5, 4),
      halfTime: score(0, 1),
      regularTime: score(1, 1),
      extraTime: score(0, 0),
      penalties: score(4, 3),
    });
    const af = afResultScore(
      detail({
        matchId: 4,
        status: "PEN",
        score: {
          ft: score(1, 1),
          ht: score(0, 1),
          regular: score(1, 1),
          pens: score(4, 3),
          duration: "PENALTY_SHOOTOUT",
        },
      }),
    );
    expect(af).toEqual(fd);
  });

  it("어긋나면 null — 상태·끝난 방식 불일치, 승부차기 점수 없음, 정규·연장에 승부차기 점수, 음수·소수", () => {
    const bad: Array<[MatchDetail["status"], Partial<MatchScore>]> = [
      ["FT", { duration: "EXTRA_TIME" }],
      ["AET", { duration: "REGULAR" }],
      ["PEN", { duration: "PENALTY_SHOOTOUT", pens: null }],
      ["FT", { pens: score(4, 3) }],
      ["AET", { duration: "EXTRA_TIME", pens: score(4, 3) }],
      ["FT", { ft: score(-1, 0) }],
      ["FT", { ft: score(1.5, 0) }],
    ];
    for (const [status, over] of bad) {
      const base = detail({ matchId: 9 }).score;
      expect(
        afResultScore({ status, score: { ...base, ...over } }),
        JSON.stringify([status, over]),
      ).toBeNull();
    }
  });

  it("toSupplementedResult — id·대회·킥오프·라운드·팀은 football-data, 스코어는 API-Football(복사본), 출처 af id", () => {
    const fd = pending({ matchId: 7 });
    const af = detail({ matchId: 70 });
    const r = toSupplementedResult(fd, af)!;
    expect(r).toEqual({
      provider: "football-data",
      matchId: 7,
      comp: "EPL",
      kickoff: "2026-10-24T14:00:00Z",
      matchday: 8,
      stage: "REGULAR_SEASON",
      home: fd.home,
      away: fd.away,
      score: af.score,
      supplementedFrom: 70,
    });
    expect(r.score).not.toBe(af.score);
    expect(
      toSupplementedResult(fd, {
        ...af,
        score: { ...af.score, duration: "EXTRA_TIME" },
      }),
    ).toBeNull();
  });
});

// ─── 점수 없는 경기 연결 ─────────────────────────────────────────────────

describe("linkPendingMatches — 점수 없이 대응표가 팀을 확인하는 쌍만(D33·D37 변형)", () => {
  it("두 팀 대응표 확인 → team-ids", () => {
    const r = linkPendingMatches(
      [pending({ matchId: 1 })],
      [detail({ matchId: 11 })],
      MINI_INDEX,
    );
    expect(
      r.links.map((l) => [l.fd.matchId, l.af.matchId, l.linkedBy]),
    ).toEqual([[1, 11, "team-ids"]]);
    expect(r.unlinked).toEqual([]);
  });

  it("한쪽 팀만 대응표 확인 + 다른 쪽 어긋나지 않음 + 같은 칸 후보 하나 → evidence (같은 칸에 다른 경기가 있어도)", () => {
    const fd = pending({
      matchId: 1,
      away: { id: 900, name: "Unknown", fullName: null },
    });
    const r = linkPendingMatches(
      [fd],
      [
        detail({ matchId: 11, away: { id: 999, name: "?", fullName: null } }),
        // 같은 칸 다른 경기 — 홈 팀(af 103 = other-fc)이 fd 홈(home-fc)과 어긋난다
        detail({ matchId: 12, home: { id: 103, name: "O", fullName: null } }),
      ],
      MINI_INDEX,
    );
    expect(r.links.map((l) => [l.af.matchId, l.linkedBy])).toEqual([
      [11, "evidence"],
    ]);
    // 대응표를 읽지 못한 실행(autoLink false)은 한쪽 확인 연결을 하지 않는다
    expect(
      linkPendingMatches(
        [fd],
        [detail({ matchId: 11, away: { id: 999, name: "?", fullName: null } })],
        MINI_INDEX,
        { autoLink: false },
      ).unlinked,
    ).toEqual([{ fdMatchId: 1, afMatchId: 11, reason: "disabled" }]);
    // af 원정(102 = away-fc, fd 2)이 fd 원정(900)과 어긋나면 한쪽이 확인돼도 잇지 않는다(table)
    expect(
      linkPendingMatches([fd], [detail({ matchId: 11 })], MINI_INDEX).unlinked,
    ).toEqual([{ fdMatchId: 1, afMatchId: null, reason: "table" }]);
  });

  it("두 팀 모두 대응표에 없으면 같은 칸 경기가 하나뿐이어도 잇지 않는다(unconfirmed — 홈·원정 방향을 확인할 수 없다)", () => {
    const fd = pending({
      matchId: 1,
      home: { id: 800, name: "A", fullName: null },
      away: { id: 801, name: "B", fullName: null },
    });
    const r = linkPendingMatches(
      [fd],
      [
        detail({
          matchId: 11,
          home: { id: 900, name: "A", fullName: null },
          away: { id: 901, name: "B", fullName: null },
        }),
      ],
      MINI_INDEX,
    );
    expect(r.links).toEqual([]);
    expect(r.unlinked).toEqual([
      { fdMatchId: 1, afMatchId: null, reason: "unconfirmed" },
    ]);
  });

  it("대회·킥오프(±5분)가 다르면 후보가 아니다(noCandidate) · 대응표와 모두 어긋나면 table · 이미 쓴 af 경기는 뺀다", () => {
    const fd = pending({ matchId: 1 });
    expect(
      linkPendingMatches(
        [fd],
        [
          detail({ matchId: 11, comp: "LALIGA" }),
          detail({ matchId: 12, kickoff: "2026-10-24T14:06:00.000Z" }),
          detail({ matchId: 13, comp: null }),
        ],
        MINI_INDEX,
      ),
    ).toEqual({ links: [], unlinked: [], noCandidate: [1] });
    expect(
      linkPendingMatches(
        [fd],
        [detail({ matchId: 11, kickoff: "2026-10-24T14:05:00.000Z" })],
        MINI_INDEX,
      ).links,
    ).toHaveLength(1);
    expect(
      linkPendingMatches(
        [fd],
        [
          detail({
            matchId: 11,
            home: { id: 103, name: "O", fullName: null },
            away: { id: 103, name: "O", fullName: null },
          }),
        ],
        MINI_INDEX,
      ).unlinked,
    ).toEqual([{ fdMatchId: 1, afMatchId: null, reason: "table" }]);
    expect(
      linkPendingMatches([fd], [detail({ matchId: 11 })], MINI_INDEX, {
        excludeAf: new Set([11]),
      }).noCandidate,
    ).toEqual([1]);
  });

  it("같은 af 경기를 두 fd 경기가 가리키면 둘 다 conflict · 한쪽 확인 후보가 둘이면 af-candidates", () => {
    const a = pending({
      matchId: 1,
      away: { id: 900, name: "X", fullName: null },
    });
    const b = pending({
      matchId: 2,
      away: { id: 901, name: "Y", fullName: null },
    });
    const af = detail({
      matchId: 11,
      home: { id: 101, name: "Home", fullName: null },
      away: { id: 999, name: "?", fullName: null },
    });
    // a·b 모두 홈 home-fc 확인(같은 시각 같은 팀 — 데이터 오류) — 둘 다 같은 af 경기 11
    const r = linkPendingMatches([a, b], [af], MINI_INDEX);
    expect(r.links).toEqual([]);
    expect(r.unlinked).toEqual([
      { fdMatchId: 1, afMatchId: 11, reason: "conflict" },
      { fdMatchId: 2, afMatchId: 11, reason: "conflict" },
    ]);
    const twoCandidates = linkPendingMatches(
      [a],
      [
        detail({ matchId: 11, away: { id: 950, name: "?", fullName: null } }),
        detail({ matchId: 12, away: { id: 951, name: "?", fullName: null } }),
      ],
      MINI_INDEX,
    );
    expect(twoCandidates.unlinked).toEqual([
      { fdMatchId: 1, afMatchId: null, reason: "af-candidates" },
    ]);
  });

  it("리뷰 재현 — 대응표 항목 오류(af 101이 같은 칸 다른 팀): 확인된 쪽 팀 이름이 다르면 evidence로 잇지 않는다(name-mismatch)", () => {
    const fd = pending({
      matchId: 1,
      away: { id: 900, name: "Unknown", fullName: null },
    });
    // 대응표는 home-fc = af 101이라 하지만 af 101 경기의 홈 팀 이름은 'Rival Town' — 이전에는 [1, 11, "evidence"]로 이어졌다
    const wrong = detail({
      matchId: 11,
      home: { id: 101, name: "Rival Town", fullName: null },
      away: { id: 999, name: "?", fullName: null },
    });
    const r = linkPendingMatches([fd], [wrong], MINI_INDEX);
    expect(
      r.links.map((l) => [l.fd.matchId, l.af.matchId, l.linkedBy]),
    ).not.toContainEqual([1, 11, "evidence"]);
    expect(r.links).toEqual([]);
    expect(r.unlinked).toEqual([
      { fdMatchId: 1, afMatchId: 11, reason: "name-mismatch" },
    ]);
    // 같은 팀 이름이면(접미 FC 차이) 그대로 잇는다
    const right = { ...wrong, home: { ...wrong.home, name: "Home" } };
    expect(
      linkPendingMatches([fd], [right], MINI_INDEX).links.map((l) => [
        l.fd.matchId,
        l.af.matchId,
        l.linkedBy,
      ]),
    ).toEqual([[1, 11, "evidence"]]);
  });

  it("두 팀 대응표 확인(team-ids)도 이름을 교차 확인한다 — 한쪽이라도 다른 팀 이름이면 name-mismatch", () => {
    const fd = pending({ matchId: 1 });
    for (const side of ["home", "away"] as const) {
      const af = detail({ matchId: 11 });
      af[side] = { ...af[side], name: "Rival Town" };
      const r = linkPendingMatches([fd], [af], MINI_INDEX);
      expect(r.links, side).toEqual([]);
      expect(r.unlinked, side).toEqual([
        { fdMatchId: 1, afMatchId: 11, reason: "name-mismatch" },
      ]);
    }
  });

  it("홈·원정이 뒤집힌 짝(fd A–B ↔ af B–A)은 잇지 않는다 — 대응표가 두 팀·한 팀을 알든 모르든", () => {
    const fd = pending({ matchId: 1 }); // 홈 home-fc(1) · 원정 away-fc(2)
    // 두 팀 모두 대응표에 있음 — 홈 쪽부터 어긋난다(table)
    expect(
      linkPendingMatches(
        [fd],
        [
          detail({
            matchId: 11,
            home: { id: 102, name: "Away", fullName: null },
            away: { id: 101, name: "Home", fullName: null },
          }),
        ],
        MINI_INDEX,
      ),
    ).toEqual({
      links: [],
      unlinked: [{ fdMatchId: 1, afMatchId: null, reason: "table" }],
      noCandidate: [],
    });
    // 한 팀(home-fc)만 대응표에 있음 — af 원정이 home-fc라 fd 홈과 어긋난다(table)
    const oneKnown = pending({
      matchId: 2,
      away: { id: 900, name: "Unknown", fullName: null },
    });
    expect(
      linkPendingMatches(
        [oneKnown],
        [
          detail({
            matchId: 12,
            home: { id: 999, name: "Unknown", fullName: null },
            away: { id: 101, name: "Home", fullName: null },
          }),
        ],
        MINI_INDEX,
      ).unlinked,
    ).toEqual([{ fdMatchId: 2, afMatchId: null, reason: "table" }]);
    // 두 팀 모두 대응표 밖 — 같은 칸 경기가 하나뿐이어도 방향을 확인할 수 없어 잇지 않는다(unconfirmed)
    const unknown = pending({
      matchId: 3,
      home: { id: 800, name: "Alpha", fullName: null },
      away: { id: 801, name: "Beta", fullName: null },
    });
    expect(
      linkPendingMatches(
        [unknown],
        [
          detail({
            matchId: 13,
            home: { id: 901, name: "Beta", fullName: null },
            away: { id: 900, name: "Alpha", fullName: null },
          }),
        ],
        MINI_INDEX,
      ).unlinked,
    ).toEqual([{ fdMatchId: 3, afMatchId: null, reason: "unconfirmed" }]);
  });

  it("빈 대응표면 아무것도 잇지 않는다(대응표를 읽지 못한 실행)", () => {
    const r = linkPendingMatches(
      STALE.unsettled,
      AF_DETAILS_1024,
      EMPTY_TEAM_ID_INDEX,
      { autoLink: false },
    );
    expect(r.links).toEqual([]);
  });
});

// ─── 10-25 호 재현 ───────────────────────────────────────────────────────

// ─── 팀 이름 교차 확인 ───────────────────────────────────────────────────

describe("teamNamesAgree — 대응표가 확인한 쪽 팀 이름 교차 확인(D60 리뷰)", () => {
  /** configs/team-ids.json 메모의 실제 원문 이름 쌍(fd 정식 이름 · af 이름) */
  const PAIRS: Array<[string, string, string]> = Object.entries(
    TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
  ).flatMap(([slug, e]) => {
    const m = /fd "([^"]+)" · af "([^"]+)"/.exec(e.note ?? "");
    return m ? [[slug, m[1]!, m[2]!] as [string, string, string]] : [];
  });
  const DICT = teamDictionaryKey(NAMES);

  it("대응표 52팀의 실제 fd·af 이름 쌍은 모두 같은 팀 — 이름 정규화만으로도, 사전과 함께도", () => {
    expect(PAIRS.length).toBe(52);
    for (const [slug, fdName, afName] of PAIRS) {
      expect(
        teamNamesAgree({ name: fdName, fullName: null }, { name: afName }),
        `${slug}: ${fdName} ↔ ${afName}`,
      ).toBe(true);
      expect(
        teamNamesAgree(
          { name: fdName, fullName: null },
          { name: afName },
          DICT,
        ),
        `${slug} (사전): ${fdName} ↔ ${afName}`,
      ).toBe(true);
    }
  });

  it("비교 키 — 악센트·대소문자·접두·접미(FC·CF·AC·SV …)·숫자 낱말을 뺀다", () => {
    expect(compactTeamName("1. FC Köln")).toBe("koln");
    expect(compactTeamName("Club Atlético de Madrid")).toBe("atleticomadrid");
    expect(compactTeamName("TSG 1899 Hoffenheim")).toBe("hoffenheim");
    expect(compactTeamName("Brighton & Hove Albion FC")).toBe(
      "brightonhovealbion",
    );
    expect(compactTeamName("FC")).toBe("fc");
  });

  it("다른 팀은 가른다 — 같은 도시 다른 팀·짧은 약칭(4자 미만은 같을 때만)", () => {
    const no = (fd: string, af: string) =>
      expect(
        teamNamesAgree({ name: fd, fullName: null }, { name: af }),
        `${fd} ↔ ${af}`,
      ).toBe(false);
    no("Manchester United FC", "Manchester City");
    no("Real Madrid CF", "Atletico Madrid");
    no("Arsenal FC", "Everton");
    no("Inter", "AC Milan");
    no("HSV", "Hamburger SV");
    // 짧은 이름이 달라도 정식 이름이 맞으면 같은 팀(fd shortName·name 둘 다 본다)
    expect(
      teamNamesAgree(
        { name: "HSV", fullName: "Hamburger SV" },
        { name: "Hamburger SV" },
      ),
    ).toBe(true);
  });

  it("사전이 양쪽을 알면 사전으로만 판정 — 포함 관계인 다른 팀(Paris FC ⊂ Paris Saint Germain)을 가른다", () => {
    const fd = { name: "Paris FC", fullName: null };
    const af = { name: "Paris Saint Germain" };
    // 이름 정규화만이면 포함 관계로 같다고 본다(한계 — 사전이 없는 실행)
    expect(teamNamesAgree(fd, af)).toBe(true);
    const dict = (name: string) =>
      ({ "Paris FC": "team:paris", "Paris Saint Germain": "team:psg" })[name] ??
      null;
    expect(teamNamesAgree(fd, af, dict)).toBe(false);
    expect(teamNamesAgree(fd, { name: "Paris FC" }, dict)).toBe(true);
  });
});

describe("10-25 호 재현 — football-data 19경기 미종료 + 원장의 API-Football 종료 결과(추가 호출 0)", () => {
  // 운영과 같이 사전 팀 항목으로 이름을 교차 확인한다(collect-run.ts supplementBrief)
  const supplement = supplementBriefResults({
    unsettled: STALE.unsettled,
    details: AF_DETAILS_1024,
    usedAf: new Set(),
    index: TEAM_INDEX,
    autoLink: true,
    dictionaryKey: teamDictionaryKey(NAMES),
  });
  const built = buildBriefInput({
    briefDate: "2026-10-25",
    results: supplement.results,
    competitions: COMPETITIONS,
    linked: supplement.linked,
    unsettledComps: supplement.unsettledComps,
  });
  const input = canonicalizeBriefInput(built.input, NAMES, {
    playerTeams: PLAYER_TEAMS,
  }).input as BriefInput;

  it("16경기 보충(두 팀 대응표 5 · 한쪽 팀 대응표 11) · 3경기는 대응표가 두 팀을 모두 몰라 잇지 않음 → 결과 지연 3", () => {
    expect(supplement.results).toHaveLength(16);
    expect(supplement.by).toEqual({ "team-ids": 5, evidence: 11 });
    // 세리에 A 13:00 두 경기(칼리아리–볼로냐 · 코모–사수올로) · 라리가 14:15 라싱 산탄데르–에스파뇰
    expect(supplement.unlinked).toEqual([
      "990003:unconfirmed",
      "990004:unconfirmed",
      "990012:unconfirmed",
    ]);
    expect(supplement.noCandidate).toBe(0);
    expect(supplement.invalidScore).toEqual([]);
    expect(supplement.awaiting).toBe(3);
    expect([...supplement.unsettledComps].sort()).toEqual([
      "BUNDESLIGA",
      "EPL",
      "LALIGA",
      "LIGUE1",
      "SERIEA",
    ]);
  });

  it("보충 경기의 스코어 = 연결한 API-Football 종료 결과(원장 ft), 경기 id·팀은 football-data", () => {
    const ledgerFt = new Map(
      LEDGER_1024.matches.map((m) => [Number(m.id.slice(3)), m.ft] as const),
    );
    for (const r of supplement.results) {
      expect(r.provider).toBe("football-data");
      expect(r.matchId).toBeGreaterThanOrEqual(990001);
      expect(r.score.ft).toEqual(ledgerFt.get(r.supplementedFrom!));
      expect(r.score.duration).toBe("REGULAR");
      expect(r.score.regular).toEqual(r.score.ft);
      const fd = STALE.unsettled.find((m) => m.matchId === r.matchId)!;
      expect(r.home).toEqual(fd.home);
      expect(r.away).toEqual(fd.away);
    }
    // 킥오프 11:30 아스톤 빌라 2-1 맨체스터 시티(af-1557438)
    const villa = supplement.results.find((r) => r.matchId === 990001)!;
    expect(villa.supplementedFrom).toBe(1557438);
    expect(villa.score.ft).toEqual(score(2, 1));
  });

  it("브리핑 입력에 16경기 — 근거 id m<football-data id>, ft 'h-a', 득점자(goalsComplete) 채움, 순위 없음(결과 지연 대회)", () => {
    expect(input.matches).toHaveLength(16);
    expect(input.matches.every((m) => /^m9900\d\d$/.test(m.id))).toBe(true);
    const villa = input.matches.find((m) => m.id === "m990001")!;
    expect(villa).toMatchObject({
      comp: "Premier League",
      round: "Matchday 8",
      ft: "2-1",
    });
    expect(villa.goals?.length).toBe(3);
    expect(built.goals).toEqual({ filled: 16, incomplete: 0 });
    expect(input.standings).toEqual([]);
    expect(
      briefEmptyReason({
        inputMatches: input.matches.length,
        awaiting: supplement.awaiting,
        afFinished: afFinishedInWindow(AF_DETAILS_1024, WINDOW_1024),
      }),
    ).toBeNull();
  });

  it("그날 순위를 받았더라도 보충·결과 지연 대회의 순위는 넣지 않는다(football-data 순위표에 그 결과가 없다)", () => {
    const fake: CompStandings = {
      comp: "EPL",
      season: 2026,
      currentMatchday: 8,
      tables: [
        {
          stage: "REGULAR_SEASON",
          group: null,
          rows: [
            {
              pos: 1,
              team: { id: 57, name: "Arsenal", fullName: null },
              played: 7,
              w: 5,
              d: 1,
              l: 1,
              pts: 16,
              gf: 12,
              ga: 5,
              gd: 7,
            },
          ],
        },
      ],
      fetchedAt: "2026-10-24T23:42:33.000Z",
      inProgress: 0,
    };
    const withStandings = buildBriefInput({
      briefDate: "2026-10-25",
      results: supplement.results,
      competitions: COMPETITIONS,
      standings: [fake],
      linked: supplement.linked,
      unsettledComps: supplement.unsettledComps,
    });
    expect(withStandings.input.standings).toEqual([]);
    expect(withStandings.standings.unsettled).toEqual(["EPL"]);
  });

  it("검사기(brief-check)는 보충 경기도 입력 사실로 대조한다 — 템플릿 줄은 통과, 스코어를 바꾼 줄은 강등", () => {
    const tctx = {
      competitions: COMPETITIONS,
      names: briefNamesFromIndex(NAMES),
    };
    const form = chooseBriefCompForm(input, tctx);
    const lines = [
      ...templateBriefLines(input, tctx),
      ...input.matches.flatMap(
        (m) => templateMatchLine(m, { ...tctx, compForm: form }) ?? [],
      ),
    ];
    expect(lines.length).toBeGreaterThan(16);
    const ctx = { names: NAMES, competitions: COMPETITIONS };
    const res = checkBriefOutput(
      lines.map((l) => ({ t: l.text, r: l.refs })),
      input as BriefCheckInput,
      ctx,
    );
    expect(res.whole.ok).toBe(true);
    res.lines.forEach((l, i) => {
      expect(l.ok, `${lines[i]!.text} → ${describeLineCheck(l)}`).toBe(true);
    });
    // 아스톤 빌라 2-1 → 1-2로 바꾼 줄(입력에 없는 사실)은 통과하지 않는다
    const villaLine = templateMatchLine(
      input.matches.find((m) => m.id === "m990001")!,
      { ...tctx, compForm: form },
    )!;
    expect(villaLine.text).toContain("2-1");
    const wrong = checkBriefOutput(
      [{ t: villaLine.text.replace("2-1", "1-2"), r: villaLine.refs }],
      input as BriefCheckInput,
      ctx,
    );
    expect(wrong.lines[0]!.ok).toBe(false);
  });

  it("줄 대회(comps — D58)도 보충 경기 근거로 계산된다", () => {
    const tctx = {
      competitions: COMPETITIONS,
      names: briefNamesFromIndex(NAMES),
    };
    const lines = templateBriefLines(input, tctx);
    const { lines: withComps, error } = briefLinesWithComps(
      lines,
      input,
      COMPETITIONS,
    );
    expect(error).toBeNull();
    expect(withComps.length).toBeGreaterThan(0);
    expect(withComps.every((l) => (l.comps?.length ?? 0) > 0)).toBe(true);
  });

  it("API-Football 상세도 없으면(둘 다 미종료) 보충 0 · 결과 지연(results-pending)", () => {
    const none = supplementBriefResults({
      unsettled: STALE.unsettled,
      details: [],
      usedAf: new Set(),
      index: TEAM_INDEX,
      autoLink: true,
    });
    expect(none.results).toEqual([]);
    expect(none.awaiting).toBe(19);
    expect(none.noCandidate).toBe(19);
    expect(
      briefEmptyReason({
        inputMatches: 0,
        awaiting: none.awaiting,
        afFinished: 0,
      }),
    ).toBe("results-pending");
  });
});

// ─── 결과 지연 판정 ─────────────────────────────────────────────────────

describe("briefEmptyReason · afFinishedInWindow — empty의 이유", () => {
  it("입력 경기가 있으면 null · 0이고 기다리는 경기나 창 안 API-Football 종료 상세가 있으면 results-pending · 둘 다 없으면 no-matches", () => {
    expect(
      briefEmptyReason({ inputMatches: 3, awaiting: 5, afFinished: 5 }),
    ).toBeNull();
    expect(
      briefEmptyReason({ inputMatches: 0, awaiting: 1, afFinished: 0 }),
    ).toBe("results-pending");
    // football-data가 경기를 아예 모를 때 — API-Football 종료 상세가 경기가 있었다는 근거
    expect(
      briefEmptyReason({ inputMatches: 0, awaiting: 0, afFinished: 2 }),
    ).toBe("results-pending");
    expect(
      briefEmptyReason({ inputMatches: 0, awaiting: 0, afFinished: 0 }),
    ).toBe("no-matches");
  });

  it("창 [start, end) 안 6개 대회 상세만 센다 — 창 밖·대상 밖(comp null)은 빼고 끝 시각은 포함하지 않는다", () => {
    expect(afFinishedInWindow(AF_DETAILS_1024, WINDOW_1024)).toBe(19);
    expect(
      afFinishedInWindow(
        [
          detail({ matchId: 1, kickoff: "2026-10-24T00:00:00.000Z" }),
          detail({ matchId: 2, kickoff: "2026-10-25T00:00:00.000Z" }),
          detail({ matchId: 3, kickoff: "2026-10-23T23:59:00.000Z" }),
          detail({ matchId: 4, comp: null }),
        ],
        WINDOW_1024,
      ),
    ).toBe(1);
  });

  it("void 경기(연기·취소)만 있으면 보충하지 않고 결과 지연으로도 세지 않는다 → no-matches", () => {
    const voids = [
      pending({ matchId: 1, state: "void", status: "POSTPONED" }),
      pending({ matchId: 2, state: "void", status: "CANCELLED" }),
    ];
    const s = supplementBriefResults({
      unsettled: voids,
      details: [detail({ matchId: 11 })],
      usedAf: new Set(),
      index: MINI_INDEX,
      autoLink: true,
    });
    expect(s.results).toEqual([]);
    expect(s.awaiting).toBe(0);
    expect(s.unsettledComps.size).toBe(0);
    expect(
      briefEmptyReason({
        inputMatches: 0,
        awaiting: s.awaiting,
        afFinished: 0,
      }),
    ).toBe("no-matches");
  });

  it("연장·승부차기 보충 경기는 입력에 aet·regular·pens로 들어간다(football-data 승부차기 결과와 같은 표기)", () => {
    const s = supplementBriefResults({
      unsettled: [
        pending({ matchId: 1, stage: "LAST_16", matchday: null }),
        pending({
          matchId: 2,
          kickoff: "2026-10-24T19:00:00Z",
          stage: "LAST_16",
          matchday: null,
        }),
      ],
      details: [
        detail({
          matchId: 11,
          status: "PEN",
          score: {
            ft: score(1, 1),
            ht: score(0, 0),
            regular: score(1, 1),
            pens: score(4, 3),
            duration: "PENALTY_SHOOTOUT",
          },
        }),
        detail({
          matchId: 12,
          kickoff: "2026-10-24T19:00:00.000Z",
          status: "AET",
          score: {
            ft: score(2, 1),
            ht: score(1, 0),
            regular: score(1, 1),
            pens: null,
            duration: "EXTRA_TIME",
          },
        }),
      ],
      usedAf: new Set(),
      index: MINI_INDEX,
      autoLink: true,
    });
    const { input } = buildBriefInput({
      briefDate: "2026-10-25",
      results: s.results,
      competitions: COMPETITIONS,
      linked: s.linked,
      unsettledComps: s.unsettledComps,
    });
    const byId = new Map(input.matches.map((m) => [m.id, m] as const));
    expect(byId.get("m1")).toMatchObject({
      round: "LAST_16",
      ft: "1-1",
      aet: true,
      regular: "1-1",
      pens: "4-3",
    });
    expect(byId.get("m2")).toMatchObject({
      ft: "2-1",
      aet: true,
      regular: "1-1",
    });
    expect(byId.get("m2")).not.toHaveProperty("pens");
  });
});
