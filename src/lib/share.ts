/**
 * 카드 공유 동작 (PRD FR-34, DESIGN.md §9.3 카드 메뉴 · §9.2 Toast, plan M1-35)
 *
 * 모바일(터치 기기)에 Web Share API가 있으면 시스템 공유 시트, 아니면 클립보드에 링크를 복사한다. 결과만 돌려주고 화면 알림(토스트)은
 * 부르는 쪽(피드 섬)이 정한다 — 이 모듈은 DOM·React를 모르는 순수 분기라 단위 테스트가 브라우저 기능을 바꿔 끼워 본다.
 *
 * | 조건 | 결과 |
 * |------|------|
 * | 터치 기기 + `navigator.share` 성공 | `shared` — 시스템 시트가 곧 피드백(토스트 없음) |
 * | 터치 기기 + 사용자가 시트를 닫음(`AbortError`) | `cancelled` — 조용히 끝낸다 |
 * | 터치 기기 + 그 밖의 거부(`NotAllowedError` 등) · 데스크톱 · `share` 없음 | 클립보드 복사로 |
 * | `navigator.clipboard.writeText` 성공 | `copied` — "링크를 복사했어요" |
 * | 클립보드가 없거나(비보안 출처·옛 브라우저) 거부(권한·포커스) | `failed` — 부르는 쪽이 대체 안내(링크 열기)를 띄운다 |
 *
 * - 데스크톱 Safari·Windows Chrome처럼 `share`가 있는 데스크톱도 복사로 간다(DESIGN §9.3 "데스크톱 링크 복사") — 판정은
 *   `(pointer: coarse)`(혼합안 스크립트와 같다).
 * - 클립보드 쓰기는 클릭 처리 안에서 동기로 시작한다(Safari는 사용자 동작 밖의 쓰기를 거부한다) — `shareLink`는 터치 기기 분기가 아니면
 *   첫 `await` 전에 `writeText`를 부른다.
 * - 공유 데이터는 URL 하나(혼합안 그대로). 카드 원제목·요약을 덧붙이지 않는다(D23).
 * - 의존성 없음(섬 번들).
 */

export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

/** 공유에 쓰는 브라우저 기능 — 테스트가 바꿔 끼운다 */
export interface ShareEnv {
  /** 터치 기기인가 — `(pointer: coarse)` */
  coarse: boolean;
  /** `navigator.share`(없으면 undefined) */
  share?: (data: ShareData) => Promise<void>;
  /** `navigator.clipboard.writeText`(없으면 undefined) */
  writeText?: (text: string) => Promise<void>;
}

/** 사용자가 공유 시트를 닫았나(`AbortError`) — 오류가 아니라 취소다 */
function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** 링크를 공유하거나 복사한다. 던지지 않는다(실패는 `failed`) */
export async function shareLink(
  url: string,
  env: ShareEnv,
): Promise<ShareOutcome> {
  if (env.coarse && env.share) {
    try {
      await env.share({ url });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
      // 사용자 동작이 만료됐거나 시트를 못 여는 경우 — 복사로 넘어간다
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(url);
      return "copied";
    } catch {
      // 권한 거부·문서 포커스 없음 — 대체 안내로
    }
  }
  return "failed";
}

/** 지금 브라우저의 공유 기능. 기능이 없으면 그 칸을 비운다(메서드는 `navigator`에 묶어 부른다) */
export function browserShareEnv(win: Window): ShareEnv {
  const nav = win.navigator;
  const clipboard = nav.clipboard as Clipboard | undefined;
  return {
    coarse:
      typeof win.matchMedia === "function" &&
      win.matchMedia("(pointer: coarse)").matches,
    share:
      typeof nav.share === "function" ? (data) => nav.share(data) : undefined,
    writeText:
      clipboard && typeof clipboard.writeText === "function"
        ? (text) => clipboard.writeText(text)
        : undefined,
  };
}

/**
 * 공유 URL(절대 — SITE_URL 기준)을 지금 출처에서 여는 경로로 — 복사가 막혔을 때 "링크 열기"가 그 카드의 날짜 페이지로 간다
 * (주소창에 공유 링크가 뜬다. 운영에서는 출처가 같아 공유 URL 그대로, 로컬 미리보기에서는 같은 경로의 로컬 페이지).
 * 읽을 수 없는 값이면 null.
 */
export function sharePathOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash}`;
  } catch {
    return null;
  }
}
