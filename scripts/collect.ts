/**
 * `npm run collect` 진입점 — 수집 → 정제 → 요약 → 검증 (CLAUDE.md §6.1, PRD §10).
 *
 * M0-04: 인자 파싱만 구현하고 파이프라인은 TODO. 환경변수는 package.json의
 * `node --env-file-if-exists=.env.local`이 로컬에서만 채운다(CI는 Actions가 주입).
 */
import { COLLECT_USAGE, parseCollectArgs } from "./lib/cli-args";
import { todo } from "./lib/todo";

const parsed = parseCollectArgs(process.argv.slice(2), process.env.LLM_MODE);

if (!parsed.ok) {
  console.error(`[collect] 인자 오류: ${parsed.error}`);
  console.error(COLLECT_USAGE);
  process.exit(1);
}

const args = parsed.value;

if (args.help) {
  console.log(COLLECT_USAGE);
  process.exit(0);
}

console.log(
  `[collect] 인자: limit=${args.limit ?? "(미지정 → MAX_ITEMS_PER_RUN)"} dry=${args.dry} mock=${args.mock} llmMode=${args.llmMode}`,
);

todo(
  "npm run collect",
  "M1-01(수직 슬라이스)·M1-02~M1-27(수집·정제·요약·검증·runs 기록)",
  "수집(M1-A) → 정제(M1-B) → 요약(M1-C) → 발행 검증(M1-25), 축구 데이터 단계는 M2-09",
);
