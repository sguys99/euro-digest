/**
 * 주간 운영 리포트 — 순수 함수 (M5-09, PRD FR-155 "월요일 이슈로 지난주 비용·성공률·소스 건강도·미등록 고유명사 요약 — LLM 미사용,
 * 코드 생성", CLAUDE.md §6.3·§12).
 *
 * 입력(실행 기록·브리핑 파일·미등록 고유명사 파일)은 호출부가 읽어 넘긴다(scripts/lib/ops-report-stage.ts). 출력은 이슈 payload
 * (`ops-report` kind — 본문 틀·라벨·fingerprint는 scripts/lib/github-issues.ts `buildIssue`)다. LLM·네트워크·현재 시각을 쓰지 않는다
 * (`now`는 생성 시각 표시에만 쓴다).
 *
 * 기준 주 = 주간 작업과 같은 ISO 주(weekly-run.ts `resolveTargetWeek` — 기본은 실행 시작 KST 날짜의 바로 앞 주, D65). 운영 지표는
 * 발행일·비용 귀속이 모두 KST라 **KST 월 00:00 ~ 일 23:59:59.999**(time.ts `isoWeekRange`)로 센다(한국 선수 주간 리포트의 경기일
 * UTC 경계 — D65 ① — 와 다르다). 모든 수치는 그 주 KST 일요일 끝(`asOf`)까지의 기록만 보므로(src/lib/ops-metrics.ts `runsUpTo`)
 * force 재실행·수동 재생성(`npm run ops-report`)이 같은 값을 낸다. 예외는 미등록 고유명사 — 파일이 누적 스냅숏이라(등록된 이름은
 * 다음 수집이 지운다) 실행 시점 파일에서 firstSeen이 asOf 이하인 이름만 센다.
 *
 * 섹션(github-issues.ts `OPS_REPORT_SECTIONS` 순서): 요약 · 비용 · 실행 성공률 · 브리핑 · 소스 건강도 · 미등록 고유명사.
 * 이슈 본문에 넣는 외부 문자열(고유명사 키)은 표 칸 규칙(`cell`)으로 접는다 — 가리기·멘션 끊기는 buildIssue가 한 번 더 한다.
 */
import { parseArgs } from "node:util";

import { issueNumber } from "@/lib/issue";
import {
  collectRunStats,
  countPublishDays,
  monthBudgetUsage,
  monthsBetween,
  publishDays,
  runStats,
  runsUpTo,
  spendInRange,
  type MonthBudgetUsage,
  type PublishDay,
  type PublishDayState,
  type RunStats,
  type UtcSpan,
} from "@/lib/ops-metrics";
import type { BriefFile } from "@/lib/schema/brief";
import type { UnknownNamesFile } from "@/lib/schema/cache";
import type { RunLog } from "@/lib/schema/run";
import {
  formatDateDayShort,
  formatKst,
  isoWeekRange,
  kstDate,
  nowUtcIso,
} from "@/lib/time";

import type { ParseResult } from "./cli-args";
import { formatUsd } from "./cost";
import {
  OpsReportPayloadSchema,
  type IssuePayloadInput,
  type SourceEventType,
  type SourceRunState,
} from "./github-issues";
import {
  assessSourceHealth,
  healthRuns,
  sourceHistory,
  sourceStats,
  type SourceStats,
} from "./source-health";

// ─── 주차 ────────────────────────────────────────────────────────────────

const WEEK_RE = /^(\d{4})-(\d{2})$/;

/** 주간 작업 주차 "YYYY-WW" → 이슈 키 주차 "YYYY-Www"(OpsReportPayloadSchema) */
export function opsIssueWeek(week: string): string {
  const m = WEEK_RE.exec(week);
  if (!m) throw new RangeError(`ISO 주차 형식(YYYY-WW)이 아님: ${week}`);
  return `${m[1]}-W${m[2]}`;
}

