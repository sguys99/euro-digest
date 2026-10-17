/**
 * data/news 원본 삭제 계획 — 삭제 요청(takedown)과 소스별 보존 기간 (M1-25, PRD FR-143·§8.4·§15 D14·D32·D45) — 순수 함수만.
 * 파일 읽기·쓰기·로그는 purge-stage.ts(수집 실행), 남은 항목 경고는 publish-gate.ts(`npm run validate`)가 같은 계획을 쓴다.
 *
 * ── 삭제 요청 (FR-143) ────────────────────────────────────────────────
 *   `configs/takedowns.json`의 카드 ID와 **저장된 `card.id`가 같은 카드를 모든 날짜 파일에서** 지운다. 카드 ID는 날짜를 넘어
 *   유일하지 않다(같은 기사 재게시 — `c_fb2dd57b4a`가 2026-10-12·10-13 두 파일에 있다, M1-16 이월). URL에서 `cardIdFor`로
 *   다시 계산하지 않는다 — 옛 규칙 ID(2026-10-14까지 발행분)를 놓친다(card-id.ts 머리 주석). 등록만으로 적용된다(handledAt 무관).
 *   요청 단위는 카드다 — 그 카드의 링크가 다른 ID 카드의 출처로 남아 있어도 그 카드는 건드리지 않는다.
 *
 * ── 보존 기간 (D32 — The Athletic 7일) ───────────────────────────────
 *   카드 출처(`src[]`)에는 소스 id가 없어 **매체명(`src.n` = `publisherNameOf(소스)`)으로 소스를 찾는다**(M1-02 이월 — 스키마 변경 없음).
 *   같은 매체명의 소스가 여럿이면(BBC 4피드 등) 그중 가장 짧은 값을 쓴다 — validate가 '같은 매체명 = 같은 보존 기간'을 오류로
 *   지키므로(`publisherRetentionConflicts`) 평소에는 값이 하나다. 수집을 멈춘 소스도 담는다(과거 카드도 기간이 지나면 지운다).
 *   - 기준 시각 = min(`src.at` 기사 시각, `card.created` 카드 생성 시각) — **보수적인 쪽(더 일찍 만료)**. 우리 저장은 카드가 만들어진
 *     뒤(대표 출처) 또는 그보다 늦게(같은 날 재실행으로 붙은 출처) 시작하므로 `created`만 쓰면 붙은 출처가 늦게 지워질 수 있고,
 *     `src.at`(발행 시각)은 저장 시작보다 늦을 수 없다(수집 창의 미래 시각 낮춤 — collect-window.ts). 그래서 두 값 중 이른 쪽이면
 *     저장 기간이 보존 기간을 넘지 않는 한도에서 가장 이르다. 기사가 수집 창 끝(최대 51시간 전)이면 그만큼 일찍 지워진다.
 *   - 만료 시각 = 기준 + 보존 일수 × 24시간(정확히 7일이 된 순간부터 만료).
 *   - **수집 실행은 미리 지운다**(오케스트레이터 결정 2026-10-17 — D32 '7일만 보관' 취지): 만료 시각 ≤ 실행 시작 + 여유
 *     (`RETENTION_PURGE_LEAD_MS` = 30시간)이면 이번 실행에서 지운다. 삭제는 수집 실행에서만 일어나므로, 만료 뒤 첫 실행까지
 *     기다리면 실제 보관이 최대 '7일 + 실행 간격(약 하루)'이 된다. 여유 = 다음 커밋된 실행까지의 최대 간격:
 *     정기 실행 24시간 + 계절 전환 40분(여름 06:30 → 겨울 07:10, D26) + 백업 schedule 10분(06:40·07:20) + GitHub schedule 지연
 *     (수 분~수십 분, 넉넉히 4시간) + 실행 시작 → 커밋(collect job 상한 30분) ≈ 29.5시간 → 30시간. 대가: 실행 시작 30시간
 *     안에 만료될 출처를 지금 지우므로 최대 30시간 일찍 지워진다(보존 기간보다 짧게 보관 — 약관 쪽으로 보수적). 다음 실행이 통째로
 *     실패하면(백업 포함) 이 여유로도 막지 못한다 — 그때는 실패 이슈(collect.yml report-failure)가 남는다.
 *     예) 저녁 18:00 KST 수동 실행으로 생긴 카드(기사 17:30) → 7일 뒤 17:30 만료 → 그날 아침 정기 실행(11시간 전)이 지운다.
 *         06:40 백업 실행 카드(기사 = 생성 06:40) → 7일 뒤 06:40 만료 → 전날 아침 정기 실행(24시간 10분 전)이 지운다(6일 23시간 50분
 *         보관을 기다리면 다음 날 06:30 실행 — 만료 10분 전 — 에도 지워지지만, 그 실행이 겨울 07:10·지연 백업이면 넘는다).
 *   - **발행 검증 게이트(⑧ 경고)는 여유 없이 정확한 시각**으로 본다(`leadMs` 0 — 만료 뒤에도 남아 있는 출처만 경고).
 *   - 대표 출처(`src[0]` — 제목·카드 ID의 주인)가 만료되면 카드를 지우고, 아니면 만료된 출처만 뺀다. 보존 기간 소스는 다른 후보가
 *     있으면 대표가 되지 않으므로(D45 ② — card-lead.ts) 대부분 '그 출처만 삭제'다. 출처를 빼도 카드의 다른 필드(분류·중요도·
 *     `transfer.tier`)는 다시 계산하지 않는다(카드 생성 때의 판정 유지 — 화면의 '+N곳'은 출처 수로 줄어든다).
 *   - `data/briefs/`는 대상이 아니다(무기한 보존 — D45 ③). 월별 병합 파일(90일 뒤 — §8.4)은 아직 없다(병합 작업이 같은 계획을 쓸 것).
 *
 * ── 다시 올라오지 않게 ────────────────────────────────────────────────
 *   지운 카드·출처의 링크 해시(`urlHash` — seen-urls 키)는 기억(`data/cache/seen-urls.json`)에 남긴다(M1-12 이월 — 의도). 평소에는
 *   이미 있는 키다(발행 때 기억). 없으면(2026-10-14 이전 발행분 등) 처음 카드가 된 시각(`card.created`)으로 더한다.
 *   카드 순서는 바꾸지 않는다(남은 카드의 파일 순서 = 화면 순서 유지, 출처 순서도 유지).
 */
