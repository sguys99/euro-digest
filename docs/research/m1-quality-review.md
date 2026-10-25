# M1-43 첫 주간 품질 검수 — 브리핑 20줄 · 카드 20건

> 버전 v0.1 · `npm run quality:sample -- --from <시작> --to <끝> [--seed N]`이 이 문서를 다시 만든다 — 같은 키 행의 **판정·메모 칸은 옮겨지고** 집계는 그 판정으로 다시 센다. 표식(`<!-- … -->`) 밖에 적은 글은 다시 만들 때 사라지므로 메모는 표의 메모 칸에 적는다.

## 검수 방법 (plan M1-43, D23·D24)

- **브리핑 줄**: 줄을 '입력 사실'(refs가 가리키는 그날 입력 창의 경기 결과·득점 — football-data·경기 기록 원장)과 대조해 `판정(사실)`에 ✅/❌, 팀·선수 한글 표기(names.ko 치환·조사)를 `판정(고유명사)`에 ✅/❌. 입력에 없는 사실·수치·인용이 하나라도 있으면 사실 ❌(CLAUDE.md §1-7). 순위표 근거(`s…`)는 발행 시점 순위가 저장되지 않아 그날 순위를 따로 확인한다. 목표: 두 칸 모두 ✅인 줄 ≥ 90%.
- **카드**: 원제목만 보고 코드 분류가 맞는지 — `판정(cat)`(카테고리, D47) · `판정(태그)`(팀·선수 태그 빠짐·오태그) · `판정(이적)`(이적 카드가 아니면 '—'이 맞는지, 이적이면 단계·Tier) · `판정(spoiler)`(결과 노출 여부)에 ✅/❌. 틀리면 메모에 맞는 값을 적는다 → 규칙 보정 입력(classify.ts·transfer-patterns.ts).
- **자동 표시**(판정을 대신하지 않는다): 🔤 남은 라틴 문자 이름(미등록 고유명사 — `/add-name`) · 漢 한자·가나 혼입 · 🔗 refs 경기가 그 창의 종료 경기에 없음.
- 판정 칸 값: ✅(또는 O) = 맞음, ❌(또는 X) = 틀림 — **기호만** 넣는다(설명은 메모 칸). 그 밖의 값·빈 칸은 미판정으로 센다.

## 집계

<!-- quality:summary:start -->
표본 기간 **2026-10-17 ~ 2026-10-24** · 시드 1 · 생성 10월 25일 (일) 21:19 KST

- 브리핑 줄: 기간 30줄(AI 30) 중 20줄 — AI 줄 먼저, 모자라면 템플릿 줄 · 자동 표시가 붙은 줄 4
- 카드: 기간 314장 중 20장 — 카테고리 층별 돌아가며(result 3 · transfer 3 · injury 3 · club 3 · national 2 · ucl 3 · other 3). 비율 표본이 아니므로 정확도는 '규칙별 점검' 값으로 읽는다
- 경기 사실: football-data /v4/matches 6/6일(요청 6건) · 득점은 경기 기록 원장(2026-10 47경기)

| 구분 | 판정 완료 | ✅ | ❌ | 정확도 | 목표 |
|---|---|---|---|---|---|
| 브리핑 줄 — 사실·고유명사 모두 ✅ | 20 | 12 | 8 | 60% | ≥ 90% |
| 브리핑 줄 — 입력 사실 대조 | 20 | 20 | 0 | 100% | — |
| 브리핑 줄 — 고유명사(한글 표기) | 20 | 12 | 8 | 60% | — |
| 카드 — 4항목 모두 ✅ | 20 | 10 | 10 | 50% | 기록·규칙 보정 |
| 카드 — 카테고리(cat) | 20 | 12 | 8 | 60% | — |
| 카드 — 태그(팀·선수) | 20 | 18 | 2 | 90% | — |
| 카드 — 이적 단계 | 20 | 19 | 1 | 95% | — |
| 카드 — spoiler | 20 | 19 | 1 | 95% | — |
<!-- quality:summary:end -->

## 브리핑 줄

