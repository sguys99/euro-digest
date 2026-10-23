/**
 * 일일 브리핑 로더 — `data/briefs/YYYY-MM-DD.json` "오늘의 5줄" (PRD §15 D38, plan M1-32)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 * 규칙 — 뉴스 로더(src/lib/data/news.ts)와 같다
 * - 파일 하나 = 발행일(KST) 하나. 홈은 **그 호(최신 뉴스 호)의 날짜** 파일만 읽는다 — 다른 날 브리핑을 오늘 호 맨 위에 싣지 않는다.
 * - 파일이 없으면 `null` — D38 전 호(2026-10-12~14)나 브리핑 파일을 만들지 않은 실행(정형 입력 없음·템플릿 줄 0 —
 *   scripts/lib/brief-file.ts `planBriefPublish` mode null)이다. 화면은 5줄 블록을 싣지 않는다(사실 없는 안내 금지) — 단 D38 뒤 호인데
 *   그날 게시 실행 기록이 있으면 5줄 자리에 오류 상태(M1-37 — `loadBriefSlot`, src/lib/brief-slot.ts).
 *   전날 경기가 없어 LLM을 부르지 않은 날은 파일이 있고 `mode: "empty"`다(D30 S4 — 블록을 두고 높이만 줄인다).
 * - JSON·스키마 검증에 실패하거나 내용의 `date`가 파일명과 다르면 **던진다**(빌드 실패). 깨진 브리핑을 건너뛰고 블록을 조용히
 *   빼면 잘못된 발행이 드러나지 않는다. 1차 방어는 커밋 전 발행 검증 게이트(M1-25 — 파이프라인이 쓰기 전에 같은 스키마로 검증,
 *   scripts/lib/brief-file.ts)이고 이것은 빌드 단계의 마지막 방어선이다(CLAUDE §6.1).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { briefSlotOf, type BriefSlot } from "@/lib/brief-slot";
import { loadProdRuns } from "@/lib/data/runs";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";

/** 파이프라인 산출물 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const BRIEFS_DIR = path.resolve("data/briefs");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 발행일(KST "YYYY-MM-DD") 하나의 브리핑. 파일이 없으면 `null`, 깨졌거나 `date`가 파일명과 다르면 던진다(위 규칙).
 * 날짜 형식이 틀리면 던진다(경로 조립 전에 막는다).
 */
export function loadBrief(
  date: string,
  dir: string = BRIEFS_DIR,
): BriefFile | null {
  if (!DATE_RE.test(date)) {
    throw new RangeError(
      `브리핑 날짜는 YYYY-MM-DD 형식이어야 함: ${JSON.stringify(date)}`,
    );
  }
  const file = path.join(dir, `${date}.json`);
  if (!existsSync(file)) return null;
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = BriefFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 브리핑 파일 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  if (parsed.data.date !== date) {
    throw new Error(
      `${where}: date(${parsed.data.date})가 파일명(${date})과 다름`,
    );
  }
  return parsed.data;
}

const BRIEF_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** 브리핑 파일이 있는 발행일 전부(오름차순). 폴더가 없으면 빈 배열. 내용은 읽지 않는다 */
export function listBriefDates(dir: string = BRIEFS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((name) => {
      const m = BRIEF_FILE_RE.exec(name);
      return m?.[1] ? [m[1]] : [];
    })
    .sort();
}

/**
 * 그 호의 5줄 자리 상태(M1-37 — src/lib/brief-slot.ts 규칙): 브리핑 파일 · 확인된 오류(파일 없음 + 그날 게시 실행 기록) · 없음.
 * 홈(오늘의 5줄)과 날짜 아카이브(이날의 5줄)가 쓴다.
 */
export function loadBriefSlot(
  date: string,
  dir: string = BRIEFS_DIR,
  runs: () => ReturnType<typeof loadProdRuns> = loadProdRuns,
): BriefSlot {
  const brief = loadBrief(date, dir);
  if (brief) return { kind: "brief", brief };
  return briefSlotOf({ date, brief, briefDates: listBriefDates(dir), runs: runs() });
}
