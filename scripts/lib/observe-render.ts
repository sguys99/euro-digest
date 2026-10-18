/**
 * 일일 발행 관찰 문서 렌더 (plan M1-41 · M1-42) — `DayObservation`(observe.ts) → `docs/research/m1-observation.md`의 일자별 표·
 * 상세·주간 요약. 순수 함수. 데이터 줄(`observe-data`)이 단일 출처이고 표·상세는 매번 그 줄들로 다시 그린다(메모 칸 보존).
 */
import { formatKst } from "@/lib/time";

import {
  DayObservationSchema,
  OVERDUE_MINUTES,
  PUBLISH_GRACE_MINUTES,
  type DayObservation,
  type PublishVerdict,
  type RunObs,
  type WeekSummary,
} from "./observe";
import { OBS_BLOCKS, OBS_DATA } from "./observation-doc";
import {
  cell,
  readBlock,
  readDataLines,
  renderTable,
  replaceBlock,
  tableCellsByKey,
  upsertDataLine,
} from "./research-doc";

export const VERDICT_LABELS: Readonly<Record<PublishVerdict, string>> =
  Object.freeze({
    "on-time": "정시",
    allowed: "허용",
    late: "지각",
    none: "미발행",
    unknown: "확인 불가",
  });

const SEASON_LABELS = { summer: "여름", winter: "겨울" } as const;

