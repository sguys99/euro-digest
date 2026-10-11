/**
 * WOFF2 최소 읽기 — 폰트 테스트(tests/fonts.test.ts·fonts-coverage.test.ts)가 public/fonts의 실제 파일을 검사하려고 쓴다 (D0-11).
 * 새 의존성 없이 Node 내장 brotli(zlib)로 압축을 풀고 cmap·head·hhea·hmtx·OS/2·name 테이블만 읽는다.
 * 파일 이름이 *.test.ts가 아니므로 Vitest가 테스트로 실행하지 않는다. 앱 번들에는 들어가지 않는다.
 *
 * 범위(일부러 좁힘)
 * - 단일 폰트만(`ttcf` 컬렉션 불가). glyf·loca 변환은 읽지 않으므로 상관없고, hmtx가 변환돼 있으면 오류로 알린다
 *   (fontTools 기본 woff2 압축은 glyf·loca만 변환한다).
 * - cmap은 (3,10) 형식 12 → (3,1)·(0,*) 형식 4 순서로 하나를 고른다.
 * 규격: https://www.w3.org/TR/WOFF2/ · https://learn.microsoft.com/typography/opentype/spec/
 */
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

/** WOFF2 §5.1 알려진 테이블 태그(플래그 하위 6비트 0~62). 63은 태그 4바이트가 뒤따른다 */
// prettier-ignore
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
] as const;

const WOFF2_SIGNATURE = 0x774f4632; // "wOF2"
const HEADER_SIZE = 48;

export interface NameRecord {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  value: string;
}

export interface Woff2Font {
  /** 압축을 푼 테이블(변환되지 않은 것만 그대로 쓸 수 있다) */
  tables: ReadonlyMap<string, Buffer>;
  unitsPerEm: number;
  hhea: { ascent: number; descent: number; lineGap: number };
  /** OS/2 usWeightClass */
  weightClass: number;
  /** OS/2 fsSelection USE_TYPO_METRICS(비트 7) */
  useTypoMetrics: boolean;
  /** 코드포인트 → 글리프 번호 */
  cmap: ReadonlyMap<number, number>;
  /** 글리프 번호 → 가로 폭(폰트 단위) */
  advanceOf(glyphId: number): number;
  names: readonly NameRecord[];
}

/** WOFF2 UIntBase128(1~5바이트, 앞자리 0 금지) */
function readUIntBase128(
  buf: Buffer,
  at: number,
): [value: number, next: number] {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf.readUInt8(at + i);
    if (i === 0 && byte === 0x80) throw new Error("UIntBase128: 앞자리 0");
    if (value > 0x1ffffff) throw new Error("UIntBase128: 32비트 초과");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, at + i + 1];
  }
  throw new Error("UIntBase128: 5바이트 초과");
}

/** 테이블 디렉터리를 읽고 압축 데이터를 풀어 테이블별로 자른다 */
function readTables(buf: Buffer): Map<string, Buffer> {
  if (buf.length < HEADER_SIZE || buf.readUInt32BE(0) !== WOFF2_SIGNATURE) {
    throw new Error("WOFF2 서명(wOF2)이 아님");
  }
  if (buf.readUInt32BE(4) === 0x74746366) {
    throw new Error("폰트 컬렉션(ttcf)은 읽지 않음");
  }
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);

  let at = HEADER_SIZE;
  const entries: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf.readUInt8(at);
    at += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >> 6;
    let tag: string;
    if (tagIndex === 63) {
      tag = buf.toString("latin1", at, at + 4);
      at += 4;
    } else {
      const known = KNOWN_TAGS[tagIndex];
      if (known === undefined)
        throw new Error(`알 수 없는 태그 번호 ${tagIndex}`);
      tag = known;
    }
    let origLength: number;
    [origLength, at] = readUIntBase128(buf, at);
    // glyf·loca는 변환 번호 3이 '변환 없음', 나머지 테이블은 0이 '변환 없음'(WOFF2 §5.1)
    const transformed =
      tag === "glyf" || tag === "loca"
        ? transformVersion !== 3
        : transformVersion !== 0;
    let length = origLength;
    if (transformed) [length, at] = readUIntBase128(buf, at);
    entries.push({ tag, length, transformed });
  }

  const data = brotliDecompressSync(buf.subarray(at, at + totalCompressedSize));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const entry of entries) {
    // 변환된 테이블(glyf·loca 등)은 원래 형식이 아니라서 넣지 않는다 — 이 모듈은 읽지 않는다
    if (!entry.transformed) {
      tables.set(entry.tag, data.subarray(offset, offset + entry.length));
    }
    offset += entry.length;
  }
  if (offset !== data.length) {
    throw new Error(
      `테이블 길이 합(${offset}) ≠ 압축 해제 크기(${data.length})`,
    );
  }
  return tables;
}

