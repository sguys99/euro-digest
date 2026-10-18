/**
 * 뉴스 피드 화면 모델 — 한 호의 카드 목록 → 카드마다 그릴 값 (PRD FR-30·FR-21·FR-31, D23·D30, DESIGN.md §9.3, plan M1-31)
 *
 * 화면(서버 컴포넌트)은 이 순수 함수가 고른 값만 그린다 — 게재 번호·머리기사·태그 한글 표기·대회 약칭·출처 스택·이적 단계·연결 줄.
 * 설정(표기 사전·대회·한국 선수)은 바깥(src/lib/data/card-labels.ts)에서 읽어 `CardLabels`로 넘긴다(I/O는 바깥).
 *
 * 규칙
 * - **원제목·출처는 고치지 않는다**(D23): `card.t`·`src[].n`·`src[].u`를 그대로 넘긴다. 요약 줄(`s`)·"AI 작성" 라벨은 뉴스 카드에 없다.
 * - **게재 번호**는 06부터(5줄 1~5 다음, DESIGN §3.5) 파일 순서대로. 삭제 요청 카드는 로더가 이미 뺐다(번호가 앞당겨진다).
 * - **머리기사**(1024 이상, D30): imp가 가장 높은 카드 1장, 동점이면 파일 순서상 앞. 파일 순서는 파이프라인이 "중요도 내림차순 →
 *   최신 출처 시각 내림차순"으로 쓰므로(scripts/lib/news-file.ts `sortCards`) 늘 첫 카드다 — imp 5가 없는 날은 최고 imp 중 최신 카드.
 *   화면은 카드를 옮기지 않고 그 자리에서 크게 그린다(DOM 순서 = 보이는 순서, WCAG 2.4.3). 필터 결과에는 두지 않는다(`lead: false`).
 * - **태그**: `teams`·`players` slug → `names.ko.json` 한글 표기. 사전에 없는 slug는 그리지 않는다(slug 노출 금지). 한국 선수
 *   (`korean-players.json`) 태그만 굵게.
 * - **출처 스택**(사용자 결정 2026-10-19): 다른 매체가 1곳 이상이면 '+N곳'(N = 서로 다른 출처명(`src[].n`) 수 − 1 — 같은 매체의
 *   다른 기사는 '곳'으로 세지 않는다, M1-15 이월 메모), 추가 출처가 모두 대표와 같은 매체면 '+N건'(N = 추가 기사 수). 어느 쪽이든
 *   펼친 목록에는 카드 출처 전부를 파일 순서대로(`src` 순서 = 출처 스택 순서, card-lead.ts) — 섞인 경우(다른 매체 + 같은 매체 기사)도
 *   '+N곳'이고 행은 모든 기사. 출처가 1건이면 버튼·목록 없음.
 * - **연결 줄**: src/lib/news/link-pairs.ts의 엄격 규칙으로 짝지은 카드끼리 양쪽에 단다(해외 카드 → "국내 보도", 국내 카드 →
 *   "해외 보도"). 짝이 아래에 있으면 ↓, 위에 있으면 ↑.
 */
import type { CompId, Tier, TransferStatus } from "@/lib/schema/common";
import type { NewsCard } from "@/lib/schema/news";

import { CATEGORY_LABEL } from "./labels";
import { labelTags, type TagLabels } from "./tag-labels";
import { isDomestic, linkPairs } from "./link-pairs";

/** 피드 첫 게재 번호 — 5줄 1~5 다음(DESIGN §3.5) */
export const FIRST_CARD_NO = 6;

/** 설정에서 읽은 표시 이름(빌드 때 서버에서만 — src/lib/data/card-labels.ts) */
export interface CardLabels {
  /** 태그 slug → 한글 표기(`names.ko.json`) */
  tags: TagLabels;
  /** 한국 선수 slug인가(`korean-players.json`) — 태그를 굵게 */
  isKoreanPlayer(slug: string): boolean;
  /** 대회 약칭·정식 이름(`competitions.json` shortKo·nameKo). 설정에 없으면 null — 탭을 그리지 않는다 */
  competition(id: CompId): { short: string; name: string } | null;
}

