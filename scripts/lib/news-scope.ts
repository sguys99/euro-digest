/**
 * 서비스 범위 밖 기사 제외 — 축구 외 종목·K리그(국내 축구)·연예 (PRD FR-21, plan M1-17 — M1-09·M1-13·M1-14 이월) — 순수 함수.
 *
 * **클러스터링 전**(같은 URL 묶음 단계 — dedup.ts 다음, news-cluster.ts 앞)에 뺀다: 제목 유사도의 IDF·병합과 국내 몫(D44) 경쟁에
 * 섞이지 않게. 뺀 묶음은 카드·기억(seen-urls)에 남지 않는다(다음 실행에서 다시 판정 — 규칙이 같으면 같은 결과).
 *
 * 실측(M1-13·M1-14 dry, fixtures): Relevo는 종합 스포츠 피드(F1·체조·NFL·테니스·마라톤), 인터풋볼 전체기사 피드는 UFC·K리그·연예
 * (콘서트·결혼·영화제·K-pop — 동명이인 김지수·정우영), 풋볼리스트·베스트일레븐 전체기사는 K리그·국내 유소년.
 *
 * ── 판정 (순서대로, 첫 사유) ──────────────────────────────────────────────
 *   링크 경로     링크 경로 규칙이 있는 소스(source-policy.ts — Relevo `/futbol/`)는 경로가 정한다: 축구 경로가 아니면 non-football,
 *                축구 경로면 제목의 다른 종목 표현으로 빼지 않는다.
 *   non-football  다른 종목 표현이 제목에 있고 축구라는 근거가 없다. 근거 = 축구 표현(`FOOTBALL_CONTEXT_TERMS`)·범위 대회 표현·사전 선수
 *                태그(제목·요약문)·활성 등록 한국 선수(제목). 강한 표현(`NON_FOOTBALL_STRONG_TERMS` — NFL·NBA·F1·Euroliga)이면 **라틴
 *                제목의 팀 이름은 근거가 아니다**(NFL 런던 경기 'Eagles-Jaguars en Tottenham', 레알 마드리드 농구). 약한 표현(종목 이름 —
 *                golf·tennis)과 국내 제목은 사전 팀 태그도 근거다('Man Utd squad enjoy golf day', '케인 1골 프랑크푸르트 원정 승리').
 *   k-league      (국내 제목) K리그 표현(`K_LEAGUE_STRONG_TERMS` — K리그·[케리뷰]·코리아컵) 또는 K리그 구단 이름이 있고, 유럽 축구 근거
 *                (범위 대회 표현·빅클럽·사전 팀·선수·활성 등록 한국 선수)가 없다. **대표팀 기사**면 남긴다 — 분류의 대표팀 판정과 같은
 *                규칙(classify.ts `isNationalText`: 강한 표현 모레노호·A매치·대표팀 명단·소집·발탁, 또는 약한 표현 '대표팀'·국가 이름 —
 *                '파라과이전 앞둔 대표팀, K리그 선수 중용'·'K리그 MVP 이동경, 대표팀 발탁'). A매치(대표팀 발탁·소집·명단)는 K리그 선수
 *                이야기라도 서비스 범위다(오케스트레이터 결정 2026-10-17). 대표팀 약한 근거에 결과 표현이 함께면 K리그 경기 기사다.
 *   entertainment (국내 제목) 연예 표현(`ENTERTAINMENT_TERMS`·'♥')이 있고 축구 근거가 없다. 근거 = 축구 표현·범위 대회·빅클럽·사전 팀·
 *                승패·경기 사건 표현(제목·요약문), 또는 등록 선수 이름 + 축구에만 쓰는 선수 문맥어(`FOOTBALL_PLAYER_CONTEXT_TERMS` —
 *                데뷔전·선발 출전·풀타임·결승골 — '출전'·'원정'·'데뷔' 같은 일반어는 아니다: '김지수, 오디션 프로그램 출전'·'정우영 원정
 *                콘서트', M1-17 3차 리뷰). 이름 바로 앞뒤에 직업 명사가 붙으면('배우 김민재'·'가수 정우영') 등록 선수가 아니다(tag-names.ts).
 *                등록 선수 이름만으로는 근거가 아니다(배우 김지수·가수 정우영 — 동명이인). 축구 선수의 연예·사생활 기사
 *                ('케인, 콘서트서 깜짝 등장'·'음바페, 영화 카메오 출연'·'김민재 아내, 화보 공개')도 빠진다 — 서비스는 축구 소식 중심이라
 *                **의도한 동작**이다(사전 선수 태그는 근거로 쓰지 않는다, 오케스트레이터 결정 2026-10-17).
 *
 * ── 과잉 제외를 막는 쪽으로 ────────────────────────────────────────────────
 *   제외 신호는 **제목에서만** 찾고, 요약문(메모리 안 — D39 ①)은 근거(남기는 쪽)로만 쓴다. 국내 표현은 낱말 경계로 맞춘다
 *   (news-keywords.ts — '가수' ≠ '김민재가 수비', '골프' ≠ '골 프라이부르크', '당구' ≠ '해당 구단'). 신호가 애매한 기사(하부 리그·다른 나라
 *   리그·스코틀랜드)는 빼지 않는다 — 점수화의 범위 감점(score.ts 0.5)이 아래로 내린다. 진짜 유럽 축구 기사가 빠지는 것(독자가 알 수
 *   없는 누락)이 엉뚱한 카드가 보이는 것보다 나쁘다고 보고, 강한 신호 + 반대 근거 없음일 때만 뺀다.
 */
