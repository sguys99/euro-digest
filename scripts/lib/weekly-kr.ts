/**
 * 한국 선수 주간 리포트 — 순수 함수 (M3-07 — PRD FR-90~92, §15 D24·D28·D65, LLM 호출 지점 #3 '한국 선수 주간 총평').
 * I/O(설정·원장 읽기, Batches 호출, 파일 쓰기)는 weekly-kr-stage.ts가 맡는다. 이 파일은 입력 → 출력만 한다.
 *
 * ① 주간 표(FR-91 — `buildWeeklyTable`)
 *   - 기간: UTC 월 00:00 ~ 일 23:59:59.999(D65 ① — time.ts isoWeekRangeUtc). 원장(`data/matches`)의 킥오프가 그 안인 경기만.
 *     원장에는 종료(FT·AET·PEN) 경기만 있으므로 실행 시각에 끝나지 않은 경기는 빠진다(단계가 로그로 남긴다).
 *   - 행 대상: **추적 중인 등록 선수** = `active` + `apiFootballId` 있음 + 원장 meta `playerSince`가 있고 주 끝 날짜 이하. 그 주에
 *     경기가 없거나 출전하지 않은 선수도 행을 둔다(시안 D2 '출전 기록 · n명' — 벤치·명단 제외 행 포함). 표 밖 선수(기록 연결 전 ·
 *     기타 리그 · 집계 시작 전)는 `excluded`로 돌려준다(화면 각주는 korean-players.json·korean.json으로 만든다).
 *   - 출전 = 선발·교체(분 > 0) 또는 골·도움(korean-players-data.ts `appearedIn` — 시즌 누적과 같은 규칙). apps = 출전 경기 수,
 *     minutes = 출전 경기의 분 합(라인업 없는 경기 `unknown`은 분을 모른다 — 0으로 더하고 `unknownMinutes`로 센다), goals·assists 합.
 * ② MVP(FR-92·D65 ②③ — `rankWeeklyRows`): 점수 = 골×3 + 도움×2 + 출전 경기 수. 동점 → 출전 시간 많은 순 → 골 많은 순 → 그래도
 *   같으면 공동 MVP(가나다 첫 선수가 `mvp`, 나머지 `coMvp` 가나다순). 골·도움이 없는 주도 같은 규칙. 출전 0명이면 mvp null.
 *   행 순서 = 같은 순위 규칙(마지막은 가나다) — 화면의 '다음 순위'는 행 순서·점수(골·도움·출전으로 다시 계산)로 만든다.
 * ③ LLM 입력(D24 — **정형 데이터만**, 기사 텍스트 없음 — `weeklyLlmInput`): 표 행 + MVP + 선수별 경기(날짜·대회·상대 원문 영문·
 *   홈/원정·결과·스코어(소속팀 먼저)·승부차기·출전 상태·분·골·도움·골 분). 이름은 영문 원문(코드가 names.ko로 치환 — FR-24).
 * ④ 출력(`parseWeeklyOutput`): 짧은 키 JSON `{ "s": ["문장", …] }` 3~5문장(zod strict). 출력 전체를 감싼 코드블록만 벗긴다(브리핑과 같은
 *   관용 — brief.ts unwrapBriefOutput).
 * ⑤ 코드 검증(`checkWeeklySummary` — M0-30: zod만으로는 영어 출력·한자·음역을 거르지 못한다). 고유명사 치환·조사 보정 뒤 문장으로:
 *   한자·가나 혼입 · 한국어 비율(문장마다 — 이름을 가린 한글 < 라틴) · 이름 밖 라틴 낱말(허용: 입력의 미등록 원문 이름 · 'PK' · 'MVP') ·
 *   문장 형식('다.'로 끝남, 줄바꿈 없음, 문장당 길이 상한) · 입력에 없는 등록 이름(사전의 선수·팀 한글 표기가 입력 밖) ·
 *   스코어 'a-b'가 입력 경기에 없음 · 숫자 근거(문장의 모든 수가 입력 수 집합에 있음) · 한 선수만 언급한 문장의 'n골'·'n도움'·'n분'·
 *   'n경기'는 그 선수 값 · 'MVP'를 쓴 문장에는 MVP(공동 포함) 이름 · 경기 대조(⑤-2 — 절의 스코어(소속팀 먼저)·승패 동사·홈/원정·
 *   상대·대회·날짜·승부차기가 그 선수 경기 하나와 맞음, 2026-11-01 리뷰). 하나라도 걸리면 출력 전체 실패 — 브리핑과 달리 줄 단위
 *   강등이 없다(총평은 한 문단 — 2026-11-01 사용자 결정: 1회 재시도 후 템플릿).
 * ⑥ 템플릿(`weeklyTemplateSummary` — `summaryAi:false`): 표·MVP에서 코드가 쓰는 사실 문장(입력 밖 정보 없음).
 */
import { z } from "zod";

import type {
  AfPendingEntry,
  CompId,
  KoreanPlayer,
  LedgerAppearance,
  LedgerMatch,
  PlayerComp,
  WeeklyReport,
  WeeklyReportMatch,
} from "@/lib/schema";
import { formatKst, utcDate } from "@/lib/time";

import { unwrapBriefOutput } from "./brief";
import { estimateCost, type CostEstimate } from "./cost";
import { withJosa } from "./josa";
import {
  FD_LINK_TOLERANCE_MS,
  appearedIn,
  appearanceOf,
  fdMatchIdOf,
  type LogContext,
} from "./korean-players-data";
import type { LlmRequest } from "./llm";
import { foldName, substituteNames, type NameIndex } from "./names";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 한국 선수 주간 리포트 폴더(저장소 상대 — src/lib/schema/registry.ts `data/players/weekly/????-??.json`) */
export const WEEKLY_REPORT_DIR = "data/players/weekly";

/** 지시문(저장소 루트 기준). 바꾸면 prod 주간 총평 지시문이 바뀐다 — 프롬프트 변경으로 다룬다 */
export const WEEKLY_KR_PROMPT_PATH = "configs/prompts/weekly-kr.md";
/**
 * max_tokens(thinking 포함) — 브리핑(D57)과 같은 16,384(llm.ts MAX_TOKENS_CEILING — 전송 계층 상한과 같다, 올리지 않음).
 * 입력·출력이 브리핑보다 작아 실제 출력은 수천 토큰이지만 적응형 thinking 양이 흔들려(브리핑 1,068~9,483) 잘림을 피하려 같은 값을 둔다.
 * 비용은 쓴 만큼이고, 비용 가드 최악값만 이 값으로 잡는다(배치 50% — 1회 출력 최악 약 $0.0041).
 */
export const WEEKLY_KR_MAX_TOKENS = 16_384;
/** D28 원칙 — 적응형 thinking + effort medium 명시(브리핑과 같다) */
export const WEEKLY_KR_EFFORT = "medium" as const;
export const WEEKLY_KR_THINKING = "adaptive" as const;
/** 첫 시도 + 출력 실패 재시도 1회(zod·코드 검증 합쳐 1회 — 2026-11-01 사용자 결정) */
export const WEEKLY_KR_MAX_ATTEMPTS = 2;
export const WEEKLY_SENTENCES_MIN = 3;
export const WEEKLY_SENTENCES_MAX = 5;
/** 문장 1개 길이 상한(치환 뒤 글자) — 총평 문단 16.5/19px 본문(DESIGN §9.3 D2)이라 브리핑 80자보다 넉넉하다 */
export const WEEKLY_SENTENCE_MAX_CHARS = 140;
/** 이름 밖에 남아도 되는 라틴 낱말 */
export const WEEKLY_LATIN_ALLOWED: ReadonlySet<string> = new Set(["PK", "MVP"]);

// ─── ① 주간 표 ──────────────────────────────────────────────────────────

