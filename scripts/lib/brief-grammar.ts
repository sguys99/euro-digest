/**
 * 브리핑 닫힌 문법 (M1-23 재설계 — PRD §15 D50, FR-22·FR-29). "오늘의 5줄" 한 줄이 **허용 문형**으로만 이루어졌는지 가린다.
 * 문형 밖의 낱말·술어·수식이 하나라도 있으면 그 줄은 분석되지 않는다(`parseBriefLine` → 분석 0개 — 검사기가 `grammar-unknown`으로
 * 강등). 거부 목록(틀린 표현 목록)은 새 표현이 계속 빠져나가므로(M1-23 리뷰 1·2회차가 찾은 미탐 112 + 160문장) 알아본 꼴만 통과시킨다.
 *
 * 이 모듈은 **문장 구조만** 본다(순수 함수, I/O 없음). 각 슬롯(팀·선수·점수·분·순위 …)이 입력과 맞는지는 brief-check.ts가 분석
 * 결과(`ParsedClause.bag`)로 대조한다. 지시문(configs/prompts/summarize.md v0.2)의 [문형] 목록이 이 문법과 같다 — 문형을 더하거나
 * 빼면 지시문도 고치고 tests/brief-grammar.test.ts(지시문 예문이 모두 분석되는지)를 돌린다.
 *
 * ── 입력 = 뼈대 문자열 ─────────────────────────────────────────────────────
 *   검사기가 찾은 이름(팀·선수·대회 — 영문 원문이든 한글 공식 표기든)을 `⟨i⟩`로 바꾼 줄(`buildSkeleton`). 이름 뒤에 붙은 조사는
 *   그대로 남고, 문법은 조사의 **역할**(이/가·은/는 = 주어, 을/를 = 목적어, 과/와 = 짝, 에 = 상대 …)만 본다 — 받침에 맞는 형태는
 *   names.ts 치환 뒤 josa.ts가 고치므로('Bayern가' → '바이에른 뮌헨이') 영문 원문 단계와 치환 뒤 문장에 같은 문법이 맞는다.
 *   숫자 뒤 조사('2-1로'·'승점 13으로')는 치환이 고치지 않으므로 받침에 맞아야 한다.
 *
 * ── 줄 = 절 1~2개 ─────────────────────────────────────────────────────────
 *   절1 '다.'  |  절1(-고·-며) 절2 '다.'  |  절1(관형 -ㄴ) {팀}은/는 절2(순위) '다.'
 *   절2는 주어를 생략할 수 있다(순위·승점 꼴 — 절1의 주어 팀을 이어받는다). 쉼표는 순위 나열 꼴('A가 승점 n으로 선두, B가 …')에만.
 *
 * ── 절 종류 (`ClauseType`) ─────────────────────────────────────────────────
 *   win     {팀}이 [수식] {상대}를 [수식] [{점수}로] 꺾었다·이겼다·눌렀다·제압했다·완파했다 · {팀}이 [수식] [{점수}로] 이겼다 ·
 *           {팀}이 [수식] [{상대}에] [{점수}] 승리·역전승을 거뒀다 · … [{점수}로] 역전승했다
 *   loss    {팀}이 [수식] [{상대}에] [{점수}로] 졌다·패했다 · … [{점수}] 역전패를 당했다 · … 역전패했다
 *   draw    {팀}과 {상대}가 [수식] [{점수}로] 비겼다 · {팀}이 [수식] {상대}와 [수식] [{점수}로] 비겼다
 *   pens    {팀}이 [수식] {상대}와 [연장까지] {점수}로 맞선 뒤 승부차기에서 {승부차기 점수}로 이겼다
 *   end     {팀}과 {상대}의 [{대회}] [{라운드}] 경기는 [연장까지] {점수}로 끝났다 · … {점수} 무승부로 끝났다
 *   endPens (end 뒤) 승부차기에서 {팀}이 {승부차기 점수}로 이겼다
 *   goal    [{도움}의 도움으로] [{팀}의] {선수}가 [수식] [{분}] 골·선제골·결승골·동점골·만회골·PK 골을 넣었다·터뜨렸다·기록했다 ·
 *           {분}·{분}에 골을 넣었다 · [{분}] 자책골을 기록했다
 *   count   [{팀}의] {선수}가 [{분}·{분}에] {n}골을 넣었다 · 해트트릭을 기록했다 · 멀티골을 기록했다 · {n}골 {m}도움을 기록했다
 *   assist  {선수}가 도움 {n}개를·{n}도움을·도움을 기록했다 · {선수}가 {득점자}의 [{분}] 골을 도왔다
 *   korean  {한국 선수}는 [{상대}전에서] 선발 출전해·{분} 교체 투입돼 {n}분을 뛰었다 · … {n}분을 뛰고 교체됐다 · 결장했다 · 벤치를 지켰다 …
 *   koreanTail (korean 뒤) 득점은 없었다 · 공격포인트는 없었다
 *   rank    [{팀}이] [승점 {n}으로] [{대회}] 선두다·{n}위다·공동 {n}위다·선두를 달렸다·{n}위에 올라 있다
 *   rankList {팀}이 승점 {n}으로 [{대회}] 선두, {팀}이 승점 {m}으로 2위다(묶음 3개까지 — 템플릿 문형)
 *   move    [{팀}은] [{대회}] {p}위에서 {n}위로 올랐다·내려갔다 … (전일 순위 prev가 있을 때만 — 검사기)
 *   keep    [{팀}은] [{대회}] 선두를·{n}위를 지켰다·유지했다(prev가 있을 때만 — 검사기)
 *   gap     [{팀}은] [승점 {n}으로] [{순위}] {상대}에 승점 {d} 앞선·뒤진 {순위}다 · … {상대}보다 승점 {d} 앞섰다·뒤졌다
 *   points  (win·draw 뒤) 승점 3을 챙겼다 · 승점 1씩 나눠 가졌다
 *   결과 절 수식(종류마다 한 번, 순서 자유): {대회}에서 · {대회} 홈경기에서·원정에서·결승에서·8강에서 · 홈에서 · 원정에서 ·
 *   {상대} 원정에서 · 결승에서·4강에서·8강에서·16강에서·플레이오프에서 · 연장 끝에 · 승부차기 끝에·에서 · {선수}의 [{분}] [PK ]결승골로 ·
 *   {선수}의 해트트릭을·{n}골을·멀티골을 앞세워 · {n}골을 주고받은 끝에 · (무승부) {선수}의 [{분}] 동점골로 · (역전승) {점수}로 뒤지다
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
  const plain = (part: string) => part.replace(/[⟨⟩]/gu, "\uFFFD");
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

/** 슬롯 값 — 이름 순번(number)·숫자 쌍·분 목록·낱말 */
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
  return tok(
    escapeRe(text),
    set
      ? (_, bag) =>
          Object.keys(set).some((k) => k in bag) ? null : { ...bag, ...set }
      : undefined,
  );
}

