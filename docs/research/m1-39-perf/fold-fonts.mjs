// M1-39 — 첫 화면(뷰포트 안) 글자를 실제로 그린 글꼴(CDP CSS.getPlatformFontsForNode). 폰트 로드 뒤 기준, 글자 수와 넓이(글자 수 × 크기²/256).
// preload 대상 고르기의 근거. 사용: BASE=… node docs/research/m1-39-perf/fold-fonts.mjs "<경로,…>" "<폭x높이,…>"
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://127.0.0.1:4199/euro-digest/";
const pages = (process.argv[2] ?? ",news/,news/2026-10-22/,about/,this-page-does-not-exist/").split(",");
const sizes = (process.argv[3] ?? "412x823,375x812,1024x768,1280x800").split(",").map((s) => s.split("x").map(Number));

const browser = await chromium.launch();
for (const [w, h] of sizes)
  for (const p of pages) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    await page.evaluate(() => {
      let i = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode;
        const el = t.parentElement;
        if (!t.textContent.trim() || !el || getComputedStyle(el).visibility === "hidden" || el.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        const inFold = [...range.getClientRects()].some((r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
        if (inFold) el.setAttribute("data-fold", String(i++));
      }
    });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-fold]" });
    const used = new Map();
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId });
      const size = parseFloat(computedStyle.find((c) => c.name === "font-size")?.value ?? "16");
      for (const f of fonts) {
        const k = `${f.familyName}${f.isCustomFont ? "" : " (시스템)"}`;
        const e = used.get(k) ?? { glyphs: 0, area: 0 };
        e.glyphs += f.glyphCount;
        e.area += (f.glyphCount * size * size) / 256;
        used.set(k, e);
      }
    }
    console.log(`${w}x${h} /${p}`);
    for (const [k, e] of [...used].sort((a, b) => b[1].area - a[1].area))
      console.log(`  ${String(e.glyphs).padStart(5)}자 · 넓이 ${e.area.toFixed(0).padStart(5)}  ${k}`);
    await ctx.close();
  }
await browser.close();
