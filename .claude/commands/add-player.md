---
description: 한국 선수를 configs/korean-players.json에 등록하고 한글 표기(names.ko)·검색 쿼리(search-queries)를 함께 추가한다 (FR-60)
argument-hint: "<선수 이름 — 한글 또는 영문, 예: 손흥민 | Son Heung-min>"
---

# /add-player — 한국 선수 등록

대상: **$ARGUMENTS**

목적: 선수 1명을 명단·표기 사전·검색 쿼리 세 곳에 한 번에 등록해, 선수 페이지·주간 리포트·뉴스 태그가 같은 slug를 쓰게 한다.
근거: CLAUDE.md §11·§12(한국 선수 이적 감지) · PRD FR-60·FR-63·FR-64·FR-24 · plan 부록 A `KoreanPlayer` · plan M3-01

## 현재 상태 (M0-08 초안)
- 설정 파일: !`ls configs/*.json 2>/dev/null || echo "(configs/*.json 없음)"`
- `korean-players.json`·`names.ko.json`·`search-queries.json`과 zod 스키마는 아직 없다. 스키마 M0-16(`src/lib/schema/`), configs 검증 M0-17(`npm run validate`), 검색 쿼리 어댑터 M1-06, 명단 확정 M3-01에서 구현 예정.
- **그 전에는** 파일을 새로 만들지 않고 1~4단계 조사 결과와 등록안(JSON)만 보고한다. 사용자가 "지금 생성"을 고른 경우에만 부록 A 형태 그대로 만들고, M0-16에서 재검증이 필요하다고 적는다.

## 절차
1. **인자 확인** — 비어 있거나 동명이인 가능성이 있으면 AskUserQuestion으로 대상을 특정한다(소속 팀으로 구분).
2. **중복 확인** — `configs/korean-players.json`에서 `nameKo`·`nameEn`·`slug`를 검색한다. 이미 있으면 신규 등록 대신 **갱신 흐름**(이적·임대·`active` 변경)으로 바꿔 사용자에게 확인한다.
3. **정보 조사** — 출처는 공식 구단 스쿼드 페이지 → 리그 공식 사이트 → 대한축구협회(KFA) 순. 필드별 출처 URL을 기록한다.
   - `slug`: 영문 이름 kebab-case(예: `son-heung-min`). 한 번 정하면 바꾸지 않는다(공유 URL).
   - `nameKo`·`nameEn`: 구단·KFA 공식 표기. `team`: 팀 slug(`names.ko.json`·`team-colors.json`의 팀 slug와 일치).
   - `comp`: `EPL|LALIGA|SERIEA|BUNDESLIGA|LIGUE1|UCL` 중 소속 리그. 5대 리그 밖이면 `"OTHER"` + `active: false`(기록 갱신 중단, 목록 유지 — FR-64).
   - `position`: `GK|DF|MF|FW` · `birthYear`: 공식 프로필 기준.
   - `apiFootballId`: API-Football 응답(`/players?search=`·`/players/squads?team=`)으로 **확인한 값만**. 키가 필요하므로 provider 어댑터(M3 예정)를 쓰거나 사용자가 대시보드에서 확인한 값을 받는다. 확인하지 못하면 `null`. 호출은 1~2회로 끝낸다(하루 100회, 일일 계획 ≤ 60회 — §6.4).
4. **표기·쿼리 초안** — `names.ko.json`: 영문 표기와 변형(`Heung-min Son` 등 성·이름 순서 변형)을 한글 표기로 매핑. 성만 있는 짧은 형태(`Son`)는 오매칭 위험이 있어 넣지 않는다. `search-queries.json`: 한/영 쿼리 각 1개(예: `"손흥민"`, `"Son Heung-min"`). 일일 쿼리 상한(M0-26에서 결정)을 넘으면 질문한다.
5. **등록안 확인** — 아래 '사용자 확인 지점'을 거친다.
6. **반영** — 세 파일에 추가하고 기존 정렬 규칙을 따른다. 스키마에 없는 필드는 추가하지 않는다(필요하면 질문 — CLAUDE §2).
7. **검증** — `npm run validate`. M0-17 전에는 TODO만 출력되므로 `node -e "JSON.parse(require('fs').readFileSync('configs/korean-players.json','utf8'))"`로 문법만 확인하고 그 사실을 보고한다.
8. **연쇄 확인** — `team` slug가 `names.ko.json`·`team-colors.json`에 없으면 보고한다(M2-05 범위, 이 커맨드에서 팀 색을 지어내지 않는다).

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 대상 특정: 동명이인·후보가 여럿일 때 후보 목록(소속·포지션·생년) 제시.
- 등록안 확정: [확인된 필드만 등록, 미확인 `apiFootballId`는 null (추천)] / [ID 확인 후 다시 실행] / [취소].
- 기존 항목이 있을 때: [갱신 (추천)] / [새 항목] / [취소].
- 검색 쿼리가 일일 상한을 넘길 때: [기존 쿼리 정리 후 추가] / [쿼리 없이 등록].

## 금지 사항
- Transfermarkt·FBref·WhoScored·SofaScore·FotMob·네이버·다음·X를 출처로 쓰거나 자동 조회하지 않는다 (CLAUDE §1-5).
- 선수 사진·구단 로고를 내려받거나 참조하지 않는다 (§1-6).
- API ID·생년·포지션을 추측하지 않는다. 출처 없는 값은 비워 두고 보고한다 (§1-7).
- `.env*`를 읽거나 키를 출력하지 않는다. 키가 필요한 조회는 사용자에게 요청한다 (§1-8).
- `data/players/`를 손으로 고치지 않는다. 기록은 다음 파이프라인 실행에서 반영된다 (§8).

## 완료 보고 형식
```
## /add-player 결과 — <nameKo> (<nameEn>)
| 필드 | 값 | 출처 URL |
|---|---|---|
변경 파일: configs/korean-players.json · names.ko.json · search-queries.json (추가/갱신/미생성)
검증: npm run validate 통과 | M0-17 전이라 JSON 문법만 확인 | 실패(사유)
미확인·후속: (예) apiFootballId null — M3 어댑터에서 확인 / 팀 slug team-colors 미등록
```
