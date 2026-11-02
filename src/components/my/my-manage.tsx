"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  FollowButton,
  followLimitReason,
} from "@/components/follow/follow-button";
import { KoreanArmband } from "@/components/news/korean-armband";
import { TeamBadge } from "@/components/team/team-badge";
import { cx } from "@/lib/cx";
import {
  FOLLOW_KINDS,
  FOLLOW_LIMITS,
  isFollowAtLimit,
  type FollowKind,
} from "@/lib/follow";
import { followKey, teamBadgeOf, type MyDirectory } from "@/lib/my-view";
import { routes } from "@/lib/paths";
import { useFollows } from "@/lib/use-follows";

import { MyExportTools, MyTeamIcs } from "./my-tools";
import { directoryWhenReady } from "./use-my-data";

/**
 * `/my` 관리 열 — 내 명단 (DESIGN §9.3 D2 "`/my` 틀" · "팔로우 버튼" 아이콘형, 혼합안 화면 4 `.mgc`, PRD §15 D67 ②, plan M4-08)
 *
 * 클라이언트 섬. 1024 이상은 앱 셸 왼쪽 목차 열(`where="contents"`), 1023 이하는 지면 끝(`where="flow"`)에 같은 것을 한 번씩 그린다(`display`로 고른다 —
 * 홈 위젯과 같은 방식). id는 `where`로 나눈다.
 * - **머리 수**: 종류별 "팀 n / 5" · "선수 n / 5"(한도가 종류별 — D67 ②, 혼합안의 합계 "5 / 5"를 둘로 나눴다 — DECISIONS D2 §9).
 * - **목록**: 팀 → 선수, 팔로우한 순. 이름은 팀 화면 · 선수 상세 링크, 오른쪽 = 아이콘형 팔로우 버튼(켜짐). 이번 방문에 푼 항목은 꺼진 버튼으로
 *   자리에 남겨 다시 켤 수 있다(새로고침하면 빠진다). 디렉터리에 없는 slug(빌드에서 빠진 팀)는 slug 글자 + "자료 없음" — 풀 수 있다.
 * - **한도 띠**: 그 종류가 5개면 `--paper-2` + 왼쪽 4px `--brand-accent` + 이유 문장(종류별). 그 종류의 꺼진 버튼이 이 문장을 가리킨다(`aria-describedby`).
 * - **내보내기**(M4-10 — FR-114) · **내 팀 일정 구독**(M4-12 — FR-115): `my-tools.tsx`. 가져오기 확인 띠는 쪽 머리 아래(`my-import.tsx`).
 */
