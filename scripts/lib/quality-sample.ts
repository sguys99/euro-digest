/**
 * 첫 주간 품질 검수 표본 (plan M1-43, PRD §15 D23·D24·D47) — 순수 함수. 진입점 scripts/quality-sample.ts가 data/·configs·
 * football-data를 읽어 넘기고 `docs/research/m1-quality-review.md`를 쓴다.
 *
 * 표본
 *   - 브리핑 줄 최대 20줄 — 기간의 모든 줄 중 AI 줄(`ai:true`)을 먼저, 모자라면 템플릿 줄로 채운다. 20줄을 넘으면 결정적 순서
 *     (sha256(시드:발행일:줄 번호))로 고른다. 각 줄 옆에 refs가 가리키는 **입력 사실**을 둔다: `m<id>` = football-data 경기(같은 창
 *     — `briefInputWindow`로 다시 받은 종료 경기: 대회·팀·최종 스코어·연장/승부차기) + 득점(경기 기록 원장 `data/matches/` — 대응표
 *     `configs/team-ids.json`으로 fd 팀 id → API-Football 팀 id, 킥오프 5분 안 · `goalsComplete`만). `s<약칭>` = 순위표 — 발행 시점
 *     값은 저장되지 않아 수동 대조.
 *   - 카드 20건 — 카테고리별 층(7개)을 돌아가며 1장씩(층 안은 sha256(시드:카드 id) 순) 고른다. 비율 표본이 아니라 규칙별 점검용이라
 *     '기타'가 과대 대표되지 않는다(정확도 해석 시 주의 — 문서에 적는다).
 * 자동 표시(판정을 대신하지 않는다): 🔤 남은 라틴 문자 이름(`unknownNamesInText` — 미등록 고유명사), 漢 한자·가나 혼입,
 * 🔗 refs 경기가 그 창의 종료 경기에 없음. 판정 칸(✅/❌)·메모는 비워 두고, 다시 만들 때 같은 키 행의 값을 옮긴다.
 */
import { createHash } from "node:crypto";

import {
  CategorySchema,
  type BriefFile,
  type Category,
  type CompetitionConfig,
  type LedgerMatch,
  type NewsCard,
} from "@/lib/schema";
import { formatKst } from "@/lib/time";

import { STANDINGS_REF_CODE } from "./brief-input";
import type { FinishedMatch, Score } from "./match-data";
import {
  PERSON_KINDS,
  TEAM_KINDS,
  koreanName,
  koreanNameBySlug,
  unknownNamesInText,
  type NameIndex,
} from "./names";
import {
  cell,
  readBlock,
  renderTable,
  replaceBlock,
  tableCellsByKey,
} from "./research-doc";
import { PAIRING_KICKOFF_TOLERANCE_MS, type TeamIdIndex } from "./team-ids";

export const QUALITY_DOC_REL = "docs/research/m1-quality-review.md";
export const QUALITY_SAMPLE_SIZE = 20;
/** 목표(plan M1-43) — 브리핑 줄 정확도 */
export const BRIEF_ACCURACY_TARGET = 0.9;

/** 카드 층 = 카테고리 전체(스키마 순서 — 카테고리가 늘면 같이 는다) */
export const CARD_STRATA: readonly Category[] = CategorySchema.options;

/** 결정적 순서 키 */
export function sampleKey(seed: number, key: string): string {
  return createHash("sha256").update(`${seed}:${key}`).digest("hex");
}

// ─── 브리핑 줄 ───────────────────────────────────────────────────────────

export interface BriefLineItem {
  /** 표 키 `B:<발행일>#<줄 번호>` */
  key: string;
  date: string;
  /** 1부터 */
  index: number;
  text: string;
  ai: boolean;
  refs: string[];
}

export function briefLines(files: readonly BriefFile[]): BriefLineItem[] {
  return [...files]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((f) =>
      f.lines.map((l, i) => ({
        key: `B:${f.date}#${i + 1}`,
        date: f.date,
        index: i + 1,
        text: l.text,
        ai: l.ai,
        refs: [...l.refs],
      })),
    );
}

