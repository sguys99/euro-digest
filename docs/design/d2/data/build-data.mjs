#!/usr/bin/env node
/**
 * D2 시안 공용 데이터 생성기 — docs/design/d2/data/d2-data.json
 *
 * 버전 v0.1 · 2026-10-31 · 게이트 D2(plan §9 D2-01) · 범위·규칙 = docs/design/d2/scope.md §1·§2·§3·§5·§6
 * 실행: node docs/design/d2/data/build-data.mjs   (의존성 없음 — node 내장 모듈만)
 *
 * 규칙
 * - 저장소 파일만 읽는다(configs/ · data/ · fixtures/). 네트워크·LLM 호출·.env 읽기 없음. 쓰는 파일은 d2-data.json 하나.
 * - 문구를 만들지 않는다. 카드 원제목(t)은 원본 그대로 복사한다(D23 — 번역·다듬기 금지). 여기서 붙이는 한국어는
 *   데이터 값의 이름(상태·단계·대회 라벨 — src/lib/news/labels.ts와 같은 표)과 계산 결과의 표기뿐이다.
 * - 시각: 저장값 UTC를 그대로 두고 KST(+9h) 표시 문자열을 미리 계산한다(src/lib/time.ts formatKst 스타일과 같은 꼴).
 * - 키트 글자색: src/lib/kit-contrast.ts와 같은 규칙(#FFFFFF · #14213D 중 대비 큰 쪽, 하한 5.3 — 못 넘으면 상의 색 보정).
 * - 데이터가 없는 곳은 { placeholder: true, reason, fillStage } 자리 객체.
 * - 각 블록에 source(읽은 파일 경로)를 남긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const OUT = path.join(HERE, "d2-data.json");

// ─── 기준 ───────────────────────────────────────────────────────────────────
/** 기준 시각 2026-10-31 (토) 07:11 KST — 제 20호 수집 직후(scope §1) */
const REF_UTC = "2026-10-30T22:11:00.000Z";
const REF_MS = Date.parse(REF_UTC);
const ISSUE_DATE = "2026-10-31";
const FIRST_ISSUE_DATE = "2026-10-12"; // 창간 = 제 1호(D29)
const DETAIL_SLUG = "kim-min-jae"; // Q2 ①
const FOLLOW_SAMPLE = {
  teams: ["bayern-munchen", "atletico-madrid", "arsenal"],
  players: ["kim-min-jae", "lee-kang-in"],
}; // Q2 ① — 시안 표본(실데이터 아님)
const FOLLOW_LIMIT = 5; // scope §5 — 시안 가정, M4-07에서 확정
const ONBOARDING_TEAM_MAX = 5; // FR-113
const QUIET_DAYS = 30; // FR-106
const SEARCH_QUERIES = ["김민재", "Lee Kang-in", "토트넘", "정우영"];
const SEARCH_EMPTY_QUERY = "Magdeburg";
const WEEK = { id: "2026-43", from: "2026-10-19T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z" };
const WEEK_NEXT = { id: "2026-44", from: "2026-10-26T00:00:00.000Z", to: "2026-11-02T00:00:00.000Z" };

// ─── 읽기 ───────────────────────────────────────────────────────────────────
const READ = new Set();
function readJson(rel) {
  READ.add(rel);
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const P_PLAYERS = "configs/korean-players.json";
const P_COLORS = "configs/team-colors.json";
const P_NAMES = "configs/names.ko.json";
const P_COMPS = "configs/competitions.json";
const P_TEAM_IDS = "configs/team-ids.json";
const P_SOURCES = "configs/sources.json";
const P_LEDGER = "data/matches/2026-10.json";
const P_LEDGER_META = "data/matches/meta.json";
const P_FIXTURE_NEWS = "fixtures/news-sample.json";

const koreanPlayers = readJson(P_PLAYERS);
const teamColors = readJson(P_COLORS);
const namesKo = readJson(P_NAMES).entries;
const competitions = readJson(P_COMPS);
const teamIds = readJson(P_TEAM_IDS);
const sources = readJson(P_SOURCES);
const ledger = readJson(P_LEDGER);
const ledgerMeta = readJson(P_LEDGER_META);

const teamFiles = {};
for (const f of fs.readdirSync(path.join(ROOT, "data/teams")).filter((f) => f.endsWith(".json")).sort()) {
  const rel = `data/teams/${f}`;
  teamFiles[f.replace(/\.json$/, "")] = { rel, data: JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) };
}
READ.add("data/teams/*.json");

const compFiles = {};
for (const f of fs.readdirSync(path.join(ROOT, "data/competitions")).filter((f) => f.endsWith(".json")).sort()) {
  const rel = `data/competitions/${f}`;
  const d = readJson(rel);
  compFiles[d.comp] = { rel, data: d };
}

/** 뉴스 카드 — 16일치 + fixtures 견본. 같은 id가 여러 날에 있으면 뒤 날짜(마지막 발행)를 쓴다 */
const newsFiles = fs.readdirSync(path.join(ROOT, "data/news")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const cardIndex = new Map(); // id → { card, file, issueDate }
const issueCards = new Map(); // date → [id]
let rawCardCount = 0;
for (const f of newsFiles) {
  const rel = `data/news/${f}`;
  const d = readJson(rel);
  issueCards.set(d.date, d.cards.map((c) => c.id));
  for (const c of d.cards) {
    rawCardCount++;
    cardIndex.set(c.id, { card: c, file: rel, issueDate: d.date });
  }
}
const fixtureNews = readJson(P_FIXTURE_NEWS);
const fixtureCardIds = new Set();
for (const c of fixtureNews.cards) {
  if (!cardIndex.has(c.id)) {
    cardIndex.set(c.id, { card: c, file: P_FIXTURE_NEWS, issueDate: null, fixture: true });
    fixtureCardIds.add(c.id);
  }
}
const liveCards = [...cardIndex.values()].filter((x) => !x.fixture);

// ─── 시각 ───────────────────────────────────────────────────────────────────
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n) => String(n).padStart(2, "0");
const HOUR = 3600e3;
const DAY = 24 * HOUR;
function parseIso(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`시각 형식 오류: ${iso}`);
  return ms;
}
/** UTC ISO → { utc, kst, dayShort, time, short, date, datetime } — formatKst 스타일과 같은 꼴 */
function when(iso) {
  if (iso == null) return null;
  const ms = parseIso(iso);
  const k = new Date(ms + 9 * HOUR);
  const y = k.getUTCFullYear();
  const mo = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const wd = WD[k.getUTCDay()];
  const time = `${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}`;
  return {
    utc: new Date(ms).toISOString(),
    kst: `${y}-${p2(mo)}-${p2(d)}T${time}:${p2(k.getUTCSeconds())}+09:00`,
    dayShort: `${p2(mo)}.${p2(d)} (${wd})`,
    time,
    short: `${p2(mo)}.${p2(d)} ${time}`,
    date: `${mo}월 ${d}일 (${wd})`,
    datetime: `${mo}월 ${d}일 (${wd}) ${time}`,
  };
}
function kstEpochDay(ms) {
  return Math.floor((ms + 9 * HOUR) / DAY);
}
/** relativeKst(iso, 기준 시각)와 같은 규칙 */
function relative(iso) {
  const t = parseIso(iso);
  const diff = REF_MS - t;
  if (diff < 0) return diff > -60e3 ? "방금" : when(iso).datetime;
  if (diff < 60e3) return "방금";
  if (diff < HOUR) return `${Math.floor(diff / 60e3)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  const days = kstEpochDay(REF_MS) - kstEpochDay(t);
  if (days <= 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return when(iso).date;
}
function issueNo(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${FIRST_ISSUE_DATE}T00:00:00Z`)) / DAY) + 1;
}
/** 발행일(KST) 호의 브리핑 창 = 전날 UTC 하루(경기일 '현지' — scope §2, DESIGN §9.3 5줄 부제) */
function briefWindow(date) {
  const to = Date.parse(`${date}T00:00:00Z`);
  return { from: new Date(to - DAY).toISOString(), to: new Date(to).toISOString() };
}

// ─── 키트 대비 (src/lib/kit-contrast.ts와 같은 규칙) ───────────────────────────
const KIT_TEXT = ["#FFFFFF", "#14213D"];
const KIT_MIN = 5.3;
function rgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`색 형식 오류: ${hex}`);
  return [1, 2, 3].map((i) => parseInt(m[i], 16));
}
function lum(hex) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const round2 = (n) => Math.round(n * 100) / 100;
function kit(k1) {
  const scored = KIT_TEXT.map((c) => ({ c, r: contrast(k1, c) })).sort((a, b) => b.r - a.r);
  let { c: kf, r } = scored[0];
  let top = k1;
  let factor = null;
  if (r < KIT_MIN) {
    for (let f = 0.98; f >= 0.4 - 1e-9; f -= 0.02) {
      const cand = "#" + rgb(k1).map((v) => p2(Math.round(v * f).toString(16)).toUpperCase()).join("");
      if (contrast(cand, "#FFFFFF") >= KIT_MIN) {
        top = cand;
        kf = "#FFFFFF";
        r = contrast(cand, "#FFFFFF");
        factor = round2(f);
        break;
      }
    }
  }
  return { k1: top, kf, kfContrast: round2(r), corrected: factor === null ? false : { from: k1, factor } };
}

