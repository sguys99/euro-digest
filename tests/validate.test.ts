/**
 * `npm run validate` 통합 테스트 (M0-17) — 임시 폴더에 configs·data를 꾸며
 * 실제 파일 읽기(validate-fs) → 판정(validate-report) → 출력 문구까지 확인한다.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readValidationSnapshot } from "../scripts/lib/validate-fs";
import {
  buildValidationReport,
  formatValidationReport,
  validationExitCode,
} from "../scripts/lib/validate-report";
import { formatIssue } from "../scripts/lib/validate-schema";

import { FIXTURE_ROOT, loadFixture } from "./schema/helpers";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-validate-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 임시 저장소에 파일을 쓴다. 문자열이 아니면 JSON으로 직렬화. */
function write(relPath: string, content: unknown): void {
  const abs = path.join(root, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
}

/** fixtures/schema/<dir>를 임시 저장소의 같은 경로로 복사한다. */
function copyFixtures(dir: "configs" | "data"): void {
  cpSync(path.join(FIXTURE_ROOT, dir), path.join(root, dir), {
    recursive: true,
  });
}

function run(configsOnly = false) {
  const report = buildValidationReport(
    readValidationSnapshot(root, { configsOnly }),
    { configsOnly },
  );
  const errors = report.issues
    .filter((i) => i.severity === "error")
    .map(formatIssue);
  const infos = report.issues
    .filter((i) => i.severity === "info")
    .map(formatIssue);
  return {
    report,
    errors,
    infos,
    exitCode: validationExitCode(report),
    lines: formatValidationReport(report),
  };
}

describe("① 전부 유효", () => {
  it("필수 파일(takedowns.json = [])만 있으면 통과, 없는 configs·프롬프트는 정보", () => {
    write("configs/takedowns.json", "[]\n");
    const { exitCode, errors, infos, lines, report } = run();

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(report.counts).toEqual({ configs: 1, data: 0, prompts: 0 });
    // 레지스트리 config 13종 중 takedowns를 뺀 12종 + 프롬프트 3종
    expect(infos).toHaveLength(15);
    expect(infos).toContain(
      "configs/sources.json — 아직 없음 · 뉴스 소스 (FR-01)",
    );
    expect(infos).toContain(
      "configs/prompts/summarize.md — 아직 없음 · 해당 LLM 기능 단계에서 추가",
    );
    expect(lines.at(-1)).toBe(
      "[validate] 검증 통과 — configs 1개 · data 0개 · 정보 15건",
    );
  });

  it("fixtures/schema/configs를 그대로 복사하면 통과하고 교차 참조 5종을 모두 실행한다", () => {
    copyFixtures("configs");
    const { exitCode, errors, infos, report } = run();

    expect(errors).toEqual([]);
    expect(exitCode).toBe(0);
    expect(report.counts.configs).toBe(13);
    expect(report.crossRef.checked).toHaveLength(5);
    expect(report.crossRef.skipped).toEqual([]);
    expect(infos.every((i) => i.startsWith("configs/prompts/"))).toBe(true);
  });

  it("프롬프트는 있으면 비어 있지 않은지만 본다", () => {
    write("configs/takedowns.json", "[]");
    write(
      "configs/prompts/summarize.md",
      "# 요약 프롬프트\n입력에 없는 사실 금지\n",
    );
    write("configs/prompts/team-profile.md", "  \n\t\n");
    const { errors, report } = run();

    expect(report.counts.prompts).toBe(2);
    expect(errors).toEqual([
      "configs/prompts/team-profile.md — 프롬프트가 비어 있음",
    ]);
  });
});

describe("② JSON 문법 오류", () => {
  it("파일 단위 오류로 보고하고 다른 파일 검사는 계속한다", () => {
    write("configs/takedowns.json", '[{"id": "c_0123456789",');
    write("configs/team-colors.json", "{ invalid }");
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^configs\/takedowns\.json — JSON 문법 오류: /);
    expect(errors[1]).toMatch(/^configs\/team-colors\.json — JSON 문법 오류: /);
  });

  it("빈 파일·UTF-8 BOM도 오류", () => {
    write("configs/takedowns.json", "");
    write("configs/formations.json", "﻿{}");
    const { errors } = run();

    expect(errors).toEqual([
      "configs/formations.json — UTF-8 BOM이 있음 — BOM 없이 UTF-8로 저장",
      expect.stringMatching(/^configs\/takedowns\.json — JSON 문법 오류: /),
    ]);
  });
});

