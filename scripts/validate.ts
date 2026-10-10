/**
 * `npm run validate` 진입점 (M0-17) — configs·data 스키마 + 교차 참조 검증. 오류가 있으면 exit 1.
 * ci.yml(push마다)과 collect.yml(발행 전 검증 게이트)이 호출한다 — 잘못된 설정은 CI를 실패시킨다.
 *
 * 사용법: npm run validate -- [--configs-only]
 * 판정 로직은 scripts/lib/validate-*.ts(순수 함수), 이 파일은 읽기·출력·종료 코드만 맡는다.
 * 발행 검증 게이트(카드 수 하한·링크 형식·takedowns 제외)는 M1-25에서 추가한다.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readValidationSnapshot } from "./lib/validate-fs";
import {
  VALIDATE_USAGE,
  buildValidationReport,
  formatValidationReport,
  parseValidateArgs,
  validationExitCode,
} from "./lib/validate-report";

const TAG = "[validate]";

/** 저장소 루트 = 이 파일(scripts/validate.ts)의 상위 폴더. 실행 위치(cwd)와 무관하게 같은 파일을 본다. */
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const parsed = parseValidateArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`${TAG} 인자 오류: ${parsed.error}\n\n${VALIDATE_USAGE}`);
  process.exit(1);
}
if (parsed.value.help) {
  console.log(VALIDATE_USAGE);
  process.exit(0);
}

const { configsOnly } = parsed.value;
const report = buildValidationReport(
  readValidationSnapshot(ROOT_DIR, { configsOnly }),
  { configsOnly },
);

for (const line of formatValidationReport(report, {
  tag: TAG,
  annotations: process.env.GITHUB_ACTIONS === "true",
})) {
  console.log(line);
}

process.exitCode = validationExitCode(report);