export interface OpsReportWindow {
  /** 주간 작업 주차 "YYYY-WW" */
  week: string;
  /** 이슈 주차 "YYYY-Www" */
  issueWeek: string;
  /** KST 월요일 "YYYY-MM-DD" */
  from: string;
  /** KST 일요일 "YYYY-MM-DD" */
  to: string;
  /** KST 월 00:00 ~ 일 23:59:59.999 (UTC ISO, 둘 다 포함) */
  span: UtcSpan;
  /** 집계 기준 시각 = span.to */
  asOf: string;
}

/** ISO 주차 → 운영 리포트 집계 구간(KST 주 — 머리 주석) */
export function opsReportWindow(week: string): OpsReportWindow {
  const span = isoWeekRange(week);
  return {
    week,
    issueWeek: opsIssueWeek(week),
    from: kstDate(span.from),
    to: kstDate(span.to),
    span,
    asOf: span.to,
  };
}

// ─── 입력 ────────────────────────────────────────────────────────────────

/** 발행일 하나의 브리핑 파일 — 없으면 brief null, 읽기·검증 실패면 error */
export interface OpsBriefDay {
  date: string;
  brief: BriefFile | null;
  error: string | null;
}

export interface OpsReportInput {
  /** 주간 작업 주차 "YYYY-WW" */
  week: string;
  /** data/runs.json(prod) */
  prodRuns: readonly RunLog[];
  /** data/runs-dev.json(dev) */
  devRuns: readonly RunLog[];
  /** 그 주 발행일(월~일)의 브리핑 — 빠진 날은 '파일 없음'으로 본다 */
  briefs: readonly OpsBriefDay[];
  /** data/cache/unknown-names.json — 없으면 file null, 깨졌으면 error */
  unknownNames: { file: UnknownNamesFile | null; error: string | null };
  /** MONTHLY_BUDGET_USD */
  monthlyBudget: number;
  /** 생성 시각(이슈 본문 표시) */
  now: Date;
}

// ─── 소스 건강도 ─────────────────────────────────────────────────────────

/** 이 길이 이상 새 기사 없음이 이어지면 리포트에서 '확인'으로 표시(이슈 기준 7회 — D35 ② — 보다 이르게 보여 준다) */
export const OPS_STALE_ATTENTION = 3;

export interface SourceHealthRow {
  id: string;
  /** 기준 실행의 상태 */
  state: SourceRunState;
  /** 기준 실행의 실패 종류(runs.json sources[].error) */
  error: string | null;
  failStreak: number;
  staleStreak: number;
  /** 이슈로 낼 사건(전체 실패 실행이라 뺀 사건 포함) */
  event: SourceEventType | null;
  /** 그 주(KST 월~일) 집계 */
  week: SourceStats;
  /** 확인 필요 — 사건 · 실패·빈 피드 연속 · 주간 성공률 100% 미만 · 새 기사 없음 `OPS_STALE_ATTENTION`회 이상 */
  attention: boolean;
}

export interface SourceHealthSnapshot {
  /** 기준 실행 = 그 주 마지막 prod collect 실행(dry 기록 제외) */
  runId: string;
  startedAt: string;
  /** 기준 실행의 소스 순서(설정 순서) — 확인 필요가 앞 */
  rows: SourceHealthRow[];
}

/**
 * 그 주 끝(asOf) 기준 소스 건강도 — 연속 횟수·사건은 그 주 마지막 수집 실행을 '이번 실행'으로 놓고 source-health.ts
 * `assessSourceHealth`로(이슈 판정과 같은 규칙), 성공률·건수는 그 주 월~일(`sourceStats(…, asOf, 7)`)로 센다.
 * 그 주에 수집 실행이 없으면 null.
 */
