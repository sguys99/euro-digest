/**
 * 팀 slug 일회성 이전 — 옛 slug(M0-32 규칙) → 새 slug(PRD §15 D63 ③) (M2-04). 네트워크·LLM 호출 없음.
 *
 * 사용법: npx tsx scripts/migrate-team-slugs.ts [--write]
 *   (인자 없음)  바꿀 자리 수만 파일별로 출력한다
 *   --write      제자리에 쓴다 — 뒤에 `npx prettier --write configs/names.ko.json configs/korean-players.json`(configs는 Prettier 대상)과
 *                `npm run validate`
 * 대상·규칙은 scripts/lib/team-slug-migration.ts. 카드 ID·카드의 다른 필드는 바꾸지 않는다. 두 번 돌려도 결과가 같다(새 slug는
 * 옛 slug 표에 없다). 끝으로 data/·configs/·fixtures/news-sample*에 따옴표로 둘러싼 옛 slug가 남았는지 검사한다(남으면 종료 코드 2).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  findOldSlugs,
  migrateKoreanPlayersJson,
  migrateNamesKoJson,
  migrateNewsJson,
  migrateNewsMetaJson,
  serializeJson,
  type MigrationResult,
} from "./lib/team-slug-migration";

const TAG = "[migrate-team-slugs]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

type Migrator = (json: unknown) => MigrationResult<unknown>;

function jsonFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT_DIR, dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

function main(): number {
  const { values } = parseArgs({
    options: { write: { type: "boolean", default: false } },
    strict: true,
  });
  const targets: Array<[string, Migrator]> = [
    ...jsonFiles("data/news").map((f): [string, Migrator] => [
      f,
      migrateNewsJson,
    ]),
    ["fixtures/news-sample.json", migrateNewsJson],
    ["fixtures/news-sample.meta.json", migrateNewsMetaJson],
    ["configs/names.ko.json", migrateNamesKoJson],
    ["configs/korean-players.json", migrateKoreanPlayersJson],
  ];
  let total = 0;
  for (const [rel, migrate] of targets) {
    const file = path.join(ROOT_DIR, rel);
    const { json, changed } = migrate(JSON.parse(readFileSync(file, "utf8")));
    total += changed;
    if (changed === 0) continue;
    console.log(`${TAG} ${rel}: ${changed}곳`);
    if (values.write) writeFileSync(file, serializeJson(json), "utf8");
  }
  console.log(
    `${TAG} 합계 ${total}곳${values.write ? " — 썼다" : " (--write 없음 — 쓰지 않음)"}`,
  );
  if (!values.write) return 0;

  // 남은 옛 slug 검사(따옴표로 둘러싼 정확한 값)
  const scan = [
    ...jsonFiles("data/news"),
    ...jsonFiles("data/briefs"),
    ...jsonFiles("data/cache"),
    ...jsonFiles("configs"),
    "fixtures/news-sample.json",
    "fixtures/news-sample.meta.json",
  ];
  let left = 0;
  for (const rel of scan) {
    const found = findOldSlugs(readFileSync(path.join(ROOT_DIR, rel), "utf8"));
    if (found.length === 0) continue;
    left += found.length;
    console.error(`${TAG} 옛 slug가 남음 ${rel}: ${found.join(", ")}`);
  }
  return left > 0 ? 2 : 0;
}

process.exitCode = main();
