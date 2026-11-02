/**
 * 이적 트래커 집계 — 카드 `transfer` → `data/transfers.json` (M4-01, PRD FR-100·FR-102·FR-106, F10 'D23 한계', §15 D52·D54·D64 ②⑤).
 * I/O 없는 순수 함수만 둔다(입출력·단계는 transfers-io.ts). LLM을 쓰지 않는다(FR-100 — 단계 판정은 카드 분류 FR-21이 이미 했다).
 *
 * ── 이적 1건 = 선수 + 행선지 (2026-11-02 사용자 결정) ─────────────────────────────────────────
 *   id = `<선수 slug>:<행선지 slug>` — 카드 `transfer.player`·`transfer.to`는 names.ko.json·korean-players.json의 slug다(transfer-extract.ts
 *   ②④ — 등록 이름만 인식). 행선지가 없는 카드는 다른 행선지 레코드에 붙이지 않고(입력에 없는 사실 금지, CLAUDE §1-7) '행선지 미정'
 *   레코드 `<선수 slug>:-`로 따로 모은다('-'는 slug 형식 `^[a-z0-9]+(-[a-z0-9]+)*$`에 들 수 없어 실제 팀과 겹치지 않는다).
 *   단계·bestTier·history·결렬은 레코드(행선지)마다 따로 진행한다 — 행선지 없는 결렬 카드는 '미정' 레코드만 닫는다.
 *
 * ── 입력 = 보존된 뉴스 전체 재계산 ────────────────────────────────────────────────────────
 *   이전 transfers.json을 이어 쓰지 않고 매번 data/news 전체(삭제 요청 카드 제외)에서 다시 만든다 — 같은 입력이면 같은 출력(결정적)이고,
 *   삭제 요청(FR-143)·보존 기간 삭제(D32)로 사라진 카드가 근거에서 저절로 빠진다. 단계가 바뀌는 것은 근거 카드 자체가 사라질 때뿐이다
 *   (FR-102 역행 금지는 '더 낮은 단계 보도'가 단계를 내리지 않는다는 규칙 — 근거가 없는 단계는 남기지 않는다).
 *
 * ── 상태 머신 (FR-102) ───────────────────────────────────────────────────────────────────
 *   근거 카드를 시각 순(`cardAt` — 대표 출처 시각, 같은 시각이면 진행 단계 먼저·결렬 나중 → 카드 id)으로 적용한다.
 *   - 진행 단계 rumor < negotiating < agreed < official — 더 높은 단계만 올린다(역행 금지). 같거나 낮은 단계 카드는 상태를 바꾸지 않는다.
 *   - collapsed(결렬)는 예외 — 진행 중인 이적(rumor·negotiating·agreed)을 닫는다. official 뒤의 결렬은 적용하지 않는다(F10 D52 ② "결렬은
 *     진행 중인 이적을 닫는 유일한 단계" — 공식 발표된 이적은 진행 중이 아니다). 결렬 카드의 승격 조건(Tier 2 이상 또는 매체 2곳)은 카드
 *     분류가 이미 걸렀다(transfer-extract.ts ⑥).
 *   - 결렬 뒤에는 결렬 전 최고 단계(`peak`)보다 **높은** 진행 단계 카드만 다시 연다(진행 축에서 뒤로 가지 않는 해석 — 같거나 낮은 단계의
 *     재보도·전달 기사로 결렬이 풀리지 않게). 예: negotiating → collapsed → agreed = agreed, negotiating → collapsed → rumor = collapsed.
 *   history에는 근거 카드를 **모두** 남긴다(각 카드가 말한 단계 그대로 — 상태를 바꾸지 않은 낮은 단계 카드 포함). FR-101 '관련 기사
 *   타임라인'의 노드이고, 단계가 있는 카드는 D64 ⑤ '보조' 노드(단계 없는 이적 카드)로도 잡히지 않으므로 버리면 화면에서 사라진다.
 *
 * ── 그 밖의 필드 ─────────────────────────────────────────────────────────────────────────
 *   bestTier = 근거 카드 `transfer.tier`(카드 최고 출처 Tier) 중 가장 높은 값(숫자가 작은 쪽) · updated = 가장 늦은 근거 카드 시각 ·
 *   from = 출발 팀이 있는 가장 늦은 근거 카드의 `from`(없으면 비움 — 설정의 소속으로 메우지 않는다, D64 ②) ·
 *   quiet(FR-106 '30일 이상 갱신 없는 루머', M4-02) = 상태 rumor(D67 ⑥ — 협상·합의는 30일 무갱신이어도 진행 중) + 기준 시각 − updated
 *   ≥ 30일(`TRANSFER_QUIET_DAYS` × 24시간, 밀리초 비교 — 정확히 30일째 같은 시각부터 잠잠, '이상'). '갱신' = 그 레코드의 근거 카드가 새로
 *   생김(단계를 바꾸지 않은 같은 단계 재보도 포함 — 보도가 이어지면 잠잠이 아니다). 기준 시각 = 이 집계를 돌린 실행 시각(collect는 실행
 *   시각, build:transfers는 지금) — 정적 사이트라 잠잠 표시는 다음 집계(다음 날 아침 수집)까지 그대로이고, KST 날짜 경계로 자르지 않는
 *   것은 같은 입력·같은 실행 시각이면 같은 결과이고 시간대 변환이 필요 없어서다(늦어도 하루 안에 반영). updated가 카드 발행 시각(원문
 *   시각)이라 수집이 늦은 기사도 원문 기준으로 센다.
 *   파일 순서 = 잠잠하지 않은 것 먼저 → updated 내림차순 → id(FR-106 '목록 하단' — 화면은 파일 순서를 그대로 쓴다, 잠잠 레코드는 더 오래된
 *   협상·합의 레코드보다도 아래). validate가 `transfersOrderProblems`로 순서를 확인한다. history 순서 = 적용 순서.
 *   같은 카드 id가 여러 날짜 파일에 있으면 앞 날짜 파일의 것 하나만 쓴다.
 */