/** AI 줄 먼저(시드 순), 모자라면 템플릿 줄 — 결과는 발행일·줄 번호 순 */
export function sampleBriefLines(
  lines: readonly BriefLineItem[],
  seed: number,
  size = QUALITY_SAMPLE_SIZE,
): BriefLineItem[] {
  const order = (xs: readonly BriefLineItem[]) =>
    [...xs].sort((a, b) =>
      sampleKey(seed, a.key) < sampleKey(seed, b.key) ? -1 : 1,
    );
  const picked = [
    ...order(lines.filter((l) => l.ai)),
    ...order(lines.filter((l) => !l.ai)),
  ].slice(0, size);
  return picked.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.index - b.index,
  );
}

// ─── 카드 ────────────────────────────────────────────────────────────────

export interface CardItem {
  date: string;
  card: NewsCard;
}

/** 카테고리 층을 돌아가며 1장씩(층 안은 시드 순) — 결과는 층 순서·발행일 순 */
export function sampleCards(
  items: readonly CardItem[],
  seed: number,
  size = QUALITY_SAMPLE_SIZE,
): CardItem[] {
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    if (seen.has(it.card.id)) return false;
    seen.add(it.card.id);
    return true;
  });
  const buckets = CARD_STRATA.map((cat) =>
    unique
      .filter((it) => it.card.cat === cat)
      .sort((a, b) =>
        sampleKey(seed, a.card.id) < sampleKey(seed, b.card.id) ? -1 : 1,
      ),
  );
  const picked: CardItem[] = [];
  for (let round = 0; picked.length < size; round += 1) {
    let added = false;
    for (const bucket of buckets) {
      const it = bucket[round];
      if (!it) continue;
      picked.push(it);
      added = true;
      if (picked.length >= size) break;
    }
    if (!added) break;
  }
  const rank = new Map(CARD_STRATA.map((c, i) => [c, i] as const));
  return picked.sort(
    (a, b) =>
      (rank.get(a.card.cat) ?? 99) - (rank.get(b.card.cat) ?? 99) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.card.id < b.card.id ? -1 : 1),
  );
}

// ─── 입력 사실 ───────────────────────────────────────────────────────────

export interface MatchFact {
  matchId: number;
  text: string;
}

function scoreText(s: Score): string {
  return `${s.home}-${s.away}`;
}

function nameWithKo(
  names: NameIndex | null,
  en: string,
  kinds: Parameters<typeof koreanName>[2],
): string {
  const ko = names ? koreanName(names, en, kinds) : null;
  return ko ? `${en}(${ko})` : en;
}

/** 원장 경기 찾기 — 대응표로 fd 팀 id → af 팀 id, 킥오프 허용 차 안 */
export function findLedgerMatch(
  fd: Pick<FinishedMatch, "kickoff" | "home" | "away">,
  ledger: readonly LedgerMatch[],
  teams: TeamIdIndex,
): LedgerMatch | null {
  const afOf = (fdId: number): number | null => {
    const slug = teams.byFd.get(fdId);
    return slug ? (teams.bySlug.get(slug)?.af ?? null) : null;
  };
  const home = afOf(fd.home.id);
  const away = afOf(fd.away.id);
  if (home === null || away === null) return null;
  const t = Date.parse(fd.kickoff);
  return (
    ledger.find(
      (m) =>
        m.home.id === home &&
        m.away.id === away &&
        Math.abs(Date.parse(m.kickoff) - t) <= PAIRING_KICKOFF_TOLERANCE_MS,
    ) ?? null
  );
}

/** 득점 줄 — `12' Harry Kane(해리 케인)` · PK · 자책 */
export function goalsText(m: LedgerMatch, names: NameIndex | null): string {
  if (!m.goalsComplete) return "득점: 원장 득점 불완전(사실로 쓰지 않음)";
  if (m.goals.length === 0) return "득점 없음";
  return `득점: ${m.goals
    .map((g) => {
      const min = g.extra !== null ? `${g.minute}+${g.extra}'` : `${g.minute}'`;
      const team = g.side === "home" ? m.home.name : m.away.name;
      const kind =
        g.kind === "penalty" ? " PK" : g.kind === "own-goal" ? " 자책" : "";
      const assist = g.assist
        ? ` ← ${nameWithKo(names, g.assist.name, PERSON_KINDS)}`
        : "";
      return `${min} ${nameWithKo(names, g.scorer.name, PERSON_KINDS)}${kind} (${team})${assist}`;
    })
    .join(", ")}`;
}

