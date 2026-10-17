/**
 * 수집 실행의 브리핑 마감과 단계 예산 (M1-47 — PRD §15 D26·D28, FR-26) — I/O 없는 순수 함수.
 *
 * 브리핑 마감 = 발행일 슬롯(src/lib/time.ts `publishSlot`)의 공개 목표 − 10분(여름 06:50 · 겨울 07:20 KST). 이 시각까지
 * 경기 데이터(football-data·API-Football 브리핑 몫)를 받고 LLM 단건이 끝나야 한다 — 마감 뒤 10분은 검증·빌드·커밋·배포 몫이다.
 * 마감까지 성공하지 못하면 코드 템플릿(brief-template.ts, M1-19)을 게시한다(collect-run.ts 브리핑 단계 — M1-45).
 *
 * 마감 기준 (`planCollectDeadlines`)
 *   - slot: 그날 슬롯의 브리핑 마감까지 `MIN_SLOT_WINDOW_MS`(3분) 이상 남은 실행 — 정시 실행(여름 06:30 → 마감까지 약
 *     18분, 겨울 07:10 → 약 8분 — Actions 준비 1.5~2분을 뺀 값)과 06:00 전 개발 실행. 마감은 슬롯의 마감 그대로.
 *   - off-slot: 마감이 이미 지났거나 3분도 남지 않은 실행 — 수동 재실행(force 포함)·늦게 시작한 백업(겨울 07:20 schedule은
 *     시작이 곧 마감)·오후 개발 실행. 공개 목표를 이미 놓쳤거나 상관없는 실행이라 마감을 지키려고 브리핑을 버리지 않고,
 *     **실행 시작 + `OFF_SLOT_BRIEF_WINDOW_MS`(8분)**를 마감으로 쓴다 — 정시 겨울 실행과 같은 크기의 창(아래 상수 예산이
 *     줄지 않는 최소 창)이다. 그대로 슬롯 마감을 쓰면 같은 날 다시 돌린 실행은 늘 템플릿이 되어 아침의 LLM 브리핑을 덮게 된다.
 *     3분 기준(D41): football-data 단계 예산(150초) + 슬롯 판정용 LLM 몫(`SLOT_LLM_MIN_MS` 30초)이 들어가지 않으면 그 마감으로는
 *     브리핑을 만들 수 없다. 시도마다의 최소 남은 시간(`BRIEF_LLM_MIN_ATTEMPT_MS` 40초 — M1-45)과는 따로 둔다(3분 창 판정 불변).
 *
 * 단계 예산 (`stageBudgets` — 단계 시작 시점에 남은 시간 R로 계산, 단계 시작 기준 상대 ms)
 *   - football-data = min(150초, R). 템플릿 브리핑(M1-19)도 이 데이터로 만들므로 LLM 몫을 떼지 않는다 — 데이터가 늦으면 LLM
 *     몫이 줄어 템플릿이 되고(FR-26), 데이터를 자르면 템플릿조차 만들 수 없다. slot 실행은 R ≥ 3분이라 실제로는 늘 150초다.
 *   - API-Football 브리핑 컷오프 = min(4분, R − `BRIEF_LLM_RESERVE_MS`(4분), 0 이상). 득점자는 있으면 좋은 입력이라 LLM 몫을
 *     먼저 떼 둔다. 0이면 상세를 기다리지 않고 득점자 없이 진행한다(날짜 조회 2건 뒤 첫 판정에서 신호).
 *   - API-Football 단계 = min(6분, R). 브리핑 뒤 나머지(원장·이월용)가 마감 뒤 10분(빌드·배포 몫)을 쓰지 않게 브리핑 마감에서
 *     멈추고, 못 받은 경기는 이월(data/cache/af-pending.json)로 다음 실행이 받는다.
 *   - LLM 단건 = 브리핑 마감까지(`callSingle` 상대 예산 — M1-45: 시도마다 남은 시간이 `BRIEF_LLM_MIN_ATTEMPT_MS`(40초) 이상일
 *     때만 보내고, HTTP 요청 타임아웃 = min(60초, 마감 − 현재), 429·5xx 재시도 대기도 (대기 + 40초)가 마감 안일 때만 — M0-36
 *     확인 ①). FR-29 출력 재시도(BRIEF_MAX_ATTEMPTS 2)도 같은 판정을 거친다.
 *   상수 상한(150초·4분·6분)은 API 호출 계획에서 나온 값이라 그대로 두고(providers/football-data.ts·api-football-stage.ts),
 *   마감은 그보다 짧아질 때만 예산을 줄인다 — 정시 실행(R ≥ 8분)은 M1-47 전과 같은 예산이다.
 *
 * `BRIEF_LLM_RESERVE_MS`(4분) 근거: ① LLM 단건 몫 — 보통은 M0-30 실측 지연 2~8.5초(FR-29 출력 재시도 1회를 더해도 20초 안팎)
 * ② API-Football 컷오프 판정은 요청 시작 전에만 해서 진행 중 요청이 신호를 늦출 수 있는 최악 약 130초(api-football-stage.ts 머리
 * 주석 — 분당 가드 61초 + 타임아웃 15초 + 분당 초과 재시도 61초 + 15초 − 슬롯 21.5초). 겨울 정시(07:12 단계 시작)에서는
 * 4분 + 4분 = 8분으로 M1-48a 설계(시작 + 4분 컷오프 = 07:16)와 같은 시각이 나온다.
 * 최악값(마감 없이 상수만 더하면 4분을 넘는다): 요청 타임아웃 60초(llm.ts) × 2회(첫 호출 + FR-29 재시도) + 429·5xx 백오프(1·2초)
 * + 컷오프 지연 약 130초 ≈ 253초 > 240초. **M1-45부터는 LLM 단계가 구조적으로 마감 안에서 끝난다** — 요청마다 타임아웃이 마감까지
 * 남은 시간으로 줄고(마감에 걸린 요청은 끊겨 템플릿 — FR-26), 남은 시간이 40초 미만이면 첫 호출·재시도·전송 재시도를 보내지
 * 않는다. 그래서 컷오프가 최악으로 늦어(약 130초) LLM 몫이 약 110초로 줄어도 브리핑 단계는 마감 + 판정·게시(수 ms)에 끝나고,
 * 줄어든 몫만큼 첫 시도의 타임아웃(최대 60초)과 재시도 여부가 정해진다(마감 초과 0 — M1-47 시점의 '요청 1건이 최대 60초 넘김'은
 * 해소). 실측 지연(v0.4 골든 — 출력 4,183~6,729토큰에 18~29초, 약 230토큰/초)과 출력 상한 8,192(D53 — 약 36초)가 40초 최소 시도
 * 안에 들어간다(보낸 요청이 출력 상한 때문에 끊기지 않는다 — 끊기는 것은 응답 지연이 비정상일 때뿐).
 */
