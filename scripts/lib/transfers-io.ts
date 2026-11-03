/**
 * 이적 트래커 파일 `data/transfers.json`의 입출력·단계 (M4-01 — 규칙은 transfers.ts 순수 함수).
 * 단독 진입점(scripts/build-transfers.ts — `npm run build:transfers`)과 수집 실행(collect-run.ts — 뉴스 단계 뒤)이 같은 단계를 쓴다.
 *
 *   읽기: configs/takedowns.json(읽지 못하면 실패 — 삭제 요청 카드를 근거로 쓰지 않게, 전일 파일 유지) + data/news 날짜 파일 전부
 *         (하나라도 깨졌으면 실패 — 일부 기간이 빠진 상태 머신은 단계를 잘못 낼 수 있다) + `newsOverride`(디스크에 쓰지 않은 이번 실행의
 *         발행일 파일 — dry·dev) + 이전 파일(바뀌었는지 비교용 — 깨졌으면 경고 후 새로 쓴다)
 *   쓰기: write 모드 + 내용이 바뀌었을 때만, 임시 파일 → rename. preview 모드(dry·dev)는 쓰지 않는다.
 *   발행 묶음: collect.yml은 data/ 변경분을 검증·빌드가 통과한 뒤에만 `발행` 커밋에 넣는다 — 발행이 실패하면 이 파일도 커밋되지 않는다
 *   (실패 실행 기록 보존은 runs.json·원장·이월만 — PRD §15 D49, run-preserve.ts `NOT_PRESERVED_PATHS`). 던지지 않는다(실패는 결과로).
 *   월별 병합 파일(CLAUDE §8 '일별 뉴스 90일 후 월별 병합' — M5-10 `YYYY-MM.json`)도 `readRetainedNews`가 읽는다 — 90일보다 오래된
 *   근거가 빠지면 단계가 낮아진다.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  TakedownsFileSchema,
  TransfersFileSchema,
  type NewsFile,
  type TakedownsFile,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";
import type { Logger } from "./logger";
import { readAllNewsIssues } from "./news-month-file";
import {
  buildTransfers,
  serializeTransfersFile,
  type TransferNewsInput,
  type TransfersBuild,
} from "./transfers";

/** data/ 기준 경로 */
export const TRANSFERS_REL_PATH = "transfers.json";

export function transfersPath(dataDir: string): string {
  return path.join(dataDir, TRANSFERS_REL_PATH);
}

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

/**
 * data/news 호 전부(오름차순) — 일별 파일 + 월별 병합 파일(M5-10, news-month-file.ts `readAllNewsIssues`). 하나라도 읽지 못하거나
 * 일별 date가 파일명과 다르거나 같은 날짜가 일별·월별에 함께 있으면 던진다. 폴더가 없으면 []
 */
export async function readRetainedNews(
  dataDir: string,
): Promise<TransferNewsInput[]> {
  return (await readAllNewsIssues(dataDir)).map(({ date, file }) => ({
    date,
    cards: file.cards,
  }));
}

export interface TransfersPrevious {
  /** 이전 파일 원문(없으면 null) */
  text: string | null;
  /** 읽기·파싱·스키마 오류(새로 쓴다) */
  error: string | null;
}

/** 이전 파일 읽기 — 던지지 않는다 */
export async function readTransfersText(
  dataDir: string,
): Promise<TransfersPrevious> {
  let text: string;
  try {
    text = await readFile(transfersPath(dataDir), "utf8");
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") {
      return { text: null, error: null };
    }
    return { text: null, error: `읽기 실패: ${errorText(error)}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { text, error: "JSON 파싱 실패" };
  }
  const parsed = TransfersFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      text,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { text, error: null };
}

/** 파일 쓰기(임시 파일 → rename) — `text`는 단계가 스키마로 검증한 뒤 직렬화한 값 */
export async function writeTransfersFile(
  dataDir: string,
  text: string,
): Promise<string> {
  const target = transfersPath(dataDir);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

export type TransfersStageOutcome =
  | { state: "failed"; errorType: "setup" | "unexpected"; error: string }
  | {
      state: "done";
      mode: "write" | "preview";
      build: TransfersBuild;
      /** 직렬화한 파일 내용 */
      text: string;
      /** 이전 파일과 내용이 다르다(이전 파일이 없거나 깨졌으면 true) */
      changed: boolean;
      /** 쓴 경로(preview·변화 없음·쓰기 실패면 null) */
      written: string | null;
      writeError: string | null;
      previousError: string | null;
    };

export interface TransfersStageDeps {
  rootDir: string;
  dataDir: string;
  logger: Pick<Logger, "info" | "warn" | "error">;
  /** 테스트 주입용 — 기본 configs/takedowns.json */
  loadTakedowns?: () => Promise<TakedownsFile>;
}

/**
 * 이적 트래커 단계 — 읽기 → `buildTransfers` → (write 모드 + 바뀜) 쓰기. 던지지 않는다.
 * `newsOverride`: 디스크에 쓰지 않은 이번 실행의 발행일 파일(dry·dev 수집) — 같은 날짜 디스크 파일 대신 쓴다.
 */
export async function runTransfersStage(
  deps: TransfersStageDeps,
  input: {
    mode: "write" | "preview";
    now: string;
    newsOverride?: Pick<NewsFile, "date" | "cards"> | null;
  },
): Promise<TransfersStageOutcome> {
  const log = deps.logger;
  let news: TransferNewsInput[];
  let takedownIds: Set<string>;
  let previous: TransfersPrevious;
  try {
    const takedowns = await (
      deps.loadTakedowns ??
      (() =>
        readConfigFile(deps.rootDir, "takedowns.json", TakedownsFileSchema))
    )();
    takedownIds = new Set(takedowns.map((t) => t.id));
    news = await readRetainedNews(deps.dataDir);
    const override = input.newsOverride;
    if (override) {
      news = [
        ...news.filter((f) => f.date !== override.date),
        { date: override.date, cards: override.cards },
      ];
    }
    previous = await readTransfersText(deps.dataDir);
    if (previous.error !== null) {
      log.warn("transfers.previous-unreadable", {
        file: "data/transfers.json",
        error: previous.error,
      });
    }
  } catch (error) {
    log.error("transfers.fail", { stage: "setup", error: errorText(error) });
    return { state: "failed", errorType: "setup", error: errorText(error) };
  }
  try {
    const build = buildTransfers({ news, takedownIds, now: input.now });
    const text = serializeTransfersFile(
      TransfersFileSchema.parse(build.transfers),
    );
    const changed = previous.error !== null || previous.text !== text;
    let written: string | null = null;
    let writeError: string | null = null;
    if (input.mode === "write" && changed) {
      try {
        written = await writeTransfersFile(deps.dataDir, text);
      } catch (error) {
        writeError = errorText(error);
        log.error("transfers.write.fail", {
          file: "data/transfers.json",
          error: writeError,
        });
      }
    }
    log.info("transfers.done", {
      mode: input.mode,
      newsFiles: news.length,
      records: build.transfers.length,
      ...build.stats,
      changed,
      written: written !== null,
    });
    return {
      state: "done",
      mode: input.mode,
      build,
      text,
      changed,
      written,
      writeError,
      previousError: previous.error,
    };
  } catch (error) {
    log.error("transfers.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    return {
      state: "failed",
      errorType: "unexpected",
      error: errorText(error),
    };
  }
}
