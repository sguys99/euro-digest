import { AiLabel } from "@/components/ui/ai-label";
import { SectionHead } from "@/components/ui/section-head";
import type { TeamProfileView } from "@/lib/team-profile-view";

/**
 * 팀 한줄평 · 강점/약점 단 (PRD FR-53 · FR-56, §15 D64 ⑥, DESIGN §9.3 "문단 블록 · AI 라벨" · §11.28, plan M4-06 화면 부분)
 *
 * 서버 컴포넌트 — JS 0. 자리는 D2 혼합안 견본 '팀 한줄평 · 강점/약점 자리'(`docs/design/d2/concept-mix.html` — 팀 티켓 바로 아래 · 팀시트 위).
 * - 얇은 섹션 머리(1px `--ink` — 혼합안 `.prof` 위 괘선) "팀 한줄평" + PROFILE → 머리 줄 = **'AI 작성' 라벨 한 번**(주간 총평과 같은
 *   `AiLabel` — `/about/#ai` 링크) + 생성 날짜(Barlow 600 `--ink-2`, KST · 7일 이상이면 "n주 전") + "그날까지 기록 기준" → 한줄평 문단
 *   `--text-dek`(16.5 / 19px 400, `max-width: 46em`) → 강점 · 약점 2단(혼합안 `.prof__sw` — 머리 12px 800 `--ink-2` + 아래 1px `--ink`,
 *   행 최소 40px · 아래 1px `--rule`, 번호 Barlow 800 15px).
 * - **색만으로 구분하지 않는다**: 두 단은 같은 색이고 머리 글자 '강점' · '약점' + 기호(＋ · −, 장식 `aria-hidden`)로 가른다.
 * - 문단 안 줄마다 라벨을 붙이지 않는다(5줄만 줄마다 — D24). 블록이 보이면 늘 LLM 문장이다(팀 프로필은 템플릿 강등이 없다 — M4-05).
 */
export function TeamProfile({
  profile,
  headingId,
  className,
}: {
  profile: TeamProfileView;
  headingId: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-slot="team-profile"
      className={className}
    >
      <SectionHead
        heading="팀 한줄평"
        headingId={headingId}
        runningHead="PROFILE"
        thin
      />
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-2">
        <AiLabel />
        <span>
          <time
            dateTime={profile.generatedAt}
            className="font-numeric text-[13px] font-semibold tabular-nums"
          >
            {profile.dateText}
          </time>{" "}
          생성
          {profile.weeksAgo !== null ? (
            <>
              {" "}
              ·{" "}
              <span className="font-numeric text-[13px] font-semibold tabular-nums">
                {profile.weeksAgo}
              </span>
              주 전
            </>
          ) : null}{" "}
          · 그날까지 기록 기준
        </span>
      </p>
      <p className="mt-2.5 max-w-[46em] text-type-dek break-keep">
        {profile.oneLiner}
      </p>
      <div className="mt-2 grid max-w-[46rem] grid-cols-2 gap-x-4">
        <PointList
          title="강점"
          mark="+"
          items={profile.strengths}
          id={`${headingId}-s`}
        />
        <PointList
          title="약점"
          mark="−"
          items={profile.weaknesses}
          id={`${headingId}-w`}
        />
      </div>
    </section>
  );
}

/** 강점 · 약점 한 단 — 머리(기호 + 글자) + 번호 목록 2행 */
function PointList({
  title,
  mark,
  items,
  id,
}: {
  title: "강점" | "약점";
  mark: string;
  items: readonly string[];
  id: string;
}) {
  return (
    <div data-slot="team-profile-points" data-kind={title} className="min-w-0">
      <h3
        id={id}
        className="flex items-baseline gap-1.5 border-b border-ink pt-2.5 pb-1.5 text-xs font-extrabold text-ink-2"
      >
        <span
          aria-hidden="true"
          className="w-3 font-numeric text-[15px] leading-none font-extrabold text-ink"
        >
          {mark}
        </span>
        {title}
      </h3>
      {/* list-style: none 목록의 의미를 Safari가 지우지 않게 role="list"(DESIGN §9.3 5줄 행과 같은 처리) */}
      <ol role="list" aria-labelledby={id}>
        {items.map((text, i) => (
          <li
            key={i}
            className="grid min-h-10 grid-cols-[22px_minmax(0,1fr)] items-baseline gap-x-1.5 border-b border-rule py-2.5"
          >
            <span
              aria-hidden="true"
              className="font-numeric text-[15px] leading-none font-extrabold tabular-nums"
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug break-keep">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