/** 여러 고정 낱말 중 하나 → key에 그 낱말 */
function words(key: string, list: readonly string[]): El {
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
  dat: "에게|에",
  gen: "의",
  none: "",
} as const;

/** 이름 슬롯 — 종류가 맞는 이름 + 조사(역할). 조사 원문은 `${key}P`에 */
function slot(
  key: string,
  kinds: readonly MentionKind[],
  particle: string,
): El {
  return tok(`${MENTION}(${particle})`, (m, bag, cx) => {
    const i = Number(m[1]);
    const kind = cx.kinds[i];
    if (!kind || !kinds.includes(kind) || key in bag) return null;
    return { ...bag, [key]: i, [`${key}P`]: m[2] ?? "" };
  });
}

const team = (key: string, particle: string) => slot(key, ["team"], particle);
const player = (key: string, particle: string) =>
  slot(key, ["player"], particle);
const comp = (key: string, particle: string) => slot(key, ["comp"], particle);

/** 이름 묶음 주어 — 'A가' · 'A와 B가' · 'A·B·C가'(템플릿 공동 순위) → key = 순번 목록 */
function teamGroup(key: string, particle: string): El {
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

/** 한국어 수사(세는 말 앞) */
export const KOREAN_NUMERALS: Readonly<Record<string, number>> = Object.freeze({
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
});
const NUMERAL_WORDS = Object.keys(KOREAN_NUMERALS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** 숫자 뒤 으로/로 — 받침(josa.ts와 같은 규칙: 끝 0·3·6 = 받침, 1·7·8 = ㄹ → 로) */
function roParticleOk(num: string, particle: string): boolean {
  const last = num.at(-1)!;
  const consonant = last === "0" || last === "3" || last === "6";
  return particle === (consonant ? "으로" : "로");
}

/** 점수 'a-b' + 으로/로 → key = [a, b] */
function score(key: string): El {
  return tok("(\\d{1,2})-(\\d{1,2})(으로|로)", (m, bag) => {
    if (key in bag || !roParticleOk(m[2]!, m[3]!)) return null;
    return { ...bag, [key]: [Number(m[1]), Number(m[2])] };
  });
}

/** 조사 없는 점수('2-1 역전승을') */
function bareScore(key: string): El {
  return tok("(\\d{1,2})-(\\d{1,2})", (m, bag) =>
    key in bag ? null : { ...bag, [key]: [Number(m[1]), Number(m[2])] },
  );
}

/** 구간 낱말 — 분과 맞아야 한다(검사기 halfOk). 긴 것 먼저 */
const HALF_WORDS = "전반 추가시간|후반 추가시간|추가시간|전반|후반|연장";

/** 분 — '[전반·후반·연장 ]62분'·'90+2분' → key = "90+2", `${key}H` = 구간 낱말 */
function minute(key: string, tail = ""): El {
  return tok(
    `(?:(${HALF_WORDS}) )?(\\d{1,3}(?:\\+\\d{1,2})?)분${escapeRe(tail)}`,
    (m, bag) => {
      if (key in bag) return null;
      const next: Record<string, BagValue> = { ...bag, [key]: m[2]! };
      if (m[1]) next[`${key}H`] = m[1];
      return next;
    },
  );
}

/** 분 또는 구간 낱말만('후반 결승골'·'추가시간 동점골') — 구간 낱말만이면 `${key}H`만 묶는다 */
function when(key: string): El {
  return alt(
    minute(key),
    tok(`(${HALF_WORDS})`, (m, bag) =>
      key in bag || `${key}H` in bag ? null : { ...bag, [`${key}H`]: m[1]! },
    ),
  );
}

/** 글자를 먹지 않고 값만 묶는다 */
function put(values: Record<string, BagValue>): El {
  return (_, st) =>
    Object.keys(values).some((k) => k in st.bag)
      ? []
      : [{ pos: st.pos, bag: { ...st.bag, ...values } }];
}

/** 분 목록 + '에' — '43분에' · '5분·41분·44분에' · '73분과 76분에' → key = ["5", "41", "44"] */
function minuteList(key: string): El {
  const one = "\\d{1,3}(?:\\+\\d{1,2})?";
  return tok(`(${one})분((?:(?:·|, |과 |와 )${one}분)*)에`, (m, bag) => {
    if (key in bag) return null;
    const rest = [...(m[2] ?? "").matchAll(new RegExp(`(${one})분`, "gu"))].map(
      (x) => x[1]!,
    );
    return { ...bag, [key]: [m[1]!, ...rest] };
  });
}

/** 골 수 — '3골' · '두 골' (+ 뒤 낱말) → key = n */
function goalCount(key: string, tail: string): El {
  return tok(
    `(?:(\\d{1,2})골|(${NUMERAL_WORDS}) 골)${escapeRe(tail)}`,
    (m, bag) => {
      if (key in bag) return null;
      const n = m[1] !== undefined ? Number(m[1]) : KOREAN_NUMERALS[m[2]!]!;
      return { ...bag, [key]: n };
    },
  );
}

/** '승점 n으로' → key = n */
function pointsWith(key: string): El {
  return tok("승점 (\\d{1,3})(으로|로)", (m, bag) => {
    if (key in bag || !roParticleOk(m[1]!, m[2]!)) return null;
    return { ...bag, [key]: Number(m[1]) };
  });
}

/** 순위 낱말 + 뒤 붙는 말 — '선두'·'2위'·'공동 선두'·'공동 3위' → key = 순위(선두 = 1), `${key}T` = 공동 여부 */
function rank(key: string, suffix: string): El {
  return tok(`(공동 )?(?:선두|(\\d{1,2})위)(?:${suffix})`, (m, bag) => {
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

/** 허용 술어(원형 → 활용형). 여기 없는 술어는 문법 밖이다 */
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
  누르다: {
    final: ["눌렀다"],
    conn: ["눌렀고", "누르고", "누르며"],
    adn: ["누른"],
  },
  제압하다: {
    final: ["제압했다"],
    conn: ["제압했고", "제압하고", "제압하며"],
    adn: ["제압한"],
  },
  완파하다: {
    final: ["완파했다"],
    conn: ["완파했고", "완파하고", "완파하며"],
    adn: ["완파한"],
  },
  거두다: {
    final: ["거뒀다", "거두었다"],
    conn: ["거뒀고", "거두고", "거두며", "거두었고"],
    adn: ["거둔"],
  },
  역전승하다: {
    final: ["역전승했다"],
    conn: ["역전승했고", "역전승하고", "역전승하며"],
    adn: ["역전승한"],
  },
  지다: { final: ["졌다"], conn: ["졌고", "지고", "지며"], adn: ["진"] },
  패하다: {
    final: ["패했다"],
    conn: ["패했고", "패하고", "패하며"],
    adn: ["패한"],
  },
  당하다: {
    final: ["당했다"],
    conn: ["당했고", "당하고", "당하며"],
    adn: ["당한"],
  },
  역전패하다: {
    final: ["역전패했다"],
    conn: ["역전패했고", "역전패하고", "역전패하며"],
    adn: ["역전패한"],
  },
  비기다: {
    final: ["비겼다"],
    conn: ["비겼고", "비기고", "비기며"],
    adn: ["비긴"],
  },
  끝나다: { final: ["끝났다"], conn: ["끝났고", "끝나며"] },
  넣다: { final: ["넣었다"], conn: ["넣었고", "넣고", "넣으며"] },
  터뜨리다: { final: ["터뜨렸다"], conn: ["터뜨렸고", "터뜨리고", "터뜨리며"] },
  기록하다: { final: ["기록했다"], conn: ["기록했고", "기록하고", "기록하며"] },
  몰아치다: { final: ["몰아쳤다"], conn: ["몰아쳤고", "몰아치고", "몰아치며"] },
  달성하다: { final: ["달성했다"], conn: ["달성했고", "달성하고", "달성하며"] },
  올리다: { final: ["올렸다"], conn: ["올렸고", "올리고", "올리며"] },
  돕다: { final: ["도왔다"], conn: ["도왔고", "도우며"] },
  뛰다: { final: ["뛰었다"], conn: ["뛰었고", "뛰며", "뛰었으며"] },
  소화하다: { final: ["소화했다"], conn: ["소화했고", "소화하며"] },
  교체되다: {
    final: ["교체됐다", "교체되었다"],
    conn: ["교체됐고", "교체됐으며"],
  },
  "교체 아웃되다": {
    final: ["교체 아웃됐다"],
    conn: ["교체 아웃됐고", "교체 아웃됐으며"],
  },
  투입되다: { final: ["투입됐다"], conn: ["투입됐고", "투입됐으며"] },
  출전하다: { final: ["출전했다"], conn: ["출전했고", "출전하며"] },
  나서다: { final: ["나섰다"], conn: ["나섰고", "나서며"] },
  결장하다: { final: ["결장했다"], conn: ["결장했고", "결장하며"] },
  지키다: { final: ["지켰다"], conn: ["지켰고", "지키며"] },
  않다: { final: ["않았다"], conn: ["않았고"] },
  못하다: { final: ["못했다"], conn: ["못했고"] },
  달리다: {
    final: ["달렸다", "달린다", "달리고 있다"],
    conn: ["달렸고", "달리고", "달리며"],
  },
  오르다: { final: ["올랐다"], conn: ["올랐고", "오르며"] },
  올라서다: { final: ["올라섰다"], conn: ["올라섰고", "올라서며"] },
  상승하다: { final: ["상승했다"], conn: ["상승했고", "상승하며"] },
  내려가다: { final: ["내려갔다"], conn: ["내려갔고", "내려가며"] },
  밀려나다: { final: ["밀려났다"], conn: ["밀려났고", "밀려나며"] },
  떨어지다: { final: ["떨어졌다"], conn: ["떨어졌고", "떨어지며"] },
  하락하다: { final: ["하락했다"], conn: ["하락했고", "하락하며"] },
  유지하다: { final: ["유지했다"], conn: ["유지했고", "유지하며"] },
  앞서다: { final: ["앞섰다"], conn: ["앞섰고", "앞서며"] },
  뒤지다: { final: ["뒤졌다"], conn: ["뒤졌고", "뒤지며"] },
  챙기다: { final: ["챙겼다"], conn: ["챙겼고", "챙기며"] },
  따내다: { final: ["따냈다"], conn: ["따냈고", "따내며"] },
  가지다: { final: ["가졌다"], conn: ["가졌고"] },
  없다: { final: ["없었다"] },
  이다: { final: ["다", "이다"], conn: ["이고", "이며"] },
});

type End = "final" | "conn" | "adn";

/** 술어 — 원형 목록 중 하나의 활용형. key `verb` = 원형, `end` = 활용 종류 */
function pred(
  lemmas: readonly string[],
  ends: readonly End[] = ["final", "conn"],
): El {
  const table = new Map<string, { lemma: string; end: End }>();
  for (const lemma of lemmas) {
    const forms = PREDICATES[lemma];
    if (!forms) throw new Error(`술어 표에 없음: ${lemma}`);
    for (const end of ends) {
      for (const form of forms[end] ?? []) table.set(form, { lemma, end });
    }
  }
  const forms = [...table.keys()].sort((a, b) => b.length - a.length);
  return tok(`(${forms.map(escapeRe).join("|")})`, (m, bag) => {
    if ("verb" in bag) return null;
    const hit = table.get(m[1]!)!;
    return { ...bag, verb: hit.lemma, end: hit.end };
  });
}

/** 순위 뒤 서술격 '다'(이다)·연결 '이고·이며' — rank 슬롯 바로 뒤에 붙는다 */
const RANK_COPULA = "다|이다|이고|이며";

function copulaEnd(m: RegExpExecArray | null, bag: Bag): Bag {
  const tail = m?.[0] ?? "";
  return {
    ...bag,
    verb: "이다",
    end: /(?:이고|이며)$/u.test(tail) ? "conn" : "final",
  };
}

/** 순위 + 서술격(순위 절 끝) — '선두다'·'3위이고' */
function rankCopula(key: string): El {
  return tok(`(공동 )?(?:선두|(\\d{1,2})위)(?:${RANK_COPULA})`, (m, bag) => {
    if (key in bag || "verb" in bag) return null;
    return copulaEnd(m, {
      ...bag,
      [key]: m[2] !== undefined ? Number(m[2]) : 1,
      [`${key}T`]: m[1] !== undefined,
    });
  });
}

// ─── 결과 절 수식 ─────────────────────────────────────────────────────────

const ROUND_WORDS = ["결승", "4강", "8강", "16강", "플레이오프"] as const;

/** 장소 낱말 → 주어 쪽 */
const venueWord = tok("(홈경기에서|홈에서|원정 경기에서|원정에서)", (m, bag) =>
  "venue" in bag
    ? null
    : { ...bag, venue: m[1]!.startsWith("홈") ? "home" : "away" },
);

/** 라운드 낱말 + '에서' */
const roundWord = tok(`(${ROUND_WORDS.join("|")})에서`, (m, bag) =>
  "round" in bag ? null : { ...bag, round: m[1]! },
);

/** {대회}에서 · {대회} 홈경기에서·원정에서 · {대회} 8강에서·결승에서 */
const modComp = alt(
  comp("comp", "에서"),
  seq(comp("comp", P.none), alt(venueWord, roundWord)),
);
/** 홈에서·원정에서 · {상대} 원정에서 */
const modVenue = alt(
  venueWord,
  seq(team("venueTeam", P.none), w("원정에서", { venue: "named" })),
);
const modEt = w("연장 끝에", { et: true });
const modShootout = tok("승부차기(?: 끝에|에서)", (_, bag) =>
  "shootout" in bag ? null : { ...bag, shootout: true },
);
/** {선수}의 [{분}] [PK ]결승골로 */
function decisiveTail(ending: string): El {
  return tok(`(PK )?결승골${ending}`, (m, bag) =>
    "scorerKind" in bag
      ? null
      : { ...bag, scorerKind: "decisive", scorerPk: m[1] !== undefined },
  );
}
const modScorer = alt(
  seq(player("scorer", P.gen), opt(when("scorerMin")), decisiveTail("로")),
  // {분} {선수}의 결승골로
  seq(minute("scorerMin"), player("scorer", P.gen), decisiveTail("로")),
);
/** 해트트릭을·멀티골을·{n}골을 + 앞세워·앞세운 — 수식(앞세워)은 '해트트릭으로'·'멀티골로'·'{n}골로'도 */
function featTail(ending: "앞세워" | "앞세운"): El {
  const short = ending === "앞세워" ? "|으로|로" : "";
  return alt(
    tok(`(해트트릭|멀티골)(?:을 ${ending}${short})`, (m, bag) =>
      "featKind" in bag
        ? null
        : { ...bag, featKind: m[1] === "해트트릭" ? "hat" : "multi" },
    ),
    seq(goalCount("featN", `을 ${ending}`), put({ featKind: "n" })),
    ...(ending === "앞세워"
      ? [seq(goalCount("featN", "로"), put({ featKind: "n" }))]
      : []),
  );
}
/** {선수}의 해트트릭을·{n}골을·멀티골을 앞세워 · {선수}의 해트트릭으로 */
const modFeat = seq(player("feat", P.gen), featTail("앞세워"));
/** {n}골을 주고받은 끝에(두 팀 골 합 — D40 ②) */
const modTotal = seq(goalCount("total", "을"), w("주고받은 끝에"));
/** (무승부) {선수}의 [{분}] [PK ]동점골로 */
const equaliserTail = tok("(PK )?동점골로", (m, bag) =>
  "eqPk" in bag ? null : { ...bag, eqPk: m[1] !== undefined },
);
const modEqualiser = alt(
  seq(player("eq", P.gen), opt(when("eqMin")), equaliserTail),
  seq(minute("eqMin"), player("eq", P.gen), equaliserTail),
);
/** (역전승) {점수}로 뒤지다 */
const modTrail = seq(score("trail"), w("뒤지다"));

const WIN_MODS = [
  modComp,
  modVenue,
  roundWord,
  modEt,
  modShootout,
  modScorer,
  modFeat,
  modTotal,
];
const COMEBACK_MODS = [...WIN_MODS, modTrail];
const LOSS_MODS = [modComp, modVenue, roundWord, modEt, modShootout, modTotal];
const DRAW_PAIR_MODS = [modComp, roundWord, modEt, modTotal];
const DRAW_MODS = [modComp, modVenue, roundWord, modEt, modEqualiser, modTotal];
const PENS_MODS = [modComp, modVenue, roundWord];

// ─── 절 ──────────────────────────────────────────────────────────────────

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
  | "gap"
  | "points";

/** 주어 자리 — explicit 이름 주어 · none 생략(절2·관형절) */
type Subject = "explicit" | "none";

const subjectTeam = (mode: Subject): El =>
  mode === "explicit" ? team("subj", P.subj) : (_, st) => [st];

const WIN_OBJECT_VERBS = ["꺾다", "이기다", "누르다", "제압하다", "완파하다"];

/** 점수('2-1로') 또는 점수 차('한 골 차로' — D40 ② 파생) */
const scoreOrMargin = opt(alt(score("score"), goalCount("margin", " 차로")));

/** 앞세운 주어 — '{선수}의 [{분}] 결승골을 앞세운 {팀}이' · '{선수}의 해트트릭을 앞세운 {팀}이' */
const winPrefix = alt(
  seq(
    player("scorer", P.gen),
    opt(when("scorerMin")),
    decisiveTail("을 앞세운"),
  ),
  seq(player("feat", P.gen), featTail("앞세운")),
);

function winClause(mode: Subject, ends: readonly End[]): El {
  const s =
    mode === "explicit"
      ? alt(
          seq(winPrefix, team("subj", P.subj)),
          // {선수}의 결승골로·해트트릭으로 {팀}이 …
          seq(mods([modScorer, modFeat]), team("subj", P.subj)),
        )
      : subjectTeam(mode);
  return alt(
    // {팀}이 [수식] {상대}를 [수식] [{점수}로] 꺾었다
    seq(
      s,
      mods(WIN_MODS),
      team("obj", P.obj),
      mods(WIN_MODS),
      scoreOrMargin,
      pred(WIN_OBJECT_VERBS, ends),
    ),
    // {팀}이 [수식] [{상대}에] [{점수}로] 이겼다(상대 생략 — 장소 수식 또는 근거 경기)
    seq(
      s,
      mods(WIN_MODS),
      opt(team("obj", P.dat)),
      mods(WIN_MODS),
      scoreOrMargin,
      pred(["이기다"], ends),
    ),
    // {팀}이 [수식] [{상대}에 | {상대}를 상대로] [수식] [{점수}] 승리를·역전승을 거뒀다
    seq(
      s,
      mods(COMEBACK_MODS),
      opt(alt(team("obj", P.dat), seq(team("obj", P.obj), w("상대로")))),
      mods(COMEBACK_MODS),
      opt(bareScore("score")),
      tok("(승리|역전승)(?:을|를)", (m, bag) =>
        "kind" in bag ? null : { ...bag, kind: m[1]! },
      ),
      pred(["거두다"], ends),
    ),
    // … [{점수}로] 역전승했다
    seq(
      s,
      mods(COMEBACK_MODS),
      opt(alt(team("obj", P.dat), seq(team("obj", P.obj), w("상대로")))),
      mods(COMEBACK_MODS),
      opt(score("score")),
      pred(["역전승하다"], ends),
    ),
  );
}

function lossClause(mode: Subject, ends: readonly End[]): El {
  const s = subjectTeam(mode);
  return alt(
    seq(
      s,
      mods(LOSS_MODS),
      opt(team("obj", P.dat)),
      mods(LOSS_MODS),
      scoreOrMargin,
      pred(["지다", "패하다"], ends),
    ),
    seq(
      s,
      mods(LOSS_MODS),
      opt(team("obj", P.dat)),
      mods(LOSS_MODS),
      opt(bareScore("score")),
      w("역전패를", { kind: "역전패" }),
      pred(["당하다"], ends),
    ),
    seq(
      s,
      mods(LOSS_MODS),
      opt(team("obj", P.dat)),
      mods(LOSS_MODS),
      opt(score("score")),
      pred(["역전패하다"], ends),
    ),
  );
}

function drawClause(mode: Subject, ends: readonly End[]): El {
  const single = seq(
    mode === "explicit"
      ? seq(mods([modEqualiser]), team("subj", P.subj))
      : subjectTeam(mode),
    mods(DRAW_MODS),
    opt(team("obj", P.with)),
    mods(DRAW_MODS),
    opt(score("score")),
    pred(["비기다"], ends),
  );
  if (mode === "none") return single;
  return alt(
    // {팀}과 {상대}가 [수식] [{점수}로] 비겼다
    seq(
      team("subj", P.with),
      team("subj2", P.subj),
      mods(DRAW_PAIR_MODS),
      opt(score("score")),
      pred(["비기다"], ends),
    ),
    single,
  );
}

/** {팀}이 [수식] {상대}와 [연장까지] {점수}로 맞선 뒤 승부차기에서 {점수}로 이겼다 */
const pensClause = seq(
  team("subj", P.subj),
  mods(PENS_MODS),
  team("obj", P.with),
  opt(w("연장까지", { etUntil: true })),
  score("score"),
  w("맞선 뒤 승부차기에서"),
  score("pens"),
  pred(["이기다"]),
);

/** {팀}과 {상대}의 [{대회}] [{라운드}] 경기는 [연장까지] {점수}로 끝났다 · {점수} 무승부로 끝났다 */
const endClause = seq(
  team("subj", P.with),
  team("subj2", P.gen),
  opt(comp("comp", P.none)),
  opt(words("round", ROUND_WORDS)),
  w("경기는"),
  alt(
    seq(
      opt(w("연장까지", { etUntil: true })),
      score("score"),
      pred(["끝나다"]),
    ),
    seq(
      bareScore("score"),
      w("무승부로", { drawWord: true }),
      pred(["끝나다"]),
    ),
  ),
);

/** (end 뒤) 승부차기에서 {팀}이 {점수}로 이겼다 */
const endPensClause = seq(
  w("승부차기에서"),
  team("subj", P.subj),
  score("pens"),
  pred(["이기다"], ["final"]),
);

/** 득점 절 수식 — {도움}의 도움으로·도움을 받아 · {상대}전에서 · {상대}를 상대로 */
const modAssistBy = seq(player("assistBy", P.gen), tok("도움으로|도움을 받아"));
const modOpponent = alt(
  team("opp", "전에서"),
  seq(team("opp", P.obj), w("상대로")),
);

const GOAL_NOUNS = "골|선제골|결승골|동점골|만회골";

/** 득점 절 머리 — [{도움}의 도움으로 | {도움}의 도움을 받은] [{팀}의] {선수}가 */
const goalHead = seq(
  opt(seq(player("assistBy", P.gen), tok("도움으로|도움을 받은"))),
  opt(team("team", P.gen)),
  player("subj", P.subj),
);

const goalClause = seq(
  goalHead,
  mods([modAssistBy, modOpponent]),
  alt(
    // [{분}] 골·선제골·결승골·동점골·만회골을 넣었다 · PK 골
    seq(
      opt(when("min")),
      tok(`(PK )?(${GOAL_NOUNS})(?:을|를)`, (m, bag) => ({
        ...bag,
        noun: m[2]!,
        pk: m[1] !== undefined,
      })),
      pred(["넣다", "터뜨리다", "기록하다"]),
    ),
    // {분}·{분}에 골을 넣었다
    seq(
      minuteList("mins"),
      w("골을", { noun: "골" }),
      pred(["넣다", "터뜨리다"]),
    ),
    // [{분}] 자책골을 기록했다
    seq(
      opt(minute("min")),
      w("자책골을", { noun: "자책골" }),
      pred(["기록하다"]),
    ),
  ),
);

const countClause = seq(
  opt(team("team", P.gen)),
  player("subj", P.subj),
  mods([modOpponent]),
  opt(minuteList("mins")),
  alt(
    seq(
      goalCount("n", "을"),
      pred(["넣다", "터뜨리다", "기록하다", "몰아치다"]),
    ),
    seq(w("해트트릭을", { feat: "hat" }), pred(["기록하다", "달성하다"])),
    seq(w("멀티골을", { feat: "multi" }), pred(["기록하다", "터뜨리다"])),
    seq(
      tok("(\\d{1,2})골 (\\d{1,2})도움을", (m, bag) => ({
        ...bag,
        n: Number(m[1]),
        assists: Number(m[2]),
      })),
      pred(["기록하다", "올리다"]),
    ),
  ),
);

const assistClause = seq(
  opt(team("team", P.gen)),
  player("subj", P.subj),
  mods([modOpponent]),
  alt(
    seq(
      tok("도움 (\\d{1,2})개를|(\\d{1,2})도움을|도움을", (m, bag) => ({
        ...bag,
        assists:
          m[1] !== undefined
            ? Number(m[1])
            : m[2] !== undefined
              ? Number(m[2])
              : -1,
      })),
      pred(["기록하다", "올리다"]),
    ),
    seq(
      player("target", P.gen),
      opt(when("min")),
      tok(`(${GOAL_NOUNS})(?:을|를)`, (m, bag) => ({ ...bag, noun: m[1]! })),
      pred(["돕다"]),
    ),
  ),
);

/** 한국 선수 출전 꼴 — 선발·교체 */
const START_WORDS = "선발 출전해|선발로 출전해|선발로 나서|선발로 나와";

const appearance = alt(
  tok(START_WORDS, (_, bag) => ({ ...bag, app: "start" })),
  seq(
    team("kTeam", P.none),
    tok("선발로 (?:출전해|나서|나와)", (_, bag) => ({ ...bag, app: "start" })),
  ),
  seq(
    opt(when("subOn")),
    tok("교체 투입돼|교체 투입되어", (_, bag) => ({ ...bag, app: "sub" })),
  ),
  tok("교체로 (?:나서|나와|들어가)", (_, bag) => ({ ...bag, app: "sub" })),
);

/** 한국 선수 경기 수식 — {상대}전에서 · {팀}의 {상대}전에서 · {상대}와의 경기에서 */
const koreanMatch = alt(
  team("kOpp", "전에서|전에"),
  seq(team("kTeam", P.gen), team("kOpp", "전에서")),
  seq(team("kOpp", "과의|와의"), w("경기에서")),
);

const minutesPlayed = tok("(\\d{1,3})분을", (m, bag) =>
  "minutes" in bag ? null : { ...bag, minutes: Number(m[1]) },
);

const koreanClause = seq(
  player("subj", P.subj),
  opt(koreanMatch),
  alt(
    // [선발 출전해·{분} 교체 투입돼] {n}분을 뛰었다·소화했다
    seq(opt(appearance), minutesPlayed, pred(["뛰다", "소화하다"])),
    // … {n}분을 뛰고 교체됐다 · 뛴 뒤 교체됐다
    seq(
      appearance,
      minutesPlayed,
      tok("뛰고|소화하고|뛴 뒤|소화한 뒤", (_, bag) => ({
        ...bag,
        subOff: true,
      })),
      pred(["교체되다", "교체 아웃되다"]),
    ),
    // … [{구간}] {분}까지 뛰었다 · {분}까지 뛰고 교체됐다
    seq(
      appearance,
      minute("subOffMin", "까지"),
      alt(
        pred(["뛰다", "소화하다"]),
        seq(tok("뛰고|뛴 뒤"), pred(["교체되다", "교체 아웃되다"])),
      ),
    ),
    // [선발 출전해] 풀타임을 뛰었다
    seq(
      opt(tok(START_WORDS, (_, bag) => ({ ...bag, app: "start" }))),
      w("풀타임을", { full: true }),
      pred(["뛰다", "소화하다"]),
    ),
    // 선발 출전했다 · 선발로 나섰다
    seq(
      tok("선발로|선발", (_, bag) => ({ ...bag, app: "start" })),
      pred(["출전하다", "나서다"]),
    ),
    // [{분}] 교체 투입됐다
    seq(opt(minute("subOn")), w("교체", { app: "sub" }), pred(["투입되다"])),
    // 결장했다 · 벤치를 지켰다 · 출전하지 않았다·못했다
    seq(
      (_, st) => [{ ...st, bag: { ...st.bag, app: "bench" } }],
      alt(
        pred(["결장하다"]),
        seq(w("벤치를"), pred(["지키다"])),
        seq(w("출전하지"), pred(["않다", "못하다"])),
      ),
    ),
  ),
);

/** (korean 뒤) 득점은 없었다 · 공격포인트는 없었다 */
const koreanTailClause = seq(
  tok("(득점은|공격포인트는)", (m, bag) => ({ ...bag, tail: m[1]! })),
  pred(["없다"], ["final"]),
);

// ─── 순위 절 ──────────────────────────────────────────────────────────────

/** 순위 절 주어 — 생략(절2·관형절) 또는 이름 묶음 */
const rankSubject = (mode: Subject): El =>
  mode === "explicit" ? teamGroup("subj", P.subj) : (_, st) => [st];

function rankClause(mode: Subject): El {
  const s = rankSubject(mode);
  return seq(
    s,
    opt(pointsWith("pts")),
    opt(comp("comp", P.none)),
    alt(
      rankCopula("rank"),
      seq(rank("rank", "을|를"), pred(["달리다"])),
      seq(rank("rank", "에"), w("올라 있다", { verb: "이다", end: "final" })),
    ),
  );
}

/** 템플릿 순위 나열 — {팀}이 승점 n으로 [{대회}] 선두, {팀}이 승점 m으로 2위[, …]다 */
function rankPhrase(i: number, withComp: boolean, last: boolean): El {
  return seq(
    teamGroup(`g${i}`, P.subj),
    pointsWith(`pts${i}`),
    withComp ? opt(comp("comp", P.none)) : (_, st) => [st],
    last ? rankCopula(`rank${i}`) : seq(rank(`rank${i}`, ""), tok(",")),
  );
}

const rankListClause = alt(
  seq(rankPhrase(1, true, false), rankPhrase(2, false, true)),
  seq(
    rankPhrase(1, true, false),
    rankPhrase(2, false, false),
    rankPhrase(3, false, true),
  ),
);

const MOVE_VERBS = [
  "오르다",
  "올라서다",
  "상승하다",
  "내려가다",
  "밀려나다",
  "떨어지다",
  "하락하다",
];

/** [{팀}은] [승점 n으로] [{대회}] [{p}위에서] {n}위로·선두로 올랐다 */
function moveClause(mode: Subject): El {
  return seq(
    subjectTeam(mode),
    opt(pointsWith("pts")),
    opt(comp("comp", P.none)),
    opt(tok("(\\d{1,2})위에서", (m, bag) => ({ ...bag, from: Number(m[1]) }))),
    tok("(?:(\\d{1,2})위|선두)로", (m, bag) => ({
      ...bag,
      to: m[1] !== undefined ? Number(m[1]) : 1,
    })),
    pred(MOVE_VERBS),
  );
}

/** [{팀}은] [승점 n으로] [{대회}] 선두를·{n}위를 지켰다·유지했다 */
function keepClause(mode: Subject): El {
  return seq(
    subjectTeam(mode),
    opt(pointsWith("pts")),
    opt(comp("comp", P.none)),
    rank("rank", "을|를"),
    pred(["지키다", "유지하다"]),
  );
}

/** [{팀}은] [승점 n으로] [{순위}] {상대}에·보다 승점 d 앞선·뒤진 [{대회}] {순위}다 · … 앞섰다·뒤졌다 */
function gapClause(mode: Subject): El {
  return seq(
    subjectTeam(mode),
    opt(pointsWith("pts")),
    opt(rank("otherRank", "")),
    team("other", "에|보다"),
    tok("승점 (\\d{1,3})", (m, bag) => ({ ...bag, gap: Number(m[1]) })),
    alt(
      seq(
        tok("(앞선|뒤진)", (m, bag) => ({
          ...bag,
          dir: m[1] === "앞선" ? "ahead" : "behind",
        })),
        opt(comp("comp", P.none)),
        rankCopula("rank"),
      ),
      seq(pred(["앞서다", "뒤지다"]), (_, st) => [
        {
          ...st,
          bag: {
            ...st.bag,
            dir: st.bag.verb === "앞서다" ? "ahead" : "behind",
          },
        },
      ]),
    ),
  );
}

/** (win·draw 뒤) 승점 3을 챙겼다·따냈다 · 승점 1씩 나눠 가졌다 */
const pointsClause = alt(
  seq(w("승점 3을", { gained: 3 }), pred(["챙기다", "따내다"], ["final"])),
  seq(
    tok("승점 1(?:씩|을) 나눠|승점을 나눠", (_, bag) => ({
      ...bag,
      gained: 1,
    })),
    pred(["가지다"], ["final"]),
  ),
);

// ─── 줄 ──────────────────────────────────────────────────────────────────

export interface ParsedClause {
  type: ClauseType;
  bag: Bag;
}

/** 분석 하나 — 절 1~2개. 관형 앞절('…를 꺾은 {팀}은 …')이면 adnSubject = 그 팀 이름 순번 */
export interface LineParse {
  clauses: ParsedClause[];
  adnSubject?: number;
}

interface ClauseDef {
  type: ClauseType;
  el: El;
}

/** 절1 — 이름 주어가 있는 절 */
const FIRST: readonly ClauseDef[] = [
  { type: "win", el: winClause("explicit", ["final", "conn"]) },
  { type: "loss", el: lossClause("explicit", ["final", "conn"]) },
  { type: "draw", el: drawClause("explicit", ["final", "conn"]) },
  { type: "pens", el: pensClause },
  { type: "end", el: endClause },
  { type: "goal", el: goalClause },
  { type: "count", el: countClause },
  { type: "assist", el: assistClause },
  { type: "korean", el: koreanClause },
  { type: "rank", el: rankClause("explicit") },
  { type: "rankList", el: rankListClause },
  { type: "move", el: moveClause("explicit") },
  { type: "keep", el: keepClause("explicit") },
  { type: "gap", el: gapClause("explicit") },
];

/** 절2 — 절1과 같은 꼴 + 주어 생략 순위 꼴 + 이어 쓰는 꼬리 */
const SECOND: readonly ClauseDef[] = [
  ...FIRST.filter((c) => c.type !== "rankList"),
  { type: "rank", el: rankClause("none") },
  { type: "move", el: moveClause("none") },
  { type: "keep", el: keepClause("none") },
  { type: "gap", el: gapClause("none") },
  { type: "points", el: pointsClause },
  { type: "koreanTail", el: koreanTailClause },
  { type: "endPens", el: endPensClause },
];

/** 관형 앞절 — '{상대}를 3-0으로 꺾은'·'{상대}에 1-2로 진'·'{상대}와 1-1로 비긴' */
const ADNOMINAL: readonly ClauseDef[] = [
  { type: "win", el: winClause("none", ["adn"]) },
  { type: "loss", el: lossClause("none", ["adn"]) },
  { type: "draw", el: drawClause("none", ["adn"]) },
];

/** 관형절 뒤 절2 — 주어 생략 순위 꼴 */
const ADNOMINAL_TAIL: readonly ClauseDef[] = [
  { type: "rank", el: rankClause("none") },
  { type: "move", el: moveClause("none") },
  { type: "keep", el: keepClause("none") },
  { type: "gap", el: gapClause("none") },
];

const adnominalSubject = team("adnSubject", P.subj);

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
  const tails = (
    defs: readonly ClauseDef[],
    from: State,
  ): Array<[ClauseDef, State]> =>
    defs.flatMap((d) =>
      d
        .el(cx, { pos: from.pos, bag: {} })
        .map((st) => [d, st] as [ClauseDef, State]),
    );
  for (const first of FIRST) {
    for (const st of first.el(cx, start)) {
      const c1: ParsedClause = { type: first.type, bag: st.bag };
      if (st.bag.end === "final") {
        if (atLineEnd(skeleton, st.pos)) parses.push({ clauses: [c1] });
        continue;
      }
      if (st.bag.end !== "conn") continue;
      for (const [second, st2] of tails(SECOND, st)) {
        if (st2.bag.end === "final" && atLineEnd(skeleton, st2.pos))
          parses.push({ clauses: [c1, { type: second.type, bag: st2.bag }] });
      }
    }
  }
  for (const adn of ADNOMINAL) {
    for (const st of adn.el(cx, start)) {
      if (st.bag.end !== "adn") continue;
      for (const sj of adnominalSubject(cx, { pos: st.pos, bag: {} })) {
        for (const [second, st2] of tails(ADNOMINAL_TAIL, sj)) {
          if (st2.bag.end !== "final" || !atLineEnd(skeleton, st2.pos))
            continue;
          parses.push({
            clauses: [
              { type: adn.type, bag: st.bag },
              { type: second.type, bag: st2.bag },
            ],
            adnSubject: sj.bag.adnSubject as number,
          });
        }
      }
    }
  }
  return { parses, furthest: cx.furthest };
}
