/**
 * M1-17 — 수집 실행(runCollect)의 코드 분류·범위 밖 제외·엔티티 2단계 병합·요약문 경계 (PRD FR-05·FR-21, D23·D39·D42).
 *
 *   - RSS 요약문(description)은 메모리 안 분류 입력으로만(D39 ①): spoiler·범위 밖 제외의 남기는 근거에 쓰이지만 `data/`(뉴스 파일·기억 파일)·
 *     출력(dry 포함)·로그 어디에도 그 문자열이 남지 않는다(합성 문자열 — 공개 저장소 fixtures에는 요약문을 넣지 않는다)
 *   - 범위 밖 기사(축구 외·K리그·연예)는 클러스터링 전에 빠지고 `collect.filter.done`에 사유별 건수(제목 없음)
 *   - 엔티티 2단계 병합: 같은 날 재실행에서 오늘 카드와 같은 경기인 새 기사는 그 카드의 출처(id·제목 유지)
 *   - 분류 결과가 카드에 들어간다(imp·cat·teams·comp·spoiler) · 분류 단계 실패 격리(최소 분류로 발행, partial)
 * 네트워크 없음 — 피드는 테스트가 만든 작은 RSS, 경기는 빈 응답(브리핑 호출 생략), 파일은 임시 폴더.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NewsFileSchema, type NewsFile, type Source } from "@/lib/schema";

import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { singletonClusters } from "../scripts/lib/news-cluster";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import { feedUserAgent } from "../scripts/lib/rss";
import { urlHash } from "../scripts/lib/url-normalize";

import { fixtureFeedSources } from "./support/fixture-sources";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = fixtureFeedSources();
const byId = (id: string): Source => SOURCES.find((s) => s.id === id)!;
const BBC = byId("bbc-sport-football");
const ESPN = byId("espn-soccer");
const IF_ALL = byId("interfootball-all");
const RELEVO = byId("relevo");
const DIMARZIO = byId("di-marzio");
const FEEDS = [BBC, ESPN, IF_ALL, RELEVO, DIMARZIO];

const NOW = "2026-10-10T21:30:00.000Z"; // 06:30 KST 2026-10-11
const LATER = "2026-10-11T01:00:00.000Z"; // 같은 KST 날 10:00

/** 요약문 표시 문자열 — 어디에도 남으면 안 된다 */
const MARKER = "ZZ-SUMMARY-MARKER-7f3a";

interface FeedEntry {
  title: string;
  link: string;
  at: string;
  description?: string;
}

function rss(entries: readonly FeedEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `<item><title><![CDATA[${e.title}]]></title><link>${e.link}</link><pubDate>${new Date(e.at).toUTCString()}</pubDate>${
          e.description
            ? `<description><![CDATA[${e.description}]]></description>`
            : ""
        }</item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title><link>https://example.com/</link><description>d</description>${items}</channel></rss>`;
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-classify-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeDeps(
  now: string,
  feeds: Partial<Record<string, readonly FeedEntry[]>>,
  over: Partial<CollectDeps> = {},
) {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  const printed: string[] = [];
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 45,
    loadSources: async () => FEEDS,
    now: () => new Date(now),
    fetch: async (input) => {
      const url = String(input);
      if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
        return new Response('{"matches":[]}', { status: 200 });
      }
      const source = FEEDS.find((s) => s.url === url);
      if (source === undefined) throw new Error(`예상하지 못한 URL: ${url}`);
      return new Response(rss(feeds[source.id] ?? []), { status: 200 });
    },
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      throw new Error("경기가 없으면 LLM을 만들지 않는다");
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (line, record) => {
        lines.push(line);
        records.push(record);
      },
    }),
    print: (text) => printed.push(text),
    ...over,
  };
  return { deps, records, lines, printed };
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

/** dataDir 아래 모든 파일 내용(재귀) */
function allDataText(dir = dataDir): string {
  return readdirSync(dir)
    .map((name) => {
      const p = path.join(dir, name);
      return statSync(p).isDirectory()
        ? allDataText(p)
        : readFileSync(p, "utf8");
    })
    .join("\n");
}

