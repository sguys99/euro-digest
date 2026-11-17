/**
 * 팀 id 대응표에 Highlightly 팀 id(`hl`)를 채운다 (PRD §15 D80, plan M5-18) — 순수 함수. 진입점은 scripts/build-team-ids.ts `--hl`.
 *
 * 근거는 API-Football 때(D33 ⑤)와 같은 짝짓기(scripts/lib/team-ids.ts `suggestTeamIdPairs`) — 같은 대회 · 킥오프 ±5분 · 같은 최종
 * 스코어(승부차기 제외)인 경기가 **딱 하나**일 때만 홈↔홈·원정↔원정을 팀 쌍 후보로 낸다. 한쪽은 football-data 종료 경기(대회 파일
 * `data/competitions/<comp>.json` — 팀 slug → team-ids `fd`), 다른 쪽은 Highlightly 시즌 경기 목록(`/matches?leagueId=&season=` 원문 —
 * 저장소 밖에 저장한 응답, 2026-11-17 6요청). 대응표에 이미 있는 slug의 `hl`만 채운다(새 팀은 만들지 않는다 — 6개 대회 팀 목록은
 * `--roster`가 정한다). 이미 `hl`이 있으면 바꾸지 않고, 후보와 다르면 문제로 보고한다.
 */
import type {
  CompId,
  CompetitionFile,
  CompetitionsFile,
  TeamIdsFile,
} from "@/lib/schema";

import { toHlFixture, hlFixtureToPairing } from "./providers/highlightly";
import {
  buildTeamIdIndex,
  suggestTeamIdPairs,
  type PairingMatch,
  type PairingReport,
} from "./team-ids";

/** 대회 파일(football-data) 종료 경기 → 짝짓기 입력(팀 id = team-ids `fd`, 이름 = slug). fd id를 모르는 경기는 뺀다 */
export function fdPairingFromCompetitionFiles(
  files: Partial<Record<CompId, Pick<CompetitionFile, "matches">>>,
  teamIds: TeamIdsFile,
): PairingMatch[] {
  const fdOf = (slug: string): number | null =>
    Object.hasOwn(teamIds, slug) ? (teamIds[slug]?.fd ?? null) : null;
  const out: PairingMatch[] = [];
  for (const [comp, file] of Object.entries(files) as Array<
    [CompId, Pick<CompetitionFile, "matches"> | undefined]
  >) {
    for (const m of file?.matches ?? []) {
      if (m.status !== "finished" || m.score === null) continue;
      const id = /^fd-(\d+)$/.exec(m.id);
      const home = fdOf(m.home);
      const away = fdOf(m.away);
      if (!id || home === null || away === null) continue;
      out.push({
        matchId: Number(id[1]),
        comp,
        kickoff: m.kickoff,
        home: { id: home, name: m.home },
        away: { id: away, name: m.away },
        ft: { home: m.score.h, away: m.score.a },
      });
    }
  }
  return out;
}

/** Highlightly 목록 응답 원문들(`{ data: [...] }` 또는 배열) → 짝짓기 입력(6개 대회 · 종료만 ft) */
export function hlPairingFromLists(
  responses: readonly unknown[],
  competitions: CompetitionsFile,
): PairingMatch[] {
  const compByLeague = new Map<number, CompId>();
  for (const c of competitions) {
    if (c.highlightlyLeagueId !== undefined) {
      compByLeague.set(c.highlightlyLeagueId, c.id);
    }
  }
  const byId = new Map<number, PairingMatch>();
  for (const response of responses) {
    const items = Array.isArray(response)
      ? response
      : ((response as { data?: unknown } | null)?.data ?? []);
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const fixture = toHlFixture(item);
      const pairing = fixture && hlFixtureToPairing(fixture, compByLeague);
      if (pairing && !byId.has(pairing.matchId)) {
        byId.set(pairing.matchId, pairing);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId,
  );
}

export interface HlFill {
  slug: string;
  hl: number;
  /** Highlightly 팀 이름(원문) */
  name: string;
  /** 근거 경기 수 */
  evidence: number;
}

export interface HlFillResult {
  file: TeamIdsFile;
  filled: HlFill[];
  /** 대응표 slug인데 hl을 찾지 못한 팀 */
  missing: string[];
  /** 이미 있는 hl과 다른 후보 · 짝짓기 충돌 */
  problems: string[];
  pairing: PairingReport;
}

/**
 * 짝짓기를 되풀이해 채운다 — 같은 칸(대회·킥오프)에 같은 스코어 경기가 여럿이면 첫 회에는 모호하지만, 앞 회에 채운 팀이 후보를
 * 하나로 좁힌다(UCL 같은 시각 경기 — 2026-11-17 실측: 슬라비아 1–2 아스널 · PSV 1–2 브뤼허). 새로 채운 팀이 없을 때까지(최대 5회).
 */
export function fillHighlightlyTeamIdsIterative(
  input: Parameters<typeof fillHighlightlyTeamIds>[0],
): HlFillResult {
  let result = fillHighlightlyTeamIds(input);
  const filled = [...result.filled];
  for (let pass = 1; pass < 5 && result.filled.length > 0; pass += 1) {
    result = fillHighlightlyTeamIds({ ...input, teamIds: result.file });
    filled.push(...result.filled);
  }
  return { ...result, filled };
}

/**
 * 짝짓기 후보 → team-ids `hl` 채우기(머리 주석). note에 근거(경기 수·Highlightly 이름·출처·날짜)를 덧붙인다. 키 순서는 fd · af · hl ·
 * note(파일 diff를 작게).
 */
export function fillHighlightlyTeamIds(input: {
  teamIds: TeamIdsFile;
  fd: readonly PairingMatch[];
  hl: readonly PairingMatch[];
  /** note에 남길 출처 설명 */
  source: string;
  /** note에 남길 날짜(KST) */
  date: string;
}): HlFillResult {
  const index = buildTeamIdIndex(input.teamIds, "highlightly");
  const pairing = suggestTeamIdPairs(input.fd, input.hl, index);
  const problems: string[] = pairing.conflicts.map(
    (c) =>
      `충돌(${c.kind}): fd ${c.fd.name}(${c.fd.id}) ↔ hl ${c.af.name}(${c.af.id}) — ${c.detail}`,
  );
  const bySlug = new Map<
    string,
    { hl: number; name: string; evidence: number }
  >();
  for (const c of pairing.candidates) {
    if (c.kind !== "fill-af" || c.slug === null) continue;
    bySlug.set(c.slug, {
      hl: c.af.id,
      name: c.af.name,
      evidence: c.evidence.length,
    });
  }
  const file: TeamIdsFile = {};
  const filled: HlFill[] = [];
  const missing: string[] = [];
  for (const [slug, entry] of Object.entries(input.teamIds)) {
    const found = bySlug.get(slug);
    const current = entry.hl ?? null;
    let hl = current;
    let note = entry.note;
    if (found && current === null) {
      hl = found.hl;
      filled.push({ slug, ...found });
      const add = `hl ${found.hl} 근거 — 종료 경기 ${found.evidence}건 대회·킥오프·스코어 일치 · hl "${found.name}" (${input.source}, ${input.date}, D80)`;
      note = note ? `${note} · ${add}` : add;
    } else if (found && current !== null && found.hl !== current) {
      problems.push(
        `"${slug}" hl 불일치: 대응표 ${current} ↔ 후보 ${found.hl} — 대응표 유지`,
      );
    }
    if (hl === null) missing.push(slug);
    file[slug] = {
      fd: entry.fd,
      af: entry.af,
      ...(hl !== null ? { hl } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  }
  return { file, filled, missing, problems, pairing };
}
