/**
 * 팔로우 내보내기 · 가져오기 — 공유 URL 계획과 안내 문구 (PRD FR-114, §15 D67 ②③, plan M4-10, DECISIONS D2 §9)
 *
 * 순수 함수만(DOM · React 없음). `/my` 섬의 **지연 조각**(내보내기 버튼을 누를 때 · 주소에 쿼리가 있을 때 받는 코드)만 import한다 —
 * 초기 번들에 넣지 않는다(`/my` 초기 JS 예산).
 *
 * - 공유 URL(D67 ③): `{SITE_URL}{basePath}/my/?t=<팀 slug,…>&p=<선수 slug,…>` — `followsToQuery`(src/lib/follow.ts)를 그대로 쓴다.
 * - 가져오기 계획(`planFollowImport`): 쿼리의 값을 **소문자 · 앞뒤 공백 제거 · 빈 값 제거 · 중복 제거**로 다듬은 뒤, slug 형식이고 페이지
 *   디렉터리(`#my-directory`)에 있는 것만 들어올 항목으로, 나머지는 '모르는 항목'으로 센다. 한도(팀 5 · 선수 5) 때문에 빠지는 것은
 *   방식(합치기 · 덮어쓰기)마다 `importFollows`의 `dropped`로 센다.
 * - "이미 같은 팔로우": 덮어써도 지금과 같은 집합이면(순서 무관) 확인 띠 없이 그 문장만 알린다.
 */
import {
  FOLLOW_KINDS,
  FOLLOW_QUERY_PARAMS,
  followQueryLists,
  followsToQuery,
  type FollowImportMode,
  type FollowKind,
  type FollowKnown,
  type FollowLists,
  type FollowState,
  importFollows,
} from "@/lib/follow";
import { absoluteUrl, routes } from "@/lib/paths";

/** 공유 URL(절대) — 팔로우가 없으면 null(내보내기 버튼 비활성) */
export function followShareUrl(state: FollowLists): string | null {
  const query = followsToQuery(state);
  return query === "" ? null : `${absoluteUrl(routes.my())}?${query}`;
}

/** 주소에 가져올 쿼리(`t` · `p`)가 있는지 — 섬이 지연 조각을 받을지 정한다(값이 비어도 true — 계획이 안내한다) */
export function hasFollowQuery(search: string): boolean {
  const params = new URLSearchParams(search);
  return FOLLOW_KINDS.some((kind) => params.has(FOLLOW_QUERY_PARAMS[kind]));
}

/** 방식 하나의 결과 */
export interface FollowImportOutcome {
  state: FollowState;
  /** 한도 때문에 빠지는 수(종류 합) */
  dropped: number;
}

/** 가져오기 계획 */
export type FollowImportPlan =
  | {
      /** 확인 띠를 띄운다 */
      kind: "confirm";
      /** 들어올 항목(디렉터리에 있는 것 — 쿼리 순서, 한도 전) */
      incoming: FollowLists;
      /** 모르는 항목 수(형식이 틀렸거나 지금 자료에 없는 slug) */
      unknown: number;
      outcomes: Readonly<Record<FollowImportMode, FollowImportOutcome>>;
    }
  | {
      /** 덮어써도 지금과 같다 — "이미 같은 팔로우예요" */
      kind: "same";
      unknown: number;
    }
  | {
      /** 들어올 항목이 하나도 없다(빈 값 · 모르는 항목뿐) */
      kind: "empty";
      unknown: number;
    };

