import { cn } from "@/lib/utils";

/**
 * 오프라인 띠 — 상태 화면 ④ (PRD DR-07, DESIGN.md §9.3 상태 화면 4종 ④ · §2.9 오프라인 띠, 혼합안 `concept-mix.html` `.offline`, plan M1-37)
 *
 * `--ink` 면 + `--paper` 글자 13.5px, 안쪽 10·12px(좌우는 페이지 가장자리 `--edge`에 맞춤), "오프라인" 상자(1px `--paper`, 800, 안쪽 1·6px) +
 * 안내. 셸 섬이 `online`·`offline` 이벤트로 `<html data-offline>`를 달면 보인다(`hidden offline:flex`).
 *
 * 위치(M1-37 결정): 혼합안 견본은 피드 위에 띠를 둔 발췌다. 실제 화면에서는 연결이 끊기는 순간(사용자 입력 없이) 지면 위에 끼워 넣으면
 * 아래 내용이 밀리고(CLS) 스크롤을 내린 독자는 띠를 못 본다. 그래서 하단 탭처럼 **셸 흐름 끝의 sticky 요소**로 둔다 — 1023 이하는 하단 탭
 * 바로 위(셸 섬이 잰 탭 높이 `--bottom-tabs-h` — 홈 표시줄 포함, 글자 크기를 키워 탭이 커져도 겹치지 않게. 재기 전 기본값 58px + 위 괘선
 * 1px + 홈 표시줄), 1024 이상은 화면 아래. 띠는 섬이 `data-offline`을 단 뒤에만 보이므로 늘 잰 값을 쓴다. 흐름 끝에 끼므로 위 내용은 움직이지 않고, 문서 끝까지 내리면 뒤표지
 * 아래 제자리에 놓여 아무것도 가리지 않는다. 띠 높이만큼 토스트를 올리고 scroll-padding을 늘린다(globals.css §8).
 *
 * 서비스 워커(PWA, FR-121 — M4-D)가 없어 "캐시된 지면 유지"는 **지금 열린 페이지가 그대로 남는다**는 뜻이다. 다른 페이지는 미리 받아 둔 것만
 * 열리므로 "열리지 않을 수 있어요"라고 사실대로 쓴다(새 소식 확인·저장해 둔 호 같은 PWA 문구는 쓰지 않는다).
 * `role="status"` 바깥 상자는 늘 있고(높이 0) 안쪽만 보였다 숨긴다. `visible`은 견본(SPECIMEN)용 — sticky 없이 늘 보인다.
 */
export function OfflineBand({ visible = false }: { visible?: boolean }) {
  return (
    <div
      role="status"
      data-slot="offline-band"
      // 검색 발췌에 숨은 안내가 잡히지 않게(평소 숨김 — 렌더하는 크롤러의 시계·연결과 무관하게)
      data-nosnippet=""
      className={cn(
        !visible &&
          "sticky bottom-[var(--bottom-tabs-h,calc(59px+env(safe-area-inset-bottom)))] z-20 -mx-edge lg:bottom-0",
      )}
    >
      <div
        data-slot="offline-band-body"
        className={cn(
          "items-start gap-3 bg-ink py-2.5 text-[13.5px] text-paper",
          visible
            ? "flex px-3"
            : "hidden px-edge lg:pb-[calc(10px+env(safe-area-inset-bottom))] offline:flex",
        )}
      >
        <span className="flex-none border border-paper px-1.5 py-px font-extrabold">
          오프라인
        </span>
        <p>
          지금 페이지는 그대로 볼 수 있어요. 다른 페이지는 열리지 않을 수
          있어요.
        </p>
      </div>
    </div>
  );
}
