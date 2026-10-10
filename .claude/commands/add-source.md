---
description: 새 뉴스 소스 후보의 RSS 유효성·robots.txt·약관을 확인해 표로 보고하고, 사용자 승인 후에만 configs/sources.json에 등록한다 (FR-01·FR-08·FR-09)
argument-hint: "<소스 URL — RSS 피드 또는 사이트 주소>"
---

# /add-source — 뉴스 소스 추가

후보 URL: **$ARGUMENTS**

목적: 약관·robots.txt를 확인한 소스만 수집 대상이 되게 한다. 등록은 이 절차로만 한다.
근거: CLAUDE.md §1-5·§2·§6.4·§11 · PRD FR-01·FR-02·FR-08·FR-09·FR-11 · plan 부록 A `Source` · M0-23~25

## 현재 상태 (M0-08 초안)
- 오늘(UTC): !`date -u +%F`
- 설정 파일: !`ls configs/sources.json 2>/dev/null || echo "(configs/sources.json 없음)"`
- `Source` zod 스키마(M0-16)·configs 검증(M0-17, `npm run validate`)은 완료. 수집 로더(`enabled && terms_checked`만) M1-02, 커맨드 완성 M1-29에서 구현 예정. **그 전에는** 1~5단계 확인·보고까지 하고, 사용자가 승인하면 부록 A `Source` 형태로 `sources.json`을 만들거나 추가한다.
- M0 검증 기간(M0-23~25)에는 같은 결과를 `docs/research/m0-validation.md`에도 기록한다.

## 절차
1. **금지 사이트 즉시 판정** — 호스트가 Transfermarkt·FBref·WhoScored·SofaScore·FotMob·네이버·다음·X(트위터)이거나 유료 본문(페이월) 사이트면 **즉시 중단**하고 사유만 보고한다. 추가 요청·등록안·크롤러 모두 만들지 않는다.
2. **중복 확인** — `sources.json`에 같은 URL·도메인이 있는지 본다. 있으면 기존 항목 갱신 여부를 묻는다.
3. **RSS 확인** — 요청은 모두 `-A "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; sguys99@gmail.com)"`로 보내고, 같은 호스트 요청 사이 2~3초 간격을 둔다.
   - 예: `curl -sSL --max-time 15 -A "<위 UA>" "<URL>" | head -c 5000`
   - 확인: RSS/Atom 형식, 항목 수, 최신 `pubDate`(7일 이내인지), 제목·링크·날짜·작성자·요약(description) 필드 유무와 길이(요약문은 분류 입력으로만 쓰고 표시·저장하지 않는다 — M0-25), 언어, 축구 외 기사 비율.
   - 피드에 본문(`content:encoded` 등)이 있으면 "본문 필드는 버림"이라고 표에 적는다. 수집 대상은 제목 + RSS 요약 + `og:description`뿐이다.
   - RSS가 없으면 `type: crawl` 후보로 보고, 목록(제목·링크·날짜·작성자)과 OG 메타만으로 충분한지 판단한다.
