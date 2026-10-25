/**
 * 뉴스 카드 분류 — 코드 규칙 v0.1 (PRD FR-21·FR-31, D23·D39, plan M1-17) — 순수 함수. 뉴스 분류에 LLM을 쓰지 않는다.
 *
 * 입력: 같은 사건 클러스터(news-cluster.ts)의 **모든 구성 묶음 제목**(대표 제목만이 아니다 — 최신성 대표 때문에 대표 제목에서
 * '김민재'가 빠진 실측, M1-15 이월) + 묶음 소스 메타(대회) + 메모리 안의 RSS 요약문(`FeedItem.summary`, D39 ① — 카드·data/·로그·LLM에
 * 넣지 않는다. 쓰는 곳은 spoiler 근거와 범위 밖 제외의 '남기는' 근거(news-scope.ts)뿐) + 선별 점수(M1-14, 중요도). 출력은 카드 분류
 * 필드(`CardClassification`)이고 카드 스키마(부록 A)는 바꾸지 않는다.
 *
 * ── 필드별 규칙 ────────────────────────────────────────────────────────────
 *   teams·players  원제목의 사전 표기(tag-names.ts — names.ko.json + 빅클럽 표 + 등록 한국 선수, 카드 slug = 사전 slug). 여러 제목은
 *                  합집합(앞 묶음 먼저, 제목 안 순서). 요약문은 쓰지 않는다(다음 상대·친정팀 이름이 섞여 태그·D42 병합이 틀어진다).
 *                  등록 한국 선수(kr 근거)는 players에 항상 든다.
 *   kr             활성 등록 한국 선수가 제목에 나옴(news-keywords.ts `koreanKeywordPlayers` — 점수화의 한국 선수 배수와 같은 기준,
 *                  FR-60·FR-64). 5대 리그 밖 한국 선수(손흥민 LAFC 등) 기사는 kr이 아니라 국내 매체 카드다.
 *   comp           ① 제목 대회 표현 ② 소스 대회의 UCL ③ 리그: 태그(팀 → team-leagues.ts, 활성 등록 한국 선수 → 소속 리그)가 있으면 그
 *                  리그 — 소스 대회 합집합이 퍼지지 않게 좁힌다(BBC European 4개 리그, M1-12·M1-13 이월). 다른 리그 두 팀의 경기 결과
 *                  (유럽 대항전·친선전 — 대회를 모른다)는 리그를 붙이지 않는다. 태그가 없으면 한 리그만 다루는 소스(BBC Premier League·
 *                  Relevo·Di Marzio)의 그 리그. 대회 순서는 CompId 순.
 *   cat            앞선 것부터(FR-31): 대표팀 → 이적 → (스코어가 없으면) 부상 → 경기 결과 → UCL → 부상 → 감독·구단 → 기타.
 *                  **제목으로만** 정한다 — 정해지지 않으면 기타(FR-21 보수적 기본값, PRD §15 D47 ①). 요약문은 카테고리에 쓰지 않는다
 *                  (다른 경기 결과·이적설을 지나가며 말한다 — dry 실측).
 *                  - 대표팀: 강한 표현(national team·call-up·모레노호·A매치) 또는 클럽 팀 태그가 없는 제목의 약한 근거 — 약한 표현
 *                    (대표팀·World Cup)과 국가 이름이 함께 · 국가 이름 둘 이상('Albania 0-1 Wales') · 결과 표현 없는 근거 하나('Ronaldo
 *                    suspended by Portugal'). '[MLS REVIEW] 대한민국 주장 클래스!'는 결과다.
 *                  - 이적: 이적 표현(news-keywords.ts `TRANSFER_TERMS`). 재계약 표현만 있으면 감독·구단(M0-34 손 판정 — 'Palmer signs
 *                    new Chelsea contract'), 이적 자체를 가리키는 말(`TRANSFER_STRONG_TERMS`)이 함께 있으면 이적. 묶음 제목(🚨)은 이적.
 *                  - 부상: 스코어가 없는 제목은 부상 표현이 결과보다 먼저('Man City lose Rodri to injury for Liverpool clash')
 *                  - 경기 결과: 스코어 패턴(`titleScores` — 숫자 범위 '2-3주'·'4-6 weeks'는 아니다) 또는 승패 표현·리뷰 머리표
 *                    (`RESULT_TERMS`), 주어(팀 태그·등록 한국 선수)가 있으면 주어가 필요한 승패 표현(`RESULT_CONTEXT_TERMS` — 'Bayern sink
 *                    Dortmund'·'리옹에 덜미'). 경기 전 기사 표현(`PREVIEW_TERMS` — '승리 시'·'앞둔'·'can beat'·'프리뷰')이 있으면 승패
 *                    표현·스코어 모두 결과가 아니다 — 약한 표현('ahead of')은 약한 승패 표현(win·draw)만 막는다('Arsenal beat Chelsea ahead
 *                    of UCL clash' = 결과). 추첨 제목('Champions League draw: …'·'third-round draw')의 draw는 무승부가 아니다(UCL 조
 *                    추첨 → UCL, 컵 추첨 → 기타). 주어가 필요한 표현만 있고 재계약 표현이 있으면 결과가 아니다('살라 잡았다…재계약').
 *                    UCL 경기 결과도 여기(PRD §15 D47 ②).
 *                  - UCL: 결과가 아닌 UCL 소식(카드 대회에 UCL — 조 추첨·징계·UEFA 결정)
 *                  - 감독·구단: 감독·구단 표현(`CLUB_TERMS` — 국내 '감독'·'boss') · 재계약 · **감독 발언**(PRD §15 D47 사용자 결정 A, 2026-10-25 —
 *                    names.ko 감독 이름 + 인용 머리·출처 문형: 'Napoli, Allegri: "…"'·'… - Iraola'·"'…' - Glasner confused"·'알레그리
 *                    “…”', news-keywords.ts `managerSpeechOf`). 감독 이름만 있고 문형이 없으면 아니다('Gasperini verso un tridente'·'belief in
 *                    Glasner remains' — 기타). 이 자리가 감독·구단이라 앞선 카테고리(대표팀·이적·부상·결과·UCL)가 먼저다.
 *   spoiler        결과 카테고리 · 스코어 패턴 · 승패 표현(경기 전 기사여도) · 경기 중 사건(골·퇴장 — `MATCH_EVENT_TERMS`) 중
 *                  하나라도(제목 또는 요약문 — 위험 수용 소스는 요약문 없음, D48) → true(FR-21 보수적, FR-37).
 *   matchResult    엔티티 2단계 병합 대상(D42 — entity-merge.ts): '경기 결과'이고 모든 구성 제목이 경기 기사(`isMatchReportText` — 경기
 *                  전·부상·이적·재계약·감독구단·묶음 신호 없음). 경기 전 기사·부상 소식·감독 발언이 결과 카드 밑으로 숨지 않게(M1-17 리뷰).
 *                  병합은 여기에 더해 제목 스코어가 있어야 한다(entity-merge.ts `entityOf` — M1-17 재리뷰).
 *   kr·players     국내 제목의 **동명이인이 확인된** 등록 한국 선수(news-keywords.ts `KOREAN_HOMONYM_PLAYERS` — 김지수·정우영) 이름은 같은
 *                  제목에 축구 근거(팀·대회 태그·축구 표현·선수 기사 문맥어·카테고리 신호·다른 등록 선수)가 있을 때만(배우 김지수·가수
 *                  정우영에게 kr을 주지 않는다). 다른 등록 선수는 이름만으로 kr('괴물' 김민재·'이강인 근황' — M1-17 재리뷰). 점수화의
 *                  한국 선수 배수도 이 결과(`korean`)를 쓴다(collect-run.ts — score.ts `koreanPlayers`).
 *   transfer       카테고리가 '이적'인 카드만 — 이적 추출 규칙 v0.1(transfer-extract.ts, M1-18): 모든 구성 묶음 제목에서 등록 선수 1명·단계
 *                  (negotiating 이상·결렬은 닫힌 문형만 — D54 transfer-patterns.ts, rumor는 키워드, official은 명시 표현·매체 2곳 — D52,
 *                  agreed 이상·결렬 승격 조건)·출발/행선지(문형 슬롯 또는 확실한 방향 규칙)를 뽑고, tier = 클러스터 최고 출처 Tier. 미등록
 *                  선수·애매한 기사는 생략(카테고리만 이적 — PRD F10). 이적 화제는 `TRANSFER_TERMS` + 국내 'T행'(바로 뒤 단서) + 닫힌 문형에 맞는
 *                  제목이고, 국내 제목의 지난 이적을 꾸미는 말('이적 설득한'·'이적 이끈'·'이적 당시')은 화제 표에서 지운다(M1-17 이월 — '이강인
 *                  이적 설득한 코케, 부상 이탈'은 부상).
 *   imp            선별 점수(M1-14 `signals.score`)의 **절대 임계값** 구간 1~4(`IMPORTANCE_THRESHOLDS` — 같은 날 재실행 카드끼리 같은
 *                  기준). 5는 머리기사(D30 — imp 최고 1장) 자리: 그날 파일에 imp 5 카드가 없을 때 이번 실행에 **만들어진** 새 카드 중
 *                  점수 1위 1장이 imp 4 임계값 이상이면 5(`assignImportance` — 하루 1장, 같은 날 재실행이 머리기사를 바꾸지 않는다).
 *
 * `classifyMinimal`(분류 정보가 없을 때 — 소스 대회만, 기본값)은 카드 만들기 단위 테스트·대체 경로용으로 남긴다.
 */
