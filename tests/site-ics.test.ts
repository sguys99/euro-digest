/**
 * 사이트 .ics 캘린더 (FR-59·FR-83·FR-115·FR-123, plan M4-12) — scripts/lib/site-ics.ts 순수 함수.
 * 생성한 문자열은 아래 최소 파서(줄 펴기 → 속성 분해 → TEXT 언이스케이프)로 다시 읽어 왕복 확인한다(새 의존성 없음). 네트워크·LLM 없음.
 */
import { describe, expect, it } from "vitest";

import type { TeamView } from "@/lib/competition-view";
import { createPaths } from "@/lib/paths";
import type { Match } from "@/lib/schema/competition";
import type { NationalMatch } from "@/lib/schema/configs";

import {
  ICS_LINE_OCTETS,
  KOREAN_PAST_DAYS,
  UID_DOMAIN,
  buildSiteCalendars,
  escapeIcsText,
  eventUid,
  foldIcsLine,
  serializeIcs,
  type CalendarFile,
  type CalendarInput,
  type IcsCompetitionData,
} from "../scripts/lib/site-ics";

// ─── 최소 iCalendar 파서(테스트 전용) ───────────────────────────────────────

interface Prop {
  name: string;
  params: string;
  value: string;
}

/** TEXT 언이스케이프(RFC 5545 §3.3.11) */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === "n" || c === "N" ? "\n" : c,
  );
}

/** 줄 펴기(CRLF + 공백/탭 제거) → 속성 목록 */
function parseLines(ics: string): Prop[] {
  expect(ics.endsWith("\r\n")).toBe(true);
  expect(/[^\r]\n/.test(ics)).toBe(false); // 맨 LF 없음
  return ics
    .replace(/\r\n[ \t]/g, "")
    .split("\r\n")
    .filter((l) => l !== "")
    .map((line) => {
      const colon = line.indexOf(":");
      expect(colon).toBeGreaterThan(0);
      const head = line.slice(0, colon);
      const semi = head.indexOf(";");
      return {
        name: semi === -1 ? head : head.slice(0, semi),
        params: semi === -1 ? "" : head.slice(semi + 1),
        value: line.slice(colon + 1),
      };
    });
}

interface ParsedCalendar {
  props: Map<string, string>;
  events: Array<Map<string, Prop>>;
}

/** VCALENDAR 1개 + VEVENT들 — BEGIN/END 짝·필수 속성 검사 */
function parseCalendar(ics: string): ParsedCalendar {
  const lines = parseLines(ics);
  expect(lines[0]).toMatchObject({ name: "BEGIN", value: "VCALENDAR" });
  expect(lines.at(-1)).toMatchObject({ name: "END", value: "VCALENDAR" });
  const props = new Map<string, string>();
  const events: Array<Map<string, Prop>> = [];
  let current: Map<string, Prop> | null = null;
  for (const p of lines.slice(1, -1)) {
    if (p.name === "BEGIN") {
      expect(p.value).toBe("VEVENT");
      expect(current).toBeNull();
      current = new Map();
    } else if (p.name === "END") {
      expect(p.value).toBe("VEVENT");
      expect(current).not.toBeNull();
      if (current) events.push(current);
      current = null;
    } else if (current) {
      expect(current.has(p.name)).toBe(false); // 같은 속성 두 번 없음
      current.set(p.name, p);
    } else {
      props.set(p.name, p.value);
    }
  }
  expect(current).toBeNull();
  expect(props.get("VERSION")).toBe("2.0");
  expect(props.get("PRODID")).toBeTruthy();
  for (const e of events) {
    for (const key of [
      "UID",
      "DTSTAMP",
      "DTSTART",
      "DTEND",
      "SUMMARY",
      "STATUS",
    ]) {
      expect(e.has(key), key).toBe(true);
    }
  }
  return { props, events };
}

const text = (e: Map<string, Prop>, key: string): string =>
  unescapeText(e.get(key)?.value ?? "");

/** 물리 줄마다 UTF-8 75옥텟 이하·다바이트 문자 안 잘림 */
function expectFolded(ics: string): void {
  for (const line of ics.split("\r\n")) {
    const bytes = Buffer.from(line, "utf8");
    expect(bytes.length).toBeLessThanOrEqual(ICS_LINE_OCTETS);
  }
}

