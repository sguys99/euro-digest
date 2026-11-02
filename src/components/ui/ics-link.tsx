import { CalendarAddIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { icsPath, type CalendarFeed } from "@/lib/paths";

/**
 * .ics 링크 — 공용 (PRD FR-59 · FR-83 · FR-115 · FR-123, DESIGN §9.3 "구독 단" · "다음 경기 입장권" · §11.28, plan M4-12)
 *
 * 서버 · 클라이언트 어디서나 그릴 수 있다(`cx`만 — tailwind-merge · fs · 훅 없음, DESIGN §9.4): 팀 티켓 · 선수 상세 입장권 · 오늘 밤 ·
 * 대표팀 일정(서버)과 `/my`(M4-08 섬 — 팀 묶음 · 다음 경기)가 같은 링크를 쓴다. 빌드 산출물이라 `next/link`가 아니라 일반 `<a>` +
 * basePath 붙은 `icsPath`(src/lib/paths.ts). 링크를 걸지 말지는 부르는 쪽이 src/lib/ics-links.ts 규칙으로 정한다(파일이 늘 있는 경우만).
 *
 * 변형(새 토큰 0)
 * - `button` — §9.2 보조 버튼 작은 꼴(시안 A `.btn--sec.btn--s`): 1px `--ink` 테두리 · 13px 800 · 좌우 12px · 아이콘 16px, 최소 44px,
 *   hover 반전. 팀 티켓 '다음 경기' 칸(D2 #11 '같은 버튼 하나').
 * - `link` — 텍스트 링크(D2 혼합안 `.tlink.icsl`): 레드 13px 800 밑줄 · 아이콘 18px, 최소 44 × 44. 입장권 "캘린더에 추가 .ics".
 * - `compact` — 같은 텍스트 링크의 짧은 꼴: 아이콘 14px + ".ics", 최소 44 × 44. 좁은 거터 · 오른쪽 칸(오늘 밤 · 대표팀 일정 행).
 *
 * 접근 이름 = 화면 밖 `context` + 보이는 `label`(보이는 글자가 이름 안에 그대로 — WCAG 2.5.3). 예) "아틀레티코 마드리드 경기 .ics 일정 구독",
 * "바이에른 뮌헨 대 도르트문트 경기 캘린더에 추가 .ics". `download` 속성은 두지 않는다 — iOS · macOS는 .ics 링크를 열면 캘린더 추가 창을 띄운다.
 */
export type IcsLinkVariant = "button" | "link" | "compact";

const TEXT_LINK =
  "relative inline-flex min-h-11 min-w-11 items-center text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

const VARIANT: Readonly<Record<IcsLinkVariant, string>> = {
  button:
    "relative inline-flex min-h-11 items-center justify-center gap-1.5 border border-ink bg-transparent px-3 text-[13px] font-extrabold text-ink no-underline select-none transition-[background-color,color,transform] duration-fast ease-print hover:bg-ink hover:text-paper active:translate-y-px",
  link: `${TEXT_LINK} gap-1.5`,
  compact: `${TEXT_LINK} justify-center gap-1`,
};

const ICON_SIZE: Readonly<Record<IcsLinkVariant, number>> = {
  button: 16,
  link: 18,
  compact: 14,
};

export function IcsLink({
  feed,
  label,
  context,
  variant = "link",
  labelLang,
  className,
}: {
  feed: CalendarFeed;
  /** 보이는 글자 — ".ics 일정 구독" · "캘린더에 추가 .ics" · ".ics" */
  label: string;
  /** 화면 밖 앞말(대상) — "{팀} 경기" · "{홈} 대 {원정} 경기" · "{홈} 대 {원정} 경기 캘린더에 추가" */
  context: string;
  variant?: IcsLinkVariant;
  /** 보이는 글자의 언어 — 라틴 팀 이름을 그대로 쓸 때 `"en"`(`/my` 팀 일정 목록 — M4-12) */
  labelLang?: string;
  /** 여백 · 배치만 */
  className?: string;
}) {
  return (
    <a
      href={icsPath(feed)}
      type="text/calendar"
      data-slot="ics-link"
      data-ics={feed.kind}
      className={cx(VARIANT[variant], className)}
    >
      <CalendarAddIcon size={ICON_SIZE[variant]} />
      <span>
        <span className="sr-only">{context} </span>
        {labelLang ? <span lang={labelLang}>{label}</span> : label}
      </span>
    </a>
  );
}
