/**
 * 첫 방문 온보딩 — 단계 상태 · 자료 형식 (PRD FR-113, §15 D67 ②, DESIGN §9.3 D2 "온보딩", plan M4-09)
 *
 * 순수 모듈(DOM · fs · zod 없음). **지연 청크(단계 UI — src/components/onboarding/onboarding-panel.tsx)와 빌드(src/lib/onboarding-data.ts)만**
 * import한다 — 홈 진입 줄(초기 JS)은 src/lib/onboarding.ts(표시 조건)만 쓴다. 규칙 설명은 src/lib/onboarding.ts 머리 주석.
 */
import type { FollowLists } from "@/lib/follow";
import type { MyTeamEntry } from "@/lib/my-view";
import type { CompId } from "@/lib/schema/common";

// ─── 자료 ───────────────────────────────────────────────────────────────────

export const ONBOARDING_DATA_VERSION = 1;

/** 팀 한 줄 — `/my` 디렉터리 항목 + slug · 순위 · 한국 선수 소속 */
export interface OnboardingTeam extends Omit<MyTeamEntry, "u"> {
  /** slug */
  k: string;
  /** 리그 순위(순위표가 없으면 null) */
  p: number | null;
  /** 등록 한국 선수(활성)가 뛰는 팀 */
  kr?: 1;
}

/** 리그 하나 — 팀은 현재 순위 순(순위 없는 팀은 뒤, 이름 순) */
export interface OnboardingLeague {
  id: CompId;
  /** 정식 이름 */
  n: string;
  /** 약칭(평탄 탭) */
  s: string;
  t: OnboardingTeam[];
}

/** 선수 상태 — 기록 연결 전 · 기타 리그(목록 화면과 같은 판정 — src/lib/korean-players-view.ts `rosterStateOf`) */
export type OnboardingPlayerState = "not-linked" | "other";

/** 선수 한 줄 */
export interface OnboardingPlayer {
  k: string;
  n: string;
  /** 포지션 약자(GK · DF · MF · FW) */
  pos: string;
  /** 소속팀 이름 */
  t: string;
  tl?: 1;
  st?: OnboardingPlayerState;
}

