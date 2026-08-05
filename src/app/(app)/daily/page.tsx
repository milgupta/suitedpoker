import type { Metadata } from "next";
import { DailyClient } from "./daily-client";

export const metadata: Metadata = {
  title: "Daily challenge",
  robots: { index: false, follow: false },
};

export default function DailyPage() {
  return <DailyClient />;
}
