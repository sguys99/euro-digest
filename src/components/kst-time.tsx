import { formatKst } from "@/lib/time";

/**
 * `<time datetime="{UTC ISO}">HH:MM KST</time>` — 저장은 UTC, 표시는 KST(CLAUDE.md §8). 마스트헤드 스텁 발행·업데이트,
 * 상단 내비·뒤표지의 마지막 업데이트(M1-30)가 쓴다. 서버 컴포넌트(빌드 때 굳는 절대 시각 — 상대 시간은 클라이언트 섬).
 */
export function KstTime({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatKst(iso, "time")} KST</time>;
}
