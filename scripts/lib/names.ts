/**
 * 고유명사 한글 표기 (M1-21 — PRD FR-24, D23·D24·D39 ②). 순수 함수 모듈 — I/O 없음(파일 읽기는 호출부).
 *
 * LLM은 고유명사를 영문 그대로 쓰고(브리핑), 코드가 `configs/names.ko.json`으로 한글로 바꾼다(CLAUDE.md §6.2). 같은 사전을
 * 브리핑 템플릿(brief-template.ts)·뉴스 카드 태그 표시(src/lib/data/names.ts)·원제목 키워드(news-keywords.ts — 빅클럽·한국 선수)가 쓴다.
 *
 * ── 맞추기 ────────────────────────────────────────────────────────────────
 *   접기(`foldName`): NFC → 글자마다 발음 기호 제거·소문자·따옴표(’ → ')·대시(– → -)·NBSP → 공백. **글자 수를 바꾸지 않는다** —
 *     접은 텍스트에서 찾은 위치가 원문 위치와 같다(분해·소문자화로 길이가 바뀌는 글자는 원문 그대로 둔다).
 *   치환(`substituteNames`): 사전의 모든 영문 표기(`en` — 대표 + 별칭) + 대회 영문 이름(competitions.json nameEn + 코드 별칭
 *     `COMPETITION_EN_ALIASES`)을 **긴 이름 먼저**·**단어 경계**(앞뒤가 라틴 글자·숫자가 아님 — 한글 조사는 바로 붙어도 된다)로
 *     찾는다. 'Inter Milan'이 'Inter'·'Milan'보다, 'Borussia Dortmund'가 'Dortmund'보다 먼저 맞는다. 바꾼 이름 바로 뒤의 붙은
 *     조사는 한글 이름의 받침으로 고친다(josa.ts — 'Bayern가' → '바이에른 뮌헨이', 'Dortmund은' → '도르트문트는').
 *     대회는 브리핑 단위로 고른 표기(nameKo·shortKo — brief-template.ts `BriefCompForm`)로 바꾼다(D30·D45 ④).
 *   이름 찾기(`lookupName`): 영문 표기 정확히 같음(접기 기준) + 유형 — 템플릿·입력 정리용(부분 일치 없음).
 *
 * ── 브리핑 입력 (M0-30 — 모델 축약 방지) ────────────────────────────────────
 *   `canonicalizeBriefInput`: 득점자·도움(API-Football 원문 'H. Kane'·'Kim Min-Jae')이 사전에 있으면 그 항목의 **대표 영문 표기
 *   (`en[0]`)**로 바꾼다 — 모델이 입력 표기를 그대로 옮기면 사전 키와 같아 치환된다(M0-30: 'M. Olise' → 출력 'Olise'). 팀 이름은
 *   football-data 짧은 이름 그대로 둔다(별칭으로 등록 — 'Bayern'·'Man City'·'Barça', D39 ②). 사전에 없는 이름은 원문 그대로.
 *
 * ── 미등록 이름 (FR-24 — data/cache/unknown-names.json, unknown-names.ts) ────────
 *   데이터 API 이름 = 브리핑 입력의 팀(경기·순위표)·득점자·도움 중 사전에도 무시 목록에도 없는 것(`briefInputNames`).
 *   브리핑 출력 이름 = 치환 뒤에도 남은 라틴 문자 덩어리 중 이름처럼 보이는 것(`unknownNamesInText` — 대회 표기·무시 목록·일반 약어
 *   `GENERIC_LATIN_TOKENS`·라운드 표기·한 글자 제외). 키는 영문 표기 그대로(부록 A 12).
 *
 * ── 영문 토큰 허용 목록 (M1-23 코드 검증용 — `briefNameAllowlist`) ──────────────
 *   입력의 팀·선수·대회 이름 + 그 사전 항목의 모든 영문 표기 + 대회 별칭·라틴 shortKo(EPL·UCL). 접은 문자열 집합.
 */
import type {
  CompetitionConfig,
  CompId,
  NameEntry,
  NameKind,
  NamesKoFile,
} from "@/lib/schema";

import type { BriefInput, BriefInputGoal } from "./brief-input";
import { fixAttachedParticle } from "./josa";

// ─── 접기 ─────────────────────────────────────────────────────────────────

const QUOTE_CHARS = new Set(["‘", "’", "ʼ", "`", "´"]);
const DASH_CHARS = new Set(["‐", "‑", "‒", "–", "—", "―", "−"]);

