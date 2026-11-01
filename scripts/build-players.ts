/**
 * 한국 선수 현황 파일 생성 — 단독 실행 진입점 (M3-02·M3-03, PRD FR-61·FR-62·FR-64·FR-65, §15 D27·D33·D65).
 * 정기 실행은 collect.ts(팀 단계 뒤 — collect-run.ts)가 같은 단계(scripts/lib/korean-players-io.ts)를 돌린다.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-players.ts [--dry]
 *   (인자 없음)  configs + 경기 원장(data/matches) + 대회 파일(data/competitions) + 이전 파일 → data/players/korean.json
 *                (내용이 같으면 다시 쓰지 않는다). API·LLM 호출 없음
 *   --dry        파일을 쓰지 않고 요약·결과 JSON을 출력한다
 *
 * 미등록 고유명사(slug 없는 상대 팀·컵 대회 원문)는 출력만 한다 — unknown-names.json 적재는 정기 수집(prod)이 한다(개발 실행이
 * 횟수를 부풀리지 않게 — unknown-names.ts 머리 주석). 종료 코드: 단계 실패·쓰기 실패면 1, 원장이 아직 없으면 0(건너뜀).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { nowUtcIso } from "@/lib/time";

import { runKoreanPlayersStage } from "./lib/korean-players-io";
import { serializeKoreanPlayersFile } from "./lib/korean-players-data";
import { createLogger } from "./lib/logger";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");

const USAGE = [
  "사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-players.ts [--dry]",
  "  --dry        data/players/korean.json에 쓰지 않고 결과만 출력",
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
  const log = createLogger({ scope: "build-players" });
  const outcome = await runKoreanPlayersStage(
    { rootDir: ROOT_DIR, dataDir: DATA_DIR, logger: log },
    { mode: values.dry ? "preview" : "write", now: nowUtcIso() },
  );
  if (outcome.state === "skipped") return 0;
  if (outcome.state === "failed") return 1;
  const { build } = outcome;
  if (build.unknownNames.length > 0) {
    console.log(
      `── 미등록 고유명사 ${build.unknownNames.length}개 (/add-name 후보 — 파일에 적재하지 않음)\n${build.unknownNames
        .map((n) => `- ${n.name}${n.kind ? ` (${n.kind})` : ""}`)
        .join("\n")}`,
    );
  }
  if (values.dry) console.log(serializeKoreanPlayersFile(build.file));
  else if (outcome.written === null && outcome.writeError === null) {
    console.log("data/players/korean.json — 내용이 같아 쓰지 않음");
  }
  return outcome.writeError !== null ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[build-players] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
