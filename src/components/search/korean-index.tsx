import Link from "next/link";

import { routes } from "@/lib/paths";
import { groupByInitial, type IndexEntry } from "@/lib/search/model";

/**
 * 검색 오버레이 입력 전 = 책 뒤 색인(C) — 활동 중인 한국 선수 가나다 (DESIGN §9.3 "검색 오버레이 · 색인", 혼합안 `.gix`, plan M4-14).
 * 서버 컴포넌트(JS 0) — 검색 버튼 섬에 `index`로 넘겨 오버레이가 열릴 때 그린다(첫 화면이 비지 않는다).
 * 초성 칸(24px `--brand-accent-text`, 장식 — 목록 이름이 같은 글자) · 이름 800 · 리더 점선 · 영문 Barlow 600. 1024 이상 판은 2열.
 */
export function KoreanIndex({ players }: { players: readonly IndexEntry[] }) {
  const groups = groupByInitial(players);
  return (
    <div className="px-3.5 pt-3 pb-3.5 lg:px-5.5 lg:pt-4 lg:pb-4.5">
      <p className="text-[12.5px] text-ink-2">
        색인 — 한국 선수 <span className="tabular-nums">{players.length}</span>{" "}
        · 선수·팀은 한글·영문 이름으로 찾아요
      </p>
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 lg:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.initial}
            className="grid grid-cols-[36px_minmax(0,1fr)] items-start border-t border-ink pt-1"
          >
            <p
              aria-hidden="true"
              className="text-2xl leading-[1.4] font-extrabold text-brand-accent-text"
            >
              {group.initial}
            </p>
            <ul aria-label={group.initial}>
              {group.entries.map((entry) => (
                <li key={entry.slug} className="[&:last-child>a]:border-b-0">
                  <Link
                    href={routes.koreanPlayer(entry.slug)}
                    className="group/ix flex min-h-11 items-baseline gap-2 border-b border-rule pt-2.75 pb-1 text-[15px] text-ink no-underline"
                  >
                    <span className="font-extrabold whitespace-nowrap underline-offset-3 group-hover/ix:underline">
                      {entry.nameKo}
                    </span>
                    <span
                      aria-hidden="true"
                      className="min-w-3 flex-1 translate-y-1 self-center border-b-2 border-dotted border-ink-3"
                    />
                    <span
                      lang="en"
                      className="font-numeric text-[13px] leading-none font-semibold tracking-[0.06em] whitespace-nowrap text-ink-2"
                    >
                      {entry.nameEn}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
