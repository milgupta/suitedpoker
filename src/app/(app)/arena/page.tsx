import type { Metadata } from "next";
import { Suspense } from "react";
import { ArenaClient } from "./arena-client";

export const metadata: Metadata = { title: "Arena", robots: { index: false, follow: false } };

export default function ArenaPage() {
  return (
    // useSearchParams needs a boundary, and the preset lives in the query.
    <Suspense fallback={null}>
      <ArenaClient />
    </Suspense>
  );
}
