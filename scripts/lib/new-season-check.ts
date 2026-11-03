/**
 * `/new-season` 읽기 전용 점검 (M5-11, FR-156) — 지금 configs·코드 표·data가 대상 시즌으로 넘어갈 준비가 됐는지 본다. 순수 함수만 둔다
 * (입력은 스키마를 통과한 값 — 읽기는 scripts/new-season-check.ts). 네트워크·LLM 호출 없음, 파일을 쓰지 않는다.
 *
 * `npm run validate`(스키마·교차 참조 — 파일 하나하나가 맞는가)와 달리 **시즌 하나로 맞물렸는가**를 본다:
 *   ① 시기       기준일(KST)이 지금 설정 시즌의 어디인가 — 시즌 중 전환·대상 시즌 역행을 막는다
 *   ② 시즌·기간   competitions.json 대회 6개의 season = 대상, startDate 연도 = 대상, endDate 연도 = 대상 + 1, 팀 → 리그 표 시즌 = 대상,
 *                 원장 meta.season = 대상(새 시즌 since 규칙 — M1-48 이월, 아직 없음), data/competitions 파일 시즌
 *   ③ 팀 목록     팀 → 리그 표(TEAM_LEAGUES·UCL_TEAMS) 리그별 팀 수 = teamCount, 리그 사이 중복 없음, 표 = team-ids.json 키(6개 대회 팀만
 *                 — tests/team-leagues.test.ts), 팀마다 fd·af id · team-colors · names.ko 팀 항목(slug) · formations 키
 *   ④ 한국 선수   활성 선수 소속팀이 이번 시즌 6개 대회 팀 · comp = 소속팀 리그 · 소속팀 af id · apiFootballId, 축약 별칭 소속팀 표
 *                 (KNOWN_PLAYER_TEAMS)의 팀
 *   ⑤ 오늘 밤     더비 두 팀이 같은 리그 · 빅클럽(bigmatch-rules·뉴스 점수화 BIG_CLUBS)이 이번 시즌 팀
 *   ⑥ 이적 창     리그마다 대상 시즌 여름·겨울 창과 다음 여름 창 — 없음·추정(sourceUrl 없음)·곧 열리는 추정 창
 *   ⑦ 대표팀      기준일 뒤 A매치 일정이 있는가(휴식기 판정 근거)
 *   ⑧ 파생 파일   data/teams 파일 = 이번 시즌 팀(지난 시즌 팀 파일 처리는 사용자 결정 — /new-season), public/og/teams PNG
 *
 * 심각도: error = 이대로 전환하면 검사(validate·check)가 실패하거나 기록이 조용히 빠진다 · warn = 사람이 확인할 것 · info = 참고.
 * error가 0이면 "준비됨". 대상 시즌을 지금 설정 시즌으로 두면 정합성 점검(오늘 상태가 맞는지), 다음 시즌으로 두면 남은 일 목록이다.
 */
import type {
  BigmatchRulesFile,
  CompId,
  CompetitionsFile,
  FormationsFile,
  KoreanPlayersFile,
  MatchLedgerMeta,
  NamesKoFile,
  NationalTeamFile,
  TeamColorsFile,
  TeamIdsFile,
  TransferWindowsFile,
} from "@/lib/schema";
import { seasonLabel } from "@/lib/rest-period";
import { kstDate } from "@/lib/time";

/** 리그 id(UCL 제외) — scripts/lib/team-leagues.ts LeagueId와 같다 */
type LeagueId = Exclude<CompId, "UCL">;

const LEAGUES: readonly LeagueId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
];

export type NewSeasonSeverity = "error" | "warn" | "info";

export interface NewSeasonFinding {
  severity: NewSeasonSeverity;
  message: string;
  /** 고치는 법(명령·파일) — 없으면 생략 */
  fix?: string;
}

export interface NewSeasonSection {
  id: string;
  title: string;
  /** 확인한 값 한 줄(판정과 무관한 사실) */
  summary: string;
  findings: NewSeasonFinding[];
}

export interface NewSeasonReport {
  /** 대상 시즌(시작 연도) */
  target: number;
  /** 지금 설정 시즌(competitions.json 최댓값 — 수집이 쓰는 값과 같다), 대회가 없으면 null */
  current: number | null;
  /** 기준일(KST YYYY-MM-DD) */
  today: string;
  sections: NewSeasonSection[];
  counts: Record<NewSeasonSeverity, number>;
  /** error 0 */
  ready: boolean;
}

