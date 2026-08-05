"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  AnimatedNumber,
  FadeUp,
  PageTransition,
  Shimmer,
  StaggerContainer,
  StaggerItem,
} from "@/components/motion";
import {
  DURATION_MS,
  EASE,
  SPRING,
  STAGGER_TOTAL_MS,
  VARIANT_PRESETS,
  staggerDelay,
  type VariantPresetName,
} from "@/lib/motion";

function ReplayButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-border-strong text-body-sm inline-flex min-h-11 items-center rounded-full border px-4 transition"
    >
      Replay {label}
    </button>
  );
}

function PresetDemo({ name }: { name: VariantPresetName }) {
  const reduced = useReducedMotion() ?? false;
  const [run, setRun] = useState(0);
  const variants = VARIANT_PRESETS[name](reduced);

  return (
    <div className="border-border bg-surface-1 flex items-center gap-4 rounded-lg border p-5">
      <div className="min-w-0 flex-1">
        <code className="text-body-sm">{name}</code>
        <div className="mt-3 h-16">
          <motion.div
            key={run}
            variants={variants}
            initial="hidden"
            animate="visible"
            className="bg-accent-800 border-border-strong text-caption text-text-primary flex h-16 w-full items-center justify-center rounded-md border"
          >
            {name}
          </motion.div>
        </div>
      </div>
      <ReplayButton label={name} onClick={() => setRun((r) => r + 1)} />
    </div>
  );
}

const PRESET_NAMES = Object.keys(VARIANT_PRESETS) as VariantPresetName[];

export function MotionLab() {
  const reduced = useReducedMotion() ?? false;
  const [fadeRun, setFadeRun] = useState(0);
  const [staggerRun, setStaggerRun] = useState(0);
  const [pageRun, setPageRun] = useState(0);
  const [statValue, setStatValue] = useState(12.4);

  return (
    <div className="flex flex-col gap-10">
      <div
        className="border-border-strong bg-surface-1 text-body-sm rounded-lg border p-5"
        role="status"
      >
        <span className="text-text-secondary">prefers-reduced-motion is currently </span>
        <strong
          style={{ color: reduced ? "var(--color-grade-inaccuracy)" : "var(--color-grade-best)" }}
        >
          {reduced ? "REDUCE — every primitive below is opacity-only" : "no-preference"}
        </strong>
      </div>

      <div>
        <h3 className="text-heading-md">Tokens</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <p className="text-overline text-text-tertiary uppercase">Springs</p>
            <ul className="mt-3 flex flex-col gap-1">
              {Object.entries(SPRING).map(([name, spring]) => (
                <li key={name} className="text-body-sm flex justify-between font-mono">
                  <span>{name}</span>
                  <span className="text-text-tertiary">
                    {spring.stiffness} / {spring.damping}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <p className="text-overline text-text-tertiary uppercase">Durations</p>
            <ul className="mt-3 flex flex-col gap-1">
              {Object.entries(DURATION_MS).map(([name, ms]) => (
                <li key={name} className="text-body-sm flex justify-between font-mono">
                  <span>{name}</span>
                  <span className="text-text-tertiary">{ms}ms</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <p className="text-overline text-text-tertiary uppercase">Easings</p>
            <ul className="mt-3 flex flex-col gap-1">
              {Object.entries(EASE).map(([name, points]) => (
                <li key={name} className="text-body-sm flex justify-between gap-4 font-mono">
                  <span>{name}</span>
                  <span className="text-text-tertiary truncate">{points.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <p className="text-overline text-text-tertiary uppercase">Stagger budget</p>
            <p className="text-text-secondary text-body-sm mt-3">
              Capped at {STAGGER_TOTAL_MS}ms total however many children there are.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {[4, 13, 169].map((n) => (
                <li key={n} className="text-body-sm flex justify-between font-mono">
                  <span>{n} children</span>
                  <span className="text-text-tertiary">
                    {(staggerDelay(n) * 1000).toFixed(1)}ms each
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-md">Variant presets</h3>
        <div className="mt-4 flex flex-col gap-3">
          {PRESET_NAMES.map((name) => (
            <PresetDemo key={name} name={name} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-heading-md">Primitives</h3>

        <div className="mt-4 flex flex-col gap-3">
          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <div className="flex items-center justify-between gap-4">
              <code className="text-body-sm">&lt;FadeUp&gt;</code>
              <ReplayButton label="FadeUp" onClick={() => setFadeRun((r) => r + 1)} />
            </div>
            <FadeUp key={fadeRun} delay={0.05}>
              <p className="text-text-secondary text-body-md mt-4">
                Rises 12px into place on the smooth spring.
              </p>
            </FadeUp>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <div className="flex items-center justify-between gap-4">
              <code className="text-body-sm">&lt;Stagger&gt;</code>
              <ReplayButton label="Stagger" onClick={() => setStaggerRun((r) => r + 1)} />
            </div>
            <StaggerContainer key={staggerRun} count={13} className="mt-4 grid grid-cols-13 gap-1">
              {Array.from({ length: 13 }, (_, i) => (
                <StaggerItem key={i}>
                  <span className="bg-accent-800 border-border-strong text-caption flex aspect-square items-center justify-center rounded-sm border font-mono">
                    {i + 1}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <div className="flex items-center justify-between gap-4">
              <code className="text-body-sm">&lt;AnimatedNumber&gt;</code>
              <button
                type="button"
                onClick={() =>
                  setStatValue((v) => Math.round((v === 12.4 ? -3.7 : 12.4) * 10) / 10)
                }
                className="border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-border-strong text-body-sm inline-flex min-h-11 items-center rounded-full border px-4 transition"
              >
                Change value
              </button>
            </div>
            <p className="text-display-md mt-4 font-mono">
              <AnimatedNumber value={statValue} decimals={1} signed suffix=" bb/100" />
            </p>
            <p className="text-text-tertiary text-caption mt-1">
              Springs between values with tabular numerals, so the layout does not jitter.
            </p>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <code className="text-body-sm">&lt;Shimmer&gt;</code>
            <div className="mt-4 flex flex-col gap-2">
              <Shimmer className="h-4 w-full" />
              <Shimmer className="h-4 w-3/4" />
              <Shimmer className="h-4 w-1/2" />
            </div>
          </div>

          <div className="border-border bg-surface-1 rounded-lg border p-5">
            <div className="flex items-center justify-between gap-4">
              <code className="text-body-sm">&lt;PageTransition&gt;</code>
              <ReplayButton label="PageTransition" onClick={() => setPageRun((r) => r + 1)} />
            </div>
            <PageTransition key={pageRun}>
              <p className="text-text-secondary text-body-md mt-4">
                Opacity only in both branches — a transform on a whole route is what makes an app
                feel slow.
              </p>
            </PageTransition>
          </div>
        </div>
      </div>
    </div>
  );
}
