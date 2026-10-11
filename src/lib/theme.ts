/**
 * 테마·결과 가리기 초기 상태 — 깜빡임 없는 초기 인라인 스크립트와 같은 로직의 순수 함수 (DESIGN.md §8, PRD DR-02, D0-10)
 *
 * 상태
 * | 저장값(`localStorage`)            | `<html>` 속성             | 화면 |
 * |----------------------------------|---------------------------|------|
 * | `ed-theme` 없음(또는 모르는 값)  | `data-theme` 없음          | 시스템 설정(`prefers-color-scheme`) — CSS가 고른다 |
 * | `ed-theme` = `light`             | `data-theme="light"`      | 라이트 |
 * | `ed-theme` = `dark`              | `data-theme="dark"`       | 다크 |
 * | `ed-spoiler` = `on`              | `data-spoiler="on"`       | 결과 가리기 켬(기능은 M4-15, 키·속성은 지금 고정) |
 *
 * - 초기 스크립트는 `matchMedia`를 보지 않는다. 시스템 테마는 globals.css의
 *   `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` 블록이 맡는다.
 * - `localStorage` 접근은 모두 try/catch(CLAUDE.md §7.2). 실패하면 시스템 테마·가리기 꺼짐으로 정상 렌더.
 * - 런타임 의존성 없음 — layout.tsx(서버)와 테마 토글(클라이언트 섬, D0-12)이 함께 import한다.
 */

/** 테마 저장 키. 값은 `light` | `dark`, 시스템이면 키를 지운다. */
export const THEME_STORAGE_KEY = "ed-theme";
/** 결과 가리기 저장 키. 켜면 `on`, 끄면 키를 지운다. */
export const SPOILER_STORAGE_KEY = "ed-spoiler";
/** 테마 속성(`<html data-theme>`) */
export const THEME_ATTRIBUTE = "data-theme";
/** 결과 가리기 속성(`<html data-spoiler="on">`) */
export const SPOILER_ATTRIBUTE = "data-spoiler";
/** 결과 가리기 켬 값(저장값·속성값 공통) */
export const SPOILER_ON = "on";

/** 사용자가 고른 테마. `system`은 저장하지 않는다(키 없음). */
export type ThemePreference = "system" | "light" | "dark";
/** 실제로 보이는 테마 */
export type ResolvedTheme = "light" | "dark";

/** 토글 순환 순서: 시스템 → 라이트 → 다크 → 시스템 (DESIGN.md §8) */
export const THEME_CYCLE: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

/**
 * `<meta name="theme-color">` 값 — DESIGN.md §2.1 `--paper`(지면) 라이트·다크.
 * CSS 변수를 읽을 수 없는 자리(메타 태그)라 값을 옮겨 둔다. tests/design-tokens.test.ts가 DESIGN.md와 일치를 검사한다.
 */
export const THEME_COLOR: Readonly<Record<ResolvedTheme, string>> = {
  light: "#F3F0EA",
  dark: "#0E1626",
};

/**
 * 깜빡임 없는 초기 인라인 스크립트 — DESIGN.md §8 혼합안 원문과 글자 하나까지 같다(테스트가 검사).
 * layout.tsx `<head>`에 인라인으로 넣어 첫 페인트 전에 동기 실행한다. 로직을 바꾸면 아래
 * `readInitialRootState`·`applyInitialRootState`와 DESIGN.md §8을 함께 고친다(테스트가 같은 결과인지 검사).
 */
export const THEME_INIT_SCRIPT =
  "(function(){var d=document.documentElement,t,s;" +
  `try{t=localStorage.getItem('${THEME_STORAGE_KEY}');s=localStorage.getItem('${SPOILER_STORAGE_KEY}')}catch(e){}` +
  `if(t==='light'||t==='dark')d.setAttribute('${THEME_ATTRIBUTE}',t);` +
  `if(s==='${SPOILER_ON}')d.setAttribute('${SPOILER_ATTRIBUTE}','${SPOILER_ON}')})();`;

// ─── 저장소·요소 최소 인터페이스 (DOM 타입 없이 테스트할 수 있게) ─────────────

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
 * 저장소를 돌려주는 함수. `localStorage` 전역에 접근하는 것만으로 예외가 나는 환경(쿠키 차단·샌드박스 iframe)이
 * 있어서 값이 아니라 함수로 받는다 — 호출까지 try 안에서 한다. 예: `() => window.localStorage`
 */
