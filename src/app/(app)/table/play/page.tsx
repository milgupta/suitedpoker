import type { Metadata } from "next";
import { Suspense } from "react";
import { TablePlayClient } from "./play-client";

export const metadata: Metadata = {
  title: "At the table",
  robots: { index: false, follow: false },
};

export default function TablePlayPage() {
  return (
    <div className="mx-auto w-full max-w-[40rem]">
      <Suspense fallback={null}>
        <TablePlayClient />
      </Suspense>
    </div>
  );
}
