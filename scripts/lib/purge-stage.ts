/**
 * 수집 실행의 data/news 원본 삭제 단계 (M1-25, PRD FR-143·§8.4·§15 D14·D32) — 삭제 요청(takedown)·소스별 보존 기간.
 * 계획(어떤 카드·출처를 지울지)은 purge-plan.ts 순수 함수, 이 파일은 읽기·쓰기·로그만 맡는다.
 *
 * 위치: `runCollect`가 **뉴스 단계 전에** 부른다(collect-run.ts). 그래서 뉴스 단계는 지운 뒤의 오늘 파일·최근 발행 파일·기억을 읽는다
 *   — 오늘 파일에서 지운 카드의 링크는 기억에 있고 오늘 파일에 없으므로 같은 실행에서 다시 카드가 되지 않는다(seen-urls.ts '판정').
 *   빌드 제외(src/lib/data/news.ts)는 등록 즉시 적용되고, 이 단계는 그 뒤 첫 수집 실행에서 원본을 지운다(FR-143).
 *
 * 순서(쓰기)
 *   ① 설정 읽기 — `configs/takedowns.json`(카드 ID), `configs/sources.json`(보존 기간 — 매체명 표). 한쪽을 못 읽으면 그쪽만 건너뛴다.
 *   ② `data/news/YYYY-MM-DD.json` 전부 읽기(검증) — 깨진 파일·파일명과 date가 다른 파일은 건너뛴다(발행 검증 게이트가 오류로 잡는다).
 *   ③ 계획(planPurge) — 보존 기간은 다음 실행 전에 만료될 출처까지(여유 30시간 — purge-plan.ts). 비었으면 끝(파일을 건드리지 않는다).
 *   ④ dry면 계획만 출력하고 끝.
 *   ⑤ 기억(seen-urls.json)에 지울 링크 해시를 먼저 더한다(없는 키만). **기억을 읽거나 쓰지 못하면 뉴스 파일을 지우지 않는다** —
 *      기억 없이 지우면 (2026-10-14 이전 발행분처럼 기억에 없던 카드가) 수집 창 안에서 다른 ID로 다시 카드가 될 수 있다.
 *      takedown 카드가 새 규칙 ID로 다시 나오면 빌드 제외도 피한다. 다음 실행이 다시 시도한다.
 *   ⑥ 바뀌는 날짜 파일마다 다시 쓴다(generatedAt·runId 갱신 — NewsFile 규칙). 한 파일의 실패는 그 파일만(다음 실행이 다시).
 *
 * 실패 정책 — **발행을 멈추지 않는다(실행 상태 partial)**. 삭제 실패는 Actions 오류 주석(prod)과 로그로 드러나고, 다음 발행 검증
 * 게이트가 남은 takedown 카드·만료 출처를 경고로 보여 준다. 근거: 공개 사이트는 빌드 제외가 지킨다(takedowns.json을 못 읽으면
 * 빌드가 실패한다 — 열린 채 배포되지 않음). 실행을 실패(exit 1)로 끝내도 원본은 지워지지 않고(커밋되지 않으므로) 그날 발행만
 * 막힌다. 삭제가 실패하는 실제 원인은 깨진 파일·설정이고, 그때는 검증 게이트가 오류로 커밋을 막는다.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  TakedownsFileSchema,
  type NewsFile,
  type RunEnv,
  type RunLog,
  type Source,
  type TakedownsFile,
} from "@/lib/schema";
import { nowUtcIso } from "@/lib/time";

import { readConfigFile } from "./config-files";
import { annotate, type Logger } from "./logger";
import {
  buildNewsFile,
  newsFilePath,
  readNewsFile,
  writeNewsFile,
} from "./news-file";
import {
  isEmptyPurge,
  mergeSeenKeys,
  planPurge,
  RETENTION_PURGE_LEAD_MS,
  retentionByPublisher,
  type PurgePlan,
} from "./purge-plan";
import {
  buildSeenUrlsFile,
  readSeenUrls,
  SEEN_URLS_REL_PATH,
  writeSeenUrls,
} from "./seen-urls";
import { loadSources } from "./sources";

const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const SEEN_LABEL = `data/${SEEN_URLS_REL_PATH.split(path.sep).join("/")}`;

export interface PurgeStageDeps {
  /** 저장소 루트(configs/) */
  rootDir: string;
  /** data/ 폴더 */
  dataDir: string;
  env: RunEnv;
  dry: boolean;
  /** 파일 generatedAt 시계 */
  now: () => Date;
  /** 소스 설정 — 기본 `<rootDir>/configs/sources.json`(collect-run.ts CollectDeps.loadSources와 같은 값) */
  loadSources?: () => Promise<Source[]>;
  /** 삭제 요청 — 기본 `<rootDir>/configs/takedowns.json` */
  loadTakedowns?: () => Promise<TakedownsFile>;
  logger: Logger;
  print: (text: string) => void;
}

