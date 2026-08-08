"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { fadeUp, scaleIn } from "@/lib/motion";
import { trackPixel } from "@/lib/meta-client";
import { PURCHASE_EVENT_ID_KEY } from "@/lib/meta-storage";

/**
 * The post-checkout landing page, and the fix for the worst bug in this flow.
 *
 * Stripe redirects here the instant the card clears. Its webhook — the thing
 * that actually writes the subscription row — arrives separately, usually
 * within a second or two but occasionally later. For that window the user has
 * paid and the database does not know it.
 *
 * Sending them to /practice in that window bounces them off the entitlement
 * gate and back to the paywall, seconds after paying. So this page sits outside
 * the gate, polls until the webhook lands, and only then moves them on. It is
 * the difference between "setting up your account" and "it charged me and it is
 * still asking for money".
 */

/** Fast enough to feel instant when the webhook is quick. */
const POLL_MS = 1_000;

/**
 * When to stop polling and offer a manual way forward.
 *
 * Never a dead end: at 20s the copy changes and the button becomes live, so a
 * user whose webhook is genuinely delayed can still get in and be gated by the
 * server rather than sitting on a spinner indefinitely.
 */
const PATIENCE_MS = 20_000;

type Phase = "checking" | "ready" | "slow";

export function WelcomeClient({ hasSession }: { hasSession: boolean }) {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>(hasSession ? "checking" : "ready");
  const startedAt = useRef<number>(0);

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/entitlement/status", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body: unknown = await response.json();
      return (
        typeof body === "object" &&
        body !== null &&
        (body as { entitled?: boolean }).entitled === true
      );
    } catch {
      // A dropped poll is not a failed payment. Keep waiting.
      return false;
    }
  }, []);

  useEffect(() => {
    if (!hasSession) return;

    let cancelled = false;
    startedAt.current = Date.now();

    async function poll() {
      if (cancelled) return;

      if (await check()) {
        if (!cancelled) setPhase("ready");
        return;
      }

      if (cancelled) return;
      if (Date.now() - startedAt.current > PATIENCE_MS) {
        setPhase("slow");
        return;
      }

      timer = setTimeout(() => void poll(), POLL_MS);
    }

    let timer = setTimeout(() => void poll(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [check, hasSession]);

  /**
   * The browser half of the Purchase, fired ONCE the payment is confirmed.
   *
   * Same event id the webhook sends from the server (minted at checkout,
   * carried through Stripe metadata), so Meta deduplicates the pair into one
   * conversion. The key is removed immediately: a reload of /welcome must not
   * report a second sale.
   */
  useEffect(() => {
    if (phase === "checking") return;

    let eventId: string | null = null;
    try {
      eventId = window.localStorage.getItem(PURCHASE_EVENT_ID_KEY);
      if (eventId !== null) window.localStorage.removeItem(PURCHASE_EVENT_ID_KEY);
    } catch {
      // Private browsing. The server's half still lands.
    }

    if (eventId !== null) trackPixel("Purchase", eventId);
  }, [phase]);

  // Prefetched during the wait so the first paid screen is instant.
  useEffect(() => {
    router.prefetch("/onboarding");
    router.prefetch("/practice");
  }, [router]);

  const waiting = phase === "checking";

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center text-center">
      <motion.div
        variants={scaleIn(reduced)}
        initial="hidden"
        animate="visible"
        className="border-accent/40 bg-accent/10 flex size-16 items-center justify-center rounded-full border"
      >
        {waiting ? <Spinner reduced={reduced} /> : <Check />}
      </motion.div>

      <motion.div variants={fadeUp(reduced)} initial="hidden" animate="visible" className="mt-6">
        <h1 className="text-heading-lg" data-welcome-state={phase}>
          {waiting ? "Setting up your account" : "You're in"}
        </h1>

        <p className="text-text-secondary text-body-md mt-3">
          {waiting
            ? "Your payment went through. This takes a couple of seconds."
            : phase === "slow"
              ? "Payment received. Your account is still finishing up — go ahead, it will catch up."
              : "Everything is unlocked. Time to find out where your game actually leaks."}
        </p>

        <Button
          variant="accent"
          size="lg"
          className="mt-8 w-full"
          disabled={waiting}
          onClick={() => router.push("/onboarding")}
          data-testid="welcome-continue"
        >
          {waiting ? "One moment…" : "Start"}
        </Button>

        <p className="text-text-tertiary text-body-sm mt-4">
          A receipt is on its way to your email.
        </p>
      </motion.div>
    </div>
  );
}

function Spinner({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      className="border-accent/30 border-t-accent block size-7 rounded-full border-2"
      animate={reduced ? undefined : { rotate: 360 }}
      transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }}
      aria-label="Setting up"
      role="status"
    />
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="text-accent-bright size-8" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
