/**
 * 뉴스 점수화 + 상위 N 선별 (PRD FR-06, FR-105 연결 지점, plan M1-14) — 순수 함수.
 *
 *   점수 = 소스 weight × Tier 가중치 × 키워드 × 클러스터 크기 × 최신성 × 범위
 *
 *   - 소스 weight: 클러스터 구성 소스 중 최대 weight(`clusterSourceMeta(cluster).maxWeight` — 카드 tier·weight가 아니다, M1-12).
 *   - Tier 가중치: 클러스터 최고 Tier(`bestTier` — Tier 1이 가장 높음).
 *   - 키워드(news-keywords.ts, 클러스터 구성 기사 제목의 합집합): 등록 한국 선수(FR-60) · 빅클럽 · UCL(제목 또는 소스 대회) ·
 *     이적 화제. 각 항목이 있으면 그 배수를 곱한다(항목당 한 번). 이적 배수에는 이적 창 배수(`transferBoost`, FR-105 —
 *     기본 1 = 중립)를 더 곱한다.
 *   - 클러스터 크기: 보도 매체 수(`NewsCluster.publishers.length` — 매체명 기준, M1-13). 1곳 = 1, 1곳 늘 때마다 +step, 상한.
 *   - 최신성: 실행 시작(수집 창 기준 시각)부터 클러스터 구성 기사 중 가장 최근 기사까지 경과 시간의 반감기 감쇠.
 *     미래 시각이라 수집 시각으로 낮춘 기사(collect-window.ts `future-clamped` — ESPN 'EST' 등)는 발행 시각을 믿을 수 없어
 *     `clampedAgeHours`(창 가운데쯤)로 본다 — 낮춘 기사가 '방금 나온 기사'로 맨 위를 차지하지 않게(M1-02·M1-10 이월).
 *     섞인 클러스터는 min(믿을 수 있는 기사 나이, clampedAgeHours).
 *   - 범위: 서비스 범위(5대 리그·UCL) 근거가 하나도 없으면 감점 — 근거 = 클러스터 소스 대회(`competitions`) ∪ 제목 대회
 *     표현 ∪ 제목 팀·등록 한국 선수의 리그(M1-17 — `extraComps`, classify.ts 분석의 `leagues`: 빅클럽 밖 EPL 기사 'Wolves …'가
 *     아니라 'Aston Villa revival'처럼 5대 리그 팀이면 감점 없음) ∪ 빅클럽 ∪ 등록 한국 선수. 하부 리그·다른 리그·사건 기사가 근거
 *     없이 위로 오지 않게(M1-01 이월). 축구 외·K리그·연예 기사는 점수화 전(클러스터링 전 묶음 단계)에 뺀다(news-scope.ts, M1-17).
 *
 * 값은 코드 상수 `DEFAULT_SCORE_WEIGHTS` 한 곳에서 조정한다(이적 창 배수만 `configs/transfer-windows.json` `boost` — M4-03,
 * 스키마 주석 '그 밖의 점수화 가중치는 코드 상수'). 선별 규모는 환경변수 `MAX_ITEMS_PER_RUN`(collect-run.ts).
 *
 * 선별(PRD §15 D44): **일일 카드 상한은 그날 파일 기준** — 새 카드 자리 = max(0, 상한 − 오늘 파일의 기존 카드 수)(`planSlots`).
 * 그 안에서 **국내(ko) 카드 최소 몫**(상한 ÷ `DOMESTIC_QUOTA_DIVISOR` — 기본 15)을 국내 클러스터 점수 순으로 먼저 채우고 나머지는
 * 전체 점수 순(`selectWithQuota` — 국내 후보가 모자라면 해외로 채운다). 몫도 그날 파일 기준이라 같은 날 재실행은 모자란 만큼만
 * 국내 자리를 잡는다(아침 실행이 15장을 채웠으면 저녁 재실행은 순수 점수 순).
 * 점수는 카드 생성 단계까지 넘어간다 — 중요도 `imp`(1~5)는 M1-17이 이 점수의 구간으로 매긴다(FR-21, 카드 스키마 변경 없음).
 */
import type {
  CompId,
  FeedItem,
  Source,
  Tier,
  TransferWindowsFile,
} from "@/lib/schema";
import { parseUtcIso } from "@/lib/time";

