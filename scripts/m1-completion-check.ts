/**
 * M1 완료 기준 ②·④ 점검 진입점 (plan "### ✅ M1 완료 기준", 근거 문서 docs/research/m1-completion-check.md) — LLM은 부르지 않는다.
 * 판정은 scripts/lib/m1-completion.ts의 순수 함수, 여기는 data/·configs·out/ 읽기와 (선택) 피드 받기·출력만 한다. 파일을 쓰지 않는다
 * (`--save-feeds`로 지정한 스냅숏 파일만 — 제목·링크 원문만 담고 본문·요약문은 담지 않는다).
 *
 * 사용법: tsx scripts/m1-completion-check.ts [--feeds | --load-feeds <파일>] [--date YYYY-MM-DD] [--save-feeds <파일>]
 *   (기본)              ② data/runs.json·runs-dev.json 비용 · ④-a data/news 전 파일 카드 규칙 · ④-b out/ 홈·/news/·날짜 아카이브 HTML
 *                       (out/이 없으면 ④-b는 건너뛴다 — 먼저 npm run build)
 *   --feeds             ④-c 수집 대상 소스(configs/sources.json — enabled·terms_checked, 일일 RSS 루프 대상) 피드를 소스당 1회 받아
 *                       --date(기본 최신 발행일) 카드의 원제목·링크를 대조. 06:00~08:00 KST(봇 수집 시간대)에는 거부한다
 *   --load-feeds <파일> 받지 않고 이전 --save-feeds 스냅숏으로 ④-c를 다시 계산
 *   --save-feeds <파일> 받은 피드의 제목·링크 원문을 JSON으로 저장(저장소 밖 경로 권장)
 * 받기는 수집기와 같은 함수·설정이다: rss.ts `fetchFeed`(요청 1회 — 같은 호스트 리다이렉트는 그 안에서 따라감, 재시도 없음)·`feedUserAgent`
 * (CONTACT_EMAIL — 비밀값 아님)·feed-collect.ts `DEFAULT_FEED_POLICY`의 타임아웃·크기·리다이렉트 상한, 같은 호스트 요청 간격(1초)은 지킨다.
 * 피드 파싱은 rss.ts `parseFeedXml`(요약문을 꺼내지 않음 — 제목·링크만 쓴다).
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";

import {
  TakedownsFileSchema,
  type BriefFile,
  type NewsFile,
} from "@/lib/schema";
import { publisherNameOf } from "@/lib/publisher-name";
import { nowUtcIso } from "@/lib/time";

import { isDevQuietHours } from "./lib/api-football-plan";
import { readBriefFile } from "./lib/brief-file";
import { readConfigFile } from "./lib/config-files";
import {
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_MONTHLY_BUDGET_USD,
  formatUsd,
  loadRuns,
} from "./lib/cost";
import { DEFAULT_FEED_POLICY, hostKey } from "./lib/feed-collect";
import {
  briefRunIssues,
  checkNewsCards,
  checkRenderedPage,
  compareFeedTitles,
  dailyProdCosts,
  monthlyCosts,
  recheckProdCost,
  type FeedSnapshot,
  type PageExpectation,
} from "./lib/m1-completion";
import { newsFilePath, readNewsFile } from "./lib/news-file";
import { feedUserAgent, fetchFeed, parseFeedXml } from "./lib/rss";
import { loadSources, planDailySources } from "./lib/sources";

const USAGE = [
  "사용법: tsx scripts/m1-completion-check.ts [--feeds | --load-feeds <파일>] [--date YYYY-MM-DD] [--save-feeds <파일>]",
  "  (기본)              ② 비용 · ④-a 카드 데이터 · ④-b out/ 화면(먼저 npm run build)",
  "  --feeds             ④-c 수집 대상 피드를 소스당 1회 받아 --date 카드의 원제목·링크 대조(06:00~08:00 KST 거부)",
  "  --load-feeds <파일> 받지 않고 저장한 스냅숏으로 ④-c",
  "  --save-feeds <파일> 받은 피드의 제목·링크 원문 저장",
  "  --date <날짜>       ④-c 대상 발행일(기본 최신)",
  "  --help, -h          이 도움말",
].join("\n");

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DATA_DIR = path.join(ROOT_DIR, "data");
const OUT_DIR = path.join(ROOT_DIR, "out");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FeedSnapshotsSchema = z.array(
  z.object({
    sourceId: z.string(),
    publisher: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
    items: z.array(
      z.object({ title: z.string().nullable(), link: z.string().nullable() }),
    ),
  }),
);

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

async function issueDates(): Promise<string[]> {
  const names = await readdir(path.join(DATA_DIR, "news"));
  return names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .map((n) => n.slice(0, 10))
    .sort();
}

async function loadNews(date: string): Promise<NewsFile> {
  const news = await readNewsFile(newsFilePath(DATA_DIR, date));
  if (!news) throw new Error(`data/news/${date}.json 없음`);
  return news;
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

// ─── ② ──────────────────────────────────────────────────────────────────

async function reportCost(): Promise<void> {
  const { prodRuns, devRuns } = await loadRuns(DATA_DIR);
  const days = dailyProdCosts(prodRuns, DEFAULT_DAILY_BUDGET_USD);
  console.log(
    "## ② 일 LLM 비용 (prod, KST 발행일 = 실행 startedAt의 KST 날짜)\n",
  );
  console.log(
    "| 날짜(KST) | 실행 | 과금 실행 | 브리핑 요청 | 입력 | 출력 | 캐시 읽기·쓰기 | 비용 | 일 예산 대비 |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const d of days) {
    const requests =
      d.requestsUnrecorded > 0
        ? `${d.briefRequests} (+미기록 ${d.requestsUnrecorded}실행)`
        : String(d.briefRequests);
    console.log(
      `| ${d.date} | ${d.runs} | ${d.billedRuns} | ${requests} | ${d.tokens.in} | ${d.tokens.out} | ${d.tokens.cacheRead}·${d.tokens.cacheWrite} | ${formatUsd(d.costUsd)} | ${pct(d.share)} |`,
    );
  }
  const max = days.reduce((a, b) => (b.costUsd > a.costUsd ? b : a), days[0]!);
  const over = days.filter((d) => d.costUsd > DEFAULT_DAILY_BUDGET_USD);
  const risk = days.reduce((n, d) => n + d.unbilledRiskUsdMax, 0);
  console.log(
    `\n- prod 실행 ${prodRuns.length}건 · 날짜 ${days.length}일 · 최대 일 비용 ${max ? `${formatUsd(max.costUsd)}(${max.date}, ${pct(max.share)})` : "-"} · 일 예산 ${formatUsd(DEFAULT_DAILY_BUDGET_USD)} 초과 ${over.length}일 · unbilledRisk 합 ${formatUsd(risk)}`,
  );
  console.log(
    `- weekly 실행 ${prodRuns.filter((r) => r.job === "weekly").length}건(prod) · ${devRuns.filter((r) => r.job === "weekly").length}건(dev)`,
  );
  const briefs: BriefFile[] = [];
  for (const date of await issueDates()) {
    const read = await readBriefFile(DATA_DIR, date);
    if (read.error) throw new Error(`data/briefs/${date}.json: ${read.error}`);
    if (read.value) briefs.push(read.value);
  }
  const briefIssues = briefRunIssues(briefs, prodRuns);
  console.log(
    `- 브리핑 파일 ${briefs.length}개 ↔ runs.json 실행 기록(runId·LLM 줄 비용·summarized·downgraded) 불일치 ${briefIssues.length}건${briefIssues.map((i) => ` — ${i.date} ${i.runId}: ${i.detail}`).join("")}`,
  );
  const recheck = recheckProdCost(prodRuns);
  console.log(
    `- 기록 비용 재계산(토큰 × cost.ts 단가표, 단건): ${recheck.checked}건 중 불일치 ${recheck.mismatches.length}건${recheck.mismatches.map((m) => ` — ${m.runId} 기록 ${m.recorded} · 재계산 ${JSON.stringify(m.recomputed)}`).join("")}`,
  );
  console.log(
    "\n| 달(KST) | prod | dev | 합계 | 월 예산 대비 | dev 비율 | dev 50% 초과 |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---|");
  for (const m of monthlyCosts(prodRuns, devRuns, DEFAULT_MONTHLY_BUDGET_USD)) {
    console.log(
      `| ${m.month} | ${formatUsd(m.prod)} | ${formatUsd(m.dev)} | ${formatUsd(m.total)} | ${pct(m.share)} | ${pct(m.devShare)} | ${m.devAlert ? "예" : "아니오"} |`,
    );
  }
  console.log("");
}

// ─── ④-a ────────────────────────────────────────────────────────────────

async function reportCards(dates: readonly string[]): Promise<void> {
  const sources = await loadSources(ROOT_DIR);
  const publishers = new Set(sources.map((s) => publisherNameOf(s)));
  const files = await Promise.all(
    dates.map(async (date) => ({
      file: `${date}.json`,
      value: await loadNews(date),
    })),
  );
  const result = checkNewsCards(files, publishers);
  const sum = (key: "cards" | "foreign" | "domestic" | "sources") =>
    result.files.reduce((n, f) => n + f[key], 0);
  console.log("## ④-a 카드 데이터 (data/news 전 파일)\n");
  console.log(
    `- 파일 ${result.files.length}개 · 카드 ${sum("cards")}장(해외 ${sum("foreign")} · 국내 ${sum("domestic")}) · 출처 ${sum("sources")}건`,
  );
  console.log(
    `- 위반 ${result.issues.length}건 · 경고(모르는 매체명) ${result.warnings.length}건`,
  );
  for (const i of result.issues) {
    console.log(
      `  - ${i.file} ${i.cardId}${i.srcIndex === undefined ? "" : ` src[${i.srcIndex}]`} ${i.rule}: ${i.detail}`,
    );
  }
  for (const w of result.warnings) {
    console.log(
      `  - (경고) ${w.file} ${w.cardId} src[${w.srcIndex}] 매체명 "${w.name}"`,
    );
  }
  console.log("");
}

// ─── ④-b ────────────────────────────────────────────────────────────────

async function takedownIds(): Promise<Set<string>> {
  const list = await readConfigFile(
    ROOT_DIR,
    "takedowns.json",
    TakedownsFileSchema,
  );
  return new Set(list.map((t) => t.id));
}

async function briefLinesOf(
  date: string,
): Promise<PageExpectation["briefLines"]> {
  const read = await readBriefFile(DATA_DIR, date);
  if (read.error)
    throw new Error(`data/briefs/${date}.json 읽기 실패: ${read.error}`);
  return read.value ? read.value.lines : null;
}

async function reportPages(dates: readonly string[]): Promise<void> {
  console.log("## ④-b 화면 (out/ 정적 export HTML)\n");
  if (!(await exists(path.join(OUT_DIR, "index.html")))) {
    console.log("- out/index.html 없음 — npm run build 뒤 다시 실행\n");
    return;
  }
  const removed = await takedownIds();
  const latest = dates.at(-1)!;
  const cardsOf = async (date: string) =>
    (await loadNews(date)).cards.filter((c) => !removed.has(c.id));
  const pages: Array<{
    name: string;
    file: string;
    expected: PageExpectation;
  }> = [
    {
      name: `홈 (${latest})`,
      file: "index.html",
      expected: {
        cards: await cardsOf(latest),
        briefLines: await briefLinesOf(latest),
      },
    },
    {
      name: `/news/ (${latest})`,
      file: "news/index.html",
      expected: { cards: await cardsOf(latest), briefLines: null },
    },
  ];
  for (const date of dates) {
    pages.push({
      name: `/news/${date}/`,
      file: `news/${date}/index.html`,
      expected: {
        cards: await cardsOf(date),
        briefLines: await briefLinesOf(date),
      },
    });
  }
  console.log(
    "| 페이지 | 카드 | 다출처 카드 | 브리핑 줄 | ai:true 줄 | AI 작성 라벨 | 글자 'AI 작성' 요소 | 위반 |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  const problems: string[] = [];
  for (const page of pages) {
    const html = await readFile(path.join(OUT_DIR, page.file), "utf8");
    const r = checkRenderedPage(html, page.expected);
    console.log(
      `| ${page.name} | ${r.cards} | ${r.multiSource} | ${page.expected.briefLines === null ? "블록 없음" : r.briefRows} | ${r.aiTrue} | ${r.aiLabels} | ${r.aiLabelTexts} | ${r.issues.length} |`,
    );
    problems.push(...r.issues.map((i) => `${page.name}: ${i}`));
  }
  console.log(`\n- 위반 ${problems.length}건`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log("");
}

// ─── ④-c ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSnapshots(): Promise<{
  snapshots: FeedSnapshot[];
  requests: number;
  redirects: number;
}> {
  const sources = await loadSources(ROOT_DIR);
  const plan = planDailySources(sources);
  const userAgent = feedUserAgent(process.env.CONTACT_EMAIL);
  const lastByHost = new Map<string, number>();
  const snapshots: FeedSnapshot[] = [];
  let requests = 0;
  let redirects = 0;
  // 순서대로 하나씩 — 같은 호스트는 수집기 간격(1초) 이상 띄운다
  for (const source of plan.feeds) {
    const host = hostKey(source.url);
    const last = lastByHost.get(host);
    if (last !== undefined) {
      const wait = last + DEFAULT_FEED_POLICY.sameHostGapMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    const publisher = publisherNameOf(source);
    requests += 1;
    try {
      const res = await fetchFeed(source.url, {
        fetch: (input, init) => fetch(input, init),
        userAgent,
        timeoutMs: DEFAULT_FEED_POLICY.timeoutMs,
        maxBytes: DEFAULT_FEED_POLICY.maxBytes,
        maxRedirects: DEFAULT_FEED_POLICY.maxRedirects,
      });
      redirects += res.info.redirects;
      const raws = await parseFeedXml(res.text, { summaries: false });
      snapshots.push({
        sourceId: source.id,
        publisher,
        ok: true,
        items: raws.map((r) => ({ title: r.title, link: r.link })),
      });
      console.error(
        `[feeds] ${source.id}: ${raws.length}건 (HTTP ${res.info.status}, 리다이렉트 ${res.info.redirects})`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message.split("\n")[0]! : String(error);
      snapshots.push({
        sourceId: source.id,
        publisher,
        ok: false,
        error: message,
        items: [],
      });
      console.error(`[feeds] ${source.id}: 실패 — ${message}`);
    } finally {
      lastByHost.set(host, Date.now());
    }
  }
  return { snapshots, requests, redirects };
}

async function reportFeeds(
  date: string,
  snapshots: FeedSnapshot[],
  fetched: { requests: number; redirects: number } | null,
): Promise<void> {
  const news = await loadNews(date);
  const r = compareFeedTitles(news.cards, snapshots);
  const foreign = news.cards.filter((c) => c.lang !== "ko");
  const rf = compareFeedTitles(foreign, snapshots);
  console.log(`## ④-c 원제목·링크 ↔ 피드 원문 (${date})\n`);
  if (fetched) {
    console.log(
      `- 요청 ${fetched.requests}건(소스당 1회) · 같은 호스트 리다이렉트 ${fetched.redirects}회(요청 안에서 따라감)`,
    );
  }
  console.log("| 소스 | 받기 | 항목 |");
  console.log("|---|---|---:|");
  for (const s of snapshots) {
    console.log(
      `| ${s.sourceId} | ${s.ok ? "성공" : `실패(${s.error ?? ""})`} | ${s.items.length} |`,
    );
  }
  const line = (label: string, x: typeof r) =>
    `| ${label} | ${x.cards} | ${x.leadMatch} (원문 그대로 ${x.leadMatchRaw}) | ${x.leadMismatch.length} | ${x.leadUnverifiable.length} | ${x.leadOutOfScope.length} | ${x.extraFound}/${x.extraFound + x.extraUnverifiable + x.extraOutOfScope} | ${x.publisherMismatch.length} |`;
  console.log(
    "\n| 범위 | 카드 | 대표 제목 일치 | 불일치 | 확인 불가(피드에서 빠짐) | 범위 밖 | 나머지 출처 링크 피드에 있음 | 매체명 불일치 |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  console.log(line("해외(lang ≠ ko)", rf));
  console.log(
    line(
      "국내(lang = ko)",
      compareFeedTitles(
        news.cards.filter((c) => c.lang === "ko"),
        snapshots,
      ),
    ),
  );
  console.log(line("전체", r));
  if (r.leadMultiTitle.length > 0) {
    console.log(
      `\n- 같은 링크가 여러 피드에 있고 제목이 다름(카드는 그중 하나와 일치): ${r.leadMultiTitle.join(", ")}`,
    );
  }
  for (const c of r.leadCleaned) {
    console.log(`- 수집기 정리 뒤 일치 ${c.cardId}: ${c.kind}`);
  }
  for (const m of r.leadMismatch) {
    console.log(
      `- 불일치 ${m.cardId} (${m.sourceIds.join(", ")}): ${m.detail}`,
    );
  }
  for (const p of r.publisherMismatch) {
    console.log(`- 매체명 불일치 ${p.cardId} src[${p.srcIndex}]`);
  }
  if (r.leadUnverifiable.length > 0) {
    console.log(`- 확인 불가 카드: ${r.leadUnverifiable.join(", ")}`);
  }
  console.log("");
}

// ─── main ───────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  let values: {
    feeds?: boolean;
    "load-feeds"?: string;
    "save-feeds"?: string;
    date?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: false,
      options: {
        feeds: { type: "boolean", default: false },
        "load-feeds": { type: "string" },
        "save-feeds": { type: "string" },
        date: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.feeds && values["load-feeds"]) {
    console.error("--feeds와 --load-feeds는 함께 쓰지 않는다");
    return 2;
  }
  if (values.date !== undefined && !DATE_RE.test(values.date)) {
    console.error(`--date 형식: YYYY-MM-DD (받은 값: ${values.date})`);
    return 2;
  }
  const dates = await issueDates();
  if (dates.length === 0) {
    console.error("data/news에 발행된 호가 없다");
    return 1;
  }
  const target = values.date ?? dates.at(-1)!;
  if (!dates.includes(target)) {
    console.error(`data/news/${target}.json 없음`);
    return 1;
  }

  if (values.feeds || values["load-feeds"]) {
    let snapshots: FeedSnapshot[];
    let fetched: { requests: number; redirects: number } | null = null;
    if (values.feeds) {
      if (isDevQuietHours(nowUtcIso())) {
        console.error(
          "06:00~08:00 KST(봇 수집 시간대)에는 피드를 받지 않는다 — 그 밖 시간에 다시 실행",
        );
        return 1;
      }
      const res = await fetchSnapshots();
      snapshots = res.snapshots;
      fetched = { requests: res.requests, redirects: res.redirects };
      if (values["save-feeds"]) {
        await writeFile(
          values["save-feeds"],
          `${JSON.stringify(snapshots, null, 2)}\n`,
          "utf8",
        );
        console.error(`[feeds] 스냅숏 저장: ${values["save-feeds"]}`);
      }
    } else {
      const text = await readFile(values["load-feeds"]!, "utf8");
      snapshots = FeedSnapshotsSchema.parse(JSON.parse(text));
    }
    await reportFeeds(target, snapshots, fetched);
    return 0;
  }

  await reportCost();
  await reportCards(dates);
  await reportPages(dates);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  },
);
