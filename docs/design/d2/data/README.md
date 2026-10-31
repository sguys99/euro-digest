# D2 시안 공용 데이터 — `d2-data.json`

> 버전 v0.1 · 2026-10-31 · 게이트 D2(plan §9 D2-01) · 범위와 규칙은 [`../scope.md`](../scope.md)

시안 A(스쿼드 명단) · B(시즌권) · C(주간 지면)가 **같은 실데이터**를 쓰도록 만든 데이터 묶음이다. 시안 HTML은 이 파일에서 값을 옮겨 쓰고, 문구를 새로 만들지 않는다.

## 실행

```bash
node docs/design/d2/data/build-data.mjs     # 저장소 루트에서. 의존성 없음(node 내장 모듈만)
```

- 저장소 파일만 읽는다(`configs/` · `data/` · `fixtures/`). 네트워크·LLM 호출·`.env*` 읽기는 없고, 쓰는 파일은 `d2-data.json` 하나다.
- 생성기 안 검증이 하나라도 실패하면 파일을 쓰지 않고 종료 코드 1로 끝난다. 검증 항목은 원제목·원문 URL 일치, `ai:false`, 시즌 누적 = 로그 합, scope §2 예시값 대조, 키트 약어 대비 5.3 이상, 블록이 가리키는 카드가 `cards`에 있는지다.
- 파일이 약 500KB라 통째로 읽지 말고 필요한 블록만 꺼내 쓴다. 예: `node -e 'const d=require("./docs/design/d2/data/d2-data.json");console.log(JSON.stringify(d.weekly,null,1))'`

## 구조

| 최상위 키 | 내용 | 출처 |
|---|---|---|
| `meta` | 기준 시각(2026-10-31 07:11 KST), 제 20호, 원장 `since`·`playerSince`, 표기 약속(`conventions`), 읽은 파일 목록 | `data/news/2026-10-31.json` · `data/matches/*` |
| `labels` | 출전 상태 5종 · 이적 단계 5종 · 분류 도장 7종 · 대회 6 + 기타 | `configs/competitions.json` · `src/lib/news/labels.ts`와 같은 표 |
| `players` | 리그별 그룹 4개(분데스 6 · 라리가 1 · EPL 1 · 기타 1), 선수마다 상태·최근 경기·최근 5행·시즌 누적·다음 경기 3개·UCL·뉴스 수 | `configs/korean-players.json` · 원장 · `data/competitions` · `data/teams` · `data/news` |
| `playerDetail` | 김민재 — 머리 · 시즌 기록 · 로그 5칸(실 3 + 자리 2) · 다음 경기 · 관련 뉴스 32(한국어) + 영문 자리 · 이적 연결 · 대표팀 소식 3 | 같음 |
| `weekly` | W43 7명 표 · MVP(점수 근거) · 총평 자리 · 아카이브 이동 · KST 경계 비교 · W44 진행 중(동점 사례) | 원장 |
| `transfers` | 이적 3건(선수 단위) · 필터 축 값과 건수 · 단계 5 × Tier 3 견본 · 잠잠 견본 · 창 모드 자리 | `data/news`(transfer 필드) · `fixtures/news-sample.json` |
| `my` · `onboarding` | 팔로우 표본(팀 3 + 선수 2 = 한도 5) · 팀별 순위·다음·최근 3 · 표본 뉴스 · 온보딩 3단계 선택지 | `data/teams` · `data/competitions` · `configs` |
| `search` | 질의 4개("김민재" · "Lee Kang-in" · "토트넘" · "정우영" — 뉴스 0) + 결과 없음 1개("Magdeburg") | `configs/names.ko.json` · `data/teams` · `data/news` |
| `home` | 한국 선수 칩(제 20호 = 출전 0명, 견본 제 14호 = 5행) · 내 팀 소식 · A매치(자리 + 소집 뉴스 5) · 이적 핫 리스트 | 원장 · `data/news` |
| `specimens` | 출전 상태 5종(교체는 집계 전 fixtures 3건) · 팔로우 3상태 · 스코어 가림 · 팀 한줄평 자리 · `/national-team` 구조 · 선수 상태 4종(폴백 견본) | 원장 · `fixtures/football/api-football` |
| `placeholders` | 자리 객체 전체 목록(경로 · 이유 · 채울 단계) | – |
| `teams` | 블록이 가리키는 팀 60개 — 이름 · 배지(`k1` 상의 · `k2` 하의 · `kf` 약어 글자 · 대비) 또는 폴백 | `data/teams` · `configs/team-colors.json` |
| `cards` | 블록이 가리키는 뉴스 카드 76장의 표시 모델 — 원제목 `t` 그대로 · 태그 · 대표 출처 · `+N` · KST · 상대 시간 | `data/news/*.json` · `fixtures/news-sample.json` |

