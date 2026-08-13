"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatUsd } from "@/lib/stripe/plans";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support-mailto";
import type { AccountData } from "@/lib/account-server";

/**
 * The account screen.
 *
 * One page, not a settings tree. At 390px a tabbed settings area is three taps
 * to reach the thing everyone actually came for, which is billing.
 *
 * Everything destructive is at the bottom, in its own visually distinct block,
 * and the cancellation route is a real link rather than a hidden mailto. Making
 * leaving hard does not keep people — it just means they charge it back instead
 * of cancelling, and a chargeback costs the fee plus the dispute.
 */

interface Serialisable extends Omit<AccountData, "billing"> {
  billing: Omit<AccountData["billing"], "currentPeriodEnd"> & { currentPeriodEnd: string | null };
}

export function AccountClient({ account }: { account: AccountData | Serialisable }) {
  const { billing } = account;
  const periodEnd =
    billing.currentPeriodEnd === null ? null : new Date(billing.currentPeriodEnd as string | Date);

  return (
    <div className="mx-auto max-w-lg pb-16">
      <h1 className="text-heading-lg">Account</h1>

      <ProfileSection account={account} />
      <Separator className="my-8" />
      <BillingSection billing={billing} periodEnd={periodEnd} />
      <Separator className="my-8" />
      <PasswordSection />
      <Separator className="my-8" />
      <SupportSection account={account} />
      <Separator className="my-8" />
      <DangerSection account={account} />
    </div>
  );
}

/* ── profile ─────────────────────────────────────────────────────────────── */

