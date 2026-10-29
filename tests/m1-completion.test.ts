/**
 * M1 완료 기준 ②·④ 점검 `scripts/lib/m1-completion.ts` 단위 테스트 (plan "### ✅ M1 완료 기준", D23·D24·D28·D43). 네트워크·LLM 없음 —
 * 합성 실행 기록·카드·브리핑 줄·HTML 조각·피드 항목.
 *
 * - ② 하루 귀속(startedAt의 KST 날짜 — 아침 실행은 UTC 전날), 금액 합산·브리핑 요청 수·미기록 실행, 달 합계·dev 50% 초과 알림,
 *   기록 비용 = 토큰 × 단가표(단건) 재계산
 * - ④-a 출처명 빈 값(공백만)·링크 형식·ai:true·요약 줄은 위반, 모르는 매체명은 경고
 * - ④-b 카드 제목 링크 href·출처명·원제목 글자·출처 목록, 카드 안 라벨, 브리핑 줄 data-ai·라벨 수·문장, 문서 전체 라벨 수
 * - ④-c 수집기 정리(cleanTitle — 엔티티·앞뒤 공백)만 적용한 제목 일치, 불일치 설명, 피드에서 빠짐(확인 불가)·받지 못한 피드(범위 밖)
 */
import { describe, expect, it } from "vitest";

import type {
  BriefFile,
  BriefLine,
  NewsCard,
  NewsFile,
  RunLog,
} from "@/lib/schema";

import {
  briefRunIssues,
  checkNewsCards,
  checkRenderedPage,
  cleanKind,
  compareFeedTitles,
  dailyProdCosts,
  describeTitleDiff,
  monthlyCosts,
  recheckProdCost,
  type FeedSnapshot,
} from "../scripts/lib/m1-completion";
import { parseFeedXml } from "../scripts/lib/rss";

// ─── 합성 데이터 ────────────────────────────────────────────────────────

function run(
  over: Partial<RunLog> & Pick<RunLog, "runId" | "startedAt">,
): RunLog {
  return {
    env: "prod",
    job: "collect",
    finishedAt: over.startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
    ...over,
  };
}

function card(over: Partial<NewsCard> & Pick<NewsCard, "id">): NewsCard {
  return {
    t: "Arsenal beat Spurs",
    s: [],
    cat: "result",
    comp: ["EPL"],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [
      {
        n: "BBC Sport",
        u: `https://www.bbc.co.uk/sport/football/articles/${over.id}`,
        at: "2026-10-28T20:00:00Z",
        tier: 1,
      },
    ],
    lang: "en",
    ai: false,
    created: "2026-10-28T22:12:00Z",
    ...over,
  };
}

function newsFile(cards: NewsCard[]): NewsFile {
  return {
    date: "2026-10-29",
    generatedAt: "2026-10-28T22:12:00Z",
    runId: "collect-prod-x",
    cards,
  };
}

// ─── ② 비용 ─────────────────────────────────────────────────────────────

