import { describe, expect, it } from "vitest";

import {
  COLLECT_OUTPUT_KEYS,
  collectStepOutputsOf,
  formatCollectOutputs,
  formatCollectSummary,
  writeCollectOutputs,
  type CollectStepOutputs,
} from "../scripts/lib/collect-outputs";

const OUTPUTS: CollectStepOutputs = {
  publishDate: "2026-10-17",
  runId: "collect-prod-20261016T213100Z-ab12",
  status: "partial",
  runRecorded: true,
};

describe("collectStepOutputsOf — 실행 결과 → 단계 출력", () => {
  it("발행일·runId·상태를 그대로, 실행 기록이 있으면 run_recorded true", () => {
    expect(
      collectStepOutputsOf({
        publishDate: "2026-10-17",
        runId: "r1",
        status: "success",
        run: { runId: "r1" },
      }),
    ).toEqual({
      publishDate: "2026-10-17",
      runId: "r1",
      status: "success",
      runRecorded: true,
    });
  });

  it("기록하지 않은 실행(run null — mock·dry·기록 실패)은 run_recorded false", () => {
    expect(
      collectStepOutputsOf({
        publishDate: "2026-10-17",
        runId: "r1",
        status: "failed",
        run: null,
      }).runRecorded,
    ).toBe(false);
  });
});

describe("formatCollectOutputs — $GITHUB_OUTPUT key=value 줄", () => {
  it("키 순서 = COLLECT_OUTPUT_KEYS, 끝 줄바꿈 포함", () => {
    expect(COLLECT_OUTPUT_KEYS).toEqual([
      "publish_date",
      "run_id",
      "status",
      "run_recorded",
    ]);
    expect(formatCollectOutputs(OUTPUTS)).toBe(
      "publish_date=2026-10-17\n" +
        "run_id=collect-prod-20261016T213100Z-ab12\n" +
        "status=partial\n" +
        "run_recorded=true\n",
    );
    expect(formatCollectOutputs({ ...OUTPUTS, runRecorded: false })).toContain(
      "run_recorded=false\n",
    );
  });

  it.each(["today", "2026-1-7", "", "2026-10-17\nrun_id=x", "2026-13-01"])(
    "발행일 %j는 YYYY-MM-DD가 아니라 던진다 — 뒤 단계가 틀린 날짜로 검증하지 않게",
    (publishDate) => {
      expect(() => formatCollectOutputs({ ...OUTPUTS, publishDate })).toThrow(
        /publish_date/,
      );
    },
  );

  it("값에 줄바꿈이 있거나 비면 던진다(출력 주입 — 다른 키 덮어쓰기 방지)", () => {
    expect(() =>
      formatCollectOutputs({
        ...OUTPUTS,
        runId: "r1\npublish_date=2026-01-01",
      }),
    ).toThrow(/run_id/);
    expect(() => formatCollectOutputs({ ...OUTPUTS, runId: "r1\r" })).toThrow(
      /run_id/,
    );
    expect(() => formatCollectOutputs({ ...OUTPUTS, runId: "" })).toThrow(
      /run_id/,
    );
  });
});

describe("formatCollectSummary — Step Summary", () => {
  it("발행일·runId·상태·기록 여부·검증 게이트 명령을 보여 준다", () => {
    const text = formatCollectSummary(OUTPUTS);
    expect(text).toContain("## 수집 결과");
    expect(text).toContain("| 발행일 (KST) | 2026-10-17 |");
    expect(text).toContain("| runId | `collect-prod-20261016T213100Z-ab12` |");
    expect(text).toContain("| 상태 | partial |");
    expect(text).toContain("| 실행 기록 | 기록함 |");
    expect(text).toContain(
      "| 검증 게이트 | `npm run validate -- --publish-date 2026-10-17` |",
    );
    expect(formatCollectSummary({ ...OUTPUTS, runRecorded: false })).toContain(
      "| 실행 기록 | 기록 안 함 |",
    );
  });

  it("표 칸의 | 는 이스케이프한다", () => {
    expect(formatCollectSummary({ ...OUTPUTS, runId: "a|b" })).toContain(
      "`a\\|b`",
    );
  });
});

describe("writeCollectOutputs — 파일 쓰기(주입)", () => {
  function recorder(fail: ReadonlySet<string> = new Set()) {
    const writes: Array<[string, string]> = [];
    return {
      writes,
      append: (file: string, text: string) => {
        if (fail.has(file)) throw new Error(`EACCES: ${file}\n자세한 내용`);
        writes.push([file, text]);
      },
    };
  }

  it("로컬(두 경로 없음)은 아무것도 쓰지 않고 성공", () => {
    const r = recorder();
    expect(
      writeCollectOutputs({
        outputs: OUTPUTS,
        outputFile: null,
        summaryFile: null,
        append: r.append,
      }),
    ).toEqual({
      ok: true,
      wroteOutputs: false,
      error: null,
      summaryError: null,
    });
    expect(r.writes).toEqual([]);
  });

  it("Actions: 단계 출력과 요약을 각 파일에 덧붙인다", () => {
    const r = recorder();
    const result = writeCollectOutputs({
      outputs: OUTPUTS,
      outputFile: "/tmp/out",
      summaryFile: "/tmp/summary",
      append: r.append,
    });
    expect(result).toEqual({
      ok: true,
      wroteOutputs: true,
      error: null,
      summaryError: null,
    });
    expect(r.writes).toEqual([
      ["/tmp/out", formatCollectOutputs(OUTPUTS)],
      ["/tmp/summary", formatCollectSummary(OUTPUTS)],
    ]);
  });

  it("단계 출력 쓰기 실패 → ok false(진입점이 exit 1), 첫 줄만 오류로", () => {
    const r = recorder(new Set(["/tmp/out"]));
    const result = writeCollectOutputs({
      outputs: OUTPUTS,
      outputFile: "/tmp/out",
      summaryFile: "/tmp/summary",
      append: r.append,
    });
    expect(result.ok).toBe(false);
    expect(result.wroteOutputs).toBe(false);
    expect(result.error).toBe("EACCES: /tmp/out");
    // 요약은 그래도 쓴다(사람이 실행 요약에서 발행일을 볼 수 있게)
    expect(r.writes.map(([file]) => file)).toEqual(["/tmp/summary"]);
  });

  it("발행일 형식 오류도 던지지 않고 ok false로 알린다", () => {
    const r = recorder();
    const result = writeCollectOutputs({
      outputs: { ...OUTPUTS, publishDate: "today" },
      outputFile: "/tmp/out",
      summaryFile: null,
      append: r.append,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/publish_date/);
    expect(r.writes).toEqual([]);
  });

  it("요약 쓰기 실패는 ok에 영향이 없다(summaryError로만)", () => {
    const r = recorder(new Set(["/tmp/summary"]));
    const result = writeCollectOutputs({
      outputs: OUTPUTS,
      outputFile: "/tmp/out",
      summaryFile: "/tmp/summary",
      append: r.append,
    });
    expect(result.ok).toBe(true);
    expect(result.wroteOutputs).toBe(true);
    expect(result.summaryError).toBe("EACCES: /tmp/summary");
  });
});
