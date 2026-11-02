/**
 * 팔로우 상태 모델 — 팀·선수 팔로우의 저장 형식·한도·URL 쿼리를 다루는 순수 함수 (FR-110·FR-113·FR-114, PRD §15 D67 ②③, M4-07)
 *
 * 저장 형식(`localStorage` `ed-follow`, DESIGN §8 키 규칙)
 * ```json
 * {"v":1,"teams":["arsenal","bayern-munchen"],"players":["kim-min-jae"]}
 * ```
 * - `v`: 형식 버전(지금 1). 다른 버전·깨진 JSON·객체가 아닌 값은 빈 상태로 읽는다.
 * - `teams`·`players`: slug 배열, 팔로우한 순서(먼저 한 것이 앞). slug는 `SlugSchema`와 같은 kebab-case + 길이 64 이하.
 * - 엄격 형식은 zod `FollowStateSchema`(`src/lib/schema/follow.ts`)가 정의한다. 이 파일은 클라이언트 섬이 import하므로 zod를
 *   쓰지 않고(`src/lib/schema/index.ts` 번들 주의) 같은 규칙을 손으로 적용한다 — `normalizeFollows`의 결과가 언제나 그
 *   스키마를 통과하고, 스키마를 통과하는 값은 그대로 돌려준다는 것을 테스트가 확인한다(tests/follow.test.ts).
 *
 * 읽기 경계 정리(`normalizeFollows`): 형식이 틀린 slug·중복은 버리고, 한도를 넘으면 앞에서부터 한도까지만 남긴다.
 * 모르는 slug(데이터에 없는 팀·선수)는 `known`을 줄 때만 버린다 — 페이지마다 아는 범위가 다를 수 있어 저장값을 그 자리에서
 * 지우지 않는다(정리된 값은 다음 쓰기 때 저장된다).
 *
 * 한도(D67 ②): 팀 5 + 선수 5. 한도에 이르면 그 종류의 꺼진 버튼만 '한도' 상태(점선 비활성 + 이유 문장 — DESIGN §9.3).
 * 공유 URL(D67 ③): `/my/?t=<팀 slug,…>&p=<선수 slug,…>` — 읽히는 쿼리(쉼표는 인코딩하지 않는다).
 */

/** 저장 키(DESIGN §8 `ed-` 접두) */
export const FOLLOW_STORAGE_KEY = "ed-follow";

/** 저장 형식 버전 */
export const FOLLOW_VERSION = 1;

/** 팔로우 종류 — 저장 형식의 배열 이름과 같다 */
export type FollowKind = "teams" | "players";

/** 종류 순서(직렬화·반복 순서 고정) */
export const FOLLOW_KINDS: readonly FollowKind[] = ["teams", "players"];

/** 종류별 한도(D67 ② — 팀 5 + 선수 5) */
export const FOLLOW_LIMITS: Readonly<Record<FollowKind, number>> = {
  teams: 5,
  players: 5,
};

/** 공유 URL 쿼리 이름(D67 ③): 팀 `t`, 선수 `p` */
export const FOLLOW_QUERY_PARAMS: Readonly<Record<FollowKind, string>> = {
  teams: "t",
  players: "p",
};

/** slug 형식 — `src/lib/schema/common.ts` `SlugSchema`와 같은 정규식(테스트가 대조) */
export const FOLLOW_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** slug 최대 길이 — 저장소·URL에 비정상적으로 긴 값이 남지 않게(현재 최장 팀 slug는 30자 미만) */
export const FOLLOW_SLUG_MAX_LENGTH = 64;

/** 팔로우 상태(저장 형식 그대로). 함수들은 바꾸지 않고 새 객체를 돌려준다. */
export interface FollowState {
  readonly v: typeof FOLLOW_VERSION;
  readonly teams: readonly string[];
  readonly players: readonly string[];
}

/** 빈 상태 — 서버 스냅샷·읽기 실패의 기본값(참조가 늘 같다) */
export const EMPTY_FOLLOWS: FollowState = Object.freeze({
  v: FOLLOW_VERSION,
  teams: Object.freeze([]) as readonly string[],
  players: Object.freeze([]) as readonly string[],
});

/** 종류별 slug 목록 — 정리 전 값(URL 쿼리 등)도 담는다. `FollowState`도 이 모양이다. */
export type FollowLists = Readonly<Record<FollowKind, readonly string[]>>;

/** 아는 slug 목록 — 주면 모르는 slug를 버린다 */
export type FollowKnown = Readonly<Record<FollowKind, ReadonlySet<string>>>;

/** 팔로우 버튼 3상태(DESIGN §9.3): 꺼짐 · 켜짐 · 한도(그 종류가 꽉 차서 더할 수 없음) */
export type FollowButtonState = "off" | "on" | "limit";

