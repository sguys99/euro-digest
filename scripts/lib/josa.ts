/**
 * 한국어 조사 보정 (M1-21 — PRD FR-24·§9.4, M0-30). 순수 함수 모듈 — I/O 없음.
 *
 * 고유명사를 한글로 바꾼 뒤 받침에 따라 바뀌는 조사(이/가·은/는·을/를·과/와·으로/로 + 서술격 이다·이라·이며 …)를 바로잡는다.
 * M0-30 실측: 모델은 영문 이름 뒤 조사를 들쭉날쭉하게 붙였다('Bayern가'·'Dortmund은') — 한글 이름으로 바꾸면 받침이 정해지므로
 * 그 받침 기준으로 다시 고른다. 템플릿 문장(brief-template.ts)도 이름 뒤 조사를 이 모듈로 붙인다.
 *
 * ── 끝소리(받침) 판정 `finalSound` ─────────────────────────────────────────────
 *   한글 음절: 종성 없음 = none · ㄹ = rieul · 그 밖 = other.
 *   숫자(아라비아): 한국어로 읽은 끝소리 — 1 일(ㄹ)·2 이·3 삼(ㅁ)·4 사·5 오·6 육(ㄱ)·7 칠(ㄹ)·8 팔(ㄹ)·9 구, 0으로 끝나면
 *     0 영·10 십·100 백·1000 천·10000 만 모두 받침(other) — '2-1로'·'3-0으로'·'승점 13으로'·'승점 20으로'.
 *   라틴 문자(사전에 없어 영문 그대로 남은 이름): 약어(대문자 2자 이상·한 글자)는 영어 글자 이름(L 엘·R 알 = ㄹ, M 엠·N 엔 = 받침,
 *     나머지 받침 없음 — 'PSV가'·'UCL은'), 단어는 끝 글자로 어림한다 — l = ㄹ, m·n·ng = 받침, 'ne'·'me'(묵음 e — Kane 케인) = 받침,
 *     그 밖 모음·자음 = 받침 없음(Dortmund 도르트문트·Isak 이삭은 예외로 틀린다 — 사전 등록이 정답, 어림은 마지막 수단).
 *   그 밖(기호·한자 등): unknown — 조사를 고치지 않는다.
 *   끝의 닫는 괄호·따옴표는 건너뛰고 그 앞 글자로 판정한다('브라운(Brown)' 같은 표기는 쓰지 않지만 방어).
 *
 * ── 붙은 조사 고치기 `fixAttachedParticle` ─────────────────────────────────────
 *   이름 바로 뒤(띄어 쓰지 않은) 한글 덩어리 **전체가 정해진 형태일 때만** 고친다 — 덩어리가 다른 말로 이어지면('토트넘다운'의
 *   '다운'·'이번'·'가장') 조사로 보지 않는다(과잉 보정 방지). 바꿀 수 있는 짝(받침 있음 형태, 받침 없음 형태):
 *     이/가 · 은/는 · 을/를(정확히 그 한 글자) · 과/와(+ 의·도·는·만·까지) · 으로/로(ㄹ 받침은 로 — + 서·써·부터·까지·는·도·만·의) ·
 *     서술격·연결형(덩어리 전체) 이다/다 · 이고/고 · 이며/며 · 이자/자 · 이었다/였다 · 이었고/였고 · 이었으며/였으며 · 이었지만/였지만 ·
 *     이었던/였던 · 이었을/였을 ·
 *     이라는/라는 · 이라고/라고 · 이라며/라며 · 이라서/라서 · 이라/라 · 이란/란 · 이나/나 · 이든/든 · 이랑/랑 · 이야/야 · 이지만/지만 ·
 *     이면/면 · 이어서/여서.
 *   의·에·에서·도·만·까지·처럼·보다·전(경기)·다운처럼 받침과 무관한 말은 그대로 둔다. 끝소리를 모르면(unknown) 고치지 않는다.
 */

/** 끝소리 — none 받침 없음 · rieul ㄹ 받침 · other 그 밖 받침 · unknown 판단 불가 */
export type FinalSound = "none" | "rieul" | "other" | "unknown";

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JONG_COUNT = 28;
const JONG_RIEUL = 8;

