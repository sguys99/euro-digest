/**
 * 마이 팀 화면 모델 — `/my` 다음 경기 · 최근 결과 · 관리 열, 팔로우 키 (PRD FR-110~112, DESIGN §9.3 D2 "`/my` 틀", DECISIONS D2 §9, plan M4-08)
 *
 * 순수 모듈(DOM·fs·zod 없음 — 타입만 import). 빌드(scripts/lib/follow-data.ts가 자료 파일을 만들 때)와 `/my` 클라이언트 섬이 같은 형식을 쓴다.
 *
 * 자료 두 층(정적 export — 팔로우는 브라우저 저장소에만 있어 빌드가 사람마다 다른 화면을 만들 수 없다)
 * 1. **디렉터리**(`MyDirectory`) — 팔로우할 수 있는 팀(팀 페이지가 있는 팀)·선수(등록 한국 선수)의 이름 · 배지 · 부제. `/my` HTML에 JSON으로
 *    싣는다(약 6KB — 관리 열 · 머리가 하이드레이션 즉시 그려진다, 가져오기(M4-10)의 아는 slug 목록).
 * 2. **팀 · 선수 자료 파일**(`MyEntityData`) — 다음 경기(입장권 · 일정 행 화면 모델 그대로) · 최근 결과. 빌드 후반(build-feeds)이
 *    `out/my/data/{teams|players}/{slug}.json`으로 쓰고, `/my` 섬이 **팔로우한 것만** 지연 fetch한다(최대 10개 — 각 3KB 안팎).
 *
 * 합치기 규칙
 * - **다음 경기**: 경기 id로 합친다(팔로우가 겹쳐도 한 줄) — 걸린 팔로우 이름은 팔로우 순서(팀 → 선수, 각 팔로우한 순). 킥오프 → id 순.
 *   첫 경기 = 입장권 가로형, 나머지 = 일정 행. 처음 `MY_FIXTURES_SHOWN`개만 펼치고 "모두 보기"로 나머지.
 * - **최근 결과**: 선수·팀 기준 행(D64 ③ — 기준 팀 득점 먼저 + 홈/원정). 팀 행과 그 팀 소속 선수 행이 같은 경기면 팀 행 하나만(같은 결과를
 *   두 번 쓰지 않는다 — 선수 출전은 선수 상세가 맡는다). 킥오프 늦은 순 `MY_RESULTS_SHOWN`개.
 */
import type { FollowKind, FollowLists } from "@/lib/follow";
import type { TeamView } from "@/lib/competition-view";
import type {
  CompMark,
  OpponentView,
  ResultView,
} from "@/lib/korean-players-view";
import type { FixtureRowView } from "@/lib/player-detail-view";

/** 자료 파일 형식 버전 */
export const MY_DATA_VERSION = 1;

/** 다음 경기 — 첫 화면에 펼칠 줄 수(입장권 1 + 일정 행 4 — 혼합안 "8경기 중 5") */
export const MY_FIXTURES_SHOWN = 5;
/** 다음 경기 — 팀 자료 파일에 싣는 예정 경기 수(팀 하나만 팔로우해도 "모두 보기"가 의미 있게) */
export const MY_TEAM_NEXT_LIMIT = 6;
/** 최근 결과 — 보일 줄 수(혼합안 6줄) */
export const MY_RESULTS_SHOWN = 6;
/** 최근 결과 — 자료 파일에 싣는 종료 경기 수(팀 · 선수마다) */
export const MY_RECENT_LIMIT = 5;
/** 내 팀 소식 — 홈 위젯 · `/my`에 보일 뉴스 행 수(혼합안 홈 3 · 마이 4) */
export const MY_NEWS_HOME = 3;
export const MY_NEWS_PAGE = 4;

// ─── 팔로우 키 ──────────────────────────────────────────────────────────────

/** 팔로우 키 접두 — 팀 `t:` · 선수 `p:`(공유 URL 쿼리 이름과 같은 글자 — D67 ③) */
export const FOLLOW_KEY_PREFIX: Readonly<Record<FollowKind, string>> = {
  teams: "t:",
  players: "p:",
};

/** 팔로우 키 "t:arsenal" · "p:kim-min-jae" — 뉴스 행 · 피드 카드의 걸린 대상과 맞춰 본다 */
export function followKey(kind: FollowKind, slug: string): string {
  return `${FOLLOW_KEY_PREFIX[kind]}${slug}`;
}

/** 팔로우 상태 → 키 집합(팀 → 선수, 팔로우한 순) */
export function followKeySet(state: FollowLists): Set<string> {
  return new Set([
    ...state.teams.map((s) => followKey("teams", s)),
    ...state.players.map((s) => followKey("players", s)),
  ]);
}

// ─── 디렉터리 ───────────────────────────────────────────────────────────────

/** 디렉터리 JSON 요소 id(`/my` 페이지에 하나 — `<script type="application/json">`) */
export const MY_DIRECTORY_ID = "my-directory";

/** 가져오기 확인 띠 자리를 연 표시 — `<html>` 속성(첫 페인트 전 부트 src/lib/my-import-boot.ts가 달고, 띠가 끝나면 섬이 지운다 — M4-10) */
export const MY_IMPORT_ATTR = "data-my-import";

/** 팀 한 줄 — 짧은 키(HTML · RSC 페이로드에 두 번 실린다) */
export interface MyTeamEntry {
  /** 한글 팀명(사전에 없으면 원어) */
  n: string;
  /** 이름이 라틴 글자(`lang="en"`) */
  l?: 1;
  /** 배지 약어 */
  s: string;
  /** 키트 [상의, 하의] — 없으면 폴백 배지 */
  c?: readonly [string, string];
  /** 부제 — 대표 대회 약칭 + 순위("분데스 1위"), 순위표가 없으면 대회 약칭 */
  u: string;
}

