/**
 * 호 로더 — 한 호의 뉴스 파일 + 마스트헤드·뒤표지의 호 정보(제 N호·발행·업데이트) (M1-30)
 *
 * 앱 셸을 쓰는 페이지가 같은 두 줄(뉴스 로더 → `issueMeta(news, loadProdRuns())`)을 되풀이하지 않게 묶는다. 빌드 때(서버 컴포넌트)만
 * 쓴다 — node:fs를 쓰는 로더들을 부르므로 `"use client"` 파일에서 import하지 않는다.
 * 카드는 뉴스 로더(src/lib/data/news.ts)를 거쳐 읽으므로 삭제 요청 카드는 이미 빠져 있다(FR-143). 호 정보 규칙은 src/lib/issue.ts.
 */
import { loadLatestNews, loadNewsIssue } from "@/lib/data/news";
import { loadProdRuns } from "@/lib/data/runs";
import { issueMeta, type IssueMeta } from "@/lib/issue";
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