/**
 * 한 선수의 그 주 경기 1건 — LLM 입력·템플릿·검사 근거(필드 그대로)이자 리포트 `rows[].matches`의 원천(`reportMatchOf`로 스키마 형태
 * 로 바꾼다 — 2026-11-01 사용자 결정). LLM 입력(`weeklyLlmInput`)은 고른 필드만 쓰므로 링크 필드를 더해도 입력이 바뀌지 않는다.
 */
export interface WeeklyMatchLine {
  matchId: string; // 원장 키 af-<id>
  /** 리포트·korean.json 경기 id — 대회 파일 경기 id(fd-…, korean-players-data.ts fdMatchIdOf), 찾지 못하면 원장 키 */
  logMatchId: string;
  /** 대회 원문 이름 — comp "OTHER"이고 원장 league가 비어 있지 않을 때만(PlayerMatchLog.leagueRaw와 같다) */
  leagueRaw: string | null;
  /** 상대 팀 slug(team-ids.json 역매핑) — 없으면 null */
  opponentSlug: string | null;
  kickoff: string; // UTC
  comp: PlayerComp;
  /** 대회 영문 이름 — 6개 대회는 competitions.json nameEn, 그 밖은 원장 league 원문 */
  compName: string;
  /** 소속팀 원문 이름(원장) */
  team: string;
  /** 상대 원문 이름(원장) */
  opponent: string;
  home: boolean;
  /** 소속팀 기준(정규시간 + 연장) */
  score: { for: number; against: number };
  /** 승부차기(소속팀 기준) — 승부차기 경기만 */
  pens: { for: number; against: number } | null;
  status: LedgerAppearance;
  /** 출전 분 — start·sub는 원장 분, bench·absent 0, unknown null */
  minutes: number | null;
  goals: number;
  assists: number;
  /** 골 분 표기 "63"·"90+2"(자책골 제외, 시간 순) — 득점 목록이 불완전(goalsComplete false)하면 빈 배열 */
  goalMinutes: string[];
  appeared: boolean;
}

export interface WeeklyPlayerRow {
  player: KoreanPlayer;
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  /** MVP 점수 = 골×3 + 도움×2 + 출전 */
  points: number;
  /** 시간 순 */
  matches: WeeklyMatchLine[];
}

export type WeeklyExcludeReason =
  | "inactive" // 기타 리그 등(FR-64)
  | "no-api-id" // 기록 연결 전
  | "not-tracked" // 원장 playerSince 없음(추적 시작 전)
  | "since-after-week"; // 집계 시작일이 그 주 뒤

export interface WeeklyTable {
  week: string;
  range: { from: string; to: string };
  /** 순위 순(MVP 규칙) */
  rows: WeeklyPlayerRow[];
  mvp: string | null;
  coMvp: string[];
  excluded: Array<{ slug: string; reason: WeeklyExcludeReason }>;
  /** 라인업이 없어 분을 모르는 출전 경기 수(분 합에 0으로 들어갔다) */
  unknownMinutes: number;
}

export interface WeeklyTableInput {
  week: string;
  range: { from: string; to: string };
  players: readonly KoreanPlayer[];
  ledger: readonly LedgerMatch[];
  /** 원장 meta.playerSince */
  playerSince: Readonly<Record<string, string>>;
  /** 6개 대회 id → 영문 이름(competitions.json nameEn) */
  compNames: Readonly<Partial<Record<PlayerComp, string>>>;
  /**
   * 리포트 경기 줄의 링크(상대 slug·대회 파일 경기 id) — korean.json 경기 로그와 같은 문맥(team-ids·data/competitions).
   * 없으면 상대 slug null·경기 id는 원장 키(표·LLM 입력은 영향 없음).
   */
  links?: LogContext;
}

const NO_LINKS: LogContext = { afToSlug: new Map(), competitions: {} };

/** MVP 점수(FR-92) */
export function mvpPoints(r: {
  goals: number;
  assists: number;
  apps: number;
}): number {
  return r.goals * 3 + r.assists * 2 + r.apps;
}

const koCollator = new Intl.Collator("ko");

/** 순위 비교 — 점수 → 출전 시간 → 골(내림차순), 마지막 가나다(D65 ②) */
function compareRank(a: WeeklyPlayerRow, b: WeeklyPlayerRow): number {
  return (
    b.points - a.points ||
    b.minutes - a.minutes ||
    b.goals - a.goals ||
    koCollator.compare(a.player.nameKo, b.player.nameKo) ||
    (a.player.slug < b.player.slug ? -1 : a.player.slug > b.player.slug ? 1 : 0)
  );
}

/** 행 정렬 + MVP·공동 MVP(머리 주석 ②) */
export function rankWeeklyRows(rows: readonly WeeklyPlayerRow[]): {
  rows: WeeklyPlayerRow[];
  mvp: string | null;
  coMvp: string[];
} {
  const sorted = [...rows].sort(compareRank);
  const top = sorted[0];
  if (!top || top.apps === 0) return { rows: sorted, mvp: null, coMvp: [] };
  const group = sorted.filter(
    (r) =>
      r.points === top.points &&
      r.minutes === top.minutes &&
      r.goals === top.goals,
  );
  return {
    rows: sorted,
    mvp: group[0]!.player.slug,
    coMvp: group.slice(1).map((r) => r.player.slug),
  };
}

function goalMinuteLabel(g: { minute: number; extra: number | null }): string {
  return g.extra !== null && g.extra > 0
    ? `${g.minute}+${g.extra}`
    : String(g.minute);
}

/** 원장 경기 + 선수 → 그 주 경기 1건 */
function matchLineOf(
  m: LedgerMatch,
  afId: number,
  compNames: WeeklyTableInput["compNames"],
  links: LogContext,
): WeeklyMatchLine | null {
  const row = m.korean.find((r) => r.player === afId);
  if (!row) return null;
  const own = row.side;
  const other = own === "home" ? "away" : "home";
  const comp: PlayerComp = m.comp ?? "OTHER";
  const { minutes } = appearanceOf(row);
  const goalMinutes = m.goalsComplete
    ? m.goals
        .filter((g) => g.kind !== "own-goal" && g.scorer.id === afId)
        .map(goalMinuteLabel)
    : [];
  const line: WeeklyMatchLine = {
    matchId: m.id,
    logMatchId: fdMatchIdOf(m, links) ?? m.id,
    leagueRaw:
      m.comp === null && m.league.trim() !== "" ? m.league.trim() : null,
    opponentSlug: links.afToSlug.get(m[other].id) ?? null,
    kickoff: m.kickoff,
    comp,
    compName:
      (m.comp !== null ? compNames[m.comp] : undefined) ??
      (m.league.trim() || comp),
    team: m[own].name,
    opponent: m[other].name,
    home: own === "home",
    score: { for: m.ft[own], against: m.ft[other] },
    pens: m.pens ? { for: m.pens[own], against: m.pens[other] } : null,
    status: row.status,
    minutes,
    goals: row.goals,
    assists: row.assists,
    goalMinutes,
    appeared: false,
  };
  line.appeared = appearedIn({
    started:
      row.status === "start" ? true : row.status === "unknown" ? null : false,
    minutes,
    goals: row.goals,
    assists: row.assists,
  });
  return line;
}

