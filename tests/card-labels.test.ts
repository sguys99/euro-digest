/**
 * M1-31 — 뉴스 카드 표시 이름 로더(src/lib/data/card-labels.ts): 대회 약칭·한국 선수·태그 한글을 설정에서 읽는다.
 *   - 실제 configs: 6대회 약칭(D30 확정값)·한국 선수 slug
 *   - 파일 없음 → 빈 표(표시만 빠지고 slug·ID를 보이지 않음) · JSON·스키마 오류 → 던짐(빌드 실패 — names.ts와 같은 원칙)
 * 네트워크 없음(임시 폴더만).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadCardLabels,
  loadCompetitionLabels,
  loadKoreanPlayerSlugs,
} from "@/lib/data/card-labels";

const dir = mkdtempSync(path.join(tmpdir(), "card-labels-"));
const missing = path.join(dir, "missing.json");

function write(name: string, body: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, body);
  return file;
}

describe("loadCompetitionLabels", () => {
  it("실제 configs/competitions.json — 6대회 약칭·정식 이름(D30)", () => {
    const map = loadCompetitionLabels();
    expect(Object.fromEntries(map)).toEqual({
      EPL: { short: "EPL", name: "프리미어리그" },
      LALIGA: { short: "라리가", name: "라리가" },
      SERIEA: { short: "세리에A", name: "세리에 A" },
      BUNDESLIGA: { short: "분데스", name: "분데스리가" },
      LIGUE1: { short: "리그1", name: "리그 1" },
      UCL: { short: "UCL", name: "UEFA 챔피언스리그" },
    });
  });

  it("파일이 없으면 빈 표, 깨졌으면 던진다", () => {
    expect(loadCompetitionLabels(missing).size).toBe(0);
    expect(() => loadCompetitionLabels(write("bad-comp.json", "{"))).toThrow(
      /JSON을 읽을 수 없음/,
    );
    expect(() =>
      loadCompetitionLabels(write("bad-comp-schema.json", '[{"id":"X"}]')),
    ).toThrow(/대회 설정 스키마 검증 실패/);
  });
});

describe("loadKoreanPlayerSlugs", () => {
  it("실제 configs/korean-players.json — 등록 선수 slug", () => {
    const slugs = loadKoreanPlayerSlugs();
    expect(slugs.has("lee-kang-in")).toBe(true);
    expect(slugs.has("kim-min-jae")).toBe(true);
    expect(slugs.has("dominic-solanke")).toBe(false);
  });

  it("파일이 없으면 빈 집합, 깨졌으면 던진다", () => {
    expect(loadKoreanPlayerSlugs(missing).size).toBe(0);
    expect(() =>
      loadKoreanPlayerSlugs(write("bad-kr.json", '[{"slug":1}]')),
    ).toThrow(/한국 선수 설정 스키마 검증 실패/);
  });
});

describe("loadCardLabels", () => {
  it("세 설정을 하나로 묶는다", () => {
    const labels = loadCardLabels();
    expect(labels.competition("SERIEA")).toEqual({
      short: "세리에A",
      name: "세리에 A",
    });
    expect(labels.isKoreanPlayer("seol-young-woo")).toBe(true);
    expect(labels.tags.label("player", "kim-min-jae")).toBe("김민재");
  });

  it("설정 파일이 모두 없어도 빈 표로 동작한다", () => {
    const labels = loadCardLabels({
      names: missing,
      competitions: path.join(dir, "missing-comp.json"),
      koreanPlayers: path.join(dir, "missing-kr.json"),
    });
    expect(labels.competition("EPL")).toBeNull();
    expect(labels.isKoreanPlayer("lee-kang-in")).toBe(false);
    expect(labels.tags.label("team", "chelsea")).toBeNull();
  });
});
