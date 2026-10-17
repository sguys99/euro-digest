/**
 * 엔티티 2단계 병합 — 같은 경기 카드 합치기 (PRD FR-05·FR-21, §15 D42, plan M1-17) — 순수 함수.
 *
 * 제목 유사도 클러스터링(cluster.ts — 1단계)은 문구가 전혀 다른 같은 경기 기사(국내 매체 인용 위주 제목·각도가 다른 경기 기사)를
 * 놓친다(M1-13 실측: 중복 약 절반만 감소). 코드 분류(classify.ts)로 팀 태그가 생긴 뒤 **같은 두 팀 + 같은 스코어 + 12시간 이내**인
 * 경기 결과 클러스터를 한 카드로 합친다(토큰 0). 원칙은 1단계와 같다 — **잘못 합치기 0이 최우선**(다른 소식이 출처 스택 안으로
 * 사라진다, FR-05 수용 기준). D42의 '또는 같은 경기일'(스코어 없는 기사)은 쓰지 않는다 — 두 팀 이름이 든 이적·발언·추첨 기사가 결과
 * 카드 밑으로 숨었다(M1-17 재리뷰 — 오케스트레이터 결정: 해외도 국내처럼 스코어가 있는 구성원끼리만, 재현율보다 잘못 합치기 0).
 *
 * ── 대상 (`entityOf`) ─────────────────────────────────────────────────────
 *   '경기 결과' 카테고리이고 모든 구성 제목이 경기 기사인 클러스터(classify.ts `matchResult` — 경기 전·부상·이적·재계약·감독구단·묶음
 *   신호가 있는 제목은 아니다, M1-17 리뷰) · 팀 태그가 **정확히 2개** · **제목 스코어가 있다**. 팀이 셋 이상이면(다른 경기·다음 상대가
 *   섞인 제목) 대상이 아니다. 유소년·2군 팀('Arsenal U21'·'Real Madrid Castilla')은 팀 태그가 붙지 않는다(tag-names.ts).
 *
 * ── 합치는 조건 (`planEntityMerges`) ─────────────────────────────────────────
 *   ① 같은 문자 묶음(국내 `ko` / 해외 라틴) — 국내·해외는 합치지 않는다(D30, 빌드 때 연결 줄 — M1-31)
 *   ② 같은 두 팀(순서 무관)
 *   ③ 시각: 가장 이른 기사끼리 12시간 이내 — 한 창 안의 모든 클러스터가 창 첫 클러스터에서 12시간 안(사슬 없음)
 *   ④ 스코어: 창 안 클러스터들이 **공통 스코어**를 가져야 한다(작은 수-큰 수 — 주어 팀 순서 무관). 다르면(진행 중 스코어 'LAFC 1-0
 *      (후반 진행 중)'·하프타임 스코어 등) 그 창은 합치지 않는다.
 *   ⑤ 스코어 없는 클러스터는 대상이 아니다(국내·해외 같다 — 위 '대상'). 국내 반응 기사는 인용 제목에 승패 동사를 쓰고('“맨시티
 *      잡았다고 우리가 최강?” PSG 엔리케 감독'), 해외는 두 팀 이름이 든 이적·발언·추첨 제목('Chelsea turn down Arsenal approach'·
 *      'Carabao Cup fourth-round draw: Arsenal v Liverpool')이 결과 표현과 겹친다(M1-17 재리뷰).
 *   ⑥ 오늘 카드(같은 날 재실행 — 오늘 발행 파일): 같은 조건(경기 결과 카드 · 스코어 · 위 ①~④ — **붙는 새 클러스터도 스코어가
 *      있어야 한다**)으로 창에 오늘 카드가 1장이면 새 클러스터를 그 카드의 출처로 붙인다(카드 id·제목 유지, M1-13 ③과 같다). 아침의
 *      경기 전 카드는 대상이 아니라 결과 기사가 그 밑으로 숨지 않는다. 2장 이상이면 그 창은 합치지 않는다(이미 발행된 카드끼리는
 *      합치지 않는다 — 공유 앵커 유지).
 * 합친 클러스터의 대표·출처 순서는 카드를 만들 때 M1-15 규칙(card-lead.ts)이 정한다. 점수(보도 매체 수 포함)는 합친 뒤 다시 매긴다.
 */
/** 같은 경기 판정 열쇠 */
export interface EntityKey {
  /** 문자 묶음(국내·해외) */
  script: "ko" | "latin";
  /** 두 팀 slug(정렬, '|'로 이음) */
  pair: string;
  /** 제목 스코어(작은 수-큰 수, 1개 이상 — 스코어가 없으면 열쇠가 없다) */
  scores: readonly string[];
  /** 가장 이른 구성 기사 시각(ms) */
  atMs: number;
}

/** 엔티티 판정 입력(classify.ts `ClusterAnalysis`의 일부) */
export interface EntitySource {
  matchResult: boolean;
  roundup: boolean;
  teams: readonly string[];
  scores: readonly string[];
  script: "ko" | "latin";
}

/** 병합 창(시간) — D42 '12시간 이내' */
export const ENTITY_MERGE_WINDOW_HOURS = 12;

/** 병합 창(ms) */
export const ENTITY_MERGE_WINDOW_MS =
  ENTITY_MERGE_WINDOW_HOURS * 60 * 60 * 1000;

