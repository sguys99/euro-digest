/**
 * FR-64 '기타 리그' 처리 고정 (M3-04) — 5대 리그 밖으로 옮긴 선수는 `comp: "OTHER"` · `active: false`로 목록에 남고, 기록 수집·갱신만
 * 멈춘다. 레코드 동결(korean-players-data.ts)·키워드 제외(news-keywords.ts)·주간 리포트 제외(weekly-kr.ts)·교차 검사 제외
 * (validate-crossref.ts)는 각 모듈 테스트가 이미 고정한다. 여기서는 빠져 있던 둘 — API-Football 대상 선별(기타 리그 팀 경기를 받지
 * 않는다)·원장 추적 대상 — 과, 지금 설정(configs/korean-players.json)이 이 규칙과 팀 → 리그 표에 맞는지를 고정한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  TeamIdsFileSchema,
  type KoreanPlayersFile,
  type TeamIdsFile,
} from "@/lib/schema";

import { buildAfTargetConfig } from "../scripts/lib/api-football-plan";
import { koreanPlayerTargets } from "../scripts/lib/match-ledger";
import { TEAM_LEAGUE_INDEX } from "../scripts/lib/team-leagues";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const PLAYERS: KoreanPlayersFile = [
  {
    slug: "in-league",
    nameKo: "가",
    nameEn: "Ga In-league",
    team: "sample-united",
    comp: "EPL",
    position: "MF",
    birthYear: 2000,
    apiFootballId: 101,
    active: true,
  },
  {
    slug: "moved-away",
    nameKo: "나",
    nameEn: "Na Moved-away",
    team: "faraway-fc",
    comp: "OTHER",
    position: "FW",
    birthYear: 2001,
    apiFootballId: 102,
    active: false,
  },
];
const TEAM_IDS: TeamIdsFile = TeamIdsFileSchema.parse({
  "sample-united": { fd: 1, af: 11 },
  "faraway-fc": { fd: null, af: 22 },
});

describe("FR-64 — 기타 리그(비활성) 선수는 기록 수집 대상이 아니다", () => {
  it("API-Football 대상: 비활성 선수 소속팀의 경기는 고르지 않는다(af id가 있어도)", () => {
    const { targets, unmappedTeams } = buildAfTargetConfig({
      competitions: CompetitionsFileSchema.parse(
        readJson("configs/competitions.json"),
      ),
      koreanPlayers: PLAYERS,
      teamIds: TEAM_IDS,
    });
    expect([...targets.koreanTeamIds]).toEqual([11]);
    expect(unmappedTeams).toEqual([]);
  });

  it("원장 추적 대상: 비활성 선수는 추적·id 미확인 어느 쪽에도 없다", () => {
    const t = koreanPlayerTargets(PLAYERS, TEAM_IDS);
    expect(t.tracked.map((p) => p.slug)).toEqual(["in-league"]);
    expect(t.unidentified).toEqual([]);
  });
});

describe("FR-64 — 지금 설정이 규칙에 맞는다 (configs/korean-players.json)", () => {
  const players = KoreanPlayersFileSchema.parse(
    readJson("configs/korean-players.json"),
  );

  it("comp OTHER(기타 리그)인 선수는 모두 active:false — 목록에서 지우지 않는다", () => {
    const other = players.filter((p) => p.comp === "OTHER");
    expect(other.length).toBeGreaterThan(0);
    expect(other.filter((p) => p.active).map((p) => p.slug)).toEqual([]);
  });

  it("활성 선수의 comp = 소속팀의 5대 리그(팀 → 리그 표), 비활성 선수의 팀은 5대 리그 표 밖", () => {
    const wrong = players.flatMap((p) => {
      const league = TEAM_LEAGUE_INDEX.get(p.team) ?? null;
      if (p.active && league !== p.comp)
        return [`${p.slug}: ${p.comp} ≠ ${league}`];
      if (!p.active && p.comp === "OTHER" && league !== null) {
        return [`${p.slug}: OTHER인데 ${p.team}은 ${league}`];
      }
      return [];
    });
    expect(wrong).toEqual([]);
  });
});
