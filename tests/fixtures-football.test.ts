/**
 * fixtures/football/ 가드 (M0-35) — 축구 데이터 API 원본 응답 샘플이 공개 저장소 규칙을 지키고,
 * index.json 메타가 실제 파일과 맞는지 검사한다.
 *
 * - 이미지 URL이 없다: 이미지 키(crest·emblem·flag·logo·photo) 값은 null이거나
 *   `logo-key-kept` 파일에서만 자리값(example.invalid)이다 (CLAUDE.md §1-6).
 * - 배당(odds)·요금제(filters.permission)·계정·키 흔적이 없다 (CLAUDE.md §1-8).
 * - index.json의 파일 목록·크기·경기 id·경계 사례 태그가 실제 파일과 일치한다.
 * - 6개 대회 순위표의 팀 수가 configs/competitions.json teamCount와 같다(UCL 36팀 단일 테이블).
 * - API-Football 정상 응답은 errors가 [], 오류 샘플은 errors 객체다(M1-48 강등 경로 입력).
 * - 한국 선수 출전 태그(start·sub·bench·absent)가 라인업·출전 시간과 맞다.
 *
 * 어댑터는 M1-44·M1-48에서 만든다. 여기서는 fixture 자체만 검사하고 필요한 필드만 zod로 읽는다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CompetitionsFileSchema, KoreanPlayersFileSchema } from "@/lib/schema";
import { isUtcIso } from "@/lib/time";

const DIR = fileURLToPath(new URL("../fixtures/football/", import.meta.url));
const CONFIGS = fileURLToPath(new URL("../configs/", import.meta.url));
const PLACEHOLDER = "https://example.invalid/stripped.png";
const IMAGE_KEYS = new Set(["crest", "emblem", "flag", "logo", "photo"]);
const SUBDIRS = ["football-data", "api-football"] as const;
const FD_ATTRIBUTION = "Football data provided by the Football-Data.org API";

// ── index.json 경계 파싱 ─────────────────────────────────────────────
const CaseSchema = z.object({
  tag: z.string().min(1),
  ids: z.array(z.number().int()),
  note: z.string().optional(),
});
const KindSchema = z.enum([
  "fd-competition",
  "fd-standings",
  "fd-scorers",
  "fd-matches",
  "fd-match",
  "af-fixtures",
  "af-error",
]);
const IndexFileSchema = z.object({
  path: z.string().regex(/^(football-data|api-football)\/[a-z0-9-]+\.json$/),
  api: z.enum(SUBDIRS),
  kind: KindSchema,
  endpoint: z.string().startsWith("/"),
  fetchedAt: z.string().refine(isUtcIso, "UTC ISO(Z) 형식이어야 한다"),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comp: z.string().nullable(),
  origin: z.string().min(1),
  trimmed: z
    .object({
      rule: z.string().min(1),
      kept: z.number().int().positive(),
      original: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  matchIds: z.array(z.number().int()).optional(),
  cases: z.array(CaseSchema),
  removed: z.record(z.string(), z.number().int().positive()),
  bytes: z.number().int().positive(),
});
type IndexFile = z.infer<typeof IndexFileSchema>;
const IndexSchema = z.object({
  task: z.literal("M0-35"),
  placeholder: z.literal(PLACEHOLDER),
  imageKeys: z.array(z.string()),
  apis: z.object({
    "football-data": z.object({ attribution: z.literal(FD_ATTRIBUTION) }),
    "api-football": z.object({ attribution: z.string().min(1) }),
  }),
  files: z.array(IndexFileSchema),
  matchIdPairs: z.object({
    pairs: z.array(z.object({ fd: z.number().int(), af: z.number().int() })),
  }),
  teamIdPairs: z.object({
    pairs: z.array(
      z.object({
        fd: z.number().int(),
        af: z.number().int(),
        evidence: z.string().regex(/^\d+↔\d+$/),
      }),
    ),
    idCollisions: z.array(z.object({ id: z.number().int() })),
  }),
  missing: z.array(z.object({ case: z.string().min(1), note: z.string() })),
  tagLegend: z.record(z.string(), z.string()),
});

// ── 응답 파싱(테스트가 쓰는 필드만) ─────────────────────────────────
const Id = z.number().int();
const FdMatchListSchema = z.object({
  resultSet: z.object({ count: Id }).optional(),
  matches: z.array(
    z.object({ id: Id, utcDate: z.string(), status: z.string() }),
  ),
});
const FdMatchSchema = z.object({ id: Id, utcDate: z.string() });
const FdStandingsSchema = z.object({
  standings: z.array(
    z.object({
      stage: z.string(),
      type: z.string(),
      group: z.string().nullable(),
      table: z.array(
        z.object({
          position: Id,
          team: z.object({ id: Id }),
          playedGames: Id,
          form: z.null(),
          won: Id,
          draw: Id,
          lost: Id,
          points: Id,
          goalsFor: Id,
          goalsAgainst: Id,
          goalDifference: Id,
        }),
      ),
    }),
  ),
});
const FdScorersSchema = z.object({
  count: Id,
  scorers: z.array(z.object({ player: z.object({ id: Id }) })),
});
const FdCompetitionSchema = z.object({ id: Id, code: z.string() });
const AfEnvelopeSchema = z.object({
  get: z.string(),
  parameters: z.record(z.string(), z.string()),
  // 정상 [] · 오류 { plan | search | … : 문구 } — HTTP 200으로 온다(M0-29)
  errors: z.union([z.tuple([]), z.record(z.string(), z.string())]),
  results: Id,
  response: z.array(z.unknown()),
});
const LineupPlayersSchema = z.array(
  z.object({ player: z.object({ id: Id.nullable() }) }),
);
const AfFixtureSchema = z.object({
  fixture: z.object({
    id: Id,
    date: z.string(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ id: Id }),
  lineups: z
    .array(
      z.object({
        team: z.object({ id: Id }),
        startXI: LineupPlayersSchema,
        substitutes: LineupPlayersSchema,
      }),
    )
    .optional(),
  players: z
    .array(
      z.object({
        players: z.array(
          z.object({
            player: z.object({ id: Id }),
            statistics: z.array(
              z.object({ games: z.object({ minutes: Id.nullable() }) }),
            ),
          }),
        ),
      }),
    )
    .optional(),
});
type AfFixture = z.infer<typeof AfFixtureSchema>;

// ── 로더 ─────────────────────────────────────────────────────────────
function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function loadIndex() {
  return IndexSchema.parse(readJson(path.join(DIR, "index.json")));
}

/** 하위 폴더의 실제 JSON 파일 → "api/name.json" */
function listDataFiles(): string[] {
  return SUBDIRS.flatMap((sub) =>
    readdirSync(path.join(DIR, sub)).map((f) => `${sub}/${f}`),
  ).sort();
}

