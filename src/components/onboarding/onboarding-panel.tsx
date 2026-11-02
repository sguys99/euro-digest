"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { noticeUnsaved } from "@/components/follow/follow-button";
import { StateStamp } from "@/components/korean-players/player-marks";
import { KoreanArmband } from "@/components/news/korean-armband";
import { TeamBadge } from "@/components/team/team-badge";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { FlatTab } from "@/components/ui/chip";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { FOLLOW_LIMITS, isFollowAtLimit, type FollowKind } from "@/lib/follow";
import { ONBOARDING_STORAGE_KEY, type OnboardingMark } from "@/lib/onboarding";
import {
  leaguesForTeams,
  nextStep,
  ONBOARDING_STEPS,
  onboardingSummary,
  parseOnboardingData,
  prevStep,
  STEP_TITLES,
  stepAnnouncement,
  stepTone,
  TEAMS_SHOWN,
  toggleLeague,
  visibleTeams,
  type OnboardingData,
  type OnboardingLeague,
  type OnboardingStep,
  type StepTone,
} from "@/lib/onboarding-steps";
import type { CompId } from "@/lib/schema/common";
import { safeLocalStorage } from "@/lib/safe-storage";
import { followStore, useFollows } from "@/lib/use-follows";

/**
 * 온보딩 단계 UI — 지연 청크 (PRD FR-113 · §15 D67 ②, DESIGN §9.3 D2 "온보딩", 혼합안 화면 4 `.ob`, DECISIONS D2 §9, plan M4-09)
 *
 * 홈 진입 줄의 "시작"을 누르면 import된다(초기 JS에 들지 않는다). 자료는 `/my/data/onboarding.json`을 받는다(build-feeds).
 * - **번호 체크 목록**: 단계 머리 `[날짜 거터 │ 제목 · 부제 │ 상태 ▾]` 최소 64px, 번호 40 / 54px Barlow 800 — 완료 `--ink` 실선 · 현재 `--brand-accent` ·
 *   다음 `--ink-2` 윤곽 1.5px(숫자 상태 규칙과 같은 문법). 현재 단계만 펼친다(찍힘 fast — 모션 줄이기면 없음). 머리를 누르면 그 단계로 간다
 *   (현재 단계 머리는 접고 편다).
 * - **옵션 행** 46px — 행 전체 `<label>`(18px 체크 칸 + 표식 + 이름 + 순위 · 상태). 리그 = 평탄 탭 + 팀 수, 팀 = 키트 배지 + 한국 완장 + 순위
 *   (리그마다 앞 6팀 + "n팀 모두"), 선수 = 이름 + 포지션 + 소속 + 상태 도장.
 * - **팀 · 선수는 고르는 즉시 팔로우**(팔로우 버튼과 같은 저장소 — 건너뛰어도 고른 것은 남는다). 종류마다 5개 — 넘치면 토스트(체크는 그대로 꺼짐).
 *   저장소가 막혔으면 팔로우 버튼과 같은 토스트를 한 번.
 * - **아래 줄**: "건너뛰기"(텍스트 링크 — 기록 `skipped`, 닫힘) · 그 단계 수("팀 3 / 5") · "이전" · "다음"(마지막 단계는 "완료" — 기록 `done` → 요약 +
 *   마이 링크). 진행은 틀의 `aria-live`가 알리고, 포커스는 새 단계 머리로 옮긴다.
 */

export interface OnboardingPanelProps {
  dataUrl: string;
  myHref: string;
  /** 닫기 — 기록을 남길 때 그 값(완료 요약의 "닫기"는 이미 남겼다 → null) */
  onClose: (mark: OnboardingMark | null) => void;
}

const TONE_NUMBER: Readonly<Record<StepTone, string>> = {
  done: "text-ink",
  current: "text-brand-accent",
  todo: "text-transparent [-webkit-text-stroke:1.5px_var(--ink-2)]",
};

const TONE_SR: Readonly<Record<StepTone, string>> = {
  done: "지난 단계",
  current: "지금 단계",
  todo: "남은 단계",
};

const STEP_SUB: Readonly<Record<OnboardingStep, string>> = {
  0: "보고 싶은 리그",
  1: `최대 ${FOLLOW_LIMITS.teams} · 고른 리그의 현재 순위 순`,
  2: `최대 ${FOLLOW_LIMITS.players}`,
};