const NEUTRAL: FeedEntry = {
  title: "Talking points from the Emirates",
  link: "https://www.bbc.co.uk/sport/football/articles/c0talk01o",
  at: "2026-10-10T20:30:00.000Z",
  description: `<p>Arsenal beat Chelsea 2-1 with a late winner — Bayern Munich and Kim Min-jae next. ${MARKER}</p>`,
};
const ENTERTAINMENT: FeedEntry = {
  title: "패닉, 12월 다시 만난다...단독 콘서트 개최",
  link: "https://www.interfootball.co.kr/news/articleView.html?idxno=990001",
  at: "2026-10-10T20:00:00.000Z",
  description: `콘서트 소식 ${MARKER}`,
};
const KLEAGUE: FeedEntry = {
  title: "포항, 안양 상대로 정규리그 마지막 홈경기 앞뒀다",
  link: "https://www.interfootball.co.kr/news/articleView.html?idxno=990002",
  at: "2026-10-10T20:10:00.000Z",
};
const KOREAN: FeedEntry = {
  title: "‘미쳤다’ 김민재 아스널 이적 가능성! “영입 후보로 거론되고 있어”",
  link: "https://www.interfootball.co.kr/news/articleView.html?idxno=990003",
  at: "2026-10-10T20:20:00.000Z",
  description: `김민재 관련 요약 ${MARKER}`,
};
const NFL: FeedEntry = {
  title: "Eagles-Jaguars en Tottenham: la NFL vuelve a Londres",
  link: "https://www.relevo.com/nfl/eagles-jaguars-tottenham",
  at: "2026-10-10T20:40:00.000Z",
};
const ARS_CHE: FeedEntry = {
  title: "Saka double helps Arsenal beat Chelsea 2-1",
  link: "https://www.bbc.co.uk/sport/football/articles/c0arsche1o",
  at: "2026-10-10T21:00:00.000Z",
};
const ARS_CHE_ESPN: FeedEntry = {
  title: "Chelsea fall to 2-1 defeat at Arsenal",
  link: "https://www.espn.com/soccer/story/_/id/2001/chelsea-arsenal",
  at: "2026-10-11T00:30:00.000Z",
};

