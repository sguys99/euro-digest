// scripts/lib/publish-gate.ts — 발행 검증 게이트 (M1-25, FR-153·FR-143·PRD §10 휴식기, D23·D32·D38) — 순수 함수
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BriefFileSchema,
  CompetitionsFileSchema,
  NationalTeamFileSchema,
  NewsFileSchema,
  SourcesFileSchema,
  type CardSource,
  type NewsCard,
  type NewsFile,
  type TakedownsFile,
} from "@/lib/schema";

import {
  CARD_FLOOR,
  CARD_FLOOR_REST,
  cardFloorFor,
  pickGateInput,
  restLabel,
  restPeriodOf,
  runPublishGate,
  type GateInput,
} from "../scripts/lib/publish-gate";
import { formatIssue } from "../scripts/lib/validate-schema";

const ROOT = path.resolve(".");
const COMPETITIONS = CompetitionsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
  ),
);
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(readFileSync(path.join(ROOT, "configs/sources.json"), "utf8")),
);

const DAY_MS = 24 * 60 * 60 * 1000;

function src(
  n: string,
  u: string,
  at = "2026-10-16T20:00:00.000Z",
): CardSource {
  return { n, u, at, tier: 1 };
}

function card(i: number, over: Partial<NewsCard> = {}): NewsCard {
  const id = `c_${i.toString(16).padStart(10, "0")}`;
  return {
    id,
    t: `title ${i}`,
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [
      src("BBC Sport", `https://www.bbc.co.uk/sport/football/articles/${i}`),
    ],
    lang: "en",
    ai: false,
    created: "2026-10-16T21:30:00.000Z",
    ...over,
  };
}

function newsFile(date: string, cards: NewsCard[]): NewsFile {
  return NewsFileSchema.parse({
    date,
    generatedAt: "2026-10-16T21:31:00.000Z",
    runId: `prod-collect-${date}`,
    cards,
  });
}

const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i + 1));

/** 06:31 KST 2026-10-17 */
const NOW = "2026-10-16T21:31:00.000Z";
const TODAY = "2026-10-17";

function gate(over: Partial<GateInput> = {}) {
  const news = over.news ?? [
    { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(12)) },
  ];
  const input: GateInput = {
    news,
    briefs: [],
    newsPaths: news.map((f) => f.file),
    sources: SOURCES,
    competitions: COMPETITIONS,
    now: NOW,
    ...over,
  };
  const result = runPublishGate(input);
  const of = (severity: "error" | "warn") =>
    result.issues.filter((i) => i.severity === severity).map(formatIssue);
  return { result, errors: of("error"), warns: of("warn") };
}

describe("restPeriodOf — 휴식기(비시즌·A매치 기간) 판정", () => {
  it("시즌 중이면 평시 — 저장소 competitions.json 2026-27", () => {
    const rest = restPeriodOf(TODAY, { competitions: COMPETITIONS });
    expect(rest.reasons).toEqual([]);
    expect(cardFloorFor(rest)).toBe(CARD_FLOOR);
    expect(restLabel(rest)).toBe("평시");
  });

  it("모든 대회 시즌 밖이면 비시즌(하한 5) — 시즌 끝 다음 날·시작 전날 경계", () => {
    // 가장 늦게 끝나는 대회(EPL·라리가·세리에 2027-05-30, UCL 결승 포함)를 넘긴 날
    const lastEnd = COMPETITIONS.map((c) => c.endDate)
      .sort()
      .at(-1)!;
    const firstStart = COMPETITIONS.map((c) => c.startDate).sort()[0]!;
    expect(
      restPeriodOf(lastEnd, { competitions: COMPETITIONS }).reasons,
    ).toEqual([]);
    const after = new Date(Date.parse(`${lastEnd}T00:00:00Z`) + DAY_MS)
      .toISOString()
      .slice(0, 10);
    const off = restPeriodOf(after, { competitions: COMPETITIONS });
    expect(off.reasons).toEqual(["off-season"]);
    expect(cardFloorFor(off)).toBe(CARD_FLOOR_REST);
    expect(restLabel(off)).toBe("휴식기 — 비시즌");
    const before = new Date(Date.parse(`${firstStart}T00:00:00Z`) - DAY_MS)
      .toISOString()
      .slice(0, 10);
    expect(
      restPeriodOf(before, { competitions: COMPETITIONS }).reasons,
    ).toEqual(["off-season"]);
  });

  it("A매치 기간 = 경기일(KST) ±3일 — 3일째 포함, 4일째 제외", () => {
    // 2026-11-14 20:00 KST 킥오프 = 11:00Z
    const nationalTeam = NationalTeamFileSchema.parse({
      matches: [
        {
          id: "2026-11-14-friendly",
          kickoff: "2026-11-14T11:00:00Z",
          opponent: "Example",
          home: true,
          competition: "친선경기",
          status: "scheduled",
          result: null,
        },
      ],
    });
    const at = (date: string) =>
      restPeriodOf(date, { competitions: COMPETITIONS, nationalTeam }).reasons;
    expect(at("2026-11-11")).toEqual(["international-window"]);
    expect(at("2026-11-17")).toEqual(["international-window"]);
    expect(at("2026-11-10")).toEqual([]);
    expect(at("2026-11-18")).toEqual([]);
  });

  it("판정 근거 파일이 없으면 평시 하한(근거에 남김)", () => {
    const rest = restPeriodOf(TODAY, {});
    expect(rest.reasons).toEqual([]);
    expect(rest.basis).toEqual([
      "competitions.json 없음 — 시즌 판정 불가",
      "national-team.json 없음 — A매치 기간 판정 안 함",
    ]);
  });
});

