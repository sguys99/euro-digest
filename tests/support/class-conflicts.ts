/**
 * Tailwind 클래스 겹침 검사 — `cx`(병합 없음, src/lib/cx.ts)로 이어 붙인 클래스 목록에서 같은 조건(변형)으로 같은 CSS 속성을
 * 두 번 정하는 유틸리티를 찾는다 (D0-12 리뷰, DESIGN.md §9.4 "클래스 합치기").
 *
 * tailwind-merge(`cn`)와 달리 `cx`는 뒤의 클래스가 앞을 덮지 않는다 — `px-4.5 px-2`는 둘 다 남고 어느 쪽이 이길지는 CSS 안
 * 순서가 정한다. 그래서 cx 기반 컴포넌트는 한 요소의 클래스에 이런 겹침이 없어야 한다.
 *
 * - 변형(`hover:`·`aria-pressed:`·`lg:` …)이 다르면 겹침이 아니다(조건이 달라 의도한 덮어쓰기).
 * - 분류표에 없는 유틸리티는 `unknown`으로 돌려준다 — 검사가 조용히 빠지지 않게 테스트가 실패시키고 분류표를 넓힌다.
 * - 글자 크기(`text-sm`)와 행간(`leading-none`)은 Tailwind v4가 함께 쓰도록 만든 것이라 다른 속성으로 본다.
 * 파일 이름이 *.test.ts가 아니므로 Vitest가 테스트로 실행하지 않는다.
 */

type Rule = readonly [
  RegExp,
  readonly string[] | ((m: RegExpExecArray) => readonly string[]),
];

const SIDE_NAMES: Readonly<Record<string, readonly string[]>> = {
  "": ["top", "right", "bottom", "left"],
  t: ["top"],
  r: ["right"],
  b: ["bottom"],
  l: ["left"],
  x: ["left", "right"],
  y: ["top", "bottom"],
  s: ["left"], // 가로쓰기(ltr) 기준 — 겹침 판단용
  e: ["right"],
};

function sides(property: string, side: string | undefined): readonly string[] {
  return (SIDE_NAMES[side ?? ""] ?? []).map((s) => `${property}-${s}`);
}

/** 길이 값(정수·소수·분수·px·임의 길이) — `border-2`·`border-[1.5px]` 같은 두께 구분용 */
const LENGTH = String.raw`(?:\d+(?:\.\d+)?|px|\[[\d.]+(?:px|rem|em)\])`;

