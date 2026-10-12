/**
 * API-Football 가짜 응답 (테스트 전용, 네트워크 없음) — 경로로 fixture를 고른다(fixtures/football/api-football, M0-35·M1-48).
 *   `/fixtures?date=YYYY-MM-DD` → fixtures-date-<날짜>.json(없는 날짜는 빈 목록)
 *   `/fixtures?id=N` → fixtures-id-<N>.json, 없으면 날짜 목록의 그 경기 항목에 빈 events·lineups·players를 붙여 만든다
 *   (날짜 목록에도 없으면 빈 response)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_FOOTBALL_BASE_URL } from "../../scripts/lib/providers/api-football";

const AF_DIR = fileURLToPath(
  new URL("../../fixtures/football/api-football/", import.meta.url),
);

export const readAfFixture = (name: string): string =>
  readFileSync(path.join(AF_DIR, name), "utf8");

export const readAfJson = <T = unknown>(name: string): T =>
  JSON.parse(readAfFixture(name)) as T;

interface Envelope {
  response: Array<{ fixture: { id: number } } & Record<string, unknown>>;
}

/** 날짜 fixture 2개(2026-10-10 종료 23 + INT 1 · 2026-10-11 전부 NS)의 경기 항목 */
export const AF_DATE_ITEMS: ReadonlyMap<
  number,
  Record<string, unknown>
> = new Map(
  ["fixtures-date-2026-10-10.json", "fixtures-date-2026-10-11.json"].flatMap(
    (file) =>
      readAfJson<Envelope>(file).response.map(
        (item) => [item.fixture.id, item] as const,
      ),
  ),
);

/** 응답 껍데기 */
export function afEnvelope(
  response: unknown,
  errors: unknown = [],
  parameters: Record<string, string> = {},
): string {
  const results = Array.isArray(response) ? response.length : 1;
  return JSON.stringify({
    get: "fixtures",
    parameters,
    errors,
    results: Array.isArray(errors) ? results : 0,
    paging: { current: 1, total: 1 },
    response: Array.isArray(errors) ? response : [],
  });
}

/** 요청 URL → API-Football 경로(`/fixtures?date=…`). API-Football이 아니면 null */
export function afPath(url: string): string | null {
  return url.startsWith(API_FOOTBALL_BASE_URL)
    ? url.slice(API_FOOTBALL_BASE_URL.length)
    : null;
}

/** 경기 단건 응답 본문(fixture 파일 → 날짜 항목 합성 → 빈 목록) */
export function afFixtureBody(id: number): string {
  const file = `fixtures-id-${id}.json`;
  if (existsSync(path.join(AF_DIR, file))) return readAfFixture(file);
  const item = AF_DATE_ITEMS.get(id);
  if (!item) return afEnvelope([], [], { id: String(id) });
  return afEnvelope(
    [{ ...item, events: [], lineups: [], statistics: [], players: [] }],
    [],
    {
      id: String(id),
    },
  );
}

/** API-Football 응답 — API-Football URL이 아니면 null(호출부가 다른 경로를 처리) */
export function afFixtureResponse(
  url: string,
  headers: Record<string, string> = {
    "x-ratelimit-remaining": "9",
    "x-ratelimit-requests-remaining": "90",
    "x-ratelimit-requests-limit": "100",
  },
): Response | null {
  const p = afPath(url);
  if (p === null) return null;
  const date = /^\/fixtures\?date=(\d{4}-\d{2}-\d{2})$/.exec(p)?.[1];
  if (date) {
    const file = `fixtures-date-${date}.json`;
    const body = existsSync(path.join(AF_DIR, file))
      ? readAfFixture(file)
      : afEnvelope([], [], { date });
    return new Response(body, { status: 200, headers });
  }
  const id = /^\/fixtures\?id=(\d+)$/.exec(p)?.[1];
  if (id) {
    return new Response(afFixtureBody(Number(id)), { status: 200, headers });
  }
  return new Response(afEnvelope([], { endpoint: "unknown" }), {
    status: 200,
    headers,
  });
}
