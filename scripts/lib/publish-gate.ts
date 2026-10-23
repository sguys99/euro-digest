/**
 * 발행 검증 게이트 (M1-25, PRD FR-153·FR-143·§10 '비시즌·휴식기', D23·D32·D38) — `npm run validate`의 data 단계 뒤에 돈다.
 * I/O 없는 순수 함수만 둔다. 입력은 스키마를 통과한 data·configs 값(validate-report.ts가 고른다)과 실행 시각.
 * collect.yml은 수집 → **validate(이 게이트)** → 빌드 → 커밋 순이라 오류가 하나라도 있으면 커밋·배포하지 않는다(전날 사이트 유지).
 * ci.yml(사람 push)도 같은 명령을 돌린다 — 그래서 사람의 정상 작업(삭제 요청 등록·설정 수정)을 막는 규칙은 오류로 두지 않는다.
 *
 * 오류(발행 중단)
 *   ① 뉴스 카드 `ai:true` — 뉴스 기사는 LLM을 거치지 않는다(D23). 스키마는 LLM 요약 경로용 형식을 남겨 두었으므로(news.ts) 게이트가
 *      막는다 — "AI 작성" 라벨 없이 AI 제목이 게시되지 않게(M1-01 이월). 경로를 다시 열면(§1-3 승인) 이 규칙도 함께 바꾼다.
 *   ② 뉴스 카드 요약 줄 `s`가 비어 있지 않음 — 카드는 원제목+링크만, RSS 요약문은 카드·data에 저장하지 않는다(D23·M0-25·D39 ①).
 *   ③ 링크 형식 — 카드 `src[].u`(link-check.ts — 공백·제어·서식 문자·역슬래시·사용자 정보·길이). http/https·도메인은 스키마가 본다.
 *      정규화(normalize.ts)가 같은 판정으로 그런 항목을 미리 건너뛰므로 파이프라인 출력에서는 나오지 않는다.
 *   ④ 미래 날짜 파일 — `data/news`·`data/briefs` 파일 date > 오늘(KST). 최신 호가 되어 홈을 차지한다(시계 오류).
 *   ⑤ 카드 수 하한(FR-153) — 발행일 파일의 카드 수 ≥ 10, 휴식기 5(PRD §10). **발행일 파일만** 본다(지난 파일은 하한이 생기기
 *      전 발행분 — 2026-10-12~14는 5·5·8장). 발행일 = `--publish-date`(그 파일이 없으면 오류 — 수집 워크플로용) 또는 실행 시각의
 *      KST 날짜(파일이 있을 때만 — 사람 push의 CI가 아침 발행 전·실패한 날에 막히지 않게). 카드 수는 파일 전체 카드다(삭제 요청
 *      카드 포함 — 등록 push가 하한 때문에 막혀 배포되지 않으면 안 된다. 수집 실행은 게이트 전에 그 카드를 지운다).
 *      휴식기 판정(`restPeriodOf`): 비시즌 = 발행일이 configs/competitions.json 모든 대회의 [startDate, endDate] 밖(부록 A '비시즌
 *      판단' 필드) · A매치 기간 = configs/national-team.json 경기일(KST) ±3일(FR-71 — 파일은 M3-05에서 생긴다). 판정 근거가 없으면
 *      (파일 없음) 평시 하한 10.
 * 경고(통과 — 다음 수집 실행이 지운다)
 *   ⑥ 삭제 요청 카드가 data/news에 남아 있음 — 빌드는 등록만으로 이미 뺀다(src/lib/data/news.ts). 등록 push는 원본이 지워지기 전에
 *      반드시 돌아야 하므로 오류로 두지 않는다. 수집 실행에서 남았다면 삭제 단계 실패다(실행 로그·오류 주석 — purge-stage.ts).
 *   ⑦ 접수 후 72시간이 지났는데 handledAt이 null(FR-143 기준 — `/takedown` 10단계에서 배포 확인 후 기록).
 *   ⑧ 보존 기간이 지난 출처가 남아 있음(D32 — purge-plan.ts와 같은 판정, 단 여유 없이 정확한 만료 시각. 수집 실행은 30시간 미리 지운다).
 *   ⑨ 카드 출처 매체명이 sources.json 어느 소스의 매체명과도 다름 — 보존 기간을 매체명으로 찾으므로(M1-02 이월) 소스 이름을 바꾸면
 *      옛 카드가 보존 기간 삭제에서 빠진다.
 * `data/briefs`(D38)는 레지스트리 스키마(mode ↔ 줄 일관성·줄 길이·근거 id)와 ④를 본다. 무기한 보존이라 삭제 대상이 아니다(D45 ③).
 */