/** football-data 종료 경기 + 원장 → 경기 id별 사실 문장 */
export function matchFacts(
  results: readonly FinishedMatch[],
  ctx: {
    competitions: readonly Pick<CompetitionConfig, "id" | "shortKo">[];
    ledger: readonly LedgerMatch[] | null;
    teams: TeamIdIndex | null;
    names: NameIndex | null;
  },
): Map<number, MatchFact> {
  const compName = new Map(ctx.competitions.map((c) => [c.id, c.shortKo]));
  const out = new Map<number, MatchFact>();
  for (const r of results) {
    const extra =
      r.score.duration === "PENALTY_SHOOTOUT" && r.score.pens
        ? ` (연장 · 승부차기 ${scoreText(r.score.pens)})`
        : r.score.duration === "EXTRA_TIME"
          ? " (연장)"
          : "";
    const ledgerMatch =
      ctx.ledger && ctx.teams
        ? findLedgerMatch(r, ctx.ledger, ctx.teams)
        : null;
    const goals = ledgerMatch
      ? goalsText(ledgerMatch, ctx.names)
      : ctx.ledger === null
        ? "득점: 원장 없음(확인 불가)"
        : "득점: 원장에 연결된 경기 없음(확인 불가)";
    out.set(r.matchId, {
      matchId: r.matchId,
      text: `${compName.get(r.comp) ?? r.comp} ${formatKst(r.kickoff, "short")} · ${nameWithKo(ctx.names, r.home.name, TEAM_KINDS)} ${scoreText(r.score.ft)} ${nameWithKo(ctx.names, r.away.name, TEAM_KINDS)}${extra} · ${goals}`,
    });
  }
  return out;
}

const STANDINGS_CODES = new Map(
  Object.entries(STANDINGS_REF_CODE).map(([comp, code]) => [`s${code}`, comp]),
);

export interface LineCheck {
  facts: string[];
  flags: string[];
}

/**
 * 줄 하나의 입력 사실·자동 표시. `factsByDate`에 그 날짜가 없으면(경기 데이터를 받지 못함) refs는 확인 불가.
 */
export function checkBriefLine(
  line: BriefLineItem,
  factsByDate: ReadonlyMap<string, ReadonlyMap<number, MatchFact>>,
  names: NameIndex | null,
  competitions: readonly Pick<CompetitionConfig, "id" | "shortKo">[] = [],
): LineCheck {
  const compName = new Map<string, string>(
    competitions.map((c) => [c.id, c.shortKo]),
  );
  const facts: string[] = [];
  const flags: string[] = [];
  const dayFacts = factsByDate.get(line.date) ?? null;
  for (const ref of line.refs) {
    if (/^m\d+$/.test(ref)) {
      if (!dayFacts) {
        facts.push(`${ref}: 확인 불가(경기 데이터 없음)`);
        continue;
      }
      const f = dayFacts.get(Number(ref.slice(1)));
      if (f) facts.push(`${ref}: ${f.text}`);
      else {
        facts.push(`${ref}: 그 창의 종료 경기에 없음`);
        flags.push(`🔗 ${ref} 입력 창에 없음`);
      }
      continue;
    }
    const comp = STANDINGS_CODES.get(ref);
    if (comp) {
      facts.push(
        `${ref}: ${compName.get(comp) ?? comp} 순위표 상위 4 — 발행 시점 값 미보관(수동 대조)`,
      );
      continue;
    }
    facts.push(`${ref}: 모르는 근거`);
    flags.push(`🔗 ${ref} 모르는 근거`);
  }
  if (names) {
    const latin = unknownNamesInText(line.text, names);
    if (latin.length > 0) flags.push(`🔤 ${latin.join(", ")}`);
  }
  if (
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line.text)
  ) {
    flags.push("漢 한자·가나 혼입");
  }
  return { facts, flags };
}

// ─── 판정 집계 ───────────────────────────────────────────────────────────

/** 판정 칸 → true(맞음)·false(틀림)·null(미판정) */
const JUDGE_TRUE: ReadonlySet<string> = new Set(["✅", "✔", "✔️", "O", "o"]);
const JUDGE_FALSE: ReadonlySet<string> = new Set(["❌", "✖", "✖️", "X", "x"]);

