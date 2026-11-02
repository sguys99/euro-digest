/**
 * `/my` 팔로우 내보내기 동작 — **지연 조각**(내보내기 버튼에 포인터 · 포커스가 오면 미리 받고, 누르면 쓴다 — PRD FR-114, plan M4-10)
 *
 * - 링크 복사: 클립보드에 공유 URL → 토스트 "링크를 복사했어요"(FR-34 카드 공유와 같은 문구 · 종류 "공유").
 * - 공유: Web Share(`navigator.share`) 시트 → 성공이면 시트가 곧 피드백(토스트 없음), 닫으면(`AbortError`) 조용히 끝, 그 밖의 거부는 복사로.
 * - 클립보드도 막히면 주소창에 공유 링크를 띄우고(`history.replaceState` — 이 탭의 팔로우는 바뀌지 않는다) "주소창의 링크를 복사해 주세요".
 * 분기는 src/lib/share.ts `shareLink`(카드 공유와 같은 순수 분기)를 그대로 쓴다.
 */
import { toast } from "@/components/ui/toast";
import { followShareUrl, sharePathWithQuery } from "@/lib/follow-share";
import type { FollowLists } from "@/lib/follow";
import { browserShareEnv, shareLink, type ShareOutcome } from "@/lib/share";

export type ExportHow = "copy" | "share";

/** 팔로우를 링크로 내보낸다. 던지지 않는다. 팔로우가 없으면 아무것도 하지 않는다(버튼이 비활성) */
export async function exportFollows(
  state: FollowLists,
  how: ExportHow,
  win: Window = window,
): Promise<ShareOutcome | null> {
  const url = followShareUrl(state);
  if (url === null) return null;
  const env = browserShareEnv(win);
  const outcome = await shareLink(
    url,
    how === "share"
      ? { ...env, coarse: true }
      : { coarse: false, writeText: env.writeText },
  );
  if (outcome === "copied") {
    toast({ kind: "공유", message: "링크를 복사했어요" });
  } else if (outcome === "failed") {
    const path = sharePathWithQuery(url);
    if (path !== null) {
      try {
        win.history.replaceState(null, "", path);
      } catch {
        // 주소를 바꾸지 못해도 안내는 띄운다
      }
    }
    toast({
      kind: "공유",
      message: "복사하지 못했어요 — 주소창에 띄운 링크를 복사해 주세요",
      dismissible: true,
    });
  }
  return outcome;
}
