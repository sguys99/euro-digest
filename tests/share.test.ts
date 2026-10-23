/**
 * M1-35 — 카드 공유 분기 (src/lib/share.ts, PRD FR-34, DESIGN.md §9.3 카드 메뉴: 모바일 Web Share · 데스크톱 링크 복사)
 *
 * Web Share 있음/없음 · 시트 취소(AbortError) · 그 밖의 거부 → 복사 · 클립보드 없음/거부 → failed · 데스크톱(share 있어도 복사) ·
 * 클립보드 쓰기는 첫 await 전에 시작(Safari 사용자 동작) · 브라우저 기능 읽기 · 복사 실패 대체 경로.
 */
import { describe, expect, it, vi } from "vitest";

import {
  browserShareEnv,
  shareLink,
  sharePathOf,
  type ShareEnv,
} from "@/lib/share";

const URL_ =
  "https://sguys99.github.io/euro-digest/news/2026-10-23/#c_8f3a1b2c4d";

function domError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function env(over: Partial<ShareEnv> = {}): ShareEnv {
  return {
    coarse: false,
    share: vi.fn(() => Promise.resolve()),
    writeText: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe("shareLink", () => {
  it("터치 기기 + Web Share → 시스템 공유(URL 하나만 — 원제목·요약 없음), 복사하지 않는다", async () => {
    const e = env({ coarse: true });
    await expect(shareLink(URL_, e)).resolves.toBe("shared");
    expect(e.share).toHaveBeenCalledWith({ url: URL_ });
    expect(e.writeText).not.toHaveBeenCalled();
  });

  it("공유 시트를 닫으면(AbortError) 조용히 취소 — 복사로 넘어가지 않는다", async () => {
    const e = env({
      coarse: true,
      share: vi.fn(() => Promise.reject(domError("AbortError"))),
    });
    await expect(shareLink(URL_, e)).resolves.toBe("cancelled");
    expect(e.writeText).not.toHaveBeenCalled();
  });

  it("그 밖의 거부(NotAllowedError — 사용자 동작 만료 등)면 클립보드 복사로", async () => {
    const e = env({
      coarse: true,
      share: vi.fn(() => Promise.reject(domError("NotAllowedError"))),
    });
    await expect(shareLink(URL_, e)).resolves.toBe("copied");
    expect(e.writeText).toHaveBeenCalledWith(URL_);
  });

  it("데스크톱(pointer: fine)은 Web Share가 있어도 링크 복사(DESIGN §9.3)", async () => {
    const e = env({ coarse: false });
    await expect(shareLink(URL_, e)).resolves.toBe("copied");
    expect(e.share).not.toHaveBeenCalled();
    expect(e.writeText).toHaveBeenCalledWith(URL_);
  });

  it("터치 기기라도 Web Share가 없으면 복사", async () => {
    const e = env({ coarse: true, share: undefined });
    await expect(shareLink(URL_, e)).resolves.toBe("copied");
  });

  it("클립보드 쓰기는 첫 await 전에(클릭 처리 안에서 동기로) 시작한다 — Safari는 사용자 동작 밖의 쓰기를 거부", () => {
    const e = env();
    void shareLink(URL_, e);
    expect(e.writeText).toHaveBeenCalledTimes(1);
  });

  it("클립보드가 거부되면(권한·문서 포커스) failed — 던지지 않는다", async () => {
    const e = env({
      writeText: vi.fn(() => Promise.reject(domError("NotAllowedError"))),
    });
    await expect(shareLink(URL_, e)).resolves.toBe("failed");
  });

  it("클립보드 API가 없으면(비보안 출처 http·옛 브라우저) failed", async () => {
    await expect(shareLink(URL_, env({ writeText: undefined }))).resolves.toBe(
      "failed",
    );
    await expect(
      shareLink(
        URL_,
        env({
          coarse: true,
          share: vi.fn(() => Promise.reject(new TypeError("bad"))),
          writeText: undefined,
        }),
      ),
    ).resolves.toBe("failed");
  });
});

describe("browserShareEnv", () => {
  function fakeWindow(nav: Partial<Navigator>, coarse: boolean | null): Window {
    return {
      navigator: nav,
      matchMedia:
        coarse === null
          ? undefined
          : (query: string) => ({
              matches: query === "(pointer: coarse)" && coarse,
            }),
    } as unknown as Window;
  }

  it("기능이 있으면 navigator에 묶어 부른다(this 유지), 터치 판정은 (pointer: coarse)", async () => {
    const calls: string[] = [];
    const nav = {
      share(this: unknown, data?: ShareData) {
        calls.push(`share:${this === nav}:${data?.url}`);
        return Promise.resolve();
      },
      clipboard: {
        writeText(this: unknown, text: string) {
          calls.push(`write:${this === nav.clipboard}:${text}`);
          return Promise.resolve();
        },
      },
    } as unknown as Navigator;
    const e = browserShareEnv(fakeWindow(nav, true));
    expect(e.coarse).toBe(true);
    await e.share?.({ url: "u" });
    await e.writeText?.("t");
    expect(calls).toEqual(["share:true:u", "write:true:t"]);
  });

  it("기능이 없으면 그 칸이 비고, matchMedia가 없으면 터치 아님", () => {
    const e = browserShareEnv(fakeWindow({}, null));
    expect(e).toEqual({
      coarse: false,
      share: undefined,
      writeText: undefined,
    });
    expect(browserShareEnv(fakeWindow({}, false)).coarse).toBe(false);
  });
});

describe("sharePathOf — 복사가 막혔을 때 '링크 열기'가 가는 같은 출처 경로", () => {
  it("공유 URL의 경로 + 앵커(basePath·trailing slash 그대로)", () => {
    expect(sharePathOf(URL_)).toBe(
      "/euro-digest/news/2026-10-23/#c_8f3a1b2c4d",
    );
    expect(
      sharePathOf("http://127.0.0.1:4173/news/2026-10-23/#c_8f3a1b2c4d"),
    ).toBe("/news/2026-10-23/#c_8f3a1b2c4d");
  });

  it("URL이 아니면 null", () => {
    expect(sharePathOf("not a url")).toBeNull();
    expect(sharePathOf("")).toBeNull();
  });
});
