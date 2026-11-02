"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import { FOLLOW_KINDS } from "@/lib/follow";
import { followSummary } from "@/lib/my-view";
import { followStore, useFollows } from "@/lib/use-follows";

import { directoryWhenReady } from "./use-my-data";

const noopSubscribe = () => () => {};

/**
 * `/my` 쪽 머리 — 키커("팔로우 n · 이 기기에만 저장" + MY REGISTER) · h1(서버) · 부제(팔로우한 이름) (DESIGN §9.3 D2 "`/my` 틀", 혼합안 `.pg-k`·`.pg-s`, plan M4-08)
 *
 * 클라이언트 섬. 하이드레이션 전에는 숫자 · 부제 자리만 둔다(높이 고정 — 부제는 한 줄, 넘치면 말줄임: 이름 전부는 관리 열에 있다).
 * 저장소에 쓸 수 없으면(차단) "이번 방문 동안만 유지"로 바꿔 알린다(DECISIONS D2 §9 — `saved:false` 안내).
 */
export function MyHead({
  runningHead,
  heading,
}: {
  /** 러닝 헤드(서버 컴포넌트 — MY REGISTER) */
  runningHead: ReactNode;
  /** h1(서버 컴포넌트) */
  heading: ReactNode;
}) {
  const { follows, ready } = useFollows();
  const persistent = useSyncExternalStore(
    noopSubscribe,
    () => followStore.persistent(),
    () => true,
  );
  const total = follows.teams.length + follows.players.length;
  const dir = directoryWhenReady(ready);
  const names = followSummary(dir, follows);
  const parts = FOLLOW_KINDS.flatMap((kind) => {
    const list = names[kind];
    return list.length > 0
      ? [`${kind === "teams" ? "팀" : "선수"} ${list.join(" · ")}`]
      : [];
  });
  const summary = parts.join(" · ");
  return (
    <header className="grid gap-1.5 pt-1.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
        <span data-slot="my-kicker">
          팔로우{" "}
          <span
            className={cx(
              "font-numeric text-sm font-semibold text-ink tabular-nums",
              !ready && "invisible",
            )}
          >
            {total}
          </span>{" "}
          ·{" "}
          {persistent
            ? "이 기기에만 저장"
            : "저장소를 쓸 수 없어 이번 방문 동안만 유지"}
        </span>
        {runningHead}
      </p>
      {heading}
      <p
        data-slot="my-summary"
        title={summary || undefined}
        className="min-h-[1.5em] truncate text-[13px] leading-normal text-ink-2"
      >
        {ready ? summary : null}
      </p>
    </header>
  );
}
