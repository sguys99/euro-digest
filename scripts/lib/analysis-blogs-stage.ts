/**
 * 주간 단계 analysis-blogs — 분석 블로그 주 1회 수집 → 팀 페이지 "더 읽을거리" `data/teams/<slug>.json`의 `reading` (M3-08 — PRD FR-10·
 * FR-57, §15 D22·D23·D48). 규칙(대상 소스·팀 연결·갱신·건강도)은 analysis-reading.ts 순수 함수, 여기는 읽기 → 받기 → 판정 → 쓰기만 한다.
 * **LLM을 부르지 않는다**(호출 지점 3곳 밖 — CLAUDE.md §1-3).
 *
 * 흐름
 *   ① 읽기: configs(sources·names.ko·korean-players·takedowns) + 이전 팀 파일(data/teams — team-files-io.ts readPreviousTeams). 대상 소스가
 *      없거나 팀 파일이 없으면 요청하지 않고 끝낸다(note). configs를 읽지 못하면 던진다(단계 실패 — 팀 파일은 그대로).
 *   ② 받기: 대상 소스를 **하나씩** 받는다(feed-collect.ts `collectFeedSources` — UA·타임아웃·크기 상한·재시도 1회·본문 필드 버림·작성자
 *      필터, D48 소스는 요약문을 꺼내지 않음). 소스 사이 `ANALYSIS_FEED_GAP_MS`(2.5초 — 사이트당 2~3초 지연, CLAUDE.md §6.4). 소스 실패는
 *      그 소스만 건너뛴다(그 소스 글이 없으니 기존 reading이 그대로 남는다). **대상 소스가 모두 실패하면 던진다** — 단계 실패로 주간 실패
 *      이슈가 생기고(weekly.yml), 아무것도 쓰지 않았으니 팀 파일은 그대로다. 소스별 결과는 실행 기록 `sources[]`(usable = 지난 7일 새 글)로.
 *   ③ 판정: 원제목 → 팀(analysis-reading.ts — 팀 0건 글은 버림) → 팀별 reading 병합(최대 5건, 새 글 앞, URL 중복 제거, 최신순).
 *      삭제 요청 URL과 수집을 멈춘 분석 블로그 매체(enabled·terms_checked를 끈 소스 — 중단 요구)의 글은 이전 목록에서도 뺀다.
 *      '새 글 없음' 주간 연속이 8회 이상이면 경고 로그(일일 건강도 FR-11 대신 — 운영 리포트 M5-09가 이슈로 올린다).
 *   ④ 쓰기: dry가 아니면 끝에 한 번 — 바뀐 팀 파일만, 팀 스키마로 모두 검증한 뒤(임시 파일 → rename). reading 밖의 값은 이전 파일 그대로
 *      (일일 수집 팀 단계가 `reading: prev?.reading ?? []`로 이어받는다 — team-files.ts).
 *
 * 출력·로그: 구조화 로그는 건수만(원제목·링크 없음). 사람이 읽는 출력(`ctx.print` — dry 확인용)에는 글 제목과 연결된 팀을 적는다.
 */
import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TakedownsFileSchema,
  TeamSchema,
  type FeedItem,
  type RunLog,
  type RunSource,
  type Source,
  type Team,
} from "@/lib/schema";
import { nowUtcIso } from "@/lib/time";

import {
  ANALYSIS_STALE_WEEKS,
  analysisStaleStreak,
  blockedPublishers,
  buildReadingUpdates,
  matchPosts,
  newPostCount,
  planAnalysisSources,
  type PostSkipReason,
} from "./analysis-reading";
import { readConfigFile } from "./config-files";
import { readRuns, runsPathFor } from "./cost";
import {
  SYSTEM_FEED_CLOCK,
  collectFeedSources,
  type FeedClock,
  type FeedPolicy,
  type SourceOutcome,
} from "./feed-collect";
import { loadSources } from "./sources";
import { buildTagIndex } from "./tag-names";
import { readPreviousTeams, writeTeamFileIfChanged } from "./team-files-io";
import type {
  WeeklyStageContext,
  WeeklyStageReport,
  WeeklyStageRun,
} from "./weekly-stages";

/** 이 단계가 쓰는 폴더(저장소 상대 — weekly-stages.ts writes) */
export const ANALYSIS_TEAMS_DIR = "data/teams";

/** 분석 블로그 소스 사이 간격(앞 요청이 끝난 뒤부터) — 사이트당 2~3초(CLAUDE.md §6.4) */
export const ANALYSIS_FEED_GAP_MS = 2_500;

export interface AnalysisStageDeps {
  /** 시각·대기(기본 SYSTEM_FEED_CLOCK — 테스트가 주입) */
  clock?: FeedClock;
  /** 피드 정책 덮어쓰기(기본 feed-collect.ts DEFAULT_FEED_POLICY + 동시 1개) */
  policy?: Partial<FeedPolicy>;
}

