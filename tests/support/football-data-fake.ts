/**
 * football-data 가짜 응답 (테스트 전용, 네트워크 없음) — 경로로 fixture를 고른다.
 *   `/matches?…` → 주어진 경기 응답(기본 2026-10-10 6개 대회)
 *   `/competitions/{code}/standings` → fixtures/football/football-data/standings-*.json(대회별 최신 스냅숏)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FOOTBALL_DATA_BASE_URL } from "../../scripts/lib/providers/football-data";

const FD_DIR = fileURLToPath(
  new URL("../../fixtures/football/football-data/", import.meta.url),
);

export const readFdFixture = (name: string): string =>
  readFileSync(path.join(FD_DIR, name), "utf8");

/** 2026-10-10(UTC) 6개 대회 경기 — 종료 23 · 취소 1, 대회 PL·PD·SA·BL1·FL1 */
export const FD_MATCHES_1010 = readFdFixture("matches-6comps-2026-10-10.json");

/** 대회 코드 → 순위 fixture 파일 */
export const FD_STANDINGS_FILES: Readonly<Record<string, string>> = {
  PL: "standings-pl-2026-10-11.json",
  PD: "standings-pd-2026-10-11.json",
  SA: "standings-sa-2026-10-11.json",
  BL1: "standings-bl1-2026-10-11.json",
  FL1: "standings-fl1-2026-10-11.json",
  CL: "standings-cl-2026-10-10.json",
};

/** 요청 URL → football-data 경로(`/matches?…`·`/competitions/PL/standings`). football-data가 아니면 null */
export function fdPath(url: string): string | null {
  return url.startsWith(FOOTBALL_DATA_BASE_URL)
    ? url.slice(FOOTBALL_DATA_BASE_URL.length)
    : null;
}

/** 순위 경로의 대회 코드. 순위 경로가 아니면 null */
export function standingsCode(url: string): string | null {
  const m = /^\/competitions\/([^/]+)\/standings$/.exec(fdPath(url) ?? "");
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * football-data 응답 — 순위는 fixture, 경기는 `matchesBody`. football-data URL이 아니면 null(호출부가 다른 경로를 처리).
 */
export function fdFixtureResponse(
  url: string,
  matchesBody: string = FD_MATCHES_1010,
): Response | null {
  const p = fdPath(url);
  if (p === null) return null;
  const code = standingsCode(url);
  if (code !== null) {
    const file = FD_STANDINGS_FILES[code];
    return file
      ? new Response(readFdFixture(file), { status: 200 })
      : new Response('{"message":"not found","errorCode":404}', {
          status: 404,
        });
  }
  if (p.startsWith("/matches?")) {
    return new Response(matchesBody, { status: 200 });
  }
  return new Response('{"message":"not found","errorCode":404}', {
    status: 404,
  });
}
