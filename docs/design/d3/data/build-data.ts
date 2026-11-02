/*
 * D3 시안 공용 실데이터 묶음 생성기 — 출력: docs/design/d3/data/d3-data.json
 * 실행: npx tsx docs/design/d3/data/build-data.ts (프로젝트 루트에서)
 *
 * 입력은 저장소 파일뿐이다(네트워크 0 · LLM 0 · 문구 생성 0):
 *   data/runs.json · data/runs-dev.json · configs/sources.json · configs/competitions.json · configs/national-team.json
 *   · data/teams/<slug>.json · configs/team-colors.json
 * 계산은 제품 코드의 순수 함수를 그대로 부른다 — 소스 건강도 `assessSourceHealth`(scripts/lib/source-health.ts),
 * 발행 슬롯 `publishSlot`(src/lib/time.ts), 호수 `issueNumber`(src/lib/issue.ts). /status를 구현하면 같은 함수를 쓴다.
 */
import fs from "node:fs";
import path from "node:path";

import { issueNumber } from "../../../../src/lib/issue";
import { kitTextColor } from "../../../../src/lib/kit-contrast";
import { kstDate, publishSlot, PUBLISH_GRACE_MINUTES, shiftDate } from "../../../../src/lib/time";
import { assessSourceHealth, classifySourceRun } from "../../../../scripts/lib/source-health";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const runs = read("data/runs.json") as any[];
const devRuns = read("data/runs-dev.json") as any[];
const sourcesCfg = read("configs/sources.json");
const sourceList: any[] = Array.isArray(sourcesCfg) ? sourcesCfg : sourcesCfg.sources;
const comps: any[] = read("configs/competitions.json");
const national = read("configs/national-team.json");

