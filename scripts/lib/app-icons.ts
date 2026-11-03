/**
 * 앱 아이콘 · 파비콘 그리기 규칙 — 순수 함수 (PRD FR-120, DESIGN §9.3 D3 · §2.10 ①, PRD §15 D71, plan M5-02)
 *
 * D3 확정안 "C 스타일 ED": 벽돌 레드 면(다크 `--ticket` `#9E2F28`) + 지면색 ED(다크 `--ticket-fg` `#F2EFE8`, Barlow Condensed 800 —
 * 마스트헤드 영문 워드마크의 머리글자) + 아래 짧은 괘선. 기준 시안 `docs/design/d3/build/concept-mix.mjs`(`iconE` · `P16` · `P32`).
 * 이미지 자산 금지(CLAUDE §1-6)라 그림은 글자 · 면 · 괘선뿐이다.
 *
 * - **PNG(any 192 · 512 · maskable 512 · apple-touch 180 · monochrome 512)**: 512 좌표 그리기 계획(`iconPlan`)을 빌드 스크립트
 *   (scripts/build-icons.ts)가 Chromium 캔버스에 저장소의 Barlow Condensed 800 woff2(OFL 1.1 — 예약 글꼴 이름 없음)로 그려 RGBA를 받고,
 *   여기 `encodePng`로 굳힌다. 글리프 외곽선을 저장소에 옮겨 적지 않는다(새 의존성 0 — woff2 해독기 없음).
 * - **16 · 32px**: 벡터 축소 대신 픽셀 격자 손그림(`P16` · `P32` — 시안 그대로). favicon.ico = 두 격자 PNG를 담은 ICO,
 *   favicon.svg = `P32` 사각형 합 path + `prefers-color-scheme: dark` 색 교체(다크 탭 `#FF7A6E` 면 + `#0E1626` ED).
 * - **monochrome**(2026-11-03 사용자 결정 — DECISIONS D3 §8 #1): maskable 배치의 ED · 괘선만 남긴 단색 판(투명 배경). 런처는 알파만 쓴다.
 *
 * PNG는 RGBA 8비트 · 필터 0 · zlib(node:zlib — 새 의존성 없음).
 */
import { crc32, deflateSync } from "node:zlib";

import { APP_ICON_COLORS } from "@/lib/pwa";

/** any = 면 꽉 채움 큰 ED · maskable/apple = 안전 원 안 작은 ED · monochrome = maskable 배치에서 면을 뺀 단색 판 */
export type IconVariant = "any" | "maskable" | "apple" | "monochrome";

export type Rgb = readonly [number, number, number];