import { clusterSourceMeta, type NewsCluster } from "./news-cluster";
import { matchTitles, type KeywordIndex } from "./news-keywords";

// ─── 가중치 ──────────────────────────────────────────────────────────────

export interface ScoreWeights {
  /** Tier → 배수(Tier 1이 가장 높다) */
  tier: Readonly<Record<Tier, number>>;
  /** 등록 한국 선수가 제목에 나옴 */
  korean: number;
  /** 빅클럽이 제목에 나옴 */
  bigClub: number;
  /** UCL(제목 표현 또는 소스 대회) */
  ucl: number;
  /** 이적 화제 — 이적 창 배수(transferBoost)를 더 곱한다 */
  transfer: number;
  /** 보도 매체가 1곳 늘 때마다 더하는 값 */
  clusterStep: number;
  /** 클러스터 크기 배수 상한 */
  clusterMax: number;
  /** 최신성 반감기(시간) — 이만큼 지나면 최신성 배수가 절반 */
  recencyHalfLifeHours: number;
  /** 수집 시각으로 낮춘 기사의 경과 시간으로 볼 값(시간) */
  clampedAgeHours: number;
  /** 서비스 범위 근거가 없을 때의 배수 */
  noScope: number;
}

/**
 * 기본 가중치 — fixtures/cluster(실제 피드 1회 수집 창 안 198건, 2026-10-15)·fixtures/rss(M0-33)·실제 피드 dry 선별 결과를 보고
 * 정했다(plan M1-14 완료 메모).
 *   - 한국 선수 배수가 가장 크다(서비스 핵심): 국내 매체(Tier 3, weight 0.5~1.5)의 등록 선수 기사가 BBC Football(weight 3)의
 *     범위 근거 없는 기사(퀴즈·팟캐스트·스코틀랜드·하부 리그)보다 위에 오도록.
 *   - 범위 근거 없음 0.5. fixtures/cluster 상위 45건: 한국 선수 1.8·범위 0.7에서는 근거 없는 BBC 기사 13건이 들고 등록 선수
 *     기사 4건(김민재·이강인)이 밖이었다 → 2.5·0.5에서 근거 없는 기사 8건(모두 최근 2~8시간)·밖의 선수 기사 2건(weight 0.5
 *     전체기사 피드의 35시간 넘은 기사). 실제 피드 dry(2026-10-16, Di Marzio·Athletic 포함)에서는 2.5일 때 14~17시간 지난 등록
 *     선수 기사 4건이 새 Di Marzio 일반 기사(소집 명단·예상 선발)에 밀려 밖이라 3으로 올렸다(섹션 피드가 짧아 하루쯤 지난 국내
 *     기사는 전체기사 피드(weight 1)에만 남는다).
 *   - 최신성 반감기 24시간: 하루 창(직전 실행 − 3시간 ~ 지금)의 끝(약 27시간)에서 0.46 — 어제 아침 기사가 밤사이 기사보다 아래.
 *   - 낮춘 기사 12시간: 창 가운데쯤(발행 시각을 모른다).
 */
export const DEFAULT_SCORE_WEIGHTS: Readonly<ScoreWeights> = Object.freeze({
  tier: Object.freeze({ 1: 1.25, 2: 1, 3: 0.8 }),
  korean: 3,
  bigClub: 1.3,
  ucl: 1.25,
  transfer: 1.2,
  clusterStep: 0.5,
  clusterMax: 3,
  recencyHalfLifeHours: 24,
  clampedAgeHours: 12,
  noScope: 0.5,
});

/** 이적 창 배수 기본값 — 중립(FR-105, transfer-windows.json이 생기기 전·이적 창 밖) */
export const NEUTRAL_TRANSFER_BOOST = 1;

/**
 * 국내(ko) 카드 최소 몫 = 상한 ÷ 이 값(내림) — 상한 45면 15장(PRD §15 D44). 실제 피드(2026-10-16)에서 점수만으로는 45장 중
 * 9장(20%)이라 D0 시안 샘플(39%)·PRD 리스크 완화('국내 보도로 보강')에 못 미쳤다. 크기는 M1-17 제외 규칙 뒤 관찰 주간에 확정.
 */
export const DOMESTIC_QUOTA_DIVISOR = 3;

