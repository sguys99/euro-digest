/**
 * 브리핑 줄 대회(`comps` — PRD §15 D58, 2026-10-19 사용자 결정) — I/O 없는 순수 함수만 둔다.
 *
 * 홈 '오늘의 5줄' 행 오른쪽 대회 인덱스 탭은 줄마다 대회가 필요하지만 화면은 경기 원장(data/matches)을 읽지 않는다(D33). 그래서
 * 파이프라인이 게시할 때(collect-run.ts publishBrief — LLM 줄·템플릿 줄 모두 같은 규칙) 줄의 근거 id(refs)로 대회를 계산해 브리핑
 * 파일에 넣는다. **LLM은 comps를 쓰지 않는다** — 출력 형식·지시문·호출 수·토큰은 그대로다(CLAUDE.md §1-3).
 *
 * 근거 id 접두사별 규칙(입력 = 그날 브리핑의 **전체** 정형 입력 — 검사기·템플릿과 같은 근거, D51):
 *   - `m<football-data 경기 id>` — 입력 경기(matches)의 comp(competitions.json nameEn) → 대회 id. 입력에 없는 경기는 건너뛴다
 *   - `s<약칭>`(sPL·sLL·sSA·sBL·sL1·sUCL) — 순위표 약칭표(brief-input.ts `STANDINGS_REF_CODE` — `standingsRefId`가 만드는 유일한
 *     형식)를 거꾸로 읽는다. football-data 코드(PL·PD·SA·BL1·FL1·CL)가 아니다 — 약칭은 M0-30 입력 표기(sBL ≠ BL1, sLL ≠ PD)
 *   - `k<API-Football 선수 id>` — 한국 선수 블록(M3-03 — 확정 입력에는 아직 없다)의 그 선수 항목이 가리키는 경기(match)의 대회.
 *     블록이 없거나 경기를 찾지 못하면 건너뛴다(같은 줄의 경기 근거 m…가 대개 함께 있다)
 *   - 그 밖의 접두사·대회를 알 수 없는 이름(6개 대회 밖) — 건너뛴다(짐작하지 않는다)
 * 대회 이름 → id: competitions.json nameEn → names.ts `COMPETITION_EN_ALIASES`(M0 입력의 'Champions League') → 대회 id 그대로
 * (buildBriefInput은 설정에 없는 대회면 comp에 대회 id를 넣는다). 결과 순서 = refs에서 처음 나온 순, 중복 없음. 비면 키를 넣지 않는다.
 */
import {
  CompIdSchema,
  type BriefLine,
  type CompetitionConfig,
  type CompId,
} from "@/lib/schema";

import { STANDINGS_REF_CODE, type BriefInputMatch } from "./brief-input";
import { COMPETITION_EN_ALIASES } from "./names";

/**
 * 대회 계산에 필요한 입력 부분 — 확정 입력(BriefInput)·검사 입력(BriefCheckInput — 한국 선수 블록 포함)을 그대로 넣을 수 있다.
 * 순위표 항목은 읽지 않는다(순위 근거 id가 대회 약칭을 담고 있다 — 머리 주석).
 */
export interface BriefCompsInput {
  matches: ReadonlyArray<Pick<BriefInputMatch, "id" | "comp">>;
  /** 한국 선수 블록(M3-03) — 근거 id(k…) → 그 선수가 뛴 경기 id(m…) */
  korean?: ReadonlyArray<{ id: string; match: string }>;
}

export type BriefCompsConfig = ReadonlyArray<
  Pick<CompetitionConfig, "id" | "nameEn">
>;

/** 순위표 근거 id(sPL …) → 대회 id — `STANDINGS_REF_CODE`를 거꾸로 */
const STANDINGS_REF_COMP: ReadonlyMap<string, CompId> = new Map(
  (Object.entries(STANDINGS_REF_CODE) as Array<[CompId, string]>).map(
    ([comp, code]) => [`s${code}`, comp] as const,
  ),
);