describe("⑤ 카드 수 하한 (FR-153)", () => {
  it("발행일(KST 오늘) 파일이 10장이면 통과, 9장이면 오류", () => {
    const ok = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(10)) },
      ],
    });
    expect(ok.errors).toEqual([]);
    expect(ok.result.floor).toMatchObject({
      date: TODAY,
      strict: false,
      state: "present",
      cards: 10,
      required: 10,
    });

    const short = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(9)) },
      ],
    });
    expect(short.errors).toHaveLength(1);
    expect(short.errors[0]).toMatch(
      /^data\/news\/2026-10-17\.json:cards — 카드 9장 < 하한 10장\(평시 — 시즌 중/,
    );
  });

  it("휴식기(비시즌)는 5장이면 통과", () => {
    const offDate = "2027-06-20";
    const offNow = "2027-06-19T21:31:00.000Z";
    const five = gate({
      now: offNow,
      news: [
        {
          file: `data/news/${offDate}.json`,
          value: newsFile(offDate, cards(5)),
        },
      ],
    });
    expect(five.errors).toEqual([]);
    expect(five.result.floor).toMatchObject({ required: 5, cards: 5 });
    const four = gate({
      now: offNow,
      news: [
        {
          file: `data/news/${offDate}.json`,
          value: newsFile(offDate, cards(4)),
        },
      ],
    });
    expect(four.errors[0]).toMatch(/카드 4장 < 하한 5장\(휴식기 — 비시즌/);
  });

  it("지난 파일은 하한을 보지 않는다(2026-10-12~14 발행분 5·5·8장)", () => {
    const { errors, result } = gate({
      news: [
        {
          file: "data/news/2026-10-12.json",
          value: newsFile("2026-10-12", cards(5)),
        },
        {
          file: "data/news/2026-10-14.json",
          value: newsFile("2026-10-14", cards(8)),
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(result.floor).toMatchObject({ date: TODAY, state: "missing" });
  });

  it("오늘 파일이 없으면 기본 모드는 건너뛰고(사람 push의 CI), --publish-date면 오류(수집 워크플로)", () => {
    const loose = gate({ news: [] });
    expect(loose.errors).toEqual([]);
    expect(loose.result.floor).toMatchObject({
      strict: false,
      state: "missing",
    });

    const strict = gate({ news: [], publishDate: TODAY });
    expect(strict.errors).toEqual([
      "data/news/2026-10-17.json — 발행 파일이 없음(--publish-date 2026-10-17) — 카드 0장 < 하한 10장(평시). 커밋·배포를 멈추고 전날 사이트를 유지한다(FR-153)",
    ]);
  });

  it("--publish-date는 시각 없이도 그 날짜를 본다", () => {
    const { errors, result } = gate({
      now: undefined,
      publishDate: "2026-10-14",
      news: [
        {
          file: "data/news/2026-10-14.json",
          value: newsFile("2026-10-14", cards(8)),
        },
      ],
    });
    expect(result.floor).toMatchObject({
      date: "2026-10-14",
      strict: true,
      cards: 8,
    });
    expect(errors).toHaveLength(1);
  });

  it("파일은 있지만 스키마 오류면(값 없음) 하한은 건너뛴다 — 오류는 data 단계가 낸다", () => {
    const { errors, result } = gate({
      news: [],
      newsPaths: [`data/news/${TODAY}.json`],
      publishDate: TODAY,
    });
    expect(errors).toEqual([]);
    expect(result.floor?.state).toBe("invalid");
  });

  it("시각도 --publish-date도 없으면 하한을 정하지 않는다(null)", () => {
    expect(gate({ now: undefined }).result.floor).toBeNull();
  });

  it("삭제 요청 카드도 센다 — 등록 push가 하한 때문에 배포되지 않으면 안 된다", () => {
    const tenCards = cards(10);
    const takedowns: TakedownsFile = tenCards.slice(0, 3).map((c) => ({
      id: c.id,
      requestedAt: "2026-10-16T22:00:00Z",
      handledAt: null,
      reason: "삭제 요청 (#1)",
    }));
    const { errors, warns } = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, tenCards) },
      ],
      takedowns,
    });
    expect(errors).toEqual([]);
    expect(warns).toHaveLength(3);
  });
});

