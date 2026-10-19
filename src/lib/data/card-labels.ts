/**
 * 뉴스 카드 표시 이름 로더 — 태그 한글 표기·대회 약칭·한국 선수 (PRD FR-24·FR-30, DESIGN.md §9.3, plan M1-31)
 *
 * `configs/names.ko.json`(태그 한글 — src/lib/data/names.ts), `configs/competitions.json`(인덱스 탭 약칭 shortKo·정식 이름 nameKo),
 * `configs/korean-players.json`(한국 선수 태그 굵게)을 빌드 때(서버 컴포넌트) 읽어 `CardLabels`(src/lib/news/feed-view.ts)로 묶는다.
 * node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다 — 화면 모델이 고른 문자열만 카드에 넘어간다.
 *
 * 규칙(names.ts와 같은 원칙 — 파일 읽기는 src/lib/data/config-file.ts `readConfigFile`, 대회는 src/lib/data/competitions.ts)
 * - 파일이 없으면 빈 표(대회 탭·한국 선수 굵게 없음). 표시가 빠질 뿐 slug·ID 문자열을 화면에 보이지 않는다.
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패) — 사람이 고치는 설정이라 `npm run validate`(CI)가 먼저 막지만, 깨진 설정으로
 *   표시가 조용히 사라진 채 배포되지 않게 하는 마지막 방어선이다.
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시).
 */
import path from "node:path";

import { COMPETITIONS_PATH, loadCompetitionsConfig } from "@/lib/data/competitions";
import { readConfigFile } from "@/lib/data/config-file";
import { loadTagLabels, NAMES_KO_PATH } from "@/lib/data/names";
import type { CardLabels } from "@/lib/news/feed-view";
import type { CompId } from "@/lib/schema/common";
import { KoreanPlayersFileSchema } from "@/lib/schema/player";

/** 한국 선수 설정 위치(저장소 루트 기준) */
export const KOREAN_PLAYERS_PATH = path.resolve("configs/korean-players.json");

export interface CardLabelPaths {
  names?: string;
  competitions?: string;
  koreanPlayers?: string;
}

const competitionCache = new Map<
  string,
  ReadonlyMap<CompId, { short: string; name: string }>
>();

/** 대회 ID → { 약칭, 정식 이름 } — 대회 설정 로더(src/lib/data/competitions.ts) 결과로 만든다(머리 주석 규칙) */
export function loadCompetitionLabels(
  file: string = COMPETITIONS_PATH,
): ReadonlyMap<CompId, { short: string; name: string }> {
  const cached = competitionCache.get(file);
  if (cached) return cached;
  const map = new Map<CompId, { short: string; name: string }>(
    loadCompetitionsConfig(file).map((c) => [
      c.id,
      { short: c.shortKo, name: c.nameKo },
    ]),
  );
  competitionCache.set(file, map);
  return map;
}

const koreanCache = new Map<string, ReadonlySet<string>>();

/** 한국 선수 slug 집합(활동 여부와 무관 — 태그가 그 선수면 굵게) (머리 주석 규칙) */
export function loadKoreanPlayerSlugs(
  file: string = KOREAN_PLAYERS_PATH,
): ReadonlySet<string> {
  const cached = koreanCache.get(file);
  if (cached) return cached;
  const slugs = new Set<string>(
    readConfigFile(file, KoreanPlayersFileSchema, "한국 선수 설정", []).map(
      (p) => p.slug,
    ),
  );
  koreanCache.set(file, slugs);
  return slugs;
}

/** 카드 표시 이름 묶음 — 피드(src/components/news-feed.tsx)가 한 번 읽어 화면 모델에 넘긴다 */
export function loadCardLabels(paths: CardLabelPaths = {}): CardLabels {
  const tags = loadTagLabels(paths.names ?? NAMES_KO_PATH);
  const competitions = loadCompetitionLabels(paths.competitions);
  const korean = loadKoreanPlayerSlugs(paths.koreanPlayers);
  return {
    tags,
    isKoreanPlayer: (slug) => korean.has(slug),
    competition: (id) => competitions.get(id) ?? null,
  };
}
