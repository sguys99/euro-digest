/**
 * `configs/team-colors.json` 생성 (DR-05, PRD §15 D62 ④, plan M2-05).
 *
 *   npx tsx scripts/build-team-colors.ts           # 보정 요약만 출력(파일 안 씀)
 *   npx tsx scripts/build-team-colors.ts --write   # configs/team-colors.json 갱신
 *
 * 입력: `docs/design/d1/team-colors-source.json`(키트 원색 2색·tla·약어·확신도·출처 — 사람이 고친다).
 * 상의 색에 D62 ④ 대비 보정(src/lib/kit-contrast.ts)을 적용해 [보정 상의, 하의] + 약어만 설정 파일에 쓴다.
 * 원색을 고치면 이 스크립트를 다시 돌린다(tests/team-colors.test.ts가 두 파일이 맞는지 확인한다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { TeamColorsFileSchema } from "@/lib/schema";

import {
  buildTeamColorRows,
  buildTeamColors,
  TEAM_COLORS_SOURCE_PATH,
  TeamColorSourceFileSchema,
} from "./lib/team-colors";

const TAG = "[build-team-colors]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function main(): void {
  const { values } = parseArgs({
    options: { write: { type: "boolean", default: false } },
  });
  const source = TeamColorSourceFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(ROOT_DIR, TEAM_COLORS_SOURCE_PATH), "utf8"),
    ),
  );
  const rows = buildTeamColorRows(source);
  const corrected = rows.filter((r) => r.shirt.corrected);
  const minContrast = Math.min(...rows.map((r) => r.shirt.contrast));
  console.log(
    `${TAG} 팀 ${rows.length} · 보정 ${corrected.length} · 보정 뒤 최저 대비 ${minContrast.toFixed(2)}`,
  );
  for (const r of corrected) {
    console.log(
      `${TAG}   ${r.slug}: ${r.shirt.original} (${r.shirt.originalContrast.toFixed(2)}) → ${r.shirt.shirt} (${r.shirt.contrast.toFixed(2)}, f ${r.shirt.factor.toFixed(2)})`,
    );
  }
  const file = TeamColorsFileSchema.parse(buildTeamColors(source));
  if (values.write) {
    writeFileSync(
      path.join(ROOT_DIR, "configs/team-colors.json"),
      `${JSON.stringify(file, null, 2)}\n`,
    );
    console.log(`${TAG} configs/team-colors.json 갱신`);
  }
}

main();
