/**
 * 수집 가드의 data 읽기(I/O) — 결과 지연 재시도(판단 순서 6a, PRD §15 D60) 입력. 판단 규칙은 scripts/lib/collect-guard.ts의
 * 순수 함수이고, 이 파일은 체크아웃의 `data/briefs/<발행일>.json`·`data/runs.json`·커밋을 읽어 그 입력(`ResultsPendingCheck`)을
 * 만든다. CLI(scripts/collect-guard.ts)는 import 시 바로 실행되므로 테스트할 수 있게 여기 둔다.
 *
 * collect.yml guard job은 main 최신을 체크아웃한다(`ref: main` — concurrency로 기다린 실행이 앞 실행의 data 커밋을 보게).
 * 던지지 않는다: 브리핑 읽기 오류는 unreadable, 실행 기록 읽기 오류는 attempts null(둘 다 재시도하지 않는 쪽), 커밋을 모르면 null.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { nowUtcIso, publishSlotAt } from "@/lib/time";

import { readBriefFile } from "./brief-file";
import {
  countCollectAttempts,
  todayBriefState,
  type ResultsPendingCheck,
} from "./collect-guard";
import { DEFAULT_DATA_DIR, readRuns, runsPathFor } from "./cost";

/** 저장소 폴더의 HEAD 커밋 — git이 없거나 저장소가 아니면 null */
export function gitHeadCommit(repoDir: string): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export interface ResultsPendingLoadOptions {
  /** data 폴더(기본: 저장소 data/) */
  dataDir?: string;
  /** 커밋 읽기(테스트 주입용) — 기본은 data 폴더의 부모에서 `git rev-parse HEAD` */
  readCommit?: (repoDir: string) => string | null;
}

/**
 * 결과 지연 재시도(6a) 입력 — 오늘 발행일(`publishSlotAt(now).date`) 브리핑 상태, 그 발행일 prod collect 실행 기록 수, 읽은 커밋.
 */
export async function loadResultsPendingCheck(
  now: Date,
  {
    dataDir = DEFAULT_DATA_DIR,
    readCommit = gitHeadCommit,
  }: ResultsPendingLoadOptions = {},
): Promise<ResultsPendingCheck> {
  const date = publishSlotAt(nowUtcIso(now)).date;
  const brief = todayBriefState(date, await readBriefFile(dataDir, date));
  const dataCommit = readCommit(path.dirname(dataDir));
  try {
    const runs = await readRuns(runsPathFor("prod", dataDir));
    return { brief, attempts: countCollectAttempts(runs, date), dataCommit };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      brief,
      attempts: null,
      runsError: message.split("\n")[0] ?? message,
      dataCommit,
    };
  }
}
