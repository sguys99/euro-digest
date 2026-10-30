import type { Metadata } from "next";

import { SpecimenKnockout } from "./specimen-knockout";

/** UCL 녹아웃 견본 — 16강 진행 중(M2-12, 합성 데이터 — specimen-knockout.tsx). `SPECIMEN=1` 빌드 전용 */
export const metadata: Metadata = {
  title: "UCL 녹아웃 견본",
  robots: { index: false, follow: false },
};

export default function SpecimenKnockoutPage() {
  return <SpecimenKnockout scenario="knockout" />;
}
