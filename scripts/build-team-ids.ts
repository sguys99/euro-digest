/**
 * `configs/team-ids.json` 초안 만들기 — 일회성 도구 (M1-44, PRD §15 D33 ⑤). 네트워크·LLM 호출 없음(fixtures만 읽는다).
 *
 * 사용법: npx tsx scripts/build-team-ids.ts [--roster [--af-pairs <파일>] [--af-source <설명>] [--renames <파일>]] [--write] [--review <파일>] [--date YYYY-MM-DD]
 *   --roster      M2-04 팀 목록 모드(아래) — 없으면 M1-44 초안 모드
 *   (인자 없음)   초안 요약과 확인용 표를 출력만 한다
 *   --write       configs/team-ids.json에 쓴다(커밋은 사람이 확인한 뒤 — D33)
 *   --review      확인용 표(Markdown)를 그 파일에 쓴다(저장소 밖 경로 권장)
 *   --date        note에 남길 초안 날짜(기본: 오늘 KST)
 * 종료 코드: 0 = 문제 없음 · 2 = 문제 목록이 있음(표 끝 "문제") · 1 = 실행 실패
 *
 * 입력: fixtures/football/index.json `teamIdPairs`·`matchIdPairs`, fixtures/football 원본 응답(짝짓기 도우미로 근거 재확인),
 * configs/competitions.json·korean-players.json·names.ko.json, M0-32에서 확인한 한국 선수 소속팀 API-Football 팀 id.
 * 판단 로직은 scripts/lib/team-ids-draft.ts(순수 함수). npm script는 두지 않는다 — 초안을 한 번 만들고 나면 나머지 팀은
 * 실행 때 짝짓기 후보(운영 리포트)로 더한다.
 *
 * `--roster` (M2-04, FR-50, PRD §15 D63 ③ — 시즌 전환 `/new-season` 때 다시 쓴다): 6개 대회 참가 팀 fixtures
 * (`fixtures/football/football-data/teams-<code>-<season>.json` — scripts/fetch-competition-teams.ts)로 전 팀 대응표를 만든다.
 * slug는 scripts/lib/team-slugs.ts 규칙(+예외표), af는 지금 대응표 → `--af-pairs`(경기 원장 ↔ football-data 같은 기간 종료 경기를
 * `suggestTeamIdPairs`로 맞춘 PairingReport JSON — 원본 응답은 저장소 밖) 순, 근거가 없으면 null. `--renames`는 옛 → 새 slug 표
 * (scripts/migrate-team-slugs.ts 입력 확인용)를 쓴다. 판단 로직은 scripts/lib/team-roster.ts.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
} from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import { readConfigFile } from "./lib/config-files";
import { toCompetitionTeams } from "./lib/providers/football-data";
import {
  buildTeamIdIndex,
  suggestTeamIdPairs,
  type PairingReport,
} from "./lib/team-ids";
import {
  buildTeamIdsDraft,
  formatDraftReview,
  FixtureIndexSchema,
  koreanTeamsFrom,
  readAfFixtures,
  readFdFixtures,
} from "./lib/team-ids-draft";
import { buildTeamRoster, formatRosterReview } from "./lib/team-roster";
import { checkKoreanPlayerTeamIds } from "./lib/validate-crossref";

const TAG = "[build-team-ids]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FIXTURES = path.join(ROOT_DIR, "fixtures/football");

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** 폴더의 .json(이름 순) — `prefix`가 있으면 그 이름으로 시작하는 것만 */
function readJsonDir(dir: string, prefix = ""): unknown[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f.startsWith(prefix))
    .sort()
    .map((f) => readJson(path.join(dir, f)));
}

interface CliValues {
  write: boolean;
  review?: string;
  roster: boolean;
  "af-pairs"?: string;
  "af-source"?: string;
  renames?: string;
}

