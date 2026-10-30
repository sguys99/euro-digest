/**
 * M1-21 초기 표기 사전(configs/names.ko.json) 가드 + 태그 한글 표시 도우미(src/lib/data/names.ts — FR-24):
 *   - 등록 한국 선수 전원·빅클럽(news-keywords.ts BIG_CLUBS — 같은 slug로 별칭 합류)·6개 대회 이번 시즌 팀(fixtures 순위표)
 *   - 팀 slug = team-ids.json slug(M2-04 — 6개 대회 111팀 전부, D63 ③ 규칙) 또는 같은 규칙(team-slugs.ts teamSlugFromName) — 팀 페이지 URL이 갈라지지 않게
 *   - 표기가 갈리는 이름(확인 대기 — 오케스트레이터가 사용자에게 묻는다)은 사전에 없다(`/add-name` 원칙: 확인분만 반영)
 *   - 모든 항목에 근거(note) · football-data 정식·짧은 이름 별칭
 * 확인 대기 목록이 바뀌면(사용자 결정) PENDING을 함께 고친다.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { labelTags, loadTagLabels, tagLabelsFrom } from "@/lib/data/names";
import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
} from "@/lib/schema";

import { isInitialForm, KNOWN_PLAYER_TEAMS } from "../scripts/lib/names";
import { BIG_CLUBS } from "../scripts/lib/news-keywords";
import { teamSlugFromName } from "../scripts/lib/team-slugs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const KOREAN = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);

/**
 * 표기 확인 대기 — football-data 정식 이름. M1-21 보고의 확인 목록은 2026-10-17 사용자가 추천 표기를 일괄 확정했고(PRD §15 D46),
 * 국내 매체 표기 근거가 없는 두 팀만 보류로 남았다. 사용자 결정 뒤 사전에 넣으면 여기서 뺀다.
 * Sabah FK는 2026-10-29 사용자 결정으로 '사바'(포포투 '사바 FK'의 통칭 — /add-name 3차) 등록, 보류에서 뺐다.
 * Viking FK는 2026-10-30 사용자 결정으로 '비킹'(노컷뉴스 '비킹 FK'의 통칭 — M2-05 검토) 등록, 보류가 비었다.
 */
const PENDING: readonly string[] = [];

/** football-data 짧은 이름을 별칭으로 넣지 않는 팀 — 다른 팀과 겹침(D46: 'Deportivo'는 Deportivo Alavés와 겹친다) */
const SHORT_NAME_NOT_ALIAS: readonly string[] = ["RC Deportivo La Coruña"];

interface FdTeam {
  name: string;
  shortName: string;
}

/** fixtures 순위표(5대 리그 2026-10-11 + UCL 2026-10-10)의 팀 — 이번 시즌 6개 대회 참가 팀 */
const SEASON_TEAMS: FdTeam[] = [
  "standings-pl-2026-10-11",
  "standings-pd-2026-10-11",
  "standings-sa-2026-10-11",
  "standings-bl1-2026-10-11",
  "standings-fl1-2026-10-11",
  "standings-cl-2026-10-10",
].flatMap((f) =>
  (
    readJson(`fixtures/football/football-data/${f}.json`) as {
      standings: Array<{ table: Array<{ team: FdTeam }> }>;
    }
  ).standings.flatMap((s) => s.table.map((r) => r.team)),
);

const teamEntries = NAMES.entries.filter((e) => e.kind === "team");
const enOwner = new Map<string, (typeof NAMES.entries)[number]>();
for (const e of NAMES.entries) {
  for (const en of e.en) enOwner.set(en.toLowerCase(), e);
}

