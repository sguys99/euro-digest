/**
 * 팔로우 상태 훅 — src/lib/use-follows.ts (FR-110, M4-07)
 *
 * 여러 섬이 같은 상태를 나누는지(구독), 다른 탭의 `storage` 이벤트를 따라가는지, 서버 스냅샷이 빈 상태인지(정적 export ·
 * 하이드레이션 불일치 없음), 스냅샷 메모이즈, 저장소가 막혀도 이번 방문 동안 동작하는지(메모리 폴백) 본다.
 */
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_FOLLOWS,
  FOLLOW_STORAGE_KEY,
  followButtonState,
} from "@/lib/follow";
import { createSafeStorage, type StorageLike } from "@/lib/safe-storage";
import {
  createFollowStore,
  followStore,
  type FollowStore,
  useFollows,
} from "@/lib/use-follows";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

function newStore(): FollowStore {
  return createFollowStore(
    createSafeStorage(() => window.localStorage),
    window,
  );
}

function stored(): unknown {
  const text = window.localStorage.getItem(FOLLOW_STORAGE_KEY);
  return text === null ? null : JSON.parse(text);
}

/** 다른 탭이 저장소에 쓴 것처럼: 값을 바꾸고 storage 이벤트를 보낸다 */
function otherTabWrites(
  value: string | null,
  key: string | null = FOLLOW_STORAGE_KEY,
) {
  if (key === null) window.localStorage.clear();
  else if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  });
}

function Button({ store, slug }: { store: FollowStore; slug: string }) {
  const { follows, toggle } = useFollows(store);
  const s = followButtonState(follows, "teams", slug);
  return (
    <button
      type="button"
      aria-pressed={s === "on"}
      data-state={s}
      onClick={() => toggle("teams", slug)}
    >
      {slug}
    </button>
  );
}

function Count({ store }: { store: FollowStore }) {
  const { follows, ready } = useFollows(store);
  return (
    <p data-testid="count" data-ready={String(ready)}>
      {follows.teams.length}/{follows.players.length}
    </p>
  );
}

describe("구독 — 여러 섬이 같은 상태", () => {
  it("한 섬에서 바꾸면 다른 섬도 바뀌고 저장된다", () => {
    const store = newStore();
    render(
      <>
        <Button store={store} slug="arsenal" />
        <Button store={store} slug="arsenal" />
        <Count store={store} />
      </>,
    );
    const [a, b] = screen.getAllByRole("button", { name: "arsenal" });
    expect(a).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(a!);
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("count")).toHaveTextContent("1/0");
    expect(stored()).toEqual({ v: 1, teams: ["arsenal"], players: [] });
    fireEvent.click(b!);
    expect(a).toHaveAttribute("aria-pressed", "false");
    expect(stored()).toEqual({ v: 1, teams: [], players: [] });
  });

  it("한도에 이르면 그 종류의 꺼진 버튼만 limit", () => {
    const store = newStore();
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      JSON.stringify({ v: 1, teams: ["a", "b", "c", "d"], players: [] }),
    );
    render(
      <>
        <Button store={store} slug="e" />
        <Button store={store} slug="f" />
      </>,
    );
    expect(screen.getByRole("button", { name: "f" })).toHaveAttribute(
      "data-state",
      "off",
    );
    fireEvent.click(screen.getByRole("button", { name: "e" }));
    expect(screen.getByRole("button", { name: "f" })).toHaveAttribute(
      "data-state",
      "limit",
    );
    fireEvent.click(screen.getByRole("button", { name: "f" }));
    expect(stored()).toEqual({
      v: 1,
      teams: ["a", "b", "c", "d", "e"],
      players: [],
    });
  });

  it("마운트 전에 저장된 값을 첫 렌더에 읽는다(클라이언트 렌더)", () => {
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["arsenal"],"players":["kim-min-jae"]}',
    );
    render(<Count store={newStore()} />);
    expect(screen.getByTestId("count")).toHaveTextContent("1/1");
    expect(screen.getByTestId("count")).toHaveAttribute("data-ready", "true");
  });

  it("깨진 저장값은 빈 상태로 읽고, 다음 쓰기가 정리된 값으로 덮는다", () => {
    window.localStorage.setItem(FOLLOW_STORAGE_KEY, "{broken");
    const store = newStore();
    render(
      <>
        <Count store={store} />
        <Button store={store} slug="arsenal" />
      </>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0/0");
    fireEvent.click(screen.getByRole("button", { name: "arsenal" }));
    expect(stored()).toEqual({ v: 1, teams: ["arsenal"], players: [] });
  });
});

