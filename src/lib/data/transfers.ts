/**
 * 이적 트래커 로더 — `data/transfers.json`(M4-01 집계) + 화면 입력 (PRD FR-101 · FR-104 · §4.2 7, plan M4-04)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 * 규칙(다른 data 로더와 같은 원칙)
 * - 파일이 없으면 null — 화면은 빈 상태(지어낸 값 없음).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패 — 깨진 데이터로 조용히 틀린 화면을 배포하지 않는다).
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시). 테스트는 다른 경로를 준다.
 * 근거 · 보조 카드는 보존된 뉴스 전체(`loadRetainedCards` — 삭제 요청 제외, src/lib/data/news.ts)에서 찾는다. 계산은 순수 화면 모델
 * (src/lib/transfers-view.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadTagLabels } from "@/lib/data/names";
import { loadRetainedCards } from "@/lib/data/news";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { loadTeam } from "@/lib/data/teams";
import type { CompId } from "@/lib/schema/common";
import type { NewsCard } from "@/lib/schema/news";
import {
  TransfersFileSchema,
  type Transfer,
  type TransfersFile,
} from "@/lib/schema/transfer";
import {
  hotTransfers,
  TRANSFER_LEAGUES,
  transfersView,
  type HotTransferView,
  type KoreanTransferPlayer,
  type TransfersView,
} from "@/lib/transfers-view";

/** 이적 트래커 파일 위치(저장소 루트 기준) */
export const TRANSFERS_PATH = path.resolve("data/transfers.json");

const fileCache = new Map<string, TransfersFile | null>();

/** 이적 트래커 파일 — 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
export function loadTransfersFile(
  file: string = TRANSFERS_PATH,
): TransfersFile | null {
  if (fileCache.has(file)) return fileCache.get(file) ?? null;
  let value: TransfersFile | null = null;
  if (existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = TransfersFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: 이적 트래커 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    value = parsed.data;
  }
  fileCache.set(file, value);
  return value;
}

/** 팀 slug → 5대 리그(팀 파일의 대회 — 없거나 5대 리그 밖이면 null) */
function leagueOf(slug: string): CompId | null {
  const comp = loadTeam(slug)?.comp ?? null;
  return comp !== null && TRANSFER_LEAGUES.includes(comp) ? comp : null;
}

/** 견본 전용 덧붙임 — 가명 선수(설정 · 사전 밖)를 등록 한국 선수 · 사전 표기로 더한다(SPECIMEN 빌드만) */
export interface TransfersViewExtras {
  korean?: readonly KoreanTransferPlayer[];
  names?: Readonly<Record<string, string>>;
}

/** 레코드 · 카드 → 화면 모델(설정 · 사전 · 팀 배지를 붙인다). 견본(SPECIMEN)도 이 함수로 fixtures를 싣는다 */
export function buildTransfersView(
  records: readonly Transfer[],
  cards: readonly NewsCard[],
  extras: TransfersViewExtras = {},
): TransfersView {
  const labels = loadTagLabels();
  return transfersView({
    records,
    cards,
    korean: [
      ...loadKoreanPlayers().map((p) => ({
        slug: p.slug,
        nameKo: p.nameKo,
        team: p.team,
        comp: p.comp,
      })),
      ...(extras.korean ?? []),
    ],
    playerName: (slug) =>
      labels.label("player", slug) ?? extras.names?.[slug] ?? null,
    team: loadTeamLookup(),
    leagueOf,
  });
}

/** `/transfers/` 화면 모델 — 트래커 파일이 없으면 null(빈 상태) */
export function loadTransfersView(
  file: string = TRANSFERS_PATH,
): TransfersView | null {
  const records = loadTransfersFile(file);
  if (records === null) return null;
  return buildTransfersView(records, loadRetainedCards());
}

/** 홈 '이적 핫 리스트' — 파일이 없거나 실을 이적이 없으면 빈 배열(섹션 숨김) */
export function loadHotTransfers(
  file: string = TRANSFERS_PATH,
): HotTransferView[] {
  const view = loadTransfersView(file);
  return view ? hotTransfers(view.rows) : [];
}
