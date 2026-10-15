/**
 * 제목 유사도 클러스터링 — 같은 사건을 다룬 **서로 다른 URL**을 한 클러스터로 묶는다 (PRD FR-05, plan M1-13) — 순수 함수.
 *
 * 같은 URL(정규화 해시)은 앞 단계(dedup.ts, M1-12)가 이미 묶었다. 여기서는 그 묶음들의 **대표 제목**만 비교한다
 * (기사 텍스트·요약문은 쓰지 않는다 — 제목은 카드에 그대로 게시하는 원문이다, D23·D39). 뉴스 파이프라인 쪽 규칙(이전 카드·
 * 오늘 카드·매체 수)은 news-cluster.ts가 이 모듈 위에서 한다.
 *
 * ── 원칙: 잘못 합치기가 못 합치기보다 나쁘다 ──────────────────────────────────
 *   서로 다른 소식을 한 카드로 합치면 소식 하나가 화면에서 사라진다(출처 스택 안으로 숨는다). 같은 소식이 두 카드로 남는
 *   것보다 나쁘다. 그래서 임계값을 보수적으로 두고, 연결은 **완전 연결(complete-link)** 계열로 한다 — 두 클러스터를 합칠 때
 *   교차 쌍 **모두**가 하한(× linkRatio) 이상이어야 한다(A~B, B~C라서 A·C가 딸려 들어가는 사슬 효과 없음).
 *
 * ── 언어 (D30) ─────────────────────────────────────────────────────────────
 *   한국어(`ko`)와 외국어는 **비교하지 않는다** — 같은 사건의 국내·해외 카드는 따로 두고 빌드 때 '연결 줄'로 잇는다(M1-31).
 *   외국어끼리(en·it·es)는 같은 라틴 문자 묶음에서 비교하되 언어가 다르면 더 높은 하한(`latinCross`)을 쓴다 — 다른 언어
 *   제목은 고유명사·동계어(ridiculous·ridículo)만 겹친다.
 *
 * ── 특징(feature) ─────────────────────────────────────────────────────────
 *   공통: NFKC, 대괄호 머리표(`[PL REVIEW]`·`[오피셜]`)는 지운다(형식 표시라 다른 기사끼리 겹친다).
 *   스코어(`1-1`·`2-4`·`4-2로`)는 `score:<작은 수>-<큰 수>` 하나로(매체마다 주어 팀 순서가 다르다).
 *   라틴 단어: 소문자·발음 기호 제거(Mbappé = Mbappe) → 불용어(en·es·it 기능어 + 형식어·대회 이름·경기 일반어) 제거 →
 *     약칭 통일(utd→united, manchester→man, spurs→tottenham, barça→barcelona) → 복수 s 제거 → 앞 6글자(가벼운 어간).
 *     한 글자 단어·두 자리 이하 숫자는 버린다. 대문자로 시작하는 단어가 이어진 고유명사 구(Diego Simeone·Real Madrid)는
 *     단어마다 1/√k로 가중해 구 하나가 특징 하나만큼만 센다.
 *   한글: 음절 2-gram(조사·표기 차이에 강하다 — '부앙가'·'부앙가에게', '홀란드'·'홀란', '무리뉴'·'모리뉴'). 한 음절 덩어리와
 *     한자(韓·英·西)는 버린다.
 *
 * ── 유사도 ────────────────────────────────────────────────────────────────
 *   같은 문자 묶음(한국어 / 라틴) 안 문서 빈도로 IDF를 매기고(이번 입력만 — 결정적), IDF 가중 코사인. 자주 나오는 말
 *   (man·united·madrid·감독·선수)은 가볍고 이름·드문 말은 무겁다. 연결 조건:
 *     ① 유사도 ≥ 하한 — 하한은 시각 차 gapFree(8시간)까지 그대로, gapFull(24시간)까지 gapPenalty만큼 선형으로 오른다
 *        (하루쯤 벌어진 같은 인물 기사는 후속 소식·다른 해설인 경우가 많다). 시각 차가 maxGap(48시간)을 넘으면 비교 안 함.
 *     ② 공유 특징 수 ≥ 라틴 2 / 한국어 3(3음절 이름 하나가 2-gram 2개다).
 *     ③ 같은 매체 두 기사는 시각 차 12시간 안에서만(같은 매체가 같은 소식을 다시 쓰는 것은 속보 갱신·경기 기사+영상처럼
 *        몇 시간 안이다).
 *     ④ 묶음·해설 기사는 아무것과도 합치지 않는다(`isRoundupTitle` — Romano 🚨 묶음·gossip·briefing·Q&A, 의문사로
 *        시작하는 해설 제목). 여러 소식·여러 각도를 담아 서로 다른 기사들과 두루 겹친다.
 *
 * ── 결정성 ────────────────────────────────────────────────────────────────
 *   같은 입력(순서 포함)이면 항상 같은 결과다. 후보 쌍은 유사도 내림차순(같으면 앞 번호 먼저)으로 본다.
 *   클러스터 구성원 순서는 입력 순서, 클러스터 순서는 첫 구성원의 입력 순서다.
 *
 * 하한 값은 fixtures/rss(M0-33 손 판정 12묶음)와 실제 피드 수집 2구간(손 판정 — 저장소 표본은 fixtures/cluster, The Athletic
 * 제외)으로 정했다 — 근거·수치는 plan M1-13 완료 메모. 바꿀 때는 tests/cluster.test.ts의 회귀 수치(오탐·재현 쌍)를 함께 본다.
 */

