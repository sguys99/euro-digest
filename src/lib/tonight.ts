/**
 * "오늘 밤 볼 경기" 선별 (PRD F8 FR-80~82·FR-84, plan M2-08) — I/O 없는 순수 함수. LLM 미사용(규칙 기반, 비용 0).
 *
 * 화면(`/tonight`·홈 섹션, M2-14)이 정적 빌드 때 `src/lib/data/tonight.ts` 로더로 설정·대회 데이터를 읽어 이 함수를 부른다.
 * 결과를 `data/`에 따로 저장하지 않는다(새 데이터 파일 = 스키마 변경 — 빌드 때 계산하면 충분하다).
 *
 * ── 기준 날짜 ───────────────────────────────────────────────────────────
 *   `tonightBaseDate(빌드 시각)` = 빌드 시각의 KST 날짜 = 발행일(봇 빌드는 아침 발행 직후, 개발 빌드도 그날 호를 다시 만든다).
 *   대상 창 = 기준 날짜 `window.fromKst`(18:00) ~ 다음 날 `window.toKst`(07:00) KST, [시작, 끝) — `src/lib/time.ts` `kstWindowRangeUtc`.
 *   KST는 서머타임이 없어 창의 UTC 구간은 계절과 무관하다(유럽 킥오프의 KST 시각만 계절에 따라 1시간 움직인다).
 *
 * ── 대상 경기 ───────────────────────────────────────────────────────────
 *   킥오프가 창 안 · 연기(`postponed`) 아님 · **킥오프 확정**(`tbc` 아님). `tbc`는 날짜만 정해졌거나 라운드 기본 슬롯이라
 *   창 판정이 틀릴 수 있고, 카드가 킥오프 KST를 사실로 보이므로(FR-82) 뺀다. 이미 끝난 경기(`finished` — 저녁 개발 빌드)는 남긴다 —
 *   빌드 시각에 따라 선별이 바뀌지 않게(결과 표시·스포일러는 화면 몫).
 *
 * ── 점수 (FR-81, `configs/bigmatch-rules.json`) ─────────────────────────────
 *   걸린 규칙의 weight 합. 규칙마다 한 번만 더한다(두 팀 모두 한국 선수 소속이어도 korean 1회). weight 0 규칙은 끈 것으로 본다(태그도 없음).
 *   ① korean    두 팀 중 하나에 **활성** 등록 한국 선수(`active: true` — FR-60·FR-64)가 소속
 *   ② ucl       UCL 경기
 *   ③ topClash  리그 경기 · 두 팀 모두 순위 topN(6) 이내
 *   ④ derby     지정 더비 목록의 팀 쌍(순서 무관)
 *   ⑤ closeRace 리그 경기 · 두 팀 승점 차 maxPointsGap(3) 이내
 *   +  bigClub  두 팀 중 하나가 빅클럽 목록(FR-06 뉴스 키워드와 같은 16곳) — 동점 정리용 작은 가중, 이유 태그 없음
 *   ③⑤는 **리그만** 본다 — UCL 리그 페이즈 순위는 초반 승점이 몰려 있어(3경기 기준 36팀 중 다수가 승점 차 3 이내) 순위 경쟁 신호가
 *   약하고, UCL 경기는 ②로 이미 뽑힌다. 순위표에 두 팀이 다 있고 둘 다 1경기 이상 치렀을 때만(개막 전 0점 표는 순위가 의미 없다).
 *   minScore 이상만 남긴다(0이면 창 안 경기가 있으면 maxMatches까지 채운다 — 경기 있는 날 빈 상태가 되지 않게, M2 완료 기준 ③).
 *
 * ── 정렬 (동점 규칙) ───────────────────────────────────────────────────────
 *   점수 내림차순 → 킥오프 이른 순 → 대회 순서(입력 `competitions` 순서 = configs/competitions.json 순서) → 경기 id. 상위 maxMatches.
 *   화면은 이 순서를 그대로 쓴다(M2-14가 킥오프 순으로 다시 정렬할지는 화면 결정).
 *
 * ── 이유 태그 (FR-82, PRD §15 D62 ③ — 데이터로 확인되는 사실만) ───────────────────
 *   태그는 종류 + 값 + 완성된 한국어 `label`을 함께 낸다(화면은 label을 그대로 그리고, kind로 한국 완장 등 모양만 고른다 — 문구 규칙이
 *   한 곳에 있어 테스트로 고정된다). 출전 예상 같은 추정 문구는 만들지 않는다.
 *   korean    "{선수 한글 이름} 소속"(korean-players.json nameKo) — 선수마다 1개, 라인업 발표 전 출전은 쓰지 않는다
 *   derby     더비 이름(bigmatch-rules.json `name`, 예 "노스런던 더비")
 *   topClash  "a·b위 맞대결"(작은 순위 먼저)
 *   closeRace "승점 차 n · a·b위"(n = 0이면 "승점 동률 · a·b위") — topClash 태그가 있으면 순위를 되풀이하지 않고 "승점 차 n"만
 *   ucl·bigClub은 태그 없음 — 대회는 카드가 따로 표시하고(FR-82), 빅클럽 여부는 사실이 아니라 설정의 판단이다. 걸린 규칙은 `rules`에 남는다.
 *   태그 순서: korean → derby → topClash → closeRace.
 */
