/**
 * M1 완료 기준 ②·④ 점검 (plan "### ✅ M1 완료 기준", PRD §15 D23·D24·D28·D43) — 순수 함수. 입출력은 scripts/m1-completion-check.ts.
 *
 *   ② 일 LLM 비용 ≤ $0.10 실측(`runs.json`) — `dailyProdCosts`(KST 발행일별 prod 합계) · `monthlyCosts`(월 prod+dev, dev 50% 알림) ·
 *      `recheckProdCost`(기록된 costUsd = 토큰 × 단가표 재계산인지 — prod 실행은 일일 브리핑 단건 호출뿐이라 단건 단가로 맞아야 한다, D28).
 *      하루·달 귀속과 금액 합산은 scripts/lib/cost.ts(비용 가드와 같은 함수 — startedAt의 KST 날짜, 마이크로달러 정수 합산)를 그대로 쓴다.
 *   ④-a 데이터 — `checkNewsCards`: 모든 카드에 출처명(빈 문자열 아님)·원문 링크(http/https, 발행 게이트와 같은 형식 검사), `ai:false`·`s:[]`(D23).
 *   ④-b 화면 — `checkRenderedPage`: 정적 export HTML에서 카드마다 대표 출처명·원문 링크(href = 데이터 링크)·원제목 글자, 다출처 목록,
 *      카드 안 "AI 작성" 없음, 브리핑 줄마다 `data-ai` = 파일의 ai · 라벨 수(ai:true 1개, ai:false 0개) · 문서 전체 라벨 수 = ai:true 줄 수.
 *   ④-c 원제목 — `compareFeedTitles`: 피드 항목(제목·링크 원문)을 수집기와 같은 처리(normalize.ts `normalizeFeedItem` — 제목 `cleanTitle`,
 *      링크 앞뒤 공백 정리)로 정리해 카드 대표 링크와 같은 항목의 제목이 카드 `t`와 글자 그대로 같은지 본다. 피드에서 빠진 항목은 확인 불가.
 *
 * 출력용 문자열에는 원제목·링크 원문을 대량으로 넣지 않는다 — 불일치만 카드 ID와 짧은 차이 조각으로 남긴다.
 */
import { Window, type Document, type Element } from "happy-dom";

import {
  HttpUrlSchema,
  type BriefFile,
  type BriefLine,
  type NewsCard,
  type NewsFile,
  type RunLog,
} from "@/lib/schema";
import { kstDate, kstMonth } from "@/lib/time";

import {
  MODEL_PRICING,
  assessDevUsage,
  costFromUsage,
  monthToDate,
  roundUsd,
  sumUsd,
} from "./cost";
import { linkFormatProblem } from "./link-check";
import { cleanTitle, decodeEntitiesFully } from "./normalize";

// ─── ② 비용 ──────────────────────────────────────────────────────────────

/** KST 발행일 하루의 prod 실행 합계 */
export interface DayCost {
  /** KST 날짜(실행 startedAt 기준 — 비용 가드와 같은 귀속) */
  date: string;
  /** 그날 prod 실행 수(LLM을 부르지 않은 실행 포함) */
  runs: number;
  /** 비용이 0보다 큰 실행 수 */
  billedRuns: number;
  /** 실행 기록 `brief.requests` 합(D56 — 필드가 없는 옛 기록은 0으로 센다) */
  briefRequests: number;
  /** 비용이 있는데 `brief` 필드가 없는 실행 수(D56 이전 기록 — 요청 수 미기록) */
  requestsUnrecorded: number;
  tokens: RunLog["tokens"];
  costUsd: number;
  /** costUsd ÷ 일 예산 */
  share: number;
  /** 응답 없이 끊긴 요청의 추정 최대 금액 합(실측 비용과 별개 — D56) */
  unbilledRiskUsdMax: number;
}