export interface PurgeError {
  step:
    "takedowns" | "sources" | "list" | "read" | "seen" | "write" | "unexpected";
  /** 날짜 파일 단계면 그 날짜 */
  date?: string;
  error: string;
}

export interface PurgeOutcome {
  /**
   * done = 지울 것을 지웠다(일부 파일 실패 포함 — errors) 또는 지울 것이 없다 · dry = 계획만 출력 ·
   * blocked = 뉴스 파일을 지우지 않았다 — 기억(seen-urls.json)을 읽거나 쓰지 못했거나 계획 단계의 예상 밖 오류(다음 실행이 다시)
   */
  state: "done" | "dry" | "blocked";
  /** 등록된 삭제 요청 수 — 설정을 읽지 못했으면 null */
  takedowns: number | null;
  /** 보존 기간 매체명 → 일 — 설정을 읽지 못했으면 null */
  retention: Record<string, number> | null;
  /** 읽은 날짜 파일 수(검증 통과) */
  scanned: number;
  /** 계획 — 날짜 파일을 하나도 못 읽었으면(폴더 없음 포함) 빈 계획 */
  plan: PurgePlan;
  /** 다시 쓴 날짜 파일(날짜) */
  written: string[];
  /** 기억에 새로 더한 링크 해시 수 */
  seenAdded: number;
  errors: PurgeError[];
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

const REASON_LABEL = { takedown: "삭제 요청", retention: "보존 기간" } as const;

/** dry·로그용 계획 문구(링크·제목은 넣지 않는다 — 카드 ID·매체명·시각만) */
export function formatPurgePlan(plan: PurgePlan): string[] {
  const { takedownCards, retentionCards, retentionSources } = plan.counts;
  const lines = [
    `data/news 원본 삭제 — 카드 ${takedownCards + retentionCards}장(삭제 요청 ${takedownCards} · 보존 기간 ${retentionCards}) · 출처 ${retentionSources}건 · 파일 ${plan.files.length}개 · 기억에 남길 링크 ${plan.seenKeys.size}개`,
  ];
  for (const file of plan.files) {
    const parts = [
      ...file.removedCards.map(
        (c) =>
          `카드 ${c.id}(${REASON_LABEL[c.reason]}${c.publisher ? ` — ${c.publisher} 만료 ${c.expiresAt}` : ""})`,
      ),
      ...file.removedSources.map(
        (s) =>
          `출처 ${s.cardId}[${s.index}](${s.publisher} 만료 ${s.expiresAt})`,
      ),
    ];
    lines.push(`   ${file.date} — ${parts.join(" · ")}`);
  }
  return lines;
}

/** 날짜 파일 목록(오름차순). 폴더가 없으면 [] */
async function listDailyDates(dataDir: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(dataDir, "news"), {
      withFileTypes: true,
    });
    return entries
      .filter((e) => e.isFile())
      .map((e) => DAILY_FILE_RE.exec(e.name)?.[1])
      .filter((d): d is string => d !== undefined)
      .sort();
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return [];
    throw error;
  }
}

/** 삭제 단계 — 머리 주석 순서. 던지지 않는다(예상 밖 오류도 errors에 남기고 발행 계속) */
export async function runPurgeStage(
  deps: PurgeStageDeps,
  ctx: { runId: string; startedAt: string },
): Promise<PurgeOutcome> {
  try {
    return await purge(deps, ctx);
  } catch (error) {
    // 방어선 — 단계 안의 읽기·쓰기 오류는 각자 잡는다. 여기 오면 계획 계산의 예상 밖 오류다(아무것도 쓰지 않았다).
    deps.logger.error("collect.purge.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    return finish(deps, {
      state: "blocked",
      takedowns: null,
      retention: null,
      scanned: 0,
      plan: planPurge({
        files: [],
        takedownIds: new Set(),
        retention: new Map(),
        now: ctx.startedAt,
      }),
      written: [],
      seenAdded: 0,
      errors: [{ step: "unexpected", error: errorText(error) }],
    });
  }
}

