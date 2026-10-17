/**
 * 브리핑 닫힌 문법 (M1-23 재설계 — PRD §15 D50 → **D53 ② 문형 축소·지시문 [문형]과 한 출처**, FR-22·FR-29). "오늘의 5줄" 한 줄이
 * **허용 문형**으로만 이루어졌는지 가린다. 문형 밖의 낱말·술어·수식이 하나라도 있으면 그 줄은 분석되지 않는다(`parseBriefLine` →
 * 분석 0개 — 검사기가 `grammar-unknown`으로 강등). 거부 목록(틀린 표현 목록)은 새 표현이 계속 빠져나가므로(M1-23 리뷰 1·2회차가 찾은
 * 미탐 112 + 160문장) 알아본 꼴만 통과시킨다.
 *
 * 이 모듈은 **문장 구조만** 본다(순수 함수, I/O 없음). 각 슬롯(팀·선수·점수·분·순위 …)이 입력과 맞는지는 brief-check.ts가 분석
 * 결과(`ParsedClause.bag`)로 대조한다.
 *
 * ── 문형 목록 = 지시문 [문형] (D53 ②) ─────────────────────────────────────────
 *   문형마다 지시문에 쓰는 표기(`text`)와 문법 요소(`el`)를 한 항목(`PATTERNS`·`MODIFIERS`)에 둔다. 지시문
 *   configs/prompts/summarize.md의 [문형] 절은 `renderBriefPatterns()`가 만든 글과 글자까지 같다(tests/brief-grammar.test.ts).
 *   양방향 고정: ① 표기 → 문법 — 표기를 펼친 모든 꼴(`expandPatternText`)이 분석된다 ② 문법 → 표기 — 문법 요소가 쓰는 낱말·술어·
 *   자리표시자(`vocab` — 요소를 만들 때 모은다)가 모두 그 항목 표기에 있다. 문형을 더하거나 빼면 이 파일만 고치고 지시문 [문형]을
 *   다시 붙인다(테스트가 차이를 알린다).
 *   표기법: {팀}·{상대}·{선수}·{득점자}·{대회} 입력 이름, {점수} '2-1', {분} '62분'·'90+2분'·'후반 62분', {n} 수, {순위} '선두'·'2위' ·
 *   [ ] 넣거나 뺄 수 있는 말 · ( / ) 그중 하나 · 낱말 안의 '·' 그중 하나 · [장소]·[수식]·[무승부 수식] 수식 묶음.
 *
 * ── 입력 = 뼈대 문자열 ─────────────────────────────────────────────────────
 *   검사기가 찾은 이름(팀·선수·대회 — 영문 원문이든 한글 공식 표기든)을 `⟨i⟩`로 바꾼 줄(`buildSkeleton`). 이름 뒤에 붙은 조사는
 *   그대로 남고, 문법은 조사의 **역할**(이/가·은/는 = 주어, 을/를 = 목적어, 과/와 = 짝, 에 = 상대 …)만 본다 — 받침에 맞는 형태는
 *   names.ts 치환 뒤 josa.ts가 고치므로('Bayern가' → '바이에른 뮌헨이') 영문 원문 단계와 치환 뒤 문장에 같은 문법이 맞는다.
 *   숫자 뒤 조사('2-1로'·'승점 13으로')는 치환이 고치지 않으므로 받침에 맞아야 하고, 숫자는 앞자리 0을 쓰지 않는다('01-0' 금지).
 *
 * ── 줄 = 절 1~2개 ─────────────────────────────────────────────────────────
 *   절1 '다.'  |  절1(-고·-며) 절2 '다.'  |  관형 앞절('{상대}를 3-0으로 꺾은') {팀}은 + 순위 절 '다.'
 *   절2는 주어를 뺀 순위 꼴(앞 결과 절 주어 팀의 순위)·한국 선수 꼬리·승부차기 꼬리이거나 이름 주어가 있는 문형이다. 두 절은 같은
 *   경기(순위 절끼리는 같은 순위표)여야 한다 — 검사기가 대조한다.
 */

// ─── 뼈대 ────────────────────────────────────────────────────────────────

/** 문법이 아는 이름 종류 — null은 대상을 모르는 표기(비공식 한글 표기 등 — 슬롯에 들어가지 않는다) */
export type MentionKind = "team" | "player" | "comp";

export interface SkeletonMention {
  start: number;
  end: number;
  text: string;
  kind: MentionKind | null;
}

const OPEN = "⟨";
const CLOSE = "⟩";

/**
 * 이름 구간을 `⟨i⟩`로 바꾼 뼈대(i = mentions 순번). 공백 연속은 하나로. 원문에 `⟨`·`⟩`가 있으면 대체 문자로 바꿔 자리표시자로
 * 읽히지 않게 한다(LLM이 그 글자를 쓰면 그 자리에서 문법이 깨진다).
 */
export function buildSkeleton(
  text: string,
  mentions: readonly SkeletonMention[],
): string {
  const plain = (part: string) => part.replace(/[⟨⟩]/gu, "�");
  let out = "";
  let last = 0;
  mentions.forEach((m, i) => {
    out += plain(text.slice(last, m.start)) + `${OPEN}${i}${CLOSE}`;
    last = m.end;
  });
  return (out + plain(text.slice(last))).replace(/\s+/gu, " ").trim();
}

/** 뼈대 위치 → 사람용 낱말(이름은 원문으로 되돌림) — `grammar-unknown` 근거 */
export function skeletonWordAt(
  skeleton: string,
  pos: number,
  mentions: readonly SkeletonMention[],
): string {
  const start = skeleton[pos] === " " ? pos + 1 : pos;
  const word = /^[^ ]*/u.exec(skeleton.slice(start))?.[0] ?? "";
  const restored = word.replace(
    new RegExp(`${OPEN}(\\d+)${CLOSE}`, "gu"),
    (_, i: string) => mentions[Number(i)]?.text ?? "",
  );
  return restored === "" ? "(끝)" : restored;
}

// ─── 분석 상태·결합자 ─────────────────────────────────────────────────────

/** 슬롯 값 — 이름 순번(number)·숫자 쌍·낱말 */
export type BagValue =
  number | string | boolean | readonly number[] | readonly string[];
/** 한 절의 슬롯 묶음(불변) */
export type Bag = Readonly<Record<string, BagValue>>;

interface State {
  pos: number;
  bag: Bag;
}

