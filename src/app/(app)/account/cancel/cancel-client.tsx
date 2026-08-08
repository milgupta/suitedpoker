"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { capture } from "@/lib/analytics-client";
import { fadeUp } from "@/lib/motion";
import {
  accessEndsCopy,
  CANCEL_REASONS,
  KEPT_ON_CANCEL,
  offerFor,
  offerHref,
  REASON_LABELS,
  type CancelReason,
} from "@/lib/cancellation";
import type { PlanId } from "@/lib/stripe/plans";

/**
 * Cancelling, in three screens.
 *
 * The offer is shown ONCE. Declining it goes straight to confirm and cannot
 * loop back — a save offer that reappears is a dark pattern, and the people it
 * catches are the ones who charge back rather than cancel. It costs the fee,
 * the dispute and the review.
 *
 * The confirm screen leads with what they KEEP. Cancelling is not the end of
 * the relationship: a win-back is far cheaper than a new customer, and the
 * rating and streak are the hook that makes one possible.
 */

type Step = "reason" | "offer" | "confirm" | "done";

export function CancelClient({ plan, periodEnd }: { plan: PlanId; periodEnd: string | null }) {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(periodEnd);

  const offer = reason === null ? null : offerFor(reason, plan);

  function chooseReason() {
    if (reason === null) return;
    const next = offerFor(reason, plan);

    if (next.id === "none") {
      setStep("confirm");
      return;
    }
    capture("cancellation_offer_shown", { offer: next.id });
    setStep("offer");
  }

  async function acceptOffer() {
    if (reason === null || offer === null) return;
    capture("cancellation_offer_accepted", { offer: offer.id });

    if (offer.id === "switch_to_annual") {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/stripe/switch-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan: "annual" }),
        });
        if (!response.ok) throw new Error("switch failed");

        // Recorded as an accepted offer WITHOUT cancelling, so the save rate is
        // measurable against the reason that produced it.
        await fetch("/api/account/cancel/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason, offerShown: offer.id, offerAccepted: true }),
        }).catch(() => undefined);

        router.push("/account?switched=1");
        return;
      } catch {
        setBusy(false);
        setError("That didn't go through. Your plan is unchanged — try again, or cancel below.");
        return;
      }
    }

    const href = offerHref(offer.id);
    if (href !== null) window.location.href = href;
  }

  async function confirmCancel() {
    if (reason === null) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason,
          offerShown: offer?.id ?? "none",
          offerAccepted: false,
        }),
      });

      const body = (await response.json()) as { accessUntil?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "failed");

      if (typeof body.accessUntil === "string") setEndsAt(body.accessUntil);
      setStep("done");
    } catch {
      setError("We couldn't cancel that. Nothing has changed — try again, or email us.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pb-16">
      {step === "reason" && (
        <motion.section variants={fadeUp(reduced)} initial="hidden" animate="visible">
          <h1 className="text-heading-lg">Before you go — what&apos;s not working?</h1>
          <p className="text-text-secondary text-body-md mt-3">
            One question, and it genuinely changes what we build next.
          </p>

          <RadioGroup
            className="mt-6 space-y-1"
            value={reason ?? ""}
            onValueChange={(value) => setReason(value as CancelReason)}
          >
            {CANCEL_REASONS.map((id) => (
              <Label
                key={id}
                htmlFor={`reason-${id}`}
                className="border-border hover:bg-surface-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
              >
                <RadioGroupItem value={id} id={`reason-${id}`} data-testid={`reason-${id}`} />
                <span className="text-body-md">{REASON_LABELS[id]}</span>
              </Label>
            ))}
          </RadioGroup>

          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={chooseReason} disabled={reason === null} data-testid="reason-continue">
              Continue
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/account">Never mind, keep my subscription</Link>
            </Button>
          </div>
        </motion.section>
      )}

      {step === "offer" && offer !== null && (
        <motion.section
          variants={fadeUp(reduced)}
          initial="hidden"
          animate="visible"
          data-testid="offer"
          data-offer={offer.id}
        >
          <h1 className="text-heading-md">{offer.headline}</h1>
          <p className="text-text-secondary text-body-md mt-3">{offer.body}</p>

          {error !== null && (
            <p className="text-grade-mistake text-body-sm mt-4" role="status">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <Button
              variant="accent"
              onClick={() => void acceptOffer()}
              disabled={busy}
              data-testid="offer-accept"
            >
              {busy ? "One moment…" : offer.accept}
            </Button>
            {/* Straight to confirm. The offer is never shown a second time. */}
            <Button variant="ghost" onClick={() => setStep("confirm")} data-testid="offer-decline">
              {offer.decline}
            </Button>
          </div>
        </motion.section>
      )}

      {step === "confirm" && (
        <motion.section
          variants={fadeUp(reduced)}
          initial="hidden"
          animate="visible"
          data-testid="confirm"
        >
          <h1 className="text-heading-md">Cancel your subscription</h1>

          <p className="text-text-primary text-body-lg mt-4" data-testid="access-until">
            {accessEndsCopy(endsAt === null ? null : new Date(endsAt))}
          </p>

          <p className="text-text-secondary text-body-md mt-4">{KEPT_ON_CANCEL}</p>

          {error !== null && (
            <p className="text-grade-mistake text-body-sm mt-4" role="status">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <Button
              variant="ghost"
              className="text-grade-blunder"
              onClick={() => void confirmCancel()}
              disabled={busy}
              data-testid="confirm-cancel"
            >
              {busy ? "Cancelling…" : "Cancel my subscription"}
            </Button>
            <Button asChild>
              <Link href="/account">Keep my subscription</Link>
            </Button>
          </div>
        </motion.section>
      )}

      {step === "done" && (
        <motion.section
          variants={fadeUp(reduced)}
          initial="hidden"
          animate="visible"
          data-testid="done"
        >
          <h1 className="text-heading-md">That&apos;s done</h1>
          <p className="text-text-primary text-body-lg mt-4" data-testid="access-until">
            {accessEndsCopy(endsAt === null ? null : new Date(endsAt))}
          </p>
          <p className="text-text-secondary text-body-md mt-4">{KEPT_ON_CANCEL}</p>

          <div className="mt-8 flex flex-col gap-3">
            <Button variant="accent" asChild>
              <Link href="/practice">Keep playing until then</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/account">Back to account</Link>
            </Button>
          </div>
        </motion.section>
      )}
    </div>
  );
}
