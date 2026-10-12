/**
 * 일별 뉴스 로더 — `data/news/YYYY-MM-DD.json` (CLAUDE.md §5 "src/lib data 로더", plan M1-01)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. 정적 export라 런타임 서버가 없다. node:fs·zod를 쓰므로
 * `"use client"` 파일에서 import하지 않는다(클라이언트 번들에 들어가면 안 된다 — 타입은 `@/lib/schema`에서 `import type`).
 *
 * 규칙
 * - 파일명이 `YYYY-MM-DD.json`인 파일만 일별 뉴스로 본다. `.gitkeep`·월별 병합 파일(`YYYY-MM.json`, CLAUDE §8 보존)은 무시.
 * - 최신 = 파일명 날짜(KST 발행일, NewsFile.date)가 가장 늦은 파일. ISO 날짜라 문자열 정렬이 곧 날짜 정렬이다.
 * - 디렉터리가 없거나 일별 파일이 없으면 `null` — CI 빌드는 `data/news`가 비어 있을 수 있다(.gitkeep만). 화면은 빈 상태.
 * - 최신 파일이 JSON·스키마 검증에 실패하거나 내용의 `date`가 파일명과 다르면 **던진다**(빌드 실패). 깨진 파일을 건너뛰고
 *   전날 호를 조용히 보여 주면 잘못된 발행이 드러나지 않는다. 1차 방어는 커밋 전 발행 검증 게이트(M1-25)이고,
 *   이것은 빌드 단계의 마지막 방어선이다(검증·빌드가 실패하면 커밋하지 않는다 — CLAUDE §6.1).
 * - 최신 파일만 읽는다. 지난 날짜 파일 검증은 `npm run validate`가 맡는다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";

/** 파이프라인 산출물 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const NEWS_DIR = path.resolve("data/news");

const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** 디렉터리 안 일별 뉴스 파일의 날짜(파일명 기준, 오름차순). 디렉터리가 없으면 빈 배열 */
export function listNewsDates(dir: string = NEWS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DAILY_FILE_RE.test(entry.name))
    .map((entry) => path.basename(entry.name, ".json"))
    .sort();
}

/** 가장 최근 일별 뉴스 파일(검증 통과분). 파일이 없으면 `null`, 최신 파일이 깨졌으면 던진다(위 규칙) */
export function loadLatestNews(dir: string = NEWS_DIR): NewsFile | null {
  const latest = listNewsDates(dir).at(-1);
  return latest === undefined
    ? null
    : readNewsFile(path.join(dir, `${latest}.json`));
}

function readNewsFile(file: string): NewsFile {
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = NewsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 뉴스 파일 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  const expected = path.basename(file, ".json");
  if (parsed.data.date !== expected) {
    throw new Error(
      `${where}: date(${parsed.data.date})가 파일명(${expected})과 다름`,
    );
  }
  return parsed.data;
}
