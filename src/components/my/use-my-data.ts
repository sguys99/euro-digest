/**
 * `/my` 자료 — 디렉터리 읽기 · 팀·선수 자료 파일 지연 fetch (PRD FR-111, plan M4-08, 형식 src/lib/my-view.ts)
 *
 * 클라이언트 섬 전용(훅). 컴포넌트가 아니라 `"use client"`를 달지 않는다 — `/my` 섬에서만 import한다.
 * - 디렉터리: 페이지에 실린 `<script type="application/json" id="my-directory">`(서버가 쓴다)를 문서마다 한 번 읽는다.
 * - 자료 파일: 팔로우한 팀·선수만 `withBasePath(artifacts.myData(…))`로 받는다. 같은 주소는 한 번만 요청하고(모듈 캐시 — 섬 여럿 · 다시 그리기),
 *   실패한 주소는 캐시에서 빼서 "다시 시도"가 새로 요청한다. 형식이 다른 응답은 '자료 없음'(null)으로 본다(빌드에서 빠진 팀 — 404 포함).
 */
import { useEffect, useMemo, useState } from "react";

import { FOLLOW_KINDS, type FollowKind, type FollowState } from "@/lib/follow";
import {
  directoryName,
  MY_DIRECTORY_ID,
  parseEntityData,
  type MyDirectory,
  type MyEntityData,
  type MyEntityInput,
} from "@/lib/my-view";
import { artifacts, withBasePath } from "@/lib/paths";

const EMPTY_DIRECTORY: MyDirectory = { teams: {}, players: {} };
const directoryCache = new WeakMap<Document, MyDirectory>();

/** 페이지의 디렉터리(없거나 깨졌으면 빈 디렉터리) */
export function readMyDirectory(doc: Document = document): MyDirectory {
  const hit = directoryCache.get(doc);
  if (hit) return hit;
  let dir = EMPTY_DIRECTORY;
  try {
    const raw: unknown = JSON.parse(
      doc.getElementById(MY_DIRECTORY_ID)?.textContent ?? "null",
    );
    if (
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as MyDirectory).teams === "object" &&
      typeof (raw as MyDirectory).players === "object"
    ) {
      dir = raw as MyDirectory;
    }
  } catch {
    dir = EMPTY_DIRECTORY;
  }
  directoryCache.set(doc, dir);
  return dir;
}

/**
 * 디렉터리 — 하이드레이션 뒤(`ready`)에만 페이지 JSON을 읽는다. 서버 렌더 · 하이드레이션 첫 렌더는 빈 값(서버 HTML과 같게 — 팔로우도 그때는 빈 상태)
 */
export function directoryWhenReady(ready: boolean): MyDirectory {
  return ready ? readMyDirectory() : EMPTY_DIRECTORY;
}

/** 자료 하나의 결과 — 받음 · 자료 없음(404 · 형식 다름) · 실패(네트워크) */
type Fetched =
  { kind: "ok"; data: MyEntityData } | { kind: "missing" } | { kind: "error" };

const fetchCache = new Map<string, Promise<Fetched>>();

function fetchEntity(kind: FollowKind, slug: string): Promise<Fetched> {
  const url = withBasePath(artifacts.myData(kind, slug));
  const hit = fetchCache.get(url);
  if (hit) return hit;
  const request = fetch(url)
    .then(async (res): Promise<Fetched> => {
      if (res.status === 404) return { kind: "missing" };
      if (!res.ok) return { kind: "error" };
      const data = parseEntityData((await res.json()) as unknown, kind, slug);
      return data ? { kind: "ok", data } : { kind: "missing" };
    })
    .catch((): Fetched => ({ kind: "error" }));
  fetchCache.set(url, request);
  // 실패는 캐시하지 않는다 — 다시 시도가 새로 요청
  void request.then((r) => {
    if (r.kind === "error") fetchCache.delete(url);
  });
  return request;
}

/** 테스트용 — 요청 캐시를 비운다 */
export function resetMyDataCache(): void {
  fetchCache.clear();
}

export interface MyDataState {
  /** 팔로우한 것 모두의 요청이 끝났는지 */
  settled: boolean;
  /** 팔로우 순서(팀 → 선수) 항목 + 받은 자료(없으면 null) */
  entries: MyEntityInput[];
  /** 요청이 실패한 항목 수(네트워크) */
  failed: number;
  /** 실패한 것을 다시 요청 */
  retry(): void;
}

/** 팔로우한 팀·선수의 자료를 받는다. `ready` 전에는 요청하지 않는다(서버 스냅숏은 빈 팔로우) */
export function useMyData(
  follows: FollowState,
  ready: boolean,
  dir: MyDirectory,
): MyDataState {
  const [results, setResults] = useState<ReadonlyMap<string, Fetched>>(
    () => new Map(),
  );
  const [attempt, setAttempt] = useState(0);
  const wanted = useMemo(
    () =>
      FOLLOW_KINDS.flatMap((kind) =>
        follows[kind].map((slug) => ({ kind, slug, id: `${kind}:${slug}` })),
      ),
    [follows],
  );

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    for (const w of wanted) {
      void fetchEntity(w.kind, w.slug).then((r) => {
        if (!alive) return;
        setResults((prev) => {
          if (prev.get(w.id) === r) return prev;
          const next = new Map(prev);
          next.set(w.id, r);
          return next;
        });
      });
    }
    return () => {
      alive = false;
    };
  }, [wanted, ready, attempt]);

  return useMemo(() => {
    const entries: MyEntityInput[] = wanted.map((w) => {
      const r = results.get(w.id);
      const name = directoryName(dir, w.kind, w.slug) ?? w.slug;
      return {
        kind: w.kind,
        slug: w.slug,
        name,
        data: r?.kind === "ok" ? r.data : null,
      };
    });
    const failed = wanted.filter(
      (w) => results.get(w.id)?.kind === "error",
    ).length;
    return {
      settled: ready && wanted.every((w) => results.has(w.id)),
      entries,
      failed,
      retry: () => {
        setResults((prev) => {
          const next = new Map(prev);
          for (const [id, r] of prev) if (r.kind === "error") next.delete(id);
          return next;
        });
        setAttempt((n) => n + 1);
      },
    };
  }, [wanted, results, ready, dir]);
}
