/**
 * GitHub 이슈 보고 CLI (M0-22, FR-152) — 같은 원인의 열린 이슈가 있으면 댓글, 없으면 새 이슈.
 * 워크플로(collect.yml `report-failure` job)에서 쓰기 쉽게 만든 얇은 진입점이다. 판단·템플릿은
 * scripts/lib/github-issues.ts, 인자·환경변수 해석은 scripts/lib/report-issue-cli.ts(순수 함수).
 *
 * 예
 *   # Actions: needs 결과로 실패 job을 찾아 보고 (원인 키 collect:<실패 job>)
 *   GITHUB_TOKEN=… NEEDS_JSON='${{ toJSON(needs) }}' node --import tsx scripts/report-issue.ts \
 *     --kind pipeline-failure --workflow collect
 *   # 로컬 미리보기: GET만 보내고(공개 저장소는 토큰 없이) 만들 이슈·댓글을 출력
 *   GITHUB_REPOSITORY=sguys99/euro-digest NEEDS_JSON='{"collect":{"result":"failure"}}' \
 *     node --import tsx scripts/report-issue.ts --kind pipeline-failure --workflow collect --dry-run
 *   # 파일 payload
 *   node --import tsx scripts/report-issue.ts --kind source-broken --payload-file payload.json --dry-run
 *
 * 종료 코드: 생성·댓글·dry-run 성공 0, 인자·payload·API 오류 1(워크플로는 셸 폴백으로 넘어간다).
 * 토큰·응답 본문은 출력하지 않는다.
 */
import { appendFileSync, readFileSync } from "node:fs";

import {
  IssueReportError,
  previewReport,
  reportIssue,
  type IssueKind,
  type IssuePayloadInput,
} from "./lib/github-issues";
import { annotate, createLogger, sanitizeText } from "./lib/logger";
import {
  REPORT_ISSUE_USAGE,
  formatPreview,
  formatReportResult,
  formatReportSummary,
  parseReportIssueArgs,
  readReportEnv,
  resolveReportInput,
} from "./lib/report-issue-cli";

const TAG = "[report-issue]";

async function main(): Promise<number> {
  const parsed = parseReportIssueArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`${TAG} 인자 오류: ${parsed.error}\n\n${REPORT_ISSUE_USAGE}`);
    return 1;
  }
  const args = parsed.value;
  if (args.help) {
    console.log(REPORT_ISSUE_USAGE);
    return 0;
  }

  let payloadText: string | null = null;
  if (args.payloadFile) {
    try {
      payloadText = readFileSync(args.payloadFile, "utf8");
    } catch (error) {
      console.error(
        `${TAG} payload 파일을 읽지 못함: ${args.payloadFile} (${error instanceof Error ? error.message : String(error)})`,
      );
      return 1;
    }
  }

  const now = new Date();
  const input = resolveReportInput(args, process.env, payloadText, now);
  if (!input.ok) {
    console.error(`${TAG} ${input.error}`);
    return 1;
  }
  const { kind, key, payload } = input.value;
  const env = readReportEnv(process.env);
  const log = createLogger({ scope: "issues" });

  try {
    if (args.dryRun) {
      const preview = await previewReport({
        kind,
        ...(key ? { key } : {}),
        // payload 형식은 github-issues.ts가 zod로 검증한다(잘못되면 IssueReportError)
        payload: payload as IssuePayloadInput<IssueKind>,
        ...(env.repo ? { repo: env.repo } : {}),
        ...(env.token ? { token: env.token } : {}),
        ...(env.apiUrl ? { apiUrl: env.apiUrl } : {}),
        now: () => now,
      });
      console.log(formatPreview(preview));
      return 0;
    }

    if (!env.repo) {
      console.error(`${TAG} GITHUB_REPOSITORY가 필요합니다 (owner/name)`);
      return 1;
    }
    const result = await reportIssue({
      kind,
      ...(key ? { key } : {}),
      payload: payload as IssuePayloadInput<IssueKind>,
      repo: env.repo,
      token: env.token ?? "",
      ...(env.apiUrl ? { apiUrl: env.apiUrl } : {}),
      now: () => now,
      logger: log,
    });
    console.log(formatReportResult(result));
    annotate(
      "notice",
      result.action === "created"
        ? `새 이슈 #${result.number}: ${result.url}`
        : `이슈 #${result.number}에 댓글: ${result.commentUrl ?? result.url}`,
      { title: `이슈 보고 (${kind})` },
    );
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      try {
        appendFileSync(summaryFile, formatReportSummary(result));
      } catch {
        // 요약 기록 실패는 보고 성공을 뒤집지 않는다(폴백이 중복 이슈를 만들지 않게 exit 0 유지)
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof IssueReportError) {
      annotate("error", error.message, { title: "이슈 보고 실패" });
      return 1;
    }
    throw error;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    console.error(`${TAG} 예기치 못한 오류: ${sanitizeText(message, 300)}`);
    process.exitCode = 1;
  },
);
