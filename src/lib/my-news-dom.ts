/**
 * '내 팀 소식' — DOM 약속과 그리기 (PRD FR-112, DESIGN §9.3 D2 "홈 위젯 (D2)" 내 팀 소식 · "`/my` 틀", plan M4-08)
 *
 * 서버 컴포넌트(src/components/my/my-news.tsx)가 최신 호의 후보 뉴스 행을 **모두 숨긴 채** 싣고(src/lib/data/my-page.ts `loadMyNewsCandidates`),
 * 팔로우와 맞는 행만 앞에서부터 `limit`개 보인다. 팔로우는 브라우저 저장소에만 있어 빌드가 고를 수 없다 — 첫 페인트 전에는 인라인 부트
 * 스크립트(src/lib/my-news-boot.ts — 이 파일과 같은 규칙의 ES5 문자열, 단위 테스트가 결과를 대조)가, 하이드레이션 뒤 팔로우가 바뀌면
 * 섬(src/components/my/my-news-island.tsx)이 이 파일의 `applyMyNews`로 그린다. 자리가 밀리지 않는다(CLS — 섹션이 첫 페인트에 이미 맞는 모양).
 *
 * DOM 약속(`MN`)
 * | 속성 | 요소 | 뜻 |
 * |------|------|----|
 * | `data-mn` + `data-mn-limit` | 섹션 | 보일 행 수. 맞는 행이 0이면 섹션 `hidden`(팔로우가 없거나 오늘 걸린 소식이 없음) |
 * | `data-mn-row` + `data-mn-keys` | 뉴스 행 `<li>` | 걸린 팔로우 대상 `[[키, 이름], …]` JSON(키 = `t:{팀}` · `p:{선수}`) — 맞지 않거나 `limit` 밖이면 `hidden` |
 * | `data-mn-why` | 행 안 글자 | 걸린 팔로우 이름("바이에른 뮌헨 · 김민재") |
 * | `data-mn-count` | 부제 · 더 보기 링크 | 맞는 행 수 |
 *
 * DOM 타입만 쓴다(fs·zod 없음) — 섬 번들에 들어간다.
 */
export const MN = {
  section: "data-mn",
  limit: "data-mn-limit",
  row: "data-mn-row",
  keys: "data-mn-keys",
  why: "data-mn-why",
  count: "data-mn-count",
} as const;

/** 걸린 이름 구분 */
export const MN_WHY_SEPARATOR = " · ";

/** 행의 걸린 대상 쌍(깨졌으면 빈 목록) */
export function rowPairs(row: Element): Array<[string, string]> {
  try {
    const value: unknown = JSON.parse(row.getAttribute(MN.keys) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (p): p is [string, string] =>
            Array.isArray(p) &&
            typeof p[0] === "string" &&
            typeof p[1] === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * 팔로우 키로 섹션마다 행을 고른다. 맞는 행 수(문서 전체 합)를 돌려준다. 같은 키로 다시 불러도 결과가 같다(멱등).
 * 키는 객체(부트 스크립트 결과 모양)나 Set 모두 받는다.
 */
export function applyMyNews(
  doc: Document,
  keys: ReadonlySet<string> | Readonly<Record<string, unknown>>,
): number {
  const has =
    keys instanceof Set
      ? (k: string) => keys.has(k)
      : (k: string) =>
          Object.prototype.hasOwnProperty.call(keys, k) &&
          Boolean((keys as Record<string, unknown>)[k]);
  let total = 0;
  for (const section of doc.querySelectorAll<HTMLElement>(`[${MN.section}]`)) {
    const limit = Number(section.getAttribute(MN.limit)) || 0;
    let count = 0;
    for (const row of section.querySelectorAll<HTMLElement>(`[${MN.row}]`)) {
      const names = rowPairs(row)
        .filter(([key]) => has(key))
        .map(([, name]) => name);
      if (names.length > 0) count++;
      const show = names.length > 0 && count <= limit;
      if (row.hidden !== !show) row.hidden = !show;
      if (show) {
        const why = row.querySelector(`[${MN.why}]`);
        const text = names.join(MN_WHY_SEPARATOR);
        if (why && why.textContent !== text) why.textContent = text;
      }
    }
    for (const el of section.querySelectorAll(`[${MN.count}]`)) {
      if (el.textContent !== String(count)) el.textContent = String(count);
    }
    if (section.hidden !== (count === 0)) section.hidden = count === 0;
    total += count;
  }
  return total;
}