/** 점검 입력 — 스키마를 통과한 configs + 코드 표 + data 요약 */
export interface NewSeasonInput {
  competitions: CompetitionsFile;
  teamIds: TeamIdsFile;
  teamColors: TeamColorsFile;
  names: NamesKoFile;
  koreanPlayers: KoreanPlayersFile;
  transferWindows: TransferWindowsFile;
  nationalTeam: NationalTeamFile;
  bigmatch: BigmatchRulesFile;
  formations: FormationsFile;
  /** 팀 → 리그 표(scripts/lib/team-leagues.ts) */
  table: {
    season: number;
    leagues: Readonly<Record<LeagueId, readonly string[]>>;
    ucl: readonly string[];
  };
  /** 축약 별칭 선수 → 소속팀(scripts/lib/names.ts KNOWN_PLAYER_TEAMS) */
  knownPlayerTeams: Readonly<Record<string, string>>;
  /** 뉴스 점수화 빅클럽 slug(scripts/lib/news-keywords.ts BIG_CLUBS) */
  bigClubs: readonly string[];
  /** data/matches/meta.json — 없으면 null(원장 시작 전) */
  ledgerMeta: MatchLedgerMeta | null;
  /** data/competitions/*.json의 대회·시즌(스키마 통과분) */
  competitionFiles: ReadonlyArray<{ comp: CompId; season: number }>;
  /** data/teams/*.json 파일 이름의 slug */
  teamFiles: readonly string[];
  /** public/og/teams/*.png 파일 이름의 slug */
  ogTeamImages: readonly string[];
}

export interface NewSeasonOptions {
  /** 대상 시즌(시작 연도) */
  target: number;
  /** 기준일(KST YYYY-MM-DD) */
  today: string;
  /** "곧 열리는" 추정 이적 창 기준(일) — 기본 45 */
  windowLeadDays?: number;
}

/** 시즌 "2026-27" */
export function seasonSpan(season: number): string {
  return seasonLabel(season).replace(/ 시즌$/, "");
}

/** `--season` 값 "2027" · "2027-28" → 시작 연도. 형식이 틀리면 null */
export function parseSeasonArg(raw: string): number | null {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return null;
  if (m[2] !== undefined && Number(m[2]) !== (year + 1) % 100) return null;
  return year;
}

