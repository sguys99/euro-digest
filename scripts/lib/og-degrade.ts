/**
 * OG 이미지 굽기 강등 규칙 (M5-13 — PRD §15 D77, plan M5-01 후속). 순수 함수만 — scripts/build-og.ts가 쓴다.
 *
 * 공유 이미지 하나가 그날 뉴스 · 브리핑 발행을 막지 않는다(브리핑 실패가 발행을 멈추지 않는 것과 같은 원칙 — CLAUDE §6.2).
 * - `strict`(기본): 지금까지와 같다 — 굽기 실패(Chromium 없음 · 글꼴 미준비 · 스크린샷 오류)는 exit 1. ci.yml check job ·
 *   로컬 `npm run build`가 이 모드라 템플릿 회귀를 그대로 잡는다.
 * - `soft`(`OG_BUILD_MODE=soft` — collect · weekly · deploy 빌드 단계): 실패한 장은 경고(`::warning::`) · 구조화 로그 ·
 *   Step Summary에 남기고 빌드를 계속한다. 그 쪽 메타는 실제로 있는 PNG만 가리킨다 — 파일이 없으면 `/og/default.png`로 접힌다
 *   (src/lib/seo.ts `ogImageMeta` · src/lib/data/og-files.ts). 입력 해시가 PNG에 없으니 다음 빌드(다음 수집 실행 · 사람 push의
 *   배포)의 `--check`가 그 장을 다시 구울 것으로 센다.
 */

export type OgBuildMode = "strict" | "soft";

/** `OG_BUILD_MODE` 환경변수 · `--soft` 인자 → 모드. 모르는 값은 던진다(오타로 조용히 엄격 · 느슨해지지 않게) */
export function ogBuildMode(
  env: Readonly<Record<string, string | undefined>>,
  args: ReadonlySet<string>,
): OgBuildMode {
  if (args.has("--soft")) return "soft";
  const raw = env.OG_BUILD_MODE?.trim() ?? "";
  if (raw === "" || raw === "strict") return "strict";
  if (raw === "soft") return "soft";
  throw new RangeError(
    `OG_BUILD_MODE는 strict 또는 soft (받은 값: ${JSON.stringify(raw)})`,
  );
}

export interface OgFailure {
  /** 사이트 경로(`/og/…png`) — 계획 단계 실패면 null(어느 장인지 모름) */
  path: string | null;
  message: string;
}

/** 한 줄 사유 — 메시지 첫 줄만, 길이 제한(로그 · 주석에 긴 스택이 붙지 않게) */
export function failureMessage(error: unknown, max = 200): string {
  const text = error instanceof Error ? error.message : String(error);
  const first = text.split("\n")[0]?.trim() ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/** 경고 주석 한 줄(제목 · 본문) */
export function ogWarning(failures: readonly OgFailure[]): {
  title: string;
  message: string;
} {
  const paths = failures.flatMap((f) => (f.path ? [f.path] : []));
  const head =
    paths.length > 0
      ? `${paths.length}장 못 구움(${paths.slice(0, 3).join(" · ")}${paths.length > 3 ? " 외" : ""})`
      : "굽기 계획을 세우지 못함";
  const reason = failures[0]?.message ?? "";
  return {
    title: "OG 이미지 굽기 실패 — 발행 계속",
    message: `${head}: ${reason}. 그 쪽 메타는 /og/default.png(옛 PNG가 있으면 옛 그림)로 접히고, 다음 빌드가 다시 굽는다.`,
  };
}

/** Step Summary 절(마크다운) — 사유별 한 줄(장 수 · 앞 3장), 사유는 최대 10줄 */
export function ogSummaryMarkdown(failures: readonly OgFailure[]): string {
  const byReason = new Map<string, (string | null)[]>();
  for (const f of failures) {
    byReason.set(f.message, [...(byReason.get(f.message) ?? []), f.path]);
  }
  const groups = [...byReason.entries()];
  const rows = groups.slice(0, 10).map(([message, paths]) => {
    const named = paths.flatMap((p) => (p ? [`\`${p}\``] : []));
    const shown =
      named.length === 0
        ? "(계획 단계)"
        : `${named.slice(0, 3).join(" · ")}${named.length > 3 ? ` 외 ${named.length - 3}` : ""}`;
    return `| ${message.replace(/\|/g, "\\|")} | ${named.length} | ${shown} |`;
  });
  const more =
    groups.length > 10
      ? ["", `… 사유 ${groups.length - 10}개 더(로그 참고)`]
      : [];
  return [
    "## OG 이미지 — 강등(발행 계속)",
    "",
    "공유 이미지를 굽지 못했지만 뉴스 · 브리핑 발행은 계속했다. 못 구운 쪽의 `og:image`는 `/og/default.png`(옛 PNG가 있으면 옛 그림)를 가리킨다. 다음 수집 실행 · 사람 push의 배포가 다시 굽는다.",
    "",
    "| 사유 | 장 | 이미지 |",
    "|---|---|---|",
    ...rows,
    ...more,
    "",
  ].join("\n");
}