export function MyManage({
  where,
  head,
}: {
  where: "contents" | "flow";
  /** 머리(서버 컴포넌트 — 섹션 머리 "내 명단" + MY REGISTER) */
  head: ReactNode;
}) {
  const { follows, ready } = useFollows();
  const dir = directoryWhenReady(ready);
  // 이번 방문에 본 항목(팔로우한 순) — 푼 것도 자리에 남긴다. 새 팔로우가 보이면 렌더 중에 더한다(이전 값에서 파생 — 효과 없이)
  const [seen, setSeen] = useState<readonly string[]>([]);
  const current = ready
    ? FOLLOW_KINDS.flatMap((kind) =>
        follows[kind].map((slug) => followKey(kind, slug)),
      )
    : [];
  const added = current.filter((k) => !seen.includes(k));
  if (added.length > 0) setSeen([...seen, ...added]);
  const listed = added.length > 0 ? [...seen, ...added] : seen;

  const rows = (kind: FollowKind) =>
    listed
      .filter((k) => k.startsWith(followKey(kind, "")))
      .map((k) => k.slice(followKey(kind, "").length));
  const reasonId = (kind: FollowKind) => `my-limit-${kind}-${where}`;

  return (
    <div data-slot="my-manage" data-where={where}>
      {head}
      <dl className="mt-3 flex gap-x-7">
        {FOLLOW_KINDS.map((kind) => (
          <div key={kind} className="grid gap-1">
            <dt className="text-xs font-extrabold text-ink-2">
              {kind === "teams" ? "팀" : "선수"}
            </dt>
            <dd className="font-numeric text-[34px] leading-[0.9] font-extrabold tracking-[-0.01em] tabular-nums">
              <span className={cx(!ready && "invisible")}>
                {follows[kind].length}
              </span>
              <small className="text-lg font-semibold tracking-normal text-ink-2">
                {" "}
                / {FOLLOW_LIMITS[kind]}
              </small>
            </dd>
          </div>
        ))}
      </dl>
      {ready && listed.length === 0 ? (
        <p className="mt-3 border-t border-ink pt-3 text-[13px] leading-normal text-ink-2">
          팔로우한 팀·선수가 여기 모여요. 여기서 풀 수도 있어요.
        </p>
      ) : (
        <ul
          aria-label="팔로우 목록"
          className="mt-3 border-t border-ink"
          data-slot="my-manage-list"
        >
          {FOLLOW_KINDS.flatMap((kind) =>
            rows(kind).map((slug) => (
              <ManageRow
                key={followKey(kind, slug)}
                kind={kind}
                slug={slug}
                dir={dir}
                reasonId={reasonId(kind)}
              />
            )),
          )}
        </ul>
      )}
      {FOLLOW_KINDS.map((kind) => {
        const reason = followLimitReason(kind);
        return (
          <p
            key={kind}
            id={reasonId(kind)}
            hidden={!(ready && isFollowAtLimit(follows, kind))}
            data-slot="my-limit"
            className="mt-2.5 bg-paper-2 px-3 py-2.5 text-[13px] leading-[1.45] shadow-[inset_4px_0_0_var(--brand-accent)]"
          >
            {reason.lead}
            <b className="font-numeric text-[17px] leading-none font-extrabold tabular-nums">
              {reason.limit}
            </b>
            개{reason.tail}
          </p>
        );
      })}
      {/* 내보내기(혼합안 `.tools` — FR-114, M4-10) · 내 팀 일정 구독(FR-115, M4-12) */}
      <MyExportTools follows={follows} ready={ready} where={where} />
      <MyTeamIcs follows={follows} ready={ready} dir={dir} where={where} />
    </div>
  );
}

function ManageRow({
  kind,
  slug,
  dir,
  reasonId,
}: {
  kind: FollowKind;
  slug: string;
  dir: MyDirectory;
  reasonId: string;
}) {
  const own = Object.prototype.hasOwnProperty.call(dir[kind], slug);
  const team = kind === "teams" && own ? dir.teams[slug] : undefined;
  const player = kind === "players" && own ? dir.players[slug] : undefined;
  const name = team?.n ?? player?.n ?? slug;
  const href = !own
    ? null
    : kind === "teams"
      ? routes.team(slug)
      : routes.koreanPlayer(slug);
  return (
    <li className="grid min-h-14.5 grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-b border-rule">
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
        <span className="row-span-2">
          {team ? (
            <TeamBadge team={teamBadgeOf(team)} size="s" />
          ) : player ? (
            <KoreanArmband title="한국 선수" />
          ) : (
            <span aria-hidden="true" className="kit kit-s kit-none" />
          )}
        </span>
        {href ? (
          <Link
            href={href}
            lang={team?.l ? "en" : undefined}
            className="relative min-w-0 text-[14.5px] leading-[1.25] font-extrabold text-ink no-underline decoration-brand-accent decoration-2 underline-offset-3 after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="text-[14.5px] leading-[1.25] font-extrabold">
            {name}
          </span>
        )}
        <small
          lang={player?.tl ? "en" : undefined}
          className="col-start-2 text-xs leading-[1.3] text-ink-2"
        >
          {team?.u ?? player?.t ?? "자료 없음"}
        </small>
      </span>
      <FollowButton
        kind={kind}
        slug={slug}
        name={name}
        variant="icon"
        reasonId={reasonId}
      />
    </li>
  );
}
