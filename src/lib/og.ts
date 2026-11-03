/**
 * 공유 OG 이미지 — 어느 쪽이 어떤 이미지를 쓰는지, 이미지 안 글자, `og:image:alt` (PRD DR-10 · §15 D13 · D71 ②, DESIGN §9.3 D3
 * "OG 템플릿" · "링크 미리보기 메타", plan M5-01). I/O 없는 순수 모듈 — 페이지 메타(`src/lib/seo.ts`)와 빌드 스크립트
 * (`scripts/build-og.ts` — 템플릿 HTML을 Playwright로 찍는다)가 **같은 카드 값**을 쓴다(경로 · alt · 글자가 어긋나지 않게).
 *
 * 카드 5종(경로는 `artifacts.ogImage` — src/lib/paths.ts)
 * | 종류 | 면 | 쓰는 쪽 | 경로 |
 * |---|---|---|---|
 * | 기본 | 레드 | 홈 · 한국 선수 상세 · 주간 리포트 · 404 · `/offline/` · 그 밖의 쪽 | `/og/default.png` |
 * | 날짜 | 레드 | `/news/{date}/` · `/news/`(최신 호) | `/og/news/{date}.png` |
 * | 쪽 이름형 | 레드 | `OG_PAGES`의 고정 쪽(2026-11-03 사용자 결정 — 기본 OG에 쪽 제목만 바꾼 판) | `/og/pages/{name}.png` |
 * | 대회 | 크림 | `/competitions/{comp}/` | `/og/competitions/{comp}.png` |
 * | 팀 | 크림 | `/teams/{team}/` | `/og/teams/{team}.png` |
 *
 * **결과 노출 0**(D30 · DECISIONS D0 #9 — 링크 미리보기는 결과 가리기로 막을 수 없다): 이미지 글자 · alt는 워드마크 · 태그라인 · 호수 ·
 * 날짜 · 쪽 제목 · 대회 · 팀 이름과 시즌만. 스코어 · 승패 · 순위는 넣지 않는다 — `assertNoScore`(seo.ts `hasScoreLike`)로 막는다.
 */
import { issueNumber } from "@/lib/issue";
import { archiveDateLabel } from "@/lib/news/archive";
import type { OgImage } from "@/lib/paths";
import { seasonLabel } from "@/lib/rest-period";
import type { CompId } from "@/lib/schema/common";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/** OG 이미지 크기(px) — `og:image:width` · `og:image:height` */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** 영문 워드마크(마스트헤드 · 아이콘 ED의 머리글자) */
export const OG_LATIN_WORDMARK = "EURO DIGEST";

/**
 * 쪽 이름형 OG를 쓰는 고정 쪽 → 이미지 제목(= 그 쪽 문서 제목의 앞부분, 템플릿 " · 유로 다이제스트" 앞). 한국 선수 상세 · 주간 리포트는
 * 기본 OG(2026-11-03 사용자 결정). `/offline/`은 공유 대상이 아니라(색인 제외) 레이아웃 기본 OG를 물려받는다.
 * 새 고정 쪽(예: M5-15 `/status` · M5-05 `/privacy`)을 만들면 여기 한 줄 + 그 쪽 `pageMetadata`에 `og: pageOgCard(name)`.
 */
export const OG_PAGES = {
  "korean-players": "한국 선수",
  "national-team": "대표팀",
  transfers: "이적",
  tonight: "오늘 밤 볼 경기",
  search: "검색",
  // 내비 라벨은 "마이"(하단 탭) — 쪽 제목 · og:title · 문서 제목은 "마이 팀"(2026-11-03 사용자 결정)
  my: "마이 팀",
  about: "소개",
} as const satisfies Record<string, string>;

export type OgPageName = keyof typeof OG_PAGES;

/** 대회 카드에 싣는 대회 — `configs/competitions.json` 값 그대로 */
export interface OgCompetition {
  id: CompId;
  /** 정식 이름 "프리미어리그" */
  nameKo: string;
  /** 영문 이름 "Premier League"(대회 색 막대) */
  nameEn: string;
  /** 거대 약칭 "EPL" · "분데스" */
  shortKo: string;
}

