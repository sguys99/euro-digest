import type { Metadata } from "next";

import { SpecimenKnockout } from "../specimen-knockout";

/** UCL 녹아웃 견본 — 결승 뒤(M2-12, 합성 데이터 — specimen-knockout.tsx). `SPECIMEN=1` 빌드 전용 */
export const metadata: Metadata = {
  title: "UCL 결승 견본",
  robots: { index: false, follow: false },
};

export default function SpecimenKnockoutFinalPage() {
  return <SpecimenKnockout scenario="final" />;
}