import {
  CompIdSchema,
  type CardTransfer,
  type Category,
  type CompId,
  type FeedItem,
  type Source,
} from "@/lib/schema";

import { scriptOf, type ClusterScript } from "./cluster";
import {
  CLUB_TERMS,
  ENTERTAINMENT_TERMS,
  FOOTBALL_CONTEXT_TERMS,
  FOOTBALL_PLAYER_CONTEXT_TERMS,
  KOREAN_HOMONYM_PLAYERS,
  PLAYER_CONTEXT_TERMS,
  isKoLang,
  INJURY_TERMS,
  managerSpeechOf,
  MATCH_EVENT_TERMS,
  NATIONAL_COUNTRIES,
  NATIONAL_STRONG_TERMS,
  NATIONAL_WEAK_TERMS,
  PREVIEW_TERMS,
  PREVIEW_WEAK_TERMS,
  RENEWAL_TERMS,
  RESULT_CONTEXT_TERMS,
  RESULT_TERMS,
  RESULT_WEAK_TERMS,
  TRANSFER_ROUNDUP_TERMS,
  TRANSFER_STRONG_TERMS,
  TRANSFER_TERMS,
  compileGroup,
  maskDrawLottery,
  matchTitles,
  matchesGroup,
  titleText,
  type CompiledGroup,
  type KeywordIndex,
  type TitleText,
} from "./news-keywords";
import type { NewsScore } from "./score";
import {
  matchTitleTags,
  tagLeagues,
  unionTags,
  type TagIndex,
  type TitleTags,
} from "./tag-names";
import {
  clusterTransfer,
  gossipLead,
  koBoundForTeam,
} from "./transfer-extract";
import { matchStagePatterns } from "./transfer-patterns";

/** 분류 규칙이 없을 때의 카테고리 */
export const DEFAULT_CATEGORY: Category = "other";

/** 분류 정보가 없을 때(classifyMinimal) 중요도 — 1~5의 가운데 */
export const DEFAULT_IMPORTANCE = 3;

/** 카드의 분류 필드(NewsCard 중 코드 규칙이 채우는 부분) */
export interface CardClassification {
  cat: Category;
  comp: CompId[];
  teams: string[];
  players: string[];
  imp: number;
  kr: boolean;
  spoiler: boolean;
  /** 이적 정보(카테고리 '이적' + 확실할 때만 — transfer-extract.ts, M1-18). 없으면 키 자체가 없다 */
  transfer?: CardTransfer;
}

