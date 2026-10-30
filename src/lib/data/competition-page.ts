/**
 * 대회 페이지 데이터 — `/competitions/[comp]/` 한 장을 그릴 값을 모은다 (PRD FR-40~45, plan M2-10·M2-11)
 *
 * 읽는 것: 대회 설정(`configs/competitions.json` — 이름·구간), 대회 데이터(`data/competitions/{comp}.json` — 공용 로더),
 * 표기 사전(`configs/names.ko.json` — 팀 한글명·선수 한글명), 팀 배지(`configs/team-colors.json` — 키트 2색·약어).
 * 계산은 순수 화면 모델(src/lib/competition-view.ts)이 하고, 이 모듈은 파일을 읽어 넘기기만 한다. 빌드 때(서버 컴포넌트)만 쓴다 —
 * node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 *
 * 팀 배지 조회(`loadTeamLookup`)는 M2-13 팀 화면·M2-14 오늘 밤·M2-15 순위 미니도 같은 함수를 쓴다(한글명 + 키트 2색·약어).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { loadCompetitionData } from "@/lib/data/competition-data";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { readConfigFile } from "@/lib/data/config-file";
import { loadTagLabels, NAMES_KO_PATH } from "@/lib/data/names";
import {
  fallbackTeamName,
  type TeamLookup,
  type TeamView,
} from "@/lib/competition-view";
import {
  displayNameIndex,
  koreanDisplayName,
  type DisplayNameIndex,
} from "@/lib/name-fold";
import type { CompId } from "@/lib/schema/common";
import type { CompetitionFile } from "@/lib/schema/competition";
import {
  TeamColorsFileSchema,
  type CompetitionConfig,
} from "@/lib/schema/configs";
import { NamesKoFileSchema } from "@/lib/schema/names";

/** 팀 배지 설정 위치(저장소 루트 기준) */
export const TEAM_COLORS_PATH = path.resolve("configs/team-colors.json");

/** 팀 slug → 한글명 + 배지(머리 주석). 색 표에 없는 팀은 폴백 배지(색·약어 없음), 사전에 없는 팀은 slug를 편 원어 */
export function loadTeamLookup(
  colorsFile: string = TEAM_COLORS_PATH,
  namesFile: string = NAMES_KO_PATH,
): TeamLookup {
  const colors = readConfigFile(
    colorsFile,
    TeamColorsFileSchema,
    "팀 배지 설정",
    {},
  );
  const labels = loadTagLabels(namesFile);
  const cache = new Map<string, TeamView>();
  return (slug) => {
    const hit = cache.get(slug);
    if (hit) return hit;
    const ko = labels.label("team", slug);
    const badge = colors[slug];
    const view: TeamView = {
      slug,
      name: ko ?? fallbackTeamName(slug),
      latin: ko === null,
      short: badge?.short ?? "",
      colors: badge ? badge.colors : null,
    };
    cache.set(slug, view);
    return view;
  };
}

const playerIndexCache = new Map<string, DisplayNameIndex>();

/** 선수 영문 표기 → 한글(사전 별칭 정확 일치만 — D63 ①). 사전이 없으면 늘 null(원어) */
export function loadPlayerNameLookup(
  namesFile: string = NAMES_KO_PATH,
): (en: string) => string | null {
  let index = playerIndexCache.get(namesFile);
  if (!index) {
    index = new Map();
    if (existsSync(namesFile)) {
      const where = path.relative(process.cwd(), namesFile) || namesFile;
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(namesFile, "utf8"));
      } catch (error) {
        throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
      }
      const parsed = NamesKoFileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `${where}: 표기 사전 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
        );
      }
      index = displayNameIndex(parsed.data.entries, "player");
    }
    playerIndexCache.set(namesFile, index);
  }
  const found = index;
  return (en) => koreanDisplayName(found, en);
}

export interface CompetitionPageData {
  config: CompetitionConfig;
  /** 데이터 파일 — 없으면 null(빈 상태) */
  data: CompetitionFile | null;
  /** 6개 대회 설정(대회 이동 — 설정 순서) */
  all: readonly CompetitionConfig[];
  team: TeamLookup;
  playerName: (en: string) => string | null;
}

/** 대회 페이지 한 장의 입력 — 설정에 없는 대회면 null(페이지가 notFound) */
export function loadCompetitionPage(comp: CompId): CompetitionPageData | null {
  const all = loadCompetitionsConfig();
  const config = all.find((c) => c.id === comp);
  if (!config) return null;
  return {
    config,
    data: loadCompetitionData(comp),
    all,
    team: loadTeamLookup(),
    playerName: loadPlayerNameLookup(),
  };
}
