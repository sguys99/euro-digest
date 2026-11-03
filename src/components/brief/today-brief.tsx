import Link from "next/link";

import { AiLabel } from "@/components/ui/ai-label";
import { ROW_GRID } from "@/components/ui/card";
import { FlatTab, IndexTab, StampChip } from "@/components/ui/chip";
import { SectionHead } from "@/components/ui/section-head";
import { SpoilerFlap, SpoilerVeil } from "@/components/spoiler/spoiler-parts";
import { aboutHref } from "@/lib/about-sections";
import {
  briefEmptyState,
  type BriefEmptyState,
  type BriefRestMatch,
} from "@/lib/brief-empty";
import {
  buildBriefView,
  type BriefInput,
  type BriefRowView,
  type BriefTextPart,
} from "@/lib/brief-view";
import { loadCompetitionLabels } from "@/lib/data/card-labels";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadNationalTeamConfig } from "@/lib/data/national-team";
import { briefErrorIssueUrl } from "@/lib/paths";
import { seasonLabel, type OffSeasonFeature } from "@/lib/rest-period";
import { formatKst, kstDayRangeUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * 오늘의 5줄 — 홈 최상단 데이터 브리핑 블록 (PRD §4.2·D2, FR-22~29·FR-35·FR-36, D24·D30·D45·D58, DESIGN.md §9.3 오늘의 5줄 행 ·
 * AI 작성 라벨 · S4 · §3.5, 혼합안 `concept-mix.html` `.sf`, plan M1-32)
 *
 * ```
 * section
 *   섹션 머리 "오늘의 5줄" + STARTING FIVE · 부제 "{M월 D일}(현지) 경기 기준"(+ "이날 N줄")
 *   ol(N줄) › li 행 [--gutter 등번호 │ 문장 + "AI 작성" │ --tab-w 인덱스 탭]     ← mode llm·mixed·template
 *   S4 가족 [--gutter '0' 윤곽 │ "오늘은 5줄을 쉽니다" + 이유 블록 + 링크]          ← mode empty(D30 — 블록을 두고 높이만 줄인다)
 *     ① 경기 없음: 이유 1줄 + 주요 뉴스로 ↓
 *     ② A매치 휴식기(홈만 — M5-17): 이유 1줄 · 점선 · 도장 "A매치 기간" + 기간 · 경기(날짜 N2 · 시각 · 상대 · 홈/원정 · 대회, 스코어 0)
 *        + A매치 섹션으로 ↓ · 주요 뉴스로 ↓
 *     ③ 비시즌(홈만 — M1-37 → D3): 평탄 탭 + 시즌명 · 날짜(N2) + 개막·종료 / 연도 · 안내 + 주요 뉴스로 ↓
 *     판정은 src/lib/brief-empty.ts `briefEmptyState`(DECISIONS D3 #12 — 우선순위 비시즌 → A매치 휴식기 → 경기 없음)
 *   하단: 데이터 football-data.org · API-Football │ AI 작성 안내 · 브리핑 오류 신고↗
 *
 *   결과 지연(D60 — mode empty + emptyReason results-pending): 섹션 머리 + 5줄 자리 오류(`BriefMissing`)와 같은 상자
 *   ["{오늘은·이날은} 5줄을 싣지 못했어요" + "경기 결과 집계가 늦어 …"] — 부제·하단 없음(보이는 브리핑 데이터가 없다)
 * ```
 * - 행 격자·여백은 카드와 같은 `ROW_GRID`(--gutter · 1fr · --tab-w, 열 간격 10/14px), 위아래 13·14px(≥1024 14·15px). 1023 이하는
 *   오른쪽으로 --edge만큼 넘쳐 인덱스 탭이 화면 가장자리에 붙는다(카드 `bleed`와 같다).
 * - 등번호는 장식(`aria-hidden`) — 목록 의미(`<ol>`)가 순서를 전한다. Safari가 `list-style: none` 목록의 의미를 지우지 않게 `role="list"`.
 * - "AI 작성" 라벨은 `ai:true` 줄 전부, 템플릿 줄(`ai:false`)은 없음(FR-35). 템플릿 줄도 같은 문장 행이다(D45 ④ — 화면 모델 머리 주석).
 * - 하단 "AI 작성 안내"는 AI 줄이 있는 날만(혼합안 S3·S4), "브리핑 오류 신고"는 발행 날짜를 채운 이슈 양식(FR-36)이다.
 * - 결과 가림(M4-15 — FR-37, DESIGN §9.3 '결과 가림(줄·카드)'): 경기 결과 줄(`row.result`)은 행이 펼치는 단위(뜯김)다. 가림이 켜지면 문장
 *   (+ AI 라벨)을 접고 띠 "결과 가림 · {n}번 줄 · 보기"를 보인다. 모든 줄이 결과면 목록 위 안내 띠 "{N}줄 모두 경기 결과라 가렸어요." +
 *   '모두 보기'(블록 전체가 바깥 단위 — 펴면 줄이 모두 드러난다). 가림은 CSS(globals.css §13), 펼치기는 스위치 섬의 위임.
 * - 서버 컴포넌트 — JS 0.
 */

/** 텍스트 링크 — 레드 800 13px, 밑줄 1px(4px 띄움) → hover 2px, 최소 44px(DESIGN §9.2 텍스트 링크, 혼합안 `.tlink` — 사이 간격 없음) */
const TEXT_LINK =
  "inline-flex min-h-11 items-center text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

export interface TodayBriefProps {
  /** 그 호의 브리핑 파일(`data/briefs/{발행일}.json`) — 파일이 없는 호는 부르는 쪽이 정한다(블록 없음 · 확인된 실패면 `BriefMissing`, M1-37) */
  brief: BriefInput;
  /** 섹션 머리 제목 요소(홈 h2 — 워드마크 h1 아래) */
  headingAs?: "h2" | "h3";
  /** 섹션 머리 id(한 페이지에 블록이 여럿이면 다르게 — 견본) */
  headingId?: string;
  /** 경기 없는 날 "주요 뉴스로 ↓"가 가리키는 같은 페이지 앵커 */
  newsHref?: string;
  /**
   * 제목 변형 — `today`(홈 "오늘의 5줄") · `issue`(날짜 아카이브 "이날의 5줄" — 지난 호에서 날짜를 단정하지 않는다, 2026-10-23 사용자
   * 결정 · DECISIONS D0 #36 "이 호에는"과 같은 원칙). S4 문구("오늘은/이날은 5줄을 쉽니다")와 피드로 가는 링크 이름(그 페이지 피드 머리 —
   * 홈 "주요 뉴스" · 아카이브 "뉴스")도 함께 바뀐다. 부제 "(현지) 경기 기준"은 같다
   */
  variant?: "today" | "issue";
  /**
   * 홈 A매치 섹션(M3-13) 앵커 — A매치 휴식기 변형의 "A매치 섹션으로 ↓". 그 섹션을 그린 페이지만 준다(없으면 링크 없음 — 빈 앵커 금지)
   */
  nationalHref?: string;
  /** A매치 휴식기 변형에서 "끝남"을 가르는 기준 시각 — 기본 빌드 시각(홈 A매치 섹션과 같은 기준). 견본·테스트가 고정한다 */
  now?: Date;
}

/**
 * 변형별 글자. `countComps` — S4 이유에 대회 수를 쓸지: 홈(오늘 호)은 지금 설정의 대회 수 그대로, 아카이브(지난 호)는 빼고 "전날 끝난 경기가
 * 없었습니다." — 지난 호의 사실을 지금 설정(`configs/competitions.json`)으로 바꿔 쓰지 않는다(CLAUDE §1-7, M1-34 리뷰)
 */
const VARIANT_TEXT = {
  today: {
    heading: "오늘의 5줄",
    rest: "오늘은",
    news: "주요 뉴스로",
    countComps: true,
  },
  issue: {
    heading: "이날의 5줄",
    rest: "이날은",
    news: "뉴스로",
    countComps: false,
  },
} as const;

type VariantText = (typeof VARIANT_TEXT)[keyof typeof VARIANT_TEXT];

export function TodayBrief({
  brief,
  headingAs = "h2",
  headingId = "brief-h",
  newsHref = "#news",
  variant = "today",
  nationalHref,
  now,
}: TodayBriefProps) {
  const view = buildBriefView(brief);
  const text = VARIANT_TEXT[variant];
  // 빈 날의 5줄 자리(S4 가족 — DECISIONS D3 #12). 아카이브는 지금 설정을 읽지 않는다(지난 호를 지금 설정으로 다시 쓰지 않는다)
  const rest: BriefEmptyState | null =
    view.mode === "empty"
      ? briefEmptyState({
          date: view.date,
          emptyReason: view.emptyReason ?? "no-matches",
          scope: variant,
          competitions: variant === "today" ? loadCompetitionsConfig() : [],
          nationalTeam: variant === "today" ? loadNationalTeamConfig() : null,
          nowMs: (now ?? new Date()).getTime(),
        })
      : null;
  if (rest?.kind === "pending") {
    // 경기는 있었지만 수집 때 결과를 받지 못한 날(D60) — S4("끝난 경기가 없었습니다")는 사실이 아니라 쓰지 않고, 비시즌 판정도 하지
    // 않는다(경기가 있었다). 5줄 자리 오류와 같은 상자에 사실만 — 원인을 단정하지 않는다
    return (
      <BriefNoticeSection
        headingAs={headingAs}
        headingId={headingId}
        text={text}
        mode="empty"
        emptyReason="results-pending"
        slot="brief-pending"
        body="경기 결과 집계가 늦어 브리핑을 만들지 못했어요. 뉴스는 아래에 그대로 있어요."
      />
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      data-brief-mode={view.mode}
      data-slot="today-brief"
      // 모든 줄이 결과면 블록 전체가 펼치는 단위('모두 보기' — 안의 줄 단위도 함께 펴진다)
      {...(view.allResults ? { "data-spoil": "tear" } : {})}
    >
      <SectionHead
        heading={text.heading}
        headingAs={headingAs}
        headingId={headingId}
        runningHead="STARTING FIVE"
      />
      <p className="mt-0.75 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
        {view.matchDate !== null && view.matchDateLabel !== null ? (
          // 경기일 = 발행일 − 1 = 브리핑 입력 창(UTC 하루 D−1)의 유럽 현지 경기일 — "(현지)"로 밝힌다(2026-10-19 사용자 결정)
          <span>
            <time dateTime={view.matchDate} className="normal-nums">
              {view.matchDateLabel}
            </time>
            (현지) 경기 기준
          </span>
        ) : (
          // 경기 없는 날 — 날짜를 단정하지 않는다(D30 #7). 같은 원칙으로 "(현지)"
          <span>전날(현지) 경기 기준</span>
        )}
        {view.shortCount !== null ? (
          <span className="font-extrabold text-ink">
            이날 <span className="tabular-nums">{view.shortCount}</span>줄
          </span>
        ) : null}
      </p>
      {rest ? (
        <BriefRest
          state={rest}
          newsHref={newsHref}
          nationalHref={nationalHref}
          text={text}
        />
      ) : (
        <>
          {view.allResults ? (
            <SpoilerVeil
              action="모두 보기"
              actionLabel={`${text.heading} 모두 보기`}
              className="mt-3"
            >
              {view.rows.length}줄 모두 경기 결과라 가렸어요.
            </SpoilerVeil>
          ) : null}
          <ol
            role="list"
            aria-label={`${view.rows.length}줄`}
            className="mt-3 border-t border-rule"
          >
            {view.rows.map((row) => (
              <BriefRow key={row.no} row={row} />
            ))}
          </ol>
        </>
      )}
      <div
        data-slot="brief-foot"
        className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-[12.5px] text-ink-2"
      >
        <p className="pt-3">
          데이터 <span className="whitespace-nowrap">football-data.org</span> ·{" "}
          <span className="whitespace-nowrap">API-Football</span>
        </p>
        <p className="flex flex-wrap gap-x-4.5">
          {view.hasAi ? (
            <Link href={aboutHref("ai")} className={TEXT_LINK}>
              AI 작성 안내
            </Link>
          ) : null}
          <a
            href={briefErrorIssueUrl(view.date)}
            target="_blank"
            rel="noopener"
            className={TEXT_LINK}
          >
            브리핑 오류 신고<span aria-hidden="true">↗</span>
            <span className="sr-only"> (새 창)</span>
          </a>
        </p>
      </div>
    </section>
  );
}

/** 5줄 한 행 — 등번호(장식) · 문장(+ AI 작성) · 인덱스 탭 */
function BriefRow({ row }: { row: BriefRowView }) {
  const comp = row.comp ? loadCompetitionLabels().get(row.comp) : undefined;
  return (
    <li
      data-slot="brief-row"
      data-ai={row.ai ? "true" : "false"}
      {...(row.result ? { "data-spoil": "tear" } : {})}
      className={cn(
        ROW_GRID,
        "-mr-edge border-b border-rule pt-3.25 pb-3.5 lg:mr-0 lg:pt-3.5 lg:pb-3.75",
      )}
    >
      <span
        aria-hidden="true"
        data-slot="brief-no"
        data-pagefind-ignore=""
        className="pt-0.5 font-numeric text-num-brief-no leading-[0.86] font-extrabold tracking-[-0.02em] text-brand-accent lining-nums tabular-nums"
      >
        {row.no}
      </span>
      <div className="min-w-0 self-center">
        <p
          data-slot="brief-text"
          // 결과 줄 — 가림이 켜지면 문장과 AI 라벨을 함께 접는다(펼치면 이 문장으로 포커스)
          {...(row.result
            ? { "data-spoil-value": "", "data-spoil-focus": "" }
            : {})}
          className="max-w-[46em] text-type-brief tracking-[-0.005em] text-pretty"
        >
          <BriefText parts={row.parts} />
          {row.ai ? (
            <>
              {/* 문장과 라벨 사이 낱말 경계 — 보이는 간격은 라벨 왼쪽 8px 그대로(폭 0 공백). 보조기술·복사·색인에서
                  "…꺾었다.AI 작성"으로 붙지 않게 한다(M1-32 리뷰) */}
              <span data-slot="ai-label-sep" className="text-[0px]">
                {" "}
              </span>
              <AiLabel className="ml-2" />
            </>
          ) : null}
        </p>
        {row.result ? <SpoilerFlap>{row.no}번 줄</SpoilerFlap> : null}
      </div>
      <span className="flex flex-col gap-0.5">
        {row.comp && comp ? (
          <IndexTab comp={row.comp} title={comp.name}>
            {comp.short}
          </IndexTab>
        ) : null}
      </span>
    </li>
  );
}

/** 문장 — 숫자만 Barlow 600 · 1.16em · 자간 0.01em(DESIGN §3.5). 문구는 고치지 않는다 */
function BriefText({ parts }: { parts: readonly BriefTextPart[] }) {
  return parts.map((part, index) =>
    part.num ? (
      <span
        key={index}
        className="font-numeric text-[1.16em] leading-none font-semibold tracking-[0.01em] whitespace-nowrap lining-nums tabular-nums"
      >
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}

/**
 * S4 가족(D30 #7 → D3 #11 — DESIGN §9.3 S4 행 · D3 "S4 가족", 혼합안 `docs/design/d3/concept-mix.html` `.s4`) — 블록을 두고 높이만 줄인다.
 * 공통 틀: 위아래 1px `--rule` · `[--gutter │ 1fr]` · 거터 '0'(--num-brief-no, 2px --brand-accent 윤곽, 속 비움 — 장식) +
 * "{오늘은·이날은} 5줄을 쉽니다" + **이유 블록**(이것만 바뀐다) + 링크. 이유는 파이프라인 규칙의 사실만(입력 경기 0 + 창 안에 결과를 기다리는
 * 경기도 없음 = 다루는 대회의 전날 종료 경기 없음 — scripts/lib/brief-file.ts `planBriefPublish` empty·`emptyReason` no-matches. 결과 지연
 * (results-pending — D60)은 S4 가족을 쓰지 않는다), 날짜는 단정하지 않는다. 원인 서술("리그가 쉰다")은 쓰지 않는다. 첫 로드 모션 0.
 */
function BriefRest({
  state,
  newsHref,
  nationalHref,
  text,
}: {
  state: Exclude<BriefEmptyState, { kind: "pending" }>;
  newsHref: string;
  nationalHref: string | undefined;
  text: VariantText;
}) {
  // 같은 페이지 앵커 — 일반 <a>(브라우저 기본 이동)
  // 화살표 앞 4px — 혼합안 `.tlink` gap(flex 항목 앞 공백은 접혀 사라진다)
  const link = cn(TEXT_LINK, "gap-1");
  const toNews = (
    <a href={newsHref} className={link}>
      {text.news}
      <span aria-hidden="true">↓</span>
    </a>
  );
  return (
    <div
      data-slot="brief-rest"
      data-rest={state.kind}
      className="mt-3 grid grid-cols-[var(--gutter)_minmax(0,1fr)] items-start gap-x-2.5 border-y border-rule pt-3 pb-0.5 lg:gap-x-3.5"
    >
      <span
        aria-hidden="true"
        className="font-numeric text-num-brief-no leading-[0.86] font-extrabold tracking-[-0.02em] text-transparent lining-nums tabular-nums [-webkit-text-stroke:2px_var(--brand-accent)]"
      >
        0
      </span>
      <div className="min-w-0">
        <p className="pt-0.5 text-type-brief leading-[1.4] font-extrabold">
          {text.rest} 5줄을 쉽니다
        </p>
        {state.kind === "off-season" ? (
          <BriefOffSeason feature={state.feature} />
        ) : (
          <BriefRestWhy text={text} />
        )}
        {state.kind === "international" ? (
          <BriefInternational window={state.window} matches={state.matches} />
        ) : null}
        <p className="mt-0.5 flex flex-wrap gap-x-4.5">
          {state.kind === "international" && nationalHref ? (
            <a href={nationalHref} className={link}>
              A매치 섹션으로<span aria-hidden="true">↓</span>
            </a>
          ) : null}
          {toNews}
        </p>
      </div>
    </div>
  );
}

/** S4 이유 1줄 — 홈은 지금 설정의 대회 수, 아카이브는 대회 수 없이(VARIANT_TEXT `countComps`) */
function BriefRestWhy({ text }: { text: VariantText }) {
  const comps = text.countComps ? loadCompetitionsConfig().length : 0;
  return (
    <p className="mt-0.5 text-sm leading-[1.55] text-ink-2">
      {comps > 0
        ? `전날 ${comps}개 대회에 끝난 경기가 없었습니다.`
        : "전날 끝난 경기가 없었습니다."}
    </p>
  );
}

/** "11.10"(KST 날짜 "YYYY-MM-DD" → 월.일) */
const monthDot = (date: string) => date.slice(5).replace("-", ".");
/** "11월 10일"(화면 밖 — 요일 없이) */
const monthDayKo = (date: string) =>
  `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/**
 * S4 가족 ② A매치 휴식기(D3 #12 — 홈만, 판정 src/lib/brief-empty.ts): 1px dotted `--ink-3`(위 12px) → 도장 "A매치 기간" + 기간
 * `MM.DD – MM.DD`(Barlow 600 15px) → 경기 목록(2열 · 1024 이상 열 220px · 간격 32px): 날짜 `--num-n2` 실선 · "(요일) HH:MM KST" 12.5px ·
 * 상대 15px 800 · 홈/원정 · 대회 12.5px `--ink-2`. 킥오프가 지난 경기는 날짜 `--ink-2` + "끝남" — **스코어 없음**(결과 노출 0 — 화면 모델에
 * 결과 필드가 없다). 시각 미정(`kickoffTbd`)이면 "시각 미정". 장소 · 소집 선수 · 결과는 바로 아래 홈 A매치 섹션(M3-13)이 맡는다.
 */
function BriefInternational({
  window,
  matches,
}: {
  window: { from: string; to: string };
  matches: readonly BriefRestMatch[];
}) {
  return (
    <div
      data-slot="brief-intl"
      className="mt-3 border-t border-dotted border-ink-3 pt-3"
    >
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StampChip>A매치 기간</StampChip>
        <span
          aria-hidden="true"
          className="font-numeric text-[15px] leading-none font-semibold tracking-[0.02em] lining-nums tabular-nums"
        >
          {monthDot(window.from)} – {monthDot(window.to)}
        </span>
        <span className="sr-only">
          {monthDayKo(window.from)}부터 {monthDayKo(window.to)}까지
        </span>
      </p>
      <ol
        role="list"
        aria-label="A매치 기간 경기 — 킥오프 순"
        className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-[repeat(2,minmax(0,220px))] lg:gap-x-8"
      >
        {matches.map((m) => (
          <li
            key={m.id}
            data-slot="brief-intl-match"
            data-past={m.past ? "true" : "false"}
            className="min-w-0"
          >
            <time dateTime={m.kickoff}>
              <span
                aria-hidden="true"
                className={cn(
                  "block font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] lining-nums tabular-nums",
                  m.past ? "text-ink-2" : "text-ink",
                )}
              >
                {m.date}
              </span>
              <span className="sr-only">{m.dateLabel}</span>
            </time>
            <p className="mt-2.5 text-[12.5px] text-ink-2">
              ({m.weekday}){" "}
              {m.time !== null ? (
                <>
                  <span className="font-numeric text-sm leading-none font-semibold text-ink lining-nums tabular-nums">
                    {m.time}
                  </span>{" "}
                  KST
                </>
              ) : (
                "시각 미정"
              )}
              {m.past ? (
                <>
                  {" · "}
                  <span className="font-extrabold text-ink">끝남</span>
                </>
              ) : null}
            </p>
            <p className="mt-0.75 text-[15px] leading-[1.35] font-extrabold">
              {m.opponent}
            </p>
            <p className="text-[12.5px] text-ink-2">
              {m.home ? "홈" : "원정"} · {m.competition}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 비시즌 빈 상태 문구 — 날짜 옆 낱말 · 안내(UI 안내 — 경기·선수 사실 없음) */
const OFF_SEASON_TEXT = {
  ended: {
    label: "종료",
    note: "시즌이 끝났어요. 다음 시즌 일정이 나오면 이 자리에 다시 채워집니다.",
  },
  upcoming: {
    label: "개막",
    note: "아직 시즌 전이에요. 경기가 열리면 이 자리에 5줄이 채워집니다.",
  },
} as const;

/**
 * S4 가족 ③ 비시즌(M1-37 → D3 #11 — 홈만) — **모든 대회가 시즌 밖인 날**(src/lib/rest-period.ts `offSeasonFeature`). 대회 하나: 개막 전인
 * 대회가 있으면 가장 먼저 개막하는 대회(개막일), 모두 끝났으면 가장 늦게 끝난 대회(종료일) — 날짜는 `configs/competitions.json` 값 그대로
 * (만들어 내지 않는다). 평탄 탭 + "{대회} 2026-27 시즌" 14px 800 → 날짜 `MM.DD` `--num-n2` 실선 + 낱말("개막" · "종료") 15px 800 / 연도
 * Barlow 600 14px `--ink-2` → 안내 15px 800.
 */
function BriefOffSeason({ feature }: { feature: OffSeasonFeature }) {
  const { comp, phase, date } = feature;
  const copy = OFF_SEASON_TEXT[phase];
  return (
    <div data-slot="brief-off-season" data-phase={phase}>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-extrabold">
        <FlatTab comp={comp.id} title={comp.nameKo}>
          {comp.shortKo}
        </FlatTab>
        <span>
          {comp.nameKo} {seasonLabel(comp.season)}
        </span>
      </p>
      <p className="mt-3 flex items-end gap-3">
        <time dateTime={date}>
          <span
            aria-hidden="true"
            className="block font-numeric text-num-n2 leading-[0.84] font-extrabold tracking-[-0.02em] text-ink lining-nums tabular-nums"
          >
            {monthDot(date)}
          </span>
          <span className="sr-only">
            {formatKst(kstDayRangeUtc(date).start, "fullDate")}{" "}
          </span>
        </time>
        <span className="grid gap-1 pb-px text-[15px] leading-normal font-extrabold">
          {copy.label}
          <span
            aria-hidden="true"
            className="font-numeric text-sm leading-none font-semibold tracking-[0.02em] text-ink-2 lining-nums tabular-nums"
          >
            {date.slice(0, 4)}
          </span>
        </span>
      </p>
      <p className="mt-3 max-w-[34em] text-[15px] leading-normal font-extrabold">
        {copy.note}
      </p>
    </div>
  );
}

/**
 * 5줄 자리 오류 상태(M1-37 — DESIGN §9.3 상태 화면 ③ 오류 상자, M1-32 이월) — 브리핑 파일이 없는데 그 호를 게시한 실행 기록이 있는 호
 * (src/lib/brief-slot.ts `missing`). 섹션 머리(오늘의 5줄 · 이날의 5줄) + `--paper-2` 면 · 1px `--ink` 상자: "{오늘은·이날은} 5줄을 싣지
 * 못했어요"(15px 800) + 안내(13.5px `--ink-2`). 원인은 실행 기록에 없어 쓰지 않는다(CLAUDE §1-7) — 뉴스는 그대로 실렸다는 사실만.
 * 하단(데이터 출처·AI 안내·오류 신고)은 싣지 않는다 — 보이는 브리핑 데이터가 없다.
 */
export function BriefMissing({
  headingAs = "h2",
  headingId = "brief-h",
  variant = "today",
}: Pick<TodayBriefProps, "headingAs" | "headingId" | "variant">) {
  return (
    <BriefNoticeSection
      headingAs={headingAs}
      headingId={headingId}
      text={VARIANT_TEXT[variant]}
      mode="missing"
      slot="brief-missing"
      body="이 호를 발행할 때 브리핑을 만들지 못했어요. 뉴스는 아래에 그대로 있어요."
    />
  );
}

/**
 * 5줄을 싣지 못한 호의 안내 섹션 — 5줄 자리 오류(`BriefMissing`, M1-37)와 결과 지연(D60 — `TodayBrief`의 empty + results-pending)이
 * 같은 모양을 쓴다(DESIGN §9.3 상태 화면 ③ 오류 상자 — 새 모티프 없음): 섹션 머리 + `--paper-2` 면 · 1px `--ink` 상자, 제목
 * "{오늘은·이날은} 5줄을 싣지 못했어요"(15px 800) + 안내(13.5px `--ink-2`). 부제·하단은 싣지 않는다.
 */
function BriefNoticeSection({
  headingAs = "h2",
  headingId = "brief-h",
  text,
  mode,
  emptyReason,
  slot,
  body,
}: Pick<TodayBriefProps, "headingAs" | "headingId"> & {
  text: VariantText;
  /** 섹션 `data-brief-mode` — 파일 없음은 missing, 결과 지연은 파일의 mode(empty) */
  mode: "missing" | "empty";
  /** 섹션 `data-empty-reason`(결과 지연만) */
  emptyReason?: "results-pending";
  slot: "brief-missing" | "brief-pending";
  body: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-brief-mode={mode}
      data-empty-reason={emptyReason}
      data-slot="today-brief"
    >
      <SectionHead
        heading={text.heading}
        headingAs={headingAs}
        headingId={headingId}
        runningHead="STARTING FIVE"
      />
      <div
        data-slot={slot}
        className="mt-3 border border-ink bg-paper-2 px-3.5 py-3"
      >
        <p className="text-[15px] font-extrabold">
          {text.rest} 5줄을 싣지 못했어요
        </p>
        <p className="mt-1 text-[13.5px] text-ink-2">{body}</p>
      </div>
    </section>
  );
}
