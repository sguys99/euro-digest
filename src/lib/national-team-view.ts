/**
 * 대표팀 화면 모델 — `/national-team/` · 홈 A매치 섹션 · 선수 상세 대표팀 링크가 쓰는 순수 함수 (PRD FR-70~73, DESIGN §9.3 D2
 * "`/national-team` 틀" · "홈 위젯 (D2)" A매치, DECISIONS D2 §5 #4 · D64 ⑦, plan M3-13)
 *
 * I/O 없는 순수 함수만 둔다(파일 읽기는 src/lib/data/national-team.ts). 입력은 스키마를 통과한 `configs/national-team.json`과 뉴스 호.
 * - **일정 행은 경기 기준**(DESIGN §9.3 스코어 맥락 — D1 · D30): 홈 팀 먼저, 스코어도 홈-원정 순. 한국의 결과(W/D/L)는 D1 팀 일정처럼
 *   결과 칩으로 병기한다(대표팀 일정 = 한 팀의 일정). 승부차기 필드는 설정에 없어 쓰지 않는다.
 * - 상태: `finished`(결과 — 설정의 수동 결과) · `scheduled`(예정) · 킥오프가 지났는데 아직 `scheduled`면 `pending`(결과 대기 — 사람이
 *   결과를 적기 전, D1 팀 일정과 같은 말) · `postponed`(연기).
 * - 경기장은 설정 값 그대로(경기장 미발표면 도시만 — "도하 (카타르)"). 없으면 쓰지 않는다.
 * - 소집 명단은 **등록 한국 선수 중 소집된 선수만** 있다(스키마 `SquadSchema` — 전체 명단은 데이터에 없다). 화면은 그 사실을 캡션으로 쓴다.
 * - 대표팀 소식(한국) = 최근 호의 `cat: national` + `kr: true` 카드, 주요국 A매치 뉴스 = 최신 호의 `cat: national` 전체
 *   (`/news/?cat=national` 필터 결과와 같다 — FR-72).
 */
import type { FormResult } from "@/lib/competition-view";
import type { PlayerNewsItem } from "@/lib/player-detail-view";
import type {
  NationalMatch,
  NationalTeamFile,
  Squad,
} from "@/lib/schema/configs";
import type { NewsCard } from "@/lib/schema/news";
import { formatKst, parseUtcIso } from "@/lib/time";

/** 대표팀 이름(일정 행 — 홈/원정 팀 표기) */
export const KOREA_NAME = "대한민국";

/** 대표팀 소식(한국) 줄 수 — `/national-team/` */
export const NATIONAL_NEWS_LIMIT = 8;

/** 홈 A매치 섹션의 뉴스 행 수(DESIGN §9.3 D2 홈 위젯 — "대표팀 뉴스 행 3장") */
export const HOME_NATIONAL_NEWS_LIMIT = 3;

export type NationalMatchState =
  "finished" | "scheduled" | "pending" | "postponed";

/** 일정 · 결과 한 줄(경기 기준 — 홈 팀 먼저) */
export interface NationalMatchRowView {
  id: string;
  kickoff: string;
  /** 거터 날짜 "11.13"(KST) */
  date: string;
  /** 요일 한 글자 "금" */
  weekday: string;
  /** 킥오프 "23:30"(KST) — 시각 미정이면 null */
  time: string | null;
  competition: string;
  /** 경기장 · 도시(설정 값 그대로) — 없으면 null */
  venue: string | null;
  /** 홈 팀 이름 */
  home: string;
  /** 원정 팀 이름 */
  away: string;
  /** 한국이 홈인가(설정 `home`) */
  koreaHome: boolean;
  state: NationalMatchState;
  /** 홈-원정 순 스코어 — 결과가 있을 때만 */
  score: { h: number; a: number } | null;
  /** 한국 기준 결과 — 결과가 있을 때만 */
  result: FormResult | null;
  /** 일정 · 결과 근거 */
  sourceUrl: string | null;
}

const WEEKDAY_RE = /\((.)\)/;

