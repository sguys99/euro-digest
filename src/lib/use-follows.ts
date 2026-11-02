/**
 * 팔로우 상태 저장소 + React 훅 — 여러 클라이언트 섬(팔로우 버튼·`/my`·온보딩·홈 '내 팀 소식')이 같은 상태를 나눈다 (FR-110, M4-07)
 *
 * - `useSyncExternalStore`: 저장값 문자열이 같으면 같은 스냅샷 객체를 돌려준다(메모이즈 — 불필요한 다시 그리기·무한 루프 없음).
 * - 같은 탭: 한 섬이 바꾸면 구독한 섬 모두에 알린다. 다른 탭: `storage` 이벤트로 따라간다(그 키 또는 `clear()`).
 * - 서버 스냅샷은 늘 빈 상태(`EMPTY_FOLLOWS`) — 정적 export HTML에는 팔로우가 없고, 하이드레이션 뒤 저장값으로 바뀐다
 *   (하이드레이션 불일치 없음). 첫 렌더가 서버 값인지는 `ready`로 안다(온보딩 진입 줄이 팔로우 0을 오판하지 않게 — M4-09).
 * - 저장은 `src/lib/safe-storage.ts`(모든 접근 try/catch, 실패 시 이번 방문 동안 메모리). 저장에 실패해도 상태는 바뀌고
 *   결과의 `saved`가 false다.
 * - 런타임 의존성 없음, zod 없음(클라이언트 번들). 컴포넌트가 아니라 `"use client"`를 달지 않는다 — 클라이언트 섬에서만 import한다.
 */
import { useMemo, useSyncExternalStore } from "react";

import {
  addFollow,
  EMPTY_FOLLOWS,
  FOLLOW_STORAGE_KEY,
  type FollowImportMode,
  type FollowKind,
  type FollowKnown,
  type FollowLists,
  type FollowState,
  importFollows,
  parseFollows,
  removeFollow,
  sameFollows,
  serializeFollows,
  toggleFollow,
} from "@/lib/follow";
import { safeLocalStorage, type SafeStorage } from "@/lib/safe-storage";

/** 상태를 바꾼 결과 */
export interface FollowUpdate {
  /** 바꾼 뒤 상태 */
  state: FollowState;
  /** 실제로 바뀌었는지(이미 팔로우 중 · 한도 · 형식 오류면 false) */
  changed: boolean;
  /** 저장소에 남았는지(바뀌지 않았으면 true). false면 이번 방문 동안만 유지된다 */
  saved: boolean;
}

/** 가져오기 결과 — 한도 때문에 빠진 slug까지 */
export interface FollowImportUpdate extends FollowUpdate {
  dropped: Readonly<Record<FollowKind, readonly string[]>>;
}

export interface FollowStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): FollowState;
  getServerSnapshot(): FollowState;
  /** 지금 상태에 함수를 적용해 저장하고 구독자에게 알린다. 같은 객체를 돌려주면 아무것도 하지 않는다. */
  update(recipe: (current: FollowState) => FollowState): FollowUpdate;
  /** 저장소에 쓸 수 있는지(차단이면 false — 팔로우는 이번 방문 동안만 유지된다, M4-08 `/my` 머리 안내) */
  persistent(): boolean;
}

/** 이벤트를 받는 대상(`window`) — 테스트에서 바꿀 수 있게 */
type EventTargetLike = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * 팔로우 저장소를 만든다. 기본 인스턴스는 `followStore`(브라우저 `localStorage` + `window`의 `storage` 이벤트).
 * `target`을 주지 않으면 구독 때 `window`를 쓴다(있을 때만).
 */
