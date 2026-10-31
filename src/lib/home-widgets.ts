/**
 * 홈 위젯 화면 모델 — "오늘 밤 볼 경기" 카드(M2-14) · "리그 순위 미니"(M2-15) (PRD F8 FR-80~82 · §4.2 ⑤⑧, DESIGN §9.3 "오늘 밤 경기 카드"·
 * "홈 리그 순위 미니")
 *
 * I/O 없는 순수 함수만 둔다(파일 읽기는 src/lib/data/home-widgets.ts, 그리기는 src/components/home/*). 지금 시각은 호출부가 넣는다(빌드
 * 시각 — 테스트는 고정 값). 시각 표시는 src/lib/time.ts만 쓴다(CLAUDE §8 — 저장 UTC · 표시 KST).
 *
 * ── 오늘 밤 카드 ───────────────────────────────────────────────────────────
 *   선별(`src/lib/tonight.ts` — M2-08)은 점수 상위 5경기 그대로 두고 **화면 순서만 킥오프 순**(편성표처럼 읽힌다 — 2026-10-31 사용자 결정,
 *   DECISIONS D1 §8). 킥오프가 같으면 선별 순서(점수 순)를 유지한다(안정 정렬). 카드 = 킥오프 KST(시각 + 날짜) · 이유 태그(`reasons[].label` 그대로, `korean`이면 한국 완장) ·
 *   대진(홈 / 원정, 한글 팀명 + 배지) · 대회 인덱스 탭. 저녁 빌드에서는 창 안의 이미 끝난 경기가 섞일 수 있다(선별은 빌드 시각에 따라 바뀌지
 *   않게 끝난 경기를 남긴다) — **스코어는 싣지 않고** 거터에 "종료"만 적는다(결과 가리기 M4-15 전이라 홈에서 결과를 드러내지 않는다 —
 *   결과는 대회 페이지 일정·결과에 있다). 킥오프 + 3시간이 지났는데 `scheduled`면 "결과 대기"(대회 라운드와 같은 규칙 — D60).
 *   창 문구 = "{M.DD} 18:00 ~ {M.DD} 07:00 KST"(창 끝은 [시작, 끝)의 끝 — 07:00).
 *
 * ── 리그 순위 미니 ──────────────────────────────────────────────────────────
 *   대회마다 상위 5행(데이터 순서 = 순위 — 어댑터). 행 = 순위 · 배지 · 한글 팀명 · ▲▼(`trendOf` — prevPos null = 빈칸) · 승점, 링크는 대회
 *   페이지 순위표의 그 팀 행(`/competitions/{comp}/#{slug}` — 행 id = 팀 slug, `:target` 도착 강조, DECISIONS D1 §5 #9).
 *   구간 띠는 순위표와 같은 규칙(`zoneBandOf` — `configs/competitions.json` zones 실값만, 상위 5위에 걸리는 것은 지금 UCL 16강 직행뿐).
 *   아래 줄 = "{M.DD} 기준 · 변동 전날 대비"(전날 자료가 한 행도 없으면 "변동 자료 없음") — 날짜는 데이터 `updatedAt`의 KST 날짜.
 */
import {
  matchStateOf,
  trendOf,
  zoneBandOf,
  type TeamLookup,
  type TeamView,
  type TrendView,
  type ZoneBand,
} from "@/lib/competition-view";
import { routes } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import type { CompetitionFile } from "@/lib/schema/competition";
import type {
  BigmatchRulesFile,
  CompetitionConfig,
} from "@/lib/schema/configs";
import type { TonightPick, TonightReason } from "@/lib/tonight";
import { formatKst, parseUtcIso, type UtcRange } from "@/lib/time";

// ─── 오늘 밤 ────────────────────────────────────────────────────────────────

/** 대회 표시 이름 — 인덱스 탭 약칭 + 정식 이름(`title`) */
export interface CompLabel {
  short: string;
  name: string;
}

/** 카드 경기 상태 — 예정 · 종료(스코어 없이 "종료") · 결과 대기(킥오프 + 3시간 지남) */
export type TonightState = "scheduled" | "finished" | "pending";