/** 자료 받기(문서마다 한 번 — 실패는 다시 받는다) */
let dataRequest: Promise<OnboardingData | null> | null = null;
function fetchData(url: string): Promise<OnboardingData | null> {
  dataRequest ??= fetch(url)
    .then(async (res) =>
      res.ok ? parseOnboardingData((await res.json()) as unknown) : null,
    )
    .catch(() => null)
    .then((data) => {
      if (data === null) dataRequest = null;
      return data;
    });
  return dataRequest;
}

/** 테스트용 — 받은 자료를 잊는다 */
export function resetOnboardingData(): void {
  dataRequest = null;
}

/** 옵션 행 — 행 전체 `<label>`(누름 영역 46px), 18px 체크 칸(1.5px `--ink-2` → 켜짐 `--ink` 면 + 체크) */
function OptionRow({
  checked,
  onChange,
  children,
  className,
  ...data
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
  "data-ob-option"?: string;
}) {
  return (
    <label
      className={cx(
        "relative flex min-h-11.5 cursor-pointer items-center gap-2.25 border-b border-rule text-[14.5px] leading-snug has-checked:font-extrabold",
        className,
      )}
      {...data}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          "grid size-4.5 flex-none place-items-center border-[1.5px] border-ink-2",
          "peer-checked:border-ink peer-checked:bg-ink",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          "after:hidden after:h-1.25 after:w-2.25 after:-translate-y-px after:-rotate-45 after:border-b-2 after:border-l-2 after:border-paper after:content-[''] peer-checked:after:block",
        )}
      />
      {children}
    </label>
  );
}

/** 오른쪽 숫자(팀 수 · 순위) */
function SideNumber({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto flex-none pl-2 font-numeric text-[13px] leading-none font-semibold text-ink-2 tabular-nums">
      {children}
    </span>
  );
}

/**
 * 펼친 틀 — 위 3px `--ink` · 머리 "내 명단 만들기"(h2, 열리면 포커스) · 저장 안내(저장소가 막혔으면 '이번 방문 동안만') · 진행 알림(`aria-live`) · 단계
 */
export function OnboardingPanel(props: OnboardingPanelProps) {
  const [message, setMessage] = useState("");
  const headRef = useRef<HTMLHeadingElement>(null);
  const [persistent] = useState(() => followStore.persistent());
  useEffect(() => {
    headRef.current?.focus();
  }, []);
  return (
    <section
      aria-labelledby="ob-h"
      data-slot="onboarding-panel"
      className="border-t-3 border-b border-ink"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule pt-2.5 pb-3">
        <h2
          id="ob-h"
          ref={headRef}
          tabIndex={-1}
          className="text-type-h2 leading-[1.3] font-extrabold tracking-[-0.025em]"
        >
          내 명단 만들기
        </h2>
        <p className="text-[12.5px] leading-normal text-ink-2">
          {persistent
            ? "팔로우는 이 기기에만 저장돼요 · 마이에서 언제든 바꿀 수 있어요"
            : "저장소를 쓸 수 없어 팔로우는 이번 방문 동안만 유지돼요"}
        </p>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <OnboardingSteps {...props} announce={setMessage} />
    </section>
  );
}