// ─── 입력 ───────────────────────────────────────────────────────────────────

const PATHS = createPaths({ basePath: "/euro-digest", siteUrl: undefined });

const NAMES: Record<string, string> = {
  brentford: "브렌트퍼드",
  brighton: "브라이턴",
  "bayern-munchen": "바이에른 뮌헨",
  "atletico-madrid": "아틀레티코 마드리드",
  mainz: "마인츠",
  freiburg: "프라이부르크",
  "real-oviedo": "레알 오비에도",
};

function lookup(slug: string): TeamView {
  const name = NAMES[slug];
  return {
    slug,
    name: name ?? slug,
    latin: name === undefined,
    short: "",
    colors: null,
  };
}

function match(
  m: Partial<Match> & Pick<Match, "id" | "comp" | "kickoff" | "home" | "away">,
): Match {
  return { round: "10", score: null, status: "scheduled", ...m };
}

const EPL: IcsCompetitionData = {
  comp: "EPL",
  provider: "football-data",
  updatedAt: "2026-11-01T22:15:08.393Z",
  matches: [
    match({
      id: "fd-1",
      comp: "EPL",
      kickoff: "2026-10-18T14:00:00Z",
      home: "brentford",
      away: "brighton",
      score: { h: 2, a: 1 },
      status: "finished",
    }),
    match({
      id: "fd-2",
      comp: "EPL",
      kickoff: "2026-11-08T14:00:00Z",
      home: "brighton",
      away: "brentford",
    }),
    // 임시 킥오프 — 15:00Z는 KST로 다음 날 00:00
    match({
      id: "fd-3",
      comp: "EPL",
      round: "21",
      kickoff: "2027-01-16T15:00:00Z",
      home: "brentford",
      away: "brighton",
      tbc: true,
    }),
    match({
      id: "fd-4",
      comp: "EPL",
      kickoff: "2026-11-22T15:00:00Z",
      home: "brentford",
      away: "brighton",
      status: "postponed",
    }),
  ],
};

const BUNDESLIGA: IcsCompetitionData = {
  comp: "BUNDESLIGA",
  provider: "football-data",
  updatedAt: "2026-11-01T22:16:14.261Z",
  matches: [
    // 서머타임 끝나기 전 토요일 15:30 CEST = 13:30Z = 22:30 KST
    match({
      id: "fd-10",
      comp: "BUNDESLIGA",
      round: "7",
      kickoff: "2026-10-24T13:30:00Z",
      home: "bayern-munchen",
      away: "freiburg",
    }),
    // 서머타임 끝난 날(10-25 일) 15:30 CET = 14:30Z = 23:30 KST
    match({
      id: "fd-11",
      comp: "BUNDESLIGA",
      round: "8",
      kickoff: "2026-10-25T14:30:00Z",
      home: "mainz",
      away: "freiburg",
    }),
    match({
      id: "fd-12",
      comp: "BUNDESLIGA",
      round: "10",
      kickoff: "2026-11-07T14:30:00Z",
      home: "mainz",
      away: "bayern-munchen",
    }),
    // 서머타임 시작한 날(2027-03-28 일) 15:30 CEST = 13:30Z = 22:30 KST
    match({
      id: "fd-13",
      comp: "BUNDESLIGA",
      round: "27",
      kickoff: "2027-03-28T13:30:00Z",
      home: "bayern-munchen",
      away: "mainz",
    }),
  ],
};

const UCL: IcsCompetitionData = {
  comp: "UCL",
  provider: "football-data",
  updatedAt: "2026-11-01T22:17:51.285Z",
  matches: [
    match({
      id: "fd-20",
      comp: "UCL",
      round: "4",
      kickoff: "2026-11-03T20:00:00Z",
      home: "atletico-madrid",
      away: "bayern-munchen",
    }),
  ],
};

const NATIONAL: NationalMatch[] = [
  {
    id: "2026-11-13-saudi-arabia",
    kickoff: "2026-11-13T14:30:00.000Z",
    kickoffTbd: false,
    opponent: "사우디아라비아",
    home: false,
    venue: "도하 (카타르)",
    competition: "친선경기",
    status: "scheduled",
    result: null,
    sourceUrl: "https://example.com/kfa?a=1&b=2",
  },
  {
    id: "2026-11-17-qatar",
    kickoff: "2026-11-17T00:00:00.000Z",
    kickoffTbd: true,
    opponent: "카타르",
    home: false,
    competition: "친선경기",
    status: "scheduled",
    result: null,
  },
  {
    id: "2026-10-14-paraguay",
    kickoff: "2026-10-14T11:00:00.000Z",
    kickoffTbd: false,
    opponent: "파라과이",
    home: true,
    competition: "친선경기",
    status: "finished",
    result: { kor: 2, opp: 0 },
  },
];

