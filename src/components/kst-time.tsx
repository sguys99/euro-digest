import { formatKst } from "@/lib/time";

/**
 * `<time datetime="{UTC ISO}">HH:MM KST</time>` — 저장은 UTC, 표시는 KST(CLAUDE.md §8). 마스트헤드 스텁 발행·업데이트,
 * 상단 내비·뒤표지의 마지막 업데이트(M1-30)가 쓴다. 서버 컴포넌트(빌드 때 굳는 절대 시각 — 상대 시간은 클라이언트 섬).
 */
export function KstTime({
  iso,
  withDate = false,
}: {
  iso: string;
  /** 날짜를 붙인다("10월 23일 (금) 07:05 KST") — 보고 있는 호와 다른 날의 시각(날짜 아카이브의 사이트 마지막 업데이트, M1-34) */
  withDate?: boolean;
}) {
  return (
    <time dateTime={iso}>
      {formatKst(iso, withDate ? "datetime" : "time")} KST
    </time>
  );
}