export interface CardTagView {
  slug: string;
  label: string;
  /** 한국 선수 태그(800 --ink) */
  korean: boolean;
}

export interface CompetitionView {
  id: CompId;
  /** 약칭(인덱스 탭 글자 = 접근 이름) */
  short: string;
  /** 정식 이름(`title`) */
  name: string;
}

export interface SourceView {
  name: string;
  url: string;
  /** 원문 발행 시각(UTC ISO) */
  at: string;
  /** 출처명의 `lang` 속성(한글 매체명 ko, 라틴 매체명은 카드 언어 — 국내 카드면 en) */
  lang: string;
}

export interface SourceStackView {
  /** 대표 출처(`src[0]`) — 메타 줄의 출처명·시각, 제목 링크 */
  lead: SourceView;
  /** 버튼 숫자 N — '+N곳'이면 대표 밖 다른 매체 수, '+N건'이면 같은 매체 추가 기사 수(0이면 버튼 없음) */
  more: number;
  /** 버튼 단위 — `outlets` '+N곳'(다른 매체가 있음) · `articles` '+N건'(추가 출처가 모두 같은 매체) */
  unit: "outlets" | "articles";
  /** 펼친 목록 행 — `more > 0`이면 카드 출처 전부(파일 순서), 아니면 [] */
  rows: SourceView[];
}

export interface TransferView {
  status: TransferStatus;
  /** 이적 정보의 출처 Tier(Tier 배지) */
  tier: Tier;
}

export interface LinkLineView {
  /** 짝 카드 ID(`href="#…"`) */
  targetId: string;
  /** 짝 카드 게재 번호 */
  targetNo: number;
  /** 짝 카드 대표 출처 */
  targetSource: SourceView;
  /** 짝이 국내 보도면 "domestic"(해외 카드에 다는 줄), 해외 보도면 "foreign" */
  targetKind: "domestic" | "foreign";
  /** 짝이 아래면 down(↓), 위면 up(↑) */
  direction: "up" | "down";
}

export interface FeedCardView {
  card: NewsCard;
  /** 게재 번호(06~) */
  no: number;
  /** 머리기사(1024 이상에서만 크게 — 1023 이하는 일반 카드 모양) */
  lead: boolean;
  /** 분류 도장 라벨 */
  category: string;
  tags: CardTagView[];
  /** 인덱스 탭(대회가 둘이면 둘 — 대회 없는 카드는 []) */
  comps: CompetitionView[];
  stack: SourceStackView;
  /** 이적 단계 줄 — `card.transfer`가 있을 때만(이적 분류인데 없으면 도장만, DESIGN §9.3) */
  transfer: TransferView | null;
  link: LinkLineView | null;
}

export interface BuildFeedOptions {
  /** 머리기사를 둘지 — 전체 피드 true, 필터 결과 false(D30·DECISIONS D0 §5 #13) */
  lead: boolean;
  labels: CardLabels;
  /** 첫 게재 번호(기본 06) */
  firstNo?: number;
}

/**
 * 머리기사 카드의 위치 — imp가 가장 높은 카드, 동점이면 앞(파일 순서). 카드가 없으면 -1.
 * 파이프라인 파일은 imp 내림차순이라 늘 0이다(머리 주석).
 */
export function leadIndex(cards: ReadonlyArray<Pick<NewsCard, "imp">>): number {
  let best = -1;
  cards.forEach((card, index) => {
    const top = cards[best];
    if (top === undefined || card.imp > top.imp) best = index;
  });
  return best;
}

const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힣]/u;

/**
 * 출처명의 `lang` — 한글이 들어 있으면 ko, 아니면 라틴 매체명이다: 해외 카드는 카드 언어(대표 매체 언어), 국내 카드에 라틴 매체명이
 * 오면 en(국내·해외는 한 클러스터가 되지 않아 지금은 없다 — D30).
 */
