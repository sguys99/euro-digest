/**
 * "오늘 밤 볼 경기" 로더 (PRD F8 FR-80~82, plan M2-08) — 설정·대회 데이터를 읽어 순수 선별 함수(`src/lib/tonight.ts`)를 부른다.
 *
 * 빌드 때(서버 컴포넌트 — `/tonight`·홈 섹션, M2-14) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 *
 * 규칙(설정 로더 `config-file.ts`·뉴스 로더 `news.ts`와 같은 원칙)
 * - `configs/bigmatch-rules.json`이 없으면 선별 없음(picks 빈 배열 — 화면은 빈 상태), 깨졌으면 던진다(빌드 실패).
 * - `configs/korean-players.json`이 없으면 한국 선수 규칙만 빠진다, 깨졌으면 던진다.
 * - 대회 데이터 `data/competitions/{comp}.json`은 공용 로더(src/lib/data/competition-data.ts `loadAllCompetitionData` — M2-10)로
 *   `configs/competitions.json` 순서로 읽는다 — 없는 대회는 건너뛰고(CI·첫 수집 전), 깨졌으면 던진다(깨진 데이터로 조용히 틀린 선별을
 *   배포하지 않는다).
 * - 기준 날짜는 빌드 시각의 KST 날짜(`tonightBaseDate`). 테스트는 `now`를 주입한다.
 */
import path from "node:path";

import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { readConfigFile } from "@/lib/data/config-file";
import { BigmatchRulesFileSchema, KoreanPlayersFileSchema } from "@/lib/schema";
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

export interface TonightPaths {
  rules?: string;
  koreanPlayers?: string;
  competitions?: string;
  dataDir?: string;
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
  // 대회 데이터는 공용 로더(src/lib/data/competition-data.ts — M2-10)로 읽고 선별에 필요한 칸만 넘긴다
  const competitions: TonightCompetition[] = loadAllCompetitionData({
    competitions: paths.competitions,
    dataDir: paths.dataDir,
  }).map(({ comp, standings, matches }) => ({ comp, standings, matches }));
  return selectTonight({ rules, competitions, koreanPlayers, baseKstDate });
}