<!-- quality:brief:start -->
| 키 | 발행일 | # | 줄 | AI | refs | 입력 사실 | 자동 표시 | 판정(사실) | 판정(고유명사) | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|
| B:2026-10-17#1 | 2026-10-17 | 1 | 프로시노네가 Antonio Raimondo의 해트트릭을 앞세워 사수올로를 4-2로 꺾었다. | AI | m558573 | m558573: 세리에A 10.17 03:45 · Frosinone(프로시노네) 4-2 Sassuolo(사수올로) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ❌ | 골든 입력 10-17: 라이몬도 26'·30'·57' 해트트릭·4-2 일치 · 영문 잔존 'Antonio Raimondo'(당시 미등록 → 10-22 1차 '안토니오 라이몬도', 지금 사전 재치환 시 해소) |
| B:2026-10-17#2 | 2026-10-17 | 2 | 프로시노네는 승점 13으로 세리에 A 4위다. | AI | sSA | sSA: 세리에A 순위표 상위 4 — 발행 시점 값 미보관(수동 대조) | — | ✅ | ✅ | sSA = 골든 입력 10-17(봇과 같은 경로) 4위 프로시노네 승점 13 일치 |
| B:2026-10-17#5 | 2026-10-17 | 5 | 레반테가 Daniel Requena Sánchez의 82분 동점골로 Deportivo와 1-1로 비겼다. | AI | m564716 | m564716: 라리가 10.17 04:00 · Deportivo 1-1 Levante(레반테) · 득점: 원장에 연결된 경기 없음(확인 불가) | 🔤 Deportivo | ✅ | ❌ | 골든 입력: 63' Nsongo(데포르티보) → 82' 레케나 동점골 일치 · 영문 잔존 'Daniel Requena Sánchez'(10-22 '다니 레케나')·'Deportivo'(D46 별칭 제외 → 10-22 입력 정리로 '데포르티보 라코루냐') |
| B:2026-10-18#1 | 2026-10-18 | 1 | 바이에른 뮌헨이 Luis Díaz의 해트트릭을 앞세워 라이프치히를 6-1로 완파했다. | AI | m565825 | m565825: 분데스 10.18 01:30 · Bayern(바이에른 뮌헨) 6-1 RB Leipzig(라이프치히) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ❌ | 득점 입력 미보관(원장은 10-19 UTC부터) — 해트트릭은 BBC 제목 'Diaz hat-trick fires Bayern'·발행 시 검사기 통과로 확인, 6-1 일치 · 영문 잔존 'Luis Díaz'(이후 등록 '루이스 디아스') |
| B:2026-10-18#2 | 2026-10-18 | 2 | 리버풀이 알렉산더 이삭의 70분 결승골로 브렌트포드에 2-1 역전승을 거뒀다. | AI | m560611 | m560611: EPL 10.17 23:00 · Brentford(브렌트포드) 1-2 Liverpool(리버풀) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 1-2 원정 승·역전 = football-data + BBC 'Liverpool come from behind' · 이삭 70'은 원장 저장 전이라 독립 대조 불가(발행 시 검사기 FR-29 통과) |
| B:2026-10-18#3 | 2026-10-18 | 3 | 바르셀로나가 레알 베티스를 5-2로 완파했다. | AI | m564713 | m564713: 라리가 10.18 01:30 · Real Betis(레알 베티스) 2-5 Barça(바르셀로나) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 2-5 원정 승 일치 |
| B:2026-10-20#2 | 2026-10-20 | 2 | 몬차가 칼리아리를 4-0으로 완파했다. | AI | m558576 | m558576: 세리에A 10.20 01:30 · Monza(몬차) 4-0 Cagliari(칼리아리) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장 4-0 일치 |
| B:2026-10-20#3 | 2026-10-20 | 3 | 토리노가 파르마를 3-0으로 완파했다. | AI | m558578 | m558578: 세리에A 10.20 03:45 · Parma(파르마) 0-3 Torino(토리노) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장 0-3 원정 승 일치 |
| B:2026-10-20#4 | 2026-10-20 | 4 | 헤타페가 Martin Satriano의 56분 동점골로 라요 바예카노와 1-1로 비겼다. | AI | m564717 | m564717: 라리가 10.20 04:00 · Getafe(헤타페) 1-1 Rayo Vallecano(라요 바예카노) · 득점: 11' Álvaro García (Rayo Vallecano) ← Jorge De Frutos, 56' Martin Satriano(마르틴 사트리아노) (Getafe) ← Francho Serrano Gracia | — | ✅ | ❌ | 원장: 11' 알바로 가르시아(라요) → 56' 사트리아노 동점골 일치 · 영문 잔존 'Martin Satriano'(10-23 2차 등록) |
| B:2026-10-21#1 | 2026-10-21 | 1 | 파리 생제르맹이 Vitinha의 81분 결승골로 바르셀로나를 4-2로 꺾었다. | AI | m575367 | m575367: UCL 10.21 04:00 · PSG(파리 생제르맹) 4-2 Barça(바르셀로나) · 득점: 38' Désiré Doue(데지레 두에) (Paris Saint Germain) ← João Neves, 55' Xavi Espart (Barcelona) ← Fermín López, 72' Lucas Hernández (Paris Saint Germain) ← Désiré Doue(데지레 두에), 79' Lamine Yamal(라민 야말) (Barcelona), 81' Vitinha(비티냐) (Paris Saint Germain), 86' Fabián Ruiz (Paris Saint Germain) ← Achraf Hakimi(아슈라프 하키미) | — | ✅ | ❌ | 원장: 81' 비티냐 = 3-2 → 최종 4-2, 결승골 일치 · 영문 잔존 'Vitinha'(10-23 2차 등록) |
| B:2026-10-21#2 | 2026-10-21 | 2 | 맨체스터 시티가 필 포든의 해트트릭을 앞세워 AEK 아테네를 5-1로 완파했다. | AI | m575361 | m575361: UCL 10.21 04:00 · Man City(맨체스터 시티) 5-1 PAE AEK(AEK 아테네) · 득점: 원장에 연결된 경기 없음(확인 불가) | 🔤 AEK | ✅ | ✅ | 원장: 포든 34'·65'·76' 해트트릭 일치 · 'AEK 아테네'는 국내 관용 표기(🔤 AEK는 약칭 — 오탐) |
| B:2026-10-21#4 | 2026-10-21 | 4 | 슬라비아 프라하가 Pavel Kacor의 90분 동점골로 페네르바체와 2-2로 비겼다. | AI | m575360 | m575360: UCL 10.21 01:45 · Fenerbahçe(페네르바체) 2-2 Slavia Praha(슬라비아 프라하) · 득점: 원장에 연결된 경기 없음(확인 불가) | 🔤 Pavel Kacor | ✅ | ❌ | 원장: 0-2에서 15' 프로보드·90' 카초르 — 동점골 일치 · 영문 잔존 'Pavel Kacor'(보류 — /add-name 결정 필요) |
| B:2026-10-21#5 | 2026-10-21 | 5 | 도르트문트가 Serhou Guirassy의 53분 결승골로 Sabah FK를 2-1로 꺾었다. | AI | m575359 | m575359: UCL 10.21 01:45 · Sabah FK 1-2 Dortmund(도르트문트) · 득점: 원장에 연결된 경기 없음(확인 불가) | 🔤 Sabah FK | ✅ | ❌ | 원장: 10' 기라시·39' McCarthy(Sabah)·53' 기라시 = 2-1 결승골 일치 · 영문 잔존 'Serhou Guirassy'(10-23 2차 등록)·'Sabah FK'(D46 보류) |
| B:2026-10-22#1 | 2026-10-22 | 1 | 라이프치히를 4-1로 완파한 레알 마드리드는 승점 9로 UEFA 챔피언스리그 4위다. | AI | m575370 sUCL | m575370: UCL 10.22 04:00 · Real Madrid(레알 마드리드) 4-1 RB Leipzig(라이프치히) · 득점: 43' Bernardo Silva (Real Madrid), 52' Arda Güler (Real Madrid) ← Kylian Mbappé(킬리안 음바페), 83' Kylian Mbappé(킬리안 음바페) (Real Madrid) ← Yan Diomande, 85' Tidiam Gomis (RB Leipzig) ← Christoph Baumgartner, 87' Yan Diomande (Real Madrid) ← Brahim Díaz / sUCL: UCL 순위표 상위 4 — 발행 시점 값 미보관(수동 대조) | — | ✅ | ✅ | 원장 4-1 일치 · sUCL: MD2 전체 표(골든 10-15) + MD3 원장 18경기로 재계산 — 레알 마드리드 승점 9·득실 +5·득점 10으로 4위(리버풀 9·+5·12가 3위) 일치 |
| B:2026-10-22#2 | 2026-10-22 | 2 | 코모가 맨체스터 유나이티드를 4-1로 완파했다. | AI | m575368 | m575368: UCL 10.22 01:45 · Como 1907(코모) 4-1 Man United(맨체스터 유나이티드) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장 4-1 일치 |
| B:2026-10-22#3 | 2026-10-22 | 3 | 맨체스터 유나이티드의 Joshua Zirkzee가 90+1분 만회골을 넣었다. | AI | m575368 | m575368: UCL 10.22 01:45 · Como 1907(코모) 4-1 Man United(맨체스터 유나이티드) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ❌ | 원장: 4-0 뒤 90+1' 지르크지 만회골 일치 · 영문 잔존 'Joshua Zirkzee'(10-23 2차 등록) |
| B:2026-10-22#5 | 2026-10-22 | 5 | 클럽 브뤼헤가 랑스를 3-0으로 제압했다. | AI | m575373 | m575373: UCL 10.22 04:00 · Club Brugge(클럽 브뤼헤) 3-0 RC Lens(랑스) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장 3-0 일치 |
| B:2026-10-24#1 | 2026-10-24 | 1 | 니스가 브레스트 원정에서 2-1 역전승을 거뒀다. | AI | m559654 | m559654: 리그1 10.24 03:45 · Brest(브레스트) 1-2 Nice(니스) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장: 15' 아조르크(브레스트) 선제 → 61'·83' 니스 — 원정 역전승 일치 |
| B:2026-10-24#3 | 2026-10-24 | 3 | 토리노가 몬차를 3-2로 꺾었다. | AI | m558567 | m558567: 세리에A 10.24 03:45 · Torino(토리노) 3-2 Monza(몬차) · 득점: 원장에 연결된 경기 없음(확인 불가) | — | ✅ | ✅ | 원장 3-2 일치 |
| B:2026-10-24#5 | 2026-10-24 | 5 | 바르셀로나는 승점 27로 라리가 선두다. | AI | sLL | sLL: 라리가 순위표 상위 4 — 발행 시점 값 미보관(수동 대조) | — | ✅ | ✅ | sLL: 골든 10-17 바르셀로나 24(2위 아틀레티코 19) + 10-18 베티스전 승 = 27, 그 뒤 바르셀로나 라리가 경기 없음(원장) → 선두 일치 |
<!-- quality:brief:end -->