describe("①②③ 카드 내용 — 모든 날짜 파일", () => {
  it("ai:true 뉴스 카드는 오류(D23 — 라벨 없는 AI 제목 차단, M1-01 이월)", () => {
    const { errors } = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(12)) },
        {
          file: "data/news/2026-10-12.json",
          value: newsFile("2026-10-12", [
            card(1, { ai: true, t: "AI가 쓴 한국어 제목" }),
          ]),
        },
      ],
    });
    expect(errors).toEqual([
      'data/news/2026-10-12.json:cards[0].ai — 뉴스 카드 ai:true(c_0000000001) — 뉴스 기사는 LLM을 거치지 않는다(D23). "AI 작성" 라벨 없이 AI 제목이 게시되지 않게 발행을 막는다',
    ]);
  });

  it("요약 줄(s)이 있으면 오류(D23·M0-25)", () => {
    const { errors } = gate({
      news: [
        {
          file: `data/news/${TODAY}.json`,
          value: newsFile(TODAY, [
            ...cards(11),
            card(99, { s: ["RSS 요약문"] }),
          ]),
        },
      ],
    });
    expect(errors).toEqual([
      "data/news/2026-10-17.json:cards[11].s — 뉴스 카드 요약 줄이 1줄(c_0000000063) — 카드는 원제목+링크만(s: [], D23), RSS 요약문은 저장하지 않는다(M0-25·D39)",
    ]);
  });

  it("링크 형식 오류는 출처마다(스키마는 통과한 값) — 링크 값은 메시지에 넣지 않는다", () => {
    const bad = card(50, {
      src: [
        src("BBC Sport", "https://www.bbc.co.uk/sport/ok"),
        src("BBC Sport", "https://www.bbc.co.uk@evil.example/x"),
        src("BBC Sport", "https://www.bbc.co.uk/a b"),
      ],
    });
    const { errors } = gate({
      news: [
        {
          file: `data/news/${TODAY}.json`,
          value: newsFile(TODAY, [...cards(11), bad]),
        },
      ],
    });
    expect(errors).toEqual([
      "data/news/2026-10-17.json:cards[11].src[1].u — 링크 형식 오류(c_0000000032) — 사용자 정보(user@host) 포함 — 표시와 실제 호스트가 달라 보일 수 있음",
      "data/news/2026-10-17.json:cards[11].src[2].u — 링크 형식 오류(c_0000000032) — 공백 문자 포함",
    ]);
    expect(errors.join("\n")).not.toContain("evil.example");
  });
});

describe("④ 미래 날짜 파일", () => {
  it("뉴스·브리핑 파일 date > KST 오늘이면 오류, 오늘은 통과", () => {
    const brief = BriefFileSchema.parse({
      date: "2026-10-18",
      generatedAt: "2026-10-16T21:31:00.000Z",
      runId: "r",
      mode: "empty",
      lines: [],
    });
    const { errors } = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(12)) },
        {
          file: "data/news/2026-10-18.json",
          value: newsFile("2026-10-18", cards(12)),
        },
      ],
      briefs: [{ file: "data/briefs/2026-10-18.json", value: brief }],
    });
    expect(errors).toEqual([
      "data/news/2026-10-18.json:date — 미래 날짜 파일 — date 2026-10-18 > 오늘 2026-10-17(KST). 최신 호로 홈을 차지한다(실행 시계 확인)",
      "data/briefs/2026-10-18.json:date — 미래 날짜 파일 — date 2026-10-18 > 오늘 2026-10-17(KST). 최신 호로 홈을 차지한다(실행 시계 확인)",
    ]);
  });

  it("KST 경계 — 14:59:59Z는 그날, 15:00Z부터 다음 날이 오늘", () => {
    const file = {
      file: "data/news/2026-10-18.json",
      value: newsFile("2026-10-18", cards(12)),
    };
    expect(
      gate({ now: "2026-10-17T14:59:59.000Z", news: [file] }).errors,
    ).toHaveLength(1);
    expect(
      gate({ now: "2026-10-17T15:00:00.000Z", news: [file] }).errors,
    ).toEqual([]);
  });
});