/** 원장 + 명단 → 주간 표(머리 주석 ①②) */
export function buildWeeklyTable(input: WeeklyTableInput): WeeklyTable {
  const from = Date.parse(input.range.from);
  const to = Date.parse(input.range.to);
  const weekEndDate = utcDate(input.range.to);
  const inWeek = input.ledger
    .filter((m) => {
      const t = Date.parse(m.kickoff);
      return t >= from && t <= to;
    })
    .sort(
      (a, b) =>
        Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
        Number(a.id.slice(3)) - Number(b.id.slice(3)),
    );
  const excluded: WeeklyTable["excluded"] = [];
  const rows: WeeklyPlayerRow[] = [];
  let unknownMinutes = 0;
  const seen = new Set<string>();
  for (const p of input.players) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    if (!p.active) {
      excluded.push({ slug: p.slug, reason: "inactive" });
      continue;
    }
    if (p.apiFootballId === null) {
      excluded.push({ slug: p.slug, reason: "no-api-id" });
      continue;
    }
    const since = Object.hasOwn(input.playerSince, p.slug)
      ? input.playerSince[p.slug]
      : undefined;
    if (since === undefined) {
      excluded.push({ slug: p.slug, reason: "not-tracked" });
      continue;
    }
    if (since > weekEndDate) {
      excluded.push({ slug: p.slug, reason: "since-after-week" });
      continue;
    }
    const afId = p.apiFootballId;
    const links = input.links ?? NO_LINKS;
    const matches = inWeek
      .filter((m) => utcDate(m.kickoff) >= since)
      .map((m) => matchLineOf(m, afId, input.compNames, links))
      .filter((l): l is WeeklyMatchLine => l !== null);
    let apps = 0;
    let minutes = 0;
    let goals = 0;
    let assists = 0;
    for (const l of matches) {
      goals += l.goals;
      assists += l.assists;
      if (!l.appeared) continue;
      apps += 1;
      if (l.minutes === null) unknownMinutes += 1;
      else minutes += l.minutes;
    }
    rows.push({
      player: p,
      apps,
      minutes,
      goals,
      assists,
      points: mvpPoints({ goals, assists, apps }),
      matches,
    });
  }
  const ranked = rankWeeklyRows(rows);
  return {
    week: input.week,
    range: { ...input.range },
    rows: ranked.rows,
    mvp: ranked.mvp,
    coMvp: ranked.coMvp,
    excluded,
    unknownMinutes,
  };
}

// ─── ①-2 누락 가능 경기 ─────────────────────────────────────────────────

/**
 * 주간 구간 안인데 원장에 없는 한국 선수 경기(정기 실행 월 08:00 KST = 일 23:00 UTC — 일요일 늦은 경기가 원장에 아직 없을 수 있다).
 * 발행은 계속하고 경고·재생성 안내만 한다(2026-11-01 리뷰). 근거 두 가지:
 *   - 일정(`schedule`): 대회 파일(data/competitions — football-data)에서 표 행 선수(추적 중인 등록 선수)의 소속팀(korean-players `team`)
 *     경기 중 킥오프가 구간 안이고 연기(postponed)가 아닌데, 원장 경기와 연결되지 않고(fdMatchIdOf) 그 선수 주간 경기 줄에도 킥오프
 *     ±3시간(FD_LINK_TOLERANCE_MS) 경기가 없는 것. 같은 경기가 이월 목록에도 있으면 `pending: true`.
 *   - 이월(`af-pending`): data/cache/af-pending.json(미종료 이월) 중 킥오프가 구간 안이고 대회가 null(한국 선수 소속팀의 기타 대회 —
 *     6개 대회 항목은 한국 선수 경기인지 알 수 없어 일정 근거로만 본다).
 */
export interface WeeklyMissingCandidate {
  source: "schedule" | "af-pending";
  /** fd-… (일정) · af-… (이월) */
  id: string;
  kickoff: string;
  /** 일정: [홈, 원정] 팀 slug · 이월: [] (팀을 모른다) */
  teams: string[];
  /** 일정: 그 경기의 표 행 선수 slug · 이월: [] */
  players: string[];
  /** 일정 경기가 이월 목록에도 있다(같은 대회·킥오프 ±3시간) */
  pending: boolean;
}