export function createFollowStore(
  storage: SafeStorage,
  target?: EventTargetLike,
): FollowStore {
  const listeners = new Set<() => void>();
  let cachedText: string | null | undefined;
  let cachedState: FollowState = EMPTY_FOLLOWS;

  function getSnapshot(): FollowState {
    const text = storage.get(FOLLOW_STORAGE_KEY);
    if (text !== cachedText) {
      cachedText = text;
      cachedState = parseFollows(text);
    }
    return cachedState;
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent) {
    // key null = 다른 탭의 clear(). 다른 탭이 저장소에 쓴 값이 이 탭의 메모리 폴백보다 새롭다.
    if (event.key !== null && event.key !== FOLLOW_STORAGE_KEY) return;
    storage.dropMemory(event.key === null ? undefined : FOLLOW_STORAGE_KEY);
    emit();
  }

  function eventTarget(): EventTargetLike | undefined {
    if (target) return target;
    return typeof window === "undefined" ? undefined : window;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1)
        eventTarget()?.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0)
          eventTarget()?.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot,
    getServerSnapshot: () => EMPTY_FOLLOWS,
    update(recipe) {
      const current = getSnapshot();
      const next = recipe(current);
      if (next === current)
        return { state: current, changed: false, saved: true };
      const saved = storage.set(FOLLOW_STORAGE_KEY, serializeFollows(next));
      emit();
      return { state: getSnapshot(), changed: true, saved };
    },
    persistent: () => storage.writable(),
  };
}

/** 브라우저 기본 팔로우 저장소 — 모든 섬이 이 인스턴스를 나눈다 */
export const followStore: FollowStore = createFollowStore(safeLocalStorage);

const noopSubscribe = () => () => {};

/** 하이드레이션이 끝났는지 — 서버 렌더·하이드레이션 첫 렌더는 false, 그 뒤 true */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export interface UseFollowsResult {
  /** 지금 팔로우 상태(서버·하이드레이션 첫 렌더는 빈 상태) */
  follows: FollowState;
  /** 저장값을 읽은 뒤인지. false인 동안 `follows`가 비어 있어도 "팔로우 0"으로 판단하지 않는다 */
  ready: boolean;
  follow(kind: FollowKind, slug: string): FollowUpdate;
  unfollow(kind: FollowKind, slug: string): FollowUpdate;
  toggle(kind: FollowKind, slug: string): FollowUpdate;
  /** 공유 URL 가져오기(FR-114) — 덮어쓰기 · 합치기 */
  importFrom(
    incoming: FollowLists,
    mode: FollowImportMode,
    known?: FollowKnown,
  ): FollowImportUpdate;
}

/** 저장소에 묶인 동작 — 저장소마다 한 번만 만든다(참조가 늘 같다) */
function actionsFor(store: FollowStore) {
  return {
    follow: (kind: FollowKind, slug: string) =>
      store.update((s) => addFollow(s, kind, slug)),
    unfollow: (kind: FollowKind, slug: string) =>
      store.update((s) => removeFollow(s, kind, slug)),
    toggle: (kind: FollowKind, slug: string) =>
      store.update((s) => toggleFollow(s, kind, slug)),
    importFrom(
      incoming: FollowLists,
      mode: FollowImportMode,
      known?: FollowKnown,
    ) {
      let dropped: FollowImportUpdate["dropped"] = { teams: [], players: [] };
      const result = store.update((current) => {
        const imported = importFollows(current, incoming, mode, known);
        dropped = imported.dropped;
        // 내용이 같으면 같은 객체 — 쓰지 않는다
        return sameFollows(imported.state, current) ? current : imported.state;
      });
      return { ...result, dropped };
    },
  };
}

const actionCache = new WeakMap<FollowStore, ReturnType<typeof actionsFor>>();

/**
 * 팔로우 상태 훅. 같은 저장소를 쓰는 모든 컴포넌트가 함께 다시 그려진다.
 * 동작 함수(`follow`·`unfollow`·`toggle`·`importFrom`)는 참조가 늘 같아 의존성 배열에 넣어도 된다.
 */
export function useFollows(store: FollowStore = followStore): UseFollowsResult {
  const follows = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const ready = useHydrated();
  let actions = actionCache.get(store);
  if (!actions) {
    actions = actionsFor(store);
    actionCache.set(store, actions);
  }
  return useMemo(
    () => ({ follows, ready, ...actions }),
    [follows, ready, actions],
  );
}
