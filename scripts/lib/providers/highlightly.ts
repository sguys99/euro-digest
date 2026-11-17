/**
 * Highlightly Football API 어댑터 — 클라이언트·응답 경계(zod)·내부 형식 변환 (PRD §15 D80, plan M5-18 — 2026-11-17 API-Football 대체).
 * 외부 응답은 이 파일의 경계에서 파싱해 내부 형식(scripts/lib/match-data.ts `MatchDetail`, providers/api-football.ts `AfFixture`와
 * 같은 모양)으로 바꾼다. 화면·data/·브리핑 입력은 Highlightly 키 이름을 모른다(CLAUDE.md §6.4). 대상 선별·이월·호출 계획은
 * scripts/lib/highlightly-plan.ts, 단계 실행(브리핑 우선·컷오프·시간 예산·탐색)은 scripts/lib/highlightly-stage.ts.
 *
 * 쓰는 요청 (실측 docs/research/m5-highlightly-probe.md · 2026-11-17 구현 실측 20건 — 무료 Basic 플랜 하루 100회)
 *   ① `/matches?date=YYYY-MM-DD&timezone=UTC&leagueId=N` → 그날 그 대회 경기 목록(상태·스코어). **leagueName만 쓰면 나라를
 *      가리지 않는다**(Bundesliga → 독일 + 오스트리아) → 대회는 id로 거른다. 지난 날짜도 열린다(10~13일 전 실측).
 *      응답 `{ data, pagination: { totalCount, offset, limit }, plan: { tier, message } }` — 한 쪽 최대 100, `offset`으로 다음 쪽.
 *   ② `/last-five-games?teamId=N` → 그 팀의 마지막 종료 5경기(모든 대회, 목록 항목과 같은 형식 — 껍데기 없는 배열). 한국 선수 소속팀의
 *      6개 대회 밖 경기(컵·UEL 등) 탐색용(highlightly-stage.ts).
 *   ③ `/matches/{id}` → 경기 1건 상세(배열 1개 원소 — 객체여도 받는다): 머리(상태·스코어) + `events`(득점·교체·카드)
 *   ④ `/lineups/{id}` → `{ homeTeam, awayTeam }` 각 `formation`·`initialLineup`(행 배열 — 첫 행 골키퍼, 이후 포메이션 숫자대로)·
 *      `substitutes`. 행 안 순서는 **왼쪽 → 오른쪽**(2026-11-17 실측 — 브렌트퍼드 4백 Lewis-Potter(LB)…Kayode(RB) · 묀헨글라트바흐
 *      Ullrich(LWB)…Scally(RWB)) → grid "줄:칸"의 칸 1 = 왼쪽(API-Football grid와 같은 방향 — src/lib/team-view.ts)
 *   ⑤ `/box-score/{id}` → 팀별 선수 `{ id, isSubstitute, minutesPlayed, shirtNumber, position, … }` — 출전 시간(한국 선수 경기만 부른다)
 *
 * 응답 경계
 *   - 상태는 `state.description` 원문("Finished" · "Finished after extra time" · "Finished after penalties" · "Postponed" …)을
 *     API-Football 약어(FT·AET·PEN·PST …)로 바꾼다 — 이월 파일·계획 규칙(api-football-plan.ts)을 그대로 쓰기 위해서다(`HL_STATUS_CODES`).
 *   - 스코어 `state.score.current` "1 - 2"(정규 + 연장), 승부차기 `penalties` "4 - 3" → 공통 규칙(match-data.ts — ft는 승부차기 제외).
 *     전반 스코어·연장 경기의 90분 스코어는 응답에 없어 null.
 *   - **선수 이름 표기가 응답마다 다르다**(이벤트 "Lee Jae-Sung" · 박스스코어 "Jae-sung Lee" · "M. Neuer") → 매칭은 선수 id로만.
 *   - 이벤트 `time` "14" · "90+2"(추가 시간). 득점 = Goal(일반) · Penalty(경기 중 PK 성공) · Own Goal. Missed Penalty · VAR … ·
 *     카드 · 교체는 득점이 아니다(VAR로 취소된 골은 Goal 이벤트가 남지 않는다 — 1340510451 실측: 이재성 44분 VAR Goal Cancelled, 스코어 1–2와
 *     Goal 이벤트 3건 일치).
 *   - **자책골 `team`은 득점이 인정된 팀이다**(1325389883 브렌트퍼드 2–0 포리스트 실측: 30분 Own Goal · 선수 밀렌코비치(포리스트 라인업) ·
 *     team 브렌트퍼드). 쪽은 먼저 라인업·박스스코어에서 찾은 선수 팀의 **상대** 쪽으로 정하고(API-Football과 같은 방식 — 한 건 관찰에
 *     기대지 않는다), 선수를 찾지 못하면 이벤트 `team`(인정 팀)을 쓴다.
 *   - **교체 이벤트는 `player`·`playerId` = 나간 선수, `substituted`·`assistingPlayerId` = 들어온 선수**(1340510451 실측: 이재성 63분 ·
 *     네벨 27분 출전과 맞음). 박스스코어 없이 라인업만 있는 경기는 이 이벤트로 교체 출전(cameOn)을 안다.
 *   - 승부차기 킥이 이벤트로 오는지는 확인하지 못했다(실측에 승부차기 경기 없음) — PEN 경기에서 득점 수가 스코어와 다르면 120분 이후
 *     Penalty 이벤트를 빼고 다시 맞춰 보고, 그래도 다르면 득점 목록을 불완전(`goalsComplete: false`)으로 둔다(입력에 없는 사실 금지).
 *   - 로고 URL(`logo` — 팀·선수·대회·나라)·뉴스·예측·배당·통계·경기장은 스키마에 없어 버려진다(CLAUDE.md §1-6). 원본 응답은 저장하지 않는다.
 *
 * 호출 정책 (D80 ③ — 하루 100회, 분당 한도·일 리셋 시각은 문서·헤더에 없다 — 약관 §4.2 분당 초과 시 throttle)
 *   - **동시 1개, 응답(또는 실패) 후 3초 간격**. 근거: 실측 응답 0.4~0.9초 → 분당 약 15건 이하. 실측 32건(7초·3.5초 간격)에서 throttle
 *     없음. 하루 최대 약 65건이 브리핑 컷오프(4분) 안에 브리핑 몫(약 35건)을 끝낼 수 있는 간격이다(API-Football 6.5초면 3.8분).
 *   - HTTP 429는 분당 throttle로 보고 61초 뒤 1회 재시도, 연속 2회면 단계를 멈춘다(API-Football과 같은 규칙). 응답 헤더
 *     `x-ratelimit-requests-remaining`(일 남은 수)이 0이면(또는 429와 함께 0이면) 일 한도 도달(`quota`)로 남은 요청을 보내지 않는다.
 *   - **우리 쪽 호출 상한** `maxCalls`(보낸 요청 — 재시도·실패 포함). 일일 상한(봇 ≤ 65)에서 오늘 쓴 수를 뺀 값을 단계가 넘긴다.
 *   - 요청 타임아웃 15초. 재시도 1회: 5xx·타임아웃 10초 뒤, 429 61초 뒤, 연결 오류는 목록 조회만(API-Football과 같은 근거 — 목록을
 *     잃으면 그날 경기 id를 모른다). 401·403은 `auth`로 멈춘다. 404는 "없음"(null) — 라인업·박스스코어가 없는 경기.
 *   - 목록 응답 `plan.message`가 "All data available …"이 아니면 무료 플랜 제한 알림으로 보고 `plan`(FR-65 강등 — 재시도 없음, 이슈).
 *   - 인증은 `x-rapidapi-key` 헤더(직접 접근 — RapidAPI 호스트 헤더 불필요). 키 값은 로그·오류·경로에 넣지 않는다. 응답 본문은 남기지
 *     않고 오류 메시지의 짧은 문구만(가려서·잘라서) 쓴다.
 */