function requireTable(tables: Map<string, Buffer>, tag: string): Buffer {
  const table = tables.get(tag);
  if (!table) throw new Error(`${tag} 테이블이 없거나 변환돼 있음`);
  return table;
}

/** cmap 형식 4(BMP) */
function readCmapFormat4(
  t: Buffer,
  at: number,
  out: Map<number, number>,
): void {
  const segCount = t.readUInt16BE(at + 6) / 2;
  const endAt = at + 14;
  const startAt = endAt + segCount * 2 + 2;
  const deltaAt = startAt + segCount * 2;
  const rangeAt = deltaAt + segCount * 2;
  for (let s = 0; s < segCount; s += 1) {
    const end = t.readUInt16BE(endAt + s * 2);
    const start = t.readUInt16BE(startAt + s * 2);
    const delta = t.readInt16BE(deltaAt + s * 2);
    const rangeOffset = t.readUInt16BE(rangeAt + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const glyphAt = rangeAt + s * 2 + rangeOffset + (c - start) * 2;
        const raw = t.readUInt16BE(glyphAt);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.set(c, glyph);
    }
  }
}

/** cmap 형식 12(전체 유니코드) */
function readCmapFormat12(
  t: Buffer,
  at: number,
  out: Map<number, number>,
): void {
  const groups = t.readUInt32BE(at + 12);
  for (let g = 0; g < groups; g += 1) {
    const base = at + 16 + g * 12;
    const start = t.readUInt32BE(base);
    const end = t.readUInt32BE(base + 4);
    const glyph = t.readUInt32BE(base + 8);
    for (let c = start; c <= end; c += 1) out.set(c, glyph + (c - start));
  }
}

function readCmap(t: Buffer): Map<number, number> {
  const count = t.readUInt16BE(2);
  const subtables: { platform: number; encoding: number; offset: number }[] =
    [];
  for (let i = 0; i < count; i += 1) {
    const base = 4 + i * 8;
    subtables.push({
      platform: t.readUInt16BE(base),
      encoding: t.readUInt16BE(base + 2),
      offset: t.readUInt32BE(base + 4),
    });
  }
  const pick = (format: number, accept: (p: number, e: number) => boolean) =>
    subtables.find(
      (s) =>
        accept(s.platform, s.encoding) && t.readUInt16BE(s.offset) === format,
    );
  const out = new Map<number, number>();
  const f12 = pick(12, (p, e) => (p === 3 && e === 10) || p === 0);
  if (f12) {
    readCmapFormat12(t, f12.offset, out);
    return out;
  }
  const f4 = pick(4, (p, e) => (p === 3 && e === 1) || p === 0);
  if (!f4) throw new Error("유니코드 cmap(형식 4·12)이 없음");
  readCmapFormat4(t, f4.offset, out);
  return out;
}

function readNames(t: Buffer): NameRecord[] {
  const count = t.readUInt16BE(2);
  const storage = t.readUInt16BE(4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = 6 + i * 12;
    const platformID = t.readUInt16BE(base);
    const length = t.readUInt16BE(base + 8);
    const offset = storage + t.readUInt16BE(base + 10);
    const raw = t.subarray(offset, offset + length);
    // 플랫폼 3(Windows)·0(Unicode)은 UTF-16BE, 1(Mac)은 Roman — 라틴 이름만 있으므로 latin1로 충분
    const value =
      platformID === 1
        ? raw.toString("latin1")
        : Buffer.from(raw).swap16().toString("utf16le");
    records.push({
      platformID,
      encodingID: t.readUInt16BE(base + 2),
      languageID: t.readUInt16BE(base + 4),
      nameID: t.readUInt16BE(base + 6),
      value,
    });
  }
  return records;
}

/** WOFF2 파일을 읽는다 */
export function readWoff2(file: string): Woff2Font {
  const tables = readTables(readFileSync(file));
  const head = requireTable(tables, "head");
  const hhea = requireTable(tables, "hhea");
  const hmtx = requireTable(tables, "hmtx");
  const os2 = requireTable(tables, "OS/2");
  const numberOfHMetrics = hhea.readUInt16BE(34);
  const lastAdvance = hmtx.readUInt16BE((numberOfHMetrics - 1) * 4);

  return {
    tables,
    unitsPerEm: head.readUInt16BE(18),
    hhea: {
      ascent: hhea.readInt16BE(4),
      descent: hhea.readInt16BE(6),
      lineGap: hhea.readInt16BE(8),
    },
    weightClass: os2.readUInt16BE(4),
    useTypoMetrics: (os2.readUInt16BE(62) & 0x80) !== 0,
    cmap: readCmap(requireTable(tables, "cmap")),
    // numberOfHMetrics 이후 글리프는 마지막 폭을 함께 쓴다(hmtx 규격)
    advanceOf: (glyphId) =>
      glyphId < numberOfHMetrics ? hmtx.readUInt16BE(glyphId * 4) : lastAdvance,
    names: readNames(requireTable(tables, "name")),
  };
}

