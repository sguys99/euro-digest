import type { Metadata } from "next";
import type { ReactNode } from "react";

import { TodayBrief } from "@/components/brief/today-brief";
import { Button, Switch, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardGutter,
  CardMeta,
  CardNumber,
  CardTabs,
  CardTags,
  CardTitle,
} from "@/components/ui/card";
import {
  ContentsRow,
  FilterChip,
  FlatTab,
  IndexTab,
  StampChip,
} from "@/components/ui/chip";
import { HomeIcon, MoreIcon, NewsIcon, ShareIcon } from "@/components/ui/icons";
import {
  BottomTab,
  BottomTabs,
  TopNav,
  TopNavLink,
} from "@/components/ui/nav-tabs";
import { FilterClearButton } from "@/components/ui/filter-clear-button";
import { ImportanceBar } from "@/components/news/feed-card";
import { NewsFeed } from "@/components/news-feed";
import { SectionHead } from "@/components/ui/section-head";
import { BriefRowSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, ToastView } from "@/components/ui/toast";
import { routes } from "@/lib/paths";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";
import type { CompId } from "@/lib/schema/common";
import { CompetitionsFileSchema } from "@/lib/schema/configs";
import {
  NewsFileSchema,
  type NewsCard,
  type NewsFile,
} from "@/lib/schema/news";
import { formatKst, relativeKst } from "@/lib/time";
import { cn } from "@/lib/utils";

import competitionsJson from "../../../configs/competitions.json";
import briefEmptyJson from "../../../fixtures/brief-empty.json";
import briefSampleJson from "../../../fixtures/brief-sample.json";
import newsSampleJson from "../../../fixtures/news-sample.json";

import { SpecimenControls } from "./specimen-controls";

/**
 * 기초 컴포넌트 견본 (D0-12) — `SPECIMEN=1` 빌드에서만 만들어지는 라우트(`*.specimen.tsx`, next.config.ts).
 * 일반 `npm run build`의 out/에는 없다(공개 URL 아님). `npm run test:specimen`이 이 페이지를 빌드·검사·캡처한다.
 *
 * 배치는 혼합안 `docs/design/d0/concept-mix.html` "컴포넌트·토큰 견본 → 기초 컴포넌트 6종 × 상태" 매트릭스와 같다.
 * hover·focus-visible·:target 칸은 실제 CSS 의사 클래스를 캡처 때 강제한다 — 표시는 `data-force`이고,
 * tests/e2e-specimen/specimen.spec.ts가 Chrome DevTools Protocol(`CSS.forcePseudoState`)로 켠다. 시안처럼 강제 상태
 * 클래스(`.is-hover` 등)를 컴포넌트에 만들지 않는다(DESIGN §11.1 #8). 평소에는 마우스·키보드로 직접 확인한다.
 * 카드 내용은 fixtures 실데이터(`fixtures/news-sample.json` c_d8ecc21d28)다.
 */

export const metadata: Metadata = {
  title: "기초 컴포넌트 견본",
  robots: { index: false, follow: false },
};

// ─── 데이터 ─────────────────────────────────────────────────────────────────

// configs·fixtures도 경계에서 zod로 파싱한다(CLAUDE §9.1) — 형식이 틀리면 견본 빌드가 멈춘다. 서버 컴포넌트라 zod는
// 클라이언트 번들에 들어가지 않는다.
const competitions = CompetitionsFileSchema.parse(competitionsJson);
const newsSample = NewsFileSchema.parse(newsSampleJson);

const COMPS = new Map(competitions.map((c) => [c.id, c]));

function comp(id: CompId): { short: string; name: string } {
  const c = COMPS.get(id);
  if (!c) throw new Error(`configs/competitions.json에 ${id} 없음`);
  return { short: c.shortKo, name: c.nameKo };
}

const COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

/** 분류 7종 라벨(DESIGN §9.3 도장 칩) */
const CATEGORY_LABELS = [
  "경기 결과",
  "이적",
  "부상",
  "감독·구단",
  "대표팀",
  "UCL",
  "기타",
];

