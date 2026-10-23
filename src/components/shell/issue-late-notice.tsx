import type { IssueMeta } from "@/lib/issue";
import { issueLateScript, type LateWindow } from "@/lib/issue-late";
import { formatKst, kstDayRangeUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * 발행 지연 안내 — 상태 화면 ③ 오류 "마지막 정상 데이터 + 안내" (PRD DR-07 · FR-153 · §15 D26·D48·D49, DESIGN.md §9.3 상태 화면 4종 ③,
 * 혼합안 `concept-mix.html` `.err`, plan M1-37)
 *
 * 아침 발행이 실패·지연되면 사이트는 전날 빌드 그대로다(D49). 지금이 오늘(KST) 공개 목표 + 15분(D48 — 여름 07:15 · 겨울 07:45) 뒤인데
 * 이 빌드의 최신 호가 오늘보다 앞이면 홈·`/news/` 맨 위에 상자를 보이고, 그 아래는 마지막 정상 지면(지금 페이지) 그대로다.
 * 날짜 아카이브(지난 호)·소개·404에는 싣지 않는다.
 *
 * - 상자는 정적 HTML에 두고 CSS로 숨긴다(`hidden issue-late:block`). 바로 뒤 인라인 스크립트가 첫 페인트 전에 `<html data-issue-late>`를
 *   달면 보인다 — 상자가 칠해지기 전에 정해져 아래 지면이 밀리지 않는다(CLS 0, M1-33 보류 스크립트와 같은 방식). 클라이언트 이동으로
 *   들어오면 셸 섬이 같은 판정을 한다(src/components/shell/status-island.tsx). 판정·구간은 src/lib/issue-late.ts · src/lib/issue.ts.
 * - 문구는 UI 안내와 사실만(DESIGN §9.3): 제목 "오늘 호 발행이 늦어지고 있어요"(지금 시각과 이 빌드의 최신 호로 확인되는 사실) + 지금 지면이
 *   마지막으로 발행된 호라는 안내(호 날짜·호수 = 빌드 값). 원인("검증 실패"·"확인 중")은 이 페이지가 알 수 없어 쓰지 않는다.
 * - `role="status"` 바깥 상자는 늘 있고 안쪽만 보였다 숨긴다(라이브 영역은 먼저 있어야 내용 변화를 읽는다).
 * - `visible`은 견본(SPECIMEN)용 — 스크립트 없이 늘 보인다.
 */
export function IssueLateNotice({
  issue,
  windows,
  visible = false,
}: {
  issue: IssueMeta;
  windows: readonly LateWindow[];
  visible?: boolean;
}) {
  const dateLabel = formatKst(kstDayRangeUtc(issue.date).start, "date");
  return (
    <>
      {/* data-nosnippet: 평소 숨은 안내가 검색 발췌가 되지 않게(렌더하는 크롤러의 시계가 늦음 구간일 수 있다) */}
      <div
        role="status"
        data-slot="issue-late"
        data-issue-date={issue.date}
        data-nosnippet=""
      >
        <div
          data-slot="issue-late-box"
          className={cn(
            "mb-4 border border-ink bg-paper-2 px-3.5 py-3",
            !visible && "hidden issue-late:block",
          )}
        >
          <p className="text-[15px] font-extrabold">
            오늘 호 발행이 늦어지고 있어요
          </p>
          <p className="mt-1 text-[13.5px] text-ink-2">
            지금 보이는 지면은 마지막으로 발행된{" "}
            <b className="font-extrabold whitespace-nowrap text-ink">
              <time dateTime={issue.date} className="normal-nums">
                {dateLabel}
              </time>
              {issue.no !== null ? ` 제 ${issue.no}호` : " 호"}
            </b>
            예요.
          </p>
        </div>
      </div>
      {visible ? null : (
        // 첫 페인트 전 판정(빌드 값 숫자뿐 — 외부 입력 없음). 상자 바로 뒤라 상자가 칠해지기 전에 실행된다
        <script
          data-slot="issue-late-script"
          dangerouslySetInnerHTML={{ __html: issueLateScript(windows) }}
        />
      )}
    </>
  );
}
