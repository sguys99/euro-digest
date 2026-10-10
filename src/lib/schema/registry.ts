/**
 * 파일 경로 → 스키마 레지스트리 — `npm run validate`(M0-17)·발행 검증 게이트(M1-25)가 쓴다.
 *
 * - pattern: 저장소 루트 기준 상대 경로 glob. `*`·`?`는 경로 구분자(/)를 넘지 않는다(`**` 없음).
 * - status: "confirmed" = plan.md 부록 A에 있는 스키마, "draft" = 사용자 확인 전 초안.
 *   v0.1은 2026-10-10 사용자 확인으로 전부 confirmed다. 새 파일을 초안으로 추가할 때만 draft를 쓴다.
 * - expectedBaseName: 와일드카드 파일은 파일명(확장자 제외)이 내용과 맞아야 한다
 *   (예: data/news/2026-10-10.json의 date). safeParse에 성공한 값만 넘긴다.
 * - configs/prompts/*.md는 JSON이 아니라 대상이 아니다.
 *
 * Node API를 쓰지 않는 순수 모듈이다. 파일 목록 읽기·JSON 파싱은 호출하는 스크립트가 한다.
 */
import type { z } from "zod";

import { SeenUrlsFileSchema, UnknownNamesFileSchema } from "./cache";
import { CompetitionFileSchema } from "./competition";
import {
  BigmatchRulesFileSchema,
  CompetitionsFileSchema,
  FormationsFileSchema,
  NationalTeamFileSchema,
  SearchQueriesFileSchema,
  TeamColorsFileSchema,
  TransferWindowsFileSchema,
} from "./configs";
import { NamesKoFileSchema } from "./names";
import { NewsFileSchema } from "./news";
import {
  KoreanPlayersDataFileSchema,
  KoreanPlayersFileSchema,
  WeeklyReportSchema,
} from "./player";
import { PublisherDomainsFileSchema } from "./publisher";
import { RunsDevFileSchema, RunsFileSchema } from "./run";
import { SourcesFileSchema } from "./source";
import { TakedownsFileSchema } from "./takedown";
import { TeamSchema } from "./team";
import { TransfersFileSchema } from "./transfer";

export type SchemaFileKind = "config" | "data";
export type SchemaStatus = "confirmed" | "draft";

export interface SchemaRegistryEntry {
  /** 저장소 루트 기준 glob (예: `data/news/????-??-??.json`) */
  readonly pattern: string;
  readonly kind: SchemaFileKind;
  readonly status: SchemaStatus;
  readonly schema: z.ZodType;
  /** 사람이 읽을 설명(관련 요구사항 ID 포함) */
  readonly description: string;
  /** 파싱된 값 → 기대 파일명(확장자 제외). 와일드카드 패턴에만 있다. */
  readonly expectedBaseName?: (parsed: unknown) => string;
}

/** 스키마 출력 타입을 유지한 채 항목을 만든다(expectedBaseName의 인자 타입 검사용). */
function entry<S extends z.ZodType>(spec: {
  pattern: string;
  kind: SchemaFileKind;
  status: SchemaStatus;
  schema: S;
  description: string;
  expectedBaseName?: (parsed: z.output<S>) => string;
}): SchemaRegistryEntry {
  const { expectedBaseName, ...rest } = spec;
  if (!expectedBaseName) return rest;
  return {
    ...rest,
    // 호출 규약: safeParse 성공 값(= z.output<S>)만 넘긴다.
    expectedBaseName: (parsed) => expectedBaseName(parsed as z.output<S>),
  };
}

