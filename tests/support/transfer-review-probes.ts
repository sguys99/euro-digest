/**
 * M1-18 2회차 적대적 재리뷰(2026-10-17)의 이적 오탐 시도 문장 — 리뷰 하네스(scratchpad review-m118b/probes.mts)를 그대로 옮긴 회귀 자료.
 * `exp`: "none" = transfer 없음 · `max` = 단계 상한 · `notTo` = 금지 행선지 · `to` = 기대 행선지(null = 없음) · `status` = 기대 단계.
 * 출처(리뷰어) 판정이며, 구현이 다르게 정한 항목은 tests/transfer-extract.test.ts의 `INTENDED`에 이유와 함께 적는다.
 */
type Exp =
  | "none"
  | {
      max?: string;
      notTo?: string;
      notCat?: string;
      notFrom?: string;
      to?: string | null;
      status?: string;
    };
export interface ReviewProbe {
  g: string;
  t?: string;
  l?: string;
  src?: string | string[];
  items?: Array<{
    title: string;
    lang: string;
    source?: string | string[];
    at?: string;
  }>;
  exp: Exp;
  note?: string;
}
const KO2 = ["interfootball-world", "footballist-football"]; // 서로 다른 국내 매체 2곳(묶음 하나)
export const REVIEW_PROBES: ReviewProbe[] = [
  // ── 1회차 차단 1 원문 + 변형
  {
    g: "R1-B1",
    t: "Jude Bellingham joins Real Madrid's injury list",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1",
    t: "Erling Haaland joins Manchester City squad for US tour",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1",
    t: "Mohamed Salah joins Liverpool legends in 250 club",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1",
    t: "Lamine Yamal signs for Barcelona fans",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "JUDE BELLINGHAM JOINS REAL MADRID'S INJURY LIST",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Jude Bellingham joins Real Madrid injury list.",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Mohamed Salah joins Liverpool in the 250 club",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Mohamed Salah joins Liverpool in exclusive 250 club",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Erling Haaland joins Manchester City for warm-weather training camp",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Jude Bellingham joins Real Madrid on the sidelines",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Harry Kane joins Bayern Munich on holiday in Ibiza",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Bukayo Saka joins Arsenal ahead of Chelsea clash",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Lamine Yamal signs for Barcelona in front of the fans",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Mohamed Salah joins Liverpool in mourning",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Harry Kane joins Bayern Munich in Champions League century club",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Harry Kane joins Bayern Munich: injury list grows to seven",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Erling Haaland joins Manchester City squad",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B1v",
    t: "Lamine Yamal ficha por el Barcelona de baloncesto como embajador",
    l: "es",
    exp: "none",
  },
  // ── 1회차 차단 2 원문 + 변형
  {
    g: "R1-B2",
    t: "Harry Kane scores as Bayern Munich confirm signing of defender",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Erling Haaland watches on as Manchester City complete signing",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Bayern Munich complete signing of striker to rival Harry Kane",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Arsenal agree fee for winger who idolised Bukayo Saka",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Bukayo Saka reacts as Arsenal agree fee for winger",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Harry Kane segna e il Milan trova l'accordo con il Bayern",
    l: "it",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Lamine Yamal celebra el acuerdo del Barcelona con un nuevo delantero",
    l: "es",
    exp: "none",
  },
  {
    g: "R1-B2",
    t: "Gol de Lamine Yamal mientras el Barcelona cierra el fichaje de un central",
    l: "es",
    exp: "none",
  },
  {
    g: "R1-B2",
    items: [
      {
        title: "김민재는 벤치, 바이에른은 수비수 영입 확정",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bayern Munich confirm signing of defender, Harry Kane scores",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Harry Kane scores and Bayern Munich confirm signing of defender",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Real Madrid confirm signing of Jude Bellingham's younger brother",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Arsenal complete signing of Bukayo Saka's England team-mate",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bayern Munich sign Harry Kane's former Tottenham teammate",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bayern Munich confirm signing of Harry Kane's new strike partner",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bukayo Saka has his say on Arsenal agreeing fee",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bukayo Saka is fit, Arsenal agree deal",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Harry Kane is delighted Bayern Munich have agreed deal",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Bukayo Saka reacts to Arsenal interest in winger",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Harry Kane segna, il Milan chiude per il difensore",
    l: "it",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Harry Kane in gol, intanto il Milan trova l'accordo con il Bayern",
    l: "it",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Lamine Yamal, feliz por el acuerdo del Barcelona",
    l: "es",
    exp: "none",
  },
  {
    g: "R1-B2v",
    t: "Lamine Yamal aplaude el fichaje del Barcelona",
    l: "es",
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [{ title: "김민재, 경쟁자 영입 확정", lang: "ko", source: KO2 }],
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [{ title: "이강인, 새 동료 영입 확정", lang: "ko", source: KO2 }],
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [
      {
        title: "김민재, 결장 속 바이에른 새 얼굴 영입 확정",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [
      {
        title: "김민재 결장, 바이에른 새 얼굴 영입 확정",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [{ title: "이강인, 동료 이적설에 한마디", lang: "ko", source: KO2 }],
    exp: "none",
  },
  {
    g: "R1-B2v",
    items: [
      {
        title: "[오피셜] 아스널, 김민재 영입 위해 수비수 방출",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: { max: "rumor" },
  },
  // ── 중요 3 here we go
  {
    g: "R1-I3",
    t: "Not here we go yet: Harry Kane to Arsenal",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3",
    t: "No here we go yet - Harry Kane to Arsenal still being negotiated",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3",
    t: "Harry Kane to Arsenal: here we go soon",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    t: "Harry Kane to Arsenal: here we go when documents are signed",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    t: "Harry Kane to Arsenal - here we go expected next week",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    t: "Harry Kane to Arsenal, here-we-go not yet",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    t: "HERE WE GO? Harry Kane to Arsenal",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    t: "Here we go... nearly: Harry Kane to Arsenal",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I3v",
    items: [
      {
        title: "김민재, 아스널 이적 '히어 위 고' 언제쯤",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: { max: "negotiating" },
  },
  // ── 중요 4 결렬
  {
    g: "R1-I4",
    items: [
      {
        title: "김민재, 아스널 이적설 속 바이에른 8강 불발",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: { max: "rumor" },
  },
  {
    g: "R1-I4",
    items: [
      {
        title: "첼시, 김민재 영입 추진",
        lang: "ko",
        source: "interfootball-world",
        at: "2026-10-17T00:00:00Z",
      },
      {
        title: "김민재 아스널 이적 무산",
        lang: "ko",
        source: KO2,
        at: "2026-10-17T03:00:00Z",
      },
    ],
    exp: { notTo: "chelsea" },
  },
  {
    g: "R1-I4v",
    items: [{ title: "김민재 아스널 이적 무산설", lang: "ko", source: KO2 }],
    exp: { max: "rumor" },
    note: "무산설 = 결렬 루머",
  },
  {
    g: "R1-I4v",
    items: [
      { title: "김민재, 16강 불발에도 아스널 이적설", lang: "ko", source: KO2 },
    ],
    exp: { max: "rumor" },
  },
  // ── 중요 5 국내 지난 이적
  { g: "R1-I5", t: "이강인 PSG행 이후 첫 골", l: "ko", exp: "none" },
  { g: "R1-I5", t: "이강인 PSG행 당시 비화 공개", l: "ko", exp: "none" },
  { g: "R1-I5", t: "PSG, 이강인 영입 당시 비화", l: "ko", exp: "none" },
  {
    g: "R1-I5",
    t: "나폴리, 김민재 영입 당시 이적료 공개",
    l: "ko",
    exp: "none",
  },
  { g: "R1-I5", t: "김민재 나폴리 이적 1주년", l: "ko", exp: "none" },
  {
    g: "R1-I5v",
    items: [
      { title: "이강인, PSG 입단식 당시 비화 공개", lang: "ko", source: KO2 },
    ],
    exp: "none",
  },
  {
    g: "R1-I5v",
    items: [
      { title: "이강인, PSG 이적 2년 만에 UCL 우승", lang: "ko", source: KO2 },
    ],
    exp: "none",
  },
  {
    g: "R1-I5v",
    items: [
      { title: "이강인 PSG 이적 신의 한 수였다", lang: "ko", source: KO2 },
    ],
    exp: "none",
  },
  {
    g: "R1-I5v",
    items: [
      { title: "'PSG 이적 효과' 이강인, 몸값 상승", lang: "ko", source: KO2 },
    ],
    exp: "none",
  },
  {
    g: "R1-I5v",
    t: "Was Harry Kane's Bayern Munich transfer worth it?",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-I5v",
    t: "Harry Kane's move to Bayern Munich is paying off",
    l: "en",
    exp: "none",
  },
  // ── 중요 6 T행 여행
  { g: "R1-I6", t: "이강인, 결승 앞두고 뮌헨행", l: "ko", exp: "none" },
  { g: "R1-I6", t: "이강인, UCL 결승 무대 뮌헨행", l: "ko", exp: "none" },
  { g: "R1-I6", t: "김민재, 리버풀행 전세기", l: "ko", exp: "none" },
  { g: "R1-I6", t: "바르셀로나행 열차 탄 이강인", l: "ko", exp: "none" },
  { g: "R1-I6", t: "이강인, 레알 마드리드행 버스 탑승", l: "ko", exp: "none" },
  { g: "R1-I6v", t: "김민재, 이적 대신 나폴리행 휴가", l: "ko", exp: "none" },
  {
    g: "R1-I6v",
    t: "이강인, 레알 마드리드행 선발 출격 유력",
    l: "ko",
    exp: "none",
  },
  { g: "R1-I6v", t: "이강인, 결장 확정에도 리버풀행", l: "ko", exp: "none" },
  { g: "R1-I6v", t: "김민재, 휴가지 나폴리행 확정", l: "ko", exp: "none" },
  // ── 중요 7 합성 명사
  { g: "R1-I7", t: "김민재 아스널 이적 금지 징계", l: "ko", exp: { to: null } },
  {
    g: "R1-I7",
    t: "김민재, 아스널 이적 자금 마련",
    l: "ko",
    exp: { to: null },
  },
  {
    g: "R1-I7",
    t: "김민재, 아스널 이적 시장 최대어",
    l: "ko",
    exp: { to: null },
  },
  {
    g: "R1-I7v",
    t: "김민재, 아스널 이적 루트 열렸다",
    l: "ko",
    exp: { to: null },
  },
  {
    g: "R1-I7v",
    t: "김민재, 아스널 이적설에 미소",
    l: "ko",
    exp: { to: null },
    note: "자기 이적설엔 to 허용 여지",
  },
  // ── 중요 8 부상 메디컬
  {
    g: "R1-I8",
    t: "Harry Kane passes medical test after injury scare",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8",
    t: "Harry Kane undergoes medical tests on knee",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8",
    t: "Harry Kane, visite mediche per l'infortunio al ginocchio",
    l: "it",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    t: "Harry Kane undergoes medical tests for concussion",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    t: "Harry Kane undergoes medical tests on shoulder",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    t: "Harry Kane undergoes medical tests after collision",
    l: "en",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    t: "Harry Kane, visite mediche dopo il colpo alla testa",
    l: "it",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    t: "Lamine Yamal pasa el reconocimiento médico por el pubis",
    l: "es",
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    items: [
      { title: "김민재, 바이에른 메디컬팀과 재활", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "R1-I8v",
    items: [
      { title: "김민재, 아킬레스건 메디컬 체크", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  // ── 권장 15
  {
    g: "R1-15",
    t: "Liverpool have signed off on Alexander Isak bid",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "R1-15",
    t: "Cole Palmer signs for Chelsea until 2033",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-15v",
    t: "Cole Palmer signs for Chelsea on deal running to 2033",
    l: "en",
    exp: "none",
  },
  {
    g: "R1-15v",
    t: "Cole Palmer signs for Chelsea until '33",
    l: "en",
    exp: "none",
  },
  // ── 명시 표현(official, Tier 2 단일 출처면 바로 official)
  {
    g: "EXPL",
    t: "Real Madrid confirm signing of Jude Bellingham will not happen",
    l: "en",
    exp: { max: "rumor" },
  },
  {
    g: "EXPL",
    t: "Real Madrid unveil new kit with Jude Bellingham",
    l: "en",
    exp: "none",
  },
  {
    g: "EXPL",
    t: "Arsenal to announce signing of Bukayo Saka",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Arsenal ready to announce signing of Bukayo Saka",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Arsenal preparing to confirm signing of Bukayo Saka",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Bukayo Saka to be unveiled as Arsenal signing",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Harry Kane Arsenal move confirmed as hoax",
    l: "en",
    exp: { max: "rumor" },
  },
  {
    g: "EXPL",
    t: "Harry Kane to Arsenal - official?",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Harry Kane to Arsenal: official?",
    l: "en",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Harry Kane ficha por el Arsenal: es oficial?",
    l: "es",
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    t: "Harry Kane, è ufficiale il rinnovo con il Bayern",
    l: "it",
    exp: "none",
  },
  {
    g: "EXPL",
    t: "È ufficiale: Harry Kane resta al Bayern",
    l: "it",
    exp: "none",
  },
  {
    g: "EXPL",
    items: [
      { title: "아스널, 김민재 영입 발표 임박", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "EXPL",
    items: [
      { title: "아스널, 김민재 영입 발표 앞둬", lang: "ko", source: KO2 },
    ],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [
      { title: "아스널, 김민재 영입 발표 연기", lang: "ko", source: KO2 },
    ],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [
      { title: "아스널, 김민재 영입 발표만 남았다", lang: "ko", source: KO2 },
    ],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [{ title: "김민재, 곧 아스널 입단 발표", lang: "ko", source: KO2 }],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [
      { title: "아스널, 김민재 공식 영입 제안", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "EXPL",
    items: [
      { title: "김민재, 바이에른에 공식 이적 요청", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "EXPL",
    items: [{ title: "김민재 아스널 오피셜 뜨나", lang: "ko", source: KO2 }],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [{ title: "김민재 아스널 이적…오피셜?", lang: "ko", source: KO2 }],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [{ title: "김민재, 아스널 입단식 연기", lang: "ko", source: KO2 }],
    exp: { max: "agreed" },
  },
  {
    g: "EXPL",
    items: [{ title: "김민재, 이적 허용 공식화", lang: "ko", source: KO2 }],
    exp: { max: "negotiating" },
  },
  {
    g: "EXPL-ok",
    t: "Arsenal confirm signing of Bukayo Saka",
    l: "en",
    exp: { status: "official" },
    note: "정상(재현율)",
  },
  {
    g: "EXPL-ok",
    items: [
      {
        title: "[오피셜] 김민재, 아스널 이적",
        lang: "ko",
        source: "interfootball-world",
      },
    ],
    exp: { max: "negotiating" },
    note: "국내 단일 Tier 3 → negotiating",
  },
  // ── 완료 동사(비명시)·국내 단계 표 과대
  {
    g: "STAGE",
    items: [{ title: "이강인, PSG 이적 확정적", lang: "ko", source: KO2 }],
    exp: { max: "negotiating" },
  },
  {
    g: "STAGE",
    items: [
      { title: "김민재, 아스널 입단 확정 수순", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "STAGE",
    items: [
      { title: "김민재, 아스널 영입 확정 단계", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "STAGE",
    items: [
      { title: "김민재, 이적 앞두고 새 둥지 물색", lang: "ko", source: KO2 },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "STAGE",
    items: [
      {
        title: "김민재, 새 둥지 찾아 이적 시장 나온다",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: { max: "negotiating" },
  },
  {
    g: "STAGE",
    items: [
      { title: "아스널, 김민재 품었다면 우승했다", lang: "ko", source: KO2 },
    ],
    exp: { max: "rumor" },
  },
  // ── 계약 기간 = 재계약
  {
    g: "UNTIL",
    t: "Here we go! Harry Kane to Arsenal, contract until 2030",
    l: "en",
    exp: { status: "agreed" },
    note: "(다) 손실 확인",
  },
  {
    g: "UNTIL",
    t: "Harry Kane al Milan fino al 2030",
    l: "it",
    exp: { status: "rumor" },
    note: "재현율 손실 확인",
  },
  {
    g: "UNTIL",
    items: [
      {
        title: "'HERE WE GO' 김민재, 아스널 이적 확정…2030년까지",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: { to: "arsenal" },
    note: "한국 선수 예외",
  },
  // ── 다른 선수·다른 팀으로 새는 경로
  {
    g: "LEAK",
    t: "Bayern Munich sign Bukayo Saka's England teammate",
    l: "en",
    exp: "none",
  },
  {
    g: "LEAK",
    t: "Former Arsenal target Bukayo Saka in talks with Chelsea",
    l: "en",
    exp: { notTo: "arsenal" },
  },
  {
    g: "LEAK",
    t: "One-time Liverpool target Florian Wirtz joins Bayern Munich",
    l: "en",
    exp: { notTo: "liverpool" },
  },
  {
    g: "LEAK",
    t: "Harry Kane and Bukayo Saka linked with Real Madrid",
    l: "en",
    exp: "none",
  },
  {
    g: "LEAK",
    t: "Rafael Leão lascia il Milan per l'Inter",
    l: "it",
    exp: { notTo: "ac-milan" },
  },
  {
    g: "LEAK",
    t: "Inter Milan eye Rafael Leão",
    l: "en",
    exp: { notTo: "ac-milan" },
  },
  {
    g: "LEAK",
    t: "Rafael Leão: Inter and Milan battle for star",
    l: "en",
    exp: { notTo: "ac-milan" },
  },
  {
    g: "LEAK",
    t: "Marcus Rashford leaves Manchester United for Manchester City",
    l: "en",
    exp: { to: "manchester-city" },
    note: "정상 — 같은 도시",
  },
  {
    g: "LEAK",
    t: "Atletico Madrid eye Real Madrid's Jude Bellingham",
    l: "en",
    exp: { to: "atletico-de-madrid" },
    note: "정상 — 같은 도시",
  },
  {
    g: "LEAK",
    items: [{ title: "인터밀란, 김민재 영입 추진", lang: "ko", source: KO2 }],
    exp: { to: "internazionale-milano" },
    note: "인터밀란 붙여 씀 → AC밀란 아님",
  },
  {
    g: "LEAK",
    items: [
      { title: "이강인, 아틀레티코 마드리드행 확정", lang: "ko", source: KO2 },
    ],
    exp: "none",
    note: "지금 소속팀",
  },
  {
    g: "LEAK",
    items: [
      { title: "이강인, PSG에서 아틀레티코로 이적", lang: "ko", source: KO2 },
    ],
    exp: "none",
  },
  {
    g: "LEAK",
    items: [
      {
        title: "김민재 나폴리 시절 동료, 아스널 이적 확정",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "LEAK",
    items: [
      {
        title: "이강인 PSG 시절 동료, 레알 이적 임박",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "LEAK",
    items: [
      {
        title: "김민재, 팀 동료 아스널 이적설에 '잘 되길'",
        lang: "ko",
        source: KO2,
      },
    ],
    exp: "none",
  },
  {
    g: "LEAK",
    t: "Ex-Arsenal man Bukayo Saka joins Chelsea",
    l: "en",
    exp: { notTo: "arsenal" },
    note: "정상 — 행선지 첼시",
  },
];
