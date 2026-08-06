import type { Metadata } from "next";
import { loadCostReport } from "@/lib/ai/costs-server";
import { SOFT_CAP_FRACTION } from "@/lib/ai/budget";
import { RingGauge } from "@/components/ui/ring-gauge";

export const metadata: Metadata = {
  title: "AI costs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Today's AI spend, and who is spending it.
 *
 * The two numbers that matter are the ring (are we about to hit the cap?) and
 * the heaviest users table (is one person doing this?). Everything else is
 * context for those two questions.
 */
export default async function AdminCostsPage() {
  const report = await loadCostReport();
  const { budget } = report;

  const percent = Math.min(100, Math.round(budget.fraction * 100));
  const drift = Math.abs(report.ledgerSpendUsd - budget.spentUsd);

  return (
    <div className="pb-16">
      <h1 className="text-heading-lg">AI costs · {budget.day} UTC</h1>

      <section className="mt-6 flex items-center gap-6">
        <RingGauge
          value={percent}
          size={96}
          label={`${percent}% of the daily AI budget spent`}
          // The grade ramp, used here for a genuine "how bad is this" reading
          // rather than for a poker decision — the one non-poker place it fits.
          color={
            budget.level === "hard"
              ? "var(--color-grade-blunder)"
              : budget.level === "soft"
                ? "var(--color-grade-inaccuracy)"
                : "var(--color-accent)"
          }
        >
          <span className="text-heading-md tabular-nums">{percent}%</span>
        </RingGauge>

        <dl className="space-y-2">
          <Stat label="Spent today" value={usd(budget.spentUsd)} />
          <Stat label="Daily budget" value={usd(budget.budgetUsd)} />
          <Stat
            label="Breaker"
            value={
              budget.level === "hard"
                ? "HARD — all generation off"
                : budget.level === "soft"
                  ? `SOFT — cheap paths templated (from ${Math.round(SOFT_CAP_FRACTION * 100)}%)`
                  : "normal"
            }
          />
        </dl>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Calls" value={String(report.calls)} />
        <Tile label="Cache hit rate" value={`${Math.round(report.cacheHitRate * 100)}%`} />
        <Tile label="Active users" value={String(report.activeUsers)} />
        <Tile label="Cost / active user" value={usd(report.costPerActiveUserUsd)} />
      </section>

      {drift > 0.01 && (
        <p
          className="border-grade-inaccuracy/40 bg-grade-inaccuracy/10 text-body-sm mt-6 rounded-lg border p-3"
          role="status"
        >
          The Redis counter ({usd(budget.spentUsd)}) and the ai_usage ledger (
          {usd(report.ledgerSpendUsd)}) disagree by {usd(drift)}. Redis is what the breaker reads,
          so it is the one that matters right now — but a persistent gap means writes are failing on
          one side.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-heading-md">By endpoint</h2>
        <table className="mt-3 w-full text-left">
          <thead className="text-text-tertiary text-body-sm">
            <tr>
              <th className="py-2">Endpoint</th>
              <th className="py-2 text-right">Calls</th>
              <th className="py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="text-body-md">
            {report.byEndpoint.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-text-secondary py-3">
                  Nothing yet today.
                </td>
              </tr>
            ) : (
              report.byEndpoint.map((row) => (
                <tr key={row.endpoint} className="border-border border-t">
                  <td className="py-2">{row.endpoint}</td>
                  <td className="py-2 text-right tabular-nums">{row.calls}</td>
                  <td className="py-2 text-right tabular-nums">{usd(row.costUsd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-heading-md">Heaviest users today</h2>
        <p className="text-text-tertiary text-body-sm mt-1">
          Sorted by spend. One user well clear of the rest is the shape abuse takes.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left">
            <thead className="text-text-tertiary text-body-sm">
              <tr>
                <th className="py-2">User</th>
                <th className="py-2 text-right">Calls</th>
                <th className="py-2 text-right">Cached</th>
                <th className="py-2 text-right">Tokens</th>
                <th className="py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="text-body-md">
              {report.topUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-text-secondary py-3">
                    Nothing yet today.
                  </td>
                </tr>
              ) : (
                report.topUsers.map((row) => (
                  <tr key={row.userId} className="border-border border-t">
                    <td className="py-2">{row.email ?? row.userId.slice(0, 8)}</td>
                    <td className="py-2 text-right tabular-nums">{row.calls}</td>
                    <td className="py-2 text-right tabular-nums">{row.cachedCalls}</td>
                    <td className="py-2 text-right tabular-nums">
                      {(row.inputTokens + row.outputTokens).toLocaleString("en-US")}
                    </td>
                    <td className="py-2 text-right tabular-nums">{usd(row.costUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Six decimals, because a single call costs about $0.00009. */
function usd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-text-secondary text-body-md min-w-32">{label}</dt>
      <dd className="text-text-primary text-body-md font-medium">{value}</dd>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-surface-1 rounded-lg border p-3">
      <div className="text-text-tertiary text-body-sm">{label}</div>
      <div className="text-heading-md mt-1 tabular-nums">{value}</div>
    </div>
  );
}
