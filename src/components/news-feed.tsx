import { CardMenuPanel, cardMenuId } from "@/components/news/card-menu";
import { FeedCard } from "@/components/news/feed-card";
import { FeedIsland } from "@/components/news/feed-island";
import {
  FilterEmptyState,
  NewsFilterBoot,
  NewsFilterChips,
} from "@/components/news/news-filter";
import { loadCardLabels } from "@/lib/data/card-labels";
import { buildFeed, FIRST_CARD_NO } from "@/lib/news/feed-view";
import { FILTER_DESC_DEFAULT, type NewsFilterView } from "@/lib/news/filter";
import { cardShareUrl, summaryErrorIssueUrl } from "@/lib/paths";
import type { NewsCard, NewsFile } from "@/lib/schema/news";

/**
 * 뉴스 피드 — 한 호의 원제목 카드 목록 (M1-01 최소형 → 홈·`/news/` 공용(M1-30) → 카드 변형 6종·머리기사·연결 줄(M1-31))
 *
 * 카드는 파일 순서 그대로 그린다(파이프라인이 중요도 순으로 쓴다). 화면 모델(게재 번호·머리기사·태그 한글·대회 약칭·출처 스택·이적 단계·
 * 연결 줄)은 src/lib/news/feed-view.ts의 순수 함수가 정하고, 카드 모양은 src/components/news/feed-card.tsx가 그린다.
 * 뉴스 카드는 LLM을 거치지 않는다 — 원제목(`t`)을 고치지 않고, 요약 줄(`s`)·"AI 작성" 라벨은 쓰지 않는다(D23·D24).
 * 섹션 머리(제목·러닝 헤드)는 페이지가 정한다(홈 "주요 뉴스" h2 · `/news/` "뉴스" h1). 카드 제목 단계는 그 아래 한 단계
 * (`titleAs` — 홈 h3 · `/news/` h2, 제목 단계를 건너뛰지 않는다).
 *
 * 머리기사(`lead`, 1024 이상)는 전체 피드에만 둔다 — 필터 결과(M1-33)에는 없다(DECISIONS D0 §5 #13): 필터가 걸리는 피드(`filter`)는
 * 머리기사를 그린 채 내보내고, 필터 부트 스크립트·섬이 필터가 켜지면 머리기사 모양을 끈다(카드 `data-lead`).
 * 상대 시간·'+N곳' 펼침·카드 메뉴(M1-35 — 공유·오류 신고)는 피드마다 섬 하나(`FeedIsland`)가 `id`로 찾은 목록 안에서만 맡는다(한 페이지에
 * 피드가 둘이어도 섞이지 않게). 카드 메뉴는 버튼만 카드마다 있고 메뉴 마크업은 목록 뒤에 하나(`CardMenuPanel`)다 — 섬이 연 카드로 옮긴다.
 * 공유 URL·오류 신고 날짜는 그 호의 발행일(`news.date`)이다(처음 값은 첫 카드 — 섬이 연 카드의 ID로 바꾼다).
 *
 * `filter`(M1-33 — 홈·`/news/`, 페이지에 하나): 부제의 건수·설명을 필터가 바꾸는 칸으로, 부제 아래 1023 이하 분류 칩 줄, 카드 `<li>`에
 * 필터 값(`data-nf-*`), 목록 뒤 0건 빈 상태 · 설정 JSON · 부트 스크립트 · 필터 섬(src/components/news/news-filter.tsx).
 */

type TitleAs = "h2" | "h3";

/**
 * 피드 범위(M2-10 대회 페이지 뉴스 탭) — 한 호의 카드 중 `match`에 맞는 것만 싣는다. 게재 번호는 그 호 전체 순서 그대로(필터 결과와
 * 같은 규칙 — 번호는 "이 호의 게재 번호"), 부제 설명은 `desc`, 맞는 카드가 없으면 `empty` 문구의 빈 상태.
 */
export interface FeedScope {
  match: (card: NewsCard) => boolean;
  desc: string;
  empty: string;
}

/** 호가 없거나(발행 전) 카드가 0장이면 빈 상태 */
export function NewsFeed({
  news,
  titleAs = "h3",
  lead = true,
  id = "feed",
  filter,
  scope,
}: {
  news: NewsFile | null;
  /** 카드 제목 단계 — 섹션 머리 바로 아래 단계(기본 h3) */
  titleAs?: TitleAs;
  /** 머리기사를 둘지(전체 피드 true · 머리기사 없는 견본 false) */
  lead?: boolean;
  /** 카드 목록 요소 id — 피드 섬의 범위(페이지 안에서 유일) */
  id?: string;
  /** 필터가 걸리는 피드의 목차·칩 건수와 설정(M1-33 — 페이지에 하나) */
  filter?: NewsFilterView;
  /** 범위 피드(대회 페이지 — 위 `FeedScope`). `filter`와 함께 쓰지 않는다 */
  scope?: FeedScope;
}) {
  if (scope && news && !news.cards.some(scope.match)) {
    return <EmptyState hasIssue message={scope.empty} />;
  }
  return news && news.cards.length > 0 ? (
    <Feed
      news={news}
      titleAs={titleAs}
      lead={lead}
      id={id}
      filter={filter}
      scope={scope}
    />
  ) : (
    <EmptyState hasIssue={news !== null} />
  );
}