// ─── 이름 ───────────────────────────────────────────────────────────────────
const namesBySlug = new Map();
for (const e of namesKo) if (e.slug && !namesBySlug.has(`${e.kind}:${e.slug}`)) namesBySlug.set(`${e.kind}:${e.slug}`, e);
function nameEntry(kind, slug) {
  return namesBySlug.get(`${kind}:${slug}`) ?? null;
}
/** 영문 원문 → 한글(사전 정확 일치일 때만 — scope §5, D63 ①) */
function nameByExactAlias(kind, raw) {
  return namesKo.find((e) => e.kind === kind && (e.en.includes(raw) || e.ko === raw)) ?? null;
}
const compById = new Map(competitions.map((c) => [c.id, c]));
const COMP_LABEL_OTHER = "기타 대회";
function compRef(id) {
  if (id == null || id === "OTHER") return { id: "OTHER", shortKo: null, nameKo: COMP_LABEL_OTHER };
  const c = compById.get(id);
  return { id, shortKo: c.shortKo, nameKo: c.nameKo };
}
const playerBySlug = new Map(koreanPlayers.map((p) => [p.slug, p]));
const playerByAf = new Map(koreanPlayers.filter((p) => p.apiFootballId != null).map((p) => [p.apiFootballId, p]));
const slugByAf = new Map(Object.entries(teamIds).map(([slug, v]) => [v.af, slug]));

// ─── 팀 ─────────────────────────────────────────────────────────────────────
const teamCache = new Map();
const USED_TEAMS = new Set();
/** 블록 안 팀 참조 — { slug, nameKo }. 배지·키트 색은 최상위 teams[slug] */
function tref(slug) {
  const t = teamFull(slug);
  return { slug, nameKo: t.nameKo };
}
/** 팀 slug → 배지·이름(data/teams + configs/team-colors.json, 없으면 names.ko + 폴백 배지) */
function teamFull(slug) {
  USED_TEAMS.add(slug);
  if (teamCache.has(slug)) return teamCache.get(slug);
  const tf = teamFiles[slug];
  const col = teamColors[slug];
  const ne = nameEntry("team", slug);
  const nameKo = tf?.data.nameKo ?? ne?.ko ?? null;
  const out = {
    slug,
    nameKo,
    nameEn: tf?.data.nameEn ?? ne?.en?.[0] ?? null,
    hasPage: Boolean(tf), // /teams/{slug}/ 정적 페이지가 생기는 팀(data/teams에 있음)
    comp: tf?.data.comp ?? null,
    alsoIn: tf?.data.alsoIn ?? [],
    koreanPlayers: tf?.data.koreanPlayers ?? [],
    badge: col
      ? { fallback: false, short: col.short.trim(), k2: col.colors[1], ...kit(col.colors[0]) }
      : { fallback: true, short: null, note: "team-colors.json에 없음 → 폴백 배지(면 없음 · dashed 외곽 · 아래 2/5 --hatch — DESIGN §9.3 D1 팀 배지)" },
    source: [tf ? tf.rel : null, col ? P_COLORS : null, !tf && ne ? P_NAMES : null].filter(Boolean),
  };
  teamCache.set(slug, out);
  return out;
}
/** 원장 팀(af id + 원문 이름) → 상대 팀 표시 */
function ledgerTeam(side) {
  const slug = slugByAf.get(side.id) ?? null;
  if (slug && (teamFiles[slug] || teamColors[slug])) {
    const t = teamFull(slug);
    return { slug, name: t.nameKo ?? side.name, nameRaw: side.name, nameSource: "data/teams(배지는 teams[slug])", hasPage: t.hasPage };
  }
  const ne = nameByExactAlias("team", side.name);
  return {
    slug: null,
    name: ne ? ne.ko : side.name,
    nameRaw: side.name,
    nameLang: ne ? "ko" : "en",
    nameSource: ne ? "names.ko(정확 일치)" : "원문(영문) — names.ko 미등록(scope §6 #9)",
    badge: { fallback: true, short: null, note: "대응표·팀 컬러 밖 팀 → 폴백 배지" },
    hasPage: false,
  };
}
function standing(slug, comp) {
  const c = compFiles[comp];
  const row = c?.data.standings.find((s) => s.team === slug);
  if (!row) return null;
  return { comp, pos: row.pos, prevPos: row.prevPos, pts: row.pts, played: row.played, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, form: row.form, source: c.rel, updated: when(c.data.updatedAt) };
}

// ─── 경기 (football-data — data/competitions) ───────────────────────────────
const allFdMatches = Object.values(compFiles).flatMap(({ rel, data }) => data.matches.map((m) => ({ ...m, _src: rel })));
function roundLabel(comp, round) {
  if (round == null) return null;
  if (/^\d+$/.test(round)) return comp === "UCL" ? `리그 페이즈 ${round}차전` : `${round}라운드`;
  return round;
}
function fdMatchView(m, forTeam) {
  const home = m.home === forTeam;
  const opp = home ? m.away : m.home;
  const v = {
    matchId: m.id,
    comp: compRef(m.comp),
    round: m.round,
    roundLabel: roundLabel(m.comp, m.round),
    kickoff: when(m.kickoff),
    status: m.status,
    home,
    venueLabel: home ? "홈" : "원정",
    homeTeam: tref(m.home),
    awayTeam: tref(m.away),
    opponent: tref(opp),
    source: m._src,
  };
  if (m.score) {
    const f = home ? m.score.h : m.score.a;
    const a = home ? m.score.a : m.score.h;
    v.scoreHomeAway = { home: m.score.h, away: m.score.a, text: `${m.score.h}-${m.score.a}` };
    v.result = { for: f, against: a, outcome: f > a ? "W" : f < a ? "L" : "D", outcomeLabel: f > a ? "승" : f < a ? "패" : "무", text: `${f}-${a}` };
  }
  return v;
}
function upcoming(slug, n) {
  return allFdMatches
    .filter((m) => (m.home === slug || m.away === slug) && m.status === "scheduled" && parseIso(m.kickoff) > REF_MS)
    .sort((a, b) => parseIso(a.kickoff) - parseIso(b.kickoff))
    .slice(0, n)
    .map((m) => fdMatchView(m, slug));
}
function recentResults(slug, n) {
  return allFdMatches
    .filter((m) => (m.home === slug || m.away === slug) && m.status === "finished" && m.score && parseIso(m.kickoff) <= REF_MS)
    .sort((a, b) => parseIso(b.kickoff) - parseIso(a.kickoff))
    .slice(0, n)
    .map((m) => fdMatchView(m, slug));
}

// ─── 출전 로그 (원장 — data/matches) ────────────────────────────────────────
const APPEARANCE = {
  start: { label: "선발", appeared: true },
  sub: { label: "교체", appeared: true },
  bench: { label: "벤치 · 미출전", appeared: false },
  absent: { label: "명단 제외", appeared: false },
  unknown: { label: "라인업 없음", appeared: null, note: "출전 여부 모름 — 0으로 세지 않는다" },
};
function ledgerRound(m) {
  if (!m.round) return null;
  let r;
  if ((r = /^Regular Season - (\d+)$/.exec(m.round))) return `${r[1]}라운드`;
  if ((r = /^League Stage - (\d+)$/.exec(m.round))) return `리그 페이즈 ${r[1]}차전`;
  if ((r = /^Round of (\d+)$/.exec(m.round))) return `${r[1]}강`;
  return m.round;
}
const logsByPlayer = new Map();
for (const m of ledger.matches) {
  for (const row of m.korean) {
    const p = playerByAf.get(row.player);
    if (!p) throw new Error(`원장 한국 선수 행의 id가 명단에 없음: ${row.player}`);
    const mine = row.side === "home" ? m.home : m.away;
    const other = row.side === "home" ? m.away : m.home;
    const f = row.side === "home" ? m.ft.home : m.ft.away;
    const a = row.side === "home" ? m.ft.away : m.ft.home;
    const goalEvents = m.goals.filter((g) => g.kind !== "own-goal" && g.scorer.id === row.player);
    const assistEvents = m.goals.filter((g) => g.assist && g.assist.id === row.player);
    const minute = (g) => (g.extra ? `${g.minute}+${g.extra}` : `${g.minute}`);
    const entry = {
      matchId: m.id,
      comp: compRef(m.comp),
      compNote: m.comp == null ? "원장 comp: null — 화면 스키마(PlayerMatchLog.comp)는 'OTHER'뿐이라 '기타 대회'로만 쓸 수 있다(scope §6 #1)" : undefined,
      leagueRaw: m.league,
      round: m.round,
      roundLabel: ledgerRound(m),
      kickoff: when(m.kickoff),
      home: row.side === "home",
      venueLabel: row.side === "home" ? "홈" : "원정",
      team: ledgerTeam(mine),
      opponent: ledgerTeam(other),
      status: row.status,
      statusLabel: APPEARANCE[row.status].label,
      appeared: APPEARANCE[row.status].appeared,
      started: row.status === "start" ? true : row.status === "unknown" ? null : false,
      minutes: row.minutes,
      minutesLabel: row.minutes == null ? "–" : `${row.minutes}분`,
      goals: row.goals,
      assists: row.assists,
      goalMinutes: goalEvents.map(minute),
      assistMinutes: assistEvents.map(minute),
      result: { for: f, against: a, outcome: f > a ? "W" : f < a ? "L" : "D", outcomeLabel: f > a ? "승" : f < a ? "패" : "무", text: `${f}-${a}`, basis: "소속팀 기준(for-against)" },
      scoreHomeAway: { home: m.ft.home, away: m.ft.away, text: `${m.ft.home}-${m.ft.away}`, homeName: ledgerTeam(m.home).name, awayName: ledgerTeam(m.away).name, basis: "홈-원정(DESIGN §3.5)" },
      pens: m.pens,
      source: P_LEDGER,
    };
    if (entry.compNote === undefined) delete entry.compNote;
    if (!logsByPlayer.has(p.slug)) logsByPlayer.set(p.slug, []);
    logsByPlayer.get(p.slug).push(entry);
  }
}
for (const list of logsByPlayer.values()) list.sort((a, b) => parseIso(b.kickoff.utc) - parseIso(a.kickoff.utc));

