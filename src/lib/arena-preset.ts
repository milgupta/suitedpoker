import { z } from "zod";

/**
 * The arena entry contract.
 *
 * 3.3 (leak targeting), 3.5 ("practice this spot"), 5.2 (lesson practice sets)
 * and 5.3 ("drill this") all launch a pre-configured session. Defining the
 * payload once — and exporting the link builder — is what stops four substages
 * hand-rolling four slightly different URLs.
 */

export const spotConfigSchema = z.object({
  type: z.enum(["preflop", "postflop"]),
  difficulty: z.number().int().min(1).max(10).optional(),
  tags: z.array(z.string()).optional(),
  heroPos: z.enum(["UTG", "MP", "CO", "BTN", "SB", "BB"]).optional(),
  actionSeq: z.string().optional(),
  templateId: z.string().optional(),
  street: z.enum(["flop", "turn", "river"]).optional(),
  excludeNodeRefs: z.array(z.string()).optional(),
});

export const arenaPresetSchema = z.object({
  config: spotConfigSchema,
  /** A fixed-length session. Omit for the endless rated feed. */
  length: z.number().int().min(1).max(100).optional(),
  /** Renders as a chip at the top: "Practicing: blind defense". */
  label: z.string().max(60).optional(),
  /** Where the summary's return button goes. Same-origin paths only. */
  returnTo: z
    .string()
    .startsWith("/")
    .refine((v) => !v.startsWith("//"), "must be a same-origin path")
    .optional(),
});

export type ArenaPreset = z.infer<typeof arenaPresetSchema>;

function toBase64Url(value: string): string {
  const base64 =
    typeof btoa === "function" ? btoa(value) : Buffer.from(value, "utf8").toString("base64");
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
}

/** The only place an /arena link is built. */
export function buildArenaLink(preset: ArenaPreset): string {
  return `/arena?preset=${toBase64Url(JSON.stringify(preset))}`;
}

/**
 * Decodes a preset, or returns null.
 *
 * An invalid preset falls back to the default endless session rather than
 * erroring: this value arrives in a URL that gets shared, truncated and
 * mangled, and a 500 on a bad link is a worse outcome than a generic session.
 */
export function parseArenaPreset(encoded: string | null | undefined): ArenaPreset | null {
  if (encoded === null || encoded === undefined || encoded === "") return null;

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded));
    const result = arenaPresetSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
