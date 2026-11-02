import { KoreanArmband } from "@/components/news/feed-card";
import { TeamBadge } from "@/components/team/team-badge";
import type { TeamView } from "@/lib/competition-view";
import { cx } from "@/lib/cx";
import { TRANSFER_STAGE, TRANSFER_STAGE_HOLES } from "@/lib/news/labels";
import type { TransferStatus } from "@/lib/schema/common";
import type { TransferPlayerView } from "@/lib/transfers-view";

/**
 * 이적 화면 공용 표식 (DESIGN §9.3 D2 "이적 원장 행" · "이적 필터" · "이적 타임라인", plan M4-04) — 서버 컴포넌트(JS 0). 필터 섬도 이 파일을
 * import하지 않는다(섬은 속성만 바꾼다).
 *
 * - `MiniPunch` — 필터 단계 항목 앞 작은 펀치(구멍 10px · 테두리 1.5px · 간격 3px — 혼합안 `.punch--s`). 원은 SVG(§9.1 rounded 금지).
 * - `RouteArrow` — 출발 → 행선지 화살표(혼합안 아이콘 그대로, 장식).
 * - `NameBlank` — 사전에 없는 선수 이름: 빈 밑줄(128 × 1.5px dashed) + "이름 표기 전 — 원제목 참고"(표기를 지어내지 않는다 — DECISIONS D2 §6 #5).
 * - `TransferName` — 선수 이름(+ 한국 완장) 또는 `NameBlank`.
 * - `TeamName` — 배지 xs/s + 팀 이름(사전에 없으면 원어 `lang="en"`), 어절 중간에서 끊지 않는다.
 */

const MINI_HOLE = 10;
const MINI_GAP = 3;
const MINI_STROKE = 1.5;
const MINI_WIDTH =
  MINI_HOLE * TRANSFER_STAGE_HOLES + MINI_GAP * (TRANSFER_STAGE_HOLES - 1);

/** 필터 단계 항목 앞 작은 펀치(장식 — 항목 이름이 단계 글자) */
export function MiniPunch({ status }: { status: TransferStatus }) {
  const filled = TRANSFER_STAGE[status].filled;
  const official = status === "official";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative inline-flex flex-none",
        status === "collapsed" &&
          "after:absolute after:-inset-x-0.75 after:top-1/2 after:h-0.5 after:-rotate-8 after:bg-transfer-collapsed after:content-['']",
      )}
    >
      <svg
        width={MINI_WIDTH}
        height={MINI_HOLE}
        viewBox={`0 0 ${MINI_WIDTH} ${MINI_HOLE}`}
        focusable="false"
        className="block"
      >
        {Array.from({ length: TRANSFER_STAGE_HOLES }, (_, i) => (
          <circle
            key={i}
            cx={MINI_HOLE / 2 + i * (MINI_HOLE + MINI_GAP)}
            cy={MINI_HOLE / 2}
            r={(MINI_HOLE - MINI_STROKE) / 2}
            strokeWidth={MINI_STROKE}
            className={
              i < filled
                ? official
                  ? "fill-transfer-official stroke-transfer-official"
                  : "fill-transfer-progress stroke-transfer-progress"
                : "fill-none stroke-ink-2"
            }
          />
        ))}
      </svg>
    </span>
  );
}

/** 출발 → 행선지 화살표(20px, `--ink-2`) */
export function RouteArrow({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className="block flex-none text-ink-2"
    >
      <path d="M4 12h15M14 7l5 5-5 5" />
    </svg>
  );
}

/** 사전에 없는 선수 — 빈 밑줄 + 안내(화면 밖 "선수 이름 표기 없음 — ") */
export function NameBlank() {
  return (
    <span className="flex flex-wrap items-end gap-x-2.5 gap-y-1">
      <i
        aria-hidden="true"
        className="block h-5.5 w-32 border-b-[1.5px] border-dashed border-ink-3"
      />
      <span className="sr-only">선수 이름 표기 없음 — </span>
      <span className="text-[12.5px] font-normal text-ink-2">
        이름 표기 전 — 원제목 참고
      </span>
    </span>
  );
}

/** 선수 이름(+ 한국 완장) — 이름이 없으면 `NameBlank` */
export function TransferName({
  player,
  className,
}: {
  player: TransferPlayerView;
  className?: string;
}) {
  if (player.name === null) return <NameBlank />;
  return (
    <span
      className={cx("inline-flex flex-wrap items-center gap-x-2", className)}
    >
      <span className="whitespace-nowrap">{player.name}</span>
      {player.korean ? <KoreanArmband title="한국 선수" /> : null}
    </span>
  );
}

/** 배지 + 팀 이름 — 이름은 줄바꿈하지 않는다(칸이 좁으면 말줄임, 접근 이름은 전체) */
export function TeamName({
  team,
  size = "xs",
  className,
}: {
  team: TeamView;
  size?: "xs" | "s";
  className?: string;
}) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TeamBadge team={team} size={size} />
      <span
        lang={team.latin ? "en" : undefined}
        className="min-w-0 truncate [overflow-wrap:normal]"
      >
        {team.name}
      </span>
    </span>
  );
}