import type {
  BriefFile,
  CompetitionsFile,
  NationalTeamFile,
  NewsFile,
  SourcesFile,
  TakedownsFile,
} from "@/lib/schema";
import { restPeriodOf, type RestPeriod } from "@/lib/rest-period";
import { kstDate } from "@/lib/time";

import { LINK_PROBLEM_MESSAGES, linkFormatProblem } from "./link-check";
import { publisherNameOf } from "./news-file";
import { planPurge, retentionByPublisher } from "./purge-plan";
import { formatIssuePath, type ValidationIssue } from "./validate-schema";

// ─── 정책 ────────────────────────────────────────────────────────────────

/** 카드 수 하한(FR-153) */
export const CARD_FLOOR = 10;
/** 비시즌·휴식기 하한(PRD §10) */
export const CARD_FLOOR_REST = 5;
/** 삭제 요청 처리 기준(FR-143) */
export const TAKEDOWN_SLA_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;
const NEWS_FILE_RE = /^data\/news\/(\d{4}-\d{2}-\d{2})\.json$/;
const BRIEF_FILE_RE = /^data\/briefs\/(\d{4}-\d{2}-\d{2})\.json$/;
const TAKEDOWNS_FILE = "configs/takedowns.json";
const SOURCES_FILE = "configs/sources.json";

// ─── 휴식기 ──────────────────────────────────────────────────────────────
// 판정은 src/lib/rest-period.ts(화면의 비시즌 빈 상태와 같은 규칙 — M1-37에서 옮김). 여기서는 다시 내보내기만 한다.

export {
  NATIONAL_WINDOW_DAYS,
  restPeriodOf,
  type RestPeriod,
  type RestReason,
} from "@/lib/rest-period";

export function cardFloorFor(rest: Pick<RestPeriod, "reasons">): number {
  return rest.reasons.length > 0 ? CARD_FLOOR_REST : CARD_FLOOR;
}

/** 하한 문구용 라벨 — 평시 / 휴식기(비시즌·A매치 기간) */
export function restLabel(rest: Pick<RestPeriod, "reasons">): string {
  if (rest.reasons.length === 0) return "평시";
  const names = rest.reasons.map((r) =>
    r === "off-season" ? "비시즌" : "A매치 기간",
  );
  return `휴식기 — ${names.join("·")}`;
}

// ─── 입력·결과 ───────────────────────────────────────────────────────────

export interface GateInput {
  /** 스키마를 통과한 일별 뉴스 파일(저장소 상대 경로 → 값) */
  news: ReadonlyArray<{ file: string; value: NewsFile }>;
  /** 스키마를 통과한 일별 브리핑 파일 */
  briefs: ReadonlyArray<{ file: string; value: BriefFile }>;
  /** 디스크에 있는 일별 뉴스 파일 경로 전부(스키마 실패 포함) — 하한 대상 파일이 '없음'인지 '깨짐'인지 가른다 */
  newsPaths: readonly string[];
  takedowns?: TakedownsFile;
  sources?: SourcesFile;
  competitions?: CompetitionsFile;
  nationalTeam?: NationalTeamFile;
  /** 실행 시각(UTC ISO). 없으면 시각 기준 검사(④·⑦·⑧, 발행일 기본값)를 건너뛴다 — 진입점(scripts/validate.ts)은 항상 넘긴다 */
  now?: string;
  /** 하한을 볼 발행일(`--publish-date`) — 주면 그 파일이 없을 때 오류 */
  publishDate?: string;
}

