/**
 * M1-F 운영 관찰 문서 `docs/research/m1-observation.md`의 틀·표식 이름 — `npm run observe`(M1-41·M1-42)와
 * `npm run probe:gdelt`(M1-46)가 같은 문서를 나눠 쓴다(편집 규칙은 research-doc.ts).
 *
 * 관찰 기간(plan M1-F, 오케스트레이터 결정): 정기 실행 활성화 2026-10-19 → **2026-10-20 ~ 2026-10-26** 7일. 기간 앞의 날짜는
 * "관찰 전 시험"으로 표시하고 주간 판정에 넣지 않는다. 기간이 유럽 서머타임 전환(2026-10-25 01:00Z)을 지나므로 10-26(월)이
 * 겨울 첫 발행(07:30 — PRD §15 D26)이다.
 */
import { publishSeason, shiftDate } from "@/lib/time";

/** 저장소 루트 기준 문서 경로 */
export const OBSERVATION_DOC_REL = "docs/research/m1-observation.md";

/** 관찰 기간(발행일 KST, 양 끝 포함) */
export const OBSERVATION_PERIOD = Object.freeze({
  from: "2026-10-20",
  to: "2026-10-26",
});

/** 관찰 기간 앞(시험 측정)인가 */
export function isTrialDate(date: string): boolean {
  return date < OBSERVATION_PERIOD.from;
}

/** 발행일 계절이 전날과 다른가(서머타임 전환 뒤 첫 발행일 — 발행 시각·경기 시각 KST 표시 확인일) */
export function isSeasonFirstDay(date: string): boolean {
  return publishSeason(date) !== publishSeason(shiftDate(date, -1));
}

/** 기간의 날짜 목록(양 끝 포함, 최대 62일) */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = shiftDate(d, 1)) {
    out.push(d);
  }
  return out;
}

/** 표식 블록·데이터 블록 이름 */
export const OBS_BLOCKS = Object.freeze({
  daily: "observe:daily",
  week: "observe:week",
  details: "observe:details",
  gdeltTable: "gdelt:table",
  gdeltVerdict: "gdelt:verdict",
});
export const OBS_DATA = "observe-data";
export const GDELT_DATA = "gdelt-data";

