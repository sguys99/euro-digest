/**
 * 이적 높은 단계(negotiating·agreed·official·collapsed) 닫힌 문형 (PRD §15 D54 — 2026-10-17 사용자 결정, plan M1-18) — 순수 함수.
 *
 * 브리핑 검사기(D50)와 같은 원리다: 높은 단계는 **그 절(또는 제목 전체)이 아래 표의 문형에 앞뒤까지 맞을 때만** 준다(앵커드 — 앞뒤에 남는
 * 말 금지, 허용된 꼬리 슬롯만 예외). 문형 밖이면 높은 단계가 없다(transfer-extract.ts가 rumor 근거가 있으면 rumor, 없으면 생략한다).
 * 거부·허용 낱말 목록 방식은 2회차 적대적 재리뷰에서 변형 242개 중 155개를 통과시켰다 — 역행 금지(FR-102)라 잘못 올린 단계는 되돌릴 수 없다.
 *
 * ── 슬롯 ────────────────────────────────────────────────────────────────
 *   {P} = 그 제목의 주어 선수(등록 선수 1명 — transfer-extract.ts가 꾸미는 자리를 뺀 뒤 고른 선수) · {T} = 등록 팀 태그(tag-names.ts — 같은
 *   자리면 긴 표기, 다른 팀 표기 안의 짧은 표기는 버림) · <amt> = 금액('£40m'·'100 million') · <year> = 연도 · ROLE = 선수 앞 역할 묘사
 *   ('Monaco striker {P}')·꼬리 슬롯(언어별 `TAIL_*`).
 *   라틴 제목은 태그 맞춤 텍스트(tag-names.ts `tagMatchText` — 소문자·발음 기호 없음)의 낱말 열로 맞춘다: 쉼표 = 'ǀ', 쌍점·세로줄·
 *   쌍반점·느낌표·띄운 대시 = 'ǂ'(절 경계). 국내 제목은 공백 정리한 원문에서 슬롯 자리를 ⟨P⟩·⟨T0⟩로 바꿔 맞춘다.
 *
 * ── 후보 ────────────────────────────────────────────────────────────────
 *   제목 전체 · 절 경계('ǂ' / 국내 … ... ! ? ; |)로 나눈 절 하나(라틴은 나머지 절이 무해한 꼬리일 때만) · 라틴 도입구 쉼표 뒤(after·
 *   following·despite·having·tras·dopo — 연도·가정 낱말 없이) · (국내만) 절 안 쉼표 마디의 연속 묶음. 하나라도 문형에 맞으면 그 문형의 단계.
 *   문형 절 밖은 닫힌 목록 꼴만 받는다 — 라틴 다른 절은 `LATIN_BENIGN_SEGMENT`, 국내 다른 절과 문형 밖 쉼표 마디는 `KO_BENIGN_PIECES`(등번호·
 *   이적료·금액·계약 기간·N년 계약·메디컬·입단식·발표·오피셜·중립 감탄·here we go — 4회차 차단 1). 목록 밖이 하나라도 있으면 문형을 쓰지 않는다.
 *   머리말 잡음(`HEAD_NOISE_*` — '[오피셜]'·'[단독]'·'[영상]'·'BREAKING:'·'Official:'·'EXCL:'·이모지·'Calciomercato,')·국내 꼬리표('(종합)'·
 *   '[영상]'·'(인터뷰)' — `TAIL_NOISE_KO`)·피드 꼬리(' - BBC Sport')는 문형 앞에서 벗긴다. '[오피셜]'·'Official:'·'Oficial:'·'Ufficiale:'는
 *   official 명시 표현이다(D52 ①) — 머리표가 걸리는 **첫 절**(앞의 목록 꼴 절 — 금액·감탄·무해한 꼬리 — 은 건너뛴다, 단계 낱말이 든 인용
 *   절은 건너뛰지 않는다)의 후보에만(3회차 차단 3·4회차 중요 2).
 *   따로 선 'es oficial'·'è ufficiale' 절도 명시 표현이다.
 *   국내 절 앞 인용은 중립 감탄('‘미쳤다’'·'‘충격’'·'here we go')만 벗기고, 따옴표가 남은 후보(통째로 인용한 절·인용 안 핵심어 —
 *   "'김민재, 아스널 이적 확정'…"·"Bukayo Saka 'joins' Chelsea")는 맞지 않는다.
 *
 * ── 문형을 쓰지 않는 제목 (M1-18 3회차 리뷰 차단 2·중요 6·10) ───────────
 *   물음표('Harry Kane to Arsenal - official?') · 무산·의문 이모지(❌·🚫·🤔·❓·⁉·‼ — `DOUBT_PICTO`) · 부정·보도·유보 낱말(라틴
 *   `LATIN_DOUBT_WORDS` — deny·rubbish·false·report(s)·claims·sources·per·via·according to / 국내 `KO_DOUBT` — 사실무근·오보·부인·아니다·
 *   아직·주장·보도·일축·설·루머·가능성)이 제목 어디에나 있을 때 · 등위로 이어진 두 팀('아스널, 첼시, 김민재 영입 확정'·'Arsenal and
 *   Chelsea agree fee for Saka'). rumor 판정은 따로다(transfer-extract.ts).
 *
 * ── 움직임 근거 (3회차 오케스트레이터 결정 A) ───────────────────────────
 *   합의·협상 꼴(agree-fee·agrees-terms·talks·player-talks·close·accordo-tra·trattativa·acuerdo-entre·negocia — `needsMove`)은 지금 소속을
 *   모르는 선수의 재계약일 수 있다. from 슬롯·금액·DESC의 다른 팀·움직임 낱말(signing·sign·move·transfer·switch·loan·fichaje·llegada·
 *   arrivo·acquisto·trasferimento·prestito — `MOVE_WORD`)이 그 문형 안에 있을 때만 `moved: true`(단계 근거)다. 선수-구단 '사이' 꼴
 *   (acuerdo-entre·accordo-tra·agrees-terms·talks·player-talks — `between`)의 금액은 움직임 근거가 아니다(연봉 재계약일 수 있다 — 4회차 중요 3).
 *
 * ── 명시 표현 (D52 ①) ───────────────────────────────────────────────────
 *   문형마다 `explicit`(구단 발표 꼴 — 'confirm/announce signing of'·'officially joins'·'ufficializza'·'oficializa'·'영입 발표'·머리표)을 둔다.
 *   완료·방향 동사 꼴('joins'·'signs for'·'completes move'·'ficha por'·'입단 확정')은 명시 표현이 아니다 — 단일 출처면 agreed까지,
 *   매체 2곳이면 official(transfer-extract.ts `combineTransferClaims`). 'here we go'는 FR-103대로 agreed 근거다(official 아님).
 *
 * 문형은 fixtures·data/news·실제 피드 dry의 이적 제목에서 나오는 꼴 중심으로 정했다(추측으로 넓히지 않는다 — 재현율보다 오탐 0). 표를
 * 고치면 tests/transfer-extract.test.ts의 문형 표 사례와 리뷰 회귀 사례를 함께 본다. 보강은 M1-43·M4-01(실제 제목을 보고).
 *
 * 슬롯: 금액 `<amt>`는 통화 기호나 단위(m·bn·million·milioni·millones)가 있을 때만(권장 11). 선수 앞 묘사 자유 낱말은 허용 목록
 * (`DESC_FREE_WORDS_EN` — 꾸밈말·국적·태그하지 않은 겹치는 팀 별칭)만(중요 4). 꼬리 슬롯 반복은 원자 묶음 흉내로 역추적하지 않는다(권장 12).
 */
import type { TransferStatus } from "@/lib/schema";