export function findPossiblyMissing(input: {
  table: WeeklyTable;
  range: { from: string; to: string };
  /** 그 주 구간 원장 경기 */
  ledger: readonly LedgerMatch[];
  links: LogContext;
  pending: ReadonlyArray<Pick<AfPendingEntry, "id" | "comp" | "kickoff">>;
}): WeeklyMissingCandidate[] {
  const from = Date.parse(input.range.from);
  const to = Date.parse(input.range.to);
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return t >= from && t <= to;
  };
  const linked = new Set(
    input.ledger
      .map((m) => fdMatchIdOf(m, input.links))
      .filter((id): id is string => id !== null),
  );
  const pendingInRange = input.pending.filter((p) => inRange(p.kickoff));
  const near = (a: string, b: string) =>
    Math.abs(Date.parse(a) - Date.parse(b)) <= FD_LINK_TOLERANCE_MS;
  const byId = new Map<string, WeeklyMissingCandidate>();
  for (const r of input.table.rows) {
    const slug = r.player.team;
    for (const [comp, file] of Object.entries(input.links.competitions)) {
      for (const x of file?.matches ?? []) {
        if (x.home !== slug && x.away !== slug) continue;
        if (x.status === "postponed" || !inRange(x.kickoff)) continue;
        if (linked.has(x.id)) continue;
        if (r.matches.some((l) => near(l.kickoff, x.kickoff))) continue;
        const prev = byId.get(x.id);
        if (prev) {
          if (!prev.players.includes(r.player.slug))
            prev.players.push(r.player.slug);
          continue;
        }
        byId.set(x.id, {
          source: "schedule",
          id: x.id,
          kickoff: x.kickoff,
          teams: [x.home, x.away],
          players: [r.player.slug],
          pending: pendingInRange.some(
            (p) => p.comp === comp && near(p.kickoff, x.kickoff),
          ),
        });
      }
    }
  }
  const out = [...byId.values()];
  for (const p of pendingInRange) {
    if (p.comp !== null) continue;
    out.push({
      source: "af-pending",
      id: `af-${p.id}`,
      kickoff: p.kickoff,
      teams: [],
      players: [],
      pending: true,
    });
  }
  return out.sort(
    (a, b) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** 누락 가능 경기 안내 한 줄(로그·Step Summary·출력) — 팀 이름은 표시 이름 함수(slug → 한글)로 */
export function missingCandidateMessage(
  week: string,
  c: WeeklyMissingCandidate,
  teamName: (slug: string) => string,
): string {
  const what =
    c.source === "schedule"
      ? `${c.teams.map(teamName).join("–")} ${formatKst(c.kickoff, "datetime")} KST${c.pending ? " (미종료 이월 중)" : " (일정상 주간 경기, 원장에 없음)"}`
      : `한국 선수 소속팀 기타 대회 경기 ${c.id} ${formatKst(c.kickoff, "datetime")} KST (미종료 이월 중)`;
  return `W${week.slice(5)} 누락 가능: ${what} — 다음 날 \`npm run weekly -- --week ${week} --force\`(Actions 수동 실행 force·week 입력)로 재생성`;
}

// ─── ③ LLM 입력 ─────────────────────────────────────────────────────────

/** 결과 글자 — 정규시간 + 연장 기준(승부차기는 pk로 따로) */
function resultLetter(s: { for: number; against: number }): "W" | "D" | "L" {
  return s.for > s.against ? "W" : s.for < s.against ? "L" : "D";
}

/** LLM에 보내는 정형 입력(영문 이름 원문, 짧은 키 — 지시문 [입력] 절과 같은 키) */
export interface WeeklyLlmInput {
  week: string;
  from: string; // UTC 날짜
  to: string;
  /** MVP 영문 이름(공동이면 여럿) — 출전 0명이면 빈 배열 */
  mvp: string[];
  mvpPts: number | null;
  players: Array<{
    p: string; // 선수 영문 이름(configs nameEn)
    team: string | null; // 그 주 소속팀 원문(경기가 없으면 null)
    apps: number;
    min: number;
    g: number;
    a: number;
    pts: number;
    m: Array<{
      d: string; // 킥오프 UTC 날짜
      c: string; // 대회 영문
      vs: string; // 상대 원문
      ha: "H" | "A";
      res: "W" | "D" | "L";
      sc: string; // 소속팀 득점 먼저 "2-3"
      pk?: string; // 승부차기(소속팀 먼저) "4-3"
      st: LedgerAppearance; // start·sub·bench·absent·unknown
      min: number | null;
      g: number;
      a: number;
      gm?: string[]; // 골 분
    }>;
  }>;
}

export function weeklyLlmInput(table: WeeklyTable): WeeklyLlmInput {
  const bySlug = new Map(table.rows.map((r) => [r.player.slug, r] as const));
  const mvpSlugs = table.mvp === null ? [] : [table.mvp, ...table.coMvp];
  const mvpRow = table.mvp === null ? null : bySlug.get(table.mvp)!;
  return {
    week: table.week,
    from: utcDate(table.range.from),
    to: utcDate(table.range.to),
    mvp: mvpSlugs.map((s) => bySlug.get(s)!.player.nameEn),
    mvpPts: mvpRow?.points ?? null,
    players: table.rows.map((r) => ({
      p: r.player.nameEn,
      team: r.matches.at(-1)?.team ?? null,
      apps: r.apps,
      min: r.minutes,
      g: r.goals,
      a: r.assists,
      pts: r.points,
      m: r.matches.map((l) => ({
        d: utcDate(l.kickoff),
        c: l.compName,
        vs: l.opponent,
        ha: l.home ? "H" : "A",
        res: resultLetter(l.score),
        sc: `${l.score.for}-${l.score.against}`,
        ...(l.pens ? { pk: `${l.pens.for}-${l.pens.against}` } : {}),
        st: l.status,
        min: l.minutes,
        g: l.goals,
        a: l.assists,
        ...(l.goalMinutes.length > 0 ? { gm: l.goalMinutes } : {}),
      })),
    })),
  };
}

/** user 본문 — 결정적 JSON(키 순서 고정) */
export function serializeWeeklyInput(input: WeeklyLlmInput): string {
  return JSON.stringify(input);
}

/** customId — `weekly-kr-YYYY-WW`, 재시도는 `-r1`(mock은 fixtures/llm/mock/by-id/에서 이 이름을 찾는다) */
export function weeklyCustomId(week: string, attempt: number = 1): string {
  return attempt <= 1
    ? `weekly-kr-${week}`
    : `weekly-kr-${week}-r${attempt - 1}`;
}

export function buildWeeklyRequest(
  input: WeeklyLlmInput,
  system: string,
  attempt: number = 1,
): LlmRequest {
  return {
    customId: weeklyCustomId(input.week, attempt),
    system,
    user: serializeWeeklyInput(input),
    maxTokens: WEEKLY_KR_MAX_TOKENS,
    effort: WEEKLY_KR_EFFORT,
    thinking: WEEKLY_KR_THINKING,
    // 요청 1건 — 캐싱 쓰기 할증만 붙는다(D28: 일일 브리핑 2요청 이상·주간 팀 프로필만 켬)
  };
}

/**
 * 1회 최악값 예상(배치 50%) — 입력은 넉넉한 어림(한국어 지시문 글자당 1토큰, 영문 JSON 1.5자당 1토큰 — brief.ts와 같은 어림),
 * 출력은 max_tokens 상한.
 */
export function estimateWeeklyWorstCase(
  request: Pick<LlmRequest, "system" | "user" | "maxTokens">,
  model: string,
): CostEstimate {
  return estimateCost({
    model,
    requests: 1,
    avgInputTokens: Math.ceil(
      request.system.length + request.user.length / 1.5,
    ),
    avgOutputTokens: request.maxTokens,
    batch: true,
  });
}

// ─── ④ 출력 ─────────────────────────────────────────────────────────────

export const WeeklyOutputSchema = z.strictObject({
  s: z
    .array(z.string().trim().min(5))
    .min(WEEKLY_SENTENCES_MIN)
    .max(WEEKLY_SENTENCES_MAX),
});

export type WeeklyParseResult =
  | { ok: true; sentences: string[] }
  | { ok: false; reason: "json" | "schema"; detail: string };

export function parseWeeklyOutput(text: string): WeeklyParseResult {
  const { body } = unwrapBriefOutput(text);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: "json", detail: "JSON 파싱 실패" };
  }
  const parsed = WeeklyOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema",
      detail: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join(" · "),
    };
  }
  return { ok: true, sentences: parsed.data.s.map((t) => t.normalize("NFC")) };
}

// ─── ⑤ 코드 검증 ────────────────────────────────────────────────────────

export type WeeklyCheckCode =
  | "han"
  | "korean-ratio"
  | "latin-token"
  | "sentence-form"
  | "too-long"
  | "name-not-in-input"
  | "score-not-in-input"
  | "number-not-in-input"
  | "player-stat"
  | "mvp-name"
  // 경기 대조(⑤-2 — checkMatchClaims): 문장 조각의 사실이 그 선수 경기 하나와 맞지 않음
  | "match-score" // 스코어가 그 경기 소속팀 득점 먼저 순서와 다름(뒤집힘 포함)
  | "match-result" // 승패 동사(이겼다·승리·졌다·패·비겼다·무승부)가 결과와 다름
  | "match-venue" // 홈/원정
  | "match-opponent" // 그 경기 밖 팀
  | "match-comp" // 대회
  | "match-date" // 날짜(M월 D일 — 입력 d, UTC)
  | "match-shootout"; // 승부차기 — 없는 경기에 승부차기 · 승부차기 경기를 '승부차기' 없이 이기거나 졌다고 씀

export interface WeeklyCheckIssue {
  code: WeeklyCheckCode;
  /** 문장 번호(1부터) */
  sentence: number;
  detail?: string;
}

export interface WeeklyCheckResult {
  ok: boolean;
  issues: WeeklyCheckIssue[];
  /** 치환·조사 보정 뒤 문장 */
  sentences: string[];
}

export interface WeeklyCheckContext {
  names: NameIndex;
  /** 6개 대회 id → 한글 대회 이름(치환 표기 — competitions.json nameKo) */
  competitionLabel: (comp: CompId) => string;
}

/** 텍스트 → 한국 이름 표기 찾기용 정규식 조각 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** 표에서 입력 사실 모음 — 검증 근거 */
interface WeeklyFacts {
  /** 입력에 있는 이름(접힌 영문) */
  latinNames: Set<string>;
  /** 입력에 있는 사전 항목 한글 표기 */
  koInInput: Set<string>;
  /** 선수 한글 이름 → 그 선수의 수 묶음 */
  players: Map<
    string,
    {
      goals: Set<number>;
      assists: Set<number>;
      minutes: Set<number>;
      apps: Set<number>;
    }
  >;
  numbers: Set<number>;
  scores: Set<string>;
  mvpKo: string[];
  /** 입력 한글 표기 중 라틴이 섞인 것(긴 것부터) */
  koLatin: string[];
}

