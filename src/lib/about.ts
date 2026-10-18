/**
 * `/about` 화면 모델 — 계절별 발행 시각표와 지금 싣는 매체 목록 (PRD FR-140·FR-01·FR-06, §15 D26, M1-36) — 순수 함수.
 *
 * 문구에 쓰는 사실은 모두 설정·코드에서 계산한다(하드코딩 금지):
 * - 발행 시각 = `PUBLISH_TIMES_KST`, 계절 = `publishSeason`(발행일 00:00 KST의 유럽 서머타임 여부), 기간 경계 =
 *   `europeanSummerTimeTransitions`(3·10월 마지막 일요일 01:00 UTC = 10:00 KST) — 모두 src/lib/time.ts. 전환 일요일 아침 호는 전환 전
 *   계절이라 새 계절은 그다음 월요일 호부터다(D26).
 * - 매체 = `configs/sources.json`에서 일일 수집 대상인 소스(수집 조건 `enabled && terms_checked` + 일일 RSS 루프 type — 파이프라인
 *   scripts/lib/sources.ts `planDailySources().feeds`와 같은 규칙, tests/about-page.test.tsx가 대조)를 카드와 같은 매체명
 *   (`publisherNameOf`)으로 묶는다.
 */
import { publisherNameOf } from "@/lib/publisher-name";
import type { Tier } from "@/lib/schema/common";
import type { Source } from "@/lib/schema/source";
import {
  europeanSummerTimeTransitions,
  kstDate,
  PUBLISH_TIMES_KST,
  publishSeason,
  shiftDate,
  type PublishSeason,
} from "@/lib/time";

// ─── 발행 시각 ───────────────────────────────────────────────────────────

/** 계절 이름 — 화면 문구 */
export const SEASON_LABEL: Readonly<Record<PublishSeason, string>> = {
  summer: "유럽 서머타임 기간",
  winter: "유럽 표준시 기간",
};

/** 같은 계절이 이어지는 발행일 구간(양 끝 포함, KST "YYYY-MM-DD") */
export interface SeasonSpan {
  season: PublishSeason;
  /** 공개 목표 시각 KST "HH:MM" */
  publish: string;
  /** 이 계절의 첫 호 */
  from: string;
  /** 이 계절의 마지막 호(전환 일요일) */
  to: string;
}

/** 그해 서머타임 첫 호 — 3월 마지막 일요일(전환 10:00 KST) 다음 날 */
function summerFirstIssue(year: number): string {
  return shiftDate(kstDate(europeanSummerTimeTransitions(year).start), 1);
}

/** 그해 서머타임 마지막 호 — 10월 마지막 일요일(전환 10:00 KST라 그날 아침 호까지 서머타임) */
function summerLastIssue(year: number): string {
  return kstDate(europeanSummerTimeTransitions(year).end);
}

/** 발행일이 속한 계절 구간 */
export function seasonSpanOf(date: string): SeasonSpan {
  const season = publishSeason(date);
  const year = Number(date.slice(0, 4));
  const span = (from: string, to: string): SeasonSpan => ({
    season,
    publish: PUBLISH_TIMES_KST[season].publish,
    from,
    to,
  });
  if (season === "summer") {
    return span(summerFirstIssue(year), summerLastIssue(year));
  }
  // 표준시 — 그해 서머타임 앞(1~3월)이면 지난해 10월 전환 다음 날부터, 뒤(10~12월)면 다음 해 3월 전환일까지
  return date < summerFirstIssue(year)
    ? span(
        shiftDate(summerLastIssue(year - 1), 1),
        shiftDate(summerFirstIssue(year), -1),
      )
    : span(
        shiftDate(summerLastIssue(year), 1),
        shiftDate(summerFirstIssue(year + 1), -1),
      );
}

/** 발행 시각표 — 지금 계절과 다음 계절(시간 순) */
export interface PublishSchedule {
  /** 기준 발행일(KST) */
  date: string;
  current: SeasonSpan;
  next: SeasonSpan;
}

/** 기준 발행일(최신 호 날짜 — 없으면 빌드 날짜)의 시각표 */
export function publishSchedule(date: string): PublishSchedule {
  const current = seasonSpanOf(date);
  return { date, current, next: seasonSpanOf(shiftDate(current.to, 1)) };
}

