/**
 * M2-16 — 데이터 출처 줄 규칙(src/lib/data-source.ts)과 공용 컴포넌트(src/components/data-source.tsx) (PRD FR-45 · D27)
 *   - 갱신 시각 = 화면이 읽은 파일 중 가장 오래된 `updatedAt`(형식이 달라도 시각으로 비교) · 없으면 null
 *   - "업데이트 지연" = 빌드 시각보다 36시간 이상(경계 포함)
 *   - 문구: "데이터 football-data.org — {무엇} {MM.DD HH:MM} KST 갱신 [· 업데이트 지연] [· {무엇} API-Football] · 필수 영문 문구(lang=en)"
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSourceNote } from "@/components/data-source";
import {
  DATA_STALE_HOURS,
  dataSourceOf,
  isDataStale,
  oldestUpdatedAt,
} from "@/lib/data-source";
import { FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";

const ms = (iso: string) => Date.parse(iso);

describe("oldestUpdatedAt — 여러 파일 중 가장 오래된 갱신 시각", () => {
  it("시각으로 비교한다(밀리초 표기 유무와 무관), null·undefined는 건너뛴다", () => {
    expect(
      oldestUpdatedAt([
        "2026-10-30T22:14:05.120Z",
        null,
        "2026-10-30T22:11:59Z",
        undefined,
        "2026-10-30T22:12:00.000Z",
      ]),
    ).toBe("2026-10-30T22:11:59Z");
  });

  it("값이 없으면 null", () => {
    expect(oldestUpdatedAt([])).toBeNull();
    expect(oldestUpdatedAt([null, undefined])).toBeNull();
  });
});

describe(`isDataStale — 빌드 시각보다 ${DATA_STALE_HOURS}시간 이상이면 지연`, () => {
  const at = "2026-10-30T02:17:27.762Z";
  it("하루 1회 정상 갱신(약 24시간)은 지연 아님, 36시간 경계부터 지연", () => {
    expect(isDataStale(at, ms("2026-10-31T02:17:27.762Z"))).toBe(false);
    expect(isDataStale(at, ms("2026-10-31T14:17:27.761Z"))).toBe(false);
    expect(isDataStale(at, ms("2026-10-31T14:17:27.762Z"))).toBe(true);
    // 한 번 거른 날(약 48시간)
    expect(isDataStale(at, ms("2026-11-01T02:17:27.762Z"))).toBe(true);
  });
});

describe("dataSourceOf — 화면 하나의 출처 줄 값", () => {
  it("가장 오래된 파일이 지연이면 화면 전체가 지연(다른 파일이 새로워도)", () => {
    const now = ms("2026-11-01T00:00:00Z");
    expect(
      dataSourceOf(["2026-10-31T22:10:00Z", "2026-10-30T11:59:00Z"], now),
    ).toEqual({ updatedAt: "2026-10-30T11:59:00Z", stale: true });
    expect(dataSourceOf(["2026-10-31T22:10:00Z"], now)).toEqual({
      updatedAt: "2026-10-31T22:10:00Z",
      stale: false,
    });
  });

  it("읽은 파일이 없으면 시각 없음 · 지연 아님", () => {
    expect(dataSourceOf([], ms("2026-11-01T00:00:00Z"))).toEqual({
      updatedAt: null,
      stale: false,
    });
  });
});

describe("DataSourceNote — 출처 줄 문구", () => {
  it("football-data만 쓰는 화면 — 갱신 시각 KST(<time datetime>), 필수 영문 문구 lang=en, API-Football 없음", () => {
    const { container } = render(
      <DataSourceNote
        source={{ updatedAt: "2026-10-30T22:11:59Z", stale: false }}
        covers="순위·경기·득점"
        scope="competition"
      />,
    );
    const note = container.querySelector(
      "[data-slot=data-source][data-scope=competition]",
    )!;
    expect(note.textContent).toBe(
      `데이터 football-data.org — 순위·경기·득점 10.31 07:11 KST 갱신 · ${FOOTBALL_DATA_ATTRIBUTION}`,
    );
    expect(note.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-10-30T22:11:59Z",
    );
    expect(note.querySelector("[lang=en]")?.textContent).toBe(
      FOOTBALL_DATA_ATTRIBUTION,
    );
  });

  it("지연 + API-Football 병기(팀 화면)", () => {
    const { container } = render(
      <DataSourceNote
        source={{ updatedAt: "2026-10-28T22:11:59Z", stale: true }}
        covers="순위·경기·득점"
        apiFootball="팀시트·포메이션"
        scope="team"
      />,
    );
    expect(container.textContent).toBe(
      `데이터 football-data.org — 순위·경기·득점 10.29 07:11 KST 갱신 · 업데이트 지연 · 팀시트·포메이션 API-Football · ${FOOTBALL_DATA_ATTRIBUTION}`,
    );
    expect(
      container.querySelector("[data-slot=data-source-stale]")?.tagName,
    ).toBe("B");
  });

  it("갱신 시각이 없으면 시각·'갱신' 없이 출처와 필수 문구만", () => {
    const { container } = render(
      <DataSourceNote
        source={{ updatedAt: null, stale: false }}
        covers="일정·순위"
        scope="home"
      />,
    );
    expect(container.textContent).toBe(
      `데이터 football-data.org — 일정·순위 · ${FOOTBALL_DATA_ATTRIBUTION}`,
    );
    expect(container.querySelector("time")).toBeNull();
  });
});
