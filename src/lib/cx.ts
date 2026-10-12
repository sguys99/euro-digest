/**
 * 클래스 이름 이어 붙이기 — 병합 없음, 의존성 없음 (D0-12)
 *
 * `cn`(src/lib/utils.ts)은 clsx + tailwind-merge라 클라이언트 번들에 들어가면 gzip 약 9KB가 붙는다(섬 하나 1~2KB 목표를
 * 넘는다). 그래서 클라이언트 섬과 섬 안에서 쓰는 기초 컴포넌트(아이콘·버튼·칩·탭·토스트·테마 토글)는 이 함수를 쓰고,
 * `cn`은 서버 컴포넌트(카드·스켈레톤·섹션 머리·링크 탭·페이지)에서만 쓴다(tests/ui-source-rules.test.ts가 검사).
 *
 * 같은 속성 유틸리티를 덮어쓰지 않으므로(`px-4.5` 뒤에 `px-2`를 붙이면 둘 다 남는다) 바깥에서 주는 `className`은
 * 변형과 겹치지 않는 것(여백·배치)만 쓴다. 모양을 바꾸려면 변형을 더한다.
 */
export function cx(
  ...parts: ReadonlyArray<string | false | null | undefined>
): string {
  let out = "";
  for (const part of parts) {
    if (part) out = out ? `${out} ${part}` : part;
  }
  return out;
}
