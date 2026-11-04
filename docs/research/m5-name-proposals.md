# M5-16 미등록 고유명사 일괄 표기안 (v0.1)

> 작성 2026-11-04 KST · plan M5-16 · PRD FR-24 · CLAUDE §6.2(고유명사 코드 치환)·§1-7 · `.claude/commands/add-name.md` 절차 1~5단계
> **표기안만 만들었다. `configs/names.ko.json`은 바꾸지 않았다**(사용자 결정 2026-11-04 — 확인한 것만 반영). LLM·축구 API는 부르지 않았다. 근거는 WebSearch(이름당 1회 안팎)·영문 위키백과 langlinks API(한국어 문서명)·저장 카드 제목·국내 수집 피드 3곳 제목(각 1회)에서 모았다.

## 사용법

1. 각 표의 **`사용자 확인`** 칸에 다음 중 하나를 적는다.
   - `✅` — 굵게 적은 제안 한글을 그대로 받는다.
   - `①` 또는 `②` — '확인 필요' 행에서 후보 하나를 고른다.
   - 고친 표기(예: `구스타우 이삭센`) — 그 표기로 넣는다.
   - `보류` 또는 빈칸 — 이번에 넣지 않는다(빈칸은 **반영하지 않음**으로 본다).
2. 다음 단계(같은 에이전트에 맡겨도 된다)는 확인 칸이 채워진 행만 `configs/names.ko.json`에 넣는다. 형식은 §6 부록의 slug·en·note 머리말 안을 따른다.
3. 반영 뒤 `npm run validate -- --configs-only` → `npx vitest run tests/names-ko-dict.test.ts tests/names.test.ts tests/tag-names.test.ts tests/team-leagues.test.ts` → `npm run check`·`npm run build` 순으로 확인한다. 커밋은 `chore(config): names.ko 표기 N개 추가 — … (FR-24)`.
4. 반영 효과는 **다음 발행부터**다. 이미 발행한 브리핑(`data/briefs/`)은 다시 치환하지 않는다. 캐시(`unknown-names.json`)에서는 다음 prod 실행이 등록된 이름을 뺀다.

## 0. 요약

| 구분 | 수 |
|---|---|
| 새 항목 제안(선수) | **119명** |
| └ 신뢰 높음 | 53 |
| └ 신뢰 보통 | 50 |
| └ 확인 필요(후보 2개) | 16 |
| 기존 항목에 별칭 추가 제안 | 1 (`Sehrou Guirassy` → 세루 기라시, §3) |
| 등록 확인만(이미 사전에 있음) | 2 (`Tijjani Noslin`·`Samuel Mbangula Tshifunda`, §2 A 머리) |
| 별칭 정책 결정이 필요한 단일 토큰 이름 | 5 (`Isaac`·`Thiago`·`Bartra`·`Brugui`·`Adrián`, §3) |

- 묶음: A 브리핑 영문 잔존 9 · B 득점 순위 상위 71 · C unknown 빈도 상위 16 · D 한국 선수 소속팀 23.
- **확인 필요 16명**: Birligea(A1) · Barry(A4) · Rômulo(B6) · Evanilson(B15) · Aubameyang(B26, 이름 부분) · Brugui(B28) · Adrián(B29) · Lepaul(B35) · Archer(B37) · Wahi(B38) · Yassine(B44) · Namaso(B50) · Moreira(B62) · Çalhanoğlu(B64) · Mouriño(C6) · Arijon Ibrahimović(D21).
- **반영 시 예상 정확도**(M5-16 표본 20줄, `m5-brief-accuracy.md` 판정 기준 — 영문 잔존 = ❌, 사실·문법 ❌ 0건 유지 가정): 발행본 70% → 지금 사전으로 다시 치환 80% → **높음·보통만 반영 90%** → **확인 필요 2명(Birligea·Barry)까지 반영 100%**. 계산은 §4.
- 사전 대조: 119명의 영문 표기·한글·slug 모두 기존 `names.ko.json` 264항목과 겹치지 않는다(대소문자·악센트 무시 비교). 같은 성을 가진 기존 항목(애덤스·디아스·시메오네·페르난데스 등)은 전체 이름으로만 매칭되므로 충돌하지 않는다. 행마다 근거 칸에 적었다.

## 1. 대상과 방법

### 1.1 대상 고르기 (우선순위 순)
- **A** — `m5-brief-accuracy.md`에서 영문으로 남은 8명 + 그 기간 밖 브리핑(10-17~11-04, `data/briefs/`)에서 영문으로 남은 미등록 1명(`Pavel Kacor`).
- **B** — `data/competitions/*.json` 6개 대회 `scorers` 상위 20위 안의 미등록 선수(A와 겹치는 사람은 A에 둠).
- **C** — `data/cache/unknown-names.json`(437개, 갱신 2026-11-03T22:12Z) 빈도 3~5회인 미등록 선수 가운데 A·B 밖 16명.
- **D** — `configs/korean-players.json` 소속팀(바이에른·아틀레티코·뉴캐슬·브렌트퍼드·마인츠·우니온·묀헨글라트바흐·아우크스부르크·샬케)의 득점자(득점 순위·경기 원장 `data/matches/`) 가운데 미등록 23명.
- 팀은 캐시에 `Deportivo` 1건뿐이다(D46 결정 사항 — §3). 감독은 캐시에 없다. 모두 선수다.

### 1.2 근거 모으기
- **국내 매체 표기**: WebSearch로 '후보 한글 + 소속팀'을 찾아 제목·본문 표기와 매체·날짜를 적었다(포털 원문은 열지 않음 — CLAUDE §1-5). 저장 카드 271건·국내 피드 60건 제목도 grep했다.
- **위키백과 한국어 문서명**: en.wikipedia `prop=langlinks&lllang=ko`로 한 번에 조회했다(문서가 없으면 '위키 없음').
- **규범**: 국립국어원 외래어 표기법(해당 언어 세칙)을 출신 언어 발음과 함께 적었다.
- 같은 대상의 표기 변형(악센트 차이, `Thuram`/`Thuram-Ulien`, `Romulo Cruz`/`Rômulo José Cardoso da Cruz`)은 한 행에 묶었다. 사전 매칭은 대소문자·악센트를 무시하므로 악센트만 다른 표기는 별칭으로 넣지 않는다.

### 1.3 신뢰 등급
- **높음** — 국내 매체 2곳 이상(또는 매체 1곳 + 위키백과)이 같은 표기를 쓰고 매체 사이 이견이 없다. 규범과 다르면 근거에 '관용 우선'이라 적었다.
- **보통** — 위키백과·나무위키·규범만 일치하고 매체 제목은 확인하지 못했다. 또는 매체 다수 표기가 있지만 소수 이견이 있다(이견은 근거 칸에 적음).
- **확인 필요** — 매체·위키 표기가 갈려 우열이 분명하지 않거나, 데이터 이름의 동일인 여부를 확인하지 못했거나, 국내 근거가 없다. 후보 2개를 적었고 **추측으로 확정하지 않았다**. ①이 에이전트 추천이다.

## 2. 표기안

> 굵은 글씨 = 제안 한글. '확인 필요' 행은 ① 추천 / ② 대안. 출처 칸의 `unknown×N`은 캐시 `count`(prod 실행 횟수), `세리에A 5골(4위)`는 `data/competitions` 득점 순위(2026-11-04 기준), `브리핑 10-30#2`는 `data/briefs` 줄 키다.

**확인만** — `Tijjani Noslin`(티자니 노슬린)·`Samuel Mbangula Tshifunda`(사무엘 음방굴라)는 10-29 `/add-name` 3차(3f17446)에서 이미 등록했다. 지금 사전으로 해당 줄을 다시 치환하면 한글로 바뀌고 조사도 맞다(§4). 추가 작업 없음.

