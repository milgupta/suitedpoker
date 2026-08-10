"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { ProofMarquee } from "@/components/ProofMarquee";
import { PROOF_MODE } from "@/content/testimonials";
import { capture, isAnalyticsConfigured } from "@/lib/analytics-client";
import {
  formatUsd,
  perMonthCents,
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
 * Two columns above `lg`, one below, and the PURCHASE COLUMN COMES FIRST IN THE
 * DOM. That is not a detail: most arrivals are on a phone, and the e2e asserts
 * the CTA sits above 844px at 390px wide. Grid placement moves the showcase to
 * the left on a wide screen without moving it up on a narrow one.
 *
 * Decisions worth keeping from the first version:
 *
 *   1. Yearly is pre-selected and leads the list, and the saving is stated as a
 *      NUMBER. "Best value" alone leaves the reader to do the arithmetic, and
 *      most will not.
 *   2. Every card carries a REAL radio, however it is painted. Communicating
 *      selection with border weight alone is genuinely ambiguous about what you
 *      are buying, and a styled div is not a control a keyboard can reach.
 *   3. Both the headline number AND the real charge are on the card. "$10.00
 *      /mo" reads far smaller than "$119.99"; the "billed yearly" line beneath
 *      the plan name is what keeps it honest. The headline is per MONTH rather
 *      than per week — a monthly figure is the one somebody can check against
 *      their own bank statement.
 *
 * What the redesign cut: the "Why it works" essay, the second heading above the
 * proof band, and four of the six benefit sentences. All were true and none
 * were being read — a payment screen that argues is a payment screen that has
 * already lost. The claims moved into the band, where they pass by instead of
 * demanding a scroll.
 *
 * There is still no exit downsell. Dropping the price the instant someone
 * reaches for the close button teaches them the list price is fiction, and the
 * real price ends up in a screenshot.
 */

export interface PaywallClientProps {
  /** 7.2 fills this with the diagnosis. Absent until then. */
  diagnosis?: React.ReactNode;
  /** The user's biggest leak, in bb/100. Shown as loss framing when present. */
  leakBb100?: number | null;
  leakLabel?: string | null;
}

/**
 * Three, in one row, between the plans and the button.
 *
 * This was six full sentences under the CTA. Six lines of prose on a payment
 * screen is six lines nobody reads, and the three that were cut — the daily
 * challenge, the table simulator, the leak report — all appear in the proof
 * band below, so nothing was actually lost. Short enough that the row survives
 * 390px without wrapping into a paragraph.
 */
const HIGHLIGHTS = ["Unlimited drills", "AI coach", "Full curriculum"];

// `leakBb100` and `leakLabel` are still supplied by the page and still on the
// props above, but nothing reads them since the headline became the subscriber
// stat. Left plumbed rather than ripped out: the profile lookup that feeds them
// is 7.3's work, and the leak framing is one line away if the headline changes
// back. Not destructured, so the unused-variable lint stays quiet.
export function PaywallClient({ diagnosis }: PaywallClientProps) {
  const params = useSearchParams();
  const cancelled = params.get("cancelled") === "1";

  const [selected, setSelected] = useState<PlanId>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /**
   * The drop-off step, fired on Stripe's return rather than on leaving here.
   *
   * This catches the BACK BUTTON on Stripe's page, which is the only abandonment
   * the browser ever tells us about — a closed tab or a dead session simply
   * never comes back, and counting those means differencing against
   * `checkout_started` in the funnel. Guarded by a ref because React mounts
   * effects twice in development and a doubled abandonment understates
   * conversion.
   */
  const abandonReported = useRef(false);
  useEffect(() => {
    if (!cancelled || abandonReported.current) return;
    abandonReported.current = true;

    const raw = params.get("plan");
    const plan = PLAN_IDS.find((id) => id === raw);
    // Fall back to the default selection rather than dropping the event: a
    // missing plan is worth less than a missing drop-off.
    capture("checkout_abandoned", { plan: plan ?? "annual" });
  }, [cancelled, params]);

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
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-10">
      {/*
       * THE WHITE PANEL.
       *
       * The one light surface in a dark-only app. Every payment flow this
       * audience has ever completed is dark text on white — Stripe's own,
       * Apple's, every shopfront — and a checkout that looks like the rest of
       * the product looks like part of the product rather than like a receipt.
       *
       * `.panel-light` re-points the generic colour tokens for this subtree, so
       * the plan cards, the radios and the links below render correctly without
       * any of them knowing they are on white. See globals.css.
       */}
      <div className="panel-light rounded-xl p-6 sm:p-10">
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-2 lg:items-start lg:gap-14">
          {/* ── The purchase column ────────────────────────────────────────── */}
          <section className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
            <header className="flex flex-col gap-3">
              {/*
               * A PERFORMANCE CLAIM ABOUT CUSTOMERS. It needs substantiation on
               * file, not just in the copy.
               *
               * The FTC requires the evidence for a claim like this to exist in
               * documented form BEFORE it runs, and a payment page is where it
               * is least defensible without one (FTC Act §5; 16 CFR Part 465 is
               * the neighbouring rule this codebase already honours in
               * `src/content/testimonials.ts`, which refuses any entry with no
               * `source`). Milan has confirmed the figure is substantiated.
               *
               * WHOEVER CHANGES THIS NUMBER: record where it came from — the
               * cohort, the window, and the measure of "improved" — in the same
               * place the source for a testimonial would go. A percentage that
               * nobody can trace back is the one that costs the ad account.
               */}
              <h1 className="text-display-lg text-balance">
                {/* --accent-bright, which `.panel-light` re-points to
                    --accent-700 so it stays legible on white. */}
                <span className="text-accent-bright">92%</span> of Suited Poker subscribers improved
                their grades
              </h1>

              <p className="text-text-secondary text-body-lg max-w-[42ch]">
                Join the best poker trainer available.
              </p>

              {cancelled && (
                <p role="status" className="text-text-tertiary text-body-sm">
                  No charge was made. Your place is still here when you want it.
                </p>
              )}
            </header>

            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Choose a plan</legend>
              {CARD_ORDER.map((id) => (
                <PlanCard
                  key={id}
                  plan={id}
                  selected={selected === id}
                  onSelect={() => setSelected(id)}
                />
              ))}
            </fieldset>

            {/* Between the plans and the button, where the reference puts them:
              the last thing read before the price is what the price is for.
              Accent, never the grade green — blue is interface, green-to-red is
              grading, and the two never borrow each other's range. */}
            <ul className="text-text-secondary text-body-sm flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {HIGHLIGHTS.map((highlight) => (
                <li key={highlight} className="flex items-center gap-1.5">
                  <span aria-hidden className="text-accent-bright">
                    ✓
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>

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

            <footer className="text-text-tertiary text-caption flex flex-wrap justify-center gap-x-4 gap-y-2">
              <Link
                href="/terms"
                className="hover:text-text-secondary underline underline-offset-4"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-text-secondary underline underline-offset-4"
              >
                Privacy
              </Link>
            </footer>
          </section>

          {/* ── The showcase column ────────────────────────────────────────── */}
          {/* Centred against the taller purchase column rather than top-aligned:
            aligned to the top it leaves a column of empty page under it, which
            reads as something having failed to load. */}
          <aside className="lg:col-start-1 lg:row-start-1 lg:self-center">
            {diagnosis === undefined ? (
              <ProductShot />
            ) : (
              /* The diagnosis behind a scrim: they are buying access to something
               that has already been built for them, not to a promise. */
              <div className="relative overflow-hidden rounded-lg">
                <div aria-hidden className="pointer-events-none blur-[6px] select-none">
                  {diagnosis}
                </div>
                <div className="from-canvas absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
              </div>
            )}
          </aside>
        </div>
      </div>

      {/*
       * The band, OUTSIDE the white panel and the full width of the page.
       *
       * Outside because a marquee inside the panel would run under the CTA and
       * pull the eye off it at the exact moment the decision is being made;
       * below it, on the dark ground, it reads as the room the product sits in
       * rather than as part of the form. Full width because a marquee penned
       * into a half-width box reads as a broken carousel.
       */}
      <section className="flex flex-col gap-3">
        <h2 className="text-text-tertiary text-overline text-center uppercase">
          {/* The label follows the DATA. With no collected quotes the band
              carries product facts, and calling those "what players say" would
              be the fabricated testimonial the whole module exists to refuse. */}
          {PROOF_MODE === "quotes" ? "What players say" : "What you get"}
        </h2>
        <ProofMarquee />
      </section>
    </div>
  );
}