4. **robots.txt** — `https://<host>/robots.txt`를 받아 `User-agent: *`와 봇별 규칙이 피드·목록 경로를 막는지 확인한다. AI·크롤러 전면 차단(예: GPTBot·ClaudeBot Disallow)이 있으면 위험으로 표시한다.
5. **약관** — 이용약관·RSS 이용 조건 페이지를 찾아 ① 헤드라인·발췌·링크 재게시 허용 범위 ② 자동 수집 금지 조항 ③ AI 요약·가공 제한 ④ 출처 표시 요구 ⑤ 비상업 조건을 확인한다. 근거 URL과 핵심 문구(짧게 인용)를 남기고, 찾지 못하거나 모호하면 **"불명확"**으로 적는다.
6. **등록안 작성** — `id`(kebab-case), `name`, `type`(rss/crawl/search/journalist/aggregator/analysis), `url`, `lang`, `enabled`, `summarize`(필수 — 기본 `false` = 원제목+링크 전용(PRD §15 D22·D23). `true`는 약관이 AI 요약을 허용하고 사용자가 LLM 요약 경로를 다시 열기로 승인했을 때만, CLAUDE §1-3), `weight`(0~3), `tier`(1~3), `competitions`, `author?`, `terms_checked`(note에 적은 이용 방식이 약관상 허용될 때만 true), `robots_checked`, `note`(예: `"2026-10-10 확인 — 약관 <URL> 헤드라인·링크 허용 / robots <URL> 피드 경로 허용"`). tier·weight는 추천 근거를 붙인다.
7. **보고 → 승인** — 아래 표와 함께 '사용자 확인 지점'을 거친다. 승인 전에는 파일을 수정하지 않는다.
8. **반영** — 승인된 내용만 `sources.json`에 쓴다. 소스 URL은 이 파일에만 두고 코드에 하드코딩하지 않는다 (§6.4). `type: crawl`이면 `scripts/crawlers/<site>.ts`가 필요하다고 후속 작업으로 보고만 한다(이 커맨드에서 만들지 않는다).
9. **검증** — `npm run validate` (스키마 + 교차 참조 — search 소스는 `search-queries.json`의 `source`가 참조).

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 등록 여부: [등록 `enabled: true`] / [근거만 기록, `enabled: false`] / [등록 안 함] — 약관 "불명확"이면 `enabled: false` 또는 등록 안 함을 추천한다.
- 이용 방식: [원제목+링크 `summarize: false` (기본)] / [제외] — 뉴스 기사는 LLM에 보내지 않으므로(PRD §15 D23) 모든 소스는 `summarize: false`로 등록한다. 약관이 AI 요약을 허용해도 `true`는 LLM 요약 경로를 다시 여는 결정이라 별도로 묻는다(CLAUDE §1-3). 약관에 AI·머신러닝 이용 금지, 제목 수정 금지 조항이 있으면 원제목 무수정 조건을 note에 적고, 재게시 자체가 막히면 제외를 추천한다 (D22·D23).
- tier·weight·competitions 값 (추천값과 근거 제시).
- robots.txt에 AI 봇 차단 조항이 있을 때 진행 여부.
- 소스를 늘리면 카드 후보가 늘어난다. 일일 카드 선별 상한(`MAX_ITEMS_PER_RUN=45`)은 그대로 두며, 상한 변경이 필요하면 별도로 묻는다 (§2). 뉴스는 LLM에 보내지 않으므로 LLM 비용은 늘지 않는다 (D23).

## 금지 사항
- 금지 사이트·유료 본문은 어떤 이유로도 크롤러·등록안을 만들지 않는다 (CLAUDE §1-5).
- 본문 수집 금지 — 제목 + RSS 요약 + `og:description`만 (§1-5). 기사 이미지·로고를 받지 않는다 (§1-6).
- 사용자 승인 없이 `terms_checked: true`·`robots_checked: true`를 쓰지 않는다 (§2·§6.4).
- `.env*`를 읽지 않는다 (§1-8).

## 완료 보고 형식
```
## /add-source 결과 — <name> (<host>)
| 항목 | 결과 | 근거 |
|---|---|---|
| 금지 사이트 | 해당 없음 | — |
| RSS | 유효(Atom, 30건, 최신 2026-10-10) / 없음 | <피드 URL> |
| 요약·본문 필드 | description 평균 180자(분류 입력만, 표시·저장 안 함) / content:encoded 있음 → 버림 | |
| robots.txt | 피드 경로 허용 / AI 봇 차단 있음 | <robots URL> |
| 약관 | 허용 / 제한(…) / 불명확 | <약관 URL> "인용" |
| 등록안 | type·lang·tier·weight·competitions | 추천 근거 |
결정: 등록(enabled true/false) | 보류 · 변경 파일 · 검증 결과 · 후속(크롤러 필요 등)
```
