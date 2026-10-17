---
description: data/cache/unknown-names.json의 미등록 고유명사를 빈도순으로 한글 표기안·근거와 함께 제시하고, 사용자가 확인한 것만 configs/names.ko.json에 반영한다 (FR-24)
argument-hint: "[개수(기본 20) | 특정 영문 이름]"
---

# /add-name — 미등록 고유명사 반영

인자: **$ARGUMENTS** (숫자면 상위 N개, 문자열이면 그 이름 하나만, 비어 있으면 상위 20개)

목적: 데이터 API 응답과 브리핑 출력(LLM은 영문 그대로 출력)에 나온 고유명사를 코드가 일관되게 한글로 바꾸게 표기 사전을 채운다. 같은 사전이 다음에도 쓰인다(PRD §15 D23·D24·D39 ②).
- 브리핑 치환·조사 보정
- 브리핑 입력 정리(득점자를 대표 영문 표기로)
- 뉴스 카드 팀·선수 태그(원제목 매칭과 한글 표시 — 원제목 텍스트는 바꾸지 않음)
- 브리핑 영문 토큰 허용 목록(M1-23)

근거: CLAUDE.md §6.2(고유명사 코드 치환)·§8·§11·§12 · PRD FR-24·FR-60 · PRD §15 D30·D39 ②·D46 · plan §16(매주 월요일 루틴) · M1-17·M1-21 이월(M1-29)

## 현재 상태 (M1-29 — 2026-10-17)
- 캐시: !`node -e 'try{const d=JSON.parse(require("fs").readFileSync("data/cache/unknown-names.json","utf8"));const n=Object.entries(d.names).sort((a,b)=>b[1].count-a[1].count);console.log(n.length+"개 (갱신 "+d.updatedAt+") — 상위 5: "+n.slice(0,5).map(([k,v])=>k+" ×"+v.count).join(", "))}catch(e){console.log(e.code==="ENOENT"?"(unknown-names.json 없음 — prod·비dry 수집 실행만 만든다)":"(읽기 실패: "+String(e.message).split("\n")[0]+")")}'`
- 사전: !`node -e 'const d=require("./configs/names.ko.json");const c={};for(const e of d.entries)c[e.kind]=(c[e.kind]||0)+1;console.log(d.entries.length+"항목 "+JSON.stringify(c)+" · ignore "+(d.ignore||[]).length+"개")'`
- 뉴스 태그 겹침 규칙: !`ls scripts/lib/tag-names.ts scripts/lib/team-leagues.ts 2>/dev/null || echo "(tag-names.ts·team-leagues.ts 없음 — M1-17 병합 전)"`
- 구현됨(M1-21):
  - 치환·조사 보정·입력 정리: `scripts/lib/names.ts`
  - 미등록 이름 적재: `scripts/lib/unknown-names.ts`(호출 — `scripts/lib/collect-run.ts` `recordUnknownNames`)
  - 태그 한글 표시: `src/lib/data/names.ts` — 빌드 때 사전으로 slug → 한글
- 적재 대상: 데이터 API 이름(입력 정리를 거친 브리핑 입력의 팀·득점자·도움)과, 브리핑 출력에서 치환한 뒤에도 남은 이름(치환 구간을 가린 텍스트 기준).
  - **prod·비dry 실행만 파일을 쓴다.** dev·dry는 로그와 `[dry] 미등록 고유명사` 출력만 남긴다.
  - 사전 `en`·`ignore`·대회 별칭에 오른 이름은 **다음 prod 실행이 캐시에서 자동으로 뺀다**(`summarize.names.unknown` 로그의 `pruned`). 캐시는 손으로 고치지 않는다.
- 캐시 항목(`src/lib/schema/cache.ts` `UnknownNameSchema`):
  - 키: 영문 표기 그대로(같은 대상의 다른 표기는 다른 키).
  - `count`: 실행 1번에 1회씩 센다. `firstSeen`·`lastSeen`.
  - `kind`: 데이터 API 입력에서 온 이름이면 team/player로 추정한다. 없으면 브리핑 출력에서만 본 이름이다.
  - `cards`: 지금은 늘 `[]` — 뉴스 태그 출처는 아직 적재하지 않는다.
- 캐시가 없으면: 인자로 이름을 받았으면 그 이름만 2~6단계로 진행한다. 아니면 "적재된 미등록 이름 없음"으로 끝낸다. prod 발행 실행이 아직 돌지 않았으면 파일이 없을 수 있다(D48 ④).

