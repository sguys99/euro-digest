import { serializeJsonLd, type JsonLdNode } from "@/lib/structured-data";

/**
 * 구조화 데이터 스크립트(NFR-03, plan M5-03) — 서버 컴포넌트. 정적 HTML에 `<script type="application/ld+json">` 하나로 굳는다
 * (클라이언트 JS 없음 — 브라우저는 이 스크립트를 실행하지 않는다). 노드는 src/lib/structured-data.ts 함수로만 만든다.
 * 내용은 `serializeJsonLd`가 `<`·`>`·`&`를 이스케이프한 JSON이라 데이터에 `</script>`가 섞여도 스크립트를 닫지 못한다.
 * `data`가 null이면 아무것도 그리지 않는다(다가오는 경기가 없는 대회 등).
 */
export function JsonLd({ data }: { data: JsonLdNode | null }) {
  if (data === null) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
