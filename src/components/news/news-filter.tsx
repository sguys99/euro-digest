import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { ContentsRow, FilterChip } from "@/components/ui/chip";
import { FilterClearButton } from "@/components/ui/filter-clear-button";
import { FilterBadge, SectionHead } from "@/components/ui/section-head";
import {
  NEWS_FILTER_BOOT_SCRIPT,
  NEWS_FILTER_PENDING_SCRIPT,
} from "@/lib/news/filter-boot";
import { ALL_CATEGORIES, FILTER_CONFIG_ID } from "@/lib/news/filter-dom";
import type { NewsFilterView } from "@/lib/news/filter";

import { NewsFilterIsland } from "./filter-island";

/**
 * 뉴스 필터 화면 조각 (PRD FR-31·FR-32, DESIGN.md §9.2 Chip·Tabs · §9.3 필터 색 면·상태 화면 ②, DECISIONS D0 §5 #11·#13, plan M1-33)
 *
 * 모두 서버 컴포넌트(JS 0)다 — 처음 상태(필터 없음)의 정적 HTML을 그리고, 필터 상태는 DOM 속성으로 바뀐다(src/lib/news/filter-dom.ts
 * 머리 주석의 DOM 약속). 첫 페인트 전에는 인라인 부트 스크립트, 하이드레이션 뒤에는 필터 섬이 그린다. 바뀌는 요소에는
 * `suppressHydrationWarning`을 단다(부트 스크립트가 하이드레이션 전에 속성·글자를 바꾼다 — React는 그 자리를 다시 쓰지 않는다).
 *
 * | 조각 | 자리 | 내용 |
 * |------|------|------|
 * | `NewsFilterContents` | 앱 셸 `contents`(1024 이상 왼쪽 목차 열, sticky) | 맨 앞 보류 스크립트 + "목차"·CONTENTS + 대회 6행 · 분류 8행("전체" + 7) · 한국 선수 관련만 |
 * | `NewsFilterChips` | 피드 부제 아래(1023 이하만) | 분류 칩 줄("전체" + 7 + 한국 선수만, 가로 스크롤·스냅) — 대회 진입점 없음(DECISIONS #11) |
 * | `NewsFilterHead` | 피드 섹션 머리 | 섹션 머리 + 대회 색 면·팀 칸(`SectionHead liveFilter`) |
 * | `FilterEmptyState` | 피드 바로 뒤 | 0건 빈 상태(DESIGN §9.3 상태 화면 ②) — 처음엔 `hidden` |
 * | `NewsFilterBoot` | 빈 상태 뒤 | 설정 JSON + 부트 스크립트 + 필터 섬 + 결과 알림(`aria-live`) |
 */

// ─── 목차(1024 이상) ────────────────────────────────────────────────────────

/** 목차 묶음 이름 — 12px 800 --ink-2, 위 18 · 아래 2px(시안 `.ct-h`) */
function GroupLabel({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="mt-4.5 mb-0.5 text-xs leading-[1.55] font-extrabold text-ink-2"
    >
      {children}
    </p>
  );
}

/**
 * 1024 이상 목차 — 시안 `<nav class="contents">` 그대로: 섹션 머리 "목차"·CONTENTS → 대회 → 분류 → 한국 선수. 묶음 이름은 제목 요소가
 * 아니라 목록 이름이다(`aria-labelledby` — 목차가 `/news/` h1보다 DOM 앞이라 제목 단계를 만들지 않는다, `/about` 차례와 같은 규칙).
 * 맨 앞의 보류 스크립트는 1023 이하(목차 숨김)에서도 실행된다.
 */
