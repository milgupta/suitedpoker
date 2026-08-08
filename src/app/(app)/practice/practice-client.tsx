"use client";

import { HubCard, HubCardGrid, HubCardMotion, HubFade } from "@/components/app/HubCard";

/**
 * Practice hub — one large card per game type.
 */

const HUB = {
  daily: "/brand/hub/hub-daily.png",
  arena: "/brand/hub/hub-arena.png",
  table: "/brand/hub/hub-table.png",
} as const;

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
            description="A full six-max session. Review the leaks after."
            cta="Sit down"
            imageSrc={HUB.table}
            dataQuick="Table sim"
          />
        </HubCardMotion>
      </HubCardGrid>
    </div>
  );
}
