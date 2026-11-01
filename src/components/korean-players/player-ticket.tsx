import Link from "next/link";

import { TeamBadge } from "@/components/team/team-badge";
import { TransferStage } from "@/components/news/feed-card";
import { FlatTab } from "@/components/ui/chip";
import { ChevronRightIcon } from "@/components/ui/icons";
import type {
  NationalCallUpView,
  PlayerDetailView,
  TransferTagView,
} from "@/lib/player-detail-view";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";

import { NUMBER_TONE, OtherTab, StateStamp } from "./player-marks";
import { Perforation, TailCell, TailLink } from "./ticket-parts";

/**
 * 선수 티켓 — 한국 선수 상세 머리 (PRD FR-62, DESIGN §9.3 D2 "선수 티켓", DECISIONS D2 §4 B · §5 #13, plan M3-10)
 *
 * 서버 컴포넌트. 티켓 문법(1.5px `--ink` 테두리 · 절취선 · 노치)은 상세 머리 · 입장권에만 쓴다(D2 #13 ③). `<article aria-labelledby>` + h1.
 * - 격자 `스텁 96px │ 2px 절취선 │ 몸통`(1024 이상 스텁 `--col-contents`) + 아래 꼬리표 전폭.
 * - **스텁**: 키트 띠(팀 배지를 칸 폭으로 — 위 3 : 아래 2, 높이 52/56px, `role="img"` "{팀} 배지 {약어}") → 시즌 출전 시간 N1(숫자 상태 규칙 —
 *   실선 · 윤곽 · 대시, 숫자는 장식 · 뜻은 화면 밖 글자) → 캡션 2줄(800 `--ink` · 400 `--ink-2`). 세 자리 이상은 스텁(96px)에 들도록 한
 *   단계 작게(N2 — 375에서 "134분"이 넘치지 않게, M3-10 실측).
 * - **몸통**: 대회 줄(평탄 탭 + 리그 · 팀 순위 · 승점) → 이름 h1 36/52px → 영문 이름 `lang="en"` → 사실 줄(포지션 · 출생 연도 · 시즌 출전 ·
 *   골 · 도움 — 집계 기간 안 값, 벤치 · 명단 제외 시즌 값은 데이터에 없어 쓰지 않는다) → 팀 화면 텍스트 링크(팀 페이지가 있을 때만) → (기록
 *   연결 전 · 기타 리그) 상태 도장 + 사실 문장.
 * - **꼬리표**(있는 칸만 — 데이터가 없으면 칸을 숨기고 모두 없으면 꼬리표를 두지 않는다, DECISIONS D2 §6 #8): UCL 출전 · 이적설(코드가 판정한
 *   이 선수 이적 카드의 단계 펀치 + 행선지, 없으면 기사 건수) · 대표팀(최신 소집 명단에 있을 때 — 관련 기사 건수). 값은 같은 페이지 구역 링크.
 *   티켓 상자 폭 600px 미만은 세로로 쌓고 이상이면 가로(컨테이너 쿼리 — DESIGN §7.1 예외, DECISIONS D2 §6 #7).
 * - 팔로우 버튼은 M4-08 범위 — 자리를 그리지 않는다.
 */
