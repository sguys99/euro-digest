import Link from "next/link";

import { KoreanArmband } from "@/components/news/feed-card";
import { TeamBadge } from "@/components/team/team-badge";
import { TeamLink } from "@/components/team/team-link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { IndexTab, StampChip } from "@/components/ui/chip";
import { SectionHead } from "@/components/ui/section-head";
import type { TeamView } from "@/lib/competition-view";
import type { TonightWidget } from "@/lib/data/home-widgets";
import {
  tonightWindowText,
  type TonightCardView,
  type TonightCriterion,
} from "@/lib/home-widgets";
import { routes } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * 오늘 밤 볼 경기 (PRD F8 FR-80~82, DESIGN §9.3 "오늘 밤 경기 카드", plan M2-14 — 확정 시안 `docs/design/d1/concept-mix.html` 화면 3)
 *
 * 서버 컴포넌트 — JS 0. 홈 위젯(1280 이상 마주 보는 면 첫 위젯 · 1279 이하 지면 안 피드 다음)과 `/tonight` 페이지가 같은 목록을 쓴다
 * (PRD §15 D63 ④ — 새 시각 모티프 없이 D1 오늘 밤 카드로 조립).
 * - 행 = 카드 격자의 변형 `52px · 1fr · --tab-w`(간격 10px, 위아래 12px, 아래 1px `--rule`). 1023 이하는 오른쪽으로 `--edge`만큼 넘쳐 인덱스
 *   탭이 화면 가장자리에 붙는다(뉴스 카드 `bleed`와 같다 — 1024 이상·마주 보는 면은 넘치지 않는다).
 * - 거터: 킥오프 KST(Barlow 800 22px) + 날짜(Barlow 600 12.5px `--ink-2`). 이미 끝난 경기는 시각을 `--ink-2`로 낮추고 "종료"만 적는다 —
 *   스코어는 싣지 않는다(결과 가리기 M4-15 전, src/lib/home-widgets.ts 머리 주석).
 * - 본문: 이유 태그 줄(데이터 사실만 — `reasons[].label` 그대로, 한국 선수 = "한국" 완장 + "{선수} 소속", 그 밖 = 도장 칩) → 대진 2줄(홈 / 원정,
 *   배지 s + 한글 팀명 800 15px). 이유가 없으면 태그 줄을 두지 않는다.
 * - 접근성: 목록 `<ol>`, 이유 `<ul aria-label="선정 이유">`, 두 팀 사이 화면 밖 "대", 배지 `aria-hidden`, 인덱스 탭 약칭 + `title`,
 *   킥오프 `<time datetime>`. 팀 이름은 팀 화면 링크(M2-13 — 팀 페이지가 있는 팀만, `TeamLink`).
 */

/**
 * 팀 한 줄 — 배지 s + 한글 팀명(사전에 없는 팀은 원어 `lang="en"`). 팀 페이지가 있는 팀은 줄 전체가 팀 화면 링크(M2-13 `TeamLink` —
 * 누름 영역 위아래 44px, hover 팀명 밑줄 — 배지는 inline-grid라 밑줄이 번지지 않는다). 링크는 글자 폭만(`justify-self-start`).
 */
function TeamLine({ team }: { team: TeamView }) {
  return (
    <TeamLink team={team} className="justify-self-start">
      <TeamBadge team={team} size="s" />
      <span lang={team.latin ? "en" : undefined} className="ml-2">
        {team.name}
      </span>
    </TeamLink>
  );
}

