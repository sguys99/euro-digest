/**
 * 워크플로 YAML 구조 테스트용 텍스트 도구 — 저장소의 .github/workflows/*.yml을 job·step 단위로 잘라 본다.
 *
 * YAML 파서 의존성을 들이지 않고(CLAUDE.md §2 — 새 의존성은 질문 대상) 이 저장소 워크플로의 고정 들여쓰기만 가정한다:
 * job 키 2칸(`  <job>:`), step 시작 6칸 대시(`      - `), step 키 8칸, `run: |` 본문 10칸 이상. 들여쓰기를 바꾸면 테스트가
 * 단계를 못 찾아 실패한다(조용히 통과하지 않는다).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readWorkflow(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)),
    "utf8",
  );
}

/** `jobs:` 아래 job 하나의 텍스트(다음 job 키 직전까지). 없으면 던진다. */
export function jobBlock(workflow: string, jobId: string): string {
  const jobsAt = workflow.search(/^jobs:\n/m);
  if (jobsAt < 0) throw new Error("jobs: 없음");
  const body = workflow.slice(jobsAt);
  const keys = [...body.matchAll(/^ {2}([A-Za-z_][\w-]*):\n/gm)];
  const index = keys.findIndex((m) => m[1] === jobId);
  if (index < 0) throw new Error(`job 없음: ${jobId}`);
  const start = keys[index]?.index ?? 0;
  const end = keys[index + 1]?.index ?? body.length;
  return body.slice(start, end);
}

export interface WorkflowStep {
  /** `name:` 값 — 이름 없는 step(`- run:`·`- uses:`로 시작하고 name 키도 없음)은 "" */
  name: string;
  /**
   * step의 키·본문(8칸 이상) — name 줄은 뺀다. 대시 줄의 첫 키(`- run: …`·`- uses: …`)는 8칸 키 줄로 바꿔 넣는다(다른 키와
   * 같은 모양으로 보게). 8칸보다 얕은 첫 줄(다음 step 앞 6칸 주석·다음 job 앞 2칸 주석)에서 끊는다 — 뒤 단계의 주석이 이 step
   * 검사에 섞이지 않게.
   */
  body: string;
}

/**
 * job 텍스트 → step 목록(선언 순서). step 시작 = 6칸 대시 줄(`      - `) — 이름 있는 step만 보지 않는다(이름 없는 `- run:`
 * 단계가 검사를 빠져나가지 않게).
 */
export function stepsOf(job: string): WorkflowStep[] {
  const lines = job.split("\n");
  const starts = lines.flatMap((line, i) => (/^ {6}- /.test(line) ? [i] : []));
  return starts.map((start, k) => {
    const next = starts[k + 1] ?? lines.length;
    const first = `        ${(lines[start] ?? "").slice(8)}`;
    const rest = lines.slice(start + 1, next);
    const end = rest.findIndex(
      (line) => line.trim() !== "" && !/^ {8}/.test(line),
    );
    const keys = [first, ...(end < 0 ? rest : rest.slice(0, end))];
    const nameAt = keys.findIndex((line) => /^ {8}name: /.test(line));
    return {
      name: nameAt < 0 ? "" : (keys[nameAt] ?? "").replace(/^ {8}name: /, ""),
      body: keys
        .filter((_, i) => i !== nameAt)
        .join("\n")
        .trimEnd(),
    };
  });
}

/** 이름이 prefix로 시작하는 step — 없으면 던진다 */
export function stepNamed(
  steps: readonly WorkflowStep[],
  prefix: string,
): WorkflowStep {
  const found = steps.find((s) => s.name.startsWith(prefix));
  if (!found) throw new Error(`단계 없음: ${prefix}`);
  return found;
}

/** step의 8칸 키 값(`if`·`id`·`continue-on-error` 등) — 없으면 null */
export function stepKey(step: WorkflowStep, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const match = new RegExp(`^ {8}${escaped}: ?(.*)$`, "m").exec(step.body);
  return match ? (match[1] ?? "") : null;
}

/**
 * step의 셸 본문 — `run: |`이면 그 아래 10칸 이상 들여쓴 줄(빈 줄 포함), 한 줄 `run: <명령>`이면 그 명령. run이 없으면 null.
 * step 끝의 빈 줄·다음 step 앞 주석(6칸)은 본문이 아니다.
 */
export function runOf(step: WorkflowStep): string | null {
  const lines = step.body.split("\n");
  const at = lines.findIndex((l) => /^ {8}run:/.test(l));
  if (at < 0) return null;
  const head = lines[at]?.replace(/^ {8}run: ?/, "") ?? "";
  if (head !== "|") return head;
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== "" && !/^ {10}/.test(line)) break;
    out.push(line.slice(10));
  }
  return out.join("\n").trimEnd();
}