function readText(rel: string): string {
  return readFileSync(path.join(DIR, rel), "utf8");
}

function afFixtures(rel: string): AfFixture[] {
  const env = AfEnvelopeSchema.parse(readJson(path.join(DIR, rel)));
  return env.response.map((r) => AfFixtureSchema.parse(r));
}

/** 파일 종류별로 cases.ids가 가리킬 수 있는 id 집합 */
function idsInFile(f: IndexFile): number[] {
  const data = readJson(path.join(DIR, f.path));
  switch (f.kind) {
    case "fd-matches":
      return FdMatchListSchema.parse(data).matches.map((m) => m.id);
    case "fd-match":
      return [FdMatchSchema.parse(data).id];
    case "fd-standings":
      return FdStandingsSchema.parse(data).standings.flatMap((s) =>
        s.table.map((r) => r.team.id),
      );
    case "fd-scorers":
      return FdScorersSchema.parse(data).scorers.map((s) => s.player.id);
    case "fd-competition":
      return [FdCompetitionSchema.parse(data).id];
    case "af-fixtures":
      return afFixtures(f.path).map((r) => r.fixture.id);
    case "af-error":
      return [];
  }
}

/** JSON 값을 훑으며 (키, 값)을 넘긴다. 배열 원소는 부모 키를 물려받는다. */
function walk(
  value: unknown,
  visit: (key: string | null, v: unknown) => void,
  key: string | null = null,
): void {
  visit(key, value);
  if (Array.isArray(value)) {
    for (const v of value) walk(v, visit, key);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, visit, k);
  }
}

function tagsOf(f: IndexFile): string[] {
  return f.cases.map((c) => c.tag);
}

const index = loadIndex();
const dataFiles = listDataFiles();