import type {
  NewsCard,
  Tier,
  Transfer,
  TransferStatus,
  TransfersFile,
} from "@/lib/schema";
import { parseUtcIso } from "@/lib/time";
import { PROGRESS_RANK, reduceTransferStatus } from "@/lib/transfer-status";

// ─── 정책 ────────────────────────────────────────────────────────────────

/** FR-106 — 이 기간 이상 근거 카드가 없으면 잠잠 */
export const TRANSFER_QUIET_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 행선지가 없는 카드의 레코드 키(slug에 들 수 없는 값) */
export const UNKNOWN_DESTINATION_KEY = "-";

/** 같은 시각 정렬용 — 진행 단계 먼저, 결렬 나중(transfer-extract.ts ⑥ '결렬이 진행 주장과 같거나 늦을 때'와 같은 쪽) */
const STATUS_ORDER: Readonly<Record<TransferStatus, number>> = {
  ...PROGRESS_RANK,
  collapsed: 4,
};

// ─── 상태 머신 ───────────────────────────────────────────────────────────
// 규칙(머리 주석 '상태 머신')은 화면 타임라인(M4-04)과 함께 쓰려고 src/lib/transfer-status.ts로 옮겼다 — 예전 이름 그대로 다시 내보낸다.

export {
  applyTransferStatus,
  initialTransferState,
  PROGRESS_RANK,
  reduceTransferStatus,
  type TransferState,
} from "@/lib/transfer-status";

// ─── 키·시각 ─────────────────────────────────────────────────────────────

/** 이적 레코드 id — `<선수 slug>:<행선지 slug | ->` */
export function transferIdOf(player: string, to: string | undefined): string {
  return `${player}:${to ?? UNKNOWN_DESTINATION_KEY}`;
}