/** 목록을 짧게 — 앞 n개 + "외 k" */
function list(items: readonly string[], n = 8): string {
  if (items.length <= n) return items.join(", ");
  return `${items.slice(0, n).join(", ")} 외 ${items.length - n}`;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

/** 날짜(YYYY-MM-DD) + n일 */
function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 6개 대회 팀 slug — 리그 순 → UCL 밖 팀(scripts/lib/team-leagues.ts allTeamSlugs와 같은 순서) */
function seasonTeamsOf(table: NewSeasonInput["table"]): string[] {
  const seen = new Set<string>();
  for (const league of LEAGUES)
    for (const slug of table.leagues[league]) seen.add(slug);
  for (const slug of table.ucl) seen.add(slug);
  return [...seen];
}

function leagueIndexOf(
  table: NewSeasonInput["table"],
): ReadonlyMap<string, LeagueId> {
  const index = new Map<string, LeagueId>();
  for (const league of LEAGUES)
    for (const slug of table.leagues[league])
      if (!index.has(slug)) index.set(slug, league);
  return index;
}

// ─── ① 시기 ───────────────────────────────────────────────────────────────

function timingSection(
  input: NewSeasonInput,
  current: number | null,
  opts: NewSeasonOptions,
): NewSeasonSection {
  const { target, today } = opts;
  const findings: NewSeasonFinding[] = [];
  const comps = input.competitions;
  let summary = "";
  if (comps.length === 0 || current === null) {
    findings.push({
      severity: "error",
      message: "competitions.json에 대회가 없음 — 시즌을 판정할 수 없다",
    });
    return { id: "timing", title: "시기", summary, findings };
  }
  const lastEnd = comps.reduce((a, c) => (c.endDate > a ? c.endDate : a), "");
  // 아직 개막하지 않은 대회 중 가장 이른 개막일(2단계 전환 중에는 UCL만 지난 시즌일 수 있다)
  const nextStart = comps
    .filter((c) => c.startDate > today)
    .reduce((a, c) => (a === "" || c.startDate < a ? c.startDate : a), "");
  const inSeason = comps.filter(
    (c) => c.startDate <= today && today <= c.endDate,
  );
  const phase =
    inSeason.length > 0
      ? `시즌 중(${inSeason.map((c) => c.id).join("·")})`
      : nextStart !== ""
        ? `개막 전(첫 개막 ${nextStart})`
        : `모든 대회 종료(마지막 ${lastEnd})`;
  summary = `설정 ${seasonSpan(current)} · ${phase}`;
  if (target < current) {
    findings.push({
      severity: "error",
      message: `대상 ${seasonSpan(target)}이 설정 시즌 ${seasonSpan(current)}보다 이르다`,
      fix: "--season 값을 확인할 것",
    });
  } else if (target > current) {
    if (today <= lastEnd) {
      findings.push({
        severity: "warn",
        message: `설정 시즌 ${seasonSpan(current)}이 아직 ${phase} — 마지막 경기일 ${lastEnd} 뒤에 전환한다`,
        fix: "지금은 남은 일 확인만. competitions.json season을 바꾸면 순위·경기 수집이 바로 새 시즌을 받는다",
      });
    } else {
      findings.push({
        severity: "info",
        message: `${phase} — 전환 시기. 새 시즌 데이터가 football-data에 열렸는지(대회 팀 목록) 확인한 뒤 바꾼다`,
      });
    }
  } else if (today > lastEnd) {
    findings.push({
      severity: "warn",
      message: `설정 시즌 ${seasonSpan(current)}의 모든 대회가 끝났다(${lastEnd}) — 다음 시즌 전환(/new-season ${seasonSpan(current + 1)}) 차례`,
    });
  }
  return { id: "timing", title: "시기", summary, findings };
}

// ─── ② 시즌·기간 ──────────────────────────────────────────────────────────

function seasonSection(
  input: NewSeasonInput,
  opts: NewSeasonOptions,
): NewSeasonSection {
  const { target } = opts;
  const findings: NewSeasonFinding[] = [];
  const seasons = new Set(input.competitions.map((c) => c.season));
  const leagueSeasons = new Set(
    input.competitions.filter((c) => c.id !== "UCL").map((c) => c.season),
  );
  // 2단계 전환(/new-season — 리그 먼저, UCL은 리그 페이즈 추첨 뒤): 리그가 모두 대상이고 UCL만 한 시즌 뒤면 경고로 둔다
  const ucl = input.competitions.find((c) => c.id === "UCL");
  const uclLagging =
    ucl !== undefined &&
    ucl.season === target - 1 &&
    leagueSeasons.size === 1 &&
    leagueSeasons.has(target);
  if (uclLagging) {
    findings.push({
      severity: "warn",
      message: `UCL만 ${seasonSpan(ucl.season)} — 2단계 전환 대기(리그 페이즈 추첨 뒤 UCL season·UCL_TEAMS를 바꾼다). 그동안 이적 이슈의 행선지 리그 판정은 쉰다(대회 시즌이 하나가 아님)`,
      fix: "/new-season 2단계",
    });
  } else if (seasons.size > 1) {
    findings.push({
      severity: "error",
      message: `competitions.json 대회 시즌이 섞여 있음(${[...seasons].sort().join("·")}) — 원장·수집은 최댓값을, 이적 이슈의 리그 판정은 한 시즌일 때만 쓴다`,
      fix: "5대 리그는 같은 시즌으로 맞춘다(UCL만 2단계로 한 시즌 늦을 수 있다)",
    });
  }
  const behind = new Map<number, string[]>(); // 다른 시즌 → 대회 id
  for (const c of input.competitions) {
    if (c.id === "UCL" && uclLagging) continue;
    if (c.season !== target) {
      behind.set(c.season, [...(behind.get(c.season) ?? []), c.id]);
      continue;
    }
    if (yearOf(c.startDate) !== target) {
      findings.push({
        severity: "error",
        message: `${c.id} startDate ${c.startDate}의 연도가 시즌 시작 연도 ${target}가 아님`,
        fix: "configs/competitions.json startDate",
      });
    }
    if (yearOf(c.endDate) !== target + 1) {
      findings.push({
        severity: "error",
        message: `${c.id} endDate ${c.endDate}의 연도가 ${target + 1}이 아님`,
        fix: "configs/competitions.json endDate",
      });
    }
  }
  for (const [season, ids] of behind) {
    findings.push({
      severity: "error",
      message: `competitions.json season ${season} ≠ 대상 ${target}: ${ids.join("·")}`,
      fix: "configs/competitions.json season·startDate·endDate·teamCount·zones(1차 출처 — 리그 공식 일정·규정)",
    });
  }
  if (input.table.season !== target) {
    findings.push({
      severity: "error",
      message: `팀 → 리그 표 TEAM_LEAGUES_SEASON ${input.table.season} ≠ 대상 ${target}`,
      fix: "scripts/lib/team-leagues.ts — 표(승강·UCL 팀)와 함께 바꾼다",
    });
  }
  const meta = input.ledgerMeta;
  if (meta === null) {
    findings.push({
      severity: "info",
      message: "경기 원장 meta 없음 — 정기 운영 첫 쓰기 실행이 만든다",
    });
  } else if (meta.season !== target) {
    findings.push({
      severity: "error",
      message: `원장 meta.season ${meta.season} ≠ 대상 ${target}(since ${meta.since}) — 지금 코드는 meta를 바꾸지 않고(로그 seasonMismatch만) 한국 선수 기록·팀 포메이션이 meta.season 경기만 집계한다. 새 시즌 since 규칙이 아직 없다(plan M1-48 이월)`,
      fix: "/new-season '사용자 확인 지점'에서 규칙을 정해 파이프라인에 구현한 뒤 전환한다 — data/matches/meta.json을 손으로 고치지 않는다",
    });
  }
  const filesByComp = new Map(
    input.competitionFiles.map((f) => [f.comp, f.season]),
  );
  for (const c of input.competitions) {
    const season = filesByComp.get(c.id);
    if (season === undefined) {
      findings.push({
        severity: "warn",
        message: `data/competitions/${c.id.toLowerCase()}.json 없음 — 다음 수집이 만든다`,
      });
    } else if (season !== c.season) {
      findings.push({
        severity: "info",
        message: `data/competitions/${c.id.toLowerCase()}.json 시즌 ${season} ≠ 설정 ${c.season} — 다음 수집이 새 시즌으로 다시 받는다(지난 시즌 값은 이어 쓰지 않는다)`,
      });
    }
  }
  const compSeasons = [...seasons].sort().map(seasonSpan).join("·");
  return {
    id: "season",
    title: "시즌·기간",
    summary: `대회 ${input.competitions.length}개 ${compSeasons || "—"} · 팀 표 ${seasonSpan(input.table.season)} · 원장 ${meta ? `${seasonSpan(meta.season)} since ${meta.since}` : "없음"}`,
    findings,
  };
}

// ─── ③ 팀 목록 ────────────────────────────────────────────────────────────

function teamsSection(input: NewSeasonInput): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const { table, teamIds, teamColors, names, formations } = input;
  const byId = new Map(input.competitions.map((c) => [c.id, c]));
  for (const league of LEAGUES) {
    const comp = byId.get(league);
    const n = table.leagues[league].length;
    if (comp && n !== comp.teamCount) {
      findings.push({
        severity: "error",
        message: `${league} 팀 표 ${n}팀 ≠ teamCount ${comp.teamCount}`,
        fix: "scripts/lib/team-leagues.ts TEAM_LEAGUES(승격·강등) 또는 competitions.json teamCount",
      });
    }
  }
  const ucl = byId.get("UCL");
  if (ucl && table.ucl.length !== ucl.teamCount) {
    findings.push({
      severity: "error",
      message: `UCL 팀 표 ${table.ucl.length}팀 ≠ teamCount ${ucl.teamCount} — 리그 페이즈 추첨(8월 말) 전이면 임시 상태`,
      fix: "scripts/lib/team-leagues.ts UCL_TEAMS",
    });
  }
  const owner = new Map<string, LeagueId>();
  const dup: string[] = [];
  for (const league of LEAGUES) {
    for (const slug of table.leagues[league]) {
      const first = owner.get(slug);
      if (first !== undefined) dup.push(`${slug}(${first}·${league})`);
      else owner.set(slug, league);
    }
  }
  if (dup.length > 0) {
    findings.push({
      severity: "error",
      message: `팀 표에서 두 리그에 든 팀: ${list(dup)}`,
      fix: "scripts/lib/team-leagues.ts",
    });
  }

  const season = seasonTeamsOf(table);
  const seasonSet = new Set(season);
  const missingIds = season.filter((s) => !Object.hasOwn(teamIds, s));
  if (missingIds.length > 0) {
    findings.push({
      severity: "error",
      message: `team-ids.json에 없는 이번 시즌 팀 ${missingIds.length}: ${list(missingIds)}`,
      fix: "scripts/fetch-competition-teams.ts --write → npx tsx scripts/build-team-ids.ts --roster --write",
    });
  }
  const extraIds = Object.keys(teamIds).filter((s) => !seasonSet.has(s));
  if (extraIds.length > 0) {
    findings.push({
      severity: "error",
      message: `team-ids.json에 이번 시즌 6개 대회 밖 팀 ${extraIds.length}: ${list(extraIds)} — 대응표는 6개 대회 팀만(tests/team-leagues.test.ts)`,
      fix: "강등·탈락 팀을 team-ids.json·team-colors 원본에서 빼고 팀 파일 처리를 정한다(/new-season 사용자 확인). names.ko.json 항목은 지우지 않는다",
    });
  }
  const present = season.filter((s) => Object.hasOwn(teamIds, s));
  const fdNull = present.filter((s) => teamIds[s]!.fd === null);
  const afNull = present.filter((s) => teamIds[s]!.af === null);
  if (fdNull.length > 0) {
    findings.push({
      severity: "warn",
      message: `football-data id(fd)가 null인 팀 ${fdNull.length}: ${list(fdNull)} — 순위·결과를 팀에 잇지 못한다`,
      fix: "scripts/build-team-ids.ts --roster(football-data 팀 목록 fixtures)",
    });
  }
  if (afNull.length > 0) {
    findings.push({
      severity: "warn",
      message: `API-Football id(af)가 null인 팀 ${afNull.length}: ${list(afNull)} — 득점자·라인업 연결은 D37 자동 연결 후보(운영 리포트)로 채운다`,
      fix: "--af-pairs 짝짓기 결과 또는 운영 리포트 collect.teamids.auto-link 후보를 사람이 옮긴다",
    });
  }
  const noColor = season.filter((s) => !Object.hasOwn(teamColors, s));
  if (noColor.length > 0) {
    findings.push({
      severity: "error",
      message: `team-colors.json에 없는 팀 ${noColor.length}: ${list(noColor)} — 화면은 폴백 배지, tests/team-colors.test.ts는 team-ids와 키가 같아야 통과`,
      fix: "docs/design/d1/team-colors-source.json에 키트 원색·tla·출처 → npx tsx scripts/build-team-colors.ts --write → build-team-colors-review.ts",
    });
  }
  const extraColor = Object.keys(teamColors).filter((s) => !seasonSet.has(s));
  if (extraColor.length > 0) {
    findings.push({
      severity: "error",
      message: `team-colors.json에 이번 시즌 밖 팀 ${extraColor.length}: ${list(extraColor)}`,
      fix: "team-colors 원본에서 빼고 build-team-colors.ts --write(원본은 git 이력에 남는다)",
    });
  }
  const namedTeams = new Set(
    names.entries
      .filter((e) => e.kind === "team" && e.slug !== undefined)
      .map((e) => e.slug!),
  );
  const noName = season.filter((s) => !namedTeams.has(s));
  if (noName.length > 0) {
    findings.push({
      severity: "warn",
      message: `names.ko.json 팀 항목(slug)이 없는 팀 ${noName.length}: ${list(noName)} — 브리핑·태그에 영문 그대로 남는다`,
      fix: "/add-name(정식·짧은 이름 별칭 — tests/names-ko-dict.test.ts SEASON_TEAMS 확인 대기 목록)",
    });
  }
  const strayFormation = Object.keys(formations).filter(
    (s) => !seasonSet.has(s),
  );
  if (strayFormation.length > 0) {
    findings.push({
      severity: "warn",
      message: `formations.json에 이번 시즌 밖 팀: ${list(strayFormation)}`,
      fix: "configs/formations.json에서 뺀다",
    });
  }
  const leagueTotal = LEAGUES.reduce((n, l) => n + table.leagues[l].length, 0);
  return {
    id: "teams",
    title: "팀 목록",
    summary: `6개 대회 ${season.length}팀(5대 리그 ${leagueTotal} + UCL만 ${season.length - leagueTotal}) · team-ids ${Object.keys(teamIds).length} · team-colors ${Object.keys(teamColors).length}`,
    findings,
  };
}