export const schemaRegistry: readonly SchemaRegistryEntry[] = [
  // ─── configs/ (사람이 관리) ───
  entry({
    pattern: "configs/sources.json",
    kind: "config",
    status: "confirmed",
    schema: SourcesFileSchema,
    description: "뉴스 소스 (FR-01)",
  }),
  entry({
    pattern: "configs/publisher-domains.json",
    kind: "config",
    status: "confirmed",
    schema: PublisherDomainsFileSchema,
    description:
      "검색 결과 매체 도메인 허용 목록 — 목록 밖은 기본 차단 (FR-02·NFR-09, M0-26)",
  }),
  entry({
    pattern: "configs/korean-players.json",
    kind: "config",
    status: "confirmed",
    schema: KoreanPlayersFileSchema,
    description: "한국 선수 명단 (FR-60)",
  }),
  entry({
    pattern: "configs/takedowns.json",
    kind: "config",
    status: "confirmed",
    schema: TakedownsFileSchema,
    description: "삭제·정정 요청 카드 (FR-143)",
  }),
  entry({
    pattern: "configs/competitions.json",
    kind: "config",
    status: "confirmed",
    schema: CompetitionsFileSchema,
    description: "대회·API ID·시즌·순위 구간 (FR-40·FR-42, M2-01)",
  }),
  entry({
    pattern: "configs/names.ko.json",
    kind: "config",
    status: "confirmed",
    schema: NamesKoFileSchema,
    description: "고유명사 한글 표기 사전 (FR-24·FR-131)",
  }),
  entry({
    pattern: "configs/national-team.json",
    kind: "config",
    status: "confirmed",
    schema: NationalTeamFileSchema,
    description: "대표팀 경기·소집 명단 (FR-70~73)",
  }),
  entry({
    pattern: "configs/bigmatch-rules.json",
    kind: "config",
    status: "confirmed",
    schema: BigmatchRulesFileSchema,
    description: "오늘 밤 볼 경기 선정 규칙 (FR-80~84)",
  }),
  entry({
    pattern: "configs/search-queries.json",
    kind: "config",
    status: "confirmed",
    schema: SearchQueriesFileSchema,
    description: "뉴스 검색 쿼리 (FR-02, M1-06·M1-07)",
  }),
  entry({
    pattern: "configs/formations.json",
    kind: "config",
    status: "confirmed",
    schema: FormationsFileSchema,
    description: "수동 포메이션 폴백 (FR-55)",
  }),
  entry({
    pattern: "configs/team-colors.json",
    kind: "config",
    status: "confirmed",
    schema: TeamColorsFileSchema,
    description: "팀 컬러 이니셜 배지 (DR-05)",
  }),
  entry({
    pattern: "configs/transfer-windows.json",
    kind: "config",
    status: "confirmed",
    schema: TransferWindowsFileSchema,
    description: "이적 창 일정 (FR-105)",
  }),

  // ─── data/ (파이프라인 산출물) ───
  entry({
    pattern: "data/news/????-??-??.json",
    kind: "data",
    status: "confirmed",
    schema: NewsFileSchema,
    description: "일별 뉴스 카드 (F3, 파일명 = KST 발행일)",
    expectedBaseName: (f) => f.date,
  }),
  entry({
    pattern: "data/transfers.json",
    kind: "data",
    status: "confirmed",
    schema: TransfersFileSchema,
    description: "이적 트래커 (FR-100)",
  }),
  entry({
    pattern: "data/competitions/*.json",
    kind: "data",
    status: "confirmed",
    schema: CompetitionFileSchema,
    description: "대회 순위·경기·득점 (F4, 파일명 = comp 소문자)",
    expectedBaseName: (f) => f.comp.toLowerCase(),
  }),
  entry({
    pattern: "data/teams/*.json",
    kind: "data",
    status: "confirmed",
    schema: TeamSchema,
    description: "팀 페이지 데이터 (F5, 파일명 = slug)",
    expectedBaseName: (t) => t.slug,
  }),
  entry({
    pattern: "data/players/korean.json",
    kind: "data",
    status: "confirmed",
    schema: KoreanPlayersDataFileSchema,
    description: "한국 선수 현황 (F6, M3-03)",
  }),
  entry({
    pattern: "data/players/weekly/????-??.json",
    kind: "data",
    status: "confirmed",
    schema: WeeklyReportSchema,
    description: "한국 선수 주간 리포트 (F9, 파일명 = ISO 주차)",
    expectedBaseName: (w) => w.week,
  }),
  entry({
    pattern: "data/runs.json",
    kind: "data",
    status: "confirmed",
    schema: RunsFileSchema,
    description: "prod 실행 로그 (FR-151)",
  }),
  entry({
    pattern: "data/runs-dev.json",
    kind: "data",
    status: "confirmed",
    schema: RunsDevFileSchema,
    description: "dev 실행 로그 (CLAUDE.md §6.3)",
  }),
  entry({
    pattern: "data/cache/seen-urls.json",
    kind: "data",
    status: "confirmed",
    schema: SeenUrlsFileSchema,
    description: "처리한 URL 해시 (FR-04, 90일)",
  }),
  entry({
    pattern: "data/cache/unknown-names.json",
    kind: "data",
    status: "confirmed",
    schema: UnknownNamesFileSchema,
    description: "미등록 고유명사 (FR-24)",
  }),
];

/** glob → 정규식. `*` = 경로 구분자 밖 0자 이상, `?` = 경로 구분자 밖 1자. 나머지는 글자 그대로. */
export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") source += "[^/]*";
    else if (ch === "?") source += "[^/]";
    else source += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** 경로 표기 정규화: `\` → `/`, 앞의 `./` 제거. */
export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

const compiled = schemaRegistry.map((e) => ({
  entry: e,
  regex: globToRegExp(e.pattern),
}));

/** 저장소 루트 기준 상대 경로에 해당하는 레지스트리 항목. 없으면 undefined(= 검증 대상 아님 또는 미등록 파일). */
export function findSchemaEntry(
  relPath: string,
): SchemaRegistryEntry | undefined {
  const path = normalizeRelPath(relPath);
  return compiled.find((c) => c.regex.test(path))?.entry;
}

/** 경로의 파일명에서 `.json`을 뺀 값 (expectedBaseName과 비교용). */
export function baseNameOf(relPath: string): string {
  const path = normalizeRelPath(relPath);
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".json") ? name.slice(0, -".json".length) : name;
}
