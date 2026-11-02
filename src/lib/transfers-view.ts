/**
 * 이적 화면 모델 — `/transfers/` 원장 행 · 펼침 타임라인 · 필터 건수 · 홈 '이적 핫 리스트' (PRD FR-101 · FR-104 · FR-106 · §4.2 7, §15 D64 ②⑤ ·
 * D67 ①⑤⑥, DESIGN §9.3 D2 "이적 원장 행" · "이적 필터" · "이적 타임라인" · "홈 위젯 (D2)", plan M4-04). I/O 없는 순수 함수 — 로더
 * (src/lib/data/transfers.ts)가 읽은 값을 받는다.
 *
 * ── 원장 행 ──────────────────────────────────────────────────────────────
 *   파일 순서 그대로(잠잠 아님 → 최근 갱신 순, 잠잠은 맨 아래 — FR-106, 집계가 정한다). 선수 이름 = 등록 한국 선수면 설정의 한글 이름, 아니면
 *   표기 사전(`names.ko.json` player 항목) — 없으면 null(화면은 빈 밑줄 + "이름 표기 전 — 원제목 참고", 표기를 지어내지 않는다).
 *   '소속' 칸(D64 ②)은 등록 한국 선수만 설정상 소속 팀. 출발 칸은 `from`이 있을 때만(소속으로 메우지 않는다). 행선지 없는 레코드(`<선수>:-`,
 *   D67 ①)는 행선지 '–' + "행선지 미정".
 *
 * ── 타임라인 (FR-101 '관련 기사 타임라인', D64 ⑤) ───────────────────────
 *   ① 단계 근거 = `history`의 카드 전부(상태를 바꾸지 않은 카드 포함 — D67 ⑤). 상태를 바꾼 카드인지는 `transferStatusChanges`로 다시 계산한다
 *      (src/lib/transfer-status.ts — 집계와 같은 상태 머신). 카드가 빌드 입력에 없으면(삭제 요청 — 다음 집계 전) 그 노드를 뺀다.
 *   ② 보조 = 같은 선수의 이적 분류 카드(`cat: "transfer"` + `transfer` 없음 + `players`에 선수 slug). 이름만 스친 기사가 섞이지 않게 범위를
 *      좁힌다(`AUX_RULE` — DECISIONS D2 §9):
 *      - 행선지 레코드는 카드 팀 태그에 **그 행선지가 있을 때만**(행선지별 레코드 — D67 ①, 다른 행선지 이적설은 그 레코드로).
 *      - 행선지 미정 레코드는 카드 팀 태그가 **소속 · 출발 팀뿐(또는 없음)**일 때만(다른 팀이 나오면 그 팀 이야기일 수 있다 — 추정해 붙이지 않는다).
 *      - 첫 단계 근거보다 30일 넘게 앞선 카드는 뺀다 · 최신 8장까지(`AUX_MAX`).
 *   노드는 최신순(같은 시각이면 단계 근거 먼저 → 카드 ID). 원제목 · 출처명 · 원문 링크 그대로(D23 — 번역 · 요약 없음).
 *
 * ── 홈 핫 리스트 (PRD §4.2 7 '상태 변화가 있었던 상위 5건') ─────────────
 *   잠잠 제외 → **최근 갱신의 KST 날짜**가 늦은 순 → 같은 날이면 단계 무게(공식 4 · 합의 3 · 협상 2 · 결렬 2 · 루머 1)가 큰 순 → 최고 출처
 *   Tier가 높은 순(숫자 작은 쪽) → 갱신 시각 늦은 순 → id. 상위 5건. 링크는 그 이적의 최신 단계 근거 카드 `#xt-{카드 ID}`(DECISIONS D2 §6 #4).
 */
import type { TeamView } from "@/lib/competition-view";
import type { CompId, Tier, TransferStatus } from "@/lib/schema/common";
import { CATEGORY_LABEL } from "@/lib/news/labels";
import type { NewsCard } from "@/lib/schema/news";
import type { Transfer } from "@/lib/schema/transfer";
import { kstDate, parseUtcIso } from "@/lib/time";
import {
  TRANSFER_KR_VALUE,
  transferFilterCounts,
  type TransferFilterAxis,
  type TransferFilterValues,
} from "@/lib/transfer-filter";
import { transferStatusChanges } from "@/lib/transfer-status";

// ─── 정책 ────────────────────────────────────────────────────────────────

/** 보조 노드 상한(레코드당 최신 n장) */
export const AUX_MAX = 8;
/** 보조 노드 하한 — 첫 단계 근거보다 이만큼 넘게 앞선 카드는 뺀다(일) */
export const AUX_LOOKBACK_DAYS = 30;
/** 홈 핫 리스트 상한(PRD §4.2 '상위 5건') */
export const HOT_LIST_MAX = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 단계 순서(필터 · 범례) */
export const TRANSFER_STATUSES: readonly TransferStatus[] = [
  "rumor",
  "negotiating",
  "agreed",
  "official",
  "collapsed",
];

