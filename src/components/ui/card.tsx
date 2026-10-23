import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Card — 뉴스 카드 껍데기 (DESIGN.md §9.2 Card, D0-12)
 *
 * 카드는 면·테두리 상자가 아니라 괘선 사이의 한 줄(스쿼드 명단 한 줄)이다. shadcn Card의 `rounded-xl border shadow-sm`
 * 모양을 쓰지 않는다. 이 파일은 격자와 상태(hover·focus·:target)·원제목 링크 규칙만 맡고, 내용(태그·출처 스택·중요도·완장·
 * 이적 단계·연결 줄·머리기사)은 src/components/news/feed-card.tsx(M1-31)가 슬롯에 채운다. 카드 메뉴는 메타 줄 오른쪽 끝(news/card-menu.tsx, M1-35).
 *
 * ```tsx
 * <Card id="c_d8ecc21d28" aria-labelledby="c_d8ecc21d28-t" bleed>
 *   <CardGutter>
 *     <CardNumber n={19} />
 *     {중요도 막대 · 한국 완장}
 *   </CardGutter>
 *   <CardBody>
 *     <CardTags>{도장 칩 · 태그 줄}</CardTags>
 *     <CardTitle id="c_d8ecc21d28-t" href={원문 URL} lang="en" source="BBC Sport">{원제목}</CardTitle>
 *     <CardMeta>{출처·시각 · 메뉴 버튼}</CardMeta>
 *   </CardBody>
 *   <CardTabs>{인덱스 탭}</CardTabs>
 * </Card>
 * ```
 *
 * | 상태          | 규칙 |
 * |---------------|------|
 * | hover         | 게재 번호 --brand-accent(카드 위), 제목 링크 밑줄 2px --brand-accent·3px 띄움(링크 위). fast |
 * | focus-visible | 포커스 대상은 제목 링크(카드 자체는 링 없음) — globals.css 3px --ring |
 * | 선택 `:target` | 면 --paper-2 + 왼쪽 안쪽 4px --brand-accent 막대, 거터 10px 들여씀, 도착 모션(`animate-arrive`, slow) |
 * | 비활성        | 해당 없음(결과 가림은 M4-15 변형) |
 *
 * 카드 전체를 링크로 감싸지 않는다. 제목 링크와 보조 동작(공유·메뉴·'+N곳')을 나눈다. 서버 컴포넌트라 JS를 만들지 않는다.
 */

/** 카드·5줄 행·스켈레톤 공통 행 격자 `[--gutter │ 본문 │ --tab-w]`, 열 간격 10px(≥1024 14px) — DESIGN §4.3 */
export const ROW_GRID =
  "grid grid-cols-[var(--gutter)_minmax(0,1fr)_var(--tab-w)] gap-x-2.5 lg:gap-x-3.5";

export interface CardProps extends ComponentProps<"article"> {
  /** 카드 ID(`c_` + 16진수 10자리) — 공유 앵커(`#카드ID`)·`:target` 도착 */
  id: string;
  /** 제목 요소 id */
  "aria-labelledby": string;
  /**
   * 1023 이하에서 오른쪽으로 --edge만큼 넘쳐 인덱스 탭을 화면 가장자리에 붙인다(DESIGN §4.3).
   * 피드 안 카드에서 켜고, 견본 틀·상자 안에서는 끈다. 기본 false
   */
  bleed?: boolean;
}

export function Card({ bleed = false, className, ...props }: CardProps) {
  return (
    <article
      className={cn(
        ROW_GRID,
        "group/card relative border-b border-rule pt-3.75 pb-3.25 lg:pt-4.5 lg:pb-3.75",
        // 선택(:target) — 보조 지면 + 왼쪽 4px 레드 막대(안쪽) + 도착 모션
        "target:animate-arrive target:bg-paper-2 target:shadow-[inset_4px_0_0_var(--brand-accent)]",
        bleed && "-mr-edge lg:mr-0",
        className,
      )}
      {...props}
    />
  );
}