/**
 * Best value first.
 *
 * The pre-selected plan leading the list is what the eye lands on, and the
 * ribbon needs a card to sit on top of. Derived from PLAN_IDS rather than
 * typed out, so a third plan cannot silently fall off the page.
 */
const CARD_ORDER: readonly PlanId[] = [...PLAN_IDS].sort((a) => (a === "annual" ? -1 : 1));

/**
 * One real screen from the product.
 *
 * The DRILL shot, not the feedback one. Both are real; this is the one that
 * explains itself with no caption — six seats, who raised, your two cards — and
 * the feedback shot needs the grade panel in frame to make sense, which does
 * not survive a crop. It is also the screen somebody is actually buying.
 *
 * A 3/5 frame with `object-top` rather than the whole 780x1688 capture: it ends
 * just under the hero's hand, which is where the interesting part of the
 * screenshot stops.
 */
function ProductShot() {
  return (
    <figure className="mx-auto flex w-full max-w-[22rem] flex-col gap-3">
      <div className="border-border bg-canvas relative aspect-3/5 overflow-hidden rounded-lg border">
        <picture>
          <source srcSet="/screenshots/drill.avif" type="image/avif" />
          <source srcSet="/screenshots/drill.webp" type="image/webp" />
          <img
            src="/screenshots/drill.png"
            alt="A hand in the drill: six seats round the table, who raised and for how much, and your two cards."
            width={780}
            height={1688}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
          />
        </picture>
        {/* Fades the crop into the panel instead of ending on a cut line. The
            gradient reads --canvas, which `.panel-light` re-points to white. */}
        <div
          aria-hidden
          className="from-canvas pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent"
        />
      </div>
      <figcaption className="text-text-tertiary text-caption text-center">
        Every hand is graded against the solution, then explained.
      </figcaption>
    </figure>
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
  const { label, amountCents, billedLabel } = PLANS[plan];
  const isAnnual = plan === "annual";

  const card = (
    <label
      className={cn(
        // No `.tap-target` here: the card is already far larger than 44px, and
        // that class's ::before overlay would sit on top of its own radio.
        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 transition-colors",
        selected
          ? "border-accent bg-surface-2"
          : "border-border bg-surface-1 hover:border-border-strong",
        // The ribbon supplies the top edge, so the card must not draw its own.
        isAnnual && "rounded-t-none border-t-0",
      )}
      data-plan={plan}
      data-selected={selected}
    >
      {/* Name over the real charge, on the left. */}
      <span className="flex min-w-0 flex-col">
        <span className="text-heading-md font-semibold">{label}</span>
        <span className="text-text-tertiary text-caption mt-0.5 font-mono tabular-nums">
          {formatUsd(amountCents)} {billedLabel}
        </span>
      </span>

      {/* The comparable number and the selector, on the right. */}
      <span className="flex shrink-0 items-center gap-3">
        <span className="text-heading-lg sm:text-display-md font-mono font-semibold tabular-nums">
          {formatUsd(perMonthCents(plan))}
          <span className="text-text-tertiary text-body-md font-sans font-normal">/mo</span>
        </span>

        {/*
         * A real radio, styled as the reference's check circle. The tick is a
         * sibling revealed by `peer-checked` rather than a background image,
         * because the input has to stay a genuine `input[type=radio]` — an
         * e2e counts them, and a div with a click handler is not a control a
         * screen reader can describe or a keyboard can move between.
         */}
        <span className="relative grid shrink-0 place-items-center">
          <input
            type="radio"
            name="plan"
            value={plan}
            checked={selected}
            onChange={onSelect}
            className="peer border-border-strong checked:border-accent checked:bg-accent size-6 appearance-none rounded-full border-2 transition-colors"
          />
          <span
            aria-hidden
            className="text-on-accent text-caption pointer-events-none absolute leading-none opacity-0 peer-checked:opacity-100"
          >
            ✓
          </span>
        </span>
      </span>
    </label>
  );

  if (!isAnnual) return card;

  /**
   * The ribbon, and the only place the saving is stated.
   *
   * It replaced a struck-through annualised price inside the card. Stated as a
   * NUMBER rather than "best value" alone — the claim is arithmetic the reader
   * can check against the two prices directly under it, and a superlative with
   * nothing behind it is what every discount banner on the internet has already
   * spent. The honest half of the old design survives as the "billed yearly"
   * line: the headline is per month, the real charge is right beneath it.
   */
  return (
    <div className="flex flex-col">
      <p className="bg-accent text-on-accent text-overline rounded-t-lg px-4 py-1.5 text-center font-semibold tracking-widest uppercase">
        Best value — Save {savingPercent()}%
      </p>
      {card}
    </div>
  );
}
