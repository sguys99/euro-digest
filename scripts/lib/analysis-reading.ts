/**
 * 분석 블로그 → 팀 페이지 "더 읽을거리" (M3-08 — PRD FR-10·FR-57, §15 D22·D23·D48) — 순수 함수만 둔다.
 * 읽기(configs·피드·팀 파일)·쓰기·로그는 주간 단계 scripts/lib/analysis-blogs-stage.ts가 한다.
 *
 * ── 대상 소스 (`planAnalysisSources`) ────────────────────────────────────
 *   `configs/sources.json`에서 수집 조건(FR-01 — `enabled && terms_checked`, sources.ts `collectBlocker`)을 통과한 `type: "analysis"`
 *   소스만. 일일 수집은 이 type을 `weekly-analysis`로 빼므로(sources.ts `dailyRoute`) 분석 블로그는 **주 1회 이 단계에서만** 받는다(FR-10).
 *
 * ── 팀 연결 (`matchPostTeams`) ────────────────────────────────────────────
 *   **원제목만** 본다 — 뉴스 카드 태그와 같은 규칙·사전(tag-names.ts `matchTitleTags`, `configs/names.ko.json` + 빅클럽 표). 요약문
 *   (description)은 쓰지 않는다: 태그 근거로 요약문을 쓰지 않는 규칙(D47 ① — 다음 상대·친정팀처럼 글 주제가 아닌 이름이 섞인다)이고,
 *   위험 수용 소스(Spielverlagerung 영문 — D48 ①)는 파서가 요약문을 꺼내지도 않는다(source-policy.ts). 팀 파일(data/teams)이 있는
 *   slug만 남기고, 팀이 하나도 맞지 않은 글은 버린다(팀 페이지 전용 — FR-10. 리그 전반 글을 대회 페이지에 붙이는 것은 범위 밖).
 *   선수 이름만 나온 글은 팀으로 옮기지 않는다(제목에 없는 사실 — 소속팀을 추정하지 않는다).
 *
 * ── 갱신 규칙 (`mergeReading`) ────────────────────────────────────────────
 *   팀당 최대 `READING_LIMIT`(5)건. 이번에 잡힌 글(발행 최신순)을 앞에, 이전 `reading`을 그 뒤에 두고 URL(정규화 — url-normalize.ts,
 *   추적 파라미터·www·AMP 차이 무시) 중복을 지운 뒤 자른다. 같은 URL이면 이번 피드의 제목·URL이 이긴다(원문이 고친 제목 그대로).
 *   제목·URL은 피드 원문 그대로다(D23 — 번역·요약·다듬기 없음, 정규화는 보이는 글자가 같은 정리만 — normalize.ts D45). 출처 표기는
 *   매체명(publisher-name.ts — "Spielverlagerung — English" → "Spielverlagerung").
 *   대상 글은 실행 시각 기준 `READING_MAX_AGE_DAYS`(180일) 안에 발행된 것만 — 피드가 21개월치를 담고 있어(월 1~2건) 첫 실행이 오래된
 *   전술 분석으로 채워지지 않게 한다. 주마다 같은 피드를 다시 받아도 결과는 같다(멱등 — 빠진 주가 있어도 다음 실행이 메운다).
 *   삭제 요청(`configs/takedowns.json` — 카드 ID = 정규화 URL 해시, card-id.ts)에 오른 URL은 새 글·이전 목록 모두에서 뺀다. 수집을
 *   멈춘 분석 블로그(`blockedPublishers` — 중단 요구·허가 거절로 끈 소스)의 글도 이전 목록에서 뺀다.
 *
 * ── 소스 건강도 (`analysisStaleStreak`) ───────────────────────────────────
 *   일일 건강도(FR-11 '3일 연속 0건' — source-health.ts)는 일일 수집 실행(job collect)의 소스만 판정하므로 분석 블로그에는 걸리지 않는다
 *   (월 1~2건 피드라 매번 걸리게 된다). 대신 주간 실행 기록(job weekly `sources[]` — 이 단계가 `usable` = 지난 7일 새 글 수를 남긴다)에서
 *   '새 글 없음' 주가 `ANALYSIS_STALE_WEEKS`(8)회 이어지면 경고한다. 받기 실패는 단계 실패(주간 실패 이슈)가 맡고, 연속에서는 건너뛴다.
 */
