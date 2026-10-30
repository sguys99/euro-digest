/**
 * 이름 접기·영문 표기 → 한글 표기 찾기 (PRD FR-24, D63 ①) — I/O 없는 순수 모듈(타입만 import — zod·fs 없음)
 *
 * 파이프라인(scripts/lib/names.ts — 브리핑 치환·미등록 이름 적재가 다시 내보낸다)과 화면(대회 득점 순위의 선수명, M2-10)이 같은
 * 접기 규칙으로 `configs/names.ko.json`을 찾도록 src/lib에 둔다(publisher-name과 같은 방식).
 *
 * 접기(`foldName`): NFC → 글자마다 발음 기호 제거·소문자·따옴표(’ → ')·대시(– → -)·NBSP → 공백. **글자 수를 바꾸지 않는다**
 * (접은 텍스트에서 찾은 위치가 원문 위치와 같다 — 분해·소문자화로 길이가 바뀌는 글자는 원문 그대로 둔다).
 *
 * 표시 이름(`displayNameIndex` → `koreanDisplayName`): D63 ① — 영문 표기가 사전 별칭과 **정확히 같을 때만**(접기 기준) 한글, 아니면 null
 * (화면은 원어 그대로 + `lang="en"`). 부분 일치·추측 없음. 첫 글자 축약 별칭('H. Kane')은 동명이인 위험이 커서 쓰지 않는다
 * (scripts/lib/names.ts `lookupName`과 같은 규칙).
 */
import type { NameEntry, NameKind } from "@/lib/schema/names";

// 코드 포인트로 둔다 — 화면 글꼴 서브셋 검사(tests/fonts-coverage.test.ts)가 src/ 문자열 리터럴을 화면 문구로 읽는다(이 글자는 화면에 쓰지 않는다)
/** 따옴표 변형 → ' : ‘ ’ ʼ ` ´ */
const QUOTE_CHARS = new Set(
  [0x2018, 0x2019, 0x02bc, 0x0060, 0x00b4].map((c) => String.fromCharCode(c)),
);
/** 대시 변형 → - : ‐ ‑ ‒ – — ― − */
const DASH_CHARS = new Set(
  [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212].map((c) =>
    String.fromCharCode(c),
  ),
);

function foldChar(ch: string): string {
  if (ch.length !== 1) return ch; // 보조 평면 글자(이모지 등) — 그대로(코드 단위 2개 유지)
  if (QUOTE_CHARS.has(ch)) return "'";
  if (DASH_CHARS.has(ch)) return "-";
  if (ch === "\u00a0") return " ";
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

/** `X. 성` 첫 글자 축약 표기인가('H. Kane'·'J. Castrop' — 'Sl. Bratislava'·'1. FC Köln'은 아니다) */
export function isInitialForm(name: string): boolean {
  return /^\p{Lu}\. \S/u.test(name.trim());
}

/** 접힌 영문 표기 → 한글 표기(한 유형) */
export type DisplayNameIndex = ReadonlyMap<string, string>;

/**
 * 사전 항목 → 한 유형(`kind`)의 표시 이름 색인. 같은 접힌 표기가 둘이면 앞 항목(스키마가 대소문자 무시 중복을 막는다).
 * 첫 글자 축약 별칭은 넣지 않는다(머리 주석).
 */
export function displayNameIndex(
  entries: readonly Pick<NameEntry, "ko" | "en" | "kind">[],
  kind: NameKind,
): DisplayNameIndex {
  const index = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    for (const en of entry.en) {
      if (isInitialForm(en)) continue;
      const folded = foldName(en.trim());
      if (folded === "" || index.has(folded)) continue;
      index.set(folded, entry.ko);
    }
  }
  return index;
}

/** 영문 표기 → 한글 표기(정확히 같은 별칭이 없으면 null — 화면은 원어) */
export function koreanDisplayName(
  index: DisplayNameIndex,
  en: string,
): string | null {
  return index.get(foldName(en.trim())) ?? null;
}