describe("fixtures/football — index.json과 실제 파일", () => {
  it("폴더에는 README.md·index.json·API별 하위 폴더만 있다", () => {
    expect(readdirSync(DIR).sort()).toEqual(
      ["README.md", "api-football", "football-data", "index.json"].sort(),
    );
  });

  it("index.json 파일 목록이 실제 JSON 파일과 같고, 크기 기록이 맞다", () => {
    expect(index.files.map((f) => f.path).sort()).toEqual(dataFiles);
    for (const f of index.files) {
      expect(f.path.startsWith(`${f.api}/`)).toBe(true);
      expect(statSync(path.join(DIR, f.path)).size).toBe(f.bytes);
    }
  });

  it.each(dataFiles)("%s: JSON으로 파싱된다", (rel) => {
    expect(() => readJson(path.join(DIR, rel))).not.toThrow();
  });

  it("엔드포인트 경로에 키·토큰이 없다", () => {
    for (const f of index.files) {
      expect(f.endpoint).not.toMatch(/key|token|apikey/i);
    }
  });

  it("경기 목록 파일의 matchIds가 파일 안 경기 id와 같다", () => {
    for (const f of index.files) {
      if (
        f.kind === "fd-matches" ||
        f.kind === "fd-match" ||
        f.kind === "af-fixtures"
      ) {
        expect(f.matchIds, f.path).toEqual(idsInFile(f));
      }
    }
  });

  it("경계 사례 태그가 가리키는 id가 그 파일에 있다", () => {
    for (const f of index.files) {
      const ids = new Set(idsInFile(f));
      for (const c of f.cases) {
        for (const id of c.ids)
          expect(ids.has(id), `${f.path} ${c.tag} ${id}`).toBe(true);
      }
    }
  });

  it("트리밍한 파일은 남긴 건수와 results·resultSet.count가 맞다", () => {
    for (const f of index.files) {
      const data = readJson(path.join(DIR, f.path));
      if (f.api === "api-football") {
        const env = AfEnvelopeSchema.parse(data);
        expect(env.results, f.path).toBe(env.response.length);
        if (f.trimmed) expect(env.response.length).toBe(f.trimmed.kept);
      } else if (f.kind === "fd-matches") {
        const list = FdMatchListSchema.parse(data);
        if (list.resultSet)
          expect(list.resultSet.count, f.path).toBe(list.matches.length);
        if (f.trimmed) expect(list.matches.length).toBe(f.trimmed.kept);
      } else {
        expect(f.trimmed, f.path).toBeNull();
      }
    }
  });

  it("두 API 경기 id 쌍이 실제 파일의 경기를 가리키고, 팀 id 쌍은 한쪽이 겹치지 않는다", () => {
    const fdIds = new Set(
      index.files.filter((f) => f.api === "football-data").flatMap(idsInFile),
    );
    const afIds = new Set(
      index.files.filter((f) => f.kind === "af-fixtures").flatMap(idsInFile),
    );
    for (const p of index.matchIdPairs.pairs) {
      expect(fdIds.has(p.fd), `fd ${p.fd}`).toBe(true);
      expect(afIds.has(p.af), `af ${p.af}`).toBe(true);
    }
    const pairs = index.teamIdPairs.pairs;
    expect(new Set(pairs.map((p) => p.fd)).size).toBe(pairs.length);
    expect(new Set(pairs.map((p) => p.af)).size).toBe(pairs.length);
    const matchKeys = new Set(
      index.matchIdPairs.pairs.map((p) => `${p.fd}↔${p.af}`),
    );
    for (const p of pairs)
      expect(matchKeys.has(p.evidence), p.evidence).toBe(true);
  });
});

