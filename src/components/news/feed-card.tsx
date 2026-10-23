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
import { IndexTab, StampChip } from "@/components/ui/chip";
import { TierBadge } from "@/components/ui/tier-badge";
import type { Tier, TransferStatus } from "@/lib/schema/common";
import type {
  CardTagView,
  FeedCardView,
  LinkLineView,
  SourceStackView,
  SourceView,
} from "@/lib/news/feed-view";
import {
  TRANSFER_STAGE,
  TRANSFER_STAGE_HOLES,
  transferStageLabel,
} from "@/lib/news/labels";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";

import { CardMenuButton } from "./card-menu";

/**
 * 뉴스 카드 — D0 변형 6종을 한 컴포넌트로 (PRD FR-30, D23·D30, DESIGN.md §9.2 Card · §9.3, plan M1-31)
 *
 * | 변형 | 켜지는 조건 | 모양 |
 * |------|-------------|------|
 * | ① 기본 원제목(해외) | `lang !== "ko"` | 라틴 제목 규칙(Barlow 600 · `lang` 속성) |
 * | ② 다출처 '+N곳'·'+N건' | 출처 2건 이상 — 다른 매체가 있으면 '+N곳', 같은 매체 기사만 더 있으면 '+N건' | 메타 줄 버튼 → 펼친 출처 목록(행마다 출처명·리더 점선·시각·↗, 기사 전부) |
 * | ③ 이적 | `cat === "transfer"`(도장) · `transfer` 있음(단계 줄) | 도장 "이적" + 펀치 구멍 4개 + 단계 글자 + Tier 배지 |
 * | ④ 한국 선수 | `kr` | 거터 "한국" 완장 + 한국 선수 태그 800 --ink |
 * | ⑤ 경기 결과 | `cat === "result"` | 도장 "경기 결과". 결과 가림 띠·`data-spoiler`는 M4-E(결과 가리기 토글) — 제목 바로 아래 자리 |
 * | ⑥ 한국어 보도 | `lang === "ko"` | 한글 제목 규칙(800 · 46em 줄 길이) |
 * | 머리기사 | 화면 모델 `lead` → `data-lead` | 1024 이상에서만 위 24 · 아래 22px, 아래 2px 잉크 괘선, 제목 한 단계 크게, 인덱스 탭 카드 높이 |
 * | 연결 줄 | 화면 모델 `link` → `data-paired` | 본문 맨 아래 "같은 소식 국내(해외) 보도 ···· 14 인터풋볼 ↓", 카드 아래 여백 4px(머리기사 ≥1024 12px) |
 *
 * 머리기사·연결 줄 모양은 카드 속성(`data-lead`·`data-paired`)에 건 변형이다 — 필터 결과(M1-33)에서는 필터 부트 스크립트·섬이 속성만 지워
 * 머리기사 없이(DECISIONS #13), 짝이 숨은 카드는 보통 아래 여백으로 그린다(`filterable`).
 *
 * 본문 순서(혼합안 그대로): 태그 줄(도장 + 태그) → 이적 단계 줄 → 원제목 → (결과 가림 띠 — M4-E) → 메타(출처명 · '+N곳' · 상대 시간 +
 * 절대 시각, 오른쪽 끝 카드 메뉴 버튼) → 펼친 출처 목록 → 연결 줄. 카드 메뉴(M1-35)는 버튼만 카드마다 있고, 메뉴("공유하기" — 그 호 날짜
 * 페이지 앵커, FR-34 · "오류 신고↗" — 카드 ID·발행 날짜를 채운 이슈 폼, FR-36)는 피드마다 하나를 섬이 연 카드로 옮긴다(src/components/news/card-menu.tsx).
 *
 * 서버 컴포넌트다(JS 0). 상대 시간·'+N곳' 펼침·카드 메뉴는 피드 섬 하나가 맡는다(src/components/news/feed-island.tsx) — 여기서는 그 섬이
 * 찾는 표식(`time[data-rel]`·`button[data-src-toggle]`·`button[data-menu-button]`)과 정적 폴백(절대 시각, 닫힌 목록·메뉴)만 그린다.
 * 원제목(`t`)·출처명(`src[].n`)은 고치지 않고, 요약 줄·"AI 작성" 라벨은 뉴스 카드에 없다(D23·D24).
 */

