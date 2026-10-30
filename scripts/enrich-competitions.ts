/**
 * 대회 파일 다시 보강 — API 호출 없이 (M2-03, PRD FR-42).
 *
 * 사용법: node --import tsx scripts/enrich-competitions.ts [--dry] [--comp EPL[,UCL…]]
 *   이미 받은 `data/competitions/{comp}.json`의 순위 행에 최근 5경기 폼을 그 파일의 경기 목록으로 다시 계산해 넣는다
 *   (standings-enrich.ts `reenrichCompetitionFile`). 전일 대비 `prevPos`는 같은 날 규칙으로 파일 값 그대로 남고 `updatedAt`도
 *   바꾸지 않는다 — 보강 규칙이 바뀌었거나 보강 전에 받은 파일(M2-03 첫 적용)에 쓴다. 정기 실행은 대회 단계가 받을 때 보강한다.
 *   --dry        쓰지 않고 대회별 요약만 출력
 *   --comp <ID>  대회만(쉼표·반복 가능)
 * 종료 코드: 읽지 못한 파일이 있으면 1.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CompIdSchema, type CompId } from "@/lib/schema";

import {
  readCompetitionFile,
  serializeCompetitionFile,
  writeCompetitionFile,
} from "./lib/competition-file";
import { parseCompArgs } from "./lib/competitions-stage";
import { reenrichCompetitionFile } from "./lib/standings-enrich";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dry: { type: "boolean", default: false },
      comp: { type: "string", multiple: true },
    },
    strict: true,
  });
  const picked = parseCompArgs(values.comp ?? []);
  if (!picked.ok) {
    console.error(picked.error);
    return 2;
  }
  const comps: CompId[] =
    picked.comps.length > 0 ? picked.comps : [...CompIdSchema.options];
  let failed = 0;
  for (const comp of comps) {
    const read = await readCompetitionFile(DATA_DIR, comp);
    if (read.status !== "ok") {
      console.log(
        `${comp}: 건너뜀 (${read.status === "missing" ? "파일 없음" : read.error})`,
      );
      if (read.status === "invalid") failed += 1;
      continue;
    }
    const next = reenrichCompetitionFile(read.file);
    const rows = next.standings;
    const full = rows.filter((r) => r.form.length === 5).length;
    const some = rows.filter((r) => r.form.length > 0).length;
    const withPrev = rows.filter((r) => r.prevPos !== null).length;
    const changed =
      serializeCompetitionFile(next) !== serializeCompetitionFile(read.file);
    console.log(
      `${comp}: 팀 ${rows.length} · 폼 있음 ${some} · 5칸 ${full} · prevPos ${withPrev} · ${changed ? (values.dry ? "바뀜(dry)" : "씀") : "같음"}`,
    );
    if (changed && !values.dry) await writeCompetitionFile(DATA_DIR, next);
  }
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[enrich-competitions] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
