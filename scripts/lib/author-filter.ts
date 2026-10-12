/**
 * 기자 채널 작성자 필터 (M1-04, PRD FR-01·FR-03, plan 부록 A `Source.author`) — 순수 함수만 둔다.
 *
 * `Source.author`가 있는 소스는 **정규화 직후** 작성자가 그 이름과 일치하는 항목만 남긴다(한 매체의 피드에서 특정 기자 글만
 * 받는 용도 — 예: 비활성 `caughtoffside-romano`). `author`가 없는 소스는 모두 통과한다. 지금 수집 대상 중 `author`가 있는
 * 소스는 없다(M0-23·M0-24 — the Daily Briefing·Di Marzio는 피드 전체를 원제목+링크로 쓴다).
 *
 * 비교 규칙(`authorKey`): 유니코드 정규화(NFC) · 연속 공백(NBSP 등 유니코드 공백 포함)을 한 칸으로 · 앞뒤 공백 제거 ·
 * 대소문자 무시. 그 밖의 글자(악센트·직함·"기자" 같은 접미사)는 그대로 비교한다 — 비슷한 이름을 추측해 맞추지 않는다.
 * 작성자 문자열 하나에 여러 이름이 들어 있으면(`byline` — "A and B"·"A, B"·"A & B"·"A; B"·"A / B") 조각도 비교하고,
 * RSS 2.0 `author`의 `email (이름)` 형식이면 괄호 안 이름도 비교한다. 문자열 전체도 항상 비교한다.
 * 작성자 필드가 비어 있는 항목은 **제외**한다(필터의 목적이 그 기자 글만 받는 것이므로). `author`가 빈 문자열(공백만)이면
 * 어떤 항목과도 일치하지 않아 전부 제외된다 — `npm run validate`가 경고한다(scripts/lib/sources.ts).
 *
 * 작성자는 카드(부록 A NewsCard)에 저장하지 않는다 — 필터·로그에만 쓴다.
 */

/** 작성자 필터로 제외한 항목의 건너뛴 이유(SourceOutcome.skipped 키) */
export const AUTHOR_SKIP_REASON = "author";
export type AuthorSkipReason = typeof AUTHOR_SKIP_REASON;

/** 비교 키 — NFC → 연속 공백 한 칸 → 앞뒤 공백 제거 → 소문자(→ 다시 NFC: 소문자 변환이 결합 문자를 만들 수 있다). */
export function authorKey(name: string): string {
  return name
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase()
    .normalize("NFC");
}

/** 한 문자열 안의 이름 구분자 — 쉼표·세미콜론·앰퍼샌드·슬래시·세로줄, 단어 `and`(대소문자 무시) */
const BYLINE_SEPARATOR = /\s*(?:[,;&/|]|\band\b)\s*/iu;

/** RSS 2.0 `author` 권장 형식 `email (이름)` */
const EMAIL_WITH_NAME = /^[^\s@()]+@[^\s@()]+\s*\((.+)\)$/u;

/**
 * 작성자 문자열 1개 → 비교 후보 키(중복 없음, 빈 키 제외).
 * 전체 문자열 · `email (이름)`의 이름 · 그 둘을 구분자로 나눈 조각.
 */
export function authorCandidateKeys(author: string): string[] {
  const whole = author.trim();
  const named = EMAIL_WITH_NAME.exec(whole)?.[1];
  const bases = named === undefined ? [whole] : [whole, named];
  const keys = new Set<string>();
  for (const base of bases) {
    keys.add(authorKey(base));
    for (const piece of base.split(BYLINE_SEPARATOR))
      keys.add(authorKey(piece));
  }
  keys.delete("");
  return [...keys];
}

/** 항목 작성자 목록 중 하나라도 `wanted`와 일치하는가. `wanted`가 빈 키면 항상 false, 작성자가 없으면 false. */
export function matchesAuthor(
  authors: readonly string[],
  wanted: string,
): boolean {
  const target = authorKey(wanted);
  if (target === "") return false;
  return authors.some((author) => authorCandidateKeys(author).includes(target));
}

export interface AuthorFilterResult<T> {
  /** 남긴 항목(입력 순서) */
  kept: T[];
  /** 작성자가 일치하지 않거나 비어 있어 뺀 항목 수 */
  excluded: number;
}

/**
 * 작성자 필터 — `wanted`(소스의 `author`)가 undefined면 모두 통과, 있으면 일치하는 항목만 남긴다(순서 유지).
 * 작성자 목록이 빈 항목은 제외한다.
 */
export function filterByAuthor<T extends { authors: readonly string[] }>(
  items: readonly T[],
  wanted: string | undefined,
): AuthorFilterResult<T> {
  if (wanted === undefined) return { kept: [...items], excluded: 0 };
  const kept = items.filter((item) => matchesAuthor(item.authors, wanted));
  return { kept, excluded: items.length - kept.length };
}
