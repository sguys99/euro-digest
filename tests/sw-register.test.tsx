/**
 * 서비스 워커 등록 · 새 버전 토스트 (src/lib/sw-register.ts · status-island.tsx — FR-121 · M4-13), 저절로 사라지지 않는 토스트(Toast
 * `duration: Infinity`), 오프라인 화면 '다시 시도' 섬(src/app/offline/offline-retry.tsx).
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineRetry } from "@/app/offline/offline-retry";
import { toast, Toaster } from "@/components/ui/toast";
import { SW_SKIP_WAITING_MESSAGE } from "@/lib/sw/policy";
import { resetServiceWorkerState, setupServiceWorker } from "@/lib/sw-register";

type Listener = () => void;

class FakeWorker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

function fakeWindow(opts: {
  controller: boolean;
  readyState?: DocumentReadyState;
}) {
  const reg = new FakeRegistration();
  const containerTarget = new EventTarget();
  const container = Object.assign(containerTarget, {
    controller: opts.controller ? ({} as ServiceWorker) : null,
    register: vi.fn(async () => reg),
  });
  const docTarget = new EventTarget();
  const doc = Object.assign(docTarget, {
    readyState: opts.readyState ?? "complete",
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const winTarget = new EventTarget();
  const win = Object.assign(winTarget, {
    navigator: { serviceWorker: container },
    document: doc,
    location: { reload: vi.fn() },
  });
  return {
    win: win as unknown as Window,
    reg,
    container,
    doc,
    location: win.location,
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  resetServiceWorkerState();
});

describe("setupServiceWorker — 등록", () => {
  it("문서 load 뒤에 basePath sw.js를 scope basePath/ · updateViaCache none으로 한 번만 등록", async () => {
    const { win, container } = fakeWindow({
      controller: false,
      readyState: "loading",
    });
    const prompt = vi.fn();
    setupServiceWorker("/euro-digest", prompt, win);
    setupServiceWorker("/euro-digest", prompt, win);
    expect(container.register).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("load"));
    await flush();
    expect(container.register).toHaveBeenCalledTimes(1);
    expect(container.register).toHaveBeenCalledWith("/euro-digest/sw.js", {
      scope: "/euro-digest/",
      updateViaCache: "none",
    });
  });

  it("이미 load가 끝났으면(클라이언트 이동) 바로, 루트 배포는 /sw.js · /", async () => {
    const { win, container } = fakeWindow({ controller: false });
    setupServiceWorker("", vi.fn(), win);
    await flush();
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("서비스 워커를 지원하지 않거나 등록이 거부돼도 조용히 넘어간다", async () => {
    const { win } = fakeWindow({ controller: false });
    (win.navigator as { serviceWorker?: unknown }).serviceWorker = undefined;
    expect(() =>
      setupServiceWorker("/euro-digest", vi.fn(), win),
    ).not.toThrow();
    resetServiceWorkerState();
    const rejected = fakeWindow({ controller: true });
    rejected.container.register.mockRejectedValueOnce(new Error("blocked"));
    setupServiceWorker("/euro-digest", vi.fn(), rejected.win);
    await flush();
  });
});

describe("setupServiceWorker — 새 버전", () => {
  it("첫 설치(맡은 페이지 없음)는 알리지 않는다", async () => {
    const { win, reg } = fakeWindow({ controller: false });
    const prompt = vi.fn();
    setupServiceWorker("/euro-digest", prompt, win);
    await flush();
    const worker = new FakeWorker();
    reg.installing = worker;
    reg.dispatchEvent(new Event("updatefound"));
    reg.waiting = worker;
    worker.setState("installed");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("새 워커가 설치를 마치고 기다리면 알린다 → 새로고침 = skipWaiting 메시지 → controllerchange에 다시 불러옴", async () => {
    const { win, reg, container, location } = fakeWindow({ controller: true });
    const prompt = vi.fn();
    setupServiceWorker("/euro-digest", prompt, win);
    await flush();
    expect(prompt).not.toHaveBeenCalled();
    const worker = new FakeWorker();
    reg.installing = worker;
    reg.dispatchEvent(new Event("updatefound"));
    worker.setState("installed");
    expect(prompt).not.toHaveBeenCalled(); // 아직 waiting이 아님
    reg.waiting = worker;
    worker.setState("installed");
    expect(prompt).toHaveBeenCalledTimes(1);

    // 부탁하지 않은 controllerchange(다른 탭)로는 다시 불러오지 않는다
    container.dispatchEvent(new Event("controllerchange"));
    expect(location.reload).not.toHaveBeenCalled();

    const reload = prompt.mock.calls[0]?.[0] as Listener;
    reload();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: SW_SKIP_WAITING_MESSAGE,
    });
    expect(location.reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange"));
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("이미 기다리는 워커 — 등록 때 알리고, 페이지를 옮겨 다시 부르면 또 알린다. 그사이 다른 탭이 활성화했으면 바로 다시 불러온다", async () => {
    const { win, reg, location } = fakeWindow({ controller: true });
    reg.waiting = new FakeWorker();
    const prompt = vi.fn();
    setupServiceWorker("/euro-digest", prompt, win);
    await flush();
    expect(prompt).toHaveBeenCalledTimes(1);
    setupServiceWorker("/euro-digest", prompt, win);
    expect(prompt).toHaveBeenCalledTimes(2);
    reg.waiting = null;
    (prompt.mock.calls[1]?.[0] as Listener)();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("화면으로 돌아오면 업데이트를 확인한다", async () => {
    const { win, reg, doc } = fakeWindow({ controller: true });
    setupServiceWorker("/euro-digest", vi.fn(), win);
    await flush();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reg.update).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(reg.update).toHaveBeenCalledTimes(1);
  });
});

describe("Toast duration Infinity — 새 버전 토스트", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("저절로 사라지지 않고, 액션을 누르면 닫히고 실행된다", () => {
    render(<Toaster />);
    const onClick = vi.fn();
    act(() => {
      toast({
        kind: "새 소식",
        message: "새 소식이 있어요",
        action: { label: "새로고침", onClick },
        duration: Infinity,
        dismissible: true,
      });
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("새 소식이 있어요")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "알림 닫기" }),
    ).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "새로고침" }).click());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("새 소식이 있어요")).toBeNull();
  });
});

describe("OfflineRetry — '다시 시도'", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/euro-digest"));
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, "", "/");
  });

  it("from이 basePath 아래 경로면 그 주소로 가는 링크", () => {
    window.history.replaceState(
      null,
      "",
      "/euro-digest/offline/?from=%2Feuro-digest%2Fteams%2Farsenal%2F",
    );
    render(<OfflineRetry />);
    expect(screen.getByRole("link", { name: "다시 시도" })).toHaveAttribute(
      "href",
      "/euro-digest/teams/arsenal/",
    );
  });

  it.each([
    "",
    "?from=%2F%2Fevil.example%2F",
    "?from=https%3A%2F%2Fevil.example%2Feuro-digest%2F",
    "?from=%2Fother%2F",
  ])("from이 없거나 다른 곳이면(%s) 링크 없음", (search) => {
    window.history.replaceState(null, "", `/euro-digest/offline/${search}`);
    const { container } = render(<OfflineRetry />);
    expect(container).toBeEmptyDOMElement();
  });
});
