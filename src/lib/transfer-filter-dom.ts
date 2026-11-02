/**
 * 이적 필터 · 타임라인 도착 — DOM 약속과 그리기 (PRD FR-104 · FR-101, DESIGN §9.3 D2 "이적 필터" · "이적 타임라인", plan M4-04)
 *
 * `/transfers/`는 서버가 그린 정적 HTML이다(행 · 버튼 · 건수). 필터 상태(주소 쿼리)와 타임라인 도착(주소 해시 `#xt-{카드 ID}`)은 그 DOM의
 * 속성 · 글자만 바꿔 그린다. 같은 함수 두 개를 두 곳에서 부른다:
 *  - 첫 페인트 전 — 목록 바로 뒤 인라인 스크립트(`TRANSFER_BOOT_SCRIPT` — 이 파일의 함수 원문을 `Function.prototype.toString`으로 싣는다).
 *    쿼리로 들어온 첫 화면에서 전체 행이 보였다 사라지지 않고(CLS), 해시로 들어오면 접힌 타임라인을 펼쳐 둔다(브라우저의 앵커 스크롤이 찾게).
 *  - 하이드레이션 뒤 — 필터 섬(src/components/transfers/filter-island.tsx)이 누름 · 주소 이동마다.
 * 그래서 두 함수는 **바깥 이름을 하나도 쓰지 않는다**(import · 모듈 상수 없음 — 원문만 떼어 실행된다). 속성 이름은 아래 `XF`와 같은 글자를
 * 함수 안에 직접 쓰고, tests/transfer-filter-dom.test.tsx가 실제 서버 렌더 DOM에서 순수 규칙(src/lib/transfer-filter.ts)과 결과를 대조한다.
 *
 * DOM 약속
 * | 속성 | 요소 | 뜻 |
 * |------|------|----|
 * | `data-xf-axis` + `data-xf-value` | 필터 버튼(목차 행 · 칩) | 축 · 값 → `aria-pressed` |
 * | `data-xf-zero` | 0건 버튼 | 눌리지 않았으면 `disabled`(눌린 채 들어오면 끌 수 있게 활성) |
 * | `data-xf-row` + `data-xf-{league,team,status,tier,kr}` | 원장 행 `<article>` | 축별 값(공백 구분) → 맞지 않으면 `hidden` |
 * | `data-xf-shown` | 결과 수 | 보이는 행 수 |
 * | `data-xf-picked` | 375 접힘 칩 숫자 | 리그 · 팀 · 단계 · Tier에서 고른 값 수 |
 * | `data-xf-empty` | 0건 빈 상태 | 결과가 0건일 때만 보인다 |
 * | `data-xf-reset` | 필터 해제 | 섬이 듣는다. 값 `sum`(결과 수 줄)은 필터가 있을 때만 보인다 |
 * | `data-xt-panel` | 타임라인 묶음(`hidden`) | 해시 도착 · 펼침 버튼이 연다 |
 * | `data-xt-toggle` | 타임라인 펼침 버튼(`aria-controls` = 묶음 id) | `aria-expanded` |
 * | `data-xt-arrive` | 도착한 항목 | 홈 핫 리스트 → `:target`과 같은 강조(앱 라우터 이동은 `:target`을 바꾸지 않아 속성을 함께 단다) |
 */

/** DOM 약속 이름(서버 컴포넌트 · 섬 · 테스트) — 아래 두 함수 안의 글자와 같아야 한다 */
export const XF = {
  axis: "data-xf-axis",
  value: "data-xf-value",
  zero: "data-xf-zero",
  row: "data-xf-row",
  shown: "data-xf-shown",
  picked: "data-xf-picked",
  empty: "data-xf-empty",
  reset: "data-xf-reset",
  live: "data-xf-live",
  enter: "data-xf-in",
  panelToggle: "data-xf-panel-toggle",
  tlPanel: "data-xt-panel",
  tlToggle: "data-xt-toggle",
  arrive: "data-xt-arrive",
} as const;

/** 행의 축 값 속성 이름 */
export const xfRowAttr = (axis: string): string => `data-xf-${axis}`;

/**
 * 주소 쿼리(`location.search`)대로 필터를 그린다 — 보이는 행 수를 돌려준다. 축 안 OR · 축 사이 AND(src/lib/transfer-filter.ts와 같은 규칙),
 * 쿼리 값은 페이지의 버튼 값에 있는 것만 받는다. **바깥 이름을 쓰지 않는다**(머리 주석 — 원문이 인라인 스크립트로 실린다).
 */