/** 상태(머리 주석) — 킥오프가 지났는데 `scheduled`면 결과 대기 */
export function nationalMatchState(
  match: Pick<NationalMatch, "status" | "kickoff">,
  nowMs: number,
): NationalMatchState {
  if (match.status === "finished") return "finished";
  if (match.status === "postponed") return "postponed";
  return parseUtcIso(match.kickoff).getTime() <= nowMs
    ? "pending"
    : "scheduled";
}

/** 한국 기준 결과 */
export function koreaResult(result: { kor: number; opp: number }): FormResult {
  if (result.kor === result.opp) return "D";
  return result.kor > result.opp ? "W" : "L";
}

/** 경기 한 건 → 일정 행 */
export function nationalMatchRow(
  match: NationalMatch,
  nowMs: number,
): NationalMatchRowView {
  const day = formatKst(match.kickoff, "dayShort"); // "11.13 (금)"
  const state = nationalMatchState(match, nowMs);
  const r = state === "finished" ? match.result : null;
  return {
    id: match.id,
    kickoff: match.kickoff,
    date: formatKst(match.kickoff, "monthDay"),
    weekday: WEEKDAY_RE.exec(day)?.[1] ?? "",
    time: match.kickoffTbd ? null : formatKst(match.kickoff, "time"),
    competition: match.competition,
    venue: match.venue ?? null,
    home: match.home ? KOREA_NAME : match.opponent,
    away: match.home ? match.opponent : KOREA_NAME,
    koreaHome: match.home,
    state,
    score: r
      ? match.home
        ? { h: r.kor, a: r.opp }
        : { h: r.opp, a: r.kor }
      : null,
    result: r ? koreaResult(r) : null,
    sourceUrl: match.sourceUrl ?? null,
  };
}

/** 경기 목록 → 일정 행(킥오프 순, 같으면 입력 순) */
export function nationalMatchRows(
  matches: readonly NationalMatch[],
  nowMs: number,
): NationalMatchRowView[] {
  return matches
    .map((m, index) => ({ m, index, at: parseUtcIso(m.kickoff).getTime() }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at - b.at))
    .map(({ m }) => nationalMatchRow(m, nowMs));
}

// ─── 소집 명단 ──────────────────────────────────────────────────────────────

/** 가장 최근에 발표된 소집 명단(발표 시각 순 — 같으면 뒤에 적힌 것) — 없으면 null */
export function latestSquad(
  config: Pick<NationalTeamFile, "squads">,
): Squad | null {
  let latest: { squad: Squad; at: number } | null = null;
  for (const squad of config.squads) {
    const at = parseUtcIso(squad.announcedAt).getTime();
    if (latest === null || at >= latest.at) latest = { squad, at };
  }
  return latest?.squad ?? null;
}

/** "11월 소집" — 명단 id가 "YYYY-MM"이 아니면 "{발표일} 발표 소집" */
export function squadLabel(squad: Pick<Squad, "id" | "announcedAt">): string {
  const month = /^\d{4}-(\d{2})$/.exec(squad.id)?.[1];
  return month
    ? `${Number(month)}월 소집`
    : `${formatKst(squad.announcedAt, "monthDay")} 발표 소집`;
}

/** 소집 명단의 선수 한 명 — 등록 한국 선수(설정) 값을 화면 모델로 옮긴 것 */
export interface NationalSquadPlayer<T> {
  slug: string;
  nameKo: string;
  position: string;
  team: T;
}

export interface NationalSquadView<T> {
  id: string;
  /** "11월 소집" */
  label: string;
  announcedAt: string;
  /** 이 명단이 뛰는 경기 — 일정 행(킥오프 순) */
  matches: NationalMatchRowView[];
  /** 등록 한국 선수 중 소집된 선수(설정 순서) — 설정에 없는 slug는 뺀다(validate가 막는다) */
  players: NationalSquadPlayer<T>[];
  sourceUrl: string | null;
}

