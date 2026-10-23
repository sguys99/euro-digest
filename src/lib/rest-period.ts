/**
 * 휴식기(비시즌·A매치 기간) 판정 — 발행 검증 게이트의 카드 수 하한(scripts/lib/publish-gate.ts ⑤)과 홈 5줄 블록의 비시즌 빈 상태
 * (DESIGN §9.3 상태 화면 ②, PRD DR-07, plan M1-37)가 같은 규칙을 쓴다. 빌드(화면)에서도 쓰려고 scripts/에서 옮겼다(M1-25 이월 메모).
 * I/O 없는 순수 함수만 둔다. 입력은 스키마를 통과한 configs 값.
 *
 * - 비시즌 = 그날(KST 발행일)이 `configs/competitions.json` **모든** 대회의 [startDate, endDate] 밖(부록 A '비시즌 판단' 필드).
 * - A매치 기간 = `configs/national-team.json` 경기일(킥오프 KST 날짜) ±3일(FR-71 — 파일은 M3-05에서 생긴다). 근거 파일이 없으면 판정하지
 *   않는다(평시) — 화면은 A매치 휴식기 문구를 쓰지 않는다(근거 없는 안내 금지, CLAUDE §1-7).
 */
import type { CompetitionsFile, NationalTeamFile } from "@/lib/schema/configs";
import { kstDate, shiftDate } from "@/lib/time";

/** A매치 기간 = 경기일 ±3일(FR-71) */
export const NATIONAL_WINDOW_DAYS = 3;

export type RestReason = "off-season" | "international-window";

export interface RestPeriod {
  /** 휴식기 사유(없으면 평시) */
  reasons: RestReason[];
  /** 판정 근거(사람이 읽는 짧은 문구) */
  basis: string[];
}

/**
 * 발행일(KST 날짜)의 휴식기 판정. 비시즌: 대회가 하나 이상 있고 모든 대회가 그날 시즌 밖(startDate 전 또는 endDate 뒤).
 * A매치 기간: 경기일(킥오프 KST 날짜) ±3일 안.
 */
export function restPeriodOf(
  date: string,
  configs: { competitions?: CompetitionsFile; nationalTeam?: NationalTeamFile },
): RestPeriod {
  const reasons: RestReason[] = [];
  const basis: string[] = [];
  const { competitions, nationalTeam } = configs;
  if (!competitions || competitions.length === 0) {
    basis.push("competitions.json 없음 — 시즌 판정 불가");
  } else {
    const inSeason = competitions.filter(
      (c) => c.startDate <= date && date <= c.endDate,
    );
    if (inSeason.length === 0) {
      reasons.push("off-season");
      basis.push("비시즌(모든 대회 시즌 밖)");
    } else {
      basis.push(`시즌 중(${inSeason.map((c) => c.id).join("·")})`);
    }
  }
  if (!nationalTeam) {
    basis.push("national-team.json 없음 — A매치 기간 판정 안 함");
  } else {
    const match = nationalTeam.matches.find((m) => {
      const day = kstDate(m.kickoff);
      return (
        shiftDate(day, -NATIONAL_WINDOW_DAYS) <= date &&
        date <= shiftDate(day, NATIONAL_WINDOW_DAYS)
      );
    });
    if (match) {
      reasons.push("international-window");
      basis.push(`A매치 기간(${match.id} ±${NATIONAL_WINDOW_DAYS}일)`);
    } else {
      basis.push("A매치 기간 아님");
    }
  }
  return { reasons, basis };
}

/** 비시즌 빈 상태에 싣는 대회 하나와 그 날짜(설정 실값) */
export interface OffSeasonFeature {
  comp: CompetitionsFile[number];
  /** `upcoming` = 아직 개막 전(startDate) · `ended` = 시즌 끝(endDate) */
  phase: "upcoming" | "ended";
  /** 표시할 날짜 "YYYY-MM-DD" — upcoming이면 startDate, ended면 endDate */
  date: string;
}

/**
 * 비시즌 빈 상태(DESIGN §9.3 상태 화면 ② — 평탄 탭 + 시즌명 + 날짜)에 실을 대회. 그날이 비시즌(`restPeriodOf` off-season)이 아니면 null.
 * - 개막 전인 대회가 있으면 **가장 먼저 개막하는 대회**(startDate가 가장 이른 것) — 다음 일정이 가장 쓸모 있는 사실이다.
 * - 모두 끝났으면 **가장 늦게 끝난 대회**(endDate가 가장 늦은 것 — 시즌 전체가 끝난 날).
 * 같은 날짜는 설정 파일 순서. 날짜는 설정 값 그대로(만들어 내지 않는다 — 다음 시즌 날짜는 `/new-season`이 설정을 바꾼 뒤에만 나온다).
 */
export function offSeasonFeature(
  date: string,
  competitions: CompetitionsFile,
): OffSeasonFeature | null {
  if (!restPeriodOf(date, { competitions }).reasons.includes("off-season")) {
    return null;
  }
  const upcoming = competitions.filter((c) => date < c.startDate);
  if (upcoming.length > 0) {
    const comp = upcoming.reduce((a, b) => (b.startDate < a.startDate ? b : a));
    return { comp, phase: "upcoming", date: comp.startDate };
  }
  const comp = competitions.reduce((a, b) => (b.endDate > a.endDate ? b : a));
  return { comp, phase: "ended", date: comp.endDate };
}

/** 시즌 이름 "2026-27 시즌"(시즌 시작 연도 → 끝 연도 두 자리) */
export function seasonLabel(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, "0")} 시즌`;
}