/** 가져오기 방식(D67 ③): 덮어쓰기 · 합치기 */
export type FollowImportMode = "replace" | "merge";

/** 가져오기 결과 — 한도 때문에 빠진 slug를 종류별로 알려 준다(가져오기 확인 문구용) */
export interface FollowImportResult {
  state: FollowState;
  dropped: Readonly<Record<FollowKind, readonly string[]>>;
}

/** slug 형식인지 */
export function isFollowSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= FOLLOW_SLUG_MAX_LENGTH &&
    FOLLOW_SLUG_PATTERN.test(value)
  );
}

/** 목록 하나 정리: 형식 · (아는 목록) · 중복 · 한도. 버린 것 중 한도 때문에 빠진 것은 `overflow`에 담는다. */
function cleanList(
  raw: unknown,
  kind: FollowKind,
  known: FollowKnown | undefined,
  overflow?: string[],
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (!isFollowSlug(item)) continue;
    if (known && !known[kind].has(item)) continue;
    if (out.includes(item) || overflow?.includes(item)) continue;
    if (out.length < FOLLOW_LIMITS[kind]) out.push(item);
    else overflow?.push(item);
  }
  return out;
}

function make(teams: readonly string[], players: readonly string[]) {
  return { v: FOLLOW_VERSION, teams, players } satisfies FollowState;
}

/**
 * 아무 값 → 정리된 팔로우 상태(읽기 경계). 객체가 아니거나 `v`가 1이 아니면 빈 상태.
 * 배열이 아닌 목록은 빈 목록, 형식이 틀린 slug·중복은 버리고, 한도를 넘으면 앞에서부터 한도까지.
 * `known`을 주면 모르는 slug도 버린다.
 */
export function normalizeFollows(
  raw: unknown,
  known?: FollowKnown,
): FollowState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return EMPTY_FOLLOWS;
  }
  const record = raw as Record<string, unknown>;
  if (record.v !== FOLLOW_VERSION) return EMPTY_FOLLOWS;
  const teams = cleanList(record.teams, "teams", known);
  const players = cleanList(record.players, "players", known);
  if (teams.length === 0 && players.length === 0) return EMPTY_FOLLOWS;
  return make(teams, players);
}

/** 저장 문자열 → 상태. null·깨진 JSON은 빈 상태(던지지 않음). */
export function parseFollows(
  text: string | null,
  known?: FollowKnown,
): FollowState {
  if (text === null) return EMPTY_FOLLOWS;
  try {
    return normalizeFollows(JSON.parse(text), known);
  } catch {
    return EMPTY_FOLLOWS;
  }
}

/** 상태 → 저장 문자열(키 순서 고정: v · teams · players) */
export function serializeFollows(state: FollowState): string {
  return JSON.stringify(make(state.teams, state.players));
}

/** 팔로우가 하나도 없는지(온보딩 진입 조건 — FR-113) */
export function isFollowEmpty(state: FollowState): boolean {
  return state.teams.length === 0 && state.players.length === 0;
}

/** 이 대상을 팔로우 중인지 */
export function isFollowing(
  state: FollowState,
  kind: FollowKind,
  slug: string,
): boolean {
  return state[kind].includes(slug);
}

/** 그 종류가 한도에 이르렀는지 */
export function isFollowAtLimit(state: FollowState, kind: FollowKind): boolean {
  return state[kind].length >= FOLLOW_LIMITS[kind];
}

/**
 * 버튼 상태: 팔로우 중이면 `on`(한도여도 풀 수 있다), 아니고 그 종류가 꽉 찼으면 `limit`, 그 밖에는 `off`.
 * 한도는 종류별이라 팀 5개를 채워도 선수 버튼은 `off`다(D67 ②).
 */
export function followButtonState(
  state: FollowState,
  kind: FollowKind,
  slug: string,
): FollowButtonState {
  if (isFollowing(state, kind, slug)) return "on";
  return isFollowAtLimit(state, kind) ? "limit" : "off";
}

function withList(
  state: FollowState,
  kind: FollowKind,
  list: readonly string[],
): FollowState {
  return kind === "teams" ? make(list, state.players) : make(state.teams, list);
}

/**
 * 팔로우 추가 — 끝에 붙인다. 이미 팔로우 중 · 형식이 틀린 slug · 한도면 **같은 객체**를 돌려준다(바뀌었는지 `!==`로 안다).
 */
export function addFollow(
  state: FollowState,
  kind: FollowKind,
  slug: string,
): FollowState {
  if (
    !isFollowSlug(slug) ||
    isFollowing(state, kind, slug) ||
    isFollowAtLimit(state, kind)
  ) {
    return state;
  }
  return withList(state, kind, [...state[kind], slug]);
}

