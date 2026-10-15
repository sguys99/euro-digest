/**
 * `data/cache/seen-urls.json` — 이미 카드로 낸 URL(정규화 URL 해시)을 90일 기억해 날짜 간 중복을 막는다
 * (PRD FR-04 "같은 URL이 두 번 카드화되지 않음", §8.4 보존 90일, plan M1-12, 부록 A 11).
 *
 * ── 무엇을 기억하나 ───────────────────────────────────────────────────────
 *   **카드가 된 URL만**(발행 파일에 들어간 카드의 모든 출처 링크) — 해시 → 처음 카드가 된 시각(`card.created`, UTC).
 *   창 안에 있었지만 선별(상한 45)에 들지 못한 항목은 기억하지 않는다 — 카드가 된 적이 없으니 다음 실행에서 다시 겨룰 수
 *   있다(수용 기준은 "두 번 카드화되지 않음"). 키는 해시뿐이라 URL·제목은 이 파일에 남지 않는다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 *   수집 창(M1-10)은 직전 실행 − 3시간부터 열고(겹침), 실패한 소스는 더 넓게 연다. 그래서 어제 카드가 된 기사가 오늘
 *   다시 후보가 된다(실측: 2026-10-12·10-13 발행 파일에 같은 BBC 기사). 피드가 오래된 기사의 pubDate를 새로 찍는
 *   경우(ESPN 일괄 갱신 시각)도 창으로는 막을 수 없다 — 90일 기억이 막는다.
 *
 * ── 판정 (`filterUnseen`) ───────────────────────────────────────────────
 *   기억에 있는 키는 후보에서 뺀다. 단 **오늘(같은 KST 발행일) 파일에 이미 있는 키는 빼지 않는다** — 같은 날 다시 실행
 *   (백업·force)하면 앞선 실행의 카드가 선별 자리를 그대로 차지하고 병합(news-file.ts `mergeCards`)이 건너뛴다. 빼 버리면
 *   두 번째 실행이 그 자리를 순위가 낮은 다른 기사로 채워 하루 파일이 상한의 두 배까지 커진다(M1-10까지의 동작 유지).
 *   오늘 파일에 없는데 기억에 있는 키(다른 날 카드가 됐거나, 오늘 카드가 됐다가 삭제 요청으로 빠진 키)는 뺀다.
 *
 * ── 기억 만들기 (`buildSeenIndex`) ───────────────────────────────────────
 *   기억 = seen-urls.json(90일 지난 항목 정리) ∪ 최근 발행 파일(오늘 + 이전 3일) 카드의 출처 링크. 같은 키는 더 이른 시각.
 *   최근 발행 파일을 함께 읽는 이유: ① 첫 실행(파일 없음 — 이 기능 이전 발행분) ② 파일이 깨졌을 때(경고 후 다시 만든다)
 *   ③ 지난 실행의 쓰기 실패 — 어느 경우에도 수집 창(최대 51시간, D36)이 닿는 이전 발행일(D-1~D-3)의 카드는 다시 나오지
 *   않는다. 90일 기억이 필요한 것은 창 밖에서 다시 나타나는 기사(pubDate 갱신)뿐이다.
 *
 * ── 쓰기 시점 (커밋되지 않는 실행이 기억을 오염시키지 않게) ─────────────
 *   발행 파일을 쓴 뒤(또는 새 카드가 없어 그대로 둔 뒤)에만, **그 파일의 카드**로 기억을 갱신해 쓴다(collect-run.ts).
 *   dry는 쓰지 않는다. 뉴스 단계가 실패하면(파일 손상·모든 소스 실패) 쓰지 않는다. 그 뒤 단계(실행 기록·검증·빌드)가
 *   실패하면 Actions가 data/ 전체를 커밋하지 않으므로 발행 파일과 기억이 함께 버려진다 — 커밋된 기억에는 커밋된 발행
 *   파일의 카드만 있다. 내용(updatedAt 제외)이 같으면 다시 쓰지 않는다(불필요한 data 커밋 방지). 키는 정렬해 저장한다.
 *   기억 쓰기가 실패해도 발행은 계속한다(다음 실행은 최근 발행 파일로 같은 중복을 막는다) — 실행 상태만 partial.
 *
 * 순수 함수 + 얇은 fs 함수. 파일 경로는 dataDir을 받아 테스트가 임시 폴더를 쓴다.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  SeenUrlsFileSchema,
  type NewsCard,
  type SeenUrlsFile,
} from "@/lib/schema";
import { shiftDate } from "@/lib/time";

import { newsFilePath, readNewsFile } from "./news-file";
import { urlHash } from "./url-normalize";

// ─── 정책 ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** 보존 기간 — 처음 카드가 된 뒤 90일 지난 항목은 지운다(PRD §8.4, CLAUDE.md §8) */
export const SEEN_URLS_RETENTION_DAYS = 90;
export const SEEN_URLS_RETENTION_MS = SEEN_URLS_RETENTION_DAYS * DAY_MS;

