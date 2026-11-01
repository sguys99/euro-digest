import type { Metadata } from "next";

import { NationalHome } from "@/components/national-team/national-team";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import {
  loadNationalHome,
  nationalNewsTags,
  type NationalHomeData,
} from "@/lib/data/national-page";

/**
 * 홈 A매치 섹션 견본(M3-13 — PRD FR-71) — `SPECIMEN=1` 빌드 전용(`/specimen/national/`, 공개 빌드에 없음). 실제 홈은 빌드 시각의 KST 날짜가
 * A매치 기간일 때만 섹션을 싣는데, 공개 빌드 날짜가 기간 밖이면 보이지 않는다 — 여기서는 **시각을 주입해**(`loadNationalHome(now)`) 실제
 * 설정(`configs/national-team.json`)으로 같은 컴포넌트를 싣는다(tests/e2e-specimen/national.spec.ts · 스크린샷 비교).
 *  - 11-12(기간 안 · 경기 전 — 예정 2경기) : 앱 셸 홈 자리(5줄 바로 아래 자리 — 5줄은 생략)
 *  - 11-18(첫 경기 뒤 · 결과 입력 전 — 결과 대기 2경기) · 10-07(9·10월 기간 끝 — 결과 4경기, 소집 명단은 11월 명단이라 숨김)
 * 대표팀 소식은 주입한 시각 기준 최근 30일 호(10-07 견본은 그 뒤 호의 카드도 실린다 — 견본 한계, 실제 빌드는 미래 호가 없다).
 */

export const metadata: Metadata = {
  title: "A매치 견본",
  robots: { index: false, follow: false },
};

const VARIANTS = [
  ["1112", "2026-11-12T03:00:00Z", "11월 12일 — 기간 안 · 경기 전"],
  ["1118", "2026-11-18T03:00:00Z", "11월 18일 — 경기 뒤 · 결과 입력 전"],
  ["1007", "2026-10-07T03:00:00Z", "10월 7일 — 9·10월 기간 끝 · 결과 4경기"],
] as const;

function load(iso: string): NationalHomeData {
  const data = loadNationalHome(new Date(iso));
  if (!data)
    throw new Error(
      `A매치 기간이 아님: ${iso} — configs/national-team.json 확인`,
    );
  return data;
}

export default function SpecimenNationalPage() {
  const { issue } = loadLatestIssue();
  const tagsOf = nationalNewsTags();
  const [first, ...rest] = VARIANTS;
  return (
    <AppShell current="home" issue={issue}>
      <div data-specimen={`national-${first[0]}`}>
        <NationalHome
          data={load(first[1])}
          headingId={`home-national-${first[0]}-h`}
          tagsOf={tagsOf}
        />
      </div>
      {rest.map(([id, iso, label]) => (
        <section
          key={id}
          aria-labelledby={`spec-national-${id}-h`}
          className="mt-14"
        >
          <SectionHead
            heading={`견본 — ${label}`}
            headingId={`spec-national-${id}-h`}
            runningHead="SPECIMEN"
          />
          <div data-specimen={`national-${id}`} className="mt-6">
            <NationalHome
              data={load(iso)}
              headingId={`home-national-${id}-h`}
              tagsOf={tagsOf}
            />
          </div>
        </section>
      ))}
    </AppShell>
  );
}
