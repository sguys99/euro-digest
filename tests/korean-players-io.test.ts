/**
 * M3-03 한국 선수 현황 단계(scripts/lib/korean-players-io.ts) — 임시 폴더, 네트워크·실호출 없음.
 * 원장이 없으면 건너뜀 · write 모드만 쓴다(내용이 같으면 다시 쓰지 않음) · preview는 쓰지 않음 · 깨진 이전 파일은 새로 만든다.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KoreanPlayersDataFileSchema } from "@/lib/schema";

import {
  koreanPlayersPath,
  runKoreanPlayersStage,
} from "../scripts/lib/korean-players-io";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FX = JSON.parse(
  readFileSync(path.join(ROOT, "fixtures/players/korean-build.json"), "utf8"),
) as {
  players: unknown;
  teamIds: unknown;
  meta: unknown;
  ledger: Array<{ month: string }>;
};

const silent = { info: () => {}, warn: () => {}, error: () => {} };

let root: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "korean-players-"));
  dataDir = path.join(root, "data");
  mkdirSync(path.join(root, "configs"), { recursive: true });
  mkdirSync(path.join(dataDir, "matches"), { recursive: true });
  const write = (rel: string, value: unknown) =>
    writeFileSync(path.join(root, rel), JSON.stringify(value));
  write("configs/korean-players.json", FX.players);
  write("configs/team-ids.json", FX.teamIds);
  for (const f of ["names.ko.json", "competitions.json"]) {
    copyFileSync(
      path.join(ROOT, "fixtures/schema/configs", f),
      path.join(root, "configs", f),
    );
  }
  for (const month of FX.ledger) {
    write(`data/matches/${month.month}.json`, month);
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const deps = () => ({ rootDir: root, dataDir, logger: silent });

describe("runKoreanPlayersStage", () => {
  it("원장 메타가 없으면 건너뛴다(원장이 시작되지 않음)", async () => {
    const out = await runKoreanPlayersStage(deps(), {
      mode: "write",
      now: "2026-11-01T22:00:00.000Z",
    });
    expect(out).toEqual({ state: "skipped", reason: "no-ledger" });
    expect(existsSync(koreanPlayersPath(dataDir))).toBe(false);
  });

  it("write 모드는 쓰고, 같은 내용이면 다시 쓰지 않는다 · preview는 쓰지 않는다", async () => {
    writeFileSync(
      path.join(dataDir, "matches/meta.json"),
      JSON.stringify(FX.meta),
    );
    const preview = await runKoreanPlayersStage(deps(), {
      mode: "preview",
      now: "2026-11-01T22:00:00.000Z",
    });
    expect(preview).toMatchObject({ state: "done", written: null });
    expect(existsSync(koreanPlayersPath(dataDir))).toBe(false);

    const first = await runKoreanPlayersStage(deps(), {
      mode: "write",
      now: "2026-11-01T22:00:00.000Z",
    });
    expect(first).toMatchObject({ state: "done", mode: "write" });
    const text = readFileSync(koreanPlayersPath(dataDir), "utf8");
    const file = KoreanPlayersDataFileSchema.parse(JSON.parse(text));
    expect(file.players.map((p) => p.slug)).toEqual([
      "test-player",
      "no-id-player",
      "gone-player",
    ]);
    // 대회 파일이 없으면 다음 경기는 모른다(null), 경기 id는 원장 키
    expect(file.players[0]!.next).toBeNull();
    expect(file.players[0]!.recent[0]!.matchId).toBe("af-16");

    const again = await runKoreanPlayersStage(deps(), {
      mode: "write",
      now: "2026-11-02T22:00:00.000Z",
    });
    expect(again).toMatchObject({ state: "done", written: null });
    expect(readFileSync(koreanPlayersPath(dataDir), "utf8")).toBe(text);
  });

  it("이전 파일이 깨져 있으면 경고 후 새로 만든다 · 원장 달 파일이 깨지면 setup 실패(던지지 않음)", async () => {
    writeFileSync(
      path.join(dataDir, "matches/meta.json"),
      JSON.stringify(FX.meta),
    );
    mkdirSync(path.join(dataDir, "players"), { recursive: true });
    writeFileSync(koreanPlayersPath(dataDir), "{broken");
    const out = await runKoreanPlayersStage(deps(), {
      mode: "write",
      now: "2026-11-01T22:00:00.000Z",
    });
    expect(out).toMatchObject({
      state: "done",
      previousError: "JSON 파싱 실패",
    });
    expect(() =>
      KoreanPlayersDataFileSchema.parse(
        JSON.parse(readFileSync(koreanPlayersPath(dataDir), "utf8")),
      ),
    ).not.toThrow();

    writeFileSync(path.join(dataDir, "matches/2026-10.json"), "{");
    const failed = await runKoreanPlayersStage(deps(), {
      mode: "write",
      now: "2026-11-01T22:00:00.000Z",
    });
    expect(failed).toMatchObject({ state: "failed", errorType: "setup" });
  });
});