const SAMPLE_CARD_ID = "c_d8ecc21d28";
const sampleCard = newsSample.cards.find((c) => c.id === SAMPLE_CARD_ID);
if (!sampleCard?.src[0]) {
  throw new Error(`fixtures/news-sample.json에 ${SAMPLE_CARD_ID} 없음`);
}
const sampleSource = sampleCard.src[0];
/** 상대 시간 기준 — 견본 캡처가 날마다 달라지지 않게 고정(2026-10-11 16:00 KST) */
const SPECIMEN_NOW = new Date("2026-10-11T07:00:00Z");

// ─── 견본 틀 ────────────────────────────────────────────────────────────────

/** 강제할 의사 클래스(캡처 스크립트가 CDP로 켠다) */
type Force = "hover" | "focus-visible" | "target";

function force(...states: Force[]): { "data-force": string } {
  return { "data-force": states.join(" ") };
}

function Frame({
  caption,
  detail,
  className,
  children,
}: {
  caption: string;
  detail?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={cn("m-0 min-w-0 border border-rule py-3.5 pl-3.5", className)}
    >
      <figcaption className="mr-3.5 mb-3 text-[12.5px] leading-normal text-ink-2">
        <b className="mr-1 font-extrabold text-ink">{caption}</b>
        {detail}
      </figcaption>
      {children}
    </figure>
  );
}

