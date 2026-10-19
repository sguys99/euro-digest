/**
 * 오늘의 5줄 화면 모델 (PRD FR-22~29·FR-35·FR-36, D24·D30·D38·D45·D58, DESIGN.md §3.5·§9.3, plan M1-32)
 *
 * 브리핑 파일(`data/briefs/YYYY-MM-DD.json` — src/lib/data/brief.ts가 읽음) → 5줄 블록(src/components/brief/today-brief.tsx)이
 * 그릴 값. 순수 함수다(fs·zod 런타임 없음 — 스키마는 타입만, 줄 수 상한은 zod 없는 src/lib/brief-limits.ts, 시간 계산은
 * src/lib/time.ts). 클라이언트 섬이 import해도 zod가 번들에 들어가지 않는다(tests/brief-view.test.ts가 import를 검사).
 *
 * - 줄은 파일 순서 그대로 1부터 번호를 매긴다(등번호 1~5 — 줄이 적은 날도 1부터, 빈 번호를 두지 않는다. DESIGN §3.5).
 * - 문장은 고치지 않는다. 숫자만 `\d+(?:\+\d+)?(?:-\d+)?`(57 · 90+2 · 2-2)로 나눠 Barlow로 그린다(DESIGN §3.5 — 문구 불변).
 * - "AI 작성" 라벨은 줄의 `ai` 그대로(FR-35 — `ai:true` 줄 전부, `ai:false` 템플릿 줄은 없음). mode는 줄 단위 ai의 요약일 뿐이라
 *   라벨 판단에 쓰지 않는다(mixed는 줄마다 다르다).
 * - 템플릿 줄(`ai:false`)도 같은 문장 행으로 그린다 — D45 ④로 템플릿 문형이 LLM 줄과 같은 자연 뉴스 문장(주어 팀 점수 먼저)이 됐다
 *   (D0 시안의 '팀 이름 + 큰 스코어' 행은 옛 '홈 h-a 원정' 문형용 — 문장에서 팀·점수를 다시 뽑으면 문구를 바꾸게 된다).
 * - 부제 경기일 = 발행일 − 1(브리핑 입력 = UTC 하루 D−1에 킥오프한 종료 경기 — scripts/lib/brief-input.ts. 유럽 현지의 "어제").
 *   화면은 "{M월 D일}(현지) 경기 기준"으로 현지 경기일임을 밝힌다(2026-10-19 사용자 결정 — 유럽 저녁 경기는 KST로 발행일 새벽이다).
 *   경기가 없는 날(`empty`)은 날짜를 단정하지 않는다(D30 #7 — "전날(현지) 경기 기준").
 * - 인덱스 탭 = 줄의 선택 필드 `comps`(대회 id 배열 — D58, 파이프라인이 refs에서 계산)의 첫 값. 키가 없는 옛 파일 줄은 탭 없음.
 */
import { BRIEF_MAX_LINES } from "@/lib/brief-limits";
import type { BriefMode } from "@/lib/schema/brief";
import type { CompId } from "@/lib/schema/common";
import { kstDayRangeUtc, kstParts, shiftDate } from "@/lib/time";

/** 화면이 읽는 줄 — 스키마 줄(BriefLine)과 같은 모양. `comps`는 D58 선택 필드(없는 옛 파일도 받는다) */
export interface BriefLineInput {
  text: string;
  ai: boolean;
  comps?: readonly CompId[];
}

export interface BriefInput {
  /** 발행일(KST) = 파일명 */
  date: string;
  mode: BriefMode;
  lines: readonly BriefLineInput[];
}

/** 문장 조각 — `num`이면 숫자(Barlow 600 1.16em, DESIGN §3.5) */
export interface BriefTextPart {
  text: string;
  num: boolean;
}

export interface BriefRowView {
  /** 등번호 1~5 */
  no: number;
  /** 문장 원문(무수정) */
  text: string;
  parts: BriefTextPart[];
  /** LLM이 쓴 줄 — "AI 작성" 라벨(FR-35) */
  ai: boolean;
  /** 인덱스 탭 대회(comps 첫 값 — D58). 없으면 null(탭 열은 빈 채로 둔다) */
  comp: CompId | null;
}

export interface BriefView {
  /** 발행일(KST) — 브리핑 오류 신고 이슈 양식에 채운다(FR-36) */
  date: string;
  mode: BriefMode;
  /** 경기일 = 발행일 − 1(브리핑 입력 창 UTC 하루 D−1 = 유럽 현지 경기일 — 머리 주석). empty면 null(날짜를 단정하지 않는다, D30 #7) */
  matchDate: string | null;
  /** 경기일 라벨 "10월 17일" — empty면 null */
  matchDateLabel: string | null;
  rows: BriefRowView[];
  /** 1~4줄인 날의 줄 수 — 부제 "이날 N줄"(DESIGN §9.3). 5줄·empty면 null */
  shortCount: number | null;
  /** `ai:true` 줄이 하나라도 있는가 — 하단 "AI 작성 안내" 링크(혼합안 S3·S4는 없음) */
  hasAi: boolean;
}

const NUM_RE = /\d+(?:\+\d+)?(?:-\d+)?/g;

/** 문장 → 숫자·글자 조각(이어 붙이면 원문 그대로) */
export function briefTextParts(text: string): BriefTextPart[] {
  const parts: BriefTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(NUM_RE)) {
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start), num: false });
    parts.push({ text: match[0], num: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), num: false });
  return parts;
}

/** 브리핑 경기일 — 발행일(KST) − 1 */
export function briefMatchDate(date: string): string {
  return shiftDate(date, -1);
}

/** 달력 날짜 → "10월 17일"(요일 없음 — 혼합안 부제) */
export function monthDayLabel(date: string): string {
  const p = kstParts(kstDayRangeUtc(date).start);
  return `${p.month}월 ${p.day}일`;
}

export function buildBriefView(brief: BriefInput): BriefView {
  const empty = brief.mode === "empty";
  const rows = (empty ? [] : brief.lines).map((line, index): BriefRowView => ({
    no: index + 1,
    text: line.text,
    parts: briefTextParts(line.text),
    ai: line.ai,
    comp: line.comps?.[0] ?? null,
  }));
  const matchDate = empty ? null : briefMatchDate(brief.date);
  return {
    date: brief.date,
    mode: brief.mode,
    matchDate,
    matchDateLabel: matchDate === null ? null : monthDayLabel(matchDate),
    rows,
    shortCount:
      rows.length > 0 && rows.length < BRIEF_MAX_LINES ? rows.length : null,
    hasAi: rows.some((row) => row.ai),
  };
}
