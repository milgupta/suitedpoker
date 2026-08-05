import type { Metadata } from "next";
import Link from "next/link";
import { TableStates } from "./table-states";

export const metadata: Metadata = {
  title: "Table styleguide",
  description: "The poker table in every meaningful state.",
  robots: { index: false, follow: false },
};

export default function TableStyleguidePage() {
  return (
    <div className="mx-auto max-w-(--container-app) px-4 py-10">
      <header>
        <Link href="/styleguide" className="text-accent-bright text-body-sm hover:underline">
          ← Design system
        </Link>
        <h1 className="text-display-lg mt-3">The table</h1>
        <p className="text-text-secondary text-body-lg mt-3 max-w-[52ch]">
          A glowing elliptical ring on near-black, never a felt surface. Every state below is
          produced by the real state machine, so the table cannot render something the engine would
          never hand it.
        </p>
      </header>

      <div className="mt-10">
        <TableStates />
      </div>
    </div>
  );
}
