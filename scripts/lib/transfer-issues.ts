/**
 * 한국 선수 이적 감지 → GitHub 이슈 사건 (M3-04 — PRD FR-63·FR-64) — 순수 함수만 둔다. LLM을 쓰지 않는다.
 * 일일 수집이 끝난 뒤 scripts/collect.ts가 부르고(사건 파일 TRANSFER_ISSUES_FILE에 payload 배열), collect.yml '실행 이슈 보고' 단계가
 * `--kind player-transfer`로 이슈를 만든다(실행 중에는 GitHub에 쓰지 않는다 — run-issues.ts와 같은 관례). 설정
 * (`configs/korean-players.json`)은 자동으로 바꾸지 않는다 — 사람이 확인하고 `/add-player` 또는 직접 수정(FR-63 '수동 갱신').
 *
 * ── 후보 (둘 중 하나) ───────────────────────────────────────────────────────
 *   (a) 카드 — 오늘 뉴스 파일의 이적 카테고리(`cat: "transfer"`) 카드 중 `transfer`(코드 추출 — transfer-extract.ts)가 있고
 *       ① `transfer.player`가 등록 한국 선수(활성·비활성 모두 — 기타 리그 선수의 5대 리그 복귀도 알아야 한다)
 *       ② 단계가 **agreed·official**(`TRANSFER_ISSUE_STATUSES`) — 루머·협상·결렬은 만들지 않는다. 근거: 등록 선수 이적 카드는 거의
 *          루머다(2026-10-11~11-01 transfer 카드 2장 모두 김민재 아스널 rumor·Tier 3). 루머마다 이슈를 열면 설정을 바꿀 일이 없는 이슈가
 *          쌓이고, 열린 이슈가 같은 선수의 진짜 이적 이슈와 섞인다. agreed 이상은 transfer-extract.ts가 Tier 2 이상 또는 매체 2곳 이상일
 *          때만 준다(PRD F10·D52) — 오탐 문턱이 이미 있다. 협상(negotiating)은 성사 여부를 모르는 단계라 뺀다
 *       ③ 행선지가 지금 설정 소속이 아니다(`to === team`이면 이미 반영된 이적). 행선지가 없고 출발 팀이 설정 소속과 다르면 지난 이적
 *          이야기라 뺀다(출발 팀을 설정에서 채우지 않는다 — 제목에 없는 사실).
 *   (b) 라인업 — 한국 선수 현황 단계(korean-players-data.ts `teamMismatchOf`)의 단서: 원장에서 그 선수(API-Football 선수 id)가 설정과
 *       다른 팀 라인업(선발·교체·벤치)에 든 가장 최근 경기. 활성 선수만(비활성은 원장 대상이 아니다).
 *
 * ── 이슈 하나 = 선수 + 행선지 ────────────────────────────────────────────────
 *   원인 키 `transfer:<slug>:<행선지>`(github-issues.ts `transferIssueKey` — 행선지 slug, 없으면 영문 이름을 slug 꼴로, 그것도 없으면
 *   `unknown`). 같은 키의 카드·라인업 단서는 한 payload로 합친다(카드는 단계 높은 순 → 카드 id, 최대 MAX_CARDS). 열린 이슈가 있으면
 *   댓글 없이 건너뛴다(github-issues.ts RECURRENCE_POLICY "skip" — 설정을 고칠 때까지 라인업 단서는 매일 나온다).
 *
 * ── 5대 리그 여부 (FR-64) ────────────────────────────────────────────────────
 *   행선지 slug가 팀 → 리그 표(team-leagues.ts — 2026-27 5대 리그 96팀)에 있으면 그 리그, 표에는 없지만 아는 팀(team-ids.json — 5대
 *   리그 밖 UCL 팀 포함 · names.ko.json 팀 slug — 컵 상대 하부 리그 팀 등)이면 OTHER, slug가 없으면(원장 팀이 team-ids에 없음) null =
 *   '확인 필요'(5대 리그 96팀은 모두 team-ids에 있어 5대 리그 밖일 가능성이 크다는 메모만). 팀 표의 시즌이 competitions.json 시즌과
 *   다르면(시즌 전환 직후 — `/new-season` 전) 리그 판정을 하지 않는다(null).
 *
 * 문구 재료는 카드 원문 그대로(제목·출처명·URL — 번역·요약·다듬기 없음, D23). 기사 본문·요약문은 쓰지 않는다.
 */
