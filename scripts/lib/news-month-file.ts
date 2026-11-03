/**
 * 월별 병합 뉴스 파일 `data/news/YYYY-MM.json` 읽기·쓰기 + data/news 폴더 목록 (PRD FR-158, plan M5-10) — scripts용 fs 함수.
 * 화면·빌드 쪽 로더는 src/lib/data/news.ts(동기, 삭제 요청 제외)이고, 이 파일은 파이프라인(병합·원본 삭제·이적 집계)이 쓴다.
 *
 * - 형식은 `NewsMonthFileSchema`(src/lib/schema/news.ts) — 읽을 때 스키마와 파일명(= month)을 검사하고, 쓸 때 검증 → 임시 파일 → rename.
 * - `readAllNewsIssues`: 일별 + 월별 파일의 호 전부(날짜 오름차순). 하나라도 깨졌거나 같은 날짜가 양쪽에 있으면 던진다 —
 *   보존 기간 전체가 근거인 집계(이적 트래커)가 일부 호를 조용히 빠뜨리지 않게.
 */
import { randomBytes } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import path from "node:path";

import {
  NewsMonthFileSchema,
  type NewsFile,
  type NewsMonthFile,
} from "@/lib/schema";

import { NewsFileError, newsFilePath, readNewsFile } from "./news-file";

const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const MONTH_FILE_RE = /^(\d{4}-\d{2})\.json$/;

/** `<dataDir>/news/<YYYY-MM>.json` (파일명 = KST 달) */
export function newsMonthFilePath(dataDir: string, month: string): string {
  return path.join(dataDir, "news", `${month}.json`);
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

/** data/news 폴더의 일별 날짜·월별 달(각각 오름차순). 폴더가 없으면 둘 다 [] */
export async function listNewsDir(
  dataDir: string,
): Promise<{ daily: string[]; months: string[] }> {
  let names: string[];
  try {
    const entries = await fsPromises.readdir(path.join(dataDir, "news"), {
      withFileTypes: true,
    });
    names = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (error) {
    if (isNotFound(error)) return { daily: [], months: [] };
    throw error;
  }
  const pick = (re: RegExp) =>
    names
      .map((n) => re.exec(n)?.[1])
      .filter((v): v is string => v !== undefined)
      .sort();
  return { daily: pick(DAILY_FILE_RE), months: pick(MONTH_FILE_RE) };
}

/** 월별 파일을 읽어 검증한다(스키마 + month = 파일명). 없으면 null, 깨졌으면 NewsFileError */
export async function readNewsMonthFile(
  filePath: string,
): Promise<NewsMonthFile | null> {
  let text: string;
  try {
    text = await fsPromises.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const name = path.basename(filePath);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new NewsFileError(`${name}: JSON 파싱 실패 — 덮어쓰지 않는다`);
  }
  const parsed = NewsMonthFileSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new NewsFileError(
      `${name}: 스키마 검증 실패(${first ? `${first.path.join(".")}: ${first.message}` : "?"}) — 덮어쓰지 않는다`,
    );
  }
  const expected = path.basename(filePath, ".json");
  if (parsed.data.month !== expected) {
    throw new NewsFileError(
      `${name}: month(${parsed.data.month})가 파일명과 다름 — 덮어쓰지 않는다`,
    );
  }
  return parsed.data;
}

/** 직렬화 — 2칸 들여쓰기 + 끝 개행(일별 파일과 같은 형식) */
export function serializeNewsMonthFile(file: NewsMonthFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 검증 → 임시 파일 → rename(원자적) */
export async function writeNewsMonthFile(
  filePath: string,
  file: NewsMonthFile,
): Promise<void> {
  const data = serializeNewsMonthFile(NewsMonthFileSchema.parse(file));
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsPromises.writeFile(tmp, data, "utf8");
    await fsPromises.rename(tmp, filePath);
  } catch (error) {
    await fsPromises.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 호 하나와 그 위치 */
export interface StoredIssue {
  date: string;
  file: NewsFile;
  /** daily = `YYYY-MM-DD.json` · month = `YYYY-MM.json` 안 */
  origin: "daily" | "month";
}

/**
 * 일별 + 월별 파일의 호 전부(날짜 오름차순). 깨진 파일 · 일별 파일의 date ≠ 파일명 · 같은 날짜가 양쪽에 있음 → 던진다. 폴더가 없으면 []
 */
export async function readAllNewsIssues(
  dataDir: string,
): Promise<StoredIssue[]> {
  const { daily, months } = await listNewsDir(dataDir);
  const out = new Map<string, StoredIssue>();
  for (const date of daily) {
    const file = await readNewsFile(newsFilePath(dataDir, date));
    if (file === null) continue;
    if (file.date !== date) {
      throw new Error(
        `data/news/${date}.json: date(${file.date})가 파일명과 다름`,
      );
    }
    out.set(date, { date, file, origin: "daily" });
  }
  for (const month of months) {
    const monthFile = await readNewsMonthFile(
      newsMonthFilePath(dataDir, month),
    );
    if (monthFile === null) continue;
    for (const issue of monthFile.issues) {
      if (out.has(issue.date)) {
        throw new Error(
          `data/news/${month}.json: 호 ${issue.date}가 일별 파일에도 있음 — 월별 병합 중간 상태(FR-158)`,
        );
      }
      out.set(issue.date, { date: issue.date, file: issue, origin: "month" });
    }
  }
  return [...out.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
