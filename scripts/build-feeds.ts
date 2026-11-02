/**
 * `npm run build` 후반 단계 — next build(정적 export)로 out/이 생긴 뒤 실행 (CLAUDE.md §5).
 * 순서: Pagefind 인덱싱(앞 단계 scripts/build-search.ts — M4-14) → OG 이미지 → RSS → ics. 이 파일에 구현된 것은 RSS(M4-11)·ics(M4-12)이고
 * OG 이미지(M5-01)는 TODO 안내만 남긴다.
 *
 * RSS (PRD FR-122, plan M4-11): `out/rss.xml`(전체 상위 30) · `out/rss/{comp}.xml`(configs/competitions.json 대회마다) ·
 * `out/rss/korean.xml`(한국 선수 관련 카드). out/은 basePath 아래에 그대로 걸리므로(GitHub Pages) `out/rss.xml`이
 * `https://sguys99.github.io/euro-digest/rss.xml`이 된다. 절대 URL은 BASE_PATH·SITE_URL 환경변수(src/lib/paths.ts `sitePaths`)로 만든다.
 *
 * - 뉴스 호는 **삭제 요청을 뺀 로더**(src/lib/data/news.ts `loadNewsIssue`)로만 읽는다 — data/news를 직접 읽지 않는다
 *   (FR-143, tests/takedown-build-guard.test.ts). 최신 호 기준 7일(RSS_WINDOW_DAYS) 안의 호만 읽는다.
 * - 깨진 호·삭제 요청 등록 파일·대회 설정은 로더가 던진다 → 빌드 실패(검증·빌드가 실패하면 커밋·배포하지 않는다 — CLAUDE §6.1).
 * - 선별·XML은 순수 함수(scripts/lib/site-rss.ts). 이 파일은 읽기·쓰기·로그만 한다. 네트워크·LLM 호출 없음.
 * - 뉴스 호가 하나도 없으면(CI 빈 data/news) 항목 없는 유효한 피드를 만든다(구독 링크가 404가 되지 않게).
 *
 * ics (PRD FR-59·FR-83·FR-115·FR-123, plan M4-12): `out/calendar/{team}.ics`(팀 페이지가 있는 팀마다) · `out/calendar/korean.ics`
 * (한국 선수 소속팀 묶음) · `out/calendar/match/{id}.ics`(예정 경기마다). 규칙은 scripts/lib/site-ics.ts 머리 주석. 대회 데이터·팀·한국 선수
 * 현황·대표팀 설정은 화면과 같은 로더로 읽는다(깨졌으면 던짐 → 빌드 실패). 이전 빌드의 경기 파일이 남지 않게 `out/calendar/`를 비우고 쓴다.
 *
 * `/my` 자료 (PRD FR-111, plan M4-08): `out/my/data/teams/{team}.json`(팀 페이지가 있는 팀마다) · `out/my/data/players/{slug}.json`(등록 선수마다) —
 * 다음 경기 · 최근 결과(규칙 scripts/lib/follow-data.ts, 형식 src/lib/my-view.ts). `/my` 섬이 팔로우한 것만 지연 fetch한다. 선수는 선수 상세와 같은
 * 로더(`loadPlayerPage`)의 화면 모델을 쓴다. 이전 빌드 파일이 남지 않게 `out/my/data/`를 비우고 쓴다.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { NAMES_KO_PATH } from "@/lib/data/names";
import { loadKoreanPlayersData, nameLookup } from "@/lib/data/korean-players";
import { loadNationalTeamConfig } from "@/lib/data/national-team";
import { listNewsDates, loadNewsIssue } from "@/lib/data/news";
import { loadPlayerPage } from "@/lib/data/player-page";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { listTeamSlugs } from "@/lib/data/teams";
import { sitePaths } from "@/lib/paths";
import { shiftDate } from "@/lib/time";

import { createLogger } from "./lib/logger";
import { buildFollowData, type FollowDataFile } from "./lib/follow-data";
import { buildSiteCalendars, type CalendarFile } from "./lib/site-ics";
import {
  RSS_WINDOW_DAYS,
  buildSiteFeeds,
  type FeedIssue,
} from "./lib/site-rss";
import { todo } from "./lib/todo";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUT_DIR = path.join(ROOT_DIR, "out");

/** 최신 호 기준 7일 창 안의 호(삭제 요청 제외 — 로더) */
function loadRecentIssues(): FeedIssue[] {
  const dates = listNewsDates();
  const latest = dates.at(-1);
  if (latest === undefined) return [];
  const from = shiftDate(latest, -(RSS_WINDOW_DAYS - 1));
  return dates
    .filter((date) => date >= from)
    .flatMap((date) => {
      const issue = loadNewsIssue(date);
      return issue ? [issue] : [];
    });
}