describe("② dailyProdCosts · monthlyCosts · recheckProdCost", () => {
  // 단건 단가(claude-haiku-5-5): 입력 $0.10 · 출력 $0.50 /MTok → 5,492·4,082 = $0.002590
  const morning = run({
    runId: "collect-prod-a",
    startedAt: "2026-10-28T22:11:07Z", // KST 10-29 07:11
    tokens: { in: 5492, out: 4082, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.00259,
    brief: { requests: 1 },
  });
  const retry = run({
    runId: "collect-prod-b",
    startedAt: "2026-10-29T03:00:00Z", // KST 10-29 12:00
    tokens: { in: 1000, out: 1000, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.0006,
  });
  const quiet = run({
    runId: "collect-prod-c",
    startedAt: "2026-10-27T22:11:00Z",
  });

  it("실행은 startedAt의 KST 날짜로 묶이고 금액·요청·토큰을 합산한다", () => {
    const days = dailyProdCosts([morning, retry, quiet], 0.1);
    expect(days.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-29"]);
    const d29 = days[1]!;
    expect(d29).toMatchObject({
      runs: 2,
      billedRuns: 2,
      briefRequests: 1,
      requestsUnrecorded: 1, // 비용은 있는데 brief 필드가 없음(D56 이전 형식)
      tokens: { in: 6492, out: 5082, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0.00319,
    });
    expect(d29.share).toBeCloseTo(0.0319, 6);
    expect(days[0]).toMatchObject({ runs: 1, billedRuns: 0, costUsd: 0 });
  });

  it("dev 실행을 넣으면 던진다(prod만 일 비용 판정 — D43)", () => {
    expect(() => dailyProdCosts([{ ...morning, env: "dev" }], 0.1)).toThrow();
  });

  it("달 합계는 prod+dev, dev가 월 예산의 50%를 넘을 때만 알린다", () => {
    const dev = (usd: number) =>
      run({
        runId: `eval-dev-${usd}`,
        env: "dev",
        startedAt: "2026-10-17T05:00:00Z",
        costUsd: usd,
      });
    const [m] = monthlyCosts([morning], [dev(1.5)], 3);
    expect(m).toMatchObject({
      month: "2026-10",
      prod: 0.00259,
      dev: 1.5,
      total: 1.50259,
    });
    expect(m!.devShare).toBeCloseTo(0.5, 6);
    expect(m!.devAlert).toBe(false); // 정확히 50%는 알리지 않는다(cost.ts)
    expect(monthlyCosts([morning], [dev(1.500001)], 3)[0]!.devAlert).toBe(true);
  });

  it("기록 비용 = 토큰 × 단가표(단건)면 일치, 다르면 불일치로 남긴다", () => {
    expect(recheckProdCost([morning, retry])).toEqual({
      checked: 2,
      mismatches: [],
    });
    const wrong = { ...morning, runId: "collect-prod-w", costUsd: 0.001 };
    const result = recheckProdCost([wrong]);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({
      runId: "collect-prod-w",
      recorded: 0.001,
    });
  });
});

describe("② briefRunIssues — 게시된 브리핑의 비용이 runs.json에 기록됐는가", () => {
  const brief = (over: Partial<BriefFile>): BriefFile => ({
    date: "2026-10-29",
    generatedAt: "2026-10-28T22:12:00Z",
    runId: "collect-prod-a",
    mode: "mixed",
    lines: [
      { text: "아스널이 토트넘을 2-1로 꺾었다.", ai: true, refs: ["m1"] },
      { text: "리버풀은 첼시와 1-1로 비겼다.", ai: false, refs: ["m2"] },
    ],
    ...over,
  });
  const recorded = run({
    runId: "collect-prod-a",
    startedAt: "2026-10-28T22:11:07Z",
    costUsd: 0.002,
    summarized: 1,
    downgraded: 1,
  });

  it("runId·비용·summarized·downgraded가 맞으면 문제 0", () => {
    expect(briefRunIssues([brief({})], [recorded])).toEqual([]);
  });

  it("실행 기록 없음 · LLM 줄이 있는데 비용 0 · 줄 수 불일치를 남긴다", () => {
    expect(
      briefRunIssues([brief({ runId: "collect-prod-zz" })], [recorded]),
    ).toEqual([
      {
        date: "2026-10-29",
        runId: "collect-prod-zz",
        detail: "runs.json에 실행 기록 없음",
      },
    ]);
    const free = { ...recorded, costUsd: 0, summarized: 2, downgraded: 0 };
    expect(briefRunIssues([brief({})], [free]).map((i) => i.detail)).toEqual([
      "LLM 줄 1개인데 비용 0",
      "summarized 2 ≠ LLM 줄 1",
      "downgraded 0 ≠ 템플릿 줄 1",
    ]);
  });
});

// ─── ④-a 카드 데이터 ────────────────────────────────────────────────────

describe("④-a checkNewsCards", () => {
  const publishers = new Set(["BBC Sport", "인터풋볼"]);

  it("출처명·원문 링크가 있고 ai:false·s:[]인 카드는 통과, 해외·국내를 센다", () => {
    const ko = card({
      id: "c_00000000b2",
      lang: "ko",
      src: [
        {
          n: "인터풋볼",
          u: "https://www.interfootball.co.kr/news/articleView.html?idxno=1",
          at: "2026-10-28T20:00:00Z",
          tier: 2,
        },
      ],
    });
    const result = checkNewsCards(
      [
        {
          file: "2026-10-29.json",
          value: newsFile([card({ id: "c_00000000a1" }), ko]),
        },
      ],
      publishers,
    );
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.files).toEqual([
      {
        file: "2026-10-29.json",
        cards: 2,
        foreign: 1,
        domestic: 1,
        sources: 2,
      },
    ]);
  });

  it("출처명 공백만·링크 형식·ai:true·요약 줄은 위반, 모르는 매체명은 경고", () => {
    const bad = card({
      id: "c_00000000c3",
      ai: true,
      s: ["요약"],
      src: [
        {
          n: "  ",
          u: "https://example.com/a",
          at: "2026-10-28T20:00:00Z",
          tier: 1,
        },
        {
          n: "Unknown Daily",
          u: "https://example.com/a b",
          at: "2026-10-28T20:00:00Z",
          tier: 3,
        },
        {
          n: "BBC Sport",
          u: "javascript:alert(1)",
          at: "2026-10-28T20:00:00Z",
          tier: 1,
        },
      ],
    });
    const result = checkNewsCards(
      [{ file: "x.json", value: newsFile([bad]) }],
      publishers,
    );
    expect(result.issues.map((i) => [i.rule, i.srcIndex])).toEqual([
      ["src-name-empty", 0],
      ["src-url", 1],
      ["src-url", 2],
      ["ai-true", undefined],
      ["summary-lines", undefined],
    ]);
    expect(result.warnings).toEqual([
      {
        file: "x.json",
        cardId: "c_00000000c3",
        srcIndex: 1,
        name: "Unknown Daily",
      },
    ]);
  });
});

// ─── ④-b 화면 ───────────────────────────────────────────────────────────

/** 카드 마크업(src/components/news/feed-card.tsx·ui/card.tsx의 검사 대상 골격) */
function articleHtml(
  c: NewsCard,
  over: { href?: string; name?: string; title?: string; extra?: string } = {},
): string {
  const lead = c.src[0]!;
  const list =
    c.src.length > 1
      ? `<ol id="${c.id}-src" hidden>${c.src
          .map(
            (s) =>
              `<li><a href="${s.u}" target="_blank"><span lang="en">${s.n}</span><time>x</time></a></li>`,
          )
          .join("")}</ol>`
      : "";
  return `<li><article id="${c.id}"><div><span aria-hidden="true">06</span></div><div>
    <h3 id="${c.id}-t" lang="${c.lang}"><a href="${over.href ?? lead.u}" target="_blank">${over.title ?? c.t}<span aria-hidden="true">↗</span><span class="sr-only">(원문 ${lead.n}, 새 창)</span></a></h3>
    <div><div><span lang="en">${over.name ?? lead.n}</span><time datetime="${lead.at}" data-rel=""><span>10.29 05:00</span></time></div></div>
    ${list}${over.extra ?? ""}</div></article></li>`;
}

function briefHtml(
  lines: readonly BriefLine[],
  labelOn?: (i: number) => boolean,
): string {
  return `<section><ol>${lines
    .map((l, i) => {
      const label = (labelOn ? labelOn(i) : l.ai)
        ? `<span data-slot="ai-label-sep"> </span><a href="/about/#ai" data-slot="ai-label">AI 작성</a>`
        : "";
      return `<li data-slot="brief-row" data-ai="${l.ai}"><span aria-hidden="true">${i + 1}</span><p data-slot="brief-text">${l.text}${label}</p></li>`;
    })
    .join("")}</ol><a href="/about/#ai">AI 작성 안내</a></section>`;
}

const page = (body: string) =>
  `<!doctype html><html><head><script>self.__next_f.push(["AI 작성"])</script></head><body>${body}</body></html>`;

describe("④-b checkRenderedPage", () => {
  const one = card({ id: "c_00000000d4" });
  const two = card({
    id: "c_00000000e5",
    t: "Salah & Núñez — it’s over",
    src: [
      {
        n: "BBC Sport",
        u: "https://www.bbc.co.uk/sport/football/articles/e5",
        at: "2026-10-28T20:00:00Z",
        tier: 1,
      },
      {
        n: "The Athletic",
        u: "https://www.nytimes.com/athletic/1/",
        at: "2026-10-28T21:00:00Z",
        tier: 1,
      },
    ],
  });
  const lines: BriefLine[] = [
    { text: "아스널이 토트넘을 2-1로 꺾었다.", ai: true, refs: ["m1"] },
    { text: "리버풀은 첼시와 1-1로 비겼다.", ai: false, refs: ["m2"] },
  ];

  it("데이터와 같은 카드·브리핑 줄이면 위반 0, 라벨 수 = ai:true 줄 수(스크립트 안 글자는 세지 않는다)", () => {
    const html = page(
      `${briefHtml(lines)}<ol id="feed">${articleHtml(one)}${articleHtml(two)}</ol>`,
    );
    const r = checkRenderedPage(html, { cards: [one, two], briefLines: lines });
    expect(r.issues).toEqual([]);
    expect(r).toMatchObject({
      cards: 2,
      multiSource: 1,
      briefRows: 2,
      aiTrue: 1,
      aiLabels: 1,
      aiLabelTexts: 1,
    });
  });

  it("제목 링크 href·출처명·원제목 글자가 데이터와 다르면 카드마다 잡는다", () => {
    const html = page(
      `<ol id="feed">${articleHtml(one, { href: "https://example.com/other", name: "BBC", title: "Arsenal beat Spurs!" })}</ol>`,
    );
    const r = checkRenderedPage(html, { cards: [one], briefLines: null });
    expect(r.issues).toEqual([
      "c_00000000d4: 제목 링크 href ≠ 데이터 대표 링크",
      "c_00000000d4: 제목 글자 ≠ 데이터 t",
      "c_00000000d4: 출처명 ≠ 데이터 src[0].n",
      "c_00000000d4: 출처 밖 외부 링크",
    ]);
  });

  it("카드 안 AI 작성 라벨·글자, 템플릿 줄 라벨·AI 줄 라벨 없음을 잡는다", () => {
    const html = page(
      `${briefHtml(lines, (i) => i === 1)}<ol id="feed">${articleHtml(one, {
        extra: `<a data-slot="ai-label" href="/about/#ai">AI 작성</a>`,
      })}</ol>`,
    );
    const r = checkRenderedPage(html, { cards: [one], briefLines: lines });
    expect(r.issues).toEqual([
      "c_00000000d4: 카드에 AI 작성 라벨",
      "c_00000000d4: 카드에 'AI 작성' 글자",
      "브리핑 1줄(ai:true): 라벨 0개",
      "브리핑 2줄(ai:false): 라벨 1개",
      "문서 전체 AI 작성 라벨 2개 ≠ ai:true 줄 1개",
      "글자 'AI 작성' 요소 2개 ≠ ai:true 줄 1개",
    ]);
  });

  it("브리핑 블록이 없어야 하는 페이지(/news/)에 줄이 있거나, 카드 목록이 다르면 잡는다", () => {
    const html = page(
      `${briefHtml(lines)}<ol id="feed">${articleHtml(one)}</ol>`,
    );
    const r = checkRenderedPage(html, { cards: [one, two], briefLines: null });
    expect(r.issues).toEqual([
      "카드 목록 불일치 — 화면 1장 · 데이터 2장(순서 포함 비교)",
      "브리핑 블록이 없어야 하는데 줄 2개",
      "문서 전체 AI 작성 라벨 1개 ≠ ai:true 줄 0개",
      "글자 'AI 작성' 요소 1개 ≠ ai:true 줄 0개",
    ]);
  });

  it("출처 목록 행의 링크가 데이터 순서와 다르면 잡는다", () => {
    const swapped = {
      ...two,
      src: [
        two.src[0]!,
        { ...two.src[1]!, u: "https://www.nytimes.com/athletic/2/" },
      ],
    };
    const html = page(`<ol id="feed">${articleHtml(swapped)}</ol>`);
    const r = checkRenderedPage(html, { cards: [two], briefLines: null });
    expect(r.issues).toContain("c_00000000e5: 출처 목록 1행 href ≠ src[1].u");
  });
});

// ─── ④-c 원제목 ─────────────────────────────────────────────────────────

describe("④-c compareFeedTitles", () => {
  const bbc = (items: FeedSnapshot["items"]): FeedSnapshot => ({
    sourceId: "bbc-sport-football",
    publisher: "BBC Sport",
    ok: true,
    items,
  });

  it("수집기 정리(cleanTitle — 엔티티·앞뒤 공백)만 적용해 글자 그대로 비교한다", async () => {
    // CDATA 안 엔티티는 XML이 풀지 않는다 → cleanTitle이 푼다(카드에는 풀린 글자가 저장된다)
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>f</title>
      <item><title><![CDATA[Salah &amp; Núñez — it&#8217;s over ]]></title><link> https://www.bbc.co.uk/sport/football/articles/e5 </link></item>
      <item><title>Arsenal beat Spurs</title><link>https://www.bbc.co.uk/sport/football/articles/c_00000000d4</link></item>
    </channel></rss>`;
    const raws = await parseFeedXml(xml, { summaries: false });
    const feed = bbc(raws.map((r) => ({ title: r.title, link: r.link })));
    const cards = [
      card({ id: "c_00000000d4" }),
      card({
        id: "c_00000000e5",
        t: "Salah & Núñez — it’s over",
        src: [
          {
            n: "BBC Sport",
            u: "https://www.bbc.co.uk/sport/football/articles/e5",
            at: "2026-10-28T20:00:00Z",
            tier: 1,
          },
        ],
      }),
    ];
    const r = compareFeedTitles(cards, [feed]);
    expect(r).toMatchObject({
      cards: 2,
      leadMatch: 2,
      leadMatchRaw: 1,
      leadMismatch: [],
    });
    expect(r.leadCleaned).toEqual([
      { cardId: "c_00000000e5", kind: "엔티티 디코딩" },
    ]);
  });

  it("제목이 다르면 불일치(짧은 차이 설명), 피드에서 빠진 항목은 확인 불가, 받지 못한 매체는 범위 밖", () => {
    const changed = card({ id: "c_00000000f6", t: "Arsenal beat Spurs 2-1" });
    const gone = card({ id: "c_0000000010" });
    const athletic = card({
      id: "c_0000000011",
      src: [
        {
          n: "The Athletic",
          u: "https://www.nytimes.com/athletic/9/",
          at: "2026-10-28T20:00:00Z",
          tier: 1,
        },
      ],
    });
    const failed: FeedSnapshot = {
      sourceId: "the-athletic-football",
      publisher: "The Athletic",
      ok: false,
      error: "timeout",
      items: [],
    };
    const r = compareFeedTitles(
      [changed, gone, athletic],
      [
        bbc([{ title: "Arsenal beat Spurs 2-0", link: changed.src[0]!.u }]),
        failed,
      ],
    );
    expect(r.leadMatch).toBe(0);
    expect(r.leadMismatch).toEqual([
      {
        cardId: "c_00000000f6",
        sourceIds: ["bbc-sport-football"],
        detail: expect.stringContaining("22번째 글자부터 다름"),
      },
    ]);
    expect(r.leadUnverifiable).toEqual(["c_0000000010"]);
    expect(r.leadOutOfScope).toEqual(["c_0000000011"]);
  });

  it("나머지 출처 링크는 피드에 있는지만 세고, 링크가 같은데 매체명이 다르면 따로 남긴다", () => {
    const multi = card({
      id: "c_0000000012",
      src: [
        {
          n: "BBC Sport",
          u: "https://www.bbc.co.uk/sport/football/articles/12",
          at: "2026-10-28T20:00:00Z",
          tier: 1,
        },
        {
          n: "The Athletic",
          u: "https://www.nytimes.com/athletic/12/",
          at: "2026-10-28T21:00:00Z",
          tier: 1,
        },
        {
          n: "BBC Sport",
          u: "https://www.bbc.co.uk/sport/football/articles/gone",
          at: "2026-10-28T21:00:00Z",
          tier: 1,
        },
      ],
    });
    const r = compareFeedTitles(
      [multi],
      [
        bbc([
          { title: multi.t, link: multi.src[0]!.u },
          { title: "x", link: "https://www.nytimes.com/athletic/12/" }, // 다른 매체 링크가 BBC 피드에 — 매체명 불일치
        ]),
      ],
    );
    expect(r).toMatchObject({
      leadMatch: 1,
      extraFound: 1,
      extraUnverifiable: 1,
      extraOutOfScope: 0,
    });
    expect(r.publisherMismatch).toEqual([
      { cardId: "c_0000000012", srcIndex: 1 },
    ]);
  });

  it("describeTitleDiff·cleanKind — 공백·정규화 차이를 먼저 가린다", () => {
    expect(describeTitleDiff("A B", "A B ")).toBe("앞뒤 공백만 다름");
    expect(describeTitleDiff("A B", "A  B")).toBe("공백 종류·개수만 다름");
    expect(describeTitleDiff("é", "é")).toBe("유니코드 정규화(NFC)만 다름");
    expect(cleanKind("Title ", "Title")).toBe("앞뒤 공백 정리");
    expect(cleanKind("It&#8217;s", "It’s")).toBe("엔티티 디코딩");
    expect(cleanKind("A\nB", "A B")).toBe("줄바꿈·제어 문자 정리 등");
    expect(cleanKind("A", "A")).toBe("없음");
  });
});