const ZERO_TOKENS: RunLog["tokens"] = Object.freeze({
  in: 0,
  out: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

/** prod 실행 → KST 날짜별 합계(날짜 오름차순). 금액은 cost.ts `sumUsd`(마이크로달러 정수 합산). */
export function dailyProdCosts(
  prodRuns: readonly RunLog[],
  dailyBudgetUsd: number,
): DayCost[] {
  const byDate = new Map<string, RunLog[]>();
  for (const run of prodRuns) {
    if (run.env !== "prod") {
      throw new Error(`prod 실행만 넣는다 (runId ${run.runId}: ${run.env})`);
    }
    const date = kstDate(run.startedAt);
    byDate.set(date, [...(byDate.get(date) ?? []), run]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, runs]) => {
      const costUsd = sumUsd(runs.map((r) => r.costUsd));
      return {
        date,
        runs: runs.length,
        billedRuns: runs.filter((r) => r.costUsd > 0).length,
        briefRequests: runs.reduce((n, r) => n + (r.brief?.requests ?? 0), 0),
        requestsUnrecorded: runs.filter(
          (r) => r.costUsd > 0 && r.brief === undefined,
        ).length,
        tokens: runs.reduce(
          (t, r) => ({
            in: t.in + r.tokens.in,
            out: t.out + r.tokens.out,
            cacheRead: t.cacheRead + r.tokens.cacheRead,
            cacheWrite: t.cacheWrite + r.tokens.cacheWrite,
          }),
          { ...ZERO_TOKENS },
        ),
        costUsd,
        share: dailyBudgetUsd > 0 ? costUsd / dailyBudgetUsd : 0,
        unbilledRiskUsdMax: sumUsd(
          runs.map((r) => r.brief?.unbilledRisk?.usdMax ?? 0),
        ),
      };
    });
}

/** KST 달 하나의 prod+dev 합계 */
export interface MonthCost {
  /** KST 달 "YYYY-MM" */
  month: string;
  prod: number;
  dev: number;
  total: number;
  monthlyBudgetUsd: number;
  /** total ÷ 월 예산 */
  share: number;
  /** dev ÷ 월 예산 (cost.ts assessDevUsage) */
  devShare: number;
  /** dev가 월 예산의 50%를 넘음(CLAUDE.md §6.3 알림 조건) */
  devAlert: boolean;
}

/** prod·dev 실행 → KST 달별 합계(달 오름차순). 귀속·합산·dev 비율은 cost.ts `monthToDate`·`assessDevUsage` 그대로. */
export function monthlyCosts(
  prodRuns: readonly RunLog[],
  devRuns: readonly RunLog[],
  monthlyBudgetUsd: number,
): MonthCost[] {
  const all = [...prodRuns, ...devRuns];
  // 달마다 그 달에 속한 아무 실행의 시각을 기준 시각으로 넘긴다(monthToDate는 기준 시각의 KST 달로 묶는다)
  const anchors = new Map<string, Date>();
  for (const run of all) {
    const month = kstMonth(run.startedAt);
    if (!anchors.has(month)) anchors.set(month, new Date(run.startedAt));
  }
  return [...anchors.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, anchor]) => {
      const totals = monthToDate(all, anchor);
      const dev = assessDevUsage(all, anchor, monthlyBudgetUsd);
      return {
        month,
        prod: totals.prod,
        dev: totals.dev,
        total: totals.total,
        monthlyBudgetUsd,
        share: monthlyBudgetUsd > 0 ? totals.total / monthlyBudgetUsd : 0,
        devShare: dev.share,
        devAlert: dev.alert,
      };
    });
}

/** 기록된 비용과 토큰 재계산이 다른 prod 실행 */
export interface CostRecheckMismatch {
  runId: string;
  recorded: number;
  /** 단가표 모델별 단건 단가 재계산 값 */
  recomputed: Record<string, number>;
}

/**
 * prod 실행의 costUsd가 토큰 × 단가표(cost.ts `MODEL_PRICING`, 단건 — 일일 브리핑은 Messages API 단건, D28)와 같은지.
 * 실행 기록에는 모델이 없어 단가표의 모든 모델로 계산하고 하나라도 같으면 일치로 본다(지금 단가표는 1개 모델).
 */
export function recheckProdCost(prodRuns: readonly RunLog[]): {
  checked: number;
  mismatches: CostRecheckMismatch[];
} {
  const models = Object.keys(MODEL_PRICING);
  const mismatches: CostRecheckMismatch[] = [];
  for (const run of prodRuns) {
    const recomputed: Record<string, number> = {};
    for (const model of models) {
      recomputed[model] = costFromUsage(model, {
        single: run.tokens,
        batch: { ...ZERO_TOKENS },
      });
    }
    const recorded = roundUsd(run.costUsd);
    if (!Object.values(recomputed).some((usd) => usd === recorded)) {
      mismatches.push({ runId: run.runId, recorded, recomputed });
    }
  }
  return { checked: prodRuns.length, mismatches };
}

