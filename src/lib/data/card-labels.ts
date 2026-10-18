/**
 * 뉴스 카드 표시 이름 로더 — 태그 한글 표기·대회 약칭·한국 선수 (PRD FR-24·FR-30, DESIGN.md §9.3, plan M1-31)
 *
 * `configs/names.ko.json`(태그 한글 — src/lib/data/names.ts), `configs/competitions.json`(인덱스 탭 약칭 shortKo·정식 이름 nameKo),
 * `configs/korean-players.json`(한국 선수 태그 굵게)을 빌드 때(서버 컴포넌트) 읽어 `CardLabels`(src/lib/news/feed-view.ts)로 묶는다.
 * node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다 — 화면 모델이 고른 문자열만 카드에 넘어간다.
 *
 * 규칙(names.ts와 같은 원칙)
 * - 파일이 없으면 빈 표(대회 탭·한국 선수 굵게 없음). 표시가 빠질 뿐 slug·ID 문자열을 화면에 보이지 않는다.
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패) — 사람이 고치는 설정이라 `npm run validate`(CI)가 먼저 막지만, 깨진 설정으로
 *   표시가 조용히 사라진 채 배포되지 않게 하는 마지막 방어선이다.
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { loadTagLabels, NAMES_KO_PATH } from "@/lib/data/names";
import type { CardLabels } from "@/lib/news/feed-view";
import type { CompId } from "@/lib/schema/common";
import { CompetitionsFileSchema } from "@/lib/schema/configs";
import { KoreanPlayersFileSchema } from "@/lib/schema/player";

/** 대회 설정 위치(저장소 루트 기준) */
export const COMPETITIONS_PATH = path.resolve("configs/competitions.json");

/** 한국 선수 설정 위치(저장소 루트 기준) */
export const KOREAN_PLAYERS_PATH = path.resolve("configs/korean-players.json");

export interface CardLabelPaths {
  names?: string;
  competitions?: string;
  koreanPlayers?: string;
}

function readConfig<T>(file: string, schema: z.ZodType<T>, label: string): T {
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: ${label} 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

const competitionCache = new Map<
  string,
  ReadonlyMap<CompId, { short: string; name: string }>
>();

/** 대회 ID → { 약칭, 정식 이름 } (머리 주석 규칙) */
export function loadCompetitionLabels(
  file: string = COMPETITIONS_PATH,
): ReadonlyMap<CompId, { short: string; name: string }> {
  const cached = competitionCache.get(file);
  if (cached) return cached;
  const map = new Map<CompId, { short: string; name: string }>();
  if (existsSync(file)) {
    for (const c of readConfig(file, CompetitionsFileSchema, "대회 설정")) {
      map.set(c.id, { short: c.shortKo, name: c.nameKo });
    }
  }
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
    existsSync(file)
      ? readConfig(file, KoreanPlayersFileSchema, "한국 선수 설정").map(
          (p) => p.slug,
        )
      : [],
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
