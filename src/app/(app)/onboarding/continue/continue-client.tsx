"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { commitStartAnswers } from "@/lib/start-answers-client";

export function ContinueClient() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const result = await commitStartAnswers();
      if (result === "committed") {
        router.replace("/onboarding/hand");
        return;
      }
      // No stored quiz, incomplete, or failed write — fall through to the
      // authenticated quiz rather than inventing a diagnosis from nothing.
      router.replace("/onboarding");
    })();
  }, [router]);

  return (
    <div
      className="bg-surface-2 mx-auto mt-16 h-40 max-w-[30rem] animate-pulse rounded-lg"
      aria-busy
      data-loading="continue"
    />
  );
}
