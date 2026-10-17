/**
 * M1-21 초기 표기 사전(configs/names.ko.json) 가드 + 태그 한글 표시 도우미(src/lib/data/names.ts — FR-24):
 *   - 등록 한국 선수 전원·빅클럽(news-keywords.ts BIG_CLUBS — 같은 slug로 별칭 합류)·6개 대회 이번 시즌 팀(fixtures 순위표)
 *   - 팀 slug = team-ids.json slug 또는 M0-32 규칙(team-ids-draft.ts teamSlugFromName) — 팀 페이지 URL이 갈라지지 않게
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

import { BIG_CLUBS } from "../scripts/lib/news-keywords";
import { teamSlugFromName } from "../scripts/lib/team-ids-draft";

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
 * 표기 확인 대기(M1-21 보고 — 국내 매체끼리 표기가 갈리거나 근거가 부족) — football-data 정식 이름.
 * 사용자 결정 뒤 사전에 넣으면 여기서 뺀다.
 */
const PENDING: readonly string[] = [
  "Brighton & Hove Albion FC", // 브라이턴 / 브라이튼
  "Everton FC", // 에버턴 / 에버튼
  "Nottingham Forest FC", // 노팅엄 포리스트 / 노팅엄 포레스트
  "Aston Villa FC", // 애스턴 빌라 / 아스톤 빌라
  "Crystal Palace FC", // 크리스털 팰리스 / 크리스탈 팰리스
  "Coventry City FC", // 코번트리 / 코벤트리
  "RC Deportivo La Coruña", // 데포르티보 라코루냐 / 데포르티보 / 라 코루냐
  "FC Internazionale Milano", // 인테르 / 인터 밀란
  "SV 07 Elversberg", // 엘버스베르크 / 엘페르스베르크
  "Sporting Clube de Portugal", // 스포르팅 CP / 스포르팅 리스본 / 스포르팅
  "Fenerbahçe SK", // 페네르바흐체 / 페네르바체
  "LASK Linz", // LASK / LASK 린츠
  "Viking FK", // 국내 매체 표기 근거 없음
  "Sabah FK", // 국내 매체 표기 근거 없음(위키 문서 없음)
];

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

  it("빅클럽 16곳 중 표기 확인 대기(인테르)를 뺀 15곳이 같은 slug로 있다 — BIG_CLUBS 별칭에 합류", () => {
    const missing = BIG_CLUBS.filter(
      (c) => !teamEntries.some((e) => e.slug === c.slug),
    ).map((c) => c.slug);
    expect(missing).toEqual(["internazionale-milano"]);
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
      expect(enOwner.get(team.shortName.toLowerCase()), team.shortName).toBe(
        owner,
      );
    }
    expect(seen.size).toBe(111); // 5대 리그 96팀 + UCL 리그 페이즈의 그 밖 15팀
  });

  it("팀 slug는 team-ids.json slug 또는 M0-32 규칙(football-data 정식 이름) — 확인 대기 팀은 team-ids에만", () => {
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

  it("모든 항목에 근거(note)가 있고, 표기는 앞뒤 공백 없는 한글 중심(라틴은 약칭 PSV·AEK·AC·FC만)", () => {
    for (const e of NAMES.entries) {
      expect(e.note, e.ko).toMatch(/^(확실|관용|통칭)/);
      const latin = e.ko.match(/[A-Za-z]+/g) ?? [];
      for (const word of latin) {
        expect(["PSV", "AEK", "AC", "FC"], e.ko).toContain(word);
      }
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