/** 위에서부터 처음 맞는 규칙 하나를 쓴다 */
const RULES: readonly Rule[] = [
  // 표시 없는 표지(그룹·피어 이름)
  [/^(?:group|peer)(?:\/[\w-]+)?$/, []],
  [/^(?:sr-only|not-sr-only)$/, ["sr-only"]],
  [
    /^(?:block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|contents|table|flow-root|list-item)$/,
    ["display"],
  ],
  [/^(?:static|relative|absolute|fixed|sticky)$/, ["position"]],
  [/^(?:visible|invisible|collapse)$/, ["visibility"]],
  [/^isolate$|^isolation-/, ["isolation"]],
  // 안쪽 링(inset-ring) — 위치(inset-*)보다 먼저
  [new RegExp(`^inset-ring(?:-${LENGTH})?$`), ["inset-ring-width"]],
  [/^inset-ring-/, ["inset-ring-color"]],
  [/^inset-shadow-/, ["inset-shadow"]],
  [/^inset-x-/, ["left", "right"]],
  [/^inset-y-/, ["top", "bottom"]],
  [/^inset-/, ["top", "right", "bottom", "left"]],
  [/^(top|right|bottom|left)-/, (m) => [m[1] ?? ""]],
  [/^z-/, ["z-index"]],
  [/^order-/, ["order"]],
  // 여백
  [/^p([trblxyse]?)-/, (m) => sides("padding", m[1])],
  [/^m([trblxyse]?)-/, (m) => sides("margin", m[1])],
  [/^space-([xy])-/, (m) => [`space-${m[1]}`]],
  // 크기
  [/^size-/, ["width", "height"]],
  [/^(min-w|max-w|w|min-h|max-h|h)-/, (m) => [m[1] ?? ""]],
  [/^aspect-/, ["aspect-ratio"]],
  // 테두리: 모양 → 두께 → 색 순서로 가른다
  [/^border-(?:solid|dashed|dotted|double|hidden|none)$/, ["border-style"]],
  [
    new RegExp(`^border(?:-([trblxyse]))?(?:-${LENGTH})?$`),
    (m) => sides("border-width", m[1]),
  ],
  [/^border(?:-([trblxyse]))?-.+$/, (m) => sides("border-color", m[1])],
  // 면
  [/^bg-/, ["background-color"]],
  // 글자
  [/^text-(?:left|right|center|justify|start|end)$/, ["text-align"]],
  [/^text-(?:wrap|nowrap|balance|pretty)$/, ["text-wrap"]],
  [/^text-(?:ellipsis|clip)$/, ["text-overflow"]],
  [
    /^text-(?:xs|sm|base|lg|[2-9]?xl|type-[\w-]+|num-[\w-]+|\[[\d.]+(?:px|rem|em)\])$/,
    ["font-size"],
  ],
  [/^text-/, ["color"]],
  [
    /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/,
    ["font-weight"],
  ],
  [/^font-/, ["font-family"]],
  [/^leading-/, ["line-height"]],
  [/^tracking-/, ["letter-spacing"]],
  [/^(?:normal-nums|proportional-nums|tabular-nums)$/, ["numeric-spacing"]],
  [/^(?:lining-nums|oldstyle-nums)$/, ["numeric-figure"]],
  [
    /^(?:ordinal|slashed-zero|diagonal-fractions|stacked-fractions)$/,
    (m) => [m[0]],
  ],
  [/^(?:uppercase|lowercase|capitalize|normal-case)$/, ["text-transform"]],
  [/^(?:italic|not-italic)$/, ["font-style"]],
  [
    /^(?:underline|overline|line-through|no-underline)$/,
    ["text-decoration-line"],
  ],
  [/^underline-offset-/, ["text-underline-offset"]],
  [
    new RegExp(`^decoration-(?:${LENGTH}|auto|from-font)$`),
    ["text-decoration-thickness"],
  ],
  [
    /^decoration-(?:solid|double|dotted|dashed|wavy)$/,
    ["text-decoration-style"],
  ],
  [/^decoration-/, ["text-decoration-color"]],
  [/^whitespace-/, ["white-space"]],
  [/^break-(?:normal|words|all|keep)$/, ["word-break"]],
  [/^truncate$/, ["overflow-x", "overflow-y", "text-overflow", "white-space"]],
  [/^line-clamp-/, ["line-clamp"]],
  // 플렉스·그리드 정렬
  [/^justify-items-/, ["justify-items"]],
  [/^justify-self-/, ["justify-self"]],
  [/^justify-/, ["justify-content"]],
  [/^items-/, ["align-items"]],
  [/^self-/, ["align-self"]],
  [/^place-items-/, ["align-items", "justify-items"]],
  [/^place-content-/, ["align-content", "justify-content"]],
  [/^place-self-/, ["align-self", "justify-self"]],
  [
    /^content-(?:start|end|center|between|around|evenly|stretch|baseline|normal)$/,
    ["align-content"],
  ],
  [/^content-/, ["content"]],
  [/^flex-(?:row|row-reverse|col|col-reverse)$/, ["flex-direction"]],
  [/^flex-(?:wrap|wrap-reverse|nowrap)$/, ["flex-wrap"]],
  [/^flex-/, ["flex-grow", "flex-shrink", "flex-basis"]],
  [/^grow(?:-|$)/, ["flex-grow"]],
  [/^shrink(?:-|$)/, ["flex-shrink"]],
  [/^basis-/, ["flex-basis"]],
  [/^grid-cols-/, ["grid-template-columns"]],
  [/^grid-rows-/, ["grid-template-rows"]],
  [/^grid-flow-/, ["grid-auto-flow"]],
  [/^col-/, ["grid-column"]],
  [/^row-/, ["grid-row"]],
  [/^gap-x-/, ["column-gap"]],
  [/^gap-y-/, ["row-gap"]],
  [/^gap-/, ["column-gap", "row-gap"]],
  [/^overflow-x-/, ["overflow-x"]],
  [/^overflow-y-/, ["overflow-y"]],
  [/^overflow-/, ["overflow-x", "overflow-y"]],
  [/^snap-(?:start|end|center|align-none)$/, ["scroll-snap-align"]],
  [/^snap-/, ["scroll-snap-type"]],
  // 모션
  [/^transition(?:-|$)/, ["transition-property"]],
  [/^duration-/, ["transition-duration"]],
  [/^ease-/, ["transition-timing-function"]],
  [/^delay-/, ["transition-delay"]],
  [/^animate-/, ["animation"]],
  // 그림자·링·윤곽선
  [/^shadow-/, ["box-shadow"]],
  [new RegExp(`^ring(?:-${LENGTH})?$`), ["ring-width"]],
  [/^ring-offset-/, ["ring-offset"]],
  [/^ring-/, ["ring-color"]],
  [/^outline-offset-/, ["outline-offset"]],
  [/^outline$/, ["outline-style", "outline-width"]],
  [/^outline-(?:solid|dashed|dotted|double|none|hidden)$/, ["outline-style"]],
  [new RegExp(`^outline-${LENGTH}$`), ["outline-width"]],
  [/^outline-/, ["outline-color"]],
  // 변형(transform)
  [/^translate-x-/, ["translate-x"]],
  [/^translate-y-/, ["translate-y"]],
  [/^translate-/, ["translate-x", "translate-y"]],
  [/^rotate-/, ["rotate"]],
  [/^scale-x-/, ["scale-x"]],
  [/^scale-y-/, ["scale-y"]],
  [/^scale-/, ["scale-x", "scale-y"]],
  // 상호작용
  [/^select-/, ["user-select"]],
  [/^cursor-/, ["cursor"]],
  [/^pointer-events-/, ["pointer-events"]],
  [/^touch-/, ["touch-action"]],
  [/^appearance-/, ["appearance"]],
  [/^opacity-/, ["opacity"]],
  [/^object-/, ["object"]],
  [/^list-/, ["list-style"]],
  [/^fill-/, ["fill"]],
  [/^stroke-/, ["stroke"]],
];