/** `#RRGGBB` → [r, g, b] */
export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new RangeError(`#RRGGBB 형식이 아님: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** 아이콘 좌표계(512 단위) */
export const ICON_UNIT = 512;
/** maskable 안전 영역 — 가운데 지름 80% 원의 반지름(512 단위) */
export const SAFE_RADIUS = 0.4 * ICON_UNIT;

/** 512 단위 그리기 계획 — 캔버스(빌드)와 테스트가 같은 값을 쓴다 */
export interface IconPlan {
  /** 면 색(null = 투명 — monochrome) */
  face: string | null;
  /** 글자 · 괘선 색 */
  ink: string;
  /** ED — 가운데 정렬(x 256), 기준선 y, 글자 크기, 자간(-1% — 시안 `letter-spacing`) */
  text: { x: number; baseline: number; size: number; letterSpacing: number };
  /** 아래 짧은 괘선 */
  rule: { x: number; y: number; w: number; h: number };
}

/** 아이콘 글자 — 마스트헤드 영문 워드마크(Euro Digest)의 머리글자 */
export const ICON_TEXT = "ED";
/** 글자 패밀리 · 굵기(DESIGN §3.1 Barlow Condensed 800) */
export const ICON_FONT = { family: "Barlow Condensed", weight: 800 } as const;

function textSpec(baseline: number, size: number): IconPlan["text"] {
  return {
    x: ICON_UNIT / 2,
    baseline,
    size,
    letterSpacing: Number((-size * 0.01).toFixed(1)),
  };
}

/** DESIGN §9.3 D3 — any: ED 340 · 기준선 352 + 괘선 120×16 · y 398 / maskable · apple: ED 236 · 기준선 300 + 괘선 84×12 · y 330 */
export function iconPlan(variant: IconVariant): IconPlan {
  if (variant === "any") {
    return {
      face: APP_ICON_COLORS.face,
      ink: APP_ICON_COLORS.letter,
      text: textSpec(352, 340),
      rule: { x: 196, y: 398, w: 120, h: 16 },
    };
  }
  return {
    face: variant === "monochrome" ? null : APP_ICON_COLORS.face,
    ink: APP_ICON_COLORS.letter,
    text: textSpec(300, 236),
    rule: { x: 214, y: 330, w: 84, h: 12 },
  };
}

// ─── 16 · 32px 픽셀 격자(시안 concept-mix.mjs 그대로) ─────────────────────────

/** 16px — 획 2px, D 모서리 1px 깎음. E 2~6열 · 틈 7열 · D 8~13열, 글자 3~12행 */
export const P16: readonly string[] = [
  "................",
  "................",
  "................",
  "..#####.#####...",
  "..#####.######..",
  "..##....##..##..",
  "..##....##..##..",
  "..####..##..##..",
  "..####..##..##..",
  "..##....##..##..",
  "..##....##..##..",
  "..#####.######..",
  "..#####.#####...",
  "................",
  "................",
  "................",
];

/** 32px — 세로 획 4px · 가로 획 3px, 글자 높이 20px(6~25행), D 모서리 2px 깎음 */
export const P32: readonly string[] = (() => {
  const g = Array.from({ length: 32 }, () => Array<string>(32).fill("."));
  const fill = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1) g[y]![x] = "#";
  };
  // E
  fill(5, 8, 6, 25);
  fill(5, 13, 6, 8);
  fill(5, 12, 14, 16);
  fill(5, 13, 23, 25);
  // D
  fill(16, 19, 6, 25);
  fill(16, 24, 6, 8);
  fill(16, 24, 23, 25);
  fill(23, 26, 8, 23);
  for (const [x, y] of [
    [25, 6],
    [26, 6],
    [26, 7],
    [25, 25],
    [26, 25],
    [26, 24],
  ] as const) {
    g[y]![x] = ".";
  }
  g[8]![25] = "#";
  g[23]![25] = "#";
  return g.map((row) => row.join(""));
})();

/** 격자 팔레트: `.` = 면, `#` = 글자 */
export interface GridPalette {
  face: string;
  ink: string;
}

/** 라이트 탭 · ICO 팔레트(ICO는 테마를 모른다) */
export const GRID_LIGHT: GridPalette = {
  face: APP_ICON_COLORS.face,
  ink: APP_ICON_COLORS.letter,
};
/** 다크 탭 팔레트(favicon.svg `prefers-color-scheme: dark`) */
export const GRID_DARK: GridPalette = {
  face: APP_ICON_COLORS.darkTabFace,
  ink: APP_ICON_COLORS.darkTabLetter,
};

/**
 * monochrome 판 정리 — 캔버스가 돌려준 값은 가장자리 반투명 픽셀의 RGB가 곱셈 되돌림 반올림으로 조금씩 흔들린다. 런처는 알파만 쓰므로
 * 알파는 그대로 두고 RGB를 한 색(투명 픽셀은 0)으로 맞춰 '단색 판'을 바이트로도 보장한다.
 */
export function monochromeRgba(rgba: Uint8Array, hex: string): Uint8Array {
  const [r, g, b] = hexToRgb(hex);
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a > 0) out.set([r, g, b, a], i);
  }
  return out;
}

