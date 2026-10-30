import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPETITION_STALE_HOURS,
  currentRoundOf,
  cutScorers,
  fallbackTeamName,
  formScopeOf,
  formView,
  goalDiffText,
  isCompetitionStale,
  matchExtraText,
  matchStateOf,
  recentMatchesOf,
  resultFor,
  roundAnchorId,
  roundKeyOf,
  roundStatusText,
  roundsOf,
  scorerViews,
  standingLines,
  statText,
  trendLegendText,
  trendOf,
  zoneBandOf,
  zoneRangeText,
  type TeamLookup,
} from "@/lib/competition-view";
import {
  displayNameIndex,
  foldName,
  isInitialForm,
  koreanDisplayName,
} from "@/lib/name-fold";
import { CompetitionsFileSchema } from "@/lib/schema/configs";
import type { Match, Scorer, StandingRow } from "@/lib/schema/competition";

// 대회 화면 모델(M2-10·M2-11 — PRD FR-41·FR-42·FR-44). 순수 함수 — 지금 시각은 고정 값으로 넣는다.

const team: TeamLookup = (slug) => ({
  slug,
  name: `팀-${slug}`,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: ["#123456", "#FFFFFF"],
});

const configs = CompetitionsFileSchema.parse(
  JSON.parse(readFileSync("configs/competitions.json", "utf8")),
);
const zonesOf = (id: string) => configs.find((c) => c.id === id)?.zones ?? [];

function row(
  pos: number,
  slug: string,
  extra: Partial<StandingRow> = {},
): StandingRow {
  return {
    pos,
    prevPos: null,
    team: slug,
    played: 8,
    w: 4,
    d: 2,
    l: 2,
    gf: 12,
    ga: 9,
    pts: 14,
    form: ["W", "D", "L", "W", "W"],
    zone: "none",
    ...extra,
  };
}

function match(over: Partial<Match> & Pick<Match, "id" | "kickoff">): Match {
  return {
    comp: "EPL",
    round: "1",
    home: "a",
    away: "b",
    score: null,
    status: "scheduled",
    ...over,
  };
}

const ms = (iso: string) => new Date(iso).getTime();

describe("trendOf — 전날 순위 대비(M2-03)", () => {
  it("상승·하락·변동 없음·자료 없음(prevPos null — '–'와 구별)", () => {
    expect(trendOf(3, 5)).toEqual({ kind: "up", by: 2 });
    expect(trendOf(7, 4)).toEqual({ kind: "down", by: 3 });
    expect(trendOf(2, 2)).toEqual({ kind: "same" });
    expect(trendOf(2, null)).toEqual({ kind: "none" });
  });

  it("범례 문구 — 한 행이라도 전날 자료가 있으면 '전날 대비'", () => {
    expect(trendLegendText([row(1, "a")])).toBe("전날 자료 없음");
    expect(trendLegendText([row(1, "a"), row(2, "b", { prevPos: 3 })])).toBe(
      "전날 대비",
    );
  });
});

describe("formView — 5칸, 오래된 → 최근(오른쪽이 최근)", () => {
  it("5경기 — 칸 그대로, 읽는 이름", () => {
    const v = formView(["W", "L", "W", "W", "D"], "리그");
    expect(v.cells).toEqual(["W", "L", "W", "W", "D"]);
    expect(v.label).toBe(
      "최근 리그 경기 5경기 (오래된 순): 승, 패, 승, 승, 무",
    );
  });

  it("모자란 칸은 앞쪽(오래된 쪽) 자료 없음", () => {
    const v = formView(["W", "L"], "UCL");
    expect(v.cells).toEqual([null, null, null, "W", "L"]);
    expect(v.count).toBe(2);
    expect(v.label).toBe(
      "최근 UCL 경기 자료 2경기 (오래된 순): 승, 패 — 나머지 3경기 자료 없음",
    );
  });

  it("0경기", () => {
    expect(formView([], "리그")).toEqual({
      cells: [null, null, null, null, null],
      count: 0,
      label: "최근 리그 경기 자료 없음",
    });
  });

  it("범위 이름 — UCL은 UCL 경기만, 리그는 '리그'", () => {
    expect(formScopeOf("UCL")).toBe("UCL");
    expect(formScopeOf("BUNDESLIGA")).toBe("리그");
  });
});

