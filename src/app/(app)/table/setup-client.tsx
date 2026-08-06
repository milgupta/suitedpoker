"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics-client";
import { PRESET_IDS, PRESETS, SESSION_LENGTHS, type PresetId, type SessionLength } from "@/lib/sim";
import { PROFILES } from "@/poker/bots";
import { cn } from "@/lib/utils";

export function TableSetupClient() {
  const router = useRouter();
  const [preset, setPreset] = useState<PresetId>("casino");
  const [hands, setHands] = useState<SessionLength>(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/sim/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset, hands }),
      });

      if (!response.ok) {
        setError(
          response.status === 402
            ? "Your subscription has lapsed."
            : "Could not start the session. Try again.",
        );
        setBusy(false);
        return;
      }

      const { state } = (await response.json()) as { state: { sessionId: string } };
      capture("sim_session_started", { tableType: preset });
      router.push(`/table/play?session=${state.sessionId}`);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-md">Pick your table</h1>
        <p className="text-text-secondary text-body-md mt-2">
          Every table is a different lesson. Play it like the money is real.
        </p>
      </header>

      <div role="radiogroup" aria-label="Table" className="flex flex-col gap-3">
        {PRESET_IDS.map((id) => {
          const p = PRESETS[id];
          const selected = preset === id;
          const lineup = summarizeLineup(p.villains);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-preset={id}
              onClick={() => setPreset(id)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-accent bg-surface-2"
                  : "border-border bg-surface-1 hover:border-border-strong",
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-body-lg font-semibold">{p.name}</span>
                <span className="text-text-tertiary text-caption font-mono">{lineup}</span>
              </span>
              <span className="text-text-secondary text-body-sm">{p.teaches}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-overline text-text-tertiary uppercase">Session length</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Hands">
          {SESSION_LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              role="radio"
              aria-checked={hands === length}
              onClick={() => setHands(length)}
              className={cn(
                "tap-target flex-1 rounded-md border px-3 py-2 font-mono text-sm tabular-nums transition-colors",
                hands === length
                  ? "border-accent bg-surface-2 text-text-primary"
                  : "border-border bg-surface-1 text-text-secondary hover:border-border-strong",
              )}
            >
              {length} hands
            </button>
          ))}
        </div>
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="border-danger-border bg-danger-fill text-danger-bright text-body-md rounded-md border px-3 py-2"
        >
          {error}
        </p>
      )}

      <Button
        data-testid="start-session"
        variant="accent"
        size="lg"
        className="w-full"
        loading={busy}
        onClick={() => void start()}
      >
        Sit down
      </Button>
    </div>
  );
}

function summarizeLineup(villains: readonly (keyof typeof PROFILES)[]): string {
  const counts = new Map<string, number>();
  for (const id of villains) {
    const name = PROFILES[id].name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(" · ");
}
