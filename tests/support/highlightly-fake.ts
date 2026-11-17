/**
 * Highlightly 가짜 응답 (테스트 전용, 네트워크 없음 — fixtures/highlightly, M5-18 · PRD §15 D80).
 * 경로 → 응답 본문을 고르는 작은 라우터와, 테스트가 합성하는 목록 항목·상세 도우미를 둔다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HIGHLIGHTLY_BASE_URL } from "../../scripts/lib/providers/highlightly";
import type { FetchLike } from "../../scripts/lib/rss";

const HL_DIR = fileURLToPath(
  new URL("../../fixtures/highlightly/", import.meta.url),
);

export const readHlJson = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(path.join(HL_DIR, name), "utf8")) as T;

/** 목록 응답 껍데기(실측 형식) */
export function hlListBody(
  data: unknown[],
  plan = "All data available with current plan.",
): unknown {
  return {
    data,
    plan: { tier: "BASIC", message: plan },
    pagination: { totalCount: data.length, offset: 0, limit: 100 },
  };
}

/** 목록 항목(실측 키) */
export function hlItem(input: {
  id: number;
  leagueId: number;
  leagueName?: string;
  date: string;
  home: [number, string];
  away: [number, string];
  description?: string;
  score?: string | null;
  penalties?: string | null;
  round?: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    round: input.round ?? "Regular Season - 9",
    date: input.date,
    country: { code: "XX", name: "Testland" },
    state: {
      clock: 90,
      score: {
        current: input.score === undefined ? "1 - 0" : input.score,
        penalties: input.penalties ?? null,
      },
      description: input.description ?? "Finished",
    },
    homeTeam: { id: input.home[0], name: input.home[1] },
    awayTeam: { id: input.away[0], name: input.away[1] },
    league: {
      id: input.leagueId,
      name: input.leagueName ?? "League",
      season: 2026,
    },
  };
}

/** 이벤트 1건(실측 키) */
export function hlEvent(input: {
  team: number;
  time: string;
  type: string;
  player?: string | null;
  playerId?: number | null;
  assist?: string | null;
  assistingPlayerId?: number | null;
  substituted?: string | null;
}): Record<string, unknown> {
  return {
    team: { id: input.team, name: `T${input.team}` },
    time: input.time,
    type: input.type,
    assist: input.assist ?? null,
    player: input.player === undefined ? "Player" : input.player,
    playerId: input.playerId === undefined ? null : input.playerId,
    substituted: input.substituted ?? null,
    assistingPlayerId: input.assistingPlayerId ?? null,
  };
}

export interface FakeHlResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FakeHlCall {
  path: string;
  headers: Record<string, string>;
}

/**
 * 경로 라우터 fetch — `routes(path)`가 응답을 정한다(없으면 404). 요청 기록(경로·헤더)을 남긴다. 일 남은 수 헤더는 기본 50.
 */
export function fakeHlFetch(routes: (path: string) => FakeHlResponse | null): {
  fetch: FetchLike;
  calls: FakeHlCall[];
} {
  const calls: FakeHlCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = String(input);
    const p = url.startsWith(HIGHLIGHTLY_BASE_URL)
      ? url.slice(HIGHLIGHTLY_BASE_URL.length)
      : url;
    calls.push({
      path: p,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
    });
    const r = routes(p);
    const status = r?.status ?? (r ? 200 : 404);
    const body =
      r?.body ?? (r ? [] : { message: "Not found", statusCode: 404 });
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-requests-limit": "100",
        "x-ratelimit-requests-remaining": "50",
        ...(r?.headers ?? {}),
      },
    });
  };
  return { fetch, calls };
}
