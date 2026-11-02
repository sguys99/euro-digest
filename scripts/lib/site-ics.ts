/**
 * 사이트 .ics 캘린더 — 경기 일정 → iCalendar(RFC 5545) 문자열 (PRD FR-59·FR-83·FR-115·FR-123, §4 IA `/calendar/…`, plan M4-12)
 *
 * 순수 함수만 둔다(파일 읽기·쓰기·현재 시각 없음). 입력은 진입점(scripts/build-feeds.ts)이 스키마를 통과한 데이터·설정을 로더로 읽어 넘긴다.
 * 네트워크·LLM 없음(비용 0 — FR-123).
 *
 * 파일(경로는 src/lib/paths.ts `artifacts.calendar` — URL 규칙의 단일 출처)
 * - **팀별** `/calendar/{team}.ics` — 팀 페이지가 있는 팀(data/teams) 전부. 6개 대회 데이터에서 그 팀 경기 **시즌 전체**(지난 경기 포함 —
 *   구독 캘린더에서 지난 일정이 사라지지 않게). 경기가 0건이어도 파일을 만든다(구독 링크가 404가 되지 않게). 팀 티켓 '다음 경기' 칸·`/my`
 *   팀 묶음 링크(FR-59·FR-115)가 가리킨다.
 * - **한국 선수 소속팀 묶음** `/calendar/korean.ics` — 활성(`active: true`) 등록 한국 선수의 소속팀 경기(오늘 밤 볼 경기 ① 규칙과 같은 대상 —
 *   src/lib/tonight.ts) + 현황 파일 `next`(컵 등 대회 데이터 밖 경기). 같은 경기(id, 또는 킥오프 3시간 안 + 같은 상대 — 선수 상세 다음 경기와
 *   같은 규칙)는 한 번. 선수 이름은 **지금 소속**으로 붙이므로(설정 기준 — 지난 경기 당시 소속은 모른다) 데이터 시각 기준 최근 7일
 *   (`KOREAN_PAST_DAYS`) 이후 경기만 싣는다(겨울 이적 뒤 옛 팀 경기에 선수 이름이 붙지 않게 — §1-7).
 * - **경기별** `/calendar/match/{id}.ics` — 일정 하나짜리 파일(캘린더에 추가, FR-83). **데이터 상태가 `scheduled`인 경기 전부**(임시 킥오프
 *   포함, 지금 시각과 무관) + 현황 파일 `next` + 대표팀 예정 경기(NationalMatch — 스키마 주석 '캘린더(.ics) 연결'). 지금 시각을 쓰지 않으므로
 *   화면(빌드 시각 기준 '다음 경기')과 경계에서 어긋나지 않는다 — 화면 규칙: `status === "scheduled"`인 경기·선수 `next`·대표팀 예정 경기에는
 *   파일이 있다.
 *
 * 일정(VEVENT) 규칙
 * - `UID` = `{경기 id}@euro-digest.sguys99.github.io`(배포 위치·환경변수와 무관한 상수 — 같은 경기는 어느 파일에서나, 일정이 바뀌어도 같은 UID).
 *   `SEQUENCE`는 쓰지 않는다(0): 단조 증가시키려면 빌드 사이 상태 파일이 필요하다(스키마 추가 — 제안만). 구독(METHOD:PUBLISH)은 클라이언트가
 *   매번 전체를 다시 받으므로 UID만으로 갱신된다. `DTSTAMP` = **데이터 시각**(대회 파일 `updatedAt`·현황 파일 `generatedAt` 최댓값 — 없으면 그
 *   경기 킥오프): 빌드 시각을 쓰지 않아 같은 데이터면 같은 바이트가 나온다.
 * - 시각: `DTSTART`·`DTEND`는 UTC `Z`(RFC 5545 §3.3.5 형식 2 — VTIMEZONE 불필요, 구글·애플·아웃룩 모두 기기 시간대로 표시). 경기 시간은
 *   기본 2시간(`MATCH_MINUTES` — 전후반 90분 + 하프타임 15분 + 추가 시간).
 * - **킥오프 미정**(`tbc` · 대표팀 `kickoffTbd`): 자리값 시각을 사실처럼 보이지 않게 **종일 일정**(`VALUE=DATE`, 날짜 = 자리값 킥오프의 KST
 *   날짜 — 사이트의 '날짜 + 임시' 표기와 같은 날) + `STATUS:TENTATIVE` + 제목 끝 '(시각 미정)'.
 * - **연기**(`postponed`): `STATUS:CANCELLED` + 제목 앞 '[연기]'(구독 중이면 취소선·숨김 — 새 일정이 잡혀 `scheduled`로 돌아오면 같은 UID로
 *   되살아난다). 종료 경기는 `CONFIRMED` — **스코어·결과는 싣지 않는다**(결과 가리기 FR-37 — 캘린더 알림·목록에 결과가 새지 않게).
 * - 제목: `{홈} vs {원정} · {대회 약칭}`(홈 먼저 — D30, 팀 이름은 표기 사전 한글 — 사전에 없으면 원어). 묶음은 앞에 `[선수·선수]`(그 경기
 *   두 팀의 활성 한국 선수, 설정 순서). 설명: 대회 이름·라운드 / 킥오프 KST(기기 시간대가 KST가 아닐 때 확인용) / 묶음의 한국 선수 소속 /
 *   데이터 출처 표기(football-data.org는 약관 7.1 영문 원문 — FR-45). 데이터 값의 한국어 이름뿐이고 새 사실을 만들지 않는다(§1-7).
 * - 캘린더 머리: `NAME`·`X-WR-CALNAME`·`X-WR-CALDESC`, 갱신 주기 `REFRESH-INTERVAL`(RFC 7986)·`X-PUBLISHED-TTL` = 12시간(발행은 하루 1회),
 *   `URL`(그 페이지)·`SOURCE`(이 파일 절대 URL). 경기별 파일은 가져오기용이라 이름·갱신 주기를 넣지 않는다(가져올 때 새 캘린더가 생기지 않게).
 *   구독 캘린더의 일정은 `TRANSP:TRANSPARENT`(바쁨으로 표시하지 않음).
 *
 * 형식(RFC 5545 §3.1·§3.3.11): 줄 끝 CRLF, 75옥텟(UTF-8 바이트) 넘는 줄은 CRLF + 공백으로 접는다(한글·이모지 등 다바이트 문자 가운데서
 * 자르지 않는다), TEXT 값은 `\` `;` `,` 개행을 이스케이프하고 HTAB 밖의 제어 문자(C0·DEL·C1)는 지운다.
 */