### A. 브리핑에서 영문으로 남은 이름 — 9명

| # | 영문 원형 | 종류 | 소속 | 출현 빈도·출처 | 제안 한글 | 근거 | 신뢰 | 사용자 확인 |
|---|---|---|---|---|---|---|---|---|
| A1 | Daniel Birligea | 선수 | 프로시노네 | 브리핑 10-30#2 · unknown×1 · 세리에A 2골 | ① 다니엘 비를리자 / ② 다니엘 비를리게아 | 국내 매체 표기 없음 · 위키백과 한국어 문서 없음. 루마니아어 Bîrligea [bɨrliˈdʒe̯a]의 'gea'는 [dʒa]라 발음 기반이면 '비를리자'(î를 규범대로 '으'로 적으면 '브를리자'). 나무위키·AiScore는 철자식 '비를리게아'·'비를리헤아'·'비를리지아'로 제각각 | 확인 필요 | |
| A2 | Leandro Cabrera | 선수 | 에스파뇰 | 브리핑 10-31#4 · unknown×1 | **레안드로 카브레라** | 풋볼리스트 '카브레라'(idxno=123740) · 나무위키 '레안드로 카브레라' · 스페인어 규범과 일치 | 높음 | |
| A3 | Andrea Pinamonti | 선수 | 라치오 | 브리핑 11-02#2 · unknown×1 · 세리에A 2골 | **안드레아 피나몬티** | 위키백과 '안드레아 피나몬티' · 마이데일리 2026-11-02(라치오 선두 기사) 본문 '피나몬티' | 높음 | |
| A4 | Thierno Barry | 선수 | 에버턴 | 브리핑 11-03#3 · unknown×5 · PL 4골(7위) | ① 티에르노 바리 / ② 티에르노 배리 | 이투데이 2026-11-03 제목 '바리 결승골'(etoday 2643384) vs 네이트(스포탈) 2026-03 '배리' · 나무위키 '티에르노 베리'. 프랑스어 발음은 '바리' | 확인 필요 | |
| A5 | Nicola Zalewski | 선수 | 아탈란타 | 브리핑 10-30#4(표본 밖) · unknown×1 | **니콜라 잘레프스키** | 위키백과 '니콜라 잘레프스키' · 폴란드어 규범(w→프) 일치 · 국내 매체 제목 확인 못 함 | 보통 | |
| A6 | Olivier Giroud | 선수 | 릴 | 브리핑 10-31#5(표본 밖) · unknown×7 · 리그1 3골 | **올리비에 지루** | 위키백과 '올리비에 지루' · 풋볼리스트 2025-09(idxno=201893) · 스포츠경향 2025-08-25 제목 '지루' | 높음 | |
| A7 | Fábio Silva | 선수 | 도르트문트 | 브리핑 11-01#3(표본 밖) · unknown×4 · 분데스 3골 | **파비우 실바** | 머니투데이·스포츠경향 2026-11-01 도르트문트전 기사 '파비우 실바'(일부 '파비오 실바') · 위키백과 '파비우 시우바'(포르투갈어 규범). 관용 우선 | 보통 | |
| A8 | Kai Havertz | 선수 | 아스널 | 브리핑 11-02#1(표본 밖) · unknown×3 · PL 3골 | **카이 하베르츠** | 매일일보·베스트일레븐(idxno=313667)·스포츠월드 2026-11-02 제목 '하베르츠' · 위키백과 '카이 하베르츠' | 높음 | |
| A9 | Pavel Kacor | 선수 | 슬라비아 프라하 | 브리핑 10-21(판정 기간 밖) · unknown×1 · UCL | **파벨 카초르** | 국내 표기 없음 · 영문 위키 문서 없음. 체코어 표기 세칙상 c·č 모두 'ㅊ'이라 원어가 Kacor든 Kačor든 '카초르', Pavel → '파벨'(발음 근거만) | 보통 | |

### B. 6개 대회 득점 순위 상위(미등록) — 71명