/** 범위 안 카드만 — 짝 카드가 범위 밖인 연결 줄은 뗀다(없는 카드로 가는 앵커를 만들지 않게) */
function scopeItems<
  T extends { card: NewsCard; link: { targetId: string } | null },
>(all: readonly T[], scope: FeedScope): T[] {
  const inScope = all.filter((view) => scope.match(view.card));
  const ids = new Set(inScope.map((view) => view.card.id));
  return inScope.map((view) =>
    view.link && !ids.has(view.link.targetId) ? { ...view, link: null } : view,
  );
}

/** 카드 `<li>`의 필터 값(DOM 약속 — src/lib/news/filter-dom.ts). 대회·팀은 공백으로 잇는다 */
function filterData(card: NewsCard) {
  return {
    "data-nf-card": "",
    "data-nf-cat": card.cat,
    "data-nf-comps": [...new Set(card.comp)].join(" "),
    "data-nf-teams": [...new Set(card.teams)].join(" "),
    ...(card.kr ? { "data-nf-kr": "" } : {}),
  };
}

function Feed({
  news,
  titleAs,
  lead,
  id,
  filter,
  scope,
}: {
  news: NewsFile;
  titleAs: TitleAs;
  lead: boolean;
  id: string;
  filter: NewsFilterView | undefined;
  scope: FeedScope | undefined;
}) {
  // 번호는 그 호 전체 순서로 매긴 뒤 범위로 거른다(게재 번호 유지 — FeedScope)
  const all = buildFeed(news.cards, {
    lead,
    labels: loadCardLabels(),
    firstNo: FIRST_CARD_NO,
  });
  const items = scope ? scopeItems(all, scope) : all;
  const firstId = items[0]?.card.id ?? "";
  const menuId = cardMenuId(id);
  return (
    <>
      <p className="mt-0.75 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
        <span>
          {/* 건수·설명 — 필터가 "4건 · 이적", "8건 · 프리미어리그 · 이적"처럼 바꾼다. 전체 피드는 파일 순서 = 중요도 순 */}
          <span
            className="tabular-nums"
            {...(filter
              ? { "data-nf-count": "", suppressHydrationWarning: true }
              : {})}
          >
            {items.length}
          </span>
          건 ·{" "}
          <span
            {...(filter
              ? { "data-nf-desc": "", suppressHydrationWarning: true }
              : {})}
          >
            {scope ? scope.desc : FILTER_DESC_DEFAULT}
          </span>
        </span>
        <span className="text-xs">
          작은 번호는 이 호의 게재 번호(순위 아님)
        </span>
      </p>
      {filter ? <NewsFilterChips view={filter} /> : null}
      {/* list-style: none인 목록의 의미를 Safari가 지우지 않게 role="list"(DESIGN §9.3 5줄 행과 같은 처리) */}
      <ol id={id} role="list" className="mt-1.5 border-t border-rule">
        {items.map((view) =>
          filter ? (
            <li
              key={view.card.id}
              {...filterData(view.card)}
              suppressHydrationWarning
              className="data-nf-in:animate-stamp"
            >
              <FeedCard
                view={view}
                menuId={menuId}
                titleAs={titleAs}
                filterable
              />
            </li>
          ) : (
            <li key={view.card.id}>
              <FeedCard view={view} menuId={menuId} titleAs={titleAs} />
            </li>
          ),
        )}
      </ol>
      {/* 카드 메뉴 하나(M1-35) — 처음 hidden, 섬이 연 카드의 메뉴 묶음으로 옮겨 그 카드 ID로 URL을 바꾼다 */}
      <CardMenuPanel
        id={menuId}
        shareUrl={cardShareUrl(news.date, firstId)}
        reportUrl={summaryErrorIssueUrl(firstId, news.date)}
      />
      {filter ? <FilterEmptyState /> : null}
      <FeedIsland rootId={id} />
      {filter ? <NewsFilterBoot view={filter} /> : null}
    </>
  );
}

/** 빈 상태 — 아직 발행된 호가 없거나(CI 빌드 등 data/news가 빔) 그날 호에 카드가 0장일 때. UI 안내 문구만 쓴다 */
function EmptyState({
  hasIssue,
  message,
}: {
  hasIssue: boolean;
  /** 범위 피드의 빈 상태 문구(FeedScope.empty) */
  message?: string;
}) {
  return (
    <div className="pt-7 pb-2">
      <p className="text-[15px] font-extrabold">
        {message ??
          (hasIssue
            ? "이 호에는 실린 소식이 없어요."
            : "아직 발행된 소식이 없어요.")}
      </p>
      {!hasIssue && (
        <p className="mt-2 text-[13.5px] text-ink-2">
          새 호가 나오면 이곳에 주요 뉴스가 실립니다.
        </p>
      )}
    </div>
  );
}