import type { CardSource, NewsCard, NewsFile, Source } from "@/lib/schema";

import { publisherNameOf } from "./news-file";
import type { SeenMap } from "./seen-urls";
import { urlHash } from "./url-normalize";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ─── 보존 기간 표 ────────────────────────────────────────────────────────

/** 매체명 → 보존 기간(일). 보존 기간을 둔 소스의 매체명만 담고, 같은 매체명은 가장 짧은 값(보수적). 순수 함수 */
export function retentionByPublisher(
  sources: readonly Pick<Source, "name" | "retentionDays">[],
): ReadonlyMap<string, number> {
  const table = new Map<string, number>();
  for (const source of sources) {
    if (source.retentionDays === undefined) continue;
    const name = publisherNameOf(source);
    const prev = table.get(name);
    table.set(
      name,
      prev === undefined
        ? source.retentionDays
        : Math.min(prev, source.retentionDays),
    );
  }
  return table;
}

/** 같은 매체명인데 보존 기간이 다른 소스 묶음(validate 오류 입력) */
export interface RetentionConflict {
  publisher: string;
  /** 그 매체명의 소스(설정 순서) — 보존 기간 없음은 null */
  sources: Array<{ index: number; id: string; retentionDays: number | null }>;
}

/**
 * '같은 매체명끼리 보존 기간이 같아야 한다'(M1-02 이월) — 어긋난 묶음. 카드 출처는 매체명으로 보존 기간을 찾으므로, 어긋나면
 * 어느 소스 기사인지에 따라 지워야 할 출처가 남거나(설정 의도와 다름) 지우지 않아도 될 출처가 지워진다. 보존 기간 없음도 한 값이다.
 */