type TitleAs = "h2" | "h3";

export interface FeedCardProps {
  view: FeedCardView;
  /** 피드 카드 메뉴 id — 메뉴 버튼의 `aria-controls`(피드마다 메뉴 하나, M1-35) */
  menuId: string;
  /** 카드 제목 단계 — 피드 섹션 머리 바로 아래 단계 */
  titleAs: TitleAs;
  /**
   * 필터가 걸리는 피드(M1-33)인가 — 머리기사·연결 줄에 필터 표식(`data-nf-lead`·`data-nf-link`)을 단다. 필터 부트 스크립트·섬이
   * 필터 결과에서 머리기사 모양(`data-lead`)과 짝이 숨은 연결 줄(`hidden`·카드 `data-paired`)을 끈다
   */
  filterable?: boolean;
}

export function FeedCard({
  view,
  menuId,
  titleAs,
  filterable = false,
}: FeedCardProps) {
  const { card, lead, link, stack } = view;
  const titleId = `${card.id}-t`;
  const listId = `${card.id}-src`;
  const latin = card.lang !== "ko";

  return (
    <Card
      id={card.id}
      aria-labelledby={titleId}
      bleed
      // 값 없는 속성은 넘기지 않는다(RSC 페이로드에 카드마다 "$undefined"가 쌓이지 않게)
      {...(lead ? { "data-lead": "" } : {})}
      {...(lead && filterable ? { "data-nf-lead": "" } : {})}
      {...(link ? { "data-paired": "" } : {})}
      // 필터가 바꾸는 속성(data-lead·data-paired)이 있는 카드만
      {...(filterable && (lead || link)
        ? { suppressHydrationWarning: true }
        : {})}
      className={cn(
        // 머리기사·연결 줄 모양은 속성(`data-lead`·`data-paired`)에 건다 — 필터가 속성만 끄고 켠다(M1-33)
        lead &&
          "lg:data-lead:border-b-2 lg:data-lead:border-ink lg:data-lead:pt-6 lg:data-lead:pb-5.5",
        // 연결 줄(최소 40px)이 카드 아래 여백을 대신한다 — 혼합안 .card--paired 4px · 머리기사 12px
        link && "data-paired:pb-1 lg:data-paired:pb-1",
        link && lead && "lg:data-lead:data-paired:pb-3",
      )}
    >
      <CardGutter>
        <CardNumber n={view.no} />
        <ImportanceBar value={card.imp} />
        {card.kr ? <KoreanArmband /> : null}
      </CardGutter>
      <CardBody>
        <CardTags>
          <StampChip>{view.category}</StampChip>
          {view.tags.length > 0 ? <TagList tags={view.tags} /> : null}
        </CardTags>
        {view.transfer ? (
          <TransferStage
            status={view.transfer.status}
            tier={view.transfer.tier}
          />
        ) : null}
        <CardTitle
          id={titleId}
          as={titleAs}
          href={stack.lead.url}
          lang={card.lang}
          source={stack.lead.name}
          className={cn(
            lead &&
              (latin
                ? "lg:group-data-lead/card:mt-3 lg:group-data-lead/card:text-type-lead-latin lg:group-data-lead/card:tracking-[-0.004em]"
                : "lg:group-data-lead/card:mt-3 lg:group-data-lead/card:text-type-lead lg:group-data-lead/card:tracking-[-0.03em]"),
          )}
        >
          {card.t}
        </CardTitle>
        {/* 결과 가림 띠 자리(변형 ⑤ — M4-E 결과 가리기 토글이 여기에 띠를 끼우고 제목을 접는다) */}
        <CardMeta className={cn(lead && "lg:group-data-lead/card:mt-4")}>
          <SourceLine stack={stack} listId={listId} />
          <CardMenuButton cardId={card.id} titleId={titleId} menuId={menuId} />
        </CardMeta>
        {stack.more > 0 ? <SourceList id={listId} rows={stack.rows} /> : null}
        {link ? <LinkLine link={link} filterable={filterable} /> : null}
      </CardBody>
      <CardTabs>
        {view.comps.map((comp) => (
          <IndexTab key={comp.id} comp={comp.id} title={comp.name} lead={lead}>
            {comp.short}
          </IndexTab>
        ))}
      </CardTabs>
    </Card>
  );
}

