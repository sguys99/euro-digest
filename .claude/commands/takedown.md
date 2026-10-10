---
description: 삭제·정정 요청 카드를 configs/takedowns.json에 등록하고 재빌드·배포로 비공개 처리한 뒤 처리 시각을 기록한다 — 접수 후 72시간 이내 (FR-143)
argument-hint: "<card-id — c_ + 16진수 10자리, 예: c_8f3a1b2c4d> [사유]"
disable-model-invocation: true
---

# /takedown — 카드 비공개 처리

카드 ID: **$0** · 전체 인자: `$ARGUMENTS` (두 번째 이후는 사유)

목적: 삭제·정정 요청이 들어온 카드를 접수 후 **72시간 안에** 사이트에서 내린다. `data/`는 고치지 않고 `configs/takedowns.json`으로 처리한다.
근거: CLAUDE.md §8·§10·§11·§12 · PRD FR-143·FR-140·FR-154·§8.4·§15 D14 · plan 부록 A(takedowns) · M1-25·M1-29

## 현재 상태 (M0-08 초안)
- 지금: !`date -u +%Y-%m-%dT%H:%M:%SZ` (KST !`TZ=Asia/Seoul date +"%Y-%m-%d %H:%M"`)
- 등록 파일: !`ls configs/takedowns.json 2>/dev/null || echo "(configs/takedowns.json 없음)"`
- 스키마 M0-16, validate M0-17, 이슈 템플릿 `takedown` M0-10, `ci.yml` M0-12, `deploy.yml` M0-13, **빌드 제외·다음 수집의 원본 삭제 M1-25**, 커맨드 완성 M1-29에서 구현 예정.
- **M1-25 전에는** 발행된 카드가 없고 빌드가 takedowns를 읽지 않는다. 형식 검증·등록안까지만 하고 "실제 비공개 경로 미구현"으로 보고한다.

## 절차
1. **ID 검증** — `^c_[0-9a-f]{10}$`에 맞아야 한다. 공유 URL(`…/news/2026-10-10/#c_8f3a1b2c4d`)을 받았으면 앵커에서 ID를 뽑는다. 맞지 않으면 즉시 중단하고 올바른 형식을 안내한다.
2. **중복 확인** — `takedowns.json`에 이미 있으면 기존 `handledAt`만 보고하고 끝낸다.
3. **카드 찾기** — `grep -rl "<card-id>" data/news/`로 날짜 파일(월별 병합 파일 포함)을 찾아 제목·출처명·원문 URL만 보여 준다. 없으면 "미발행 또는 ID 오류"로 표시하고 선등록 여부를 묻는다.
4. **접수 정보** — `requestedAt`은 요청 접수 시각(메일 수신·이슈 생성 시각, UTC ISO 8601). 72시간 기준점이므로 모르면 추측하지 말고 묻는다. `reason`에는 요청 종류와 이슈 번호만 쓴다(예: `"저작권자 삭제 요청 (#12)"`). 공개 저장소이므로 요청자 이름·메일은 넣지 않는다.
5. **확인** — 아래 '사용자 확인 지점'에서 등록안과 커밋·배포를 승인받는다.
6. **등록** — `configs/takedowns.json`에 `{ "id", "requestedAt", "handledAt": null, "reason" }`를 추가한다. (`handledAt`을 비워 두는 방식은 M0-16 스키마 확정 시 함께 확인)
7. **검증·빌드** — `npm run validate` → `npm run build` → `grep -rl "<card-id>" out/`가 비어야 한다(뉴스 페이지·RSS·검색 인덱스·OG 모두).
8. **배포** — 커밋 `chore(takedown): <card-id> 비공개 처리 (FR-143)` → `git pull --rebase` → push → `ci.yml` 통과 시 `deploy.yml`이 배포한다. CI가 이 변경과 무관한 이유로 막히면 `gh workflow run deploy.yml --ref main`으로 수동 배포한다. **06:00~07:30 KST에는 push하지 않는다** (§10).
9. **배포 확인** — `curl -s https://sguys99.github.io/euro-digest/news/<date>/ | grep -c "<card-id>"`가 0인지 본다(Pages 캐시로 최대 10분 지연 가능).
10. **처리 시각 기록** — 확인한 시각을 `handledAt`에 적고 같은 방식으로 커밋·push한다. `handledAt - requestedAt`이 72시간을 넘었으면 보고서 맨 위에 적는다.
11. **원본 정리** — `data/` 원본 카드는 다음 수집 실행이 지운다(M1-25). git 이력에는 남는다는 점을 요청자 답변 초안에 포함한다(FR-143).

## 사용자 확인 지점 (AskUserQuestion — 선택지 + 추천안)
- 등록안(id·requestedAt·reason): [이대로 등록 (추천)] / [수정] / [취소].
- 커밋·배포: [지금 커밋·push → ci.yml 자동 배포 (추천)] / [커밋만, push는 직접] / [deploy.yml 수동 실행] — 금지 시간대면 "07:30 이후 push"를 추천으로 바꾼다.
- 카드를 찾지 못했을 때: [선등록 (추천 — 다음 발행부터 제외)] / [ID 재확인 후 다시 실행].

## 금지 사항
- `data/news/*.json`을 손으로 고치거나 카드를 지우지 않는다 (CLAUDE §8).
- 요청자 개인정보를 `takedowns.json`·커밋 메시지·이슈 댓글에 쓰지 않는다. `.env*`를 읽지 않는다 (§1-8).
- 사용자 확인 없이 커밋·push하지 않는다. force push·`reset --hard`로 이력을 지우지 않는다.

## 완료 보고 형식
```
## /takedown 결과 — <card-id>
| 항목 | 값 |
|---|---|
| 카드 | <date> · "<제목>" · <출처명> |
| requestedAt / handledAt (UTC) | … / … → 소요 N시간 (72시간 이내 ✓ / 초과 ✗) |
| 빌드 산출물 잔존 | 0건 (out/ grep) |
| 배포 | ci.yml run <URL> · 실사이트 확인 0건 |
| 원본 삭제 | 다음 collect 실행 예정(M1-25) |
요청자 답변 초안: (개인정보 없이 2~3문장)
```
