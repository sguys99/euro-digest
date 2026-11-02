/**
 * 주간 작업 단계 등록 (M3-06 — PRD FR-90, §10 운영 흐름 '월요일 weekly.yml', CLAUDE.md §6.1).
 *
 * `npm run weekly`(scripts/weekly.ts → scripts/lib/weekly-run.ts runWeeklyStages)는 아래 `WEEKLY_STAGES`를 **선언 순서대로 하나씩**
 * 돌린다(동시 실행 안 함 — LLM 배치·데이터 API 한도와 같은 data/ 파일을 나눠 쓰기 때문). 한 단계의 실패(예외·시간 초과)는 그 단계만
 * 실패로 남기고 다음 단계로 간다(단계별 실패 격리).
 *
 * 단계를 꽂는 방법 (M3-07·M3-08·M4-06·M5-09 담당)
 *   1. 단계 함수를 따로 파일에 만든다: `export async function runKoreanWeekly(ctx: WeeklyStageContext): Promise<WeeklyStageReport>`
 *      (`import type { WeeklyStageContext, WeeklyStageReport } from "./weekly-stages"` — 타입만 가져오면 순환 import가 없다)
 *   2. 아래 표의 해당 항목 `run: null`을 그 함수로 바꾸고, `writes`(그 단계가 쓸 수 있는 저장소 상대 경로 — 파일 또는 폴더)를 채운다.
 *   3. 단계 안에서 지킬 것
 *      - `ctx.dry`면 data/에 쓰지 않는다(출력만 — `ctx.print`). LLM을 부르는 단계는 dry여도 부른 결과를 `ctx.llm.addResults`에 넣는다
 *        (CLAUDE.md §1-4 — dry여도 비용은 기록된다).
 *      - LLM은 `ctx.llm.createClient()`로만 만든다(모드·모델이 실행 설정과 같다). 호출 **전에** 최악값 예상으로 `ctx.budget.check()`를
 *        부르고 `allowed`가 false면 LLM 없이 진행한다(FR-27). 결과는 성공·실패 모두 `ctx.llm.addResults`에 넣는다 — 실행 기록
 *        (data/runs.json · runs-dev.json, job "weekly")의 토큰·비용은 여기서 합산된다. 같은 실행의 앞 단계 비용도 `check`에 더해진다.
 *      - 데이터 API를 부르면 `ctx.apiCalls.add({ footballData, apiFootball })`로 센다(API-Football 일일 카운터 — D27).
 *      - 오래 걸리는 대기(배치 폴링 등)는 `ctx.signal`을 본다 — 시간 상한(`timeoutMs`)이 지나면 abort되고 단계는 실패로 기록된다.
 *      - 산출물 파일은 **끝에 한 번에** 쓴다(중간 실패로 반쯤 쓴 파일이 남지 않게). 실패하면 던진다 — 러너가 잡는다.
 *        Actions에서는 실패한 단계의 `writes` 경로를 커밋 전에 main 상태로 되돌린다(weekly.yml '실패 단계 산출물 되돌리기' — D49 정신:
 *        발행 산출물은 그 단계가 성공하고 검증·빌드가 통과할 때만 커밋).
 *      - 이 단계가 "이미 했다"고 판단할 근거(예: 그 주차 파일)가 있으면 `ctx.force`가 아닐 때 건너뛰고 `{ note: "..." }`를 돌려준다.
 *   4. data/runs.json은 러너가 쓴다 — `writes`에 넣지 않는다(tests/weekly-run.test.ts가 확인).
 *
 * 실행 가드(같은 주 재실행)는 단계가 아니라 러너가 본다 — 그 주차 한국 선수 주간 리포트(`WEEKLY_REPORT_DIR/<주차>.json`)가 이미
 * 커밋돼 있으면 force 없이는 실행 전체를 건너뛴다(weekly-run.ts decideWeeklyGuard).
 */
import type { BudgetCheck, costFromResults } from "./cost";
import type { LlmClient } from "./llm";
import type { LlmMode } from "./cli-args";
import type { Logger } from "./logger";
import type { FetchLike } from "./rss";
import type { RunEnv, RunLog, RunSource } from "@/lib/schema";

import { ANALYSIS_TEAMS_DIR, runAnalysisBlogs } from "./analysis-blogs-stage";
import { TEAM_PROFILE_TEAMS_DIR, runTeamProfiles } from "./team-profile-stage";
import { WEEKLY_REPORT_DIR } from "./weekly-kr";
import { runKoreanWeekly } from "./weekly-kr-stage";

/** 비용 집계에 넣는 LLM 결과 1건 — llm.ts LlmResult를 그대로 넣을 수 있다 */
export type WeeklyBillableResult =
  Parameters<typeof costFromResults>[1] extends Iterable<infer T> ? T : never;