/** 브리핑 파일 ↔ 실행 기록 대조 결과 1건(문제 있을 때만) */
export interface BriefRunIssue {
  date: string;
  runId: string;
  detail: string;
}

/**
 * 게시된 브리핑마다 그 파일을 쓴 prod 실행 기록(`runId`)이 runs.json에 있고, LLM 줄이 있으면 비용이 기록돼 있으며, 실행 기록의 줄 수
 * (`summarized` = LLM 줄 · `downgraded` = 템플릿 강등 줄, D24)가 파일과 같은지 — "비용이 runs.json에 기록됨"의 근거.
 */
export function briefRunIssues(
  briefs: readonly BriefFile[],
  prodRuns: readonly RunLog[],
): BriefRunIssue[] {
  const byId = new Map(prodRuns.map((r) => [r.runId, r]));
  const issues: BriefRunIssue[] = [];
  for (const brief of briefs) {
    const issue = (detail: string) =>
      issues.push({ date: brief.date, runId: brief.runId, detail });
    const run = byId.get(brief.runId);
    if (!run) {
      issue("runs.json에 실행 기록 없음");
      continue;
    }
    const ai = brief.lines.filter((l) => l.ai).length;
    const template = brief.lines.length - ai;
    if (ai > 0 && run.costUsd <= 0) issue(`LLM 줄 ${ai}개인데 비용 0`);
    if (run.summarized !== ai) {
      issue(`summarized ${run.summarized} ≠ LLM 줄 ${ai}`);
    }
    if (run.downgraded !== template) {
      issue(`downgraded ${run.downgraded} ≠ 템플릿 줄 ${template}`);
    }
  }
  return issues;
}

// ─── ④-a 데이터: 카드 출처·링크·ai·요약 ──────────────────────────────────

/** 카드 규칙 위반 1건 */
export interface CardIssue {
  /** 일별 뉴스 파일 이름(예: 2026-10-29.json) */
  file: string;
  cardId: string;
  rule:
    | "title-empty"
    | "src-missing"
    | "src-name-empty"
    | "src-url"
    | "ai-true"
    | "summary-lines";
  /** 출처 위치(출처 규칙일 때) */
  srcIndex?: number;
  detail: string;
}

/** 경고(통과) — 출처명이 sources.json 매체명 목록에 없음(발행 게이트 ⑨와 같은 판정) */
export interface CardWarning {
  file: string;
  cardId: string;
  srcIndex: number;
  name: string;
}

export interface NewsFileStats {
  file: string;
  cards: number;
  /** 해외 카드(lang ≠ ko) */
  foreign: number;
  /** 국내 카드(lang = ko) */
  domestic: number;
  sources: number;
}

export interface CardCheckResult {
  files: NewsFileStats[];
  issues: CardIssue[];
  warnings: CardWarning[];
}