import type { TeamLookup } from "@/lib/competition-view";
import { opponentOf } from "@/lib/korean-players-view";
import { KOREA_NAME } from "@/lib/national-team-view";
import type { SitePaths } from "@/lib/paths";
import { artifacts, routes, type CalendarFeed } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import type { Match } from "@/lib/schema/competition";
import type { NationalMatch } from "@/lib/schema/configs";
import type { PlayerNextMatch } from "@/lib/schema/player";
import { FOOTBALL_DATA_ATTRIBUTION, SITE_NAME } from "@/lib/site";
import { fixtureRoundLabel, teamMatchesOf } from "@/lib/team-view";
import {
  addMinutesUtc,
  formatIcsDate,
  formatIcsUtc,
  formatKst,
  kstDate,
  parseUtcIso,
  shiftDate,
} from "@/lib/time";

/** 기본 경기 시간(분) — DTEND = 킥오프 + 120분 */
export const MATCH_MINUTES = 120;

/** 묶음 캘린더가 거슬러 싣는 일수(데이터 시각 기준) — 머리 주석 '한국 선수 소속팀 묶음' */
export const KOREAN_PAST_DAYS = 7;

/** 구독 캘린더 갱신 주기(RFC 5545 DURATION) */
export const REFRESH_INTERVAL = "PT12H";

/** UID 오른쪽(배포 위치와 무관한 상수 — 바꾸면 구독자 캘린더에 일정이 겹친다) */
export const UID_DOMAIN = "euro-digest.sguys99.github.io";

