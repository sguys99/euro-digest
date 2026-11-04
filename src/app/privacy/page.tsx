import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AboutToc } from "@/components/about/about-toc";
import { DocSection } from "@/components/about/doc-section";
import { Leader } from "@/components/about/leader";
import {
  BODY,
  INLINE_LINK,
  LEAD,
  NewWindow,
  NOTE,
  Num,
  ROW_LINK,
} from "@/components/about/prose";
import { TermList } from "@/components/about/term-list";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { issueDateLabel } from "@/lib/about";
import { aboutHref } from "@/lib/about-sections";
import { loadLatestIssue } from "@/lib/data/issue";
import { OG_PAGES, pageOgCard } from "@/lib/og";
import { routes, withBasePath } from "@/lib/paths";
import {
  GOATCOUNTER_TOGGLE_HASH,
  OFFLINE_DATA_LIMIT,
  OFFLINE_RUNTIME_PAGE_LIMIT,
  PRIVACY_CHANGES,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
  STORAGE_ITEMS,
  type PrivacySectionId,
} from "@/lib/privacy";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

/*
 * `/privacy/` 개인정보 처리방침 (PRD FR-141 · NFR-08 · §15 D7 · D75, plan M5-05) — 방문 통계(GoatCounter) · 모으지 않는 것 ·
 * 브라우저 저장(localStorage 항목 표 · 서비스 워커 오프라인 저장) · AI 입력 · 호스팅과 바깥 링크 · 문의·변경 이력.
 *
 * 문구는 코드 · PRD 결정 · 공식 문서에 근거가 있는 사실만 쓴다(CLAUDE §1-7 — 출처 목록은 src/lib/privacy.ts 머리). 저장 항목 표는
 * 코드의 저장 키 상수에서 만든다(`STORAGE_ITEMS` — 새 키가 생기면 tests/privacy-page.test.tsx가 실패). 연락처 = src/lib/site.ts `CONTACT_EMAIL`.
 *
 * 지면은 `/about`(M1-36)과 같은 D0 문법이다 — 섹션 머리 + 러닝 헤드로 절을 나누고, 줄은 괘선 사이의 한 줄(항목 목록 `TermList`),
 * 이름과 값은 리더 점선으로 잇는다. 큰 숫자는 '쿠키 0개' 하나(`/about` 처리 기한 72시간과 같은 자리 문법). 1024 이상은 앱 셸 목차 열에
 * 차례(sticky), 1023 이하는 머리 아래 2열 차례. 서버 컴포넌트 — JS 0(앱 셸의 테마 토글·토스트 섬만). 색인 대상(sitemap 포함).
 */

export const metadata: Metadata = pageMetadata({
  title: OG_PAGES.privacy,
  description: `${SITE_NAME}의 방문 통계(쿠키 없는 GoatCounter), 이 기기에 저장하는 설정, 모으지 않는 정보, AI 입력, 호스팅과 바깥 링크.`,
  canonical: routes.privacy(),
  og: pageOgCard("privacy"),
});

const INTRO_HEADING_ID = "privacy-h";

/** 바깥 문서 — 이 페이지의 사실 근거(공식 문서) */
const GOATCOUNTER_PRIVACY_URL = "https://www.goatcounter.com/help/privacy";
const GITHUB_PAGES_DATA_URL =
  "https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection";

