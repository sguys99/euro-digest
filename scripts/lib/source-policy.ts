/**
 * 소스별 코드 규칙 — 약관·피드 성격 때문에 소스 id에 묶어 두는 상수 (plan M1-17 리뷰 반영, 스키마 변경 없음) — 순수 함수.
 *
 * ── 요약문을 읽지 않는 소스 (PRD §15 D48 — 2026-10-17 사용자 결정) ─────────────────
 *   약관이 불분명해 '원제목+링크 전용'으로 위험을 수용하고 등록한 소스(D22 — the Daily Briefing·Di Marzio·Relevo)는
 *   `configs/sources.json` note의 조건('description·content:encoded는 읽거나 표시하지 않음')을 지킨다 — RSS 요약문(description)을
 *   분류 입력으로도 쓰지 않는다(D39 ①의 예외). 피드 파서(rss.ts)가 그 소스의 요약문을 꺼내지 않고, 정규화(normalize.ts)도 `summary`를
 *   null로 둔다(이중 차단). 새 위험 수용 소스를 더할 때 이 목록도 함께 본다(`/add-source`).
 *
 * ── 링크 경로로 축구 기사만 (Relevo — 종합 스포츠 피드) ──────────────────────────
 *   Relevo 피드는 전 종목이다(M0-24 실측 — 15건/24시간 중 축구 10, NFL·모터사이클·테니스 혼입). sources.json note('링크 경로(/futbol/…)
 *   기반 축구 외 기사 필터(코드 규칙) 필수')대로 링크 경로가 `/futbol/`로 시작하지 않으면 축구 외 기사로 본다(news-scope.ts). 경로가
 *   `/futbol/`이면 제목의 다른 종목 표현으로 빼지 않는다(경로가 더 확실한 근거 — 'Mbappé, el Real Madrid y la NBA'). 링크를 읽지
 *   못하면 이 규칙을 쓰지 않는다(제목 규칙으로).
 */

/** 요약문(description)을 읽지 않는 소스 id(D48) */
export const SUMMARY_UNREAD_SOURCE_IDS: ReadonlySet<string> = new Set([
  "daily-briefing",
  "di-marzio",
  "relevo",
]);

/** 이 소스의 요약문을 읽는가(D48 — 위험 수용 소스는 읽지 않는다) */
export function readsSummary(sourceId: string): boolean {
  return !SUMMARY_UNREAD_SOURCE_IDS.has(sourceId);
}

/** 링크 경로로 축구 기사를 가리는 소스 — 소스 id → 그 소스의 호스트(끝 일치)와 축구 기사 경로 */
export const FOOTBALL_PATH_RULES: Readonly<
  Record<string, { host: string; path: RegExp }>
> = {
  relevo: { host: "relevo.com", path: /^\/futbol\//u },
};

/**
 * 링크 경로 판정 — 규칙이 있는 소스의 그 호스트 링크면 축구 기사 경로인지(true·false). 규칙이 없거나, 링크를 읽지 못하거나, 호스트가
 * 다르면 null(제목 규칙으로).
 */
export function footballByPath(sourceId: string, url: string): boolean | null {
  const rule = FOOTBALL_PATH_RULES[sourceId];
  if (rule === undefined) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== rule.host && !host.endsWith(`.${rule.host}`)) return null;
  return rule.path.test(parsed.pathname);
}
