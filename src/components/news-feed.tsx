import { FeedCard } from "@/components/news/feed-card";
import { FeedIsland } from "@/components/news/feed-island";
import { loadCardLabels } from "@/lib/data/card-labels";
import { buildFeed, FIRST_CARD_NO } from "@/lib/news/feed-view";
import type { NewsFile } from "@/lib/schema/news";

/**
 * 뉴스 피드 — 한 호의 원제목 카드 목록 (M1-01 최소형 → 홈·`/news/` 공용(M1-30) → 카드 변형 6종·머리기사·연결 줄(M1-31))
 *
 * 카드는 파일 순서 그대로 그린다(파이프라인이 중요도 순으로 쓴다). 화면 모델(게재 번호·머리기사·태그 한글·대회 약칭·출처 스택·이적 단계·
 * 연결 줄)은 src/lib/news/feed-view.ts의 순수 함수가 정하고, 카드 모양은 src/components/news/feed-card.tsx가 그린다.
 * 뉴스 카드는 LLM을 거치지 않는다 — 원제목(`t`)을 고치지 않고, 요약 줄(`s`)·"AI 작성" 라벨은 쓰지 않는다(D23·D24).
 * 섹션 머리(제목·러닝 헤드)는 페이지가 정한다(홈 "주요 뉴스" h2 · `/news/` "뉴스" h1). 카드 제목 단계는 그 아래 한 단계
 * (`titleAs` — 홈 h3 · `/news/` h2, 제목 단계를 건너뛰지 않는다).
 *
 * 머리기사(`lead`, 1024 이상)는 전체 피드에만 둔다 — 필터 결과(M1-33)는 `lead={false}`(DECISIONS D0 §5 #13).
 * 상대 시간·'+N곳' 펼침은 피드마다 섬 하나(`FeedIsland`)가 `id`로 찾은 목록 안에서만 맡는다(한 페이지에 피드가 둘이어도 섞이지 않게).
 */

type TitleAs = "h2" | "h3";

/** 호가 없거나(발행 전) 카드가 0장이면 빈 상태 */
export function NewsFeed({
  news,
  titleAs = "h3",
  lead = true,
  id = "feed",
}: {
  news: NewsFile | null;
  /** 카드 제목 단계 — 섹션 머리 바로 아래 단계(기본 h3) */
  titleAs?: TitleAs;
  /** 머리기사를 둘지(전체 피드 true · 필터 결과 false) */
  lead?: boolean;
  /** 카드 목록 요소 id — 피드 섬의 범위(페이지 안에서 유일) */
  id?: string;
}) {
  return news && news.cards.length > 0 ? (
    <Feed news={news} titleAs={titleAs} lead={lead} id={id} />
  ) : (
    <EmptyState hasIssue={news !== null} />
  );
}

function Feed({
  news,
  titleAs,
  lead,
  id,
}: {
  news: NewsFile;
  titleAs: TitleAs;
  lead: boolean;
  id: string;
}) {
  const items = buildFeed(news.cards, {
    lead,
    labels: loadCardLabels(),
    firstNo: FIRST_CARD_NO,
  });
  return (
    <>
      <p className="mt-0.75 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
        <span>
          {/* 필터 설명 자리(M1-33이 "· 이적 · UCL"처럼 바꾼다) — 전체 피드는 파일 순서 = 중요도 순 */}
          <span className="tabular-nums">{news.cards.length}</span>
          {"건 · 중요도 순"}
        </span>
        <span className="text-xs">
          작은 번호는 이 호의 게재 번호(순위 아님)
        </span>
      </p>
      {/* list-style: none인 목록의 의미를 Safari가 지우지 않게 role="list"(DESIGN §9.3 5줄 행과 같은 처리) */}
      <ol id={id} role="list" className="mt-1.5 border-t border-rule">
        {items.map((view) => (
          <li key={view.card.id}>
            <FeedCard view={view} titleAs={titleAs} />
          </li>
        ))}
      </ol>
      <FeedIsland rootId={id} />
    </>
  );
}

/** 빈 상태 — 아직 발행된 호가 없거나(CI 빌드 등 data/news가 빔) 그날 호에 카드가 0장일 때. UI 안내 문구만 쓴다 */
function EmptyState({ hasIssue }: { hasIssue: boolean }) {
  return (
    <div className="pt-7 pb-2">
      <p className="text-[15px] font-extrabold">
        {hasIssue
          ? "이 호에는 실린 소식이 없어요."
          : "아직 발행된 소식이 없어요."}
      </p>
      {!hasIssue && (
        <p className="mt-2 text-[13.5px] text-ink-2">
          새 호가 나오면 이곳에 주요 뉴스가 실립니다.
        </p>
      )}
    </div>
  );
}
