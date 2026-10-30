import { describe, expect, it } from "vitest";

import { TeamSchema, TransferSchema, TransfersFileSchema } from "@/lib/schema";

import { REJECTED_URLS, at, issuePaths, passes, validFixture } from "./helpers";

describe("Transfer — data/transfers.json (부록 A, FR-100~106)", () => {
  const transfers = validFixture(TransfersFileSchema, "data/transfers.json");
  const transfer = at(transfers, 0);

  it("fixture가 통과한다", () => {
    expect(transfer.history).toHaveLength(2);
  });

  it("상태·Tier·이력 시각 형식을 검사한다", () => {
    expect(issuePaths(TransferSchema, { ...transfer, status: "done" })).toEqual(
      ["status"],
    );
    expect(issuePaths(TransferSchema, { ...transfer, bestTier: 4 })).toEqual([
      "bestTier",
    ]);
    expect(
      issuePaths(TransferSchema, {
        ...transfer,
        history: [{ ...at(transfer.history, 0), at: "2026-10-02" }],
      }),
    ).toEqual(["history.0.at"]);
  });

  it("quiet(FR-106)는 필수다", () => {
    expect(
      issuePaths(TransferSchema, { ...transfer, quiet: undefined }),
    ).toEqual(["quiet"]);
  });

  it("근거 카드 ID는 형식 검사를 하지 않는다 (결정 Q7 — 파이프라인 산출물)", () => {
    const history = [{ ...at(transfer.history, 0), card: "legacy-card" }];
    expect(passes(TransferSchema, { ...transfer, history })).toBe(true);
  });

  it("파일 안에서 id가 겹치면 실패한다", () => {
    expect(issuePaths(TransfersFileSchema, [transfer, transfer])).toEqual([
      "1.id",
    ]);
  });
});