/**
 * 선별 단계가 카드 생성까지 넘기는 신호 — 클러스터 점수(FR-06, M1-14)와 코드 분류(M1-17). 분류가 있으면 카드 분류 필드를 그대로
 * 쓰고, 없으면 최소 규칙(`classifyMinimal`). 카드·data/에는 점수를 저장하지 않는다.
 */
export interface CardSignals {
  score: NewsScore;
  classification?: CardClassification;
}

/** 최소 규칙 분류 — 소스 대회만, 나머지 기본값(분류 정보가 없을 때) */
export function classifyMinimal(
  _item: FeedItem,
  source: Pick<Source, "competitions">,
  _signals: CardSignals | null = null,
): CardClassification {
  void _item;
  void _signals;
  return {
    cat: DEFAULT_CATEGORY,
    comp: [...source.competitions],
    teams: [],
    players: [],
    imp: DEFAULT_IMPORTANCE,
    kr: false,
    spoiler: false,
  };
}

// ─── 스코어 ──────────────────────────────────────────────────────────────

/** 스코어로 볼 최대 득점 — 시즌 표기('25-26 PL 올해의 선수')를 스코어로 읽지 않게 */
export const SCORE_MAX_GOALS = 15;

/**
 * 숫자 범위 뒤에 바로 붙는 단위어 — 스코어가 아니라 범위다('2-3주 결장'·'1-2위 맞대결'·'1-2월'·'4-6 weeks'·'2-3경기'). 한국어는 붙여 쓴
 * 단위만(띄어 쓴 '2-0 일방적'은 스코어), 영어는 띄어 쓴 단위.
 */
const RANGE_UNIT =
  "(?:위|주|월|일|년|개월|경기|명|세|살|시즌|분|차|라운드|회|번|호|점|골|\\s?(?:weeks?|months?|days?|years?|minutes?|mins?|points?|places?|spots?|games?|matches|seasons?)(?![\\p{L}]))";

/**
 * 하이픈 스코어 — 1~2자리 수 - 1~2자리 수. 앞뒤가 숫자·라틴 글자·소수점·쌍점·쉼표·빗금이면 아니다(`2026-27`·`U-21`·`10-man`·
 * `8.4`), 포메이션('4-3-3')의 일부도 아니다, 뒤에 단위어가 붙으면 범위다(`RANGE_UNIT`). 한글 조사가 붙는 것은 허용(`2-4로`·`1-1 무`).
 */
const HYPHEN_SCORE = new RegExp(
  `(?<![\\p{N}\\p{Script=Latin}.:,/])(?<!\\d\\s?[-–]\\s?)(\\d{1,2})\\s?[-–]\\s?(\\d{1,2})(?![\\p{N}\\p{Script=Latin}])(?!\\s?[-–]\\s?\\d)(?!${RANGE_UNIT})`,
  "giu",
);

/** 라틴 제목의 'Arsenal 2 Leeds 1' 형식(대문자 시작 이름 + 수 + 대문자 시작 이름 + 수) */
const NAMED_SCORE =
  /(?:^|[\s:(])\p{Lu}[\p{L}'’.]*(?:\s+\p{Lu}[\p{L}'’.]*){0,3}\s+(\d{1,2})\s+\p{Lu}[\p{L}'’.]*(?:\s+\p{Lu}[\p{L}'’.]*){0,3}\s+(\d{1,2})(?![\p{N}])/gu;

/** 제목의 스코어(`작은 수-큰 수`, 중복 없음 — 주어 팀 순서 무관) */
export function titleScores(title: string, lang: string): string[] {
  const text = title.normalize("NFKC");
  const out: string[] = [];
  const push = (a: string | undefined, b: string | undefined) => {
    const [x, y] = [Number(a), Number(b)].sort((p, q) => p - q) as [
      number,
      number,
    ];
    if (!Number.isInteger(x) || !Number.isInteger(y) || y > SCORE_MAX_GOALS) {
      return;
    }
    const key = `${x}-${y}`;
    if (!out.includes(key)) out.push(key);
  };
  for (const m of text.matchAll(HYPHEN_SCORE)) push(m[1], m[2]);
  if (scriptOf(lang) === "latin") {
    for (const m of text.matchAll(NAMED_SCORE)) push(m[1], m[2]);
  }
  return out;
}

// ─── 문장 신호 ───────────────────────────────────────────────────────────

const TABLES = {
  renewal: compileGroup(RENEWAL_TERMS),
  transfer: compileGroup(TRANSFER_TERMS),
  transferStrong: compileGroup(TRANSFER_STRONG_TERMS),
  nationalStrong: compileGroup(NATIONAL_STRONG_TERMS),
  nationalWeak: compileGroup(NATIONAL_WEAK_TERMS),
  result: compileGroup(RESULT_TERMS),
  /**
   * 강한 승패 표현 — 약한 표현(win·victory·defeat·draw·승리·무승부 …)을 뺀 결과 표(약한 경기 전 표현 'ahead of'·'앞둔'과 함께여도 결과)
   */
  resultStrong: compileGroup({
    ...RESULT_TERMS,
    terms: {
      ...RESULT_TERMS.terms,
      en: (RESULT_TERMS.terms.en ?? []).filter(
        (t) => !RESULT_WEAK_TERMS.en.includes(t),
      ),
      ko: (RESULT_TERMS.terms.ko ?? []).filter(
        (t) => !RESULT_WEAK_TERMS.ko.includes(t),
      ),
    },
  }),
  resultContext: compileGroup(RESULT_CONTEXT_TERMS),
  preview: compileGroup(PREVIEW_TERMS),
  previewWeak: compileGroup(PREVIEW_WEAK_TERMS),
  matchEvent: compileGroup(MATCH_EVENT_TERMS),
  injury: compileGroup(INJURY_TERMS),
  club: compileGroup(CLUB_TERMS),
  roundupTransfer: compileGroup(TRANSFER_ROUNDUP_TERMS),
} as const;

