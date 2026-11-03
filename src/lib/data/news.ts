/**
 * 뉴스 호 로더 — 일별 `data/news/YYYY-MM-DD.json` + 월별 병합 `data/news/YYYY-MM.json` (CLAUDE.md §5 "src/lib data 로더", plan M1-01·M5-10)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. 정적 export라 런타임 서버가 없다. node:fs·zod를 쓰므로
 * `"use client"` 파일에서 import하지 않는다(클라이언트 번들에 들어가면 안 된다 — 타입은 `@/lib/schema`에서 `import type`).
 *
 * 규칙
 * - 호(발행일 하나) = 일별 파일 `YYYY-MM-DD.json` 하나 또는 월별 병합 파일 `YYYY-MM.json`(NewsMonthFile — PRD FR-158·§8.4, 그 달
 *   말일 + 90일 뒤 수집 실행이 합친다 — scripts/lib/news-retention.ts)의 `issues[]` 한 항목. 월별 파일 안의 호는 병합 전 일별 파일과
 *   같은 값이라 **날짜 페이지(`/news/{date}/`)·카드 ID·공유 앵커가 병합 전후 그대로다**(FR-34 영구 주소). `.gitkeep` 등 그 밖의 파일은 무시.
 * - 같은 날짜가 일별 파일과 월별 파일에 함께 있으면 **던진다**(병합 단계의 중간 상태 — 어느 쪽이 맞는지 정하지 않는다, 빌드 실패).
 *   월별 파일은 날짜 목록을 만들 때도 읽어야 하므로(`listNewsDates`) 깨졌으면 목록에서부터 던진다. 같은 파일(경로·크기·수정 시각)은
 *   한 번만 파싱한다(빌드 중 캐시).
 * - 최신 = 날짜(KST 발행일, NewsFile.date)가 가장 늦은 호. ISO 날짜라 문자열 정렬이 곧 날짜 정렬이다.
 * - 디렉터리가 없거나 호가 없으면 `null` — CI 빌드는 `data/news`가 비어 있을 수 있다(.gitkeep만). 화면은 빈 상태.
 * - 최신 파일이 JSON·스키마 검증에 실패하거나 내용의 `date`가 파일명과 다르면 **던진다**(빌드 실패). 깨진 파일을 건너뛰고
 *   전날 호를 조용히 보여 주면 잘못된 발행이 드러나지 않는다. 1차 방어는 커밋 전 발행 검증 게이트(M1-25)이고,
 *   이것은 빌드 단계의 마지막 방어선이다(검증·빌드가 실패하면 커밋하지 않는다 — CLAUDE §6.1).
 * - 최신 파일만 읽는다. 지난 날짜 파일 검증은 `npm run validate`가 맡는다.
 * - **삭제 요청 카드는 빌드에서 즉시 뺀다**(PRD FR-143·§15 D14, plan M1-25): `configs/takedowns.json`에 등록된 카드 ID와 저장된
 *   `card.id`가 같은 카드는 돌려주지 않는다(등록만으로 적용 — handledAt 무관, data 원본은 다음 수집 실행이 지운다). 카드 ID는
 *   불투명한 키로만 쓴다(URL에서 다시 계산하지 않음 — 옛 규칙 ID 포함). 등록 파일이 없거나 깨졌으면 **던진다**(빌드 실패 —
 *   삭제 요청을 뺐다고 보장할 수 없는 사이트를 배포하지 않는다, 전날 사이트 유지).
 * - **호는 이 모듈의 `readIssue` 한 곳에서만 꺼내고(일별·월별 파일 모두), 그 함수가 삭제 요청 제외까지 한다** — 공개 로더(`loadLatestNews`·
 *   `loadNewsIssue`)는 모두 그것을 거친다. 날짜 아카이브·필터·RSS·검색·OG 등 카드를 내보내는 빌드 경로(M1-33·M1-34·M4-11·M4-14·
 *   M5-01)는 data/news를 직접 읽지 말고 이 모듈의 로더를 쓴다(새 로더도 여기에 — tests/takedown-build-guard.test.ts가 src/·
 *   scripts/build-feeds.ts의 직접 읽기와, 이 모듈의 로더가 삭제 요청을 빼는지를 확인한다).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  NewsFileSchema,
  NewsMonthFileSchema,
  type NewsCard,
  type NewsFile,
  type NewsMonthFile,
} from "@/lib/schema/news";
import { TakedownsFileSchema } from "@/lib/schema/takedown";

/** 파이프라인 산출물 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const NEWS_DIR = path.resolve("data/news");

/** 삭제 요청 등록 파일(저장소 루트 기준) — 사람이 `/takedown`으로 관리한다 */
export const TAKEDOWNS_FILE = path.resolve("configs/takedowns.json");

const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;
const MONTH_FILE_RE = /^\d{4}-\d{2}\.json$/;

export interface LoadNewsOptions {
  /** 삭제 요청 등록 파일 — 기본 TAKEDOWNS_FILE(테스트 주입용) */
  takedownsFile?: string;
}

/** 호 하나의 위치 — 일별 파일 또는 월별 파일 안 */
type IssueLocation =
  | { kind: "daily"; file: string }
  | { kind: "month"; file: string };

