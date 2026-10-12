/**
 * 팀 id 대응표(`configs/team-ids.json`, PRD §15 D33 ⑤)와 두 데이터 API 경기 짝짓기 도우미 (M1-44 → M1-48·운영 리포트).
 *
 * football-data(fd)와 API-Football(af)은 팀 id 체계가 다르다(같은 숫자가 다른 팀 — M0 `idCollisions` 6건). 브리핑 입력의 경기
 * 결과(fd)에 득점자(af, M1-48)를 붙이려면 같은 경기를 찾아야 하고, 그 열쇠가 팀 slug → `{ fd, af }` 대응표다.
 *
 * 대응표에 없는 팀은 실행마다 **후보**를 만든다(`suggestTeamIdPairs`): 같은 대회 · 킥오프 ±5분 · 같은 최종 스코어(승부차기 제외 —
 * match-data.ts 스코어 규칙)인 af 경기가 **딱 1개**일 때만 그 경기의 홈↔홈·원정↔원정을 팀 쌍 후보로 낸다(D33 "후보 1개").
 * 이미 아는 대응은 후보를 고르는 데(같은 시각·같은 스코어 경기가 여럿일 때) 쓰고, 어긋나면 충돌로 따로 보고한다.
 * 후보는 사람이 확인해 team-ids.json에 넣는다(운영 리포트) — 이 모듈은 파일을 쓰지 않는다. 대응표에 없는 팀이 있어도
 * 실행은 계속되고, 그 경기는 득점자 없이 진행한다(D33).
 *
 * `linkMatchDetails`(M1-48): football-data 종료 경기(브리핑 입력의 결과·순위)와 API-Football 경기 상세(득점자·라인업)를 잇는다.
 * 경기 쌍은 `suggestTeamIdPairs`로 찾되, **두 팀 모두 대응표로 확인된 쌍만** 득점자를 붙일 연결(`links`)로 쓰고, 대응표에 없는
 * 팀이 낀 쌍은 `unconfirmed`로 따로 둔다(D33 "대응표에 없는 경기는 득점자 없이 진행"). 후보는 실행 로그로 남기고 운영 리포트
 * (M5-09)가 모아 보여 준다. 브리핑 입력에 득점자를 넣는 것은 M1-19·M1-48b.
 */
