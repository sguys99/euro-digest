import { describe, expect, it } from "vitest";

import {
  envFileFinding,
  formatSecretReport,
  isEnvFileName,
  isProbablyBinary,
  maskSecret,
  maskSecretsInText,
  scanTextForSecrets,
} from "../scripts/lib/secret-scan";

// 가짜 비밀값은 실행 중에 조립한다. 소스 파일에 토큰 모양 문자열을 그대로 두면
// GitHub 비밀 스캔(push protection)에 걸리거나 다른 검사가 오탐할 수 있다.
const FAKE = {
  anthropic: ["sk", "ant", "api03", "Ab12Cd34Ef56Gh78"].join("-"),
  ghp: `${"gh"}p_${"A1b2C3d4".repeat(5)}`,
  ghs: `${"gh"}s_${"Z9y8X7w6".repeat(5)}`,
  pat: `${"github"}_pat_${"11ABCDEFG0_abcdefghijklmnop".repeat(2)}`,
};

describe("scanTextForSecrets", () => {
  it("Anthropic 키를 찾고 접두사만 남겨 가린다", () => {
    const findings = scanTextForSecrets(`const k="${FAKE.anthropic}";`, "a.js");
    expect(findings).toEqual([
      {
        file: "a.js",
        line: 1,
        patternId: "anthropic-key",
        label: "Anthropic API 키 (sk-ant-)",
        masked: "sk-ant-****",
      },
    ]);
  });

  it("GitHub 토큰(ghp_·ghs_)과 fine-grained PAT를 줄 번호와 함께 찾는다", () => {
    const text = `첫 줄\nurl?token=${FAKE.ghp}\n\n${FAKE.ghs} ${FAKE.pat}`;
    const findings = scanTextForSecrets(text, "page.html");
    expect(
      findings.map(({ line, patternId, masked }) => ({
        line,
        patternId,
        masked,
      })),
    ).toEqual([
      { line: 2, patternId: "github-token", masked: "ghp_****" },
      { line: 4, patternId: "github-token", masked: "ghs_****" },
      { line: 4, patternId: "github-pat", masked: "github_pat_****" },
    ]);
  });

  it.each([
    ["ANTHROPIC_API_KEY=abc123", "ANTHROPIC_API_KEY=****"],
    ["export FOOTBALL_DATA_API_KEY = 'xyz'", "FOOTBALL_DATA_API_KEY=****"],
    ['{"API_FOOTBALL_KEY":"k-1"}', "API_FOOTBALL_KEY=****"],
    ['e={API_FOOTBALL_KEY:"k-1"}', "API_FOOTBALL_KEY=****"],
    ["NEXT_PUBLIC_ANTHROPIC_API_KEY=abc", "ANTHROPIC_API_KEY=****"],
  ])("비밀 환경변수에 값이 박힌 형태를 찾는다: %s", (text, masked) => {
    const findings = scanTextForSecrets(text, ".env.production");
    expect(
      findings.map((finding) => [finding.patternId, finding.masked]),
    ).toEqual([["env-assignment", masked]]);
  });

  it.each([
    [
      "값이 빈 할당",
      'ANTHROPIC_API_KEY=\nAPI_FOOTBALL_KEY= \nFOOTBALL_DATA_API_KEY=""',
    ],
    ["이름만 언급", "키는 ANTHROPIC_API_KEY 시크릿으로 관리한다"],
    ["설명 문장의 콜론", "ANTHROPIC_API_KEY: GitHub Actions Secrets에 저장"],
    ["Actions 표현식", "${{ secrets.ANTHROPIC_API_KEY }}"],
    ["접두사만 있는 문장", "키는 sk-ant-로 시작한다"],
    ["짧은 gh 접두 식별자", "var ghp_x=1, my_ghs_token_name=2;"],
  ])("오탐하지 않는다: %s", (_name, text) => {
    expect(scanTextForSecrets(text, "x.txt")).toEqual([]);
  });

  it("출력용 결과 어디에도 원래 값이 남지 않는다", () => {
    const findings = scanTextForSecrets(
      `${FAKE.anthropic}\n${FAKE.ghp}\n${FAKE.pat}`,
      "f.txt",
    );
    const serialized =
      JSON.stringify(findings) +
      formatSecretReport(findings, { files: 1, textFiles: 1 });
    for (const secret of [FAKE.anthropic, FAKE.ghp, FAKE.pat]) {
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(secret.slice(-8));
    }
  });

  it("같은 입력을 여러 번 검사해도 결과가 같다(정규식 상태가 남지 않음)", () => {
    const text = `${FAKE.ghp} ${FAKE.ghp}`;
    expect(scanTextForSecrets(text, "a")).toHaveLength(2);
    expect(scanTextForSecrets(text, "a")).toHaveLength(2);
  });
});

