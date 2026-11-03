/**
 * PWA 공용 규칙(src/lib/pwa.ts, FR-120·FR-121 · M4-13 · M5-02): 최근 3일 호(KST 날짜 — time.ts) · Web App Manifest 필드 · 앱 아이콘 · 파비콘
 * (D3 C 스타일 ED — PNG 크기 · 면 · 안전 영역 · monochrome 투명 · 16 · 32 격자 · ICO · SVG) — 그리기 규칙은 scripts/lib/app-icons.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { createPaths } from "@/lib/paths";
import {
  APP_ICON_COLORS,
  APPLE_TOUCH_ICON,
  FAVICON,
  PWA_ICONS,
  RECENT_NEWS_DAYS,
  SPLASH_BACKGROUND,
  recentIssueDates,
  webManifest,
} from "@/lib/pwa";
import { THEME_COLOR } from "@/lib/theme";
import { kstDate } from "@/lib/time";

import {
  GRID_DARK,
  GRID_LIGHT,
  P16,
  P32,
  SAFE_RADIUS,
  encodeIco,
  encodePng,
  faviconIco,
  faviconSvg,
  gridPath,
  hexToRgb,
  iconPlan,
  monochromeRgba,
  renderGrid,
} from "../scripts/lib/app-icons";

describe("recentIssueDates — 최근 3일 호", () => {
  it("최신 호를 끝으로 하는 3일 달력 구간, 최신순", () => {
    expect(RECENT_NEWS_DAYS).toBe(3);
    expect(
      recentIssueDates(
        ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"],
        "2026-11-01",
      ),
    ).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"]);
  });

  it("결호는 건너뛰고 구간을 늘리지 않는다(10-19 결호 → 10-20·10-18)", () => {
    expect(
      recentIssueDates(
        ["2026-10-17", "2026-10-18", "2026-10-20"],
        "2026-10-20",
      ),
    ).toEqual(["2026-10-20", "2026-10-18"]);
  });

  it("발행이 며칠 멈춰도 마지막 호 기준(오늘이 아니라)", () => {
    expect(
      recentIssueDates(
        ["2026-10-22", "2026-10-23", "2026-10-24"],
        "2026-10-30",
      ),
    ).toEqual(["2026-10-24", "2026-10-23", "2026-10-22"]);
  });

  it("오늘(KST)보다 뒤 날짜는 뺀다 · 중복·순서 무관 · 빈 목록 · 월 경계", () => {
    expect(
      recentIssueDates(
        ["2026-11-03", "2026-11-01", "2026-10-31", "2026-11-01"],
        "2026-11-02",
      ),
    ).toEqual(["2026-11-01", "2026-10-31"]);
    expect(recentIssueDates([], "2026-11-02")).toEqual([]);
    expect(
      recentIssueDates(
        ["2026-10-31", "2026-11-01", "2026-10-30", "2026-10-29"],
        "2026-11-01",
      ),
    ).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"]);
    expect(recentIssueDates(["2026-11-01"], "2026-11-01", 0)).toEqual([]);
  });

  it("오늘은 KST 날짜 — UTC 15:00(KST 자정)을 넘기면 다음 날 호가 들어온다", () => {
    const dates = ["2026-10-31", "2026-11-01", "2026-11-02"];
    expect(recentIssueDates(dates, kstDate("2026-11-01T14:59:59Z"))).toEqual([
      "2026-11-01",
      "2026-10-31",
    ]);
    expect(recentIssueDates(dates, kstDate("2026-11-01T15:00:00Z"))).toEqual([
      "2026-11-02",
      "2026-11-01",
      "2026-10-31",
    ]);
  });
});

describe("webManifest — Chrome 설치 조건 필드", () => {
  const paths = createPaths({ basePath: "/euro-digest", siteUrl: undefined });
  const m = webManifest(paths.withBasePath);

  it("이름·start_url·scope·id = basePath + /, standalone, theme_color = --paper 라이트 · 스플래시 = 벽돌 레드(D71 ⑥)", () => {
    expect(m.name).toBe("유로 다이제스트");
    expect(m.short_name).toBe("유로 다이제스트");
    expect(m.start_url).toBe("/euro-digest/");
    expect(m.scope).toBe("/euro-digest/");
    expect(m.id).toBe("/euro-digest/");
    expect(m.start_url?.startsWith(m.scope ?? "∅")).toBe(true);
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("ko");
    expect(m.background_color).toBe("#9E2F28");
    expect(m.background_color).toBe(SPLASH_BACKGROUND);
    expect(m.background_color).toBe(APP_ICON_COLORS.face);
    expect(m.theme_color).toBe(THEME_COLOR.light);
  });

  it("아이콘 192·512 PNG(any) + maskable 512 + monochrome 512, 경로 basePath 포함", () => {
    expect(m.icons).toEqual([
      {
        src: "/euro-digest/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/euro-digest/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/euro-digest/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/euro-digest/icons/icon-monochrome-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ]);
  });

  it("루트 배포(basePath 빈 값)", () => {
    const root = webManifest(
      createPaths({ basePath: "", siteUrl: undefined }).withBasePath,
    );
    expect(root.start_url).toBe("/");
    expect(root.scope).toBe("/");
    expect(root.icons?.[0]?.src).toBe("/icons/icon-192.png");
  });
});

/** PNG → { width, height, rgba } (색 형식 6 · 8비트 · 필터 0만 — 우리가 만든 파일) */
function decodePng(buf: Buffer): {
  width: number;
  height: number;
  rgba: Buffer;
} {
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 6]);
    }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (width * 4 + 1)]).toBe(0);
    raw.copy(
      rgba,
      y * width * 4,
      y * (width * 4 + 1) + 1,
      (y + 1) * (width * 4 + 1),
    );
  }
  return { width, height, rgba };
}

