/**
 * 피드 러너 재확인 도구 (plan M1-41 — ESPN 러너 재확인용 일회성, 2026-10-29 사용자 결정) — 피드 1개를 **요청 1회**로 받아
 * 응답 겉모습·파싱 결과만 남기고 판정한다. 진입점은 scripts/probe-feed.ts, 수동 실행 워크플로는 .github/workflows/probe-feed.yml.
 *
 * 배경: espn-soccer는 2026-10-14 Actions 러너에만 HTTP 202·text/html·0바이트를 받아 비활성했다(로컬은 200 정상 RSS — 이슈 #3).
 * 관찰 기간에 러너에서 한 번 다시 받아 보고 재활성을 판단한다. 차단 회피(UA 위장·프록시)는 하지 않는다 — 수집기와 **같은**
 * 받기 경로를 쓴다:
 *   - 받기: scripts/lib/rss.ts `fetchFeed`(요청 1회 — 같은 호스트 리다이렉트만 그 1회 안에서 따라감) + 수집 정책 기본값
 *     (scripts/lib/feed-collect.ts `DEFAULT_FEED_POLICY`의 타임아웃·크기 상한·리다이렉트 상한). 재시도(`fetchFeedWithRetry`)는
 *     쓰지 않는다 — 진단은 정확히 1회만 보낸다.
 *   - User-Agent: 호출부가 scripts/lib/rss.ts `feedUserAgent(CONTACT_EMAIL)`로 만든다(collect.ts와 같은 식).
 *   - 파싱: scripts/lib/rss.ts `parseFeedXml`. 실패 진단은 scripts/lib/feed-diagnostics.ts의 응답 겉모습(HTTP 상태·미디어 타입·
 *     바이트 수·본문 형태)과 파서 오류 코드·줄·열(2026-10-14 M1-03 보강) 그대로다.
 *
 * 남기는 값은 enum·숫자·시각·설정값(소스 id·URL·UA)뿐이다. 제목·링크·요약문·응답 본문은 결과에 담지 않는다(CLAUDE.md §9.1).
 * 요약문은 진단에 쓰지 않으므로 파서에서 꺼내지도 않는다(`summaries: false` — item 수·파싱 성공 여부와 무관하다).
 *
 * ── 판정 (`judgeProbe`) ─────────────────────────────────────────────────
 *   ok       HTTP 200 + RSS·Atom 파싱 성공 + item ≥ 1
 *   blocked  서버가 피드 대신 거절·빈 응답을 준 경우(봇 차단 추정)
 *            · HTTP 401·403·429·451
 *            · 2xx인데 본문이 빈 본문·HTML·평문·JSON(10-14 증상 = 202 + 빈 본문)
 *   error    그 밖 — 네트워크·타임아웃·5xx·그 밖의 4xx(404 등)·크기 초과·리다이렉트 거부, XML인데 파싱 실패, 200이 아닌 2xx,
 *            파싱은 됐지만 item 0건
 *   2xx가 아닌 응답(4xx·5xx)은 수집기 받기 단계가 본문을 읽지 않고 실패시키므로 미디어 타입·바이트 수·본문 형태가 없다("—").
 */
import { parseArgs } from "node:util";

import type { Source } from "@/lib/schema";
import { nowUtcIso, parseFeedDate } from "@/lib/time";

import type { ParseResult } from "./cli-args";
import { DEFAULT_FEED_POLICY } from "./feed-collect";
import {
  FEED_BODY_SHAPE_LABEL,
  FEED_PARSE_ERROR_LABEL,
  type FeedBodyShape,
  type FeedParseErrorInfo,
  type FeedResponseInfo,
} from "./feed-diagnostics";
import {
  FeedFetchError,
  FeedParseError,
  fetchFeed,
  parseFeedXml,
  type FeedFetchErrorKind,
  type FetchLike,
  type RawFeedItem,
} from "./rss";

// ─── 인자 ────────────────────────────────────────────────────────────────

export const PROBE_FEED_USAGE = [
  "사용법: npx tsx scripts/probe-feed.ts --source <소스 id>",
  "  --source <id>  configs/sources.json의 소스 id(필수 — terms_checked: true인 RSS형 소스만, enabled: false도 진단 가능)",
  "  --help, -h     이 도움말",
  "요청은 정확히 1회. 판정(ok·blocked·error)과 무관하게 exit 0, 인자·설정 오류만 exit 1.",
].join("\n");

export type ProbeFeedArgs = { help: true } | { help: false; source: string };