// ─── 정책 ────────────────────────────────────────────────────────────────

export interface ClusterPolicy {
  /** 라틴 문자 언어, 같은 언어 쌍의 IDF 가중 코사인 하한 */
  latinSame: number;
  /** 라틴 문자 언어, 서로 다른 언어 쌍(en↔es 등)의 하한 */
  latinCross: number;
  /** 한국어 쌍의 하한 */
  ko: number;
  /**
   * 완전 연결 비율 — 두 클러스터를 합칠 때 교차 쌍 모두가 `그 쌍의 하한 × linkRatio` 이상이어야 한다
   * (1이면 순수 완전 연결, 낮출수록 3건 이상 클러스터가 잘 생긴다).
   */
  linkRatio: number;
  /** 공유 특징 수 하한 — 라틴(단어) */
  minSharedLatin: number;
  /** 공유 특징 수 하한 — 한국어(음절 2-gram + 스코어·라틴 단어) */
  minSharedKo: number;
  /** 쌍의 발행 시각 차 상한(ms) — 넘으면 비교하지 않는다 */
  maxGapMs: number;
  /** 이 시각 차(ms)까지는 하한 그대로 */
  gapFreeMs: number;
  /** 하한 가산이 다 차는 시각 차(ms) */
  gapFullMs: number;
  /** 시각 차가 gapFree → gapFull로 갈수록 하한에 더하는 값(선형, 그 뒤는 그대로) */
  gapPenalty: number;
  /** 같은 매체 두 기사의 시각 차 상한(ms) */
  samePublisherMaxGapMs: number;
}

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_CLUSTER_POLICY: Readonly<ClusterPolicy> = Object.freeze({
  latinSame: 0.28,
  latinCross: 0.45,
  ko: 0.3,
  linkRatio: 0.6,
  minSharedLatin: 2,
  minSharedKo: 3,
  maxGapMs: 48 * HOUR_MS,
  gapFreeMs: 8 * HOUR_MS,
  gapFullMs: 24 * HOUR_MS,
  gapPenalty: 0.1,
  samePublisherMaxGapMs: 12 * HOUR_MS,
});

// ─── 특징 추출 ─────────────────────────────────────────────────────────────

/** 라틴 단어 어간 길이 — 앞 6글자(suspended·suspension → suspen, comeback → comeba) */
export const LATIN_STEM_LENGTH = 6;

