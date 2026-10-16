/**
 * v0.1 — 2026-10-10 사용자 확인
 * 파이프라인 캐시 — `data/cache/seen-urls.json`(FR-04), `data/cache/unknown-names.json`(FR-24),
 * `data/cache/af-pending.json`(M1-48, PRD §15 D27·D33 — 2026-10-13 신설).
 * 수집 실행만 쓴다(손 편집 금지, CLAUDE.md §8). 키를 정렬해 저장하면 커밋 diff가 작아진다.
 */
import { z } from "zod";

import {
  CardIdSchema,
  CompIdSchema,
  IsoSchema,
  isNotAfter,
  uniqueBy,
} from "./common";
import { NameKindSchema, NameTextSchema } from "./names";

// ─── seen-urls ──────────────────────────────────────────────────────────────

/**
 * 정규화 URL 해시 = sha256(정규화 URL) 16진수 앞 16자리(64비트, scripts/lib/url-normalize.ts `urlHash` — M1-12).
 * 90일 × 하루 수백 건 규모에서 충돌 확률이 무시할 수준. 카드 ID(`c_` + 10자리)는 대표 링크의 이 해시 앞 10자리라
 * 이 키의 접두사다(M1-16 — scripts/lib/card-id.ts. 2026-10-14까지 발행된 카드는 옛 규칙 ID라 접두사가 아닐 수 있다).
 */
export const UrlHashSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, { error: "URL 해시는 16진수 소문자 16자리" });

/**
 * `data/cache/seen-urls.json` — 이미 카드가 된 URL의 기억(FR-04 "같은 URL이 두 번 카드화되지 않음"), 90일 보존(CLAUDE.md §8).
 * 발행 파일에 들어간 카드의 출처 링크만 담는다(창 안에 있었지만 선별되지 않은 항목은 담지 않는다 — scripts/lib/seen-urls.ts).
 */
export const SeenUrlsFileSchema = z.object({
  updatedAt: IsoSchema, // 마지막 갱신 시각
  urls: z.record(UrlHashSchema, IsoSchema), // 카드가 된 URL의 정규화 해시 → 처음 카드가 된 시각(UTC, card.created). 90일 지난 항목은 수집 실행이 지운다
});
export type SeenUrlsFile = z.infer<typeof SeenUrlsFileSchema>;

// ─── unknown-names ──────────────────────────────────────────────────────────

/** 미등록 고유명사 1개의 누적 정보 (`/add-name` 입력). */
export const UnknownNameSchema = z
  .object({
    count: z.number().int().min(1), // 누적 등장 횟수 — `/add-name` 빈도순 정렬
    firstSeen: IsoSchema, // 처음 본 시각(UTC)
    lastSeen: IsoSchema, // 마지막으로 본 시각(UTC) — 오래 안 보인 항목 정리 기준
    kind: NameKindSchema.optional(), // 데이터 API의 팀·선수 필드 등 출처로 유형을 알면 team/player로 추정, 모르면 생략
    cards: z.array(CardIdSchema).max(5), // 문맥 확인용 예시 카드 ID(최근 5개까지)
  })
  .refine((n) => isNotAfter(n.firstSeen, n.lastSeen), {
    path: ["lastSeen"],
    error: "lastSeen은 firstSeen보다 앞설 수 없음",
  });
export type UnknownName = z.infer<typeof UnknownNameSchema>;

/**
 * `data/cache/unknown-names.json` (FR-24 — 주간 이슈·`/add-name`).
 * 키는 데이터 API 응답·브리핑 출력(LLM은 영문 그대로 출력)의 영문 표기 그대로(FR-24, D24).
 * names.ko.json에 등록되거나 ignore에 오른 이름은 다음 수집 실행이 뺀다(M1-21).
 */
export const UnknownNamesFileSchema = z.object({
  updatedAt: IsoSchema,
  names: z.record(NameTextSchema, UnknownNameSchema),
});
export type UnknownNamesFile = z.infer<typeof UnknownNamesFileSchema>;

// ─── af-pending ─────────────────────────────────────────────────────────────

/**
 * API-Football 경기 상세를 아직 받지 못한 대상 경기 1건 (M1-48, D27 "미종료 경기 id는 캐시해 다음 실행에서 재조회").
 * 대상 = 6개 대회 경기 + 한국 선수 소속팀의 다른 대회 경기(클럽 친선 제외). 들어오는 경우:
 *   - 수집 시점에 끝나지 않았다(NS·진행 중·INT·SUSP …)
 *   - 끝났지만 이번 실행에서 받지 못했다(단계 시간 예산·일일 호출 상한 초과·요청 실패) — status는 마지막으로 본 FT·AET·PEN
 * 다음 실행은 날짜 조회(`/fixtures?date=` D-1·D) 응답에 이 경기가 있으면 그 상태를 쓰고, 없으면(날짜 창 밖) id 단건으로
 * 재조회한다(id 단건은 날짜 창 밖도 열린다 — M0-29). 상세를 받거나 정리 규칙에 걸리면 빠진다:
 *   - 상태가 경기 없음으로 끝남(PST 연기·CANC 취소·ABD 중단·AWD 몰수·WO 부전승) — 일정이 다시 잡히면 그날 날짜 조회로 다시 들어온다
 *   - 킥오프 후 3일(AF_PENDING_MAX_AGE_MS)이 지났다 · 재조회가 3회(AF_PENDING_MAX_REQUERIES)를 넘었다
 *   (상수는 scripts/lib/api-football-plan.ts — 데이터 파일 형식이 아니라 수집 정책이다)
 */
export const AfPendingEntrySchema = z.object({
  id: z.number().int().positive(), // API-Football 경기(fixture) id — 원장 키 `af-<id>`(D33)와 같은 숫자
  comp: CompIdSchema.nullable(), // 6개 대회면 대회 ID, 한국 선수 소속팀의 기타 대회면 null
  leagueId: z.number().int().positive(), // API-Football league id(기타 대회 구별·로그)
  kickoff: IsoSchema, // 킥오프(UTC, `Z`)
  status: z.string().regex(/^[A-Z0-9]{1,6}$/, {
    error: "API-Football 상태 약어(NS·1H·FT …)",
  }), // 마지막으로 본 상태(fixture.status.short)
  firstSeen: IsoSchema, // 처음 이 목록에 넣은 시각(UTC)
  requeries: z.number().int().min(0), // 상세를 얻지 못한 id 단건 조회 수(미종료·요청 실패) — 상한 넘으면 정리
});
export type AfPendingEntry = z.infer<typeof AfPendingEntrySchema>;

/**
 * `data/cache/af-pending.json` — 수집 실행만 쓴다(dry는 쓰지 않음). 항목은 킥오프·id 순으로 저장해 커밋 diff를 줄인다.
 * 이미 상세를 받은 경기는 원장(`data/matches/`, M1-48b)이 기준이라 이 파일에 두지 않는다.
 */
export const AfPendingFileSchema = z.object({
  updatedAt: IsoSchema, // 마지막으로 쓴 시각
  fixtures: z
    .array(AfPendingEntrySchema)
    .superRefine(uniqueBy((e) => String(e.id), "id", "경기 id")),
});
export type AfPendingFile = z.infer<typeof AfPendingFileSchema>;
