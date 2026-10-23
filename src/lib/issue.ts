/**
 * 호(號) — 마스트헤드 티켓의 "제 N호"·발행·업데이트 시각, 상단 내비·뒤표지의 "마지막 업데이트" (DESIGN §9.3, PRD §15 D29·FR-142)
 *
 * 순수 함수만 둔다(파일 읽기는 src/lib/data/*). 화면은 빌드 때 계산한 값을 정적 HTML로 굳힌다(JS·스키마 변경 없음).
 *
 * 시각의 출처 — 시각 문구를 하드코딩하지 않는다(07:00 고정 금지, PRD §15 D26 계절별)
 * - **발행** = 그 발행일의 첫 발행 실행이 끝난 시각. `data/runs.json`(prod)의 collect 실행 중 status가 success·partial이고
 *   startedAt의 KST 날짜가 발행일인 것(collect의 발행일 = `kstDate(startedAt)`)의 가장 이른 finishedAt. 검증·빌드가 실패한 실행은
 *   status failed로 남아 빠진다(PRD §15 D49) — success·partial 실행은 그 발행일 파일을 게시한 실행이다(발행 게이트가 그날 파일을 요구).
 * - **업데이트** = 그 호의 데이터가 마지막으로 갱신·확인된 시각. 위 실행들의 가장 늦은 finishedAt과 뉴스 파일 generatedAt
 *   ("파일을 마지막으로 쓴 시각") 중 늦은 값. 다시 돌린 실행이 새 카드 없이 끝나도(파일을 다시 쓰지 않음) 그 실행의 확인 시각이 된다.
 * - runs.json에 그 발행일 실행이 없으면(기록 보존 기간 밖 등) 둘 다 뉴스 파일 generatedAt.
 * 발행 ≤ 업데이트가 늘 성립한다. 표시는 KST HH:MM(src/lib/time.ts formatKst).
 */
import type { LateWindow } from "@/lib/issue-late";
import type { NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";
import { FIRST_ISSUE_DATE } from "@/lib/site";
import {
  daysBetween,
  kstDate,
  kstDayRangeUtc,
  publishSlot,
  PUBLISH_GRACE_MINUTES,
  shiftDate,
} from "@/lib/time";

/**
 * 발행일(KST "YYYY-MM-DD")의 호수. 창간일(`FIRST_ISSUE_DATE`) = 제 1호, 결호가 나도 날짜만큼 늘어난다(D29).
 * 창간일 전 날짜(테스트 픽스처 등)는 호수가 없다 → `null`.
 */
export function issueNumber(date: string): number | null {
  const n = daysBetween(FIRST_ISSUE_DATE, date) + 1;
  return n >= 1 ? n : null;
}

/** 마스트헤드·뒤표지에 싣는 호 정보 — 시각은 모두 UTC ISO(표시할 때 KST로 바꾼다) */
export interface IssueMeta {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** 제 N호 — 창간일 전이면 null */
  no: number | null;
  /** 발행 시각(첫 발행 실행이 끝난 시각) */
  publishedAt: string;
  /** 업데이트 시각(마지막 발행 실행이 끝난 시각 또는 파일을 마지막으로 쓴 시각 중 늦은 값) */
  updatedAt: string;
}

/** 그 발행일 호를 게시한 실행인가 — prod collect, success·partial, 발행일 = startedAt의 KST 날짜(5줄 자리 오류 판정도 쓴다 — brief-slot.ts) */
export function isIssuePublishingRun(run: RunLog, date: string): boolean {
  return (
    run.env === "prod" &&
    run.job === "collect" &&
    (run.status === "success" || run.status === "partial") &&
    kstDate(run.startedAt) === date
  );
}

/** 뉴스 파일(그 호)과 실행 기록으로 호 정보를 만든다(머리 주석의 규칙) */
export function issueMeta(
  news: Pick<NewsFile, "date" | "generatedAt">,
  runs: readonly RunLog[],
): IssueMeta {
  const finished = runs
    .filter((run) => isIssuePublishingRun(run, news.date))
    .map((run) => run.finishedAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const updatedAt = [...finished, news.generatedAt].reduce((late, iso) =>
    Date.parse(iso) > Date.parse(late) ? iso : late,
  );
  return {
    date: news.date,
    no: issueNumber(news.date),
    publishedAt: finished[0] ?? news.generatedAt,
    updatedAt,
  };
}

/** 발행 지연 안내가 내다보는 날수(`issueLateWindows`) — 그 뒤는 모두 늦음(src/lib/issue-late.ts) */
export const ISSUE_LATE_HORIZON_DAYS = 14;

/**
 * 발행 지연 안내 구간(M1-37 — DESIGN §9.3 상태 화면 ③, PRD §15 D26·D48·D49). 이 빌드의 최신 호가 `latestDate`(KST 발행일)일 때,
 * 그다음 날부터 `days`일 동안 날마다 **[그날 공개 목표 + 15분, 다음 날 KST 00:00)** — 그날 호가 나왔어야 하는데 이 빌드에는 없는 시간.
 * 공개 목표는 계절별(`publishSlot` — 여름 07:00 · 겨울 07:30, 발행일 00:00 KST의 유럽 서머타임 여부)이고 허용 지연은
 * `PUBLISH_GRACE_MINUTES`(D48 ②). 자정부터 목표 + 15분 전까지는 늦음이 아니다(구간 밖). 최신 호 당일은 구간이 없다(오늘 호가 있다).
 * 예) "2026-10-24" → 첫 구간 10-25(일, 전환일 — 여름) [10-24T22:15Z, 10-25T15:00Z) · 둘째 10-26(월, 겨울) [10-25T22:45Z, 10-26T15:00Z)
 * 값은 UTC epoch ms(브라우저가 `Date.now()`와 바로 비교 — 시간대 계산을 브라우저에서 하지 않는다).
 */
export function issueLateWindows(
  latestDate: string,
  days: number = ISSUE_LATE_HORIZON_DAYS,
): LateWindow[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`내다볼 날수는 1 이상 정수여야 함: ${days}`);
  }
  const graceMs = PUBLISH_GRACE_MINUTES * 60_000;
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(latestDate, i + 1);
    const from = Date.parse(publishSlot(date).publishTarget) + graceMs;
    const to = Date.parse(kstDayRangeUtc(date).end);
    return [from, to] as const;
  });
}
