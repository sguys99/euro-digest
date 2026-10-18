# fixtures/actions/ — GitHub Actions 응답·collect 로그 샘플 (M1-41 관찰 도구)

`npm run observe`(scripts/observe.ts) 단위 테스트(`tests/observe.test.ts`)의 입력이다. 2026-10-18 15:19 KST에 `gh api`로 받은 **실제 응답에서 쓰는 키만 남겼다**(2026-10-18 = M1-40 수동 dispatch 3회 + 비활성 백업 schedule 2회가 있던 날).

| 파일 | 엔드포인트(키 없는 경로) | 내용 |
|---|---|---|
| `runs-2026-10-18.json` | `repos/sguys99/euro-digest/actions/workflows/collect.yml/runs?per_page=100&created=2026-10-17T15:00:00Z..2026-10-18T15:00:00Z` | 그 KST 하루의 collect.yml 실행 5건 — schedule `40 21 * * *`(08:24 KST 시작 — 1시간 44분 지연)·`20 22 * * *`(09:04)은 `COLLECT_ENABLED` 꺼짐으로 건너뜀, workflow_dispatch 3건(1건 + force 2건) |
| `jobs-39078890352.json` | `…/actions/runs/39078890352/jobs?filter=latest&per_page=100` | 건너뛴 schedule 실행 — 가드 success · collect·배포 skipped |
| `jobs-39100995214.json` | `…/actions/runs/39100995214/jobs?filter=latest&per_page=100` | 첫 수동 dispatch — 가드·collect·배포(빌드·Pages 배포 단계 05:39:36Z 완료) |
| `annotations-guard-skip.json` | `…/check-runs/117531618517/annotations` | 가드 notice 주석 `수집 건너뜀 (schedule-disabled)` + 러너 안내 주석 |
| `collect-log-2026-10-18.txt` | `…/actions/jobs/117597140997/logs` | collect job 로그 중 관찰 도구가 읽는 이벤트 15줄 + 형식이 다른 머리 줄 3줄(건너뛰기 확인) — 첫 줄 앞 BOM 그대로 |

- 남긴 키: 실행 `id·run_number·event·status·conclusion·created_at·updated_at·run_started_at·html_url·display_title·head_branch·run_attempt`, job `id·run_id·name·status·conclusion·started_at·completed_at·steps[name·status·conclusion·number·started_at·completed_at]`, 주석 `annotation_level·title·message·path·start_line·end_line`. 사용자·커밋 작성자·토큰·러너 정보는 지웠다.
- 로그 줄은 구조화 로그(scripts/lib/logger.ts — 비밀값·본문 없음) 원문 그대로다. 비밀값 패턴 검사 0건.
- 응답 구조를 그대로 보존한다(Prettier 제외 — fixtures/README.md).
