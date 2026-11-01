/**
 * 한국 선수 현황 파일 `data/players/korean.json`의 입출력·단계 (M3-03 — 규칙은 korean-players-data.ts 순수 함수).
 * 단독 진입점(scripts/build-players.ts — `npm run build:players`)과 수집 실행(collect-run.ts — 팀 단계 뒤)이 같은 단계를 쓴다.
 *
 *   읽기: configs(korean-players·team-ids·names.ko·competitions) + 원장 전체(data/matches — team-files-io.ts `readLedgerAll`, 깨진
 *         달은 던진다) + 메타(meta.json — 없으면 원장이 시작되지 않은 것: 건너뜀) + 대회 파일(data/competitions, 없거나 깨진 대회는
 *         빠진다) + 이전 파일(깨졌으면 경고 후 새로 만든다 — 비활성 선수의 동결 레코드는 그때 잃는다)
 *   쓰기: write 모드 + 내용(generatedAt 제외)이 바뀌었을 때만, 임시 파일 → rename. preview 모드(dry·dev)는 쓰지 않는다.
 *   발행 묶음: collect.yml은 data/ 변경분을 검증·빌드가 통과한 뒤에만 `발행` 커밋에 넣는다 — 발행이 실패하면 이 파일도 커밋되지
 *   않는다(실패 실행 기록 보존은 runs.json·원장·이월만 — PRD §15 D49). 던지지 않는다(실패는 결과로 — 발행을 멈추지 않는다).
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersDataFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type KoreanPlayersDataFile,
  type LedgerMatch,
  type NamesKoFile,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";
import {
  buildKoreanPlayersFile,
  serializeKoreanPlayersFile,
  type KoreanPlayersBuild,
} from "./korean-players-data";
import type { Logger } from "./logger";
import { readLedgerMeta } from "./match-ledger";
import { buildNameIndex, isKnownName } from "./names";
import { readCompetitionFiles, readLedgerAll } from "./team-files-io";
import { loadTeamIds } from "./team-ids";

/** data/ 기준 경로 */
export const KOREAN_PLAYERS_REL_PATH = path.join("players", "korean.json");

export function koreanPlayersPath(dataDir: string): string {
  return path.join(dataDir, KOREAN_PLAYERS_REL_PATH);
}

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

export interface KoreanPlayersRead {
  value: KoreanPlayersDataFile | null;
  exists: boolean;
  error: string | null;
}