export default function PrivacyPage() {
  const { issue } = loadLatestIssue();
  const siteItems = STORAGE_ITEMS.filter((i) => i.owner === "site");
  const counterItems = STORAGE_ITEMS.filter((i) => i.owner === "goatcounter");

  return (
    <AppShell
      issue={issue}
      contents={<AboutToc variant="contents" sections={PRIVACY_SECTIONS} />}
      contentsLabel="개인정보 처리방침 차례"
    >
      {/* ── 머리 ─────────────────────────────────────────────────────── */}
      <section aria-labelledby={INTRO_HEADING_ID}>
        <SectionHead
          heading={OG_PAGES.privacy}
          headingAs="h1"
          headingId={INTRO_HEADING_ID}
          runningHead="PRIVACY"
        />
        <p className="mt-5 max-w-measure-dek text-type-h2 font-extrabold tracking-[-0.03em] text-balance lg:mt-6 lg:text-type-lead">
          가입도, 쿠키도 없이 읽습니다.
        </p>
        <p className={LEAD}>
          {SITE_NAME}는 회원 가입이나 로그인 없이 읽는 사이트입니다. 방문 통계는
          쿠키 없는 분석 도구로 모으고, 마이 팀·테마 같은 설정은 이 기기의
          브라우저에만 저장합니다.
        </p>
        <p className={NOTE}>
          시행일{" "}
          <time dateTime={PRIVACY_EFFECTIVE_DATE}>
            {issueDateLabel(PRIVACY_EFFECTIVE_DATE)}
          </time>
          . 바뀐 내용은 맨 아래 변경 이력에 적습니다.
        </p>
      </section>

      {/* 1023 이하 차례(1024 이상은 왼쪽 목차 열) */}
      <nav aria-label="개인정보 처리방침 차례" className="mt-9 lg:hidden">
        <AboutToc variant="inline" sections={PRIVACY_SECTIONS} />
      </nav>

      {/* ── 01 방문 통계 ─────────────────────────────────────────────── */}
      <PrivacySection id="analytics">
        <p className={LEAD}>
          어떤 지면이 읽히는지 알려고 쿠키 없는 분석 도구{" "}
          <Brand>GoatCounter</Brand>를 씁니다. 개인을 알아볼 수 있는 정보는
          모으지 않습니다.
        </p>
        <p className={BODY}>
          하루 방문 수, 아침 시간대 방문 비중, 원문 링크를 누르는 비율, 구독과
          홈 화면 설치·마이 팀 설정이 얼마나 쓰이는지, 어느 화면이 많이
          읽히는지를 보고 무엇을 고칠지 정합니다.
        </p>

        <SubHead>GoatCounter로 보내는 것</SubHead>
        <TermList
          className="mt-3"
          items={[
            {
              term: "페이지 경로",
              description:
                "보고 있는 페이지의 경로. 주소 뒤의 쿼리(?…)와 해시(#…)는 떼고 보내서 검색어·필터·공유한 팔로우 목록·카드 위치가 들어가지 않습니다.",
            },
            {
              term: "페이지 제목",
              description: "그 페이지의 제목. 누가 보든 같은 제목입니다.",
            },
            {
              term: "들어온 곳",
              description:
                "이 페이지로 오기 직전의 주소. 여기서도 쿼리와 해시는 뗍니다.",
            },
            {
              term: "누른 링크",
              description:
                "원문 링크는 매체 사이트의 호스트 이름만, RSS·캘린더 구독 링크는 형식과 종류(전체·한국 선수·대회·팀·경기)만 보냅니다. 홈 화면 설치와 마이 팀 저장은 그런 일이 있었다는 것만 보냅니다.",
            },
            {
              term: "화면 크기",
              description: "화면의 가로·세로 픽셀과 픽셀 비율.",
            },
            {
              term: "자동화 여부",
              description: "자동화된 브라우저(봇)로 보이는지 나타내는 값.",
            },
            {
              term: "브라우저·OS",
              description: (
                <>
                  브라우저가 보내는 요청 정보에서 GoatCounter가 브라우저와
                  운영체제의 이름·버전만 남깁니다. 전체{" "}
                  <Brand>User-Agent</Brand> 문자열은 저장하지 않습니다.
                </>
              ),
            },
            {
              term: "언어·국가",
              description:
                "언어, 그리고 IP 주소로 판단한 국가. IP 주소는 저장하지 않습니다.",
            },
            {
              term: "같은 방문 구분",
              description: (
                <>
                  사이트·IP·<Brand>User-Agent</Brand> 조합을 GoatCounter 서버
                  메모리에 최대 <Num>8</Num>시간 두고 같은 사람의 이어진
                  방문인지 가립니다. 데이터베이스나 디스크에는 저장하지
                  않습니다.
                </>
              ),
            },
          ]}
        />

        <SubHead>보관과 열람</SubHead>
        <ul
          role="list"
          className="mt-3 max-w-measure-prose border-t border-rule"
        >
          <InfoRow what="저장 위치" value="GoatCounter 서버(핀란드·독일)" />
          <InfoRow what="보는 사람" value="운영자만(집계 화면 비공개)" />
          <InfoRow what="제3자 공유" value="하지 않음(GoatCounter 정책)" />
        </ul>
        <p className={NOTE}>
          GoatCounter의 처리 방식은{" "}
          <a
            href={GOATCOUNTER_PRIVACY_URL}
            target="_blank"
            rel="noopener"
            className={INLINE_LINK}
          >
            GoatCounter 개인정보 정책
            <NewWindow />
          </a>
          에 있습니다(영문).
        </p>

        <SubHead>통계에서 빠지기</SubHead>
        <ul
          role="list"
          className="mt-3 max-w-measure-prose border-t border-rule"
        >
          <li className="border-b border-rule pb-2.5">
            <p className="flex items-center gap-2">
              <span className="flex-none font-extrabold">이 브라우저</span>
              <Leader />
              <span className="min-w-0 text-right">
                {/* 문서 이동(일반 <a>)이어야 한다 — count.js가 페이지를 열 때 주소의 해시를 본다(next/link 이동은 스크립트를 다시 싣지 않는다) */}
                <a
                  href={`${withBasePath(routes.home())}${GOATCOUNTER_TOGGLE_HASH}`}
                  className={ROW_LINK}
                >
                  방문 통계 끄기·켜기
                </a>
              </span>
            </p>
            <p className="text-[13px] leading-[1.45] text-ink-2">
              이 링크로 홈을 열면 이 브라우저의 방문을 세지 않고, 한 번 더 열면
              다시 셉니다. 바꿀 때마다 GoatCounter가 영어 알림 창을 띄웁니다.
            </p>
          </li>
          <li className="border-b border-rule py-3 leading-[1.6]">
            광고 차단기나 브라우저의 추적 방지 기능으로 GoatCounter를 막아도
            사이트는 그대로 동작합니다.
          </li>
        </ul>
      </PrivacySection>

      {/* ── 02 모으지 않는 것 ────────────────────────────────────────── */}
      <PrivacySection id="not-collected">
        <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 lg:gap-x-6">
          {/* 큰 숫자는 장식 — 옆 문장이 같은 사실을 말한다. `/about` 처리 기한 '72시간'과 같은 자리 문법(`--num-score` 800 레드 실선 — 윤곽 0은
              빈 상태 · 숫자판의 '아직 없음' 뜻이라 쓰지 않는다. 34px 윤곽 2px은 획이 약하다) */}
          <p aria-hidden="true" className="flex items-baseline gap-1.5">
            <span className="text-sm font-extrabold">쿠키</span>
            <span className="font-numeric text-num-score leading-none font-extrabold tracking-[0.02em] text-brand-accent lining-nums tabular-nums">
              0
            </span>
          </p>
          <p className="max-w-measure-note text-type-brief">
            이 사이트도, 방문 통계도 쿠키를 하나도 쓰지 않습니다.
          </p>
        </div>
        <p className={BODY}>
          회원 가입·로그인·댓글이 없고 광고도 싣지 않습니다. 사이트를 쓰는 데
          이름이나 이메일 같은 정보가 필요하지 않습니다.
        </p>
        <TermList
          className="mt-5"
          items={[
            {
              term: "식별 정보",
              description: (
                <>
                  IP 주소, 전체 <Brand>User-Agent</Brand>, 방문자를 따라가는
                  추적 ID를 저장하지 않습니다.
                </>
              ),
            },
            {
              term: "개인 설정",
              description:
                "마이 팀 목록과 개수, 결과 가리기·테마 설정은 방문 통계로 보내지 않습니다.",
            },
            {
              term: "읽은 기사",
              description:
                "카드 ID, 기사 주소와 제목은 보내지 않습니다. 원문 링크를 누르면 매체의 호스트 이름만 셉니다.",
            },
            {
              term: "검색어·필터",
              description:
                "주소의 쿼리를 떼고 보내므로 검색어와 필터 값은 통계에 들어가지 않습니다.",
            },
            {
              term: "사이트 간 추적",
              description:
                "다른 사이트에서 무엇을 했는지 따라가지 않습니다. GoatCounter 말고는 다른 회사의 스크립트를 싣지 않고, 글꼴도 이 사이트에서 직접 받습니다.",
            },
          ]}
        />
      </PrivacySection>

      {/* ── 03 브라우저 저장 ─────────────────────────────────── */}
      <PrivacySection id="storage">
        <p className={LEAD}>
          가입이 없는 대신 설정은 이 기기의 브라우저 저장소(localStorage)에
          둡니다. 이 값을 서버로 보내지 않습니다.
        </p>
        <StorageList
          items={siteItems}
          labelId="storage-site"
          label="이 사이트가 저장하는 항목"
        />
        {counterItems.length > 0 ? (
          <StorageList
            items={counterItems}
            labelId="storage-counter"
            label="GoatCounter가 저장하는 항목"
          />
        ) : null}
        <p className={NOTE}>
          팔로우 목록은 이 기기에만 있습니다. 다만 마이 팀 화면은 팔로우한
          팀·선수마다 자료 파일을 이 사이트에서 받아 오고, 내보내기로 만든 공유
          링크에는 팔로우 목록이 주소에 들어갑니다.
        </p>

        <SubHead>오프라인 저장</SubHead>
        <p className={BODY}>
          다시 열 때 빨리 뜨고 연결이 끊겨도 읽을 수 있게, 서비스 워커가
          브라우저의 캐시 저장소에 다음 파일을 저장합니다.
        </p>
        <TermList
          className="mt-4"
          items={[
            {
              term: "기본 화면",
              description:
                "홈·뉴스·오프라인 안내 화면과 최근 호의 날짜 페이지.",
            },
            {
              term: "열어 본 페이지",
              description: (
                <>
                  온라인으로 열어 본 그 밖의 페이지, 최근{" "}
                  <Num>{OFFLINE_RUNTIME_PAGE_LIMIT}</Num>쪽까지.
                </>
              ),
            },
            {
              term: "화면 파일",
              description: "화면을 그리는 스크립트·스타일, 글꼴, 아이콘.",
            },
            {
              term: "마이 팀 자료",
              description: (
                <>
                  팔로우한 팀·선수의 다음 경기·최근 결과 자료,{" "}
                  <Num>{OFFLINE_DATA_LIMIT}</Num>개까지.
                </>
              ),
            },
          ]}
        />
        <p className={NOTE}>
          새 버전이 나오면 지난 버전의 페이지 저장분은 지웁니다. 검색 색인은
          저장하지 않습니다.
        </p>

        <SubHead>한 번에 지우기</SubHead>
        <p className={BODY}>
          브라우저 설정에서 이 사이트의 저장 데이터를 지우면 위의 설정과
          오프라인 저장분이 모두 지워집니다. 지운 뒤에도 사이트는 처음 방문처럼
          그대로 열립니다.
        </p>
      </PrivacySection>

      {/* ── 04 AI와 개인 정보 ────────────────────────────────────────── */}
      <PrivacySection id="ai">
        <p className={LEAD}>
          AI에는 경기 데이터만 넣습니다. 방문자에 관한 정보는 AI에 들어가지
          않습니다.
        </p>
        <TermList
          className="mt-5"
          items={[
            {
              term: "입력",
              description: (
                <>
                  경기 결과·득점자·순위 같은 경기 데이터(
                  <Brand>football-data.org</Brand> · <Brand>API-Football</Brand>
                  ). 기사 제목이나 본문은 넣지 않습니다.
                </>
              ),
            },
            {
              term: "부르는 곳",
              description:
                "사이트를 만드는 발행 작업에서만 부릅니다. 읽는 사람의 브라우저에서 AI를 부르지 않습니다.",
            },
          ]}
        />
        <p className={NOTE}>
          AI가 쓴 문장의 표시와 검증 방식은{" "}
          <Link href={aboutHref("ai")} className={INLINE_LINK}>
            AI 작성 고지
          </Link>
          에 있습니다.
        </p>
      </PrivacySection>

      {/* ── 05 호스팅과 바깥 링크 ─────────────────────────────────────── */}
      <PrivacySection id="elsewhere">
        <TermList
          className="mt-5"
          items={[
            {
              term: "호스팅",
              description: (
                <>
                  사이트는 <Brand>GitHub Pages</Brand>에서 내려받습니다.
                  GitHub는 보안을 위해 방문자의 IP 주소를 기록·보관한다고
                  밝힙니다.{" "}
                  <a
                    href={GITHUB_PAGES_DATA_URL}
                    target="_blank"
                    rel="noopener"
                    className={INLINE_LINK}
                  >
                    GitHub 안내
                    <NewWindow />
                  </a>
                </>
              ),
            },
            {
              term: "원문 링크",
              description:
                "카드 제목이나 출처를 누르면 매체 사이트로 이동합니다. 거기서부터는 그 사이트의 개인정보 정책이 적용됩니다.",
            },
            {
              term: "GitHub 이슈",
              description:
                "삭제·정정 요청과 오류 신고 양식은 공개 저장소의 이슈로 접수되어 누구나 볼 수 있습니다. 공개하고 싶지 않은 내용은 이메일로 보내 주세요.",
            },
            {
              term: "처리 기록",
              description:
                "삭제 요청을 처리한 기록(공개 저장소의 설정 파일)에는 요청한 사람의 정보를 적지 않습니다.",
            },
          ]}
        />
      </PrivacySection>

      {/* ── 06 문의·변경 이력 ─────────────────────────────────────────── */}
      <PrivacySection id="changes">
        <ul
          role="list"
          className="mt-5 max-w-measure-prose border-t border-rule"
        >
          <li className="flex items-center gap-2 border-b border-rule">
            <span className="flex-none font-extrabold">문의</span>
            <Leader />
            <a href={`mailto:${CONTACT_EMAIL}`} className={ROW_LINK}>
              {CONTACT_EMAIL}
            </a>
          </li>
          <InfoRow
            what="시행일"
            value={
              <time dateTime={PRIVACY_EFFECTIVE_DATE}>
                {issueDateLabel(PRIVACY_EFFECTIVE_DATE)}
              </time>
            }
          />
        </ul>

        <SubHead>변경 이력</SubHead>
        <ol
          role="list"
          className="mt-3 max-w-measure-prose border-t border-rule"
        >
          {PRIVACY_CHANGES.map((change) => (
            <li
              key={change.date}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 border-b border-rule py-3"
            >
              <time
                dateTime={change.date}
                className="font-numeric text-[17px] font-semibold text-ink-2 lining-nums tabular-nums"
              >
                {change.date.replaceAll("-", ".")}
              </time>
              <span className="leading-[1.5]">{change.note}</span>
            </li>
          ))}
        </ol>
      </PrivacySection>
    </AppShell>
  );
}

