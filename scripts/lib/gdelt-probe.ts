/**
 * GDELT DOC API 소량 재측정 (plan M1-46, M0-27 결정 3, PRD §15 D25) — 측정 계획·응답 판정·7일 판정·문서 렌더는 순수 함수,
 * 요청 실행기(`runGdeltProbe`)는 fetch·sleep·now를 주입받는다. 진입점은 scripts/gdelt-probe.ts.
 *
 * 범위: 수집 어댑터(M1-07 — 보류)가 아니라 **재활성 판단용 측정**이다. 결과 기사의 제목·URL은 저장하지 않고 건수·호스트 빈도·
 * seendate만 남긴다. `configs/search-queries.json`·`sources.json`은 읽기만 한다(비활성 쿼리를 켜지 않는다).
 *
 * 하루 계획 (M0-27 결정 3 — 쿼리 2개·요청 3건 이내)
 *   ① `sourcelang:<언어>` — `gd-ko-allow-domains`의 lang(ko → korean, M0-27 설계 권고 2의 언어 이름 규칙)으로 만든 언어 필터만.
 *      24시간 한국어 색인 규모와 최신 seendate 지연을 잰다(수집 쿼리 아님).
 *   ② `gd-ko-allow-domains` q 그대로 — 허용 도메인 OR(M0-27 ④와 같은 형태, 언어 필터 없음). 허용 목록 통과 수를 잰다.
 *   요청 순서 ① → ②, 실패(429·연결 오류·타임아웃·5xx)한 쿼리가 있으면 남은 1건으로 **첫 실패 쿼리만** 한 번 더(③). 형식 오류는
 *   다시 보내도 같아 재시도하지 않는다. 요청 사이 간격: 응답 뒤 6초(GDELT 429 본문 "one every 5 seconds"), 재시도 전 15초.
 *   요청 1회 타임아웃 45초(M0-27 실측 200 응답 11.8~19.5초).
 * 응답 판정(M0-27 "응답 필드"): 상태 코드부터 본다 — 429는 텍스트 본문(읽지만 저장하지 않는다), 200 `{}`은 0건, `articles`는 zod.
 * seendate(`20261010T064500Z`, GDELT가 처음 본 15분 배치 시각)의 최댓값과 요청 시각의 차이 = 지연(분).
 */
import { z } from "zod";

import {
  IsoSchema,
  IsoDateSchema,
  type PublisherDomain,
  type SearchQueriesFile,
  type Source,
} from "@/lib/schema";
import { formatKst, parseBasicUtc } from "@/lib/time";

import { OBS_BLOCKS, GDELT_DATA, OBSERVATION_PERIOD } from "./observation-doc";
import {
  cell,
  readBlock,
  readDataLines,
  renderTable,
  replaceBlock,
  tableCellsByKey,
  upsertDataLine,
} from "./research-doc";
import type { FetchLike } from "./rss";
import { filterSearchResults, type SearchResultItem } from "./search-results";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const GDELT_SOURCE_ID = "gdelt-doc";
/** 허용 도메인 OR 쿼리 id — 재활성 후보(M0-27 판정·설계 권고 3) */
export const GDELT_ALLOW_QUERY_ID = "gd-ko-allow-domains";
/** 하루 요청 상한(M0-27 결정 3) */
export const GDELT_MAX_REQUESTS = 3;
/** 응답 뒤 다음 요청까지(GDELT 429 본문 "one every 5 seconds" + 여유) */
export const GDELT_MIN_GAP_MS = 6_000;
/** 재시도 전 대기 — 간격을 늘려도 나아지지 않았다는 실측(M0-27)이 있어 길게 두지 않는다 */
export const GDELT_RETRY_GAP_MS = 15_000;
/** 요청 1회 타임아웃 — 실측 200 응답 최대 19.5초(M0-27)의 약 2배 */
export const GDELT_TIMEOUT_MS = 45_000;
/** ArtList 최대 건수(이 값에 닿으면 실제 결과는 더 많다 — "수백 건" 판정은 충족) */
export const GDELT_MAX_RECORDS = 250;
export const GDELT_TIMESPAN = "1d";
/** 재활성 기준 ② "수백 건"의 하한 */
export const GDELT_KO_SCALE_MIN = 200;
/** 재활성 기준 ③ seendate 지연 상한(분) */
export const GDELT_LAG_MAX_MINUTES = 60;
/** 재활성 기준 ① 성공률 하한 */
export const GDELT_SUCCESS_RATE_MIN = 0.8;