import {
  formatKst,
  parseUtcIso,
  publishSlotAt,
  type PublishSlot,
} from "@/lib/time";

import {
  API_FOOTBALL_BRIEF_CUTOFF_MS,
  API_FOOTBALL_STAGE_BUDGET_MS,
} from "./api-football-stage";
import { FOOTBALL_DATA_STAGE_BUDGET_MS } from "./providers/football-data";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 브리핑 마감 전 LLM 몫 — API-Football 브리핑 컷오프를 이만큼 앞당긴다(근거는 파일 머리 주석) */
export const BRIEF_LLM_RESERVE_MS = 240_000;

/**
 * LLM 단건을 한 번 시도하려면 필요한 최소 남은 시간 — 첫 호출·FR-29 재시도·429·5xx 전송 재시도 모두 이 값으로 판정한다(M1-45,
 * 오케스트레이터 결정 2026-10-17 — 슬롯 판정 30초와 분리). 근거: 실측 출력 속도 약 230토큰/초(v0.4 골든 — 4,183토큰 18.0초 ·
 * 6,729토큰 28.7초)에서 출력 상한 8,192(D53)는 약 36초 → 40초면 보낸 요청이 출력 상한 때문에 끊기지 않는다(끊긴 요청은 쓴 토큰만
 * 과금되고 템플릿이 된다).
 */
export const BRIEF_LLM_MIN_ATTEMPT_MS = 40_000;

/**
 * 슬롯 판정용 LLM 몫(D41 — 3분 창의 한 항, M1-47 값 그대로). 시도 최소 시간(BRIEF_LLM_MIN_ATTEMPT_MS)과 일부러 분리한다 — 정시·
 * off-slot 판정 기준(3분)은 바꾸지 않는다.
 */
export const SLOT_LLM_MIN_MS = 30_000;

/**
 * 슬롯 마감을 쓰는 최소 남은 시간 — football-data 단계 예산(150초) + 슬롯 판정용 LLM 몫(30초) = 3분(D41).
 * 이보다 적게 남은 실행은 off-slot(시작 + 8분)으로 본다.
 */
export const MIN_SLOT_WINDOW_MS =
  FOOTBALL_DATA_STAGE_BUDGET_MS + SLOT_LLM_MIN_MS;

/**
 * off-slot 실행의 브리핑 창 — 실행 시작부터 브리핑 마감까지 8분 = API-Football 브리핑 컷오프(4분) + LLM 몫(4분).
 * 이 창이면 상수 예산(football-data 150초 · 컷오프 4분 · API-Football 단계 6분)이 줄지 않는다.
 */
