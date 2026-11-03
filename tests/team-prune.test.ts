/**
 * 지난 시즌 팀 파일 정리 (M5-11 — 2026-11-03 사용자 결정 ② A, `build-teams --prune`, /new-season B10).
 * 계획은 순수 함수 `planTeamPrune`(scripts/lib/team-files.ts), 목록·삭제는 team-files-io.ts(임시 폴더로 확인 — data/는 건드리지 않는다).
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TeamIdsFile } from "@/lib/schema";

import { TEAM_PRUNE_MAX_SHARE, planTeamPrune } from "../scripts/lib/team-files";
import {
  listTeamFileSlugs,
  removeTeamFile,
  teamsDir,
} from "../scripts/lib/team-files-io";

const ids = (slugs: string[]): TeamIdsFile =>
  Object.fromEntries(slugs.map((s, i) => [s, { fd: i + 1, af: i + 101 }]));

/** 이번 시즌 팀 8개(a~h) */
const SEASON = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("planTeamPrune — 팀 표·team-ids 둘 다에 없는 파일만 지운다", () => {
  it("강등 팀을 대응표에서 뺐으면 지우고, 대응표에 남아 있으면 이유와 함께 남긴다", () => {
    const plan = planTeamPrune({
      files: [...SEASON, "old-1", "old-2"],
      seasonSlugs: SEASON,
      teamIds: ids([...SEASON, "old-2"]),
    });
    expect(plan.blocked).toBeNull();
    expect(plan.remove).toEqual(["old-1"]);
    expect(plan.keep).toEqual([
      {
        slug: "old-2",
        reason: expect.stringMatching(/team-ids\.json에 남아 있음/),
      },
    ]);
  });

  it("지난 시즌 팀이 없으면 할 일 없음", () => {
    expect(
      planTeamPrune({
        files: SEASON,
        seasonSlugs: SEASON,
        teamIds: ids(SEASON),
      }),
    ).toEqual({ remove: [], keep: [], blocked: null });
  });

  it(`전체의 ${TEAM_PRUNE_MAX_SHARE * 100}%를 넘게 지우게 되면 멈춘다(설정 오류 — 아무것도 지우지 않음)`, () => {
    const plan = planTeamPrune({
      files: [...SEASON, "x", "y", "z"], // 3/11 = 27%
      seasonSlugs: SEASON,
      teamIds: ids(SEASON),
    });
    expect(plan.remove).toEqual([]);
    expect(plan.blocked).toMatch(/지울 파일 3개가 전체 11개의 25%를 넘음/);
    // 경계: 2/10 = 20%는 통과
    expect(
      planTeamPrune({
        files: [...SEASON, "x", "y"],
        seasonSlugs: SEASON,
        teamIds: ids(SEASON),
      }).remove,
    ).toEqual(["x", "y"]);
  });

  it("팀 표나 대응표가 비면 멈춘다", () => {
    expect(
      planTeamPrune({ files: ["a"], seasonSlugs: [], teamIds: ids(["a"]) })
        .blocked,
    ).toMatch(/비어 있음/);
    expect(
      planTeamPrune({ files: ["a"], seasonSlugs: ["a"], teamIds: {} }).blocked,
    ).toMatch(/비어 있음/);
  });
});

describe("listTeamFileSlugs · removeTeamFile — 임시 폴더", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-prune-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("slug 형식의 .json만 이름 순으로, 폴더가 없으면 빈 배열", async () => {
    expect(await listTeamFileSlugs(dataDir)).toEqual([]);
    mkdirSync(teamsDir(dataDir), { recursive: true });
    for (const name of [
      "b.json",
      "a-c.json",
      "README.md",
      "Bad.json",
      "x.json.tmp",
    ]) {
      writeFileSync(path.join(teamsDir(dataDir), name), "{}");
    }
    expect(await listTeamFileSlugs(dataDir)).toEqual(["a-c", "b"]);
  });

  it("지정한 팀 파일만 지우고, slug 형식이 아니면 던진다(경로 밖 삭제 방지)", async () => {
    mkdirSync(teamsDir(dataDir), { recursive: true });
    writeFileSync(path.join(teamsDir(dataDir), "old-1.json"), "{}");
    writeFileSync(path.join(teamsDir(dataDir), "keep.json"), "{}");
    await removeTeamFile(dataDir, "old-1");
    expect(existsSync(path.join(teamsDir(dataDir), "old-1.json"))).toBe(false);
    expect(existsSync(path.join(teamsDir(dataDir), "keep.json"))).toBe(true);
    await expect(removeTeamFile(dataDir, "../keep")).rejects.toThrow(
      /slug 형식이 아님/,
    );
  });
});