describe("탭 간 동기화 — storage 이벤트", () => {
  it("다른 탭이 쓰면 따라간다", () => {
    render(<Count store={newStore()} />);
    otherTabWrites('{"v":1,"teams":["arsenal","napoli"],"players":[]}');
    expect(screen.getByTestId("count")).toHaveTextContent("2/0");
    otherTabWrites(null);
    expect(screen.getByTestId("count")).toHaveTextContent("0/0");
  });

  it("다른 탭의 clear()(key null)도 따라간다", () => {
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["arsenal"],"players":[]}',
    );
    render(<Count store={newStore()} />);
    expect(screen.getByTestId("count")).toHaveTextContent("1/0");
    otherTabWrites(null, null);
    expect(screen.getByTestId("count")).toHaveTextContent("0/0");
  });

  it("다른 키의 이벤트는 구독자에게 알리지 않는다", () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    otherTabWrites("dark", "ed-theme");
    expect(listener).not.toHaveBeenCalled();
    otherTabWrites('{"v":1,"teams":["arsenal"],"players":[]}');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("구독자가 없어지면 storage 리스너를 뗀다", () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const store = createFollowStore(
      createSafeStorage(() => window.localStorage),
      target,
    );
    const first = store.subscribe(() => {});
    const second = store.subscribe(() => {});
    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    first();
    expect(target.removeEventListener).not.toHaveBeenCalled();
    second();
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
    expect(target.removeEventListener.mock.calls[0]![1]).toBe(
      target.addEventListener.mock.calls[0]![1],
    );
  });
});

describe("서버 스냅샷 — 정적 export · 하이드레이션", () => {
  it("서버 렌더는 저장값과 상관없이 빈 상태 · ready false", () => {
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["arsenal"],"players":[]}',
    );
    const html = renderToString(<Count store={newStore()} />);
    expect(html).toContain("0<!-- -->/<!-- -->0");
    expect(html).toContain('data-ready="false"');
    expect(followStore.getServerSnapshot()).toBe(EMPTY_FOLLOWS);
  });

  it("하이드레이션은 불일치 없이 서버 값으로 시작해 저장값으로 바뀐다", async () => {
    const store = newStore();
    const html = renderToString(<Count store={store} />);
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["arsenal"],"players":["kim-min-jae"]}',
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const errors: unknown[] = [];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => errors.push(args));
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Count store={store} />, {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    const p = container.querySelector("[data-testid=count]");
    expect(p).toHaveTextContent("1/1");
    expect(p).toHaveAttribute("data-ready", "true");
    expect(errors).toEqual([]);
    consoleError.mockRestore();
    act(() => root?.unmount());
    container.remove();
  });
});

