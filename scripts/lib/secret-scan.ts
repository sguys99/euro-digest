/**
 * 배포 산출물(out/) 비밀값 검사 — 패턴 매칭·마스킹·보고 문구, I/O 없는 순수 함수 (M0-12, NFR-07).
 * 파일 순회는 scripts/lib/bundle-check.ts가 맡는다.
 *
 * 원칙: 발견한 값은 어디에도 출력하지 않는다. 고정 접두사나 변수 이름만 남기고 나머지는 `****`로
 * 가린다(길이도 드러나지 않게 고정 길이).
 */

export interface SecretPattern {
  id: string;
  /** 사람이 읽는 패턴 이름 */
  label: string;
  regex: RegExp;
  /** 출력에 남겨도 되는 앞부분 — 값이 아닌 고정 접두사나 변수 이름만 */
  visiblePrefix: (match: RegExpMatchArray) => string;
}

/** 비밀값으로 의심되는 환경변수 이름(CLAUDE.md §10 Secrets) */
export const SECRET_ENV_NAMES = [
  "ANTHROPIC_API_KEY",
  "FOOTBALL_DATA_API_KEY",
  "API_FOOTBALL_KEY",
] as const;

const ENV_NAME_GROUP = SECRET_ENV_NAMES.join("|");

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "anthropic-key",
    label: "Anthropic API 키 (sk-ant-)",
    regex: /sk-ant-[A-Za-z0-9_-]{8,}/g,
    visiblePrefix: () => "sk-ant-",
  },
  {
    // ghp_ 개인 토큰, gho_ OAuth, ghu_·ghs_ 앱(Actions GITHUB_TOKEN 포함), ghr_ 갱신 토큰
    id: "github-token",
    label: "GitHub 토큰 (ghp_·gho_·ghu_·ghs_·ghr_)",
    regex: /(?<![A-Za-z0-9])(gh[pousr])_[A-Za-z0-9]{20,}/g,
    visiblePrefix: (match) => `${match[1] ?? "gh?"}_`,
  },
  {
    id: "github-pat",
    label: "GitHub fine-grained PAT (github_pat_)",
    regex: /github_pat_[A-Za-z0-9_]{20,}/g,
    visiblePrefix: () => "github_pat_",
  },
  {
    // `NAME=값`(.env·셸 형식) 또는 `NAME:"값"`·`"NAME":"값"`(JS·JSON 형식). 빈 값(`NAME=`·`NAME=""`)은 제외.
    // `=` 앞뒤 공백은 같은 줄 안(공백·탭)만 — 빈 할당 다음 줄의 내용을 값으로 오인하지 않도록.
    id: "env-assignment",
    label: "비밀 환경변수에 값이 박힘 (NAME=값)",
    regex: new RegExp(
      `(${ENV_NAME_GROUP})(?:[ \\t]*=[ \\t]*["'\`]?|["']?[ \\t]*:[ \\t]*["'\`])[^\\s"'\`]`,
      "g",
    ),
    visiblePrefix: (match) => `${match[1] ?? "?"}=`,
  },
];

export interface SecretFinding {
  /** out/ 기준 파일 경로 */
  file: string;
  /** 1부터 시작하는 줄 번호. 파일 자체가 문제인 경우(.env 파일) 0 */
  line: number;
  patternId: string;
  label: string;
  /** 값을 가린 표시(예: `sk-ant-****`) */
  masked: string;
}

/** 값 부분을 고정 길이 `****`로 가린다. */
export function maskSecret(visiblePrefix: string): string {
  return `${visiblePrefix}****`;
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (
    let position = text.indexOf("\n");
    position !== -1 && position < index;
  ) {
    line += 1;
    position = text.indexOf("\n", position + 1);
  }
  return line;
}

/** 텍스트에서 비밀 패턴을 모두 찾는다. 결과는 줄 번호·패턴 순. */
export function scanTextForSecrets(
  text: string,
  file: string,
  patterns: readonly SecretPattern[] = SECRET_PATTERNS,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const pattern of patterns) {
    // 공유 RegExp의 lastIndex 상태를 건드리지 않도록 매번 새로 만든다.
    const flags = pattern.regex.flags.includes("g")
      ? pattern.regex.flags
      : `${pattern.regex.flags}g`;
    for (const match of text.matchAll(
      new RegExp(pattern.regex.source, flags),
    )) {
      findings.push({
        file,
        line: lineNumberAt(text, match.index ?? 0),
        patternId: pattern.id,
        label: pattern.label,
        masked: maskSecret(pattern.visiblePrefix(match)),
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** `.env`, `.env.local`, `.env.production` 등 환경변수 파일 이름인가(경로가 아닌 파일 이름을 넘길 것) */
export function isEnvFileName(fileName: string): boolean {
  return fileName.startsWith(".env");
}

/** `.env*` 파일이 배포 산출물에 있다는 것 자체를 발견 항목으로 만든다. */
export function envFileFinding(file: string): SecretFinding {
  return {
    file,
    line: 0,
    patternId: "env-file",
    label: "환경변수 파일(.env*)이 배포 산출물에 포함됨",
    masked: "(파일 내용은 출력하지 않음)",
  };
}

/** 앞 8000바이트에 NUL이 있으면 바이너리(이미지·폰트 등)로 보고 텍스트 검사를 건너뛴다. */
export function isProbablyBinary(content: Uint8Array): boolean {
  const limit = Math.min(content.length, 8000);
  for (let index = 0; index < limit; index += 1) {
    if (content[index] === 0) return true;
  }
  return false;
}

export interface SecretScanStats {
  files: number;
  textFiles: number;
}

/** 비밀값 검사 결과 문구. 값은 이미 가려진 상태(SecretFinding.masked)만 출력한다. */
export function formatSecretReport(
  findings: readonly SecretFinding[],
  stats: SecretScanStats,
): string {
  const lines = [
    `대상: 파일 ${stats.files}개 중 텍스트 ${stats.textFiles}개 검사, 모든 파일 이름에서 .env* 확인`,
    `패턴: ${[...SECRET_PATTERNS.map((pattern) => pattern.label), ".env* 파일"].join(" · ")}`,
  ];
  if (findings.length === 0) {
    lines.push("결과: 통과 — 발견 0건");
    return lines.join("\n");
  }
  for (const finding of findings) {
    const location =
      finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(`발견: ${location} — ${finding.label} — ${finding.masked}`);
  }
  lines.push(
    `결과: 실패 — 비밀값 의심 ${findings.length}건 (값은 출력하지 않음)`,
  );
  return lines.join("\n");
}