export function sourceNameLang(name: string, cardLang: string): string {
  if (HANGUL_RE.test(name)) return "ko";
  return cardLang === "ko" ? "en" : cardLang;
}

function sourceView(
  source: NewsCard["src"][number],
  cardLang: string,
): SourceView {
  return {
    name: source.n,
    url: source.u,
    at: source.at,
    lang: sourceNameLang(source.n, cardLang),
  };
}

/** 출처 스택 — 대표 출처 + '+N곳'(서로 다른 출처명 수 − 1) 또는 '+N건'(같은 매체 추가 기사 수) + 펼친 목록(머리 주석) */
export function sourceStack(
  card: Pick<NewsCard, "id" | "src" | "lang">,
): SourceStackView {
  const [first] = card.src;
  // 스키마가 출처 1건 이상을 보장한다(src.min(1)) — 없으면 데이터 오류라 빌드를 멈춘다
  if (first === undefined) throw new Error(`${card.id}: 출처 없음`);
  const otherOutlets = new Set(card.src.map((s) => s.n)).size - 1;
  const unit = otherOutlets > 0 ? "outlets" : "articles";
  const more = otherOutlets > 0 ? otherOutlets : card.src.length - 1;
  return {
    lead: sourceView(first, card.lang),
    more,
    unit,
    rows: more > 0 ? card.src.map((s) => sourceView(s, card.lang)) : [],
  };
}

/** 카드 태그 — 팀 → 선수 순서(파일 순서), 사전에 없는 slug는 뺀다 */
export function cardTags(
  card: Pick<NewsCard, "teams" | "players">,
  labels: CardLabels,
): CardTagView[] {
  return [
    ...labelTags(card.teams, "team", labels.tags).map((tag) => ({
      ...tag,
      korean: false,
    })),
    ...labelTags(card.players, "player", labels.tags).map((tag) => ({
      ...tag,
      korean: labels.isKoreanPlayer(tag.slug),
    })),
  ];
}

/** 인덱스 탭 — 카드 대회 순서 그대로, 같은 대회는 한 번, 설정에 없는 대회는 뺀다 */
export function cardCompetitions(
  card: Pick<NewsCard, "comp">,
  labels: CardLabels,
): CompetitionView[] {
  const out: CompetitionView[] = [];
  for (const id of new Set(card.comp)) {
    const label = labels.competition(id);
    if (label) out.push({ id, ...label });
  }
  return out;
}

/** 한 호의 카드 → 카드별 화면 모델(파일 순서 그대로 — 카드를 옮기거나 두 번 그리지 않는다) */
export function buildFeed(
  cards: readonly NewsCard[],
  options: BuildFeedOptions,
): FeedCardView[] {
  const firstNo = options.firstNo ?? FIRST_CARD_NO;
  const lead = options.lead ? leadIndex(cards) : -1;
  const pairs = linkPairs(cards);
  const indexById = new Map(cards.map((card, index) => [card.id, index]));
  const stacks = cards.map(sourceStack);

  return cards.map((card, index) => {
    const stack = stacks[index] as SourceStackView;
    const targetId = pairs.get(card.id);
    const targetIndex =
      targetId === undefined ? undefined : indexById.get(targetId);
    const target = targetIndex === undefined ? undefined : cards[targetIndex];
    const link: LinkLineView | null =
      targetId === undefined || targetIndex === undefined || !target
        ? null
        : {
            targetId,
            targetNo: firstNo + targetIndex,
            targetSource: (stacks[targetIndex] as SourceStackView).lead,
            targetKind: isDomestic(target) ? "domestic" : "foreign",
            direction: targetIndex > index ? "down" : "up",
          };
    return {
      card,
      no: firstNo + index,
      lead: index === lead,
      category: CATEGORY_LABEL[card.cat],
      tags: cardTags(card, options.labels),
      comps: cardCompetitions(card, options.labels),
      stack,
      transfer: card.transfer
        ? { status: card.transfer.status, tier: card.transfer.tier }
        : null,
      link,
    };
  });
}
