/**
 * M1-16 — 카드 ID 결정적 해시 `c_` + 16진수 10자리 (PRD §15 D15, FR-04, CLAUDE.md §8).
 *
 *   ① 규칙: `c_` + sha256(정규화 URL) 앞 10자리 = 대표 링크 seen-urls 키(`urlHash`, 16자리)의 접두사. 고정값으로 묶어 둔다 —
 *      규칙이 몰래 바뀌면 이미 나간 공유 앵커가 깨지므로 값이 달라지면 이 테스트가 잡는다(coreutils sha256sum으로 따로 계산)
 *   ② 같은 기사의 링크 변형(추적 파라미터·AMP·http·www·끝 슬래시·조각)은 같은 ID, 다른 기사는 다른 ID, fixtures/rss 실데이터 충돌 0
 *   ③ 대표 = 클러스터에서 고른 묶음(첫 묶음이 아닐 수 있다 — M1-15)의 링크
 *   ④ 옛 규칙(2026-10-12~14 발행·M0-34 샘플 — sha256(피드 원문 링크)) 카드와 섞인 병합: 같은 기사는 출처 링크의 정규화 URL로
 *      같은 카드가 되고 옛 ID·created가 그대로 남는다. 새 카드는 새 규칙 ID
 *   ⑤ ID 충돌(출처 링크가 겹치지 않는데 ID만 같음): 새 카드를 넣지 않고 `idCollisions`에 남긴다(다른 기사를 출처로 붙이지 않음)
 *   ⑥ takedown·공유 앵커·오류 신고 링크는 ID 형식만 보므로 두 규칙의 ID가 섞여도 받는다
 * 수집 실행(runCollect)에서 옛 규칙 카드가 있는 오늘 파일을 다시 실행하는 경로는 tests/collect-cluster.test.ts.
 * 네트워크 없음.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cardShareUrl, routes, summaryErrorIssueUrl } from "@/lib/paths";
import {
  CardIdSchema,
  NewsFileSchema,
  TakedownsFileSchema,
  UrlHashSchema,
  type CardSource,
  type FeedItem,
  type NewsCard,
} from "@/lib/schema";

import { CARD_ID_HEX_LENGTH, cardIdFor } from "../scripts/lib/card-id";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import { clusterCard, toCluster } from "../scripts/lib/news-cluster";
import { buildCard, buildNewsFile, mergeCards } from "../scripts/lib/news-file";
import { normalizeUrl, urlHash } from "../scripts/lib/url-normalize";

import { configSources } from "./support/fixture-sources";

const readJson = (rel: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8"),
  );

const SOURCES = configSources();
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const sourceOf = (id: string) => {
  const source = SOURCE_BY_ID.get(id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};
const BBC = sourceOf("bbc-sport-football");
const ESPN = sourceOf("espn-soccer");

/** 옛 임시 규칙(M1-01~M1-15) — `c_` + sha256(피드 원문 링크) 앞 10자리. 발행 파일·M0-34 샘플의 ID가 이 규칙이다 */
function legacyCardIdFor(url: string): string {
  return `c_${createHash("sha256").update(url, "utf8").digest("hex").slice(0, 10)}`;
}

const NOW = "2026-10-10T21:30:00.000Z";
const LATER = "2026-10-11T01:00:00.000Z";

function item(
  url: string,
  source: string,
  publishedAt: string,
  title = "T",
): FeedItem {
  return {
    title,
    url,
    publishedAt,
    summary: null,
    source,
    author: null,
    authors: [],
    lang: "en",
  };
}

const BBC_LINK =
  "https://www.bbc.co.uk/sport/football/articles/cwe9lngxzjpno?at_medium=RSS&at_campaign=rss";
const ESPN_LINK =
  "https://www.espn.com/soccer/story/_/id/50146841/cristiano-ronaldo-suspended";

// ─── ① 규칙 ──────────────────────────────────────────────────────────────

