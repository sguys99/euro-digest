/**
 * PWA 공용 규칙(src/lib/pwa.ts, FR-120·FR-121 · M4-13): 최근 3일 호(KST 날짜 — time.ts) · Web App Manifest 필드 · 임시 아이콘(PNG 크기 ·
 * maskable 안전 영역 · 노치 투명) — 아이콘 그리기는 scripts/lib/temp-icons.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { createPaths } from "@/lib/paths";
import {
  APPLE_TOUCH_ICON,
  PWA_ICONS,
  RECENT_NEWS_DAYS,
  recentIssueDates,
  webManifest,
} from "@/lib/pwa";
import { THEME_COLOR } from "@/lib/theme";
import { kstDate } from "@/lib/time";

import {
  ICON_COLORS,
  encodePng,
  iconSample,
  renderIcon,
} from "../scripts/lib/temp-icons";

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

  it("이름·start_url·scope·id = basePath + /, standalone, 색 = --paper 라이트", () => {
    expect(m.name).toBe("유로 다이제스트");
    expect(m.short_name).toBe("유로 다이제스트");
    expect(m.start_url).toBe("/euro-digest/");
    expect(m.scope).toBe("/euro-digest/");
    expect(m.id).toBe("/euro-digest/");
    expect(m.start_url?.startsWith(m.scope ?? "∅")).toBe(true);
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("ko");
    expect(m.background_color).toBe(THEME_COLOR.light);
    expect(m.theme_color).toBe(THEME_COLOR.light);
  });

  it("아이콘 192·512 PNG(any) + maskable 512, 경로 basePath 포함", () => {
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

describe("임시 아이콘(D3에서 교체) — public/icons", () => {
  it.each([...PWA_ICONS, { ...APPLE_TOUCH_ICON, purpose: "apple" }])(
    "$path — $size px PNG, 커밋된 파일이 그리기 규칙 결과와 같다",
    ({ path: sitePath, size, purpose }) => {
      const file = readFileSync(path.join("public", sitePath));
      const { width, height, rgba } = decodePng(file);
      expect([width, height]).toEqual([size, size]);
      const variant =
        purpose === "maskable"
          ? "maskable"
          : purpose === "apple"
            ? "apple"
            : "any";
      // 1MB 버퍼를 원소별 깊은 비교하면 느리다 — 바이트 비교
      expect(Buffer.from(renderIcon(size, variant)).equals(rgba)).toBe(true);
    },
  );

  it("encodePng → 디코드 왕복", () => {
    const px = renderIcon(16, "any");
    expect(decodePng(encodePng(16, px)).rgba).toEqual(Buffer.from(px));
  });

  it("maskable·apple은 투명 없음, any는 좌우 노치만 투명", () => {
    for (const variant of ["maskable", "apple"] as const) {
      const px = renderIcon(64, variant);
      for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
    }
    expect(iconSample(1, 256, "any")).toBeNull();
    expect(iconSample(511, 256, "any")).toBeNull();
    expect(iconSample(1, 256, "maskable")).toEqual(ICON_COLORS.face);
    expect(iconSample(1, 1, "any")).toEqual(ICON_COLORS.face);
  });

  it("maskable 안전 영역 — 면이 아닌 도형(이니셜·막대)은 모두 가운데 지름 80% 원 안", () => {
    const r = 0.4 * 512;
    for (let y = 0; y < 512; y += 2) {
      for (let x = 0; x < 512; x += 2) {
        const c = iconSample(x, y, "maskable");
        if (c !== ICON_COLORS.face) {
          expect(Math.hypot(x - 256, y - 256)).toBeLessThan(r);
        }
      }
    }
  });
});
