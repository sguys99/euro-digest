/**
 * 팀 페이지 '더 읽을거리' 화면 모델 — 분석 블로그 글 제목의 `lang` (PRD FR-57 · WCAG 3.1.2, M3-08 이월) — 순수 함수.
 *
 * `data/teams` `reading` 항목은 제목·링크·매체명만 있다(언어 필드 없음 — 스키마는 그대로). 제목 언어는 매체 설정
 * (`configs/sources.json` `type: "analysis"`의 `lang`)을 기본으로 하되, 영문 피드에 섞여 나오는 네덜란드어 글
 * (Spielverlagerung — fixtures/analysis/README.md)은 제목의 네덜란드어 기능어로 `nl`을 붙인다. 제목은 바꾸지 않는다(D23).
 */
import { publisherNameOf } from "@/lib/publisher-name";
import type { Source } from "@/lib/schema/source";
import type { Team } from "@/lib/schema/team";

/** 매체 설정을 찾지 못했을 때의 언어 — 지금 등록된 분석 블로그는 모두 영문 피드다 */
const FALLBACK_LANG = "en";

/**
 * 네덜란드어 기능어 — 영어 제목에 거의 나오지 않는 낱말만. 이름에 붙는 'de'·'van'·'der'·'den'·'ten'·'ter'(De Zerbi · van Dijk ·
 * Ten Hag)와 영어와 겹치는 'en'·'op'·'met'·'is'·'in'은 넣지 않는다.
 */
const DUTCH_MARKERS: ReadonlySet<string> = new Set([
  "het",
  "een",
  "hoe",
  "waarom",
  "wat",
  "waar",
  "onder",
  "niet",
  "geen",
  "naar",
  "voor",
  "bij",
  "zijn",
  "wordt",
  "worden",
  "tegen",
  "ook",
  "maar",
  "nog",
  "deze",
  "dit",
]);

/** 제목에 네덜란드어 기능어가 있는가 — 낱말 단위(대소문자 무시) */
export function looksDutch(title: string): boolean {
  const words = title.toLowerCase().match(/\p{L}+/gu) ?? [];
  return words.some((word) => DUTCH_MARKERS.has(word));
}

/** 분석 블로그 매체명(`publisherNameOf` — reading `source`와 같은 이름) → 피드 언어. 설정 파일에 처음 나온 피드의 언어 */
export function analysisLangs(
  sources: readonly Source[],
): ReadonlyMap<string, string> {
  const langs = new Map<string, string>();
  for (const source of sources) {
    if (source.type !== "analysis") continue;
    const name = publisherNameOf(source);
    if (!langs.has(name)) langs.set(name, source.lang);
  }
  return langs;
}

/** 글 제목의 `lang` — 매체 피드 언어, 다만 영문 피드의 네덜란드어 제목은 `nl` */
export function readingTitleLang(title: string, feedLang: string): string {
  if (feedLang === "en" && looksDutch(title)) return "nl";
  return feedLang;
}

export type ReadingItemView = Team["reading"][number] & {
  /** 제목의 `lang` 속성 */
  lang: string;
};

/** '더 읽을거리' 항목 + 제목 언어 */
export function readingView(
  items: Team["reading"],
  sources: readonly Source[],
): ReadingItemView[] {
  const langs = analysisLangs(sources);
  return items.map((item) => ({
    ...item,
    lang: readingTitleLang(item.title, langs.get(item.source) ?? FALLBACK_LANG),
  }));
}
