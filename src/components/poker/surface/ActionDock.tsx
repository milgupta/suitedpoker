"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { actionGridClass } from "@/lib/action-grid";
import { cn } from "@/lib/utils";
import { clampSize, formatBb, sizePresets, SIZE_STEP_BB, type ActionDockSizing } from "./sizing";

/**
 * The action bar — DESIGN.md §6.4.
 *
 * Three shapes, one height. `waiting` is a single quiet pill exactly as tall
 * as the button row, so swapping between them causes zero layout shift —
 * "never an empty gap where buttons were".
 *
 * The sizing expander (sim only) swaps the row IN PLACE — no modal, no sheet.
 * Drills never pass `sizing`: graded actions must stay exactly the chart's
 * actions, and a slider would make the grade ambiguous.
 */

export interface DockAction {
  /** The engine identifier. Goes on `data-action` and to the server, never on screen. */
  id: string;
  /** What a person reads: "Call 2", "Raise to 6". */
  label: string;
  disabled?: boolean;
  /**
   * Sim only: tapping this action opens the sizing expander instead of firing
   * `onAction`, so "Raise" can be a labelled button rather than a bare icon.
   * Requires `sizing`; when any action carries it, the standalone expander
   * button is not rendered — two entry points to one panel is clutter.
   */
  opensSizing?: boolean;
}

export type ActionDockProps =
  | {
      kind: "actions";
      actions: readonly DockAction[];
      onAction: (id: string) => void;
      /** Present in the sim only. Its absence IS the drill contract. */
      sizing?: ActionDockSizing;
      /** Styleguide hook: open the expander without a click. */
      defaultExpanded?: boolean;
      className?: string;
    }
  | {
      kind: "waiting";
      label?: string;
      className?: string;
    };

/**
 * Shared by both modes and asserted in a unit test: the waiting pill and the
 * action row must occupy the same height or the swap between them shifts
 * everything above.
 */
export const ACTION_DOCK_ROW_CLASS = "min-h-14";

function WaitingPill({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn(ACTION_DOCK_ROW_CLASS, "w-full", className)} data-action-dock="waiting">
      <div className="border-border-subtle bg-surface-1 text-text-tertiary text-body-md flex h-14 w-full items-center justify-center rounded-full border">
        {label}
      </div>
    </div>
  );
}

/**
 * Keyed on the legal window by its caller, so new bounds remount it and the
 * amount can never survive a street it is no longer legal on. A remount
 * beats an effect: there is no frame in which a stale amount is on screen.
 */
function SizingPanel({ sizing, onClose }: { sizing: ActionDockSizing; onClose: () => void }) {
  const [amountBb, setAmountBb] = useState(() =>
    clampSize(sizing.minTo, sizing.minTo, sizing.maxTo),
  );

  const presets = sizePresets(sizing);

  return (
    <div className="flex w-full flex-col gap-2" data-action-dock-sizing>
      <div className="flex h-14 items-center gap-2">
        <span
          className="text-text-primary text-body-lg w-[4.5rem] shrink-0 text-center font-mono font-semibold tabular-nums"
          data-sizing-amount
        >
          {formatBb(amountBb)}
        </span>
        <input
          type="range"
          className="accent-accent h-11 w-full min-w-0 flex-1 cursor-pointer"
          min={sizing.minTo}
          max={sizing.maxTo}
          step={SIZE_STEP_BB}
          value={amountBb}
          aria-label="Bet size in big blinds"
          aria-valuetext={`${formatBb(amountBb)}`}
          onChange={(event) =>
            setAmountBb(clampSize(Number(event.target.value), sizing.minTo, sizing.maxTo))
          }
        />
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Cancel bet sizing"
          data-sizing-cancel
          onClick={onClose}
        >
          <span aria-hidden>×</span>
        </Button>
        <Button
          variant="primary"
          size="icon-lg"
          aria-label={`Confirm bet of ${formatBb(amountBb)}`}
          data-sizing-confirm
          onClick={() => {
            sizing.onConfirm(amountBb);
            onClose();
          }}
        >
          <span aria-hidden>↑</span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            variant="ghost"
            size="sm"
            className="text-body-sm px-2"
            data-sizing-preset={preset.id}
            onClick={() => setAmountBb(clampSize(preset.amountBb, sizing.minTo, sizing.maxTo))}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ActionsRow({
  actions,
  onAction,
  sizing,
  defaultExpanded = false,
  className,
}: {
  actions: readonly DockAction[];
  onAction: (id: string) => void;
  sizing?: ActionDockSizing;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = expanded && sizing !== undefined;
  const hasSizingAction = sizing !== undefined && actions.some((a) => a.opensSizing === true);

  return (
    <div className={cn(ACTION_DOCK_ROW_CLASS, "w-full", className)} data-action-dock="actions">
      {open ? (
        <SizingPanel
          key={`${sizing.minTo}:${sizing.maxTo}`}
          sizing={sizing}
          onClose={() => setExpanded(false)}
        />
      ) : (
        <div className="flex w-full gap-2">
          <div className={cn("grid flex-1 gap-2", actionGridClass(actions.length))}>
            {actions.map((action) => (
              <Button
                key={action.id}
                variant="action"
                size="action"
                // body-md below `sm`: three buttons across 358px give each
                // ~110px, and at body-lg "Raise to 2.5" truncated its own
                // amount — a cut-off number misprices the action it names.
                className="text-body-md sm:text-body-lg min-w-0 px-2"
                data-action={action.id}
                disabled={action.disabled}
                onClick={() =>
                  action.opensSizing === true && sizing !== undefined
                    ? setExpanded(true)
                    : onAction(action.id)
                }
              >
                <span className="truncate">{action.label}</span>
              </Button>
            ))}
          </div>
          {sizing !== undefined && !hasSizingAction && (
            <Button
              variant="action"
              size="action"
              className="w-14 shrink-0 px-0"
              aria-label="Choose a bet size"
              data-sizing-expander
              onClick={() => setExpanded(true)}
            >
              <span aria-hidden>↑</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionDock(props: ActionDockProps) {
  if (props.kind === "waiting") {
    return (
      <WaitingPill label={props.label ?? "Waiting for the next hand"} className={props.className} />
    );
  }
  return (
    <ActionsRow
      actions={props.actions}
      onAction={props.onAction}
      sizing={props.sizing}
      defaultExpanded={props.defaultExpanded}
      className={props.className}
    />
  );
}