// ─── ④ 한국 선수 ──────────────────────────────────────────────────────────

function koreanSection(input: NewSeasonInput): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const season = new Set(seasonTeamsOf(input.table));
  const leagueOf = leagueIndexOf(input.table);
  const active = input.koreanPlayers.filter((p) => p.active);
  for (const p of active) {
    if (!season.has(p.team)) {
      findings.push({
        severity: "error",
        message: `활성 선수 ${p.slug}의 소속 ${p.team}가 이번 시즌 6개 대회 팀이 아님`,
        fix: "/add-player 갱신 흐름 — 이적·임대면 team·comp, 5대 리그 밖이면 comp OTHER · active false(FR-64 · D46)",
      });
      continue;
    }
    const league = leagueOf.get(p.team);
    if (league === undefined) {
      findings.push({
        severity: "error",
        message: `활성 선수 ${p.slug}의 소속 ${p.team}는 UCL에만 있는 5대 리그 밖 팀`,
        fix: "comp OTHER · active false(FR-64 · D46)",
      });
    } else if (p.comp !== league) {
      findings.push({
        severity: "error",
        message: `활성 선수 ${p.slug} comp ${p.comp} ≠ 소속 ${p.team}의 리그 ${league}`,
        fix: "configs/korean-players.json comp",
      });
    }
    const ids = Object.hasOwn(input.teamIds, p.team)
      ? input.teamIds[p.team]
      : undefined;
    if (ids !== undefined && ids.af === null) {
      findings.push({
        severity: "error",
        message: `활성 선수 ${p.slug}의 소속 ${p.team} af id가 null — 다른 대회 경기 기록이 빠진다(백필 불가)`,
        fix: "configs/team-ids.json af(공식 응답으로 확인)",
      });
    }
    if (p.apiFootballId === null) {
      findings.push({
        severity: "warn",
        message: `활성 선수 ${p.slug} apiFootballId null — 기록 연결 전`,
        fix: "/add-player 3단계(squads 1회 조회)",
      });
    }
  }
  const inactive = input.koreanPlayers.filter((p) => !p.active);
  if (inactive.length > 0) {
    findings.push({
      severity: "info",
      message: `비활성 ${inactive.length}명(${inactive.map((p) => p.slug).join(", ")}) — 5대 리그 복귀 여부만 확인`,
    });
  }
  const strayKnown = Object.entries(input.knownPlayerTeams)
    .filter(([, team]) => !season.has(team))
    .map(([player, team]) => `${player}→${team}`);
  if (strayKnown.length > 0) {
    findings.push({
      severity: "warn",
      message: `축약 별칭 소속팀 표에 이번 시즌 밖 팀: ${list(strayKnown)}`,
      fix: "scripts/lib/names.ts KNOWN_PLAYER_TEAMS(이적이면 팀을 고치고, 6개 대회를 떠났으면 사전 축약 별칭과 함께 뺀다)",
    });
  }
  return {
    id: "korean",
    title: "한국 선수",
    summary: `활성 ${active.length}명 · 비활성 ${inactive.length}명 · 축약 별칭 소속팀 표 ${Object.keys(input.knownPlayerTeams).length}명`,
    findings,
  };
}