/** 쿼리 값 다듬기 — 소문자 · 쉼표 나눔 · 앞뒤 공백 · 빈 값 · 중복 제거 */
function rawTokens(params: URLSearchParams, kind: FollowKind): string[] {
  const out: string[] = [];
  for (const value of params.getAll(FOLLOW_QUERY_PARAMS[kind])) {
    for (const piece of value.split(",")) {
      const token = piece.trim().toLowerCase();
      if (token !== "" && !out.includes(token)) out.push(token);
    }
  }
  return out;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

/**
 * 주소 쿼리 → 가져오기 계획. 쿼리에 `t` · `p`가 없으면 null(할 일 없음).
 * `known`은 페이지 디렉터리의 slug(팔로우할 수 있는 팀 · 선수).
 */
export function planFollowImport(
  search: string,
  current: FollowLists,
  known: FollowKnown,
): FollowImportPlan | null {
  const params = new URLSearchParams(search);
  // 소문자로 다듬은 쿼리를 follow.ts 규칙(형식 검사)에 넘긴다
  const cleaned = new URLSearchParams();
  const tokens = {} as Record<FollowKind, string[]>;
  for (const kind of FOLLOW_KINDS) {
    tokens[kind] = rawTokens(params, kind);
    if (params.has(FOLLOW_QUERY_PARAMS[kind]))
      cleaned.set(FOLLOW_QUERY_PARAMS[kind], tokens[kind].join(","));
  }
  const lists = followQueryLists(cleaned);
  if (lists === null) return null;

  const incoming = {} as Record<FollowKind, string[]>;
  let unknown = 0;
  for (const kind of FOLLOW_KINDS) {
    incoming[kind] = lists[kind].filter((slug) => known[kind].has(slug));
    unknown += tokens[kind].length - incoming[kind].length;
  }
  if (FOLLOW_KINDS.every((kind) => incoming[kind].length === 0))
    return { kind: "empty", unknown };

  const outcome = (mode: FollowImportMode): FollowImportOutcome => {
    const result = importFollows(current, incoming, mode, known);
    return {
      state: result.state,
      dropped: result.dropped.teams.length + result.dropped.players.length,
    };
  };
  const replace = outcome("replace");
  if (
    replace.dropped === 0 &&
    FOLLOW_KINDS.every((kind) => sameSet(replace.state[kind], current[kind]))
  ) {
    return { kind: "same", unknown };
  }
  return {
    kind: "confirm",
    incoming,
    unknown,
    outcomes: { merge: outcome("merge"), replace },
  };
}

/** 주소에서 가져오기 쿼리(`t` · `p`)만 뺀 경로 + 남은 쿼리 + 해시(`history.replaceState`용) */
export function stripFollowQuery(href: string): string {
  const url = new URL(href);
  for (const kind of FOLLOW_KINDS)
    url.searchParams.delete(FOLLOW_QUERY_PARAMS[kind]);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/** 공유 URL(절대) → 지금 출처에서 여는 경로 + 쿼리(복사가 막혔을 때 주소창에 띄운다) */
export function sharePathWithQuery(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** 한도로 빠진 수 · 모르는 항목 수 → 문구 조각(없으면 빈 배열). 예) ["한도 때문에 1개가 빠졌어요", "모르는 항목 2개"] */
export function importNoticeParts(dropped: number, unknown: number): string[] {
  const parts: string[] = [];
  if (dropped > 0) parts.push(`한도 때문에 ${dropped}개가 빠졌어요`);
  if (unknown > 0) parts.push(`모르는 항목 ${unknown}개`);
  return parts;
}

/** 반영 뒤 토스트 문구 */
export function importResultMessage(
  mode: FollowImportMode,
  dropped: number,
  unknown: number,
): string {
  const head = mode === "merge" ? "팔로우를 합쳤어요" : "팔로우를 덮어썼어요";
  return [head, ...importNoticeParts(dropped, unknown)].join(" · ");
}

/** 띠 없이 끝날 때 토스트 문구(같은 팔로우 · 가져올 것 없음) */
export function importSkipMessage(
  plan: Extract<FollowImportPlan, { kind: "same" | "empty" }>,
): string {
  const head =
    plan.kind === "same" ? "이미 같은 팔로우예요" : "가져올 팔로우가 없어요";
  return [head, ...importNoticeParts(0, plan.unknown)].join(" · ");
}

/** 종류별 수 → "팀 2 · 선수 1"(0인 종류는 뺀다, 둘 다 0이면 "없음") */
export function followCountLabel(state: FollowLists): string {
  const parts = FOLLOW_KINDS.filter((kind) => state[kind].length > 0).map(
    (kind) => `${kind === "teams" ? "팀" : "선수"} ${state[kind].length}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "없음";
}

/** 디렉터리 키 → 아는 slug 집합 */
export function knownFromDirectory(dir: {
  teams: Readonly<Record<string, unknown>>;
  players: Readonly<Record<string, unknown>>;
}): FollowKnown {
  return {
    teams: new Set(Object.keys(dir.teams)),
    players: new Set(Object.keys(dir.players)),
  };
}