| # | 영문 원형 | 종류 | 소속 | 출현 빈도·출처 | 제안 한글 | 근거 | 신뢰 | 사용자 확인 |
|---|---|---|---|---|---|---|---|---|
| B1 | Ermedin Demirović | 선수 | 슈투트가르트 | unknown×5 · 분데스 5골(6위) · UCL 4골 | **에르메딘 데미로비치** | 위키백과 '에르메딘 데미로비치' · 나무위키·Livesport 같은 표기 | 보통 | |
| B2 | Antonio Nusa | 선수 | 라이프치히 | unknown×6 · 분데스 4골 | **안토니오 누사** | 위키백과·나무위키 '안토니오 누사' | 보통 | |
| B3 | Yuito Suzuki | 선수 | 프라이부르크 | unknown×5 · 분데스 4골 | **스즈키 유이토** | 스포츠경향 2026-08-31 제목 '스즈키 유이토' · 네이트 2026-08-31 · 위키백과 '스즈키 유이토'(일본 이름은 성-이름 순) | 높음 | |
| B4 | Igor Matanović | 선수 | 프라이부르크 | unknown×5(+×1) · 분데스 4골 | **이고르 마타노비치** | 위키백과 '이고르 마타노비치' · 스포츠경향 2026-08-31 개막전 기사 '이고르 마타노비치' | 높음 | |
| B5 | Maurice Krattenmacher | 선수 | 엘버스베르크 | unknown×8(최다) · 분데스 4골 | **모리스 크라텐마허** | 스포츠경향 2026-10-31(마인츠전) 본문 '모리스 크라텐마허' 1건 · 독일어 규범 일치 · 위키백과 한국어 문서 없음 | 보통 | |
| B6 | Rômulo<br>(별칭 안: Romulo Cruz, Rômulo José Cardoso da Cruz) | 선수 | 라이프치히 | unknown×5(+×2) · 분데스 4골 | ① 호물루 / ② 로물루 | 국내 표기 확인 못 함 · 영문 위키 'Rômulo (footballer, born 2001)'. 브라질 포르투갈어 어두 R=[h]라 규범은 '호물루', 일부 매체 관행 '로물루'. 데이터 이름이 셋으로 갈림(football-data 'Romulo Cruz') | 확인 필요 | |
| B7 | Dayot Upamecano | 선수 | 바이에른 뮌헨(김민재) | unknown×4 · 분데스 3골 | **다요 우파메카노** | OSEN·코리아데일리 2026-10-31 선발 기사 '우파메카노' · 위키백과 '다요 우파메카노' | 높음 | |
| B8 | Ibrahim Maza | 선수 | 레버쿠젠 | unknown×4 · 분데스 3골 | **이브라힘 마자** | 스포르티보미디어 제목 '이브라힘 마자'(idxno=15809) · 위키백과 '이브라힘 마자' | 높음 | |
| B9 | Joseph Scally<br>(별칭 안: Joe Scally) | 선수 | 묀헨글라트바흐(카스트로프) | unknown×5 · 분데스 3골 | **조 스캘리** | 위키백과 '조 스캘리' · 엑스포츠뉴스(빌트 인용) '스캘리'. 데이터는 'Joseph' — 관용 통칭 'Joe'로 표기하는 안 | 보통 | |
| B10 | Marcus Tavernier | 선수 | 본머스 | unknown×5 · PL 5골(3위) | **마커스 태버니어** | STN 제목 '태버니어 결승골'(idxno=205351) · 네이트 2026-10-25 제목 '태버니어 추가골' · 이투데이 '마커스 태버니어'(dict '마커스 래시포드'와 같은 Marcus 표기) | 높음 | |
| B11 | João Pedro | 선수 | 첼시 | unknown×5 · PL 5골(4위) | **주앙 페드루** | 풋볼리스트 제목 '페드루'(idxno=207529) · 네이트 2026-08-26 제목 '주앙 페드루' · 위키백과 '주앙 페드루' | 높음 | |
| B12 | Morgan Rogers | 선수 | 첼시 | unknown×5 · PL 5골(5위) | **모건 로저스** | 한국일보·스타뉴스 2026-07-22 제목 '모건 로저스'·'로저스' · 위키백과 '모건 로저스' | 높음 | |
| B13 | Rayan Cherki | 선수 | 맨체스터 시티 | unknown×6 · PL 4골 | **라얀 셰르키** | 풋볼리스트 제목 '셰르키 원더골'(idxno=205356) · 맨시티 한국어 공식 '셰르키' · 위키백과 '라얀 셰르키' | 높음 | |
| B14 | Bryan Mbeumo | 선수 | 맨체스터 유나이티드 | unknown×5 · PL 4골 | **브라이언 음뵈모** | 풋볼리스트 제목 '음뵈모'(idxno=203708) · OSEN·SBS '음뵈모' · 위키백과 '브라이언 음뵈모' | 높음 | |
| B15 | Evanilson | 선수 | 본머스 | unknown×5 · PL 4골 | ① 에바니우송 / ② 이바니우송 | 위키백과·나무위키 '이바니우송' vs Flashscore '에바니우송', 맨유 한국어 공식 '에바닐손'. 국내 매체 제목 확인 못 함 | 확인 필요 | |
| B16 | Jack Hinshelwood | 선수 | 브라이턴 | unknown×5 · PL 3골 | **잭 힌셜우드** | 나무위키 '잭 힌셜우드'(영어 표기법 -shel- → 셜) · STN 2023 제목 '힌셀우드' 1건 | 보통 | |
| B17 | Pascal Groß<br>(별칭 안: Pascal Gross) | 선수 | 브라이턴 | unknown×5 · PL 3골 | **파스칼 그로스** | OSEN(네이트 2026-01-03) 제목 '그로스 재영입' · 위키백과 '파스칼 그로스' | 높음 | |
| B18 | Kevin Schade | 선수 | 브렌트퍼드(김지수) | unknown×5 · PL 3골 | **케빈 샤데** | 위키백과 '케빈 샤데' · Livesport 같은 표기 · 매체 제목 확인 못 함 | 보통 | |
| B19 | Dominic Calvert-Lewin | 선수 | 리즈 유나이티드 | unknown×5 · PL 3골 | **도미닉 칼버트르윈** | 풋볼리스트 제목 '칼버트르윈'(idxno=205640) · MHN 2026-10-19 '칼버트르윈' vs 국제뉴스 '캘버트-루윈', 위키백과 '캘버트루인'. 매체 다수 관용 | 보통 | |
| B20 | Mohamed Belloumi | 선수 | 헐 시티 | unknown×5 · PL 3골 | **모하메드 벨루미** | 네이트 2026-09(사진 설명) '모하메드 벨루미' · 나무위키 같은 표기 · dict '모하메드 살라'와 같은 Mohamed 표기 | 보통 | |
| B21 | Ante Budimir | 선수 | 오사수나 | unknown×5 · 라리가 8골(4위) | **안테 부디미르** | STN 제목 '부디미르'(idxno=147000) · 위키백과 '안테 부디미르' | 높음 | |
| B22 | Yassir Zabiri | 선수 | 라싱 산탄데르 | unknown×6 · 라리가 8골(5위) | **야시르 자비리** | 나무위키 '야시르 자비리' 1곳 · 국내 매체 제목 확인 못 함 | 보통 | |
| B23 | Sergio Camello | 선수 | 라요 바예카노 | unknown×5 · 라리가 7골 | **세르히오 카메요** | 스포츠경향 2026-10-09 제목 '카메요' · 위키백과 '세르히오 카메요' | 높음 | |
| B24 | Roberto Fernández | 선수 | 에스파뇰 | unknown×5 · 라리가 6골 | **로베르토 페르난데스** | 마이데일리 2026-10-08(토트넘 관심 기사) '로베르토 페르난데스' · 나무위키 '로베르토 페르난데스(2002)' · 동명이인(2000년생 파라과이 수비수) 있음 — 같은 표기라 치환 충돌 없음 | 높음 | |
| B25 | Fer Niño<br>(별칭 안: Fernando Niño Rodríguez) | 선수 | 엘체 | unknown×5 · 라리가 6골 | **페르 니뇨** | 나무위키 '페르난도 니뇨'(통칭 '페르 니뇨') · 스페인어 규범 · 매체 제목 확인 못 함 | 보통 | |
| B26 | Pierre-Emerick Aubameyang | 선수 | 데포르티보 라코루냐 | unknown×5 · 라리가 5골 | ① 피에르에메릭 오바메양 / ② 피에르에므리크 오바메양 | 성 '오바메양'은 베스트일레븐(idxno=311899·312202)·스포츠경향 2026-08-31·09-14 제목에서 일치. 이름은 나무위키 '피에르에메릭'(매체 관행에 가까움) vs 위키백과 '피에르에므리크'(프랑스어 규범)로 갈림 | 확인 필요 | |
| B27 | Lucas Boyé | 선수 | 알라베스 | unknown×5 · 라리가 5골 | **루카스 보예** | 마이데일리 2026-10-10 본문 '루카스 보예' · 위키백과 '루카스 보예' | 높음 | |
| B28 | Brugui | 선수 | 레반테 | unknown×5 · 라리가 5골 | ① 브루기 / ② 로제르 브루게 | 데이터 이름 'Brugui'는 Roger Brugué의 별명(EFE·Infobae 2026-10-21 'Roger Brugué', 현지 'Brugui'). 국내 표기 없음. 단일 토큰 별칭 정책(§3)도 함께 정해야 함 | 확인 필요 | |
| B29 | Adrián | 선수 | 말라가 | unknown×5 · 라리가 5골 | ① 아드리안 / ② 아드리안 니뇨 | 데이터 이름이 'Adrián' 한 단어. 말라가 득점자는 Adrián Niño로 보임(말라가 공식·Flashscore 6경기 4골)이나 데이터로 동일인 확인 못 함. 단일 토큰 별칭 정책(§3) | 확인 필요 | |
| B30 | Mariano Díaz | 선수 | 알라베스 | unknown×5 · 라리가 4골 | **마리아노 디아스** | 마이데일리 2026-11-01 바르셀로나전 기사 '마리아노' · 나무위키 '마리아노 디아스' · 위키백과 '마리아노 디아스 메히아'(전체 이름). dict '루이스 디아스'와 성 같음 — 전체 이름 매칭이라 충돌 없음 | 높음 | |
| B31 | Luka Sučić | 선수 | 레알 소시에다드 | unknown×3 · 라리가 4골 | **루카 수치치** | 위키백과·나무위키 '루카 수치치' · 크로아티아어 규범 일치 | 보통 | |
| B32 | Álex Berenguer | 선수 | 아틀레틱 | unknown×3(+×2) · 라리가 4골 | **알렉스 베렝게르** | 위키백과 '알렉스 베렝게르' · 스페인어 규범 | 보통 | |
| B33 | Álvaro García | 선수 | 라요 바예카노 | unknown×6 · 라리가 3골 | **알바로 가르시아** | Flashscore 한국어 '알바로 가르시아' · 스페인어 규범 · 동명이인 다수(같은 표기라 충돌 없음) | 보통 | |
| B34 | Lassine Sinayoko | 선수 | 파리 FC | unknown×6 · 리그1 8골(1위) | **라신 시나요코** | 나무위키 '라신 시나요코' · 스포츠경향 2026-11-03 파리FC 기사(제목엔 이름 없음) | 보통 | |
| B35 | Esteban Lepaul | 선수 | 렌 | unknown×5 · 리그1 7골(2위) | ① 에스테반 르폴 / ② 에스테반 레폴 | 위키백과·나무위키 '레폴' vs Goal·에펨코리아 '르폴'. 프랑스어 규범(Le[lə] → 르)은 '르폴' | 확인 필요 | |
| B36 | Amine Gouiri | 선수 | 마르세유 | unknown×5 · 리그1 6골(3위) | **아민 구이리** | 위키백과·나무위키·Flashscore '아민 구이리' | 보통 | |
| B37 | Cameron Archer | 선수 | 오세르 | unknown×5 · 리그1 6골(4위) | ① 캐머런 아처 / ② 카메론 아처 | 인벤 '캐머런 아처'(영어 표기법) vs 나무위키·Soccer24 '카메론 아처'. 매체 제목 확인 못 함 | 확인 필요 | |
| B38 | Sepe Elye Wahi<br>(별칭 안: Elye Wahi) | 선수 | 니스 | unknown×5 · 리그1 6골(5위) | ① 엘리예 와히 / ② 엘리 와이 | 위키백과에 '엘리 와이'·'엘리예 와히' 문서가 둘 다 있음 · 나무위키·Soccer24 '엘리예 와히'. 데이터 이름 'Sepe Elye Wahi' | 확인 필요 | |
| B39 | Casper Tengstedt | 선수 | 툴루즈 | unknown×6 · 리그1 5골 | **카스페르 텡스테트** | 위키백과 '카스페르 텡스테트' | 보통 | |
| B40 | Louis Mafouta | 선수 | 르망 | unknown×5 · 리그1 4골 | **루이 마푸타** | 국내 표기 없음 · 프랑스어 발음(Louis [lwi] → 루이) | 보통 | |
| B41 | Kamory Doumbia | 선수 | 브레스트 | unknown×5 · 리그1 4골 | **카모리 둠비아** | 위키백과·나무위키 '카모리 둠비아' | 보통 | |
| B42 | Sebastian Szymański | 선수 | 렌 | unknown×5 · 리그1 4골 | **세바스티안 시만스키** | 위키백과·나무위키·인벤 '세바스티안 시만스키' · 폴란드어 규범 일치 · 매체 제목 확인 못 함 | 보통 | |
| B43 | Ferran Torres | 선수 | 파리 생제르맹 | unknown×7 · 리그1 4골 · UCL 3골 | **페란 토레스** | 네이트 2026-09-21 제목 '페란 토레스' · FIFA 한국어 기사 · 포포투 · 위키백과 '페란 토레스' | 높음 | |
| B44 | Gessime Yassine | 선수 | 스트라스부르 | unknown×5 · 리그1 4골 | ① 제심 야신 / ② 게심 야신 | 국내 표기 없음 · 프랑스어 'Gessime' 발음 출처 못 찾음(G 앞 e라 [ʒ]면 '제심') | 확인 필요 | |
| B45 | Ludovic Ajorque | 선수 | 브레스트 | unknown×5 · 리그1 4골 | **뤼도비크 아조르크** | 위키백과 '뤼도비크 아조르크' · 프랑스어 규범 · AiScore '루도비크' | 보통 | |
| B46 | Paris Brunner | 선수 | 모나코 | unknown×5 · 리그1 4골 | **파리스 브루너** | 나무위키 '파리스 브루너' | 보통 | |
| B47 | Ernest Nuamah | 선수 | 리옹 | unknown×5 · 리그1 4골 | **어니스트 누아마** | 위키백과 '어니스트 누아마' · Goal 한국어 · 이투데이 2026-10(리옹-팰리스) 본문 '누아마' | 높음 | |
| B48 | Josh Maja | 선수 | 르아브르 | unknown×5 · 리그1 4골 | **조시 마자** | 나무위키 '조시 마자' · 재경일보 2026-10-30 본문 '조시 마자' · Flashscore '조쉬'(규범상 '쉬' 불가) | 높음 | |
| B49 | Boulaye Dia | 선수 | 렌 | unknown×5 · 리그1 4골 | **불라예 디아** | 위키백과·나무위키 '불라예 디아' | 보통 | |
| B50 | Daniel Namaso<br>(별칭 안: Danny Namaso) | 선수 | 오세르 | unknown×5 · 리그1 3골 | ① 대니 나마소 / ② 대니얼 나마소 | 국내 표기 없음. 현지 통칭 'Danny Namaso'(Flashscore·FootMercato), 본명 Daniel Namaso Edi-Mesumbe Loader | 확인 필요 | |
| B51 | Marquinhos | 선수 | 파리 생제르맹 | unknown×5 · 리그1 3골 | **마르키뉴스** | STN 제목 'PSG 주장은 마르키뉴스'(idxno=208182) · 위키백과 '마르키뉴스' · 나무위키만 '마르퀴뇨스' | 높음 | |
| B52 | Nikola Krstović | 선수 | 아탈란타 | unknown×5 · 세리에A 6골(4위) | **니콜라 크르스토비치** | 이투데이 제목 '크르스토비치 멀티골'(2635036) · 위키백과 '니콜라 크르스토비치' | 높음 | |
| B53 | Anastasios Douvikas | 선수 | 코모 | unknown×7 · 세리에A 5골 · UCL 3골 | **아나스타시오스 두비카스** | 위키백과 '아나스타시오스 두비카스' · 네이트 2026-05-25 본문 '두비카스' | 높음 | |
| B54 | Adrien Rabiot | 선수 | 밀란 | unknown×5 · 세리에A 5골 | **아드리앙 라비오** | 포포투·베스트일레븐 2026-11 밀란 더비 기사 '아드리앙 라비오' · 위키백과 '아드리앵 라비오'(규범). 관용 우선 | 보통 | |
| B55 | Marcus Thuram<br>(별칭 안: Marcus Thuram-Ulien) | 선수 | 인테르 | unknown×5(+×2) · 세리에A 5골 | **마르쿠스 튀랑** | 네이트 2023-06-28 제목 '마르쿠스 튀랑' · 나무위키 '마르쿠스 튀랑' vs 위키백과 '마르퀴스 튀람'. 관용 우선 | 보통 | |
| B56 | Daniel Maldini | 선수 | 칼리아리 | unknown×6 · 세리에A 5골 | **다니엘 말디니** | 위키백과 '다니엘 말디니' · 이탈리아어 규범 | 보통 | |
| B57 | Giacomo Calò | 선수 | 프로시노네 | unknown×7 · 세리에A 5골 | **자코모 칼로** | 국내 표기 없음 · 이탈리아어 규범(Gia → 자, ò → 오) | 보통 | |
| B58 | Alphadjo Cissè | 선수 | 밀란 | unknown×5(+×1) · 세리에A 4골 | **알파조 시세** | 베스트일레븐(idxno=313179)·포포투(idxno=99380) 제목 '알파조 시세' · 일간스포츠 2026-10-29 | 높음 | |
| B59 | Che Adams | 선수 | 토리노 | unknown×7 · 세리에A 4골 | **체 애덤스** | 위키백과·나무위키 '체 애덤스' · Flashscore '체 아담스'. dict '아코르 애덤스'와 같은 Adams 표기(전체 이름 매칭이라 충돌 없음) | 보통 | |
| B60 | Milutin Osmajić | 선수 | 제노아 | unknown×3 · 세리에A 4골 | **밀루틴 오스마이치** | 나무위키 '밀루틴 오스마이치' · 몬테네그로어 규범 | 보통 | |
| B61 | Franco Mastantuono | 선수 | 피오렌티나 | unknown×2 · 세리에A 4골 | **프랑코 마스탄투오노** | 인터풋볼 제목(idxno=692095) · 베스트일레븐(idxno=312134) · 위키백과 '프랑코 마스탄투오노' | 높음 | |
| B62 | Diego Moreira | 선수 | 밀란 | unknown×4 · 세리에A 4골 | ① 디에구 모레이라 / ② 디에고 모레이라 | 위키백과·나무위키 '디에구 모레이라'(포르투갈어 규범) vs Soccerway·올풋볼 '디에고 모레이라'. 국적 벨기에(포르투갈계) — 매체 제목 확인 못 함 | 확인 필요 | |
| B63 | Gustav Isaksen | 선수 | 라치오 | unknown×4 · 세리에A 4골 | **구스타프 이삭센** | 마이데일리 2026-11-02 본문 '구스타프 이삭센' · Footboom 같은 표기 vs 위키백과 '구스타우 이삭센'(덴마크어 규범). 관용 우선 | 보통 | |
| B64 | Hakan Çalhanoğlu | 선수 | 인테르 | unknown×5 · 세리에A 3골 | ① 하칸 찰하놀루 / ② 하칸 찰하노을루 | 풋볼리스트가 시기마다 '찰하놀루'(idxno=151682)·'찰하노을루'(idxno=198615)를 함께 씀 · 네이트(OSEN) 2025-07 '찰하놀루' · 위키백과 문서도 두 이름이 있음 | 확인 필요 | |
| B65 | Davide Frattesi | 선수 | 라치오 | unknown×5 · 세리에A 3골 | **다비데 프라테시** | 위키백과·나무위키 '다비데 프라테시' · 이탈리아어 규범 | 보통 | |
| B66 | Nicolò Tresoldi | 선수 | 클럽 브뤼헤 | unknown×5 · UCL 4골(1위) | **니콜로 트레솔디** | 스포츠경향 2026-10-14 · 인터풋볼(idxno=697356) · 네이트 2026-10-17 '트레솔디' · Flashscore '니콜로 트레솔디' | 높음 | |
| B67 | Fabián Ruiz | 선수 | 파리 생제르맹 | unknown×2 · UCL 4골 | **파비안 루이스** | 뉴스핌·진일보 2026-11-04 '파비안 루이스' · 위키백과 '파비안 루이스' · 네이트 사진 설명 1건 '파비앙' | 높음 | |
| B68 | Luis Suárez | 선수 | 스포르팅 CP | unknown×6 · UCL 4골 | **루이스 수아레스** | 뉴시스 2026-01-21 제목 '수아레스 멀티 골 스포르팅' · 스포츠경향 2026-01-22 '루이스 수아레스'. 우루과이의 동명이인과 같은 표기라 치환 충돌 없음 | 높음 | |
| B69 | Aleksey Batrakov<br>(별칭 안: Aleksei Batrakov) | 선수 | 갈라타사라이 | unknown×2 · UCL 4골 | **알렉세이 바트라코프** | 나무위키 '알렉세이 바트라코프' · 러시아어 규범(Батраков) | 보통 | |
| B70 | Alexis Mac Allister | 선수 | 리버풀 | unknown×5 · UCL 3골 | **알렉시스 맥 알리스터** | 인터풋볼 2026-10-20·11-02 제목 '맥 알리스터'(저장 카드) · 위키백과 '알렉시스 마크 알리스테르'(규범). 관용 우선 | 높음 | |
| B71 | Matheus Cunha | 선수 | 맨체스터 유나이티드 | unknown×1 · UCL 3골 | **마테우스 쿠냐** | 인터풋볼 RSS 2026-11-04 제목 '쿠냐' · 위키백과 '마테우스 쿠냐' | 높음 | |