function input(overrides: Partial<CalendarInput> = {}): CalendarInput {
  return {
    competitions: [
      { id: "EPL", nameKo: "프리미어리그", shortKo: "EPL" },
      { id: "BUNDESLIGA", nameKo: "분데스리가", shortKo: "분데스" },
      { id: "UCL", nameKo: "챔피언스리그", shortKo: "UCL" },
    ],
    data: [EPL, BUNDESLIGA, UCL],
    teams: [
      "brentford",
      "bayern-munchen",
      "atletico-madrid",
      "mainz",
      "empty-fc",
    ],
    team: lookup,
    teamNameKo: (en) => (en === "Real Oviedo" ? "레알 오비에도" : null),
    competitionNameKo: (en) => (en === "Copa del Rey" ? "코파 델 레이" : null),
    players: [
      {
        slug: "lee-kang-in",
        nameKo: "이강인",
        team: "atletico-madrid",
        active: true,
      },
      {
        slug: "kim-min-jae",
        nameKo: "김민재",
        team: "bayern-munchen",
        active: true,
      },
      { slug: "lee-jae-sung", nameKo: "이재성", team: "mainz", active: true },
      // 같은 팀 두 번째 한국 선수(가상) — 경기는 한 번, 이름은 둘
      {
        slug: "test-player",
        nameKo: "테스트",
        team: "bayern-munchen",
        active: true,
      },
      // 비활성 — 소속팀(브렌트퍼드) 경기는 묶음에 들어가지 않는다
      { slug: "inactive", nameKo: "비활성", team: "brentford", active: false },
    ],
    korean: {
      generatedAt: "2026-11-01T22:18:18.461Z",
      players: [
        // 대회 데이터에 같은 id → 묶음·경기별 파일 모두 한 번
        {
          slug: "kim-min-jae",
          team: "bayern-munchen",
          next: {
            matchId: "fd-20",
            comp: "UCL",
            kickoff: "2026-11-03T20:00:00Z",
            opponent: {
              slug: "atletico-madrid",
              name: "Club Atlético de Madrid",
            },
            home: false,
          },
        },
        // 컵(대회 데이터 밖) — 묶음 + 경기별 파일
        {
          slug: "lee-kang-in",
          team: "atletico-madrid",
          next: {
            matchId: "af-999",
            comp: "OTHER",
            leagueRaw: "Copa del Rey",
            kickoff: "2026-12-02T18:00:00Z",
            opponent: { slug: null, name: "Real Oviedo" },
            home: false,
          },
        },
        // 다른 id지만 같은 경기(킥오프 3시간 안 + 같은 두 팀) — 묶음에서는 한 번
        {
          slug: "lee-jae-sung",
          team: "mainz",
          next: {
            matchId: "af-555",
            comp: "BUNDESLIGA",
            kickoff: "2026-11-07T14:30:00Z",
            opponent: { slug: "bayern-munchen", name: "FC Bayern München" },
            home: true,
          },
        },
        { slug: "test-player", team: "bayern-munchen", next: null },
      ],
    },
    national: NATIONAL,
    paths: PATHS,
    ...overrides,
  };
}

function fileAt(files: CalendarFile[], path: string): CalendarFile {
  const f = files.find((x) => x.path === path);
  if (!f) throw new Error(`없는 파일: ${path}`);
  return f;
}

function eventById(cal: ParsedCalendar, id: string): Map<string, Prop> {
  const e = cal.events.find((x) => x.get("UID")?.value === eventUid(id));
  if (!e) throw new Error(`없는 일정: ${id}`);
  return e;
}

// ─── 형식 ───────────────────────────────────────────────────────────────────

