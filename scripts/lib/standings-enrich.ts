/**
 * 순위표 보강 — 전일 대비 순위 변동(`prevPos`)·최근 5경기 폼(`form`) (M2-03, PRD FR-42). 모두 순수 함수다(시각은 인자로 받는다).
 *
 * 폼(`teamForms`·`enrichStandings`)
 *   - 재료 = **그 대회 파일의 경기만**(리그 파일은 리그 경기, UCL 파일은 UCL 경기 — 다른 대회 경기를 섞지 않는다). 종료(`finished`)이고
 *     스코어가 있는 경기만 센다(연기·취소 `postponed`, 예정·진행 중 `scheduled`, 스코어 없음은 뺀다 — 진행 중 경기는 순위표에는 반영돼
 *     있을 수 있지만(M2-02 `inProgress`) 결과가 아니라 폼에 넣지 않는다).
 *   - 순서 = 킥오프 오름차순 → 같은 시각이면 경기 id 순, 그중 **마지막 5경기**를 **오래된 → 최근**으로 둔다(최근이 오른쪽 — D1 시안
 *     `concept-mix` 폼 칩). 5경기보다 적게 치른 팀은 치른 만큼만(빈 칸을 채우지 않는다).
 *   - W/D/L = `score.h`·`score.a`(정규시간 + 연장, 승부차기 제외 — 부록 A Match.score) 비교. **승부차기(`pens`)로 끝난 경기는 D**다 —
 *     FIFA·UEFA 공식 기록은 승부차기로 가린 경기를 무승부로 집계한다(승부차기는 경기 결과가 아니라 다음 라운드 진출 팀을 정하는
 *     절차 — 득실·승패 통계에 넣지 않음). 연장 끝에 갈린 경기(`aet`만)는 스코어대로 W/L.
 *
 * 전일 대비 순위(`standingsBaseline`·`enrichStandings` — DECISIONS D1 §6 #4: 매일 수집 시각의 스냅숏끼리 비교)
 *   - 기준 순위 = 이전 파일(같은 대회·같은 시즌 — `usablePrevious`가 거른 값)에서 그 팀의 행:
 *     · 이전 파일의 `updatedAt`이 **이번 수집과 같은 KST 날짜**면 이전 파일의 `prevPos`를 이어받는다 — 같은 날 여러 번 받아도(백업
 *       실행·수동 재실행) 기준이 그날 첫 수집 직전 스냅숏에 고정되고 ▲▼가 0으로 지워지지 않는다.
 *     · **이전 KST 날짜**면 이전 파일의 `pos`(그때의 현재 순위)를 쓴다.
 *   - 첫 수집(이전 파일 없음)·시즌 전환(이전 파일 시즌이 다름 → null로 넘어옴)·이전 파일에 없는 팀(승격·대응표 변경)은 null.
 *   - KST 날짜는 `src/lib/time.ts` `kstDate`로만 잰다(KST에는 서머타임이 없어 유럽 서머타임 전환과 무관 — 수집 시각만 06:30 ↔ 07:10).
 *   - 알려진 한계: 파일의 시각은 `updatedAt` 하나라 순위만 새로 받고 다른 조각이 실패한 실행은 `updatedAt`이 이전 값으로 남는다
 *     (competition-file.ts). 그 파일을 같은 날 다시 받으면 '이전 날'로 보여 그날 첫 스냅숏이 기준이 된다(변동이 0으로 보일 수 있다).
 */
import type { CompetitionFile, Match, StandingRow } from "@/lib/schema";
import { kstDate } from "@/lib/time";

/** 폼 칸 수(FR-42 '최근 5경기') */
export const FORM_LENGTH = 5;

export type FormResult = StandingRow["form"][number];

