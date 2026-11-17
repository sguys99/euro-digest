/**
 * 경기 기록 원장 백필 — Highlightly로 지정 날짜 범위의 경기를 받아 `data/matches`에 `hl-<id>` 항목으로 넣는다 (PRD §15 D80 ④, plan M5-18).
 * API-Football 정지 기간(2026-11-04~)의 공백처럼, 지난 날짜를 다시 받아야 할 때 쓴다(Highlightly는 지난 날짜도 열린다). LLM 호출 없음.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/backfill-matches.ts --from YYYY-MM-DD --to YYYY-MM-DD --max-calls <n>
 *           [--korean-only] [--teams slug,slug] [--no-lineups] [--no-bot-reserve] [--write]
 *   --from·--to       UTC 날짜 범위(양 끝 포함, 62일 이내)
 *   --max-calls <n>   이번 실행 호출 상한(필수 — 재시도·실패 포함). 일일 카운터(runs.json·runs-dev.json apiCalls.highlightly 같은 UTC 날)가
 *                     더 작으면 그쪽(개발 30 — 봇 몫 65를 남긴다)
 *   --korean-only     한국 선수 소속팀 경기만(팀 시즌 목록 — 팀마다 `/matches?season=&homeTeamId=`·`awayTeamId=` 2건, 컵·UEL 포함).
 *                     없으면 날짜 × 6개 대회 목록(날짜마다 6건) — 6개 대회 전 경기
 *   --teams           --korean-only의 팀을 slug로 좁힌다(활성 한국 선수 소속팀 중) — 한도가 모자라 나눠 받을 때
 *   --no-lineups      라인업(포메이션·팀시트)을 받지 않는다 — 한국 선수 출전은 박스스코어로 충분하다(경기당 2건 → 상세·박스스코어)
 *   --no-bot-reserve  개발 상한(30) 대신 일 한도 − 여유 − 오늘 사용까지 쓴다 — 다음 봇 실행(같은 UTC 날 22:10)이 덜 받는다는 것을 알고
 *                     쓸 때만(봇 수집 시간대 직후 등)
 *   --write           원장(data/matches 달 파일 + meta.json)에 쓴다. 없으면 받은 항목·한국 선수 행만 출력한다(받은 호출 수는 기록)
 *
 * 규칙: 06:00~08:00 KST(봇 수집 시간대)에는 실행하지 않는다. 이미 원장에 있는 `hl-` 경기와, 원장의 `af-` 항목과 같은 경기(같은 킥오프 +
 * 같은 팀 — collect-run.ts `crossProviderDuplicate`)는 다시 받지 않는다. --korean-only는 그 날짜의 다른 경기를 넣지 않으므로 원장 메타의
 * 날짜 공백(date-query 등)을 지우지 않는다(`healDateGaps` false — 선수 시작일은 정한다). 이월 목록(hl-pending.json)은 건드리지 않는다.
 * 호출 수는 성공·실패와 상관없이 실행 기록에 남긴다(로컬 = data/runs-dev.json, job collect · status skipped — cost.ts recordRun).
 * 키는 HIGHLIGHTLY_API_KEY 환경변수로만 받고 출력하지 않는다. 응답 본문은 저장·로그하지 않는다.
 * 종료 코드: 0 = 끝까지 받음 · 2 = 멈춤·실패한 경기가 있음(받은 몫은 썼다) · 1 = 실행 실패.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CompetitionsFileSchema, KoreanPlayersFileSchema } from "@/lib/schema";
import { nowUtcIso, utcMonth } from "@/lib/time";

import { isDevQuietHours } from "./lib/api-football-plan";
import { crossProviderDuplicate, resolveRunEnv } from "./lib/collect-run";
import { readConfigFile } from "./lib/config-files";
import { teamIdOfSlug } from "./lib/detail-provider";
import {
  HIGHLIGHTLY_DAILY_LIMIT,
  HIGHLIGHTLY_DAILY_MARGIN,
  buildHlTargetConfig,
  highlightlyCallAllowance,
  highlightlyUsedOn,
  hlDateRange,
} from "./lib/highlightly-plan";
import { runHighlightlyStage } from "./lib/highlightly-stage";
import {
  applyLedger,
  buildLedgerEntries,
  koreanPlayerTargets,
  readLedgerWindow,
} from "./lib/match-ledger";
import { createHighlightlyClient } from "./lib/providers/highlightly";
import { readRuns, runsPathFor } from "./lib/cost";
import { loadTeamIds } from "./lib/team-ids";
import { recordBackfillApiCalls } from "./lib/team-files-io";

const TAG = "[backfill-matches]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

async function readRunsQuiet(env: "prod" | "dev") {
  try {
    return { runs: await readRuns(runsPathFor(env, DATA_DIR)), ok: true };
  } catch {
    return { runs: [], ok: false };
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      to: { type: "string" },
      "max-calls": { type: "string" },
      "korean-only": { type: "boolean", default: false },
      teams: { type: "string" },
      "no-lineups": { type: "boolean", default: false },
      "no-bot-reserve": { type: "boolean", default: false },
      write: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.from || !values.to || !values["max-calls"]) {
    console.error(`${TAG} --from · --to · --max-calls가 필요하다`);
    return 1;
  }
  const dates = hlDateRange(values.from, values.to);
  const maxCalls = Number(values["max-calls"]);
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    console.error(`${TAG} --max-calls는 양의 정수`);
    return 1;
  }
  const startedAt = nowUtcIso();
  if (isDevQuietHours(startedAt)) {
    console.error(`${TAG} 06:00~08:00 KST(봇 수집 시간대)에는 실행하지 않는다`);
    return 1;
  }
  const apiKey = process.env.HIGHLIGHTLY_API_KEY?.trim();
  if (!apiKey) {
    console.error(`${TAG} HIGHLIGHTLY_API_KEY가 없다`);
    return 1;
  }
  const env = resolveRunEnv(process.env);

  const [competitions, koreanPlayers, teamIds] = await Promise.all([
    readConfigFile(ROOT_DIR, "competitions.json", CompetitionsFileSchema),
    readConfigFile(ROOT_DIR, "korean-players.json", KoreanPlayersFileSchema),
    loadTeamIds(ROOT_DIR),
  ]);
  const target = buildHlTargetConfig({ competitions, koreanPlayers, teamIds });
  const players = koreanPlayerTargets(koreanPlayers, teamIds, "highlightly");
  const season = Math.max(...competitions.map((c) => c.season));

  // 팀 시즌 목록 대상(--korean-only) — 활성 한국 선수 소속팀(--teams로 좁힘)
  let teamSeason: { season: number; teamIds: number[] } | undefined;
  if (values["korean-only"]) {
    const activeTeams = [
      ...new Set(koreanPlayers.filter((p) => p.active).map((p) => p.team)),
    ];
    const wanted = values.teams
      ? values.teams
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : activeTeams;
    const unknown = wanted.filter((s) => !activeTeams.includes(s));
    if (unknown.length > 0) {
      console.error(
        `${TAG} 활성 한국 선수 소속팀이 아니다: ${unknown.join(", ")}`,
      );
      return 1;
    }
    const ids = wanted.flatMap((slug) => {
      const id = teamIdOfSlug(teamIds, slug, "highlightly");
      if (id === null)
        console.warn(`${TAG} ${slug} — team-ids hl 없음(건너뜀)`);
      return id === null ? [] : [id];
    });
    teamSeason = { season, teamIds: ids };
  }

  // 호출 허용량 — 우리 쪽 카운터(같은 UTC 날 prod + dev)
  const [prod, dev] = await Promise.all([
    readRunsQuiet("prod"),
    readRunsQuiet("dev"),
  ]);
  const allowance = highlightlyCallAllowance({
    env,
    prodRuns: prod.runs,
    devRuns: dev.runs,
    now: startedAt,
    perRunCap: maxCalls,
    runsUnreadable: !prod.ok || !dev.ok,
  });
  const usedTotal =
    highlightlyUsedOn(prod.runs, startedAt) +
    highlightlyUsedOn(dev.runs, startedAt);
  const remaining = values["no-bot-reserve"]
    ? Math.max(
        0,
        Math.min(
          maxCalls,
          HIGHLIGHTLY_DAILY_LIMIT - HIGHLIGHTLY_DAILY_MARGIN - usedTotal,
        ),
      )
    : allowance.remaining;
  const plannedLists = teamSeason
    ? teamSeason.teamIds.length * 2
    : dates.length * target.leagues.length;
  console.log(
    `${TAG} ${env} · 날짜 ${dates[0]}~${dates.at(-1)}(${dates.length}일) · ${teamSeason ? `한국 선수 소속팀 ${teamSeason.teamIds.length}팀 시즌 목록` : `6개 대회 날짜 목록`} ${plannedLists}건 + 경기마다 상세${values["no-lineups"] ? "" : "·라인업"}(한국 선수 경기 박스스코어) · 오늘(UTC) 사용 ${usedTotal} · 이번 상한 ${remaining}(${values["no-bot-reserve"] ? "봇 몫 남기지 않음" : allowance.limitedBy})`,
  );
  if (remaining <= 0) {
    console.error(`${TAG} 오늘 남은 몫이 없다`);
    return 2;
  }

  const months = [...new Set(dates.map((d) => utcMonth(`${d}T00:00:00.000Z`)))];
  const read = await readLedgerWindow(DATA_DIR, months, "highlightly");
  for (const e of read.errors)
    console.warn(`${TAG} 원장 읽기 실패 ${e.file}: ${e.error}`);

  const client = createHighlightlyClient({
    apiKey,
    fetch: (input, init) => fetch(input, init),
    maxCalls: remaining,
    onRetry: (event) =>
      console.warn(
        `${TAG} 재시도 ${event.retry} ${event.path} — ${event.error.kind} (${event.delayMs}ms 뒤)`,
      ),
  });
  let code = 0;
  try {
    const stage = await runHighlightlyStage({
      client,
      targets: target.targets,
      leagues: target.leagues,
      pending: [],
      known: read.known,
      isDuplicate: crossProviderDuplicate({ previous: read.previous, teamIds }),
      // 백필에는 브리핑 몫이 없다 — 빈 창(모든 경기가 window 계층)
      briefWindow: { start: startedAt, end: startedAt },
      dates,
      now: () => new Date(),
      clock: Date.now,
      briefCutoffAt: null,
      discover: false,
      koreanOnly: values["korean-only"],
      ...(teamSeason ? { teamSeason } : {}),
      skipLineups: values["no-lineups"],
    });
    const kinds = stage.outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.result.kind] = (acc[o.result.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `${TAG} 목록 ${stage.dates.filter((d) => d.ok).length}/${stage.dates.length}일 · 대상 ${stage.counts.targets}(이미 받음 ${stage.counts.known}) · 결과 ${JSON.stringify(kinds)} · 상세 ${stage.details.length} · 멈춤 ${stage.stoppedBy ?? "없음"}${stage.degraded ? ` · plan 제한(${stage.degraded.message})` : ""}`,
    );
    const build = buildLedgerEntries(stage.details, players);
    const slugById = new Map(
      players.tracked.map((p) => [p.apiFootballId, p.slug]),
    );
    for (const e of build.entries) {
      const rows = e.korean
        .map(
          (r) =>
            `${slugById.get(r.player) ?? r.player} ${r.status}${r.minutes !== null ? ` ${r.minutes}분` : ""}${r.goals ? ` ${r.goals}골` : ""}${r.assists ? ` ${r.assists}도움` : ""}`,
        )
        .join(", ");
      console.log(
        `  · ${e.id} ${e.kickoff.slice(0, 16)} ${e.comp ?? e.league} ${e.home.name} ${e.ft.home}-${e.ft.away} ${e.away.name}${e.goalsComplete ? "" : " [득점 불완전]"}${rows ? ` — ${rows}` : ""}`,
      );
    }
    for (const bad of build.invalid)
      console.warn(`  ! ${bad.id} 형식 오류 ${bad.error}`);
    if (values.write) {
      const applied = await applyLedger({
        dataDir: DATA_DIR,
        now: nowUtcIso(),
        read,
        entries: build.entries,
        facts: {
          season,
          dates: stage.dates.map((d) => ({
            date: d.date,
            ok: d.ok,
            ...(d.errorType ? { errorType: d.errorType } : {}),
          })),
          skipped: null,
          dropped: [],
          tracked: players.tracked,
          healDateGaps: !values["korean-only"],
        },
      });
      console.log(
        `${TAG} 원장 ${applied.state} · ${applied.months.map((m) => `${m.month} +${m.added}/~${m.replaced}${m.error ? ` 오류 ${m.error}` : ""}`).join(" · ")} · since 앞 ${applied.beforeSince.length} · 메타 ${applied.metaWritten ? "씀" : "그대로"}${applied.errors.length ? ` · 오류 ${applied.errors.join(" / ")}` : ""}`,
      );
      if (applied.errors.length > 0 || applied.unstored.length > 0) code = 2;
    } else {
      console.log(`${TAG} --write 없음 — 원장에 쓰지 않았다`);
    }
    if (
      stage.stoppedBy !== null ||
      stage.outcomes.some(
        (o) => o.result.kind === "failed" || o.result.kind === "deferred",
      )
    ) {
      code = 2;
    }
  } finally {
    const recorded = await recordBackfillApiCalls({
      env,
      dataDir: DATA_DIR,
      startedAt,
      apiFootballCalls: 0,
      highlightlyCalls: client.calls,
    }).catch((error: unknown) => {
      console.error(`${TAG} 실행 기록 실패: ${errorText(error)}`);
      code = 1;
      return null;
    });
    console.log(
      `${TAG} 호출 ${client.calls}회(재시도 ${client.retries}) · 헤더 일 남은 수 ${client.rate.dayRemaining ?? "?"}/${client.rate.dayLimit ?? "?"}${recorded ? ` · 기록 ${recorded.path}` : ""}`,
    );
  }
  return code;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`${TAG} 실패: ${errorText(error)}`);
    process.exitCode = 1;
  },
);
