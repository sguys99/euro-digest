/**
 * 뉴스 소스 설정 (M1-01 수직 슬라이스) — `configs/sources.json`을 zod로 검증해 읽고 수집 가능 여부를 판정한다.
 *
 * 수집 조건(CLAUDE.md §6.4): `enabled && terms_checked`, 목록·OG 크롤링 소스(`crawl`)는 `robots_checked`도.
 * 슬라이스는 id 하나(`bbc-sport-football`)만 고르지만 이 조건은 그대로 검사한다(URL 하드코딩 없음).
 * M1-02가 "수집 가능한 소스 전부"를 돌려주는 로더로 확장한다.
 */
import { SourcesFileSchema, type Source } from "@/lib/schema";

import { ConfigFileError, readConfigFile } from "./config-files";

/** M1-01 슬라이스가 수집하는 소스 id (M1-02 로더가 대체) */
export const SLICE_SOURCE_ID = "bbc-sport-football";

/** `<rootDir>/configs/sources.json` → Source[] */
export function loadSources(rootDir: string): Promise<Source[]> {
  return readConfigFile(rootDir, "sources.json", SourcesFileSchema);
}

/** 수집해도 되는 소스인가 — enabled && terms_checked (+ crawl은 robots_checked) */
export function isCollectable(source: Source): boolean {
  if (!source.enabled || !source.terms_checked) return false;
  if (source.type === "crawl" && !source.robots_checked) return false;
  return true;
}

/** id로 소스를 고른다. 없거나 수집 조건을 통과하지 못하면 ConfigFileError(수집하지 않는다). */
export function pickCollectableSource(
  sources: readonly Source[],
  id: string,
): Source {
  const source = sources.find((s) => s.id === id);
  if (!source) {
    throw new ConfigFileError(`configs/sources.json에 소스 "${id}"가 없다`);
  }
  if (!isCollectable(source)) {
    throw new ConfigFileError(
      `소스 "${id}"는 수집 조건(enabled && terms_checked${source.type === "crawl" ? " && robots_checked" : ""})을 통과하지 못했다`,
    );
  }
  return source;
}