## 표기 정책 (PRD §15 D39 ②·D46 — 2026-10-17 확정)
- **KFA 기준 통일**: 대한축구협회 표기(소집 명단·기사)가 1순위 근거다.
- **통칭**: 팀은 KFA 명단 방식의 통칭을 쓴다.
  - 법인·형태 말을 뺀다: 토트넘·도르트문트·레버쿠젠·라이프치히·로마.
  - '시티'·'유나이티드'는 유지한다: 맨체스터 시티·리즈 유나이티드.
  - 구어 약칭(맨시티·맨유)은 쓰지 않는다.
- **예외**: Club Brugge → '클럽 브뤼헤'(KFA '클뤼프 브뤼허' 대신 매체 관례). 새 예외는 사용자 결정으로만 만든다.
- **5대 리그 밖 한국 선수는 넣지 않는다**(손흥민 LAFC 등 — FR-60 범위, 국내 카드 제목은 원래 한글). 5대 리그 한국 선수는 이 커맨드가 아니라 `/add-player`로 등록한다(명단·검색 쿼리와 같은 slug로 함께). 외국 선수는 소속 리그와 무관하게 대상이다.
- **대회 이름은 넣지 않는다.**
  - 6개 대회 표기는 `configs/competitions.json`의 `nameKo`·`shortKo`(D30)가 단일 출처다.
  - 영문 별칭은 `scripts/lib/names.ts`의 `COMPETITION_EN_ALIASES`(코드 상수)다. 6개 대회의 새 표기(스폰서 이름 등)는 이 상수를 고쳐야 하므로 보고만 한다.
  - 그 밖의 대회는 `kind: "competition"` 항목으로 넣을 수 있다.
- **보류 중**: Viking FK·Sabah FK(D46 — 국내 매체 표기 근거 없음). 새 근거로 넣기로 하면 `tests/names-ko-dict.test.ts`의 `PENDING`에서도 뺀다(테스트 머리 주석 규칙).

## 절차
1. **대상 추출**: 캐시를 `count` 내림차순(같으면 `lastSeen` 최신순)으로 정렬해 인자만큼 고른다.
   - 이미 사전 `en`(대소문자·악센트 무시)이나 `ignore`에 있는 이름은 "정리 대기 — 다음 prod 실행이 뺌"으로만 센다.
   - **'X. 성' 축약 형태**('H. Kane' — `isInitialForm`)는 따로 본다. 축약 별칭은 치환·이름 찾기에 쓰이지 않는다. 그래서 사전에 있어도 '등록됨'으로 세지 않고, 캐시에서도 빠지지 않는다.
   - 사전에 이미 그 축약 별칭이 있다면 브리핑 입력 정리에서 소속팀 확인이 실패했다는 신호다(이적·임대, 또는 코드 표 누락). 표기 문제가 아니므로 `scripts/lib/names.ts`의 `KNOWN_PLAYER_TEAMS`(선수 slug → 소속팀 slug) 점검으로 보고한다.
2. **걸러내기**
   - 고유명사가 아닌 것(일반어·LLM 오출력·라운드 표기)은 `ignore` 후보로 둔다. 제외 결정은 여기에 기록하고, 다음 prod 실행이 캐시에서 뺀다.
   - 오타는 제외 후보로 둔다.
   - 같은 대상의 표기 변형(`Vinicius Jr`·`Vinícius Júnior`)은 묶는다. 사전 매칭은 대소문자·악센트를 무시하므로, 악센트만 다른 표기는 따로 넣지 않아도 맞는다.
   - 기존 항목의 새 변형이면 새 항목이 아니라 그 항목의 `en`에 별칭으로 더한다.
   - 5대 리그 한국 선수는 `/add-player`로 넘긴다. 5대 리그 밖 한국 선수는 넣지 않는다(D46). 반복해서 쌓이면 `ignore`에 기록할지 묻는다.