/** 끝에서 건너뛰는 닫는 괄호·따옴표·마침표 */
const TRAILING_SKIP = new Set([
  ")",
  "]",
  "}",
  "'",
  '"',
  "’",
  "”",
  "」",
  "』",
  ".",
]);

/** 숫자 끝 글자 → 한국어 읽기 끝소리 */
const DIGIT_FINAL: Readonly<Record<string, FinalSound>> = {
  "0": "other", // 영·십·백·천·만 — 0으로 끝나는 수는 모두 받침
  "1": "rieul",
  "2": "none",
  "3": "other",
  "4": "none",
  "5": "none",
  "6": "other",
  "7": "rieul",
  "8": "rieul",
  "9": "none",
};

/** 라틴 약어의 끝 글자 → 영어 글자 이름 끝소리(L 엘·R 알·M 엠·N 엔) */
function letterNameFinal(letter: string): FinalSound {
  const upper = letter.toUpperCase();
  if (upper === "L" || upper === "R") return "rieul";
  if (upper === "M" || upper === "N") return "other";
  return "none";
}

/** 한글 음절 1자의 끝소리 — 음절이 아니면 null */
function syllableFinal(ch: string): FinalSound | null {
  const code = ch.codePointAt(0);
  if (code === undefined || code < HANGUL_BASE || code > HANGUL_LAST) {
    return null;
  }
  const jong = (code - HANGUL_BASE) % JONG_COUNT;
  if (jong === 0) return "none";
  return jong === JONG_RIEUL ? "rieul" : "other";
}

/** 라틴 문자 끝 단어의 끝소리 어림(머리 주석) */
function latinFinal(word: string): FinalSound {
  const letters = word
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z]/g, "");
  if (letters === "") return "unknown";
  const last = letters.at(-1)!;
  // 약어(대문자 2자 이상) 또는 한 글자 → 글자 이름
  if (letters.length === 1 || /^[A-Z]{2,}$/.test(letters)) {
    return letterNameFinal(last);
  }
  const lower = letters.toLowerCase();
  if (lower.endsWith("ng")) return "other";
  if (lower.endsWith("ne") || lower.endsWith("me")) return "other";
  if (last.toLowerCase() === "l") return "rieul";
  if (last.toLowerCase() === "m" || last.toLowerCase() === "n") return "other";
  return "none";
}

/** 단어(이름·숫자)의 끝소리(머리 주석 `finalSound`) */
export function finalSound(word: string): FinalSound {
  const chars = [...word.trimEnd()];
  while (chars.length > 0 && TRAILING_SKIP.has(chars.at(-1)!)) chars.pop();
  const last = chars.at(-1);
  if (last === undefined) return "unknown";
  const syllable = syllableFinal(last);
  if (syllable !== null) return syllable;
  if (/^[0-9]$/.test(last)) return DIGIT_FINAL[last] ?? "unknown";
  if (/\p{Script=Latin}/u.test(last)) {
    // 끝의 라틴 단어만 본다('FC Köln' → 'Köln', 'Mainz 05'는 숫자로 위에서 끝남)
    const tail = /[\p{Script=Latin}\p{M}'’.-]+$/u.exec(chars.join(""));
    return latinFinal(tail ? tail[0] : last);
  }
  return "unknown";
}

// ─── 조사 고르기 ────────────────────────────────────────────────────────────

/** 받침에 따라 바뀌는 조사 짝 — 템플릿이 쓰는 형태 */
export type Particle =
  "이/가" | "은/는" | "을/를" | "과/와" | "으로/로" | "이다/다" | "이라/라";

const PARTICLE_FORMS: Readonly<
  Record<Particle, readonly [consonant: string, vowel: string]>
> = {
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "을/를": ["을", "를"],
  "과/와": ["과", "와"],
  "으로/로": ["으로", "로"],
  "이다/다": ["이다", "다"],
  "이라/라": ["이라", "라"],
};

/** 끝소리 → 짝 중 하나. unknown이면 받침 없는 형태(영문 이름 어림이 이미 끝난 뒤라 드묾 — 기호로 끝나는 이름) */
function pickForm(
  final: FinalSound,
  consonant: string,
  vowel: string,
  isRo: boolean,
): string {
  if (final === "none" || final === "unknown") return vowel;
  if (final === "rieul" && isRo) return vowel; // ㄹ 받침 + 으로/로 → 로
  return consonant;
}

/** 단어 뒤에 붙일 조사(단어는 붙이지 않는다) — `josa("바이에른 뮌헨", "이/가")` = "이" */
export function josa(word: string, particle: Particle): string {
  const [consonant, vowel] = PARTICLE_FORMS[particle];
  return pickForm(finalSound(word), consonant, vowel, particle === "으로/로");
}

/** 단어 + 조사 — `withJosa("도르트문트", "이/가")` = "도르트문트가", `withJosa("2-1", "으로/로")` = "2-1로" */
export function withJosa(word: string, particle: Particle): string {
  return `${word}${josa(word, particle)}`;
}

// ─── 붙은 조사 고치기 ───────────────────────────────────────────────────────

/** 서술격·연결형 짝(받침 있음, 받침 없음) — 덩어리 전체가 이 형태일 때만 */
const COPULA_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["이다", "다"],
  ["이고", "고"],
  ["이며", "며"],
  ["이자", "자"],
  ["이었다", "였다"],
  ["이었고", "였고"],
  ["이었으며", "였으며"],
  ["이었지만", "였지만"],
  ["이었던", "였던"],
  ["이었을", "였을"],
  ["이라는", "라는"],
  ["이라고", "라고"],
  ["이라며", "라며"],
  ["이라서", "라서"],
  ["이라", "라"],
  ["이란", "란"],
  ["이나", "나"],
  ["이든", "든"],
  ["이랑", "랑"],
  ["이야", "야"],
  ["이지만", "지만"],
  ["이면", "면"],
  ["이어서", "여서"],
];