import { isKoLang } from "./news-keywords";
import {
  AMBIGUOUS_TAG_TERMS,
  TAG_TEXT_BREAK,
  koSpaced,
  matchTitleTags,
  tagMatchText,
  type TagHit,
  type TagIndex,
} from "./tag-names";

// ─── 머리말 잡음 ─────────────────────────────────────────────────────────

/** 국내 제목 머리표 — 앞의 것은 official 명시 표현 */
const HEAD_NOISE_KO_EXPLICIT =
  /^\s*[[(【〔]\s?(?:오피셜|공식\s?발표|official)\s?[\])】〕]\s*/iu;
const HEAD_NOISE_KO =
  /^\s*[[(【〔]\s?(?:단독|속보|breaking|excl|exclusive|현장|b11 현장|영상|포토|인터뷰|종합)\s?[\])】〕]\s*/iu;
/** 국내 제목 꼬리표 — '(종합)'·'(종합2보)'·'[영상]'·'(인터뷰)'·'(속보)'·'[포토]'(기사 형식 표시 — M1-18 3회차 리뷰 권장 15) */
const TAIL_NOISE_KO =
  /\s*[[(【〔]\s?(?:종합(?:\s?\d보)?|\d보|영상|포토|인터뷰|속보)\s?[\])】〕]\s*$/u;
/** 라틴 제목 머리 — 앞의 것은 official 명시 표현 */
const HEAD_NOISE_LATIN_EXPLICIT =
  /^\s*(?:official|oficial|ufficiale)\s*(?:[:|!–—]|\s-)\s*/iu;
const HEAD_NOISE_LATIN =
  /^\s*(?:breaking|excl|exclusive|exclusiva|esclusiva|calciomercato|mercato|fichaje|fichajes|transfer news)\s*(?:[:|!–—,]|\s-)\s*/iu;
/** 이모지·장식(머리) */
const HEAD_PICTO = /^[\s\p{Extended_Pictographic}️‍]+/u;
/** 피드 꼬리 — ' - BBC Sport'·' | Relevo' */
const FEED_SUFFIX =
  /\s+[-–|]\s+(?:bbc sport|bbc|the athletic|espn|relevo|sky sports|di marzio)\s*$/iu;

/** 머리말 잡음·피드 꼬리를 벗긴 제목과 명시 표현 머리표 여부(`HEAD_NOISE_*` — 코드 상수) */
export function stripHeadNoise(
  title: string,
  lang: string,
): { text: string; explicitHead: boolean } {
  let text = title.normalize("NFKC");
  let explicitHead = false;
  for (let guard = 0; guard < 6; guard++) {
    const before = text;
    text = text.replace(HEAD_PICTO, "").replace(FEED_SUFFIX, "");
    const explicitRe = isKoLang(lang)
      ? HEAD_NOISE_KO_EXPLICIT
      : HEAD_NOISE_LATIN_EXPLICIT;
    if (explicitRe.test(text)) {
      explicitHead = true;
      text = text.replace(explicitRe, "");
    }
    text = text
      .replace(isKoLang(lang) ? HEAD_NOISE_KO : HEAD_NOISE_LATIN, "")
      .replace(isKoLang(lang) ? TAIL_NOISE_KO : /(?!)/u, "")
      .trim();
    if (text === before) break;
  }
  return { text, explicitHead };
}

// ─── 문형 ────────────────────────────────────────────────────────────────

/** 문형 1개 */
export interface StagePattern {
  /** 문형 id(검수·테스트용) */
  id: string;
  status: Exclude<TransferStatus, "rumor">;
  /** official 명시 표현인가(D52 ①) */
  explicit?: boolean;
  /** 국내 머리표 '[오피셜]'이 있을 때만 쓴다(그때는 명시 표현) */
  needsHead?: boolean;
  /** 'joins'·'signs for' 꼴 — 계약 기간이 함께면 재계약일 수 있다(transfer-extract.ts가 그 제목을 건너뛴다) */
  signsForm?: boolean;
  /**
   * 새 팀 합류 동사 꼴('joins'·'officially joins'·'ficha por') — 계약 길이 꼬리('on a five-year deal')는 이 꼴에서 재계약 단서가 아니다
   * (M1-18 3회차 마무리 — 오케스트레이터 결정 B 조정). 계약 기간('until 2033')은 그대로 단서다(D54)
   */
  joinForm?: boolean;
  /**
   * 움직임 근거가 있어야 단계를 주는 꼴(합의·협상 — 'Acuerdo total entre el Barça y Lamine Yamal'·'Bukayo Saka agrees terms with Arsenal'은
   * 재계약일 수 있다, M1-18 3회차 오케스트레이터 결정 A). 맞은 글에 from 슬롯·금액·움직임 낱말(`MOVE_WORD`)이 없으면 `moved: false`로
   * 돌려준다(transfer-extract.ts가 단계 근거로 쓰지 않는다 — rumor 귀속 조건은 그대로)
   */
  needsMove?: boolean;
  /**
   * 선수와 구단 '사이' 꼴(acuerdo-entre·accordo-tra·agrees-terms·talks·player-talks) — 금액은 움직임 근거가 아니다(연봉 재계약일 수 있다 —
   * 'Accordo totale tra il Milan e Rafael Leão per 7 milioni', M1-18 4회차 중요 3). 'T agree £X fee for P'는 이 꼴이 아니다
   */
  between?: boolean;
  /** 앵커드 정규식 — 이름 붙은 그룹 to·from·from2 = 팀 번호, tail = 꼬리 슬롯 글(꼬리의 팀 = 출발 — `TAIL_TEAM`) */
  re: RegExp;
}

/** 쉼표 자리 낱말(U+01C0) */
const COMMA_TOKEN = "ǀ";
const P = "<p>";
const T = (name: string) => `<t(?<${name}>\\d+)>`;
/** 꼬리 슬롯 안의 팀(이름 없는 자리 — 반복 묶음 안의 이름 붙은 그룹은 반복마다 지워진다, `TAIL_TEAM`으로 꺼낸다) */
const T_ANY = "<t\\d+>";
/** 역할 묘사(선수 바로 앞 — 'Monaco striker {P}') */
const ROLE_EN =
  "(?:(?:young|veteran|left|right|central|attacking|defensive|holding|star) )*(?:striker|forward|winger|midfielder|defender|full back|fullback|centre back|center back|goalkeeper|keeper|star|captain|playmaker|attacker|youngster|wonderkid|talent|prodigy|teenager)";
/**
 * 역할 앞 자유 낱말 허용 목록(M1-18 3회차 리뷰 중요 4 — 아무 낱말이나 받으면 'Tottenham-linked star'·'Arsenal-bound winger'·'next star'가
 * 묘사로 맞았다). 꾸밈말·국적(형용사·나라 이름 — 'England star Saka')과 태그하지 않은 겹치는 팀 별칭(`AMBIGUOUS_TAG_TERMS` 한 낱말 —
 * 'Monaco striker Balogun')만. linked·bound·target·born·based·owned·next·new 같은 말은 넣지 않는다(이 자리 팀은 출발이 아니다).
 */
