/**
 * `npm run build` 후반 단계 — next build(정적 export)로 out/이 생긴 뒤 실행 (CLAUDE.md §5).
 * 순서: Pagefind 인덱싱 → OG 이미지 → RSS → ics. 지금 구현된 것은 RSS(M4-11)뿐이고 나머지는 TODO 안내만 남긴다.
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
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { listNewsDates, loadNewsIssue } from "@/lib/data/news";
import { sitePaths } from "@/lib/paths";
import { shiftDate } from "@/lib/time";

import { createLogger } from "./lib/logger";
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

  todo(
    "build-feeds (npm run build) 나머지 단계",
    "M4-12(ics)·M4-14(Pagefind)·M5-01(OG 이미지)",
    "out/에 .ics·Pagefind 인덱스·OG 이미지 생성",
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