describe("fixtures/football — 공개 저장소 규칙(이미지·배당·계정·키)", () => {
  it.each(index.files.map((f) => [f.path, f] as const))(
    "%s: 이미지 키 값은 null 또는 자리값이고, 자리값은 logo-key-kept 파일에만 있다",
    (rel, f) => {
      const kept = tagsOf(f).includes("logo-key-kept");
      let placeholders = 0;
      walk(readJson(path.join(DIR, rel)), (key, v) => {
        if (key === null || !IMAGE_KEYS.has(key)) return;
        if (Array.isArray(v) || (v !== null && typeof v === "object")) return;
        if (v === PLACEHOLDER) placeholders += 1;
        else expect(v, `${rel} ${key}`).toBeNull();
      });
      if (kept) expect(placeholders).toBeGreaterThan(0);
      else expect(placeholders).toBe(0);
    },
  );

  it("logo-key-kept 파일이 API마다 하나 이상 있다", () => {
    for (const api of SUBDIRS) {
      expect(
        index.files.some(
          (f) => f.api === api && tagsOf(f).includes("logo-key-kept"),
        ),
        api,
      ).toBe(true);
    }
  });

  it.each(dataFiles)("%s: 실제 호스트의 이미지 URL이 없다", (rel) => {
    const text = readText(rel);
    expect(text).not.toMatch(
      /crests\.football-data\.org|media\.api-sports\.io/,
    );
    walk(readJson(path.join(DIR, rel)), (_key, v) => {
      if (typeof v !== "string") return;
      if (/\.(?:png|svg|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(v)) {
        expect(v.startsWith("https://example.invalid/"), v).toBe(true);
      }
    });
  });

  it.each(dataFiles)("%s: odds·filters.permission 키가 없다", (rel) => {
    walk(readJson(path.join(DIR, rel)), (key) => {
      expect(key).not.toBe("odds");
      expect(key).not.toBe("permission");
    });
  });

  it.each(dataFiles)("%s: 계정·이메일·키 흔적이 없다", (rel) => {
    const text = readText(rel);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(
      /x-apisports-key|x-auth-token|subscription|account/i,
    );
    // 두 API의 키는 16진수 32자다 — 같은 모양의 문자열이 없어야 한다
    expect(text).not.toMatch(/\b[0-9a-f]{32}\b/i);
  });
});

describe("fixtures/football — 6개 대회 순위·득점 순위", () => {
  const comps = CompetitionsFileSchema.parse(
    readJson(path.join(CONFIGS, "competitions.json")),
  );

  it.each(comps.map((c) => [c.id, c] as const))(
    "%s: 최신 순위표가 단일 테이블이고 팀 수가 competitions.json teamCount와 같다",
    (id, comp) => {
      const files = index.files
        .filter((f) => f.kind === "fd-standings" && f.comp === id)
        .sort((a, b) => a.asOf.localeCompare(b.asOf));
      const latest = files.at(-1);
      expect(latest, id).toBeDefined();
      if (!latest) return;
      const { standings } = FdStandingsSchema.parse(
        readJson(path.join(DIR, latest.path)),
      );
      expect(standings).toHaveLength(1);
      const [s] = standings;
      expect(s?.type).toBe("TOTAL");
      expect(s?.table).toHaveLength(comp.teamCount);
      if (id === "UCL") {
        expect(s?.stage).toBe("LEAGUE_STAGE");
        expect(s?.group).toBe("League phase");
        expect(s?.table).toHaveLength(36);
      } else {
        expect(s?.stage).toBe("REGULAR_SEASON");
      }
    },
  );

  it("모든 순위표 행이 승무패·승점·득실 산식과 맞다(form은 항상 null)", () => {
    for (const f of index.files.filter((x) => x.kind === "fd-standings")) {
      const { standings } = FdStandingsSchema.parse(
        readJson(path.join(DIR, f.path)),
      );
      for (const r of standings.flatMap((s) => s.table)) {
        expect(r.won + r.draw + r.lost, f.path).toBe(r.playedGames);
        expect(3 * r.won + r.draw, f.path).toBe(r.points);
        expect(r.goalsFor - r.goalsAgainst, f.path).toBe(r.goalDifference);
      }
    }
  });

  it.each(comps.map((c) => c.id))("%s: 득점 순위 파일이 있다", (id) => {
    const f = index.files.find((x) => x.kind === "fd-scorers" && x.comp === id);
    expect(f, id).toBeDefined();
    if (!f) return;
    const data = FdScorersSchema.parse(readJson(path.join(DIR, f.path)));
    expect(data.scorers.length).toBe(data.count);
    expect(data.count).toBeGreaterThan(0);
  });
});

describe("fixtures/football — API-Football errors·시각 표기", () => {
  it("정상 응답은 errors가 [], 오류 샘플은 errors 객체·빈 response다", () => {
    for (const f of index.files.filter((x) => x.api === "api-football")) {
      const env = AfEnvelopeSchema.parse(readJson(path.join(DIR, f.path)));
      if (f.kind === "af-fixtures") {
        expect(env.errors, f.path).toEqual([]);
        expect(env.results).toBeGreaterThan(0);
      } else {
        expect(Array.isArray(env.errors), f.path).toBe(false);
        expect(env.response).toEqual([]);
        expect(env.results).toBe(0);
        const hasPlan = !Array.isArray(env.errors) && "plan" in env.errors;
        expect(hasPlan, f.path).toBe(tagsOf(f).includes("errors.plan"));
      }
    }
  });

  it("errors.plan 샘플이 시즌 차단·날짜 창 차단을 모두 담는다", () => {
    const plans = index.files
      .filter((f) => tagsOf(f).includes("errors.plan"))
      .map(
        (f) =>
          AfEnvelopeSchema.parse(readJson(path.join(DIR, f.path))).parameters,
      );
    expect(plans.some((p) => "season" in p)).toBe(true);
    expect(plans.some((p) => "date" in p && !("season" in p))).toBe(true);
  });

  it("시각 표기를 고치지 않았다(API-Football +00:00, football-data Z)", () => {
    for (const f of index.files) {
      if (f.kind === "af-fixtures") {
        for (const r of afFixtures(f.path))
          expect(r.fixture.date).toMatch(/\+00:00$/);
      } else if (f.kind === "fd-matches") {
        const { matches } = FdMatchListSchema.parse(
          readJson(path.join(DIR, f.path)),
        );
        for (const m of matches)
          expect(m.utcDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      }
    }
  });
});

describe("fixtures/football — 한국 선수 출전 태그", () => {
  const players = KoreanPlayersFileSchema.parse(
    readJson(path.join(CONFIGS, "korean-players.json")),
  );
  const cases = index.files.flatMap((f) =>
    f.cases
      .filter((c) => c.tag.startsWith("korean-player:"))
      .map((c) => ({ file: f, c })),
  );

  it("start·sub·bench·absent가 모두 있다", () => {
    const states = new Set(cases.map(({ c }) => c.tag.split(":")[2]));
    for (const s of ["start", "sub", "bench", "absent"])
      expect(states.has(s), s).toBe(true);
  });

  it.each(
    cases.map(({ file, c }) => [`${file.path} ${c.tag}`, file, c] as const),
  )("%s: 라인업·출전 시간과 맞다", (_label, file, c) => {
    const [, slug, state] = c.tag.split(":");
    const player = players.find((p) => p.slug === slug);
    expect(player, slug).toBeDefined();
    if (!player) return;
    const fixtures = afFixtures(file.path).filter((x) =>
      c.ids.includes(x.fixture.id),
    );
    expect(fixtures).toHaveLength(c.ids.length);
    // 출전 판정은 두 팀 라인업이 있는 경기 단건 응답에서만 할 수 있다
    for (const r of fixtures) expect(r.lineups ?? []).toHaveLength(2);
    if (player.apiFootballId === null) {
      // id 미확인 선수는 매칭할 수 없다 — 라인업에 없는 경기(absent)만 태그한다(M1-48 ⑤)
      expect(state).toBe("absent");
      return;
    }
    const pid = player.apiFootballId;
    for (const r of fixtures) {
      const lineups = r.lineups ?? [];
      const started = lineups.some((l) =>
        l.startXI.some((p) => p.player.id === pid),
      );
      const onBench = lineups.some((l) =>
        l.substitutes.some((p) => p.player.id === pid),
      );
      const minutes = (r.players ?? [])
        .flatMap((t) => t.players)
        .find((p) => p.player.id === pid)?.statistics[0]?.games.minutes;
      if (state === "start") expect(started).toBe(true);
      else if (state === "sub") {
        expect(onBench).toBe(true);
        expect(minutes ?? 0).toBeGreaterThan(0);
      } else if (state === "bench") {
        expect(onBench).toBe(true);
        expect(minutes ?? 0).toBe(0);
      } else {
        expect(started || onBench).toBe(false);
      }
    }
  });
});

describe("fixtures/football — 경계 사례 커버리지", () => {
  const allTags = new Set(index.files.flatMap(tagsOf));

  it.each([
    "status:INT",
    "status:CANCELLED",
    "status:IN_PLAY",
    "status:TIMED",
    "penalty-shootout",
    "errors.plan",
    "errors.other",
    "errors-empty-array",
    "logo-key-kept",
    "target-league",
    "name-trap",
    "korean-team",
    "penalty-goal",
    "missed-penalty",
    "var-goal-cancelled",
    "multi-goal",
    "goals-total-null",
    "goals-total-zero",
    "standings-counts-in-play",
    "placeholder-kickoff",
    "brief:2026-10-11",
  ])("%s 태그가 있다", (tag) => {
    expect(allTags.has(tag)).toBe(true);
  });

  it("없는 경계 사례(자책골 등)는 missing에 적혀 있다", () => {
    const missing = index.missing.map((m) => m.case);
    expect(missing).toContain("own-goal");
    for (const m of missing) expect(allTags.has(m), m).toBe(false);
  });

  it("쓴 태그가 모두 tagLegend에 설명돼 있다", () => {
    // 키는 " / "로 나란히 적은 태그 목록이다. `<…>`는 자리 표시라 그 앞까지를 접두어로 본다.
    const patterns = Object.keys(index.tagLegend).flatMap((k) =>
      k.split(" / "),
    );
    const covered = (tag: string) =>
      patterns.some((p) => {
        const open = p.indexOf("<");
        return open === -1 ? p === tag : tag.startsWith(p.slice(0, open));
      });
    for (const tag of allTags) expect(covered(tag), tag).toBe(true);
  });
});