/** 이전 파일 읽기 — 던지지 않는다 */
export async function readKoreanPlayersFile(
  dataDir: string,
): Promise<KoreanPlayersRead> {
  let text: string;
  try {
    text = await readFile(koreanPlayersPath(dataDir), "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return { value: null, exists: false, error: null };
    return {
      value: null,
      exists: false,
      error: `읽기 실패: ${errorText(error)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { value: null, exists: true, error: "JSON 파싱 실패" };
  }
  const parsed = KoreanPlayersDataFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      value: null,
      exists: true,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { value: parsed.data, exists: true, error: null };
}

/** 파일 쓰기(임시 파일 → rename) */
export async function writeKoreanPlayersFile(
  dataDir: string,
  file: KoreanPlayersDataFile,
): Promise<string> {
  const target = koreanPlayersPath(dataDir);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(
      tmp,
      serializeKoreanPlayersFile(KoreanPlayersDataFileSchema.parse(file)),
      "utf8",
    );
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

/** names.ko 팀 항목 slug → 대표 영문 이름(다음 경기 상대 이름) */
export function teamNamesOf(names: NamesKoFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of names.entries) {
    if (e.kind === "team" && e.slug !== undefined && !out.has(e.slug)) {
      out.set(e.slug, e.en[0]!);
    }
  }
  return out;
}

export type KoreanPlayersStageOutcome =
  | { state: "skipped"; reason: "no-ledger" }
  | { state: "failed"; errorType: "setup" | "unexpected"; error: string }
  | {
      state: "done";
      mode: "write" | "preview";
      build: KoreanPlayersBuild;
      /** 쓴 경로(preview·변화 없음·쓰기 실패면 null) */
      written: string | null;
      writeError: string | null;
      /** 이전 파일 읽기 오류(새로 만들었다) */
      previousError: string | null;
    };

export interface KoreanPlayersStageDeps {
  rootDir: string;
  dataDir: string;
  logger: Pick<Logger, "info" | "warn" | "error">;
}

/**
 * 한국 선수 현황 단계 — 읽기 → `buildKoreanPlayersFile` → (write 모드 + 바뀜) 쓰기. 던지지 않는다.
 * `ledgerExtra`: 원장에 쓰지 않은 실행(dry·dev·정기 운영 전)의 이번 실행 원장 항목 — 디스크 원장에 겹치면 이 값이 이긴다(팀 단계와 같다).
 */
export async function runKoreanPlayersStage(
  deps: KoreanPlayersStageDeps,
  input: {
    mode: "write" | "preview";
    now: string;
    ledgerExtra?: readonly LedgerMatch[];
  },
): Promise<KoreanPlayersStageOutcome> {
  const log = deps.logger;
  const warn = (event: string, fields: Record<string, unknown>) =>
    log.warn(event, fields);
  let buildInput: Parameters<typeof buildKoreanPlayersFile>[0];
  let previousError: string | null = null;
  try {
    const meta = await readLedgerMeta(deps.dataDir);
    if (meta.error !== null) {
      throw new Error(`data/matches/meta.json ${meta.error}`);
    }
    if (meta.value === null) {
      log.info("players.korean.skip", { reason: "no-ledger" });
      return { state: "skipped", reason: "no-ledger" };
    }
    const [players, teamIds, namesFile, competitionsCfg] = await Promise.all([
      readConfigFile(
        deps.rootDir,
        "korean-players.json",
        KoreanPlayersFileSchema,
      ),
      loadTeamIds(deps.rootDir),
      readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
      readConfigFile(deps.rootDir, "competitions.json", CompetitionsFileSchema),
    ]);
    const ledger = await readLedgerAll(deps.dataDir);
    const merged = new Map(ledger.matches.map((m) => [m.id, m]));
    for (const m of input.ledgerExtra ?? []) merged.set(m.id, m);
    const previous = await readKoreanPlayersFile(deps.dataDir);
    if (previous.error !== null) {
      previousError = previous.error;
      log.warn("players.korean.previous-unreadable", {
        file: "data/players/korean.json",
        error: previous.error,
      });
    }
    const index = buildNameIndex(namesFile, competitionsCfg);
    buildInput = {
      players,
      teamIds,
      ledger: [...merged.values()],
      meta: meta.value,
      competitions: await readCompetitionFiles(deps.dataDir, warn),
      teamNames: teamNamesOf(namesFile),
      previous: previous.value,
      now: input.now,
      isKnownName: (name) => isKnownName(index, name),
    };
  } catch (error) {
    log.error("players.korean.fail", {
      stage: "setup",
      error: errorText(error),
    });
    return { state: "failed", errorType: "setup", error: errorText(error) };
  }
  try {
    const build = buildKoreanPlayersFile(buildInput);
    for (const m of build.teamMismatches) {
      // 이적 감지 단서(FR-63) — M3-04가 이슈로 만든다. 지금은 경고 로그만
      log.warn("players.korean.team-mismatch", { ...m });
    }
    if (build.unmappedTeams.length > 0) {
      log.warn("players.korean.team-unmapped", {
        players: build.unmappedTeams,
      });
    }
    let written: string | null = null;
    let writeError: string | null = null;
    if (input.mode === "write" && (build.changed || previousError !== null)) {
      try {
        written = await writeKoreanPlayersFile(deps.dataDir, build.file);
      } catch (error) {
        writeError = errorText(error);
        log.error("players.korean.write.fail", {
          file: "data/players/korean.json",
          error: writeError,
        });
      }
    }
    log.info("players.korean.done", {
      mode: input.mode,
      players: build.file.players.length,
      changed: build.changed,
      updated: build.updated,
      frozen: build.frozen,
      fallback: build.fallback,
      mismatches: build.teamMismatches.length,
      unknownNames: build.unknownNames.length,
      written: written !== null,
    });
    return {
      state: "done",
      mode: input.mode,
      build,
      written,
      writeError,
      previousError,
    };
  } catch (error) {
    log.error("players.korean.fail", {
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
