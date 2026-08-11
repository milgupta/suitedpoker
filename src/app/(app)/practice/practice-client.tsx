"use client";

import Link from "next/link";
import { HubCard, HubCardGrid, HubCardMotion, HubFade } from "@/components/app/HubCard";
import { buildArenaLink } from "@/lib/arena-preset";

/**
 * Practice hub — one large card per game type, plus opt-in deeper presets.
 */

const HUB = {
  daily: "/brand/hub/hub-daily.png",
  arena: "/brand/hub/hub-arena.png",
  table: "/brand/hub/hub-table.png",
} as const;

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

      <HubCardGrid count={3} className="grid gap-4 md:grid-cols-3">
        <HubCardMotion>
          <HubCard
            href="/daily"
            title="Daily challenge"
            description="Five hands, one streak. About three minutes."
            cta="Play today's five"
            imageSrc={HUB.daily}
            dataCta="daily"
            dataQuick="Daily"
          />
        </HubCardMotion>
        <HubCardMotion>
          <HubCard
            href="/arena"
            title="Arena"
            description="Endless adaptive drills. Difficulty follows your rating."
            cta="Open arena"
            imageSrc={HUB.arena}
            dataQuick="Arena"
          />
        </HubCardMotion>
        <HubCardMotion>
          <HubCard
            href="/table"
            title="Table sim"
            description="A five-handed table session. Review the leaks after."
            cta="Sit down"
            imageSrc={HUB.table}
            dataQuick="Table sim"
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
