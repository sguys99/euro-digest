/**
 * 이적 추출 — 카드 `transfer`(선수·출발·행선지·단계·Tier) 코드 규칙 v0.1 (PRD FR-21·FR-100~103·F10 '코드 규칙 추출의 정확도 한계', D23,
 * plan M1-18) — 순수 함수. LLM을 쓰지 않는다. **오탐(이적 아닌 기사에 transfer)·잘못된 방향(출발/행선지 뒤바뀜)·과대 단계(루머를 agreed로)
 * 0이 최우선** — 애매하면 생략한다(입력에 없는 사실 금지, CLAUDE §1-7). 재현율은 낮아도 된다(미등록 선수 기사는 카테고리만 이적 — PRD F10).
 *
 * ── 입력 ────────────────────────────────────────────────────────────────
 *   카테고리가 '이적'인 클러스터의 **구성 묶음 제목 전부**(classify.ts가 넘긴다) + 묶음 소스(매체명·Tier). RSS 요약문은 쓰지 않는다 —
 *   요약문은 다른 이적설·지난 이적을 지나가며 말한다(PRD §15 D47 ①과 같은 이유, D39 ①은 허용하지만 v0.1은 제목만).
 *
 * ── 제목 1건 → 주장(claim) ─────────────────────────────────────────────────
 *   ① 문턱 — 이적 화제(`TRANSFER_TERMS` — 카테고리와 같은 표, 국내 'T행'·닫힌 문형도 화제, BBC 'X keen on Y - Sunday's gossip'은 꼬리표가
 *      화제), 재계약 단서 없음(`RENEWAL_TERMS`·`TRANSFER_RENEWAL_HINT_TERMS`·'new <팀> deal'·선수 바로 뒤 계약 명사('Saka contract' — 3회차
 *      중요 9) — 계약 기간('until 2033')은 'signs for'·'T sign(s) P'·'joins'·'commits'·'new deal' 꼴에서만, 계약 길이('on a five-year contract'
 *      — 3회차 결정 B)는 그중 새 팀 합류 동사('joins'·'officially joins'·'ficha por')를 뺀 꼴에서만, from 슬롯·금액이 있는 문형과 지금 소속을
 *      아는 등록 한국 선수의 다른 팀 이적은 예외), 여러 소식 묶음 아님(gossip은
 *      앞 문장만, rumor 상한), 에이전트 기사 아님, 가정·게임 속 이야기 아님('In an alternate reality, …'·'In FIFA 27 career mode, …'·'만약').
 *   ② 선수 — 그 제목의 등록 선수 태그(names.ko.json 선수 · korean-players.json — classify.ts가 동명이인·직업 명사를 걸러 낸 것) 중 **꾸미는
 *      자리**(뒤 네 낱말 안의 관계 명사 — "Saka's England team-mate"·"Kane's new strike partner"·'이강인 공격 파트너'·'김민재 친형'·'김민재 닮은',
 *      앞 — 'replace Saka'·'the next Saka'·'el hermano pequeño de Yamal'·'제2의 김민재', 국내 지난 이적의 목적어 — '이강인 이적 설득한 코케')를
 *      빼고, 국내 제목은 주어 근거(`KO_SUBJECT_AFTER`)가 있는 것이 **정확히 1명**일 때만. 등위로 이어진 두 선수('김민재·이강인'·'Kane and Saka')는 생략.
 *   ③ 단계 — **negotiating·agreed·official·collapsed는 닫힌 문형만**(PRD §15 D54 — transfer-patterns.ts `STAGE_PATTERNS`: 그 절 또는 제목 전체가
 *      문형에 앞뒤까지 맞을 때, 꼬리 슬롯만 예외). 합의·협상 꼴은 움직임 근거(from·금액·움직임 낱말)가 있을 때만(3회차 결정 A — 없으면
 *      재계약일 수 있어 단계 근거가 아니다 — 그 꼴에만 맞고 선수에게 걸린 rumor 표현이 따로 없으면 주장도 없다, 결정 A (c)). 'here we go'가 든 제목은 agreed가 상한이다(3회차 결정 C — FR-103). 문형 밖이면 **rumor** 근거가
 *      있을 때만 rumor — 선수가 든 절의 rumor 표현(`TRANSFER_RUMOR_TERMS` — 키워드 방식)이 그 선수에게 걸리거나(`latinRumorAttributed`·
 *      `koRumorAttributed`) 선수와 팀을 묶는 방향 규칙이 있을 때. 없으면 생략.
 *   ④ 방향 — 문형의 {팀} 슬롯, 문형 밖이면 방향 규칙(rumor일 때만) — 영어 'P to T'(첫머리·팀 뒤 절 끝)·'P move to T'·'P could join T'·'P linked
 *      with T'·'T eye/want/target … P'(사는 쪽)·'P leaves T'·'T striker P'·"T's P"·'from T1 to T2'·'leaves T1 for T2', 이탈리아어 'P al T'·
 *      'P verso il T'·'T su P'·'P lascia il T'·'dal T1 al T2', 스페인어 'P rumbo al T'·'T va a por P'·'P deja el T', 한국어 'T행'·'T 이적'(바로
 *      뒤 단서 — '아스널행 임박'·'아스널 이적설'·'아스널 이적 확정' 또는 절 끝)·'T 관심·러브콜'·'T, P 영입'·'T의 P 영입'·'T 떠난다'·'T1에서
 *      T2로'·'T1→T2'·'T 수비수 P'. 'joins'·'signs for'·'completes move'·'ficha por'는 문형만 본다(방향 규칙에서 뺐다 — 'joins Liverpool in the 250
 *      club'). 팀 + 이적 명사("Kane's Bayern exit")·쉼표를 건너는 관계·지난 이적('이적 당시'·'PSG행 이후'·'이적 2년 만에')·합성 명사('이적 금지')·
 *      여행('뮌헨행 전세기')·부정·등위·옛 소속·사는 쪽 동사의 다른 목적어·파는 쪽·팀 바로 뒤 사람 명사('Chelsea fans want …'·'Chelsea legend' —
 *      3회차 중요 9)는 방향이 아니다. 닮은꼴('a Saka type'·'Saka-like'·'next star Saka'·'김민재 스타일')은 그 선수가 아니다. 국내 제목은 선수와 팀 사이에 다른 사람 말이
 *      끼면(`koGapOk` — '김민재, 팀 동료 아스널 이적설') 방향도 rumor도 아니다. 한 역할에 다른 팀 둘 → 생략, 같은 팀이 양쪽 → 둘 다 생략, 잔류
 *      표현 → 방향 없음, 등록 한국 선수의 행선지가 설정의 지금 소속팀이면 주장 없음. 출발 팀을 설정에서 채우지 않는다(제목에 없는 사실).
 *
 * ── 클러스터 → 카드 transfer ─────────────────────────────────────────────
 *   ⑤ 주장이 있는 제목의 선수가 모두 같을 때만(둘 이상이면 생략 — 같은 사건 클러스터에 다른 선수의 이적이 섞인 것).
 *   ⑥ 단계 — **official**은 서로 다른 매체(매체명 — `publisherNameOf`) 2곳 이상이 official을 말하거나 명시 표현으로 말한 기사가 Tier 2 이상일
 *      때만(PRD §15 D52 ① — 2026-10-17 사용자 결정), 못 미치면 agreed. **agreed 이상**은 그 단계 이상을 말한 기사가 Tier 2 이상(Tier 1·2 —
 *      `PROMOTION_RULE.maxTier`)이거나 매체 2곳 이상일 때만(PRD F10 — 상태는 역행하지 않으므로(FR-102) 오탐 1건이 단계를 올린다), 못 미치면
 *      negotiating. **결렬**도 같은 조건(D52 ②) — 못 미치면 그 결렬 주장을 버리고 진행 단계 유지(결렬 주장뿐이면 생략), 넘으면 가장 늦은 진행
 *      주장보다 같거나 늦을 때 collapsed. 기사 속 원 보도자('Romano reports')는 Tier에 넣지 않는다. FR-103 'Tier 1 출처면 더 높게'는 활성 Tier 1
 *      소스가 없어 v0.1에 없다(트래커 가중 — M4-01).
 *   ⑦ 출발·행선지 = 최종 단계를 만든 주장들의 합(결렬이면 결렬 주장만 — 진행 주장의 행선지를 빌리지 않는다), 역할마다 다른 팀이면 생략.
 *   ⑧ tier = 클러스터 최고 출처 Tier — 모든 구성 묶음 소스 중 가장 높은 Tier(숫자가 작은 쪽). news-cluster.ts `clusterSourceMeta(cluster).bestTier`와
 *      같은 값이다(M1-13 이월 — tests가 대조한다). 설정에 없는 소스는 건너뛴다.
 * 결과 카드 필드는 부록 A `NewsCard.transfer`(`{ player, from?, to?, status, tier }`) 그대로다. 선수 단위 집계(data/transfers.json)는 M4-01.
 */
import type {
  CardTransfer,
  CompId,
  Source,
  Tier,
  TransferStatus,
} from "@/lib/schema";

import {
  KO_PAST_TRANSFER_RE,
  KO_SUFFIX_PATTERN,
  TRANSFER_AGENT_TERMS,
  TRANSFER_RENEWAL_HINT_TERMS,
  TRANSFER_RUMOR_TERMS,
  TRANSFER_STAY_TERMS,
  compileGroup,
  isKoLang,
  koTermRegex,
  matchesGroup,
  titleText,
  type CompiledGroup,
} from "./news-keywords";
import { publisherNameOf } from "./publisher-name";
import {
  TAG_TEXT_BREAK,
  matchTitleTags,
  tagMatchText,
  type TagHit,
  type TagIndex,
} from "./tag-names";
import { matchStagePatterns } from "./transfer-patterns";

// ─── 단계 ────────────────────────────────────────────────────────────────

/** 진행 단계(결렬 제외) — 낮은 것부터 */
export type ProgressStatus = Exclude<TransferStatus, "collapsed">;

const PROGRESS_ORDER: readonly ProgressStatus[] = [
  "rumor",
  "negotiating",
  "agreed",
  "official",
];

const rankOf = (s: ProgressStatus) => PROGRESS_ORDER.indexOf(s);
const maxProgress = (a: ProgressStatus, b: ProgressStatus): ProgressStatus =>
  rankOf(a) >= rankOf(b) ? a : b;

/**
 * agreed 이상 승격 조건(PRD F10 — 머리 주석 ⑥). 활성 소스는 해외 Tier 2·국내 Tier 3이라(configs/sources.json) 해외 매체 1곳 또는 국내 매체
 * 2곳 이상이 agreed·official을 말해야 그 단계가 된다.
 */
export const PROMOTION_RULE: Readonly<{
  maxTier: Tier;
  minPublishers: number;
}> = { maxTier: 2, minPublishers: 2 };

// ─── 표 컴파일 ────────────────────────────────────────────────────────────

const T = {
  rumor: compileGroup(TRANSFER_RUMOR_TERMS),
  stay: compileGroup(TRANSFER_STAY_TERMS),
  agent: compileGroup(TRANSFER_AGENT_TERMS),
  renewalHint: compileGroup(TRANSFER_RENEWAL_HINT_TERMS),
} as const satisfies Record<string, CompiledGroup>;

// ─── 문장 다듬기 ──────────────────────────────────────────────────────────

/**
 * BBC 이적설 모음 제목('AC Milan keen on Scott - Sunday's gossip')의 앞 문장 — 아니면 null. 앞 문장은 한 소식이고(그날 모음의 첫 이적설)
 * 꼬리표가 이적 화제다. 단계는 rumor까지만(다른 신문 보도 모음).
 */
