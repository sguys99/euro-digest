/**
 * 출처 매체명 — 소스 이름에서 섹션·괄호 설명을 뗀 이름(카드 `src[].n`, 클러스터 보도 매체 수, 이적 단계의 '여러 매체 확인' — 순수 함수).
 * news-file.ts가 다시 내보낸다(기존 import 유지). 분류 단계(classify.ts → transfer-extract.ts)가 news-file.ts를 거치지 않고 쓰려고 따로 둔다
 * (news-file.ts는 classify.ts를 import한다 — 순환 import 방지).
 */
import type { Source } from "@/lib/schema";

/**
 * 카드에 표시할 출처명 — 소스 이름에서 섹션(" — Football")·괄호 설명(" (Fabrizio Romano)")을 뗀 매체명.
 * 예) "BBC Sport — Football" → "BBC Sport", "인터풋볼 — 해외축구" → "인터풋볼" (M0-34 카드 샘플과 같은 표기).
 */
export function publisherNameOf(source: Pick<Source, "name">): string {
  const base = source.name.split(" — ")[0] ?? source.name;
  return base.replace(/\s*\([^)]*\)\s*$/, "").trim() || source.name;
}
