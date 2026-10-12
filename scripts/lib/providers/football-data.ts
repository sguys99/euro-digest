/**
 * football-data.org v4 최소 어댑터 (M1-01 수직 슬라이스 → M1-44가 확장, M2-02가 대회 페이지용으로 확장).
 * 외부 응답은 이 파일에서 내부 형식(`MatchResult`)으로 바꾼다 — 화면·data/·브리핑 입력은 football-data 형식을 모른다
 * (CLAUDE.md §6.4).
 *
 * 지금 하는 일: 교차 엔드포인트 `/v4/matches?competitions=<6개 코드>&dateFrom&dateTo` **1요청**으로 6개 대회 경기를 받아
 * 입력 창 안에서 종료(FINISHED)된 경기만 고른다. 순위표(M1-44)·득점자(API-Football, M1-48)는 아직 없다.
 *
 * 호출 정책 (M0-28, CLAUDE.md §6.4)
 *   - 분당 10회 → 동시 1개, **응답 후 6.5초 간격**(`FOOTBALL_DATA_MIN_INTERVAL_MS`). 클라이언트 하나가 간격을 지킨다.
 *   - 인증은 `X-Auth-Token` 헤더. 키 값은 로그·오류 메시지에 넣지 않는다. 요청 경로에도 키가 없다.
 *   - 재시도 없음(슬라이스). 실패하면 그날 브리핑만 건너뛰고 뉴스는 발행한다(호출부).
 * 응답 주의 (fixtures/football/README.md)
 *   - 교차 `/v4/matches`는 `dateTo` 당일을 빼고 준다(`cross-endpoint-dateto-exclusive`) → 창의 UTC 시작일·끝 날짜를
 *     dateFrom·dateTo로 보내고, 받은 뒤 킥오프 시각으로 창을 다시 거른다(포함 여부가 바뀌어도 결과가 같다).
 *   - `IN_PLAY`·`CANCELLED`에도 `score.fullTime`이 채워져 온다 → status로 거른다.
 *   - `score.fullTime`은 승부차기 골을 포함한다(duration `PENALTY_SHOOTOUT`) — 그대로 넘기고 duration을 함께 준다.
 *   - 로고(crest·emblem)·배당은 읽지 않는다.
 */
import { z } from "zod";

import { IsoSchema, type CompId, type CompetitionConfig } from "@/lib/schema";
import type { UtcRange } from "@/lib/time";

import type { FetchLike } from "../rss";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

/** 응답 후 다음 요청까지 최소 간격 — 분당 10회 한도 안(M0-28) */
export const FOOTBALL_DATA_MIN_INTERVAL_MS = 6_500;

/** 요청 1회 타임아웃 */
export const FOOTBALL_DATA_TIMEOUT_MS = 15_000;

// ─── 오류 ────────────────────────────────────────────────────────────────