/** 단계에 넘기는 실행 문맥 — I/O는 모두 여기로 주입된다(단계는 process.env·현재 시각을 직접 읽지 않는다) */
export interface WeeklyStageContext {
  /** 저장소 루트(절대 경로) */
  rootDir: string;
  /** data/ 폴더(절대 경로) */
  dataDir: string;
  /** 대상 ISO 주차 "YYYY-WW"(지난 월~일 — FR-90). 기본 = 실행 시작 KST 날짜가 속한 주의 바로 앞 주 */
  week: string;
  /**
   * 그 주차의 **UTC** 월 00:00 ~ 일 23:59:59.999 (UTC ISO — src/lib/time.ts isoWeekRangeUtc, PRD §15 D65 ① 경기일 기준).
   * 정기 실행(월 08:00 KST = 일 23:00 UTC)에는 끝이 아직 지나지 않았을 수 있다 — 원장(종료 경기만) 기준으로 집계한다
   */
  weekRange: { from: string; to: string };
  env: RunEnv;
  llmMode: LlmMode;
  /** data/에 쓰지 않고 출력만 */
  dry: boolean;
  /** 수동 재실행 — 단계의 '이미 했음' 판단도 무시하고 다시 만든다 */
  force: boolean;
  runId: string;
  /** 실행 시작(UTC ISO) — 실행 기록 startedAt과 같다 */
  startedAt: string;
  now: () => Date;
  /** 이 단계의 시간 상한 — 지나면 abort(사유 WeeklyStageTimeoutError) */
  signal: AbortSignal;
  /** scope weekly, 필드 stage가 붙은 로거 — 이벤트 이름은 `weekly.<단계>.<동작>` */
  logger: Logger;
  /** 사람이 읽는 출력(dry 결과 등) */
  print: (text: string) => void;
  llm: {
    /** 실행 설정의 모델(LLM_MODEL) */
    model: string;
    /** LLM 클라이언트 — 실행 설정의 모드(live·mock)·모델. 부르지 않으면 만들지 않는다 */
    createClient: () => LlmClient;
    /** LLM 결과(성공·실패 모두)를 실행 비용에 더한다 */
    addResults: (results: Iterable<WeeklyBillableResult>) => void;
    /** 이 실행(앞 단계 포함)이 지금까지 쓴 비용(USD) */
    costSoFar: () => number;
  };
  budget: {
    /**
     * 비용 가드(FR-27, CLAUDE.md §6.2) — 이번 호출의 최악값 예상(USD)에 이 실행이 이미 쓴 비용을 더해 runs.json + runs-dev.json
     * 합산 사용액·일/월 예산과 비교한다(cost.ts checkBudgetFromFiles — 일 예산은 prod 실행이면 prod만, 월은 prod+dev, D43).
     * runs 파일을 읽지 못하거나 예산 설정이 잘못됐으면 던진다(fail-closed — 그 단계 실패로 격리된다).
     */
    check: (estimatedUsd: number) => Promise<BudgetCheck>;
  };
  apiCalls: {
    add: (calls: Partial<RunLog["apiCalls"]>) => void;
  };
  /**
   * 외부 HTTP(피드 받기 — M3-08 분석 블로그). 진입점(scripts/weekly.ts)이 전역 fetch와 User-Agent(rss.ts feedUserAgent — CONTACT_EMAIL)를
   * 넣는다. 주입하지 않은 실행(테스트 등)은 요청하면 거부되는 fetch다.
   */
  http: {
    fetch: FetchLike;
    userAgent: string;
  };
  /** 소스별 결과(RunLog.sources 형식)를 실행 기록(job weekly)에 남긴다 — 분석 블로그 주간 건강도의 근거(analysis-reading.ts) */
  sources: {
    add: (entries: Iterable<RunSource>) => void;
  };
}

/** 단계가 돌려주는 결과(선택) — 구조화 로그·Step Summary에 남는다 */
export interface WeeklyStageReport {
  /** 실제로 쓴(dry면 쓸) 파일 — 저장소 상대 경로. `writes` 밖이면 경고 */
  outputs?: readonly string[];
  /** 건수(예: rows·teams·posts) */
  counts?: Readonly<Record<string, number>>;
  /** 짧은 메모(예: "이미 발행 — 건너뜀") */
  note?: string;
}

export type WeeklyStageRun = (
  ctx: WeeklyStageContext,
) => Promise<WeeklyStageReport | void>;