/** 인자 → `--source` 값(필수). 모르는 옵션·위치 인자·빈 값은 오류. 순수 함수. */
export function parseProbeFeedArgs(
  argv: readonly string[],
): ParseResult<ProbeFeedArgs> {
  let values: { source?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        source: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (values.help) return { ok: true, value: { help: true } };
  const source = values.source?.trim() ?? "";
  if (source === "") {
    return { ok: false, error: "--source <소스 id>가 필요하다" };
  }
  return { ok: true, value: { help: false, source } };
}

// ─── 소스 고르기 ─────────────────────────────────────────────────────────

/** 진단할 수 있는 소스 type — 일일 RSS 루프가 `fetchFeed`로 받는 type(scripts/lib/sources.ts `dailyRoute`의 "feed")만 */
const PROBE_SOURCE_TYPES: ReadonlySet<Source["type"]> = new Set([
  "rss",
  "journalist",
  "aggregator",
]);

/**
 * 설정에서 진단할 소스를 찾는다. `enabled: false`는 허용(비활성 소스 재확인이 목적), `terms_checked: true`가 아니면 거부
 * (약관상 이용 방식이 확인되지 않은 소스에는 요청을 보내지 않는다), 피드형이 아닌 type(crawl·search·analysis)도 거부. 순수 함수.
 */
export function resolveProbeSource(
  sources: readonly Source[],
  id: string,
): ParseResult<Source> {
  const source = sources.find((s) => s.id === id);
  if (!source) {
    return { ok: false, error: `configs/sources.json에 소스가 없다: ${id}` };
  }
  if (!source.terms_checked) {
    return {
      ok: false,
      error: `${id}: terms_checked가 true가 아니라 요청하지 않는다(약관 확인 전 소스)`,
    };
  }
  if (!PROBE_SOURCE_TYPES.has(source.type)) {
    return {
      ok: false,
      error: `${id}: type ${source.type}는 진단 대상이 아니다(rss·journalist·aggregator만 — 수집기 피드 경로와 같은 소스)`,
    };
  }
  return { ok: true, value: source };
}

// ─── 진단 값 ─────────────────────────────────────────────────────────────

/** 파싱 결과 — 성공이면 item 수·가장 최근 pubDate(UTC ISO)·날짜를 해석하지 못한 item 수, 실패면 파서 오류 코드·위치 */
export type ProbeParseOutcome =
  | { ok: true; items: number; latestPubDate: string | null; undated: number }
  | ({ ok: false } & FeedParseErrorInfo);

/** 받기 결과 — 성공(2xx)이면 응답 겉모습 + 파싱 결과, 실패면 받기 오류 종류·HTTP 상태 */
export type ProbeOutcome =
  | { fetched: true; info: FeedResponseInfo; parse: ProbeParseOutcome }
  | { fetched: false; kind: FeedFetchErrorKind; status: number | null };

/** 진단 1회의 관찰값 — 본문·제목·링크 없음 */
export interface FeedProbeObservation {
  sourceId: string;
  /** 설정의 피드 URL(configs/sources.json) */
  url: string;
  enabled: boolean;
  userAgent: string;
  /** 요청 시작 시각(UTC ISO) */
  requestedAt: string;
  /** 받기·파싱 합계 소요(ms) */
  elapsedMs: number;
  outcome: ProbeOutcome;
}

export type ProbeVerdict = "ok" | "blocked" | "error";

export interface ProbeJudgement {
  verdict: ProbeVerdict;
  /** 판정 이유(고정 문구 + 상태 코드·enum·건수 — 본문 조각 없음) */
  reason: string;
}

// ─── 진단 실행 (fetch 주입) ──────────────────────────────────────────────

export interface ProbeFeedDeps {
  fetch: FetchLike;
  userAgent: string;
  now: () => Date;
}

/**
 * 소스 1개를 요청 1회로 받아 파싱하고 관찰값을 돌려준다. 받기·파싱 실패는 결과로 담고 던지지 않는다
 * (FeedFetchError·FeedParseError가 아닌 예외 — 프로그래밍 오류 — 만 던진다).
 */
export async function probeFeed(
  source: Pick<Source, "id" | "url" | "enabled" | "tz">,
  deps: ProbeFeedDeps,
): Promise<FeedProbeObservation> {
  const started = deps.now();
  const base = {
    sourceId: source.id,
    url: source.url,
    enabled: source.enabled,
    userAgent: deps.userAgent,
    requestedAt: nowUtcIso(started),
  };
  const elapsed = () => Math.max(0, deps.now().getTime() - started.getTime());

  let fetched: Awaited<ReturnType<typeof fetchFeed>>;
  try {
    fetched = await fetchFeed(source.url, {
      fetch: deps.fetch,
      userAgent: deps.userAgent,
      timeoutMs: DEFAULT_FEED_POLICY.timeoutMs,
      maxBytes: DEFAULT_FEED_POLICY.maxBytes,
      maxRedirects: DEFAULT_FEED_POLICY.maxRedirects,
      now: () => deps.now().getTime(),
    });
  } catch (error) {
    if (!(error instanceof FeedFetchError)) throw error;
    return {
      ...base,
      elapsedMs: elapsed(),
      outcome: { fetched: false, kind: error.kind, status: error.status },
    };
  }

  let parse: ProbeParseOutcome;
  try {
    const raws = await parseFeedXml(fetched.text, { summaries: false });
    parse = { ok: true, ...pubDateStats(raws, source.tz) };
  } catch (error) {
    if (!(error instanceof FeedParseError)) throw error;
    parse = { ok: false, ...error.info };
  }
  return {
    ...base,
    elapsedMs: elapsed(),
    outcome: { fetched: true, info: fetched.info, parse },
  };
}

/** 항목 목록 → item 수·가장 최근 pubDate(UTC ISO)·날짜를 해석하지 못한 수. 날짜 해석은 수집기와 같은 `parseFeedDate`(소스 tz). */
export function pubDateStats(
  raws: readonly Pick<RawFeedItem, "pubDate">[],
  tz: string | undefined,
): { items: number; latestPubDate: string | null; undated: number } {
  let latest: string | null = null;
  let latestMs = -Infinity;
  let undated = 0;
  for (const raw of raws) {
    const iso = parseFeedDate(raw.pubDate, tz);
    if (iso === null) {
      undated += 1;
      continue;
    }
    const ms = Date.parse(iso);
    if (ms > latestMs) {
      latestMs = ms;
      latest = iso;
    }
  }
  return { items: raws.length, latestPubDate: latest, undated };
}

// ─── 판정 ────────────────────────────────────────────────────────────────

/** 거절로 보는 HTTP 상태 — 인증 필요·접근 거부·요청 제한·법적 차단 */
const BLOCK_STATUSES: ReadonlySet<number> = new Set([401, 403, 429, 451]);

/** 2xx인데 이 형태면 피드가 아닌 응답(차단·오류 페이지·빈 응답)으로 본다 */
const NON_FEED_SHAPES: ReadonlySet<FeedBodyShape> = new Set([
  "empty",
  "html",
  "text",
  "json",
]);

/** 받기 오류 종류 → 표시 문구 */
export const FEED_FETCH_ERROR_LABEL: Readonly<
  Record<FeedFetchErrorKind, string>
> = {
  timeout: "시간 초과",
  "http-4xx": "4xx 응답",
  "http-5xx": "5xx 응답",
  network: "네트워크 오류",
  redirect: "리다이렉트 거부(다른 호스트·강등·횟수 초과 등)",
  "too-large": "크기 상한 초과",
  budget: "시간 예산 소진",
};

/** 관찰값 → 판정(규칙은 파일 머리 주석). 순수 함수. */
export function judgeProbe(observation: FeedProbeObservation): ProbeJudgement {
  const { outcome } = observation;
  if (!outcome.fetched) {
    const { kind, status } = outcome;
    if (kind === "http-4xx" && status !== null && BLOCK_STATUSES.has(status)) {
      return {
        verdict: "blocked",
        reason: `HTTP ${status} — 접근 거부·요청 제한(봇 차단 추정)`,
      };
    }
    return {
      verdict: "error",
      reason: `받기 실패 — ${kind}: ${FEED_FETCH_ERROR_LABEL[kind]}${status !== null ? ` (HTTP ${status})` : ""}`,
    };
  }
  const { info, parse } = outcome;
  const shapeLabel = FEED_BODY_SHAPE_LABEL[info.shape];
  if (NON_FEED_SHAPES.has(info.shape)) {
    return {
      verdict: "blocked",
      reason: `HTTP ${info.status} · ${info.mediaType} · ${info.bytes}바이트 · ${shapeLabel} — 피드가 아닌 응답(봇 차단 추정)`,
    };
  }
  if (!parse.ok) {
    return {
      verdict: "error",
      reason: `HTTP ${info.status} · ${shapeLabel} — 파싱 실패: ${parse.parser}(${FEED_PARSE_ERROR_LABEL[parse.parser]})`,
    };
  }
  if (info.status !== 200) {
    return {
      verdict: "error",
      reason: `HTTP ${info.status}(200 아님) — 피드는 파싱됨(item ${parse.items}건)`,
    };
  }
  if (parse.items < 1) {
    return {
      verdict: "error",
      reason: `HTTP 200 · ${shapeLabel} — 파싱은 됐지만 item 0건`,
    };
  }
  return {
    verdict: "ok",
    reason: `HTTP 200 · ${shapeLabel} · item ${parse.items}건`,
  };
}

// ─── 출력 ────────────────────────────────────────────────────────────────

const NONE = "—";

/** 관찰값 → 표 행(항목·값). 콘솔·Step Summary가 같은 행을 쓴다. 순수 함수. */
export function probeRows(
  observation: FeedProbeObservation,
): Array<readonly [label: string, value: string]> {
  const judgement = judgeProbe(observation);
  const { outcome } = observation;
  const info = outcome.fetched ? outcome.info : null;
  const parse = outcome.fetched ? outcome.parse : null;
  const status = info
    ? String(info.status)
    : !outcome.fetched && outcome.status !== null
      ? String(outcome.status)
      : NONE;
  return [
    ["판정", `${judgement.verdict} — ${judgement.reason}`],
    [
      "소스",
      `${observation.sourceId} (enabled: ${String(observation.enabled)})`,
    ],
    ["피드 URL", observation.url],
    ["요청 시각 (UTC)", observation.requestedAt],
    ["User-Agent", observation.userAgent],
    ["시도", "1회 (재시도 없음 — 같은 호스트 리다이렉트만 이 안에서 따라감)"],
    ["HTTP 상태", status],
    ["Content-Type (미디어 타입)", info ? info.mediaType : NONE],
    ["바이트", info ? String(info.bytes) : NONE],
    [
      "본문 형태",
      info ? `${info.shape} (${FEED_BODY_SHAPE_LABEL[info.shape]})` : NONE,
    ],
    [
      "리다이렉트",
      info
        ? `${info.redirects}회 (최종 호스트 ${info.sameHost ? "같음" : "다름"})`
        : NONE,
    ],
    [
      "받기",
      outcome.fetched
        ? "성공(2xx)"
        : `실패 — ${outcome.kind} (${FEED_FETCH_ERROR_LABEL[outcome.kind]})`,
    ],
    ["파싱", parse ? parseText(parse) : `${NONE} (받기 실패)`],
    [
      "item 수",
      parse?.ok
        ? `${parse.items}${parse.undated > 0 ? ` (날짜 해석 불가 ${parse.undated})` : ""}`
        : NONE,
    ],
    [
      "최신 pubDate (UTC)",
      parse?.ok ? (parse.latestPubDate ?? "없음(날짜 해석 불가)") : NONE,
    ],
    ["소요", `${observation.elapsedMs}ms`],
  ];
}

function parseText(parse: ProbeParseOutcome): string {
  if (parse.ok) return "성공";
  const position =
    parse.line !== null
      ? ` · 줄 ${parse.line}${parse.column !== null ? `·열 ${parse.column}` : ""}`
      : "";
  return `실패 — ${parse.parser} (${FEED_PARSE_ERROR_LABEL[parse.parser]})${position}`;
}

/** 콘솔 출력(여러 줄). 순수 함수. */
export function renderProbeText(observation: FeedProbeObservation): string {
  const rows = probeRows(observation);
  const width = Math.max(...rows.map(([label]) => label.length));
  return [
    `[probe-feed] ${observation.sourceId}`,
    ...rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`),
  ].join("\n");
}

/** 표 칸 안전 처리 — 줄바꿈은 공백, `|`는 이스케이프 */
function cell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** `$GITHUB_STEP_SUMMARY`에 덧붙일 마크다운 표. 순수 함수. */
export function renderProbeMarkdown(observation: FeedProbeObservation): string {
  const rows = probeRows(observation);
  return [
    `### 피드 진단 — ${cell(observation.sourceId)}`,
    "",
    "M1-41 러너 재확인(일회성) · 수집기와 같은 받기 경로·User-Agent로 요청 1회 · 제목·본문은 기록하지 않음",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    ...rows.map(([label, value]) => `| ${cell(label)} | ${cell(value)} |`),
    "",
  ].join("\n");
}

/** 구조화 로그 필드(값은 enum·숫자·시각만). 순수 함수. */
export function probeLogFields(observation: FeedProbeObservation) {
  const { verdict } = judgeProbe(observation);
  const { outcome } = observation;
  if (!outcome.fetched) {
    return {
      source: observation.sourceId,
      verdict,
      errorType: outcome.kind,
      status: outcome.status,
      elapsedMs: observation.elapsedMs,
    };
  }
  const { info, parse } = outcome;
  return {
    source: observation.sourceId,
    verdict,
    status: info.status,
    mediaType: info.mediaType,
    bytes: info.bytes,
    bodyShape: info.shape,
    redirects: info.redirects,
    ...(parse.ok
      ? {
          items: parse.items,
          latestPubDate: parse.latestPubDate,
          undated: parse.undated,
        }
      : { parseError: parse.parser, line: parse.line, column: parse.column }),
    elapsedMs: observation.elapsedMs,
  };
}