describe("configs/names.ko.json — 초기 사전(M1-21)", () => {
  it("등록 한국 선수 전원이 같은 slug·같은 한글 표기로 있다(korean-players.json)", () => {
    for (const p of KOREAN) {
      const entry = NAMES.entries.find(
        (e) => e.kind === "player" && e.slug === p.slug,
      );
      expect(entry?.ko, p.slug).toBe(p.nameKo);
      expect(entry!.en.map((x) => x.toLowerCase())).toContain(
        p.nameEn.toLowerCase(),
      );
    }
  });

  it("빅클럽 16곳이 모두 같은 slug로 있다 — BIG_CLUBS 별칭에 합류(인테르는 D46 확정)", () => {
    const missing = BIG_CLUBS.filter(
      (c) => !teamEntries.some((e) => e.slug === c.slug),
    ).map((c) => c.slug);
    expect(missing).toEqual([]);
  });

  it("이번 시즌 6개 대회 팀은 정식·짧은 이름이 모두 별칭으로 등록됐거나 확인 대기다", () => {
    const seen = new Set<string>();
    for (const team of SEASON_TEAMS) {
      if (seen.has(team.name)) continue;
      seen.add(team.name);
      const owner = enOwner.get(team.name.toLowerCase());
      if (PENDING.includes(team.name)) {
        expect(owner, `${team.name}는 확인 대기 — 사전에 없어야 한다`).toBe(
          undefined,
        );
        continue;
      }
      expect(owner?.kind, team.name).toBe("team");
      if (SHORT_NAME_NOT_ALIAS.includes(team.name)) {
        expect(
          enOwner.get(team.shortName.toLowerCase()),
          team.shortName,
        ).not.toBe(owner);
        continue;
      }
      expect(enOwner.get(team.shortName.toLowerCase()), team.shortName).toBe(
        owner,
      );
    }
    expect(seen.size).toBe(111); // 5대 리그 96팀 + UCL 리그 페이즈의 그 밖 15팀
  });

  it("팀 slug는 team-ids.json slug 또는 D63 ③ 규칙(football-data 정식 이름) — 확인 대기 팀은 team-ids에만", () => {
    const fdNameBySlug = new Map(
      Object.entries(TEAM_IDS).map(([slug, v]) => [
        slug,
        /fd "([^"]*)"/.exec(v.note ?? "")?.[1] ?? null,
      ]),
    );
    for (const e of teamEntries) {
      if (fdNameBySlug.has(e.slug!)) continue;
      // team-ids에 없는 팀: 첫 영문 표기(football-data 정식 이름)로 규칙 slug와 같아야 한다(미트윌란은 덴마크 — 규칙과 같다)
      expect(e.slug, e.ko).toBe(teamSlugFromName(e.en[0]!).slug);
    }
    for (const [slug, fdName] of fdNameBySlug) {
      if (fdName && PENDING.includes(fdName)) {
        expect(teamEntries.some((e) => e.slug === slug)).toBe(false);
        continue;
      }
      const entry = teamEntries.find((e) => e.slug === slug);
      expect(entry, slug).toBeDefined();
      if (fdName) expect(entry!.en, slug).toContain(fdName);
    }
  });

  it("모든 항목에 근거(note — 확신도 확실·관용·통칭·확정·추정)가 있고, 표기는 앞뒤 공백 없는 한글 중심(라틴은 약칭 PSV·AEK·AC·FC·CP·LASK만)", () => {
    for (const e of NAMES.entries) {
      expect(e.note, e.ko).toMatch(/^(확실|관용|통칭|확정|추정)/); // 추정 = 초안(사용자 검토 대기 — M2-05)
      const latin = e.ko.match(/[A-Za-z]+/g) ?? [];
      for (const word of latin) {
        expect(["PSV", "AEK", "AC", "FC", "CP", "LASK"], e.ko).toContain(word);
      }
    }
  });

  it("D46 사용자 확정 항목은 note에 결정이 남아 있다 — Club Brugge는 KFA 대신 매체 관례 '클럽 브뤼헤'(D39 ② 예외)", () => {
    const d46 = NAMES.entries.filter((e) => e.note?.includes("D46"));
    // 팀 13(Club Brugge 포함) · 선수 14 · 감독 3 — 한지 플릭(2026-10-25 사용자 결정으로 '한지 플리크'에서 바꿈)·
    // 엘버스베르크(2026-10-29 사용자 결정으로 '엘페르스베르크'에서 바꿈 — 매체 관용 통일, /add-name 3차)도 note에 D46 확정 이력이 남는다
    expect(d46.length).toBe(30);
    expect(d46.every((e) => e.note!.includes("2026-10-17"))).toBe(true);
    const elversberg = teamEntries.find((e) => e.slug === "elversberg")!;
    expect(elversberg.ko).toBe("엘버스베르크");
    expect(elversberg.note).toMatch(/^확정\(사용자 결정 2026-10-29\)/);
    const brugge = teamEntries.find((e) => e.slug === "club-brugge")!;
    expect(brugge.ko).toBe("클럽 브뤼헤");
    expect(brugge.note).toContain("D39 ②(KFA 우선)의 예외");
  });

  it("감독 표기 확장(사용자 결정 2026-10-25 — D47 감독 발언 규칙): 32명, 성 단독 별칭은 저위험 성 14개만(/add-name '성 단독 기본 미반영' 정책의 예외 — 브리핑 치환에는 안 씀)", () => {
    const managers = NAMES.entries.filter((e) => e.kind === "manager");
    expect(managers.length).toBe(32); // D46까지 13 + A 17 + 키스 앤드류스·안토니오 콘테
    const decided = managers.filter((e) =>
      e.note?.startsWith("확정(사용자 결정 2026-10-25)"),
    );
    expect(decided.map((e) => e.slug).sort()).toEqual(
      [
        "massimiliano-allegri",
        "gian-piero-gasperini",
        "luciano-spalletti",
        "gennaro-gattuso",
        "ruben-amorim",
        "cristian-chivu",
        "ignazio-abate",
        "cesc-fabregas",
        "oliver-glasner",
        "gary-o-neil",
        "frank-lampard",
        "fabian-hurzeler",
        "andoni-iraola",
        "david-moyes",
        "matthias-jaissle",
        "maurizio-sarri",
        "alvaro-arbeloa",
        "keith-andrews",
        "antonio-conte",
        "hansi-flick",
      ].sort(),
    );
    const flick = managers.find((e) => e.slug === "hansi-flick")!;
    expect(flick.ko).toBe("한지 플릭");
    // 성 단독 별칭(한 단어 영문 표기) — 정확히 이 14개, 각 항목 note에 예외 근거
    const surnameAliases = managers.flatMap((e) =>
      e.en.filter((n) => !/\s/u.test(n)).map((n) => [e, n] as const),
    );
    expect(surnameAliases.map(([, n]) => n).sort()).toEqual(
      [
        "Allegri",
        "Gasperini",
        "Spalletti",
        "Gattuso",
        "Chivu",
        "Fàbregas",
        "Glasner",
        "Lampard",
        "Hürzeler",
        "Iraola",
        "Moyes",
        "Jaissle",
        "Arbeloa",
        "Sarri",
      ].sort(),
    );
    for (const [e, n] of surnameAliases) {
      expect(e.note, e.ko).toContain(`성 단독 별칭 '${n}'`);
      expect(e.note, e.ko).toContain(
        "/add-name '성 단독 기본 미반영' 정책의 사용자 예외(2026-10-25",
      );
      expect(e.note, e.ko).not.toContain("D46"); // D46 항목 수 가드(위)와 섞이지 않게
      // 성 별칭은 대표 표기의 마지막 낱말이다(다른 사람 이름을 별칭으로 넣지 않는다)
      expect(e.en[0]!.split(/\s+/u).at(-1), e.ko).toBe(n);
    }
  });

  it("5대 리그 밖 한국 선수(D46 — 미등록 손흥민)는 넣지 않는다 · 등록 한국 선수는 비활성(FR-64 홍현석)도 그대로 둔다", () => {
    // D46의 '5대 리그 밖 제외'는 한국 선수 범위(FR-60)에 한정 — 외국 선수(그리즈만·산초 등)는 소속 리그와 무관하게 둔다
    expect(
      NAMES.entries.some(
        (e) => e.kind === "player" && e.slug === "hong-hyun-seok",
      ),
    ).toBe(true);
    for (const slug of ["antoine-griezmann", "jadon-sancho"]) {
      expect(
        NAMES.entries.some((e) => e.kind === "player" && e.slug === slug),
        slug,
      ).toBe(true);
    }
    for (const slug of ["son-heung-min"]) {
      expect(
        NAMES.entries.some((e) => e.kind === "player" && e.slug === slug),
        slug,
      ).toBe(false);
    }
  });

  it("첫 글자 축약 별칭('X. 성')은 소속팀을 확인할 수 있는 선수만 — 한국 선수(korean-players.json) 또는 KNOWN_PLAYER_TEAMS(감독은 입력 정리 대상이 아니라 제외)", () => {
    const koreanSlugs = new Set(KOREAN.map((p) => p.slug));
    for (const e of NAMES.entries.filter((x) => x.kind === "player")) {
      if (!e.en.some(isInitialForm)) continue;
      expect(
        koreanSlugs.has(e.slug!) || e.slug! in KNOWN_PLAYER_TEAMS,
        `${e.ko} — 축약 별칭의 소속팀 확인 경로 없음`,
      ).toBe(true);
    }
    for (const [player, team] of Object.entries(KNOWN_PLAYER_TEAMS)) {
      expect(
        NAMES.entries.some((e) => e.kind === "player" && e.slug === player),
        player,
      ).toBe(true);
      expect(
        teamEntries.some((e) => e.slug === team),
        team,
      ).toBe(true);
    }
  });

  it("대회 이름은 사전에 넣지 않는다(competitions.json nameKo·shortKo가 단일 출처 — D30)", () => {
    for (const c of COMPETITIONS) {
      expect(enOwner.get(c.nameEn.toLowerCase()), c.nameEn).toBeUndefined();
    }
  });
});

