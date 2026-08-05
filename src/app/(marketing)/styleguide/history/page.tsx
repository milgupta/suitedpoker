import type { Metadata } from "next";
import Link from "next/link";
import { HistoryStates } from "./history-states";

export const metadata: Metadata = {
  title: "Hand history styleguide",
  robots: { index: false, follow: false },
};

export default function HistoryStyleguidePage() {
  return (
    <div className="mx-auto max-w-(--container-app) px-4 py-10">
      <header>
        <Link href="/styleguide" className="text-accent-bright text-body-sm hover:underline">
          ← Design system
        </Link>
        <h1 className="text-display-lg mt-3">Hand history</h1>
        <p className="text-text-secondary text-body-lg mt-3 max-w-[52ch]">
          The text drill format. Denser than the table and it fits four streets on a phone, which is
          exactly what the table cannot do.
        </p>
      </header>
      <div className="mt-10">
        <HistoryStates />
      </div>
    </div>
  );
}