/** 하루 국내 몫(장) — 상한 ÷ DOMESTIC_QUOTA_DIVISOR, 내림 */
export function domesticQuotaOf(limit: number): number {
  return Math.floor(Math.max(0, limit) / DOMESTIC_QUOTA_DIVISOR);
}

// ─── 이적 창 (FR-105 연결 지점) ─────────────────────────────────────────────

/**
 * 시각 `at`(UTC ISO)이 어느 리그든 이적 창 안이면 그 파일의 `boost`, 아니면 중립(1). 파일이 없으면(null) 중립.
 * 창 판정은 [opensAt, closesAt). 리그별로 다르게 가중할지(EPL 창만 열렸을 때 EPL 기사만?)는 M4-03이 정한다 — 지금 수집
 * 실행은 이 함수를 부르지 않고 중립을 넘긴다(configs/transfer-windows.json은 M4-03에서 만든다).
 */
export function transferWindowBoost(
  at: string,
  file: Pick<TransferWindowsFile, "boost" | "windows"> | null,
): number {
  if (file === null) return NEUTRAL_TRANSFER_BOOST;
  const t = parseUtcIso(at).getTime();
  const open = file.windows.some(
    (w) =>
      parseUtcIso(w.opensAt).getTime() <= t &&
      t < parseUtcIso(w.closesAt).getTime(),
  );
  return open ? file.boost : NEUTRAL_TRANSFER_BOOST;
}

// ─── 신호 → 점수 ──────────────────────────────────────────────────────────

/** 점수화 입력(클러스터에서 뽑은 신호) — 순수 값이라 테스트·M1-17 재계산에 그대로 쓴다 */
export interface ScoreSignals {
  /** 구성 소스 최대 weight */
  maxWeight: number;
  /** 구성 소스 최고 Tier */
  bestTier: Tier;
  /** 보도 매체 수(매체명 기준) */
  publishers: number;
  /** 범위 대회 근거 — 소스 대회 ∪ 제목 대회 표현 ∪ 제목 팀·등록 한국 선수의 리그(M1-17 `extraComps`) */
  comps: readonly CompId[];
  /** 등록 한국 선수 slug(제목) */
  koreanPlayers: readonly string[];
  /** 빅클럽 slug(제목) */
  bigClubs: readonly string[];
  /** 이적 화제(제목) */
  transfer: boolean;
  /** 실행 시작부터 가장 최근 구성 기사까지(시간, 0 이상) — 낮춘 기사는 clampedAgeHours로 센다 */
  ageHours: number;
  /** 최신성을 낮춘 기사의 clampedAgeHours로 봤는가(낮춘 기사보다 어린 믿을 수 있는 기사가 없음) */
  clamped: boolean;
}

/** 점수의 곱 인자(로그·검수용) */
export interface ScoreFactors {
  weight: number;
  tier: number;
  keywords: number;
  cluster: number;
  recency: number;
  scope: number;
}

export interface NewsScore {
  score: number;
  factors: ScoreFactors;
  signals: ScoreSignals;
}

/** 클러스터 크기 배수 — 1곳 = 1, 늘 때마다 +step, 상한 clusterMax */
export function clusterSizeFactor(
  publishers: number,
  weights: Pick<
    ScoreWeights,
    "clusterStep" | "clusterMax"
  > = DEFAULT_SCORE_WEIGHTS,
): number {
  const extra = Math.max(0, publishers - 1);
  return Math.min(1 + weights.clusterStep * extra, weights.clusterMax);
}

/** 최신성 배수 — 0.5^(경과 시간 / 반감기), 경과 시간이 음수(허용 오차 안 미래)면 1 */
export function recencyFactor(
  ageHours: number,
  weights: Pick<ScoreWeights, "recencyHalfLifeHours"> = DEFAULT_SCORE_WEIGHTS,
): number {
  return 0.5 ** (Math.max(0, ageHours) / weights.recencyHalfLifeHours);
}

/** 서비스 범위 근거가 있는가 — 대회 근거·빅클럽·등록 한국 선수 중 하나 */
export function hasScopeEvidence(
  signals: Pick<ScoreSignals, "comps" | "bigClubs" | "koreanPlayers">,
): boolean {
  return (
    signals.comps.length > 0 ||
    signals.bigClubs.length > 0 ||
    signals.koreanPlayers.length > 0
  );
}

