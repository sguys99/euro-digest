/**
 * 순위 → 순위표 구간 판정 (FR-42, M2-01) — I/O 없는 순수 함수. 화면(순위표·미니 위젯)과 파이프라인(StandingRow.zone 채우기, M2-02)이 함께 쓴다.
 *
 * 규칙은 `configs/competitions.json` 대회별 `zones`(ZoneRule — from~to 포함, 겹침 금지는 스키마가 검사)를 그대로 쓴다.
 * - 구간은 **순위 숫자**로 판정한다 — 동순위(예: 라리가 19위 2팀)는 같은 숫자라 같은 구간이다(D1 scope §5-6).
 * - 규칙 밖 순위는 `none`·라벨 null — 유럽 대항전(챔스·유로파·컨퍼런스) 진출 구간은 1차 출처가 확정되는 2027-03 전후에
 *   competitions.json에 추가한다(관행값 금지, plan §16). 규칙이 없으면 화면은 그 구간을 숨긴다(M2-11).
 * - 라벨은 규칙의 `label` 그대로 — 강등 플레이오프는 zone `relegation` + 라벨 "강등 PO"로 구별한다(색만으로 의미 전달 금지 — 텍스트 병기).
 */
import type { StandingZone, ZoneRule } from "@/lib/schema";

/** 순위 1개의 구간 판정 결과 */
export interface StandingZoneMark {
  zone: StandingZone;
  /** 텍스트 병기용 한국어 라벨(competitions.json `label`) — 구간 밖(`none`)이면 null */
  label: string | null;
}

/** 구간 밖 — 규칙에 걸리지 않는 순위 */
export const NO_ZONE: StandingZoneMark = Object.freeze({
  zone: "none",
  label: null,
});

/**
 * 순위 `pos`가 속한 구간과 라벨. 순위가 1 이상 정수가 아니면(데이터 오류) `none`.
 * 규칙끼리 겹치지 않는 것은 CompetitionConfigSchema가 보장하므로 첫 일치 규칙을 쓴다.
 */
export function standingZoneOf(
  pos: number,
  rules: readonly ZoneRule[],
): StandingZoneMark {
  if (!Number.isInteger(pos) || pos < 1) return NO_ZONE;
  const rule = rules.find((r) => pos >= r.from && pos <= r.to);
  return rule ? { zone: rule.zone, label: rule.label } : NO_ZONE;
}
