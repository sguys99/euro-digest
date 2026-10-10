/**
 * 매체 도메인 허용 목록 — `configs/publisher-domains.json` (M0-26 사용자 결정 2026-10-10, PRD FR-02·NFR-09).
 *
 * 검색형 소스(`Source.type: "search"` — GDELT 등)가 돌려준 기사는 그 기사를 낸 매체의 약관을 따른다
 * (매체 약관 상속). 이 파일은 그런 기사를 원제목+링크 카드로 게시해도 되는지를 **매체 도메인 단위**로 정한다.
 * 피드 소스(rss·journalist 등)의 수집 여부는 이 파일이 아니라 sources.json의 `enabled`·`terms_checked`가 정한다.
 *
 * 판정(status)
 * - "allow"     검색 결과로도 원제목+링크 게시 가능 — 매체 단위 근거가 있을 때(예: 국내 엔디소프트 매체, M0-25)
 * - "feed-only" 자기 피드(sources.json에 등록한 소스)로만 게시 — 허가·사용자 결정이 피드에 묶여 있을 때
 *               (BBC·ESPN·The Athletic·the Daily Briefing·Di Marzio·Relevo). 검색 결과로 들어온 기사는 게시하지 않는다
 * - "deny"      어떤 경로로도 게시하지 않는다 — 약관상 금지(M0-23~M0-26 판정)
 *
 * **기본 차단**: 목록에 없는 도메인은 게시하지 않는다("deny"와 같은 취급). 검색 파이프라인은 미판정 도메인의
 * 빈도만 모아 `/add-source` 후보로 올린다(M1-07).
 *
 * 도메인 매칭 — `findPublisherDomain`
 * - `domain`은 소문자 호스트 이름이다. 스킴·포트·경로·끝 점·`www.` 접두사를 쓰지 않는다.
 * - 호스트 H는 `H === domain`이거나 H가 `"." + domain`으로 끝나면 그 항목에 매칭된다(모든 하위 도메인 포함).
 *   예: "bbc.co.uk"는 www.bbc.co.uk·news.bbc.co.uk에 매칭되고 notbbc.co.uk에는 매칭되지 않는다.
 * - 여러 항목이 매칭되면 가장 긴(구체적인) domain이 이긴다.
 *   예: "sky.de" allow + "sport.sky.de" deny → sport.sky.de와 그 하위 도메인은 deny.
 * - 경로 단위 구분(nytimes.com/athletic 등)은 하지 않는다. "feed-only"와 "deny"는 검색 결과 게시에서 효과가 같아
 *   지금은 필요 없다 — 경로마다 판정이 달라져야 하면 스키마를 확장한다.
 *
 * v0.1 — 2026-10-10 사용자 승인(새 스키마). configs 파일이라 strictObject(알 수 없는 키 = 오류, 결정 Q5).
 */
import { z } from "zod";

import { HttpUrlSchema, IsoDateSchema, SlugSchema, uniqueBy } from "./common";

/** 호스트 라벨 1개: 영소문자·숫자·하이픈, 1~63자, 하이픈으로 시작·끝나지 않음. */
const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";

/** 매체 도메인 — 소문자 호스트 이름, 라벨 2개 이상, 최상위 라벨은 영문(또는 punycode). IP·localhost·`www.`는 거부. */
export const PublisherHostSchema = z
  .string()
  .regex(
    new RegExp(`^(?:${HOST_LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`),
    {
      error:
        "도메인은 소문자 호스트 이름(예: bbc.co.uk) — 스킴·경로·포트·대문자·끝 점 없이",
    },
  )
  .refine((domain) => !domain.startsWith("www."), {
    error: "www. 접두사 없이 적는다 — 하위 도메인은 자동으로 매칭된다",
  });

/** 판정 3종. 목록에 없는 도메인은 판정이 아니라 기본 차단이다. */
export const PublisherDomainStatusSchema = z.enum([
  "allow",
  "feed-only",
  "deny",
]);
export type PublisherDomainStatus = z.infer<typeof PublisherDomainStatusSchema>;

/** 매체 도메인 1개. */
export const PublisherDomainSchema = z
  .strictObject({
    domain: PublisherHostSchema, // 매칭 규칙은 파일 머리 주석
    publisher: z.string().min(1), // 매체명(로그·이슈용), 예: "BBC", "인터풋볼"
    status: PublisherDomainStatusSchema,
    sourceIds: z.array(SlugSchema).default([]), // 판정 근거가 된 sources.json 소스 id — 교차 참조(validate)
    basis: z.string().min(1), // 짧은 근거: 조항 요지 + 결정(조사 항목 ID 포함)
    basisUrl: HttpUrlSchema, // 대표 근거 URL(약관·RSS 안내·robots.txt) — 출처로 확인한 값만(CLAUDE.md §1-7)
    checkedAt: IsoDateSchema, // 판정일(YYYY-MM-DD)
    note: z.string().optional(), // 지킬 조건·미해결 사항
  })
  .refine((d) => d.status !== "feed-only" || d.sourceIds.length > 0, {
    path: ["sourceIds"],
    error: '"feed-only"는 근거 피드 소스(sourceIds)가 1개 이상 필요',
  });
export type PublisherDomain = z.infer<typeof PublisherDomainSchema>;

/** `configs/publisher-domains.json` — 도메인 중복 금지. 목록에 없는 도메인 = 기본 차단. */
export const PublisherDomainsFileSchema = z.strictObject({
  domains: z
    .array(PublisherDomainSchema)
    .superRefine(uniqueBy((d) => d.domain, "domain", "도메인")),
});
export type PublisherDomainsFile = z.infer<typeof PublisherDomainsFileSchema>;

/** 비교용 호스트 정규화: 앞뒤 공백·대문자·끝 점·포트를 없앤다. URL이 아니라 호스트(`new URL(u).hostname`)를 받는다. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** 호스트에 매칭되는 가장 구체적인 항목. undefined면 목록에 없는 도메인 = 기본 차단. */
export function findPublisherDomain(
  host: string,
  domains: readonly PublisherDomain[],
): PublisherDomain | undefined {
  const target = normalizeHost(host);
  let best: PublisherDomain | undefined;
  for (const entry of domains) {
    const matches =
      target === entry.domain || target.endsWith(`.${entry.domain}`);
    if (matches && (!best || entry.domain.length > best.domain.length)) {
      best = entry;
    }
  }
  return best;
}

/** 검색형 소스 결과를 원제목+링크로 게시해도 되는가 — "allow"만 true(feed-only·deny·목록 없음은 false). */
export function isSearchResultAllowed(
  host: string,
  domains: readonly PublisherDomain[],
): boolean {
  return findPublisherDomain(host, domains)?.status === "allow";
}