### C. unknown-names 빈도 상위(A·B 외) — 16명

| # | 영문 원형 | 종류 | 소속 | 출현 빈도·출처 | 제안 한글 | 근거 | 신뢰 | 사용자 확인 |
|---|---|---|---|---|---|---|---|---|
| C1 | Emiliano Buendía | 선수 | 애스턴 빌라 | unknown×5 | **에밀리아노 부엔디아** | 뉴시스 2026-05-21 사진 제목 '부엔디아' · 위키백과 '에밀리아노 부엔디아' | 높음 | |
| C2 | Ross Barkley | 선수 | 애스턴 빌라 | unknown×5 | **로스 바클리** | 위키백과 '로스 바클리' | 보통 | |
| C3 | Senny Mayulu | 선수 | 파리 생제르맹 | unknown×4 | **세니 마율루** | 풋볼리스트(idxno=198386) · 네이트 2026-10-27 사진 '마율루' · 위키백과 '세니 마율루' | 높음 | |
| C4 | Marc Bartra<br>(별칭 안: Bartra) | 선수 | 레알 베티스 | unknown×4 · 라리가·UCL 각 2골 | **마르크 바르트라** | 위키백과·Goal 한국어 '마르크 바르트라'. 데이터 이름은 성만('Bartra') — 별칭 정책(§3) | 보통 | |
| C5 | Carlos Augusto<br>(별칭 안: Carlos Augusto Lobaton) | 선수 | 인테르 | unknown×4(+×2) | **카를루스 아우구스투** | 위키백과·나무위키 '카를루스 아우구스투' · 올풋볼 '카를로스'. 'Carlos Augusto Lobaton'(football-data 득점 순위, 인테르)이 같은 선수인지는 데이터로만 추정 | 보통 | |
| C6 | Santiago Mouriño | 선수 | 비야레알 | unknown×4 · UCL 2골 | ① 산티아고 모우리뇨 / ② 산티아고 모리뇨 | Soccer24 '모리뇨' · 스페인어 규범(ou → 오우) '모우리뇨'. 매체 제목 확인 못 함 | 확인 필요 | |
| C7 | Nicolò Barella | 선수 | 인테르 | unknown×3 | **니콜로 바렐라** | 위키백과·나무위키 '니콜로 바렐라' | 보통 | |
| C8 | Piotr Zieliński | 선수 | 인테르 | unknown×3 | **피오트르 지엘린스키** | 스타뉴스 2024-02-07·오마이스타 본문 '지엘린스키' · 위키백과 '피오트르 지엘린스키' | 높음 | |
| C9 | Martin Baturina | 선수 | 코모 | unknown×3 | **마르틴 바투리나** | 이투데이 2026-10-28 본문 '마르틴 바투리나' · 위키백과·나무위키 같은 표기 | 높음 | |
| C10 | Gabriel Jesus | 선수 | 바르셀로나 | unknown×3 | **가브리엘 제주스** | 네이트 2026-09-01·스포츠경향 2026-09-03 제목 '가브리엘 제주스'·'제주스' · 위키백과는 '가브리에우 제주스'(규범). 관용 우선 | 높음 | |
| C11 | Matías Soulé | 선수 | 로마 | unknown×3 | **마티아스 소울레** | 스포츠경향 2026-11-04 본문 '마티아스 소울레' · 위키백과 '마티아스 소울레' | 높음 | |
| C12 | Rodrigo Mora | 선수 | 로마 | unknown×3 | **호드리구 모라** | 네이트 2026-08-19 제목 '호드리구 모라' · 풋볼리스트(idxno=213680) · 위키백과 | 높음 | |
| C13 | Niccolò Pisilli | 선수 | 로마 | unknown×3(+×2) | **니콜로 피실리** | 나무위키·Flashscore '니콜로 피실리' | 보통 | |
| C14 | Nico Paz | 선수 | 코모 | unknown×2 | **니코 파스** | 스포츠경향 2026-10-22 · 이투데이 제목 '니코 파스' · 위키백과 | 높음 | |
| C15 | Dani Olmo<br>(별칭 안: Daniel Olmo Carvajal) | 선수 | 바르셀로나 | unknown×2 | **다니 올모** | 위키백과 '다니 올모'. 데이터 이름은 본명 'Daniel Olmo Carvajal' | 보통 | |
| C16 | Tidiam Gomis | 선수 | 라이프치히 | unknown×3 · 분데스 3골 | **티디암 고미스** | 국내 표기 확인 못 함 · 프랑스어 규범 | 보통 | |