/** 입력의 대회 이름(nameEn·코드 별칭·대회 id) → 대회 id — 모르면 null */
export function briefCompIdOf(
  name: string,
  competitions: BriefCompsConfig,
): CompId | null {
  const byConfig = competitions.find((c) => c.nameEn === name);
  if (byConfig) return byConfig.id;
  const byAlias = (
    Object.entries(COMPETITION_EN_ALIASES) as Array<[CompId, readonly string[]]>
  ).find(([, aliases]) => aliases.includes(name));
  if (byAlias) return byAlias[0];
  const direct = CompIdSchema.safeParse(name);
  return direct.success ? direct.data : null;
}

/** 근거 id → 대회 id 해석기(입력 하나로 여러 줄을 계산할 때 색인을 한 번만 만든다) */
export function briefRefCompResolver(
  input: BriefCompsInput,
  competitions: BriefCompsConfig,
): (ref: string) => CompId | null {
  const matchComp = new Map<string, CompId | null>(
    input.matches.map((m) => [m.id, briefCompIdOf(m.comp, competitions)]),
  );
  const koreanMatch = new Map<string, string>(
    (input.korean ?? []).map((k) => [k.id, k.match]),
  );
  return (ref) => {
    switch (ref[0]) {
      case "m":
        return matchComp.get(ref) ?? null;
      case "s":
        return STANDINGS_REF_COMP.get(ref) ?? null;
      case "k": {
        const match = koreanMatch.get(ref);
        return match === undefined ? null : (matchComp.get(match) ?? null);
      }
      default:
        return null;
    }
  };
}

/** 줄 하나의 대회(순수 함수) — refs에서 처음 나온 순, 중복 없음, 모르는 근거는 건너뜀. 하나도 없으면 빈 배열 */
export function briefLineComps(
  refs: readonly string[],
  input: BriefCompsInput,
  competitions: BriefCompsConfig,
): CompId[] {
  return compsOf(refs, briefRefCompResolver(input, competitions));
}

function compsOf(
  refs: readonly string[],
  resolve: (ref: string) => CompId | null,
): CompId[] {
  const out: CompId[] = [];
  for (const ref of refs) {
    const comp = resolve(ref);
    if (comp !== null && !out.includes(comp)) out.push(comp);
  }
  return out;
}

/**
 * 게시 줄에 대회를 채운다(순수 함수 — 머리 주석). 줄마다 refs로 다시 계산해 덮는다(이미 있던 comps는 쓰지 않는다 — 단일 출처는
 * refs). 대회를 하나도 알 수 없는 줄은 `comps` 키 없이 돌려준다(빈 배열 저장 금지). 키 순서 text·ai·refs·comps.
 */
export function withBriefComps(
  lines: readonly BriefLine[],
  input: BriefCompsInput,
  competitions: BriefCompsConfig,
): BriefLine[] {
  const resolve = briefRefCompResolver(input, competitions);
  return lines.map((line) => {
    const comps = compsOf(line.refs, resolve);
    return {
      text: line.text,
      ai: line.ai,
      refs: [...line.refs],
      ...(comps.length > 0 ? { comps } : {}),
    };
  });
}

/**
 * 게시용 — comps 계산이 어떤 이유로든 실패하면 comps 없이 원래 줄을 돌려준다(D58 리뷰: 대회 탭은 장식이라 그날 브리핑 게시를
 * 막지 않는다). 실패는 `error`로 알려 호출자가 경고 로그를 남긴다.
 */
export function briefLinesWithComps(
  lines: readonly BriefLine[],
  input: BriefCompsInput,
  competitions: BriefCompsConfig,
): { lines: BriefLine[]; error: unknown } {
  try {
    return { lines: withBriefComps(lines, input, competitions), error: null };
  } catch (error) {
    return { lines: withoutBriefComps(lines), error };
  }
}

/** comps를 뺀 줄(키 순서 text·ai·refs) — 계산 실패·comps 때문에 파일 검증이 실패했을 때의 대체 */
export function withoutBriefComps(lines: readonly BriefLine[]): BriefLine[] {
  return lines.map((line) => ({
    text: line.text,
    ai: line.ai,
    refs: [...line.refs],
  }));
}