interface Cx {
  s: string;
  kinds: readonly (MentionKind | null)[];
  /** 가장 멀리 맞은 위치(분석 실패 근거) */
  furthest: number;
}

type El = (cx: Cx, st: State) => State[];

/** 낱말 경계 — 끝·공백·마침표·쉼표 */
const BOUNDARY = "(?=$|[ .,])";

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}

// 문법 요소가 쓰는 낱말·술어·자리표시자 모으기(항목마다 — 머리 주석 "양방향 고정 ②")
let vocabSink: Set<string> | null = null;

function note(...items: string[]): void {
  if (vocabSink) for (const item of items) vocabSink.add(item);
}

function collect<T>(build: () => T): { value: T; vocab: Set<string> } {
  const prev = vocabSink;
  const vocab = new Set<string>();
  vocabSink = vocab;
  try {
    return { value: build(), vocab };
  } finally {
    vocabSink = prev;
  }
}

/** 낱말(들) 하나 — 붙박이 정규식(sticky) + 경계. 뒤 공백 하나는 함께 먹는다. bind가 null이면 거부 */
function tok(
  src: string,
  bind?: (m: RegExpExecArray, bag: Bag, cx: Cx) => Bag | null,
): El {
  const re = new RegExp(`(?:${src})${BOUNDARY}`, "uy");
  return (cx, st) => {
    re.lastIndex = st.pos;
    const m = re.exec(cx.s);
    if (!m) return [];
    const bag = bind ? bind(m, st.bag, cx) : st.bag;
    if (bag === null) return [];
    const end = st.pos + m[0].length;
    cx.furthest = Math.max(cx.furthest, end);
    return [{ pos: cx.s[end] === " " ? end + 1 : end, bag }];
  };
}

/** 고정 낱말(값을 묶을 수 있다) */
function w(text: string, set?: Record<string, BagValue>): El {
  note(text);
  return tok(
    escapeRe(text),
    set
      ? (_, bag) =>
          Object.keys(set).some((k) => k in bag) ? null : { ...bag, ...set }
      : undefined,
  );
}

/** 고정 낱말 중 하나 → key에 그 낱말의 값 */
function choice(key: string, map: Readonly<Record<string, BagValue>>): El {
  return alt(
    ...Object.entries(map).map(([word, value]) => w(word, { [key]: value })),
  );
}

/** 여러 고정 낱말 중 하나 → key에 그 낱말 */
function words(key: string, list: readonly string[]): El {
  note(...list);
  const sorted = [...list].sort((a, b) => b.length - a.length);
  return tok(`(${sorted.map(escapeRe).join("|")})`, (m, bag) =>
    key in bag ? null : { ...bag, [key]: m[1]! },
  );
}