### D. 한국 선수 소속팀 주요 선수 — 23명

| # | 영문 원형 | 종류 | 소속 | 출현 빈도·출처 | 제안 한글 | 근거 | 신뢰 | 사용자 확인 |
|---|---|---|---|---|---|---|---|---|
| D1 | Joshua Kimmich | 선수 | 바이에른 뮌헨(김민재) | unknown×2 | **요주아 키미히** | OSEN·코리아데일리 2026-10-31 선발 기사 '요주아 키미히' · 위키백과 '요주아 키미히' | 높음 | |
| D2 | Aleksandar Pavlović | 선수 | 바이에른 뮌헨(김민재) | unknown×2 · 분데스 2골 | **알렉산다르 파블로비치** | OSEN 2026-10-31 '알렉산다르 파블로비치' · 머니투데이 2026-11-01 · 위키백과 | 높음 | |
| D3 | Konrad Laimer | 선수 | 바이에른 뮌헨(김민재) | unknown×2 | **콘라트 라이머** | OSEN 2026-10-31 '콘라트 라이머' · 위키백과 | 높음 | |
| D4 | Lennart Karl | 선수 | 바이에른 뮌헨(김민재) | unknown×1 | **레나르트 카를** | 문화일보·뉴시스 '레나르트 카를' · 위키백과 '레나르트 카를' · 네이트 2026-04-05 1건 '레나르트 칼' | 높음 | |
| D5 | Ismael Saibari | 선수 | 바이에른 뮌헨(김민재) | 데이터 득점 2골(unknown 없음) | **이스마엘 사이바리** | FIFA 한국어·머니투데이 2026-06-16 '사이바리' · OSEN 2026-10-31 · 위키백과 '이스마엘 사이바리' | 높음 | |
| D6 | Giuliano Simeone<br>(별칭 안: Giuliano Simeone Baldini) | 선수 | 아틀레티코 마드리드(이강인) | unknown×1 · 라리가 3골 | **줄리아노 시메오네** | 스포츠경향 2026-11-01 '줄리아노 시메오네' · 위키백과 · dict '지오반니 시메오네'(형)·'디에고 시메오네'(감독)와 이름이 달라 충돌 없음 | 높음 | |
| D7 | Jonathan David | 선수 | 아틀레티코 마드리드(이강인) | 데이터 득점 3골 | **조너선 데이비드** | 네이트 2026-08-31 · 스포츠경향 2026-11-01 '조너선 데이비드' · 위키백과 | 높음 | |
| D8 | Ademola Lookman | 선수 | 아틀레티코 마드리드(이강인) | unknown×1 | **아데몰라 루크먼** | 스포츠경향 2026-02-02 · 베스트일레븐 · 풋볼리스트 '루크먼' · 위키백과 | 높음 | |
| D9 | Anthony Elanga | 선수 | 뉴캐슬(박승수) | 데이터 득점 2골 | **앤서니 엘랑가** | 스타뉴스 2025-07-27·풋볼리스트·인터풋볼 '엘랑가'(성 일치) · 이름은 위키백과 '안토니'. 매체 기사에서 이름 표기는 확인 못 함 | 보통 | |
| D10 | Joe Willock | 선수 | 뉴캐슬(박승수) | 데이터 득점 2골 | **조 윌록** | 위키백과 '조 윌록' | 보통 | |
| D11 | Harvey Barnes | 선수 | 뉴캐슬(박승수) | 데이터 득점 2골 | **하비 반스** | 인터풋볼(idxno=638442) · 이투데이 · 일간스포츠 '하비 반스' · 위키백과 | 높음 | |
| D12 | Vitaly Janelt | 선수 | 브렌트퍼드(김지수) | 데이터 득점 2골 | **비탈리 야넬트** | 국내 표기 없음 · 독일어 규범(J → 야) | 보통 | |
| D13 | Jaidon Anthony | 선수 | 브렌트퍼드(김지수) | unknown×1 | **제이든 앤서니** | 위키백과·나무위키 '제이든 앤서니' | 보통 | |
| D14 | Benedict Hollerbach | 선수 | 마인츠(이재성) | unknown×1 · 분데스 2골 | **베네딕트 홀러바흐** | 포포투·미디어파인 2026-10-31 마인츠전 기사 본문 '베네딕트 홀러바흐' · 독일어 규범 | 보통 | |
| D15 | Sheraldo Becker | 선수 | 마인츠(이재성) | unknown×1 · 분데스 2골 | **셰랄도 베커르** | 마인츠-함부르크전 국내 기사 본문 '셰랄도 베커르' 1건 · 네덜란드어 규범(-er → 에르) | 보통 | |
| D16 | Janik Haberer | 선수 | 우니온 베를린(정우영) | unknown×2 · 분데스 2골 | **야니크 하베러** | 위키백과 우니온 베를린 선수 명단 '야니크 하베러' | 보통 | |
| D17 | Tim Skarke | 선수 | 우니온 베를린(정우영) | unknown×1 · 분데스 2골 | **팀 스카르케** | 2026-03 정우영 결승골 기사(엑스포츠뉴스·서울신문) 본문 '팀 스카르케' | 보통 | |
| D18 | Shuto Machino | 선수 | 묀헨글라트바흐(카스트로프) | 데이터 득점 2골 | **마치노 슈토** | 엑스포츠뉴스 2026 카스트로프 기사 '마치노 슈토' · 위키백과 '마치노 슈토'(일본 이름은 성-이름 순) | 높음 | |
| D19 | Hugo Bolin | 선수 | 묀헨글라트바흐(카스트로프) | 데이터 득점 2골 | **후고 볼린** | 국내 표기 없음 · 스웨덴어 규범 | 보통 | |
| D20 | Robin Fellhauer | 선수 | 아우크스부르크(설영우) | unknown×1 · 분데스 3골 | **로빈 펠하우어** | 마이데일리 2026-10-11 '펠하우어' · 인터풋볼(idxno=697360) '로빈 펠하우어' | 높음 | |
| D21 | Arijon Ibrahimović | 선수 | 아우크스부르크(설영우) | unknown×1 | ① 아리온 이브라히모비치 / ② 아리욘 이브라히모비치 | MHN 2026-10 포칼 기사 '이브라히모비치'(성만) · 이름 'Arijon' 표기 출처 없음 | 확인 필요 | |
| D22 | Rodrigo Ribeiro | 선수 | 아우크스부르크(설영우) | 데이터 득점 2골 | **호드리구 히베이루** | 인터풋볼(idxno=697360) '호드리구 히베이루' · 나무위키 같은 표기 | 높음 | |
| D23 | Robin Gosens | 선수 | 샬케(황희찬) | 데이터 득점 1골 | **로빈 고젠스** | 네이트(2026-09-13) 제목 '고젠스' · 스포츠경향 · 위키백과 '로빈 고젠스' | 높음 | |
## 3. 기존 항목 별칭 · 단일 토큰 이름 · 기타 (보고만)