export interface TonightReasonView {
  kind: TonightReason["kind"];
  label: string;
}

export interface TonightCardView {
  /** 경기 id(목록 key) */
  id: string;
  comp: CompId;
  compLabel: CompLabel;
  /** 킥오프 UTC ISO(`<time datetime>`) */
  kickoff: string;
  /** 킥오프 KST "22:00" */
  time: string;
  /** 킥오프 KST 날짜 "10.30" */
  date: string;
  state: TonightState;
  /** 거터 상태 글자 — "종료" · "결과 대기" · 예정이면 null */
  stateText: string | null;
  home: TeamView;
  away: TeamView;
  /** 이유 태그(선별 순서 그대로) — 없으면 빈 배열(태그 줄을 숨긴다) */
  reasons: TonightReasonView[];
}

const STATE_TEXT: Readonly<Record<TonightState, string | null>> = {
  scheduled: null,
  finished: "종료",
  pending: "결과 대기",
};

/** 선별 결과 → 카드(킥오프 순 — 같은 킥오프는 선별 순서 그대로, 머리 주석) */
export function tonightCards(
  picks: readonly TonightPick[],
  team: TeamLookup,
  comps: ReadonlyMap<CompId, CompLabel>,
  nowMs: number,
): TonightCardView[] {
  const byKickoff = picks
    .map((pick, order) => ({
      pick,
      order,
      at: parseUtcIso(pick.match.kickoff).getTime(),
    }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ pick }) => pick);
  return byKickoff.map(({ match, reasons }) => {
    const raw = matchStateOf(match, nowMs);
    // 선별은 연기 경기를 빼므로 postponed는 오지 않는다 — 와도 예정처럼 그린다(결과를 지어내지 않는다)
    const state: TonightState = raw === "postponed" ? "scheduled" : raw;
    return {
      id: match.id,
      comp: match.comp,
      compLabel: comps.get(match.comp) ?? {
        short: match.comp,
        name: match.comp,
      },
      kickoff: match.kickoff,
      time: formatKst(match.kickoff, "time"),
      date: formatKst(match.kickoff, "monthDay"),
      state,
      stateText: STATE_TEXT[state],
      home: team(match.home),
      away: team(match.away),
      reasons: reasons.map((r) => ({ kind: r.kind, label: r.label })),
    };
  });
}

/** 창 문구 — "10.30 18:00 ~ 10.31 07:00 KST" */
export function tonightWindowText(window: UtcRange): string {
  return `${formatKst(window.start, "short")} ~ ${formatKst(window.end, "short")} KST`;
}

/** 창 문구(긴 날짜 — `/tonight` 머리) — "10월 30일 (금) 18:00 ~ 10월 31일 (토) 07:00 KST" */
export function tonightWindowLongText(window: UtcRange): string {
  return `${formatKst(window.start, "datetime")} ~ ${formatKst(window.end, "datetime")} KST`;
}

// ─── 리그 순위 미니 ─────────────────────────────────────────────────────────

/** 순위 미니 행 수(PRD §4.2 ⑧ — 상위 5위) */
export const LEAGUE_MINI_ROWS = 5;

export interface LeagueMiniRowView {
  pos: number;
  pts: number;
  team: TeamView;
  trend: TrendView;
  /** 구간 띠 — 구간 밖이면 null */
  band: ZoneBand | null;
  /** 대회 페이지 순위표의 그 팀 행 */
  href: string;
}

export interface LeagueMiniPanelView {
  comp: CompId;
  /** 탭 글자(약칭) */
  short: string;
  /** 정식 이름(목록 이름 "{대회} 상위 5위") */
  name: string;
  /** 상위 행 — 자료가 없으면 빈 배열(빈 상태) */
  rows: LeagueMiniRowView[];
  /** 아래 줄 — "10.30 기준 · 변동 전날 대비" · 자료가 없으면 null */
  note: string | null;
  /** 데이터 갱신 시각(UTC ISO) — 자료가 없으면 null */
  updatedAt: string | null;
  /** "전체 순위 ›" */
  href: string;
}

