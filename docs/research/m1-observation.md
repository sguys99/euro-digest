# M1-F 운영 관찰 기록 — 발행 시각·비용·경기 상태·GDELT 재측정 (M1-41 · M1-42 · M1-46)

> 버전 v0.1 · 관찰 기간 **2026-10-20 ~ 2026-10-26**(정기 실행 활성화 2026-10-19, plan M1-F) · 이 문서의 표·상세·숨은 데이터 줄은 도구가 쓴다 — `npm run observe -- --date <발행일>`(하루) · `npm run observe -- --week --from <시작> --to <끝>`(주간 요약) · `npm run probe:gdelt`(GDELT 하루 1회). 표의 **메모** 칸과 표식(`<!-- … -->`) 밖의 글은 도구가 지우지 않는다. 관찰 기간 앞 날짜는 "관찰 전 시험"으로 표시하고 주간 판정에 넣지 않는다.

## 판정 기준

- **목표 시각**(PRD §15 D26): 발행일의 계절로 정한다(`src/lib/time.ts` `publishSlot` — 유럽 서머타임 기간 **07:00**, 표준시 기간 **07:30** KST). 전환 순간이 일요일 10:00 KST라 2026-10-25(일)까지 07:00, **2026-10-26(월)부터 07:30**(겨울 첫 발행 — 발행 시각 변경과 경기 시각 KST 표시를 확인하는 날).
- **공개 시각**: 그날 첫 GitHub Pages 배포 완료(`collect.yml` → `deploy.yml`의 `GitHub Pages 배포` 단계 완료) 시각.
- **판정**(NFR-05, D48 ②): 정시 = 목표 시각 이전(일찍 공개 허용) · 허용 = 목표 +15분 이내 · 지각 = +15분 초과 · 미발행 = 그날 배포 없음 · 확인 불가 = Actions 조회 실패. 수동 dispatch(slot 없음)·아침 창(05:30~10:00 KST) 밖 실행이 처음 공개한 날은 판정을 참고로만 본다.
- **계절 가드**(M1-47): 계절에 맞지 않는 트리거(여름 07:10 dispatch·07:20 schedule / 겨울 06:30 dispatch·06:40 schedule)는 가드가 `off-season`으로 건너뛰어야 한다. 다른 판단으로 진행했으면 **계절 위반**.
- **경기 상태**(M0-28): 수집 시점에 브리핑 입력 창(UTC 하루 D-1 — `briefInputWindow`)의 football-data 경기 중 종료 / 진행 중 / 그 밖의 미종료(미시작·연기). 미종료(연기·중단 제외)인데 킥오프 뒤 130분이 지났으면 **점수 지연 의심**(무료 플랜 "Scores delayed"). 출처는 그 실행의 `collect.matchdata.done`(football-data) 로그의 `windowStatus`(경기별 상태)이고, 이 필드가 없는 옛 로그는 건수(진행 중·그 밖 미종료)만 적고 지연은 판정 불가로 둔다.
- **비용**(M1-42): `data/runs.json`의 그날(KST) prod collect 실행 합계 — 브리핑 요청 수(`brief.requests`), 토큰(캐시 읽기·쓰기 포함), `costUsd`. 요청 2개 이상인 날은 캐시 읽기(`cacheRead` > 0) 여부를 본다(D28 — 캐싱은 같은 지시문 2요청 이상일 때만 켬).

### 일자별 표 열

| 열 | 뜻 | 출처 |
|---|---|---|
| 발행일 | KST 발행일(파일명·runs 기록의 KST 날짜) | — |
| 계절·목표 | 여름/겨울 · 공개 목표 시각(KST) | `publishSlot` |
| 공개 | 그날 첫 배포 완료 시각(KST) | Actions jobs API |
| 지연(분) | 공개 − 목표(음수 = 일찍) | — |
| 판정 | 정시·허용·지각·미발행·확인 불가 | D48 ② |
| 트리거 | 그날 collect 실행 수: 실행 / 건너뜀(사유) · 계절 위반 수 | 가드 job·주석(annotation) |
| 상태 | 그날 prod collect 기록의 status(여러 번이면 차례로) | `data/runs.json` |
| 카드 | `data/news/<발행일>.json` 카드 수 | data |
| 브리핑 | mode(AI 줄/전체 줄) | `data/briefs/<발행일>.json` |
| 요청 | 그날 브리핑 요청 수 합(FR-29 재시도 포함) | runs `brief.requests` |
| 비용 | 그날 prod 비용 합(USD) | runs `costUsd` |
| 캐시 R/W | 캐시 읽기/쓰기 토큰 합 | runs `tokens` |
| 소스 실패 | 실패한 소스 id(오류 종류) | runs `sources` |
| 경기 상태 | 종료/진행 중/그 밖 미종료(지연 의심) | collect 로그 |
| 메모 | 사람이 적는 칸(도구가 보존) | — |

## 일자별 발행 (M1-41 · M1-42)

<!-- observe:daily:start -->
| 발행일 | 계절·목표 | 공개 | 지연(분) | 판정 | 트리거 | 상태 | 카드 | 브리핑 | 요청 | 비용 | 캐시 R/W | 소스 실패 | 경기 상태 | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 여름 07:00 | 14:39 | +459.6 | 지각(참고) | 실행 3 · 건너뜀 2(schedule-disabled 2) | success→success→partial | 45 | llm(5/5) | 2 | $0.0082 | 0/0 | 없음 | 21/0/0 (지연 판정 불가) | — |
| 2026-10-20 | 여름 07:00 | 09:44 | +164.1 | 지각 | 실행 1 · 건너뜀 1(off-season 1) | success | 45 | llm(5/5) | 1 | $0.0023 | 0/0 | 없음 | 4/0/0 (지연 의심 0) | — |
| 2026-10-21 | 여름 07:00 | 09:11 | +131.2 | 지각 | 실행 1 · 건너뜀 1(off-season 1) | success | 45 | llm(5/5) | 1 | $0.0039 | 0/0 | 없음 | 9/0/0 (지연 의심 0) | — |
| 2026-10-22 | 여름 07:00 | 09:15 | +135.6 | 지각 | 실행 1 · 건너뜀 1(off-season 1) | success | 45 | llm(5/5) | 1 | $0.0038 | 0/0 | 없음 | 10/0/0 (지연 의심 0) | — |
<!-- observe:daily:end -->

