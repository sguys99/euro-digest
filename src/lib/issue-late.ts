/**
 * 발행 지연 안내 판정 — 클라이언트 쪽 (PRD DR-07 오류 상태 · FR-153 · §15 D26·D48·D49, DESIGN.md §9.3 상태 화면 ③, plan M1-37)
 *
 * 정적 사이트라 아침 발행이 실패하거나 늦으면 전날 빌드가 그대로 남는다(D49 — 검증·빌드 실패 시 전날 사이트 유지). 그 사실은 빌드가
 * 알 수 없고 **보는 순간의 시각**으로만 알 수 있다. 그래서 빌드는 "이 빌드의 최신 호가 늦었다고 볼 시간 구간"을 미리 계산해 숫자로
 * 싣고(src/lib/issue.ts `issueLateWindows` — 계절별 목표 07:00/07:30 + 15분, 그날 KST 자정 전까지), 브라우저는 지금 시각
 * (`Date.now()`)이 그 구간 안인지만 본다. 시간대 계산을 브라우저에서 하지 않으므로 이 모듈은 아무것도 import하지 않는다(섬·인라인
 * 스크립트가 쓰는 작은 모듈 — time.ts를 클라이언트 번들에 끌어오지 않는다).
 *
 * 판정: 구간 [from, to) 중 하나에 들면 늦음. 마지막 구간의 끝(빌드가 내다본 날수 — 기본 14일) 뒤는 모두 늦음(그만큼 오래 갱신되지 않은 사이트).
 * 구간 밖 = 다음 호 목표 + 15분 전(자정~목표 시각 포함) — 안내하지 않는다.
 *
 * 화면(src/components/shell/issue-late-notice.tsx)은 상자를 정적 HTML로 두고 CSS로 숨긴다. 첫 페인트 전에 상자 바로 뒤 인라인
 * 스크립트(`issueLateScript`)가 `<html data-issue-late>`를 달면 CSS가 보인다 — 상자가 칠해지기 전에 정해지므로 레이아웃 이동이 없다
 * (M1-33 필터 보류 스크립트와 같은 방식). 클라이언트 이동(next/link)으로 들어온 페이지는 인라인 스크립트가 실행되지 않아 셸 섬
 * (src/components/shell/status-island.tsx)이 마운트할 때 같은 함수로 다시 판정한다.
 */

/** 늦음 구간 [from, to) — UTC epoch ms */
export type LateWindow = readonly [from: number, to: number];

/** `<html>`에 다는 속성 — CSS 변형 `issue-late:`(globals.css)가 상자를 보인다 */
export const ISSUE_LATE_ATTR = "data-issue-late";

/**
 * 지금(`now`, epoch ms)이 늦음 구간인가. 구간은 시간순(빌드가 만든 그대로)이라고 본다.
 * 마지막 구간 끝 이후는 늦음, 구간이 없으면 늦지 않음.
 */
export function isIssueLate(
  now: number,
  windows: readonly LateWindow[],
): boolean {
  const last = windows[windows.length - 1];
  if (!last) return false;
  if (now >= last[1]) return true;
  return windows.some(([from, to]) => now >= from && now < to);
}

/**
 * 첫 페인트 전 판정 인라인 스크립트 — `isIssueLate`와 같은 결과로 `<html data-issue-late>`를 달거나 지운다.
 * 구간은 빌드 값(숫자 배열)뿐이라 외부 입력이 섞이지 않는다. ES5 문법(지원 브라우저 전부). 실패해도 조용히 넘어간다(안내 없음).
 * `<` 문자를 쓰지 않는다(`>`로 비교) — HTML에 그대로 들어가는 스크립트라 태그 모양 글자를 피한다(DOM 테스트도 원문 그대로 대조).
 */
export function issueLateScript(windows: readonly LateWindow[]): string {
  const data = JSON.stringify(windows.map(([from, to]) => [from, to]));
  return (
    "(function(){try{" +
    `var w=${data},n=Date.now(),l=w.length>0&&n>=w[w.length-1][1],i;` +
    "for(i=0;!l&&w.length>i;i++)l=n>=w[i][0]&&w[i][1]>n;" +
    `var r=document.documentElement;if(l)r.setAttribute('${ISSUE_LATE_ATTR}','');else r.removeAttribute('${ISSUE_LATE_ATTR}')` +
    "}catch(e){}})();"
  );
}
