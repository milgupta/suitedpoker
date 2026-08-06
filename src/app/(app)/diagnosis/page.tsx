import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your leak", robots: { index: false, follow: false } };

/**
 * PLACEHOLDER — 7.2 builds the diagnosis.
 *
 * It exists now so the end of the quiz has a real destination rather than a
 * 404, and so 7.1's e2e can assert the flow completes.
 */
export default function DiagnosisPage() {
  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-4">
      <h1 className="text-display-md">Your leak</h1>
      <p className="text-text-secondary text-body-lg">Placeholder. 7.2 builds this.</p>
      <Button variant="accent" size="lg" asChild>
        <Link href="/paywall">Continue</Link>
      </Button>
    </div>
  );
}
