/**
 * M2-03 순위 보강(scripts/lib/standings-enrich.ts) — 최근 5경기 폼·전일 대비 순위(prevPos). 네트워크 없음.
 *
 * 필수 항목: 폼 순서(오래된 → 최근)·5경기 상한·경기 부족·승부차기(D)·연장 승부·종료 아닌 경기 제외·동순위, prevPos 같은 날 이어받기·
 * 다른 날 pos·첫 수집·시즌 전환·이전 파일에 없는 팀, KST 자정 경계(서머타임 전환 전후 수집 시각), 대회 파일 조립·단계 기본 보강,
 * 실데이터(data/competitions) 폼과 순위표 승무패 일치.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionFileSchema,
  type CompetitionFile,
  type Match,
  type StandingRow,
} from "@/lib/schema";

import { mergeCompetitionFile } from "../scripts/lib/competition-file";
import {
  enrichStandings,
  FORM_LENGTH,
  matchResultFor,
  reenrichCompetitionFile,
  standingsBaseline,
  teamForms,
} from "../scripts/lib/standings-enrich";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

let seq = 0;
/** 종료 경기 — kickoff 일수(2026-08-0n)로 순서를 준다 */
function fin(
  day: number,
  home: string,
  away: string,
  h: number,
  a: number,
  extra: Partial<NonNullable<Match["score"]>> = {},
  over: Partial<Match> = {},
): Match {
  seq += 1;
  return {
    id: `x${String(seq).padStart(4, "0")}`,
    comp: "EPL",
    round: String(day),
    kickoff: new Date(Date.UTC(2026, 7, day, 14)).toISOString(),
    home,
    away,
    score: { h, a, ...extra },
    status: "finished",
    ...over,
  };
}

function row(
  team: string,
  pos: number,
  over: Partial<StandingRow> = {},
): StandingRow {
  return {
    pos,
    prevPos: null,
    team,
    played: 0,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    pts: 0,
    form: [],
    zone: "none",
    ...over,
  };
}

function file(
  updatedAt: string,
  standings: StandingRow[],
  over: Partial<CompetitionFile> = {},
): CompetitionFile {
  return {
    comp: "EPL",
    season: 2026,
    provider: "football-data",
    updatedAt,
    standings,
    matches: [],
    scorers: [],
    ...over,
  };
}

describe("matchResultFor — 한 경기 결과", () => {
  it("홈·원정 시점, 무승부, 그 팀 경기가 아니면 null", () => {
    const m = fin(1, "a", "b", 2, 1);
    expect(matchResultFor(m, "a")).toBe("W");
    expect(matchResultFor(m, "b")).toBe("L");
    expect(matchResultFor(m, "c")).toBeNull();
    expect(matchResultFor(fin(1, "a", "b", 0, 0), "b")).toBe("D");
  });

  it("승부차기로 끝난 경기는 양쪽 모두 D(FIFA·UEFA 공식 기록 규칙 — 승부차기 승자도 W가 아니다)", () => {
    const m = fin(1, "a", "b", 1, 1, { aet: true, pens: { h: 4, a: 3 } });
    expect(matchResultFor(m, "a")).toBe("D");
    expect(matchResultFor(m, "b")).toBe("D");
  });

  it("연장 끝에 갈린 경기(aet만)는 스코어대로 W/L", () => {
    const m = fin(1, "a", "b", 1, 2, { aet: true });
    expect(matchResultFor(m, "a")).toBe("L");
    expect(matchResultFor(m, "b")).toBe("W");
  });

  it("종료가 아니거나 스코어가 없으면 null(예정·진행 중·연기)", () => {
    expect(
      matchResultFor(fin(1, "a", "b", 1, 0, {}, { status: "scheduled" }), "a"),
    ).toBeNull();
    expect(
      matchResultFor(fin(1, "a", "b", 1, 0, {}, { status: "postponed" }), "a"),
    ).toBeNull();
    expect(
      matchResultFor(fin(1, "a", "b", 1, 0, {}, { score: null }), "a"),
    ).toBeNull();
  });
});