// ─── 지금 싣는 매체 ──────────────────────────────────────────────────────

/** 일일 RSS 루프 type(scripts/lib/sources.ts `dailyRoute` "feed") — 크롤러(M1-05)·검색(M1-07)·분석 블로그(주 1회, M3-08)는 그 작업에서 */
const FEED_TYPES: ReadonlySet<Source["type"]> = new Set([
  "rss",
  "journalist",
  "aggregator",
]);

/** 지금 매일 수집하는 소스인가 — 수집 조건(FR-01: enabled && terms_checked) + 일일 RSS 루프 type */
export function isDailyFeed(source: Source): boolean {
  return source.enabled && source.terms_checked && FEED_TYPES.has(source.type);
}

/** 매체 하나 — 같은 매체명의 피드를 묶는다 */
export interface Outlet {
  /** 카드에 보이는 매체명(`publisherNameOf`) */
  name: string;
  /** 첫 피드의 언어(`lang` 속성·언어 이름) */
  lang: string;
  /** 해외(원제목 그대로) · 국내(한국어 원문 제목) */
  region: "overseas" | "domestic";
  /** 피드들의 출처 Tier(중복 없이 오름차순 — 보통 하나) */
  tiers: Tier[];
  /** 피드 이름(소스 이름의 섹션 " — Football" 또는 괄호 설명 "(Fabrizio Romano)") — 없으면 빈 배열 */
  feeds: string[];
}

/** 소스 이름에서 매체명 뒤의 피드 이름 — "BBC Sport — Premier League" → "Premier League", "the Daily Briefing (Fabrizio Romano)" → "Fabrizio Romano" */
export function feedLabelOf(source: Pick<Source, "name">): string | null {
  const [, section] = source.name.split(" — ");
  if (section?.trim()) return section.trim();
  const paren = /\(([^)]+)\)\s*$/.exec(source.name)?.[1]?.trim();
  return paren || null;
}

/**
 * 지금 싣는 매체 목록 — 매일 수집하는 소스를 매체명으로 묶는다. 순서: 출처 Tier(가장 높은 등급) 오름차순, 같으면 설정 파일에 처음
 * 나온 순서. 해외·국내 구분은 화면이 `region`으로 나눈다.
 */
export function outletsFrom(sources: readonly Source[]): Outlet[] {
  // Map은 넣은 순서를 지키고 Array#sort는 안정 정렬이라, 같은 Tier끼리는 설정 파일 순서가 남는다
  const byName = new Map<string, Outlet>();
  for (const source of sources) {
    if (!isDailyFeed(source)) continue;
    const name = publisherNameOf(source);
    let outlet = byName.get(name);
    if (!outlet) {
      outlet = {
        name,
        lang: source.lang,
        region: source.lang === "ko" ? "domestic" : "overseas",
        tiers: [],
        feeds: [],
      };
      byName.set(name, outlet);
    }
    if (!outlet.tiers.includes(source.tier)) {
      outlet.tiers.push(source.tier);
      outlet.tiers.sort((a, b) => a - b);
    }
    const feed = feedLabelOf(source);
    if (feed && !outlet.feeds.includes(feed)) outlet.feeds.push(feed);
  }
  return [...byName.values()].sort(
    (a, b) => (a.tiers[0] ?? 3) - (b.tiers[0] ?? 3),
  );
}

/** 언어 코드 → 화면 이름(모르는 코드는 그대로) */
export const LANG_LABEL: Readonly<Record<string, string>> = {
  en: "영어",
  it: "이탈리아어",
  es: "스페인어",
  de: "독일어",
  fr: "프랑스어",
  pt: "포르투갈어",
  ko: "한국어",
};

export function langLabel(lang: string): string {
  return LANG_LABEL[lang] ?? lang;
}

/** 출처 Tier별 매체 수(가장 높은 등급 기준) — Tier 설명 표의 "지금 N곳" */
export function outletCountByTier(
  outlets: readonly Outlet[],
): Readonly<Record<Tier, number>> {
  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const outlet of outlets) {
    const best = outlet.tiers[0];
    if (best !== undefined) counts[best] += 1;
  }
  return counts;
}
