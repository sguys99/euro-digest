/**
 * 조사 문서 편집 헬퍼 `scripts/lib/research-doc.ts` 단위 테스트 (M1-F 관찰 도구 공용).
 * 표식 블록 교체(밖의 글 보존)·데이터 블록 왕복(주석이 끊기지 않게 `--` 이스케이프)·표 칸 분리(`\|`)·키별 사람 칸 옮기기.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  cell,
  encodeDataJson,
  readBlock,
  readDataLines,
  renderTable,
  replaceBlock,
  resolveResearchDocPath,
  splitTableRow,
  tableCellsByKey,
  upsertDataLine,
} from "../scripts/lib/research-doc";

const DOC = [
  "# 제목",
  "",
  "사람이 쓴 글",
  "",
  "<!-- x:start -->",
  "옛 내용",
  "<!-- x:end -->",
  "",
  "뒤의 글",
  "",
].join("\n");

describe("표식 블록", () => {
  it("블록 안만 바꾸고 밖의 글은 그대로 — 두 번 해도 같다(멱등)", () => {
    const once = replaceBlock(DOC, "x", "새 내용\n둘째 줄");
    expect(readBlock(once, "x")).toBe("새 내용\n둘째 줄");
    expect(once).toContain("사람이 쓴 글");
    expect(once).toContain("뒤의 글");
    expect(replaceBlock(once, "x", "새 내용\n둘째 줄")).toBe(once);
  });

  it("블록이 없으면 anchor 줄 뒤에, anchor도 없으면 끝에 만든다", () => {
    const withAnchor = replaceBlock(DOC, "y", "Y", "사람이 쓴 글");
    expect(withAnchor.indexOf("<!-- y:start -->")).toBeLessThan(
      withAnchor.indexOf("<!-- x:start -->"),
    );
    const atEnd = replaceBlock(DOC, "z", "Z");
    expect(atEnd.trimEnd().endsWith("<!-- z:end -->")).toBe(true);
    expect(readBlock(DOC, "없음")).toBeNull();
  });
});

describe("데이터 블록", () => {
  it("키별 한 줄 — 교체·정렬·왕복, JSON 안의 `-->`가 주석을 끊지 않는다", () => {
    let doc = upsertDataLine(DOC, "d-data", "설명", "2026-10-20", { a: 1 });
    doc = upsertDataLine(doc, "d-data", "설명", "2026-10-18", {
      note: "끝 표시 --> 들어 있음",
    });
    doc = upsertDataLine(doc, "d-data", "설명", "2026-10-20", { a: 2 });
    const lines = readDataLines(doc, "d-data");
    expect(lines).toEqual([
      { key: "2026-10-18", json: { note: "끝 표시 --> 들어 있음" } },
      { key: "2026-10-20", json: { a: 2 } },
    ]);
    // 주석은 한 번만 열리고 닫힌다
    const block = doc.slice(doc.indexOf("<!-- d-data"));
    expect(block.match(/-->/g)).toHaveLength(1);
    expect(encodeDataJson({ s: "a--b" })).toBe('{"s":"a-\\u002db"}');
  });

  it("JSON이 깨진 줄은 error로, 키 형식이 아닌 줄은 건너뛴다", () => {
    const doc = "<!-- d-data 설명\n2026-10-18 {깨짐\n# 메모 줄\n-->\n";
    expect(readDataLines(doc, "d-data")).toEqual([
      { key: "2026-10-18", error: "JSON 파싱 실패" },
    ]);
    expect(readDataLines(DOC, "d-data")).toEqual([]);
    expect(() => upsertDataLine(DOC, "d", "h", "나쁜 키", {})).toThrow();
  });
});

describe("표", () => {
  it("칸 이스케이프·분리 — `\\|`는 칸 구분이 아니다, 빈 값은 —", () => {
    expect(cell("a|b\nc")).toBe("a\\|b c");
    expect(cell("이미 \\| 이스케이프")).toBe("이미 \\| 이스케이프");
    expect(cell(null)).toBe("—");
    expect(splitTableRow("| a | b\\|c | |")).toEqual(["a", "b\\|c", ""]);
    expect(splitTableRow("표 아님")).toBeNull();
  });

  it("키별 사람 칸 — 머리 줄로 열을 찾고 빈 칸·—는 옮기지 않는다", () => {
    const table = renderTable(
      ["키", "값", "메모"],
      [
        ["k1", "1", "적은 메모"],
        ["k2", "2", "—"],
      ],
    );
    const cells = tableCellsByKey(table, ["메모", "없는 열"]);
    expect(cells.get("k1")).toEqual({ 메모: "적은 메모" });
    expect(cells.get("k2")).toEqual({});
    expect(tableCellsByKey(null, ["메모"]).size).toBe(0);
  });
});

describe("resolveResearchDocPath — 출력은 docs/research/ 아래 .md만(CLAUDE.md §8 data/ 보호)", () => {
  const root = path.resolve("/repo");
  it("허용: 기본·하위 폴더", () => {
    expect(
      resolveResearchDocPath(root, "docs/research/m1-observation.md"),
    ).toEqual({
      ok: true,
      path: path.join(root, "docs/research/m1-observation.md"),
    });
    expect(resolveResearchDocPath(root, "docs/research/trial/x.md").ok).toBe(
      true,
    );
  });

  it("거부: data/·configs·상위 경로·절대 경로·폴더 자체·.md 아님", () => {
    for (const raw of [
      "data/runs.json",
      "data/x.md",
      "configs/sources.json",
      "docs/plan.md",
      "docs/research/../plan.md",
      "/tmp/x.md",
      "docs/research",
      "docs/research/x.json",
    ]) {
      expect([raw, resolveResearchDocPath(root, raw).ok]).toEqual([raw, false]);
    }
  });
});