describe("⑥⑦⑧⑨ 경고 — 통과(다음 수집 실행이 지운다)", () => {
  it("삭제 요청 카드가 남아 있으면 파일마다 경고(같은 ID 여러 날짜), 오류 아님", () => {
    const dup = card(7);
    const { errors, warns } = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(12)) },
        {
          file: "data/news/2026-10-12.json",
          value: newsFile("2026-10-12", [card(100), dup]),
        },
        {
          file: "data/news/2026-10-13.json",
          value: newsFile("2026-10-13", [dup]),
        },
      ],
      takedowns: [
        {
          id: dup.id,
          requestedAt: "2026-10-16T22:00:00Z",
          handledAt: null,
          reason: "삭제 요청 (#1)",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(warns).toEqual([
      "data/news/2026-10-12.json:cards[1] — 삭제 요청 카드 c_0000000007가 남아 있음 — 빌드에서는 이미 제외, 다음 수집 실행이 원본을 지운다(FR-143)",
      "data/news/2026-10-13.json:cards[0] — 삭제 요청 카드 c_0000000007가 남아 있음 — 빌드에서는 이미 제외, 다음 수집 실행이 원본을 지운다(FR-143)",
      // 오늘 파일 cards(12)에도 같은 ID(c_…07)가 있다
      "data/news/2026-10-17.json:cards[6] — 삭제 요청 카드 c_0000000007가 남아 있음 — 빌드에서는 이미 제외, 다음 수집 실행이 원본을 지운다(FR-143)",
    ]);
  });

  it("접수 후 72시간이 지났는데 handledAt이 null이면 경고(정확히 72시간은 아직)", () => {
    const takedown = (requestedAt: string) => ({
      id: "c_9999999999",
      requestedAt,
      handledAt: null,
      reason: "삭제 요청 (#2)",
    });
    const at72 = new Date(Date.parse(NOW) - 72 * 3600 * 1000).toISOString();
    const over = new Date(Date.parse(NOW) - 73 * 3600 * 1000).toISOString();
    expect(gate({ takedowns: [takedown(at72)] }).warns).toEqual([]);
    expect(gate({ takedowns: [takedown(over)] }).warns).toEqual([
      "configs/takedowns.json:[0].handledAt — 삭제 요청 c_9999999999 접수 후 73시간 — 72시간 기준(FR-143)을 넘었는데 handledAt이 null. 배포 확인 후 기록할 것(/takedown)",
    ]);
    expect(
      gate({ takedowns: [{ ...takedown(over), handledAt: NOW }] }).warns,
    ).toEqual([]);
  });

  it("보존 기간이 지난 출처가 남아 있으면 경고(대표면 카드, 아니면 출처) — 저장소 sources.json의 The Athletic 7일", () => {
    const old = "2026-10-09T20:00:00.000Z"; // + 7일 = 10-16T20:00Z < NOW
    const lead = card(201, {
      src: [src("The Athletic", "https://www.nytimes.com/athletic/1/", old)],
      created: "2026-10-09T21:30:00.000Z",
    });
    const tail = card(202, {
      src: [
        src("BBC Sport", "https://www.bbc.co.uk/sport/202", old),
        src("The Athletic", "https://www.nytimes.com/athletic/2/", old),
      ],
      created: "2026-10-09T21:30:00.000Z",
    });
    const { errors, warns } = gate({
      news: [
        { file: `data/news/${TODAY}.json`, value: newsFile(TODAY, cards(12)) },
        {
          file: "data/news/2026-10-10.json",
          value: newsFile("2026-10-10", [lead, tail]),
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(warns).toEqual([
      "data/news/2026-10-10.json:cards[0] — 보존 기간이 지난 대표 출처(The Athletic — 만료 2026-10-16T20:00:00.000Z) 카드 c_00000000c9가 남아 있음 — 다음 수집 실행이 카드를 지운다(D32)",
      "data/news/2026-10-10.json:cards[1].src[1] — 보존 기간이 지난 출처(The Athletic — 만료 2026-10-16T20:00:00.000Z)가 카드 c_00000000ca에 남아 있음 — 다음 수집 실행이 그 출처를 지운다(D32)",
    ]);
    // 시각이 없으면 보존 기간은 보지 않는다
    expect(
      gate({
        now: undefined,
        news: [
          {
            file: "data/news/2026-10-10.json",
            value: newsFile("2026-10-10", [lead, tail]),
          },
        ],
      }).warns,
    ).toEqual([]);
  });

  it("게이트는 여유 없이 정확한 만료 시각 — 수집 실행이 미리 지울(30시간 안 만료) 출처는 아직 경고하지 않는다", () => {
    const at = (iso: string) =>
      card(203, {
        src: [src("The Athletic", "https://www.nytimes.com/athletic/3/", iso)],
        created: iso,
      });
    const file = (c: NewsCard) => ({
      file: "data/news/2026-10-10.json",
      value: newsFile("2026-10-10", [c]),
    });
    // NOW + 1분에 만료 — 수집 실행(여유 30시간)이면 지웠을 출처, 게이트는 아직 경고하지 않음
    const soon = new Date(Date.parse(NOW) + 60_000 - 7 * DAY_MS).toISOString();
    expect(gate({ news: [file(at(soon))] }).warns).toEqual([]);
    // 정확히 만료 시각이면 경고
    const exact = new Date(Date.parse(NOW) - 7 * DAY_MS).toISOString();
    expect(gate({ news: [file(at(exact))] }).warns).toHaveLength(1);
  });

  it("카드 출처 매체명이 sources.json에 없으면 파일·매체명마다 1건 경고", () => {
    const renamed = [
      card(301, {
        src: [src("Athletic FC", "https://www.nytimes.com/athletic/301/")],
      }),
      card(302, {
        src: [src("Athletic FC", "https://www.nytimes.com/athletic/302/")],
      }),
    ];
    const { warns } = gate({
      news: [
        {
          file: `data/news/${TODAY}.json`,
          value: newsFile(TODAY, [...cards(10), ...renamed]),
        },
      ],
    });
    expect(warns).toEqual([
      'data/news/2026-10-17.json — 출처 매체명 "Athletic FC"(2건)이 sources.json 어느 소스의 매체명과도 다름 — 보존 기간을 매체명으로 찾으므로(D32) 소스 이름을 바꿨다면 옛 카드가 삭제에서 빠진다',
    ]);
  });

  it("저장소 data/news 실데이터(2026-10-12~14) 매체명은 모두 sources.json에 있다", () => {
    const files = ["2026-10-12", "2026-10-13", "2026-10-14"].flatMap((date) => {
      try {
        const value = NewsFileSchema.parse(
          JSON.parse(
            readFileSync(path.join(ROOT, "data/news", `${date}.json`), "utf8"),
          ),
        );
        return [{ file: `data/news/${date}.json`, value }];
      } catch {
        return []; // 보존 기간 정리 등으로 파일이 바뀌어도 이 테스트는 매체명만 본다
      }
    });
    const { errors, warns } = gate({ news: files, now: undefined });
    expect(errors).toEqual([]);
    expect(warns).toEqual([]);
  });
});

describe("pickGateInput", () => {
  it("일별 뉴스·브리핑 경로와 configs 값만 고른다(월별 병합 파일·다른 data는 제외)", () => {
    const news = newsFile(TODAY, cards(1));
    const parsed = new Map<string, unknown>([
      [`data/news/${TODAY}.json`, news],
      ["data/news/2026-10.json", { ignored: true }],
      ["data/runs.json", []],
      ["configs/sources.json", SOURCES],
      ["configs/competitions.json", COMPETITIONS],
      ["configs/takedowns.json", []],
    ]);
    const input = pickGateInput(parsed, {
      newsPaths: [`data/news/${TODAY}.json`],
      now: NOW,
    });
    expect(input.news).toEqual([
      { file: `data/news/${TODAY}.json`, value: news },
    ]);
    expect(input.briefs).toEqual([]);
    expect(input.sources).toBe(SOURCES);
    expect(input.competitions).toBe(COMPETITIONS);
    expect(input.takedowns).toEqual([]);
    expect(input.nationalTeam).toBeUndefined();
    expect(input.now).toBe(NOW);
    expect("publishDate" in input).toBe(false);
  });
});