export function NewsFilterContents({ view }: { view: NewsFilterView }) {
  return (
    <div data-nf-scope="">
      <script
        dangerouslySetInnerHTML={{ __html: NEWS_FILTER_PENDING_SCRIPT }}
      />
      <SectionHead heading="목차" headingAs="p" runningHead="CONTENTS" />
      <GroupLabel id="nf-comp-h">대회</GroupLabel>
      <ul role="list" aria-labelledby="nf-comp-h">
        {view.comps.map((comp) => (
          <li key={comp.id}>
            <ContentsRow
              {...control("comp", comp.id, comp.count)}
              pressed={false}
              label={comp.label}
              count={comp.count}
              marker={{
                kind: "competition",
                comp: comp.id,
                short: comp.short,
              }}
            />
          </li>
        ))}
      </ul>
      <GroupLabel id="nf-cat-h">분류</GroupLabel>
      <ul role="list" aria-labelledby="nf-cat-h">
        <li>
          <ContentsRow
            {...control("cat", ALL_CATEGORIES, view.total)}
            pressed
            label="전체"
            count={view.total}
            marker={{ kind: "category" }}
          />
        </li>
        {view.cats.map((cat) => (
          <li key={cat.id}>
            <ContentsRow
              {...control("cat", cat.id, cat.count)}
              pressed={false}
              label={cat.label}
              count={cat.count}
              marker={{ kind: "category" }}
            />
          </li>
        ))}
      </ul>
      <GroupLabel id="nf-kr-h">한국 선수</GroupLabel>
      <ul role="list" aria-labelledby="nf-kr-h">
        <li>
          <ContentsRow
            {...control("kr", "1", view.kr)}
            pressed={false}
            label="한국 선수 관련만"
            count={view.kr}
            marker={{ kind: "korean" }}
          />
        </li>
      </ul>
    </div>
  );
}

/**
 * 칩·목차 행 공통 속성 — 필터 키·값, 0건이면 `data-nf-zero` + 처음 `disabled`(DESIGN §9.2 비활성 0건 — 눌린 채 들어오면 부트가 푼다).
 * `aria-pressed`·`disabled`는 부트 스크립트·섬이 바꾼다.
 */
function control(key: "cat" | "comp" | "kr", value: string, count: number) {
  return {
    "data-nf-key": key,
    "data-nf-value": value,
    ...(count === 0 ? { "data-nf-zero": "", disabled: true } : {}),
    suppressHydrationWarning: true,
  };
}

// ─── 칩 줄(1023 이하) ───────────────────────────────────────────────────────

/**
 * 1023 이하 분류 칩 줄(DESIGN §9.2 Chip, 시안 `.chips`) — `role="group" aria-label="분류 필터"`, 가로 스크롤(스냅 proximity, 스크롤바 숨김),
 * 화면 가장자리까지 넘쳐 칩이 --edge 안쪽에서 시작한다(위 10px · 위아래 안쪽 4·8px). 1024 이상은 목차가 대신한다(`lg:hidden`).
 */
export function NewsFilterChips({ view }: { view: NewsFilterView }) {
  return (
    <div
      role="group"
      aria-label="분류 필터"
      data-nf-chips=""
      className="-mx-edge mt-2.5 flex snap-x snap-proximity scroll-px-edge [scrollbar-width:none] gap-1.5 overflow-x-auto px-edge pt-1 pb-2 lg:hidden [&::-webkit-scrollbar]:hidden"
    >
      <FilterChip
        {...control("cat", ALL_CATEGORIES, view.total)}
        pressed
        label="전체"
        count={view.total}
      />
      {view.cats.map((cat) => (
        <FilterChip
          key={cat.id}
          {...control("cat", cat.id, cat.count)}
          pressed={false}
          label={cat.label}
          count={cat.count}
        />
      ))}
      <FilterChip
        {...control("kr", "1", view.kr)}
        tone="korean"
        pressed={false}
        label="한국 선수만"
        count={view.kr}
      />
    </div>
  );
}

// ─── 피드 머리 ──────────────────────────────────────────────────────────────

