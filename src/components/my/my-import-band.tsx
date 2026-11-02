"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { KoreanArmband } from "@/components/news/korean-armband";
import { TeamBadge } from "@/components/team/team-badge";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { toast } from "@/components/ui/toast";
import {
  FOLLOW_KINDS,
  isFollowing,
  type FollowImportMode,
  type FollowKind,
} from "@/lib/follow";
import {
  followCountLabel,
  importResultMessage,
  importSkipMessage,
  knownFromDirectory,
  planFollowImport,
  stripFollowQuery,
} from "@/lib/follow-share";
import { teamBadgeOf } from "@/lib/my-view";
import { followStore, useFollows } from "@/lib/use-follows";

import { readMyDirectory } from "./use-my-data";

/**
 * `/my` 가져오기 확인 띠 — **지연 조각**(주소에 `?t=…&p=…`가 있을 때만 받는다 — PRD FR-114, §15 D67 ③, plan M4-10)
 *
 * 모달 없이 쪽 머리 바로 아래 D0 안내 띠 안에서 고른다(면 `--paper-2` + 왼쪽 4px `--brand-accent` · 패딩은 자리 `my-import.tsx` `SLOT`, DECISIONS D2 §9):
 * - 키커 "공유 링크 · 팀 n · 선수 m(· ✓ 이미 팔로우)" → 제목(h2) "받은 팔로우를 가져올까요?" → 들어올 항목 미리보기(1023 이하 2열 · 1024 이상 3열 · 1280 이상 4열 칸 — 배지 · 완장 + 이름,
 *   이미 팔로우 중이면 ✓) → 방식 두 줄(합치기 · 덮어쓰기 — 결과 수 · "한도로 n개 빠짐") → 안내 줄(모르는 항목 · 저장 차단)
 *   → 버튼 '합치기'(주 · 기본) · '덮어쓰기'(보조) · '취소'(텍스트).
 * - 덮어써도 지금과 같으면 띠 없이 토스트 "이미 같은 팔로우예요", 들어올 것이 없으면 "가져올 팔로우가 없어요"(+ 모르는 항목 n개).
 * - 반영 · 취소 · 띠 없이 끝남 → 주소에서 `t` · `p`만 지운다(`history.replaceState` — 새로고침해도 다시 묻지 않는다).
 * - 반영 결과는 토스트 "팔로우를 합쳤어요 · 한도 때문에 n개가 빠졌어요 · 모르는 항목 n개"(저장 차단이면 "이번 방문 동안만 유지돼요"를 붙인다).
 */

const noopSubscribe = () => () => {};

const PRIMARY = `${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`;
const SECONDARY = `${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`;
const TEXT = `${BUTTON_BASE} ${BUTTON_VARIANTS.link} min-w-11 justify-center px-2`;

const KIND_LABEL: Readonly<Record<FollowKind, string>> = {
  teams: "팀",
  players: "선수",
};

const MODE_TEXT: Readonly<Record<FollowImportMode, string>> = {
  merge: "지금 팔로우에 더하면",
  replace: "이 링크로 바꾸면",
};

function finish(onDone: () => void, band: HTMLElement | null) {
  try {
    window.history.replaceState(
      null,
      "",
      stripFollowQuery(window.location.href),
    );
  } catch {
    // 주소를 못 바꿔도 띠는 닫는다
  }
  const focused = band?.contains(document.activeElement) ?? false;
  onDone();
  // 띠 안 버튼에 있던 포커스가 <body>로 떨어지지 않게 본문으로(토스트 규칙과 같은 대상)
  if (focused) document.getElementById("main")?.focus({ preventScroll: true });
}

