/**
 * 호 로더 — 한 호의 뉴스 파일 + 마스트헤드·뒤표지의 호 정보(제 N호·발행·업데이트) (M1-30)
 *
 * 앱 셸을 쓰는 페이지가 같은 두 줄(뉴스 로더 → `issueMeta(news, loadProdRuns())`)을 되풀이하지 않게 묶는다. 빌드 때(서버 컴포넌트)만
 * 쓴다 — node:fs를 쓰는 로더들을 부르므로 `"use client"` 파일에서 import하지 않는다.
 * 카드는 뉴스 로더(src/lib/data/news.ts)를 거쳐 읽으므로 삭제 요청 카드는 이미 빠져 있다(FR-143). 호 정보 규칙은 src/lib/issue.ts.
 */
import { loadBrief } from "@/lib/data/brief";
import {
  issueLastModified,
  listNewsDates,
  loadLatestNews,
  loadNewsIssue,
} from "@/lib/data/news";
import { loadProdRuns } from "@/lib/data/runs";
import { issueMeta, type IssueMeta } from "@/lib/issue";
import { buildArchiveView, type ArchiveView } from "@/lib/news/archive";
import type { NewsFile } from "@/lib/schema/news";

export interface LoadedIssue {
  /** 그 호의 뉴스 파일 — 발행된 호가 없으면 null */
  news: NewsFile | null;
  /** 마스트헤드·뒤표지의 호 정보 — 호가 없으면 null */
  issue: IssueMeta | null;
}

function withMeta(news: NewsFile | null): LoadedIssue {
  return { news, issue: news ? issueMeta(news, loadProdRuns()) : null };
}

/** 가장 최근 호(홈·`/news/`·404) */
export function loadLatestIssue(): LoadedIssue {
  return withMeta(loadLatestNews());
}

/** 발행일(KST "YYYY-MM-DD") 하나의 호 — 날짜 아카이브 `/news/[date]/`(M1-34)용. 그 날짜 파일이 없으면 둘 다 null */
export function loadIssue(date: string): LoadedIssue {
  return withMeta(loadNewsIssue(date));
}

/**
 * 발행된 호의 발행일 전부(오름차순) — 날짜 아카이브의 `generateStaticParams`·이전·다음 호·달력(M1-34), `/news/`의 canonical.
 * 일별 파일은 목록만 본다(깨진 파일은 그 날짜 페이지가 `loadIssue`로 읽을 때 빌드를 멈춘다). 월별 병합 파일(M5-10)은 안의 호 날짜를 알아야
 * 해서 읽는다(깨졌거나 일별 파일과 날짜가 겹치면 여기서 멈춘다 — src/lib/data/news.ts). 병합 뒤에도 날짜 페이지는 그대로 생긴다(FR-34).
 */
export function listIssueDates(): string[] {
  return listNewsDates();
}

/** 그 호의 아카이브 이동 모델(이전·다음 호 + 달력 — src/lib/news/archive.ts). 발행된 호가 아니면 null */
export function loadArchiveView(date: string): ArchiveView | null {
  return buildArchiveView(listIssueDates(), date);
}

/** UTC ISO 시각 가운데 가장 늦은 것(원래 문자열 — 소수 초 자릿수가 달라도 시각으로 비교). 값이 없으면 null */
export function latestIso(
  values: ReadonlyArray<string | null | undefined>,
): string | null {
  let latest: string | null = null;
  for (const v of values) {
    if (v == null) continue;
    if (latest === null || Date.parse(v) > Date.parse(latest)) latest = v;
  }
  return latest;
}

/**
 * 날짜 페이지 지면이 마지막으로 바뀐 시각(M5-03 — sitemap lastmod · 구조화 데이터 dateModified) — 뉴스 쪽(파일 generatedAt과 그 호
 * 카드의 삭제 요청 반영 시각 — `issueLastModified`)과 그 호 브리핑 파일 generatedAt(이날의 5줄 — 결과 지연 재수집 등으로 다시 쓰인다)
 * 가운데 늦은 것. 발행된 호가 아니면 null.
 */
export function issuePageLastModified(date: string): string | null {
  const news = issueLastModified(date);
  if (news === null) return null;
  return latestIso([news, loadBrief(date)?.generatedAt]);
}