describe("① 규칙 — c_ + sha256(정규화 URL) 앞 10자리 = seen 키의 접두사", () => {
  it("형식(부록 A·CardIdSchema)과 결정성", () => {
    const id = cardIdFor(BBC_LINK);
    expect(id).toMatch(/^c_[0-9a-f]{10}$/);
    expect(CardIdSchema.safeParse(id).success).toBe(true);
    expect(cardIdFor(BBC_LINK)).toBe(id);
    expect(CARD_ID_HEX_LENGTH).toBe(10);
  });

  it("카드 ID = `c_` + urlHash(대표 링크).slice(0, 10) — 같은 해시 함수(url-normalize.ts)를 쓴다", () => {
    const links = [
      BBC_LINK,
      ESPN_LINK,
      "http://www.footballist.co.kr/news/articleView.html?idxno=900002",
      "https://thedailybriefing.io/p/maresca-on-man-city-charges-shock",
    ];
    for (const link of links) {
      const key = urlHash(link);
      expect(UrlHashSchema.safeParse(key).success).toBe(true);
      expect(cardIdFor(link)).toBe(`c_${key.slice(0, CARD_ID_HEX_LENGTH)}`);
      expect(key.startsWith(cardIdFor(link).slice(2))).toBe(true);
    }
  });

  it("고정값 — 규칙이 바뀌면 이미 나간 앵커가 깨진다(sha256sum으로 따로 계산한 값)", () => {
    // sha256("https://bbc.co.uk/sport/football/articles/x") — url-normalize.test.ts의 seen 키 고정값과 같은 입력
    expect(
      cardIdFor(
        "https://www.bbc.co.uk/sport/football/articles/x?at_medium=RSS",
      ),
    ).toBe("c_aa715e7ea6");
    // sha256("https://bbc.co.uk/sport/football/articles/cwe9lngxzjpno") — M0-34 샘플 c_d8ecc21d28(옛 규칙)과 같은 링크
    expect(cardIdFor(BBC_LINK)).toBe("c_393b46d1bc");
    // sha256("https://besteleven.com/news/articleView.html?idxno=313015") — 국내 기사 식별 쿼리(idxno)는 남는다
    expect(
      cardIdFor(
        "https://www.besteleven.com/news/articleView.html?idxno=313015",
      ),
    ).toBe("c_a000ef06a7");
  });
});

// ─── ② 링크 변형 ───────────────────────────────────────────────────────────

describe("② 같은 기사의 링크 변형 = 같은 ID, 다른 기사 = 다른 ID", () => {
  it("추적 파라미터·http·www·m.·끝 슬래시·조각·쿼리 순서", () => {
    const base = "https://bbc.co.uk/sport/football/articles/cwe9lngxzjpno";
    const variants = [
      BBC_LINK,
      base,
      `${base}/`,
      `${base}#comments`,
      "http://www.bbc.co.uk/sport/football/articles/cwe9lngxzjpno",
      "https://m.bbc.co.uk/sport/football/articles/cwe9lngxzjpno",
      `${base}?utm_source=twitter&utm_medium=social&fbclid=abc`,
      `${base}?at_campaign=rss&at_medium=RSS`,
    ];
    for (const v of variants) expect(cardIdFor(v), v).toBe(cardIdFor(base));
  });

  it("AMP 변형(.amp 접미사·/amp/ 조각·?amp=1·Google AMP 뷰어·국내 articleViewAmp)", () => {
    const original = "https://www.bbc.co.uk/sport/football/articles/c8x2abc";
    for (const v of [
      "https://www.bbc.co.uk/sport/football/articles/c8x2abc.amp",
      "https://www.bbc.co.uk/sport/football/articles/c8x2abc/amp",
      "https://www.bbc.co.uk/sport/football/articles/c8x2abc?amp=1",
      "https://www.google.com/amp/s/www.bbc.co.uk/sport/football/articles/c8x2abc",
    ]) {
      expect(cardIdFor(v), v).toBe(cardIdFor(original));
    }
    expect(
      cardIdFor(
        "https://www.footballist.co.kr/news/articleViewAmp.html?idxno=900002",
      ),
    ).toBe(
      cardIdFor(
        "http://www.footballist.co.kr/news/articleView.html?idxno=900002",
      ),
    );
  });

  it("다른 기사는 다른 ID — 국내 idxno, 경로 대소문자, 뜻이 애매한 파라미터(ref)는 남긴다", () => {
    const k = (n: number) =>
      `https://www.interfootball.co.kr/news/articleView.html?idxno=${n}`;
    expect(cardIdFor(k(696262))).not.toBe(cardIdFor(k(696263)));
    expect(cardIdFor("https://example.com/Story")).not.toBe(
      cardIdFor("https://example.com/story"),
    );
    expect(cardIdFor("https://example.com/s?ref=a")).not.toBe(
      cardIdFor("https://example.com/s"),
    );
  });

  it("fixtures/rss 실데이터(M0-33) — 정규화 URL이 다르면 카드 ID도 다르다(40비트 앞자리 충돌 0), 같은 링크 묶음은 같은 ID", () => {
    const index = readJson("fixtures/rss/index.json") as {
      sources: Array<{ items: Array<{ link: string }> }>;
      duplicateLinks: Array<{ link: string }>;
    };
    const links = index.sources.flatMap((s) => s.items.map((i) => i.link));
    expect(links.length).toBeGreaterThan(60);
    const keys = new Set(links.map(urlHash));
    const ids = new Set(links.map(cardIdFor));
    expect(ids.size).toBe(keys.size);
    // 묶음 수 = 정규화 URL 수(같은 링크 묶음이 실제로 있다)
    expect(keys.size).toBeLessThan(links.length);
  });
});

