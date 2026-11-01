import { cx } from "@/lib/cx";

/**
 * 티켓 절취선 — 2px dotted `--ink-3` + 양 끝 반원 노치(지름 `--notch` × 2, `--paper` 면 + 1.5px `--ink` 테두리 — 테두리 밖 반쪽은 잘라 낸다).
 * D1 팀 티켓(src/components/team/team-ticket.tsx)과 같은 문법이다. 장식이라 `aria-hidden`. Tailwind가 읽도록 클래스는 완성된 문자열로 둔다.
 * - 기본: 세로(스텁 │ 몸통 사이 열 — 노치 위·아래)
 * - `xlHorizontal`: 1280 이상에서 가로(스텁이 위 — 다음 경기 입장권 세로형, 노치 왼쪽·오른쪽)
 */
export function Perforation({
  xlHorizontal = false,
  className,
}: {
  xlHorizontal?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative border-l-2 border-dotted border-ink-3",
        "before:absolute before:-top-2.75 before:left-1/2 before:size-[calc(var(--notch)*2)] before:-translate-x-1/2 before:bg-[radial-gradient(circle_closest-side,var(--paper)_calc(100%-1.5px),var(--ink)_calc(100%-1.5px),var(--ink)_100%,transparent_100%)] before:content-[''] before:[clip-path:inset(50%_0_0_0)]",
        "after:absolute after:-bottom-2.75 after:left-1/2 after:size-[calc(var(--notch)*2)] after:-translate-x-1/2 after:bg-[radial-gradient(circle_closest-side,var(--paper)_calc(100%-1.5px),var(--ink)_calc(100%-1.5px),var(--ink)_100%,transparent_100%)] after:content-[''] after:[clip-path:inset(0_0_50%_0)]",
        xlHorizontal &&
          "xl:h-0.5 xl:border-t-2 xl:border-l-0 xl:before:top-1/2 xl:before:-left-2.75 xl:before:translate-x-0 xl:before:-translate-y-1/2 xl:before:[clip-path:inset(0_0_0_50%)] xl:after:top-1/2 xl:after:-right-2.75 xl:after:bottom-auto xl:after:left-auto xl:after:translate-x-0 xl:after:-translate-y-1/2 xl:after:[clip-path:inset(0_50%_0_0)]",
        className,
      )}
    />
  );
}

/**
 * 꼬리표 칸(선수 티켓 — DESIGN §9.3 D2): 이름(12.5px 800 + 보조 400 `--ink-2`) + 값(14px 800). 티켓 상자 폭 600px 미만은 세로로 쌓고
 * (칸 사이 1px `--rule`, 최소 48px), 600px 이상은 칸 수만큼 가로(세로 1px `--rule`, 최소 60px — 좌우 14px · 간격 8px로 칸 안 한 줄을
 * 지킨다, 넘치면 값이 이름 아래로 접힌다) — 컨테이너 쿼리(DESIGN §7.1 예외 — M3-10).
 */
export function TailCell({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-b border-rule px-3.5 py-1.5 last:border-b-0 @min-[37.5rem]:min-h-15 @min-[37.5rem]:gap-x-2 @min-[37.5rem]:border-b-0 @min-[37.5rem]:border-l @min-[37.5rem]:py-2 @min-[37.5rem]:first:border-l-0">
      <p className="text-[12.5px] font-extrabold">
        {label}
        {aside ? (
          <span className="ml-1.5 font-normal text-ink-2">{aside}</span>
        ) : null}
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm font-extrabold">
        {children}
      </div>
    </div>
  );
}

/** 꼬리표 값 링크 — 같은 페이지 구역으로(밑줄 1px · hover 2px, 누름 영역 위아래 44px) */
export function TailLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="relative inline-flex min-h-11 items-center text-ink underline decoration-1 underline-offset-4 after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-[max(100%,44px)] after:-translate-1/2 after:content-[''] hover:decoration-2"
    >
      {children}
    </a>
  );
}
