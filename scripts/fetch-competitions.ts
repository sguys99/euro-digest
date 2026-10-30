/**
 * 대회 페이지 데이터 받기 — 단독 실행 진입점 (M2-02, PRD FR-40~45). 정기 실행 통합(collect.yml)은 M2-09.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/fetch-competitions.ts [--dry] [--comp EPL[,UCL…]]
 *   (인자 없음)  6개 대회(configs/competitions.json 순서) × 순위·시즌 경기·득점 순위 = 18요청 → data/competitions/{comp}.json
 *   --dry        파일을 쓰지 않고 요약만 출력한다(요청은 보낸다)
 *   --comp <ID>  대회만 골라 받는다(쉼표·반복 가능, 대소문자 무관 — 예: --comp epl,ucl)
 *   --help, -h   사용법
 *
 * 호출: football-data 대회당 3요청(동시 1개, 응답 후 6.5초 간격 — 클라이언트 정책). 키는 FOOTBALL_DATA_API_KEY 환경변수로만
 * 받고 출력하지 않는다. 응답 본문은 저장·로그하지 않는다(변환한 값만 data/에 쓴다 — 원본 커밋 금지, PRD §16 약관 9.1 위험).
 * 실패한 대회·조각은 전일 파일 값을 유지한다(scripts/lib/competition-file.ts). 종료 코드: 모든 대회가 실패하면 1, 아니면 0.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CompetitionsFileSchema } from "@/lib/schema";

import {
  readCompetitionFile,
  writeCompetitionFile,
} from "./lib/competition-file";
import { fetchCompetitionFiles, parseCompArgs } from "./lib/competitions-stage";
import { readConfigFile } from "./lib/config-files";
import { createLogger } from "./lib/logger";
import { createFootballDataClient } from "./lib/providers/football-data";
import { buildTeamIdIndex, loadTeamIds } from "./lib/team-ids";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");

const USAGE = [
  "사용법: node --env-file-if-exists=.env.local --import tsx scripts/fetch-competitions.ts [--dry] [--comp <ID>]",
  "  --dry        data/competitions/에 쓰지 않고 요약만 출력 (요청은 보낸다 — 대회당 3건)",
  "  --comp <ID>  대회만 (EPL·LALIGA·SERIEA·BUNDESLIGA·LIGUE1·UCL, 쉼표·반복 가능)",
  "  --help, -h   이 도움말",
].join("\n");

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dry: { type: "boolean", default: false },
      comp: { type: "string", multiple: true },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const log = createLogger({ scope: "fetch-competitions" });
  const picked = parseCompArgs(values.comp ?? []);
  if (!picked.ok) {
    console.error(`${picked.error}\n${USAGE}`);
    return 2;
  }
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    log.error("collect.competition.skip", { reason: "no-api-key" });
    return 1;
  }
  const allComps = await readConfigFile(
    ROOT_DIR,
    "competitions.json",
    CompetitionsFileSchema,
  );
  const competitions =
    picked.comps.length === 0
      ? allComps
      : allComps.filter((c) => picked.comps.includes(c.id));
  const teams = buildTeamIdIndex(await loadTeamIds(ROOT_DIR));
  const client = createFootballDataClient({
    apiKey,
    fetch,
    onRetry: (e) =>
      log.warn("collect.competition.retry", {
        path: e.path,
        retry: e.retry,
        errorType: e.error.kind,
        status: e.error.status ?? null,
        delayMs: e.delayMs,
      }),
  });

  const stage = await fetchCompetitionFiles({
    client,
    competitions,
    teams,
    now: () => new Date(),
    log,
    readPrevious: async (comp) => {
      const read = await readCompetitionFile(DATA_DIR, comp);
      if (read.status === "invalid") {
        log.warn("collect.competition.previous-invalid", {
          comp,
          error: read.error,
        });
      }
      return read.status === "ok" ? read.file : null;
    },
  });

  let written = 0;
  let failed = 0;
  for (const r of stage.results) {
    const o = r.outcome;
    if (o.action !== "write") {
      failed += 1;
      log.warn("collect.competition.keep", {
        comp: r.comp,
        reason: o.action === "keep" ? o.reason : o.error,
      });
      continue;
    }
    if (values.dry) continue;
    const target = await writeCompetitionFile(DATA_DIR, o.file);
    written += 1;
    log.info("collect.competition.write", {
      comp: r.comp,
      file: path.relative(ROOT_DIR, target),
      updatedAt: o.file.updatedAt,
    });
  }
  log.info("collect.competition.summary", {
    comps: stage.results.length,
    written,
    failed,
    dry: values.dry,
    apiCalls: stage.apiCalls,
    retries: stage.retries,
  });
  return failed === stage.results.length && failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[fetch-competitions] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