import type {
  BigmatchRulesFile,
  CompId,
  KoreanPlayersFile,
  Match,
  StandingRow,
} from "@/lib/schema";
import { kstDate, kstWindowRangeUtc, type UtcRange } from "@/lib/time";

/** 선별 규칙 이름 — bigmatch-rules.json `rules`의 키 */
export type TonightRule =
  "korean" | "ucl" | "topClash" | "derby" | "closeRace" | "bigClub";

/** 규칙 적용 순서(점수 합산·`rules` 배열 순서) */
export const TONIGHT_RULES: readonly TonightRule[] = Object.freeze([
  "korean",
  "ucl",
  "topClash",
  "derby",
  "closeRace",
  "bigClub",
]);

/** 선정 이유 태그 1개 — 데이터로 확인되는 사실만(머리 주석) */
export type TonightReason =
  | {
      kind: "korean";
      /** korean-players.json slug */
      player: string;
      /** 그 선수의 소속 팀 slug(경기의 home·away 중 하나) */
      team: string;
      label: string;
    }
  | { kind: "derby"; name: string; label: string }
  | { kind: "topClash"; pos: readonly [number, number]; label: string }
  | {
      kind: "closeRace";
      gap: number;
      pos: readonly [number, number];
      label: string;
    };

/** 선별된 경기 1개 */
export interface TonightPick {
  match: Match;
  /** 걸린 규칙 weight 합 */
  score: number;
  /** 걸린 규칙(weight > 0만, TONIGHT_RULES 순서) */
  rules: TonightRule[];
  /** 화면 이유 태그(korean → derby → topClash → closeRace) */
  reasons: TonightReason[];
}

/** 선별 입력 대회 1개 — `data/competitions/{comp}.json`의 필요한 부분 */
export interface TonightCompetition {
  comp: CompId;
  standings: readonly StandingRow[];
  matches: readonly Match[];
}

export interface TonightInput {
  rules: BigmatchRulesFile;
  /** 대회 데이터 — 이 순서가 동점 정렬의 대회 순서다 */
  competitions: readonly TonightCompetition[];
  koreanPlayers: KoreanPlayersFile;
  /** 기준 날짜(KST "YYYY-MM-DD") — `tonightBaseDate(빌드 시각)` */
  baseKstDate: string;
}

/** 선별 결과 — 창(UTC)과 선별 경기(0~maxMatches개, 경기가 없으면 빈 배열 = 빈 상태) */
export interface TonightResult {
  baseKstDate: string;
  window: UtcRange;
  picks: TonightPick[];
}

/** 빌드 시각(UTC ISO) → 기준 날짜(KST 발행일) */
export function tonightBaseDate(buildIso: string): string {
  return kstDate(buildIso);
}

