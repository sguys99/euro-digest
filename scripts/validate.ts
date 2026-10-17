/**
 * `npm run validate` 진입점 (M0-17) — configs·data 스키마 + 교차 참조 + 발행 검증 게이트(M1-25, FR-153). 오류가 있으면 exit 1.
 * ci.yml(push마다)과 collect.yml(발행 전 검증 게이트)이 호출한다 — 잘못된 설정·발행하면 안 되는 data는 커밋·배포를 막는다.
 *
 * 사용법: npm run validate -- [--configs-only] [--publish-date <YYYY-MM-DD|today>]
 * 판정 로직은 scripts/lib/validate-*.ts·publish-gate.ts(순수 함수), 이 파일은 읽기·실행 시각·출력·종료 코드만 맡는다.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readValidationSnapshot } from "./lib/validate-fs";
import {
  VALIDATE_USAGE,
  buildValidationReport,
  formatValidationReport,
  parseValidateArgs,
  resolvePublishDate,
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
// 실행 시각 — 게이트의 시각 기준 검사(미래 날짜·보존 기간 만료·72시간·발행일 기본값 = KST 오늘)
const now = new Date();
const report = buildValidationReport(
  readValidationSnapshot(ROOT_DIR, { configsOnly }),
  {
    configsOnly,
    now,
    ...(parsed.value.publishDate !== undefined
      ? { publishDate: resolvePublishDate(parsed.value.publishDate, now) }
      : {}),
  },
);

for (const line of formatValidationReport(report, {
  tag: TAG,
  annotations: process.env.GITHUB_ACTIONS === "true",
})) {
  console.log(line);
}

process.exitCode = validationExitCode(report);
