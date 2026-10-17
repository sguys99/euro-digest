/**
 * M1-18 4회차 확인 리뷰(2026-10-17)의 우회 시도 문장 — 리뷰 하네스(scratchpad review-m118b/r4probes.mts 53문장)를 그대로 옮기고, 표시용이던
 * r4probes2.mts 12문장에는 4회차 지시(차단 1 — 국내 다른 절은 닫힌 목록 꼴만)에 따른 기대를 붙였다. `kind`: fp = 오탐 시도 · recall = 재현율 확인.
 * `exp`: "none" = transfer 없음 · `max` = 단계 상한 · `status`·`to`·`from` = 기대 값(null = 없음) · `notTo`·`notFrom` = 금지 값.
 */
export type R4Exp =
  | "none"
  | {
      max?: string;
      notTo?: string;
      notFrom?: string;
      status?: string;
      to?: string | null;
      from?: string | null;
    };
export interface R4Probe {
  g: string;
  title: string;
  lang: string;
  src?: string | string[];
  exp: R4Exp;
  kind?: "fp" | "recall";
  note?: string;
}
const KO2 = ["interfootball-world", "footballist-football"]; // 서로 다른 국내 매체 2곳(묶음 하나)
const KO1 = ["interfootball-world"]; // 국내 Tier 3 1곳
const k = (
  g: string,
  title: string,
  exp: R4Exp,
  kind: "fp" | "recall" = "fp",
  note?: string,
): R4Probe => ({ g, title, lang: "ko", src: KO2, exp, kind, note });
const e = (
  g: string,
  title: string,
  exp: R4Exp,
  kind: "fp" | "recall" = "fp",
  note?: string,
  lang = "en",
): R4Probe => ({ g, title, lang, exp, kind, note });