// ─── ⑤ 오늘 밤 볼 경기 ────────────────────────────────────────────────────

function bigmatchSection(input: NewSeasonInput): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const season = new Set(seasonTeamsOf(input.table));
  const leagueOf = leagueIndexOf(input.table);
  const derbies = input.bigmatch.rules.derby.list;
  for (const d of derbies) {
    const [a, b] = d.teams;
    const la = leagueOf.get(a);
    const lb = leagueOf.get(b);
    if (la === undefined || lb === undefined || la !== lb) {
      findings.push({
        severity: "error",
        message: `더비 "${d.name}"(${a}·${b})의 두 팀이 이번 시즌 같은 리그가 아님 — 강등된 팀이 있으면 뺀다(tests/tonight.test.ts)`,
        fix: "configs/bigmatch-rules.json rules.derby.list(승격 팀의 통용 더비는 더한다 — configs/README.md)",
      });
    }
  }
  const strayBig = input.bigmatch.rules.bigClub.teams.filter(
    (s) => !season.has(s),
  );
  const strayKeyword = input.bigClubs.filter((s) => !season.has(s));
  if (strayBig.length > 0 || strayKeyword.length > 0) {
    findings.push({
      severity: "warn",
      message: `빅클럽 중 이번 시즌 밖 팀: ${list([...new Set([...strayBig, ...strayKeyword])])}`,
      fix: "bigmatch-rules.json bigClub.teams와 scripts/lib/news-keywords.ts BIG_CLUBS를 함께(한쪽만 고치면 테스트 실패)",
    });
  }
  return {
    id: "bigmatch",
    title: "오늘 밤 볼 경기",
    summary: `더비 ${derbies.length}개 · 빅클럽 ${input.bigmatch.rules.bigClub.teams.length}곳(뉴스 점수화 ${input.bigClubs.length}곳)`,
    findings,
  };
}

