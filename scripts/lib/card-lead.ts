/**
 * 카드 대표·출처 순서 — 같은 사건 클러스터(news-cluster.ts)의 묶음 중 카드 제목·링크·ID가 될 **대표**를 고르고, 카드
 * 출처(`src`) 순서를 정한다 (PRD FR-20·FR-05, D23, plan M1-15) — 순수 함수.
 *
 * ── 대표 (카드 `id`·`t`·`lang`·`src[0]`이 이 묶음에서 나온다) ──────────────────────
 *   클러스터 구성 묶음(`NewsCluster.members` — 입력 순서) 중 다음 순서로 1위(`compareLeadRanks`):
 *     ⓪ 보존 기간 후순위(`retentionLast`, 사용자 결정 2026-10-16) — 보존 기간이 짧은 소스(`Source.retentionDays`가 있는 소스 —
 *        지금 The Athletic 7일, PRD §15 D32)의 묶음은 클러스터에 다른 후보가 있으면 맨 뒤. 그런 출처가 대표면 만료 때 카드가
 *        통째로 지워져(M1-25 — 대표 출처 만료 = 카드 삭제) 같은 사건의 다른 출처와 공유 앵커까지 사라진다. 대표가 아니면 만료 때
 *        그 출처만 빠지고 카드는 남는다. 다른 후보가 없으면 지금처럼 대표가 된다(아래 ①~④로).
 *     ① Tier — 묶음 소스 중 가장 높은 Tier(숫자가 작은 쪽 — dedup.ts `bestTier`, FR-06)
 *     ② weight — 묶음 소스 중 최대 weight(`maxWeight` — 같은 URL이 BBC Football(3)·Premier League(2) 피드에 함께 있으면 3)
 *     ③ 최신성 — 발행 시각이 늦은 쪽(같은 사건의 가장 새 소식). 수집 시각으로 낮춘 기사(collect-window.ts `future-clamped`)는
 *        발행 시각을 믿을 수 없어 같은 Tier·weight 안에서 시각을 아는 기사 뒤에 둔다(score.ts 최신성과 같은 취지 — M1-14)
 *     ④ 입력 순서(설정 순서 — 결정적)
 *   대표가 될 수 없는 묶음은 건너뛰고 다음 후보가 대표가 된다:
 *     - 대표 소스가 설정에 없음(`unknownSource` — 카드 출처를 만들 수 없다. 출처에서도 빠진다 — groupCardSource)
 *     - 제목이 200자 초과(`titleTooLong` — 방어선. 정규화(normalize.ts)가 이미 그 항목을 건너뛰므로 수집 실행에서는 오지 않는다.
 *       카드 파일 검증(NewsFileSchema `t` ≤ 200)이 실패해 그날 뉴스 전체가 멈추지 않게 한다. 출처로는 남는다 — 제목을 쓰지 않음)
 *   후보가 하나도 없으면 카드를 만들지 않는다.
 *   언어가 섞인 클러스터(en·es·it — 국내·해외는 묶이지 않는다, D30)는 대표가 카드 `lang`(제목 언어)을 정한다.
 *   대표의 제목·링크는 피드 원문 그대로다(normalize.ts `cleanTitle` 정리만 — D23).
 *
 * ── 나머지 출처 순서 (`src[1..]`, `compareCardSources`) ─────────────────────────────
 *   Tier 오름차순 → 발행 시각 내림차순(최신 먼저) → URL 오름차순. 카드에 저장된 값(`tier`·`at`·`u`)만으로 정해지므로 같은 날
 *   재실행에서 기존 카드에 출처를 붙일 때(news-file.ts `mergeCards`)도 같은 규칙으로 다시 줄 세운다 — 파일 순서가 항상 이
 *   규칙이라 화면(M1-31 출처 스택)은 파일 순서 그대로 그린다. weight는 카드에 저장되지 않아(설정 값) 이 규칙에 넣지 않는다.
 *   지금 설정에서는 국내·해외가 한 클러스터가 되지 않고 해외 활성 소스는 모두 Tier 2·국내는 모두 Tier 3이라 사실상 최신순이다.
 *
 * ── 같은 날 재실행 ──────────────────────────────────────────────────────────
 *   오늘 파일에 이미 있는 카드는 대표를 다시 고르지 않는다 — id·제목·`src[0]`·created 유지(공유 앵커, M1-13 ③). 더 높은
 *   Tier·weight의 기사가 나중에 들어와도 그 카드의 출처(`src[1..]`)로 붙는다.
 */
import {
  FEED_ITEM_TITLE_MAX,
  type CardSource,
  type FeedItem,
  type Source,
} from "@/lib/schema";

import { groupSource, type DedupGroup } from "./dedup";