/**
 * 클래스 하나를 변형 접두사와 유틸리티로 나눈다. 대괄호·괄호 안의 `:`(임의 속성 `[--ring:var(--ink)]`)는 나누지 않는다.
 * 예: `aria-selected:[--ring:var(--ink)]` → `["aria-selected"]` + `[--ring:var(--ink)]`
 */
export function splitVariants(className: string): {
  variants: string[];
  utility: string;
} {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of className) {
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  return { variants: parts, utility: current };
}

/** 유틸리티 하나(변형 없이)가 정하는 CSS 속성. 분류표에 없으면 null */
export function utilityProperties(utility: string): readonly string[] | null {
  // 중요 표시(!)·음수(-) 떼기
  const u = utility.replace(/^!|!$/g, "").replace(/^-/, "");
  // 임의 속성: [property:value]
  const arbitrary = /^\[((?:--)?[a-z][\w-]*):.+\]$/.exec(u);
  if (arbitrary) return [arbitrary[1] ?? ""];
  for (const [pattern, props] of RULES) {
    const m = pattern.exec(u);
    if (m) return typeof props === "function" ? props(m) : props;
  }
  return null;
}

export interface ClassConflictReport {
  /** `앞 클래스 ↔ 뒤 클래스 (속성)` */
  conflicts: string[];
  /** 분류표에 없는 클래스 */
  unknown: string[];
}

/** 한 요소의 클래스 목록에서 같은 변형 + 같은 CSS 속성을 정하는 클래스 쌍을 찾는다(같은 클래스가 두 번이면 겹침 아님) */
export function findClassConflicts(classList: string): ClassConflictReport {
  const unknown: string[] = [];
  const owner = new Map<string, string>();
  /** `앞 ↔ 뒤` → 겹친 속성들 */
  const pairs = new Map<string, string[]>();
  for (const cls of new Set(classList.split(/\s+/).filter(Boolean))) {
    const { variants, utility } = splitVariants(cls);
    const props = utilityProperties(utility);
    if (props === null) {
      unknown.push(cls);
      continue;
    }
    const condition = variants.join(":");
    for (const prop of props) {
      const key = `${condition}|${prop}`;
      const prev = owner.get(key);
      if (!prev) {
        owner.set(key, cls);
        continue;
      }
      const pair = `${prev} ↔ ${cls}`;
      pairs.set(pair, [...(pairs.get(pair) ?? []), prop]);
    }
  }
  const conflicts = [...pairs].map(
    ([pair, props]) => `${pair} (${props.join(", ")})`,
  );
  return { conflicts, unknown };
}

/**
 * 렌더한 DOM 안 모든 요소의 클래스를 검사한다. 결과는 `<태그> "이름": 겹침` 목록(같은 줄은 한 번).
 * SVG 요소는 `className`이 문자열이 아니라 `getAttribute("class")`로 읽는다.
 */
export function findDomClassConflicts(root: Element): ClassConflictReport {
  const conflicts = new Set<string>();
  const unknown = new Set<string>();
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const classes = el.getAttribute("class");
    if (!classes) continue;
    const report = findClassConflicts(classes);
    const label =
      el.getAttribute("aria-label") ??
      el.textContent?.trim().slice(0, 20) ??
      "";
    for (const c of report.conflicts) {
      conflicts.add(`<${el.tagName.toLowerCase()}> "${label}": ${c}`);
    }
    for (const u of report.unknown) unknown.add(u);
  }
  return { conflicts: [...conflicts], unknown: [...unknown].sort() };
}
