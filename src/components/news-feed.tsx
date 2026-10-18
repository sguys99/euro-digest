import {
  Card,
  CardBody,
  CardGutter,
  CardMeta,
  CardNumber,
  CardTitle,
} from "@/components/ui/card";
import type { NewsCard, NewsFile } from "@/lib/schema/news";
import { formatKst } from "@/lib/time";

/**
 * 뉴스 피드 — 한 호의 원제목 카드 목록 (M1-01 최소형 → 홈·`/news/`가 같이 쓴다, M1-30)
 *
 * 카드 변형 6종(태그·출처 스택·중요도·인덱스 탭·메뉴·머리기사 — M1-31)과 필터(M1-33)는 뒤 작업이다.
 * 뉴스 카드는 LLM을 거치지 않는다 — 원제목(`t`)을 고치지 않고, 요약 줄(`s`)·"AI 작성" 라벨은 쓰지 않는다(D23·D24).
 * 섹션 머리(제목·러닝 헤드)는 페이지가 정한다(홈 "주요 뉴스" h2 · `/news/` "뉴스" h1). 카드 제목 단계는 그 아래 한 단계
 * (`titleAs` — 홈 h3 · `/news/` h2, 제목 단계를 건너뛰지 않는다).
 */

/** 피드 게재 번호는 5줄 1~5 다음 06부터(DESIGN §3.5). 5줄(M1-32)이 아직 없어도 번호가 나중에 바뀌지 않게 같은 규칙을 쓴다 */
const FIRST_CARD_NO = 6;

type TitleAs = "h2" | "h3";

/** 호가 없거나(발행 전) 카드가 0장이면 빈 상태 */
export function NewsFeed({
  news,
  titleAs = "h3",
}: {
  news: NewsFile | null;
  /** 카드 제목 단계 — 섹션 머리 바로 아래 단계(기본 h3) */
  titleAs?: TitleAs;
}) {
  return news && news.cards.length > 0 ? (
    <Feed news={news} titleAs={titleAs} />
  ) : (
    <EmptyState hasIssue={news !== null} />
  );
}

function Feed({ news, titleAs }: { news: NewsFile; titleAs: TitleAs }) {
  return (
    <>
      <p className="mt-0.75 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
        <span>
          <span className="tabular-nums">{news.cards.length}</span>건
        </span>
        <span className="text-xs">
          작은 번호는 이 호의 게재 번호(순위 아님)
        </span>
      </p>
      {/* list-style: none인 목록의 의미를 Safari가 지우지 않게 role="list"(DESIGN §9.3 5줄 행과 같은 처리) */}
      <ol role="list" className="mt-1.5 border-t border-rule">
        {news.cards.map((card, index) => (
          <li key={card.id}>
            <NewsItem
              card={card}
              no={FIRST_CARD_NO + index}
              titleAs={titleAs}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

/** 원제목 카드 최소형 — 게재 번호 · 원제목(원문 링크, 새 창) · 대표 출처명 · 원문 발행 시각(KST) */
function NewsItem({
  card,
  no,
  titleAs,
}: {
  card: NewsCard;
  no: number;
  titleAs: TitleAs;
}) {
  // 대표 출처 = 첫 출처(FR-30). 스키마가 1건 이상을 보장한다(src.min(1)) — 없으면 데이터 오류라 빌드를 멈춘다
  const source = card.src[0];
  if (!source) throw new Error(`${card.id}: 출처 없음`);
  const titleId = `${card.id}-t`;
  return (
    <Card id={card.id} aria-labelledby={titleId} bleed>
      <CardGutter>
        <CardNumber n={no} />
      </CardGutter>
      <CardBody>
        <CardTitle
          id={titleId}
          as={titleAs}
          href={source.u}
          lang={card.lang}
          source={source.n}
        >
          {card.t}
        </CardTitle>
        <CardMeta>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
            <span lang={card.lang} className="font-extrabold text-ink">
              {source.n}
            </span>
            {/* 정적 HTML은 절대 시각(KST)만 — 상대 시간은 클라이언트 섬이 더한다(DESIGN §9.3 시각, M1-31) */}
            <time
              dateTime={source.at}
              className="font-numeric text-num-meta leading-none font-semibold tracking-[0.02em] whitespace-nowrap"
            >
              {formatKst(source.at, "short")}
            </time>
          </div>
        </CardMeta>
      </CardBody>
    </Card>
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