export type OgCard =
  | { kind: "default" }
  | { kind: "news"; date: string; no: number; label: string }
  | { kind: "page"; name: OgPageName; title: string }
  | (OgCompetition & { kind: "competition"; season: string })
  | {
      kind: "team";
      team: string;
      /** 한글 팀명(표기 사전 — 팀 페이지 제목과 같은 값) */
      name: string;
      /** 원어 팀명(팀 파일 nameEn) */
      nameEn: string;
      /** 배지 약어 "FCB" */
      short: string;
      /** [상의, 하의] — configs/team-colors.json(배지와 같은 값) */
      kit: readonly [string, string];
      /** 소속 대회(대표 대회 → 병행 대회 순, 중복 없음) */
      comps: readonly OgCompetition[];
    };

export const DEFAULT_OG_CARD: OgCard = { kind: "default" };

/** "2026-27" — 시즌 시작 연도 → 시즌 표기("시즌" 글자 없이) */
export function ogSeason(season: number): string {
  return seasonLabel(season).replace(/ 시즌$/, "");
}

/** 날짜 OG — 발행일(KST "YYYY-MM-DD"). 창간일 전 날짜(호수 없음)는 기본 OG */
export function newsOgCard(date: string): OgCard {
  const no = issueNumber(date);
  if (no === null) return DEFAULT_OG_CARD;
  return { kind: "news", date, no, label: archiveDateLabel(date) };
}

/** 쪽 이름형 OG */
export function pageOgCard(name: OgPageName): OgCard {
  return { kind: "page", name, title: OG_PAGES[name] };
}

/** 대회 OG — 설정 한 항목(id · 이름 · 약칭 · 시즌 시작 연도) */
export function competitionOgCard(
  config: OgCompetition & { season: number },
): OgCard {
  return {
    kind: "competition",
    id: config.id,
    nameKo: config.nameKo,
    nameEn: config.nameEn,
    shortKo: config.shortKo,
    season: ogSeason(config.season),
  };
}

/**
 * 팀 OG — 배지(이름 · 약어 · 키트 2색 — `loadTeamLookup`)와 팀 파일(원어 이름 · 대표 대회 · 병행 대회), 대회 설정. 배지 색이나 약어가 없는
 * 팀(폴백 배지)은 거대 약어를 그릴 수 없어 기본 OG를 쓴다(값을 지어내지 않는다).
 */
export function teamOgCard(
  view: {
    slug: string;
    name: string;
    short: string;
    colors: readonly [string, string] | null;
  },
  team: { nameEn: string; comp: CompId; alsoIn: readonly CompId[] },
  configs: readonly OgCompetition[],
): OgCard {
  if (view.colors === null || view.short === "") return DEFAULT_OG_CARD;
  const ids = [...new Set([team.comp, ...team.alsoIn])];
  const comps = ids.flatMap((id) => {
    const c = configs.find((x) => x.id === id);
    return c
      ? [{ id: c.id, nameKo: c.nameKo, nameEn: c.nameEn, shortKo: c.shortKo }]
      : [];
  });
  return {
    kind: "team",
    team: view.slug,
    name: view.name,
    nameEn: team.nameEn,
    short: view.short,
    kit: [view.colors[0], view.colors[1]],
    comps,
  };
}

/** 카드 → 경로 규칙의 입력(`artifacts.ogImage`) */
export function ogImageOf(card: OgCard): OgImage {
  switch (card.kind) {
    case "default":
      return { kind: "default" };
    case "news":
      return { kind: "news", date: card.date };
    case "page":
      return { kind: "page", name: card.name };
    case "competition":
      return { kind: "competition", comp: card.id };
    case "team":
      return { kind: "team", team: card.team };
  }
}