function dedupe(states: State[]): State[] {
  const seen = new Set<string>();
  const out: State[] = [];
  for (const st of states) {
    const k = `${st.pos}|${JSON.stringify(st.bag)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(st);
  }
  return out;
}

function seq(...els: El[]): El {
  return (cx, st) => {
    let states = [st];
    for (const el of els) {
      const next: State[] = [];
      for (const s of states) next.push(...el(cx, s));
      if (next.length === 0) return [];
      states = dedupe(next);
    }
    return states;
  };
}

function opt(el: El): El {
  return (cx, st) => [st, ...el(cx, st)];
}

function alt(...els: El[]): El {
  return (cx, st) => dedupe(els.flatMap((el) => el(cx, st)));
}

/** 글자를 먹지 않고 값만 묶는다 */
function put(values: Record<string, BagValue>): El {
  return (_, st) =>
    Object.keys(values).some((k) => k in st.bag)
      ? []
      : [{ pos: st.pos, bag: { ...st.bag, ...values } }];
}

const nothing: El = (_, st) => [st];

/** 수식 묶음 — 0개 이상, 순서 자유(종류마다 한 번 — 수식이 이미 묶인 키를 거부한다) */
function mods(list: readonly El[]): El {
  return (cx, st) => {
    const out: State[] = [st];
    let frontier = [st];
    while (frontier.length > 0) {
      const next = dedupe(
        frontier.flatMap((s) => list.flatMap((el) => el(cx, s))),
      );
      out.push(...next);
      frontier = next;
    }
    return dedupe(out);
  };
}

// ─── 슬롯 ────────────────────────────────────────────────────────────────

const MENTION = `${OPEN}(\\d+)${CLOSE}`;

/** 조사 역할 */
const P = {
  subj: "이|가|은|는",
  obj: "을|를",
  with: "과|와",
  dat: "에",
  gen: "의",
  none: "",
} as const;

/** 이름 슬롯 — 종류가 맞는 이름 + 조사(역할). 조사 원문은 `${key}P`에, 표기 자리표시자(ph)는 vocab에 */
function slot(
  key: string,
  kinds: readonly MentionKind[],
  particle: string,
  ph: string,
): El {
  note(ph);
  return tok(`${MENTION}(${particle})`, (m, bag, cx) => {
    const i = Number(m[1]);
    const kind = cx.kinds[i];
    if (!kind || !kinds.includes(kind) || key in bag) return null;
    return { ...bag, [key]: i, [`${key}P`]: m[2] ?? "" };
  });
}

const team = (key: string, particle: string, ph = "{팀}") =>
  slot(key, ["team"], particle, ph);
const opponent = (key: string, particle: string) =>
  slot(key, ["team"], particle, "{상대}");
const player = (key: string, particle: string, ph = "{선수}") =>
  slot(key, ["player"], particle, ph);
const comp = (key: string, particle: string) =>
  slot(key, ["comp"], particle, "{대회}");

/** 이름 묶음 주어 — 'A가' · 'A와 B가' · 'A·B·C가'(템플릿 공동 순위) → key = 순번 목록 */
function teamGroup(key: string, particle: string): El {
  note("{팀}");
  return alt(
    tok(
      `${MENTION}·${MENTION}(?:·${MENTION})?(?:${particle})`,
      (m, bag, cx) => {
        const ids = [m[1], m[2], m[3]]
          .filter((x): x is string => x !== undefined)
          .map(Number);
        if (key in bag || ids.some((i) => cx.kinds[i] !== "team")) return null;
        return { ...bag, [key]: ids };
      },
    ),
    toGroup(key, seq(team("#a", P.with), team("#b", particle))),
    toGroup(key, team("#a", particle)),
  );
}

/** 임시 슬롯(#a·#b) → key = 순번 목록 */
function toGroup(key: string, el: El): El {
  return (cx, st) =>
    key in st.bag
      ? []
      : el(cx, st).map((s) => {
          const { "#a": a, "#b": b, "#aP": _a, "#bP": _b, ...rest } = s.bag;
          void _a;
          void _b;
          const ids = [a, b].filter((x): x is number => typeof x === "number");
          return { pos: s.pos, bag: { ...rest, [key]: ids } };
        });
}

/** 앞자리 0 없는 수 */
const NUM = "(?:0|[1-9]\\d?)";
const POS_NUM = "[1-9]\\d?";

/** 숫자 뒤 으로/로 — 받침(josa.ts와 같은 규칙: 끝 0·3·6 = 받침, 1·7·8 = ㄹ → 로) */
function roParticleOk(num: string, particle: string): boolean {
  const last = num.at(-1)!;
  const consonant = last === "0" || last === "3" || last === "6";
  return particle === (consonant ? "으로" : "로");
}

/** 점수 'a-b' + 으로/로 → key = [a, b] */
function score(key: string): El {
  note("{점수}");
  return tok(`(${NUM})-(${NUM})(으로|로)`, (m, bag) => {
    if (key in bag || !roParticleOk(m[2]!, m[3]!)) return null;
    return { ...bag, [key]: [Number(m[1]), Number(m[2])] };
  });
}

/** 조사 없는 점수('2-1 역전승을') */
function bareScore(key: string): El {
  note("{점수}");
  return tok(`(${NUM})-(${NUM})`, (m, bag) =>
    key in bag ? null : { ...bag, [key]: [Number(m[1]), Number(m[2])] },
  );
}

/** 구간 낱말 — 분과 맞아야 한다(검사기 halfOk). 지시문 [사실]의 '전반'·'후반'·'연장' */
export const HALF_WORDS: readonly string[] = Object.freeze([
  "전반",
  "후반",
  "연장",
]);

/** 분 — '[전반·후반·연장 ]62분'·'90+2분' → key = "90+2", `${key}H` = 구간 낱말 */
function minute(key: string): El {
  note("{분}");
  return tok(
    `(?:(${HALF_WORDS.join("|")}) )?([1-9]\\d{0,2}(?:\\+[1-9]\\d?)?)분`,
    (m, bag) => {
      if (key in bag) return null;
      const next: Record<string, BagValue> = { ...bag, [key]: m[2]! };
      if (m[1]) next[`${key}H`] = m[1];
      return next;
    },
  );
}

/** 골 수 — '3골' + 뒤 낱말 → key = n(1 이상) */
function goalCount(key: string, tail: string): El {
  note("{n}골");
  return tok(`(${POS_NUM})골${escapeRe(tail)}`, (m, bag) =>
    key in bag ? null : { ...bag, [key]: Number(m[1]) },
  );
}

/** '승점 n으로' → key = n */
function pointsWith(key: string): El {
  note("승점 {n}");
  return tok("승점 (0|[1-9]\\d{0,2})(으로|로)", (m, bag) => {
    if (key in bag || !roParticleOk(m[1]!, m[2]!)) return null;
    return { ...bag, [key]: Number(m[1]) };
  });
}

/** 순위 낱말 + 뒤 붙는 말 — '선두'·'2위'·'공동 선두'·'공동 3위' → key = 순위(선두 = 1), `${key}T` = 공동 여부 */
function rank(key: string, suffix: string): El {
  note("{순위}", "공동");
  return tok(`(공동 )?(?:선두|(${POS_NUM})위)(?:${suffix})`, (m, bag) => {
    if (key in bag) return null;
    return {
      ...bag,
      [key]: m[2] !== undefined ? Number(m[2]) : 1,
      [`${key}T`]: m[1] !== undefined,
    };
  });
}

// ─── 술어 ────────────────────────────────────────────────────────────────

/** 술어 활용형 — final '-다'(줄 끝) · conn '-고·-며'(뒤에 절2) · adn 관형 '-ㄴ'(뒤에 {팀}은 + 순위 절) */
interface Forms {
  final: readonly string[];
  conn?: readonly string[];
  adn?: readonly string[];
}

/** 허용 술어(원형 → 활용형). 여기 없는 술어는 문법 밖이다(D53 ② — v0.2 실측 분포로 줄였다) */
export const PREDICATES: Readonly<Record<string, Forms>> = Object.freeze({
  꺾다: {
    final: ["꺾었다"],
    conn: ["꺾었고", "꺾고", "꺾으며", "꺾었으며"],
    adn: ["꺾은"],
  },
  이기다: {
    final: ["이겼다"],
    conn: ["이겼고", "이기고", "이기며", "이겼으며"],
    adn: ["이긴"],
  },
  누르다: { final: ["눌렀다"], conn: ["눌렀고", "누르고", "누르며"] },
  제압하다: {
    final: ["제압했다"],
    conn: ["제압했고", "제압하고", "제압하며"],
  },
  완파하다: {
    final: ["완파했다"],
    conn: ["완파했고", "완파하고", "완파하며"],
    adn: ["완파한"],
  },
  거두다: { final: ["거뒀다"], conn: ["거뒀고", "거두고", "거두며"] },
  지다: { final: ["졌다"], conn: ["졌고", "지고", "지며"] },
  패하다: { final: ["패했다"], conn: ["패했고", "패하고", "패하며"] },
  비기다: { final: ["비겼다"], conn: ["비겼고", "비기고", "비기며"] },
  끝나다: { final: ["끝났다"], conn: ["끝났고"] },
  넣다: { final: ["넣었다"], conn: ["넣었고", "넣고", "넣으며"] },
  터뜨리다: { final: ["터뜨렸다"], conn: ["터뜨렸고", "터뜨리고", "터뜨리며"] },
  기록하다: { final: ["기록했다"], conn: ["기록했고", "기록하고", "기록하며"] },
  돕다: { final: ["도왔다"], conn: ["도왔고", "도우며"] },
  뛰다: { final: ["뛰었다"], conn: ["뛰었고", "뛰며", "뛰었으며"] },
  교체되다: { final: ["교체됐다"], conn: ["교체됐고", "교체됐으며"] },
  "교체 아웃되다": {
    final: ["교체 아웃됐다"],
    conn: ["교체 아웃됐고", "교체 아웃됐으며"],
  },
  결장하다: { final: ["결장했다"], conn: ["결장했고", "결장하며"] },
  않다: { final: ["않았다"], conn: ["않았고"] },
  달리다: {
    final: ["달렸다", "달린다"],
    conn: ["달렸고", "달리고", "달리며"],
  },
  오르다: { final: ["올랐다"], conn: ["올랐고", "오르며"] },
  내려가다: { final: ["내려갔다"], conn: ["내려갔고", "내려가며"] },
  지키다: { final: ["지켰다"], conn: ["지켰고", "지키며"] },
  없다: { final: ["없었다"] },
});

type End = "final" | "conn" | "adn";

/** 술어 — 원형 목록 중 하나의 활용형. key `verb` = 원형, `end` = 활용 종류. vocab에는 끝(final)·관형(adn) 형태만(연결형은 잇기 규칙) */
function pred(
  lemmas: readonly string[],
  ends: readonly End[] = ["final", "conn"],
): El {
  const table = new Map<string, { lemma: string; end: End }>();
  for (const lemma of lemmas) {
    const forms = PREDICATES[lemma];
    if (!forms) throw new Error(`술어 표에 없음: ${lemma}`);
    for (const end of ends) {
      for (const form of forms[end] ?? []) {
        table.set(form, { lemma, end });
        if (end !== "conn") note(form);
      }
    }
  }
  const forms = [...table.keys()].sort((a, b) => b.length - a.length);
  return tok(`(${forms.map(escapeRe).join("|")})`, (m, bag) => {
    if ("verb" in bag) return null;
    const hit = table.get(m[1]!)!;
    return { ...bag, verb: hit.lemma, end: hit.end };
  });
}

/** 순위 + 서술격(순위 절 끝) — '선두다'·'3위다'·'공동 2위이고' */
function rankCopula(key: string): El {
  note("{순위}", "공동");
  return tok(`(공동 )?(?:선두|(${POS_NUM})위)(다|이다|이고|이며)`, (m, bag) => {
    if (key in bag || "verb" in bag) return null;
    return {
      ...bag,
      [key]: m[2] !== undefined ? Number(m[2]) : 1,
      [`${key}T`]: m[1] !== undefined,
      verb: "이다",
      end: m[3] === "이고" || m[3] === "이며" ? "conn" : "final",
    };
  });
}

// ─── 수식 (지시문 [문형]의 수식 묶음) ───────────────────────────────────────

/** 수식 묶음 이름(지시문 표기 '[장소]'·'[수식]'·'[무승부 수식]') */
export type ModifierGroup = "장소" | "수식" | "무승부 수식";

export interface ModifierEntry {
  id: string;
  /** 이 수식이 들어가는 묶음 */
  groups: readonly ModifierGroup[];
  /** 지시문 표기 */
  text: string;
  /** 묶는 슬롯 — 같은 슬롯을 묶는 수식은 한 줄에 함께 못 온다(표기 펼치기가 그 조합을 뺀다) */
  keys: readonly string[];
  el: El;
  /** 요소가 쓰는 낱말·자리표시자(표기와 대조 — 양방향 고정 ②) */
  vocab: ReadonlySet<string>;
}

const ROUND_WORDS = ["결승", "4강", "8강", "16강", "플레이오프"] as const;

function modifier(
  id: string,
  groups: readonly ModifierGroup[],
  keys: readonly string[],
  text: string,
  build: () => El,
): ModifierEntry {
  const { value, vocab } = collect(build);
  return { id, groups, text, keys, el: value, vocab };
}

const PLACE: readonly ModifierGroup[] = ["장소", "수식", "무승부 수식"];

/** 수식 목록 — 지시문 [문형]의 '장소'·'수식' 줄이 이 순서로 나온다 */
export const MODIFIERS: readonly ModifierEntry[] = [
  modifier("home", PLACE, ["venue"], "홈에서", () =>
    w("홈에서", { venue: "home" }),
  ),
  modifier("away", PLACE, ["venue"], "원정에서", () =>
    w("원정에서", { venue: "away" }),
  ),
  modifier("away-named", PLACE, ["venue"], "{상대} 원정에서", () =>
    seq(opponent("venueTeam", P.none), w("원정에서", { venue: "named" })),
  ),
  modifier("comp", PLACE, ["comp"], "{대회}에서", () => comp("comp", "에서")),
  modifier(
    "comp-venue",
    PLACE,
    ["comp", "venue"],
    "{대회} 홈경기에서·원정에서",
    () =>
      seq(
        comp("comp", P.none),
        alt(
          w("홈경기에서", { venue: "home" }),
          w("원정에서", { venue: "away" }),
        ),
      ),
  ),
  modifier(
    "round",
    PLACE,
    ["comp", "round"],
    "[{대회}] 결승에서·4강에서·8강에서·16강에서·플레이오프에서",
    () =>
      seq(
        opt(comp("comp", P.none)),
        words(
          "round",
          ROUND_WORDS.map((r) => `${r}에서`),
        ),
      ),
  ),
  modifier("et", ["수식", "무승부 수식"], ["et"], "연장 끝에", () =>
    w("연장 끝에", { et: true }),
  ),
  modifier("shootout", ["수식"], ["shootout"], "승부차기 끝에", () =>
    w("승부차기 끝에", { shootout: true }),
  ),
  modifier(
    "total",
    ["수식", "무승부 수식"],
    ["total"],
    "{n}골을 주고받은 끝에",
    () => seq(goalCount("total", "을"), w("주고받은 끝에")),
  ),
  modifier(
    "scorer",
    ["수식"],
    ["scorer"],
    "{선수}의 [{분}] [PK] 결승골로",
    () =>
      seq(
        player("scorer", P.gen),
        opt(minute("scorerMin")),
        opt(w("PK", { scorerPk: true })),
        w("결승골로", { scorerKind: "decisive" }),
      ),
  ),
  modifier(
    "feat",
    ["수식"],
    ["feat"],
    "{선수}의 해트트릭을·{n}골을 앞세워",
    () =>
      seq(
        player("feat", P.gen),
        alt(
          w("해트트릭을", { featKind: "hat" }),
          seq(goalCount("featN", "을"), put({ featKind: "n" })),
        ),
        w("앞세워"),
      ),
  ),
  modifier(
    "equaliser",
    ["무승부 수식"],
    ["eq"],
    "{선수}의 [{분}] [PK] 동점골로",
    () =>
      seq(
        player("eq", P.gen),
        opt(minute("eqMin")),
        opt(w("PK", { eqPk: true })),
        w("동점골로", { eqKind: "equaliser" }),
      ),
  ),
];

function group(name: ModifierGroup): El {
  return mods(
    MODIFIERS.filter((m) => m.groups.includes(name)).map((m) => m.el),
  );
}

// ─── 문형 (절) ────────────────────────────────────────────────────────────

export type ClauseType =
  | "win"
  | "loss"
  | "draw"
  | "pens"
  | "end"
  | "endPens"
  | "goal"
  | "count"
  | "assist"
  | "korean"
  | "koreanTail"
  | "rank"
  | "rankList"
  | "move"
  | "keep"
  | "gap";

/** 문형이 줄 안에서 서는 자리 — first 절1(이름 주어) · second 절2만(앞 절에 이어) · adn 관형 앞절 + 순위 절 */
export type PatternRole = "first" | "second" | "adn";

/** 지시문 [문형]의 절(분류) — 렌더 순서 */
export type PatternSection = "결과" | "득점" | "한국 선수" | "순위";

export interface PatternEntry {
  id: string;
  section: PatternSection;
  type: ClauseType;
  role: PatternRole;
  /** 지시문 표기(앞의 '- ' 없이) — ' — '뒤는 설명(펼치지 않는다) */
  text: string;
  /** 시험용 앞절(뼈대) — second는 이 앞절 뒤에 붙여 분석한다 */
  context?: string;
  el: El;
  /** adn — 관형 앞절 뒤 순위 절 */
  tail?: El;
  vocab: ReadonlySet<string>;
}

function pattern(
  spec: Omit<PatternEntry, "el" | "vocab" | "tail"> & {
    build: () => El;
    tail?: () => El;
  },
): PatternEntry {
  const head = collect(spec.build);
  const tail = spec.tail ? collect(spec.tail) : null;
  const vocab = new Set([...head.vocab, ...(tail?.vocab ?? [])]);
  return {
    id: spec.id,
    section: spec.section,
    type: spec.type,
    role: spec.role,
    text: spec.text,
    ...(spec.context ? { context: spec.context } : {}),
    el: head.value,
    ...(tail ? { tail: tail.value } : {}),
    vocab,
  };
}

const subject = () => team("subj", P.subj);

const ENDS: readonly End[] = ["final", "conn"];

/** 한국 선수 출전 꼴 — 선발·교체 */
function appearance(): El {
  return alt(
    seq(opt(team("kTeam2", P.none)), w("선발로 출전해", { app: "start" })),
    w("선발 출전해", { app: "start" }),
    w("선발로 나와", { app: "start" }),
    seq(opt(minute("subOn")), w("교체 투입돼", { app: "sub" })),
  );
}

/** 한국 선수 경기 수식 — [[{팀}의] {상대}전에서] */
function koreanMatch(): El {
  return opt(seq(opt(team("kTeam", P.gen)), opponent("kOpp", "전에서")));
}

/** 순위 절 몸통(주어 다음) — [승점 n으로] [{대회}] [공동] {순위}다·를 달렸다·를 달린다[·에 올라 있다] */
function rankBody(withState: boolean): El {
  return seq(
    opt(pointsWith("pts")),
    opt(comp("comp", P.none)),
    alt(
      rankCopula("rank"),
      seq(rank("rank", "를|을"), pred(["달리다"])),
      ...(withState
        ? [
            seq(
              rank("rank", "에"),
              w("올라 있다", { verb: "이다", end: "final" }),
            ),
          ]
        : []),
    ),
  );
}

/** 순위 나열의 한 묶음 — {팀}이 승점 n으로 [{대회}] [공동] {순위}(,) */
function rankPhrase(i: number, withComp: boolean, last: boolean): El {
  return seq(
    teamGroup(`g${i}`, P.subj),
    pointsWith(`pts${i}`),
    withComp ? opt(comp("comp", P.none)) : nothing,
    last ? rankCopula(`rank${i}`) : seq(rank(`rank${i}`, ""), tok(",")),
  );
}

const WIN_OBJECT = ["꺾다", "누르다", "제압하다", "완파하다"];

/** 문형 목록 — 지시문 [문형]이 이 순서로 나온다 */
export const PATTERNS: readonly PatternEntry[] = [
  // ── 결과
  pattern({
    id: "win",
    section: "결과",
    type: "win",
    role: "first",
    text: "{팀}이 [수식] {상대}를 [수식] [{점수}로] 꺾었다·눌렀다·제압했다·완파했다",
    build: () =>
      seq(
        subject(),
        group("수식"),
        opponent("obj", P.obj),
        group("수식"),
        opt(score("score")),
        pred(WIN_OBJECT, ENDS),
      ),
  }),
  pattern({
    id: "win-beat",
    section: "결과",
    type: "win",
    role: "first",
    text: "{팀}이 [수식] [{상대}를] [수식] [{점수}로] 이겼다",
    build: () =>
      seq(
        subject(),
        group("수식"),
        opt(opponent("obj", P.obj)),
        group("수식"),
        opt(score("score")),
        pred(["이기다"], ENDS),
      ),
  }),
  pattern({
    id: "win-earn",
    section: "결과",
    type: "win",
    role: "first",
    text: "{팀}이 [수식] [{상대}에] [수식] [{점수}] 승리를·역전승을 거뒀다",
    build: () =>
      seq(
        subject(),
        group("수식"),
        opt(opponent("obj", P.dat)),
        group("수식"),
        opt(bareScore("score")),
        choice("kind", { 승리를: "승리", 역전승을: "역전승" }),
        pred(["거두다"], ENDS),
      ),
  }),
  pattern({
    id: "loss",
    section: "결과",
    type: "loss",
    role: "first",
    text: "{팀}이 [장소] [{상대}에] [{점수}로] 졌다·패했다",
    build: () =>
      seq(
        subject(),
        group("장소"),
        opt(opponent("obj", P.dat)),
        opt(score("score")),
        pred(["지다", "패하다"], ENDS),
      ),
  }),
  pattern({
    id: "draw-pair",
    section: "결과",
    type: "draw",
    role: "first",
    text: "{팀}과 {상대}가 [{대회}에서] [연장 끝에] [{점수}로] 비겼다",
    build: () =>
      seq(
        team("subj", P.with),
        opponent("subj2", P.subj),
        opt(comp("comp", "에서")),
        opt(w("연장 끝에", { et: true })),
        opt(score("score")),
        pred(["비기다"], ENDS),
      ),
  }),
  pattern({
    id: "draw",
    section: "결과",
    type: "draw",
    role: "first",
    text: "{팀}이 [무승부 수식] [{상대}와] [무승부 수식] [{점수}로] 비겼다",
    build: () =>
      seq(
        subject(),
        group("무승부 수식"),
        opt(opponent("obj", P.with)),
        group("무승부 수식"),
        opt(score("score")),
        pred(["비기다"], ENDS),
      ),
  }),
  pattern({
    id: "end",
    section: "결과",
    type: "end",
    role: "first",
    text: "{팀}과 {상대}의 [{대회}] 경기는 [연장까지] {점수}로 끝났다",
    build: () =>
      seq(
        team("subj", P.with),
        opponent("subj2", P.gen),
        opt(comp("comp", P.none)),
        w("경기는"),
        opt(w("연장까지", { etUntil: true })),
        score("score"),
        pred(["끝나다"], ENDS),
      ),
  }),
  pattern({
    id: "end-pens",
    section: "결과",
    type: "endPens",
    role: "second",
    text: "(승부차기 경기의 '경기는 … 끝났고' 뒤) 승부차기에서 {팀}이 {점수}로 이겼다",
    context: `${OPEN}0${CLOSE}과 ${OPEN}1${CLOSE}의 경기는 1-1로 끝났고 `,
    build: () =>
      seq(
        w("승부차기에서"),
        subject(),
        score("pens"),
        pred(["이기다"], ["final"]),
      ),
  }),
  pattern({
    id: "pens",
    section: "결과",
    type: "pens",
    role: "first",
    text: "{팀}이 [장소] {상대}와 [연장까지] {점수}로 맞선 뒤 승부차기에서 {점수}로 이겼다",
    build: () =>
      seq(
        subject(),
        group("장소"),
        opponent("obj", P.with),
        opt(w("연장까지", { etUntil: true })),
        score("score"),
        w("맞선 뒤 승부차기에서"),
        score("pens"),
        pred(["이기다"], ENDS),
      ),
  }),
  // ── 득점
  pattern({
    id: "goal",
    section: "득점",
    type: "goal",
    role: "first",
    text: "[{팀}의] {선수}가 [{분}] [PK] 골을·선제골을·결승골을·동점골을·만회골을 넣었다·터뜨렸다",
    build: () =>
      seq(
        opt(team("team", P.gen)),
        player("subj", P.subj),
        opt(minute("min")),
        opt(w("PK", { pk: true })),
        choice("noun", {
          골을: "골",
          선제골을: "선제골",
          결승골을: "결승골",
          동점골을: "동점골",
          만회골을: "만회골",
        }),
        pred(["넣다", "터뜨리다"], ENDS),
      ),
  }),
  pattern({
    id: "count",
    section: "득점",
    type: "count",
    role: "first",
    text: "[{팀}의] {선수}가 ({n}골을 넣었다 / 해트트릭을 기록했다 / 멀티골을 기록했다)",
    build: () =>
      seq(
        opt(team("team", P.gen)),
        player("subj", P.subj),
        alt(
          seq(goalCount("n", "을"), pred(["넣다"], ENDS)),
          seq(
            choice("feat", { 해트트릭을: "hat", 멀티골을: "multi" }),
            pred(["기록하다"], ENDS),
          ),
        ),
      ),
  }),
  pattern({
    id: "assist",
    section: "득점",
    type: "assist",
    role: "first",
    text: "{선수}가 {득점자}의 [{분}] 골을·선제골을·결승골을·동점골을 도왔다",
    build: () =>
      seq(
        player("subj", P.subj),
        player("target", P.gen, "{득점자}"),
        opt(minute("min")),
        choice("noun", {
          골을: "골",
          선제골을: "선제골",
          결승골을: "결승골",
          동점골을: "동점골",
        }),
        pred(["돕다"], ENDS),
      ),
  }),
  // ── 한국 선수
  pattern({
    id: "korean",
    section: "한국 선수",
    type: "korean",
    role: "first",
    text: "{선수}는 [[{팀}의] {상대}전에서] ([{팀}] 선발로 출전해 / 선발 출전해 / 선발로 나와 / [{분}] 교체 투입돼) {n}분을 (뛰었다 / 뛰고 교체됐다 / 뛰고 교체 아웃됐다)",
    build: () =>
      seq(
        player("subj", P.subj),
        koreanMatch(),
        appearance(),
        (() => {
          note("{n}분");
          return tok(`(${POS_NUM}\\d?)분을`, (m, bag) =>
            "minutes" in bag ? null : { ...bag, minutes: Number(m[1]) },
          );
        })(),
        alt(
          pred(["뛰다"], ENDS),
          seq(
            w("뛰고", { subOff: true }),
            pred(["교체되다", "교체 아웃되다"], ENDS),
          ),
        ),
      ),
  }),
  pattern({
    id: "korean-bench",
    section: "한국 선수",
    type: "korean",
    role: "first",
    text: "{선수}는 [[{팀}의] {상대}전에서] (결장했다 / 출전하지 않았다)",
    build: () =>
      seq(
        player("subj", P.subj),
        koreanMatch(),
        put({ app: "bench" }),
        alt(pred(["결장하다"], ENDS), seq(w("출전하지"), pred(["않다"], ENDS))),
      ),
  }),
  pattern({
    id: "korean-tail",
    section: "한국 선수",
    type: "koreanTail",
    role: "second",
    text: "(출전 문형 뒤) 득점은 없었다",
    context: `${OPEN}2${CLOSE}는 선발 출전해 78분을 뛰었고 `,
    build: () => seq(w("득점은"), pred(["없다"], ["final"])),
  }),
  // ── 순위
  pattern({
    id: "rank",
    section: "순위",
    type: "rank",
    role: "first",
    text: "({팀}이 / {팀}과 {팀}이) [승점 {n}으로] [{대회}] [공동] ({순위}다 / {순위}를 달렸다·달린다 / {순위}에 올라 있다)",
    build: () => seq(teamGroup("subj", P.subj), rankBody(true)),
  }),
  pattern({
    id: "rank-after",
    section: "순위",
    type: "rank",
    role: "second",
    text: "(결과 문형 뒤, 주어를 빼고 그 팀 순위) [승점 {n}으로] [{대회}] [공동] ({순위}다 / {순위}를 달렸다·달린다)",
    context: `${OPEN}0${CLOSE}가 ${OPEN}1${CLOSE}를 2-1로 꺾고 `,
    build: () => rankBody(false),
  }),
  pattern({
    id: "rank-list",
    section: "순위",
    type: "rankList",
    role: "first",
    text: "{팀}이 승점 {n}으로 [{대회}] [공동] {순위}, {팀}이 승점 {n}으로 [공동] {순위}다 — 세 묶음까지",
    build: () =>
      alt(
        seq(rankPhrase(1, true, false), rankPhrase(2, false, true)),
        seq(
          rankPhrase(1, true, false),
          rankPhrase(2, false, false),
          rankPhrase(3, false, true),
        ),
      ),
  }),
  pattern({
    id: "gap",
    section: "순위",
    type: "gap",
    role: "first",
    text: "{팀}이 [[공동] {순위}] {상대}에 승점 {n} (앞선 / 뒤진) [공동] {순위}다",
    build: () =>
      seq(
        subject(),
        opt(rank("otherRank", "")),
        opponent("other", P.dat),
        (() => {
          note("승점 {n}");
          return tok(`승점 (${POS_NUM}\\d?)`, (m, bag) => ({
            ...bag,
            gap: Number(m[1]),
          }));
        })(),
        alt(w("앞선", { dir: "ahead" }), w("뒤진", { dir: "behind" })),
        rankCopula("rank"),
      ),
  }),
  pattern({
    id: "move",
    section: "순위",
    type: "move",
    role: "first",
    text: "(prev 있을 때만) {팀}이 {n}위에서 {n}위로 올랐다·내려갔다",
    build: () =>
      seq(
        subject(),
        (() => {
          note("{n}위에서", "{n}위로");
          return seq(
            tok(`(${POS_NUM})위에서`, (m, bag) => ({
              ...bag,
              from: Number(m[1]),
            })),
            tok(`(${POS_NUM})위로`, (m, bag) => ({ ...bag, to: Number(m[1]) })),
          );
        })(),
        pred(["오르다", "내려가다"], ENDS),
      ),
  }),
  pattern({
    id: "keep",
    section: "순위",
    type: "keep",
    role: "first",
    text: "(prev 있을 때만) {팀}이 [승점 {n}으로] [{대회}] [공동] {순위}를 지켰다",
    build: () =>
      seq(
        subject(),
        opt(pointsWith("pts")),
        opt(comp("comp", P.none)),
        rank("rank", "를|을"),
        pred(["지키다"], ENDS),
      ),
  }),
  pattern({
    id: "adn",
    section: "순위",
    type: "win",
    role: "adn",
    text: "{상대}를 [{점수}로] 꺾은·이긴·완파한 {팀}은 [승점 {n}으로] [{대회}] [공동] ({순위}다 / {순위}를 달렸다·달린다)",
    build: () =>
      seq(
        opponent("obj", P.obj),
        opt(score("score")),
        pred(["꺾다", "이기다", "완파하다"], ["adn"]),
      ),
    tail: () => seq(team("adnSubject", P.subj), rankBody(false)),
  }),
];

// ─── 지시문 [문형] 렌더 ───────────────────────────────────────────────────

const SECTIONS: readonly PatternSection[] = [
  "결과",
  "득점",
  "한국 선수",
  "순위",
];

/** 수식 묶음 줄 — 지시문 [문형] '장소: …'·'수식(장소 포함, 종류마다 한 번): …'·'무승부 수식(장소 포함): …' */
const GROUP_LINES: ReadonlyArray<{
  name: ModifierGroup;
  lead: string;
  /** 장소 수식을 모두 품는 묶음(줄에는 장소 밖 수식만 적는다) */
  withPlace: boolean;
}> = [
  { name: "장소", lead: "장소", withPlace: false },
  {
    name: "수식",
    lead: "수식(장소 포함, 종류마다 한 번)",
    withPlace: true,
  },
  { name: "무승부 수식", lead: "무승부 수식(장소 포함)", withPlace: true },
];

/**
 * 지시문 [문형] 절 — 문형 목록·수식 묶음을 지시문 표기로(머리 주석 "문형 목록 = 지시문 [문형]"). configs/prompts/summarize.md의
 * '[문형]'부터 다음 절 앞까지가 이 글과 같아야 한다.
 */
export function renderBriefPatterns(): string {
  const lines: string[] = [
    "[문형] 이 꼴로만 쓴다. {팀}·{상대}·{선수}·{득점자}·{대회} 입력 이름 · {점수} '2-1' · {분} '62분'·'후반 62분' · {n} 수 · {순위} '선두'·'2위' · [ ] 넣거나 뺌 · ( / )와 '·' 그중 하나",
  ];
  for (const section of SECTIONS) {
    lines.push(section);
    for (const p of PATTERNS.filter((x) => x.section === section))
      lines.push(`- ${p.text}`);
    if (section === "결과") {
      for (const g of GROUP_LINES) {
        const own = MODIFIERS.filter(
          (m) =>
            m.groups.includes(g.name) &&
            !(g.withPlace && m.groups.includes("장소")),
        );
        lines.push(`${g.lead}: ${own.map((m) => m.text).join(" · ")}`);
      }
    }
  }
  lines.push(
    "잇기: 문형 둘을 '-고'·'-며'로 잇는다('꺾었고'·'꺾고'·'꺾으며'). 두 문형은 같은 경기(순위끼리는 같은 순위표)다.",
  );
  return lines.join("\n");
}

// ─── 줄 ──────────────────────────────────────────────────────────────────

export interface ParsedClause {
  type: ClauseType;
  /** 문형 id(PATTERNS) */
  id: string;
  bag: Bag;
}

/** 분석 하나 — 절 1~2개. 관형 앞절('…를 꺾은 {팀}은 …')이면 adnSubject = 그 팀 이름 순번 */
export interface LineParse {
  clauses: ParsedClause[];
  adnSubject?: number;
}

const FIRST = PATTERNS.filter((p) => p.role === "first");
const SECOND = PATTERNS.filter(
  (p) => p.role === "first" || p.role === "second",
);
const ADNOMINAL = PATTERNS.filter((p) => p.role === "adn");
const RANK_AFTER = PATTERNS.find((p) => p.id === "rank-after")!;

function atLineEnd(s: string, pos: number): boolean {
  const rest = s.slice(pos);
  return rest === "" || rest === ".";
}

export interface GrammarResult {
  /** 허용 문형으로 끝까지 읽힌 분석들(0개면 문법 밖) */
  parses: LineParse[];
  /** 가장 멀리 읽은 뼈대 위치(문법 밖이면 그다음 낱말이 깨진 곳) */
  furthest: number;
}

/**
 * 뼈대 한 줄 → 허용 문형 분석(순수 함수). `kinds[i]` = 뼈대 `⟨i⟩` 이름의 종류. 분석이 여럿이면 모두 돌려준다(검사기가 입력과 맞는
 * 분석을 고른다).
 */
export function parseBriefLine(
  skeleton: string,
  kinds: readonly (MentionKind | null)[],
): GrammarResult {
  const cx: Cx = { s: skeleton, kinds, furthest: 0 };
  const parses: LineParse[] = [];
  const start: State = { pos: 0, bag: {} };
  for (const first of FIRST) {
    for (const st of first.el(cx, start)) {
      const c1: ParsedClause = { type: first.type, id: first.id, bag: st.bag };
      if (st.bag.end === "final") {
        if (atLineEnd(skeleton, st.pos)) parses.push({ clauses: [c1] });
        continue;
      }
      if (st.bag.end !== "conn") continue;
      for (const second of SECOND) {
        for (const st2 of second.el(cx, { pos: st.pos, bag: {} })) {
          if (st2.bag.end === "final" && atLineEnd(skeleton, st2.pos))
            parses.push({
              clauses: [c1, { type: second.type, id: second.id, bag: st2.bag }],
            });
        }
      }
    }
  }
  for (const adn of ADNOMINAL) {
    for (const st of adn.el(cx, start)) {
      if (st.bag.end !== "adn" || !adn.tail) continue;
      for (const st2 of adn.tail(cx, { pos: st.pos, bag: {} })) {
        if (st2.bag.end !== "final" || !atLineEnd(skeleton, st2.pos)) continue;
        const { adnSubject, adnSubjectP: _p, ...rest } = st2.bag;
        void _p;
        parses.push({
          clauses: [
            { type: adn.type, id: adn.id, bag: st.bag },
            { type: RANK_AFTER.type, id: RANK_AFTER.id, bag: rest },
          ],
          adnSubject: adnSubject as number,
        });
      }
    }
  }
  return { parses, furthest: cx.furthest };
}

// ─── 표기 펼치기(시험용 — 양방향 고정 ①) ──────────────────────────────────

/** 자리표시자 → 뼈대(이름 순번은 `EXPAND_KINDS` 순서) */
const PLACEHOLDER_SKELETON: ReadonlyArray<[string, string]> = Object.freeze([
  ["{팀}", `${OPEN}0${CLOSE}`],
  ["{상대}", `${OPEN}1${CLOSE}`],
  ["{선수}", `${OPEN}2${CLOSE}`],
  ["{득점자}", `${OPEN}3${CLOSE}`],
  ["{대회}", `${OPEN}4${CLOSE}`],
  ["{점수}", "2-1"],
  ["{분}", "62분"],
  ["{순위}", "2위"],
]);

/** 펼친 뼈대의 이름 종류(⟨0⟩ 팀 · ⟨1⟩ 상대 · ⟨2⟩ 선수 · ⟨3⟩ 득점자 · ⟨4⟩ 대회) */
export const EXPAND_KINDS: readonly MentionKind[] = Object.freeze([
  "team",
  "team",
  "player",
  "player",
  "comp",
]);

interface Expansion {
  text: string;
  used: readonly string[];
}

/** 표기 → 펼친 꼴(자리표시자 그대로). [묶음]은 비우거나 수식 하나씩, 같은 수식은 한 줄에 한 번만 */
function expandRaw(src: string): Expansion[] {
  let i = 0;
  const readSeq = (stops: string): Expansion[] => {
    let acc: Expansion[] = [{ text: "", used: [] }];
    const join = (parts: readonly Expansion[]) => {
      const next: Expansion[] = [];
      for (const a of acc)
        for (const b of parts) {
          if (b.used.some((u) => a.used.includes(u))) continue;
          next.push({
            text: `${a.text} ${b.text}`,
            used: [...a.used, ...b.used],
          });
        }
      acc = next;
    };
    while (i < src.length && !stops.includes(src[i]!)) {
      const ch = src[i]!;
      if (ch === " ") {
        i += 1;
        continue;
      }
      if (ch === "[") {
        const start = i + 1;
        let depth = 1;
        i += 1;
        while (depth > 0 && i < src.length) {
          if (src[i] === "[") depth += 1;
          if (src[i] === "]") depth -= 1;
          i += 1;
        }
        const inner = src.slice(start, i - 1);
        const named = GROUP_LINES.find((g) => g.name === inner);
        if (named) {
          const opts: Expansion[] = [{ text: "", used: [] }];
          for (const m of MODIFIERS.filter((x) =>
            x.groups.includes(named.name),
          ))
            for (const e of expandRaw(m.text))
              opts.push({ text: e.text, used: m.keys });
          join(opts);
        } else join([{ text: "", used: [] }, ...expandRaw(inner)]);
        continue;
      }
      if (ch === "(") {
        i += 1;
        const alts: Expansion[] = [];
        for (;;) {
          alts.push(...readSeq("/)"));
          const at = src[i];
          i += 1;
          if (at !== "/") break;
        }
        join(alts);
        continue;
      }
      // 낱말 — 안의 '·'는 그중 하나(자리표시자 사이 '}·{'는 글자 그대로)
      const start = i;
      while (
        i < src.length &&
        !" [(".includes(src[i]!) &&
        !stops.includes(src[i]!)
      )
        i += 1;
      const word = src.slice(start, i);
      join(word.split(/(?<!\})·|·(?!\{)/u).map((c) => ({ text: c, used: [] })));
    }
    return acc.map((a) => ({
      text: a.text.replace(/\s+/gu, " ").trim(),
      used: a.used,
    }));
  };
  return readSeq("");
}

/** 지시문 표기 한 줄('- ' 없이) → 펼친 뼈대 목록. 앞 설명 괄호('(prev가 있을 때만)')와 ' — ' 뒤 설명은 펼치지 않는다 */
export function expandPatternText(text: string): string[] {
  const body = text.replace(/^\((?![^)]*\{)[^)]*\)\s*/u, "").split(" — ")[0]!;
  return expandRaw(body).map((e) => {
    let out = e.text.replace(/\{n\}(?=으로)/gu, "13").replace(/\{n\}/gu, "3");
    for (const [ph, sk] of PLACEHOLDER_SKELETON) out = out.split(ph).join(sk);
    return out;
  });
}