| 데이터 이름 | 무엇 | 제안 | 결정할 것 |
|---|---|---|---|
| `Sehrou Guirassy` (unknown×5 · 분데스·UCL 득점 순위) | football-data 득점 순위의 철자 변형(h·r 자리 바뀜). 사전에는 `Serhou Guirassy` = 세루 기라시(확정 2026-10-23) | 기존 `serhou-guirassy` 항목 `en`에 별칭 추가 | ✅/보류: |
| `Isaac` (unknown×2 · 라리가 3골, 세비야) | football-data 짧은 이름 — 이미 등록한 `Isaac Romero`(이삭 로메로)로 보임 | 넣지 않음(추천) — 이름 한 단어라 다른 Isaac 오매칭 위험 | 별칭 정책: |
| `Thiago` (득점 순위 2골, 브렌트퍼드) | 이미 등록한 `Igor Thiago`(이고르 티아고)로 보임. 캐시에는 없음 | 넣지 않음(추천) — Thiago는 흔한 이름 | 별칭 정책: |
| `Bartra` · `Brugui` · `Adrián` | 데이터가 성(또는 별명) 한 단어로만 준다. B28·B29·C4 행 참고 | 전체 이름을 대표로 넣고 한 단어 별칭은 사용자 결정 뒤에만 | 별칭 정책: |
| `Deportivo` (team, unknown×1 · 브리핑 10-17) | 데포르티보 라코루냐 football-data 짧은 이름 — D46에서 `SHORT_NAME_NOT_ALIAS` 예외로 정한 것 | 변경 없음 | — |