export interface GateFloor {
  date: string;
  /** --publish-date로 지정했는가(없으면 오류) */
  strict: boolean;
  /** present = 검사함 · missing = 파일 없음 · invalid = 스키마 오류(오류는 data 단계가 이미 냈다) */
  state: "present" | "missing" | "invalid";
  cards: number;
  required: number;
  rest: RestPeriod;
}

export interface GateResult {
  /** 실행한 검사 이름 */
  checked: string[];
  /** 카드 수 하한 — 발행일을 정하지 못했으면(시각·--publish-date 없음) null */
  floor: GateFloor | null;
  issues: ValidationIssue[];
}

function gateIssue(
  severity: "error" | "warn",
  file: string,
  path: readonly PropertyKey[] | null,
  message: string,
): ValidationIssue {
  return path === null || path.length === 0
    ? { severity, stage: "gate", file, message }
    : { severity, stage: "gate", file, path: formatIssuePath(path), message };
}

// ─── 검사 ────────────────────────────────────────────────────────────────

/** ①②③ 카드 내용 — 모든 날짜 파일 */
function checkCards(input: GateInput, issues: ValidationIssue[]): void {
  for (const { file, value } of input.news) {
    value.cards.forEach((card, i) => {
      if (card.ai) {
        issues.push(
          gateIssue(
            "error",
            file,
            ["cards", i, "ai"],
            `뉴스 카드 ai:true(${card.id}) — 뉴스 기사는 LLM을 거치지 않는다(D23). "AI 작성" 라벨 없이 AI 제목이 게시되지 않게 발행을 막는다`,
          ),
        );
      }
      if (card.s.length > 0) {
        issues.push(
          gateIssue(
            "error",
            file,
            ["cards", i, "s"],
            `뉴스 카드 요약 줄이 ${card.s.length}줄(${card.id}) — 카드는 원제목+링크만(s: [], D23), RSS 요약문은 저장하지 않는다(M0-25·D39)`,
          ),
        );
      }
      card.src.forEach((src, j) => {
        const problem = linkFormatProblem(src.u);
        if (problem !== null) {
          issues.push(
            gateIssue(
              "error",
              file,
              ["cards", i, "src", j, "u"],
              `링크 형식 오류(${card.id}) — ${LINK_PROBLEM_MESSAGES[problem]}`,
            ),
          );
        }
      });
    });
  }
}

/** ④ 미래 날짜 파일 */
function checkFutureDates(
  input: GateInput,
  today: string,
  issues: ValidationIssue[],
): void {
  const files = [
    ...input.news.map((f) => ({ file: f.file, date: f.value.date })),
    ...input.briefs.map((f) => ({ file: f.file, date: f.value.date })),
  ];
  for (const { file, date } of files) {
    if (date > today) {
      issues.push(
        gateIssue(
          "error",
          file,
          ["date"],
          `미래 날짜 파일 — date ${date} > 오늘 ${today}(KST). 최신 호로 홈을 차지한다(실행 시계 확인)`,
        ),
      );
    }
  }
}

/** ⑤ 카드 수 하한 */
function checkFloor(
  input: GateInput,
  date: string,
  strict: boolean,
  issues: ValidationIssue[],
): GateFloor {
  const rest = restPeriodOf(date, input);
  const required = cardFloorFor(rest);
  const file = `data/news/${date}.json`;
  const found = input.news.find(
    (f) => f.value.date === date && f.file === file,
  );
  if (!found) {
    const exists = input.newsPaths.includes(file);
    if (!exists && strict) {
      issues.push(
        gateIssue(
          "error",
          file,
          null,
          `발행 파일이 없음(--publish-date ${date}) — 카드 0장 < 하한 ${required}장(${restLabel(rest)}). 커밋·배포를 멈추고 전날 사이트를 유지한다(FR-153)`,
        ),
      );
    }
    return {
      date,
      strict,
      state: exists ? "invalid" : "missing",
      cards: 0,
      required,
      rest,
    };
  }
  const cards = found.value.cards.length;
  if (cards < required) {
    issues.push(
      gateIssue(
        "error",
        file,
        ["cards"],
        `카드 ${cards}장 < 하한 ${required}장(${restLabel(rest)} — ${rest.basis.join(" · ")}). 커밋·배포를 멈추고 전날 사이트를 유지한다(FR-153)`,
      ),
    );
  }
  return { date, strict, state: "present", cards, required, rest };
}