// ─── 거터 ───────────────────────────────────────────────────────────────────

/** 중요도 막대 — 칸 5개(4×9px, 간격 2px): 채운 칸 --ink-2 면, 빈 칸 1px --ink-3 안쪽 테두리(DESIGN §9.3) */
export function ImportanceBar({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`중요도 ${value}/5`} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2.25 w-1",
            i <= value ? "bg-ink-2" : "inset-ring inset-ring-ink-3",
          )}
        />
      ))}
    </span>
  );
}

/** 한국 완장 — `kr` 데이터 기준(제목에 이름이 있어도 `kr:false`면 달지 않는다). 텍스트 "한국" + `title` "한국 선수 관련" */
export function KoreanArmband() {
  return (
    <span
      title="한국 선수 관련"
      className="inline-block bg-brand-accent px-0.75 pt-0.75 pb-0.5 text-[10.5px] leading-[1.2] font-extrabold tracking-[-0.02em] text-brand-accent-foreground"
    >
      한국
    </span>
  );
}

// ─── 태그 줄 ────────────────────────────────────────────────────────────────

/** 한국어 태그(팀·선수) — 사이 1px --rule 세로선(좌우 7px), 한국 선수만 800 --ink. 넘치면 줄바꿈 */
function TagList({ tags }: { tags: readonly CardTagView[] }) {
  return (
    // list-style: none인 목록의 의미를 Safari가 지우지 않게 role="list"
    <ul role="list" aria-label="태그" className="flex flex-wrap gap-y-0.5">
      {tags.map((tag) => (
        <li
          key={tag.slug}
          className={cn(
            "border-l border-rule px-1.75 first:border-l-0 first:pl-0",
            tag.korean && "font-extrabold text-ink",
          )}
        >
          {tag.label}
        </li>
      ))}
    </ul>
  );
}

// ─── 이적 단계 · Tier ───────────────────────────────────────────────────────

/** 펀치 구멍 지름 13px · 테두리 1.5px · 간격 3px(DESIGN §9.3) — 원은 border-radius가 아니라 SVG로 그린다(§9.1 rounded-* 금지) */
const HOLE = 13;
const HOLE_GAP = 3;
const HOLE_STROKE = 1.5;
const PUNCH_WIDTH =
  HOLE * TRANSFER_STAGE_HOLES + HOLE_GAP * (TRANSFER_STAGE_HOLES - 1);

/** 이적 단계 줄 — 펀치 구멍 4개(채운 수 = 단계) + 단계 글자 800 + Tier 배지. 결렬은 빈 구멍 위 2px 사선(−8°) */
export function TransferStage({
  status,
  tier,
}: {
  status: TransferStatus;
  tier: Tier;
}) {
  const stage = TRANSFER_STAGE[status];
  const official = status === "official";
  const collapsed = status === "collapsed";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
      <span
        role="img"
        aria-label={transferStageLabel(status)}
        className={cn(
          "relative inline-flex",
          collapsed &&
            "after:absolute after:-inset-x-0.75 after:top-1/2 after:h-0.5 after:-rotate-8 after:bg-transfer-collapsed after:content-['']",
        )}
      >
        <svg
          width={PUNCH_WIDTH}
          height={HOLE}
          viewBox={`0 0 ${PUNCH_WIDTH} ${HOLE}`}
          aria-hidden="true"
          focusable="false"
          className="block"
        >
          {Array.from({ length: TRANSFER_STAGE_HOLES }, (_, i) => {
            const on = i < stage.filled;
            return (
              <circle
                key={i}
                cx={HOLE / 2 + i * (HOLE + HOLE_GAP)}
                cy={HOLE / 2}
                r={(HOLE - HOLE_STROKE) / 2}
                strokeWidth={HOLE_STROKE}
                className={
                  on
                    ? official
                      ? "fill-transfer-official stroke-transfer-official"
                      : "fill-transfer-progress stroke-transfer-progress"
                    : "fill-none stroke-ink-2"
                }
              />
            );
          })}
        </svg>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "font-extrabold",
          official ? "text-brand-accent-text" : "text-ink",
        )}
      >
        {stage.label}
      </span>
      <TierBadge tier={tier} />
    </div>
  );
}