describe("구간 — competitions.json 실값(FR-42, M2-01)", () => {
  it("띠 모양: 강등 실선 · 강등 PO 점선 · 16강 직행 실선 · PO 점선", () => {
    const bl = zonesOf("BUNDESLIGA");
    expect(bl.map((r) => [r.label, zoneBandOf(r), zoneRangeText(r)])).toEqual([
      ["강등 PO", "relpo", "16위"],
      ["강등", "rel", "17–18위"],
    ]);
    const ucl = zonesOf("UCL");
    expect(ucl.map((r) => [r.label, zoneBandOf(r), zoneRangeText(r)])).toEqual([
      ["16강 직행", "ko", "1–8위"],
      ["PO", "po", "9–24위"],
    ]);
  });

  it("리그 — 구간 밖 위쪽 행에는 머리 줄이 없고, 강등 구간 첫 행 앞에 한 번", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i + 1, `t${i + 1}`));
    const lines = standingLines(rows, zonesOf("EPL"), team, "리그");
    const heads = lines.filter((l) => l.kind === "zone");
    expect(heads).toEqual([
      { kind: "zone", title: "강등 구간", range: "18–20위", band: "rel" },
    ]);
    const idx = lines.findIndex((l) => l.kind === "zone");
    const next = lines[idx + 1];
    expect(next?.kind === "row" && next.view.row.pos).toBe(18);
    expect(lines.filter((l) => l.kind === "row")).toHaveLength(20);
  });

  it("분데스리가 — 강등 PO(16위)·강등(17–18위) 머리 줄 둘", () => {
    const rows = Array.from({ length: 18 }, (_, i) => row(i + 1, `t${i + 1}`));
    const heads = standingLines(rows, zonesOf("BUNDESLIGA"), team, "리그")
      .filter((l) => l.kind === "zone")
      .map((l) => (l.kind === "zone" ? `${l.title} ${l.range}` : ""));
    expect(heads).toEqual(["강등 PO 구간 16위", "강등 구간 17–18위"]);
  });

  it("UCL — 16강 직행 · PO · 25위 아래 '구간 없음' 꼬리", () => {
    const rows = Array.from({ length: 36 }, (_, i) => row(i + 1, `t${i + 1}`));
    const lines = standingLines(rows, zonesOf("UCL"), team, "UCL");
    expect(
      lines
        .filter((l) => l.kind === "zone")
        .map((l) => (l.kind === "zone" ? [l.title, l.range, l.band] : [])),
    ).toEqual([
      ["16강 직행 구간", "1–8위", "ko"],
      ["PO 구간", "9–24위", "po"],
      ["구간 없음", "25위 아래", "none"],
    ]);
  });

  it("동순위는 같은 숫자 — 구간도 숫자로 판정(라리가 19위 2팀 모두 강등)", () => {
    const rows = [row(17, "a"), row(19, "b"), row(19, "c")];
    const views = standingLines(rows, zonesOf("LALIGA"), team, "리그").flatMap(
      (l) => (l.kind === "row" ? [[l.view.row.team, l.view.band]] : []),
    );
    expect(views).toEqual([
      ["a", null],
      ["b", "rel"],
      ["c", "rel"],
    ]);
  });
});

describe("득실 · 숫자 표기", () => {
  it("+n · 0 · −n(마이너스 기호)", () => {
    expect(goalDiffText(12, 4)).toBe("+8");
    expect(goalDiffText(3, 3)).toBe("0");
    expect(goalDiffText(2, 9)).toBe("−7");
  });

  it("자료 없는 값은 '–'(0으로 바꾸지 않는다)", () => {
    expect(statText(null)).toBe("–");
    expect(statText(0)).toBe("0");
  });
});

