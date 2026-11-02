/**
 * 안전한 저장소 유틸 — src/lib/safe-storage.ts (FR-110, CLAUDE §7.2, M4-07)
 *
 * 어떤 저장소 실패(전역 접근 예외 · getItem/setItem 예외 · 쿼터 초과)에도 던지지 않고, 쓰기 실패분은 이번 방문 동안 메모리로
 * 남는지, 저장소가 돌아오면 다시 저장소를 쓰는지, JSON 깨짐·직렬화 실패, `ed-` 접두 규칙을 본다.
 */
import { describe, expect, it } from "vitest";

import {
  createSafeStorage,
  isStorageKey,
  STORAGE_PREFIX,
  type StorageLike,
} from "@/lib/safe-storage";

class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error("SecurityError");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failRemove) throw new Error("SecurityError");
    this.map.delete(key);
  }
}

function setup() {
  const fake = new FakeStorage();
  return { fake, safe: createSafeStorage(() => fake) };
}

describe("키 접두 규칙", () => {
  it("`ed-` 뒤에 한 글자 이상인 키만 받는다", () => {
    expect(STORAGE_PREFIX).toBe("ed-");
    expect(isStorageKey("ed-follow")).toBe(true);
    expect(isStorageKey("ed-")).toBe(false);
    expect(isStorageKey("follow")).toBe(false);
    expect(isStorageKey("xed-follow")).toBe(false);
  });

  it("접두가 없는 키는 읽기 null · 쓰기 false이고 저장소를 건드리지 않는다", () => {
    const { fake, safe } = setup();
    fake.map.set("theme", "dark");
    // 타입으로 막히는 키를 일부러 넘긴다(런타임 방어 확인)
    const bad = "theme" as `ed-${string}`;
    expect(safe.get(bad)).toBeNull();
    expect(safe.set(bad, "light")).toBe(false);
    expect(safe.remove(bad)).toBe(false);
    expect(fake.map.get("theme")).toBe("dark");
  });
});

describe("정상 저장소", () => {
  it("문자열 읽기·쓰기·지우기", () => {
    const { fake, safe } = setup();
    expect(safe.get("ed-a")).toBeNull();
    expect(safe.set("ed-a", "1")).toBe(true);
    expect(fake.map.get("ed-a")).toBe("1");
    expect(safe.get("ed-a")).toBe("1");
    expect(safe.remove("ed-a")).toBe(true);
    expect(fake.map.has("ed-a")).toBe(false);
    expect(safe.get("ed-a")).toBeNull();
  });

  it("JSON 읽기·쓰기", () => {
    const { fake, safe } = setup();
    expect(safe.setJSON("ed-j", { v: 1, a: [1, 2] })).toBe(true);
    expect(fake.map.get("ed-j")).toBe('{"v":1,"a":[1,2]}');
    expect(safe.getJSON("ed-j")).toEqual({ v: 1, a: [1, 2] });
  });

  it("다른 코드가 저장소에 직접 쓴 값도 읽는다", () => {
    const { fake, safe } = setup();
    fake.map.set("ed-x", "outside");
    expect(safe.get("ed-x")).toBe("outside");
  });
});

describe("JSON 실패", () => {
  it("깨진 JSON은 null(던지지 않음)", () => {
    const { fake, safe } = setup();
    for (const broken of ["{", "undefined", "{'a':1}", "", "NaN"]) {
      fake.map.set("ed-j", broken);
      expect(safe.getJSON("ed-j")).toBeNull();
    }
  });

  it("없는 키는 null", () => {
    expect(setup().safe.getJSON("ed-none")).toBeNull();
  });

  it("직렬화할 수 없는 값은 쓰지 않고 false", () => {
    const { fake, safe } = setup();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(safe.setJSON("ed-j", cyclic)).toBe(false);
    expect(safe.setJSON("ed-j", undefined)).toBe(false);
    expect(safe.setJSON("ed-j", () => 1)).toBe(false);
    expect(safe.setJSON("ed-j", 10n)).toBe(false);
    expect(fake.map.has("ed-j")).toBe(false);
  });
});