/** 줄 접기 기준 옥텟 수(CRLF 제외 — RFC 5545 §3.1) */
export const ICS_LINE_OCTETS = 75;

/** 같은 경기로 보는 킥오프 차(대회 데이터 ↔ 현황 파일 `next` — src/lib/player-detail-view.ts와 같은 값) */
const SAME_MATCH_MS = 3 * 60 * 60 * 1000;

/** 제품 식별자 — ASCII만(오래된 클라이언트 호환) */
const PRODID = "-//sguys99//Euro Digest v0.1//KO";

// ─── 입력 ───────────────────────────────────────────────────────────────────

/** 대회 설정에서 쓰는 값(configs/competitions.json) */
export interface IcsCompetition {
  id: CompId;
  nameKo: string;
  shortKo: string;
}

/** 대회 데이터에서 쓰는 값(data/competitions/{comp}.json) */
export interface IcsCompetitionData {
  comp: CompId;
  provider: "football-data" | "api-football";
  updatedAt: string;
  matches: readonly Match[];
}

/** 한국 선수 설정에서 쓰는 값(configs/korean-players.json — 설정 순서 = 이름 순서) */
export interface IcsKoreanPlayer {
  slug: string;
  nameKo: string;
  team: string;
  active: boolean;
}

/** 한국 선수 현황 파일에서 쓰는 값(data/players/korean.json) */
export interface IcsKoreanData {
  generatedAt: string;
  players: ReadonlyArray<{
    slug: string;
    team: string;
    next: PlayerNextMatch | null;
  }>;
}

export interface CalendarInput {
  competitions: readonly IcsCompetition[];
  data: readonly IcsCompetitionData[];
  /** 팀 페이지가 있는 팀 slug(data/teams) — 팀별 캘린더 대상 */
  teams: readonly string[];
  /** 팀 slug → 이름(표기 사전 — loadTeamLookup) */
  team: TeamLookup;
  /** 데이터 API 원문 팀 이름 → 한글(사전 정확 일치) — 대회 데이터 밖 상대 팀 */
  teamNameKo: (en: string) => string | null;
  /** 데이터 API 원문 대회 이름 → 한글(사전 정확 일치) — 컵 등 기타 대회 */
  competitionNameKo: (en: string) => string | null;
  players: readonly IcsKoreanPlayer[];
  korean: IcsKoreanData | null;
  national: readonly NationalMatch[];
  paths: SitePaths;
}

/** 생성한 파일 하나 */
export interface CalendarFile {
  feed: CalendarFeed;
  /** 사이트 경로(basePath 없음) — `/calendar/arsenal.ics` */
  path: string;
  ics: string;
  events: number;
}

// ─── 형식 ───────────────────────────────────────────────────────────────────

/** TEXT 값 이스케이프(RFC 5545 §3.3.11) — 제어 문자(HTAB 밖)를 지우고 `\` `;` `,` 개행을 이스케이프 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\t\n]/gu, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** 문자 하나(코드 포인트)의 UTF-8 바이트 수 */
function utf8Length(char: string): number {
  const cp = char.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * 줄 접기(RFC 5545 §3.1) — 줄마다 CRLF를 뺀 75옥텟 이하, 이어지는 줄은 공백 1칸 + 74옥텟 이하. 코드 포인트 단위로 자르므로
 * UTF-8 다바이트 문자·서로게이트 쌍을 가르지 않는다. 결과는 CRLF로 이은 문자열(끝 CRLF 없음).
 */
export function foldIcsLine(
  line: string,
  limit: number = ICS_LINE_OCTETS,
): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      parts.push(current);
      current = " ";
      octets = 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** 내용 줄 목록 → .ics 문자열(줄마다 접기, CRLF, 끝 CRLF) */
export function serializeIcs(lines: readonly string[]): string {
  return `${lines.map((l) => foldIcsLine(l)).join("\r\n")}\r\n`;
}

// ─── 일정 모델 ──────────────────────────────────────────────────────────────

type EventStart =
  { kind: "time"; iso: string } | { kind: "date"; date: string };

export interface IcsEvent {
  /** 경기 id(UID 왼쪽) */
  id: string;
  /** 정렬 키 — 킥오프 UTC ISO */
  kickoff: string;
  start: EventStart;
  stamp: string;
  summary: string;
  description: readonly string[];
  category: string;
  location: string | null;
  status: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  url: string;
}

/** UID — `{경기 id}@euro-digest.sguys99.github.io` */
export function eventUid(matchId: string): string {
  return `${matchId}@${UID_DOMAIN}`;
}

function eventLines(event: IcsEvent, transparent: boolean): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${eventUid(event.id)}`];
  lines.push(`DTSTAMP:${formatIcsUtc(event.stamp)}`);
  if (event.start.kind === "time") {
    lines.push(`DTSTART:${formatIcsUtc(event.start.iso)}`);
    lines.push(
      `DTEND:${formatIcsUtc(addMinutesUtc(event.start.iso, MATCH_MINUTES))}`,
    );
  } else {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.start.date)}`);
    lines.push(
      `DTEND;VALUE=DATE:${formatIcsDate(shiftDate(event.start.date, 1))}`,
    );
  }
  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(event.description.join("\n"))}`);
  lines.push(`CATEGORIES:${escapeIcsText(event.category)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push(`STATUS:${event.status}`);
  if (transparent) lines.push("TRANSP:TRANSPARENT");
  lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT");
  return lines;
}