const DESC_FREE_WORDS_EN = [
  "young",
  "teenage",
  "teen",
  "veteran",
  "experienced",
  "former",
  "talented",
  "exciting",
  "prolific",
  "versatile",
  "promising",
  "english",
  "england",
  "scottish",
  "scotland",
  "welsh",
  "wales",
  "irish",
  "ireland",
  "french",
  "france",
  "german",
  "germany",
  "spanish",
  "spain",
  "italian",
  "italy",
  "portuguese",
  "portugal",
  "dutch",
  "netherlands",
  "belgian",
  "belgium",
  "brazilian",
  "brazil",
  "argentine",
  "argentinian",
  "argentina",
  "uruguayan",
  "uruguay",
  "colombian",
  "colombia",
  "croatian",
  "croatia",
  "serbian",
  "serbia",
  "swiss",
  "switzerland",
  "austrian",
  "austria",
  "danish",
  "denmark",
  "swedish",
  "sweden",
  "norwegian",
  "norway",
  "polish",
  "poland",
  "turkish",
  "turkey",
  "nigerian",
  "nigeria",
  "ghanaian",
  "ghana",
  "senegalese",
  "senegal",
  "ivorian",
  "moroccan",
  "morocco",
  "algerian",
  "algeria",
  "egyptian",
  "egypt",
  "cameroonian",
  "cameroon",
  "japanese",
  "japan",
  "korean",
  "american",
  "usa",
  "mexican",
  "mexico",
  "canadian",
  "canada",
  "ukrainian",
  "ukraine",
  "georgian",
  "georgia",
  "hungarian",
  "hungary",
  "greek",
  "greece",
  "czech",
  "slovenian",
  "slovenia",
  "slovakian",
  "slovakia",
  "ecuadorian",
  "ecuador",
  "chilean",
  "chile",
  "paraguayan",
  "paraguay",
  "malian",
  "mali",
  "guinean",
  "guinea",
  "australian",
  "australia",
  ...AMBIGUOUS_TAG_TERMS.latin.filter((x) => !x.includes(" ")),
];
const DESC_FREE_EN = `(?:${DESC_FREE_WORDS_EN.join("|")})`;
/** 선수 앞 묘사 — '{T} 역할'·'(허용 낱말) 역할'('Monaco striker Balogun' — 겹치는 별칭 Monaco는 태그가 아니다·'England star Saka') */
const DESC_EN = `(?:${T("from2")} )?(?:(?:${DESC_FREE_EN} )?${ROLE_EN} )?`;

/** 영어 꼬리 슬롯(이것들의 조합만 — 쉼표 'ǀ'로 이어져도 된다) */
const TAIL_UNITS_EN = [
  `(?:on loan )?from ${T_ANY}`,
  "on loan",
  "on a free(?: transfer)?",
  "(?:in|for) (?:a )?<amt>(?: (?:deal|fee|move|transfer|switch))?",
  "(?:in|on) (?:a )?(?:\\w+ year |permanent |loan |season long |record )?(?:deal|move|transfer|contract|switch)",
  "permanently",
];
/**
 * 꼬리 슬롯 반복. 한 번 맞은 꼬리 단위는 되돌려 다시 나누지 않는다(앞보기 + 역참조로 원자 묶음을 흉내 — 겹치는 단위('deal'·'deal done')가
 * 반복되면 역추적이 지수로 늘었다, M1-18 3회차 리뷰 권장 12). 단위 순서 = 먼저 시도하는 순서(긴 것 먼저).
 */
const tailOf = (
  units: readonly string[],
  seps: readonly string[] = [COMMA_TOKEN],
) =>
  `(?<tail>(?:(?=(?<tl>(?:${seps.map((x) => ` ${x}`).join("|")})? (?:${units.join("|")})))\\k<tl>)*)`;
/**
 * 꼬리 슬롯 글 안의 팀 — 꼬리의 팀은 출발뿐이다('on loan from T'·'in prestito dal T'·'cedido por el T'). 서로 다른 팀이 둘이면 출발을 정하지
 * 않는다('… from Arsenal on loan from Real Madrid')
 */
const TAIL_TEAM = /<t(\d+)>/gu;
function tailTeamOf(tail: string | undefined): string | undefined {
  const ids = new Set([...(tail ?? "").matchAll(TAIL_TEAM)].map((m) => m[1]!));
  return ids.size === 1 ? [...ids][0] : undefined;
}
const TAIL_EN = tailOf(TAIL_UNITS_EN);
/** 'here we go' 꼬리 — 계약 기간·이적료·메디컬 예약도(계약 기간 생략은 'joins'·'signs for' 꼴에만 — D54 결정) */
const HWG_TAIL_EN = tailOf(
  [
    ...TAIL_UNITS_EN,
    "(?:\\w+ year |long term )?(?:deal|contract)(?: (?:signed|agreed|done|until <year>))?",
    "transfer (?:done|agreed)",
    "<amt> fee(?: agreed)?",
    "medical booked",
  ],
  [COMMA_TOKEN, "ǂ"],
);