const COMP_ORDER = ["EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1", "UCL", "OTHER"];
function tally(rows) {
  const t = { rows: rows.length, inSquad: 0, apps: 0, starts: 0, subs: 0, minutes: 0, goals: 0, assists: 0, bench: 0, absent: 0, unknown: 0 };
  for (const r of rows) {
    if (r.status === "start" || r.status === "sub" || r.status === "bench") t.inSquad++;
    if (r.status === "start") t.starts++;
    if (r.status === "sub") t.subs++;
    if (r.status === "bench") t.bench++;
    if (r.status === "absent") t.absent++;
    if (r.status === "unknown") t.unknown++;
    if (r.appeared) {
      t.apps++;
      t.minutes += r.minutes ?? 0;
    }
    t.goals += r.goals;
    t.assists += r.assists;
  }
  return t;
}
function seasonStats(slug) {
  const rows = logsByPlayer.get(slug) ?? [];
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.comp.id)) by.set(r.comp.id, []);
    by.get(r.comp.id).push(r);
  }
  const byComp = [...by.entries()]
    .sort((a, b) => COMP_ORDER.indexOf(a[0]) - COMP_ORDER.indexOf(b[0]))
    .map(([id, rs]) => ({ comp: compRef(id), leaguesRaw: [...new Set(rs.map((r) => r.leagueRaw))], ...tally(rs) }));
  const since = ledgerMeta.playerSince[slug] ?? null;
  return {
    since,
    sinceLabel: since ? `${Number(since.slice(5, 7))}월 ${Number(since.slice(8, 10))}일 이후 집계` : null,
    byComp,
    total: tally(rows),
    rule: "출전 = start·sub(출전 시간 > 0) · bench = 벤치 미출전 · absent = 명단 제외 · unknown = 라인업 없음(0으로 세지 않음). inSquad = start+sub+bench",
    source: [P_LEDGER, P_LEDGER_META],
  };
}
function uclView(p, t) {
  const inUcl = t.comp === "UCL" || t.alsoIn.includes("UCL");
  const rows = (logsByPlayer.get(p.slug) ?? []).filter((r) => r.comp.id === "UCL");
  const s = tally(rows);
  let label;
  if (!inUcl) label = "UCL 참가 팀 아님";
  else if (rows.length === 0) label = "UCL 기록 없음(집계 이후)";
  else if (s.apps > 0) label = `출전 ${s.apps}`;
  else if (s.inSquad > 0) label = `명단 ${s.inSquad} · 출전 0`;
  else label = `명단 제외 ${s.absent}`;
  return { teamInUcl: inUcl, ...s, label, detail: s.apps > 0 ? `${s.minutes}분` : null, source: [P_LEDGER, t.source[0]].filter(Boolean) };
}

// ─── 카드 표시 모델 ─────────────────────────────────────────────────────────
const CATEGORY_LABEL = { result: "경기 결과", transfer: "이적", injury: "부상", club: "감독·구단", national: "대표팀", ucl: "UCL", other: "기타" };
const STAGE = {
  rumor: { label: "루머", filled: 1, rank: 1 },
  negotiating: { label: "협상", filled: 2, rank: 2 },
  agreed: { label: "합의", filled: 3, rank: 3 },
  official: { label: "공식", filled: 4, rank: 4 },
  collapsed: { label: "결렬", filled: 0, rank: null },
};
function tagLabel(kind, slug) {
  if (kind === "player" && playerBySlug.has(slug)) return playerBySlug.get(slug).nameKo;
  return nameEntry(kind, slug)?.ko ?? null;
}
const USED_CARDS = new Set();
/** 블록 안 카드 참조 — id 문자열. 표시 모델은 최상위 cards[id] */
function card(id) {
  cardFull(id);
  USED_CARDS.add(id);
  return id;
}
function cardFull(id) {
  const hit = cardIndex.get(id);
  if (!hit) throw new Error(`카드 없음: ${id}`);
  const c = hit.card;
  const outlets = new Set(c.src.map((s) => s.n)).size - 1;
  const tags = [];
  for (const s of new Set(c.teams)) {
    const label = tagLabel("team", s);
    if (label) tags.push({ kind: "team", slug: s, label });
  }
  for (const s of new Set(c.players)) {
    const label = tagLabel("player", s);
    if (label) tags.push({ kind: "player", slug: s, label, korean: playerBySlug.has(s) });
  }
  const unlabeled = [...c.teams.filter((s) => !tagLabel("team", s)), ...c.players.filter((s) => !tagLabel("player", s))];
  return {
    id: c.id,
    t: c.t, // 원제목 — 원본 그대로(D23)
    tLength: [...c.t].length,
    lang: c.lang,
    cat: c.cat,
    catLabel: CATEGORY_LABEL[c.cat],
    comp: [...new Set(c.comp)].map(compRef),
    tags,
    tagsDropped: unlabeled.length ? unlabeled : undefined, // 사전에 없는 slug — 화면에 slug를 보이지 않는다
    imp: c.imp,
    kr: c.kr,
    spoiler: c.spoiler,
    ai: c.ai,
    s: c.s,
    transfer: c.transfer ? { ...c.transfer, stageLabel: STAGE[c.transfer.status].label, filled: STAGE[c.transfer.status].filled } : null,
    lead: { n: c.src[0].n, u: c.src[0].u, at: when(c.src[0].at), rel: relative(c.src[0].at), tier: c.src[0].tier },
    more: outlets > 0 ? { n: outlets, unit: "곳" } : c.src.length > 1 ? { n: c.src.length - 1, unit: "건" } : null,
    src: c.src.map((s) => ({ n: s.n, u: s.u, at: when(s.at), tier: s.tier })),
    issueDate: hit.issueDate,
    issueNo: hit.issueDate ? issueNo(hit.issueDate) : null,
    source: hit.file,
  };
}
const byLeadDesc = (a, b) => parseIso(b.card.src[0].at) - parseIso(a.card.src[0].at);
function cardsWhere(pred, list = liveCards) {
  return list.filter((x) => pred(x.card)).sort(byLeadDesc).map((x) => x.card.id);
}

// ─── 선수 목록 ──────────────────────────────────────────────────────────────
function playerState(p) {
  if (!p.active) return { kind: "other-league", label: "기타 리그", note: "5대 리그 밖 이적 — 기록 갱신 중단, 목록에서 빼지 않음(FR-64)" };
  if (p.apiFootballId == null) return { kind: "not-linked", label: "기록 연결 전", note: "apiFootballId: null → 원장에 행 없음(M3-01)" };
  return { kind: "linked", label: null };
}
const PH = (reason, fillStage, extra = {}) => ({ placeholder: true, reason, fillStage, ...extra });

function playerView(p) {
  const t = teamFull(p.team);
  const logs = logsByPlayer.get(p.slug) ?? [];
  const state = playerState(p);
  const news = cardsWhere((c) => c.players.includes(p.slug));
  const ko = news.filter((id) => cardIndex.get(id).card.lang === "ko").length;
  const nexts = t.hasPage ? upcoming(p.team, 3) : [];
  return {
    slug: p.slug,
    nameKo: p.nameKo,
    nameEn: p.nameEn,
    position: p.position,
    birthYear: p.birthYear,
    comp: compRef(p.comp === "OTHER" ? "OTHER" : p.comp),
    compLabel: p.comp === "OTHER" ? "기타 리그" : compById.get(p.comp).nameKo,
    active: p.active,
    apiFootballId: p.apiFootballId,
    team: tref(p.team),
    teamStanding: t.comp && compFiles[t.comp] ? standing(p.team, t.comp) : null,
    state,
    recent:
      logs[0] ??
      (state.kind === "not-linked"
        ? PH("apiFootballId 없음 — 원장에 출전 행이 없다", "M3-01")
        : state.kind === "other-league"
          ? PH("기타 리그(비활성) — 기록 갱신 중단(FR-64)", "해당 없음(5대 리그 복귀 시)")
          : PH("집계 이후 경기 없음", "경기가 쌓이면 자동")),
    recentLogs: logs.slice(0, 5),
    season:
      state.kind === "linked"
        ? seasonStats(p.slug)
        : PH(state.kind === "not-linked" ? "apiFootballId 없음 — 자체 집계 대상 아님" : "기타 리그 — 기록 갱신 중단", state.kind === "not-linked" ? "M3-01" : "해당 없음"),
    next:
      nexts[0] ??
      PH(t.hasPage ? "football-data 일정에 다음 경기 없음" : "6개 대회 밖 팀 — football-data 일정 없음", t.hasPage ? "일정 갱신 시" : "해당 없음"),
    upcoming: nexts,
    ucl: state.kind === "linked" ? uclView(p, t) : null,
    news: { total: news.length, ko, en: news.length - ko, latestIds: news.slice(0, 3).map(card) },
    source: [P_PLAYERS, ...t.source],
  };
}
const playerViews = koreanPlayers.map(playerView);
const GROUPS = [
  { comp: "BUNDESLIGA", label: "분데스리가" },
  { comp: "LALIGA", label: "라리가" },
  { comp: "EPL", label: "프리미어리그" },
  { comp: "OTHER", label: "기타 리그" },
];
const playersBlock = {
  source: [P_PLAYERS, P_LEDGER, P_LEDGER_META, "data/competitions/*.json", "data/teams/*.json", P_COLORS, "data/news/*.json"],
  order: "그룹 = scope §1 순서(분데스 6 · 라리가 1 · EPL 1 · 기타 1), 그룹 안 = configs/korean-players.json 순서(순위 매기지 않음)",
  counts: { total: koreanPlayers.length, active: koreanPlayers.filter((p) => p.active).length, linked: playerViews.filter((p) => p.state.kind === "linked").length },
  aggregationSince: ledgerMeta.since,
  aggregationSinceLabel: `${Number(ledgerMeta.since.slice(5, 7))}월 ${Number(ledgerMeta.since.slice(8, 10))}일 이후 집계`,
  groups: GROUPS.map((g) => ({
    comp: g.comp,
    label: g.label,
    players: playerViews.filter((p) => (koreanPlayers.find((k) => k.slug === p.slug).comp === g.comp)),
  })).map((g) => ({ ...g, count: g.players.length })),
};