function ProfileSection({ account }: { account: AccountData | Serialisable }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [timezone, setTimezone] = useState(
    account.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(account.userId);
      setCopied("done");
    } catch {
      // Clipboard access can be refused outright (an insecure context, or a
      // browser policy). Saying so beats a button that silently does nothing.
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  // The browser's zone, offered when ours differs from it. The daily challenge
  // and the streak both key off the stored value, so a stale one silently costs
  // someone a streak they earned.
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const mismatched = timezone !== detected;

  async function save() {
    setState("saving");
    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() || null, timezone }),
    });
    setState(response.ok ? "saved" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <section className="mt-8" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-heading-md">
        Profile
      </h2>

      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            maxLength={40}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setState("idle");
            }}
            placeholder="What we call you"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={account.email} readOnly disabled className="mt-1.5" />
          <p className="text-text-tertiary text-body-sm mt-1.5">
            Changing your email means changing your login.{" "}
            <a
              href={supportMailto("support", {
                email: account.email,
                userId: account.userId,
                planLabel: account.billing.planLabel,
              })}
              className="text-accent-bright underline"
            >
              Email us
            </a>{" "}
            and we will do it with you.
          </p>
        </div>

        <div>
          <Label htmlFor="user-id">User ID</Label>
          {/* A UUID is 36 unbroken characters — it cannot wrap, so it goes in an
              input that scrolls rather than a text node that would push the page
              sideways at 390px. */}
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="user-id"
              value={account.userId}
              readOnly
              disabled
              className="font-mono"
              data-testid="user-id"
            />
            <Button
              variant="ghost"
              className="shrink-0"
              onClick={() => void copyUserId()}
              data-testid="copy-user-id"
            >
              {copied === "done" ? "Copied" : copied === "failed" ? "Couldn't" : "Copy"}
            </Button>
          </div>
          <p className="text-text-tertiary text-body-sm mt-1.5" role="status">
            {copied === "failed"
              ? "Your browser wouldn't let us copy it — select the field instead."
              : "Quote this if you ever write to support. It identifies your account."}
          </p>
        </div>

        <div>
          <Label htmlFor="timezone">Time zone</Label>
          <Input
            id="timezone"
            value={timezone}
            onChange={(event) => {
              setTimezone(event.target.value);
              setState("idle");
            }}
            className="mt-1.5"
            data-testid="timezone-input"
          />
          <p className="text-text-tertiary text-body-sm mt-1.5">
            Your daily challenge and your streak both reset at midnight here.
          </p>
          {mismatched && (
            <button
              type="button"
              className="text-accent-bright text-body-sm tap-target mt-2 underline"
              onClick={() => {
                setTimezone(detected);
                setState("idle");
              }}
            >
              Use {detected} instead
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
          {state === "saved" && (
            <span className="text-text-secondary text-body-sm" role="status">
              Saved
            </span>
          )}
          {state === "error" && (
            <span className="text-grade-mistake text-body-sm" role="status">
              That didn&apos;t save. Try again?
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── billing ─────────────────────────────────────────────────────────────── */

function BillingSection({
  billing,
  periodEnd,
}: {
  billing: AccountData["billing"] | Serialisable["billing"];
  periodEnd: Date | null;
}) {
  const [opening, setOpening] = useState(false);

  async function openPortal() {
    setOpening(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await response.json()) as { url?: string };
      if (typeof body.url === "string") window.location.href = body.url;
      else setOpening(false);
    } catch {
      setOpening(false);
    }
  }

  const dateLabel =
    periodEnd === null
      ? null
      : periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <section aria-labelledby="billing-heading" data-testid="billing-section">
      <h2 id="billing-heading" className="text-heading-md">
        Billing
      </h2>

      {billing.plan === null ? (
        <div className="mt-4">
          <p className="text-text-secondary text-body-md">You don&apos;t have a subscription.</p>
          <Button variant="accent" className="mt-4" asChild>
            <Link href="/paywall">See plans</Link>
          </Button>
        </div>
      ) : (
        <>
          <dl className="mt-4 space-y-3">
            <Row label="Plan" value={billing.planLabel ?? "—"} />
            <Row
              label="Price"
              value={
                billing.amountCents === null
                  ? "—"
                  : `${formatUsd(billing.amountCents)} ${billing.intervalLabel ?? ""}`.trim()
              }
            />
            <Row
              label={billing.cancelAtPeriodEnd ? "Access ends" : "Next billed"}
              value={dateLabel ?? "—"}
            />
            <Row
              label="Payment method"
              value={
                billing.cardLast4 === null
                  ? "On file with Stripe"
                  : `${billing.cardBrand ?? "Card"} ···· ${billing.cardLast4}`
              }
            />
          </dl>

          {billing.status === "past_due" && (
            <p
              className="border-grade-inaccuracy/40 bg-grade-inaccuracy/10 text-body-sm mt-4 rounded-lg border p-3"
              role="status"
            >
              Your last payment didn&apos;t go through. Update your card and nothing changes — you
              keep your access in the meantime.
            </p>
          )}

          {billing.cancelAtPeriodEnd && (
            <p
              className="border-border bg-surface-2 text-body-sm mt-4 rounded-lg border p-3"
              data-testid="cancelling-notice"
              role="status"
            >
              Your subscription is set to end{dateLabel === null ? "" : ` on ${dateLabel}`}. You
              keep full access until then, and your rating and streak stay put either way.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void openPortal()} disabled={opening || !billing.hasCustomer}>
              {opening ? "Opening…" : "Manage billing"}
            </Button>

            {!billing.cancelAtPeriodEnd && billing.entitled && (
              <Button variant="ghost" asChild>
                <Link href="/account/cancel" data-testid="start-cancel">
                  Cancel subscription
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-secondary text-body-md">{label}</dt>
      <dd className="text-text-primary text-body-md text-right font-medium">{value}</dd>
    </div>
  );
}

/* ── password ────────────────────────────────────────────────────────────── */

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "wrong" | "error">("idle");

  async function change() {
    setState("saving");
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });

    if (response.ok) {
      setState("saved");
      setCurrent("");
      setNext("");
      return;
    }
    setState(response.status === 403 ? "wrong" : "error");
  }

  return (
    <section aria-labelledby="password-heading">
      <h2 id="password-heading" className="text-heading-md">
        Password
      </h2>

      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setState("idle");
            }}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => {
              setNext(event.target.value);
              setState("idle");
            }}
            className="mt-1.5"
          />
          <p className="text-text-tertiary text-body-sm mt-1.5">At least 8 characters.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => void change()}
            disabled={state === "saving" || current === "" || next.length < 8}
          >
            {state === "saving" ? "Changing…" : "Change password"}
          </Button>
          {state === "saved" && (
            <span className="text-text-secondary text-body-sm" role="status">
              Changed
            </span>
          )}
          {state === "wrong" && (
            <span className="text-grade-mistake text-body-sm" role="status">
              That current password isn&apos;t right.
            </span>
          )}
          {state === "error" && (
            <span className="text-grade-mistake text-body-sm" role="status">
              Couldn&apos;t change it. Try again?
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── support ─────────────────────────────────────────────────────────────── */

/**
 * Support sits above the deletion block on purpose: someone frustrated enough
 * to be scrolling this far should reach a person before they reach the button
 * that ends the account.
 */
function SupportSection({ account }: { account: AccountData | Serialisable }) {
  const context = {
    email: account.email,
    userId: account.userId,
    planLabel: account.billing.planLabel,
  };

  return (
    <section aria-labelledby="support-heading" data-testid="support-section">
      <h2 id="support-heading" className="text-heading-md">
        Support
      </h2>

      <p className="text-text-secondary text-body-md mt-3">
        Something broken, a hand graded in a way you don&apos;t agree with, or a feature you wish
        existed — write to us. A person reads every one of these.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <a href={supportMailto("support", context)} data-testid="support-email">
            Email support
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a href={supportMailto("feature", context)} data-testid="support-feature">
            Suggest a feature
          </a>
        </Button>
      </div>

      <p className="text-text-tertiary text-body-sm mt-3">
        Or write to {SUPPORT_EMAIL} directly. Your account details are filled in for us either way.
      </p>
    </section>
  );
}

/* ── deletion ────────────────────────────────────────────────────────────── */

function DangerSection({ account }: { account: AccountData | Serialisable }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "error">("idle");

  async function remove() {
    setState("deleting");
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });

    if (response.ok) {
      router.push("/");
      return;
    }
    setState("error");
  }

  return (
    <section aria-labelledby="danger-heading">
      <h2 id="danger-heading" className="text-heading-md">
        Delete account
      </h2>

      <p className="text-text-secondary text-body-md mt-3">
        This removes your account, your rating, your streak and every hand you have played. Any
        subscription is cancelled at the same time. It cannot be undone.
      </p>

      {!open ? (
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => setOpen(true)}
          data-testid="delete-open"
        >
          Delete my account
        </Button>
      ) : (
        <div className="mt-4">
          <Label htmlFor="delete-confirm">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setState("idle");
            }}
            autoComplete="off"
            className="mt-1.5"
            data-testid="delete-confirm"
          />

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-grade-blunder"
              disabled={typed !== "DELETE" || state === "deleting"}
              onClick={() => void remove()}
              data-testid="delete-submit"
            >
              {state === "deleting" ? "Deleting…" : "Permanently delete"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
          </div>

          {state === "error" && (
            <p className="text-grade-mistake text-body-sm mt-3" role="status">
              We couldn&apos;t delete it — most likely your subscription didn&apos;t cancel cleanly.
              Nothing was removed.{" "}
              <a
                href={supportMailto("support", {
                  email: account.email,
                  userId: account.userId,
                  planLabel: account.billing.planLabel,
                })}
                className="text-accent-bright underline"
              >
                Email us
              </a>{" "}
              and we will sort it out.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
