/**
 * "오늘 밤 볼 경기" 로더 (PRD F8 FR-80~82, plan M2-08) — 설정·대회 데이터를 읽어 순수 선별 함수(`src/lib/tonight.ts`)를 부른다.
 *
 * 빌드 때(서버 컴포넌트 — `/tonight`·홈 섹션, M2-14) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 *
 * 규칙(설정 로더 `config-file.ts`·뉴스 로더 `news.ts`와 같은 원칙)
 * - `configs/bigmatch-rules.json`이 없으면 선별 없음(picks 빈 배열 — 화면은 빈 상태), 깨졌으면 던진다(빌드 실패).
 * - `configs/korean-players.json`이 없으면 한국 선수 규칙만 빠진다, 깨졌으면 던진다.
 * - 대회 데이터 `data/competitions/{comp}.json`(comp 소문자)은 `configs/competitions.json` 순서로 읽는다 — 없는 대회는 건너뛰고
 *   (CI·첫 수집 전), JSON·스키마 검증에 실패하면 던진다(깨진 데이터로 조용히 틀린 선별을 배포하지 않는다).
 * - 기준 날짜는 빌드 시각의 KST 날짜(`tonightBaseDate`). 테스트는 `now`를 주입한다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { COMPETITIONS_PATH, loadCompetitionsConfig } from "@/lib/data/competitions";
import { readConfigFile } from "@/lib/data/config-file";
import {
  BigmatchRulesFileSchema,
  CompetitionFileSchema,
  KoreanPlayersFileSchema,
} from "@/lib/schema";
import {
  selectTonight,
  tonightBaseDate,
  type TonightCompetition,
  type TonightResult,
} from "@/lib/tonight";

/** 선별 규칙 위치(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const BIGMATCH_RULES_PATH = path.resolve("configs/bigmatch-rules.json");
/** 한국 선수 설정 위치 */
export const TONIGHT_KOREAN_PLAYERS_PATH = path.resolve(
  "configs/korean-players.json",
);
/** 대회 데이터 디렉터리 */
export const COMPETITION_DATA_DIR = path.resolve("data/competitions");

export interface TonightPaths {
  rules?: string;
  koreanPlayers?: string;
  competitions?: string;
  dataDir?: string;
}

/** 대회 데이터 1개 — 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
function readCompetitionData(file: string): TonightCompetition | null {
  if (!existsSync(file)) return null;
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = CompetitionFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 대회 데이터 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  const { comp, standings, matches } = parsed.data;
  return { comp, standings, matches };
}

/** 로더 결과 — 선별 규칙 파일이 없으면 window null·picks 빈 배열(빈 상태) */
export type LoadedTonight = Omit<TonightResult, "window"> & {
  window: TonightResult["window"] | null;
};

/** 빌드 시각 기준 "오늘 밤 볼 경기"(머리 주석 규칙) */
export function loadTonight(
  now: Date = new Date(),
  paths: TonightPaths = {},
): LoadedTonight {
  const baseKstDate = tonightBaseDate(now.toISOString());
  const rules = readConfigFile(
    paths.rules ?? BIGMATCH_RULES_PATH,
    BigmatchRulesFileSchema.nullable(),
    "오늘 밤 선별 규칙",
    null,
  );
  if (rules === null) {
    return { baseKstDate, window: null, picks: [] };
  }
  const koreanPlayers = readConfigFile(
    paths.koreanPlayers ?? TONIGHT_KOREAN_PLAYERS_PATH,
    KoreanPlayersFileSchema,
    "한국 선수 설정",
    [],
  );
  const dataDir = paths.dataDir ?? COMPETITION_DATA_DIR;
  const competitions = loadCompetitionsConfig(
    paths.competitions ?? COMPETITIONS_PATH,
  )
    .map((c) =>
      readCompetitionData(path.join(dataDir, `${c.id.toLowerCase()}.json`)),
    )
    .filter((c): c is TonightCompetition => c !== null);
  return selectTonight({ rules, competitions, koreanPlayers, baseKstDate });
}
