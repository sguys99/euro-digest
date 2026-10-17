---
description: 삭제·정정 요청 카드를 configs/takedowns.json에 등록하고 재빌드·배포로 비공개 처리한 뒤 처리 시각을 기록한다 — 접수 후 72시간 이내 (FR-143)
argument-hint: "<card-id·공유 링크·원문 URL — 여러 장이면 쉼표로, 예: c_8f3a1b2c4d> [사유]"
disable-model-invocation: true
---

# /takedown — 카드 비공개 처리

대상: **$0** · 전체 인자: `$ARGUMENTS` (첫 인자를 쉼표로 나눠 카드마다 진행, 두 번째 이후는 사유)

목적: 삭제·정정 요청이 들어온 카드를 접수 후 **72시간 안에** 사이트에서 내린다. `data/`는 고치지 않고 `configs/takedowns.json`으로 처리한다.
근거: CLAUDE.md §8·§10·§11·§12 · PRD FR-143·FR-140·FR-154·§8.4 · PRD §15 D14·D45 ③ · plan 부록 A(takedowns) · M1-16·M1-25 이월(M1-29)

## 현재 상태 (M1-29 — 2026-10-17)
- 지금: !`date -u +%Y-%m-%dT%H:%M:%SZ` (KST !`TZ=Asia/Seoul date +"%Y-%m-%d %H:%M"`)
- 등록: !`node -e 'try{const t=require("./configs/takedowns.json");const open=t.filter(x=>x.handledAt===null);console.log(t.length+"건 · handledAt 미기록 "+open.length+"건"+(open.length?" — "+open.map(x=>x.id+"(접수 "+x.requestedAt+")").join(", "):""))}catch(e){console.log("(configs/takedowns.json 읽기 실패 — 빌드가 실패한다)")}'`
- 구현됨(M1-25):
  - ① **빌드 제외**: `src/lib/data/news.ts`(`readIssue` → `withoutTakedowns`)가 등록 ID와 **저장된** `card.id`가 같은 카드를 뺀다. 등록만으로 적용되고 handledAt과는 무관하다. 등록 파일이 없거나 깨지면 빌드가 실패한다(fail-closed — 전날 사이트 유지).
  - ② **원본 삭제**: 다음 수집 실행의 ⓪ 단계(`scripts/lib/purge-stage.ts`, 뉴스 단계 전)가 처리한다.
    - **모든 날짜 파일**에서 그 ID 카드를 지운다.
    - 지운 카드의 출처 링크 해시를 `data/cache/seen-urls.json`에 먼저 기록해 다시 카드가 되지 않게 한다. 기억을 쓰지 못하면 지우지 않고 다음 실행이 다시 시도한다.
    - 로그는 `collect.purge.done`이다. 원본만 바로 지우는 단독 명령은 없다(제안만 — plan M1-25 이월).
  - ③ **발행 검증 게이트 경고**(`scripts/lib/publish-gate.ts`): ⑥ 남은 삭제 요청 카드, ⑦ 접수 후 72시간이 지났는데 handledAt이 null.
- **정상 경고**:
  - 등록 직후 `npm run validate`는 `삭제 요청 카드 <id>가 남아 있음` 경고를 **그 카드가 든 날짜 파일마다 1건** 낸다. 보통 1건이고, 같은 ID가 두 파일에 있으면 2건이다(예: `c_fb2dd57b4a` — 10-12·10-13). 다음 수집 실행 뒤 사라진다.
  - 접수 후 72시간이 지났는데 handledAt이 아직 null이면 72시간 경고도 정상이다. 11단계에서 기록하면 사라진다.
  - 둘 다 경고라 CI를 막지 않는다. 카드 수 하한(≥10, 휴식기 5)도 삭제 요청 카드를 함께 세므로, 등록 push가 게이트에 막히지 않는다.
- 카드 ID는 **저장된 값으로만** 찾는다. 원문 URL에서 `cardIdFor`로 다시 계산하지 않는다 — 2026-10-14까지 발행분은 옛 규칙 ID다(M1-16).
- 지금 빌드되는 페이지는 홈(최신 호)뿐이다. 날짜 아카이브(M1-33)·RSS(M4-11)·검색(M4-14)·OG(M5-01)는 아직 없다. 이 경로들도 생기면 같은 로더를 거친다(`tests/takedown-build-guard.test.ts`).

## 절차
1. **대상 확인** — 인자를 쉼표·공백으로 나눠 카드마다 2~5단계를 거친다. 커밋은 한 번에 한다.
   - 공유 링크(`…/news/2026-10-10/#c_8f3a1b2c4d`)면 앵커에서 ID를 뽑는다. ID는 `^c_[0-9a-f]{10}$`이어야 한다.
   - ID 없이 **원문 URL**만 받았으면 3단계 명령으로 URL로 찾아 **저장된** `id`를 쓴다.
   - 형식이 틀리면 즉시 중단하고 올바른 형식을 안내한다.