describe("src/lib/data/names.ts — 태그 한글 표시(FR-24)", () => {
  it("slug → 한글(팀·선수), 없는 slug·다른 유형은 null", () => {
    const labels = tagLabelsFrom(NAMES);
    expect(labels.label("team", "bayern-munchen")).toBe("바이에른 뮌헨");
    expect(labels.label("team", "brentford")).toBe("브렌트포드");
    expect(labels.label("player", "kim-min-jae")).toBe("김민재");
    expect(labels.label("player", "bayern-munchen")).toBeNull();
    expect(labels.label("team", "nope")).toBeNull();
  });

  it("labelTags — 입력 순서·중복 한 번·사전에 없는 slug는 뺀다(slug 문자열을 보이지 않는다)", () => {
    const labels = tagLabelsFrom(NAMES);
    expect(
      labelTags(
        ["bayern-munchen", "nope", "augsburg", "bayern-munchen"],
        "team",
        labels,
      ),
    ).toEqual([
      { slug: "bayern-munchen", label: "바이에른 뮌헨" },
      { slug: "augsburg", label: "아우크스부르크" },
    ]);
  });

  it("loadTagLabels — 기본 경로는 configs/names.ko.json, 파일이 없으면 빈 표, 깨졌으면 던진다(빌드 실패)", () => {
    expect(loadTagLabels().label("player", "lee-kang-in")).toBe("이강인");
    const dir = mkdtempSync(path.join(os.tmpdir(), "names-labels-"));
    try {
      expect(
        loadTagLabels(path.join(dir, "none.json")).label("team", "arsenal"),
      ).toBeNull();
      const broken = path.join(dir, "broken.json");
      writeFileSync(broken, JSON.stringify({ entries: [{ ko: "" }] }));
      expect(() => loadTagLabels(broken)).toThrow(/스키마 검증 실패/);
      const bad = path.join(dir, "bad.json");
      writeFileSync(bad, "{");
      expect(() => loadTagLabels(bad)).toThrow(/JSON을 읽을 수 없음/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