/** 최신 소집 명단 → 화면 모델. `player`는 slug → 등록 선수 화면 값(없으면 null) */
export function nationalSquadView<T>(
  config: Pick<NationalTeamFile, "squads" | "matches">,
  player: (slug: string) => NationalSquadPlayer<T> | null,
  nowMs: number,
): NationalSquadView<T> | null {
  const squad = latestSquad(config);
  if (!squad) return null;
  const ids = new Set(squad.matchIds);
  return {
    id: squad.id,
    label: squadLabel(squad),
    announcedAt: squad.announcedAt,
    matches: nationalMatchRows(
      config.matches.filter((m) => ids.has(m.id)),
      nowMs,
    ),
    players: squad.playerSlugs
      .map(player)
      .filter((p): p is NationalSquadPlayer<T> => p !== null),
    sourceUrl: squad.sourceUrl ?? null,
  };
}

// ─── 근거 링크 ──────────────────────────────────────────────────────────────

/** 출처 줄의 근거 링크 하나 — 같은 URL은 한 번(라벨을 합친다) */
export interface NationalSourceLink {
  url: string;
  label: string;
}

/**
 * 일정 · 결과 · 소집 명단의 근거 링크(설정 `sourceUrl`) — 경기 순서대로, 같은 URL은 한 링크. 라벨 = "{M.DD} {상대}전"을 `·`로 잇고, 소집
 * 명단 근거와 같은 URL이면 "{N}월 소집 발표"(그 발표가 경기 일정을 함께 알린 것 — 설정이 같은 근거를 적었다).
 */
export function nationalSourceLinks(
  rows: readonly NationalMatchRowView[],
  squad: Pick<Squad, "id" | "announcedAt" | "sourceUrl"> | null,
): NationalSourceLink[] {
  const byUrl = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.sourceUrl) continue;
    const opponent = row.koreaHome ? row.away : row.home;
    const labels = byUrl.get(row.sourceUrl) ?? [];
    labels.push(`${row.date} ${opponent}전`);
    byUrl.set(row.sourceUrl, labels);
  }
  const squadUrl = squad?.sourceUrl ?? null;
  if (squadUrl && !byUrl.has(squadUrl)) byUrl.set(squadUrl, []);
  return [...byUrl].map(([url, labels]) => ({
    url,
    label:
      squad && url === squadUrl
        ? `${squadLabel(squad)} 발표`
        : labels.join(" · "),
  }));
}

// ─── 뉴스 ───────────────────────────────────────────────────────────────────

/** 대표팀 소식(한국) 카드 — `cat: national` + `kr: true` */
export function isKoreaNationalCard(
  card: Pick<NewsCard, "cat" | "kr">,
): boolean {
  return card.cat === "national" && card.kr;
}

/** 주요국 A매치 뉴스 카드 — `cat: national` 전체(`/news/?cat=national`과 같은 조건) */
export function isNationalCard(card: Pick<NewsCard, "cat">): boolean {
  return card.cat === "national";
}

/**
 * 뉴스 호 목록(기간 안) → 대표팀 소식(한국) 줄 — 대표 출처 시각 최신순 `limit`건 + 전체 건수. 같은 카드 ID는 한 번(최신 호의 것).
 * 선수 상세 대표팀 소식(src/lib/player-detail-view.ts `playerNews`)과 같은 줄 모양이다.
 */
export function koreaNationalNews<
  N extends { date: string; cards: readonly NewsCard[] },
>(
  issues: readonly N[],
  since: string,
  limit: number = NATIONAL_NEWS_LIMIT,
): { items: PlayerNewsItem[]; total: number } {
  const seen = new Set<string>();
  const items: PlayerNewsItem[] = [];
  for (const news of [...issues]
    .filter((n) => n.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date))) {
    for (const card of news.cards) {
      if (!isKoreaNationalCard(card) || seen.has(card.id)) continue;
      seen.add(card.id);
      items.push({ card, date: news.date });
    }
  }
  items.sort(
    (a, b) =>
      parseUtcIso(b.card.src[0]!.at).getTime() -
      parseUtcIso(a.card.src[0]!.at).getTime(),
  );
  return { items: items.slice(0, limit), total: items.length };
}
