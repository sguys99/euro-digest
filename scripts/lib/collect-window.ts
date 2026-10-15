/**
 * 수집 시간 창 (M1-10, PRD FR-07 — "실행 실패 다음 날 소식 누락 없음") + 미래 시각 가드.
 *
 * ── 창 ───────────────────────────────────────────────────────────────────
 *   창 = [시작, 현재 + 허용 오차], 양 끝 포함.
 *   시작 = max(현재 − 51시간, 직전 성공 실행 시작 − 겹침 3시간). 직전 성공 실행이 없으면(첫 실행) 현재 − 51시간.
 *   "직전 성공 실행" = `data/runs.json`(prod)에서 뉴스를 실제로 발행한 마지막 실행 — env prod · job collect ·
 *   status success|partial(= 뉴스 단계 성공, collect-run.ts `runStatus`) · 성공 소스 1개 이상. runs.json에는 커밋된
 *   실행만 남으므로(실패 실행은 Actions가 커밋하지 않는다) 실패한 날 다음 실행은 자연히 그 전 성공 시각부터 받는다.
 *   로컬 dev·dry 실행도 같은 규칙으로 prod runs.json을 본다(runs-dev.json은 보지 않는다 — dev 실행은 발행하지 않는다).
 *
 *   **소스별 시작**: 같은 규칙을 소스 단위로도 적용한다 — 소스 s의 시작은 "s가 성공(`sources[].ok`)한 마지막 발행
 *   실행" 기준. 직전 실행이 partial이라 어떤 소스만 실패했다면 그 소스는 다음 실행에서 더 이른 시각부터 받는다
 *   (실행 단위 FR-07을 소스 단위로 — 기존 RunLog 필드만 쓴다). 발행 기록에 한 번도 성공으로 없는 소스(새 소스)는 51시간.
 *
 *   겹침 3시간의 근거:
 *   - 피드는 기사를 발행 시각보다 늦게 올린다 — CMS 게시 → 피드 갱신·CDN 캐시(BBC `ttl` 15분) 지연. 발행 06:20 기사가
 *     06:50에야 피드에 뜨면, 직전 실행 시각에 딱 맞춘 창은 다음 날 그 기사를 놓친다.
 *   - 시간대 표기가 1~2시간 틀린 피드(유럽 현지 시각에 다른 오프셋을 붙인 경우)는 직전 실행 직후에 올라온 기사를
 *     실행 시각보다 1~2시간 이른 시각으로 적는다 — 유럽 오프셋 차(최대 2시간) + 피드 지연 여유 1시간.
 *   - 대가: 날마다 약 3시간치(24시간 주기의 1/8)가 다시 후보가 된다. 같은 KST 날짜 파일 안의 중복은 병합
 *     (news-file.ts `mergeCards` — 카드 ID·정규화 URL)이, **날짜 간 중복**(어제 카드가 된 링크가 오늘 다시 후보가 됨)은
 *     이미 카드가 된 URL 기억(scripts/lib/seen-urls.ts — seen-urls.json 90일 ∪ 최근 발행 파일, M1-12)이 막는다.
 *     창은 여전히 그 기사를 후보로 돌려준다 — 이 모듈은 시각만 본다.
 *   - 직전 실행의 `startedAt`을 기준으로 한다(피드를 받은 시각은 그보다 최대 90초 늦다 — 더 이른 쪽이라 안전).
 *
 *   51시간 상한(FR-07, PRD §15 D36 — 2026-10-12 사용자 결정, 이전 36시간) = 48시간 + 겹침 3시간: 하루 1회 실행이
 *   **하루 전체 실패**해도(재실행 없음) 다음 실행이 그제 실행 시작 − 3시간부터 받아 누락이 없다(수용 기준 "실행 실패
 *   다음 날 소식 누락 없음"). 36시간이면 그제 실행 뒤 12시간치를 잃었다. 오늘 실행이 그제보다 늦게 시작해도(계절 전환
 *   06:30 → 07:10 KST +40분 · 백업·schedule 지연) 3시간 안이면 겹침만 줄고 그제 실행 이후 기사는 그대로 받는다.
 *   이틀 연속 실패하면 상한 앞의 기사는 받지 않는다(`capped` — 오래된 소식은 아침 다이제스트 대상이 아니다).
 *   첫 실행·새 소스·runs.json 읽기 실패도 같은 51시간으로 연다 — 첫 실행은 날짜 간 중복이 생길 앞선 파일이 없고,
 *   읽기 실패는 넓은 쪽이 안전하다(누락 대신 중복 — 중복은 M1-12가 막는다). 오래된 기사의 순위는 점수화(M1-14) 몫.
 *
 *   runs.json을 읽지 못하면(JSON·스키마 오류) 51시간 창 + 경고. 넓은 창은 중복만 늘리고 누락은 만들지 않는다
 *   (prod라면 실행 끝의 runs.json 기록이 같은 오류로 실패해 exit 1 → 커밋되지 않는다 — collect-run.ts).
 *   현재보다 미래에 시작한 발행 기록(시계 오류)은 무시하고 경고한다 — 그 기록을 쓰면 창이 비어 버린다.
 *
 * ── 미래 시각 가드 ───────────────────────────────────────────────────────
 *   발행 시각 − 현재 = 앞섬(ahead).
 *   - ahead ≤ 5분(허용 오차): 정상. 발행처 서버 시계 오차 + 이번 실행의 피드 받기가 시작 시각보다 최대 90초 늦음
 *     (feed-collect.ts 단계 예산)에 여유를 둔 값.
 *   - 5분 < ahead ≤ 3시간: 수집 시각(이번 실행 시작)으로 낮춘다(`future-clamped`) — 카드 `src.at`도 낮춘 값.
 *     시간대 표기 오류로 1~2시간 미래가 되는 피드가 실제로 있다: ESPN은 서머타임 기간에도 'EST'로 적어 최대 1시간
 *     미래(M1-09 dry 실측 +35분), 유럽 현지 시각에 GMT를 붙이면 최대 2시간. 기사 자체는 진짜라 버리지 않는다.
 *   - ahead > 3시간: 제외(`future`) — 시간대 설정이 크게 틀렸거나(예: 소스 `tz` 누락으로 KST를 UTC로 읽으면 9시간
 *     미래) 날짜가 깨진 것이다. 수집 시각으로 낮추면 오래된 기사가 최신처럼 맨 위에 서므로 빼고 경고한다.
 *
 * 순수 함수만 둔다(파일 읽기·현재 시각은 collect-run.ts가 주입). 시각 계산은 UTC ms로 하고, KST 표시는
 * src/lib/time.ts `formatKst`만 쓴다(CLAUDE.md §8).
 */
