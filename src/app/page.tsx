import {
  Card,
  CardBody,
  CardGutter,
  CardMeta,
  CardNumber,
  CardTitle,
} from "@/components/ui/card";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestNews } from "@/lib/data/news";
import type { NewsCard, NewsFile } from "@/lib/schema/news";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { formatKst, kstDayRangeUtc } from "@/lib/time";

/*
 * 홈 — M1-01 얇은 수직 슬라이스의 목록 페이지. 빌드 때 data/news의 가장 최근 호를 읽어 원제목 카드 목록을 보여 준다.
 * 새 디자인 결정 없이 D0 토큰·기초 컴포넌트(Card·SectionHead)·타이포 위계만 쓴다. 티켓 마스트헤드·앱 셸(M1-30),
 * 카드 변형 6종(태그·출처 스택·중요도·인덱스 탭·메뉴 — M1-31), 오늘의 5줄·홈 구성(M1-32)은 뒤 작업이다.
 * 뉴스 카드는 LLM을 거치지 않는다 — 원제목(`t`)을 고치지 않고, 요약 줄(`s`)·"AI 작성" 라벨은 쓰지 않는다(D23·D24).
 */

/** 피드 게재 번호는 5줄 1~5 다음 06부터(DESIGN §3.5). 5줄(M1-32)이 아직 없어도 번호가 나중에 바뀌지 않게 같은 규칙을 쓴다 */
const FIRST_CARD_NO = 6;

const NEWS_HEADING_ID = "news-h";

export default function HomePage() {
  const news = loadLatestNews();

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-page px-edge pt-3 pb-14 lg:pt-6 lg:pb-18"
    >
      <header>
        <h1 className="text-type-wordmark font-extrabold tracking-[-0.045em] lg:tracking-[-0.05em]">
          {SITE_NAME}
        </h1>
        <p className="mt-2.5 text-[13px] leading-[1.45] text-ink-2 lg:mt-3 lg:text-[15px]">
          {SITE_TAGLINE}
        </p>
        {news && (
          <p className="mt-3 text-[12.5px] font-extrabold lg:text-[13px]">
            <time dateTime={news.date}>{issueDateLabel(news.date)}</time>
          </p>
        )}
      </header>

      <section aria-labelledby={NEWS_HEADING_ID} className="mt-9 lg:mt-11">
        <SectionHead
          heading="주요 뉴스"
          headingId={NEWS_HEADING_ID}
          runningHead="SQUAD"
        />
        {news && news.cards.length > 0 ? (
          <Feed news={news} />
        ) : (
          <EmptyState hasIssue={news !== null} />
        )}
      </section>
    </main>
  );
}

/** KST 발행일 "YYYY-MM-DD" → "2026년 10월 10일 (토)". 날짜 라벨이라 그날 KST 00:00(UTC 시각)으로 바꿔 formatKst에 넘긴다 */
function issueDateLabel(date: string): string {
  return formatKst(kstDayRangeUtc(date).start, "fullDate");
}

function Feed({ news }: { news: NewsFile }) {
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
            <NewsItem card={card} no={FIRST_CARD_NO + index} />
          </li>
        ))}
      </ol>
    </>
  );
}

/** 원제목 카드 최소형 — 게재 번호 · 원제목(원문 링크, 새 창) · 대표 출처명 · 원문 발행 시각(KST) */
function NewsItem({ card, no }: { card: NewsCard; no: number }) {
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
