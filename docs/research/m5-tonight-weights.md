# M5-12 · 오늘 밤 가중치 분석 (M2-16 이월 ④ — DECISIONS D1 §8 #3)

> v0.1 · 2026-11-04 · 분석만 — **가중치는 바꾸지 않는다**(2026-11-04 사용자 결정 — 유지 · 11월 말 재검토, §6). 다시 계산: `npx tsx scripts/tonight-weights.ts [--from D] [--to D] [--standings asof|current]`

## 0. 요약

- 기간 **2026-10-08 ~ 11-04(28일)**, 선정이 있는 밤 25일 · 선정 경기 112개. 지금 데이터(`data/competitions/*.json` 일정·결과, `configs/korean-players.json` 9명 지금 소속, `configs/bigmatch-rules.json`)로 화면과 같은 순수 함수 `selectTonight`를 날마다 다시 돌렸다.
- 순위는 **그날 창 시작 전에 끝난 경기로 다시 만든 순위**(기본 — 지난날 선정에 그날 순위를 쓴다)와 **지금 순위표**(비교) 두 방식으로 계산했다. 결론은 같다.
- **한국 이유는 선정 경기의 29%**, 점수 기여 31%로 가장 크다. **주말 밤(금·토·일) 자리의 44%(25/57)**가 한국 선수 소속팀 경기이고, 토요일은 5자리 중 4자리가 흔하다(10-10 · 10-17 · 10-24 · 10-31).
- 그러나 **한국 가중치가 바꾼 자리는 28일 동안 13자리(모두 주말)**이고, 그 대신 빠진 경기는 대부분 '승점 차'·'빅클럽'만 걸린 2~3점 경기였다. 빠진 **대형 경기(UCL·상위 맞대결·더비)는 3경기** — 10-17 레알 베티스–바르셀로나 · 10-25 리버풀–브라이턴 · 10-31 맨시티–브라이턴(모두 상위 맞대결 5점, 한국 + 승점 차 7점 경기에 밀림).
- 화면 순서는 킥오프 순(D1 §8 결정 #1)이라 **'1위'는 화면에 드러나지 않는다** — 가중치는 5자리 경계에서만 보인다. 그래서 '주말 1위 한국' 같은 지표 대신 '한국 가중치가 얻은 자리'(한국 0과 비교)로 쟀다.
- **대안 A(한국 3)**와 **대안 B(한국 4 · 상위 5 · 더비 5)**는 이 기간에 결과가 같다: 밀린 대형 경기 3 → 1, 주말 한국 자리 44% → 40%, 바뀐 밤은 10-25 · 10-31 두 번뿐.
- **추천**: 지금 가중치를 유지하고 관찰을 이어 간다(바뀌는 밤이 4주에 2번, 영향이 작다). 바꾼다면 숫자 하나만 바꾸는 **대안 A(한국 3)** — 같은 효과에 설명이 쉽다(“한국 선수 소속은 상위 맞대결보다 조금 낮다”). 다시 볼 때: 11월 말(UCL 리그 페이즈 5·6차전 포함 7주치) 또는 한국 선수 명단이 바뀔 때(M3-01 확정).

## 1. 방법

- 대상 경기·점수·동점 정렬은 `src/lib/tonight.ts` 그대로(창 18:00 ~ 다음 날 07:00 KST, 연기·킥오프 미정 제외, 상위 5, 동점은 킥오프 → 대회 순서 → id).
- 기준 날짜 D마다: ① 그 가중치로 상위 5 ② `maxMatches`를 늘려 후보 전부 ③ 한국 가중치만 0으로 바꾼 상위 5(비교 기준).
- **한국 가중치가 얻은 자리** = 그 가중치의 상위 5에 있고 한국 0 기준 상위 5에는 없는 경기. **그 대신 빠진 경기** = 반대쪽.
- **대형 경기** = 한국 이유 없이 UCL · 상위 맞대결 · 더비 중 하나가 걸린 경기. **한국만 이유** = 한국(+ 빅클럽)만 걸린 경기.
- 한계: 한국 선수 소속은 지금 설정(시즌 중 이적 없음 — 2026-27 초안 9명), 대회 데이터가 없는 컵 경기(DFB 포칼 등)는 후보에 없다. 순위 재계산은 승점 → 득실 → 득점 → slug라 같은 승점의 실제 순위와 다를 수 있다(상위 6 경계에서만 영향).

## 2. 가중치별 요약 — 그날 기준 순위(기본)

|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 지금 (한국 5 · UCL 4 · 상위 4 · 더비 4 · 승점 차 2 · 빅클럽 1) | 25 | 112 | 29% | 27% | 14% | 5% | 40% | 47% | 7% | 25/57 (44%) | 13 (13) | 3 |
| 대안 A — 한국 3 (나머지 그대로) | 25 | 112 | 27% | 27% | 16% | 5% | 39% | 49% | 6% | 23/57 (40%) | 11 (11) | 1 |
| 대안 B — 한국 4 · 상위 5 · 더비 5 (나머지 그대로) | 25 | 112 | 27% | 27% | 16% | 5% | 39% | 49% | 6% | 23/57 (40%) | 11 (11) | 1 |

지금 순위표로 계산한 경우(비교):

|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 지금 (한국 5 · UCL 4 · 상위 4 · 더비 4 · 승점 차 2 · 빅클럽 1) | 25 | 112 | 29% | 27% | 14% | 5% | 35% | 48% | 12% | 26/57 (46%) | 14 (14) | 1 |
| 대안 A — 한국 3 (나머지 그대로) | 25 | 112 | 29% | 27% | 15% | 5% | 35% | 48% | 11% | 25/57 (44%) | 13 (13) | 0 |
| 대안 B — 한국 4 · 상위 5 · 더비 5 (나머지 그대로) | 25 | 112 | 29% | 27% | 15% | 5% | 35% | 48% | 11% | 25/57 (44%) | 13 (13) | 0 |

## 3. 이유별 점유율 · 점수 기여(지금 가중치, 그날 기준 순위)

| 이유(가중치) | 걸린 선정 경기 | 점수 기여 |
|---|---|---|
| 한국 (5) | 32/112 (29%) | 31% |
| UCL (4) | 30/112 (27%) | 23% |
| 상위 맞대결 (4) | 16/112 (14%) | 13% |
| 더비 (4) | 6/112 (5%) | 5% |
| 승점 차 (2) | 45/112 (40%) | 18% |
| 빅클럽 (1) | 53/112 (47%) | 10% |

'걸린 선정 경기'는 한 경기에 이유가 여럿이면 각각 센다(합 100% 넘음). '점수 기여'는 선정 경기 점수 합에서 그 이유 가중치가 차지한 몫.

## 4. 주말 밤 — 한국 자리와 한국 가중치가 바꾼 자리(지금 가중치)

그날 기준 순위:

| 주말 밤 | 후보 | 한국 자리 | 한국 가중치가 얻은 자리 | 그 대신 빠진 경기 (한국 0 기준 점수 · 이유) |
|---|---|---|---|---|
| 2026-10-09 (금) | 3 | 0/3 | – | – |
| 2026-10-10 (토) | 23 | 4/5 | mainz–leverkusen 2(승점 차)<br>union-berlin–elversberg 0(이유 없음) | manchester-united–tottenham-hotspur 3(승점 차+빅클럽)<br>napoli–frosinone 3(승점 차+빅클럽) |
| 2026-10-11 (일) | 17 | 2/5 | freiburg–schalke 0(이유 없음) | hull-city–everton 2(승점 차) |
| 2026-10-16 (금) | 4 | 0/4 | – | – |
| 2026-10-17 (토) | 21 | 4/5 | elversberg–augsburg 2(승점 차)<br>schalke–mainz 2(승점 차) | real-betis–barcelona 5(상위 맞대결+빅클럽)<br>hamburg–stuttgart 2(승점 차) |
| 2026-10-18 (일) | 19 | 1/5 | borussia-monchengladbach–hoffenheim 2(승점 차) | milan–atalanta 3(승점 차+빅클럽) |
| 2026-10-23 (금) | 5 | 1/5 | – | – |
| 2026-10-24 (토) | 19 | 4/5 | atletico-madrid–deportivo-la-coruna 1(빅클럽) | rb-leipzig–elversberg 2(승점 차) |
| 2026-10-25 (일) | 22 | 3/5 | crystal-palace–newcastle-united 2(승점 차)<br>hull-city–brentford 2(승점 차) | liverpool–brighton 5(상위 맞대결+빅클럽)<br>manchester-united–bournemouth 3(승점 차+빅클럽) |
| 2026-10-30 (금) | 5 | 1/5 | – | – |
| 2026-10-31 (토) | 22 | 4/5 | levante–atletico-madrid 1(빅클럽)<br>borussia-monchengladbach–paderborn 0(이유 없음)<br>schalke–rb-leipzig 0(이유 없음) | manchester-city–brighton 5(상위 맞대결+빅클럽)<br>tottenham-hotspur–crystal-palace 3(승점 차+빅클럽)<br>werder-bremen–hoffenheim 2(승점 차) |
| 2026-11-01 (일) | 16 | 1/5 | union-berlin–koln 2(승점 차) | strasbourg–auxerre 2(승점 차) |

지금 순위표:

| 주말 밤 | 후보 | 한국 자리 | 한국 가중치가 얻은 자리 | 그 대신 빠진 경기 (한국 0 기준 점수 · 이유) |
|---|---|---|---|---|
| 2026-10-09 (금) | 3 | 0/3 | – | – |
| 2026-10-10 (토) | 23 | 5/5 | augsburg–bayern-munchen 1(빅클럽)<br>alaves–atletico-madrid 1(빅클럽)<br>union-berlin–elversberg 0(이유 없음) | paderborn–stuttgart 2(승점 차)<br>hoffenheim–hamburg 2(승점 차)<br>ipswich-town–fulham 2(승점 차) |
| 2026-10-11 (일) | 17 | 2/5 | freiburg–schalke 0(이유 없음) | hull-city–everton 2(승점 차) |
| 2026-10-16 (금) | 4 | 0/4 | – | – |
| 2026-10-17 (토) | 21 | 5/5 | newcastle-united–aston-villa 2(승점 차)<br>espanyol–atletico-madrid 1(빅클럽)<br>union-berlin–borussia-dortmund 1(빅클럽) | real-betis–barcelona 5(상위 맞대결+빅클럽)<br>everton–chelsea 3(승점 차+빅클럽)<br>hamburg–stuttgart 2(승점 차) |
| 2026-10-18 (일) | 19 | 1/5 | borussia-monchengladbach–hoffenheim 0(이유 없음) | celta-vigo–alaves 2(승점 차) |
| 2026-10-23 (금) | 5 | 1/5 | – | – |
| 2026-10-24 (토) | 19 | 4/5 | augsburg–union-berlin 2(승점 차)<br>atletico-madrid–deportivo-la-coruna 1(빅클럽)<br>mainz–werder-bremen 0(이유 없음) | cagliari–bologna 2(승점 차)<br>rb-leipzig–elversberg 2(승점 차)<br>paderborn–hamburg 2(승점 차) |
| 2026-10-25 (일) | 22 | 3/5 | crystal-palace–newcastle-united 0(이유 없음) | athletic–getafe 2(승점 차) |
| 2026-10-30 (금) | 5 | 1/5 | – | – |
| 2026-10-31 (토) | 22 | 3/5 | levante–atletico-madrid 1(빅클럽)<br>borussia-monchengladbach–paderborn 0(이유 없음) | bournemouth–leeds-united 2(승점 차)<br>hull-city–ipswich-town 2(승점 차) |
| 2026-11-01 (일) | 16 | 1/5 | – | – |

괄호 안 점수는 한국 가중치를 뺀 점수(한국 0 기준)와 이유다. 토요일에 한국 자리가 많은 것은 한국 선수 9명 중 6명이 분데스리가 팀(바이에른 · 우니온 · 마인츠 · 묀헨글라트바흐 · 아우크스부르크 · 샬케)에 있고, 분데스리가 토요일 동시 킥오프(현지 15:30 = KST 22:30 서머타임 · 23:30 표준시)가 한 창에 몰리기 때문이다.

## 5. 날짜별 상위 5와 대안 차이(그날 기준 순위)

| 날짜 | 후보 | 지금 상위 5 (점수 · 이유) | 대안 A와 다른 경기 | 대안 B와 다른 경기 |
|---|---|---|---|---|
| 2026-10-09 (금) | 3 | borussia-dortmund–werder-bremen 1(빅클럽)<br>lens–lyon 0()<br>malaga–espanyol 0() | 같음 | 같음 |
| 2026-10-10 (토) | 23 | augsburg–bayern-munchen 12(한국+상위 맞대결+승점 차+빅클럽)<br>alaves–atletico-madrid 10(한국+상위 맞대결+빅클럽)<br>arsenal–leeds-united 7(상위 맞대결+승점 차+빅클럽)<br>mainz–leverkusen 7(한국+승점 차)<br>union-berlin–elversberg 5(한국) | 같음 | 같음 |
| 2026-10-11 (일) | 17 | koln–borussia-monchengladbach 9(한국+더비)<br>freiburg–schalke 5(한국)<br>cagliari–juventus 3(승점 차+빅클럽)<br>como–roma 2(승점 차)<br>elche–celta-vigo 2(승점 차) | 같음 | 같음 |
| 2026-10-12 (월) | 4 | coventry-city–newcastle-united 5(한국)<br>torino–udinese 2(승점 차)<br>atalanta–venezia 0()<br>levante–sevilla 0() | 같음 | 같음 |
| 2026-10-13 (화) | 9 | atletico-madrid–manchester-united 10(한국+UCL+빅클럽)<br>viking–bayern-munchen 10(한국+UCL+빅클럽)<br>inter–club-brugge 5(UCL+빅클럽)<br>galatasaray–barcelona 5(UCL+빅클럽)<br>arsenal–lille 5(UCL+빅클럽) | 같음 | 같음 |
| 2026-10-14 (수) | 9 | lask–liverpool 5(UCL+빅클럽)<br>roma–real-madrid 5(UCL+빅클럽)<br>manchester-city–paris-saint-germain 5(UCL+빅클럽)<br>bodo-glimt–borussia-dortmund 5(UCL+빅클럽)<br>feyenoord–como 4(UCL) | 같음 | 같음 |
| 2026-10-16 (금) | 4 | eintracht-frankfurt–koln 2(승점 차)<br>frosinone–sassuolo 2(승점 차)<br>le-mans–toulouse 2(승점 차)<br>deportivo-la-coruna–levante 0() | 같음 | 같음 |
| 2026-10-17 (토) | 21 | bayern-munchen–rb-leipzig 12(한국+상위 맞대결+승점 차+빅클럽)<br>brentford–liverpool 8(한국+승점 차+빅클럽)<br>everton–chelsea 7(상위 맞대결+승점 차+빅클럽)<br>elversberg–augsburg 7(한국+승점 차)<br>schalke–mainz 7(한국+승점 차) | 같음 | 같음 |
| 2026-10-18 (일) | 19 | borussia-monchengladbach–hoffenheim 7(한국+승점 차)<br>leverkusen–freiburg 6(상위 맞대결+승점 차)<br>paris-fc–rennes 6(상위 맞대결+승점 차)<br>real-madrid–sevilla 5(상위 맞대결+빅클럽)<br>leeds-united–manchester-united 3(승점 차+빅클럽) | 같음 | 같음 |
| 2026-10-19 (월) | 4 | tottenham-hotspur–coventry-city 3(승점 차+빅클럽)<br>parma–torino 2(승점 차)<br>getafe–rayo-vallecano 2(승점 차)<br>monza–cagliari 0() | 같음 | 같음 |
| 2026-10-20 (화) | 9 | stuttgart–atletico-madrid 10(한국+UCL+빅클럽)<br>sabah–borussia-dortmund 5(UCL+빅클럽)<br>manchester-city–aek-athens 5(UCL+빅클럽)<br>liverpool–villarreal 5(UCL+빅클럽)<br>napoli–bodo-glimt 5(UCL+빅클럽) | 같음 | 같음 |
| 2026-10-21 (수) | 10 | bayern-munchen–arsenal 10(한국+UCL+빅클럽)<br>como–manchester-united 5(UCL+빅클럽)<br>real-madrid–rb-leipzig 5(UCL+빅클럽)<br>inter–shakhtar-donetsk 5(UCL+빅클럽)<br>lille–galatasaray 4(UCL) | 같음 | 같음 |
| 2026-10-23 (금) | 5 | stuttgart–borussia-monchengladbach 5(한국)<br>torino–monza 2(승점 차)<br>brest–nice 2(승점 차)<br>ipswich-town–nottingham-forest 0()<br>alaves–malaga 0() | 같음 | 같음 |
| 2026-10-24 (토) | 19 | mainz–werder-bremen 7(한국+승점 차)<br>koln–schalke 7(한국+승점 차)<br>augsburg–union-berlin 7(한국+승점 차)<br>atletico-madrid–deportivo-la-coruna 6(한국+빅클럽)<br>rayo-vallecano–elche 2(승점 차) | 같음 | 같음 |
| 2026-10-25 (일) | 22 | freiburg–bayern-munchen 12(한국+상위 맞대결+승점 차+빅클럽)<br>barcelona–real-madrid 9(상위 맞대결+더비+빅클럽)<br>crystal-palace–newcastle-united 7(한국+승점 차)<br>hull-city–brentford 7(한국+승점 차)<br>monaco–lille 6(상위 맞대결+승점 차) | +liverpool–brighton / −hull-city–brentford | +liverpool–brighton / −hull-city–brentford |
| 2026-10-26 (월) | 2 | paris-saint-germain–lyon 7(상위 맞대결+승점 차+빅클럽)<br>sevilla–osasuna 2(승점 차) | 같음 | 같음 |
| 2026-10-27 (화) | 3 | sassuolo–lazio 0()<br>roma–cagliari 0()<br>torino–como 0() | 같음 | 같음 |
| 2026-10-28 (수) | 5 | parma–udinese 2(승점 차)<br>milan–bologna 1(빅클럽)<br>venezia–inter 1(빅클럽)<br>genoa–juventus 1(빅클럽)<br>monza–napoli 1(빅클럽) | 같음 | 같음 |
| 2026-10-29 (목) | 2 | frosinone–lecce 0()<br>fiorentina–atalanta 0() | 같음 | 같음 |
| 2026-10-30 (금) | 5 | elversberg–mainz 7(한국+승점 차)<br>lille–lens 6(더비+승점 차)<br>le-havre–paris-saint-germain 1(빅클럽)<br>nice–rennes 0()<br>villarreal–espanyol 0() | 같음 | 같음 |
| 2026-10-31 (토) | 22 | bayern-munchen–borussia-dortmund 16(한국+상위 맞대결+더비+승점 차+빅클럽)<br>milan–inter 9(상위 맞대결+더비+빅클럽)<br>levante–atletico-madrid 6(한국+빅클럽)<br>borussia-monchengladbach–paderborn 5(한국)<br>schalke–rb-leipzig 5(한국) | +manchester-city–brighton / −schalke–rb-leipzig | +manchester-city–brighton / −schalke–rb-leipzig |
| 2026-11-01 (일) | 16 | union-berlin–koln 7(한국+승점 차)<br>paris-fc–monaco 6(상위 맞대결+승점 차)<br>liverpool–arsenal 5(상위 맞대결+빅클럽)<br>athletic–real-sociedad 4(더비)<br>juventus–napoli 3(승점 차+빅클럽) | 같음 | 같음 |
| 2026-11-02 (월) | 5 | newcastle-united–everton 7(한국+승점 차)<br>sassuolo–fiorentina 2(승점 차)<br>lorient–brest 2(승점 차)<br>deportivo-la-coruna–osasuna 2(승점 차)<br>atalanta–parma 0() | 같음 | 같음 |
| 2026-11-03 (화) | 9 | atletico-madrid–bayern-munchen 10(한국+UCL+빅클럽)<br>feyenoord–inter 5(UCL+빅클럽)<br>barcelona–aston-villa 5(UCL+빅클럽)<br>villarreal–paris-saint-germain 5(UCL+빅클럽)<br>manchester-united–roma 5(UCL+빅클럽) | 같음 | 같음 |
| 2026-11-04 (수) | 9 | aek-athens–real-madrid 5(UCL+빅클럽)<br>fenerbahce–liverpool 5(UCL+빅클럽)<br>rb-leipzig–manchester-city 5(UCL+빅클럽)<br>slavia-praha–arsenal 5(UCL+빅클럽)<br>borussia-dortmund–real-betis 5(UCL+빅클럽) | 같음 | 같음 |


## 6. 결정 (2026-11-04 사용자 결정 — (A) 유지 · 11월 말 재검토)

> **결정**: (A) 지금 가중치 유지, 11월 말(UCL 리그 페이즈 5·6차전 포함 7주치)에 이 스크립트로 다시 계산해 대안 A와 비교한다. 아래는 제시했던 선택지 기록이다.


- (A, 추천) **지금 가중치 유지 · 11월 말 재확인** — 바뀌는 밤 4주 2번, 밀린 대형 경기 3경기. 비용 0
- (B) **대안 A(한국 3)로 변경** — 밀린 대형 경기 3 → 1, 주말 한국 자리 44% → 40%. `bigmatch-rules.json` 숫자 하나 + `/tonight` 선정 기준 문단은 설정에서 읽으므로 그대로. 비용: 설정 1줄 · 단위 테스트 기대값 확인
- (C) **대안 B(한국 4 · 상위 5 · 더비 5)** — 이 기간 결과는 (B)와 같지만 숫자 셋이 바뀌고 상위 맞대결·더비가 UCL(4)보다 무거워진다(주중 UCL 밤 순서에 영향 가능)