/** 문자 묶음 — 한국어와 외국어는 서로 비교하지 않는다(D30) */
export type ClusterScript = "ko" | "latin";

export function scriptOf(lang: string): ClusterScript {
  return lang.toLowerCase().startsWith("ko") ? "ko" : "latin";
}

const words = (lines: readonly string[]): ReadonlySet<string> =>
  new Set(lines.join(" ").split(/\s+/));

/**
 * 라틴 불용어(발음 기호를 뗀 소문자) — en·es·it 기능어, 기사 형식어, 경기 일반어, 대회 이름.
 * 뒤의 셋은 서로 다른 소식이 이 말만 공유하는 일이 잦아서 넣었다('Premier League manager'·'World Cup play-off'·
 * 'post-match interview').
 */
const LATIN_STOPWORDS = words([
  // en
  "a an the and or but nor of to in on at for with by from as is are was were be been being am",
  "has have had having it its this that these those he she they his her their them him we our us",
  "you your i me my not no yes after before over under into about against up down out off than",
  "then so if what why how who whom whose when where which will would can could should may might",
  "must do does did doing done just more most less new vs v says say said tells told set get gets",
  "got all any some now still again very too also here there amid ahead during while despite",
  "per via each every both such only own same other another back first last next one two three",
  "like make makes made take takes took see sees seen go goes going gone way ever never",
  "don doesn didn isn aren wasn weren won t s ll re ve d m",
  // 기사 형식어
  "live video watch highlights highlight gossip quiz quizzes podcast briefing analysis ratings",
  "rating review preview reaction report column opinion explained update updates latest news",
  "football soccer daily weekly listen read q jr",
  // 경기 일반어
  "match matches game games post pre season seasons interview interviews training session sessions",
  // 대회 이름
  "league leagues premier champions ucl cup world liga serie ligue bundesliga europa conference nations uefa",
  // es
  "el la los las lo le les un una unos unas y e o u de del al en por para con sin sobre que se su",
  "sus es son fue ya no si mas como pero este esta estos estas ese esa esos esas ante tras entre",
  "hasta desde hacia contra segun cuando donde quien cual muy tambien asi otro otra otros futbol",
  // it
  "il gli i di da su tra fra ed ai agli alle allo alla del dello della dei degli delle dal dallo",
  "dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle che non",
  "ma come anche piu suo sua suoi sue verso dopo prima ecco calcio",
]);

/** 한국어 제목 안 라틴 단어 중 형식·직함 약어(UCL REVIEW·FC·MF·DF·GK·SNS 등) */
const KO_LATIN_STOPWORDS = words([
  "review preview live official fc vs mf df fw gk cb lb rb cm am dm st cf pk sns fa",
  "line up lineup b11 x",
]);

/**
 * 약칭·별칭 → 대표 표기(발음 기호를 뗀 소문자). 클럽의 흔한 줄임말만 둔다 — 이름 사전(names.ko.json)은 한글 표기용이다.
 * 'manchester'를 'man'으로 모아 Man Utd·Manchester United·Man United를 같게 본다.
 */
const LATIN_ALIASES: ReadonlyMap<string, string> = new Map([
  ["utd", "united"],
  ["manchester", "man"],
  ["spurs", "tottenham"],
  ["barca", "barcelona"],
  ["barsa", "barcelona"],
  ["juve", "juventus"],
]);

/** 대괄호 머리표 — `[PL REVIEW]`·`[오피셜]`·`[케리뷰]`·`【단독】` */
const BRACKET_TAG = /\[[^\]]*\]|【[^】]*】/gu;

/**
 * 스코어 — 1~2자리 수 - 1~2자리 수. 앞뒤가 숫자·라틴 글자·소수점이면 스코어가 아니다(`2026-27`·`U-21`·`10-man`·`8.4`).
 * 한글이 붙는 것은 허용(`2-4로`·`1-1 무`).
 */
const SCORE =
  /(?<![\p{N}\p{Script=Latin}.])(\d{1,2})\s?[-–]\s?(\d{1,2})(?![\p{N}\p{Script=Latin}])/gu;

