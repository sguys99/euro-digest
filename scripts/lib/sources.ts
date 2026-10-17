/**
 * 뉴스 소스 로더 (M1-02, PRD FR-01·FR-10, D23·D32) — `configs/sources.json`을 zod로 검증해 읽고,
 * 일일 수집 대상과 제외 사유를 **순수 함수**로 나눈다. 소스 URL은 설정에서만 받는다(하드코딩 없음).
 *
 * 수집 조건(FR-01, CLAUDE.md §6.4): `enabled && terms_checked`, 목록·OG 크롤링 소스(`crawl`)는 `robots_checked`도.
 * 조건을 통과한 소스도 type에 따라 일일 RSS 루프에서 뺀다:
 *   - rss·journalist·aggregator → 일일 RSS 루프(`feeds`)
 *   - crawl → 크롤러 모듈(`scripts/crawlers/<site>.ts`)이 등록된 것만 `crawls`. 지금은 등록된 크롤러가 없다
 *     (M1-05 보류 — 허용 사이트 0곳, PRD §15 D32) → 전부 "no-crawler"로 건너뛴다.
 *   - search → 일일 RSS 루프 밖 — 검색 쿼리 로더(scripts/lib/search-queries.ts, M1-06)가 다룬다(검색 요청 M1-07은 보류, D32)
 *   - analysis → 주 1회 수집(FR-10, M3-08) — 일일 수집에서 뺀다
 *
 * `summarize` 값은 수집 여부·경로에 영향을 주지 않는다 — 뉴스 기사는 어떤 소스든 LLM에 보내지 않고 원제목+링크
 * (`ai:false`) 카드로만 쓴다(D23). 수집 판정은 `summarize`를 읽지 않고, `sourceConfigWarnings`만 true를 경고한다.
 *
 * 소스별 보존 기간(`retentionDays`, D32): 조회 함수만 둔다. 기간이 지난 출처를 data/에서 지우는 일은 purge-plan.ts·purge-stage.ts
 * (M1-25 — 카드 출처에 소스 id가 없어 매체명으로 찾는다: `retentionByPublisher`).
 */
import { SourcesFileSchema, type Source } from "@/lib/schema";

import { readConfigFile } from "./config-files";

/** `<rootDir>/configs/sources.json` → Source[] (스키마 오류면 ConfigFileError) */
export function loadSources(rootDir: string): Promise<Source[]> {
  return readConfigFile(rootDir, "sources.json", SourcesFileSchema);
}

// ─── 수집 조건 ───────────────────────────────────────────────────────────

/** 수집해도 되는 소스인가 — enabled && terms_checked (+ crawl은 robots_checked). type별 경로는 따지지 않는다. */
export function isCollectable(source: Source): boolean {
  return collectBlocker(source) === null;
}

/** 수집 조건을 막는 사유 — enabled:false · terms_checked:false · (crawl) robots_checked:false */
export type CollectBlocker =
  "disabled" | "terms-unchecked" | "robots-unchecked";

/**
 * 수집 조건을 막는 첫 사유(없으면 null) — 판정 순서: enabled → terms_checked → (crawl) robots_checked.
 * 검색 쿼리 로더(scripts/lib/search-queries.ts, M1-06)도 쿼리가 가리키는 검색형 소스를 이것으로 판정한다.
 */
export function collectBlocker(source: Source): CollectBlocker | null {
  if (!source.enabled) return "disabled";
  if (!source.terms_checked) return "terms-unchecked";
  if (source.type === "crawl" && !source.robots_checked) {
    return "robots-unchecked";
  }
  return null;
}

// ─── 일일 수집 계획 ──────────────────────────────────────────────────────

/**
 * 크롤러 모듈이 있는 `crawl` 소스 id. M1-05가 `scripts/crawlers/<site>.ts`를 만들 때 여기에 등록한다.
 * 지금은 비어 있다 — M0-23~25 판정에서 크롤링을 허용한 사이트가 0곳(PRD §15 D32).
 */
export const CRAWLER_SOURCE_IDS: ReadonlySet<string> = new Set<string>();

/** 일일 수집에서 뺀 이유 */
export type SourceExclusionReason =
  /** enabled:false */
  | "disabled"
  /** terms_checked:false — 약관상 이용 방식이 허용되지 않았거나 불명확 */
  | "terms-unchecked"
  /** type crawl인데 robots_checked:false */
  | "robots-unchecked"
  /** type crawl, 수집 조건은 통과했지만 크롤러 모듈 없음(M1-05 보류) */
  | "no-crawler"
  /** type search — 검색 쿼리 로더(search-queries.ts, M1-06)가 따로 다룬다 */
  | "search-type"
  /** type analysis — 주 1회 수집(FR-10, M3-08) */
  | "weekly-analysis";

export interface SourceExclusion {
  id: string;
  type: Source["type"];
  reason: SourceExclusionReason;
}

export interface DailySourcePlan {
  /** 일일 RSS 루프 대상(설정 파일 순서 유지) */
  feeds: Source[];
  /** 목록 크롤러 대상 — 크롤러 모듈이 등록된 crawl 소스만. 실행은 M1-05(지금은 항상 빈 목록) */
  crawls: Source[];
  /** 일일 수집에서 뺀 소스와 이유(설정 파일 순서) */
  excluded: SourceExclusion[];
}

