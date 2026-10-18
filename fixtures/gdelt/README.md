# fixtures/gdelt/ — GDELT DOC 2.0 API 응답 형식 샘플 (M1-46)

`npm run probe:gdelt`(scripts/gdelt-probe.ts) 단위 테스트(`tests/gdelt-probe.test.ts`)의 입력이다. **합성 값**이다 — 재측정 도구는 실제 응답을 저장하지 않는다(건수·호스트 빈도·seendate만 기록).

| 파일 | 형식 근거 | 내용 |
|---|---|---|
| `artlist-sample.json` | M0-27 "응답 필드(실측)" — `mode=ArtList&format=json` 200 응답의 키 이름·순서·`seendate` 형식(`YYYYMMDDTHHMMSSZ`)·`http://` 스킴 | 6항목: allow 도메인 1(interfootball.co.kr) · 목록 밖 3(hani.co.kr 2 · biz.heraldcorp.com 1) · feed-only 1(bbc.com) · `url` 없는 형식 오류 1. 최신 seendate 2026-10-18T05:45:00Z |
| `artlist-empty.json` | M0-27 — 빈 결과는 HTTP 200 + `{}`(`articles` 키 없음) | `{}` |
| `rate-limited.txt` | M0-27 — HTTP 429 + 일반 텍스트 본문(JSON 아님) | 429 본문 문구(연락처는 …로 줄임) |

- 제목은 `(합성 제목 n)`이고 URL은 실존하지 않는 기사 번호다. `socialimage`는 빈 문자열(이미지 URL을 넣지 않는다 — CLAUDE.md §1-6).
- 응답 구조를 그대로 보존한다(Prettier 제외 — fixtures/README.md).
