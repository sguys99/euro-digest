/**
 * 원제목 카드 만들기 · 선별 · 일별 뉴스 파일 병합/쓰기 (M1-01 수직 슬라이스, PRD FR-04·FR-20·FR-30, D23).
 *
 * - 카드: 해외·국내 모두 원제목+링크(`ai:false`, `s:[]` — LLM을 거치지 않는다, FR-20·D23). 제목·링크는 normalize.ts가
 *   정리한 원문 그대로 넣는다. RSS 요약문(description)은 카드에 넣지 않는다(FeedItem `summary`도 쓰지 않음 — D39).
 * - 카드 출처(`src`): 같은 사건 클러스터(news-cluster.ts, M1-13)의 묶음마다 1건 — 대표 묶음(card-lead.ts, M1-15 — Tier·weight·
 *   최신성)이 먼저, 나머지는 `compareCardSources`(Tier → 최신 → URL) 순. 같은 날 재실행으로 출처가 붙어도 같은 규칙으로 다시
 *   줄 세운다(`src[0]`은 그대로). 같은 매체의 다른 기사(BBC 경기 기사+영상)도 각각 1건이다('+N곳'은 매체명 수로 센다 — M1-31).
 * - 선별: 점수화(score.ts, M1-14 — FR-06) 상위 `MAX_ITEMS_PER_RUN`. 선별 점수는 카드 생성(`buildCard`의 `signals`)까지
 *   넘어가 분류(classify.ts — M1-17 중요도 `imp`)가 쓴다. 카드·파일에는 점수를 저장하지 않는다(스키마 변경 없음).
 * - 병합: 같은 KST 발행일 파일이 이미 있으면 기존 카드를 그대로 두고(id·created 유지) 새 카드만 더한다 → 다시 실행해도
 *   앞선 카드를 잃지 않고 같은 카드(출처 링크의 정규화 URL이 같은 카드 — 옛 규칙 ID 카드 포함, M1-16)가 두 번 들어가지
 *   않으며 파일 안 카드 ID도 겹치지 않는다(해시 충돌 카드는 넣지 않음 — `idCollisions`). 기존 카드와 같은 사건의
 *   새 기사는 새 카드가 아니라 그 카드의 출처로 붙는다(`attachments`, 그리고 출처 URL이 겹치는 새 카드의 나머지 출처 —
 *   M1-13). 다른 날짜 파일과의 중복은 seen-urls.ts·news-cluster.ts가 막는다.
 * - **파일 순서 = 화면 표시 순서**(화면은 파일 순서 그대로 그린다 — M1-01 이월): 중요도(`imp`) 내림차순 → 최신 출처 시각
 *   내림차순 → ID(PRD §4.2-6 '중요도·시각 순', D0 시안 = imp 내림차순). 점수가 아니라 카드에 저장된 `imp`로 정렬해 같은 날
 *   재실행으로 기존 카드와 새 카드를 합쳐도 순서 규칙이 하나다. M1-17 전에는 모든 카드가 기본 imp(3)라 시각 순과 같다.
 * - 쓰기: `NewsFileSchema`로 검증한 뒤 임시 파일 → rename(원자적). 기존 파일이 스키마에 맞지 않으면 덮어쓰지 않고 던진다.
 *
 * 순수 함수 + 얇은 fs 함수. 파일 경로는 dataDir을 받아 테스트가 임시 폴더를 쓴다.
 */
import { randomBytes } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import path from "node:path";

import {
  NewsFileSchema,
  type CardSource,
  type FeedItem,
  type NewsCard,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "./card-id";
import { orderCardSources } from "./card-lead";
import { classifyMinimal, type CardSignals } from "./classify";
import { urlHash } from "./url-normalize";

// ─── 카드 ────────────────────────────────────────────────────────────────

/**
 * 카드에 표시할 출처명 — 소스 이름에서 섹션(" — Football")·괄호 설명(" (Fabrizio Romano)")을 뗀 매체명.
 * 예) "BBC Sport — Football" → "BBC Sport", "인터풋볼 — 해외축구" → "인터풋볼" (M0-34 카드 샘플과 같은 표기).
 */
export function publisherNameOf(source: Pick<Source, "name">): string {
  const base = source.name.split(" — ")[0] ?? source.name;
  return base.replace(/\s*\([^)]*\)\s*$/, "").trim() || source.name;
}

/**
 * 피드 항목 1건(대표) → 원제목 카드(분류는 최소 규칙). created = 이번 실행 시각(UTC ISO).
 * 제목 `t`·대표 링크 `src[0].u`는 피드 원문(정리된 값) 그대로, `s` = [], `ai` = false — 이 함수는 다른 값을 만들지 않는다(D23).
 * `more` = 같은 사건 클러스터의 나머지 출처(M1-13) — 대표 출처 뒤에 `compareCardSources` 순으로 붙는다(M1-15).
 * `signals` = 선별 단계 신호(M1-14 점수 — 분류 규칙 M1-17이 중요도에 쓴다). 없으면 null.
 */
export function buildCard(
  item: FeedItem,
  source: Source,
  created: string,
  more: readonly CardSource[] = [],
  signals: CardSignals | null = null,
): NewsCard {
  return {
    id: cardIdFor(item.url),
    t: item.title,
    s: [],
    ...classifyMinimal(item, source, signals),
    src: orderCardSources(
      {
        n: publisherNameOf(source),
        u: item.url,
        at: item.publishedAt,
        tier: source.tier,
      },
      more,
    ),
    lang: item.lang,
    ai: false,
    created,
  };
}