describe("저장소를 쓸 수 없을 때 — 메모리 폴백", () => {
  it("전역 접근부터 던지면(쿠키 차단·샌드박스) 읽기 null, 쓰기는 메모리에 남고 false", () => {
    const safe = createSafeStorage(() => {
      throw new Error("SecurityError: localStorage");
    });
    expect(safe.get("ed-a")).toBeNull();
    expect(safe.getJSON("ed-a")).toBeNull();
    expect(safe.set("ed-a", "1")).toBe(false);
    expect(safe.get("ed-a")).toBe("1");
    expect(safe.setJSON("ed-j", { v: 1 })).toBe(false);
    expect(safe.getJSON("ed-j")).toEqual({ v: 1 });
    expect(safe.remove("ed-a")).toBe(false);
    expect(safe.get("ed-a")).toBeNull();
  });

  it("getItem이 던지면 null", () => {
    const { fake, safe } = setup();
    fake.map.set("ed-a", "1");
    fake.failGet = true;
    expect(safe.get("ed-a")).toBeNull();
  });

  it("쿼터 초과: 쓰기 false, 같은 탭에서는 새 값이 보이고 저장소의 옛 값은 그대로", () => {
    const { fake, safe } = setup();
    fake.map.set("ed-a", "old");
    fake.failSet = true;
    expect(safe.set("ed-a", "new")).toBe(false);
    expect(fake.map.get("ed-a")).toBe("old");
    expect(safe.get("ed-a")).toBe("new");
  });

  it("지우기 실패: 같은 탭에서는 지운 것으로 보인다", () => {
    const { fake, safe } = setup();
    fake.map.set("ed-a", "old");
    fake.failRemove = true;
    expect(safe.remove("ed-a")).toBe(false);
    expect(safe.get("ed-a")).toBeNull();
    expect(fake.map.get("ed-a")).toBe("old");
  });

  it("저장소가 돌아오면 다음 쓰기가 저장소에 남고 메모리 값은 버린다", () => {
    const { fake, safe } = setup();
    fake.failSet = true;
    safe.set("ed-a", "mem");
    fake.failSet = false;
    expect(safe.set("ed-a", "disk")).toBe(true);
    expect(fake.map.get("ed-a")).toBe("disk");
    fake.map.set("ed-a", "outside");
    expect(safe.get("ed-a")).toBe("outside");
  });

  it("dropMemory: 메모리 값을 버리고 저장소 값을 읽는다(키 하나 · 전체)", () => {
    const { fake, safe } = setup();
    fake.failSet = true;
    safe.set("ed-a", "mem-a");
    safe.set("ed-b", "mem-b");
    fake.map.set("ed-a", "disk-a");
    fake.map.set("ed-b", "disk-b");
    safe.dropMemory("ed-a");
    expect(safe.get("ed-a")).toBe("disk-a");
    expect(safe.get("ed-b")).toBe("mem-b");
    safe.dropMemory();
    expect(safe.get("ed-b")).toBe("disk-b");
  });

  it("메모리 폴백은 인스턴스마다 따로다", () => {
    const fake = new FakeStorage();
    fake.failSet = true;
    const a = createSafeStorage(() => fake);
    const b = createSafeStorage(() => fake);
    a.set("ed-a", "1");
    expect(a.get("ed-a")).toBe("1");
    expect(b.get("ed-a")).toBeNull();
  });
});

describe("기본 인스턴스", () => {
  it("window가 없는 환경(서버·빌드)에서도 던지지 않는다", async () => {
    const { safeLocalStorage } = await import("@/lib/safe-storage");
    expect(typeof window).toBe("undefined");
    expect(safeLocalStorage.get("ed-follow")).toBeNull();
    expect(safeLocalStorage.getJSON("ed-follow")).toBeNull();
  });
});
