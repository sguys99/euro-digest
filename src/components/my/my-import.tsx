"use client";

import { lazy, Suspense, useState, useSyncExternalStore } from "react";

import { FOLLOW_KINDS, FOLLOW_QUERY_PARAMS } from "@/lib/follow";
import { MY_IMPORT_ATTR } from "@/lib/my-view";

/**
 * `/my` 가져오기 진입 섬 — 주소에 공유 쿼리(`?t=…&p=…` — PRD §15 D67 ③)가 있을 때만 확인 띠(지연 조각 `my-import-band.tsx`)를 받는다 (FR-114, plan M4-10)
 *
 * - 쿼리가 없으면 아무것도 받지 않는다(`/my` 초기 JS 예산). 서버 HTML에는 빈 자리(`SLOT`, 숨김)만 있다.
 * - 자리는 첫 페인트 전 부트 스크립트(src/lib/my-import-boot.ts — 페이지가 이 섬 바로 앞에 둔다)가 `<html data-my-import>` + 높이 재료로 연다.
 *   띠와 같은 면(D0 안내 띠 — `--paper-2` + 왼쪽 4px `--brand-accent`) · 패딩 · 높이라 띠가 늦게 와도 아래가 밀리지 않는다(CLS).
 * - 띠가 끝나면(반영 · 취소 · 띠 없이 안내) 속성을 지우고 이 섬을 비운다. 반영 · 취소는 사용자 입력 직후라 접힘은 CLS에 들지 않는다.
 */
const ImportBand = lazy(() =>
  import("./my-import-band").catch(() => ({
    // 조각을 못 받으면(오프라인 등) 띠 없이 끝낸다 — 자리는 접는다
    default: function Failed({ onDone }: { onDone: () => void }) {
      queueMicrotask(onDone);
      return null;
    },
  })),
);

const noopSubscribe = () => () => {};

function hasQuery(): boolean {
  const params = new URLSearchParams(window.location.search);
  return FOLLOW_KINDS.some((kind) => params.has(FOLLOW_QUERY_PARAMS[kind]));
}

/**
 * 자리 — 띠의 면 · 패딩과 같고, 부트가 연 동안은 띠 높이만큼(줄 높이 합 — 띠 머리 주석과 같은 셈)을 잡는다.
 * 높이(px) = 기본(1023 이하 239 — 방식 줄이 이름 · 설명 두 줄씩, 1024 이상 201 — 한 줄씩 · 패딩 16px. 패딩 · 키커 · 제목 · 방식 줄 · 버튼) + 미리보기 줄 수 × 32 + 안내 줄(있으면 6 + 22 × 줄 수).
 * 단위는 `--spacing`(4px)의 배수로 적는다.
 */
const SLOT = [
  "hidden mt-5 bg-paper-2 py-3.5 pr-4 pl-5 shadow-[inset_4px_0_0_var(--brand-accent)] lg:mt-6 lg:py-4 lg:pr-5 lg:pl-6",
  // 띠가 들어오면(:has) 보이고, 부트가 연 동안은 띠가 오기 전에도 보인다
  "has-[[data-slot=my-import]]:block [:root[data-my-import]_&]:block",
  "[--mi-base:59.75] [--mi-rows:var(--mi-r2,0)] lg:[--mi-base:50.25] lg:[--mi-rows:var(--mi-r3,0)] xl:[--mi-rows:var(--mi-r4,0)]",
  "[:root[data-my-import]_&]:min-h-[calc(var(--spacing)*(var(--mi-base)_+_8*var(--mi-rows)_+_1.5*min(var(--mi-n,0),1)_+_5.5*var(--mi-n,0)))]",
].join(" ");

export function MyImport() {
  const wanted = useSyncExternalStore(noopSubscribe, hasQuery, () => false);
  const [done, setDone] = useState(false);
  const active = wanted && !done;
  return (
    <div data-slot="my-import-slot" className={SLOT}>
      {active ? (
        <Suspense fallback={null}>
          <ImportBand
            onDone={() => {
              document.documentElement.removeAttribute(MY_IMPORT_ATTR);
              setDone(true);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
