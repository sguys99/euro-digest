/**
 * `/privacy/` 개인정보 처리방침 (M5-05 — PRD FR-141 · NFR-08 · §15 D7 · D75)
 *
 * - 머리 · 절 6개 앵커 · 차례 · 메타(canonical · 쪽 이름형 OG) · 연락처(CONTACT_EMAIL) · 시행일 · 통계 끄기 링크
 * - **저장 항목 표 = 코드의 실제 저장 키**: src/ 전체의 `ed-` 키 문자열을 훑어 `STORAGE_ITEMS`와 대조한다 — 새 키가 생기면 실패
 *   (사람이 읽는 이름 · 저장 내용 · 지우는 법을 더해야 통과). 쿠키 · sessionStorage · IndexedDB는 쓰지 않는다.
 * - 오프라인 저장(서비스 워커 캐시 종류 · 상한)과 GoatCounter 스크립트 판이 문구의 근거와 같은지.
 * 폭별 넘침 · 앵커 · 링크 · axe · sitemap · OG는 tests/e2e/privacy.spec.ts · a11y.spec.ts · seo.spec.ts · og.spec.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RUNTIME_PAGE_LIMIT } from "../scripts/lib/service-worker";
import PrivacyPage, { metadata } from "@/app/privacy/page";
import { GOATCOUNTER } from "@/lib/goatcounter";
import { withBasePath } from "@/lib/paths";
import {
  GOATCOUNTER_SKIP_KEY,
  OFFLINE_DATA_LIMIT,
  OFFLINE_RUNTIME_PAGE_LIMIT,
  PRIVACY_CHANGES,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
  privacyHref,
  STORAGE_ITEMS,
} from "@/lib/privacy";
import { STORAGE_PREFIX } from "@/lib/safe-storage";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  SW_DATA_LIMIT,
  SW_SKIP_WAITING_MESSAGE,
  swCacheNames,
} from "@/lib/sw/policy";

const { loadLatestNews, loadProdRuns } = vi.hoisted(() => ({
  loadLatestNews: vi.fn<() => NewsFile | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
}));
vi.mock("@/lib/data/news", () => ({ loadLatestNews }));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));

const fixture = NewsFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/news/2026-10-10.json"),
      "utf8",
    ),
  ),
);

beforeEach(() => {
  loadLatestNews.mockReset();
  loadLatestNews.mockReturnValue(fixture);
});

function section(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
}

describe("PrivacyPage — 머리 · 절 · 차례 · 메타", () => {
  it("제목 '개인정보 처리방침' · canonical = og:url = 이 페이지 · 쪽 이름형 OG", () => {
    expect(metadata.title).toBe("개인정보 처리방침");
    expect(metadata.description).toContain("GoatCounter");
    const url = "https://sguys99.github.io/euro-digest/privacy/";
    expect(metadata.alternates?.canonical).toBe(url);
    expect(metadata.openGraph).toMatchObject({
      url,
      title: "개인정보 처리방침 · 유로 다이제스트",
    });
    const images = (metadata.openGraph as { images?: { url: string }[] })
      .images;
    expect(images?.[0]?.url).toBe(
      "https://sguys99.github.io/euro-digest/og/pages/privacy.png",
    );
    expect(metadata.robots).toBeUndefined();
  });

  it("h1 하나 · 절 6개(PRIVACY_SECTIONS 순서 · 앵커 · h2) · 차례 2개(목차 열 + 1023 이하)", () => {
    render(<PrivacyPage />);
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["개인정보 처리방침"]);
    // 1023 이하 차례가 2열 × 3행(grid-rows-3)이라 절은 6개
    expect(PRIVACY_SECTIONS).toHaveLength(6);
    const ids = [...document.querySelectorAll("main section[id]")].map(
      (el) => el.id,
    );
    expect(ids).toEqual(PRIVACY_SECTIONS.map((s) => s.id));
    for (const s of PRIVACY_SECTIONS) {
      const el = section(s.id);
      const h2 = within(el).getAllByRole("heading", { level: 2 })[0];
      expect(h2).toHaveTextContent(s.title);
      expect(el).toHaveAttribute("aria-labelledby", h2?.id);
    }
    const tocs = screen.getAllByRole("navigation", {
      name: "개인정보 처리방침 차례",
    });
    expect(tocs).toHaveLength(2);
    for (const toc of tocs) {
      expect(
        within(toc)
          .getAllByRole("link")
          .map((a) => a.getAttribute("href")),
      ).toEqual(PRIVACY_SECTIONS.map((s) => `#${s.id}`));
    }
    expect(privacyHref("storage")).toBe("/privacy/#storage");
  });

  it("시행일 · 변경 이력 · 연락처(CONTACT_EMAIL mailto — 하드코딩 아님)", () => {
    render(<PrivacyPage />);
    expect(
      document.querySelectorAll(`time[datetime="${PRIVACY_EFFECTIVE_DATE}"]`)
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(PRIVACY_CHANGES[0]?.date).toBe(PRIVACY_EFFECTIVE_DATE);
    const changes = section("changes");
    expect(
      within(changes).getByRole("link", { name: CONTACT_EMAIL }),
    ).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    for (const change of PRIVACY_CHANGES)
      expect(changes).toHaveTextContent(change.note);
  });
});

describe("방문 통계(#analytics) · 모으지 않는 것", () => {
  it("보내는 것 · 보내지 않는 것 · 8시간 · EU 서버 · 운영자만 · 통계 끄기 링크(문서 이동 — basePath + #toggle-goatcounter)", () => {
    render(<PrivacyPage />);
    const el = section("analytics");
    for (const text of [
      "쿼리(?…)와 해시(#…)는 떼고",
      "호스트 이름만",
      "8시간",
      "핀란드·독일",
      "운영자만",
      "광고 차단기",
    ])
      expect(el).toHaveTextContent(text);
    const toggle = within(el).getByRole("link", {
      name: "방문 통계 끄기·켜기",
    });
    expect(toggle).toHaveAttribute(
      "href",
      `${withBasePath("/")}#toggle-goatcounter`,
    );
    expect(section("not-collected")).toHaveTextContent(
      "쿠키를 하나도 쓰지 않습니다",
    );
  });

  it("문구 근거 — GoatCounter 스크립트는 SRI로 고정한 count.v5.js(판이 바뀌면 skipgc · 보내는 값을 다시 확인)", () => {
    expect(GOATCOUNTER.script).toBe("https://gc.zgo.at/count.v5.js");
    expect(GOATCOUNTER_SKIP_KEY).toBe("skipgc");
  });
});

// ─── 저장 항목 표 = 코드의 실제 저장 키 ─────────────────────────────────────

const SRC = path.resolve("src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).map((file) => ({
  file: path.relative(SRC, file),
  text: readFileSync(file, "utf8"),
}));

describe("저장 항목 표(#storage) — 코드의 저장 키와 일치", () => {
  it("src/의 `ed-` 키 문자열 = 이 사이트 저장 항목 키(접두 · 서비스 워커 메시지 제외) — 새 키가 생기면 표에 더한다", () => {
    const literals = new Set<string>();
    for (const { text } of FILES)
      for (const m of text.matchAll(/["'](ed-[a-z0-9-]*)["']/g))
        literals.add(m[1] as string);
    // 저장 키가 아닌 것: 접두 자체(STORAGE_PREFIX · SW_CACHE_PREFIX), 서비스 워커에 보내는 메시지
    literals.delete(STORAGE_PREFIX);
    literals.delete(SW_SKIP_WAITING_MESSAGE);
    const siteKeys = STORAGE_ITEMS.filter((i) => i.owner === "site").map(
      (i) => i.key,
    );
    expect([...literals].sort()).toEqual([...siteKeys].sort());
  });

  it("localStorage에 직접 닿는 파일은 알려진 곳뿐 — 새 파일이 생기면 저장 항목을 확인한다", () => {
    const touching = FILES.filter(
      ({ file, text }) =>
        !file.startsWith("app/privacy/") &&
        file !== "lib/privacy.ts" &&
        /\blocalStorage\b/.test(text.replace(/^\s*(\*|\/\/).*$/gm, "")),
    ).map((f) => f.file);
    expect(touching.sort()).toEqual(
      [
        // 초기 인라인 스크립트(첫 페인트 전 — 테마 · 결과 가리기 · 팔로우 · 온보딩 · 저장 가능 확인)
        "lib/theme.ts",
        "lib/follow-boot.ts",
        "lib/onboarding-boot.ts",
        "lib/my-import-boot.ts",
        // 테마 토글 섬(theme.ts 함수에 저장소를 넘긴다) · 안전한 저장소(나머지 모든 섬)
        "components/theme-toggle.tsx",
        "lib/safe-storage.ts",
      ].sort(),
    );
  });

  it("쿠키 · sessionStorage · IndexedDB는 쓰지 않는다", () => {
    for (const { file, text } of FILES) {
      if (file === "lib/privacy.ts" || file.startsWith("app/privacy/"))
        continue;
      expect(text, file).not.toMatch(
        /document\.cookie|cookieStore|sessionStorage|indexedDB/,
      );
    }
  });

  it("표는 키 이름이 아니라 사람이 읽는 이름 · 저장 내용 · 지우는 법(화면에 `ed-` · skipgc 없음)", () => {
    render(<PrivacyPage />);
    const el = section("storage");
    for (const item of STORAGE_ITEMS) {
      expect(item.name.length, item.key).toBeGreaterThan(0);
      expect(item.stores.length, item.key).toBeGreaterThan(0);
      expect(item.clear.length, item.key).toBeGreaterThan(0);
      expect(
        within(el).getByText(item.name, { selector: "dt" }),
      ).toBeInTheDocument();
      expect(el).toHaveTextContent(item.clear);
    }
    expect(el.textContent).not.toMatch(/\bed-|skipgc/);
    // 이 사이트 항목과 GoatCounter 항목을 나눠 이름 붙인 묶음
    expect(
      within(el).getByRole("group", { name: "이 사이트가 저장하는 항목" }),
    ).toBeInTheDocument();
    expect(
      within(el).getByRole("group", { name: "GoatCounter가 저장하는 항목" }),
    ).toBeInTheDocument();
  });

  it("오프라인 저장 — 서비스 워커 캐시 4종(페이지 · 열어 본 페이지 · 정적 · 마이 팀 자료)과 상한이 문구와 같다", () => {
    expect(Object.keys(swCacheNames("v")).sort()).toEqual(
      ["data", "pages", "runtime", "static"].sort(),
    );
    expect(OFFLINE_RUNTIME_PAGE_LIMIT).toBe(RUNTIME_PAGE_LIMIT);
    expect(OFFLINE_DATA_LIMIT).toBe(SW_DATA_LIMIT);
    render(<PrivacyPage />);
    const el = section("storage");
    expect(el).toHaveTextContent(`최근 ${RUNTIME_PAGE_LIMIT}쪽까지`);
    expect(el).toHaveTextContent(`${SW_DATA_LIMIT}개까지`);
  });
});
