/**
 * 이적 감지 이슈 사건의 입출력 (M3-04 — 규칙은 transfer-issues.ts 순수 함수). scripts/collect.ts가 수집 실행 뒤에 부른다.
 *
 *   읽기: configs/korean-players.json · team-ids.json · names.ko.json · competitions.json(시즌 — 팀 표 시즌과 대조)
 *   쓰기: 사건 파일(TRANSFER_ISSUES_FILE — Actions `$RUNNER_TEMP/transfer-issues.json`, payload 배열). 이슈는 collect.yml 다음 단계가
 *         만든다(이 단계는 GitHub 토큰을 받지 않는다).
 *   **던지지 않는다** — 이 단계는 부가 기능이라 실패해도 발행(검증·빌드·커밋)에 영향이 없다. 실패는 결과(`error`)와 경고 로그로만.
 *   payload는 쓰기 전에 이슈 스키마로 한 번 더 검사하고, 맞지 않는 항목은 빼고 경고한다(한 항목이 일괄 보고를 깨지 않게).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type NewsCard,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";
import { parseIssuePayload, transferIssueKey } from "./github-issues";
import type { TeamMismatch } from "./korean-players-data";
import { teamNamesOf } from "./korean-players-io";
import type { Logger } from "./logger";
import { TEAM_LEAGUE_INDEX, TEAM_LEAGUES_SEASON } from "./team-leagues";
import { loadTeamIds } from "./team-ids";
import {
  transferIssuePayloads,
  type PlayerTransferPayload,
  type TransferIssueContext,
} from "./transfer-issues";

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

export interface TransferIssueStageResult {
  payloads: PlayerTransferPayload[];
  /** 스키마에 맞지 않아 뺀 항목 수 */
  dropped: number;
  /** 설정 읽기·판정 실패(이번 실행의 이적 감지만 빠진다) */
  error: string | null;
}

/** 설정을 읽어 이적 감지 payload를 만든다 — 던지지 않는다 */
export async function buildTransferIssueEvents(
  deps: { rootDir: string; logger: Pick<Logger, "info" | "warn"> },
  input: {
    cards: readonly NewsCard[];
    mismatches: readonly TeamMismatch[];
    ctx: TransferIssueContext;
  },
): Promise<TransferIssueStageResult> {
  try {
    const [players, teamIds, names, competitions] = await Promise.all([
      readConfigFile(
        deps.rootDir,
        "korean-players.json",
        KoreanPlayersFileSchema,
      ),
      loadTeamIds(deps.rootDir),
      readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
      readConfigFile(deps.rootDir, "competitions.json", CompetitionsFileSchema),
    ]);
    const knownTeams = new Set<string>(Object.keys(teamIds));
    for (const e of names.entries) {
      if (e.kind === "team" && e.slug !== undefined) knownTeams.add(e.slug);
    }
    const seasons = new Set(competitions.map((c) => c.season));
    const all = transferIssuePayloads(
      {
        cards: input.cards,
        mismatches: input.mismatches,
        players,
        teamLeagues: TEAM_LEAGUE_INDEX,
        knownTeams,
        teamNames: teamNamesOf(names),
        leagueTableCurrent:
          seasons.size === 1 && seasons.has(TEAM_LEAGUES_SEASON),
      },
      input.ctx,
    );
    const payloads: PlayerTransferPayload[] = [];
    let dropped = 0;
    for (const payload of all) {
      try {
        parseIssuePayload("player-transfer", payload);
        payloads.push(payload);
      } catch (error) {
        dropped += 1;
        deps.logger.warn("collect.transfer.issue.invalid", {
          player: payload.player,
          error: errorText(error),
        });
      }
    }
    for (const p of payloads) {
      deps.logger.info("collect.transfer.issue", {
        key: transferIssueKey(p.player, p.destination),
        player: p.player,
        configTeam: p.config.team,
        to: p.destination.slug ?? p.destination.name,
        league: p.destination.league,
        cards: p.cards?.map((c) => c.id) ?? [],
        lineup: p.lineup?.matchId ?? null,
      });
    }
    return { payloads, dropped, error: null };
  } catch (error) {
    deps.logger.warn("collect.transfer.issue.fail", {
      error: errorText(error),
    });
    return { payloads: [], dropped: 0, error: errorText(error) };
  }
}

/** 사건 파일 쓰기(payload 배열 — 빈 배열도 쓴다: 이슈 단계가 '사건 없음'으로 넘어간다) */
export async function writeTransferIssueFile(
  file: string,
  payloads: readonly PlayerTransferPayload[],
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(payloads, null, 2)}\n`, "utf8");
}
