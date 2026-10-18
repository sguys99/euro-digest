/**
 * 뉴스 카드 표시 문구 — 분류 도장·이적 단계 (PRD FR-31·FR-21·FR-102, DESIGN.md §9.3 도장 칩·이적 단계)
 *
 * 화면(서버 컴포넌트)과 테스트가 같은 표를 쓴다. 문구는 사실(데이터 값)의 한국어 이름일 뿐 새 사실을 만들지 않는다.
 * 타입만 import하므로(zod 없음) 어디서 가져다 써도 클라이언트 번들에 스키마가 들어가지 않는다.
 */
import type { Category, TransferStatus } from "@/lib/schema/common";

/** 분류 도장 라벨 7종(FR-31 순서) */
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  result: "경기 결과",
  transfer: "이적",
  injury: "부상",
  club: "감독·구단",
  national: "대표팀",
  ucl: "UCL",
  other: "기타",
};

/** 이적 단계 펀치 구멍 수(4개 중) — 결렬은 0(빈 구멍 4개 위 사선, DESIGN §2.7) */
export const TRANSFER_STAGE_HOLES = 4;

/** 이적 단계 표시 — 단계 글자와 채운 구멍 수(FR-102: 루머 → 협상 → 합의 → 공식, 결렬) */
export const TRANSFER_STAGE: Readonly<
  Record<TransferStatus, { label: string; filled: number }>
> = {
  rumor: { label: "루머", filled: 1 },
  negotiating: { label: "협상", filled: 2 },
  agreed: { label: "합의", filled: 3 },
  official: { label: "공식", filled: 4 },
  collapsed: { label: "결렬", filled: 0 },
};

/** 이적 단계 접근 이름 — "이적 단계: 공식 (4단계 중 4)" · 결렬은 "이적 단계: 결렬"(DESIGN §9.3) */
export function transferStageLabel(status: TransferStatus): string {
  const stage = TRANSFER_STAGE[status];
  return status === "collapsed"
    ? `이적 단계: ${stage.label}`
    : `이적 단계: ${stage.label} (${TRANSFER_STAGE_HOLES}단계 중 ${stage.filled})`;
}