/** 글자·숫자 덩어리(아포스트로피·하이픈·구두점에서 끊는다) */
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/** 한 덩어리를 문자 체계별로 다시 끊는다 — 한글 / 라틴·숫자 / 그 밖(한자 등 — 특징 없음) */
const SCRIPT_RUN =
  /(\p{Script=Hangul}+)|([\p{Script=Latin}\p{N}\p{M}]+)|[^\p{Script=Hangul}\p{Script=Latin}\p{N}\p{M}]+/gu;

/**
 * 의문사로 시작하는 제목 — 해설·기획 기사('Will this be Simeone's last season?'·'What do fans think…'·'How Argentina paid
 * tribute…'). 같은 인물·구단을 다룬 서로 다른 해설끼리 비슷해 보인다. 경기 기사 끝의 질문('Arsenal 2 Leeds 1: … How did
 * they do it?')은 해당하지 않는다(맨 앞만 본다).
 */
const FEATURE_LEAD =
  /^[\s\p{P}\p{S}]*(?:what|why|how|who|whom|which|when|where|will|would|should|could|can|is|are|was|were|do|does|did|has|have|qué|por qué|cómo|quién|cuál|cuánto|perché|come|cosa|chi|quale|quanto)(?![\p{L}\p{N}])/iu;

function stripDiacritics(word: string): string {
  return word.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** 라틴 단어 1개(소문자) → 특징(버리면 null) */
function latinFeature(
  lower: string,
  stopwords: ReadonlySet<string>,
): string | null {
  let word = stripDiacritics(lower);
  if (/^\d+$/.test(word)) return word.length >= 3 ? word : null;
  if (word.length < 2 || stopwords.has(word)) return null;
  word = LATIN_ALIASES.get(word) ?? word;
  if (word.length >= 5 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }
  return word.slice(0, LATIN_STEM_LENGTH);
}

/** 한글 덩어리 → 음절 2-gram(한 음절이면 없음) */
function hangulBigrams(run: string): string[] {
  const syllables = [...run];
  const grams: string[] = [];
  for (let i = 0; i + 1 < syllables.length; i += 1) {
    grams.push(`${syllables[i]}${syllables[i + 1]}`);
  }
  return grams;
}

/** 라틴 단어 토큰 — 특징("" = 버림)과 고유명사 구 판정용 표시 */
interface LatinToken {
  feature: string;
  /** 대문자로 시작하고 특징이 남는 단어 */
  capitalized: boolean;
  /** 앞 토큰과 공백만 사이에 두고 붙어 있는가 */
  joined: boolean;
}

/**
 * 제목 → 특징별 국소 가중치(1 또는 고유명사 구의 1/√k). 같은 특징이 여러 번 나오면 큰 값.
 * `lang`은 소스 언어 — 한국어 제목 안의 라틴 단어(PSG·LAFC)도 특징이 된다(한국어 제목은 고유명사 구 판정을 하지 않는다).
 */
export function titleFeatureWeights(
  title: string,
  lang: string,
): Map<string, number> {
  const script = scriptOf(lang);
  const weights = new Map<string, number>();
  const put = (feature: string, weight: number) => {
    weights.set(feature, Math.max(weights.get(feature) ?? 0, weight));
  };
  let text = title.normalize("NFKC").replace(BRACKET_TAG, " ");
  text = text.replace(SCORE, (_m, a: string, b: string) => {
    const [x, y] = [Number(a), Number(b)].sort((p, q) => p - q);
    put(`score:${x}-${y}`, 1);
    return " | ";
  });
  const stopwords = script === "ko" ? KO_LATIN_STOPWORDS : LATIN_STOPWORDS;
  const latin: LatinToken[] = [];
  const BREAK: LatinToken = { feature: "", capitalized: false, joined: false };
  let prevEnd = -1;
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    const joined =
      prevEnd >= 0 && /^\s+$/u.test(text.slice(prevEnd, match.index));
    prevEnd = match.index + word.length;
    let first = true;
    for (const run of word.matchAll(SCRIPT_RUN)) {
      const [, hangul, latinRun] = run;
      if (latinRun !== undefined) {
        const feature = latinFeature(latinRun.toLowerCase(), stopwords);
        latin.push({
          feature: feature ?? "",
          capitalized: feature !== null && /^\p{Lu}/u.test(latinRun),
          joined: first && joined,
        });
      } else {
        // 한글·한자가 끼면 고유명사 구가 끊긴다
        if (hangul !== undefined) {
          for (const gram of hangulBigrams(hangul)) put(gram, 1);
        }
        latin.push(BREAK);
      }
      first = false;
    }
  }
  // 고유명사 구: 대문자 시작 단어가 공백만 사이에 두고 k개 이어지면 각 1/√k (한국어 제목은 모두 1)
  let i = 0;
  while (i < latin.length) {
    let j = i + 1;
    if (script === "latin" && latin[i]?.capitalized) {
      while (j < latin.length && latin[j]?.capitalized && latin[j]?.joined) {
        j += 1;
      }
    }
    const weight = 1 / Math.sqrt(j - i);
    for (let k = i; k < j; k += 1) {
      const feature = latin[k]?.feature;
      if (feature) put(feature, weight);
    }
    i = j;
  }
  return weights;
}

