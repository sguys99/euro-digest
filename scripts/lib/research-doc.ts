/**
 * 도구가 쓰는 조사 문서(`docs/research/*.md`)의 공용 편집 헬퍼 — 순수 함수 (M1-F 관찰 도구: observe·probe:gdelt·quality:sample).
 *
 * 문서는 사람이 읽고 메모를 덧붙이는 마크다운이고, 도구는 아래 두 가지만 고친다(그 밖의 글은 그대로 둔다 — 멱등).
 *   1. **표식 블록** `<!-- <key>:start -->` … `<!-- <key>:end -->` — 블록 안을 통째로 다시 쓴다(`replaceBlock`).
 *   2. **데이터 블록** `<!-- <name> … -->` 여러 줄 주석 — 한 줄 = `<키> <JSON 한 줄>`. 도구가 다시 읽는 기록이다(`readDataLines`·
 *      `upsertDataLine`). 화면(마크다운 렌더)에는 보이지 않는다. JSON 문자열 안의 `--`는 `--`로 바꿔 주석이 끊기지 않게 한다.
 * 표의 사람 칸(메모·판정)은 다시 그릴 때 같은 키 행의 값을 옮겨 준다(`tableCellsByKey` → 렌더러가 채움).
 * 도구의 출력 경로는 `docs/research/` 아래 `.md`만 받는다(`resolveResearchDocPath` — data/·configs 등 다른 곳을 덮어쓰지 않게, CLAUDE.md §8).
 */
import path from "node:path";

/** 조사 문서 폴더(저장소 루트 기준) */
export const RESEARCH_DOC_DIR = "docs/research";

/**
 * 출력 문서 경로(`--doc`·`--out`) → 절대 경로. `<root>/docs/research/` 아래의 `.md` 파일만 허용한다(`..`·절대 경로로 밖을 가리키면 거부).
 */
export function resolveResearchDocPath(
  rootDir: string,
  raw: string,
): { ok: true; path: string } | { ok: false; error: string } {
  const dir = path.resolve(rootDir, RESEARCH_DOC_DIR);
  const target = path.resolve(rootDir, raw);
  const rel = path.relative(dir, target);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      ok: false,
      error: `출력 문서는 ${RESEARCH_DOC_DIR}/ 아래여야 한다 (받은 값: "${raw}")`,
    };
  }
  if (!target.endsWith(".md")) {
    return {
      ok: false,
      error: `출력 문서는 .md 파일이어야 한다 (받은 값: "${raw}")`,
    };
  }
  return { ok: true, path: target };
}

/** 표식 블록 시작·끝 줄 */
export function blockMarkers(key: string): { start: string; end: string } {
  return { start: `<!-- ${key}:start -->`, end: `<!-- ${key}:end -->` };
}

/** 표식 블록 안의 내용(앞뒤 줄바꿈 제외) — 블록이 없으면 null */
export function readBlock(doc: string, key: string): string | null {
  const { start, end } = blockMarkers(key);
  const i = doc.indexOf(start);
  if (i < 0) return null;
  const j = doc.indexOf(end, i + start.length);
  if (j < 0) return null;
  return doc
    .slice(i + start.length, j)
    .replace(/^\n/, "")
    .replace(/\n$/, "");
}

/**
 * 표식 블록 안을 `body`로 바꾼다. 블록이 없으면 `anchor` 줄(정확히 일치하는 줄) 바로 뒤에, anchor도 없으면 문서 끝에 블록을 새로 붙인다.
 */
export function replaceBlock(
  doc: string,
  key: string,
  body: string,
  anchor?: string,
): string {
  const { start, end } = blockMarkers(key);
  const block = `${start}\n${body.replace(/\n+$/, "")}\n${end}`;
  const i = doc.indexOf(start);
  const j = i < 0 ? -1 : doc.indexOf(end, i + start.length);
  if (i >= 0 && j >= 0) {
    return doc.slice(0, i) + block + doc.slice(j + end.length);
  }
  if (anchor !== undefined) {
    const lines = doc.split("\n");
    const at = lines.indexOf(anchor);
    if (at >= 0) {
      lines.splice(at + 1, 0, "", block);
      return lines.join("\n");
    }
  }
  return `${doc.replace(/\n*$/, "")}\n\n${block}\n`;
}

// ─── 데이터 블록 ─────────────────────────────────────────────────────────

const DATA_KEY_RE = /^[0-9A-Za-z][0-9A-Za-z:._-]*$/;