/** 대상이면 열쇠, 아니면 null(머리 주석 '대상' — 스코어가 없으면 대상이 아니다) */
export function entityOf(
  source: EntitySource,
  earliestMs: number,
): EntityKey | null {
  if (!source.matchResult || source.roundup) return null;
  if (source.teams.length !== 2) return null;
  if (source.scores.length === 0) return null;
  if (!Number.isFinite(earliestMs)) return null;
  const pair = [...source.teams].sort().join("|");
  return {
    script: source.script,
    pair,
    scores: [...source.scores],
    atMs: earliestMs,
  };
}

/** 병합 계획 */
export interface EntityPlan {
  /** 하나로 합칠 새 클러스터 번호 묶음(입력 번호 오름차순, 묶음마다 2개 이상) */
  merges: number[][];
  /** 오늘 카드에 출처로 붙일 새 클러스터 번호 */
  attach: Array<{ cardId: string; fresh: number[] }>;
  stats: EntityMergeStats;
}

/** 병합 집계(로그용) */
export interface EntityMergeStats {
  /** 대상 새 클러스터 수 */
  eligible: number;
  /** 대상 오늘 카드 수 */
  eligibleToday: number;
  /** 새로 합친 묶음 수 */
  merges: number;
  /** 다른 클러스터에 합쳐져 카드가 되지 않는 새 클러스터 수(= 묶음 구성 수 − 묶음 수) */
  merged: number;
  /** 오늘 카드에 붙인 새 클러스터 수 */
  attached: number;
  /** 스코어가 서로 다르거나 오늘 카드가 둘 이상이라 합치지 않은 창 수 */
  conflicts: number;
}

type Entry =
  | { kind: "fresh"; index: number; key: EntityKey }
  | { kind: "today"; cardId: string; order: number; key: EntityKey };

const orderOf = (e: Entry) => (e.kind === "fresh" ? e.index : -1 - e.order);

/** 창 안 모든 열쇠의 공통 스코어 */
function commonScores(entries: readonly Entry[]): Set<string> {
  let common: string[] | null = null;
  for (const e of entries) {
    const scores: readonly string[] = e.key.scores;
    common =
      common === null
        ? [...scores]
        : common.filter((s: string) => scores.includes(s));
  }
  return new Set(common ?? []);
}

/**
 * 새 클러스터·오늘 카드의 열쇠 → 병합 계획(머리 주석 ①~⑥). `fresh[i]`·`today[j].key`가 null이거나 스코어가 없으면 대상이 아니다.
 * 결과는 결정적이다(같은 열쇠 순서 → 같은 계획).
 */
export function planEntityMerges(input: {
  fresh: ReadonlyArray<EntityKey | null>;
  today?: ReadonlyArray<{ cardId: string; key: EntityKey | null }>;
  windowMs?: number;
}): EntityPlan {
  const windowMs = input.windowMs ?? ENTITY_MERGE_WINDOW_MS;
  const entries: Entry[] = [];
  // 스코어 없는 열쇠는 대상이 아니다(⑤ — entityOf가 만들지 않지만 직접 만든 열쇠도 같은 규칙)
  const usable = (key: EntityKey | null): key is EntityKey =>
    key !== null && key.scores.length > 0;
  input.fresh.forEach((key, index) => {
    if (usable(key)) entries.push({ kind: "fresh", index, key });
  });
  (input.today ?? []).forEach(({ cardId, key }, order) => {
    if (usable(key)) entries.push({ kind: "today", cardId, order, key });
  });
  const stats: EntityMergeStats = {
    eligible: entries.filter((e) => e.kind === "fresh").length,
    eligibleToday: entries.filter((e) => e.kind === "today").length,
    merges: 0,
    merged: 0,
    attached: 0,
    conflicts: 0,
  };

  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const id = `${e.key.script}|${e.key.pair}`;
    buckets.set(id, [...(buckets.get(id) ?? []), e]);
  }

  const merges: number[][] = [];
  const attach: Array<{ cardId: string; fresh: number[] }> = [];
  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort(
      (a, b) => a.key.atMs - b.key.atMs || orderOf(a) - orderOf(b),
    );
    let start = 0;
    while (start < sorted.length) {
      const first = sorted[start]!;
      let end = start + 1;
      while (
        end < sorted.length &&
        sorted[end]!.key.atMs - first.key.atMs <= windowMs
      ) {
        end += 1;
      }
      const window = sorted.slice(start, end);
      start = end;
      if (window.length < 2) continue;

      const todays = window.filter((e) => e.kind === "today");
      if (todays.length >= 2 || commonScores(window).size === 0) {
        stats.conflicts += 1;
        continue;
      }
      const freshIdx = window
        .flatMap((e) => (e.kind === "fresh" ? [e.index] : []))
        .sort((a, b) => a - b);
      const card = window.find((e) => e.kind === "today");
      if (card && card.kind === "today") {
        if (freshIdx.length === 0) continue;
        attach.push({ cardId: card.cardId, fresh: freshIdx });
        stats.attached += freshIdx.length;
        continue;
      }
      if (freshIdx.length < 2) continue;
      merges.push(freshIdx);
      stats.merges += 1;
      stats.merged += freshIdx.length - 1;
    }
  }
  merges.sort((a, b) => a[0]! - b[0]!);
  return { merges, attach, stats };
}
