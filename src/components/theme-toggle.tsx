"use client";

import { useSyncExternalStore } from "react";

import { ICON_BUTTON } from "@/components/ui/button-classes";
import { ThemeIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import {
  applyThemePreference,
  nextThemePreference,
  syncThemeColorMeta,
  THEME_ATTRIBUTE,
  THEME_COLOR_META_SELECTOR,
  themePreferenceFromRoot,
  type ThemePreference,
} from "@/lib/theme";
import { cx } from "@/lib/cx";

/**
 * 테마 토글 (DESIGN.md §8, D0-12) — 티켓 도구 영역의 아이콘 버튼(44×44, 반쯤 채운 원).
 *
 * - 3상태 순환: 시스템 → 라이트 → 다크 → 시스템(`nextThemePreference`). `<html data-theme>`를 바꾸고 `localStorage`
 *   `ed-theme`에 저장한다(시스템이면 지움). 저장이 막혀도(사생활 보호 모드 등) 이번 방문에는 적용된다.
 * - `<meta name="theme-color">`의 `media`도 같은 규칙으로 고친다(브라우저 UI 색 = 지면, `syncThemeColorMeta`).
 * - `aria-label` "테마: {시스템 설정|라이트|다크} (눌러서 바꾸기)" — 지금 상태를 알려 준다. 바꾸면 토스트 "테마: 라이트".
 * - 지금 상태는 `<html data-theme>`에서 읽는다(초기 스크립트가 첫 페인트 전에 단 값). 서버 렌더는 "시스템 설정"이고
 *   하이드레이션 뒤 실제 값으로 바뀐다. 다른 토글이 속성을 바꿔도 따라간다(MutationObserver).
 * - 색 면(티켓) 위에 놓이면 글자색·포커스 링은 바깥 요소가 준다(`--ring: var(--ticket-fg)`).
 */

const LABEL: Readonly<Record<ThemePreference, string>> = {
  system: "시스템 설정",
  light: "라이트",
  dark: "다크",
};

/** 토글 버튼의 접근 이름 */
export function themeToggleLabel(preference: ThemePreference): string {
  return `테마: ${LABEL[preference]} (눌러서 바꾸기)`;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

function getSnapshot(): ThemePreference {
  return themePreferenceFromRoot(document.documentElement);
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

export interface ThemeToggleProps {
  className?: string;
  /** 바꾼 뒤 토스트로 알린다(기본 true) */
  announce?: boolean;
}

export function ThemeToggle({ className, announce = true }: ThemeToggleProps) {
  const preference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  function handleClick() {
    const root = document.documentElement;
    const next = nextThemePreference(themePreferenceFromRoot(root));
    applyThemePreference(root, () => window.localStorage, next);
    syncThemeColorMeta(
      document.querySelectorAll(THEME_COLOR_META_SELECTOR),
      next,
    );
    if (announce) toast({ kind: "알림", message: `테마: ${LABEL[next]}` });
  }

  return (
    <button
      type="button"
      aria-label={themeToggleLabel(preference)}
      className={cx(ICON_BUTTON, className)}
      onClick={handleClick}
    >
      <ThemeIcon />
    </button>
  );
}