/**
 * 여러 소식 묶음 제목인가(라틴만 — 'A, B, C & more'·gossip·briefing·Q&A·quiz·podcast·쉼표 3개 이상). cluster.ts `isRoundupTitle`과
 * 같지만 의문사로 시작하는 해설 제목('How Doku delivered…')은 넣지 않는다 — 해설은 한 사건을 다룬다(D42 병합 대상).
 */
export function isMultiStoryTitle(title: string, lang: string): boolean {
  if (scriptOf(lang) === "ko") return false;
  const text = title.normalize("NFKC");
  if (/(?:&|\band)\s+more\b/iu.test(text)) return true;
  if (/\b(?:gossip|briefing|q&a|quiz|quizzes|podcast)\b/iu.test(text)) {
    return true;
  }
  return (text.match(/,/gu) ?? []).length >= 3;
}

/** 국가 이름 하나하나를 따로 컴파일(서로 다른 국가 수를 센다) */
const COUNTRY_GROUPS: readonly CompiledGroup[] = (
  ["latin", "en", "es", "it", "ko"] as const
).flatMap((lang) =>
  (NATIONAL_COUNTRIES.terms[lang] ?? []).map((term) =>
    compileGroup({
      terms: { [lang]: [term] },
      exclude: NATIONAL_COUNTRIES.exclude,
    }),
  ),
);

/** 서로 다른 국가 이름 수 — 'Albania 0-1 Wales' = 2 */
function countryCount(text: TitleText): number {
  return COUNTRY_GROUPS.filter((g) => matchesGroup(text, g)).length;
}

/** 문장(제목 또는 요약문) 1건의 분류 신호 */
export interface TextSignals {
  nationalStrong: boolean;
  nationalWeak: boolean;
  countries: number;
  transfer: boolean;
  transferStrong: boolean;
  renewal: boolean;
  /** 승패 표현(물음 제목이면 false — 경기 전 기사 판정은 `isResultLike`) */
  result: boolean;
  /** 강한 승패 표현(영어 약한 표현 win·victory·defeat·draw를 뺀 것 — 물음 제목이면 false) */
  resultStrong: boolean;
  /** 승패 표현 — 경기 전·물음과 무관(spoiler는 보수적으로 이 값도 본다) */
  resultRaw: boolean;
  /** 주어가 있어야 결과인 승패 표현(`RESULT_CONTEXT_TERMS` — 'Bayern sink Dortmund') */
  resultContext: boolean;
  /** 경기 전 기사 표현(`PREVIEW_TERMS`) — 승패 표현·스코어를 결과로 보지 않는다 */
  preview: boolean;
  /** 경기 전 기사의 약한 표현('ahead of' — `PREVIEW_WEAK_TERMS`) — 약한 승패 표현만 결과로 보지 않는다 */
  previewWeak: boolean;
  scores: string[];
  matchEvent: boolean;
  injury: boolean;
  club: boolean;
  /** 여러 소식 묶음 제목(`isMultiStoryTitle`) */
  roundup: boolean;
  /** 묶음 제목의 이적 동사(want·target·eye …) */
  roundupTransfer: boolean;
  /**
   * 감독 발언 문형(news-keywords.ts `managerSpeechOf` — 사전 감독 이름이 필요해 `textSignals`는 채우지 않고 classify.ts `titleFacts`가
   * 제목에만 채운다. 요약문에는 없다 — 요약문은 카테고리 근거가 아니다, D47 ①). 감독·구단 신호(`club`과 같은 자리)
   */
  managerSpeech?: boolean;
}

/**
 * 문장 1건 → 분류 신호(언어별 표 — news-keywords.ts). 라틴 추첨 제목('Champions League draw: Arsenal face Bayern'·'FA Cup third-round
 * draw: …')은 카테고리·병합 근거에서 draw를 지우고 맞춘다(news-keywords.ts `maskDrawLottery` — 무승부가 아니다, PRD §15 D47 ②).
 * spoiler 근거(`resultRaw`)는 지우지 않은 원제목으로 본다 — 추첨 판정이 틀려도 진짜 무승부 결과가 가려지지 않게(보수적, M1-17 3차 리뷰).
 */
export function textSignals(text: string, lang: string): TextSignals {
  const raw = titleText(text, lang);
  const masked = isKoLang(lang) ? text : maskDrawLottery(text);
  const t = masked === text ? raw : titleText(masked, lang);
  const has = (g: CompiledGroup) => matchesGroup(t, g);
  // 물음표로 끝나는 라틴 제목('Do Man City have grounds to win their appeal?')의 승패 표현은 결과가 아니다
  const question = !t.ko && /\?\s*[)"'’”»]*\s*$/u.test(text);
  return {
    nationalStrong: has(TABLES.nationalStrong),
    nationalWeak: has(TABLES.nationalWeak),
    countries: countryCount(t),
    transfer: has(TABLES.transfer),
    transferStrong: has(TABLES.transferStrong),
    renewal: has(TABLES.renewal),
    result: has(TABLES.result) && !question,
    resultStrong: has(TABLES.resultStrong) && !question,
    resultRaw: matchesGroup(raw, TABLES.result),
    resultContext: has(TABLES.resultContext),
    preview: has(TABLES.preview),
    previewWeak: has(TABLES.previewWeak),
    scores: titleScores(text, lang),
    matchEvent: has(TABLES.matchEvent),
    injury: has(TABLES.injury),
    club: has(TABLES.club),
    roundup: isMultiStoryTitle(text, lang),
    roundupTransfer: has(TABLES.roundupTransfer),
  };
}