/** 판정 칸 → true(맞음)·false(틀림)·null(미판정) — 칸 값 **전체**가 기호여야 한다(설명은 메모 칸, "OK"·"x표"는 미판정) */
export function judgement(value: string | undefined): boolean | null {
  const v = value?.trim() ?? "";
  if (JUDGE_TRUE.has(v)) return true;
  if (JUDGE_FALSE.has(v)) return false;
  return null;
}

export interface Tally {
  judged: number;
  correct: number;
  wrong: number;
  /** correct / judged — 판정 없으면 null */
  accuracy: number | null;
}

export function tally(values: ReadonlyArray<boolean | null>): Tally {
  const judged = values.filter((v) => v !== null).length;
  const correct = values.filter((v) => v === true).length;
  return {
    judged,
    correct,
    wrong: judged - correct,
    accuracy: judged === 0 ? null : correct / judged,
  };
}

// ─── 문서 ────────────────────────────────────────────────────────────────

export const BRIEF_TABLE_HEADER = [
  "키",
  "발행일",
  "#",
  "줄",
  "AI",
  "refs",
  "입력 사실",
  "자동 표시",
  "판정(사실)",
  "판정(고유명사)",
  "메모",
] as const;
const BRIEF_JUDGE_COLUMNS = ["판정(사실)", "판정(고유명사)", "메모"] as const;

export const CARD_TABLE_HEADER = [
  "키",
  "발행일",
  "원제목",
  "출처",
  "lang",
  "cat",
  "comp",
  "태그(팀·선수)",
  "이적",
  "spoiler",
  "kr",
  "imp",
  "판정(cat)",
  "판정(태그)",
  "판정(이적)",
  "판정(spoiler)",
  "메모",
] as const;
const CARD_JUDGE_COLUMNS = [
  "판정(cat)",
  "판정(태그)",
  "판정(이적)",
  "판정(spoiler)",
  "메모",
] as const;

export const QUALITY_BLOCKS = Object.freeze({
  summary: "quality:summary",
  brief: "quality:brief",
  cards: "quality:cards",
});

export interface QualityInput {
  from: string;
  to: string;
  seed: number;
  generatedAt: string;
  lines: ReadonlyArray<BriefLineItem & { check: LineCheck }>;
  /** 기간의 브리핑 줄 전체 수 · AI 줄 수 */
  lineTotals: { all: number; ai: number };
  cards: readonly CardItem[];
  cardTotal: number;
  /** 경기 사실 출처 설명(받은 날짜·실패) */
  factsNote: string;
  names: NameIndex | null;
}

function tagText(card: NewsCard, names: NameIndex | null): string {
  const show = (kind: "team" | "player", slug: string) => {
    const ko = names ? koreanNameBySlug(names, kind, slug) : null;
    return ko ? `${slug}(${ko})` : slug;
  };
  const parts = [
    ...card.teams.map((s) => show("team", s)),
    ...card.players.map((s) => show("player", s)),
  ];
  return parts.join(", ") || "—";
}

function transferText(card: NewsCard): string {
  const t = card.transfer;
  if (!t) return "—";
  return `${t.status} · T${t.tier} · ${t.player}${t.from || t.to ? ` (${t.from ?? "?"} → ${t.to ?? "?"})` : ""}`;
}

function pct(t: Tally): string {
  return t.accuracy === null ? "—" : `${(t.accuracy * 100).toFixed(0)}%`;
}

/**
 * 표본 → 문서 전체. `previous`(기존 문서)의 같은 키 행에서 판정·메모 칸을 옮기고, 그 판정으로 집계 칸을 채운다.
 * 반환의 `orphans` = 기존 문서에 판정이 있었는데 새 표본에 없는 키(덮어쓰면 잃는다 — 진입점이 --force 없이는 멈춘다).
 */