export function sourceHealthAsOf(
  runs: readonly RunLog[],
  span: UtcSpan,
): SourceHealthSnapshot | null {
  const asOf = span.to;
  // prod collect만, 시작 시각 오름차순(asOf까지 — 가짜 '이번 실행'으로 전체를 받는다)
  const history = healthRuns(runsUpTo(runs, asOf), {
    runId: "",
    startedAt: asOf,
  });
  const fromMs = Date.parse(span.from);
  const last = history
    .filter(
      (run) => run.status !== "skipped" && Date.parse(run.startedAt) >= fromMs,
    )
    .at(-1);
  if (!last) return null;
  const health = assessSourceHealth({
    run: last,
    current: last.sources,
    history,
  });
  const rows = health.map((h): SourceHealthRow => {
    const week = sourceStats(sourceHistory(history, h.id), asOf, 7);
    const event = h.event?.type ?? h.suppressedEvent?.type ?? null;
    const attention =
      event !== null ||
      h.failStreak.count > 0 ||
      (week.successRate !== null && week.successRate < 1) ||
      h.staleStreak.count >= OPS_STALE_ATTENTION;
    return {
      id: h.id,
      state: h.current.state,
      error: h.current.error ?? null,
      failStreak: h.failStreak.count,
      staleStreak: h.staleStreak.count,
      event,
      week,
      attention,
    };
  });
  return {
    runId: last.runId,
    startedAt: last.startedAt,
    rows: [
      ...rows.filter((r) => r.attention),
      ...rows.filter((r) => !r.attention),
    ],
  };
}

// ─── 브리핑 ──────────────────────────────────────────────────────────────

/** 브리핑 하루 상태 — mode(empty는 이유로 나눔) · 파일 없음 · 읽기 실패 */
export type BriefDayKind =
  | "llm"
  | "mixed"
  | "template"
  | "no-matches"
  | "results-pending"
  | "missing"
  | "unreadable";

export const BRIEF_DAY_KINDS: readonly BriefDayKind[] = Object.freeze([
  "llm",
  "mixed",
  "template",
  "no-matches",
  "results-pending",
  "missing",
  "unreadable",
]);

const BRIEF_KIND_LABEL: Readonly<Record<BriefDayKind, string>> = {
  llm: "LLM",
  mixed: "혼합",
  template: "템플릿",
  "no-matches": "경기 없음",
  "results-pending": "결과 지연",
  missing: "파일 없음",
  unreadable: "읽기 실패",
};

export interface BriefDayRow {
  date: string;
  kind: BriefDayKind;
  /** 게시 줄 중 ai:true */
  aiLines: number;
  /** 게시 줄 중 ai:false(템플릿) */
  templateLines: number;
  /** 그 발행일 prod collect 실행이 보낸 브리핑 요청 수(RunLog.brief.requests 합) */
  requests: number;
}

function briefKindOf(day: OpsBriefDay | undefined): BriefDayKind {
  if (!day) return "missing";
  if (day.error !== null) return "unreadable";
  if (!day.brief) return "missing";
  if (day.brief.mode === "empty") {
    return day.brief.emptyReason === "results-pending"
      ? "results-pending"
      : "no-matches";
  }
  return day.brief.mode;
}

function briefRows(
  dates: readonly string[],
  briefs: readonly OpsBriefDay[],
  prodCollect: readonly RunLog[],
): BriefDayRow[] {
  return dates.map((date) => {
    const day = briefs.find((b) => b.date === date);
    const lines = day?.error === null ? (day.brief?.lines ?? []) : [];
    return {
      date,
      kind: briefKindOf(day),
      aiLines: lines.filter((l) => l.ai).length,
      templateLines: lines.filter((l) => !l.ai).length,
      requests: prodCollect
        .filter((r) => kstDate(r.startedAt) === date)
        .reduce((sum, r) => sum + (r.brief?.requests ?? 0), 0),
    };
  });
}

// ─── 표기 ────────────────────────────────────────────────────────────────

/** 표 칸 — 줄바꿈 접기, `|`·백틱·꺾쇠 무력화, 길이 제한 */
function cell(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "'")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function rateText(stats: Pick<RunStats, "ok" | "runs">): string {
  return stats.runs > 0
    ? `${pct(stats.ok, stats.runs)} (${stats.ok}/${stats.runs})`
    : "실행 없음";
}

