/**
 * 팀 목록(로스터) — 6개 대회 참가 팀 → 팀 slug·두 API 팀 id·대표 대회·함께 뛰는 대회 (M2-04, FR-50, PRD §15 D33·D63 ③).
 * I/O 없는 순수 함수. 진입점은 scripts/build-team-ids.ts `--roster`.
 *
 * 입력
 *   - 대회별 참가 팀: football-data `/v4/competitions/{code}/teams?season=` (fixtures/football/football-data/teams-<code>-<season>.json
 *     — scripts/fetch-competition-teams.ts가 받아 축약 저장, 어댑터 `toCompetitionTeams`)
 *   - 지금의 `configs/team-ids.json`(옛 slug여도 된다 — fd id로 맞춘다): af id·근거(note)를 이어받는다
 *   - af 짝 후보: 경기 원장(`data/matches`)과 football-data 같은 기간 종료 경기를 `suggestTeamIdPairs`로 맞춘 결과(강한 증거 — 대회·킥오프
 *     ±5분·스코어 일치 + 후보 하나). 대응표에 af가 없는 팀만 채운다. 근거가 없는 팀은 af null(실행 때 D37 자동 연결·운영 리포트 후보로)
 * 출력: 로스터 행(대회 순 → slug 순) + 새 team-ids.json(slug 순) + 문제 목록.
 *
 * 팀 목록의 단일 출처(M2-05~07이 쓴다): **`configs/team-ids.json`(팀 slug·fd·af) + `scripts/lib/team-leagues.ts`(리그 소속
 * `TEAM_LEAGUES` · UCL 참가 `UCL_TEAMS` → `teamCompetitions`)**. 두 표는 tests/team-roster.test.ts가 teams fixtures와 대조한다.
 */
import type { CompId, TeamIdsFile } from "@/lib/schema";

import type { CompetitionTeam } from "./providers/football-data";
import type { TeamPairCandidate } from "./team-ids";
import { teamSlugFor, TEAM_SLUG_OVERRIDES } from "./team-slugs";

export interface CompTeamsInput {
  comp: CompId;
  teams: readonly CompetitionTeam[];
}

export interface RosterInputs {
  /** 대회별 참가 팀(competitions.json 순서 — 리그가 앞, UCL이 끝) */
  compTeams: readonly CompTeamsInput[];
  /** 지금의 대응표(옛 slug 가능) */
  existing: TeamIdsFile;
  /** af 짝 후보(원장 대조) — kind "new"·"fill-af"만 쓴다 */
  afCandidates: readonly TeamPairCandidate[];
  /** 후보 근거 설명(예: "원장 2026-10 ↔ football-data 2026-10-19~29") */
  afCandidateSource: string;
  /** note에 남길 날짜(YYYY-MM-DD) */
  date: string;
  /**
   * `configs/names.ko.json` team 항목 — 영문 표기에 football-data 정식 이름이 있는 항목의 slug가 새 slug와 다르면 `renames`에
   * 넣는다(대응표 밖 팀의 옛 slug도 마이그레이션 표에 들어가게)
   */
  nameSlugs?: ReadonlyArray<{ slug: string; en: readonly string[] }>;
}

export interface RosterRow {
  slug: string;
  /** 규칙 결과 그대로인가, 예외표인가 */
  slugSource: "rule" | "override";
  /** 지금 대응표의 slug(새 slug와 다를 때만) — 마이그레이션 표 */
  oldSlug: string | null;
  fd: number;
  af: number | null;
  /** af 출처 — kept = 지금 대응표, ledger = 원장 대조 후보, null = 모름 */
  afSource: "kept" | "ledger" | null;
  /** football-data 정식·짧은 이름·약어 */
  name: string;
  shortName: string | null;
  tla: string | null;
  tlaPadded: boolean;
  area: string | null;
  /** 대표 대회(리그 팀 = 리그, 5대 리그 밖 = UCL) */
  comp: CompId;
  /** 함께 뛰는 대회(리그 팀의 UCL) */
  alsoIn: CompId[];
}

