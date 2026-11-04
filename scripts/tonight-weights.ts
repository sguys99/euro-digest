/**
 * 오늘 밤 가중치 분석 (plan M5-12 · M2-16 이월 ④, DECISIONS D1 §8 #3) — 분석 전용, 데이터·설정을 쓰지 않는다.
 *
 * 지금 저장소의 데이터(`data/competitions/*.json` 일정·결과, `configs/korean-players.json` 소속팀, `configs/bigmatch-rules.json`)로
 * 기준 날짜 범위의 하루하루 선정(`selectTonight` — 화면과 같은 순수 함수)을 다시 계산해 이유별 점유율과 주말 한국 경기 비중을
 * 표(Markdown)로 출력한다. 가중치 대안도 같은 계산을 한다. **가중치는 바꾸지 않는다**(2026-11-04 사용자 결정 — 분석만).
 *
 * 순위 두 방식(`--standings`):
 * - `asof`(기본): 그날 창 시작 전에 끝난 경기 결과로 순위표를 다시 만든다(승점 → 득실 → 득점 → slug). 지난날 선정에 그날의 순위를 쓴다.
 * - `current`: 지금 순위표를 모든 날에 쓴다(지난날에는 그 뒤 결과가 섞인다 — 비교용).
 * 한국 선수 소속팀은 두 방식 모두 지금 설정이다(시즌 중 이적 없음 — 2026-27 초안 9명).
 *
 * 실행: `npx tsx scripts/tonight-weights.ts [--from 2026-10-08] [--to 2026-11-04] [--standings asof|current]`
 */
import { parseArgs } from "node:util";

import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { readConfigFile } from "@/lib/data/config-file";
import {
  BIGMATCH_RULES_PATH,
  TONIGHT_KOREAN_PLAYERS_PATH,
} from "@/lib/data/tonight";
import {
  BigmatchRulesFileSchema,
  KoreanPlayersFileSchema,
  type BigmatchRulesFile,
  type Match,
  type StandingRow,
} from "@/lib/schema";
import {
  selectTonight,
  TONIGHT_RULES,
  type TonightCompetition,
  type TonightPick,
  type TonightRule,
} from "@/lib/tonight";
import { kstWindowRangeUtc, shiftDate } from "@/lib/time";

type Weights = Record<TonightRule, number>;

/** 비교할 가중치 — 지금(기준) + 대안 2개 */
const VARIANTS: readonly { id: string; label: string; weights: Weights }[] = [
  {
    id: "now",
    label: "지금 (한국 5 · UCL 4 · 상위 4 · 더비 4 · 승점 차 2 · 빅클럽 1)",
    weights: {
      korean: 5,
      ucl: 4,
      topClash: 4,
      derby: 4,
      closeRace: 2,
      bigClub: 1,
    },
  },
  {
    id: "alt-a",
    label: "대안 A — 한국 3 (나머지 그대로)",
    weights: {
      korean: 3,
      ucl: 4,
      topClash: 4,
      derby: 4,
      closeRace: 2,
      bigClub: 1,
    },
  },
  {
    id: "alt-b",
    label: "대안 B — 한국 4 · 상위 5 · 더비 5 (나머지 그대로)",
    weights: {
      korean: 4,
      ucl: 4,
      topClash: 5,
      derby: 5,
      closeRace: 2,
      bigClub: 1,
    },
  },
  // 대안이 아니라 기준점 — 한국 가중치가 없을 때의 상위 5와 비교해 '한국 가중치가 얻은 자리'를 센다
  {
    id: "ref-0",
    label: "참고 — 한국 0 (비교 기준, 대안 아님)",
    weights: {
      korean: 0,
      ucl: 4,
      topClash: 4,
      derby: 4,
      closeRace: 2,
      bigClub: 1,
    },
  },
];

