import { ONBOARDING_BOOT_SCRIPT } from "@/lib/onboarding-boot";
import { artifacts, routes, withBasePath } from "@/lib/paths";

import { OnboardingEntry } from "./onboarding-entry";

/**
 * 홈 온보딩 자리 (PRD FR-113 · §15 D64 ⑥, plan M4-09) — 진입 줄 섬 + 바로 뒤 첫 페인트 전 스크립트(서버 컴포넌트).
 * 진입 줄은 서버 HTML에서 숨김이고 스크립트가 첫 방문 + 팔로우 0이면 연다(src/lib/onboarding-boot.ts). 스크립트는 HTML을 읽는 도중 동기로 돌아
 * 아래 지면이 그려지기 전에 자리가 정해진다(CLS — DECISIONS D2 §9).
 */
export function OnboardingSlot({ className }: { className?: string }) {
  return (
    <>
      <OnboardingEntry
        dataUrl={withBasePath(artifacts.onboardingData())}
        myHref={routes.my()}
        className={className}
      />
      <script
        data-slot="onboarding-boot"
        dangerouslySetInnerHTML={{ __html: ONBOARDING_BOOT_SCRIPT }}
      />
    </>
  );
}
