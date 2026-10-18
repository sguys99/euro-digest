/**
 * `npm run quality:sample` 진입점 (plan M1-43) — 기간의 브리핑 줄·뉴스 카드에서 검수 표본(각 최대 20)을 뽑아
 * `docs/research/m1-quality-review.md` 체크리스트를 만든다(판정 칸은 비움 — 다시 만들면 같은 키 행의 판정·메모를 옮긴다).
 * 표본·사실·렌더는 scripts/lib/quality-sample.ts의 순수 함수, 여기는 data/·configs·football-data 읽기와 파일 쓰기만 한다.
 *
 * 사용법: npm run quality:sample -- --from YYYY-MM-DD --to YYYY-MM-DD [--seed N] [--offline] [--out <경로>] [--force]
 *   --offline  football-data를 부르지 않는다(refs 경기 사실은 '확인 불가')
 *   --force    기존 문서의 판정이 새 표본에 없을 때도 덮어쓴다(그 판정은 사라진다)
 * 경기 사실은 football-data `/v4/matches`(브리핑과 같은 창 — 발행일당 1요청, 응답 후 6.5초 간격, 키는 FOOTBALL_DATA_API_KEY —
 * 출력하지 않는다)와 경기 기록 원장(data/matches)에서 만든다. LLM은 부르지 않는다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  type BriefFile,
  type LedgerMatch,
} from "@/lib/schema";
import { nowUtcIso, utcMonth } from "@/lib/time";

import { readBriefFile } from "./lib/brief-file";
import { briefInputWindow } from "./lib/brief-input";
import { readConfigFile } from "./lib/config-files";
import { createLogger } from "./lib/logger";
import { readLedgerMonth } from "./lib/match-ledger";
import { buildNameIndex, type NameIndex } from "./lib/names";
import { newsFilePath, readNewsFile } from "./lib/news-file";
import { datesInRange } from "./lib/observation-doc";
import { resolveResearchDocPath } from "./lib/research-doc";
import {
  createFootballDataClient,
  footballDataDateRange,
  toFinishedResults,
} from "./lib/providers/football-data";
import {
  QUALITY_DOC_REL,
  briefLines,
  checkBriefLine,
  matchFacts,
  renderQualityDoc,
  sampleBriefLines,
  sampleCards,
  type CardItem,
  type MatchFact,
} from "./lib/quality-sample";
import {
  buildTeamIdIndex,
  loadTeamIds,
  type TeamIdIndex,
} from "./lib/team-ids";

const USAGE = [
  "사용법: npm run quality:sample -- --from YYYY-MM-DD --to YYYY-MM-DD [--seed N] [--offline] [--out <경로>] [--force]",
  "  --from/--to  표본 기간(KST 발행일, 양 끝 포함)",
  "  --seed <N>   표본 시드(0 이상 정수, 기본 1) — 같은 시드면 같은 표본",
  "  --offline    football-data를 부르지 않는다(refs 경기 사실 '확인 불가')",
  `  --out <경로> 문서(기본 ${QUALITY_DOC_REL} — docs/research/ 아래 .md만)`,
  "  --force      기존 판정이 새 표본에 없어도 덮어쓴다",
  "  --help, -h   이 도움말",
].join("\n");

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const logger = createLogger({ scope: "ops" });

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "").slice(0, 160)
    : String(error).slice(0, 160);
}

async function main(): Promise<number> {
  let values: {
    from?: string;
    to?: string;
    seed?: string;
    offline?: boolean;
    out?: string;
    force?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: false,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        seed: { type: "string" },
        offline: { type: "boolean", default: false },
        out: { type: "string" },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    console.error(
      `[quality:sample] 인자 오류: ${errorText(error)}\n\n${USAGE}`,
    );
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const { from, to } = values;
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    console.error(
      `[quality:sample] --from·--to(YYYY-MM-DD, from ≤ to)가 필요하다\n\n${USAGE}`,
    );
    return 1;
  }
  const seed = values.seed === undefined ? 1 : Number(values.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    console.error(
      `[quality:sample] --seed는 0 이상 정수 (받은 값: "${values.seed}")`,
    );
    return 1;
  }
  const dates = datesInRange(from, to);

  // data/ — 브리핑·뉴스
  const briefs: BriefFile[] = [];
  const cards: CardItem[] = [];
  for (const date of dates) {
    const b = await readBriefFile(DATA_DIR, date);
    if (b.value) briefs.push(b.value);
    else if (b.error)
      logger.warn("ops.quality.brief-unreadable", { date, error: b.error });
    try {
      const news = await readNewsFile(newsFilePath(DATA_DIR, date));
      for (const card of news?.cards ?? []) cards.push({ date, card });
    } catch (error) {
      logger.warn("ops.quality.news-unreadable", {
        date,
        error: errorText(error),
      });
    }
  }

  // configs — 이름 사전·대회·대응표(읽지 못하면 그 표시만 빠진다)
  const competitions = await readConfigFile(
    ROOT_DIR,
    "competitions.json",
    CompetitionsFileSchema,
  );
  let names: NameIndex | null = null;
  try {
    names = buildNameIndex(
      await readConfigFile(ROOT_DIR, "names.ko.json", NamesKoFileSchema),
      competitions,
    );
  } catch (error) {
    logger.warn("ops.quality.names-unreadable", { error: errorText(error) });
  }
  let teams: TeamIdIndex | null = null;
  try {
    teams = buildTeamIdIndex(await loadTeamIds(ROOT_DIR));
  } catch (error) {
    logger.warn("ops.quality.team-ids-unreadable", { error: errorText(error) });
  }

  const allLines = briefLines(briefs);
  const lines = sampleBriefLines(allLines, seed);
  const pickedCards = sampleCards(cards, seed);

  // 경기 기록 원장 — 표본 줄 날짜의 입력 창(UTC 하루 D-1) 달
  const months = [
    ...new Set(lines.map((l) => utcMonth(briefInputWindow(l.date).start))),
  ];
  let ledger: LedgerMatch[] | null = null;
  for (const month of months) {
    const r = await readLedgerMonth(DATA_DIR, month);
    if (r.error)
      logger.warn("ops.quality.ledger-unreadable", { month, error: r.error });
    if (r.value) ledger = [...(ledger ?? []), ...r.value.matches];
  }

  // football-data — 표본 줄에 경기 근거가 있는 발행일만, 하루 1요청
  const factsByDate = new Map<string, Map<number, MatchFact>>();
  const needDates = [
    ...new Set(
      lines
        .filter((l) => l.refs.some((r) => /^m\d+$/.test(r)))
        .map((l) => l.date),
    ),
  ];
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  let factsNote: string;
  if (values.offline || !apiKey || needDates.length === 0) {
    factsNote =
      needDates.length === 0
        ? "경기 근거 줄 없음"
        : values.offline
          ? "--offline — football-data 조회 안 함(refs 경기 사실 확인 불가)"
          : "FOOTBALL_DATA_API_KEY 없음 — football-data 조회 안 함(refs 경기 사실 확인 불가)";
  } else {
    const client = createFootballDataClient({
      apiKey,
      fetch: (input, init) => fetch(input, init),
    });
    const failed: string[] = [];
    for (const date of needDates) {
      const window = briefInputWindow(date);
      try {
        const raw = await client.getMatches({
          competitions: competitions.map((c) => c.footballDataCode),
          ...footballDataDateRange(window),
        });
        const { results } = toFinishedResults(raw, competitions, window);
        factsByDate.set(
          date,
          matchFacts(results, { competitions, ledger, teams, names }),
        );
      } catch (error) {
        failed.push(date);
        logger.warn("ops.quality.football-data-fail", {
          date,
          error: errorText(error),
        });
      }
    }
    factsNote = `football-data /v4/matches ${needDates.length - failed.length}/${needDates.length}일(요청 ${client.calls}건)${failed.length > 0 ? ` · 실패 ${failed.join(", ")}` : ""} · 득점은 경기 기록 원장(${ledger === null ? "없음 — 정기 운영 전" : `${months.join("·")} ${ledger.length}경기`})`;
  }

  const outTarget = resolveResearchDocPath(
    ROOT_DIR,
    values.out ?? QUALITY_DOC_REL,
  );
  if (!outTarget.ok) {
    console.error(`[quality:sample] ${outTarget.error}`);
    return 1;
  }
  const outPath = outTarget.path;
  let previous: string | null = null;
  try {
    previous = await readFile(outPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const { doc, orphans } = renderQualityDoc(
    {
      from,
      to,
      seed,
      generatedAt: nowUtcIso(),
      lines: lines.map((l) => ({
        ...l,
        check: checkBriefLine(l, factsByDate, names, competitions),
      })),
      lineTotals: {
        all: allLines.length,
        ai: allLines.filter((l) => l.ai).length,
      },
      cards: pickedCards,
      cardTotal: cards.length,
      factsNote,
      names,
    },
    previous,
  );
  if (orphans.length > 0 && !values.force) {
    console.error(
      `[quality:sample] 기존 문서의 판정 ${orphans.length}건이 새 표본에 없다(${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? " …" : ""}) — 같은 기간·시드로 다시 돌리거나 --force(그 판정은 사라진다)`,
    );
    return 1;
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, doc, "utf8");
  logger.info("ops.quality.done", {
    from,
    to,
    seed,
    lines: lines.length,
    lineTotal: allLines.length,
    cards: pickedCards.length,
    cardTotal: cards.length,
    factDates: factsByDate.size,
    file: path.relative(ROOT_DIR, outPath),
  });
  console.log(
    `[quality:sample] 기록: ${path.relative(ROOT_DIR, outPath)} — 브리핑 ${lines.length}줄 · 카드 ${pickedCards.length}장`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`[quality:sample] 실패: ${errorText(error)}`);
    process.exitCode = 1;
  },
);
