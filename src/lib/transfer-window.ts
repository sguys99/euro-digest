/**
 * 이적 창 모드 판정 (PRD FR-105, plan M4-03) — I/O 없는 순수 함수. 화면(홈 이적 섹션 상단 배치 — M4-04)과 수집 파이프라인
 * (선별 가중 — scripts/lib/score.ts `transferWindowBoost`)이 같은 판정을 쓴다. 입력은 `configs/transfer-windows.json`의 `windows`
 * (zod 검증은 읽는 쪽 경계에서 — 화면 로더·scripts/lib/config-files.ts).
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────
 *   - 창 하나는 [opensAt, closesAt) — 개장 순간 포함, 마감 순간 제외. 시각은 UTC ISO 그대로 비교한다(리그 현지 시각 → UTC 변환은
 *     설정을 적을 때 끝낸다 — 서머타임 경계도 그때 반영된다. KST·유럽 시계 변환을 여기서 다시 하지 않는다).
 *   - **이적 창 모드 = 5대 리그 중 어느 한 리그라도 창이 열려 있으면 켜짐**(리그 합집합). 근거: PRD FR-105가 계절 단위 하나의 모드
 *     ("여름(6~9월 초)·겨울(1월) 이적 창 기간")로 적었고 — 여름 6월 중순 개장은 EPL·리그 1뿐이라 리그별 교집합이면 '6월'이 빠진다 —,
 *     홈 이적 섹션은 하나이며, 이적 기사는 사는 팀·파는 팀 리그가 다른 경우가 흔해(5대 리그 밖 구단 포함) 기사를 한 리그 창에
 *     묶기 어렵다. 리그별 차이는 개장·마감 며칠이라 리그별 가중의 이득이 작다. 리그별 정보(`open`)는 화면 표시용으로 함께 낸다.
 *   - **마감 뒤 유예**(사용자 결정 2026-11-02): 열린 창이 하나도 없어도 **마지막으로 닫힌 창의 closesAt부터
 *     `TRANSFER_WINDOW_GRACE_HOURS`(24시간) 안**이면 모드를 유지한다 — [closesAt, closesAt + 24h). 마감 직전 몇 시간과 마감 뒤 공식
 *     발표는 다음 아침 수집에 들어오기 때문이다(예: EPL 마감 02-01 23:00Z = 02-02 08:00 KST → 02-03 아침 발행까지 가중). 리그별
 *     마감이 엇갈리면 기준은 **모드가 끝난 시각**(합집합의 마지막 마감 = 가장 늦은 closesAt)이다 — 먼저 닫힌 리그의 마감부터 세지
 *     않는다(그때는 다른 리그 창이 열려 있어 유예가 아니라 열린 모드).
 *   - 남은 일수는 **KST 달력 날짜 차이**(`daysBetween(kstDate(at), kstDate(closesAt))`) — 화면 표시가 KST라 'D-n'도 KST 날짜로 센다.
 *     0 = 오늘(KST) 마감. 예) EPL 마감 2027-02-01T23:00Z(= 02-02 08:00 KST): 02-01 07:10 KST 기준 1, 02-02 07:10 KST 기준 0.
 *     유예 중에는 남은 일수가 없다(`daysLeft` null) — 화면은 `grace`·`closedAt`으로 '마감 직후'를 그린다.
 */
import type { CompId, TransferWindow } from "@/lib/schema";

import { daysBetween, kstDate, parseUtcIso } from "./time";

/** 마감 뒤 유예(시간) — 마지막 마감부터 이만큼 모드 유지(사용자 결정 2026-11-02) */
export const TRANSFER_WINDOW_GRACE_HOURS = 24;

const GRACE_MS = TRANSFER_WINDOW_GRACE_HOURS * 60 * 60 * 1000;

/** 판정에 쓰는 창 필드 — 설정 항목(`TransferWindow`) 그대로 넘겨도 된다 */
export type TransferWindowInput = Pick<
  TransferWindow,
  "comp" | "season" | "kind" | "opensAt" | "closesAt"
>;

/** 기준 시각에 열려 있는 리그 창 */
export interface OpenTransferWindow {
  comp: CompId;
  season: number;
  kind: TransferWindow["kind"];
  opensAt: string;
  closesAt: string;
  /** 마감까지 KST 달력 일수(0 = 오늘 마감) */
  daysLeft: number;
}

/** 기준 시각 뒤에 열릴 리그 창 */
export interface UpcomingTransferWindow {
  comp: CompId;
  season: number;
  kind: TransferWindow["kind"];
  opensAt: string;
  closesAt: string;
  /** 개장까지 KST 달력 일수(0 = 오늘 개장) */
  daysUntil: number;
}