describe("③ 스키마 오류 — `파일:zod 경로 — 메시지`", () => {
  it("배열 항목의 필드 경로를 출력한다", () => {
    write("configs/takedowns.json", [
      {
        id: "c_0123456789",
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "삭제 요청 (#1)",
      },
      {
        id: "c_XYZ",
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "정정 요청 (#2)",
      },
    ]);
    const { exitCode, errors, lines } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/takedowns.json:[1].id — 카드 ID는 c_ + 16진수 소문자 10자리",
    ]);
    expect(lines).toContain(
      "[validate] 오류 configs/takedowns.json:[1].id — 카드 ID는 c_ + 16진수 소문자 10자리",
    );
    expect(lines.at(-1)).toBe(
      "[validate] 검증 실패 — 오류 1건 (파일 1개) · configs 1개 · data 0개 · 정보 15건",
    );
  });

  it("키 맵 파일은 키를 경로에 넣고, 알 수 없는 키(strict)도 잡는다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/team-colors.json", {
      "sample-united": { colors: ["#C8102E", "#C8102E"], short: "SMU" },
      "Bad Key": { colors: ["#000000", "#FFFFFF"], short: "BAD" },
    });
    write("configs/transfer-windows.json", {
      boost: 1.5,
      windows: [],
      extra: 1,
    });
    const { errors } = run();

    expect(errors).toContain(
      "configs/team-colors.json:sample-united.colors — 주색과 보조색이 같음",
    );
    expect(errors).toContainEqual(
      expect.stringMatching(/^configs\/team-colors\.json:\["Bad Key"\] — /),
    );
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^configs\/transfer-windows\.json:\(루트\) — .*extra/,
      ),
    );
  });

  it("오류가 많으면 파일당 10건까지만 출력하고 건수는 전부 센다", () => {
    write(
      "configs/takedowns.json",
      Array.from({ length: 12 }, (_, i) => ({
        id: `bad-${i}`,
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "x",
      })),
    );
    const { errors, lines } = run();

    expect(errors).toHaveLength(12);
    const shown = lines.filter((l) =>
      l.startsWith("[validate] 오류 configs/takedowns.json:"),
    );
    expect(shown).toHaveLength(10);
    expect(lines).toContain(
      "[validate] 오류 configs/takedowns.json — … 외 2건 생략",
    );
    expect(lines.at(-1)).toMatch(/검증 실패 — 오류 12건 \(파일 1개\)/);
  });
});

describe("④ 레지스트리에 없는 configs 파일", () => {
  it("파일명 오타는 비슷한 이름을 제안한다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/source.json", []);
    write("configs/Sources.JSON", []); // 대소문자가 다른 확장자·이름
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/Sources.JSON — 스키마 레지스트리에 없는 설정 파일 (혹시 configs/sources.json?)",
      "configs/source.json — 스키마 레지스트리에 없는 설정 파일 (혹시 configs/sources.json?)",
    ]);
  });

  it("비슷한 이름이 없으면 등록 안내, 하위 폴더도 검사하고 prompts/는 뺀다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/oops.json", { a: 1 });
    write("configs/archive/sources.json", []);
    write("configs/prompts/examples.json", { not: "checked" });
    const { errors, report } = run();

    expect(report.counts.configs).toBe(3);
    expect(errors).toEqual([
      "configs/archive/sources.json — 스키마 레지스트리에 없는 설정 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
      "configs/oops.json — 스키마 레지스트리에 없는 설정 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
    ]);
  });

  it("README.md 같은 JSON이 아닌 파일은 대상이 아니다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/README.md", "# configs");
    write("configs/prompts/.gitkeep", "");
    expect(run().exitCode).toBe(0);
  });
});

