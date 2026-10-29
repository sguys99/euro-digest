/**
 * 브리핑 결과 보충 · 결과 지연 판정 (PRD §15 D60, 2026-10-25 사용자 결정 — 10-25 호 사건) — I/O 없는 순수 함수만 둔다.
 *
 * 사건: 10-25 08:42 KST 수집에서 football-data `/matches`가 브리핑 창(UTC 10-24) 대상 대회 19경기를 킥오프 10시간 뒤에도
 * IN_PLAY 5 · TIMED 14로 줬다 → 종료 경기 0 → mode `empty` → 홈에 "전날 6개 대회에 끝난 경기가 없었습니다"가 게시됐다(사실과 다름 —
 * CLAUDE.md §1-7). 같은 실행의 API-Football은 19경기 상세를 모두 받았다(`brief-ready complete details 19`).
 *
 * ① 보충(`supplementBriefResults`): football-data가 결과를 기다리는 상태(awaiting — providers/football-data.ts `unsettledStateOf`)로
 *    준 창 안 경기를 **같은 실행(또는 원장 data/matches)에서 이미 받은** API-Football 종료 상세(FT·AET·PEN)로 채운다 — 추가 API 호출·
 *    LLM 비용 0. API-Football 계획(api-football-plan.ts)은 football-data와 무관하게 브리핑 창의 6개 대회 종료 경기를 brief 계층으로
 *    먼저 받으므로 보충 대상 경기의 단건 조회는 이미 잡혀 있다.
 *    - 연결: team-ids.ts `linkPendingMatches` — `linkMatchDetails`(D33·D37) 규칙을 football-data 점수 없이 적용(두 팀 대응표 확인
 *      `team-ids` · 한쪽 팀 대응표 확인 + 다른 쪽 어긋나지 않음 + 후보 하나 `evidence`) + 대응표가 확인한 쪽의 팀 이름 교차 확인
 *      (`teamNamesAgree` — 사전 팀 항목 `teamDictionaryKey` 우선, 대응표 항목 오류 방어). 이미 football-data 종료 경기에 연결된 af
 *      경기는 다시 쓰지 않는다.
 *    - 스코어: providers/api-football.ts `afResultScore` — football-data FINISHED 결과와 같은 내부 형식(정규·연장·승부차기 — match-data.ts
 *      스코어 규칙). 경기 id·팀 표기·라운드는 football-data 그대로라 브리핑 근거 id(`m<football-data id>`)·대회 계산(D58)·검사기 스코어
 *      대조(brief-check.ts — 입력 사실이면 출처 무관)가 지금 규칙 그대로 돈다. 득점자는 연결한 같은 상세에서(`goalsComplete`일 때만).
 *    - 순위: 보충 경기가 있는 대회는 football-data 순위표에 그 결과가 아직 없다 → 그 대회 순위는 입력에 넣지 않는다(`unsettledComps` —
 *      brief-input.ts. 결과를 기다리는 경기가 남은 대회도 같다).
 * ② 결과 지연(`briefEmptyReason`): 보충 뒤에도 입력 경기가 0인데 창 안에 결과를 기다리는 football-data 경기가 있거나 API-Football
 *    종료 상세가 있으면 `results-pending`, 정말로 끝난 경기가 없으면 `no-matches`. 브리핑 파일 `emptyReason`(src/lib/schema/brief.ts)이
 *    화면 문구를 가른다 — S4 "끝난 경기가 없었습니다"는 `no-matches`일 때만(사실만).
 *    - football-data 범위 밖 단계(D60 이월 — M2-01, 2026-10-30 확인): football-data 무료 플랜은 UCL 예선·플레이오프 단계(7~8월)와
 *      리그 강등 플레이오프(분데스 강등 PO·리그1 바라주)를 주지 않는다 — UCL 2026 시즌이 리그 페이즈 첫날(09-08)부터이고
 *      2026-07-07~16(1차 예선)·08-18~27(플레이오프) 경기 조회가 0건, BL1·FL1 지난 시즌 끝 날짜가 정규 라운드 마지막 날
 *      (BL1 2026-05-16·FL1 2025-05-18). 그 단계의 API-Football 경기는 결과 지연의 근거가 아니라 범위 밖이므로 세지 않는다
 *      (`afRoundInFdScope`). 그러지 않으면 예선 기간 내내 매일 결과 지연('5줄을 싣지 못했어요')으로 판정된다.
 */
import type { BriefEmptyReason, CompId } from "@/lib/schema";

import type { FinishedMatch, MatchDetail, UnsettledMatch } from "./match-data";
import { lookupName, TEAM_KINDS, type NameIndex } from "./names";
import { afResultScore } from "./providers/api-football";
import {
  linkPendingMatches,
  type MatchLinkSource,
  type PendingUnlinkedReason,
  type TeamIdIndex,
} from "./team-ids";