/** 팔로우 해제. 팔로우 중이 아니면 같은 객체. */
export function removeFollow(
  state: FollowState,
  kind: FollowKind,
  slug: string,
): FollowState {
  if (!isFollowing(state, kind, slug)) return state;
  return withList(
    state,
    kind,
    state[kind].filter((s) => s !== slug),
  );
}

/** 켜짐 ↔ 꺼짐. 꺼짐인데 한도면 바뀌지 않는다(같은 객체). */
export function toggleFollow(
  state: FollowState,
  kind: FollowKind,
  slug: string,
): FollowState {
  return isFollowing(state, kind, slug)
    ? removeFollow(state, kind, slug)
    : addFollow(state, kind, slug);
}

/**
 * 가져오기(FR-114, D67 ③) — 들어온 상태를 덮어쓰거나 합친다.
 * - `incoming`은 정리 전 목록이어도 된다(`followQueryLists` 결과 — 한도를 넘는 목록도 받아 빠진 것을 센다).
 * - `replace`: 들어온 것만 남긴다(정리 · 한도 적용).
 * - `merge`: 지금 것을 앞에 두고 들어온 것 중 없는 것을 뒤에 붙인다. 한도를 넘으면 지금 것이 우선이고 들어온 것이 빠진다.
 * `dropped`는 한도 때문에 빠진 slug(형식이 틀린 것은 세지 않는다).
 */
export function importFollows(
  current: FollowLists,
  incoming: FollowLists,
  mode: FollowImportMode,
  known?: FollowKnown,
): FollowImportResult {
  const dropped: Record<FollowKind, string[]> = { teams: [], players: [] };
  const lists = {} as Record<FollowKind, string[]>;
  for (const kind of FOLLOW_KINDS) {
    const source =
      mode === "merge" ? [...current[kind], ...incoming[kind]] : incoming[kind];
    lists[kind] = cleanList(source, kind, known, dropped[kind]);
  }
  const state =
    lists.teams.length === 0 && lists.players.length === 0
      ? EMPTY_FOLLOWS
      : make(lists.teams, lists.players);
  return { state, dropped };
}

/** 두 상태가 같은 팔로우인지(순서까지) */
export function sameFollows(a: FollowLists, b: FollowLists): boolean {
  return FOLLOW_KINDS.every(
    (kind) =>
      a[kind].length === b[kind].length &&
      a[kind].every((s, i) => s === b[kind][i]),
  );
}

/**
 * 상태 → 공유 URL 쿼리 문자열(앞의 `?` 없음). 예: `t=arsenal,bayern-munchen&p=kim-min-jae`.
 * slug는 `[a-z0-9-]`뿐이라 인코딩하지 않는다(읽히는 쿼리 — D67 ③). 빈 종류는 빼고, 모두 비면 빈 문자열.
 */
export function followsToQuery(state: FollowLists): string {
  return FOLLOW_KINDS.filter((kind) => state[kind].length > 0)
    .map((kind) => `${FOLLOW_QUERY_PARAMS[kind]}=${state[kind].join(",")}`)
    .join("&");
}

/**
 * 공유 URL 쿼리 → 들어온 상태. `t`·`p` 둘 다 없으면 null(가져올 것 없음 — 확인 화면을 띄우지 않는다).
 * 같은 이름이 여러 번 오면 이어 붙이고(`?t=a&t=b`), `%2C`도 쉼표로 읽는다. 형식이 틀린 slug·중복은 버리고 한도 적용.
 * 한도 때문에 빠진 것까지 알아야 하면(가져오기 확인 화면) `followQueryLists` → `importFollows`를 쓴다.
 */
export function followsFromQuery(
  search: string | URLSearchParams,
  known?: FollowKnown,
): FollowState | null {
  const lists = followQueryLists(search);
  if (lists === null) return null;
  return normalizeFollows({ v: FOLLOW_VERSION, ...lists }, known);
}

/**
 * 공유 URL 쿼리 → 종류별 원래 slug 목록(정리 전 — 형식 검사만). `t`·`p` 둘 다 없으면 null.
 * 가져오기 확인 화면이 "n개 중 m개만 들어가요"를 셀 때 쓴다.
 */
export function followQueryLists(
  search: string | URLSearchParams,
): Record<FollowKind, string[]> | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  if (FOLLOW_KINDS.every((kind) => !params.has(FOLLOW_QUERY_PARAMS[kind]))) {
    return null;
  }
  const lists = {} as Record<FollowKind, string[]>;
  for (const kind of FOLLOW_KINDS) {
    lists[kind] = params
      .getAll(FOLLOW_QUERY_PARAMS[kind])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(isFollowSlug);
  }
  return lists;
}