/** 영어 문형 */
const EN: readonly StagePattern[] = [
  // official — 명시 표현(구단 발표)
  {
    id: "en.official.confirm-signing",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${T("to")} (?:confirm|confirms|confirmed|announce|announces|announced) (?:the )?(?:<amt> )?signing of ${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.official.officially-joins",
    status: "official",
    explicit: true,
    signsForm: true,
    joinForm: true,
    re: new RegExp(`^${P} officially joins ${T("to")}${TAIL_EN}$`),
  },
  // official — 완료·방향 동사(명시 표현 아님)
  {
    id: "en.official.joins",
    status: "official",
    signsForm: true,
    joinForm: true,
    re: new RegExp(`^${P} joins ${T("to")}${TAIL_EN}$`),
  },
  {
    id: "en.official.signs-for",
    status: "official",
    signsForm: true,
    re: new RegExp(`^${P} (?:signs|has signed) for ${T("to")}${TAIL_EN}$`),
  },
  {
    id: "en.official.team-signs",
    status: "official",
    signsForm: true,
    re: new RegExp(
      `^${T("to")} (?:have |has )?(?:sign|signs|signed) ${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.official.completes-move",
    status: "official",
    re: new RegExp(
      `^${P} (?:completes|complete|completed|seals|sealed) (?:his |a |an )?(?:<amt> )?(?:loan |permanent )?(?:move|transfer|switch) (?:from ${T("from")} )?to ${T("to")}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.official.complete-signing",
    status: "official",
    re: new RegExp(
      `^${T("to")} (?:complete|completes|completed) (?:the )?(?:<amt> )?signing of ${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  // agreed
  {
    id: "en.agreed.agree-fee",
    status: "agreed",
    needsMove: true,
    re: new RegExp(
      `^${T("to")} (?:agree|agrees|agreed) (?:a |an )?(?:<amt> )?(?:fee|terms|deal|loan deal|loan fee|personal terms)(?: with ${T("from")})? for ${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.agreed.agrees-terms",
    status: "agreed",
    needsMove: true,
    between: true,
    re: new RegExp(
      `^${P} (?:agrees|agree|agreed) (?:personal )?terms with ${T("to")}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.agreed.medical",
    status: "agreed",
    re: new RegExp(
      `^${P} (?:set to |to )?(?:undergo|undergoes|undergoing|completes|passes) (?:a )?medical (?:at|with) ${T("to")}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.agreed.here-we-go-head",
    status: "agreed",
    re: new RegExp(`^here we go(?: ǂ)? ${P} to ${T("to")}${HWG_TAIL_EN}$`),
  },
  {
    id: "en.agreed.here-we-go-tail",
    status: "agreed",
    re: new RegExp(`^${P} to ${T("to")}(?: ǂ| ǀ)? here we go${HWG_TAIL_EN}$`),
  },
  // negotiating
  {
    id: "en.negotiating.talks",
    status: "negotiating",
    needsMove: true,
    between: true,
    re: new RegExp(
      `^${T("to")} (?:in|hold|holds|held|open|opens|opened|enter|enters|entered) (?:advanced |fresh |initial |transfer |formal )?talks (?:with ${T("from")} )?(?:over|for) (?:a deal for |signing )?${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.negotiating.bid",
    status: "negotiating",
    re: new RegExp(
      `^${T("to")} (?:make|makes|made|submit|submits|submitted|launch|launches|launched|table|tables|tabled) (?:a |an )?(?:opening |improved |fresh |new |second |first |formal )?(?:<amt> )?(?:bid|offer) (?:for|to sign) (?:free agent )?${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.negotiating.player-talks",
    status: "negotiating",
    needsMove: true,
    between: true,
    re: new RegExp(
      `^${P} (?:in |holds |opens )?(?:advanced |transfer )?talks with ${T("to")}${TAIL_EN}$`,
    ),
  },
  {
    id: "en.negotiating.close",
    status: "negotiating",
    needsMove: true,
    re: new RegExp(
      `^${T("to")} (?:close to|closing in on|nearing|near|edge closer to|edging closer to) (?:signing |a deal for |deal for )?${DESC_EN}${P}${TAIL_EN}$`,
    ),
  },
  // collapsed
  {
    id: "en.collapsed.move-off",
    status: "collapsed",
    re: new RegExp(
      `^${P}(?: s)? (?:<amt> )?(?:move|transfer|switch|loan move|loan|deal) to ${T("to")} (?:collapses|collapsed|falls through|fell through|is off|off|breaks down|broke down|is dead|dead)$`,
    ),
  },
  {
    id: "en.collapsed.team-pulls-out",
    status: "collapsed",
    re: new RegExp(
      `^${T("to")} (?:pull|pulls|pulled) out of (?:the )?(?:deal|move|race|talks) for ${DESC_EN}${P}$`,
    ),
  },
  {
    id: "en.collapsed.team-walks-away",
    status: "collapsed",
    re: new RegExp(
      `^${T("to")} (?:walk|walks|walked) away from (?:the )?(?:deal|move|race|talks) for ${DESC_EN}${P}$`,
    ),
  },
  {
    id: "en.collapsed.team-abandons",
    status: "collapsed",
    re: new RegExp(
      `^${T("to")} (?:abandon|abandons|abandoned) (?:the |their )?(?:deal|move|pursuit|race|bid) for ${DESC_EN}${P}$`,
    ),
  },
];

/** 이탈리아어 꼬리 */
const TAIL_IT = tailOf([
  `in prestito(?: (?:dal|dalla|dall) ${T_ANY})?`,
  "a titolo definitivo",
  "per <amt>(?: (?:milioni|euro))*",
]);
const ART_IT = "(?:il |lo |la |l |i )?";
const DEL_IT = "(?:del|della|dell)";
const IT: readonly StagePattern[] = [
  {
    id: "it.official.ufficializza",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${ART_IT}${T("to")} ufficializza (?:l arrivo di |l acquisto di )?${P}${TAIL_IT}$`,
    ),
  },
  {
    id: "it.official.ufficialmente",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${P} e ufficialmente (?:un giocatore )?${DEL_IT} ${T("to")}${TAIL_IT}$`,
    ),
  },
  {
    id: "it.official.nuovo-giocatore",
    status: "official",
    re: new RegExp(
      `^${P} e un nuovo giocatore ${DEL_IT} ${T("to")}${TAIL_IT}$`,
    ),
  },
  {
    id: "it.agreed.accordo-tra",
    status: "agreed",
    needsMove: true,
    between: true,
    re: new RegExp(
      `^accordo (?:raggiunto|totale|fatto) tra ${ART_IT}${T("to")} e ${P}${TAIL_IT}$`,
    ),
  },
  {
    id: "it.negotiating.trattativa",
    status: "negotiating",
    needsMove: true,
    re: new RegExp(
      `^${ART_IT}${T("to")} ǀ trattativa (?:con ${ART_IT}${T("from")} )?(?:per|con) ${P}${TAIL_IT}$`,
    ),
  },
];

/** 스페인어 꼬리 */
const TAIL_ES = tailOf([
  `(?:cedido por (?:el |la )?|procedente (?:del|de la) )${T_ANY}`,
  "cedido",
  "por <amt>(?: millones)?(?: de euros)?",
  "a coste cero",
  "libre",
]);
const ART_ES = "(?:el |la )?";
const ES: readonly StagePattern[] = [
  {
    id: "es.official.oficializa",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${ART_ES}${T("to")} oficializa (?:el fichaje de |la llegada de )?${P}${TAIL_ES}$`,
    ),
  },
  {
    id: "es.official.anuncia",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${ART_ES}${T("to")} anuncia el fichaje de ${P}${TAIL_ES}$`,
    ),
  },
  {
    id: "es.official.ficha-por",
    status: "official",
    signsForm: true,
    joinForm: true,
    re: new RegExp(`^${P} ficha por ${ART_ES}${T("to")}${TAIL_ES}$`),
  },
  {
    id: "es.official.ficha-a",
    status: "official",
    signsForm: true,
    re: new RegExp(`^${ART_ES}${T("to")} ficha a ${P}${TAIL_ES}$`),
  },
  {
    id: "es.agreed.cierra-fichaje",
    status: "agreed",
    re: new RegExp(`^${ART_ES}${T("to")} cierra el fichaje de ${P}${TAIL_ES}$`),
  },
  {
    id: "es.agreed.acuerdo-entre",
    status: "agreed",
    needsMove: true,
    between: true,
    re: new RegExp(
      `^acuerdo (?:cerrado|total) entre ${ART_ES}${T("to")} y ${P}${TAIL_ES}$`,
    ),
  },
  {
    id: "es.negotiating.negocia",
    status: "negotiating",
    needsMove: true,
    re: new RegExp(
      `^${ART_ES}${T("to")} negocia (?:con ${ART_ES}${T("from")} )?(?:por|el fichaje de) ${P}${TAIL_ES}$`,
    ),
  },
];

/** 국내 문형 조각 */
const KP = "⟨P⟩";
const KT = (name: string) => `⟨T(?<${name}>\\d+)⟩`;
const K_SUBJ = "(?:은|는|이|가)?";
const K_SEP = ",?\\s?";
const K_END = "(?:\\s?[!.])*";
const K_MOVE = "(?:(?:완전|임대)\\s?)?(?:이적|입단)";
const K_SIGN = "(?:(?:완전|임대|전격)\\s?)?영입";
const KO: readonly StagePattern[] = [
  // official — 명시 표현
  {
    id: "ko.official.announce",
    status: "official",
    explicit: true,
    re: new RegExp(
      `^${KT("to")}${K_SUBJ}${K_SEP}(?:(?:공식\\s?)?(?:보도자료|홈페이지|SNS|채널)(?:을|를)?\\s?통해\\s?)?${KP}(?:을|를)?\\s?${K_SIGN}\\s?(?:완료\\s?|확정\\s?)?(?:공식\\s?)?발표${K_END}$`,
    ),
  },
  {
    id: "ko.official.head-signs",
    status: "official",
    explicit: true,
    needsHead: true,
    re: new RegExp(
      `^${KT("to")}${K_SUBJ}${K_SEP}${KP}(?:을|를)?\\s?${K_SIGN}(?:\\s?(?:완료|확정))?${K_END}$`,
    ),
  },
  {
    id: "ko.official.head-moves",
    status: "official",
    explicit: true,
    needsHead: true,
    re: new RegExp(
      `^${KP}${K_SUBJ}${K_SEP}${KT("to")}(?:행|(?:으로|로)?\\s?${K_MOVE})(?:\\s?(?:확정|완료))?${K_END}$`,
    ),
  },
  // official — 완료 동사(명시 표현 아님)
  {
    id: "ko.official.move-confirmed",
    status: "official",
    re: new RegExp(
      `^${KP}${K_SUBJ}${K_SEP}${KT("to")}(?:으로|로|에)?\\s?${K_MOVE}\\s?(?:확정|완료)${K_END}$`,
    ),
  },
  {
    id: "ko.official.sign-confirmed",
    status: "official",
    re: new RegExp(
      `^${KT("to")}${K_SUBJ}${K_SEP}${KP}(?:을|를)?\\s?${K_SIGN}\\s?(?:확정|완료)${K_END}$`,
    ),
  },
  // agreed
  {
    id: "ko.agreed.move-agreed",
    status: "agreed",
    re: new RegExp(
      `^${KP}${K_SUBJ}${K_SEP}${KT("to")}(?:와|과|으로|로)?\\s?${K_MOVE}\\s?(?:개인\\s|구두\\s|원칙적\\s)?합의${K_END}$`,
    ),
  },
  {
    id: "ko.agreed.medical",
    status: "agreed",
    re: new RegExp(
      `^${KP}${K_SUBJ}${K_SEP}${KT("to")}\\s?메디컬(?:\\s?(?:테스트|진행|통과))?${K_END}$`,
    ),
  },
  {
    id: "ko.agreed.here-we-go",
    status: "agreed",
    re: new RegExp(
      `^['‘"“]?(?:here we go|히어 위 고)['’"”]?\\s?${KP}${K_SUBJ}${K_SEP}${KT("to")}(?:행|(?:으로|로)?\\s?${K_MOVE})(?:\\s?(?:확정|합의))?${K_END}$`,
      "i",
    ),
  },
  // negotiating
  {
    id: "ko.negotiating.sign-talks",
    status: "negotiating",
    re: new RegExp(
      `^${KT("to")}${K_SUBJ}${K_SEP}${KP}(?:을|를)?\\s?${K_SIGN}\\s?(?:협상|제안)(?:\\s?중)?${K_END}$`,
    ),
  },
  {
    id: "ko.negotiating.move-talks",
    status: "negotiating",
    re: new RegExp(
      `^${KP}${K_SUBJ}${K_SEP}${KT("to")}(?:으로|로)?\\s?${K_MOVE}\\s?(?:협상|임박)(?:\\s?중)?${K_END}$`,
    ),
  },
  // collapsed
  {
    id: "ko.collapsed.move-off",
    status: "collapsed",
    re: new RegExp(
      `^${KP}(?:의)?${K_SEP}${KT("to")}(?:으로|로)?\\s?${K_MOVE}\\s?(?:무산|결렬|불발)${K_END}$`,
    ),
  },
  {
    id: "ko.collapsed.sign-off",
    status: "collapsed",
    re: new RegExp(
      `^${KT("to")}${K_SUBJ}${K_SEP}${KP}(?:을|를)?\\s?${K_SIGN}\\s?(?:포기|철회|무산|결렬)${K_END}$`,
    ),
  },
];

/** 언어별 문형 표(코드 상수 — tests가 표 전체를 사례로 고정한다) */
export const STAGE_PATTERNS: Readonly<
  Record<"en" | "it" | "es" | "ko", readonly StagePattern[]>
> = { en: EN, it: IT, es: ES, ko: KO };

/** 따로 선 명시 표현 절('…: es oficial'·'…, è ufficiale') — 그 제목의 official 문형을 명시 표현으로 */
const TAIL_OFFICIAL_LATIN =
  /^(?:(?:ya )?es oficial|e ufficiale|it s official|now official|official|oficial|ufficiale)$/u;

// ─── 맞추기 ──────────────────────────────────────────────────────────────

/** 문형에 맞은 결과 1건 */
export interface StageMatch {
  id: string;
  status: Exclude<TransferStatus, "rumor">;
  explicit: boolean;
  signsForm: boolean;
  /** 새 팀 합류 동사 꼴인가(`StagePattern.joinForm`) */
  joinForm: boolean;
  /**
   * 움직임 근거가 있는가 — `needsMove` 꼴은 from 슬롯·금액·움직임 낱말(`MOVE_WORD`)이 있을 때만 true, 그 밖의 꼴은 늘 true(결정 A).
   * false인 맞춤은 이적 화제 근거(classify.ts)일 뿐 단계 근거가 아니다(transfer-extract.ts)
   */
  moved: boolean;
  /** from 슬롯이나 금액이 있는가 — 이동이 분명하다(계약 기간 재계약 단서의 예외, transfer-extract.ts) */
  strongMove: boolean;
  to?: string;
  from?: string;
}

const LATIN_BREAK_TOKEN = TAG_TEXT_BREAK.toLowerCase();
/** 따옴표 자리 낱말(U+01C1) — 인용·반어 따옴표("Bukayo Saka 'joins' Chelsea") 안팎은 문형에 맞지 않는다(M1-18 3회차 리뷰 중요 10) */
const QUOTE_TOKEN = "ǁ";
/** 금액 자리 낱말(U+01C3) */
const AMOUNT_MARK = "ǃ";
/** 연도 낱말 */
const YEAR_TOKEN = /^(?:19|20)\d\d$/u;
/**
 * 금액 — 통화 기호나 단위(m·bn·million·milioni·millones)가 있을 때만(권장 11 — 'Bukayo Saka joins Chelsea for 2'의 2는 금액이 아니다).
 * 라틴 원제목에서 쉼표를 바꾸기 전에 낱말 하나(`AMOUNT_MARK`)로 바꾼다('£1,000,000').
 */
const AMOUNT_RES: readonly RegExp[] = [
  /[£€$]\s?\d+(?:[.,]\d+)*(?:\s?(?:m|bn|k|mn|mln|million|millions|billion|milioni|millones))?(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}£€$])\d+(?:[.,]\d+)*\s?(?:m|bn|mn|mln)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}£€$])\d+(?:[.,]\d+)*\s(?:million|millions|billion|milioni|millones)(?:\s(?:euros?|pounds?|dollars?|di euro|de euros))?(?![\p{L}\p{N}])/giu,
];
/** 움직임 낱말(결정 A — `needsMove` 꼴) */
const MOVE_WORD =
  /(?:^| )(?:signing|sign|signs|move|transfer|switch|loan|fichaje|llegada|traspaso|cesion|cedido|arrivo|acquisto|trasferimento|prestito|이적|영입|입단)(?= |$)/u;