// ─── 메타 줄 · 출처 스택 ────────────────────────────────────────────────────

/**
 * 출처명(800 --ink, 텍스트만 — 로고 금지) · '+N곳'(다른 매체가 있음) 또는 '+N건'(같은 매체 추가 기사만 — 사용자 결정 2026-10-19) ·
 * 상대 시간 + 절대 시각. 두 버튼은 모양·펼침이 같고 숫자 단위와 화면 밖 안내만 다르다
 */
function SourceLine({
  stack,
  listId,
}: {
  stack: SourceStackView;
  listId: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
      <span lang={stack.lead.lang} className="font-extrabold text-ink">
        {stack.lead.name}
      </span>
      {stack.more > 0 ? (
        <button
          type="button"
          data-src-toggle=""
          aria-expanded="false"
          aria-controls={listId}
          className={cn(
            "relative -ml-1 border-b border-ink-2 bg-transparent px-1 py-0.5 text-[13px] leading-[1.2] font-extrabold text-ink",
            "transition-colors duration-fast ease-print hover:border-ink",
            "aria-expanded:border-brand-accent aria-expanded:text-brand-accent-text",
            // 터치 타깃: 보이는 높이 약 21px → 위 12px · 아래 13px 넓혀 44.6px(아래 1px 밑줄이 있어 테두리 상자 가운데 기준), 좌우 6px
            // (DESIGN §9.1). 혼합안 간격(제목 → 메타 9px · 메타 → 연결 줄 2px)에서는 이 영역이 위 제목 링크의 빈 아래 패딩·아래 연결 줄의
            // 빈 윗부분과 겹친다 — 보이는 글자끼리는 겹치지 않으므로 작은 버튼이 이기게 한다(z-1). 제목·연결 줄은 폭이 넓어 버튼과 겹치지
            // 않는 자리에 44px 띠가 남는다(e2e news-cards.spec)
            "after:absolute after:-inset-x-1.5 after:-top-3 after:-bottom-3.25 after:z-1 after:content-['']",
          )}
        >
          {stack.unit === "outlets" ? (
            <>
              +{stack.more}곳<span className="sr-only"> 출처 더 보기</span>
            </>
          ) : (
            <>
              +{stack.more}건
              <span className="sr-only"> 같은 매체 기사 더 보기</span>
            </>
          )}
        </button>
      ) : null}
      <CardTime at={stack.lead.at} />
    </div>
  );
}

/**
 * 시각 — `<time datetime="{UTC ISO}">` 안에 상대 시간(13px, 피드 섬이 채움) + 절대 시각(`--num-meta` "10.11 04:24", KST).
 * 정적 HTML은 절대 시각만 갖는다(빌드 때 굳은 상대 시간이 틀린 채 남지 않게).
 *
 * 상대 시간 칸은 처음부터 자리를 잡는다(M1-31 실측): 섬이 글자를 채울 때 칸이 0 → 글자 폭으로 늘면 메타 줄이 1px 높아지고(기준선
 * 정렬) 좁은 폭에서는 시각이 다음 줄로 넘어가, 공유 앵커(`#카드ID`)로 연 375 화면에서 CLS가 0.16까지 올랐다. 그래서 같은 격자 칸에
 * 보이지 않는 치수 글자 "00시간 전"(가상 요소 — DOM 글자·접근 이름에 들어가지 않는다)을 깔아 높이·폭을 고정하고, 실제 글자는 칸
 * 오른쪽에 붙인다(상대·절대 시각 한 덩어리 간격 8px 유지). "방금"·"어제"·"N분 전"·"N시간 전"·"N일 전"은 이 폭 안에 든다 — 7일이
 * 넘은 날짜 표기만 칸을 넓힌다(오래된 호를 볼 때).
 */
export function CardTime({ at }: { at: string }) {
  return (
    <time
      dateTime={at}
      data-rel=""
      className="inline-flex items-baseline gap-2 whitespace-nowrap"
    >
      <span className="grid before:invisible before:col-start-1 before:row-start-1 before:content-['00시간_전']">
        <span
          data-rel-out=""
          className="col-start-1 row-start-1 justify-self-end"
        />
      </span>
      <span className="font-numeric text-num-meta leading-none font-semibold tracking-[0.02em]">
        {formatKst(at, "short")}
      </span>
    </time>
  );
}