function Row({
  name,
  note,
  cols = 5,
  children,
}: {
  name: string;
  note: string;
  /** 1024 이상 칸 수 — 상태 5칸(기본), 토스트 3칸(혼합안과 같음), 카드 2칸(실제 크기 카드라 혼합안 3칸보다 넓게) */
  cols?: 2 | 3 | 5;
  children: ReactNode;
}) {
  return (
    <div
      className="grid gap-2.5 border-b border-rule py-3 pr-3.5 pb-3.5 lg:grid-cols-[150px_minmax(0,1fr)] lg:items-start"
      data-specimen-row={name}
    >
      <p className="text-[13px] font-extrabold">
        {name}
        <small className="mt-0.5 block text-[12px] font-normal text-ink-2">
          {note}
        </small>
      </p>
      <div
        className={cn(
          "flex flex-wrap items-start gap-x-3.5 gap-y-3 lg:grid",
          cols === 2
            ? "lg:grid-cols-2"
            : cols === 3
              ? "lg:grid-cols-3"
              : "lg:grid-cols-5",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Cell({
  state,
  className,
  children,
}: {
  state: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 justify-items-start gap-1.5", className)}>
      <span className="font-numeric text-[12.5px] leading-none font-semibold tracking-[0.06em] whitespace-nowrap text-ink-2 tabular-nums">
        {state}
      </span>
      {children}
    </div>
  );
}

function NotApplicable({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-[22ch] text-[12.5px] text-ink-2">{children}</span>
  );
}

// ─── 견본 카드(D0-12 Card 상태 매트릭스 — 껍데기 상태 견본. 실제 카드 변형은 아래 SpecimenFeeds, M1-31) ──────────

function SpecimenCard({
  suffix,
  articleForce,
  linkForce,
}: {
  suffix: string;
  articleForce?: Force[];
  linkForce?: Force[];
}) {
  const id = `${SAMPLE_CARD_ID}-${suffix}`;
  const titleId = `${id}-t`;
  const epl = comp("EPL");
  return (
    <Card
      id={id}
      aria-labelledby={titleId}
      className="w-full"
      {...(articleForce ? force(...articleForce) : {})}
    >
      <CardGutter>
        <CardNumber n={19} />
        <ImportanceBar value={sampleCard?.imp ?? 0} />
      </CardGutter>
      <CardBody>
        <CardTags>
          <StampChip>감독·구단</StampChip>
          <ul aria-label="태그" className="flex flex-wrap gap-y-0.5">
            {["첼시", "팔머"].map((tag) => (
              <li
                key={tag}
                className="border-l border-rule px-1.75 first:border-l-0 first:pl-0"
              >
                {tag}
              </li>
            ))}
          </ul>
        </CardTags>
        <CardTitle
          id={titleId}
          href={sampleSource.u}
          lang={sampleCard?.lang ?? "en"}
          source={sampleSource.n}
          linkProps={linkForce ? force(...linkForce) : undefined}
        >
          {sampleCard?.t ?? ""}
        </CardTitle>
        <CardMeta>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
            <span lang="en" className="font-extrabold text-ink">
              {sampleSource.n}
            </span>
            <time
              dateTime={sampleSource.at}
              className="inline-flex items-baseline gap-2 whitespace-nowrap"
            >
              <span>{relativeKst(sampleSource.at, SPECIMEN_NOW)}</span>
              <span className="font-numeric text-num-meta leading-none font-semibold tracking-[0.02em]">
                {formatKst(sampleSource.at, "short")}
              </span>
            </time>
          </div>
          <Button
            variant="icon"
            aria-label="카드 메뉴"
            className="-mt-2 -mr-2.5 -mb-2.5 ml-auto text-ink-2"
          >
            <MoreIcon />
          </Button>
        </CardMeta>
      </CardBody>
      <CardTabs>
        <IndexTab comp="EPL" title={epl.name}>
          {epl.short}
        </IndexTab>
      </CardTabs>
    </Card>
  );
}

// ─── 오늘의 5줄 상태 견본 (M1-32) ───────────────────────────────────────────

// 브리핑 fixtures — brief-sample.json의 날짜별 파일(보조 필드 textRaw·lenKo·_note는 스키마가 버린다)·S4 합성 파일(brief-empty.json)
const briefDays = new Map(
  BriefFileSchema.array()
    .parse(briefSampleJson.days)
    .map((day) => [day.date, day]),
);

function briefDay(date: string): BriefFile {
  const day = briefDays.get(date);
  if (!day) throw new Error(`fixtures/brief-sample.json에 ${date} 없음`);
  return day;
}

/** 혼합안 견본 "오늘의 5줄 상태"와 같은 4상태 + 결과 지연(D60 — S4 자리 변형) — [id, 이름, 설명, 브리핑] */
const BRIEF_STATES: ReadonlyArray<
  readonly [string, string, string, BriefFile]
> = [
  [
    "s2",
    "S2",
    "AI 4 + 템플릿 1(mixed) · 2026-10-11 발행 — 혼합안 홈",
    briefDay("2026-10-11"),
  ],
  [
    "s1",
    "S1",
    "5줄 모두 AI 작성(llm) · 2026-10-10 발행 · 대회 3개, 최장 66자",
    briefDay("2026-10-10"),
  ],
  [
    "s3",
    "S3",
    "5줄 미만 · 모두 템플릿(template — 라벨 없음) · 2026-09-18 발행",
    briefDay("2026-09-18"),
  ],
  [
    "s4",
    "S4",
    "경기 없는 날(empty) · 브리핑 호출 생략 · 블록 유지, 높이만 줄임 — 날짜를 단정하지 않는다",
    BriefFileSchema.parse(briefEmptyJson),
  ],
  [
    "s4-pending",
    "S4 결과 지연",
    "경기는 있었지만 결과를 받지 못한 날(empty + emptyReason results-pending — D60) · S4 대신 5줄 자리 오류 상자 · 원인 단정 없음",
    BriefFileSchema.parse({
      ...briefEmptyJson,
      emptyReason: "results-pending",
    }),
  ],
];

/**
 * 오늘의 5줄 상태 견본(M1-32) — 실제 블록(`TodayBrief`)을 fixtures 브리핑으로 S1~S4(+ S4 결과 지연 — D60) 싣는다. 피드 견본처럼 1024 이상은 왼쪽 목차 열(232px)만큼
 * 비워 혼합안 M1 지면 폭(728 @1024 · 984 @1280)에서 비교한다. S4 "주요 뉴스로 ↓"는 아래 피드 견본(`#news`)으로 간다.
 */
function SpecimenBriefs() {
  return (
    <div className="lg:pl-col-contents" data-specimen="briefs">
      {BRIEF_STATES.map(([id, name, detail, brief]) => (
        <div key={id} className="mt-9 lg:mt-11" data-specimen={`brief-${id}`}>
          <p className="mb-3 text-[12.5px] leading-normal text-ink-2">
            <b className="mr-1 font-extrabold text-ink">{name}</b>
            {detail}
          </p>
          <TodayBrief brief={brief} headingId={`specimen-brief-${id}-h`} />
        </div>
      ))}
    </div>
  );
}

// ─── 뉴스 카드 변형 견본 (M1-31) ────────────────────────────────────────────

function fixtureCard(id: string): NewsCard {
  const card = newsSample.cards.find((c) => c.id === id);
  if (!card) throw new Error(`fixtures/news-sample.json에 ${id} 없음`);
  return card;
}

/** 합성 출처(견본 전용 — example.com 링크) */
function syntheticSource(
  n: string,
  minutesAgo: number,
  tier: 1 | 2 | 3,
): NewsCard["src"][number] {
  return {
    n,
    u: `https://example.com/specimen/${encodeURIComponent(n)}/`,
    at: new Date(Date.parse("2026-10-11T05:00:00Z") - minutesAgo * 60_000)
      .toISOString()
      .replace(".000Z", "Z"),
    tier,
  };
}

const TRANSFER_EDGES = [
  ["rumor", 1],
  ["negotiating", 2],
  ["agreed", 3],
  ["official", 1],
  ["collapsed", 2],
] as const;

/**
 * 경계 사례(시안에 없는 경우) — fixtures 카드를 바탕으로 한 합성 카드(견본 전용, 공개 빌드에 없음):
 * 출처 8곳(같은 매체 중복 1건 포함 — '+N곳'은 서로 다른 매체 수) · 같은 매체 기사만 더 있는 카드('+N건') · 태그 0개(사전에 없는 slug만)·
 * 대회 0개 · 이적 단계 5종 × Tier 1~3 ·
 * 긴 라틴 매체명이 걸린 연결 줄(375에서 매체명이 그 칸 안에서 줄바꿈).
 */
const edgeNews: NewsFile = {
  date: newsSample.date,
  generatedAt: newsSample.generatedAt,
  runId: "specimen-edge",
  cards: [
    {
      ...fixtureCard("c_0110371250"),
      id: "c_e000000001",
      src: [
        ...fixtureCard("c_0110371250").src,
        syntheticSource("The Athletic", 20, 2),
        syntheticSource("ESPN", 35, 2),
        syntheticSource("Relevo", 50, 2),
        syntheticSource("Gianluca Di Marzio", 65, 2),
        syntheticSource("ESPN", 80, 2),
        syntheticSource("the Daily Briefing", 95, 2),
        syntheticSource("Premier League", 110, 2),
      ],
    },
    {
      // 추가 출처가 모두 같은 매체 → '+2건'(사용자 결정 2026-10-19)
      ...fixtureCard("c_d8ecc21d28"),
      id: "c_e000000003",
      src: [
        ...fixtureCard("c_d8ecc21d28").src,
        syntheticSource("BBC Sport", 40, 2),
        syntheticSource("BBC Sport", 90, 2),
      ],
    },
    {
      ...fixtureCard("c_4d28dc0b8f"),
      id: "c_e000000002",
      teams: ["specimen-unknown-fc"],
      players: ["specimen-unknown-player"],
      comp: [],
    },
    ...TRANSFER_EDGES.map(([status, tier], i) => {
      const base = fixtureCard("c_c4f20b673e");
      return {
        ...base,
        id: `c_e00000001${i}`,
        imp: 2,
        transfer: {
          player: base.transfer?.player ?? "marcos-rojo",
          status,
          tier,
        },
      } satisfies NewsCard;
    }),
    { ...fixtureCard("c_114856ecfb"), id: "c_e000000020", imp: 2 },
    {
      ...fixtureCard("c_431b1523c4"),
      id: "c_e000000021",
      imp: 2,
      cat: "other",
    },
  ],
};

/**
 * 뉴스 카드 피드 견본(M1-31) — 실제 피드 컴포넌트(`NewsFeed`)를 홈과 같은 섹션 머리 아래에 싣는다.
 * ① fixtures 23장(혼합안 홈 피드와 같은 카드·순서·게재 번호 — 머리기사 06, 연결 줄 4쌍, 변형 6종) ② 경계 사례.
 * 1024 이상은 왼쪽 목차 열(232px)만큼 비워 혼합안 M1 지면 폭(728 @1024 · 984 @1280)과 같은 폭에서 비교한다.
 * 상대 시간은 실제 시각으로 채워진다 — 캡처·e2e는 시계를 혼합안 기준 시각(2026-10-11 15:54 KST)에 고정한다.
 */
function SpecimenFeeds() {
  return (
    <div className="lg:pl-col-contents">
      <section
        id="news"
        aria-labelledby="specimen-feed-h"
        className="mt-9 scroll-mt-4 lg:mt-11"
        data-specimen="feed"
      >
        <SectionHead
          heading="주요 뉴스"
          headingId="specimen-feed-h"
          runningHead="SQUAD"
        />
        <NewsFeed news={newsSample} id="specimen-feed" />
      </section>
      <section
        aria-labelledby="specimen-edge-h"
        className="mt-9 lg:mt-11"
        data-specimen="feed-edge"
      >
        <SectionHead
          heading="경계 사례"
          headingId="specimen-edge-h"
          runningHead="EDGE"
        />
        <NewsFeed news={edgeNews} lead={false} id="specimen-edge" />
      </section>
    </div>
  );
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────

export default function SpecimenPage() {
  const epl = comp("EPL");
  const laliga = comp("LALIGA");
  const ligue1 = comp("LIGUE1");

  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-page px-edge pt-6 pb-24 lg:pb-30"
      >
        <header className="mb-4 border-t-3 border-ink pt-2.5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">
            기초 컴포넌트 견본
          </h1>
          <p
            id="specimen-note"
            className="mt-1 max-w-[72ch] text-[13.5px] text-ink-2"
          >
            D0-12 Chip · Card · Button · Tabs · Skeleton · Toast. 개발·테스트
            빌드(SPECIMEN=1) 전용이라 공개 사이트에는 없다. hover ·
            focus-visible · :target 칸은 캡처 때 실제 의사 클래스를 강제하고,
            평소에는 마우스·키보드로 확인한다. 기준은 혼합안 견본 &quot;기초
            컴포넌트 6종 × 상태&quot;.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
          <Frame
            caption="기초 컴포넌트 6종 × 상태"
            detail="기본 · hover · focus-visible · 선택 · 비활성 — 터치 영역은 모두 44px 이상"
            className="lg:col-span-2"
          >
            <div className="grid border-t border-rule">
              {/* ── Chip ── */}
              <Row name="Chip · 분류" note="375 칩 줄 · 7종 + 전체">
                <Cell state="기본">
                  <FilterChip pressed={false} label="이적" count={4} />
                </Cell>
                <Cell state="hover">
                  <FilterChip
                    pressed={false}
                    label="이적"
                    count={4}
                    {...force("hover")}
                  />
                </Cell>
                <Cell state="focus-visible">
                  <FilterChip
                    pressed={false}
                    label="이적"
                    count={4}
                    {...force("focus-visible")}
                  />
                </Cell>
                <Cell state="선택">
                  <FilterChip pressed label="이적" count={4} />
                </Cell>
                <Cell state="비활성">
                  <FilterChip pressed={false} label="UCL" count={0} disabled />
                </Cell>
              </Row>

              <Row
                name="Chip · 한국 선수만"
                note="레드 테두리 → 선택 시 레드 면"
              >
                <Cell state="기본">
                  <FilterChip
                    tone="korean"
                    pressed={false}
                    label="한국 선수만"
                    count={5}
                  />
                </Cell>
                <Cell state="hover">
                  <FilterChip
                    tone="korean"
                    pressed={false}
                    label="한국 선수만"
                    count={5}
                    {...force("hover")}
                  />
                </Cell>
                <Cell state="focus-visible">
                  <FilterChip
                    tone="korean"
                    pressed={false}
                    label="한국 선수만"
                    count={5}
                    {...force("focus-visible")}
                  />
                </Cell>
                <Cell state="선택">
                  <FilterChip
                    tone="korean"
                    pressed
                    label="한국 선수만"
                    count={5}
                  />
                </Cell>
                <Cell state="비활성">
                  <FilterChip
                    tone="korean"
                    pressed={false}
                    label="한국 선수만"
                    count={0}
                    disabled
                  />
                </Cell>
              </Row>

              <Row
                name="Chip · 대회(목차 행)"
                note="1024 이상 왼쪽 목차 · 평탄 탭 + 리더 점선"
              >
                <Cell state="기본">
                  <ContentsRow
                    pressed={false}
                    label={epl.name}
                    count={8}
                    marker={{
                      kind: "competition",
                      comp: "EPL",
                      short: epl.short,
                    }}
                  />
                </Cell>
                <Cell state="hover">
                  <ContentsRow
                    pressed={false}
                    label={epl.name}
                    count={8}
                    marker={{
                      kind: "competition",
                      comp: "EPL",
                      short: epl.short,
                    }}
                    {...force("hover")}
                  />
                </Cell>
                <Cell state="focus-visible">
                  <ContentsRow
                    pressed={false}
                    label={epl.name}
                    count={8}
                    marker={{
                      kind: "competition",
                      comp: "EPL",
                      short: epl.short,
                    }}
                    {...force("focus-visible")}
                  />
                </Cell>
                <Cell state="선택">
                  <ContentsRow
                    pressed
                    label={laliga.name}
                    count={6}
                    marker={{
                      kind: "competition",
                      comp: "LALIGA",
                      short: laliga.short,
                    }}
                  />
                </Cell>
                <Cell state="비활성(0건)">
                  <ContentsRow
                    pressed={false}
                    label={ligue1.name}
                    count={0}
                    disabled
                    marker={{
                      kind: "competition",
                      comp: "LIGUE1",
                      short: ligue1.short,
                    }}
                  />
                </Cell>
              </Row>

              {/* ── Card ── */}
              <Row
                name="Card"
                note="뉴스 카드 · 제목 링크가 포커스 대상"
                cols={2}
              >
                <Cell state="기본" className="w-full">
                  <SpecimenCard suffix="m1" />
                </Cell>
                <Cell state="hover" className="w-full">
                  <SpecimenCard
                    suffix="m2"
                    articleForce={["hover"]}
                    linkForce={["hover"]}
                  />
                </Cell>
                <Cell state="focus-visible" className="w-full">
                  <SpecimenCard suffix="m3" linkForce={["focus-visible"]} />
                </Cell>
                <Cell state="선택(:target)" className="w-full">
                  <SpecimenCard suffix="m4" articleForce={["target"]} />
                </Cell>
                <Cell state="비활성">
                  <NotApplicable>해당 없음 — 결과 가림은 변형 5</NotApplicable>
                </Cell>
              </Row>

              {/* ── Button ── */}
              <Row name="Button · 주" note="잉크 면 → hover 레드 면">
                <Cell state="기본">
                  <Button>모두 보기</Button>
                </Cell>
                <Cell state="hover">
                  <Button {...force("hover")}>모두 보기</Button>
                </Cell>
                <Cell state="focus-visible">
                  <Button {...force("focus-visible")}>모두 보기</Button>
                </Cell>
                <Cell state="선택(토글 켬)">
                  <div className="flex items-center gap-2 bg-ticket px-2.5 py-1.5 text-ticket-fg [--ring:var(--ticket-fg)]">
                    <span
                      id="specimen-switch-label"
                      className="text-[11.5px] font-extrabold text-ticket-fg-2"
                    >
                      결과 가리기
                    </span>
                    <Switch checked aria-labelledby="specimen-switch-label" />
                  </div>
                </Cell>
                <Cell state="비활성">
                  <Button disabled>모두 보기</Button>
                </Cell>
              </Row>

              <Row
                name="Button · 보조 / 텍스트"
                note="1px 잉크 테두리 / 레드 밑줄"
              >
                <Cell state="기본">
                  <Button variant="secondary">필터 해제</Button>
                  <a
                    href="#specimen-note"
                    className={buttonVariants({ variant: "link" })}
                  >
                    AI 작성 안내
                  </a>
                </Cell>
                <Cell state="hover">
                  <Button variant="secondary" {...force("hover")}>
                    필터 해제
                  </Button>
                  <a
                    href="#specimen-note"
                    className={buttonVariants({ variant: "link" })}
                    {...force("hover")}
                  >
                    AI 작성 안내
                  </a>
                </Cell>
                <Cell state="focus-visible">
                  <Button variant="secondary" {...force("focus-visible")}>
                    필터 해제
                  </Button>
                  <a
                    href="#specimen-note"
                    className={buttonVariants({ variant: "link" })}
                    {...force("focus-visible")}
                  >
                    AI 작성 안내
                  </a>
                </Cell>
                <Cell state="선택">
                  <Button variant="secondary" aria-pressed>
                    M1 상태
                  </Button>
                </Cell>
                <Cell state="비활성">
                  <Button variant="secondary" disabled>
                    필터 해제
                  </Button>
                </Cell>
              </Row>

              <Row name="Button · 아이콘" note="44×44 · 공유·메뉴·테마·검색">
                <Cell state="기본">
                  <Button variant="icon" box aria-label="공유">
                    <ShareIcon />
                  </Button>
                </Cell>
                <Cell state="hover">
                  <Button
                    variant="icon"
                    box
                    aria-label="공유 hover 견본"
                    {...force("hover")}
                  >
                    <ShareIcon />
                  </Button>
                </Cell>
                <Cell state="focus-visible">
                  <Button
                    variant="icon"
                    box
                    aria-label="공유 focus 견본"
                    {...force("focus-visible")}
                  >
                    <ShareIcon />
                  </Button>
                </Cell>
                <Cell state="선택(메뉴 열림)">
                  <Button
                    variant="icon"
                    box
                    aria-label="메뉴 열림 견본"
                    aria-expanded
                  >
                    <MoreIcon />
                  </Button>
                </Cell>
                <Cell state="비활성">
                  <Button variant="icon" box aria-label="비활성 견본" disabled>
                    <MoreIcon />
                  </Button>
                </Cell>
              </Row>

              {/* ── Tabs ── */}
              <Row
                name="Tabs · 하단 탭"
                note="375 · 현재 탭 = 위 막대 + 굵기 + aria-current"
              >
                {(
                  [
                    ["기본", undefined, false],
                    ["hover", "hover", false],
                    ["focus-visible", "focus-visible", false],
                    ["선택", undefined, true],
                  ] as const
                ).map(([state, forced, current]) => (
                  <Cell key={state} state={state}>
                    <BottomTabs
                      aria-label={`하단 탭 견본 ${state}`}
                      className="w-full min-w-44"
                    >
                      <BottomTab
                        href={routes.home()}
                        prefetch={false}
                        icon={<HomeIcon />}
                        current={current}
                      >
                        홈
                      </BottomTab>
                      <BottomTab
                        href={routes.news()}
                        prefetch={false}
                        icon={<NewsIcon />}
                        {...(forced ? force(forced) : {})}
                      >
                        뉴스
                      </BottomTab>
                    </BottomTabs>
                  </Cell>
                ))}
                <Cell state="비활성">
                  <NotApplicable>
                    해당 없음 — 미완성 섹션은 탭을 숨긴다(plan §2.3)
                  </NotApplicable>
                </Cell>
              </Row>

              <Row name="Tabs · 상단 내비" note="1024 이상 · 티켓 아래">
                {(
                  [
                    ["기본", undefined, false],
                    ["hover", "hover", false],
                    ["focus-visible", "focus-visible", false],
                    ["선택", undefined, true],
                  ] as const
                ).map(([state, forced, current]) => (
                  <Cell key={state} state={state}>
                    <TopNav aria-label={`상단 내비 견본 ${state}`}>
                      <TopNavLink
                        href={routes.home()}
                        prefetch={false}
                        current={current}
                      >
                        홈
                      </TopNavLink>
                      <TopNavLink
                        href={routes.news()}
                        prefetch={false}
                        {...(forced ? force(forced) : {})}
                      >
                        뉴스
                      </TopNavLink>
                    </TopNav>
                  </Cell>
                ))}
                <Cell state="비활성">
                  <NotApplicable>해당 없음 — 숨김</NotApplicable>
                </Cell>
              </Row>

              <Row
                name="Tabs · 대회 탭"
                note="순위 미니(D1 — 모양만) · 선택 = 대회 색 면"
              >
                {(
                  [
                    ["기본", null, undefined, false],
                    ["hover", null, "hover", false],
                    ["focus-visible", null, "focus-visible", false],
                    ["선택", "EPL", undefined, false],
                    ["비활성", null, undefined, true],
                  ] as const
                ).map(([state, value, forced, disabled]) => (
                  <Cell key={state} state={state}>
                    <Tabs defaultValue={value}>
                      <TabsList aria-label={`순위 미니 대회 탭 견본 ${state}`}>
                        <TabsTrigger
                          value="EPL"
                          competition="EPL"
                          {...(forced ? force(forced) : {})}
                        >
                          {epl.short}
                        </TabsTrigger>
                        <TabsTrigger
                          value="LALIGA"
                          competition="LALIGA"
                          disabled={disabled}
                        >
                          {laliga.short}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Cell>
                ))}
              </Row>

              <Row
                name="Tabs · 피드 머리 색 면"
                note="대회 필터 시 · 6종 + 해제 버튼"
              >
                <div className="grid w-full gap-2 lg:col-span-5">
                  {COMP_IDS.map((id) => {
                    const c = comp(id);
                    const forced: Force | undefined =
                      id === "LALIGA"
                        ? "focus-visible"
                        : id === "SERIEA"
                          ? "hover"
                          : undefined;
                    return (
                      <SectionHead
                        key={id}
                        heading="주요 뉴스"
                        headingAs="p"
                        runningHead="SQUAD"
                        filter={{
                          comp: id,
                          short: c.short,
                          clear: (
                            <FilterClearButton
                              {...(forced ? force(forced) : {})}
                            />
                          ),
                        }}
                      />
                    );
                  })}
                </div>
              </Row>

              {/* ── Skeleton ── */}
              <Row name="Skeleton" note="움직이지 않는 교정쇄 · --paper-3 면">
                <div
                  aria-busy="true"
                  className="w-full lg:col-span-5"
                  data-specimen="skeleton"
                >
                  <p className="sr-only" role="status">
                    불러오는 중
                  </p>
                  <BriefRowSkeleton />
                  <CardSkeleton />
                </div>
              </Row>

              {/* ── Toast ── */}
              <Row
                name="Toast"
                note="아래에서 밀려 올라옴 200ms · 2.4초 뒤 사라짐"
                cols={3}
              >
                <Cell state="기본">
                  <ToastView
                    animated={false}
                    kind="새 소식"
                    action={{ label: "새로고침" }}
                  >
                    새 소식이 있어요
                  </ToastView>
                </Cell>
                <Cell state="액션 hover">
                  <ToastView
                    animated={false}
                    kind="새 소식"
                    action={{ label: "새로고침", ...force("hover") }}
                  >
                    새 소식이 있어요
                  </ToastView>
                </Cell>
                <Cell state="액션 focus-visible">
                  <ToastView
                    animated={false}
                    kind="새 소식"
                    action={{ label: "새로고침", ...force("focus-visible") }}
                  >
                    새 소식이 있어요
                  </ToastView>
                </Cell>
                <Cell state="링크 복사">
                  <ToastView animated={false} kind="공유">
                    링크를 복사했어요
                  </ToastView>
                </Cell>
                <Cell state="비활성">
                  <NotApplicable>해당 없음</NotApplicable>
                </Cell>
              </Row>
            </div>
          </Frame>

          <Frame caption="칩·탭·표식" detail="대회 6 · 분류 도장 7">
            <div className="mr-3.5 grid gap-2">
              <p className="text-xs font-extrabold text-ink-2">
                대회 6 · 인덱스 탭(세로, 카드·5줄 오른쪽 가장자리) / 평탄
                탭(목차·범례)
              </p>
              <div className="flex flex-wrap items-start gap-1.5">
                {COMP_IDS.map((id) => (
                  <IndexTab key={id} comp={id} title={comp(id).name}>
                    {comp(id).short}
                  </IndexTab>
                ))}
                <span className="w-3" aria-hidden="true" />
                {COMP_IDS.map((id) => (
                  <FlatTab
                    key={id}
                    comp={id}
                    title={comp(id).name}
                    className="self-center"
                  >
                    {comp(id).short}
                  </FlatTab>
                ))}
              </div>
              <p className="mt-2 text-xs font-extrabold text-ink-2">
                분류 도장 7종 · 카드 태그 줄 맨 앞(상호작용 없음)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_LABELS.map((label) => (
                  <StampChip key={label}>{label}</StampChip>
                ))}
              </div>
            </div>
          </Frame>

          <Frame
            caption="동작"
            detail="테마 토글 · 토스트 · 필터 칩 · 대회 탭(←/→/Home/End) — 실제로 눌러 확인"
          >
            <SpecimenControls
              comps={COMP_IDS.slice(0, 3).map((id) => ({
                id,
                ...comp(id),
              }))}
            />
          </Frame>
        </div>
        <SpecimenBriefs />
        <SpecimenFeeds />
      </main>
      <Toaster />
    </>
  );
}