/** RGBA 한 픽셀 */
function pixel(rgba: Buffer, size: number, x: number, y: number): number[] {
  const i = (y * size + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

const FACE = hexToRgb(APP_ICON_COLORS.face);
const LETTER = hexToRgb(APP_ICON_COLORS.letter);

function colorDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

const PNG_ICONS = [
  ...PWA_ICONS.map((i) => ({ ...i, variant: i.purpose as string })),
  { ...APPLE_TOUCH_ICON, purpose: "apple", variant: "apple" },
];

describe("앱 아이콘 — D3 C 스타일 ED(public/icons, M5-02)", () => {
  it.each(PNG_ICONS)(
    "$path — $size px RGBA PNG, 면 · 글자 색은 고정 값(§2.10 ①)",
    ({ path: sitePath, size, variant }) => {
      const { width, height, rgba } = decodePng(
        readFileSync(path.join("public", sitePath)),
      );
      expect([width, height]).toEqual([size, size]);
      const mono = variant === "monochrome";
      // 네 모서리 = 면(벽돌 레드 불투명) / monochrome = 투명
      for (const [x, y] of [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ] as const) {
        expect(pixel(rgba, size, x, y)).toEqual(
          mono ? [0, 0, 0, 0] : [...FACE, 255],
        );
      }
      let letter = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const px = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
        if (!mono) expect(px[3]).toBe(255); // any · maskable · apple — 투명 0
        if (mono && px[3] === 0) continue;
        if (colorDistance(px, LETTER) < 2 && px[3] === 255) letter += 1;
        // 면 · 글자 사이 안티에일리어싱 말고 다른 색이 없다(면 ↔ 글자 직선 위)
        if (!mono) {
          const t = (px[0]! - FACE[0]) / (LETTER[0] - FACE[0]);
          const mid = FACE.map((f, k) => f + (LETTER[k]! - f) * t);
          expect(colorDistance(px, mid)).toBeLessThan(4);
        } else {
          expect(px.slice(0, 3)).toEqual([...LETTER]); // 단색 판 — 알파만 다르다
        }
      }
      // 글자 면적 — ED + 괘선이 실제로 그려졌다(글꼴이 빠지면 괘선만 남아 아주 작아진다)
      const ratio = letter / (size * size);
      expect(ratio).toBeGreaterThan(variant === "any" ? 0.12 : 0.05);
      expect(ratio).toBeLessThan(variant === "any" ? 0.35 : 0.2);
    },
  );

  it.each(PNG_ICONS.filter((i) => i.variant !== "any"))(
    "$path — 면이 아닌 픽셀(ED · 괘선)은 모두 안전 원(지름 80%) 안",
    ({ path: sitePath, size, variant }) => {
      const { rgba } = decodePng(readFileSync(path.join("public", sitePath)));
      const r = (SAFE_RADIUS / 512) * size;
      const c = size / 2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = pixel(rgba, size, x, y);
          const ink =
            variant === "monochrome" ? px[3]! > 0 : colorDistance(px, FACE) > 0;
          if (ink) {
            expect(Math.hypot(x + 0.5 - c, y + 0.5 - c)).toBeLessThan(r);
          }
        }
      }
    },
  );

  it("고정 색 = globals.css 다크 토큰 값(--ticket · --ticket-fg · --brand-accent · --paper — DESIGN §2.10 ①)", () => {
    const css = readFileSync(path.join("src", "app", "globals.css"), "utf8");
    const dark = css.slice(css.indexOf('\n[data-theme="dark"] {'));
    const token = (name: string) =>
      new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)
        .exec(dark)?.[1]
        ?.toUpperCase();
    expect(APP_ICON_COLORS).toEqual({
      face: token("ticket"),
      letter: token("ticket-fg"),
      darkTabFace: token("brand-accent"),
      darkTabLetter: token("paper"),
    });
  });

  it("any · maskable/apple · monochrome 배치 — 시안 512 좌표(DESIGN §9.3 D3)", () => {
    expect(iconPlan("any")).toMatchObject({
      face: "#9E2F28",
      ink: "#F2EFE8",
      text: { x: 256, baseline: 352, size: 340, letterSpacing: -3.4 },
      rule: { x: 196, y: 398, w: 120, h: 16 },
    });
    for (const v of ["maskable", "apple"] as const) {
      expect(iconPlan(v)).toMatchObject({
        face: "#9E2F28",
        text: { baseline: 300, size: 236 },
        rule: { x: 214, y: 330, w: 84, h: 12 },
      });
    }
    const mono = iconPlan("monochrome");
    expect(mono.face).toBeNull();
    expect(mono.text).toEqual(iconPlan("maskable").text);
    expect(mono.rule).toEqual(iconPlan("maskable").rule);
    // 괘선은 가운데 정렬, 안전 원 안
    for (const v of ["any", "maskable"] as const) {
      const { rule } = iconPlan(v);
      expect(rule.x + rule.w / 2).toBe(256);
    }
    const { rule } = iconPlan("maskable");
    expect(Math.hypot(rule.x - 256, rule.y + rule.h - 256)).toBeLessThan(
      SAFE_RADIUS,
    );
  });

  it("monochromeRgba — 알파는 그대로, RGB는 한 색 · 투명 픽셀은 0", () => {
    const out = monochromeRgba(
      Uint8Array.from([10, 20, 30, 0, 240, 238, 230, 7, 1, 2, 3, 255]),
      APP_ICON_COLORS.letter,
    );
    expect(Array.from(out)).toEqual([0, 0, 0, 0, ...LETTER, 7, ...LETTER, 255]);
  });

  it("encodePng → 디코드 왕복 · 픽셀 수가 틀리면 막는다", () => {
    const px = renderGrid(P16, GRID_LIGHT);
    expect(decodePng(encodePng(16, px)).rgba).toEqual(Buffer.from(px));
    expect(() => encodePng(17, px)).toThrow(RangeError);
  });
});