/**
 * 문형을 쓰지 않는 표시(제목 어디에나 — M1-18 3회차 리뷰 중요 10): 무산·의문 이모지('Bukayo Saka joins Chelsea ❌'·'🤔')·'⁉'·'‼'
 */
const DOUBT_PICTO = /[❌🚫🤔❓❔⁉‼✖⛔❎🤡🙄😂🤣]/u;

/**
 * 라틴 제목의 부정·보도·유보 낱말(제목 어디에나 있으면 문형을 쓰지 않는다 — rumor 판정은 따로, M1-18 3회차 리뷰 차단 2·중요 6).
 * 'Bukayo Saka joins Chelsea - report'·'…, Arsenal deny'·'…, per Sky'. 'per'는 영어만(이탈리아어 전치사).
 */
const LATIN_DOUBT_WORDS: Readonly<
  Record<"en" | "it" | "es", ReadonlySet<string>>
> = {
  en: new Set([
    "deny",
    "denies",
    "denied",
    "denial",
    "reject",
    "rejects",
    "rejected",
    "rubbish",
    "rubbished",
    "false",
    "untrue",
    "fake",
    "hoax",
    "report",
    "reports",
    "reported",
    "reportedly",
    "claim",
    "claims",
    "claimed",
    "source",
    "sources",
    "per",
    "via",
    "according",
    "rumour",
    "rumours",
    "rumor",
    "rumors",
    "speculation",
    "fool",
    "fools",
  ]),
  it: new Set([
    "smentisce",
    "smentiscono",
    "smentita",
    "smentito",
    "smentite",
    "smentiti",
    "falso",
    "falsa",
    "fake",
    "indiscrezione",
    "indiscrezioni",
    "voci",
    "rumors",
  ]),
  es: new Set([
    "desmiente",
    "desmienten",
    "desmentido",
    "desmentida",
    "falso",
    "falsa",
    "bulo",
    "segun",
    "informa",
    "informan",
    "rumor",
    "rumores",
  ]),
};
/** 라틴 두 낱말 부정 표현 */
const LATIN_DOUBT_BIGRAMS: readonly (readonly [string, string])[] = [
  ["not", "true"],
  ["not", "yet"],
  ["or", "not"],
  ["no", "es"],
  ["non", "e"],
];