/** 순위 → 구간 띠(순위표와 같은 규칙 — 순위 숫자 기준, 규칙이 없으면 null) */
function bandAt(
  pos: number,
  zones: CompetitionConfig["zones"],
): ZoneBand | null {
  const rule = zones.find((r) => pos >= r.from && pos <= r.to);
  return rule ? zoneBandOf(rule) : null;
}

/** 대회 하나의 순위 미니 패널(머리 주석 규칙). 데이터가 없거나 순위표가 비면 rows 빈 배열 */
export function leagueMiniPanel(
  config: Pick<CompetitionConfig, "id" | "nameKo" | "shortKo" | "zones">,
  data: Pick<CompetitionFile, "standings" | "updatedAt"> | null,
  team: TeamLookup,
  limit: number = LEAGUE_MINI_ROWS,
): LeagueMiniPanelView {
  const base = routes.competition(config.id);
  const top = data ? data.standings.slice(0, limit) : [];
  const rows = top.map((row) => ({
    pos: row.pos,
    pts: row.pts,
    team: team(row.team),
    trend: trendOf(row.pos, row.prevPos),
    band: bandAt(row.pos, config.zones),
    href: `${base}#${row.team}`,
  }));
  const hasPrev = data?.standings.some((r) => r.prevPos !== null) ?? false;
  return {
    comp: config.id,
    short: config.shortKo,
    name: config.nameKo,
    rows,
    note:
      data && rows.length > 0
        ? `${formatKst(data.updatedAt, "monthDay")} 기준 · ${hasPrev ? "변동 전날 대비" : "변동 자료 없음"}`
        : null,
    updatedAt: data ? data.updatedAt : null,
    href: base,
  };
}

// ─── 선정 기준(`/tonight`) ──────────────────────────────────────────────────

export interface TonightCriterion {
  rule: "korean" | "ucl" | "topClash" | "derby" | "closeRace" | "bigClub";
  /** 규칙 이름(설정 값으로 채운 사실 문구) */
  label: string;
  /** 보조 설명(이유 태그 모양) — 없으면 null */
  note: string | null;
  weight: number;
}

/**
 * 선별 규칙 → 선정 기준 행(`configs/bigmatch-rules.json` 값 그대로 — 가중치 0 규칙은 꺼진 것이라 뺀다). 순서는 FR-81 순서(설정 키 순서).
 * 이유 태그 설명은 src/lib/tonight.ts 머리 주석 규칙과 같다(데이터로 확인되는 사실만 — D62 ③).
 */
export function tonightCriteria(rules: BigmatchRulesFile): TonightCriterion[] {
  const r = rules.rules;
  const rows: TonightCriterion[] = [
    {
      rule: "korean",
      label: "한국 선수 소속팀 경기",
      note: "태그 “{선수} 소속” — 라인업 발표 전이라 출전이 아니라 소속을 적어요",
      weight: r.korean.weight,
    },
    { rule: "ucl", label: "UCL 경기", note: null, weight: r.ucl.weight },
    {
      rule: "topClash",
      label: `리그 상위 ${r.topClash.topN}위끼리 맞대결`,
      note: "태그 “a·b위 맞대결”",
      weight: r.topClash.weight,
    },
    {
      rule: "derby",
      label: `지정 더비 ${r.derby.list.length}개`,
      note: "태그 = 더비 이름",
      weight: r.derby.weight,
    },
    {
      rule: "closeRace",
      label: `리그 승점 차 ${r.closeRace.maxPointsGap} 이내`,
      note: "태그 “승점 차 n · a·b위”",
      weight: r.closeRace.weight,
    },
    {
      rule: "bigClub",
      label: `빅클럽 ${r.bigClub.teams.length}곳 경기`,
      note: "동점 정리용 — 태그 없음",
      weight: r.bigClub.weight,
    },
  ];
  return rows.filter((row) => row.weight > 0);
}
