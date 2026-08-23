"use client";

import Link from "next/link";
import { FrequencyBar } from "@/components/poker/FrequencyBar";
import { PlayingCard } from "@/components/poker/PlayingCard";
import {
  ActionDock,
  BoardBand,
  GameSurface,
  HeroDock,
  OpponentStrip,
} from "@/components/poker/surface";
import { HOW, SECTION_CTAS, STEPS } from "@/content/landing";
import { actionLabel } from "@/lib/action-label";
import { featuredCombo } from "@/lib/featured-combo";
import type { Showcase } from "@/lib/landing-showcase";
import { marketingContrast } from "@/lib/marketing-contrast";
import { cn } from "@/lib/utils";
import type { Combo } from "@/poker/range";

/**
 * One hand, three screens — the loop the rest of the page is selling.
 *
 * Step 1 is the real game surface (opponents, board, hero, actions), not a
 * cropped screenshot. Step 2 is the mix. Step 3 is the explanation, already
 * open — the previous version showed an unclicked Why? on a 100% fold.
 */
export function HowItWorks({ showcase }: { showcase: Showcase }) {
  const combo = featuredCombo(showcase.hand);
  const top = showcase.segments[0];
  const mixLine = showcase.segments
    .map((segment) => `${actionLabel(segment.action)} ${Math.round(segment.freq * 100)}%`)
    .join("  ·  ");

  return (
    <section id="how" data-section="how" className="ambient-host border-border border-t">
      <div
        aria-hidden
        className="ambient-blob ambient-blob--accent top-20 right-0 z-0 opacity-40"
        style={{ position: "absolute" }}
      />

      <div className="relative mx-auto max-w-(--container-app) px-6 py-20">
        <p className="text-accent-bright text-overline font-mono tracking-widest uppercase">
          {HOW.eyebrow}
        </p>
        <h2 className="text-display-md sm:text-display-lg mt-4 text-balance">{HOW.title}</h2>
        <p className="text-text-secondary text-body-lg mt-4 max-w-xl text-pretty">
          {HOW.lede} {showcase.handName}, {ledeSituation(showcase.situation)}.
        </p>

        <ol className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-8">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              /**
               * `min-w-0` is load-bearing, not tidying. A grid item defaults to
               * `min-width: auto`, so the table's min-content width — 404px —
               * won its own 327px track and the figure's `overflow-hidden`
               * silently ate 77px off the right edge. The page itself never
               * overflowed, so `sweep.spec.ts` stayed green throughout: its
               * check treats `overflow: hidden` as deliberate clipping.
               */
              className={cn("flex min-w-0 flex-col gap-5", index === 0 && "sm:col-span-2")}
            >
              <figure
                data-step={index + 1}
                className={cn(
                  "border-border-strong bg-surface-1 flex flex-1 flex-col overflow-hidden border",
                  "rounded-xl p-5",
                  /**
                   * Step 1 draws a six-seat table, whose narrowest honest
                   * layout is ~359px. Inside the section's `px-6` a 375px phone
                   * offers 327px, so it goes full-bleed below `sm` and takes
                   * the 48px of page gutter back. Scaling it down instead would
                   * put the seat labels under 10px.
                   */
                  index === 0 &&
                    "-mx-6 rounded-none border-x-0 px-2 sm:mx-0 sm:rounded-xl sm:border-x sm:px-5",
                )}
              >
                {index === 0 && top !== undefined ? (
                  <AnswerTable showcase={showcase} combo={combo} />
                ) : null}

                {index === 1 && top !== undefined ? (
                  <div className="flex flex-col gap-5">
                    <ShowcaseHand
                      combo={combo}
                      hand={showcase.hand}
                      situation={showcase.situation}
                    />
                    <div className="flex flex-col gap-3">
                      <FrequencyBar segments={marketingContrast(showcase.segments)} />
                      <p className="text-text-tertiary text-caption font-mono tabular-nums">
                        {mixLine}
                      </p>
                    </div>
                  </div>
                ) : null}

                {index === 2 && top !== undefined ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-heading-lg text-pretty">This one&apos;s a genuine mix.</p>
                    <p className="text-text-secondary text-body-md text-pretty">
                      {showcase.explanation}
                    </p>
                  </div>
                ) : null}
              </figure>

              <div className="hairline-top pt-5">
                <span className="text-text-tertiary text-body-sm font-mono tabular-nums">
                  Step {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-heading-lg mt-3">{step.title}</h3>
                <p className="text-text-secondary text-body-md mt-3 text-pretty">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* The section just showed a hand being answered; the CTA is the same
            verb. Bordered — the page's one lit button is the hero's. */}
        <Link
          href="/signup"
          data-cta="how"
          className="border-border text-text-primary hover:border-text-tertiary text-body-lg mt-12 inline-flex min-h-12 items-center justify-center rounded-full border px-7 font-medium transition"
        >
          {SECTION_CTAS.how}
        </Link>
      </div>
    </section>
  );
}

function ledeSituation(situation: string): string {
  return situation.charAt(0).toLowerCase() + situation.slice(1);
}

function AnswerTable({ showcase, combo }: { showcase: Showcase; combo: Combo | undefined }) {
  const { table } = showcase;

  return (
    <div className="pointer-events-none" data-how-table>
      <GameSurface
        className="h-auto max-w-none px-0"
        opponents={
          <div className="flex flex-col gap-3">
            <p className="text-text-primary text-body-md mx-auto max-w-md text-center font-medium text-balance">
              {table.situationLine}
            </p>
            <OpponentStrip seats={table.opponents} />
          </div>
        }
        board={
          <div className="flex flex-col gap-2">
            <BoardBand board={[]} potBb={showcase.potBb} />
            <p className="text-text-secondary text-body-sm mx-auto max-w-md text-center">
              {table.history}
            </p>
          </div>
        }
        hero={
          combo !== undefined ? (
            <HeroDock
              cards={combo}
              strengthLabel={table.strengthLabel}
              stackBb={showcase.effStackBb}
              betBb={table.heroBetBb}
              toAct
            />
          ) : null
        }
        actions={
          <ActionDock
            kind="actions"
            actions={showcase.legalActions.map((action) => ({
              id: action,
              label: actionLabel(action),
            }))}
            onAction={() => undefined}
          />
        }
      />
    </div>
  );
}

function ShowcaseHand({
  combo,
  hand,
  situation,
}: {
  combo: Combo | undefined;
  hand: string;
  situation: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {combo !== undefined ? (
        <div className="flex items-center gap-1.5" role="img" aria-label={hand}>
          <PlayingCard card={combo[0]} size="lg" />
          <PlayingCard card={combo[1]} size="lg" index={1} dealCount={2} />
        </div>
      ) : (
        <span className="border-border-strong bg-surface-2 text-heading-md rounded-md border px-3 py-1.5 font-mono tabular-nums">
          {hand}
        </span>
      )}
      <p className="text-text-secondary text-body-md text-pretty">{situation}</p>
    </div>
  );
}
