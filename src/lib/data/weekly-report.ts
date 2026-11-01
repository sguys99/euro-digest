/**
 * 한국 선수 주간 리포트 로더 — `data/players/weekly/{yyyy-ww}.json`(PRD FR-90~93, plan M3-12)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 *
 * 규칙(한국 선수 현황 로더와 같은 원칙)
 * - 폴더가 없거나 비었으면 발행된 주가 없다(빈 배열) — 색인은 빈 상태, `[week]` 라우트는 자리 주차 하나만 만들고 not-found를 그린다.
 * - 파일 이름이 주차 형식(`YYYY-WW.json`)이 아니면 무시한다. 파일 내용이 JSON·스키마 검증에 실패하거나 이름과 `week`가 다르면 **던진다**
 *   (빌드 실패 — 깨진 데이터로 조용히 틀린 화면을 배포하지 않는다).
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시). 테스트는 다른 폴더를 준다.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import {
  loadKoreanPlayersData,
  nameLookup,
  KOREAN_PLAYERS_DATA_PATH,
} from "@/lib/data/korean-players";
import { NAMES_KO_PATH } from "@/lib/data/names";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { WeeklyReportSchema, type WeeklyReport } from "@/lib/schema/player";
import {
  upcomingWeek,
  weeklyIndexEntry,
  weeklyReportView,
  type WeeklyIndexEntry,
  type WeeklyReportView,
  type WeeklyUpcomingView,
  type WeeklyViewContext,
} from "@/lib/weekly-report-view";

/** 주간 리포트 폴더(저장소 루트 기준 — scripts/lib/weekly-kr.ts WEEKLY_REPORT_DIR와 같은 곳) */
export const WEEKLY_REPORTS_DIR = path.resolve("data/players/weekly");

/** 파일이 하나도 없을 때 `[week]` 라우트가 만드는 자리 주차(정적 export는 빈 params를 받지 않는다) — 첫 발행 주(아카이브 첫 호) */
export const FIRST_WEEKLY_WEEK = "2026-43";

const FILE_RE = /^(\d{4}-(?:0[1-9]|[1-4]\d|5[0-3]))\.json$/;

/** 발행된 주차 전부(오름차순) — 파일 이름만 본다 */
export function listWeeklyWeeks(dir: string = WEEKLY_REPORTS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => FILE_RE.exec(name)?.[1])
    .filter((w): w is string => w !== undefined)
    .sort();
}

const reportCache = new Map<string, WeeklyReport | null>();

/** 그 주차 리포트 — 파일이 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
export function loadWeeklyReport(
  week: string,
  dir: string = WEEKLY_REPORTS_DIR,
): WeeklyReport | null {
  if (!/^\d{4}-\d{2}$/.test(week)) return null;
  const file = path.join(dir, `${week}.json`);
  if (reportCache.has(file)) return reportCache.get(file) ?? null;
  let value: WeeklyReport | null = null;
  if (existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = WeeklyReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: 주간 리포트 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    if (parsed.data.week !== week) {
      throw new Error(
        `${where}: 파일 이름 주차와 내용 week(${parsed.data.week})가 다름`,
      );
    }
    value = parsed.data;
  }
  reportCache.set(file, value);
  return value;
}

/** 화면 문맥(설정 · 현황 파일 · 대회 · 팀 배지 · 사전) */
export function loadWeeklyContext(
  dataFile: string = KOREAN_PLAYERS_DATA_PATH,
  namesFile: string = NAMES_KO_PATH,
): WeeklyViewContext {
  return {
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
  };
}

/** 아카이브 색인(최신 주 먼저) */
export function loadWeeklyIndex(
  dir: string = WEEKLY_REPORTS_DIR,
): WeeklyIndexEntry[] {
  const ctx = { players: loadKoreanPlayers() };
  return listWeeklyWeeks(dir)
    .reverse()
    .flatMap((week) => {
      const report = loadWeeklyReport(week, dir);
      return report ? [weeklyIndexEntry(report, ctx)] : [];
    });
}

export interface WeeklyPageData {
  view: WeeklyReportView;
  index: WeeklyIndexEntry[];
  upcoming: WeeklyUpcomingView | null;
}

/** 한 주 화면 입력 — 리포트가 없으면 null(페이지가 notFound). `now`는 빌드 시각(발행 예정 표시) */
export function loadWeeklyPage(
  week: string,
  now: Date,
  dir: string = WEEKLY_REPORTS_DIR,
): WeeklyPageData | null {
  const report = loadWeeklyReport(week, dir);
  if (!report) return null;
  const weeks = listWeeklyWeeks(dir);
  return {
    view: weeklyReportView(report, weeks, loadWeeklyContext(), now),
    index: loadWeeklyIndex(dir),
    upcoming: upcomingWeek(weeks.at(-1) ?? null, now),
  };
}
