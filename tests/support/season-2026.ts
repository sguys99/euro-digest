/**
 * 동결한 2026-27 시즌 설정 (M5-11 — 2026-11-03 사용자 결정 ⑤, /new-season T단계).
 *
 * 고정 날짜(2026-10~11월)·2026 응답 fixtures·"2026-27 시즌" 문구를 기대하는 테스트는 저장소 `configs/competitions.json` 대신 이 사본을
 * 읽는다 — 시즌을 바꿔도(`/new-season`) 그 테스트들은 그대로 통과한다. 사본은 2026-11-03의 `configs/competitions.json` 그대로다
 * (`fixtures/season-2026/competitions.json` — 손으로 고치지 않는다). 설정 자체를 검사하는 테스트(team-leagues·team-colors·
 * names-ko-dict·og 등)는 계속 저장소 설정을 읽는다.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { CompetitionsFileSchema, type CompetitionsFile } from "@/lib/schema";

/** 저장소 루트 — Vitest는 루트에서 실행한다(dom 환경에서는 import.meta.url이 file: 주소가 아니다) */
const REPO = path.resolve(".");

/** 동결 사본 경로 */
export const SEASON_2026_COMPETITIONS = path.join(
  REPO,
  "fixtures/season-2026/competitions.json",
);

/**
 * 동결 사본(스키마 통과). `@/lib/data/competitions`를 import하지 않는다 — 그 모듈을 동결 사본으로 돌리는 vi.mock 안에서도
 * 이 파일을 불러올 수 있게.
 */
export function season2026Competitions(): CompetitionsFile {
  return CompetitionsFileSchema.parse(
    JSON.parse(readFileSync(SEASON_2026_COMPETITIONS, "utf8")),
  );
}

/**
 * 저장소 `configs/`를 임시 루트에 복사하고 competitions.json만 동결 사본으로 바꾼다 — `rootDir`로 configs를 읽는 수집 단계 테스트용.
 * 돌려준 `cleanup`으로 지운다.
 */
export function season2026Root(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-season2026-"));
  cpSync(path.join(REPO, "configs"), path.join(root, "configs"), {
    recursive: true,
  });
  cpSync(
    SEASON_2026_COMPETITIONS,
    path.join(root, "configs/competitions.json"),
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * 화면 코드가 인자 없이 부르는 `loadCompetitionsConfig()`를
 * 동결 사본으로 돌린다(경로를 준 호출은 그대로). vi.mock은 파일 맨 위로 끌어올려지므로 팩토리 안에서 동적으로 불러온다:
 *
 *   vi.mock("@/lib/data/competitions", async (importOriginal) =>
 *     (await import("./support/season-2026")).season2026CompetitionsModule(importOriginal),
 *   );
 */
export async function season2026CompetitionsModule(
  importOriginal: () => Promise<typeof import("@/lib/data/competitions")>,
): Promise<typeof import("@/lib/data/competitions")> {
  const original = await importOriginal();
  return {
    ...original,
    loadCompetitionsConfig: (file?: string) =>
      original.loadCompetitionsConfig(file ?? SEASON_2026_COMPETITIONS),
  };
}