export function drawTransferFilter(d: Document, search: string): number {
  const axes = ["league", "team", "status", "tier", "kr"];
  const buttons = d.querySelectorAll("[data-xf-axis]");
  const known: Record<string, Record<string, boolean>> = {};
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i]!;
    const a = b.getAttribute("data-xf-axis") || "";
    const v = b.getAttribute("data-xf-value") || "";
    (known[a] = known[a] || {})[v] = true;
  }
  const q = new URLSearchParams(search);
  const picked: Record<string, string[]> = {};
  let active = false;
  let panelPicked = 0;
  for (let i = 0; i < axes.length; i++) {
    const a = axes[i]!;
    const raw = (q.get(a) || "").toLowerCase().split(",");
    const list: string[] = [];
    for (let j = 0; j < raw.length; j++) {
      const v = raw[j]!.trim();
      if (v && known[a] && known[a][v] && list.indexOf(v) < 0) list.push(v);
    }
    picked[a] = list;
    if (list.length) active = true;
    if (a !== "kr") panelPicked += list.length;
  }
  const rows = d.querySelectorAll<HTMLElement>("[data-xf-row]");
  let shown = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let ok = true;
    for (let j = 0; j < axes.length && ok; j++) {
      const a = axes[j]!;
      const want = picked[a]!;
      if (!want.length) continue;
      const have = (row.getAttribute("data-xf-" + a) || "").split(" ");
      let hit = false;
      for (let k = 0; k < have.length; k++) {
        if (have[k] && want.indexOf(have[k]!) >= 0) hit = true;
      }
      ok = hit;
    }
    row.hidden = !ok;
    if (ok) shown++;
  }
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i] as HTMLButtonElement;
    const list = picked[b.getAttribute("data-xf-axis") || ""] || [];
    const on = list.indexOf(b.getAttribute("data-xf-value") || "") >= 0;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    if (b.hasAttribute("data-xf-zero")) b.disabled = !on;
  }
  const texts = (sel: string, text: string) => {
    const els = d.querySelectorAll(sel);
    for (let i = 0; i < els.length; i++) els[i]!.textContent = text;
  };
  texts("[data-xf-shown]", String(shown));
  texts("[data-xf-picked]", String(panelPicked));
  const empty = d.querySelectorAll<HTMLElement>("[data-xf-empty]");
  for (let i = 0; i < empty.length; i++) empty[i]!.hidden = shown !== 0;
  const resets = d.querySelectorAll<HTMLElement>('[data-xf-reset="sum"]');
  for (let i = 0; i < resets.length; i++) resets[i]!.hidden = !active;
  return shown;
}

/**
 * 주소 해시(`#xt-{카드 ID}`)의 타임라인 항목에 도착 — 접힌 타임라인이면 펼치고(버튼 `aria-expanded`) 항목에 `data-xt-arrive`를 단다. 찾은
 * 요소를 돌려준다(없으면 null). 다른 항목의 도착 표시는 지운다. **바깥 이름을 쓰지 않는다**(`drawTransferFilter`와 같은 이유).
 */
export function openTransferTarget(
  d: Document,
  hash: string,
): HTMLElement | null {
  const old = d.querySelectorAll("[data-xt-arrive]");
  for (let i = 0; i < old.length; i++)
    old[i]!.removeAttribute("data-xt-arrive");
  if (!hash || hash.charAt(0) !== "#" || hash.slice(1, 4) !== "xt-")
    return null;
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  const target = d.getElementById(id);
  if (!target) return null;
  const panel = target.closest<HTMLElement>("[data-xt-panel]");
  if (panel && panel.hidden) {
    panel.hidden = false;
    const toggle = d.querySelector(
      '[data-xt-toggle][aria-controls="' + panel.id + '"]',
    );
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }
  // 필터가 그 행을 숨겼으면 행을 보인다(도착이 먼저 — 링크가 가리킨 기사는 보여야 한다)
  const row = target.closest<HTMLElement>("[data-xf-row]");
  if (row && row.hidden) row.hidden = false;
  target.setAttribute("data-xt-arrive", "");
  return target;
}

/**
 * 첫 페인트 전 인라인 스크립트(목록 · 빈 상태 · 결과 수 줄 뒤에 둔다). 실패해도 정적 HTML(필터 없음 · 접힌 타임라인)로 물러난다.
 * 원문은 빌드 때 서버 번들의 함수 원문이다 — 바깥 이름을 쓰지 않으므로 떼어 실행해도 같다.
 */
export const TRANSFER_BOOT_SCRIPT =
  "(function(){try{(" +
  drawTransferFilter.toString() +
  ")(document,location.search);(" +
  openTransferTarget.toString() +
  ")(document,location.hash)}catch(e){}})();";
