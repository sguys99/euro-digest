/**
 * 테스트 도우미 — 표기 사전이 앞으로 더 늘어난 상태를 흉내 낸다. configs/names.ko.json(M1-21 최종 185항목, D46 표기 확정분 —
 * 인테르 'Inter'·'Inter Milan', 브라이턴·에버턴·애스턴 빌라 등 포함)에 짧은 별칭(Villa·Palace·Forest)과 5대 리그 밖 팀(Wolves)을 더해,
 * 분류·병합·제외 테스트가 '특정 별칭·팀 미등록'에 기대지 않는지(사전이 늘어도 오탐·잘못 합치기 0인지) 한 번 더 확인한다. 한글 표기는
 * 테스트용 자리값이다(확정 표기는 names.ko.json이 정한다).
 */
import { NamesKoFileSchema, type NamesKoFile } from "@/lib/schema";

/** 팀 slug → 더할 영문 별칭(없는 항목은 새로 만든다 — ko는 자리값) */
const EXTRA_TEAM_ALIASES: ReadonlyArray<{
  slug: string;
  ko: string;
  en: readonly string[];
}> = [
  // D46 확정 표기(사전에 이미 있으면 그대로 — 영문 표기 중복은 건너뛴다)
  {
    slug: "internazionale-milano",
    ko: "인테르",
    en: ["FC Internazionale Milano", "Inter", "Inter Milan"],
  },
  { slug: "aston-villa", ko: "애스턴 빌라", en: ["Aston Villa", "Villa"] },
  {
    slug: "crystal-palace",
    ko: "크리스털 팰리스",
    en: ["Crystal Palace", "Palace"],
  },
  {
    slug: "nottingham-forest",
    ko: "노팅엄 포레스트",
    en: ["Nottingham Forest", "Forest"],
  },
  // 5대 리그 밖 팀(2026-27 챔피언십 — team-leagues.ts에 없다)
  {
    slug: "wolverhampton-wanderers",
    ko: "울버햄프턴",
    en: ["Wolverhampton Wanderers FC", "Wolves"],
  },
];

/** 사전 + 별칭 확장(이미 있는 slug면 영문 별칭만 더하고, 사전 어디엔가 있는 영문 표기는 건너뛴다 — 스키마의 영문 표기 중복 금지) */
export function namesWithExtras(base: NamesKoFile): NamesKoFile {
  const known = new Set(
    base.entries.flatMap((e) => e.en.map((n) => n.toLowerCase())),
  );
  const fresh = (en: readonly string[]) =>
    en.filter((n) => {
      const key = n.toLowerCase();
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
  const entries = base.entries.map((e) => ({ ...e, en: [...e.en] }));
  for (const extra of EXTRA_TEAM_ALIASES) {
    const entry = entries.find(
      (e) => e.kind === "team" && e.slug === extra.slug,
    );
    const add = fresh(extra.en);
    if (entry) entry.en.push(...add);
    else if (add.length > 0) {
      entries.push({ ko: extra.ko, en: add, kind: "team", slug: extra.slug });
    }
  }
  return NamesKoFileSchema.parse({ ...base, entries });
}