/**
 * 결과 신호 — 경기 전 기사가 아니고, 스코어 또는 승패 표현(주어가 있으면 주어가 있어야 하는 표현도 — `hasSubject`: 팀 태그·등록 한국
 * 선수). 경기 전 기사('2-1 승리 예상'·'can beat')의 스코어·승패 표현은 결과가 아니다. 약한 경기 전 표현('ahead of')만 있으면 스코어·
 * 강한 승패 표현·주어 있는 승패 표현은 결과('Arsenal beat Chelsea ahead of UCL clash'), 약한 승패 표현(win·draw)만은 아니다.
 */
export function isResultLike(
  s: Pick<TextSignals, "result" | "scores" | "preview"> &
    Partial<
      Pick<TextSignals, "resultContext" | "resultStrong" | "previewWeak">
    >,
  hasSubject = false,
): boolean {
  if (s.preview) return false;
  const context = hasSubject && (s.resultContext ?? false);
  if (s.previewWeak) {
    return (s.resultStrong ?? false) || s.scores.length > 0 || context;
  }
  return s.result || s.scores.length > 0 || context;
}

/** spoiler 신호(보수적) — 결과 신호 · 스코어 · 승패 표현(경기 전 기사여도) · 경기 중 사건 */
export function isSpoilerText(s: TextSignals, hasSubject = false): boolean {
  return (
    isResultLike(s, hasSubject) ||
    s.scores.length > 0 ||
    s.resultRaw ||
    s.matchEvent ||
    (hasSubject && s.resultContext)
  );
}

/**
 * 대표팀 기사인가(문장 1건) — 강한 표현, 또는 클럽 팀 태그가 없을 때 약한 근거(약한 표현과 국가 이름이 함께 · 국가 이름 둘 이상 ·
 * 결과 표현이 없는 약한 근거 하나).
 */
export function isNationalText(s: TextSignals, clubTeams: number): boolean {
  if (s.nationalStrong) return true;
  if (clubTeams > 0) return false;
  if (s.nationalWeak && s.countries > 0) return true;
  if (s.countries >= 2) return true;
  return (s.nationalWeak || s.countries > 0) && !isResultLike(s);
}

/**
 * 문장 신호들 + 카드 대회 → 카테고리(머리 주석 순서). 해당이 없으면 null(호출부가 기타). `subject` = 그 제목에 팀 태그·등록 한국
 * 선수가 있는가(주어가 있어야 하는 승패 표현용).
 */
export function categoryOf(
  signals: ReadonlyArray<{ s: TextSignals; teams: number; subject?: boolean }>,
  comps: readonly CompId[],
): Category | null {
  const any = (pred: (s: TextSignals) => boolean) =>
    signals.some(({ s }) => pred(s));
  if (signals.some(({ s, teams }) => isNationalText(s, teams))) {
    return "national";
  }
  if (
    any((s) => s.transfer && (!s.renewal || s.transferStrong)) ||
    any((s) => s.roundup && (s.transfer || s.renewal || s.roundupTransfer))
  ) {
    return "transfer";
  }
  // 스코어가 없으면 부상이 결과보다 먼저('Man City lose Rodri to injury for Liverpool clash')
  const scored = any((s) => !s.preview && s.scores.length > 0);
  if (!scored && any((s) => s.injury)) return "injury";
  // UCL 경기 결과도 '경기 결과'(PRD §15 D47 ②) — UCL 칩은 결과가 아닌 UCL 소식. 주어가 있어야 하는 승패 표현만 있는 제목은 재계약
  // 표현이 함께면 결과가 아니다('리버풀, 살라 잡았다…재계약' = 감독·구단, M1-17 재리뷰)
  if (
    signals.some(
      ({ s, subject }) =>
        isResultLike(s, subject ?? false) &&
        !(s.renewal && !s.result && s.scores.length === 0),
    )
  ) {
    return "result";
  }
  if (comps.includes("UCL")) return "ucl";
  if (any((s) => s.injury)) return "injury";
  if (any((s) => s.club || s.renewal || (s.managerSpeech ?? false))) {
    return "club";
  }
  return null;
}

/**
 * 엔티티 2단계 병합 대상 제목인가(D42 — M1-17 리뷰: 잘못 합치기 0이 최우선) — 결과 신호가 있고, 경기 전(약한 표현 'ahead of' 포함)·
 * 부상·이적·재계약·감독구단(감독 발언 문형 포함)·여러 소식 묶음 신호가 **없다**(경기 전 기사·부상 소식·감독 발언 기사가 결과 카드 밑으로
 * 숨지 않게). 병합은 여기에 더해 스코어가 있어야 한다(entity-merge.ts `entityOf`).
 */
export function isMatchReportText(
  s: TextSignals,
  hasSubject: boolean,
): boolean {
  return (
    isResultLike(s, hasSubject) &&
    !s.preview &&
    !s.previewWeak &&
    !s.injury &&
    !s.transfer &&
    !s.renewal &&
    !s.club &&
    !s.managerSpeech &&
    !s.roundup
  );
}

// ─── 클러스터 분석 ─────────────────────────────────────────────────────────

/** 분류 맥락 */
export interface ClassifyContext {
  /** 점수화 키워드 색인(news-keywords.ts — kr = 활성 등록 한국 선수) */
  keywords: KeywordIndex;
  /** 팀·선수 태그 색인(tag-names.ts) */
  tags: TagIndex;
  sourceById: ReadonlyMap<string, Source>;
}

/** 분류할 기사 1건(클러스터 구성 묶음의 대표 항목) */
export interface ClassifyItem {
  title: string;
  lang: string;
  /** RSS 요약문(메모리 안 — 분류 입력으로만, D39 ①). 없으면 null */
  summary: string | null;
  /** 이 URL을 낸 소스 id(묶음 소스 전부) */
  sources: readonly string[];
  /** 발행 시각(UTC ISO) */
  publishedAt: string;
}