// ─── ③ 대표 ──────────────────────────────────────────────────────────────

describe("③ 대표 링크 = 클러스터에서 고른 대표(첫 묶음이 아닐 수 있다 — M1-15)", () => {
  it("첫 묶음(ESPN, weight 1)이 아니라 대표(BBC, weight 3)의 링크로 ID를 만든다 = 대표 묶음 키의 접두사", () => {
    const { groups } = dedupeFeedItems([
      item(ESPN_LINK, ESPN.id, "2026-10-10T21:00:00.000Z", "Ronaldo suspended"),
      item(BBC_LINK, BBC.id, "2026-10-10T20:00:00.000Z", "Ronaldo banned"),
    ]);
    const built = clusterCard(
      toCluster(groups, SOURCE_BY_ID),
      SOURCE_BY_ID,
      NOW,
    );
    expect(built.reordered).toBe(true);
    expect(built.card?.src[0]?.u).toBe(BBC_LINK);
    expect(built.card?.id).toBe(cardIdFor(BBC_LINK));
    const leadKey = groups.find((g) => g.item.url === BBC_LINK)!.key;
    expect(leadKey.startsWith(built.card!.id.slice(2))).toBe(true);
    expect(built.card?.id).not.toBe(cardIdFor(ESPN_LINK));
  });
});

// ─── ④ 옛 규칙 카드와 섞인 병합 ──────────────────────────────────────────────

/** 옛 규칙으로 발행됐던 카드(같은 내용, ID만 옛 규칙) */
function legacyCard(card: NewsCard): NewsCard {
  return { ...card, id: legacyCardIdFor(card.src[0]!.u) };
}