function TonightRow({ card }: { card: TonightCardView }) {
  const done = card.state === "finished";
  return (
    <li
      data-slot="tonight-row"
      data-state={card.state}
      className="-mr-edge grid grid-cols-[52px_minmax(0,1fr)_var(--tab-w)] gap-x-2.5 border-b border-rule py-3 lg:mr-0"
    >
      <div className="grid content-start gap-1">
        <time
          dateTime={card.kickoff}
          className={cn(
            "font-numeric text-[22px] leading-[0.9] font-extrabold tracking-[-0.01em] tabular-nums",
            done && "text-ink-2",
          )}
        >
          {card.time}
        </time>
        <span className="font-numeric text-[12.5px] leading-none font-semibold text-ink-2 tabular-nums">
          {card.date}
        </span>
        {card.stateText ? (
          <span
            data-slot="tonight-state"
            className="mt-0.5 text-[11.5px] leading-tight font-extrabold text-ink-2"
          >
            {card.stateText}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        {card.reasons.length > 0 ? (
          <ul
            role="list"
            aria-label="선정 이유"
            className="flex flex-wrap gap-x-1.5 gap-y-1.25"
          >
            {card.reasons.map((reason) =>
              reason.kind === "korean" ? (
                <li
                  key={reason.label}
                  data-reason={reason.kind}
                  className="inline-flex items-center gap-1.25 text-[12.5px] font-extrabold"
                >
                  <KoreanArmband />
                  {reason.label}
                </li>
              ) : (
                <li key={reason.label} data-reason={reason.kind}>
                  <StampChip>{reason.label}</StampChip>
                </li>
              ),
            )}
          </ul>
        ) : null}
        <p
          className={cn(
            // 두 줄 간격 11px — 줄마다 팀 링크 누름 영역 44px가 겹치지 않게(배지 33px + 11px. 시안 6px에서 5px 넓힘)
            "grid gap-2.75 text-[15px] leading-[1.25] font-extrabold",
            card.reasons.length > 0 && "mt-2.25",
          )}
        >
          <TeamLine team={card.home} />
          <span className="sr-only">대</span>
          <TeamLine team={card.away} />
        </p>
      </div>
      <div className="flex flex-col">
        <IndexTab comp={card.comp} title={card.compLabel.name}>
          {card.compLabel.short}
        </IndexTab>
      </div>
    </li>
  );
}

/** 카드 목록(위 8px · 1px `--rule`) */
export function TonightList({
  cards,
  className,
}: {
  cards: readonly TonightCardView[];
  className?: string;
}) {
  return (
    <ol
      role="list"
      data-slot="tonight-list"
      className={cn("mt-2 border-t border-rule", className)}
    >
      {cards.map((card) => (
        <TonightRow key={card.id} card={card} />
      ))}
    </ol>
  );
}

/** 빈 상태 — 창 안에 6개 대회 경기가 없다(경기 없는 날·비시즌·선별 규칙 없음). 문구는 UI 안내만(사실을 지어내지 않는다) */
export function TonightEmpty({ className }: { className?: string }) {
  return (
    <div
      data-slot="tonight-empty"
      className={cn("mt-2 border-t border-rule pt-4 pb-1", className)}
    >
      <p className="text-[15px] font-extrabold">
        오늘 밤에는 6개 대회 경기가 없어요.
      </p>
      <p className="mt-1.5 text-[13.5px] leading-normal text-ink-2">
        다음 일정은 대회별 순위표 화면의 일정·결과에서 볼 수 있어요.
      </p>
    </div>
  );
}

/** 텍스트 링크 — 레드 800 13px, 밑줄 1px(4px 띄움) → hover 2px, 꺾쇠 16px, 최소 44px(혼합안 `.tlink`) */
export const WIDGET_LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

/** 부제 줄 — "10.30 18:00 ~ 10.31 07:00 KST · 5경기" */
function windowLine(widget: TonightWidget): string | null {
  if (!widget.window) return null;
  const count = widget.cards.length;
  return `${tonightWindowText(widget.window)}${count > 0 ? ` · ${count}경기` : ""}`;
}

/**
 * 홈 위젯 — 얇은 섹션 머리 "오늘 밤 볼 경기" + TONIGHT, 부제(창 · n경기), 목록 또는 빈 상태, 아래 "선정 기준 ›"(`/tonight` — 같은 경기 +
 * 창·선정 기준 설명). 마주 보는 면(`facing`)이면 첫 위젯이라 위 여백이 없다.
 */
export function TonightSection({
  widget,
  headingId,
  className,
}: {
  widget: TonightWidget;
  headingId: string;
  className?: string;
}) {
  const sub = windowLine(widget);
  return (
    <section
      aria-labelledby={headingId}
      data-slot="tonight"
      className={className}
    >
      <SectionHead
        heading="오늘 밤 볼 경기"
        headingId={headingId}
        runningHead="TONIGHT"
        thin
      />
      {sub ? (
        <p className="mt-0.75 text-[13px] text-ink-2 tabular-nums">{sub}</p>
      ) : null}
      {widget.cards.length > 0 ? (
        <TonightList cards={widget.cards} />
      ) : (
        <TonightEmpty />
      )}
      <p className="mt-1 flex justify-end">
        <Link href={routes.tonight()} className={WIDGET_LINK}>
          선정 기준
          <ChevronRightIcon size={16} />
        </Link>
      </p>
    </section>
  );
}

/**
 * `/tonight` 선정 기준 — 얇은 섹션 머리 "선정 기준" + 설명 문단 + 규칙 목록(규칙 이름 · 이유 태그 설명 · 점수 "+n" Barlow 800). 값은 모두
 * `configs/bigmatch-rules.json`에서 온다(src/lib/home-widgets.ts `tonightCriteria`). 새 모티프 없이 리그 맥락 목록 문법(행 아래 1px `--rule`,
 * 숫자 오른쪽)으로 그린다(PRD §15 D63 ④).
 */
export function TonightCriteriaSection({
  criteria,
  windowText,
  maxMatches,
  headingId,
  className,
}: {
  criteria: readonly TonightCriterion[];
  /** "18:00 ~ 다음 날 07:00 KST" */
  windowText: string;
  maxMatches: number;
  headingId: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-slot="tonight-criteria"
      className={className}
    >
      <SectionHead
        heading="선정 기준"
        headingId={headingId}
        runningHead="HOW WE PICK"
        thin
      />
      <p className="mt-2 max-w-[46em] text-[13.5px] leading-normal break-keep text-ink-2">
        {windowText}에 킥오프하는 6개 대회 경기 가운데, 걸린 규칙의 점수를 더해
        높은 순으로 {maxMatches}경기까지 골라요. 점수가 같으면 킥오프가 이른
        경기부터예요. 킥오프 시각이 정해지지 않았거나 연기된 경기는 빼요.
      </p>
      <ol role="list" className="mt-3 border-t border-rule">
        {criteria.map((c) => (
          <li
            key={c.rule}
            data-rule={c.rule}
            className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2"
          >
            <span className="min-w-0 break-keep">
              <span className="block text-[14px] font-extrabold">
                {c.label}
              </span>
              {c.note ? (
                <span className="mt-0.5 block text-[12.5px] leading-normal text-ink-2">
                  {c.note}
                </span>
              ) : null}
            </span>
            <span className="font-numeric text-[18px] leading-none font-extrabold tabular-nums">
              +{c.weight}
              <span className="sr-only">점</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