2. **중복 확인** — `takedowns.json`에 이미 있으면 기존 `requestedAt`·`handledAt`만 보고하고 그 카드는 끝낸다.
3. **카드 찾기** — 카드 ID나 원문 URL로 일별·월별 파일 전부를 찾는다. 원문 URL은 `www.`·끝 슬래시·`#`·추적 파라미터(`utm_*`·`at_*`)를 떼고 비교한다. 쿼리 자체는 남긴다 — `idxno=` 같은 기사 번호가 쿼리에 있다. 결과로는 제목·출처명·링크만 보여 준다.
   ```bash
   node -e 'const fs=require("fs");const q=process.argv[1];const norm=(u)=>{try{const x=new URL(u);for(const k of [...x.searchParams.keys()])if(/^(utm_|at_)/.test(k))x.searchParams.delete(k);return x.host.replace(/^www\./,"")+x.pathname.replace(/\/$/,"")+x.search}catch{return u}};for(const f of fs.readdirSync("data/news").filter((n)=>/^\d{4}-\d{2}(-\d{2})?\.json$/.test(n)).sort()){const d=JSON.parse(fs.readFileSync("data/news/"+f,"utf8"));for(const c of d.cards){const i=c.src.findIndex((s)=>norm(s.u)===norm(q));if(c.id===q||i>=0)console.log([f,c.id,c.id===q?"ID 일치":i===0?"대표 출처":"출처 #"+i,JSON.stringify(c.t),c.src.map((s)=>s.n+" "+s.u).join(" · ")].join(" | "))}}' "<card-id 또는 원문 URL>"
   ```
   - 결과가 없는데 URL이 조금 다를 수 있으면(AMP·모바일 주소 등), 기사 경로의 고유한 부분으로 `grep -l "<경로 일부>" data/news/*.json`도 해 본다. ID는 항상 찾은 카드의 저장된 `id`를 쓴다.
   - 같은 ID가 여러 날짜에 있으면 등록 한 건으로 모두 처리된다. 빌드 제외와 원본 삭제가 모두 ID 기준이다.
   - URL이 다른 카드의 **비대표 출처**(`출처 #n`)로만 나오면: takedown은 카드 단위라 출처 하나만 빼는 기능이 없다. 그 카드를 통째로 내릴지 묻는다(연쇄 삭제는 제안만 — plan M1-25 이월).
   - 대표 카드를 내려도 같은 링크가 다른 카드의 출처로 남아 있으면 함께 보고한다.
   - 아무 줄도 없으면 "미발행 또는 ID 오류"로 표시하고 선등록 여부를 묻는다.
4. **요청 종류**
   - **정정 요청**: 카드 제목·링크는 피드 원문 그대로라(D23) 고칠 수 없다. 비공개 처리(이 절차)로 갈지 묻는다. 분류 태그 오류라면 `summary-error` 흐름(분류 규칙 개선 — CLAUDE §12)으로 넘길지도 함께 묻는다.
   - **오늘의 5줄 브리핑 줄**(`data/briefs/` — 무기한 보존, D45 ③)은 카드가 아니라 이 커맨드 대상이 아니다. 중단하고 보고한다.
5. **접수 정보**
   - `requestedAt`: 요청 접수 시각이다(이슈 생성 시각 `gh issue view <번호> --json createdAt`, 또는 메일 수신 시각). **UTC `Z` 형식**으로 쓴다(`2026-10-17T03:12:00Z` — `+09:00` 같은 오프셋은 스키마가 거부한다). 72시간 기준점이므로 모르면 추측하지 말고 묻는다.
   - `reason`: 요청 종류와 이슈 번호만 쓴다(예: `"저작권자 삭제 요청 (#12)"`, 메일 접수면 `"매체 삭제 요청 (이메일 접수)"`). 공개 저장소이므로 요청자 이름·메일은 넣지 않는다.
6. **확인** — 아래 '사용자 확인 지점'에서 등록안과 커밋·배포를 승인받는다.
7. **등록** — `configs/takedowns.json` 배열 끝에 `{ "id", "requestedAt", "handledAt": null, "reason" }`를 추가한다. 스키마 규칙(`src/lib/schema/takedown.ts`): 모르는 키는 오류이고, ID 중복을 금지하며, handledAt은 등록 때 null이다(값이 있으면 requestedAt 이후).
8. **검증·빌드**
   - `npm run validate`: 위 정상 경고만 나와야 한다. 오류가 나오면 중단한다.
   - `npm run build`
   - `grep -rl "<card-id>" out/`: 비어 있어야 한다. 대표 원문 URL의 경로 일부로도 grep한다.
   - 지금은 최신 호만 빌드하므로, 지난 날짜 카드는 원래 0건이다. 이 검사가 실제로 무언가를 확인하는 것은 최신 호의 카드일 때다.