export function renderQualityDoc(
  input: QualityInput,
  previous: string | null,
): { doc: string; orphans: string[] } {
  const prevBrief = tableCellsByKey(
    previous ? readBlock(previous, QUALITY_BLOCKS.brief) : null,
    BRIEF_JUDGE_COLUMNS,
  );
  const prevCards = tableCellsByKey(
    previous ? readBlock(previous, QUALITY_BLOCKS.cards) : null,
    CARD_JUDGE_COLUMNS,
  );
  const briefRows = input.lines.map((l) => {
    const keep = prevBrief.get(l.key) ?? {};
    return [
      l.key,
      l.date,
      String(l.index),
      cell(l.text),
      l.ai ? "AI" : "템플릿",
      cell(l.refs.join(" ")),
      cell(l.check.facts.join(" / ")),
      cell(l.check.flags.join(" · ")),
      cell(keep["판정(사실)"]),
      cell(keep["판정(고유명사)"]),
      cell(keep["메모"]),
    ];
  });
  const cardRows = input.cards.map(({ date, card }) => {
    const keep = prevCards.get(card.id) ?? {};
    const first = card.src[0];
    return [
      card.id,
      date,
      cell(card.t),
      cell(
        `${first?.n ?? "?"}${card.src.length > 1 ? ` 외 ${card.src.length - 1}` : ""}`,
      ),
      card.lang,
      card.cat,
      cell(card.comp.join(", ")),
      cell(tagText(card, input.names)),
      cell(transferText(card)),
      card.spoiler ? "Y" : "N",
      card.kr ? "Y" : "N",
      String(card.imp),
      cell(keep["판정(cat)"]),
      cell(keep["판정(태그)"]),
      cell(keep["판정(이적)"]),
      cell(keep["판정(spoiler)"]),
      cell(keep["메모"]),
    ];
  });
  const sampled = new Set([
    ...input.lines.map((l) => l.key),
    ...input.cards.map((c) => c.card.id),
  ]);
  const orphans = [...prevBrief, ...prevCards]
    .filter(
      ([key, values]) =>
        !sampled.has(key) &&
        Object.entries(values).some(([col, v]) =>
          col === "메모" ? v.trim() !== "" : judgement(v) !== null,
        ),
    )
    .map(([key]) => key);

  // 집계 — 옮겨 온 판정 기준
  const bFacts = input.lines.map((l) =>
    judgement(prevBrief.get(l.key)?.["판정(사실)"]),
  );
  const bNames = input.lines.map((l) =>
    judgement(prevBrief.get(l.key)?.["판정(고유명사)"]),
  );
  const bLine = input.lines.map((_, i) =>
    bFacts[i] === null || bNames[i] === null ? null : bFacts[i]! && bNames[i]!,
  );
  const cardCol = (col: (typeof CARD_JUDGE_COLUMNS)[number]) =>
    input.cards.map((c) => judgement(prevCards.get(c.card.id)?.[col]));
  const cCat = cardCol("판정(cat)");
  const cTag = cardCol("판정(태그)");
  const cTransfer = cardCol("판정(이적)");
  const cSpoiler = cardCol("판정(spoiler)");
  const cAll = input.cards.map((_, i) => {
    const vs = [cCat[i], cTag[i], cTransfer[i], cSpoiler[i]];
    return vs.some((v) => v === null) ? null : vs.every((v) => v === true);
  });
  const summaryRows: Array<[string, Tally, string]> = [
    [
      "브리핑 줄 — 사실·고유명사 모두 ✅",
      tally(bLine),
      `≥ ${BRIEF_ACCURACY_TARGET * 100}%`,
    ],
    ["브리핑 줄 — 입력 사실 대조", tally(bFacts), "—"],
    ["브리핑 줄 — 고유명사(한글 표기)", tally(bNames), "—"],
    ["카드 — 4항목 모두 ✅", tally(cAll), "기록·규칙 보정"],
    ["카드 — 카테고리(cat)", tally(cCat), "—"],
    ["카드 — 태그(팀·선수)", tally(cTag), "—"],
    ["카드 — 이적 단계", tally(cTransfer), "—"],
    ["카드 — spoiler", tally(cSpoiler), "—"],
  ];
  const strata = CARD_STRATA.map(
    (cat) => `${cat} ${input.cards.filter((c) => c.card.cat === cat).length}`,
  ).join(" · ");
  const autoFlagged = input.lines.filter(
    (l) => l.check.flags.length > 0,
  ).length;

  const summary = [
    `표본 기간 **${input.from} ~ ${input.to}** · 시드 ${input.seed} · 생성 ${formatKst(input.generatedAt, "datetime")} KST`,
    "",
    `- 브리핑 줄: 기간 ${input.lineTotals.all}줄(AI ${input.lineTotals.ai}) 중 ${input.lines.length}줄 — AI 줄 먼저, 모자라면 템플릿 줄 · 자동 표시가 붙은 줄 ${autoFlagged}`,
    `- 카드: 기간 ${input.cardTotal}장 중 ${input.cards.length}장 — 카테고리 층별 돌아가며(${strata}). 비율 표본이 아니므로 정확도는 '규칙별 점검' 값으로 읽는다`,
    `- 경기 사실: ${input.factsNote}`,
    "",
    renderTable(
      ["구분", "판정 완료", "✅", "❌", "정확도", "목표"],
      summaryRows.map(([label, t, target]) => [
        label,
        `${t.judged}`,
        `${t.correct}`,
        `${t.wrong}`,
        pct(t),
        target,
      ]),
    ),
  ].join("\n");

  const template = `# M1-43 첫 주간 품질 검수 — 브리핑 ${QUALITY_SAMPLE_SIZE}줄 · 카드 ${QUALITY_SAMPLE_SIZE}건

> 버전 v0.1 · \`npm run quality:sample -- --from <시작> --to <끝> [--seed N]\`이 이 문서를 다시 만든다 — 같은 키 행의 **판정·메모 칸은 옮겨지고** 집계는 그 판정으로 다시 센다. 표식(\`<!-- … -->\`) 밖에 적은 글은 다시 만들 때 사라지므로 메모는 표의 메모 칸에 적는다.

## 검수 방법 (plan M1-43, D23·D24)

- **브리핑 줄**: 줄을 '입력 사실'(refs가 가리키는 그날 입력 창의 경기 결과·득점 — football-data·경기 기록 원장)과 대조해 \`판정(사실)\`에 ✅/❌, 팀·선수 한글 표기(names.ko 치환·조사)를 \`판정(고유명사)\`에 ✅/❌. 입력에 없는 사실·수치·인용이 하나라도 있으면 사실 ❌(CLAUDE.md §1-7). 순위표 근거(\`s…\`)는 발행 시점 순위가 저장되지 않아 그날 순위를 따로 확인한다. 목표: 두 칸 모두 ✅인 줄 ≥ 90%.
- **카드**: 원제목만 보고 코드 분류가 맞는지 — \`판정(cat)\`(카테고리, D47) · \`판정(태그)\`(팀·선수 태그 빠짐·오태그) · \`판정(이적)\`(이적 카드가 아니면 '—'이 맞는지, 이적이면 단계·Tier) · \`판정(spoiler)\`(결과 노출 여부)에 ✅/❌. 틀리면 메모에 맞는 값을 적는다 → 규칙 보정 입력(classify.ts·transfer-patterns.ts).
- **자동 표시**(판정을 대신하지 않는다): 🔤 남은 라틴 문자 이름(미등록 고유명사 — \`/add-name\`) · 漢 한자·가나 혼입 · 🔗 refs 경기가 그 창의 종료 경기에 없음.
- 판정 칸 값: ✅(또는 O) = 맞음, ❌(또는 X) = 틀림 — **기호만** 넣는다(설명은 메모 칸). 그 밖의 값·빈 칸은 미판정으로 센다.

## 집계

<!-- ${QUALITY_BLOCKS.summary}:start -->
<!-- ${QUALITY_BLOCKS.summary}:end -->

## 브리핑 줄

<!-- ${QUALITY_BLOCKS.brief}:start -->
<!-- ${QUALITY_BLOCKS.brief}:end -->

## 카드 분류

<!-- ${QUALITY_BLOCKS.cards}:start -->
<!-- ${QUALITY_BLOCKS.cards}:end -->
`;
  let doc = replaceBlock(template, QUALITY_BLOCKS.summary, summary);
  doc = replaceBlock(
    doc,
    QUALITY_BLOCKS.brief,
    briefRows.length > 0
      ? renderTable(BRIEF_TABLE_HEADER, briefRows)
      : "(기간에 브리핑 줄 없음)",
  );
  doc = replaceBlock(
    doc,
    QUALITY_BLOCKS.cards,
    cardRows.length > 0
      ? renderTable(CARD_TABLE_HEADER, cardRows)
      : "(기간에 카드 없음)",
  );
  return { doc, orphans };
}