import type { FeedItem, RunLog, RunSource, Source, Team } from "@/lib/schema";
import { parseUtcIso } from "@/lib/time";

import { cardIdFor } from "./card-id";
import { publisherNameOf } from "./publisher-name";
import { collectBlocker } from "./sources";
import { matchTitleTags, type TagIndex } from "./tag-names";
import { normalizeUrl } from "./url-normalize";

/** 팀당 "더 읽을거리" 최대 건수 */
export const READING_LIMIT = 5;

/** 대상 글의 최대 나이(일) — 실행 시각 기준 */
export const READING_MAX_AGE_DAYS = 180;

/** 주간 실행 기록 `usable`의 기간(일) — 지난 1주 새 글 */
export const ANALYSIS_NEW_WINDOW_DAYS = 7;

/** '새 글 없음' 주간 연속이 이만큼이면 경고 */
export const ANALYSIS_STALE_WEEKS = 8;

/** 발행 시각이 실행 시각보다 이만큼 넘게 뒤면 미래 글로 본다(피드 시계 오류) */
export const READING_FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReadingEntry = Team["reading"][number];

// ─── 대상 소스 ───────────────────────────────────────────────────────────

/** 주 1회 받을 분석 블로그 — 수집 조건 통과 + type analysis(설정 순서) */
export function planAnalysisSources(sources: readonly Source[]): Source[] {
  return sources.filter(
    (s) => s.type === "analysis" && collectBlocker(s) === null,
  );
}

// ─── 글 → 팀 ─────────────────────────────────────────────────────────────

/** 글 1건이 버려진 이유 */
export type PostSkipReason =
  /** 실행 시각 기준 READING_MAX_AGE_DAYS보다 오래됨 */
  | "too-old"
  /** 실행 시각보다 미래(허용 오차 초과) */
  | "future"
  /** 삭제 요청 URL */
  | "takedown"
  /** 팀 파일이 있는 팀이 제목에 없음 */
  | "no-team";

export interface PostMatch {
  item: FeedItem;
  /** 팀 slug(제목 안 순서). 비었으면 `skipped`가 있다 */
  teams: string[];
  skipped: PostSkipReason | null;
}

/** 원제목 → 팀 파일이 있는 팀 slug(제목 안 순서, 중복 없음) */
export function matchPostTeams(
  item: Pick<FeedItem, "title" | "lang">,
  index: TagIndex,
  teamSlugs: ReadonlySet<string>,
): string[] {
  const tags = matchTitleTags(item.title, item.lang, index);
  const out: string[] = [];
  for (const hit of tags.teams) {
    if (teamSlugs.has(hit.slug) && !out.includes(hit.slug)) out.push(hit.slug);
  }
  return out;
}

export interface MatchPostsInput {
  items: readonly FeedItem[];
  index: TagIndex;
  teamSlugs: ReadonlySet<string>;
  /** 실행 시각(UTC ISO) */
  now: string;
  /** 삭제 요청 카드 ID */
  takedownIds?: ReadonlySet<string>;
}