/**
 * football-data 미종료 경기 + 연결한 API-Football 상세 → 보충 종료 결과(순수 함수). 경기 id·대회·킥오프·라운드·팀은 football-data,
 * 스코어는 API-Football(`afResultScore`). 스코어를 football-data 형식으로 만들 수 없으면 null.
 */
export function toSupplementedResult(
  fd: UnsettledMatch,
  af: Pick<MatchDetail, "matchId" | "status" | "score">,
): FinishedMatch | null {
  const score = afResultScore(af);
  if (score === null) return null;
  return {
    provider: "football-data",
    matchId: fd.matchId,
    comp: fd.comp,
    kickoff: fd.kickoff,
    matchday: fd.matchday,
    stage: fd.stage,
    home: { ...fd.home },
    away: { ...fd.away },
    score,
    supplementedFrom: af.matchId,
  };
}

export interface BriefSupplement {
  /** 보충한 종료 결과(킥오프·id 순) */
  results: FinishedMatch[];
  /** football-data 경기 id → 보충에 쓴 API-Football 상세(득점자 연결에도 쓴다 — brief-input.ts `linked`) */
  linked: Map<number, MatchDetail>;
  /** 연결 근거별 보충 수 */
  by: Record<MatchLinkSource, number>;
  /** 연결하지 않은 awaiting 경기 `fd↔af:이유`(af를 하나로 좁히지 못했으면 `fd:이유`) */
  unlinked: string[];
  /** 같은 칸에 API-Football 종료 상세가 없는 awaiting 경기 수 */
  noCandidate: number;
  /** 연결은 됐지만 스코어를 football-data 형식으로 만들지 못한 경기 `fd↔af` */
  invalidScore: string[];
  /** 보충 뒤에도 결과를 기다리는 창 안 football-data 경기 수(awaiting − 보충) */
  awaiting: number;
  /** 결과를 기다리는(보충했든 안 했든) 경기가 있는 대회 — football-data 순위표가 확정이 아니다(brief-input.ts `unsettledComps`) */
  unsettledComps: Set<CompId>;
}

export interface SupplementInput {
  /** football-data 창 안 미종료·결과 없는 경기(FootballDataBriefData.unsettled) */
  unsettled: readonly UnsettledMatch[];
  /** API-Football 종료 상세 — 이번 실행 브리핑 몫 + 원장의 같은 창 항목(brief-input.ts `mergeBriefDetails`) */
  details: readonly MatchDetail[];
  /** 이미 football-data 종료 경기에 연결된 af 경기 id */
  usedAf: ReadonlySet<number>;
  index: TeamIdIndex;
  /** 한쪽 팀 확인 연결 — 대응표를 읽지 못했으면 false */
  autoLink: boolean;
  /** 이름 교차 확인용 사전 팀 키(`teamDictionaryKey`) — 사전을 읽지 못했으면 없음(이름 정규화만) */
  dictionaryKey?: (name: string) => string | null;
}

/**
 * 고유명사 사전(configs/names.ko.json)의 팀 항목 → 이름 교차 확인 키(team-ids.ts `teamNamesAgree`). 같은 항목이면 같은 키
 * (`team:<slug>` — slug가 없으면 한글 표기), 사전에 없는 이름은 null. 순수 함수.
 */
export function teamDictionaryKey(
  index: NameIndex,
): (name: string) => string | null {
  return (name) => {
    const entry = lookupName(index, name, TEAM_KINDS);
    return entry ? `${entry.kind}:${entry.slug ?? entry.ko}` : null;
  };
}

/**
 * 보충(순수 함수) — 머리 주석 ①. void 경기(연기·취소·중단·몰수)는 보충하지 않고 결과 지연으로도 세지 않는다.
 */
export function supplementBriefResults(
  input: SupplementInput,
): BriefSupplement {
  const awaiting = input.unsettled.filter((m) => m.state === "awaiting");
  const unsettledComps = new Set(awaiting.map((m) => m.comp));
  const linked = linkPendingMatches(awaiting, input.details, input.index, {
    excludeAf: input.usedAf,
    autoLink: input.autoLink,
    ...(input.dictionaryKey ? { dictionaryKey: input.dictionaryKey } : {}),
  });
  const results: FinishedMatch[] = [];
  const byFd = new Map<number, MatchDetail>();
  const by: Record<MatchLinkSource, number> = { "team-ids": 0, evidence: 0 };
  const invalidScore: string[] = [];
  for (const link of linked.links) {
    const result = toSupplementedResult(link.fd, link.af);
    if (result === null) {
      invalidScore.push(`${link.fd.matchId}↔${link.af.matchId}`);
      continue;
    }
    results.push(result);
    byFd.set(link.fd.matchId, link.af);
    by[link.linkedBy] += 1;
  }
  const label = (u: {
    fdMatchId: number;
    afMatchId: number | null;
    reason: PendingUnlinkedReason;
  }) =>
    u.afMatchId === null
      ? `${u.fdMatchId}:${u.reason}`
      : `${u.fdMatchId}↔${u.afMatchId}:${u.reason}`;
  return {
    results,
    linked: byFd,
    by,
    unlinked: linked.unlinked.map(label),
    noCandidate: linked.noCandidate.length,
    invalidScore,
    awaiting: awaiting.length - results.length,
    unsettledComps,
  };
}

