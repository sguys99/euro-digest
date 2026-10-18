/**
 * 뉴스 카드 태그의 한글 표시 — `configs/names.ko.json` (PRD FR-24 "뉴스 카드의 팀·선수 태그도 같은 사전으로 한글 표시", plan M1-21)
 *
 * 카드의 `teams`·`players`는 slug만 담는다(부록 A — 코드 분류 M1-17이 사전 항목의 slug로 채운다). 화면(M1-31)은 이 도우미로
 * slug → 한글 이름을 찾는다. 원제목 텍스트는 바꾸지 않는다(D23).
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다 — 정적 export라 런타임 서버가 없다(CLAUDE.md §1-10). node:fs를 쓰므로 `"use client"`
 * 파일에서 import하지 않는다: 사전 전체(약 150항목)가 클라이언트 번들에 들어가지 않게, 서버 컴포넌트가 카드마다 필요한 이름
 * 문자열만 골라 props로 넘긴다(필터 같은 클라이언트 섬도 이미 고른 문자열만 받는다).
 *
 * 규칙
 * - 파일이 없으면 빈 표(모든 slug가 null) — 태그를 그리지 않는다(slug를 그대로 보이지 않는다).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패) — 사람이 고치는 설정이라 `npm run validate`(CI)가 먼저 막지만, 깨진 사전으로
 *   태그가 조용히 사라진 채 배포되지 않게 하는 마지막 방어선이다(news.ts와 같은 원칙).
 * - 같은 경로는 한 번만 읽는다(빌드 중 페이지마다 다시 읽지 않게 — 프로세스 안 캐시).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { tagLabelsFrom, type TagLabels } from "@/lib/news/tag-labels";
import { NamesKoFileSchema, type NamesKoFile } from "@/lib/schema/names";

/** 표기 사전 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const NAMES_KO_PATH = path.resolve("configs/names.ko.json");

// 태그 표의 순수 부분(종류·표·slug → 표시 이름)은 fs 없는 src/lib/news/tag-labels.ts에 있다 — 화면 모델·클라이언트 섬도 쓸 수 있게(M1-31 리뷰).
// 이 모듈은 파일을 읽어 그 표를 만드는 로더만 맡고, 예전 이름은 그대로 다시 내보낸다.
export {
  labelTags,
  tagLabelsFrom,
  type TagKind,
  type TagLabel,
  type TagLabels,
} from "@/lib/news/tag-labels";

const EMPTY: TagLabels = { label: () => null };
const cache = new Map<string, TagLabels>();

/** 사전 파일 → 태그 표(머리 주석 규칙 — 없으면 빈 표, 깨졌으면 던짐, 경로별 캐시) */
export function loadTagLabels(file: string = NAMES_KO_PATH): TagLabels {
  const cached = cache.get(file);
  if (cached) return cached;
  const labels = existsSync(file) ? tagLabelsFrom(readNamesKo(file)) : EMPTY;
  cache.set(file, labels);
  return labels;
}

function readNamesKo(file: string): NamesKoFile {
  const where = path.relative(process.cwd(), file) || file;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
  }
  const parsed = NamesKoFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${where}: 표기 사전 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
