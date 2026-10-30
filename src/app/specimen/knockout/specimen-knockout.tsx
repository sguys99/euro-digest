import { CompetitionScreen } from "@/components/competition/competition-screen";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import {
  loadPlayerNameLookup,
  loadTeamLookup,
} from "@/lib/data/competition-page";
import { issueMeta } from "@/lib/issue";
import {
  CompetitionFileSchema,
  MatchSchema,
  type CompetitionFile,
} from "@/lib/schema/competition";
import { NewsFileSchema } from "@/lib/schema/news";

import knockoutJson from "../../../../fixtures/competitions/ucl-knockout.json";
import newsSampleJson from "../../../../fixtures/news-sample.json";

/**
 * UCL 녹아웃 견본 공용(M2-12 — PRD FR-43) — `SPECIMEN=1` 빌드 전용 페이지(`/specimen/knockout/`·`/specimen/knockout/final/`)가 쓴다.
 * 실제 녹아웃 데이터는 2027-02에야 생기므로 합성 fixture(`fixtures/competitions/ucl-knockout.json` — 스코어·녹아웃 대진·결과는 지어낸 값)를
 * 실제 대회 페이지와 같은 조립(`CompetitionScreen`)에 넣고 빌드 시각 대신 fixture의 `now`로 그린다.
 * - `knockout`: 16강 진행 중(PO 결정 8 · 16강 결정 3 — 합산·연장·승부차기 · 1차전만 끝남 · 결과 대기 · 2차전 연기)
 * - `final`: 결승 뒤(4강 합산·연장 · 결승 승부차기 → "우승") — 리그 페이즈 8라운드 + 4강·결승만 싣는다
 */

const file = CompetitionFileSchema.parse(knockoutJson.file);
const finalMatches = MatchSchema.array().parse(knockoutJson.final.matches);
const news = NewsFileSchema.parse(newsSampleJson);

const SCENARIOS: Record<
  "knockout" | "final",
  { data: CompetitionFile; now: string }
> = {
  knockout: { data: file, now: knockoutJson.now },
  final: {
    data: {
      ...file,
      updatedAt: "2027-05-30T02:00:00Z",
      matches: [
        ...file.matches.filter((m) => !m.round.startsWith("ko-")),
        ...finalMatches,
      ],
    },
    now: knockoutJson.final.now,
  },
};

export function SpecimenKnockout({
  scenario,
}: {
  scenario: keyof typeof SCENARIOS;
}) {
  const all = loadCompetitionsConfig();
  const config = all.find((c) => c.id === "UCL");
  if (!config) throw new Error("configs/competitions.json에 UCL 없음");
  const { data, now } = SCENARIOS[scenario];
  return (
    <CompetitionScreen
      comp="UCL"
      config={config}
      data={data}
      all={all}
      team={loadTeamLookup()}
      playerName={loadPlayerNameLookup()}
      issue={issueMeta(news, [])}
      news={news}
      nowMs={Date.parse(now)}
    />
  );
}