/** 이 경기에서 그 팀의 결과 — 그 팀 경기가 아니거나 종료·스코어가 없으면 null. 승부차기 경기는 D(머리 주석) */
export function matchResultFor(
  match: Pick<Match, "home" | "away" | "score" | "status">,
  team: string,
): FormResult | null {
  if (match.status !== "finished" || match.score === null) return null;
  const side =
    match.home === team ? "home" : match.away === team ? "away" : null;
  if (side === null) return null;
  const own = side === "home" ? match.score.h : match.score.a;
  const opp = side === "home" ? match.score.a : match.score.h;
  return own > opp ? "W" : own < opp ? "L" : "D";
}

function byKickoff(a: Match, b: Match): number {
  const t = Date.parse(a.kickoff) - Date.parse(b.kickoff);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 대회 경기 → 팀 slug별 최근 5경기 폼(오래된 → 최근). 경기가 없는 팀은 키 없음 */
export function teamForms(
  matches: readonly Match[],
  length: number = FORM_LENGTH,
): Map<string, FormResult[]> {
  const out = new Map<string, FormResult[]>();
  const finished = matches
    .filter((m) => m.status === "finished" && m.score !== null)
    .sort(byKickoff);
  for (const m of finished) {
    for (const team of [m.home, m.away]) {
      const r = matchResultFor(m, team);
      if (r === null) continue;
      const list = out.get(team) ?? [];
      list.push(r);
      out.set(team, list);
    }
  }
  for (const [team, list] of out) {
    if (list.length > length) out.set(team, list.slice(list.length - length));
  }
  return out;
}

/**
 * 이번 수집(`at`, UTC ISO)의 '전일' 기준 순위 — 팀 slug → 기준 순위(null = 기준 없음). 이전 파일이 없으면 빈 표(모든 팀 null).
 * 규칙은 머리 주석(같은 KST 날짜 → 이전 `prevPos` 이어받기, 이전 날 → 이전 `pos`).
 */
export function standingsBaseline(
  previous: Pick<CompetitionFile, "updatedAt" | "standings"> | null,
  at: string,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (previous === null) return out;
  const sameDay = kstDate(previous.updatedAt) === kstDate(at);
  for (const row of previous.standings) {
    out.set(row.team, sameDay ? row.prevPos : row.pos);
  }
  return out;
}

export interface EnrichStandingsInput {
  /** 이번에 받은 순위 행(순서·숫자는 바꾸지 않는다) */
  rows: readonly StandingRow[];
  /** 이전 파일 — 같은 대회·같은 시즌일 때만(아니면 null — competition-file.ts `usablePrevious`) */
  previous: CompetitionFile | null;
  /** 이번 파일에 실릴 경기 목록(그 대회 경기만) */
  matches: readonly Match[];
  /** 이번 수집 시각(UTC ISO) — 같은 KST 날짜 판정 */
  fetchedAt: string;
}

/** 순위 행에 prevPos·form을 채운다(머리 주석). 행 순서·팀·숫자·구간은 그대로 */
export function enrichStandings(input: EnrichStandingsInput): StandingRow[] {
  const baseline = standingsBaseline(input.previous, input.fetchedAt);
  const forms = teamForms(input.matches);
  return input.rows.map((row) => ({
    ...row,
    prevPos: baseline.get(row.team) ?? null,
    form: forms.get(row.team) ?? [],
  }));
}

/**
 * 이미 받은 대회 파일을 API 호출 없이 다시 보강한다(폼 규칙이 바뀌었거나 보강 전 파일 — M2-03 첫 적용). 이전 파일 = 자기 자신,
 * 수집 시각 = 자기 `updatedAt`이라 같은 날 규칙으로 `prevPos`는 그대로 남고 폼만 다시 계산한다. `updatedAt`은 바꾸지 않는다.
 */
export function reenrichCompetitionFile(
  file: CompetitionFile,
): CompetitionFile {
  return {
    ...file,
    standings: enrichStandings({
      rows: file.standings,
      previous: file,
      matches: file.matches,
      fetchedAt: file.updatedAt,
    }),
  };
}
