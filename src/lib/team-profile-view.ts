/**
 * 팀 한줄평 · 강점/약점 화면 모델 (PRD FR-53 · FR-56, §15 D64 ⑥, DESIGN §9.3 "문단 블록 · AI 라벨", plan M4-06 화면 부분)
 *
 * I/O 없는 순수 함수(지금 시각은 호출부가 넣는다 — 빌드 시각). 시각 표시는 src/lib/time.ts만 쓴다(CLAUDE §8).
 *
 * 규칙(근거)
 * - **표시 조건**: `data/teams/*.json`의 `profile`이 있을 때만(null이면 블록 전체를 숨긴다 — 자리 상자 없음, DECISIONS D2 §8 #8).
 *   한줄평이 비었거나 강점·약점이 2개씩이 아니면(스키마가 막지만 화면도 지어내지 않는다) 숨긴다.
 * - **AI 표시**: 팀 프로필은 템플릿 강등이 없다(실패 팀은 이전 값 유지 또는 null — plan M4-05) → 블록이 보이면 늘 LLM 문장이라 블록 머리에
 *   'AI 작성' 라벨 한 번 + 생성 날짜(D64 ⑥ — 줄마다 붙이지 않는다).
 * - **생성 날짜**: `generatedAt`을 KST "11.02 (월)"로. 실패 팀은 1~3주 전 값이 남을 수 있어(21일 안 유지 — M4-05) 7일 이상 지난 값이면
 *   "n주 전"을 덧붙인다(빌드 시각 기준). 지표는 생성 시점 기준이라 위 티켓 숫자(매일 갱신)와 다를 수 있음을 머리 줄에서 밝힌다.
 */
import { formatKst, parseUtcIso } from "@/lib/time";
import type { Team } from "@/lib/schema/team";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface TeamProfileView {
  oneLiner: string;
  strengths: readonly [string, string];
  weaknesses: readonly [string, string];
  /** UTC ISO(`<time datetime>`) */
  generatedAt: string;
  /** KST "11.02 (월)" */
  dateText: string;
  /** 생성 뒤 지난 주 수(7일 미만이면 null — "n주 전"을 붙이지 않는다) */
  weeksAgo: number | null;
}

/** 팀 파일 `profile` → 화면 모델. 숨길 때 null(머리 주석 '표시 조건') */
export function teamProfileView(
  profile: Team["profile"],
  nowMs: number,
): TeamProfileView | null {
  if (!profile) return null;
  const oneLiner = profile.oneLiner.trim();
  const strengths = profile.strengths.map((s) => s.trim());
  const weaknesses = profile.weaknesses.map((s) => s.trim());
  if (
    oneLiner === "" ||
    strengths.length !== 2 ||
    weaknesses.length !== 2 ||
    [...strengths, ...weaknesses].some((s) => s === "")
  ) {
    return null;
  }
  const age = nowMs - parseUtcIso(profile.generatedAt).getTime();
  const weeks = Math.floor(age / WEEK_MS);
  return {
    oneLiner,
    strengths: [strengths[0]!, strengths[1]!],
    weaknesses: [weaknesses[0]!, weaknesses[1]!],
    generatedAt: profile.generatedAt,
    dateText: formatKst(profile.generatedAt, "dayShort"),
    weeksAgo: weeks >= 1 ? weeks : null,
  };
}
