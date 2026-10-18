/**
 * M1-20 일일 브리핑 지시문(`configs/prompts/summarize.md` — v0.1 → v0.2 허용 문형 목록(D50) → v0.3 문형 축소·문법과 한 출처(D53 ②)
 * → **v0.4 지금 입력에 없는 키(korean·prev) 문형 뺌·승패 문장 주어 팀 점수 먼저(D55)**) — 로딩, 필수 규칙
 * 가드, 입력 키 설명, 크기·글자 구성(비용 어림). 네트워크·LLM 없음. [문형] 목록과 검사기 문법(brief-grammar.ts)의 일치는
 * tests/brief-grammar.test.ts가 본다(지시문 예문·문형마다 채운 참 문장이 모두 통과).
 *
 * 규칙 가드는 문구를 통째로 고정하지 않고 사용자 결정의 핵심 표현만 확인한다(D30 주어 팀 점수 먼저 · D40 ②③⑤ · M1-19 승부차기 ·
 * M1-21 이름 줄이지 않기). 지시문을 고치면 `npm run eval:prompt`(M1-24)로 회귀 비교하고 이 표현이 바뀌었으면 여기도 고친다.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  BRIEF_PROMPT_PATH,
  briefPromptId,
  buildBriefRequest,
  estimateBriefInputTokens,
  loadBriefPrompt,
} from "../scripts/lib/brief";
import { NamesKoFileSchema } from "@/lib/schema";

import type { BriefInput } from "../scripts/lib/brief-input";
import { scanTextForSecrets } from "../scripts/lib/secret-scan";
import { PROMPT_FILES, PROMPTS_DIR } from "../scripts/lib/validate-report";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const PROMPT = read(BRIEF_PROMPT_PATH).trim();
/** M0-30 임시 프롬프트 긴 판 — 실측 2,119자 → 2,034토큰(fixtures/llm/README.md) */
const M0_LONG = read("fixtures/llm/brief-inputs/prompt-m0-30-long.md").trim();
const M0_LONG_TOKENS = 2034;

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function tmpRoot(prompt?: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-prompt-"));
  tmpDirs.push(dir);
  if (prompt !== undefined) {
    mkdirSync(path.join(dir, PROMPTS_DIR), { recursive: true });
    writeFileSync(path.join(dir, BRIEF_PROMPT_PATH), prompt);
  }
  return dir;
}

describe("지시문 로딩 (M1-01 이월 — 슬라이스 fixture 지시문에서 교체)", () => {
  it("경로는 configs/prompts/summarize.md(파일명 유지 — PRD §9.2)이고 validate가 검사하는 프롬프트 파일이다", () => {
    expect(BRIEF_PROMPT_PATH).toBe("configs/prompts/summarize.md");
    expect(BRIEF_PROMPT_PATH).toBe(`${PROMPTS_DIR}/${PROMPT_FILES[0]}`);
  });

  it("저장소 지시문을 파일 내용 .trim() 그대로 읽는다(머리말·주석 처리 없음)", async () => {
    const text = await loadBriefPrompt(ROOT);
    expect(text).toBe(PROMPT);
    expect(text.length).toBeGreaterThan(1000);
  });

  it("앞뒤 공백만 지우고, 비어 있거나 공백뿐이면 던진다(호출부가 setup 실패 → 템플릿)", async () => {
    await expect(loadBriefPrompt(tmpRoot("\n  지시문\n\n"))).resolves.toBe(
      "지시문",
    );
    await expect(loadBriefPrompt(tmpRoot(" \n\t\n"))).rejects.toThrow(
      "configs/prompts/summarize.md가 비어 있다",
    );
  });

  it("파일이 없으면 던진다(M0-30 fixture 지시문으로 되돌아가지 않는다)", async () => {
    await expect(loadBriefPrompt(tmpRoot())).rejects.toThrow();
  });

  it("요청 system = 지시문, 설정은 D28·D53(max_tokens 8,192·thinking 적응형·effort medium·캐싱 끔)", () => {
    const input: BriefInput = {
      briefDate: "2026-10-11",
      matches: [],
      standings: [],
    };
    expect(buildBriefRequest(input, PROMPT)).toMatchObject({
      system: PROMPT,
      maxTokens: 16_384,
      thinking: "adaptive",
      effort: "medium",
    });
    expect(buildBriefRequest(input, PROMPT).cacheSystem).toBeUndefined();
  });

  it("지시문 판 식별자는 내용의 결정적 해시(로그용)", () => {
    expect(briefPromptId(PROMPT)).toMatch(/^p_[0-9a-f]{12}$/);
    expect(briefPromptId(PROMPT)).toBe(briefPromptId(`${PROMPT}`));
    expect(briefPromptId(PROMPT)).not.toBe(briefPromptId(M0_LONG));
  });
});