## 주간 요약 (M1-42 입력 — PRD §9.3 비용표 갱신)

<!-- observe:week:start -->
(아직 없음 — `npm run observe -- --week --from 2026-10-20 --to 2026-10-26`)
<!-- observe:week:end -->

## GDELT 재측정 (M1-46)

M0-27 결정 3: 관찰 기간에 **하루 1회, 쿼리 2개·요청 3건 이내**(1건은 429 재시도 여유), 요청 간 6초 이상(GDELT 429 본문 "one every 5 seconds"). 쿼리 ① `sourcelang:korean`(`gd-ko-allow-domains`의 lang에서 만든 언어 필터만 — 24시간 규모·seendate 지연 측정용, 수집 쿼리 아님) ② `gd-ko-allow-domains`(허용 도메인 OR — `configs/search-queries.json` q 그대로, 비활성 설정은 켜지 않고 읽기만). 공통 `mode=ArtList&format=json&maxrecords=250&sort=DateDesc&timespan=1d`. 허용 통과는 결과 URL 호스트로 `configs/publisher-domains.json` allow 판정(`filterSearchResults`). 결과 제목·URL은 저장하지 않는다(건수·호스트 빈도만).

재활성 기준(모두 충족하면 `gd-ko-allow-domains` 1개만 켜는 안을 사용자에게 — ❓): ① 7일 요청 성공률 ≥ 80% ② ① 쿼리 24시간 결과 수백 건(측정일 중앙값 ≥ 200, 250 상한 도달 포함) ③ 최신 seendate 지연 ≤ 60분(측정일 중앙값) ④ 허용 도메인 결과 주 1건 이상(기간 합).

<!-- gdelt:table:start -->
| 날짜 | 측정 시각(KST) | 요청 200/429/오류 | ① 한국어 24h 결과 | ① 최신 seendate 지연(분) | ② 허용 도메인 결과 | ② 허용 통과 | 비고 | 메모 |
|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 15:15 | 1/2/0 | 250+(상한) | 91 | 실패(HTTP 429) | — | 관찰 전 시험 측정 · 재시도 ① → 성공 · ① 목록 밖 상위 zdnet.co.kr 30, ohmynews.com 24, biz.heraldcorp.com 23 | — |
| 2026-10-22 | 20:03 | 0/0/3 | 실패(fetch failed) | — | 실패(fetch failed) | — | 재시도 ① → fetch failed | — |
<!-- gdelt:table:end -->

<!-- gdelt:verdict:start -->
**7일 판정 (2026-10-20 ~ 2026-10-26, 시험 측정 제외)**: **판정 전** — 기간 1/7일 측정

| 기준 | 값 | 판정 |
|---|---|---|
| 1. 7일 요청 성공률 ≥ 80% | 0/3 = 0% (1일) | 판정 전 |
| 2. 한국어 24시간 결과 수백 건(중앙값 ≥ 200) | 성공 측정 없음 | 판정 전 |
| 3. 최신 seendate 지연 ≤ 60분(중앙값) | 성공 측정 없음 | 판정 전 |
| 4. 허용 도메인 결과 주 1건 이상(기간 합) | 성공 측정 없음 | 판정 전 |
<!-- gdelt:verdict:end -->

## 일자별 상세

<!-- observe:details:start -->
### 2026-10-22 (목) — 여름 · 목표 07:00 KST

- 관찰 시각 10월 22일 (목) 10:44 KST · 공개 10월 22일 (목) 09:15 · 지연 +135.6분 · 판정 **지각**(기준: 목표 이전 정시 · +15분 이내 허용)
- ⚠ 출력 6,000토큰 초과 1회(eval.output-over-alert 기준)

**Actions 실행** (그 KST 하루에 만들어진 collect.yml 실행)