export function gossipLead(title: string): string | null {
  const m = /^(.*\S)\s+[-–—]\s+(?:[\p{L}'’]+\s+)?gossip\s*$/iu.exec(
    title.normalize("NFKC"),
  );
  return m?.[1] ?? null;
}

// ─── 절 ──────────────────────────────────────────────────────────────────

/**
 * 라틴 절 경계(원제목) — 물음표·느낌표·쌍반점·쌍점·세로줄·띄운 대시, 종속절 머리말('as'·'while'·'who'·'when'·'after'·'amid'·'despite'·
 * 'mientras'·'mentre'·'cuando'·'quando'·'tras'·'dopo'·'come'), 관사 앞 등위어('… e il Milan …'·'… y el Barça …'·'… and the …' — 새 주어).
 * 'Harry Kane scores as Bayern confirm signing of defender'의 단계 표현은 케인 절이 아니다(M1-18 리뷰).
 */
const LATIN_CLAUSE_SEP =
  /[?!;:|]|\s[-–—]\s|\s(?:as|while|whilst|who|whom|whose|which|when|after|amid|despite|mientras|mentre|cuando|quando|tras|dopo|come)\s|\s(?:and|e|ed|y)\s(?=(?:the|il|lo|la|l'|l’|i|gli|le|el|los|las)\s)/giu;
/**
 * 국내 절 경계(`koSpaced` 텍스트) — 말줄임표·마침표 둘 이상·느낌표·물음표·쌍반점·세로줄, 쉼표 뒤 새 주어('김민재는 벤치, 바이에른은 수비수
 * 영입 확정' — 쉼표 다음 낱말이 은/는/이/가로 끝난다)
 */
const KO_CLAUSE_SEP =
  /…|\.{2,}|[!?;|]|,(?=\s?[^\s,…!?]+(?:은|는|이|가)(?![\p{Script=Hangul}]))/gu;

/** 절 1개 — 원문 조각 */
interface Clause {
  text: string;
}

/**
 * 라틴 태그 텍스트의 쉼표 자리 낱말(U+01C0 — 글자라 `latinSpaced`가 지우지 않는다, 팀·선수 표기에는 쓰이지 않는다). 절 경계는 아니고,
 * 선수가 절 첫머리인지('Calciomercato, Kane verso il Milan') 볼 때만 쓴다 — 갭에서는 지운다.
 */
const COMMA_MARK = "\u01c0";

/**
 * 라틴 원제목 → 절들 + 태그 맞춤용 제목(절 경계를 모두 쌍점으로 — `tagMatchText`의 절 경계 낱말이 된다, 쉼표는 `COMMA_MARK` 낱말)
 */
function latinClauses(title: string): { clauses: Clause[]; tagTitle: string } {
  const clauses: Clause[] = [];
  let last = 0;
  for (const m of title.matchAll(LATIN_CLAUSE_SEP)) {
    clauses.push({ text: title.slice(last, m.index) });
    last = m.index + m[0].length;
  }
  clauses.push({ text: title.slice(last) });
  return {
    clauses,
    tagTitle: clauses
      .map((c) => c.text.replace(/,/gu, ` ${COMMA_MARK} `))
      .join(" : "),
  };
}

/** 국내 텍스트(`koSpaced`) → 절들과 각 절의 시작 자리 */
function koClauses(text: string): { clauses: Clause[]; starts: number[] } {
  const clauses: Clause[] = [];
  const starts: number[] = [];
  let last = 0;
  for (const m of text.matchAll(KO_CLAUSE_SEP)) {
    clauses.push({ text: text.slice(last, m.index) });
    starts.push(last);
    last = m.index + m[0].length;
  }
  clauses.push({ text: text.slice(last) });
  starts.push(last);
  return { clauses, starts };
}

// ─── 방향: 라틴 ───────────────────────────────────────────────────────────

type LatinLang = "en" | "it" | "es";

/** 낱말 열 규칙 — 갭(두 태그 사이 낱말)이 이것과 같거나(exact) 이것으로 끝난다 */
interface TailRule {
  words: readonly string[];
  exact?: boolean;
  /** 선수가 절 첫머리일 때만('Haaland to Arsenal'·'Kane al Milan' — 'Gol de Kane al Barça'는 아니다) */
  start?: boolean;
}

const w = (s: string) => s.split(" ");
const exact = (s: string): TailRule => ({ words: w(s), exact: true });
const startExact = (s: string): TailRule => ({
  words: w(s),
  exact: true,
  start: true,
});
const tail = (s: string): TailRule => ({ words: w(s) });

/** 언어별 방향 규칙 */
interface LatinRules {
  /** P … T: T = 행선지 */
  toTail: readonly TailRule[];
  /** P … T: T = 출발 */
  fromTail: readonly TailRule[];
  /** T … P(T가 절의 첫 팀): 갭에 이 낱말이 있으면 T = 사는 쪽(행선지) — 파는 쪽도 쓰는 말(fee·bid·offer·talks)은 넣지 않는다 */
  buyerVerbs: ReadonlySet<string>;
  /** T … P: 갭에 '이 낱말 + for'가 있으면 사는 쪽('Arsenal move for Kane'·'Everton agree fee for Balogun') — 영어만 */
  buyerForNouns: ReadonlySet<string>;
  /** 갭 또는 선수 바로 뒤에 있으면 T가 파는 쪽일 수 있다('Bayern accept bid for Kane'·'Bayern confirm Kane exit') — 사는 쪽으로 보지 않는다 */
  sellerWords: ReadonlySet<string>;
  /** T … P: 갭이 정확히 이것이면 T = 사는 쪽(낱말 하나로는 흔한 꼴 — 'Juve su Kane'·'el Barça, a por Kane') */
  buyerExact: readonly (readonly string[])[];
  /** T + 역할 + P → T = 출발('Monaco striker Balogun'·"Bayern's Kane" — `isRolePhrase`) — 영어만 */
  roleBefore: boolean;
  /** P … [역할] del T → T = 출발('Kane, delantero del Bayern') */
  roleOfTail: { roles: ReadonlySet<string>; preps: ReadonlySet<string> } | null;
  /** 'from T1 to T2' — T1 바로 앞 낱말 · T1–T2 사이 낱말(정확히) */
  fromWords: ReadonlySet<string>;
  betweenTo: readonly (readonly string[])[];
  /** 'leaves T1 for T2' — T1–T2 사이(정확히) */
  betweenFor: readonly (readonly string[])[];
  /** 갭에 있으면 방향 아님(부정·거절·놓침) */
  negations: ReadonlySet<string>;
  /** T 바로 앞이면 옛 소속(출발 아님) */
  former: ReadonlySet<string>;
  /** 다른 팀과 이 낱말로 이어지면(등위) 방향 아님 */
  coordinators: ReadonlySet<string>;
  /** 갭에서 지우는 관사 */
  articles: ReadonlySet<string>;
  /** 선수 뒤 관계 명사('Kane replacement') — 선수가 꾸미는 자리 */
  relAfter: ReadonlySet<string>;
  /** 선수 앞 대체 표현('replace Kane') */
  relBefore: ReadonlySet<string>;
  /** 선수 앞 '관계 명사 + of/di/de'('replacement for Kane'·'sustituto de Kane') */
  relOf: ReadonlySet<string>;
  ofWords: ReadonlySet<string>;
}

const set = (...words: string[]) => new Set(words);

/** 역할 꾸밈말 — 머리 명사(`EN_ROLE_HEADS`) 앞에만('full back'·'left winger'·'young striker' — 'Napoli back McTominay'의 back은 동사) */
const EN_ROLE_MODIFIERS = set(
  "full",
  "centre",
  "center",
  "left",
  "right",
  "wing",
  "defensive",
  "attacking",
  "holding",
  "central",
  "young",
  "veteran",
);

/** 역할 머리 명사 — 역할 묘사('Monaco striker Balogun')의 마지막 낱말 */
const EN_ROLE_HEADS = set(
  "striker",
  "forward",
  "winger",
  "midfielder",
  "defender",
  "fullback",
  "goalkeeper",
  "keeper",
  "star",
  "captain",
  "skipper",
  "playmaker",
  "attacker",
  "youngster",
  "wonderkid",
  "talent",
  "prodigy",
  "teenager",
  "teen",
  "ace",
  "superstar",
  "loanee",
);

/** 역할 묘사 낱말 열인가 — 꾸밈말* + 머리 명사, 또는 꾸밈말 + 'back'('full back'·'centre back') */
function isRolePhrase(words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const last = words[words.length - 1]!;
  const mods = words.slice(0, -1);
  if (!mods.every((x) => EN_ROLE_MODIFIERS.has(x))) return false;
  return EN_ROLE_HEADS.has(last) || (last === "back" && mods.length > 0);
}

const LATIN_RULES: Readonly<Record<LatinLang, LatinRules>> = {
  en: {
    toTail: [
      // 'P joins T'·'P signs for T'·'P completes move to T'는 닫힌 문형(transfer-patterns.ts)만 — 방향 규칙에서 빼다('joins Liverpool in
      // the 250 club'·'signs for Barcelona in front of the fans' — D54)
      startExact("to"),
      tail("move to"),
      tail("switch to"),
      tail("transfer to"),
      tail("loan to"),
      tail("loan move to"),
      tail("join"),
      tail("joining"),
      tail("bound for"),
      tail("wanted by"),
      tail("eyed by"),
      tail("targeted by"),
      tail("chased by"),
      tail("tracked by"),
      tail("monitored by"),
      tail("courted by"),
      tail("linked with"),
      tail("interest from"),
      tail("medical at"),
    ],
    fromTail: [
      tail("leave"),
      tail("leaves"),
      tail("leaving"),
      tail("quit"),
      tail("quits"),
      tail("exit from"),
      tail("departure from"),
      tail("move from"),
      tail("switch from"),
      tail("transfer from"),
      tail("loan from"),
      tail("away from"),
    ],
    buyerVerbs: set(
      "sign",
      "signs",
      "signing",
      "eye",
      "eyes",
      "eyeing",
      "want",
      "wants",
      "target",
      "targets",
      "targeting",
      "chase",
      "chasing",
      "plot",
      "plotting",
      "swoop",
      "swoops",
      "interest",
      "interested",
      "keen",
      "land",
      "lands",
      "monitor",
      "monitoring",
      "scout",
      "scouting",
      "track",
      "tracking",
      "pursue",
      "pursuing",
      "pursuit",
      "hijack",
      "enquiry",
      "inquiry",
      "rekindle",
      "admire",
    ),
    // 'deal for'·'fee for'·'talks for'는 넣지 않는다 — 움직임 근거가 없는 합의·협상 말이라 재계약일 수 있다('Arsenal agree fee for Bukayo
    // Saka, 23'·'Barcelona close to deal for Lamine Yamal' — M1-18 3회차 마무리, 결정 A (c)와 같은 이유)
    buyerForNouns: set(
      "move",
      "bid",
      "offer",
      "approach",
      "swoop",
      "push",
      "race",
      "battle",
    ),
    sellerWords: set(
      "sell",
      "sells",
      "selling",
      "sale",
      "sales",
      "accept",
      "accepts",
      "accepted",
      "demand",
      "demands",
      "asking",
      "price",
      "valuation",
      "value",
      "release",
      "releases",
      "let",
      "lets",
      "allow",
      "allows",
      "open",
      "offload",
      "offloading",
      "cash",
      "exit",
      "exits",
      "departure",
      "leave",
      "leaves",
      "farewell",
      "replace",
      "replacement",
    ),
    buyerExact: [],
    roleBefore: true,
    roleOfTail: null,
    fromWords: set("from"),
    betweenTo: [w("to")],
    betweenFor: [w("for")],
    negations: set(
      "not",
      "no",
      "never",
      "won",
      "wont",
      "t",
      "refuse",
      "refuses",
      "refused",
      "reject",
      "rejects",
      "rejected",
      "snub",
      "snubs",
      "snubbed",
      "turn",
      "turns",
      "turned",
      "rule",
      "rules",
      "ruled",
      "deny",
      "denies",
      "denied",
      "block",
      "blocks",
      "blocked",
      "end",
      "ends",
      "ended",
      "abandon",
      "abandons",
      "miss",
      "misses",
      "missed",
      "lose",
      "loses",
      "lost",
      "beaten",
      "without",
      "instead",
      "rather",
      "than",
      "over",
      "against",
      "vs",
      "v",
      "versus",
      "beat",
      "beats",
      "face",
      "faces",
      "after",
      "since",
      "former",
      "ex",
    ),
    former: set("former", "ex", "old", "one", "time"),
    coordinators: set("and", "or", "vs", "v", "versus", "nor", "plus", "with"),
    articles: set("the", "a", "an"),
    relAfter: set(
      "replacement",
      "replacements",
      "successor",
      "successors",
      "heir",
      "understudy",
      "deputy",
      "teammate",
      "teammates",
      "partner",
      "agent",
      "agents",
      "representative",
      "representatives",
      "brother",
      "father",
      "dad",
      "son",
      "cousin",
      "wife",
      "rival",
      "rivals",
      "alternative",
      "alternatives",
      "backup",
      "cover",
      "mentor",
      "clone",
      "lookalike",
      "side",
      "team",
      "camp",
      "friend",
      "pal",
      "mate",
      "strike",
      "sister",
      "mother",
      "uncle",
      "nephew",
      "twin",
    ),
    relBefore: set(
      "replace",
      "replacing",
      "replaced",
      "succeed",
      "succeeding",
      "instead",
      "alongside",
      "like",
      "than",
      "partner",
      "partnering",
      "rival",
      "rivals",
      "challenge",
      "join",
      // 'the next Bukayo Saka'·'the new Saka'(닮은 다른 선수 — M1-18 2회차 리뷰)
      "next",
      "new",
      "another",
      "future",
    ),
    relOf: set(
      "replacement",
      "successor",
      "heir",
      "alternative",
      "cover",
      "understudy",
      "teammate",
      "partner",
      "rival",
      "agent",
    ),
    ofWords: set("of", "for", "to"),
  },
  it: {
    toTail: [
      startExact("al"),
      startExact("alla"),
      startExact("all"),
      startExact("allo"),
      startExact("verso"),
      exact("passa al"),
      exact("passa alla"),
      exact("va al"),
      exact("va alla"),
      exact("vicino al"),
      exact("vicinissimo al"),
      exact("piace al"),
      exact("piace alla"),
      exact("piace all"),
      tail("arriva al"),
      tail("arriva alla"),
      tail("arrivare al"),
      tail("arrivare alla"),
      tail("trasferimento al"),
      tail("trasferimento alla"),
      tail("passaggio al"),
      tail("passaggio alla"),
      tail("nuovo giocatore del"),
      tail("nuovo giocatore della"),
    ],
    fromTail: [
      exact("lascia"),
      exact("dal"),
      exact("dalla"),
      exact("addio al"),
      exact("addio alla"),
      exact("via dal"),
      exact("via dalla"),
    ],
    buyerVerbs: set(
      "punta",
      "vuole",
      "pensa",
      "prende",
      "sonda",
      "insiste",
      "cerca",
      "piomba",
      "ingaggia",
      "acquista",
      "corteggia",
      "osserva",
      "monitora",
      "sogna",
    ),
    buyerForNouns: set(),
    sellerWords: set(
      "vende",
      "vendere",
      "cessione",
      "cede",
      "accetta",
      "chiede",
      "prezzo",
      "addio",
      "lascia",
      "libera",
      "sostituto",
      "erede",
    ),
    buyerExact: [w("su")],
    roleBefore: false,
    roleOfTail: {
      roles: set(
        "attaccante",
        "difensore",
        "centrocampista",
        "esterno",
        "portiere",
        "terzino",
        "punta",
        "stella",
        "capitano",
        "gioiello",
        "talento",
        "regista",
        "trequartista",
        "bomber",
        "centravanti",
        "ala",
        "mediano",
        "fantasista",
        "laterale",
      ),
      preps: set("del", "della", "dell"),
    },
    fromWords: set("dal", "dalla", "da"),
    betweenTo: [w("al"), w("alla"), w("all"), w("allo"), w("a")],
    betweenFor: [w("per")],
    negations: set(
      "non",
      "no",
      "mai",
      "rifiuta",
      "rifiutato",
      "rifiutata",
      "dice",
      "niente",
      "nessun",
      "nessuna",
      "senza",
      "invece",
      "contro",
      "batte",
      "dopo",
      "ex",
    ),
    former: set("ex"),
    coordinators: set("e", "o", "ed", "con"),
    articles: set("il", "lo", "la", "i", "gli", "le", "l", "un", "una", "uno"),
    relAfter: set(),
    relBefore: set("dopo", "come", "invece", "nuovo", "prossimo", "erede"),
    relOf: set(
      "erede",
      "sostituto",
      "vice",
      "alternativa",
      "compagno",
      "agente",
      "procuratore",
      "fratello",
      "padre",
      "figlio",
      "rivale",
      "posto",
      "cugino",
      "minore",
      "maggiore",
    ),
    ofWords: set("di", "del", "a"),
  },
  es: {
    toTail: [
      exact("rumbo al"),
      exact("rumbo a"),
      exact("camino del"),
      exact("se va al"),
      startExact("al"),
      exact("llega al"),
      exact("fichara por"),
    ],
    fromTail: [
      exact("deja"),
      exact("sale del"),
      exact("salida del"),
      exact("abandona"),
      exact("se marcha del"),
      exact("adios al"),
      exact("se despide del"),
    ],
    buyerVerbs: set(
      "ficha",
      "fichar",
      "fichaje",
      "quiere",
      "pretende",
      "sondea",
      "piensa",
      "busca",
      "tantea",
      "vigila",
      "persigue",
      "puja",
    ),
    buyerForNouns: set(),
    sellerWords: set(
      "vende",
      "vender",
      "venta",
      "traspasa",
      "acepta",
      "aceptan",
      "pide",
      "precio",
      "salida",
      "adios",
      "libera",
      "sustituto",
      "relevo",
    ),
    buyerExact: [w("a por"), w("va a por")],
    roleBefore: false,
    roleOfTail: {
      roles: set(
        "delantero",
        "defensa",
        "central",
        "lateral",
        "extremo",
        "centrocampista",
        "mediocentro",
        "portero",
        "estrella",
        "capitan",
        "joya",
        "crack",
        "atacante",
        "mediapunta",
        "pivote",
        "guardameta",
        "carrilero",
        "talento",
      ),
      preps: set("del", "de"),
    },
    fromWords: set("del", "desde"),
    betweenTo: [w("al"), w("a")],
    betweenFor: [w("por")],
    negations: set(
      "no",
      "nunca",
      "rechaza",
      "rechazan",
      "rechazo",
      "descarta",
      "descartan",
      "dice",
      "sin",
      "niega",
      "lugar",
      "contra",
      "gana",
      "tras",
      "ex",
    ),
    former: set("ex"),
    coordinators: set("y", "o", "e", "u", "con"),
    articles: set("el", "la", "los", "las", "un", "una"),
    relAfter: set(),
    relBefore: set("como", "tras", "nuevo", "proximo", "heredero"),
    relOf: set(
      "sustituto",
      "relevo",
      "recambio",
      "heredero",
      "alternativa",
      "agente",
      "representante",
      "companero",
      "hermano",
      "padre",
      "hijo",
      "rival",
      "sucesor",
      "lugar",
      "primo",
      "pequeno",
      "mayor",
    ),
    ofWords: set("de", "del", "a"),
  },
};

/**
 * 행선지·출발 팀 **뒤** 문맥(M1-18 리뷰 차단 1) — 'P joins T'·'P signs for T'의 T 바로 뒤가 절 끝·쉼표이거나 허용 낱말('on loan'·'from'·
 * 'in a … deal'·'for £…'·'until'…)일 때만 방향이다. T 뒤 세 낱말 안에 금지 낱말이 있으면 방향이 아니다('joins Real Madrid's injury list'·
 * 'joins Manchester City squad for US tour'·'joins Liverpool legends in 250 club'·'signs for Barcelona fans').
 */
const LATIN_AFTER_TEAM: Readonly<
  Record<LatinLang, { allow: ReadonlySet<string>; forbid: ReadonlySet<string> }>
> = {
  en: {
    allow: new Set([
      "on",
      "from",
      "in",
      "for",
      "permanently",
      "until",
      "after",
      "ahead",
      "amid",
      "despite",
      "deal",
      "move",
      "transfer",
      "loan",
      "switch",
      "talks",
      "medical",
      "bid",
      "this",
      "next",
      // 이적 소식을 잇는 말('Kane transfer to Arsenal falls through'·'Kane move to Arsenal agreed')
      "agreed",
      "confirmed",
      "completed",
      "done",
      "off",
      "collapses",
      "collapsed",
      "falls",
      "fell",
      "breaks",
      "broke",
      "stalls",
      "stalled",
      "close",
      "closer",
      "nears",
      "imminent",
      "edges",
      "latest",
      "update",
      "saga",
      "hopes",
      "boost",
      "blow",
      "back",
      "revived",
      "set",
      "could",
      "is",
      "gets",
    ]),
    forbid: new Set([
      "squad",
      "team",
      "teammates",
      "mates",
      "training",
      "camp",
      "legends",
      "greats",
      "club",
      "list",
      "s",
      "fans",
      "supporters",
      "tour",
      "pre",
      "preseason",
      "celebrations",
      "celebration",
      "party",
      "staff",
      "coaching",
      "board",
      "hall",
      "ranks",
      "exodus",
      "injury",
      "injured",
      "history",
      "elite",
      "lineup",
      "line",
      "xi",
      "roster",
      "bench",
      "women",
    ]),
  },
  it: {
    allow: new Set(["in", "a", "dal", "dalla", "per", "fino", "gia", "subito"]),
    forbid: new Set([
      "tifosi",
      "ritiro",
      "allenamento",
      "festa",
      "tournee",
      "raduno",
      "infermeria",
      "leggende",
      "femminile",
    ]),
  },
  es: {
    allow: new Set([
      "cedido",
      "en",
      "a",
      "por",
      "hasta",
      "procedente",
      "desde",
      "este",
      "esta",
      "libre",
      "gratis",
    ]),
    forbid: new Set([
      "aficion",
      "aficionados",
      "pretemporada",
      "gira",
      "entrenamiento",
      "concentracion",
      "celebracion",
      "fiesta",
      "enfermeria",
      "leyendas",
      "femenino",
    ]),
  },
};

/**
 * 다른 선수를 가리키는 역할 명사 — 선수 바로 앞 역할 묘사('Monaco striker Balogun') 밖에서 나오면 그 절의 사는 쪽·단계 표현은 그 사람
 * 이야기다('Bayern Munich complete signing of striker to rival Harry Kane'·'Lamine Yamal celebra el acuerdo … con un nuevo delantero').
 */
const LATIN_ROLE_NOUNS: Readonly<Record<LatinLang, ReadonlySet<string>>> = {
  en: new Set([
    "striker",
    "forward",
    "winger",
    "midfielder",
    "defender",
    "fullback",
    "goalkeeper",
    "keeper",
    "attacker",
    "playmaker",
    "youngster",
    "wonderkid",
    "prodigy",
    "teenager",
    "star",
    "talent",
    "player",
    "captain",
    "loanee",
  ]),
  it: new Set([
    "attaccante",
    "difensore",
    "centrocampista",
    "esterno",
    "portiere",
    "terzino",
    "centravanti",
    "ala",
    "mediano",
    "trequartista",
    "regista",
    "bomber",
    "talento",
    "giocatore",
    "centrale",
  ]),
  es: new Set([
    "delantero",
    "central",
    "defensa",
    "lateral",
    "extremo",
    "centrocampista",
    "mediocentro",
    "portero",
    "atacante",
    "mediapunta",
    "pivote",
    "guardameta",
    "carrilero",
    "jugador",
    "talento",
    "futbolista",
  ]),
};

/**
 * 선수가 절 첫머리일 때 바로 뒤 낱말 — 이적설 동사·명사(`latinRumorAttributed` — 'Kane linked with'·'Kane wanted by'·'Kane transfer'·
 * 'Kane could join'·'Kane, nel mirino del Milan'·'Kane suena para el Barça'). 그 밖의 동사('praises'·'reacts'·'scores'·'celebra'·'segna')면
 * 그 절의 rumor 표현은 선수 이야기가 아니다.
 */
const LATIN_RUMOR_LEAD: Readonly<Record<LatinLang, ReadonlySet<string>>> = {
  en: new Set([
    "linked",
    "links",
    "eyed",
    "wanted",
    "targeted",
    "tipped",
    "keen",
    "considering",
    "weighing",
    "open",
    "eyes",
    "wants",
    "set",
    "could",
    "would",
    "may",
    "might",
    "will",
    "to",
    "transfer",
    "exit",
    "future",
    "move",
    "deal",
    "interest",
    "attracts",
    "attracting",
    "tracked",
    "monitored",
    "scouted",
    "chased",
    "courted",
    "in",
    "on",
    "rumours",
    "rumors",
    "talks",
    "admirers",
    "suitors",
    "latest",
    "update",
    "news",
  ]),
  it: new Set([
    "piace",
    "vuole",
    "verso",
    "tentato",
    "nel",
    "accostato",
    "al",
    "alla",
    "all",
    "pensa",
    "sogna",
    "in",
    "e",
    "obiettivo",
    "idea",
    "occhi",
    "tentazione",
    "potrebbe",
  ]),
  es: new Set([
    "suena",
    "interesa",
    "gusta",
    "tienta",
    "quiere",
    "en",
    "rumbo",
    "objetivo",
    "al",
    "a",
    "se",
    "es",
    "esta",
    "piensa",
    "podria",
    "opcion",
  ]),
};

/** 소유 's 뒤 이적 명사("Kane's future"·"Kane's move to Arsenal") — `latinRumorAttributed`의 바로 뒤 낱말로 본다 */
const EN_POSSESSIVE_LEAD = new Set([
  "future",
  "move",
  "transfer",
  "deal",
  "medical",
  "loan",
  "switch",
  "exit",
  "bid",
]);

/** 금액 낱말('40m'·'100'·'million') — 갭에서 지운다 */
const AMOUNT_TOKEN =
  /^(?:\d+(?:[.,]\d+)?(?:m|bn|k|mn|mln)?|million|millions|billion|milioni|millones|euro|euros|pounds?|mln)$/u;

/** 라틴 태그 텍스트의 낱말들(시작 자리·소문자) */
interface Tokens {
  words: string[];
  /** 글자 자리 → 낱말 번호 */
  at: Map<number, number>;
}

function tokenize(text: string): Tokens {
  const words: string[] = [];
  const at = new Map<number, number>();
  const re = /\S+/gu;
  for (const m of text.matchAll(re)) {
    at.set(m.index, words.length);
    words.push(m[0].toLowerCase());
  }
  return { words, at };
}

/** 태그의 낱말 범위 [s, e) */
interface Span {
  slug: string;
  s: number;
  e: number;
}

function toSpan(hit: TagHit, tokens: Tokens): Span | null {
  const s = tokens.at.get(hit.pos);
  if (s === undefined) return null;
  // 끝 낱말 = 끝 자리 바로 앞 글자가 속한 낱말
  let e = s + 1;
  for (const [pos, i] of tokens.at) if (pos < hit.end && i + 1 > e) e = i + 1;
  return { slug: hit.slug, s, e };
}

const BREAK = TAG_TEXT_BREAK.toLowerCase();
/** 방향 규칙이 보지 않는 완료 동사 — 닫힌 문형(transfer-patterns.ts)만 이 말로 방향을 정한다(D54) */
const PATTERN_ONLY_VERBS: ReadonlySet<string> = new Set([
  "joins",
  "joined",
  "signs",
  "signed",
  "completes",
  "completed",
  "complete",
  "seals",
  "sealed",
  "ficha",
  "firma",
]);
const COMMA = COMMA_MARK.toLowerCase();

/** 방향 후보(한 제목) */
interface Directions {
  to: Set<string>;
  from: Set<string>;
  /** 방향 동사가 주는 단계 — 절 번호 → 단계 */
  implied: Map<number, ProgressStatus>;
  evidence: string[];
}

function newDirections(): Directions {
  return { to: new Set(), from: new Set(), implied: new Map(), evidence: [] };
}

function noteImplied(d: Directions, clause: number, s: ProgressStatus) {
  const prev = d.implied.get(clause);
  d.implied.set(clause, prev ? maxProgress(prev, s) : s);
}

const endsWith = (gap: readonly string[], words: readonly string[]) =>
  gap.length >= words.length &&
  words.every((x, i) => gap[gap.length - words.length + i] === x);
const sameWords = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** 라틴 제목의 방향(머리 주석 ④) — 선수 1명(`player`)과 팀 태그들 */
function latinDirections(
  tokens: Tokens,
  player: Span,
  teams: readonly Span[],
  lang: LatinLang,
  clauseOf: (wordIndex: number) => number,
): Directions {
  const r = LATIN_RULES[lang];
  const d = newDirections();
  const words = tokens.words;
  const gapOf = (a: number, b: number): string[] | null => {
    const raw = words.slice(a, b);
    if (raw.includes(BREAK)) return null;
    return raw.filter(
      (x) => x !== COMMA && !AMOUNT_TOKEN.test(x) && !r.articles.has(x),
    );
  };
  const hasNeg = (gap: readonly string[]) =>
    gap.some((x) => r.negations.has(x));
  const teamAt = (i: number) => teams.find((t) => t.s <= i && i < t.e);
  // 다른 팀과 등위로 이어진 팀('Arsenal and Chelsea eye Kane'·'Kane to Arsenal or Chelsea') — 방향에 쓰지 않는다
  // 등위 낱말·쉼표('Arsenal, Chelsea and Spurs eye Kane')
  const coordinated = (t: Span) => {
    const before = words[t.s - 1];
    const after = words[t.e];
    const joins = (x: string | undefined) =>
      x !== undefined && (r.coordinators.has(x) || x === COMMA);
    return (
      (joins(before) && teamAt(t.s - 2) !== undefined) ||
      (joins(after) && teamAt(t.e + 1) !== undefined)
    );
  };
  const formerBefore = (t: Span) => r.former.has(words[t.s - 1] ?? "");
  // 팀 뒤 문맥(머리 주석 ④ — 'joins Real Madrid's injury list'·'signs for Barcelona fans'는 방향이 아니다)
  const afterTeamOk = (t: Span): boolean => {
    const ctx = LATIN_AFTER_TEAM[lang];
    for (let i = t.e; i < Math.min(words.length, t.e + 3); i++) {
      const x = words[i]!;
      if (x === BREAK || x === COMMA) break;
      if (ctx.forbid.has(x)) return false;
    }
    const next = words[t.e];
    if (next === undefined || next === BREAK || next === COMMA) return true;
    return ctx.allow.has(next) || AMOUNT_TOKEN.test(next);
  };
  const roleNouns = LATIN_ROLE_NOUNS[lang];
  const pClause = clauseOf(player.s);
  // 선수가 절(또는 쉼표 뒤 마디) 첫머리인가(앞 낱말이 절 경계·쉼표·관사뿐)
  const pAtStart = (() => {
    for (let i = player.s - 1; i >= 0; i--) {
      const x = words[i]!;
      if (x === BREAK || x === COMMA) return true;
      if (!r.articles.has(x)) return false;
    }
    return true;
  })();

  for (const team of teams) {
    if (clauseOf(team.s) !== pClause || coordinated(team)) continue;
    // 쉼표를 건너는 관계는 보지 않는다('Bayern Munich confirm signing of defender, Harry Kane scores')
    const lo = Math.min(team.e, player.e);
    const hi = Math.max(team.s, player.s);
    if (words.slice(lo, hi).includes(COMMA)) continue;
    if (team.s >= player.e) {
      // ── P … T
      const gap = gapOf(player.e, team.s);
      if (gap === null || hasNeg(gap) || gap.length > 7) continue;
      // 완료 동사('joins'·'signs for'·'completes move to'·'ficha por')는 닫힌 문형만(D54)
      if (gap.some((x) => PATTERN_ONLY_VERBS.has(x))) continue;
      if (teams.some((o) => o !== team && o.s >= player.e && o.e <= team.s)) {
        continue; // 사이에 다른 팀
      }
      const toRule = r.toTail.find(
        (rule) =>
          (rule.exact
            ? sameWords(gap, rule.words)
            : endsWith(gap, rule.words)) &&
          (!rule.start || pAtStart),
      );
      // 첫머리 꼴('Harry Kane to Arsenal'·'Kane al Milan')은 팀 뒤가 절 끝·쉼표일 때만('Kane al Milan per una cena di beneficenza'는 아니다)
      const startEndOk =
        !toRule?.start ||
        words[team.e] === undefined ||
        words[team.e] === BREAK ||
        words[team.e] === COMMA;
      if (toRule && startEndOk && afterTeamOk(team)) {
        d.to.add(team.slug);
        d.evidence.push(`to:${team.slug}:${toRule.words.join(" ")}`);
        noteImplied(d, pClause, "rumor");
        continue;
      }
      if (toRule) continue;
      if (
        r.fromTail.some((rule) =>
          rule.exact ? sameWords(gap, rule.words) : endsWith(gap, rule.words),
        ) &&
        afterTeamOk(team)
      ) {
        d.from.add(team.slug);
        d.evidence.push(`from:${team.slug}:${gap.join(" ")}`);
        noteImplied(d, pClause, "rumor");
        continue;
      }
      // 'P, delantero del T' — 출발
      if (r.roleOfTail) {
        const last = gap[gap.length - 1];
        const prev = gap[gap.length - 2];
        if (
          last !== undefined &&
          prev !== undefined &&
          r.roleOfTail.preps.has(last) &&
          r.roleOfTail.roles.has(prev)
        ) {
          d.from.add(team.slug);
          d.evidence.push(`from:${team.slug}:role-of`);
          continue;
        }
      }
      // "Kane's Arsenal move"·"Kane's Bayern exit" 같은 '팀 + 이적 명사'는 방향으로 보지 않는다 — 지난 이적·다른 사람 이야기가 섞인다
      // ('Was Harry Kane's Bayern Munich transfer worth it?'·'Harry Kane praises Bayern Munich transfer target' — M1-18 2회차 리뷰)
      continue;
    }
    if (team.e <= player.s) {
      // ── T … P
      const gap = gapOf(team.e, player.s);
      if (gap === null || hasNeg(gap) || gap.length > 8) continue;
      // 옛 소속·옛 관심 구단('Former Arsenal target Saka'·'One-time Liverpool target Wirtz')은 사는 쪽도 출발도 아니다
      if (formerBefore(team)) continue;
      // 역할 묘사('Monaco striker Balogun'·"Bayern's Kane") — T 바로 뒤가 역할 낱말(또는 소유 's)이고 선수까지 이어진다
      const roleGap = gap[0] === "s" ? gap.slice(1) : gap;
      const isRole =
        gap.length > 0 &&
        (roleGap.length === 0 ? gap[0] === "s" : isRolePhrase(roleGap));
      if (isRole && r.roleBefore) {
        // "Arsenal's Kane bid" — 소유 's 뒤 선수 + 사는 쪽 명사면 T가 사는 쪽, 'move·deal'이면 애매
        const next = words[player.e] ?? "";
        if (gap[0] === "s" && roleGap.length === 0) {
          if (
            /^(?:bid|bids|pursuit|chase|swoop|approach|offer|interest|hunt|raid)$/u.test(
              next,
            )
          ) {
            d.to.add(team.slug);
            d.evidence.push(`to:${team.slug}:possessive-${next}`);
            noteImplied(d, pClause, "rumor");
            continue;
          }
          if (/^(?:move|deal|transfer|switch|loan)$/u.test(next)) continue;
        }
        d.from.add(team.slug);
        d.evidence.push(`from:${team.slug}:role`);
        continue;
      }
      // 팀 바로 뒤가 사람 명사('Chelsea fans want Bukayo Saka transfer'·'Chelsea legend wants …'·'Chelsea boss') — 그 사람들 이야기다(사는
      // 쪽이 아니다, M1-18 3회차 리뷰 중요 9)
      if (LATIN_TEAM_PEOPLE[lang].has(words[team.e] ?? "")) continue;
      // 사는 쪽 — T가 절의 첫 팀이고 갭에 이적 동사(사이 팀은 선수 바로 앞 역할 묘사 팀만)
      const firstInClause = !teams.some(
        (o) => o !== team && o.s < team.s && clauseOf(o.s) === pClause,
      );
      if (!firstInClause) continue;
      const between = teams.filter(
        (o) => o !== team && o.s >= team.e && o.e <= player.s,
      );
      let gapToPlayer = gap;
      if (between.length > 0) {
        // 사이 팀은 선수 바로 앞 역할 묘사여야 한다(그 팀은 위 역할 규칙이 출발로 본다)
        const desc = between[between.length - 1]!;
        if (between.length > 1) continue;
        const descGap = gapOf(desc.e, player.s) ?? [];
        const descRole = descGap[0] === "s" ? descGap.slice(1) : descGap;
        const descIsRole =
          descGap.length > 0 &&
          (descRole.length === 0 ? descGap[0] === "s" : isRolePhrase(descRole));
        if (!descIsRole || !r.roleBefore) continue;
        gapToPlayer = gapOf(team.e, desc.s) ?? [];
      }
      // 사는 쪽 동사의 목적어가 다른 사람('complete signing of striker to rival Kane') — 선수 바로 앞 역할 묘사('fee for Monaco striker
      // Balogun'의 striker)를 뗀 갭에 역할 명사가 있으면 사는 쪽으로 보지 않는다
      let core = gapToPlayer;
      if (between.length === 0) {
        let cut = core.length;
        while (
          cut > 0 &&
          (roleNouns.has(core[cut - 1]!) ||
            EN_ROLE_MODIFIERS.has(core[cut - 1]!) ||
            EN_ROLE_HEADS.has(core[cut - 1]!))
        ) {
          cut -= 1;
        }
        core = core.slice(0, cut);
      }
      if (core.some((x) => roleNouns.has(x))) continue;
      // 파는 쪽일 수 있다('Bayern accept bid for Kane'·'Bayern confirm Kane exit') — 사는 쪽으로 보지 않는다
      const afterPlayer =
        words[player.e] === "s" ? words[player.e + 1] : words[player.e];
      if (
        gapToPlayer.some((x) => r.sellerWords.has(x)) ||
        (afterPlayer !== undefined && r.sellerWords.has(afterPlayer))
      ) {
        continue;
      }
      const forNoun = gapToPlayer.some(
        (x, i) => r.buyerForNouns.has(x) && gapToPlayer[i + 1] === "for",
      );
      if (
        r.buyerExact.some((g) => sameWords(gapToPlayer, g)) ||
        gapToPlayer.some((x) => r.buyerVerbs.has(x)) ||
        forNoun
      ) {
        d.to.add(team.slug);
        d.evidence.push(`to:${team.slug}:buyer`);
        noteImplied(d, pClause, "rumor");
      }
    }
  }

  // 'from T1 to T2'·'dal T1 al T2' / 'leaves T1 for T2'·'deja el T1 por el T2'
  for (const t1 of teams) {
    for (const t2 of teams) {
      if (t2.s < t1.e || clauseOf(t1.s) !== clauseOf(t2.s)) continue;
      if (clauseOf(t1.s) !== pClause) continue;
      const mid = gapOf(t1.e, t2.s);
      if (mid === null) continue;
      if (
        r.fromWords.has(words[t1.s - 1] ?? "") &&
        r.betweenTo.some((g) => sameWords(mid, g))
      ) {
        d.from.add(t1.slug);
        d.to.add(t2.slug);
        d.evidence.push(`from-to:${t1.slug}>${t2.slug}`);
        noteImplied(d, pClause, "rumor");
      } else if (
        d.from.has(t1.slug) &&
        r.betweenFor.some((g) => sameWords(mid, g))
      ) {
        d.to.add(t2.slug);
        d.evidence.push(`leaves-for:${t1.slug}>${t2.slug}`);
      }
    }
  }
  return d;
}

// ─── 방향: 한국어 ─────────────────────────────────────────────────────────

const KO_SUFFIX = KO_SUFFIX_PATTERN;
/** 행선지 — 'T행' */
const KO_TO_HAENG = new RegExp(`^행${KO_SUFFIX}(?![\\p{Script=Hangul}])`, "u");
/**
 * 'T행'이 여행·원정·경기 뜻인 제목('뮌헨행 비행기'·'결승 앞두고 뮌헨행'·'UCL 결승 무대 뮌헨행'·'리버풀행 전세기'·'바르셀로나행 열차'·
 * '레알 마드리드행 버스 탑승') — 이적 화제가 아니다(M1-18 리뷰)
 */
const KO_TRAVEL =
  /비행기|비행편|항공|전세기|열차|기차|버스|탑승|이동|원정|전지훈련|투어|여행|휴가|캠프|소집|출국|입국|귀국|결승|무대|시상식|경기\s?위해/u;
/**
 * 'T행'·'T 이적'을 이적 방향으로 볼 단서 — 그 말 **바로 뒤**(조사·띄어쓰기 하나까지)에 붙을 때만('아스널행 임박'·'헤타페행 가능성'·'아스널
 * 이적설'·'아스널로 이적 확정'). 떨어져 있으면('결장 확정에도 리버풀행'·'레알 마드리드행 선발 출격 유력') 다른 이야기다(M1-18 2회차 리뷰).
 */
const KO_MOVE_CUE =
  /^(?:이|가|은|는|도|을|를)?\s?(?:설|가능성|임박|추진|확정|합의|협상|유력|초읽기|급물살|근접|성사|현실화|제안|결심|결정|원해|원한다|희망|눈앞|시동|청신호|무산|결렬|불발|수순|발표|완료|\?)(?![\p{Script=Hangul}]?(?:적|에도|에\s?축하))/u;
/** 그 말 뒤가 절 끝인가('김민재, 바이에른에서 아스널로 이적'·'[오피셜] … 이적…') */
const KO_CLAUSE_END = /^\s?(?:$|…|\.{2,}|[!?,'"’”\])])/u;

/** 'T행' 뒤가 지난 이적·때('PSG행 이후 첫 골'·'PSG행 당시 비화')인가 */
function koHaengIsPast(rest: string): boolean {
  return KO_AFTER_PAST.test(rest);
}

/**
 * 국내 제목에 이적 뜻의 'T행'(팀 이름 + 행 — '아스널행 임박')이 있는가 — 이적 화제 근거(classify.ts 카테고리, M1-18). 'T행'은 이적
 * 표(`TRANSFER_TERMS`)에 없다(팀 이름이 있어야 이적 뜻). 여행·원정·경기 표현이 있는 제목, 지난 이적('PSG행 이후'), 바로 뒤에 단서
 * (`KO_MOVE_CUE`)가 없는 'T행'은 아니다.
 */
export function koBoundForTeam(
  title: string,
  lang: string,
  teams: readonly Pick<TagHit, "pos" | "end">[],
): boolean {
  if (!isKoLang(lang)) return false;
  const text = tagMatchText(title, lang);
  if (KO_TRAVEL.test(text)) return false;
  return teams.some((t) => {
    const after = text.slice(t.end);
    const m = KO_TO_HAENG.exec(after);
    if (!m) return false;
    const rest = after.slice(1); // '행' 뒤
    return !koHaengIsPast(rest) && KO_MOVE_CUE.test(rest);
  });
}

/** 행선지 — 'T(으)로 이적'·'T 입단'·'T에 입단'·'T 유니폼'·'T 임대' (명사 시작 자리를 그룹 1 앞으로 잡는다) */
const KO_TO_NOUN =
  /^((?:으로|로|에)?\s?)(?:완전\s?|임대\s?|깜짝\s?|전격\s?|자유\s?)?(?:이적|입단|임대|유니폼|합류)/u;
/** 이적 명사가 다른 말의 앞부분 — 'T 이적료'(파는 쪽일 수 있다)·'T 임대생'·'T 이적시장'·'T 이적 금지' — 행선지가 아니다 */
const KO_NOUN_COMPOUND = new RegExp(
  `^\\s?(?:료|생|시장|금지|자금|정책|창|기간|마감|건|사례)${KO_SUFFIX_PATTERN}(?![\\p{Script=Hangul}])`,
  "u",
);
/** 지난 이적·때 — 'T 이적 후'·'T 이적 당시'·'T 이적하자마자'·'T 이적한 지' */
const KO_AFTER_PAST =
  /^(?:\s?(?:후|이후|뒤|당시|때|직후|전후|효과|시절|첫\s?시즌|첫\s?경기|첫\s?골|데뷔|비화|\d*\s?주년|\d+\s?(?:년|개월|시즌)\s?(?:만에|째)|신의\s?한\s?수)(?![\p{Script=Hangul}])|(?:하자마자|하자|한\s?지|한지|한\s?뒤|한\s?후|하고\s?나서|했던|한\s))/u;
/** 라틴 제목의 재계약 꼴 'new <팀> deal'·'new four-year contract'('Bellingham agrees new Real deal') — 이적이 아니다 */
const LATIN_NEW_DEAL =
  /\bnew\s+(?:[\p{L}\p{N}'’.-]+\s+){0,3}(?:deal|contract|terms)\b/iu;
/** 행선지 — 'T(으)로 간다·향한다·복귀'·'T로?' */
const KO_TO_GO =
  /^(?:으로|로)\s?(?:간다|가나|갈까|갈\s?수|향한다|향하나|향할까|향해|복귀|떠난다|떠나나|옮긴다|옮기나|옮길까|둥지)/u;
const KO_TO_QUESTION = /^(?:으로|로)(?=\s?(?:[?!…]|\.{2,}|$))/u;
/** 사는 쪽(관심) — 'T 관심'·'T의 러브콜'·'T가 노린다'·'T에서도 관심' */
const KO_BUYER_INTEREST =
  /^(?:의|이|가|은|는|도|로부터|에서도|에서)?\s?(?:관심|러브콜|눈독|구애|군침|레이더|타깃|타겟|표적|영입\s?추진|영입\s?시도|영입\s?작업|노린다|노려|노리는|원한다|원해|원하는|하이재킹|탐낸다|탐내|주시|스카우트|영입\s?후보)/u;
/**
 * 사는 쪽(제안) — 'T 제안'·'T의 오퍼'·'T로부터 제안'. 주어 조사('레알은 제안 수락' — 파는 쪽일 수 있다)가 붙은 꼴은 아니다.
 */
const KO_BUYER_OFFER =
  /^(?:의|로부터|에서|에서도)?\s?(?:영입\s?제안|이적\s?제안|공식\s?제안|제안|오퍼)/u;
/**
 * 사는 쪽 주어 뒤 — 'T, P 영입'·'T는 P 노린다'(선수 뒤 말). 파는 쪽도 쓰는 말(이적료·협상·제안·오퍼·임대·접촉 — '바이에른, 김민재 이적료
 * 요구'·'레알, 엔드릭 임대 보낸다')은 넣지 않는다.
 */
const KO_BUYER_AFTER_PLAYER =
  /^(?:을|를|의|에)?\s?(?:[^\s…!?]+\s){0,2}?(?:완전\s?|전격\s?|깜짝\s?)?(?:영입|관심|노린다|노려|원한다|원해|러브콜|눈독|군침|입찰|품었|품는|품을|품나|데려|낚아)/u;
/** 출발 — 'T 떠난다'·'T와 결별'·'T에서 방출' */
const KO_FROM =
  /^(?:(?:을|를|에서)?\s?(?:떠나|떠난|떠날|떠나나|탈출|결별|이별|작별|방출|퇴출|이탈)|(?:와|과)\s?(?:결별|이별|작별))/u;
/** 역할 묘사 — 'T 수비수 P'('바이에른 수비수’ 김민재') — 출발. 소유 '의'만으로는 정하지 않는다('레알의 음바페 영입' = 레알이 사는 쪽) */
const KO_ROLE =
  /^\s?(?:주전\s?|핵심\s?|간판\s?|베테랑\s?|신예\s?)?(?:공격수|수비수|미드필더|골키퍼|윙어|에이스|주장|스트라이커|센터백|풀백|유망주|신성|스타|윙백|수문장|센터포워드)\s?$/u;
/** 옛 소속 — 'T' 앞 '전'·'前'·'옛'·'친정'·'출신' */
const KO_FORMER_BEFORE =
  /(?:(?<![\p{Script=Hangul}])전|前|옛|친정|친정팀)\s?$/u;
/** 'T1에서 T2' 사이 · 'T1→T2' 사이 */
const KO_FROM_BETWEEN = /^에서\s?$/u;
const KO_ARROW_BETWEEN = /^\s?(?:→|->|⇒|➡)\s?$/u;
/** 등위로 이어진 팀('아스널·첼시'·'아스널과 첼시') — 사이 말 */
const KO_COORD_BETWEEN = /^\s?(?:[·/,&]|와|과|및|이나|나|또는)\s?$/u;
/** 부정 — 방향 표현 바로 뒤('T 이적 거절'·'T행 없다') */
const KO_NEG_AFTER =
  /^\s?(?:을|를|은|는|이|가)?\s?(?:거절|거부|일축|부인|무산|불발|결렬|없다|없어|않|안\s|포기|철회|반대)/u;

/** 국내 제목의 방향(머리 주석 ④) */
function koDirections(
  text: string,
  player: TagHit,
  teams: readonly TagHit[],
  clauseOf: (pos: number) => number,
  clauseStart: (clause: number) => number,
): Directions {
  const d = newDirections();
  const pClause = clauseOf(player.pos);
  const sticky = (re: RegExp) => new RegExp(re.source, "uy");
  const pastAt = (pos: number) =>
    KO_PAST_TRANSFER_RE.some((re) => {
      const s = sticky(re);
      s.lastIndex = pos;
      return s.test(text);
    });
  const coordinated = (t: TagHit) =>
    teams.some((o) => {
      if (o === t) return false;
      const [a, b] = o.pos < t.pos ? [o, t] : [t, o];
      return a.end <= b.pos && KO_COORD_BETWEEN.test(text.slice(a.end, b.pos));
    });
  const inClause = (t: TagHit) => clauseOf(t.pos) === pClause;
  // 여행·원정·경기 뜻의 'T행'('결승 앞두고 뮌헨행'·'리버풀행 전세기') — 이 제목의 'T행'은 방향이 아니다
  const travel = KO_TRAVEL.test(text);

  for (const team of teams) {
    if (!inClause(team) || coordinated(team)) continue;
    // 선수 뒤 팀은 사이가 허용 말뿐일 때만('김민재, 팀 동료 아스널 이적설'·'이강인, 쿠보 레알 이적설'은 다른 사람 이야기 — D54)
    if (team.pos >= player.end && !koGapOk(text, player.end, team.pos, teams)) {
      continue;
    }
    const after = text.slice(team.end);
    const before = text.slice(clauseStart(pClause), team.pos);
    // 행선지
    const haeng = KO_TO_HAENG.exec(after);
    const noun = KO_TO_NOUN.exec(after);
    let to = false;
    if (haeng) {
      const rest = after.slice(1); // '행' 뒤
      if (
        !travel &&
        !KO_NEG_AFTER.test(rest) &&
        !koHaengIsPast(rest) &&
        KO_MOVE_CUE.test(rest)
      ) {
        to = true;
        d.evidence.push(`to:${team.slug}:행`);
      }
    } else if (noun) {
      const nounPos = team.end + (noun[1]?.length ?? 0);
      const rest = after.slice(noun[0].length);
      // 이적 명사 바로 뒤가 단서('이적설'·'이적 가능성'·'이적 확정')이거나 절 끝일 때만 — '이적 2년 만에 우승'·'이적 신의 한 수'는 아니다
      if (
        !pastAt(nounPos) &&
        !KO_NOUN_COMPOUND.test(rest) &&
        !KO_AFTER_PAST.test(rest) &&
        !KO_NEG_AFTER.test(rest) &&
        (KO_MOVE_CUE.test(rest) || KO_CLAUSE_END.test(rest))
      ) {
        to = true;
        d.evidence.push(`to:${team.slug}:${noun[0].trim()}`);
      }
    } else if (KO_TO_GO.test(after) || KO_TO_QUESTION.test(after)) {
      to = true;
      d.evidence.push(`to:${team.slug}:로`);
    } else if (KO_BUYER_INTEREST.test(after) || KO_BUYER_OFFER.test(after)) {
      to = true;
      d.evidence.push(`to:${team.slug}:관심`);
    }
    if (to) {
      d.to.add(team.slug);
      noteImplied(d, pClause, "rumor");
      continue;
    }
    // 사는 쪽 주어 — 절 첫머리의 팀 + (조사·쉼표) + 선수 + 영입·관심 말
    if (team.end <= player.pos) {
      const head = before.replace(/\[[^\]]*\]|[‘’'"“”「」『』\s]/gu, "");
      const link = text.slice(team.end, player.pos);
      const buy = KO_BUYER_AFTER_PLAYER.exec(text.slice(player.end));
      // '맨유의 김민재 영입'(절 첫머리 팀 + 의 = 사는 쪽) · 지난 영입('PSG, 이강인 영입 당시 비화')은 아니다
      if (
        head === "" &&
        /^(?:이|가|은|는|도|의)?\s?,?\s?$/u.test(link) &&
        buy !== null &&
        !KO_AFTER_PAST.test(text.slice(player.end + buy[0].length)) &&
        !KO_PAST_TRANSFER_RE.some((re) =>
          new RegExp(re.source, "u").test(
            text.slice(player.end, player.end + buy[0].length + 6),
          ),
        )
      ) {
        d.to.add(team.slug);
        d.evidence.push(`to:${team.slug}:buyer`);
        noteImplied(d, pClause, "rumor");
        continue;
      }
      // 역할 묘사 — 'T 수비수 P' → 출발
      const between = link.replace(/[‘’'"“”]/gu, " ");
      if (KO_ROLE.test(between) && !KO_FORMER_BEFORE.test(before)) {
        d.from.add(team.slug);
        d.evidence.push(`from:${team.slug}:role`);
        continue;
      }
    }
    // 출발
    if (KO_FROM.test(after) && !KO_FORMER_BEFORE.test(before)) {
      d.from.add(team.slug);
      d.evidence.push(`from:${team.slug}:떠남`);
      noteImplied(d, pClause, "rumor");
    }
  }
  // 'T1에서 T2(으)로·T2 이적' · 'T1→T2'
  for (const t1 of teams) {
    for (const t2 of teams) {
      if (t2.pos < t1.end || !inClause(t1) || !inClause(t2)) continue;
      const mid = text.slice(t1.end, t2.pos);
      if (KO_ARROW_BETWEEN.test(mid)) {
        d.from.add(t1.slug);
        d.to.add(t2.slug);
        d.evidence.push(`arrow:${t1.slug}>${t2.slug}`);
        noteImplied(d, pClause, "rumor");
      } else if (KO_FROM_BETWEEN.test(mid) && d.to.has(t2.slug)) {
        d.from.add(t1.slug);
        d.evidence.push(`from-to:${t1.slug}>${t2.slug}`);
      }
    }
  }
  return d;
}

// ─── 선수(꾸미는 자리 빼기) ────────────────────────────────────────────────

/** 국내 제목 선수 뒤 관계 명사('이강인 공격 파트너'·'김민재 대체자'·'이강인 킬패스'·'음바페 대신') — 선수가 기사 주어가 아니다 */
const KO_REL_AFTER = new RegExp(
  `^(?:의)?\\s?(?:[^\\s…!?,]+\\s){0,2}(?:동료|파트너|절친|대체자|대체|후계자|후임|공백|빈자리|대신|에이전트|대리인|소속팀|팀|형|친형|동생|친동생|아버지|부친|아들|사촌|라이벌|경쟁자|백업|짝꿍|스승|제자|효과|킬패스|패스|도움|감독|친구|닮은꼴|후배|선배|대항마|판박이|자리|영입\\s?효과|닮은|같은|스타일|유형|타입)${KO_SUFFIX}(?![\\p{Script=Hangul}])`,
  "u",
);

/**
 * 국내 제목 선수 뒤 동반·비교 표현('김민재와 한솥밥'·'이강인과 호흡'·'이강인 따라 마드리드 간다'·'카르바할처럼'·'음바페 대신'·'김민재
 * 제치고') — 다른 선수 이야기다
 */
const KO_WITH_AFTER =
  /^(?:(?:와|과|랑|하고)\s?(?:함께|한솥밥|호흡|발\s?맞|동료|경쟁|비교|맞대결|재회|투톱|짝)|(?:을|를)?\s?(?:따라|뒤이어|이어|제치고|밀어내고|대신)(?![\p{Script=Hangul}])|(?:처럼|같은|같이|만큼|보다)(?![\p{Script=Hangul}]))/u;

/**
 * 국내 제목에서 선수가 주어(또는 사는 쪽의 목적어)라는 근거 — 이름 뒤가 ① 쉼표·주격/보조사('김민재, …'·'김민재는') ② 절 끝('김민재?')
 * ③ 두 낱말 안에 이적 말('김민재 아스널 이적'·'엔드릭 겨울 임대설'·'아스널, 김민재 영입'·'김민재의 아스널행'). 근거가 없으면 다른 사람
 * 이야기에 곁들여 나온 이름일 수 있다('바이에른, 김민재 옆에 설 수비수 영입 임박').
 */
const KO_SUBJECT_AFTER = new RegExp(
  `^(?:(?:은|는|이|가|도|의)?\\s?[,，]|(?:은|는|이|가|도)(?![\\p{Script=Hangul}])|[\\s'"‘’“”]*(?:$|[…!?.\\])])|(?:의|을|를|에)?\\s?(?:[^\\s…!?,]+\\s){0,2}?(?:(?:완전|임대|깜짝|전격)\\s?)?(?:이적|영입|임대|입단|합류|행선지|거취|메디컬|협상|러브콜|관심|오퍼|제안|매물|방출|결별|노린|노려|원한|원해|눈독|군침|탐내|탐낸|주시|품었|품는|데려|낚아)|(?:의)?\\s?(?:[^\\s…!?,]+\\s){0,2}?[^\\s…!?,]+행(?![\\p{Script=Hangul}]))`,
  "u",
);

/** 국내 제목 선수가 꾸미는 자리인가(관계 명사·동반 표현·지난 이적의 목적어 — '이강인 이적 설득한 코케') 또는 주어 근거가 없는가 */
/** 국내 제목 선수 앞 꾸밈('제2의 이강인'·'포스트 김민재'·'넥스트 손흥민') — 닮은 다른 선수다 */
const KO_REL_BEFORE = /(?:제\s?\d+의|포스트|넥스트|차세대|리틀)\s?['‘"“]?$/u;

function koIsModifier(text: string, hit: TagHit): boolean {
  const after = text.slice(hit.end);
  if (KO_REL_AFTER.test(after) || KO_WITH_AFTER.test(after)) return true;
  if (KO_REL_BEFORE.test(text.slice(0, hit.pos))) return true;
  const near = after.slice(0, 16);
  if (KO_PAST_TRANSFER_RE.some((re) => new RegExp(re.source, "u").test(near))) {
    return true;
  }
  return !KO_SUBJECT_AFTER.test(after);
}

/** 팀 바로 뒤 사람 명사(`latinDirections` — 사는 쪽이 아니다) */
const LATIN_TEAM_PEOPLE: Readonly<Record<LatinLang, ReadonlySet<string>>> = {
  en: set(
    "fans",
    "fan",
    "supporters",
    "supporter",
    "legend",
    "legends",
    "great",
    "greats",
    "icon",
    "icons",
    "hero",
    "heroes",
    "players",
    "boss",
    "bosses",
    "manager",
    "coach",
    "captain",
    "chairman",
    "owner",
    "owners",
    "president",
    "director",
    "ceo",
    "ultras",
  ),
  it: set(
    "tifosi",
    "leggenda",
    "allenatore",
    "tecnico",
    "presidente",
    "capitano",
    "giocatori",
    "direttore",
  ),
  es: set(
    "aficion",
    "aficionados",
    "hinchas",
    "leyenda",
    "entrenador",
    "tecnico",
    "presidente",
    "capitan",
    "jugadores",
  ),
};

/** 선수 바로 뒤 닮은꼴 명사("a Bukayo Saka type"·'Saka-like winger'·'Saka-style') — 다른 선수다(3회차 리뷰 중요 9) */
const LATIN_LOOKALIKE_AFTER = set(
  "type",
  "types",
  "style",
  "like",
  "esque",
  "lookalike",
  "clone",
  "mould",
  "mold",
  "tipo",
  "stile",
  "estilo",
);
/** 역할 묘사를 건너 본 선수 앞 닮은꼴 말('next star Bukayo Saka'·'another winger Saka' — 'new'는 바로 앞만) */
const LATIN_LOOKALIKE_BEFORE = set(
  "next",
  "another",
  "future",
  "prossimo",
  "proximo",
);

function latinIsModifier(tokens: Tokens, span: Span, r: LatinRules): boolean {
  const words = tokens.words;
  if (LATIN_LOOKALIKE_AFTER.has(words[span.e] ?? "")) return true;
  {
    let i = span.s - 1;
    while (
      i >= 0 &&
      (EN_ROLE_HEADS.has(words[i]!) ||
        EN_ROLE_MODIFIERS.has(words[i]!) ||
        LATIN_ROLE_NOUNS.en.has(words[i]!))
    ) {
      i -= 1;
    }
    if (i < span.s - 1 && LATIN_LOOKALIKE_BEFORE.has(words[i] ?? "")) {
      return true;
    }
  }
  // 뒤 네 낱말 안의 관계 명사("Saka's England team-mate"·"Kane's new strike partner"·'Bellingham's younger brother')
  for (let i = span.e; i < Math.min(words.length, span.e + 4); i++) {
    const x = words[i]!;
    if (x === BREAK || x === COMMA) break;
    if (r.relAfter.has(x)) return true;
  }
  const prev = words[span.s - 1];
  if (prev !== undefined && r.relBefore.has(prev)) return true;
  // '관계 명사 (+꾸밈말 둘까지) + of/di/de' 뒤('replacement for Kane'·'el hermano pequeño de Lamine Yamal')
  if (prev !== undefined && r.ofWords.has(prev)) {
    for (let i = span.s - 2; i >= Math.max(0, span.s - 4); i--) {
      const x = words[i]!;
      if (x === BREAK) break;
      if (r.relOf.has(x)) return true;
    }
  }
  return false;
}

/** 계약 기간 표현(재계약 단서 — `transferClaimOf`) — 'until 2033'·'on deal running to 2033'·"until '33"·'fino al 2030'·'hasta 2030'·'2034년까지' */
const CONTRACT_UNTIL =
  /\b(?:until|till|through|running to|runs to|to)\s+(?:20\d\d|['’]\d\d|june|summer|the\s+end)\b|\bfino\s+al\s+20\d\d\b|\bhasta\s+(?:el\s+)?20\d\d\b|20\d\d년\s?까지/iu;
/** 가정·게임 속 이야기 표현(`transferClaimOf`) */
const HYPOTHETICAL =
  /\b(?:alternate|alternative) (?:reality|universe)\b|\bparallel universe\b|\b(?:perfect|ideal) world\b|\bcareer mode\b|\bfootball manager\b|\bfifa\s?\d\d\b|\bea (?:sports )?fc\b|\bvideo ?game\b|\bsimulat(?:ion|ed)\b|\bhypothetical(?:ly)?\b|\bimagine\b|\bwhat if\b|만약|가상\s?(?:시나리오|이적|현실)|상상\s?속|시뮬레이션|커리어\s?모드|피파\s?\d\d/iu;
/** 선수 바로 뒤 계약 명사(`transferClaimOf` — 재계약 이야기) */
const LATIN_PLAYER_CONTRACT = new Set([
  "contract",
  "contracts",
  "extension",
  "renewal",
  "contratto",
  "rinnovo",
  "contrato",
  "renovacion",
]);
/** 계약 기간 표현 — 'on a five-year contract'·'on nine-year deal'·'in a long-term deal'(3회차 결정 B) */
const CONTRACT_LENGTH =
  /\b(?:on|in)\s+(?:a\s+)?(?:new\s+)?(?:(?:[\p{L}\d]+[-\s]){1,4}years?|long[-\s]term)\s+(?:deal|contract)\b/iu;
/** 'here we go'가 든 제목(3회차 결정 C) */
const HERE_WE_GO_ANY = /here\s*we\s*go|히어\s?위\s?고/iu;
/** 계약 기간이 재계약 단서가 되는 꼴 — 'signs for'·'T sign(s) P'·'joins'·'commits'·'new … deal'·'ficha por'·'firma'(D54 결정) */
const SIGNS_FORM =
  /\b(?:signs?|signed|signing) for\b|\b(?:sign|signs|signed)\b|\bjoin(?:s|ed)?\b|\bcommit(?:s|ted)?\b|\bnew\b[^,:;|]*\b(?:deal|contract)\b|\bficha por\b|\bfirma\b/iu;
/** 계약 길이가 재계약 단서가 되는 꼴 — `SIGNS_FORM`에서 새 팀 합류 동사('joins'·'ficha por')를 뺀 것(3회차 결정 B·마무리 조정) */
const SIGNS_FORM_LENGTH =
  /\b(?:signs?|signed|signing) for\b|\b(?:sign|signs|signed)\b|\bcommit(?:s|ted)?\b|\bnew\b[^,:;|]*\b(?:deal|contract)\b|\bfirma\b/iu;

/**
 * 라틴 제목의 rumor 표현이 그 선수 이야기인가(D54 — rumor 키워드의 귀속) — 선수가 절(쉼표 마디) 첫머리이고 바로 뒤가 이적설 동사·명사
 * (`LATIN_RUMOR_LEAD` — 'Kane linked with'·'Kane wanted by'·'Kane transfer'·"Kane's future") 이며 선수 뒤 같은 절에 다른 선수 역할 명사가
 * 없다('Harry Kane praises Bayern Munich transfer target'·'Bukayo Saka reacts to Arsenal interest in winger'는 아니다).
 */
function latinRumorAttributed(
  tokens: Tokens,
  span: Span,
  lang: LatinLang,
): boolean {
  const words = tokens.words;
  const articles = LATIN_RULES[lang].articles;
  for (let i = span.s - 1; i >= 0; i--) {
    const x = words[i]!;
    if (x === BREAK || x === COMMA) break;
    if (!articles.has(x)) return false;
  }
  let at = span.e;
  if (words[at] === COMMA) at += 1; // 'Kane, nel mirino del Milan'
  const lead = words[at];
  if (lead === "s") {
    const n = words[at + 1];
    if (n === undefined || !EN_POSSESSIVE_LEAD.has(n)) return false;
  } else if (lead === undefined || !LATIN_RUMOR_LEAD[lang].has(lead)) {
    return false;
  }
  for (let i = span.e; i < words.length && words[i] !== BREAK; i++) {
    if (LATIN_ROLE_NOUNS[lang].has(words[i]!)) return false;
  }
  return true;
}

/** 국내 rumor 표현 정규식(낱말 앞 경계 — 위치를 찾으려고 표마다 따로) */
const KO_RUMOR_RES: readonly RegExp[] = (
  TRANSFER_RUMOR_TERMS.terms.ko ?? []
).flatMap((term) => {
  const re = koTermRegex(term, "gu");
  return re ? [re] : [];
});
const KO_RUMOR_EXCLUDES: readonly RegExp[] = [
  ...(TRANSFER_RUMOR_TERMS.exclude?.ko ?? []).flatMap((term) => {
    const re = koTermRegex(term, "gu");
    return re ? [re] : [];
  }),
  ...(TRANSFER_RUMOR_TERMS.excludeKoRe ?? []).map(
    (re) => new RegExp(re.source, "gu"),
  ),
];

/**
 * 국내 제목에서 선수와 그 뒤 이적 말 사이에 올 수 있는 말(이것과 팀 이름·조사·문장부호만 — '엔드릭 겨울 임대설'·'김민재 아스널 이적
 * 가능성'). 다른 사람 말('이강인, 동료 이적설'·'김민재, 팀 동료 아스널 이적설'·'이강인, 쿠보 레알 이적설')이 끼면 그 선수 이야기가 아니다.
 */
const KO_GAP_OK = new Set([
  "겨울",
  "여름",
  "올겨울",
  "올여름",
  "내년",
  "1월",
  "이번",
  "이번엔",
  "이번에는",
  "또",
  "다시",
  "또다시",
  "최근",
  "깜짝",
  "완전",
  "전격",
  "자유",
  "임대",
  "빅클럽",
  "명문",
  "유럽",
  "현지",
  "충격",
  "스페인",
  "잉글랜드",
  "독일",
  "이탈리아",
  "프랑스",
  "프리미어리그",
  "epl",
  "pl",
  "라리가",
  "분데스리가",
  "세리에",
  "리그앙",
  "클럽",
  "구단",
  "새",
  "첫",
  // 출발 팀 다음 말('김민재, 바이에른 떠나 아스널행 확정')
  "떠나",
  "떠난",
  "떠나고",
  "떠나서",
  "결별",
  "결별하고",
]);

/** 선수 끝 ~ 자리 사이가 허용 말뿐인가(팀 이름은 지운다) */
function koGapOk(
  text: string,
  from: number,
  to: number,
  teams: readonly TagHit[],
): boolean {
  let gap = text.slice(from, to);
  for (const t of teams) {
    if (t.pos >= from && t.end <= to) {
      gap =
        gap.slice(0, t.pos - from) +
        " ".repeat(t.end - t.pos) +
        gap.slice(t.end - from);
    }
  }
  const particle = new RegExp(`${KO_SUFFIX_PATTERN}$`, "u");
  return gap
    .split(/[\s,·]+/u)
    .map((w) => w.replace(/[‘’'"“”]/gu, ""))
    .filter((w) => w !== "")
    .every((w) => {
      const bare = w.toLowerCase().replace(particle, "");
      return (
        bare === "" ||
        KO_GAP_OK.has(bare) ||
        KO_GAP_OK.has(w.toLowerCase()) ||
        // 계약 기간·햇수('2030년까지'·'5년')
        /^(?:20\d\d년(?:까지)?|\d년)$/u.test(w)
      );
    });
}

/**
 * 국내 제목의 rumor 표현이 그 선수 이야기인가(D54) — 같은 절에서 ① 선수 뒤의 rumor 표현이면 사이가 허용 말뿐(`koGapOk`) ② 선수 앞이면
 * 선수 바로 앞에서 닫히는 인용 안('“영입 후보로 제시” 김민재')
 */
function koRumorAttributed(
  text: string,
  player: TagHit,
  teams: readonly TagHit[],
  clauseStart: number,
  clauseLength: number,
): boolean {
  const clauseEnd = clauseStart + clauseLength;
  let hay = text.toLowerCase();
  for (const ex of KO_RUMOR_EXCLUDES) {
    hay = hay.replace(ex, (m) => "\u0000".repeat(m.length));
  }
  const quoteBefore = /[’”'"]\s?$/u.test(text.slice(clauseStart, player.pos));
  for (const re of KO_RUMOR_RES) {
    re.lastIndex = 0;
    for (const m of hay.matchAll(re)) {
      if (m.index < clauseStart || m.index >= clauseEnd) continue;
      if (m.index >= player.end) {
        if (koGapOk(text, player.end, m.index, teams)) return true;
      } else if (m.index < player.pos && quoteBefore) {
        const between = text.slice(m.index, player.pos);
        if (/[’”'"]/u.test(between) && !/[‘“]/u.test(between.slice(1))) {
          return true;
        }
      }
    }
  }
  return false;
}

// ─── 제목 1건 → 주장 ───────────────────────────────────────────────────────

/** 제목 1건의 이적 추출 입력 */
export interface TransferTitleInput {
  title: string;
  lang: string;
  /** 그 기사 소스의 대회(겹치는 별칭 확인 — tag-names.ts `matchTitleTags`) */
  sourceComps?: readonly CompId[];
  /** classify.ts가 인정한 그 제목의 선수 slug(동명이인·직업 명사를 걸러 낸 뒤) — 이 밖의 선수 태그는 보지 않는다 */
  players: readonly string[];
  /** 이적 화제(classify.ts `TextSignals.transfer`) */
  transfer: boolean;
  /** 재계약 표현(`TextSignals.renewal`) */
  renewal: boolean;
  /** 여러 소식 묶음 제목(`TextSignals.roundup`) */
  roundup: boolean;
  /** gossip 앞 문장의 묶음 여부(`gossipLead`가 있을 때 — classify.ts `isMultiStoryTitle`) */
  gossipLeadRoundup?: boolean;
}

/** 제목에서 이적 정보를 만들지 않은 이유(검수·테스트용) */
export type TransferSkipReason =
  | "no-topic"
  | "renewal"
  | "roundup"
  | "agent"
  | "no-player"
  | "players"
  | "no-status"
  | "current-team"
  | "hypothetical"
  | "no-move";

/** 제목 1건의 주장 */
export interface TransferClaim {
  player: string;
  status: TransferStatus;
  from?: string;
  to?: string;
  /** official의 근거가 명시 표현('[오피셜]'·'Official:'·'공식 발표'·'is official' — D52 ①)인가. official일 때만 */
  explicit?: boolean;
  /** 근거 표시(검수·테스트용 — 카드·data/에 넣지 않는다) */
  evidence: string[];
}

export type TransferClaimResult =
  | { claim: TransferClaim; skip?: undefined }
  | { claim?: undefined; skip: TransferSkipReason };

/** 제목 1건 → 주장(머리 주석 ①~④) */
export function transferClaimOf(
  input: TransferTitleInput,
  tags: TagIndex,
): TransferClaimResult {
  const lead = input.roundup ? gossipLead(input.title) : null;
  const gossip = lead !== null && !(input.gossipLeadRoundup ?? false);
  if (input.roundup && !gossip) return { skip: "roundup" };
  if (!input.transfer && !gossip) return { skip: "no-topic" };
  const title = gossip ? lead : input.title;
  const lang = input.lang;
  const whole = titleText(title, lang);
  if (
    input.renewal ||
    matchesGroup(whole, T.renewalHint) ||
    (!isKoLang(lang) && LATIN_NEW_DEAL.test(title))
  ) {
    return { skip: "renewal" };
  }
  if (matchesGroup(whole, T.agent)) return { skip: "agent" };
  // 가정·게임 속 이야기('In an alternate reality, Arsenal agree fee for Bukayo Saka'·'In FIFA 27 career mode, …'·'만약 김민재가 …') —
  // 지금 일이 아니다(M1-18 3회차 리뷰 중요 5)
  if (HYPOTHETICAL.test(title)) return { skip: "hypothetical" };

  const ko = isKoLang(lang);
  const latinLang: LatinLang | null = ko
    ? null
    : ((["en", "it", "es"] as const).find(
        (l) => lang.toLowerCase().split(/[-_]/)[0] === l,
      ) ?? null);

  // 절과 태그(라틴은 절 경계를 쌍점으로 바꾼 제목에 태그를 맞춘다 — 경계 낱말이 절 번호가 된다)
  const latin = ko ? null : latinClauses(title);
  const tagTitle = latin ? latin.tagTitle : title;
  const text = tagMatchText(tagTitle, lang);
  const tagged = matchTitleTags(tagTitle, lang, tags, {
    sourceComps: input.sourceComps ?? [],
  });
  const allowed = new Set(input.players);
  const playerHits = tagged.players.filter((p) => allowed.has(p.slug));
  if (playerHits.length === 0) return { skip: "no-player" };

  let clauses: Clause[];
  let clauseOfPos: (pos: number) => number;
  let clauseStart: (clause: number) => number = () => 0;
  let tokens: Tokens | null = null;
  if (latin) {
    clauses = latin.clauses;
    tokens = tokenize(text);
    const breakIdx = tokens.words.flatMap((x, i) => (x === BREAK ? [i] : []));
    const byWord = (wi: number) => breakIdx.filter((b) => b < wi).length;
    const tk = tokens;
    clauseOfPos = (pos) => byWord(tk.at.get(pos) ?? 0);
  } else {
    const kc = koClauses(text);
    clauses = kc.clauses;
    clauseOfPos = (pos) => kc.starts.filter((s) => s <= pos).length - 1;
    clauseStart = (c) => kc.starts[c] ?? 0;
  }

  // 등위로 이어진 두 선수('김민재·이강인, 나란히 아스널 이적설'·'김민재 이어 이강인도'·'Kane and Saka linked with') — 한 선수 이야기가 아니다
  for (const a of playerHits) {
    for (const b of playerHits) {
      if (a === b || a.slug === b.slug || b.pos < a.end) continue;
      const between = text.slice(a.end, b.pos);
      if (
        ko
          ? /^\s?(?:[·/,&]|와|과|및|이나|나|또는|(?:에\s?)?(?:이어|뒤이어))\s?$/u.test(
              between,
            )
          : /^\s(?:and|or|e|y|ed|\u01c0)\s$/iu.test(between)
      ) {
        return { skip: "players" };
      }
    }
  }

  // 선수 — 꾸미는 자리를 뺀 것이 정확히 1명
  const subjects = playerHits.filter((hit) => {
    if (ko) return !koIsModifier(text, hit);
    if (!tokens || !latinLang) return true;
    const span = toSpan(hit, tokens);
    return (
      span !== null && !latinIsModifier(tokens, span, LATIN_RULES[latinLang])
    );
  });
  const subjectSlugs = [...new Set(subjects.map((s) => s.slug))];
  if (subjectSlugs.length !== 1) {
    return { skip: subjectSlugs.length === 0 ? "no-player" : "players" };
  }
  const player = subjects[0]!;

  // 방향
  let dir: Directions = newDirections();
  const pSpan = tokens ? toSpan(player, tokens) : null;
  if (ko) {
    dir = koDirections(text, player, tagged.teams, clauseOfPos, clauseStart);
  } else if (tokens && latinLang) {
    const tk = tokens;
    const teamSpans = tagged.teams.flatMap((t) => {
      const s = toSpan(t, tk);
      return s ? [s] : [];
    });
    if (pSpan) {
      const breakIdx = tk.words.flatMap((x, i) => (x === BREAK ? [i] : []));
      dir = latinDirections(
        tk,
        pSpan,
        teamSpans,
        latinLang,
        (wi) => breakIdx.filter((b) => b < wi).length,
      );
    }
  }

  // 선수 바로 뒤 계약 명사("Bukayo Saka contract"·"Kane's contract extension"·'rinnovo di Leão'는 아니다 — 앞 꼴만) — 그 선수의 계약
  // (재계약) 이야기다. 'Arsenal pull out of talks for Bukayo Saka contract'의 결렬은 재계약 결렬이다(M1-18 3회차 리뷰 중요 9)
  if (tokens && pSpan) {
    let at = pSpan.e;
    if (tokens.words[at] === "s") at += 1;
    if (tokens.words[at] === "new") at += 1;
    if (LATIN_PLAYER_CONTRACT.has(tokens.words[at] ?? "")) {
      return { skip: "renewal" };
    }
  }

  // 높은 단계(negotiating·agreed·official·collapsed) — 닫힌 문형에 앞뒤까지 맞을 때만(PRD §15 D54, transfer-patterns.ts). gossip 앞 문장은
  // rumor까지만(다른 신문 보도 모음)
  // 움직임 근거가 없는 합의·협상 꼴('Acuerdo total entre el Barça y Lamine Yamal'·'Bukayo Saka agrees terms with Arsenal' — 재계약일 수
  // 있다)은 단계 근거가 아니다(M1-18 3회차 오케스트레이터 결정 A — rumor 귀속 조건은 그대로)
  const matched = gossip
    ? []
    : matchStagePatterns({
        title,
        lang,
        playerSlug: player.slug,
        tags,
        sourceComps: input.sourceComps ?? [],
      });
  const highs = matched.filter((h) => h.moved);
  // rumor — 선수가 든 절의 rumor 표현이 그 선수에게 걸리거나(`rumorAttributed`), 선수와 팀을 묶는 방향 근거가 있을 때(D54 — rumor는 키워드
  // 방식 유지). 잔류 표현이 있는 제목의 방향은 근거가 아니다('È ufficiale: Harry Kane resta al Bayern')
  const pClause = clauseOfPos(player.pos);
  const pc = clauses[pClause] ?? { text: title };
  const stay = matchesGroup(whole, T.stay);
  const rumorTerms =
    matchesGroup(titleText(pc.text, lang), T.rumor) &&
    (ko
      ? koRumorAttributed(
          text,
          player,
          tagged.teams,
          clauseStart(pClause),
          pc.text.length,
        )
      : tokens !== null &&
        latinLang !== null &&
        pSpan !== null &&
        latinRumorAttributed(tokens, pSpan, latinLang));
  const dirRumor = !stay && dir.implied.has(pClause);
  const evidence = [
    ...highs.map((h) => `pattern:${h.id}`),
    ...matched.filter((h) => !h.moved).map((h) => `pattern:${h.id}:no-move`),
    ...(rumorTerms ? ["terms:rumor"] : []),
    ...dir.evidence,
  ];
  const one = (values: ReadonlyArray<string | undefined>) => {
    const set = new Set(values.filter((v): v is string => v !== undefined));
    return set.size === 1 ? [...set][0] : undefined;
  };
  let status: TransferStatus | null = null;
  let explicit = false;
  let to: string | undefined;
  let from: string | undefined;
  if (highs.length > 0) {
    const coll = highs.filter((h) => h.status === "collapsed");
    const prog = highs.filter((h) => h.status !== "collapsed");
    let basis = prog;
    if (coll.length > 0 && prog.length > 0) {
      // 결렬 문형과 진행 문형이 함께 — 어느 쪽인지 모른다
      status = "rumor";
      evidence.push("pattern:conflict");
    } else if (coll.length > 0) {
      status = "collapsed";
      basis = coll;
    } else {
      status = prog
        .map((h) => h.status as ProgressStatus)
        .reduce((a, b) => maxProgress(a, b));
      explicit = prog.some((h) => h.status === "official" && h.explicit);
    }
    to = one(basis.map((h) => h.to));
    from = one(basis.map((h) => h.from));
  } else if (rumorTerms || dirRumor) {
    status = "rumor";
    if (!stay) {
      to = dir.to.size === 1 ? [...dir.to][0] : undefined;
      from = dir.from.size === 1 ? [...dir.from][0] : undefined;
      if (dir.to.size > 1) evidence.push("to:ambiguous");
      if (dir.from.size > 1) evidence.push("from:ambiguous");
    }
  }
  if (status === null) return { skip: "no-status" };
  // 움직임 근거가 없는 합의·협상 꼴에만 맞은 제목('Bayern Munich agree deal for Harry Kane'·'Barcelona close to deal for Lamine Yamal')은
  // 그 선수에게 걸린 rumor 표현이 따로 없으면 주장을 만들지 않는다 — 같은 말에서 나온 방향 규칙(사는 쪽 'deal for')은 근거로 세지 않는다
  // (재계약일 수 있다 — M1-18 3회차 마무리, 오케스트레이터 결정 A의 (c)). 카테고리는 이적 화제로 남는다(classify.ts)
  if (highs.length === 0 && matched.some((h) => !h.moved) && !rumorTerms) {
    return { skip: "no-move" };
  }
  if (gossip) {
    status = "rumor";
    explicit = false;
  }
  // 'here we go'가 든 제목은 agreed가 상한이다(FR-103·D52 — 국내 매체가 'HERE WE GO'를 '이적 확정'으로 옮긴다, 3회차 결정 C)
  if (status === "official" && HERE_WE_GO_ANY.test(title)) {
    status = "agreed";
    explicit = false;
    evidence.push("cap:here-we-go");
  }
  if (to !== undefined && to === from) {
    evidence.push("direction:conflict");
    to = undefined;
    from = undefined;
  }
  if (stay && (to !== undefined || from !== undefined)) {
    evidence.push("direction:stay");
    to = undefined;
    from = undefined;
  }
  // 등록 한국 선수의 행선지가 설정의 지금 소속팀 — 이미 끝난 이적 이야기('이강인, 아틀레티코 이적하자마자 주연')이거나 잘못 읽었다.
  // 주장을 만들지 않는다(보수적)
  const current = tags.playerTeam.get(player.slug);
  if (
    current !== undefined &&
    (dir.to.has(current) || highs.some((h) => h.to === current))
  ) {
    return { skip: "current-team" };
  }
  // 계약 기간('until 2033'·'on deal running to 2033'·'fino al 2030')은 'joins'·'signs for'·'commits'·'new deal' 꼴에서만 재계약 단서다
  // ('Cole Palmer signs for Chelsea until 2033' — D54 결정). 지금 소속을 아는 등록 한국 선수가 다른 팀으로 갈 때는 이적. 'here we go'·
  // 'P to T' 첫머리 꼴은 계약 기간이 있어도 주장을 만든다
  // 'on a five-year contract'·'on nine-year deal' 꼬리는 'signs for'·'T sign(s) P'·'commits'·'new deal' 꼴에서 재계약 단서다(3회차 결정 B —
  // 'Arsenal sign Bukayo Saka on a five-year contract'). 새 팀 합류 동사('joins'·'officially joins'·'ficha por')는 빼다(마무리 조정 —
  // 'Harry Kane joins Arsenal on a five-year deal'은 문형대로). from 슬롯·금액이 있는 문형('… from Chelsea on a five-year deal'·'£40m')은
  // 이동이 분명하다
  const renewalByUntil =
    CONTRACT_UNTIL.test(title) &&
    (SIGNS_FORM.test(title) || highs.some((h) => h.signsForm));
  const renewalByLength =
    CONTRACT_LENGTH.test(title) &&
    (SIGNS_FORM_LENGTH.test(title) ||
      highs.some((h) => h.signsForm && !h.joinForm));
  if (
    (renewalByUntil || renewalByLength) &&
    !highs.some((h) => h.strongMove) &&
    !(current !== undefined && to !== undefined && to !== current)
  ) {
    return { skip: "renewal" };
  }
  return {
    claim: {
      player: player.slug,
      status,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(status === "official" ? { explicit } : {}),
      evidence,
    },
  };
}

// ─── 클러스터 → 카드 transfer ─────────────────────────────────────────────

/** 주장 + 그 기사(묶음)의 출처 */
export interface TransferEvidence {
  claim: TransferClaim;
  /** 그 묶음을 낸 소스들의 매체명(중복 없음) */
  publishers: readonly string[];
  /** 그 묶음 소스 중 가장 높은 Tier */
  tier: Tier;
  /** 기사 발행 시각(ms) */
  atMs: number;
}

/** 승격 조건(머리 주석 ⑥)을 만족하는가 — 그 단계 이상을 말한 기사들 */
function promotionOk(
  backers: readonly TransferEvidence[],
  rule: typeof PROMOTION_RULE,
): boolean {
  if (backers.length === 0) return false;
  if (backers.some((b) => b.tier <= rule.maxTier)) return true;
  const names = new Set(backers.flatMap((b) => b.publishers));
  return names.size >= rule.minPublishers;
}

/** 서로 다른 매체(매체명) 수 */
const publisherCount = (backers: readonly TransferEvidence[]) =>
  new Set(backers.flatMap((b) => b.publishers)).size;

/**
 * official 조건(PRD §15 D52 ① — 2026-10-17 사용자 결정): 서로 다른 매체 2곳 이상이 official을 말하거나, 명시 표현(`explicit`)으로 official을
 * 말한 기사의 출처가 Tier 2 이상. 완료·방향 동사('joins'·'completes move'·'입단 확정')만인 단일 출처는 Tier 2여도 official이 아니다.
 */
function officialOk(
  backers: readonly TransferEvidence[],
  rule: typeof PROMOTION_RULE,
): boolean {
  if (publisherCount(backers) >= rule.minPublishers) return true;
  return backers.some(
    (b) => b.claim.explicit === true && b.tier <= rule.maxTier,
  );
}

/**
 * 주장들 → 카드 transfer(머리 주석 ⑤~⑦) — 주장이 없거나 선수가 둘 이상이면 null.
 *   - 진행 단계: 가장 높은 것 → official은 `officialOk`(D52 ①), 못 미치면 agreed → agreed 이상은 `promotionOk`(PRD F10), 못 미치면 negotiating
 *   - 결렬: 결렬을 말한 기사도 같은 승격 조건(Tier 2 이상 또는 매체 2곳 — D52 ②), 못 미치면 그 결렬 주장은 버린다(진행 단계 유지 — 남은
 *     주장이 없으면 null). 조건을 넘은 결렬이 가장 늦은 진행 주장보다 같거나 늦으면 collapsed
 *   - 출발·행선지: 최종 단계를 만든 주장들의 합(결렬이면 결렬 주장만 — 진행 주장의 행선지를 빌리지 않는다, 리뷰 4(c)) — 역할마다 다른 팀이면
 *     그 역할 생략, 같은 팀이 양쪽이면 둘 다 생략
 */
export function combineTransferClaims(
  evidence: readonly TransferEvidence[],
  cardTier: Tier,
  rule: typeof PROMOTION_RULE = PROMOTION_RULE,
): CardTransfer | null {
  if (evidence.length === 0) return null;
  const players = new Set(evidence.map((e) => e.claim.player));
  if (players.size !== 1) return null;
  const player = evidence[0]!.claim.player;

  const progressOf = (e: TransferEvidence): ProgressStatus | null =>
    e.claim.status === "collapsed" ? null : e.claim.status;
  const progressed = evidence.filter((e) => progressOf(e) !== null);
  const collapsedAll = evidence.filter((e) => e.claim.status === "collapsed");
  // 결렬도 승격 조건(D52 ②) — 못 미치면 버린다
  const collapsed = promotionOk(collapsedAll, rule) ? collapsedAll : [];
  if (progressed.length === 0 && collapsed.length === 0) return null;

  const atLeast = (s: ProgressStatus) =>
    progressed.filter((e) => rankOf(progressOf(e)!) >= rankOf(s));
  let progress: ProgressStatus | null = null;
  for (const e of progressed) {
    const p = progressOf(e)!;
    progress = progress === null ? p : maxProgress(progress, p);
  }
  // official → agreed → negotiating 순으로 내려 본다
  if (progress === "official" && !officialOk(atLeast("official"), rule)) {
    progress = "agreed";
  }
  if (progress === "agreed" && !promotionOk(atLeast("agreed"), rule)) {
    progress = "negotiating";
  }
  const latest = (list: readonly TransferEvidence[]) =>
    Math.max(-Infinity, ...list.map((e) => e.atMs));
  const isCollapsed =
    collapsed.length > 0 && latest(collapsed) >= latest(progressed);
  const status: TransferStatus = isCollapsed
    ? "collapsed"
    : (progress ?? "rumor");

  const basis = isCollapsed ? collapsed : progressed;
  const tos = new Set(basis.flatMap((e) => (e.claim.to ? [e.claim.to] : [])));
  const froms = new Set(
    basis.flatMap((e) => (e.claim.from ? [e.claim.from] : [])),
  );
  let to = tos.size === 1 ? [...tos][0] : undefined;
  let from = froms.size === 1 ? [...froms][0] : undefined;
  if (to !== undefined && to === from) {
    to = undefined;
    from = undefined;
  }
  return {
    player,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    status,
    tier: cardTier,
  };
}

/** 소스 id들 → 설정에 있는 소스 중 가장 높은 Tier(숫자가 작은 쪽) — 없으면 null */
export function bestTierOf(
  sourceIds: readonly string[],
  sourceById: ReadonlyMap<string, Pick<Source, "tier">>,
): Tier | null {
  let best: Tier | null = null;
  for (const id of sourceIds) {
    const tier = sourceById.get(id)?.tier;
    if (tier !== undefined && (best === null || tier < best)) best = tier;
  }
  return best;
}

/** 클러스터 이적 추출 입력 1건(구성 묶음 1개) */
export interface TransferMemberInput extends TransferTitleInput {
  /** 이 URL을 낸 소스 id(묶음 소스 전부) */
  sources: readonly string[];
  /** 발행 시각(UTC ISO) */
  publishedAt: string;
}

/** 클러스터 이적 추출 결과 */
export interface ClusterTransferResult {
  transfer: CardTransfer | null;
  /** 구성 묶음마다 주장 또는 건너뛴 이유(입력 순서 — 검수·테스트용) */
  members: TransferClaimResult[];
}

/** 클러스터(카테고리 '이적')의 구성 묶음들 → 카드 transfer(머리 주석 ⑤~⑧) */
export function clusterTransfer(
  members: readonly TransferMemberInput[],
  ctx: {
    tags: TagIndex;
    sourceById: ReadonlyMap<string, Pick<Source, "tier" | "name">>;
  },
): ClusterTransferResult {
  const results = members.map((m) => transferClaimOf(m, ctx.tags));
  const cardTier = bestTierOf(
    [...new Set(members.flatMap((m) => m.sources))],
    ctx.sourceById,
  );
  if (cardTier === null) return { transfer: null, members: results };
  const evidence: TransferEvidence[] = [];
  members.forEach((m, i) => {
    const claim = results[i]?.claim;
    if (!claim) return;
    const tier = bestTierOf(m.sources, ctx.sourceById);
    if (tier === null) return;
    const publishers = [
      ...new Set(
        m.sources.flatMap((id) => {
          const s = ctx.sourceById.get(id);
          return s ? [publisherNameOf(s)] : [];
        }),
      ),
    ];
    evidence.push({ claim, publishers, tier, atMs: Date.parse(m.publishedAt) });
  });
  return {
    transfer: combineTransferClaims(evidence, cardTier),
    members: results,
  };
}