/** 한 글자 조사 짝 — 덩어리가 정확히 그 글자이거나 뒤에 붙을 수 있는 말(`tails`)만 이어질 때 */
const SIMPLE_PAIRS: ReadonlyArray<{
  consonant: string;
  vowel: string;
  tails: readonly string[];
  isRo: boolean;
}> = [
  { consonant: "이", vowel: "가", tails: [], isRo: false },
  { consonant: "은", vowel: "는", tails: [], isRo: false },
  { consonant: "을", vowel: "를", tails: [], isRo: false },
  {
    consonant: "과",
    vowel: "와",
    tails: ["의", "도", "는", "만", "까지"],
    isRo: false,
  },
  {
    consonant: "으로",
    vowel: "로",
    tails: ["서", "써", "부터", "까지", "는", "도", "만", "의"],
    isRo: true,
  },
];

/** 덩어리 첫머리에서 바꿀 수 있는 조사 — [받침 있음, 받침 없음, 덩어리에서 차지한 길이, 으로/로 여부] */
function leadingParticle(
  run: string,
): { consonant: string; vowel: string; length: number; isRo: boolean } | null {
  for (const { consonant, vowel, tails, isRo } of SIMPLE_PAIRS) {
    for (const form of [consonant, vowel]) {
      if (!run.startsWith(form)) continue;
      const rest = run.slice(form.length);
      if (rest === "" || tails.includes(rest)) {
        return { consonant, vowel, length: form.length, isRo };
      }
    }
  }
  for (const [consonant, vowel] of COPULA_PAIRS) {
    if (run === consonant || run === vowel) {
      return { consonant, vowel, length: run.length, isRo: false };
    }
  }
  return null;
}

/**
 * 이름 바로 뒤 텍스트(`following`)의 붙은 조사를 이름(`word`)의 받침에 맞춘다. 고칠 것이 없으면 `following` 그대로.
 * 반환은 고친 뒤의 `following` 전체(머리 주석 `fixAttachedParticle`).
 */
export function fixAttachedParticle(word: string, following: string): string {
  const run = /^[가-힣]+/.exec(following)?.[0];
  if (!run) return following;
  const final = finalSound(word);
  if (final === "unknown") return following;
  const lead = leadingParticle(run);
  if (!lead) return following;
  const form = pickForm(final, lead.consonant, lead.vowel, lead.isRo);
  return `${form}${following.slice(lead.length)}`;
}
