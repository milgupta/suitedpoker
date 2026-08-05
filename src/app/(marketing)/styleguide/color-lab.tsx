"use client";

import { formatRgb } from "@/lib/color";
import { GRADES, GRADE_MARKS } from "@/lib/grade";
import { evColor, evColorRgb, EV_STOPS } from "@/lib/ev-color";
import { resolveToken, tokenContrast, useResolved } from "./resolve-color";

const SURFACES = [
  ["--color-canvas", "Page background everywhere"],
  ["--color-canvas-deep", "Marketing hero, onboarding, modal scrims"],
  ["--color-surface-1", "Cards, panels"],
  ["--color-surface-2", "Raised, hover, nested cards"],
  ["--color-surface-3", "Inputs, filled controls"],
  ["--color-glass", "Glass surface fill"],
] as const;

const BORDERS = [
  ["--color-border", "Default card and panel edges"],
  ["--color-border-strong", "Glass bar, focused inputs, emphasis"],
  ["--color-border-subtle", "Dividers, table rules"],
] as const;

const TEXT = [
  ["--color-text-primary", "Headings, values"],
  ["--color-text-secondary", "Body copy, descriptions"],
  ["--color-text-tertiary", "Meta, labels — never below this"],
] as const;

const ACCENT_RAMP = [
  "--color-accent-50",
  "--color-accent-100",
  "--color-accent-200",
  "--color-accent-300",
  "--color-accent-400",
  "--color-accent-500",
  "--color-accent-600",
  "--color-accent-700",
  "--color-accent-800",
  "--color-accent-900",
  "--color-accent-950",
] as const;

const ACCENT_ALIASES = [
  ["--color-accent", "Fills and large text only — 4.37 on canvas"],
  ["--color-accent-bright", "Accent text and links"],
  ["--color-accent-deep", "Lit-button gradient top stop"],
  ["--color-on-accent", "Label on an accent fill"],
] as const;

function Ratio({ value, min }: { value: number | null; min: number }) {
  if (value === null) return <span className="text-text-tertiary">—</span>;
  const pass = value >= min;
  return (
    <span
      className="text-caption font-mono"
      style={{ color: pass ? "var(--color-grade-best)" : "var(--color-grade-blunder)" }}
    >
      {value.toFixed(2)} {pass ? "✓" : "✗"}
    </span>
  );
}

function TokenRow({
  token,
  note,
  ratio,
  min,
  round,
}: {
  token: string;
  note?: string;
  ratio?: number | null;
  min?: number;
  round?: boolean;
}) {
  const resolved = resolveToken(token);

  return (
    <li className="border-border-subtle flex items-center gap-3 border-b py-3 last:border-b-0">
      <span
        className="border-border h-10 w-10 shrink-0 border"
        style={{
          background: `var(${token})`,
          borderRadius: round === true ? "var(--radius-full)" : "var(--radius-sm)",
        }}
      />
      <span className="min-w-0 flex-1">
        <code className="text-body-sm block truncate">{token.replace("--color-", "")}</code>
        <span className="text-text-tertiary text-caption block truncate">
          {resolved === null ? "unresolved" : formatRgb(resolved)}
          {note !== undefined && ` · ${note}`}
        </span>
      </span>
      {ratio !== undefined && min !== undefined && <Ratio value={ratio} min={min} />}
    </li>
  );
}