/** 격자 열마다 `#`이 하나라도 있는가 */
function inkColumns(grid: readonly string[]): boolean[] {
  return Array.from({ length: grid.length }, (_, x) =>
    grid.some((row) => row[x] === "#"),
  );
}

describe("파비콘 — 16 · 32 픽셀 격자 · favicon.ico · favicon.svg (M5-02)", () => {
  it("P16 · P32 — 정사각형, E와 D 사이 빈 열(틈)이 있다, 글자 높이 10 · 20px", () => {
    for (const [grid, size, rows] of [
      [P16, 16, [3, 12]],
      [P32, 32, [6, 25]],
    ] as const) {
      expect(grid).toHaveLength(size);
      for (const row of grid)
        expect(row).toMatch(new RegExp(`^[.#]{${size}}$`));
      const cols = inkColumns(grid);
      const first = cols.indexOf(true);
      const last = cols.lastIndexOf(true);
      // 글자 구간 안의 빈 열 = E · D 사이 틈(하나 이상)
      expect(cols.slice(first, last + 1).some((c) => !c)).toBe(true);
      const inkRows = grid.flatMap((r, y) => (r.includes("#") ? [y] : []));
      expect([inkRows[0], inkRows.at(-1)]).toEqual(rows);
      // 가장자리 2px 이상 여백(탭에서 면이 테두리처럼 보인다)
      expect(first).toBeGreaterThanOrEqual(2);
      expect(size - 1 - last).toBeGreaterThanOrEqual(2);
    }
    // D 모서리 깎음 — P16 1px, P32 2px(시안 그대로)
    expect(P16[3]!.slice(8, 14)).toBe("#####.");
    expect(P32[6]!.slice(23, 27)).toBe("##..");
    expect(P32[7]!.slice(23, 27)).toBe("##..");
    expect(P32[8]!.slice(23, 27)).toBe("####");
  });

  it("gridPath — 사각형 합이 격자 `#` 칸과 정확히 같다", () => {
    for (const grid of [P16, P32]) {
      const size = grid.length;
      const covered = grid.map(() => Array<number>(size).fill(0));
      for (const m of gridPath(grid).matchAll(
        /M(\d+) (\d+)h(\d+)v(\d+)h-\3z/g,
      )) {
        const [x, y, w, h] = [m[1], m[2], m[3], m[4]].map(Number) as [
          number,
          number,
          number,
          number,
        ];
        for (let yy = y; yy < y + h; yy += 1)
          for (let xx = x; xx < x + w; xx += 1) covered[yy]![xx]! += 1;
      }
      grid.forEach((row, y) => {
        expect(
          covered[y]!.map((n) => (n === 1 ? "#" : n === 0 ? "." : "!")).join(
            "",
          ),
        ).toBe(row);
      });
    }
  });

  it("favicon.svg — 커밋된 파일 = 규칙 결과, 라이트 벽돌 레드 + 지면색 / 다크 #FF7A6E + #0E1626", () => {
    const svg = readFileSync(path.join("public", FAVICON.svg), "utf8");
    expect(svg).toBe(faviconSvg());
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain(
      `.f{fill:${GRID_LIGHT.face}}.g{fill:${GRID_LIGHT.ink}}`,
    );
    expect(svg).toMatch(
      /@media \(prefers-color-scheme:dark\)\{\.f\{fill:#FF7A6E\}\.g\{fill:#0E1626\}\}/,
    );
    expect(GRID_DARK).toEqual({ face: "#FF7A6E", ink: "#0E1626" });
    // 외부 참조 · 스크립트 · 글꼴 없음(파비콘 SVG는 외부 자원을 못 읽는다)
    expect(svg).not.toMatch(/<script|href=|url\(|@font-face|<text/);
    expect(Buffer.byteLength(svg)).toBeLessThan(1024);
  });

  it("favicon.ico — 커밋된 파일 = 규칙 결과, 16 · 32 PNG 항목이 P16 · P32 라이트 격자", () => {
    const ico = readFileSync(path.join("public", FAVICON.ico));
    expect(ico.equals(faviconIco())).toBe(true);
    expect([
      ico.readUInt16LE(0),
      ico.readUInt16LE(2),
      ico.readUInt16LE(4),
    ]).toEqual([0, 1, 2]);
    const grids = [P16, P32];
    FAVICON.icoSizes.forEach((size, k) => {
      const e = 6 + 16 * k;
      expect([ico[e], ico[e + 1]]).toEqual([size, size]);
      expect(ico.readUInt16LE(e + 6)).toBe(32);
      const len = ico.readUInt32LE(e + 8);
      const off = ico.readUInt32LE(e + 12);
      const png = decodePng(ico.subarray(off, off + len));
      expect([png.width, png.height]).toEqual([size, size]);
      expect(
        png.rgba.equals(Buffer.from(renderGrid(grids[k]!, GRID_LIGHT))),
      ).toBe(true);
    });
    expect(() => encodeIco([{ size: 300, png: Buffer.alloc(1) }])).toThrow(
      RangeError,
    );
  });
});