const TODAY = "2026-11-02";
const BUDGET = 3; // scripts/lib/cost.ts DEFAULT_MONTHLY_BUDGET_USD
const hhmm = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (date: string) => DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
const longLabel = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 (${dow(date)})`;
};

/* ── 발행 30일 띠 (발행일 단위) ── */
const prodCollect = runs.filter((r) => r.env === "prod" && r.job === "collect");
const FIRST = "2026-10-12";
const days: any[] = [];
for (let i = 29; i >= 0; i--) {
  const date = shiftDate(TODAY, -i);
  const dayRuns = prodCollect
    .filter((r) => kstDate(r.startedAt) === date)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const published = dayRuns.filter((r) => r.status === "success" || r.status === "partial");
  const failed = dayRuns.filter((r) => r.status === "failed");
  const slot = publishSlot(date);
  const targetKst = hhmm(slot.publishTarget);
  let state: string;
  let first: any = null;
  if (date < FIRST) state = "prelaunch";
  else if (published.length === 0) state = failed.length ? "failed" : "missed";
  else {
    first = published[0];
    const late = Date.parse(first.finishedAt) > Date.parse(slot.publishTarget) + PUBLISH_GRACE_MINUTES * 60e3;
    state = late ? "late" : "ontime";
  }
  days.push({
    date,
    md: `${date.slice(5, 7)}.${date.slice(8)}`,
    dow: dow(date),
    no: date >= FIRST ? issueNumber(date) : null,
    state,
    season: slot.season,
    target: targetKst,
    // 수집 완료 시각(KST) — 공개(배포 완료) 시각은 데이터에 없다(scope §4)
    finished: first ? hhmm(first.finishedAt) : null,
    finishedDate: first ? kstDate(first.finishedAt) : null,
    runs: dayRuns.length,
    failedRuns: failed.map((r) => ({ runId: r.runId, started: hhmm(r.startedAt) })),
  });
}
const count = (s: string) => days.filter((d) => d.state === s).length;
const runOk = prodCollect.filter((r) => r.status === "success" || r.status === "partial").length;
const runAll = prodCollect.filter((r) => r.status !== "skipped").length;

/* ── 마지막 발행 ── */
const lastPub = [...prodCollect].reverse().find((r) => r.status === "success" || r.status === "partial");
const lastDate = kstDate(lastPub.startedAt);
const lastSlot = publishSlot(lastDate);

/* ── 비용 (KST 달, prod + dev) — 화면에는 %만 ── */
const monthPct = (ym: string) => {
  const sum = [...runs, ...devRuns]
    .filter((r) => kstDate(r.startedAt).slice(0, 7) === ym)
    .reduce((s, r) => s + (r.costUsd || 0), 0);
  return Math.round((sum / BUDGET) * 10000) / 100;
};
const lastRecord = [...runs, ...devRuns].map((r) => r.finishedAt || r.startedAt).sort().pop();

/* ── 소스 건강도 (source-health 7일 집계 — 이번 = 마지막 prod collect) ── */
const cur = prodCollect[prodCollect.length - 1];
const health = assessSourceHealth({ history: runs, run: cur, current: cur.sources } as any);
const byId = Object.fromEntries(sourceList.map((s) => [s.id, s]));
const week = Array.from({ length: 7 }, (_, i) => shiftDate(TODAY, i - 6));
const sources = health.map((h: any) => {
  const s = byId[h.id] || {};
  const perDay = week.map((d) => {
    const st = prodCollect
      .filter((r) => kstDate(r.startedAt) === d)
      .map((r) => r.sources.find((x: any) => x.id === h.id))
      .filter(Boolean)
      .map((e: any) => classifySourceRun(e));
    // 그날 실행 중 하나라도 새 기사가 있으면 fresh, 모두 응답했지만 새 기사 없으면 no-new, 실패가 있으면 failed
    const v = st.includes("failed") ? "failed" : st.includes("fresh") ? "fresh" : st.includes("no-new") ? "no-new" : st.length ? st[0] : "none";
    return { date: d, md: `${d.slice(5, 7)}.${d.slice(8)}`, state: v, runs: st.length };
  });
  return {
    id: h.id,
    name: s.name,
    tier: s.tier,
    lang: s.lang,
    state: h.current.state,
    failStreak: h.failStreak.count,
    staleStreak: h.staleStreak.count,
    runs: h.stats.runs,
    attempts: h.stats.attempts,
    ok: h.stats.ok,
    items: h.stats.items,
    usable: h.stats.usable,
    perDay,
  };
});

/* ── 대회 · 팀 · A매치 ── */
const competitions = comps.map((c) => ({
  id: c.id, nameKo: c.nameKo, nameEn: c.nameEn, shortKo: c.shortKo,
  season: `${c.season}-${String((c.season + 1) % 100).padStart(2, "0")}`,
  startDate: c.startDate, endDate: c.endDate,
}));
const teamColors = read("configs/team-colors.json");
const tc = teamColors.teams || teamColors;
const teamSlugs = ["rennes", "atletico-madrid", "borussia-monchengladbach", "bayern-munchen", "tottenham-hotspur"];
const teams = teamSlugs.map((slug) => {
  const t = read(`data/teams/${slug}.json`);
  const c = tc[slug];
  return {
    slug, nameKo: t.nameKo, nameEn: t.nameEn, short: c.short, comp: t.comp, alsoIn: t.alsoIn || [],
    k1: c.colors[0], k2: c.colors[1], kf: kitTextColor(c.colors[0]),
  };
});
const intl = national.matches
  .filter((m: any) => m.status === "scheduled")
  .map((m: any) => ({
    id: m.id, opponent: m.opponent, home: m.home, venue: m.venue, competition: m.competition,
    date: kstDate(m.kickoff), md: `${kstDate(m.kickoff).slice(5, 7)}.${kstDate(m.kickoff).slice(8)}`,
    dow: dow(kstDate(m.kickoff)), time: hhmm(m.kickoff), utc: m.kickoff,
  }));
const windowFrom = shiftDate(intl[0].date, -3);
const windowTo = shiftDate(intl[intl.length - 1].date, 3);

const out = {
  generatedFrom: "data/runs.json · data/runs-dev.json · configs/* · data/teams/* (2026-11-02 파일 기준)",
  today: { date: TODAY, label: longLabel(TODAY), no: issueNumber(TODAY) },
  issue100: { date: "2027-01-19", label: longLabel("2027-01-19"), no: issueNumber("2027-01-19") },
  status: {
    lastPublish: {
      date: lastDate, label: longLabel(lastDate), no: issueNumber(lastDate),
      started: hhmm(lastPub.startedAt), finished: hhmm(lastPub.finishedAt),
      target: hhmm(lastSlot.publishTarget), season: lastSlot.season, runId: lastPub.runId,
    },
    window: { from: days[0].date, to: TODAY, days: 30 },
    runRate: { ok: runOk, all: runAll, pct: Math.round((runOk / runAll) * 1000) / 10 },
    dayCounts: { ontime: count("ontime"), late: count("late"), missed: count("missed"), failed: count("failed"), prelaunch: count("prelaunch") },
    failedRunDays: days.filter((d) => d.failedRuns.length).map((d) => d.date),
    days,
    cost: { thisMonth: { ym: "2026-11", pct: monthPct("2026-11") }, lastMonth: { ym: "2026-10", pct: monthPct("2026-10") } },
    lastRecordKst: `${kstDate(lastRecord)} ${hhmm(lastRecord)}`,
    sources,
  },
  competitions,
  teams,
  intl: { matches: intl, from: windowFrom, to: windowTo },
  emptyStates: {
    ended: { comp: "UCL", date: competitions.find((c) => c.id === "UCL")!.endDate },
    upcomingSample: { comp: "LALIGA", date: competitions.find((c) => c.id === "LALIGA")!.startDate },
    searchQuery: "Magdeburg",
  },
  copy: {
    tagline: "매일 아침, 밤사이 유럽 축구를 한눈에.",
    offSeason: {
      ended: { label: "종료", note: "시즌이 끝났어요. 다음 시즌 일정이 나오면 이 자리에 다시 채워집니다." },
      upcoming: { label: "개막", note: "아직 시즌 전이에요. 경기가 열리면 이 자리에 5줄이 채워집니다." },
    },
    search: { none: "결과가 없어요", hint: "선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾아요" },
    offline: {
      h1: "연결이 끊겨 열 수 없어요",
      lead: "이 페이지는 아직 저장해 두지 않았어요.",
      body: "연결이 돌아오면 다시 열어 주세요. 저장해 둔 최근 호는 연결 없이도 볼 수 있어요.",
      saved: "저장해 둔 호",
    },
  },
};
fs.writeFileSync(path.join(__dirname, "d3-data.json"), JSON.stringify(out, null, 1) + "\n");
console.log("d3-data.json", out.status.dayCounts, out.status.runRate, out.status.cost, out.status.lastRecordKst);
