// M1-39 — 모바일 4G 조건 FCP·LCP·CLS·TBT 실측(CDP 네트워크·CPU 스로틀링, 캐시 없음, 실행마다 새 컨텍스트, 중앙값).
// 프로필: slow4g = Lighthouse 모바일 devtools 적용 스로틀링(RTT 562.5ms · 1,474.56 kbps 다운 · 675 kbps 업 · CPU 4×)
//         fast4g = Chrome DevTools "Fast 4G"(RTT 165ms · 9 Mbps · 1.5 Mbps · CPU 4×) · none = 스로틀링 없음
// 사용: BASE=https://127.0.0.1:4199/euro-digest/ node docs/research/m1-39-perf/lcp.mjs <프로필> "<경로,경로…>" <회수> <폭x높이[m]>
//   예: … lcp.mjs slow4g ",news/,news/2026-10-22/,news/2026-10-22/#c_7d0214a219,about/,this-page-does-not-exist/" 5 412x823m
//   한 줄에 경로 하나의 JSON(중앙값 + 첫 실행의 폰트 응답·LCP 후보·이동 목록). 글꼴 환경은 FONTCONFIG_FILE로 바꾼다(README).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://127.0.0.1:4199/euro-digest/";
const PROFILES = {
  slow4g: { latency: 562.5, down: (1474.56 * 1024) / 8, up: (675 * 1024) / 8, cpu: 4 },
  fast4g: { latency: 165, down: (9000 * 1024) / 8, up: (1500 * 1024) / 8, cpu: 4 },
  none: { latency: 0, down: -1, up: -1, cpu: 1 },
};
const profile = process.argv[2] ?? "slow4g";
const targets = (process.argv[3] ?? ",news/,about/,this-page-does-not-exist/").split(",");
const runs = Number(process.argv[4] ?? 5);
const [vw, vh, mobile] = (process.argv[5] ?? "412x823m").match(/(\d+)x(\d+)(m?)/).slice(1);

const browser = await chromium.launch();
for (const target of targets) {
  const rows = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({
      viewport: { width: +vw, height: +vh },
      ignoreHTTPSErrors: true,
      deviceScaleFactor: mobile ? 1.75 : 1,
      isMobile: !!mobile,
      hasTouch: !!mobile,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const p = PROFILES[profile];
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (p.down > 0)
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: p.latency,
        downloadThroughput: p.down,
        uploadThroughput: p.up,
      });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
    await page.addInitScript(() => {
      const m = (window.__m = { lcp: [], cls: 0, shifts: [], long: [] });
      const label = (el) =>
        el
          ? `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}«${(el.textContent || "").trim().slice(0, 18)}»`
          : "?";
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) m.lcp.push({ t: e.startTime, size: e.size, el: label(e.element) });
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.hadRecentInput) continue;
          m.cls += e.value;
          m.shifts.push({
            t: Math.round(e.startTime),
            v: +e.value.toFixed(4),
            src: (e.sources || [])
              .map((s) => {
                const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement);
                const a = el?.closest?.("[id],[data-slot]");
                return a ? (a.id ? `#${a.id}` : `[${a.getAttribute("data-slot")}]`) : el?.tagName;
              })
              .join(","),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) m.long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
      }).observe({ type: "longtask", buffered: true });
    });
    await page.goto(BASE + target, { waitUntil: "load", timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    rows.push(
      await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
        const res = performance.getEntriesByType("resource");
        const m = window.__m;
        return {
          fcp,
          lcp: m.lcp.at(-1) ?? null,
          cls: m.cls,
          shifts: m.shifts,
          htmlEnd: Math.round(nav.responseEnd),
          htmlBytes: nav.transferSize,
          fonts: res
            .filter((r) => r.name.endsWith(".woff2"))
            .map((r) => ({ f: r.name.split("/").pop(), end: Math.round(r.responseEnd) })),
          tbt: m.long.filter((x) => x.t >= (fcp ?? 0)).reduce((s, x) => s + Math.max(0, x.d - 50), 0),
          longMax: Math.max(0, ...m.long.map((x) => x.d)),
        };
      }),
    );
    await ctx.close();
  }
  const med = (f) => {
    const v = rows.map(f).filter((x) => x != null).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  console.log(
    JSON.stringify({
      target: `/${target}`,
      profile,
      vp: `${vw}x${vh}${mobile ? " mobile" : ""}`,
      runs,
      fcp: Math.round(med((x) => x.fcp)),
      lcp: Math.round(med((x) => x.lcp?.t)),
      lcpEl: rows.map((x) => x.lcp?.el).join(" | "),
      cls: +med((x) => x.cls).toFixed(4),
      clsMax: +Math.max(...rows.map((x) => x.cls)).toFixed(4),
      tbt: med((x) => x.tbt),
      longMax: med((x) => x.longMax),
      htmlEnd: med((x) => x.htmlEnd),
      htmlKB: +(rows[0].htmlBytes / 1024).toFixed(1),
      fonts: rows[0].fonts,
      shifts: rows.map((x) => x.shifts),
    }),
  );
}
await browser.close();