/** r4probes.mts 53문장(리뷰어 기대 그대로) */
export const REVIEW_PROBES_R4: R4Probe[] = [
  // A. 중립 감탄 목록 밖 머리 인용
  k(
    "A-QUOTE",
    "'1000억 사나이' 김민재, 아스널 이적 확정",
    { max: "rumor" },
    "recall",
    "목록 밖 인용 → 문형 안 씀",
  ),
  k("A-QUOTE", "'아직 몰라' 김민재, 아스널 이적 확정", { max: "rumor" }),
  k("A-QUOTE", "'설마' 김민재, 아스널 이적 확정", { max: "rumor" }),
  k(
    "A-QUOTE",
    "'실화냐' 김민재, 아스널 이적 확정",
    { max: "official" },
    "recall",
    "중립 목록 — 수사 의문",
  ),
  k(
    "A-QUOTE",
    "'괴물' 김민재, 아스널 이적 확정",
    { status: "official" },
    "recall",
    "정상 — 국내 2곳",
  ),
  k(
    "A-QUOTE",
    "'충격' 김민재, 아스널 이적 무산",
    { status: "collapsed" },
    "recall",
    "정상",
  ),
  k("A-QUOTE", "'충격 반전' 김민재, 아스널 이적 확정", { max: "rumor" }),
  k(
    "A-QUOTE",
    "'대박!' 김민재, 아스널 이적 확정",
    { max: "official" },
    "recall",
    "정상",
  ),
  // B. 의심 낱말 — 재현율 손실(뜻 겹침)
  k(
    "B-LOSS",
    "'주장' 김민재, 아스널 이적 확정",
    { status: "official" },
    "recall",
    "주장 = 캡틴",
  ),
  k(
    "B-LOSS",
    "설 연휴 앞두고 김민재, 아스널 이적 확정",
    { max: "official" },
    "recall",
    "설 = 명절",
  ),
  k(
    "B-LOSS",
    "아스널, 보도자료 통해 김민재 영입 발표",
    { max: "official" },
    "recall",
    "보도자료 = 구단 발표",
  ),
  k(
    "B-LOSS",
    "김민재 부인 출산…아스널 이적 확정",
    { max: "official" },
    "recall",
    "부인 = 아내",
  ),
  // B. 의심 낱말 — 미탐(목록 밖 부인 표현)
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른 반박", { max: "rumor" }),
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른 '낭설'", { max: "rumor" }),
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른은 선 그어", { max: "rumor" }),
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른 '근거 없다'", {
    max: "rumor",
  }),
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른 '사실 아니었다'", {
    max: "rumor",
  }),
  k("B-MISS", "김민재, 아스널 이적 확정…바이에른 '말도 안 돼'", {
    max: "rumor",
  }),
  k("B-MISS", "아스널, 김민재 영입 확정…바이에른은 손사래", { max: "rumor" }),
  k(
    "B-MISS",
    "김민재, 아스널 이적 확정…현지 매체 전해",
    { max: "rumor" },
    "fp",
    "보도는 막고 '전해'는?",
  ),
  k(
    "B-MISS",
    "김민재, 아스널 이적 확정…獨 빌트",
    { max: "rumor" },
    "fp",
    "출처 꼬리",
  ),
  k("B-MISS", "김민재, 아스널 이적 확정 번복", { max: "rumor" }),
  e(
    "B-MISS",
    "Despite Arsenal denials, Bukayo Saka joins Chelsea",
    { max: "agreed" },
    "recall",
    "도입구 부인 — 긍정 주장",
  ),
  e("B-MISS", "Bukayo Saka joins Chelsea, says Romano", { max: "rumor" }),
  e(
    "B-MISS",
    "Bukayo Saka joins Chelsea - Sky Sports",
    { max: "agreed" },
    "recall",
    "피드 꼬리",
  ),
  e("B-MISS", "Bukayo Saka joins Chelsea - Arsenal dismiss", { max: "rumor" }),
  // C. 첫 절 판정
  k(
    "C-FIRST",
    "[오피셜] '쿠보 영입 완료'…이강인, PSG행",
    { max: "rumor" },
    "fp",
    "통째 인용 절 건너뜀",
  ),
  k("C-FIRST", "[오피셜] '레알 소시에다드' 쿠보…이강인, PSG행", {
    max: "rumor",
  }),
  k("C-FIRST", "[오피셜] 충격…쿠보 레알 이적…이강인, PSG행", { max: "rumor" }),
  k(
    "C-FIRST",
    "[오피셜] 드디어…김민재, 아스널행",
    { status: "official" },
    "recall",
    "정상",
  ),
  k(
    "C-FIRST",
    "[오피셜] 1000억…김민재, 아스널행",
    { max: "official" },
    "recall",
  ),
  k("C-FIRST", "[오피셜] '' 김민재, 아스널행", { max: "official" }, "recall"),
  e(
    "C-FIRST",
    "Official: Exclusive - Bukayo Saka joins Chelsea",
    { max: "official" },
    "recall",
    "정상",
  ),
  e("C-FIRST", "Official: Arsenal confirm - Bukayo Saka joins Chelsea", {
    max: "agreed",
  }),
  e("C-FIRST", "Official: Bukayo Saka joins Chelsea - Declan Rice next", {
    max: "agreed",
  }),
  // D. 꼬리 tail 그룹 출발 팀
  e(
    "D-TAIL",
    "Bukayo Saka joins Chelsea on loan from Arsenal",
    { from: "arsenal" },
    "recall",
    "정상",
  ),
  e(
    "D-TAIL",
    "Bukayo Saka joins Chelsea in £50m deal from Arsenal",
    { from: "arsenal" },
    "recall",
    "정상",
  ),
  e(
    "D-TAIL",
    "Here we go! Bukayo Saka to Chelsea from Arsenal, contract until 2030",
    { max: "agreed", from: "arsenal" },
    "recall",
  ),
  e("D-TAIL", "Bukayo Saka joins Chelsea on loan from Arsenal's academy", {
    max: "rumor",
  }),
  e(
    "D-TAIL",
    "Bukayo Saka joins Chelsea from Arsenal on loan from Real Madrid",
    { notFrom: "real-madrid" },
  ),
  e(
    "D-TAIL",
    "Lamine Yamal ficha por el Arsenal cedido por el Barcelona",
    { from: "barcelona" },
    "recall",
    "정상",
    "es",
  ),
  e(
    "D-TAIL",
    "Harry Kane è un nuovo giocatore del Milan in prestito dal Bayern",
    { from: "bayern-munchen" },
    "recall",
    "정상",
    "it",
  ),
  // E. 결정 B 조정 — joins … on a five-year deal
  e(
    "E-JOINS",
    "Bukayo Saka joins Chelsea on a five-year deal",
    { status: "agreed" },
    "recall",
    "정상",
  ),
  e(
    "E-JOINS",
    "Bukayo Saka joins Chelsea on a five-year deal until 2030",
    "none",
    "fp",
    "until → 생략",
  ),
  e(
    "E-JOINS",
    "Bukayo Saka officially joins Chelsea on a five-year contract",
    { status: "official" },
    "recall",
    "명시 — 정상",
  ),
  e(
    "E-JOINS",
    "Cole Palmer joins Chelsea on nine-year contract",
    { max: "agreed" },
    "recall",
    "재계약을 joins로 쓰지는 않음",
  ),
  e(
    "E-JOINS",
    "Bukayo Saka signs for Chelsea on a five-year deal",
    "none",
    "fp",
    "signs-form 길이 → 생략",
  ),
  e("E-JOINS", "Chelsea sign Bukayo Saka on a five-year deal", "none"),
  e(
    "E-JOINS",
    "Lamine Yamal ficha por el Arsenal por seis temporadas",
    { max: "agreed" },
    "recall",
    "",
    "es",
  ),
  // F. 금액이 움직임 근거가 되는 재계약 꼴
  e(
    "F-AMT",
    "Accordo totale tra il Milan e Rafael Leão per 7 milioni",
    { max: "rumor" },
    "fp",
    "연봉",
    "it",
  ),
  e(
    "F-AMT",
    "Acuerdo total entre el Barça y Lamine Yamal por 20 millones",
    { max: "rumor" },
    "fp",
    "연봉",
    "es",
  ),
  e("F-AMT", "Real Madrid in talks over €200m Vinícius Júnior deal", {
    max: "rumor",
  }),
  e(
    "F-AMT",
    "Arsenal agree £100m fee for Bukayo Saka",
    { status: "agreed" },
    "recall",
    "정상",
  ),
];