export default function MyImportBand({ onDone }: { onDone: () => void }) {
  const { follows, importFrom } = useFollows();
  const persistent = useSyncExternalStore(
    noopSubscribe,
    () => followStore.persistent(),
    () => true,
  );
  const dir = readMyDirectory();
  const known = useMemo(() => knownFromDirectory(dir), [dir]);
  // 주소는 띠가 열릴 때 한 번 읽는다(반영 뒤 지운다)
  const search = useMemo(() => window.location.search, []);
  const plan = useMemo(
    () => planFollowImport(search, follows, known),
    [search, follows, known],
  );
  const band = useRef<HTMLElement>(null);

  const skip = plan === null || plan.kind !== "confirm" ? plan : null;
  useEffect(() => {
    if (plan !== null && plan.kind === "confirm") return;
    if (skip) toast({ message: importSkipMessage(skip) });
    finish(onDone, band.current);
    // 계획 종류가 바뀔 때만(다른 탭에서 팔로우가 바뀌어 같아질 수 있다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.kind]);

  if (plan === null || plan.kind !== "confirm") return null;

  const apply = (mode: FollowImportMode) => {
    const result = importFrom(plan.incoming, mode, known);
    const dropped = result.dropped.teams.length + result.dropped.players.length;
    let message = importResultMessage(mode, dropped, plan.unknown);
    if (result.changed && !result.saved)
      message += " · 이번 방문 동안만 유지돼요";
    toast({ kind: "알림", message });
    finish(onDone, band.current);
  };

  const headId = "my-import-h";
  const modeId = (mode: FollowImportMode) => `my-import-${mode}`;
  const anyFollowing = FOLLOW_KINDS.some((kind) =>
    plan.incoming[kind].some((slug) => isFollowing(follows, kind, slug)),
  );

  // 줄 높이는 모두 고정이다(키커 16 · 제목 4+24 · 미리보기 칸 24 · 방식 줄 20 · 안내 줄 20 · 버튼 44) — 첫 페인트 전 부트 스크립트가
  // 같은 셈으로 자리를 잡아 둔다(src/lib/my-import-boot.ts · my-import.tsx `SLOT`). 높이를 바꾸면 그 셈도 함께 바꾼다(e2e가 대조).
  return (
    <section ref={band} aria-labelledby={headId} data-slot="my-import">
      <p className="truncate text-xs leading-4 font-extrabold text-ink-2">
        공유 링크 · {followCountLabel(plan.incoming)}
        {anyFollowing ? (
          <>
            {" · "}
            <span aria-hidden="true">✓</span> 이미 팔로우
          </>
        ) : null}
      </p>
      <h2
        id={headId}
        className="mt-1 truncate text-lg leading-6 font-extrabold tracking-[-0.02em]"
      >
        받은 팔로우를 가져올까요?
      </h2>
      <ul
        aria-label="들어올 항목"
        data-slot="my-import-preview"
        className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {FOLLOW_KINDS.flatMap((kind) =>
          plan.incoming[kind].map((slug) => {
            const team = kind === "teams" ? dir.teams[slug] : undefined;
            const player = kind === "players" ? dir.players[slug] : undefined;
            const name = team?.n ?? player?.n ?? slug;
            const already = isFollowing(follows, kind, slug);
            return (
              <li
                key={`${kind}:${slug}`}
                title={name}
                className="flex h-6 min-w-0 items-center gap-1.5 text-sm font-extrabold"
              >
                {team ? (
                  <TeamBadge team={teamBadgeOf(team)} size="s" />
                ) : (
                  <KoreanArmband title="한국 선수" />
                )}
                <span lang={team?.l ? "en" : undefined} className="truncate">
                  {name}
                </span>
                <span className="sr-only">
                  ({KIND_LABEL[kind]}
                  {already ? " · 팔로우 중" : ""})
                </span>
                {already ? (
                  <span aria-hidden="true" className="flex-none text-ink-2">
                    ✓
                  </span>
                ) : null}
              </li>
            );
          }),
        )}
      </ul>
      <dl className="mt-3 grid grid-cols-1 gap-y-0.5 border-t border-rule pt-2.5 text-[13px] leading-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-3 lg:gap-y-1">
        {(["merge", "replace"] as const).map((mode) => {
          const outcome = plan.outcomes[mode];
          return (
            <Fragment key={mode}>
              <dt className="font-extrabold">
                {mode === "merge" ? "합치기" : "덮어쓰기"}
              </dt>
              <dd id={modeId(mode)} className="text-ink-2">
                {MODE_TEXT[mode]}{" "}
                <b className="font-extrabold text-ink">
                  {followCountLabel(outcome.state)}
                </b>
                {outcome.dropped > 0 ? (
                  <>
                    {" · "}
                    <b className="font-extrabold text-brand-accent-text">
                      한도로 {outcome.dropped}개 빠짐
                    </b>
                  </>
                ) : null}
              </dd>
            </Fragment>
          );
        })}
      </dl>
      {plan.unknown > 0 || !persistent ? (
        <ul className="mt-2 grid gap-0.5 text-[13px] leading-5 text-ink-2">
          {plan.unknown > 0 ? (
            <li data-slot="my-import-unknown" className="truncate">
              모르는 항목 {plan.unknown}개는 빼요
            </li>
          ) : null}
          {!persistent ? (
            <li className="truncate">
              저장소가 막혀 이번 방문 동안만 유지돼요
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={PRIMARY}
          aria-describedby={modeId("merge")}
          onClick={() => apply("merge")}
        >
          합치기
        </button>
        <button
          type="button"
          className={SECONDARY}
          aria-describedby={modeId("replace")}
          onClick={() => apply("replace")}
        >
          덮어쓰기
        </button>
        <button
          type="button"
          className={TEXT}
          onClick={() => finish(onDone, band.current)}
        >
          취소
        </button>
      </div>
    </section>
  );
}