/** 일정 정렬 — 킥오프(시각 값 — 밀리초 표기 유무와 무관) · id 순 */
function sortEvents(events: IcsEvent[]): IcsEvent[] {
  const ms = (e: IcsEvent): number => parseUtcIso(e.kickoff).getTime();
  return events.sort((a, b) => ms(a) - ms(b) || a.id.localeCompare(b.id));
}

export interface CalendarMeta {
  name: string;
  description: string;
  /** 그 캘린더의 사이트 페이지 절대 URL */
  url: string;
  /** 이 파일의 절대 URL */
  source: string;
}

/** 구독 캘린더(팀·묶음) 문자열 */
export function renderSubscription(
  meta: CalendarMeta,
  events: readonly IcsEvent[],
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeIcsText(meta.name)}`,
    `X-WR-CALNAME:${escapeIcsText(meta.name)}`,
    `X-WR-CALDESC:${escapeIcsText(meta.description)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
    `URL:${meta.url}`,
    `SOURCE;VALUE=URI:${meta.source}`,
  ];
  for (const event of events) lines.push(...eventLines(event, true));
  lines.push("END:VCALENDAR");
  return serializeIcs(lines);
}

/** 경기별(가져오기용 일정 1개) 문자열 */
export function renderSingle(event: IcsEvent): string {
  return serializeIcs([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...eventLines(event, false),
    "END:VCALENDAR",
  ]);
}

// ─── 경기 → 일정 ────────────────────────────────────────────────────────────

interface Context {
  input: CalendarInput;
  comps: ReadonlyMap<CompId, IcsCompetition>;
  providers: ReadonlyMap<CompId, IcsCompetitionData["provider"]>;
  /** DTSTAMP — 데이터 시각(없으면 null → 일정 킥오프) */
  asOf: string | null;
}

function attribution(
  provider: IcsCompetitionData["provider"] | undefined,
): string {
  return provider === "api-football"
    ? "일정 데이터: API-Football"
    : FOOTBALL_DATA_ATTRIBUTION;
}

function startOf(kickoff: string, tbc: boolean): EventStart {
  return tbc
    ? { kind: "date", date: kstDate(kickoff) }
    : { kind: "time", iso: kickoff };
}

function kickoffLine(
  kickoff: string,
  tbc: boolean,
  postponed: boolean,
): string {
  if (postponed) return "경기 연기 — 새 일정 미정";
  if (tbc) return "킥오프 시각 미정 — 날짜도 바뀔 수 있음";
  return `킥오프 ${formatKst(kickoff, "datetime")} KST`;
}

