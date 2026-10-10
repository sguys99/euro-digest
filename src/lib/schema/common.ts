/**
 * 공용 스키마 조각 — plan.md 부록 A "공통" + 여러 파일이 함께 쓰는 형식 검사.
 *
 * 규칙 (CLAUDE.md §8·§9.1)
 * - 저장 시각은 모두 UTC ISO 8601(`Z` 접미사)이다. 오프셋(`+09:00`)이 붙은 값은 거부한다.
 *   KST 변환은 화면에서 src/lib/time.ts(M0-18)만 한다.
 * - 외부 입력(RSS·API·LLM·configs)은 경계에서 이 스키마들로 파싱한다.
 * - 화면(src/app)에서 import해도 되지만 **서버 컴포넌트·빌드 시점에서만** 쓴다.
 *   `"use client"` 파일에서 import하면 zod가 브라우저 번들에 들어간다(초기 JS 예산 DR-11).
 */
import { z } from "zod";

// ─── 부록 A 확정 ────────────────────────────────────────────────────────────

/**
 * UTC ISO 8601 시각. 부록 A의 `z.string().datetime()`을 zod v4 권장 API로 옮긴 것(동작 동일).
 * - 기본 옵션(offset: false, local: false): 끝이 `Z`여야 하고 초는 필수, 소수 초 자릿수는 자유.
 *   예) `2026-10-10T21:30:00Z` · `2026-10-10T21:30:00.123Z`(Date#toISOString 형식) 통과
 *   `2026-10-11T06:30:00+09:00`(오프셋) · `2026-10-10T21:30Z`(초 없음) · `2026-10-10` 거부
 * - 달력에 없는 날짜(2026-02-30)도 거부한다.
 */
export const IsoSchema = z.iso.datetime();
export type Iso = z.infer<typeof IsoSchema>;

/** 대회 ID (FR-40). URL 경로는 소문자(`/competitions/epl`) — 변환은 paths 헬퍼에서. */
export const CompIdSchema = z.enum([
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
]);
export type CompId = z.infer<typeof CompIdSchema>;

/** 뉴스 카테고리 (FR-31): 경기 결과 / 이적 / 부상 / 감독·구단 / 대표팀 / UCL / 기타 */
export const CategorySchema = z.enum([
  "result",
  "transfer",
  "injury",
  "club",
  "national",
  "ucl",
  "other",
]);
export type Category = z.infer<typeof CategorySchema>;

/** 이적 상태 (FR-21·FR-102): rumor → negotiating → agreed → official, collapsed(결렬) */
export const TransferStatusSchema = z.enum([
  "rumor",
  "negotiating",
  "agreed",
  "official",
  "collapsed",
]);
export type TransferStatus = z.infer<typeof TransferStatusSchema>;

/** 출처 신뢰도 Tier 1~3 (basic_plan §3.8). 1이 가장 높다. */
export const TierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Tier = z.infer<typeof TierSchema>;

// ─── 부록 A에서 뽑아낸 공용 조각 ────────────────────────────────────────────

/** 뉴스 카드 ID: `c_` + 16진수 10자리 — 대표 URL 결정적 해시 (PRD §15 D15). NewsCard.id와 같은 정규식. */
export const CardIdSchema = z.string().regex(/^c_[0-9a-f]{10}$/, {
  error: "카드 ID는 c_ + 16진수 소문자 10자리",
});
export type CardId = z.infer<typeof CardIdSchema>;

/** 선수 포지션 (KoreanPlayer.position과 동일). */
export const PositionSchema = z.enum(["GK", "DF", "MF", "FW"]);
export type Position = z.infer<typeof PositionSchema>;

// ─── v0.1 — 2026-10-10 사용자 확인 (부록 A 공용 형식 추가분) ─────────────────

/**
 * 외부 링크 URL — http/https + 도메인 호스트만 (2026-10-10 결정 Q3).
 * `z.url()`은 `javascript:`·`mailto:`도 통과시키므로 링크로 렌더링되는 필드는 모두 이것을 쓴다.
 * `http:example.com`(// 없음)·`localhost`·IP 주소 호스트도 거부한다. 값은 앞뒤 공백만 잘린 채 그대로 남는다.
 */
export const HttpUrlSchema = z.httpUrl();
export type HttpUrl = z.infer<typeof HttpUrlSchema>;

/** 날짜만(YYYY-MM-DD). 시각이 아닌 "달력 날짜 라벨"에만 쓴다(뉴스 파일 발행일·시즌 기간 등). */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/**
 * URL·파일명에 쓰는 slug: 소문자 영숫자 + 하이픈(kebab-case). 예) `son-heung-min`, `liverpool`.
 * 한 번 정하면 바꾸지 않는다(공유 URL·과거 카드 태그가 참조).
 * 적용 범위(2026-10-10 결정 Q7): 사람이 편집하는 configs와 팀·선수 데이터. 뉴스 카드 태그에는 쓰지 않는다
 * (태그 하나의 형식 오류로 그날 발행 전체가 막히지 않게).
 */
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "slug는 소문자 kebab-case" });
export type Slug = z.infer<typeof SlugSchema>;

/** 6자리 hex 색 `#RRGGBB`(대소문자 무관). 3자리 축약·알파 채널은 받지 않는다. */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "색은 #RRGGBB 6자리 hex" });
export type HexColor = z.infer<typeof HexColorSchema>;

/** 시즌 = 시작 연도(2026 → 2026-27). football-data.org·API-Football의 `season` 파라미터와 같은 값. */
export const SeasonSchema = z.number().int().min(2000).max(2100);
export type Season = z.infer<typeof SeasonSchema>;

// ─── 파일 단위 검사 헬퍼 ────────────────────────────────────────────────────

/**
 * 배열 안에서 키가 겹치는 항목을 찾아 이슈로 남긴다(파일 래퍼용 superRefine 콜백).
 * 항목 스키마는 건드리지 않고 "파일" 수준에서만 중복 ID를 막는다.
 * zod 기본 동작상 항목 자체에 오류가 있으면 이 검사는 건너뛴다(항목 오류를 먼저 고치게 된다).
 *
 * @param keyOf  항목 → 비교 키
 * @param field  이슈 경로에 붙일 필드명(예: "id") — 경로는 [index, field]
 * @param label  메시지에 쓸 이름(예: "카드 ID")
 */
export function uniqueBy<T>(
  keyOf: (item: T) => string,
  field: string,
  label: string,
): (items: readonly T[], ctx: z.RefinementCtx) => void {
  return (items, ctx) => {
    const firstIndex = new Map<string, number>();
    items.forEach((item, index) => {
      const key = keyOf(item);
      const first = firstIndex.get(key);
      if (first === undefined) {
        firstIndex.set(key, index);
        return;
      }
      ctx.addIssue({
        code: "custom",
        path: [index, field],
        message: `${label} 중복: "${key}" (${first}번 항목과 같음)`,
      });
    });
  };
}

/** ISO 시각 문자열 두 개의 선후 비교(IsoSchema를 통과한 값끼리). a ≤ b이면 true. */
export function isNotAfter(a: string, b: string): boolean {
  return Date.parse(a) <= Date.parse(b);
}

/** ISO 시각 문자열 두 개의 선후 비교(IsoSchema를 통과한 값끼리). a < b이면 true. */
export function isBefore(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b);
}