/** 글마다 팀을 찾는다(입력 순서 유지). 같은 URL(정규화)이 여러 번 오면 처음 것만 */
export function matchPosts(input: MatchPostsInput): PostMatch[] {
  const nowMs = parseUtcIso(input.now).getTime();
  const oldest = nowMs - READING_MAX_AGE_DAYS * DAY_MS;
  const seen = new Set<string>();
  const out: PostMatch[] = [];
  for (const item of input.items) {
    const key = normalizeUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    const at = parseUtcIso(item.publishedAt).getTime();
    let skipped: PostSkipReason | null = null;
    if (at < oldest) skipped = "too-old";
    else if (at > nowMs + READING_FUTURE_TOLERANCE_MS) skipped = "future";
    else if (input.takedownIds?.has(cardIdFor(item.url))) skipped = "takedown";
    const teams =
      skipped === null
        ? matchPostTeams(item, input.index, input.teamSlugs)
        : [];
    if (skipped === null && teams.length === 0) skipped = "no-team";
    out.push({ item, teams, skipped });
  }
  return out;
}

// ─── 팀별 갱신 ───────────────────────────────────────────────────────────

/**
 * 수집을 멈춘 분석 블로그의 출처 매체명 — `type: "analysis"`인데 수집 조건을 통과하지 못하는 소스(enabled:false·terms_checked:false)의
 * 매체명에서, 지금 받는 분석 블로그와 같은 매체명은 뺀다(같은 매체의 다른 피드가 켜져 있으면 그 글까지 지우지 않게). 중단 요구·허가
 * 거절로 소스를 끄면 다음 주간 실행이 이전 reading에서 그 매체 글을 지운다(sources.json note '중단 요구 시 즉시 중단').
 */
export function blockedPublishers(sources: readonly Source[]): Set<string> {
  const active = new Set(planAnalysisSources(sources).map(publisherNameOf));
  const out = new Set<string>();
  for (const s of sources) {
    if (s.type !== "analysis" || collectBlocker(s) === null) continue;
    const name = publisherNameOf(s);
    if (!active.has(name)) out.add(name);
  }
  return out;
}

/**
 * 이번 글(최신순) 앞 + 이전 목록 뒤 → URL(정규화) 중복 제거 → 삭제 요청 제외 → 최대 `limit`건.
 * 이전 목록의 순서는 그대로 둔다(이미 최신순으로 쌓인 값).
 */
export function mergeReading(
  prev: readonly ReadingEntry[],
  fresh: readonly ReadingEntry[],
  options: {
    limit?: number;
    takedownIds?: ReadonlySet<string>;
    /** 뺄 출처 매체명(수집을 멈춘 분석 블로그 — `blockedPublishers`) */
    dropSources?: ReadonlySet<string>;
  } = {},
): ReadingEntry[] {
  const limit = options.limit ?? READING_LIMIT;
  const seen = new Set<string>();
  const out: ReadingEntry[] = [];
  for (const entry of [...fresh, ...prev]) {
    if (out.length >= limit) break;
    const key = normalizeUrl(entry.url);
    if (seen.has(key)) continue;
    seen.add(key);
    if (options.takedownIds?.has(cardIdFor(entry.url))) continue;
    if (options.dropSources?.has(entry.source)) continue;
    out.push({ title: entry.title, url: entry.url, source: entry.source });
  }
  return out;
}

export interface ReadingUpdate {
  slug: string;
  before: ReadingEntry[];
  after: ReadingEntry[];
  /** 이번에 잡힌 글 수(중복 제거 전) */
  fresh: number;
}

export interface BuildReadingInput {
  matches: readonly PostMatch[];
  /** 소스 id → 소스(출처 매체명) */
  sources: ReadonlyMap<string, Pick<Source, "name">>;
  /** 이전 팀 파일(slug → 팀) */
  teams: ReadonlyMap<string, Pick<Team, "slug" | "reading">>;
  takedownIds?: ReadonlySet<string>;
  /** 이전 목록에서 뺄 출처 매체명(`blockedPublishers`) */
  dropSources?: ReadonlySet<string>;
  limit?: number;
}

/**
 * 팀별 새 reading — 이번에 잡힌 글이 있거나 이전 목록에서 삭제 요청 URL·수집을 멈춘 매체를 빼야 하는 팀만, 그리고 값이 바뀐 팀만(slug 순).
 * 이번 글은 발행 최신순(같으면 입력 순서).
 */