/** ⑥⑧ 남은 삭제 요청 카드·만료 출처(purge-plan.ts와 같은 판정) */
function checkLeftovers(
  input: GateInput,
  now: string | undefined,
  issues: ValidationIssue[],
): void {
  const takedownIds = new Set((input.takedowns ?? []).map((t) => t.id));
  const retention =
    now !== undefined && input.sources
      ? retentionByPublisher(input.sources)
      : new Map<string, number>();
  if (takedownIds.size === 0 && retention.size === 0) return;
  const byDate = new Map(input.news.map((f) => [f.value.date, f] as const));
  const plan = planPurge({
    files: input.news.map((f) => ({ date: f.value.date, file: f.value })),
    takedownIds,
    retention,
    now: now ?? new Date(0).toISOString(),
    // 여유 없이 정확한 시각 — 만료 뒤에도 남아 있는 출처만 경고(수집 실행은 30시간 미리 지운다 — purge-plan.ts)
    leadMs: 0,
  });
  for (const change of plan.files) {
    const entry = byDate.get(change.date);
    if (!entry) continue;
    const indexOf = new Map(
      entry.value.cards.map((c, i) => [c.id, i] as const),
    );
    for (const removed of change.removedCards) {
      const path = ["cards", indexOf.get(removed.id) ?? 0];
      issues.push(
        removed.reason === "takedown"
          ? gateIssue(
              "warn",
              entry.file,
              path,
              `삭제 요청 카드 ${removed.id}가 남아 있음 — 빌드에서는 이미 제외, 다음 수집 실행이 원본을 지운다(FR-143)`,
            )
          : gateIssue(
              "warn",
              entry.file,
              path,
              `보존 기간이 지난 대표 출처(${removed.publisher ?? "?"} — 만료 ${removed.expiresAt ?? "?"}) 카드 ${removed.id}가 남아 있음 — 다음 수집 실행이 카드를 지운다(D32)`,
            ),
      );
    }
    for (const src of change.removedSources) {
      issues.push(
        gateIssue(
          "warn",
          entry.file,
          ["cards", indexOf.get(src.cardId) ?? 0, "src", src.index],
          `보존 기간이 지난 출처(${src.publisher} — 만료 ${src.expiresAt})가 카드 ${src.cardId}에 남아 있음 — 다음 수집 실행이 그 출처를 지운다(D32)`,
        ),
      );
    }
  }
}

/** ⑦ 접수 후 72시간이 지났는데 handledAt 없음 */
function checkTakedownSla(
  takedowns: TakedownsFile,
  nowMs: number,
  issues: ValidationIssue[],
): void {
  takedowns.forEach((t, i) => {
    if (t.handledAt !== null) return;
    const hours = (nowMs - Date.parse(t.requestedAt)) / HOUR_MS;
    if (hours > TAKEDOWN_SLA_HOURS) {
      issues.push(
        gateIssue(
          "warn",
          TAKEDOWNS_FILE,
          [i, "handledAt"],
          `삭제 요청 ${t.id} 접수 후 ${Math.floor(hours)}시간 — 72시간 기준(FR-143)을 넘었는데 handledAt이 null. 배포 확인 후 기록할 것(/takedown)`,
        ),
      );
    }
  });
}

/** ⑨ 카드 출처 매체명이 sources.json에 없음 — 파일·매체명마다 1건 */
function checkPublishers(
  input: GateInput,
  sources: SourcesFile,
  issues: ValidationIssue[],
): void {
  const known = new Set(sources.map((s) => publisherNameOf(s)));
  for (const { file, value } of input.news) {
    const unknown = new Map<string, number>();
    for (const card of value.cards) {
      for (const src of card.src) {
        if (!known.has(src.n))
          unknown.set(src.n, (unknown.get(src.n) ?? 0) + 1);
      }
    }
    for (const [name, count] of unknown) {
      issues.push(
        gateIssue(
          "warn",
          file,
          null,
          `출처 매체명 "${name}"(${count}건)이 sources.json 어느 소스의 매체명과도 다름 — 보존 기간을 매체명으로 찾으므로(D32) 소스 이름을 바꿨다면 옛 카드가 삭제에서 빠진다`,
        ),
      );
    }
  }
}