/** M2-04 팀 목록 모드 — 네트워크 없음 */
async function mainRoster(values: CliValues, date: string): Promise<number> {
  const competitions = await readConfigFile(
    ROOT_DIR,
    "competitions.json",
    CompetitionsFileSchema,
  );
  const existing = await readConfigFile(
    ROOT_DIR,
    "team-ids.json",
    TeamIdsFileSchema,
  );
  const namesKo = await readConfigFile(
    ROOT_DIR,
    "names.ko.json",
    NamesKoFileSchema,
  );
  const compTeams = competitions.map((c) => {
    const file = path.join(
      FIXTURES,
      "football-data",
      `teams-${c.footballDataCode.toLowerCase()}-${c.season}.json`,
    );
    const adapted = toCompetitionTeams(readJson(file));
    if (adapted.dropped > 0) {
      console.warn(`${TAG} ${c.id} 형식이 틀린 팀 ${adapted.dropped}개 버림`);
    }
    return { comp: c.id, teams: adapted.teams };
  });
  const pairing: PairingReport | null = values["af-pairs"]
    ? (readJson(values["af-pairs"]) as PairingReport)
    : null;
  const roster = buildTeamRoster({
    compTeams,
    existing,
    afCandidates: pairing?.candidates ?? [],
    afCandidateSource:
      values["af-source"] ?? "경기 원장 ↔ football-data 종료 경기 대조",
    date,
    nameSlugs: namesKo.entries.flatMap((e) =>
      e.kind === "team" && e.slug !== undefined
        ? [{ slug: e.slug, en: e.en }]
        : [],
    ),
  });
  const parsed = TeamIdsFileSchema.safeParse(roster.file);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      roster.problems.push(
        `스키마 오류 ${issue.path.join(".")}: ${issue.message}`,
      );
    }
  }
  const review = formatRosterReview(roster);
  console.log(
    `${TAG} 팀 ${roster.rows.length}개 · slug 변경 ${Object.keys(roster.renames).length}건 · af 미확인 ${roster.rows.filter((r) => r.af === null).length} · 약어 충돌 ${roster.tlaCollisions.length} · 문제 ${roster.problems.length}건`,
  );
  if (values.review) {
    writeFileSync(values.review, review, "utf8");
    console.log(`${TAG} 확인용 표 → ${values.review}`);
  } else {
    console.log(review);
  }
  if (values.renames) {
    writeFileSync(
      values.renames,
      `${JSON.stringify(roster.renames, null, 2)}\n`,
      "utf8",
    );
    console.log(`${TAG} 옛 → 새 slug 표 → ${values.renames}`);
  }
  if (values.write) {
    if (!parsed.success || roster.problems.length > 0) {
      console.error(`${TAG} 문제가 있어 쓰지 않는다`);
      return 2;
    }
    const target = path.join(ROOT_DIR, "configs/team-ids.json");
    writeFileSync(target, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    console.log(`${TAG} configs/team-ids.json 작성(${roster.rows.length}팀)`);
  }
  return roster.problems.length > 0 ? 2 : 0;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      review: { type: "string" },
      date: { type: "string" },
      roster: { type: "boolean", default: false },
      "af-pairs": { type: "string" },
      "af-source": { type: "string" },
      renames: { type: "string" },
    },
    strict: true,
  });
  const draftDate = values.date ?? kstDate(nowUtcIso());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) {
    console.error(`${TAG} --date는 YYYY-MM-DD (받은 값: ${draftDate})`);
    return 1;
  }
  if (values.roster) return mainRoster(values, draftDate);

  const competitions = await readConfigFile(
    ROOT_DIR,
    "competitions.json",
    CompetitionsFileSchema,
  );
  const koreanPlayers = await readConfigFile(
    ROOT_DIR,
    "korean-players.json",
    KoreanPlayersFileSchema,
  );
  const namesKo = await readConfigFile(
    ROOT_DIR,
    "names.ko.json",
    NamesKoFileSchema,
  );
  const index = FixtureIndexSchema.parse(
    readJson(path.join(FIXTURES, "index.json")),
  );
  const fd = readFdFixtures(
    readJsonDir(path.join(FIXTURES, "football-data")),
    competitions,
  );
  const af = readAfFixtures(
    readJsonDir(path.join(FIXTURES, "api-football"), "fixtures-"),
    competitions,
  );
  const pairing = suggestTeamIdPairs(fd.finished, af);

  const draft = buildTeamIdsDraft({
    indexPairs: index.teamIdPairs.pairs,
    fdTeams: fd.teams,
    fdMatchStatus: new Map(
      index.matchIdPairs.pairs.map((p) => [p.fd, p.fdStatus]),
    ),
    afMatchStatus: new Map(
      index.matchIdPairs.pairs.map((p) => [p.af, p.afStatus]),
    ),
    pairing,
    koreanTeams: koreanTeamsFrom(koreanPlayers),
    nameSlugs: namesKo.entries.flatMap((e) =>
      e.kind === "team" && e.slug !== undefined
        ? [{ slug: e.slug, en: e.en }]
        : [],
    ),
    compOrder: competitions.map((c) => c.id),
    draftDate,
  });

  // 검증 — 스키마(fd·af 중복)·한국 선수 교차 검사·만든 대응표로 다시 짝짓기
  const parsed = TeamIdsFileSchema.safeParse(draft.file);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      draft.problems.push(
        `스키마 오류 ${issue.path.join(".")}: ${issue.message}`,
      );
    }
  } else {
    for (const issue of checkKoreanPlayerTeamIds(koreanPlayers, parsed.data)) {
      draft.problems.push(`교차 검사: ${issue.path} ${issue.message}`);
    }
    const again = suggestTeamIdPairs(
      fd.finished,
      af,
      buildTeamIdIndex(parsed.data),
    );
    if (again.candidates.length > 0 || again.conflicts.length > 0) {
      draft.problems.push(
        `대응표로 다시 짝지었는데 후보 ${again.candidates.length}·충돌 ${again.conflicts.length}건이 남음`,
      );
    }
  }

  const review = formatDraftReview(draft);
  const weak = draft.rows.filter((r) => r.strength === "weak").length;
  const flagged = draft.rows.filter((r) => r.flags.length > 0).length;
  console.log(
    `${TAG} 행 ${draft.rows.length}개 · 근거 약함 ${weak}개 · 확인 필요 ${flagged}개 · 문제 ${draft.problems.length}건 · 짝지은 경기 ${pairing.matchPairs.length}건(fd 종료 ${fd.finished.length} · af 대상 대회 ${af.length}) · 미짝 ${pairing.unmatched.length} · 모호 ${pairing.ambiguous.length}`,
  );
  if (values.review) {
    writeFileSync(values.review, review, "utf8");
    console.log(`${TAG} 확인용 표 → ${values.review}`);
  } else {
    console.log(review);
  }
  if (values.write) {
    if (!parsed.success) {
      console.error(`${TAG} 스키마 오류가 있어 쓰지 않는다`);
      return 1;
    }
    const target = path.join(ROOT_DIR, "configs/team-ids.json");
    writeFileSync(target, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    console.log(
      `${TAG} configs/team-ids.json 작성 — 커밋 전에 사람이 확인할 것(D33)`,
    );
  }
  return draft.problems.length > 0 ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `${TAG} 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  },
);