/**
 * 피드 섹션 머리 + 필터 칸 — 대회 필터면 대회 색 면 + 약칭 상자 + "해제"(B → 색 면 200ms), 팀 필터(주소 `?team=`만)면 팀 상자 + "해제".
 * 상자 글자는 부트 스크립트·섬이 채운다.
 */
export function NewsFilterHead({
  heading,
  headingAs,
  headingId,
  runningHead,
}: {
  heading: string;
  headingAs: "h1" | "h2";
  headingId: string;
  runningHead: string;
}) {
  return (
    <SectionHead
      heading={heading}
      headingAs={headingAs}
      headingId={headingId}
      runningHead={runningHead}
      data-nf-head=""
      suppressHydrationWarning
      className="scroll-mt-4"
      liveFilter={{
        comp: (
          <>
            <FilterBadge data-nf-comp-badge="" suppressHydrationWarning>
              {""}
            </FilterBadge>
            <FilterClearButton data-nf-clear="comp" />
          </>
        ),
        team: (
          <>
            <FilterBadge data-nf-team-badge="" suppressHydrationWarning>
              {""}
            </FilterBadge>
            <FilterClearButton data-nf-clear="team" target="팀 필터" />
          </>
        ),
      }}
    />
  );
}

// ─── 0건 빈 상태 ────────────────────────────────────────────────────────────

/**
 * 필터 0건(DESIGN §9.3 상태 화면 ② — 시안 `.empty`): 윤곽 '0'(Barlow 800 64px, 속 빈 2px --ink-2 — 장식) + 안내 15px 800 + "필터 해제"(보조 버튼).
 * 문구는 UI 안내만이다 — "오늘 호"가 아니라 "이 호"(발행 전·발행 실패일·날짜 아카이브에서 화면의 호가 오늘이 아닐 수 있다, D30 날짜 단정 금지 —
 * 2026-10-22 오케스트레이터 결정). 처음엔 `hidden` — 결과가 0건일 때 부트 스크립트·섬이 연다. `visible`은 상태 화면 견본(M1-37)용.
 */
export function FilterEmptyState({ visible = false }: { visible?: boolean }) {
  return (
    <div
      data-nf-empty=""
      hidden={!visible}
      suppressHydrationWarning
      className="pt-7 pb-2"
    >
      <p
        aria-hidden="true"
        className="font-numeric text-[64px] leading-[0.8] font-extrabold text-transparent lining-nums tabular-nums [-webkit-text-stroke:2px_var(--ink-2)]"
      >
        0
      </p>
      <p className="mt-3 mb-2 text-[15px] leading-[1.55] font-extrabold">
        이 조건에 맞는 소식이 이 호에는 없어요.
      </p>
      <Button variant="secondary" data-nf-reset="">
        필터 해제
      </Button>
    </div>
  );
}

// ─── 부트 · 섬 ──────────────────────────────────────────────────────────────

/** JSON을 `<script>` 안에 안전하게 — `<`를 이스케이프해 `</script>`로 닫히지 않게 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * 필터 설정 JSON + 첫 페인트 전 부트 스크립트 + 필터 섬 + 결과 알림. 피드·빈 상태 바로 뒤에 둔다(부트 스크립트가 그리는 요소가 모두
 * 앞에 있어야 한다). 섬은 `useSearchParams`를 쓰므로 Suspense 안(정적 export — 그 자리만 클라이언트에서 그린다, 렌더 결과 없음).
 */
export function NewsFilterBoot({ view }: { view: NewsFilterView }) {
  return (
    <>
      <script
        id={FILTER_CONFIG_ID}
        type="application/json"
        dangerouslySetInnerHTML={{ __html: scriptJson(view.config) }}
      />
      <script dangerouslySetInnerHTML={{ __html: NEWS_FILTER_BOOT_SCRIPT }} />
      <p data-nf-live="" aria-live="polite" className="sr-only" />
      <Suspense fallback={null}>
        <NewsFilterIsland />
      </Suspense>
    </>
  );
}
