"use client";

import { useMemo, useSyncExternalStore } from "react";
import { OnboardingClient } from "@/components/onboarding/onboarding-client";
import { coerceAnswers } from "@/lib/start-answers";
import { START_ANSWERS_KEY } from "@/lib/start-answers";
import type { Answers } from "@/lib/onboarding";

function subscribe(): () => void {
  // Answers are owned by OnboardingClient state after mount; we only need the
  // first client snapshot from localStorage.
  return () => undefined;
}

function getClientSnapshot(): string {
  try {
    return window.localStorage.getItem(START_ANSWERS_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): string {
  return "";
}

/**
 * Hydrates the quiz from localStorage on the client without an effect.
 * Server render is always empty; the first client snapshot restores a resume.
 */
export function StartClient() {
  const raw = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const answers = useMemo<Answers>(
    () => (raw === "" ? {} : coerceAnswers(JSON.parse(raw) as unknown)),
    [raw],
  );

  return <OnboardingClient initialAnswers={answers} mode="local" />;
}
