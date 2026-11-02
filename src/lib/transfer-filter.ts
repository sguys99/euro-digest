/**
 * 이적 필터 — 순수 규칙 (PRD FR-104, DESIGN §9.3 D2 "이적 필터", plan M4-04)
 *
 * 축 5개(리그 · 팀 · 단계 · Tier · 한국 선수). **축 안은 OR, 축 사이는 AND** — 고른 값이 없는 축은 거르지 않는다. 상태는 주소 쿼리에 산다
 * (`/transfers/?league=epl,laliga&status=rumor&kr=1` — 공유·새로고침에 유지, FR-32와 같은 원칙). 쿼리 값은 화면이 아는 값만 받는다(모르는 값은
 * 버림 — 서버가 그린 버튼이 기준).
 *
 * | 축 | 쿼리 이름 | 값 | 행의 값 |
 * |----|-----------|----|---------|
 * | 리그 | `league` | 대회 ID 소문자(`epl` · `laliga` · `seriea` · `bundesliga` · `ligue1`) | 소속 · 출발 · 행선지 팀의 리그(5대 리그만) |
 * | 팀 | `team` | 팀 slug | 소속 · 출발 · 행선지 팀 |
 * | 단계 | `status` | rumor · negotiating · agreed · official · collapsed | 레코드 단계 하나 |
 * | Tier | `tier` | 1 · 2 · 3 | 최고 출처 Tier 하나 |
 * | 한국 선수 | `kr` | 1 | 등록 한국 선수면 1 |
 *
 * DOM 없이 쓰는 함수만 둔다 — 화면 모델(건수) · 섬(누름 → 다음 주소) · 단위 테스트가 쓴다. DOM 그리기는 src/lib/transfer-filter-dom.ts.
 */

export const TRANSFER_FILTER_AXES = [
  "league",
  "team",
  "status",
  "tier",
  "kr",
] as const;
export type TransferFilterAxis = (typeof TRANSFER_FILTER_AXES)[number];

/** 축별 고른 값(없으면 빈 배열 — 그 축은 거르지 않는다) */
export type TransferFilterState = Readonly<
  Record<TransferFilterAxis, readonly string[]>
>;

/** 행 하나의 축별 값 — 단계·Tier는 값 하나, 한국 선수는 ["1"] 또는 [] */
export type TransferFilterValues = Readonly<
  Record<TransferFilterAxis, readonly string[]>
>;

export const EMPTY_TRANSFER_FILTER: TransferFilterState = {
  league: [],
  team: [],
  status: [],
  tier: [],
  kr: [],
};

/** 한국 선수 축의 값 */
export const TRANSFER_KR_VALUE = "1";

/** 고른 값이 하나라도 있는가 */
export function isTransferFilterActive(state: TransferFilterState): boolean {
  return TRANSFER_FILTER_AXES.some((axis) => state[axis].length > 0);
}

/** 행이 필터에 맞는가 — 고른 값이 있는 축마다 행의 값 중 하나가 고른 값 중 하나와 같아야 한다(축 안 OR · 축 사이 AND) */
export function matchesTransferFilter(
  values: TransferFilterValues,
  state: TransferFilterState,
): boolean {
  return TRANSFER_FILTER_AXES.every((axis) => {
    const picked = state[axis];
    return picked.length === 0 || values[axis].some((v) => picked.includes(v));
  });
}

/**
 * 주소 쿼리 → 상태. 값은 쉼표로 나눈 목록이고 `known`(화면이 그린 버튼 값)에 있는 것만 받는다 — 순서는 `known` 순서(같은 상태면 같은
 * 주소가 되게), 중복은 하나로. 대소문자는 소문자로 맞춘다(리그 `EPL` → `epl`).
 */
export function parseTransferFilterQuery(
  search: string,
  known: Readonly<Record<TransferFilterAxis, readonly string[]>>,
): TransferFilterState {
  const params = new URLSearchParams(search);
  const out: Record<TransferFilterAxis, string[]> = {
    league: [],
    team: [],
    status: [],
    tier: [],
    kr: [],
  };
  for (const axis of TRANSFER_FILTER_AXES) {
    const raw = (params.get(axis) ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v !== "");
    out[axis] = known[axis].filter((v) => raw.includes(v));
  }
  return out;
}

/** 상태 → 쿼리(다른 쿼리 이름은 그대로 두고 축 이름만 바꾼다). 결과는 `?…` 또는 빈 문자열 */
export function withTransferFilterQuery(
  search: string,
  state: TransferFilterState,
): string {
  const params = new URLSearchParams(search);
  for (const axis of TRANSFER_FILTER_AXES) {
    if (state[axis].length > 0) params.set(axis, state[axis].join(","));
    else params.delete(axis);
  }
  const query = params.toString().replace(/%2C/g, ",");
  return query === "" ? "" : `?${query}`;
}

/** 값 하나를 켜고 끈 상태(그 축의 순서는 `known` 순서) */
export function toggleTransferFilter(
  state: TransferFilterState,
  axis: TransferFilterAxis,
  value: string,
  known: Readonly<Record<TransferFilterAxis, readonly string[]>>,
): TransferFilterState {
  const on = state[axis].includes(value);
  const next = on
    ? state[axis].filter((v) => v !== value)
    : known[axis].filter((v) => v === value || state[axis].includes(v));
  return { ...state, [axis]: next };
}

/** 축 값별 행 수(필터와 무관한 전체 기준 — 화면의 건수 · 0건 비활성) */
export function transferFilterCounts(
  rows: readonly TransferFilterValues[],
  axis: TransferFilterAxis,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const v of new Set(row[axis])) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}
