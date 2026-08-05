import type { Metadata } from "next";
import { RangesClient } from "./ranges-client";

export const metadata: Metadata = { title: "Ranges", robots: { index: false, follow: false } };

export default function RangesPage() {
  return <RangesClient />;
}