/** 제목 → 특징 목록(정렬) — 로그·테스트용 */
export function titleFeatures(title: string, lang: string): string[] {
  return [...titleFeatureWeights(title, lang).keys()].sort();
}

/**
 * 묶음·해설 기사인가 — 다른 기사와 합치지 않는다(혼자 클러스터). 여러 소식·여러 각도를 담아 서로 다른 기사들과 두루
 * 겹치고, 합치면 한 소식 카드 밑에 다른 소식이 숨는다.
 *   라틴: '& more'·'and more'(Romano 🚨 묶음), gossip(BBC)·briefing·Q&A·quiz·podcast(연재), 쉼표 3개 이상, 의문사로 시작.
 *   한국어: 묶음 표시가 일정하지 않아 판정하지 않는다.
 */
export function isRoundupTitle(title: string, lang: string): boolean {
  if (scriptOf(lang) === "ko") return false;
  const text = title.normalize("NFKC");
  if (/(?:&|\band)\s+more\b/iu.test(text)) return true;
  if (/\b(?:gossip|briefing|q&a|quiz|quizzes|podcast)\b/iu.test(text)) {
    return true;
  }
  if (FEATURE_LEAD.test(text)) return true;
  return (text.match(/,/gu) ?? []).length >= 3;
}

// ─── 유사도 ───────────────────────────────────────────────────────────────

/** 클러스터링 입력 1건 */
export interface ClusterDoc {
  title: string;
  lang: string;
  /** 발행 시각(UTC ISO) — 시각 차 판정 */
  publishedAt: string;
  /** 매체명(선택) — 같은 매체 두 기사는 시각 차 `samePublisherMaxGapMs` 안에서만 비교한다 */
  publisher?: string | null;
  /**
   * 고정 묶음 표시(선택) — 값이 서로 다른 두 문서는 같은 클러스터가 될 수 없다(오늘 발행 파일의 서로 다른 카드).
   * null·undefined는 제약 없음.
   */
  anchor?: string | null;
}

interface PreparedDoc {
  script: ClusterScript;
  lang: string;
  at: number;
  publisher: string | null;
  anchor: string | null;
  /** 묶음·해설 기사 — 비교하지 않는다 */
  solo: boolean;
  /** 특징 → 국소 가중치 × idf */
  weights: Map<string, number>;
  norm: number;
}