/** 대표 선정 선택 사항 */
export interface LeadOptions {
  /** 수집 시각으로 낮춘 기사인가(collect-window.ts `clampedItemKey`) — 없으면 모두 아님 */
  isClamped?: (item: FeedItem) => boolean;
}

/** 대표 후보 순위 키 */
export interface LeadRank {
  /** 보존 기간이 짧은 소스(retentionDays)의 묶음인가 — 다른 후보가 있으면 맨 뒤(머리 주석 ⓪, D32·M1-25) */
  retentionLimited: boolean;
  /** 묶음 소스 중 가장 높은 Tier(숫자가 작을수록 높다) */
  tier: number;
  /** 묶음 소스 중 최대 weight */
  weight: number;
  /** 발행 시각(ms) — 수집 시각으로 낮춘 기사는 null(시각 모름) */
  atMs: number | null;
  /** 클러스터 안 입력 순서 */
  index: number;
}

/** 대표 순위 비교 — 앞설수록 음수(머리 주석 ⓪~④) */
export function compareLeadRanks(a: LeadRank, b: LeadRank): number {
  if (a.retentionLimited !== b.retentionLimited) {
    return a.retentionLimited ? 1 : -1; // ⓪ 보존 기간 후순위
  }
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.weight !== b.weight) return b.weight - a.weight;
  if (a.atMs !== b.atMs) {
    if (a.atMs === null) return 1;
    if (b.atMs === null) return -1;
    return b.atMs - a.atMs;
  }
  return a.index - b.index;
}

/** 대표 후보에서 뺀 묶음 수(로그용) */
export interface LeadSkipCounts {
  /** 대표 소스가 설정에 없음 */
  unknownSource: number;
  /** 제목 200자 초과 */
  titleTooLong: number;
}

/** 대표 선정 결과 */
export interface ClusterLead {
  /** 대표 묶음 — 대표가 될 수 있는 묶음이 없으면 null(카드를 만들지 않는다) */
  lead: DedupGroup | null;
  /** 나머지 묶음(입력 순서) — 카드 출처 순서는 `orderCardSources`가 정한다. lead가 null이면 구성 묶음 전부 */
  rest: DedupGroup[];
  /** 대표가 입력 순서상 첫 묶음이 아니다(Tier·weight·최신성으로 바뀜 — 로그용) */
  reordered: boolean;
  skipped: LeadSkipCounts;
}

/**
 * 클러스터 구성 묶음 → 대표 + 나머지(머리 주석). 대표가 될 수 있는 묶음이 없으면 `lead: null`(카드를 만들지 않는다).
 * 원본 배열·묶음은 바꾸지 않는다.
 */
export function pickClusterLead(
  members: readonly DedupGroup[],
  sourceById: ReadonlyMap<string, Source>,
  options: LeadOptions = {},
): ClusterLead {
  const skipped: LeadSkipCounts = { unknownSource: 0, titleTooLong: 0 };
  let best: { rank: LeadRank; group: DedupGroup } | null = null;
  for (const [index, group] of members.entries()) {
    const meta = groupSource(group, sourceById);
    if (meta === null) {
      skipped.unknownSource += 1;
      continue;
    }
    if (group.item.title.length > FEED_ITEM_TITLE_MAX) {
      skipped.titleTooLong += 1;
      continue;
    }
    const clamped = options.isClamped?.(group.item) ?? false;
    const rank: LeadRank = {
      // 같은 링크를 낸 소스 중 하나라도 보존 기간이 있으면(minRetentionDays — M1-25 보존 입력과 같은 값)
      retentionLimited: meta.minRetentionDays !== null,
      tier: meta.bestTier,
      weight: meta.maxWeight,
      atMs: clamped ? null : Date.parse(group.item.publishedAt),
      index,
    };
    if (best === null || compareLeadRanks(rank, best.rank) < 0) {
      best = { rank, group };
    }
  }
  if (best === null) {
    return { lead: null, rest: [...members], reordered: false, skipped };
  }
  const { group: lead, rank } = best;
  return {
    lead,
    rest: members.filter((g) => g !== lead),
    reordered: rank.index !== 0,
    skipped,
  };
}

/** 나머지 출처 순서 비교 — Tier 오름차순 → 발행 시각 내림차순 → URL 오름차순(머리 주석) */
export function compareCardSources(a: CardSource, b: CardSource): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const byTime = Date.parse(b.at) - Date.parse(a.at);
  if (byTime !== 0) return byTime;
  return a.u < b.u ? -1 : a.u > b.u ? 1 : 0;
}

/** 카드 출처 = 대표 출처 + 나머지(`compareCardSources` 순). 입력 배열은 바꾸지 않는다. */
export function orderCardSources(
  lead: CardSource,
  rest: readonly CardSource[],
): CardSource[] {
  return [lead, ...[...rest].sort(compareCardSources)];
}