/** 두 순위를 작은 것 먼저 */
function orderedPos(a: number, b: number): readonly [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** "a·b위" — 같은 순위(동순위)도 그대로 두 번 쓴다 */
function posLabel(pos: readonly [number, number]): string {
  return `${pos[0]}·${pos[1]}위`;
}

/** 승점 차 문구 — 0이면 "승점 동률" */
function gapLabel(gap: number): string {
  return gap === 0 ? "승점 동률" : `승점 차 ${gap}`;
}

/** 순위표 행 — 1경기 이상 치른 팀만(머리 주석 ③⑤) */
function rankedRow(
  table: ReadonlyMap<string, StandingRow>,
  team: string,
): StandingRow | null {
  const row = table.get(team);
  return row && row.played >= 1 ? row : null;
}

/** 경기 1개 점수화 — 걸린 규칙·점수·이유 태그(대상 여부는 isCandidate가 먼저 거른다) */
function scoreMatch(
  match: Match,
  table: ReadonlyMap<string, StandingRow>,
  rules: BigmatchRulesFile["rules"],
  koreanByTeam: ReadonlyMap<string, readonly KoreanPlayersFile[number][]>,
): Omit<TonightPick, "match"> {
  const hits = new Set<TonightRule>();
  const reasons: TonightReason[] = [];
  const teams = [match.home, match.away];

  if (rules.korean.weight > 0) {
    for (const team of teams) {
      for (const player of koreanByTeam.get(team) ?? []) {
        hits.add("korean");
        reasons.push({
          kind: "korean",
          player: player.slug,
          team,
          label: `${player.nameKo} 소속`,
        });
      }
    }
  }

  if (rules.ucl.weight > 0 && match.comp === "UCL") hits.add("ucl");

  if (rules.derby.weight > 0) {
    const derby = rules.derby.list.find(
      (d) =>
        (d.teams[0] === match.home && d.teams[1] === match.away) ||
        (d.teams[0] === match.away && d.teams[1] === match.home),
    );
    if (derby) {
      hits.add("derby");
      reasons.push({ kind: "derby", name: derby.name, label: derby.name });
    }
  }

  const home = match.comp === "UCL" ? null : rankedRow(table, match.home);
  const away = match.comp === "UCL" ? null : rankedRow(table, match.away);
  if (home && away) {
    const pos = orderedPos(home.pos, away.pos);
    const top =
      rules.topClash.weight > 0 &&
      home.pos <= rules.topClash.topN &&
      away.pos <= rules.topClash.topN;
    if (top) {
      hits.add("topClash");
      reasons.push({ kind: "topClash", pos, label: `${posLabel(pos)} 맞대결` });
    }
    const gap = Math.abs(home.pts - away.pts);
    if (rules.closeRace.weight > 0 && gap <= rules.closeRace.maxPointsGap) {
      hits.add("closeRace");
      reasons.push({
        kind: "closeRace",
        gap,
        pos,
        label: top ? gapLabel(gap) : `${gapLabel(gap)} · ${posLabel(pos)}`,
      });
    }
  }

  if (
    rules.bigClub.weight > 0 &&
    teams.some((t) => rules.bigClub.teams.includes(t))
  ) {
    hits.add("bigClub");
  }

  const ruleList = TONIGHT_RULES.filter((r) => hits.has(r));
  const score = ruleList.reduce((sum, r) => sum + rules[r].weight, 0);
  return { score, rules: ruleList, reasons };
}

/** 창 안의 선별 대상 경기인가(머리 주석 '대상 경기') */
function isCandidate(match: Match, startMs: number, endMs: number): boolean {
  if (match.status === "postponed" || match.tbc === true) return false;
  const t = Date.parse(match.kickoff);
  return t >= startMs && t < endMs;
}

/**
 * "오늘 밤 볼 경기" — 기준 날짜 창 안 경기를 점수화해 상위 maxMatches개(머리 주석 규칙). 경기가 없으면 picks 빈 배열.
 */
export function selectTonight(input: TonightInput): TonightResult {
  const { rules, competitions, koreanPlayers, baseKstDate } = input;
  const window = kstWindowRangeUtc(baseKstDate, rules.window);
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);

  const koreanByTeam = new Map<string, KoreanPlayersFile[number][]>();
  for (const player of koreanPlayers) {
    if (!player.active) continue;
    const list = koreanByTeam.get(player.team) ?? [];
    list.push(player);
    koreanByTeam.set(player.team, list);
  }

  const scored: (TonightPick & { compIndex: number })[] = [];
  competitions.forEach((competition, compIndex) => {
    const table = new Map(competition.standings.map((r) => [r.team, r]));
    for (const match of competition.matches) {
      if (!isCandidate(match, startMs, endMs)) continue;
      const result = scoreMatch(match, table, rules.rules, koreanByTeam);
      if (result.score < rules.minScore) continue;
      scored.push({ match, ...result, compIndex });
    }
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff) ||
      a.compIndex - b.compIndex ||
      (a.match.id < b.match.id ? -1 : a.match.id > b.match.id ? 1 : 0),
  );

  const picks = scored
    .slice(0, rules.maxMatches)
    .map(({ match, score, rules: hit, reasons }) => ({
      match,
      score,
      rules: hit,
      reasons,
    }));
  return { baseKstDate, window, picks };
}
