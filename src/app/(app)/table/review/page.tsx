import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = {
  title: "Session review",
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <div className="mx-auto w-full max-w-[40rem] pb-16">
      <Suspense fallback={null}>
        <ReviewClient />
      </Suspense>
    </div>
  );
}