/**
 * `og:image:alt` — 이미지 안 글자를 대신한다(DESIGN §9.3 D3 링크 미리보기 메타 문형).
 * 기본 "유로 다이제스트 — {태그라인}" · 날짜 "유로 다이제스트 제 {N}호, {날짜}" · 쪽 "유로 다이제스트 · {쪽 제목}" ·
 * 대회 "유로 다이제스트 · {정식 이름} {시즌} 시즌" · 팀 "유로 다이제스트 · {팀명} ({약어}) · {대회 · …}"
 */
export function ogAlt(card: OgCard): string {
  switch (card.kind) {
    case "default":
      return `${SITE_NAME} — ${SITE_TAGLINE}`;
    case "news":
      return `${SITE_NAME} 제 ${card.no}호, ${card.label}`;
    case "page":
      return `${SITE_NAME} · ${card.title}`;
    case "competition":
      return `${SITE_NAME} · ${card.nameKo} ${card.season} 시즌`;
    case "team": {
      const comps = card.comps.map((c) => c.nameKo).join(" · ");
      return `${SITE_NAME} · ${card.name} (${card.short})${comps ? ` · ${comps}` : ""}`;
    }
  }
}

/** 이미지 안 글자 — 글꼴별(한글 면 `sans` · 숫자 · 라틴 면 `numeric`). 템플릿(scripts/lib/og-template.ts)은 이 글자만 쓴다(테스트가 대조) */
export interface OgTexts {
  sans: string[];
  numeric: string[];
}

/** 카드의 이미지 안 글자(서브셋 커버리지 · 결과 노출 0 검사용 — 템플릿 마크업과 같은 순서) */
export function ogTexts(card: OgCard): OgTexts {
  switch (card.kind) {
    case "default":
      return {
        sans: [SITE_NAME, SITE_TAGLINE],
        numeric: [OG_LATIN_WORDMARK, "5"],
      };
    case "news":
      return {
        sans: [SITE_NAME, "제", "호", card.label],
        numeric: [OG_LATIN_WORDMARK, String(card.no)],
      };
    case "page":
      return {
        sans: [SITE_NAME, card.title],
        numeric: [OG_LATIN_WORDMARK, "5"],
      };
    case "competition":
      return isLatinShort(card.shortKo)
        ? {
            sans: [SITE_NAME, ...ogFullNameLine(card), "시즌"],
            numeric: [
              OG_LATIN_WORDMARK,
              card.shortKo,
              card.nameEn,
              card.season,
            ],
          }
        : {
            sans: [SITE_NAME, card.shortKo, ...ogFullNameLine(card), "시즌"],
            numeric: [OG_LATIN_WORDMARK, card.nameEn, card.season],
          };
    case "team":
      return {
        sans: [SITE_NAME, ...card.comps.map((c) => c.shortKo), card.name],
        numeric: [OG_LATIN_WORDMARK, card.short, card.nameEn],
      };
  }
}

/**
 * 대회 OG 정식 이름 줄 — 거대 약칭과 정식 이름이 **글자 그대로 같으면**(라리가) 줄을 싣지 않고 여백으로 둔다(같은 이름이 두 번
 * 나오지 않게 — 2026-11-03 사용자 결정). 띄어쓰기만 다른 세리에A ↔ 세리에 A · 리그1 ↔ 리그 1은 그대로 싣는다(같은 결정 — 다른 대회는 그대로).
 * 템플릿(scripts/lib/og-template.ts)과 `ogTexts`가 같이 쓴다. alt는 늘 정식 이름을 쓴다(이미지 글자와 무관).
 */
export function ogFullNameLine(card: {
  shortKo: string;
  nameKo: string;
}): string[] {
  return card.shortKo === card.nameKo ? [] : [card.nameKo];
}

/** 거대 약칭이 라틴 대문자뿐인가("EPL" · "UCL") — 라틴이면 Barlow 27cqw, 아니면 한글 17cqw(DESIGN §9.3 D3) */
export function isLatinShort(short: string): boolean {
  return /^[A-Z]+$/.test(short);
}