/** 핫 리스트 단계 무게(머리 주석) */
export const HOT_STAGE_WEIGHT: Readonly<Record<TransferStatus, number>> = {
  official: 4,
  agreed: 3,
  negotiating: 2,
  collapsed: 2,
  rumor: 1,
};

/** 필터 리그 축 대상 — 5대 리그(UCL은 리그가 아니다) */
export const TRANSFER_LEAGUES: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
];

const ms = (iso: string) => parseUtcIso(iso).getTime();
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ─── 입력 ────────────────────────────────────────────────────────────────

/** 등록 한국 선수(설정) — 이름 · 소속 */
export interface KoreanTransferPlayer {
  slug: string;
  nameKo: string;
  team: string;
  comp: CompId | "OTHER";
  /** 선수 상세 페이지가 있는가(설정의 선수 = 늘 있다 — 기본 true, 견본 가명 선수만 false) */
  page?: boolean;
}

export interface TransfersViewInput {
  /** `data/transfers.json`(파일 순서) */
  records: readonly Transfer[];
  /** 보존된 뉴스 카드(삭제 요청 제외, 같은 id는 앞 날짜 것 하나) */
  cards: readonly NewsCard[];
  korean: readonly KoreanTransferPlayer[];
  /** 선수 slug → 사전 한글 표기(없으면 null) */
  playerName: (slug: string) => string | null;
  team: (slug: string) => TeamView;
  /** 팀 slug → 5대 리그(팀 파일의 리그 — 없거나 5대 리그 밖이면 null) */
  leagueOf: (slug: string) => CompId | null;
}

// ─── 출력 ────────────────────────────────────────────────────────────────

/** 타임라인 · 근거 줄의 카드(원제목 그대로) */
export interface TransferCardView {
  id: string;
  title: string;
  lang: string;
  url: string;
  source: string;
  at: string;
  /** 같은 카드의 다른 출처 수(+N) */
  more: number;
  /**
   * 결과 가림(FR-37, M4-15) — spoiler 카드면 띠 설명("{한국 선수 관련 · }{분류} 제목" — 뉴스 카드와 같은 말), 아니면 null.
   * 가림이 켜지면 원제목을 접고 띠를 보인다
   */
  spoiler: string | null;
}

export type TimelineNodeView =
  | {
      kind: "stage";
      card: TransferCardView;
      status: TransferStatus;
      tier: Tier;
      /** 이 카드가 상태를 바꿨나(첫 카드 = 늘 true) */
      changed: boolean;
    }
  | { kind: "aux"; card: TransferCardView };

export interface TransferPlayerView {
  slug: string;
  /** 한글 이름 — 사전에 없으면 null */
  name: string | null;
  /** 등록 한국 선수(완장 · 소속 칸) */
  korean: boolean;
  /** 선수 상세 링크를 걸 수 있는가(등록 한국 선수 — 견본 가명 제외) */
  page: boolean;
}

export interface TransferRowView {
  id: string;
  /** 행 DOM id(`x-{선수}--{행선지}` — 행선지 미정은 `x-{선수}--`) */
  anchor: string;
  player: TransferPlayerView;
  /** 소속(등록 한국 선수만 — D64 ②) */
  affiliation: TeamView | null;
  from: TeamView | null;
  to: TeamView | null;
  status: TransferStatus;
  bestTier: Tier;
  updated: string;
  quiet: boolean;
  /** 최신 단계 근거 카드(근거 줄 · 핫 리스트 도착) — 카드가 모두 빠졌으면 null */
  lead: TransferCardView | null;
  /** 최신순 노드 */
  timeline: TimelineNodeView[];
  stageCount: number;
  auxCount: number;
  /** 필터 축 값 */
  filter: TransferFilterValues;
}

export interface FilterOptionView {
  value: string;
  count: number;
}

export interface TransfersView {
  rows: TransferRowView[];
  options: {
    league: Array<FilterOptionView & { comp: CompId }>;
    team: Array<FilterOptionView & { team: TeamView }>;
    status: Array<FilterOptionView & { status: TransferStatus }>;
    tier: Array<FilterOptionView & { tier: Tier }>;
    kr: number;
  };
  /** 화면이 아는 축 값(쿼리 검증 — 버튼과 같은 순서) */
  known: Record<TransferFilterAxis, string[]>;
}

// ─── 카드 ────────────────────────────────────────────────────────────────

