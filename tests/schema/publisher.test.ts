/** 매체 도메인 허용 목록 — configs/publisher-domains.json (M0-26 사용자 결정 2026-10-10). */
import { describe, expect, it } from "vitest";

import {
  PublisherDomainSchema,
  PublisherDomainsFileSchema,
  PublisherHostSchema,
  findPublisherDomain,
  isSearchResultAllowed,
  normalizeHost,
  type PublisherDomain,
} from "@/lib/schema";

import {
  at,
  issueMessages,
  issuePaths,
  loadFixture,
  passes,
  validFixture,
} from "./helpers";

const file = validFixture(
  PublisherDomainsFileSchema,
  "configs/publisher-domains.json",
);
const allowEntry = at(file.domains, 0);
const feedOnlyEntry = at(file.domains, 1);

/** 매칭 테스트용 최소 항목. */
function domain(
  name: string,
  status: PublisherDomain["status"],
): PublisherDomain {
  return {
    domain: name,
    publisher: name,
    status,
    sourceIds: status === "feed-only" ? ["some-feed"] : [],
    basis: "테스트",
    basisUrl: "https://example.com/terms",
    checkedAt: "2026-10-10",
  };
}

describe("PublisherDomainsFile — 스키마", () => {
  it("fixture가 통과하고 sourceIds 생략 시 []로 채운다", () => {
    const raw = loadFixture("configs/publisher-domains.json") as {
      domains: Record<string, unknown>[];
    };
    expect(raw.domains[0]).not.toHaveProperty("sourceIds");
    expect(allowEntry.sourceIds).toEqual([]);
    expect(file.domains.map((d) => d.status)).toEqual([
      "allow",
      "feed-only",
      "deny",
      "deny",
    ]);
  });

  it.each([
    "bbc.co.uk",
    "interfootball.co.kr",
    "sport.sky.de",
    "football-italia.net",
    "xn--9n2bp8q.xn--3e0b707e",
  ])("도메인 %s는 통과한다", (value) => {
    expect(passes(PublisherHostSchema, value)).toBe(true);
  });

  it.each([
    "BBC.co.uk", // 대문자
    "https://bbc.co.uk", // 스킴
    "bbc.co.uk/sport", // 경로
    "bbc.co.uk:443", // 포트
    "bbc.co.uk.", // 끝 점
    "localhost", // 라벨 1개
    "192.168.0.1", // IP
    "-bbc.co.uk", // 하이픈으로 시작하는 라벨
    "bbc..co.uk", // 빈 라벨
    "",
  ])("도메인 %j는 실패한다", (value) => {
    expect(passes(PublisherHostSchema, value)).toBe(false);
  });

  it("www. 접두사는 실패한다(하위 도메인은 자동 매칭)", () => {
    expect(issueMessages(PublisherHostSchema, "www.bbc.co.uk")).toEqual([
      "www. 접두사 없이 적는다 — 하위 도메인은 자동으로 매칭된다",
    ]);
  });

  it("feed-only는 근거 피드 소스가 1개 이상 필요하다", () => {
    expect(
      issuePaths(PublisherDomainSchema, { ...feedOnlyEntry, sourceIds: [] }),
    ).toEqual(["sourceIds"]);
    expect(
      passes(PublisherDomainSchema, {
        ...allowEntry,
        status: "deny",
        sourceIds: [],
      }),
    ).toBe(true);
  });

  it("알 수 없는 status·잘못된 날짜·URL·slug는 실패한다", () => {
    expect(
      issuePaths(PublisherDomainSchema, { ...allowEntry, status: "block" }),
    ).toEqual(["status"]);
    expect(
      issuePaths(PublisherDomainSchema, {
        ...allowEntry,
        checkedAt: "2026-10-10T00:00:00Z",
      }),
    ).toEqual(["checkedAt"]);
    expect(
      issuePaths(PublisherDomainSchema, {
        ...allowEntry,
        basisUrl: "javascript:alert(1)",
      }),
    ).toEqual(["basisUrl"]);
    expect(
      issuePaths(PublisherDomainSchema, {
        ...feedOnlyEntry,
        sourceIds: ["BBC Football"],
      }),
    ).toEqual(["sourceIds.0"]);
  });

  it("basis·basisUrl·checkedAt은 필수다", () => {
    const rest: Record<string, unknown> = { ...allowEntry };
    delete rest.basis;
    delete rest.basisUrl;
    delete rest.checkedAt;
    expect(issuePaths(PublisherDomainSchema, rest).sort()).toEqual([
      "basis",
      "basisUrl",
      "checkedAt",
    ]);
  });

  it("도메인 중복은 실패한다", () => {
    expect(
      issuePaths(PublisherDomainsFileSchema, {
        domains: [allowEntry, { ...allowEntry, status: "deny" }],
      }),
    ).toEqual(["domains.1.domain"]);
  });

  it("알 수 없는 키는 실패한다(configs strict)", () => {
    expect(
      issuePaths(PublisherDomainsFileSchema, { ...file, unlisted: "deny" }),
    ).toEqual([""]);
    expect(
      passes(PublisherDomainSchema, { ...allowEntry, path: "/athletic" }),
    ).toBe(false);
  });
});

describe("findPublisherDomain — 하위 도메인 매칭·가장 긴 항목 우선", () => {
  const domains = [
    domain("bbc.co.uk", "feed-only"),
    domain("sky.de", "allow"),
    domain("sport.sky.de", "deny"),
    domain("interfootball.co.kr", "allow"),
  ];

  it.each([
    ["bbc.co.uk", "bbc.co.uk"],
    ["www.bbc.co.uk", "bbc.co.uk"],
    ["news.bbc.co.uk", "bbc.co.uk"],
    ["www.sky.de", "sky.de"],
    ["sport.sky.de", "sport.sky.de"],
    ["live.sport.sky.de", "sport.sky.de"],
    ["WWW.InterFootball.co.kr.", "interfootball.co.kr"],
    ["www.interfootball.co.kr:443", "interfootball.co.kr"],
  ])("%s → %s", (host, expected) => {
    expect(findPublisherDomain(host, domains)?.domain).toBe(expected);
  });

  it.each(["notbbc.co.uk", "bbc.co.uk.evil.com", "co.uk", "skysports.com"])(
    "목록에 없는 도메인 %s → undefined(기본 차단)",
    (host) => {
      expect(findPublisherDomain(host, domains)).toBeUndefined();
    },
  );

  it("항목 순서와 무관하게 가장 긴 domain이 이긴다", () => {
    expect(
      findPublisherDomain("sport.sky.de", [...domains].reverse())?.status,
    ).toBe("deny");
  });

  it("normalizeHost — 공백·대문자·끝 점·포트 제거", () => {
    expect(normalizeHost("  WWW.BBC.CO.UK.:8080 ")).toBe("www.bbc.co.uk");
  });
});

describe("isSearchResultAllowed — allow만 게시", () => {
  const domains = [
    domain("interfootball.co.kr", "allow"),
    domain("espn.com", "feed-only"),
    domain("theguardian.com", "deny"),
  ];

  it.each([
    ["www.interfootball.co.kr", true],
    ["www.espn.com", false], // feed-only: 자기 피드로만
    ["www.theguardian.com", false], // deny
    ["www.example.com", false], // 목록 없음 = 기본 차단
  ])("%s → %s", (host, expected) => {
    expect(isSearchResultAllowed(host, domains)).toBe(expected);
  });

  it("빈 목록이면 모두 차단", () => {
    expect(isSearchResultAllowed("www.interfootball.co.kr", [])).toBe(false);
  });
});
