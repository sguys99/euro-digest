/**
 * e2e 공용 헬퍼 — 빌드 결과(out/)에서 검사할 페이지 목록을 모은다 (M0-12, NFR-12).
 * 페이지 목록은 하드코딩하지 않는다: 새 라우트가 생기면 링크·접근성 검사 대상에 자동으로 들어온다.
 * 파일 이름이 *.spec.ts가 아니므로 Playwright가 테스트로 실행하지 않는다.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { listSitePages, type SitePage } from "../../../scripts/lib/out-dir";
import { normalizeBasePath } from "../../../scripts/lib/site-refs";

/** playwright.config.ts·serve-out.ts와 같은 규칙 */
export const basePath = normalizeBasePath(process.env.BASE_PATH);

/** 이 사이트의 운영 출처 — SITE_URL로 쓴 절대 링크(canonical·OG·RSS) 중 basePath 아래는 내부 링크로 검사한다. */
export const siteOrigins = [
  process.env.SITE_URL ?? "https://sguys99.github.io",
];

export const outDir = path.resolve(process.env.OUT_DIR ?? "out");

/** out/의 모든 HTML 페이지. out/이 없으면 빈 배열(각 spec의 첫 테스트가 빌드 누락으로 실패시킨다). */
export function sitePages(): SitePage[] {
  return existsSync(outDir) ? listSitePages(outDir) : [];
}

/**
 * page.goto용 상대 경로. baseURL이 basePath를 포함하므로 앞의 `/`를 떼야 basePath가 유지된다.
 * `/` → `./`, `/404.html` → `404.html`
 */
export function toGotoPath(urlPath: string): string {
  return urlPath.replace(/^\/+/, "") || "./";
}

// ─── 날짜 아카이브 표본 (M1-34 리뷰) ─────────────────────────────────────────

const ARCHIVE_PAGE_RE = /^\/news\/(\d{4}-\d{2}-\d{2})\/$/;

/** 두 달력 날짜가 하루 차이인가(UTC 달력 계산) */
function nextDay(a: string, b: string): boolean {
  return (
    Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`) === 86_400_000
  );
}

/**
 * 날짜 아카이브 표본 — 날짜 페이지는 같은 틀이라 발행일이 늘수록 전수 검사(렌더 + axe)의 시간만 커진다. 상태가 갈리는 날만 고른다:
 * 첫 호 · 최신 호 · 최근 `recent`개 · 가장 최근 결호의 앞뒤 호 · 가장 최근 월 경계의 앞뒤 호(오름차순, 중복 없음).
 */
export function archiveSample(dates: readonly string[], recent = 3): string[] {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return [];
  const pick = new Set<string>([sorted[0]!, ...sorted.slice(-recent)]);
  for (let i = sorted.length - 1; i > 0; i--) {
    if (!nextDay(sorted[i - 1]!, sorted[i]!)) {
      pick.add(sorted[i - 1]!).add(sorted[i]!);
      break;
    }
  }
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i - 1]!.slice(0, 7) !== sorted[i]!.slice(0, 7)) {
      pick.add(sorted[i - 1]!).add(sorted[i]!);
      break;
    }
  }
  return [...pick].sort();
}

// ─── 팀 페이지 표본 (M2-13) ─────────────────────────────────────────────────

const TEAM_PAGE_RE = /^\/teams\/([a-z0-9-]+)\/$/;

/**
 * 팀 페이지 표본 — 111팀이 같은 틀이라 상태가 갈리는 팀만 고른다: 시안 기준 팀(바이에른 — 피치·교체 명단·한국 선수) · 포메이션 없는 팀
 * (르아브르·마르세유) · UCL만 뛰는 팀(클뤼프 브뤼허) · 한국 선수가 선발·교체에 있는 팀(우니온 베를린·아우크스부르크) · 라인업 없는 한국 선수 팀
 * (샬케) + 목록 처음·끝. 없는 slug는 건너뛴다(데이터가 바뀌어도 표본이 비지 않게 처음·끝은 늘 든다).
 */
export const TEAM_SAMPLE = [
  "bayern-munchen",
  "le-havre",
  "marseille",
  "club-brugge",
  "union-berlin",
  "augsburg",
  "schalke",
];

export function teamSample(slugs: readonly string[]): string[] {
  const sorted = [...new Set(slugs)].sort();
  if (sorted.length === 0) return [];
  const pick = new Set<string>([sorted[0]!, sorted.at(-1)!]);
  for (const slug of TEAM_SAMPLE) if (sorted.includes(slug)) pick.add(slug);
  return [...pick].sort();
}

/**
 * 페이지 목록에서 날짜 아카이브·팀 페이지는 표본만 남긴다(다른 페이지는 모두) — 렌더·axe 검사용. 링크 검사(HTTP만)는 전수를 쓴다
 * (이름은 M1-34 때 정했다 — 팀 표본은 M2-13에서 더했다)
 */
export function withArchiveSample(pages: SitePage[]): SitePage[] {
  const dates = pages.flatMap((p) => {
    const m = ARCHIVE_PAGE_RE.exec(p.urlPath);
    return m ? [m[1]!] : [];
  });
  const keep = new Set(archiveSample(dates));
  const teams = new Set(
    teamSample(
      pages.flatMap((p) => {
        const m = TEAM_PAGE_RE.exec(p.urlPath);
        return m ? [m[1]!] : [];
      }),
    ),
  );
  return pages.filter((p) => {
    const m = ARCHIVE_PAGE_RE.exec(p.urlPath);
    if (m) return keep.has(m[1]!);
    const t = TEAM_PAGE_RE.exec(p.urlPath);
    return !t || teams.has(t[1]!);
  });
}