describe("경기 상태 — 예정·결과 대기·연기·임시(FR-44, D60, M2-02)", () => {
  const now = ms("2026-10-31T12:00:00Z");

  it("킥오프 + 3시간이 지났는데 scheduled면 결과 대기", () => {
    expect(
      matchStateOf(match({ id: "1", kickoff: "2026-10-31T08:00:00Z" }), now),
    ).toBe("pending");
    expect(
      matchStateOf(match({ id: "2", kickoff: "2026-10-31T10:00:00Z" }), now),
    ).toBe("scheduled");
  });

  it("임시 킥오프(tbc)는 결과 대기로 보지 않는다 · 연기 · 종료", () => {
    expect(
      matchStateOf(
        match({ id: "1", kickoff: "2026-10-01T00:00:00Z", tbc: true }),
        now,
      ),
    ).toBe("scheduled");
    expect(
      matchStateOf(
        match({
          id: "2",
          kickoff: "2026-10-01T00:00:00Z",
          status: "postponed",
        }),
        now,
      ),
    ).toBe("postponed");
    expect(
      matchStateOf(
        match({
          id: "3",
          kickoff: "2026-10-01T00:00:00Z",
          status: "finished",
          score: { h: 1, a: 0 },
        }),
        now,
      ),
    ).toBe("finished");
  });

  it("연장·승부차기 보조 문구", () => {
    const base = {
      id: "1",
      kickoff: "2027-03-10T20:00:00Z",
      status: "finished" as const,
    };
    expect(
      matchExtraText(match({ ...base, score: { h: 1, a: 1 } })),
    ).toBeNull();
    expect(
      matchExtraText(match({ ...base, score: { h: 2, a: 1, aet: true } })),
    ).toBe("연장");
    expect(
      matchExtraText(
        match({
          ...base,
          score: { h: 1, a: 1, aet: true, pens: { h: 4, a: 3 } },
        }),
      ),
    ).toBe("연장 · 승부차기 4–3");
  });
});

describe("resultFor · recentMatchesOf — 375 펼침 경기 목록", () => {
  const ms5 = [
    match({
      id: "m1",
      kickoff: "2026-09-01T19:00:00Z",
      status: "finished",
      home: "x",
      away: "y",
      score: { h: 2, a: 0 },
    }),
    match({
      id: "m2",
      kickoff: "2026-09-08T19:00:00Z",
      status: "finished",
      home: "z",
      away: "x",
      score: { h: 1, a: 0 },
    }),
    match({
      id: "m3",
      kickoff: "2026-09-15T19:00:00Z",
      status: "finished",
      home: "x",
      away: "z",
      score: { h: 1, a: 1, aet: true, pens: { h: 5, a: 4 } },
    }),
    match({ id: "m4", kickoff: "2026-09-22T19:00:00Z", home: "x", away: "y" }),
    match({
      id: "m0",
      kickoff: "2026-08-25T19:00:00Z",
      status: "finished",
      home: "y",
      away: "x",
      score: { h: 0, a: 3 },
    }),
  ];

  it("한 팀 입장 승·무·패 — 승부차기는 무(M2-03 폼과 같다)", () => {
    expect(resultFor(ms5[0]!, "x")).toBe("W");
    expect(resultFor(ms5[1]!, "x")).toBe("L");
    expect(resultFor(ms5[2]!, "x")).toBe("D");
    expect(resultFor(ms5[3]!, "x")).toBeNull();
  });

  it("종료 경기만, 오래된 → 최근, 최대 n", () => {
    expect(recentMatchesOf(ms5, "x").map((m) => m.id)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
    ]);
    expect(recentMatchesOf(ms5, "x", 2).map((m) => m.id)).toEqual(["m2", "m3"]);
  });
});

