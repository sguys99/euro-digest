/**
 * 안전한 브라우저 저장소 — 모든 접근을 try/catch로 감싸고, 못 쓰면 이번 방문 동안 메모리로 버틴다 (FR-110, CLAUDE §7.2, M4-07)
 *
 * 왜 필요한가: `localStorage`는 전역에 접근하는 것만으로 예외가 나는 환경(쿠키 차단·샌드박스 iframe·사파리 옛 프라이빗 모드),
 * 쓰기에서 쿼터 초과(`QuotaExceededError`)가 나는 환경이 있다. 어떤 경우에도 예외가 화면까지 올라오지 않게 하고,
 * 저장에 실패한 값은 메모리에 남겨 같은 탭 안에서는 방금 바꾼 상태가 그대로 보이게 한다(새로 고치면 사라짐).
 *
 * 규칙
 * - 키는 `ed-` 접두만 받는다(DESIGN §8 — `ed-theme`·`ed-spoiler`·`ed-follow`). 접두가 없으면 읽기 null · 쓰기 false(던지지 않음).
 * - 읽기: 메모리에 덮어쓴 값(직전 쓰기 실패분)이 있으면 그것, 없으면 저장소. 저장소를 못 읽으면 null.
 * - 쓰기·지우기: 저장소에 성공하면 메모리 값을 버리고 true, 실패하면 메모리에 남기고 false.
 * - JSON: 파싱 실패·직렬화 실패도 예외 없이 null · false. 값의 형식 검사는 쓰는 쪽(예: `src/lib/follow.ts`)이 한다.
 * - 런타임 의존성 없음 · DOM 타입 없이 테스트할 수 있게 저장소를 함수로 받는다. 클라이언트 섬이 import하므로 zod를 쓰지 않는다
 *   (`src/lib/schema/index.ts` 번들 주의).
 *
 * 초기 인라인 스크립트(`src/lib/theme.ts` `THEME_INIT_SCRIPT`)는 첫 페인트 전에 동기 실행되는 문자열이라 이 유틸을 쓰지 않는다.
 */

/** `localStorage`에서 읽기만 하는 부분 */
export interface StorageReader {
  getItem(key: string): string | null;
}

/** `localStorage`에서 쓰는 부분까지 */
export interface StorageLike extends StorageReader {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 저장소를 돌려주는 함수. `localStorage` 전역에 접근하는 것만으로 예외가 나는 환경이 있어서 값이 아니라 함수로 받는다 —
 * 호출까지 try 안에서 한다. 예: `() => window.localStorage`
 */
export type StorageGetter<T extends StorageReader = StorageReader> = () => T;

/** 이 서비스의 저장 키 접두(DESIGN §8) */
export const STORAGE_PREFIX = "ed-";

/** 저장 키 — `ed-` 접두 필수 */
export type StorageKey = `${typeof STORAGE_PREFIX}${string}`;

/** 접두 규칙을 지키는 키인지(`ed-` 뒤에 한 글자 이상) */
export function isStorageKey(key: string): key is StorageKey {
  return key.startsWith(STORAGE_PREFIX) && key.length > STORAGE_PREFIX.length;
}

export interface SafeStorage {
  /** 문자열 읽기. 없거나 못 읽으면 null */
  get(key: StorageKey): string | null;
  /** 문자열 쓰기. 저장소에 남았으면 true, 메모리에만 남았으면 false */
  set(key: StorageKey, value: string): boolean;
  /** 지우기. 저장소에서 지웠으면 true, 메모리에서만 지운 것으로 했으면 false */
  remove(key: StorageKey): boolean;
  /** JSON 읽기. 없거나 못 읽거나 깨진 JSON이면 null(형식 검사는 쓰는 쪽) */
  getJSON(key: StorageKey): unknown;
  /** JSON 쓰기. 직렬화가 실패하면(순환 참조 등) 아무것도 쓰지 않고 false */
  setJSON(key: StorageKey, value: unknown): boolean;
  /**
   * 메모리에 덮어쓴 값을 버린다 — 다른 탭이 저장소에 새 값을 쓴 `storage` 이벤트를 받았을 때 그 값을 읽게 한다.
   * 키를 주지 않으면 모두 버린다(`localStorage.clear()` 이벤트는 key가 null).
   */
  dropMemory(key?: StorageKey): void;
}

/**
 * 안전한 저장소를 만든다. 메모리 폴백은 인스턴스마다 따로 두므로, 같은 상태를 나누는 섬들은 같은 인스턴스를 써야 한다
 * (`safeLocalStorage`).
 */
export function createSafeStorage(
  getStorage: StorageGetter<StorageLike>,
): SafeStorage {
  /** 저장소 쓰기·지우기에 실패한 키의 이번 방문 값(null = 지움) */
  const memory = new Map<StorageKey, string | null>();

  function get(key: StorageKey): string | null {
    if (!isStorageKey(key)) return null;
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return getStorage().getItem(key);
    } catch {
      return null;
    }
  }

  function write(key: StorageKey, value: string | null): boolean {
    if (!isStorageKey(key)) return false;
    try {
      const storage = getStorage();
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      memory.delete(key);
      return true;
    } catch {
      memory.set(key, value);
      return false;
    }
  }

  return {
    get,
    set: (key, value) => write(key, value),
    remove: (key) => write(key, null),
    getJSON(key) {
      const text = get(key);
      if (text === null) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    },
    setJSON(key, value) {
      let text: string | undefined;
      try {
        text = JSON.stringify(value);
      } catch {
        return false;
      }
      // undefined·함수는 JSON 문자열이 없다 — 쓰지 않는다
      return typeof text === "string" ? write(key, text) : false;
    },
    dropMemory(key) {
      if (key === undefined) memory.clear();
      else memory.delete(key);
    },
  };
}

/**
 * 브라우저 `localStorage` 기본 인스턴스 — 클라이언트 섬들이 같은 메모리 폴백을 나눈다.
 * 서버(정적 export 빌드)에서는 `window`가 없어 모든 읽기가 null이다(던지지 않음). 서버 렌더에서 상태를 읽지 말고
 * `useSyncExternalStore`의 서버 스냅샷을 쓴다(`src/lib/use-follows.ts`).
 */
export const safeLocalStorage: SafeStorage = createSafeStorage(
  () => window.localStorage,
);