- 선수 성만 있는 별칭(`Havertz`, `Giroud` 등)은 add-name 정책대로 넣지 않았다(M1-17 이월 — 사용자 미결정).
- 'X. 성' 축약 형태는 이번 대상에 없다(캐시 0건).
- 5대 리그 한국 선수 새 이름은 없다(`/add-player` 대상 없음).

## 4. 반영 시 예상 정확도 (표본 20줄)

같은 표본(`m5-brief-accuracy.md` §2 20줄)과 표본 밖 15줄을 `scripts/lib/names.ts`의 `buildNameIndex`·`substituteNames`·`unknownNamesInText`로 다시 치환해 영문 잔존을 셌다. 사전은 **메모리 안에서만** 표기안을 더했고 파일은 바꾸지 않았다. 사실·문법은 이미 20/20 ✅라 표기만 달라진다. `AC`(AC 밀란)는 허용 라틴 약칭이라 잔존으로 세지 않았다.

| 사전 | 표본 20줄 '모두 ✅' | 정확도 | 표본 밖 15줄 | 남는 영문 |
|---|---|---|---|---|
| 발행본(판정 문서 그대로) | 14 | 70% | 11/15 | — |
| 지금 사전(Noslin·Mbangula 등록 뒤) | 16 | 80% | 11/15 | Birligea · Cabrera · Pinamonti · Barry (+밖 4) |
| + 높음·보통만 반영 | 18 | **90%** | 15/15 | Birligea · Barry |
| + 확인 필요까지 반영 | 20 | **100%** | 15/15 | 없음 |

- 치환 결과 예: "라치오가 안드레아 피나몬티의 83분 결승골로…", "에스파뇰이 레안드로 카브레라의 60분 결승골로…", "프로시노네의 다니엘 비를리자가 멀티골을…"(① 기준), "에버턴이 티에르노 바리의 49분 결승골로…"(① 기준). 조사(이/가·의)는 모두 맞았다.
- 이 수치는 **이미 나온 줄을 다시 치환했을 때**의 값이다. 실제 KPI는 다음 주 표본(11-04~11-10)에서 새 이름이 얼마나 나오느냐에 달려 있다. 이번 119명은 득점 순위 상위·소속팀 핵심 선수라 다음 주 브리핑에 나올 이름의 상당 부분을 덮는다.

## 5. 반영 절차 메모 (다음 단계용)

- **위치**: 선수 묶음 끝(한국 선수 → 팀 → 선수 → 감독 순서 중 '선수' 끝)에 A→B→C→D 순서로 넣는다.
- **항목 형식**: `{ "ko", "en": [대표, 별칭…], "kind": "player", "slug", "note" }`. 대표 영문은 성·이름 전체(§6 부록). 별칭은 §6에 적은 것만 넣는다(악센트만 다른 표기는 넣지 않음).
- **note**: 머리말은 §6의 안(확실/관용, 확인 필요 행은 `확정(사용자 결정 YYYY-MM-DD)`)으로 시작하고, 이 문서 근거 칸의 매체·URL과 영문 출처(`영문: 데이터 API 득점 입력 '…'(unknown-names 2026-11-03)` 또는 `football-data 득점 순위 '…'`)를 적는다. D46 같은 기존 결정 ID는 쓰지 않는다.
- **slug**: 대표 영문에서 악센트를 떼고 kebab-case(§6). 기존 선수 slug와 겹치지 않음을 확인했다.
- **치환 미리보기**: add-name 7단계 명령으로 확인 필요 행(특히 단일 토큰 `Rômulo`·`Evanilson`·`Marquinhos`)이 다른 말에 맞지 않는지 본다.
- **코드 쪽 필요 없음**: `KNOWN_PLAYER_TEAMS`(축약 별칭 없음)·`AMBIGUOUS_TAG_TERMS`(겹치는 짧은 별칭 없음)를 고칠 일은 없다.

## 6. 부록 — 반영용 slug·en·note 머리말 안