/** 단계 함수 — 의존성(시계·정책)을 주입해 만든다 */
export function createAnalysisBlogsStage(
  deps: AnalysisStageDeps = {},
): WeeklyStageRun {
  return (ctx) => runAnalysisBlogsWith(ctx, deps);
}

/** 등록용 기본 단계(weekly-stages.ts) */
export const runAnalysisBlogs: WeeklyStageRun = createAnalysisBlogsStage();

const SKIP_LABEL: Readonly<Record<PostSkipReason, string>> = {
  "too-old": "오래됨",
  future: "미래 날짜",
  takedown: "삭제 요청",
  "no-team": "팀 없음 — 버림",
};

async function runAnalysisBlogsWith(
  ctx: WeeklyStageContext,
  deps: AnalysisStageDeps,
): Promise<WeeklyStageReport> {
  const log = ctx.logger;
  const clock = deps.clock ?? SYSTEM_FEED_CLOCK;
  const now = nowUtcIso(ctx.now());

  // ① 읽기
  const allSources = await loadSources(ctx.rootDir);
  const targets = planAnalysisSources(allSources);
  // 수집을 멈춘 분석 블로그 매체 — 소스가 하나도 없어도 이전 reading에서 지운다(중단 요구 대응)
  const blocked = blockedPublishers(allSources);
  if (targets.length === 0 && blocked.size === 0) {
    log.info("weekly.analysis.skip", { reason: "no-sources" });
    return { note: "분석 블로그 소스 없음", counts: { sources: 0 } };
  }
  const teams = await readPreviousTeams(ctx.dataDir, (event, fields) =>
    log.warn(`weekly.analysis.${event}`, fields),
  );
  if (teams.size === 0) {
    log.warn("weekly.analysis.skip", { reason: "no-team-files" });
    return {
      note: "팀 파일 없음 — 요청하지 않음",
      counts: { sources: targets.length, teams: 0 },
    };
  }
  const [names, koreanPlayers, takedowns] = await Promise.all([
    readConfigFile(ctx.rootDir, "names.ko.json", NamesKoFileSchema),
    readConfigFile(ctx.rootDir, "korean-players.json", KoreanPlayersFileSchema),
    readConfigFile(ctx.rootDir, "takedowns.json", TakedownsFileSchema),
  ]);
  const index = buildTagIndex({ names, koreanPlayers });
  const takedownIds = new Set(takedowns.map((t) => t.id));

  // ② 받기 — 하나씩, 소스 사이 간격
  const outcomes: SourceOutcome[] = [];
  const items: FeedItem[] = [];
  for (const [i, source] of targets.entries()) {
    throwIfAborted(ctx.signal);
    if (i > 0) await clock.sleep(ANALYSIS_FEED_GAP_MS);
    const result = await collectFeedSources([source], {
      fetch: ctx.http.fetch,
      userAgent: ctx.http.userAgent,
      logger: log,
      clock,
      policy: { concurrency: 1, ...deps.policy },
    });
    outcomes.push(...result.outcomes);
    items.push(...result.items);
  }
  const runSources = outcomes.map((o) => runSourceOf(o, items, now));
  ctx.sources.add(runSources);
  const failed = outcomes.filter((o) => !o.ok);
  if (outcomes.length > 0 && failed.length === outcomes.length) {
    throw new Error(
      `분석 블로그 소스 전부 실패 — ${failed.map((o) => `${o.id}(${o.errorType ?? "error"})`).join(", ")} · 팀 파일은 그대로`,
    );
  }

  // ③ 판정
  const matches = matchPosts({
    items,
    index,
    teamSlugs: new Set(teams.keys()),
    now,
    takedownIds,
  });
  const sourceById = new Map<string, Source>(targets.map((s) => [s.id, s]));
  const updates = buildReadingUpdates({
    matches,
    sources: sourceById,
    teams,
    takedownIds,
    dropSources: blocked,
  });
  const stale = await staleWarnings(ctx, runSources, now);

  const matched = matches.filter((m) => m.skipped === null);
  const counts = {
    sources: targets.length,
    failed: failed.length,
    items: items.length,
    posts: matches.length,
    matched: matched.length,
    unmatched: matches.filter((m) => m.skipped === "no-team").length,
    tooOld: matches.filter((m) => m.skipped === "too-old").length,
    links: matched.reduce((sum, m) => sum + m.teams.length, 0),
    teams: updates.length,
    stale: stale.length,
    blocked: blocked.size,
  };
  if (failed.length > 0) {
    log.warn("weekly.analysis.partial", {
      failed: failed.map((o) => ({ id: o.id, errorType: o.errorType })),
    });
  }

  ctx.print(
    formatAnalysisPreview({
      outcomes,
      matches,
      updates,
      teams,
      dry: ctx.dry,
    }),
  );

  // ④ 쓰기 — 모두 검증한 뒤 끝에 한 번
  const outputs: string[] = [];
  if (!ctx.dry && updates.length > 0) {
    const next: Team[] = updates.map((u) => {
      const prev = teams.get(u.slug);
      if (prev === undefined) throw new Error(`팀 파일 없음: ${u.slug}`);
      return TeamSchema.parse({ ...prev, reading: u.after });
    });
    for (const team of next) {
      if (await writeTeamFileIfChanged(ctx.dataDir, team)) {
        outputs.push(`${ANALYSIS_TEAMS_DIR}/${team.slug}.json`);
      }
    }
  }
  log.info("weekly.analysis.done", {
    ...counts,
    written: outputs.length,
    dry: ctx.dry,
  });
  return {
    outputs,
    counts: { ...counts, written: outputs.length },
    ...(failed.length > 0
      ? { note: `일부 소스 실패: ${failed.map((o) => o.id).join(", ")}` }
      : targets.length === 0
        ? { note: "분석 블로그 소스 없음 — 수집을 멈춘 매체 글만 정리" }
        : {}),
  };
}

