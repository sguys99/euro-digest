"use client";

import { useRef } from "react";

import { toast } from "@/components/ui/toast";
import { BookmarkIcon, CheckIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import {
  FOLLOW_LIMITS,
  followButtonState,
  type FollowButtonState,
  type FollowKind,
} from "@/lib/follow";
import { useFollows } from "@/lib/use-follows";

/**
 * 팔로우 버튼 — 미니 스텁 3상태 (PRD FR-59 · FR-110, DESIGN §9.3 D2 "팔로우 버튼", DECISIONS D2 §6 #9 · #10 · §9 #12~, plan M4-08)
 *
 * 클라이언트 섬(같은 대상의 버튼이 여러 개여도 `useFollows` 저장소 하나라 함께 바뀐다 — 다른 탭은 `storage` 이벤트로 따라온다).
 * - **꺼짐** = 1px `--ink` 테두리 + 책갈피 + "팔로우"(hover `--paper-2`) · **켜짐** = `--ink` 면 + `--paper` 글자 + ✓ + "팔로우 중" ·
 *   **한도**(그 종류가 5개 — D67 ②) = 1px dashed `--ink-disabled` + `--ink-2` 글자 + "팔로우 5/5", `aria-disabled` + 이유 문장(`aria-describedby` —
 *   `FollowLimitNote`가 그린다, 페이지마다 id 하나). 누르면 미니 스텁 접힘(`animate-fold` — 모션 줄이기면 없음).
 * - **아이콘형**(`/my` 관리 열) = 44×44 스텁만. 접근 이름은 대상 + "팔로우"(`aria-label` — 상태는 `aria-pressed`).
 * - 글자형 접근 이름 = 보이는 글자 + 화면 밖 " — {대상}"(혼합안 그대로 — 보이는 글자가 이름 안에 있게, WCAG 2.5.3).
 * - **하이드레이션 전**(서버 HTML · 첫 렌더): 저장값을 모르므로 자리만 두고 숨긴다(`invisible` — 잘못된 상태가 한 번 보였다 바뀌지 않게).
 *   세 글자는 같은 칸에 겹쳐 두고 지금 것만 보이게 해서 폭이 상태와 관계없이 같다(켜고 끌 때 · 하이드레이션 때 옆 글자가 밀리지 않는다).
 * - 저장에 실패하면(차단된 저장소 — `saved:false`) 이번 방문 동안만 유지된다는 토스트를 한 번 띄운다(DECISIONS D2 §9).
 */

/** 같은 페이지에서 저장 실패 안내는 한 번만 */
let unsavedNoticeShown = false;

/** 저장 실패 안내(토스트) — 페이지(문서)마다 한 번 */
export function noticeUnsaved(): void {
  if (unsavedNoticeShown) return;
  unsavedNoticeShown = true;
  toast({
    message:
      "이 브라우저는 저장을 막아 두어, 팔로우는 이번 방문 동안만 유지돼요",
  });
}

/** 테스트용 — 안내 한 번 규칙을 처음 상태로 */
export function resetUnsavedNotice(): void {
  unsavedNoticeShown = false;
}

/** 종류 + 조사(받침 — 팀은 · 선수는) */
const KIND_TOPIC: Readonly<Record<FollowKind, string>> = {
  teams: "팀은 ",
  players: "선수는 ",
};

/** 한도 이유 문장(종류별 — D67 ②, DECISIONS D2 §9) */
export function followLimitReason(kind: FollowKind): {
  lead: string;
  limit: number;
  tail: string;
} {
  return {
    lead: KIND_TOPIC[kind],
    limit: FOLLOW_LIMITS[kind],
    tail: "까지 팔로우할 수 있어요 — 마이에서 하나를 풀면 더할 수 있어요",
  };
}

const LABEL: Readonly<Record<FollowButtonState, (kind: FollowKind) => string>> =
  {
    off: () => "팔로우",
    on: () => "팔로우 중",
    limit: (kind) => `팔로우 ${FOLLOW_LIMITS[kind]}/${FOLLOW_LIMITS[kind]}`,
  };

const STATES: readonly FollowButtonState[] = ["off", "on", "limit"];

export interface FollowButtonProps {
  kind: FollowKind;
  slug: string;
  /** 대상 이름(접근 이름) */
  name: string;
  /** 글자형(기본) · 아이콘형(`/my` 관리 열) */
  variant?: "full" | "icon";
  /** 한도 이유 문장 id(`FollowLimitNote`와 같은 값) — 한도일 때만 `aria-describedby` */
  reasonId?: string;
  className?: string;
}

export function FollowButton({
  kind,
  slug,
  name,
  variant = "full",
  reasonId,
  className,
}: FollowButtonProps) {
  const { follows, ready, toggle } = useFollows();
  const stubRef = useRef<HTMLSpanElement>(null);
  const state: FollowButtonState = ready
    ? followButtonState(follows, kind, slug)
    : "off";
  const icon = variant === "icon";

  const onClick = () => {
    if (state === "limit") return;
    const result = toggle(kind, slug);
    if (result.changed && !result.saved) noticeUnsaved();
    const stub = stubRef.current;
    if (
      result.changed &&
      stub &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // 접힘을 다시 건다 — 속성을 지웠다가 한 번의 리플로 뒤 다시 단다
      stub.removeAttribute("data-fold");
      void stub.offsetWidth;
      stub.setAttribute("data-fold", "");
    }
  };

  return (
    <button
      type="button"
      data-slot="follow-button"
      data-follow={`${kind}:${slug}`}
      data-state={ready ? state : undefined}
      aria-pressed={state === "on"}
      aria-disabled={state === "limit" ? true : undefined}
      aria-describedby={state === "limit" ? reasonId : undefined}
      aria-label={icon ? `${name} 팔로우` : undefined}
      onClick={onClick}
      className={cx(
        "group/fol relative inline-flex min-h-11 flex-none items-stretch border border-ink bg-transparent p-0 text-left text-sm font-extrabold text-ink transition-colors duration-fast ease-print",
        "hover:bg-paper-2 aria-pressed:bg-ink aria-pressed:text-paper aria-pressed:hover:bg-ink",
        "aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-ink-disabled aria-disabled:text-ink-2 aria-disabled:hover:bg-transparent",
        icon && "w-11 justify-center",
        !ready && "invisible",
        className,
      )}
    >
      <span
        ref={stubRef}
        aria-hidden="true"
        onAnimationEnd={(e) => e.currentTarget.removeAttribute("data-fold")}
        className={cx(
          "grid origin-right place-items-center data-fold:animate-fold",
          icon
            ? "w-10.5"
            : "w-8.5 border-r-2 border-dotted border-current group-aria-disabled/fol:border-ink-disabled",
        )}
      >
        {state === "on" ? <CheckIcon size={16} /> : <BookmarkIcon size={16} />}
      </span>
      {icon ? (
        <span className="sr-only">{LABEL[state](kind)}</span>
      ) : (
        <span className="grid items-center pr-3.5 pl-3 whitespace-nowrap">
          {STATES.map((s) => (
            <span
              key={s}
              aria-hidden={s !== state || undefined}
              className={cx(
                "col-start-1 row-start-1",
                s !== state && "invisible",
              )}
            >
              {LABEL[s](kind)}
            </span>
          ))}
          <span className="sr-only"> — {name}</span>
        </span>
      )}
    </button>
  );
}

/**
 * 한도 이유 문장 — 그 종류가 한도이고 이 대상을 팔로우하지 않았을 때만 보인다(12.5px `--ink-2`, 한도 숫자 800 `--ink`).
 * 버튼과 같은 `id`를 쓴다(`aria-describedby`). 보이지 않을 때도 요소는 두어(`hidden`) 버튼이 가리키는 id가 늘 있다.
 */
export function FollowLimitNote({
  kind,
  slug,
  id,
  className,
}: {
  kind: FollowKind;
  slug: string;
  id: string;
  className?: string;
}) {
  const { follows, ready } = useFollows();
  const show = ready && followButtonState(follows, kind, slug) === "limit";
  const reason = followLimitReason(kind);
  return (
    <p
      id={id}
      hidden={!show}
      data-slot="follow-limit-note"
      className={cx("text-[12.5px] leading-normal text-ink-2", className)}
    >
      {reason.lead}
      <b className="font-extrabold text-ink">{reason.limit}개</b>
      {reason.tail}
    </p>
  );
}