describe("teamForms — 최근 5경기 폼", () => {
  it("오래된 → 최근 순(최근이 오른쪽), 배열 순서가 아니라 킥오프 순으로 정렬한다", () => {
    const forms = teamForms([
      fin(3, "a", "b", 0, 0), // D
      fin(1, "a", "c", 2, 0), // W
      fin(2, "d", "a", 1, 0), // L
    ]);
    expect(forms.get("a")).toEqual(["W", "L", "D"]);
  });

  it("5경기 상한 — 마지막 5경기만(가장 오래된 경기부터 버린다)", () => {
    const ms = [
      fin(1, "a", "b", 0, 1), // L (버려짐)
      fin(2, "a", "b", 0, 1), // L (버려짐)
      fin(3, "a", "b", 1, 0),
      fin(4, "a", "b", 1, 1),
      fin(5, "a", "b", 2, 0),
      fin(6, "a", "b", 0, 3),
      fin(7, "a", "b", 4, 0),
    ];
    expect(FORM_LENGTH).toBe(5);
    expect(teamForms(ms).get("a")).toEqual(["W", "D", "W", "L", "W"]);
    expect(teamForms(ms).get("b")).toEqual(["L", "D", "L", "W", "L"]);
  });

  it("경기 부족 — 치른 만큼만, 경기가 없는 팀은 키 없음", () => {
    const forms = teamForms([fin(1, "a", "b", 3, 3)]);
    expect(forms.get("a")).toEqual(["D"]);
    expect(forms.has("z")).toBe(false);
  });

  it("종료 아닌 경기·스코어 없는 경기는 칸을 차지하지 않는다", () => {
    const forms = teamForms([
      fin(1, "a", "b", 1, 0),
      fin(2, "a", "b", 0, 0, {}, { status: "scheduled", score: null }),
      fin(3, "a", "b", 0, 0, {}, { status: "postponed", score: null }),
      fin(4, "a", "b", 0, 2),
    ]);
    expect(forms.get("a")).toEqual(["W", "L"]);
  });

  it("같은 킥오프면 경기 id 순(결정적)", () => {
    const kickoff = "2026-08-01T14:00:00.000Z";
    const forms = teamForms([
      { ...fin(1, "a", "b", 0, 1), id: "m2", kickoff },
      { ...fin(1, "a", "c", 1, 0), id: "m1", kickoff },
    ]);
    expect(forms.get("a")).toEqual(["W", "L"]);
  });
});

