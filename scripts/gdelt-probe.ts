/**
 * `npm run probe:gdelt` 진입점 (plan M1-46, M0-27 결정 3) — GDELT DOC API 하루 1회 소량 재측정(쿼리 2개·요청 3건 이내)을 하고
 * `docs/research/m1-observation.md`의 "GDELT 재측정" 표·7일 판정에 그날 한 줄을 남긴다(같은 날 다시 돌리면 그 줄 교체).
 * 측정·판정은 scripts/lib/gdelt-probe.ts의 순수 함수, 여기는 설정 읽기·요청·파일 쓰기만 한다.
 *
 * 사용법: npm run probe:gdelt -- [--dry] [--force] [--doc <경로>]
 *   --dry    요청하지 않고 계획(URL·순서)만 출력
 *   --force  오늘 기록이 있으면 아직 성공하지 못한 쿼리만 남은 요청으로 다시 잰다 — 앞 시도는 기록에 남기고(성공률에 포함) 하루 3건을 넘지 않는다
 *   --doc    기록할 문서(기본 docs/research/m1-observation.md — docs/research/ 아래 .md만)
 * 환경변수: CONTACT_EMAIL(User-Agent 연락처 — 비밀값 아님, 없으면 저장소 주소만). 응답 본문·결과 제목·URL은 출력·저장하지 않는다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { kstDate, nowUtcIso } from "@/lib/time";

import {
  GDELT_MAX_REQUESTS,
  applyGdeltRecord,
  buildGdeltProbePlan,
  judgeGdeltPeriod,
  mergeGdeltAttempts,
  planDayProbe,
  readGdeltRecords,
  renderGdeltVerdict,
  runGdeltProbe,
  type GdeltDayRecord,
} from "./lib/gdelt-probe";
import { createLogger } from "./lib/logger";
import {
  OBSERVATION_DOC_REL,
  isTrialDate,
  observationDocTemplate,
} from "./lib/observation-doc";
import { resolveResearchDocPath } from "./lib/research-doc";
import { feedUserAgent } from "./lib/rss";
import { loadSearchQueries } from "./lib/search-queries";
import { loadPublisherDomains } from "./lib/search-results";
import { loadSources } from "./lib/sources";

const USAGE = [
  "사용법: npm run probe:gdelt -- [--dry] [--force] [--doc <경로>]",
  "  --dry          요청하지 않고 측정 계획만 출력",
  "  --force        오늘 기록이 있으면 실패한 쿼리만 남은 요청으로 다시(앞 시도는 기록에 남고 하루 3건을 넘지 않는다)",
  `  --doc <경로>   기록 문서(기본 ${OBSERVATION_DOC_REL})`,
  "  --help, -h     이 도움말",
].join("\n");

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const logger = createLogger({ scope: "ops" });

async function readDoc(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return observationDocTemplate();
    }
    throw error;
  }
}

async function main(): Promise<number> {
  let values: { dry?: boolean; force?: boolean; doc?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: false,
      options: {
        dry: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        doc: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    console.error(
      `[probe:gdelt] 인자 오류: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
    );
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const [queries, sources, domains] = await Promise.all([
    loadSearchQueries(ROOT_DIR),
    loadSources(ROOT_DIR),
    loadPublisherDomains(ROOT_DIR),
  ]);
  const plan = buildGdeltProbePlan(queries, sources);
  const docTarget = resolveResearchDocPath(
    ROOT_DIR,
    values.doc ?? OBSERVATION_DOC_REL,
  );
  if (!docTarget.ok) {
    console.error(`[probe:gdelt] ${docTarget.error}`);
    return 1;
  }
  const docPath = docTarget.path;
  const today = kstDate(nowUtcIso());

  console.log(
    `[probe:gdelt] 발행일 ${today}${isTrialDate(today) ? " (관찰 전 시험 측정)" : ""} — 쿼리 ${plan.length}개 · 요청 최대 ${GDELT_MAX_REQUESTS}건`,
  );
  for (const q of plan) console.log(`  ${q.label}\n    ${q.url}`);
  if (values.dry) {
    console.log("[probe:gdelt] --dry: 요청하지 않음");
    return 0;
  }

  const doc = await readDoc(docPath);
  const existing = readGdeltRecords(doc).records.find((r) => r.date === today);
  if (existing && !values.force) {
    console.log(
      `[probe:gdelt] ${today} 기록이 이미 있다 — 하루 1회(M0-27 결정 3). 실패한 쿼리를 남은 요청으로 다시 재려면 --force`,
    );
    return 0;
  }
  // --force: 그날 앞 시도는 버리지 않고 하루 3건 상한에서 뺀다(성공률 왜곡 방지), 이미 성공한 쿼리는 다시 재지 않는다
  const day = planDayProbe(plan, existing);
  if (!day.ok) {
    console.error(`[probe:gdelt] 다시 재지 않음 — ${day.reason}`);
    return 1;
  }

  const contact = process.env.CONTACT_EMAIL?.trim();
  const fresh = await runGdeltProbe(day.plan, domains, {
    maxRequests: day.maxRequests,
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
    userAgent: feedUserAgent(contact),
    onAttempt: (a) =>
      logger.info("ops.gdelt.attempt", {
        key: a.key,
        attempt: a.attempt,
        status: a.status,
        outcome: a.outcome,
        results: a.results,
        capped: a.capped,
        lagMinutes: a.lagMinutes,
        allow: a.allow,
        notListed: a.notListed,
        elapsedMs: a.elapsedMs,
        error: a.error,
      }),
  });
  const attempts = mergeGdeltAttempts(existing?.attempts ?? [], fresh);
  const record: GdeltDayRecord = {
    v: 1,
    date: today,
    measuredAt: existing?.measuredAt ?? attempts[0]?.requestedAt ?? nowUtcIso(),
    trial: isTrialDate(today),
    contact: (existing?.contact ?? true) && Boolean(contact),
    attempts,
  };
  const next = applyGdeltRecord(doc, record);
  await mkdir(path.dirname(docPath), { recursive: true });
  await writeFile(docPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  logger.info("ops.gdelt.done", {
    date: today,
    requests: attempts.length,
    ok: attempts.filter((a) => a.outcome === "ok").length,
    file: path.relative(ROOT_DIR, docPath),
  });
  console.log(
    `\n${renderGdeltVerdict(judgeGdeltPeriod(readGdeltRecords(next).records))}`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `[probe:gdelt] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  },
);
