import type { PageSearchRecord } from "@/lib/search/records";
import { SEARCH_TYPE_FILTER } from "@/lib/search/model";

/**
 * 검색 레코드(숨은 HTML) — 선수·팀·대회 페이지 하나를 검색 결과 한 줄로 색인한다 (PRD FR-130·FR-131, plan M4-14). 서버 컴포넌트(JS 0).
 *
 * Pagefind는 `data-pagefind-body`가 있는 페이지만, 그 요소 안 글자만 색인한다 → 화면 본문(일정의 상대 팀 이름, 순위표 등)이 아니라 이 레코드의
 * 별칭 글자만 들어간다('아스널'로 찾았는데 아스널과 경기한 팀이 모두 나오지 않게). 홈·뉴스·소개 등 이 레코드가 없는 페이지는 색인되지 않는다.
 * - 유형 = `data-pagefind-filter="type:…"`(속성 꼴 — 글자로 색인되지 않음)
 * - 메타 = 요소마다 `data-pagefind-meta="키"` + 글자(값에 쉼표가 있어도 된다). 메타 값도 Pagefind가 찾는 글자라 본문에서는 뺀다(`data-pagefind-ignore`)
 * - 별칭 = 본문 글자(한 문단 — 공백으로 잇는다)
 * `hidden` — 화면·보조기술·인쇄에 나오지 않는다(Pagefind는 HTML을 읽으므로 숨김과 무관하게 색인한다 — 실측).
 */
export function SearchRecord({ record }: { record: PageSearchRecord }) {
  return (
    <div
      hidden
      data-slot="search-record"
      data-pagefind-body=""
      data-pagefind-filter={`${SEARCH_TYPE_FILTER}:${record.type}`}
    >
      {record.meta.map(([key, value]) => (
        <span key={key} data-pagefind-meta={key} data-pagefind-ignore="">
          {value}
        </span>
      ))}
      <p>{record.aliases.join(" ")}</p>
    </div>
  );
}