export interface WeeklyStage {
  /** 단계 id — 소문자·숫자·하이픈. 로그 이벤트·실패 단계 출력·이슈 메모에 쓴다 */
  id: string;
  /** 사람이 읽는 이름 */
  title: string;
  /** 구현 작업 ID(docs/plan.md) */
  task: string;
  /** LLM 호출 지점(#2 팀 한줄평 · #3 한국 선수 주간 총평 — Batches, D28)인가. 실행 시작 월 사용량 알림을 켤지 정한다 */
  llm: boolean;
  /** 시간 상한(ms). 합계는 weekly.yml 주간 작업 단계의 timeout-minutes 안에 들어가야 한다(tests/weekly-workflow.test.ts) */
  timeoutMs: number;
  /**
   * 이 단계가 쓸 수 있는 저장소 상대 경로(파일 또는 폴더, `data/`·`public/` 아래). 단계가 실패하면 Actions가 커밋 전에 이 경로를
   * main 상태로 되돌린다. data/runs.json 금지(러너가 쓴다).
   */
  writes: readonly string[];
  /**
   * 다른 단계와 함께 쓰는 경로(이 단계 `writes`에 있는 것만). 등록 검사는 writes 겹침을 막지만, **겹치는 두 단계가 모두 그 경로를
   * sharedWrites에 적었으면** 허용한다(M4-06 — analysis-blogs·team-profiles가 data/teams를 함께 씀). 대가: 한 단계가 실패하면 Actions가
   * 그 경로를 main 상태로 되돌리므로 **같은 실행에서 다른 단계가 바꾼 내용도 함께 사라진다**(그 주 갱신이 한 주 늦어질 뿐 이전 값은
   * 남는다). 공유 단계는 팀 단위 실패를 단계 실패로 올리지 않아 되돌림을 줄인다.
   */
  sharedWrites?: readonly string[];
  /** 단계 함수 — null이면 미구현(로그만 남기고 건너뜀, 성공 처리) */
  run: WeeklyStageRun | null;
}

/** 한국 선수 주간 리포트 폴더 — 실행 가드가 `<주차>.json`이 있는지 본다(정의는 weekly-kr.ts — 단계 모듈과 순환 import를 피한다) */
export { WEEKLY_REPORT_DIR } from "./weekly-kr";

const MINUTE_MS = 60_000;

/**
 * 등록된 단계(순서 = 실행 순서). 시간 상한 합계 30분 — weekly.yml 주간 작업 단계 상한(35분) 안.
 *   ① 한국 선수 주간 리포트(M3-07 — 표·MVP 코드 계산 + 주간 총평 Batches 1회, FR-90~92)
 *   ② 분석 블로그 주 1회 수집(M3-08 — LLM 없음, FR-10·FR-57)
 *   ③ 팀 프로필(M4-06 — 팀 한줄평+강점/약점 20팀 묶음 Batches, 지시문 캐싱 켬, D28 — data/teams를 ②와 공유)
 *   ④ 운영 리포트(M5-09 — 비용·성공률·소스 건강도·미등록 고유명사 이슈, FR-155). 이슈를 만들려면 토큰이 필요하다 — 이 단계
 *      (서드파티 코드가 도는 곳)에 쓰기 토큰을 넘기지 말고, collect.yml '실행 이슈 보고'처럼 사건 파일 → 다음 워크플로 단계로 낸다.
 */
export const WEEKLY_STAGES: readonly WeeklyStage[] = [
  {
    id: "korean-weekly",
    title: "한국 선수 주간 리포트",
    task: "M3-07",
    llm: true,
    timeoutMs: 10 * MINUTE_MS,
    writes: [WEEKLY_REPORT_DIR],
    run: runKoreanWeekly, // weekly-kr-stage.ts — 표·MVP(코드) + 총평 Batches 1회(+재시도 1회) → 실패면 템플릿
  },
  {
    id: "analysis-blogs",
    title: "분석 블로그 수집",
    task: "M3-08",
    llm: false,
    timeoutMs: 5 * MINUTE_MS,
    // 팀 파일의 reading만 바꾼다. 실패하면 Actions가 data/teams를 main(그날 일일 수집 커밋)으로 되돌린다 — team-profiles와 공유
    // (sharedWrites — 한쪽 실패 시 같은 실행의 다른 쪽 갱신도 되돌아간다)
    writes: [ANALYSIS_TEAMS_DIR],
    sharedWrites: [ANALYSIS_TEAMS_DIR],
    run: runAnalysisBlogs, // analysis-blogs-stage.ts — 주 1회 RSS(LLM 없음) → 원제목으로 팀 찾기 → data/teams reading 갱신
  },
  {
    id: "team-profiles",
    title: "팀 프로필",
    task: "M4-06",
    llm: true,
    timeoutMs: 12 * MINUTE_MS,
    // 팀 파일의 profile만 바꾼다(analysis-blogs와 data/teams 공유 — sharedWrites)
    writes: [TEAM_PROFILE_TEAMS_DIR],
    sharedWrites: [TEAM_PROFILE_TEAMS_DIR],
    run: runTeamProfiles, // team-profile-stage.ts — 20팀 묶음 Batches 1회(+실패 팀 재시도 1회), 지시문 캐싱 → 실패 팀은 이전 값·null
  },
  {
    id: "ops-report",
    title: "운영 리포트",
    task: "M5-09",
    llm: false,
    timeoutMs: 3 * MINUTE_MS,
    writes: [],
    run: null,
  },
];
