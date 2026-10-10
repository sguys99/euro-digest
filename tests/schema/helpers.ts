/**
 * 스키마 테스트 공용 헬퍼. 유효 예시는 fixtures/schema/에 저장소와 같은 경로로 둔다
 * (예: fixtures/schema/data/news/2026-10-10.json) — registry 테스트가 경로 매핑까지 함께 검사한다.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export const FIXTURE_ROOT = fileURLToPath(
  new URL("../../fixtures/schema/", import.meta.url),
);

/** fixtures/schema/ 기준 상대 경로의 JSON을 읽는다(검증 전 원본). */
export function loadFixture(relPath: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, relPath), "utf8"));
}

/** fixtures/schema/ 아래 모든 .json의 상대 경로(`/` 구분, 정렬). */
export function listFixtures(dir = FIXTURE_ROOT, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => {
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) return listFixtures(path.join(dir, d.name), rel);
      return d.name.endsWith(".json") ? [rel] : [];
    })
    .sort();
}

/** 통과를 기대하고 파싱 결과를 돌려준다. 실패하면 읽기 쉬운 오류로 테스트를 멈춘다. */
export function expectValid<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `통과를 기대했지만 실패했다:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/** fixture를 스키마로 파싱한 값(타입이 붙은 유효 예시). 테스트에서 일부만 바꿔 실패 사례를 만든다. */
export function validFixture<S extends z.ZodType>(
  schema: S,
  relPath: string,
): z.output<S> {
  return expectValid(schema, loadFixture(relPath));
}

/** 실패를 기대하고 이슈 경로("a.0.b")를 돌려준다. 통과하면 테스트를 멈춘다. */
export function issuePaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("실패를 기대했지만 통과했다");
  return result.error.issues.map((issue) => issue.path.join("."));
}

/** 실패를 기대하고 이슈 메시지를 돌려준다. */
export function issueMessages(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("실패를 기대했지만 통과했다");
  return result.error.issues.map((issue) => issue.message);
}

/** 배열의 index번 항목(없으면 테스트를 멈춘다 — noUncheckedIndexedAccess 대응). */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`fixture에 ${index}번 항목이 없다`);
  return item;
}

/**
 * 링크 필드가 거부해야 하는 URL (2026-10-10 결정 Q3 — http/https + 도메인 호스트만).
 * 모두 `z.url()`은 통과시키는 값들이다.
 */
export const REJECTED_URLS = [
  "javascript:alert(1)",
  "mailto:editor@example.com",
  "data:text/html,<script>alert(1)</script>",
  "ftp://example.com/feed.xml",
  "http:example.com/no-slashes",
  "https://localhost/feed",
] as const;

/** 통과 여부만. */
export function passes(schema: z.ZodType, input: unknown): boolean {
  return schema.safeParse(input).success;
}
