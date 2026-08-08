import type { Metadata } from "next";
import { PracticeView } from "./practice-client";

export const metadata: Metadata = { title: "Practice", robots: { index: false, follow: false } };

export default function PracticePage() {
  return <PracticeView />;
}