9. **커밋·배포**
   - 순서: `npm run check`(커밋 전 필수 — CLAUDE §10) → 커밋 `chore(takedown): <card-id> 비공개 처리 (FR-143)` → `git pull --rebase` → push → `ci.yml`이 통과하면 `deploy.yml`이 배포한다.
   - CI가 이 변경과 무관한 이유로 막히면 `gh workflow run deploy.yml --ref main -f ref=main`으로 수동 배포한다.
   - **06:00~08:00 KST에는 push하지 않는다**(§10 — 계절 무관).
10. **배포 확인**
    - `gh run list --workflow deploy.yml --limit 1`로 성공 여부와 SHA를 본다.
    - 실사이트는 캐시 우회 쿼리를 붙여 확인한다(Pages CDN 캐시로 최대 10분 지연):
      ```bash
      curl -s -o /dev/null -w "%{http_code}\n" "https://sguys99.github.io/euro-digest/?v=$(date +%s)"    # 200이어야 한다
      curl -s "https://sguys99.github.io/euro-digest/?v=$(date +%s)" | grep -c "<card-id>"           # 0이어야 한다
      ```
    - 날짜 아카이브(M1-33)가 생긴 뒤에는 `…/euro-digest/news/<date>/`도 같은 방식으로 본다. 200이 아니면 0건이어도 확인이 아니다.
11. **처리 시각 기록** — 확인한 시각(UTC `Z`)을 `handledAt`에 적는다. 커밋 `chore(takedown): <card-id> 처리 시각 기록 (FR-143)`을 9단계와 같은 방식으로 push한다. `handledAt - requestedAt`이 72시간을 넘었으면 보고서 맨 위에 적는다.
12. **원본 삭제 확인**(다음 수집 실행 뒤)
    - 봇 발행 커밋 뒤 3단계 명령 결과가 0줄이어야 하고, `npm run validate`에 남은 카드 경고가 없어야 한다.
    - 남아 있으면 삭제 단계가 실패한 것이다. 실행 로그 `collect.purge.*`와 Actions 오류 주석에서 원인을 찾아 보고한다. 삭제 단계 실패는 이슈가 자동으로 생기지 않는다(plan M1-25 이월 → M1-27).
    - 요청자 답변 초안에는 공개 저장소의 git 이력에는 남는다는 점을 넣는다(FR-143).

## 한계 (보고에 적는다)
- **카드 단위만 처리한다**: 그 링크가 다른 카드의 비대표 출처로 있으면 남는다(3단계에서 확인).
- **90일 뒤 재수집 가능성**: `seen-urls`는 90일 뒤 정리된다. 그 뒤 피드가 같은 기사를 새 날짜로 다시 내면 새 카드가 될 수 있다. 옛 규칙 ID 카드였다면 ID가 달라 빌드 제외도 피한다. 막으려면 takedown 링크 해시를 따로 저장해야 한다(스키마 변경 — 제안만).

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 등록안(id·requestedAt·reason): [이대로 등록 (추천)] / [수정] / [취소].
- 커밋·배포: [지금 커밋·push → ci.yml 자동 배포 (추천)] / [커밋만, push는 직접] / [deploy.yml 수동 실행]. 금지 시간대면 "08:00 이후 push"를 추천으로 바꾼다.
- 카드를 찾지 못했을 때: [선등록 (추천 — 다음 발행부터 제외)] / [ID 재확인 후 다시 실행].
- 원문 URL이 비대표 출처로만 있을 때: [그 카드 전체 비공개] / [보류 — 요청자에게 범위 확인 (추천)].
- 정정 요청: [비공개 처리 (추천 — 원제목은 고칠 수 없음, D23)] / [분류 태그 오류로 summary-error 처리] / [둘 다].

## 금지 사항
- `data/news/*.json`을 손으로 고치거나 카드를 지우지 않는다(CLAUDE §8). 원본은 다음 수집 실행이 지운다.
- 카드 ID를 URL에서 다시 계산하지 않는다 — 저장된 `id`만 쓴다(M1-16).
- 요청자 개인정보를 `takedowns.json`·커밋 메시지·이슈 댓글에 쓰지 않는다. `.env*`를 읽지 않는다(§1-8).
- 사용자 확인 없이 커밋·push하지 않는다. force push·`reset --hard`로 이력을 지우지 않는다.

## 완료 보고 형식
```
## /takedown 결과 — <card-id>
| 항목 | 값 |
|---|---|
| 카드 | <date>(여러 날짜면 모두) · "<제목>" · <출처명> · 같은 링크의 다른 카드: 없음/<id> |
| requestedAt / handledAt (UTC) | … / … → 소요 N시간 (72시간 이내 ✓ / 초과 ✗) |
| 검증 | validate 경고 N건(남은 카드 — 정상) · 빌드 산출물 잔존 0건(out/ grep) |
| 배포 | deploy.yml run <URL> · SHA · 실사이트 200 · 잔존 0건 |
| 원본 삭제 | 다음 collect 실행 예정(⓪ purge) / 확인 완료(<커밋>) |
요청자 답변 초안: (개인정보 없이 2~3문장 — git 이력에는 남을 수 있음 포함)
```
