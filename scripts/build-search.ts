/**
 * `npm run build` 둘째 단계 — next build(정적 export)로 out/이 생긴 뒤 Pagefind 검색 색인을 `out/pagefind/`에 만든다
 * (PRD FR-130·FR-131, plan M4-14, CLAUDE.md §5 — 순서: next build → **Pagefind** → OG·RSS·ics(build-feeds)).
 *
 * 레코드 = 검색 결과 한 줄(src/lib/search/model.ts 머리 주석)
 * - 선수·팀·대회: out/의 HTML 중 `data-pagefind-body`(숨은 검색 레코드 — src/components/search/search-record.tsx)가 있는 페이지만 Pagefind가
 *   읽는다. 레코드가 없는 페이지(홈·뉴스·소개·404 …)는 색인되지 않는다. 기대 수(팀 파일 · 한국 선수 설정 · 대회 설정 = 정적 생성 목록)와
 *   다르면 실패한다 — 레코드가 빠진 채 배포되지 않게.
 * - 뉴스: 카드마다 사용자 정의 레코드(src/lib/data/search.ts `loadNewsSearchRecords` — 삭제 요청을 뺀 뉴스 로더, FR-143).
 * - 언어는 한국어 하나로 묶는다(`forceLanguage: "ko"` — 영문 원제목 카드도 같은 색인에서 찾는다. 페이지 lang은 모두 ko).
 * - Pagefind 기본 UI 파일(pagefind-ui·component-ui·modular-ui·highlight)은 쓰지 않으므로 지운다(검색 섬은 JS API만 — 배포 용량).
 *
 * 브라우저는 `out/pagefind/pagefind.js`를 검색 오버레이를 처음 열 때 동적으로 불러온다(초기 JS 예산 밖 — src/lib/search/pagefind-client.ts).
 * 네트워크·LLM 호출 없음. 실패하면 exit 1 → 빌드 실패(검증·빌드가 실패하면 커밋·배포하지 않는다 — CLAUDE §6.1).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { listKoreanPlayerSlugs } from "@/lib/data/player-page";
import { loadNewsSearchRecords } from "@/lib/data/search";
import { listTeamSlugs } from "@/lib/data/teams";

import { createLogger } from "./lib/logger";
import {
  indexedRecordCount,
  UNUSED_PAGEFIND_PREFIXES,
} from "./lib/search-index";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUT_DIR = path.join(ROOT_DIR, "out");
const PAGEFIND_DIR = path.join(OUT_DIR, "pagefind");

/** 디렉터리 파일 수·바이트 합 */
function dirSize(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = dirSize(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

function fail(scope: string, errors: readonly string[]): never {
  throw new Error(`${scope}: ${errors.slice(0, 5).join(" / ")}`);
}

async function main(): Promise<number> {
  const log = createLogger({ scope: "build-search" });
  if (!existsSync(OUT_DIR)) {
    log.error("build.search.fail", {
      errorType: "no-out-dir",
      message: "out/이 없음 — next build(정적 export) 뒤에 실행",
    });
    return 1;
  }
  const started = Date.now();
  const expectedPages =
    listTeamSlugs().length +
    listKoreanPlayerSlugs().length +
    loadCompetitionsConfig().length;

  // pagefind 패키지는 ESM 전용(exports에 import 조건만) — 이 스크립트는 CJS로 돌므로 동적 import
  const pagefind = await import("pagefind");
  const { index, errors } = await pagefind.createIndex({
    forceLanguage: "ko",
  });
  if (!index || errors.length > 0) fail("createIndex", errors);

  const pages = await index.addDirectory({ path: OUT_DIR });
  if (pages.errors.length > 0) fail("addDirectory", pages.errors);
  const news = loadNewsSearchRecords();
  for (const record of news) {
    const added = await index.addCustomRecord(record);
    if (added.errors.length > 0)
      fail(`addCustomRecord ${record.url}`, added.errors);
  }

  rmSync(PAGEFIND_DIR, { recursive: true, force: true });
  const written = await index.writeFiles({ outputPath: PAGEFIND_DIR });
  if (written.errors.length > 0) fail("writeFiles", written.errors);
  await pagefind.close();

  for (const name of readdirSync(PAGEFIND_DIR)) {
    if (UNUSED_PAGEFIND_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      rmSync(path.join(PAGEFIND_DIR, name), { force: true });
    }
  }
  // 색인된 레코드 수 = 레코드가 있는 페이지 + 뉴스 카드(addDirectory의 page_count는 읽은 HTML 전부라 쓰지 않는다)
  const indexed = indexedRecordCount(
    readFileSync(path.join(PAGEFIND_DIR, "pagefind-entry.json"), "utf8"),
  );
  if (indexed !== expectedPages + news.length) {
    log.error("build.search.fail", {
      errorType: "record-count",
      indexed,
      expected: expectedPages + news.length,
      message:
        "색인 레코드 수가 정적 생성 목록(팀 + 한국 선수 + 대회) + 뉴스 카드와 다름 — 검색 레코드가 빠진 페이지가 있거나 언어가 갈렸다",
    });
    return 1;
  }
  const size = dirSize(PAGEFIND_DIR);
  log.info("build.search.done", {
    pages: expectedPages,
    htmlFiles: pages.page_count,
    news: news.length,
    files: size.files,
    kb: Math.round((size.bytes / 1024) * 10) / 10,
    elapsedMs: Date.now() - started,
  });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[build-search] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