import type { FeedItem, RunLog } from "@/lib/schema";
import { formatKst, nowUtcIso, parseUtcIso } from "@/lib/time";

// ─── 정책 ────────────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** 창 최대 길이 — 현재 − 51시간(48시간 + 겹침)보다 이른 기사는 받지 않는다 (FR-07, D36 — 근거는 파일 머리 주석) */
export const COLLECT_WINDOW_MAX_MS = 51 * HOUR_MS;

/** 직전 성공 실행 시작보다 이만큼 앞에서 창을 연다 — 피드 지연·시간대 표기 오차 (근거는 파일 머리 주석) */
export const COLLECT_WINDOW_OVERLAP_MS = 3 * HOUR_MS;

/** 이만큼까지 미래인 발행 시각은 정상으로 본다 — 시계 오차·피드 받기 지연 */
export const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS;

/** 이만큼까지 미래인 발행 시각은 수집 시각으로 낮추고, 넘으면 제외한다 — 시간대 표기 오류(1~2시간) 여유 */
export const FUTURE_CLAMP_MAX_MS = 3 * HOUR_MS;

// ─── 타입 ────────────────────────────────────────────────────────────────

/**
 * 창 시작의 근거.
 * - `first-run` — 발행 기록이 없다(첫 실행·처음 성공할 소스) → 51시간
 * - `last-success` — 직전 성공 실행 시작 − 겹침
 * - `capped` — 직전 성공 실행이 너무 오래전이라(이틀 연속 실패 등) 51시간 상한
 * - `runs-unreadable` — runs.json을 읽지 못해 51시간(경고)
 */