/** 근거 카드의 시각 = 대표 출처(`src[0]` — 카드가 보여 주는 원문) 시각 */
export function cardAt(card: Pick<NewsCard, "src">): string {
  return card.src[0]!.at; // 스키마가 src.min(1)을 보장한다
}

const ms = (iso: string) => parseUtcIso(iso).getTime();

// ─── 집계 ────────────────────────────────────────────────────────────────

export interface TransferNewsInput {
  /** KST 발행일(파일명) — 같은 카드가 여러 파일에 있으면 앞 날짜의 것을 쓴다 */
  date: string;
  cards: readonly NewsCard[];
}

export interface TransfersBuildInput {
  news: readonly TransferNewsInput[];
  /** configs/takedowns.json 카드 id — 근거에서 뺀다 */
  takedownIds: ReadonlySet<string>;
  /** 기준 시각(UTC ISO) — quiet 판정 */
  now: string;
}

export interface TransfersBuildStats {
  /** transfer가 있는 카드(중복·삭제 요청 제외 뒤) */
  cards: number;
  /** 삭제 요청이라 뺀 transfer 카드 */
  takedown: number;
  /** 다른 날짜 파일과 id가 겹쳐 뺀 카드 */
  duplicates: number;
  /** 행선지 미정 레코드 수 */
  unknownDestination: number;
  quiet: number;
  byStatus: Record<TransferStatus, number>;
}

export interface TransfersBuild {
  transfers: Transfer[];
  stats: TransfersBuildStats;
}

interface Evidence {
  card: NewsCard;
  transfer: NonNullable<NewsCard["transfer"]>;
  at: string;
  atMs: number;
}

function compareEvidence(a: Evidence, b: Evidence): number {
  return (
    a.atMs - b.atMs ||
    STATUS_ORDER[a.transfer.status] - STATUS_ORDER[b.transfer.status] ||
    (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0)
  );
}

function bestTierOf(tiers: readonly Tier[]): Tier {
  return tiers.reduce<Tier>((best, t) => (t < best ? t : best), 3);
}

/** 레코드 1건 — 근거는 적용 순서로 정렬되어 있고 비어 있지 않다 */
function buildRecord(
  id: string,
  evidence: readonly Evidence[],
  nowMs: number,
): Transfer {
  const first = evidence[0]!;
  const last = evidence[evidence.length - 1]!;
  const status = reduceTransferStatus(evidence.map((e) => e.transfer.status))!;
  const from = [...evidence].reverse().find((e) => e.transfer.from)
    ?.transfer.from;
  const updated = last.at;
  return {
    id,
    player: first.transfer.player,
    ...(from !== undefined ? { from } : {}),
    ...(first.transfer.to !== undefined ? { to: first.transfer.to } : {}),
    status,
    bestTier: bestTierOf(evidence.map((e) => e.transfer.tier)),
    updated,
    quiet:
      status === "rumor" && nowMs - ms(updated) >= TRANSFER_QUIET_DAYS * DAY_MS,
    history: evidence.map((e) => ({
      at: e.at,
      status: e.transfer.status,
      card: e.card.id,
    })),
  };
}