/** 격자 → RGBA(투명 없음) */
export function renderGrid(
  grid: readonly string[],
  palette: GridPalette,
): Uint8Array {
  const size = grid.length;
  const face = hexToRgb(palette.face);
  const ink = hexToRgb(palette.ink);
  const px = new Uint8Array(size * size * 4);
  grid.forEach((row, y) => {
    if (row.length !== size)
      throw new RangeError(`격자가 정사각형이 아님: ${y}행`);
    for (let x = 0; x < size; x += 1) {
      px.set([...(row[x] === "#" ? ink : face), 255], (y * size + x) * 4);
    }
  });
  return px;
}

/**
 * 격자의 `#` 칸 → SVG path(사각형 합). 행마다 연속 구간을 찾고, 아래 행에 같은 구간이 이어지면 한 사각형으로 합친다.
 */
export function gridPath(grid: readonly string[]): string {
  type Run = { x: number; w: number; y: number; h: number };
  const done: Run[] = [];
  let open: Run[] = [];
  grid.forEach((row, y) => {
    const runs: { x: number; w: number }[] = [];
    for (let x = 0; x < row.length;) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x] === "#") x += 1;
      runs.push({ x: start, w: x - start });
    }
    const next: Run[] = [];
    for (const r of runs) {
      const prev = open.find((o) => o.x === r.x && o.w === r.w);
      if (prev) {
        prev.h += 1;
        next.push(prev);
      } else {
        next.push({ ...r, y, h: 1 });
      }
    }
    done.push(...open.filter((o) => !next.includes(o)));
    open = next;
  });
  done.push(...open);
  return done
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`)
    .join("");
}

/** favicon.svg — `P32` 사각형 합. 라이트 탭 벽돌 레드 + 지면색 ED / 다크 탭 `#FF7A6E` 면 + `#0E1626` ED */
export function faviconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">',
    `<style>.f{fill:${GRID_LIGHT.face}}.g{fill:${GRID_LIGHT.ink}}@media (prefers-color-scheme:dark){.f{fill:${GRID_DARK.face}}.g{fill:${GRID_DARK.ink}}}</style>`,
    '<rect class="f" width="32" height="32"/>',
    `<path class="g" d="${gridPath(P32)}"/>`,
    "</svg>",
    "",
  ].join("");
}

// ─── PNG · ICO 인코딩 ────────────────────────────────────────────────────────

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** RGBA 픽셀 → PNG 바이트(색 형식 6 = RGBA, 8비트, 행마다 필터 0) */
export function encodePng(size: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== size * size * 4) {
    throw new RangeError(`픽셀 수가 ${size}×${size}와 다름: ${rgba.length}`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(
      raw,
      row + 1,
    );
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** PNG 이미지들을 담은 ICO(Vista 이후 PNG 항목 — 모든 현행 브라우저가 읽는다). 크기 오름차순으로 넣는다 */
export function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const sorted = [...images].sort((a, b) => a.size - b.size);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = 아이콘
  header.writeUInt16LE(sorted.length, 4);
  let offset = 6 + 16 * sorted.length;
  const entries = sorted.map(({ size, png }) => {
    if (size < 1 || size > 256)
      throw new RangeError(`ICO 크기 범위 밖: ${size}`);
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size;
    e[1] = size === 256 ? 0 : size;
    e[2] = 0; // 팔레트 없음
    e[3] = 0;
    e.writeUInt16LE(1, 4); // 색 평면
    e.writeUInt16LE(32, 6); // 픽셀당 비트
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...sorted.map((i) => i.png)]);
}

/** favicon.ico — `P16` · `P32` 라이트 팔레트 */
export function faviconIco(): Buffer {
  return encodeIco(
    [P16, P32].map((grid) => ({
      size: grid.length,
      png: encodePng(grid.length, renderGrid(grid, GRID_LIGHT)),
    })),
  );
}
