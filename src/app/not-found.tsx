import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { routes } from "@/lib/paths";

/*
 * 404 — 정적 export 시 out/404.html로 생성된다. M1-30부터 앱 셸(마스트헤드·내비·뒤표지) 안에 싣는다(현재 탭 없음).
 * 본문 디자인(커스텀 404)은 M1-36 — 지금은 섹션 머리 + 안내 + 홈 링크만.
 */

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
};

export default function NotFound() {
  const { issue } = loadLatestIssue();

  return (
    <AppShell issue={issue}>
      <SectionHead heading="페이지를 찾을 수 없습니다" headingAs="h1" />
      <p className="mt-3 text-[15px] text-ink-2">
        주소가 바뀌었거나 삭제된 페이지입니다.
      </p>
      <p className="mt-2">
        <Link
          href={routes.home()}
          className={buttonVariants({ variant: "link" })}
        >
          홈으로 돌아가기
        </Link>
      </p>
    </AppShell>
  );
}