/** HTTP 오류·타임아웃·형식 오류. 응답 본문·키는 메시지에 넣지 않는다. */
export class FootballDataError extends Error {
  override readonly name = "FootballDataError";
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

// ─── 응답 경계 스키마 (필요한 필드만 — 나머지 키는 무시) ─────────────────────

const ScorePairSchema = z.object({
  home: z.number().int().nonnegative().nullable(),
  away: z.number().int().nonnegative().nullable(),
});

const TeamRefSchema = z.object({
  name: z.string().nullable(),
  shortName: z.string().nullable().optional(),
});

/** `/v4/matches` 응답의 경기 1건 */
export const FdMatchSchema = z.object({
  id: z.number().int().positive(),
  utcDate: IsoSchema,
  status: z.string(),
  matchday: z.number().int().nullable().optional(),
  stage: z.string().nullable().optional(),
  competition: z.object({ code: z.string() }),
  homeTeam: TeamRefSchema,
  awayTeam: TeamRefSchema,
  score: z.object({
    duration: z.string().nullable().optional(),
    fullTime: ScorePairSchema,
    halfTime: ScorePairSchema.nullable().optional(),
  }),
});
export type FdMatch = z.infer<typeof FdMatchSchema>;

/** 응답 껍데기 — 경기 항목은 하나씩 검증한다(한 건이 틀려도 나머지는 쓴다). */
export const FdMatchesResponseSchema = z.object({
  matches: z.array(z.unknown()),
});

// ─── 클라이언트 ──────────────────────────────────────────────────────────

export interface FootballDataClientOptions {
  /** FOOTBALL_DATA_API_KEY — 출력하지 않는다 */
  apiKey: string;
  fetch: FetchLike;
  /** 테스트 주입용 */
  sleep?: (ms: number) => Promise<void>;
  /** 현재 시각(ms) — 테스트 주입용 */
  now?: () => number;
  minIntervalMs?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface MatchesQuery {
  /** football-data 대회 코드(PL·PD·SA·BL1·FL1·CL) */
  competitions: readonly string[];
  /** YYYY-MM-DD (UTC 날짜) */
  dateFrom: string;
  /** YYYY-MM-DD (UTC 날짜) — 교차 엔드포인트는 이 날을 빼고 준다 */
  dateTo: string;
}

export interface FootballDataClient {
  /** `/v4/matches` — 경기 항목 원문 배열(검증 전) */
  getMatches(query: MatchesQuery): Promise<unknown[]>;
  /** 이 클라이언트가 보낸 요청 수(실패 포함) — runs.json apiCalls.footballData */
  readonly calls: number;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 요청 경로(키 없음) — 로그에 남겨도 된다 */
export function matchesPath(query: MatchesQuery): string {
  const params = new URLSearchParams({
    competitions: query.competitions.join(","),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
  // URLSearchParams는 쉼표를 %2C로 바꾼다 — 사람이 읽기 쉽게 되돌린다(서버는 둘 다 받는다).
  return `/matches?${params.toString().replace(/%2C/g, ",")}`;
}

export function createFootballDataClient(
  options: FootballDataClientOptions,
): FootballDataClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new FootballDataError("FOOTBALL_DATA_API_KEY가 비어 있다");
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? FOOTBALL_DATA_MIN_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? FOOTBALL_DATA_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? FOOTBALL_DATA_BASE_URL;
  let lastResponseAt: number | null = null;
  let calls = 0;
  // 동시 1개 — 요청을 한 줄로 세운다.
  let queue: Promise<unknown> = Promise.resolve();

  async function request(pathAndQuery: string): Promise<unknown> {
    if (lastResponseAt !== null) {
      const wait = lastResponseAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
    }
    calls += 1;
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}${pathAndQuery}`, {
        headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      throw new FootballDataError(
        name === "TimeoutError" || name === "AbortError"
          ? `football-data 요청 시간 초과 (${timeoutMs}ms)`
          : "football-data 요청 실패(연결 오류)",
      );
    } finally {
      lastResponseAt = now();
    }
    if (!response.ok) {
      throw new FootballDataError(
        `football-data 응답 HTTP ${response.status}`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new FootballDataError(
        "football-data 응답 JSON 파싱 실패",
        response.status,
      );
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    async getMatches(query) {
      const json = await enqueue(() => request(matchesPath(query)));
      const parsed = FdMatchesResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new FootballDataError("football-data 경기 응답 형식이 다르다");
      }
      return parsed.data.matches;
    },
    get calls() {
      return calls;
    },
  };
}

// ─── 내부 형식 변환 (순수 함수) ──────────────────────────────────────────

export interface Score {
  home: number;
  away: number;
}

/** 종료 경기 결과 — 브리핑 입력·대회 페이지가 쓰는 내부 형식(football-data 키를 모른다) */
export interface MatchResult {
  /** football-data 경기 id (API-Football id와 다른 체계 — M1-48 대응표) */
  fdId: number;
  comp: CompId;
  /** 킥오프(UTC ISO) */
  kickoff: string;
  /** 라운드 번호(리그 matchday) — 없으면 null */
  matchday: number | null;
  /** football-data stage 원문(REGULAR_SEASON·LEAGUE_STAGE …) — 없으면 null */
  stage: string | null;
  home: string;
  away: string;
  /** 최종 점수(홈-원정). 승부차기 경기는 승부차기 골 포함(football-data 규칙) — duration으로 구분 */
  ft: Score;
  /** 전반 점수. 없으면 null */
  ht: Score | null;
  /** REGULAR · EXTRA_TIME · PENALTY_SHOOTOUT (없으면 REGULAR로 본다) */
  duration: string;
}

export interface ResultsSummary {
  results: MatchResult[];
  skipped: {
    /** 형식이 틀린 항목 */
    invalid: number;
    /** FINISHED가 아닌 경기(예정·진행 중·취소·연기) */
    notFinished: number;
    /** 입력 창 밖 킥오프 */
    outOfWindow: number;
    /** configs/competitions.json에 없는 대회 코드 */
    unknownComp: number;
  };
}

function teamName(team: z.infer<typeof TeamRefSchema>): string | null {
  const name = team.shortName?.trim() || team.name?.trim();
  return name || null;
}

function toScore(pair: z.infer<typeof ScorePairSchema> | null | undefined) {
  if (!pair || pair.home === null || pair.away === null) return null;
  return { home: pair.home, away: pair.away };
}

/**
 * 경기 원문 배열 → 창 [start, end) 안에 킥오프한 종료 경기(킥오프·id 순). 형식이 틀리거나 팀 이름·최종 점수가
 * 없는 항목은 invalid로 센다.
 */
export function toFinishedResults(
  rawMatches: readonly unknown[],
  competitions: readonly CompetitionConfig[],
  window: UtcRange,
): ResultsSummary {
  const compByCode = new Map(
    competitions.map((c) => [c.footballDataCode as string, c.id]),
  );
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const skipped = {
    invalid: 0,
    notFinished: 0,
    outOfWindow: 0,
    unknownComp: 0,
  };
  const results: MatchResult[] = [];
  for (const raw of rawMatches) {
    const parsed = FdMatchSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.invalid += 1;
      continue;
    }
    const m = parsed.data;
    if (m.status !== "FINISHED") {
      skipped.notFinished += 1;
      continue;
    }
    const kickoffMs = Date.parse(m.utcDate);
    if (kickoffMs < start || kickoffMs >= end) {
      skipped.outOfWindow += 1;
      continue;
    }
    const comp = compByCode.get(m.competition.code);
    if (!comp) {
      skipped.unknownComp += 1;
      continue;
    }
    const home = teamName(m.homeTeam);
    const away = teamName(m.awayTeam);
    const ft = toScore(m.score.fullTime);
    if (!home || !away || !ft) {
      skipped.invalid += 1;
      continue;
    }
    results.push({
      fdId: m.id,
      comp,
      kickoff: m.utcDate,
      matchday: m.matchday ?? null,
      stage: m.stage ?? null,
      home,
      away,
      ft,
      ht: toScore(m.score.halfTime),
      duration: m.score.duration ?? "REGULAR",
    });
  }
  results.sort(
    (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.fdId - b.fdId,
  );
  return { results, skipped };
}
