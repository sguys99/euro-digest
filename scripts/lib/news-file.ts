/**
 * 원제목 카드 만들기 · 선별 · 일별 뉴스 파일 병합/쓰기 (M1-01 수직 슬라이스, PRD FR-04·FR-20·FR-30, D23).
 *
 * - 카드: 해외·국내 모두 원제목+링크(`ai:false`, `s:[]`). 제목·링크는 normalize.ts가 정리한 원문 그대로 넣는다.
 * - 선별(슬라이스): 카드 ID로 중복을 빼고(같은 피드 안 같은 링크 — BBC 피드에 실제로 있다) 최신 발행 순 상위 N건.
 *   M1-11~M1-14(중복제거·클러스터링·점수화)가 대체한다.
 * - 병합: 같은 KST 발행일 파일이 이미 있으면 기존 카드를 그대로 두고(created 유지) 새 ID만 더한다 → 다시 실행해도
 *   앞선 카드를 잃지 않고 같은 ID가 두 번 들어가지 않는다. 정렬은 최신 출처 시각 내림차순(같으면 ID).
 * - 쓰기: `NewsFileSchema`로 검증한 뒤 임시 파일 → rename(원자적). 기존 파일이 스키마에 맞지 않으면 덮어쓰지 않고 던진다.
 *
 * 순수 함수 + 얇은 fs 함수. 파일 경로는 dataDir을 받아 테스트가 임시 폴더를 쓴다.
 */
import { randomBytes } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import path from "node:path";

import {
  NewsFileSchema,
  type FeedItem,
  type NewsCard,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "./card-id";
import { classifyMinimal } from "./classify";

// ─── 카드 ────────────────────────────────────────────────────────────────

/**
 * 카드에 표시할 출처명 — 소스 이름에서 섹션(" — Football")·괄호 설명(" (Fabrizio Romano)")을 뗀 매체명.
 * 예) "BBC Sport — Football" → "BBC Sport", "인터풋볼 — 해외축구" → "인터풋볼" (M0-34 카드 샘플과 같은 표기).
 */
export function publisherNameOf(source: Pick<Source, "name">): string {
  const base = source.name.split(" — ")[0] ?? source.name;
  return base.replace(/\s*\([^)]*\)\s*$/, "").trim() || source.name;
}

/** 피드 항목 1건 → 원제목 카드(분류는 최소 규칙). created = 이번 실행 시각(UTC ISO). */
export function buildCard(
  item: FeedItem,
  source: Source,
  created: string,
): NewsCard {
  return {
    id: cardIdFor(item.url),
    t: item.title,
    s: [],
    ...classifyMinimal(item, source),
    src: [
      {
        n: publisherNameOf(source),
        u: item.url,
        at: item.publishedAt,
        tier: source.tier,
      },
    ],
    lang: item.lang,
    ai: false,
    created,
  };
}

/**
 * 슬라이스 선별 — 카드 ID(링크 해시)로 중복 제거(먼저 나온 것 유지) → 발행 시각 내림차순(같으면 피드 순서) → 상위 limit건.
 */
export function selectLatest(
  items: readonly FeedItem[],
  limit: number,
): FeedItem[] {
  const seen = new Set<string>();
  const unique: Array<{ item: FeedItem; index: number }> = [];
  items.forEach((item, index) => {
    const id = cardIdFor(item.url);
    if (seen.has(id)) return;
    seen.add(id);
    unique.push({ item, index });
  });
  unique.sort(
    (a, b) =>
      Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt) ||
      a.index - b.index,
  );
  return unique.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}

// ─── 병합 ────────────────────────────────────────────────────────────────

/** 카드의 가장 최근 출처 시각(ms) — 정렬 키 */
function newestSourceMs(card: NewsCard): number {
  return Math.max(...card.src.map((s) => Date.parse(s.at)));
}

/** 표시 순서: 최신 출처 시각 내림차순, 같으면 ID 오름차순(결정적) */
export function sortCards(cards: readonly NewsCard[]): NewsCard[] {
  return [...cards].sort(
    (a, b) =>
      newestSourceMs(b) - newestSourceMs(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface MergeResult {
  cards: NewsCard[];
  /** 새로 더한 카드 수 */
  added: number;
  /** 이미 있어서 건너뛴 새 카드 수 */
  duplicates: number;
}

/** 기존 카드는 그대로 두고 새 ID만 더한다(같은 ID는 기존 카드 유지 — created가 바뀌지 않는다). */
export function mergeCards(
  existing: readonly NewsCard[],
  incoming: readonly NewsCard[],
): MergeResult {
  const ids = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  let added = 0;
  let duplicates = 0;
  for (const card of incoming) {
    if (ids.has(card.id)) {
      duplicates += 1;
      continue;
    }
    ids.add(card.id);
    merged.push(card);
    added += 1;
  }
  return { cards: sortCards(merged), added, duplicates };
}

/** 일별 뉴스 파일을 만들고 스키마로 검증한다(실패하면 ZodError). */
export function buildNewsFile(input: {
  date: string;
  generatedAt: string;
  runId: string;
  cards: readonly NewsCard[];
}): NewsFile {
  return NewsFileSchema.parse({
    date: input.date,
    generatedAt: input.generatedAt,
    runId: input.runId,
    cards: [...input.cards],
  });
}

// ─── 파일 I/O ────────────────────────────────────────────────────────────

/** 기존 뉴스 파일이 JSON·스키마에 맞지 않을 때 — 덮어쓰면 앞선 카드를 잃으므로 실행을 멈춘다. */
export class NewsFileError extends Error {
  override readonly name = "NewsFileError";
}

/** `<dataDir>/news/<YYYY-MM-DD>.json` (파일명 = KST 발행일) */
export function newsFilePath(dataDir: string, date: string): string {
  return path.join(dataDir, "news", `${date}.json`);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** 기존 뉴스 파일을 읽어 검증한다. 없으면 null. */
export async function readNewsFile(filePath: string): Promise<NewsFile | null> {
  let text: string;
  try {
    text = await fsPromises.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new NewsFileError(
      `${path.basename(filePath)}: JSON 파싱 실패 — 덮어쓰지 않는다`,
    );
  }
  const parsed = NewsFileSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new NewsFileError(
      `${path.basename(filePath)}: 스키마 검증 실패(${first ? `${first.path.join(".")}: ${first.message}` : "?"}) — 덮어쓰지 않는다`,
    );
  }
  return parsed.data;
}

/** 직렬화 — 2칸 들여쓰기 + 끝 개행(runs.json과 같은 형식). */
export function serializeNewsFile(file: NewsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 검증 → 임시 파일 → rename. 쓰는 도중 실패해도 기존 파일이 반쯤 쓰인 채로 남지 않는다. */
export async function writeNewsFile(
  filePath: string,
  file: NewsFile,
): Promise<void> {
  const data = serializeNewsFile(NewsFileSchema.parse(file));
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsPromises.writeFile(tmp, data, "utf8");
    await fsPromises.rename(tmp, filePath);
  } catch (error) {
    await fsPromises.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}