// ─── ⑥ 이적 창 ────────────────────────────────────────────────────────────

function windowsSection(
  input: NewSeasonInput,
  opts: NewSeasonOptions,
): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const { target, today } = opts;
  const lead = opts.windowLeadDays ?? 45;
  const soon = addDays(today, lead);
  const byKey = new Map(
    input.transferWindows.windows.map((w) => [
      `${w.comp}/${w.season}/${w.kind}`,
      w,
    ]),
  );
  const seasonStart = input.competitions
    .filter((c) => c.season === target)
    .reduce((a, c) => (a === "" || c.startDate < a ? c.startDate : a), "");
  const wanted: Array<{
    season: number;
    kind: "summer" | "winter";
    label: string;
  }> = [
    { season: target, kind: "summer", label: `${target} 여름` },
    { season: target, kind: "winter", label: `${seasonSpan(target)} 겨울` },
    { season: target + 1, kind: "summer", label: `${target + 1} 여름` },
  ];
  const missing: Record<string, string[]> = {};
  const estimated: string[] = [];
  for (const want of wanted) {
    for (const league of LEAGUES) {
      const w = byKey.get(`${league}/${want.season}/${want.kind}`);
      if (w === undefined) {
        (missing[want.label] ??= []).push(league);
        continue;
      }
      const closes = kstDate(w.closesAt);
      if (closes < today) continue; // 이미 닫힌 창
      if (w.sourceUrl === undefined) {
        const opens = kstDate(w.opensAt);
        if (opens <= soon)
          estimated.push(`${league} ${want.label}(개장 ${opens})`);
      }
    }
  }
  for (const want of wanted) {
    const leagues = missing[want.label];
    if (!leagues) continue;
    // 대상 시즌 여름 창은 시즌 시작 전에만 필요하다(지나간 창은 판정에 쓰이지 않는다)
    const past =
      want.season === target &&
      want.kind === "summer" &&
      seasonStart !== "" &&
      today > seasonStart;
    if (past) continue;
    findings.push({
      severity: want.season === target ? "warn" : "info",
      message: `이적 창 ${want.label} 없음: ${leagues.join("·")}`,
      fix: "configs/transfer-windows.json(리그 공식 발표 — 현지 시각을 UTC로) + tests/transfer-windows-config.test.ts 표",
    });
  }
  if (estimated.length > 0) {
    findings.push({
      severity: "warn",
      message: `${lead}일 안에 열리는 추정 창(sourceUrl 없음): ${list(estimated)}`,
      fix: "공식 발표로 날짜를 고치고 sourceUrl을 단다(configs/README.md 이적 창)",
    });
  }
  const confirmed = input.transferWindows.windows.filter(
    (w) => w.sourceUrl !== undefined,
  ).length;
  return {
    id: "windows",
    title: "이적 창",
    summary: `${input.transferWindows.windows.length}개(공식 발표 ${confirmed} · 추정 ${input.transferWindows.windows.length - confirmed})`,
    findings,
  };
}

