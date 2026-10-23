/**
 * 5줄 자리 상태 — 그 호에 브리핑 블록을 어떻게 싣는가 (PRD DR-07 오류 상태 · §15 D38, DESIGN.md §9.3 상태 화면 ③, plan M1-37 — M1-32 이월)
 *
 * 순수 함수(파일 읽기는 src/lib/data/brief.ts `loadBriefSlot`).
 * - `brief` — 그 호의 브리핑 파일이 있다(`data/briefs/{발행일}.json`) → 5줄·S4·비시즌 블록.
 * - `missing` — **사실이 확인되는 오류 상태**: 파일이 없는데 ① 그 호가 첫 브리핑 파일 날짜 뒤이고(D38 — 브리핑 파일이 생긴 뒤의 호.
 *   날짜를 상수로 박지 않고 data/briefs 목록에서 잡는다) ② `data/runs.json`에 그 발행일을 게시한 실행(prod collect · success·partial ·
 *   startedAt의 KST 날짜 = 발행일 — src/lib/issue.ts `isIssuePublishingRun`, 발행 시각과 같은 규칙)이 있다. 그 실행이 뉴스는 게시했지만 브리핑 파일은 만들지
 *   못했다는 뜻이다 — 정형 입력 없음(football-data 실패·키 없음·설정 읽기 실패 — scripts/lib/brief-file.ts `planBriefPublish` no-input),
 *   템플릿 줄 0, 파일 쓰기 실패 중 하나다. **원인은 실행 기록에 남지 않으므로 화면은 원인을 쓰지 않는다**(CLAUDE §1-7).
 *   경기가 없던 날은 `empty` 파일이 있고(S4), 같은 날 재실행이 유지한 브리핑도 파일이 있으므로 여기에 들지 않는다.
 * - `none` — 블록을 싣지 않는다: D38 전 호(2026-10-12~14), 브리핑 파일이 아직 하나도 없는 저장소, 실행 기록이 없는 호(보존 기간 밖 등 —
 *   확인되지 않으면 오류라고 말하지 않는다).
 */
import { isIssuePublishingRun } from "@/lib/issue";
import type { BriefFile } from "@/lib/schema/brief";
import type { RunLog } from "@/lib/schema/run";

export type BriefSlot =
  { kind: "brief"; brief: BriefFile } | { kind: "missing" } | { kind: "none" };

/** 머리 주석의 규칙. `briefDates` = data/briefs 파일 날짜 전부(순서 무관) */
export function briefSlotOf(input: {
  date: string;
  brief: BriefFile | null;
  briefDates: readonly string[];
  runs: readonly RunLog[];
}): BriefSlot {
  const { date, brief, briefDates, runs } = input;
  if (brief) return { kind: "brief", brief };
  if (briefDates.length === 0) return { kind: "none" };
  const first = briefDates.reduce((a, b) => (b < a ? b : a));
  if (date <= first) return { kind: "none" };
  return runs.some((run) => isIssuePublishingRun(run, date))
    ? { kind: "missing" }
    : { kind: "none" };
}