export function PlayerTicket({
  view,
  headingId,
  transferTag,
  transferCount,
  callUp,
  nationalCount,
  transferHref,
  nationalHref,
}: {
  view: PlayerDetailView;
  headingId: string;
  transferTag: TransferTagView | null;
  /** 이적설 구역 기사 수(기간 안 전체) */
  transferCount: number;
  callUp: NationalCallUpView | null;
  /** 대표팀 소식 기사 수(기간 안 전체) */
  nationalCount: number;
  transferHref: string;
  nationalHref: string;
}) {
  const m = view.minutes;
  const digits = m.text.length;
  const tail: React.ReactNode[] = [];
  if (view.ucl) {
    tail.push(
      <TailCell key="ucl" label="UCL">
        <span>
          출전{" "}
          <span className="font-numeric text-[15px] font-semibold tabular-nums">
            {view.ucl.apps}
          </span>
          {view.ucl.minutes !== null ? (
            <>
              {" · "}
              <span className="font-numeric text-[15px] font-semibold tabular-nums">
                {view.ucl.minutes}
              </span>
              분
            </>
          ) : null}
        </span>
      </TailCell>,
    );
  }
  if (transferCount > 0) {
    tail.push(
      <TailCell key="transfer" label="이적설">
        {transferTag ? (
          <>
            <TransferStage
              as="span"
              status={transferTag.status}
              tier={null}
              className="mt-0 gap-x-1.5 text-[13px]"
            />
            {transferTag.to ? (
              <TailLink href={transferHref}>
                <span lang={transferTag.to.latin ? "en" : undefined}>
                  {transferTag.to.name}
                </span>
                <span className="sr-only"> — 이적설 기사로</span>
              </TailLink>
            ) : null}
          </>
        ) : null}
        {!transferTag?.to ? (
          <TailLink href={transferHref}>
            기사{" "}
            <span className="mx-0.5 font-numeric text-[15px] font-semibold tabular-nums">
              {transferCount}
            </span>
            건
          </TailLink>
        ) : null}
      </TailCell>,
    );
  }
  if (callUp) {
    tail.push(
      <TailCell key="national" label="대표팀" aside={callUp.label}>
        <TailLink href={nationalHref}>
          {nationalCount > 0 ? (
            <>
              관련 기사{" "}
              <span className="mx-0.5 font-numeric text-[15px] font-semibold tabular-nums">
                {nationalCount}
              </span>
              건
            </>
          ) : (
            "소집 일정"
          )}
        </TailLink>
      </TailCell>,
    );
  }

  return (
    <article
      aria-labelledby={headingId}
      data-slot="player-ticket"
      data-state={view.state}
      className="@container relative mt-1.5 grid grid-cols-[96px_2px_minmax(0,1fr)] border-[1.5px] border-ink bg-paper lg:grid-cols-[var(--col-contents)_2px_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col">
        <TeamBadge team={view.team} size="kit" standalone />
        <div className="flex flex-1 flex-col justify-end gap-1.25 pt-4 pr-2 pb-3.5 pl-3 lg:pt-5.5 lg:pr-5.5 lg:pb-5 lg:pl-6">
          <p className="mb-1">
            <span
              aria-hidden="true"
              data-tone={m.tone}
              className={cx(
                "block font-numeric leading-[0.84] font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums",
                digits <= 2
                  ? "text-num-n1"
                  : digits === 3
                    ? "text-num-n2 lg:text-num-n1"
                    : "text-num-n2",
                NUMBER_TONE[m.tone],
              )}
            >
              {m.text}
              {m.unit ? (
                <small
                  className={cx(
                    "ml-0.5 font-sans text-[0.36em] leading-none font-extrabold tracking-normal [-webkit-text-stroke:0]",
                    m.tone === "zero" ? "text-ink-2" : "text-ink",
                  )}
                >
                  분
                </small>
              ) : null}
            </span>
            <span className="sr-only">{m.sr}</span>
          </p>
          <p className="text-[11.5px] leading-[1.3] font-extrabold">
            시즌 출전 시간
          </p>
          <p className="text-[11.5px] leading-[1.3] text-ink-2">{m.note}</p>
        </div>
      </div>
      <Perforation />
      <div className="min-w-0 pt-3.5 pr-3.5 pb-2.5 pl-4 lg:pt-5.5 lg:pr-6 lg:pb-3.5 lg:pl-7">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] leading-[1.35] text-ink-2">
          {view.league.kind === "comp" ? (
            <FlatTab comp={view.league.comp} title={view.league.name}>
              {view.league.short}
            </FlatTab>
          ) : (
            <OtherTab title="5대 리그 밖" />
          )}
          <span>
            {view.league.name} ·{" "}
            <span lang={view.team.latin ? "en" : undefined}>
              {view.team.name}
            </span>
            {view.standing ? (
              <>
                {" "}
                <span className="font-numeric text-sm font-semibold text-ink tabular-nums">
                  {view.standing.pos}
                </span>
                위 · 승점{" "}
                <span className="font-numeric text-sm font-semibold text-ink tabular-nums">
                  {view.standing.pts}
                </span>
              </>
            ) : null}
          </span>
        </p>
        <h1
          id={headingId}
          className="mt-2.5 text-[36px] leading-[1.06] font-extrabold tracking-[-0.045em] lg:text-[52px]"
        >
          {view.nameKo}
        </h1>
        <p
          lang="en"
          className="mt-1 font-numeric text-[17px] leading-[1.1] font-semibold tracking-[0.04em] text-ink-2 lg:text-xl"
        >
          {view.nameEn}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] leading-[1.4] text-ink-2">
          <span>
            <b className="font-numeric text-[15px] font-semibold tracking-[0.04em] text-ink">
              {view.position}
            </b>
          </span>
          <span>
            <Num>{view.birthYear}</Num>년생
          </span>
          {view.total ? (
            <span>
              출전 <Num>{view.total.apps}</Num> · 골{" "}
              <Num>{view.total.goals}</Num> · 도움{" "}
              <Num>{view.total.assists ?? "–"}</Num>
            </span>
          ) : null}
        </p>
        {view.state !== "linked" ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-normal text-ink-2">
            <StateStamp>
              {view.state === "other" ? "갱신 중단" : "기록 연결 전"}
            </StateStamp>
            <span>
              {view.state === "other"
                ? "5대 리그 밖 팀이라 경기 기록 갱신을 멈췄어요"
                : "경기 기록이 아직 연결되지 않았어요"}
            </span>
          </p>
        ) : null}
        {view.team.page ? (
          <p className="mt-1.5">
            <Link
              href={routes.team(view.team.slug)}
              className="inline-flex min-h-11 items-center gap-1 text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              <span lang={view.team.latin ? "en" : undefined}>
                {view.team.name}
              </span>{" "}
              팀 화면
              <ChevronRightIcon size={16} />
            </Link>
          </p>
        ) : null}
      </div>
      {tail.length > 0 ? (
        <div
          data-slot="player-ticket-tail"
          className={cx(
            "col-span-3 grid border-t-2 border-dotted border-ink-3",
            tail.length === 3
              ? "@min-[37.5rem]:grid-cols-3"
              : tail.length === 2
                ? "@min-[37.5rem]:grid-cols-2"
                : null,
          )}
        >
          {tail}
        </div>
      ) : null}
    </article>
  );
}

/** 사실 줄 숫자 — Barlow 600 15px `--ink` */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-numeric text-[15px] font-semibold tracking-[0.02em] text-ink tabular-nums">
      {children}
    </span>
  );
}