function cardView(card: NewsCard): TransferCardView {
  const lead = card.src[0]!;
  return {
    id: card.id,
    title: card.t,
    lang: card.lang,
    url: lead.u,
    source: lead.n,
    at: lead.at,
    more: card.src.length - 1,
    spoiler: card.spoiler
      ? `${card.kr ? "한국 선수 관련 · " : ""}${CATEGORY_LABEL[card.cat]} 제목`
      : null,
  };
}

/** 행 DOM id — slug에는 `--`가 들 수 없어 선수 · 행선지 경계가 겹치지 않는다 */
export function transferAnchor(player: string, to: string | undefined): string {
  return `x-${player}--${to ?? ""}`;
}

/** 타임라인 항목 DOM id(홈 핫 리스트 도착 — DECISIONS D2 §6 #4) */
export function timelineAnchor(cardId: string): string {
  return `xt-${cardId}`;
}

// ─── 보조 노드 ───────────────────────────────────────────────────────────

/** 보조 노드 후보인가 — 이적 분류 · 단계 없음 · 선수 태그 */
export function isAuxiliaryCandidate(card: NewsCard, player: string): boolean {
  return (
    card.cat === "transfer" &&
    card.transfer === undefined &&
    card.players.includes(player)
  );
}

/**
 * 레코드 하나의 보조 노드 카드(머리 주석 ②) — 최신순, 최대 `AUX_MAX`장. `knownTeams` = 행선지 미정 레코드에서 허용하는 팀(소속 · 출발).
 */
export function auxiliaryCards(
  record: Pick<Transfer, "player" | "to" | "history">,
  cards: readonly NewsCard[],
  knownTeams: readonly string[] = [],
): NewsCard[] {
  const first = record.history[0];
  const floor = first ? ms(first.at) - AUX_LOOKBACK_DAYS * DAY_MS : -Infinity;
  const evidence = new Set(record.history.map((h) => h.card));
  return cards
    .filter((card) => {
      if (!isAuxiliaryCandidate(card, record.player)) return false;
      if (evidence.has(card.id)) return false;
      if (ms(card.src[0]!.at) < floor) return false;
      if (record.to !== undefined) return card.teams.includes(record.to);
      return card.teams.every((t) => knownTeams.includes(t));
    })
    .sort((a, b) => ms(b.src[0]!.at) - ms(a.src[0]!.at) || byId(a.id, b.id))
    .slice(0, AUX_MAX);
}

// ─── 타임라인 ────────────────────────────────────────────────────────────

/**
 * 레코드 → 타임라인 노드(최신순). 단계 근거의 `changed`는 history 전체(카드가 빠진 항목 포함 — 집계가 본 순서 그대로)로 계산한 뒤, 카드가
 * 없는 노드만 뺀다.
 */
export function timelineNodes(
  record: Pick<Transfer, "history">,
  cardsById: ReadonlyMap<string, NewsCard>,
  aux: readonly NewsCard[],
): TimelineNodeView[] {
  const changes = transferStatusChanges(record.history.map((h) => h.status));
  const nodes: Array<{ node: TimelineNodeView; atMs: number; order: number }> =
    [];
  record.history.forEach((h, i) => {
    const card = cardsById.get(h.card);
    if (!card) return;
    nodes.push({
      node: {
        kind: "stage",
        card: cardView(card),
        status: h.status,
        tier: card.transfer?.tier ?? card.src[0]!.tier,
        changed: changes[i]!,
      },
      atMs: ms(card.src[0]!.at),
      order: 0,
    });
  });
  for (const card of aux) {
    nodes.push({
      node: { kind: "aux", card: cardView(card) },
      atMs: ms(card.src[0]!.at),
      order: 1,
    });
  }
  return nodes
    .sort(
      (a, b) =>
        b.atMs - a.atMs ||
        a.order - b.order ||
        byId(a.node.card.id, b.node.card.id),
    )
    .map((n) => n.node);
}

// ─── 원장 ────────────────────────────────────────────────────────────────

function uniq<T>(list: readonly (T | null | undefined)[]): T[] {
  const out: T[] = [];
  for (const v of list) if (v != null && !out.includes(v)) out.push(v);
  return out;
}