| # | slug(안) | en(대표 → 별칭) | note 머리말(안) |
|---|---|---|---|
| A1 | `daniel-birligea` | Daniel Birligea | 확정(사용자 결정 날짜) |
| A2 | `leandro-cabrera` | Leandro Cabrera | 확실 |
| A3 | `andrea-pinamonti` | Andrea Pinamonti | 확실 |
| A4 | `thierno-barry` | Thierno Barry | 확정(사용자 결정 날짜) |
| A5 | `nicola-zalewski` | Nicola Zalewski | 확실 |
| A6 | `olivier-giroud` | Olivier Giroud | 확실 |
| A7 | `fabio-silva` | Fábio Silva | 관용 |
| A8 | `kai-havertz` | Kai Havertz | 확실 |
| A9 | `pavel-kacor` | Pavel Kacor | 확실 |
| B1 | `ermedin-demirovic` | Ermedin Demirović | 확실 |
| B2 | `antonio-nusa` | Antonio Nusa | 확실 |
| B3 | `yuito-suzuki` | Yuito Suzuki | 확실 |
| B4 | `igor-matanovic` | Igor Matanović | 확실 |
| B5 | `maurice-krattenmacher` | Maurice Krattenmacher | 확실 |
| B6 | `romulo` | Rômulo → Romulo Cruz, Rômulo José Cardoso da Cruz | 확정(사용자 결정 날짜) |
| B7 | `dayot-upamecano` | Dayot Upamecano | 확실 |
| B8 | `ibrahim-maza` | Ibrahim Maza | 확실 |
| B9 | `joseph-scally` | Joseph Scally → Joe Scally | 관용 |
| B10 | `marcus-tavernier` | Marcus Tavernier | 확실 |
| B11 | `joao-pedro` | João Pedro | 확실 |
| B12 | `morgan-rogers` | Morgan Rogers | 확실 |
| B13 | `rayan-cherki` | Rayan Cherki | 확실 |
| B14 | `bryan-mbeumo` | Bryan Mbeumo | 확실 |
| B15 | `evanilson` | Evanilson | 확정(사용자 결정 날짜) |
| B16 | `jack-hinshelwood` | Jack Hinshelwood | 확실 |
| B17 | `pascal-gross` | Pascal Groß → Pascal Gross | 확실 |
| B18 | `kevin-schade` | Kevin Schade | 확실 |
| B19 | `dominic-calvert-lewin` | Dominic Calvert-Lewin | 관용 |
| B20 | `mohamed-belloumi` | Mohamed Belloumi | 확실 |
| B21 | `ante-budimir` | Ante Budimir | 확실 |
| B22 | `yassir-zabiri` | Yassir Zabiri | 확실 |
| B23 | `sergio-camello` | Sergio Camello | 확실 |
| B24 | `roberto-fernandez` | Roberto Fernández | 확실 |
| B25 | `fer-nino` | Fer Niño → Fernando Niño Rodríguez | 확실 |
| B26 | `pierre-emerick-aubameyang` | Pierre-Emerick Aubameyang | 확정(사용자 결정 날짜) |
| B27 | `lucas-boye` | Lucas Boyé | 확실 |
| B28 | `roger-brugue` | Roger Brugué (→ Brugui는 §3 결정 뒤에만 — 데이터 이름이라 이것 없이는 매칭 안 됨) | 확정(사용자 결정 날짜) |
| B29 | `adrian-nino` | Adrián Niño (→ Adrián은 동일인 확인·§3 결정 뒤에만) | 확정(사용자 결정 날짜) |
| B30 | `mariano-diaz` | Mariano Díaz | 확실 |
| B31 | `luka-sucic` | Luka Sučić | 확실 |
| B32 | `alex-berenguer` | Álex Berenguer | 확실 |
| B33 | `alvaro-garcia` | Álvaro García | 확실 |
| B34 | `lassine-sinayoko` | Lassine Sinayoko | 확실 |
| B35 | `esteban-lepaul` | Esteban Lepaul | 확정(사용자 결정 날짜) |
| B36 | `amine-gouiri` | Amine Gouiri | 확실 |
| B37 | `cameron-archer` | Cameron Archer | 확정(사용자 결정 날짜) |
| B38 | `sepe-elye-wahi` | Sepe Elye Wahi → Elye Wahi | 확정(사용자 결정 날짜) |
| B39 | `casper-tengstedt` | Casper Tengstedt | 확실 |
| B40 | `louis-mafouta` | Louis Mafouta | 확실 |
| B41 | `kamory-doumbia` | Kamory Doumbia | 확실 |
| B42 | `sebastian-szymanski` | Sebastian Szymański | 확실 |
| B43 | `ferran-torres` | Ferran Torres | 확실 |
| B44 | `gessime-yassine` | Gessime Yassine | 확정(사용자 결정 날짜) |
| B45 | `ludovic-ajorque` | Ludovic Ajorque | 확실 |
| B46 | `paris-brunner` | Paris Brunner | 확실 |
| B47 | `ernest-nuamah` | Ernest Nuamah | 확실 |
| B48 | `josh-maja` | Josh Maja | 확실 |
| B49 | `boulaye-dia` | Boulaye Dia | 확실 |
| B50 | `daniel-namaso` | Daniel Namaso → Danny Namaso | 확정(사용자 결정 날짜) |
| B51 | `marquinhos` | Marquinhos | 확실 |
| B52 | `nikola-krstovic` | Nikola Krstović | 확실 |
| B53 | `anastasios-douvikas` | Anastasios Douvikas | 확실 |
| B54 | `adrien-rabiot` | Adrien Rabiot | 관용 |
| B55 | `marcus-thuram` | Marcus Thuram → Marcus Thuram-Ulien | 관용 |
| B56 | `daniel-maldini` | Daniel Maldini | 확실 |
| B57 | `giacomo-calo` | Giacomo Calò | 확실 |
| B58 | `alphadjo-cisse` | Alphadjo Cissè | 확실 |
| B59 | `che-adams` | Che Adams | 확실 |
| B60 | `milutin-osmajic` | Milutin Osmajić | 확실 |
| B61 | `franco-mastantuono` | Franco Mastantuono | 확실 |
| B62 | `diego-moreira` | Diego Moreira | 확정(사용자 결정 날짜) |
| B63 | `gustav-isaksen` | Gustav Isaksen | 관용 |
| B64 | `hakan-calhanoglu` | Hakan Çalhanoğlu | 확정(사용자 결정 날짜) |
| B65 | `davide-frattesi` | Davide Frattesi | 확실 |
| B66 | `nicolo-tresoldi` | Nicolò Tresoldi | 확실 |
| B67 | `fabian-ruiz` | Fabián Ruiz | 확실 |
| B68 | `luis-suarez` | Luis Suárez | 확실 |
| B69 | `aleksey-batrakov` | Aleksey Batrakov → Aleksei Batrakov | 확실 |
| B70 | `alexis-mac-allister` | Alexis Mac Allister | 관용 |
| B71 | `matheus-cunha` | Matheus Cunha | 확실 |
| C1 | `emiliano-buendia` | Emiliano Buendía | 확실 |
| C2 | `ross-barkley` | Ross Barkley | 확실 |
| C3 | `senny-mayulu` | Senny Mayulu | 확실 |
| C4 | `marc-bartra` | Marc Bartra (→ Bartra는 §3 결정 뒤에만) | 확실 |
| C5 | `carlos-augusto` | Carlos Augusto → Carlos Augusto Lobaton | 확실 |
| C6 | `santiago-mourino` | Santiago Mouriño | 확정(사용자 결정 날짜) |
| C7 | `nicolo-barella` | Nicolò Barella | 확실 |
| C8 | `piotr-zielinski` | Piotr Zieliński | 확실 |
| C9 | `martin-baturina` | Martin Baturina | 확실 |
| C10 | `gabriel-jesus` | Gabriel Jesus | 관용 |
| C11 | `matias-soule` | Matías Soulé | 확실 |
| C12 | `rodrigo-mora` | Rodrigo Mora | 확실 |
| C13 | `niccolo-pisilli` | Niccolò Pisilli | 확실 |
| C14 | `nico-paz` | Nico Paz | 확실 |
| C15 | `dani-olmo` | Dani Olmo → Daniel Olmo Carvajal | 확실 |
| C16 | `tidiam-gomis` | Tidiam Gomis | 확실 |
| D1 | `joshua-kimmich` | Joshua Kimmich | 확실 |
| D2 | `aleksandar-pavlovic` | Aleksandar Pavlović | 확실 |
| D3 | `konrad-laimer` | Konrad Laimer | 확실 |
| D4 | `lennart-karl` | Lennart Karl | 확실 |
| D5 | `ismael-saibari` | Ismael Saibari | 확실 |
| D6 | `giuliano-simeone` | Giuliano Simeone → Giuliano Simeone Baldini | 확실 |
| D7 | `jonathan-david` | Jonathan David | 확실 |
| D8 | `ademola-lookman` | Ademola Lookman | 확실 |
| D9 | `anthony-elanga` | Anthony Elanga | 확실 |
| D10 | `joe-willock` | Joe Willock | 확실 |
| D11 | `harvey-barnes` | Harvey Barnes | 확실 |
| D12 | `vitaly-janelt` | Vitaly Janelt | 확실 |
| D13 | `jaidon-anthony` | Jaidon Anthony | 확실 |
| D14 | `benedict-hollerbach` | Benedict Hollerbach | 확실 |
| D15 | `sheraldo-becker` | Sheraldo Becker | 확실 |
| D16 | `janik-haberer` | Janik Haberer | 확실 |
| D17 | `tim-skarke` | Tim Skarke | 확실 |
| D18 | `shuto-machino` | Shuto Machino | 확실 |
| D19 | `hugo-bolin` | Hugo Bolin | 확실 |
| D20 | `robin-fellhauer` | Robin Fellhauer | 확실 |
| D21 | `arijon-ibrahimovic` | Arijon Ibrahimović | 확정(사용자 결정 날짜) |
| D22 | `rodrigo-ribeiro` | Rodrigo Ribeiro | 확실 |
| D23 | `robin-gosens` | Robin Gosens | 확실 |