3. **근거 조사** — 아래 순서로 찾는다. 출처마다 URL을 남긴다.
   - ① **KFA**(kfa.or.kr 소집 명단·기사).
   - ② **한국어 위키백과 문서명**: en.wikipedia langlinks API로 찾는다. 토큰·비용은 없다. 이름 여러 개를 `|`로 묶어 한 번에 최대 50개까지 보낼 수 있고, UA를 붙인다:
     ```bash
     curl -sS --max-time 15 -A "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; sguys99@gmail.com)" \
       "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=langlinks&lllang=ko&redirects=1&titles=Viking%20FK|Erling%20Haaland"
     ```
     - 결과에 `langlinks`가 없으면 한국어 문서가 없다는 뜻이다.
     - 이름이 영문 문서명과 다르거나 동명이인이면 `list=search&srsearch=<이름> footballer`로 문서명을 먼저 찾는다(`(footballer)` 문서 확인).
     - 위키 문서명은 규범 근거 하나일 뿐이다. 국내 매체 관례가 다르면(위키 '노팅엄 포리스트' ↔ 매체 '노팅엄 포레스트' — D46) 후보 둘을 함께 제시한다.
   - ③ **국내 매체 RSS 제목**: 두 곳에서 찾고, 제목 수·매체·날짜를 적는다.
     - 저장된 카드: `grep -ho '"t": "[^"]*<후보 표기>[^"]*"' data/news/*.json`
     - 국내 수집 대상 피드(인터풋볼·풋볼리스트·베스트일레븐): 피드 URL은 `node -e 'console.log(require("./configs/sources.json").filter(x=>x.lang==="ko"&&x.enabled&&x.terms_checked).map(x=>x.url).join("\n"))'`로 얻는다. 위와 같은 UA를 붙여 피드당 1회, 2~3초 간격으로 받고, `<title>`에서만 센다(요약문은 보지 않는다).
   - ④ 국립국어원 외래어 표기법(해당 언어 세칙).
   - ⑤ 구단 한국어 공식 채널.
   - 영문 표기 출처도 적는다: football-data 정식·짧은 이름, API-Football 이름. 각 API 응답이나 `fixtures/football/`에서 확인한 값만 쓴다.
