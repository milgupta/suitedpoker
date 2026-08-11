"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { RingGauge } from "@/components/ui/ring-gauge";
import { StatTile } from "@/components/ui/stat-tile";
import { evColor } from "@/lib/ev-color";
import { MIN_HANDS_FOR_LEAKS, MIN_HANDS_FOR_STATS } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/dashboard-server";
import { cn } from "@/lib/utils";

/**
 * Progress — the numbers that used to live under the fold on Home.
 *
 * Same arithmetic as before (`loadDashboard`); only the route changed so Home
 * can answer "what now?" without a wall of stats.
 */

export interface ProgressViewProps {
  data: DashboardData;
}

export function ProgressView({ data }: ProgressViewProps) {
  const hasData = data.totalHands > 0;
  const statsAreEarly = data.totalHands > 0 && data.totalHands < MIN_HANDS_FOR_STATS;
  const handsToReliable = Math.max(0, MIN_HANDS_FOR_STATS - data.totalHands);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-16" data-progress>
      <header className="flex flex-col gap-1">
        <h1 className="text-display-md">Progress</h1>
        <p className="text-text-secondary text-body-md">
          Your rating, leaks, and the numbers behind them.
        </p>
      </header>

      {!hasData ? (
        <StartHere />
      ) : (
        <>
          {statsAreEarly && (
            <section
              className="border-border bg-surface-1 flex flex-col gap-3 rounded-lg border p-5"
              data-section="sample-gate"
            >
              <h2 className="text-heading-lg">Building a reliable picture</h2>
              <p className="text-text-secondary text-body-md">
                {handsToReliable} more decision{handsToReliable === 1 ? "" : "s"} until these
                numbers stop being early estimates. You&rsquo;re at {data.totalHands} of{" "}
                {MIN_HANDS_FOR_STATS}.
              </p>
              <div
                className="bg-surface-2 h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={data.totalHands}
                aria-valuemin={0}
                aria-valuemax={MIN_HANDS_FOR_STATS}
                aria-label="Hands toward a reliable report"
              >
                <div
                  className="bg-accent h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (data.totalHands / MIN_HANDS_FOR_STATS) * 100)}%`,
                  }}
                />
              </div>
              <Button variant="accent" size="lg" className="w-full" asChild>
                <Link href="/arena">Continue in Arena</Link>
              </Button>
            </section>
          )}

          <section className="flex flex-col gap-3" data-section="rating">
            <div className="flex items-center justify-between">
              <h2 className="text-overline text-text-tertiary uppercase">Rating</h2>
              <span className="text-text-tertiary text-caption">{data.tier}</span>
            </div>
            <p className="text-display-lg font-mono tabular-nums">
              <AnimatedNumber value={data.rating ?? 0} />
            </p>
            <Sparkline points={data.ratingSparkline} />
          </section>

          <section className="flex flex-col gap-3" data-section="leaks">
            <h2 className="text-heading-lg">Your leaks</h2>
            {data.leaks.length === 0 ? (
              <p className="text-text-secondary text-body-md">
                {data.hasEnoughForLeaks
                  ? "Nothing crossed the threshold yet — keep playing and I'll name the first one."
                  : `Play ${MIN_HANDS_FOR_LEAKS} hands and I'll find your leaks. You're at ${data.totalHands}.`}
              </p>
            ) : (
              data.leaks.map((leak) => (
                <div
                  key={leak.key}
                  className="border-border bg-surface-1 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  data-leak={leak.key}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-label={`severity ${leak.severity} of 5`}
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ background: evColor(leak.severity) }}
                    />
                    <p className="text-body-md">{leak.description}</p>
                  </div>
                  <Button variant="accent" size="sm" asChild>
                    <Link href={leak.href}>Drill this</Link>
                  </Button>
                </div>
              ))
            )}
          </section>

          <section
            className="flex flex-col gap-3"
            data-section="numbers"
            data-early={statsAreEarly ? "true" : "false"}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-heading-lg">Your numbers</h2>
              {statsAreEarly && (
                <span className="text-text-tertiary text-caption">
                  Early estimate · {data.totalHands} hands
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Accuracy" value={data.accuracy * 100} suffix="%" stat="accuracy" />
              <StatTile label="VPIP" value={data.vpip * 100} suffix="%" stat="vpip" />
              <StatTile label="PFR" value={data.pfr * 100} suffix="%" stat="pfr" />
              <StatTile
                label="bb/100 lost"
                value={data.evLostPer100}
                decimals={1}
                stat="ev-loss"
                higherIsBetter={false}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3" data-section="streets">
            <h2 className="text-heading-lg">Where it goes wrong</h2>
            <div className="grid grid-cols-4 gap-2">
              {data.streets.map((street) => (
                <div
                  key={street.street}
                  className="flex flex-col items-center gap-2"
                  data-street={street.street}
                  data-attempts={street.attempts}
                >
                  <RingGauge
                    value={street.accuracy}
                    size={56}
                    label={`${street.street} accuracy`}
                  />
                  <span className="text-caption text-text-tertiary capitalize">
                    {street.street}
                  </span>
                  <span className="text-caption font-mono tabular-nums">
                    {street.attempts === 0 ? "—" : `${Math.round(street.accuracy * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3" data-section="week">
            <h2 className="text-heading-lg">This week</h2>
            <div className="grid grid-cols-2 gap-3">
              <WeekStat label="Hands" value={data.thisWeek.hands} previous={data.lastWeek.hands} />
              <WeekStat
                label="Accuracy"
                value={data.thisWeek.accuracy * 100}
                previous={data.lastWeek.accuracy * 100}
                suffix="%"
                decimals={0}
              />
              <WeekStat
                label="bb/100 lost"
                value={data.thisWeek.evLostPer100}
                previous={data.lastWeek.evLostPer100}
                decimals={1}
                higherIsBetter={false}
              />
              <WeekStat
                label="Minutes"
                value={data.thisWeek.minutesStudied}
                previous={data.lastWeek.minutesStudied}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StartHere() {
  return (
    <section
      className="border-border bg-surface-1 flex flex-col gap-3 rounded-lg border p-5"
      data-section="start-here"
    >
      <h2 className="text-heading-lg">Here&rsquo;s how to start</h2>
      <ol className="text-body-md text-text-secondary flex flex-col gap-2">
        <li>1. Play today&rsquo;s five hands. Three minutes, and it starts your streak.</li>
        <li>2. Read the first lesson. It is about position, and it changes everything.</li>
        <li>3. Drill twenty hands in the arena. Your numbers appear here once you do.</li>
      </ol>
      <Button variant="accent" size="lg" className="w-full" asChild>
        <Link href="/arena?preset=" data-cta="first-drill">
          Drill twenty hands
        </Link>
      </Button>
    </section>
  );
}

function WeekStat({
  label,
  value,
  previous,
  suffix = "",
  decimals = 0,
  higherIsBetter = true,
}: {
  label: string;
  value: number;
  previous: number;
  suffix?: string;
  decimals?: number;
  higherIsBetter?: boolean;
}) {
  const delta = value - previous;
  const better = higherIsBetter ? delta > 0 : delta < 0;
  const meaningful = Math.abs(delta) >= (decimals === 0 ? 1 : 0.1);

  return (
    <div className="border-border bg-surface-1 flex flex-col gap-1 rounded-lg border px-4 py-3">
      <span className="text-overline text-text-tertiary uppercase">{label}</span>
      <span className="text-heading-lg font-mono tabular-nums">
        {value.toFixed(decimals)}
        {suffix}
      </span>
      {meaningful && previous > 0 && (
        <span
          className={cn("text-caption font-mono tabular-nums")}
          style={{
            color: better ? "var(--color-grade-best)" : "var(--color-grade-inaccuracy)",
          }}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(decimals)} vs last week
        </span>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: readonly number[] }) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label="Rating over the last 30 days"
      data-sparkline={points.length}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
