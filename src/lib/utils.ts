import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 조건부 클래스 이름을 합치고, 충돌하는 Tailwind 유틸리티는 뒤에 온 것만 남긴다.
 * shadcn/ui 컴포넌트가 공통으로 쓰는 헬퍼.
 * 예: 기본 클래스 뒤에 조건부 클래스와 덮어쓸 클래스를 넘기면, 같은 속성의 앞쪽 유틸리티는 빠진다.
 * (주석에 실제 유틸리티 이름을 쓰면 Tailwind가 CSS를 생성하므로 예시 클래스는 적지 않는다.)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