const RULE_KO: Record<TonightRule, string> = {
  korean: "한국",
  ucl: "UCL",
  topClash: "상위 맞대결",
  derby: "더비",
  closeRace: "승점 차",
  bigClub: "빅클럽",
};

/** 가중치만 바꾼 규칙 사본 */
function withWeights(
  rules: BigmatchRulesFile,
  weights: Weights,
): BigmatchRulesFile {
  const r = structuredClone(rules);
  for (const rule of TONIGHT_RULES) r.rules[rule].weight = weights[rule];
  return r;
}

/** `before`(UTC ms) 전에 끝난 경기로 순위표를 다시 만든다 — 승점 → 득실 → 득점 → slug */
function standingsAsOf(
  matches: readonly Match[],
  teams: readonly string[],
  before: number,
): StandingRow[] {
  const acc = new Map<string, StandingRow>();
  for (const team of teams) {
    acc.set(team, {
      pos: 0,
      prevPos: null,
      team,
      played: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      pts: 0,
      form: [],
      zone: "none",
    });
  }
  for (const m of matches) {
    if (m.status !== "finished" || !m.score) continue;
    if (Date.parse(m.kickoff) >= before) continue;
    const sides: [string, number, number][] = [
      [m.home, m.score.h, m.score.a],
      [m.away, m.score.a, m.score.h],
    ];
    for (const [team, f, a] of sides) {
      const row = acc.get(team);
      if (!row) continue;
      row.played += 1;
      row.gf += f;
      row.ga += a;
      if (f > a) {
        row.w += 1;
        row.pts += 3;
      } else if (f === a) {
        row.d += 1;
        row.pts += 1;
      } else row.l += 1;
    }
  }
  const rows = [...acc.values()].sort(
    (x, y) =>
      y.pts - x.pts ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      (x.team < y.team ? -1 : 1),
  );
  rows.forEach((row, i) => (row.pos = i + 1));
  return rows;
}

/** 기준 날짜(KST)의 요일 0=일 … 6=토 */
function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
/** 주말 밤 = 기준 날짜 금·토·일(창이 토·일·월 새벽까지) */
function isWeekend(date: string): boolean {
  return [0, 5, 6].includes(weekday(date));
}

/** 한국 이유만으로 들어온 픽인가(빅클럽 1점은 덤으로 본다) */
function koreanOnly(pick: TonightPick): boolean {
  return (
    pick.rules.includes("korean") &&
    pick.rules.every((r) => r === "korean" || r === "bigClub")
  );
}
/** 한국 없이 '경기 자체' 이유(UCL·상위 맞대결·더비)가 있는 경기 */
function marquee(pick: TonightPick): boolean {
  return (
    !pick.rules.includes("korean") &&
    pick.rules.some((r) => r === "ucl" || r === "topClash" || r === "derby")
  );
}

interface DayResult {
  date: string;
  candidates: TonightPick[];
  picks: TonightPick[];
}