/** 파일 순서 — 잠잠하지 않은 것 먼저 → updated 내림차순 → id */
export function compareTransfers(a: Transfer, b: Transfer): number {
  return (
    Number(a.quiet) - Number(b.quiet) ||
    ms(b.updated) - ms(a.updated) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** 보존된 뉴스 전체 → 이적 레코드(머리 주석). 같은 입력이면 같은 출력 */
export function buildTransfers(input: TransfersBuildInput): TransfersBuild {
  const nowMs = ms(input.now);
  const seen = new Set<string>();
  let takedown = 0;
  let duplicates = 0;
  const groups = new Map<string, Evidence[]>();
  const files = [...input.news].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const file of files) {
    for (const card of file.cards) {
      const transfer = card.transfer;
      if (transfer === undefined) continue;
      if (input.takedownIds.has(card.id)) {
        takedown += 1;
        continue;
      }
      if (seen.has(card.id)) {
        duplicates += 1;
        continue;
      }
      seen.add(card.id);
      const at = cardAt(card);
      const id = transferIdOf(transfer.player, transfer.to);
      const list = groups.get(id) ?? [];
      list.push({ card, transfer, at, atMs: ms(at) });
      groups.set(id, list);
    }
  }
  const transfers = [...groups.entries()]
    .map(([id, evidence]) =>
      buildRecord(id, [...evidence].sort(compareEvidence), nowMs),
    )
    .sort(compareTransfers);
  const byStatus: Record<TransferStatus, number> = {
    rumor: 0,
    negotiating: 0,
    agreed: 0,
    official: 0,
    collapsed: 0,
  };
  for (const t of transfers) byStatus[t.status] += 1;
  return {
    transfers,
    stats: {
      cards: seen.size,
      takedown,
      duplicates,
      unknownDestination: transfers.filter((t) => t.to === undefined).length,
      quiet: transfers.filter((t) => t.quiet).length,
      byStatus,
    },
  };
}

/** 직렬화 — 2칸 들여쓰기 + 끝 개행(다른 data 파일과 같은 형식) */
export function serializeTransfersFile(file: TransfersFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ─── 검증용 (validate-crossref.ts) ───────────────────────────────────────

/**
 * 파일의 레코드 1건이 이 집계 규칙과 맞는지 — 맞지 않는 항목의 설명 목록(빈 목록이면 일관). 근거 카드 존재는 보지 않는다(교차 검사가 본다).
 * 발행을 막지 않는 경고용이다(파이프라인 산출물 — 2026-10-10 Q7 결정과 같은 이유).
 */
export function transferRecordProblems(t: Transfer): string[] {
  const problems: string[] = [];
  if (t.id !== transferIdOf(t.player, t.to)) {
    problems.push(`id가 "${transferIdOf(t.player, t.to)}"(선수:행선지)와 다름`);
  }
  if (t.history.length === 0) return problems;
  const expected = reduceTransferStatus(t.history.map((h) => h.status));
  if (expected !== t.status) {
    problems.push(`status ${t.status} ≠ history 적용 결과 ${expected}`);
  }
  if (t.quiet && t.status !== "rumor") {
    problems.push(`quiet인데 status ${t.status} — 잠잠은 루머만(FR-106·D67 ⑥)`);
  }
  const latest = t.history.reduce(
    (max, h) => (ms(h.at) > ms(max) ? h.at : max),
    t.history[0]!.at,
  );
  if (ms(latest) !== ms(t.updated)) {
    problems.push(`updated ${t.updated} ≠ 가장 늦은 근거 시각 ${latest}`);
  }
  for (let i = 1; i < t.history.length; i += 1) {
    if (ms(t.history[i]!.at) < ms(t.history[i - 1]!.at)) {
      problems.push("history가 시각 순이 아님");
      break;
    }
  }
  return problems;
}

/**
 * 파일 순서가 `compareTransfers`(잠잠 아님 → updated 내림차순 → id — FR-106 '목록 하단')와 맞는지 — 어긋난 자리(뒤 레코드 index) 목록.
 * 화면은 파일 순서를 그대로 쓰므로 순서가 깨지면 잠잠 레코드가 위로 올라온다. 발행을 막지 않는 경고용(`transferRecordProblems`와 같은 이유).
 */
export function transfersOrderProblems(
  file: readonly Transfer[],
): Array<{ index: number; problem: string }> {
  const out: Array<{ index: number; problem: string }> = [];
  for (let i = 1; i < file.length; i += 1) {
    const prev = file[i - 1]!;
    const cur = file[i]!;
    if (compareTransfers(prev, cur) > 0) {
      out.push({
        index: i,
        problem: `"${cur.id}"가 "${prev.id}"보다 앞이어야 함 — 파일 순서는 잠잠 아님 → updated 내림차순 → id`,
      });
    }
  }
  return out;
}