describe("⑤ 교차 참조 실패", () => {
  it("검색 쿼리 source·player, 소집 명단 playerSlugs가 없는 id를 가리키면 오류", () => {
    copyFixtures("configs");
    const queries = loadFixture("configs/search-queries.json") as {
      queries: Record<string, unknown>[];
    };
    write("configs/search-queries.json", {
      ...queries,
      queries: [
        { ...queries.queries[0], player: "nobody" },
        { ...queries.queries[1], source: "bbc-football" }, // type rss
        { ...queries.queries[1], id: "q-missing", source: "missing-source" },
      ],
    });
    const team = loadFixture("configs/national-team.json") as {
      squads: { playerSlugs: string[] }[];
    };
    write("configs/national-team.json", {
      ...team,
      squads: [{ ...team.squads[0], playerSlugs: ["hong-gil-dong", "ghost"] }],
    });
    const { exitCode, errors, lines } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'configs/search-queries.json:queries[1].source — 소스 "bbc-football"의 type이 "rss" — 검색 쿼리는 type "search" 소스만 참조',
      'configs/search-queries.json:queries[2].source — sources.json에 없는 소스 id "missing-source"',
      'configs/search-queries.json:queries[0].player — korean-players.json에 없는 선수 slug "nobody"',
      'configs/national-team.json:squads[0].playerSlugs[1] — korean-players.json에 없는 선수 slug "ghost"',
    ]);
    expect(lines).toContain(
      "[validate] 교차 참조: 5건 실행 · 건너뜀 0건(관련 파일 없음) · 오류 4건",
    );
  });

  it("활성 한국 선수의 소속팀이 team-ids.json에 없거나 af가 null이면 오류 (D33)", () => {
    copyFixtures("configs");
    write("configs/team-ids.json", {
      "sample-united": { fd: 9001, af: null },
    });
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'configs/korean-players.json:[0].team — 활성 선수 "hong-gil-dong"의 팀 "sample-united"의 af(API-Football 팀 id)가 null — 소속팀 경기 기록을 수집하지 못함',
    ]);
  });

  it("team-ids.json의 fd·af 중복은 스키마 오류다(두 API는 같은 숫자가 다른 팀일 수 있어 키별로 따로 본다)", () => {
    copyFixtures("configs");
    write("configs/team-ids.json", {
      "sample-united": { fd: 57, af: 42 },
      "example-city": { fd: 349, af: 57 }, // fd 57 ≠ af 57 — 중복 아님
      "other-town": { fd: 57, af: 63 },
    });
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'configs/team-ids.json:other-town.fd — fd id 57 중복 ("sample-united"와 같음)',
    ]);
  });

  it("한쪽 파일이 스키마 오류면 교차 참조는 건너뛴다(스키마 오류만 보고)", () => {
    copyFixtures("configs");
    write("configs/sources.json", [{ id: "Bad Id" }]);
    const { errors, report } = run();

    expect(report.crossRef.skipped).toEqual([
      "search-queries.source → sources(type search)",
      "publisher-domains.sourceIds → sources",
    ]);
    expect(errors.every((e) => e.startsWith("configs/sources.json:"))).toBe(
      true,
    );
  });
});