/** 소스 결과 → 실행 기록 한 줄(usable = 지난 7일 새 글 수, 실패는 error = 오류 종류) */
function runSourceOf(
  outcome: SourceOutcome,
  items: readonly FeedItem[],
  now: string,
): RunSource {
  if (!outcome.ok) {
    return {
      id: outcome.id,
      ok: false,
      items: 0,
      error: outcome.errorType ?? "unexpected",
    };
  }
  return {
    id: outcome.id,
    ok: true,
    items: outcome.items,
    usable: newPostCount(
      items.filter((i) => i.source === outcome.id),
      now,
    ),
  };
}

/** '새 글 없음' 주간 연속 경고 — prod runs.json을 읽지 못하면 경고만 남기고 넘어간다(발행과 무관) */
async function staleWarnings(
  ctx: WeeklyStageContext,
  current: readonly RunSource[],
  now: string,
): Promise<string[]> {
  let history: RunLog[];
  try {
    history = await readRuns(runsPathFor("prod", ctx.dataDir));
  } catch (error) {
    ctx.logger.warn("weekly.analysis.history-unreadable", {
      error: error instanceof Error ? (error.message.split("\n")[0] ?? "") : "",
    });
    return [];
  }
  const out: string[] = [];
  for (const entry of current) {
    if (!entry.ok) continue;
    const streak = analysisStaleStreak(history, entry.id, {
      runId: ctx.runId,
      startedAt: now,
      entry,
    });
    if (streak >= ANALYSIS_STALE_WEEKS) {
      ctx.logger.warn("weekly.analysis.stale", {
        source: entry.id,
        weeks: streak,
        threshold: ANALYSIS_STALE_WEEKS,
      });
      out.push(entry.id);
    }
  }
  return out;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error("분석 블로그 단계 중단");
}

/** 사람이 읽는 출력 — 소스 결과 · 글별 팀(또는 버린 이유) · 팀별 갱신 */
export function formatAnalysisPreview(input: {
  outcomes: readonly SourceOutcome[];
  matches: ReturnType<typeof matchPosts>;
  updates: ReturnType<typeof buildReadingUpdates>;
  teams: ReadonlyMap<string, Pick<Team, "nameKo">>;
  dry: boolean;
}): string {
  const lines: string[] = [
    `[analysis-blogs] 분석 블로그 ${input.outcomes.length}개${input.dry ? " (dry — data/에 쓰지 않음)" : ""}`,
  ];
  for (const o of input.outcomes) {
    lines.push(
      o.ok
        ? `  · ${o.id}: 항목 ${o.items} · 정규화 통과 ${o.usable}`
        : `  · ${o.id}: 실패 ${o.errorType ?? "error"}${o.status ? ` (HTTP ${o.status})` : ""}`,
    );
  }
  const matched = input.matches.filter((m) => m.skipped === null);
  lines.push(
    `  글 ${input.matches.length}건 → 팀 연결 ${matched.length}건 · 팀 없음 ${input.matches.filter((m) => m.skipped === "no-team").length}건 · 기간 밖 ${input.matches.filter((m) => m.skipped === "too-old" || m.skipped === "future").length}건`,
  );
  for (const m of input.matches) {
    const label =
      m.skipped === null
        ? m.teams.map((s) => input.teams.get(s)?.nameKo ?? s).join(", ")
        : SKIP_LABEL[m.skipped];
    lines.push(
      `    ${m.item.publishedAt.slice(0, 10)} [${label}] ${m.item.title}`,
    );
  }
  lines.push(`  reading 갱신 팀 ${input.updates.length}개`);
  for (const u of input.updates) {
    lines.push(
      `    ${u.slug}: ${u.before.length}건 → ${u.after.length}건 (이번 글 ${u.fresh})`,
    );
  }
  return lines.join("\n");
}