// ─── ⑦ 대표팀 ─────────────────────────────────────────────────────────────

function nationalSection(
  input: NewSeasonInput,
  opts: NewSeasonOptions,
): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const upcoming = input.nationalTeam.matches.filter(
    (m) => kstDate(m.kickoff) >= opts.today,
  );
  if (upcoming.length === 0) {
    findings.push({
      severity: "info",
      message:
        "기준일 뒤 A매치 일정 없음 — A매치 휴식기 판정·/national-team 다음 경기가 비어 있다",
      fix: "configs/national-team.json(대한축구협회 발표 — FIFA 윈도)",
    });
  }
  const next = upcoming
    .map((m) => kstDate(m.kickoff))
    .sort()
    .at(0);
  return {
    id: "national",
    title: "대표팀",
    summary: `예정 A매치 ${upcoming.length}경기${next ? `(다음 ${next})` : ""}`,
    findings,
  };
}

// ─── ⑧ 파생 파일 ──────────────────────────────────────────────────────────

function derivedSection(input: NewSeasonInput): NewSeasonSection {
  const findings: NewSeasonFinding[] = [];
  const season = seasonTeamsOf(input.table);
  const seasonSet = new Set(season);
  const files = new Set(input.teamFiles);
  const missing = season.filter((s) => !files.has(s));
  if (missing.length > 0) {
    findings.push({
      severity: "warn",
      message: `팀 파일이 없는 이번 시즌 팀 ${missing.length}: ${list(missing)}`,
      fix: "npm run build:teams(API 호출 없음 — 다음 수집도 만든다)",
    });
  }
  const stale = input.teamFiles.filter((s) => !seasonSet.has(s));
  if (stale.length > 0) {
    const notInIds = stale.filter((s) => !Object.hasOwn(input.teamIds, s));
    findings.push({
      severity: notInIds.length > 0 ? "error" : "warn",
      message: `이번 시즌 밖 팀 파일 ${stale.length}: ${list(stale)}${notInIds.length > 0 ? " — team-ids에 없는 팀 파일은 validate 오류(교차 참조 7)" : ""}. 팀 페이지 URL(/teams/<slug>/)이 걸린 공개 URL 변경이다`,
      fix: "지난 시즌 팀 파일 처리(삭제 → 404 · 보존)를 /new-season 사용자 확인 지점에서 정한다 — build:teams는 지우지 않는다(teams.stale-files 경고만)",
    });
  }
  const og = new Set(input.ogTeamImages);
  const ogMissing = input.teamFiles.filter(
    (s) => seasonSet.has(s) && !og.has(s),
  );
  const ogStale = input.ogTeamImages.filter((s) => !files.has(s));
  if (ogMissing.length > 0 || ogStale.length > 0) {
    findings.push({
      severity: "info",
      message: `팀 OG — 구울 것 ${ogMissing.length}${ogMissing.length ? `(${list(ogMissing, 4)})` : ""} · 지울 것 ${ogStale.length}${ogStale.length ? `(${list(ogStale, 4)})` : ""}`,
      fix: "npm run build:og(목록에 없는 PNG는 지운다) → public/og 변경을 함께 커밋",
    });
  }
  return {
    id: "derived",
    title: "파생 파일",
    summary: `data/teams ${input.teamFiles.length}개 · 팀 OG ${input.ogTeamImages.length}장`,
    findings,
  };
}

