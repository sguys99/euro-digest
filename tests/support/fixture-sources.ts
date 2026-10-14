/**
 * 테스트용 소스 목록 (네트워크 없음) — fixtures/rss/ 피드(M0-33 스냅숏 14개)를 수집 대상으로 켠 configs/sources.json.
 *
 * 실제 configs의 `enabled`는 운영 사정으로 바뀐다(2026-10-14 espn-soccer — GitHub Actions 러너에만 HTTP 202·0바이트
 * 응답, 사용자 결정으로 비활성). fixture 피드로 병렬·예산·수집 창·미래 시각 가드·건강도 같은 **동작**을 검사하는 테스트는
 * 실제 enabled 값에 기대지 않고 이 목록을 `loadSources`로 주입한다. 바꾸는 것은 fixture가 있는 소스의 `enabled`뿐이고
 * (테스트 안에서만), URL·언어·tz·tier·대회와 그 밖의 소스는 실제 configs 그대로다.
 *
 * 현재 configs 스냅숏(수집 대상 개수·제외 사유)은 tests/sources.test.ts·tests/fixtures-rss.test.ts가 실제 값으로 검사한다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { SourcesFileSchema, type Source } from "@/lib/schema";

const SOURCES_PATH = fileURLToPath(
  new URL("../../configs/sources.json", import.meta.url),
);
const RSS_INDEX_PATH = fileURLToPath(
  new URL("../../fixtures/rss/index.json", import.meta.url),
);

// index.json 경계 파싱 — 소스 id만 쓴다(나머지 필드 검사는 tests/fixtures-rss.test.ts)
const RssIndexIdsSchema = z.object({
  sources: z.array(z.object({ id: z.string().min(1) })).min(1),
});

/** 실제 configs/sources.json(zod 검증, 설정 파일 순서) */
export function configSources(): Source[] {
  return SourcesFileSchema.parse(
    JSON.parse(readFileSync(SOURCES_PATH, "utf8")),
  );
}

/** fixtures/rss/index.json의 소스 id — fixtures/rss/<id>.xml과 1:1(tests/fixtures-rss.test.ts가 보장) */
export const FIXTURE_FEED_IDS: readonly string[] = RssIndexIdsSchema.parse(
  JSON.parse(readFileSync(RSS_INDEX_PATH, "utf8")),
).sources.map((s) => s.id);

/**
 * configs/sources.json에서 fixture 피드가 있는 소스만 `enabled:true`로 켠 목록(설정 파일 순서 유지).
 * 약관 확인 전(`terms_checked:false`) 소스는 테스트에서도 켜지 않는다 — fixture가 그런 소스를 가리키거나
 * configs에 없는 id면 오류로 알린다.
 */
export function fixtureFeedSources(): Source[] {
  const sources = configSources();
  for (const id of FIXTURE_FEED_IDS) {
    const source = sources.find((s) => s.id === id);
    if (!source) throw new Error(`fixture 피드가 configs에 없다: ${id}`);
    if (!source.terms_checked) {
      throw new Error(`약관 확인 전 소스를 테스트에서 켜려 함: ${id}`);
    }
  }
  const ids = new Set(FIXTURE_FEED_IDS);
  return sources.map((s) =>
    ids.has(s.id) && !s.enabled ? { ...s, enabled: true } : s,
  );
}
