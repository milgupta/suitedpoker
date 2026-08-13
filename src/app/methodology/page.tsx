import type { Metadata } from "next";
import Link from "next/link";
import { methodologyFacts } from "@/lib/methodology-server";
import { isFullySolverVerified, METHODOLOGY_SECTIONS, provenanceHeadline } from "@/lib/methodology";
import { ComplianceFooter } from "@/components/ComplianceFooter";

export const metadata: Metadata = {
  // Short, because the root template prefixes "Suited Poker — " to it. The
  // longer "where the strategy comes from" lives in the description, which is
  // the line Google actually shows underneath.
  title: "Methodology",
  description:
    "Exactly what SuitedPoker's strategy data is, how it was built, and what it can and cannot tell you.",
};

/**
 * The page a competitor charging $89.99 a year does not have.
 *
 * It is cheap to build and impossible to answer, and the only way it works is
 * if it is genuinely honest — including about the part that is currently a
 * weakness. A methodology page that overclaims is worse than none.
 */
export default function MethodologyPage() {
  const facts = methodologyFacts();

  return (
    <main className="mx-auto max-w-(--container-marketing) px-6 py-16">
      <h1 className="text-display-md sm:text-display-lg">Methodology</h1>

      <p className="text-text-primary text-body-lg mt-6">{provenanceHeadline(facts)}</p>

      <dl className="border-border mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
        <Fact label="Game" value={`${facts.game}, ${facts.tableSize}-max`} />
        <Fact label="Stack depth" value={`${facts.effStackBb}bb`} />
        <Fact label="Preflop spots" value={String(facts.preflopNodes)} />
        <Fact label="Postflop templates" value={String(facts.postflopTemplates)} />
      </dl>

      <p className="text-text-tertiary text-body-sm mt-3">
        Solution set <span className="font-mono">{facts.solutionSet}</span> ·{" "}
        {isFullySolverVerified(facts)
          ? `${facts.solverVerified} solver-verified`
          : `${facts.authoredApproximation} labelled authored-approximation, ${facts.solverVerified} solver-verified`}
      </p>

      <div className="mt-12 space-y-10">
        {METHODOLOGY_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-heading-lg">{section.heading}</h2>
            <p className="text-text-secondary text-body-md mt-3">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="text-text-secondary text-body-md mt-12">
        Something here look wrong?{" "}
        <a href="mailto:help@suitedpoker.com" className="text-accent-bright underline">
          Tell us
        </a>{" "}
        — we would rather fix it than defend it.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-accent-bright text-body-md underline">
          ← Back
        </Link>
      </p>

      <ComplianceFooter className="mt-12" />
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-1 p-4">
      <dt className="text-text-tertiary text-body-sm">{label}</dt>
      <dd className="text-heading-md mt-1 tabular-nums">{value}</dd>
    </div>
  );
}
