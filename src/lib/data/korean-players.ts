/**
 * 한국 선수 데이터 로더 — `data/players/korean.json`(현황 — M3-03 파생 파일) + 목록 화면 입력 (PRD FR-61, plan M3-09)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다. 화면은 원장(`data/matches`)을
 * 읽지 않는다(D33 ④) — 이 파생 파일만 읽는다.
 *
 * 규칙(팀·대회 데이터 로더와 같은 원칙)
 * - 파일이 없으면 null — 화면은 설정의 명단만 '기록 연결 전'으로 그린다(지어낸 값 없음).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패 — 깨진 데이터로 조용히 틀린 화면을 배포하지 않는다).
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시). 테스트는 다른 경로를 준다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { dataSourceOf, type DataSourceView } from "@/lib/data-source";
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { readConfigFile } from "@/lib/data/config-file";
import { NAMES_KO_PATH } from "@/lib/data/names";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { lastNightView, type LastNightView } from "@/lib/korean-last-night";
import { rosterView, type RosterView } from "@/lib/korean-players-view";
import { displayNameIndex, koreanDisplayName } from "@/lib/name-fold";
import { NamesKoFileSchema } from "@/lib/schema/names";
import {
  KoreanPlayersDataFileSchema,
  type KoreanPlayersDataFile,
} from "@/lib/schema/player";

/** 한국 선수 현황 파일 위치(저장소 루트 기준) */
export const KOREAN_PLAYERS_DATA_PATH = path.resolve("data/players/korean.json");

const dataCache = new Map<string, KoreanPlayersDataFile | null>();

/** 현황 파일 — 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
export function loadKoreanPlayersData(
  file: string = KOREAN_PLAYERS_DATA_PATH,
): KoreanPlayersDataFile | null {
  if (dataCache.has(file)) return dataCache.get(file) ?? null;
  let value: KoreanPlayersDataFile | null = null;
  if (existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = KoreanPlayersDataFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: 한국 선수 현황 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    value = parsed.data;
  }
  dataCache.set(file, value);
  return value;
}

/** 사전의 한 유형(팀·대회) — 영문 원문 → 한글(정확 일치만 — D63 ①) */
export function nameLookup(
  kind: "team" | "competition",
  namesFile: string,
): (en: string) => string | null {
  const names = readConfigFile(namesFile, NamesKoFileSchema, "표기 사전", {
    entries: [],
    ignore: [],
  });
  const index = displayNameIndex(names.entries, kind);
  return (en) => koreanDisplayName(index, en);
}

/** `/korean-players/` 한 장의 화면 모델(설정 순서 · 대회 설정 · 팀 배지 · 사전을 모아 순수 모델에 넘긴다) */
export function loadRosterView(
  dataFile: string = KOREAN_PLAYERS_DATA_PATH,
  namesFile: string = NAMES_KO_PATH,
): RosterView {
  return rosterView({
    players: loadKoreanPlayers(),
    data: loadKoreanPlayersData(dataFile),
    competitions: loadCompetitionsConfig().map((c) => ({
      id: c.id,
      short: c.shortKo,
      name: c.nameKo,
    })),
    team: loadTeamLookup(),
    teamNameKo: nameLookup("team", namesFile),
    competitionNameKo: nameLookup("competition", namesFile),
  });
}

/** 출처 줄 값 — 현황 파일 생성 시각 · 업데이트 지연(빌드 시각 `now` 기준 — src/lib/data-source.ts 규칙) */
export function loadRosterSource(
  view: Pick<RosterView, "generatedAt">,
  now: Date = new Date(),
): DataSourceView {
  return dataSourceOf([view.generatedAt], now.getTime());
}

/**
 * 홈 "어젯밤 한국 선수"(M3-11 — FR-58) — 최신 호 발행일의 브리핑 창(발행일 − 1 UTC 하루)에 경기가 있던 등록 선수. 호가 없거나 실을 선수가
 * 없으면 null(위젯 숨김 — src/lib/korean-last-night.ts)
 */
export function loadLastNight(
  issueDate: string | null,
  dataFile: string = KOREAN_PLAYERS_DATA_PATH,
  namesFile: string = NAMES_KO_PATH,
): LastNightView | null {
  if (issueDate === null) return null;
  return lastNightView({
    players: loadKoreanPlayers(),
    data: loadKoreanPlayersData(dataFile),
    issueDate,
    competitions: loadCompetitionsConfig().map((c) => ({
      id: c.id,
      short: c.shortKo,
      name: c.nameKo,
    })),
    team: loadTeamLookup(),
    teamNameKo: nameLookup("team", namesFile),
    competitionNameKo: nameLookup("competition", namesFile),
  });
}