/** 신호 → 점수(머리 주석의 곱) */
export function scoreSignals(
  signals: ScoreSignals,
  options: { weights?: Readonly<ScoreWeights>; transferBoost?: number } = {},
): NewsScore {
  const w = options.weights ?? DEFAULT_SCORE_WEIGHTS;
  const boost = options.transferBoost ?? NEUTRAL_TRANSFER_BOOST;
  const keywords =
    (signals.koreanPlayers.length > 0 ? w.korean : 1) *
    (signals.bigClubs.length > 0 ? w.bigClub : 1) *
    (signals.comps.includes("UCL") ? w.ucl : 1) *
    (signals.transfer ? w.transfer * boost : 1);
  const factors: ScoreFactors = {
    weight: signals.maxWeight,
    tier: w.tier[signals.bestTier],
    keywords,
    cluster: clusterSizeFactor(signals.publishers, w),
    recency: recencyFactor(signals.ageHours, w),
    scope: hasScopeEvidence(signals) ? 1 : w.noScope,
  };
  const score =
    factors.weight *
    factors.tier *
    factors.keywords *
    factors.cluster *
    factors.recency *
    factors.scope;
  return { score, factors, signals };
}

// ─── 클러스터 → 신호 ──────────────────────────────────────────────────────

export interface ClusterScoreContext {
  /** 기준 시각(UTC ISO) — 이번 실행 시작(= 수집 창 now) */
  now: string;
  sourceById: ReadonlyMap<string, Source>;
  keywords: KeywordIndex;
  /** 수집 시각으로 낮춘 기사인가(collect-window.ts `clampedItemKey`) — 없으면 모두 아님 */
  isClamped?: (item: FeedItem) => boolean;
  /** 이적 창 배수(FR-105) — 기본 중립 1 */
  transferBoost?: number;
  weights?: Readonly<ScoreWeights>;
  /**
   * 클러스터의 추가 범위 대회 근거(M1-17 — 제목 팀 → 리그, 등록 한국 선수 → 소속 리그: classify.ts 분석의 `leagues`). 없으면 소스 대회 ∪
   * 제목 대회 표현만(M1-14 동작).
   */
  extraComps?: (cluster: Pick<NewsCluster, "members">) => readonly CompId[];
  /**
   * 클러스터의 등록 한국 선수(M1-17 — classify.ts 분석의 `korean`: 동명이인 김지수·정우영은 축구 근거가 있을 때만 — 분류 `kr`과 같은
   * 기준). undefined면(분석 없음) 제목 키워드(`matchTitles`)로 본다.
   */
  koreanPlayers?: (
    cluster: Pick<NewsCluster, "members">,
  ) => readonly string[] | undefined;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * 클러스터의 점수화 신호. 대표 소스가 설정에 없으면(clusterSourceMeta null — 카드가 될 수 없다) weight 0·Tier 3으로 본다
 * (점수 0 — 맨 뒤).
 */
export function clusterSignals(
  cluster: Pick<NewsCluster, "members" | "publishers">,
  ctx: ClusterScoreContext,
): ScoreSignals {
  const w = ctx.weights ?? DEFAULT_SCORE_WEIGHTS;
  const meta = clusterSourceMeta(cluster, ctx.sourceById);
  const items = cluster.members.map((m) => m.item);
  const hits = matchTitles(items, ctx.keywords);
  const comps = [...(meta?.card.competitions ?? [])];
  for (const comp of hits.comps) if (!comps.includes(comp)) comps.push(comp);
  for (const comp of ctx.extraComps?.(cluster) ?? []) {
    if (!comps.includes(comp)) comps.push(comp);
  }

  // 나이 = 구성 기사 중 가장 어린 나이. 낮춘 기사는 clampedAgeHours로 센다 — 섞이면 min(믿을 수 있는 나이, clampedAgeHours).
  const nowMs = parseUtcIso(ctx.now).getTime();
  const trustedAges = items
    .filter((item) => !(ctx.isClamped?.(item) ?? false))
    .map((item) =>
      Math.max(0, (nowMs - parseUtcIso(item.publishedAt).getTime()) / HOUR_MS),
    );
  const hasClamped = trustedAges.length < items.length;
  const trustedAge = trustedAges.length > 0 ? Math.min(...trustedAges) : null;
  const clamped =
    hasClamped && (trustedAge === null || w.clampedAgeHours < trustedAge);
  const ageHours = clamped ? w.clampedAgeHours : (trustedAge ?? 0);

  return {
    maxWeight: meta?.maxWeight ?? 0,
    bestTier: meta?.bestTier ?? 3,
    publishers: cluster.publishers.length,
    comps,
    koreanPlayers: ctx.koreanPlayers?.(cluster) ?? hits.koreanPlayers,
    bigClubs: hits.bigClubs,
    transfer: hits.transfer,
    ageHours,
    clamped,
  };
}

/** 클러스터 점수 */
export function scoreCluster(
  cluster: Pick<NewsCluster, "members" | "publishers">,
  ctx: ClusterScoreContext,
): NewsScore {
  return scoreSignals(clusterSignals(cluster, ctx), {
    weights: ctx.weights,
    transferBoost: ctx.transferBoost,
  });
}

// ─── 선별 ────────────────────────────────────────────────────────────────

export interface Scored<T> {
  entry: T;
  score: NewsScore;
}

/**
 * 점수 내림차순(같으면 입력 순서) 상위 limit건. 입력 순서가 결정적이면 결과도 결정적이다(수집 실행은 클러스터의 첫 묶음
 * 입력 순서 = 설정 순서로 넘긴다). limit ≤ 0이면 [].
 */
export function selectTopScored<T>(
  entries: readonly T[],
  scoreOf: (entry: T) => NewsScore,
  limit: number,
): Array<Scored<T>> {
  return entries
    .map((entry, index) => ({ entry, score: scoreOf(entry), index }))
    .sort((a, b) => b.score.score - a.score.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ entry, score }) => ({ entry, score }));
}