describe("⑥ data 파일 검증", () => {
  // M1-25: 이 fixture는 부록 A 스키마 예시라 LLM 요약 경로 형식(ai:true 카드·요약 줄)을 담는다 — 스키마는 통과하지만 발행 게이트가
  // 거부한다(D23). 예전 단언 '그대로 복사하면 통과(exit 0)'를 '스키마 오류 0 + 게이트 오류는 그 카드 3건뿐'으로 바꿨다.
  it("fixtures/schema/data를 그대로 복사하면 스키마는 통과하고, 발행 게이트는 LLM 요약 형식 카드(ai:true·요약 줄 — D23)만 거부한다", () => {
    write("configs/takedowns.json", "[]");
    copyFixtures("data");
    const { exitCode, report } = run();

    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors.filter((i) => i.stage !== "gate")).toEqual([]);
    expect(errors.map((i) => `${i.file}:${i.path}`)).toEqual([
      "data/news/2026-10-10.json:cards[0].ai",
      "data/news/2026-10-10.json:cards[0].s",
      "data/news/2026-10-10.json:cards[1].s",
    ]);
    expect(exitCode).toBe(1);
    // + data/cache/af-pending.json (M1-48) · data/matches/2026-10.json·meta.json (M1-48b) · data/briefs/2026-10-11.json (M1-19)
    expect(report.counts.data).toBe(15);
  });

  it("같은 fixture의 뉴스 카드를 원제목+링크 형식(ai:false·s:[])으로 바꾸면 통과한다", () => {
    write("configs/takedowns.json", "[]");
    copyFixtures("data");
    const news = loadFixture("data/news/2026-10-10.json") as {
      cards: Array<Record<string, unknown>>;
    };
    write("data/news/2026-10-10.json", {
      ...news,
      cards: news.cards.map((card) => ({ ...card, ai: false, s: [] })),
    });
    const { exitCode, errors } = run();

    expect(errors).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("파일명 불일치·스키마 오류·미등록 파일은 오류", () => {
    write("configs/takedowns.json", "[]");
    write(
      "data/news/2026-10-11.json",
      loadFixture("data/news/2026-10-10.json"),
    );
    write("data/runs.json", [{ runId: 1 }]);
    write("data/cache/other.json", {});
    write("data/run.json", []);
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toContain(
      "data/cache/other.json — 스키마 레지스트리에 없는 data 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
    );
    expect(errors).toContain(
      'data/news/2026-10-11.json — 파일명이 내용과 다름 — 내용 기준 파일명은 "2026-10-10.json" (현재 "2026-10-11.json")',
    );
    expect(errors).toContain(
      "data/run.json — 스키마 레지스트리에 없는 data 파일 (혹시 data/runs.json?)",
    );
    expect(errors.some((e) => e.startsWith("data/runs.json:[0]"))).toBe(true);
  });

  it("--configs-only면 data를 읽지 않는다", () => {
    write("configs/takedowns.json", "[]");
    write("data/runs.json", "{ broken");
    const { exitCode, report, lines } = run(true);

    expect(exitCode).toBe(0);
    expect(report.counts.data).toBe(0);
    expect(lines).toContain("[validate] data: 건너뜀 (--configs-only)");
    expect(run(false).exitCode).toBe(1);
  });
});

describe("⑥-2 소스 설정 경고 (M1-02 — 오류 아님)", () => {
  /** 수집 조건을 모두 통과하는 rss 소스 */
  const feed = {
    id: "sample-feed",
    name: "Sample — Football",
    type: "rss",
    url: "https://example.com/feed.xml",
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 2,
    terms_checked: true,
    robots_checked: true,
  };

  it("crawl+enabled+robots_checked:false · enabled+terms_checked:false · summarize:true를 경고하고 통과(exit 0)", () => {
    write("configs/takedowns.json", "[]");
    write("configs/sources.json", [
      feed,
      { ...feed, id: "list-site", type: "crawl", robots_checked: false },
      { ...feed, id: "unchecked", terms_checked: false },
      { ...feed, id: "summary", summarize: true },
    ]);
    const { exitCode, errors, report, lines } = run();
    const warns = report.issues
      .filter((i) => i.severity === "warn")
      .map((i) => [i.stage, i.file, i.path]);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(warns).toEqual([
      ["configs", "configs/sources.json", "[1].robots_checked"],
      ["configs", "configs/sources.json", "[2].terms_checked"],
      ["configs", "configs/sources.json", "[3].summarize"],
    ]);
    expect(lines.filter((l) => l.startsWith("[validate] 경고 "))).toHaveLength(
      3,
    );
    expect(lines.at(-1)).toMatch(/^\[validate\] 검증 통과 — .* · 경고 3건$/);
  });

  it("스키마 오류가 있는 sources.json은 경고 검사를 건너뛴다(오류만)", () => {
    write("configs/takedowns.json", "[]");
    write("configs/sources.json", [{ ...feed, summarize: true, weight: 9 }]);
    const { exitCode, report } = run();
    expect(exitCode).toBe(1);
    expect(report.issues.some((i) => i.severity === "warn")).toBe(false);
  });

  it("저장소 configs/sources.json은 경고 0건", () => {
    write("configs/takedowns.json", "[]");
    write(
      "configs/sources.json",
      readFileSync(
        fileURLToPath(new URL("../configs/sources.json", import.meta.url)),
        "utf8",
      ),
    );
    const { exitCode, report } = run();
    expect(exitCode).toBe(0);
    expect(report.issues.filter((i) => i.severity === "warn")).toEqual([]);
  });
});

describe("⑦ 필수 파일 누락", () => {
  it("takedowns.json이 없으면 오류", () => {
    write("configs/sources.json", loadFixture("configs/sources.json"));
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/takedowns.json — 필수 설정 파일이 없음 · 삭제·정정 요청 카드 (FR-143)",
    ]);
  });

  it("configs/ 폴더 자체가 없어도 같은 오류로 끝난다(예외로 죽지 않음)", () => {
    const { exitCode, errors, report } = run();

    expect(exitCode).toBe(1);
    expect(report.counts).toEqual({ configs: 0, data: 0, prompts: 0 });
    expect(errors).toEqual([
      "configs/takedowns.json — 필수 설정 파일이 없음 · 삭제·정정 요청 카드 (FR-143)",
    ]);
  });
});