- 09:11 [#39698201955](https://github.com/sguys99/euro-digest/actions/runs/39698201955) schedule `40 21 * * *` · 트리거 계절 여름 → 실행(no-recent-success) · collect success 09:12~09:14 · 배포 09:15
- 09:42 [#39701268264](https://github.com/sguys99/euro-digest/actions/runs/39701268264) schedule `20 22 * * *` · 트리거 계절 겨울 → 건너뜀(off-season)

**실행 기록** (data/runs.json — 그날 KST prod collect 1건)

| runId | 시작(KST) | status | 수집/클러스터 | 브리핑 줄 AI/강등 | 요청 | 토큰 in/out | 캐시 R/W | 비용 | API fd/af | 소스 실패 |
|---|---|---|---|---|---|---|---|---|---|---|
| `collect-prod-20261022T001235Z-4d9e` | 09:12 | success | 465/45 | 5/0 | 1 | 6862/6160 | 0/0 | $0.0038 | 3/12 | 없음 |

- 브리핑 파일: mode `llm` · 5줄(AI 5) · runId `collect-prod-20261022T001235Z-4d9e` · 뉴스 카드: 45장

**collect 로그** (실행 #39698201955)

- runId `collect-prod-20261022T001235Z-4d9e` · 마감 기준 off-slot (브리핑 마감 09:20) · 결과 success/exit 0
- 브리핑 시도: #1 ok/ok in 6862 out 6160(thinking 5912) 캐시 0/0
- 예산 가드: ok · 예상 $0.0179 ↔ 실측 $0.0038(그날 합)
- 게시: mode llm (verified, written) · 검증 ok · AI 5 · 템플릿 0 · 버린 출력 줄 0
- LLM 단건 1회 · 최소 타임아웃 120000ms · 마감 절단 0
- API-Football: 대상 10 · 상세 10 · 이월 0 · 득점 불완전 0 · 브리핑 complete · 호출 12

**수집 시점 경기 상태** (브리핑 입력 창 = UTC 하루 D-1, football-data)

- 받은 시각 09:12 KST · 종료 10 · 진행 중 0 · 그 밖 미종료 0(연기·중단 0) · 점수 지연 의심 0(킥오프 뒤 130분 이상 미종료)

### 2026-10-21 (수) — 여름 · 목표 07:00 KST

- 관찰 시각 10월 22일 (목) 10:44 KST · 공개 10월 21일 (수) 09:11 · 지연 +131.2분 · 판정 **지각**(기준: 목표 이전 정시 · +15분 이내 허용)
- ⚠ 출력 6,000토큰 초과 1회(eval.output-over-alert 기준)

**Actions 실행** (그 KST 하루에 만들어진 collect.yml 실행)

- 09:07 [#39519357278](https://github.com/sguys99/euro-digest/actions/runs/39519357278) schedule `40 21 * * *` · 트리거 계절 여름 → 실행(no-recent-success) · collect success 09:07~09:10 · 배포 09:11
- 09:39 [#39522596751](https://github.com/sguys99/euro-digest/actions/runs/39522596751) schedule `20 22 * * *` · 트리거 계절 겨울 → 건너뜀(off-season)

**실행 기록** (data/runs.json — 그날 KST prod collect 1건)

| runId | 시작(KST) | status | 수집/클러스터 | 브리핑 줄 AI/강등 | 요청 | 토큰 in/out | 캐시 R/W | 비용 | API fd/af | 소스 실패 |
|---|---|---|---|---|---|---|---|---|---|---|
| `collect-prod-20261021T000818Z-5933` | 09:08 | success | 461/45 | 5/0 | 1 | 6205/6551 | 0/0 | $0.0039 | 2/11 | 없음 |

- 브리핑 파일: mode `llm` · 5줄(AI 5) · runId `collect-prod-20261021T000818Z-5933` · 뉴스 카드: 45장

**collect 로그** (실행 #39519357278)

- runId `collect-prod-20261021T000818Z-5933` · 마감 기준 off-slot (브리핑 마감 09:16) · 결과 success/exit 0
- 브리핑 시도: #1 ok/ok in 6205 out 6551(thinking 6255) 캐시 0/0
- 예산 가드: ok · 예상 $0.0177 ↔ 실측 $0.0039(그날 합)
- 게시: mode llm (verified, written) · 검증 ok · AI 5 · 템플릿 0 · 버린 출력 줄 0
- LLM 단건 1회 · 최소 타임아웃 120000ms · 마감 절단 0
- API-Football: 대상 19 · 상세 9 · 이월 10 · 득점 불완전 0 · 브리핑 complete · 호출 11

**수집 시점 경기 상태** (브리핑 입력 창 = UTC 하루 D-1, football-data)

- 받은 시각 09:08 KST · 종료 9 · 진행 중 0 · 그 밖 미종료 0(연기·중단 0) · 점수 지연 의심 0(킥오프 뒤 130분 이상 미종료)

### 2026-10-20 (화) — 여름 · 목표 07:00 KST

- 관찰 시각 10월 22일 (목) 10:44 KST · 공개 10월 20일 (화) 09:44 · 지연 +164.1분 · 판정 **지각**(기준: 목표 이전 정시 · +15분 이내 허용)

**Actions 실행** (그 KST 하루에 만들어진 collect.yml 실행)

- 09:38 [#39348816122](https://github.com/sguys99/euro-digest/actions/runs/39348816122) schedule `40 21 * * *` · 트리거 계절 여름 → 실행(no-recent-success) · collect success 09:38~09:43 · 배포 09:44
- 10:06 [#39351549153](https://github.com/sguys99/euro-digest/actions/runs/39351549153) schedule `20 22 * * *` · 트리거 계절 겨울 → 건너뜀(off-season) · (아침 창 밖)

**실행 기록** (data/runs.json — 그날 KST prod collect 1건)

| runId | 시작(KST) | status | 수집/클러스터 | 브리핑 줄 AI/강등 | 요청 | 토큰 in/out | 캐시 R/W | 비용 | API fd/af | 소스 실패 |
|---|---|---|---|---|---|---|---|---|---|---|
| `collect-prod-20261020T003904Z-f696` | 09:39 | success | 468/45 | 5/0 | 1 | 5682/3471 | 0/0 | $0.0023 | 4/34 | 없음 |

- 브리핑 파일: mode `llm` · 5줄(AI 5) · runId `collect-prod-20261020T003904Z-f696` · 뉴스 카드: 45장

**collect 로그** (실행 #39348816122)

- runId `collect-prod-20261020T003904Z-f696` · 마감 기준 off-slot (브리핑 마감 09:47) · 결과 success/exit 0
- 브리핑 시도: #1 ok/ok in 5682 out 3471(thinking 3229) 캐시 0/0
- 예산 가드: ok · 예상 $0.0176 ↔ 실측 $0.0023(그날 합)
- 게시: mode llm (verified, written) · 검증 ok · AI 5 · 템플릿 0 · 버린 출력 줄 0
- LLM 단건 1회 · 최소 타임아웃 120000ms · 마감 절단 0
- API-Football: 대상 13 · 상세 32 · 이월 9 · 득점 불완전 0 · 브리핑 complete · 호출 34

**수집 시점 경기 상태** (브리핑 입력 창 = UTC 하루 D-1, football-data)

- 받은 시각 09:39 KST · 종료 4 · 진행 중 0 · 그 밖 미종료 0(연기·중단 0) · 점수 지연 의심 0(킥오프 뒤 130분 이상 미종료)

### 2026-10-18 (일) — 여름 · 목표 07:00 KST · 관찰 전 시험

- 관찰 시각 10월 18일 (일) 15:56 KST · 공개 10월 18일 (일) 14:39 · 지연 +459.6분 · 판정 **지각**(기준: 목표 이전 정시 · +15분 이내 허용)
- ⚠ 관찰 전 시험(관찰 기간 밖 — 주간 판정 제외)
- ⚠ 처음 공개한 실행이 slot 없는 수동 dispatch·아침 창(05:30~10:00 KST) 밖 — 정시 판정은 참고용
- ⚠ 브리핑 max_tokens 잘림 1회(M1-20 이월 지표)
- ⚠ 출력 6,000토큰 초과 1회(eval.output-over-alert 기준)

**Actions 실행** (그 KST 하루에 만들어진 collect.yml 실행)

- 08:24 [#39078890352](https://github.com/sguys99/euro-digest/actions/runs/39078890352) schedule `40 21 * * *` · 트리거 계절 여름 → 건너뜀(schedule-disabled)
- 09:04 [#39081420176](https://github.com/sguys99/euro-digest/actions/runs/39081420176) schedule `20 22 * * *` · 트리거 계절 겨울 → 건너뜀(schedule-disabled)
- 14:34 [#39100995214](https://github.com/sguys99/euro-digest/actions/runs/39100995214) dispatch (slot 없음 — 수동) → 실행(no-recent-success) · collect success 14:34~14:38 · 배포 14:39 · (아침 창 밖)
- 14:40 [#39101357630](https://github.com/sguys99/euro-digest/actions/runs/39101357630) dispatch (slot 없음 — 수동) force → 실행(forced) · collect success 14:40~14:44 · 배포 14:45 · (아침 창 밖)
- 14:46 [#39101698305](https://github.com/sguys99/euro-digest/actions/runs/39101698305) dispatch (slot 없음 — 수동) force → 실행(forced) · collect success 14:46~14:48 · 배포 14:49 · (아침 창 밖)

**실행 기록** (data/runs.json — 그날 KST prod collect 3건)

| runId | 시작(KST) | status | 수집/클러스터 | 브리핑 줄 AI/강등 | 요청 | 토큰 in/out | 캐시 R/W | 비용 | API fd/af | 소스 실패 |
|---|---|---|---|---|---|---|---|---|---|---|
| `collect-prod-20261018T053453Z-77c1` | 14:34 | success | 462/45 | 5/0 | 2 | 16170/13155 | 0/0 | $0.0082 | 6/23 | 없음 |
| `collect-prod-20261018T054120Z-dd4c` | 14:41 | success | 462/0 | 0/0 | 0 | 0/0 | 0/0 | $0.0000 | 6/23 | 없음 |
| `collect-prod-20261018T054714Z-64c8` | 14:47 | partial | 462/0 | 0/0 | 0 | 0/0 | 0/0 | $0.0000 | 6/14 | 없음 |

- 브리핑 파일: mode `llm` · 5줄(AI 5) · runId `collect-prod-20261018T053453Z-77c1` · 뉴스 카드: 45장

**collect 로그** (실행 #39100995214)

- runId `collect-prod-20261018T053453Z-77c1` · 마감 기준 off-slot (브리핑 마감 14:42) · 결과 success/exit 0
- 브리핑 시도: #1 max_tokens/retry in 8085 out 8192(thinking 8190) 캐시 0/0 · #2 ok/ok in 8085 out 4963(thinking 4694) 캐시 0/0
- 예산 가드: ok · 예상 $0.0100 ↔ 실측 $0.0082(그날 합)
- 게시: mode llm (verified, written) · 검증 ok · AI 5 · 템플릿 0 · 버린 출력 줄 0
- LLM 단건 2회 · 최소 타임아웃 60000ms · 마감 절단 0
- API-Football: 대상 40 · 상세 21 · 이월 19 · 득점 불완전 0 · 브리핑 complete · 호출 23

**수집 시점 경기 상태** (브리핑 입력 창 = UTC 하루 D-1, football-data)

- 받은 시각 14:35 KST · 종료 21 · 진행 중 0 · 그 밖 미종료 0 · 점수 지연 의심 판정 불가(로그에 경기별 목록 없음 — 건수만)
<!-- observe:details:end -->

<!-- observe-data v1 — observe 기록(손대지 말 것). 한 줄 = 발행일 하나 · 표·상세는 이 줄로 다시 그린다
2026-10-18 {"v":1,"date":"2026-10-18","observedAt":"2026-10-18T06:56:25.957Z","season":"summer","publishTarget":"2026-10-17T22:00:00.000Z","seasonFirstDay":false,"trial":true,"actions":{"ok":true,"error":null,"runs":[{"id":39078890352,"url":"https://github.com/sguys99/euro-digest/actions/runs/39078890352","event":"schedule","createdAt":"2026-10-17T23:24:17.000Z","runAttempt":1,"runStartedAt":"2026-10-17T23:24:17.000Z","inMorningWindow":true,"cron":"40 21 * * *","slot":null,"force":false,"triggerSeason":"summer","guard":"skip","guardReason":"schedule-disabled","seasonCheck":"ok","collect":{"conclusion":"skipped","startedAt":"2026-10-17T23:24:42Z","completedAt":"2026-10-17T23:24:41Z"},"deployedAt":null,"deployConclusion":null,"conclusion":"success"},{"id":39081420176,"url":"https://github.com/sguys99/euro-digest/actions/runs/39081420176","event":"schedule","createdAt":"2026-10-18T00:04:37.000Z","runAttempt":1,"runStartedAt":"2026-10-18T00:04:37.000Z","inMorningWindow":true,"cron":"20 22 * * *","slot":null,"force":false,"triggerSeason":"winter","guard":"skip","guardReason":"schedule-disabled","seasonCheck":"ok","collect":{"conclusion":"skipped","startedAt":"2026-10-18T00:04:59Z","completedAt":"2026-10-18T00:04:59Z"},"deployedAt":null,"deployConclusion":null,"conclusion":"success"},{"id":39100995214,"url":"https://github.com/sguys99/euro-digest/actions/runs/39100995214","event":"workflow_dispatch","createdAt":"2026-10-18T05:34:05.000Z","runAttempt":1,"runStartedAt":"2026-10-18T05:34:05.000Z","inMorningWindow":false,"cron":null,"slot":null,"force":false,"triggerSeason":null,"guard":"run","guardReason":"no-recent-success","seasonCheck":"n/a","collect":{"conclusion":"success","startedAt":"2026-10-18T05:34:37Z","completedAt":"2026-10-18T05:38:30Z"},"deployedAt":"2026-10-18T05:39:36.000Z","deployConclusion":"success","conclusion":"success"},{"id":39101357630,"url":"https://github.com/sguys99/euro-digest/actions/runs/39101357630","event":"workflow_dispatch","createdAt":"2026-10-18T05:40:28.000Z","runAttempt":1,"runStartedAt":"2026-10-18T05:40:28.000Z","inMorningWindow":false,"cron":null,"slot":null,"force":true,"triggerSeason":null,"guard":"run","guardReason":"forced","seasonCheck":"n/a","collect":{"conclusion":"success","startedAt":"2026-10-18T05:40:51Z","completedAt":"2026-10-18T05:44:07Z"},"deployedAt":"2026-10-18T05:45:46.000Z","deployConclusion":"success","conclusion":"success"},{"id":39101698305,"url":"https://github.com/sguys99/euro-digest/actions/runs/39101698305","event":"workflow_dispatch","createdAt":"2026-10-18T05:46:20.000Z","runAttempt":1,"runStartedAt":"2026-10-18T05:46:20.000Z","inMorningWindow":false,"cron":null,"slot":null,"force":true,"triggerSeason":null,"guard":"run","guardReason":"forced","seasonCheck":"n/a","collect":{"conclusion":"success","startedAt":"2026-10-18T05:46:55Z","completedAt":"2026-10-18T05:48:55Z"},"deployedAt":"2026-10-18T05:49:55.000Z","deployConclusion":"success","conclusion":"success"}]},"publish":{"runId":39100995214,"publishedAt":"2026-10-18T05:39:36.000Z","delayMinutes":459.6,"verdict":"late","manual":true,"outsideWindow":true},"logRunId":39100995214,"log":{"runId":"collect-prod-20261018T053453Z-77c1","deadlineBasis":"off-slot","briefDeadline":"2026-10-18T05:42:53.361Z","footballData":{"at":"2026-10-18T05:35:29.841Z","fetched":21,"finished":21,"notFinished":0,"inProgress":{},"window":null},"apiFootball":{"targets":40,"details":21,"pending":19,"goalsIncomplete":0,"brief":"complete","apiCalls":23,"stoppedBy":null},"briefAttempts":[{"attempt":1,"ok":false,"errorType":"max_tokens","verdict":"retry","tokensIn":8085,"tokensOut":8192,"cacheRead":0,"cacheWrite":0,"thinkingTokens":8190},{"attempt":2,"ok":true,"errorType":null,"verdict":"ok","tokensIn":8085,"tokensOut":4963,"cacheRead":0,"cacheWrite":0,"thinkingTokens":4694}],"briefSkips":[],"briefBudget":{"verdict":"ok","estimatedUsd":0.010016},"briefDone":{"verdict":"ok","publishedAi":5,"publishedTemplate":0,"droppedOutputLines":0},"briefPublish":{"mode":"llm","reason":"verified","action":"written"},"llm":{"calls":2,"minTimeoutMs":60000,"deadlineCut":0},"done":{"status":"success","exitCode":0}},"logError":null,"data":{"runs":[{"runId":"collect-prod-20261018T053453Z-77c1","startedAt":"2026-10-18T05:34:53.361Z","status":"success","collected":462,"clusters":45,"summarized":5,"downgraded":0,"costUsd":0.008195,"tokens":{"in":16170,"out":13155,"cacheRead":0,"cacheWrite":0},"requests":2,"unbilledRiskUsd":null,"apiCalls":{"footballData":6,"apiFootball":23},"failedSources":[]},{"runId":"collect-prod-20261018T054120Z-dd4c","startedAt":"2026-10-18T05:41:20.075Z","status":"success","collected":462,"clusters":0,"summarized":0,"downgraded":0,"costUsd":0,"tokens":{"in":0,"out":0,"cacheRead":0,"cacheWrite":0},"requests":0,"unbilledRiskUsd":null,"apiCalls":{"footballData":6,"apiFootball":23},"failedSources":[]},{"runId":"collect-prod-20261018T054714Z-64c8","startedAt":"2026-10-18T05:47:14.008Z","status":"partial","collected":462,"clusters":0,"summarized":0,"downgraded":0,"costUsd":0,"tokens":{"in":0,"out":0,"cacheRead":0,"cacheWrite":0},"requests":0,"unbilledRiskUsd":null,"apiCalls":{"footballData":6,"apiFootball":14},"failedSources":[]}],"runsError":null,"totals":{"costUsd":0.008195,"requests":2,"in":16170,"out":13155,"cacheRead":0,"cacheWrite":0},"brief":{"mode":"llm","lines":5,"aiLines":5,"runId":"collect-prod-20261018T053453Z-77c1"},"briefError":null,"news":{"cards":45,"runId":"collect-prod-20261018T053453Z-77c1"},"newsError":null},"matchStatus":{"source":"counts","at":"2026-10-18T05:35:29.841Z","finished":21,"inProgress":0,"otherUnfinished":0,"calledOff":null,"overdue":null,"unfinished":[]},"notes":["관찰 전 시험(관찰 기간 밖 — 주간 판정 제외)","처음 공개한 실행이 slot 없는 수동 dispatch·아침 창(05:30~10:00 KST) 밖 — 정시 판정은 참고용","브리핑 max_tokens 잘림 1회(M1-20 이월 지표)","출력 6,000토큰 초과 1회(eval.output-over-alert 기준)"]}
2026-10-20 {"v":1,"date":"2026-10-20","observedAt":"2026-10-22T01:44:23.347Z","season":"summer","publishTarget":"2026-10-19T22:00:00.000Z","seasonFirstDay":false,"trial":false,"actions":{"ok":true,"error":null,"runs":[{"id":39348816122,"url":"https://github.com/sguys99/euro-digest/actions/runs/39348816122","event":"schedule","createdAt":"2026-10-20T00:38:16.000Z","runAttempt":1,"runStartedAt":"2026-10-20T00:38:16.000Z","inMorningWindow":true,"cron":"40 21 * * *","slot":null,"force":false,"triggerSeason":"summer","guard":"run","guardReason":"no-recent-success","seasonCheck":"ok","collect":{"conclusion":"success","startedAt":"2026-10-20T00:38:41Z","completedAt":"2026-10-20T00:43:04Z"},"deployedAt":"2026-10-20T00:44:07.000Z","deployConclusion":"success","conclusion":"success"},{"id":39351549153,"url":"https://github.com/sguys99/euro-digest/actions/runs/39351549153","event":"schedule","createdAt":"2026-10-20T01:06:17.000Z","runAttempt":1,"runStartedAt":"2026-10-20T01:06:17.000Z","inMorningWindow":false,"cron":"20 22 * * *","slot":null,"force":false,"triggerSeason":"winter","guard":"skip","guardReason":"off-season","seasonCheck":"ok","collect":{"conclusion":"skipped","startedAt":"2026-10-20T01:06:39Z","completedAt":"2026-10-20T01:06:38Z"},"deployedAt":null,"deployConclusion":null,"conclusion":"success"}]},"publish":{"runId":39348816122,"publishedAt":"2026-10-20T00:44:07.000Z","delayMinutes":164.1,"verdict":"late","manual":false,"outsideWindow":false},"logRunId":39348816122,"log":{"runId":"collect-prod-20261020T003904Z-f696","deadlineBasis":"off-slot","briefDeadline":"2026-10-20T00:47:04.079Z","footballData":{"at":"2026-10-20T00:39:27.431Z","fetched":4,"finished":4,"notFinished":0,"inProgress":{},"window":{"statuses":{"FINISHED":4},"unfinished":[],"unfinishedTotal":0}},"apiFootball":{"targets":13,"details":32,"pending":9,"goalsIncomplete":0,"brief":"complete","apiCalls":34,"stoppedBy":null},"briefAttempts":[{"attempt":1,"ok":true,"errorType":null,"verdict":"ok","tokensIn":5682,"tokensOut":3471,"cacheRead":0,"cacheWrite":0,"thinkingTokens":3229}],"briefSkips":[],"briefBudget":{"verdict":"ok","estimatedUsd":0.017607},"briefDone":{"verdict":"ok","publishedAi":5,"publishedTemplate":0,"droppedOutputLines":0},"briefPublish":{"mode":"llm","reason":"verified","action":"written"},"llm":{"calls":1,"minTimeoutMs":120000,"deadlineCut":0},"done":{"status":"success","exitCode":0}},"logError":null,"data":{"runs":[{"runId":"collect-prod-20261020T003904Z-f696","startedAt":"2026-10-20T00:39:04.079Z","status":"success","collected":468,"clusters":45,"summarized":5,"downgraded":0,"costUsd":0.002304,"tokens":{"in":5682,"out":3471,"cacheRead":0,"cacheWrite":0},"requests":1,"unbilledRiskUsd":null,"apiCalls":{"footballData":4,"apiFootball":34},"failedSources":[]}],"runsError":null,"totals":{"costUsd":0.002304,"requests":1,"in":5682,"out":3471,"cacheRead":0,"cacheWrite":0},"brief":{"mode":"llm","lines":5,"aiLines":5,"runId":"collect-prod-20261020T003904Z-f696"},"briefError":null,"news":{"cards":45,"runId":"collect-prod-20261020T003904Z-f696"},"newsError":null},"matchStatus":{"source":"window","at":"2026-10-20T00:39:27.431Z","finished":4,"inProgress":0,"otherUnfinished":0,"calledOff":0,"overdue":0,"unfinished":[],"unfinishedTotal":0},"notes":[]}
2026-10-21 {"v":1,"date":"2026-10-21","observedAt":"2026-10-22T01:44:27.333Z","season":"summer","publishTarget":"2026-10-20T22:00:00.000Z","seasonFirstDay":false,"trial":false,"actions":{"ok":true,"error":null,"runs":[{"id":39519357278,"url":"https://github.com/sguys99/euro-digest/actions/runs/39519357278","event":"schedule","createdAt":"2026-10-21T00:07:20.000Z","runAttempt":1,"runStartedAt":"2026-10-21T00:07:20.000Z","inMorningWindow":true,"cron":"40 21 * * *","slot":null,"force":false,"triggerSeason":"summer","guard":"run","guardReason":"no-recent-success","seasonCheck":"ok","collect":{"conclusion":"success","startedAt":"2026-10-21T00:07:51Z","completedAt":"2026-10-21T00:10:17Z"},"deployedAt":"2026-10-21T00:11:13.000Z","deployConclusion":"success","conclusion":"success"},{"id":39522596751,"url":"https://github.com/sguys99/euro-digest/actions/runs/39522596751","event":"schedule","createdAt":"2026-10-21T00:39:07.000Z","runAttempt":1,"runStartedAt":"2026-10-21T00:39:07.000Z","inMorningWindow":true,"cron":"20 22 * * *","slot":null,"force":false,"triggerSeason":"winter","guard":"skip","guardReason":"off-season","seasonCheck":"ok","collect":{"conclusion":"skipped","startedAt":"2026-10-21T00:39:40Z","completedAt":"2026-10-21T00:39:40Z"},"deployedAt":null,"deployConclusion":null,"conclusion":"success"}]},"publish":{"runId":39519357278,"publishedAt":"2026-10-21T00:11:13.000Z","delayMinutes":131.2,"verdict":"late","manual":false,"outsideWindow":false},"logRunId":39519357278,"log":{"runId":"collect-prod-20261021T000818Z-5933","deadlineBasis":"off-slot","briefDeadline":"2026-10-21T00:16:18.672Z","footballData":{"at":"2026-10-21T00:08:27.626Z","fetched":9,"finished":9,"notFinished":0,"inProgress":{},"window":{"statuses":{"FINISHED":9},"unfinished":[],"unfinishedTotal":0}},"apiFootball":{"targets":19,"details":9,"pending":10,"goalsIncomplete":0,"brief":"complete","apiCalls":11,"stoppedBy":null},"briefAttempts":[{"attempt":1,"ok":true,"errorType":null,"verdict":"ok","tokensIn":6205,"tokensOut":6551,"cacheRead":0,"cacheWrite":0,"thinkingTokens":6255}],"briefSkips":[],"briefBudget":{"verdict":"ok","estimatedUsd":0.017747},"briefDone":{"verdict":"ok","publishedAi":5,"publishedTemplate":0,"droppedOutputLines":0},"briefPublish":{"mode":"llm","reason":"verified","action":"written"},"llm":{"calls":1,"minTimeoutMs":120000,"deadlineCut":0},"done":{"status":"success","exitCode":0}},"logError":null,"data":{"runs":[{"runId":"collect-prod-20261021T000818Z-5933","startedAt":"2026-10-21T00:08:18.672Z","status":"success","collected":461,"clusters":45,"summarized":5,"downgraded":0,"costUsd":0.003896,"tokens":{"in":6205,"out":6551,"cacheRead":0,"cacheWrite":0},"requests":1,"unbilledRiskUsd":null,"apiCalls":{"footballData":2,"apiFootball":11},"failedSources":[]}],"runsError":null,"totals":{"costUsd":0.003896,"requests":1,"in":6205,"out":6551,"cacheRead":0,"cacheWrite":0},"brief":{"mode":"llm","lines":5,"aiLines":5,"runId":"collect-prod-20261021T000818Z-5933"},"briefError":null,"news":{"cards":45,"runId":"collect-prod-20261021T000818Z-5933"},"newsError":null},"matchStatus":{"source":"window","at":"2026-10-21T00:08:27.626Z","finished":9,"inProgress":0,"otherUnfinished":0,"calledOff":0,"overdue":0,"unfinished":[],"unfinishedTotal":0},"notes":["출력 6,000토큰 초과 1회(eval.output-over-alert 기준)"]}
2026-10-22 {"v":1,"date":"2026-10-22","observedAt":"2026-10-22T01:44:31.161Z","season":"summer","publishTarget":"2026-10-21T22:00:00.000Z","seasonFirstDay":false,"trial":false,"actions":{"ok":true,"error":null,"runs":[{"id":39698201955,"url":"https://github.com/sguys99/euro-digest/actions/runs/39698201955","event":"schedule","createdAt":"2026-10-22T00:11:42.000Z","runAttempt":1,"runStartedAt":"2026-10-22T00:11:42.000Z","inMorningWindow":true,"cron":"40 21 * * *","slot":null,"force":false,"triggerSeason":"summer","guard":"run","guardReason":"no-recent-success","seasonCheck":"ok","collect":{"conclusion":"success","startedAt":"2026-10-22T00:12:14Z","completedAt":"2026-10-22T00:14:35Z"},"deployedAt":"2026-10-22T00:15:38.000Z","deployConclusion":"success","conclusion":"success"},{"id":39701268264,"url":"https://github.com/sguys99/euro-digest/actions/runs/39701268264","event":"schedule","createdAt":"2026-10-22T00:42:13.000Z","runAttempt":1,"runStartedAt":"2026-10-22T00:42:13.000Z","inMorningWindow":true,"cron":"20 22 * * *","slot":null,"force":false,"triggerSeason":"winter","guard":"skip","guardReason":"off-season","seasonCheck":"ok","collect":{"conclusion":"skipped","startedAt":"2026-10-22T00:42:36Z","completedAt":"2026-10-22T00:42:35Z"},"deployedAt":null,"deployConclusion":null,"conclusion":"success"}]},"publish":{"runId":39698201955,"publishedAt":"2026-10-22T00:15:38.000Z","delayMinutes":135.6,"verdict":"late","manual":false,"outsideWindow":false},"logRunId":39698201955,"log":{"runId":"collect-prod-20261022T001235Z-4d9e","deadlineBasis":"off-slot","briefDeadline":"2026-10-22T00:20:35.991Z","footballData":{"at":"2026-10-22T00:12:51.174Z","fetched":10,"finished":10,"notFinished":0,"inProgress":{},"window":{"statuses":{"FINISHED":10},"unfinished":[],"unfinishedTotal":0}},"apiFootball":{"targets":10,"details":10,"pending":0,"goalsIncomplete":0,"brief":"complete","apiCalls":12,"stoppedBy":null},"briefAttempts":[{"attempt":1,"ok":true,"errorType":null,"verdict":"ok","tokensIn":6862,"tokensOut":6160,"cacheRead":0,"cacheWrite":0,"thinkingTokens":5912}],"briefSkips":[],"briefBudget":{"verdict":"ok","estimatedUsd":0.017919},"briefDone":{"verdict":"ok","publishedAi":5,"publishedTemplate":0,"droppedOutputLines":0},"briefPublish":{"mode":"llm","reason":"verified","action":"written"},"llm":{"calls":1,"minTimeoutMs":120000,"deadlineCut":0},"done":{"status":"success","exitCode":0}},"logError":null,"data":{"runs":[{"runId":"collect-prod-20261022T001235Z-4d9e","startedAt":"2026-10-22T00:12:35.991Z","status":"success","collected":465,"clusters":45,"summarized":5,"downgraded":0,"costUsd":0.003766,"tokens":{"in":6862,"out":6160,"cacheRead":0,"cacheWrite":0},"requests":1,"unbilledRiskUsd":null,"apiCalls":{"footballData":3,"apiFootball":12},"failedSources":[]}],"runsError":null,"totals":{"costUsd":0.003766,"requests":1,"in":6862,"out":6160,"cacheRead":0,"cacheWrite":0},"brief":{"mode":"llm","lines":5,"aiLines":5,"runId":"collect-prod-20261022T001235Z-4d9e"},"briefError":null,"news":{"cards":45,"runId":"collect-prod-20261022T001235Z-4d9e"},"newsError":null},"matchStatus":{"source":"window","at":"2026-10-22T00:12:51.174Z","finished":10,"inProgress":0,"otherUnfinished":0,"calledOff":0,"overdue":0,"unfinished":[],"unfinishedTotal":0},"notes":["출력 6,000토큰 초과 1회(eval.output-over-alert 기준)"]}
-->

<!-- gdelt-data v1 — probe:gdelt 기록(손대지 말 것). 한 줄 = 측정일 하나(제목·URL 없음)
2026-10-18 {"v":1,"date":"2026-10-18","measuredAt":"2026-10-18T06:15:35.848Z","trial":true,"contact":true,"attempts":[{"key":"ko-scale","attempt":1,"requestedAt":"2026-10-18T06:15:35.848Z","elapsedMs":13600,"status":429,"outcome":"rate-limited","results":null,"capped":false,"invalid":0,"latestSeen":null,"lagMinutes":null,"allow":null,"feedOnly":null,"deny":null,"notListed":null,"topHosts":[],"error":"HTTP 429"},{"key":"allow-domains","attempt":1,"requestedAt":"2026-10-18T06:15:55.452Z","elapsedMs":11362,"status":429,"outcome":"rate-limited","results":null,"capped":false,"invalid":0,"latestSeen":null,"lagMinutes":null,"allow":null,"feedOnly":null,"deny":null,"notListed":null,"topHosts":[],"error":"HTTP 429"},{"key":"ko-scale","attempt":2,"requestedAt":"2026-10-18T06:16:23.886Z","elapsedMs":14432,"status":200,"outcome":"ok","results":250,"capped":true,"invalid":0,"latestSeen":"2026-10-18T04:45:00.000Z","lagMinutes":91,"allow":0,"feedOnly":0,"deny":8,"notListed":242,"topHosts":[{"host":"zdnet.co.kr","count":30},{"host":"ohmynews.com","count":24},{"host":"biz.heraldcorp.com","count":23}],"error":null}]}
2026-10-22 {"v":1,"date":"2026-10-22","measuredAt":"2026-10-22T11:03:14.324Z","trial":false,"contact":true,"attempts":[{"key":"ko-scale","attempt":1,"requestedAt":"2026-10-22T11:03:14.324Z","elapsedMs":10571,"status":null,"outcome":"network","results":null,"capped":false,"invalid":0,"latestSeen":null,"lagMinutes":null,"allow":null,"feedOnly":null,"deny":null,"notListed":null,"topHosts":[],"error":"fetch failed"},{"key":"allow-domains","attempt":1,"requestedAt":"2026-10-22T11:03:30.902Z","elapsedMs":10495,"status":null,"outcome":"network","results":null,"capped":false,"invalid":0,"latestSeen":null,"lagMinutes":null,"allow":null,"feedOnly":null,"deny":null,"notListed":null,"topHosts":[],"error":"fetch failed"},{"key":"ko-scale","attempt":2,"requestedAt":"2026-10-22T11:03:56.467Z","elapsedMs":10494,"status":null,"outcome":"network","results":null,"capped":false,"invalid":0,"latestSeen":null,"lagMinutes":null,"allow":null,"feedOnly":null,"deny":null,"notListed":null,"topHosts":[],"error":"fetch failed"}]}
-->