4. **표기안 작성** — 항목마다 적는다:
   - 영문(캐시 키)·유형·원어(국적·언어)
   - 한글 표기안·근거(URL 2곳 이상 권장)
   - count·first/last·출처(데이터 API/브리핑 — `kind` 유무로 구분)
   - 확신도: **확실**(규범·관용 일치) / **관용**(규범과 다르지만 관용이 굳음) / **통칭**(KFA 통칭 정책 적용) / **확정**(표기가 갈려 사용자가 고름 — 날짜). note는 **이 넷 중 하나로 시작해야 한다**(`tests/names-ko-dict.test.ts`). 근거가 부족하면(불확실) 표기안을 비우고 **보류**한다. 발음을 추측해 채우지 않는다.

   **항목 형식**(`src/lib/schema/names.ts` `NameEntry`): `{ "ko", "en": [대표, 별칭…], "kind", "slug"?, "note" }`
   - `en[0]` = 대표 영문 표기.
     - 팀: football-data 정식 이름(예 `Aston Villa FC`).
     - 선수: 성·이름 전체(예 `Harry Kane`). 브리핑 입력 정리가 득점자를 이 표기로 바꿔 모델에 넘기므로 축약형을 쓰지 않는다.
   - `en` 별칭:
     - 데이터 API 짧은 이름(football-data `shortName`·API-Football 이름)과 브리핑 출력 표기를 넣는다.
     - 이번 시즌 6개 대회 팀이면 football-data 정식 이름과 짧은 이름을 **둘 다** 넣어야 한다(`tests/names-ko-dict.test.ts`). 짧은 이름이 다른 팀과 겹치면 예외 목록 `SHORT_NAME_NOT_ALIAS`에 넣을지 묻는다(선례: 'Deportivo' — D46).
     - **사전 전체에서 한 번만** 쓸 수 있다(대소문자 무시 — validate 오류).
     - 성만 있는 짧은 형태('Kane'·'Olise')나 일반어·도시와 겹치는 짧은 이름('Nice'·'Lens'·'Como'·'Villa'·'Palace'·'Forest')은 기본적으로 넣지 않는다. 치환 오매칭과 뉴스 오태그 위험이 있다. 꼭 필요하면 질문한다.
     - **선수 성 별칭 정책은 아직 정하지 않았다**(M1-17 이월 — 선수 태그 재현율이 낮은(6/26) 원인). 사용자가 정하기 전까지 넣지 않고, 후보로만 보고한다.
     - M1-17 병합 뒤에는 뉴스 태그가 `scripts/lib/tag-names.ts`의 `AMBIGUOUS_TAG_TERMS`로 겹치는 별칭을 막는다. 그 목록에 없는 겹치는 말을 넣으려면 코드 추가가 필요하다고 보고한다.
   - **'X. 성' 축약 별칭은 넣지 않는다**(기본 — 추천).
     - 넣으려면 `scripts/lib/names.ts`의 `KNOWN_PLAYER_TEAMS`에 선수 slug → 소속팀 slug도 함께 필요하다. 이는 코드 수정이라 사람이나 별도 작업이 해야 하고, 이 커맨드는 보고만 한다.
     - 소속팀 없이 넣으면 `tests/names-ko-dict.test.ts`가 실패하고, 넣더라도 치환에는 쓰이지 않는다.
     - 등록 한국 선수는 `korean-players.json` 소속팀을 쓰므로 표가 필요 없다. 다만 등록 경로는 `/add-player`다.
     - 감독 축약 별칭은 쓰이는 곳이 없다.
   - `ko`: 라틴 글자는 약칭 PSV·AEK·AC·FC·CP·LASK만 쓸 수 있다(테스트). 다른 라틴 약칭이 필요하면 질문한다.
   - `slug`:
     - **팀은 필수다.**
       - `configs/team-ids.json`에 있는 팀이면 그 slug를 쓴다. 그 note의 `fd "<이름>"`도 `en`에 들어 있어야 한다.
       - 없으면 M0-32 규칙을 따른다: `npx tsx -e 'import("./scripts/lib/team-ids-draft.ts").then((m) => console.log(m.teamSlugFromName("<football-data 정식 이름>").slug))'`.
       - 5대 리그 팀은 팀→리그 표(`scripts/lib/team-leagues.ts` `TEAM_LEAGUES`, M1-17)의 slug와도 같아야 한다(`tests/team-leagues.test.ts`).
     - 선수는 대표 영문 이름에서 악센트를 떼고 kebab-case로 만든다(`Vinícius Júnior` → `vinicius-junior`). 같은 유형 안에서 겹치면 validate 오류다.
     - slug는 한 번 정하면 바꾸지 않는다. 카드 태그와 앞으로의 팀·선수 페이지 URL이 slug를 쓴다. 바꾸면 옛 카드 태그가 화면에서 사라지고, 공개 URL 변경은 질문 사항이다.
   - `note`: 확신도 머리말, 한글 근거 URL, 영문 출처(`영문: football-data 'X'·short 'Y', API-Football 'Z'`)를 적는다. 기존 결정 ID(D46 등)는 그 결정에 든 항목에만 쓴다(테스트가 D46 항목 수를 센다). 새 확정은 `확정(사용자 결정 YYYY-MM-DD)`으로 쓴다.
5. **확인 요청**: 10~20개씩 표로 제시하고 '사용자 확인 지점'을 거친다.
6. **반영**: 승인된 항목만 넣는다.
   - 새 항목은 같은 유형 묶음의 끝에 넣는다. 파일 순서: 한국 선수 → 팀 → 선수 → 감독.
   - 기존 항목의 변형은 그 항목 `en` 끝에 더한다.
   - 제외 확정은 `ignore`에 넣는다.
7. **검증**
   - `npm run validate -- --configs-only`: 스키마 — 영문 표기 중복(대소문자 무시)·ignore와 겹침·유형별 slug 중복을 본다.
   - `npx vitest run tests/names-ko-dict.test.ts tests/names.test.ts`: 사전 규칙 가드 — note 머리말·라틴 글자·팀 slug 규칙·축약 별칭 소속팀·대회 이름·D46·손흥민 미등록을 본다. M1-17 병합 뒤에는 `tests/tag-names.test.ts tests/team-leagues.test.ts`도 돌린다.
   - **치환 미리보기**(토큰 0): 새 표기가 어떻게 바뀌는지, 엉뚱한 말에 맞지 않는지 본다. 대회 이름은 브리핑 단위 표기라 미리보기에서는 영문 그대로 남는다.
     ```bash
     npx tsx -e 'Promise.all([import("./scripts/lib/names.ts"), import("node:fs")]).then(([n, fs]) => { const read = (f) => JSON.parse(fs.readFileSync(f, "utf8")); const i = n.buildNameIndex(read("configs/names.ko.json"), read("configs/competitions.json")); for (const s of process.argv.slice(1)) { const r = n.substituteNames(s, i); console.log(r.text, "| 남은 후보:", n.unknownNamesInText(r.masked, i).join(", ") || "-"); } })' "Viking FK가 Bodø/Glimt을 이겼다" "Arsenal beat Brighton 2-1"
     ```
   - 커밋 전 `npm run check`·`npm run build`(CLAUDE §10).