블록 안의 팀은 `{ slug, nameKo }`, 카드는 id 문자열이다. 배지는 `teams[slug]`, 카드 표시 모델은 `cards[id]`에서 찾는다.

## 계산 규칙 (scope §2를 그대로 구현)

- **시각**: 저장값 UTC(`utc`) + KST 표시 문자열(`kst` · `short` "10.29 04:45" · `dayShort` "10.29 (목)" · `date` · `datetime`). 상대 시간(`rel`)은 기준 시각을 '지금'으로 본 값이다.
- **출전**: `start`·`sub`만 출전이다. `bench`는 "벤치 · 미출전", `absent`는 "명단 제외", `unknown`은 "라인업 없음"(0으로 세지 않음)으로 쓴다. 분이 `null`이면 "–"로 쓴다. `inSquad`는 start+sub+bench를 센 값이다.
- **시즌 누적**: 원장 `since`(10.19) 이후를 대회별로 합한다. 리그 · UCL은 따로 세고, 컵(`comp: null`)은 `OTHER` "기타 대회"로 묶되 원문 `leagueRaw: "DFB Pokal"`을 함께 둔다.
- **스코어**: `result`는 소속팀 기준(for-against), `scoreHomeAway`는 홈-원정 순이다. 두 값을 다 넣었다.
- **주간 W43**: UTC 기준 [10.19, 10.26)이다(scope §6 #2 추천안). MVP 점수는 골×3 + 도움×2 + 출전이고, 표는 점수 → 분 → 명단 순서로 정렬했다(정렬은 시안 가정).
- **이적**: 카드 `transfer`를 선수 단위로 묶는다. 단계는 역행하지 않고 결렬은 예외다. Tier는 카드 최고 출처 기준이고, 최근 갱신은 마지막 카드의 대표 출처 시각이다. 잠잠 = 갱신 + 30일 < 기준 시각이다. 등록 한국 선수만 `affiliation`("소속 {팀}", Q3 ①)을 두고 `from`은 비운다.
- **홈 칩 창**: 발행일 전날 UTC 하루다(브리핑 창과 같다).
- **키트 글자색**: `src/lib/kit-contrast.ts`와 같은 규칙(#FFFFFF · #14213D 중 대비가 큰 쪽, 하한 5.3)이다. 지금 값은 모두 보정 없이 통과한다.
- **검색**: Pagefind를 흉내 낸 것이다. 별칭 부분 일치(대소문자 무시)로 찾고, 뉴스는 제목 또는 태그로 잡는다. 실제 Pagefind 순위와 다를 수 있다.

## 알려진 한계 (scope §6과의 관계)

- §6 #1: 컵 경기는 화면 스키마상 "기타 대회"로만 쓸 수 있다. `leagueRaw`는 참고용이다.
- §6 #2: `weekly.boundaryCheck`를 보면 KST 경계로 자를 때 김민재의 프라이부르크전(명단 제외)이 W44로 넘어간다. 표 숫자는 바뀌지 않는다.
- §6 #3: W43은 동점이 없다. W44 진행분은 4명 동점(1점)이다 — `weekly.w44InProgress`.
- §6 #4: 김민재 이적은 아스널 1건이다. 같은 선수의 이적 분류 카드 중 필드가 없는 5장은 `auxiliaryCards`에 따로 두었다.
- §6 #5: Tier 1 · Tier 2 이적은 0건이고, Tier 필터 1 · 2는 결과 0이다.
- §6 #7: 원장에 교체 출전이 없어서, 교체 견본은 집계 전 fixtures만 쓴다(화면 로그에는 넣지 않음).
- §6 #8: 정우영 · 김지수 · 홍현석은 관련 뉴스가 0장이다. 영문 관련 뉴스는 0장이라 자리로 두었다.
- §6 #9: 컵 상대 5팀은 영문 원문 + 폴백 배지다.
- scope 표와 다른 점: 김민재 분데스 행은 `absent`라 `inSquad`가 0이다(scope §2는 "명단 1"로 적었다). `cat:national` + `kr` 카드는 4장이 아니라 5장이다(김민재 3 · 황희찬 3 · 이강인 1 태그, 한 카드에 여럿).