/** 클러스터 분석 결과(중요도 빼고) — D42 엔티티 병합 입력 포함 */
export interface ClusterAnalysis extends Omit<CardClassification, "imp"> {
  /** 엔티티 병합 대상 경기 기사('경기 결과' + 모든 구성 제목이 `isMatchReportText` — 머리 주석) */
  matchResult: boolean;
  /** 제목 스코어(작은 수-큰 수, 중복 없음) */
  scores: string[];
  script: ClusterScript;
  /** 여러 소식 묶음 제목(`isMultiStoryTitle` — Romano 🚨 묶음·gossip)이 들었는가 — 엔티티 병합에서 뺀다 */
  roundup: boolean;
  /** 제목 팀·활성 등록 한국 선수의 리그(점수화 범위 근거 — score.ts `extraComps`, 카드 대회와 달리 좁히지 않는다) */
  leagues: CompId[];
  /** 제목의 활성 등록 한국 선수(동명이인 확인 뒤 — kr 근거, 점수화 한국 선수 배수 score.ts `koreanPlayers`도 이 값) */
  korean: string[];
  /** 가장 이른 구성 기사 시각(ms) — D42 엔티티 병합 */
  earliestMs: number;
  /**
   * 이적 화제(구성 제목 중 하나라도 — 이적 표 + 국내 'T행', M1-18). 점수화 이적 배수가 카테고리와 같은 근거를 보게 한다(score.ts
   * `transferTopic` — 'T행'은 이적 표에 없다)
   */
  transferTopic?: boolean;
}

const COMP_ORDER: readonly CompId[] = CompIdSchema.options;
const byCompOrder = (a: CompId, b: CompId) =>
  COMP_ORDER.indexOf(a) - COMP_ORDER.indexOf(b);

/** 기사들의 소스 대회 합집합 */
function sourceCompsOf(
  items: ReadonlyArray<Pick<ClassifyItem, "sources">>,
  sourceById: ReadonlyMap<string, Source>,
): CompId[] {
  const out: CompId[] = [];
  for (const item of items) {
    for (const id of item.sources) {
      for (const comp of sourceById.get(id)?.competitions ?? []) {
        if (!out.includes(comp)) out.push(comp);
      }
    }
  }
  return out;
}

/** 카드 대회(머리 주석 comp ①~③) */
export function cardComps(input: {
  titleComps: readonly CompId[];
  sourceComps: readonly CompId[];
  tagLeagues: readonly CompId[];
  /** 다른 리그 두 팀의 경기 결과(대회 모름) */
  crossLeagueMatch: boolean;
}): CompId[] {
  const out = new Set<CompId>(input.titleComps);
  if (input.sourceComps.includes("UCL")) out.add("UCL");
  const sourceLeagues = input.sourceComps.filter((c) => c !== "UCL");
  if (input.tagLeagues.length > 0) {
    if (!input.crossLeagueMatch) for (const c of input.tagLeagues) out.add(c);
  } else if (sourceLeagues.length === 1) {
    out.add(sourceLeagues[0]!);
  }
  return [...out].sort(byCompOrder);
}

const pushNew = <T>(out: T[], values: Iterable<T>) => {
  for (const v of values) if (!out.includes(v)) out.push(v);
};

/** 국내 제목의 축구 기사 근거(동명이인 kr 방지 — 축구 표현·선수 기사 문맥어) */
const KO_FOOTBALL_EVIDENCE = compileGroup({
  terms: {
    ko: [
      ...(FOOTBALL_CONTEXT_TERMS.terms.ko ?? []),
      ...(PLAYER_CONTEXT_TERMS.terms.ko ?? []),
    ],
  },
  koWhole: PLAYER_CONTEXT_TERMS.koWhole,
  koInfix: FOOTBALL_CONTEXT_TERMS.koInfix,
});

/** 연예 표현이 함께 있는 국내 제목의 축구 근거 — 축구 표현·축구에만 쓰는 선수 문맥어(일반어 '출전'·'원정'·'데뷔'는 아니다) */
const KO_FOOTBALL_EVIDENCE_STRONG = compileGroup({
  terms: {
    ko: [
      ...(FOOTBALL_CONTEXT_TERMS.terms.ko ?? []),
      ...(FOOTBALL_PLAYER_CONTEXT_TERMS.terms.ko ?? []),
    ],
  },
  koWhole: FOOTBALL_PLAYER_CONTEXT_TERMS.koWhole,
  koInfix: FOOTBALL_CONTEXT_TERMS.koInfix,
});

const KO_ENTERTAINMENT = compileGroup(ENTERTAINMENT_TERMS);

/** 연예 기사 표시 기호(글자가 아니라 정규화 텍스트에서 지워진다 — 원문에서 본다, news-scope.ts와 같다) */
export const ENTERTAINMENT_MARKS = /[♥❤]/u;

/** 제목 1건의 분석 재료 */
interface TitleFacts {
  tags: TitleTags;
  s: TextSignals;
  /** 이 제목의 활성 등록 한국 선수(동명이인 걸러 낸 뒤) */
  korean: string[];
  /** 주어(팀 태그·등록 한국 선수)가 있는가 */
  subject: boolean;
}

/**
 * 제목 1건 → 분석 재료. 국내 제목의 **동명이인이 확인된** 등록 한국 선수(`KOREAN_HOMONYM_PLAYERS`) 이름은 같은 제목에 축구 근거(팀·
 * 대회·빅클럽 태그·축구 표현·선수 기사 문맥어·카테고리 신호·동명이인이 아닌 등록 선수)가 있을 때만 그 선수로 본다 — 배우 김지수·
 * 가수 정우영에게 kr·선수 태그를 주지 않는다(M1-17 리뷰). 다른 등록 선수는 이름만으로 그 선수다('괴물' 김민재 — M1-17 재리뷰).
 */