export interface TeamRoster {
  rows: RosterRow[];
  file: TeamIdsFile;
  /** 옛 slug → 새 slug(바뀐 것만, 옛 slug 순) */
  renames: Record<string, string>;
  /** 약어 충돌(같은 tla — 배지 약어는 M2-05 team-colors가 정한다) */
  tlaCollisions: Array<{ tla: string; slugs: string[] }>;
  problems: string[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 옛 note에서 slug 확인 표시를 지운다(M2-04에서 slug를 확정했으므로) */
function carriedNote(note: string | undefined): string {
  return (note ?? "").replace(/^확인 필요 · /, "");
}

export function buildTeamRoster(inputs: RosterInputs): TeamRoster {
  const problems: string[] = [];

  // fd id → 팀 정보 + 나온 대회
  const teams = new Map<number, { team: CompetitionTeam; comps: CompId[] }>();
  for (const { comp, teams: list } of inputs.compTeams) {
    for (const team of list) {
      const seen = teams.get(team.fd);
      if (seen) {
        if (!seen.comps.includes(comp)) seen.comps.push(comp);
        if (seen.team.name !== team.name) {
          problems.push(
            `fd ${team.fd} 이름이 대회마다 다름: "${seen.team.name}" ↔ "${team.name}"`,
          );
        }
      } else {
        teams.set(team.fd, { team, comps: [comp] });
      }
    }
  }

  // 지금 대응표 fd → (slug, 항목)
  const existingByFd = new Map<
    number,
    { slug: string; entry: TeamIdsFile[string] }
  >();
  for (const [slug, entry] of Object.entries(inputs.existing)) {
    if (entry.fd === null) {
      problems.push(`대응표 "${slug}"에 fd가 없음 — 로스터와 맞출 수 없음`);
      continue;
    }
    existingByFd.set(entry.fd, { slug, entry });
    if (!teams.has(entry.fd)) {
      problems.push(
        `대응표 "${slug}"(fd ${entry.fd})가 이번 시즌 6개 대회 팀 목록에 없음 — 빠짐`,
      );
    }
  }

  // af 후보 — fd 팀별 하나(같은 fd에 서로 다른 af가 나오면 문제)
  const afCandidate = new Map<number, TeamPairCandidate>();
  for (const c of inputs.afCandidates) {
    if (c.kind === "fill-fd") continue;
    const prev = afCandidate.get(c.fd.id);
    if (prev && prev.af.id !== c.af.id) {
      problems.push(
        `fd ${c.fd.id} af 후보가 둘: ${prev.af.id} · ${c.af.id} — 넣지 않음`,
      );
      continue;
    }
    afCandidate.set(c.fd.id, c);
  }

  const rows: RosterRow[] = [];
  const file: TeamIdsFile = {};
  const renames: Record<string, string> = {};
  for (const [fd, { team, comps }] of teams) {
    const slug = teamSlugFor({ fd, name: team.name });
    const league = comps.find((c) => c !== "UCL");
    const comp: CompId = league ?? comps[0]!;
    const alsoIn = comps.filter((c) => c !== comp);
    const existing = existingByFd.get(fd);
    let af: number | null = existing?.entry.af ?? null;
    let afSource: RosterRow["afSource"] = af !== null ? "kept" : null;
    let note: string;
    const candidate = afCandidate.get(fd);
    if (af !== null && candidate && candidate.af.id !== af) {
      problems.push(
        `"${slug}" af 불일치: 대응표 ${af} ↔ 원장 후보 ${candidate.af.id} — 대응표 유지`,
      );
    }
    if (af === null && candidate) {
      af = candidate.af.id;
      afSource = "ledger";
    }
    const renamed =
      existing && existing.slug !== slug ? ` · 옛 slug ${existing.slug}` : "";
    const slugNote = `slug D63 ③ 확정(M2-04 ${inputs.date}${renamed})`;
    if (existing && afSource === "kept") {
      note = `${carriedNote(existing.entry.note)} · ${slugNote}`;
    } else if (afSource === "ledger" && candidate) {
      const evidence = candidate.evidence
        .map((e) => `${e.fdMatchId}↔${e.afMatchId}`)
        .join(", ");
      note = `근거 강함 — 종료 경기 ${candidate.evidence.length}건 대회·킥오프·스코어 일치(${evidence}) · fd "${team.name}" · af "${candidate.af.name}" (${inputs.afCandidateSource}, ${inputs.date}) · ${slugNote}`;
    } else {
      note = `af 미확인 — 원장 대조 경기 없음 · fd "${team.name}" (M2-04 ${inputs.date}) · ${slugNote}`;
    }
    if (existing && existing.slug !== slug) renames[existing.slug] = slug;
    for (const entry of inputs.nameSlugs ?? []) {
      const owns = entry.en.some(
        (en) => en.toLowerCase() === team.name.toLowerCase(),
      );
      if (owns && entry.slug !== slug) renames[entry.slug] = slug;
    }
    if (Object.hasOwn(file, slug)) {
      problems.push(`slug "${slug}" 중복: fd ${file[slug]!.fd} · ${fd}`);
      continue;
    }
    file[slug] = { fd, af, note };
    rows.push({
      slug,
      slugSource: Object.hasOwn(TEAM_SLUG_OVERRIDES, fd) ? "override" : "rule",
      oldSlug: existing && existing.slug !== slug ? existing.slug : null,
      fd,
      af,
      afSource,
      name: team.name,
      shortName: team.shortName,
      tla: team.tla,
      tlaPadded: team.tlaPadded,
      area: team.area,
      comp,
      alsoIn,
    });
  }

  // af 중복(스키마도 막지만 원인을 먼저 보인다)
  const afOwner = new Map<number, string>();
  for (const row of rows) {
    if (row.af === null) continue;
    const owner = afOwner.get(row.af);
    if (owner) problems.push(`af ${row.af} 중복: ${owner} · ${row.slug}`);
    else afOwner.set(row.af, row.slug);
  }

  // 약어 충돌
  const byTla = new Map<string, string[]>();
  for (const row of rows) {
    if (row.tla === null) continue;
    byTla.set(row.tla, [...(byTla.get(row.tla) ?? []), row.slug]);
  }
  const tlaCollisions = [...byTla]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([tla, slugs]) => ({ tla, slugs: [...slugs].sort(byString) }))
    .sort((a, b) => byString(a.tla, b.tla));

  const order = inputs.compTeams.map((c) => c.comp);
  rows.sort(
    (a, b) =>
      order.indexOf(a.comp) - order.indexOf(b.comp) || byString(a.slug, b.slug),
  );
  const sortedFile: TeamIdsFile = {};
  for (const slug of Object.keys(file).sort(byString)) {
    sortedFile[slug] = file[slug]!;
  }
  const sortedRenames: Record<string, string> = {};
  for (const old of Object.keys(renames).sort(byString)) {
    sortedRenames[old] = renames[old]!;
  }
  return {
    rows,
    file: sortedFile,
    renames: sortedRenames,
    tlaCollisions,
    problems,
  };
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** 확인용 표(Markdown) — 대회별, 옛 → 새 slug 변경분 굵게 */
export function formatRosterReview(roster: TeamRoster): string {
  const lines = [
    `# 팀 목록 ${roster.rows.length}팀 (M2-04, PRD §15 D63 ③)`,
    "",
    `- 옛 slug → 새 slug ${Object.keys(roster.renames).length}건 · 예외표 적용 ${roster.rows.filter((r) => r.slugSource === "override").length}팀 · af 미확인 ${roster.rows.filter((r) => r.af === null).length}팀`,
    "",
    "| 대회 | slug | 옛 slug | 규칙/예외 | fd | af (출처) | football-data 이름 / 짧은 이름 | tla | 함께 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of roster.rows) {
    const slug = r.oldSlug ? `**\`${r.slug}\`**` : `\`${r.slug}\``;
    const tla =
      r.tla === null ? "-" : r.tlaPadded ? `\`${r.tla}\`(공백)` : r.tla;
    lines.push(
      `| ${r.comp} | ${slug} | ${r.oldSlug ? `\`${r.oldSlug}\`` : "-"} | ${r.slugSource === "override" ? "예외" : "규칙"} | ${r.fd} | ${r.af ?? "-"} (${r.afSource ?? "-"}) | ${cell(r.name)} / ${cell(r.shortName ?? "-")} | ${cell(tla)} | ${r.alsoIn.join("·") || "-"} |`,
    );
  }
  lines.push("", "## 약어 충돌", "");
  if (roster.tlaCollisions.length === 0) lines.push("- 없음");
  for (const c of roster.tlaCollisions) {
    lines.push(`- ${c.tla}: ${c.slugs.join(", ")}`);
  }
  lines.push("", "## 문제", "");
  if (roster.problems.length === 0) lines.push("- 없음");
  for (const p of roster.problems) lines.push(`- ${p}`);
  return `${lines.join("\n")}\n`;
}
