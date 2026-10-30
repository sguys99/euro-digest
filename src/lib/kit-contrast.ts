/**
 * 팀 키트 색 대비 보정 (PRD §15 D62 ④, DESIGN §9.3 D1 팀 배지, plan M2-05). I/O 없는 순수 함수.
 *
 * 팀 배지·팀 티켓 스텁·팀시트 등번호 칸은 상의 색 면 위에 약어·등번호 글자를 쓴다. 글자 대비 하한은 D0 내부 하한 텍스트 **5.3**이다.
 *   1. 글자색은 `#FFFFFF`·`#14213D` 중 상의 색과 대비(WCAG 2.x 상대휘도)가 큰 쪽(테마와 무관한 고정 값 — 데이터 색 위의 글자).
 *   2. 그 대비가 5.3 미만이면 상의 R·G·B에 같은 비율 f를 곱해 어둡게 한다. f는 1.00에서 0.02씩 내리고 채널마다 반올림하며,
 *      흰 글자 대비가 5.3 이상이 되는 첫 f를 쓴다(같은 비율이라 색상은 거의 그대로, 명도만 내려간다). 하의 색(글자 없음)은 그대로.
 *   3. 보정까지 끝난 상의 색을 `configs/team-colors.json`에 넣는다(화면은 보정하지 않는다 — DESIGN §11.14).
 *
 * 시안 기준 값 표: `docs/design/d1/comparison.md` §11.3 (예: 아스널 `#EF0107` → `#D70106`, f 0.90).
 *
 * 쓰는 곳: 보정은 데이터 단계(scripts/build-team-colors.ts → team-colors.json), 약어 글자색은 **화면 빌드 때** 팀 배지 서버
 * 컴포넌트가 `kitTextColor(상의 색)`로 계산한다(2026-10-30 사용자 결정 — Team 스키마·디자인 토큰 변경 없음, DESIGN §11.14).
 * 글자색 두 값은 테마와 무관한 고정 값이라 토큰이 아니다 — 그래서 이 파일은 src/ 색 리터럴 검사의 허용 목록에 있다
 * (tests/design-tokens.test.ts, theme-color의 src/lib/theme.ts와 같은 예외).
 */

/** 약어 글자색 후보 — 흰색 · 잉크 남색(라이트 `--ink`와 값이 같을 뿐 토큰을 참조하지 않는다, DESIGN §9.3) */
export const KIT_TEXT_COLORS = ["#FFFFFF", "#14213D"] as const;
export type KitTextColor = (typeof KIT_TEXT_COLORS)[number];

/** 약어 글자 대비 하한 (D0 내부 하한 — 텍스트) */
export const KIT_MIN_CONTRAST = 5.3;

/** f 하한 — 이보다 어둡게 해야 하는 색은 보정하지 않고 실패로 돌려준다(D1 시안 생성기와 같은 0.40) */
export const KIT_MIN_FACTOR = 0.4;

const HEX = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

/** "#RRGGBB" → [r, g, b] (0~255) */
export function hexToRgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`색 형식이 #RRGGBB가 아님: ${hex}`);
  return [
    Number.parseInt(m[1]!, 16),
    Number.parseInt(m[2]!, 16),
    Number.parseInt(m[3]!, 16),
  ];
}

/** [r, g, b] → "#RRGGBB"(대문자) */
export function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** WCAG 2.x 상대휘도 */
export function relativeLuminance(hex: string): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x 대비비 (1~21) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 상의 색 위 약어 글자색 — 두 후보 중 대비가 큰 쪽(같으면 흰색) */
export function kitTextColor(shirt: string): KitTextColor {
  return contrastRatio(shirt, KIT_TEXT_COLORS[1]) >
    contrastRatio(shirt, KIT_TEXT_COLORS[0])
    ? KIT_TEXT_COLORS[1]
    : KIT_TEXT_COLORS[0];
}

/** 상의 R·G·B에 f를 곱한 색(채널마다 반올림) */
export function scaleColor(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([Math.round(r * f), Math.round(g * f), Math.round(b * f)]);
}

export interface KitShirtResult {
  /** 입력 원색(대문자) */
  original: string;
  /** 원색의 글자 대비(원색 기준으로 고른 글자색과) */
  originalContrast: number;
  /** team-colors.json에 넣을 상의 색 — 보정이 없으면 원색과 같다 */
  shirt: string;
  /** 약어 글자색 */
  text: KitTextColor;
  /** 보정 뒤 글자 대비 */
  contrast: number;
  /** 곱한 비율 — 보정이 없으면 1 */
  factor: number;
  /** 보정했는가 */
  corrected: boolean;
}

/**
 * D62 ④ 규칙을 적용한다. f 하한(0.40)까지 내려도 5.3을 못 넘으면 오류(실제 색에서는 생기지 않는다 —
 * 검은색에 가까운 색은 흰 글자 대비가 이미 크다).
 */
export function correctKitShirt(
  hex: string,
  minContrast: number = KIT_MIN_CONTRAST,
): KitShirtResult {
  const original = rgbToHex(hexToRgb(hex));
  const text = kitTextColor(original);
  const originalContrast = contrastRatio(original, text);
  if (originalContrast >= minContrast) {
    return {
      original,
      originalContrast,
      shirt: original,
      text,
      contrast: originalContrast,
      factor: 1,
      corrected: false,
    };
  }
  // 정수 백분율로 내려 부동소수 누적 오차를 피한다(1.00, 0.98, 0.96 …)
  for (let pct = 100; pct >= KIT_MIN_FACTOR * 100; pct -= 2) {
    const factor = pct / 100;
    const shirt = scaleColor(original, factor);
    const contrast = contrastRatio(shirt, KIT_TEXT_COLORS[0]);
    if (contrast >= minContrast) {
      return {
        original,
        originalContrast,
        shirt,
        text: KIT_TEXT_COLORS[0],
        contrast,
        factor,
        corrected: true,
      };
    }
  }
  throw new Error(
    `키트 상의 색 ${original}: f ${KIT_MIN_FACTOR}까지 내려도 흰 글자 대비 ${minContrast} 미만`,
  );
}

/** 이미 보정된(또는 보정이 필요 없는) 상의 색인가 — 글자 대비 ≥ 하한 (validate 검사용) */
export function kitShirtContrast(shirt: string): {
  text: KitTextColor;
  contrast: number;
} {
  const text = kitTextColor(shirt);
  return { text, contrast: contrastRatio(shirt, text) };
}
