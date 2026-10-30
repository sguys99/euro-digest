import Link from "next/link";
import type { ReactNode } from "react";

import type { TeamView } from "@/lib/competition-view";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";

/**
 * 팀 이름 링크 — 순위표 팀 칸·라운드 경기 줄·팀 화면 리그 맥락이 팀 화면(`/teams/{slug}/`, M2-13)으로 가는 링크 (DESIGN §9.3, plan M2-10 이월)
 *
 * 서버 컴포넌트. 팀 페이지가 있는 팀(`TeamView.page` — `data/teams/{slug}.json`이 있다)만 `next/link`로 그리고, 없으면 같은 자리에 글자만
 * 둔다(없는 페이지로 가는 링크를 만들지 않는다 — plan §2.3). 모양은 globals.css §11 `team-link`(누름 영역 위아래 44px · hover 밑줄).
 * `children`을 주면(배지 + 이름) 그것을 링크 안에 넣고, 주지 않으면 팀 이름만(원어면 `lang="en"`).
 */
export function TeamLink({
  team,
  className,
  children,
  ...data
}: {
  team: Pick<TeamView, "slug" | "name" | "latin" | "page">;
  className?: string;
  children?: ReactNode;
} & { [key: `data-${string}`]: string }) {
  const content = children ?? <TeamName team={team} />;
  if (!team.page) {
    return (
      <span className={className} {...data}>
        {content}
      </span>
    );
  }
  return (
    <Link
      href={routes.team(team.slug)}
      className={cx("team-link", className)}
      {...data}
    >
      {content}
    </Link>
  );
}

/** 팀 이름 — 사전에 없어 원어(라틴)면 `lang="en"` */
export function TeamName({ team }: { team: Pick<TeamView, "name" | "latin"> }) {
  return <span lang={team.latin ? "en" : undefined}>{team.name}</span>;
}