function factsOf(table: WeeklyTable, ctx: WeeklyCheckContext): WeeklyFacts {
  const latinNames = new Set<string>();
  const koInInput = new Set<string>();
  const numbers = new Set<number>();
  const scores = new Set<string>();
  const players: WeeklyFacts["players"] = new Map();
  const addName = (en: string) => {
    latinNames.add(foldName(en));
    const sub = substituteNames(en, ctx.names, {
      competitionLabel: ctx.competitionLabel,
    });
    for (const r of sub.replaced) koInInput.add(r.to);
  };
  const addNum = (n: number) => numbers.add(n);
  let goalsTotal = 0;
  let assistsTotal = 0;
  let appeared = 0;
  let matchesTotal = 0;
  for (const r of table.rows) {
    addName(r.player.nameEn);
    koInInput.add(r.player.nameKo);
    const pf = {
      goals: new Set([r.goals]),
      assists: new Set([r.assists]),
      minutes: new Set([r.minutes]),
      apps: new Set([r.apps, r.matches.length]),
    };
    [r.apps, r.minutes, r.goals, r.assists, r.points, r.matches.length].forEach(
      addNum,
    );
    goalsTotal += r.goals;
    assistsTotal += r.assists;
    if (r.apps > 0) appeared += 1;
    matchesTotal += r.matches.length;
    for (const l of r.matches) {
      addName(l.team);
      addName(l.opponent);
      addName(l.compName);
      [l.score.for, l.score.against, l.goals, l.assists].forEach(addNum);
      if (l.minutes !== null) {
        addNum(l.minutes);
        pf.minutes.add(l.minutes);
      }
      pf.goals.add(l.goals);
      pf.assists.add(l.assists);
      scores.add(`${l.score.for}-${l.score.against}`);
      scores.add(`${l.score.against}-${l.score.for}`);
      if (l.pens) {
        [l.pens.for, l.pens.against].forEach(addNum);
        scores.add(`${l.pens.for}-${l.pens.against}`);
        scores.add(`${l.pens.against}-${l.pens.for}`);
      }
      for (const gm of l.goalMinutes) {
        for (const part of gm.split("+")) addNum(Number(part));
        pf.minutes.add(Number(gm.split("+")[0]));
      }
      const [, mo, d] = utcDate(l.kickoff).split("-").map(Number);
      addNum(mo!);
      addNum(d!);
    }
    players.set(r.player.nameKo, pf);
  }
  [
    goalsTotal,
    assistsTotal,
    appeared,
    table.rows.length,
    matchesTotal,
    3, // 산식 '골×3'
    2, // '도움×2'
    Number(table.week.slice(5)), // 주차 번호
    90, // '90분 풀타임' — 분 막대 기준(D65 ③ '90분 출전'은 그 선수 분이 90일 때 — 선수 검사가 따로 본다)
  ].forEach(addNum);
  for (const d of [table.range.from, table.range.to]) {
    const [, mo, day] = utcDate(d).split("-").map(Number);
    addNum(mo!);
    addNum(day!);
  }
  const bySlug = new Map(table.rows.map((r) => [r.player.slug, r] as const));
  const mvpKo =
    table.mvp === null
      ? []
      : [table.mvp, ...table.coMvp].map((s) => bySlug.get(s)!.player.nameKo);
  const koLatin = [...koInInput]
    .filter((ko) => /\p{Script=Latin}/u.test(ko))
    .sort((a, b) => b.length - a.length);
  return { latinNames, koInInput, players, numbers, scores, mvpKo, koLatin };
}

/** 사전의 선수·팀 한글 표기 전체(입력 밖 이름 찾기용 — 2글자 이상) */
function dictionaryKoNames(index: NameIndex): string[] {
  const out = new Set<string>();
  for (const e of index.byEn.values()) {
    if ((e.kind === "player" || e.kind === "team") && e.ko.length >= 2) {
      out.add(e.ko);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LATIN_WORDS =
  /\p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}'’.&/-]*(?: \p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}'’.&/-]*)*/gu;

