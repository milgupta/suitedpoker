/**
 * Reads the design tokens straight out of src/app/globals.css.
 *
 * Tests assert against the real stylesheet rather than a duplicated copy of the
 * palette, so a token can never pass its contrast check in a test while
 * shipping a different value to users.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCssColor, type Rgb } from "../../src/lib/color";

// Resolved from the Vitest root rather than import.meta.url, because under the
// jsdom environment import.meta.url is an http: URL and cannot be a file path.
const GLOBALS = resolve(process.cwd(), "src/app/globals.css");

/** Every `--token: value` declaration in globals.css, unresolved. */
export function readRawTokens(): Map<string, string> {
  const css = readFileSync(GLOBALS, "utf8");
  const tokens = new Map<string, string>();

  // Comments come out FIRST. globals.css documents tokens by name, and a
  // `--some-token:` written inside a comment would otherwise match as a
  // declaration and swallow the real one that follows it.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Declarations are one-per-line except the few color-mix() calls Prettier
  // wraps, so join continuations before matching.
  const flattened = withoutComments.replace(/\(\s*\n\s*/g, "(").replace(/,\s*\n\s*/g, ", ");

  for (const match of flattened.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    tokens.set(name, value.trim().replace(/\s+/g, " "));
  }

  return tokens;
}

const VAR = /var\(\s*(--[a-z0-9-]+)\s*\)/i;
const MIX = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i;

/**
 * Resolves `var()` chains and the `color-mix(in srgb, X n%, transparent)` form
 * we use for alpha fills, down to a concrete colour.
 */
export function resolveToken(name: string, tokens: Map<string, string>, depth = 0): Rgb | null {
  if (depth > 10) return null;

  const raw = tokens.get(name);
  if (raw === undefined) return null;

  const varMatch = VAR.exec(raw);
  if (varMatch !== null && raw.trim() === varMatch[0]) {
    const target = varMatch[1];
    return target === undefined ? null : resolveToken(target, tokens, depth + 1);
  }

  const mix = MIX.exec(raw);
  if (mix !== null) {
    const [, colour, percent] = mix;
    if (colour === undefined || percent === undefined) return null;

    const inner = VAR.exec(colour);
    const base =
      inner !== null && inner[1] !== undefined
        ? resolveToken(inner[1], tokens, depth + 1)
        : parseCssColor(colour);

    if (base === null) return null;
    return { ...base, a: base.a * (parseFloat(percent) / 100) };
  }

  return parseCssColor(raw);
}

/** Every token that resolves to a colour, keyed by token name. */
export function readColorTokens(): Map<string, Rgb> {
  const raw = readRawTokens();
  const colors = new Map<string, Rgb>();

  for (const name of raw.keys()) {
    const resolved = resolveToken(name, raw);
    if (resolved !== null) colors.set(name, resolved);
  }

  return colors;
}

export function requireColor(name: string, colors: Map<string, Rgb>): Rgb {
  const value = colors.get(name);
  if (value === undefined) throw new Error(`Token ${name} is missing from globals.css`);
  return value;
}