/** 거터(첫 열) — 게재 번호 → 중요도 막대 → 한국 완장, 세로 간격 7px(≥1024 8px). :target이면 10px 들여씀 */
export function CardGutter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1.75 group-target/card:pl-2.5 lg:gap-2",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 게재 번호 — 이 호의 게재 순서(순위 아님, DESIGN §3.5). 06부터 2자리 0 채움, `--num-card-no` Barlow 600 `--ink-2`,
 * 카드 hover면 --brand-accent. 장식이라 `aria-hidden`(목록 의미로 순서를 준다).
 */
export function CardNumber({
  n,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { n: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pt-0.75 font-numeric text-num-card-no leading-none font-semibold tracking-[0.06em] text-ink-2 tabular-nums",
        "transition-colors duration-fast ease-print group-hover/card:text-brand-accent",
        className,
      )}
      {...props}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** 본문(가운데 열) */
export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

/** 태그 줄 — 도장 칩 + 태그(간격 세로 5px · 가로 8px), --text-tag --ink-2 */
export function CardTags({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1.25 text-type-tag text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

export interface CardTitleProps extends Omit<
  ComponentProps<"h3">,
  "children" | "lang"
> {
  /** 제목 요소 id(카드의 `aria-labelledby`) */
  id: string;
  /**
   * 제목 단계(기본 h3 — 홈처럼 h2 섹션 머리 아래). 피드 바로 위가 페이지 h1이면 h2(`/news/` — 단계 건너뜀 방지, axe heading-order).
   * 모양은 같다.
   */
  as?: "h2" | "h3";
  /** 원문 URL(새 창) */
  href: string;
  /** 원제목 언어(`ko`·`en`·`it`·`es` …). `ko`가 아니면 라틴 규칙(Barlow 600, --text-card-latin, word-break: normal) */
  lang: string;
  /** 출처명 — 화면 밖 안내 "(원문 {출처}, 새 창)" */
  source: string;
  /** 원제목 — 피드 그대로(자르기·고치기·`text-transform` 금지, D23) */
  children: string;
  /** 링크(`<a>`)에 더 줄 속성 — 클래스·data-* 등(href·target·rel은 이 컴포넌트가 정한다) */
  linkProps?: Omit<
    ComponentProps<"a">,
    "href" | "target" | "rel" | "children"
  > & {
    [key: `data-${string}`]: string | undefined;
  };
}

/** 원제목의 마지막 단어 앞까지와 마지막 단어 — 마지막 단어와 ↗를 붙여 ↗ 홀로 줄바꿈을 막는다(DESIGN §3.6) */
export function splitLastWord(title: string): [head: string, last: string] {
  const trimmed = title.replace(/\s+$/u, "");
  const index = trimmed.search(/\S+$/u);
  return index <= 0
    ? ["", trimmed]
    : [trimmed.slice(0, index), trimmed.slice(index)];
}

/**
 * 짧은 하이픈 단어 — 공백으로 나뉜 한 낱말이 하이픈(또는 스코어의 en dash) 하나로 이어지고 양쪽이 8자 이하(`10-man`·`2-2`·`2–1`).
 * 하이픈 뒤 줄바꿈("10-" / "man")을 막으려고 붙여 쓴다(DESIGN §3.6). 하이픈이 둘 이상인 낱말(`end-of-season`)·긴 낱말은 그대로 둔다 —
 * 붙여 쓴 덩어리가 좁은 폭에서 넘치지 않게(최대 17자).
 */
const SHORT_HYPHEN_WORD_RE =
  /(?<=^|\s)[^\s\-–]{1,8}[-–][^\s\-–]{1,8}(?=\s|$)/gu;

/** 원제목 조각 — 이어 붙이면 원문과 같다(글자를 바꾸지 않는다, D23). `nobr`이면 줄바꿈 없이 붙여 쓴다 */
export interface TitleSegment {
  text: string;
  nobr: boolean;
}

/** 원제목(마지막 단어 앞까지)을 짧은 하이픈 단어 기준으로 나눈다 */
export function titleSegments(text: string): TitleSegment[] {
  const out: TitleSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SHORT_HYPHEN_WORD_RE)) {
    const start = match.index;
    if (start > cursor)
      out.push({ text: text.slice(cursor, start), nobr: false });
    out.push({ text: match[0], nobr: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), nobr: false });
  return out;
}

/**
 * 제목 + 원문 링크(카드의 포커스 대상). 링크는 위아래 패딩으로 누르는 영역을 44px 이상으로 넓히고(인라인이라 줄 높이는 그대로),
 * hover면 밑줄 2px --brand-accent(3px 띄움). 끝에 외부 표식 ↗(`aria-hidden`) + 화면 밖 "(원문 {출처}, 새 창)".
 * 한글 제목은 46em에서 줄을 끊는다(DESIGN §4.3). 짧은 하이픈 단어와 마지막 단어 + ↗는 붙여 쓴다(DESIGN §3.6).
 *
 * 패딩(M1-31): 인라인 링크 상자의 높이 = 글꼴 내용 영역 + 위아래 패딩이다. 라틴(Barlow 1.2em) 21px → 25.2 + 20 = 45px이지만
 * 한글(EuroDigest Sans 1.193em) 16.5px → 19.7 + 20 = 40px라 44px에 못 미쳤다(D0-12 이월) → 한글은 13px(45.7px · ≥1024 18px 47.5px).
 */
export function CardTitle({
  id,
  as: Heading = "h3",
  href,
  lang,
  source,
  children,
  linkProps,
  className,
  ...props
}: CardTitleProps) {
  const latin = lang !== "ko";
  const [head, last] = splitLastWord(children);
  const segments = titleSegments(head);
  return (
    <Heading
      id={id}
      lang={lang}
      className={cn(
        "mt-2 text-pretty",
        latin
          ? "font-latin text-type-card-latin font-semibold tracking-[0.002em] [word-break:normal]"
          : "max-w-[46em] text-type-card font-extrabold tracking-[-0.015em]",
        className,
      )}
      {...props}
    >
      <a
        {...linkProps}
        href={href}
        target="_blank"
        rel="noopener"
        className={cn(
          // relative: 위아래 패딩이 다음 메타 줄(위 9px)과 겹친다 — 위치 지정 요소로 올려 그 패딩까지 누르는 영역으로 남긴다
          "relative no-underline decoration-brand-accent decoration-2 underline-offset-3 hover:underline",
          latin ? "py-2.5" : "py-3.25",
          linkProps?.className,
        )}
      >
        {segments.map((segment, index) =>
          segment.nobr ? (
            <span key={index} className="whitespace-nowrap">
              {segment.text}
            </span>
          ) : (
            segment.text
          ),
        )}
        <span className="whitespace-nowrap">
          {last}
          <ExternalMark />
        </span>
        <span className="sr-only">{`(원문 ${source}, 새 창)`}</span>
      </a>
    </Heading>
  );
}

/** 외부 링크 표식 ↗ — 한글 서체 400, 0.62em, --ink-2, 장식(DESIGN §9.1 외부 링크) */
function ExternalMark() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block align-[0.25em] font-sans text-[0.62em] font-normal text-ink-2"
    >
      ↗
    </span>
  );
}

/** 메타 줄 — 위 9px, --text-meta --ink-2. 왼쪽에 출처·시각, 오른쪽 끝에 메뉴 버튼(M1-31) */
export function CardMeta({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-2.25 flex items-start gap-2 text-type-meta text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

/** 오른쪽 열 — 인덱스 탭(대회가 둘이면 2px 간격으로 쌓음). 대회 없는 카드는 빈 열 */
export function CardTabs({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)} {...props}>
      {children}
    </div>
  );
}