describe("runCollect — 요약문은 메모리 안 분류 입력으로만 (D39 ①)", () => {
  it("요약문은 spoiler 근거로 쓰이지만(카테고리·팀·대회 태그는 아니다) 요약문 문자열은 data/·로그·출력 어디에도 없다", async () => {
    const { deps, records, lines, printed } = makeDeps(NOW, {
      [BBC.id]: [NEUTRAL],
      [IF_ALL.id]: [ENTERTAINMENT, KOREAN],
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const file = readNews("2026-10-11");
    const neutral = file.cards.find((c) => c.t === NEUTRAL.title)!;
    // 요약문의 'beat … 2-1 … late winner'로 spoiler(보수적). 카테고리는 제목으로만(기타), 요약문 속 팀·선수는 태그가 아니다
    expect(neutral).toMatchObject({
      cat: "other",
      spoiler: true,
      teams: [],
      players: [],
      kr: false,
      s: [],
    });
    const korean = file.cards.find((c) => c.t === KOREAN.title)!;
    expect(korean).toMatchObject({
      kr: true,
      cat: "transfer",
      teams: ["arsenal"],
    });
    // 연예 기사는 빠졌다
    expect(file.cards.some((c) => c.t === ENTERTAINMENT.title)).toBe(false);

    expect(allDataText()).not.toContain(MARKER);
    expect(allDataText()).not.toContain("late winner");
    expect(lines.join("\n")).not.toContain(MARKER);
    expect(JSON.stringify(records)).not.toContain(MARKER);
    expect(printed.join("\n")).not.toContain(MARKER);
  });

  it("dry 실행의 출력(쓰려던 파일 내용)에도 요약문이 없다", async () => {
    const { deps, printed, lines } = makeDeps(
      NOW,
      { [BBC.id]: [NEUTRAL], [IF_ALL.id]: [KOREAN] },
      { dry: true },
    );
    await runCollect(deps);
    const out = printed.join("\n");
    expect(out).toContain(NEUTRAL.title);
    expect(out).not.toContain(MARKER);
    expect(lines.join("\n")).not.toContain(MARKER);
  });
});

describe("runCollect — 범위 밖 기사 제외 (M1-17, 클러스터링 전)", () => {
  it("축구 외(Relevo NFL)·K리그·연예는 카드가 되지 않고, 사유별 건수만 로그에 남는다(제목 없음)", async () => {
    const { deps, records } = makeDeps(NOW, {
      [BBC.id]: [ARS_CHE],
      [IF_ALL.id]: [ENTERTAINMENT, KLEAGUE, KOREAN],
      [RELEVO.id]: [NFL],
    });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards.map((c) => c.t).sort()).toEqual(
      [ARS_CHE.title, KOREAN.title].sort(),
    );
    expect(outcome.news.filter).toEqual({
      groups: 5,
      kept: 2,
      excluded: 3,
      nonFootball: 1,
      kLeague: 1,
      entertainment: 1,
      bySource: { [IF_ALL.id]: 2, [RELEVO.id]: 1 },
    });
    const log = records.find((r) => r.event === "collect.filter.done")!;
    expect(log).toMatchObject({
      groups: 5,
      kept: 2,
      nonFootball: 1,
      kLeague: 1,
      entertainment: 1,
    });
    expect(JSON.stringify(log)).not.toContain("콘서트");
    // 뺀 기사는 기억(seen-urls — 정규화 URL 해시)에도 남지 않는다(다음 실행에서 다시 판정)
    const seen = readFileSync(
      path.join(dataDir, "cache", "seen-urls.json"),
      "utf8",
    );
    expect(seen).toContain(urlHash(ARS_CHE.link));
    expect(seen).not.toContain(urlHash(ENTERTAINMENT.link));
    expect(seen).not.toContain(urlHash(NFL.link));
  });
});

describe("runCollect — 분류 결과가 카드에 (FR-21)", () => {
  it("카드의 cat·comp·teams·spoiler·imp가 코드 분류 값이고, 파일 순서는 imp 내림차순(머리기사 imp 5는 점수 1위 1장)", async () => {
    const { deps, records } = makeDeps(NOW, {
      [BBC.id]: [ARS_CHE],
      [IF_ALL.id]: [KOREAN],
    });
    await runCollect(deps);
    const file = readNews("2026-10-11");
    const card = file.cards.find((c) => c.t === ARS_CHE.title)!;
    expect(card).toMatchObject({
      cat: "result",
      comp: ["EPL"],
      teams: ["arsenal", "chelsea"],
      spoiler: true,
      kr: false,
    });
    const imps = file.cards.map((c) => c.imp);
    expect([...imps].sort((a, b) => b - a)).toEqual(imps);
    expect(imps.filter((i) => i === 5).length).toBeLessThanOrEqual(1);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      classifiedMix: expect.objectContaining({ kr: 1, spoiler: 1 }),
    });
  });

  it("범위 판정 단계가 예상 밖 오류로 실패해도 빼지 않은 채 발행한다(partial + 경고)", async () => {
    const { deps, records } = makeDeps(
      NOW,
      { [BBC.id]: [ARS_CHE], [IF_ALL.id]: [ENTERTAINMENT] },
      {
        filterOutOfScope: () => {
          throw new Error("scope-boom");
        },
      },
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news.classifyError).toBe("scope-boom");
    expect(outcome.news.filter).toBeNull();
    // 빼지 못한 연예 기사도 카드가 된다(발행이 멈추지 않는 쪽 — 다음 실행에서 다시 판정)
    expect(
      readNews("2026-10-11")
        .cards.map((c) => c.t)
        .sort(),
    ).toEqual([ARS_CHE.title, ENTERTAINMENT.title].sort());
    expect(
      records.find((r) => r.event === "collect.filter.fail"),
    ).toMatchObject({
      level: "warn",
      error: "scope-boom",
    });
  });

  it("D48 — 위험 수용 소스(Di Marzio)의 요약문은 읽지 않는다: 요약문의 결과 표현으로 spoiler가 되지 않고, 어디에도 남지 않는다", async () => {
    const dm: FeedEntry = {
      title: "Napoli, Conte: «Siamo pronti per la Champions»",
      link: "https://www.gianlucadimarzio.com/napoli-conte-pronti",
      at: "2026-10-10T20:30:00.000Z",
      description: `Il Napoli ha vinto 2-1 con gol al 90' ${MARKER}`,
    };
    const { deps, lines, records } = makeDeps(NOW, { [DIMARZIO.id]: [dm] });
    await runCollect(deps);
    const card = readNews("2026-10-11").cards.find((c) => c.t === dm.title)!;
    expect(card).toMatchObject({ spoiler: false, teams: ["napoli"] });
    expect(allDataText()).not.toContain(MARKER);
    expect(lines.join("\n")).not.toContain(MARKER);
    expect(JSON.stringify(records)).not.toContain(MARKER);
  });

  it("분류 단계가 예상 밖 오류로 실패해도 최소 분류(소스 대회·기본값)로 발행한다(partial + 경고)", async () => {
    const { deps, records } = makeDeps(
      NOW,
      { [BBC.id]: [ARS_CHE] },
      {
        classifyClusters: () => {
          throw new Error("boom");
        },
      },
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news.classifyError).toBe("boom");
    const [card] = readNews("2026-10-11").cards;
    expect(card).toMatchObject({ cat: "other", imp: 3, teams: [], comp: [] });
    expect(
      records.find((r) => r.event === "collect.classify.fail"),
    ).toMatchObject({
      level: "warn",
      error: "boom",
    });
  });
});

