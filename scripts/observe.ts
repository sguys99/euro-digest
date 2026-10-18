/**
 * `npm run observe` 진입점 (plan M1-41 · M1-42) — 발행일 하루의 Actions 실행·공개 시각·비용·브리핑·수집 시점 경기 상태를 모아
 * `docs/research/m1-observation.md`의 일자별 표·상세에 기록한다(같은 날 다시 돌리면 그 날 행 교체 — 멱등, 메모 칸 보존).
 * `--week`이면 기간의 빠진 날을 채운 뒤 주간 요약(M1-42 입력)을 쓴다. 판정·집계는 scripts/lib/observe.ts·observe-render.ts의 순수
 * 함수, 여기는 gh·파일 I/O만 한다.
 *
 * 사용법: npm run observe -- [--date YYYY-MM-DD] [--week [--from D1] [--to D2] [--refresh]] [--no-actions] [--doc <경로>]
 * GitHub 조회는 `gh api`(로그인된 gh CLI — 토큰을 이 스크립트가 다루지 않는다). gh가 없거나 실패하면 그 부분만 "확인 불가"로
 * 남기고 data/ 기록은 계속 모은다. 응답 본문·로그 원문은 파일·로그에 남기지 않는다(필요한 숫자 필드만 뽑는다).
 * data/는 로컬 작업 트리를 읽는다 — 봇이 커밋한 그날 기록을 보려면 먼저 `git pull`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { BriefFile, NewsFile, RunLog } from "@/lib/schema";
import { REPO_URL } from "@/lib/site";
import { kstDate, nowUtcIso } from "@/lib/time";

import { readBriefFile } from "./lib/brief-file";
import { REPOSITORY_PATTERN } from "./lib/collect-guard";
import { readRuns, runsPathFor } from "./lib/cost";
import { createLogger } from "./lib/logger";
import { newsFilePath, readNewsFile } from "./lib/news-file";
import {
  GhAnnotationsSchema,
  GhJobsResponseSchema,
  GhRunsResponseSchema,
  buildDayObservation,
  createdFilter,
  dataFacts,
  extractLogFacts,
  logTarget,
  needsGuardAnnotations,
  observeDayRange,
  observeRun,
  summarizeWeek,
  type DayObservation,
  type GhAnnotation,
  type GhJob,
  type LogFacts,
  type RunObs,
} from "./lib/observe";
import {
  VERDICT_LABELS,
  applyDayObservations,
  applyWeekSummary,
  readObservations,
  renderWeekSummary,
  triggerSummary,
} from "./lib/observe-render";
import { resolveResearchDocPath } from "./lib/research-doc";
import {
  OBSERVATION_DOC_REL,
  OBSERVATION_PERIOD,
  datesInRange,
  observationDocTemplate,
} from "./lib/observation-doc";

const USAGE = [
  "사용법: npm run observe -- [--date YYYY-MM-DD] [--week [--from D1] [--to D2] [--refresh]] [--no-actions] [--doc <경로>]",
  "  --date <발행일>  관찰할 KST 발행일(기본 오늘)",
  `  --week           기간 요약(기본 ${OBSERVATION_PERIOD.from} ~ ${OBSERVATION_PERIOD.to}) — 기록 없는 날은 먼저 관찰해 채운다`,
  "  --from/--to      --week 기간",
  "  --refresh        --week에서 이미 기록한 날도 다시 관찰",
  "  --no-actions     GitHub 조회 없이 data/만(Actions 칸은 확인 불가)",
  `  --repo <o/r>     저장소(기본 ${REPO_URL.replace("https://github.com/", "")})`,
  `  --doc <경로>     기록 문서(기본 ${OBSERVATION_DOC_REL} — docs/research/ 아래 .md만)`,
  "  --help, -h       이 도움말",
].join("\n");

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GH_TIMEOUT_MS = 60_000;
const logger = createLogger({ scope: "ops" });

/** `gh api …` — stdout 문자열. 실패하면 stderr 첫 줄(짧게)로 던진다(본문·토큰은 넣지 않는다) */
function gh(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      ["api", ...args],
      { maxBuffer: 64 * 1024 * 1024, timeout: GH_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const first = String(stderr || error.message)
            .split("\n")
            .find((l) => l.trim() !== "");
          reject(new Error((first ?? "gh 실패").slice(0, 160)));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function ghJson(pathArg: string): Promise<unknown> {
  return JSON.parse(await gh([pathArg])) as unknown;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "").slice(0, 160)
    : String(error).slice(0, 160);
}

interface ActionsResult {
  runs: RunObs[];
  jobsByRun: Map<number, GhJob[]>;
}

async function observeActions(
  repo: string,
  date: string,
): Promise<ActionsResult | { error: string }> {
  let runsJson: unknown;
  try {
    runsJson = await ghJson(
      `repos/${repo}/actions/workflows/collect.yml/runs?per_page=100&created=${createdFilter(observeDayRange(date))}`,
    );
  } catch (error) {
    return { error: `gh 실행 목록 조회 실패 — ${errorText(error)}` };
  }
  const parsed = GhRunsResponseSchema.safeParse(runsJson);
  if (!parsed.success) return { error: "실행 목록 응답 형식이 다르다" };
  const runs: RunObs[] = [];
  const jobsByRun = new Map<number, GhJob[]>();
  for (const run of [...parsed.data.workflow_runs].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )) {
    let jobs: GhJob[] | null = null;
    try {
      const j = GhJobsResponseSchema.safeParse(
        await ghJson(
          `repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
        ),
      );
      jobs = j.success ? j.data.jobs : null;
    } catch (error) {
      logger.warn("ops.observe.jobs-fail", {
        run: run.id,
        error: errorText(error),
      });
    }
    let annotations: GhAnnotation[] | null = null;
    const guardJobId = jobs ? needsGuardAnnotations(jobs) : null;
    if (guardJobId !== null) {
      try {
        const a = GhAnnotationsSchema.safeParse(
          await ghJson(`repos/${repo}/check-runs/${guardJobId}/annotations`),
        );
        annotations = a.success ? a.data : null;
      } catch (error) {
        logger.warn("ops.observe.annotations-fail", {
          run: run.id,
          error: errorText(error),
        });
      }
    }
    if (jobs) jobsByRun.set(run.id, jobs);
    runs.push(observeRun({ run, jobs, annotations }, date));
  }
  return { runs, jobsByRun };
}

async function observeLog(
  repo: string,
  actions: ActionsResult,
): Promise<{
  runId: number | null;
  log: LogFacts | null;
  error: string | null;
}> {
  const target = logTarget(actions.runs, actions.jobsByRun);
  if (!target) return { runId: null, log: null, error: null };
  try {
    // 로그 원문은 메모리에서 이벤트 필드만 뽑고 버린다(파일·로그에 남기지 않는다)
    const text = await gh([
      "--allow-escape-sequences",
      `repos/${repo}/actions/jobs/${target.jobId}/logs`,
    ]);
    const log = extractLogFacts(text);
    return {
      runId: target.runId,
      log,
      error: log === null ? "로그에 관찰 이벤트 없음" : null,
    };
  } catch (error) {
    return {
      runId: target.runId,
      log: null,
      error: `gh 로그 조회 실패 — ${errorText(error)}`,
    };
  }
}

async function readData(date: string) {
  let runs: RunLog[] | { error: string };
  try {
    runs = await readRuns(runsPathFor("prod", DATA_DIR));
  } catch (error) {
    runs = { error: errorText(error) };
  }
  const briefRead = await readBriefFile(DATA_DIR, date);
  const brief: BriefFile | null | { error: string } = briefRead.error
    ? { error: briefRead.error }
    : briefRead.value;
  let news: NewsFile | null | { error: string };
  try {
    news = await readNewsFile(newsFilePath(DATA_DIR, date));
  } catch (error) {
    news = { error: errorText(error) };
  }
  return dataFacts({ date, runs, brief, news });
}

async function observeDay(
  date: string,
  opts: { repo: string; actions: boolean },
): Promise<DayObservation> {
  const data = await readData(date);
  let actions: { runs: RunObs[] } | { error: string } = {
    error: "--no-actions(조회 안 함)",
  };
  let logRunId: number | null = null;
  let log: LogFacts | null = null;
  let logError: string | null = null;
  if (opts.actions) {
    const result = await observeActions(opts.repo, date);
    if ("error" in result) {
      actions = result;
    } else {
      actions = { runs: result.runs };
      const l = await observeLog(opts.repo, result);
      logRunId = l.runId;
      log = l.log;
      logError = l.error;
    }
  }
  const obs = buildDayObservation({
    date,
    observedAt: nowUtcIso(),
    actions,
    logRunId,
    log,
    logError,
    data,
  });
  logger.info("ops.observe.day", {
    date,
    runs: obs.actions.runs.length,
    actionsOk: obs.actions.ok,
    verdict: obs.publish.verdict,
    delayMinutes: obs.publish.delayMinutes,
    records: obs.data.runs.length,
    costUsd: obs.data.totals.costUsd,
    log: obs.log !== null,
  });
  return obs;
}

function printDay(o: DayObservation): void {
  const lines = [
    `── ${o.date} (${o.season === "summer" ? "여름" : "겨울"}) 목표 ${o.publishTarget} · 공개 ${o.publish.publishedAt ?? "없음"} · 지연 ${o.publish.delayMinutes ?? "—"}분 · ${VERDICT_LABELS[o.publish.verdict]}`,
    `   트리거: ${o.actions.ok ? triggerSummary(o.actions.runs) : `확인 불가 — ${o.actions.error ?? ""}`}`,
    `   runs: ${o.data.runs.length}건 · 비용 $${o.data.totals.costUsd} · 요청 ${o.data.totals.requests} · 캐시 ${o.data.totals.cacheRead}/${o.data.totals.cacheWrite} · 브리핑 ${o.data.brief?.mode ?? "없음"} · 카드 ${o.data.news?.cards ?? "없음"}`,
    `   경기 상태: ${o.matchStatus ? `종료 ${o.matchStatus.finished} · 진행 ${o.matchStatus.inProgress} · 그 밖 ${o.matchStatus.otherUnfinished} · 지연 의심 ${o.matchStatus.overdue ?? "판정 불가"}` : "기록 없음"}`,
    ...o.notes.map((n) => `   ⚠ ${n}`),
  ];
  console.log(lines.join("\n"));
}

async function readDoc(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return observationDocTemplate();
    }
    throw error;
  }
}

async function main(): Promise<number> {
  let values: {
    date?: string;
    week?: boolean;
    from?: string;
    to?: string;
    refresh?: boolean;
    "no-actions"?: boolean;
    repo?: string;
    doc?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: false,
      options: {
        date: { type: "string" },
        week: { type: "boolean", default: false },
        from: { type: "string" },
        to: { type: "string" },
        refresh: { type: "boolean", default: false },
        "no-actions": { type: "boolean", default: false },
        repo: { type: "string" },
        doc: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    console.error(`[observe] 인자 오류: ${errorText(error)}\n\n${USAGE}`);
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const today = kstDate(nowUtcIso());
  for (const [name, v] of [
    ["--date", values.date],
    ["--from", values.from],
    ["--to", values.to],
  ] as const) {
    if (v !== undefined && !DATE_RE.test(v)) {
      console.error(`[observe] ${name}는 YYYY-MM-DD (받은 값: "${v}")`);
      return 1;
    }
  }
  const repo = values.repo ?? REPO_URL.replace("https://github.com/", "");
  if (!REPOSITORY_PATTERN.test(repo)) {
    console.error(`[observe] --repo는 owner/repo 형식 (받은 값: "${repo}")`);
    return 1;
  }
  const opts = { repo, actions: !values["no-actions"] };
  const docTarget = resolveResearchDocPath(
    ROOT_DIR,
    values.doc ?? OBSERVATION_DOC_REL,
  );
  if (!docTarget.ok) {
    console.error(`[observe] ${docTarget.error}`);
    return 1;
  }
  const docPath = docTarget.path;
  let doc = await readDoc(docPath);

  if (values.week) {
    const from = values.from ?? OBSERVATION_PERIOD.from;
    const to = values.to ?? OBSERVATION_PERIOD.to;
    if (from > to) {
      console.error(`[observe] --from(${from})가 --to(${to})보다 늦다`);
      return 1;
    }
    const dates = datesInRange(from, to);
    const known = new Set(
      readObservations(doc).observations.map((o) => o.date),
    );
    const fresh: DayObservation[] = [];
    for (const date of dates) {
      if (date > today) continue;
      if (known.has(date) && !values.refresh) continue;
      const o = await observeDay(date, opts);
      printDay(o);
      fresh.push(o);
    }
    if (fresh.length > 0) doc = applyDayObservations(doc, fresh);
    const summary = summarizeWeek(
      readObservations(doc).observations,
      from,
      to,
      dates,
    );
    doc = applyWeekSummary(doc, summary);
    console.log(`\n${renderWeekSummary(summary)}`);
  } else {
    const date = values.date ?? today;
    if (date > today) {
      console.error(`[observe] 미래 날짜(${date})는 관찰할 수 없다`);
      return 1;
    }
    const o = await observeDay(date, opts);
    printDay(o);
    doc = applyDayObservations(doc, [o]);
  }
  await mkdir(path.dirname(docPath), { recursive: true });
  await writeFile(docPath, doc.endsWith("\n") ? doc : `${doc}\n`, "utf8");
  console.log(`\n[observe] 기록: ${path.relative(ROOT_DIR, docPath)}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`[observe] 실패: ${errorText(error)}`);
    process.exitCode = 1;
  },
);