export function ColorLab() {
  const ready = useResolved();
  if (!ready) return <div className="text-text-tertiary text-body-sm">Resolving tokens…</div>;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h3 className="text-heading-md">Canvas and surfaces</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Ratio shown is <code>--text-primary</code> on that surface. The black is deliberately not
          black — it is violet-shifted, so white picks up a faint cast and glows blend in.
        </p>
        <ul className="mt-4">
          {SURFACES.map(([token, note]) => (
            <TokenRow
              key={token}
              token={token}
              note={note}
              min={4.5}
              ratio={tokenContrast("--color-text-primary", token)}
            />
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-heading-md">Borders</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Always alpha, never hex — an alpha border adapts to whatever surface it lands on.
        </p>
        <ul className="mt-4">
          {BORDERS.map(([token, note]) => (
            <TokenRow key={token} token={token} note={note} />
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-heading-md">Text</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Ratio is against <code>--canvas</code>. All three clear AA at body size.
        </p>
        <ul className="mt-4">
          {TEXT.map(([token, note]) => (
            <TokenRow
              key={token}
              token={token}
              note={note}
              min={4.5}
              ratio={tokenContrast(token, "--color-canvas")}
            />
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-heading-md">Accent ramp</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Derived in OKLCh with 400, 500 and 800 pinned to the measured values. Blue is interface
          only — it never grades a decision.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse">
            <thead>
              <tr className="text-text-tertiary text-overline text-left uppercase">
                <th className="pb-2 font-bold">Stop</th>
                <th className="pb-2 font-bold">Swatch</th>
                <th className="pb-2 font-bold">On canvas</th>
                <th className="pb-2 font-bold">White on it</th>
              </tr>
            </thead>
            <tbody>
              {ACCENT_RAMP.map((token) => (
                <tr key={token} className="border-border-subtle border-t">
                  <td className="text-body-sm py-2 font-mono">{token.replace("--color-", "")}</td>
                  <td className="py-2">
                    <span
                      className="block h-6 w-16"
                      style={{ background: `var(${token})`, borderRadius: "var(--radius-sm)" }}
                    />
                  </td>
                  <td className="py-2">
                    <Ratio value={tokenContrast(token, "--color-canvas")} min={3} />
                  </td>
                  <td className="py-2">
                    <Ratio value={tokenContrast("--color-on-accent", token)} min={4.5} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-6">
          {ACCENT_ALIASES.map(([token, note]) => (
            <TokenRow key={token} token={token} note={note} round />
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-heading-md">Grades</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Green through red, and nothing decorative may borrow these. Colour is never the only
          signal — every grade carries an icon and a word.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {GRADES.map((grade) => (
            <span
              key={grade}
              className="text-body-sm inline-flex items-center gap-2 border px-3 py-2"
              style={{
                color: `var(--color-grade-${grade})`,
                background: `var(--color-grade-${grade}-fill)`,
                borderColor: `var(--color-grade-${grade}-border)`,
                borderRadius: "var(--radius-full)",
                ...(grade === "sharp"
                  ? { boxShadow: "0 0 20px var(--color-grade-sharp-glow)" }
                  : {}),
              }}
            >
              <span aria-hidden="true">{GRADE_MARKS[grade].icon}</span>
              {GRADE_MARKS[grade].label}
            </span>
          ))}
        </div>

        <ul className="mt-6">
          {GRADES.map((grade) => (
            <TokenRow
              key={grade}
              token={`--color-grade-${grade}`}
              note={`${GRADE_MARKS[grade].icon} ${GRADE_MARKS[grade].label}`}
              min={4.5}
              ratio={tokenContrast(`--color-grade-${grade}`, "--color-canvas")}
            />
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-heading-md">evColor(bbLoss)</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          One function, not a palette. Every frequency-bar segment in the app gets its colour from
          here, so the whole grading language derives from one place.
        </p>

        <div
          className="border-border mt-4 h-10 border"
          style={{
            borderRadius: "var(--radius-full)",
            background: `linear-gradient(to right, ${EV_STOPS.map(
              (s) => `${evColor(s.bb)} ${(s.bb / 10) * 100}%`,
            ).join(", ")})`,
          }}
        />
        <div className="text-text-tertiary text-caption mt-2 flex justify-between font-mono">
          {EV_STOPS.map((s) => (
            <span key={s.bb}>{s.bb}bb</span>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse">
            <thead>
              <tr className="text-text-tertiary text-overline text-left uppercase">
                <th className="pb-2 font-bold">Loss</th>
                <th className="pb-2 font-bold">evColor()</th>
                <th className="pb-2 font-bold">evColorRgb()</th>
                <th className="pb-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {[0, 0.25, 0.5, 1.25, 2, 3.5, 5, 7.5, 10].map((bb) => (
                <tr key={bb} className="border-border-subtle border-t">
                  <td className="text-body-sm py-2 font-mono">{bb.toFixed(2)}bb</td>
                  <td className="text-caption text-text-secondary max-w-[16rem] truncate py-2 font-mono">
                    {evColor(bb)}
                  </td>
                  <td className="text-caption text-text-secondary py-2 font-mono">
                    {evColorRgb(bb)}
                  </td>
                  <td className="py-2">
                    <span
                      className="block h-6 w-10"
                      style={{ background: evColor(bb), borderRadius: "var(--radius-sm)" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