export interface TransferWindowState {
  /** 이적 창 모드 — 어느 리그든 창이 열려 있거나(`open`) 마감 뒤 유예 중(`grace`) */
  active: boolean;
  /** 마감 뒤 유예 중 — 열린 창은 없고 마지막 마감(`closedAt`)부터 24시간 안 */
  grace: boolean;
  /** 열린 리그 창 — 마감 이른 순 → comp → season */
  open: OpenTransferWindow[];
  /** 모드가 끝나는 시각 = 열린 창 중 가장 늦은 마감(열린 창이 없으면 — 유예 중 포함 — null) */
  closesAt: string | null;
  /** 모드 끝까지 KST 달력 일수(열린 창이 없으면 — 유예 중 포함 — null) */
  daysLeft: number | null;
  /** 유예 중일 때 방금 끝난 모드의 마감 시각(= 마지막으로 닫힌 창의 closesAt), 아니면 null */
  closedAt: string | null;
  /** 유예 중일 때 유예 끝(= closedAt + 24시간, 이 순간부터 모드 아님), 아니면 null */
  graceEndsAt: string | null;
  /** 유예 중일 때 마지막 마감 시각에 닫힌 리그(comp 순), 아니면 [] */
  closedComps: CompId[];
  /** 아직 열리지 않은 리그 창 — 개장 이른 순 → comp → season(모드 여부와 무관, 지난 창은 없음) */
  upcoming: UpcomingTransferWindow[];
}

const ms = (iso: string): number => parseUtcIso(iso).getTime();

/** 창 하나가 시각 `at`(UTC ISO)에 열려 있는가 — [opensAt, closesAt) */
export function isWindowOpenAt(
  window: Pick<TransferWindowInput, "opensAt" | "closesAt">,
  at: string,
): boolean {
  const t = ms(at);
  return ms(window.opensAt) <= t && t < ms(window.closesAt);
}

/**
 * 마감 뒤 유예 판정 — 열린 창이 없고, `at` 이전에 닫힌 창 중 가장 늦은 closesAt부터 24시간 안이면 그 closesAt(ms), 아니면 null.
 * 열린 창이 있으면 유예가 아니다(열린 모드).
 */
function graceClosedMs(
  at: string,
  windows: readonly Pick<TransferWindowInput, "opensAt" | "closesAt">[],
): number | null {
  const t = ms(at);
  if (windows.some((w) => isWindowOpenAt(w, at))) return null;
  let last: number | null = null;
  for (const w of windows) {
    const c = ms(w.closesAt);
    if (c <= t && (last === null || c > last)) last = c;
  }
  return last !== null && t < last + GRACE_MS ? last : null;
}

/** 이적 창 모드인가 — 어느 리그든 창이 열려 있거나 마지막 마감 뒤 24시간 안이면 true(머리 주석 '규칙') */
export function isTransferWindowActive(
  at: string,
  windows: readonly Pick<TransferWindowInput, "opensAt" | "closesAt">[],
): boolean {
  return (
    windows.some((w) => isWindowOpenAt(w, at)) ||
    graceClosedMs(at, windows) !== null
  );
}

const byThen =
  <T extends { comp: string; season: number }>(key: (x: T) => number) =>
  (a: T, b: T): number =>
    key(a) - key(b) ||
    (a.comp < b.comp ? -1 : a.comp > b.comp ? 1 : 0) ||
    a.season - b.season;

/**
 * 기준 시각 `at`(UTC ISO)의 이적 창 상태 — 모드 여부·유예 여부·열린 리그·모드 마감과 남은 일수·다가오는 창.
 * 화면은 빌드 시각(발행일 아침)으로 부르고, 수집은 실행 시작 시각으로 부른다.
 */
export function transferWindowState(
  at: string,
  windows: readonly TransferWindowInput[],
): TransferWindowState {
  const t = ms(at);
  const today = kstDate(at);
  const open: OpenTransferWindow[] = [];
  const upcoming: UpcomingTransferWindow[] = [];
  for (const w of windows) {
    const base = {
      comp: w.comp,
      season: w.season,
      kind: w.kind,
      opensAt: w.opensAt,
      closesAt: w.closesAt,
    };
    if (isWindowOpenAt(w, at)) {
      open.push({ ...base, daysLeft: daysBetween(today, kstDate(w.closesAt)) });
    } else if (t < ms(w.opensAt)) {
      upcoming.push({
        ...base,
        daysUntil: daysBetween(today, kstDate(w.opensAt)),
      });
    }
  }
  open.sort(byThen((w) => ms(w.closesAt)));
  upcoming.sort(byThen((w) => ms(w.opensAt)));
  const last = open.reduce<OpenTransferWindow | null>(
    (acc, w) => (acc === null || ms(w.closesAt) > ms(acc.closesAt) ? w : acc),
    null,
  );
  const graceMs = graceClosedMs(at, windows);
  const closedAt = graceMs === null ? null : new Date(graceMs).toISOString();
  return {
    active: open.length > 0 || graceMs !== null,
    grace: graceMs !== null,
    open,
    closesAt: last?.closesAt ?? null,
    daysLeft: last?.daysLeft ?? null,
    closedAt,
    graceEndsAt:
      graceMs === null ? null : new Date(graceMs + GRACE_MS).toISOString(),
    closedComps:
      graceMs === null
        ? []
        : [
            ...new Set(
              windows
                .filter((w) => ms(w.closesAt) === graceMs)
                .map((w) => w.comp),
            ),
          ].sort(),
    upcoming,
  };
}
