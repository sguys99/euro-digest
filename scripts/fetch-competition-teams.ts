/**
 * 6개 대회 참가 팀 목록 받기 — 일회성 도구 (M2-04, FR-50, PRD §15 D33·D63 ③). 시즌 전환(`/new-season`) 때 다시 쓴다.
 *
 * 사용법: node --env-file-if-exists=.env.local --import tsx scripts/fetch-competition-teams.ts [--write]
 *   (인자 없음)  6개 대회 `/v4/competitions/{code}/teams?season=<competitions.json season>`을 받아 요약만 출력한다
 *   --write      `fixtures/football/football-data/teams-<code>-<season>.json`(축약 — 팀 목록에 필요한 필드만)으로 저장하고
 *                `fixtures/football/index.json` `files[]`를 갱신한다. 이후 `scripts/build-team-ids.ts`가 이 파일만 읽는다(네트워크 없음)
 *
 * 호출: football-data 6요청(동시 1개, 응답 후 6.5초 간격 — providers/football-data.ts 클라이언트 정책 그대로). 키는
 * FOOTBALL_DATA_API_KEY 환경변수로만 받고 출력하지 않는다. 응답 본문은 로그에 남기지 않는다.
 *
 * 축약 규칙(fixtures/football/README.md "지운 것과 그대로 둔 것"): 팀 항목은 area(id·name·code, flag → null)·id·name·
 * shortName·tla(원문 그대로 — 스트라스부르 `"RC "`)·crest(→ null)·clubColors만 남긴다. squad·coach·staff·주소·웹사이트·
 * 창단 연도·경기장·runningCompetitions·lastUpdated·marketValue와 `filters`는 지운다(API 파생 데이터 최소화 — 팀 목록만).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CompetitionsFileSchema } from "@/lib/schema";
import { nowUtcIso, utcDate } from "@/lib/time";

import { readConfigFile } from "./lib/config-files";
import {
  createFootballDataClient,
  teamsPath,
  toCompetitionTeams,
} from "./lib/providers/football-data";

const TAG = "[fetch-competition-teams]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FIXTURES = path.join(ROOT_DIR, "fixtures/football");

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 이미지 값(crest·flag·emblem)을 null로 — 지운 개수를 센다 */
function nullImage(value: unknown, counter: { images: number }): null {
  if (typeof value === "string" && value !== "") counter.images += 1;
  return null;
}

/** 응답 원문 → 축약 fixture(위 규칙). 형식이 틀린 팀 항목은 그대로 버린다(어댑터가 다시 검증) */
export function trimTeamsResponse(json: unknown): {
  trimmed: Json;
  images: number;
  original: { teams: number; teamKeys: string[] };
} {
  const counter = { images: 0 };
  if (!isObject(json)) throw new Error("팀 목록 응답이 객체가 아니다");
  const competition = isObject(json.competition) ? json.competition : {};
  const season = isObject(json.season) ? json.season : {};
  const teams = Array.isArray(json.teams) ? json.teams : [];
  const teamKeys = new Set<string>();
  const trimmedTeams = teams.filter(isObject).map((team) => {
    for (const key of Object.keys(team)) teamKeys.add(key);
    const area = isObject(team.area) ? team.area : null;
    return {
      area:
        area === null
          ? null
          : {
              id: area.id ?? null,
              name: area.name ?? null,
              code: area.code ?? null,
              flag: nullImage(area.flag, counter),
            },
      id: team.id,
      name: team.name,
      shortName: team.shortName ?? null,
      tla: team.tla ?? null,
      crest: nullImage(team.crest, counter),
      clubColors: team.clubColors ?? null,
    };
  });
  return {
    trimmed: {
      count: trimmedTeams.length,
      competition: {
        id: competition.id ?? null,
        name: competition.name ?? null,
        code: competition.code ?? null,
        type: competition.type ?? null,
        emblem: nullImage(competition.emblem, counter),
      },
      season: {
        id: season.id ?? null,
        startDate: season.startDate ?? null,
        endDate: season.endDate ?? null,
        currentMatchday: season.currentMatchday ?? null,
        winner: null,
      },
      teams: trimmedTeams,
    },
    images: counter.images,
    original: { teams: teams.length, teamKeys: [...teamKeys].sort() },
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { write: { type: "boolean", default: false } },
    strict: true,
  });
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    console.error(`${TAG} FOOTBALL_DATA_API_KEY 없음 — 호출하지 않음`);
    return 1;
  }
  const competitions = await readConfigFile(
    ROOT_DIR,
    "competitions.json",
    CompetitionsFileSchema,
  );
  const client = createFootballDataClient({ apiKey, fetch });
  const written: Json[] = [];
  for (const comp of competitions) {
    const code = comp.footballDataCode;
    const endpoint = `/v4${teamsPath(code, comp.season)}`;
    const json = await client.getTeams(code, comp.season);
    const fetchedAt = nowUtcIso();
    const adapted = toCompetitionTeams(json);
    console.log(
      `${TAG} ${comp.id} ${code}: 팀 ${adapted.teams.length}개(버림 ${adapted.dropped}) · 시즌 시작 ${adapted.seasonStart ?? "?"}`,
    );
    if (!values.write) continue;
    const { trimmed, images, original } = trimTeamsResponse(json);
    const rel = `football-data/teams-${code.toLowerCase()}-${comp.season}.json`;
    const text = JSON.stringify(trimmed);
    writeFileSync(path.join(FIXTURES, rel), text);
    written.push({
      path: rel,
      api: "football-data",
      kind: "fd-teams",
      endpoint,
      fetchedAt,
      asOf: utcDate(fetchedAt),
      comp: comp.id,
      origin: "M2-04",
      trimmed: {
        rule: "팀 항목은 area(id·name·code·flag)·id·name·shortName·tla·crest·clubColors만 남김(squad·coach·staff·address·website·founded·venue·runningCompetitions·lastUpdated 등 삭제), filters 삭제",
        kept: trimmed.count as number,
        original: { teams: original.teams, teamKeys: original.teamKeys },
      },
      cases: [],
      removed: images > 0 ? { imageUrls: images } : {},
      bytes: Buffer.byteLength(text),
    });
  }
  console.log(
    `${TAG} football-data 요청 ${client.calls}건(재시도 ${client.retries})`,
  );
  if (values.write) {
    const indexFile = path.join(FIXTURES, "index.json");
    const index = JSON.parse(readFileSync(indexFile, "utf8")) as Json;
    const files = (Array.isArray(index.files) ? index.files : []) as Json[];
    const paths = new Set(written.map((w) => w.path));
    index.files = [...files.filter((f) => !paths.has(f.path)), ...written];
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`${TAG} fixtures ${written.length}개 저장 · index.json 갱신`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `${TAG} 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
