/**
 * `data/cache/unknown-names.json` — 사전(configs/names.ko.json)에 없는 고유명사 누적 (M1-21 — PRD FR-24, 부록 A 12).
 * 주간 이슈(M1-29 `/add-name`·운영 리포트)가 빈도순으로 읽고, 사람이 확인한 표기만 사전에 넣는다(CLAUDE.md §11 `/add-name`).
 *
 * ── 무엇을 적재하나 (names.ts) ─────────────────────────────────────────────
 *   데이터 API 이름 = 브리핑 입력의 팀(경기·순위표)·득점자·도움 중 미등록(`unknownBriefInputNames` — kind team·player 추정) +
 *   브리핑 출력 이름 = LLM 출력을 치환한 뒤에도 남은 이름 후보(`unknownNamesInText` — kind는 입력 이름과 같으면 그 유형, 아니면 없음).
 *   키는 영문 표기 그대로(같은 대상의 다른 표기는 다른 키 — `/add-name`이 묶는다). 데이터 API·브리핑 이름이라 예시 카드는 없다(`cards: []`,
 *   뉴스 태그에서 온 이름이 생기면 그때 카드 id를 담는다 — M1-17).
 *
 * ── 누적 (`mergeUnknownNames`, 순수) ────────────────────────────────────────
 *   **실행 1번에 이름당 1회**(count += 1 — 같은 실행에서 입력·출력에 여러 번 나와도 1), lastSeen = 실행 시각, kind는 처음 알게 된 값을
 *   유지(없던 값만 채움). 사전에 등록됐거나 무시 목록(`ignore`)·대회 별칭에 오른 이름은 뺀다("다음 수집이 제거" — 부록 A 12).
 *   키는 코드 포인트 순으로 정렬해 저장한다(diff 최소화). 이름이 하나도 없고 파일도 없으면 만들지 않는다. 내용(updatedAt 제외)이
 *   같으면 다시 쓰지 않는다.
 *
 * ── 쓰기 시점 (collect-run.ts) ──────────────────────────────────────────────
 *   **prod·비dry 실행**이고 뉴스 단계가 성공했을 때만(커밋되는 실행 — 이월 목록 af-pending과 같은 기준). dev·dry는 후보를 로그로만
 *   남긴다(개발 실행이 횟수를 부풀리지 않게). 기존 파일이 깨져 있으면 경고하고 새 파일로 고친다(검증 게이트가 깨진 캐시의 커밋을
 *   막으므로 드묾 — 캐시라 누적 횟수를 잃는 것보다 발행을 막지 않는 쪽). 쓰기 실패는 실행을 멈추지 않는다(다음 실행이 다시 모은다).
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  UnknownNamesFileSchema,
  type NameKind,
  type UnknownName,
  type UnknownNamesFile,
} from "@/lib/schema";

export const UNKNOWN_NAMES_REL_PATH = path.join("cache", "unknown-names.json");

export function unknownNamesPath(dataDir: string): string {
  return path.join(dataDir, UNKNOWN_NAMES_REL_PATH);
}

/** 이번 실행에서 본 미등록 이름 1개 */
export interface UnknownNameObservation {
  name: string;
  kind?: NameKind;
}

export interface UnknownNamesMerge {
  /** 새 파일 — 이름이 없고 기존 파일도 없으면 null(만들지 않음) */
  file: UnknownNamesFile | null;
  /** 처음 본 이름 */
  added: string[];
  /** 횟수를 올린 이름 */
  seenAgain: string[];
  /** 사전·무시 목록에 올라 뺀 이름 */
  pruned: string[];
  /** updatedAt 밖의 내용이 바뀌었나(쓸지 판단) */
  changed: boolean;
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 누적(머리 주석) — `now`는 실행 시각(UTC ISO), `isKnown`은 사전·무시 목록 판정(names.ts `isKnownName`) */
export function mergeUnknownNames(
  existing: Pick<UnknownNamesFile, "updatedAt" | "names"> | null,
  observed: readonly UnknownNameObservation[],
  options: { now: string; isKnown: (name: string) => boolean },
): UnknownNamesMerge {
  const { now, isKnown } = options;
  const names = new Map<string, UnknownName>();
  const pruned: string[] = [];
  for (const [name, value] of Object.entries(existing?.names ?? {})) {
    if (isKnown(name)) pruned.push(name);
    else names.set(name, value);
  }
  const added: string[] = [];
  const seenAgain: string[] = [];
  const thisRun = new Set<string>();
  for (const { name: raw, kind } of observed) {
    const name = raw.normalize("NFC").trim();
    if (name === "" || thisRun.has(name) || isKnown(name)) continue;
    thisRun.add(name);
    const prev = names.get(name);
    if (prev) {
      names.set(name, {
        count: prev.count + 1,
        firstSeen: prev.firstSeen,
        lastSeen: now,
        ...(prev.kind !== undefined
          ? { kind: prev.kind }
          : kind !== undefined
            ? { kind }
            : {}),
        cards: [...prev.cards],
      });
      seenAgain.push(name);
    } else {
      names.set(name, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        ...(kind !== undefined ? { kind } : {}),
        cards: [],
      });
      added.push(name);
    }
  }
  if (names.size === 0 && existing === null) {
    return { file: null, added, seenAgain, pruned, changed: false };
  }
  const sorted = Object.fromEntries(
    [...names.entries()].sort(([a], [b]) => byCodePoint(a, b)),
  );
  const changed =
    existing === null ||
    JSON.stringify(sortedNames(existing.names)) !== JSON.stringify(sorted);
  return {
    file: {
      updatedAt: changed || existing === null ? now : existing.updatedAt,
      names: sorted,
    },
    added,
    seenAgain,
    pruned,
    changed,
  };
}

function sortedNames(
  names: Record<string, UnknownName>,
): Record<string, UnknownName> {
  return Object.fromEntries(
    Object.entries(names).sort(([a], [b]) => byCodePoint(a, b)),
  );
}

export function serializeUnknownNames(file: UnknownNamesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ─── 파일 I/O ────────────────────────────────────────────────────────────

export interface UnknownNamesRead {
  value: UnknownNamesFile | null;
  exists: boolean;
  /** 읽기·형식 오류 — 있으면 빈 상태로 진행하고 다음 쓰기가 새 파일로 고친다 */
  error: string | null;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

/** unknown-names.json 읽기 — 던지지 않는다 */
export async function readUnknownNames(
  dataDir: string,
): Promise<UnknownNamesRead> {
  let text: string;
  try {
    text = await readFile(unknownNamesPath(dataDir), "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return { value: null, exists: false, error: null };
    return {
      value: null,
      exists: false,
      error: `읽기 실패: ${errorText(error)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { value: null, exists: true, error: "JSON 파싱 실패" };
  }
  const parsed = UnknownNamesFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      value: null,
      exists: true,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { value: parsed.data, exists: true, error: null };
}

/** 검증 → 임시 파일 → rename. 쓴 경로를 돌려준다 */
export async function writeUnknownNames(
  dataDir: string,
  file: UnknownNamesFile,
): Promise<string> {
  const target = unknownNamesPath(dataDir);
  const data = serializeUnknownNames(UnknownNamesFileSchema.parse(file));
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}