describe("④ 옛 규칙 ID 카드(2026-10-12~14 발행)와 새 규칙 카드가 섞인 병합(mergeCards)", () => {
  const fresh = buildCard(
    item(BBC_LINK, BBC.id, "2026-10-10T20:00:00.000Z"),
    BBC,
    LATER,
  );
  const old = legacyCard(
    buildCard(item(BBC_LINK, BBC.id, "2026-10-10T20:00:00.000Z"), BBC, NOW),
  );

  it("링크에 추적 파라미터가 있으면 두 규칙의 ID가 다르고, 이미 정규화된 꼴이면 같다(옛 ID를 다시 계산하지 않는 이유)", () => {
    expect(old.id).not.toBe(fresh.id);
    const plain =
      "https://thedailybriefing.io/p/maresca-on-man-city-charges-shock";
    expect(normalizeUrl(plain)).toBe(plain);
    expect(legacyCardIdFor(plain)).toBe(cardIdFor(plain)); // M0-34 샘플 c_b24a3b9263
  });

  it("같은 원문 링크 — 새 규칙 카드는 옛 카드와 같은 카드로 본다(옛 ID·created 유지, 추가 0)", () => {
    const result = mergeCards([old], [fresh]);
    expect(result).toMatchObject({
      added: 0,
      duplicates: 1,
      attached: 0,
      idCollisions: [],
    });
    expect(result.cards).toEqual([old]);
  });

  it("링크 변형(추적 파라미터 제거·AMP)으로 다시 온 같은 기사도 옛 카드에 합쳐지고 출처로 붙지 않는다", () => {
    for (const variant of [
      "https://www.bbc.co.uk/sport/football/articles/cwe9lngxzjpno",
      "https://www.bbc.co.uk/sport/football/articles/cwe9lngxzjpno.amp",
    ]) {
      const again = buildCard(
        item(variant, BBC.id, "2026-10-10T20:00:00.000Z"),
        BBC,
        LATER,
      );
      expect(again.id).toBe(fresh.id);
      const result = mergeCards([old], [again]);
      expect(result).toMatchObject({ added: 0, duplicates: 1, attached: 0 });
      expect(result.cards).toEqual([old]);
    }
  });

  it("같은 사건의 다른 기사 — 옛 ID로 붙이기(attachments)와 출처가 겹치는 새 카드의 나머지 출처 붙이기 모두 옛 카드에", () => {
    const espn: CardSource = {
      n: "ESPN",
      u: ESPN_LINK,
      at: "2026-10-10T23:00:00.000Z",
      tier: 2,
    };
    const byAttachment = mergeCards([old], [], [{ id: old.id, src: [espn] }]);
    expect(byAttachment).toMatchObject({ added: 0, attached: 1 });
    expect(byAttachment.cards[0]).toMatchObject({ id: old.id, created: NOW });
    expect(byAttachment.cards[0]!.src.map((s) => s.u)).toEqual([
      BBC_LINK,
      ESPN_LINK,
    ]);

    const withMore = buildCard(
      item(BBC_LINK, BBC.id, "2026-10-10T20:00:00.000Z"),
      BBC,
      LATER,
      [espn],
    );
    const byOverlap = mergeCards([old], [withMore]);
    expect(byOverlap).toMatchObject({ added: 0, duplicates: 1, attached: 1 });
    expect(byOverlap.cards.map((c) => c.id)).toEqual([old.id]);
  });

  it("다른 기사는 새 규칙 ID의 새 카드 — 한 파일에 두 규칙의 ID가 섞여도 NewsFileSchema를 통과한다", () => {
    const other = buildCard(
      item(ESPN_LINK, ESPN.id, "2026-10-10T22:00:00.000Z"),
      ESPN,
      LATER,
    );
    const result = mergeCards([old], [other]);
    expect(result).toMatchObject({ added: 1, duplicates: 0, idCollisions: [] });
    expect(result.cards.map((c) => c.id).sort()).toEqual(
      [old.id, cardIdFor(ESPN_LINK)].sort(),
    );
    const file = buildNewsFile({
      date: "2026-10-11",
      generatedAt: LATER,
      runId: "collect-dev-20261011T010000Z-0000",
      cards: result.cards,
    });
    expect(file.cards).toHaveLength(2);
  });

  it("M0-34 카드 샘플(옛 규칙 기록 23장) — 같은 카드를 새 규칙으로 다시 만들어 합쳐도 추가 0, 기존 카드 그대로", () => {
    const sample = NewsFileSchema.parse(readJson("fixtures/news-sample.json"));
    const rebuilt = sample.cards.map((c) => ({
      ...c,
      id: cardIdFor(c.src[0]!.u),
      created: LATER,
    }));
    // 22장은 ID가 바뀌고(www·추적 파라미터) 1장은 링크가 이미 정규화된 꼴이라 같다
    const changed = rebuilt.filter((c, i) => c.id !== sample.cards[i]!.id);
    expect(changed).toHaveLength(sample.cards.length - 1);
    const result = mergeCards(sample.cards, rebuilt);
    expect(result).toMatchObject({
      added: 0,
      duplicates: sample.cards.length,
      attached: 0,
      idCollisions: [],
    });
    const byId = (cards: readonly NewsCard[]) =>
      [...cards].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId(result.cards)).toEqual(byId(sample.cards));
  });
});