export type WindowBasis =
  "first-run" | "last-success" | "capped" | "runs-unreadable";

/** runs.json 읽기 결과 — 실패도 값으로 받는다(창 계산은 던지지 않는다) */
export type RunsReadResult =
  { ok: true; runs: readonly RunLog[] } | { ok: false; error: string };

/** 소스 1개의 창 시작 */
export interface SourceWindow {
  /** 창 시작(UTC ISO, 포함) */
  start: string;
  basis: WindowBasis;
  /** 이 소스가 성공한 마지막 발행 실행의 시작 시각(없으면 null) */
  lastOkAt: string | null;
}

/** 직전 성공 실행(발행 기록) 요약 */
export interface PublishedRunRef {
  runId: string;
  startedAt: string;
  status: RunLog["status"];
}

export interface CollectWindow {
  /** 기준 시각 = 이번 실행 시작(UTC ISO). 미래 가드·낮춘 발행 시각도 이 값 */
  now: string;
  /** 실행 단위 창 시작(UTC ISO, 포함) — 직전 성공 실행 기준. 소스별 시작은 `sources` */
  start: string;
  /** 창 끝 = 현재 + 허용 오차(UTC ISO, 포함). 넘는 항목은 미래 가드가 처리한다 */
  end: string;
  /** 상한 시작 = 현재 − 51시간(UTC ISO). `sources`에 없는 소스는 이 값 */
  floor: string;
  basis: WindowBasis;
  /** 직전 성공 실행(없으면 null) */
  lastRun: PublishedRunRef | null;
  /** 현재보다 미래에 시작한 발행 기록 수(무시함 — 시계 오류) */
  ignoredFutureRuns: number;
  /** runs.json 읽기 오류(없으면 null) */
  runsError: string | null;
  /** 소스별 창 시작(입력한 소스 id 전부) */
  sources: Readonly<Record<string, SourceWindow>>;
}

// ─── 창 계산 ─────────────────────────────────────────────────────────────

/**
 * 뉴스를 실제로 발행한 실행인가 — prod · collect · 뉴스 단계 성공(status success|partial) · 성공 소스 1개 이상.
 * `failed`(뉴스 실패)·`skipped`는 아니다. 기존 RunLog 필드만으로 판정한다(스키마 변경 없음).
 */
export function isPublishedNewsRun(
  run: Pick<RunLog, "env" | "job" | "status" | "sources">,
): boolean {
  return (
    run.env === "prod" &&
    run.job === "collect" &&
    (run.status === "success" || run.status === "partial") &&
    run.sources.some((source) => source.ok)
  );
}

function ms(iso: string): number {
  return parseUtcIso(iso).getTime();
}

function isoAt(t: number): string {
  return nowUtcIso(new Date(t));
}

/** 시작 시각이 가장 늦은 실행(같으면 먼저 나온 것) */
function latestRun(runs: readonly RunLog[]): RunLog | null {
  let best: RunLog | null = null;
  for (const run of runs) {
    if (best === null || ms(run.startedAt) > ms(best.startedAt)) best = run;
  }
  return best;
}

function startFrom(
  lastAt: string | null,
  floorMs: number,
): { start: string; basis: WindowBasis } {
  if (lastAt === null) return { start: isoAt(floorMs), basis: "first-run" };
  const candidate = ms(lastAt) - COLLECT_WINDOW_OVERLAP_MS;
  if (candidate < floorMs) return { start: isoAt(floorMs), basis: "capped" };
  return { start: isoAt(candidate), basis: "last-success" };
}

/**
 * 이번 실행의 수집 창을 계산한다. 순수 함수 — runs.json 내용(또는 읽기 오류)과 현재 시각을 받는다.
 * @param input.now 이번 실행 시작(UTC ISO)
 * @param input.runs prod runs.json 읽기 결과
 * @param input.sourceIds 이번에 수집할 소스 id(소스별 시작을 계산한다)
 */
