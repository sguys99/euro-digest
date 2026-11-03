/**
 * OG 이미지 템플릿 HTML (PRD DR-10 · §15 D13 · D71 ②, DESIGN §9.3 D3 "OG 템플릿" · §2.10 OG 면 2종, plan M5-01). I/O 없는 순수 모듈.
 *
 * 확정 시안 `docs/design/d3/concept-mix.html`(C 등번호 — 생성기 `docs/design/d3/build/concept-c.mjs` `ogR` · `ogComp` · `ogTeam` · OG CSS)의
 * 마크업 · CSS를 그대로 옮겼다. 단위는 `cqw`(템플릿 폭 1200px 기준 — 1cqw = 12px). 바꾼 것:
 * - 색 변수(`PIN_R` · `PIN_P`)를 `OG_COLORS`(src/lib/theme.ts — 기존 토큰의 한 테마 값 고정)로.
 * - 크림 면 견본 테두리(`outline: 1px dashed` — 시안 화면 구분용, 1200×630 밖에 그려져 시안 스크린샷에도 없음)를 뺐다.
 * - 팀 약어 채움은 `kitLetterFill`(src/lib/kit-contrast.ts — 크림 면 대비 5.3 하한, 시안 `letterFill(t, 5.3)`과 같은 규칙).
 * - 쪽 이름형(2026-11-03 사용자 결정): 기본 OG에서 태그라인 자리만 쪽 제목으로 바꾼 판(`.ogc__page`).
 * - 대회: 거대 약칭과 정식 이름이 글자 그대로 같으면(라리가) 정식 이름 줄을 빼고 여백으로 둔다(2026-11-03 사용자 결정 — `ogFullNameLine`).
 * 글자는 `ogTexts`(src/lib/og.ts)의 값만 쓴다 — tests/og.test.ts가 마크업 글자와 대조하고 서브셋 커버리지 · 결과 노출 0을 본다.
 *
 * 글꼴은 저장소 서브셋(public/fonts — EuroDigest Sans 400 · 800, Barlow Condensed 600 · 800)만. 빌드 스크립트가 FontFace로 넣고
 * 모두 loaded인지 확인한 뒤 찍는다(scripts/build-og.ts).
 */
import { kitLetterFill } from "@/lib/kit-contrast";
import {
  isLatinShort,
  ogFullNameLine,
  OG_HEIGHT,
  OG_LATIN_WORDMARK,
  OG_WIDTH,
  type OgCard,
} from "@/lib/og";
import type { CompId } from "@/lib/schema/common";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { OG_COLORS } from "@/lib/theme";

const R = OG_COLORS.red;
const P = OG_COLORS.cream;

const COMP_IDS = Object.keys(P.competition) as CompId[];

/** 대회 색 클래스 — 시안 `.tab--{slug}` */
function compClass(id: CompId): string {
  return `c-${id.toLowerCase()}`;
}

/**
 * 템플릿 CSS — 시안 base.css의 `.og` 공용 틀 + concept-c.mjs OG CSS(값 그대로) + 문서 기본값(시안 body: 16px · 행간 1.55 · keep-all ·
 * antialiased). 이 문자열이 바뀌면 모든 OG 이미지의 입력 해시가 바뀐다(다시 굽는다).
 */