/**
 * 기억에 더하는 이전 발행 파일 수(오늘 제외) — 수집 창 상한 51시간(D36). 정기 실행(06:30 KST)이면 D-2 03:30 KST까지만
 * 닿지만, 자정 직후 실행(예: 00:05 KST 수동·재실행)이면 D-3 21:05 KST까지 닿으므로 D-1·D-2·D-3. 하루 중 언제 실행해도
 * 창은 D-4 파일의 카드(D-4 23:59 KST 이전에 카드가 됨)까지 닿지 않는다. 이 범위의 카드는 seen-urls.json이 없거나 깨져도
 * 다시 나오지 않는다.
 */
export const SEEN_RECENT_DAYS = 3;

/** `data/` 아래 상대 경로 */
export const SEEN_URLS_REL_PATH = path.join("cache", "seen-urls.json");

export function seenUrlsPath(dataDir: string): string {
  return path.join(dataDir, SEEN_URLS_REL_PATH);
}

// ─── 순수 함수 ───────────────────────────────────────────────────────────

/** 키 → 처음 카드가 된 시각(UTC ISO) */
export type SeenMap = Map<string, string>;

/** 두 시각 중 이른 쪽(같으면 a) */
function earlier(a: string, b: string): string {
  return Date.parse(b) < Date.parse(a) ? b : a;
}

/** 키별 이른 시각으로 더한다(target을 바꾼다). 새 키였으면 true */
function addSeen(target: SeenMap, key: string, at: string): boolean {
  const prev = target.get(key);
  if (prev === undefined) {
    target.set(key, at);
    return true;
  }
  target.set(key, earlier(prev, at));
  return false;
}

/** 카드들의 모든 출처 링크 → 키 → 그 카드의 created(같은 키는 이른 시각) */
export function seenFromCards(cards: readonly NewsCard[]): SeenMap {
  const seen: SeenMap = new Map();
  for (const card of cards) {
    for (const src of card.src) addSeen(seen, urlHash(src.u), card.created);
  }
  return seen;
}

/** 카드들의 출처 링크 키 집합 */
export function cardKeys(cards: readonly NewsCard[]): Set<string> {
  return new Set(cards.flatMap((card) => card.src.map((s) => urlHash(s.u))));
}

/** 보존 기간이 지난 항목(처음 본 시각 < now − 90일)을 뺀다. 미래 시각(시계 오류)은 남긴다 */
export function pruneSeen(
  seen: ReadonlyMap<string, string>,
  now: string,
  retentionMs: number = SEEN_URLS_RETENTION_MS,
): { seen: SeenMap; pruned: number } {
  const cutoff = Date.parse(now) - retentionMs;
  const kept: SeenMap = new Map();
  let pruned = 0;
  for (const [key, at] of seen) {
    if (Date.parse(at) < cutoff) pruned += 1;
    else kept.set(key, at);
  }
  return { seen: kept, pruned };
}

export interface SeenIndexInput {
  /** seen-urls.json의 urls(없거나 읽지 못했으면 {}) */
  stored: Readonly<Record<string, string>>;
  /** 이전 발행 파일(D-1~D-3) 카드 */
  recentCards: readonly NewsCard[];
  /** 오늘 발행 파일의 기존 카드(없으면 []) */
  todayCards: readonly NewsCard[];
  /** 이번 실행 시작(UTC ISO) — 보존 기간 기준 */
  now: string;
  retentionMs?: number;
}

export interface SeenIndex {
  /** 기억(정리 후 seen-urls ∪ 최근·오늘 발행 파일 카드) */
  seen: SeenMap;
  /** 오늘 발행 파일에 이미 있는 키 — 후보에서 빼지 않는다(머리 주석 "판정") */
  todayKeys: Set<string>;
  /** seen-urls.json에서 읽은 항목 수(정리 전) */
  stored: number;
  /** 보존 기간이 지나 뺀 항목 수 */
  pruned: number;
  /** seen-urls.json에 없어 발행 파일에서 채운 키 수(첫 실행·파일 손상·지난 쓰기 실패) */
  backfilled: number;
}

/** 기억을 만든다 — 머리 주석 "기억 만들기" */
export function buildSeenIndex(input: SeenIndexInput): SeenIndex {
  const storedMap: SeenMap = new Map(Object.entries(input.stored));
  const { seen, pruned } = pruneSeen(
    storedMap,
    input.now,
    input.retentionMs ?? SEEN_URLS_RETENTION_MS,
  );
  let backfilled = 0;
  for (const [key, at] of seenFromCards([
    ...input.recentCards,
    ...input.todayCards,
  ])) {
    if (addSeen(seen, key, at)) backfilled += 1;
  }
  return {
    seen,
    todayKeys: cardKeys(input.todayCards),
    stored: storedMap.size,
    pruned,
    backfilled,
  };
}

