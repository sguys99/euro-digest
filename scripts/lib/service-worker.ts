/**
 * 서비스 워커 생성 — 순수 함수 (PRD FR-121, plan M4-13). 파일 읽기·쓰기는 scripts/build-sw.ts.
 *
 * - `planPrecache`: 프리캐시 목록 + 용량 상한. 앱 셸(홈·`/news/`·`/offline/`)과 정적 자산은 늘 싣고, 최근 3일 호 날짜 페이지는 최신부터
 *   상한 안에서만 싣는다(넘치면 오래된 호부터 뺀다 — 빌드를 멈추지 않는다: 빌드가 실패하면 그날 발행이 멈춘다, CLAUDE §6.1).
 * - `swVersion`: 캐시 버전 = 프리캐시 파일(경로 + 내용 해시)과 워커 코드의 해시 12자리. 산출물이 같으면 같은 값 → sw.js 바이트가 같아
 *   브라우저가 업데이트로 보지 않는다(새 소식 토스트 없음). Next 빌드 ID가 HTML에 들어가므로 빌드마다 사실상 새 버전이다.
 * - `renderServiceWorker`: `SW_CONFIG` + 정책(src/lib/sw/policy.ts) + 본체(src/lib/sw/runtime.ts)를 JS로 옮겨 classic 스크립트 하나로.
 *   TypeScript → JS는 `typescript`(이미 개발 의존성 — next build도 쓴다)의 `transpileModule`로, 새 의존성 없음.
 */
import { createHash } from "node:crypto";
import { Script } from "node:vm";

import ts from "typescript";

import type { SwConfig } from "@/lib/sw/policy";

/** 프리캐시 용량 상한(원본 바이트 — Cache Storage는 압축을 푼 본문을 저장한다). 홈 HTML 하나가 약 1MB다 */
export const PRECACHE_BUDGET_BYTES = 12 * 1024 * 1024;

/** 런타임 페이지 캐시 상한(개) — 그 밖에 열어 본 페이지(팀·선수·지난 호 등) */
export const RUNTIME_PAGE_LIMIT = 12;

export interface PrecacheFile {
  /** basePath 포함 href(`/euro-digest/news/2026-10-24/`) */
  href: string;
  /** 원본 바이트 */
  bytes: number;
  /** 내용 sha256(16진) */
  hash: string;
}

export interface PrecacheInput {
  /** 앱 셸 페이지 — 늘 싣는다 */
  shell: PrecacheFile[];
  /** 최근 호 날짜 페이지 — 최신순 */
  news: PrecacheFile[];
  /** 정적 자산 — 늘 싣는다 */
  assets: PrecacheFile[];
  budgetBytes?: number;
}

export interface PrecachePlan {
  pages: PrecacheFile[];
  assets: PrecacheFile[];
  /** 상한 때문에 뺀 호 페이지 */
  dropped: PrecacheFile[];
  bytes: number;
}

const sum = (files: readonly PrecacheFile[]): number =>
  files.reduce((total, f) => total + f.bytes, 0);

export function planPrecache({
  shell,
  news,
  assets,
  budgetBytes = PRECACHE_BUDGET_BYTES,
}: PrecacheInput): PrecachePlan {
  let bytes = sum(shell) + sum(assets);
  const kept: PrecacheFile[] = [];
  const dropped: PrecacheFile[] = [];
  for (const page of news) {
    if (dropped.length === 0 && bytes + page.bytes <= budgetBytes) {
      kept.push(page);
      bytes += page.bytes;
    } else {
      dropped.push(page);
    }
  }
  return { pages: [...shell, ...kept], assets, dropped, bytes };
}

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** 캐시 버전 — 순서와 무관(경로로 정렬) */
export function swVersion(
  files: readonly PrecacheFile[],
  code: string,
): string {
  const lines = files.map((f) => `${f.href}\0${f.hash}`).sort();
  return sha256([...lines, code].join("\n")).slice(0, 12);
}

/** TypeScript 모듈 → classic 스크립트 조각: `export` 떼기 · `./policy` import 줄 지우기. 남은 import·export가 있으면 던진다 */
export function toScriptFragment(source: string, fileName: string): string {
  const { outputText } = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
    },
  });
  const js = outputText
    .replace(/^import\s[\s\S]*?\sfrom\s+["']\.\/policy["'];?\s*$/gm, "")
    .replace(
      /^export\s+(?=(?:const|let|function|async\s+function|class)\s)/gm,
      "",
    )
    .replace(/^export\s*\{\s*\};?\s*$/gm, "");
  if (/^\s*(?:import|export)\b/m.test(js)) {
    throw new Error(
      `${fileName}: 서비스 워커에 옮길 수 없는 import·export가 남음`,
    );
  }
  return js.trim();
}

/** out/sw.js 본문. 문법 오류면 던진다(node:vm으로 파싱만) */
export function renderServiceWorker(
  config: SwConfig,
  policySource: string,
  runtimeSource: string,
): string {
  const body = [
    "/* 유로 다이제스트 서비스 워커 (FR-121) — scripts/build-sw.ts가 빌드 때 만든 파일. 원본: src/lib/sw/policy.ts · runtime.ts */",
    '"use strict";',
    "(() => {",
    `const SW_CONFIG = ${JSON.stringify(config)};`,
    toScriptFragment(policySource, "policy.ts"),
    toScriptFragment(runtimeSource, "runtime.ts"),
    "})();",
    "",
  ].join("\n");
  new Script(body, { filename: "sw.js" });
  return body;
}
