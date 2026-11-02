// @vitest-environment happy-dom
/**
 * M4-10 — 가져오기 확인 띠 자리 부트(src/lib/my-import-boot.ts)가 `planFollowImport`(src/lib/follow-share.ts)와 같은 판단을 하는지
 * (자리를 여는 것 = 계획이 `confirm`, 미리보기 줄 수 · 안내 줄 수).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FOLLOW_STORAGE_KEY, parseFollows } from "@/lib/follow";
import { knownFromDirectory, planFollowImport } from "@/lib/follow-share";
import {
  MY_IMPORT_BOOT_SCRIPT,
  MY_IMPORT_PREVIEW_COLUMNS,
} from "@/lib/my-import-boot";
import {
  MY_DIRECTORY_ID,
  MY_IMPORT_ATTR,
  type MyDirectory,
} from "@/lib/my-view";

const DIR: MyDirectory = {
  teams: Object.fromEntries(
    [
      "arsenal",
      "chelsea",
      "liverpool",
      "barcelona",
      "milan",
      "napoli",
      "bayern-munchen",
    ].map((slug) => [slug, { n: slug, s: "X", u: "" }]),
  ),
  players: Object.fromEntries(
    ["kim-min-jae", "lee-kang-in"].map((slug) => [slug, { n: slug, t: "" }]),
  ),
};

function run(search: string, stored: string | null) {
  window.localStorage.clear();
  if (stored !== null) window.localStorage.setItem(FOLLOW_STORAGE_KEY, stored);
  window.history.replaceState(null, "", `/my/${search}`);
  const html = document.documentElement;
  html.removeAttribute(MY_IMPORT_ATTR);
  html.removeAttribute("style");
  new Function(MY_IMPORT_BOOT_SCRIPT)();
  return {
    open: html.hasAttribute(MY_IMPORT_ATTR),
    rows: MY_IMPORT_PREVIEW_COLUMNS.map((c) =>
      html.style.getPropertyValue(`--mi-r${c}`),
    ),
    notes: html.style.getPropertyValue("--mi-n"),
  };
}

beforeEach(() => {
  const script = document.createElement("script");
  script.id = MY_DIRECTORY_ID;
  script.type = "application/json";
  script.textContent = JSON.stringify(DIR);
  document.head.appendChild(script);
});

afterEach(() => {
  document.getElementById(MY_DIRECTORY_ID)?.remove();
  window.history.replaceState(null, "", "/");
});

const CASES: Array<[string, string, string | null]> = [
  ["쿼리 없음", "", null],
  ["다른 쿼리만", "?x=1", null],
  ["빈 값", "?t=&p=", null],
  ["모르는 항목뿐", "?t=ghost,Not_Slug", null],
  ["새 팀 하나", "?t=arsenal", null],
  [
    "대문자 · 공백 · 중복 · 모르는 항목",
    "?t=Arsenal,%20chelsea,,arsenal,ghost&p=KIM-MIN-JAE",
    null,
  ],
  [
    "같은 팔로우",
    "?t=chelsea,arsenal&p=kim-min-jae",
    '{"v":1,"teams":["arsenal","chelsea"],"players":["kim-min-jae"]}',
  ],
  [
    "같은 팔로우 + 모르는 항목",
    "?t=chelsea,arsenal,ghost&p=kim-min-jae",
    '{"v":1,"teams":["arsenal","chelsea"],"players":["kim-min-jae"]}',
  ],
  [
    "부분 집합",
    "?t=arsenal",
    '{"v":1,"teams":["arsenal","chelsea"],"players":[]}',
  ],
  [
    "한도 초과(같은 앞 5개)",
    "?t=arsenal,chelsea,liverpool,barcelona,milan,napoli",
    '{"v":1,"teams":["arsenal","chelsea","liverpool","barcelona","milan"],"players":[]}',
  ],
  [
    "팀만 같고 선수 없음",
    "?t=arsenal",
    '{"v":1,"teams":["arsenal"],"players":["kim-min-jae"]}',
  ],
  ["깨진 저장값", "?t=arsenal", "{not json"],
  ["여러 번 온 이름", "?t=arsenal&t=chelsea&p=lee-kang-in", null],
];

describe("my-import 부트 = planFollowImport", () => {
  for (const [name, search, stored] of CASES) {
    it(name, () => {
      const result = run(search, stored);
      const plan = planFollowImport(
        search,
        parseFollows(stored),
        knownFromDirectory(DIR),
      );
      expect(result.open).toBe(plan?.kind === "confirm");
      if (plan?.kind !== "confirm") return;
      const n = plan.incoming.teams.length + plan.incoming.players.length;
      expect(result.rows).toEqual(
        MY_IMPORT_PREVIEW_COLUMNS.map((c) => String(Math.ceil(n / c))),
      );
      expect(result.notes).toBe(String(plan.unknown > 0 ? 1 : 0));
    });
  }

  it("저장소 차단이면 안내 줄 하나 더", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      window.history.replaceState(null, "", "/my/?t=arsenal,ghost");
      document.documentElement.removeAttribute("style");
      new Function(MY_IMPORT_BOOT_SCRIPT)();
      expect(document.documentElement.hasAttribute(MY_IMPORT_ATTR)).toBe(true);
      expect(document.documentElement.style.getPropertyValue("--mi-n")).toBe(
        "2",
      );
    } finally {
      Object.defineProperty(window, "localStorage", original);
      document.documentElement.removeAttribute(MY_IMPORT_ATTR);
    }
  });

  it("디렉터리가 없으면 아무것도 하지 않는다(던지지 않음)", () => {
    document.getElementById(MY_DIRECTORY_ID)?.remove();
    expect(run("?t=arsenal", null).open).toBe(false);
  });
});