export const OFF_SLOT_BRIEF_WINDOW_MS =
  API_FOOTBALL_BRIEF_CUTOFF_MS + BRIEF_LLM_RESERVE_MS;

// ─── 마감 ────────────────────────────────────────────────────────────────

/** slot = 그날 슬롯의 브리핑 마감 · off-slot = 실행 시작 + 8분(수동·지연 실행) */
export type DeadlineBasis = "slot" | "off-slot";

export interface CollectDeadlines {
  basis: DeadlineBasis;
  /** 실행 시작 시각의 KST 발행일 슬롯(계절·수집 시작·공개 목표) */
  slot: PublishSlot;
  /** 이번 실행의 브리핑 마감(UTC ISO) */
  briefDeadline: string;
}

/**
 * 실행 시작(UTC ISO) → 이번 실행의 브리핑 마감. 기준은 파일 머리 주석.
 * 예) 2026-10-25T22:12:00Z(겨울 첫날 07:12 KST) → slot, 2026-10-25T22:20:00.000Z(07:20 KST)
 *     2026-10-25T22:21:00Z(07:21 KST — 백업 schedule) → off-slot, 2026-10-25T22:29:00.000Z
 */
export function planCollectDeadlines(startedAt: string): CollectDeadlines {
  const start = parseUtcIso(startedAt).getTime();
  const slot = publishSlotAt(startedAt);
  if (Date.parse(slot.briefDeadline) - start >= MIN_SLOT_WINDOW_MS) {
    return { basis: "slot", slot, briefDeadline: slot.briefDeadline };
  }
  return {
    basis: "off-slot",
    slot,
    briefDeadline: new Date(start + OFF_SLOT_BRIEF_WINDOW_MS).toISOString(),
  };
}

/** 마감까지 남은 ms(지났으면 음수) — `now`는 호출부가 주입한 벽시계 */
export function msUntil(deadlineIso: string, now: Date): number {
  return parseUtcIso(deadlineIso).getTime() - now.getTime();
}

// ─── 단계 예산 ───────────────────────────────────────────────────────────

/** 단계 시작 기준 상대 예산(ms) — 단계 시계(주입 가능)의 시작 값에 더해 마감으로 쓴다 */
export interface StageBudgets {
  /** football-data 단계 마감 */
  footballDataMs: number;
  /** API-Football 브리핑 몫 컷오프(brief 계층 신호) */
  apiFootballBriefCutoffMs: number;
  /** API-Football 단계 마감(브리핑 뒤 나머지 포함) */
  apiFootballStageMs: number;
}

/**
 * 단계 시작 시점에 브리핑 마감까지 남은 시간(ms) → 단계별 예산. 규칙은 파일 머리 주석.
 * 예) 18분(여름 정시)·8분(겨울 정시) → { 150초, 4분, 6분 } · 5분 → { 150초, 1분, 5분 } · 0 이하 → 모두 0
 */
export function stageBudgets(msUntilBriefDeadline: number): StageBudgets {
  const remaining = Math.max(0, msUntilBriefDeadline);
  return {
    footballDataMs: Math.min(FOOTBALL_DATA_STAGE_BUDGET_MS, remaining),
    apiFootballBriefCutoffMs: Math.min(
      API_FOOTBALL_BRIEF_CUTOFF_MS,
      Math.max(0, remaining - BRIEF_LLM_RESERVE_MS),
    ),
    apiFootballStageMs: Math.min(API_FOOTBALL_STAGE_BUDGET_MS, remaining),
  };
}

// ─── 로그 ────────────────────────────────────────────────────────────────

/**
 * `collect.deadline` 구조화 로그 필드 — 계절·기준·마감(UTC·KST)·실행 시작 시점의 남은 시간과 단계 예산.
 * 단계 예산은 단계마다 시작 시점에 다시 계산하므로(뉴스와 병렬이라 거의 같다) 여기 값은 참고용이다.
 */
export function deadlineLogFields(
  deadlines: CollectDeadlines,
  startedAt: string,
): Record<string, string | number> {
  const remainingMs = Math.max(
    0,
    msUntil(deadlines.briefDeadline, parseUtcIso(startedAt)),
  );
  const budgets = stageBudgets(remainingMs);
  return {
    date: deadlines.slot.date,
    season: deadlines.slot.season,
    basis: deadlines.basis,
    briefDeadline: deadlines.briefDeadline,
    briefDeadlineKst: formatKst(deadlines.briefDeadline, "time"),
    publishTargetKst: formatKst(deadlines.slot.publishTarget, "time"),
    remainingMs,
    footballDataBudgetMs: budgets.footballDataMs,
    afBriefCutoffMs: budgets.apiFootballBriefCutoffMs,
    afStageBudgetMs: budgets.apiFootballStageMs,
  };
}