/** 선수 한 줄 */
export interface MyPlayerEntry {
  /** 한글 이름 */
  n: string;
  /** 소속팀 이름(부제) */
  t: string;
  /** 소속팀 이름이 라틴 글자 */
  tl?: 1;
}

export interface MyDirectory {
  teams: Readonly<Record<string, MyTeamEntry>>;
  players: Readonly<Record<string, MyPlayerEntry>>;
}

/** 디렉터리 항목 이름(없으면 null — 자료에서 빠진 팀·선수) */
export function directoryName(
  dir: MyDirectory,
  kind: FollowKind,
  slug: string,
): string | null {
  return Object.prototype.hasOwnProperty.call(dir[kind], slug)
    ? (dir[kind][slug]?.n ?? null)
    : null;
}

/** 팀 항목 → 배지 입력 */
export function teamBadgeOf(
  entry: MyTeamEntry,
): Pick<TeamView, "name" | "short" | "colors"> {
  return { name: entry.n, short: entry.s, colors: entry.c ?? null };
}

// ─── 팀 · 선수 자료 파일 ────────────────────────────────────────────────────

/** 최근 결과 한 줄(선수·팀 기준 — 기준 팀 득점 먼저) */
export interface MyResultRowView {
  /** 경기 id */
  key: string;
  kickoff: string;
  /** KST "10.26" */
  date: string;
  comp: CompMark;
  /** 기준 팀 */
  team: { slug: string; name: string; latin: boolean } & Pick<
    TeamView,
    "short" | "colors"
  >;
  opponent: OpponentView;
  home: boolean;
  result: ResultView | null;
  /** 선수 행만(팀 행은 0 · null) */
  goals: number;
  assists: number | null;
  /** 선수 행 — 선수 한글 이름(팀 행은 없음) */
  player?: string;
}

/** `out/my/data/{kind}/{slug}.json` */
export interface MyEntityData {
  v: typeof MY_DATA_VERSION;
  kind: FollowKind;
  slug: string;
  /** 다음 경기(킥오프 순) */
  next: FixtureRowView[];
  /** 최근 결과(킥오프 늦은 순) */
  recent: MyResultRowView[];
}

/** 자료 파일 읽기 경계 — 형식이 다르면 null(섬이 그 항목을 '자료 없음'으로 본다). zod 대신 최소 검사(클라이언트 번들) */
export function parseEntityData(
  raw: unknown,
  kind: FollowKind,
  slug: string,
): MyEntityData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    r.v !== MY_DATA_VERSION ||
    r.kind !== kind ||
    r.slug !== slug ||
    !Array.isArray(r.next) ||
    !Array.isArray(r.recent)
  ) {
    return null;
  }
  return raw as MyEntityData;
}

// ─── 합치기 ─────────────────────────────────────────────────────────────────

/** 팔로우 한 항목과 그 자료(못 받았으면 null) */
export interface MyEntityInput {
  kind: FollowKind;
  slug: string;
  /** 걸린 팔로우 줄에 쓸 이름 */
  name: string;
  data: MyEntityData | null;
  /** 선수면 소속팀 slug(팀 행과 겹침 판정) */
  team?: string;
}

export interface MyFixtureView {
  row: FixtureRowView;
  /** 걸린 팔로우 이름(팔로우 순서) */
  why: string[];
}

function ms(iso: string): number {
  return Date.parse(iso);
}

/** 다음 경기 합치기(머리 주석 규칙) */
export function mergeFixtures(
  entries: readonly MyEntityInput[],
): MyFixtureView[] {
  const byKey = new Map<string, MyFixtureView>();
  for (const entry of entries) {
    for (const row of entry.data?.next ?? []) {
      const hit = byKey.get(row.key);
      if (hit) {
        if (!hit.why.includes(entry.name)) hit.why.push(entry.name);
      } else {
        byKey.set(row.key, { row, why: [entry.name] });
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      ms(a.row.kickoff) - ms(b.row.kickoff) ||
      (a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0),
  );
}

/** 최근 결과 합치기(머리 주석 규칙) */
export function mergeResults(
  entries: readonly MyEntityInput[],
): MyResultRowView[] {
  const teamRows = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "teams") continue;
    for (const row of entry.data?.recent ?? [])
      teamRows.add(`${row.key}|${row.team.slug}`);
  }
  const seen = new Set<string>();
  const out: MyResultRowView[] = [];
  for (const entry of entries) {
    for (const row of entry.data?.recent ?? []) {
      const matchTeam = `${row.key}|${row.team.slug}`;
      if (entry.kind === "players" && teamRows.has(matchTeam)) continue;
      const id =
        entry.kind === "players" ? `${matchTeam}|${entry.slug}` : matchTeam;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out.sort(
    (a, b) =>
      ms(b.kickoff) - ms(a.kickoff) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) ||
      (a.player ?? "").localeCompare(b.player ?? ""),
  );
}

/** 머리 부제 — "팀 바이에른 뮌헨 · 아스널 · 선수 김민재"(없는 종류는 뺀다) */
export function followSummary(
  dir: MyDirectory,
  state: FollowLists,
): { teams: string[]; players: string[] } {
  const names = (kind: FollowKind) =>
    state[kind].map((slug) => directoryName(dir, kind, slug) ?? slug);
  return { teams: names("teams"), players: names("players") };
}