import {
  TeamIdsFileSchema,
  type CompId,
  type TeamIdEntry,
  type TeamIdsFile,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";
import type { FinishedMatch, MatchDetail, Score } from "./match-data";
import { matchDetailToPairing } from "./providers/api-football";

// ─── 대응표 ──────────────────────────────────────────────────────────────

/** `<rootDir>/configs/team-ids.json` 읽기(스키마 검증 — 형식 오류면 던진다) */
export async function loadTeamIds(rootDir: string): Promise<TeamIdsFile> {
  return readConfigFile(rootDir, "team-ids.json", TeamIdsFileSchema);
}

export interface TeamIdIndex {
  /** football-data 팀 id → slug */
  byFd: ReadonlyMap<number, string>;
  /** API-Football 팀 id → slug */
  byAf: ReadonlyMap<number, string>;
  /** slug → 항목 */
  bySlug: ReadonlyMap<string, TeamIdEntry>;
}

/** 대응표 → 조회 색인(스키마가 id 중복을 막으므로 한 id는 한 slug) */
export function buildTeamIdIndex(file: TeamIdsFile): TeamIdIndex {
  const byFd = new Map<number, string>();
  const byAf = new Map<number, string>();
  const bySlug = new Map<string, TeamIdEntry>();
  for (const [slug, entry] of Object.entries(file)) {
    bySlug.set(slug, entry);
    if (entry.fd !== null) byFd.set(entry.fd, slug);
    if (entry.af !== null) byAf.set(entry.af, slug);
  }
  return { byFd, byAf, bySlug };
}

/** 빈 색인 — 대응표가 없거나 읽지 못했을 때(실행은 계속) */
export const EMPTY_TEAM_ID_INDEX: TeamIdIndex = Object.freeze({
  byFd: new Map<number, string>(),
  byAf: new Map<number, string>(),
  bySlug: new Map<string, TeamIdEntry>(),
});

// ─── 짝짓기 ──────────────────────────────────────────────────────────────

/** 기본 킥오프 허용 차 — 두 API 모두 공식 일정 시각을 주므로 몇 분이면 충분하다 */
export const PAIRING_KICKOFF_TOLERANCE_MS = 5 * 60_000;

export interface PairingTeam {
  id: number;
  name: string;
}

/** 짝짓기 입력 — 두 API 어댑터의 내부 형식에서 이 모양만 뽑아 넣는다(FinishedMatch는 그대로 들어간다) */
export interface PairingMatch {
  matchId: number;
  comp: CompId;
  /** 킥오프(UTC ISO) */
  kickoff: string;
  home: PairingTeam;
  away: PairingTeam;
  /** 종료 경기의 최종 스코어(승부차기 제외). 종료 전·모름이면 null — 짝짓기에 쓰지 않는다 */
  ft: Score | null;
}

export interface MatchPairEvidence {
  fdMatchId: number;
  afMatchId: number;
  comp: CompId;
  kickoff: string;
}

export interface TeamPairCandidate {
  fd: PairingTeam;
  af: PairingTeam;
  /**
   * new = 두 id 모두 대응표에 없음(새 slug 필요) · fill-af = fd가 있는 항목의 af가 null · fill-fd = af가 있는 항목의 fd가 null
   */
  kind: "new" | "fill-af" | "fill-fd";
  /** fill-* 이면 채울 항목의 slug */
  slug: string | null;
  /** 근거 경기 쌍(킥오프 순) */
  evidence: MatchPairEvidence[];
}

export interface TeamPairConflict {
  fd: PairingTeam;
  af: PairingTeam;
  /**
   * table = 경기 쌍이 대응표와 어긋남(대응표 오류 가능성) · candidates = 같은 fd(또는 af) 팀에 서로 다른 후보가 나옴
   */
  kind: "table" | "candidates";
  detail: string;
  evidence: MatchPairEvidence[];
}

export interface PairingReport {
  /** 짝을 찾은 경기(fd 킥오프 순) — 대응표에 없는 팀이 끼어 있어도 경기는 짝지어진다 */
  matchPairs: MatchPairEvidence[];
  /** 대응표에 더할 팀 쌍 후보(사람 확인 대상) */
  candidates: TeamPairCandidate[];
  /** 대응표와 어긋나거나 후보끼리 어긋나는 쌍 — 후보로 내지 않는다 */
  conflicts: TeamPairConflict[];
  /** 같은 대회·시각·스코어 af 경기가 2개 이상이라 고르지 못한 fd 경기 id */
  ambiguous: number[];
  /** 짝이 될 af 경기가 없는 fd 종료 경기 id(af 쪽 미수집·대상 밖 등) */
  unmatched: number[];
}

export interface PairingOptions {
  /** 킥오프 허용 차(ms) — 기본 5분 */
  kickoffToleranceMs?: number;
}

function sameScore(a: Score, b: Score): boolean {
  return a.home === b.home && a.away === b.away;
}

/** 한 쪽 팀 쌍이 대응표와 어긋나지 않는가(모르는 쪽은 어긋나지 않는다고 본다) */
function sideConsistent(
  fdTeamId: number,
  afTeamId: number,
  index: TeamIdIndex,
): boolean {
  const fdSlug = index.byFd.get(fdTeamId);
  const afSlug = index.byAf.get(afTeamId);
  if (fdSlug !== undefined && afSlug !== undefined) return fdSlug === afSlug;
  // 한쪽만 아는 경우 — 그 항목의 다른 쪽 id가 비어 있어야(채울 자리) 어긋나지 않는다
  if (fdSlug !== undefined) return index.bySlug.get(fdSlug)?.af === null;
  if (afSlug !== undefined) return index.bySlug.get(afSlug)?.fd === null;
  return true;
}

function matchConsistent(
  fd: PairingMatch,
  af: PairingMatch,
  index: TeamIdIndex,
): boolean {
  return (
    sideConsistent(fd.home.id, af.home.id, index) &&
    sideConsistent(fd.away.id, af.away.id, index)
  );
}

function pairKey(fdId: number, afId: number): string {
  return `${fdId}:${afId}`;
}

/**
 * fd 종료 경기와 af 종료 경기를 대회 · 킥오프(±허용 차) · 최종 스코어로 맞춰 경기 쌍과 팀 id 대응 후보를 낸다(순수 함수).
 *
 * - 후보 af 경기가 여럿이면 대응표와 어긋나지 않는 것만 남긴다. 그래도 2개 이상이면 `ambiguous`(추측하지 않는다).
 * - 후보가 1개인데 대응표와 어긋나면 경기는 짝짓지 않고 `conflicts`(table)로 보고한다.
 * - 팀 쌍: 대응표가 이미 같은 쌍을 알면 건너뛰고, 모르는 쪽만 후보로 낸다. 같은 fd 팀(또는 af 팀)에 서로 다른 후보가 나오면
 *   후보로 내지 않고 `conflicts`(candidates)로 보고한다.
 * 입력 순서와 무관하게 결과는 결정적이다(킥오프·id 순).
 */
export function suggestTeamIdPairs(
  fdMatches: readonly PairingMatch[],
  afMatches: readonly PairingMatch[],
  index: TeamIdIndex = EMPTY_TEAM_ID_INDEX,
  options: PairingOptions = {},
): PairingReport {
  const tolerance = options.kickoffToleranceMs ?? PAIRING_KICKOFF_TOLERANCE_MS;
  const byKickoff = (a: PairingMatch, b: PairingMatch) =>
    Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId;
  const afByComp = new Map<CompId, PairingMatch[]>();
  for (const af of [...afMatches].sort(byKickoff)) {
    if (af.ft === null) continue;
    const list = afByComp.get(af.comp) ?? [];
    list.push(af);
    afByComp.set(af.comp, list);
  }

  const report: PairingReport = {
    matchPairs: [],
    candidates: [],
    conflicts: [],
    ambiguous: [],
    unmatched: [],
  };
  const usedAf = new Set<number>();
  /** 팀 쌍 → 근거 */
  const teamPairs = new Map<
    string,
    { fd: PairingTeam; af: PairingTeam; evidence: MatchPairEvidence[] }
  >();

  for (const fd of [...fdMatches].sort(byKickoff)) {
    const ft = fd.ft;
    if (ft === null) continue;
    const fdMs = Date.parse(fd.kickoff);
    const raw = (afByComp.get(fd.comp) ?? []).filter(
      (af) =>
        !usedAf.has(af.matchId) &&
        af.ft !== null &&
        sameScore(af.ft, ft) &&
        Math.abs(Date.parse(af.kickoff) - fdMs) <= tolerance,
    );
    if (raw.length === 0) {
      report.unmatched.push(fd.matchId);
      continue;
    }
    const consistent = raw.filter((af) => matchConsistent(fd, af, index));
    if (consistent.length > 1) {
      report.ambiguous.push(fd.matchId);
      continue;
    }
    const evidenceOf = (af: PairingMatch): MatchPairEvidence => ({
      fdMatchId: fd.matchId,
      afMatchId: af.matchId,
      comp: fd.comp,
      kickoff: fd.kickoff,
    });
    if (consistent.length === 0) {
      if (raw.length === 1) {
        const af = raw[0]!;
        report.conflicts.push({
          fd: fd.home,
          af: af.home,
          kind: "table",
          detail: `경기 ${fd.matchId}↔${af.matchId}(대회·킥오프·스코어 일치)가 team-ids.json 대응과 어긋남 — 원정 ${fd.away.name}(${fd.away.id})↔${af.away.name}(${af.away.id})`,
          evidence: [evidenceOf(af)],
        });
      } else {
        report.ambiguous.push(fd.matchId);
      }
      continue;
    }
    const af = consistent[0]!;
    usedAf.add(af.matchId);
    const evidence = evidenceOf(af);
    report.matchPairs.push(evidence);
    for (const [fdTeam, afTeam] of [
      [fd.home, af.home],
      [fd.away, af.away],
    ] as const) {
      const key = pairKey(fdTeam.id, afTeam.id);
      const entry = teamPairs.get(key) ?? {
        fd: fdTeam,
        af: afTeam,
        evidence: [],
      };
      entry.evidence.push(evidence);
      teamPairs.set(key, entry);
    }
  }

  // 같은 fd 팀(또는 af 팀)에 다른 짝이 나오면 그 팀의 후보는 모두 충돌
  const afCountByFd = new Map<number, number>();
  const fdCountByAf = new Map<number, number>();
  for (const pair of teamPairs.values()) {
    afCountByFd.set(pair.fd.id, (afCountByFd.get(pair.fd.id) ?? 0) + 1);
    fdCountByAf.set(pair.af.id, (fdCountByAf.get(pair.af.id) ?? 0) + 1);
  }
  for (const pair of teamPairs.values()) {
    const fdSlug = index.byFd.get(pair.fd.id);
    const afSlug = index.byAf.get(pair.af.id);
    if (fdSlug !== undefined && fdSlug === afSlug) continue; // 이미 아는 대응
    if (
      (afCountByFd.get(pair.fd.id) ?? 0) > 1 ||
      (fdCountByAf.get(pair.af.id) ?? 0) > 1
    ) {
      report.conflicts.push({
        fd: pair.fd,
        af: pair.af,
        kind: "candidates",
        detail: `fd ${pair.fd.name}(${pair.fd.id}) 또는 af ${pair.af.name}(${pair.af.id})에 서로 다른 짝 후보가 있음`,
        evidence: pair.evidence,
      });
      continue;
    }
    // 경기 단위에서 대응표와 어긋나는 쌍은 이미 걸렀다 — 여기 오는 쌍은 모르는 쪽을 채우는 후보다
    if (fdSlug !== undefined) {
      report.candidates.push({
        ...pair,
        kind: "fill-af",
        slug: fdSlug,
      });
    } else if (afSlug !== undefined) {
      report.candidates.push({
        ...pair,
        kind: "fill-fd",
        slug: afSlug,
      });
    } else {
      report.candidates.push({ ...pair, kind: "new", slug: null });
    }
  }
  const byEvidence = (
    a: { evidence: MatchPairEvidence[]; fd: PairingTeam },
    b: { evidence: MatchPairEvidence[]; fd: PairingTeam },
  ) =>
    Date.parse(a.evidence[0]!.kickoff) - Date.parse(b.evidence[0]!.kickoff) ||
    a.evidence[0]!.fdMatchId - b.evidence[0]!.fdMatchId ||
    a.fd.id - b.fd.id;
  report.candidates.sort(byEvidence);
  report.conflicts.sort(byEvidence);
  return report;
}

// ─── 경기 상세 연결 (M1-48) ─────────────────────────────────────────────

export interface MatchLink {
  fd: FinishedMatch;
  af: MatchDetail;
}

export interface MatchLinkResult {
  /** 두 팀 모두 대응표로 확인된 경기 쌍(fd 킥오프 순) — 득점자를 붙여도 된다 */
  links: MatchLink[];
  /** 대회·킥오프·스코어는 맞지만 대응표에 없는 팀이 낀 쌍 — 득점자를 붙이지 않는다(D33), 후보는 report.candidates */
  unconfirmed: MatchPairEvidence[];
  /** 짝짓기 보고(후보·충돌·모호·짝 없음) */
  report: PairingReport;
}

/** 경기 쌍의 두 팀이 대응표로 확인되는가(fd·af 둘 다 같은 slug) */
function confirmedByTable(
  fd: Pick<FinishedMatch, "home" | "away">,
  af: Pick<MatchDetail, "home" | "away">,
  index: TeamIdIndex,
): boolean {
  const same = (fdId: number, afId: number) => {
    const slug = index.byFd.get(fdId);
    return slug !== undefined && slug === index.byAf.get(afId);
  };
  return same(fd.home.id, af.home.id) && same(fd.away.id, af.away.id);
}

/**
 * football-data 종료 경기 ↔ API-Football 경기 상세 연결(순수 함수). 6개 대회 상세만 짝짓기에 들어간다
 * (한국 선수 소속팀 기타 대회는 football-data에 없다).
 */
export function linkMatchDetails(
  fdResults: readonly FinishedMatch[],
  afDetails: readonly MatchDetail[],
  index: TeamIdIndex = EMPTY_TEAM_ID_INDEX,
  options: PairingOptions = {},
): MatchLinkResult {
  const fdPairing: PairingMatch[] = fdResults.map((r) => ({
    matchId: r.matchId,
    comp: r.comp,
    kickoff: r.kickoff,
    home: { id: r.home.id, name: r.home.name },
    away: { id: r.away.id, name: r.away.name },
    ft: r.score.ft,
  }));
  const afPairing = afDetails.flatMap((d) => {
    const p = matchDetailToPairing(d);
    return p ? [p] : [];
  });
  const report = suggestTeamIdPairs(fdPairing, afPairing, index, options);
  const fdById = new Map(fdResults.map((r) => [r.matchId, r] as const));
  const afById = new Map(afDetails.map((d) => [d.matchId, d] as const));
  const links: MatchLink[] = [];
  const unconfirmed: MatchPairEvidence[] = [];
  for (const pair of report.matchPairs) {
    const fd = fdById.get(pair.fdMatchId);
    const af = afById.get(pair.afMatchId);
    if (!fd || !af) continue;
    if (confirmedByTable(fd, af, index)) links.push({ fd, af });
    else unconfirmed.push(pair);
  }
  return { links, unconfirmed, report };
}
