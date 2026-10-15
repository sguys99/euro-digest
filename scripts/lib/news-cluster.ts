/**
 * 뉴스 클러스터 계획 — 같은 URL 묶음(dedup.ts) 위에서 같은 사건을 묶고, 이전 카드·오늘 카드와의 관계를 정한다
 * (PRD FR-04·FR-05, plan M1-13) — 순수 함수. 제목 유사도 자체는 cluster.ts.
 * 아래 ①~④는 plan의 'M1-12 이월 메모'(M1-13 항목) 번호다 — tests/news-cluster.test.ts도 같은 번호를 쓴다.
 *
 * ── ① 입력: 같은 URL 묶음 위의 단계 ─────────────────────────────────────────
 *   창 안 묶음 전부(`DedupGroup[]` — 설정 순서), 소스 설정, 기억(seen-urls.ts `SeenIndex`), 오늘 발행 파일의 카드.
 *   다른 날 카드였던 URL도 **빼지 않고 함께** 묶는다 — 그래야 '어제 카드와 같은 사건의 늦은 기사'를 알아본다.
 *   출력(`ClusterPlan`)은 세 갈래다: `fresh`(새 카드 후보) · `seenBefore`(②) · `existing`(③).
 *
 * ── ② 다른 날 카드였던 사건 — `seenBefore` ─────────────────────────────────
 *   다른 날 카드였던(또는 오늘 카드였다가 삭제된) URL이 하나라도 든 클러스터는 **통째로 뺀다**(이미 보도한 사건 — 겹침 창으로
 *   다시 들어온 어제 기사와 같은 사건의 늦은 기사가 다시 카드가 되지 않게). 오늘 카드와 같은 클러스터면 ③이 우선한다
 *   (오늘 이미 보인 사건 — 기억에 있던 URL만 출처로 붙이지 않는다, 집계 `existingSeenBefore`).
 *   이 규칙이 새 소식을 지우지 않으려면 묶음이 엄격해야 한다 — cluster.ts의 시각 차 가산(8→24시간 +0.1)·같은 매체 12시간
 *   제한이 하루쯤 지난 후속 소식을 어제 클러스터에 넣지 않는다. 실행 로그 `seenBeforeExtra`(기억에 없던 묶음인데 같은
 *   클러스터라서 빠진 수)로 지켜본다.
 *
 * ── ③ 같은 날 재실행 — `existing` ─────────────────────────────────────────
 *   오늘 파일에 이미 있는 카드와 같은 사건인 클러스터. 오늘 카드마다 그 카드의 제목을 고정 묶음(anchor) 문서로 넣어 함께
 *   묶는다 — 오늘 카드 URL이 다시 들어온 묶음은 그 카드에 바로 붙이고(제목 비교 없음), 제목이 비슷한 새 묶음은 그 카드의
 *   **새 출처**(`additions`)가 된다(카드 id·created 유지, 출처 스택 +N). 서로 다른 오늘 카드 둘은 한 클러스터가 되지
 *   않는다(이미 발행된 카드를 합치지 않는다 — 공유 앵커 유지).
 *
 * ── ④ 보도 매체 수 ──────────────────────────────────────────────────────
 *   클러스터 크기 = 묶음 수가 아니라 **매체명(`publisherNameOf`) 수**다 — BBC 피드 4개·국내 섹션/전체기사 피드는 한 매체.
 *   점수화(M1-14, FR-06 '클러스터 크기(보도 매체 수)') 입력.
 *
 * 대표 항목은 지금 클러스터의 첫 묶음(설정 순서상 처음 — dedup.ts와 같은 규칙)이다. Tier·weight·최신성 순 대표 선정은
 * M1-15가 `members`로 한다.
 */
import type { CardSource, FeedItem, NewsCard, Source } from "@/lib/schema";

import {
  DEFAULT_CLUSTER_POLICY,
  clusterDocs,
  type ClusterDoc,
  type ClusterPolicy,
} from "./cluster";
import { groupSource, type DedupGroup, type GroupSourceMeta } from "./dedup";
import { buildCard, publisherNameOf } from "./news-file";
import { cardKeys, filterUnseen, type SeenIndex } from "./seen-urls";

