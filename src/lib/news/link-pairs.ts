/**
 * 같은 사건 연결 줄의 짝 — 해외 카드 ↔ 국내 카드 (PRD §15 D30, DECISIONS D0 §5 #10, DESIGN.md §9.3 연결 줄, plan M1-31)
 *
 * 클러스터링(M1-13)은 국내·해외를 서로 비교하지 않는다(D30) — 같은 사건의 국내 보도와 해외 보도가 따로 카드가 된다. 화면은
 * 빌드 때 이 순수 함수로 둘을 엄격하게 짝지어 "같은 소식 국내 보도 ···· 14 인터풋볼 ↓"처럼 게재 번호로 잇는다. 스키마는 바꾸지
 * 않는다(카드에 짝 필드가 없다 — 그날 호의 카드만으로 계산한다).
 *
 * 규칙 (모두 만족할 때만 잇는다 — 틀린 짝보다 짝 없음이 낫다)
 *   ① 한쪽은 해외 카드(`lang !== "ko"`), 다른 쪽은 국내 카드(`lang === "ko"`)
 *   ② 같은 팀 slug 2개 이상 **또는** 같은 선수 slug 1개 이상을 함께 가진다
 *   ③ 같은 분류(`cat`)
 *   ④ 대표 출처 시각(`src[0].at` — 카드에 표시되는 시각) 차이가 36시간 이내(경계 포함)
 *   ⑤ ①~④를 만족하는 상대 카드가 **양쪽 모두 정확히 1장** — 해외 카드 F의 국내 후보가 K 하나뿐이고, K의 해외 후보도 F 하나뿐
 * 카드 순서·게재 번호와 무관하다(필터로 숨긴 카드의 짝 처리는 화면 몫 — M1-33).
 */
import type { NewsCard } from "@/lib/schema/news";

/** 대표 출처 시각 차이 상한(④) — 36시간, 경계 포함 */
export const LINK_WINDOW_MS = 36 * 60 * 60 * 1000;

/** 같은 팀 slug가 이만큼 이상 겹치면 같은 사건 후보(②) — 팀 하나만 같으면 같은 팀의 다른 소식일 수 있다 */
export const LINK_MIN_SHARED_TEAMS = 2;

type PairInput = Pick<NewsCard, "id" | "lang" | "cat" | "teams" | "players"> & {
  src: ReadonlyArray<Pick<NewsCard["src"][number], "at">>;
};

/** 국내 카드인가(원제목 언어 기준 — 국내 매체 카드는 `ko`) */
export function isDomestic(card: Pick<NewsCard, "lang">): boolean {
  return card.lang === "ko";
}

function sharedCount(a: readonly string[], b: readonly string[]): number {
  const set = new Set(a);
  let n = 0;
  for (const value of new Set(b)) if (set.has(value)) n++;
  return n;
}

function leadAtMs(card: PairInput): number {
  const at = card.src[0]?.at;
  return at === undefined ? Number.NaN : Date.parse(at);
}

/** 두 카드가 ②·③·④를 만족하는가(①은 호출하는 쪽이 해외·국내로 나눠 부른다). 시각을 읽을 수 없으면 false */
export function isLinkCandidate(a: PairInput, b: PairInput): boolean {
  if (a.cat !== b.cat) return false;
  const sameEvent =
    sharedCount(a.teams, b.teams) >= LINK_MIN_SHARED_TEAMS ||
    sharedCount(a.players, b.players) >= 1;
  if (!sameEvent) return false;
  const gap = Math.abs(leadAtMs(a) - leadAtMs(b));
  return Number.isFinite(gap) && gap <= LINK_WINDOW_MS;
}

/**
 * 그날 호 카드들의 연결 짝 — 카드 ID → 짝 카드 ID(양방향 모두 들어간다). 짝이 없는 카드는 키가 없다.
 * 같은 ID가 두 번 나오는 입력(스키마가 막는다)은 앞 카드만 본다.
 */
export function linkPairs(
  cards: readonly PairInput[],
): ReadonlyMap<string, string> {
  const foreign = cards.filter((card) => !isDomestic(card));
  const domestic = cards.filter(isDomestic);
  const pairs = new Map<string, string>();
  for (const f of foreign) {
    const candidates = domestic.filter((k) => isLinkCandidate(f, k));
    const [k] = candidates;
    if (candidates.length !== 1 || k === undefined) continue;
    // ⑤ 반대쪽도 유일해야 한다 — 국내 카드 하나에 해외 카드 둘이 걸리면 어느 쪽도 잇지 않는다
    const back = foreign.filter((other) => isLinkCandidate(other, k));
    if (back.length !== 1 || back[0] !== f) continue;
    if (pairs.has(f.id) || pairs.has(k.id)) continue;
    pairs.set(f.id, k.id);
    pairs.set(k.id, f.id);
  }
  return pairs;
}
