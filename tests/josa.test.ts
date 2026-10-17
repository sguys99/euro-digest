/**
 * M1-21 조사 보정(scripts/lib/josa.ts — PRD FR-24·§9.4, M0-30): 받침 판정(한글·숫자·라틴 약어·라틴 단어 어림), 조사 고르기(으로/로의
 * ㄹ 예외), 이름 바로 뒤 붙은 조사 고치기(M0-30 실제 출력 'Bayern가'·'Dortmund은' 사례). 네트워크·LLM 없음.
 */
import { describe, expect, it } from "vitest";

import {
  finalSound,
  fixAttachedParticle,
  josa,
  withJosa,
} from "../scripts/lib/josa";

describe("finalSound — 끝소리", () => {
  it("한글 음절: 받침 없음·ㄹ·그 밖", () => {
    expect(finalSound("도르트문트")).toBe("none");
    expect(finalSound("아스널")).toBe("rieul");
    expect(finalSound("바이에른 뮌헨")).toBe("other");
    expect(finalSound("레알 마드리드")).toBe("none");
    expect(finalSound("토트넘")).toBe("other");
    expect(finalSound("리버풀")).toBe("rieul");
  });

  it("숫자: 한국어 읽기 끝소리 — 0으로 끝나면(영·십·백·천) 받침", () => {
    expect(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(finalSound),
    ).toEqual([
      "rieul", // 일
      "none", // 이
      "other", // 삼
      "none", // 사
      "none", // 오
      "other", // 육
      "rieul", // 칠
      "rieul", // 팔
      "none", // 구
    ]);
    for (const n of ["0", "10", "20", "100", "1000"]) {
      expect(finalSound(n), n).toBe("other");
    }
    expect(finalSound("13")).toBe("other"); // 십삼
    expect(finalSound("2-1")).toBe("rieul"); // 이 대 일
    expect(finalSound("1-0")).toBe("other"); // 일 대 영
    expect(finalSound("샬케04")).toBe("none"); // 공사 — 끝 글자 4
  });

  it("라틴 약어(대문자 2자 이상·한 글자)는 영어 글자 이름 — L·R = ㄹ, M·N = 받침", () => {
    expect(finalSound("PSG")).toBe("none"); // 지
    expect(finalSound("PSV")).toBe("none"); // 브이
    expect(finalSound("UCL")).toBe("rieul"); // 엘
    expect(finalSound("EPL")).toBe("rieul");
    expect(finalSound("세리에 A")).toBe("none"); // 에이
    expect(finalSound("LASK")).toBe("none"); // 케이
  });

  it("라틴 단어 어림 — l = ㄹ, m·n·ng·묵음 e 앞 n·m = 받침, 그 밖은 받침 없음", () => {
    expect(finalSound("Arsenal")).toBe("rieul");
    expect(finalSound("Bayern")).toBe("other");
    expect(finalSound("Tottenham")).toBe("other");
    expect(finalSound("Kane")).toBe("other"); // 케인
    expect(finalSound("Dortmund")).toBe("none"); // 도르트문트
    expect(finalSound("Man City")).toBe("none");
    expect(finalSound("Barça")).toBe("none"); // 발음 기호 무시
    expect(finalSound("Mbappé")).toBe("none");
    expect(finalSound("Bodø/Glimt")).toBe("none"); // 끝 단어 Glimt
    expect(finalSound("1. FC Köln")).toBe("other");
  });

  it("끝의 닫는 괄호·따옴표는 건너뛰고, 기호·한자·빈 문자열은 unknown", () => {
    expect(finalSound("케인)")).toBe("other");
    expect(finalSound("'첼시'")).toBe("none");
    expect(finalSound("")).toBe("unknown");
    expect(finalSound("★")).toBe("unknown");
    expect(finalSound("出场")).toBe("unknown");
  });
});

