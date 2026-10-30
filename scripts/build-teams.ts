/**
 * 팀 파일 생성 — 단독 실행 진입점 (M2-06·M2-07, PRD FR-50·FR-54·FR-55, §15 D63). 정기 실행 통합(collect.yml)은 M2-09.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-teams.ts [--dry] [--plan <n>] [--backfill <n>]
 *   (인자 없음)      configs + 경기 원장(data/matches) + 대회 파일(data/competitions) + 이전 팀 파일 → data/teams/<slug>.json 111개
 *                    (내용이 같으면 다시 쓰지 않는다). API 호출 없음
 *   --dry            파일을 쓰지 않고 요약만 출력한다
 *   --plan <n>       팀시트 백필 계획(경기 n개까지)만 출력한다 — API 호출 없음
 *   --backfill <n>   팀시트 백필: 원장 경기 id로 API-Football `/fixtures?id=`를 n건까지 다시 받아(id 단건은 날짜 창 밖도 열린다) 주
 *                    포메이션 경기의 선발·교체 명단을 채운다. 먼저 `/status`로 오늘(UTC) 쓴 요청 수를 확인하고 봇 몫(--reserve, 기본
 *                    60)을 남길 수 없으면 줄이거나 멈춘다. 06:00~08:00 KST(봇 수집 시간대)에는 실행하지 않는다. 동시 1개·응답 후
 *                    6.5초 간격(클라이언트 정책). 상한 BACKFILL_MAX(40 — 개발 호출 하루 50건 이내, CLAUDE §6.4)
 *   --reserve <n>    백필 때 남겨 둘 오늘 일 한도(기본 60 — 다음 봇 수집 계획 상한)
 *
 * 키는 API_FOOTBALL_KEY 환경변수로만 받고 출력하지 않는다. 응답 본문은 저장·로그하지 않는다(라인업에서 이름·등번호·포지션·grid만
 * 팀 파일에 남긴다 — D63 ②). 종료 코드: 설정이 어긋나 만들지 못한 팀이 있으면 1.
 */
import {
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  CompetitionsFileSchema,
  FormationsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TeamColorsFileSchema,
  TeamSchema,
  type CompId,
  type CompetitionFile,
  type FormationsFile,
  type LedgerMatch,
  type Team,
} from "@/lib/schema";
import { kstParts, nowUtcIso } from "@/lib/time";

import { readCompetitionFile } from "./lib/competition-file";
import { readConfigFile } from "./lib/config-files";
import { createLogger } from "./lib/logger";
import type { MatchDetail } from "./lib/match-data";
import { readLedgerMeta, readLedgerMonth } from "./lib/match-ledger";
import {
  ApiFootballError,
  createApiFootballClient,
  toMatchDetail,
} from "./lib/providers/api-football";
import {
  afToSlugOf,
  buildTeamFiles,
  koreanByAfIdOf,
  lineupBackfillPriority,
  planLineupBackfill,
  serializeTeamFile,
  teamSheetsFromDetails,
  type TeamFilesInput,
} from "./lib/team-files";
import { loadTeamIds } from "./lib/team-ids";
import { allTeamSlugs } from "./lib/team-leagues";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");
const TEAMS_DIR = path.join(DATA_DIR, "teams");

/** 백필 한 번의 상한 — 개발 호출 하루 50건 이내(CLAUDE §6.4), `/status` 1건 포함 여유 */
const BACKFILL_MAX = 40;
/** 기본 봇 몫 — 다음 봇 수집 일일 계획 상한(D27 ②) */
const DEFAULT_RESERVE = 60;

const USAGE = [
  "사용법: node --env-file-if-exists=.env.local --import tsx scripts/build-teams.ts [--dry] [--plan <n>] [--backfill <n>] [--reserve <n>]",
  "  --dry            data/teams/에 쓰지 않고 요약만 출력",
  "  --plan <n>       팀시트 백필 계획(경기 n개)만 출력 — API 호출 없음",
  `  --backfill <n>   API-Football 경기 단건 n건(≤ ${BACKFILL_MAX})으로 팀시트 백필 — /status 확인 후, 06:00~08:00 KST 금지`,
  `  --reserve <n>    백필 때 남길 오늘 일 한도(기본 ${DEFAULT_RESERVE})`,
  "  --help, -h       이 도움말",
].join("\n");

const COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

function parseCount(raw: string | undefined, name: string): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name}는 0 이상의 정수`);
  }
  return n;
}

async function readLedger(): Promise<{
  matches: LedgerMatch[];
  season: number | null;
}> {
  const meta = await readLedgerMeta(DATA_DIR);
  if (meta.error) throw new Error(`data/matches/meta.json ${meta.error}`);
  let names: string[] = [];
  try {
    names = await readdir(path.join(DATA_DIR, "matches"));
  } catch {
    names = [];
  }
  const matches: LedgerMatch[] = [];
  for (const name of names.sort()) {
    const m = /^(\d{4}-\d{2})\.json$/.exec(name);
    if (!m) continue;
    const read = await readLedgerMonth(DATA_DIR, m[1]!);
    if (read.error) throw new Error(`data/matches/${name} ${read.error}`);
    if (read.value) matches.push(...read.value.matches);
  }
  return { matches, season: meta.value?.season ?? null };
}

async function readPreviousTeams(
  warn: (event: string, fields: Record<string, unknown>) => void,
): Promise<Map<string, Team>> {
  const previous = new Map<string, Team>();
  let names: string[] = [];
  try {
    names = await readdir(TEAMS_DIR);
  } catch {
    return previous;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = TeamSchema.safeParse(
        JSON.parse(await readFile(path.join(TEAMS_DIR, name), "utf8")),
      );
      if (parsed.success) previous.set(parsed.data.slug, parsed.data);
      else warn("teams.previous-invalid", { file: name });
    } catch {
      warn("teams.previous-invalid", { file: name });
    }
  }
  return previous;
}

async function readFormations(): Promise<FormationsFile> {
  try {
    return await readConfigFile(
      ROOT_DIR,
      "formations.json",
      FormationsFileSchema,
    );
  } catch (error) {
    // 파일이 없으면 수동 보조 없음 — 형식 오류는 그대로 멈춘다
    if (error instanceof Error && /ENOENT|no such file/i.test(error.message)) {
      return {};
    }
    throw error;
  }
}

async function writeIfChanged(team: Team): Promise<boolean> {
  const target = path.join(TEAMS_DIR, `${team.slug}.json`);
  const text = serializeTeamFile(team);
  try {
    if ((await readFile(target, "utf8")) === text) return false;
  } catch {
    // 없으면 새로 쓴다
  }
  await mkdir(TEAMS_DIR, { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return true;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dry: { type: "boolean", default: false },
      plan: { type: "string" },
      backfill: { type: "string" },
      reserve: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const log = createLogger({ scope: "build-teams" });
  const planLimit = parseCount(values.plan, "plan");
  const backfill = parseCount(values.backfill, "backfill") ?? 0;
  const reserve = parseCount(values.reserve, "reserve") ?? DEFAULT_RESERVE;
  if (backfill > BACKFILL_MAX) {
    console.error(`--backfill은 ${BACKFILL_MAX} 이하\n${USAGE}`);
    return 2;
  }

  const [teamIds, names, colors, koreanPlayers, competitionsCfg, formations] =
    await Promise.all([
      loadTeamIds(ROOT_DIR),
      readConfigFile(ROOT_DIR, "names.ko.json", NamesKoFileSchema),
      readConfigFile(ROOT_DIR, "team-colors.json", TeamColorsFileSchema),
      readConfigFile(ROOT_DIR, "korean-players.json", KoreanPlayersFileSchema),
      readConfigFile(ROOT_DIR, "competitions.json", CompetitionsFileSchema),
      readFormations(),
    ]);
  const ledger = await readLedger();
  const competitions: Partial<Record<CompId, CompetitionFile>> = {};
  for (const comp of COMP_IDS) {
    const read = await readCompetitionFile(DATA_DIR, comp);
    if (read.status === "ok") competitions[comp] = read.file;
    else log.warn("teams.competition-missing", { comp, status: read.status });
  }
  const previous = await readPreviousTeams((e, f) => log.warn(e, f));
  const slugs = allTeamSlugs();

  const baseInput: TeamFilesInput = {
    slugs,
    teamIds,
    names,
    colors,
    koreanPlayers,
    formations,
    ledger: ledger.matches,
    season: ledger.season,
    competitions,
    previous,
    sheets: [],
  };
  const first = buildTeamFiles(baseInput);
  const priority = lineupBackfillPriority({
    slugs,
    koreanPlayers,
    competitions,
  });

  if (planLimit !== null) {
    const plan = planLineupBackfill({
      teams: first.teams,
      uses: first.uses,
      priority,
      limit: planLimit,
    });
    for (const t of plan.targets) {
      console.log(`af-${t.matchId}\t${t.teams.join(", ")}`);
    }
    log.info("teams.backfill.plan", {
      matches: plan.targets.length,
      teams: plan.targets.reduce((n, t) => n + t.teams.length, 0),
      pending: plan.pending.length,
    });
    return 0;
  }

  const details: MatchDetail[] = [];
  let apiCalls = 0;
  if (backfill > 0) {
    const hour = kstParts(nowUtcIso()).hour;
    if (hour >= 6 && hour < 8) {
      log.error("teams.backfill.skip", { reason: "bot-window-06-08-kst" });
      return 1;
    }
    const apiKey = process.env.API_FOOTBALL_KEY?.trim();
    if (!apiKey) {
      log.warn("teams.backfill.skip", { reason: "no-api-key" });
    } else {
      const client = createApiFootballClient({
        apiKey,
        fetch,
        maxCalls: backfill + 1, // /status 1건 포함
        onRetry: (e) =>
          log.warn("teams.backfill.retry", {
            path: e.path,
            retry: e.retry,
            errorType: e.error.kind,
            status: e.error.status ?? null,
          }),
      });
      const status = await client.getStatus();
      const remaining =
        status.current !== null && status.limitDay !== null
          ? status.limitDay - status.current
          : null;
      const allowed =
        remaining === null
          ? 0
          : Math.max(0, Math.min(backfill, remaining - reserve));
      log.info("teams.backfill.status", {
        current: status.current,
        limitDay: status.limitDay,
        reserve,
        allowed,
      });
      const plan = planLineupBackfill({
        teams: first.teams,
        uses: first.uses,
        priority,
        limit: allowed,
      });
      const compByLeague = new Map<number, CompId>(
        competitionsCfg.map((c) => [c.apiFootballLeagueId, c.id]),
      );
      for (const target of plan.targets) {
        try {
          const raw = await client.getFixtureById(target.matchId);
          const converted =
            raw === null || raw === undefined
              ? null
              : toMatchDetail(raw, { compByLeague, fetchedAt: nowUtcIso() });
          if (converted?.kind === "finished") details.push(converted.detail);
          log.info("teams.backfill.fixture", {
            match: target.matchId,
            teams: target.teams,
            result: converted?.kind ?? "missing",
          });
        } catch (error) {
          const kind =
            error instanceof ApiFootballError ? error.kind : "unexpected";
          log.warn("teams.backfill.error", {
            match: target.matchId,
            errorType: kind,
          });
          // 한도·키·플랜·상한 오류는 남은 요청을 보내지 않는다
          if (
            error instanceof ApiFootballError &&
            ["plan", "quota", "auth", "cap", "budget", "rate"].includes(
              error.kind,
            )
          ) {
            break;
          }
        }
      }
      apiCalls = client.calls;
      log.info("teams.backfill.summary", {
        planned: plan.targets.length,
        fetched: details.length,
        pending: plan.pending.length,
        apiCalls,
      });
    }
  }

  const extract = teamSheetsFromDetails(details, {
    afToSlug: afToSlugOf(teamIds),
    koreanByAfId: koreanByAfIdOf(koreanPlayers),
  });
  for (const s of extract.skipped) log.info("teams.sheet.skip", s);
  const result =
    details.length > 0
      ? buildTeamFiles({ ...baseInput, sheets: extract.sheets })
      : first;
  for (const p of result.problems) log.error("teams.problem", { problem: p });

  let written = 0;
  if (!values.dry) {
    for (const team of result.teams) {
      if (await writeIfChanged(team)) written += 1;
    }
  }
  const stale = [...previous.keys()].filter((s) => !slugs.includes(s));
  if (stale.length > 0) log.warn("teams.stale-files", { slugs: stale });
  log.info("teams.summary", {
    ...result.stats,
    sheets: extract.sheets.length,
    written,
    dry: values.dry,
    apiCalls,
  });
  return result.problems.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[build-teams] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