/** 폴더 안 호 위치(날짜 → 위치, 날짜 오름차순). 같은 날짜가 일별·월별 파일에 함께 있으면 던진다(머리 주석) */
function indexIssues(dir: string): Map<string, IssueLocation> {
  const index = new Map<string, IssueLocation>();
  if (!existsSync(dir)) return index;
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  for (const name of entries) {
    if (DAILY_FILE_RE.test(name)) {
      index.set(path.basename(name, ".json"), {
        kind: "daily",
        file: path.join(dir, name),
      });
    }
  }
  for (const name of entries) {
    if (!MONTH_FILE_RE.test(name)) continue;
    const file = path.join(dir, name);
    for (const issue of readMonthFile(file).issues) {
      if (index.has(issue.date)) {
        const where = path.relative(process.cwd(), file) || file;
        throw new Error(
          `${where}: 호 ${issue.date}가 일별 파일(${issue.date}.json)에도 있음 — 월별 병합 중간 상태, 빌드를 멈춘다(FR-158)`,
        );
      }
      index.set(issue.date, { kind: "month", file });
    }
  }
  // 날짜 오름차순으로 다시 담는다(Map 순회 = 날짜 순)
  return new Map([...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** 디렉터리 안 호의 날짜(일별 파일명 + 월별 파일 안 호 날짜, 오름차순). 디렉터리가 없으면 빈 배열 */
export function listNewsDates(dir: string = NEWS_DIR): string[] {
  return [...indexIssues(dir).keys()];
}

/**
 * 가장 최근 일별 뉴스 파일(검증 통과분, 삭제 요청 카드 제외). 파일이 없으면 `null`, 최신 파일·등록 파일이 깨졌으면 던진다(위 규칙).
 * 최신 호의 카드가 모두 삭제 요청이면 카드 0장의 호를 돌려준다(전날 호로 넘어가지 않는다 — 화면은 빈 상태).
 */
export function loadLatestNews(
  dir: string = NEWS_DIR,
  options: LoadNewsOptions = {},
): NewsFile | null {
  const latest = [...indexIssues(dir)].at(-1);
  if (latest === undefined) return null;
  return readIssue(latest[0], latest[1], options);
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
  const location = indexIssues(dir).get(date);
  if (location === undefined) return null;
  return readIssue(date, location, options);
}

const retainedCache = new Map<string, NewsCard[]>();

/**
 * 보존된 일별 호 전체의 카드(삭제 요청 제외) — 날짜 오름차순으로 읽어 같은 카드 ID는 **앞 날짜 것 하나만**(이적 트래커 집계
 * scripts/lib/transfers.ts와 같은 규칙). 이적 화면(M4-04 — `history` 근거 카드 · 보조 노드)이 쓴다. 파일이 없으면 빈 배열, 깨진 파일이
 * 있으면 던진다(위 규칙 — 보존 기간 전체가 근거라 최신 파일만 보지 않는다). 같은 폴더 · 같은 등록 파일은 한 번만 읽는다(빌드 중 캐시).
 */
export function loadRetainedCards(
  dir: string = NEWS_DIR,
  options: LoadNewsOptions = {},
): NewsCard[] {
  const key = `${dir}\u0000${options.takedownsFile ?? TAKEDOWNS_FILE}`;
  const hit = retainedCache.get(key);
  if (hit) return hit;
  const seen = new Set<string>();
  const cards: NewsCard[] = [];
  for (const [date, location] of indexIssues(dir)) {
    for (const card of readIssue(date, location, options).cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }
  }
  retainedCache.set(key, cards);
  return cards;
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

/** 호 1개를 꺼내 검증하고 삭제 요청 카드를 뺀다 — 이 모듈에서 호를 꺼내는 유일한 곳(머리 주석). 일별·월별 파일 모두 */
function readIssue(
  date: string,
  location: IssueLocation,
  options: LoadNewsOptions,
): NewsFile {
  const issue =
    location.kind === "daily"
      ? readNewsFile(location.file)
      : readMonthFile(location.file).issues.find((i) => i.date === date);
  if (issue === undefined) {
    throw new Error(`호 ${date}를 ${location.file}에서 찾지 못함`);
  }
  return withoutTakedowns(
    issue,
    loadTakedownIds(options.takedownsFile ?? TAKEDOWNS_FILE),
  );
}

const monthCache = new Map<string, { stamp: string; value: NewsMonthFile }>();

/** 월별 병합 파일 1개 — JSON·스키마·파일명(= month) 검사, 같은 파일(크기·수정 시각)은 한 번만 파싱 */
function readMonthFile(file: string): NewsMonthFile {
  const where = path.relative(process.cwd(), file) || file;
  const stat = statSync(file);
  const stamp = `${stat.size}:${stat.mtimeMs}`;
  const hit = monthCache.get(file);
  if (hit && hit.stamp === stamp) return hit.value;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = NewsMonthFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 월별 뉴스 파일 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  const expected = path.basename(file, ".json");
  if (parsed.data.month !== expected) {
    throw new Error(
      `${where}: month(${parsed.data.month})가 파일명(${expected})과 다름`,
    );
  }
  monthCache.set(file, { stamp, value: parsed.data });
  return parsed.data;
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
