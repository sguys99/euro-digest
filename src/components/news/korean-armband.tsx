/*
 * 한국 완장 — feed-card.tsx에서 떼어 냈다(M4-08): `cn`(tailwind-merge) 없는 조각이라 클라이언트 섬에서도 그린다.
 */

/**
 * 한국 완장 — `kr` 데이터 기준(제목에 이름이 있어도 `kr:false`면 달지 않는다). 텍스트 "한국" + `title` "한국 선수 관련"
 * (팀 화면 티켓·팀시트처럼 선수 자신 옆에 다는 완장은 `title` "한국 선수" — DESIGN §9.3 팀 헤더 티켓)
 */
export function KoreanArmband({
  title = "한국 선수 관련",
}: { title?: string } = {}) {
  return (
    <span
      title={title}
      className="inline-block bg-brand-accent px-0.75 pt-0.75 pb-0.5 text-[10.5px] leading-[1.2] font-extrabold tracking-[-0.02em] text-brand-accent-foreground"
    >
      한국
    </span>
  );
}