/**
 * 날짜 간 중복 판정 — 기억에 있고 오늘 파일에 없는 키의 묶음을 뺀다(머리 주석 "판정"). 입력 순서를 유지한다.
 */
export function filterUnseen<T extends { key: string }>(
  groups: readonly T[],
  index: Pick<SeenIndex, "seen" | "todayKeys">,
): { kept: T[]; seenBefore: T[] } {
  const kept: T[] = [];
  const seenBefore: T[] = [];
  for (const group of groups) {
    if (index.seen.has(group.key) && !index.todayKeys.has(group.key)) {
      seenBefore.push(group);
    } else {
      kept.push(group);
    }
  }
  return { kept, seenBefore };
}

/**
 * 발행 파일의 카드로 기억을 갱신한다 — 기억 ∪ 카드 출처 링크(처음 본 시각 = card.created, 이미 있으면 이른 쪽).
 * `added` = 새로 생긴 키 수.
 */
export function updateSeen(
  seen: ReadonlyMap<string, string>,
  cards: readonly NewsCard[],
): { seen: SeenMap; added: number } {
  const next: SeenMap = new Map(seen);
  let added = 0;
  for (const [key, at] of seenFromCards(cards)) {
    if (addSeen(next, key, at)) added += 1;
  }
  return { seen: next, added };
}

/** 파일 내용(키 정렬, 스키마 검증) */
export function buildSeenUrlsFile(
  seen: ReadonlyMap<string, string>,
  updatedAt: string,
): SeenUrlsFile {
  const urls: Record<string, string> = {};
  for (const key of [...seen.keys()].sort()) urls[key] = seen.get(key) ?? "";
  return SeenUrlsFileSchema.parse({ updatedAt, urls });
}

/** 기억이 같은가(updatedAt 제외, 시각은 같은 순간이면 같다) — 같으면 파일을 다시 쓰지 않는다 */
export function sameSeen(
  a: Readonly<Record<string, string>>,
  b: ReadonlyMap<string, string>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== b.size) return false;
  return keys.every((key) => {
    const at = b.get(key);
    return at !== undefined && Date.parse(at) === Date.parse(a[key] ?? "");
  });
}

/** 2칸 들여쓰기 + 끝 개행 */
export function serializeSeenUrls(file: SeenUrlsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ─── 파일 I/O ────────────────────────────────────────────────────────────

export interface SeenUrlsRead {
  urls: Record<string, string>;
  /** 파일이 있었는가 */
  exists: boolean;
  /** 읽기·형식 오류 — 있으면 빈 기억으로 진행하고(발행 파일에서 다시 채움) 다음 쓰기가 새 파일로 고친다 */
  error: string | null;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

/** seen-urls.json 읽기 — 없으면 빈 기억, 형식 오류도 던지지 않고 오류와 빈 기억 */
export async function readSeenUrls(dataDir: string): Promise<SeenUrlsRead> {
  let text: string;
  try {
    text = await readFile(seenUrlsPath(dataDir), "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return { urls: {}, exists: false, error: null };
    return {
      urls: {},
      exists: false,
      error: `읽기 실패: ${errorText(error)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { urls: {}, exists: true, error: "JSON 파싱 실패" };
  }
  const parsed = SeenUrlsFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      urls: {},
      exists: true,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { urls: parsed.data.urls, exists: true, error: null };
}

/** 임시 파일에 쓴 뒤 rename(반쯤 쓴 파일이 남지 않게). 쓴 경로를 돌려준다 */
export async function writeSeenUrls(
  dataDir: string,
  file: SeenUrlsFile,
): Promise<string> {
  const target = seenUrlsPath(dataDir);
  const data = serializeSeenUrls(SeenUrlsFileSchema.parse(file));
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

export interface RecentNewsRead {
  cards: NewsCard[];
  /** 읽은 발행일(파일이 있었던 날) */
  dates: string[];
  /** 깨진 파일(경고만 — 그 날짜의 카드는 seen-urls.json 기억에만 기댄다. 발행 검증 게이트가 따로 잡는다) */
  errors: Array<{ date: string; error: string }>;
}

/** 이전 발행 파일(publishDate − 1 … − days)의 카드 — 없는 날은 건너뛰고, 깨진 파일은 오류로 돌려준다(던지지 않음) */
export async function readRecentNewsCards(
  dataDir: string,
  publishDate: string,
  days: number = SEEN_RECENT_DAYS,
): Promise<RecentNewsRead> {
  const result: RecentNewsRead = { cards: [], dates: [], errors: [] };
  for (let back = 1; back <= days; back += 1) {
    const date = shiftDate(publishDate, -back);
    try {
      const file = await readNewsFile(newsFilePath(dataDir, date));
      if (file === null) continue;
      result.dates.push(date);
      result.cards.push(...file.cards);
    } catch (error) {
      result.errors.push({ date, error: errorText(error) });
    }
  }
  return result;
}