// ─── 김민재 상세 ────────────────────────────────────────────────────────────
const detailPlayer = playerViews.find((p) => p.slug === DETAIL_SLUG);
const detailLogs = logsByPlayer.get(DETAIL_SLUG) ?? [];
const detailNewsIds = cardsWhere((c) => c.players.includes(DETAIL_SLUG));
const detailNationalIds = cardsWhere((c) => c.cat === "national" && c.players.includes(DETAIL_SLUG));
const detail = {
  slug: DETAIL_SLUG,
  source: [P_PLAYERS, P_LEDGER, P_LEDGER_META, "data/news/*.json", ...teamFull(detailPlayer.team.slug).source, compFiles.BUNDESLIGA.rel, compFiles.UCL.rel],
  head: {
    nameKo: detailPlayer.nameKo,
    nameEn: detailPlayer.nameEn,
    position: detailPlayer.position,
    birthYear: detailPlayer.birthYear,
    team: detailPlayer.team,
    teamStanding: detailPlayer.teamStanding,
    compLabel: detailPlayer.compLabel,
  },
  follow: { sampleState: "on", note: "표본 — 팔로우 표본(Q2 ①)에 김민재가 있다" },
  season: detailPlayer.season,
  log5: [
    ...detailLogs.slice(0, 5),
    ...Array.from({ length: Math.max(0, 5 - detailLogs.length) }, () =>
      PH(`집계 시작(${ledgerMeta.playerSince[DETAIL_SLUG]}) 전 경기 — 원장에 없음(백필 불가, D27 ④)`, "경기가 쌓이면 자동", { label: "집계 시작(10.19) 전" }),
    ),
  ],
  log5Note: "스코어: result = 소속팀 기준(for-against), scoreHomeAway = 홈-원정 — 한 화면 표기 규칙은 시안에서 정한다(scope §6 #6)",
  next: detailPlayer.next,
  upcoming: detailPlayer.upcoming,
  ics: PH(".ics 경로·파일은 빌드 산출물 — 버튼 위치만 시안에 표시", "M4-12"),
  ucl: detailPlayer.ucl,
  news: {
    total: detailNewsIds.length,
    ko: detailNewsIds.map(card),
    en: PH("kr:true 영문 카드 0 — 해외 피드 제목에서 한국 선수가 잡히지 않음(GDELT 비활성)", "M1-46 GDELT 재측정"),
    order: "대표 출처 시각(src[0].at) 최신순",
  },
  transferLink: { transferId: `tr_${DETAIL_SLUG}`, note: "→ transfers.items에서 같은 id" },
  nationalNews: { ids: detailNationalIds.map(card), note: "cat:national + players에 김민재 — 소집 명단 데이터는 없음(M3-05)" },
};

// ─── 주간 리포트 ────────────────────────────────────────────────────────────
function weekRows(range) {
  const fromMs = parseIso(range.from);
  const toMs = parseIso(range.to);
  const included = koreanPlayers.filter((p) => p.active && p.apiFootballId != null);
  const rows = included.map((p) => {
    const rs = (logsByPlayer.get(p.slug) ?? []).filter((r) => {
      const k = parseIso(r.kickoff.utc);
      return k >= fromMs && k < toMs && k <= REF_MS;
    });
    const t = tally(rs);
    const score = t.goals * 3 + t.assists * 2 + t.apps;
    return {
      player: p.slug,
      nameKo: p.nameKo,
      team: tref(p.team),
      apps: t.apps,
      minutes: t.minutes,
      goals: t.goals,
      assists: t.assists,
      inSquad: t.inSquad,
      bench: t.bench,
      absent: t.absent,
      unknown: t.unknown,
      rowsInWeek: t.rows,
      mvpScore: score,
      mvpScoreBreakdown: `골 ${t.goals}×3 + 도움 ${t.assists}×2 + 출전 ${t.apps} = ${score}`,
      matches: rs.map((r) => ({ matchId: r.matchId, kickoff: r.kickoff, comp: r.comp, leagueRaw: r.leagueRaw, opponent: r.opponent.name, status: r.status, statusLabel: r.statusLabel, minutes: r.minutes, goals: r.goals, assists: r.assists })),
    };
  });
  const order = new Map(koreanPlayers.map((p, i) => [p.slug, i]));
  rows.sort((a, b) => b.mvpScore - a.mvpScore || b.minutes - a.minutes || order.get(a.player) - order.get(b.player));
  const top = Math.max(...rows.map((r) => r.mvpScore));
  const leaders = rows.filter((r) => r.mvpScore === top && top > 0);
  return { rows, top, leaders };
}
const w43 = weekRows(WEEK);
const w43Kst = weekRows({ from: new Date(parseIso(WEEK.from) - 9 * HOUR).toISOString(), to: new Date(parseIso(WEEK.to) - 9 * HOUR).toISOString() });
const kstDiff = [];
for (const r of w43.rows) {
  const k = w43Kst.rows.find((x) => x.player === r.player);
  const a = r.matches.map((m) => m.matchId).sort().join();
  const b = k.matches.map((m) => m.matchId).sort().join();
  if (a !== b) kstDiff.push({ player: r.player, nameKo: r.nameKo, utcBasis: r.matches.map((m) => m.matchId), kstBasis: k.matches.map((m) => m.matchId), changesTable: r.apps !== k.apps || r.minutes !== k.minutes || r.goals !== k.goals });
}
const w44 = weekRows(WEEK_NEXT);
const weekly = {
  source: [P_LEDGER, P_LEDGER_META, P_PLAYERS],
  week: WEEK.id,
  isoWeekLabel: "2026년 43주",
  range: { from: when(WEEK.from), toExclusive: when(WEEK.to), label: "10.19 (월) ~ 10.25 (일)", basis: "UTC 하루 경계(브리핑과 같은 '현지' 경기일) — FR-90 기준 시간대 미정(scope §6 #2, 추천안)" },
  publish: { plannedDate: "2026-10-26", label: "10.26 (월) 발행분으로 가정", note: "주간 리포트 발행은 M3-06 — 기준 시각에 실제 파일(data/players/weekly/)은 없다. 시안은 발행된 화면으로 보인다" },
  rows: w43.rows,
  excluded: [
    { player: "kim-ji-soo", nameKo: "김지수", reason: "기록 연결 전 — apiFootballId 없음(M3-01)" },
    { player: "hong-hyun-seok", nameKo: "홍현석", reason: "기타 리그(비활성) — 기록 갱신 중단(FR-64)" },
  ],
  rowOrder: "MVP 점수 내림차순 → 출전 시간 내림차순 → 명단 순서(PRD에 표 정렬 규칙 없음 — 시안 가정)",
  mvp: {
    rule: "골×3 + 도움×2 + 출전 경기 수(FR-92, 코드)",
    player: w43.leaders.length === 1 ? w43.leaders[0].player : null,
    nameKo: w43.leaders.length === 1 ? w43.leaders[0].nameKo : null,
    score: w43.top,
    breakdown: w43.leaders.length === 1 ? w43.leaders[0].mvpScoreBreakdown : null,
    goalDetail: w43.leaders.length === 1 ? (logsByPlayer.get(w43.leaders[0].player) ?? []).filter((r) => r.goals > 0 && w43.leaders[0].matches.some((m) => m.matchId === r.matchId)).map((r) => ({ matchId: r.matchId, kickoff: r.kickoff, opponent: r.opponent.name, goalMinutes: r.goalMinutes, result: r.result, scoreHomeAway: r.scoreHomeAway })) : [],
    runnersUp: w43.rows.filter((r) => !w43.leaders.includes(r)).map((r) => ({ player: r.player, nameKo: r.nameKo, score: r.mvpScore })),
    tie: w43.leaders.length > 1,
  },
  summary: PH("LLM 출력(호출 지점 #3 — 한국 선수 주간 총평 3~5문장) — 시안용 LLM 호출 금지", "M3-07", { aiLabel: true, sentences: "3~5" }),
  archive: {
    prev: { week: "2026-42", exists: false, reason: "집계 시작(10.19) 전 주 — 리포트 없음" },
    next: { week: "2026-44", published: false, plannedDate: "2026-11-02", label: "11.02 (월) 발행 예정", reason: "기준 시각에 미발행(M3-06)" },
    path: "/korean-players/weekly/2026-43/",
  },
  boundaryCheck: {
    note: "같은 주를 KST 경계로 자르면 달라지는 행(scope §6 #2) — 표 숫자 변화 여부",
    kstBasisDiff: kstDiff,
  },
  w44InProgress: {
    published: false,
    note: "미발행 진행 중 주(기준 시각까지) — 화면용 아님. MVP 동점 사례 근거(scope §6 #3)",
    range: { from: when(WEEK_NEXT.from), toExclusive: when(WEEK_NEXT.to) },
    top: w44.top,
    tiedLeaders: w44.leaders.map((r) => ({ player: r.player, nameKo: r.nameKo, score: r.mvpScore, minutes: r.minutes })),
  },
};