/** 새 카드 자리 계획(그날 파일 기준 — D44) */
export interface SlotPlan {
  /** 새 카드 자리 = max(0, 상한 − 기존 카드 수) */
  slots: number;
  /** 이번 실행의 국내 몫 = min(자리, max(0, 하루 국내 몫 − 기존 국내 카드 수)) */
  domesticQuota: number;
}

/**
 * 그날 파일 기준 자리 계획(PRD §15 D44). 기존 카드에 출처를 붙이는 것은 자리를 쓰지 않는다(호출부). 기존 카드가 수집 창 밖이어도
 * 파일 카드 수로 세므로 같은 날 재실행이 파일을 상한 너머로 키우지 않는다. 국내 몫도 하루 기준 — 재실행은 모자란 만큼만.
 */
export function planSlots(input: {
  limit: number;
  existingCards: number;
  existingDomestic: number;
}): SlotPlan {
  const slots = Math.max(0, input.limit - input.existingCards);
  const shortfall = Math.max(
    0,
    domesticQuotaOf(input.limit) - input.existingDomestic,
  );
  return { slots, domesticQuota: Math.min(slots, shortfall) };
}

/**
 * 몫이 있는 선별 — `ranked`(점수 내림차순)에서 몫 대상(`inQuota`) 상위 `quota`개를 먼저 자리에 넣고, 남은 자리는 전체 점수
 * 순으로 채운다(몫 대상이 모자라면 그만큼 나머지로). 결과는 점수 순서 그대로. `byQuota` = 몫 때문에 들어간 수(순수 점수 순
 * 상위 `slots` 밖이었던 몫 대상).
 */
export function selectWithQuota<T>(
  ranked: readonly Scored<T>[],
  options: { slots: number; quota: number; inQuota: (entry: T) => boolean },
): { selected: Array<Scored<T>>; byQuota: number } {
  const slots = Math.max(0, options.slots);
  const quota = Math.min(slots, Math.max(0, options.quota));
  const chosen = new Set<number>();
  for (let i = 0; i < ranked.length && chosen.size < quota; i += 1) {
    if (options.inQuota(ranked[i]!.entry)) chosen.add(i);
  }
  const byQuota = [...chosen].filter((i) => i >= slots).length;
  for (let i = 0; i < ranked.length && chosen.size < slots; i += 1) {
    chosen.add(i);
  }
  return { selected: ranked.filter((_, i) => chosen.has(i)), byQuota };
}

/** 로그용 점수 반올림(소수 셋째 자리) */
export function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
