/**
 * M1-18 3회차 적대적 재리뷰(2026-10-17)의 이적 오탐 시도 문장 — 리뷰 하네스(scratchpad review-m118b/r3probes.mts 80문장)를 그대로 옮기고,
 * 표시만 하던 r3probes2.mts·r3probes3.mts 문장에는 3회차 지시(오케스트레이터 결정 A~D·차단 1~3·중요 4~10)에 따른 기대를 붙였다.
 * `exp` 표기는 transfer-review-probes.ts와 같다(`notFrom` = 금지 출발). 구현이 다르게 정한 항목은 tests/transfer-extract.test.ts의
 * `INTENDED_R3`에 이유와 함께 적는다.
 */
import type { ReviewProbe } from "./transfer-review-probes";

const KO2 = ["interfootball-world", "footballist-football"]; // 서로 다른 국내 매체 2곳(묶음 하나)
const ko2 = (title: string) => ({
  items: [{ title, lang: "ko", source: KO2 }],
});

/** r3probes.mts 80문장(리뷰어 기대 그대로) */
export const REVIEW_PROBES_R3: ReviewProbe[] = [
  // ── DESC 슬롯(선수 앞 역할 묘사)
  {
    g: "DESC",
    t: "Arsenal sign Tottenham-linked star Bukayo Saka",
    l: "en",
    exp: { notFrom: "tottenham-hotspur" },
  },
  {
    g: "DESC",
    t: "Chelsea complete signing of Arsenal-linked winger Bukayo Saka",
    l: "en",
    exp: { notFrom: "arsenal" },
  },
  {
    g: "DESC",
    t: "Chelsea confirm signing of Arsenal-bound winger Bukayo Saka",
    l: "en",
    exp: { notFrom: "arsenal" },
  },
  {
    g: "DESC",
    t: "Chelsea sign Arsenal-target winger Bukayo Saka",
    l: "en",
    exp: { notFrom: "arsenal" },
  },
  {
    g: "DESC",
    t: "Bayern sign England star Bukayo Saka's brother",
    l: "en",
    exp: "none",
  },
  {
    g: "DESC",
    t: "Arsenal confirm signing of Chelsea star Bukayo Saka's cousin",
    l: "en",
    exp: "none",
  },
  {
    g: "DESC",
    t: "Chelsea sign next star Bukayo Saka",
    l: "en",
    exp: "none",
    note: "'다음 사카' 꼴",
  },
  {
    g: "DESC",
    t: "Chelsea sign 'new' winger Bukayo Saka",
    l: "en",
    exp: { max: "agreed" },
    note: "정상 꼴(참고)",
  },
  {
    g: "DESC",
    t: "Arsenal sign Chelsea star Bukayo Saka",
    l: "en",
    exp: { max: "agreed" },
    note: "정상 — from=chelsea",
  },
  // ── 꼬리 슬롯·금액
  { g: "TAIL", t: "Bukayo Saka joins Chelsea in 2027", l: "en", exp: "none" },
  { g: "TAIL", t: "Bukayo Saka joins Chelsea for 2", l: "en", exp: "none" },
  {
    g: "TAIL",
    t: "Bukayo Saka joins Chelsea on a free kick",
    l: "en",
    exp: "none",
  },
  {
    g: "TAIL",
    t: "Bukayo Saka joins Chelsea in a deal",
    l: "en",
    exp: { max: "agreed" },
    note: "정상",
  },
  {
    g: "TAIL",
    t: "Bukayo Saka joins Chelsea from Hale End",
    l: "en",
    exp: "none",
  },
  {
    g: "TAIL",
    t: "Arsenal sign Bukayo Saka on a five-year contract",
    l: "en",
    exp: "none",
    note: "이미 소속 — 재계약 꼴",
  },
  {
    g: "TAIL",
    t: "Cole Palmer signs for Chelsea on nine-year contract",
    l: "en",
    exp: "none",
    note: "재계약 꼴",
  },
  {
    g: "TAIL",
    t: "Arsenal agree fee for Bukayo Saka, 23",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "TAIL",
    t: "Arsenal make 3 bids for Bukayo Saka",
    l: "en",
    exp: { max: "negotiating" },
  },
  // ── 머리말 잡음·머리표
  {
    g: "HEAD",
    ...ko2("[오피셜] 바이에른, 수비수 보강…아스널은 김민재 영입"),
    exp: { max: "agreed" },
    note: "[오피셜]은 앞 절 이야기",
  },
  {
    g: "HEAD",
    ...ko2("[오피셜] 쿠보, 레알 이적 완료…이강인은 PSG행"),
    exp: { max: "rumor" },
  },
  {
    g: "HEAD",
    ...ko2("[오피셜] 손흥민 LAFC 이적…김민재, 아스널행"),
    exp: { max: "rumor" },
  },
  {
    g: "HEAD",
    t: "Official: Arsenal sign defender - Bukayo Saka joins Chelsea",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "HEAD",
    t: "BREAKING: Bukayo Saka joins Chelsea's injury list",
    l: "en",
    exp: "none",
  },
  {
    g: "HEAD",
    t: "Transfer news LIVE: Bukayo Saka joins Chelsea",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "HEAD",
    t: "Mercato: Harry Kane è un nuovo giocatore del Milan",
    l: "it",
    exp: { max: "agreed" },
    note: "정상",
  },
  {
    g: "HEAD",
    t: "🚨🚨 EXCL: Bukayo Saka joins Chelsea",
    l: "en",
    exp: { max: "agreed" },
    note: "정상",
  },
  // ── 라틴 무해한 꼬리 절·도입구 쉼표
  {
    g: "BENIGN",
    t: "Bukayo Saka joins Chelsea - report",
    l: "en",
    exp: { max: "negotiating" },
    note: "보도형 — 단일 Tier 2 agreed, 2곳이면 official",
  },
  {
    g: "BENIGN",
    items: [
      {
        title: "Bukayo Saka joins Chelsea - reports",
        lang: "en",
        source: "bbc-sport-football",
      },
      {
        title: "Bukayo Saka joins Chelsea - report",
        lang: "en",
        source: "the-athletic-football",
      },
    ],
    exp: { max: "agreed" },
  },
  {
    g: "BENIGN",
    t: "Bukayo Saka joins Chelsea: deal agreed",
    l: "en",
    exp: { max: "agreed" },
    note: "정상",
  },
  { g: "INTRO", t: "In 2019, Bukayo Saka joins Chelsea", l: "en", exp: "none" },
  {
    g: "INTRO",
    t: "On this day in 2023, Harry Kane joins Bayern Munich",
    l: "en",
    exp: "none",
  },
  {
    g: "INTRO",
    t: "In FIFA 27 career mode, Bukayo Saka joins Chelsea",
    l: "en",
    exp: "none",
  },
  {
    g: "INTRO",
    t: "In a perfect world, Bukayo Saka signs for Real Madrid",
    l: "en",
    exp: "none",
  },
  {
    g: "INTRO",
    t: "In an alternate reality, Arsenal agree fee for Bukayo Saka",
    l: "en",
    exp: "none",
  },
  {
    g: "INTRO",
    t: "After talks collapse, Bukayo Saka joins Chelsea",
    l: "en",
    exp: { max: "agreed" },
    note: "정상",
  },
  // ── 국내 쉼표 마디·인용 꼬리표·다른 절의 부인
  {
    g: "KO-QUOTE",
    ...ko2("'사실무근' 김민재, 아스널 이적 확정"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-QUOTE",
    ...ko2("'오보' 김민재 아스널 이적 합의"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-QUOTE",
    ...ko2("'아직 아니다' 김민재, 아스널 이적 임박"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-QUOTE",
    ...ko2("'김민재, 아스널 이적 확정'…바이에른은 부인"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-QUOTE",
    ...ko2("“김민재 아스널 이적 확정” 보도…바이에른 '사실무근'"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("김민재, 아스널 이적 확정…바이에른은 '사실무근'"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("김민재, 아스널 이적 확정, 바이에른은 부인"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("아스널, 김민재 영입 확정…바이에른 '오보다'"),
    exp: { max: "rumor" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("아스널, 첼시, 김민재 영입 확정"),
    exp: { notTo: "chelsea" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("현지 매체 주장, 김민재, 아스널 이적 확정"),
    exp: { max: "agreed" },
  },
  {
    g: "KO-CLAUSE",
    ...ko2("김민재, 아스널 이적 확정 (종합)"),
    exp: { max: "agreed" },
    note: "재현율 확인",
  },
  {
    g: "KO-HWG",
    ...ko2("'HERE WE GO' 김민재, 아스널 이적 확정"),
    exp: { max: "agreed" },
    note: "FR-103 — HWG는 agreed",
  },
  {
    g: "KO-HWG",
    ...ko2("'히어 위 고' 김민재, 아스널행 임박"),
    exp: { max: "negotiating" },
  },
  {
    g: "KO-NEG",
    ...ko2("아스널, 김민재 영입 추진"),
    exp: { max: "rumor" },
    note: "'영입 추진'은 rumor 표에 있다",
  },
  { g: "KO-NEG", ...ko2("첼시, 김민재 영입 추진 중"), exp: { max: "rumor" } },
  // ── 앵커드 우회(구두점·따옴표·이모지)
  {
    g: "PUNCT",
    t: "Bukayo Saka 'joins' Chelsea",
    l: "en",
    exp: { max: "negotiating" },
    note: "따옴표 = 인용·반어",
  },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea ❌",
    l: "en",
    exp: "none",
    note: "❌ = 무산",
  },
  { g: "PUNCT", t: "Bukayo Saka joins Chelsea 🤔", l: "en", exp: "none" },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea (not yet)",
    l: "en",
    exp: "none",
  },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea; Arsenal deny",
    l: "en",
    exp: "none",
  },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea, Arsenal deny",
    l: "en",
    exp: "none",
  },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea. Or does he",
    l: "en",
    exp: "none",
  },
  {
    g: "PUNCT",
    t: "Bukayo Saka joins Chelsea - April Fool",
    l: "en",
    exp: "none",
  },
  {
    g: "PUNCT",
    t: '"Bukayo Saka joins Chelsea" - fake news',
    l: "en",
    exp: "none",
  },
  { g: "PUNCT", ...ko2("김민재, 아스널 이적 확정 ❌"), exp: { max: "rumor" } },
  { g: "PUNCT", ...ko2("김민재, 아스널 이적 '확정'"), exp: { max: "rumor" } },
  { g: "PUNCT", ...ko2("김민재, 아스널 이적 확정？"), exp: { max: "rumor" } },
  { g: "PUNCT", t: "Bukayo Saka joins Chelsea ？", l: "en", exp: "none" },
  // ── 재계약 꼴(지금 소속을 모르는 선수)
  {
    g: "RENEW",
    t: "Arsenal in talks over Bukayo Saka",
    l: "en",
    exp: { max: "rumor" },
    note: "재계약일 수 있다",
  },
  {
    g: "RENEW",
    t: "Bukayo Saka in talks with Arsenal",
    l: "en",
    exp: { max: "rumor" },
  },
  {
    g: "RENEW",
    t: "Acuerdo total entre el Barcelona y Lamine Yamal",
    l: "es",
    exp: { max: "rumor" },
  },
  {
    g: "RENEW",
    t: "Accordo raggiunto tra il Milan e Rafael Leão",
    l: "it",
    exp: { max: "rumor" },
  },
  // ── rumor 귀속·방향(rumor + 잘못된 to)
  {
    g: "RDIR",
    t: "Chelsea fans want Bukayo Saka transfer",
    l: "en",
    exp: { notTo: "chelsea" },
  },
  {
    g: "RDIR",
    t: "Chelsea legend wants Bukayo Saka transfer",
    l: "en",
    exp: { notTo: "chelsea" },
  },
  {
    g: "RDIR",
    t: "Chelsea want a Bukayo Saka type in transfer window",
    l: "en",
    exp: "none",
  },
  {
    g: "RDIR",
    t: "Chelsea target Bukayo Saka-like winger in transfer window",
    l: "en",
    exp: "none",
  },
  {
    g: "RDIR",
    t: "Bukayo Saka on Arsenal links with Mudryk",
    l: "en",
    exp: "none",
  },
  {
    g: "RDIR",
    t: "Bukayo Saka will welcome Arsenal interest in Mudryk",
    l: "en",
    exp: "none",
  },
  {
    g: "RDIR",
    t: "Bukayo Saka to Chelsea fans: thank you for the transfer support",
    l: "en",
    exp: "none",
  },
  {
    g: "RDIR",
    t: "Bukayo Saka linked with Chelsea in FIFA transfer",
    l: "en",
    exp: { max: "rumor" },
  },
  { g: "RDIR", ...ko2("첼시, 김민재 스타일 수비수 영입 추진"), exp: "none" },
  { g: "RDIR", ...ko2("첼시, 김민재 유형 센터백 노린다"), exp: "none" },
  { g: "RDIR", ...ko2("김민재 팬들, 아스널 이적 원해"), exp: "none" },
  {
    g: "RDIR",
    ...ko2("아스널 팬들, 김민재 영입 원해"),
    exp: { notTo: "arsenal" },
  },
  {
    g: "RDIR",
    ...ko2("김민재, 아스널 이적설 '사실무근'"),
    exp: { max: "rumor" },
  },
];

/** r3probes2.mts·r3probes3.mts(표시용) — 3회차 지시에 따른 기대 */
export const REVIEW_PROBES_R3_EXTRA: ReviewProbe[] = [
  // 결정 A (c) — 움직임 낱말·from·금액이 없는 합의·협상 꼴에만 맞은 제목은 주장 없음(재계약일 수 있다 — 마무리 조정)
  {
    g: "A",
    t: "Bukayo Saka agrees terms with Arsenal",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "Real Madrid in talks over Vinícius Júnior",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "Real Madrid hold talks over Vinícius Júnior",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "Vinícius Júnior in talks with Real Madrid",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "Barcelona close to deal for Lamine Yamal",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "El Barcelona negocia por Lamine Yamal",
    l: "es",
    exp: "none",
  },
  {
    g: "A",
    t: "Acuerdo total entre el Barça y Lamine Yamal",
    l: "es",
    exp: "none",
  },
  {
    g: "A",
    t: "Acuerdo cerrado entre el Real Madrid y Vinícius Júnior",
    l: "es",
    exp: "none",
  },
  {
    g: "A",
    t: "Accordo totale tra il Milan e Rafael Leão",
    l: "it",
    exp: "none",
  },
  {
    g: "A",
    t: "Il Milan, trattativa per Rafael Leão",
    l: "it",
    exp: "none",
  },
  {
    g: "A",
    t: "Inter, trattativa con Lautaro Martínez",
    l: "it",
    exp: "none",
  },
  {
    g: "A",
    ...ko2("바르셀로나, 라민 야말과 개인 합의"),
    exp: "none",
  },
  {
    g: "A",
    t: "Bayern Munich agree terms with Harry Kane",
    l: "en",
    exp: "none",
  },
  {
    g: "A",
    t: "Bayern Munich agree deal for Harry Kane",
    l: "en",
    exp: "none",
  },
  // 중요 4 — DESC 자유 낱말은 허용 목록만('Arsenal-owned'·'Arsenal-born'·'fan favourite'·'rival')
  {
    g: "DESC",
    t: "Chelsea sign Arsenal-owned winger Bukayo Saka",
    l: "en",
    exp: { notFrom: "arsenal", max: "rumor" },
  },
  {
    g: "DESC",
    t: "Real Madrid confirm signing of Arsenal-born star Bukayo Saka",
    l: "en",
    exp: { notFrom: "arsenal", max: "rumor" },
  },
  {
    g: "DESC",
    t: "Real Madrid confirm signing of Liverpool fan favourite Mohamed Salah",
    l: "en",
    exp: { notFrom: "liverpool", max: "rumor" },
  },
  {
    g: "DESC",
    t: "Arsenal sign rival striker Harry Kane",
    l: "en",
    exp: { max: "rumor" },
  },
  // 결렬 문형(정상) · 계약 결렬(중요 9)
  {
    g: "COLL",
    t: "Arsenal pull out of race for Bukayo Saka",
    l: "en",
    exp: { status: "collapsed", to: "arsenal" },
  },
  {
    g: "COLL",
    t: "Arsenal pull out of talks for Bukayo Saka contract",
    l: "en",
    exp: "none",
  },
  {
    g: "COLL",
    t: "Bukayo Saka's move to Chelsea is dead",
    l: "en",
    exp: { status: "collapsed", to: "chelsea" },
  },
  {
    g: "COLL",
    t: "Bukayo Saka move to Chelsea off",
    l: "en",
    exp: { status: "collapsed", to: "chelsea" },
  },
  {
    g: "COLL",
    ...ko2("김민재의 아스널 이적 무산"),
    exp: { status: "collapsed", to: "arsenal" },
  },
  { g: "COLL", ...ko2("바이에른, 김민재 영입 포기"), exp: "none" },
  // 'T행' 문형·머리표(정상)
  { g: "HAENG", ...ko2("김민재, 아스널행"), exp: "none" },
  {
    g: "HAENG",
    ...ko2("[오피셜] 김민재, 아스널행"),
    exp: { status: "official", to: "arsenal" },
  },
  {
    g: "HAENG",
    t: "[오피셜] 김민재, 아스널행 확정",
    l: "ko",
    src: "interfootball-world",
    exp: { max: "negotiating", to: "arsenal" },
  },
  // 권장 13 — 국내 문형 도달성('T, P와 개인 합의'는 문형에서 지웠다 — 'P와'는 꾸미는 자리)
  { g: "KO-REACH", ...ko2("아스널, 김민재와 개인 합의"), exp: "none" },
  { g: "KO-REACH", ...ko2("아스널은 김민재와 구두 합의"), exp: "none" },
  {
    g: "KO-REACH",
    ...ko2("김민재, 아스널 메디컬 진행"),
    exp: { status: "agreed", to: "arsenal" },
  },
  {
    g: "KO-REACH",
    ...ko2("아스널, 김민재 영입 발표"),
    exp: { status: "official", to: "arsenal" },
  },
  {
    g: "KO-REACH",
    ...ko2("아스널, 김민재 영입 공식 발표"),
    exp: { status: "official", to: "arsenal" },
  },
  {
    g: "KO-REACH",
    ...ko2("김민재, 아스널로 이적 확정"),
    exp: { status: "official", to: "arsenal" },
  },
  {
    g: "KO-REACH",
    ...ko2("김민재 아스널 입단 확정"),
    exp: { status: "official", to: "arsenal" },
  },
  {
    g: "KO-REACH",
    ...ko2("김민재 아스널 이적 협상 중"),
    exp: { status: "negotiating", to: "arsenal" },
  },
];
