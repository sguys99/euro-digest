# fixtures/highlightly/

Highlightly Football API 실응답 발췌 (M5-18, PRD §15 D80 — 경기 상세 프로바이더 교체). 어댑터 `scripts/lib/providers/highlightly.ts`·단계 `scripts/lib/highlightly-stage.ts`·팀 id 대응 `scripts/lib/team-ids-hl.ts` 단위 테스트(`tests/highlightly.test.ts`·`tests/highlightly-stage.test.ts`)의 고정 입력이다. 자동 테스트는 이 파일만 읽는다(네트워크 0).

- 출처: 직접 접근 `https://soccer.highlightly.net`(무료 Basic 플랜), 2026-11-17 실측 — `docs/research/m5-highlightly-probe.md`(12건) + M5-18 구현 실측. 원본 응답은 저장소 밖에만 두었다.
- **지운 것**: 모든 `logo` 키(팀·선수·대회·나라 이미지 URL — CLAUDE.md §1-6), 경기 상세의 `news`(기사 링크·이미지)·`predictions`·`statistics`·`venue`·`referee`·`forecast`, 팀의 `topPlayers`·`shots`, 박스스코어 선수 통계(골·도움 외). 남긴 키의 구조(중첩·null·시각 표기)는 그대로다.
- 값은 고치지 않았다. 지난 경기라 다시 받을 수 있지만(지난 날짜 조회 가능) 테스트가 기대하는 값이 바뀌지 않게 지우지 말 것.

| 파일 | 요청 | 쓰임 |
|---|---|---|
| `matches-bundesliga-name-2026-11-07.json` | `/matches?leagueName=Bundesliga&date=2026-11-07&timezone=UTC` | 목록 껍데기(`pagination`·`plan`) · **leagueName 함정**(오스트리아 Bundesliga 186302가 섞인다 — leagueId 67162로 거른다) |
| `matches-epl-2026-10-31.json` | `/matches?leagueId=33973&date=2026-10-31&timezone=UTC` | 목록 → 내부 형식 · 브렌트퍼드 2–0 포리스트(1325389883) |
| `matches-ucl-2026-11-04.json` | `/matches?leagueId=2486&date=2026-11-04&timezone=UTC` | 같은 시각·같은 스코어 경기 여럿(팀 id 짝짓기 모호 → 되풀이) |
| `match-1340510451.json` | `/matches/1340510451` (마인츠 1–2 바이에른, 2026-11-07) | 득점(일반·"90+2")·**VAR Goal Cancelled**(이재성 44분 — 득점 아님)·교체 의미(`player` 나감 · `substituted`·`assistingPlayerId` 들어옴) |
| `lineups-1340510451.json` | `/lineups/1340510451` | 포메이션 3-5-2 · 4-2-3-1, 행 배열(첫 행 골키퍼), 김민재 교체 명단 |
| `box-score-1340510451.json` | `/box-score/1340510451` | 출전 시간 — 이재성 선발 63분 · 김민재 교체 명단 0분(벤치) · 하프타임 골키퍼 교체 44 + 46분 |
| `match-1325389883.json` | `/matches/1325389883` (브렌트퍼드 2–0 노팅엄 포리스트, 2026-10-31) | **자책골**: 30분 Own Goal · 선수 밀렌코비치(포리스트) · `team` = 브렌트퍼드(득점 인정 팀) |
| `lineups-1325389883.json` | `/lineups/1325389883` | 자책 선수 소속(포리스트 라인업) · 행 안 순서 = 왼쪽 → 오른쪽(브렌트퍼드 4백 Lewis-Potter(LB) … Kayode(RB)) |
| `last-five-games-155666.json` | `/last-five-games?teamId=155666` (우니온 베를린, 2026-11-17) | 탐색 응답 형식(껍데기 없는 배열 — 목록 항목과 같은 키) · **클럽 친선**(Friendlies Clubs 568401 — 뺀다) · DFB Pokal 69715(6개 대회 밖 — 탐색 대상) |