/** lang 코드 → GDELT `sourcelang:` 언어 이름(M0-27 설계 권고 2 — 어댑터 규칙과 같다) */
export const GDELT_LANGUAGE_NAMES: Readonly<Record<string, string>> =
  Object.freeze({
    ko: "korean",
    en: "english",
    es: "spanish",
    it: "italian",
    de: "german",
    fr: "french",
  });

export class GdeltProbeConfigError extends Error {
  override readonly name = "GdeltProbeConfigError";
}

// ─── 계획 ────────────────────────────────────────────────────────────────

export type GdeltProbeKey = "ko-scale" | "allow-domains";

export interface GdeltProbeQuery {
  key: GdeltProbeKey;
  /** 근거가 된 search-queries.json 쿼리 id */
  queryId: string;
  /** 표시 이름 */
  label: string;
  /** GDELT `query` 파라미터 */
  query: string;
  /** 요청 URL(키 없음 — 공개 API) */
  url: string;
}

/** DOC API 요청 URL — 공백은 %20(encodeURIComponent) */
export function gdeltRequestUrl(baseUrl: string, query: string): string {
  const params: Array<[string, string]> = [
    ["query", query],
    ["mode", "ArtList"],
    ["format", "json"],
    ["maxrecords", String(GDELT_MAX_RECORDS)],
    ["sort", "DateDesc"],
    ["timespan", GDELT_TIMESPAN],
  ];
  return `${baseUrl}?${params
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`;
}

/** 설정 → 하루 측정 계획(① 언어 규모 → ② 허용 도메인 OR). 쿼리·소스가 없거나 형식이 맞지 않으면 GdeltProbeConfigError */
export function buildGdeltProbePlan(
  file: Pick<SearchQueriesFile, "queries">,
  sources: readonly Source[],
): GdeltProbeQuery[] {
  const allow = file.queries.find((q) => q.id === GDELT_ALLOW_QUERY_ID);
  if (!allow) {
    throw new GdeltProbeConfigError(
      `configs/search-queries.json에 ${GDELT_ALLOW_QUERY_ID} 쿼리가 없다`,
    );
  }
  const source = sources.find((s) => s.id === allow.source);
  if (!source || source.type !== "search") {
    throw new GdeltProbeConfigError(
      `${GDELT_ALLOW_QUERY_ID}.source(${allow.source})가 sources.json의 type "search" 소스가 아니다`,
    );
  }
  const language = GDELT_LANGUAGE_NAMES[allow.lang];
  if (!language) {
    throw new GdeltProbeConfigError(
      `${GDELT_ALLOW_QUERY_ID}.lang(${allow.lang})의 GDELT 언어 이름을 모른다`,
    );
  }
  const scale = `sourcelang:${language}`;
  return [
    {
      key: "ko-scale",
      queryId: allow.id,
      label: `① ${scale} 24시간(규모·지연)`,
      query: scale,
      url: gdeltRequestUrl(source.url, scale),
    },
    {
      key: "allow-domains",
      queryId: allow.id,
      label: `② ${allow.id} 24시간(허용 도메인 OR)`,
      query: allow.q,
      url: gdeltRequestUrl(source.url, allow.q),
    },
  ];
}

// ─── 응답 판정 ───────────────────────────────────────────────────────────

/** ArtList 응답 껍데기 — 빈 결과는 `{}`(articles 없음) */
const ArtListSchema = z.object({ articles: z.array(z.unknown()).optional() });

/** 기사 1건 — 쓰는 필드만(title·socialimage 등은 읽지 않는다) */
const ArticleSchema = z.object({
  url: z.string().min(1),
  seendate: z.string().optional(),
  domain: z.string().optional(),
});

export type GdeltOutcome =
  "ok" | "rate-limited" | "http-error" | "network" | "parse-error";

export const GdeltOutcomeSchema = z.enum([
  "ok",
  "rate-limited",
  "http-error",
  "network",
  "parse-error",
]);