function titleFacts(item: ClassifyItem, ctx: ClassifyContext): TitleFacts {
  const tags = matchTitleTags(item.title, item.lang, ctx.tags, {
    sourceComps: sourceCompsOf([item], ctx.sourceById),
  });
  // 국내 제목의 'T행'(팀 이름 + 행 — '김민재, 아스널행 임박')도 이적 화제다(이적 표에는 팀 이름 없이 넣을 수 없다 — M1-18)
  // 이적 높은 단계 닫힌 문형에 맞는 제목('Bukayo Saka completes move to Chelsea' — 이적 표에 'completes move'가 없다)도 이적 화제다(D54)
  // 감독 발언(D47 사용자 결정 A) — 사전 감독 이름이 필요해 여기서 채운다
  const s0: TextSignals = {
    ...textSignals(item.title, item.lang),
    managerSpeech:
      managerSpeechOf(item.title, item.lang, ctx.keywords.managers) !== null,
  };
  const s =
    !s0.transfer &&
    (koBoundForTeam(item.title, item.lang, tags.teams) ||
      (tags.teams.length > 0 &&
        tags.players.some(
          (p) =>
            matchStagePatterns({
              title: item.title,
              lang: item.lang,
              playerSlug: p.slug,
              tags: ctx.tags,
            }).length > 0,
        )))
      ? { ...s0, transfer: true, transferStrong: true }
      : s0;
  const hits = matchTitles([item], ctx.keywords);
  // 이름 바로 앞뒤에 직업 명사('배우 김민재'·'가수 정우영')가 붙은 이름은 그 선수가 아니다(tag-names.ts — M1-17 3차 리뷰)
  const occupied = new Set(tags.occupationPlayers);
  let korean = hits.koreanPlayers.filter((slug) => !occupied.has(slug));
  const homonyms = isKoLang(item.lang)
    ? korean.filter((slug) => KOREAN_HOMONYM_PLAYERS.has(slug))
    : [];
  if (homonyms.length > 0) {
    const tt = titleText(item.title, item.lang);
    // 연예 표현이 함께면 축구에만 쓰는 근거만('김지수, 오디션 프로그램 출전'·'김지수, 연극 무대 데뷔' — 카테고리 신호·일반 문맥어는 아니다)
    const entertainment =
      matchesGroup(tt, KO_ENTERTAINMENT) ||
      ENTERTAINMENT_MARKS.test(item.title);
    const evidence =
      korean.some((slug) => !KOREAN_HOMONYM_PLAYERS.has(slug)) ||
      tags.teams.length > 0 ||
      tags.comps.length > 0 ||
      hits.bigClubs.length > 0 ||
      (entertainment
        ? matchesGroup(tt, KO_FOOTBALL_EVIDENCE_STRONG)
        : matchesGroup(tt, KO_FOOTBALL_EVIDENCE) ||
          s.transfer ||
          s.injury ||
          s.club ||
          (s.managerSpeech ?? false) ||
          s.nationalStrong ||
          s.nationalWeak ||
          isResultLike(s, true) ||
          s.matchEvent);
    if (!evidence) {
      const drop = new Set(homonyms);
      korean = korean.filter((slug) => !drop.has(slug));
      tags.players = tags.players.filter((p) => !drop.has(p.slug));
    }
  }
  return {
    tags,
    s,
    korean,
    subject: tags.teams.length > 0 || korean.length > 0,
  };
}

/** 기사들(클러스터 구성 묶음) → 분석(머리 주석 규칙) */
export function analyzeItems(
  items: readonly ClassifyItem[],
  ctx: ClassifyContext,
): ClusterAnalysis {
  const perTitle = items.map((item) => titleFacts(item, ctx));
  const korean: string[] = [];
  for (const p of perTitle) pushNew(korean, p.korean);
  const teams = unionTags(perTitle.map((p) => p.tags.teams));
  const players = unionTags(perTitle.map((p) => p.tags.players));
  pushNew(players, korean);
  const titleComps: CompId[] = [];
  for (const p of perTitle) pushNew(titleComps, p.tags.comps);
  const roundup = perTitle.some((p) => p.s.roundup);
  const sourceComps = sourceCompsOf(items, ctx.sourceById);

  // 카테고리는 제목으로만 — 요약문은 다른 경기 결과·이적설을 지나가며 말해 엉뚱한 카테고리가 된다(실제 피드 dry 10-17: 제목이 정하지
  // 못한 카드에 요약문을 쓰면 경기 전 기사가 '경기 결과', 감독 발언이 '이적', PRD §15 D47 ①). 정하지 못하면 기타(FR-21 보수적 기본값).
  // UCL 여부는 대회(제목 표현·소스 대회 UCL)로만 본다 — 리그 좁히기는 카테고리가 정해진 뒤.
  const uclComps = cardComps({
    titleComps,
    sourceComps,
    tagLeagues: [],
    crossLeagueMatch: true,
  });
  const cat =
    categoryOf(
      perTitle.map((p) => ({
        s: p.s,
        teams: p.tags.teams.length,
        subject: p.subject,
      })),
      uclComps,
    ) ?? DEFAULT_CATEGORY;

  // 엔티티 병합 대상(D42): '경기 결과' 카드이고 모든 구성 제목이 경기 기사(경기 전·부상·이적·감독구단·묶음 신호 없음)
  const matchResult =
    cat === "result" &&
    perTitle.every((p) => isMatchReportText(p.s, p.subject));
  const scores: string[] = [];
  for (const p of perTitle) if (!p.s.preview) pushNew(scores, p.s.scores);

  const teamLeagues = teams.flatMap((slug) => {
    const league = ctx.tags.teamLeague.get(slug);
    return league ? [league] : [];
  });
  // 두 팀 경기 결과인데 같은 리그 두 팀이 아니다(다른 리그 · 5대 리그 밖 팀 — 유럽 대항전·친선전, 대회를 모른다)
  const crossLeagueMatch =
    cat === "result" &&
    teams.length === 2 &&
    !(teamLeagues.length === 2 && teamLeagues[0] === teamLeagues[1]);
  // 대표팀 기사는 선수 소속 리그를 대회로 붙이지 않는다('[모레노호 1기 결산] 이강인' ≠ 라리가)
  const comp = cardComps({
    titleComps,
    sourceComps,
    tagLeagues: tagLeagues(teams, cat === "national" ? [] : players, ctx.tags),
    crossLeagueMatch,
  });

  // 이적 정보(M1-18 — transfer-extract.ts): 카테고리 '이적' 카드만, 모든 구성 묶음 제목 + 묶음 소스(매체명·Tier). 요약문은 쓰지 않는다
  const transfer =
    cat === "transfer"
      ? clusterTransfer(
          items.map((item, i) => {
            const p = perTitle[i]!;
            const lead = p.s.roundup ? gossipLead(item.title) : null;
            return {
              title: item.title,
              lang: item.lang,
              sourceComps: sourceCompsOf([item], ctx.sourceById),
              players: p.tags.players.map((h) => h.slug),
              transfer: p.s.transfer,
              renewal: p.s.renewal,
              roundup: p.s.roundup,
              ...(lead !== null
                ? { gossipLeadRoundup: isMultiStoryTitle(lead, item.lang) }
                : {}),
              sources: item.sources,
              publishedAt: item.publishedAt,
            };
          }),
          { tags: ctx.tags, sourceById: ctx.sourceById },
        ).transfer
      : null;

  const summaries = items.flatMap((item) =>
    item.summary ? [textSignals(item.summary, item.lang)] : [],
  );
  const spoiler =
    cat === "result" ||
    perTitle.some((p) => isSpoilerText(p.s, p.subject)) ||
    summaries.some((s) => isSpoilerText(s, false));

  return {
    cat,
    comp,
    teams,
    players,
    kr: korean.length > 0,
    spoiler,
    matchResult,
    scores,
    script: scriptOf(items[0]?.lang ?? ""),
    roundup,
    leagues: tagLeagues(teams, players, ctx.tags),
    korean,
    earliestMs: Math.min(...items.map((i) => Date.parse(i.publishedAt))),
    transferTopic: perTitle.some((p) => p.s.transfer),
    ...(transfer ? { transfer } : {}),
  };
}