function foldChar(ch: string): string {
  if (ch.length !== 1) return ch; // 보조 평면 글자(이모지 등) — 그대로(코드 단위 2개 유지)
  if (QUOTE_CHARS.has(ch)) return "'";
  if (DASH_CHARS.has(ch)) return "-";
  if (ch === " ") return " ";
  const base = ch.normalize("NFKD").replace(/\p{M}+/gu, "");
  const pick = base.length === 1 ? base : ch;
  const lower = pick.toLowerCase();
  return lower.length === 1 ? lower : pick;
}

/** 이름 비교용 접기(머리 주석) — 입력을 NFC로 바꾼 뒤 글자마다 접는다. 결과 길이 = NFC 입력 길이 */
export function foldName(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) out += foldChar(ch);
  return out;
}

// ─── 대회 별칭 ─────────────────────────────────────────────────────────────

/**
 * 대회 영문 별칭(코드 표) — competitions.json `nameEn`에 더해 모델·데이터가 쓰는 표기. 바꾸는 값은 그 브리핑의 대회 표기
 * (nameKo·shortKo — D30). 라틴 shortKo(EPL·UCL)는 그 자체가 화면 표기라 별칭이자 허용 토큰이다.
 */
export const COMPETITION_EN_ALIASES: Readonly<
  Record<CompId, readonly string[]>
> = Object.freeze({
  EPL: ["Premier League", "English Premier League", "EPL"],
  LALIGA: ["LaLiga", "La Liga", "LaLiga EA Sports"],
  SERIEA: ["Serie A"],
  BUNDESLIGA: ["Bundesliga"],
  LIGUE1: ["Ligue 1"],
  UCL: ["UEFA Champions League", "Champions League", "UCL"],
});

/** 이름이 아닌 라틴 약어·일반어 — 미등록 이름으로 적재하지 않는다(템플릿도 'PK 결승골'을 쓴다) */
export const GENERIC_LATIN_TOKENS: readonly string[] = Object.freeze([
  "PK",
  "VAR",
  "AI",
  "UEFA", // 대회 표기 'UEFA 챔피언스리그'(nameKo)에 남는 라틴 낱말
  "FIFA",
  "MD",
  "Matchday",
  "League phase",
  "Round",
  "Final",
  "Semi-final",
  "Quarter-final",
  "Leg",
]);

// ─── 색인 ─────────────────────────────────────────────────────────────────

type Target =
  { type: "entry"; entry: NameEntry } | { type: "competition"; comp: CompId };