function prepare(docs: readonly ClusterDoc[]): PreparedDoc[] {
  const base = docs.map((doc) => ({
    doc,
    script: scriptOf(doc.lang),
    local: titleFeatureWeights(doc.title, doc.lang),
  }));
  // 문자 묶음별 문서 빈도 → sklearn 평활 idf = ln((1 + N) / (1 + df)) + 1
  const df = {
    ko: new Map<string, number>(),
    latin: new Map<string, number>(),
  };
  const count = { ko: 0, latin: 0 };
  for (const { script, local } of base) {
    count[script] += 1;
    for (const f of local.keys())
      df[script].set(f, (df[script].get(f) ?? 0) + 1);
  }
  return base.map(({ doc, script, local }) => {
    const weights = new Map<string, number>();
    let sq = 0;
    for (const [f, w0] of local) {
      const idf =
        Math.log((1 + count[script]) / (1 + (df[script].get(f) ?? 0))) + 1;
      const w = w0 * idf;
      weights.set(f, w);
      sq += w * w;
    }
    return {
      script,
      lang: doc.lang.toLowerCase(),
      at: Date.parse(doc.publishedAt),
      publisher: doc.publisher ?? null,
      anchor: doc.anchor ?? null,
      solo: isRoundupTitle(doc.title, doc.lang),
      weights,
      norm: Math.sqrt(sq),
    };
  });
}

/** 쌍 하나의 비교 결과 */
export interface PairScore {
  /** IDF 가중 코사인(0~1) */
  similarity: number;
  /** 공유 특징(정렬) */
  shared: string[];
}

function scorePair(a: PreparedDoc, b: PreparedDoc): PairScore {
  const shared: string[] = [];
  let dot = 0;
  for (const [f, wa] of a.weights) {
    const wb = b.weights.get(f);
    if (wb === undefined) continue;
    shared.push(f);
    dot += wa * wb;
  }
  shared.sort();
  const similarity = a.norm > 0 && b.norm > 0 ? dot / (a.norm * b.norm) : 0;
  return { similarity, shared };
}

/**
 * 쌍의 하한 — 비교하지 않는 쌍(다른 문자 묶음·묶음 기사·시각 차 상한 초과·12시간 넘게 벌어진 같은 매체)은 null.
 * 하한 = 언어 하한 + gapPenalty × clamp((시각 차 − gapFree) / (gapFull − gapFree), 0, 1).
 */
function pairThreshold(
  a: PreparedDoc,
  b: PreparedDoc,
  policy: ClusterPolicy,
): number | null {
  if (a.script !== b.script || a.solo || b.solo) return null;
  const gap = Math.abs(a.at - b.at);
  if (!(gap <= policy.maxGapMs)) return null;
  if (
    a.publisher !== null &&
    a.publisher === b.publisher &&
    gap > policy.samePublisherMaxGapMs
  ) {
    return null;
  }
  const base =
    a.script === "ko"
      ? policy.ko
      : a.lang === b.lang
        ? policy.latinSame
        : policy.latinCross;
  const span = policy.gapFullMs - policy.gapFreeMs;
  const ratio =
    span > 0 ? Math.min(1, Math.max(0, (gap - policy.gapFreeMs) / span)) : 0;
  return base + policy.gapPenalty * ratio;
}

/** 쌍이 연결 후보인가 — 하한·공유 특징 수 */
function linkable(
  a: PreparedDoc,
  score: PairScore,
  threshold: number,
  policy: ClusterPolicy,
): boolean {
  const minShared =
    a.script === "ko" ? policy.minSharedKo : policy.minSharedLatin;
  return score.similarity >= threshold && score.shared.length >= minShared;
}

/** 비교한 쌍 1건 — 튜닝·로그·테스트용(i < j, 입력 번호) */
export interface ScoredPair extends PairScore {
  i: number;
  j: number;
  /** 이 쌍의 하한(시각 차 가산 포함) */
  threshold: number;
  /** 하한·공유 특징 수를 모두 넘는가(연결 후보) */
  linked: boolean;
}