// ─── 전체 ─────────────────────────────────────────────────────────────────

/** 점검 전체(순수 함수) */
export function checkNewSeason(
  input: NewSeasonInput,
  opts: NewSeasonOptions,
): NewSeasonReport {
  const current =
    input.competitions.length > 0
      ? Math.max(...input.competitions.map((c) => c.season))
      : null;
  const sections = [
    timingSection(input, current, opts),
    seasonSection(input, opts),
    teamsSection(input),
    koreanSection(input),
    bigmatchSection(input),
    windowsSection(input, opts),
    nationalSection(input, opts),
    derivedSection(input),
  ];
  const counts: Record<NewSeasonSeverity, number> = {
    error: 0,
    warn: 0,
    info: 0,
  };
  for (const s of sections) for (const f of s.findings) counts[f.severity]++;
  return {
    target: opts.target,
    current,
    today: opts.today,
    sections,
    counts,
    ready: counts.error === 0,
  };
}

const MARK: Record<NewSeasonSeverity, string> = {
  error: "✗ 오류",
  warn: "! 경고",
  info: "· 참고",
};

/** 사람이 읽는 출력 줄 */
export function formatNewSeasonReport(
  report: NewSeasonReport,
  tag = "[new-season-check]",
): string[] {
  const lines: string[] = [];
  const current = report.current === null ? "없음" : seasonSpan(report.current);
  lines.push(
    `${tag} 대상 ${seasonSpan(report.target)} · 설정 ${current} · 기준일 ${report.today}(KST) · 읽기 전용(API 호출 없음)`,
  );
  for (const s of report.sections) {
    const worst = s.findings.some((f) => f.severity === "error")
      ? "✗"
      : s.findings.some((f) => f.severity === "warn")
        ? "!"
        : "✓";
    lines.push(`${worst} ${s.title}${s.summary ? ` — ${s.summary}` : ""}`);
    for (const f of s.findings) {
      lines.push(`    ${MARK[f.severity]}: ${f.message}`);
      if (f.fix) lines.push(`      → ${f.fix}`);
    }
  }
  const { error, warn, info } = report.counts;
  lines.push(
    `${tag} 오류 ${error} · 경고 ${warn} · 참고 ${info} → ${report.ready ? "준비됨" : "준비 안 됨(오류를 먼저 고친다)"}`,
  );
  return lines;
}