/** 글자 하나의 폭(em). cmap에 없으면 null */
export function advanceEm(font: Woff2Font, char: string): number | null {
  const glyph = font.cmap.get(char.codePointAt(0) ?? -1);
  return glyph === undefined ? null : font.advanceOf(glyph) / font.unitsPerEm;
}

/** 코드포인트 집합 → CSS unicode-range 문자열(연속 구간 병합, 대문자 16진수 4자리 이상) */
export function toUnicodeRange(codePoints: Iterable<number>): string {
  const sorted = [...new Set(codePoints)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const cp of sorted) {
    const last = ranges.at(-1);
    if (last && cp === last[1] + 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
  return ranges
    .map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`))
    .join(",");
}

// ─── GSUB 단일 치환 (표 숫자 폭 확인용) ─────────────────────────────────────

/** Coverage 표 → 글리프 목록(순서 = 커버리지 번호) */
function readCoverage(t: Buffer, at: number): number[] {
  const format = t.readUInt16BE(at);
  const glyphs: number[] = [];
  if (format === 1) {
    const count = t.readUInt16BE(at + 2);
    for (let i = 0; i < count; i += 1)
      glyphs.push(t.readUInt16BE(at + 4 + i * 2));
  } else if (format === 2) {
    const count = t.readUInt16BE(at + 2);
    for (let i = 0; i < count; i += 1) {
      const base = at + 4 + i * 6;
      const start = t.readUInt16BE(base);
      const end = t.readUInt16BE(base + 2);
      for (let g = start; g <= end; g += 1) glyphs.push(g);
    }
  } else {
    throw new Error(`Coverage 형식 ${format}은 읽지 않음`);
  }
  return glyphs;
}

/** 단일 치환 하위 표(유형 1 형식 1·2)를 out에 더한다 */
function readSingleSubst(
  t: Buffer,
  at: number,
  out: Map<number, number>,
): void {
  const format = t.readUInt16BE(at);
  const coverage = readCoverage(t, at + t.readUInt16BE(at + 2));
  if (format === 1) {
    const delta = t.readInt16BE(at + 4);
    for (const g of coverage) out.set(g, (g + delta) & 0xffff);
  } else if (format === 2) {
    coverage.forEach((g, i) => out.set(g, t.readUInt16BE(at + 6 + i * 2)));
  } else {
    throw new Error(`단일 치환 형식 ${format}은 읽지 않음`);
  }
}

/**
 * GSUB 기능 하나(예: `tnum`)의 단일 치환 매핑(글리프 → 글리프). 기본 언어 체계 구분 없이 같은 태그의 기능을 모두 모은다.
 * 유형 1(단일 치환)과 그것을 감싼 유형 7(확장)만 읽고, 다른 유형은 건너뛴다.
 */
export function singleSubstitutions(
  font: Woff2Font,
  featureTag: string,
): Map<number, number> {
  const t = font.tables.get("GSUB");
  const out = new Map<number, number>();
  if (!t) return out;
  const featureList = t.readUInt16BE(6);
  const lookupList = t.readUInt16BE(8);
  const lookupIndices = new Set<number>();
  const featureCount = t.readUInt16BE(featureList);
  for (let i = 0; i < featureCount; i += 1) {
    const base = featureList + 2 + i * 6;
    if (t.toString("latin1", base, base + 4) !== featureTag) continue;
    const feature = featureList + t.readUInt16BE(base + 4);
    const count = t.readUInt16BE(feature + 2);
    for (let j = 0; j < count; j += 1) {
      lookupIndices.add(t.readUInt16BE(feature + 4 + j * 2));
    }
  }
  for (const index of lookupIndices) {
    const lookup = lookupList + t.readUInt16BE(lookupList + 2 + index * 2);
    const type = t.readUInt16BE(lookup);
    const subCount = t.readUInt16BE(lookup + 4);
    for (let k = 0; k < subCount; k += 1) {
      const sub = lookup + t.readUInt16BE(lookup + 6 + k * 2);
      if (type === 1) {
        readSingleSubst(t, sub, out);
      } else if (type === 7 && t.readUInt16BE(sub + 2) === 1) {
        readSingleSubst(t, sub + t.readUInt32BE(sub + 4), out);
      }
    }
  }
  return out;
}