## 카드 분류

<!-- quality:cards:start -->
| 키 | 발행일 | 원제목 | 출처 | lang | cat | comp | 태그(팀·선수) | 이적 | spoiler | kr | imp | 판정(cat) | 판정(태그) | 판정(이적) | 판정(spoiler) | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c_b0f3acf6f6 | 2026-10-18 | Diaz hat-trick fires Bayern to win in Kane's 100th Bundesliga game | BBC Sport | en | result | BUNDESLIGA | bayern-munchen(바이에른 뮌헨) | — | Y | N | 4 | ✅ | ❌ | ✅ | ✅ | Diaz·Kane 선수 태그 빠짐 — 사전은 'Luis Díaz'·'Harry Kane' 전체 이름만(성 별칭 정책 미정, M1-17 이월) |
| c_364bcbf1d0 | 2026-10-22 | [UCL REVIEW] ‘김민재 전반만 뛰고 교체 OUT’ 바이에른 뮌헨, 홈에서 아스널과 2-2 무승부 | 인터풋볼 | ko | result | UCL | bayern-munchen(바이에른 뮌헨), arsenal(아스널), kim-min-jae(김민재) | — | Y | Y | 4 | ✅ | ✅ | ✅ | ✅ | — |
| c_ef652db8eb | 2026-10-23 | Breaking down Man Utd's tactics after Fernandes' criticism | BBC Sport | en | result | EPL, UCL | manchester-united(맨체스터 유나이티드) | — | Y | N | 4 | ❌ | ✅ | ✅ | ❌ | 전술 해설 — 'breaking down'의 down이 주어 있는 승패 표현으로 읽혀 result·spoiler(맞는 값: UCL 피드면 ucl, 아니면 기타 · spoiler N) → 보정함(제외 표현) |
| c_7402d4eee7 | 2026-10-17 | 🚨 Nico Williams agent on Liverpool, Barcelona chasing €88m Spurs star, Arsenal leading contenders for hat-trick hero, & more | the Daily Briefing | en | transfer | EPL, LALIGA | liverpool(리버풀), barcelona(바르셀로나), tottenham-hotspur(토트넘), arsenal(아스널) | — | Y | N | 2 | ✅ | ✅ | ✅ | ✅ | 묶음 제목(선수 1명 아님) — 이적 정보 없음이 맞음 · spoiler는 'hat-trick hero'(경기 사건 표현 — FR-21 보수적) |
| c_d097ad3ee7 | 2026-10-21 | 韓 축구 초대박, 김민재에게 AC밀란이 제대로 꽂혔다! 1월 영입 낙관론까지 등장…그런데 '연봉 150억'이 걸림돌 “상당한 양보 필요” | 인터풋볼 | ko | transfer | SERIEA, BUNDESLIGA | ac-milan(AC 밀란), kim-min-jae(김민재) | — | N | Y | 4 | ✅ | ✅ | ❌ | ✅ | rumor(김민재 → AC 밀란) 미탐 — '꽂혔다'·'영입 낙관론'이 소문 표 밖이고 선수·키워드가 다른 절(보수적 미탐, 오탐 아님) |
| c_7dfd32260e | 2026-10-24 | '울버햄튼서 26경기 2골→샬케 임대로 반등 도전' 황희찬, 5경기 만에 선발 보인다..."제코 대신 HWANG 선발이 가장 유력" | 인터풋볼 | ko | transfer | BUNDESLIGA | hwang-hee-chan(황희찬) | — | Y | Y | 4 | ❌ | ❌ | ✅ | ✅ | 선발 전망 기사인데 지난 임대 서술('샬케 임대로 반등 도전')로 이적(맞는 값: 기타) · 샬케 태그 빠짐 — 사전 ko '샬케04'뿐('샬케' 별칭 없음) · spoiler는 '2골'(시즌 기록 — 보수적) |
| c_81f0f56f5d | 2026-10-20 | Guehi among players not to take knee - is it time to 'move campaign along'? | BBC Sport | en | injury | EPL | — | — | N | N | 3 | ❌ | ✅ | ✅ | ✅ | 무릎 꿇기 의식('take knee')의 knee로 부상(맞는 값: 기타) → 보정함 · Guehi는 사전 미등록 |
| c_519ae98a9e | 2026-10-21 | [속보] 이강인 UCL 결장 이유 밝혀졌다! 허벅지 타박상에 출전 불발…“예방 차원에서 워밍업조차 하지 않았다” | 인터풋볼 외 1 | ko | injury | LALIGA, UCL | lee-kang-in(이강인) | — | Y | Y | 4 | ✅ | ✅ | ✅ | ✅ | 제목만으로는 '타박상'이 부상 표 밖(묶음 다른 제목이 부상) → 보강함 |
| c_8bd4207394 | 2026-10-23 | 韓 국대 은퇴설 이어 부상까지 발목 잡아...안 풀리는 김민재, 아스널전 조기 교체→"하베르츠 잘 막고 빅매치 선발 증명 중이었는데" 獨 매체 아쉬움 | 인터풋볼 | ko | injury | EPL, BUNDESLIGA | arsenal(아스널), kim-min-jae(김민재) | — | Y | Y | 2 | ✅ | ✅ | ✅ | ✅ | 하베르츠는 사전 미등록 · spoiler '조기 교체'(경기 사건) |
| c_d70f24ca82 | 2026-10-21 | “맨유 감독 하고 싶나?” 질문받은 파브레가스, “답하지 않겠다” 답변…왜? “캐릭에 대한 존중 없어서” | 인터풋볼 | ko | club | EPL | manchester-united(맨체스터 유나이티드) | — | Y | N | 2 | ✅ | ✅ | ✅ | ✅ | 캐릭·파브레가스는 감독(태그 대상은 팀·선수뿐) · spoiler Y는 요약문 근거(D39 ① — 설계상 허용) |
| c_edb30fe19d | 2026-10-21 | Premier League front-of-shirt gambling sponsor ban 'barely scratched the surface', study finds | The Athletic | en | club | EPL | — | — | N | N | 2 | ✅ | ✅ | ✅ | ✅ | 리그 스폰서 규제 — 감독·구단(운영·규제) 허용 |
| c_1875804e2f | 2026-10-23 | '떠난 이강인도 걱정할 정도인데’…PSG 핵심 선수 3명 줄부상에 엔리케 감독 근심 폭발 “오늘 경기에서 가장 나쁜 일” | 인터풋볼 | ko | club | LALIGA, LIGUE1 | paris-saint-germain(파리 생제르맹), lee-kang-in(이강인) | — | Y | Y | 4 | ❌ | ✅ | ✅ | ✅ | '줄부상'을 못 읽고 '감독'으로 감독·구단(맞는 값: 부상) → 보정함 · spoiler Y는 요약문 근거 |
| c_def7ffc91f | 2026-10-20 | Ronaldo given 30-day suspension and £215 fine by Portuguese FA | BBC Sport 외 1 | en | national | — | — | — | N | N | 3 | ✅ | ✅ | ✅ | ✅ | 포르투갈 협회 징계 — 대표팀(설계 예시 'Ronaldo suspended by Portugal')·감독·구단 둘 다 허용 · Ronaldo 미등록 |
| c_dbeb32ec58 | 2026-10-22 | Ranking UEFA, la classifica dopo la Champions League: l'Italia guadagna posizioni | Gianluca Di Marzio | it | national | SERIEA, UCL | — | — | N | N | 3 | ❌ | ✅ | ✅ | ✅ | UEFA 국가 랭킹(클럽 대항전 계수)인데 'Italia'로 대표팀(맞는 값: ucl) — 키워드 제외로는 국가 이름을 지울 수 없어 미보정(제안) |
| c_3aa4c75a67 | 2026-10-21 | McTominay si riprende il Napoli: dopo lo stop, la doppietta contro il Bodo/Glimt che riaccende la Champions | Gianluca Di Marzio 외 1 | it | ucl | SERIEA, UCL | ssc-napoli(나폴리), fk-bodo-glimt(보되/글림트) | — | Y | N | 3 | ❌ | ✅ | ✅ | ✅ | 'la doppietta contro il Bodo/Glimt' — 경기 기사인데 결과 표현이 없어 ucl(맞는 값: 결과) — 미보정(제안: 'doppietta contro'+팀) · McTominay 미등록 |
| c_dcbfc8d8e4 | 2026-10-21 | Arsenal criticism comes from very small minority - Arteta | BBC Sport | en | ucl | EPL, UCL | arsenal(아스널) | — | N | N | 4 | ✅ | ✅ | ✅ | ✅ | UCL 피드 기자회견 — 출처 대회 근거 ucl 허용 · 아르테타는 감독 |
| c_bcd3d50af3 | 2026-10-22 | ‘챔피언스리그인데 2만석이 텅텅’ 맨시티, 실력에 비해서 인기는 그닥?...마레스카는 “팬들의 응원 최고였다” | 인터풋볼 | ko | ucl | EPL, UCL | manchester-city(맨체스터 시티) | — | Y | N | 2 | ✅ | ✅ | ✅ | ✅ | UCL 관중 이야기 — ucl · 마레스카는 감독 · spoiler Y는 요약문 근거 |
| c_0fa11c755b | 2026-10-18 | Liverpool players in 'delicate' situation with 'demanding' schedule - Iraola | BBC Sport | en | other | EPL | liverpool(리버풀) | — | Y | N | 3 | ✅ | ✅ | ✅ | ✅ | 감독 발언 — 기타(D47 ① 보수적, 감독 이름 규칙은 제안) · spoiler Y는 요약문 근거 |
| c_5cfc9dd953 | 2026-10-20 | Udinese, confermata la fiducia a Kosta Runjaic: le ultime | Gianluca Di Marzio | it | other | SERIEA | udinese-calcio(우디네세) | — | N | N | 2 | ❌ | ✅ | ✅ | ✅ | 감독 신임('confermata la fiducia a') — 맞는 값: 감독·구단 → 보정함 |
| c_fe575e76fb | 2026-10-24 | The spectre of Antonio Conte looms over Manchester United. Should they press the button? | The Athletic | en | other | EPL | manchester-united(맨체스터 유나이티드) | — | N | N | 2 | ❌ | ✅ | ✅ | ✅ | 감독 교체설(콘테) — 맞는 값: 감독·구단, 키워드 없음(감독 이름 규칙 제안) · Conte 미등록 |
<!-- quality:cards:end -->