describe("runCollect — 엔티티 2단계 병합 같은 날 재실행 (D42 ⑥)", () => {
  it("오늘 카드와 같은 경기(같은 두 팀·같은 스코어·12시간 안)의 새 기사는 그 카드의 출처 — id·제목·created 유지, 새 카드 없음", async () => {
    // 제목 유사도(1단계)를 끄고(혼자 클러스터) 엔티티 병합만으로 붙는지 본다
    const isolate = { clusterDocs: singletonClusters };
    const morning = makeDeps(NOW, { [BBC.id]: [ARS_CHE] }, isolate);
    await runCollect(morning.deps);
    const [first] = readNews("2026-10-11").cards;
    expect(first).toMatchObject({
      t: ARS_CHE.title,
      teams: ["arsenal", "chelsea"],
    });

    const later = makeDeps(
      LATER,
      { [BBC.id]: [ARS_CHE], [ESPN.id]: [ARS_CHE_ESPN] },
      isolate,
    );
    const outcome = await runCollect(later.deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(1);
    const [card] = file.cards;
    expect(card).toMatchObject({
      id: first!.id,
      t: first!.t,
      created: first!.created,
    });
    expect(card!.src.map((s) => s.u)).toEqual([
      ARS_CHE.link,
      ARS_CHE_ESPN.link,
    ]);
    expect(outcome.news.entity).toMatchObject({
      attached: 1,
      eligibleToday: 1,
    });
    expect(outcome.news.added).toBe(0);
    expect(outcome.news.attached).toBe(1);
  });

  it("다른 스코어(다른 경기)면 붙이지 않고 새 카드", async () => {
    const isolate = { clusterDocs: singletonClusters };
    await runCollect(makeDeps(NOW, { [BBC.id]: [ARS_CHE] }, isolate).deps);
    const other = {
      ...ARS_CHE_ESPN,
      title: "Chelsea fall to 3-0 defeat at Arsenal",
    };
    await runCollect(
      makeDeps(LATER, { [BBC.id]: [ARS_CHE], [ESPN.id]: [other] }, isolate)
        .deps,
    );
    expect(readNews("2026-10-11").cards).toHaveLength(2);
  });
});

describe("runCollect — 이적 정보가 카드에 (M1-18, FR-21·FR-100 입력)", () => {
  const KANE: FeedEntry = {
    title: "Arsenal agree £100m fee for Bayern striker Harry Kane",
    link: "https://www.bbc.co.uk/sport/football/articles/c0kane01o",
    at: "2026-10-10T20:50:00.000Z",
  };
  const ROUNDUP: FeedEntry = {
    title:
      "🚨 Haaland to Arsenal update, Liverpool want PL winger, Man United want ex-midfielder & more",
    link: "https://www.bbc.co.uk/sport/football/articles/c0round1o",
    at: "2026-10-10T20:55:00.000Z",
  };

  it("이적 카드의 transfer(선수·출발·행선지·단계·tier)는 스키마를 통과해 data/에 들어가고, 국내 1곳 rumor·묶음 제목·이적 아닌 카드에는 맞게 붙는다", async () => {
    const { deps, records } = makeDeps(NOW, {
      [BBC.id]: [KANE, ROUNDUP, ARS_CHE],
      [IF_ALL.id]: [KOREAN],
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const file = readNews("2026-10-11");
    const kane = file.cards.find((c) => c.t === KANE.title)!;
    expect(kane).toMatchObject({
      cat: "transfer",
      ai: false,
      s: [],
      transfer: {
        player: "harry-kane",
        from: "bayern-munchen",
        to: "arsenal",
        status: "agreed",
        tier: 2,
      },
    });
    // 국내 1곳 — rumor(가능성), 행선지 아스널, tier = 그 카드 최고 출처 Tier(인터풋볼 3)
    expect(file.cards.find((c) => c.t === KOREAN.title)!.transfer).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "rumor",
      tier: 3,
    });
    // 여러 소식 묶음은 카테고리만 이적, 경기 결과 카드에는 키 자체가 없다
    const roundup = file.cards.find((c) => c.t === ROUNDUP.title)!;
    expect(roundup.cat).toBe("transfer");
    expect("transfer" in roundup).toBe(false);
    expect("transfer" in file.cards.find((c) => c.t === ARS_CHE.title)!).toBe(
      false,
    );
    // 로그 — 단계별 수·방향이 채워진 수(제목·선수 없음)
    const select = records.find((r) => r.event === "collect.select.done")!;
    expect(select).toMatchObject({
      classifiedMix: expect.objectContaining({
        transfer: { agreed: 1, rumor: 1 },
        transferTo: 2,
        transferFrom: 1,
      }),
    });
    expect(JSON.stringify(select)).not.toContain("harry-kane");
  });
});