8. **캐시 정리**: `data/cache/unknown-names.json`은 손으로 고치지 않는다. 반영한 이름(`en`·`ignore`)은 다음 prod 실행이 뺀다. 'X. 성' 키는 빠지지 않고 남는다(1단계).
9. **영향 알림·커밋**
   - `ko`를 바꾸면 다음 빌드부터 **모든 카드 태그 표시에 소급된다**(태그는 slug, 한글은 빌드 때 사전에서 찾음).
   - 저장된 브리핑 줄(`data/briefs/` — 치환 뒤 문장)에는 소급되지 않는다.
   - 커밋은 사용자가 고른 경우에만 한다: `chore(config): names.ko 표기 N개 추가 — <요지> (FR-24)`. 06:00~08:00 KST에는 push하지 않는다.

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 묶음 승인: [확실·관용·통칭 등급만 반영 (추천)] / [표 전체 반영] / [항목별로 수정 지시] / [모두 보류].
- 표기가 갈리는 항목(규범 vs 관용, KFA vs 매체, 위키 vs 매체): 후보 2~3개 + 추천 1개. 고르면 `확정(사용자 결정 날짜)`으로 기록한다.
- 제외 후보: [`ignore`에 기록 — 반복 검출 멈춤 (추천)] / [그대로 둠].
- 'X. 성' 축약 이름: [전체 이름 항목만 등록 — 축약은 미반영 (추천)] / [축약 별칭 + `KNOWN_PLAYER_TEAMS` 추가를 별도 작업으로 요청].
- 기존 사전 표기를 바꿔야 할 때: 카드 태그는 소급되고 저장된 브리핑은 소급되지 않는다는 점을 알리고 변경 여부를 묻는다. slug는 바꾸지 않는다.

## 금지 사항
- 근거 없는 표기를 만들지 않는다 (CLAUDE §1-7). 보류도 정상 결과다.
- 근거 확인을 위해 네이버·다음 등 포털과 금지 사이트를 열거나 자동 조회하지 않는다. KFA·위키백과 API·국내 매체 RSS 카드·WebSearch·공식 사이트만 쓴다 (§1-5).
- `data/`(캐시·발행 카드)를 손 편집하지 않는다 (§8).
- 코드(`scripts/lib/names.ts`의 `KNOWN_PLAYER_TEAMS`·`COMPETITION_EN_ALIASES`·`PROTECTED_LATIN_PHRASES`, M1-17의 `AMBIGUOUS_TAG_TERMS` 등)를 이 커맨드에서 고치지 않는다 — 필요하면 보고한다. `tests/names-ko-dict.test.ts`의 `PENDING`·`SHORT_NAME_NOT_ALIAS` 목록만 사용자 결정에 맞춰 고칠 수 있다.
- LLM 호출을 추가하지 않는다. 표기 결정은 이 대화에서 사람이 확인한다 (§1-3).

## 완료 보고 형식
```
## /add-name 결과 — 후보 N개 중 반영 X · 보류 Y · 제외(ignore) Z · 정리 대기 W
| 영문 | 유형 | 표기안 | 확신도 | 근거 | count | 결정 |
|---|---|---|---|---|---|---|
| Viking FK | 팀(노르웨이) | (비움) | 불확실 | 위키 '비킹 FK'뿐 — 국내 매체·KFA 표기 없음(D46 보류 유지) | 2 | 보류 |
| Michael Olise | 선수(프랑스) | — | — | 이미 등록(사전 en) — 다음 prod 실행이 캐시에서 뺌 | 1 | 정리 대기 |
변경 파일: configs/names.ko.json (+X 항목 · 별칭 +A · ignore +Z) · 검증: validate · 사전 테스트 · check
코드 쪽 필요(보고만): (예) KNOWN_PLAYER_TEAMS 'J. Doe' 소속팀 · AMBIGUOUS_TAG_TERMS 'Lens'
남은 미등록: N개 (다음 실행 권장 시점 — 다음 월요일 루틴)
```
