/**
 * `/privacy` 개인정보 처리방침 — 절(앵커) 목록 · 시행일 · 변경 이력 · 브라우저 저장 항목 (PRD FR-141 · NFR-08 · §15 D7 · D75, plan M5-05)
 *
 * 순수 모듈(I/O 없음). 저장 항목 표는 코드의 실제 저장 키 상수에서 만든다 — 새 키가 생기면 tests/privacy-page.test.ts가
 * src/ 전체의 `ed-` 문자열 · `localStorage` 접근 파일을 훑어 이 목록과 대조하고 실패한다(목록에 사람이 읽는 설명을 더해야 통과).
 *
 * 문구는 코드 · PRD 결정 · 공식 문서에 근거가 있는 사실만 쓴다(CLAUDE §1-7). GoatCounter 관련 사실의 출처:
 * - https://www.goatcounter.com/help/privacy — 쿠키 · localStorage를 쓰지 않음, IP · 전체 User-Agent · 추적 ID를 저장하지 않음,
 *   브라우저 · OS 이름과 버전만 남김, 국가는 IP로 판단, 사이트 + IP + User-Agent를 메모리에 최대 8시간, 제3자 공유 없음,
 *   저장 서버 Hetzner(핀란드 · 독일)
 * - https://www.goatcounter.com/help/sessions — IP · User-Agent는 데이터베이스나 디스크에 저장하지 않음
 * - https://gc.zgo.at/count.v5.js(우리가 싣는 버전 고정 판 — src/lib/goatcounter.ts SRI) — 보내는 값 p · r · t · e · s(가로 · 세로 · 픽셀 비율) ·
 *   b(자동화 브라우저 판정) · q(우리는 지운다), `#toggle-goatcounter`로 들어오면 localStorage `skipgc`를 켜고 끈다(영어 알림 창)
 * - GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages "Data collection" — 방문자 IP를
 *   보안 목적으로 기록 · 보관
 */
import { FOLLOW_LIMITS, FOLLOW_STORAGE_KEY } from "./follow";
import { ONBOARDING_STORAGE_KEY } from "./onboarding";
import { routes } from "./paths";
import { STORAGE_PROBE_KEY } from "./safe-storage";
import { SW_DATA_LIMIT } from "./sw/policy";
import { SPOILER_STORAGE_KEY, THEME_STORAGE_KEY } from "./theme";

/** 절 — 차례(1024 이상 왼쪽 목차 열 · 1023 이하 2열 × 3행)와 앵커. 앵커 id는 공유 링크가 되므로 바꾸지 않는다 */
export const PRIVACY_SECTIONS = [
  { id: "analytics", title: "방문 통계", runningHead: "ANALYTICS" },
  {
    id: "not-collected",
    title: "모으지 않는 것",
    runningHead: "NOT COLLECTED",
  },
  {
    id: "storage",
    title: "브라우저 저장",
    runningHead: "ON THIS DEVICE",
  },
  { id: "ai", title: "AI와 개인 정보", runningHead: "AI INPUT" },
  { id: "elsewhere", title: "호스팅과 바깥 링크", runningHead: "ELSEWHERE" },
  { id: "changes", title: "문의·변경 이력", runningHead: "CHANGES" },
] as const;

export type PrivacySectionId = (typeof PRIVACY_SECTIONS)[number]["id"];

/** `/privacy/` 또는 `/privacy/#절` 라우트(basePath 없음 — `next/link` href) */
export function privacyHref(section?: PrivacySectionId): string {
  return section ? `${routes.privacy()}#${section}` : routes.privacy();
}

/** 시행일(KST 날짜) — 처음 게시한 날 */
export const PRIVACY_EFFECTIVE_DATE = "2026-11-03";

/** 변경 이력 — 최신이 앞. 내용을 바꾸면 한 줄을 더하고 시행일도 함께 바꾼다 */
export const PRIVACY_CHANGES: readonly { date: string; note: string }[] = [
  { date: "2026-11-03", note: "처음 게시했습니다." },
];