/** 비교할 수 있는 모든 쌍 중 특징을 하나 이상 공유하는 쌍의 점수 */
export function scorePairs(
  docs: readonly ClusterDoc[],
  policy: ClusterPolicy = DEFAULT_CLUSTER_POLICY,
): ScoredPair[] {
  const prepared = prepare(docs);
  const pairs: ScoredPair[] = [];
  prepared.forEach((a, i) => {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const b = prepared[j];
      if (b === undefined) continue;
      const threshold = pairThreshold(a, b, policy);
      if (threshold === null) continue;
      const score = scorePair(a, b);
      if (score.shared.length === 0) continue;
      pairs.push({
        i,
        j,
        ...score,
        threshold,
        linked: linkable(a, score, threshold, policy),
      });
    }
  });
  return pairs;
}

// ─── 클러스터링 ────────────────────────────────────────────────────────────

/**
 * 완전 연결 탐욕 병합 — 연결 후보 쌍을 유사도 내림차순으로 보며, 두 클러스터의 **모든 교차 쌍**이 `쌍 하한 × linkRatio`
 * 이상(비교하지 않는 쌍이 하나라도 있으면 안 됨)이고 서로 다른 고정 묶음(anchor)이 섞이지 않을 때만 합친다.
 * 결과: 클러스터마다 입력 번호(오름차순), 클러스터 순서는 첫 번호 순. 혼자인 문서도 클러스터 1개다.
 */
export function clusterDocs(
  docs: readonly ClusterDoc[],
  policy: ClusterPolicy = DEFAULT_CLUSTER_POLICY,
): number[][] {
  const n = docs.length;
  const prepared = prepare(docs);
  // floorOf[x*n+y] = 교차 쌍 판정 하한(비교하지 않는 쌍은 +∞), simOf = 유사도
  const simOf = new Float64Array(n * n);
  const floorOf = new Float64Array(n * n).fill(Number.POSITIVE_INFINITY);
  const candidates: Array<{ i: number; j: number; s: number }> = [];
  prepared.forEach((a, i) => {
    for (let j = i + 1; j < n; j += 1) {
      const b = prepared[j];
      if (b === undefined) continue;
      const threshold = pairThreshold(a, b, policy);
      if (threshold === null) continue;
      const score = scorePair(a, b);
      simOf[i * n + j] = simOf[j * n + i] = score.similarity;
      floorOf[i * n + j] = floorOf[j * n + i] = threshold * policy.linkRatio;
      if (linkable(a, score, threshold, policy)) {
        candidates.push({ i, j, s: score.similarity });
      }
    }
  });
  candidates.sort((p, q) => q.s - p.s || p.i - q.i || p.j - q.j);

  // 클러스터 = 구성원 번호 목록, owner[k] = k가 속한 클러스터의 키(처음 구성원 번호와 다를 수 있다)
  const owner = Array.from({ length: n }, (_, k) => k);
  const members = new Map<number, number[]>(
    Array.from({ length: n }, (_, k) => [k, [k]] as const),
  );
  const anchorOf = new Map<number, string | null>(
    prepared.map((d, k) => [k, d.anchor] as const),
  );
  const bonded = (x: number, y: number) =>
    (simOf[x * n + y] ?? 0) >= (floorOf[x * n + y] ?? Number.POSITIVE_INFINITY);

  for (const { i, j } of candidates) {
    const ci = owner[i] ?? i;
    const cj = owner[j] ?? j;
    if (ci === cj) continue;
    const ai = anchorOf.get(ci) ?? null;
    const aj = anchorOf.get(cj) ?? null;
    if (ai !== null && aj !== null && ai !== aj) continue;
    const mi = members.get(ci) ?? [];
    const mj = members.get(cj) ?? [];
    if (!mi.every((x) => mj.every((y) => bonded(x, y)))) continue;
    for (const k of mj) owner[k] = ci;
    members.set(ci, [...mi, ...mj]);
    members.delete(cj);
    anchorOf.set(ci, ai ?? aj);
  }

  return [...members.values()]
    .map((list) => [...list].sort((p, q) => p - q))
    .sort((p, q) => (p[0] ?? 0) - (q[0] ?? 0));
}
