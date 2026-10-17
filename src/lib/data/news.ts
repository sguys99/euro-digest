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
 * - **삭제 요청 카드는 빌드에서 즉시 뺀다**(PRD FR-143·§15 D14, plan M1-25): `configs/takedowns.json`에 등록된 카드 ID와 저장된
 *   `card.id`가 같은 카드는 돌려주지 않는다(등록만으로 적용 — handledAt 무관, data 원본은 다음 수집 실행이 지운다). 카드 ID는
 *   불투명한 키로만 쓴다(URL에서 다시 계산하지 않음 — 옛 규칙 ID 포함). 등록 파일이 없거나 깨졌으면 **던진다**(빌드 실패 —
 *   삭제 요청을 뺐다고 보장할 수 없는 사이트를 배포하지 않는다, 전날 사이트 유지).
 * - **날짜 파일은 이 모듈의 `readIssue` 한 곳에서만 읽고, 그 함수가 삭제 요청 제외까지 한다** — 공개 로더(`loadLatestNews`·
 *   `loadNewsIssue`)는 모두 그것을 거친다. 날짜 아카이브·필터·RSS·검색·OG 등 카드를 내보내는 빌드 경로(M1-33·M1-34·M4-11·M4-14·
 *   M5-01)는 data/news를 직접 읽지 말고 이 모듈의 로더를 쓴다(새 로더도 여기에 — tests/takedown-build-guard.test.ts가 src/·
 *   scripts/build-feeds.ts의 직접 읽기와, 이 모듈의 로더가 삭제 요청을 빼는지를 확인한다).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import { TakedownsFileSchema } from "@/lib/schema/takedown";

/** 파이프라인 산출물 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const NEWS_DIR = path.resolve("data/news");

/** 삭제 요청 등록 파일(저장소 루트 기준) — 사람이 `/takedown`으로 관리한다 */
export const TAKEDOWNS_FILE = path.resolve("configs/takedowns.json");

const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

export interface LoadNewsOptions {
  /** 삭제 요청 등록 파일 — 기본 TAKEDOWNS_FILE(테스트 주입용) */
  takedownsFile?: string;
}

/** 디렉터리 안 일별 뉴스 파일의 날짜(파일명 기준, 오름차순). 디렉터리가 없으면 빈 배열 */
export function listNewsDates(dir: string = NEWS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DAILY_FILE_RE.test(entry.name))
    .map((entry) => path.basename(entry.name, ".json"))
    .sort();
}

/**
 * 가장 최근 일별 뉴스 파일(검증 통과분, 삭제 요청 카드 제외). 파일이 없으면 `null`, 최신 파일·등록 파일이 깨졌으면 던진다(위 규칙).
 * 최신 호의 카드가 모두 삭제 요청이면 카드 0장의 호를 돌려준다(전날 호로 넘어가지 않는다 — 화면은 빈 상태).
 */
export function loadLatestNews(
  dir: string = NEWS_DIR,
  options: LoadNewsOptions = {},
): NewsFile | null {
  const latest = listNewsDates(dir).at(-1);
  if (latest === undefined) return null;
  return readIssue(path.join(dir, `${latest}.json`), options);
}

/**
 * 발행일(KST "YYYY-MM-DD") 하나의 호(검증 통과분, 삭제 요청 카드 제외) — 날짜 아카이브(M1-34)용. 파일이 없으면 `null`,
 * 깨졌거나 등록 파일이 깨졌으면 던진다(위 규칙).
 */
export function loadNewsIssue(
  date: string,
  dir: string = NEWS_DIR,
  options: LoadNewsOptions = {},
): NewsFile | null {
  if (!listNewsDates(dir).includes(date)) return null;
  return readIssue(path.join(dir, `${date}.json`), options);
}

/** 삭제 요청 카드 ID 집합 — 파일이 없거나 JSON·스키마가 틀리면 던진다(빌드 실패, 위 규칙) */
export function loadTakedownIds(file: string = TAKEDOWNS_FILE): Set<string> {
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${where}: 삭제 요청 등록 파일을 읽을 수 없음 — 삭제 요청 카드를 뺐다고 보장할 수 없어 빌드를 멈춘다(FR-143)`,
      { cause: error },
    );
  }
  const parsed = TakedownsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 삭제 요청 등록 파일 스키마 검증 실패 — 빌드를 멈춘다(FR-143)\n${z.prettifyError(parsed.error)}`,
    );
  }
  return new Set(parsed.data.map((t) => t.id));
}

/** 삭제 요청 카드를 뺀 호(순서 유지). 뺄 카드가 없으면 같은 객체를 돌려준다 */
export function withoutTakedowns(
  news: NewsFile,
  takedownIds: ReadonlySet<string>,
): NewsFile {
  if (!news.cards.some((card) => takedownIds.has(card.id))) return news;
  return {
    ...news,
    cards: news.cards.filter((card) => !takedownIds.has(card.id)),
  };
}

/** 날짜 파일 1개를 읽어 검증하고 삭제 요청 카드를 뺀다 — 이 모듈에서 파일을 읽는 유일한 곳(머리 주석) */
function readIssue(file: string, options: LoadNewsOptions): NewsFile {
  return withoutTakedowns(
    readNewsFile(file),
    loadTakedownIds(options.takedownsFile ?? TAKEDOWNS_FILE),
  );
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
