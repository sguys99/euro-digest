/**
 * 팀 파일 로더 — `data/teams/{slug}.json` (PRD F5 FR-50~58, plan M2-13 — 파일 생성은 M2-06·M2-07 `scripts/build-teams.ts`)
 *
 * 빌드 때(서버 컴포넌트 — 팀 페이지 `generateStaticParams`·본문, 대회 페이지 팀 링크) Node fs로 읽는다. node:fs·zod를 쓰므로
 * `"use client"` 파일에서 import하지 않는다.
 *
 * 규칙(대회 데이터 로더 `competition-data.ts`와 같은 원칙)
 * - 파일 1개 = 팀 1개, 파일 이름 = slug. 디렉터리가 없으면 팀 0개(팀 링크 없음 — 없는 페이지로 가는 링크를 만들지 않는다).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패 — 깨진 데이터로 조용히 틀린 팀 화면을 배포하지 않는다). 파일 이름과 slug가 다르면 던진다.
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시). 테스트는 다른 디렉터리(`dir`)를 준다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { TeamSchema, type Team } from "@/lib/schema/team";

/** 팀 파일 디렉터리(저장소 루트 기준) */
export const TEAMS_DIR = path.resolve("data/teams");

const SLUG_FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;

const listCache = new Map<string, readonly string[]>();
const teamCache = new Map<string, Team | null>();

/** 팀 slug 전부(파일 이름 기준, 오름차순). 디렉터리가 없으면 빈 배열 */
export function listTeamSlugs(dir: string = TEAMS_DIR): readonly string[] {
  const hit = listCache.get(dir);
  if (hit) return hit;
  const slugs = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && SLUG_FILE_RE.test(e.name))
        .map((e) => path.basename(e.name, ".json"))
        .sort()
    : [];
  listCache.set(dir, slugs);
  return slugs;
}

/** 팀 페이지가 있는 팀인가(팀 파일이 있다 — 다른 화면의 팀 이름 링크) */
export function hasTeamPage(slug: string, dir: string = TEAMS_DIR): boolean {
  return listTeamSlugs(dir).includes(slug);
}

/** 팀 하나 — 파일이 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
export function loadTeam(slug: string, dir: string = TEAMS_DIR): Team | null {
  const file = path.join(dir, `${slug}.json`);
  if (teamCache.has(file)) return teamCache.get(file) ?? null;
  let value: Team | null = null;
  if (listTeamSlugs(dir).includes(slug) && existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = TeamSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: 팀 파일 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    if (parsed.data.slug !== slug) {
      throw new Error(
        `${where}: 파일 이름(${slug})과 slug(${parsed.data.slug})가 다름`,
      );
    }
    value = parsed.data;
  }
  teamCache.set(file, value);
  return value;
}