import { z } from "zod";

import type { CompId } from "@/lib/schema";
import { parseFeedDate } from "@/lib/time";

import { sanitizeText } from "../logger";
import type {
  LineupPlayer,
  LineupPos,
  MatchDetail,
  MatchGoal,
  MatchScore,
  PersonRef,
  Score,
  Side,
  TeamLineup,
} from "../match-data";
import type { FetchLike } from "../rss";
import type { PairingMatch } from "../team-ids";
import {
  AF_FINISHED_STATUSES,
  API_FOOTBALL_RATE_STOP_STREAK,
  goalsMatchScore,
  type AfFixture,
  type ApiFootballErrorKind,
} from "./api-football";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const HIGHLIGHTLY_BASE_URL = "https://soccer.highlightly.net";

/** 응답(또는 실패) 후 다음 요청까지 최소 간격(근거는 머리 주석) */
export const HIGHLIGHTLY_MIN_INTERVAL_MS = 3_000;

/** 요청 1회 타임아웃 — 실측 응답 0.4~1.4초(목록 63KB · 상세 16KB · 박스스코어 38KB) */
export const HIGHLIGHTLY_TIMEOUT_MS = 15_000;

/** 재시도 횟수 — 1회 고정 */
export const HIGHLIGHTLY_MAX_RETRIES = 1;

/** 5xx·타임아웃·(목록의) 연결 오류 재시도 전 대기 */
export const HIGHLIGHTLY_RETRY_DELAY_MS = 10_000;

/** HTTP 429(분당 throttle) 뒤 대기 — 60초 창 + 1초 */
export const HIGHLIGHTLY_RATE_LIMIT_WAIT_MS = 61_000;

/** 요청을 새로 시작할 최소 남은 시간 */
export const HIGHLIGHTLY_MIN_ATTEMPT_MS = 3_000;

/** 목록 한 쪽 크기(API 최대) */
export const HIGHLIGHTLY_PAGE_LIMIT = 100;

/** 목록 조회 1건이 넘길 수 있는 쪽 수 상한 — 하루 한 대회는 1쪽(최대 10경기 남짓)이라 넘을 일이 없다(호출 낭비 방어) */
export const HIGHLIGHTLY_MAX_PAGES = 3;

/** 무료 플랜이 제한 없이 응답할 때의 `plan.message`(2026-11-17 실측) — 이 문구로 시작하지 않으면 제한 알림으로 본다 */
export const HIGHLIGHTLY_PLAN_OK = /^all data available/i;

/**
 * `state.description` → API-Football 상태 약어(이월 파일·계획 규칙 공용 — api-football-plan.ts). 목록은 Highlightly 문서
 * (`/matches` 상태 표)와 같다. 모르는 상태는 "UNK"(미종료로 이월 — 3일·재조회 3회 정리 규칙이 끝낸다).
 * "Abandoned"는 문서상 재개될 수도 있지만 API-Football ABD처럼 경기 없음으로 본다 — 재개되면 새 날짜 목록에 다시 나온다(같은 id).
 */
export const HL_STATUS_CODES: Readonly<Record<string, string>> = Object.freeze({
  "not started": "NS",
  "first half": "1H",
  "half time": "HT",
  "second half": "2H",
  "extra time": "ET",
  "break time": "BT",
  penalties: "P",
  finished: "FT",
  "finished after extra time": "AET",
  "finished after penalties": "PEN",
  postponed: "PST",
  suspended: "SUSP",
  cancelled: "CANC",
  awarded: "AWD",
  interrupted: "INT",
  abandoned: "ABD",
  "in progress": "LIVE",
  unknown: "UNK",
  "to be announced": "TBD",
});

/** 상태 원문 → 약어(모르면 "UNK") */
export function hlStatusCode(description: string): string {
  return HL_STATUS_CODES[description.trim().toLowerCase()] ?? "UNK";
}

// ─── 오류 ────────────────────────────────────────────────────────────────

/** 오류 종류 — API-Football 어댑터와 같은 값(단계 결과 `stoppedBy`·이슈 사건이 한 형식을 쓴다) */
export type HighlightlyErrorKind = ApiFootballErrorKind;

export type HighlightlyRetrySkip = "no-time" | "cap";

/** 어댑터 오류. 응답 본문·키는 메시지에 넣지 않는다 */
export class HighlightlyError extends Error {
  override readonly name = "HighlightlyError";
  readonly kind: HighlightlyErrorKind;
  readonly status: number | null;
  readonly retrySkipped: HighlightlyRetrySkip | null;
  /** rate 오류일 때 연속 429 수(재시도 포함) — 그 밖은 0 */
  readonly rateStreak: number;
  constructor(
    kind: HighlightlyErrorKind,
    message: string,
    detail: {
      status?: number | null;
      retrySkipped?: HighlightlyRetrySkip | null;
      rateStreak?: number;
    } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = detail.status ?? null;
    this.retrySkipped = detail.retrySkipped ?? null;
    this.rateStreak = detail.rateStreak ?? 0;
  }
}

function withRetrySkipped(
  error: HighlightlyError,
  reason: HighlightlyRetrySkip,
): HighlightlyError {
  return new HighlightlyError(error.kind, error.message, {
    status: error.status,
    retrySkipped: reason,
    rateStreak: error.rateStreak,
  });
}

