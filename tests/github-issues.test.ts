import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import {
  IssuePayloadError,
  IssueReportError,
  MAX_BODY_LENGTH,
  SOURCE_FORM_HEADINGS,
  SOURCE_SYMPTOMS,
  buildComment,
  buildIssue,
  clearReportCache,
  defaultIssueKey,
  extractFingerprints,
  findMatchingIssue,
  fingerprintMarker,
  issueFingerprint,
  parseNextLink,
  previewReport,
  reportIssue,
  tryReportIssue,
  type FetchLike,
  type GitHubIssue,
  type IssuePayloadInput,
  type ReportCache,
} from "../scripts/lib/github-issues";
import { createLogger } from "../scripts/lib/logger";

// 가짜 토큰은 실행 중에 조립한다(소스에 토큰 모양 문자열을 두지 않는다).
const TOKEN = `${"gh"}s_${"T0k3nV4lu3".repeat(4)}`;
const REPO = "sguys99/euro-digest";
const API = "https://api.github.com";
const OCCURRED = "2026-10-10T21:41:00.000Z"; // = 2026-10-11 (일) 06:41 KST
const NOW = new Date(OCCURRED);

const pipelinePayload: IssuePayloadInput<"pipeline-failure"> = {
  workflow: "collect",
  failedJobs: ["collect"],
  jobs: [
    { job: "guard", result: "success", note: "forced" },
    { job: "collect", result: "failure" },
    { job: "deploy", result: "skipped" },
  ],
  runUrl: "https://github.com/sguys99/euro-digest/actions/runs/123456",
  runAttempt: 1,
  event: "workflow_dispatch",
  occurredAt: OCCURRED,
};

const FP_COLLECT = issueFingerprint("pipeline-failure", "collect:collect");