// ─── 이적 ───────────────────────────────────────────────────────────────────
const transferCards = [...cardIndex.values()].filter((x) => x.card.transfer);
const byPlayer = new Map();
for (const x of transferCards) {
  const k = x.card.transfer.player;
  if (!byPlayer.has(k)) byPlayer.set(k, []);
  byPlayer.get(k).push(x);
}
const transferItems = [];
for (const [player, xs] of byPlayer) {
  xs.sort((a, b) => parseIso(a.card.src[0].at) - parseIso(b.card.src[0].at));
  let status = null;
  for (const x of xs) {
    const s = x.card.transfer.status;
    if (s === "collapsed") status = "collapsed";
    else if (status === null || status === "collapsed" || STAGE[s].rank > STAGE[status].rank) status = status === "collapsed" ? status : s;
  }
  const to = [...xs].reverse().find((x) => x.card.transfer.to)?.card.transfer.to ?? null;
  const from = [...xs].reverse().find((x) => x.card.transfer.from)?.card.transfer.from ?? null;
  const updated = xs[xs.length - 1].card.src[0].at;
  const bestTier = Math.min(...xs.map((x) => x.card.transfer.tier));
  const reg = playerBySlug.get(player);
  const aux = reg ? cardsWhere((c) => c.cat === "transfer" && !c.transfer && c.players.includes(player)) : [];
  const ageDays = (REF_MS - parseIso(updated)) / DAY;
  transferItems.push({
    id: `tr_${player}`,
    player,
    playerName: reg ? reg.nameKo : nameEntry("player", player)?.ko ?? null,
    playerNameNote: reg || nameEntry("player", player) ? undefined : "names.ko에 없음 — 이름 칸을 비우고 원제목으로 보인다(slug는 화면에 쓰지 않는다)",
    registeredKorean: Boolean(reg),
    affiliation: reg
      ? { team: tref(reg.team), label: `소속 ${tref(reg.team).nameKo}`, source: P_PLAYERS, rule: "Q3 ① — 등록 한국 선수만 설정상 소속을 별도 칸에. 출발 화살표(from)에는 넣지 않는다" }
      : null,
    from: from ? tref(from) : null,
    fromNote: from ? undefined : "transfer.from 없음 — 비운다(D23, 소속 설정으로 채우지 않음)",
    to: to ? tref(to) : null,
    toNote: to ? undefined : "transfer.to 없음 — 행선지 칸 비움",
    status,
    stageLabel: STAGE[status].label,
    filled: STAGE[status].filled,
    holes: 4,
    bestTier,
    tierLabel: `Tier ${bestTier}`,
    updated: when(updated),
    updatedRel: relative(updated),
    ageDays: Math.floor(ageDays),
    quiet: ageDays > QUIET_DAYS,
    comps: [...new Set(xs.flatMap((x) => x.card.comp))].map(compRef),
    history: xs.map((x) => ({ at: when(x.card.src[0].at), status: x.card.transfer.status, stageLabel: STAGE[x.card.transfer.status].label, card: x.card.id })),
    timeline: xs.map((x) => card(x.card.id)),
    auxiliaryCards: reg
      ? { note: "같은 선수의 이적 분류 카드 중 transfer 필드가 없는 것(단계 근거 아님) — 타임라인 보조로 넣을지 M4-01에서 정함(scope §6 #4)", ids: aux.map(card) }
      : null,
    fromFixtures: xs.every((x) => x.fixture),
    source: [...new Set(xs.map((x) => x.file))],
  });
  if (transferItems.at(-1).playerNameNote === undefined) delete transferItems.at(-1).playerNameNote;
  if (transferItems.at(-1).fromNote === undefined) delete transferItems.at(-1).fromNote;
  if (transferItems.at(-1).toNote === undefined) delete transferItems.at(-1).toNote;
}
// 정렬 — 잠잠은 아래(FR-106), 나머지는 최근 갱신 순
transferItems.sort((a, b) => Number(a.quiet) - Number(b.quiet) || parseIso(b.updated.utc) - parseIso(a.updated.utc));
const countBy = (fn) => transferItems.reduce((m, t) => (fn(t).forEach((k) => (m[k] = (m[k] ?? 0) + 1)), m), {});
const leagueCounts = countBy((t) => t.comps.map((c) => c.id));
const teamCounts = countBy((t) => [...new Set([t.to?.slug, t.affiliation?.team.slug, ...t.timeline.flatMap((id) => cardFull(id).tags.filter((g) => g.kind === "team").map((g) => g.slug))].filter(Boolean))]);
const transfers = {
  source: ["data/news/*.json(transfer 필드)", P_FIXTURE_NEWS, P_PLAYERS, P_NAMES, P_SOURCES],
  window: {
    mode: "off",
    dates: PH("configs/transfer-windows.json 없음 — fixtures/schema 예시는 지어낸 값이라 쓰지 않는다", "M4-03"),
    onSpecimen: { specimen: true, note: "창 모드 켜짐 = 견본(날짜 자리) — 홈 이적 섹션이 위로 올라가는 위치 규칙(FR-105)" },
  },
  rules: {
    stage: "rumor(루머) → negotiating(협상) → agreed(합의) → official(공식), 예외 collapsed(결렬 — 빈 구멍 4 + 사선). 역행 없음, 채운 구멍 = 단계(FR-100~102, DESIGN §2.7)",
    tier: "카드 최고 출처 Tier(Source.tier) — 기사 속 원 보도자는 반영하지 않음(D23)",
    quiet: `마지막 갱신 + ${QUIET_DAYS}일 < 기준 시각 → 잠잠(FR-106), 목록 아래로`,
    order: "잠잠 아래 → 최근 갱신 내림차순",
    unit: "선수 단위(transfers.json 스키마). 행선지 여러 곳일 때 카드 1장인지 M4-01에서 정함(scope §6 #4)",
  },
  counts: { items: transferItems.length, cardsWithField: transferCards.length, cardsWithFieldLive: transferCards.filter((x) => !x.fixture).length, transferCategoryCardsLive: liveCards.filter((x) => x.card.cat === "transfer").length },
  items: transferItems,
  filters: {
    league: competitions.filter((c) => c.id !== "UCL").map((c) => ({ id: c.id, label: c.nameKo, shortKo: c.shortKo, count: leagueCounts[c.id] ?? 0 })),
    team: Object.entries(teamCounts).map(([slug, count]) => ({ slug, label: tref(slug).nameKo, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko")),
    status: Object.entries(STAGE).map(([id, s]) => ({ id, label: s.label, count: transferItems.filter((t) => t.status === id).length })),
    tier: [1, 2, 3].map((n) => ({ tier: n, label: `Tier ${n}`, count: transferItems.filter((t) => t.bestTier === n).length, note: n === 1 ? "Tier 1 활성 소스 0(caughtoffside-romano · uefa-ucl-news 비활성) — 결과 0이 기본(scope §6 #5)" : undefined })),
    korean: { label: "한국 선수", rule: "transfer.player가 등록 한국 선수", count: transferItems.filter((t) => t.registeredKorean).length, cardKrCount: transferItems.filter((t) => t.timeline.some((id) => cardIndex.get(id).card.kr)).length },
  },
  stageTierSpecimen: {
    specimen: true,
    note: "표시 상태 견본 — 단계 5종 × Tier 3 조합. 기사·선수·팀 문구 없음(실데이터 아님)",
    combos: Object.entries(STAGE).flatMap(([status, s]) =>
      [1, 2, 3].map((tier) => ({ status, stageLabel: s.label, filled: s.filled, tier, tierLabel: `Tier ${tier}`, realItem: transferItems.find((t) => t.status === status && t.bestTier === tier)?.id ?? null })),
    ),
  },
  quietSpecimen: {
    specimen: true,
    realCount: transferItems.filter((t) => t.quiet).length,
    oldestUpdate: transferItems.length ? transferItems.reduce((a, b) => (parseIso(a.updated.utc) < parseIso(b.updated.utc) ? a : b)).updated : null,
    note: "30일 넘은 이적 없음 → 견본 · 11월 이후",
  },
  missingStages: PH("협상·합의 단계 카드, Tier 1·2 이적 카드 — 실데이터 transfer 필드는 루머·결렬·공식, 전부 Tier 3", "견본 범례만 — 1월 이적 창"),
};
const transferById = new Map(transferItems.map((t) => [t.id, t]));

// ─── 마이 · 온보딩 ───────────────────────────────────────────────────────────
const latestIssueIds = issueCards.get(ISSUE_DATE) ?? [];
const followHit = (c) => c.teams.some((s) => FOLLOW_SAMPLE.teams.includes(s)) || c.players.some((s) => FOLLOW_SAMPLE.players.includes(s));
const followMatchReason = (c) => [
  ...c.teams.filter((s) => FOLLOW_SAMPLE.teams.includes(s)).map((s) => ({ kind: "team", slug: s, label: tref(s).nameKo })),
  ...c.players.filter((s) => FOLLOW_SAMPLE.players.includes(s)).map((s) => ({ kind: "player", slug: s, label: playerBySlug.get(s).nameKo })),
];
const myLatestIds = latestIssueIds.filter((id) => followHit(cardIndex.get(id).card));
const myAllIds = cardsWhere(followHit);
const my = {
  source: [P_PLAYERS, "data/teams/*.json", P_COLORS, "data/competitions/*.json", P_LEDGER, "data/news/*.json"],
  sample: { ...FOLLOW_SAMPLE, sample: true, note: "시안 표본 — 실데이터 아님(localStorage, scope §5 · Q2 ①)" },
  limit: { max: FOLLOW_LIMIT, used: FOLLOW_SAMPLE.teams.length + FOLLOW_SAMPLE.players.length, reached: FOLLOW_SAMPLE.teams.length + FOLLOW_SAMPLE.players.length >= FOLLOW_LIMIT, note: "전체 한도 5는 시안 가정(PRD는 온보딩 팀 최대 5만) — M4-07" },
  teams: FOLLOW_SAMPLE.teams.map((slug) => {
    const t = teamFull(slug);
    return { team: tref(slug), standing: standing(slug, t.comp), next: upcoming(slug, 1)[0] ?? null, upcoming: upcoming(slug, 3), recent: recentResults(slug, 3), ics: PH("팀별 .ics 경로", "M4-12") };
  }),
  players: FOLLOW_SAMPLE.players.map((slug) => {
    const pv = playerViews.find((p) => p.slug === slug);
    return { slug, nameKo: pv.nameKo, nameEn: pv.nameEn, team: pv.team, recent: pv.recent, recentLogs: pv.recentLogs.slice(0, 3), next: pv.next };
  }),
  news: {
    latestIssue: { date: ISSUE_DATE, issueNo: issueNo(ISSUE_DATE), count: myLatestIds.length, cards: myLatestIds.map((id) => ({ id: card(id), followMatch: followMatchReason(cardIndex.get(id).card) })) },
    allIssues: { count: myAllIds.length, latest10: myAllIds.slice(0, 10).map((id) => ({ id: card(id), followMatch: followMatchReason(cardIndex.get(id).card) })) },
    rule: "카드 teams에 팔로우 팀 또는 players에 팔로우 선수가 있으면(FR-111·112)",
  },
  exportImport: PH("내보내기/가져오기 URL 파라미터 형식 미정 — 값 대신 자리", "M4-10", { states: ["내보내기(URL 복사)", "가져오기 확인 — 덮어쓰기", "가져오기 확인 — 합치기"] }),
  icsBundle: PH("팔로우 팀 .ics 묶음 링크(FR-115) — 경로 미정", "M4-12"),
};
const leagueComps = competitions.filter((c) => c.id !== "UCL");
const onboarding = {
  source: [P_COMPS, "data/teams/*.json", P_COLORS, "data/competitions/*.json", P_PLAYERS],
  skippable: true,
  steps: [
    {
      step: 1,
      key: "league",
      title: "리그",
      options: leagueComps.map((c) => ({ id: c.id, nameKo: c.nameKo, nameEn: c.nameEn, shortKo: c.shortKo, teamCount: Object.values(teamFiles).filter((t) => t.data.comp === c.id).length })),
      sampleSelected: [...new Set(FOLLOW_SAMPLE.teams.map((s) => teamFull(s).comp))],
      note: "UCL은 대회라 리그 단계에 넣지 않았다(시안 가정 — FR-113 '리그 선택')",
    },
    {
      step: 2,
      key: "team",
      title: "팀",
      max: ONBOARDING_TEAM_MAX,
      byLeague: [...new Set(FOLLOW_SAMPLE.teams.map((s) => teamFull(s).comp))].map((comp) => ({
        comp: compRef(comp),
        order: "현재 순위 순(data/competitions standings)",
        teams: compFiles[comp].data.standings.map((s) => ({ ...tref(s.team), pos: s.pos, hasKorean: teamFull(s.team).koreanPlayers.length > 0 })),
      })),
      sampleSelected: FOLLOW_SAMPLE.teams,
    },
    {
      step: 3,
      key: "player",
      title: "한국 선수",
      options: playerViews.map((p) => ({ slug: p.slug, nameKo: p.nameKo, nameEn: p.nameEn, position: p.position, team: p.team, state: p.state })),
      sampleSelected: FOLLOW_SAMPLE.players,
    },
  ],
  entryPoint: PH("첫 방문 감지 후 띄우는 위치 — 홈 5줄 첫 화면(375 4줄 유지)과 부딪히지 않게 시안에서 정함(scope §4 #13)", "D2 시안"),
};

// ─── 검색 ───────────────────────────────────────────────────────────────────
const lc = (s) => s.toLocaleLowerCase("en");
function aliasesOf(kind, slug) {
  const e = nameEntry(kind, slug);
  const out = new Set(e ? [e.ko, ...e.en] : []);
  if (kind === "player" && playerBySlug.has(slug)) {
    out.add(playerBySlug.get(slug).nameKo);
    out.add(playerBySlug.get(slug).nameEn);
  }
  if (kind === "team" && teamFiles[slug]) {
    out.add(teamFiles[slug].data.nameKo);
    out.add(teamFiles[slug].data.nameEn);
  }
  return [...out].filter(Boolean);
}
function search(q) {
  const qq = lc(q);
  const hitAlias = (aliases) => aliases.find((a) => lc(a).includes(qq)) ?? null;
  const players = koreanPlayers
    .map((p) => ({ p, via: hitAlias(aliasesOf("player", p.slug)) }))
    .filter((x) => x.via)
    .map(({ p, via }) => ({ slug: p.slug, nameKo: p.nameKo, nameEn: p.nameEn, position: p.position, team: tref(p.team), matchedAlias: via, path: `/korean-players/${p.slug}/` }));
  const teamSlugs = [...new Set([...Object.keys(teamFiles), ...namesKo.filter((e) => e.kind === "team" && e.slug).map((e) => e.slug)])];
  const directTeams = teamSlugs
    .map((s) => ({ s, via: hitAlias(aliasesOf("team", s)) }))
    .filter((x) => x.via)
    .map(({ s, via }) => ({ ...tref(s), reason: "이름", matchedAlias: via }));
  const viaPlayer = players
    .filter((p) => !directTeams.some((t) => t.slug === p.team.slug))
    .map((p) => ({ ...tref(p.team.slug), reason: "소속", reasonLabel: `${p.nameKo} 소속` }));
  const teams = [...directTeams, ...viaPlayer];
  const pSlugs = new Set(players.map((p) => p.slug));
  const tSlugs = new Set(directTeams.map((t) => t.slug));
  const allAliases = [q, ...players.flatMap((p) => aliasesOf("player", p.slug)), ...directTeams.flatMap((t) => aliasesOf("team", t.slug))].map(lc);
  const matched = liveCards
    .filter((x) => {
      const c = x.card;
      return c.players.some((s) => pSlugs.has(s)) || c.teams.some((s) => tSlugs.has(s)) || allAliases.some((a) => lc(c.t).includes(a));
    })
    .sort(byLeadDesc);
  const why = (c) => {
    const r = [];
    if (c.players.some((s) => pSlugs.has(s)) || c.teams.some((s) => tSlugs.has(s))) r.push("태그(별칭 메타 — FR-131)");
    if (allAliases.some((a) => lc(c.t).includes(a))) r.push("제목");
    return r;
  };
  const byWhy = matched.reduce((m, x) => {
    const k = why(x.card).join("+");
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  return {
    q,
    path: `/search/?q=${encodeURIComponent(q)}`,
    counts: { players: players.length, teams: teams.length, news: matched.length, newsKo: matched.filter((x) => x.card.lang === "ko").length, newsEn: matched.filter((x) => x.card.lang !== "ko").length, newsByMatch: byWhy },
    players,
    teams,
    news: { top10: matched.slice(0, 10).map((x) => ({ id: card(x.card.id), matchedBy: why(x.card) })), order: "대표 출처 시각 최신순" },
  };
}
const searchBlock = {
  source: [P_NAMES, P_PLAYERS, "data/teams/*.json", "data/news/*.json"],
  rule: "Pagefind 결과를 유형(선수·팀·뉴스) 묶음으로 흉내 — 별칭(names.ko · 명단 · 팀 파일) 부분 일치(대소문자 무시), 뉴스는 카드 제목 또는 태그(slug에 걸린 별칭 메타). 실제 Pagefind 순위·형태소와 다를 수 있다",
  queries: SEARCH_QUERIES.map(search),
  empty: (() => {
    const r = search(SEARCH_EMPTY_QUERY);
    return { ...r, isEmpty: r.counts.players + r.counts.teams + r.counts.news === 0, note: "원장에 있는 컵 상대 팀 원문 이름 — 팀 페이지·사전·카드 어디에도 없다 → 결과 없음(글자만, 일러스트는 D3)" };
  })(),
};

// ─── 홈 위젯 ────────────────────────────────────────────────────────────────
function chipsForIssue(date) {
  const w = briefWindow(date);
  const fromMs = parseIso(w.from);
  const toMs = parseIso(w.to);
  const rows = [];
  for (const [slug, logs] of logsByPlayer) {
    for (const r of logs) {
      const k = parseIso(r.kickoff.utc);
      if (k >= fromMs && k < toMs) rows.push({ player: slug, nameKo: playerBySlug.get(slug).nameKo, ...r, team: tref(playerBySlug.get(slug).team) });
    }
  }
  const order = new Map(koreanPlayers.map((p, i) => [p.slug, i]));
  rows.sort((a, b) => b.goals * 3 + b.assists * 2 + Number(b.appeared) - (a.goals * 3 + a.assists * 2 + Number(a.appeared)) || (b.minutes ?? -1) - (a.minutes ?? -1) || order.get(a.player) - order.get(b.player));
  return {
    issueDate: date,
    issueNo: issueNo(date),
    window: { from: when(w.from), toExclusive: when(w.to), basis: "발행일 전날 UTC 하루(경기일 '현지' — 브리핑 창과 같음)" },
    appearedCount: rows.filter((r) => r.appeared).length,
    rowCount: rows.length,
    order: "골·도움·출전 점수 → 출전 시간 → 명단 순서(시안 가정)",
    rows,
  };
}
const nationalKrIds = cardsWhere((c) => c.cat === "national" && c.kr);
const nationalAllIds = cardsWhere((c) => c.cat === "national");
const home = {
  source: [P_LEDGER, "data/briefs/*.json(창 규칙만)", "data/news/*.json", P_PLAYERS],
  order: {
    prd: ["1 오늘의 5줄", "2 내 팀 소식(팔로우가 있을 때만)", "3 A매치 섹션(A매치 기간만)", "4 한국 선수 하이라이트", "5 오늘 밤 볼 경기", "6 주요 뉴스 피드", "7 이적 핫 리스트", "8 리그 순위 미니"],
    d2Widgets: [2, 3, 4, 7],
    note: "1280 마주 보는 면 / 1279 이하 지면 안 배치는 시안에서(scope §1 홈 위젯)",
  },
  koreanChips: {
    today: { ...chipsForIssue(ISSUE_DATE), note: "제 20호 — 출전 0명 상태(이재성 벤치 하나)" },
    busySpecimen: { ...chipsForIssue("2026-10-25"), specimen: true, note: "붐비는 날 견본 — 제 14호(10.24 경기)의 실데이터" },
    allStatuses: Object.entries(APPEARANCE).map(([k, v]) => ({ status: k, label: v.label })),
  },
  myTeamNews: {
    sample: true,
    note: "팔로우 표본(바이에른·아틀레티코·아스널 + 김민재·이강인)이 있을 때만 노출(FR-112)",
    issueDate: ISSUE_DATE,
    count: myLatestIds.length,
    cards: myLatestIds.map((id) => ({ id: card(id), followMatch: followMatchReason(cardIndex.get(id).card) })),
  },
  nationalTeam: {
    periodActive: PH("A매치 기간 판정(일정 ±3일, FR-71) — configs/national-team.json 없음", "M3-05"),
    schedule: PH("11월 A매치 일정·결과 — configs/national-team.json 없음(사용자 입력 필요)", "M3-05"),
    squad: PH("소집 선수 링크(FR-73) — 소집 명단 데이터 없음", "M3-05"),
    news: { rule: "cat:national + kr:true", count: nationalKrIds.length, ids: nationalKrIds.map(card) },
  },
  transferHotList: {
    rule: "상태 변화가 있었던 상위 5건(PRD §4.2 #7) — 잠잠 아래 → 최근 갱신 순",
    count: Math.min(5, transferItems.length),
    note: `실데이터 ${transferItems.length}건뿐 — 5칸을 다 채우지 못한다`,
    items: transferItems.slice(0, 5).map((t) => ({ id: t.id, playerName: t.playerName, registeredKorean: t.registeredKorean, affiliation: t.affiliation?.label ?? null, to: t.to, status: t.status, stageLabel: t.stageLabel, filled: t.filled, bestTier: t.bestTier, updated: t.updated, leadTitle: cardIndex.get(t.timeline.at(-1)).card.t, leadCardId: t.timeline.at(-1) })),
  },
};

// ─── 견본 ───────────────────────────────────────────────────────────────────
function subSample(fixtureId, playerAf) {
  const rel = `fixtures/football/api-football/fixtures-id-${fixtureId}.json`;
  const r = readJson(rel).response[0];
  const p = playerByAf.get(playerAf);
  const tp = r.players.find((t) => t.players.some((x) => x.player.id === playerAf));
  const st = tp.players.find((x) => x.player.id === playerAf).statistics[0];
  const lineup = r.lineups.find((l) => l.team.id === tp.team.id);
  const inXI = lineup.startXI.some((x) => x.player.id === playerAf);
  const subEv = r.events.find((e) => e.type === "subst" && e.assist && e.assist.id === playerAf);
  const homeSide = r.teams.home.id === tp.team.id;
  const mine = homeSide ? r.teams.home : r.teams.away;
  const other = homeSide ? r.teams.away : r.teams.home;
  const f = homeSide ? r.goals.home : r.goals.away;
  const a = homeSide ? r.goals.away : r.goals.home;
  const ko = r.fixture.date.replace(/\+00:00$/, "Z");
  return {
    player: p.slug,
    nameKo: p.nameKo,
    status: inXI ? "start" : st.games.minutes > 0 ? "sub" : "bench",
    statusLabel: inXI ? "선발" : "교체",
    minutes: st.games.minutes,
    minutesLabel: `${st.games.minutes}분`,
    enteredAt: subEv ? `${subEv.time.elapsed}'` : null,
    kickoff: when(ko),
    leagueRaw: r.league.name,
    round: r.league.round,
    venueLabel: homeSide ? "홈" : "원정",
    team: ledgerTeam(mine),
    opponent: ledgerTeam(other),
    result: { for: f, against: a, outcome: f > a ? "W" : f < a ? "L" : "D", outcomeLabel: f > a ? "승" : f < a ? "패" : "무", text: `${f}-${a}` },
    beforeAggregation: true,
    note: "집계 시작(10.19) 전 경기 — 화면 로그에는 넣지 않는다(scope §2 교체 출전 견본)",
    source: rel,
  };
}
const kmjLogs = logsByPlayer.get("kim-min-jae");
const fallbackCard = cardsWhere((c) => c.players.includes("lee-jae-sung") && /시즌 1호/.test(c.t));
const ljsGoalLog = (logsByPlayer.get("lee-jae-sung") ?? []).find((r) => r.goals > 0);
const specimens = {
  appearance: {
    source: [P_LEDGER, "fixtures/football/api-football/fixtures-id-*.json"],
    states: [
      { status: "start", label: "선발", example: kmjLogs.find((r) => r.status === "start") },
      { status: "sub", label: "교체", examples: [subSample("1570403", 927), subSample("1575179", 24888), subSample("1575181", 2906)], note: "원장에 sub 0건(scope §6 #7) — 집계 전 fixtures에서만" },
      { status: "bench", label: "벤치 · 미출전", example: kmjLogs.find((r) => r.status === "bench") },
      { status: "absent", label: "명단 제외", example: kmjLogs.find((r) => r.status === "absent") },
      { status: "unknown", label: "라인업 없음", example: PH("원장에 unknown 행 0 — 커버리지 없는 대회 경기에서 생긴다", "발생 시"), rule: "출전 여부 모름 — 0으로 세지 않는다" },
    ],
  },
  follow: {
    states: [
      { state: "off", label: "꺼짐", example: { kind: "team", slug: "borussia-dortmund", nameKo: tref("borussia-dortmund").nameKo, why: "김민재 다음 경기 상대 — 표본 밖 팀" } },
      { state: "on", label: "켜짐", example: { kind: "player", slug: "kim-min-jae", nameKo: "김민재" } },
      { state: "limit", label: "한도 5 도달", example: { used: FOLLOW_SAMPLE.teams.length + FOLLOW_SAMPLE.players.length, max: FOLLOW_LIMIT, note: "표본 5개(팀 3 + 선수 2)가 곧 한도 — 6번째(꺼짐 버튼)를 누르는 상태" } },
    ],
    places: ["팀 티켓(D1)", "선수 머리", "온보딩 단계", "/my 관리"],
    sample: true,
  },
  spoilerScore: {
    rule: "결과 가리기 켬 — 스코어 칸을 가림(--hatch 재사용, FR-37 · scope §4 #6). 기본 꺼짐(D3)",
    examples: [kmjLogs.find((r) => r.comp.id === "UCL"), kmjLogs.find((r) => r.comp.id === "OTHER")].map((r) => ({ matchId: r.matchId, kickoff: r.kickoff, opponent: r.opponent.name, result: r.result, scoreHomeAway: r.scoreHomeAway, outcomeLabel: r.result.outcomeLabel, hiddenFields: ["result.text", "scoreHomeAway.text", "outcome(W/D/L 칩)"] })),
    note: "출전 상태·출전 시간은 결과가 아니라 가리지 않는다(시안 가정 — 골 수는 결과를 짐작하게 하므로 시안에서 정함)",
    source: P_LEDGER,
  },
  teamProfile: {
    team: tref("bayern-munchen"),
    oneLiner: PH("팀 한줄평 — LLM 출력(호출 지점 #2)", "M4-05", { aiLabel: true }),
    strengths: [PH("강점 1 — LLM 출력", "M4-06", { aiLabel: true }), PH("강점 2 — LLM 출력", "M4-06", { aiLabel: true })],
    weaknesses: [PH("약점 1 — LLM 출력", "M4-06", { aiLabel: true }), PH("약점 2 — LLM 출력", "M4-06", { aiLabel: true })],
    generatedAt: PH("생성 날짜(주 1회 배치)", "M4-05"),
    note: "data/teams/*.json profile: null(111팀 모두) — 위치·AI 작성 라벨·생성 날짜 처리만 정한다(scope §4 #9, D24)",
    source: teamFiles["bayern-munchen"].rel,
  },
  nationalTeamPage: {
    path: "/national-team/",
    sections: [
      { key: "schedule", title: "한국 대표팀 일정·결과", data: PH("configs/national-team.json 없음", "M3-05", { schemaFields: ["id", "kickoff", "kickoffTbd", "opponent", "home", "venue", "competition", "status", "result{kor,opp}", "sourceUrl"] }) },
      { key: "squad", title: "소집 명단", data: PH("Squad(announcedAt · matchIds · playerSlugs — 등록 한국 선수만 링크, FR-73) 없음", "M3-05") },
      { key: "krNews", title: "대표팀 소식(한국)", data: { count: nationalKrIds.length, ids: nationalKrIds } },
      { key: "majorNations", title: "주요국 A매치 뉴스", data: { rule: "cat:national 전체 — /news/?cat=national 필터 결과와 같음(FR-72)", count: nationalAllIds.length, ids: nationalAllIds.map(card) } },
    ],
    source: ["data/news/*.json", "docs/plan.md 부록 A(national-team 스키마 필드명)"],
  },
  playerStates: {
    linked: { slug: "kim-min-jae", label: null },
    notLinked: { slug: "kim-ji-soo", ...playerState(playerBySlug.get("kim-ji-soo")) },
    otherLeague: { slug: "hong-hyun-seok", ...playerState(playerBySlug.get("hong-hyun-seok")) },
    fallback: {
      specimen: true,
      kind: "fallback",
      label: "폴백",
      rule: "FR-65 — errors.plan 강등 시 경기 결과 + 득점 순위 + 뉴스 기반. 분·도움은 '–'",
      player: "lee-jae-sung",
      nameKo: "이재성",
      match: ljsGoalLog ? { matchId: ljsGoalLog.matchId, kickoff: ljsGoalLog.kickoff, opponent: ljsGoalLog.opponent.name, venueLabel: ljsGoalLog.venueLabel, result: ljsGoalLog.result, scoreHomeAway: ljsGoalLog.scoreHomeAway, minutesLabel: "–", assistsLabel: "–", goalsFromNews: "제목 근거(카드)" } : null,
      newsCards: fallbackCard.map(card),
      note: "errors.plan 강등 실례 없음 — 실제 뉴스 제목과 경기 결과만, 분·도움은 '–'(scope §3)",
      source: [P_LEDGER, "data/news/2026-10-25.json"],
    },
  },
};

// ─── 자리 목록 ──────────────────────────────────────────────────────────────
const placeholders = [];
(function walk(o, at) {
  if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${at}[${i}]`));
  else if (o && typeof o === "object") {
    if (o.placeholder === true) placeholders.push({ at, reason: o.reason, fillStage: o.fillStage });
    else for (const [k, v] of Object.entries(o)) walk(v, at ? `${at}.${k}` : k);
  }
})({ players: playersBlock, playerDetail: detail, weekly, transfers, my, onboarding, search: searchBlock, home, specimens }, "");
const placeholderSummary = [...placeholders.reduce((m, p) => m.set(`${p.reason}|${p.fillStage}`, { reason: p.reason, fillStage: p.fillStage, count: (m.get(`${p.reason}|${p.fillStage}`)?.count ?? 0) + 1 }), new Map()).values()];

// ─── 검증 (실패 시 종료) ─────────────────────────────────────────────────────
const errors = [];
const out = {
  meta: {
    version: "v0.1",
    gate: "D2",
    scope: "docs/design/d2/scope.md",
    generator: "docs/design/d2/data/build-data.mjs",
    generatedAt: when(new Date().toISOString()),
    reference: { ...when(REF_UTC), label: "2026-10-31 (토) 07:11 KST — 제 20호 수집(collect-prod-20261030T221059Z-6510) 직후" },
    issue: { date: ISSUE_DATE, no: issueNo(ISSUE_DATE), publishLabel: "발행 07:30 KST", season: "겨울 발행(D26)", runId: readJson(`data/news/${ISSUE_DATE}.json`).runId },
    ledger: { updatedAt: when(ledger.updatedAt), since: ledgerMeta.since, playerSince: ledgerMeta.playerSince, gaps: ledgerMeta.gaps, matches: ledger.matches.length, koreanRows: [...logsByPlayer.values()].reduce((n, l) => n + l.length, 0), source: [P_LEDGER, P_LEDGER_META] },
    news: { files: newsFiles.length, rawCards: rawCardCount, uniqueLiveCards: liveCards.length, krCards: liveCards.filter((x) => x.card.kr).length, fixtureCardsUsed: [...fixtureCardIds].filter((id) => transferCards.some((x) => x.card.id === id)) },
    conventions: {
      time: "모든 시각 객체 = { utc(저장값), kst(ISO +09:00), dayShort \"10.29 (목)\", time \"04:45\", short \"10.29 04:45\", date \"10월 29일 (목)\", datetime } — KST = UTC+9(src/lib/time.ts formatKst 꼴)",
      refs: "블록 안 팀은 { slug, nameKo } — 배지·키트 색은 최상위 teams[slug]. 블록 안 카드는 id 문자열(또는 { id, followMatch|matchedBy }) — 표시 모델은 최상위 cards[id]",
      placeholder: "{ placeholder: true, reason, fillStage } — 데이터가 없어 비운 곳",
      specimen: "specimen: true — 표시 상태 견본(실데이터 아님, 문구 없음)",
      sample: "sample: true — 시안 표본(팔로우 등 localStorage 값)",
      card: "card.t = 원제목 그대로(D23). 뉴스 카드에는 AI 라벨 없음(ai:false). lead = 대표 출처, more = '+N곳'/'+N건'",
      badge: "badge = { k1 상의(보정 후), k2 하의, kf 약어 글자, short 약어, kfContrast } 또는 { fallback: true }",
      score: "result = 소속팀 기준(for-against) · scoreHomeAway = 홈-원정",
    },
    sourcesRead: [],
  },
  labels: {
    appearance: APPEARANCE,
    transferStage: Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, { label: v.label, filled: v.filled }])),
    category: CATEGORY_LABEL,
    competitions: competitions.map((c) => ({ id: c.id, nameKo: c.nameKo, shortKo: c.shortKo, nameEn: c.nameEn })).concat([{ id: "OTHER", nameKo: COMP_LABEL_OTHER, shortKo: null, nameEn: null }]),
    tiers: { 1: "Tier 1 — 채운 면", 2: "Tier 2 — 2px 실선", 3: "Tier 3 — 1px 점선" },
    source: [P_COMPS, "src/lib/news/labels.ts(같은 표)"],
  },
  players: playersBlock,
  playerDetail: detail,
  weekly,
  transfers,
  my,
  onboarding,
  search: searchBlock,
  home,
  specimens,
  placeholders: { count: placeholders.length, distinct: placeholderSummary.length, list: placeholderSummary },
};
out.teams = Object.fromEntries([...USED_TEAMS].sort().map((s) => [s, teamFull(s)]));
out.cards = Object.fromEntries([...USED_CARDS].sort().map((id) => [id, cardFull(id)]));

// 원제목 그대로인가 — 출력의 모든 카드 모양 객체를 원본과 대조
let titleChecks = 0;
(function walk(o) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === "object") {
    if (typeof o.id === "string" && /^c_[0-9a-f]{10}$/.test(o.id) && typeof o.t === "string") {
      titleChecks++;
      const orig = cardIndex.get(o.id).card;
      if (orig.t !== o.t) errors.push(`원제목 불일치 ${o.id}`);
      if (o.lead.u !== orig.src[0].u) errors.push(`원문 URL 불일치 ${o.id}`);
      if (o.ai !== false) errors.push(`뉴스 카드 ai:true ${o.id}`);
    }
    if (typeof o.leadTitle === "string" && cardIndex.get(o.leadCardId).card.t !== o.leadTitle) errors.push(`핫 리스트 원제목 불일치 ${o.leadCardId}`);
    Object.values(o).forEach(walk);
  }
})(out);
// 시즌 누적 = 로그 합
for (const pv of playerViews) {
  if (pv.state.kind !== "linked") continue;
  const logs = logsByPlayer.get(pv.slug) ?? [];
  const sumMin = logs.filter((r) => r.appeared).reduce((n, r) => n + (r.minutes ?? 0), 0);
  const byCompMin = pv.season.byComp.reduce((n, c) => n + c.minutes, 0);
  if (sumMin !== pv.season.total.minutes || byCompMin !== sumMin) errors.push(`시즌 누적 분 불일치 ${pv.slug}`);
  if (pv.season.byComp.reduce((n, c) => n + c.rows, 0) !== logs.length) errors.push(`시즌 누적 행 불일치 ${pv.slug}`);
}
// scope §2 예시값 대조
const expect = (cond, msg) => cond || errors.push(`scope 예시와 다름: ${msg}`);
const kmjS = playerViews.find((p) => p.slug === "kim-min-jae").season.byComp;
expect(kmjS.find((c) => c.comp.id === "UCL")?.apps === 1 && kmjS.find((c) => c.comp.id === "UCL")?.minutes === 45, "김민재 UCL 1경기 45분");
const ljsS = playerViews.find((p) => p.slug === "lee-jae-sung").season.byComp;
expect(ljsS.find((c) => c.comp.id === "BUNDESLIGA")?.minutes === 75 && ljsS.find((c) => c.comp.id === "BUNDESLIGA")?.goals === 1, "이재성 분데스 75분 1골");
expect(ljsS.find((c) => c.comp.id === "OTHER")?.minutes === 63, "이재성 기타 63분");
expect(detail.log5.slice(0, 3).map((r) => r.status).join() === "bench,absent,start", "김민재 로그 벤치·명단 제외·선발");
expect(detail.log5.slice(0, 3).map((r) => r.kickoff.short).join() === "10.29 04:45,10.26 01:30,10.22 04:00", "김민재 로그 KST 시각");
expect(weekly.mvp.player === "lee-jae-sung" && weekly.mvp.score === 4, "W43 MVP 이재성 4점");
expect(home.koreanChips.today.appearedCount === 0 && home.koreanChips.today.rowCount === 1, "제 20호 칩 출전 0명");
expect(home.koreanChips.busySpecimen.rowCount === 5, "제 14호 칩 5행");
expect(detail.news.total === 32, "김민재 뉴스 32장");
expect(transferById.get("tr_kim-min-jae").updated.short === "10.29 16:15", "김민재 이적 최근 갱신 10.29 16:15");
expect(transferById.get("tr_kim-min-jae").history.map((h) => h.at.short).join() === "10.17 18:35,10.29 16:15", "김민재 이적 타임라인");
expect(playerViews.find((p) => p.slug === "lee-kang-in").ucl.label === "명단 1 · 출전 0", "이강인 UCL 명단 1 · 출전 0");
expect(searchBlock.empty.isEmpty, "검색 빈 결과 질의가 비어 있음");
for (const t of Object.values(out.teams)) if (!t.badge.fallback && t.badge.kfContrast < KIT_MIN) errors.push(`키트 대비 미달 ${t.slug}`);
// 블록이 가리키는 카드·팀이 사전에 모두 있는가
(function walk(o, key) {
  if (Array.isArray(o)) o.forEach((v) => walk(v, key));
  else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => walk(v, k));
  else if (typeof o === "string" && /^c_[0-9a-f]{10}$/.test(o) && !out.cards[o]) errors.push(`카드 사전에 없음 ${o}`);
})({ ...out, cards: undefined });

out.meta.checks = { titleChecks, errors: errors.length };
out.meta.sourcesRead = [...READ].sort();

if (errors.length) {
  console.error("검증 실패:\n- " + errors.join("\n- "));
  process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
const size = fs.statSync(OUT).size;
console.log(`d2-data.json 작성 — ${(size / 1024).toFixed(1)}KB · 원제목 대조 ${titleChecks}건 · 자리 ${placeholders.length}곳(${placeholderSummary.length}종)`);