describe("CI 연결 — 워크플로가 validate를 빌드·커밋 전에 실행한다", () => {
  const workflow = (name: string) =>
    readFileSync(
      fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)),
      "utf8",
    );

  it.each([
    [
      "ci.yml",
      ["run: npm run check", "run: npm run validate", "run: npm run build"],
    ],
    [
      "collect.yml",
      [
        "npm run collect -- ",
        "run: npm run validate",
        "run: npm run build",
        "git commit",
      ],
    ],
  ])("%s", (name, steps) => {
    const text = workflow(name);
    const positions = steps.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

// ─── M1-25 발행 검증 게이트 (FR-153·FR-143·D32) ─────────────────────────────

describe("⑧ 발행 검증 게이트 — 실제 파일 읽기 + 실행 시각", () => {
  /** 06:31 KST 2026-10-17 */
  const NOW = new Date("2026-10-16T21:31:00.000Z");

  function runAt(options: { now?: Date; publishDate?: string } = { now: NOW }) {
    const report = buildValidationReport(
      readValidationSnapshot(root, { configsOnly: false }),
      { configsOnly: false, ...options },
    );
    const of = (severity: "error" | "warn") =>
      report.issues.filter((i) => i.severity === severity).map(formatIssue);
    return {
      report,
      errors: of("error"),
      warns: of("warn"),
      exitCode: validationExitCode(report),
      lines: formatValidationReport(report),
    };
  }

  /** 원제목+링크 카드 n장(유효한 일별 파일) */
  function issue(date: string, n: number, extra: object[] = []) {
    const cards = Array.from({ length: n }, (_, i) => ({
      id: `c_${(i + 1).toString(16).padStart(10, "0")}`,
      t: `Title ${i + 1}`,
      s: [],
      cat: "other",
      comp: [],
      teams: [],
      players: [],
      imp: 3,
      kr: false,
      spoiler: false,
      src: [
        {
          n: "Sample",
          u: `https://example.com/news/${date}/${i + 1}`,
          at: "2026-10-16T20:00:00Z",
          tier: 2,
        },
      ],
      lang: "en",
      ai: false,
      created: "2026-10-16T21:30:00Z",
    }));
    return {
      date,
      generatedAt: "2026-10-16T21:31:00Z",
      runId: "prod-collect-20261016T213000Z",
      cards: [...cards, ...extra],
    };
  }

  it("오늘(KST) 파일 카드 수가 하한 미만이면 오류 — 요약 줄에 하한·평시 표시", () => {
    write("configs/takedowns.json", "[]");
    write("data/news/2026-10-17.json", issue("2026-10-17", 9));
    const { exitCode, errors, lines } = runAt();

    expect(exitCode).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^data\/news\/2026-10-17\.json:cards — 카드 9장 < 하한 10장\(평시/,
    );
    expect(lines).toContain(
      "[validate] 발행 게이트: 뉴스 1개 · 브리핑 0개 · 2026-10-17 카드 9장 · 하한 10장(평시) · 오류 1건 · 경고 0건",
    );
  });

  it("오늘 파일이 없으면(사람 push의 CI) 하한을 건너뛰고 통과, --publish-date면 오류", () => {
    write("configs/takedowns.json", "[]");
    write("data/news/2026-10-14.json", issue("2026-10-14", 8)); // 하한 이전 발행분
    const loose = runAt();
    expect(loose.exitCode).toBe(0);
    expect(loose.lines).toContain(
      "[validate] 발행 게이트: 뉴스 1개 · 브리핑 0개 · 2026-10-17 발행 파일 없음 — 카드 수 하한 건너뜀 · 오류 0건 · 경고 0건",
    );
    const strict = runAt({ now: NOW, publishDate: "2026-10-17" });
    expect(strict.exitCode).toBe(1);
    expect(strict.errors[0]).toMatch(
      /발행 파일이 없음\(--publish-date 2026-10-17\)/,
    );
  });

  it("삭제 요청 카드가 data에 남아 있으면 경고만(등록 push가 막히지 않게) — 72시간 지남도 경고", () => {
    write("configs/takedowns.json", [
      {
        id: "c_0000000003",
        requestedAt: "2026-10-12T00:00:00Z",
        handledAt: null,
        reason: "저작권자 삭제 요청 (#12)",
      },
    ]);
    write("data/news/2026-10-17.json", issue("2026-10-17", 10));
    const { exitCode, warns, lines } = runAt();

    expect(exitCode).toBe(0);
    expect(warns).toEqual([
      "data/news/2026-10-17.json:cards[2] — 삭제 요청 카드 c_0000000003가 남아 있음 — 빌드에서는 이미 제외, 다음 수집 실행이 원본을 지운다(FR-143)",
      "configs/takedowns.json:[0].handledAt — 삭제 요청 c_0000000003 접수 후 117시간 — 72시간 기준(FR-143)을 넘었는데 handledAt이 null. 배포 확인 후 기록할 것(/takedown)",
    ]);
    expect(lines.at(-1)).toMatch(/검증 통과 — .* · 경고 2건$/);
  });

  it("ai:true 뉴스 카드는 지난 파일에 있어도 오류(Actions 주석 제목 = 발행 검증 게이트)", () => {
    write("configs/takedowns.json", "[]");
    const aiCard = { ...issue("2026-10-12", 1).cards[0], ai: true };
    write("data/news/2026-10-12.json", {
      ...issue("2026-10-12", 0),
      cards: [aiCard],
    });
    const { exitCode, errors, report } = runAt();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'data/news/2026-10-12.json:cards[0].ai — 뉴스 카드 ai:true(c_0000000001) — 뉴스 기사는 LLM을 거치지 않는다(D23). "AI 작성" 라벨 없이 AI 제목이 게시되지 않게 발행을 막는다',
    ]);
    expect(formatValidationReport(report, { annotations: true })).toContain(
      '::error file=data/news/2026-10-12.json,title=발행 검증 게이트 (FR-153)::cards[0].ai — 뉴스 카드 ai:true(c_0000000001) — 뉴스 기사는 LLM을 거치지 않는다(D23). "AI 작성" 라벨 없이 AI 제목이 게시되지 않게 발행을 막는다',
    );
  });

  it("스키마 오류 파일은 게이트에서 빠진다(같은 문제를 두 번 보고하지 않음)", () => {
    write("configs/takedowns.json", "[]");
    write("data/news/2026-10-17.json", {
      ...issue("2026-10-17", 3),
      runId: "",
    });
    const { errors, report } = runAt();
    expect(errors).toEqual([
      "data/news/2026-10-17.json:runId — Too small: expected string to have >=1 characters",
    ]);
    expect(report.gate?.floor?.state).toBe("invalid");
  });

  it("--configs-only면 게이트를 돌리지 않는다(요약 줄 없음)", () => {
    write("configs/takedowns.json", "[]");
    write("data/news/2026-10-17.json", issue("2026-10-17", 1));
    const { report, lines } = run(true);
    expect(report.gate).toBeUndefined();
    expect(lines.some((l) => l.includes("발행 게이트"))).toBe(false);
  });

  it("저장소 data/·configs/ 그대로면 통과한다(오늘 날짜와 무관한 검사만 — 시각 없이)", () => {
    const repo = fileURLToPath(new URL("../", import.meta.url));
    cpSync(path.join(repo, "configs"), path.join(root, "configs"), {
      recursive: true,
    });
    cpSync(path.join(repo, "data"), path.join(root, "data"), {
      recursive: true,
    });
    const { exitCode, errors } = runAt({});
    expect(errors).toEqual([]);
    expect(exitCode).toBe(0);
  });
});