function pct(n: number, d: number): string {
  return d === 0 ? "–" : `${Math.round((n / d) * 100)}%`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "2026-10-08" },
      to: { type: "string", default: "2026-11-04" },
      standings: { type: "string", default: "asof" },
    },
  });
  const from = values.from;
  const to = values.to;
  const mode = values.standings === "current" ? "current" : "asof";

  const baseRules = readConfigFile(
    BIGMATCH_RULES_PATH,
    BigmatchRulesFileSchema,
    "오늘 밤 선별 규칙",
    null as unknown as BigmatchRulesFile, // 파일이 없으면 분석할 수 없다 — 아래에서 던진다
  );
  if (!baseRules) throw new Error("configs/bigmatch-rules.json 없음");
  const koreanPlayers = readConfigFile(
    TONIGHT_KOREAN_PLAYERS_PATH,
    KoreanPlayersFileSchema,
    "한국 선수 설정",
    [],
  );
  const all = loadAllCompetitionData();

  const dates: string[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) dates.push(d);

  const out: string[] = [];
  out.push(
    `기간 ${from} ~ ${to} (${dates.length}일) · 순위 ${mode === "asof" ? "그날 기준 재계산" : "지금 순위표"} · 한국 선수 ${koreanPlayers.filter((p) => p.active).length}명(지금 소속)`,
    "",
  );

  const perVariant = new Map<string, DayResult[]>();
  for (const variant of VARIANTS) {
    const rules = withWeights(baseRules, variant.weights);
    // 후보 전부를 보려고 maxMatches를 크게 둔 사본도 만든다
    const rulesAll = { ...rules, maxMatches: 999 };
    const days: DayResult[] = [];
    for (const date of dates) {
      const window = kstWindowRangeUtc(date, rules.window);
      const start = Date.parse(window.start);
      const competitions: TonightCompetition[] = all.map((c) => ({
        comp: c.comp,
        matches: c.matches,
        standings:
          mode === "current" || c.comp === "UCL"
            ? c.standings
            : standingsAsOf(
                c.matches,
                c.standings.map((r) => r.team),
                start,
              ),
      }));
      const input = { competitions, koreanPlayers, baseKstDate: date };
      const picks = selectTonight({ ...input, rules }).picks;
      const candidates = selectTonight({ ...input, rules: rulesAll }).picks;
      days.push({ date, candidates, picks });
    }
    perVariant.set(variant.id, days);
  }

  const ref = perVariant.get("ref-0") ?? [];
  /** 그날 이 가중치의 상위 5 중 한국 0 기준에는 없는 경기(한국 가중치가 얻은 자리)와 그 대신 빠진 경기 */
  const koreanSwap = (days: DayResult[], i: number) => {
    const d = days[i];
    const r = ref[i];
    if (!d || !r) return { gained: [], pushed: [] };
    const ids = new Set(d.picks.map((p) => p.match.id));
    const refIds = new Set(r.picks.map((p) => p.match.id));
    return {
      gained: d.picks.filter((p) => !refIds.has(p.match.id)),
      pushed: r.picks.filter((p) => !ids.has(p.match.id)),
    };
  };

  // ── 표 1: 가중치별 요약 ──
  out.push(
    "| 가중치 | 선정 밤 | 선정 경기 | 한국 | UCL | 상위 맞대결 | 더비 | 승점 차 | 빅클럽 | 한국만 이유 | 주말 밤 자리 중 한국 | 한국 가중치가 얻은 자리 (주말) | 그 대신 빠진 경기 중 UCL·상위·더비 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const variant of VARIANTS) {
    if (variant.id === "ref-0") continue;
    const days = perVariant.get(variant.id) ?? [];
    const picks = days.flatMap((d) => d.picks);
    const nights = days.filter((d) => d.picks.length > 0).length;
    const hit = (r: TonightRule) =>
      pct(picks.filter((p) => p.rules.includes(r)).length, picks.length);
    const weekendDays = days.filter(
      (d) => isWeekend(d.date) && d.picks.length > 0,
    );
    const weekendPicks = weekendDays.flatMap((d) => d.picks);
    const weekendKorean = weekendPicks.filter((p) =>
      p.rules.includes("korean"),
    ).length;
    let gained = 0;
    let gainedWeekend = 0;
    let pushedMarquee = 0;
    days.forEach((d, i) => {
      const swap = koreanSwap(days, i);
      gained += swap.gained.length;
      if (isWeekend(d.date)) gainedWeekend += swap.gained.length;
      pushedMarquee += swap.pushed.filter(marquee).length;
    });
    out.push(
      `| ${variant.label} | ${nights} | ${picks.length} | ${hit("korean")} | ${hit("ucl")} | ${hit("topClash")} | ${hit("derby")} | ${hit("closeRace")} | ${hit("bigClub")} | ${pct(picks.filter(koreanOnly).length, picks.length)} | ${weekendKorean}/${weekendPicks.length} (${pct(weekendKorean, weekendPicks.length)}) | ${gained} (${gainedWeekend}) | ${pushedMarquee} |`,
    );
  }
  out.push("");

  // ── 표 1-2: 주말 밤별(지금 가중치) — 한국 자리와 한국 가중치가 밀어낸 경기 ──
  const nowAll = perVariant.get("now") ?? [];
  const short = (p: TonightPick) =>
    `${p.match.home}–${p.match.away} ${p.score - (p.rules.includes("korean") ? 5 : 0)}(${
      p.rules
        .filter((r) => r !== "korean")
        .map((r) => RULE_KO[r])
        .join("+") || "이유 없음"
    })`;
  out.push(
    "| 주말 밤 | 후보 | 한국 자리 | 한국 가중치가 얻은 자리 | 그 대신 빠진 경기 (한국 0 기준 점수 · 이유) |",
    "|---|---|---|---|---|",
  );
  nowAll.forEach((d, i) => {
    if (!isWeekend(d.date) || d.picks.length === 0) return;
    const swap = koreanSwap(nowAll, i);
    const kr = d.picks.filter((p) => p.rules.includes("korean")).length;
    out.push(
      `| ${d.date} (${WEEKDAY_KO[weekday(d.date)]}) | ${d.candidates.length} | ${kr}/${d.picks.length} | ${swap.gained.map(short).join("<br>") || "–"} | ${swap.pushed.map(short).join("<br>") || "–"} |`,
    );
  });
  out.push("");

  // ── 표 2: 점수 기여 비중(지금 가중치) ──
  const nowDays = perVariant.get("now") ?? [];
  const nowPicks = nowDays.flatMap((d) => d.picks);
  const nowWeights = VARIANTS[0]?.weights;
  if (nowWeights) {
    const total = nowPicks.reduce((s, p) => s + p.score, 0);
    out.push("| 이유(가중치) | 걸린 선정 경기 | 점수 기여 |", "|---|---|---|");
    for (const r of TONIGHT_RULES) {
      const n = nowPicks.filter((p) => p.rules.includes(r)).length;
      out.push(
        `| ${RULE_KO[r]} (${nowWeights[r]}) | ${n}/${nowPicks.length} (${pct(n, nowPicks.length)}) | ${pct(n * nowWeights[r], total)} |`,
      );
    }
    out.push("");
  }

  // ── 표 3: 날짜별(지금 vs 대안) ──
  out.push(
    "| 날짜 | 후보 | 지금 상위 5 (점수 · 이유) | 대안 A와 다른 경기 | 대안 B와 다른 경기 |",
    "|---|---|---|---|---|",
  );
  const label = (p: TonightPick) =>
    `${p.match.home}–${p.match.away} ${p.score}(${p.rules.map((r) => RULE_KO[r]).join("+")})`;
  for (const [i, d] of nowDays.entries()) {
    if (d.candidates.length === 0) continue;
    const diff = (id: string) => {
      const other = perVariant.get(id)?.[i];
      if (!other) return "–";
      const ids = new Set(d.picks.map((p) => p.match.id));
      const oIds = new Set(other.picks.map((p) => p.match.id));
      const added = other.picks.filter((p) => !ids.has(p.match.id));
      const removed = d.picks.filter((p) => !oIds.has(p.match.id));
      if (added.length === 0) return "같음";
      return `+${added.map((p) => `${p.match.home}–${p.match.away}`).join(", ")} / −${removed.map((p) => `${p.match.home}–${p.match.away}`).join(", ")}`;
    };
    out.push(
      `| ${d.date} (${WEEKDAY_KO[weekday(d.date)]}) | ${d.candidates.length} | ${d.picks.map(label).join("<br>")} | ${diff("alt-a")} | ${diff("alt-b")} |`,
    );
  }

  console.log(out.join("\n"));
}

main();