export function planCollectWindow(input: {
  now: string;
  runs: RunsReadResult;
  sourceIds: readonly string[];
}): CollectWindow {
  const nowMs = ms(input.now);
  const now = isoAt(nowMs);
  const floorMs = nowMs - COLLECT_WINDOW_MAX_MS;
  const floor = isoAt(floorMs);
  const end = isoAt(nowMs + FUTURE_TOLERANCE_MS);

  if (!input.runs.ok) {
    const sources: Record<string, SourceWindow> = {};
    for (const id of input.sourceIds) {
      sources[id] = { start: floor, basis: "runs-unreadable", lastOkAt: null };
    }
    return {
      now,
      start: floor,
      end,
      floor,
      basis: "runs-unreadable",
      lastRun: null,
      ignoredFutureRuns: 0,
      runsError: input.runs.error,
      sources,
    };
  }

  // 발행 기록만, 현재보다 미래에 시작한 기록(시계 오류)은 뺀다.
  const published = input.runs.runs.filter(isPublishedNewsRun);
  const past = published.filter((run) => ms(run.startedAt) <= nowMs);
  const last = latestRun(past);
  const overall = startFrom(last?.startedAt ?? null, floorMs);

  const sources: Record<string, SourceWindow> = {};
  for (const id of input.sourceIds) {
    const lastOk = latestRun(
      past.filter((run) => run.sources.some((s) => s.id === id && s.ok)),
    );
    const lastOkAt = lastOk?.startedAt ?? null;
    sources[id] = { ...startFrom(lastOkAt, floorMs), lastOkAt };
  }

  return {
    now,
    start: overall.start,
    end,
    floor,
    basis: overall.basis,
    lastRun: last
      ? { runId: last.runId, startedAt: last.startedAt, status: last.status }
      : null,
    ignoredFutureRuns: published.length - past.length,
    runsError: null,
    sources,
  };
}

/** 소스의 창 시작 — 계산에 없던 소스는 상한 시작(첫 실행과 같다) */
export function windowStartFor(window: CollectWindow, sourceId: string) {
  return window.sources[sourceId]?.start ?? window.floor;
}

/** 실행 단위 시작과 다른 소스(직전 실행에서 실패했거나 새 소스) — 로그용, 입력 순서 */
export function widerSourceWindows(
  window: CollectWindow,
): Array<{ source: string } & SourceWindow> {
  return Object.entries(window.sources)
    .filter(([, w]) => w.start !== window.start)
    .map(([source, w]) => ({ source, ...w }));
}

// ─── 항목 판정 ───────────────────────────────────────────────────────────

/** 항목 1건의 판정 */
export type ItemTimeVerdict =
  /** 창 안 — 발행 시각 그대로 */
  | { kind: "in-window"; publishedAt: string }
  /** 허용 오차를 넘는 미래(3시간 이내) — 수집 시각으로 낮춘 값 */
  | { kind: "future-clamped"; publishedAt: string; aheadMs: number }
  /** 창 시작보다 이르다 */
  | { kind: "out-of-window" }
  /** 3시간을 넘는 미래 — 제외 */
  | { kind: "future"; aheadMs: number };

/**
 * 발행 시각 1건을 판정한다. 경계: 시작과 같으면 창 안, 현재 + 5분과 같으면 창 안(낮추지 않음),
 * 현재 + 3시간과 같으면 낮춤, 그보다 1ms라도 늦으면 제외.
 */
export function judgeItemTime(
  publishedAt: string,
  bounds: { start: string; now: string },
): ItemTimeVerdict {
  const t = ms(publishedAt);
  const nowMs = ms(bounds.now);
  const aheadMs = t - nowMs;
  if (aheadMs > FUTURE_CLAMP_MAX_MS) return { kind: "future", aheadMs };
  if (aheadMs > FUTURE_TOLERANCE_MS) {
    return { kind: "future-clamped", publishedAt: isoAt(nowMs), aheadMs };
  }
  if (t < ms(bounds.start)) return { kind: "out-of-window" };
  return { kind: "in-window", publishedAt };
}

