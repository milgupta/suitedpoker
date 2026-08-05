/**
 * Colour maths. Parsing, OKLab conversion, alpha compositing and WCAG contrast.
 *
 * Deliberately contains no colour VALUES — only the arithmetic. Every literal
 * colour in this codebase lives in src/app/globals.css and reaches this module
 * as a parsed string.
 */

export interface Rgb {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
  /** 0–1 */
  a: number;
}

/** OKLab coordinates: L 0–1, a/b roughly -0.4–0.4. */
export interface Oklab {
  L: number;
  a: number;
  b: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Parses the colour notations this codebase actually emits: hex (3, 4, 6 or 8
 * digit) and rgb()/rgba() in both comma and space syntax.
 *
 * Returns null rather than throwing, because callers are usually reading a
 * custom property that may legitimately be absent.
 */
export function parseCssColor(input: string): Rgb | null {
  const value = input.trim();
  if (value === "") return null;

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);

    if (hex.length === 3 || hex.length === 4) {
      const parts = hex.split("");
      const [r, g, b, a] = parts;
      if (r === undefined || g === undefined || b === undefined) return null;
      return {
        r: expand(r),
        g: expand(g),
        b: expand(b),
        a: a === undefined ? 1 : expand(a) / 255,
      };
    }

    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return { r, g, b, a };
    }

    return null;
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (fn === null) return null;

  const body = fn[1];
  if (body === undefined) return null;

  const parts = body
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter((p) => p !== "");

  const [rs, gs, bs, as] = parts;
  if (rs === undefined || gs === undefined || bs === undefined) return null;

  const channel = (s: string): number =>
    s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s);
  const alpha = (s: string): number => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s));

  const rgb = {
    r: channel(rs),
    g: channel(gs),
    b: channel(bs),
    a: as === undefined ? 1 : alpha(as),
  };
  if (Object.values(rgb).some(Number.isNaN)) return null;
  return rgb;
}

/** The space-separated `rgb()` form, with a slash-alpha suffix when translucent. */
export function formatRgb({ r, g, b, a }: Rgb): string {
  const ch = (v: number): number => Math.round(clamp(v, 0, 255));
  const base = `${ch(r)} ${ch(g)} ${ch(b)}`;
  return a >= 1 ? `rgb(${base})` : `rgb(${base} / ${Number(a.toFixed(4))})`;
}

/**
 * Flattens a translucent colour onto an opaque backdrop. Required for contrast
 * checking, since our text tokens are alpha whites rather than solid greys.
 */
export function compositeOver(fg: Rgb, bg: Rgb): Rgb {
  const a = clamp(fg.a, 0, 1);
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: Oklab, alpha = 1): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: clamp(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 1) * 255,
    g: clamp(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 0, 1) * 255,
    b: clamp(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), 0, 1) * 255,
    a: alpha,
  };
}

/**
 * Mixes two colours in OKLab, matching what `color-mix(in oklab, ...)` does in
 * the browser. `t` runs 0 (all `from`) to 1 (all `to`).
 */
export function mixOklab(from: Rgb, to: Rgb, t: number): Rgb {
  const p = clamp(t, 0, 1);
  const A = rgbToOklab(from);
  const B = rgbToOklab(to);
  return oklabToRgb({
    L: A.L + (B.L - A.L) * p,
    a: A.a + (B.a - A.a) * p,
    b: A.b + (B.b - A.b) * p,
  });
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => srgbToLinear(c / 255)) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * WCAG 2.1 contrast ratio, 1–21. Both colours are composited onto `backdrop`
 * first so alpha tokens are measured as they actually render.
 */
export function contrastRatio(fg: Rgb, bg: Rgb, backdrop: Rgb = bg): number {
  const a = relativeLuminance(compositeOver(fg, compositeOver(bg, backdrop)));
  const b = relativeLuminance(compositeOver(bg, backdrop));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
