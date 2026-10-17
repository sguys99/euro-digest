/**
 * 링크 형식 검사 (M1-25, PRD FR-153 "링크 형식 검사") — 순수 함수.
 *
 * `HttpUrlSchema`(`z.httpUrl()` — http/https + 도메인 호스트)는 형식만 본다. 실측(zod 4)으로 아래 값도 통과한다:
 * 안쪽 공백(`https://a.com/b c`)·제어 문자(NUL)·사용자 정보(`https://bbc.co.uk@evil.example/`)·역슬래시·보이지 않는
 * 서식 문자(U+200B 등). 화면에서 `<a href>`로 그리는 링크라 이런 값은 깨진 링크이거나 표시와 실제 목적지가 다른 링크가 된다.
 *
 * 같은 함수를 두 곳에서 쓴다 — 판정이 어긋나면 피드 항목 하나 때문에 그날 발행 전체가 막히므로(창 51시간 동안 매일):
 *   - 정규화(normalize.ts `normalizeFeedItem`): 문제가 있는 링크의 항목은 `bad-link`로 건너뛴다(카드가 되지 않음)
 *   - 발행 검증 게이트(publish-gate.ts): data/news 카드 `src[].u`에 문제가 있으면 오류(커밋·배포 중단)
 * 링크를 고치지 않는다(표시 링크는 피드 원문 그대로 — D23). 판정만 한다.
 */

/** 링크 길이 상한(JS 문자열 길이) — 브라우저·검색엔진 관행값. 피드 기사 링크는 보통 300자 안쪽이다 */
export const LINK_MAX_LENGTH = 2048;

export type LinkProblem =
  | "too-long"
  | "whitespace"
  | "control"
  | "invisible"
  | "backslash"
  | "userinfo"
  | "unparsable";

/** 사람이 읽는 설명(검증 출력용 — 링크 값은 넣지 않는다) */
export const LINK_PROBLEM_MESSAGES: Readonly<Record<LinkProblem, string>> = {
  "too-long": `${LINK_MAX_LENGTH}자 초과`,
  whitespace: "공백 문자 포함",
  control: "제어 문자 포함",
  invisible: "보이지 않는 서식 문자(U+200B·방향 제어 등) 포함",
  backslash:
    "역슬래시(\\) 포함 — 브라우저가 경로 구분자로 바꿔 목적지가 달라질 수 있음",
  userinfo:
    "사용자 정보(user@host) 포함 — 표시와 실제 호스트가 달라 보일 수 있음",
  unparsable: "URL로 해석되지 않음",
};

/** 공백류 — ASCII 공백·탭·줄바꿈 + NBSP·U+2028 등(`\s`는 유니코드 공백 포함) */
const WHITESPACE_RE = /\s/u;
/** 제어 문자 — C0(U+0000~U+001F)·DEL·C1(U+0080~U+009F) */
const CONTROL_RE = /\p{Cc}/u;
/** 서식 문자 — 폭 없는 공백(U+200B)·방향 제어(U+202A~U+202E·U+2066~U+2069)·BOM(U+FEFF)·소프트 하이픈 등 */
const INVISIBLE_RE = /\p{Cf}/u;

/**
 * 링크 1개의 형식 문제 — 없으면 null. 검사 순서(첫 문제만 돌려준다): 길이 → 공백 → 제어 → 서식 → 역슬래시 → 해석 → 사용자 정보.
 * http/https·도메인 호스트 여부는 `HttpUrlSchema`가 따로 본다(호출하는 쪽이 함께 쓴다).
 */
export function linkFormatProblem(url: string): LinkProblem | null {
  if (url.length > LINK_MAX_LENGTH) return "too-long";
  if (WHITESPACE_RE.test(url)) return "whitespace";
  if (CONTROL_RE.test(url)) return "control";
  if (INVISIBLE_RE.test(url)) return "invisible";
  if (url.includes("\\")) return "backslash";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unparsable";
  }
  if (parsed.username !== "" || parsed.password !== "") return "userinfo";
  return null;
}