/** 소스 1개의 창 적용 집계 */
export interface SourceWindowStats {
  /** 창 안(낮춘 항목 포함) */
  inWindow: number;
  outOfWindow: number;
  futureClamped: number;
  future: number;
  /** 미래 시각(낮춤·제외) 중 가장 많이 앞선 값(ms) — 없으면 null */
  maxAheadMs: number | null;
}

export interface WindowStats {
  /** 판정한 항목 수 */
  total: number;
  /** 창 안(낮춘 항목 포함) */
  inWindow: number;
  outOfWindow: number;
  futureClamped: number;
  future: number;
  /** 소스별 집계(항목이 있던 소스만, 처음 나온 순서) */
  bySource: Record<string, SourceWindowStats>;
}

/**
 * 수집 창을 적용한다 — 창 밖·3시간 넘는 미래는 빼고, 허용 오차를 넘는 미래(3시간 이내)는 발행 시각을 수집 시각으로
 * 낮춘 새 항목으로 바꾼다. 남는 항목의 순서는 입력 순서 그대로다(결정적). 순수 함수.
 */
export function applyCollectWindow(
  items: readonly FeedItem[],
  window: CollectWindow,
): { items: FeedItem[]; stats: WindowStats } {
  const kept: FeedItem[] = [];
  const stats: WindowStats = {
    total: items.length,
    inWindow: 0,
    outOfWindow: 0,
    futureClamped: 0,
    future: 0,
    bySource: {},
  };
  for (const item of items) {
    const per = (stats.bySource[item.source] ??= {
      inWindow: 0,
      outOfWindow: 0,
      futureClamped: 0,
      future: 0,
      maxAheadMs: null,
    });
    const verdict = judgeItemTime(item.publishedAt, {
      start: windowStartFor(window, item.source),
      now: window.now,
    });
    switch (verdict.kind) {
      case "in-window":
        kept.push(item);
        stats.inWindow += 1;
        per.inWindow += 1;
        break;
      case "future-clamped":
        kept.push({ ...item, publishedAt: verdict.publishedAt });
        stats.inWindow += 1;
        stats.futureClamped += 1;
        per.inWindow += 1;
        per.futureClamped += 1;
        per.maxAheadMs = Math.max(per.maxAheadMs ?? 0, verdict.aheadMs);
        break;
      case "out-of-window":
        stats.outOfWindow += 1;
        per.outOfWindow += 1;
        break;
      case "future":
        stats.future += 1;
        per.future += 1;
        per.maxAheadMs = Math.max(per.maxAheadMs ?? 0, verdict.aheadMs);
        break;
      default:
        return assertNever(verdict);
    }
  }
  return { items: kept, stats };
}

// ─── 로그 도우미 ─────────────────────────────────────────────────────────

/** 창 계획 로그 필드 — UTC ISO와 사람이 읽는 KST(time.ts)를 함께 */
export function windowLogFields(window: CollectWindow) {
  const wider = widerSourceWindows(window);
  return {
    start: window.start,
    end: window.end,
    startKst: formatKst(window.start, "short"),
    endKst: formatKst(window.end, "short"),
    basis: window.basis,
    spanHours: roundHours(ms(window.now) - ms(window.start)),
    lastRunId: window.lastRun?.runId ?? null,
    lastRunAt: window.lastRun?.startedAt ?? null,
    overlapHours: COLLECT_WINDOW_OVERLAP_MS / HOUR_MS,
    maxHours: COLLECT_WINDOW_MAX_MS / HOUR_MS,
    ...(wider.length > 0
      ? {
          widerSources: wider.map((w) => ({
            source: w.source,
            start: w.start,
            basis: w.basis,
          })),
        }
      : {}),
  };
}

/** ms → 시간(소수 첫째 자리) */
export function roundHours(value: number): number {
  return Math.round((value / HOUR_MS) * 10) / 10;
}

/** ms → 분(정수, 올림 — 5분 1초 앞섬은 6분) */
export function ceilMinutes(value: number): number {
  return Math.ceil(value / MINUTE_MS);
}

function assertNever(value: never): never {
  throw new Error(`알 수 없는 창 판정: ${JSON.stringify(value)}`);
}