export const OG_TEMPLATE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:${R.face}}
body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;font-size:16px;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
:root{--font-sans:"EuroDigest Sans";--font-numeric:"Barlow Condensed","EuroDigest Sans"}
.og{container-type:inline-size;position:relative;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;font-family:var(--font-sans);font-synthesis:none;color-scheme:light}
.og *{margin:0}
.og .n{font-family:var(--font-numeric);font-variant-numeric:tabular-nums lining-nums}
/* 레드 면 — 기본 · 날짜 · 쪽 이름형 (DESIGN §2.10 ①) */
.og--cr{--ticket:${R.face};--ticket-fg:${R.fg};--ticket-fg-2:${R.fg2};background:var(--ticket);color:var(--ticket-fg)}
.ogc__top{position:absolute;left:5cqw;top:4.6cqw;max-width:52cqw}
.ogc__wm{font-size:5.6cqw;font-weight:800;letter-spacing:-.05em;line-height:1.05;white-space:nowrap}
.ogc__en{font:800 1.7cqw/1 var(--font-numeric);letter-spacing:.34em;color:var(--ticket-fg-2);margin-top:1.4cqw}
.ogc__tag{font-size:2.6cqw;margin-top:2.4cqw;color:var(--ticket-fg)}
.ogc__page{font-size:4.4cqw;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin-top:2.4cqw;color:var(--ticket-fg)}
.ogc__no{display:flex;align-items:baseline;gap:1cqw;margin-top:2.4cqw;font-size:2.6cqw;font-weight:800;white-space:nowrap}
.ogc__no i{display:inline-block;width:5cqw;border-bottom:.25cqw solid var(--ticket-fg-2);transform:translateY(-.5cqw)}
.ogc__no b{margin-left:2cqw;padding-left:2cqw;border-left:.25cqw solid var(--ticket-fg-2);font-weight:800}
.ogc__big{position:absolute;right:4cqw;bottom:-7.2cqw;font:800 46cqw/1 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.02em;color:var(--ticket-fg)}
/* 크림 면 — 대회 · 팀 (DESIGN §2.10 ②) */
.og--cp{--paper:${P.face};--ink:${P.ink};--ink-2:${P.ink2};background:var(--paper);color:var(--ink)}
${COMP_IDS.map((id) => `.${compClass(id)}{--c:${P.competition[id].face};--competition-foreground:${P.competition[id].fg}}`).join("\n")}
.ogc__sig{position:absolute;left:5cqw;top:4.4cqw;font-size:2.2cqw;font-weight:800;color:var(--ink)}
.ogc__sig span{font:800 1.5cqw/1 var(--font-numeric);letter-spacing:.3em;color:var(--ink-2);margin-left:1.2cqw}
.ogc__short{position:absolute;left:4.4cqw;top:8cqw;font-size:17cqw;font-weight:800;letter-spacing:-.05em;line-height:1.1}
.ogc__short--l{font:800 27cqw/.9 var(--font-numeric);letter-spacing:-.01em;top:9cqw}
.ogc__name{position:absolute;left:5cqw;bottom:13.4cqw;font-size:4.4cqw;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.ogc__bar{position:absolute;left:0;right:0;bottom:0;height:9cqw;display:flex;justify-content:space-between;align-items:center;padding:0 5cqw;background:var(--c);color:var(--competition-foreground);font-size:2.4cqw;font-weight:800}
.ogc__bar span[lang]{font:600 2.8cqw/1 var(--font-numeric);letter-spacing:.02em}
.ogc__bar .n{font:600 1.1em/1 var(--font-numeric)}
.ogc__abbr{position:absolute;left:4.4cqw;top:9.5cqw}
.ogc__abbr p{font:800 26cqw/.86 var(--font-numeric);letter-spacing:.01em;color:var(--kl)}
.ogc__abbr i{display:block;height:3.6cqw;margin-top:1.6cqw;background:linear-gradient(90deg,var(--k1) 50%,var(--k2) 50%);outline:.25cqw solid var(--ink)}
.ogc__tm{position:absolute;left:5cqw;right:5cqw;bottom:4.6cqw}
.og--ct .ogc__tm{left:auto;right:5cqw;bottom:5cqw;width:42cqw;text-align:right}
.ogc__tabs{display:flex;justify-content:flex-end;gap:.8cqw}
.ogc__ftab{display:inline-flex;align-items:center;height:3.6cqw;padding:0 1.2cqw;background:var(--c);color:var(--competition-foreground);font-size:2.1cqw;font-weight:800}
.ogc__name--t{position:static;font-size:5.6cqw;margin-top:1.6cqw;line-height:1.08}
.ogc__en2{font:600 2.4cqw/1.1 var(--font-numeric);letter-spacing:.02em;color:var(--ink-2);margin-top:1.2cqw}
`;

/** HTML 글자 이스케이프 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const esc = escapeHtml;

/** 레드 면 머리 — 워드마크 + EURO DIGEST */
const HEAD = `<p class="ogc__wm">${esc(SITE_NAME)}</p><p class="ogc__en" lang="en">${OG_LATIN_WORDMARK}</p>`;

/** 크림 면 서명 */
const SIG = `<p class="ogc__sig">${esc(SITE_NAME)} <span lang="en">${OG_LATIN_WORDMARK}</span></p>`;

function red(top: string, big: string): string {
  return `<div class="og og--cr"><div class="ogc__top">${top}</div><p class="ogc__big n">${esc(big)}</p></div>`;
}

/** 카드 한 장의 마크업(`<div class="og">` 하나) */
export function ogCardHtml(card: OgCard): string {
  switch (card.kind) {
    case "default":
      return red(`${HEAD}<p class="ogc__tag">${esc(SITE_TAGLINE)}</p>`, "5");
    case "page":
      return red(`${HEAD}<p class="ogc__page">${esc(card.title)}</p>`, "5");
    case "news":
      return red(
        `${HEAD}<p class="ogc__no"><span>제</span><i></i><span>호</span><b>${esc(card.label)}</b></p>`,
        String(card.no),
      );
    case "competition": {
      const latin = isLatinShort(card.shortKo);
      return `<div class="og og--cp">${SIG}<p class="ogc__short${latin ? " ogc__short--l" : ""}">${esc(card.shortKo)}</p>${ogFullNameLine(
        card,
      )
        .map((name) => `<p class="ogc__name">${esc(name)}</p>`)
        .join(
          "",
        )}<p class="ogc__bar ${compClass(card.id)}"><span lang="en">${esc(card.nameEn)}</span><span><span class="n">${esc(card.season)}</span> 시즌</span></p></div>`;
    }
    case "team": {
      const [shirt, shorts] = card.kit;
      const fill = kitLetterFill(shirt, shorts, P.face);
      const tabs = card.comps
        .map(
          (c) =>
            `<span class="ogc__ftab ${compClass(c.id)}">${esc(c.shortKo)}</span>`,
        )
        .join("");
      return `<div class="og og--cp og--ct">${SIG}<div class="ogc__abbr" style="--k1:${shirt};--k2:${shorts};--kl:${fill}"><p class="n">${esc(card.short)}</p><i></i></div><div class="ogc__tm"><p class="ogc__tabs">${tabs}</p><p class="ogc__name ogc__name--t">${esc(card.name)}</p><p class="ogc__en2" lang="en">${esc(card.nameEn)}</p></div></div>`;
    }
  }
}

/** 찍을 문서 — 글꼴은 빌드 스크립트가 FontFace로 넣는다(문서에는 이름만). 카드 마크업은 `#og` 안에 바꿔 끼운다 */
export const OG_DOCUMENT = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>og</title><style>${OG_TEMPLATE_CSS}</style></head><body><div id="og"></div></body></html>`;