describe("RFC 5545 형식", () => {
  it("TEXT 이스케이프 — \\ ; , 개행(CRLF·CR 포함), 제어 문자 제거, 탭 유지", () => {
    expect(escapeIcsText("a,b;c\\d\ne\r\nf\rg\u0007h\ti\u0085")).toBe(
      "a\\,b\\;c\\\\d\\ne\\nf\\ng" + "h\ti",
    );
    expect(unescapeText(escapeIcsText("홈, 원정; 경로\\a\n둘째 줄"))).toBe(
      "홈, 원정; 경로\\a\n둘째 줄",
    );
  });

  it("줄 접기 — ASCII 75옥텟, 이어지는 줄은 공백 + 74옥텟", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    for (const p of parts.slice(1)) {
      expect(p.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldIcsLine("SUMMARY:짧음")).toBe("SUMMARY:짧음");
  });

  it("줄 접기 — 한글(3바이트)·이모지(4바이트)를 가운데서 자르지 않는다", () => {
    const line = `SUMMARY:${"한국어".repeat(40)}⚽🇰🇷${"가".repeat(30)}`;
    const folded = foldIcsLine(line);
    for (const p of folded.split("\r\n")) {
      const bytes = Buffer.from(p, "utf8");
      expect(bytes.length).toBeLessThanOrEqual(75);
      // 다시 디코드해도 같음 = 잘린 다바이트 문자·짝 없는 서로게이트 없음
      expect(bytes.toString("utf8")).toBe(p);
      expect(p).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("serializeIcs — 줄마다 CRLF, 끝 CRLF", () => {
    expect(serializeIcs(["BEGIN:VCALENDAR", "END:VCALENDAR"])).toBe(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    );
  });

  it("생성한 모든 파일 — 왕복 파싱·75옥텟·CRLF", () => {
    const files = buildSiteCalendars(input());
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expectFolded(f.ics);
      const cal = parseCalendar(f.ics);
      expect(cal.events).toHaveLength(f.events);
    }
  });
});

// ─── 파일 구성 ──────────────────────────────────────────────────────────────

describe("파일 구성", () => {
  const files = buildSiteCalendars(input());

  it("팀별(입력 teams 순서) → 묶음 → 경기별, 경로는 artifacts.calendar", () => {
    expect(
      files.filter((f) => f.feed.kind === "team").map((f) => f.path),
    ).toEqual([
      "/calendar/brentford.ics",
      "/calendar/bayern-munchen.ics",
      "/calendar/atletico-madrid.ics",
      "/calendar/mainz.ics",
      "/calendar/empty-fc.ics",
    ]);
    expect(
      files.filter((f) => f.feed.kind === "korean").map((f) => f.path),
    ).toEqual(["/calendar/korean.ics"]);
    expect(
      files.filter((f) => f.feed.kind === "match").map((f) => f.path),
    ).toEqual([
      "/calendar/match/fd-10.ics",
      "/calendar/match/fd-11.ics",
      "/calendar/match/fd-20.ics",
      "/calendar/match/af-555.ics",
      "/calendar/match/fd-12.ics",
      "/calendar/match/fd-2.ics",
      "/calendar/match/2026-11-13-saudi-arabia.ics",
      "/calendar/match/2026-11-17-qatar.ics",
      "/calendar/match/af-999.ics",
      "/calendar/match/fd-3.ics",
      "/calendar/match/fd-13.ics",
    ]);
  });

  it("경기 없는 팀도 유효한 빈 캘린더(구독 링크 404 방지)", () => {
    const f = fileAt(files, "/calendar/empty-fc.ics");
    expect(f.events).toBe(0);
    const cal = parseCalendar(f.ics);
    expect(cal.events).toHaveLength(0);
    expect(unescapeText(cal.props.get("X-WR-CALNAME") ?? "")).toBe(
      "empty-fc 경기 일정 · 유로 다이제스트",
    );
  });

  it("빈 데이터 — 팀·묶음은 빈 캘린더, 경기별은 대표팀만", () => {
    const empty = buildSiteCalendars(
      input({ data: [], korean: null, national: [] }),
    );
    expect(empty.filter((f) => f.feed.kind === "match")).toHaveLength(0);
    for (const f of empty) {
      expect(f.events).toBe(0);
      parseCalendar(f.ics);
    }
  });

  it("대표팀 id가 경기 id와 겹치면 던진다", () => {
    const clash = { ...NATIONAL[0]!, id: "fd-2" };
    expect(() => buildSiteCalendars(input({ national: [clash] }))).toThrow(
      /겹침/,
    );
  });
});

// ─── 팀별 ───────────────────────────────────────────────────────────────────

describe("팀별 캘린더", () => {
  const files = buildSiteCalendars(input());
  const brentford = parseCalendar(fileAt(files, "/calendar/brentford.ics").ics);

  it("시즌 전체(종료·예정·임시·연기) 킥오프 순, 결과는 싣지 않음", () => {
    expect(brentford.events.map((e) => e.get("UID")?.value)).toEqual(
      ["fd-1", "fd-2", "fd-4", "fd-3"].map(eventUid),
    );
    const finished = eventById(brentford, "fd-1");
    expect(finished.get("STATUS")?.value).toBe("CONFIRMED");
    expect(text(finished, "SUMMARY")).toBe("브렌트퍼드 vs 브라이턴 · EPL");
    expect(text(finished, "DESCRIPTION")).not.toMatch(/2\s*[-–:]\s*1/);
    expect(text(finished, "SUMMARY")).not.toMatch(/\d\s*[-–:]\s*\d/);
  });

  it("홈 먼저 + 대회 약칭, 설명은 대회·라운드·킥오프 KST·출처 표기", () => {
    const away = eventById(brentford, "fd-2");
    expect(text(away, "SUMMARY")).toBe("브라이턴 vs 브렌트퍼드 · EPL");
    expect(text(away, "DESCRIPTION")).toBe(
      [
        "프리미어리그 10라운드",
        "킥오프 11월 8일 (일) 23:00 KST",
        "Football data provided by the Football-Data.org API",
      ].join("\n"),
    );
    expect(text(away, "CATEGORIES")).toBe("프리미어리그");
    expect(away.get("TRANSP")?.value).toBe("TRANSPARENT");
    expect(away.get("URL")?.value).toBe(
      "https://sguys99.github.io/euro-digest/competitions/epl/",
    );
  });

  it("UTC Z 시각 + 기본 2시간, VTIMEZONE 없음", () => {
    const e = eventById(brentford, "fd-2");
    expect(e.get("DTSTART")?.value).toBe("20261108T140000Z");
    expect(e.get("DTEND")?.value).toBe("20261108T160000Z");
    expect(fileAt(files, "/calendar/brentford.ics").ics).not.toContain(
      "VTIMEZONE",
    );
  });

  it("킥오프 미정 — 종일(KST 날짜) + TENTATIVE + '(시각 미정)'", () => {
    const e = eventById(brentford, "fd-3");
    // 2027-01-16T15:00Z = 01-17 00:00 KST → 사이트 '01.17 임시'와 같은 날
    expect(e.get("DTSTART")).toEqual({
      name: "DTSTART",
      params: "VALUE=DATE",
      value: "20270117",
    });
    expect(e.get("DTEND")?.value).toBe("20270118");
    expect(e.get("STATUS")?.value).toBe("TENTATIVE");
    expect(text(e, "SUMMARY")).toBe("브렌트퍼드 vs 브라이턴 · EPL (시각 미정)");
    expect(text(e, "DESCRIPTION")).toContain("킥오프 시각 미정");
  });

  it("연기 — CANCELLED + '[연기]'", () => {
    const e = eventById(brentford, "fd-4");
    expect(e.get("STATUS")?.value).toBe("CANCELLED");
    expect(text(e, "SUMMARY")).toBe("[연기] 브렌트퍼드 vs 브라이턴 · EPL");
    expect(text(e, "DESCRIPTION")).toContain("경기 연기");
  });

  it("여러 대회 경기를 한 파일에(바이에른 — 분데스 + UCL)", () => {
    const bayern = parseCalendar(
      fileAt(files, "/calendar/bayern-munchen.ics").ics,
    );
    expect(bayern.events.map((e) => e.get("UID")?.value)).toEqual(
      ["fd-10", "fd-20", "fd-12", "fd-13"].map(eventUid),
    );
    expect(text(eventById(bayern, "fd-20"), "SUMMARY")).toBe(
      "아틀레티코 마드리드 vs 바이에른 뮌헨 · UCL",
    );
  });

  it("캘린더 머리 — 이름·설명·갱신 주기·페이지·자기 URL", () => {
    const f = fileAt(files, "/calendar/brentford.ics");
    const cal = parseCalendar(f.ics);
    expect(cal.props.get("METHOD")).toBe("PUBLISH");
    expect(unescapeText(cal.props.get("NAME") ?? "")).toBe(
      "브렌트퍼드 경기 일정 · 유로 다이제스트",
    );
    expect(cal.props.get("REFRESH-INTERVAL")).toBe("PT12H");
    expect(cal.props.get("X-PUBLISHED-TTL")).toBe("PT12H");
    expect(cal.props.get("URL")).toBe(
      "https://sguys99.github.io/euro-digest/teams/brentford/",
    );
    expect(cal.props.get("SOURCE")).toBe(
      "https://sguys99.github.io/euro-digest/calendar/brentford.ics",
    );
  });
});

// ─── 서머타임 ───────────────────────────────────────────────────────────────

describe("유럽 서머타임 전환 주말 — 저장 UTC 그대로, 설명 KST", () => {
  const files = buildSiteCalendars(input());
  const mainz = parseCalendar(fileAt(files, "/calendar/mainz.ics").ics);
  const bayern = parseCalendar(
    fileAt(files, "/calendar/bayern-munchen.ics").ics,
  );

  it.each([
    // [캘린더, id, DTSTART, DTEND, KST 설명]
    [
      "bayern",
      "fd-10",
      "20261024T133000Z",
      "20261024T153000Z",
      "10월 24일 (토) 22:30 KST",
    ],
    [
      "mainz",
      "fd-11",
      "20261025T143000Z",
      "20261025T163000Z",
      "10월 25일 (일) 23:30 KST",
    ],
    [
      "bayern",
      "fd-13",
      "20270328T133000Z",
      "20270328T153000Z",
      "3월 28일 (일) 22:30 KST",
    ],
  ] as const)("%s %s", (which, id, start, end, kst) => {
    const e = eventById(which === "mainz" ? mainz : bayern, id);
    expect(e.get("DTSTART")?.value).toBe(start);
    expect(e.get("DTEND")?.value).toBe(end);
    expect(text(e, "DESCRIPTION")).toContain(`킥오프 ${kst}`);
  });
});

// ─── 한국 선수 소속팀 묶음 ─────────────────────────────────────────────────

describe("한국 선수 소속팀 묶음", () => {
  const files = buildSiteCalendars(input());
  const korean = parseCalendar(fileAt(files, "/calendar/korean.ics").ics);
  const uids = korean.events.map((e) => e.get("UID")?.value);

  it("활성 선수 소속팀만, 같은 경기 한 번(두 소속팀 맞대결·같은 팀 두 선수·next 중복)", () => {
    expect(uids).toEqual(
      // fd-10·fd-11(10-24·10-25 오후)은 데이터 시각 − 7일(10-25T22:18Z) 전이라 빠진다
      ["fd-20", "fd-12", "af-999", "fd-13"].map(eventUid),
    );
    expect(new Set(uids).size).toBe(uids.length);
    // 비활성 선수 소속팀(브렌트퍼드) 경기 없음
    expect(uids).not.toContain(eventUid("fd-2"));
    // 다른 id로 온 같은 경기(af-555 = fd-12)는 대회 데이터 쪽 하나
    expect(uids).not.toContain(eventUid("af-555"));
  });

  it("제목 앞 [선수] — 두 팀의 활성 선수, 설정 순서", () => {
    expect(text(eventById(korean, "fd-20"), "SUMMARY")).toBe(
      "[이강인·김민재·테스트] 아틀레티코 마드리드 vs 바이에른 뮌헨 · UCL",
    );
    expect(text(eventById(korean, "fd-12"), "SUMMARY")).toBe(
      "[김민재·이재성·테스트] 마인츠 vs 바이에른 뮌헨 · 분데스",
    );
    expect(text(eventById(korean, "fd-12"), "DESCRIPTION")).toContain(
      "한국 선수 소속: 김민재(바이에른 뮌헨) · 이재성(마인츠) · 테스트(바이에른 뮌헨)",
    );
  });

  it("컵(대회 데이터 밖 next) — 사전 한글 대회·상대, API-Football 출처", () => {
    const e = eventById(korean, "af-999");
    expect(text(e, "SUMMARY")).toBe(
      "[이강인] 레알 오비에도 vs 아틀레티코 마드리드 · 코파 델 레이",
    );
    expect(text(e, "DESCRIPTION")).toBe(
      [
        "코파 델 레이",
        "킥오프 12월 3일 (목) 03:00 KST",
        "한국 선수 소속: 이강인(아틀레티코 마드리드)",
        "일정 데이터: API-Football",
      ].join("\n"),
    );
    expect(e.get("URL")?.value).toBe(
      "https://sguys99.github.io/euro-digest/korean-players/lee-kang-in/",
    );
  });

  it(`데이터 시각 기준 최근 ${KOREAN_PAST_DAYS}일 이전 경기는 싣지 않는다(지금 소속 표기라서)`, () => {
    const old = match({
      id: "fd-30",
      comp: "BUNDESLIGA",
      kickoff: "2026-10-25T14:29:59Z", // asOf 11-01T22:18:18 − 7일 = 10-25T22:18 이전
      home: "bayern-munchen",
      away: "freiburg",
    });
    const recent = match({
      id: "fd-31",
      comp: "BUNDESLIGA",
      kickoff: "2026-10-25T22:18:18.461Z", // 정확히 경계 — 포함
      home: "bayern-munchen",
      away: "freiburg",
    });
    const out = buildSiteCalendars(
      input({
        data: [EPL, { ...BUNDESLIGA, matches: [old, recent] }, UCL],
      }),
    );
    const k = parseCalendar(fileAt(out, "/calendar/korean.ics").ics);
    const ids = k.events.map((e) => e.get("UID")?.value);
    expect(ids).toContain(eventUid("fd-31"));
    expect(ids).not.toContain(eventUid("fd-30"));
    // 팀 캘린더는 시즌 전체
    const team = parseCalendar(fileAt(out, "/calendar/bayern-munchen.ics").ics);
    expect(team.events.map((e) => e.get("UID")?.value)).toContain(
      eventUid("fd-30"),
    );
  });

  it("현황 파일 소속팀이 설정과 다르면(이적 감지 중) 그 next는 쓰지 않는다", () => {
    const base = input();
    const korean2 = {
      generatedAt: base.korean!.generatedAt,
      players: base.korean!.players.map((p) =>
        p.slug === "lee-kang-in" ? { ...p, team: "real-oviedo" } : p,
      ),
    };
    const out = buildSiteCalendars(input({ korean: korean2 }));
    const k = parseCalendar(fileAt(out, "/calendar/korean.ics").ics);
    expect(k.events.map((e) => e.get("UID")?.value)).not.toContain(
      eventUid("af-999"),
    );
  });
});

// ─── 경기별 ─────────────────────────────────────────────────────────────────

describe("경기별 파일(캘린더에 추가)", () => {
  const files = buildSiteCalendars(input());

  it("데이터 scheduled 전부 — 종료·연기는 없음", () => {
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("/calendar/match/fd-1.ics");
    expect(paths).not.toContain("/calendar/match/fd-4.ics");
    // 지난 킥오프라도 상태가 scheduled면 만든다(지금 시각 무관 — 화면 경계와 어긋나지 않게)
    expect(paths).toContain("/calendar/match/fd-10.ics");
  });

  it("일정 1개, 가져오기용(이름·갱신 주기·TRANSP 없음)", () => {
    const cal = parseCalendar(fileAt(files, "/calendar/match/fd-2.ics").ics);
    expect(cal.events).toHaveLength(1);
    expect(cal.props.has("X-WR-CALNAME")).toBe(false);
    expect(cal.props.has("REFRESH-INTERVAL")).toBe(false);
    expect(cal.events[0]?.has("TRANSP")).toBe(false);
    expect(text(cal.events[0]!, "SUMMARY")).toBe(
      "브라이턴 vs 브렌트퍼드 · EPL",
    );
  });

  it("현황 파일 next — 대회 데이터에 없는 id만 따로(같은 경기 다른 id도 파일은 있다 — 화면 링크 404 방지)", () => {
    const cup = parseCalendar(fileAt(files, "/calendar/match/af-999.ics").ics);
    expect(text(cup.events[0]!, "SUMMARY")).toBe(
      "레알 오비에도 vs 아틀레티코 마드리드 · 코파 델 레이",
    );
    expect(
      files.filter((f) => f.path === "/calendar/match/fd-20.ics"),
    ).toHaveLength(1);
    fileAt(files, "/calendar/match/af-555.ics");
  });

  it("대표팀 — 예정만, 대진 순서·경기장·출처(이스케이프된 쿼리 문자열 왕복)", () => {
    const saudi = parseCalendar(
      fileAt(files, "/calendar/match/2026-11-13-saudi-arabia.ics").ics,
    ).events[0]!;
    expect(text(saudi, "SUMMARY")).toBe("사우디아라비아 vs 대한민국 · A매치");
    expect(text(saudi, "LOCATION")).toBe("도하 (카타르)");
    expect(text(saudi, "DESCRIPTION")).toBe(
      [
        "친선경기",
        "킥오프 11월 13일 (금) 23:30 KST",
        "일정 출처: https://example.com/kfa?a=1&b=2",
      ].join("\n"),
    );
    const qatar = parseCalendar(
      fileAt(files, "/calendar/match/2026-11-17-qatar.ics").ics,
    ).events[0]!;
    expect(qatar.get("DTSTART")).toMatchObject({
      params: "VALUE=DATE",
      value: "20261117",
    });
    expect(qatar.get("STATUS")?.value).toBe("TENTATIVE");
    expect(files.map((f) => f.path)).not.toContain(
      "/calendar/match/2026-10-14-paraguay.ics",
    );
  });
});

// ─── UID·결정성·basePath ────────────────────────────────────────────────────

describe("UID·결정성·basePath", () => {
  it("UID = 경기 id@상수 도메인 — 팀·묶음·경기별 파일에서 같다", () => {
    const files = buildSiteCalendars(input());
    const uid = `fd-20@${UID_DOMAIN}`;
    for (const path of [
      "/calendar/bayern-munchen.ics",
      "/calendar/atletico-madrid.ics",
      "/calendar/korean.ics",
      "/calendar/match/fd-20.ics",
    ]) {
      expect(fileAt(files, path).ics).toContain(`UID:${uid}\r\n`);
    }
  });

  it("같은 데이터면 같은 바이트 — 입력 순서와 무관, DTSTAMP = 데이터 시각 최댓값", () => {
    const a = buildSiteCalendars(input());
    const b = buildSiteCalendars(input({ data: [UCL, BUNDESLIGA, EPL] }));
    expect(b.map((f) => [f.path, f.ics])).toEqual(
      a.map((f) => [f.path, f.ics]),
    );
    // 현황 파일 generatedAt(22:18:18)이 가장 늦다
    expect(fileAt(a, "/calendar/match/fd-2.ics").ics).toContain(
      "DTSTAMP:20261101T221818Z\r\n",
    );
  });

  it("데이터 시각이 일정 내용과 무관하게 바뀌면 DTSTAMP만 바뀐다", () => {
    const a = fileAt(
      buildSiteCalendars(input()),
      "/calendar/match/fd-2.ics",
    ).ics;
    const b = fileAt(
      buildSiteCalendars(
        input({
          korean: { ...input().korean!, generatedAt: "2026-11-02T22:00:00Z" },
        }),
      ),
      "/calendar/match/fd-2.ics",
    ).ics;
    const strip = (s: string) => s.replace(/DTSTAMP:\d{8}T\d{6}Z/, "");
    expect(strip(b)).toBe(strip(a));
    expect(b).toContain("DTSTAMP:20261102T220000Z");
  });

  it("basePath — 파일 경로·UID는 같고 URL·SOURCE만 바뀐다", () => {
    const root = buildSiteCalendars(
      input({
        paths: createPaths({ basePath: "", siteUrl: "https://example.org" }),
      }),
    );
    const base = buildSiteCalendars(input());
    expect(root.map((f) => f.path)).toEqual(base.map((f) => f.path));
    const cal = parseCalendar(fileAt(root, "/calendar/brentford.ics").ics);
    expect(cal.props.get("SOURCE")).toBe(
      "https://example.org/calendar/brentford.ics",
    );
    expect(cal.props.get("URL")).toBe("https://example.org/teams/brentford/");
    expect(eventById(cal, "fd-2").get("URL")?.value).toBe(
      "https://example.org/competitions/epl/",
    );
    expect(fileAt(root, "/calendar/brentford.ics").ics).toContain(
      `UID:${eventUid("fd-2")}`,
    );
  });
});