function summaryOf(
  home: string,
  away: string,
  comp: string,
  opts: { names?: readonly string[]; tbc: boolean; postponed: boolean },
): string {
  const head = opts.postponed ? "[연기] " : "";
  const names =
    opts.names && opts.names.length > 0 ? `[${opts.names.join("·")}] ` : "";
  const tail = !opts.postponed && opts.tbc ? " (시각 미정)" : "";
  return `${head}${names}${home} vs ${away} · ${comp}${tail}`;
}

/** 대회 데이터 경기 → 일정. `korean`이 있으면 묶음 표기(선수 이름·소속 줄) */
export function matchEvent(
  ctx: Context,
  match: Match,
  korean?: readonly IcsKoreanPlayer[],
): IcsEvent {
  const { input } = ctx;
  const comp = ctx.comps.get(match.comp);
  const compName = comp?.nameKo ?? match.comp;
  const home = input.team(match.home).name;
  const away = input.team(match.away).name;
  const tbc = match.tbc === true;
  const postponed = match.status === "postponed";
  const description = [
    `${compName} ${fixtureRoundLabel(match.comp, match.round)}`,
    kickoffLine(match.kickoff, tbc, postponed),
  ];
  if (korean && korean.length > 0) description.push(koreanLine(input, korean));
  description.push(attribution(ctx.providers.get(match.comp)));
  return {
    id: match.id,
    kickoff: match.kickoff,
    start: startOf(match.kickoff, tbc),
    stamp: ctx.asOf ?? match.kickoff,
    summary: summaryOf(home, away, comp?.shortKo ?? match.comp, {
      names: korean?.map((p) => p.nameKo),
      tbc,
      postponed,
    }),
    description,
    category: compName,
    location: null,
    status: postponed ? "CANCELLED" : tbc ? "TENTATIVE" : "CONFIRMED",
    url: input.paths.absoluteUrl(routes.competition(match.comp)),
  };
}

/** 묶음 설명 줄 — "한국 선수 소속: 이강인(아틀레티코 마드리드) · 김민재(바이에른 뮌헨)" */
function koreanLine(
  input: CalendarInput,
  players: readonly IcsKoreanPlayer[],
): string {
  return `한국 선수 소속: ${players
    .map((p) => `${p.nameKo}(${input.team(p.team).name})`)
    .join(" · ")}`;
}

/** 현황 파일 `next`(컵 등 대회 데이터 밖 경기 포함) → 일정. `team` = 그 선수 소속팀 */
export function nextEvent(
  ctx: Context,
  next: PlayerNextMatch,
  team: string,
  korean?: readonly IcsKoreanPlayer[],
): IcsEvent {
  const { input } = ctx;
  const self = input.team(team).name;
  const them = opponentOf(next.opponent, input.team, input.teamNameKo).name;
  const comp = next.comp === "OTHER" ? null : ctx.comps.get(next.comp);
  const compName =
    next.comp === "OTHER"
      ? next.leagueRaw === undefined
        ? "기타 대회"
        : (input.competitionNameKo(next.leagueRaw) ?? next.leagueRaw)
      : (comp?.nameKo ?? next.comp);
  const description = [compName, kickoffLine(next.kickoff, false, false)];
  if (korean && korean.length > 0) description.push(koreanLine(input, korean));
  description.push(
    next.comp === "OTHER"
      ? "일정 데이터: API-Football"
      : attribution(ctx.providers.get(next.comp)),
  );
  const [home, away] = next.home ? [self, them] : [them, self];
  const first = korean?.[0];
  return {
    id: next.matchId,
    kickoff: next.kickoff,
    start: { kind: "time", iso: next.kickoff },
    stamp: ctx.asOf ?? next.kickoff,
    summary: summaryOf(home, away, comp?.shortKo ?? compName, {
      names: korean?.map((p) => p.nameKo),
      tbc: false,
      postponed: false,
    }),
    description,
    category: compName,
    location: null,
    status: "CONFIRMED",
    url: input.paths.absoluteUrl(
      first ? routes.koreanPlayer(first.slug) : routes.koreanPlayers(),
    ),
  };
}