/** 재시도 대상 — 타임아웃·5xx·429, 그리고 `retryNetwork`면 연결 오류 */
export function isRetryableHighlightlyError(
  error: Pick<HighlightlyError, "kind" | "status">,
  retryNetwork = false,
): boolean {
  switch (error.kind) {
    case "timeout":
    case "rate":
      return true;
    case "network":
      return retryNetwork;
    case "http":
      return error.status !== null && error.status >= 500;
    default:
      return false;
  }
}

/** 단계를 더 진행해도 소용없는 오류(api-football.ts `isStageStoppingError`와 같은 규칙) */
export function isHighlightlyStageStoppingError(
  error: Pick<HighlightlyError, "kind"> &
    Partial<Pick<HighlightlyError, "rateStreak">>,
): boolean {
  return (
    error.kind === "plan" ||
    error.kind === "quota" ||
    error.kind === "auth" ||
    error.kind === "cap" ||
    error.kind === "budget" ||
    error.kind === "cancelled" ||
    (error.kind === "rate" &&
      (error.rateStreak ?? 0) >= API_FOOTBALL_RATE_STOP_STREAK)
  );
}

// ─── 응답 헤더 ───────────────────────────────────────────────────────────

export interface HlRateHeaders {
  /** `x-ratelimit-requests-remaining` — 오늘 남은 요청 수 */
  dayRemaining: number | null;
  /** `x-ratelimit-requests-limit` — 일 한도(무료 100) */
  dayLimit: number | null;
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name)?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export function readHlRateHeaders(headers: Headers): HlRateHeaders {
  return {
    dayRemaining: headerInt(headers, "x-ratelimit-requests-remaining"),
    dayLimit: headerInt(headers, "x-ratelimit-requests-limit"),
  };
}

// ─── 응답 껍데기 ─────────────────────────────────────────────────────────

/** 목록 응답 껍데기 — 필요한 키만(`data`는 항목별로 따로 검증한다) */
export const HlListEnvelopeSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z
    .object({
      totalCount: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
    })
    .partial()
    .nullable()
    .optional(),
  plan: z
    .object({
      tier: z.string().nullable().optional(),
      message: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const ERROR_TEXT_MAX = 200;

/** 오류 응답 본문의 `message`만 짧게(가리고 자름) — 본문 전체는 쓰지 않는다 */
function bodyMessage(json: unknown, apiKey: string): string {
  const message =
    json !== null && typeof json === "object" && "message" in json
      ? (json as { message?: unknown }).message
      : null;
  const text = typeof message === "string" ? message : "";
  // 키 모양을 확인하지 못했으므로 실제 키 값도 가린다(오류 문구는 공개 이슈 본문에 들어간다 — CLAUDE §1-8)
  return sanitizeText(
    text.replaceAll(apiKey, "****").replace(/\b[0-9a-f]{32,}\b/gi, "****"),
    ERROR_TEXT_MAX,
  );
}

/** `plan.message`가 제한을 알리는가(없으면 제한 없음으로 본다) */
export function hlPlanRestriction(
  plan: z.infer<typeof HlListEnvelopeSchema>["plan"],
): string | null {
  const message = plan?.message?.trim();
  if (!message || HIGHLIGHTLY_PLAN_OK.test(message)) return null;
  return sanitizeText(message, ERROR_TEXT_MAX);
}

// ─── 클라이언트 ──────────────────────────────────────────────────────────

export interface HighlightlyRetryEvent {
  path: string;
  retry: number;
  error: HighlightlyError;
  delayMs: number;
}

export interface HighlightlyClientOptions {
  /** HIGHLIGHTLY_API_KEY — 출력하지 않는다 */
  apiKey: string;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  rateLimitWaitMs?: number;
  minAttemptMs?: number;
  /** 단계 마감(now 기준 ms) — 넘는 대기·요청은 하지 않고 `budget` */
  deadline?: number | null;
  /** 보낼 수 있는 요청 수 상한(재시도·실패 포함 — 우리 쪽 카운터) */
  maxCalls?: number | null;
  /** 켜지면 새 요청을 보내지 않는다(`cancelled`) */
  signal?: AbortSignal;
  baseUrl?: string;
  onRetry?: (event: HighlightlyRetryEvent) => void;
}

/** 목록 조회 조건(하나 이상 — date·leagueId·season·homeTeamId·awayTeamId) */
export interface HlMatchQuery {
  date?: string;
  leagueId?: number;
  season?: number;
  homeTeamId?: number;
  awayTeamId?: number;
}

export interface HighlightlyClient {
  /** `/matches?…` — 항목 원문 배열(쪽을 넘겨 모은다, 최대 HIGHLIGHTLY_MAX_PAGES 쪽). 연결 오류도 1회 재시도 */
  listMatches(query: HlMatchQuery): Promise<unknown[]>;
  /** `/last-five-games?teamId=` — 항목 원문 배열 */
  lastFiveGames(teamId: number): Promise<unknown[]>;
  /** `/matches/{id}` — 경기 1건 원문(없으면 null) */
  getMatch(id: number): Promise<unknown>;
  /** `/lineups/{id}` — 원문(없으면 null) */
  getLineups(id: number): Promise<unknown>;
  /** `/box-score/{id}` — 원문 배열(없으면 null) */
  getBoxScore(id: number): Promise<unknown[] | null>;
  /** 보낸 요청 수(실패·재시도 포함) — runs.json apiCalls.highlightly */
  readonly calls: number;
  readonly retries: number;
  readonly rate: HlRateHeaders;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function positiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new HighlightlyError(
      "format",
      `${label}가 양의 정수가 아니다: ${value}`,
    );
  }
  return value;
}

/** 목록 조회 경로(키 없음) — 조건이 하나도 없거나 형식이 틀리면 던진다 */
export function matchesListPath(query: HlMatchQuery, offset = 0): string {
  const params = new URLSearchParams();
  if (query.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      throw new HighlightlyError("format", `날짜 형식이 아니다: ${query.date}`);
    }
    params.set("date", query.date);
    params.set("timezone", "UTC");
  }
  if (query.leagueId !== undefined)
    params.set("leagueId", String(positiveInt(query.leagueId, "leagueId")));
  if (query.season !== undefined)
    params.set("season", String(positiveInt(query.season, "season")));
  if (query.homeTeamId !== undefined)
    params.set(
      "homeTeamId",
      String(positiveInt(query.homeTeamId, "homeTeamId")),
    );
  if (query.awayTeamId !== undefined)
    params.set(
      "awayTeamId",
      String(positiveInt(query.awayTeamId, "awayTeamId")),
    );
  if ([...params.keys()].filter((k) => k !== "timezone").length === 0) {
    throw new HighlightlyError("format", "목록 조회 조건이 없다");
  }
  params.set("limit", String(HIGHLIGHTLY_PAGE_LIMIT));
  params.set("offset", String(offset));
  return `/matches?${params.toString()}`;
}

