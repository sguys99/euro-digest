/**
 * 임시 앱 아이콘 그리기 — 순수 함수 (PRD FR-120, plan M4-13 · **D3 아이콘 게이트에서 교체**)
 *
 * 이미지 자산 금지(CLAUDE §1-6)라 로고·사진·글꼴 파일 없이 도형만으로 그린다: 티켓 면(`--ticket` 라이트 = `--ink` #14213D) 위에
 * 지면색(`--paper` #F3F0EA) 기하 이니셜 "ED"(유로 다이제스트) + 스팟 레드(`--brand-accent` #B32F25) 막대 하나. `any` 아이콘은 티켓 스텁 모티프
 * (DESIGN §1 ② — 좌우 가운데 반원 노치)를 투명으로 뚫고, `maskable`·apple-touch는 투명 없이 면을 꽉 채운다(마스크·iOS가 모서리를 자른다).
 * 모든 도형은 maskable 안전 영역(가운데 지름 80% 원) 안에 있다.
 *
 * 좌표는 512 단위로 정의하고 크기에 맞춰 줄인다. 픽셀마다 4×4 표본으로 덮인 비율을 재 가장자리를 부드럽게 한다(안티에일리어싱).
 * PNG는 RGBA 8비트·필터 0·zlib(node:zlib — 새 의존성 없음).
 */
import { crc32, deflateSync } from "node:zlib";

export type IconVariant = "any" | "maskable" | "apple";

type Rgb = readonly [number, number, number];

/** DESIGN §2.1·§2.2 라이트 값(아이콘은 테마를 따르지 않는다) */
export const ICON_COLORS = {
  face: [0x14, 0x21, 0x3d],
  letter: [0xf3, 0xf0, 0xea],
  accent: [0xb3, 0x2f, 0x25],
} as const satisfies Record<string, Rgb>;

const UNIT = 512;
const STROKE = 44;
const TOP = 134;
const BOTTOM = 334;
const MID_Y = (TOP + BOTTOM) / 2;
/** E: x 109–229 · D: 줄기 259–303, 반원 중심 x 303 · 막대 362–378 */
const E_LEFT = 109;
const E_RIGHT = 229;
const D_LEFT = 259;
const D_CENTER_X = D_LEFT + STROKE;
const D_OUTER_R = (BOTTOM - TOP) / 2;
const D_INNER_R = D_OUTER_R - STROKE;
const BAR = { x0: E_LEFT, x1: D_CENTER_X + D_OUTER_R, y0: 362, y1: 378 };
/** 티켓 노치(`any`만) — 좌우 가장자리 가운데 반원 */
const NOTCH_R = 34;

function inRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

function letterE(x: number, y: number): boolean {
  return (
    inRect(x, y, E_LEFT, TOP, E_LEFT + STROKE, BOTTOM) ||
    inRect(x, y, E_LEFT, TOP, E_RIGHT, TOP + STROKE) ||
    inRect(
      x,
      y,
      E_LEFT,
      MID_Y - STROKE / 2,
      E_RIGHT - 12,
      MID_Y + STROKE / 2,
    ) ||
    inRect(x, y, E_LEFT, BOTTOM - STROKE, E_RIGHT, BOTTOM)
  );
}

function letterD(x: number, y: number): boolean {
  if (inRect(x, y, D_LEFT, TOP, D_CENTER_X, BOTTOM)) return true;
  if (x < D_CENTER_X) return false;
  const d2 = (x - D_CENTER_X) ** 2 + (y - MID_Y) ** 2;
  return d2 <= D_OUTER_R ** 2 && d2 > D_INNER_R ** 2;
}

/** 512 단위 좌표 한 점의 색(null = 투명) */
export function iconSample(
  x: number,
  y: number,
  variant: IconVariant,
): Rgb | null {
  if (variant === "any") {
    const cy = UNIT / 2;
    if (x ** 2 + (y - cy) ** 2 < NOTCH_R ** 2) return null;
    if ((x - UNIT) ** 2 + (y - cy) ** 2 < NOTCH_R ** 2) return null;
  }
  if (letterE(x, y) || letterD(x, y)) return ICON_COLORS.letter;
  if (inRect(x, y, BAR.x0, BAR.y0, BAR.x1, BAR.y1)) return ICON_COLORS.accent;
  return ICON_COLORS.face;
}

const SUPERSAMPLE = 4;

/** size×size RGBA 픽셀(행 우선) */
export function renderIcon(size: number, variant: IconVariant): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const scale = UNIT / size;
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py += 1) {
    for (let pxl = 0; pxl < size; pxl += 1) {
      const i = (py * size + pxl) * 4;
      // 네 모서리 표본이 같으면 픽셀 전체가 한 도형 안(가장 얇은 도형도 픽셀보다 훨씬 넓다) — 16표본을 건너뛴다
      const at = (sx: number, sy: number) =>
        iconSample(
          (pxl + (sx + 0.5) / SUPERSAMPLE) * scale,
          (py + (sy + 0.5) / SUPERSAMPLE) * scale,
          variant,
        );
      const last = SUPERSAMPLE - 1;
      const corner = at(0, 0);
      if (
        at(last, 0) === corner &&
        at(0, last) === corner &&
        at(last, last) === corner
      ) {
        px.set(corner ? [...corner, 255] : [0, 0, 0, 0], i);
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const c = at(sx, sy);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      // 덮인 표본의 평균색(곱하지 않은 알파) + 덮인 비율
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

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