/** 원문 링크 검사 — 스키마(http/https·도메인) + 발행 게이트·정규화와 같은 형식 검사(link-check.ts). 문제 없으면 null */
function urlProblem(url: string): string | null {
  if (!/^https?:\/\//iu.test(url)) return "http(s) 아님";
  if (!HttpUrlSchema.safeParse(url).success) return "URL 스키마 실패";
  const problem = linkFormatProblem(url);
  return problem === null ? null : `링크 형식(${problem})`;
}

/**
 * 일별 뉴스 파일(스키마 통과분) → 카드마다 ④ 데이터 규칙. `publishers` = sources.json 소스 매체명(publisherNameOf) 집합.
 * 오류: 제목 빈 값 · 출처 0건 · 출처명 빈 값(공백만 포함) · 링크 형식 · `ai:true` · 요약 줄 있음. 경고: 모르는 매체명.
 */
export function checkNewsCards(
  files: ReadonlyArray<{ file: string; value: NewsFile }>,
  publishers: ReadonlySet<string>,
): CardCheckResult {
  const result: CardCheckResult = { files: [], issues: [], warnings: [] };
  for (const { file, value } of files) {
    let foreign = 0;
    let sources = 0;
    for (const card of value.cards) {
      const issue = (
        rule: CardIssue["rule"],
        detail: string,
        srcIndex?: number,
      ) =>
        result.issues.push({
          file,
          cardId: card.id,
          rule,
          detail,
          ...(srcIndex === undefined ? {} : { srcIndex }),
        });
      if (card.lang !== "ko") foreign += 1;
      sources += card.src.length;
      if (card.t.trim() === "") issue("title-empty", "제목이 비었다");
      if (card.src.length === 0) issue("src-missing", "출처가 없다");
      card.src.forEach((src, j) => {
        if (src.n.trim() === "") issue("src-name-empty", "출처명이 비었다", j);
        else if (!publishers.has(src.n)) {
          result.warnings.push({
            file,
            cardId: card.id,
            srcIndex: j,
            name: src.n,
          });
        }
        const problem = urlProblem(src.u);
        if (problem !== null) issue("src-url", problem, j);
      });
      if (card.ai) issue("ai-true", "뉴스 카드 ai:true(D23 위반)");
      if (card.s.length > 0) {
        issue(
          "summary-lines",
          `요약 줄 ${card.s.length}개(D23 — s:[]여야 한다)`,
        );
      }
    }
    result.files.push({
      file,
      cards: value.cards.length,
      foreign,
      domestic: value.cards.length - foreign,
      sources,
    });
  }
  return result;
}

// ─── ④-b 화면: 정적 export HTML ──────────────────────────────────────────

/** 페이지 하나에서 기대하는 것 — 그 페이지가 싣는 호의 카드(삭제 요청 제외, 파일 순서)와 브리핑 줄(블록이 없으면 null) */
export interface PageExpectation {
  cards: readonly NewsCard[];
  /** 브리핑 블록의 줄. 블록이 없어야 하는 페이지(`/news/`·브리핑 파일 없는 호)는 null, mode empty는 [] */
  briefLines: readonly BriefLine[] | null;
}

export interface PageCheckResult {
  /** 렌더된 카드 수 */
  cards: number;
  /** 출처 2건 이상 카드 수(펼침 목록 검사 대상) */
  multiSource: number;
  /** 렌더된 브리핑 줄 수 */
  briefRows: number;
  /** 문서 전체 "AI 작성" 라벨(`[data-slot=ai-label]`) 수 */
  aiLabels: number;
  /** 글자가 정확히 "AI 작성"인 요소 수(라벨 컴포넌트를 거치지 않은 라벨까지 잡는다) */
  aiLabelTexts: number;
  /** 기대 ai:true 줄 수 */
  aiTrue: number;
  issues: string[];
}

/** 화면 밖 글자·장식(↗)을 뺀 보이는 글자 */
function visibleText(el: Element, drop: readonly string[]): string {
  const clone = el.cloneNode(true) as Element;
  for (const selector of drop) {
    for (const node of [...clone.querySelectorAll(selector)]) node.remove();
  }
  return clone.textContent ?? "";
}

/** 글자가 정확히 "AI 작성"이고 같은 글자의 자식 요소가 없는 요소 수 — script·style 안은 요소가 아니므로 세지 않는다 */
function countAiLabelTexts(doc: Document): number {
  let n = 0;
  for (const el of [...doc.body.querySelectorAll("*")]) {
    if ((el.textContent ?? "").trim() !== "AI 작성") continue;
    const child = [...el.children].some(
      (c) => (c.textContent ?? "").trim() === "AI 작성",
    );
    if (!child) n += 1;
  }
  return n;
}

/** HTML 문자열 → 문서(스크립트·CSS를 실행·로드하지 않는다). 끝나면 close를 부른다 */
export function parseHtml(html: string): { doc: Document; close: () => void } {
  const window = new Window({
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });
  const doc = new window.DOMParser().parseFromString(html, "text/html");
  return { doc, close: () => void window.happyDOM.close() };
}

/** 카드 1장(`<article id=카드ID>`) → 문제 목록 */
function checkArticle(article: Element, card: NewsCard): string[] {
  const out: string[] = [];
  const id = card.id;
  const lead = card.src[0];
  const titleLink = article.querySelector(`[id="${id}-t"] a`);
  if (!titleLink) out.push(`${id}: 제목 링크 없음`);
  else {
    if (titleLink.getAttribute("href") !== lead?.u) {
      out.push(`${id}: 제목 링크 href ≠ 데이터 대표 링크`);
    }
    if (
      visibleText(titleLink, ["[aria-hidden='true']", ".sr-only"]) !== card.t
    ) {
      out.push(`${id}: 제목 글자 ≠ 데이터 t`);
    }
  }
  // 메타 줄 — 시각(time[data-rel])과 같은 줄의 첫 span = 대표 출처명
  const time = article.querySelector("time[data-rel]");
  const name = [...(time?.parentElement?.children ?? [])].find(
    (el) => el.tagName === "SPAN",
  );
  if (!name || (name.textContent ?? "").trim() === "") {
    out.push(`${id}: 출처명 없음`);
  } else if (name.textContent !== lead?.n) {
    out.push(`${id}: 출처명 ≠ 데이터 src[0].n`);
  }
  // 펼침 출처 목록 — 출처 2건 이상이면 출처 전부(순서 그대로), 1건이면 목록 없음
  const rows = [...article.querySelectorAll(`[id="${id}-src"] > li > a`)];
  if (card.src.length > 1) {
    if (rows.length !== card.src.length) {
      out.push(`${id}: 출처 목록 ${rows.length}행 ≠ 출처 ${card.src.length}건`);
    } else {
      rows.forEach((row, j) => {
        const src = card.src[j];
        if (row.getAttribute("href") !== src?.u) {
          out.push(`${id}: 출처 목록 ${j}행 href ≠ src[${j}].u`);
        }
        const rowName = row.querySelector("span[lang]")?.textContent;
        if (rowName !== src?.n)
          out.push(`${id}: 출처 목록 ${j}행 출처명 ≠ src[${j}].n`);
      });
    }
  } else if (rows.length > 0) {
    out.push(`${id}: 출처 1건인데 출처 목록 ${rows.length}행`);
  }
  // 카드 안 외부 링크는 모두 그 카드의 출처 링크여야 한다
  const urls = new Set(card.src.map((s) => s.u));
  for (const a of [...article.querySelectorAll("a[href]")]) {
    const href = a.getAttribute("href") ?? "";
    if (/^https?:/iu.test(href) && !urls.has(href)) {
      out.push(`${id}: 출처 밖 외부 링크`);
    }
  }
  if (article.querySelector("[data-slot='ai-label']")) {
    out.push(`${id}: 카드에 AI 작성 라벨`);
  }
  if ((article.textContent ?? "").includes("AI 작성")) {
    out.push(`${id}: 카드에 'AI 작성' 글자`);
  }
  return out;
}

/** 브리핑 줄 행들 → 문제 목록(줄 수·data-ai·라벨 수·문장) */
function checkBriefRows(
  rows: readonly Element[],
  lines: readonly BriefLine[] | null,
): string[] {
  if (lines === null) {
    return rows.length > 0
      ? [`브리핑 블록이 없어야 하는데 줄 ${rows.length}개`]
      : [];
  }
  if (rows.length !== lines.length) {
    return [`브리핑 줄 ${rows.length}개 ≠ 파일 ${lines.length}줄`];
  }
  const out: string[] = [];
  rows.forEach((row, i) => {
    const line = lines[i] as BriefLine;
    const no = i + 1;
    if (row.getAttribute("data-ai") !== String(line.ai)) {
      out.push(`브리핑 ${no}줄: data-ai ≠ 파일 ai(${line.ai})`);
    }
    const labels = row.querySelectorAll("[data-slot='ai-label']").length;
    if (labels !== (line.ai ? 1 : 0)) {
      out.push(`브리핑 ${no}줄(ai:${line.ai}): 라벨 ${labels}개`);
    }
    const text = row.querySelector("[data-slot='brief-text']");
    const shown = text
      ? visibleText(text, [
          "[data-slot='ai-label']",
          "[data-slot='ai-label-sep']",
        ])
      : null;
    if (shown !== line.text) out.push(`브리핑 ${no}줄: 문장 ≠ 파일 text`);
  });
  return out;
}

/** 정적 export 페이지 HTML → ④ 화면 규칙(카드 출처·링크·원제목, 브리핑 라벨) 검사 */
export function checkRenderedPage(
  html: string,
  expected: PageExpectation,
): PageCheckResult {
  const { doc, close } = parseHtml(html);
  try {
    const issues: string[] = [];
    const articles = [...doc.querySelectorAll("ol#feed > li > article")];
    const ids = articles.map((a) => a.id);
    const expectedIds = expected.cards.map((c) => c.id);
    if (ids.join(",") !== expectedIds.join(",")) {
      issues.push(
        `카드 목록 불일치 — 화면 ${ids.length}장 · 데이터 ${expectedIds.length}장(순서 포함 비교)`,
      );
    }
    const byId = new Map(expected.cards.map((c) => [c.id, c]));
    for (const article of articles) {
      const card = byId.get(article.id);
      if (!card) issues.push(`${article.id}: 데이터에 없는 카드`);
      else issues.push(...checkArticle(article, card));
    }
    const rows = [...doc.querySelectorAll("li[data-slot='brief-row']")];
    issues.push(...checkBriefRows(rows, expected.briefLines));
    const aiTrue = (expected.briefLines ?? []).filter((l) => l.ai).length;
    const aiLabels = doc.querySelectorAll("[data-slot='ai-label']").length;
    const aiLabelTexts = countAiLabelTexts(doc);
    if (aiLabels !== aiTrue) {
      issues.push(
        `문서 전체 AI 작성 라벨 ${aiLabels}개 ≠ ai:true 줄 ${aiTrue}개`,
      );
    }
    if (aiLabelTexts !== aiTrue) {
      issues.push(
        `글자 'AI 작성' 요소 ${aiLabelTexts}개 ≠ ai:true 줄 ${aiTrue}개`,
      );
    }
    return {
      cards: articles.length,
      multiSource: expected.cards.filter((c) => c.src.length > 1).length,
      briefRows: rows.length,
      aiLabels,
      aiLabelTexts,
      aiTrue,
      issues,
    };
  } finally {
    close();
  }
}

// ─── ④-c 원제목: 피드 원문 대조 ──────────────────────────────────────────

/** 피드 항목의 제목·링크 원문(rss.ts `parseFeedXml` 결과 그대로 — 정리 전) */
export interface FeedItemRef {
  title: string | null;
  link: string | null;
}

/** 소스 피드 1개를 받은 결과 */
export interface FeedSnapshot {
  sourceId: string;
  /** 카드 출처명과 같은 매체명(publisherNameOf) */
  publisher: string;
  ok: boolean;
  /** 실패 사유(실패했을 때) */
  error?: string;
  items: FeedItemRef[];
}

export interface TitleMismatch {
  cardId: string;
  sourceIds: string[];
  /** 차이 설명(짧은 조각만 — 원제목 전체를 옮기지 않는다) */
  detail: string;
}

export interface FeedCompareResult {
  cards: number;
  /** 대표 출처(src[0]) — 링크가 피드 항목과 같고 제목이 (수집기 정리 뒤) 글자 그대로 같은 카드 */
  leadMatch: number;
  /** 그중 정리 전 피드 원문 제목과도 글자 그대로 같은 카드 */
  leadMatchRaw: number;
  /** 정리 뒤에만 같은 카드 — 정리 종류(`cleanKind`) */
  leadCleaned: Array<{ cardId: string; kind: string }>;
  leadMismatch: TitleMismatch[];
  /** 대표 링크가 받은 피드에 없음(피드에서 이미 빠짐) — 불일치로 치지 않는다 */
  leadUnverifiable: string[];
  /** 대표 출처 매체의 피드를 받지 못했거나 수집 대상이 아님 */
  leadOutOfScope: string[];
  /** 같은 링크가 여러 피드에 있고 제목이 서로 다름(카드 제목은 그중 하나와 같음) */
  leadMultiTitle: string[];
  /** 나머지 출처(src[1..]) — 링크가 피드 항목과 같음 / 피드에서 빠짐 / 범위 밖 */
  extraFound: number;
  extraUnverifiable: number;
  extraOutOfScope: number;
  /** 링크는 피드 항목과 같은데 그 피드의 매체명이 카드 출처명과 다름 */
  publisherMismatch: Array<{ cardId: string; srcIndex: number }>;
}

/** 두 제목의 차이를 짧게 — 공백·정규화 차이를 먼저 가리고, 아니면 처음 다른 자리 앞뒤 조각 */
export function describeTitleDiff(card: string, feed: string): string {
  if (card.trim() === feed.trim()) return "앞뒤 공백만 다름";
  const ws = (s: string) => s.replace(/\s+/gu, " ").trim();
  if (ws(card) === ws(feed)) return "공백 종류·개수만 다름";
  if (card.normalize("NFC") === feed.normalize("NFC")) {
    return "유니코드 정규화(NFC)만 다름";
  }
  let i = 0;
  while (i < card.length && i < feed.length && card[i] === feed[i]) i += 1;
  const from = Math.max(0, i - 8);
  const cut = (s: string) =>
    JSON.stringify(s.slice(from, i + 16)) + (s.length > i + 16 ? "…" : "");
  return `길이 카드 ${card.length} · 피드 ${feed.length}, ${i + 1}번째 글자부터 다름 — 카드 ${cut(card)} / 피드 ${cut(feed)}`;
}

/** 피드 원문 제목 → 수집기 정리 결과가 무엇을 바꿨는지(보이는 글자 불변 범위 — normalize.ts `cleanTitle` ①~④) */
export function cleanKind(raw: string, cleaned: string): string {
  if (raw === cleaned) return "없음";
  if (raw.trim() === cleaned) return "앞뒤 공백 정리";
  if (decodeEntitiesFully(raw).trim() === cleaned) return "엔티티 디코딩";
  return "줄바꿈·제어 문자 정리 등";
}

/**
 * 카드 ↔ 피드 원문 대조. 피드 항목은 수집기 정규화와 같은 처리만 한다: 제목 `cleanTitle`(엔티티·줄바꿈 공백·제어 문자·앞뒤 공백),
 * 링크 앞뒤 공백 정리(normalize.ts `normalizeFeedItem`). 링크 비교는 그 뒤 글자 그대로(같은 문자열)다.
 */
export function compareFeedTitles(
  cards: readonly NewsCard[],
  feeds: readonly FeedSnapshot[],
): FeedCompareResult {
  const index = new Map<
    string,
    Array<{
      sourceId: string;
      publisher: string;
      raw: string | null;
      title: string | null;
    }>
  >();
  const okPublishers = new Set<string>();
  for (const feed of feeds) {
    if (!feed.ok) continue;
    okPublishers.add(feed.publisher);
    for (const item of feed.items) {
      const url = item.link?.trim() ?? "";
      if (url === "") continue;
      const entry = {
        sourceId: feed.sourceId,
        publisher: feed.publisher,
        raw: item.title,
        title: item.title === null ? null : cleanTitle(item.title),
      };
      index.set(url, [...(index.get(url) ?? []), entry]);
    }
  }
  const result: FeedCompareResult = {
    cards: cards.length,
    leadMatch: 0,
    leadMatchRaw: 0,
    leadCleaned: [],
    leadMismatch: [],
    leadUnverifiable: [],
    leadOutOfScope: [],
    leadMultiTitle: [],
    extraFound: 0,
    extraUnverifiable: 0,
    extraOutOfScope: 0,
    publisherMismatch: [],
  };
  for (const card of cards) {
    card.src.forEach((src, j) => {
      const entries = index.get(src.u);
      if (entries && !entries.some((e) => e.publisher === src.n)) {
        result.publisherMismatch.push({ cardId: card.id, srcIndex: j });
      }
      if (j > 0) {
        if (entries) result.extraFound += 1;
        else if (okPublishers.has(src.n)) result.extraUnverifiable += 1;
        else result.extraOutOfScope += 1;
        return;
      }
      if (!entries) {
        if (okPublishers.has(src.n)) result.leadUnverifiable.push(card.id);
        else result.leadOutOfScope.push(card.id);
        return;
      }
      const titles = [...new Set(entries.map((e) => e.title ?? ""))];
      if (titles.includes(card.t)) {
        result.leadMatch += 1;
        if (titles.length > 1) result.leadMultiTitle.push(card.id);
        const same = entries.find((e) => e.title === card.t);
        if (entries.some((e) => e.raw === card.t)) result.leadMatchRaw += 1;
        else if (same?.raw != null) {
          result.leadCleaned.push({
            cardId: card.id,
            kind: cleanKind(same.raw, card.t),
          });
        }
        return;
      }
      result.leadMismatch.push({
        cardId: card.id,
        sourceIds: [...new Set(entries.map((e) => e.sourceId))],
        detail: titles.map((t) => describeTitleDiff(card.t, t)).join(" | "),
      });
    });
  }
  return result;
}
