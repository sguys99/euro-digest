import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AboutToc } from "@/components/about/about-toc";
import { Leader } from "@/components/about/leader";
import { OutletList } from "@/components/about/outlet-list";
import { ScheduleTable } from "@/components/about/schedule-table";
import { TermList } from "@/components/about/term-list";
import { AppShell } from "@/components/shell/app-shell";
import { FlatTab } from "@/components/ui/chip";
import { SectionHead } from "@/components/ui/section-head";
import { TierBadge } from "@/components/ui/tier-badge";
import {
  issueDateLabel,
  SEASON_LABEL,
  outletCountByTier,
  outletsFrom,
  publishSchedule,
  winterDelayMinutes,
  type Outlet,
} from "@/lib/about";
import { ABOUT_SECTIONS, type AboutSectionId } from "@/lib/about-sections";
import { loadSourcesConfig } from "@/lib/data/about";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadLatestIssue } from "@/lib/data/issue";
import { issueFormUrl } from "@/lib/paths";
import type { Tier } from "@/lib/schema/common";
import {
  CONTACT_EMAIL,
  FIRST_ISSUE_DATE,
  FOOTBALL_DATA_ATTRIBUTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";
import { kstDate, nowUtcIso } from "@/lib/time";

/*
 * `/about/` 소개·정책 (PRD FR-140 · §4 IA, plan M1-36) — 서비스 소개 · 발행 시각 · 출처·저작권 정책 · 출처 Tier · AI 작성 고지 ·
 * 데이터 출처 · 삭제·정정 요청 연락처.
 *
 * 문구는 PRD·설정·코드에 근거가 있는 사실만 쓴다(CLAUDE §1-7). 바뀌는 사실은 빌드 때 계산한다:
 * - 발행 시각·계절 기간 = src/lib/about.ts(`publishSchedule` — time.ts의 D26 규칙), 기준일은 최신 호 날짜(없으면 빌드 날짜, KST)
 * - 매체·Tier = configs/sources.json(일일 수집 대상만 — `outletsFrom`), 대회 = configs/competitions.json
 * - 연락처·필수 문구·태그라인·창간일 = src/lib/site.ts, 이슈 양식 링크 = src/lib/paths.ts `issueFormUrl`
 *
 * 지면(D0 시안에 없는 화면 — 새 디자인 언어 없이 기존 문법으로): 섹션 머리 + 러닝 헤드로 절을 나누고, 줄은 괘선 사이의 한 줄
 * (항목 목록·매체 목록·시각표), 이름과 값은 리더 점선으로 잇는다. 큰 숫자는 발행 시각과 처리 기한(72시간)만.
 * 1024 이상은 앱 셸 목차 열에 차례(sticky), 1023 이하는 소개 아래 2열 차례. 절 앵커는 `ABOUT_SECTIONS`(뒤표지·"AI 작성" 라벨이 가리킴).
 * 서버 컴포넌트 — JS 0(앱 셸의 테마 토글·토스트 섬만).
 */

export const metadata: Metadata = {
  title: "소개",
  description:
    "유로 다이제스트의 발행 시각, 출처·저작권 정책, 출처 Tier, AI 작성 고지, 데이터 출처, 삭제·정정 요청 연락처.",
};

const INTRO_HEADING_ID = "about-h";

/** 본문 문단 — 16px, 62ch(뒤표지 설명 문단과 같은 줄 길이) */
const BODY = "mt-3 max-w-[62ch] leading-[1.6]";
/** 보조 설명 — 13px `--ink-2`(섹션 부제·필터 설명 크기) */
const NOTE = "mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-ink-2";
/** 절 첫 문단 — 오늘의 5줄 문장 크기(--text-brief) */
const LEAD = "mt-4 max-w-[62ch] text-type-brief";
/** 본문 안 텍스트 링크 — 레드 800, 밑줄 1px(4px 띄움) → hover 2px(DESIGN §9.2 텍스트 링크, 문장 안이라 44px 높이 없이) */
const INLINE_LINK =
  "font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";
/** 줄 끝 텍스트 링크 — 누르는 높이 44px(DESIGN §9.1 텍스트 링크 최소 44px) */
const ROW_LINK = `${INLINE_LINK} inline-flex min-h-11 items-center`;
/** 외부 링크 표식 ↗ + 화면 밖 "(새 창)" */
function NewWindow() {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (새 창)</span>
    </>
  );
}