/** 치환 뒤 문장 검사(머리 주석 ⑤). 순수 함수 */
export function checkWeeklySummary(
  raw: readonly string[],
  table: WeeklyTable,
  ctx: WeeklyCheckContext,
): WeeklyCheckResult {
  const facts = factsOf(table, ctx);
  const issues: WeeklyCheckIssue[] = [];
  const push = (code: WeeklyCheckCode, sentence: number, detail?: string) =>
    issues.push(
      detail === undefined ? { code, sentence } : { code, sentence, detail },
    );
  const dict = dictionaryKoNames(ctx.names);
  const views = matchViewsOf(table, ctx);
  const subs = raw.map((t) =>
    substituteNames(t, ctx.names, { competitionLabel: ctx.competitionLabel }),
  );
  const sentences = subs.map((s) => s.text.trim());
  subs.forEach((sub, i) => {
    const n = i + 1;
    const text = sub.text.trim();
    // 이름 치환 구간을 가린 뒤 남은 라틴 — 입력의 미등록 원문 이름·라틴이 섞인 입력 한글 표기('UEFA 챔피언스리그')는 지운다(허용)
    let rest = sub.masked;
    for (const ko of facts.koLatin) rest = rest.split(ko).join("□");
    for (const m of [...rest.matchAll(LATIN_WORDS)]) {
      const span = m[0].replace(/[.'’/&-]+$/u, "");
      const folded = foldName(span);
      if (facts.latinNames.has(folded)) {
        rest = rest.replace(span, "□");
        continue;
      }
      const words = span.split(" ");
      if (!words.every((w) => WEEKLY_LATIN_ALLOWED.has(w))) {
        push("latin-token", n, span);
      }
    }
    // 한국어 비율 — 문장마다(영어 문장 하나가 다른 한국어 문장에 묻히지 않게). 이름은 가린 뒤 센다
    const hangul = text.match(/[가-힣]/gu)?.length ?? 0;
    const latin = rest.match(/\p{Script=Latin}/gu)?.length ?? 0;
    if (hangul < latin) push("korean-ratio", n, `${hangul}<${latin}`);
    if (HAN.test(text)) push("han", n);
    // 한 문장: '다.'로 끝나고 줄바꿈·문장 안 마침표·느낌표·물음표 없음(이름 속 마침표는 rest에서 지워졌다)
    const body = rest.trim().replace(/다\.$/u, "");
    if (/[\r\n]/.test(text) || !/다\.$/u.test(text) || /[.!?]/u.test(body))
      push("sentence-form", n);
    if (text.length > WEEKLY_SENTENCE_MAX_CHARS)
      push("too-long", n, String(text.length));

    // 입력 밖 등록 이름(사전 한글 표기) — 긴 이름부터 지우며 찾는다(짧은 표기가 긴 표기 안에서 다시 걸리지 않게)
    let scan = text;
    for (const ko of dict) {
      if (!scan.includes(ko)) continue;
      if (!facts.koInInput.has(ko)) push("name-not-in-input", n, ko);
      scan = scan.split(ko).join("□");
    }

    // 스코어 'a-b'·'a대 b'
    for (const m of text.matchAll(/(\d+)\s*(?:-|대\s?)\s*(\d+)/gu)) {
      if (!facts.scores.has(`${m[1]}-${m[2]}`))
        push("score-not-in-input", n, m[0]);
    }
    // 숫자 근거
    for (const m of text.matchAll(/\d+/gu)) {
      if (!facts.numbers.has(Number(m[0])))
        push("number-not-in-input", n, m[0]);
    }
    // 한 선수만 언급한 문장의 선수 수치
    const mentioned = [...facts.players.keys()].filter((ko) =>
      new RegExp(escapeRegExp(ko)).test(text),
    );
    if (mentioned.length === 1) {
      const pf = facts.players.get(mentioned[0]!)!;
      const unit: Array<[RegExp, Set<number>, string]> = [
        [/(\d+)\s*골/gu, pf.goals, "골"],
        [/(\d+)\s*도움/gu, pf.assists, "도움"],
        [/(\d+)\s*분/gu, pf.minutes, "분"],
        [/(\d+)\s*경기/gu, pf.apps, "경기"],
      ];
      for (const [re, allowed, label] of unit) {
        for (const m of text.matchAll(re)) {
          if (!allowed.has(Number(m[1])))
            push("player-stat", n, `${m[1]}${label}`);
        }
      }
    }
    if (/MVP/u.test(text)) {
      if (
        facts.mvpKo.length === 0 ||
        !facts.mvpKo.some((ko) => text.includes(ko))
      )
        push("mvp-name", n);
    }
    // 경기 대조(⑤-2)
    for (const issue of checkMatchClaims(text, views))
      push(issue.code, n, issue.detail);
  });
  return { ok: issues.length === 0, issues, sentences };
}

// ─── ⑤-2 경기 대조 ──────────────────────────────────────────────────────
//
// 문장(치환 뒤)을 선수 이름 자리에서 끊어 조각마다 그 선수를 붙인다(첫 이름 앞 머리는 첫 선수 조각에, 'A와 B는'처럼 사실 없이 이어
// 지는 이름은 다음 조각과 묶는다). 조각은 다시 절(쉼표·'-고/-며/-지만/-는데/-으나/-면서' 뒤 띄어쓰기)로 끊는다. 절마다 사실을 뽑아
// (스코어 'a-b'·'a대 b', 승패 동사, 홈/원정, 팀 이름, 대회 이름, 'M월 D일', '승부차기') **그 선수의 그 주 경기 하나**와 모두 맞는지
// 본다. 기준은 소속팀(입력 sc·ha·res와 같다) — 절의 주어('…은/는/이/가')가 상대 팀이면 상대 기준으로 뒤집어 본다(brief-check
// score-order 정신: 승패 문장의 점수는 주어 팀 먼저). 승부차기 경기는 정규시간 + 연장이 동점이라 '비겼다'는 맞고, 이기거나 졌다고
// 쓰려면 '승부차기'가 있어야 하며 그 승패는 승부차기 결과다(brief-check shootout 규칙). 승부차기 점수도 소속팀(주어) 먼저.
// 한 절에 날짜·스코어·상대가 둘 이상이면(여러 경기를 한 절에) 사실마다 따로 어느 경기 하나와 맞으면 된다(스코어와 바로 뒤 동사는
// 한 묶음). 조각의 선수 경기로 맞지 않으면 그 문장에 나온 선수 모두의 경기로 한 번 더 본다(이름 귀속이 틀릴 수 있는 문장 — 보수적
// 판정). 선수 이름이 없는 문장은 그 주 모든 경기가 후보다. 기간 표기('M월 D일부터·까지')는 날짜 주장으로 보지 않는다.

type ResultLetter = "W" | "D" | "L";

/** 한 선수 시점의 경기 1건 + 문장 표기(치환 뒤) */
interface MatchView {
  line: WeeklyMatchLine;
  team: string;
  opp: string;
  comp: string;
  /** 입력 d(UTC 날짜)의 "M-D" */
  date: string;
}

interface ScoreClaim {
  a: number;
  b: number;
  /** 스코어 바로 뒤 동사('2-3으로 졌다'·'0-0 무승부') */
  verb: ResultLetter | null;
  raw: string;
}

interface ChunkClaims {
  scores: ScoreClaim[];
  verbs: Set<ResultLetter>;
  venue: "H" | "A" | null;
  teams: string[];
  /** 팀 이름 바로 뒤가 주어·주제 조사 */
  subjects: Set<string>;
  comps: string[];
  dates: string[];
  shootout: boolean;
}

type MatchIssue = { code: WeeklyCheckCode; detail: string };

const WIN_RE = /이겼|이긴|승리|꺾|제압|완승|역전승/u;
// '졌'은 띄어 쓴 동사만('2-3으로 졌다'·'팀은 졌다') — '치러졌다'·'빠졌다'·'벌어졌다'를 거르지 않게
const LOSS_RE = /(?:^|[\s,])졌|패배|패했|패하|패한|완패|역전패/u;
const DRAW_RE = /비겼|비긴|비기|무승부/u;
const ATTACHED_VERB =
  /^\s*(?:으로|로)?\s*(?:(이겼|이긴|승리|꺾|제압|완승|역전승)|(졌|패배|패했|패하|패한|완패|역전패)|(비겼|비긴|비기|무승부))/u;
const SCORE_RE = /(\d+)\s*(?:-|대\s?)\s*(\d+)/gu;
const DATE_RE = /(\d{1,2})\s*월\s*(\d{1,2})\s*일(?!\s*(?:부터|까지|~|–))/gu;
/** 절 경계 — 쉼표, 연결 어미 뒤 띄어쓰기 */
const CLAUSE_SPLIT = /,\s*|(?<=[가-힣](?:고|며|지만|는데|으나|면서))\s+/u;
/** 'A와 B는' — 이름 뒤에 접속 조사만 남은 조각 */
const CONJUNCTION_ONLY = /^(?:와|과|,|·|및)?\s*$/u;
const SUBJECT_PARTICLE = /^(?:이|가|은|는)(?![가-힣])/u;
const COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

function letterOf(f: number, a: number): ResultLetter {
  return f > a ? "W" : f < a ? "L" : "D";
}

function verbsIn(text: string): Set<ResultLetter> {
  const out = new Set<ResultLetter>();
  // 부정('이기지 못했다'·'승리하지 않았다')은 승패를 단정하지 않는다 — 그 절의 동사는 보지 않는다
  if (/못|않/u.test(text)) return out;
  if (WIN_RE.test(text)) out.add("W");
  if (LOSS_RE.test(text)) out.add("L");
  if (DRAW_RE.test(text)) out.add("D");
  return out;
}

function monthDayKey(mo: number, d: number): string {
  return `${mo}-${d}`;
}

/** 이름 목록(긴 것부터)을 text에서 찾아 □로 가린다 — 찾은 이름·주어 여부. extraLookahead는 숫자로 끝나는 이름에만 */
function scanNames(
  text: string,
  names: readonly string[],
  extraLookahead?: RegExp,
): { masked: string; found: string[]; subjects: Set<string> } {
  let masked = text;
  const found: string[] = [];
  const subjects = new Set<string>();
  for (const name of names) {
    let from = 0;
    for (;;) {
      const at = masked.indexOf(name, from);
      if (at < 0) break;
      const after = masked.slice(at + name.length);
      if (
        extraLookahead &&
        /[0-9]$/u.test(name) &&
        !extraLookahead.test(after)
      ) {
        from = at + name.length;
        continue;
      }
      if (!found.includes(name)) found.push(name);
      if (SUBJECT_PARTICLE.test(after)) subjects.add(name);
      masked =
        masked.slice(0, at) +
        "□".repeat(name.length) +
        masked.slice(at + name.length);
      from = at + name.length;
    }
  }
  return { masked, found, subjects };
}

interface ClaimContext {
  /** 모든 한국 선수 한글 이름(긴 것부터) — 절에서 가린다 */
  playerNames: string[];
  teamNames: string[];
  compNames: string[];
}

function claimsOf(chunk: string, cc: ClaimContext): ChunkClaims {
  let masked = chunk;
  for (const p of cc.playerNames)
    masked = masked.split(p).join("□".repeat(p.length));
  const teams = scanNames(masked, cc.teamNames);
  // 숫자로 끝나는 대회 표기('리그 1')가 '리그 1경기'·'리그 1위' 안에서 걸리지 않게(숫자로 끝나는 표기만 뒤를 본다)
  const comps = scanNames(
    teams.masked,
    cc.compNames,
    /^(?![0-9])(?!\s?(?:경기|골|도움|분|위|점))/u,
  );
  const rest = comps.masked;
  const scores: ScoreClaim[] = [];
  for (const m of rest.matchAll(SCORE_RE)) {
    const tail = rest.slice(m.index + m[0].length);
    const v = ATTACHED_VERB.exec(tail);
    scores.push({
      a: Number(m[1]),
      b: Number(m[2]),
      verb:
        v === null || /못|않/u.test(tail.slice(0, 12))
          ? null
          : v[1]
            ? "W"
            : v[2]
              ? "L"
              : "D",
      raw: m[0],
    });
  }
  const dates = [...rest.matchAll(DATE_RE)].map((m) =>
    monthDayKey(Number(m[1]), Number(m[2])),
  );
  const home = /홈/u.test(rest);
  const away = /원정/u.test(rest);
  return {
    scores,
    verbs: verbsIn(rest),
    venue: home && !away ? "H" : away && !home ? "A" : null,
    teams: teams.found,
    subjects: teams.subjects,
    comps: comps.found,
    dates,
    shootout: /승부차기/u.test(rest),
  };
}

function hasClaims(c: ChunkClaims): boolean {
  return (
    c.scores.length > 0 ||
    c.verbs.size > 0 ||
    c.venue !== null ||
    c.teams.length > 0 ||
    c.comps.length > 0 ||
    c.dates.length > 0 ||
    c.shootout
  );
}

/** 절 사실 ↔ 경기 1건 — 어긋난 것 목록(없으면 맞음) */
function mismatchesOf(c: ChunkClaims, v: MatchView): MatchIssue[] {
  const out: MatchIssue[] = [];
  const flip = c.subjects.has(v.opp) && !c.subjects.has(v.team);
  const f = flip ? v.line.score.against : v.line.score.for;
  const a = flip ? v.line.score.for : v.line.score.against;
  const pens = v.line.pens
    ? flip
      ? { f: v.line.pens.against, a: v.line.pens.for }
      : { f: v.line.pens.for, a: v.line.pens.against }
    : null;
  const ftRes = letterOf(f, a);
  const pkRes = pens ? letterOf(pens.f, pens.a) : null;
  const sc = `${f}-${a}${pens ? ` (승부차기 ${pens.f}-${pens.a})` : ""}`;
  if (c.shootout && !pens)
    out.push({ code: "match-shootout", detail: `승부차기 없는 경기 ${sc}` });
  for (const s of c.scores) {
    const isFt = s.a === f && s.b === a;
    const isPk =
      pens !== null && c.shootout && s.a === pens.f && s.b === pens.a;
    if (!isFt && !isPk) {
      out.push({ code: "match-score", detail: `${s.raw} ≠ ${sc}` });
      continue;
    }
    if (s.verb !== null) {
      const expected = isPk && !isFt ? pkRes : ftRes;
      if (!isPk && pens && s.verb !== "D")
        out.push({ code: "match-shootout", detail: `${s.raw} ${s.verb}` });
      else if (s.verb !== expected)
        out.push({
          code: "match-result",
          detail: `${s.raw} ${s.verb} ≠ ${expected}`,
        });
    }
  }
  for (const verb of c.verbs) {
    if (pens) {
      if (verb === "D") continue;
      if (!c.shootout)
        out.push({ code: "match-shootout", detail: `승부차기 경기를 ${verb}` });
      else if (verb !== pkRes)
        out.push({
          code: "match-result",
          detail: `승부차기 ${verb} ≠ ${pkRes}`,
        });
    } else if (verb !== ftRes) {
      out.push({ code: "match-result", detail: `${verb} ≠ ${ftRes} (${sc})` });
    }
  }
  if (c.venue !== null) {
    const home = flip ? !v.line.home : v.line.home;
    if ((c.venue === "H") !== home)
      out.push({
        code: "match-venue",
        detail: `${c.venue === "H" ? "홈" : "원정"} ≠ ${home ? "홈" : "원정"}`,
      });
  }
  for (const t of c.teams)
    if (t !== v.team && t !== v.opp)
      out.push({ code: "match-opponent", detail: `${t} ≠ ${v.opp}` });
  for (const comp of c.comps)
    if (comp !== v.comp)
      out.push({ code: "match-comp", detail: `${comp} ≠ ${v.comp}` });
  for (const d of c.dates)
    if (d !== v.date)
      out.push({ code: "match-date", detail: `${d} ≠ ${v.date}` });
  return out;
}

/** 여러 경기를 한 절에 쓴 꼴 — 사실마다 따로 본다 */
function isMultiMatch(c: ChunkClaims): boolean {
  return (
    new Set(c.dates).size > 1 ||
    c.scores.length > (c.shootout ? 2 : 1) ||
    c.teams.length > 2
  );
}

/** 절 1개를 사실 묶음으로 — 한 경기 절이면 그대로 1묶음, 여러 경기 절이면 사실마다(스코어는 바로 뒤 동사와 한 묶음) */
function claimUnits(c: ChunkClaims): ChunkClaims[] {
  if (!isMultiMatch(c)) return [c];
  const empty = (): ChunkClaims => ({
    scores: [],
    verbs: new Set(),
    venue: null,
    teams: [],
    subjects: c.subjects,
    comps: [],
    dates: [],
    shootout: c.shootout,
  });
  const units: ChunkClaims[] = [];
  for (const s of c.scores) units.push({ ...empty(), scores: [s] });
  for (const v of c.verbs) units.push({ ...empty(), verbs: new Set([v]) });
  if (c.venue !== null) units.push({ ...empty(), venue: c.venue });
  for (const t of c.teams) units.push({ ...empty(), teams: [t] });
  for (const comp of c.comps) units.push({ ...empty(), comps: [comp] });
  for (const d of c.dates) units.push({ ...empty(), dates: [d] });
  return units;
}

/** 사실 묶음들이 후보 경기로 모두 설명되는가 — 안 되면 가장 덜 어긋난 경기 기준 사유 */
function judgeChunk(
  c: ChunkClaims,
  candidates: readonly MatchView[],
): MatchIssue[] {
  const issues: MatchIssue[] = [];
  for (const unit of claimUnits(c)) {
    let best: MatchIssue[] | null = null;
    for (const v of candidates) {
      const mm = mismatchesOf(unit, v);
      if (best === null || mm.length < best.length) best = mm;
      if (mm.length === 0) break;
    }
    if (best === null) {
      issues.push({ code: noMatchCode(unit), detail: "그 선수 경기 없음" });
    } else issues.push(...best);
  }
  return issues;
}

function noMatchCode(c: ChunkClaims): WeeklyCheckCode {
  if (c.scores.length > 0) return "match-score";
  if (c.verbs.size > 0) return "match-result";
  if (c.teams.length > 0) return "match-opponent";
  if (c.dates.length > 0) return "match-date";
  if (c.venue !== null) return "match-venue";
  if (c.comps.length > 0) return "match-comp";
  return "match-shootout";
}

/** 표 → 선수(한글 이름)별 경기 표기 + 이름 목록 */
function matchViewsOf(
  table: WeeklyTable,
  ctx: WeeklyCheckContext,
): { byPlayer: Map<string, MatchView[]>; claim: ClaimContext } {
  const display = (en: string) =>
    substituteNames(en, ctx.names, {
      competitionLabel: ctx.competitionLabel,
    }).text.trim();
  const byPlayer = new Map<string, MatchView[]>();
  const teams = new Set<string>();
  const comps = new Set<string>(COMP_IDS.map((c) => ctx.competitionLabel(c)));
  for (const r of table.rows) {
    const views = r.matches.map((l): MatchView => {
      const [, mo, d] = utcDate(l.kickoff).split("-").map(Number);
      const view: MatchView = {
        line: l,
        team: display(l.team),
        opp: display(l.opponent),
        comp:
          l.comp === "OTHER"
            ? display(l.compName)
            : ctx.competitionLabel(l.comp),
        date: monthDayKey(mo!, d!),
      };
      teams.add(view.team);
      teams.add(view.opp);
      comps.add(view.comp);
      return view;
    });
    byPlayer.set(r.player.nameKo, [
      ...(byPlayer.get(r.player.nameKo) ?? []),
      ...views,
    ]);
  }
  const byLength = (a: string, b: string) => b.length - a.length;
  return {
    byPlayer,
    claim: {
      playerNames: [...byPlayer.keys()].sort(byLength),
      teamNames: [...teams].filter((t) => t.length >= 2).sort(byLength),
      compNames: [...comps].filter((c) => c.length >= 2).sort(byLength),
    },
  };
}

/** 문장 → 선수 조각(머리 주석 ⑤-2) */
function playerSegments(
  text: string,
  playerNames: readonly string[],
): Array<{ text: string; players: string[] }> {
  const hits: Array<{ at: number; name: string }> = [];
  let scan = text;
  for (const name of playerNames) {
    let from = 0;
    for (;;) {
      const at = scan.indexOf(name, from);
      if (at < 0) break;
      hits.push({ at, name });
      scan =
        scan.slice(0, at) +
        "□".repeat(name.length) +
        scan.slice(at + name.length);
      from = at + name.length;
    }
  }
  if (hits.length === 0) return [{ text, players: [] }];
  hits.sort((x, y) => x.at - y.at);
  const raw = hits.map((h, i) => ({
    name: h.name,
    text: text.slice(i === 0 ? 0 : h.at, hits[i + 1]?.at ?? text.length),
    after: text.slice(h.at + h.name.length, hits[i + 1]?.at ?? text.length),
  }));
  const out: Array<{ text: string; players: string[] }> = [];
  let carry: string[] = [];
  let carryText = "";
  for (const seg of raw) {
    const players = [...new Set([...carry, seg.name])];
    if (CONJUNCTION_ONLY.test(seg.after) && seg !== raw.at(-1)) {
      carry = players;
      carryText += seg.text;
      continue;
    }
    const prev = out.at(-1);
    if (
      carry.length === 0 &&
      prev &&
      prev.players.length === 1 &&
      prev.players[0] === seg.name
    ) {
      prev.text += seg.text;
    } else {
      out.push({ text: carryText + seg.text, players });
    }
    carry = [];
    carryText = "";
  }
  return out;
}

/** 문장 1개의 경기 대조(머리 주석 ⑤-2). 순수 함수 */
function checkMatchClaims(
  text: string,
  views: ReturnType<typeof matchViewsOf>,
): MatchIssue[] {
  const { byPlayer, claim } = views;
  const all = [...byPlayer.values()].flat();
  const segments = playerSegments(text, claim.playerNames);
  const mentioned = [...new Set(segments.flatMap((s) => s.players))];
  const union = mentioned.flatMap((p) => byPlayer.get(p) ?? []);
  const issues: MatchIssue[] = [];
  for (const seg of segments) {
    const candidates =
      seg.players.length === 0
        ? all
        : seg.players.flatMap((p) => byPlayer.get(p) ?? []);
    for (const chunk of seg.text.split(CLAUSE_SPLIT)) {
      if (!chunk.trim()) continue;
      const c = claimsOf(chunk, claim);
      if (!hasClaims(c)) continue;
      const strict = judgeChunk(c, candidates);
      if (strict.length === 0) continue;
      // 이름 귀속이 틀렸을 수 있다 — 문장의 선수 모두의 경기로 한 번 더(보수적)
      if (mentioned.length > 1 && judgeChunk(c, union).length === 0) continue;
      issues.push(...strict);
    }
  }
  return issues;
}

// ─── ⑥ 템플릿 ───────────────────────────────────────────────────────────

/** "M월 D일"(UTC 날짜 — 경기일 기준) */
function monthDay(iso: string): string {
  const [, mo, d] = utcDate(iso).split("-").map(Number);
  return `${mo}월 ${d}일`;
}

/** 코드 템플릿 총평(머리 주석 ⑥) — 입력 밖 사실 없음, 이름은 configs nameKo */
export function weeklyTemplateSummary(table: WeeklyTable): string {
  const period = `${monthDay(table.range.from)}부터 ${monthDay(table.range.to)}까지`;
  const total = table.rows.length;
  const appeared = table.rows.filter((r) => r.apps > 0);
  if (total === 0) {
    return `${period} 기록을 집계한 등록 한국 선수가 없다.`;
  }
  if (appeared.length === 0) {
    return `${period} 기록을 집계한 한국 선수 ${total}명 가운데 경기에 나선 선수는 없었다.`;
  }
  const out: string[] = [
    `${period} 기록을 집계한 한국 선수 ${total}명 가운데 ${appeared.length}명이 경기에 나섰다.`,
  ];
  const bySlug = new Map(table.rows.map((r) => [r.player.slug, r] as const));
  if (table.mvp !== null) {
    const group = [table.mvp, ...table.coMvp].map((s) => bySlug.get(s)!);
    const top = group[0]!;
    const stat = [
      `${top.apps}경기 ${top.minutes}분`,
      top.goals > 0 ? `${top.goals}골` : null,
      top.assists > 0 ? `${top.assists}도움` : null,
    ]
      .filter((x): x is string => x !== null)
      .join(" ");
    if (group.length === 1) {
      out.push(
        `${withJosa(top.player.nameKo, "이/가")} ${withJosa(stat, "으로/로")} MVP 점수 ${top.points}점을 얻어 이번 주 MVP에 올랐다.`,
      );
    } else {
      const names = group.map((r) => r.player.nameKo).join("·");
      out.push(
        `${withJosa(names, "이/가")} 나란히 ${withJosa(stat, "으로/로")} MVP 점수 ${top.points}점을 얻어 공동 MVP에 올랐다.`,
      );
    }
  }
  const goals = table.rows.reduce((s, r) => s + r.goals, 0);
  const assists = table.rows.reduce((s, r) => s + r.assists, 0);
  out.push(
    goals === 0 && assists === 0
      ? "이번 주 한국 선수의 골과 도움은 없었다."
      : assists === 0
        ? `이번 주 한국 선수들의 골은 모두 ${goals}골이었고 도움은 없었다.`
        : goals === 0
          ? `이번 주 한국 선수들의 골은 없었고 도움은 모두 ${assists}개였다.`
          : `이번 주 한국 선수들은 모두 ${goals}골 ${assists}도움을 기록했다.`,
  );
  return out.join(" ");
}

// ─── 리포트 ─────────────────────────────────────────────────────────────

/**
 * 내부 경기 줄 → 리포트 경기 줄(WeeklyReportMatchSchema — 키 순서 고정). goalMinutes는 개수가 골 수와 같을 때만 둔다(득점 목록이
 * 불완전한 경기는 원장 goalsComplete false라 빈 배열 → 키 없음). PK 표시는 하지 않는다(분만 — 원장 kind는 쓰지 않음).
 */
export function reportMatchOf(l: WeeklyMatchLine): WeeklyReportMatch {
  return {
    matchId: l.logMatchId,
    kickoff: l.kickoff,
    comp: l.comp,
    ...(l.leagueRaw !== null ? { leagueRaw: l.leagueRaw } : {}),
    opponent: { slug: l.opponentSlug, name: l.opponent },
    home: l.home,
    result: {
      for: l.score.for,
      against: l.score.against,
      ...(l.pens !== null
        ? { pens: { for: l.pens.for, against: l.pens.against } }
        : {}),
    },
    status: l.status,
    minutes: l.minutes,
    goals: l.goals,
    assists: l.assists,
    ...(l.goalMinutes.length > 0 && l.goalMinutes.length === l.goals
      ? { goalMinutes: [...l.goalMinutes] }
      : {}),
  };
}

export function buildWeeklyReport(input: {
  table: WeeklyTable;
  summary: string;
  summaryAi: boolean;
  generatedAt: string;
}): WeeklyReport {
  const { table } = input;
  return {
    week: table.week,
    from: table.range.from,
    to: table.range.to,
    rows: table.rows.map((r) => ({
      player: r.player.slug,
      apps: r.apps,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      matches: r.matches.map(reportMatchOf),
    })),
    mvp: table.mvp,
    ...(table.coMvp.length > 0 ? { coMvp: [...table.coMvp] } : {}),
    summary: input.summary,
    summaryAi: input.summaryAi,
    generatedAt: input.generatedAt,
  };
}

/** 직렬화(2칸 들여쓰기 + 끝 줄바꿈 — data/ 공통) */
export function serializeWeeklyReport(report: WeeklyReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