describe("라운드 — 키·묶기·지금 라운드(FR-44)", () => {
  it("숫자 라운드 · UCL 녹아웃(ko-*) 순서와 표기", () => {
    expect(roundKeyOf("9")).toEqual({
      order: 9,
      label: "9라운드",
      short: "9R",
    });
    expect(roundKeyOf("ko-r16-1")).toMatchObject({
      label: "16강 1차전",
      short: "16강 1",
    });
    expect(roundKeyOf("ko-final")).toMatchObject({
      label: "결승",
      short: "결승",
    });
    expect(roundKeyOf("ko-playoff-2").order).toBeLessThan(
      roundKeyOf("ko-r16-1").order,
    );
    expect(roundKeyOf("8").order).toBeLessThan(
      roundKeyOf("ko-playoff-1").order,
    );
    expect(roundAnchorId("ko-r16-1")).toBe("round-ko-r16-1");
  });

  const season = [
    match({
      id: "r1a",
      round: "1",
      kickoff: "2026-08-22T14:00:00Z",
      status: "finished",
      score: { h: 1, a: 0 },
    }),
    match({
      id: "r1b",
      round: "1",
      kickoff: "2026-08-23T23:30:00Z",
      status: "finished",
      score: { h: 0, a: 0 },
    }),
    // 연기돼 몇 주 뒤로 옮긴 경기 — 1라운드 주 기간에서 뺀다
    match({ id: "r1c", round: "1", kickoff: "2026-10-28T19:00:00Z" }),
    match({ id: "r10a", round: "10", kickoff: "2026-10-31T12:30:00Z" }),
    match({ id: "r10b", round: "10", kickoff: "2026-11-02T20:00:00Z" }),
    match({
      id: "r2a",
      round: "2",
      kickoff: "2026-08-29T14:00:00Z",
      status: "finished",
      score: { h: 2, a: 2 },
    }),
  ];

  it("라운드 순서(숫자), 날짜 머리는 KST 날짜(23:30Z → 다음 날)", () => {
    const rounds = roundsOf(season, team, ms("2026-10-30T00:00:00Z"));
    expect(rounds.map((r) => r.round)).toEqual(["1", "2", "10"]);
    const r1 = rounds[0]!;
    expect(r1.days.map((d) => d.label)).toEqual([
      "08.22 (토)",
      "08.24 (월)",
      "10.29 (목)",
    ]);
    expect(r1.range).toBe("08.22–08.24");
    expect([r1.finished, r1.upcoming]).toEqual([2, 1]);
    expect(rounds[2]!.days[0]!.matches[0]!.time).toBe("21:30");
  });

  it("지금 라운드 — 진행 중 · 다음 · 종료(연기 경기는 주 기간에서 빠진다)", () => {
    const rounds = roundsOf(season, team, 0);
    // 10.30 — 1라운드의 연기 경기(10.28)가 있어도 1라운드는 '진행 중'이 아니다 → 다음 10라운드
    const next = currentRoundOf(rounds, ms("2026-10-30T00:00:00Z"));
    expect(next).toEqual({ index: 2, state: "next" });
    expect(roundStatusText(rounds[2]!, "next")).toBe(
      "10라운드 10.31 (토) 시작",
    );
    // 11.01 — 10라운드 주 기간 안
    expect(currentRoundOf(rounds, ms("2026-11-01T10:00:00Z"))).toEqual({
      index: 2,
      state: "live",
    });
    expect(roundStatusText(rounds[2]!, "live")).toBe("10라운드 진행 중");
    // 시즌 뒤 — 마지막 라운드 종료
    expect(currentRoundOf(rounds, ms("2027-06-01T00:00:00Z"))).toEqual({
      index: 2,
      state: "done",
    });
    expect(currentRoundOf([], 0)).toBeNull();
  });

  it("임시 킥오프는 시각 대신 null('임시'), 결과 대기 판정은 빌드 시각 기준", () => {
    const rounds = roundsOf(
      [
        match({
          id: "t",
          round: "30",
          kickoff: "2027-04-03T00:00:00Z",
          tbc: true,
        }),
        match({ id: "p", round: "9", kickoff: "2026-10-30T19:00:00Z" }),
      ],
      team,
      ms("2026-10-31T00:00:00Z"),
    );
    expect(rounds[0]!.days[0]!.matches[0]!.state).toBe("pending");
    expect(rounds[1]!.days[0]!.matches[0]!.time).toBeNull();
  });
});