const TIER_CRITERIA: Readonly<Record<Tier, string>> = {
  1: "구단·리그 공식 발표, 신뢰도가 가장 높은 기자",
  2: "주요 매체, 주요 이적 기자",
  3: "기사를 모으거나 다른 보도를 인용하는 매체",
};

const TIERS: readonly Tier[] = [1, 2, 3];

export default function AboutPage() {
  const { issue } = loadLatestIssue();
  const outlets = outletsFrom(loadSourcesConfig());
  const overseas = outlets.filter((o) => o.region === "overseas");
  const domestic = outlets.filter((o) => o.region === "domestic");
  const tierCounts = outletCountByTier(outlets);
  const competitions = loadCompetitionsConfig();
  // 기준 발행일 — 최신 호(마스트헤드와 같은 날). 호가 없으면(발행 전·CI 빈 data) 빌드 시각의 KST 날짜
  const schedule = publishSchedule(issue?.date ?? kstDate(nowUtcIso()));
  const { current, next } = schedule;

  return (
    <AppShell
      issue={issue}
      contents={<AboutToc variant="contents" />}
      contentsLabel="소개 차례"
    >
      {/* ── 머리: 소개 ─────────────────────────────────────────────── */}
      <section aria-labelledby={INTRO_HEADING_ID}>
        <SectionHead
          heading="소개"
          headingAs="h1"
          headingId={INTRO_HEADING_ID}
          runningHead="ABOUT"
        />
        <p className="mt-5 max-w-[22em] text-type-h2 font-extrabold tracking-[-0.03em] text-balance lg:mt-6 lg:text-type-lead">
          {SITE_TAGLINE}
        </p>
        <p className={LEAD}>
          {SITE_NAME}는 밤사이 유럽 축구 소식을 매일 아침 한 호로 묶어 내는 웹
          서비스입니다. 전날 경기는 한국어 브리핑 ‘오늘의 5줄’로 정리하고, 해외
          매체의 소식은 원제목 그대로 같은 사건끼리 묶어 한국어 태그로 분류한 뒤
          원문으로 안내합니다.
        </p>
        {competitions.length > 0 ? (
          <div className="mt-6 lg:mt-7">
            <p
              id="about-comps"
              className="text-[12px] font-extrabold text-ink-2"
            >
              다루는 대회
            </p>
            <ul
              role="list"
              aria-labelledby="about-comps"
              className="mt-2 flex flex-wrap gap-x-4 gap-y-2"
            >
              {competitions.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5 text-sm">
                  <FlatTab comp={c.id} title={c.nameKo}>
                    {c.shortKo}
                  </FlatTab>
                  {/* 약칭이 곧 이름이면(라리가·세리에A·리그1) 이름을 되풀이하지 않는다 — 화면 밖에도(스크린리더 "라리가 라리가" 방지) */}
                  {sameName(c.shortKo, c.nameKo) ? null : (
                    <span>{c.nameKo}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[13px] text-ink-2">
              카드 오른쪽 가장자리의 색 탭이 대회를 나타냅니다.
            </p>
          </div>
        ) : null}
      </section>

      {/* 1023 이하 차례(1024 이상은 왼쪽 목차 열) */}
      <nav aria-label="소개 차례" className="mt-9 lg:hidden">
        <AboutToc variant="inline" />
      </nav>

      {/* ── 01 발행 시각 ─────────────────────────────────────────────── */}
      <AboutSection id="schedule">
        <p className={LEAD}>
          매일 아침 한 호를 냅니다. 발행 시각은 유럽의 서머타임에 맞춰 바뀝니다.
        </p>
        <div className="mt-5 max-w-[62ch]">
          <ScheduleTable schedule={schedule} />
        </div>
        <p className={BODY}>
          지금은 {SEASON_LABEL[current.season]}이라 매일{" "}
          <Num>{current.publish}</Num> KST에 발행합니다.{" "}
          <time dateTime={next.from}>
            {issueDateLabel(next.from, schedule.date)}
          </time>{" "}
          호부터는 <Num>{next.publish}</Num> KST입니다.
        </p>
        <p className={NOTE}>
          유럽 표준시 기간에는 늦게 시작한 유럽 경기가 한국 시각 아침 7시 무렵에
          끝납니다. 그 경기까지 담으려고 {winterDelayMinutes()}분 늦게 냅니다.
          그날의 실제 발행·업데이트 시각은 페이지 맨 위에 적습니다.
        </p>
        <p className={NOTE}>
          맨 위의 ‘제 N호’는{" "}
          <time dateTime={FIRST_ISSUE_DATE}>
            {issueDateLabel(FIRST_ISSUE_DATE)}
          </time>{" "}
          제 1호부터 하루에 하나씩 늘어납니다. 발행하지 못한 날이 있어도
          날짜만큼 셉니다.
        </p>
      </AboutSection>

      {/* ── 02 출처·저작권 정책 ───────────────────────────────────────── */}
      <AboutSection id="sources">
        <p className={LEAD}>
          기사를 다시 쓰지 않습니다. 매체가 공개한 제목과 링크로 원문을
          안내합니다.
        </p>
        <TermList
          className="mt-5"
          items={[
            {
              term: "본문",
              description:
                "기사 본문은 가져오지 않습니다. 카드에는 매체가 피드로 공개한 제목과 원문 링크만 싣습니다.",
            },
            {
              term: "해외 기사",
              description:
                "피드의 원제목을 그대로 싣습니다. 번역하거나 요약하거나 고쳐 쓰지 않습니다.",
            },
            {
              term: "국내 기사",
              description: "한국어 원문 제목을 그대로 싣습니다.",
            },
            {
              term: "출처 표시",
              description:
                "모든 카드에 매체 이름과 원문 링크를 붙입니다. 여러 매체가 같은 소식을 보도하면 한 카드로 묶고 출처를 모두 링크합니다.",
            },
            {
              term: "이미지",
              description:
                "기사 이미지, 매체·구단·리그 로고, 선수 사진을 쓰지 않습니다. 매체 이름은 글자로만 적습니다.",
            },
            {
              term: "수집 대상",
              description: "이용 약관을 확인한 매체만 수집합니다.",
            },
            {
              term: "삭제·정정",
              description: (
                <>
                  요청을 받으면 72시간 안에 처리합니다.{" "}
                  {/* 같은 페이지 앵커는 일반 <a>(:target이 걸린다 — 차례와 같은 이유) */}
                  <a href="#contact" className={INLINE_LINK}>
                    요청 방법
                  </a>
                </>
              ),
            },
          ]}
        />

        <h3 className="mt-10 flex items-baseline gap-2 text-base font-extrabold lg:mt-12 lg:text-[17px]">
          지금 싣는 매체
          <span className="font-numeric text-[17px] font-semibold text-ink-2 lining-nums tabular-nums">
            {outlets.length}
          </span>
          <span className="sr-only">곳</span>
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">
          사이트를 발행할 때 수집 설정에서 이 목록을 만듭니다. 배지는 매체의
          출처 Tier입니다.
        </p>
        <div className="mt-4 grid gap-y-7 lg:grid-cols-2 lg:gap-x-8">
          {overseas.length > 0 ? (
            <OutletGroup
              title="해외 매체"
              caption="원제목 그대로"
              outlets={overseas}
              showLang
            />
          ) : null}
          {domestic.length > 0 ? (
            <OutletGroup
              title="국내 매체"
              caption="한국어 원문 제목"
              outlets={domestic}
              showLang={false}
            />
          ) : null}
        </div>
      </AboutSection>

      {/* ── 03 출처 Tier ─────────────────────────────────────────────── */}
      <AboutSection id="tier">
        <p className={LEAD}>
          출처 Tier는 소식을 낸 매체의 신뢰도 등급입니다. 1이 가장 높고,
          매체마다 정해 둡니다.
        </p>
        <ul role="list" className="mt-5 max-w-[62ch] border-t border-rule">
          {TIERS.map((tier) => (
            <li
              key={tier}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-3 lg:grid-cols-[5rem_minmax(0,1fr)_auto] lg:gap-x-5"
            >
              <span>
                <TierBadge tier={tier} />
              </span>
              <span className="leading-[1.45]">{TIER_CRITERIA[tier]}</span>
              <span className="text-right text-[13px] whitespace-nowrap text-ink-2">
                <span className="sr-only">지금 싣는 매체 </span>
                <span className="font-numeric text-[17px] font-semibold text-ink lining-nums tabular-nums">
                  {tierCounts[tier]}
                </span>
                곳
              </span>
            </li>
          ))}
        </ul>
        <p className={BODY}>
          이적 소식 카드의 이적 단계 옆 배지는 그 소식을 보도한 매체 가운데 가장
          높은 등급입니다. 기사 안에서 인용한 다른 기자나 매체는 등급에 넣지
          않습니다.
        </p>
        <p className={BODY}>
          이적 단계를 올릴 때도 등급을 봅니다. ‘합의’와 ‘결렬’은 Tier 2 이상
          매체가 보도했거나 서로 다른 매체 두 곳이 보도했을 때만 붙입니다.
          ‘공식’은 구단 발표 같은 명시적인 표현을 Tier 2 이상 매체가 전했거나,
          서로 다른 매체 두 곳이 공식이라고 할 때만 붙입니다.
        </p>
      </AboutSection>

      {/* ── 04 AI 작성 고지 ──────────────────────────────────────────── */}
      <AboutSection id="ai">
        <p className={LEAD}>
          AI는 홈 맨 위 ‘오늘의 5줄’의 문장을 쓰는 데만 씁니다. 뉴스 카드에는
          AI를 쓰지 않습니다.
        </p>
        <TermList
          className="mt-5"
          items={[
            {
              term: "입력",
              description: (
                <>
                  전날 열린 경기의 결과와 득점자, 대회 순위 같은 경기 데이터만
                  넣습니다(<Brand>football-data.org</Brand> ·{" "}
                  <Brand>API-Football</Brand>). 기사 제목이나 내용은 넣지
                  않습니다.
                </>
              ),
            },
            {
              term: "라벨",
              description: (
                <>
                  AI가 쓴 줄 끝에만 <AiLabelSample /> 라벨을 붙입니다.
                </>
              ),
            },
            {
              term: "검증",
              description:
                "문장 속 점수·이름·순위 표현을 코드가 입력 데이터와 맞춰 봅니다. 맞지 않는 줄은 코드가 정해진 문형으로 만든 문장으로 바꾸거나 빼고, 바꾼 줄에는 라벨을 붙이지 않습니다.",
            },
            {
              term: "코드 문장",
              description:
                "AI의 답 전체가 검증을 통과하지 못하면 한 번 다시 요청합니다. 그래도 통과하지 못하거나, 발행 전 마감까지 답을 받지 못하거나, 비용 상한을 넘을 것 같으면 모든 줄을 코드가 만든 문장으로 라벨 없이 싣습니다.",
            },
            {
              term: "이름 표기",
              description:
                "AI는 팀·선수 이름을 영문으로 쓰고, 한글 표기는 코드가 표기 사전으로 바꿉니다.",
            },
            {
              term: "경기 없는 날",
              description: "전날 경기가 없으면 AI를 부르지 않습니다.",
            },
            {
              term: "뉴스 카드",
              description:
                "제목은 매체 원문 그대로이고, 분류·태그는 제목과 피드 정보에 정해 둔 코드 규칙을 적용해 붙입니다.",
            },
          ]}
        />
      </AboutSection>

      {/* ── 05 데이터 출처 ───────────────────────────────────────────── */}
      <AboutSection id="data">
        <p
          lang="en"
          className="mt-5 max-w-[62ch] font-latin text-type-card-latin font-semibold tracking-[0.01em]"
        >
          {FOOTBALL_DATA_ATTRIBUTION}
        </p>
        <ul role="list" className="mt-5 max-w-[62ch] border-t border-rule">
          <DataRow
            what="경기 결과·순위"
            name="football-data.org"
            href="https://www.football-data.org/"
          />
          <DataRow
            what="경기별 득점자·도움"
            name="API-Football"
            href="https://www.api-football.com/"
          />
        </ul>
        <p className={NOTE}>
          두 서비스에서 받은 경기 데이터로 오늘의 5줄을 만듭니다.
        </p>
      </AboutSection>

      {/* ── 06 삭제·정정 요청 ────────────────────────────────────────── */}
      <AboutSection id="contact">
        <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 lg:gap-x-6">
          {/* 큰 숫자는 장식 — 옆 문장이 같은 기한을 말한다 */}
          <p aria-hidden="true" className="flex items-baseline gap-1">
            <span className="font-numeric text-num-score leading-none font-extrabold tracking-[0.02em] text-brand-accent lining-nums tabular-nums">
              72
            </span>
            <span className="text-sm font-extrabold">시간</span>
          </p>
          <p className="max-w-[46ch] text-type-brief">
            카드 삭제·정정 요청은 접수 후 72시간 안에 처리합니다.
          </p>
        </div>
        <p className={BODY}>
          요청받은 카드는 사이트에서 내리고, 다음 수집 때 사이트 데이터
          원본에서도 지웁니다. 다만 공개 저장소의 git 이력에는 남을 수 있습니다.
        </p>
        <ul role="list" className="mt-5 max-w-[62ch] border-t border-rule">
          <ContactRow
            what="이메일"
            note="비공개 연락이나 신원 확인이 필요할 때"
          >
            <a href={`mailto:${CONTACT_EMAIL}`} className={ROW_LINK}>
              {CONTACT_EMAIL}
            </a>
          </ContactRow>
          <ContactRow what="GitHub 이슈" note="공개 이슈로 접수됩니다">
            <a
              href={issueFormUrl("takedown.yml")}
              target="_blank"
              rel="noopener"
              className={ROW_LINK}
            >
              삭제·정정 요청 양식
              <NewWindow />
            </a>
          </ContactRow>
          <ContactRow what="오류 신고" note="브리핑 문장·분류 태그 오류">
            <a
              href={issueFormUrl("summary-error.yml")}
              target="_blank"
              rel="noopener"
              className={ROW_LINK}
            >
              브리핑·분류 오류 신고 양식
              <NewWindow />
            </a>
          </ContactRow>
        </ul>
      </AboutSection>
    </AppShell>
  );
}

// ─── 절 · 행 ────────────────────────────────────────────────────────────

/**
 * 절 — 섹션 머리(h2 + 러닝 헤드) + 내용. 앵커로 도착하면(`:target`) 머리 위 3px 괘선이 레드로 바뀐다(현재 탭 막대와 같은 레드 —
 * 색 면 전환 base). 앞에 고정 요소가 없어 위 여백 16px만 남기고 멈춘다(scroll-margin).
 */
function AboutSection({
  id,
  children,
}: {
  id: AboutSectionId;
  children: ReactNode;
}) {
  const section = ABOUT_SECTIONS.find((s) => s.id === id);
  if (!section) return null;
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="group/sec mt-12 scroll-mt-4 lg:mt-16"
    >
      <SectionHead
        heading={section.title}
        headingId={headingId}
        runningHead={section.runningHead}
        className="group-target/sec:border-brand-accent"
      />
      {children}
    </section>
  );
}

function OutletGroup({
  title,
  caption,
  outlets,
  showLang,
}: {
  title: string;
  caption: string;
  outlets: readonly Outlet[];
  showLang: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h4 className="text-sm font-extrabold">{title}</h4>
        <p className="text-[12.5px] text-ink-2">{caption}</p>
      </div>
      <OutletList outlets={outlets} showLang={showLang} />
    </div>
  );
}

/** 이름 · 리더 점선 · 값(외부 링크) 한 줄 — 최소 44px */
function DataRow({
  what,
  name,
  href,
}: {
  what: string;
  name: string;
  href: string;
}) {
  return (
    <li className="flex items-center gap-2 border-b border-rule">
      <span className="min-w-0">{what}</span>
      <Leader />
      <a
        href={href}
        target="_blank"
        rel="noopener"
        lang="en"
        className={ROW_LINK}
      >
        {name}
        <NewWindow />
      </a>
    </li>
  );
}

function ContactRow({
  what,
  note,
  children,
}: {
  what: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-rule pb-2.5">
      <p className="flex items-center gap-2">
        <span className="flex-none font-extrabold">{what}</span>
        <Leader />
        <span className="min-w-0 text-right">{children}</span>
      </p>
      <p className="-mt-1 text-[13px] leading-[1.45] text-ink-2">{note}</p>
    </li>
  );
}

/** 큰 숫자가 아닌 문장 속 숫자 — Barlow 600 1.16em(브리핑 문장 속 숫자 규칙, DESIGN §3.5) */
function Num({ children }: { children: ReactNode }) {
  return (
    <span className="font-numeric text-[1.16em] leading-none font-semibold tracking-[0.01em] lining-nums tabular-nums">
      {children}
    </span>
  );
}

/** 문장 속 서비스 이름 — 하이픈(API-Football)에서 줄이 갈리지 않게 */
function Brand({ children }: { children: string }) {
  return (
    <span lang="en" className="whitespace-nowrap">
      {children}
    </span>
  );
}

/** "AI 작성" 라벨 견본 — 5줄 줄 끝 라벨(DESIGN §9.3)과 같은 모양, 여기서는 링크가 아니다 */
function AiLabelSample() {
  return (
    <span className="mx-0.5 inline-block border border-ink-2 px-1.25 pt-0.5 pb-px align-[2px] text-[11px] leading-[1.35] font-extrabold tracking-[0.02em] whitespace-nowrap text-ink-2">
      AI 작성
    </span>
  );
}

/** 약칭과 정식 이름이 띄어쓰기만 다른가(세리에A · 세리에 A) */
function sameName(short: string, name: string): boolean {
  return short.replace(/\s/g, "") === name.replace(/\s/g, "");
}
