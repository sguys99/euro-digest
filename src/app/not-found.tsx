import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { routes } from "@/lib/paths";

/*
 * 커스텀 404 (PRD §4 IA `/404`, plan M1-36) — 정적 export 시 out/404.html로 생성된다. GitHub Pages는 basePath 아래의
 * 없는 경로에 이 파일을 404 상태로 준다 — 깊은 경로에서 열려도 깨지지 않게 링크·자산은 모두 basePath를 붙인 절대 경로다
 * (`next/link`·Next 자산, e2e `tests/e2e/about.spec.ts`·`npm run verify:deploy`가 확인).
 *
 * 지면은 D0 언어만 쓴다(새 모티프 없음): 섹션 머리(h1) + 러닝 헤드, 빈 상태의 윤곽 숫자(DESIGN §9.3 상태 화면 — 필터 0건의 '0'과 같은
 * Barlow 800 · 속 빈 2px `--ink-2` 윤곽)를 숫자가 주인공이 되도록 크게 키운 "404", 안내 두 줄과 텍스트 링크. 안내는 UI 안내만이고
 * 사실(경기·선수·숫자)을 쓰지 않는다. "404"는 장식이라 `aria-hidden` — 제목(h1)이 같은 뜻을 전한다.
 */

// 메타(M1-38): 제목만 — canonical·og:url 없음(레이아웃 OG 기본값을 물려받는다), 색인 제외(noindex)는 Next가 404에 넣는다
// (`<meta name="robots" content="noindex"/>` — 직접 주면 같은 태그가 두 번 나온다, e2e tests/e2e/seo.spec.ts가 확인).
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
};

const HEADING_ID = "not-found-h";

export default function NotFound() {
  const { issue } = loadLatestIssue();

  return (
    <AppShell issue={issue}>
      <section aria-labelledby={HEADING_ID}>
        <SectionHead
          heading="페이지를 찾을 수 없습니다"
          headingAs="h1"
          headingId={HEADING_ID}
          runningHead="NOT FOUND"
        />
        <div className="mt-6 grid gap-y-5 border-b border-rule pb-7 lg:mt-9 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12 lg:pb-9">
          <p
            aria-hidden="true"
            className="font-numeric text-[112px] leading-[0.8] font-extrabold tracking-[0.01em] text-transparent lining-nums tabular-nums [-webkit-text-stroke:2px_var(--ink-2)] lg:text-[176px] lg:[-webkit-text-stroke-width:2.5px]"
          >
            404
          </p>
          <div className="min-w-0 lg:pb-1">
            <p className="text-type-brief font-extrabold">
              요청한 주소에 페이지가 없습니다.
            </p>
            <p className="mt-1.5 max-w-[46ch] text-sm leading-[1.55] text-ink-2">
              주소를 다시 확인하거나, 오늘 호로 돌아가 주세요.
            </p>
            <ul role="list" className="mt-2 flex flex-wrap gap-x-5">
              <li>
                <Link
                  href={routes.home()}
                  className={buttonVariants({ variant: "link" })}
                >
                  홈으로 돌아가기
                </Link>
              </li>
              <li>
                <Link
                  href={routes.news()}
                  className={buttonVariants({ variant: "link" })}
                >
                  뉴스 보기
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