describe("standingsBaseline·enrichStandings — 전일 대비 prevPos (DECISIONS D1 §6 #4)", () => {
  const previousRows = [
    row("a", 1, { prevPos: 3 }),
    row("b", 2, { prevPos: 1 }),
    row("c", 3, { prevPos: null }),
  ];

  it("이전 파일이 다른 KST 날짜면 이전 pos를 기준으로 쓴다", () => {
    // 10-29 07:10 KST 수집 → 10-30 07:10 KST 수집
    const prev = file("2026-10-28T22:10:00.000Z", previousRows);
    const out = enrichStandings({
      rows: [row("b", 1), row("a", 2), row("c", 3)],
      previous: prev,
      matches: [],
      fetchedAt: "2026-10-29T22:10:00.000Z",
    });
    expect(out.map((r) => [r.team, r.pos, r.prevPos])).toEqual([
      ["b", 1, 2],
      ["a", 2, 1],
      ["c", 3, 3],
    ]);
  });

  it("같은 KST 날짜에 다시 받으면 이전 파일의 prevPos를 이어받는다(기준이 흔들리지 않음 — null도 그대로)", () => {
    const prev = file("2026-10-29T22:10:00.000Z", previousRows); // 10-30 07:10 KST
    const out = enrichStandings({
      rows: [row("b", 1), row("a", 2), row("c", 3)],
      previous: prev,
      matches: [],
      fetchedAt: "2026-10-30T05:00:00.000Z", // 10-30 14:00 KST 재실행
    });
    expect(out.map((r) => [r.team, r.prevPos])).toEqual([
      ["b", 1],
      ["a", 3],
      ["c", null],
    ]);
  });

  it("같은 날 세 번째 실행도 첫 기준을 유지한다(연쇄)", () => {
    const first = file("2026-10-28T22:10:00.000Z", [row("a", 2), row("b", 1)]);
    const second = file(
      "2026-10-29T22:10:00.000Z",
      enrichStandings({
        rows: [row("a", 1), row("b", 2)],
        previous: first,
        matches: [],
        fetchedAt: "2026-10-29T22:10:00.000Z",
      }),
    );
    const third = enrichStandings({
      rows: [row("a", 1), row("b", 2)],
      previous: second,
      matches: [],
      fetchedAt: "2026-10-30T13:00:00.000Z", // 10-30 22:00 KST
    });
    expect(third.map((r) => r.prevPos)).toEqual([2, 1]);
  });

  it("첫 수집(이전 파일 없음)은 모두 null", () => {
    const out = enrichStandings({
      rows: [row("a", 1), row("b", 2)],
      previous: null,
      matches: [],
      fetchedAt: "2026-10-29T22:10:00.000Z",
    });
    expect(out.map((r) => r.prevPos)).toEqual([null, null]);
    expect(standingsBaseline(null, "2026-10-29T22:10:00.000Z").size).toBe(0);
  });

  it("이전 파일에 없는 팀(승격·대응표 변경)은 null", () => {
    const out = enrichStandings({
      rows: [row("a", 1), row("new", 2)],
      previous: file("2026-10-28T22:10:00.000Z", [row("a", 2)]),
      matches: [],
      fetchedAt: "2026-10-29T22:10:00.000Z",
    });
    expect(out.map((r) => r.prevPos)).toEqual([2, null]);
  });

  it("동순위 — 같은 pos 팀도 각자 자기 기준을 받는다, 이전에 공동이었으면 둘 다 같은 기준", () => {
    const out = enrichStandings({
      rows: [row("a", 3), row("b", 3), row("c", 5)],
      previous: file("2026-10-28T22:10:00.000Z", [
        row("c", 3),
        row("a", 4),
        row("b", 4),
      ]),
      matches: [],
      fetchedAt: "2026-10-29T22:10:00.000Z",
    });
    expect(out.map((r) => [r.team, r.pos, r.prevPos])).toEqual([
      ["a", 3, 4],
      ["b", 3, 4],
      ["c", 5, 3],
    ]);
  });

  describe("KST 자정 경계 — 유럽 서머타임 전환과 무관(KST 날짜만 본다)", () => {
    const prevAt = (updatedAt: string) =>
      file(updatedAt, [row("a", 2, { prevPos: 7 })]);
    const base = (updatedAt: string, at: string) =>
      standingsBaseline(prevAt(updatedAt), at).get("a");

    it("UTC 14:59:59 = KST 23:59:59(그날), UTC 15:00:00 = KST 다음 날 00:00", () => {
      expect(base("2026-10-29T15:00:00.000Z", "2026-10-30T14:59:59.000Z")).toBe(
        7,
      ); // 둘 다 KST 10-30 → 이어받기
      expect(base("2026-10-29T14:59:59.000Z", "2026-10-29T15:00:00.000Z")).toBe(
        2,
      ); // KST 10-29 23:59:59 → 10-30 00:00 — 1초 차이도 다른 날
    });

    it("서머타임 종료(2026-10-25) 전후 — 여름 06:30 수집 다음 날 겨울 07:10 수집은 다른 날, 같은 아침 백업은 같은 날", () => {
      // 10-25 06:30 KST(여름 슬롯) = 10-24T21:30Z → 10-26 07:10 KST(겨울 슬롯) = 10-25T22:10Z
      expect(base("2026-10-24T21:30:00.000Z", "2026-10-25T22:10:00.000Z")).toBe(
        2,
      );
      // 10-25 06:30 KST → 같은 아침 07:20 KST 백업(10-24T22:20Z)
      expect(base("2026-10-24T21:30:00.000Z", "2026-10-24T22:20:00.000Z")).toBe(
        7,
      );
    });

    it("서머타임 시작(2027-03-28) 전후 — 겨울 07:10 수집 다음 날 여름 06:30 수집은 다른 날", () => {
      // 03-28 07:10 KST = 03-27T22:10Z → 03-29 06:30 KST = 03-28T21:30Z (UTC 간격 23시간 20분)
      expect(base("2027-03-27T22:10:00.000Z", "2027-03-28T21:30:00.000Z")).toBe(
        2,
      );
    });
  });
});

