/**
 * 출처 매체명 — 소스 이름에서 섹션·괄호 설명을 뗀 이름 (순수 함수, 런타임 의존성 없음)
 *
 * 파이프라인(카드 `src[].n`, 클러스터 보도 매체 수, 이적 단계의 '여러 매체 확인' — scripts/lib/publisher-name.ts가 다시 내보낸다)과
 * 화면(`/about` 출처 목록 — 카드에 보이는 매체명과 같은 이름으로 묶는다, M1-36)이 같은 규칙을 쓰도록 src/lib에 둔다.
 */
import type { Source } from "@/lib/schema/source";

/**
 * 카드에 표시할 출처명 — 소스 이름에서 섹션(" — Football")·괄호 설명(" (Fabrizio Romano)")을 뗀 매체명.
 * 예) "BBC Sport — Football" → "BBC Sport", "인터풋볼 — 해외축구" → "인터풋볼" (M0-34 카드 샘플과 같은 표기).
 */
export function publisherNameOf(source: Pick<Source, "name">): string {
  const base = source.name.split(" — ")[0] ?? source.name;
  return base.replace(/\s*\([^)]*\)\s*$/, "").trim() || source.name;
}
