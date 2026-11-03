/**
 * OG PNG 입력 해시 꼬리표 (plan M5-01 — 빌드 시간). I/O 없는 순수 함수.
 *
 * OG 이미지는 `public/og/`에 커밋한다(앱 아이콘과 같은 방식 — 봇의 data 커밋도 `public/`을 함께 올린다). 매 빌드에 날짜 · 대회 · 팀
 * PNG를 다시 굽지 않도록, 굽는 입력(템플릿 CSS · 카드 마크업 · 글꼴 파일)의 해시를 PNG `tEXt` 청크(키 `ed-og-input`)에 적어 두고, 다음
 * 빌드는 해시가 같은 파일을 건너뛴다. 해시를 파일 안에 두므로 목록 파일이 따로 없다 — 봇 커밋과 사람 커밋이 같은 목록 파일을
 * 고치다 rebase 충돌이 날 일이 없다. 브라우저가 tEXt 청크를 무시하므로 화면에는 영향이 없다.
 */
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";

/** tEXt 키워드 */
export const OG_HASH_KEY = "ed-og-input";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Chunk {
  type: string;
  data: Buffer;
  /** 청크 시작 위치(길이 필드) */
  offset: number;
  /** 청크 끝 다음 위치 */
  end: number;
}

/** PNG 청크 목록 — PNG가 아니거나 잘렸으면 null */
function chunks(png: Buffer): Chunk[] | null {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) return null;
  const out: Chunk[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) return null;
    out.push({
      type: png.toString("latin1", offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
      offset,
      end,
    });
    offset = end;
  }
  return out.at(-1)?.type === "IEND" ? out : null;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG 가로 · 세로(IHDR) — PNG가 아니면 null */
export function pngSize(png: Buffer): { width: number; height: number } | null {
  const ihdr = chunks(png)?.[0];
  if (!ihdr || ihdr.type !== "IHDR" || ihdr.data.length < 8) return null;
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
  };
}

/** 적힌 입력 해시 — 없거나 PNG가 아니면 null */
export function readOgHash(png: Buffer): string | null {
  for (const c of chunks(png) ?? []) {
    if (c.type !== "tEXt") continue;
    const sep = c.data.indexOf(0);
    if (sep < 0) continue;
    if (c.data.toString("latin1", 0, sep) === OG_HASH_KEY) {
      return c.data.toString("latin1", sep + 1);
    }
  }
  return null;
}

/** 입력 해시를 적은 PNG — 이미 있던 같은 키 청크는 지우고 IEND 앞에 하나 넣는다 */
export function writeOgHash(png: Buffer, hash: string): Buffer {
  const list = chunks(png);
  if (!list) throw new Error("PNG가 아님 — 입력 해시를 적을 수 없음");
  if (!/^[0-9a-f]{64}$/.test(hash))
    throw new Error(`해시 형식이 아님: ${hash}`);
  const parts: Buffer[] = [SIGNATURE];
  for (const c of list) {
    if (c.type === "IEND") {
      parts.push(
        chunk("tEXt", Buffer.from(`${OG_HASH_KEY}\0${hash}`, "latin1")),
      );
    }
    if (
      c.type === "tEXt" &&
      c.data.toString("latin1").startsWith(`${OG_HASH_KEY}\0`)
    ) {
      continue;
    }
    parts.push(png.subarray(c.offset, c.end));
  }
  return Buffer.concat(parts);
}

/** sha256 hex */
export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * 카드 한 장의 입력 해시 — 템플릿 판(수동으로 올려 전부 다시 굽는 값) · CSS · 카드 마크업 · 글꼴 파일 해시. 브라우저 판은 넣지 않는다
 * (입력이 같으면 다시 굽지 않는다 — Chromium이 바뀌어 픽셀이 조금 달라져도 같은 그림으로 본다).
 */
export function ogInputHash(input: {
  version: number;
  css: string;
  html: string;
  fonts: readonly string[];
}): string {
  return sha256Hex(
    JSON.stringify([input.version, input.css, input.html, [...input.fonts]]),
  );
}