// ─── 가짜 GitHub ─────────────────────────────────────────────────────────

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | (() => Response);

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** 응답을 순서대로 돌려주는 가짜 fetch. 모든 요청을 기록한다. */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (input, init = {}) => {
    calls.push({
      method: init.method ?? "GET",
      url: input,
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error(`예상 밖 요청: ${input}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  };
  return { fetch, calls, remaining: () => queue.length };
}

function issue(
  number: number,
  overrides: Partial<GitHubIssue> & { fp?: string | null } = {},
): Record<string, unknown> {
  const { fp = FP_COLLECT, ...rest } = overrides;
  return {
    number,
    html_url: `https://github.com/${REPO}/issues/${number}`,
    state: "open",
    body: fp ? `본문\n\n${fingerprintMarker(fp)}` : "사람이 연 이슈",
    comments: 0,
    labels: [{ name: "pipeline-failure" }],
    ...rest,
  };
}

const created = (number: number) =>
  json(
    { number, html_url: `https://github.com/${REPO}/issues/${number}` },
    201,
  );
const commented = (number: number) =>
  json(
    {
      html_url: `https://github.com/${REPO}/issues/${number}#issuecomment-1`,
    },
    201,
  );

function harness(replies: Reply[]) {
  const fake = fakeFetch(replies);
  const lines: string[] = [];
  const sleeps: number[] = [];
  const cache: ReportCache = new Map();
  const base = {
    repo: REPO,
    token: TOKEN,
    fetch: fake.fetch,
    now: () => NOW,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    logger: createLogger({
      scope: "issues",
      format: "json",
      env: {},
      sink: (line) => lines.push(line),
    }),
    cache,
  };
  return { ...fake, lines, sleeps, cache, base };
}

const LIST_URL = `${API}/repos/${REPO}/issues?state=open&labels=pipeline-failure&sort=created&direction=asc&per_page=100`;

beforeEach(() => {
  clearReportCache();
});

// ─── fingerprint ─────────────────────────────────────────────────────────

describe("issueFingerprint", () => {
  it("같은 kind·key면 항상 같은 12자리 16진수", () => {
    expect(issueFingerprint("pipeline-failure", "collect:collect")).toBe(
      "2b358f177d39",
    );
    expect(issueFingerprint("pipeline-failure", "collect:collect")).toMatch(
      /^[0-9a-f]{12}$/,
    );
  });

  it("key는 앞뒤 공백·대소문자를 무시한다", () => {
    expect(issueFingerprint("pipeline-failure", "  Collect:Collect ")).toBe(
      FP_COLLECT,
    );
  });

  it("kind나 key가 다르면 달라진다", () => {
    const all = new Set([
      issueFingerprint("pipeline-failure", "collect:collect"),
      issueFingerprint("pipeline-failure", "collect:deploy"),
      issueFingerprint("source-broken", "bbc-sport"),
      issueFingerprint("source-health", "bbc-sport"),
      issueFingerprint("source-broken", "guardian-football"),
    ]);
    expect(all.size).toBe(5);
  });

  it("빈 key·줄바꿈 key는 거부한다", () => {
    expect(() => issueFingerprint("source-broken", "  ")).toThrow(
      IssuePayloadError,
    );
    expect(() => issueFingerprint("source-broken", "a\nb")).toThrow(
      IssuePayloadError,
    );
  });

  it("마커를 본문에서 다시 꺼낼 수 있다", () => {
    const body = `a\n${fingerprintMarker("0123456789ab")}\n<!-- euro-digest:fingerprint=zz -->`;
    expect(extractFingerprints(body)).toEqual(["0123456789ab"]);
    expect(extractFingerprints(null)).toEqual([]);
  });
});

describe("defaultIssueKey", () => {
  it("pipeline-failure는 <workflow>:<실패 job>(정렬·+ 연결), 없으면 unknown", () => {
    expect(defaultIssueKey("pipeline-failure", pipelinePayload)).toBe(
      "collect:collect",
    );
    expect(
      defaultIssueKey("pipeline-failure", {
        workflow: "collect",
        failedJobs: ["guard", "deploy"],
      }),
    ).toBe("collect:deploy+guard");
    expect(defaultIssueKey("pipeline-failure", { workflow: "weekly" })).toBe(
      "weekly:unknown",
    );
  });

  it("소스 이슈는 소스 ID, 운영 리포트는 ISO 주", () => {
    expect(
      defaultIssueKey("source-broken", {
        sourceId: "bbc-sport",
        symptoms: ["파싱 실패"],
      }),
    ).toBe("bbc-sport");
    expect(
      defaultIssueKey("source-health", {
        sourceId: "bbc-sport",
        zeroDays: 3,
        runs: [{ startedAt: OCCURRED, ok: true, items: 0 }],
      }),
    ).toBe("bbc-sport");
    expect(defaultIssueKey("ops-report", { week: "2026-W41" })).toBe(
      "2026-W41",
    );
  });
});

// ─── 템플릿 ──────────────────────────────────────────────────────────────

describe("buildIssue — pipeline-failure", () => {
  const built = buildIssue("pipeline-failure", pipelinePayload);

  it("제목·라벨·fingerprint", () => {
    expect(built.title).toBe("[collect] 일일 수집 실패 (collect) — 2026-10-11");
    expect(built.labels).toEqual(["pipeline-failure"]);
    expect(built.key).toBe("collect:collect");
    expect(built.fingerprint).toBe(FP_COLLECT);
  });

  it("본문: 실행 링크·KST 시각·job 표·체크리스트, 끝에 숨김 마커", () => {
    expect(built.body).toContain(
      "| 실행 | [실행 123456 (시도 1)](https://github.com/sguys99/euro-digest/actions/runs/123456) |",
    );
    expect(built.body).toContain(
      "| 시각 (KST) | 2026년 10월 11일 (일) 06:41 KST |",
    );
    expect(built.body).toContain("| guard | success · forced |");
    expect(built.body).toContain("### 다음 조치");
    expect(built.body).toContain("- [ ] 정상 실행 확인 후 이 이슈 닫기");
    expect(built.body.trimEnd().endsWith(fingerprintMarker(FP_COLLECT))).toBe(
      true,
    );
    expect(extractFingerprints(built.body)).toEqual([FP_COLLECT]);
  });

  it("key를 직접 주면 그 key로 fingerprint를 만든다", () => {
    const other = buildIssue("pipeline-failure", pipelinePayload, {
      key: "collect:custom",
    });
    expect(other.fingerprint).toBe(
      issueFingerprint("pipeline-failure", "collect:custom"),
    );
  });

  it("occurredAt이 없으면 now를 쓴다", () => {
    const b = buildIssue(
      "pipeline-failure",
      { ...pipelinePayload, occurredAt: undefined },
      {
        now: new Date("2026-03-01T00:00:00Z"),
      },
    );
    expect(b.title).toContain("— 2026-03-01");
  });
});

describe("buildIssue — source-broken (이슈 폼과 같은 모양)", () => {
  const formYaml = readFileSync(
    fileURLToPath(
      new URL("../.github/ISSUE_TEMPLATE/source-broken.yml", import.meta.url),
    ),
    "utf8",
  );

  it("SOURCE_FORM_HEADINGS·SOURCE_SYMPTOMS·제목 접두사가 이슈 폼과 같다", () => {
    const labels = [...formYaml.matchAll(/^ {6}label: (.+)$/gm)].map(
      (m) => m[1],
    );
    expect(labels).toEqual([...SOURCE_FORM_HEADINGS]);
    const optionsBlock =
      /options:\n((?: {8}- .+\n)+)/.exec(formYaml)?.[1] ?? "";
    const options = [...optionsBlock.matchAll(/- (.+)/g)].map((m) => m[1]);
    expect(options).toEqual([...SOURCE_SYMPTOMS]);
    expect(formYaml).toContain('title: "[소스 고장] "');
  });

  it("헤딩 순서대로 값을 채우고 빈 값은 _No response_", () => {
    const b = buildIssue("source-broken", {
      sourceId: "bbc-sport",
      symptoms: ["피드 URL 오류(4xx·5xx)", "파싱 실패"],
      error: "HTTP 503 Service Unavailable",
      httpStatus: 503,
      occurredAt: OCCURRED,
    });
    expect(b.title).toBe("[소스 고장] bbc-sport — 피드 URL 오류(4xx·5xx)");
    expect(b.labels).toEqual(["source-broken"]);
    const headings = [...b.body.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([...SOURCE_FORM_HEADINGS]);
    expect(b.body).toContain("### 증상\n\n피드 URL 오류(4xx·5xx), 파싱 실패\n");
    expect(b.body).toContain("### 처음 발생 날짜\n\n2026-10-11\n");
    expect(b.body).toContain("### 관련 실행 로그 링크\n\n_No response_\n");
    expect(b.body).toContain("- 오류: `HTTP 503 Service Unavailable`");
    expect(extractFingerprints(b.body)).toEqual([
      issueFingerprint("source-broken", "bbc-sport"),
    ]);
  });
});

describe("buildIssue — source-health (3일 연속 0건)", () => {
  const b = buildIssue("source-health", {
    sourceId: "bbc-sport",
    sourceName: "BBC Sport",
    zeroDays: 3,
    runs: [
      { startedAt: "2026-10-06T21:30:00Z", ok: true, items: 14 },
      { startedAt: "2026-10-07T21:30:00Z", ok: true, items: 0 },
      {
        startedAt: "2026-10-08T21:30:00Z",
        ok: true,
        items: 0,
        runUrl: "https://github.com/sguys99/euro-digest/actions/runs/9",
      },
      { startedAt: "2026-10-09T21:31:00Z", ok: false, items: 0 },
    ],
    occurredAt: OCCURRED,
  });

  it("source-broken + source-health 라벨, 제목에 연속 일수", () => {
    expect(b.labels).toEqual(["source-broken", "source-health"]);
    expect(b.title).toBe("[소스 고장] bbc-sport — 3일 연속 0건");
  });

  it("같은 헤딩 구조 + 메모에 실행별 건수 표, 처음 발생 = 첫 0건 실행의 KST 날짜", () => {
    const headings = [...b.body.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([...SOURCE_FORM_HEADINGS]);
    expect(b.body).toContain("### 증상\n\n0건 수집\n");
    expect(b.body).toContain("### 처음 발생 날짜\n\n2026-10-08\n");
    expect(b.body).toContain("BBC Sport (bbc-sport)에서 **3일 연속 0건**");
    expect(b.body).toContain("| 10월 7일 (수) 06:30 | 성공 | 14 |");
    expect(b.body).toContain(
      "| [10월 9일 (금) 06:30](https://github.com/sguys99/euro-digest/actions/runs/9) | 성공 | 0 |",
    );
    expect(b.body).toContain("| 10월 10일 (토) 06:31 | 실패 | 0 |");
  });
});

describe("buildIssue — ops-report (M5 골격)", () => {
  it("기본 섹션은 자리표시, 넘긴 섹션은 내용으로", () => {
    const b = buildIssue("ops-report", {
      week: "2026-W41",
      from: "2026-10-05",
      to: "2026-10-11",
      sections: [{ heading: "비용", body: "$0.04" }],
      occurredAt: OCCURRED,
    });
    expect(b.title).toBe("[운영 리포트] 2026-W41 (2026-10-05 ~ 2026-10-11)");
    expect(b.labels).toEqual(["ops-report"]);
    expect(b.body).toContain("### 비용\n\n$0.04\n");
    expect(b.body).toContain("### 소스 건강도\n\n_M5(FR-155)에서 채운다_");
  });

  it("본문이 길면 한도 안으로 자르되 마커는 남긴다", () => {
    const b = buildIssue("ops-report", {
      week: "2026-W41",
      sections: Array.from({ length: 5 }, (_, i) => ({
        heading: `섹션 ${i}`,
        body: "가".repeat(19_000),
      })),
      occurredAt: OCCURRED,
    });
    expect(b.body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    expect(extractFingerprints(b.body)).toEqual([b.fingerprint]);
    expect(b.body).toContain("…(본문이 길어 잘렸습니다)");
  });
});

describe("본문 안전 처리", () => {
  it("payload의 비밀값은 가리고, @멘션은 알림이 가지 않게 끊고, 표 칸의 |는 이스케이프한다", () => {
    const b = buildIssue("pipeline-failure", {
      ...pipelinePayload,
      jobs: [{ job: "guard", result: "failure", note: "a|b" }],
      note: `토큰 ${TOKEN} 이 로그에 · @sguys99 확인 바람`,
    });
    expect(b.body).not.toContain(TOKEN);
    expect(b.body).toContain("ghs_****");
    expect(b.body).toContain("@​sguys99");
    expect(b.body).not.toMatch(/@sguys99/);
    expect(b.body).toContain("| guard | failure · a\\|b |");
  });

  it("긴 오류 메시지는 잘린다", () => {
    const b = buildIssue("source-broken", {
      sourceId: "x",
      symptoms: ["파싱 실패"],
      error: "e".repeat(2000),
      occurredAt: OCCURRED,
    });
    expect(b.body).toContain("…(+1700자)");
  });

  it.each([
    [
      "https가 아닌 링크",
      { ...pipelinePayload, runUrl: "javascript:alert(1)" },
    ],
    ["모르는 필드", { ...pipelinePayload, extra: 1 }],
    ["워크플로 이름 형식", { ...pipelinePayload, workflow: "Collect Daily" }],
  ])("payload 오류(%s)는 IssuePayloadError", (_label, payload) => {
    expect(() =>
      buildIssue(
        "pipeline-failure",
        payload as IssuePayloadInput<"pipeline-failure">,
      ),
    ).toThrow(IssuePayloadError);
  });

  it("이슈 폼에 없는 증상은 거부한다", () => {
    expect(() =>
      buildIssue("source-broken", {
        sourceId: "x",
        symptoms: ["모름" as (typeof SOURCE_SYMPTOMS)[number]],
      }),
    ).toThrow(IssuePayloadError);
  });
});

describe("buildComment", () => {
  it("pipeline-failure 재발: KST 시각·누적 횟수·실행 링크·재발 마커", () => {
    const c = buildComment("pipeline-failure", pipelinePayload, {
      occurrence: 3,
    });
    expect(c).toContain(
      "### 다시 실패 — 2026년 10월 11일 (일) 06:41 KST · 3번째",
    );
    expect(c).toContain(
      "- 실행: [실행 123456 (시도 1)](https://github.com/sguys99/euro-digest/actions/runs/123456)",
    );
    expect(c).toContain("- 실패 job: collect");
    expect(c).toContain(`<!-- euro-digest:recurrence=${FP_COLLECT} -->`);
    // 댓글에는 fingerprint 마커를 넣지 않는다(이슈 매칭은 본문만 본다)
    expect(extractFingerprints(c)).toEqual([]);
  });

  it("횟수를 모르면 생략, source-health는 건수 표", () => {
    const c = buildComment("source-health", {
      sourceId: "bbc-sport",
      zeroDays: 4,
      runs: [{ startedAt: OCCURRED, ok: true, items: 0 }],
      occurredAt: OCCURRED,
    });
    expect(c).toContain(
      "### 여전히 0건 — 2026년 10월 11일 (일) 06:41 KST · 4일 연속\n",
    );
    expect(c).toContain("| 10월 11일 (일) 06:41 | 성공 | 0 |");
  });

  it("source-broken 재발: 증상·오류", () => {
    const c = buildComment("source-broken", {
      sourceId: "bbc-sport",
      symptoms: ["파싱 실패"],
      error: "Unexpected close tag",
      runId: "2026-10-11-collect",
      occurredAt: OCCURRED,
    });
    expect(c).toContain("- 증상: 파싱 실패");
    expect(c).toContain("- 오류: `Unexpected close tag`");
    expect(c).toContain("- 실행: runs.json 실행 ID 2026-10-11-collect");
  });
});

// ─── 매칭·페이지 ─────────────────────────────────────────────────────────

describe("findMatchingIssue", () => {
  const parse = (raw: Record<string, unknown>) => raw as unknown as GitHubIssue;
  const match = { fingerprint: FP_COLLECT, label: "pipeline-failure" };

  it("다른 fingerprint·닫힌 이슈·PR·라벨 다름·마커 없음은 무시하고 가장 오래된 것을 고른다", () => {
    const issues = [
      issue(3, { fp: "aaaaaaaaaaaa" }),
      issue(4, { state: "closed" }),
      issue(5, { pull_request: { url: "x" } }),
      issue(6, { labels: [{ name: "source-broken" }] }),
      issue(7, { fp: null }),
      issue(12),
      issue(9),
    ].map(parse);
    expect(findMatchingIssue(issues, match)?.number).toBe(9);
  });

  it("문자열 라벨도 인식하고, 없으면 null", () => {
    expect(
      findMatchingIssue(
        [parse(issue(2, { labels: ["pipeline-failure"] }))],
        match,
      )?.number,
    ).toBe(2);
    expect(
      findMatchingIssue([parse(issue(2, { state: "closed" }))], match),
    ).toBe(null);
  });
});

describe("parseNextLink", () => {
  it("rel=next URL을 꺼내고, 다른 호스트는 따라가지 않는다", () => {
    const next = `${API}/repositories/1/issues?page=2`;
    expect(
      parseNextLink(
        `<${next}>; rel="next", <${API}/x?page=5>; rel="last"`,
        API,
      ),
    ).toBe(next);
    expect(parseNextLink(`<https://evil.example/x>; rel="next"`, API)).toBe(
      null,
    );
    expect(parseNextLink(`<${API}/x?page=1>; rel="prev"`, API)).toBe(null);
    expect(parseNextLink(null, API)).toBe(null);
  });
});

// ─── reportIssue (가짜 fetch) ────────────────────────────────────────────

describe("reportIssue — 생성 vs 댓글", () => {
  it("같은 원인의 열린 이슈가 없으면 새 이슈를 만든다", async () => {
    const h = harness([json([]), created(21)]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result).toEqual({
      action: "created",
      number: 21,
      url: `https://github.com/${REPO}/issues/21`,
      fingerprint: FP_COLLECT,
      key: "collect:collect",
      occurrence: 1,
      deduped: false,
    });
    expect(h.calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", LIST_URL],
      ["POST", `${API}/repos/${REPO}/issues`],
    ]);
    const posted = h.calls[1]?.body as {
      title: string;
      body: string;
      labels: string[];
    };
    expect(posted.labels).toEqual(["pipeline-failure"]);
    expect(posted.title).toBe(
      "[collect] 일일 수집 실패 (collect) — 2026-10-11",
    );
    expect(extractFingerprints(posted.body)).toEqual([FP_COLLECT]);
    expect(h.calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(h.calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
  });

  it("열린 이슈가 있으면 댓글 — 재발 마커 수로 누적 횟수를 센다", async () => {
    const h = harness([
      json([
        issue(3, { fp: "aaaaaaaaaaaa" }),
        issue(5, { pull_request: {} }),
        issue(9, { comments: 3 }),
      ]),
      json([
        {
          body: `### 다시 실패\n<!-- euro-digest:recurrence=${FP_COLLECT} -->`,
        },
        { body: "사람 댓글" },
        { body: "<!-- euro-digest:recurrence=bbbbbbbbbbbb -->" },
      ]),
      commented(9),
    ]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result).toMatchObject({
      action: "commented",
      number: 9,
      url: `https://github.com/${REPO}/issues/9`,
      commentUrl: `https://github.com/${REPO}/issues/9#issuecomment-1`,
      occurrence: 3,
      deduped: false,
    });
    expect(h.calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", LIST_URL],
      ["GET", `${API}/repos/${REPO}/issues/9/comments?per_page=100`],
      ["POST", `${API}/repos/${REPO}/issues/9/comments`],
    ]);
    const body = (h.calls[2]?.body as { body: string }).body;
    expect(body).toContain("· 3번째");
    expect(body).toContain(`<!-- euro-digest:recurrence=${FP_COLLECT} -->`);
  });

  it("댓글이 0개인 이슈는 댓글 목록을 조회하지 않고 2번째로 적는다", async () => {
    const h = harness([json([issue(9)]), commented(9)]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result.occurrence).toBe(2);
    expect(h.calls).toHaveLength(2);
  });

  it("댓글 수 조회가 실패해도 횟수 없이 댓글을 단다", async () => {
    const h = harness([
      json([issue(9, { comments: 5 })]),
      json({ message: "Server Error" }, 500),
      commented(9),
    ]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result.action).toBe("commented");
    expect(result.occurrence).toBeUndefined();
    expect((h.calls[2]?.body as { body: string }).body).not.toContain("번째");
  });

  it("원인(job)이 다르면 같은 라벨의 열린 이슈가 있어도 새 이슈", async () => {
    const h = harness([json([issue(9)]), created(22)]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: { ...pipelinePayload, failedJobs: ["deploy"] },
    });
    expect(result).toMatchObject({ action: "created", key: "collect:deploy" });
  });

  it("source-health는 source-health 라벨로 찾고 두 라벨을 붙여 만든다", async () => {
    const h = harness([json([]), created(30)]);
    await reportIssue({
      ...h.base,
      kind: "source-health",
      payload: {
        sourceId: "bbc-sport",
        zeroDays: 3,
        runs: [{ startedAt: OCCURRED, ok: true, items: 0 }],
      },
    });
    expect(h.calls[0]?.url).toContain("labels=source-health");
    expect((h.calls[1]?.body as { labels: string[] }).labels).toEqual([
      "source-broken",
      "source-health",
    ]);
  });
});

describe("reportIssue — 페이지네이션", () => {
  it("Link rel=next를 따라가 다음 페이지에서 찾는다", async () => {
    const page2 = `${API}/repositories/1/issues?state=open&labels=pipeline-failure&page=2`;
    const filler = Array.from({ length: 100 }, (_, i) =>
      issue(100 + i, { fp: "cccccccccccc" }),
    );
    const h = harness([
      json(filler, 200, {
        link: `<${page2}>; rel="next", <${page2}>; rel="last"`,
      }),
      json([issue(250)]),
      commented(250),
    ]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result).toMatchObject({ action: "commented", number: 250 });
    expect(h.calls.map((c) => c.url).slice(0, 2)).toEqual([LIST_URL, page2]);
  });

  it("첫 페이지에서 찾으면 다음 페이지를 보지 않는다", async () => {
    const h = harness([
      json([issue(9)], 200, { link: `<${API}/x?page=2>; rel="next"` }),
      commented(9),
    ]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(h.calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("다른 호스트를 가리키는 next는 따라가지 않는다(토큰 유출 방지)", async () => {
    const h = harness([
      json([], 200, {
        link: `<https://evil.example/issues?page=2>; rel="next"`,
      }),
      created(23),
    ]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(h.calls.some((c) => c.url.includes("evil.example"))).toBe(false);
  });
});

describe("reportIssue — 재시도·실패", () => {
  it("5xx는 검색부터 다시 시도한다", async () => {
    const h = harness([
      json({ message: "Bad Gateway" }, 502),
      json([]),
      created(24),
    ]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result.number).toBe(24);
    expect(h.sleeps).toEqual([1000]);
  });

  it("네트워크 오류도 재시도한다", async () => {
    const h = harness([new TypeError("fetch failed"), json([]), created(25)]);
    await expect(
      reportIssue({
        ...h.base,
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ).resolves.toMatchObject({ number: 25 });
    expect(h.sleeps).toEqual([1000]);
  });

  it("429는 retry-after만큼(상한 안에서) 기다린다", async () => {
    const h = harness([
      json({ message: "rate limited" }, 429, { "retry-after": "3" }),
      json([]),
      created(26),
    ]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(h.sleeps).toEqual([3000]);
  });

  it("생성 요청이 5xx로 끝났는데 실제로는 만들어졌으면 다시 검색해서 댓글로 바꾼다(중복 이슈 방지)", async () => {
    const h = harness([
      json([]),
      json({ message: "Bad Gateway" }, 502),
      json([issue(27)]),
      commented(27),
    ]);
    const result = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(result).toMatchObject({ action: "commented", number: 27 });
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(h.calls[3]?.url).toBe(`${API}/repos/${REPO}/issues/27/comments`);
  });

  it("권한 오류(403)는 재시도하지 않고 IssueReportError — GitHub의 짧은 message만 담는다", async () => {
    const h = harness([
      json(
        {
          message: "Resource not accessible by integration",
          documentation_url: "https://docs.github.com/rest",
        },
        403,
      ),
    ]);
    const error = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IssueReportError);
    expect(error).toMatchObject({
      reason: "api",
      status: 403,
      retryable: false,
      attempts: 1,
      fingerprint: FP_COLLECT,
    });
    expect((error as Error).message).toContain(
      "Resource not accessible by integration",
    );
    expect((error as Error).message).not.toContain("documentation_url");
    expect(h.sleeps).toEqual([]);
  });

  it("403이라도 2차 한도(retry-after)는 재시도한다", async () => {
    const h = harness([
      json({ message: "secondary rate limit" }, 403, { "retry-after": "1" }),
      json([]),
      created(28),
    ]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(h.sleeps).toEqual([1000]);
  });

  it("재시도(2회)를 다 쓰면 IssueReportError — 백오프 1s·2s", async () => {
    const h = harness([json({}, 500), json({}, 500), json({}, 503)]);
    const error = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      name: "IssueReportError",
      retryable: true,
      attempts: 3,
      status: 503,
    });
    expect(h.sleeps).toEqual([1000, 2000]);
    expect(h.remaining()).toBe(0);
  });

  it("토큰이 없거나 저장소 형식이 틀리면 요청 없이 config 오류", async () => {
    const h = harness([]);
    await expect(
      reportIssue({
        ...h.base,
        token: "",
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ).rejects.toMatchObject({ name: "IssueReportError", reason: "config" });
    await expect(
      reportIssue({
        ...h.base,
        repo: "not a repo",
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ).rejects.toMatchObject({ reason: "config" });
    expect(h.calls).toHaveLength(0);
  });

  it("payload 오류는 요청 없이 payload 오류", async () => {
    const h = harness([]);
    await expect(
      reportIssue({
        ...h.base,
        kind: "source-broken",
        payload: { sourceId: "x", symptoms: [] },
      }),
    ).rejects.toMatchObject({ name: "IssueReportError", reason: "payload" });
    expect(h.calls).toHaveLength(0);
  });

  it("tryReportIssue는 던지지 않고 { ok: false, error }", async () => {
    const h = harness([json({ message: "Not Found" }, 404)]);
    const r = await tryReportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(IssueReportError);
  });
});

describe("reportIssue — 토큰·응답 본문이 남지 않는다", () => {
  it("로그·오류 메시지·보낸 본문 어디에도 토큰이 없다", async () => {
    const h = harness([
      json({ message: `bad credentials for ${TOKEN}` }, 500),
      new TypeError(`connect failed ${TOKEN}`),
      json([]),
      created(40),
    ]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: {
        ...pipelinePayload,
        note: `stderr: Authorization: Bearer ${TOKEN}`,
      },
    });
    const posted = JSON.stringify(h.calls.map((c) => c.body));
    expect(posted).not.toContain(TOKEN);
    expect(h.lines.join("\n")).not.toContain(TOKEN);
    expect(h.lines.length).toBeGreaterThan(0);

    const failing = harness([json({ message: `oops ${TOKEN}` }, 422)]);
    const error = await reportIssue({
      ...failing.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IssueReportError);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain("ghs_****");
    expect(failing.lines.join("\n")).not.toContain(TOKEN);
  });

  it("로그 이벤트는 issues.<동작> 이름과 건수·번호만 남긴다", async () => {
    const h = harness([json([]), created(41)]);
    await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    const records = h.lines.map(
      (l) => JSON.parse(l) as Record<string, unknown>,
    );
    expect(records.map((r) => r.event)).toEqual([
      "issues.search",
      "issues.create",
    ]);
    expect(records[1]).toMatchObject({ kind: "pipeline-failure", number: 41 });
    expect(h.lines.join("\n")).not.toContain("### 다음 조치");
  });
});

describe("reportIssue — 같은 실행 안 중복 방지", () => {
  it("같은 fingerprint의 두 번째 호출은 요청 없이 첫 결과(deduped)", async () => {
    const h = harness([json([]), created(50)]);
    const first = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    const second = await reportIssue({
      ...h.base,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(first.deduped).toBe(false);
    expect(second).toMatchObject({
      action: "created",
      number: 50,
      deduped: true,
    });
    expect(h.calls).toHaveLength(2);
  });

  it("동시에 들어온 같은 원인도 한 번만 보고한다", async () => {
    const h = harness([json([]), created(51)]);
    const [a, b] = await Promise.all([
      reportIssue({
        ...h.base,
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
      reportIssue({
        ...h.base,
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ]);
    expect([a.number, b.number]).toEqual([51, 51]);
    expect([a.deduped, b.deduped].sort()).toEqual([false, true]);
    expect(h.calls).toHaveLength(2);
  });

  it("실패한 원인은 캐시에서 빠져 다시 시도할 수 있다", async () => {
    const cache: ReportCache = new Map();
    const bad = harness([json({ message: "Forbidden" }, 403)]);
    await expect(
      reportIssue({
        ...bad.base,
        cache,
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ).rejects.toBeInstanceOf(IssueReportError);
    const good = harness([json([]), created(52)]);
    await expect(
      reportIssue({
        ...good.base,
        cache,
        kind: "pipeline-failure",
        payload: pipelinePayload,
      }),
    ).resolves.toMatchObject({ number: 52, deduped: false });
  });

  it("기본(모듈 전역) 캐시도 동작하고 clearReportCache로 비운다", async () => {
    const h = harness([
      json([]),
      created(53),
      json([issue(53)]),
      commented(53),
    ]);
    // cache를 비워 두면 모듈 전역 캐시를 쓴다
    const noCache = { ...h.base, cache: undefined };
    await reportIssue({
      ...noCache,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    const again = await reportIssue({
      ...noCache,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(again.deduped).toBe(true);
    clearReportCache();
    const third = await reportIssue({
      ...noCache,
      kind: "pipeline-failure",
      payload: pipelinePayload,
    });
    expect(third).toMatchObject({ action: "commented", deduped: false });
  });
});

// ─── dry-run ─────────────────────────────────────────────────────────────

describe("previewReport (dry-run)", () => {
  it("repo가 없으면 요청 없이 새 이슈 모양만", async () => {
    const fake = fakeFetch([]);
    const p = await previewReport({
      kind: "pipeline-failure",
      payload: pipelinePayload,
      fetch: fake.fetch,
      now: () => NOW,
    });
    expect(p).toMatchObject({ action: "would-create", lookup: "skipped" });
    expect(fake.calls).toHaveLength(0);
  });

  it("열린 이슈가 없으면 would-create — GET만, 토큰 없으면 Authorization도 없음", async () => {
    const fake = fakeFetch([json([])]);
    const p = await previewReport({
      kind: "pipeline-failure",
      payload: pipelinePayload,
      repo: REPO,
      fetch: fake.fetch,
      now: () => NOW,
    });
    expect(p).toMatchObject({ action: "would-create", lookup: "searched" });
    expect(fake.calls.map((c) => c.method)).toEqual(["GET"]);
    expect(fake.calls[0]?.headers.authorization).toBeUndefined();
  });

  it("열린 이슈가 있으면 would-comment — 생성·댓글 요청은 보내지 않는다", async () => {
    const fake = fakeFetch([
      json([issue(9, { comments: 1 })]),
      json([{ body: `<!-- euro-digest:recurrence=${FP_COLLECT} -->` }]),
    ]);
    const p = await previewReport({
      kind: "pipeline-failure",
      payload: pipelinePayload,
      repo: REPO,
      token: TOKEN,
      fetch: fake.fetch,
      now: () => NOW,
    });
    expect(p).toMatchObject({ action: "would-comment", number: 9 });
    if (p.action === "would-comment") expect(p.comment).toContain("· 3번째");
    expect(fake.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("검색 실패는 재시도 없이 IssueReportError", async () => {
    const fake = fakeFetch([json({}, 502)]);
    await expect(
      previewReport({
        kind: "pipeline-failure",
        payload: pipelinePayload,
        repo: REPO,
        fetch: fake.fetch,
      }),
    ).rejects.toMatchObject({ name: "IssueReportError", status: 502 });
    expect(fake.calls).toHaveLength(1);
  });
});
