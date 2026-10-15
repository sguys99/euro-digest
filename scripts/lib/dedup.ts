/**
 * 같은 URL 중복 제거 + 소스 메타 합치기 (PRD FR-04, plan M1-12) — 순수 함수.
 *
 * 키는 정규화 URL 해시(scripts/lib/url-normalize.ts `urlHash`)다. 같은 키의 항목은 한 묶음(`DedupGroup`)이 된다.
 *   - 대표 항목 = 입력 순서상 처음 나온 항목. 수집 결과는 설정 순서(feed-collect.ts)라 실행마다 같은 항목이 대표가 된다.
 *     대표 항목의 제목·링크·시각은 **피드 원문 그대로** 카드에 쓴다(링크도 원문 — 정규화 URL은 키로만, FR-20).
 *   - 묶음의 소스 id는 처음 나온 순서·중복 없이 모두 남긴다(M1-02 이월: 같은 링크가 BBC Football(대회 태그 없음)과
 *     Premier League 피드(EPL)에 함께 있으면 카드가 EPL 태그를 잃지 않게).
 *   - 묶음 소스 메타(`mergeSourceMeta`)는 두 갈래로 나눈다:
 *     ① 카드용 소스(`card`) = **대표 소스 그대로 + 대회만 합집합**(처음 나온 순서). 카드 출처 `src[].n`(매체명)과
 *        `src[].tier`는 같은 출처(대표 소스) 자신의 값이어야 하므로 tier·weight·보존 기간은 합치지 않는다.
 *     ② 점수화(M1-14) 입력 = 묶음 소스 중 가장 높은 tier(`bestTier` — 숫자가 작은 쪽, Tier 1이 가장 높음, FR-06)·
 *        최대 weight(`maxWeight`)·가장 짧은 보존 기간(`minRetentionDays` — 보관 제한 출처가 섞인 경우, D32·M1-25 참고).
 *        카드·data/에는 쓰지 않는다.
 * 다른 URL의 같은 사건(제목 유사도)은 여기서 묶지 않는다 — 클러스터링(M1-13) 몫이다.
 */
import type { CompId, FeedItem, Source, Tier } from "@/lib/schema";

import { urlHash } from "./url-normalize";

/** 같은 정규화 URL 항목 묶음 */
export interface DedupGroup {
  /** 정규화 URL 해시(seen-urls 키) */
  key: string;
  /** 대표 항목 — 입력 순서상 처음 나온 항목(피드 원문 그대로) */
  item: FeedItem;
  /** 이 URL을 낸 소스 id(처음 나온 순서, 중복 없음) — 첫 번째가 대표 항목의 소스 */
  sources: string[];
  /** 합친 항목 수(대표 포함) */
  count: number;
}

export interface DedupResult {
  /** 묶음(대표 항목이 처음 나온 순서) */
  groups: DedupGroup[];
  /** 대표가 아닌 항목 수 = 입력 수 − 묶음 수 */
  duplicates: number;
}

/** 정규화 URL 해시로 항목을 묶는다(대표 = 처음 나온 항목, 소스 id는 모두 남김). */
export function dedupeFeedItems(items: readonly FeedItem[]): DedupResult {
  const byKey = new Map<string, DedupGroup>();
  for (const item of items) {
    const key = urlHash(item.url);
    const group = byKey.get(key);
    if (group === undefined) {
      byKey.set(key, { key, item, sources: [item.source], count: 1 });
      continue;
    }
    group.count += 1;
    if (!group.sources.includes(item.source)) group.sources.push(item.source);
  }
  const groups = [...byKey.values()];
  return { groups, duplicates: items.length - groups.length };
}

/** 묶음 소스 메타 — 카드용 소스와 점수화 입력을 나눠 둔다(머리 주석) */
export interface GroupSourceMeta {
  /** 카드용 소스 = 대표 소스 그대로 + 대회 합집합(출처명·tier·weight·보존 기간은 대표 소스 자신의 값) */
  card: Source;
  /** 묶음 소스(대표 먼저, 설정에서 찾은 것만) */
  sources: Source[];
  /** 점수화(M1-14) 입력 — 묶음 소스 중 가장 높은 tier(숫자가 작은 쪽) */
  bestTier: Tier;
  /** 점수화(M1-14) 입력 — 묶음 소스 중 최대 weight */
  maxWeight: number;
  /** 묶음 소스 중 가장 짧은 보존 기간(일) — 아무도 없으면 null */
  minRetentionDays: number | null;
}

/** 묶음 소스들의 메타를 합친다 — 머리 주석의 ①·② (대표 = 첫 번째, 원본 소스는 바꾸지 않는다). */
export function mergeSourceMeta(
  sources: readonly [Source, ...Source[]],
): GroupSourceMeta {
  const [lead] = sources;
  const competitions: CompId[] = [];
  for (const source of sources) {
    for (const comp of source.competitions) {
      if (!competitions.includes(comp)) competitions.push(comp);
    }
  }
  const retention = sources
    .map((s) => s.retentionDays)
    .filter((d): d is number => d !== undefined);
  return {
    card: { ...lead, competitions },
    sources: [...sources],
    bestTier: sources.reduce<Tier>(
      (best, s) => (s.tier < best ? s.tier : best),
      lead.tier,
    ),
    maxWeight: Math.max(...sources.map((s) => s.weight)),
    minRetentionDays: retention.length > 0 ? Math.min(...retention) : null,
  };
}

/**
 * 묶음의 소스 메타 — 묶음 소스 id를 설정에서 찾아 `mergeSourceMeta`. 대표 소스를 찾지 못하면 null(설정에 없는 소스 —
 * 호출부가 그 항목을 건너뛴다). 대표가 아닌 소스 id를 찾지 못하면 그 소스만 빼고 합친다.
 * 같은 사건 클러스터(news-cluster.ts `clusterSourceMeta`, M1-13)도 구성 묶음들의 소스 id를 모아 이 함수로 합친다.
 */
export function groupSource(
  group: Pick<DedupGroup, "sources">,
  sourceById: ReadonlyMap<string, Source>,
): GroupSourceMeta | null {
  const [leadId, ...restIds] = group.sources;
  const lead = leadId === undefined ? undefined : sourceById.get(leadId);
  if (lead === undefined) return null;
  const rest = restIds.flatMap((id) => {
    const source = sourceById.get(id);
    return source ? [source] : [];
  });
  return mergeSourceMeta([lead, ...rest]);
}
