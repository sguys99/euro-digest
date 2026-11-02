"use client";

import { useLayoutEffect, useRef, useState, type ComponentType } from "react";

import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { toast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import {
  ONBOARDING_ENTRY_ID,
  ONBOARDING_STORAGE_KEY,
  parseOnboardingMark,
  shouldOfferOnboarding,
  type OnboardingMark,
} from "@/lib/onboarding";
import { safeLocalStorage } from "@/lib/safe-storage";
import { useFollows } from "@/lib/use-follows";

import type { OnboardingPanelProps } from "./onboarding-panel";

/**
 * 첫 방문 온보딩 — 홈 진입 줄 (PRD FR-113 · §15 D64 ⑥, DESIGN §9.3 D2 "온보딩", 혼합안 화면 4 `.entry` · `.ob`, plan M4-09)
 *
 * 클라이언트 섬(초기 JS — 진입 줄과 표시 판정만. 펼친 틀 · 단계 UI는 "시작"을 누를 때 지연 import — src/components/onboarding/onboarding-panel.tsx).
 * - **보일 때**: 팔로우 0 + 온보딩 기록 없음(src/lib/onboarding.ts). 서버 HTML은 숨김이고, 첫 페인트 전 스크립트(src/lib/onboarding-boot.ts)가
 *   같은 규칙으로 먼저 연다(아래 지면이 밀리지 않게 — DECISIONS D2 §9). 하이드레이션 뒤 이 섬이 한 번 판정해 굳힌다(앱 안 이동으로 홈에 온 때 ·
 *   스크립트가 실패한 때). 판정은 한 번 — 단계에서 팔로우가 생겨도 펼친 틀은 그대로다.
 * - **진입 줄**: 위아래 1px `--ink`, "1·2·3"(Barlow 800 22px `--brand-accent`) + 제목 · 부제 + "시작"(주 버튼) · "건너뛰기"(텍스트 링크).
 *   진입 줄 "건너뛰기"(사용자 결정 2026-11-02 — 시안 "다음에"가 '나중에 다시'로 읽혀 동작에 맞춤)는 펼친 뒤 건너뛰기와 같다 — 기록을 남겨 이 기기에서 다시 띄우지 않는다(토스트로 다른 길을 알린다).
 * - **펼침**: 단계 UI 청크를 받는 동안 진입 줄은 그대로(버튼 `aria-busy`), 받으면 같은 자리가 틀로 바뀌고 틀이 머리로 포커스를 옮긴다.
 *   청크를 못 받으면 진입 줄 아래 안내 + 다시 시도.
 */

type PanelComponent = ComponentType<OnboardingPanelProps>;

export function OnboardingEntry({
  dataUrl,
  myHref,
  className,
}: {
  /** 온보딩 자료 주소(basePath 포함 — `/my/data/onboarding.json`) */
  dataUrl: string;
  /** 마이 주소(완료 요약 링크) */
  myHref: string;
  className?: string;
}) {
  const { follows, ready } = useFollows();
  // 페이지를 연 때 한 번 판정(null = 아직 — 서버 HTML · 하이드레이션 첫 렌더는 첫 페인트 전 스크립트의 결과를 그대로 둔다)
  const [offer, setOffer] = useState<boolean | null>(null);
  if (ready && offer === null) {
    setOffer(
      shouldOfferOnboarding(
        follows,
        parseOnboardingMark(safeLocalStorage.get(ONBOARDING_STORAGE_KEY)),
      ),
    );
  }
  const [phase, setPhase] = useState<"line" | "loading" | "open" | "closed">(
    "line",
  );
  const [Panel, setPanel] = useState<PanelComponent | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = offer === true && phase !== "closed";

  // 서버 HTML의 `hidden`은 첫 페인트 전 스크립트가 바꿨을 수 있다(하이드레이션은 속성을 고치지 않는다) — 판정 뒤에는 이 값으로 맞춘다
  useLayoutEffect(() => {
    if (offer !== null && rootRef.current) rootRef.current.hidden = !visible;
  }, [offer, visible]);

  function start() {
    if (Panel) return setPhase("open");
    setFailed(false);
    setPhase("loading");
    import("./onboarding-panel").then(
      (m) => {
        setPanel(() => m.OnboardingPanel);
        setPhase("open");
      },
      () => {
        setFailed(true);
        setPhase("line");
      },
    );
  }

  function close(mark: OnboardingMark | null) {
    if (mark) safeLocalStorage.set(ONBOARDING_STORAGE_KEY, mark);
    setPhase("closed");
    // 닫힌 뒤 포커스 — 본문(`<main id="main" tabindex="-1">`, 건너뛰기 링크 대상). 화면은 움직이지 않는다
    document.getElementById("main")?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={rootRef}
      id={ONBOARDING_ENTRY_ID}
      data-slot="onboarding"
      hidden={!visible}
      suppressHydrationWarning
      className={className}
    >
      {phase === "open" && Panel ? (
        <Panel dataUrl={dataUrl} myHref={myHref} onClose={close} />
      ) : (
        <div
          data-slot="onboarding-entry"
          className="grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] items-center gap-x-2.5 border-y border-ink py-3 lg:gap-x-3.5"
        >
          <span
            aria-hidden="true"
            className="font-numeric text-[22px] leading-none font-extrabold whitespace-nowrap text-brand-accent tabular-nums"
          >
            1·2·3
          </span>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="text-[15px] leading-[1.35] font-extrabold">
              내 명단 만들기
              <span className="block text-[12.5px] font-normal text-ink-2">
                리그 → 팀 → 한국 선수 · 건너뛸 수 있어요
              </span>
            </p>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={start}
                aria-busy={phase === "loading" || undefined}
                className={cx(BUTTON_BASE, BUTTON_VARIANTS.primary)}
              >
                <span className="sr-only">내 명단 만들기 </span>시작
              </button>
              <button
                type="button"
                onClick={() => {
                  close("skipped");
                  toast({
                    message:
                      "팀 화면 · 한국 선수에서 언제든 팔로우할 수 있어요",
                  });
                }}
                className={cx(
                  BUTTON_BASE,
                  BUTTON_VARIANTS.link,
                  "min-w-11 justify-center",
                )}
              >
                건너뛰기
                <span className="sr-only"> — 내 명단 만들기 닫기</span>
              </button>
            </span>
          </div>
          {failed ? (
            <p
              role="status"
              data-slot="onboarding-error"
              className="col-span-full mt-2 text-[13px] leading-normal text-ink-2"
            >
              고를 목록을 받지 못했어요 — 다시 눌러 주세요.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