export function buildReadingUpdates(input: BuildReadingInput): ReadingUpdate[] {
  const freshBySlug = new Map<
    string,
    { at: number; order: number; entry: ReadingEntry }[]
  >();
  input.matches.forEach((m, order) => {
    if (m.skipped !== null) return;
    const source = input.sources.get(m.item.source);
    if (source === undefined) return;
    const entry: ReadingEntry = {
      title: m.item.title,
      url: m.item.url,
      source: publisherNameOf(source),
    };
    const at = parseUtcIso(m.item.publishedAt).getTime();
    for (const slug of m.teams) {
      const list = freshBySlug.get(slug) ?? [];
      list.push({ at, order, entry });
      freshBySlug.set(slug, list);
    }
  });
  const updates: ReadingUpdate[] = [];
  for (const slug of [...input.teams.keys()].sort()) {
    const team = input.teams.get(slug);
    if (team === undefined) continue;
    const fresh = (freshBySlug.get(slug) ?? [])
      .sort((a, b) => b.at - a.at || a.order - b.order)
      .map((f) => f.entry);
    const after = mergeReading(team.reading, fresh, {
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.takedownIds ? { takedownIds: input.takedownIds } : {}),
      ...(input.dropSources ? { dropSources: input.dropSources } : {}),
    });
    if (sameReading(team.reading, after)) continue;
    updates.push({
      slug,
      before: [...team.reading],
      after,
      fresh: fresh.length,
    });
  }
  return updates;
}

function sameReading(
  a: readonly ReadingEntry[],
  b: readonly ReadingEntry[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.title === b[i]?.title &&
        x.url === b[i]?.url &&
        x.source === b[i]?.source,
    )
  );
}

// ─── 실행 기록 · 건강도 ───────────────────────────────────────────────────

/** 지난 `ANALYSIS_NEW_WINDOW_DAYS`일(실행 시각 포함) 안에 발행된 글 수 — 주간 실행 기록 `usable` */
export function newPostCount(
  items: readonly Pick<FeedItem, "publishedAt">[],
  now: string,
  days: number = ANALYSIS_NEW_WINDOW_DAYS,
): number {
  const nowMs = parseUtcIso(now).getTime();
  const from = nowMs - days * DAY_MS;
  return items.filter((i) => {
    const t = parseUtcIso(i.publishedAt).getTime();
    return t > from && t <= nowMs + READING_FUTURE_TOLERANCE_MS;
  }).length;
}

/**
 * '새 글 없음' 주간 연속 — 주간 실행 기록(job weekly, prod)의 이 소스 줄을 최근부터 거슬러 센다(이번 실행 `current` 포함).
 * ok && usable === 0(빈 피드 포함)이면 +1, usable > 0이면 끊고, 실패·`usable` 없는 줄은 건너뛴다. 같은 runId는 한 번만.
 */
export function analysisStaleStreak(
  history: readonly Pick<
    RunLog,
    "runId" | "env" | "job" | "startedAt" | "sources"
  >[],
  sourceId: string,
  current: { runId: string; startedAt: string; entry: RunSource },
): number {
  const nowMs = parseUtcIso(current.startedAt).getTime();
  const past = history
    .filter(
      (r) =>
        r.env === "prod" &&
        r.job === "weekly" &&
        r.runId !== current.runId &&
        parseUtcIso(r.startedAt).getTime() <= nowMs,
    )
    .sort(
      (a, b) =>
        parseUtcIso(a.startedAt).getTime() - parseUtcIso(b.startedAt).getTime(),
    )
    .flatMap((r) => {
      const entry = r.sources.find((s) => s.id === sourceId);
      return entry ? [entry] : [];
    });
  let count = 0;
  for (const entry of [...past, current.entry].reverse()) {
    if (!entry.ok || entry.usable === undefined) continue;
    if (entry.usable > 0) break;
    count += 1;
  }
  return count;
}