/** r4probes2.mts(표시용) — 4회차 차단 1에 따른 기대(다른 절의 부인·출처 꼬리 → rumor 이하, 목록 꼴 꼬리 → 그대로) */
export const REVIEW_PROBES_R4_EXTRA: R4Probe[] = [
  k("KO-OTHER", "김민재, 아스널 이적 합의…바이에른은 선 그어", {
    max: "rumor",
  }),
  k("KO-OTHER", "김민재, 아스널 이적 합의…바이에른 반박", { max: "rumor" }),
  k("KO-OTHER", "김민재, 아스널 이적 합의…獨 키커", { max: "rumor" }),
  k("KO-OTHER", "김민재, 아스널 이적 합의…로마노", { max: "rumor" }),
  k("KO-OTHER", "김민재, 아스널 이적 합의…바이에른 '협상 없었다'", {
    max: "rumor",
  }),
  k("KO-OTHER", "김민재, 아스널 이적 확정…바이에른 '사실과 달라'", {
    max: "rumor",
  }),
  k("KO-OTHER", "김민재, 아스널 이적 확정…바이에른 '틀렸다'", { max: "rumor" }),
  k("KO-OTHER", "김민재, 아스널 이적 확정…바이에른 '노코멘트'", {
    max: "rumor",
  }),
  k(
    "KO-OTHER",
    "김민재, 아스널 이적 확정…등번호 3번",
    { status: "official", to: "arsenal" },
    "recall",
  ),
  k(
    "KO-OTHER",
    "김민재, 아스널 이적 확정…이적료 1000억",
    { status: "official", to: "arsenal" },
    "recall",
  ),
  {
    ...k("KO-OTHER", "김민재, 아스널 이적 확정…바이에른 반박", {
      max: "rumor",
    }),
    src: KO1,
  },
  {
    ...k("KO-OTHER", "김민재, 아스널 이적 합의…바이에른 반박", {
      max: "rumor",
    }),
    src: KO1,
  },
];