/** 게이트 전체 — 머리 주석 순서 */
export function runPublishGate(input: GateInput): GateResult {
  const issues: ValidationIssue[] = [];
  const checked: string[] = [];

  checkCards(input, issues);
  checked.push("뉴스 카드 ai·요약 줄·링크 형식");

  if (input.now !== undefined) {
    checkFutureDates(input, kstDate(input.now), issues);
    checked.push("미래 날짜 파일");
  }

  const strict = input.publishDate !== undefined;
  const date =
    input.publishDate ??
    (input.now !== undefined ? kstDate(input.now) : undefined);
  const floor =
    date === undefined ? null : checkFloor(input, date, strict, issues);
  if (floor) checked.push("카드 수 하한");

  checkLeftovers(input, input.now, issues);
  checked.push("남은 삭제 요청 카드·보존 기간 만료 출처");

  if (input.takedowns && input.now !== undefined) {
    checkTakedownSla(input.takedowns, Date.parse(input.now), issues);
    checked.push("삭제 요청 72시간");
  }
  if (input.sources) {
    checkPublishers(input, input.sources, issues);
    checked.push("출처 매체명 ↔ sources.json");
  }
  return { checked, floor, issues };
}

// ─── 입력 고르기 ─────────────────────────────────────────────────────────

/** 저장소 상대 경로가 일별 뉴스·브리핑 파일인가 */
export function isDailyNewsPath(relPath: string): boolean {
  return NEWS_FILE_RE.test(relPath);
}
export function isDailyBriefPath(relPath: string): boolean {
  return BRIEF_FILE_RE.test(relPath);
}

/**
 * 경로 → 스키마 통과 값 맵에서 게이트 입력을 고른다.
 * 호출 규약: 맵에는 레지스트리 스키마(registry.ts)로 safeParse에 성공한 값만 넣는다 — 경로마다 스키마가 정해져 있어 단언이
 * 안전하다(validate-crossref.ts `pickCrossRefInput`과 같은 규약, registry.test.ts가 경로 ↔ 스키마 매핑을 확인).
 */
export function pickGateInput(
  parsedByPath: ReadonlyMap<string, unknown>,
  options: { newsPaths: readonly string[]; now?: string; publishDate?: string },
): GateInput {
  const news: Array<{ file: string; value: NewsFile }> = [];
  const briefs: Array<{ file: string; value: BriefFile }> = [];
  for (const [file, value] of parsedByPath) {
    if (isDailyNewsPath(file)) news.push({ file, value: value as NewsFile });
    else if (isDailyBriefPath(file))
      briefs.push({ file, value: value as BriefFile });
  }
  const byPath = <T>(file: string): T | undefined =>
    parsedByPath.get(file) as T | undefined;
  const input: GateInput = {
    news: news.sort((a, b) => (a.file < b.file ? -1 : 1)),
    briefs: briefs.sort((a, b) => (a.file < b.file ? -1 : 1)),
    newsPaths: options.newsPaths,
  };
  const takedowns = byPath<TakedownsFile>(TAKEDOWNS_FILE);
  const sources = byPath<SourcesFile>(SOURCES_FILE);
  const competitions = byPath<CompetitionsFile>("configs/competitions.json");
  const nationalTeam = byPath<NationalTeamFile>("configs/national-team.json");
  if (takedowns) input.takedowns = takedowns;
  if (sources) input.sources = sources;
  if (competitions) input.competitions = competitions;
  if (nationalTeam) input.nationalTeam = nationalTeam;
  if (options.now !== undefined) input.now = options.now;
  if (options.publishDate !== undefined)
    input.publishDate = options.publishDate;
  return input;
}
