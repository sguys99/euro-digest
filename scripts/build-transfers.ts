/**
 * 이적 트래커 파일 생성 — 단독 실행 진입점 (M4-01, PRD FR-100·FR-102·FR-106).
 * 정기 실행은 collect.ts(뉴스 단계 뒤 — collect-run.ts)가 같은 단계(scripts/lib/transfers-io.ts)를 돌린다.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-transfers.ts [--dry]
 *   (인자 없음)  configs/takedowns.json + data/news 전체 → data/transfers.json (내용이 같으면 다시 쓰지 않는다). API·LLM 호출 없음
 *   --dry        파일을 쓰지 않고 요약·결과 JSON을 출력한다
 *
 * 종료 코드: 단계 실패·쓰기 실패면 1.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { nowUtcIso } from "@/lib/time";

import { createLogger } from "./lib/logger";
import { runTransfersStage } from "./lib/transfers-io";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");

const USAGE = [
  "사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-transfers.ts [--dry]",
  "  --dry        data/transfers.json에 쓰지 않고 결과만 출력",
  "  --help, -h   이 도움말",
].join("\n");

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dry: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const log = createLogger({ scope: "build-transfers" });
  const outcome = await runTransfersStage(
    { rootDir: ROOT_DIR, dataDir: DATA_DIR, logger: log },
    { mode: values.dry ? "preview" : "write", now: nowUtcIso() },
  );
  if (outcome.state === "failed") return 1;
  const { stats } = outcome.build;
  console.log(
    `── 이적 ${outcome.build.transfers.length}건 (근거 카드 ${stats.cards}장 · 삭제 요청 제외 ${stats.takedown} · 중복 ${stats.duplicates} · 행선지 미정 ${stats.unknownDestination} · 잠잠 ${stats.quiet}) — rumor ${stats.byStatus.rumor} · negotiating ${stats.byStatus.negotiating} · agreed ${stats.byStatus.agreed} · official ${stats.byStatus.official} · collapsed ${stats.byStatus.collapsed}`,
  );
  if (values.dry) console.log(outcome.text.trimEnd());
  else if (outcome.written === null && outcome.writeError === null) {
    console.log("data/transfers.json — 내용이 같아 쓰지 않음");
  }
  return outcome.writeError !== null ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[build-transfers] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