// ─── 병합 ────────────────────────────────────────────────────────────────

/** 카드의 가장 최근 출처 시각(ms) — 정렬 키 */
function newestSourceMs(card: NewsCard): number {
  return Math.max(...card.src.map((s) => Date.parse(s.at)));
}

/** 표시 순서(= 파일 순서): 중요도 내림차순 → 최신 출처 시각 내림차순 → ID 오름차순(결정적) — 머리 주석 */
export function sortCards(cards: readonly NewsCard[]): NewsCard[] {
  return [...cards].sort(
    (a, b) =>
      b.imp - a.imp ||
      newestSourceMs(b) - newestSourceMs(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface MergeResult {
  cards: NewsCard[];
  /** 새로 더한 카드 수 */
  added: number;
  /** 이미 있어서 카드로 더하지 않은 새 카드 수(그 카드의 새 출처는 기존 카드에 붙는다) */
  duplicates: number;
  /** 기존 카드에 새로 붙인 출처 수 */
  attached: number;
  /**
   * 카드 ID 충돌로 넣지 않은 새 카드의 ID(입력 순서) — 출처 링크가 하나도 겹치지 않는데 ID만 같은 카드(40비트 해시 충돌,
   * card-id.ts 머리 주석). 다른 기사를 출처로 붙이지 않고 파일 안 ID 중복도 만들지 않는다. 평소 [].
   */
  idCollisions: string[];
}

/** 기존 카드에 붙일 출처 — 같은 날 재실행에서 오늘 카드와 같은 사건으로 묶인 새 기사(news-cluster.ts `existing`) */
export interface CardAttachment {
  id: string;
  src: readonly CardSource[];
}

/** 카드 출처 링크의 중복 판정 키(정규화 URL 해시, M1-12) */
function srcKeys(card: Pick<NewsCard, "src">): string[] {
  return card.src.map((s) => urlHash(s.u));
}

/**
 * 기존 카드는 그대로 두고(id·created·제목·대표 출처 `src[0]` 유지) 새 카드를 더하고, 기존 카드에 새 출처를 붙인다.
 * 출처가 붙은 카드는 나머지 출처(`src[1..]`)를 `compareCardSources` 순으로 다시 줄 세운다(M1-15 — 파일 순서 = 출처 스택 순서).
 *   - `attachments`: 그 id의 기존 카드 출처에 붙인다(어느 카드에든 이미 있는 URL은 건너뜀). 없는 id는 무시.
 *   - `incoming`: 같은 카드(출처 링크의 정규화 URL이 하나라도 같은 카드 — M1-12)가 있으면 새 카드로 더하지 않고, 그 카드에
 *     없는 출처만 그 카드에 붙인다(M1-13 — 예전에는 통째로 건너뛰었다). 없으면 새 카드로 더한다.
 *   - 같은 기사인지는 **ID가 아니라 출처 링크의 정규화 URL 해시**로 가린다(M1-16): 기존 카드 ID는 옛 규칙(피드 원문 링크
 *     해시 — 2026-10-14까지 발행)일 수 있어 같은 기사의 새 규칙 ID와 다르다. 출처 링크가 겹치지 않는데 ID만 같으면 해시
 *     충돌이다 — 그 새 카드는 넣지 않고 `idCollisions`에 남긴다(다른 기사를 출처로 붙이지 않는다, card-id.ts).
 */
export function mergeCards(
  existing: readonly NewsCard[],
  incoming: readonly NewsCard[],
  attachments: readonly CardAttachment[] = [],
): MergeResult {
  const merged = existing.map((card) => ({ ...card, src: [...card.src] }));
  const byId = new Map(merged.map((c) => [c.id, c] as const));
  const ownerByKey = new Map<string, NewsCard>();
  for (const card of merged) {
    for (const key of srcKeys(card)) {
      if (!ownerByKey.has(key)) ownerByKey.set(key, card);
    }
  }
  let attached = 0;
  const attach = (target: NewsCard, src: readonly CardSource[]) => {
    const before = target.src.length;
    for (const entry of src) {
      const key = urlHash(entry.u);
      if (ownerByKey.has(key)) continue;
      target.src.push(entry);
      ownerByKey.set(key, target);
      attached += 1;
    }
    const [lead, ...rest] = target.src;
    if (target.src.length > before && lead !== undefined) {
      target.src = orderCardSources(lead, rest);
    }
  };
  for (const { id, src } of attachments) {
    const target = byId.get(id);
    if (target !== undefined) attach(target, src);
  }
  let added = 0;
  let duplicates = 0;
  const idCollisions: string[] = [];
  for (const card of incoming) {
    const target = srcKeys(card)
      .map((key) => ownerByKey.get(key))
      .find((c) => c !== undefined);
    if (target !== undefined) {
      duplicates += 1;
      attach(target, card.src);
      continue;
    }
    if (byId.has(card.id)) {
      idCollisions.push(card.id);
      continue;
    }
    const copy = { ...card, src: [...card.src] };
    merged.push(copy);
    byId.set(copy.id, copy);
    for (const key of srcKeys(copy)) {
      if (!ownerByKey.has(key)) ownerByKey.set(key, copy);
    }
    added += 1;
  }
  return {
    cards: sortCards(merged),
    added,
    duplicates,
    attached,
    idCollisions,
  };
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