export function publisherRetentionConflicts(
  sources: readonly Pick<Source, "id" | "name" | "retentionDays">[],
): RetentionConflict[] {
  const groups = new Map<string, RetentionConflict["sources"]>();
  sources.forEach((source, index) => {
    const name = publisherNameOf(source);
    const group = groups.get(name) ?? [];
    group.push({
      index,
      id: source.id,
      retentionDays: source.retentionDays ?? null,
    });
    groups.set(name, group);
  });
  const conflicts: RetentionConflict[] = [];
  for (const [publisher, group] of groups) {
    if (new Set(group.map((s) => s.retentionDays)).size > 1) {
      conflicts.push({ publisher, sources: group });
    }
  }
  return conflicts;
}

/** 출처 1건의 보존 기준·만료 시각(ms) — 머리 주석 '보존 기간'. 보존 기간이 없는 매체면 null */
export function sourceExpiryMs(
  card: Pick<NewsCard, "created">,
  src: Pick<CardSource, "n" | "at">,
  retention: ReadonlyMap<string, number>,
): { basisMs: number; expiresAtMs: number; days: number } | null {
  const days = retention.get(src.n);
  if (days === undefined) return null;
  const basisMs = Math.min(Date.parse(src.at), Date.parse(card.created));
  return { basisMs, expiresAtMs: basisMs + days * DAY_MS, days };
}

/**
 * 수집 실행의 보존 기간 미리 삭제 여유(머리 주석 '보존 기간' — 다음 커밋된 실행까지의 최대 간격). 판정에만 쓴다(만료 시각 자체는 그대로).
 */
export const RETENTION_PURGE_LEAD_MS = 30 * HOUR_MS;

/**
 * 지울 때가 됐는가 — 지금 + 여유 ≥ 만료 시각. 여유 0(기본)이면 정확히 보존 기간이 지난 순간부터(게이트 경고),
 * 수집 실행은 `RETENTION_PURGE_LEAD_MS`(다음 실행 전에 만료될 출처까지).
 */
export function isSourceExpired(
  card: Pick<NewsCard, "created">,
  src: Pick<CardSource, "n" | "at">,
  retention: ReadonlyMap<string, number>,
  nowMs: number,
  leadMs = 0,
): boolean {
  const expiry = sourceExpiryMs(card, src, retention);
  return expiry !== null && nowMs + leadMs >= expiry.expiresAtMs;
}

// ─── 삭제 계획 ───────────────────────────────────────────────────────────

/** 지울 카드 1장 */
export interface CardRemoval {
  id: string;
  /** takedown = 삭제 요청 · retention = 대표 출처의 보존 기간 만료(수집 실행은 여유 안에 만료될 예정 포함) */
  reason: "takedown" | "retention";
  /** 보존 기간 만료면 대표 출처 매체명·만료 시각(UTC ISO) */
  publisher?: string;
  expiresAt?: string;
  /** 지운 출처 수(대표 포함) */
  sources: number;
}

/** 카드에서 뺄 출처 1건(대표가 아닌 만료 출처) */
export interface SourceRemoval {
  /** 남는 카드의 ID */
  cardId: string;
  /** 원래 `src` 안 위치(1 이상) */
  index: number;
  publisher: string;
  expiresAt: string;
}

/** 바뀌는 날짜 파일 1개 */
export interface FilePurge {
  date: string;
  /** 남는 카드(원래 순서) */
  cards: NewsCard[];
  removedCards: CardRemoval[];
  removedSources: SourceRemoval[];
}

export interface PurgeInput {
  /** 일별 뉴스 파일(파일명 날짜 + 검증한 내용) */
  files: ReadonlyArray<{ date: string; file: NewsFile }>;
  /** `configs/takedowns.json`의 카드 ID */
  takedownIds: ReadonlySet<string>;
  /** `retentionByPublisher` */
  retention: ReadonlyMap<string, number>;
  /** 기준 시각(UTC ISO) — 수집 실행 시작(게이트는 validate 실행 시각) */
  now: string;
  /** 보존 기간 판정 여유(ms) — 기본 0(정확한 만료). 수집 실행은 `RETENTION_PURGE_LEAD_MS` */
  leadMs?: number;
}

