import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { listIssueDates, loadLatestIssue } from "@/lib/data/issue";
import { issueNumber } from "@/lib/issue";
import { routes, withBasePath } from "@/lib/paths";
import { recentIssueDates } from "@/lib/pwa";
import { formatDateDayShort, kstDate, nowUtcIso } from "@/lib/time";

import { OfflineRetry } from "./offline-retry";

/*
 * `/offline/` 오프라인 화면 (PRD FR-121 · DR-07 오프라인, plan M4-13) — 연결이 끊긴 채 서비스 워커가 저장하지 않은 페이지를 열면 워커가
 * 이 주소로 보낸다(`?from=<열려던 경로>` — src/lib/sw/runtime.ts). 워커는 이 페이지를 앱 셸과 함께 미리 받아 둔다.
 *
 * 지면은 404(src/app/not-found.tsx)와 같은 D0 언어만 쓴다(새 모티프·새 토큰 없음): 섹션 머리(h1) + 러닝 헤드, 안내 두 줄(UI 안내만 —
 * 사실을 쓰지 않는다), '다시 시도'(열려던 페이지가 있을 때만 — 섬), 그리고 **저장해 둔 호** 목록 = 워커가 미리 받은 최근 3일 호
 * (src/lib/pwa.ts `recentIssueDates` — 빌드 후 단계 scripts/build-sw.ts와 같은 함수·같은 입력이라 목록과 캐시가 어긋나지 않는다).
 * 목록은 괘선 사이 행(DESIGN §9.3 D2 — 목록은 티켓 문법이 아니다), 날짜는 숫자 서체.
 * 링크는 일반 `<a>`(문서 이동) — 오프라인에서 next/link 클라이언트 이동은 RSC를 받지 못하고 어차피 문서 이동으로 바뀐다.
 *
 * 색인 제외(noindex) · sitemap 제외(src/lib/seo.ts 목록에 없음) · canonical 없음.
 */

export const metadata: Metadata = {
  title: "오프라인",
  robots: { index: false },
};

const HEADING_ID = "offline-h";
const SAVED_ID = "offline-saved-h";

export default function OfflinePage() {
  const { issue } = loadLatestIssue();
  const saved = recentIssueDates(listIssueDates(), kstDate(nowUtcIso()));

  return (
    <AppShell issue={issue}>
      <section aria-labelledby={HEADING_ID}>
        <SectionHead
          heading="연결이 끊겨 열 수 없어요"
          headingAs="h1"
          headingId={HEADING_ID}
          runningHead="OFFLINE"
        />
        <div className="mt-6 border-b border-rule pb-7 lg:mt-9 lg:pb-9">
          <p className="text-type-brief font-extrabold">
            이 페이지는 아직 저장해 두지 않았어요.
          </p>
          <p className="mt-1.5 max-w-[46ch] text-sm leading-[1.55] text-ink-2">
            연결이 돌아오면 다시 열어 주세요. 저장해 둔 최근 호는 연결 없이도 볼
            수 있어요.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5">
            <OfflineRetry />
          </div>
        </div>
      </section>
      {saved.length > 0 ? (
        <section aria-labelledby={SAVED_ID} className="mt-9 lg:mt-11">
          <SectionHead
            heading="저장해 둔 호"
            headingId={SAVED_ID}
            runningHead="SAVED"
          />
          <ul role="list" className="mt-3">
            {saved.map((date) => {
              const no = issueNumber(date);
              // "10.24 (금)" — 숫자는 숫자 서체, 요일은 본문 서체
              const [day, weekday] = formatDateDayShort(date).split(" ");
              return (
                <li key={date} className="border-b border-rule">
                  <a
                    href={withBasePath(routes.newsArchive(date))}
                    className="flex min-h-12 items-baseline gap-4 py-3 text-ink no-underline transition-colors duration-fast ease-print hover:bg-paper-2"
                  >
                    <span className="font-extrabold">
                      <span className="font-numeric text-[22px] leading-none lining-nums tabular-nums">
                        {day}
                      </span>{" "}
                      <span className="text-sm">{weekday}</span>
                    </span>
                    {no !== null ? (
                      <span className="text-sm font-extrabold text-ink-2">
                        제 {no}호
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
