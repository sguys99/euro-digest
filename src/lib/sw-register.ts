/**
 * 서비스 워커 등록 · 새 버전 감지 (PRD FR-121, plan M4-13) — 셸 상태 섬(src/components/shell/status-island.tsx)이 페이지마다 부른다.
 *
 * - **지연 등록**: 문서 `load` 뒤(이미 끝났으면 바로 — 클라이언트 이동). 첫 화면의 네트워크·메인 스레드와 겹치지 않게. 한 문서에서 한 번만.
 *   `updateViaCache: "none"` — sw.js를 HTTP 캐시(Pages max-age 600초) 없이 확인해 발행 직후 새 버전을 바로 알아챈다.
 * - **새 버전**: 페이지를 맡은 워커가 있는데(첫 설치가 아님) 새 워커가 설치를 마치고 기다리면 `prompt(reload)`를 부른다 → 섬이 토스트
 *   "새 소식이 있어요" + "새로고침"(DESIGN §9.2). `reload`는 기다리는 워커에 `SW_SKIP_WAITING_MESSAGE`를 보내고, 워커가 페이지를 맡으면
 *   (`controllerchange`) 다시 불러온다. 다른 탭이 먼저 활성화해 기다리는 워커가 없으면 바로 다시 불러온다.
 *   이 탭이 부탁하지 않은 `controllerchange`(첫 설치의 `clients.claim`·다른 탭의 새로고침)로는 다시 불러오지 않는다 — 읽던 화면이 저절로 바뀌지 않게.
 * - 이미 기다리는 워커가 있으면 페이지를 옮길 때마다(셸 섬이 다시 마운트) 다시 알린다 — 토스트는 페이지마다 하나라 이동하면 사라진다.
 * - 화면으로 돌아오면(`visibilitychange` visible — 아침에 열어 둔 탭·설치 앱) 업데이트를 확인한다.
 * - localStorage를 쓰지 않는다. 실패(지원 안 함·차단·404)는 조용히 넘긴다 — 서비스 워커 없이도 사이트는 그대로 동작한다.
 */
import { SW_SKIP_WAITING_MESSAGE } from "@/lib/sw/policy";

let registration: ServiceWorkerRegistration | null = null;
let started = false;
let reloading = false;

/** 테스트 전용 — 모듈 상태 초기화 */
export function resetServiceWorkerState(): void {
  registration = null;
  started = false;
  reloading = false;
}

/**
 * @param base basePath(`NEXT_PUBLIC_BASE_PATH`, 루트 배포면 "") — 워커 `${base}/sw.js`, 범위 `${base}/`
 * @param prompt 새 버전 알림(토스트) — 인자로 받은 함수를 "새로고침"에 건다
 */
export function setupServiceWorker(
  base: string,
  prompt: (reload: () => void) => void,
  win: Window = window,
): void {
  const container = win.navigator.serviceWorker as
    ServiceWorkerContainer | undefined;
  if (!container) return;

  const offer = (reg: ServiceWorkerRegistration): void => {
    if (!reg.waiting || !container.controller) return;
    prompt(() => {
      reloading = true;
      if (reg.waiting)
        reg.waiting.postMessage({ type: SW_SKIP_WAITING_MESSAGE });
      else win.location.reload();
    });
  };

  if (registration) {
    offer(registration);
    return;
  }
  if (started) return;
  started = true;

  container.addEventListener("controllerchange", () => {
    if (reloading) win.location.reload();
  });

  const register = (): void => {
    container
      .register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        offer(reg);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") offer(reg);
          });
        });
        win.document.addEventListener("visibilitychange", () => {
          if (win.document.visibilityState === "visible")
            reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  };

  if (win.document.readyState === "complete") register();
  else win.addEventListener("load", register, { once: true });
}