/** GoatCounter 스크립트(count.v5.js)가 쓰는 저장 키 — `#toggle-goatcounter`로 켜고 끈다. 우리 코드에는 없는 키 */
export const GOATCOUNTER_SKIP_KEY = "skipgc";

/** 방문 통계를 켜고 끄는 주소 조각(count.js가 페이지를 열 때 `location.hash`로 본다) */
export const GOATCOUNTER_TOGGLE_HASH = "#toggle-goatcounter";

/** 서비스 워커가 그 밖에 열어 본 페이지를 남기는 상한(scripts/lib/service-worker.ts `RUNTIME_PAGE_LIMIT`와 같은 값 — 테스트 대조) */
export const OFFLINE_RUNTIME_PAGE_LIMIT = 12;

/** 마이 팀 자료 파일 저장 상한(src/lib/sw/policy.ts) */
export const OFFLINE_DATA_LIMIT = SW_DATA_LIMIT;

export interface StorageItem {
  /** 저장 키 — 화면에는 내지 않는다(사람이 읽는 이름 `name`만) */
  key: string;
  /** 누가 쓰는가 — 이 사이트 코드 · GoatCounter 스크립트 */
  owner: "site" | "goatcounter";
  /** 사람이 읽는 이름 */
  name: string;
  /** 무엇을 저장하는가 */
  stores: string;
  /** 지우는 법(브라우저 사이트 데이터 지우기 말고 화면에서 할 수 있는 것) */
  clear: string;
}

/**
 * 브라우저 localStorage 항목 — 모두 이 기기의 이 브라우저에만 있다. 순서 = 화면 순서.
 * 쿠키 · sessionStorage · IndexedDB는 쓰지 않는다(테스트가 src/에서 확인).
 */
export const STORAGE_ITEMS: readonly StorageItem[] = [
  {
    key: THEME_STORAGE_KEY,
    owner: "site",
    name: "테마",
    stores:
      "라이트나 다크를 골랐을 때 그 선택. 시스템 설정을 따를 때는 저장하지 않습니다.",
    clear: "테마 버튼을 눌러 ‘시스템 설정’으로 돌리면 지워집니다.",
  },
  {
    key: SPOILER_STORAGE_KEY,
    owner: "site",
    name: "결과 가리기",
    stores: "결과 가리기를 켰다는 표시.",
    clear: "결과 가리기를 끄면 지워집니다.",
  },
  {
    key: FOLLOW_STORAGE_KEY,
    owner: "site",
    name: "마이 팀",
    stores: `팔로우한 팀과 한국 선수 목록(팀 ${FOLLOW_LIMITS.teams}개, 선수 ${FOLLOW_LIMITS.players}명까지).`,
    clear: "팔로우를 해제하면 목록에서 빠집니다.",
  },
  {
    key: ONBOARDING_STORAGE_KEY,
    owner: "site",
    name: "첫 방문 안내",
    stores:
      "첫 방문 안내를 마쳤거나 건너뛰었다는 표시. 다시 띄우지 않으려고 둡니다.",
    clear: "브라우저에서 사이트 데이터를 지울 때 함께 지워집니다.",
  },
  {
    key: STORAGE_PROBE_KEY,
    owner: "site",
    name: "저장 확인",
    stores: "이 브라우저에 저장할 수 있는지 보려고 잠깐 쓰는 값.",
    clear: "쓰자마자 바로 지웁니다.",
  },
  {
    key: GOATCOUNTER_SKIP_KEY,
    owner: "goatcounter",
    name: "방문 통계 끄기",
    stores:
      "‘방문 통계 끄기·켜기’ 링크로 들어왔을 때만 생기는 표시. 이 표시가 있으면 이 브라우저의 방문을 세지 않습니다.",
    clear: "같은 링크로 한 번 더 들어오면 지워지고, 다시 셉니다.",
  },
];