describe("지시문 내용 — 사용자 결정 가드", () => {
  it.each([
    ["출력 형식(짧은 키 JSON)", '{"l":[{"t":"문장","r":["근거 id"]}]}'],
    ["코드블록 없이 JSON만", "코드블록"],
    ["뉴스체", "~했다"],
    ["최대 5줄", "최대 5줄"],
    ["줄당 60자 내외", "60자 안팎"],
    ["80자 상한(D40 ⑤)", "80자를 넘는 줄은 버려진다"],
    ["입력에 없는 사실 금지", "JSON에 있는 사실만 쓴다"],
    ["파생 숫자는 근거 두 숫자의 차·합만(D40 ②)", "두 숫자를 더하거나 뺀 값만"],
    [
      "전일 순위 없으면 변동 서술 금지(D40 ③ — D55 ①로 prev 키 설명은 뺐다)",
      "순위 변동(올랐다·내려갔다·지켰다)은 쓰지 않는다",
    ],
    ["prev 없으면 '~위다/~위를 달린다'(D40 ③)", "3위를 달린다"],
    ["주어 팀 점수 먼저(D30)", "주어 팀 점수를 먼저 쓴다"],
    ["원정 팀이 주어면 ft를 뒤집는다(D55 ②)", "원정 팀이 주어면 ft를 뒤집는다"],
    ["ft는 홈-원정", '늘 "홈-원정" 순서'],
    [
      "승부차기 경기를 '비겼다'로 쓰지 않음(M1-19 이월)",
      "'비겼다'로 쓰지 않는다",
    ],
    ["고유명사 영문 그대로·줄이지 않기(M1-21 이월)", "줄이지도 않는다"],
    ["앞쪽(중요) 경기 우선(M1-19 이월)", "앞쪽 경기부터 고른다"],
    ["같은 문형 반복 피하기", "같은 문형이 되지 않게"],
    ["사실을 바꾸지 않는 범위", "사실을 바꾸지는 않는다"],
    // 2026-10-17 사용자 결정(M1-20 리뷰) — 파생 서술은 정의대로 허용(검사기 M1-23이 검증), 평가 어휘는 템플릿과 같은 '완파'만
    [
      "평가 어휘는 '완파'·'역전승'만",
      "'완파'(3골 차 이상)와 '역전승'(아래 정의)만",
    ],
    [
      "세는 숫자는 한 선수의 골 수뿐(팀·시간대별 골 수 금지)",
      "세어서 쓰는 숫자는 한 선수의 골 수뿐이다",
    ],
    [
      "해트트릭 = 그 선수 goals 항목 3개(자책골 제외)",
      "그 선수 항목(own_goal 제외)을 센 값이고, 3골이면 '해트트릭'",
    ],
    ["결승골 정의", "이긴 팀의 (진 팀 점수 + 1)번째 골"],
    [
      "결승골이 자책골이면 득점자 이름으로 쓰지 않음",
      "own_goal이면 득점자 이름으로 쓰지 않는다",
    ],
    [
      "역전승은 ht·득점 순서로 확인될 때만",
      "ht나 goals 순서에서 이긴 팀이 뒤진 적이 확인될 때만",
    ],
    [
      "90분에 앞선 연장 승리는 사실 문형(합계 미기재)",
      "'TeamA와 TeamB의 경기는 연장까지 2-1로 끝났다'",
    ],
    ["순위표 범위는 note대로", "note에 적힌 범위만"],
    ["한 문장의 사실은 둘까지", "한 문장에 담는 사실은 둘까지다"],
    ["쉼표로 절을 잇지 않음", "쉼표로 절을 이어 붙이지 않는다"],
    ["승점 표기 통일", "승점은 '승점 24'처럼 쓴다"],
    // 2026-10-17 사용자 결정(D50) — 닫힌 문법: 허용 문형 목록을 지시문에 넣고 그 꼴로만 쓰게 한다
    ["문형으로만 쓴다(D50)", "아래 [문형]에 있는 꼴로만 쓴다"],
    [
      "문형 밖 줄은 버려진다(D50)",
      "문형 밖의 동사·수식·평가가 들어간 줄은 버려진다",
    ],
    ["허용 문형 목록 절", "[문형]"],
    ["두 문형 잇기는 -고·-며", "문형 둘을 '-고'·'-며'로 잇는다"],
    // 2026-10-17 M1-23 3회차 리뷰 — 두 절은 같은 경기, 공동 순위·같은 순위표, '연장까지'는 aet만
    ["두 문형은 같은 경기", "두 문형은 같은 경기"],
    ["같은 pos면 '공동'", "pos가 같은 팀이 있으면 '공동'을 붙인다"],
    ["한 문장의 팀은 같은 순위표", "한 문장의 팀은 같은 순위표에 있어야 한다"],
    ["'연장까지'는 aet만", "'연장까지'는 aet가 있을 때만 쓴다"],
    ["골 합은 두 팀이 모두 넣은 경기만", "두 팀이 모두 넣은 경기의 골 합"],
  ])("%s", (_, phrase) => {
    expect(PROMPT).toContain(phrase);
  });

  it("평가 어휘는 템플릿과 같은 '완파'만 — '대파'·'신승'은 쓰지 않는다(2026-10-17 사용자 결정)", () => {
    expect(PROMPT).toContain("완파");
    expect(PROMPT).not.toMatch(/대파|신승/);
  });

  it("브리핑 입력이 낼 수 있는 키를 모두 설명한다(새 키를 더하면 지시문도 고칠 것)", () => {
    // 선택 키까지 모두 채운 입력 — 구조 키(briefDate·rows)만 빼고 지시문에 이름이 나와야 한다
    const full: BriefInput = {
      briefDate: "2026-10-11",
      matches: [
        {
          id: "m1",
          comp: "UEFA Champions League",
          round: "FINAL",
          home: "TeamA",
          away: "TeamB",
          ft: "1-1",
          ht: "0-1",
          aet: true,
          regular: "1-1",
          pens: "4-3",
          goals: [
            {
              min: "10",
              team: "TeamB",
              player: "PlayerX",
              assist: "PlayerY",
              type: "penalty",
            },
          ],
        },
      ],
      standings: [
        {
          id: "sUCL",
          comp: "UEFA Champions League",
          note: "current table, top 4 positions only",
          rows: [{ pos: 1, team: "TeamA", played: 1, pts: 3, gd: 1 }],
        },
      ],
    };
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(full);
    const structural = new Set(["briefDate", "rows"]);
    const missing = [...keys, "penalty", "own_goal"]
      .filter((k) => !structural.has(k))
      .filter(
        (k) => !new RegExp(`(?<![A-Za-z_])${k}(?![A-Za-z_])`).test(PROMPT),
      );
    expect(missing).toEqual([]);
  });

  it("지금 입력에 없는 키(전일 순위 prev·한국 선수 korean)는 설명하지 않는다(D55 ① — M2-03·M3-03이 키를 더할 때 문형과 함께 되살린다)", () => {
    for (const key of ["prev", "korean"])
      expect(PROMPT).not.toMatch(
        new RegExp(`(?<![A-Za-z_])${key}(?![A-Za-z_])`),
      );
    expect(PROMPT).not.toContain("한국 선수");
  });

  it("토너먼트 라운드만 한국어로 옮기고 라운드 영어 낱말을 남기지 않게 한다(brief-case-leftover-word 'Matchday')", () => {
    expect(PROMPT).toContain("round는 영어로 남기지 않는다");
    for (const stage of [
      "FINAL '결승'",
      "SEMI_FINALS '4강'",
      "QUARTER_FINALS '8강'",
      "LAST_16 '16강'",
      "PLAYOFFS '플레이오프'",
    ]) {
      expect(PROMPT).toContain(stage);
    }
    // 목록 밖 round는 쓰지 않는다(검사기가 근거 경기 round 값으로 대조할 낱말을 다섯 가지로 묶는다 — M1-23)
    expect(PROMPT).toContain(
      "그 밖의 round(THIRD_PLACE·LAST_32·예선 등)는 쓰지 않는다",
    );
  });

  it("실제 팀·선수·감독 이름(configs/names.ko.json 영문 표기)이 지시문에 없다 — 예시는 자리표시자만", () => {
    const names = NamesKoFileSchema.parse(
      JSON.parse(read("configs/names.ko.json")),
    );
    const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = names.entries
      .flatMap((e) => e.en)
      .filter((en) => en.length >= 3)
      .filter((en) =>
        new RegExp(`(?<![\\p{L}])${escape(en)}(?![\\p{L}])`, "u").test(PROMPT),
      );
    expect(found).toEqual([]);
  });

  it("예시는 자리표시자 이름만 쓴다(실제 팀 이름이 예시 문장에 섞이지 않게)", () => {
    const examples = PROMPT.slice(
      PROMPT.indexOf("[예]"),
      PROMPT.indexOf("[쓰기 전 확인]"),
    );
    expect(examples.length).toBeGreaterThan(100);
    const latin = examples.match(/\b[A-Z][A-Za-z]+\b/g) ?? [];
    expect(latin.filter((w) => !/^(?:Team|Player)[A-Z]$/.test(w))).toEqual([]);
  });

  it("비밀값·URL이 없다", () => {
    expect(scanTextForSecrets(PROMPT, BRIEF_PROMPT_PATH)).toEqual([]);
    expect(PROMPT).not.toMatch(/https?:\/\//);
  });
});

describe("지시문 크기 — 비용·입력 어림(M1-22 이월)", () => {
  /** 글자 구성 — 한글 음절 비율(토큰/글자 비율을 좌우한다) */
  const hangulShare = (text: string) =>
    (text.match(/\p{Script=Hangul}/gu) ?? []).length / text.length;

  it("5,000자 이하(약 4,800토큰 — 요청당 입력 약 $0.0005). 넘기면 비용 영향을 보고할 것", () => {
    expect(PROMPT.length).toBeLessThanOrEqual(5000);
  });

  it("글자 구성이 M0-30 긴 판(실측 0.96토큰/자)과 같아(한글 비율 ±3%p) 글자당 1토큰 어림이 넉넉하다", () => {
    expect(Math.abs(hangulShare(PROMPT) - hangulShare(M0_LONG))).toBeLessThan(
      0.03,
    );
    const measuredLike = PROMPT.length * (M0_LONG_TOKENS / M0_LONG.length);
    const estimate = estimateBriefInputTokens({ system: PROMPT, user: "" });
    expect(estimate).toBeGreaterThan(measuredLike * 1.03);
  });
});