describe("enrichStandings — 계약(행 순서·숫자 불변, prevPos·form만)", () => {
  it("행 순서·팀·숫자·구간을 그대로 두고 form은 그 팀 경기에서", () => {
    const rows = [
      row("a", 1, { played: 2, w: 1, d: 1, pts: 4, zone: "ucl" }),
      row("b", 2, { played: 2, l: 1, d: 1, pts: 1, zone: "relegation" }),
    ];
    const out = enrichStandings({
      rows,
      previous: null,
      matches: [fin(1, "a", "b", 1, 1), fin(2, "b", "a", 0, 2)],
      fetchedAt: "2026-10-29T22:10:00.000Z",
    });
    const fixed = (r: StandingRow) => ({ ...r, form: [], prevPos: null });
    expect(out.map(fixed)).toEqual(rows.map(fixed));
    expect(out.map((r) => r.form)).toEqual([
      ["D", "W"],
      ["D", "L"],
    ]);
    expect(rows[0]!.form).toEqual([]); // 입력을 바꾸지 않는다
  });

  it("mergeCompetitionFile에 넘기면 이번 수집 시각(fetchedAt)으로 같은 날을 판정한다", () => {
    const previous = file("2026-10-29T22:10:00.000Z", [
      row("a", 2, { prevPos: 4 }),
      row("b", 1, { prevPos: 1 }),
    ]);
    const parts = {
      standings: { ok: true as const, value: [row("a", 1), row("b", 2)] },
      matches: { ok: true as const, value: [fin(1, "a", "b", 2, 0)] },
      scorers: { ok: true as const, value: [] },
    };
    const comp = { id: "EPL" as const, season: 2026 };
    const sameDay = mergeCompetitionFile({
      comp,
      previous,
      parts,
      fetchedAt: "2026-10-30T03:00:00.000Z",
      enrichStandings,
    });
    const nextDay = mergeCompetitionFile({
      comp,
      previous,
      parts,
      fetchedAt: "2026-10-30T22:10:00.000Z",
      enrichStandings,
    });
    const seasonChange = mergeCompetitionFile({
      comp: { id: "EPL", season: 2027 },
      previous,
      parts,
      fetchedAt: "2026-10-30T22:10:00.000Z",
      enrichStandings,
    });
    if (
      sameDay.action !== "write" ||
      nextDay.action !== "write" ||
      seasonChange.action !== "write"
    )
      throw new Error("write 기대");
    expect(sameDay.file.standings.map((r) => r.prevPos)).toEqual([4, 1]);
    expect(nextDay.file.standings.map((r) => r.prevPos)).toEqual([2, 1]);
    // 시즌 전환 — 이전 파일을 쓰지 않는다(usablePrevious) → null
    expect(seasonChange.file.standings.map((r) => r.prevPos)).toEqual([
      null,
      null,
    ]);
    expect(nextDay.file.standings.map((r) => r.form)).toEqual([["W"], ["L"]]);
  });
});

describe("reenrichCompetitionFile — API 없이 다시 보강", () => {
  it("prevPos·updatedAt은 그대로, 폼만 다시 계산하고 두 번 돌려도 같다", () => {
    const f = file(
      "2026-10-30T02:17:27.762Z",
      [row("a", 1, { prevPos: 2 }), row("b", 2, { prevPos: null })],
      { matches: [fin(1, "a", "b", 1, 0), fin(2, "b", "a", 1, 1)] },
    );
    const once = reenrichCompetitionFile(f);
    expect(once.updatedAt).toBe(f.updatedAt);
    expect(once.standings.map((r) => [r.prevPos, r.form])).toEqual([
      [2, ["W", "D"]],
      [null, ["L", "D"]],
    ]);
    expect(reenrichCompetitionFile(once)).toEqual(once);
  });

  it("실데이터(data/competitions) — 순위 행의 폼은 그 파일 종료 경기의 마지막 5경기(보강을 거친 파일)", () => {
    // 순위표 승무패와의 일치는 진행 중 경기가 순위에 반영된 순간 받은 파일이면 어긋날 수 있어 여기서 고정하지 않는다
    // (2026-10-30 첫 적용 때 6개 대회 132팀 모두 일치 — 보고서)
    const dir = path.join(ROOT, "data/competitions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const f = CompetitionFileSchema.parse(
        JSON.parse(readFileSync(path.join(dir, name), "utf8")),
      );
      const all = teamForms(f.matches, Number.MAX_SAFE_INTEGER);
      for (const r of f.standings) {
        expect(r.form, `${name} ${r.team}`).toEqual(
          (all.get(r.team) ?? []).slice(-FORM_LENGTH),
        );
      }
    }
  });
});
