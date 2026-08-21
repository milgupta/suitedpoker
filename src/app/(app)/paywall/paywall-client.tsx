"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { ProofMarquee } from "@/components/ProofMarquee";
import { PROOF_MODE } from "@/content/testimonials";
import { capture, isAnalyticsConfigured } from "@/lib/analytics-client";
import type { DemoHandRecord } from "@/lib/demo-hand";
import type { Diagnosis } from "@/lib/diagnosis";
import { DecisionShowcase } from "@/components/marketing/DecisionShowcase";
import type { Showcase } from "@/lib/landing-showcase";
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
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The paywall.
 *
 * ONE COLUMN, capped and centred. It was a two-column grid with a product
 * screenshot on the left; the shot came out, and a lone purchase column left
 * in a 60rem grid reads as a form with something missing beside it.
 *
 * The CTA still has an e2e asserting it sits above 844px at 390px wide — that
 * was the reason the purchase column came first in the DOM, and it is the
 * reason nothing may be added above the plan cards without re-running it.
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
 *      /mo" reads far smaller than "$73.99"; the "billed yearly" line beneath
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
  /** The user's biggest leak, in bb/100. Shown as loss framing when present. */
  leakBb100?: number | null;
  leakLabel?: string | null;
  /**
   * The plan built from their quiz answers. Null when the quiz is unfinished,
   * when the profile lookup failed, or for a logged-out visitor — all three of
   * which render the page exactly as it was before this existed.
   */
  plan?: Diagnosis | null;
  /** One real hand and its real mix, rendered live rather than screenshotted. */
  showcase?: Showcase | null;
  /** 7.2b’s graded hand, when they played one. */
  demoHand?: DemoHandRecord | null;
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

// `leakBb100`, `leakLabel` and `demoHand` are still supplied by the page and
// still on the props above, but nothing reads them: the headline became the
// subscriber stat, and the graded-hand recap was removed from the plan band.
// Left plumbed rather than ripped out — the profile lookup that feeds them is
// already paid for, and each is one line away if the copy changes back. Not
// destructured, so the unused-variable lint stays quiet.
//
// The plan band sits ABOVE the plan cards, and the CTA has an e2e asserting it
// clears 844px at 390px wide.
export function PaywallClient({ plan = null, showcase = null }: PaywallClientProps) {
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
    const abandonedPlan = PLAN_IDS.find((id) => id === raw);
    // Fall back to the default selection rather than dropping the event: a
    // missing plan is worth less than a missing drop-off.
    capture("checkout_abandoned", { plan: abandonedPlan ?? "annual" });
  }, [cancelled, params]);

  /**
   * `diagnosis_viewed` and the Meta `ViewContent` used to fire from the
   * `/diagnosis` page. They fire here now, guarded on the band actually
   * rendering, because that is the moment the diagnosis is genuinely seen.
   *
   * Kept rather than retired: the PostHog funnel in docs/POSTHOG-INSIGHTS.md
   * counts this step, and a step that silently stops emitting looks like a
   * collapse in conversion rather than a page that moved. `annualCost` is
   * reported as 0 — the band deliberately shows no dollar figure, and sending
   * one for a number nobody was shown would make the property a fiction.
   */
  const planReported = useRef(false);
  useEffect(() => {
    if (plan === null || planReported.current) return;
    planReported.current = true;

    trackDeduplicated("ViewContent", { content_name: "diagnosis" });
    capture("diagnosis_viewed", { primaryLeak: plan.leakKey, annualCost: 0 });
  }, [plan]);

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
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10">
        {/* THE WHITE PANEL IS FIRST IN THE DOM, always. There is an e2e
          asserting the CTA clears 844px at 390px wide, and DOM order is what
          decides that on a phone. Grid placement moves it right on a wide
          screen without moving it down on a narrow one. */}
        <div className="panel-light rounded-xl p-6 sm:p-10 lg:col-start-2 lg:row-start-1">
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-6">
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
                    <span className="text-accent-bright">92%</span> of Suited Poker subscribers
                    improved their game
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
                    href="/legal/terms"
                    className="hover:text-text-secondary underline underline-offset-4"
                  >
                    Terms
                  </Link>
                  <Link
                    href="/legal/privacy"
                    className="hover:text-text-secondary underline underline-offset-4"
                  >
                    Privacy
                  </Link>
                </footer>
              </section>
            </div>
          </div>
        </div>

        {/* ── The showcase column ────────────────────────────────────────── */}
        {/*
         * A LIVE COMPONENT, NOT A SCREENSHOT.
         *
         * This replaced the "Your plan" band, and a phone screenshot was the
         * first thing tried in its place. Cropping a 780x1688 capture into a
         * column gives you the app's HEADER — a nav bar and a progress
         * counter — because that is what sits at the top of a phone screen.
         * The interesting part is always in the middle, at a different offset
         * per shot, so no single crop rule works.
         *
         * Rendering the real components instead is rectangular, sharp at any
         * width, needs no `npm run screenshots` to stay current, and cannot
         * drift from the strategy: the hand, the split and the sentence all
         * come from the same solution file the drill grades against.
         */}
        {showcase !== null && <ShowcaseCard showcase={showcase} />}
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
 * The showcase, as a card from the app rather than a panel of the page.
 *
 * OUTSIDE `.panel-light`, deliberately. Rendering it inside the white panel
 * meant either living with light-panel colours — which made a poker hand look
 * like a spreadsheet — or adding a second token scope to undo the first. Moving
 * it out is simpler than both: on the page's own dark canvas it uses the
 * ordinary app tokens, so this is literally the same surface treatment as every
 * card inside the product. That is the point. The reader sees the thing they
 * are buying next to the price, not an illustration of it.
 *
 * ANIMATED ON SCROLL, NOT ON MOUNT. The cards deal in and the frequency bar
 * fills from zero — both already built into `PlayingCard` and `FrequencyBar`.
 * On a phone this card sits below the fold, so mounting-time animation plays to
 * nobody and the reader arrives at a static image. `whileInView` with
 * `once: true` spends the animation at the moment it is actually seen.
 *
 * `key` is bound to the viewport trigger so the children remount and replay
 * their own entrances; without it the bar is already full by the time the card
 * scrolls in.
 */
function ShowcaseCard({ showcase }: { showcase: Showcase }) {
  const reduced = useReducedMotion() ?? false;
  const [seen, setSeen] = useState(false);

  return (
    <motion.aside
      className="lg:col-start-1 lg:row-start-1"
      data-showcase
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={reduced ? { duration: 0 } : SPRING.smooth}
      onViewportEnter={() => {
        setSeen(true);
      }}
    >
      <div className="border-border bg-surface-1 rounded-xl border p-5 sm:p-6">
        {seen || reduced ? (
          <DecisionShowcase showcase={showcase} />
        ) : (
          <div className="h-[13.5rem]" />
        )}
      </div>
      <p className="text-text-tertiary text-caption mt-3 text-center">
        One real hand from the trainer, with the strategy it is graded against.
      </p>
    </motion.aside>
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