async function purge(
  deps: PurgeStageDeps,
  ctx: { runId: string; startedAt: string },
): Promise<PurgeOutcome> {
  const log = deps.logger;
  const startMs = Date.now();
  const errors: PurgeError[] = [];
  const outcome = (
    state: PurgeOutcome["state"],
    rest: Omit<PurgeOutcome, "state" | "errors">,
  ): PurgeOutcome => ({ state, ...rest, errors });

  // ① 설정
  let takedownIds = new Set<string>();
  let takedowns: number | null = null;
  try {
    const file = await (
      deps.loadTakedowns ??
      (() =>
        readConfigFile(deps.rootDir, "takedowns.json", TakedownsFileSchema))
    )();
    takedownIds = new Set(file.map((t) => t.id));
    takedowns = file.length;
  } catch (error) {
    errors.push({ step: "takedowns", error: errorText(error) });
    log.error("collect.purge.config", {
      file: "configs/takedowns.json",
      error: errorText(error),
    });
  }
  let retention: ReadonlyMap<string, number> = new Map();
  let retentionView: Record<string, number> | null = null;
  try {
    const sources = await (
      deps.loadSources ?? (() => loadSources(deps.rootDir))
    )();
    retention = retentionByPublisher(sources);
    retentionView = Object.fromEntries(retention);
  } catch (error) {
    errors.push({ step: "sources", error: errorText(error) });
    log.error("collect.purge.config", {
      file: "configs/sources.json",
      error: errorText(error),
    });
  }

  // ② 날짜 파일
  const files: Array<{ date: string; file: NewsFile }> = [];
  let dates: string[] = [];
  try {
    dates = await listDailyDates(deps.dataDir);
  } catch (error) {
    errors.push({ step: "list", error: errorText(error) });
    log.error("collect.purge.read", { stage: "list", error: errorText(error) });
  }
  for (const date of dates) {
    try {
      const file = await readNewsFile(newsFilePath(deps.dataDir, date));
      if (file === null) continue;
      if (file.date !== date) {
        throw new Error(`date(${file.date})가 파일명과 다름 — 건너뜀`);
      }
      files.push({ date, file });
    } catch (error) {
      errors.push({ step: "read", date, error: errorText(error) });
      log.warn("collect.purge.read", { date, error: errorText(error) });
    }
  }

  // ③ 계획 — 보존 기간은 다음 실행 전에 만료될 출처까지 미리 지운다(purge-plan.ts RETENTION_PURGE_LEAD_MS)
  const plan = planPurge({
    files,
    takedownIds,
    retention,
    now: ctx.startedAt,
    leadMs: RETENTION_PURGE_LEAD_MS,
  });
  const base = {
    takedowns,
    retention: retentionView,
    scanned: files.length,
    plan,
  };
  const planFields = {
    takedowns,
    takedownsFound: plan.takedownsFound.length,
    retentionPublishers: retention.size,
    scanned: files.length,
    takedownCards: plan.counts.takedownCards,
    retentionCards: plan.counts.retentionCards,
    retentionSources: plan.counts.retentionSources,
    files: plan.files.length,
  };
  if (isEmptyPurge(plan)) {
    log.info("collect.purge.done", {
      ...planFields,
      written: 0,
      seenAdded: 0,
      errors: errors.length,
      elapsedMs: Date.now() - startMs,
    });
    return finish(
      deps,
      outcome("done", { ...base, written: [], seenAdded: 0 }),
    );
  }
  log.info("collect.purge.plan", planFields);
  for (const file of plan.files) {
    log.info("collect.purge.file", {
      date: file.date,
      cards: file.removedCards.map((c) => `${c.id}:${c.reason}`),
      sources: file.removedSources.length,
    });
  }

  // ④ dry
  if (deps.dry) {
    const [head, ...rest] = formatPurgePlan(plan);
    deps.print(`── [dry] ${head ?? ""} — 쓰지 않음`);
    for (const line of rest) deps.print(line);
    log.info("collect.purge.dry", planFields);
    return finish(deps, outcome("dry", { ...base, written: [], seenAdded: 0 }));
  }

  // ⑤ 기억 먼저
  let seenAdded = 0;
  try {
    const stored = await readSeenUrls(deps.dataDir);
    if (stored.error !== null) throw new Error(stored.error);
    const merged = mergeSeenKeys(stored.urls, plan.seenKeys);
    if (merged.added > 0) {
      await writeSeenUrls(
        deps.dataDir,
        buildSeenUrlsFile(merged.seen, nowUtcIso(deps.now())),
      );
    }
    seenAdded = merged.added;
    log.info("collect.purge.seen", {
      file: SEEN_LABEL,
      keys: plan.seenKeys.size,
      added: merged.added,
    });
  } catch (error) {
    errors.push({ step: "seen", error: errorText(error) });
    log.error("collect.purge.seen", {
      file: SEEN_LABEL,
      error: errorText(error),
      action: "뉴스 파일을 지우지 않음 — 다음 실행이 다시 시도",
    });
    return finish(
      deps,
      outcome("blocked", { ...base, written: [], seenAdded: 0 }),
    );
  }

  // ⑥ 날짜 파일
  const written: string[] = [];
  for (const change of plan.files) {
    try {
      const file = buildNewsFile({
        date: change.date,
        generatedAt: nowUtcIso(deps.now()),
        runId: ctx.runId,
        cards: change.cards,
      });
      await writeNewsFile(newsFilePath(deps.dataDir, change.date), file);
      written.push(change.date);
      log.info("collect.purge.write", {
        date: change.date,
        cards: change.cards.length,
        removedCards: change.removedCards.length,
        removedSources: change.removedSources.length,
      });
    } catch (error) {
      errors.push({
        step: "write",
        date: change.date,
        error: errorText(error),
      });
      log.error("collect.purge.fail", {
        date: change.date,
        error: errorText(error),
      });
    }
  }
  log.info("collect.purge.done", {
    ...planFields,
    written: written.length,
    seenAdded,
    errors: errors.length,
    elapsedMs: Date.now() - startMs,
  });
  return finish(deps, outcome("done", { ...base, written, seenAdded }));
}

