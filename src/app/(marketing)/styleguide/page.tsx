import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ColorLab } from "./color-lab";
import { ComponentsLab } from "./components-lab";
import { MotionLab } from "./motion-lab";
import { TypeLab } from "./type-lab";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "Every design token, type scale step, colour pairing and motion primitive.",
  // Internal tooling on a public marketing domain.
  robots: { index: false, follow: false },
};

const SPACING = [
  ["--rhythm-heading", "12px", "Heading → its body copy"],
  ["--rhythm-group", "16px", "Related elements in a group"],
  ["--rhythm-section", "24px", "Group → next group"],
  ["--rhythm-page", "40px", "Section → section"],
  ["--card-padding", "20px", "Card interior padding"],
  ["--grid-gap", "12px", "Grid gap, BOTH axes"],
  ["--gutter", "16px", "Mobile gutter"],
  ["--tap-min", "44px", "Minimum touch target"],
] as const;

const RADII = [
  ["rounded-sm", "10px", "Chips, badges, playing cards"],
  ["rounded-md", "14px", "Inputs, seat pills"],
  ["rounded-lg", "18px", "Default card radius"],
  ["rounded-xl", "24px", "Modals, sheets, the glass bar"],
  ["rounded-full", "9999px", "Every button, every pill"],
] as const;

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Typography"],
  ["spacing", "Spacing"],
  ["radius", "Radius"],
  ["treatments", "Signature treatments"],
  ["components", "Components"],
  ["motion", "Motion"],
] as const;

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 pt-10">
      <h2 className="text-display-md">{title}</h2>
      {lead !== undefined && (
        <p className="text-text-secondary text-body-lg mt-3 max-w-[45ch]">{lead}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <div className="mx-auto max-w-(--container-app) px-4 py-10">
      <header>
        <p className="text-overline text-accent-bright uppercase">SuitedPoker</p>
        <h1 className="text-display-lg mt-2">Design system</h1>
        <p className="text-text-secondary text-body-lg mt-3 max-w-[50ch]">
          The implementation of DESIGN.md. Every colour ratio and type metric on this page is
          measured live from the rendered element, so this is the visual regression check for the
          rest of the build — not a picture of one.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <Link
              key={id}
              href={`#${id}`}
              className="border-border bg-surface-1 text-text-secondary hover:text-text-primary hover:border-border-strong text-body-sm inline-flex min-h-11 items-center rounded-full border px-4 transition"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <Section
        id="colour"
        title="Colour"
        lead="Blue is interface. Green-to-red is grading. Neither borrows the other's range, and that separation is what keeps a data-dense screen readable."
      >
        <ColorLab />
      </Section>

      <Section id="type" title="Typography">
        <TypeLab />
      </Section>

      <Section
        id="spacing"
        title="Spacing"
        lead="Base unit 4px. Each rhythm level is roughly 2× the last — that doubling is what reads as neither jumbled nor too spaced out."
      >
        <ul className="flex flex-col gap-3">
          {SPACING.map(([token, value, use]) => (
            <li key={token} className="flex items-center gap-4">
              <span
                className="bg-accent-600 h-3 shrink-0 rounded-full"
                style={{ width: `var(${token})` }}
              />
              <span className="min-w-0">
                <code className="text-body-sm">{token}</code>
                <span className="text-text-tertiary text-caption block">
                  {value} · {use}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="border-border bg-surface-1 mt-8 rounded-lg border p-5">
          <p className="text-overline text-text-tertiary uppercase">Containers</p>
          <ul className="text-body-sm mt-3 flex flex-col gap-1">
            <li className="flex justify-between">
              <span>Marketing prose</span>
              <span className="text-text-tertiary font-mono">720px</span>
            </li>
            <li className="flex justify-between">
              <span>App content</span>
              <span className="text-text-tertiary font-mono">1100px</span>
            </li>
            <li className="flex justify-between">
              <span>Drill / table / range grid</span>
              <span className="text-text-tertiary font-mono">full bleed, 16px</span>
            </li>
          </ul>
        </div>
      </Section>

      <Section
        id="radius"
        title="Radius"
        lead="Containers get a fixed radius. Anything interactive and text-sized gets a full capsule. There is no in-between — no 6px buttons, no 10px cards."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {RADII.map(([utility, value, use]) => (
            <div key={utility} className="flex flex-col gap-2">
              <div className={`bg-surface-2 border-border-strong h-20 border ${utility}`} />
              <code className="text-caption">{utility}</code>
              <span className="text-text-tertiary text-caption">
                {value} · {use}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="treatments"
        title="Signature treatments"
        lead="The three recipes that produce the look. Reusable primitives, never ad-hoc CSS."
      >
        <div className="flex flex-col gap-8">
          <div>
            <h3 className="text-heading-md">Glass surface</h3>
            <p className="text-text-secondary text-body-sm mt-2 max-w-[52ch]">
              No backdrop-filter. The effect is entirely a 1px 12%-white hairline over a near-black
              fill — it reads brighter where the backdrop behind it is light. Note the signature
              nesting: a capsule container holding capsule children, one step apart in size.
            </p>
            <div className="ambient-host mt-4 flex justify-center py-10">
              <span className="ambient-blob top-0 left-1/2 -translate-x-1/2" aria-hidden="true" />
              <div className="glass flex items-center gap-2">
                <span className="text-text-secondary text-body-sm px-4">Nested capsules</span>
                <button
                  type="button"
                  className="bg-surface-3 text-text-primary text-body-sm inline-flex min-h-11 items-center rounded-full px-4"
                >
                  Ghost
                </button>
                <Button variant="accent" size="default">
                  Search
                </Button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-heading-md">The lit button</h3>
            <p className="text-text-secondary text-body-sm mt-2 max-w-[52ch]">
              Lit from below — the gradient runs dark at the top to bright at the bottom, and the
              specular highlight sits on the bottom inner edge. One per screen, the primary action.
              Disabled reduces opacity of the enabled style, never a different fill.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="accent" size="lg">
                Deal next hand
              </Button>
              <Button variant="accent" size="lg" disabled>
                Disabled
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-heading-md">Ambient glow</h3>
            <p className="text-text-secondary text-body-sm mt-2 max-w-[52ch]">
              Three techniques at three scales. Marketing, onboarding, diagnosis and paywall only —
              never behind the training canvas, where a large saturated field would destroy the
              ability to read colour semantically.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="hairline-top border-border bg-surface-1 overflow-hidden rounded-lg border p-5">
                <p className="text-heading-md">Gradient top hairline</p>
                <p className="text-text-secondary text-body-sm mt-2">
                  A 1px gradient with a soft bloom below it, on the top edge of a feature card.
                </p>
              </div>
              <div className="halo bg-surface-1 rounded-lg p-5">
                <p className="text-heading-md">Border halo</p>
                <p className="text-text-secondary text-body-sm mt-2">
                  One highlighted element per screen, maximum.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="components"
        title="Components"
        lead="White is the primary action colour — highest contrast on this canvas, and it never competes with data. Every component below is shadcn/ui rewritten onto these tokens, or built on them."
      >
        <ComponentsLab />
      </Section>

      <Section
        id="motion"
        title="Motion"
        lead="Physical rather than decorative. Nothing exceeds the slow duration, staggers cap at 300ms total, and every preset collapses to opacity-only under prefers-reduced-motion."
      >
        <MotionLab />
      </Section>

      <footer className="border-border text-text-tertiary text-caption mt-16 border-t pt-6">
        Values come from DESIGN.md. If a value here disagrees with that document, the document is
        wrong — the measured ratio wins.
      </footer>
    </div>
  );
}