/** UCL 예선 단계 라운드 원문 — "Preliminary Round"·"1st Qualifying Round"… (API-Football) */
const AF_QUALIFYING_ROUND = /\b(?:qualifying|preliminary)\b/i;
/** UCL 예선 플레이오프 라운드 원문 "Play-offs" — 녹아웃 플레이오프("Knockout Round Play-offs")와 구별해 전체 일치만 */
const AF_QUALIFYING_PLAYOFF_ROUND = /^\s*play-?offs?\s*$/i;
/** 리그 정규 라운드 원문 "Regular Season - 8" — football-data는 리그를 REGULAR_SEASON 단계로만 준다 */
const AF_REGULAR_SEASON_ROUND = /^\s*regular season\b/i;

/**
 * API-Football 경기 라운드가 football-data 무료 플랜이 주는 단계인가(순수 함수 — 머리 주석 ②, D60 이월).
 * - 리그(UCL 밖 5개): 정규 라운드("Regular Season - N")만 범위 안 — 강등 플레이오프 등 그 밖 라운드는 범위 밖.
 * - UCL: 예선("Preliminary Round"·"Nth Qualifying Round")·예선 플레이오프("Play-offs")는 범위 밖, 리그 페이즈·녹아웃
 *   ("Knockout Round Play-offs"·"Round of 16"…·"Final")은 범위 안.
 * - 라운드를 모르면(null·빈 문자열) 범위 안으로 본다 — 결과 지연을 놓쳐 "끝난 경기가 없었습니다"를 잘못 쓰지 않게(§1-7).
 * - 6개 대회 밖(comp null)은 false.
 */
export function afRoundInFdScope(
  d: Pick<MatchDetail, "comp" | "round">,
): boolean {
  if (d.comp === null) return false;
  const round = d.round?.trim() ?? "";
  if (round === "") return true;
  if (d.comp === "UCL") {
    return !(
      AF_QUALIFYING_ROUND.test(round) || AF_QUALIFYING_PLAYOFF_ROUND.test(round)
    );
  }
  return AF_REGULAR_SEASON_ROUND.test(round);
}

/** 창 [start, end) 안에 킥오프한 6개 대회 API-Football 종료 상세 */
function afDetailsInWindow<T extends Pick<MatchDetail, "comp" | "kickoff">>(
  details: readonly T[],
  window: { start: string; end: string },
): T[] {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  return details.filter((d) => {
    const at = Date.parse(d.kickoff);
    return d.comp !== null && at >= start && at < end;
  });
}

/**
 * 창 [start, end) 안에 킥오프한 6개 대회 API-Football 종료 상세 중 football-data 범위 안 단계(`afRoundInFdScope`)의 수 —
 * 결과 지연 판정 재료(football-data가 경기를 아예 모를 때). 범위 밖 단계(UCL 예선 등)는 세지 않는다(D60 이월).
 */
export function afFinishedInWindow(
  details: readonly Pick<MatchDetail, "comp" | "kickoff" | "round">[],
  window: { start: string; end: string },
): number {
  return afDetailsInWindow(details, window).filter(afRoundInFdScope).length;
}

/** 창 안 6개 대회 API-Football 종료 상세 중 football-data 범위 밖 단계의 수 — 관찰 로그용(`afOutOfFdScopeInWindow`) */
export function afOutOfFdScopeInWindow(
  details: readonly Pick<MatchDetail, "comp" | "kickoff" | "round">[],
  window: { start: string; end: string },
): number {
  return afDetailsInWindow(details, window).filter((d) => !afRoundInFdScope(d))
    .length;
}

/**
 * mode empty의 이유(순수 함수 — 머리 주석 ②). 입력 경기가 있으면 null(empty가 아니다). 입력 경기가 0일 때:
 * 창 안에 결과를 기다리는 football-data 경기(보충 뒤 남은 수)나 API-Football 종료 상세가 하나라도 있으면 `results-pending`
 * (경기는 있었다 — "끝난 경기가 없었습니다"는 사실이 아니다), 둘 다 없으면 `no-matches`.
 */
export function briefEmptyReason(input: {
  inputMatches: number;
  awaiting: number;
  afFinished: number;
}): BriefEmptyReason | null {
  if (input.inputMatches > 0) return null;
  return input.awaiting > 0 || input.afFinished > 0
    ? "results-pending"
    : "no-matches";
}