/** JSON 한 줄을 주석 안에 넣을 수 있게 — `--`(주석 끝 `-->`의 앞부분)를 JSON 이스케이프로 바꾼다(문자열 밖에는 `--`가 없다) */
export function encodeDataJson(value: unknown): string {
  return JSON.stringify(value).replace(/--/g, "-\\u002d");
}

function dataBlockRange(
  lines: readonly string[],
  name: string,
): { start: number; end: number } | null {
  const start = lines.findIndex(
    (l) => l === `<!-- ${name}` || l.startsWith(`<!-- ${name} `),
  );
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "-->") return { start, end: i };
  }
  return null;
}

export type DataLine =
  { key: string; json: unknown } | { key: string; error: string };

/** 데이터 블록의 줄 → `{ key, json }`(JSON 파싱 실패 줄은 `error`) — 블록이 없으면 빈 배열. 검증(zod)은 호출부가 한다 */
export function readDataLines(doc: string, name: string): DataLine[] {
  const lines = doc.split("\n");
  const range = dataBlockRange(lines, name);
  if (!range) return [];
  const out: DataLine[] = [];
  for (const line of lines.slice(range.start + 1, range.end)) {
    const space = line.indexOf(" ");
    if (space <= 0) continue;
    const key = line.slice(0, space);
    if (!DATA_KEY_RE.test(key)) continue;
    try {
      out.push({ key, json: JSON.parse(line.slice(space + 1)) as unknown });
    } catch {
      out.push({ key, error: "JSON 파싱 실패" });
    }
  }
  return out;
}

/**
 * 데이터 블록에 `<key> <JSON>` 줄을 넣는다(같은 키는 교체, 키 순 정렬). 블록이 없으면 문서 끝에 `header` 설명과 함께 만든다.
 */
export function upsertDataLine(
  doc: string,
  name: string,
  header: string,
  key: string,
  value: unknown,
): string {
  if (!DATA_KEY_RE.test(key)) throw new Error(`데이터 키 형식 오류: ${key}`);
  const line = `${key} ${encodeDataJson(value)}`;
  const lines = doc.split("\n");
  const range = dataBlockRange(lines, name);
  if (!range) {
    return `${doc.replace(/\n*$/, "")}\n\n<!-- ${name} ${header}\n${line}\n-->\n`;
  }
  const body = lines
    .slice(range.start + 1, range.end)
    .filter((l) => l.trim() !== "" && !l.startsWith(`${key} `));
  body.push(line);
  body.sort((a, b) => {
    const ka = a.split(" ", 1)[0] ?? "";
    const kb = b.split(" ", 1)[0] ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return [
    ...lines.slice(0, range.start + 1),
    ...body,
    ...lines.slice(range.end),
  ].join("\n");
}

// ─── 표 ──────────────────────────────────────────────────────────────────

/** 표 칸 안의 글자 — `|`·줄바꿈을 표가 깨지지 않게 바꾼다. 빈 값은 "—" */
export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/(?<!\\)\|/g, "\\|")
    .trim();
}

/** 표 한 줄 → 칸(앞뒤 공백 제거, `\|`는 칸 구분이 아님) — 표 줄이 아니면 null */
export function splitTableRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) return null;
  const cells: string[] = [];
  let current = "";
  for (let i = 1; i < t.length - 1; i += 1) {
    const ch = t[i]!;
    if (ch === "\\" && t[i + 1] === "|") {
      current += "\\|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * 블록 안 표에서 첫 칸(키) → 지정한 열 이름들의 값. 머리 줄로 열 위치를 찾으므로 열 순서가 바뀌어도 옮길 수 있다.
 * 빈 칸·"—"은 옮기지 않는다(없음과 같다).
 */
export function tableCellsByKey(
  blockBody: string | null,
  columns: readonly string[],
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  if (!blockBody) return out;
  const rows = blockBody
    .split("\n")
    .map(splitTableRow)
    .filter((r): r is string[] => r !== null);
  const header = rows[0];
  if (!header) return out;
  const index = new Map(columns.map((c) => [c, header.indexOf(c)] as const));
  for (const row of rows.slice(1)) {
    if (row.every((c) => /^:?-{3,}:?$/.test(c))) continue; // 구분 줄
    const key = row[0];
    if (!key) continue;
    const values: Record<string, string> = {};
    for (const [column, i] of index) {
      const v = i >= 0 ? row[i] : undefined;
      if (v !== undefined && v !== "" && v !== "—") values[column] = v;
    }
    out.set(key, values);
  }
  return out;
}

/** 머리 + 구분 줄 + 행 → 마크다운 표 */
export function renderTable(
  header: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): string {
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