/** 사이트 경로(`/rss/epl.xml`) → out/ 안 파일 경로. out/ 밖으로 벗어나는 경로는 막는다 */
function outFile(sitePath: string): string {
  const file = path.resolve(OUT_DIR, `.${sitePath}`);
  if (!file.startsWith(`${OUT_DIR}${path.sep}`)) {
    throw new Error(`out/ 밖 경로: ${sitePath}`);
  }
  return file;
}

/** 캘린더 입력을 로더로 읽어 순수 함수에 넘긴다 */
function buildCalendars(): CalendarFile[] {
  return buildSiteCalendars({
    competitions: loadCompetitionsConfig(),
    data: loadAllCompetitionData(),
    teams: listTeamSlugs(),
    team: loadTeamLookup(),
    teamNameKo: nameLookup("team", NAMES_KO_PATH),
    competitionNameKo: nameLookup("competition", NAMES_KO_PATH),
    players: loadKoreanPlayers(),
    korean: loadKoreanPlayersData(),
    national: loadNationalTeamConfig()?.matches ?? [],
    paths: sitePaths(),
  });
}

/** `/my` 자료 입력을 로더로 읽어 순수 함수에 넘긴다(기준 시각 = 빌드 시각) */
function buildMyData(now: Date): FollowDataFile[] {
  return buildFollowData({
    teams: listTeamSlugs(),
    matchLists: loadAllCompetitionData().map((c) => c.matches),
    team: loadTeamLookup(),
    competitions: loadCompetitionsConfig().map((c) => ({
      id: c.id,
      short: c.shortKo,
      name: c.nameKo,
    })),
    players: loadKoreanPlayers().flatMap((p) => {
      const page = loadPlayerPage(p.slug, now);
      return page ? [page.view] : [];
    }),
    nowMs: now.getTime(),
  });
}

function main(): number {
  const log = createLogger({ scope: "build-feeds" });
  if (!existsSync(OUT_DIR)) {
    log.error("build.rss.fail", {
      errorType: "no-out-dir",
      message: "out/이 없음 — next build(정적 export) 뒤에 실행",
    });
    return 1;
  }
  const started = Date.now();
  const issues = loadRecentIssues();
  const feeds = buildSiteFeeds({
    issues,
    competitions: loadCompetitionsConfig(),
    paths: sitePaths(),
  });
  for (const feed of feeds) {
    const file = outFile(feed.path);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, feed.xml, "utf8");
    log.info("build.rss.write", { path: feed.path, items: feed.items });
  }
  log.info("build.rss.done", {
    count: feeds.length,
    issues: issues.length,
    elapsedMs: Date.now() - started,
  });

  const icsStarted = Date.now();
  const calendars = buildCalendars();
  rmSync(outFile("/calendar/"), { recursive: true, force: true });
  const counts = { team: 0, korean: 0, match: 0 };
  let events = 0;
  for (const calendar of calendars) {
    const file = outFile(calendar.path);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, calendar.ics, "utf8");
    counts[calendar.feed.kind] += 1;
    if (calendar.feed.kind === "team") events += calendar.events;
    if (calendar.feed.kind === "korean") {
      log.info("build.ics.write", {
        path: calendar.path,
        events: calendar.events,
      });
    }
  }
  log.info("build.ics.done", {
    count: calendars.length,
    teams: counts.team,
    korean: counts.korean,
    matches: counts.match,
    teamEvents: events,
    elapsedMs: Date.now() - icsStarted,
  });

  const myStarted = Date.now();
  const myFiles = buildMyData(new Date());
  rmSync(outFile("/my/data/"), { recursive: true, force: true });
  let myBytes = 0;
  for (const entry of myFiles) {
    const file = outFile(entry.path);
    const json = JSON.stringify(entry.data);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, json, "utf8");
    myBytes += Buffer.byteLength(json);
  }
  log.info("build.my.done", {
    count: myFiles.length,
    teams: myFiles.filter((f) => f.data.kind === "teams").length,
    players: myFiles.filter((f) => f.data.kind === "players").length,
    bytes: myBytes,
    elapsedMs: Date.now() - myStarted,
  });

  todo(
    "build-feeds (npm run build) 나머지 단계",
    "M5-01(OG 이미지)",
    "out/에 OG 이미지 생성",
  );
  return 0;
}

try {
  process.exit(main());
} catch (error: unknown) {
  console.error(
    `[build-feeds] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