export type StorageGetter<T extends StorageReader = StorageReader> = () => T;

/** 속성을 다는 대상(`document.documentElement`) */
export interface AttributeTarget {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** 초기 스크립트가 `<html>`에 다는 속성 값. null이면 달지 않는다. */
export interface InitialRootState {
  theme: ResolvedTheme | null;
  spoiler: typeof SPOILER_ON | null;
}

// ─── 초기 상태 (초기 스크립트와 같은 로직) ─────────────────────────────────────

/**
 * 저장값 → 초기 속성. 초기 스크립트와 같은 규칙이다.
 * - 테마는 `light`·`dark`만, 결과 가리기는 `on`만 받아들이고 나머지는 무시한다.
 * - 저장소 접근이 예외를 던지면 그때까지 읽은 값만 쓴다(둘 다 못 읽으면 시스템 테마·가리기 꺼짐).
 */
export function readInitialRootState(
  getStorage: StorageGetter,
): InitialRootState {
  let theme: string | null | undefined;
  let spoiler: string | null | undefined;
  try {
    const storage = getStorage();
    theme = storage.getItem(THEME_STORAGE_KEY);
    spoiler = storage.getItem(SPOILER_STORAGE_KEY);
  } catch {
    // 저장소를 못 읽으면 기본값(시스템 테마·가리기 꺼짐)으로 렌더한다.
  }
  return {
    theme: theme === "light" || theme === "dark" ? theme : null,
    spoiler: spoiler === SPOILER_ON ? SPOILER_ON : null,
  };
}

/** 초기 속성 적용 — 초기 스크립트처럼 달기만 하고 지우지는 않는다. */
export function applyInitialRootState(
  root: Pick<AttributeTarget, "setAttribute">,
  state: InitialRootState,
): void {
  if (state.theme !== null) root.setAttribute(THEME_ATTRIBUTE, state.theme);
  if (state.spoiler !== null) {
    root.setAttribute(SPOILER_ATTRIBUTE, state.spoiler);
  }
}

/** 고른 테마 + 시스템 다크 여부 → 실제로 보이는 테마(CSS 선택자 규칙과 같다) */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

// ─── 토글용 (D0-12 테마 토글·M4-15 결과 가리기 스위치가 쓴다) ──────────────────

/** 지금 `<html>` 속성에서 고른 테마를 읽는다. 속성이 없거나 모르는 값이면 시스템. */
export function themePreferenceFromRoot(
  root: Pick<AttributeTarget, "getAttribute">,
): ThemePreference {
  const value = root.getAttribute(THEME_ATTRIBUTE);
  return value === "light" || value === "dark" ? value : "system";
}

/** 토글 다음 상태: 시스템 → 라이트 → 다크 → 시스템 */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? "system";
}

/**
 * 고른 테마를 적용하고 저장한다. 속성은 항상 바꾸고, 저장 실패는 조용히 넘긴다(이번 방문에만 적용).
 * 시스템이면 속성과 저장 키를 모두 지운다.
 * @returns 저장에 성공했으면 true
 */
export function applyThemePreference(
  root: AttributeTarget,
  getStorage: StorageGetter<StorageLike>,
  preference: ThemePreference,
): boolean {
  if (preference === "system") root.removeAttribute(THEME_ATTRIBUTE);
  else root.setAttribute(THEME_ATTRIBUTE, preference);
  try {
    const storage = getStorage();
    if (preference === "system") storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/** 지금 결과 가리기가 켜져 있는지(`<html data-spoiler="on">`) */
export function isSpoilerOn(
  root: Pick<AttributeTarget, "getAttribute">,
): boolean {
  return root.getAttribute(SPOILER_ATTRIBUTE) === SPOILER_ON;
}

/**
 * 결과 가리기 켬/끔을 적용하고 저장한다. 끄면 속성과 저장 키를 지운다. 저장 실패는 조용히 넘긴다.
 * @returns 저장에 성공했으면 true
 */
export function applySpoilerPreference(
  root: AttributeTarget,
  getStorage: StorageGetter<StorageLike>,
  on: boolean,
): boolean {
  if (on) root.setAttribute(SPOILER_ATTRIBUTE, SPOILER_ON);
  else root.removeAttribute(SPOILER_ATTRIBUTE);
  try {
    const storage = getStorage();
    if (on) storage.setItem(SPOILER_STORAGE_KEY, SPOILER_ON);
    else storage.removeItem(SPOILER_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