import type {
  CompId,
  KoreanPlayersFile,
  NewsCard,
  TransferStatus,
} from "@/lib/schema";

import { transferIssueKey, type IssuePayloadInput } from "./github-issues";
import type { TeamMismatch } from "./korean-players-data";

/** 이슈를 만드는 카드 단계 — 확정 쪽만(머리 주석 ②) */
export const TRANSFER_ISSUE_STATUSES: readonly TransferStatus[] = [
  "agreed",
  "official",
];

/** payload 하나에 싣는 근거 카드 상한(스키마와 같다) */
export const MAX_CARDS = 10;
/** 카드 하나에 싣는 출처 상한 */
const MAX_SOURCES = 5;

type LeagueId = Exclude<CompId, "UCL">;
export type DestinationLeague = LeagueId | "OTHER" | null;

export type PlayerTransferPayload = IssuePayloadInput<"player-transfer">;

export interface TransferIssueInput {
  /** 오늘 뉴스 파일 카드(없으면 빈 배열) */
  cards: readonly NewsCard[];
  /** 한국 선수 현황 단계의 라인업 불일치(단계가 돌지 않았으면 빈 배열) */
  mismatches: readonly TeamMismatch[];
  players: KoreanPlayersFile;
  /** 팀 slug → 리그(team-leagues.ts TEAM_LEAGUE_INDEX) */
  teamLeagues: ReadonlyMap<string, LeagueId>;
  /** 아는 팀 slug(team-ids.json 키 ∪ names.ko.json 팀 slug) — 리그 표에 없으면 5대 리그 밖 */
  knownTeams: ReadonlySet<string>;
  /** 팀 slug → 영문 대표 이름(names.ko 팀 항목 — 이슈 표기용, 없으면 slug만) */
  teamNames: ReadonlyMap<string, string>;
  /** 팀 표 시즌이 competitions.json 시즌과 같은가(다르면 리그 판정 안 함) */
  leagueTableCurrent: boolean;
}

export interface TransferIssueContext {
  runId?: string;
  runUrl?: string;
  publishDate?: string;
  occurredAt: string;
}

/** 카드 1장이 후보인지(머리 주석 (a)) — 아니면 null */
export function cardTransferCandidate(
  card: NewsCard,
  players: KoreanPlayersFile,
): { player: string; to: string | null } | null {
  const t = card.transfer;
  if (card.cat !== "transfer" || t === undefined) return null;
  if (!TRANSFER_ISSUE_STATUSES.includes(t.status)) return null;
  const player = players.find((p) => p.slug === t.player);
  if (!player) return null;
  if (t.to !== undefined) {
    return t.to === player.team ? null : { player: player.slug, to: t.to };
  }
  // 행선지 없이 다른 팀을 떠난다는 카드 — 지금 소속과 무관한 지난 이적
  if (t.from !== undefined && t.from !== player.team) return null;
  return { player: player.slug, to: null };
}

/** 행선지 리그 판정(머리 주석 'FR-64') */
export function destinationLeagueOf(
  slug: string | null,
  input: Pick<
    TransferIssueInput,
    "teamLeagues" | "knownTeams" | "leagueTableCurrent"
  >,
): { league: DestinationLeague; note?: string } {
  if (!input.leagueTableCurrent) {
    return {
      league: null,
      note: "팀 → 리그 표(scripts/lib/team-leagues.ts)의 시즌이 competitions.json과 다르다 — /new-season 뒤 다시 판단",
    };
  }
  if (slug === null) {
    return {
      league: null,
      note: "팀 대응표(configs/team-ids.json)에 없는 팀 — 5대 리그 96팀은 모두 등록돼 있어 5대 리그 밖일 가능성이 크다",
    };
  }
  const league = input.teamLeagues.get(slug);
  if (league !== undefined) return { league };
  if (input.knownTeams.has(slug)) {
    return {
      league: "OTHER",
      note: "2026-27 5대 리그 팀 표(scripts/lib/team-leagues.ts)에 없는 팀",
    };
  }
  return {
    league: null,
    note: "팀 대응표·표기 사전에 없는 slug",
  };
}

