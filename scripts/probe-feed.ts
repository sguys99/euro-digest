/**
 * 피드 러너 재확인 진입점 (plan M1-41 — ESPN 러너 재확인용 일회성, 2026-10-29 사용자 결정. 확인 뒤 워크플로와 함께 정리).
 *
 * 사용법: npx tsx scripts/probe-feed.ts --source <소스 id>
 *   configs/sources.json(zod 로더 scripts/lib/sources.ts `loadSources`)에서 소스를 찾아 수집기와 같은 받기 경로(scripts/lib/rss.ts
 *   `fetchFeed` + 수집 정책 기본값)·같은 User-Agent(`feedUserAgent(CONTACT_EMAIL)`)로 **요청 1회**만 보내고, HTTP 상태·미디어 타입·
 *   바이트 수·본문 형태·파싱 성공 여부·item 수·최신 pubDate·판정(ok·blocked·error)을 출력한다. 규칙은 scripts/lib/probe-feed.ts.
 *
 * 환경변수(둘 다 비밀값 아님 — 비밀값은 읽지 않는다):
 *   CONTACT_EMAIL         User-Agent 연락처(collect.yml과 같은 값을 워크플로가 넘긴다 — 없으면 저장소 주소만)
 *   GITHUB_STEP_SUMMARY   있으면 같은 내용을 마크다운 표로 덧붙인다(Actions 기본 제공)
 * 제목·본문·전체 응답은 출력하지 않는다(CLAUDE.md §9.1). configs·data는 쓰지 않는다.
 * 종료 코드: 판정과 무관하게 0(진단 도구). 인자 오류·설정 오류(소스 없음·terms_checked 아님·설정 파일 오류)·예상 밖 예외는 1.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger } from "./lib/logger";
import {
  PROBE_FEED_USAGE,
  parseProbeFeedArgs,
  probeFeed,
  probeLogFields,
  renderProbeMarkdown,
  renderProbeText,
  resolveProbeSource,
} from "./lib/probe-feed";
import { feedUserAgent } from "./lib/rss";
import { loadSources } from "./lib/sources";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const logger = createLogger({ scope: "ops" });

async function main(): Promise<number> {
  const parsed = parseProbeFeedArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(
      `[probe-feed] 인자 오류: ${parsed.error}\n\n${PROBE_FEED_USAGE}`,
    );
    return 1;
  }
  if (parsed.value.help) {
    console.log(PROBE_FEED_USAGE);
    return 0;
  }

  let sources: Awaited<ReturnType<typeof loadSources>>;
  try {
    sources = await loadSources(ROOT_DIR);
  } catch (error) {
    console.error(
      `[probe-feed] 설정 오류: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  const resolved = resolveProbeSource(sources, parsed.value.source);
  if (!resolved.ok) {
    console.error(`[probe-feed] 설정 오류: ${resolved.error}`);
    return 1;
  }

  const observation = await probeFeed(resolved.value, {
    fetch: (input, init) => fetch(input, init),
    userAgent: feedUserAgent(process.env.CONTACT_EMAIL),
    now: () => new Date(),
  });
  logger.info("ops.feed-probe.done", probeLogFields(observation));
  console.log(renderProbeText(observation));

  const summaryFile = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryFile) {
    try {
      appendFileSync(summaryFile, renderProbeMarkdown(observation), "utf8");
    } catch (error) {
      // 요약 기록 실패는 진단 결과(콘솔 출력)를 뒤집지 않는다
      logger.warn("ops.feed-probe.summary-fail", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `[probe-feed] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  },
);
