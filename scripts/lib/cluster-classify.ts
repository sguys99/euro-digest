/**
 * 새 클러스터 분류 + 엔티티 2단계 병합 단계 (plan M1-17 — classify.ts·entity-merge.ts를 클러스터 계획 위에 잇는다) — 순수 함수.
 *
 *   ① 새 클러스터(news-cluster.ts `fresh`)마다 코드 분류 분석(classify.ts `analyzeCluster` — 모든 구성 묶음 제목 + 메모리 안 요약문)
 *   ② 엔티티 2단계 병합(D42 — entity-merge.ts): 같은 경기(같은 두 팀 + 같은 스코어 + 12시간 — 스코어가 있는 클러스터만) 새 클러스터끼리
 *      합치고, 오늘 카드(같은 날 재실행)와 같은 경기인 새 클러스터는 그 카드의 출처로 돌린다(카드 id·제목 유지). 오늘 카드의 열쇠는 저장된 `teams`와 원제목에서 만든다(M1-17 전 카드는 `teams`가
 *      비어 대상이 아니다).
 *   ③ 합친 클러스터를 다시 분석한다(합친 제목 전체 — 대회·카테고리·kr이 합집합 근거를 쓰게).
 * 결과 클러스터 순서는 첫 구성 묶음의 입력 순서(호출부 `groupOrder`)다. 점수화·선별·중요도는 호출부(collect-run.ts)가 이 결과로 한다.
 */
import type { NewsCard } from "@/lib/schema";

import {
  analyzeCluster,
  isMatchReportText,
  titleSignals,
  type ClassifyContext,
  type ClusterAnalysis,
} from "./classify";
import { scriptOf } from "./cluster";
import type { DedupGroup } from "./dedup";
import {
  entityOf,
  planEntityMerges,
  type EntityKey,
  type EntityMergeStats,
} from "./entity-merge";
import { toCluster, type NewsCluster } from "./news-cluster";
import type { ManagerIndex } from "./news-keywords";

/** 분류·병합 결과 */
export interface ClassifiedClusters {
  /** 병합 뒤 새 클러스터(첫 구성 묶음의 입력 순서) */
  fresh: NewsCluster[];
  /** 클러스터 → 분석(이 결과의 `fresh`에 든 클러스터만) */
  analysisOf: (cluster: NewsCluster) => ClusterAnalysis | undefined;
  /** 오늘 카드에 출처로 붙일 묶음(D42 ⑥) */
  attachments: Array<{ cardId: string; groups: DedupGroup[] }>;
  stats: EntityMergeStats;
}

/**
 * 오늘 카드(저장된 값)의 엔티티 열쇠 — 저장된 카테고리가 '경기 결과'이고 원제목이 경기 기사(classify.ts `isMatchReportText` — 경기 전·
 * 부상·이적·감독구단(감독 발언 문형 포함 — `managers`, D47 사용자 결정 A)·묶음 신호 없음)이고 원제목에 스코어가 있을 때만, 저장된 팀
 * 태그 + 원제목 스코어, 가장 이른 출처 시각. 새 클러스터와 같은 조건이다(D42 ⑥ — 신호는 classify.ts `titleSignals` 공용).
 */
export function todayCardEntity(
  card: Pick<NewsCard, "t" | "lang" | "teams" | "src" | "cat">,
  managers: ManagerIndex,
): EntityKey | null {
  if (card.cat !== "result") return null;
  const s = titleSignals(card.t, card.lang, managers);
  return entityOf(
    {
      matchResult: isMatchReportText(s, card.teams.length > 0),
      roundup: s.roundup,
      teams: card.teams,
      scores: s.preview ? [] : s.scores,
      script: scriptOf(card.lang),
    },
    Math.min(...card.src.map((x) => Date.parse(x.at))),
  );
}

/** 새 클러스터 → 분석 + D42 병합(머리 주석) */
export function classifyClusters(input: {
  fresh: readonly NewsCluster[];
  todayCards: readonly NewsCard[];
  ctx: ClassifyContext;
  /** 묶음 → 입력 순서(작을수록 앞) */
  groupOrder: (group: DedupGroup) => number;
}): ClassifiedClusters {
  const { ctx, groupOrder } = input;
  const analyses = new Map<NewsCluster, ClusterAnalysis>();
  const first = input.fresh.map((cluster) => {
    const analysis = analyzeCluster(cluster, ctx);
    analyses.set(cluster, analysis);
    return analysis;
  });
  const plan = planEntityMerges({
    fresh: first.map((a) => entityOf(a, a.earliestMs)),
    today: input.todayCards.map((card) => ({
      cardId: card.id,
      key: todayCardEntity(card, ctx.keywords.managers),
    })),
  });

  const absorbed = new Set<number>();
  const merged: NewsCluster[] = [];
  for (const indices of plan.merges) {
    for (const i of indices) absorbed.add(i);
    const members = indices
      .flatMap((i) => input.fresh[i]!.members)
      .sort((a, b) => groupOrder(a) - groupOrder(b));
    const cluster = toCluster(members, ctx.sourceById);
    analyses.set(cluster, analyzeCluster(cluster, ctx));
    merged.push(cluster);
  }
  const attachments = plan.attach.map(({ cardId, fresh }) => {
    for (const i of fresh) absorbed.add(i);
    return {
      cardId,
      groups: fresh
        .flatMap((i) => input.fresh[i]!.members)
        .sort((a, b) => groupOrder(a) - groupOrder(b)),
    };
  });
  const firstOrder = (c: NewsCluster) => Math.min(...c.members.map(groupOrder));
  const fresh = [
    ...input.fresh.filter((_, i) => !absorbed.has(i)),
    ...merged,
  ].sort((a, b) => firstOrder(a) - firstOrder(b));
  return {
    fresh,
    analysisOf: (cluster) => analyses.get(cluster),
    attachments,
    stats: plan.stats,
  };
}
