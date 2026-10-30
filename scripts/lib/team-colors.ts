/**
 * `configs/team-colors.json` 생성 (DR-05, PRD §15 D62 ②④, plan M2-05). I/O 없는 순수 함수.
 *
 * 입력은 검토 자료 `docs/design/d1/team-colors-source.json`(팀별 키트 원색 2색 · football-data tla · 약어 · 확신도 · 출처)이다.
 * team-colors.json 스키마(`TeamColorSchema` — colors·short만, strictObject)에는 원색·출처를 둘 자리가 없어서, 원색과 근거는
 * 원본 파일에 두고 보정한 값만 설정 파일에 넣는다(DESIGN §11.14 — 화면은 보정하지 않는다).
 *
 *   colors = [상의 색(D62 ④ 보정 뒤 — kit-contrast.ts), 하의 색(원색 그대로)]
 *   short  = 원본의 short(= football-data tla trim. tla가 팀을 가리키지 못하는 이상치만 shortBasis 근거로 다른 값)
 *
 * 약어 충돌(FCB 바이에른·바르셀로나, BRE 브렌트포드·브레스트)은 그대로 둔다 — 화면이 한글 팀명을 병기한다(D62 ②).
 */
import { z } from "zod";

import { HexColorSchema, SlugSchema, type TeamColorsFile } from "@/lib/schema";

import { correctKitShirt, type KitShirtResult } from "@/lib/kit-contrast";

/** 원본 파일 경로 */
export const TEAM_COLORS_SOURCE_PATH = "docs/design/d1/team-colors-source.json";

export const TeamColorSourceEntrySchema = z.strictObject({
  kit: z.tuple([HexColorSchema, HexColorSchema]), // [상의 주색 원색, 하의(상의와 같으면 키트 둘째 색)]
  tla: z.string(), // football-data 원문 tla(공백 포함 그대로)
  short: z.string().regex(/^[A-Z0-9]{2,4}$/),
  shortBasis: z.string().min(1).optional(), // short ≠ tla trim일 때만 — 근거
  confidence: z.enum(["확실", "추정"]),
  source: z.string().min(1),
  kitNote: z.string().min(1),
  fdClubColors: z.string().optional(), // football-data clubColors(힌트)
});
export type TeamColorSourceEntry = z.infer<typeof TeamColorSourceEntrySchema>;

export const TeamColorSourceFileSchema = z
  .strictObject({
    _about: z.string(),
    teams: z.record(SlugSchema, TeamColorSourceEntrySchema),
  })
  .superRefine((file, ctx) => {
    for (const [slug, e] of Object.entries(file.teams)) {
      const trimmed = e.tla.trim();
      if (e.short !== trimmed && !e.shortBasis) {
        ctx.addIssue({
          code: "custom",
          path: ["teams", slug, "short"],
          message: `short "${e.short}"가 tla trim "${trimmed}"과 다른데 shortBasis(근거)가 없음`,
        });
      }
      if (e.short === trimmed && e.shortBasis) {
        ctx.addIssue({
          code: "custom",
          path: ["teams", slug, "shortBasis"],
          message: "short가 tla trim과 같으면 shortBasis를 두지 않는다",
        });
      }
    }
  });
export type TeamColorSourceFile = z.infer<typeof TeamColorSourceFileSchema>;

export interface TeamColorBuildRow {
  slug: string;
  source: TeamColorSourceEntry;
  shirt: KitShirtResult;
  bottom: string;
}

/** 원본 → 팀별 보정 결과(slug 순) */
export function buildTeamColorRows(
  source: TeamColorSourceFile,
): TeamColorBuildRow[] {
  return Object.keys(source.teams)
    .sort()
    .map((slug) => {
      const entry = source.teams[slug]!;
      return {
        slug,
        source: entry,
        shirt: correctKitShirt(entry.kit[0]),
        bottom: entry.kit[1].toUpperCase(),
      };
    });
}

/** 원본 → `configs/team-colors.json` 값(slug 순) */
export function buildTeamColors(source: TeamColorSourceFile): TeamColorsFile {
  const out: TeamColorsFile = {};
  for (const row of buildTeamColorRows(source)) {
    out[row.slug] = {
      colors: [row.shirt.shirt, row.bottom],
      short: row.source.short,
    };
  }
  return out;
}