/**
 * 펼친 출처 목록 — 위 1px 점선 --ink-3, 행 = 출처명 800 + 리더 점선 + 시각(Barlow 600 14.5px --ink-2) + ↗(원문, 새 창).
 * 행 높이 45px(최소 44px 규칙): 행이 위아래로 맞붙은 누름 대상이라, 정확히 44px면 소수점 위치에서 경계 0.5px가 옆 행으로 넘어갔다(e2e).
 */
function SourceList({ id, rows }: { id: string; rows: readonly SourceView[] }) {
  return (
    <ol
      id={id}
      hidden
      role="list"
      className="mt-1.5 border-t border-dotted border-ink-3"
    >
      {rows.map((row, index) => (
        <li key={index}>
          <a
            href={row.url}
            target="_blank"
            rel="noopener"
            className="group/src flex min-h-11.25 items-baseline gap-2 pt-3 text-[13.5px] text-ink no-underline"
          >
            <span
              lang={row.lang}
              className="font-extrabold underline-offset-3 group-hover/src:underline"
            >
              {row.name}
            </span>
            <span
              aria-hidden="true"
              className="min-w-4 flex-1 -translate-y-0.75 border-b-2 border-dotted border-ink-3"
            />
            <time
              dateTime={row.at}
              className="font-numeric text-[14.5px] leading-none font-semibold text-ink-2"
            >
              {formatKst(row.at, "short")}
            </time>
            <span aria-hidden="true">↗</span>
            <span className="sr-only">(새 창)</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

// ─── 연결 줄 ────────────────────────────────────────────────────────────────

/**
 * 같은 사건 연결 줄 — "같은 소식 국내 보도 ···· 14 인터풋볼 ↓"(DESIGN §9.3). 짝 카드 앵커로 가는 같은 페이지 링크(JS 0 — 도착 강조는
 * 카드의 `:target`). 최소 40px(터치 44px), hover 매체명 밑줄 2px --brand-accent. 번호 앞 화면 밖 "게재 번호 ".
 * 좁은 폭에서는 리더 점선(기본 72px)이 먼저 최소 12px까지 줄고(매체명 줄어듦 계수 0.001 — 혼합안처럼 매체명은 그대로), 그래도
 * 넘치면(긴 라틴 매체명) 매체명이 그 칸 안에서 낱말 단위로 줄을 바꾼다 — 가로로 넘치지 않는다.
 */
export function LinkLine({
  link,
  filterable = false,
}: {
  link: LinkLineView;
  /** 필터가 걸리는 피드 — 짝 카드가 숨으면 줄도 숨긴다(`data-nf-link`, M1-33) */
  filterable?: boolean;
}) {
  return (
    <a
      href={`#${link.targetId}`}
      {...(filterable
        ? { "data-nf-link": "", suppressHydrationWarning: true }
        : {})}
      className={cn(
        "group/jump relative mt-0.5 flex min-h-10 items-center gap-2 text-type-meta text-ink-2 no-underline",
        "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
      )}
    >
      <span className="flex-none">
        같은 소식 {link.targetKind === "domestic" ? "국내" : "해외"} 보도
      </span>
      <span
        aria-hidden="true"
        className="min-w-3 flex-[0_1_72px] translate-y-0.5 border-b-2 border-dotted border-ink-3"
      />
      <span className="flex-none font-numeric text-num-meta leading-none font-semibold tracking-[0.06em] tabular-nums">
        <span className="sr-only">게재 번호 </span>
        {String(link.targetNo).padStart(2, "0")}
      </span>
      <span
        lang={link.targetSource.lang}
        className="min-w-0 shrink-[0.001] font-extrabold [overflow-wrap:break-word] text-ink decoration-brand-accent decoration-2 underline-offset-3 group-hover/jump:underline"
      >
        {link.targetSource.name}
      </span>
      <span
        aria-hidden="true"
        className="flex-none font-extrabold text-brand-accent-text"
      >
        {link.direction === "down" ? "↓" : "↑"}
      </span>
    </a>
  );
}