describe("스냅샷 메모이즈 · 동작 참조", () => {
  it("저장값이 같으면 같은 스냅샷 객체", () => {
    const store = newStore();
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["arsenal"],"players":[]}',
    );
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["napoli"],"players":[]}',
    );
    expect(store.getSnapshot()).not.toBe(a);
    expect(store.getSnapshot().teams).toEqual(["napoli"]);
  });

  it("동작 함수는 다시 그려도 같은 참조, 결과 객체는 상태가 같으면 같다", () => {
    const store = newStore();
    const { result, rerender } = renderHook(() => useFollows(store));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => {
      result.current.follow("players", "kim-min-jae");
    });
    expect(result.current).not.toBe(first);
    expect(result.current.toggle).toBe(first.toggle);
    expect(result.current.follows.players).toEqual(["kim-min-jae"]);
  });

  it("바뀌지 않는 동작은 쓰지도 알리지도 않는다", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(store.update((s) => s)).toEqual({
      state: EMPTY_FOLLOWS,
      changed: false,
      saved: true,
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("동작 결과 · 가져오기", () => {
  it("follow · unfollow · toggle 결과", () => {
    const { result } = renderHook(() => useFollows(newStore()));
    let update = result.current.follow("teams", "arsenal");
    expect(update).toMatchObject({ changed: true, saved: true });
    update = result.current.follow("teams", "arsenal");
    expect(update.changed).toBe(false);
    update = result.current.unfollow("teams", "arsenal");
    expect(update).toMatchObject({ changed: true, state: EMPTY_FOLLOWS });
  });

  it("importFrom: 합치기는 한도 초과분을 dropped로, 같은 내용이면 changed false", () => {
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      '{"v":1,"teams":["a","b","c","d"],"players":[]}',
    );
    const { result } = renderHook(() => useFollows(newStore()));
    let update;
    act(() => {
      update = result.current.importFrom(
        { teams: ["c", "e", "f"], players: ["kim-min-jae"] },
        "merge",
      );
    });
    expect(update).toMatchObject({
      changed: true,
      saved: true,
      dropped: { teams: ["f"], players: [] },
    });
    expect(result.current.follows).toEqual({
      v: 1,
      teams: ["a", "b", "c", "d", "e"],
      players: ["kim-min-jae"],
    });
    act(() => {
      update = result.current.importFrom(
        { teams: ["a", "b"], players: [] },
        "merge",
      );
    });
    expect(update).toMatchObject({ changed: false });
    act(() => {
      update = result.current.importFrom(
        { teams: ["z"], players: [] },
        "replace",
      );
    });
    expect(stored()).toEqual({ v: 1, teams: ["z"], players: [] });
  });
});

describe("저장소를 쓸 수 없을 때", () => {
  it("전역 접근이 던져도 렌더되고, 이번 방문 동안 상태가 바뀐다(saved false)", () => {
    const store = createFollowStore(
      createSafeStorage(() => {
        throw new Error("SecurityError");
      }),
      window,
    );
    render(
      <>
        <Button store={store} slug="arsenal" />
        <Count store={store} />
      </>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0/0");
    let update;
    act(() => {
      update = store.update((s) => ({ ...s, teams: ["arsenal"] }));
    });
    expect(update).toMatchObject({ changed: true, saved: false });
    expect(screen.getByRole("button", { name: "arsenal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "arsenal" }));
    expect(screen.getByTestId("count")).toHaveTextContent("0/0");
  });

  it("쿼터 초과: 같은 탭에서는 새 값, 다른 탭이 저장소에 쓰면 그 값으로", () => {
    const backing = new Map<string, string>();
    let quota = false;
    const storage: StorageLike = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        if (quota) throw new Error("QuotaExceededError");
        backing.set(k, v);
      },
      removeItem: (k) => void backing.delete(k),
    };
    const store = createFollowStore(
      createSafeStorage(() => storage),
      window,
    );
    render(<Count store={store} />);
    quota = true;
    let update;
    act(() => {
      update = store.update((s) => ({ ...s, players: ["kim-min-jae"] }));
    });
    expect(update).toMatchObject({ saved: false });
    expect(screen.getByTestId("count")).toHaveTextContent("0/1");
    backing.set(FOLLOW_STORAGE_KEY, '{"v":1,"teams":["arsenal"],"players":[]}');
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: FOLLOW_STORAGE_KEY }),
      );
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1/0");
  });
});