## 결과·원인·개선안 (2026-10-25 검수 기록)

> 이 절은 표식 밖이다 — `quality:sample`로 문서를 다시 만들면 사라지므로 다시 돌리기 전에 옮긴다(표의 판정·메모 칸은 옮겨진다). 표본: 지난 7개 호(2026-10-17·18·20·21·22·23·24 — 10-23은 브리핑 empty, 사용자 결정 2026-10-24: 정시 발행 관찰과 별개로 진행).

### 1. 브리핑 20줄 (FR-22·FR-24, D24)

- **사실 20/20(100%)** — 스코어·승패·득점자·분·결승골/동점골/만회골 해석·원정/역전·순위 서술이 모두 입력과 일치, 입력 밖 사실 0. 대조 근거: 경기 기록 원장(10-19 UTC부터 47경기 — 도구 자동 연결은 5/14경기, 나머지는 킥오프·팀으로 손 연결), 골든 입력 10-17(그날 득점·순위 — 봇과 같은 경로), football-data 결과(도구 6일). 순위 줄 3개: sSA는 골든 10-17, sUCL은 MD2 전체 표(골든 소스 10-15) + MD3 원장 18경기로 다시 계산(레알 마드리드 승점 9·득실 +5·득점 10 → 4위, 리버풀 9·+5·12가 3위), sLL은 골든 10-17(바르셀로나 24) + 10-18 베티스전 승 = 27 → 선두. 10-18 득점자·분 2줄(디아스 해트트릭·이삭 70')은 원장 저장 전이라 BBC 제목('Diaz hat-trick fires Bayern'·'Liverpool come from behind')과 발행 시 검사기(FR-29) 통과로만 확인.
- 표본 밖 10줄도 같은 방법으로 확인 — 사실 10/10(기간 30줄 사실 오류 0).
- **고유명사(발행본) 12/20(60%)** — ❌ 8줄 모두 미등록 이름의 영문 잔존(조사 오류·한자·오기 0). → '사실·고유명사 모두 ✅' **60% — 발행본 기준 ≥ 90% 미달**.
- **지금 사전 기준**(1차 10-22·2차 10-23 반영 뒤 같은 출력 문장에 지금 configs로 `substituteNames` 재치환): 표본 영문 잔존 8 → 3줄 — 10-17#5 'Deportivo'(저장분 — 지금 파이프라인은 입력 정리(D46 보완)로 '데포르티보 라코루냐'가 나온다) · 10-21#4 'Pavel Kacor'(보류) · 10-21#5 'Sabah FK'(D46 보류). → **현재 규칙 기준 18/20 = 90%(경계 통과)**, 보류 2건 등록 시 20/20. 기간 30줄: 영문 잔존 12줄 → 3줄. 'AEK 아테네'의 🔤 AEK는 국내 관용 약칭(오탐).
- 원인: 검사기는 입력에 있는 영문 이름을 허용 목록으로 통과시킨다(FR-24 — 미등록 이름은 영문 그대로 + unknown-names 적재). 시즌 초 UCL·하위 팀 득점자의 사전 등록이 발행보다 늦었다. 검사기를 통과한 사실 오류는 없다 — 지시문 수정·`eval:prompt` 회귀는 필요 없다.
- 개선안(제안만):
  1. **/add-name 주기화** — 발행 다음 날 unknown-names 중 그날 브리핑에 나온 이름 우선(1·2차로 14 → 3 효과 확인). 🙋 보류 2건(Pavel Kacor·Sabah FK 표기) 사용자 결정.
  2. **선제 등록** — football-data `/v4/competitions/{code}/scorers`(대회당 1요청, 6요청)로 득점 상위자·UCL 리그 페이즈 팀 이름을 한 번에 후보로 → /add-name(토큰 0).
  3. (선택 — FR-24 변경, 사용자 결정) 발행 직전 AI 줄에 사람 이름이 영문으로 남으면 그 줄을 '이름 없는 같은 근거 템플릿'으로 바꾸는 옵션 — 득점자 정보 손실 대 영문 노출. 테스트 초안:

     ```ts
     // tests/brief-check.test.ts (채택 시)
     it("사람 이름이 영문으로 남은 AI 줄 → 같은 근거의 이름 없는 템플릿 줄(ai:false)", () => {
       const text = "슬라비아 프라하가 Pavel Kacor의 90분 동점골로 페네르바체와 2-2로 비겼다.";
       expect(unknownNamesInText(text, NAMES)).toEqual(["Pavel Kacor"]);
       // 기대: refs m575360의 템플릿 — "슬라비아 프라하가 페네르바체와 2-2로 비겼다."(ai:false)
     });
     ```
  4. **도구 보강** — `quality-sample.ts` `findLedgerMatch`가 팀 id 대응만 써서 원장 연결 5/14경기. 브리핑 입력의 근거 연결(`linkMatchDetails` — 킥오프·스코어)을 함께 쓰면 손 대조가 줄어든다.

### 2. 카드 20건 (FR-21·FR-31, D23·D47)

- 표본 20장(카테고리 층별 — 비율 추정이 아니라 규칙 점검 값): **cat 12/20(60%) · 태그 18/20(90%) · 이적 단계 19/20(95%) · spoiler 19/20(95%)** · 4항목 모두 10/20(50%).
- cat ❌ 8 → 이번에 보정 4(무릎 꿇기 'take knee' → 부상 오탐 · 'breaking down' → 결과 오탐 · '줄부상' 미인식 · 'fiducia a' 감독 신임) → 같은 표본 보정 뒤 **cat 16/20(80%), spoiler 20/20**. 남은 4는 키워드로 안전하게 못 고친다: 황희찬 선발 전망의 지난 임대 서술('샬케 임대로 반등 도전' → 이적), UEFA 국가 랭킹의 'Italia' → 대표팀, 'la doppietta contro il Bodo/Glimt' → ucl(결과가 맞음), 콘테 감독설 → 기타(감독·구단이 맞음).
- 태그 ❌ 2: 성 별칭 'Diaz'·'Kane'(사전은 전체 이름만 — 성 별칭 정책 미정, M1-17 이월), '샬케'(사전 ko '샬케04'뿐) → /add-name 후보. 감독(캐릭·아르테타·마레스카 등)은 태그 대상(팀·선수)이 아니라 판정에서 뺐다.
- 이적 ❌ 1: '김민재에게 AC밀란이 제대로 꽂혔다! 1월 영입 낙관론' rumor 미탐(보수적 — 오탐 아님). 기간 이적 카드 34장 중 transfer 정보 1장 — 대표 제목 기준 건너뛴 이유: 등록 선수 없음 24(해외 선수 대부분 미등록·성만 표기) · 단계 표현 없음 6 · 묶음 2 · 재계약 1(중계권 입찰 — 보정 뒤 이적 아님). 단계 재현율은 선수 사전 범위가 정한다(M1-18 이월 — M4-01 전 관찰 유지).
- spoiler: Y 근거가 요약문(D39 ①)인 4장은 제목만으로 안 보여도 설계상 허용. 과잉 1('breaking down') 보정.

### 3. 기간 전체 '기타' 비율 (D47 ① 목표 ≤ 30%)

- **발행분 149/314 = 47.5%** — 언어별 ko 34/116(29.3%) · en 70/142(49.3%) · it 43/54(79.6%) · es 2/2, 날짜별 31%(10-22)~69%(10-24).
- 보강 뒤 재분류(대표 제목 + 출처 대회만 — 묶음의 다른 제목·요약문은 저장되지 않아 근사. 보강 전 같은 입력 재분류 = 157장 50.0%로 발행분과 10장 다름): **157 → 133장(50.0% → 42.4%)**, 발행분 기준 추정 **149 → 129장(47.5% → 41.1%) — ≤ 30% 미달**. 변경 40장(기타 → 다른 카테고리 27 · 다른 카테고리끼리 10 · → 기타 3, spoiler 7 — 결과 미탐 6 해소·과잉 1 해소)을 하나씩 확인 — **새 오분류 0**(원래 틀렸던 '영입생' 카드는 이적 → 감독·구단('선수단')으로 여전히 경계). 기간 밖(10-12~14·10-25, 63장) 변경 1장('공격진 줄부상' → 부상, 정당).
- 남은 기타 133장: 인터뷰 인용 제목(Di Marzio 'Team, 이름: "…"'·BBC '… - 이름') 23 · 사전 감독 이름이 든 제목 24(겹침 빼고 합 43) · 선발 명단·프리뷰 9 · 해설·기획·화제. 그중 '분명히 다른 카테고리'인 제목 약 25장(감독 교체설·문형으로만 보이는 경기 기사·금액 소문) — 키워드로는 보수 원칙을 깨야 잡힌다.
- 🙋 제안(큰 규칙 변경) → **사용자 결정(2026-10-25): A** — 단 감독 표기 확장은 /add-name 절차(표기안 → 사용자 확인)가 필요해 이번 보정에는 넣지 않았다(감독 항목 20~30명 확장 뒤 인용 머리 규칙 — plan M1-43 이월):
  - **A. 감독 발언 → 감독·구단**: names.ko `manager` 항목(지금 13명 — 세리에 A·분데스리가·리그 1 감독 20~30명 보강 필요) 이름이 제목 주어이거나 인용 머리(`Team, 감독: "…"`·`… - 감독`)면 감독·구단. 국내 제목의 '감독' 키워드와 같은 기준. 예상 기타 −35~43장 → 약 29~31%. 위험: 동명 선수(시메오네 — 디에고 감독·지오반니/줄리아노 선수), 감독이 말하는 경기 내용. 비용: 토큰 0, 반나절 + 사전 보강.
  - **B. 목표 재설정**: 이 서비스의 기타는 프리뷰·인터뷰·기획이 본래 많다 — 카테고리 추가 없이(D47) 목표 ≤ 40%로 바꾸고 A는 보류.
  - 추천: **A**(감독 사전 보강과 함께) — 국내·해외 판정 기준이 같아지고 필터 칩이 쓸모 있어진다.
  - 작은 후보: 'UEFA 계수·랭킹' 제목은 국가 이름을 대표팀 근거로 보지 않기(classify.ts 몇 줄) · 'doppietta contro' + 팀 태그 = 결과 · 해외 'EXCL:'·금액('€90m star') 소문 제목 = 이적 · 국내 '복귀전'·'복귀 임박'(부상 복귀와 친정 복귀가 겹쳐 보류).

### 4. 규칙 보정 내용 (`scripts/lib/news-keywords.ts` — 다음 수집부터 적용, 기존 data는 그대로)

스키마·카테고리 추가·LLM 사용 없음. D47 ① '불확실하면 기타' 유지 — 뜻이 분명한 표현만 넣고 같은 낱말의 다른 쓰임을 제외 표현과 테스트로 막았다.

| 표 | 추가 | 제외 |
|---|---|---|
| `TRANSFER_TERMS`(+ `TRANSFER_STRONG_TERMS` 제외 공유) | ko '리턴설' · en 'done deal(s)' | en 'sign of' · 중계권 입찰 문형('invite(s/d) bids for new'·'bids for tv/broadcast(ing)/media rights'·'tv/broadcast rights bids') · 'far from a/not (yet) a/isn't a/no done deal' · ko '사전에 합의된'·'사전에 합의한'·'영입생'·'이적생' |
| `RESULT_TERMS` | en 'come(s)/came out on top'(경기 전 법조동사 꼴 'can/will … come out on top'은 `MODAL_RESULT_PHRASES`로 경기 전 기사) · ko '연속 무승'·'무승 수렁'·'무승 늪'(`RESULT_WEAK_TERMS`에도 — 경기 전 표현과 함께면 결과 아님) | — |
| `RESULT_CONTEXT_TERMS`(주어 필요) | en 'held at home'·'humbled by'·'nets double/brace'·'double/brace helps' · it 'ribalta'·'ribaltano'·'regala (i) tre punti' · ko '결승골'·'극장골' | en 'breaking down'·'broken down' · 협상 결렬 구('talks break(s)/broke down'·'negotiations break/broke down'·'deal/move breaks/broke down' — 맨 'break down'은 결과 숙어라 남긴다) · 'humbled by' + 감사 대상(support·fans·nomination·award·reception 등) · it 'alla ribalta'·'ribalta(no) la sentenza/il verdetto/la decisione' |
| `INJURY_TERMS` | en 'taken to hospital'·'hospitalised/ized'·'could/will be out for'·'out for two~eight·several·up to·weeks·months·the season·the rest of'·'a doubt' · it 'fuori per'·'coscia'·'polpaccio'·'flessore/i'·'adduttore'·'affaticamento'·'distorsione'·'contusione'·'problema/i muscolare/i' · ko '타박상'·'허벅지/무릎/발목 타박'·'통증'·'시즌 아웃'(붙여 쓴 '시즌아웃'도 맞음)·'감염'·'구급차'·'병원 이송', 합성어 '줄부상' | en 'take(s)/taking/took/taken (the/a) knee' 계열 · 'without/beyond/shadow of/never/not a doubt'·'cast(s)/casting a doubt' · 'out for revenge/blood/redemption' · it 'fuori per scelta/squalifica/somma/turnover/mano/motivi/un soffio/lutto' |
| `CLUB_TERMS` | en 'resign'·'bans'·'suspension'·'suspended'·'director of football'·'football director'·'technical director'·감독 일 구('return(s/ed/ing) to management'·'(back) into management'·'management career' — game/load/squad/time management는 아니다)·'captaincy'·'stay/remain captain' · it 'fiducia a/al'·'direttore sportivo' | en 'match/game/play suspended'·'temporarily suspended'·'suspension of play'·'suspended sentence' |

- 테스트: `tests/classify.test.ts` 'M1-43 실데이터 — 오분류 회귀·기타 보강' describe(it 7개 — 오분류 회귀·이적·부상·감독·구단·결과 + **리뷰 회귀**(결과 숙어 'Arsenal finally break down stubborn Burnley' = 결과·spoiler true, 협상 결렬 구, 'out for revenge/blood/redemption', management·suspended·done deal·a doubt·fuori per·humbled by·ribalta 다른 쓰임, '보스만 사전 합의'·'Man Utd invite bids for Rashford'는 이적 그대로, 무릎 꿇기 변형, '시즌아웃') + **경기 전 기사**('can come out on top'·'연속 무승 탈출 노린다'·'결승골 노린다' — 결과 아님·spoiler 보수적으로 true)). 기존 fixtures 손 판정 대조(spoiler 22/22·카테고리 22/23 등) 그대로 통과.
- 리뷰(2026-10-25) 반영 뒤 기간 재분류를 다시 돌려 같은 결과를 확인했다 — 기타 157 → 133장(42.4%, 발행분 추정 41.1%), 변경 40장·새 오분류 0, 좁힌 제외·새 제외는 기간 카드에 영향 없음(기간 밖 63장 변경 1장 그대로).
- 리뷰에서 현행 유지로 정한 것(판단 근거):
  - '리턴설' — 국내 매체에서 친정 복귀 이적설의 고정 표현이고 대표팀 복귀는 '복귀설'·'재발탁'으로 쓴다(대표팀 강한 표현이 이적보다 앞서 판정된다).
  - '연속 무승'으로 감독·구단·기타 → 결과가 되는 카테고리 변화 — 제목이 지난 경기 결과를 드러내고 결과가 감독·구단보다 앞서는 순서(D47)를 그대로 따른 것, 경기 전 표현과 함께면 약한 표현이라 결과가 아니다.
  - '결승골'·'극장골' 회고 문형('지난 시즌 결승골' 등) — 주어가 있어야 결과이고 spoiler는 이미 경기 사건 표가 true로 보던 제목이라 노출 변화가 없다, 실데이터에 회고 문형 0건 — 관찰 유지.
  - 팬 사고('fan taken to hospital' → 부상) — 경기장 건강 사고도 '부상' 칩에서 찾는 소식에 가깝고 기간 실데이터 0건 — 관찰 유지(늘면 'fan'·'supporter' 주어 제외).

### 5. 검사·호출

- `npm run check`(152파일·5,290 테스트 → 리뷰 반영 뒤 5,292) · `npm run format:check` · `npm run validate` · `npm run build` 통과.
- 데이터 API: football-data `/v4/matches` 12요청(도구 2회 × 발행일 6일). LLM 호출 0 · API-Football 0.

### 6. 감독 발언 규칙 보강 결과 (D47 사용자 결정 A — 2026-10-25)

> §3의 제안 A를 반영한 결과다. 이 절도 표식 밖이라 `quality:sample`로 다시 만들면 사라진다 — 다시 돌리기 전에 옮긴다.

**반영 내용**

- **감독 표기**(`configs/names.ko.json`, `/add-name` 표기안 → 사용자 확인): 감독 13 → 32명. 현직 17명(알레그리·가스페리니·스팔레티·가투소·아모림·키부·아바테·파브레가스·글라스너·게리 오닐·램파드·휘르첼러·이라올라·모예스·야이슬레·사리·아르벨로아)과 키스 앤드류스·안토니오 콘테(현직 아님 — 맨유 감독설 빈출)를 국내 매체 관용 표기로 넣었다. 기존 '한지 플리크'는 '한지 플릭'으로 바꿨다(slug 그대로 — 태그 표시는 소급, 저장된 브리핑은 소급 안 됨). note 머리말은 `확정(사용자 결정 2026-10-25)`.
- **성 단독 별칭**: /add-name '성 단독 기본 미반영' 정책의 사용자 예외로 저위험 성 14개만 넣었다(뉴스 감독 발언 분류 전용 — 브리핑 치환·이름 찾기에는 쓰지 않는다, 아래 '브리핑 치환 영향') — Allegri·Gasperini·Spalletti·Gattuso·Chivu·Fàbregas·Glasner·Lampard·Hürzeler·Iraola·Moyes·Jaissle·Arbeloa·Sarri. 중간·고위험 성(Amorim·Abate·Conte·O'Neil·Andrews)과 기존 감독(Simeone·Slot·Flick·Alonso·Enrique·Carrick 등)은 넣지 않았다.
- **규칙**(`scripts/lib/news-keywords.ts` `managerSpeechOf` → `classify.ts` 감독·구단 자리): 사전 감독 이름 + 문형일 때만 감독·구단이다. 앞선 카테고리(대표팀·이적·부상·결과·UCL)가 먼저 정해지고, 이름만 있고 문형이 없으면 기타 그대로다(D47 ①).

| 문형 | 예(실데이터) | 비고 |
|---|---|---|
| head | `Napoli, Allegri: "…"` · `Allegri: "…"` | 쉼표 앞 팀·맥락(큰따옴표·쌍점 없음) + 이름 + 쌍점 |
| headSays | `Manchester United, Carrick scuote la squadra: "…"` | 이름 + 낱말 1~5개 + 쌍점 + 따옴표 |
| tail | `… - Iraola` · `…, says Iraola` · `…, Iraola says` | 공백 + 대시 + 이름으로 끝남('Gattuso-Sarri'는 아니다)·쉼표 뒤 끝 출처 |
| quoteTail | `'It doesn't make sense' - Glasner confused …` | 닫는 따옴표 + 대시 + 이름 |
| verb | `Glasner confident …` · `Liverpool boss Iraola says …` | 머리 주어 + 발언 동사(소문자 현재형, 표 `MANAGER_SPEECH_VERBS` — 수동태와 겹치는 과거분사 'praised'·'dismissed'(경질)·'admitted'(입원)·'said'(소문 'said to be')와 명사로 흔한 'questions'는 뺐다) |
| koQuote · koSaid · koSays | `램파드 “…”` · `“…”라고 말한 이라올라` · `가스페리니가 밝힌 …` | 국내 — 큰따옴표만(작은따옴표는 별명·강조: '이라올라 감독 ‘애제자’'), 한글 성은 3글자 이상(키부·사리 제외), 발언 동사는 `MANAGER_SPEECH_VERBS.ko` 하나 |

- 이름 맞춤: 라틴은 발음 기호를 떼고 대소문자를 남겨 사전 표기 그대로(첫 글자 대문자)·단어 경계일 때만 맞춘다('sarri'·'Sarrià'는 아니다). 이 대소문자 구분은 분류에만 있다 — 브리핑 치환은 대소문자를 무시한다. 첫 글자 축약('D. Simeone')은 쓰지 않는다. 성 별칭이 없는 시메오네는 전체 이름일 때만 맞는다 — 'Torino, Simeone: "…"'(지오반니)·'시메오네가 밝히는'은 기타 그대로다.
- 감독 발언 제목은 엔티티 병합 대상(D42 `isMatchReportText`)에서도 뺀다 — 감독 발언 기사가 결과 카드 밑으로 숨지 않게(기존 `CLUB_TERMS`와 같은 취급). 같은 날 재실행에서 저장된 오늘 카드의 열쇠(`cluster-classify.ts` `todayCardEntity`)도 같은 신호(`classify.ts` `titleSignals` — 감독 색인 포함)를 쓴다(리뷰 반영).

**재분류**(10-17~25 8개 호 359장 — §3과 같은 근사: 대표 제목 + 출처 대회, 요약문 없음 · 보강 전 = origin/main 코드·사전)

- **기타 148 → 136장(41.2% → 37.9%)** — 언어별 en 70 → 65 · it 42 → 35 · ko 34 → 34 · es 2 → 2. 발행분 저장값은 164장(45.7% — 대부분 M1-43 보정 전 규칙).
- 바뀐 카드 **12장, 모두 기타 → 감독·구단**, 하나씩 확인 — **새 오분류 0**: Gattuso(10-17 Lazio) · Arbeloa('Not about me') · Iraola('delicate' situation) · Gasperini(10-18 'Grande soddisfazione') · Jaissle('wrong decisions') · Moyes('did not play well') · Allegri(10-21) · Gasperini(10-21) · Chivu(10-22) · Spalletti(10-23) · Sarri(10-23) · Glasner('It doesn't make sense').
- spoiler·태그·kr·이적 정보 변화 **0**. `matchResult` 플래그만 바뀐 카드 1장 — 'Roma, Gasperini: "… sul 3-2 …"'(카테고리 결과·spoiler 그대로, 팀 태그가 로마 하나라 원래도 병합 열쇠가 없다 — 실제 병합 변화 0). 기간 밖(10-12~14, 18장) 변화 0.
- 기간 안 문형 적중 16장 중 4장은 이미 감독·구단(국내 '감독' 키워드 등) 또는 결과(위 Gasperini)였다 — 앞선 카테고리 우선 확인. fixtures RSS·클러스터 표본 321제목에서도 적중 3장 모두 감독 발언(작은따옴표 별명 오탐 1건은 국내 문형을 큰따옴표로 좁혀 없앰).

**남은 기타 136장 — 목표 재설정(사용자 결정 2026-10-25: ≤ 40%, 37.9%로 충족)**

- **결론**: D47 기타 비율 목표를 **≤ 40%로 재설정**했다(사용자 결정 2026-10-25 — §3의 B). '불확실하면 기타'(D47 ①·FR-21) 원칙이 비율보다 앞선다. 남은 기타는 대부분 프리뷰·선발 명단·해설·선수 인터뷰처럼 기타가 아닌 6개 카테고리(경기 결과·이적·부상·감독·구단·대표팀·UCL) 어디에도 맞지 않는 기사다 — 억지로 넣으면 필터 칩의 뜻이 흐려진다. 발행분 기준 값은 M5-09 운영 리포트에서 계속 본다.

- 감독 발언인데 성 별칭이 없어 남은 제목 13장(스크래치 가정 사전으로 같은 재분류 — 저장소 반영 아님): 기존 감독 저위험 성(Carrick 4·Mourinho·Emery·Arteta·De Zerbi) 8장 → 별칭을 넣으면 **35.7%**, 중간·고위험 성(Abate 2·Amorim·Conte·Andrews) 5장까지 → **34.3%**.
- 나머지는 감독 발언 규칙으로 안 줄어든다 — 경기 전 기사·예상 선발·공식 선발 명단(it 'le formazioni ufficiali'·'probabili formazioni'·국내 'LINE UP'), 해설·기획('Why Liverpool are still too easy…'·'What we learnt…'), 선수 인터뷰 인용('Napoli, Politano: "…"'), 감독 이름만 있는 기사('belief in Glasner remains'·'Riflessioni su Amorim' — 감독 거취인데 문형이 없다), 국내 선수 호평·근황 기사.
- §3의 예상(−35~43장 → 29~31%)은 인터뷰 인용 제목 23장과 사전 감독 이름이 든 제목 24장(겹침 빼고 43장 — 선수 인터뷰·감독 이름만 있는 제목 포함)을 대부분 감독·구단으로 보는 가정이었다. 이번 규칙은 D47 ① 보수 원칙대로 사전 감독 + 인용 문형이 있어야 하고 성 별칭이 저위험 14개뿐이라 그 차이만큼 남았다.
- 남은 선택지(필요할 때): 기존 감독 저위험 성 별칭(Carrick·Mourinho·Emery·Arteta·De Zerbi 등 — 별칭만) → 약 35.7% · 프리뷰·선발 명단 제목 별도 판정(카테고리 추가는 D47 범위 밖 — 스키마·필터 변경).

**브리핑 치환 영향**

- **감독 한 단어 성 별칭은 브리핑에 쓰지 않는다**(리뷰 반영 — names.ts `isManagerSurnameAlias`): 치환(`substituteNames`)은 대소문자를 무시하므로, 별칭을 치환 색인에 두면 미등록 선수 'Giacomo Sarri'가 'Giacomo 마우리치오 사리'로 바뀌어 검사기를 통과하고, 득점자 'Sarri'가 입력 정리·템플릿에서 감독 이름이 되는 경로가 생긴다(CLAUDE §1-7). 그래서 치환·이름 찾기 색인(`buildNameIndex` — byEn·치환 정규식)에서 감독의 한 단어 별칭을 빼고(감독 전체 이름 'Maurizio Sarri'는 그대로 치환), 입력 정리(`canonicalizeBriefInput`)·템플릿 사람 이름(brief-template.ts)은 선수 항목만(`SCORER_KINDS`) 본다. 분류(`managerNameTerms`)는 names.ko를 직접 읽어 영향이 없다(재분류 수치 불변 확인).
- 테스트: 'Giacomo Sarri'·'Sarri' 문장과 득점자는 그대로, 'Maurizio Sarri'·'Hansi Flick'은 치환, `lookupName('Sarri')` = null. 원장(`data/matches`)·저장된 브리핑·`data/cache`·fixtures(football·llm)에 14개 성과 같은 선수 이름은 0건이었다.
- 골든 입력 `npm run eval:prompt -- --check-golden` — 소스와 다른 날 0일(`--build-golden` 불필요). LLM 호출 0.
- 같은 성의 미등록 선수가 나와도 브리핑에는 영향이 없다(위). 뉴스 분류에서는 그 선수의 인용 머리('Team, Sarri: "…"')가 감독 발언으로 보일 수 있다 — 감독·구단으로 갈 뿐 spoiler·태그는 그대로다. 그런 선수가 생기면 그 성을 별칭에서 빼거나 선수 전체 이름을 등록한다.

**검사**: `npm run check` · `npm run validate` · `npm run build` 통과(커밋 보고 참고). 데이터 API·LLM 호출 0.