/** 스키마 길이 상한에 맞춰 자른다(표시용 이름 — 카드 제목은 자르지 않는다: 스키마 상한 300 > 카드 상한 200) */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const STATUS_RANK: Readonly<Record<TransferStatus, number>> = {
  official: 0,
  agreed: 1,
  negotiating: 2,
  rumor: 3,
  collapsed: 4,
};

interface Group {
  player: string;
  destination: { slug: string | null; name: string | null };
  cards: NewsCard[];
  lineup: TeamMismatch | null;
}

/**
 * 카드·라인업 단서 → 이적 감지 이슈 payload(선수 + 행선지마다 하나, 설정 순서 → 키 순). 같은 입력이면 같은 출력(결정적).
 */
export function transferIssuePayloads(
  input: TransferIssueInput,
  ctx: TransferIssueContext,
): PlayerTransferPayload[] {
  const groups = new Map<string, Group>();
  const groupOf = (
    player: string,
    destination: Group["destination"],
  ): Group => {
    const key = transferIssueKey(player, destination);
    let g = groups.get(key);
    if (!g) {
      g = { player, destination, cards: [], lineup: null };
      groups.set(key, g);
    }
    // 같은 키인데 이름을 몰랐으면 채운다(카드 slug + 라인업 원문 이름)
    if (g.destination.name === null && destination.name !== null) {
      g.destination = { ...g.destination, name: destination.name };
    }
    return g;
  };

  const seenCards = new Set<string>();
  for (const card of input.cards) {
    if (seenCards.has(card.id)) continue;
    seenCards.add(card.id);
    const hit = cardTransferCandidate(card, input.players);
    if (!hit) continue;
    groupOf(hit.player, {
      slug: hit.to,
      name: hit.to === null ? null : (input.teamNames.get(hit.to) ?? null),
    }).cards.push(card);
  }

  const registered = new Set(input.players.map((p) => p.slug));
  for (const m of input.mismatches) {
    if (!registered.has(m.player)) continue;
    const g = groupOf(m.player, {
      slug: m.observedTeam,
      name:
        (m.observedTeam !== null
          ? input.teamNames.get(m.observedTeam)
          : undefined) ?? m.observedTeamName,
    });
    if (
      g.lineup === null ||
      Date.parse(m.kickoff) > Date.parse(g.lineup.kickoff)
    ) {
      g.lineup = m;
    }
  }

  const order = new Map(input.players.map((p, i) => [p.slug, i] as const));
  const entries = [...groups.entries()].sort(
    ([ka, a], [kb, b]) =>
      (order.get(a.player) ?? 0) - (order.get(b.player) ?? 0) ||
      (ka < kb ? -1 : ka > kb ? 1 : 0),
  );
  const out: PlayerTransferPayload[] = [];
  for (const [, g] of entries) {
    const player = input.players.find((p) => p.slug === g.player);
    if (!player) continue;
    const { league, note } = destinationLeagueOf(g.destination.slug, input);
    const cards = [...g.cards]
      .sort(
        (a, b) =>
          STATUS_RANK[a.transfer!.status] - STATUS_RANK[b.transfer!.status] ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, MAX_CARDS);
    out.push({
      player: player.slug,
      playerName: player.nameKo,
      config: { team: player.team, comp: player.comp, active: player.active },
      destination: {
        slug: g.destination.slug,
        name:
          g.destination.name === null ? null : clip(g.destination.name, 100),
        league,
        ...(note !== undefined ? { note } : {}),
      },
      cards: cards.map((c) => ({
        id: c.id,
        title: c.t,
        status: c.transfer!.status,
        tier: c.transfer!.tier,
        sources: c.src
          .slice(0, MAX_SOURCES)
          .map((s) => ({ name: clip(s.n, 100), url: s.u })),
      })),
      lineup:
        g.lineup === null
          ? null
          : {
              matchId: g.lineup.matchId,
              kickoff: g.lineup.kickoff,
              teamName: clip(g.lineup.observedTeamName, 100),
            },
      ...(ctx.runId ? { runId: ctx.runId } : {}),
      ...(ctx.runUrl ? { runUrl: ctx.runUrl } : {}),
      ...(ctx.publishDate ? { publishDate: ctx.publishDate } : {}),
      occurredAt: ctx.occurredAt,
    });
  }
  return out;
}