describe("득점 순위 — 공동 순위·자르기·선수명(D63 ①)", () => {
  const s = (player: string, goals: number): Scorer => ({
    player,
    team: "t",
    goals,
    assists: null,
    penalties: null,
    played: 8,
  });
  const list = [
    s("Erling Haaland", 9),
    s("A", 6),
    s("B", 5),
    s("C", 5),
    s("D", 5),
    s("E", 4),
  ];
  const ko = (en: string) => (en === "Erling Haaland" ? "엘링 홀란" : null);

  it("같은 골은 같은 순위, 사전 정확 일치만 한글(아니면 원어 + latin)", () => {
    const views = scorerViews(list, team, ko);
    expect(views.map((v) => [v.rank, v.name, v.latin])).toEqual([
      [1, "엘링 홀란", false],
      [2, "A", true],
      [3, "B", true],
      [3, "C", true],
      [3, "D", true],
      [6, "E", true],
    ]);
  });

  it("묶음을 자르면 '공동 n위 m명 중 k명', 순위 상한", () => {
    const views = scorerViews(list, team, ko);
    expect(cutScorers(views, 4)).toMatchObject({
      tieNote: "공동 3위 3명 중 2명",
    });
    expect(cutScorers(views, 5).tieNote).toBeNull();
    expect(cutScorers(views, 20, 3).rows).toHaveLength(5);
    expect(cutScorers([], 5)).toEqual({ rows: [], tieNote: null });
  });
});

describe("데이터 신선도 — '업데이트 지연'(M2-02)", () => {
  it(`updatedAt이 빌드 시각보다 ${COMPETITION_STALE_HOURS}시간 이상 오래되면 지연`, () => {
    const at = "2026-10-30T02:17:27.762Z";
    expect(isCompetitionStale(at, ms("2026-10-30T22:00:00Z"))).toBe(false);
    expect(isCompetitionStale(at, ms("2026-10-31T14:17:27.762Z"))).toBe(true);
  });
});

describe("이름 — 팀 폴백 · 선수 표시 이름(name-fold)", () => {
  it("사전에 없는 팀은 slug 단어를 편 원어", () => {
    expect(fallbackTeamName("paris-fc")).toBe("Paris Fc");
  });

  it("접기(악센트·대시·대소문자) 기준 정확 일치만, 첫 글자 축약은 쓰지 않는다", () => {
    const index = displayNameIndex(
      [
        {
          ko: "엘링 홀란",
          en: ["Erling Haaland", "E. Haaland"],
          kind: "player",
        },
        { ko: "주앙 페드루", en: ["João Pedro"], kind: "player" },
        { ko: "토트넘", en: ["Tottenham"], kind: "team" },
      ],
      "player",
    );
    expect(koreanDisplayName(index, "erling haaland")).toBe("엘링 홀란");
    expect(koreanDisplayName(index, "Joao Pedro")).toBe("주앙 페드루");
    expect(koreanDisplayName(index, "E. Haaland")).toBeNull();
    expect(koreanDisplayName(index, "Haaland")).toBeNull();
    expect(koreanDisplayName(index, "Tottenham")).toBeNull();
    expect(foldName("Kim Min–Jae")).toBe("kim min-jae");
    expect(isInitialForm("H. Kane")).toBe(true);
  });
});
