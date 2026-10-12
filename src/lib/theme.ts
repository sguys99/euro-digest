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
 * - 저장한 테마가 있으면 `<meta name="theme-color">`의 `media`도 바꾼다 — 그 테마 메타는 `all`, 다른 쪽은 `not all`
 *   (재방문 때 브라우저 UI 색이 지면과 어긋나지 않게, D0-12). 토글은 `syncThemeColorMeta`로 같은 규칙을 쓴다.
 *   메타는 Next `viewport.themeColor`가 아니라 루트 레이아웃 `<head>`가 직접 렌더한다(`THEME_COLOR_METAS`) — Next의
 *   viewport 메타는 클라이언트 이동마다 새 노드로 바뀌어 고친 `media`가 풀렸다(D0-12 리뷰, DESIGN §8).
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

/** theme-color 메타 선택자 — 초기 스크립트와 토글이 같은 메타를 고친다 */
export const THEME_COLOR_META_SELECTOR = 'meta[name="theme-color"]';

/** 미디어 쿼리 값: 항상 켬 / 항상 끔 */
const MEDIA_ALL = "all";
const MEDIA_NONE = "not all";

/**
 * theme-color 메타의 `media` 값.
 * - 시스템: 원래 미디어 쿼리 `(prefers-color-scheme: light|dark)` — layout.tsx가 렌더하는 메타(`THEME_COLOR_METAS`)도 이 값
 * - 라이트·다크: 고른 테마의 메타는 `all`(항상), 다른 쪽은 `not all`(끔)
 */
export function themeColorMedia(
  metaTheme: ResolvedTheme,
  preference: ThemePreference,
): string {
  if (preference === "system") return `(prefers-color-scheme: ${metaTheme})`;
  return metaTheme === preference ? MEDIA_ALL : MEDIA_NONE;
}

/**
 * 루트 레이아웃(`src/app/layout.tsx`) `<head>`에 직접 렌더하는 theme-color 메타 2개 — 시스템 기준 미디어 쿼리.
 *
 * Next `viewport.themeColor`를 쓰지 않는 이유(D0-12 리뷰): Next는 viewport 메타를 페이지 트리와 함께 렌더해서
 * `next/link` 클라이언트 이동마다 새 `<meta>` 노드로 바꿔 넣는다 → 초기 스크립트·토글이 고친 `media`가 시스템 기준으로
 * 돌아가 브라우저 UI 색이 지면과 어긋났다. 루트 레이아웃은 이동 때 다시 마운트되지 않으므로 이 메타 노드가 그대로 남는다.
 * React 19는 `<meta>`를 끌어올려 `<head>` 자식(초기 스크립트)보다 앞에 내보내고, 하이드레이션 때 `content`·`name`으로
 * 찾아 기존 노드를 그대로 가져간다(`media`는 대조하지 않음 — 경고 없음). 이후 props가 같아 DOM을 다시 쓰지 않는다.
 * 추가 JS 0.
 */
export const THEME_COLOR_METAS: ReadonlyArray<{
  theme: ResolvedTheme;
  media: string;
  content: string;
}> = (["light", "dark"] as const).map((theme) => ({
  theme,
  media: themeColorMedia(theme, "system"),
  content: THEME_COLOR[theme],
}));

/**
 * 깜빡임 없는 초기 인라인 스크립트 — DESIGN.md §8 원문과 글자 하나까지 같다(테스트가 검사).
 * layout.tsx `<head>`에 인라인으로 넣어 첫 페인트 전에 동기 실행한다. 로직을 바꾸면 아래
 * `readInitialRootState`·`applyInitialRootState`·`initialThemeColorMedia`와 DESIGN.md §8을 함께 고친다
 * (테스트가 같은 결과인지 검사).
 *
 * theme-color 보정: React가 레이아웃의 theme-color 메타(`THEME_COLOR_METAS`)를 끌어올려 `<head>` 자식(이 스크립트)보다
 * 앞에 내보내므로 실행 시점에 메타가 있다. 메타를 새로 넣지 않고 `media`만 바꾼다 — React 19는 `<meta>`를 `content`
 * 값으로 찾아 하이드레이션해서, 같은 `content`의 메타를 더 넣으면 그쪽을 자기 것으로 가져간다(DESIGN §8).
 */
