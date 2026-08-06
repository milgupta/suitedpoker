import type { Metadata } from "next";
import { TableSetupClient } from "./setup-client";

export const metadata: Metadata = { title: "Table", robots: { index: false, follow: false } };

/**
 * Session setup. The presets are the product decision here: each table is a
 * lesson with a name, not a difficulty slider — "The Home Game" teaches value
 * betting stations, and the card says so before a hand is dealt.
 */
export default function TablePage() {
  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <TableSetupClient />
    </div>
  );
}
