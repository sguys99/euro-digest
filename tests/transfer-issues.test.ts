/**
 * M3-04 이적 감지 이슈(scripts/lib/transfer-issues.ts · github-issues.ts player-transfer — PRD FR-63·FR-64).
 * 후보 판정(agreed·official만, 루머·협상·결렬 제외, 행선지 = 지금 소속이면 제외, 지난 이적 제외) · 라인업 불일치 · 같은 선수·행선지 합치기 ·
 * 중복 키 · 5대 리그 여부 · 이슈 본문(기사 제목·출처·URL 원문 그대로, LLM 없음) · 열린 이슈가 있으면 건너뜀(댓글 없음).
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { KoreanPlayersFile, NewsCard } from "@/lib/schema";

import {
  RECURRENCE_POLICY,
  buildIssue,
  clearReportCache,
  defaultIssueKey,
  fingerprintMarker,
  issueFingerprint,
  parseIssuePayload,
  previewReport,
  reportIssue,
  transferDestinationKey,
  transferIssueKey,
  type FetchLike,
} from "../scripts/lib/github-issues";
import type { TeamMismatch } from "../scripts/lib/korean-players-data";
import { createLogger } from "../scripts/lib/logger";
import {
  formatBatchResult,
  formatPreview,
  formatReportResult,
} from "../scripts/lib/report-issue-cli";
import { TEAM_LEAGUE_INDEX } from "../scripts/lib/team-leagues";
import {
  TRANSFER_ISSUE_STATUSES,
  cardTransferCandidate,
  destinationLeagueOf,
  transferIssuePayloads,
  type TransferIssueInput,
} from "../scripts/lib/transfer-issues";

const PLAYERS: KoreanPlayersFile = [
  {
    slug: "kim-min-jae",
    nameKo: "김민재",
    nameEn: "Min-jae Kim",
    team: "bayern-munchen",
    comp: "BUNDESLIGA",
    position: "DF",
    birthYear: 1996,
    apiFootballId: 2897,
    active: true,
  },
  {
    slug: "lee-kang-in",
    nameKo: "이강인",
    nameEn: "Kang-in Lee",
    team: "atletico-madrid",
    comp: "LALIGA",
    position: "MF",
    birthYear: 2001,
    apiFootballId: 927,
    active: true,
  },
  {
    slug: "yang-min-hyeok",
    nameKo: "양민혁",
    nameEn: "Min-hyeok Yang",
    team: "westerlo",
    comp: "OTHER",
    position: "FW",
    birthYear: 2006,
    apiFootballId: null,
    active: false,
  },
];

const AT = "2026-11-01T21:00:00.000Z";

function card(
  id: string,
  over: Partial<NewsCard> & { transfer?: NewsCard["transfer"] } = {},
): NewsCard {
  return {
    id,
    t: "Kim Min-jae completes move to Arsenal",
    s: [],
    cat: "transfer",
    comp: ["EPL"],
    teams: ["arsenal"],
    players: ["kim-min-jae"],
    imp: 4,
    kr: true,
    spoiler: false,
    transfer: {
      player: "kim-min-jae",
      to: "arsenal",
      status: "official",
      tier: 2,
    },
    src: [
      {
        n: "BBC Sport",
        u: "https://www.bbc.co.uk/sport/football/articles/abc?x=1",
        at: AT,
        tier: 2,
      },
    ],
    lang: "en",
    ai: false,
    created: AT,
    ...over,
  };
}

const base: Omit<TransferIssueInput, "cards" | "mismatches"> = {
  players: PLAYERS,
  teamLeagues: TEAM_LEAGUE_INDEX,
  knownTeams: new Set(["arsenal", "bayern-munchen", "celtic", "magdeburg"]),
  teamNames: new Map([
    ["arsenal", "Arsenal"],
    ["celtic", "Celtic"],
  ]),
  leagueTableCurrent: true,
};
const CTX = {
  runId: "collect-prod-20261101T221000Z-1234",
  publishDate: "2026-11-02",
  occurredAt: "2026-11-01T22:20:00.000Z",
  runUrl: "https://github.com/sguys99/euro-digest/actions/runs/987",
};

function payloads(
  cards: NewsCard[],
  mismatches: TeamMismatch[] = [],
  over: Partial<TransferIssueInput> = {},
) {
  return transferIssuePayloads({ ...base, cards, mismatches, ...over }, CTX);
}

const mismatch = (over: Partial<TeamMismatch> = {}): TeamMismatch => ({
  player: "kim-min-jae",
  configTeam: "bayern-munchen",
  observedTeam: "arsenal",
  observedTeamName: "Arsenal",
  matchId: "af-1500001",
  kickoff: "2026-11-01T15:00:00.000Z",
  ...over,
});

beforeEach(() => clearReportCache());

describe("cardTransferCandidate — 후보 판정 (FR-63)", () => {
  it("확정 쪽 단계만 — agreed·official", () => {
    expect([...TRANSFER_ISSUE_STATUSES]).toEqual(["agreed", "official"]);
    for (const status of ["agreed", "official"] as const) {
      expect(
        cardTransferCandidate(
          card("c_0000000001", {
            transfer: { player: "kim-min-jae", to: "arsenal", status, tier: 2 },
          }),
          PLAYERS,
        ),
      ).toEqual({ player: "kim-min-jae", to: "arsenal" });
    }
  });

  it("루머·협상·결렬은 이슈를 만들지 않는다(노이즈)", () => {
    for (const status of ["rumor", "negotiating", "collapsed"] as const) {
      expect(
        cardTransferCandidate(
          card("c_0000000002", {
            transfer: { player: "kim-min-jae", to: "arsenal", status, tier: 1 },
          }),
          PLAYERS,
        ),
      ).toBeNull();
    }
  });

  it("이적 카테고리가 아니거나 transfer가 없거나 미등록 선수면 후보가 아니다", () => {
    expect(
      cardTransferCandidate(card("c_0000000003", { cat: "club" }), PLAYERS),
    ).toBeNull();
    expect(
      cardTransferCandidate(
        card("c_0000000004", { transfer: undefined }),
        PLAYERS,
      ),
    ).toBeNull();
    expect(
      cardTransferCandidate(
        card("c_0000000005", {
          transfer: {
            player: "bukayo-saka",
            to: "real-madrid",
            status: "official",
            tier: 2,
          },
        }),
        PLAYERS,
      ),
    ).toBeNull();
  });

  it("행선지가 지금 설정 소속이면 이미 반영된 이적 — 제외", () => {
    expect(
      cardTransferCandidate(
        card("c_0000000006", {
          transfer: {
            player: "kim-min-jae",
            to: "bayern-munchen",
            status: "official",
            tier: 2,
          },
        }),
        PLAYERS,
      ),
    ).toBeNull();
  });

  it("행선지 없음 — 출발 팀이 지금 소속이면 후보(행선지 미상), 다른 팀이면 지난 이적이라 제외", () => {
    expect(
      cardTransferCandidate(
        card("c_0000000007", {
          transfer: {
            player: "kim-min-jae",
            from: "bayern-munchen",
            status: "agreed",
            tier: 2,
          },
        }),
        PLAYERS,
      ),
    ).toEqual({ player: "kim-min-jae", to: null });
    expect(
      cardTransferCandidate(
        card("c_0000000008", {
          transfer: {
            player: "kim-min-jae",
            from: "napoli",
            status: "official",
            tier: 2,
          },
        }),
        PLAYERS,
      ),
    ).toBeNull();
  });

  it("비활성(기타 리그) 선수의 이적도 후보 — 5대 리그 복귀를 알아야 한다(FR-64)", () => {
    expect(
      cardTransferCandidate(
        card("c_0000000009", {
          transfer: {
            player: "yang-min-hyeok",
            to: "arsenal",
            status: "official",
            tier: 2,
          },
        }),
        PLAYERS,
      ),
    ).toEqual({ player: "yang-min-hyeok", to: "arsenal" });
  });
});

describe("destinationLeagueOf — 5대 리그 여부 (FR-64)", () => {
  it("리그 표의 팀 → 그 리그, 아는 팀이지만 표 밖 → OTHER, slug 없음·모르는 slug → 확인 필요(null)", () => {
    expect(destinationLeagueOf("arsenal", base).league).toBe("EPL");
    expect(destinationLeagueOf("celtic", base).league).toBe("OTHER");
    expect(destinationLeagueOf("magdeburg", base).league).toBe("OTHER");
    const unmapped = destinationLeagueOf(null, base);
    expect(unmapped.league).toBeNull();
    expect(unmapped.note).toContain("team-ids");
    expect(destinationLeagueOf("no-such-fc", base).league).toBeNull();
  });

  it("팀 표 시즌이 대회 설정과 다르면 리그를 판정하지 않는다", () => {
    expect(
      destinationLeagueOf("arsenal", { ...base, leagueTableCurrent: false })
        .league,
    ).toBeNull();
  });
});

describe("transferIssuePayloads — 선수 + 행선지별 사건", () => {
  it("후보 없음 → 빈 배열(오늘 데이터처럼 루머만 있는 날)", () => {
    expect(
      payloads([
        card("c_00000000a1", {
          transfer: {
            player: "kim-min-jae",
            to: "arsenal",
            status: "rumor",
            tier: 3,
          },
        }),
      ]),
    ).toEqual([]);
    expect(payloads([], [])).toEqual([]);
  });

  it("같은 선수·같은 행선지의 카드 여러 장 + 라인업 단서 → payload 하나(카드는 단계 높은 순)", () => {
    const out = payloads(
      [
        card("c_00000000b2", {
          t: "Arsenal agree deal for Kim Min-jae",
          transfer: {
            player: "kim-min-jae",
            to: "arsenal",
            status: "agreed",
            tier: 2,
          },
        }),
        card("c_00000000b1"),
        card("c_00000000b1"), // 같은 카드가 두 번 와도 한 번만
      ],
      [mismatch()],
    );
    expect(out).toHaveLength(1);
    const p = out[0]!;
    expect(p).toMatchObject({
      player: "kim-min-jae",
      playerName: "김민재",
      config: { team: "bayern-munchen", comp: "BUNDESLIGA", active: true },
      destination: { slug: "arsenal", name: "Arsenal", league: "EPL" },
      lineup: {
        matchId: "af-1500001",
        kickoff: "2026-11-01T15:00:00.000Z",
        teamName: "Arsenal",
      },
      runId: CTX.runId,
      publishDate: "2026-11-02",
    });
    expect(p.cards?.map((c) => [c.id, c.status])).toEqual([
      ["c_00000000b1", "official"],
      ["c_00000000b2", "agreed"],
    ]);
    // 제목·출처·URL은 카드 원문 그대로
    expect(p.cards?.[0]).toMatchObject({
      title: "Kim Min-jae completes move to Arsenal",
      sources: [
        {
          name: "BBC Sport",
          url: "https://www.bbc.co.uk/sport/football/articles/abc?x=1",
        },
      ],
    });
    expect(parseIssuePayload("player-transfer", p)).toBeTruthy();
    expect(defaultIssueKey("player-transfer", p)).toBe(
      "transfer:kim-min-jae:arsenal",
    );
  });

  it("라인업 불일치만 — team-ids에 없는 팀은 slug null + 원문 이름, 리그 '확인 필요', 키는 이름을 slug 꼴로", () => {
    const out = payloads(
      [],
      [
        mismatch({
          observedTeam: null,
          observedTeamName: "KVC Westerlo",
          kickoff: "2026-10-30T18:00:00.000Z",
        }),
        mismatch({
          observedTeam: null,
          observedTeamName: "KVC Westerlo",
          matchId: "af-1500009",
          kickoff: "2026-11-01T18:00:00.000Z",
        }),
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      destination: { slug: null, name: "KVC Westerlo", league: null },
      cards: [],
      lineup: { matchId: "af-1500009" },
    });
    expect(defaultIssueKey("player-transfer", out[0]!)).toBe(
      "transfer:kim-min-jae:kvc-westerlo",
    );
  });

  it("행선지가 다르면 다른 사건, 순서는 설정 순 → 키 순(결정적)", () => {
    const out = payloads(
      [
        card("c_00000000c1", {
          transfer: {
            player: "lee-kang-in",
            to: "arsenal",
            status: "official",
            tier: 2,
          },
          players: ["lee-kang-in"],
        }),
        card("c_00000000c2", {
          transfer: {
            player: "kim-min-jae",
            to: "celtic",
            status: "official",
            tier: 2,
          },
        }),
        card("c_00000000c3"),
      ],
      [],
    );
    expect(out.map((p) => defaultIssueKey("player-transfer", p))).toEqual([
      "transfer:kim-min-jae:arsenal",
      "transfer:kim-min-jae:celtic",
      "transfer:lee-kang-in:arsenal",
    ]);
    expect(out[1]?.destination.league).toBe("OTHER");
  });

  it("미등록 선수의 라인업 단서는 버린다", () => {
    expect(payloads([], [mismatch({ player: "ghost" })])).toEqual([]);
  });
});

describe("중복 키 (같은 선수·같은 이적 = 이슈 하나)", () => {
  it("행선지 키 — slug > 이름(악센트·공백 정리) > unknown", () => {
    expect(transferDestinationKey({ slug: "arsenal", name: "Arsenal" })).toBe(
      "arsenal",
    );
    expect(transferDestinationKey({ slug: null, name: "1. FC Köln II" })).toBe(
      "1-fc-koln-ii",
    );
    expect(transferDestinationKey({ slug: null, name: null })).toBe("unknown");
    expect(transferDestinationKey({ slug: null, name: "가나다" })).toBe(
      "unknown",
    );
    expect(transferIssueKey("kim-min-jae", { slug: null, name: null })).toBe(
      "transfer:kim-min-jae:unknown",
    );
  });

  it("다음 날 카드가 바뀌어도 같은 선수·같은 행선지면 같은 fingerprint", () => {
    const day1 = payloads([card("c_00000000d1")])[0]!;
    const day2 = payloads([], [mismatch()])[0]!;
    const fp = (p: typeof day1) =>
      issueFingerprint(
        "player-transfer",
        defaultIssueKey("player-transfer", p),
      );
    expect(fp(day1)).toBe(fp(day2));
  });
});

describe("buildIssue — player-transfer 본문", () => {
  it("제목·라벨·본문(선수·설정 소속·행선지·5대 리그 여부·근거 카드 원문·할 일)", () => {
    const p = payloads(
      [
        card("c_00000000e1", {
          t: "Kim Min-jae | Arsenal *agree* terms @Fabrizio",
        }),
      ],
      [mismatch()],
    )[0]!;
    const built = buildIssue("player-transfer", p);
    expect(built.labels).toEqual(["player-transfer"]);
    expect(built.key).toBe("transfer:kim-min-jae:arsenal");
    expect(built.title).toBe(
      "[이적 감지] 김민재 → Arsenal (카드 공식 · 라인업 불일치)",
    );
    const body = built.body;
    expect(body).toContain("| 선수 | 김민재 (`kim-min-jae`) |");
    expect(body).toContain(
      "| 설정상 소속 | `bayern-munchen` · `BUNDESLIGA` · 활성 |",
    );
    expect(body).toContain("| 5대 리그 여부 | 5대 리그 (`EPL`) |");
    // 기사 제목은 원문 그대로(멘션 알림만 끊는다 — 폭 없는 공백)
    expect(body).toContain("- Kim Min-jae | Arsenal *agree* terms @​Fabrizio");
    expect(body).toContain(
      "  - BBC Sport — <https://www.bbc.co.uk/sport/football/articles/abc?x=1>",
    );
    expect(body).toContain("### 근거 — 경기 기록 원장 라인업");
    expect(body).toContain("`/add-player`");
    expect(body).toContain("LLM 미사용");
    expect(body).toContain(fingerprintMarker(built.fingerprint));
    expect(body).toContain("새 이슈·댓글 없이 건너뜁니다");
  });

  it("5대 리그 밖 → FR-64 할 일(comp OTHER · active false · 목록 유지), 모르면 '확인 필요' + 두 경우 모두 안내", () => {
    const other = payloads([
      card("c_00000000f1", {
        transfer: {
          player: "kim-min-jae",
          to: "celtic",
          status: "official",
          tier: 2,
        },
      }),
    ])[0]!;
    const otherBody = buildIssue("player-transfer", other).body;
    expect(otherBody).toContain("**5대 리그 밖** → '기타 리그'(FR-64)");
    expect(otherBody).toContain('`"comp": "OTHER"` · `"active": false`');
    expect(otherBody).toContain("목록에서 지우지 않는다");
    expect(otherBody).not.toContain("5대 리그 안이면");

    const unknown = payloads(
      [],
      [mismatch({ observedTeam: null, observedTeamName: "KVC Westerlo" })],
    )[0]!;
    const unknownBuilt = buildIssue("player-transfer", unknown);
    expect(unknownBuilt.title).toBe(
      "[이적 감지] 김민재 → KVC Westerlo (라인업 불일치)",
    );
    expect(unknownBuilt.body).toContain("| 5대 리그 여부 | **확인 필요**");
    expect(unknownBuilt.body).toContain("5대 리그 안이면");
    expect(unknownBuilt.body).toContain("5대 리그 밖이면(FR-64)");
    expect(unknownBuilt.body).toContain("| 단계 | 카드 없음(라인업 단서만) |");
  });

  it("payload 형식 오류는 거부(slug·카드 id·URL 형식)", () => {
    const good = payloads([card("c_00000000f2")])[0]!;
    expect(() =>
      parseIssuePayload("player-transfer", { ...good, player: "Kim Min" }),
    ).toThrow();
    expect(() =>
      parseIssuePayload("player-transfer", {
        ...good,
        cards: [
          {
            ...good.cards![0]!,
            sources: [{ name: "x", url: "javascript:alert(1)" }],
          },
        ],
      }),
    ).toThrow();
  });
});

// ─── 보고 — 열린 이슈가 있으면 건너뜀 ─────────────────────────────────────

const REPO = "sguys99/euro-digest";
const TOKEN = `${"gh"}s_${"T0k3nV4lu3".repeat(4)}`;

function fakeFetch(replies: Response[]) {
  const calls: Array<{ method: string; url: string }> = [];
  const queue = [...replies];
  const fetch: FetchLike = async (input, init = {}) => {
    calls.push({ method: init.method ?? "GET", url: input });
    const next = queue.shift();
    if (!next) throw new Error(`예상 밖 요청: ${input}`);
    return next;
  };
  return { fetch, calls };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("reportIssue — player-transfer 중복 방지 (RECURRENCE_POLICY skip)", () => {
  const payload = payloads([card("c_0000000a01")])[0]!;
  const fp = issueFingerprint(
    "player-transfer",
    "transfer:kim-min-jae:arsenal",
  );
  const open = {
    number: 77,
    html_url: `https://github.com/${REPO}/issues/77`,
    state: "open",
    body: `본문\n\n${fingerprintMarker(fp)}`,
    labels: [{ name: "player-transfer" }],
  };
  const quiet = createLogger({
    scope: "issues",
    format: "json",
    env: {},
    sink: () => undefined,
  });

  it("정책: 이적 감지만 skip, 나머지는 댓글", () => {
    expect(RECURRENCE_POLICY["player-transfer"]).toBe("skip");
    expect(RECURRENCE_POLICY["source-broken"]).toBe("comment");
  });

  it("열린 이슈가 있으면 댓글 없이 건너뛴다 — 요청은 검색 GET 하나", async () => {
    const h = fakeFetch([json([open])]);
    const result = await reportIssue({
      kind: "player-transfer",
      payload,
      repo: REPO,
      token: TOKEN,
      fetch: h.fetch,
      logger: quiet,
      cache: new Map(),
    });
    expect(result).toMatchObject({ action: "skipped", number: 77 });
    expect(h.calls).toEqual([expect.objectContaining({ method: "GET" })]);
    expect(h.calls[0]?.url).toContain("labels=player-transfer");
    expect(formatReportResult(result)).toContain("건너뜀");
  });

  it("열린 이슈가 없으면 player-transfer 라벨로 새 이슈", async () => {
    const h = fakeFetch([
      json([]),
      json(
        { number: 78, html_url: `https://github.com/${REPO}/issues/78` },
        201,
      ),
    ]);
    const result = await reportIssue({
      kind: "player-transfer",
      payload,
      repo: REPO,
      token: TOKEN,
      fetch: h.fetch,
      logger: quiet,
      cache: new Map(),
    });
    expect(result).toMatchObject({ action: "created", number: 78 });
    expect(h.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("dry-run도 would-skip(요청은 GET만)", async () => {
    const h = fakeFetch([json([open])]);
    const preview = await previewReport({
      kind: "player-transfer",
      payload,
      repo: REPO,
      fetch: h.fetch,
    });
    expect(preview).toMatchObject({ action: "would-skip", number: 77 });
    expect(formatPreview(preview)).toContain("건너뛸 예정");
    expect(h.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("일괄 결과 줄에 건너뜀 수", () => {
    expect(
      formatBatchResult("player-transfer", {
        created: 1,
        commented: 0,
        failed: 0,
        skipped: 2,
      }),
    ).toBe(
      "[report-issue] player-transfer 일괄 보고 3건 — 새 이슈 1 · 댓글 0 · 건너뜀 2 · 실패 0",
    );
  });
});