function isAbortLike(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export function createHighlightlyClient(
  options: HighlightlyClientOptions,
): HighlightlyClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new HighlightlyError("format", "HIGHLIGHTLY_API_KEY가 비어 있다");
  }
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? HIGHLIGHTLY_MIN_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? HIGHLIGHTLY_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? HIGHLIGHTLY_RETRY_DELAY_MS;
  const rateLimitWaitMs =
    options.rateLimitWaitMs ?? HIGHLIGHTLY_RATE_LIMIT_WAIT_MS;
  const minAttemptMs = options.minAttemptMs ?? HIGHLIGHTLY_MIN_ATTEMPT_MS;
  const deadline = options.deadline ?? null;
  const maxCalls = options.maxCalls ?? null;
  const baseUrl = options.baseUrl ?? HIGHLIGHTLY_BASE_URL;
  let lastResponseAt: number | null = null;
  let guardUntil = 0;
  let calls = 0;
  let retries = 0;
  let rateStreak = 0;
  let rate: HlRateHeaders = { dayRemaining: null, dayLimit: null };
  let queue: Promise<unknown> = Promise.resolve();

  const budgetError = (message: string) =>
    new HighlightlyError("budget", message);
  const noTimeFor = (waitMs: number): boolean =>
    deadline !== null && now() + waitMs + minAttemptMs > deadline;
  const capReached = () => maxCalls !== null && calls >= maxCalls;

  async function waitTurn(): Promise<void> {
    const readyAt = Math.max(
      lastResponseAt === null ? 0 : lastResponseAt + minIntervalMs,
      guardUntil,
    );
    const wait = readyAt - now();
    if (noTimeFor(Math.max(0, wait))) {
      throw budgetError("Highlightly 단계 시간 예산 소진 — 요청하지 않음");
    }
    if (wait > 0) await sleep(wait);
  }

  /** 요청 1회(재시도 없음) → JSON 원문. 404는 null */
  async function attempt(pathAndQuery: string, label: string) {
    if (options.signal?.aborted) {
      throw new HighlightlyError(
        "cancelled",
        "Highlightly 요청 중단(호출부 취소)",
      );
    }
    if (capReached()) {
      throw new HighlightlyError(
        "cap",
        `Highlightly 호출 상한(${maxCalls}회) 도달 — 요청하지 않음`,
      );
    }
    if (rate.dayRemaining === 0) {
      throw new HighlightlyError(
        "quota",
        "Highlightly 일 한도 도달(응답 헤더 남은 수 0) — 요청하지 않음",
      );
    }
    await waitTurn();
    if (options.signal?.aborted) {
      throw new HighlightlyError(
        "cancelled",
        "Highlightly 요청 중단(호출부 취소)",
      );
    }
    const start = now();
    let attemptTimeout = timeoutMs;
    let boundByDeadline = false;
    if (deadline !== null) {
      const remaining = deadline - start;
      if (remaining < minAttemptMs) {
        throw budgetError("Highlightly 단계 시간 예산 소진 — 요청하지 않음");
      }
      if (remaining <= timeoutMs) {
        attemptTimeout = remaining;
        boundByDeadline = true;
      }
    }
    const timedOut = () =>
      boundByDeadline
        ? budgetError(
            `Highlightly 단계 시간 예산 소진으로 요청 중단 (${attemptTimeout}ms)`,
          )
        : new HighlightlyError(
            "timeout",
            `Highlightly ${label} 요청 시간 초과 (${attemptTimeout}ms)`,
          );
    calls += 1;
    const flag = { rated: false };
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}${pathAndQuery}`, {
        headers: { "x-rapidapi-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(attemptTimeout),
      });
    } catch (error) {
      lastResponseAt = now();
      rateStreak = 0;
      if (isAbortLike(error)) throw timedOut();
      throw new HighlightlyError(
        "network",
        `Highlightly ${label} 요청 실패(연결 오류)`,
      );
    }
    try {
      const next = readHlRateHeaders(response.headers);
      rate = {
        dayRemaining: next.dayRemaining ?? rate.dayRemaining,
        dayLimit: next.dayLimit ?? rate.dayLimit,
      };
      const status = response.status;
      if (status === 404) return null;
      if (!response.ok) {
        let json: unknown = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        const detail = bodyMessage(json, apiKey);
        const suffix = detail ? ` — ${detail}` : "";
        if (status === 429) {
          if (next.dayRemaining === 0) {
            throw new HighlightlyError(
              "quota",
              `Highlightly ${label} 응답 HTTP 429(일 한도 — 남은 수 0)${suffix}`,
              { status },
            );
          }
          flag.rated = true;
          rateStreak += 1;
          guardUntil = Math.max(guardUntil, now() + rateLimitWaitMs);
          throw new HighlightlyError(
            "rate",
            `Highlightly ${label} 응답 HTTP 429(분당 throttle)${suffix}`,
            { status, rateStreak },
          );
        }
        throw new HighlightlyError(
          status === 401 || status === 403
            ? "auth"
            : status >= 400 && status < 500
              ? "api"
              : "http",
          `Highlightly ${label} 응답 HTTP ${status}${suffix}`,
          { status },
        );
      }
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        if (isAbortLike(error)) throw timedOut();
        throw new HighlightlyError(
          "format",
          `Highlightly ${label} 응답 JSON 파싱 실패`,
          { status },
        );
      }
    } finally {
      lastResponseAt = now();
      if (!flag.rated) rateStreak = 0;
    }
  }

  async function request(
    pathAndQuery: string,
    label: string,
    retryNetwork: boolean,
  ): Promise<unknown> {
    for (let attempted = 0; ; attempted += 1) {
      try {
        return await attempt(pathAndQuery, label);
      } catch (error) {
        if (!(error instanceof HighlightlyError)) throw error;
        if (
          attempted >= HIGHLIGHTLY_MAX_RETRIES ||
          !isRetryableHighlightlyError(error, retryNetwork)
        ) {
          throw error;
        }
        const base = error.kind === "rate" ? rateLimitWaitMs : retryDelayMs;
        const delayMs = Math.max(base, minIntervalMs);
        if (noTimeFor(delayMs)) throw withRetrySkipped(error, "no-time");
        if (capReached()) throw withRetrySkipped(error, "cap");
        retries += 1;
        options.onRetry?.({
          path: pathAndQuery,
          retry: retries,
          error,
          delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  /** 목록 1쪽 → 항목·전체 수. plan 제한이면 던진다 */
  async function listPage(
    path: string,
    label: string,
  ): Promise<{ items: unknown[]; total: number | null }> {
    const json = await enqueue(() => request(path, label, true));
    // 목록은 결과가 없어도 200 + 빈 data로 온다(실측) — 404는 경로·API 변경이므로 "0경기"로 받지 않는다(원장 공백이 조용히 치유되지 않게)
    if (json === null) {
      throw new HighlightlyError("api", `Highlightly ${label} 404`, {
        status: 404,
      });
    }
    const envelope = HlListEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new HighlightlyError(
        "format",
        `Highlightly ${label} 응답 형식이 다르다(data 배열 없음)`,
      );
    }
    const restriction = hlPlanRestriction(envelope.data.plan);
    if (restriction !== null) {
      throw new HighlightlyError(
        "plan",
        `Highlightly ${label} 응답 plan 제한: ${restriction}`,
        { status: 200 },
      );
    }
    return {
      items: envelope.data.data,
      total: envelope.data.pagination?.totalCount ?? null,
    };
  }

  return {
    async listMatches(query) {
      const items: unknown[] = [];
      for (let page = 0; page < HIGHLIGHTLY_MAX_PAGES; page += 1) {
        const offset = page * HIGHLIGHTLY_PAGE_LIMIT;
        const got = await listPage(matchesListPath(query, offset), "목록 조회");
        items.push(...got.items);
        const total = got.total ?? items.length;
        if (
          got.items.length < HIGHLIGHTLY_PAGE_LIMIT ||
          items.length >= total
        ) {
          break;
        }
      }
      return items;
    },
    async lastFiveGames(teamId) {
      const path = `/last-five-games?teamId=${positiveInt(teamId, "teamId")}`;
      const json = await enqueue(() => request(path, "최근 5경기", true));
      if (json === null) return [];
      if (!Array.isArray(json)) {
        throw new HighlightlyError(
          "format",
          "Highlightly 최근 5경기 응답이 배열이 아니다",
        );
      }
      return json;
    },
    async getMatch(id) {
      const path = `/matches/${positiveInt(id, "경기 id")}`;
      const json = await enqueue(() => request(path, "경기 상세", false));
      if (json === null) return null;
      if (Array.isArray(json)) return json[0] ?? null;
      return json;
    },
    async getLineups(id) {
      const path = `/lineups/${positiveInt(id, "경기 id")}`;
      return enqueue(() => request(path, "라인업", false));
    },
    async getBoxScore(id) {
      const path = `/box-score/${positiveInt(id, "경기 id")}`;
      const json = await enqueue(() => request(path, "박스스코어", false));
      if (json === null) return null;
      if (!Array.isArray(json)) {
        throw new HighlightlyError(
          "format",
          "Highlightly 박스스코어 응답이 배열이 아니다",
        );
      }
      return json;
    },
    get calls() {
      return calls;
    },
    get retries() {
      return retries;
    },
    get rate() {
      return rate;
    },
  };
}

// ─── 응답 경계 스키마 (필요한 필드만 — logo·news·predictions·statistics 등은 버려진다) ─────

const PositiveId = z.number().int().positive();
/** 선수 id — 없거나 양수가 아니면 null */
const NullableId = z
  .number()
  .int()
  .nullable()
  .optional()
  .transform((v) => (v !== null && v !== undefined && v > 0 ? v : null));
const NullableText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v?.trim() || null);

const HlTeamSchema = z.object({ id: PositiveId, name: z.string().min(1) });

/** 목록·상세 공통 머리 */
export const HlMatchCoreSchema = z.object({
  id: PositiveId,
  round: z.string().nullable().optional(),
  date: z.string(),
  league: z.object({
    id: PositiveId,
    name: z.string(),
    season: z.number().int().nullable().optional(),
  }),
  homeTeam: HlTeamSchema,
  awayTeam: HlTeamSchema,
  state: z.object({
    description: z.string().min(1),
    score: z
      .object({
        current: z.string().nullable().optional(),
        penalties: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
});
type HlMatchCore = z.infer<typeof HlMatchCoreSchema>;

/** 상세 — 머리 + events(항목은 하나씩 검증) */
export const HlMatchDetailSchema = HlMatchCoreSchema.extend({
  events: z.array(z.unknown()).nullable().optional(),
});

/** events[] 한 건 */
export const HlEventSchema = z.object({
  team: z.object({ id: PositiveId.nullable().optional() }).nullable(),
  time: z.string(),
  type: z.string(),
  player: NullableText,
  playerId: NullableId,
  assist: NullableText,
  assistingPlayerId: NullableId,
  substituted: NullableText,
});

const HlShirtNumber = z.number().int().min(0).max(99).nullable().catch(null);

/** 라인업·박스스코어 선수 포지션 원문 → G·D·M·F(문서 "Forward", 실측 표기 "Attacker"도 받는다) */
export function hlPosition(raw: string | null | undefined): LineupPos | null {
  switch (raw?.trim().toLowerCase()) {
    case "goalkeeper":
      return "G";
    case "defender":
      return "D";
    case "midfielder":
      return "M";
    case "forward":
    case "attacker":
      return "F";
    default:
      return null;
  }
}

const HlLineupPlayerSchema = z.object({
  id: NullableId,
  name: z.string(),
  number: HlShirtNumber.optional(),
  position: z.string().nullable().optional(),
});
type HlLineupPlayer = z.infer<typeof HlLineupPlayerSchema>;

const HlLineupTeamSchema = z.object({
  id: PositiveId.nullable().optional(),
  formation: z.string().nullable().optional(),
  initialLineup: z.array(z.unknown()).nullable().optional(),
  substitutes: z.array(z.unknown()).nullable().optional(),
});

/** `/lineups/{id}` 응답 */
export const HlLineupsSchema = z.object({
  homeTeam: HlLineupTeamSchema.nullable().optional(),
  awayTeam: HlLineupTeamSchema.nullable().optional(),
});

/** `/box-score/{id}` 팀 1개 — 선수는 하나씩 검증 */
export const HlBoxTeamSchema = z.object({
  team: z.object({ id: PositiveId }),
  players: z.array(z.unknown()),
});

/** 박스스코어 선수 1명 — 출전 판정에 필요한 필드만 */
export const HlBoxPlayerSchema = z.object({
  id: PositiveId,
  name: z.string().min(1),
  shirtNumber: HlShirtNumber.optional(),
  position: z.string().nullable().optional(),
  isSubstitute: z.boolean(),
  minutesPlayed: z.number().int().nonnegative().nullable().catch(null),
});
type HlBoxPlayer = z.infer<typeof HlBoxPlayerSchema>;

// ─── 내부 형식 변환 (순수 함수) ──────────────────────────────────────────

/** "1 - 2" → { home: 1, away: 2 }(형식이 아니면 null) */
export function parseHlScore(raw: string | null | undefined): Score | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw ?? "");
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/** 이벤트 시각 "14" · "90+2" · "45 + 5'" → 분·추가 시간(형식이 아니면 null) */
export function parseHlMinute(
  raw: string,
): { minute: number; extra: number | null } | null {
  const m = /^\s*(\d+)\s*(?:\+\s*(\d+))?\s*'?\s*$/.exec(raw);
  if (!m) return null;
  return {
    minute: Number(m[1]),
    extra: m[2] === undefined ? null : Number(m[2]),
  };
}

function coreToFixture(core: HlMatchCore): AfFixture | null {
  const kickoff = parseFeedDate(core.date);
  if (kickoff === null) return null;
  return {
    matchId: core.id,
    leagueId: core.league.id,
    leagueName: core.league.name,
    season: core.league.season ?? null,
    round: core.round?.trim() || null,
    kickoff,
    status: hlStatusCode(core.state.description),
    home: { id: core.homeTeam.id, name: core.homeTeam.name },
    away: { id: core.awayTeam.id, name: core.awayTeam.name },
    goals: parseHlScore(core.state.score?.current),
  };
}

/**
 * 목록 항목 원문 → 내부 형식(API-Football `AfFixture`와 같은 모양 — 상태는 약어). 형식이 틀리거나 팀·킥오프가 없으면 null.
 * 아직 시작하지 않은 경기의 `goals`는 null이다(스코어 원문 없음 또는 형식 밖).
 */
export function toHlFixture(raw: unknown): AfFixture | null {
  const parsed = HlMatchCoreSchema.safeParse(raw);
  return parsed.success ? coreToFixture(parsed.data) : null;
}

/** 종료 상태 + 스코어 원문 → 공통 스코어(쓸 수 없으면 null — 스코어 없음 · 승부차기 경기인데 승부차기 스코어 없음) */
export function toHlMatchScore(
  status: string,
  current: Score | null,
  penaltiesRaw: string | null | undefined,
): MatchScore | null {
  if (current === null) return null;
  switch (status) {
    case "FT":
      return {
        ft: current,
        ht: null,
        regular: current,
        pens: null,
        duration: "REGULAR",
      };
    case "AET":
      return {
        ft: current,
        ht: null,
        regular: null,
        pens: null,
        duration: "EXTRA_TIME",
      };
    case "PEN": {
      const pens = parseHlScore(penaltiesRaw);
      if (pens === null) return null;
      // 승부차기 경기의 `current`에 승부차기 골이 섞이는지 실측이 없다 — 연장까지 비긴 스코어일 때만 받는다(아니면 쓰지 않음)
      if (current.home !== current.away) return null;
      return {
        ft: current,
        ht: null,
        regular: null,
        pens,
        duration: "PENALTY_SHOOTOUT",
      };
    }
    default:
      return null;
  }
}

const otherSide = (side: Side): Side => (side === "home" ? "away" : "home");

/** 득점 이벤트 종류(Goal·Penalty·Own Goal) — 그 밖은 null */
function goalKindOf(type: string): MatchGoal["kind"] | null {
  switch (type.trim().toLowerCase()) {
    case "goal":
      return "normal";
    case "penalty":
      return "penalty";
    case "own goal":
      return "own-goal";
    default:
      return null;
  }
}

/** 득점 이벤트로 보이는 원문인가(형식 오류 항목 — 득점이었는지 알 수 없으면 불완전으로 센다) */
function looksLikeGoal(raw: unknown): boolean {
  const type = (raw as { type?: unknown } | null)?.type;
  return typeof type !== "string" || goalKindOf(type) !== null;
}

export interface HlGoalsParse {
  goals: MatchGoal[];
  /** 해석하지 못한 득점 이벤트 수 */
  unresolved: number;
}

/**
 * events 원문 → 경기 중 득점(시간 순, 순수 함수 — 머리 주석 "응답 경계"). 일반·PK는 이벤트 `team`의 쪽, 자책골은 `sideOfPlayer`
 * (라인업·박스스코어)로 찾은 선수 팀의 상대 쪽 → 못 찾으면 이벤트 `team`(인정 팀 — 실측). `dropShootout`이면 120분 이후 PK 이벤트를
 * 득점에서 뺀다(승부차기 킥 — 확인하지 못한 경우의 보정, toHlMatchDetail).
 */
export function parseHlGoalEvents(
  rawEvents: readonly unknown[],
  ctx: {
    homeId: number;
    awayId: number;
    sideOfPlayer: (playerId: number | null) => Side | null;
    dropShootout?: boolean;
  },
): HlGoalsParse {
  const goals: Array<{ goal: MatchGoal; order: number }> = [];
  const cancels: Array<{ order: number; playerId: number | null }> = [];
  let unresolved = 0;
  rawEvents.forEach((raw, order) => {
    const parsed = HlEventSchema.safeParse(raw);
    if (!parsed.success) {
      if (looksLikeGoal(raw)) unresolved += 1;
      return;
    }
    const e = parsed.data;
    if (/cancel|disallow/i.test(e.type)) {
      cancels.push({ order, playerId: e.playerId });
      return;
    }
    const kind = goalKindOf(e.type);
    if (kind === null) return;
    const time = parseHlMinute(e.time);
    if (time === null || e.player === null) {
      unresolved += 1;
      return;
    }
    if (ctx.dropShootout && kind === "penalty" && time.minute >= 120) return;
    const teamSide: Side | null =
      e.team?.id === ctx.homeId
        ? "home"
        : e.team?.id === ctx.awayId
          ? "away"
          : null;
    let side: Side | null;
    if (kind === "own-goal") {
      const playerSide = ctx.sideOfPlayer(e.playerId);
      side = playerSide === null ? teamSide : otherSide(playerSide);
    } else {
      side = teamSide;
    }
    if (side === null) {
      unresolved += 1;
      return;
    }
    const scorer: PersonRef = { id: e.playerId, name: e.player };
    goals.push({
      goal: {
        minute: time.minute,
        extra: time.extra,
        side,
        kind,
        scorer,
        assist:
          kind === "own-goal" || e.assist === null
            ? null
            : { id: e.assistingPlayerId, name: e.assist },
      },
      order,
    });
  });
  // VAR 취소 — 실측(1340510451)에서는 취소된 골의 Goal 이벤트가 남지 않았지만, 남아 오는 경기도 있을 수 있다. 취소 이벤트 앞의 같은
  // 선수 득점 중 가장 가까운 것을 지운다(못 찾으면 그대로 — 실측과 같은 경우). 선수 id가 없으면 해석하지 못한 것으로 센다.
  for (const c of cancels) {
    if (c.playerId === null) {
      unresolved += 1;
      continue;
    }
    let at = -1;
    goals.forEach((g, i) => {
      if (g.order < c.order && g.goal.scorer.id === c.playerId) at = i;
    });
    if (at >= 0) goals.splice(at, 1);
  }
  goals.sort(
    (a, b) =>
      a.goal.minute - b.goal.minute ||
      (a.goal.extra ?? 0) - (b.goal.extra ?? 0) ||
      a.order - b.order,
  );
  return { goals: goals.map((g) => g.goal), unresolved };
}

/** 교체로 들어온 선수 id(교체 이벤트의 `assistingPlayerId` — 머리 주석) */
export function hlSubstitutedIn(rawEvents: readonly unknown[]): Set<number> {
  const ids = new Set<number>();
  for (const raw of rawEvents) {
    const parsed = HlEventSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (parsed.data.type.trim().toLowerCase() !== "substitution") continue;
    if (parsed.data.assistingPlayerId !== null) {
      ids.add(parsed.data.assistingPlayerId);
    }
  }
  return ids;
}

/** 라인업 선수 원문 목록(형식이 틀린 선수는 버린다) */
function lineupPlayersOf(raw: readonly unknown[]): HlLineupPlayer[] {
  return raw.flatMap((r) => {
    const p = HlLineupPlayerSchema.safeParse(r);
    return p.success && p.data.name.trim() ? [p.data] : [];
  });
}

/**
 * `initialLineup` → 행(첫 행 골키퍼). 행 배열이면 그대로, 평평한 배열이면 포메이션 숫자대로 나눈다(합이 맞을 때만 — 아니면 행 없이
 * 한 줄로 두고 grid를 만들지 않는다).
 */
export function hlLineupRows(
  initial: readonly unknown[],
  formation: string | null,
): { rows: HlLineupPlayer[][]; gridded: boolean } {
  if (initial.length > 0 && initial.every((r) => Array.isArray(r))) {
    return {
      rows: initial.map((r) => lineupPlayersOf(r as unknown[])),
      gridded: true,
    };
  }
  const flat = lineupPlayersOf(initial);
  const counts = (formation ?? "")
    .split("-")
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  const total = 1 + counts.reduce((a, b) => a + b, 0);
  if (counts.length === 0 || total !== flat.length) {
    return { rows: [flat], gridded: false };
  }
  const rows: HlLineupPlayer[][] = [flat.slice(0, 1)];
  let at = 1;
  for (const n of counts) {
    rows.push(flat.slice(at, at + n));
    at += n;
  }
  return { rows, gridded: true };
}

interface BoxSide {
  players: HlBoxPlayer[];
}

/** 박스스코어 원문 → 쪽별 선수(팀 id로 쪽을 정한다 — 형식이 틀리거나 팀이 다르면 그쪽은 없음) */
export function hlBoxSides(
  rawBox: readonly unknown[] | null,
  homeId: number,
  awayId: number,
): { home: BoxSide | null; away: BoxSide | null } {
  const sides: { home: BoxSide | null; away: BoxSide | null } = {
    home: null,
    away: null,
  };
  for (const raw of rawBox ?? []) {
    const team = HlBoxTeamSchema.safeParse(raw);
    if (!team.success) continue;
    const side: Side | null =
      team.data.team.id === homeId
        ? "home"
        : team.data.team.id === awayId
          ? "away"
          : null;
    if (side === null || sides[side] !== null) continue;
    sides[side] = {
      players: team.data.players.flatMap((p) => {
        const parsed = HlBoxPlayerSchema.safeParse(p);
        return parsed.success ? [parsed.data] : [];
      }),
    };
  }
  return sides;
}

/**
 * 한 쪽 라인업(`TeamLineup`) — 라인업 응답이 있으면 그것(포메이션·grid·등번호·포지션) + 박스스코어 출전 시간(선수 id), 박스스코어가
 * 없으면 출전 시간 null. 교체 출전(cameOn)은 박스스코어와 상관없이 교체 이벤트로 표시한다(박스스코어 0분 = 90+n분 투입일 수 있다). 라인업 응답이 없고 박스스코어만 있으면 박스스코어로 선발(isSubstitute
 * false)·교체 명단을 만든다(포메이션·grid null). 둘 다 없으면 null.
 */
export function hlTeamLineup(input: {
  lineup: z.infer<typeof HlLineupTeamSchema> | null;
  box: BoxSide | null;
  cameOn: ReadonlySet<number>;
}): TeamLineup | null {
  const minutes = new Map<number, number | null>(
    (input.box?.players ?? []).map((p) => [p.id, p.minutesPlayed] as const),
  );
  const lineupPlayer = (
    p: HlLineupPlayer,
    grid: string | null,
    starter: boolean,
  ): LineupPlayer => {
    const came = !starter && p.id !== null && input.cameOn.has(p.id);
    const boxMins = p.id === null ? null : (minutes.get(p.id) ?? null);
    // 박스스코어 분은 추가 시간을 빼고 90 − 투입 분으로 센다(86분 투입 → 4) — 90+n분 투입은 0이 되므로 교체로 들어온 선수의 0분은 모름(null)
    const mins = came && boxMins === 0 ? null : boxMins;
    return {
      id: p.id,
      name: p.name.trim(),
      minutes: mins,
      number: p.number ?? null,
      pos: hlPosition(p.position),
      grid,
      ...(came ? { cameOn: true } : {}),
    };
  };
  const l = input.lineup;
  if (l) {
    const formation = l.formation?.trim() || null;
    const { rows, gridded } = hlLineupRows(l.initialLineup ?? [], formation);
    const startXI = rows.flatMap((row, r) =>
      row.map((p, c) =>
        lineupPlayer(p, gridded ? `${r + 1}:${c + 1}` : null, true),
      ),
    );
    if (startXI.length > 0) {
      return {
        formation,
        startXI,
        substitutes: lineupPlayersOf(l.substitutes ?? []).map((p) =>
          lineupPlayer(p, null, false),
        ),
      };
    }
  }
  if (input.box === null || input.box.players.length === 0) return null;
  const fromBox = (p: HlBoxPlayer): LineupPlayer => {
    const came = p.isSubstitute === true && input.cameOn.has(p.id);
    return {
      id: p.id,
      name: p.name.trim(),
      minutes: came && p.minutesPlayed === 0 ? null : p.minutesPlayed,
      number: p.shirtNumber ?? null,
      pos: hlPosition(p.position),
      grid: null,
      ...(came ? { cameOn: true } : {}),
    };
  };
  return {
    formation: null,
    startXI: input.box.players.filter((p) => !p.isSubstitute).map(fromBox),
    substitutes: input.box.players.filter((p) => p.isSubstitute).map(fromBox),
  };
}

/** 라인업 응답 → 쪽별 원문(응답의 팀 id가 있으면 경기 팀과 맞을 때만 — 어긋나면 그쪽은 없음) */
function lineupSides(
  raw: unknown,
  homeId: number,
  awayId: number,
): {
  home: z.infer<typeof HlLineupTeamSchema> | null;
  away: z.infer<typeof HlLineupTeamSchema> | null;
} {
  const parsed = HlLineupsSchema.safeParse(raw);
  if (!parsed.success) return { home: null, away: null };
  const pick = (
    team: z.infer<typeof HlLineupTeamSchema> | null | undefined,
    id: number,
  ) => (team && (team.id == null || team.id === id) ? team : null);
  return {
    home: pick(parsed.data.homeTeam, homeId),
    away: pick(parsed.data.awayTeam, awayId),
  };
}

export type HlDetailResult =
  | { kind: "finished"; detail: MatchDetail }
  /** 아직 끝나지 않았거나 경기 없이 끝난 상태 — 머리만(이월·정리 판단) */
  | { kind: "not-finished"; fixture: AfFixture }
  | { kind: "invalid"; reason: string };

/**
 * 경기 상세 + 라인업 + 박스스코어 원문 → 종료 경기 상세(순수 함수). 종료(FT·AET·PEN)가 아니면 `not-finished`(머리만), 머리 형식이
 * 틀리거나 스코어를 만들 수 없으면 `invalid`. 라인업·박스스코어는 없어도 된다(null — 받지 못한 경기는 그쪽 라인업 없이 원장에
 * 들어가 불완전 항목으로 다시 받는다, match-ledger.ts `isIncompleteLedgerMatch`).
 */
export function toHlMatchDetail(
  input: { match: unknown; lineups: unknown; box: readonly unknown[] | null },
  ctx: { compByLeague: ReadonlyMap<number, CompId>; fetchedAt: string },
): HlDetailResult {
  const parsed = HlMatchDetailSchema.safeParse(input.match);
  if (!parsed.success) {
    return { kind: "invalid", reason: "경기 머리 형식이 다르다" };
  }
  const core = parsed.data;
  const fixture = coreToFixture(core);
  if (fixture === null) {
    return { kind: "invalid", reason: "킥오프 시각을 해석할 수 없다" };
  }
  if (!AF_FINISHED_STATUSES.has(fixture.status)) {
    return { kind: "not-finished", fixture };
  }
  const score = toHlMatchScore(
    fixture.status,
    fixture.goals,
    core.state.score?.penalties,
  );
  if (score === null) {
    return {
      kind: "invalid",
      reason: `종료(${fixture.status}) 경기 스코어가 없다(current·penalties)`,
    };
  }
  const events = core.events ?? [];
  const cameOn = hlSubstitutedIn(events);
  const box = hlBoxSides(input.box, fixture.home.id, fixture.away.id);
  const lineupRaw = lineupSides(
    input.lineups,
    fixture.home.id,
    fixture.away.id,
  );
  const lineups: MatchDetail["lineups"] = {
    home: hlTeamLineup({ lineup: lineupRaw.home, box: box.home, cameOn }),
    away: hlTeamLineup({ lineup: lineupRaw.away, box: box.away, cameOn }),
  };
  // 자책 선수의 팀 — 라인업(선발·교체 명단) → 박스스코어
  const sideOfPlayer = (playerId: number | null): Side | null => {
    if (playerId === null) return null;
    for (const side of ["home", "away"] as const) {
      const l = lineups[side];
      if (
        l &&
        (l.startXI.some((p) => p.id === playerId) ||
          l.substitutes.some((p) => p.id === playerId))
      ) {
        return side;
      }
      if (box[side]?.players.some((p) => p.id === playerId)) return side;
    }
    return null;
  };
  const ctxGoals = {
    homeId: fixture.home.id,
    awayId: fixture.away.id,
    sideOfPlayer,
  };
  let parsedGoals = parseHlGoalEvents(events, ctxGoals);
  if (
    score.duration === "PENALTY_SHOOTOUT" &&
    !goalsMatchScore(parsedGoals.goals, score.ft)
  ) {
    // 승부차기 킥이 PK 이벤트로 섞였을 수 있다(확인하지 못함 — 머리 주석) — 120분 이후 PK를 빼고 맞으면 그 목록
    const retry = parseHlGoalEvents(events, {
      ...ctxGoals,
      dropShootout: true,
    });
    if (goalsMatchScore(retry.goals, score.ft)) parsedGoals = retry;
  }
  return {
    kind: "finished",
    detail: {
      provider: "highlightly",
      matchId: fixture.matchId,
      leagueId: fixture.leagueId,
      leagueName: fixture.leagueName,
      comp: ctx.compByLeague.get(fixture.leagueId) ?? null,
      season: fixture.season,
      round: fixture.round,
      kickoff: fixture.kickoff,
      status: fixture.status as MatchDetail["status"],
      home: { ...fixture.home, fullName: null },
      away: { ...fixture.away, fullName: null },
      score,
      goals: parsedGoals.goals,
      goalsComplete:
        parsedGoals.unresolved === 0 &&
        goalsMatchScore(parsedGoals.goals, score.ft),
      lineups,
      fetchedAt: ctx.fetchedAt,
    },
  };
}

/** 목록 항목 → 짝짓기 입력(6개 대회 경기만, 종료일 때만 ft — api-football.ts `afFixtureToPairing`과 같은 규칙) */
export function hlFixtureToPairing(
  fixture: AfFixture,
  compByLeague: ReadonlyMap<number, CompId>,
): PairingMatch | null {
  const comp = compByLeague.get(fixture.leagueId);
  if (!comp) return null;
  return {
    matchId: fixture.matchId,
    comp,
    kickoff: fixture.kickoff,
    home: fixture.home,
    away: fixture.away,
    ft: AF_FINISHED_STATUSES.has(fixture.status) ? fixture.goals : null,
  };
}