export const THEME_INIT_SCRIPT =
  "(function(){var d=document,r=d.documentElement,t,s,m,i;" +
  `try{t=localStorage.getItem('${THEME_STORAGE_KEY}');s=localStorage.getItem('${SPOILER_STORAGE_KEY}')}catch(e){}` +
  `if(s==='${SPOILER_ON}')r.setAttribute('${SPOILER_ATTRIBUTE}','${SPOILER_ON}');` +
  `if(t==='light'||t==='dark'){r.setAttribute('${THEME_ATTRIBUTE}',t);` +
  `m=d.querySelectorAll('${THEME_COLOR_META_SELECTOR}');` +
  `for(i=0;i<m.length;i++)m[i].setAttribute('media',(m[i].getAttribute('media')||'').indexOf(t)<0?'${MEDIA_NONE}':'${MEDIA_ALL}')}})();`;

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

/** theme-color 메타(`<meta name="theme-color">`)에서 쓰는 부분 */
export type ThemeColorMetaLike = Pick<
  AttributeTarget,
  "getAttribute" | "setAttribute"
>;

/**
 * 초기 스크립트의 메타 규칙 — 원래 `media`(`(prefers-color-scheme: light|dark)`)에 고른 테마 이름이 들어 있으면
 * `all`, 아니면 `not all`. 결과는 `themeColorMedia(그 메타의 테마, 고른 테마)`와 같다(테스트가 검사).
 */
export function initialThemeColorMedia(
  media: string | null,
  theme: ResolvedTheme,
): string {
  return (media ?? "").includes(theme) ? MEDIA_ALL : MEDIA_NONE;
}

/** 초기 속성 적용 — 초기 스크립트처럼 달기만 하고 지우지는 않는다. 테마를 저장했으면 theme-color 메타도 고친다. */
export function applyInitialRootState(
  root: Pick<AttributeTarget, "setAttribute">,
  state: InitialRootState,
  metas: Iterable<ThemeColorMetaLike> = [],
): void {
  if (state.spoiler !== null) {
    root.setAttribute(SPOILER_ATTRIBUTE, state.spoiler);
  }
  if (state.theme === null) return;
  root.setAttribute(THEME_ATTRIBUTE, state.theme);
  for (const meta of metas) {
    meta.setAttribute(
      "media",
      initialThemeColorMedia(meta.getAttribute("media"), state.theme),
    );
  }
}

/**
 * theme-color 메타가 어느 테마의 색인지 — `content`가 THEME_COLOR 값이면 그 테마.
 * 초기 스크립트가 `media`를 `all`·`not all`로 바꾼 뒤에도 알 수 있게 `content`를 먼저 본다. 모르면 null.
 */
export function themeColorMetaTheme(
  meta: Pick<AttributeTarget, "getAttribute">,
): ResolvedTheme | null {
  const content = meta.getAttribute("content")?.trim().toUpperCase();
  if (content === THEME_COLOR.light.toUpperCase()) return "light";
  if (content === THEME_COLOR.dark.toUpperCase()) return "dark";
  return null;
}

/** 토글 후 theme-color 메타를 고른 테마에 맞춘다(DESIGN §8). 모르는 메타는 건드리지 않는다. */
export function syncThemeColorMeta(
  metas: Iterable<ThemeColorMetaLike>,
  preference: ThemePreference,
): void {
  for (const meta of metas) {
    const theme = themeColorMetaTheme(meta);
    if (theme) meta.setAttribute("media", themeColorMedia(theme, preference));
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