/** 오류가 있으면 prod는 Actions 오류 주석(실행 요약에 보인다) — 발행은 계속 */
function finish(deps: PurgeStageDeps, result: PurgeOutcome): PurgeOutcome {
  if (result.errors.length > 0 && deps.env === "prod") {
    const steps = [...new Set(result.errors.map((e) => e.step))].join("·");
    annotate(
      "error",
      `data 원본 삭제 단계 오류 ${result.errors.length}건(${steps})${result.state === "blocked" ? " — 기억 파일 오류로 뉴스 파일을 지우지 않음" : ""}. 빌드 제외는 그대로 적용되고 다음 수집 실행이 다시 시도한다`,
      { title: "data 원본 삭제 (FR-143·D32)" },
      { ci: true, write: deps.print },
    );
  }
  return result;
}

/**
 * 실행 요약 로그(`collect.done`) 한 칸 — `<state>:cards<n>/sources<m>`, 오류가 있으면 `/errors<k>`.
 * 예) `done:cards0/sources0` · `done:cards2/sources1` · `blocked:cards1/sources0/errors1` · `dry:cards1/sources0`
 * (blocked·dry의 건수는 계획 — 지우지 않았다)
 */
export function purgeSummary(
  purge: Pick<PurgeOutcome, "state" | "plan" | "errors">,
): string {
  const { takedownCards, retentionCards, retentionSources } = purge.plan.counts;
  const errors = purge.errors.length > 0 ? `/errors${purge.errors.length}` : "";
  return `${purge.state}:cards${takedownCards + retentionCards}/sources${retentionSources}${errors}`;
}

/** 삭제 단계 오류가 있으면 성공 실행을 partial로 낮춘다(실패 실행은 그대로) — runStatus(collect-run.ts) 바깥에서 덧씌운다 */
export function withPurgeStatus(
  status: RunLog["status"],
  purge: Pick<PurgeOutcome, "errors"> | null,
): RunLog["status"] {
  if (status === "success" && purge !== null && purge.errors.length > 0) {
    return "partial";
  }
  return status;
}
