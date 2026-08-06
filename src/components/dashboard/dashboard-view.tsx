"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { RingGauge } from "@/components/ui/ring-gauge";
import { StatTile } from "@/components/ui/stat-tile";
import { Streak } from "@/components/ui/streak";
import { evColor } from "@/lib/ev-color";
import { MIN_HANDS_FOR_LEAKS } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/dashboard-server";
import { cn } from "@/lib/utils";

/**
 * The dashboard.
 *
 * Above the fold at 390x844 is exactly three things — greeting, the daily
 * challenge, and continue learning — because that is the whole answer to "what
 * do I do right now?". Everything else is a scroll for the user who wants it.
 *
 * The other rule here is that a brand-new paying user must never meet a wall of
 * zeros. Before there is data, the stats are replaced by a path: play the
 * daily, read the lesson, and come back. Zeros on day one read as "this thing
 * is empty", and that is a refund.
 */

export interface DashboardViewProps {
  data: DashboardData;
  email: string | null;
}

export function DashboardView({ data, email }: DashboardViewProps) {
  /**
   * A greeting, not an identifier.
   *
   * Falling back to the email's local part means unbroken strings like
   * `christopherjohnson1985` — no spaces, no wrap points — which overflowed the
   * heading and pushed the whole page sideways at 390px. Capped and allowed to
   * break: a name is a courtesy, and no courtesy is worth a broken layout.
   */
  const name = displayNameFor(data.displayName, email);
  const hasData = data.totalHands > 0;

  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-6 pb-20" data-dashboard>
      {/*
        THE FOLD.
        These three own the first screen on a phone: who you are, the one thing
        to do now, and where you left off. The min-height reserves the viewport
        so statistics can never creep up into it as cards change size — the
        question above the fold is "what now?", and a number is not an answer.
      */}
      <div
        className="flex flex-col gap-6 sm:min-h-0"
        // Only the shell's TOP padding sits above this block, so subtracting
        // both would end it a gap short of the fold — which is exactly how the
        // rating card crept up into it.
        style={{ minHeight: "calc(100dvh - var(--app-shell-py))" }}
        data-fold
      >
        {/* 1 · Greeting */}
        <header data-section="greeting">
          <h1 className="text-display-md break-words">
            {data.greeting}
            {name === "" ? "" : `, ${name}`}
          </h1>
          {data.goal !== null && (
            <p className="text-text-secondary text-body-md mt-1">Working toward: {data.goal}</p>
          )}
        </header>

        {/* 2 · The daily. The most prominent thing on the screen. */}
        <section
          className="border-border bg-surface-1 flex flex-col gap-4 rounded-lg border p-5"
          data-section="daily"
        >
          {data.dailyDoneToday ? (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-overline text-text-tertiary uppercase">
                  Today&rsquo;s challenge
                </h2>
                <Streak days={data.streak} />
              </div>
              <p className="text-display-lg font-mono tabular-nums">
                <AnimatedNumber value={data.dailyScore ?? 0} />
                <span className="text-text-tertiary text-body-lg font-sans"> points</span>
              </p>
              <p className="text-text-secondary text-body-md">
                Done for today. The next one lands at midnight.
              </p>
              <Button variant="ghost" size="lg" className="w-full" asChild>
                <Link href="/daily">See the leaderboard</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-heading-lg">Today&rsquo;s challenge</h2>
                <Streak days={data.streak} />
              </div>
              <p className="text-text-secondary text-body-md">5 hands · about 3 minutes</p>
              <Button variant="accent" size="lg" className="w-full" asChild>
                <Link href="/daily" data-cta="daily">
                  Play today&rsquo;s five
                </Link>
              </Button>
            </>
          )}
        </section>

        {/* 3 · Continue learning */}
        {data.nextLessonHref !== null && (
          <section
            className="border-border bg-surface-1 flex items-center gap-4 rounded-lg border p-4"
            data-section="continue"
          >
            <RingGauge
              value={data.courseFraction}
              size={48}
              label={`${Math.round(data.courseFraction * 100)}% of the course`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-overline text-text-tertiary uppercase">Continue learning</p>
              <p className="text-body-lg truncate">{data.nextLessonTitle}</p>
            </div>
            <Button variant="primary" size="sm" asChild>
              <Link href={data.nextLessonHref} data-cta="lesson">
                Open
              </Link>
            </Button>
          </section>
        )}
      </div>

      {/* ── Everything below here is a scroll ─────────────────────────────── */}

      {!hasData ? (
        <StartHere />
      ) : (
        <>
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

          <section className="flex flex-col gap-3" data-section="numbers">
            <h2 className="text-heading-lg">Your numbers</h2>
            {/* Every tile carries an (i). A beginner reading "VPIP 33%" with no
                definition and no target has learned nothing. */}
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
                    {/* No attempts means no verdict — never tell someone they
                        are bad at something they have not tried. */}
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

      <section className="flex flex-col gap-3" data-section="actions">
        <h2 className="text-heading-lg">Jump in</h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction href="/arena" label="Arena" />
          <QuickAction href="/table" label="Table sim" />
          <QuickAction href="/ranges" label="Ranges" />
        </div>
      </section>
    </div>
  );
}

const MAX_NAME = 18;

export function displayNameFor(displayName: string | null, email: string | null): string {
  const raw = displayName ?? email?.split("@")[0] ?? "";
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  return trimmed.length <= MAX_NAME ? trimmed : `${trimmed.slice(0, MAX_NAME - 1)}…`;
}

/** The brand-new-user screen: a path, not a wall of zeros. */
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

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      data-quick={label}
      className="border-border bg-surface-1 hover:border-accent flex min-h-[56px] items-center justify-center rounded-md border text-sm transition-colors"
    >
      {label}
    </Link>
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

/** A 30-point rating line. Flat means "did not play", never a cliff to zero. */
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