/** 대표팀 경기 → 일정(대진 순서는 `home` — 한국 홈이면 대한민국 먼저) */
export function nationalEvent(ctx: Context, match: NationalMatch): IcsEvent {
  const { input } = ctx;
  const [home, away] = match.home
    ? [KOREA_NAME, match.opponent]
    : [match.opponent, KOREA_NAME];
  const tbc = match.kickoffTbd;
  const postponed = match.status === "postponed";
  const description = [
    match.competition,
    kickoffLine(match.kickoff, tbc, postponed),
  ];
  if (match.sourceUrl) description.push(`일정 출처: ${match.sourceUrl}`);
  return {
    id: match.id,
    kickoff: match.kickoff,
    start: startOf(match.kickoff, tbc),
    stamp: ctx.asOf ?? match.kickoff,
    summary: summaryOf(home, away, "A매치", { tbc, postponed }),
    description,
    category: match.competition,
    location: match.venue ?? null,
    status: postponed ? "CANCELLED" : tbc ? "TENTATIVE" : "CONFIRMED",
    url: input.paths.absoluteUrl(routes.nationalTeam()),
  };
}

// ─── 캘린더 ─────────────────────────────────────────────────────────────────

function contextOf(input: CalendarInput): Context {
  const stamps = [
    ...input.data.map((d) => d.updatedAt),
    ...(input.korean ? [input.korean.generatedAt] : []),
  ];
  let asOf: string | null = null;
  for (const s of stamps) {
    if (
      asOf === null ||
      parseUtcIso(s).getTime() > parseUtcIso(asOf).getTime()
    ) {
      asOf = s;
    }
  }
  return {
    input,
    comps: new Map(input.competitions.map((c) => [c.id, c])),
    providers: new Map(input.data.map((d) => [d.comp, d.provider])),
    asOf,
  };
}

function allMatchLists(input: CalendarInput): ReadonlyArray<readonly Match[]> {
  return input.data.map((d) => d.matches);
}

/** 팀별 캘린더 일정 — 그 팀 시즌 전체(킥오프 순) */
export function teamEvents(ctx: Context, slug: string): IcsEvent[] {
  return teamMatchesOf(allMatchLists(ctx.input), slug).map((m) =>
    matchEvent(ctx, m),
  );
}

/** 활성 한국 선수(설정 순서) */
function activePlayers(input: CalendarInput): IcsKoreanPlayer[] {
  return input.players.filter((p) => p.active);
}

/** 묶음 캘린더 일정(머리 주석 규칙) */
export function koreanEvents(ctx: Context): IcsEvent[] {
  const { input } = ctx;
  const players = activePlayers(input);
  const byTeam = new Map<string, IcsKoreanPlayer[]>();
  for (const p of players) {
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  }
  const fromMs =
    ctx.asOf === null
      ? Number.NEGATIVE_INFINITY
      : parseUtcIso(ctx.asOf).getTime() -
        KOREAN_PAST_DAYS * 24 * 60 * 60 * 1000;
  const inWindow = (kickoff: string): boolean =>
    parseUtcIso(kickoff).getTime() >= fromMs;
  const namesFor = (...teams: string[]): IcsKoreanPlayer[] =>
    players.filter((p) => teams.includes(p.team));

  const events: IcsEvent[] = [];
  const matches: Match[] = [];
  const seen = new Set<string>();
  for (const list of allMatchLists(input)) {
    for (const m of list) {
      if (seen.has(m.id)) continue;
      if (!byTeam.has(m.home) && !byTeam.has(m.away)) continue;
      seen.add(m.id);
      matches.push(m);
      if (inWindow(m.kickoff)) {
        events.push(matchEvent(ctx, m, namesFor(m.home, m.away)));
      }
    }
  }
  // 현황 파일 `next` — 대회 데이터에 같은 경기가 없을 때만(id, 또는 킥오프 3시간 안 + 같은 두 팀)
  const configTeam = new Map(players.map((p) => [p.slug, p.team]));
  for (const record of input.korean?.players ?? []) {
    const next = record.next;
    if (!next || configTeam.get(record.slug) !== record.team) continue;
    if (seen.has(next.matchId)) continue;
    const kickoffMs = parseUtcIso(next.kickoff).getTime();
    const dup = matches.some(
      (m) =>
        next.opponent.slug !== null &&
        Math.abs(parseUtcIso(m.kickoff).getTime() - kickoffMs) <=
          SAME_MATCH_MS &&
        [m.home, m.away].includes(record.team) &&
        [m.home, m.away].includes(next.opponent.slug),
    );
    seen.add(next.matchId);
    if (dup || !inWindow(next.kickoff)) continue;
    const teams = [
      record.team,
      ...(next.opponent.slug ? [next.opponent.slug] : []),
    ];
    events.push(nextEvent(ctx, next, record.team, namesFor(...teams)));
  }
  return sortEvents(events);
}