describe("josa·withJosa — 조사 고르기", () => {
  it("이/가·은/는·을/를·과/와", () => {
    expect(withJosa("바이에른 뮌헨", "이/가")).toBe("바이에른 뮌헨이");
    expect(withJosa("도르트문트", "이/가")).toBe("도르트문트가");
    expect(withJosa("아스널", "은/는")).toBe("아스널은");
    expect(withJosa("첼시", "은/는")).toBe("첼시는");
    expect(withJosa("토트넘", "을/를")).toBe("토트넘을");
    expect(withJosa("브렌트포드", "을/를")).toBe("브렌트포드를");
    expect(withJosa("리버풀", "과/와")).toBe("리버풀과");
    expect(withJosa("나폴리", "과/와")).toBe("나폴리와");
  });

  it("으로/로 — ㄹ 받침은 '로'(아스널로·2-1로), 그 밖 받침은 '으로'(3-0으로·승점 13으로)", () => {
    expect(withJosa("아스널", "으로/로")).toBe("아스널로");
    expect(withJosa("2-1", "으로/로")).toBe("2-1로");
    expect(withJosa("2-2", "으로/로")).toBe("2-2로");
    expect(withJosa("3-0", "으로/로")).toBe("3-0으로");
    expect(withJosa("4-3", "으로/로")).toBe("4-3으로");
    expect(withJosa("13", "으로/로")).toBe("13으로");
    expect(withJosa("15", "으로/로")).toBe("15로");
    expect(withJosa("20", "으로/로")).toBe("20으로");
  });

  it("서술격 — '선두다'·'바이에른 뮌헨이다'", () => {
    expect(withJosa("선두", "이다/다")).toBe("선두다");
    expect(withJosa("2위", "이다/다")).toBe("2위다");
    expect(withJosa("바이에른 뮌헨", "이다/다")).toBe("바이에른 뮌헨이다");
    expect(josa("PSG", "이라/라")).toBe("라");
  });
});

describe("fixAttachedParticle — 이름 바로 뒤 붙은 조사", () => {
  it("M0-30 실제 사례: 'Bayern가' → 바이에른 뮌헨이, 'Dortmund은' → 도르트문트는", () => {
    expect(fixAttachedParticle("바이에른 뮌헨", "가 홈에서 이겼다")).toBe(
      "이 홈에서 이겼다",
    );
    expect(fixAttachedParticle("도르트문트", "은 승점 13으로")).toBe(
      "는 승점 13으로",
    );
  });

  it("짝마다 받침 기준으로 고친다 — 맞으면 그대로", () => {
    expect(fixAttachedParticle("첼시", "을 꺾었다")).toBe("를 꺾었다");
    expect(fixAttachedParticle("토트넘", "를 꺾었다")).toBe("을 꺾었다");
    expect(fixAttachedParticle("첼시", "과의 경기")).toBe("와의 경기");
    expect(fixAttachedParticle("토트넘", "와 비겼다")).toBe("과 비겼다");
    expect(fixAttachedParticle("아스널", "으로 이적")).toBe("로 이적");
    expect(fixAttachedParticle("토트넘", "로 이적")).toBe("으로 이적");
    expect(fixAttachedParticle("첼시", "으로부터")).toBe("로부터");
    expect(fixAttachedParticle("첼시", "는 선두")).toBe("는 선두");
    expect(fixAttachedParticle("토트넘", "이 이겼다")).toBe("이 이겼다");
  });

  it("서술격·연결형 — 이었/였·이라/라·이며/며·이다/다", () => {
    expect(fixAttachedParticle("첼시", "이었다.")).toBe("였다.");
    expect(fixAttachedParticle("토트넘", "였다.")).toBe("이었다.");
    expect(fixAttachedParticle("첼시", "이라는 팀")).toBe("라는 팀");
    expect(fixAttachedParticle("토트넘", "라는 팀")).toBe("이라는 팀");
    expect(fixAttachedParticle("첼시", "이며")).toBe("며");
    expect(fixAttachedParticle("토트넘", "다.")).toBe("이다.");
    expect(fixAttachedParticle("첼시", "이지만")).toBe("지만");
  });

  it("받침과 무관한 말·띄어 쓴 말·조사가 아닌 덩어리는 그대로", () => {
    expect(fixAttachedParticle("첼시", "의 승리")).toBe("의 승리");
    expect(fixAttachedParticle("첼시", "에서 열린")).toBe("에서 열린");
    expect(fixAttachedParticle("첼시", "도 이겼다")).toBe("도 이겼다");
    expect(fixAttachedParticle("첼시", "전에서")).toBe("전에서"); // '첼시전'
    expect(fixAttachedParticle("첼시", " 가 띄어 씀")).toBe(" 가 띄어 씀");
    expect(fixAttachedParticle("첼시", "이번 시즌")).toBe("이번 시즌");
    expect(fixAttachedParticle("첼시", ", 2-1")).toBe(", 2-1");
    expect(fixAttachedParticle("첼시", "")).toBe("");
  });

  it("끝소리를 모르면(기호 등) 고치지 않는다", () => {
    expect(fixAttachedParticle("★", "가 이겼다")).toBe("가 이겼다");
  });
});