/** `/transfers/` 화면 모델 */
export function transfersView(input: TransfersViewInput): TransfersView {
  const cardsById = new Map(input.cards.map((c) => [c.id, c]));
  const korean = new Map(input.korean.map((p) => [p.slug, p]));
  const rows = input.records.map((record): TransferRowView => {
    const kr = korean.get(record.player);
    const affiliationSlug = kr?.team ?? null;
    const aux = auxiliaryCards(
      record,
      input.cards,
      uniq([affiliationSlug, record.from]),
    );
    const timeline = timelineNodes(record, cardsById, aux);
    const stages = timeline.filter((n) => n.kind === "stage");
    const teams = uniq([affiliationSlug, record.from, record.to]);
    const leagues = uniq([
      kr && kr.comp !== "OTHER" ? kr.comp : null,
      ...teams.map((t) => input.leagueOf(t)),
    ]).filter((c) => TRANSFER_LEAGUES.includes(c));
    return {
      id: record.id,
      anchor: transferAnchor(record.player, record.to),
      player: {
        slug: record.player,
        name: kr?.nameKo ?? input.playerName(record.player),
        korean: kr !== undefined,
        page: kr !== undefined && kr.page !== false,
      },
      affiliation: affiliationSlug ? input.team(affiliationSlug) : null,
      from: record.from ? input.team(record.from) : null,
      to: record.to ? input.team(record.to) : null,
      status: record.status,
      bestTier: record.bestTier,
      updated: record.updated,
      quiet: record.quiet,
      lead: stages[0]?.card ?? null,
      timeline,
      stageCount: stages.length,
      auxCount: timeline.length - stages.length,
      filter: {
        league: TRANSFER_LEAGUES.filter((c) => leagues.includes(c)).map((c) =>
          c.toLowerCase(),
        ),
        team: teams,
        status: [record.status],
        tier: [String(record.bestTier)],
        kr: kr ? [TRANSFER_KR_VALUE] : [],
      },
    };
  });

  const values = rows.map((r) => r.filter);
  const count = (axis: TransferFilterAxis) =>
    transferFilterCounts(values, axis);
  const leagueCounts = count("league");
  const teamCounts = count("team");
  const statusCounts = count("status");
  const tierCounts = count("tier");
  const krCount = count("kr").get(TRANSFER_KR_VALUE) ?? 0;

  const league = TRANSFER_LEAGUES.map((comp) => ({
    comp,
    value: comp.toLowerCase(),
    count: leagueCounts.get(comp.toLowerCase()) ?? 0,
  }));
  // 팀 = 원장에 나온 팀만(건수 많은 순 → 한글 이름 순)
  const team = [...teamCounts.entries()]
    .map(([slug, n]) => ({ value: slug, count: n, team: input.team(slug) }))
    .sort(
      (a, b) =>
        b.count - a.count || a.team.name.localeCompare(b.team.name, "ko"),
    );
  const status = TRANSFER_STATUSES.map((s) => ({
    status: s,
    value: s,
    count: statusCounts.get(s) ?? 0,
  }));
  const tier = ([1, 2, 3] as const).map((t) => ({
    tier: t,
    value: String(t),
    count: tierCounts.get(String(t)) ?? 0,
  }));
  return {
    rows,
    options: { league, team, status, tier, kr: krCount },
    known: {
      league: league.map((o) => o.value),
      team: team.map((o) => o.value),
      status: status.map((o) => o.value),
      tier: tier.map((o) => o.value),
      kr: [TRANSFER_KR_VALUE],
    },
  };
}

// ─── 홈 핫 리스트 ────────────────────────────────────────────────────────

export interface HotTransferView {
  id: string;
  player: TransferPlayerView;
  to: TeamView | null;
  status: TransferStatus;
  bestTier: Tier;
  updated: string;
  /** 도착 카드(최신 단계 근거) — 이름이 없을 때는 그 원제목을 싣는다 */
  lead: TransferCardView;
}

/** 핫 리스트 정렬(머리 주석) */
export function compareHot(
  a: Pick<TransferRowView, "id" | "status" | "bestTier" | "updated">,
  b: Pick<TransferRowView, "id" | "status" | "bestTier" | "updated">,
): number {
  const da = kstDate(a.updated);
  const db = kstDate(b.updated);
  return (
    (da < db ? 1 : da > db ? -1 : 0) ||
    HOT_STAGE_WEIGHT[b.status] - HOT_STAGE_WEIGHT[a.status] ||
    a.bestTier - b.bestTier ||
    ms(b.updated) - ms(a.updated) ||
    byId(a.id, b.id)
  );
}

/** 홈 '이적 핫 리스트' — 잠잠 제외 · 근거 카드가 남은 레코드만 · 상위 5건 */
export function hotTransfers(
  rows: readonly TransferRowView[],
  max: number = HOT_LIST_MAX,
): HotTransferView[] {
  return rows
    .filter(
      (r): r is TransferRowView & { lead: TransferCardView } =>
        !r.quiet && r.lead !== null,
    )
    .sort(compareHot)
    .slice(0, max)
    .map((r) => ({
      id: r.id,
      player: r.player,
      to: r.to,
      status: r.status,
      bestTier: r.bestTier,
      updated: r.updated,
      lead: r.lead,
    }));
}
