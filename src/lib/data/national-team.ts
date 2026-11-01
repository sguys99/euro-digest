/**
 * 대표팀 설정 로더 — `configs/national-team.json` (PRD FR-70~73, plan M3-05). 화면 연결(홈 대표팀 섹션·`/national-team`)은 M3-13.
 *
 * 규칙은 src/lib/data/config-file.ts `readConfigFile`(없으면 null, 깨지면 던짐 — 빌드 실패, 프로세스 안 캐시).
 * 파일이 없으면 대표팀 일정·명단을 숨기고 A매치 기간도 판정하지 않는다(근거 없는 노출 금지 — rest-period.ts와 같은 원칙).
 * 기간 판정은 순수 함수(src/lib/national-team.ts), 기준 날짜는 빌드 시각의 KST 날짜(테스트는 `now`를 주입한다).
 */
import path from "node:path";

import { nationalWindowOn, type NationalWindow } from "@/lib/national-team";
import {
  NationalTeamFileSchema,
  type NationalMatch,
  type NationalTeamFile,
} from "@/lib/schema/configs";
import { kstDate, nowUtcIso } from "@/lib/time";

import { readConfigFile } from "./config-file";

/** 대표팀 설정 위치(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const NATIONAL_TEAM_PATH = path.resolve("configs/national-team.json");

/** 대표팀 설정 전체 — 파일이 없으면 null */
export function loadNationalTeamConfig(
  file: string = NATIONAL_TEAM_PATH,
): NationalTeamFile | null {
  return readConfigFile(
    file,
    NationalTeamFileSchema.nullable(),
    "대표팀 설정",
    null,
  );
}

/** 빌드 시각 기준 A매치 기간 판정 결과 */
export interface NationalTeamToday {
  /** 기준 날짜(빌드 시각의 KST 날짜) */
  date: string;
  /** 그날이 든 A매치 기간 — 평시·설정 없음이면 null */
  window: NationalWindow | null;
  /** 그 기간의 경기(경기일 순 — `window.matchIds` 순서) — 평시면 빈 배열 */
  matches: NationalMatch[];
}

/** 빌드 시각(`now`)의 KST 날짜가 A매치 기간인지와 그 기간의 경기(FR-71 — 홈 대표팀 섹션 자동 노출 입력) */
export function loadNationalTeamToday(
  now: Date = new Date(),
  file: string = NATIONAL_TEAM_PATH,
): NationalTeamToday {
  const date = kstDate(nowUtcIso(now));
  const config = loadNationalTeamConfig(file);
  if (config === null) return { date, window: null, matches: [] };
  const window = nationalWindowOn(date, config.matches);
  if (window === null) return { date, window: null, matches: [] };
  const byId = new Map(config.matches.map((m) => [m.id, m]));
  const matches = window.matchIds
    .map((id) => byId.get(id))
    .filter((m): m is NationalMatch => m !== undefined);
  return { date, window, matches };
}
