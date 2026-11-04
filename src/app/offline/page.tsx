import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SectionHead } from "@/components/ui/section-head";
import { listIssueDates, loadLatestIssue } from "@/lib/data/issue";
import { issueNumber } from "@/lib/issue";
import { routes, withBasePath } from "@/lib/paths";
import { RECENT_NEWS_DAYS, recentIssueDates } from "@/lib/pwa";
import {
  formatKst,
  kstDate,
  kstDayRangeUtc,
  nowUtcIso,
  shiftDate,
} from "@/lib/time";
import { cn } from "@/lib/utils";

import { OfflineRetry } from "./offline-retry";

/*
 * `/offline/` 오프라인 화면 (PRD FR-121 · DR-07 오프라인, plan M4-13) — 연결이 끊긴 채 서비스 워커가 저장하지 않은 페이지를 열면 워커가
 * 이 주소로 보낸다(`?from=<열려던 경로>` — src/lib/sw/runtime.ts). 워커는 이 페이지를 앱 셸과 함께 미리 받아 둔다.
 *
 * 지면은 404(src/app/not-found.tsx)와 같은 D0 언어만 쓴다(새 모티프·새 토큰 없음): 섹션 머리(h1) + 러닝 헤드, 안내 두 줄(UI 안내만 —
 * 사실을 쓰지 않는다), '다시 시도'(열려던 페이지가 있을 때만 — 섬) — 머리에는 숫자가 없다(못 여는 사실은 문장이 맡는다, D3 #14).
 * **저장해 둔 호**(D3 C 숫자 — DESIGN §9.3 D3 `/offline/`, plan M5-17): 저장한 호 수 `--num-n2`(0이면 윤곽) + "연결 없이 열 수 있는 호" +
 * "최근 3일 {MM.DD – MM.DD}" → 1px `--ink` 아래 호수 거터(`--num-n3` + "호") 목록 = 워커가 미리 받은 최근 3일 호(src/lib/pwa.ts
 * `recentIssueDates` — 빌드 후 단계 scripts/build-sw.ts와 같은 함수·같은 입력이라 목록과 캐시가 어긋나지 않는다). 서버 그리기 · JS 0 ·
 * 첫 로드 모션 0. 목록은 괘선 사이 행(DESIGN §9.3 D2 — 목록은 티켓 문법이 아니다).
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

/** "11.02"(KST 날짜 "YYYY-MM-DD" → 월.일) */
const monthDot = (date: string) => date.slice(5).replace("-", ".");

export default function OfflinePage() {
  const { issue } = loadLatestIssue();
  const saved = recentIssueDates(listIssueDates(), kstDate(nowUtcIso()));
  // "최근 3일" 달력 구간 — 최신 저장 호에서 거꾸로(recentIssueDates와 같은 구간, 결호는 목록에서만 빠진다)
  const latest = saved[0];
  const range =
    latest !== undefined
      ? { from: shiftDate(latest, -(RECENT_NEWS_DAYS - 1)), to: latest }
      : null;

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
          <p className="mt-1.5 max-w-measure-note text-sm leading-[1.55] text-ink-2">
            연결이 돌아오면 다시 열어 주세요. 저장해 둔 최근 호는 연결 없이도 볼
            수 있어요.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5">
            <OfflineRetry />
          </div>
        </div>
      </section>
      <section aria-labelledby={SAVED_ID} className="mt-9 lg:mt-11">
        <SectionHead
          heading="저장해 둔 호"
          headingId={SAVED_ID}
          runningHead="SAVED"
        />
        {/* 저장한 호 수 — 값이 있으면 실선, 0이면 윤곽(D2 숫자 상태 규칙). 숫자는 장식, 뜻은 제목 안 화면 밖 "{n}개" */}
        <p
          data-slot="offline-count"
          className="mt-3.5 grid grid-cols-[var(--gutter)_minmax(0,1fr)] items-end gap-x-3"
        >
          <span
            aria-hidden="true"
            className={cn(
              "font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] lining-nums tabular-nums",
              saved.length > 0
                ? "text-ink"
                : "text-transparent [-webkit-text-stroke:2px_var(--ink-2)]",
            )}
          >
            {saved.length}
          </span>
          <span className="grid gap-0.75 pb-px">
            <b className="text-[15px] font-extrabold">
              연결 없이 열 수 있는 호
              <span className="sr-only"> {saved.length}개</span>
            </b>
            <span className="text-[13px] text-ink-2">
              {range ? (
                <>
                  최근 {RECENT_NEWS_DAYS}일{" "}
                  <span className="font-numeric text-sm leading-none font-semibold text-ink lining-nums tabular-nums">
                    {monthDot(range.from)} – {monthDot(range.to)}
                  </span>{" "}
                  · 결호가 낀 날은 그만큼 적어요
                </>
              ) : (
                `발행된 호가 생기면 최근 ${RECENT_NEWS_DAYS}일 호를 저장해 둬요`
              )}
            </span>
          </span>
        </p>
        {saved.length > 0 ? (
          <ul role="list" className="mt-3 border-t border-ink">
            {saved.map((date) => {
              const no = issueNumber(date);
              return (
                <li key={date}>
                  <a
                    href={withBasePath(routes.newsArchive(date))}
                    className="grid min-h-15 grid-cols-[var(--gutter)_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2 text-ink no-underline transition-colors duration-fast ease-print hover:bg-paper-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-baseline gap-0.5 whitespace-nowrap"
                    >
                      {no !== null ? (
                        <>
                          <span className="font-numeric text-num-n3 leading-[0.86] font-extrabold tracking-[-0.02em] lining-nums tabular-nums">
                            {no}
                          </span>
                          <small className="text-xs font-extrabold text-ink-2">
                            호
                          </small>
                        </>
                      ) : null}
                    </span>
                    <span className="text-[15px] font-extrabold">
                      {formatKst(kstDayRangeUtc(date).start, "date")}
                      {no !== null ? (
                        <span className="sr-only"> 제 {no}호</span>
                      ) : null}
                    </span>
                    <ChevronRightIcon size={18} className="text-ink-2" />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </AppShell>
  );
}
