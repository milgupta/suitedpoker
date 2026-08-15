"use client";

import { derive, type Answers } from "@/lib/onboarding";
import { capture } from "@/lib/analytics-client";
import { trackDeduplicated } from "@/lib/meta-client";
import { START_ANSWERS_KEY, answersAreComplete, coerceAnswers } from "@/lib/start-answers";

export function loadStartAnswers(): Answers {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(START_ANSWERS_KEY);
    if (raw === null) return {};
    return coerceAnswers(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function saveStartAnswers(answers: Answers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(START_ANSWERS_KEY, JSON.stringify(answers));
  } catch {
    // Private mode / quota — the next answer retries the whole set.
  }
}

export function clearStartAnswers(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(START_ANSWERS_KEY);
  } catch {
    // Ignore.
  }
}

export type CommitStartResult = "committed" | "none" | "incomplete" | "failed";

/**
 * Moves local `/start` answers onto the profile after the account exists.
 *
 * Lead + onboarding_completed fire here (not on the anonymous quiz finish),
 * because Meta matching needs an email and the organic path already fires both
 * only once the server has derived the profile.
 */
export async function commitStartAnswers(): Promise<CommitStartResult> {
  const answers = loadStartAnswers();
  if (Object.keys(answers).length === 0) return "none";
  if (!answersAreComplete(answers)) return "incomplete";

  const post = () =>
    fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, complete: true }),
    });

  try {
    let response = await post();

    // Signup writes the session cookie and navigates in the same tick. The
    // first POST can beat the cookie and 401; one retry is cheaper than
    // dumping a finished quiz back on question one.
    if (response.status === 401) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      response = await post();
    }

    if (!response.ok) return "failed";

    const body = (await response.json().catch(() => ({}))) as {
      derived?: { skillTier: string; primaryLeakKey: string | null; rating: number };
    };

    const derived = body.derived ?? derive(answers);
    trackDeduplicated("Lead");
    capture("onboarding_completed", {
      skillTier: derived.skillTier,
      primaryLeak: derived.primaryLeakKey ?? "none",
      rating: derived.rating,
    });

    clearStartAnswers();
    return "committed";
  } catch {
    return "failed";
  }
}