export interface PurgePlan {
  /** 바뀌는 파일(날짜 오름차순) — 바뀌지 않는 파일은 없다 */
  files: FilePurge[];
  /** 기억에 남길 링크 해시 → 처음 카드가 된 시각(card.created, 같은 키는 이른 쪽) */
  seenKeys: SeenMap;
  /** data에서 찾은 takedown ID(파일 여러 개에 있어도 하나) */
  takedownsFound: string[];
  counts: {
    takedownCards: number;
    retentionCards: number;
    retentionSources: number;
  };
}

function addKey(target: SeenMap, src: CardSource, created: string): void {
  const key = urlHash(src.u);
  const prev = target.get(key);
  if (prev === undefined || Date.parse(created) < Date.parse(prev)) {
    target.set(key, created);
  }
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** 삭제 계획 — 머리 주석 규칙. 입력을 바꾸지 않는다 */
export function planPurge(input: PurgeInput): PurgePlan {
  const nowMs = Date.parse(input.now);
  const leadMs = input.leadMs ?? 0;
  const files: FilePurge[] = [];
  const seenKeys: SeenMap = new Map();
  const found = new Set<string>();
  const counts = { takedownCards: 0, retentionCards: 0, retentionSources: 0 };
  const sorted = [...input.files].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const { date, file } of sorted) {
    const cards: NewsCard[] = [];
    const removedCards: CardRemoval[] = [];
    const removedSources: SourceRemoval[] = [];
    for (const card of file.cards) {
      if (input.takedownIds.has(card.id)) {
        found.add(card.id);
        for (const src of card.src) addKey(seenKeys, src, card.created);
        removedCards.push({
          id: card.id,
          reason: "takedown",
          sources: card.src.length,
        });
        counts.takedownCards += 1;
        continue;
      }
      const expiries = card.src.map((src) =>
        isSourceExpired(card, src, input.retention, nowMs, leadMs)
          ? sourceExpiryMs(card, src, input.retention)
          : null,
      );
      const leadExpiry = expiries[0];
      const lead = card.src[0];
      if (leadExpiry && lead) {
        for (const src of card.src) addKey(seenKeys, src, card.created);
        removedCards.push({
          id: card.id,
          reason: "retention",
          publisher: lead.n,
          expiresAt: toIso(leadExpiry.expiresAtMs),
          sources: card.src.length,
        });
        counts.retentionCards += 1;
        continue;
      }
      const kept = card.src.filter((src, index) => {
        const expiry = expiries[index];
        if (!expiry) return true;
        addKey(seenKeys, src, card.created);
        removedSources.push({
          cardId: card.id,
          index,
          publisher: src.n,
          expiresAt: toIso(expiry.expiresAtMs),
        });
        counts.retentionSources += 1;
        return false;
      });
      cards.push(
        kept.length === card.src.length ? card : { ...card, src: kept },
      );
    }
    if (removedCards.length > 0 || removedSources.length > 0) {
      files.push({ date, cards, removedCards, removedSources });
    }
  }
  return {
    files,
    seenKeys,
    takedownsFound: [...found].sort(),
    counts,
  };
}

/** 계획이 비었는가(지울 것 없음) */
export function isEmptyPurge(plan: Pick<PurgePlan, "files">): boolean {
  return plan.files.length === 0;
}

/**
 * 기억(seen-urls.json `urls`)에 지운 링크 해시를 더한다 — **없는 키만** 더하고 있는 키는 그대로 둔다(시각도 유지).
 * `added` = 새로 생긴 키 수(0이면 파일을 다시 쓰지 않는다).
 */
export function mergeSeenKeys(
  stored: Readonly<Record<string, string>>,
  keys: ReadonlyMap<string, string>,
): { seen: SeenMap; added: number } {
  const seen: SeenMap = new Map(Object.entries(stored));
  let added = 0;
  for (const [key, at] of keys) {
    if (seen.has(key)) continue;
    seen.set(key, at);
    added += 1;
  }
  return { seen, added };
}
