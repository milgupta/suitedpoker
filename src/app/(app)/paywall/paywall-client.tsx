"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { capture, isAnalyticsConfigured } from "@/lib/analytics-client";
import {
  annualisedCents,
  formatUsd,
  perWeekCents,
  PLAN_IDS,
  PLANS,
  savingPercent,
  type PlanId,
} from "@/lib/stripe/plans";
import { newEventId, trackDeduplicated } from "@/lib/meta-client";
import { PURCHASE_EVENT_ID_KEY } from "@/lib/meta-storage";
import { cn } from "@/lib/utils";

/**
 * The paywall.
 *
 * Three decisions worth keeping:
 *
 *   1. Yearly is pre-selected and visually dominant, and the saving is stated
 *      as a NUMBER against a struck-through annualised monthly price. "Best
 *      value" alone leaves the reader to do the arithmetic, and most will not.
 *   2. Every card carries a real radio. Communicating selection with border
 *      weight alone is genuinely ambiguous about what you are buying.
 *   3. Both the per-week headline AND the real billed price, separated by a
 *      hairline. "$2.88 per week" reads far smaller than "$149.99"; the second
 *      line is what keeps it honest.
 *
 * There is no exit downsell. Dropping the price the instant someone reaches for
 * the close button teaches them the list price is fiction, and the real price
 * ends up in a screenshot.
 */

export interface PaywallClientProps {
  /** 7.2 fills this with the diagnosis. Absent until then. */
  diagnosis?: React.ReactNode;
  /** The user's biggest leak, in bb/100. Shown as loss framing when present. */
  leakBb100?: number | null;
  leakLabel?: string | null;
}

const BENEFITS = [
  "Unlimited drills, every position and every spot",
  "An AI coach that explains every decision",
  "The full beginner-to-solid curriculum",
  "A daily challenge and a streak worth keeping",
  "The table simulator, six-handed",
  "Your leak report, updated as you play",
];

