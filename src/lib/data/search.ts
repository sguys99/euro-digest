/**
 * 검색 레코드 로더 — 설정·데이터를 읽어 검색 레코드(src/lib/search/records.ts)의 입력을 만든다 (PRD FR-130·FR-131, plan M4-14)
 *
 * - 선수·팀·대회 페이지는 `SearchRecord`(숨은 HTML)로, 뉴스 카드는 빌드 스크립트(`scripts/build-search.ts`)가 사용자 정의 레코드로 넣는다.
 * - 뉴스는 **삭제 요청을 뺀 로더**(src/lib/data/news.ts)로만 읽는다(FR-143, tests/takedown-build-guard.test.ts).
 * - node:fs를 쓰는 로더를 부르므로 서버 컴포넌트·빌드 스크립트에서만 import한다.
 */
import { KOREAN_PLAYERS_PATH, loadCardLabels } from "@/lib/data/card-labels";
import { readConfigFile } from "@/lib/data/config-file";
import { loadNameEntries, nameEntryKey } from "@/lib/data/names";
import { listNewsDates, loadNewsIssue } from "@/lib/data/news";
import type { TeamPageData } from "@/lib/data/team-page";
import { CATEGORY_LABEL } from "@/lib/news/labels";
import { cardTags, sourceNameLang } from "@/lib/news/feed-view";
import { routes } from "@/lib/paths";
import type { PlayerDetailView } from "@/lib/player-detail-view";
import type { CompetitionConfig } from "@/lib/schema/configs";
import { KoreanPlayersFileSchema } from "@/lib/schema/player";
import type { IndexEntry } from "@/lib/search/model";
import {
  competitionSearchRecord,
  newsSearchRecord,
  playerSearchRecord,
  teamSearchRecord,
  type NewsSearchRecord,
  type PageSearchRecord,
} from "@/lib/search/records";
import { formatKst } from "@/lib/time";

/** 사전의 영문 변형(대표 표기 포함) — 없으면 빈 배열 */
function enVariants(kind: "player" | "team", slug: string): readonly string[] {
  return loadNameEntries().get(nameEntryKey(kind, slug))?.en ?? [];
}

/** 선수 상세(`/korean-players/[slug]/`) 레코드 */
export function playerPageSearchRecord(view: PlayerDetailView): PageSearchRecord {
  return playerSearchRecord({
    nameKo: view.nameKo,
    nameEn: view.nameEn,
    enVariants: enVariants("player", view.slug),
    position: view.position,
    team: {
      name: view.team.name,
      short: view.team.short,
      colors: view.team.colors,
    },
  });
}

/** 팀 화면(`/teams/[team]/`) 레코드 — 화면에 실린 선수 이름(주요 선수 · 팀시트)도 별칭으로 */
export function teamPageSearchRecord(page: TeamPageData): PageSearchRecord {
  const { team, self } = page;
  const squadEn = [
    ...team.topPlayers.map((p) => p.name),
    ...(team.lineup
      ? [...team.lineup.startXI, ...team.lineup.substitutes].map((p) => p.name)
      : []),
  ];
  const squad = squadEn.flatMap((name) => [name, page.playerName(name) ?? ""]);
  return teamSearchRecord({
    nameKo: self.latin ? team.nameKo : self.name,
    nameEn: team.nameEn,
    enVariants: enVariants("team", team.slug),
    short: self.short,
    colors: self.colors,
    korean: page.korean.map((p) => ({
      nameKo: p.nameKo,
      nameEn: p.nameEn,
      enVariants: enVariants("player", p.slug),
    })),
    squad,
  });
}

/** 대회 화면(`/competitions/[comp]/`) 레코드 */
export function competitionPageSearchRecord(
  config: CompetitionConfig,
): PageSearchRecord {
  return competitionSearchRecord({
    id: config.id,
    nameKo: config.nameKo,
    nameEn: config.nameEn,
    shortKo: config.shortKo,
  });
}

/**
 * 뉴스 카드 레코드 전부 — 모든 발행 호(삭제 요청 제외 로더), 최신 호부터. 같은 카드 ID가 두 호에 있으면 최신 호 것만(공유 앵커는 한 곳).
 * 태그는 화면 표시와 같은 규칙(`cardTags` — 팀 → 선수, 한국 선수 굵게).
 */
export function loadNewsSearchRecords(): NewsSearchRecord[] {
  const labels = loadCardLabels();
  const entries = loadNameEntries();
  const seen = new Set<string>();
  const out: NewsSearchRecord[] = [];
  for (const date of [...listNewsDates()].reverse()) {
    const issue = loadNewsIssue(date);
    if (!issue) continue;
    for (const card of issue.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      const lead = card.src[0];
      if (!lead) continue;
      const tags = cardTags(card, labels);
      const tagAliases = [
        ...card.teams.flatMap(
          (s) => entries.get(nameEntryKey("team", s))?.en ?? [],
        ),
        ...card.players.flatMap(
          (s) => entries.get(nameEntryKey("player", s))?.en ?? [],
        ),
      ];
      out.push(
        newsSearchRecord({
          card,
          url: routes.card(issue.date, card.id),
          category: CATEGORY_LABEL[card.cat],
          tags: tags.map((t) => ({ label: t.label, korean: t.korean })),
          tagAliases,
          sourceLang: sourceNameLang(lead.n, card.lang),
          abs: formatKst(lead.at, "short"),
        }),
      );
    }
  }
  return out;
}

/** 검색 오버레이 입력 전 색인 — 활동 중인 한국 선수(설정), 가나다는 화면이 묶는다 */
export function loadSearchIndexPlayers(
  file: string = KOREAN_PLAYERS_PATH,
): IndexEntry[] {
  // 설정 로더(team-page.ts `loadKoreanPlayers`)와 같은 파일 · 같은 캐시 label — 앱 셸이 부르므로 무거운 화면 로더 모듈을 끌어오지 않는다
  return readConfigFile(file, KoreanPlayersFileSchema, "한국 선수 설정", [])
    .filter((p) => p.active)
    .map((p) => ({ slug: p.slug, nameKo: p.nameKo, nameEn: p.nameEn }));
}
