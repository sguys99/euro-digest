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
  /** 실제 값 대조 패턴(secretValuePatterns)이면 그 환경변수 이름 — 보고용(값 아님) */
  envName?: string;
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
    // PEM 개인 키(RSA·EC·OPENSSH·DSA·ENCRYPTED·PGP 블록 등 — M5-08). 인증서(`BEGIN CERTIFICATE`)·공개 키는 비밀이 아니라 제외.
    id: "private-key",
    label: "개인 키 (-----BEGIN … PRIVATE KEY-----)",
    regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
    visiblePrefix: () => "-----BEGIN PRIVATE KEY-----",
  },
  {
    // 축구 데이터 API 인증 헤더에 키 문자열이 그대로 박힌 형태(M5-08). football-data.org `X-Auth-Token`, API-Football
    // `x-apisports-key`(직접) · `x-rapidapi-key`(RapidAPI 경유). 두 키 모두 32자리 16진수라 키 모양만으로는 빌드 해시와
    // 구별할 수 없다 — 헤더 이름 + 따옴표 리터럴(16자 이상)일 때만 잡는다. 변수 참조(`"X-Auth-Token":e`)는 값이 아니라 제외.
    id: "api-key-header",
    label:
      "API 키 헤더에 값이 박힘 (X-Auth-Token·x-apisports-key·x-rapidapi-key)",
    regex:
      /(x-auth-token|x-apisports-key|x-rapidapi-key)["']?\]?[ \t]*[:=][ \t]*["'`][A-Za-z0-9_-]{16,}/gi,
    visiblePrefix: (match) => `${match[1] ?? "?"}: `,
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

/**
 * 실제 비밀값 대조에 쓰는 환경변수(M5-08) — Secrets 3종 + GitHub 토큰(Actions `GITHUB_TOKEN` · gh CLI `GH_TOKEN`).
 * 키 모양 패턴으로 못 잡는 형식(football-data·API-Football 키는 32자리 16진수 — 빌드 해시와 같은 모양)도 값 자체로 찾는다.
 */
export const SECRET_VALUE_ENV_NAMES = [
  ...SECRET_ENV_NAMES,
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

/** 이보다 짧은 값은 대조하지 않는다 — 자리표시자(`x`·`test`)가 평범한 글자와 겹쳐 오탐하지 않게 */
export const MIN_SECRET_VALUE_LENGTH = 16;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 지금 환경에 있는 비밀값 그 자체를 찾는 패턴(M5-08). 비밀값이 env에 있는 곳(로컬 — `.env.local`을 node가
 * `--env-file-if-exists`로 읽는다)이 곧 빌드가 그 값을 번들에 인라인할 수 있는 곳이라, 그 자리에서 값으로 대조한다.
 * CI 빌드 단계에는 Secrets가 없다(collect.yml도 수집 단계에만 준다) — 그때는 빈 목록.
 * 정규식 원문에 값이 들어 있으므로 패턴 객체는 출력하지 않는다(보고는 label·visiblePrefix만 — 이름뿐).
 */
export function secretValuePatterns(
  env: Readonly<Record<string, string | undefined>>,
): SecretPattern[] {
  const seen = new Set<string>();
  const patterns: SecretPattern[] = [];
  for (const name of SECRET_VALUE_ENV_NAMES) {
    const value = env[name]?.trim();
    if (!value || value.length < MIN_SECRET_VALUE_LENGTH || seen.has(value))
      continue;
    seen.add(value);
    patterns.push({
      id: "env-value",
      label: `환경변수 ${name}의 실제 값`,
      regex: new RegExp(escapeRegExp(value), "g"),
      visiblePrefix: () => `${name}=`,
      envName: name,
    });
  }
  return patterns;
}

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

/**
 * 텍스트 안의 비밀값을 모두 가린다 — 로그·이슈 본문용(M0-22, scripts/lib/logger.ts·github-issues.ts).
 * 검사용 패턴(SECRET_PATTERNS)을 그대로 쓰되, `NAME=값` 패턴은 검사 정규식이 값의 첫 글자까지만 잡으므로
 * 값 끝(공백·따옴표 전)까지 늘려서 가린다. 결과는 `sk-ant-****`·`ghs_****`·`ANTHROPIC_API_KEY=****`.
 */
export function maskSecretsInText(
  text: string,
  patterns: readonly SecretPattern[] = SECRET_PATTERNS,
): string {
  let masked = text;
  for (const pattern of patterns) {
    const flags = pattern.regex.flags.includes("g")
      ? pattern.regex.flags
      : `${pattern.regex.flags}g`;
    const source =
      pattern.id === "env-assignment"
        ? `${pattern.regex.source}[^\\s"'\`]*`
        : pattern.regex.source;
    masked = masked.replace(new RegExp(source, flags), (...args: unknown[]) => {
      // replace 콜백 인자: (match, ...groups, offset, string) — 그룹만 골라 RegExpMatchArray 모양으로 만든다.
      const match = args[0] as string;
      const groups = args
        .slice(1, -2)
        .map((g) => (typeof g === "string" ? g : undefined));
      const asMatch = Object.assign([match, ...groups], {
        index: 0,
        input: match,
      }) as unknown as RegExpMatchArray;
      return maskSecret(pattern.visiblePrefix(asMatch));
    });
  }
  return masked;
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
  /** 실제 값으로 대조한 환경변수 이름(값이 아님 — secretValuePatterns). 없으면 키 모양 패턴만 */
  valueEnvNames?: readonly string[];
}

/** 비밀값 검사 결과 문구. 값은 이미 가려진 상태(SecretFinding.masked)만 출력한다. */
export function formatSecretReport(
  findings: readonly SecretFinding[],
  stats: SecretScanStats,
): string {
  const lines = [
    `대상: 파일 ${stats.files}개 중 텍스트 ${stats.textFiles}개 검사, 모든 파일 이름에서 .env* 확인`,
    `패턴: ${[...SECRET_PATTERNS.map((pattern) => pattern.label), ".env* 파일"].join(" · ")}`,
    stats.valueEnvNames && stats.valueEnvNames.length > 0
      ? `실제 값 대조: ${stats.valueEnvNames.join(" · ")} (값은 출력하지 않음)`
      : "실제 값 대조: 없음 (이 환경에 비밀 환경변수 값이 없음 — 키 모양 패턴만)",
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
