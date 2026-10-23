import Link from "next/link";

import { AiLabel } from "@/components/ui/ai-label";
import { ROW_GRID } from "@/components/ui/card";
import { IndexTab } from "@/components/ui/chip";
import { SectionHead } from "@/components/ui/section-head";
import { aboutHref } from "@/lib/about-sections";
import {
  buildBriefView,
  type BriefInput,
  type BriefRowView,
  type BriefTextPart,
} from "@/lib/brief-view";
import { loadCompetitionLabels } from "@/lib/data/card-labels";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { briefErrorIssueUrl } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * 오늘의 5줄 — 홈 최상단 데이터 브리핑 블록 (PRD §4.2·D2, FR-22~29·FR-35·FR-36, D24·D30·D45·D58, DESIGN.md §9.3 오늘의 5줄 행 ·
 * AI 작성 라벨 · S4 · §3.5, 혼합안 `concept-mix.html` `.sf`, plan M1-32)
 *
 * ```
 * section
 *   섹션 머리 "오늘의 5줄" + STARTING FIVE · 부제 "{M월 D일}(현지) 경기 기준"(+ "이날 N줄")
 *   ol(N줄) › li 행 [--gutter 등번호 │ 문장 + "AI 작성" │ --tab-w 인덱스 탭]     ← mode llm·mixed·template
 *   S4 [--gutter '0' 윤곽 │ "오늘은 5줄을 쉽니다" + 이유 + 주요 뉴스로 ↓]          ← mode empty(D30 — 블록을 두고 높이만 줄인다)
 *   하단: 데이터 football-data.org · API-Football │ AI 작성 안내 · 브리핑 오류 신고↗
 * ```
 * - 행 격자·여백은 카드와 같은 `ROW_GRID`(--gutter · 1fr · --tab-w, 열 간격 10/14px), 위아래 13·14px(≥1024 14·15px). 1023 이하는
 *   오른쪽으로 --edge만큼 넘쳐 인덱스 탭이 화면 가장자리에 붙는다(카드 `bleed`와 같다).
 * - 등번호는 장식(`aria-hidden`) — 목록 의미(`<ol>`)가 순서를 전한다. Safari가 `list-style: none` 목록의 의미를 지우지 않게 `role="list"`.
 * - "AI 작성" 라벨은 `ai:true` 줄 전부, 템플릿 줄(`ai:false`)은 없음(FR-35). 템플릿 줄도 같은 문장 행이다(D45 ④ — 화면 모델 머리 주석).
 * - 하단 "AI 작성 안내"는 AI 줄이 있는 날만(혼합안 S3·S4), "브리핑 오류 신고"는 발행 날짜를 채운 이슈 양식(FR-36)이다.
 * - 서버 컴포넌트 — JS 0. 결과 가림(M4-15)은 이 블록에 아직 없다.
 */

/** 텍스트 링크 — 레드 800 13px, 밑줄 1px(4px 띄움) → hover 2px, 최소 44px(DESIGN §9.2 텍스트 링크, 혼합안 `.tlink` — 사이 간격 없음) */
const TEXT_LINK =
  "inline-flex min-h-11 items-center text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

export interface TodayBriefProps {
  /** 그 호의 브리핑 파일(`data/briefs/{발행일}.json`) — 파일이 없는 호는 부르는 쪽이 블록을 싣지 않는다 */
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
}

/** 변형별 글자 */
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
}: TodayBriefProps) {
  const view = buildBriefView(brief);
  const text = VARIANT_TEXT[variant];
  const empty = view.mode === "empty";
  return (
    <section
      aria-labelledby={headingId}
      data-brief-mode={view.mode}
      data-slot="today-brief"
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
      {empty ? (
        <BriefRest newsHref={newsHref} text={text} />
      ) : (
        <ol
          role="list"
          aria-label={`${view.rows.length}줄`}
          className="mt-3 border-t border-rule"
        >
          {view.rows.map((row) => (
            <BriefRow key={row.no} row={row} />
          ))}
        </ol>
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
      className={cn(
        ROW_GRID,
        "-mr-edge border-b border-rule pt-3.25 pb-3.5 lg:mr-0 lg:pt-3.5 lg:pb-3.75",
      )}
    >
      <span
        aria-hidden="true"
        data-slot="brief-no"
        className="pt-0.5 font-numeric text-num-brief-no leading-[0.86] font-extrabold tracking-[-0.02em] text-brand-accent lining-nums tabular-nums"
      >
        {row.no}
      </span>
      <div className="min-w-0 self-center">
        <p
          data-slot="brief-text"
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
 * S4 경기 없는 날 — 블록을 두고 높이만 줄인다(D30 #7, DESIGN §9.3): 거터 '0'(--num-brief-no, 2px --brand-accent 윤곽, 속 비움 —
 * 장식) + "오늘은 5줄을 쉽니다" + 이유 1줄 + "주요 뉴스로 ↓". 이유는 파이프라인 규칙의 사실만(입력 경기 0 = 다루는 대회의 전날 종료
 * 경기 없음 — scripts/lib/brief-file.ts `planBriefPublish` empty), 날짜는 쓰지 않는다.
 */
function BriefRest({
  newsHref,
  text,
}: {
  newsHref: string;
  text: VariantText;
}) {
  const comps = loadCompetitionsConfig().length;
  return (
    <div
      data-slot="brief-rest"
      className="mt-3 grid grid-cols-[var(--gutter)_minmax(0,1fr)] items-start gap-x-2.5 border-y border-rule pt-3 pb-0.5 lg:gap-x-3.5"
    >
      <span
        aria-hidden="true"
        className="font-numeric text-num-brief-no leading-[0.86] font-extrabold text-transparent lining-nums tabular-nums [-webkit-text-stroke:2px_var(--brand-accent)]"
      >
        0
      </span>
      <div className="min-w-0">
        <p className="pt-0.5 text-type-brief leading-[1.4] font-extrabold">
          {text.rest} 5줄을 쉽니다
        </p>
        <p className="mt-0.5 text-sm leading-[1.55] text-ink-2">
          {text.countComps && comps > 0
            ? `전날 ${comps}개 대회에 끝난 경기가 없었습니다.`
            : "전날 끝난 경기가 없었습니다."}
        </p>
        {/* 같은 페이지 앵커 — 일반 <a>(브라우저 기본 이동) */}
        <a href={newsHref} className={cn(TEXT_LINK, "mt-0.5")}>
          {text.news}
          <span aria-hidden="true">{" ↓"}</span>
        </a>
      </div>
    </div>
  );
}
