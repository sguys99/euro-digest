"use client";

import { useSyncExternalStore } from "react";

import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { IcsLink } from "@/components/ui/ics-link";
import { LinkIcon, ShareIcon } from "@/components/ui/icons";
import { isFollowEmpty, type FollowState } from "@/lib/follow";
import { teamIcsFeed } from "@/lib/ics-links";
import type { MyDirectory } from "@/lib/my-view";

/**
 * `/my` 관리 열 도구 — 팔로우 내보내기(FR-114, M4-10) · 내 팀 일정 구독(FR-115, M4-12) (D2 혼합안 `.tools` 자리, DECISIONS D2 §9 #33~#38)
 *
 * - **내보내기**: §9.2 보조 버튼(왼쪽 정렬 · 아이콘 18px) "링크 복사" — Web Share가 있는 브라우저는 "공유"를 하나 더(없으면 복사만, D67 ③).
 *   팔로우 0이면 둘 다 비활성(점선). 설명 줄은 상태와 무관하게 같은 문장(하이드레이션 뒤 글자가 바뀌어 밀리지 않게). 동작 코드(`my-share-actions.ts` — 공유 URL · 클립보드 · 토스트)는
 *   **지연 조각**: 버튼에 포인터 · 포커스가 오면 미리 받고, 누를 때 이미 받았으면 같은 클릭 처리 안에서 바로 쓴다(Safari 클립보드는
 *   사용자 동작 안에서만 — src/lib/share.ts).
 * - 가져오기는 버튼이 아니라 **링크를 여는 것**이다(혼합안 '가져오기' 버튼 자리 → 설명 줄 — 확인 띠는 `my-import.tsx`).
 * - **내 팀 일정 구독**: 팔로우한 팀(디렉터리에 있는 팀 = 팀 페이지 · `/calendar/{team}.ics`가 늘 있는 팀)마다 `IcsLink`. 팀 0이면 숨김.
 *   팔로우 조합마다 다른 묶음 파일은 정적 export로 만들 수 없어 팀별 링크 + 안내 문장.
 */

type ShareActions = typeof import("./my-share-actions");

let actions: ShareActions | null = null;
let loading: Promise<ShareActions> | null = null;

function loadActions(): Promise<ShareActions> {
  loading ??= import("./my-share-actions").then((mod) => (actions = mod));
  return loading;
}

const noopSubscribe = () => () => {};
const canShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const TOOL_BUTTON = `${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} justify-start! disabled:cursor-not-allowed`;

export function MyExportTools({
  follows,
  ready,
  where,
}: {
  follows: FollowState;
  ready: boolean;
  where: "contents" | "flow";
}) {
  const share = useSyncExternalStore(noopSubscribe, canShare, () => false);
  const empty = !ready || isFollowEmpty(follows);
  const noteId = `my-export-note-${where}`;

  const run = (how: "copy" | "share") => {
    if (actions) void actions.exportFollows(follows, how);
    else void loadActions().then((mod) => mod.exportFollows(follows, how));
  };
  const preload = () => void loadActions();

  return (
    <div
      data-slot="my-tools"
      // 하이드레이션 전에는 숨긴다 — 목록이 그 뒤에 그려져 도구가 밀려 내려가지 않게(1024 이상 목차 열 CLS)
      hidden={!ready}
      className="mt-4 grid gap-2"
      onPointerEnter={empty ? undefined : preload}
      onFocus={empty ? undefined : preload}
      onTouchStart={empty ? undefined : preload}
    >
      <button
        type="button"
        className={TOOL_BUTTON}
        disabled={empty}
        aria-describedby={noteId}
        data-slot="my-export-copy"
        onClick={() => run("copy")}
      >
        <LinkIcon size={18} />
        <span>내보내기 — 링크 복사</span>
      </button>
      {share ? (
        <button
          type="button"
          className={TOOL_BUTTON}
          disabled={empty}
          aria-describedby={noteId}
          data-slot="my-export-share"
          onClick={() => run("share")}
        >
          <ShareIcon size={18} />
          <span>내보내기 — 공유</span>
        </button>
      ) : null}
      <p
        id={noteId}
        className="text-xs leading-[1.45] text-pretty [word-break:keep-all] text-ink-2"
      >
        팔로우를 링크 하나로 옮겨요 — 다른 기기에서 열면 합치거나 덮어쓸 수
        있어요.
      </p>
    </div>
  );
}

export function MyTeamIcs({
  follows,
  ready,
  dir,
  where,
}: {
  follows: FollowState;
  ready: boolean;
  dir: MyDirectory;
  where: "contents" | "flow";
}) {
  const teams = ready
    ? follows.teams.filter((slug) =>
        Object.prototype.hasOwnProperty.call(dir.teams, slug),
      )
    : [];
  if (teams.length === 0) return null;
  const headId = `my-ics-${where}-h`;
  return (
    <div data-slot="my-ics" className="mt-6 border-t border-ink pt-3">
      <p id={headId} className="text-sm leading-snug font-extrabold">
        내 팀 일정 구독
      </p>
      <p className="mt-1 text-xs leading-[1.45] text-pretty [word-break:keep-all] text-ink-2">
        캘린더 앱에서 팀마다 구독해요 — 링크 주소를 붙여 넣으면 바뀐 일정도
        따라와요.
      </p>
      <ul aria-labelledby={headId} className="mt-1 grid">
        {teams.map((slug) => {
          const team = dir.teams[slug]!;
          return (
            <li key={slug} className="border-b border-rule last:border-b-0">
              <IcsLink
                feed={teamIcsFeed(slug)}
                label={team.n}
                labelLang={team.l ? "en" : undefined}
                context="경기 일정 .ics —"
                className="w-full"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