export interface PlanOptions {
  /** 크롤러 모듈이 있는 crawl 소스 id — 기본 CRAWLER_SOURCE_IDS(테스트 주입용) */
  crawlerIds?: ReadonlySet<string>;
}

/** 소스 1개의 일일 수집 경로. 수집 조건(FR-01)을 먼저 보고, 통과하면 type으로 나눈다. */
export function dailyRoute(
  source: Source,
  options: PlanOptions = {},
): "feed" | "crawl" | SourceExclusionReason {
  const blocker = collectBlocker(source);
  if (blocker !== null) return blocker;
  switch (source.type) {
    case "rss":
    case "journalist":
    case "aggregator":
      return "feed";
    case "crawl":
      return (options.crawlerIds ?? CRAWLER_SOURCE_IDS).has(source.id)
        ? "crawl"
        : "no-crawler";
    case "search":
      return "search-type";
    case "analysis":
      return "weekly-analysis";
    default:
      // case가 enum 전체를 덮는다 — 스키마에 새 type이 생기면 여기서 타입 오류가 난다.
      return assertNever(source.type);
  }
}

function assertNever(value: never): never {
  throw new Error(`알 수 없는 소스 type: ${String(value)}`);
}

/** 설정 전체 → 일일 수집 계획(피드·크롤러 대상·제외 목록). 순수 함수. */
export function planDailySources(
  sources: readonly Source[],
  options: PlanOptions = {},
): DailySourcePlan {
  const plan: DailySourcePlan = { feeds: [], crawls: [], excluded: [] };
  for (const source of sources) {
    const route = dailyRoute(source, options);
    if (route === "feed") plan.feeds.push(source);
    else if (route === "crawl") plan.crawls.push(source);
    else
      plan.excluded.push({ id: source.id, type: source.type, reason: route });
  }
  return plan;
}

// ─── 보존 기간 (D32) ─────────────────────────────────────────────────────

/** 소스 1개의 보존 기간(일). 설정하지 않았으면 null — PRD §8.4 기본 보존(90일 → 월별 병합, 삭제 없음). */
export function retentionDaysOf(
  source: Pick<Source, "retentionDays">,
): number | null {
  return source.retentionDays ?? null;
}

/**
 * 보존 기간을 설정한 소스만 모은 표(id → 일). 수집 묶음(소스 id를 아는 단계)용 — 이미 저장된 카드의 출처는 소스 id가 없어
 * 삭제 단계(M1-25)가 매체명 표(purge-plan.ts `retentionByPublisher`)를 쓴다.
 * 활성 여부와 무관하게 담는다 — 수집을 멈춘 소스의 과거 카드도 기간이 지나면 지워야 한다.
 */
export function retentionBySource(
  sources: readonly Source[],
): ReadonlyMap<string, number> {
  const table = new Map<string, number>();
  for (const source of sources) {
    const days = retentionDaysOf(source);
    if (days !== null) table.set(source.id, days);
  }
  return table;
}

// ─── 설정 경고 (npm run validate) ────────────────────────────────────────

export interface SourceConfigWarning {
  /** sources.json 배열 인덱스 */
  index: number;
  field: "robots_checked" | "terms_checked" | "summarize" | "author";
  message: string;
}

/**
 * 오류는 아니지만 사람이 확인해야 할 설정 모순 — 스키마는 통과하고 수집 조건(FR-01)이 막아 주지만, 의도와 다를 수 있다.
 *   - enabled인데 terms_checked:false → 수집되지 않는다(약관 확인 전에 켰을 가능성)
 *   - type crawl + enabled인데 robots_checked:false → 수집되지 않는다
 *   - summarize:true → 무시된다. 뉴스 기사는 LLM에 보내지 않는다(D23, 경로를 다시 여는 것은 사용자 승인 사항)
 *   - author가 빈 문자열(공백만) → 작성자 필터가 어떤 항목과도 일치하지 않아 그 소스의 항목이 전부 빠진다(M1-04)
 */
export function sourceConfigWarnings(
  sources: readonly Source[],
): SourceConfigWarning[] {
  const warnings: SourceConfigWarning[] = [];
  sources.forEach((source, index) => {
    if (source.enabled && !source.terms_checked) {
      warnings.push({
        index,
        field: "terms_checked",
        message: `소스 "${source.id}"가 enabled:true인데 terms_checked:false — 수집되지 않는다(FR-01). 약관 확인 전이면 enabled:false로 둘 것`,
      });
    }
    if (source.type === "crawl" && source.enabled && !source.robots_checked) {
      warnings.push({
        index,
        field: "robots_checked",
        message: `type crawl 소스 "${source.id}"가 enabled:true인데 robots_checked:false — 수집되지 않는다(FR-01)`,
      });
    }
    if (source.summarize) {
      warnings.push({
        index,
        field: "summarize",
        message: `소스 "${source.id}"가 summarize:true — 무시된다. 뉴스 기사는 LLM에 보내지 않고 원제목+링크로만 게시한다(PRD §15 D23, 요약 경로는 사용자 승인 사항)`,
      });
    }
    if (source.author !== undefined && source.author.trim() === "") {
      warnings.push({
        index,
        field: "author",
        message: `소스 "${source.id}"의 author가 비어 있다 — 작성자 필터가 어떤 항목과도 일치하지 않아 전부 제외된다(M1-04). 필터를 쓰지 않으려면 author 키를 지울 것`,
      });
    }
  });
  return warnings;
}
