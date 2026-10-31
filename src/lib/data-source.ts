/**
 * 데이터 출처 줄 규칙 (PRD FR-45 · D27, plan M2-16) — 대회·팀·홈 위젯·`/tonight`이 같은 규칙을 쓴다.
 *
 * I/O 없는 순수 함수만 둔다(그리기는 src/components/data-source.tsx). 지금 시각은 호출부가 넣는다(빌드 시각 — 테스트는 고정 값).
 * - 갱신 시각: 화면이 읽은 대회 데이터 파일(`data/competitions/*.json` `updatedAt`) 가운데 **가장 오래된 것** — 여러 파일을 쓰는 화면
 *   (팀 = 그 팀이 뛰는 대회들, 홈 위젯·`/tonight` = 6개 대회)에서 가장 늦게 갱신된 자료가 화면 전체의 신선도다.
 * - 업데이트 지연: 그 시각이 빌드 시각보다 `DATA_STALE_HOURS`(36시간) 이상 오래됐으면. 하루 1회 갱신이라 정상이면 24시간 안쪽이고, 한 번
 *   거르면 약 48시간이 된다(실패 시 전일 파일 유지 — M2-02·M2-09). 36시간은 그 사이 — 발행이 조금 늦은 날을 지연으로 보지 않는다.
 * - API-Football 병기: API-Football 데이터(득점자·라인업 — 팀시트·포메이션)를 실은 화면만(FR-45 — 권장). football-data 필수 문구는
 *   모든 출처 줄에 영문 원문 그대로(`FOOTBALL_DATA_ATTRIBUTION`, 약관 7.1).
 */
import { parseUtcIso } from "@/lib/time";

/** `updatedAt`이 빌드 시각보다 이만큼 이상 오래되면 "업데이트 지연"(머리 주석) */
export const DATA_STALE_HOURS = 36;

/** 데이터가 지연됐는가(빌드 시각 기준) */
export function isDataStale(updatedAt: string, nowMs: number): boolean {
  return (
    nowMs - parseUtcIso(updatedAt).getTime() >=
    DATA_STALE_HOURS * 60 * 60 * 1000
  );
}

/** 가장 오래된 갱신 시각(UTC ISO) — 값이 하나도 없으면 null. 시각 비교는 파싱한 값으로(문자열 형식 차이에 기대지 않는다) */
export function oldestUpdatedAt(
  values: Iterable<string | null | undefined>,
): string | null {
  let oldest: { iso: string; ms: number } | null = null;
  for (const iso of values) {
    if (!iso) continue;
    const ms = parseUtcIso(iso).getTime();
    if (oldest === null || ms < oldest.ms) oldest = { iso, ms };
  }
  return oldest?.iso ?? null;
}

export interface DataSourceView {
  /** 출처 줄에 적을 갱신 시각(가장 오래된 파일) — 읽은 파일이 없으면 null(시각 없이 출처만) */
  updatedAt: string | null;
  /** "업데이트 지연" */
  stale: boolean;
}

/** 화면이 읽은 파일들의 `updatedAt` → 출처 줄 값(머리 주석 규칙) */
export function dataSourceOf(
  updatedAts: Iterable<string | null | undefined>,
  nowMs: number,
): DataSourceView {
  const updatedAt = oldestUpdatedAt(updatedAts);
  return {
    updatedAt,
    stale: updatedAt !== null && isDataStale(updatedAt, nowMs),
  };
}