const SEASON_LABEL = { summer: "여름", winter: "겨울" } as const;

const DAY_STATE_LABEL: Readonly<Record<PublishDayState, string>> = {
  ontime: "정시",
  late: "늦음",
  missed: "결호",
  failed: "실패",
  pending: "발행 전",
  prelaunch: "창간 전",
};

const SOURCE_STATE_LABEL: Readonly<Record<SourceRunState, string>> = {
  fresh: "새 기사",
  "no-new": "새 기사 없음",
  empty: "빈 피드",
  failed: "실패",
  budget: "시간 예산 건너뜀",
  "legacy-ok": "성공(옛 기록)",
};

const EVENT_LABEL: Readonly<Record<SourceEventType, string>> = {
  failed: "실패",
  "failing-streak": "실패 연속",
  "stale-streak": "새 기사 없음 연속",
};

/** KST 시각 — 발행일과 같은 날이면 "HH:MM", 아니면 "MM.DD HH:MM" */
function kstTimeOn(iso: string, date: string): string {
  return kstDate(iso) === date
    ? formatKst(iso, "time")
    : formatKst(iso, "short");
}

function issueLabel(date: string): string {
  const no = issueNumber(date);
  return no === null ? "—" : `제 ${no}호`;
}

function monthLabel(u: MonthBudgetUsage): string {
  return u.complete ? "월 전체" : `${u.through.slice(5)}까지`;
}

function devAlertLine(u: MonthBudgetUsage): string {
  return `> **경고**: ${u.month}(KST) dev LLM 사용이 월 예산의 ${(u.devShare * 100).toFixed(1)}% — 50%를 넘었습니다(${monthLabel(u)} 기준, CLAUDE.md §6.3). dev 실호출을 줄이세요(--mock·--dry·--limit).`;
}

// ─── 섹션 ────────────────────────────────────────────────────────────────

interface Metrics {
  window: OpsReportWindow;
  days: PublishDay[];
  dayCounts: Record<PublishDayState, number>;
  collect: RunStats;
  weekly: RunStats;
  spend: ReturnType<typeof spendInRange>;
  months: MonthBudgetUsage[];
  unbilled: { requests: number; usdMax: number };
  briefs: BriefDayRow[];
  sources: SourceHealthSnapshot | null;
  names: UnknownNamesSummary;
}

interface UnknownNamesSummary {
  error: string | null;
  /** 파일 없음 */
  absent: boolean;
  /** firstSeen ≤ asOf인 이름 수 */
  pending: number;
  /** firstSeen이 그 주인 이름(횟수 내림차순 → 이름) */
  fresh: Array<{
    name: string;
    count: number;
    kind: string | null;
    firstSeen: string;
  }>;
  /** 누적 상위(횟수 내림차순 → 이름) */
  top: Array<{
    name: string;
    count: number;
    kind: string | null;
    firstSeen: string;
  }>;
}

/** 표에 싣는 이름 수 */
export const OPS_NAMES_TABLE_MAX = 10;