// ─── ⑤ ID 충돌 ────────────────────────────────────────────────────────────

describe("⑤ ID 충돌(출처 링크가 겹치지 않는데 ID만 같음 — 40비트, 평소 없음)", () => {
  const a = buildCard(
    item(BBC_LINK, BBC.id, "2026-10-10T20:00:00.000Z"),
    BBC,
    NOW,
  );
  // 다른 기사인데 ID가 같은 카드(충돌을 흉내 낸다)
  const clash: NewsCard = {
    ...buildCard(
      item(ESPN_LINK, ESPN.id, "2026-10-10T22:00:00.000Z"),
      ESPN,
      LATER,
    ),
    id: a.id,
  };

  it("기존 카드와 충돌 — 새 카드를 넣지 않고(다른 기사를 출처로 붙이지 않음) idCollisions에 남긴다", () => {
    const result = mergeCards([a], [clash]);
    expect(result).toMatchObject({
      added: 0,
      duplicates: 0,
      attached: 0,
      idCollisions: [a.id],
    });
    expect(result.cards).toEqual([a]);
    expect(result.cards.flatMap((c) => c.src.map((s) => s.u))).not.toContain(
      ESPN_LINK,
    );
  });

  it("같은 실행의 새 카드끼리 충돌 — 앞 카드만 넣는다, 파일 안 ID는 겹치지 않는다", () => {
    const result = mergeCards([], [a, clash]);
    expect(result).toMatchObject({ added: 1, idCollisions: [a.id] });
    expect(result.cards).toEqual([a]);
    expect(() =>
      buildNewsFile({
        date: "2026-10-11",
        generatedAt: LATER,
        runId: "collect-dev-20261011T010000Z-0000",
        cards: result.cards,
      }),
    ).not.toThrow();
  });

  it("파일 안 ID 중복은 NewsFileSchema가 거부한다(검증 게이트·npm run validate가 같은 스키마)", () => {
    const parsed = NewsFileSchema.safeParse({
      date: "2026-10-11",
      generatedAt: LATER,
      runId: "r",
      cards: [a, clash],
    });
    expect(parsed.success).toBe(false);
  });
});

// ─── ⑥ ID를 쓰는 곳 ────────────────────────────────────────────────────────

describe("⑥ takedown·공유 앵커·오류 신고 링크 — 두 규칙의 ID가 섞여도 받는다(형식만 본다)", () => {
  const oldId = legacyCardIdFor(BBC_LINK); // c_d8ecc21d28 (M0-34 샘플·견본 페이지)
  const newId = cardIdFor(BBC_LINK);

  it("configs/takedowns.json — 옛 규칙·새 규칙 ID를 함께 등록할 수 있다", () => {
    expect(oldId).toBe("c_d8ecc21d28");
    const parsed = TakedownsFileSchema.safeParse([
      {
        id: oldId,
        requestedAt: NOW,
        handledAt: null,
        reason: "삭제 요청 (#1)",
      },
      {
        id: newId,
        requestedAt: NOW,
        handledAt: null,
        reason: "삭제 요청 (#2)",
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("공유 앵커(routes.card·cardShareUrl)·오류 신고 링크(summaryErrorIssueUrl)", () => {
    for (const id of [oldId, newId]) {
      expect(routes.card("2026-10-11", id)).toBe(`/news/2026-10-11/#${id}`);
      expect(cardShareUrl("2026-10-11", id)).toMatch(new RegExp(`#${id}$`));
      expect(summaryErrorIssueUrl(id, "2026-10-11")).toContain(`card=${id}`);
    }
  });
});