describe("⑨ 같은 매체명 = 같은 보존 기간 (M1-25 — M1-02 이월)", () => {
  const source = {
    id: "athletic-a",
    name: "The Athletic — Football",
    type: "rss",
    url: "https://example.com/a.xml",
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 1,
    retentionDays: 7,
    terms_checked: true,
    robots_checked: false,
  };

  it("같은 매체명인데 retentionDays가 다르면(없음 포함) 오류", () => {
    write("configs/takedowns.json", "[]");
    write("configs/sources.json", [
      source,
      {
        ...source,
        id: "athletic-b",
        name: "The Athletic — Transfers",
        retentionDays: undefined,
      },
    ]);
    const { exitCode, errors } = run(true);
    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'configs/sources.json:[1].retentionDays — 매체명 "The Athletic"의 소스끼리 retentionDays가 다름(athletic-a: 7, athletic-b: 없음) — 카드 출처는 매체명으로 보존 기간을 찾으므로 같은 값이어야 한다(D32·M1-25)',
    ]);
  });

  it("같은 값이면 통과", () => {
    write("configs/takedowns.json", "[]");
    write("configs/sources.json", [
      source,
      { ...source, id: "athletic-b", name: "The Athletic — Transfers" },
    ]);
    expect(run(true).exitCode).toBe(0);
  });
});