/** 요청 1건의 기록(저장 형식 — 결과 기사 제목·URL 없음) */
export const GdeltAttemptSchema = z.object({
  key: z.enum(["ko-scale", "allow-domains"]),
  attempt: z.number().int().min(1),
  requestedAt: IsoSchema,
  elapsedMs: z.number().int().min(0),
  status: z.number().int().nullable(),
  outcome: GdeltOutcomeSchema,
  /** 결과 건수(ok만) */
  results: z.number().int().min(0).nullable(),
  /** 결과가 maxrecords에 닿았다(실제는 더 많다) */
  capped: z.boolean(),
  /** 형식이 맞지 않아 뺀 기사 수 */
  invalid: z.number().int().min(0),
  latestSeen: IsoSchema.nullable(),
  /** 요청 시각 − 최신 seendate(분, 반올림) */
  lagMinutes: z.number().int().nullable(),
  /** 허용 목록 판정(ok만) */
  allow: z.number().int().min(0).nullable(),
  feedOnly: z.number().int().min(0).nullable(),
  deny: z.number().int().min(0).nullable(),
  notListed: z.number().int().min(0).nullable(),
  /** 목록 밖 호스트 상위 3(`/add-source` 후보 관찰용) */
  topHosts: z.array(z.object({ host: z.string(), count: z.number().int() })),
  /** 짧은 오류 설명(응답 본문은 넣지 않는다) */
  error: z.string().nullable(),
});
export type GdeltAttempt = z.infer<typeof GdeltAttemptSchema>;

export interface GdeltResponseInput {
  query: Pick<GdeltProbeQuery, "key" | "queryId">;
  attempt: number;
  requestedAt: string;
  elapsedMs: number;
  /** HTTP 상태 — 응답이 없으면(연결 오류·타임아웃) null */
  status: number | null;
  /** 본문(상태 200일 때만 의미) */
  text: string;
  /** 연결 오류·타임아웃·본문 읽기 실패 설명 — 있으면 상태와 무관하게 network */
  networkError?: string;
}

function emptyAttempt(
  input: GdeltResponseInput,
  outcome: GdeltOutcome,
  error: string | null,
): GdeltAttempt {
  return {
    key: input.query.key,
    attempt: input.attempt,
    requestedAt: input.requestedAt,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    status: input.status,
    outcome,
    results: null,
    capped: false,
    invalid: 0,
    latestSeen: null,
    lagMinutes: null,
    allow: null,
    feedOnly: null,
    deny: null,
    notListed: null,
    topHosts: [],
    error,
  };
}

