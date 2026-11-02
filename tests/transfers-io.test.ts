/**
 * M4-01 이적 트래커 단계(scripts/lib/transfers-io.ts) — 임시 폴더, 네트워크·실호출 없음.
 * write 모드만 쓴다(같은 내용이면 다시 쓰지 않음) · preview는 쓰지 않음 · 삭제 요청 제외 · newsOverride · 깨진 뉴스·삭제 요청 설정이면
 * 실패(전일 파일 유지) · 깨진 이전 파일은 새로 쓴다.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TransfersFileSchema,
  type NewsCard,
  type NewsFile,
} from "@/lib/schema";

import { runTransfersStage, transfersPath } from "../scripts/lib/transfers-io";

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const NOW = "2026-11-02T00:00:00.000Z";

function card(
  id: string,
  status: NonNullable<NewsCard["transfer"]>["status"],
  at: string,
): NewsCard {
  return {
    id,
    t: "제목",
    s: [],
    cat: "transfer",
    comp: [],
    teams: ["arsenal"],
    players: ["kim-min-jae"],
    imp: 3,
    kr: true,
    spoiler: false,
    transfer: { player: "kim-min-jae", to: "arsenal", status, tier: 3 },
    src: [{ n: "매체", u: `https://example.com/${id}`, at, tier: 3 }],
    lang: "ko",
    ai: false,
    created: at,
  };
}

let root: string;
let dataDir: string;

const writeJson = (rel: string, value: unknown) => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === "string" ? value : JSON.stringify(value),
  );
};

function news(date: string, cards: NewsCard[]): NewsFile {
  return {
    date,
    generatedAt: `${date}T00:00:00.000Z`,
    runId: "collect-prod-20261001T000000Z-0001",
    cards,
  };
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "transfers-"));
  dataDir = path.join(root, "data");
  writeJson("configs/takedowns.json", []);
  writeJson(
    "data/news/2026-10-17.json",
    news("2026-10-17", [
      card("c_000000000a", "rumor", "2026-10-16T10:00:00.000Z"),
    ]),
  );
  writeJson(
    "data/news/2026-10-30.json",
    news("2026-10-30", [
      card("c_000000000b", "rumor", "2026-10-29T10:00:00.000Z"),
    ]),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const deps = () => ({ rootDir: root, dataDir, logger: silent });
const readOut = () =>
  TransfersFileSchema.parse(
    JSON.parse(readFileSync(transfersPath(dataDir), "utf8")),
  );

describe("runTransfersStage", () => {
  it("write 모드는 쓰고, 같은 내용이면 다시 쓰지 않는다 · preview는 쓰지 않는다", async () => {
    const preview = await runTransfersStage(deps(), {
      mode: "preview",
      now: NOW,
    });
    expect(preview).toMatchObject({
      state: "done",
      changed: true,
      written: null,
    });
    expect(existsSync(transfersPath(dataDir))).toBe(false);

    const first = await runTransfersStage(deps(), { mode: "write", now: NOW });
    expect(first).toMatchObject({ state: "done", changed: true });
    expect(first.state === "done" && first.written).toBe(
      transfersPath(dataDir),
    );
    const out = readOut();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "kim-min-jae:arsenal",
      status: "rumor",
      updated: "2026-10-29T10:00:00.000Z",
      quiet: false,
    });
    expect(out[0]!.history.map((h) => h.card)).toEqual([
      "c_000000000a",
      "c_000000000b",
    ]);

    const again = await runTransfersStage(deps(), { mode: "write", now: NOW });
    expect(again).toMatchObject({
      state: "done",
      changed: false,
      written: null,
    });
  });

  it("삭제 요청 카드는 근거에서 뺀다", async () => {
    writeJson("configs/takedowns.json", [
      {
        id: "c_000000000a",
        requestedAt: "2026-10-31T00:00:00.000Z",
        handledAt: null,
        reason: "저작권자 삭제 요청 (#1)",
      },
    ]);
    await runTransfersStage(deps(), { mode: "write", now: NOW });
    expect(readOut()[0]!.history.map((h) => h.card)).toEqual(["c_000000000b"]);
  });

  it("newsOverride는 같은 날짜 디스크 파일 대신 쓴다(쓰지 않은 실행의 발행일 파일)", async () => {
    const out = await runTransfersStage(deps(), {
      mode: "preview",
      now: NOW,
      newsOverride: news("2026-10-30", [
        card("c_000000000c", "negotiating", "2026-10-29T12:00:00.000Z"),
      ]),
    });
    expect(out.state === "done" && out.build.transfers[0]!.history).toEqual([
      { at: "2026-10-16T10:00:00.000Z", status: "rumor", card: "c_000000000a" },
      {
        at: "2026-10-29T12:00:00.000Z",
        status: "negotiating",
        card: "c_000000000c",
      },
    ]);
  });

  it("뉴스 파일이 깨졌거나 삭제 요청 설정을 읽지 못하면 실패 — 이전 파일을 건드리지 않는다", async () => {
    await runTransfersStage(deps(), { mode: "write", now: NOW });
    const before = readFileSync(transfersPath(dataDir), "utf8");

    writeJson("data/news/2026-10-31.json", "{ broken");
    expect(
      await runTransfersStage(deps(), { mode: "write", now: NOW }),
    ).toMatchObject({ state: "failed", errorType: "setup" });
    rmSync(path.join(dataDir, "news/2026-10-31.json"));

    writeJson("configs/takedowns.json", "{ broken");
    expect(
      await runTransfersStage(deps(), { mode: "write", now: NOW }),
    ).toMatchObject({ state: "failed", errorType: "setup" });
    expect(readFileSync(transfersPath(dataDir), "utf8")).toBe(before);
  });

  it("깨진 이전 파일은 경고 후 새로 쓴다 · 뉴스 폴더가 없으면 빈 목록", async () => {
    writeJson("data/transfers.json", "{ broken");
    const out = await runTransfersStage(deps(), { mode: "write", now: NOW });
    expect(out).toMatchObject({ state: "done", changed: true });
    expect(out.state === "done" && out.previousError).toBe("JSON 파싱 실패");
    expect(readOut()).toHaveLength(1);

    rmSync(path.join(dataDir, "news"), { recursive: true });
    await runTransfersStage(deps(), { mode: "write", now: NOW });
    expect(readOut()).toEqual([]);
  });
});
