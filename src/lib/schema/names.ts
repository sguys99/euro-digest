/**
 * v0.1 — 2026-10-10 사용자 확인 (구조 Q6 = 대상별 항목 배열, 무시 목록 Q2 = 선택 필드 ignore, strictObject Q5)
 * 고유명사 한글 표기 사전 — `configs/names.ko.json` (PRD FR-24·FR-131, `/add-name`·`/add-player`).
 *
 * LLM은 고유명사를 영문 그대로 출력하고, 코드가 이 사전으로 한글로 바꾼다(CLAUDE.md §6.2).
 * 한 대상(선수·팀…)을 항목 하나로 두고 영문 변형 표기를 모두 `en`에 모은다 →
 * 같은 대상의 표기가 하나로 고정되고, 검색 별칭(FR-131)도 이 묶음을 그대로 쓴다.
 */
import { z } from "zod";

import { SlugSchema } from "./common";

/** 고유명사 유형 (`/add-name` 3단계의 유형 분류). */
export const NameKindSchema = z.enum([
  "player",
  "team",
  "manager",
  "competition",
  "venue",
  "other",
]);
export type NameKind = z.infer<typeof NameKindSchema>;

/** 사전 키·값 문자열: 비어 있지 않고 앞뒤 공백 없음(치환 매칭이 어긋나지 않게). */
export const NameTextSchema = z
  .string()
  .regex(/^\S(?:.*\S)?$/, { error: "빈 문자열이나 앞뒤 공백은 안 됨" });

/** 사전 항목 1개 = 대상 1개. */
export const NameEntrySchema = z.strictObject({
  ko: NameTextSchema, // 한글 표기 — 치환 결과·화면 표시 (FR-24)
  en: z.array(NameTextSchema).min(1), // LLM·데이터 API가 내는 영문 표기와 변형(성·이름 순서, 악센트 유무). 첫 값이 대표 표기
  kind: NameKindSchema, // 유형
  slug: SlugSchema.optional(), // 팀·선수 페이지 연결 — data/teams·korean-players.json의 slug와 같은 값
  note: z.string().optional(), // 표기 근거: 확신도(확실/관용) + 출처 URL (`/add-name` 3단계)
});
export type NameEntry = z.infer<typeof NameEntrySchema>;

/**
 * `configs/names.ko.json` 파일.
 * 검사: 영문 표기는 전체 사전에서 한 번만(대소문자 무시), ignore와 겹치지 않음, 같은 유형의 slug 중복 금지.
 */
export const NamesKoFileSchema = z
  .strictObject({
    entries: z.array(NameEntrySchema),
    // 고유명사가 아닌데 미등록 이름으로 반복 검출되는 문자열(LLM 오출력·일반 명사 등).
    // 수집 실행이 unknown-names.json에 적재하지 않는다 (2026-10-10 결정 Q2). `/add-name`의 '제외' 결정을 여기에 기록.
    ignore: z.array(NameTextSchema).default([]),
  })
  .superRefine((file, ctx) => {
    const enOwner = new Map<string, string>(); // 소문자 영문 → 처음 나온 위치 설명
    file.entries.forEach((entry, i) => {
      entry.en.forEach((name, j) => {
        const key = name.toLowerCase();
        const owner = enOwner.get(key);
        if (owner !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", i, "en", j],
            message: `영문 표기 중복: "${name}" (${owner}와 같음, 대소문자 무시)`,
          });
          return;
        }
        enOwner.set(key, `entries[${i}] "${entry.ko}"`);
      });
    });

    file.ignore.forEach((name, i) => {
      const owner = enOwner.get(name.toLowerCase());
      if (owner !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["ignore", i],
          message: `무시 목록의 "${name}"이(가) 사전 항목 ${owner}에 등록돼 있음`,
        });
      }
    });

    const slugOwner = new Map<string, number>();
    file.entries.forEach((entry, i) => {
      if (entry.slug === undefined) return;
      const key = `${entry.kind}:${entry.slug}`;
      const first = slugOwner.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", i, "slug"],
          message: `${entry.kind} slug 중복: "${entry.slug}" (entries[${first}]와 같음)`,
        });
        return;
      }
      slugOwner.set(key, i);
    });
  });
export type NamesKoFile = z.infer<typeof NamesKoFileSchema>;