// ─── 절 · 행 ────────────────────────────────────────────────────────────

/** 절 — `PRIVACY_SECTIONS`의 이름·러닝 헤드로 `DocSection`을 그린다 */
function PrivacySection({
  id,
  children,
}: {
  id: PrivacySectionId;
  children: ReactNode;
}) {
  const section = PRIVACY_SECTIONS.find((s) => s.id === id);
  if (!section) return null;
  return (
    <DocSection id={id} title={section.title} runningHead={section.runningHead}>
      {children}
    </DocSection>
  );
}

/** 절 안 소제목 — `/about` '지금 싣는 매체'와 같은 h3 */
function SubHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-10 text-base font-extrabold lg:mt-12 lg:text-[17px]">
      {children}
    </h3>
  );
}

/** 이름 · 리더 점선 · 값 한 줄 — 최소 44px(`/about` 데이터 출처 줄과 같은 줄) */
function InfoRow({ what, value }: { what: string; value: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-2 border-b border-rule">
      <span className="flex-none font-extrabold">{what}</span>
      <Leader />
      <span className="min-w-0 py-2 text-right leading-[1.45]">{value}</span>
    </li>
  );
}

/**
 * 저장 항목 표 — 항목 목록(`TermList`) 한 줄 = 사람이 읽는 이름 + 무엇을 저장하는지 + 지우는 법(보조 설명 크기).
 * 3열 표는 375에서 좁아 1023 이하 이름 위 · 설명 아래, 1024 이상 2단(항목 목록 규칙 그대로).
 */
function StorageList({
  items,
  label,
  labelId,
}: {
  items: typeof STORAGE_ITEMS;
  label: string;
  labelId: string;
}) {
  return (
    <div className="mt-6" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-[12px] font-extrabold text-ink-2">
        {label}
      </p>
      <TermList
        className="mt-2"
        items={items.map((item) => ({
          term: item.name,
          description: (
            <>
              {item.stores}
              <span className="mt-1 block text-[13px] leading-[1.55] text-ink-2">
                <span className="font-extrabold">지우는 법</span> · {item.clear}
              </span>
            </>
          ),
        }))}
      />
    </div>
  );
}

/** 문장 속 서비스 이름 — 하이픈(User-Agent)에서 줄이 갈리지 않게 */
function Brand({ children }: { children: string }) {
  return (
    <span lang="en" className="whitespace-nowrap">
      {children}
    </span>
  );
}
