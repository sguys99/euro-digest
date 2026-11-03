/**
 * `npm run new-season:check` — 시즌 전환 준비 점검 (M5-11, FR-156 · `/new-season`). **읽기 전용**: configs·코드 표·data를 읽기만
 * 하고 아무 파일도 쓰지 않는다. 네트워크·LLM 호출 없음(API-Football 일일 한도와 무관 — CLAUDE §6.4).
 *
 * 사용법: npm run new-season:check -- [--season <YYYY|YYYY-YY>] [--date <YYYY-MM-DD>]
 *   --season   대상 시즌(시작 연도, 예: 2027 또는 2027-28). 없으면 지금 설정 시즌(competitions.json) — 오늘 상태 정합성 점검
 *   --date     기준일(KST). 없으면 오늘(KST)
 * 종료 코드: 0 = 준비됨(오류 0) · 2 = 오류 있음 · 1 = 실행 실패(설정 파일 읽기·스키마 실패 — `npm run validate`로 위치 확인)
 *
 * 판정은 scripts/lib/new-season-check.ts(순수 함수), 이 파일은 읽기·출력·종료 코드만 맡는다.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  BigmatchRulesFileSchema,
  CompetitionFileSchema,
  CompetitionsFileSchema,
  FormationsFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerMetaSchema,
  NamesKoFileSchema,
  NationalTeamFileSchema,
  TeamColorsFileSchema,
  TeamIdsFileSchema,
  TransferWindowsFileSchema,
  type CompId,
  type MatchLedgerMeta,
} from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import { readConfigFile } from "./lib/config-files";
import { KNOWN_PLAYER_TEAMS } from "./lib/names";
import {
  checkNewSeason,
  formatNewSeasonReport,
  parseSeasonArg,
  type NewSeasonInput,
} from "./lib/new-season-check";
import { BIG_CLUBS } from "./lib/news-keywords";
import {
  TEAM_LEAGUES,
  TEAM_LEAGUES_SEASON,
  UCL_TEAMS,
} from "./lib/team-leagues";

const TAG = "[new-season-check]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const USAGE =
  "사용법: npm run new-season:check -- [--season <YYYY|YYYY-YY>] [--date <YYYY-MM-DD>]";

/** 폴더 안 `<slug>.<ext>` 파일의 slug(오름차순). 폴더가 없으면 빈 배열 */
function slugsIn(dir: string, ext: string): string[] {
  const abs = path.join(ROOT_DIR, dir);
  if (!existsSync(abs)) return [];
  const re = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)\\.${ext}$`);
  return readdirSync(abs)
    .map((f) => re.exec(f)?.[1])
    .filter((s): s is string => s !== undefined)
    .sort();
}

/** JSON 파일을 스키마로 — 없거나 깨졌으면 null(점검은 그 사실을 보고한다) */
function readData<T>(
  rel: string,
  parse: (v: unknown) => { success: true; data: T } | { success: false },
): T | null {
  const abs = path.join(ROOT_DIR, rel);
  if (!existsSync(abs)) return null;
  try {
    const parsed = parse(JSON.parse(readFileSync(abs, "utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // 아래에서 보고
  }
  console.error(
    `${TAG} ${rel} 읽기·스키마 실패 — npm run validate로 확인할 것`,
  );
  return null;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      season: { type: "string" },
      date: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const today = values.date ?? kstDate(nowUtcIso());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    console.error(`${TAG} --date는 YYYY-MM-DD\n${USAGE}`);
    return 1;
  }

  const [
    competitions,
    teamIds,
    teamColors,
    names,
    koreanPlayers,
    transferWindows,
    nationalTeam,
    bigmatch,
    formations,
  ] = await Promise.all([
    readConfigFile(ROOT_DIR, "competitions.json", CompetitionsFileSchema),
    readConfigFile(ROOT_DIR, "team-ids.json", TeamIdsFileSchema),
    readConfigFile(ROOT_DIR, "team-colors.json", TeamColorsFileSchema),
    readConfigFile(ROOT_DIR, "names.ko.json", NamesKoFileSchema),
    readConfigFile(ROOT_DIR, "korean-players.json", KoreanPlayersFileSchema),
    readConfigFile(
      ROOT_DIR,
      "transfer-windows.json",
      TransferWindowsFileSchema,
    ),
    readConfigFile(ROOT_DIR, "national-team.json", NationalTeamFileSchema),
    readConfigFile(ROOT_DIR, "bigmatch-rules.json", BigmatchRulesFileSchema),
    readConfigFile(ROOT_DIR, "formations.json", FormationsFileSchema),
  ]);

  let target: number | null =
    competitions.length > 0
      ? Math.max(...competitions.map((c) => c.season))
      : null;
  if (values.season !== undefined) target = parseSeasonArg(values.season);
  if (target === null) {
    console.error(
      `${TAG} 대상 시즌을 정할 수 없음(--season 형식 또는 competitions.json)\n${USAGE}`,
    );
    return 1;
  }

  const competitionFiles: Array<{ comp: CompId; season: number }> = [];
  for (const slug of slugsIn("data/competitions", "json")) {
    const file = readData(`data/competitions/${slug}.json`, (v) =>
      CompetitionFileSchema.safeParse(v),
    );
    if (file) competitionFiles.push({ comp: file.comp, season: file.season });
  }
  const ledgerMeta: MatchLedgerMeta | null = readData(
    "data/matches/meta.json",
    (v) => MatchLedgerMetaSchema.safeParse(v),
  );

  const input: NewSeasonInput = {
    competitions,
    teamIds,
    teamColors,
    names,
    koreanPlayers,
    transferWindows,
    nationalTeam,
    bigmatch,
    formations,
    table: {
      season: TEAM_LEAGUES_SEASON,
      leagues: TEAM_LEAGUES,
      ucl: UCL_TEAMS,
    },
    knownPlayerTeams: KNOWN_PLAYER_TEAMS,
    bigClubs: BIG_CLUBS.map((c) => c.slug),
    ledgerMeta,
    competitionFiles,
    teamFiles: slugsIn("data/teams", "json"),
    ogTeamImages: slugsIn("public/og/teams", "png"),
  };
  const report = checkNewSeason(input, { target, today });
  for (const line of formatNewSeasonReport(report, TAG)) console.log(line);
  return report.ready ? 0 : 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `${TAG} 실행 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  },
);