export function PaywallClient({ diagnosis, leakBb100, leakLabel }: PaywallClientProps) {
  const params = useSearchParams();
  const cancelled = params.get("cancelled") === "1";

  const [selected, setSelected] = useState<PlanId>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");

    capture("checkout_started", { plan: selected });

    /**
     * ONE id for both halves of the Purchase.
     *
     * Minted here, handed to Stripe as metadata, and stashed locally so
     * /welcome can fire the browser-side Purchase with the SAME id the webhook
     * will send from the server. Meta collapses the pair into one conversion;
     * two different ids would report two sales for one payment.
     */
    const metaEventId = newEventId("purchase");
    try {
      window.localStorage.setItem(PURCHASE_EVENT_ID_KEY, metaEventId);
    } catch {
      // Private browsing. The server still sends its half.
    }
    trackDeduplicated("InitiateCheckout", {
      value: PLANS[selected].amountCents / 100,
      currency: "USD",
    });

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: selected,
          // Carried through Stripe so the purchase attributes to the session
          // that produced it rather than to a fresh anonymous id.
          distinctId: isAnalyticsConfigured() ? posthog.get_distinct_id() : undefined,
          metaEventId,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "stripe_not_configured"
            ? "Checkout is not available yet. Try again shortly."
            : "Something went wrong starting checkout. Please try again.",
        );
        setBusy(false);
        return;
      }

      const { url } = (await response.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* The diagnosis behind a scrim: they are buying access to something that
          has already been built for them, not to a promise. */}
      {diagnosis !== undefined && (
        <div className="relative overflow-hidden rounded-lg">
          <div aria-hidden className="pointer-events-none blur-[6px] select-none">
            {diagnosis}
          </div>
          <div className="from-canvas absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
        </div>
      )}

      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">Your plan is ready.</h1>
        <p className="text-text-secondary text-body-lg max-w-[46ch]">
          Everything below is built and waiting. Pick how you want to pay.
        </p>
        {cancelled && (
          <p role="status" className="text-text-tertiary text-body-sm">
            No charge was made. Your place is still here when you want it.
          </p>
        )}
      </header>

      {/* Benefits ABOVE the plans. A price with nothing attached to it is just
          a number to argue with. */}
      <ul className="flex flex-col gap-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="text-body-md flex items-start gap-3">
            <span aria-hidden className="text-accent-bright mt-0.5">
              ✓
            </span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Choose a plan</legend>
        {PLAN_IDS.map((id) => (
          <PlanCard
            key={id}
            plan={id}
            selected={selected === id}
            onSelect={() => setSelected(id)}
          />
        ))}
      </fieldset>

      {leakBb100 != null && (
        // bb/100 and accuracy only — never a dollar figure for a poker result.
        // That is an ad-account and compliance boundary, not a copy preference.
        <p className="text-text-secondary text-body-md">
          {leakLabel == null ? "Your biggest leak" : `Your biggest leak, ${leakLabel},`} is costing
          you{" "}
          <span className="text-text-primary font-mono font-semibold tabular-nums">
            {leakBb100.toFixed(1)} bb/100
          </span>
          . Fixing it is what this is for.
        </p>
      )}

      {error !== "" && (
        <p
          role="alert"
          className="border-danger-border bg-danger-fill text-danger-bright text-body-md rounded-md border px-3 py-2"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="accent"
          size="lg"
          className="w-full"
          loading={busy}
          onClick={() => void startCheckout()}
        >
          Start training
        </Button>
        <p className="text-text-tertiary text-caption text-center">
          Cancel any time. {PLANS[selected].label.toLowerCase()} billing,{" "}
          {formatUsd(PLANS[selected].amountCents)} {PLANS[selected].intervalLabel}.
        </p>
      </div>

      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="text-heading-lg">Why it works</h2>
        <p className="text-text-secondary text-body-md max-w-[52ch]">
          Every spot you see is a real solved decision, not an opinion. You act, you are graded
          against the solution, and the coach explains the part you could not see. Repeat that a few
          hundred times and the reads stop being guesses.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading-lg">What players say</h2>
        {/* Deliberately empty. Fabricated testimonials are the fastest way to
            make a numerate audience discount every other claim on the page. */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border-border text-text-tertiary text-body-sm rounded-md border border-dashed px-4 py-6"
          >
            Testimonial slot {i + 1} — add a real one after launch.
          </div>
        ))}
      </section>

      <footer className="text-text-tertiary text-caption flex flex-wrap gap-x-4 gap-y-2">
        <Link href="/terms" className="hover:text-text-secondary underline underline-offset-4">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-text-secondary underline underline-offset-4">
          Privacy
        </Link>
      </footer>
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanId;
  selected: boolean;
  onSelect: () => void;
}) {
  const { label, amountCents, intervalLabel } = PLANS[plan];
  const isAnnual = plan === "annual";

  return (
    <label
      className={cn(
        // No `.tap-target` here: the card is already far larger than 44px, and
        // that class's ::before overlay would sit on top of its own radio.
        "relative flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors",
        selected
          ? "border-accent bg-surface-2"
          : "border-border bg-surface-1 hover:border-border-strong",
      )}
      data-plan={plan}
      data-selected={selected}
    >
      <input
        type="radio"
        name="plan"
        value={plan}
        checked={selected}
        onChange={onSelect}
        className="border-border-strong checked:border-accent checked:bg-accent size-5 shrink-0 appearance-none rounded-full border-2"
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="text-body-lg font-semibold">{label}</span>
          {isAnnual && (
            <span className="border-accent text-accent-bright text-overline rounded-full border px-2 py-0.5 uppercase">
              Save {savingPercent()}%
            </span>
          )}
        </span>

        <span className="text-heading-lg mt-1 font-mono tabular-nums">
          {formatUsd(perWeekCents(plan))}
          <span className="text-text-tertiary text-body-sm font-sans"> per week</span>
        </span>

        {/* The hairline, and the real number under it. */}
        <span className="border-border text-text-secondary text-body-sm mt-2 border-t pt-2 font-mono tabular-nums">
          {formatUsd(amountCents)} {intervalLabel}
          {isAnnual && (
            <span className="text-text-tertiary ml-2 line-through">
              {formatUsd(annualisedCents("monthly"))}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}
