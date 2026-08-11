import type { SpotConfig } from "@/poker/generator";

/**
 * Below this the default Arena is the pure preflop grind. Onboarding places
 * beginners at 700–850, so the floor sits at the TOP of that band — at the old
 * floor of 1000 the target audience never saw a single postflop spot, because
 * nothing they were placed at reached it.
 */
export const ARENA_MIX_FLOOR = 850;
/** Recreational — the postflop share steps up. */
export const ARENA_MIX_REC = 1000;
/** Solid — wider postflop textures and turn. */
export const ARENA_MIX_SOLID = 1200;
/** Strong — river can appear in the mix. */
export const ARENA_MIX_STRONG = 1400;

/** 850–999: a small taste, drawn only from the easiest flop textures. */
export const ARENA_MIX_SHARE_STARTER = 0.1;
export const ARENA_MIX_SHARE_REC = 0.2;
export const ARENA_MIX_SHARE_SOLID = 0.35;

/**
 * True when the client asked for the open endless grind — preflop with no
 * pins. Lesson practice, range-grid "practise this", and hub deep-links all
 * set at least one of tags / heroPos / actionSeq / templateId; those must
 * win over the rating lottery.
 */
export function isOpenArenaConfig(config: SpotConfig): boolean {
  return (
    config.type === "preflop" &&
    (config.tags === undefined || config.tags.length === 0) &&
    config.heroPos === undefined &&
    config.actionSeq === undefined &&
    config.templateId === undefined
  );
}

export interface ArenaMixInput {
  readonly rating: number;
  /** 0–1 — whether this hand is the postflop slot. */
  readonly mixRoll: number;
  /** 0–1 — which postflop family inside the slot. */
  readonly familyRoll: number;
}

/**
 * Rating-gated postflop lottery for the default Arena.
 *
 * Returns the input config unchanged when the player is below the floor or
 * when the mix roll misses. Difficulty is preserved by the caller.
 */
export function applyArenaMix(config: SpotConfig, input: ArenaMixInput): SpotConfig {
  if (input.rating < ARENA_MIX_FLOOR) return config;

  const share =
    input.rating >= ARENA_MIX_SOLID
      ? ARENA_MIX_SHARE_SOLID
      : input.rating >= ARENA_MIX_REC
        ? ARENA_MIX_SHARE_REC
        : ARENA_MIX_SHARE_STARTER;
  if (input.mixRoll >= share) return config;

  if (input.rating >= ARENA_MIX_STRONG && input.familyRoll < 0.25) {
    return {
      ...config,
      type: "postflop",
      street: "river",
      tags: undefined,
      actionSeq: undefined,
      templateId: undefined,
    };
  }

  if (input.rating >= ARENA_MIX_SOLID) {
    const street = input.familyRoll < 0.55 ? "flop" : "turn";
    return {
      ...config,
      type: "postflop",
      street,
      tags: ["dry", "ace-high", "wet", "connected"],
      actionSeq: undefined,
      templateId: undefined,
    };
  }

  // Starter (850+) and Recreational: flop only, easiest textures.
  return {
    ...config,
    type: "postflop",
    street: "flop",
    tags: ["dry", "ace-high"],
    actionSeq: undefined,
    templateId: undefined,
  };
}