function summarizeNames(
  input: OpsReportInput["unknownNames"],
  span: UtcSpan,
): UnknownNamesSummary {
  if (input.error !== null || !input.file) {
    return {
      error: input.error,
      absent: input.error === null,
      pending: 0,
      fresh: [],
      top: [],
    };
  }
  const fromMs = Date.parse(span.from);
  const toMs = Date.parse(span.to);
  const known = Object.entries(input.file.names)
    .filter(([, n]) => Date.parse(n.firstSeen) <= toMs)
    .map(([name, n]) => ({
      name,
      count: n.count,
      kind: n.kind ?? null,
      firstSeen: n.firstSeen,
    }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return {
    error: null,
    absent: false,
    pending: known.length,
    fresh: known.filter((n) => Date.parse(n.firstSeen) >= fromMs),
    top: known.slice(0, OPS_NAMES_TABLE_MAX),
  };
}

/** 요약에 이름을 싣는 확인 필요 소스 수 */
const OPS_SUMMARY_SOURCES_MAX = 5;

/** 확인 필요 사유 한 마디 */
function attentionReason(r: SourceHealthRow): string {
  if (r.failStreak > 0) return `실패·빈 피드 ${r.failStreak}회 연속`;
  if (r.staleStreak >= OPS_STALE_ATTENTION) {
    return `새 기사 없음 ${r.staleStreak}회 연속`;
  }
  if (r.event) return EVENT_LABEL[r.event];
  return `주간 성공 ${r.week.ok}/${r.week.attempts}`;
}

function summarySection(m: Metrics): string {
  const c = m.dayCounts;
  const alerts = m.months.filter((u) => u.devAlert).map(devAlertLine);
  const attention = m.sources?.rows.filter((r) => r.attention) ?? [];
  const monthText = m.months
    .map(
      (u) =>
        `${u.month} ${pct(u.total, u.monthlyBudget)}${u.complete ? "" : `(${monthLabel(u)})`}`,
    )
    .join(" · ");
  const attentionText = attention
    .slice(0, OPS_SUMMARY_SOURCES_MAX)
    .map((r) => `\`${cell(r.id, 60)}\` ${attentionReason(r)}`)
    .join(" · ");
  const more =
    attention.length > OPS_SUMMARY_SOURCES_MAX
      ? ` 외 ${attention.length - OPS_SUMMARY_SOURCES_MAX}`
      : "";
  const lines = [
    ...alerts,
    ...(alerts.length > 0 ? [""] : []),
    `- 발행 ${m.days.length}일: 정시 ${c.ontime} · 늦음 ${c.late} · 결호 ${c.missed} · 실패 ${c.failed}${c.prelaunch > 0 ? ` · 창간 전 ${c.prelaunch}` : ""}${c.pending > 0 ? ` · 발행 전 ${c.pending}` : ""}`,
    `- 수집 실행 성공률: ${rateText(m.collect)}${m.collect.failed > 0 ? ` — 실패 ${m.collect.failed}` : ""}`,
    `- LLM 비용(이 주): ${formatUsd(m.spend.total)} (prod ${formatUsd(m.spend.prod)} · dev ${formatUsd(m.spend.dev)}) · 월 예산 대비 누적 ${monthText}`,
    m.sources
      ? `- 소스 ${m.sources.rows.length}개 중 확인 필요 ${attention.length}${attention.length > 0 ? ` — ${attentionText}${more}` : ""}`
      : "- 소스: 이 주 수집 실행 기록 없음",
    m.names.error !== null
      ? "- 미등록 고유명사: 파일을 읽지 못함"
      : `- 미등록 고유명사: 이 주 새로 ${m.names.fresh.length}개 · 누적 ${m.names.pending}개`,
  ];
  return lines.join("\n");
}

function costSection(m: Metrics): string {
  const lines = [
    "실행은 시작 시각(KST)으로 귀속합니다. 금액은 runs.json(prod) · runs-dev.json(dev)의 실측 `costUsd` 합입니다.",
    "",
    "| 구분 | 금액 |",
    "|---|---:|",
    `| prod (봇) | ${formatUsd(m.spend.prod)} |`,
    `| dev (개발) | ${formatUsd(m.spend.dev)} |`,
    `| 합계 | ${formatUsd(m.spend.total)} |`,
    `| 그중 일일 수집 (collect) | ${formatUsd(m.spend.byJob.collect)} |`,
    `| 그중 주간 작업 (weekly) | ${formatUsd(m.spend.byJob.weekly)} |`,
    "",
    "월 누적 (prod + dev 합산 가드 — 이 주가 걸친 달, 일요일까지):",
    "",
    "| 달 (KST) | 기준 | prod | dev | 합계 | 월 예산 대비 | dev 비율 |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...m.months.map(
      (u) =>
        `| ${u.month} | ${monthLabel(u)} | ${formatUsd(u.prod)} | ${formatUsd(u.dev)} | ${formatUsd(u.total)} | ${pct(u.total, u.monthlyBudget)} | ${pct(u.dev, u.monthlyBudget)}${u.devAlert ? " (50% 초과)" : ""} |`,
    ),
  ];
  const alerts = m.months.filter((u) => u.devAlert).map(devAlertLine);
  if (alerts.length > 0) lines.push("", ...alerts);
  if (m.unbilled.requests > 0) {
    lines.push(
      "",
      `과금 여부를 모르는 끊긴 브리핑 요청(unbilledRisk): ${m.unbilled.requests}건 · 최대 ${formatUsd(m.unbilled.usdMax)} — 위 합계에 넣지 않았습니다(Console 사용량으로 확인).`,
    );
  }
  return lines.join("\n");
}

function runsSection(m: Metrics): string {
  const c = m.collect;
  const w = m.weekly;
  const lines = [
    `- 일일 수집(collect): ${c.runs}회 — 성공 ${c.success} · 부분 성공 ${c.partial} · 실패 ${c.failed} → 성공률 ${rateText(c)}`,
    `- 주간 작업(weekly): ${w.runs}회 — 성공 ${w.success} · 부분 성공 ${w.partial} · 실패 ${w.failed}`,
    "- 분모는 그 주에 시작한 prod 실행(dry 기록 제외), 분자는 성공 + 부분 성공입니다(실행 기준).",
    "",
    "발행일별 — 정시 = 첫 발행 실행의 수집 완료가 공개 목표 + 15분 이내(공개·배포 완료 시각은 기록에 없어 수집 완료로 판정):",
    "",
    "| 발행일 | 호 | 계절 | 공개 목표 | 첫 발행(수집 완료) | 판정 | 실행 |",
    "|---|---|---|---|---|---|---:|",
    ...m.days.map((d) => {
      const runs =
        d.failedRuns > 0 ? `${d.runs} (실패 ${d.failedRuns})` : `${d.runs}`;
      return `| ${formatDateDayShort(d.date)} | ${issueLabel(d.date)} | ${SEASON_LABEL[d.season]} | ${formatKst(d.publishTarget, "time")} | ${d.publishedAt ? kstTimeOn(d.publishedAt, d.date) : "—"} | ${DAY_STATE_LABEL[d.state]} | ${runs} |`;
    }),
  ];
  return lines.join("\n");
}

function briefSection(m: Metrics): string {
  const counts = Object.fromEntries(
    BRIEF_DAY_KINDS.map((k) => [
      k,
      m.briefs.filter((b) => b.kind === k).length,
    ]),
  ) as Record<BriefDayKind, number>;
  const ai = m.briefs.reduce((s, b) => s + b.aiLines, 0);
  const template = m.briefs.reduce((s, b) => s + b.templateLines, 0);
  const requests = m.briefs.reduce((s, b) => s + b.requests, 0);
  const lines = [
    `- 게시 mode: ${BRIEF_DAY_KINDS.filter(
      (k) => counts[k] > 0 || ["llm", "mixed", "template"].includes(k),
    )
      .map((k) => `${BRIEF_KIND_LABEL[k]} ${counts[k]}`)
      .join(" · ")}`,
    `- 게시 줄: AI 작성 ${ai} · 템플릿 ${template}${ai + template > 0 ? ` (AI ${pct(ai, ai + template)})` : ""}`,
    `- 브리핑 요청(단건 Messages API): ${requests}건 · 하루 최대 ${Math.max(0, ...m.briefs.map((b) => b.requests))}건(상한 3)`,
    "",
    "| 발행일 | mode | AI 줄 | 템플릿 줄 | 요청 |",
    "|---|---|---:|---:|---:|",
    ...m.briefs.map(
      (b) =>
        `| ${formatDateDayShort(b.date)} | ${BRIEF_KIND_LABEL[b.kind]} | ${b.aiLines} | ${b.templateLines} | ${b.requests} |`,
    ),
  ];
  return lines.join("\n");
}

function sourceSection(m: Metrics): string {
  const s = m.sources;
  if (!s) return "_이 주에 수집 실행 기록이 없습니다._";
  const attention = s.rows.filter((r) => r.attention).length;
  const lines = [
    `기준 실행 \`${cell(s.runId, 60)}\` (${formatKst(s.startedAt, "short")} KST) · 7일 = 이 주 월~일(시간 예산 건너뜀 제외) · 확인 필요 ${attention}/${s.rows.length}`,
    `확인 필요 = 이슈 사건 · 실패·빈 피드 연속 · 주간 성공률 100% 미만 · 새 기사 없음 ${OPS_STALE_ATTENTION}회 이상 연속(이슈는 7회).`,
    "",
    "| 소스 | 마지막 상태 | 7일 성공 | 새 항목 | 실패 연속 | 새 기사 없음 연속 | 확인 |",
    "|---|---|---:|---:|---:|---:|---|",
    ...s.rows.map((r) => {
      const state = r.error
        ? `${SOURCE_STATE_LABEL[r.state]}(${cell(r.error, 30)})`
        : SOURCE_STATE_LABEL[r.state];
      const ok =
        r.week.attempts > 0
          ? `${r.week.ok}/${r.week.attempts} (${pct(r.week.ok, r.week.attempts)})`
          : "—";
      const usable = r.week.usableRuns > 0 ? `${r.week.usable}` : "—";
      const flag = r.event ? EVENT_LABEL[r.event] : r.attention ? "확인" : "";
      return `| \`${cell(r.id, 60)}\` | ${state} | ${ok} | ${usable} | ${r.failStreak} | ${r.staleStreak} | ${flag} |`;
    }),
  ];
  return lines.join("\n");
}

function namesTable(rows: UnknownNamesSummary["fresh"]): string[] {
  return [
    "| 이름 | 유형 | 횟수 | 처음 본 날 |",
    "|---|---|---:|---|",
    ...rows
      .slice(0, OPS_NAMES_TABLE_MAX)
      .map(
        (n) =>
          `| ${cell(n.name, 60)} | ${n.kind ? cell(n.kind, 20) : "—"} | ${n.count} | ${formatDateDayShort(kstDate(n.firstSeen))} |`,
      ),
  ];
}

function namesSection(m: Metrics): string {
  const n = m.names;
  if (n.error !== null) {
    return `_data/cache/unknown-names.json을 읽지 못했습니다: ${cell(n.error, 120)}_`;
  }
  if (n.absent || n.pending === 0) {
    return "_미등록 고유명사가 없습니다._";
  }
  const lines = [
    `누적 ${n.pending}개(일요일까지 처음 본 이름 — 실행 시점 파일 기준) · 이 주 새로 ${n.fresh.length}개. 표기는 \`/add-name\`으로 확인해 \`configs/names.ko.json\`에 반영합니다.`,
    "",
  ];
  if (n.fresh.length > 0) {
    lines.push(
      `이 주 새로 본 이름(횟수순, 최대 ${OPS_NAMES_TABLE_MAX}개):`,
      "",
      ...namesTable(n.fresh),
    );
  } else {
    lines.push(
      `이 주 새로 본 이름은 없습니다. 누적 상위(횟수순, 최대 ${OPS_NAMES_TABLE_MAX}개):`,
      "",
      ...namesTable(n.top),
    );
  }
  return lines.join("\n");
}

// ─── 조립 ────────────────────────────────────────────────────────────────

export type OpsReportPayload = IssuePayloadInput<"ops-report">;

export interface OpsReport {
  window: OpsReportWindow;
  payload: OpsReportPayload;
  /** 단계 보고·로그용 건수 */
  counts: Record<string, number>;
}

/** 입력 → 운영 리포트 이슈 payload (머리 주석 규칙). payload는 OpsReportPayloadSchema로 검증해 돌려준다 */
export function buildOpsReportPayload(input: OpsReportInput): OpsReport {
  const window = opsReportWindow(input.week);
  const { span, asOf } = window;
  const all = [...input.prodRuns, ...input.devRuns];
  const upTo = runsUpTo(all, asOf);
  const prodCollect = upTo.filter(
    (r) =>
      r.env === "prod" &&
      r.job === "collect" &&
      Date.parse(r.startedAt) >= Date.parse(span.from),
  );
  const days = publishDays(window.from, window.to, upTo, asOf);
  const unbilled = prodCollect.reduce(
    (acc, r) => ({
      requests: acc.requests + (r.brief?.unbilledRisk?.requests ?? 0),
      usdMax: acc.usdMax + (r.brief?.unbilledRisk?.usdMax ?? 0),
    }),
    { requests: 0, usdMax: 0 },
  );
  const metrics: Metrics = {
    window,
    days,
    dayCounts: countPublishDays(days),
    collect: collectRunStats(upTo, span),
    weekly: runStats(upTo, span, "weekly"),
    spend: spendInRange(upTo, span),
    months: monthsBetween(window.from, window.to).map((month) =>
      monthBudgetUsage(all, month, asOf, input.monthlyBudget),
    ),
    unbilled,
    briefs: briefRows(
      days.map((d) => d.date),
      input.briefs,
      prodCollect,
    ),
    sources: sourceHealthAsOf(input.prodRuns, span),
    names: summarizeNames(input.unknownNames, span),
  };
  const payload = OpsReportPayloadSchema.parse({
    week: window.issueWeek,
    from: window.from,
    to: window.to,
    sections: [
      { heading: "요약", body: summarySection(metrics) },
      { heading: "비용", body: costSection(metrics) },
      { heading: "실행 성공률", body: runsSection(metrics) },
      { heading: "브리핑", body: briefSection(metrics) },
      { heading: "소스 건강도", body: sourceSection(metrics) },
      { heading: "미등록 고유명사", body: namesSection(metrics) },
    ],
    occurredAt: nowUtcIso(input.now),
  });
  return {
    window,
    payload,
    counts: {
      ontime: metrics.dayCounts.ontime,
      late: metrics.dayCounts.late,
      missed: metrics.dayCounts.missed,
      failed: metrics.dayCounts.failed,
      collectRuns: metrics.collect.runs,
      collectOk: metrics.collect.ok,
      sources: metrics.sources?.rows.length ?? 0,
      sourcesAttention:
        metrics.sources?.rows.filter((r) => r.attention).length ?? 0,
      namesNew: metrics.names.fresh.length,
      devAlerts: metrics.months.filter((u) => u.devAlert).length,
    },
  };
}

// ─── CLI 인자 (scripts/ops-report.ts) ────────────────────────────────────

export const OPS_REPORT_USAGE = [
  "사용법: npm run ops-report -- [--week <YYYY-WW>] [--dry]",
  "  --week <주차>  대상 ISO 주차 (기본: 지금 KST 날짜가 속한 주의 바로 앞 주 — 주간 작업과 같다). 끝나지 않은 주는 거부",
  "  --dry          이슈를 만들지 않고 제목·본문만 출력(네트워크 없음)",
  "  dry가 아니면 GITHUB_TOKEN(또는 GH_TOKEN)·GITHUB_REPOSITORY로 이슈를 만들거나 같은 주차 열린 이슈의 본문을 바꾼다",
].join("\n");

export interface OpsReportArgs {
  week: string | null;
  dry: boolean;
  help: boolean;
}

/** ops-report 인자 파싱(순수). 주차 범위·'끝난 주' 확인은 weekly-run.ts resolveTargetWeek */
export function parseOpsReportArgs(
  argv: readonly string[],
): ParseResult<OpsReportArgs> {
  let values: { week?: string; dry?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        week: { type: "string" },
        dry: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const week = values.week?.trim();
  if (week !== undefined && !WEEK_RE.test(week)) {
    return {
      ok: false,
      error: `--week는 YYYY-WW 형식이어야 합니다 (받은 값 길이 ${week.length})`,
    };
  }
  return {
    ok: true,
    value: {
      week: week || null,
      dry: values.dry ?? false,
      help: values.help ?? false,
    },
  };
}