export interface NameIndex {
  /** 접힌 영문 표기 → 사전 항목 */
  byEn: ReadonlyMap<string, NameEntry>;
  /** 접힌 대회 별칭 → 대회 */
  compByEn: ReadonlyMap<string, CompId>;
  /** 접힌 무시 목록(names.ko `ignore`) */
  ignore: ReadonlySet<string>;
  /** `유형:slug` → 항목 */
  bySlug: ReadonlyMap<string, NameEntry>;
  /** 치환 정규식(접힌 텍스트용, 긴 이름 먼저) — 표기가 하나도 없으면 null */
  matcher: RegExp | null;
  /** 정규식 별칭 → 대상 */
  targets: ReadonlyMap<string, Target>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * 사전(+ 대회 설정) → 색인(순수 함수). 사전이 없으면(null — 읽기 실패) 대회 별칭만. 사전 안의 영문 표기 중복은 스키마가
 * 막지만(대소문자 무시), 접기(악센트)로 겹치면 앞 항목이 이긴다.
 */
export function buildNameIndex(
  file: (Pick<NamesKoFile, "entries"> & { ignore?: readonly string[] }) | null,
  competitions: readonly Pick<CompetitionConfig, "id" | "nameEn">[] = [],
): NameIndex {
  const byEn = new Map<string, NameEntry>();
  const bySlug = new Map<string, NameEntry>();
  const targets = new Map<string, Target>();
  for (const entry of file?.entries ?? []) {
    if (entry.slug !== undefined) {
      const key = `${entry.kind}:${entry.slug}`;
      if (!bySlug.has(key)) bySlug.set(key, entry);
    }
    for (const en of entry.en) {
      const folded = foldName(en);
      if (folded.trim() === "" || byEn.has(folded)) continue;
      byEn.set(folded, entry);
      targets.set(folded, { type: "entry", entry });
    }
  }
  const compByEn = new Map<string, CompId>();
  const compAliases: Array<[string, CompId]> = [];
  for (const c of competitions) compAliases.push([c.nameEn, c.id]);
  for (const [comp, aliases] of Object.entries(COMPETITION_EN_ALIASES) as Array<
    [CompId, readonly string[]]
  >) {
    for (const alias of aliases) compAliases.push([alias, comp]);
  }
  for (const [alias, comp] of compAliases) {
    const folded = foldName(alias);
    if (compByEn.has(folded)) continue;
    compByEn.set(folded, comp);
    // 사전 항목(팀·선수)이 같은 표기를 가지면 사전이 이긴다(대회 이름과 겹치는 이름은 거의 없다)
    if (!targets.has(folded))
      targets.set(folded, { type: "competition", comp });
  }
  const ignore = new Set((file?.ignore ?? []).map(foldName));
  const keys = [...targets.keys()].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const matcher =
    keys.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{Script=Latin}\\p{N}])(?:${keys.map(escapeRegExp).join("|")})(?![\\p{Script=Latin}\\p{N}])`,
          "gu",
        );
  return { byEn, compByEn, ignore, bySlug, matcher, targets };
}

/** 영문 표기(정확히 — 접기 기준) → 사전 항목. `kinds`를 주면 그 유형만 */
export function lookupName(
  index: NameIndex,
  en: string,
  kinds?: readonly NameKind[],
): NameEntry | null {
  const entry = index.byEn.get(foldName(en.trim()));
  if (!entry) return null;
  return kinds && !kinds.includes(entry.kind) ? null : entry;
}

/** 영문 표기 → 한글 표기(없으면 null) */
export function koreanName(
  index: NameIndex,
  en: string,
  kinds?: readonly NameKind[],
): string | null {
  return lookupName(index, en, kinds)?.ko ?? null;
}

/** slug → 한글 표기(태그 표시 — 없으면 null) */
export function koreanNameBySlug(
  index: Pick<NameIndex, "bySlug">,
  kind: NameKind,
  slug: string,
): string | null {
  return index.bySlug.get(`${kind}:${slug}`)?.ko ?? null;
}

/** 사전에 있거나(어떤 유형이든) 무시 목록·대회 별칭에 있는 이름인가 — 미등록 적재·정리 기준 */
export function isKnownName(index: NameIndex, name: string): boolean {
  const folded = foldName(name.trim());
  return (
    index.byEn.has(folded) ||
    index.ignore.has(folded) ||
    index.compByEn.has(folded)
  );
}

/** 사람(선수·감독) 유형 */
export const PERSON_KINDS: readonly NameKind[] = Object.freeze([
  "player",
  "manager",
]);
export const TEAM_KINDS: readonly NameKind[] = Object.freeze(["team"]);

// ─── 치환 ─────────────────────────────────────────────────────────────────

export interface NameReplacement {
  /** 원문 표기(입력 텍스트 그대로) */
  from: string;
  /** 바꾼 표기 */
  to: string;
  kind: NameKind | "competition";
}

export interface SubstituteResult {
  text: string;
  replaced: NameReplacement[];
  /** 받침에 맞춰 고친 붙은 조사 수 */
  particleFixes: number;
}

export interface SubstituteOptions {
  /** 대회 표기(브리핑 단위 — D30·D45 ④). 없으면 대회 이름은 바꾸지 않는다 */
  competitionLabel?: (comp: CompId) => string;
}

/** 텍스트의 영문 고유명사 → 한글(머리 주석 "치환"). 결과는 NFC */
export function substituteNames(
  text: string,
  index: NameIndex,
  options: SubstituteOptions = {},
): SubstituteResult {
  const source = text.normalize("NFC");
  const replaced: NameReplacement[] = [];
  if (index.matcher === null)
    return { text: source, replaced, particleFixes: 0 };
  const folded = foldName(source);
  let out = "";
  let last = 0;
  let particleFixes = 0;
  const matcher = new RegExp(index.matcher.source, index.matcher.flags);
  for (const m of folded.matchAll(matcher)) {
    const start = m.index;
    const end = start + m[0].length;
    if (start < last) continue; // 앞 치환의 조사 자리(한글이라 맞을 수 없지만 방어)
    const target = index.targets.get(m[0]);
    if (!target) continue;
    let to: string;
    let kind: NameReplacement["kind"];
    if (target.type === "entry") {
      to = target.entry.ko;
      kind = target.entry.kind;
    } else {
      if (!options.competitionLabel) continue;
      to = options.competitionLabel(target.comp);
      kind = "competition";
    }
    const from = source.slice(start, end);
    const following = source.slice(end);
    const run = /^[가-힣]+/.exec(following)?.[0] ?? "";
    const fixedRun =
      /^[가-힣]+/.exec(fixAttachedParticle(to, following))?.[0] ?? "";
    if (fixedRun !== run) particleFixes += 1;
    out += source.slice(last, start) + to + fixedRun;
    last = end + run.length;
    replaced.push({ from, to, kind });
  }
  out += source.slice(last);
  return { text: out, replaced, particleFixes };
}

// ─── 남은 영문(미등록 이름) ─────────────────────────────────────────────────

/** 라틴 문자 덩어리(단어 사이 공백 1칸 허용, 이름 속 '.·-·&·/·숫자' 포함) */
const LATIN_SPAN =
  /[\p{Script=Latin}][\p{Script=Latin}\p{M}\p{N}'’.&/-]*(?: (?:[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}'’.&/-]*))*/gu;

/** 텍스트에 남은 라틴 문자 덩어리(끝의 마침표·하이픈 제거) */
export function latinSpans(text: string): string[] {
  return [...text.normalize("NFC").matchAll(LATIN_SPAN)]
    .map((m) => m[0].replace(/[.'’/&-]+$/u, ""))
    .filter((s) => s.length > 0);
}

const GENERIC_FOLDED = new Set(GENERIC_LATIN_TOKENS.map(foldName));

/** 덩어리 속 이름이 아닌 단어 묶음의 최대 길이('League phase'·'UEFA Champions League') */
const NOISE_WINDOW_MAX = 3;

/** 이름 속 소문자 낱말(van Dijk·De Bruyne의 de·dos Santos) — 이 밖의 소문자 단어는 이름이 아니다 */
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  "van",
  "von",
  "de",
  "da",
  "di",
  "der",
  "den",
  "del",
  "la",
  "le",
  "dos",
  "das",
  "du",
  "ter",
  "y",
  "e",
  "el",
  "al",
  "bin",
]);

/** 이름이 아닌 단어 — 숫자·한 글자('세리에 A'의 A — 이니셜 'J.'은 이름의 일부)·서수('43rd')·소문자 일반어('scored') */
function isNoiseWord(word: string): boolean {
  if (/^\d+$/.test(word) || [...word].length < 2) return true;
  if (/^\d+\p{L}/u.test(word)) return true;
  return /^\p{Ll}/u.test(word) && !NAME_PARTICLES.has(word);
}

/**
 * 덩어리를 이름이 아닌 단어(일반 약어·라운드 표기·대회 별칭·숫자·한 글자·소문자 일반어)로 끊어 남은 단어 묶음들
 * ('UCL Matchday 5' → 없음, 'Sabah FK' → 'Sabah FK', 'and Olise scored' → 'Olise'). 긴 묶음부터 지우고, 묶음 끝의 소문자
 * 낱말(van·de)은 뗀다.
 */
function nameChunks(span: string, index: NameIndex): string[] {
  const words = span.split(" ");
  const noise = words.map(isNoiseWord);
  for (let n = Math.min(NOISE_WINDOW_MAX, words.length); n >= 1; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const phrase = words.slice(i, i + n).join(" ");
      const folded = foldName(phrase);
      if (GENERIC_FOLDED.has(folded) || index.compByEn.has(folded)) {
        for (let j = i; j < i + n; j += 1) noise[j] = true;
      }
    }
  }
  const chunks: string[] = [];
  let current: string[] = [];
  words.forEach((w, i) => {
    if (noise[i]) {
      if (current.length > 0) chunks.push(current.join(" "));
      current = [];
    } else current.push(w);
  });
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks
    .map((chunk) => {
      const parts = chunk.split(" ");
      while (parts.length > 0 && NAME_PARTICLES.has(parts[0]!)) parts.shift();
      while (parts.length > 0 && NAME_PARTICLES.has(parts.at(-1)!)) parts.pop();
      return parts.join(" ");
    })
    .filter((chunk) => chunk !== "");
}

/**
 * 치환 뒤 텍스트에 남은 이름 후보(머리 주석 "미등록 이름") — 사전·무시 목록·대회 별칭에 있는 것, 일반 약어·라운드 표기, 숫자·한
 * 글자, 대문자로 시작하는 단어가 없는 묶음은 뺀다. 같은 표기는 한 번.
 */
export function unknownNamesInText(text: string, index: NameIndex): string[] {
  const out: string[] = [];
  for (const span of latinSpans(text)) {
    if (isKnownName(index, span)) continue;
    for (const chunk of nameChunks(span, index)) {
      if (isKnownName(index, chunk)) continue;
      if (!/(?:^|\s)\p{Lu}/u.test(chunk)) continue;
      if (!out.includes(chunk)) out.push(chunk);
    }
  }
  return out;
}

// ─── 브리핑 입력 ───────────────────────────────────────────────────────────

/** 브리핑 입력의 데이터 API 이름(팀 = 경기·순위표, 선수 = 득점자·도움) — 입력 순서, 같은 이름은 한 번 */
export function briefInputNames(
  input: Pick<BriefInput, "matches" | "standings">,
): Array<{ name: string; kind: "team" | "player" }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; kind: "team" | "player" }> = [];
  const add = (name: string | undefined, kind: "team" | "player") => {
    const trimmed = name?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ name: trimmed, kind });
  };
  for (const m of input.matches) {
    add(m.home, "team");
    add(m.away, "team");
  }
  for (const s of input.standings) for (const r of s.rows) add(r.team, "team");
  for (const m of input.matches) {
    for (const g of m.goals ?? []) {
      add(g.player, "player");
      add(g.assist, "player");
    }
  }
  return out;
}

/** 브리핑 입력 이름 중 사전·무시 목록에 없는 것(데이터 API 미등록 이름) */
export function unknownBriefInputNames(
  input: Pick<BriefInput, "matches" | "standings">,
  index: NameIndex,
): Array<{ name: string; kind: "team" | "player" }> {
  return briefInputNames(input).filter((n) => !isKnownName(index, n.name));
}

function canonicalPerson(index: NameIndex, name: string): string {
  return lookupName(index, name, PERSON_KINDS)?.en[0] ?? name;
}

/**
 * 득점자·도움을 사전 대표 영문 표기로(머리 주석 "브리핑 입력"). 순수 함수 — 새 입력과 바꾼 이름 수. 키 순서는 그대로.
 */
export function canonicalizeBriefInput(
  input: BriefInput,
  index: NameIndex,
): { input: BriefInput; replaced: number } {
  let replaced = 0;
  const fix = (name: string): string => {
    const canonical = canonicalPerson(index, name);
    if (canonical !== name) replaced += 1;
    return canonical;
  };
  const matches = input.matches.map((m) => {
    if (m.goals === null) return m;
    const goals = m.goals.map((g): BriefInputGoal => {
      const next: BriefInputGoal = { ...g, player: fix(g.player) };
      if (g.assist !== undefined) next.assist = fix(g.assist);
      return next;
    });
    return { ...m, goals };
  });
  return { input: { ...input, matches }, replaced };
}

/**
 * 영문 토큰 허용 목록(M1-23 — 머리 주석). 입력의 팀·선수 이름과 그 사전 항목의 모든 영문 표기, 입력 대회의 별칭과 라틴 표기를
 * 접은 문자열로 돌려준다. 대회 설정(`competitions`)이 있으면 라틴 shortKo(EPL·UCL)도 넣는다.
 */
export function briefNameAllowlist(
  input: Pick<BriefInput, "matches" | "standings">,
  index: NameIndex,
  competitions: readonly Pick<
    CompetitionConfig,
    "id" | "nameEn" | "shortKo"
  >[] = [],
): Set<string> {
  const allow = new Set<string>();
  for (const { name } of briefInputNames(input)) {
    allow.add(foldName(name));
    for (const en of lookupName(index, name)?.en ?? []) allow.add(foldName(en));
  }
  const comps = new Set<CompId>();
  for (const m of input.matches) {
    const comp =
      index.compByEn.get(foldName(m.comp)) ??
      competitions.find((c) => c.nameEn === m.comp)?.id;
    if (comp) comps.add(comp);
    allow.add(foldName(m.comp));
  }
  for (const [alias, comp] of index.compByEn)
    if (comps.has(comp)) allow.add(alias);
  for (const c of competitions) {
    if (comps.has(c.id) && /\p{Script=Latin}/u.test(c.shortKo)) {
      allow.add(foldName(c.shortKo));
    }
  }
  return allow;
}