export const DAILY_TABLE_HEADER = [
  "발행일",
  "계절·목표",
  "공개",
  "지연(분)",
  "판정",
  "트리거",
  "상태",
  "카드",
  "브리핑",
  "요청",
  "비용",
  "캐시 R/W",
  "소스 실패",
  "경기 상태",
  "메모",
] as const;

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function signed(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

/** 트리거 칸 — 실행 n · 건너뜀 n(사유별) · 실패 n · 계절 위반 n */
export function triggerSummary(runs: readonly RunObs[]): string {
  if (runs.length === 0) return "실행 없음";
  const run = runs.filter((r) => r.guard === "run").length;
  const skips = runs.filter((r) => r.guard === "skip");
  const fail = runs.filter((r) => r.guard === "fail").length;
  const reasons = new Map<string, number>();
  for (const s of skips) {
    const key = s.guardReason ?? "사유 모름";
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const parts = [`실행 ${run}`];
  if (skips.length > 0) {
    parts.push(
      `건너뜀 ${skips.length}(${[...reasons].map(([k, n]) => `${k} ${n}`).join(", ")})`,
    );
  }
  if (fail > 0) parts.push(`실패 ${fail}`);
  const violations = runs.filter((r) => r.seasonCheck === "violation").length;
  if (violations > 0) parts.push(`**계절 위반 ${violations}**`);
  const unverified = runs.filter((r) => r.seasonCheck === "unverified").length;
  if (unverified > 0) parts.push(`계절 확인 불가 ${unverified}`);
  return parts.join(" · ");
}

function matchStatusCell(o: DayObservation): string {
  const m = o.matchStatus;
  if (!m) return "—";
  const delayed =
    m.overdue === null ? "지연 판정 불가" : `지연 의심 ${m.overdue}`;
  return `${m.finished}/${m.inProgress}/${m.otherUnfinished} (${delayed})`;
}

/** 하루 관찰 → 표 한 줄 */
export function dailyRow(
  o: DayObservation,
  memo: string | undefined,
): string[] {
  const d = o.data;
  const statuses = d.runs.map((r) => r.status).join("→");
  const failed = [
    ...new Set(
      d.runs.flatMap((r) =>
        r.failedSources.map((f) => `${f.id}${f.error ? `(${f.error})` : ""}`),
      ),
    ),
  ];
  return [
    o.date,
    `${SEASON_LABELS[o.season]} ${formatKst(o.publishTarget, "time")}`,
    o.publish.publishedAt ? formatKst(o.publish.publishedAt, "time") : "—",
    signed(o.publish.delayMinutes),
    `${VERDICT_LABELS[o.publish.verdict]}${o.publish.manual || o.publish.outsideWindow || o.trial ? "(참고)" : ""}`,
    o.actions.ok ? triggerSummary(o.actions.runs) : "확인 불가",
    cell(statuses),
    d.news ? String(d.news.cards) : "—",
    d.brief ? `${d.brief.mode}(${d.brief.aiLines}/${d.brief.lines})` : "—",
    String(d.totals.requests),
    usd(d.totals.costUsd),
    `${d.totals.cacheRead}/${d.totals.cacheWrite}`,
    cell(failed.join(", ") || "없음"),
    matchStatusCell(o),
    cell(memo),
  ];
}

function runLine(r: RunObs): string {
  const created = formatKst(r.createdAt, "time");
  const trigger =
    r.event === "schedule"
      ? `schedule \`${r.cron ?? "?"}\``
      : `dispatch${r.slot ? ` slot=${r.slot}` : " (slot 없음 — 수동)"}${r.force ? " force" : ""}`;
  const season = r.triggerSeason
    ? ` · 트리거 계절 ${SEASON_LABELS[r.triggerSeason]}`
    : "";
  const guard =
    r.guard === "run"
      ? `실행(${r.guardReason ?? "?"})`
      : r.guard === "skip"
        ? `건너뜀(${r.guardReason ?? "사유 모름"})`
        : r.guard === "fail"
          ? `가드 실패(${r.guardReason ?? "?"})`
          : r.guard === "pending"
            ? "진행 중"
            : "확인 불가";
  const collect =
    r.collect && r.collect.conclusion !== "skipped"
      ? ` · collect ${r.collect.conclusion ?? "진행 중"}${r.collect.startedAt && r.collect.completedAt ? ` ${formatKst(r.collect.startedAt, "time")}~${formatKst(r.collect.completedAt, "time")}` : ""}`
      : "";
  const deploy = r.deployedAt
    ? ` · 배포 ${formatKst(r.deployedAt, "time")}`
    : r.deployConclusion && r.deployConclusion !== "skipped"
      ? ` · 배포 ${r.deployConclusion}`
      : "";
  const check =
    r.seasonCheck === "violation"
      ? " · **계절 위반**"
      : r.seasonCheck === "unverified"
        ? " · 계절 확인 불가"
        : "";
  const attempt =
    (r.runAttempt ?? 1) > 1
      ? ` · 재실행 시도 ${r.runAttempt}${r.runStartedAt ? `(${formatKst(r.runStartedAt, "datetime")} 시작)` : ""}`
      : "";
  return `- ${created} [#${r.id}](${r.url}) ${trigger}${season} → ${guard}${collect}${deploy}${check}${attempt}${r.inMorningWindow ? "" : " · (아침 창 밖)"}`;
}

/** 하루 관찰 → 상세 절 */
export function dayDetail(o: DayObservation): string {
  const lines: string[] = [];
  lines.push(
    `### ${o.date} (${formatKst(o.publishTarget, "date").replace(/^.*\((.)\)$/, "$1")}) — ${SEASON_LABELS[o.season]} · 목표 ${formatKst(o.publishTarget, "time")} KST${o.trial ? " · 관찰 전 시험" : ""}`,
  );
  lines.push("");
  lines.push(
    `- 관찰 시각 ${formatKst(o.observedAt, "datetime")} KST · 공개 ${o.publish.publishedAt ? formatKst(o.publish.publishedAt, "datetime") : "없음"} · 지연 ${signed(o.publish.delayMinutes)}분 · 판정 **${VERDICT_LABELS[o.publish.verdict]}**(기준: 목표 이전 정시 · +${PUBLISH_GRACE_MINUTES}분 이내 허용)`,
  );
  for (const note of o.notes) lines.push(`- ⚠ ${note}`);
  lines.push("");
  lines.push("**Actions 실행** (그 KST 하루에 만들어진 collect.yml 실행)");
  lines.push("");
  if (!o.actions.ok) lines.push(`- 확인 불가 — ${o.actions.error ?? "?"}`);
  else if (o.actions.runs.length === 0) lines.push("- 실행 없음");
  else {
    for (const r of [...o.actions.runs].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )) {
      lines.push(runLine(r));
    }
  }
  lines.push("");
  lines.push(
    `**실행 기록** (data/runs.json — 그날 KST prod collect ${o.data.runs.length}건${o.data.runsError ? ` · 읽기 오류: ${o.data.runsError}` : ""})`,
  );
  lines.push("");
  if (o.data.runs.length > 0) {
    lines.push(
      renderTable(
        [
          "runId",
          "시작(KST)",
          "status",
          "수집/클러스터",
          "브리핑 줄 AI/강등",
          "요청",
          "토큰 in/out",
          "캐시 R/W",
          "비용",
          "API fd/af",
          "소스 실패",
        ],
        o.data.runs.map((r) => [
          `\`${r.runId}\``,
          formatKst(r.startedAt, "time"),
          r.status,
          `${r.collected}/${r.clusters}`,
          `${r.summarized}/${r.downgraded}`,
          `${r.requests}${r.unbilledRiskUsd !== null ? ` (미과금 위험 ≤ ${usd(r.unbilledRiskUsd)})` : ""}`,
          `${r.tokens.in}/${r.tokens.out}`,
          `${r.tokens.cacheRead}/${r.tokens.cacheWrite}`,
          usd(r.costUsd),
          `${r.apiCalls.footballData}/${r.apiCalls.apiFootball}`,
          cell(
            r.failedSources
              .map((f) => `${f.id}${f.error ? `(${f.error})` : ""}`)
              .join(", ") || "없음",
          ),
        ]),
      ),
    );
    lines.push("");
  }
  const b = o.data.brief;
  lines.push(
    `- 브리핑 파일: ${b ? `mode \`${b.mode}\` · ${b.lines}줄(AI ${b.aiLines}) · runId \`${b.runId}\`` : `없음${o.data.briefError ? ` (오류: ${o.data.briefError})` : ""}`} · 뉴스 카드: ${o.data.news ? `${o.data.news.cards}장` : `없음${o.data.newsError ? ` (오류: ${o.data.newsError})` : ""}`}`,
  );
  lines.push("");
  lines.push(
    `**collect 로그** (${o.logRunId !== null ? `실행 #${o.logRunId}` : "대상 없음"}${o.logError ? ` · 읽기 실패: ${o.logError}` : ""})`,
  );
  lines.push("");
  const log = o.log;
  if (log) {
    lines.push(
      `- runId \`${log.runId ?? "?"}\` · 마감 기준 ${log.deadlineBasis ?? "?"}${log.briefDeadline ? ` (브리핑 마감 ${formatKst(log.briefDeadline, "time")})` : ""} · 결과 ${log.done ? `${log.done.status}/exit ${log.done.exitCode ?? "?"}` : "?"}`,
    );
    if (log.briefAttempts.length > 0) {
      lines.push(
        `- 브리핑 시도: ${log.briefAttempts
          .map(
            (a) =>
              `#${a.attempt} ${a.ok ? "ok" : (a.errorType ?? "실패")}/${a.verdict ?? "?"} in ${a.tokensIn} out ${a.tokensOut}${a.thinkingTokens !== null ? `(thinking ${a.thinkingTokens})` : ""} 캐시 ${a.cacheRead}/${a.cacheWrite}`,
          )
          .join(" · ")}`,
      );
    }
    if (log.briefBudget) {
      lines.push(
        `- 예산 가드: ${log.briefBudget.verdict} · 예상 ${log.briefBudget.estimatedUsd !== null ? usd(log.briefBudget.estimatedUsd) : "?"} ↔ 실측 ${usd(o.data.totals.costUsd)}(그날 합)`,
      );
    }
    if (log.briefPublish || log.briefDone) {
      lines.push(
        `- 게시: ${log.briefPublish ? `mode ${log.briefPublish.mode} (${log.briefPublish.reason ?? "?"}, ${log.briefPublish.action ?? "?"})` : "?"}${log.briefDone ? ` · 검증 ${log.briefDone.verdict ?? "?"} · AI ${log.briefDone.publishedAi ?? "?"} · 템플릿 ${log.briefDone.publishedTemplate ?? "?"} · 버린 출력 줄 ${log.briefDone.droppedOutputLines ?? "?"}` : ""}`,
      );
    }
    lines.push(
      `- LLM 단건 ${log.llm.calls}회 · 최소 타임아웃 ${log.llm.minTimeoutMs ?? "—"}ms · 마감 절단 ${log.llm.deadlineCut}`,
    );
    if (log.apiFootball) {
      const af = log.apiFootball;
      lines.push(
        `- API-Football: 대상 ${af.targets} · 상세 ${af.details} · 이월 ${af.pending} · 득점 불완전 ${af.goalsIncomplete} · 브리핑 ${af.brief ?? "?"} · 호출 ${af.apiCalls}${af.stoppedBy ? ` · 중단 ${af.stoppedBy}` : ""}`,
      );
    }
  } else if (!o.logError) {
    lines.push("- 로그 없음");
  }
  lines.push("");
  const m = o.matchStatus;
  lines.push(
    "**수집 시점 경기 상태** (브리핑 입력 창 = UTC 하루 D-1, football-data)",
  );
  lines.push("");
  if (!m) lines.push("- 기록 없음(football-data 단계 로그 없음)");
  else {
    lines.push(
      `- 받은 시각 ${formatKst(m.at, "time")} KST · 종료 ${m.finished} · 진행 중 ${m.inProgress} · 그 밖 미종료 ${m.otherUnfinished}${m.calledOff !== null ? `(연기·중단 ${m.calledOff})` : ""} · 점수 지연 의심 ${m.overdue === null ? "판정 불가(로그에 경기별 목록 없음 — 건수만)" : `${m.overdue}(킥오프 뒤 ${OVERDUE_MINUTES}분 이상 미종료)`}`,
    );
    if (
      m.unfinishedTotal !== undefined &&
      m.unfinishedTotal > m.unfinished.length
    ) {
      lines.push(
        `  - 미종료 목록은 ${m.unfinished.length}/${m.unfinishedTotal}경기만(로그 상한) — 지연 의심은 목록 안에서만 셈`,
      );
    }
    for (const u of m.unfinished) {
      lines.push(
        `  - ${u.comp} 킥오프 ${formatKst(u.kickoff, "time")} KST · ${u.status} · 킥오프 뒤 ${u.minutesSinceKickoff}분`,
      );
    }
  }
  return lines.join("\n");
}

/** 주간 요약 → 마크다운 */
export function renderWeekSummary(s: WeekSummary): string {
  const lines: string[] = [];
  const ok = s.publish["on-time"] + s.publish.allowed;
  lines.push(
    `**${s.from} ~ ${s.to}** (${s.periodDays}일 중 관찰 ${s.observed.length}일${s.missing.length > 0 ? ` · 빠진 날 ${s.missing.join(", ")}` : ""})`,
  );
  lines.push("");
  lines.push(
    renderTable(
      ["항목", "값"],
      [
        [
          "목표 +15분 이내 공개(D48)",
          `${ok}/${s.periodDays}일 — 정시 ${s.publish["on-time"]} · 허용 ${s.publish.allowed} · 지각 ${s.publish.late} · 미발행 ${s.publish.none} · 확인 불가 ${s.publish.unknown} · 최장 연속 ${s.longestStreak}일`,
        ],
        [
          "지연(분)",
          `평균 ${signed(s.avgDelayMinutes)} · 최대 ${signed(s.maxDelayMinutes)}(음수 = 일찍)`,
        ],
        [
          "계절 가드",
          `계절 위반 ${s.seasonViolations} · 확인 불가 ${s.seasonUnverified} · off-season 건너뜀 ${s.offSeasonSkips}`,
        ],
        [
          "비용(prod)",
          `합계 ${usd(s.cost.totalUsd)} · 하루 평균 ${s.cost.avgUsd === null ? "—" : usd(s.cost.avgUsd)} · 30일 환산 ${s.cost.monthlyProjectionUsd === null ? "—" : usd(s.cost.monthlyProjectionUsd)}(월 예산 $3)`,
        ],
        [
          "캐시 적중(요청 2개 이상인 날)",
          s.cache.multiRequestDays.length === 0
            ? "해당 날 없음"
            : [
                s.cache.plannedDays.length === 0
                  ? "한 실행이 2요청 이상 계획한 날 없음"
                  : `한 실행 2요청 이상 ${s.cache.plannedDays.length}일 중 적중 ${s.cache.hitDays.length}일(${s.cache.hitDays.join(", ") || "없음"})`,
                s.cache.retryOnlyDays.length > 0
                  ? `재시도·재실행으로 생긴 2요청 ${s.cache.retryOnlyDays.length}일(${s.cache.retryOnlyDays.join(", ")}) — 캐싱 꺼짐이라 미적중이 정상(D28)`
                  : "",
              ]
                .filter((x) => x !== "")
                .join(" · "),
        ],
        [
          "브리핑 mode",
          Object.entries(s.briefModes)
            .map(([k, n]) => `${k} ${n}`)
            .join(" · ") || "—",
        ],
        [
          "브리핑 잘림·재시도",
          `max_tokens ${s.briefTruncations}회 · FR-29 재시도 ${s.briefRetries}회`,
        ],
        [
          "소스 실패",
          s.sourceFailures.length === 0
            ? "없음"
            : s.sourceFailures
                .map(
                  (f) =>
                    `${f.id} ${f.days}일${f.errors.length > 0 ? `(${f.errors.join("·")})` : ""}`,
                )
                .join(", "),
        ],
        [
          "수집 시점 경기 상태(합)",
          `${s.matchStatus.days}일 — 종료 ${s.matchStatus.finished} · 진행 중 ${s.matchStatus.inProgress} · 그 밖 미종료 ${s.matchStatus.otherUnfinished} · 지연 의심 ${s.matchStatus.overdue ?? "판정 불가"}`,
        ],
      ].map(([k, v]) => [k!, cell(v)]),
    ),
  );
  lines.push("");
  if (s.cost.perDay.length > 0) {
    lines.push("일별 비용 (PRD §9.3 비용표 입력)");
    lines.push("");
    lines.push(
      renderTable(
        ["발행일", "비용", "요청", "출력 토큰", "캐시 R/W"],
        s.cost.perDay.map((p) => [
          p.date,
          usd(p.usd),
          String(p.requests),
          String(p.out),
          `${p.cacheRead}/${p.cacheWrite}`,
        ]),
      ),
    );
  }
  return lines.join("\n");
}

// ─── 문서 반영 ───────────────────────────────────────────────────────────

const OBS_DATA_HEADER =
  "v1 — observe 기록(손대지 말 것). 한 줄 = 발행일 하나 · 표·상세는 이 줄로 다시 그린다";

/** 문서 데이터 줄 → 하루 관찰(형식 오류 줄은 errors) */
export function readObservations(doc: string): {
  observations: DayObservation[];
  errors: string[];
} {
  const observations: DayObservation[] = [];
  const errors: string[] = [];
  for (const line of readDataLines(doc, OBS_DATA)) {
    if ("error" in line) {
      errors.push(`${line.key}: ${line.error}`);
      continue;
    }
    const parsed = DayObservationSchema.safeParse(line.json);
    if (parsed.success) observations.push(parsed.data);
    else errors.push(`${line.key}: 형식 오류`);
  }
  return { observations, errors };
}

/** 하루 관찰을 문서에 반영 — 데이터 줄 교체 → 일자별 표·상세 다시 그림(메모 칸 보존) */
export function applyDayObservations(
  doc: string,
  observations: readonly DayObservation[],
): string {
  let next = doc;
  for (const o of observations) {
    next = upsertDataLine(next, OBS_DATA, OBS_DATA_HEADER, o.date, o);
  }
  const all = readObservations(next).observations.sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  const memos = tableCellsByKey(readBlock(next, OBS_BLOCKS.daily), ["메모"]);
  next = replaceBlock(
    next,
    OBS_BLOCKS.daily,
    renderTable(
      DAILY_TABLE_HEADER,
      all.map((o) => dailyRow(o, memos.get(o.date)?.["메모"])),
    ),
  );
  next = replaceBlock(
    next,
    OBS_BLOCKS.details,
    [...all].reverse().map(dayDetail).join("\n\n"),
  );
  return next;
}

export function applyWeekSummary(doc: string, summary: WeekSummary): string {
  return replaceBlock(doc, OBS_BLOCKS.week, renderWeekSummary(summary));
}