/** 클러스터 구성 묶음 → 분류 입력(묶음 대표 항목의 제목·언어·요약문·시각 + 묶음 소스) */
export function classifyItemsOf(
  members: ReadonlyArray<{ item: FeedItem; sources: readonly string[] }>,
): ClassifyItem[] {
  return members.map((m) => ({
    title: m.item.title,
    lang: m.item.lang,
    summary: m.item.summary,
    sources: m.sources,
    publishedAt: m.item.publishedAt,
  }));
}

/** 클러스터 → 분석 */
export function analyzeCluster(
  cluster: {
    members: ReadonlyArray<{ item: FeedItem; sources: readonly string[] }>;
  },
  ctx: ClassifyContext,
): ClusterAnalysis {
  return analyzeItems(classifyItemsOf(cluster.members), ctx);
}

// ─── 중요도 ──────────────────────────────────────────────────────────────

/**
 * 중요도 1~4 절대 임계값 — 점수 ≥ [0] → 2, ≥ [1] → 3, ≥ [2] → 4(그 밖 1). 5는 머리기사 규칙(`assignImportance`).
 * 근거(plan M1-17 완료 메모): 선별 45장 점수 분포 — 실제 피드 dry 10-16 01:10 KST(M1-14) 1위 5.3·45위 1.8, dry 10-17 10:13 KST 1위 4.6·
 * 45위 1.2, fixtures/cluster window(22:28 KST 수집) 1위 5.0·45위 1.2. 이 값에서 45장이 대략 imp 4 ≈ 1/5 · 3 ≈ 1/2 · 2 ≈ 1/4 · 1 소수로
 * 나뉜다(점수 구성: BBC Football 단독 신선 기사 3 × Tier 2 1 × 최신성 ≈ 2.7 → 3, 빅클럽·한국 선수·여러 매체가 겹치면 4, 범위 근거 없음·
 * 하루 지난 국내 전체기사 피드 기사 → 1~2). 분위수가 아니라 절대값이라 같은 날 재실행 카드끼리 같은 기준이다(M1-14 이월).
 */
export const IMPORTANCE_THRESHOLDS: readonly [number, number, number] = [
  1.3, 2, 3,
];

/** 점수 → 중요도 1~4 */
export function importanceOf(
  score: number,
  thresholds: readonly [number, number, number] = IMPORTANCE_THRESHOLDS,
): 1 | 2 | 3 | 4 {
  if (score >= thresholds[2]) return 4;
  if (score >= thresholds[1]) return 3;
  if (score >= thresholds[0]) return 2;
  return 1;
}

/** 머리기사 중요도(D30 — imp 최고 1장) */
export const HEADLINE_IMPORTANCE = 5;

/**
 * 이번 실행 새 카드(점수 내림차순)의 중요도. 그날 파일에 imp 5 카드가 없고(`headTaken` false) 1위 점수가 imp 4 임계값 이상이면 1위만
 * 5 — 하루 머리기사 1장, 같은 날 재실행은 머리기사를 바꾸지 않는다(머리 주석).
 */
export function assignImportance(
  scoresDesc: readonly number[],
  options: {
    headTaken: boolean;
    thresholds?: readonly [number, number, number];
  },
): number[] {
  const thresholds = options.thresholds ?? IMPORTANCE_THRESHOLDS;
  return scoresDesc.map((score, i) =>
    i === 0 && !options.headTaken && score >= thresholds[2]
      ? HEADLINE_IMPORTANCE
      : importanceOf(score, thresholds),
  );
}

/** 분석 + 중요도 → 카드 분류 필드 */
export function toClassification(
  analysis: ClusterAnalysis,
  imp: number,
): CardClassification {
  return {
    cat: analysis.cat,
    comp: [...analysis.comp],
    teams: [...analysis.teams],
    players: [...analysis.players],
    imp,
    kr: analysis.kr,
    spoiler: analysis.spoiler,
    ...(analysis.transfer ? { transfer: { ...analysis.transfer } } : {}),
  };
}
