/**
 * 온보딩 자료 만들기 — 순수 함수 (PRD FR-113, plan M4-09, 형식 src/lib/onboarding-steps.ts `OnboardingData`)
 *
 * 빌드 전용(build-feeds가 로더 값을 넘겨 `out/my/data/onboarding.json`을 쓴다 — src/lib/data/my-page.ts `loadOnboardingData`).
 * - **리그** = 5대 리그(UCL 제외 — 팔로우할 팀을 고르는 '리그'), 설정 순서.
 * - **팀** = 그 리그가 대표 대회인 팀 중 팀 페이지가 있는 팀(= `/my` 디렉터리 — 팔로우할 수 있는 팀). 현재 순위 순, 순위표에 없는 팀은 뒤(이름 순).
 *   등록 한국 선수(활성 — 기타 리그 제외)가 뛰는 팀은 `kr`(옵션 행 한국 완장).
 * - **선수** = 등록 한국 선수 전원(설정 순서), 부제 = 소속팀 이름, 상태 = 기록 연결 전 · 기타 리그(목록 화면과 같은 판정).
 */
import type {
  OnboardingData,
  OnboardingLeague,
  OnboardingPlayer,
  OnboardingPlayerState,
  OnboardingTeam,
} from "@/lib/onboarding-steps";
import { ONBOARDING_DATA_VERSION } from "@/lib/onboarding-steps";
import type { MyDirectory } from "@/lib/my-view";
import type { CompId } from "@/lib/schema/common";

export interface OnboardingDataInput {
  /** 대회 설정(설정 순서) */
  competitions: ReadonlyArray<{ id: CompId; nameKo: string; shortKo: string }>;
  /** 팀 slug → 대표 대회 */
  teamComp: ReadonlyMap<string, CompId>;
  /** 대회 → (팀 slug → 순위) */
  standings: ReadonlyMap<CompId, ReadonlyMap<string, number>>;
  /** `/my` 디렉터리(팔로우할 수 있는 팀 · 선수) */
  directory: MyDirectory;
  /** 등록 선수(설정 순서) + 상태 */
  players: ReadonlyArray<{
    slug: string;
    position: string;
    team: string;
    active: boolean;
    comp: string;
    state: "linked" | OnboardingPlayerState;
  }>;
}

/** 팔로우할 팀을 고르는 리그 — UCL은 리그가 아니다(팀은 각자 리그에 있다) */
const NOT_A_LEAGUE: ReadonlySet<CompId> = new Set<CompId>(["UCL"]);

export function buildOnboardingData(
  input: OnboardingDataInput,
): OnboardingData {
  const krTeams = new Set(
    input.players
      .filter((p) => p.active && p.comp !== "OTHER")
      .map((p) => p.team),
  );
  const leagues: OnboardingLeague[] = input.competitions
    .filter((c) => !NOT_A_LEAGUE.has(c.id))
    .map((c) => {
      const pos = input.standings.get(c.id) ?? new Map<string, number>();
      const teams: OnboardingTeam[] = Object.entries(input.directory.teams)
        .filter(([slug]) => input.teamComp.get(slug) === c.id)
        .map(([slug, e]) => ({
          k: slug,
          n: e.n,
          ...(e.l ? { l: e.l } : {}),
          s: e.s,
          ...(e.c ? { c: e.c } : {}),
          p: pos.get(slug) ?? null,
          ...(krTeams.has(slug) ? { kr: 1 as const } : {}),
        }))
        .sort(
          (a, b) =>
            (a.p ?? Number.MAX_SAFE_INTEGER) -
              (b.p ?? Number.MAX_SAFE_INTEGER) || a.n.localeCompare(b.n, "ko"),
        );
      return { id: c.id, n: c.nameKo, s: c.shortKo, t: teams };
    });
  const players: OnboardingPlayer[] = input.players.flatMap((p) => {
    const entry = Object.prototype.hasOwnProperty.call(
      input.directory.players,
      p.slug,
    )
      ? input.directory.players[p.slug]
      : undefined;
    if (!entry) return [];
    return [
      {
        k: p.slug,
        n: entry.n,
        pos: p.position,
        t: entry.t,
        ...(entry.tl ? { tl: entry.tl } : {}),
        ...(p.state !== "linked" ? { st: p.state } : {}),
      },
    ];
  });
  return { v: ONBOARDING_DATA_VERSION, l: leagues, p: players };
}