describe("Team — data/teams/{team}.json (부록 A, F5)", () => {
  const team = validFixture(TeamSchema, "data/teams/sample-united.json");

  it("fixture가 통과하고 formation·profile·lineup은 null을 허용한다", () => {
    expect(
      passes(TeamSchema, {
        ...team,
        formation: null,
        profile: null,
        lineup: null,
      }),
    ).toBe(true);
  });

  it("alsoIn을 생략하면 []로 채운다", () => {
    const parsed = TeamSchema.parse({ ...team, alsoIn: undefined });
    expect(parsed.alsoIn).toEqual([]);
  });

  it("배지 약어는 4자 이내 (DR-05)", () => {
    expect(issuePaths(TeamSchema, { ...team, short: "SAMPL" })).toEqual([
      "short",
    ]);
  });

  it("colors는 정확히 2개", () => {
    expect(issuePaths(TeamSchema, { ...team, colors: ["#000000"] })).toEqual([
      "colors",
    ]);
    expect(
      issuePaths(TeamSchema, {
        ...team,
        colors: ["#000000", "#FFFFFF", "#FF0000"],
      }),
    ).toEqual(["colors"]);
  });

  it("주요 선수는 3명까지 (FR-54)", () => {
    const p = at(team.topPlayers, 0);
    expect(
      issuePaths(TeamSchema, { ...team, topPlayers: [p, p, p, p] }),
    ).toEqual(["topPlayers"]);
  });

  it("프로필: 한줄평 80자, 강점·약점 각 정확히 2개 (FR-53·FR-56)", () => {
    const profile = team.profile;
    if (!profile) throw new Error("fixture 프로필 없음");
    expect(
      issuePaths(TeamSchema, {
        ...team,
        profile: { ...profile, oneLiner: "가".repeat(81) },
      }),
    ).toEqual(["profile.oneLiner"]);
    expect(
      issuePaths(TeamSchema, {
        ...team,
        profile: { ...profile, strengths: ["하나"] },
      }),
    ).toEqual(["profile.strengths"]);
    expect(
      issuePaths(TeamSchema, {
        ...team,
        profile: { ...profile, weaknesses: ["a", "b", "c"] },
      }),
    ).toEqual(["profile.weaknesses"]);
  });

  it("포메이션 source는 api|manual, 더 읽을거리 URL 형식 검사", () => {
    const formation = team.formation;
    if (!formation) throw new Error("fixture 포메이션 없음");
    expect(
      issuePaths(TeamSchema, {
        ...team,
        formation: { ...formation, source: "guess" },
      }),
    ).toEqual(["formation.source"]);
    expect(
      issuePaths(TeamSchema, {
        ...team,
        reading: [{ ...at(team.reading, 0), url: "nope" }],
      }),
    ).toEqual(["reading.0.url"]);
  });

  it("slug·소속 한국 선수는 slug 형식, colors는 #RRGGBB (결정 Q7)", () => {
    expect(issuePaths(TeamSchema, { ...team, slug: "Sample_United" })).toEqual([
      "slug",
    ]);
    expect(
      issuePaths(TeamSchema, { ...team, koreanPlayers: ["Hong Gil-dong"] }),
    ).toEqual(["koreanPlayers.0"]);
    expect(
      issuePaths(TeamSchema, { ...team, colors: ["red", "#FFFFFF"] }),
    ).toEqual(["colors.0"]);
  });

  describe("팀시트 lineup (초안 M2-07 — PRD §15 D63 ②)", () => {
    const lineup = team.lineup;
    if (!lineup) throw new Error("fixture 팀시트 없음");

    it("fixture 팀시트가 통과한다 — 선발 11·교체 명단, 한국 선수만 korean slug", () => {
      expect(lineup.startXI).toHaveLength(11);
      expect(lineup.startXI.filter((p) => p.korean)).toEqual([
        expect.objectContaining({
          name: "Hong Gil-dong",
          korean: "hong-gil-dong",
        }),
      ]);
      expect(lineup.substitutes.every((p) => p.grid === null)).toBe(true);
    });

    it("없으면 null로 채운다(이전 파일 호환)", () => {
      const rest: Record<string, unknown> = { ...team };
      delete rest.lineup;
      expect(TeamSchema.parse(rest).lineup).toBeNull();
    });

    it("팀시트 포메이션은 formation.shape와 같아야 한다 — formation이 null이면 팀시트도 둘 수 없다", () => {
      expect(
        issuePaths(TeamSchema, {
          ...team,
          lineup: { ...lineup, formation: "4-3-3" },
        }),
      ).toEqual(["lineup.formation"]);
      expect(issuePaths(TeamSchema, { ...team, formation: null })).toEqual([
        "lineup.formation",
      ]);
    });

    it('선발은 정확히 11명, grid는 "줄:칸", 포지션 G·D·M·F, 경기 키 af-<id>, 상대가 자기 팀이면 거부', () => {
      expect(
        issuePaths(TeamSchema, {
          ...team,
          lineup: { ...lineup, startXI: lineup.startXI.slice(0, 10) },
        }),
      ).toEqual(["lineup.startXI"]);
      const p0 = at(lineup.startXI, 0);
      expect(
        issuePaths(TeamSchema, {
          ...team,
          lineup: {
            ...lineup,
            startXI: [
              { ...p0, grid: "1-1", pos: "GK" },
              ...lineup.startXI.slice(1),
            ],
          },
        }),
      ).toEqual(["lineup.startXI.0.pos", "lineup.startXI.0.grid"]);
      expect(
        issuePaths(TeamSchema, {
          ...team,
          lineup: { ...lineup, match: "1557439" },
        }),
      ).toEqual(["lineup.match"]);
      expect(
        issuePaths(TeamSchema, {
          ...team,
          lineup: { ...lineup, opponent: team.slug },
        }),
      ).toEqual(["lineup.opponent"]);
    });

    it("출전 시간 같은 선수 기록 키는 저장하지 않는다(D63 ② — 파싱 결과에서 빠진다)", () => {
      const parsed = TeamSchema.parse({
        ...team,
        lineup: {
          ...lineup,
          startXI: [
            { ...p0Of(lineup), minutes: 90 },
            ...lineup.startXI.slice(1),
          ],
        },
      });
      expect(Object.keys(at(parsed.lineup!.startXI, 0))).not.toContain(
        "minutes",
      );
    });
  });

  it.each(REJECTED_URLS)(
    "더 읽을거리 URL은 http/https만 (결정 Q3): %s",
    (url) => {
      const reading = [{ ...at(team.reading, 0), url }];
      expect(issuePaths(TeamSchema, { ...team, reading })).toEqual([
        "reading.0.url",
      ]);
    },
  );
});

function p0Of(lineup: { startXI: readonly unknown[] }): object {
  return at(lineup.startXI, 0) as object;
}