// ─── 클러스터 함수 ─────────────────────────────────────────────────────────

/** 문서 → 클러스터(입력 번호) — 기본은 제목 유사도(cluster.ts `clusterDocs`) */
export type ClusterFn = (
  docs: readonly ClusterDoc[],
  policy: ClusterPolicy,
) => number[][];

/**
 * 클러스터링 없이 문서마다 혼자인 클러스터 — 제목 유사도 단계(`ClusterFn`)가 예상 밖 오류로 실패했을 때 수집 실행이 쓰는
 * 대체 경로(같은 URL 묶음·기억·오늘 카드 규칙은 그대로, 같은 사건 카드만 합쳐지지 않는다).
 */
export const singletonClusters: ClusterFn = (docs) => docs.map((_, k) => [k]);

// ─── 클러스터 ────────────────────────────────────────────────────────────

/** 같은 사건 묶음 클러스터 */
export interface NewsCluster {
  /** 구성 묶음(입력 순서) — 첫 번째가 지금의 대표 */
  members: DedupGroup[];
  /** 보도 매체명(처음 나온 순서, 중복 없음) — 클러스터 크기 = publishers.length */
  publishers: string[];
}

/** 묶음들의 보도 매체명 — 묶음마다 그 URL을 낸 소스 전부의 매체명(설정에 없는 소스는 건너뜀), 중복 없음 */
export function clusterPublishers(
  members: readonly Pick<DedupGroup, "sources">[],
  sourceById: ReadonlyMap<string, Source>,
): string[] {
  const names: string[] = [];
  for (const member of members) {
    for (const id of member.sources) {
      const source = sourceById.get(id);
      if (source === undefined) continue;
      const name = publisherNameOf(source);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** 묶음 배열 → 클러스터(매체명 계산) */
export function toCluster(
  members: DedupGroup[],
  sourceById: ReadonlyMap<string, Source>,
): NewsCluster {
  return { members, publishers: clusterPublishers(members, sourceById) };
}

/**
 * 클러스터의 소스 메타 — 대표 묶음의 대표 소스를 앞에 두고 모든 구성 묶음의 소스 id(중복 없음)를 dedup.ts `groupSource`로
 * 합친다: 카드용 소스 = 대표 소스 + 대회 합집합, 점수화 입력 = 최고 tier·최대 weight·최단 보존 기간. 대표 소스가 설정에
 * 없으면 null(호출부가 그 클러스터를 건너뛴다), 설정에 없는 나머지 소스는 빼고 합친다.
 */
export function clusterSourceMeta(
  cluster: Pick<NewsCluster, "members">,
  sourceById: ReadonlyMap<string, Source>,
): GroupSourceMeta | null {
  const ids = [...new Set(cluster.members.flatMap((m) => m.sources))];
  return groupSource({ sources: ids }, sourceById);
}

/** 클러스터에서 가장 최근 발행 항목(같으면 앞 묶음) — 최신순 선별 키 */
export function latestItem(cluster: Pick<NewsCluster, "members">): FeedItem {
  const [first, ...rest] = cluster.members;
  if (first === undefined) throw new Error("빈 클러스터");
  return rest.reduce(
    (best, g) =>
      Date.parse(g.item.publishedAt) > Date.parse(best.publishedAt)
        ? g.item
        : best,
    first.item,
  );
}

/** 묶음 1개 → 카드 출처 1건(대표 소스의 매체명·tier, 링크·시각은 피드 원문). 대표 소스가 설정에 없으면 null */
export function groupCardSource(
  group: Pick<DedupGroup, "item" | "sources">,
  sourceById: ReadonlyMap<string, Source>,
): CardSource | null {
  const source = sourceById.get(group.sources[0] ?? "");
  if (source === undefined) return null;
  return {
    n: publisherNameOf(source),
    u: group.item.url,
    at: group.item.publishedAt,
    tier: source.tier,
  };
}

/**
 * 클러스터 → 원제목 카드: 대표 = 첫 묶음(설정 순서상 처음 — M1-15가 Tier·weight·최신성으로 바꾼다)의 피드 원문 제목·링크,
 * 출처 = 대표 + 나머지 묶음(입력 순서, 묶음마다 1건), 카드 소스 = 대표 소스 + 클러스터 대회 합집합. 대표 소스가 설정에
 * 없으면 null(그 클러스터는 건너뛴다), 나머지 묶음 중 소스가 설정에 없는 것은 출처에서 뺀다.
 */
export function buildClusterCard(
  cluster: NewsCluster,
  sourceById: ReadonlyMap<string, Source>,
  created: string,
): NewsCard | null {
  const [lead, ...rest] = cluster.members;
  const meta = clusterSourceMeta(cluster, sourceById);
  if (lead === undefined || meta === null) return null;
  const more = rest.flatMap((g) => {
    const src = groupCardSource(g, sourceById);
    return src ? [src] : [];
  });
  return buildCard(lead.item, meta.card, created, more);
}

// ─── 계획 ────────────────────────────────────────────────────────────────

/** 오늘 이미 있는 카드와 같은 사건인 클러스터 */
export interface ExistingCardCluster extends NewsCluster {
  /** 오늘 발행 파일의 카드 id */
  cardId: string;
  /** 구성 묶음 중 카드에 아직 없는 것 — 새 출처로 붙인다(다른 날 카드였던 URL은 빼고) */
  additions: DedupGroup[];
}

export interface ClusterPlanInput {
  /** 창 안 묶음 전부(설정 순서) */
  groups: readonly DedupGroup[];
  sourceById: ReadonlyMap<string, Source>;
  /** 기억(seen-urls.ts `buildSeenIndex`) */
  index: Pick<SeenIndex, "seen" | "todayKeys">;
  /** 오늘 발행 파일의 기존 카드(없으면 []) */
  todayCards: readonly NewsCard[];
  policy?: ClusterPolicy;
}

/** 계획 집계(로그용) */
export interface ClusterPlanStats {
  /** 입력 묶음 수 */
  groups: number;
  /** 새 카드 후보 클러스터 수 */
  fresh: number;
  /** 그중 묶음이 둘 이상인 클러스터 수 */
  multi: number;
  /** 새 클러스터에 합쳐져 카드가 되지 않는 묶음 수(= 새 클러스터 묶음 수 − 새 클러스터 수) */
  merged: number;
  /** 가장 큰 새 클러스터의 보도 매체 수 */
  maxPublishers: number;
  /** 후보가 있는 오늘 카드 수 */
  existing: number;
  /** 오늘 카드에 새 출처로 붙일 묶음 수 */
  additions: number;
  /** 오늘 카드 클러스터에 든 다른 날 카드 URL 묶음 수(출처로 붙이지 않고 뺀다 — ②) */
  existingSeenBefore: number;
  /** 다른 날 카드와 같은 사건이라 뺀 클러스터 수 */
  seenBefore: number;
  /** 그 클러스터들의 묶음 수 */
  seenBeforeGroups: number;
  /** 그중 기억에 없던 묶음 수(같은 클러스터라서 빠진 늦은 기사 — 클러스터 통째 제외 규칙의 영향) */
  seenBeforeExtra: number;
}

export interface ClusterPlan {
  fresh: NewsCluster[];
  existing: ExistingCardCluster[];
  seenBefore: NewsCluster[];
  stats: ClusterPlanStats;
}

/** 카드의 대표 제목·시각·매체 → 고정 묶음 문서 */
function anchorDoc(card: NewsCard): ClusterDoc {
  const lead = card.src[0];
  return {
    title: card.t,
    lang: card.lang,
    publishedAt: lead?.at ?? card.created,
    publisher: lead?.n ?? null,
    anchor: card.id,
  };
}

/** 머리 주석 ①~④의 계획. `cluster`는 테스트·대체 경로 주입용(기본 제목 유사도) */
export function planNewsClusters(
  input: ClusterPlanInput,
  cluster: ClusterFn = clusterDocs,
): ClusterPlan {
  const { groups, sourceById, index, todayCards } = input;
  const policy = input.policy ?? DEFAULT_CLUSTER_POLICY;

  // 오늘 카드 URL 키 → 카드 id (같은 키가 두 카드에 있으면 앞 카드)
  const cardIdByKey = new Map<string, string>();
  for (const card of todayCards) {
    for (const key of cardKeys([card])) {
      if (!cardIdByKey.has(key)) cardIdByKey.set(key, card.id);
    }
  }
  const seenBeforeKeys = new Set(
    filterUnseen(groups, index).seenBefore.map((g) => g.key),
  );

  // 문서: 오늘 카드 고정 묶음(카드 순서) + 오늘 카드에 없는 묶음(입력 순서). 오늘 카드 URL 묶음은 그 카드에 바로 붙인다.
  const docs: ClusterDoc[] = todayCards.map(anchorDoc);
  const docGroups: Array<DedupGroup | null> = todayCards.map(() => null);
  const folded = new Map<string, DedupGroup[]>();
  for (const group of groups) {
    const cardId = cardIdByKey.get(group.key);
    if (cardId !== undefined) {
      folded.set(cardId, [...(folded.get(cardId) ?? []), group]);
      continue;
    }
    const source = sourceById.get(group.sources[0] ?? "");
    docs.push({
      title: group.item.title,
      lang: group.item.lang,
      publishedAt: group.item.publishedAt,
      publisher: source ? publisherNameOf(source) : null,
    });
    docGroups.push(group);
  }

  const order = new Map(groups.map((g, i) => [g.key, i] as const));
  const byInput = (a: DedupGroup, b: DedupGroup) =>
    (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);

  const fresh: NewsCluster[] = [];
  const existing: ExistingCardCluster[] = [];
  const seenBefore: NewsCluster[] = [];
  let seenBeforeExtra = 0;
  let existingSeenBefore = 0;
  for (const indices of cluster(docs, policy)) {
    const anchorIndex = indices.find((k) => k < todayCards.length);
    const members = indices.flatMap((k) => {
      const group = docGroups[k];
      return group ? [group] : [];
    });
    if (anchorIndex !== undefined) {
      const card = todayCards[anchorIndex];
      if (card === undefined) continue;
      const all = [...(folded.get(card.id) ?? []), ...members].sort(byInput);
      if (all.length === 0) continue; // 이번 후보가 없는 오늘 카드
      const additions = members.filter((g) => !seenBeforeKeys.has(g.key));
      existingSeenBefore += members.length - additions.length;
      existing.push({
        ...toCluster(all, sourceById),
        cardId: card.id,
        additions,
      });
      continue;
    }
    if (members.length === 0) continue;
    const cluster = toCluster(members, sourceById);
    if (members.some((g) => seenBeforeKeys.has(g.key))) {
      seenBefore.push(cluster);
      seenBeforeExtra += members.filter(
        (g) => !seenBeforeKeys.has(g.key),
      ).length;
    } else {
      fresh.push(cluster);
    }
  }

  const freshGroups = fresh.reduce((sum, c) => sum + c.members.length, 0);
  return {
    fresh,
    existing,
    seenBefore,
    stats: {
      groups: groups.length,
      fresh: fresh.length,
      multi: fresh.filter((c) => c.members.length > 1).length,
      merged: freshGroups - fresh.length,
      maxPublishers: Math.max(0, ...fresh.map((c) => c.publishers.length)),
      existing: existing.length,
      additions: existing.reduce((sum, c) => sum + c.additions.length, 0),
      existingSeenBefore,
      seenBefore: seenBefore.length,
      seenBeforeGroups: seenBefore.reduce((s, c) => s + c.members.length, 0),
      seenBeforeExtra,
    },
  };
}