/** 등위로 이어진 두 팀 사이 낱말(라틴) — 'Arsenal and Chelsea'·'Arsenal, Chelsea'·'Milan e Inter'·'Barça y Madrid' */
const LATIN_COORD = new Set([
  "and",
  "or",
  "nor",
  "plus",
  "e",
  "ed",
  "o",
  "y",
  "u",
  COMMA_TOKEN,
]);

/** 라틴 제목 → 태그 맞춤용 제목(금액 = `AMOUNT_MARK`, 따옴표 = `QUOTE_TOKEN`, 쉼표 = 'ǀ', 절 경계 = 쌍점) */
function latinPatternTitle(title: string): string {
  let t = title.replace(/[’']\s?(\d\d)\b/gu, " 20$1"); // until '33 → until 2033
  for (const re of AMOUNT_RES) t = t.replace(re, ` ${AMOUNT_MARK} `);
  // 여는 따옴표(앞이 처음·공백·여는 괄호·문장부호) · 닫는 따옴표(뒤가 끝·공백·닫는 괄호·문장부호) — 낱말 안 아포스트로피("Saka's")는 그대로
  t = t
    .replace(/(^|[\s([{:;,–—-])['‘"“«]/gu, `$1 ${QUOTE_TOKEN} `)
    .replace(
      /(?<=[\p{L}\p{N}.!?,)])['’"”»](?=$|[\s)\]}.,:;!?–—-])/gu,
      ` ${QUOTE_TOKEN} `,
    );
  return t
    .replace(/,/gu, ` ${COMMA_TOKEN} `)
    .replace(/[;!]|\s[-–—]\s/gu, " : ");
}

/** 문형 후보 1개 — `first` = 제목 첫 절(머리표 '[오피셜]'·'Official:'이 걸리는 절)에서 나왔는가 */
interface Candidate {
  text: string;
  first: boolean;
}

/** 후보 만들기 결과 — `blocked`면 그 제목은 문형을 쓰지 않는다 */
interface Candidates {
  candidates: Candidate[];
  teams: string[];
  segments: string[];
  blocked: boolean;
}

const NO_CANDIDATES: Candidates = {
  candidates: [],
  teams: [],
  segments: [],
  blocked: false,
};

/** 라틴 제목의 후보 낱말 열(슬롯 바꿈) */
function latinCandidates(
  title: string,
  lang: "en" | "it" | "es",
  playerSlug: string,
  tags: TagIndex,
  sourceComps: readonly string[],
): Candidates {
  const patternTitle = latinPatternTitle(title);
  const text = tagMatchText(patternTitle, lang);
  const tagged = matchTitleTags(patternTitle, lang, tags, {
    sourceComps: sourceComps as never,
  });
  const player = tagged.players.find((p) => p.slug === playerSlug);
  if (!player) return NO_CANDIDATES;
  // 글자 자리 → 낱말
  const words: Array<{ s: number; e: number; w: string }> = [];
  for (const m of text.matchAll(/\S+/gu)) {
    words.push({ s: m.index, e: m.index + m[0].length, w: m[0] });
  }
  const teams: string[] = [];
  const spans: Array<{ s: number; e: number; label: string }> = [
    { s: player.pos, e: player.end, label: P },
  ];
  const teamHits = tagged.teams.filter(
    (t) => t.end <= player.pos || t.pos >= player.end,
  );
  for (const t of teamHits) {
    spans.push({ s: t.pos, e: t.end, label: `<t${teams.length}>` });
    teams.push(t.slug);
  }
  const out: string[] = [];
  let lastAmount = false;
  for (const wd of words) {
    const span = spans.find((sp) => wd.s >= sp.s && wd.s < sp.e);
    if (span) {
      if (wd.s === span.s) out.push(span.label);
      lastAmount = false;
      continue;
    }
    const low = wd.w.toLowerCase();
    if (low === LATIN_BREAK_TOKEN) {
      out.push("ǂ");
      lastAmount = false;
    } else if (low === COMMA_TOKEN) {
      out.push("ǀ");
      lastAmount = false;
    } else if (YEAR_TOKEN.test(low)) {
      out.push("<year>");
      lastAmount = false;
    } else if (low === AMOUNT_MARK) {
      if (!lastAmount) out.push("<amt>");
      lastAmount = true;
    } else {
      out.push(low);
      lastAmount = false;
    }
  }
  // 부정·보도·유보 낱말(차단 2·중요 6) · 등위로 이어진 두 팀(차단 2 — 'Arsenal and Chelsea agree fee for Saka')
  const doubt = LATIN_DOUBT_WORDS[lang];
  const blocked =
    out.some((x) => doubt.has(x)) ||
    out.some((x, i) =>
      LATIN_DOUBT_BIGRAMS.some(([a, b]) => x === a && out[i + 1] === b),
    ) ||
    out.some((x, i) => {
      if (!/^<t\d+>$/u.test(x)) return false;
      const next = out[i + 1];
      const after = out[i + 2];
      return (
        next !== undefined &&
        ((/^<t\d+>$/u.test(next) && next !== x) ||
          (LATIN_COORD.has(next) &&
            after !== undefined &&
            /^<t\d+>$/u.test(after) &&
            after !== x))
      );
    });
  const whole = out.join(" ");
  // 라틴 제목은 제목 전체, 또는 나머지 절이 모두 '무해한 꼬리'(`LATIN_BENIGN_SEGMENT` — 'es oficial'·'done deal'·'here we go'·금액)인 절
  // 하나만 — 'Harry Kane joins Bayern Munich: injury list grows to seven'의 앞 절은 문형이 아니다(M1-18 2회차 리뷰)
  const segments = whole
    .split(/ ?ǂ ?/u)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  const candidates: Candidate[] = [{ text: whole, first: true }];
  // 머리표('Official:')가 걸리는 첫 절 — 앞의 무해한 꼬리 절('Official: Done deal - Saka joins Chelsea'의 done deal)은 건너뛴다
  const firstAt = segments.findIndex((o) => !LATIN_BENIGN_SEGMENT.test(o));
  segments.forEach((seg, i) => {
    if (segments.every((o, j) => j === i || LATIN_BENIGN_SEGMENT.test(o))) {
      candidates.push({ text: seg, first: i === firstAt });
    }
  });
  // 도입구 쉼표 뒤('After 27 titles in 23 years at Real Madrid, Carvajal joins Getafe'·'Following talks, Kane joins Arsenal')
  for (const c of [...candidates]) {
    const k = c.text.lastIndexOf(" ǀ ");
    if (k > 0 && latinIntroOk(c.text.slice(0, k))) {
      candidates.push({ text: c.text.slice(k + 3), first: c.first });
    }
  }
  return { candidates, teams, segments, blocked };
}

/**
 * 라틴 제목의 도입구(쉼표 앞) — 'after …'·'following …'·'despite …'·'having …'·'tras …'·'dopo …'만(M1-18 3회차 리뷰 중요 5 — 'In 2019,'·
 * 'On this day in 2023,'·'In FIFA 27 career mode,'·'In a perfect world,'는 지금 일이 아니다). 도입구에 선수·연도·가정 낱말이 있으면 아니다.
 */
const LATIN_INTRO = /^(?:after|following|despite|having|tras|dopo) /u;
const LATIN_INTRO_HYPOTHETICAL =
  /(?:^| )(?:if|would|could|dream|imagine|imagined|fifa|fm|career mode|simulation|simulated|hypothetical|perfect world|ideal world|alternate reality|alternative reality|parallel universe|video game)(?= |$)/u;
function latinIntroOk(intro: string): boolean {
  return (
    LATIN_INTRO.test(`${intro} `) &&
    !intro.includes(P) &&
    !intro.includes("<year>") &&
    !LATIN_INTRO_HYPOTHETICAL.test(intro)
  );
}

/** 라틴 제목의 무해한 꼬리 절(문형 절 옆에 와도 되는 것 — 'report(s)'는 아니다, 중요 6) */
const LATIN_BENIGN_SEGMENT =
  /^(?:(?:ya )?es oficial|e ufficiale|it s official|now official|official|oficial|ufficiale|done deal|here we go|confirmed|medical booked|deal agreed|fee agreed|<amt>(?: fee| deal)?|exclusive)$/u;

/**
 * 국내 제목의 부정·유보·보도 낱말(제목 어디에나 있으면 문형을 쓰지 않는다 — rumor 판정은 따로, M1-18 3회차 리뷰 차단 2): '사실무근'·
 * '오보'·'부인'·'아니다'·'아직'·'보도'('보도자료'는 아니다)·'일축'·'이적설'·'루머'·'가능성'. 슬롯을 바꾼 글에서 본다(선수·팀 이름 안의 글자
 * 제외). 다른 절은 이와 별개로 닫힌 목록 꼴만 받는다(`KO_BENIGN_PIECES` — 4회차 차단 1). '주장'은 캡틴 뜻과 겹쳐 빼고, '설'은 이적·영입·
 * 합의·결렬·무산·임대 바로 뒤('이적설')만 본다('설 연휴' — 4회차 권장).
 */
const KO_DOUBT =
  /사실무근|오보|부인|아니다|아니야|아냐|아직|보도(?!자료)|일축|루머|소문|가능성|가짜|거짓|만우절|(?:이적|영입|합의|결렬|무산|임대)\s?설/u;
/** 국내 등위로 이어진 두 팀 사이 말('아스널, 첼시, 김민재 영입 확정'·'아스널·첼시'·'아스널과 첼시') */
const KO_TEAM_COORD = /^\s?(?:[·/&,，]|와|과|및|이나|나|또는|랑|하고)\s?$/u;
/**
 * 절 앞 인용 꼬리표 중 벗겨도 되는 것 — 중립 감탄('‘미쳤다’ 김민재, …'·'충격'·'대박!')·별명('괴물')·'주장'(캡틴)과 'here we go'(단계
 * 상한은 transfer-extract.ts가 agreed로 묶는다 — 결정 C)만. 그 밖의 인용('‘사실무근’'·'‘오보’'·'‘아직 아니다’'·'‘1000억 사나이’')은 벗기지
 * 않는다(문형에 맞지 않는다 — 차단 2).
 */
const KO_LEAD_QUOTE_NEUTRAL =
  /^\s*[‘'"“](?:미쳤다|미쳤네|미친|충격|대충격|대박|초대박|경악|깜짝|드디어|마침내|역대급|실화|실화냐|와우|괴물|주장|here we go|히어 위 고)[!.…\s]*[’'"”]\s*/iu;

/**
 * 국내 제목에서 문형 절 밖에 와도 되는 꼴(닫힌 목록 — M1-18 4회차 차단 1, D54 원칙: 라틴 `LATIN_BENIGN_SEGMENT`와 같다). 다른 절(… ... ! ? ; |)과
 * 같은 절의 문형 밖 쉼표 마디가 하나라도 목록 밖이면 그 후보는 쓰지 않는다('김민재, 아스널 이적 확정…바이에른 반박'·'…바이에른은 선 그어'·
 * '…獨 빌트'·'…현지 매체 전해'). 마디마다 앞뒤 따옴표·끝 '!·.·~'는 떼고 본다. fixtures·테스트의 정상 꼴('…등번호 3'·'…이적료 5000만 유로'·
 * '…이적료 1000억')과 오케스트레이터 목록(등번호·이적료·금액·계약 기간·N년 계약·메디컬·입단식·발표·오피셜·중립 감탄·here we go)이 근거다.
 */
const KO_BENIGN_PIECES: readonly RegExp[] = [
  // 등번호
  /^등\s?번호\s?\d{1,2}(?:번)?(?:\s?(?:배정|확정|낙점))?$/u,
  // 이적료·금액('이적료 1000억'·'이적료 5000만 유로'·'1,400억'·'이적료 약 700억 원')
  /^(?:(?:추정\s?)?이적료\s?)?(?:약\s?|최대\s?|무려\s?)?\d[\d,.]*\s?(?:만|억|천만|백만)?\s?(?:원|유로|파운드|달러)?(?:\s?(?:규모|수준))?$/u,
  /^이적료\s?(?:비공개|미공개)$/u,
  // 계약 기간('2030년까지'·'계약 기간 2030년 6월까지')
  /^(?:계약\s?기간\s?)?\d{4}년\s?(?:\d{1,2}월\s?|여름\s?)?까지(?:\s?계약)?$/u,
  // N년 계약('5년 계약'·'4년 반 계약'·'5년 계약+1년 옵션')
  /^(?:\d+|한|두|세|네|다섯|여섯)\s?년(?:\s?반)?\s?(?:장기\s?)?계약(?:\s?(?:체결|서명))?(?:\s?\+\s?\d+\s?년\s?옵션)?$/u,
  // 메디컬·입단식·발표·오피셜
  /^메디컬(?:\s?테스트)?(?:\s?(?:통과|완료|진행))?$/u,
  /^입단(?:식|\s?기자회견)(?:\s?(?:진행|개최|완료))?$/u,
  /^(?:구단\s?)?(?:공식\s?)?발표$/u,
  /^오피셜$/u,
  // 중립 감탄·here we go
  /^(?:미쳤다|미쳤네|충격|대충격|대박|초대박|경악|깜짝|드디어|마침내|역대급|실화|실화냐|와우)$/u,
  /^(?:here we go|히어 위 고)$/iu,
];
/** 국내 마디 1개가 문형 밖에 와도 되는 꼴인가(빈 마디 포함) */
function koBenignPiece(piece: string): boolean {
  const t = piece
    .trim()
    .replace(/^['‘"“](.*)['’"”]$/u, "$1")
    .replace(/[!.~\s]+$/u, "")
    .trim();
  return t === "" || KO_BENIGN_PIECES.some((re) => re.test(t));
}

/** 국내 절 경계(따옴표 안은 경계가 아니다 — "'대박!' 김민재, …", 4회차 권장) */
const KO_CLAUSE_SEP = /…|\.{2,}|[!?;|]/gu;
const KO_QUOTED_SPAN = /[‘“][^‘’“”]*[’”]|'[^']*'|"[^"]*"/gu;
function koSplitClauses(s: string): string[] {
  let masked = s;
  for (const m of s.matchAll(KO_QUOTED_SPAN)) {
    masked =
      masked.slice(0, m.index) +
      "x".repeat(m[0].length) +
      masked.slice(m.index + m[0].length);
  }
  const out: string[] = [];
  let last = 0;
  for (const m of masked.matchAll(KO_CLAUSE_SEP)) {
    out.push(s.slice(last, m.index));
    last = m.index + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}

/** 국내 제목의 후보 글(슬롯 바꿈) — 절 + 절 안 쉼표 마디의 연속 묶음(문형 밖 마디·다른 절은 `KO_BENIGN_PIECES`만) */
function koCandidates(
  title: string,
  playerSlug: string,
  tags: TagIndex,
): Candidates {
  const text = koSpaced(title);
  const tagged = matchTitleTags(title, "ko", tags);
  const player = tagged.players.find((p) => p.slug === playerSlug);
  if (!player) return NO_CANDIDATES;
  const teams: string[] = [];
  const spans: Array<TagHit & { label: string }> = [{ ...player, label: KP }];
  const teamHits = tagged.teams.filter(
    (t) => t.end <= player.pos || t.pos >= player.end,
  );
  for (const t of teamHits) {
    spans.push({ ...t, label: `⟨T${teams.length}⟩` });
    teams.push(t.slug);
  }
  let slotted = text;
  for (const sp of [...spans].sort((a, b) => b.pos - a.pos)) {
    slotted = slotted.slice(0, sp.pos) + sp.label + slotted.slice(sp.end);
  }
  // 부정·유보·보도 낱말 · 등위로 이어진 두 팀(차단 2)
  const coordinated = teamHits.some((a) =>
    teamHits.some(
      (b) =>
        b !== a &&
        b.slug !== a.slug &&
        a.end <= b.pos &&
        KO_TEAM_COORD.test(text.slice(a.end, b.pos)),
    ),
  );
  const blocked = KO_DOUBT.test(slotted) || coordinated;
  // 따옴표는 벗기지 않는다 — 따옴표가 남은 후보는 문형에 맞지 않는다(통째로 감싼 절 "'김민재, 아스널 이적 확정'…"·"김민재, '아스널 이적
  // 확정'" — 차단 2). 'here we go' 문형만 따옴표를 받는다.
  const clean = (x: string) => x.trim().replace(/\s+/gu, " ");
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const add = (t: string, first: boolean) => {
    const k = `${first ? 1 : 0}|${t}`;
    if (t === "" || seen.has(k)) return;
    seen.add(k);
    candidates.push({ text: t, first });
  };
  const clauses = koSplitClauses(slotted);
  const benignClause = clauses.map((c) => c.split(",").every(koBenignPiece));
  // 머리표가 걸리는 첫 절 — 앞의 목록 꼴 절('[오피셜] ‘이적료 1000억’…김민재, 아스널행'·'[오피셜] 드디어…')은 건너뛴다. 단계 낱말이 든
  // 인용("[오피셜] '쿠보 영입 완료'…이강인, PSG행")은 목록 꼴이 아니다(4회차 중요 2)
  const firstAt = benignClause.findIndex((ok) => !ok);
  clauses.forEach((raw, idx) => {
    // 다른 절이 하나라도 목록 밖이면 이 절의 후보는 쓰지 않는다(4회차 차단 1)
    if (benignClause.some((ok, k) => k !== idx && !ok)) return;
    // 절 앞 중립 인용 꼬리표('‘미쳤다’ 김민재, …')만 벗긴 판도 본다
    const lead = KO_LEAD_QUOTE_NEUTRAL.exec(raw);
    const variants = lead ? [raw, raw.slice(lead[0].length)] : [raw];
    for (const seg of variants) addRuns(seg, idx === firstAt);
  });
  return { candidates, teams, segments: [], blocked };

  function addRuns(seg: string, first: boolean) {
    const parts = seg.split(",").map(clean);
    // 문형은 쉼표 마디 셋까지('⟨T⟩, ⟨P⟩ 영입 확정') — 선수 슬롯이 든 마디 근처만 본다(긴 쉼표 열의 연산 상한). 문형 밖 마디는 목록 꼴만
    const at = parts.findIndex((x) => x.includes(KP));
    if (at < 0) return;
    const outsideOk = (i: number, j: number) =>
      parts.every((x, k) => (k >= i && k <= j) || koBenignPiece(x));
    for (let i = Math.max(0, at - 2); i <= at; i++) {
      for (let j = at; j < Math.min(parts.length, i + 3); j++) {
        if (!outsideOk(i, j)) continue;
        add(
          parts
            .slice(i, j + 1)
            .filter((x) => x !== "")
            .join(", "),
          first,
        );
      }
    }
    add(clean(seg), first);
  }
}

const langKey = (lang: string): "en" | "it" | "es" | "ko" | null => {
  if (isKoLang(lang)) return "ko";
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "it" || base === "es" ? base : null;
};

/**
 * 제목 1건 → 맞은 높은 단계 문형들(머리 주석). 물음표·무산 이모지·부정/보도 낱말·등위 두 팀이 있는 제목, 문형 표가 없는 언어는 [].
 * `playerSlug` = 주어 선수(transfer-extract.ts가 고른 1명). 같은 제목에서 여러 문형이 맞으면 모두 돌려준다(transfer-extract.ts가 합친다).
 * 머리표('[오피셜]'·'Official:')는 그 머리표가 붙은 **첫 절**의 후보에만 건다(차단 3 — '[오피셜] 쿠보, 레알 이적 완료…이강인은 PSG행').
 */
export function matchStagePatterns(input: {
  title: string;
  lang: string;
  playerSlug: string;
  tags: TagIndex;
  sourceComps?: readonly string[];
}): StageMatch[] {
  const key = langKey(input.lang);
  if (key === null) return [];
  if (DOUBT_PICTO.test(input.title)) return [];
  const { text, explicitHead } = stripHeadNoise(input.title, input.lang);
  if (/[?¿]/u.test(text)) return [];
  const { candidates, teams, segments, blocked } =
    key === "ko"
      ? koCandidates(text, input.playerSlug, input.tags)
      : latinCandidates(
          text,
          key,
          input.playerSlug,
          input.tags,
          input.sourceComps ?? [],
        );
  if (blocked || candidates.length === 0) return [];
  // 따로 선 명시 표현 절('Harry Kane ficha por el Barcelona: es oficial')
  const tailExplicit =
    key !== "ko" &&
    segments.some((c) => TAIL_OFFICIAL_LATIN.test(c.replace(/ ǀ /gu, " ")));
  const slug = (g: string | undefined) =>
    g === undefined ? undefined : teams[Number(g)];
  const out: StageMatch[] = [];
  const seen = new Set<string>();
  for (const pattern of STAGE_PATTERNS[key]) {
    for (const c of candidates) {
      const head = explicitHead && c.first;
      if (pattern.needsHead && !head) continue;
      const m = pattern.re.exec(c.text);
      if (!m) continue;
      const g = m.groups ?? {};
      const to = slug(g.to);
      const from = slug(g.from ?? g.from2 ?? tailTeamOf(g.tail));
      // 금액은 '사이' 꼴(선수-구단 합의·협상)에서는 움직임 근거가 아니다(4회차 중요 3)
      const fromMove = from !== undefined && from !== to;
      const amountMove = c.text.includes("<amt>") && pattern.between !== true;
      const strongMove = fromMove || amountMove;
      const moved =
        pattern.needsMove !== true || strongMove || MOVE_WORD.test(c.text);
      const explicit =
        pattern.status === "official" &&
        (pattern.explicit === true || head || tailExplicit);
      const k = `${pattern.id}|${to ?? ""}|${from ?? ""}|${moved}|${explicit}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: pattern.id,
        status: pattern.status,
        explicit,
        signsForm: pattern.signsForm === true,
        joinForm: pattern.joinForm === true,
        moved,
        strongMove,
        ...(to !== undefined ? { to } : {}),
        ...(from !== undefined && from !== to ? { from } : {}),
      });
    }
  }
  return out;
}
