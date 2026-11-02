import type { ReactNode } from "react";

import { CalendarAddIcon, RssIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { RSS_MIME } from "@/lib/feed-links";
import { icsPath, rssPath } from "@/lib/paths";

/**
 * 뒤표지 '구독' 단 (PRD FR-122 · FR-123, DECISIONS 'M4 미니 게이트' #6, DESIGN §9.3 "구독 단(뒤표지)" · §11.28, plan M4-11 이월 · M4-12)
 *
 * 서버 컴포넌트 — JS 0. 확정 시안 `docs/design/m4/concept-a.html` 뒤표지 FEEDS 그대로:
 * - 머리 "구독" 15px 800 + FEEDS(Barlow 600 12.5px · 0.14em, 장식) — 위 1px `--colophon-fg-2` 괘선 · 위 14px.
 * - 행 3개(`76px · 1fr`, 아래 1px 점선 `--colophon-fg-2`, 마지막 행 없음): ① RSS — 전체 소식 · 한국 선수 ② 대회별 — 약칭 텍스트 링크 6개
 *   (`configs/competitions.json` 순서, 1023 이하 3×2 · 1024 이상 한 줄 — 칸 44~62px: 1280은 시안 피치 62px, 1024~1279는 칸이 줄어
 *   오른쪽 열을 넘치지 않는다) ③ 캘린더 — 한국 선수 소속팀 경기 .ics. 행 머리는 아이콘 16px + 12.5px
 *   800 `--colophon-fg-2`.
 * - 안내 1줄(12.5px `--colophon-fg-2`). 팀 .ics는 팀 화면 티켓 '다음 경기' 칸에 있다.
 * - 링크는 뒤표지 링크와 같은 모양(800 밑줄 1px · 4px 띄움 → hover 2px, 최소 44px). RSS · .ics는 Next 라우트가 아니라 빌드 산출물이라
 *   일반 `<a>` + basePath 붙은 경로(`rssPath` · `icsPath` — src/lib/paths.ts). 링크 이름은 "{대상} RSS"(DESIGN §9.3 — 대회는 약칭 + 화면
 *   밖 " RSS", 정식 이름은 `title`).
 * - **주소 복사 · webcal 없음**(DECISIONS M4 미니 게이트 '구현 중 결정'): 평범한 https 링크 — 누르면 받기/캘린더 앱 가져오기, 구독은 링크
 *   주소를 리더·캘린더 앱에 붙여 넣는다(안내 줄). 복사 버튼은 뒤표지에 섬을 새로 만들고, `webcal://`은 기기마다 처리가 갈린다.
 */

/** 뒤표지 링크 모양(src/components/shell/colophon.tsx `LINK`와 같다) */
const LINK =
  "inline-flex min-h-11 items-center font-extrabold underline decoration-1 underline-offset-4 hover:decoration-2";

export function SubscribeBand({
  headingId = "colophon-subs-h",
  className,
}: {
  headingId?: string;
  className?: string;
}) {
  const comps = loadCompetitionsConfig();
  return (
    <section
      aria-labelledby={headingId}
      data-slot="subscribe"
      className={cx(
        "mt-1.5 grid gap-1.5 border-t border-colophon-fg-2 pt-3.5",
        className,
      )}
    >
      <h2
        id={headingId}
        className="flex items-baseline gap-2.5 text-[15px] font-extrabold tracking-[-0.02em]"
      >
        구독
        <span
          lang="en"
          aria-hidden="true"
          className="font-numeric text-[12.5px] leading-none font-semibold tracking-[0.14em] text-colophon-fg-2"
        >
          FEEDS
        </span>
      </h2>
      <ul role="list">
        <Row icon={<RssIcon size={16} />} label="RSS">
          <span className="flex min-w-0 flex-wrap gap-x-4">
            <a href={rssPath()} type={RSS_MIME} className={LINK}>
              전체 소식<span className="sr-only"> RSS</span>
            </a>
            <a
              href={rssPath({ kind: "korean" })}
              type={RSS_MIME}
              className={LINK}
            >
              한국 선수<span className="sr-only"> RSS</span>
            </a>
          </span>
        </Row>
        <Row icon={<RssIcon size={16} />} label="대회별">
          <span className="grid min-w-0 grid-cols-[repeat(3,max-content)] gap-x-4.5 lg:grid-cols-[repeat(6,minmax(2.75rem,3.875rem))] lg:gap-x-0">
            {comps.map((c) => (
              <a
                key={c.id}
                href={rssPath({ kind: "competition", comp: c.id })}
                type={RSS_MIME}
                title={`${c.nameKo} RSS`}
                data-comp={c.id}
                className={`${LINK} min-w-11`}
              >
                {c.shortKo}
                <span className="sr-only"> RSS</span>
              </a>
            ))}
          </span>
        </Row>
        <Row icon={<CalendarAddIcon size={16} />} label="캘린더">
          <span className="flex min-w-0 flex-wrap gap-x-4">
            <a href={icsPath({ kind: "korean" })} className={LINK}>
              한국 선수 소속팀 경기 .ics
            </a>
          </span>
        </Row>
      </ul>
      <p className="text-[12.5px] leading-normal text-colophon-fg-2">
        RSS 리더나 캘린더 앱에 주소를 붙여 넣어 구독해요. 팀 일정 .ics는 각 팀
        화면 ‘다음 경기’ 칸에 있어요.
      </p>
    </section>
  );
}

/** 구독 행 — 머리(아이콘 + 이름) · 값. 아래 1px 점선(마지막 행 없음) */
function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-3 border-b border-dotted border-colophon-fg-2 last:border-b-0">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-colophon-fg-2">
        {icon}
        {label}
      </span>
      {children}
    </li>
  );
}