import { ENTERTAINMENT_MARKS, isNationalText, textSignals } from "./classify";
import type { DedupGroup } from "./dedup";
import {
  ENTERTAINMENT_TERMS,
  FOOTBALL_CONTEXT_TERMS,
  K_LEAGUE_CLUB_TERMS,
  K_LEAGUE_STRONG_TERMS,
  MATCH_EVENT_TERMS,
  NON_FOOTBALL_STRONG_TERMS,
  NON_FOOTBALL_WEAK_TERMS,
  FOOTBALL_PLAYER_CONTEXT_TERMS,
  RESULT_TERMS,
  compileGroup,
  isKoLang,
  matchTitles,
  matchesGroup,
  titleText,
  type KeywordIndex,
  type TermLang,
} from "./news-keywords";
import { footballByPath } from "./source-policy";
import { matchTitleTags, type TagIndex } from "./tag-names";

/** 제외 사유 */
export type ScopeExclusionReason =
  "non-football" | "k-league" | "entertainment";

export const SCOPE_EXCLUSION_REASONS: readonly ScopeExclusionReason[] = [
  "non-football",
  "k-league",
  "entertainment",
];

const LANGS: readonly TermLang[] = ["latin", "en", "it", "es", "ko"];

const GROUPS = {
  nonFootballStrong: compileGroup(NON_FOOTBALL_STRONG_TERMS),
  nonFootballWeak: compileGroup(NON_FOOTBALL_WEAK_TERMS),
  football: compileGroup(FOOTBALL_CONTEXT_TERMS),
  kStrong: compileGroup(K_LEAGUE_STRONG_TERMS),
  kClub: compileGroup(K_LEAGUE_CLUB_TERMS),
  entertainment: compileGroup(ENTERTAINMENT_TERMS),
  /** 승패·경기 사건 표현(연예 판정의 남기는 근거 — '영화 같은 역전극') */
  matchSignal: compileGroup({
    terms: Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        [
          ...(RESULT_TERMS.terms[lang] ?? []),
          ...(MATCH_EVENT_TERMS.terms[lang] ?? []),
        ],
      ]),
    ),
    koInfix: RESULT_TERMS.koInfix,
  }),
  /** 축구에만 쓰는 선수 기사 문맥어 — 연예 표현과 함께 나올 때의 남기는 근거('데뷔'·'출전'·'원정' 같은 일반어는 아니다) */
  playerContext: compileGroup(FOOTBALL_PLAYER_CONTEXT_TERMS),
} as const;

/** 판정 맥락 */
export interface ScopeContext {
  keywords: KeywordIndex;
  tags: TagIndex;
}

/** 판정할 기사 1건 */
export interface ScopeItem {
  title: string;
  lang: string;
  /** RSS 요약문(메모리 안 — 남기는 근거로만) */
  summary: string | null;
  /** 소스 id(링크 경로 규칙 — 없으면 쓰지 않는다) */
  source?: string;
  /** 원문 링크(링크 경로 규칙) */
  url?: string;
}

interface Evidence {
  /** 축구 표현 */
  football: boolean;
  /** 범위 대회 표현 */
  comps: boolean;
  /** 빅클럽(점수화 표) */
  bigClub: boolean;
  /** 사전 팀 태그 */
  teams: boolean;
  /** 사전 선수 태그 */
  players: boolean;
  /** 활성 등록 한국 선수 */
  korean: boolean;
  /** 승패·경기 사건 표현 */
  matchSignal: boolean;
  /** 선수 기사 문맥어(국내) */
  playerContext: boolean;
}