describe("maskSecret · isEnvFileName · isProbablyBinary", () => {
  it("값 길이와 무관하게 고정 길이로 가린다", () => {
    expect(maskSecret("ghp_")).toBe("ghp_****");
  });

  it.each([
    [".env", true],
    [".env.local", true],
    [".env.production", true],
    [".env.example", true],
    ["env.js", false],
    ["index.html", false],
  ])("isEnvFileName(%j) → %s", (name, expected) => {
    expect(isEnvFileName(name)).toBe(expected);
  });

  it("NUL 바이트가 있으면 바이너리로 본다", () => {
    expect(
      isProbablyBinary(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01])),
    ).toBe(true);
    expect(
      isProbablyBinary(new TextEncoder().encode("유로 다이제스트 <html>")),
    ).toBe(false);
  });
});

describe("formatSecretReport", () => {
  it("발견이 없으면 통과", () => {
    expect(formatSecretReport([], { files: 24, textFiles: 20 })).toContain(
      "결과: 통과 — 발견 0건",
    );
  });

  it("파일:줄·패턴·가린 값만 보여 주고 실패로 요약한다", () => {
    const findings = [
      ...scanTextForSecrets(`\n${FAKE.anthropic}`, "_next/static/chunks/a.js"),
      envFileFinding(".env.local"),
    ];
    const text = formatSecretReport(findings, { files: 3, textFiles: 3 });
    expect(text).toContain(
      "발견: _next/static/chunks/a.js:2 — Anthropic API 키 (sk-ant-) — sk-ant-****",
    );
    expect(text).toContain(
      "발견: .env.local — 환경변수 파일(.env*)이 배포 산출물에 포함됨",
    );
    expect(text).toContain("결과: 실패 — 비밀값 의심 2건 (값은 출력하지 않음)");
  });
});

describe("maskSecretsInText (M0-22 — 로그·이슈 본문 안전망)", () => {
  it("토큰 값을 접두사만 남기고 가린다(값 전체가 사라진다)", () => {
    const text = `a ${FAKE.anthropic} b ${FAKE.ghp} c ${FAKE.ghs} d ${FAKE.pat}`;
    const masked = maskSecretsInText(text);
    expect(masked).toBe(
      "a sk-ant-**** b ghp_**** c ghs_**** d github_pat_****",
    );
    for (const value of Object.values(FAKE)) {
      expect(masked).not.toContain(value);
    }
  });

  it("gho_·ghu_·ghr_ 토큰도 가린다", () => {
    const body = "Q1w2E3r4".repeat(5);
    for (const prefix of ["o", "u", "r"]) {
      const token = `${"gh"}${prefix}_${body}`;
      expect(maskSecretsInText(`x ${token} y`)).toBe(`x gh${prefix}_**** y`);
    }
  });

  it("NAME=값 형태는 값 끝까지 가린다(첫 글자만 가리지 않는다)", () => {
    expect(maskSecretsInText("ANTHROPIC_API_KEY=abcdef123 next")).toBe(
      "ANTHROPIC_API_KEY=**** next",
    );
    expect(maskSecretsInText("export API_FOOTBALL_KEY = 'xyz789'")).toBe(
      "export API_FOOTBALL_KEY=****'",
    );
    expect(maskSecretsInText("ANTHROPIC_API_KEY=")).toBe("ANTHROPIC_API_KEY=");
  });

  it("비밀값이 없으면 그대로 돌려준다", () => {
    expect(maskSecretsInText("collect 3건 · HTTP 503")).toBe(
      "collect 3건 · HTTP 503",
    );
  });
});
