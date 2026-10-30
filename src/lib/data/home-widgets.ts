/**
 * 홈 위젯 데이터 — "오늘 밤 볼 경기"(M2-14) · "리그 순위 미니"(M2-15) 화면 모델을 만든다 (PRD F8 FR-80~82 · §4.2, plan M2-14·M2-15)
 *
 * 읽는 것: 선별(`loadTonight` — 규칙·한국 선수·대회 데이터), 대회 설정(`configs/competitions.json` — 약칭·정식명·구간), 대회 데이터
 * (`loadAllCompetitionData`), 팀 배지·한글명(`loadTeamLookup`). 계산은 순수 화면 모델(src/lib/home-widgets.ts). 빌드 때(서버 컴포넌트 —
 * 홈·`/tonight`)만 쓴다 — node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 * 기준 시각은 빌드 시각(정적 — 하루 1회 발행 빌드가 다시 굳힌다). 테스트는 `now`를 넣는다.
 */
import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { readConfigFile } from "@/lib/data/config-file";
import { BIGMATCH_RULES_PATH, loadTonight } from "@/lib/data/tonight";
import {
  leagueMiniPanel,
  tonightCards,
  type CompLabel,
  type LeagueMiniPanelView,
  type TonightCardView,
} from "@/lib/home-widgets";
import { BigmatchRulesFileSchema, type BigmatchRulesFile } from "@/lib/schema";
import type { CompId } from "@/lib/schema/common";
import type { UtcRange } from "@/lib/time";

export interface TonightWidget {
  /** 기준 날짜(KST 발행일 "YYYY-MM-DD") */
  baseKstDate: string;
  /** 대상 창(UTC) — 선별 규칙 파일이 없으면 null(빈 상태) */
  window: UtcRange | null;
  /** 카드(선별 순서, 0~5개 — 0개 = 빈 상태) */
  cards: TonightCardView[];
}

/** 대회 ID → 약칭·정식명(설정 순서) */
function compLabels(): Map<CompId, CompLabel> {
  return new Map(
    loadCompetitionsConfig().map((c) => [
      c.id,
      { short: c.shortKo, name: c.nameKo },
    ]),
  );
}

/** 빌드 시각 기준 "오늘 밤 볼 경기" 카드 */
export function loadTonightWidget(now: Date = new Date()): TonightWidget {
  const { baseKstDate, window, picks } = loadTonight(now);
  return {
    baseKstDate,
    window,
    cards: tonightCards(picks, loadTeamLookup(), compLabels(), now.getTime()),
  };
}

/** 선별 규칙(`/tonight` 선정 기준 설명) — 파일이 없으면 null */
export function loadTonightRules(): BigmatchRulesFile | null {
  return readConfigFile(
    BIGMATCH_RULES_PATH,
    BigmatchRulesFileSchema.nullable(),
    "오늘 밤 선별 규칙",
    null,
  );
}

/** 순위 미니 패널 — 설정 순서 6개 대회 전부(데이터가 없는 대회는 빈 패널) */
export function loadLeagueMini(): LeagueMiniPanelView[] {
  const team = loadTeamLookup();
  const data = new Map(loadAllCompetitionData().map((d) => [d.comp, d]));
  return loadCompetitionsConfig().map((config) =>
    leagueMiniPanel(config, data.get(config.id) ?? null, team),
  );
}
