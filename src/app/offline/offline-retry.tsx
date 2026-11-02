"use client";

import { useSyncExternalStore } from "react";

import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { swSafeReturnPath } from "@/lib/sw/policy";

/**
 * 오프라인 화면 '다시 시도' 섬 (FR-121, M4-13) — 서비스 워커가 `/offline/?from=<열려던 경로>`로 보낸다(src/lib/sw/runtime.ts).
 * `from`이 이 사이트(basePath 아래) 경로일 때만 링크를 그린다(다른 출처로 보내는 값은 버림 — `swSafeReturnPath`). 서버 HTML에는 없다.
 * 일반 `<a>`(문서 이동)라 연결이 돌아왔으면 그 페이지를 새로 받고, 아직 끊겼으면 다시 이 화면으로 온다.
 */
const noop = () => () => undefined;

export function OfflineRetry() {
  const from = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("from"),
    () => null,
  );
  const href = swSafeReturnPath(
    from,
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`,
  );
  if (href === null) return null;
  return (
    <a href={href} className={`${BUTTON_BASE} ${BUTTON_VARIANTS.link}`}>
      다시 시도
    </a>
  );
}