function evidenceOf(text: string, lang: string, ctx: ScopeContext): Evidence {
  const hits = matchTitles([{ title: text, lang }], ctx.keywords);
  const tags = matchTitleTags(text, lang, ctx.tags);
  const t = titleText(text, lang);
  return {
    football: matchesGroup(t, GROUPS.football),
    comps: hits.comps.length > 0,
    bigClub: hits.bigClubs.length > 0,
    teams: tags.teams.length > 0,
    players: tags.players.length > 0,
    // 이름 바로 앞뒤에 직업 명사가 붙은 이름('배우 김민재')은 등록 선수가 아니다(tag-names.ts `occupationPlayers`)
    korean: hits.koreanPlayers.some(
      (slug) => !tags.occupationPlayers.includes(slug),
    ),
    matchSignal: matchesGroup(t, GROUPS.matchSignal),
    playerContext: matchesGroup(t, GROUPS.playerContext),
  };
}

/** 기사 1건의 제외 사유(남기면 null) — 머리 주석 순서 */
export function scopeExclusion(
  item: ScopeItem,
  ctx: ScopeContext,
): ScopeExclusionReason | null {
  const byPath =
    item.source !== undefined && item.url !== undefined
      ? footballByPath(item.source, item.url)
      : null;
  if (byPath === false) return "non-football";

  const text = titleText(item.title, item.lang);
  const ko = isKoLang(item.lang);
  const strong =
    byPath !== true && matchesGroup(text, GROUPS.nonFootballStrong);
  const weak = byPath !== true && matchesGroup(text, GROUPS.nonFootballWeak);
  const kStrong = ko && matchesGroup(text, GROUPS.kStrong);
  const kClub = ko && matchesGroup(text, GROUPS.kClub);
  const entertainment =
    ko &&
    (matchesGroup(text, GROUPS.entertainment) ||
      ENTERTAINMENT_MARKS.test(item.title));
  if (!strong && !weak && !kStrong && !kClub && !entertainment) return null;

  const title = evidenceOf(item.title, item.lang, ctx);
  const summary = item.summary
    ? evidenceOf(item.summary, item.lang, ctx)
    : null;
  const either = (pick: (e: Evidence) => boolean) =>
    pick(title) || (summary !== null && pick(summary));

  if (strong || weak) {
    // 팀 이름은 국내 제목·약한 표현에서만 근거(라틴 강한 표현은 NFL 'en Tottenham'·레알 마드리드 농구)
    const teamsCount = ko || !strong;
    const football =
      either((e) => e.football || e.comps || e.players) ||
      title.korean ||
      (teamsCount && either((e) => e.teams || e.bigClub));
    if (!football) return "non-football";
  }
  if (kStrong || kClub) {
    const european = either(
      (e) => e.comps || e.bigClub || e.teams || e.players || e.korean,
    );
    // 대표팀 기사(분류와 같은 판정 — 사전 팀 태그가 있으면 위 european이라 여기서는 클럽 팀 0)
    const national = isNationalText(textSignals(item.title, item.lang), 0);
    if (!european && !national) return "k-league";
  }
  if (entertainment) {
    const football =
      either(
        (e) => e.football || e.comps || e.bigClub || e.teams || e.matchSignal,
      ) ||
      (title.korean && title.playerContext);
    if (!football) return "entertainment";
  }
  return null;
}

/** 묶음 단계 제외 결과 */
export interface ScopeFilterResult {
  /** 남긴 묶음(입력 순서) */
  kept: DedupGroup[];
  /** 뺀 묶음 수(사유별) */
  excluded: Record<ScopeExclusionReason, number>;
  /** 뺀 묶음 수(대표 소스 id별 — 로그용) */
  bySource: Record<string, number>;
}

/** 같은 URL 묶음들 → 범위 밖 기사를 뺀 묶음(머리 주석). 묶음 대표 항목의 제목·언어·요약문·소스·링크로 판정한다 */
export function filterOutOfScope(
  groups: readonly DedupGroup[],
  ctx: ScopeContext,
): ScopeFilterResult {
  const excluded: Record<ScopeExclusionReason, number> = {
    "non-football": 0,
    "k-league": 0,
    entertainment: 0,
  };
  const bySource: Record<string, number> = {};
  const kept: DedupGroup[] = [];
  for (const group of groups) {
    const source = group.sources[0] ?? group.item.source;
    const reason = scopeExclusion(
      {
        title: group.item.title,
        lang: group.item.lang,
        summary: group.item.summary,
        source,
        url: group.item.url,
      },
      ctx,
    );
    if (reason === null) {
      kept.push(group);
      continue;
    }
    excluded[reason] += 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
  }
  return { kept, excluded, bySource };
}