/** 문서가 없을 때 쓰는 틀 — 판정 기준·열 설명은 여기 한 곳(D26·D48·M0-27·M0-28) */
export function observationDocTemplate(): string {
  return `# M1-F 운영 관찰 기록 — 발행 시각·비용·경기 상태·GDELT 재측정 (M1-41 · M1-42 · M1-46)

> 버전 v0.1 · 관찰 기간 **${OBSERVATION_PERIOD.from} ~ ${OBSERVATION_PERIOD.to}**(정기 실행 활성화 2026-10-19, plan M1-F) · 이 문서의 표·상세·숨은 데이터 줄은 도구가 쓴다 — \`npm run observe -- --date <발행일>\`(하루) · \`npm run observe -- --week --from <시작> --to <끝>\`(주간 요약) · \`npm run probe:gdelt\`(GDELT 하루 1회). 표의 **메모** 칸과 표식(\`<!-- … -->\`) 밖의 글은 도구가 지우지 않는다. 관찰 기간 앞 날짜는 "관찰 전 시험"으로 표시하고 주간 판정에 넣지 않는다.

## 판정 기준

- **목표 시각**(PRD §15 D26): 발행일의 계절로 정한다(\`src/lib/time.ts\` \`publishSlot\` — 유럽 서머타임 기간 **07:00**, 표준시 기간 **07:30** KST). 전환 순간이 일요일 10:00 KST라 2026-10-25(일)까지 07:00, **2026-10-26(월)부터 07:30**(겨울 첫 발행 — 발행 시각 변경과 경기 시각 KST 표시를 확인하는 날).
- **공개 시각**: 그날 첫 GitHub Pages 배포 완료(\`collect.yml\` → \`deploy.yml\`의 \`GitHub Pages 배포\` 단계 완료) 시각.
- **판정**(NFR-05, D48 ②): 정시 = 목표 시각 이전(일찍 공개 허용) · 허용 = 목표 +15분 이내 · 지각 = +15분 초과 · 미발행 = 그날 배포 없음 · 확인 불가 = Actions 조회 실패. 수동 dispatch(slot 없음)·아침 창(05:30~10:00 KST) 밖 실행이 처음 공개한 날은 판정을 참고로만 본다.
- **계절 가드**(M1-47): 계절에 맞지 않는 트리거(여름 07:10 dispatch·07:20 schedule / 겨울 06:30 dispatch·06:40 schedule)는 가드가 \`off-season\`으로 건너뛰어야 한다. 다른 판단으로 진행했으면 **계절 위반**.
- **경기 상태**(M0-28): 수집 시점에 브리핑 입력 창(UTC 하루 D-1 — \`briefInputWindow\`)의 football-data 경기 중 종료 / 진행 중 / 그 밖의 미종료(미시작·연기). 미종료(연기·중단 제외)인데 킥오프 뒤 130분이 지났으면 **점수 지연 의심**(무료 플랜 "Scores delayed"). 출처는 그 실행의 \`collect.matchdata.done\`(football-data) 로그의 \`windowStatus\`(경기별 상태)이고, 이 필드가 없는 옛 로그는 건수(진행 중·그 밖 미종료)만 적고 지연은 판정 불가로 둔다.
- **비용**(M1-42): \`data/runs.json\`의 그날(KST) prod collect 실행 합계 — 브리핑 요청 수(\`brief.requests\`), 토큰(캐시 읽기·쓰기 포함), \`costUsd\`. 요청 2개 이상인 날은 캐시 읽기(\`cacheRead\` > 0) 여부를 본다(D28 — 캐싱은 같은 지시문 2요청 이상일 때만 켬).

### 일자별 표 열

| 열 | 뜻 | 출처 |
|---|---|---|
| 발행일 | KST 발행일(파일명·runs 기록의 KST 날짜) | — |
| 계절·목표 | 여름/겨울 · 공개 목표 시각(KST) | \`publishSlot\` |
| 공개 | 그날 첫 배포 완료 시각(KST) | Actions jobs API |
| 지연(분) | 공개 − 목표(음수 = 일찍) | — |
| 판정 | 정시·허용·지각·미발행·확인 불가 | D48 ② |
| 트리거 | 그날 collect 실행 수: 실행 / 건너뜀(사유) · 계절 위반 수 | 가드 job·주석(annotation) |
| 상태 | 그날 prod collect 기록의 status(여러 번이면 차례로) | \`data/runs.json\` |
| 카드 | \`data/news/<발행일>.json\` 카드 수 | data |
| 브리핑 | mode(AI 줄/전체 줄) | \`data/briefs/<발행일>.json\` |
| 요청 | 그날 브리핑 요청 수 합(FR-29 재시도 포함) | runs \`brief.requests\` |
| 비용 | 그날 prod 비용 합(USD) | runs \`costUsd\` |
| 캐시 R/W | 캐시 읽기/쓰기 토큰 합 | runs \`tokens\` |
| 소스 실패 | 실패한 소스 id(오류 종류) | runs \`sources\` |
| 경기 상태 | 종료/진행 중/그 밖 미종료(지연 의심) | collect 로그 |
| 메모 | 사람이 적는 칸(도구가 보존) | — |

## 일자별 발행 (M1-41 · M1-42)

<!-- ${OBS_BLOCKS.daily}:start -->
(아직 기록 없음 — \`npm run observe -- --date <발행일>\`)
<!-- ${OBS_BLOCKS.daily}:end -->

## 주간 요약 (M1-42 입력 — PRD §9.3 비용표 갱신)

<!-- ${OBS_BLOCKS.week}:start -->
(아직 없음 — \`npm run observe -- --week --from ${OBSERVATION_PERIOD.from} --to ${OBSERVATION_PERIOD.to}\`)
<!-- ${OBS_BLOCKS.week}:end -->

## GDELT 재측정 (M1-46)

M0-27 결정 3: 관찰 기간에 **하루 1회, 쿼리 2개·요청 3건 이내**(1건은 429 재시도 여유), 요청 간 6초 이상(GDELT 429 본문 "one every 5 seconds"). 쿼리 ① \`sourcelang:korean\`(\`gd-ko-allow-domains\`의 lang에서 만든 언어 필터만 — 24시간 규모·seendate 지연 측정용, 수집 쿼리 아님) ② \`gd-ko-allow-domains\`(허용 도메인 OR — \`configs/search-queries.json\` q 그대로, 비활성 설정은 켜지 않고 읽기만). 공통 \`mode=ArtList&format=json&maxrecords=250&sort=DateDesc&timespan=1d\`. 허용 통과는 결과 URL 호스트로 \`configs/publisher-domains.json\` allow 판정(\`filterSearchResults\`). 결과 제목·URL은 저장하지 않는다(건수·호스트 빈도만).

재활성 기준(모두 충족하면 \`gd-ko-allow-domains\` 1개만 켜는 안을 사용자에게 — ❓): ① 7일 요청 성공률 ≥ 80% ② ① 쿼리 24시간 결과 수백 건(측정일 중앙값 ≥ 200, 250 상한 도달 포함) ③ 최신 seendate 지연 ≤ 60분(측정일 중앙값) ④ 허용 도메인 결과 주 1건 이상(기간 합).

<!-- ${OBS_BLOCKS.gdeltTable}:start -->
(아직 기록 없음 — \`npm run probe:gdelt\`)
<!-- ${OBS_BLOCKS.gdeltTable}:end -->

<!-- ${OBS_BLOCKS.gdeltVerdict}:start -->
<!-- ${OBS_BLOCKS.gdeltVerdict}:end -->

## 일자별 상세

<!-- ${OBS_BLOCKS.details}:start -->
<!-- ${OBS_BLOCKS.details}:end -->
`;
}
