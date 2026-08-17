"use client";

import Link from "next/link";
import { HubCard, HubCardGrid, HubCardMotion, HubFade } from "@/components/app/HubCard";
import { buildArenaLink } from "@/lib/arena-preset";
import { ArenaPreview, DailyPreview, QuizPreview } from "./practice-previews";

/**
 * Practice hub — one large card per game type, plus opt-in deeper presets.
 */

/*
 * Both focus sessions are longer than their pools (13 postflop templates,
 * 8 vs-3bet nodes), which is fine ONLY because the server's recency window
 * cycles the whole pool before any situation repeats — a repeat arrives with a
 * different dealt hand, at least a full pool-cycle later. If a pool ever
 * shrinks below ~5, shorten the session instead of trusting the window.
 */
const POSTFLOP_FOCUS = buildArenaLink({
  config: { type: "postflop", tags: ["dry", "ace-high", "wet", "connected"] },
  length: 20,
  label: "Postflop focus",
});

const THREEBET_FOCUS = buildArenaLink({
  config: { type: "preflop", tags: ["3bet"] },
  length: 20,
  label: "3-bet pots",
});

export function PracticeView() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-16" data-practice>
      <HubFade>
        <header className="flex flex-col gap-1">
          <h1 className="text-display-md">Practice</h1>
          <p className="text-text-secondary text-body-md">
            Pick a mode. Every decision is graded against the same solutions.
          </p>
        </header>
      </HubFade>

      {/*
       * FOUR modes, so a 2x2 rather than a three-wide row with an orphan
       * underneath it. Four across would work on a desktop and squeeze every
       * preview; everything stacks at 390px either way.
       */}
      <HubCardGrid count={4} className="grid gap-4 md:grid-cols-2">
        <HubCardMotion index={0}>
          <HubCard
            href="/daily"
            title="Daily challenge"
            description="Five hands, one streak. About three minutes."
            cta="Play today's five"
            preview={<DailyPreview />}
            dataCta="daily"
            dataQuick="Daily"
          />
        </HubCardMotion>
        <HubCardMotion index={1}>
          <HubCard
            href="/arena"
            title="Arena"
            description="Twenty-hand adaptive sessions. Difficulty follows your rating."
            cta="Open arena"
            preview={<ArenaPreview />}
            dataQuick="Arena"
          />
        </HubCardMotion>
        <HubCardMotion index={2}>
          <HubCard
            href="/table"
            title="Table sim"
            description="A five-handed table session. Review the leaks after."
            cta="Sit down"
            imageSrc="/brand/hub/hub-table-sim.png"
            imageAlt="Table sim match in progress"
            dataQuick="Table sim"
          />
        </HubCardMotion>
        <HubCardMotion index={3}>
          <HubCard
            href="/quiz"
            title="Poker maths"
            description="Ten questions on odds and outs. The only answers here are exact."
            cta="Start a set"
            preview={<QuizPreview />}
            dataQuick="Poker maths"
            dataCta="quiz"
          />
        </HubCardMotion>
      </HubCardGrid>

      <HubFade>
        <section className="flex flex-col gap-3" data-section="go-deeper">
          <h2 className="text-heading-md">Go deeper</h2>
          <p className="text-text-secondary text-body-sm">
            Optional focus sessions and the advanced module — after the basics, not instead of them.
          </p>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <li>
              <Link
                href={POSTFLOP_FOCUS}
                className="text-accent-bright text-body-md underline-offset-4 hover:underline"
                data-cta="postflop-focus"
              >
                Postflop focus (20)
              </Link>
            </li>
            <li className="text-text-tertiary hidden sm:inline" aria-hidden>
              ·
            </li>
            <li>
              <Link
                href={THREEBET_FOCUS}
                className="text-accent-bright text-body-md underline-offset-4 hover:underline"
                data-cta="threebet-focus"
              >
                3-bet pots (20)
              </Link>
            </li>
            <li className="text-text-tertiary hidden sm:inline" aria-hidden>
              ·
            </li>
            <li>
              <Link
                href="/learn/playing-harder-spots/three-bet-pots"
                className="text-accent-bright text-body-md underline-offset-4 hover:underline"
                data-cta="advanced-module"
              >
                Playing harder spots
              </Link>
            </li>
          </ul>
        </section>
      </HubFade>
    </div>
  );
}
