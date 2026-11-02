/**
 * 팔로우 저장 형식 — `localStorage` `ed-follow` 값의 엄격 스키마 (FR-110, PRD §15 D67 ②, M4-07)
 *
 * `{v:1, teams:[slug…], players:[slug…]}` — 종류별 한도(팀 5 + 선수 5) · 중복 없음 · slug 형식(`SlugSchema` + 64자 이하).
 * 클라이언트 섬은 zod를 번들에 넣지 않으려고 이 스키마 대신 `src/lib/follow.ts` `normalizeFollows`(같은 규칙의 손 구현)로
 * 읽는다. 두 구현이 어긋나지 않는지는 tests/follow.test.ts가 본다: 정리 결과는 늘 이 스키마를 통과하고, 이 스키마를
 * 통과하는 값은 정리해도 그대로다. 규칙을 바꾸면 두 파일을 함께 고친다.
 */
import { z } from "zod";

import {
  FOLLOW_LIMITS,
  FOLLOW_SLUG_MAX_LENGTH,
  FOLLOW_VERSION,
} from "@/lib/follow";

import { SlugSchema } from "./common";

/** 팔로우 slug — 팀·선수 slug 형식 + 길이 상한 */
export const FollowSlugSchema = SlugSchema.max(FOLLOW_SLUG_MAX_LENGTH);

function followList(limit: number) {
  return z
    .array(FollowSlugSchema)
    .max(limit)
    .refine((list) => new Set(list).size === list.length, {
      error: "팔로우 목록에 중복 slug",
    });
}

/** `ed-follow` 저장값 */
export const FollowStateSchema = z.strictObject({
  v: z.literal(FOLLOW_VERSION),
  teams: followList(FOLLOW_LIMITS.teams),
  players: followList(FOLLOW_LIMITS.players),
});
export type FollowStateStored = z.infer<typeof FollowStateSchema>;