export interface OnboardingData {
  v: typeof ONBOARDING_DATA_VERSION;
  /** 5대 리그(설정 순서) */
  l: OnboardingLeague[];
  /** 등록 한국 선수(설정 순서) */
  p: OnboardingPlayer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 받은 JSON → 자료(형식이 다르면 null — '불러오지 못함'). 빌드가 쓴 파일이라 겉모양만 본다(버전 · 배열 · 키 이름).
 * 깨진 항목은 버린다(클라이언트 번들이라 zod를 쓰지 않는다 — follow.ts와 같은 규칙).
 */
export function parseOnboardingData(raw: unknown): OnboardingData | null {
  if (!isRecord(raw) || raw.v !== ONBOARDING_DATA_VERSION) return null;
  if (!Array.isArray(raw.l) || !Array.isArray(raw.p)) return null;
  const leagues = raw.l.flatMap((l): OnboardingLeague[] => {
    if (!isRecord(l) || typeof l.id !== "string" || !Array.isArray(l.t))
      return [];
    const teams = l.t.filter(
      (t): t is OnboardingTeam =>
        isRecord(t) &&
        typeof t.k === "string" &&
        typeof t.n === "string" &&
        typeof t.s === "string",
    );
    return [
      {
        id: l.id as CompId,
        n: String(l.n ?? l.id),
        s: String(l.s ?? l.id),
        t: teams,
      },
    ];
  });
  const players = raw.p.filter(
    (p): p is OnboardingPlayer =>
      isRecord(p) &&
      typeof p.k === "string" &&
      typeof p.n === "string" &&
      typeof p.t === "string",
  );
  return { v: ONBOARDING_DATA_VERSION, l: leagues, p: players };
}

// ─── 단계 ───────────────────────────────────────────────────────────────────

/** 단계 — 0 리그 · 1 팀 · 2 한국 선수 */
export type OnboardingStep = 0 | 1 | 2;
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [0, 1, 2];

/** 단계 이름(머리 제목 · 진행 알림) */
export const STEP_TITLES: Readonly<Record<OnboardingStep, string>> = {
  0: "리그",
  1: "팀",
  2: "한국 선수",
};

/** 번호 모양(숫자 상태 규칙과 같은 문법 — 완료 실선 · 현재 레드 · 다음 윤곽) */
export type StepTone = "done" | "current" | "todo";

/** 단계 번호 모양. 완료(요약) 뒤에는 모두 완료 */
export function stepTone(
  index: OnboardingStep,
  current: OnboardingStep,
  finished = false,
): StepTone {
  if (finished || index < current) return "done";
  return index === current ? "current" : "todo";
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return step < 2 ? ((step + 1) as OnboardingStep) : null;
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  return step > 0 ? ((step - 1) as OnboardingStep) : null;
}

/** 리그 고르기 — 켜고 끈다. 순서는 자료(설정) 순서로 고정 */
export function toggleLeague(
  selected: readonly CompId[],
  id: CompId,
  order: readonly CompId[],
): CompId[] {
  const next = selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
  return order.filter((x) => next.includes(x));
}

/** 팀 단계에서 리그마다 처음 보일 팀 수(혼합안 "18팀 중 6") */
export const TEAMS_SHOWN = 6;

/**
 * 리그 하나에서 보일 팀 — 펼쳤으면 전부, 아니면 앞 `TEAMS_SHOWN`개 + 그 뒤에서 고른 팀(접어도 고른 것은 보인다). 순서는 순위 순 그대로
 */
export function visibleTeams(
  league: OnboardingLeague,
  expanded: boolean,
  chosen: ReadonlySet<string> | readonly string[],
): OnboardingTeam[] {
  if (expanded) return league.t;
  const has = (k: string) =>
    Array.isArray(chosen)
      ? chosen.includes(k)
      : (chosen as ReadonlySet<string>).has(k);
  return league.t.filter((t, i) => i < TEAMS_SHOWN || has(t.k));
}

/** 팀 단계에 실을 리그 — 고른 리그(자료 순서) */
export function leaguesForTeams(
  data: OnboardingData,
  selected: readonly CompId[],
): OnboardingLeague[] {
  return data.l.filter((l) => selected.includes(l.id));
}

/** 단계 진행 알림(`aria-live`) — "3단계 중 2단계, 팀. 최대 5개 …" */
export function stepAnnouncement(step: OnboardingStep): string {
  const hint: Record<OnboardingStep, string> = {
    0: "보고 싶은 리그를 고르세요",
    1: "고른 리그의 팀을 5개까지 고르면 바로 팔로우돼요",
    2: "한국 선수를 5명까지 고르면 바로 팔로우돼요",
  };
  return `3단계 중 ${step + 1}단계, ${STEP_TITLES[step]}. ${hint[step]}`;
}

/** 완료 요약 — 팔로우 이름(팔로우한 순). 자료에 없는 slug(다른 화면에서 팔로우한 것)는 빼고 수만 센다 */
export function onboardingSummary(
  follows: FollowLists,
  data: OnboardingData,
): { teams: string[]; players: string[]; total: number } {
  const teamName = new Map(data.l.flatMap((l) => l.t.map((t) => [t.k, t.n])));
  const playerName = new Map(data.p.map((p) => [p.k, p.n]));
  const teams = follows.teams.flatMap((s) => {
    const n = teamName.get(s);
    return n ? [n] : [];
  });
  const players = follows.players.flatMap((s) => {
    const n = playerName.get(s);
    return n ? [n] : [];
  });
  return {
    teams,
    players,
    total: follows.teams.length + follows.players.length,
  };
}