/** 응답 → 요청 기록(순수 함수). 결과 URL에 허용 목록 판정(`filterSearchResults`)을 적용해 건수만 남긴다 */
export function evaluateGdeltResponse(
  input: GdeltResponseInput,
  domains: readonly PublisherDomain[],
): GdeltAttempt {
  // 연결 오류·타임아웃·본문 읽기 실패가 먼저다 — 상태 200이어도 본문이 없으면 성공이 아니다
  if (input.networkError !== undefined || input.status === null) {
    return emptyAttempt(input, "network", input.networkError ?? "응답 없음");
  }
  if (input.status === 429) {
    return emptyAttempt(input, "rate-limited", "HTTP 429");
  }
  if (input.status < 200 || input.status >= 300) {
    return emptyAttempt(input, "http-error", `HTTP ${input.status}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(input.text.trim() === "" ? "{}" : input.text);
  } catch {
    // GDELT는 쿼리 오류를 200 + 텍스트로 돌려주기도 한다 — 본문은 남기지 않는다
    return emptyAttempt(input, "parse-error", "JSON 형식 아님");
  }
  const shell = ArtListSchema.safeParse(json);
  if (!shell.success) {
    return emptyAttempt(input, "parse-error", "articles 형식 다름");
  }
  const items: SearchResultItem[] = [];
  let invalid = 0;
  let latestMs: number | null = null;
  for (const raw of shell.data.articles ?? []) {
    const a = ArticleSchema.safeParse(raw);
    if (!a.success) {
      invalid += 1;
      continue;
    }
    const seen = parseBasicUtc(a.data.seendate);
    if (seen !== null) {
      const ms = Date.parse(seen);
      latestMs = latestMs === null ? ms : Math.max(latestMs, ms);
    }
    items.push({
      sourceId: GDELT_SOURCE_ID,
      queryId: input.query.queryId,
      url: a.data.url,
      titleFromSearch: "",
      timeFromSearch: seen,
      ...(a.data.domain !== undefined ? { domain: a.data.domain } : {}),
    });
  }
  const filtered = filterSearchResults(items, domains);
  const latestSeen =
    latestMs === null ? null : new Date(latestMs).toISOString();
  return {
    ...emptyAttempt(input, "ok", null),
    results: items.length,
    capped: items.length + invalid >= GDELT_MAX_RECORDS,
    invalid,
    latestSeen,
    lagMinutes:
      latestMs === null
        ? null
        : Math.round((Date.parse(input.requestedAt) - latestMs) / 60_000),
    allow: filtered.counts.allow,
    feedOnly: filtered.counts["feed-only"],
    deny: filtered.counts.deny,
    notListed: filtered.counts["not-listed"],
    topHosts: filtered.notListedHosts.slice(0, 3),
  };
}

/** 다시 보내 볼 만한 실패인가 — 429·연결 오류·타임아웃·5xx(형식 오류·4xx는 같은 결과) */
export function isRetryableAttempt(a: GdeltAttempt): boolean {
  if (a.outcome === "rate-limited" || a.outcome === "network") return true;
  return a.outcome === "http-error" && a.status !== null && a.status >= 500;
}

// ─── 실행기 (I/O 주입) ───────────────────────────────────────────────────

export interface GdeltProbeDeps {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  userAgent: string;
  timeoutMs?: number;
  minGapMs?: number;
  retryGapMs?: number;
  maxRequests?: number;
  /** 요청 1건이 끝날 때마다(로그용) */
  onAttempt?: (attempt: GdeltAttempt) => void;
}

/** 요청 1건 — 본문은 판정에만 쓰고 돌려주지 않는다 */
async function requestOnce(
  q: GdeltProbeQuery,
  attempt: number,
  deps: GdeltProbeDeps,
  domains: readonly PublisherDomain[],
): Promise<GdeltAttempt> {
  const started = deps.now();
  const timeoutMs = deps.timeoutMs ?? GDELT_TIMEOUT_MS;
  let status: number | null = null;
  let text = "";
  let networkError: string | undefined;
  const describe = (error: unknown): string => {
    const name = error instanceof Error ? error.name : "";
    return name === "TimeoutError" || name === "AbortError"
      ? `타임아웃 ${Math.round(timeoutMs / 1000)}초`
      : error instanceof Error
        ? (error.message.split("\n")[0] ?? "연결 오류").slice(0, 80)
        : "연결 오류";
  };
  let response: Response | null = null;
  try {
    response = await deps.fetch(q.url, {
      headers: { "User-Agent": deps.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    networkError = describe(error);
  }
  if (response) {
    // 상태는 남기되(진단용), 본문을 끝까지 읽지 못하면 응답 없음과 같게 판정한다 — 빈 본문을 '0건 성공'으로 세지 않게
    status = response.status;
    try {
      text = await response.text();
    } catch (error) {
      networkError = `본문 읽기 실패 — ${describe(error)}`;
    }
  }
  const evaluated = evaluateGdeltResponse(
    {
      query: q,
      attempt,
      requestedAt: started.toISOString(),
      elapsedMs: deps.now().getTime() - started.getTime(),
      status,
      text,
      ...(networkError !== undefined ? { networkError } : {}),
    },
    domains,
  );
  deps.onAttempt?.(evaluated);
  return evaluated;
}

/**
 * 하루 측정 실행 — 계획 순서대로 1건씩, 실패한 쿼리가 있으면 남은 요청으로 첫 실패 쿼리만 한 번 더. 요청 수는 `maxRequests`
 * (기본 3)를 넘지 않는다. 던지지 않는다(요청 오류는 기록으로).
 */
export async function runGdeltProbe(
  plan: readonly GdeltProbeQuery[],
  domains: readonly PublisherDomain[],
  deps: GdeltProbeDeps,
): Promise<GdeltAttempt[]> {
  const maxRequests = Math.min(
    deps.maxRequests ?? GDELT_MAX_REQUESTS,
    GDELT_MAX_REQUESTS,
  );
  const attempts: GdeltAttempt[] = [];
  for (const q of plan) {
    if (attempts.length >= maxRequests) break;
    if (attempts.length > 0)
      await deps.sleep(deps.minGapMs ?? GDELT_MIN_GAP_MS);
    attempts.push(await requestOnce(q, 1, deps, domains));
  }
  const failed = plan.find((q) => {
    const tries = attempts.filter((a) => a.key === q.key);
    return (
      tries.length > 0 &&
      !tries.some((a) => a.outcome === "ok") &&
      isRetryableAttempt(tries.at(-1)!)
    );
  });
  if (failed && attempts.length < maxRequests) {
    await deps.sleep(deps.retryGapMs ?? GDELT_RETRY_GAP_MS);
    attempts.push(await requestOnce(failed, 2, deps, domains));
  }
  return attempts;
}

// ─── 하루 기록 ───────────────────────────────────────────────────────────

/** 문서 데이터 줄에 저장하는 하루 기록 */
export const GdeltDayRecordSchema = z.object({
  v: z.literal(1),
  date: IsoDateSchema,
  measuredAt: IsoSchema,
  /** 관찰 기간 앞 시험 측정(주간 판정 제외) */
  trial: z.boolean(),
  /** User-Agent에 연락처가 있었나(CONTACT_EMAIL) */
  contact: z.boolean(),
  attempts: z.array(GdeltAttemptSchema).max(GDELT_MAX_REQUESTS),
});
export type GdeltDayRecord = z.infer<typeof GdeltDayRecordSchema>;

/**
 * 같은 날 다시 재기(`--force`) 계획 — 그날 이미 보낸 요청은 버리지 않고 하루 상한(3건)에서 뺀다(성공률이 좋아지게 덮어쓰지 않는다).
 * 남은 요청이 없으면 거부, 이미 성공한 쿼리는 다시 재지 않는다. 기록이 없으면 전체 계획 그대로.
 */
export function planDayProbe(
  plan: readonly GdeltProbeQuery[],
  existing: Pick<GdeltDayRecord, "attempts"> | undefined,
):
  | { ok: true; plan: GdeltProbeQuery[]; maxRequests: number }
  | { ok: false; reason: string } {
  if (!existing) {
    return { ok: true, plan: [...plan], maxRequests: GDELT_MAX_REQUESTS };
  }
  const remaining = GDELT_MAX_REQUESTS - existing.attempts.length;
  if (remaining <= 0) {
    return {
      ok: false,
      reason: `그날 요청 ${existing.attempts.length}건을 이미 보냈다 — 하루 ${GDELT_MAX_REQUESTS}건 이내(M0-27 결정 3)`,
    };
  }
  const pending = plan.filter(
    (q) =>
      !existing.attempts.some((a) => a.key === q.key && a.outcome === "ok"),
  );
  if (pending.length === 0) {
    return { ok: false, reason: "그날 두 쿼리 모두 이미 성공했다" };
  }
  return { ok: true, plan: pending, maxRequests: remaining };
}

/** 그날 앞 시도 + 새 시도 — 새 시도의 attempt 번호는 같은 쿼리의 앞 시도 수만큼 민다(전부 성공률에 들어간다) */
export function mergeGdeltAttempts(
  prior: readonly GdeltAttempt[],
  fresh: readonly GdeltAttempt[],
): GdeltAttempt[] {
  return [
    ...prior,
    ...fresh.map((a) => ({
      ...a,
      attempt: a.attempt + prior.filter((p) => p.key === a.key).length,
    })),
  ];
}

/** 그날 쿼리별 최종 결과(성공한 시도가 있으면 그것, 없으면 마지막 시도) */
export function finalAttempt(
  record: Pick<GdeltDayRecord, "attempts">,
  key: GdeltProbeKey,
): GdeltAttempt | null {
  const tries = record.attempts.filter((a) => a.key === key);
  return tries.find((a) => a.outcome === "ok") ?? tries.at(-1) ?? null;
}

export function requestCounts(record: Pick<GdeltDayRecord, "attempts">): {
  ok: number;
  rateLimited: number;
  error: number;
  total: number;
} {
  const ok = record.attempts.filter((a) => a.outcome === "ok").length;
  const rateLimited = record.attempts.filter(
    (a) => a.outcome === "rate-limited",
  ).length;
  return {
    ok,
    rateLimited,
    error: record.attempts.length - ok - rateLimited,
    total: record.attempts.length,
  };
}

// ─── 기간 판정 ───────────────────────────────────────────────────────────

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface GdeltCriterion {
  id: 1 | 2 | 3 | 4;
  label: string;
  value: string;
  /** null = 아직 판정할 수 없음(측정 부족·기간 진행 중) */
  met: boolean | null;
}

export interface GdeltVerdict {
  from: string;
  to: string;
  /** 기간 안 측정일 수(시험 측정 제외) */
  days: number;
  /** 기간 날짜 수 */
  periodDays: number;
  criteria: GdeltCriterion[];
  overall: "met" | "not-met" | "pending";
}

/**
 * 기간 기록 → 재활성 기준 4개 판정(M0-27 설계 권고 3, plan M1-46). 시험 측정(trial)은 뺀다. 기간 날짜를 모두 측정하기 전에는
 * 성공률·허용 도메인(주 단위 기준)을 확정하지 않는다(pending).
 */
export function judgeGdeltPeriod(
  records: readonly GdeltDayRecord[],
  period: { from: string; to: string } = OBSERVATION_PERIOD,
  periodDays = 7,
): GdeltVerdict {
  const inPeriod = records.filter(
    (r) => !r.trial && r.date >= period.from && r.date <= period.to,
  );
  const complete = inPeriod.length >= periodDays;
  const totals = inPeriod
    .map(requestCounts)
    .reduce((acc, c) => ({ ok: acc.ok + c.ok, total: acc.total + c.total }), {
      ok: 0,
      total: 0,
    });
  const rate = totals.total === 0 ? null : totals.ok / totals.total;
  const scaleOk = inPeriod
    .map((r) => finalAttempt(r, "ko-scale"))
    .filter((a): a is GdeltAttempt => a?.outcome === "ok");
  const scaleMedian = median(scaleOk.map((a) => a.results ?? 0));
  const lagMedian = median(
    scaleOk.map((a) => a.lagMinutes).filter((v): v is number => v !== null),
  );
  const allowTotal = inPeriod
    .map((r) => finalAttempt(r, "allow-domains"))
    .reduce((sum, a) => sum + (a?.outcome === "ok" ? (a.allow ?? 0) : 0), 0);
  const allowMeasured = inPeriod.some(
    (r) => finalAttempt(r, "allow-domains")?.outcome === "ok",
  );

  const criteria: GdeltCriterion[] = [
    {
      id: 1,
      label: `7일 요청 성공률 ≥ ${GDELT_SUCCESS_RATE_MIN * 100}%`,
      value:
        rate === null
          ? "측정 없음"
          : `${totals.ok}/${totals.total} = ${(rate * 100).toFixed(0)}% (${inPeriod.length}일)`,
      met:
        rate === null
          ? null
          : !complete
            ? null
            : rate >= GDELT_SUCCESS_RATE_MIN,
    },
    {
      id: 2,
      label: `한국어 24시간 결과 수백 건(중앙값 ≥ ${GDELT_KO_SCALE_MIN})`,
      value:
        scaleMedian === null
          ? "성공 측정 없음"
          : `중앙값 ${scaleMedian}건 (${scaleOk.length}일${scaleOk.some((a) => a.capped) ? ", 250 상한 도달 포함" : ""})`,
      met: scaleMedian === null ? null : scaleMedian >= GDELT_KO_SCALE_MIN,
    },
    {
      id: 3,
      label: `최신 seendate 지연 ≤ ${GDELT_LAG_MAX_MINUTES}분(중앙값)`,
      value: lagMedian === null ? "성공 측정 없음" : `중앙값 ${lagMedian}분`,
      met: lagMedian === null ? null : lagMedian <= GDELT_LAG_MAX_MINUTES,
    },
    {
      id: 4,
      label: "허용 도메인 결과 주 1건 이상(기간 합)",
      value: allowMeasured ? `${allowTotal}건` : "성공 측정 없음",
      met: allowTotal >= 1 ? true : complete && allowMeasured ? false : null,
    },
  ];
  const overall = criteria.some((c) => c.met === false)
    ? "not-met"
    : complete && criteria.every((c) => c.met === true)
      ? "met"
      : "pending";
  return {
    from: period.from,
    to: period.to,
    days: inPeriod.length,
    periodDays,
    criteria,
    overall,
  };
}

// ─── 문서 렌더 ───────────────────────────────────────────────────────────

export const GDELT_TABLE_HEADER = [
  "날짜",
  "측정 시각(KST)",
  "요청 200/429/오류",
  "① 한국어 24h 결과",
  "① 최신 seendate 지연(분)",
  "② 허용 도메인 결과",
  "② 허용 통과",
  "비고",
  "메모",
] as const;

function resultCell(a: GdeltAttempt | null): string {
  if (!a) return "—";
  if (a.outcome !== "ok") return `실패(${a.error ?? a.outcome})`;
  return `${a.results ?? 0}${a.capped ? "+(상한)" : ""}`;
}

/** 하루 기록 → 표 한 줄(메모는 기존 값) */
export function gdeltTableRow(
  record: GdeltDayRecord,
  memo: string | undefined,
): string[] {
  const c = requestCounts(record);
  const scale = finalAttempt(record, "ko-scale");
  const allow = finalAttempt(record, "allow-domains");
  const notes: string[] = [];
  if (record.trial) notes.push("관찰 전 시험 측정");
  const retried = record.attempts.filter((a) => a.attempt > 1);
  for (const r of retried) {
    notes.push(
      `재시도 ${r.key === "ko-scale" ? "①" : "②"} → ${r.outcome === "ok" ? "성공" : (r.error ?? r.outcome)}`,
    );
  }
  if (scale?.outcome === "ok" && scale.topHosts.length > 0) {
    notes.push(
      `① 목록 밖 상위 ${scale.topHosts.map((h) => `${h.host} ${h.count}`).join(", ")}`,
    );
  }
  if (!record.contact) notes.push("UA 연락처 없음(CONTACT_EMAIL)");
  return [
    record.date,
    formatKst(record.measuredAt, "time"),
    `${c.ok}/${c.rateLimited}/${c.error}`,
    resultCell(scale),
    scale?.outcome === "ok" ? cell(scale.lagMinutes) : "—",
    resultCell(allow),
    allow?.outcome === "ok" ? String(allow.allow ?? 0) : "—",
    cell(notes.join(" · ")),
    cell(memo),
  ];
}

const MET_LABEL = (met: boolean | null) =>
  met === null ? "판정 전" : met ? "충족" : "미충족";

export function renderGdeltVerdict(v: GdeltVerdict): string {
  const overall =
    v.overall === "met"
      ? `**충족** — \`${GDELT_ALLOW_QUERY_ID}\` 1개만 켜는 안을 사용자에게 묻는다(M1-46 ❓, 켜면 NFR-09 GDELT 인용·링크 표기)`
      : v.overall === "not-met"
        ? "**미충족** — `gdelt-doc` 비활성 유지(M0-27 대안 (a) GDELT 없이 운영)"
        : `**판정 전** — 기간 ${v.days}/${v.periodDays}일 측정`;
  return [
    `**7일 판정 (${v.from} ~ ${v.to}, 시험 측정 제외)**: ${overall}`,
    "",
    renderTable(
      ["기준", "값", "판정"],
      v.criteria.map((c) => [
        `${c.id}. ${c.label}`,
        cell(c.value),
        MET_LABEL(c.met),
      ]),
    ),
  ].join("\n");
}

/** 문서의 GDELT 데이터 줄 → 하루 기록(형식이 맞지 않는 줄은 errors) */
export function readGdeltRecords(doc: string): {
  records: GdeltDayRecord[];
  errors: string[];
} {
  const records: GdeltDayRecord[] = [];
  const errors: string[] = [];
  for (const line of readDataLines(doc, GDELT_DATA)) {
    if ("error" in line) {
      errors.push(`${line.key}: ${line.error}`);
      continue;
    }
    const parsed = GdeltDayRecordSchema.safeParse(line.json);
    if (!parsed.success) {
      errors.push(`${line.key}: 형식 오류`);
      continue;
    }
    records.push(parsed.data);
  }
  return { records, errors };
}

const GDELT_DATA_HEADER =
  "v1 — probe:gdelt 기록(손대지 말 것). 한 줄 = 측정일 하나(제목·URL 없음)";

/** 하루 기록을 문서에 반영 — 데이터 줄 교체 → 표·7일 판정 다시 그림(메모 칸 보존) */
export function applyGdeltRecord(doc: string, record: GdeltDayRecord): string {
  let next = upsertDataLine(
    doc,
    GDELT_DATA,
    GDELT_DATA_HEADER,
    record.date,
    record,
  );
  const { records } = readGdeltRecords(next);
  const memos = tableCellsByKey(readBlock(next, OBS_BLOCKS.gdeltTable), [
    "메모",
  ]);
  const rows = [...records]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) => gdeltTableRow(r, memos.get(r.date)?.["메모"]));
  next = replaceBlock(
    next,
    OBS_BLOCKS.gdeltTable,
    renderTable(GDELT_TABLE_HEADER, rows),
  );
  next = replaceBlock(
    next,
    OBS_BLOCKS.gdeltVerdict,
    renderGdeltVerdict(judgeGdeltPeriod(records)),
  );
  return next;
}