/** 단계 UI · 자료를 받는 동안 — 단계 머리 세 줄 교정쇄(움직이지 않음 — DESIGN §9.2 Skeleton) */
function PanelLoading() {
  return (
    <div aria-busy="true" data-slot="onboarding-loading">
      <span className="sr-only" role="status">
        불러오는 중
      </span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="grid min-h-16 grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-center gap-x-2.5 border-b border-rule py-2.5 last:border-b-0 lg:gap-x-3.5"
        >
          <div className="h-8.5 w-6 bg-paper-3 lg:h-11.5 lg:w-8" />
          <div className="grid gap-1.5">
            <div className="h-4 w-20 bg-paper-3" />
            <div className="h-3 w-36 bg-paper-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 받기 실패 — 안내 줄 + 다시 시도(오프라인이면 그 문구). `/my` 받기 실패와 같은 모양 */
function PanelNotice({ retry }: { retry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <p
      role="status"
      data-slot="onboarding-error"
      className="my-3 flex flex-wrap items-center gap-x-3 gap-y-1 bg-paper-2 px-3 py-2 text-[13px] leading-[1.45] text-ink-2 shadow-[inset_4px_0_0_var(--brand-accent)]"
    >
      <span>
        {offline
          ? "오프라인이라 고를 목록을 받지 못했어요."
          : "고를 목록을 받지 못했어요."}
      </span>
      <button
        type="button"
        onClick={retry}
        className="inline-flex min-h-11 items-center bg-transparent text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
      >
        다시 시도
      </button>
    </p>
  );
}

function OnboardingSteps({
  dataUrl,
  myHref,
  announce,
  onClose,
}: OnboardingPanelProps & {
  /** 단계 진행 알림(틀의 `aria-live`) */
  announce: (message: string) => void;
}) {
  const { follows, follow, unfollow } = useFollows();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<OnboardingStep>(0);
  const [open, setOpen] = useState<OnboardingStep | null>(0);
  const [finished, setFinished] = useState(false);
  const [leagues, setLeagues] = useState<CompId[]>([]);
  const [expanded, setExpanded] = useState<CompId[]>([]);
  const headRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let live = true;
    void fetchData(dataUrl).then((d) => {
      if (!live) return;
      if (d) {
        setData(d);
        announce(stepAnnouncement(0));
      } else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [dataUrl, attempt, announce]);

  if (failed && !data) {
    return (
      <PanelNotice
        retry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!data) return <PanelLoading />;

  const order = data.l.map((l) => l.id);
  const teamLeagues = leaguesForTeams(data, leagues);

  function go(target: OnboardingStep) {
    setFinished(false);
    setStep(target);
    setOpen(target);
    announce(stepAnnouncement(target));
    requestAnimationFrame(() => headRefs.current[target]?.focus());
  }

  function onHead(index: OnboardingStep) {
    if (index === step && !finished) setOpen(open === index ? null : index);
    else go(index);
  }

  function choose(kind: FollowKind, slug: string, on: boolean) {
    const result = on ? follow(kind, slug) : unfollow(kind, slug);
    if (on && !result.changed && isFollowAtLimit(result.state, kind)) {
      toast({
        message: `${kind === "teams" ? "팀은" : "선수는"} ${FOLLOW_LIMITS[kind]}개까지 고를 수 있어요`,
      });
    }
    if (result.changed && !result.saved) noticeUnsaved();
  }

  function finish() {
    // 저장이 막혔으면 메모리 폴백이 이번 방문 동안 기억한다(진입 줄 판정은 페이지를 연 때 한 번)
    safeLocalStorage.set(ONBOARDING_STORAGE_KEY, "done");
    setFinished(true);
    setOpen(null);
    announce(
      `완료. 팀 ${follows.teams.length}개, 선수 ${follows.players.length}명을 팔로우했어요`,
    );
    requestAnimationFrame(() => doneRef.current?.focus());
  }

  const count = (s: OnboardingStep) =>
    s === 0
      ? leagues.length
      : s === 1
        ? follows.teams.length
        : follows.players.length;

  const status = (s: OnboardingStep, tone: StepTone): ReactNode =>
    s === 0 ? (
      <>
        <span className="font-numeric tabular-nums">{count(0)}</span>개
        {tone === "done" && count(0) > 0 ? " ✓" : null}
      </>
    ) : (
      <>
        <span className="font-numeric tabular-nums">{count(s)}</span> /{" "}
        <span className="font-numeric tabular-nums">
          {FOLLOW_LIMITS[s === 1 ? "teams" : "players"]}
        </span>
      </>
    );

  const summary = finished ? onboardingSummary(follows, data) : null;

  return (
    <div data-slot="onboarding-steps" data-step={finished ? "done" : step}>
      {ONBOARDING_STEPS.map((s) => {
        const tone = stepTone(s, step, finished);
        const isOpen = open === s && !finished;
        const bodyId = `ob-b${s + 1}`;
        return (
          <div
            key={s}
            data-slot="onboarding-step"
            data-tone={tone}
            className="border-b border-rule"
          >
            <button
              ref={(el) => {
                headRefs.current[s] = el;
              }}
              type="button"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              onClick={() => onHead(s)}
              className="grid min-h-16 w-full grid-cols-[var(--gutter-date)_minmax(0,1fr)_auto] items-center gap-x-2.5 bg-transparent py-2.5 text-left text-ink lg:gap-x-3.5"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "font-numeric text-[40px] leading-[0.86] font-extrabold tracking-[-0.02em] tabular-nums lg:text-[54px]",
                  TONE_NUMBER[tone],
                )}
              >
                {s + 1}
              </span>
              <span className="grid gap-0.75">
                <b className="text-[17px] font-extrabold tracking-[-0.02em]">
                  <span className="sr-only">{s + 1}단계 </span>
                  {STEP_TITLES[s]}
                  <span className="sr-only">, {TONE_SR[tone]}</span>
                </b>
                <span className="text-[12.5px] leading-[1.4] text-ink-2">
                  {s === 2 ? `등록 ${data.p.length}명 · ` : null}
                  {STEP_SUB[s]}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold whitespace-nowrap text-ink-2">
                <span>{status(s, tone)}</span>
                <ChevronDownIcon
                  size={18}
                  className={cx(
                    "transition-transform duration-fast ease-print motion-reduce:transition-none",
                    isOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
            <div
              id={bodyId}
              hidden={!isOpen}
              data-slot="onboarding-body"
              className="animate-stamp pb-3.5 pl-[calc(var(--gutter-date)+10px)] motion-reduce:animate-none lg:pl-[calc(var(--gutter-date)+14px)]"
            >
              {isOpen && s === 0 ? (
                <fieldset className="min-w-0">
                  <legend className="sr-only">보고 싶은 리그</legend>
                  {data.l.map((l) => (
                    <OptionRow
                      key={l.id}
                      data-ob-option={l.id}
                      checked={leagues.includes(l.id)}
                      onChange={() =>
                        setLeagues(toggleLeague(leagues, l.id, order))
                      }
                    >
                      <FlatTab comp={l.id} title={l.n}>
                        {l.s}
                      </FlatTab>
                      <span>{l.n}</span>
                      <SideNumber>{l.t.length}팀</SideNumber>
                    </OptionRow>
                  ))}
                </fieldset>
              ) : null}
              {isOpen && s === 1 ? (
                teamLeagues.length === 0 ? (
                  <p className="flex flex-wrap items-center gap-x-3 pt-2 text-[13px] leading-normal text-ink-2">
                    <span>리그를 고르면 그 리그 팀이 순위 순으로 나와요.</span>
                    <button
                      type="button"
                      onClick={() => go(0)}
                      className={cx(BUTTON_BASE, BUTTON_VARIANTS.link)}
                    >
                      리그 고르기
                    </button>
                  </p>
                ) : (
                  <div className="grid gap-x-6 lg:grid-cols-2">
                    {teamLeagues.map((l) => (
                      <TeamGroup
                        key={l.id}
                        league={l}
                        chosen={follows.teams}
                        expanded={expanded.includes(l.id)}
                        onExpand={() =>
                          setExpanded(
                            expanded.includes(l.id)
                              ? expanded.filter((x) => x !== l.id)
                              : [...expanded, l.id],
                          )
                        }
                        onChoose={(slug, on) => choose("teams", slug, on)}
                      />
                    ))}
                  </div>
                )
              ) : null}
              {isOpen && s === 2 ? (
                <fieldset className="grid min-w-0 gap-x-6 lg:grid-cols-2">
                  <legend className="sr-only">한국 선수</legend>
                  {data.p.map((p) => (
                    <OptionRow
                      key={p.k}
                      data-ob-option={p.k}
                      checked={follows.players.includes(p.k)}
                      onChange={(on) => choose("players", p.k, on)}
                    >
                      <span className="flex-none">{p.n}</span>
                      <span className="flex-none font-numeric text-[12.5px] leading-none font-semibold tracking-[0.06em] text-ink-2">
                        {p.pos}
                      </span>
                      <span
                        lang={p.tl ? "en" : undefined}
                        className="min-w-0 truncate text-[12.5px] text-ink-2"
                      >
                        {p.t}
                      </span>
                      {p.st ? (
                        <span className="ml-auto flex-none pl-2">
                          <StateStamp>
                            {p.st === "other" ? "기타 리그" : "기록 연결 전"}
                          </StateStamp>
                        </span>
                      ) : null}
                    </OptionRow>
                  ))}
                </fieldset>
              ) : null}
            </div>
          </div>
        );
      })}
      {summary ? (
        <div
          data-slot="onboarding-done"
          className="my-3.5 bg-paper-2 px-3.5 py-3 shadow-[inset_4px_0_0_var(--brand-accent)]"
        >
          <p
            ref={doneRef}
            tabIndex={-1}
            className="text-[15px] leading-[1.35] font-extrabold"
          >
            {summary.total > 0 ? (
              <>
                내 명단을 만들었어요 — 팀{" "}
                <b className="font-numeric text-lg leading-none tabular-nums">
                  {follows.teams.length}
                </b>{" "}
                · 선수{" "}
                <b className="font-numeric text-lg leading-none tabular-nums">
                  {follows.players.length}
                </b>
              </>
            ) : (
              "고른 팀·선수가 없어요"
            )}
          </p>
          <p className="mt-1 text-[13px] leading-normal text-ink-2">
            {summary.total > 0
              ? [...summary.teams, ...summary.players].join(" · ")
              : "팀 화면 · 한국 선수에서 언제든 팔로우할 수 있어요"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4">
            {summary.total > 0 ? (
              <Link
                href={myHref}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                마이에서 보기
                <ChevronRightIcon size={18} />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => onClose(null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center bg-transparent text-[13px] font-extrabold text-ink-2 underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              닫기
            </button>
          </p>
        </div>
      ) : (
        <div
          data-slot="onboarding-foot"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3 pb-3.5"
        >
          <button
            type="button"
            onClick={() => onClose("skipped")}
            className={cx(
              BUTTON_BASE,
              BUTTON_VARIANTS.link,
              "min-w-11 justify-center",
            )}
          >
            건너뛰기
          </button>
          <span className="text-[13px] text-ink-2" data-slot="onboarding-count">
            {step === 0 ? "리그 " : step === 1 ? "팀 " : "선수 "}
            <b className="font-numeric text-lg leading-none font-extrabold text-ink tabular-nums">
              {count(step)}
            </b>
            {step === 0
              ? "개"
              : ` / ${FOLLOW_LIMITS[step === 1 ? "teams" : "players"]}`}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={prevStep(step) === null}
              onClick={() => {
                const p = prevStep(step);
                if (p !== null) go(p);
              }}
              className={cx(BUTTON_BASE, BUTTON_VARIANTS.secondary)}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => {
                const n = nextStep(step);
                if (n === null) finish();
                else go(n);
              }}
              className={cx(BUTTON_BASE, BUTTON_VARIANTS.primary)}
            >
              {nextStep(step) === null ? "완료" : "다음"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** 팀 단계의 리그 한 묶음 — 머리(평탄 탭 + 이름 + "현재 순위 순") + 팀 행 + "n팀 모두" */
function TeamGroup({
  league,
  chosen,
  expanded,
  onExpand,
  onChoose,
}: {
  league: OnboardingLeague;
  chosen: readonly string[];
  expanded: boolean;
  onExpand: () => void;
  onChoose: (slug: string, on: boolean) => void;
}) {
  const teams = visibleTeams(league, expanded, chosen);
  const headId = `ob-lg-${league.id.toLowerCase()}`;
  return (
    <fieldset
      aria-labelledby={headId}
      data-ob-league={league.id}
      className="min-w-0"
    >
      <p
        id={headId}
        className="flex items-center gap-2 border-b border-ink pt-2.5 pb-1 text-xs font-extrabold text-ink-2"
      >
        <FlatTab comp={league.id} title={league.n} aria-hidden="true">
          {league.s}
        </FlatTab>
        <span>{league.n}</span>
        <span className="ml-auto font-normal">현재 순위 순</span>
      </p>
      {teams.map((t) => (
        <OptionRow
          key={t.k}
          data-ob-option={t.k}
          checked={chosen.includes(t.k)}
          onChange={(on) => onChoose(t.k, on)}
        >
          <TeamBadge
            team={{ name: t.n, short: t.s, colors: t.c ?? null }}
            size="xs"
          />
          <span lang={t.l ? "en" : undefined} className="min-w-0 truncate">
            {t.n}
          </span>
          {t.kr ? (
            <span className="flex-none">
              <KoreanArmband />
            </span>
          ) : null}
          {t.p !== null ? <SideNumber>{t.p}위</SideNumber> : null}
        </OptionRow>
      ))}
      {league.t.length > TEAMS_SHOWN ? (
        <p className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[12.5px] leading-normal text-ink-2">
            {league.t.length}팀 중 {teams.length}
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onExpand}
            className={cx(BUTTON_BASE, BUTTON_VARIANTS.link)}
          >
            {expanded ? "접기" : `${league.t.length}팀 모두`}
            <span className="sr-only"> — {league.n}</span>
            <ChevronDownIcon
              size={16}
              className={cx(expanded && "rotate-180")}
            />
          </button>
        </p>
      ) : null}
    </fieldset>
  );
}