/** 경기별 파일 일정 — 대회 데이터 `scheduled` 전부 + 현황 파일 `next` + 대표팀 예정 경기. 같은 id는 한 번(id 충돌은 던진다) */
export function matchFileEvents(ctx: Context): IcsEvent[] {
  const { input } = ctx;
  const out = new Map<string, IcsEvent>();
  for (const list of allMatchLists(input)) {
    for (const m of list) {
      if (m.status !== "scheduled" || out.has(m.id)) continue;
      out.set(m.id, matchEvent(ctx, m));
    }
  }
  const compIds = new Set(
    allMatchLists(input).flatMap((l) => l.map((m) => m.id)),
  );
  for (const record of input.korean?.players ?? []) {
    const next = record.next;
    if (!next || compIds.has(next.matchId) || out.has(next.matchId)) continue;
    out.set(next.matchId, nextEvent(ctx, next, record.team));
  }
  for (const nm of input.national) {
    if (nm.status !== "scheduled") continue;
    if (out.has(nm.id) || compIds.has(nm.id)) {
      throw new Error(`대표팀 경기 id가 다른 경기 id와 겹침: ${nm.id}`);
    }
    out.set(nm.id, nationalEvent(ctx, nm));
  }
  return sortEvents([...out.values()]);
}

/** 캘린더 파일 전부 — 팀별(설정 순서가 아니라 입력 `teams` 순서) → 묶음 → 경기별(킥오프 순) */
export function buildSiteCalendars(input: CalendarInput): CalendarFile[] {
  const ctx = contextOf(input);
  const { paths } = input;
  const files: CalendarFile[] = [];
  for (const slug of input.teams) {
    const feed: CalendarFeed = { kind: "team", team: slug };
    const events = teamEvents(ctx, slug);
    const name = input.team(slug).name;
    files.push({
      feed,
      path: artifacts.calendar(feed),
      events: events.length,
      ics: renderSubscription(
        {
          name: `${name} 경기 일정 · ${SITE_NAME}`,
          description: `${name}의 시즌 경기 일정(6개 대회 데이터 — 지난 경기 포함, 결과는 싣지 않음). 킥오프 시각 미정 경기는 종일 일정으로 표시.`,
          url: paths.absoluteUrl(routes.team(slug)),
          source: paths.icsUrl(feed),
        },
        events,
      ),
    });
  }
  const koreanFeed: CalendarFeed = { kind: "korean" };
  const korean = koreanEvents(ctx);
  files.push({
    feed: koreanFeed,
    path: artifacts.calendar(koreanFeed),
    events: korean.length,
    ics: renderSubscription(
      {
        name: `한국 선수 소속팀 경기 · ${SITE_NAME}`,
        description: `유럽에서 뛰는 한국 선수 소속팀의 경기 일정(최근 ${KOREAN_PAST_DAYS}일 + 앞으로, 결과는 싣지 않음). 제목의 [ ]는 그 팀 소속 선수이며 출전 여부가 아님.`,
        url: paths.absoluteUrl(routes.koreanPlayers()),
        source: paths.icsUrl(koreanFeed),
      },
      korean,
    ),
  });
  for (const event of matchFileEvents(ctx)) {
    const feed: CalendarFeed = { kind: "match", matchId: event.id };
    files.push({
      feed,
      path: artifacts.calendar(feed),
      events: 1,
      ics: renderSingle(event),
    });
  }
  return files;
}
